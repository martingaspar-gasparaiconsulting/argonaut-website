-- ============================================================
-- ARGONAUT OS · Paket 124 (27.09.2026) · Import-Motor (Umzug Schritt 2)
--
--   1) import_feldkatalog(): liefert die ECHTEN Spalten der Import-Ziele
--      (Kunden, Lieferanten, Artikel, Offene Posten). Der Motor bietet nur an,
--      was es in DIESER Datenbank gibt, und nimmt weitere Spalten automatisch
--      dazu. Liest nur die Tabellenbeschreibung, keine Daten. Laeuft mit den
--      Rechten der angemeldeten Person (security invoker) und nur fuer die
--      freigegebenen Tabellen.
--   2) Neue Tabelle import_altsystem_wahl: welche Altsysteme ein Betrieb
--      angehakt bzw. ausgeblendet hat (Klick-Liste „Aus welchem System ziehen
--      Sie um?"). Gehoert dem Betrieb; Mitarbeiter mit Zugang duerfen sie
--      pflegen, loeschen nichts.
--   3) Kunden bekommen die Felder, die jede Kundenliste mitbringt:
--      Kundennummer, Anrede, Mobil, Land, Website, USt-IdNr. (Strasse, PLZ,
--      Ort und Nummer im Altsystem gibt es meist schon — IF NOT EXISTS).
--      Lieferanten bekommen Lieferantennummer und USt-IdNr.
--      Alle Spalten OHNE Vorgabewert, alte Eintraege bleiben leer.
--
-- Additiv · idempotent · nicht destruktiv. Zweimal laufen lassen schadet nicht.
-- Sperrt niemanden aus: keine bestehende Regel wird geaendert.
-- Ohne dieses SQL laeuft das Import-Center wie bisher (fester Katalog ohne
-- die neuen Felder, Altsystem-Wahl nur im Browser gemerkt).
-- ============================================================

-- ---------- 3) Neue Felder (zuerst, damit der Katalog sie gleich zeigt) ----------
alter table public.kontakte add column if not exists kundennummer text;
alter table public.kontakte add column if not exists anrede text;
alter table public.kontakte add column if not exists mobil text;
alter table public.kontakte add column if not exists strasse text;
alter table public.kontakte add column if not exists plz text;
alter table public.kontakte add column if not exists ort text;
alter table public.kontakte add column if not exists land text;
alter table public.kontakte add column if not exists website text;
alter table public.kontakte add column if not exists ust_id text;
alter table public.kontakte add column if not exists import_schluessel text;

alter table public.lieferanten add column if not exists lieferantennummer text;
alter table public.lieferanten add column if not exists ust_id text;

-- Schnelles Wiederfinden beim zweiten Import (Kundennummer je Betrieb).
create index if not exists kontakte_kundennummer_idx
  on public.kontakte (owner_user_id, kundennummer) where kundennummer is not null;
create index if not exists lieferanten_nummer_idx
  on public.lieferanten (owner_user_id, lieferantennummer) where lieferantennummer is not null;

-- ---------- 1) Feldkatalog ----------
create or replace function public.import_feldkatalog(p_tabellen text[])
returns table (tabelle text, spalte text, datentyp text, pflicht boolean, generiert boolean)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select c.table_name::text,
         c.column_name::text,
         c.data_type::text,
         (c.is_nullable = 'NO' and c.column_default is null and c.is_identity = 'NO' and c.is_generated = 'NEVER'),
         (c.is_generated <> 'NEVER' or c.is_identity = 'YES')
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = any (p_tabellen)
     and c.table_name = any (array['kontakte', 'lieferanten', 'artikel', 'rechnungen'])
   order by c.table_name, c.ordinal_position;
$$;

revoke all on function public.import_feldkatalog(text[]) from public;
revoke all on function public.import_feldkatalog(text[]) from anon;
grant execute on function public.import_feldkatalog(text[]) to authenticated;

-- ---------- 2) Altsystem-Wahl je Betrieb ----------
create table if not exists public.import_altsystem_wahl (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,
  systeme          text[] not null default '{}',
  ausgeblendet     text[] not null default '{}',
  nur_meine        boolean not null default false,
  aktualisiert_am  timestamptz not null default now(),
  aktualisiert_von uuid default auth.uid()
);

create unique index if not exists import_altsystem_wahl_owner_uq
  on public.import_altsystem_wahl (owner_user_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'import_altsystem_wahl_groesse_chk') then
    alter table public.import_altsystem_wahl add constraint import_altsystem_wahl_groesse_chk
      check (coalesce(array_length(systeme, 1), 0) <= 200 and coalesce(array_length(ausgeblendet, 1), 0) <= 200);
  end if;
end $$;

alter table public.import_altsystem_wahl enable row level security;

drop policy if exists iaw_owner_all on public.import_altsystem_wahl;
create policy iaw_owner_all on public.import_altsystem_wahl for all to public
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists iaw_select_ma on public.import_altsystem_wahl;
create policy iaw_select_ma on public.import_altsystem_wahl for select to public
  using (owner_user_id = mein_chef_id());
drop policy if exists iaw_insert_ma on public.import_altsystem_wahl;
create policy iaw_insert_ma on public.import_altsystem_wahl for insert to public
  with check (owner_user_id = mein_chef_id() and aktualisiert_von = auth.uid());
drop policy if exists iaw_update_ma on public.import_altsystem_wahl;
create policy iaw_update_ma on public.import_altsystem_wahl for update to public
  using (owner_user_id = mein_chef_id())
  with check (owner_user_id = mein_chef_id() and aktualisiert_von = auth.uid());

-- ---------- Kontrolle (EINE Abfrage) ----------
-- Erwartet: kontakte_felder 10 · lieferanten_felder 2 · katalog_funktion 1 ·
--           wahl_regeln 4 · ma_loeschen 0
select 'kontakte_felder' as was, count(*)::text as wert
  from information_schema.columns
 where table_schema = 'public' and table_name = 'kontakte'
   and column_name in ('kundennummer','anrede','mobil','strasse','plz','ort','land','website','ust_id','import_schluessel')
union all
select 'lieferanten_felder', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'lieferanten'
   and column_name in ('lieferantennummer','ust_id')
union all
select 'katalog_funktion', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'import_feldkatalog'
union all
select 'wahl_regeln', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'import_altsystem_wahl'
union all
select 'ma_loeschen', count(*)::text from pg_policies
 where schemaname = 'public' and tablename = 'import_altsystem_wahl'
   and policyname like '%\_ma' and cmd = 'DELETE';
