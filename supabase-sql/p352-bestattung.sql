-- ============================================================
-- ARGONAUT OS · Paket 352 (13.10.2026) · A4a Fachpaket Bestatter
-- Sterbefall-Akte mit Checkliste (Standesamt, Friedhof, Rente,
-- Krankenkasse …), Kostenvoranschlag aus dem Leistungskatalog mit
-- Auslagen für Dritte (z. B. Friedhofsgebühren) getrennt ohne
-- Umsatzsteuer, und Partner je Sterbefall (Steinmetz, Florist,
-- Trauerredner …).
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- sterbefall:                  die Akte (Verstorbene/r, Auftraggeber,
--                              Bestattungsart, Termine, Status). Nummer
--                              je Betrieb und Jahr vergibt die Datenbank.
-- sterbefall_aufgabe:          Checkliste je Sterbefall (fällig / erledigt).
-- sterbefall_posten:           Kostenvoranschlag. Der Betrag je Zeile wird
--                              HIER gerechnet (Menge × Preis), Auslagen
--                              tragen immer 0 % Umsatzsteuer.
-- sterbefall_partner:          Beteiligte (Steinmetz, Florist, Redner …).
-- bestattung_aufgabe_vorlage:  die eigene Checkliste des Betriebs mit
--                              eigenen Fristen (Tage nach dem Sterbetag).
--
-- Rechte wie Paket 344: Besitzer = Betrieb (p181_besitzer), Mitarbeiter
-- lesen mit Modul „bestattung", anlegen/ändern mit Schreibrecht, löschen
-- nur die Geschäftsleitung. Kein Zugang für Angehörige in diesem Paket.
-- ============================================================

-- TEIL 1 von 7: Die Akte
create table if not exists public.sterbefall (
  id                      uuid primary key default gen_random_uuid(),
  owner_user_id           uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer                  text,
  verstorben_vorname      text check (verstorben_vorname is null or char_length(verstorben_vorname) <= 80),
  verstorben_nachname     text not null check (char_length(verstorben_nachname) between 1 and 80),
  geburtsname             text check (geburtsname is null or char_length(geburtsname) <= 80),
  geburtsdatum            date,
  sterbedatum             date,
  sterbeort               text check (sterbeort is null or char_length(sterbeort) <= 160),
  letzte_anschrift        text check (letzte_anschrift is null or char_length(letzte_anschrift) <= 300),
  familienstand           text check (familienstand is null or familienstand in ('ledig', 'verheiratet', 'verwitwet', 'geschieden', 'partnerschaft', 'unbekannt')),
  feier                   text check (feier is null or char_length(feier) <= 120),
  bestattungsart          text not null default 'erd' check (bestattungsart in ('erd', 'feuer', 'see', 'baum', 'anonym', 'sonstige')),
  friedhof                text check (friedhof is null or char_length(friedhof) <= 160),
  grabart                 text check (grabart is null or char_length(grabart) <= 120),
  trauerfeier_am          timestamptz,
  beisetzung_am           timestamptz,
  kontakt_id              uuid,
  auftraggeber_name       text not null check (char_length(auftraggeber_name) between 1 and 120),
  auftraggeber_verhaeltnis text check (auftraggeber_verhaeltnis is null or char_length(auftraggeber_verhaeltnis) <= 60),
  auftraggeber_tel        text check (auftraggeber_tel is null or char_length(auftraggeber_tel) <= 40),
  auftraggeber_mail       text check (auftraggeber_mail is null or char_length(auftraggeber_mail) <= 160),
  auftraggeber_anschrift  text check (auftraggeber_anschrift is null or char_length(auftraggeber_anschrift) <= 300),
  status                  text not null default 'aufgenommen' check (status in ('aufgenommen', 'vorbereitung', 'feier_geplant', 'beigesetzt', 'abgeschlossen', 'storniert')),
  notiz                   text check (notiz is null or char_length(notiz) <= 1000),
  erstellt_von            uuid default auth.uid(),
  erstellt_am             timestamptz not null default now(),
  aktualisiert_am         timestamptz not null default now(),
  constraint sterbefall_daten check (geburtsdatum is null or sterbedatum is null or sterbedatum >= geburtsdatum),
  constraint sterbefall_nummer_eindeutig unique (owner_user_id, nummer)
);
create index if not exists sterbefall_idx on public.sterbefall (owner_user_id, status, sterbedatum);

