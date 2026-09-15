-- =====================================================
-- HEALTH CONCIERGE - LONGITUDINAL ALERT ENGINE V1
-- Run AFTER the Concierge base + analytics + automation guard migrations.
-- Validation environment first. This is workflow intelligence, not diagnosis.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.concierge_rules (
  key TEXT PRIMARY KEY,
  numeric_value NUMERIC,
  text_value TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.concierge_rules (key, numeric_value, description)
VALUES
  ('medscore_review_delta', 10, 'Create a human-review signal when MedScore falls by at least this many points between consecutive calculations.'),
  ('new_request_sla_hours', 12, 'Create an operational attention signal when a new request has no first response after this many hours.'),
  ('waiting_patient_followup_hours', 72, 'Create a follow-up signal when a case has been waiting for the patient for this many hours.'),
  ('stale_device_days', 7, 'Create a data-continuity signal when an enrolled patient device has not synced for this many days.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.concierge_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_rules_staff_read ON public.concierge_rules;
CREATE POLICY concierge_rules_staff_read ON public.concierge_rules
  FOR SELECT TO authenticated
  USING (public.concierge_is_staff());

DROP POLICY IF EXISTS concierge_rules_admin_manage ON public.concierge_rules;
CREATE POLICY concierge_rules_admin_manage ON public.concierge_rules
  FOR ALL TO authenticated
  USING (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]))
  WITH CHECK (public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]));

CREATE UNIQUE INDEX IF NOT EXISTS idx_concierge_alert_open_source_unique
ON public.concierge_alerts(patient_id, source, source_id)
WHERE status = 'open' AND source_id IS NOT NULL;

