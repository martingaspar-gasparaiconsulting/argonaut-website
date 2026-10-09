-- ============================================================================
-- ARGONAUT OS · Paket 291/292 (09.10.2026) · V1 Fahrzeugvermietung Kern
--
--   miet_fahrzeug      Mietflotte: Fahrzeug, Art, Preise (netto, in Cent),
--                      Frei-km, Mehr-km, Kaution, Mindestalter, Führerschein-
--                      Dauer und -Klasse, Zusatzfahrer, Nachtanken je Achtel
--   miet_einstellung   je Betrieb: eigene Mietbedingungen (Text), Kulanz-
--                      Minuten bei der Rückgabe
--   miet_buchung       Buchung = Mietvertrag: Mieter, Abholung/Rückgabe,
--                      Preise eingefroren, Kaution (nur Art, Status, Vorgangs-
--                      nummer des Zahlungsanbieters — NIE Kartendaten),
--                      Übergabe/Rückgabe mit km, Tank, Fotos
--                      KEINE DOPPELBUCHUNG: die Datenbank sperrt Überschneidungen
--                      je Fahrzeug (Fehler 23P01)
--   miet_fahrer        Haupt- und Zusatzfahrer mit Prüfvermerk OHNE
--                      Führerscheinnummer: Alter, Führerschein seit, Klasse,
--                      Ablauf — die Datenbank rechnet selbst nach
--   miet_schaden       Schäden je Fahrzeug (bei Übergabe, bei Rückgabe, sonst)
--   Speicher „vermietung" (privat, nur Bilder) für Übergabe-/Rückgabe-/Schadenfotos
--
-- Wächter in der Datenbank:
--   Übergabe nur mit geprüftem Hauptfahrer, ohne abgelehnten Fahrer, mit km,
--   Tank, Unterschrift-Vermerk und — wenn Kaution vereinbart — hinterlegter
--   Kaution; Rückgabe nur mit km Ende >= km Beginn und Tank; danach ist der
--   Vertrag gesperrt (nur Kaution, Rechnung, Notiz, weitere Fotos). Fotos
--   werden nach der Reservierung nur noch ergänzt, nie entfernt. Preise und
--   Kaution-Einbehalt nur der Chef. Prüfvermerke sind unveränderlich.
--
-- Rechte: Chef alles; Mitarbeiter mit Recht „Verleih" sehen, mit Schreibrecht
-- „Verleih" buchen, übergeben, zurücknehmen, Schäden und Fahrer erfassen.
-- Flotte, Preise, Mietbedingungen, Löschen nur der Chef.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur neue Tabellen, neue Funktionen, neuer Speicher.
-- ============================================================================

begin;

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------- Tabellen ---
create table if not exists public.miet_fahrzeug (
  id                     uuid primary key default gen_random_uuid(),
  owner_user_id          uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  fahrzeug_id            uuid,
  bezeichnung            text not null check (char_length(bezeichnung) between 2 and 120),
  kennzeichen            text check (kennzeichen is null or char_length(kennzeichen) <= 15),
  art                    text not null default 'pkw' check (art in ('pkw', 'transporter', 'wohnmobil', 'motorrad', 'ebike', 'luxus', 'lkw', 'anhaenger')),
  fs_klasse              text check (fs_klasse is null or fs_klasse ~ '^[A-Z0-9]{1,4}$'),
  tagessatz_cent         integer not null check (tagessatz_cent between 0 and 10000000),
  wochensatz_cent        integer check (wochensatz_cent is null or wochensatz_cent between 1 and 50000000),
  frei_km_tag            integer check (frei_km_tag is null or frei_km_tag between 0 and 10000),
  mehr_km_cent           integer not null default 0 check (mehr_km_cent between 0 and 100000),
  kaution_cent           integer not null default 0 check (kaution_cent between 0 and 100000000),
  mindestalter           integer not null default 18 check (mindestalter between 14 and 99),
  fs_jahre_min           integer not null default 0 check (fs_jahre_min between 0 and 30),
  zusatzfahrer_tag_cent  integer not null default 0 check (zusatzfahrer_tag_cent between 0 and 1000000),
  tank_achtel_cent       integer not null default 0 check (tank_achtel_cent between 0 and 1000000),
  km_stand               integer check (km_stand is null or km_stand between 0 and 5000000),
  aktiv                  boolean not null default true,
  notiz                  text check (notiz is null or char_length(notiz) <= 500),
  erstellt_am            timestamptz not null default now()
);
create index if not exists miet_fahrzeug_idx on public.miet_fahrzeug (owner_user_id, aktiv, bezeichnung);

