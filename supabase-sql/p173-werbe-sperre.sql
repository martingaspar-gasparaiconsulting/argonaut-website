-- ============================================================================
-- ARGONAUT OS · SQL p173 · Werbe-Mails rechtssicher (29.09.2026)
-- Befunde K6, H7-H10, M7, M8
--
-- REIHENFOLGE: ZUERST dieses SQL, DANACH _p173 pushen.
--   Der neue Code fragt vor jeder Werbe-Mail werbe_fakten() — fehlt die
--   Funktion, geht KEINE Werbe-Mail raus (sichere Richtung). Betriebspost
--   (Rechnung, Termin, Mahnung) ist davon nicht betroffen.
--
-- Additiv und idempotent: nichts wird geloescht, keine Daten geaendert.
-- Kein Aussperr-Risiko fuer Anmeldung oder Dashboard.
--
-- 1) werbe_sperre   — EINE Sperrliste fuer alle Kanaele (Widerspruch/Abmeldung)
-- 2) werbe_fakten() — liefert dem Server die Fakten zu (Betrieb, Adressen);
--                     nur service_role, nie Browser/anon
-- 3) Hilfs-Indizes fuer den Adress-Abgleich ohne Gross-/Kleinschreibung
-- 4) newsletter_abonnenten.bestaetigt_am: ein Standardwert (falls live
--    gesetzt) wird entfernt — sonst sieht jede von Hand eingetragene Adresse
--    „bestaetigt" aus. Vorhandene Werte bleiben unveraendert.
-- ============================================================================

begin;

-- 1) Sperrliste ---------------------------------------------------------------
create table if not exists public.werbe_sperre (
  owner_user_id uuid        not null,
  email         text        not null,
  gesperrt_am   timestamptz not null default now(),
  erstmals_am   timestamptz not null default now(),
  quelle        text,
  primary key (owner_user_id, email),
  constraint werbe_sperre_email_klein check (email = lower(btrim(email)) and position('@' in email) > 1)
);

comment on table public.werbe_sperre is
  'Paket 173: Widerspruch/Abmeldung je Betrieb und Adresse, gilt fuer ALLE Werbe-Kanaele. Schreiben nur der Server. erstmals_am = Nachweis, gesperrt_am = letzter Widerspruch.';

alter table public.werbe_sperre enable row level security;

drop policy if exists werbe_sperre_lesen on public.werbe_sperre;
create policy werbe_sperre_lesen on public.werbe_sperre
  for select to authenticated
  using (owner_user_id = auth.uid());
-- Bewusst KEINE insert/update/delete-Regel: der Nachweis gehoert nicht in die
-- Hand des Browsers. Eintragen tut nur der Server (Abmeldelinks, CRM-Widerspruch).

revoke all on public.werbe_sperre from anon;
revoke insert, update, delete, truncate on public.werbe_sperre from authenticated;
grant select on public.werbe_sperre to authenticated;
grant all on public.werbe_sperre to service_role;

-- Spalten, die der Abgleich liest (live vorhanden; hier nur zur Sicherheit)
alter table public.kontakte add column if not exists werbe_einwilligung boolean;
alter table public.kontakte add column if not exists werbe_widerspruch_am timestamptz;
alter table public.newsletter_abonnenten add column if not exists bestaetigt_am timestamptz;
alter table public.newsletter_abonnenten add column if not exists abgemeldet_am timestamptz;
alter table public.newsletter_abonnenten add column if not exists quelle text;

-- 3) Indizes -------------------------------------------------------------------
create index if not exists kontakte_owner_mail_klein_idx
  on public.kontakte (owner_user_id, lower(btrim(email)));
create index if not exists newsletter_abonnenten_owner_mail_klein_idx
  on public.newsletter_abonnenten (owner_user_id, lower(btrim(email)));

