-- ============================================================
-- ARGONAUT OS · Paket 345 (12.10.2026) · A0 Freigabe-Zentrale Teil 1
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- freigabe_schalter:  je Schalter (z. B. „startSperre.shop") der Stand aus
--                     dem Command Center: freigegeben ja/nein, Vermerk,
--                     Anwalt-Frage, Datum der Anwalt-Antwort, ausgeblendet.
--                     Steht nichts drin, gilt der Code-Standard (= aus).
-- freigabe_protokoll: jede Änderung, automatisch geschrieben, unveränderbar.
--
-- Zugriff NUR über den Server (Betreiber mit Zwei-Faktor, /api/admin/
-- freigaben). Für angemeldete Nutzer und Besucher gibt es keine Regel und
-- keine Rechte — sie sehen und ändern nichts.
-- ============================================================

-- TEIL 1 von 3: Tabellen
create table if not exists public.freigabe_schalter (
  schluessel            text primary key check (schluessel ~ '^[a-zA-Z]+\.[a-zA-Z_]+$' and char_length(schluessel) <= 60),
  an                    boolean not null default false,
  vermerk               text check (vermerk is null or char_length(vermerk) <= 1000),
  anwalt_frage          text check (anwalt_frage is null or char_length(anwalt_frage) <= 120),
  anwalt_antwort_datum  date,
  ausgeblendet          boolean not null default false,
  geaendert_von         uuid,
  geaendert_am          timestamptz not null default now(),
  -- Freigeben nur mit Vermerk (mind. 20 Zeichen) und Datum der Anwalt-Antwort
  constraint freigabe_schalter_vermerk_ck check (an = false or (vermerk is not null and char_length(trim(vermerk)) >= 20 and anwalt_antwort_datum is not null))
);

create table if not exists public.freigabe_protokoll (
  id          uuid primary key default gen_random_uuid(),
  schluessel  text not null,
  aktion      text not null check (aktion in ('freigeben', 'sperren', 'ausblenden', 'einblenden', 'vermerk')),
  vermerk     text,
  von         uuid,
  am          timestamptz not null default now()
);
create index if not exists freigabe_protokoll_idx on public.freigabe_protokoll (schluessel, am desc);

alter table public.freigabe_schalter enable row level security;
alter table public.freigabe_protokoll enable row level security;
revoke all on public.freigabe_schalter from anon, authenticated;
revoke all on public.freigabe_protokoll from anon, authenticated;

-- TEIL 2 von 3: Protokoll automatisch schreiben, Protokoll unveränderbar
create or replace function public.p345_freigabe_protokollieren()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_aktion text;
begin
  new.geaendert_am := now();
  if tg_op = 'INSERT' then
    v_aktion := case when new.an then 'freigeben' when new.ausgeblendet then 'ausblenden' else 'vermerk' end;
  elsif new.an is distinct from old.an then
    v_aktion := case when new.an then 'freigeben' else 'sperren' end;
  elsif new.ausgeblendet is distinct from old.ausgeblendet then
    v_aktion := case when new.ausgeblendet then 'ausblenden' else 'einblenden' end;
  else
    v_aktion := 'vermerk';
  end if;
  insert into public.freigabe_protokoll (schluessel, aktion, vermerk, von) values (new.schluessel, v_aktion, new.vermerk, new.geaendert_von);
  return new;
end;
$$;

create or replace function public.p345_protokoll_fest()
returns trigger language plpgsql as $$
begin
  raise exception 'Das Freigabe-Protokoll wird nicht geändert oder gelöscht.';
end;
$$;

drop trigger if exists p345_protokollieren on public.freigabe_schalter;
create trigger p345_protokollieren before insert or update on public.freigabe_schalter
  for each row execute function public.p345_freigabe_protokollieren();
drop trigger if exists p345_fest on public.freigabe_protokoll;
create trigger p345_fest before update or delete on public.freigabe_protokoll
  for each row execute function public.p345_protokoll_fest();

-- TEIL 3 von 3: KONTROLLE — Erwartung: tabellen = 2 | ausloeser = 2 | rls_an = 2 | rechte_nutzer = 0
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('freigabe_schalter', 'freigabe_protokoll')) as tabellen,
  (select count(*) from pg_trigger where tgrelid in ('public.freigabe_schalter'::regclass, 'public.freigabe_protokoll'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('freigabe_schalter', 'freigabe_protokoll') and relrowsecurity) as rls_an,
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name in ('freigabe_schalter', 'freigabe_protokoll') and grantee in ('anon', 'authenticated')) as rechte_nutzer;
