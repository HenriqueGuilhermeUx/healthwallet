-- ============================================================
-- HEALTHWALLET / MYDATAMED
-- PRIVATE EXAMS STORAGE V1
-- Migrates the exams bucket from public URLs to authenticated
-- owner-folder access + signed URLs.
-- ============================================================

BEGIN;

-- 1) Preconditions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'exams'
  ) THEN
    RAISE EXCEPTION 'Bucket exams not found';
  END IF;

  IF to_regclass('public.medical_records') IS NULL THEN
    RAISE EXCEPTION 'medical_records table not found';
  END IF;
END $$;

-- 2) Persist storage coordinates separately from transport URLs.
ALTER TABLE public.medical_records
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_medical_records_storage_path
  ON public.medical_records(storage_bucket, storage_path)
  WHERE storage_path IS NOT NULL;

-- 3) Backfill legacy public exam URLs.
UPDATE public.medical_records
SET
  storage_bucket = 'exams',
  storage_path = split_part(
    file_url,
    '/storage/v1/object/public/exams/',
    2
  )
WHERE
  file_url IS NOT NULL
  AND file_url LIKE '%/storage/v1/object/public/exams/%'
  AND (
    storage_path IS NULL
    OR storage_path = ''
  );

-- Remove stale public transport URLs after the canonical object path exists.
UPDATE public.medical_records
SET file_url = NULL
WHERE
  storage_bucket = 'exams'
  AND storage_path IS NOT NULL
  AND storage_path <> ''
  AND file_url LIKE '%/storage/v1/object/public/exams/%';

-- 4) Make bucket private.
UPDATE storage.buckets
SET public = false
WHERE id = 'exams';

-- 5) Remove every legacy exams policy from storage.objects.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        policyname ILIKE '%exam%'
        OR COALESCE(qual, '') ILIKE '%exams%'
        OR COALESCE(with_check, '') ILIKE '%exams%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      pol.policyname
    );
  END LOOP;
END $$;

-- 6) Owner-folder storage policies.
-- All HealthWallet uploads use: <auth.uid()>/...
CREATE POLICY exams_owner_select_v1
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'exams'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY exams_owner_insert_v1
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exams'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY exams_owner_update_v1
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'exams'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'exams'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY exams_owner_delete_v1
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'exams'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- 7) Verification before commit.
DO $$
DECLARE
  bucket_public BOOLEAN;
  legacy_public_urls INTEGER;
  policy_count INTEGER;
BEGIN
  SELECT public
  INTO bucket_public
  FROM storage.buckets
  WHERE id = 'exams';

  IF bucket_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'exams bucket is still public';
  END IF;

  SELECT count(*)
  INTO legacy_public_urls
  FROM public.medical_records
  WHERE file_url LIKE '%/storage/v1/object/public/exams/%';

  IF legacy_public_urls > 0 THEN
    RAISE EXCEPTION
      'Found % legacy public exam URLs after migration',
      legacy_public_urls;
  END IF;

  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'exams_owner_select_v1',
      'exams_owner_insert_v1',
      'exams_owner_update_v1',
      'exams_owner_delete_v1'
    );

  IF policy_count <> 4 THEN
    RAISE EXCEPTION
      'Expected 4 exams storage policies, found %',
      policy_count;
  END IF;
END $$;

COMMIT;

SELECT
  'PASS' AS private_exams_storage_v1,
  (
    SELECT public
    FROM storage.buckets
    WHERE id = 'exams'
  ) AS bucket_public,
  (
    SELECT count(*)
    FROM public.medical_records
    WHERE storage_bucket = 'exams'
      AND storage_path IS NOT NULL
  ) AS private_exam_records,
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE 'exams_owner_%'
  ) AS owner_policies,
  NOW() AS checked_at;
