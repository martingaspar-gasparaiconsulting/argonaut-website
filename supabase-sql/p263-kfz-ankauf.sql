-- ============================================================
-- ARGONAUT OS · Paket 263 (07.10.2026) · K4 Ankauf und Bewertung (Teil 1)
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) kfz_ankauf  Ankaufsvorgang: Verkäufer, Fahrzeug, Prüfprotokoll (jsonb),
--                 Schäden (jsonb, Fotos im Speicherordner „fahrzeug-medien"
--                 unter <Betrieb>/ankauf/…), Bewertung, Angebot, Ankaufspreis,
--                 Verknüpfung zum Bestandsfahrzeug nach dem Ankauf
-- Keine Ausweisnummern: nur ein Haken „Ausweis geprüft" (Identifizierung nach
-- GwG läuft über /dashboard/kfz/gwg).
-- Rechte wie Paket 181: Besitzer = Betrieb (Auslöser p181_besitzer),
-- Mitarbeiter lesen mit Modul „kfz", schreiben mit Schreibrecht „kfz",
-- löschen nur der Chef. Fotos nutzen die Speicher-Regeln aus Paket 262.
-- ============================================================

create table if not exists public.kfz_ankauf (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null,
  nr                text,
  status            text not null default 'offen' check (status in ('offen', 'angeboten', 'angekauft', 'abgelehnt')),
  quelle            text not null default 'hof' check (quelle in ('hof', 'inzahlungnahme', 'telefon', 'online')),
  -- Verkäufer
  verkaeufer_art    text not null default 'privat' check (verkaeufer_art in ('privat', 'gewerblich', 'gewerblich_25a')),
  verkaeufer_name   text check (verkaeufer_name is null or char_length(verkaeufer_name) <= 120),
  verkaeufer_firma  text check (verkaeufer_firma is null or char_length(verkaeufer_firma) <= 120),
  verkaeufer_anschrift text check (verkaeufer_anschrift is null or char_length(verkaeufer_anschrift) <= 300),
  verkaeufer_tel    text check (verkaeufer_tel is null or char_length(verkaeufer_tel) <= 40),
  verkaeufer_email  text check (verkaeufer_email is null or char_length(verkaeufer_email) <= 160),
  ausweis_geprueft  boolean not null default false,
  -- Fahrzeug
  marke             text,
  modell            text,
  variante          text,
  fin               text check (fin is null or fin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  kennzeichen       text,
  erstzulassung     date,
  km_stand          integer check (km_stand is null or km_stand >= 0),
  leistung_kw       integer check (leistung_kw is null or leistung_kw >= 0),
  kraftstoff        text,
  farbe             text,
  vorbesitzer       integer check (vorbesitzer is null or vorbesitzer >= 0),
  hu_bis            date,
  schluessel        integer check (schluessel is null or schluessel >= 0),
  serviceheft       text check (serviceheft is null or serviceheft in ('lueckenlos', 'teilweise', 'keins', 'unbekannt')),
  unfall_angabe     text check (unfall_angabe is null or unfall_angabe in ('keine_bekannt', 'ja', 'unbekannt')),
  unfall_text       text,
  -- Prüfung und Schäden
  pruefung          jsonb not null default '{}'::jsonb,
  schaeden          jsonb not null default '[]'::jsonb check (jsonb_typeof(schaeden) = 'array'),
  -- Bewertung (netto, außer Verkaufspreis brutto)
  ziel_vk           numeric(12,2) check (ziel_vk is null or ziel_vk >= 0),
  aufbereitung      numeric(12,2) check (aufbereitung is null or aufbereitung >= 0),
  sonstige_kosten   numeric(12,2) check (sonstige_kosten is null or sonstige_kosten >= 0),
  standtage_plan    integer check (standtage_plan is null or standtage_plan >= 0),
  marge             numeric(12,2) check (marge is null or marge >= 0),
  angebot           numeric(12,2) check (angebot is null or angebot >= 0),
  ankaufpreis       numeric(12,2) check (ankaufpreis is null or ankaufpreis >= 0),
  angekauft_am      date,
  bestand_id        uuid references public.kfz_bestand(id) on delete set null,
  notiz             text,
  bewertet_von      uuid default auth.uid(),
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now()
);
create index if not exists kfz_ankauf_owner_idx on public.kfz_ankauf (owner_user_id, status, erstellt_am);
create unique index if not exists kfz_ankauf_nr_uq on public.kfz_ankauf (owner_user_id, nr) where nr is not null;

alter table public.kfz_ankauf enable row level security;

drop trigger if exists p181_besitzer on public.kfz_ankauf;
create trigger p181_besitzer before insert or update on public.kfz_ankauf
  for each row execute function public.p181_besitzer();

drop policy if exists kfza_owner_all on public.kfz_ankauf;
create policy kfza_owner_all on public.kfz_ankauf for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_ankauf;
create policy p181_ma_select on public.kfz_ankauf for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_ankauf;
create policy p181_ma_insert on public.kfz_ankauf for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_ankauf;
create policy p181_ma_update on public.kfz_ankauf for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- KONTROLLE — Erwartung: tabelle = 1, regeln = 4, ausloeser = 1, rls_an = true, spalten = 43
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'kfz_ankauf') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_ankauf') as regeln,
  (select count(*) from pg_trigger where tgrelid = 'public.kfz_ankauf'::regclass and not tgisinternal) as ausloeser,
  (select relrowsecurity from pg_class where relname = 'kfz_ankauf') as rls_an,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'kfz_ankauf') as spalten;
