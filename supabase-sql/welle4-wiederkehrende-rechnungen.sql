-- ============================================================
-- ARGONAUT OS · Welle 4 · Schritt 1 — Wiederkehrende Rechnungen (Abos)
-- Vorlage einmal anlegen (Empfänger, Positionen, Intervall) -> daraus wird
-- per Klick oder wenn fällig die nächste echte Rechnung erzeugt.
-- Idempotent; RLS nach dem Tenant-Muster (Inhaber + Mitarbeiter des Inhabers).
-- ============================================================

create table if not exists abo_rechnungen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id uuid,
  empfaenger_name text,
  titel text not null default 'Wiederkehrende Rechnung',
  positionen jsonb not null default '[]'::jsonb,   -- [{bezeichnung,menge,einheit,einzelpreis,mwst_satz}]
  intervall text not null default 'monat',          -- 'monat' | 'quartal' | 'jahr'
  naechste_faellig date not null,
  aktiv boolean not null default true,
  zuletzt_erzeugt date,
  anzahl_erzeugt integer not null default 0,
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_abo_faellig on abo_rechnungen (owner_user_id, naechste_faellig) where aktiv = true;

alter table abo_rechnungen enable row level security;

drop policy if exists owner_all on abo_rechnungen;
create policy owner_all on abo_rechnungen for all
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on abo_rechnungen;
create policy select_ma on abo_rechnungen for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on abo_rechnungen;
create policy insert_ma on abo_rechnungen for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on abo_rechnungen;
create policy update_ma on abo_rechnungen for update
  using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