create table if not exists public.miet_einstellung (
  owner_user_id    uuid primary key default coalesce(public.mein_chef_id(), auth.uid()),
  mietbedingungen  text check (mietbedingungen is null or char_length(mietbedingungen) <= 30000),
  kulanz_minuten   integer not null default 0 check (kulanz_minuten between 0 and 180),
  aktualisiert_am  timestamptz not null default now()
);

create table if not exists public.miet_buchung (
  id                     uuid primary key default gen_random_uuid(),
  owner_user_id          uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer                 text,
  fahrzeug_id            uuid not null references public.miet_fahrzeug(id) on delete restrict,
  kontakt_id             uuid,
  mieter_name            text not null check (char_length(mieter_name) between 2 and 120),
  mieter_anschrift       text check (mieter_anschrift is null or char_length(mieter_anschrift) <= 300),
  mieter_email           text check (mieter_email is null or char_length(mieter_email) <= 160),
  mieter_telefon         text check (mieter_telefon is null or char_length(mieter_telefon) <= 40),
  abholung               timestamptz not null,
  rueckgabe_plan         timestamptz not null,
  zeitraum               tstzrange generated always as (tstzrange(abholung, rueckgabe_plan, '[)')) stored,
  status                 text not null default 'reserviert' check (status in ('reserviert', 'uebergeben', 'zurueck', 'storniert')),
  -- eingefroren bei der Buchung (Vertragsinhalt)
  tagessatz_cent         integer not null default 0,
  wochensatz_cent        integer,
  frei_km_tag            integer,
  mehr_km_cent           integer not null default 0,
  kaution_cent           integer not null default 0,
  mindestalter           integer not null default 18,
  fs_jahre_min           integer not null default 0,
  fs_klasse              text,
  zusatzfahrer_tag_cent  integer not null default 0,
  tank_achtel_cent       integer not null default 0,
  -- Kaution: nur Art, Status, Vorgangsnummer — nie Kartendaten
  kaution_art            text not null default 'keine' check (kaution_art in ('keine', 'bar', 'ueberweisung', 'zahlungsanbieter')),
  kaution_status         text not null default 'offen' check (kaution_status in ('offen', 'hinterlegt', 'freigegeben', 'einbehalten')),
  kaution_referenz       text check (kaution_referenz is null or (char_length(kaution_referenz) <= 60 and kaution_referenz !~ '[0-9]([ -]?[0-9]){12,}')),
  kaution_einbehalt_cent integer not null default 0 check (kaution_einbehalt_cent >= 0),
  kaution_grund          text check (kaution_grund is null or char_length(kaution_grund) <= 300),
  -- Übergabe
  vertrag_unterschrieben boolean not null default false,
  bedingungen            text,
  uebergabe_am           timestamptz,
  km_start               integer check (km_start is null or km_start between 0 and 5000000),
  tank_start             smallint check (tank_start is null or tank_start between 0 and 8),
  fotos_uebergabe        text[] not null default '{}' check (cardinality(fotos_uebergabe) <= 30),
  -- Rückgabe
  rueckgabe_ist          timestamptz,
  km_ende                integer check (km_ende is null or km_ende between 0 and 5000000),
  tank_ende              smallint check (tank_ende is null or tank_ende between 0 and 8),
  fotos_rueckgabe        text[] not null default '{}' check (cardinality(fotos_rueckgabe) <= 30),
  rechnung_id            uuid,
  notiz                  text check (notiz is null or char_length(notiz) <= 1000),
  erstellt_am            timestamptz not null default now(),
  erstellt_von           uuid default auth.uid(),
  aktualisiert_am        timestamptz not null default now(),
  check (rueckgabe_plan > abholung and rueckgabe_plan - abholung <= interval '400 days'),
  check (km_ende is null or km_start is null or (km_ende >= km_start and km_ende - km_start <= 100000)),
  check (kaution_einbehalt_cent <= kaution_cent),
  unique (owner_user_id, nummer)
);
create index if not exists miet_buchung_idx on public.miet_buchung (owner_user_id, status, abholung);
create index if not exists miet_buchung_fz_idx on public.miet_buchung (fahrzeug_id, abholung);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'miet_buchung_keine_ueberschneidung') then
    alter table public.miet_buchung add constraint miet_buchung_keine_ueberschneidung
      exclude using gist (fahrzeug_id with =, zeitraum with &&) where (status in ('reserviert', 'uebergeben'));
  end if;
