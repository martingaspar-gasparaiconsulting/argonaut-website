-- ============================================================
-- ARGONAUT OS · Paket 270 (08.10.2026) · K9 Probefahrt und Vorführwagen
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) kfz_rote_kennzeichen  rote Dauerkennzeichen (06er) und Kurzzeitkennzeichen
--                           des Betriebs mit Gültigkeit. Schreiben nur die
--                           Geschäftsleitung, lesen alle mit Recht „KFZ".
--  2) kfz_probefahrt        Fahrten mit Bestandsfahrzeugen: Probefahrt,
--                           Vorführwagen, Ersatzwagen, Überführung. Fahrer,
--                           Führerschein-Prüfung (NUR Haken, Klasse und
--                           Gültigkeit — keine Nummer, kein Foto), Kennzeichen,
--                           Start/Rückgabe mit km, Tank und Schäden,
--                           Unterschrift über ARGONAUT-Sign, Nachfass.
--  Schutz: je Fahrzeug höchstens EINE laufende Fahrt, und ein rotes bzw.
--  Kurzzeitkennzeichen hängt nie an zwei laufenden Fahrten gleichzeitig.
-- Rechte wie Paket 181/266: Besitzer = Betrieb (Auslöser p181_besitzer),
-- Mitarbeiter lesen mit Modul „kfz", schreiben mit Schreibrecht „kfz",
-- löschen nur der Chef.
-- ============================================================

-- 1) Rote und Kurzzeitkennzeichen -----------------------------------------------
create table if not exists public.kfz_rote_kennzeichen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kennzeichen   text not null check (char_length(kennzeichen) between 2 and 20),
  art           text not null default 'rot' check (art in ('rot', 'kurzzeit')),
  gueltig_bis   date,
  aktiv         boolean not null default true,
  notiz         text check (notiz is null or char_length(notiz) <= 300),
  erstellt_am   timestamptz not null default now()
);
create unique index if not exists kfz_rote_kz_uq on public.kfz_rote_kennzeichen (owner_user_id, upper(kennzeichen));

alter table public.kfz_rote_kennzeichen enable row level security;

drop policy if exists kfzrk_owner_all on public.kfz_rote_kennzeichen;
create policy kfzrk_owner_all on public.kfz_rote_kennzeichen for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_rote_kennzeichen;
create policy p181_ma_select on public.kfz_rote_kennzeichen for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));

-- 2) Fahrten -----------------------------------------------------------------------
create table if not exists public.kfz_probefahrt (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  bestand_id      uuid not null references public.kfz_bestand(id) on delete cascade,
  nr              text,
  art             text not null default 'probefahrt' check (art in ('probefahrt', 'vorfuehrwagen', 'ersatzwagen', 'ueberfuehrung')),
  status          text not null default 'geplant' check (status in ('geplant', 'unterwegs', 'zurueck', 'storniert')),
  -- Fahrer (Kunde oder eigener Mitarbeiter)
  fahrer_name     text check (fahrer_name is null or char_length(fahrer_name) <= 120),
  fahrer_anschrift text check (fahrer_anschrift is null or char_length(fahrer_anschrift) <= 300),
  fahrer_tel      text check (fahrer_tel is null or char_length(fahrer_tel) <= 40),
  fahrer_email    text check (fahrer_email is null or char_length(fahrer_email) <= 160),
  kontakt_id      uuid,
  -- Führerschein: nur Prüfvermerk, keine Nummer
  fs_geprueft     boolean not null default false,
  fs_klasse       text check (fs_klasse is null or char_length(fs_klasse) <= 20),
  fs_gueltig_bis  date,
  begleitet       boolean not null default false,
  -- Kennzeichen
  kennzeichen_art text not null default 'eigen' check (kennzeichen_art in ('eigen', 'rot', 'kurzzeit')),
  kennzeichen     text check (kennzeichen is null or char_length(kennzeichen) <= 20),
  -- Zeit
  start_am        timestamptz,
  ende_geplant    timestamptz,
  rueck_am        timestamptz,
  -- Zustand
  km_start        integer check (km_start is null or km_start >= 0),
  km_ende         integer check (km_ende is null or km_ende >= 0),
  km_frei         integer check (km_frei is null or km_frei >= 0),
  tank_start      text check (tank_start is null or tank_start in ('leer', '1/4', '1/2', '3/4', 'voll')),
  tank_ende       text check (tank_ende is null or tank_ende in ('leer', '1/4', '1/2', '3/4', 'voll')),
  schaeden_start  text check (schaeden_start is null or char_length(schaeden_start) <= 1000),
  schaeden_ende   text check (schaeden_ende is null or char_length(schaeden_ende) <= 1000),
  selbstbeteiligung numeric(12,2) check (selbstbeteiligung is null or selbstbeteiligung >= 0),
  -- Nachfass
  nachfass_am     date,
  nachfass_erledigt boolean not null default false,
  ergebnis        text check (ergebnis is null or ergebnis in ('offen', 'interesse', 'kauf', 'kein_interesse')),
  notiz           text check (notiz is null or char_length(notiz) <= 2000),
  signaturen      jsonb not null default '{}'::jsonb check (jsonb_typeof(signaturen) = 'object'),
  erstellt_von    uuid default auth.uid(),
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint kfz_probefahrt_km_check check (km_ende is null or km_start is null or km_ende >= km_start)
);

create index if not exists kfz_probefahrt_owner_idx on public.kfz_probefahrt (owner_user_id, status, start_am);
create unique index if not exists kfz_probefahrt_nr_uq on public.kfz_probefahrt (owner_user_id, nr) where nr is not null;
-- je Fahrzeug höchstens eine laufende Fahrt
create unique index if not exists kfz_probefahrt_ein_laufender_uq on public.kfz_probefahrt (bestand_id) where status = 'unterwegs';
-- ein rotes/Kurzzeitkennzeichen nie an zwei laufenden Fahrten
create unique index if not exists kfz_probefahrt_kz_laufend_uq on public.kfz_probefahrt (owner_user_id, upper(kennzeichen))
  where status = 'unterwegs' and kennzeichen_art <> 'eigen' and kennzeichen is not null;

alter table public.kfz_probefahrt enable row level security;

drop trigger if exists p181_besitzer on public.kfz_probefahrt;
create trigger p181_besitzer before insert or update on public.kfz_probefahrt
  for each row execute function public.p181_besitzer();

drop policy if exists kfzpf_owner_all on public.kfz_probefahrt;
create policy kfzpf_owner_all on public.kfz_probefahrt for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_probefahrt;
create policy p181_ma_select on public.kfz_probefahrt for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_probefahrt;
create policy p181_ma_insert on public.kfz_probefahrt for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_probefahrt;
create policy p181_ma_update on public.kfz_probefahrt for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- KONTROLLE — Erwartung: tabellen = 2, regeln = 6, ausloeser = 1, rls_an = 2, indizes = 7
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('kfz_probefahrt', 'kfz_rote_kennzeichen')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('kfz_probefahrt', 'kfz_rote_kennzeichen')) as regeln,
  (select count(*) from pg_trigger where tgrelid = 'public.kfz_probefahrt'::regclass and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where oid in ('public.kfz_probefahrt'::regclass, 'public.kfz_rote_kennzeichen'::regclass) and relrowsecurity) as rls_an,
  (select count(*) from pg_indexes where schemaname = 'public' and tablename in ('kfz_probefahrt', 'kfz_rote_kennzeichen')) as indizes;
