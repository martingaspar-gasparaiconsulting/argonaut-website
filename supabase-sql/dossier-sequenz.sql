-- ============================================================================
-- ARGONAUT OS · Test-Nachfass-Strecke (7 Tage) — Felder auf dossier_leads
-- Additiv & idempotent. „Success. No rows returned" = passt.
-- ============================================================================
alter table dossier_leads add column if not exists seq_status       text default 'aktiv';
alter table dossier_leads add column if not exists seq_schritt       integer default 0;
alter table dossier_leads add column if not exists seq_naechster_am  timestamptz;
alter table dossier_leads add column if not exists seq_quelle        text;
alter table dossier_leads add column if not exists abmelde_token     text;

-- Beschleunigt den Tages-Cron (nur fällige Test-Läufe).
create index if not exists dossier_leads_seq_faellig_idx
  on dossier_leads (seq_status, seq_naechster_am)
  where seq_quelle = 'test';