end $$;

create table if not exists public.miet_fahrer (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  buchung_id            uuid not null references public.miet_buchung(id) on delete cascade,
  rolle                 text not null default 'haupt' check (rolle in ('haupt', 'zusatz')),
  name                  text not null check (char_length(name) between 2 and 120),
  geburtsdatum          date not null,
  fs_erteilt_am         date not null,
  fs_klassen            text check (fs_klassen is null or fs_klassen ~ '^[A-Z0-9, ]{1,60}$'),
  fs_gueltig_bis        date,
  ausweis_abgeglichen   boolean not null default false,
  bemerkung             text check (bemerkung is null or (char_length(bemerkung) <= 200 and bemerkung !~* '(^|[^A-Z0-9])(?=[A-Z0-9]*[0-9])[A-Z0-9]{11}([^A-Z0-9]|$)')),
  alter_ok              boolean not null default false,
  dauer_ok              boolean not null default false,
  klasse_ok             boolean not null default false,
  dokument_ok           boolean not null default false,
  ergebnis              text not null default 'abgelehnt' check (ergebnis in ('ok', 'abgelehnt')),
  geprueft_am           timestamptz not null default now(),
  geprueft_von          uuid default auth.uid(),
  check (fs_erteilt_am >= geburtsdatum)
);
create unique index if not exists miet_fahrer_ein_haupt on public.miet_fahrer (buchung_id) where rolle = 'haupt';
create index if not exists miet_fahrer_idx on public.miet_fahrer (owner_user_id, buchung_id);

