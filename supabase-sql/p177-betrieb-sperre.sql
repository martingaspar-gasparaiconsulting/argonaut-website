-- ============================================================================
-- ARGONAUT OS · SQL p177 · Kuendigungs-Sperre je Betrieb (29.09.2026)
--
-- Befund: Die Sperre fuer gekuendigte Kunden las churned_customers — dort
-- traegt kein Weg je etwas ein, und geprueft wurde nur die E-Mail der
-- angemeldeten Person. Mitarbeiter gekuendigter Betriebe blieben drin.
--
-- 1) betrieb_sperre: EINE Zeile je gesperrtem Betrieb, mit Grund, Zeitpunkt,
--    wer gesperrt hat, und aufgehoben_am (Entsperren loescht nie — Nachweis).
--    Nur der Server schreibt und liest (keine Regel fuer Browser-Rollen).
-- 2) betrieb_gesperrt(): gilt fuer Chef UND Mitarbeiter (ueber mein_chef_id),
--    alte churned_customers-Eintraege zaehlen weiter.
--
-- Additiv, idempotent, keine Daten geaendert. AUSSPERR-RISIKO: keines durch
-- dieses SQL allein — gesperrt wird erst, wenn der Betreiber im Command
-- Center einen Betrieb sperrt. Ohne Zeile in betrieb_sperre liefert die
-- Funktion fuer jeden false.
-- ============================================================================

begin;

create table if not exists public.betrieb_sperre (
  owner_user_id uuid primary key,
  grund         text not null,
  gesperrt_am   timestamptz not null default now(),
  gesperrt_von  uuid,
  aufgehoben_am timestamptz,
  aufgehoben_von uuid
);

comment on table public.betrieb_sperre is
  'Paket 177: gekuendigte/gesperrte Betriebe. Schreiben/Lesen nur Server (Command Center). aufgehoben_am = entsperrt, Zeile bleibt als Nachweis.';

alter table public.betrieb_sperre enable row level security;
revoke all on public.betrieb_sperre from anon, authenticated;
grant all on public.betrieb_sperre to service_role;

create or replace function public.betrieb_gesperrt()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_betrieb uuid;
  v_mail    text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_uid is null then
    return false;
  end if;
  v_betrieb := coalesce(public.mein_chef_id(), v_uid);

  if exists (
    select 1 from public.betrieb_sperre s
     where s.owner_user_id = v_betrieb and s.aufgehoben_am is null
  ) then
    return true;
  end if;

  -- Alte Eintraege (je E-Mail) gelten weiter.
  if v_mail <> '' and to_regclass('public.churned_customers') is not null then
    if exists (select 1 from public.churned_customers c where lower(c.email) = v_mail) then
      return true;
    end if;
  end if;
  return false;
end;
$$;

revoke all on function public.betrieb_gesperrt() from public, anon;
grant execute on function public.betrieb_gesperrt() to authenticated, service_role;

commit;

-- KONTROLLE (nur lesen) — Erwartung: tabelle true, anon_darf false, gesperrte_betriebe 0
select to_regclass('public.betrieb_sperre') is not null as tabelle,
       has_function_privilege('anon', 'public.betrieb_gesperrt()', 'execute') as anon_darf,
       (select count(*) from public.betrieb_sperre where aufgehoben_am is null) as gesperrte_betriebe;
