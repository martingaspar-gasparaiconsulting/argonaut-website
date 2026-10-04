-- ============================================================
-- ARGONAUT OS · Paket 199 (04.10.2026) · Werbung: Bestätigung nachholen,
-- Nachweise fest, Shop-Widerrufe im Dashboard
-- Entscheidungsrunde Block 2: D1, D6 (D3, D7, C9 brauchen kein SQL)
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht, keine Daten
-- geändert. Niemand wird ausgesperrt (Anmeldung, Dashboard, Versand laufen
-- wie bisher).
--
-- 1) Newsletter: vier neue Spalten für die nachgeholte Bestätigungs-Mail
--    (Quelle + Datum der Einwilligung, wann gesendet, wie oft).
-- 2) Newsletter: Nachweis-Spalten sind für den Browser FEST. Bisher konnte
--    die Seite selbst „bestätigt am" oder die Quelle „opt-in" setzen und so
--    eine Einwilligung vortäuschen. Jetzt setzt das nur der Server
--    (Bestätigungs-Link, Abmelde-Link, Knopf „Bestätigung anfragen").
--    Der Browser darf weiter: anlegen (von Hand), Name ändern, abmelden,
--    löschen. NICHT mehr: eine Abmeldung rückgängig machen oder jemanden
--    selbst auf „aktiv" setzen (Knopf „Reaktivieren" ist entfallen).
-- 3) werbe_fakten() liefert zusätzlich doi_gesendet_am (Werbe-Prüfung
--    erkennt so die nachgeholte Bestätigung).
-- 4) Shop-Widerrufe: Mitarbeiter mit Shop-Recht sehen sie (mit
--    Schreibrecht: „erledigt" setzen). Die Angaben des Kunden sind fest,
--    „erledigt von" setzt die Datenbank selbst. Neue Spalte erledigt_notiz.
-- 5) Zwei-Faktor-Regel (164·3): keine neue Tabelle — Kontrolle bleibt 0.
--
-- RÜCKWEG (nur im Notfall):
--   drop trigger if exists p199_abo_nachweis on public.newsletter_abonnenten;
--   drop trigger if exists p199_widerruf_fest on public.shop_widerrufe;
--   drop policy if exists p199_swr_ma_select on public.shop_widerrufe;
--   drop policy if exists p199_swr_ma_update on public.shop_widerrufe;
-- ============================================================

-- 1) Neue Spalten -------------------------------------------------------------
alter table public.newsletter_abonnenten add column if not exists einwilligung_quelle text;
alter table public.newsletter_abonnenten add column if not exists einwilligung_am date;
alter table public.newsletter_abonnenten add column if not exists doi_gesendet_am timestamptz;
alter table public.newsletter_abonnenten add column if not exists doi_anzahl integer default 0;
alter table public.shop_widerrufe add column if not exists erledigt_notiz text;

comment on column public.newsletter_abonnenten.einwilligung_quelle is
  'Paket 199: wo die Person eingewilligt hat (Angabe des Betriebs), Pflicht fuer die nachgeholte Bestaetigungs-Mail, danach fest.';
comment on column public.newsletter_abonnenten.doi_gesendet_am is
  'Paket 199: wann die letzte nachgeholte Bestaetigungs-Mail ging. Setzt nur der Server.';

-- 2) Nachweis fest (nur der Server-Schlüssel darf ihn setzen) -------------------
create or replace function public.p199_abo_nachweis()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.bestaetigt_am := null;
    new.bestaetigt_token := null;
    new.doi_gesendet_am := null;
    new.doi_anzahl := 0;
    -- Eine Anmeldestrecke darf nur der Server eintragen.
    if lower(btrim(coalesce(new.quelle, ''))) in ('opt-in', 'website', 'landingpage') then
      new.quelle := 'manuell';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status is distinct from 'aktiv' and new.status = 'aktiv' then
    raise exception 'p199: Aktiv wird eine Adresse nur durch die Bestaetigung der Person selbst.'
      using errcode = '42501';
  end if;
  if old.status = 'abgemeldet' and new.status is distinct from 'abgemeldet' then
    raise exception 'p199: Eine Abmeldung kann nur die Person selbst aufheben (neue Anmeldung).'
      using errcode = '42501';
  end if;
  new.bestaetigt_am := old.bestaetigt_am;
  new.bestaetigt_token := old.bestaetigt_token;
  new.doi_gesendet_am := old.doi_gesendet_am;
  new.doi_anzahl := old.doi_anzahl;
  new.quelle := old.quelle;
  if old.abgemeldet_am is not null then
    new.abgemeldet_am := old.abgemeldet_am;
  end if;
  if old.einwilligung_quelle is not null then
    new.einwilligung_quelle := old.einwilligung_quelle;
  end if;
  if old.einwilligung_am is not null then
    new.einwilligung_am := old.einwilligung_am;
  end if;
  return new;