create table if not exists public.miet_schaden (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  fahrzeug_id   uuid not null references public.miet_fahrzeug(id) on delete cascade,
  buchung_id    uuid references public.miet_buchung(id) on delete set null,
  phase         text not null check (phase in ('uebergabe', 'rueckgabe', 'sonstig')),
  bereich       text not null check (bereich in ('vorne', 'hinten', 'links', 'rechts', 'dach', 'scheiben', 'felgen_reifen', 'innenraum', 'technik', 'sonstiges')),
  art           text not null check (art in ('kratzer', 'delle', 'steinschlag', 'riss', 'fehlt', 'verschmutzung', 'defekt', 'sonstiges')),
  beschreibung  text check (beschreibung is null or char_length(beschreibung) <= 500),
  fotos         text[] not null default '{}' check (cardinality(fotos) <= 10),
  behoben_am    date,
  erfasst_am    timestamptz not null default now(),
  erfasst_von   uuid default auth.uid()
);
create index if not exists miet_schaden_idx on public.miet_schaden (owner_user_id, fahrzeug_id, behoben_am);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='fahrzeuge' and column_name='id' and data_type='uuid')
     and not exists (select 1 from pg_constraint where conname='miet_fahrzeug_fuhrpark_fk') then
    alter table public.miet_fahrzeug add constraint miet_fahrzeug_fuhrpark_fk foreign key (fahrzeug_id) references public.fahrzeuge(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------- Wächter ---
create or replace function public.p291_buchung_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f public.miet_fahrzeug%rowtype;
  v_chef boolean := (auth.uid() is not null and auth.uid() = coalesce(new.owner_user_id, old.owner_user_id));
  v_n integer;
  v_frei jsonb := '["kaution_art","kaution_status","kaution_referenz","kaution_einbehalt_cent","kaution_grund","rechnung_id","notiz","fotos_rueckgabe","aktualisiert_am","zeitraum"]'::jsonb;
  k text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'reserviert' then
      raise exception 'Eine neue Buchung beginnt immer als Reservierung.';
    end if;
    select * into f from public.miet_fahrzeug m where m.id = new.fahrzeug_id;
    if not found or f.owner_user_id <> new.owner_user_id then
      raise exception 'Das Fahrzeug gehört nicht zu diesem Betrieb.';
    end if;
    if not f.aktiv then
      raise exception 'Das Fahrzeug ist nicht mehr in der Mietflotte.';
    end if;
    -- Preise und Bedingungen aus der Flotte einfrieren (der Browser bestimmt sie nicht)
    new.tagessatz_cent := f.tagessatz_cent; new.wochensatz_cent := f.wochensatz_cent;
    new.frei_km_tag := f.frei_km_tag; new.mehr_km_cent := f.mehr_km_cent; new.kaution_cent := f.kaution_cent;
    new.mindestalter := f.mindestalter; new.fs_jahre_min := f.fs_jahre_min; new.fs_klasse := f.fs_klasse;
    new.zusatzfahrer_tag_cent := f.zusatzfahrer_tag_cent; new.tank_achtel_cent := f.tank_achtel_cent;
    new.kaution_status := 'offen'; new.kaution_einbehalt_cent := 0; new.vertrag_unterschrieben := false; new.bedingungen := null;
    new.uebergabe_am := null; new.km_start := null; new.tank_start := null; new.rueckgabe_ist := null; new.km_ende := null; new.tank_ende := null;
    new.rechnung_id := null; new.erstellt_am := now(); new.erstellt_von := auth.uid(); new.aktualisiert_am := now();
    -- Vertragsnummer MV-JJJJ-0001 je Betrieb und Jahr
    perform pg_advisory_xact_lock(hashtext('miet_buchung:' || new.owner_user_id::text));
    select coalesce(max(substring(b.nummer from 9)::integer), 0) + 1 into v_n from public.miet_buchung b
     where b.owner_user_id = new.owner_user_id and b.nummer ~ ('^MV-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-[0-9]+$');
    new.nummer := 'MV-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-' || lpad(v_n::text, 4, '0');
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status not in ('reserviert', 'storniert') or old.rechnung_id is not null then
      raise exception 'Übergebene oder abgerechnete Mietverträge bleiben erhalten — bitte stornieren statt löschen.';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.owner_user_id <> old.owner_user_id or new.nummer is distinct from old.nummer or new.erstellt_am <> old.erstellt_am
     or new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Nummer, Besitzer und Anlage einer Buchung sind unveränderlich.';
  end if;
  new.aktualisiert_am := now();

  -- Fotos werden nach der Reservierung nur ergänzt, nie entfernt
  if old.status <> 'reserviert' and not (new.fotos_uebergabe @> old.fotos_uebergabe) then
    raise exception 'Fotos der Übergabe sind ein Nachweis und lassen sich nicht mehr entfernen.';
  end if;
  if not (new.fotos_rueckgabe @> old.fotos_rueckgabe) and old.status in ('zurueck') then
    raise exception 'Fotos der Rückgabe sind ein Nachweis und lassen sich nicht mehr entfernen.';
  end if;

  -- Abgeschlossene Verträge: nur Kaution, Rechnung, Notiz, weitere Rückgabe-Fotos
  if old.status in ('zurueck', 'storniert') then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if not (v_frei ? k) and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'Der Mietvertrag ist abgeschlossen — „%" lässt sich nicht mehr ändern.', k;
      end if;
    end loop;
  end if;

  -- Preise, Kaution-Höhe und Bedingungen: nur der Chef und nur vor der Übergabe
  if (new.tagessatz_cent, new.wochensatz_cent, new.frei_km_tag, new.mehr_km_cent, new.kaution_cent, new.mindestalter,
      new.fs_jahre_min, new.fs_klasse, new.zusatzfahrer_tag_cent, new.tank_achtel_cent)
     is distinct from
     (old.tagessatz_cent, old.wochensatz_cent, old.frei_km_tag, old.mehr_km_cent, old.kaution_cent, old.mindestalter,
      old.fs_jahre_min, old.fs_klasse, old.zusatzfahrer_tag_cent, old.tank_achtel_cent) then
    if not v_chef or old.status <> 'reserviert' then
      raise exception 'Preise und Mietbedingungen ändert nur der Chef, und nur vor der Übergabe.';
    end if;
  end if;
  if new.fahrzeug_id <> old.fahrzeug_id and old.status <> 'reserviert' then
    raise exception 'Nach der Übergabe lässt sich das Fahrzeug nicht mehr tauschen.';
  end if;
  if new.abholung <> old.abholung and old.status <> 'reserviert' then
    raise exception 'Nach der Übergabe lässt sich die Abholzeit nicht mehr ändern.';
  end if;

  -- Kaution einbehalten nur der Chef, mit Grund
  if (new.kaution_status = 'einbehalten' and old.kaution_status <> 'einbehalten') or new.kaution_einbehalt_cent <> old.kaution_einbehalt_cent then
    if not v_chef then
      raise exception 'Eine Kaution einbehalten darf nur der Chef.';
    end if;
    if coalesce(char_length(trim(new.kaution_grund)), 0) < 5 then
      raise exception 'Bitte den Grund für den Einbehalt angeben (mindestens 5 Zeichen).';
    end if;
  end if;
  if new.kaution_status = 'einbehalten' and new.kaution_einbehalt_cent <= 0 then
    raise exception 'Bitte den einbehaltenen Betrag angeben.';
  end if;

  -- Statuswechsel
  if new.status <> old.status then
    if not ((old.status = 'reserviert' and new.status in ('uebergeben', 'storniert'))
         or (old.status = 'uebergeben' and new.status = 'zurueck')) then
      raise exception 'Dieser Statuswechsel ist nicht möglich (% → %).', old.status, new.status;
    end if;
    if new.status = 'uebergeben' then
      if new.km_ende is not null or new.tank_ende is not null or new.rueckgabe_ist is not null then
        raise exception 'Rückgabe-Werte werden mit der Rückgabe gespeichert.';
      end if;
      if not exists (select 1 from public.miet_fahrer x where x.buchung_id = new.id and x.rolle = 'haupt' and x.ergebnis = 'ok') then
        raise exception 'Übergabe erst nach geprüftem Hauptfahrer (Alter, Führerschein-Dauer, Klasse, Gültigkeit).';
      end if;
      if exists (select 1 from public.miet_fahrer x where x.buchung_id = new.id and x.ergebnis <> 'ok') then
        raise exception 'Ein Fahrer erfüllt die Bedingungen nicht — bitte vor der Übergabe aus dem Vertrag nehmen.';
      end if;
      if new.km_start is null or new.tank_start is null then
        raise exception 'Bitte km-Stand und Tank bei der Übergabe eintragen.';
      end if;
      if coalesce(char_length(trim(new.mieter_anschrift)), 0) < 5 then
        raise exception 'Bitte die Anschrift des Mieters eintragen.';
      end if;
      if not new.vertrag_unterschrieben then
        raise exception 'Bitte bestätigen, dass der Mieter den Mietvertrag unterschrieben hat.';
      end if;
      if new.kaution_cent > 0 and new.kaution_status <> 'hinterlegt' then
        raise exception 'Die vereinbarte Kaution ist noch nicht hinterlegt.';
      end if;
      new.uebergabe_am := coalesce(new.uebergabe_am, now());
      select e.mietbedingungen into new.bedingungen from public.miet_einstellung e where e.owner_user_id = new.owner_user_id;
    end if;
    if new.status = 'zurueck' then
      if new.km_ende is null or new.tank_ende is null then
        raise exception 'Bitte km-Stand und Tank bei der Rückgabe eintragen.';
      end if;
      if new.km_ende < new.km_start then
        raise exception 'Der km-Stand bei der Rückgabe ist kleiner als bei der Übergabe.';
      end if;
      new.rueckgabe_ist := coalesce(new.rueckgabe_ist, now());
      if new.rueckgabe_ist <= new.uebergabe_am then
        raise exception 'Die Rückgabe liegt vor der Übergabe.';
      end if;
    end if;
  elsif old.status = 'reserviert' then
    if (new.km_start, new.tank_start, new.uebergabe_am, new.km_ende, new.tank_ende, new.rueckgabe_ist, new.bedingungen)
       is distinct from (old.km_start, old.tank_start, old.uebergabe_am, old.km_ende, old.tank_ende, old.rueckgabe_ist, old.bedingungen) then
      raise exception 'Übergabe-Werte werden mit der Übergabe gespeichert.';
    end if;
  elsif old.status = 'uebergeben' then
    if (new.km_start, new.tank_start, new.uebergabe_am, new.bedingungen, new.vertrag_unterschrieben)
       is distinct from (old.km_start, old.tank_start, old.uebergabe_am, old.bedingungen, old.vertrag_unterschrieben) then
      raise exception 'Die Übergabe ist festgehalten und lässt sich nicht mehr ändern.';
    end if;
    if (new.km_ende, new.tank_ende, new.rueckgabe_ist) is distinct from (old.km_ende, old.tank_ende, old.rueckgabe_ist) then
      raise exception 'Rückgabe-Werte werden mit der Rückgabe gespeichert.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists p291_buchung_waechter_trg on public.miet_buchung;
create trigger p291_buchung_waechter_trg before insert or update or delete on public.miet_buchung
  for each row execute function public.p291_buchung_waechter();
revoke all on function public.p291_buchung_waechter() from public, anon, authenticated;

-- km-Stand der Flotte nach der Rückgabe nachziehen (Mitarbeiter dürfen die Flotte sonst nicht ändern)
create or replace function public.p291_km_nachziehen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'zurueck' and old.status = 'uebergeben' then
    update public.miet_fahrzeug m set km_stand = greatest(coalesce(m.km_stand, 0), new.km_ende)
     where m.id = new.fahrzeug_id and m.owner_user_id = new.owner_user_id;
  end if;
  return null;
end;
$$;
drop trigger if exists p291_km_nachziehen_trg on public.miet_buchung;
create trigger p291_km_nachziehen_trg after update on public.miet_buchung
  for each row execute function public.p291_km_nachziehen();
revoke all on function public.p291_km_nachziehen() from public, anon, authenticated;

-- Prüfvermerk Fahrer: die Datenbank rechnet Alter, Dauer, Klasse, Gültigkeit selbst
create or replace function public.p291_fahrer_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.miet_buchung%rowtype;
  v_tag date;
  v_ende date;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Ein Prüfvermerk ist ein Nachweis und lässt sich nicht ändern — bei Fehlern löschen und neu prüfen (nur vor der Übergabe).';
  end if;
  if tg_op = 'DELETE' then
    select * into b from public.miet_buchung x where x.id = old.buchung_id;
    if found and b.status <> 'reserviert' then
      raise exception 'Nach der Übergabe bleiben die Fahrer im Mietvertrag.';
    end if;
    return old;
  end if;
  select * into b from public.miet_buchung x where x.id = new.buchung_id;
  if not found or b.owner_user_id <> new.owner_user_id then
    raise exception 'Die Buchung gehört nicht zu diesem Betrieb.';
  end if;
  if b.status not in ('reserviert', 'uebergeben') then
    raise exception 'Fahrer lassen sich nur bei offenen Mietverträgen eintragen.';
  end if;
  if new.rolle = 'haupt' and b.status <> 'reserviert' then
    raise exception 'Der Hauptfahrer steht mit der Übergabe fest.';
  end if;
  v_tag := (b.abholung at time zone 'Europe/Berlin')::date;
  v_ende := (b.rueckgabe_plan at time zone 'Europe/Berlin')::date;
  new.alter_ok := extract(year from age(v_tag, new.geburtsdatum)) >= b.mindestalter;
  new.dauer_ok := extract(year from age(v_tag, new.fs_erteilt_am)) >= b.fs_jahre_min and new.fs_erteilt_am <= v_tag;
  new.klasse_ok := b.fs_klasse is null
    or b.fs_klasse = any (string_to_array(replace(coalesce(new.fs_klassen, ''), ' ', ''), ','));
  new.dokument_ok := new.ausweis_abgeglichen and (new.fs_gueltig_bis is null or new.fs_gueltig_bis >= v_ende);
  new.ergebnis := case when new.alter_ok and new.dauer_ok and new.klasse_ok and new.dokument_ok then 'ok' else 'abgelehnt' end;
  new.geprueft_am := now();
  new.geprueft_von := auth.uid();
  return new;
end;
$$;
drop trigger if exists p291_fahrer_waechter_trg on public.miet_fahrer;
create trigger p291_fahrer_waechter_trg before insert or update or delete on public.miet_fahrer
  for each row execute function public.p291_fahrer_waechter();
revoke all on function public.p291_fahrer_waechter() from public, anon, authenticated;

-- Schaden gehört zum Fahrzeug des Betriebs; Fotos nur ergänzen
create or replace function public.p291_schaden_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.miet_fahrzeug m where m.id = new.fahrzeug_id and m.owner_user_id = new.owner_user_id) then
    raise exception 'Das Fahrzeug gehört nicht zu diesem Betrieb.';
  end if;
  if new.buchung_id is not null and not exists (select 1 from public.miet_buchung b where b.id = new.buchung_id and b.owner_user_id = new.owner_user_id and b.fahrzeug_id = new.fahrzeug_id) then
    raise exception 'Die Buchung passt nicht zu diesem Fahrzeug.';
  end if;
  if tg_op = 'UPDATE' then
    if (new.fahrzeug_id, new.buchung_id, new.phase, new.bereich, new.art, new.beschreibung, new.erfasst_am, new.erfasst_von)
       is distinct from (old.fahrzeug_id, old.buchung_id, old.phase, old.bereich, old.art, old.beschreibung, old.erfasst_am, old.erfasst_von)
       or not (new.fotos @> old.fotos) then
      raise exception 'Ein erfasster Schaden lässt sich nur als behoben markieren oder um Fotos ergänzen.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists p291_schaden_waechter_trg on public.miet_schaden;
