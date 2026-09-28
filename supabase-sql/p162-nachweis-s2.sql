-- ============================================================
-- ARGONAUT OS · Paket 162 (S2, 28.09.2026) · Nachweisbarkeit — wer hat es gemacht
-- (Punkt 73 / Anwalt-Block AD, Stufe A)
--
-- Befund 22.09.: Keine Kern-Tabelle hielt fest, WELCHER Mitarbeiter einen
-- Datensatz angelegt oder zuletzt geaendert hat. owner_user_id ist immer der
-- BETRIEB. Ein Betrieb konnte nicht belegen, wer falsch beraten oder falsch
-- abgerechnet hat.
--
-- WAS HIER PASSIERT (alles additiv, nichts wird geloescht, nicht rueckwirkend):
--  1. nachweis_name(uid): Name des Mitarbeiters, sonst „Geschäftsleitung".
--  2. setze_erfasser(): EINE Trigger-Funktion fuer alle Tabellen.
--       Anlegen:  erstellt_von = wer angemeldet ist (nicht vom Browser
--                 faelschbar), erstellt_von_name = Schnappschuss des Namens.
--       Aendern:  erstellt_von/_name bleiben, geaendert_von + geaendert_am
--                 werden gesetzt — nur wenn sich wirklich etwas geaendert hat.
--       Server/Zeitplan ohne Anmeldung: bleibt leer (= „System").
--       Ein Fehler darin verhindert NIE das Speichern (exception-sicher).
--  3. Vier Spalten + Trigger auf: kontakte, leads, angebote, rechnungen,
--     termine, projekte, auftraege, verkaufschancen, ablaeufe (nur wenn die
--     Tabelle existiert). Bestehende Spalten (rechnungen.erstellt_von,
--     leads.geaendert_am, ablaeufe.geaendert_am) bleiben, wie sie sind.
--     BEWUSST ohne Fremdschluessel auf auth.users.
--  4. Ablaeufe: ablauf_laeufe merkt sich, WER eine Freigabe erteilt/abgelehnt
--     oder einen Lauf abgebrochen hat (entschieden_von/_name/_am) — vorher nur
--     der Text „Freigegeben". ablauf_protokoll merkt sich den Erfasser.
--
-- HARTE REGEL (Martin 22.09.): Die Erfasser-Angabe gehoert zum einzelnen
-- Datensatz — nie in eine Auswertung, nie in eine Rangliste, nie in eine
-- Kennzahl. (tests/nachweisS2.test.mjs wacht im Code darueber.)
-- Mehrfach ausfuehrbar. Sperrt niemanden aus.
-- ============================================================

-- 1) Name zum angemeldeten Nutzer
create or replace function public.nachweis_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when p_uid is null then null else coalesce(
    (select nullif(trim(coalesce(m.vorname, '') || ' ' || coalesce(m.nachname, '')), '')
       from public.mitarbeiter m where m.auth_user_id = p_uid limit 1),
    'Geschäftsleitung') end;
$$;

-- 2) Gemeinsame Trigger-Funktion
create or replace function public.setze_erfasser()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_neu   jsonb;
  v_alt   jsonb;
  v_ohne  text[] := array['erstellt_von', 'erstellt_von_name', 'geaendert_von', 'geaendert_am', 'aktualisiert_am', 'updated_at'];
  v_patch jsonb;
