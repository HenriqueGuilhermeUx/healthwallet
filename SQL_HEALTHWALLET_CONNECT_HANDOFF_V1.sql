-- HealthWallet Connect — secure one-time session handoff
-- Apply in the SAME Supabase project used by HealthWallet and HealthWallet Connect.
-- This table is intentionally NOT exposed to anon/authenticated clients.
-- Only the healthwallet-connect-handoff Edge Function (service_role) should access it.

create extension if not exists pgcrypto;

create table if not exists public.health_connect_handoffs (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile text not null default 'minimal' check (profile in ('minimal', 'full')),
  metrics text[] not null default array['steps']::text[],
  days smallint not null default 30 check (days between 1 and 90),
  return_to text,
  state text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  constraint health_connect_handoff_expiry_after_creation check (expires_at > created_at)
);

create index if not exists health_connect_handoffs_user_id_idx
  on public.health_connect_handoffs (user_id, created_at desc);

create index if not exists health_connect_handoffs_expires_at_idx
  on public.health_connect_handoffs (expires_at)
  where redeemed_at is null;

alter table public.health_connect_handoffs enable row level security;

-- Explicitly keep the handoff store out of the browser Data API roles.
revoke all on table public.health_connect_handoffs from anon, authenticated;
grant select, insert, update, delete on table public.health_connect_handoffs to service_role;

comment on table public.health_connect_handoffs is
  'Short-lived, single-use HealthWallet -> HealthWallet Connect authentication handoffs. Access only through the trusted Edge Function.';

comment on column public.health_connect_handoffs.code_hash is
  'SHA-256 of the random handoff code. The raw code is never stored.';