create trigger p291_schaden_waechter_trg before insert or update on public.miet_schaden
  for each row execute function public.p291_schaden_waechter();
revoke all on function public.p291_schaden_waechter() from public, anon, authenticated;

-- ----------------------------------------------------------------- Regeln ---
alter table public.miet_fahrzeug enable row level security;
alter table public.miet_einstellung enable row level security;
alter table public.miet_buchung enable row level security;
alter table public.miet_fahrer enable row level security;
alter table public.miet_schaden enable row level security;

drop policy if exists mfz_chef_all on public.miet_fahrzeug;
create policy mfz_chef_all on public.miet_fahrzeug for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists mfz_ma_select on public.miet_fahrzeug;
create policy mfz_ma_select on public.miet_fahrzeug for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('verleih') or public.darf_ich_modul_aendern('verleih')));

drop policy if exists mei_chef_all on public.miet_einstellung;
create policy mei_chef_all on public.miet_einstellung for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists mei_ma_select on public.miet_einstellung;
create policy mei_ma_select on public.miet_einstellung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('verleih') or public.darf_ich_modul_aendern('verleih')));

drop policy if exists mbu_chef_all on public.miet_buchung;
create policy mbu_chef_all on public.miet_buchung for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists mbu_ma_select on public.miet_buchung;
create policy mbu_ma_select on public.miet_buchung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('verleih') or public.darf_ich_modul_aendern('verleih')));
drop policy if exists mbu_ma_insert on public.miet_buchung;
create policy mbu_ma_insert on public.miet_buchung for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'));
drop policy if exists mbu_ma_update on public.miet_buchung;
create policy mbu_ma_update on public.miet_buchung for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'));