begin
  begin
    if tg_op = 'INSERT' then
      if v_uid is not null then
        v_patch := jsonb_build_object('erstellt_von', v_uid, 'erstellt_von_name', public.nachweis_name(v_uid));
      else
        v_patch := jsonb_build_object('erstellt_von_name', null);
      end if;
      new := jsonb_populate_record(new, v_patch);
      return new;
    end if;

    -- UPDATE: Erfasser bleibt, was er war
    v_alt := to_jsonb(old);
    v_patch := jsonb_build_object(
      'erstellt_von', v_alt -> 'erstellt_von',
      'erstellt_von_name', v_alt -> 'erstellt_von_name');
    v_neu := to_jsonb(new);
    if (v_neu - v_ohne) is distinct from (v_alt - v_ohne) then
      v_patch := v_patch || jsonb_build_object('geaendert_von', v_uid, 'geaendert_am', now());
    else
      v_patch := v_patch || jsonb_build_object('geaendert_von', v_alt -> 'geaendert_von', 'geaendert_am', v_alt -> 'geaendert_am');
    end if;
    new := jsonb_populate_record(new, v_patch);
    return new;
  exception when others then
    -- Ein fehlender Nachweis darf NIE das Speichern verhindern.
    return new;
  end;
end;
$$;

-- 3) Spalten + Trigger auf die Kern-Tabellen
do $$
declare
  t text;
begin
  foreach t in array array['kontakte', 'leads', 'angebote', 'rechnungen', 'termine', 'projekte', 'auftraege', 'verkaufschancen', 'ablaeufe'] loop
    if to_regclass('public.' || t) is null then
      raise notice '%: Tabelle nicht gefunden, uebersprungen', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists erstellt_von uuid default auth.uid()', t);
    execute format('alter table public.%I add column if not exists erstellt_von_name text', t);
    execute format('alter table public.%I add column if not exists geaendert_von uuid', t);
    execute format('alter table public.%I add column if not exists geaendert_am timestamptz', t);
    execute format('drop trigger if exists trg_nachweis_%s on public.%I', t, t);
    execute format('create trigger trg_nachweis_%s before insert or update on public.%I for each row execute function public.setze_erfasser()', t, t);
  end loop;
end $$;

-- 4) Ablaeufe: wer hat freigegeben / abgelehnt / abgebrochen?
alter table public.ablauf_laeufe add column if not exists entschieden_von uuid;
alter table public.ablauf_laeufe add column if not exists entschieden_von_name text;
alter table public.ablauf_laeufe add column if not exists entschieden_am timestamptz;

create or replace function public.ablauf_entscheidung_merken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    -- Nur eine MENSCHLICHE Entscheidung (angemeldet), nie der Motor:
    -- aus „freigabe" heraus (freigegeben/abgelehnt) oder ein Abbruch.
    if auth.uid() is not null
       and new.status is distinct from old.status
       and (old.status = 'freigabe' or new.status = 'abgebrochen') then
      new.entschieden_von := auth.uid();
      new.entschieden_von_name := public.nachweis_name(auth.uid());
      new.entschieden_am := now();
    else
      new.entschieden_von := old.entschieden_von;
      new.entschieden_von_name := old.entschieden_von_name;
      new.entschieden_am := old.entschieden_am;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_ablauf_entscheidung on public.ablauf_laeufe;
create trigger trg_ablauf_entscheidung
  before update on public.ablauf_laeufe
  for each row execute function public.ablauf_entscheidung_merken();

alter table public.ablauf_protokoll add column if not exists erstellt_von uuid default auth.uid();
alter table public.ablauf_protokoll add column if not exists erstellt_von_name text;
drop trigger if exists trg_nachweis_ablauf_protokoll on public.ablauf_protokoll;
create trigger trg_nachweis_ablauf_protokoll
  before insert on public.ablauf_protokoll
  for each row execute function public.setze_erfasser();

-- Kontrolle: soll 1 Zeile zeigen — nachweis_trigger = 11 (weniger, falls eine
-- Tabelle fehlt; die Meldungen oben nennen sie), spalten_kontakte = 4, laeufe_spalten = 3
select
  (select count(*) from pg_trigger where tgname like 'trg_nachweis_%' or tgname = 'trg_ablauf_entscheidung') as nachweis_trigger,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'kontakte'
     and column_name in ('erstellt_von', 'erstellt_von_name', 'geaendert_von', 'geaendert_am')) as spalten_kontakte,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ablauf_laeufe'
     and column_name like 'entschieden_%') as laeufe_spalten;
