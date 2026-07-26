-- ============================================================
-- ARGONAUT OS · Compliance · DSGVO-Center
-- Zwei Pflicht-Bausteine der DSGVO fuer den Mittelstand:
--   1) dsgvo_verfahren  = Verzeichnis von Verarbeitungstaetigkeiten (Art. 30)
--   2) dsgvo_anfragen   = Betroffenenanfragen / DSAR mit 1-Monats-Frist (Art. 12)
-- Idempotent; RLS strikt nach Tenant-Muster (owner_user_id + mein_chef_id()).
-- ============================================================

-- ---- 1) Verzeichnis von Verarbeitungstaetigkeiten (VVT, Art. 30 DSGVO) ----
create table if not exists dsgvo_verfahren (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name text not null,                         -- z. B. "Lohnabrechnung", "Kundenverwaltung"
  zweck text,                                 -- Zweck der Verarbeitung
  rechtsgrundlage text,                       -- z. B. Art. 6 Abs. 1 lit. b (Vertrag)
  kategorien_betroffene text,                 -- Kunden, Mitarbeiter, Bewerber ...
  kategorien_daten text,                      -- Name, Adresse, Bankdaten ...
  empfaenger text,                            -- Steuerberater, Hoster, Finanzamt ...
  drittland text,                             -- falls Uebermittlung ausserhalb EU
  loeschfrist text,                           -- z. B. "10 Jahre" / "Vertragsende + 3 J."
  tom text,                                   -- technisch-organisatorische Massnahmen
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dsgvo_verfahren_owner on dsgvo_verfahren (owner_user_id, name);

alter table dsgvo_verfahren enable row level security;
drop policy if exists owner_all on dsgvo_verfahren;
create policy owner_all on dsgvo_verfahren for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on dsgvo_verfahren;
create policy select_ma on dsgvo_verfahren for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on dsgvo_verfahren;
create policy insert_ma on dsgvo_verfahren for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on dsgvo_verfahren;
create policy update_ma on dsgvo_verfahren for update using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---- 2) Betroffenenanfragen (DSAR, Art. 12-22 DSGVO) ----
-- Frist: unverzueglich, spaetestens 1 Monat ab Eingang (Art. 12 Abs. 3).
create table if not exists dsgvo_anfragen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  betroffener_name text,
  betroffener_email text,
  art text not null default 'auskunft',       -- auskunft|loeschung|berichtigung|einschraenkung|widerspruch|datenuebertragung
  eingegangen_am date not null default current_date,
  frist date,                                   -- default: eingegangen_am + 1 Monat (App setzt sie)
  status text not null default 'offen',         -- offen|in_bearbeitung|erledigt|abgelehnt
  erledigt_am date,
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dsgvo_anfragen_owner on dsgvo_anfragen (owner_user_id, frist);

alter table dsgvo_anfragen enable row level security;
drop policy if exists owner_all on dsgvo_anfragen;
create policy owner_all on dsgvo_anfragen for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on dsgvo_anfragen;
create policy select_ma on dsgvo_anfragen for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on dsgvo_anfragen;
create policy insert_ma on dsgvo_anfragen for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on dsgvo_anfragen;
create policy update_ma on dsgvo_anfragen for update using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
