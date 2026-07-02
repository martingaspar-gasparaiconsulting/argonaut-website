-- ============================================================
-- ARGONAUT OS · BLOCK 10 · V1 DATENMODELL · Verträge & Fristen
-- Idempotent (IF NOT EXISTS / DROP+CREATE). RLS: owner-policy.
-- Platzhalter firma_id/lieferant_id/kunde_id gesetzt, NICHT verbunden
-- (erst im Finale).
-- Ampel-Grundlage: Kündigungsstichtag = ende - kuendigungsfrist_tage.
-- ============================================================

-- ---------- updated_at Trigger-Funktion (Verträge-eigen) ----------
create or replace function vertraege_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Tabelle vertraege ----------
create table if not exists vertraege (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  bezeichnung text not null,
  kategorie text,                 -- Miete/Leasing/Versicherung/Wartung/Abo/Lieferant/Sonstige
  vertragspartner text,           -- andere Vertragspartei
  vertragsnummer text,
  beginn date,
  ende date,                      -- Vertragsende; NULL = unbefristet
  kuendigungsfrist_tage integer not null default 0,   -- Tage vor "ende"
  auto_verlaengerung boolean not null default false,  -- verlängert sich automatisch?
  verlaengerung_monate integer not null default 0,    -- falls auto: um wie viele Monate
  kosten_betrag numeric(12,2) default 0,
  kosten_intervall text not null default 'monatlich', -- monatlich/quartalsweise/jaehrlich/einmalig
  status text not null default 'aktiv',               -- aktiv/gekuendigt/beendet
  notizen text,
  firma_id uuid,                  -- Platzhalter (Finale)
  lieferant_id uuid,              -- Platzhalter (Finale)
  kunde_id uuid,                  -- Platzhalter (Finale)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Platzhalter idempotent nachziehen (falls Tabelle schon existierte)
alter table vertraege add column if not exists firma_id uuid;
alter table vertraege add column if not exists lieferant_id uuid;
alter table vertraege add column if not exists kunde_id uuid;

-- ---------- RLS: owner-policy ----------
alter table vertraege enable row level security;
drop policy if exists vertraege_owner on vertraege;
create policy vertraege_owner on vertraege
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ---------- updated_at Trigger ----------
drop trigger if exists trg_vertraege_updated on vertraege;
create trigger trg_vertraege_updated before update on vertraege
  for each row execute function vertraege_set_updated_at();

-- ---------- Index ----------
create index if not exists idx_vertraege_owner on vertraege(owner_user_id);

-- ============================================================
-- FERTIG · Block 10 V1 Datenmodell
-- ============================================================
