-- ============================================================
-- ARGONAUT OS · Beleg-Inbox / Eingangsrechnungen (OCR)
-- Foto/PDF eines Belegs -> KI liest Lieferant, Datum, Betrag, USt -> hier
-- gespeichert (GoBD-tauglich, für Vorsteuer & DATEV). Idempotent; RLS.
-- ============================================================

create table if not exists eingangsbelege (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  lieferant text,
  belegnummer text,
  belegdatum date,
  netto numeric(12,2),
  ust_betrag numeric(12,2),
  ust_satz numeric(5,2),
  brutto numeric(12,2),
  kategorie text,
  notiz text,
  datei_pfad text,
  status text not null default 'erfasst',   -- erfasst | geprueft | gebucht
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_eingangsbelege_owner on eingangsbelege (owner_user_id, belegdatum desc);

alter table eingangsbelege enable row level security;

drop policy if exists owner_all on eingangsbelege;
create policy owner_all on eingangsbelege for all
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on eingangsbelege;
create policy select_ma on eingangsbelege for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on eingangsbelege;
create policy insert_ma on eingangsbelege for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on eingangsbelege;
create policy update_ma on eingangsbelege for update
  using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