end;
$$;

drop trigger if exists p199_abo_nachweis on public.newsletter_abonnenten;
create trigger p199_abo_nachweis
  before insert or update on public.newsletter_abonnenten
  for each row execute function public.p199_abo_nachweis();

-- 3) werbe_fakten mit doi_gesendet_am (sonst unverändert zu p173) ---------------
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
               'quelle', a.quelle,
               'doi_gesendet_am', a.doi_gesendet_am))
        from public.newsletter_abonnenten a
       where a.owner_user_id = p_owner and lower(btrim(a.email)) = any(v_mails)), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.werbe_fakten(uuid, text[]) from public;
revoke all on function public.werbe_fakten(uuid, text[]) from anon;
revoke all on function public.werbe_fakten(uuid, text[]) from authenticated;
grant execute on function public.werbe_fakten(uuid, text[]) to service_role;

-- 4) Shop-Widerrufe ------------------------------------------------------------
drop policy if exists p199_swr_ma_select on public.shop_widerrufe;
create policy p199_swr_ma_select on public.shop_widerrufe for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('shop') or public.darf_ich_modul_aendern('shop')));
drop policy if exists p199_swr_ma_update on public.shop_widerrufe;
create policy p199_swr_ma_update on public.shop_widerrufe for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'));

create or replace function public.p199_widerruf_fest()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  -- Die Angaben des Kunden sind der Nachweis des Zugangs (§ 355 BGB) — fest.
  new.id := old.id;
  new.owner_user_id := old.owner_user_id;
  new.seite := old.seite;
  new.name := old.name;
  new.anschrift := old.anschrift;
  new.email := old.email;
  new.bestellung := old.bestellung;
  new.datum := old.datum;
  new.ware := old.ware;
  new.eingang_am := old.eingang_am;
  -- „erledigt von" setzt die Datenbank, nie der Browser.
  if new.erledigt_am is null then
    new.erledigt_von := null;
  elsif old.erledigt_am is distinct from new.erledigt_am then
    new.erledigt_von := auth.uid();
  else
    new.erledigt_von := old.erledigt_von;
  end if;
  return new;
end;
$$;

drop trigger if exists p199_widerruf_fest on public.shop_widerrufe;
create trigger p199_widerruf_fest
  before update on public.shop_widerrufe
  for each row execute function public.p199_widerruf_fest();

-- KONTROLLE — Erwartung: spalten 5 · trigger 2 · fakten_doi 1 · regeln_ma 2 · zwei_faktor_fehlt 0
select
  (select count(*) from information_schema.columns where table_schema = 'public'
     and ((table_name = 'newsletter_abonnenten' and column_name in ('einwilligung_quelle', 'einwilligung_am', 'doi_gesendet_am', 'doi_anzahl'))
       or (table_name = 'shop_widerrufe' and column_name = 'erledigt_notiz'))) as spalten,
  (select count(*) from pg_trigger where tgname in ('p199_abo_nachweis', 'p199_widerruf_fest') and not tgisinternal) as trigger,
  (select count(*) from pg_proc where proname = 'werbe_fakten' and prosrc like '%doi_gesendet_am%') as fakten_doi,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'shop_widerrufe' and policyname like 'p199_%') as regeln_ma,
  (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname = 'p164s3_aal')) as zwei_faktor_fehlt;
