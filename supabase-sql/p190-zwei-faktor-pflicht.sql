-- ============================================================================
-- ARGONAUT OS · Paket 190 (30.09.2026) · Zwei-Faktor-Pflicht je Betrieb
--
--   zwei_faktor_pflicht            eine Zeile je Betrieb: an/aus, Pflicht-Tag
--                                  (Einschalten + 7 Tage), Nachweis wer/wann,
--                                  Haekchen „Mitarbeiter informiert", Betriebsrat
--   zwei_faktor_pflicht_protokoll  jedes Ein- und Ausschalten (Nachweis)
--   zwei_faktor_pflicht_ab()       Pflicht-Tag des EIGENEN Betriebs (Chef bzw.
--                                  mein_chef_id) — liest der Pfoertner
--
-- NEU, sonst nichts. Mehrfach ausfuehrbar. Beide Tabellen liest und schreibt
-- nur der Server (RLS an, keine Regel fuer Nutzer).
-- AUSSPERR-RISIKO durch dieses SQL: keines. Ohne Zeile mit an = true liefert
-- die Funktion fuer jeden null. Wirkung erst, wenn ein Inhaber im Dashboard
-- „Fuer alle Pflicht" einschaltet — und dann erst nach 7 Tagen, und auch dann
-- nur „zur Einrichtung", nie ausgesperrt.
-- ============================================================================

begin;

create table if not exists public.zwei_faktor_pflicht (
  owner_user_id          uuid primary key,
  an                     boolean not null default false,
  pflicht_ab             timestamptz,
  eingeschaltet_am       timestamptz,
  eingeschaltet_von      uuid,
  mitarbeiter_informiert boolean not null default false,
  betriebsrat            text check (betriebsrat in ('einbezogen', 'keiner')),
  ausgeschaltet_am       timestamptz,
  ausgeschaltet_von      uuid,
  geaendert_am           timestamptz not null default now()
);
alter table public.zwei_faktor_pflicht enable row level security;

create table if not exists public.zwei_faktor_pflicht_protokoll (
  id                     uuid primary key default gen_random_uuid(),
  owner_user_id          uuid not null,
  aktion                 text not null check (aktion in ('an', 'aus')),
  durch_user_id          uuid not null,
  mitarbeiter_informiert boolean,
  betriebsrat            text,
  pflicht_ab             timestamptz,
  zeit                   timestamptz not null default now()
);
create index if not exists zwei_faktor_pflicht_protokoll_idx on public.zwei_faktor_pflicht_protokoll (owner_user_id, zeit desc);
alter table public.zwei_faktor_pflicht_protokoll enable row level security;

create or replace function public.zwei_faktor_pflicht_ab()
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return null;
  end if;
  return (
    select p.pflicht_ab
      from public.zwei_faktor_pflicht p
     where p.owner_user_id = coalesce(public.mein_chef_id(), v_uid)
       and p.an
  );
end;
$$;

revoke all on function public.zwei_faktor_pflicht_ab() from public, anon;
grant execute on function public.zwei_faktor_pflicht_ab() to authenticated, service_role;

commit;

-- KONTROLLE (nur lesen) — Erwartung: true | true | false | 0 | 0
select to_regclass('public.zwei_faktor_pflicht') is not null as tabelle,
       to_regclass('public.zwei_faktor_pflicht_protokoll') is not null as protokoll,
       has_function_privilege('anon', 'public.zwei_faktor_pflicht_ab()', 'execute') as anon_darf,
       (select count(*) from public.zwei_faktor_pflicht where an) as betriebe_mit_pflicht,
       (select count(*) from pg_policies where schemaname = 'public' and tablename in ('zwei_faktor_pflicht', 'zwei_faktor_pflicht_protokoll')) as regeln;