-- 2) Fakten-Funktion ---------------------------------------------------------------
create or replace function public.werbe_fakten(p_owner uuid, p_emails text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mails text[];
begin
  if p_owner is null or p_emails is null then
    return jsonb_build_object('sperren', '[]'::jsonb, 'kontakte', '[]'::jsonb, 'abos', '[]'::jsonb);
  end if;
  if cardinality(p_emails) > 1000 then
    raise exception 'werbe_fakten: hoechstens 1000 Adressen je Aufruf';
  end if;
  select coalesce(array_agg(distinct lower(btrim(x))), '{}') into v_mails
    from unnest(p_emails) as x
   where x is not null and btrim(x) <> '';

  return jsonb_build_object(
    'sperren', coalesce((
      select jsonb_agg(jsonb_build_object('email', s.email, 'am', s.gesperrt_am))
        from public.werbe_sperre s
       where s.owner_user_id = p_owner and s.email = any(v_mails)), '[]'::jsonb),
    'kontakte', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', lower(btrim(k.email)),
               'werbe_einwilligung', k.werbe_einwilligung,
               'werbe_widerspruch_am', k.werbe_widerspruch_am))
        from public.kontakte k
       where k.owner_user_id = p_owner and lower(btrim(k.email)) = any(v_mails)), '[]'::jsonb),
    'abos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', lower(btrim(a.email)),
               'status', a.status,
               'bestaetigt_am', a.bestaetigt_am,
               'abgemeldet_am', a.abgemeldet_am,
               'quelle', a.quelle))
        from public.newsletter_abonnenten a
       where a.owner_user_id = p_owner and lower(btrim(a.email)) = any(v_mails)), '[]'::jsonb)
  );
end;
$$;

comment on function public.werbe_fakten(uuid, text[]) is
  'Paket 173: Sperrliste, Kontakt-Einwilligung/-Widerspruch und Newsletter-Status zu (Betrieb, Adressen). Nur service_role. Die Entscheidung trifft lib/werbeErlaubnis.ts.';

revoke all on function public.werbe_fakten(uuid, text[]) from public;
revoke all on function public.werbe_fakten(uuid, text[]) from anon;
revoke all on function public.werbe_fakten(uuid, text[]) from authenticated;
grant execute on function public.werbe_fakten(uuid, text[]) to service_role;

-- 4) Standardwert von bestaetigt_am entfernen (nur falls gesetzt) -----------------
do $$
declare
  v_default text;
begin
  select column_default into v_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'newsletter_abonnenten' and column_name = 'bestaetigt_am';
  if v_default is not null then
    execute 'alter table public.newsletter_abonnenten alter column bestaetigt_am drop default';
    raise notice 'p173: Standardwert von newsletter_abonnenten.bestaetigt_am (%) entfernt', v_default;
  end if;
end $$;

commit;

-- ============================================================================
-- KONTROLLE (nur lesen) — bitte die Ergebnisse als Bild/CSV zurueckgeben
-- ============================================================================
select 'werbe_sperre vorhanden' as pruefung, to_regclass('public.werbe_sperre') is not null as ok
union all
select 'werbe_fakten nur Server (anon darf nicht)', not has_function_privilege('anon', 'public.werbe_fakten(uuid, text[])', 'execute')
union all
select 'werbe_fakten nur Server (authenticated darf nicht)', not has_function_privilege('authenticated', 'public.werbe_fakten(uuid, text[])', 'execute')
union all
select 'bestaetigt_am ohne Standardwert', (select column_default is null from information_schema.columns
  where table_schema = 'public' and table_name = 'newsletter_abonnenten' and column_name = 'bestaetigt_am');

-- Wie viele aktive Abonnenten bekommen den Newsletter ab jetzt NICHT mehr
-- (keine Double-Opt-in-Quelle oder keine Bestaetigung)? Die bekommen ihn nur
-- noch, wenn am Kontakt eine Einwilligung steht.
select quelle,
       count(*) filter (where bestaetigt_am is not null) as mit_bestaetigung,
       count(*) filter (where bestaetigt_am is null)     as ohne_bestaetigung
  from public.newsletter_abonnenten
 where status = 'aktiv'
 group by quelle
 order by quelle;