-- TEIL 2 von 7: Checkliste, Kostenvoranschlag, Partner, eigene Checkliste
create table if not exists public.sterbefall_aufgabe (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  sterbefall_id   uuid not null references public.sterbefall(id) on delete cascade,
  titel           text not null check (char_length(titel) between 1 and 160),
  stelle          text check (stelle is null or char_length(stelle) <= 80),
  faellig_am      date,
  erledigt_am     timestamptz,
  erledigt_von    uuid,
  position        integer not null default 0,
  notiz           text check (notiz is null or char_length(notiz) <= 300),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists sterbefall_aufgabe_idx on public.sterbefall_aufgabe (owner_user_id, sterbefall_id, position);

create table if not exists public.sterbefall_posten (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  sterbefall_id     uuid not null references public.sterbefall(id) on delete cascade,
  art               text not null default 'leistung' check (art in ('leistung', 'ware', 'fremd', 'auslage')),
  leistung_id       uuid,
  bezeichnung       text not null check (char_length(bezeichnung) between 1 and 200),
  menge             numeric(10,2) not null default 1 check (menge > 0 and menge <= 10000),
  einheit           text not null default 'Stk' check (char_length(einheit) between 1 and 20),
  einzelpreis_netto numeric(10,2) not null default 0 check (einzelpreis_netto >= 0 and einzelpreis_netto <= 1000000),
  mwst_satz         numeric(4,1) not null default 19 check (mwst_satz in (0, 7, 19)),
  gesamt_netto      numeric(12,2) not null default 0,
  position          integer not null default 0,
  aktualisiert_am   timestamptz not null default now()
);
create index if not exists sterbefall_posten_idx on public.sterbefall_posten (owner_user_id, sterbefall_id, position);

create table if not exists public.sterbefall_partner (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  sterbefall_id    uuid not null references public.sterbefall(id) on delete cascade,
  rolle            text not null check (rolle in ('steinmetz', 'florist', 'trauerredner', 'pfarramt', 'musik', 'friedhof', 'krematorium', 'gaststaette', 'druckerei', 'sonstige')),
  name             text not null check (char_length(name) between 1 and 120),
  kontakt_id       uuid,
  netzwerk_betrieb uuid,
  telefon          text check (telefon is null or char_length(telefon) <= 40),
  termin_am        timestamptz,
  status           text not null default 'angefragt' check (status in ('angefragt', 'bestaetigt', 'erledigt', 'abgesagt')),
  notiz            text check (notiz is null or char_length(notiz) <= 300),
  aktualisiert_am  timestamptz not null default now()
);
create index if not exists sterbefall_partner_idx on public.sterbefall_partner (owner_user_id, sterbefall_id);

create table if not exists public.bestattung_aufgabe_vorlage (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  titel           text not null check (char_length(titel) between 1 and 160),
  stelle          text check (stelle is null or char_length(stelle) <= 80),
  tage_nach_tod   integer check (tage_nach_tod is null or tage_nach_tod between 0 and 365),
  nur_bei         text[] check (nur_bei is null or nur_bei <@ array['erd', 'feuer', 'see', 'baum', 'anonym', 'sonstige']::text[]),
  position        integer not null default 0,
  aktiv           boolean not null default true,
  aktualisiert_am timestamptz not null default now()
);
create index if not exists bestattung_aufgabe_vorlage_idx on public.bestattung_aufgabe_vorlage (owner_user_id, position);

-- TEIL 3 von 7: Wächter der Akte (Betrieb fest, Kontakt im Betrieb,
-- Nummer je Betrieb und Jahr — auch wenn zwei gleichzeitig anlegen)
create or replace function public.p352_akte_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_jahr text; v_n integer;
begin
  if tg_op = 'UPDATE' then
    if new.owner_user_id is distinct from old.owner_user_id then raise exception 'Der Betrieb einer Akte kann nicht geändert werden.'; end if;
    new.nummer := old.nummer;
    new.erstellt_von := old.erstellt_von;
    new.erstellt_am := old.erstellt_am;
  end if;
  new.aktualisiert_am := now();
  if new.kontakt_id is not null and (tg_op = 'INSERT' or new.kontakt_id is distinct from old.kontakt_id)
     and not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.owner_user_id = new.owner_user_id) then
    raise exception 'Der Kontakt gehört nicht zu Ihrem Betrieb.';
  end if;
  if tg_op = 'INSERT' then
    v_jahr := to_char(now() at time zone 'Europe/Berlin', 'YYYY');
    perform pg_advisory_xact_lock(hashtext('p352_nummer_' || new.owner_user_id::text));
    select coalesce(max(nullif(split_part(s.nummer, '-', 2), '')::integer), 0) + 1 into v_n
      from public.sterbefall s where s.owner_user_id = new.owner_user_id and s.nummer like v_jahr || '-%' and split_part(s.nummer, '-', 2) ~ '^[0-9]+$';
    new.nummer := v_jahr || '-' || lpad(v_n::text, 3, '0');
  end if;
  return new;
end;
$$;