drop policy if exists mfa_chef_all on public.miet_fahrer;
create policy mfa_chef_all on public.miet_fahrer for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists mfa_ma_select on public.miet_fahrer;
create policy mfa_ma_select on public.miet_fahrer for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('verleih') or public.darf_ich_modul_aendern('verleih')));
drop policy if exists mfa_ma_insert on public.miet_fahrer;
create policy mfa_ma_insert on public.miet_fahrer for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'));

drop policy if exists msc_chef_all on public.miet_schaden;
create policy msc_chef_all on public.miet_schaden for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists msc_ma_select on public.miet_schaden;
create policy msc_ma_select on public.miet_schaden for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('verleih') or public.darf_ich_modul_aendern('verleih')));
drop policy if exists msc_ma_insert on public.miet_schaden;
create policy msc_ma_insert on public.miet_schaden for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'));

-- ---------------------------------------------------------------- Speicher ---
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vermietung', 'vermietung', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vermietung_select on storage.objects;
create policy vermietung_select on storage.objects for select to authenticated
  using (bucket_id = 'vermietung'
    and (storage.foldername(name))[1] = coalesce(public.mein_chef_id(), auth.uid())::text
    and (public.mein_chef_id() is null or public.darf_ich_modul_sehen('verleih') or public.darf_ich_modul_aendern('verleih')));
