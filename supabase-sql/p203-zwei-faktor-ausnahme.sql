-- ============================================================
-- ARGONAUT OS · Paket 203 (04.10.2026) · Ausnahme von der Zwei-Faktor-Pflicht je Mitarbeiter
-- Entscheidungsrunde Block 2: B4 — GETRENNT geliefert (Anmeldung)
--
-- Befund: Ohne Diensthandy musste der Chef die Pflicht (Paket 190) für ALLE
-- ausschalten. Jetzt kann er einzelne Mitarbeiter ausnehmen.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht.
-- AUSSPERR-RISIKO: keines — die Änderung macht die Pflicht nur für
-- ausgenommene Personen weicher. Fällt die Funktion aus, gilt wie bisher:
-- Störung = keine Betriebs-Pflicht (der Server sperrt nie wegen eines Fehlers).
--
-- 1) Tabelle zwei_faktor_ausnahme (Grund, optional „gilt bis", wer/wann,
--    aufgehoben wer/wann). KEINE Regel für Nutzer — schreiben und lesen nur
--    der Server (/api/zwei-faktor/ausnahme, nur Geschäftsleitung mit Code).
-- 2) zwei_faktor_pflicht_ab() liefert für eine ausgenommene Person NULL
--    (= keine Pflicht). Für alle anderen unverändert.
-- 3) Zwei-Faktor-Regel (164·3) auf die neue Tabelle.
--
-- RÜCKWEG (nur im Notfall): Funktion aus p190 erneut ausführen
--   (zwei_faktor_pflicht_ab ohne Ausnahme-Prüfung); die Tabelle kann bleiben.
-- ============================================================

create table if not exists public.zwei_faktor_ausnahme (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  mitarbeiter_id  uuid not null,
  auth_user_id    uuid not null,
  grund           text not null check (char_length(btrim(grund)) >= 5 and char_length(grund) <= 200),
  bis             date,
  angelegt_am     timestamptz not null default now(),
  angelegt_von    uuid not null,
  aufgehoben_am   timestamptz,
  aufgehoben_von  uuid
);
create index if not exists zwei_faktor_ausnahme_idx on public.zwei_faktor_ausnahme (owner_user_id, auth_user_id);
create unique index if not exists zwei_faktor_ausnahme_eine_aktive
  on public.zwei_faktor_ausnahme (owner_user_id, mitarbeiter_id) where aufgehoben_am is null;

comment on table public.zwei_faktor_ausnahme is
  'Paket 203: Ausnahme einzelner Mitarbeiter von der Zwei-Faktor-Pflicht je Betrieb. Nur der Server schreibt; aufheben statt loeschen (Nachweis).';

alter table public.zwei_faktor_ausnahme enable row level security;
revoke all on public.zwei_faktor_ausnahme from anon, authenticated;
grant all on public.zwei_faktor_ausnahme to service_role;

create or replace function public.zwei_faktor_pflicht_ab()
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_betrieb uuid;
begin
  if v_uid is null then
    return null;
  end if;
  v_betrieb := coalesce(public.mein_chef_id(), v_uid);
  -- Paket 203: gueltige Ausnahme fuer genau diese Person = keine Pflicht
  if exists (
    select 1 from public.zwei_faktor_ausnahme a
     where a.owner_user_id = v_betrieb
       and a.auth_user_id = v_uid
       and a.aufgehoben_am is null
       and (a.bis is null or a.bis >= (now() at time zone 'Europe/Berlin')::date)
  ) then
    return null;
  end if;
  return (
    select p.pflicht_ab
      from public.zwei_faktor_pflicht p
     where p.owner_user_id = v_betrieb
       and p.an
  );
end;
$$;

revoke all on function public.zwei_faktor_pflicht_ab() from public, anon;
grant execute on function public.zwei_faktor_pflicht_ab() to authenticated, service_role;

drop policy if exists p164s3_aal on public.zwei_faktor_ausnahme;
create policy p164s3_aal on public.zwei_faktor_ausnahme as restrictive for all to authenticated
  using ((select public.p164s3_aal_ok())) with check ((select public.p164s3_aal_ok()));

-- KONTROLLE — Erwartung: tabelle 1 · nutzer_regeln 0 · funktion_mit_ausnahme 1 · anon_darf false · zwei_faktor_fehlt 0
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'zwei_faktor_ausnahme') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'zwei_faktor_ausnahme' and policyname <> 'p164s3_aal') as nutzer_regeln,
  (select count(*) from pg_proc where proname = 'zwei_faktor_pflicht_ab' and prosrc like '%zwei_faktor_ausnahme%') as funktion_mit_ausnahme,
  has_function_privilege('anon', 'public.zwei_faktor_pflicht_ab()', 'execute') as anon_darf,
  (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname = 'p164s3_aal')) as zwei_faktor_fehlt;