-- TEIL 4 von 7: Wächter für Checkliste, Kostenvoranschlag, Partner, eigene Checkliste
create or replace function public.p352_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_status text;
begin
  if tg_op = 'UPDATE' and new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags kann nicht geändert werden.';
  end if;
  new.aktualisiert_am := now();
  if tg_table_name = 'bestattung_aufgabe_vorlage' then return new; end if;
  if tg_op = 'UPDATE' and new.sterbefall_id is distinct from old.sterbefall_id then
    raise exception 'Ein Eintrag wandert nicht in eine andere Akte.';
  end if;
  select s.status into v_status from public.sterbefall s where s.id = new.sterbefall_id and s.owner_user_id = new.owner_user_id;
  if v_status is null then raise exception 'Die Akte gehört nicht zu Ihrem Betrieb.'; end if;
  if tg_table_name = 'sterbefall_aufgabe' then
    if new.erledigt_am is not null and (tg_op = 'INSERT' or old.erledigt_am is null) then new.erledigt_von := auth.uid();
    elsif new.erledigt_am is null then new.erledigt_von := null;
    elsif tg_op = 'UPDATE' then new.erledigt_von := old.erledigt_von; end if;
  end if;
  if tg_table_name = 'sterbefall_posten' then
    if v_status in ('abgeschlossen', 'storniert') then raise exception 'Die Akte ist abgeschlossen — der Kostenvoranschlag bleibt, wie er ist.'; end if;
    if new.leistung_id is not null and (tg_op = 'INSERT' or new.leistung_id is distinct from old.leistung_id)
       and not exists (select 1 from public.leistungskatalog l where l.id = new.leistung_id and l.owner_user_id = new.owner_user_id) then
      raise exception 'Die Leistung gehört nicht zu Ihrem Betrieb.';
    end if;
    -- Auslagen für Dritte (z. B. Friedhofsgebühren) immer ohne Umsatzsteuer
    if new.art = 'auslage' then new.mwst_satz := 0; end if;
    new.gesamt_netto := round(new.menge * new.einzelpreis_netto, 2);
  end if;
  if tg_table_name = 'sterbefall_partner' then
    if new.kontakt_id is not null and (tg_op = 'INSERT' or new.kontakt_id is distinct from old.kontakt_id)
       and not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.owner_user_id = new.owner_user_id) then
      raise exception 'Der Kontakt gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.p352_posten_loeschwaechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from public.sterbefall s where s.id = old.sterbefall_id and s.status in ('abgeschlossen', 'storniert')) then
    raise exception 'Die Akte ist abgeschlossen — der Kostenvoranschlag bleibt, wie er ist.';
  end if;
  return old;
end;
$$;

-- TEIL 5 von 7: Auslöser und Rechte (Modul „bestattung")
do $$
declare
  t text;
begin
  foreach t in array array['sterbefall', 'sterbefall_aufgabe', 'sterbefall_posten', 'sterbefall_partner', 'bestattung_aufgabe_vorlage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop trigger if exists p352_waechter on public.%I', t);
    execute format('create trigger p352_waechter before insert or update on public.%I for each row execute function public.%I()', t,
      case when t = 'sterbefall' then 'p352_akte_waechter' else 'p352_waechter' end);
    execute format('drop policy if exists p352_owner_all on public.%I', t);
    execute format('create policy p352_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p352_ma_select on public.%I', t);
    execute format('create policy p352_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''bestattung'') or public.darf_ich_modul_aendern(''bestattung'')))', t);
    execute format('drop policy if exists p352_ma_insert on public.%I', t);
    execute format('create policy p352_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bestattung''))', t);
    execute format('drop policy if exists p352_ma_update on public.%I', t);
    execute format('create policy p352_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bestattung'')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bestattung''))', t);
  end loop;
end $$;

-- TEIL 6 von 7: Löschwächter Kostenvoranschlag
drop trigger if exists p352_loeschwaechter on public.sterbefall_posten;
create trigger p352_loeschwaechter before delete on public.sterbefall_posten
  for each row execute function public.p352_posten_loeschwaechter();

-- TEIL 7 von 7: KONTROLLE — Erwartung: tabellen = 5 | regeln = 20 | ausloeser = 11 | rls_an = 5
-- (regeln = 25 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('sterbefall', 'sterbefall_aufgabe', 'sterbefall_posten', 'sterbefall_partner', 'bestattung_aufgabe_vorlage')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('sterbefall', 'sterbefall_aufgabe', 'sterbefall_posten', 'sterbefall_partner', 'bestattung_aufgabe_vorlage')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.sterbefall'::regclass, 'public.sterbefall_aufgabe'::regclass, 'public.sterbefall_posten'::regclass, 'public.sterbefall_partner'::regclass, 'public.bestattung_aufgabe_vorlage'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('sterbefall', 'sterbefall_aufgabe', 'sterbefall_posten', 'sterbefall_partner', 'bestattung_aufgabe_vorlage') and relrowsecurity) as rls_an;
