-- ============================================================================
-- ARGONAUT OS · Paket 169 · Konto-Schutz (Pruefung 29.09.2026, K2/K3/K5)
-- Additiv + idempotent. Mehrfach ausfuehrbar. Aendert KEINE Daten.
--
-- (1) mitarbeiter.auth_user_id: nur noch der Server (Service-Schluessel) darf
--     die Verknuepfung Mitarbeiter <-> Login setzen oder aendern. Angemeldete
--     Nutzer (auch der Chef) nicht mehr. Dazu eindeutig je Konto, sofern die
--     Daten es heute schon sind (sonst Hinweis, kein Abbruch).
-- (2) profiles: role, plan, demo, demo_ablauf, zusatz_speicher_gb, stufe kann
--     ein angemeldeter Nutzer nicht mehr selbst aendern (der Wert bleibt still
--     erhalten, andere Felder speichern normal). Server/SQL-Editor duerfen.
-- (3) Datenbank-Funktionen, die fremde Betriebe erreichen, sind nicht mehr ohne
--     Anmeldung aufrufbar. Gruppe A nur noch Server; Gruppe B nicht mehr fuer
--     Besucher ohne Anmeldung (angemeldete Seiten nutzen sie weiter).
--     Schutz: ruft eine NICHT-definer-Funktion oder eine RLS-Regel eine
--     A-Funktion auf, bleibt "authenticated" erhalten (Hinweis in der Ausgabe).
-- ============================================================================

-- (1) ---------------------------------------------------------------------------
create or replace function public.p169_auth_user_id_schuetzen()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Ohne Anmeldung = Server (Service-Schluessel) oder SQL-Editor: erlaubt.
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.auth_user_id is not null then
      raise exception 'Die Verknuepfung mit einem Login setzt nur der Server.' using errcode = '42501';
    end if;
  elsif new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Die Verknuepfung mit einem Login aendert nur der Server.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists p169_auth_user_id_schuetzen on public.mitarbeiter;
create trigger p169_auth_user_id_schuetzen
  before insert or update on public.mitarbeiter
  for each row execute function public.p169_auth_user_id_schuetzen();

do $$
begin
  if exists (
    select 1 from public.mitarbeiter
    where auth_user_id is not null
    group by auth_user_id having count(*) > 1
  ) then
    raise notice 'p169: auth_user_id ist heute doppelt vergeben -> eindeutiger Index NICHT angelegt (Kontrolle unten zeigt die Zeilen).';
  else
    execute 'create unique index if not exists mitarbeiter_auth_user_id_eindeutig on public.mitarbeiter (auth_user_id) where auth_user_id is not null';
  end if;
end $$;

-- (2) ---------------------------------------------------------------------------
create or replace function public.p169_profil_sonderspalten()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  alt jsonb := to_jsonb(old);
  fest jsonb := '{}'::jsonb;
  k text;
begin
  if auth.uid() is null then
    return new;
  end if;
  foreach k in array array['role', 'plan', 'demo', 'demo_ablauf', 'zusatz_speicher_gb', 'stufe'] loop
    if alt ? k then
      fest := fest || jsonb_build_object(k, alt -> k);
    end if;
  end loop;
  new := jsonb_populate_record(new, fest);
  return new;
end;
$$;

drop trigger if exists p169_profil_sonderspalten on public.profiles;
create trigger p169_profil_sonderspalten
  before update on public.profiles
  for each row execute function public.p169_profil_sonderspalten();

-- (3) ---------------------------------------------------------------------------
do $$
declare
  f record;
  a_namen text[] := array[
    'benachrichtigung_erstellen', 'chat_verbrauch_hoch', 'chat_verbrauch_merker',
    'ki_verbrauch_pro_kunde', 'ki_verbrauch_pro_route',
    'modul_nutzung_zaehle', 'modul_nutzung_je_modul', 'onboarding_stand',
    'speicher_bytes_fuer', 'speicher_gesamt', 'speicher_pro_kunde',
    'mail_klick_zaehlen', 'mail_oeffnung_zaehlen'
  ];
  b_namen text[] := array[
    'rechnung_zahlbetrag_neu_berechnen', 'naechste_holz_auftragsnummer', 'euer_uebersicht',
    'termin_arten_vorlagen_anlegen', 'nachweis_name', 'chat_betrieb_von',
    'chat_mitglied_hinzufuegen', 'ist_chat_mitglied',
    'einsatz_bericht_speichern', 'einsatz_foto_speichern', 'einsatz_position_speichern',
    'einsatz_unterschrift_speichern', 'einsatz_foto_loeschen', 'einsatz_position_loeschen',
    'einsatz_status_setzen', 'firmenkopf_fuer_einsatz'
  ];
  sig text;
  aufrufer_ohne_definer boolean;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname = any(a_namen) or p.proname = any(b_namen))
  loop
    sig := format('public.%I(%s)', f.proname, f.args);
    if f.proname = any(a_namen) then
      select exists (
        select 1 from pg_proc q join pg_namespace m on m.oid = q.pronamespace
        where m.nspname = 'public' and not q.prosecdef and q.oid <> f.oid
          and q.prosrc ilike '%' || f.proname || '%'
      ) or exists (
        select 1 from pg_policies pp
        where coalesce(pp.qual, '') || ' ' || coalesce(pp.with_check, '') ilike '%' || f.proname || '%'
      ) into aufrufer_ohne_definer;
      execute format('revoke execute on function %s from public, anon', sig);
      execute format('grant execute on function %s to service_role', sig);
      if aufrufer_ohne_definer then
        execute format('grant execute on function %s to authenticated', sig);
        raise notice 'p169: % bleibt fuer angemeldete Nutzer (wird von einer normalen Funktion gerufen)', sig;
      else
        execute format('revoke execute on function %s from authenticated', sig);
      end if;
    else
      execute format('revoke execute on function %s from public, anon', sig);
      execute format('grant execute on function %s to authenticated, service_role', sig);
    end if;
  end loop;
end $$;

-- Kontrolle (nur lesen) ----------------------------------------------------------
select 'trigger' as art, tgname::text as objekt, tgrelid::regclass::text as detail
from pg_trigger where tgname in ('p169_auth_user_id_schuetzen', 'p169_profil_sonderspalten')
union all
select 'index', indexname::text, tablename::text from pg_indexes where indexname = 'mitarbeiter_auth_user_id_eindeutig'
union all
select 'anon darf noch', p.proname::text, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname not in ('mein_chef_id', 'mein_mitarbeiter_id', 'darf_ich_abrechnen', 'darf_ich_modul_aendern',
                        'darf_ich_modul_sehen', 'darf_ich_verteilen', 'mein_leistungskatalog', 'chat_kanal_gelesen',
                        'chat_kanal_mitglieder', 'chat_mein_name', 'chat_mitglied_per_email', 'chat_team_kollegen',
                        'chat_ungelesen_anzahl')
union all
select 'doppelte auth_user_id', auth_user_id::text, count(*)::text
from public.mitarbeiter where auth_user_id is not null group by auth_user_id having count(*) > 1
union all
select 'MA-Login = Chef-Kennung', m.id::text, m.auth_user_id::text
from public.mitarbeiter m
where m.auth_user_id is not null
  and exists (select 1 from public.mitarbeiter x where x.owner_user_id = m.auth_user_id)
order by 1, 2;
