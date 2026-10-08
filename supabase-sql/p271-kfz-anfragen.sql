-- ============================================================
-- ARGONAUT OS · Paket 271 (08.10.2026) · K10 Anfragen und Suchaufträge
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) kfz_anfrage      Kaufinteressenten-Anfragen, auf Wunsch am Fahrzeug
--                      (bestand_id): Quelle, Kontakt, Nachricht, Verantwortlicher,
--                      nächster Kontakt (fällig am), Stand bis zum Abschluss
--                      mit Abschlussgrund. Eigene Tabelle — NICHT „leads",
--                      damit keine Werbe-Serie und kein Ablauf ungewollt startet.
--  2) kfz_suchauftrag  Kundenwünsche (Marke, Modell, Preis, Erstzulassung, km,
--                      Kraftstoff) mit Laufzeit; Treffer rechnet die Seite
--                      gegen den Bestand. Nach Ablauf wird nicht mehr gesucht.
-- Rechte wie Paket 181/266: Besitzer = Betrieb (Auslöser p181_besitzer),
-- Mitarbeiter lesen mit Modul „kfz", schreiben mit Schreibrecht „kfz",
-- löschen nur der Chef.
-- ============================================================

-- 1) Anfragen ------------------------------------------------------------------------
create table if not exists public.kfz_anfrage (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null,
  bestand_id        uuid references public.kfz_bestand(id) on delete set null,
  nr                text,
  quelle            text not null default 'telefon' check (quelle in ('telefon', 'mail', 'laden', 'website', 'boerse', 'empfehlung', 'sonstiges')),
  name              text check (name is null or char_length(name) <= 120),
  tel               text check (tel is null or char_length(tel) <= 40),
  email             text check (email is null or char_length(email) <= 160),
  nachricht         text check (nachricht is null or char_length(nachricht) <= 2000),
  kontakt_id        uuid,
  verantwortlich_id uuid,
  verantwortlich_name text check (verantwortlich_name is null or char_length(verantwortlich_name) <= 120),
  status            text not null default 'neu' check (status in ('neu', 'in_arbeit', 'termin', 'angebot', 'gewonnen', 'verloren')),
  faellig_am        date,
  abschluss_grund   text check (abschluss_grund is null or abschluss_grund in ('gekauft', 'preis', 'fahrzeug_weg', 'anderes_fahrzeug', 'finanzierung', 'inzahlungnahme', 'kein_kontakt', 'sonstiges')),
  abschluss_notiz   text check (abschluss_notiz is null or char_length(abschluss_notiz) <= 500),
  abgeschlossen_am  timestamptz,
  notiz             text check (notiz is null or char_length(notiz) <= 2000),
  erstellt_von      uuid default auth.uid(),
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now()
);
create index if not exists kfz_anfrage_owner_idx on public.kfz_anfrage (owner_user_id, status, faellig_am);
create index if not exists kfz_anfrage_bestand_idx on public.kfz_anfrage (bestand_id);
create unique index if not exists kfz_anfrage_nr_uq on public.kfz_anfrage (owner_user_id, nr) where nr is not null;

alter table public.kfz_anfrage enable row level security;

drop trigger if exists p181_besitzer on public.kfz_anfrage;
create trigger p181_besitzer before insert or update on public.kfz_anfrage
  for each row execute function public.p181_besitzer();

drop policy if exists kfzan_owner_all on public.kfz_anfrage;
create policy kfzan_owner_all on public.kfz_anfrage for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_anfrage;
create policy p181_ma_select on public.kfz_anfrage for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_anfrage;
create policy p181_ma_insert on public.kfz_anfrage for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_anfrage;
create policy p181_ma_update on public.kfz_anfrage for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- 2) Suchaufträge ----------------------------------------------------------------------
create table if not exists public.kfz_suchauftrag (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  nr              text,
  name            text check (name is null or char_length(name) <= 120),
  tel             text check (tel is null or char_length(tel) <= 40),
  email           text check (email is null or char_length(email) <= 160),
  kontakt_id      uuid,
  kriterien       jsonb not null default '{}'::jsonb check (jsonb_typeof(kriterien) = 'object'),
  aktiv           boolean not null default true,
  gueltig_bis     date,
  gesehen_bis     timestamptz,
  verantwortlich_id uuid,
  verantwortlich_name text check (verantwortlich_name is null or char_length(verantwortlich_name) <= 120),
  notiz           text check (notiz is null or char_length(notiz) <= 2000),
  erstellt_von    uuid default auth.uid(),
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists kfz_suchauftrag_owner_idx on public.kfz_suchauftrag (owner_user_id, aktiv);
create unique index if not exists kfz_suchauftrag_nr_uq on public.kfz_suchauftrag (owner_user_id, nr) where nr is not null;

alter table public.kfz_suchauftrag enable row level security;

drop trigger if exists p181_besitzer on public.kfz_suchauftrag;
create trigger p181_besitzer before insert or update on public.kfz_suchauftrag
  for each row execute function public.p181_besitzer();

drop policy if exists kfzsa_owner_all on public.kfz_suchauftrag;
create policy kfzsa_owner_all on public.kfz_suchauftrag for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_suchauftrag;
create policy p181_ma_select on public.kfz_suchauftrag for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_suchauftrag;
create policy p181_ma_insert on public.kfz_suchauftrag for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_suchauftrag;
create policy p181_ma_update on public.kfz_suchauftrag for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- KONTROLLE — Erwartung: tabellen = 2, regeln = 8, ausloeser = 2, rls_an = 2, indizes = 7
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('kfz_anfrage', 'kfz_suchauftrag')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('kfz_anfrage', 'kfz_suchauftrag')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.kfz_anfrage'::regclass, 'public.kfz_suchauftrag'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where oid in ('public.kfz_anfrage'::regclass, 'public.kfz_suchauftrag'::regclass) and relrowsecurity) as rls_an,
  (select count(*) from pg_indexes where schemaname = 'public' and tablename in ('kfz_anfrage', 'kfz_suchauftrag')) as indizes;
