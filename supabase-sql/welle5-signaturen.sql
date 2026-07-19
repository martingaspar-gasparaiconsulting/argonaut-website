-- ============================================================
-- ARGONAUT OS · Welle 5 · Schritt 1 — ARGONAUT-Sign (E-Signatur)
-- Dokument zur Unterschrift versenden -> Empfänger signiert per Token-Link
-- (ohne Login) -> signiertes PDF mit Prüfprotokoll + Dokument-Hash.
-- Einfache/fortgeschrittene Signatur, komplett selbst gebaut.
-- Idempotent; RLS nach Tenant-Muster. Der öffentliche Unterschriftszugang
-- läuft über eine Service-Role-Route (kein Public-Policy nötig).
-- ============================================================

create table if not exists signatur_anfragen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  token text not null unique,
  titel text not null default 'Dokument zur Unterschrift',
  kontakt_id uuid,
  empfaenger_name text,
  empfaenger_email text,
  dokument text not null default '',              -- Dokumenttext (Zeilen bleiben erhalten)
  ort text,
  status text not null default 'gesendet',        -- entwurf|gesendet|angesehen|signiert|abgelehnt
  unterzeichner_name text,
  signatur_bild text,                             -- data:image/png;base64,... (gezeichnete Unterschrift)
  dokument_hash text,                             -- SHA-256 (Manipulationsschutz)
  angesehen_am timestamptz,
  signiert_am timestamptz,
  protokoll jsonb not null default '[]'::jsonb,   -- Audit-Ereignisse (erstellt/angesehen/signiert + IP/Gerät)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_signatur_owner on signatur_anfragen (owner_user_id, created_at desc);
create unique index if not exists uq_signatur_token on signatur_anfragen (token);

alter table signatur_anfragen enable row level security;

drop policy if exists owner_all on signatur_anfragen;
create policy owner_all on signatur_anfragen for all
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on signatur_anfragen;
create policy select_ma on signatur_anfragen for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on signatur_anfragen;
create policy insert_ma on signatur_anfragen for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on signatur_anfragen;
create policy update_ma on signatur_anfragen for update
  using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