-- -----------------------------------------------------
-- New HealthWallet exam -> review signal for active Concierge member.
-- It does not interpret the exam.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.concierge_on_new_medical_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.concierge_memberships m
    WHERE m.patient_id = NEW.user_id
      AND m.status IN ('pilot','active')
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.concierge_alerts a
      WHERE a.patient_id = NEW.user_id
        AND a.source = 'exam'
        AND a.source_id = NEW.id::text
        AND a.status = 'open'
    ) THEN
      INSERT INTO public.concierge_alerts (
        patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
      ) VALUES (
        NEW.user_id,
        'exam',
        NEW.id::text,
        'info',
        'Novo exame ou documento recebido',
        'O HealthWallet recebeu um novo registro. O alerta indica apenas que há material novo para coordenação; não interpreta o resultado.',
        'Revisar se o documento exige algum próximo passo, retorno ou ação no plano do paciente.',
        jsonb_build_object('record_id', NEW.id, 'generated_by', 'concierge_alert_engine')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.medical_records') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_concierge_new_medical_record ON public.medical_records;
    CREATE TRIGGER trg_concierge_new_medical_record
    AFTER INSERT ON public.medical_records
    FOR EACH ROW EXECUTE FUNCTION public.concierge_on_new_medical_record();
  END IF;
END $$;

-- -----------------------------------------------------
-- MedScore material change -> human review signal.
-- No diagnosis, no automated treatment recommendation.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.concierge_on_health_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_score NUMERIC;
  threshold_value NUMERIC := 10;
  score_delta NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.concierge_memberships m
    WHERE m.patient_id = NEW.user_id
      AND m.status IN ('pilot','active')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT numeric_value INTO threshold_value
  FROM public.concierge_rules
  WHERE key = 'medscore_review_delta' AND enabled = true;

  threshold_value := COALESCE(threshold_value, 10);

  SELECT h.score
  INTO previous_score
  FROM public.health_scores h
  WHERE h.user_id = NEW.user_id
    AND h.id <> NEW.id
    AND h.calculated_at < COALESCE(NEW.calculated_at, NOW())
  ORDER BY h.calculated_at DESC
  LIMIT 1;

  IF previous_score IS NULL THEN
    RETURN NEW;
  END IF;

  score_delta := NEW.score - previous_score;

  IF score_delta <= (threshold_value * -1) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.concierge_alerts a
      WHERE a.patient_id = NEW.user_id
        AND a.source = 'medscore'
        AND a.source_id = NEW.id::text
        AND a.status = 'open'
    ) THEN
      INSERT INTO public.concierge_alerts (
        patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
      ) VALUES (
        NEW.user_id,
        'medscore',
        NEW.id::text,
        'attention',
        'Mudança relevante no MedScore para revisão',
        format('O MedScore mudou de %s para %s. Este é um sinal de workflow para revisão humana, não um diagnóstico.', previous_score, NEW.score),
        'Revisar quais fatores mudaram e decidir se existe algum próximo passo de coordenação.',
        jsonb_build_object(
          'previous_score', previous_score,
          'current_score', NEW.score,
          'delta', score_delta,
          'threshold', threshold_value,
          'generated_by', 'concierge_alert_engine'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.health_scores') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_concierge_health_score ON public.health_scores;
    CREATE TRIGGER trg_concierge_health_score
    AFTER INSERT ON public.health_scores
    FOR EACH ROW EXECUTE FUNCTION public.concierge_on_health_score();
  END IF;
END $$;

-- -----------------------------------------------------
-- Time-based operational signals.
-- Call from coordinator dashboard, scheduled backend, or cron later.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.concierge_refresh_time_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
  threshold_hours NUMERIC;
  wait_hours NUMERIC;
  device_days NUMERIC;
BEGIN
  IF NOT public.concierge_has_staff_role(ARRAY['admin','care_coordinator']::TEXT[]) THEN
    RAISE EXCEPTION 'Concierge coordinator role required';
  END IF;

  -- Overdue action alerts.
  INSERT INTO public.concierge_alerts (
    patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
  )
  SELECT
    a.patient_id,
    'action',
    a.id::text,
    CASE WHEN a.due_date < CURRENT_DATE - 7 THEN 'attention' ELSE 'info' END,
    'Ação do plano está vencida',
    format('A ação "%s" tinha prazo em %s e continua pendente.', a.title, a.due_date),
    'Revisar com o paciente se a ação foi realizada, precisa de ajuda ou deve ser reagendada.',
    jsonb_build_object('due_date', a.due_date, 'generated_by', 'concierge_alert_engine')
  FROM public.concierge_actions a
  JOIN public.concierge_memberships m ON m.patient_id = a.patient_id AND m.status IN ('pilot','active')
  WHERE a.status IN ('pending','in_progress')
    AND a.due_date IS NOT NULL
    AND a.due_date < CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM public.concierge_alerts x
      WHERE x.patient_id = a.patient_id
        AND x.source = 'action'
        AND x.source_id = a.id::text
        AND x.status = 'open'
    );
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  -- Resolve action alerts automatically when action is no longer overdue.
  UPDATE public.concierge_alerts x
  SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
  WHERE x.source = 'action'
    AND x.status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.concierge_actions a
      WHERE a.id::text = x.source_id
        AND (a.status IN ('completed','cancelled') OR a.due_date >= CURRENT_DATE)
    );

  -- New request without first human response.
  SELECT COALESCE(numeric_value, 12) INTO threshold_hours
  FROM public.concierge_rules
  WHERE key = 'new_request_sla_hours' AND enabled = true;
  threshold_hours := COALESCE(threshold_hours, 12);

  INSERT INTO public.concierge_alerts (
    patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
  )
  SELECT
    r.patient_id,
    'system',
    'request-sla:' || r.id::text,
    'attention',
    'Solicitação aguardando primeira resposta',
    format('Uma solicitação está sem primeira resposta há mais de %s horas.', threshold_hours),
    'Abrir o caso e iniciar a triagem.',
    jsonb_build_object('request_id', r.id, 'generated_by', 'concierge_alert_engine')
  FROM public.concierge_requests r
  WHERE r.status = 'new'
    AND r.first_response_at IS NULL
    AND r.created_at < NOW() - make_interval(hours => threshold_hours::integer)
    AND NOT EXISTS (
      SELECT 1 FROM public.concierge_alerts x
      WHERE x.patient_id = r.patient_id
        AND x.source = 'system'
        AND x.source_id = 'request-sla:' || r.id::text
        AND x.status = 'open'
    );

  -- Waiting-patient follow-up.
  SELECT COALESCE(numeric_value, 72) INTO wait_hours
  FROM public.concierge_rules
  WHERE key = 'waiting_patient_followup_hours' AND enabled = true;
  wait_hours := COALESCE(wait_hours, 72);

  INSERT INTO public.concierge_alerts (
    patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
  )
  SELECT
    r.patient_id,
    'system',
    'waiting-patient:' || r.id::text,
    'info',
    'Caso aguardando retorno do paciente',
    format('O caso está aguardando informação do paciente há mais de %s horas.', wait_hours),
    'Fazer um follow-up simples e manter o caso coordenado.',
    jsonb_build_object('request_id', r.id, 'generated_by', 'concierge_alert_engine')
  FROM public.concierge_requests r
  WHERE r.status = 'waiting_patient'
    AND r.updated_at < NOW() - make_interval(hours => wait_hours::integer)
    AND NOT EXISTS (
      SELECT 1 FROM public.concierge_alerts x
      WHERE x.patient_id = r.patient_id
        AND x.source = 'system'
        AND x.source_id = 'waiting-patient:' || r.id::text
        AND x.status = 'open'
    );

  -- Device continuity. No clinical inference: only says the data stream is stale.
  IF to_regclass('public.health_device_connections') IS NOT NULL THEN
    SELECT COALESCE(numeric_value, 7) INTO device_days
    FROM public.concierge_rules
    WHERE key = 'stale_device_days' AND enabled = true;
    device_days := COALESCE(device_days, 7);

    INSERT INTO public.concierge_alerts (
      patient_id, source, source_id, severity, title, explanation, suggested_action, metadata
    )
    SELECT
      d.user_id,
      'wearable',
      'device-stale:' || d.user_id::text,
      'info',
      'Dados de dispositivo sem atualização recente',
      format('A conexão de dados não registra sincronização recente há mais de %s dias.', device_days),
      'Confirmar se o paciente ainda deseja usar a integração e orientar nova sincronização quando necessário.',
      jsonb_build_object('provider', d.provider, 'last_synced_at', d.last_synced_at, 'generated_by', 'concierge_alert_engine')
    FROM public.health_device_connections d
    JOIN public.concierge_memberships m ON m.patient_id = d.user_id AND m.status IN ('pilot','active')
    WHERE d.status = 'connected'
      AND COALESCE(d.last_synced_at, d.updated_at) < NOW() - make_interval(days => device_days::integer)
      AND NOT EXISTS (
        SELECT 1 FROM public.concierge_alerts x
        WHERE x.patient_id = d.user_id
          AND x.source = 'wearable'
          AND x.source_id = 'device-stale:' || d.user_id::text
          AND x.status = 'open'
      );
  END IF;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.concierge_refresh_time_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concierge_refresh_time_alerts() TO authenticated;

-- IMPORTANT:
-- This function intentionally is NOT scheduled here. Scheduling is an operational
-- decision for staging/production after validation. It can later run hourly/daily
-- through a trusted backend/cron without changing patient-facing code.
