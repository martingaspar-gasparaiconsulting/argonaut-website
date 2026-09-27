-- ============================================================
-- ARGONAUT OS · Paket 123 (27.09.2026) · Import: Fortschritt, Stoppuhr, Hochrechnung
--
-- Schritt 0 des Umzug-Plans.
--   1) import_jobs bekommt die Messwerte je Datei (Groesse, Start, Dauer,
--      Zeilen pro Sekunde, wer, und die Zeilen-Bilanz: gelesen / uebersprungen /
--      abgelehnt / doppelt / gescheitert / offen). Alle Spalten OHNE Vorgabewert
--      angelegt — alte Protokolle bleiben leer (= "vor Schritt 0, unbekannt"),
--      nichts wird rueckwirkend erfunden.
--   2) Neue Tabelle import_umzug: ein Umzug = mehrere Dateien. Traegt den
--      Gesamtbalken und die Abschluss-Karte.
--   3) Das Protokoll gehoert dem BETRIEB (wie seit B1 alles andere): Mitarbeiter
--      mit Import-Freigabe schreiben es auf die Chef-Kennung, erstellt_von sagt,
--      wer es war. Neue Regeln ij_insert_ma / ij_update_ma — das ERWEITERT
--      Rechte, sperrt niemanden aus. Mitarbeiter loeschen nichts.
--
-- Additiv · idempotent · nicht destruktiv. Zweimal laufen lassen schadet nicht.
-- Ohne dieses SQL laeuft das Import-Center weiter wie bisher (ohne Umzug-Leiste
-- und ohne Messwerte) — die Seite faellt still auf den alten Weg zurueck.
-- ============================================================

-- ---------- 2) Umzug (zuerst, weil import_jobs darauf zeigt) ----------
create table if not exists public.import_umzug (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null,
  name                text not null default 'Umzug nach ARGONAUT',
  geplante_dateien    integer,
  datenmenge          numeric,
  datenmenge_einheit  text,
  status              text not null default 'laeuft',
  gestartet_am        timestamptz not null default now(),
  beendet_am          timestamptz,
  dauer_ms            bigint,
  zusammenfassung     jsonb,
  erstellt_von        uuid default auth.uid(),
  erstellt_am         timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'import_umzug_status_chk') then
    alter table public.import_umzug add constraint import_umzug_status_chk
      check (status in ('laeuft', 'fertig', 'abgebrochen'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'import_umzug_einheit_chk') then
    alter table public.import_umzug add constraint import_umzug_einheit_chk
      check (datenmenge_einheit is null or datenmenge_einheit in ('MB', 'GB', 'TB', 'Zeilen'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'import_umzug_dateien_chk') then
    alter table public.import_umzug add constraint import_umzug_dateien_chk
      check (geplante_dateien is null or (geplante_dateien >= 0 and geplante_dateien <= 1000));
  end if;
end $$;

create index if not exists import_umzug_idx on public.import_umzug (owner_user_id, gestartet_am desc);

alter table public.import_umzug enable row level security;

drop policy if exists iu_owner_all on public.import_umzug;
create policy iu_owner_all on public.import_umzug for all to public
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists iu_select_ma on public.import_umzug;
create policy iu_select_ma on public.import_umzug for select to public
  using (owner_user_id = mein_chef_id());
drop policy if exists iu_insert_ma on public.import_umzug;
create policy iu_insert_ma on public.import_umzug for insert to public
  with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
drop policy if exists iu_update_ma on public.import_umzug;
create policy iu_update_ma on public.import_umzug for update to public
  using (owner_user_id = mein_chef_id() and erstellt_von = auth.uid())
  with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());

-- ---------- 1) Messwerte je Datei ----------
alter table public.import_jobs add column if not exists umzug_id uuid;
alter table public.import_jobs add column if not exists dateigroesse bigint;
alter table public.import_jobs add column if not exists gestartet_am timestamptz;
alter table public.import_jobs add column if not exists dauer_ms bigint;
alter table public.import_jobs add column if not exists zeilen_pro_s numeric(12,2);
alter table public.import_jobs add column if not exists phasen_ms jsonb;
alter table public.import_jobs add column if not exists zeilen_gelesen integer;
alter table public.import_jobs add column if not exists zeilen_uebersprungen integer;
alter table public.import_jobs add column if not exists zeilen_abgelehnt integer;
alter table public.import_jobs add column if not exists zeilen_doppelt integer;
alter table public.import_jobs add column if not exists zeilen_gescheitert integer;
alter table public.import_jobs add column if not exists zeilen_offen integer;
alter table public.import_jobs add column if not exists warnungen integer;
-- erst OHNE Vorgabe anlegen (sonst fuellt ALTER alte Zeilen), dann Vorgabe setzen
alter table public.import_jobs add column if not exists erstellt_von uuid;
alter table public.import_jobs alter column erstellt_von set default auth.uid();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'import_jobs_umzug_fk') then
    alter table public.import_jobs add constraint import_jobs_umzug_fk
      foreign key (umzug_id) references public.import_umzug(id) on delete set null;
  end if;
end $$;

create index if not exists import_jobs_umzug_idx on public.import_jobs (umzug_id) where umzug_id is not null;

-- ---------- 3) Mitarbeiter schreiben das Protokoll fuer den Betrieb ----------
drop policy if exists ij_insert_ma on public.import_jobs;
create policy ij_insert_ma on public.import_jobs for insert to public
  with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
drop policy if exists ij_update_ma on public.import_jobs;
create policy ij_update_ma on public.import_jobs for update to public
  using (owner_user_id = mein_chef_id() and erstellt_von = auth.uid())
  with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());

-- ---------- Kontrolle (EINE Abfrage) ----------
-- Erwartet: neue_spalten 14 · umzug_regeln 4 · ma_regeln_jobs 3 (select/insert/update) · ma_loeschen 0
select 'neue_spalten' as was, count(*)::text as wert
  from information_schema.columns
 where table_schema = 'public' and table_name = 'import_jobs'
   and column_name in ('umzug_id','dateigroesse','gestartet_am','dauer_ms','zeilen_pro_s','phasen_ms',
                       'zeilen_gelesen','zeilen_uebersprungen','zeilen_abgelehnt','zeilen_doppelt',
                       'zeilen_gescheitert','zeilen_offen','warnungen','erstellt_von')
union all
select 'umzug_regeln', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'import_umzug'
union all
select 'ma_regeln_jobs', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'import_jobs' and policyname like '%\_ma'
union all
select 'ma_loeschen', count(*)::text from pg_policies
 where schemaname = 'public' and tablename in ('import_jobs','import_umzug')
   and policyname like '%\_ma' and cmd = 'DELETE';