drop policy if exists vermietung_insert on storage.objects;
create policy vermietung_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vermietung'
    and (storage.foldername(name))[1] = coalesce(public.mein_chef_id(), auth.uid())::text
    and (public.mein_chef_id() is null or public.darf_ich_modul_aendern('verleih')));
drop policy if exists vermietung_delete on storage.objects;
create policy vermietung_delete on storage.objects for delete to authenticated
  using (bucket_id = 'vermietung' and (storage.foldername(name))[1] = auth.uid()::text and public.mein_chef_id() is null);

commit;

-- KONTROLLE (nur lesen) — Erwartung: 5 | 14 | 4 | 1 | 3 | t
select (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('miet_fahrzeug', 'miet_einstellung', 'miet_buchung', 'miet_fahrer', 'miet_schaden')) as tabellen,
       (select count(*) from pg_policies where schemaname = 'public'
          and tablename in ('miet_fahrzeug', 'miet_einstellung', 'miet_buchung', 'miet_fahrer', 'miet_schaden')) as regeln,
       (select count(*) from pg_trigger where tgname in ('p291_buchung_waechter_trg', 'p291_km_nachziehen_trg', 'p291_fahrer_waechter_trg', 'p291_schaden_waechter_trg')) as waechter,
       (select count(*) from pg_constraint where conname = 'miet_buchung_keine_ueberschneidung') as doppelbuchung_sperre,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'vermietung_%') as speicher_regeln,
       (select public = false from storage.buckets where id = 'vermietung') as ordner_privat;
