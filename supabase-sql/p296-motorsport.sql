-- ============================================================================
-- ARGONAUT OS · Paket 296 (09.10.2026) · T1 Trackday, Rennschule, Kartbahn
--
--   ms_event        Veranstaltung (Trackday, Rennschule, Kartbahn, Fahrer-
--                   training): Strecke, Beginn/Ende, Mindestalter, Führer-
--                   schein- und Fahrerbesprechungs-Pflicht, Haftungsverzicht
--                   als EIGENER Text des Betriebs (kein Mustertext). Sobald
--                   der erste Verzicht zur Unterschrift ging, ist der Text fest.
--   ms_gruppe       Startgruppen mit Startplätzen und Startgeld (netto, Cent).
--   ms_teilnehmer   Anmeldung: Gruppe (Startplätze zählt die Datenbank),
--                   Startnummer (je Event einmalig), eigenes Fahrzeug oder
--                   Leihfahrzeug aus der Mietflotte (V1) — ein Leihfahrzeug
--                   ist nie doppelt vergeben und nie gleichzeitig vermietet.
--                   Haftungsverzicht über das Signatur-Modul (Token). Die
--                   Startfreigabe setzt die Datenbank nur, wenn der Verzicht
--                   unterschrieben ist und die Haken (Alter, Führerschein,
--                   Fahrerbesprechung) gesetzt sind. Minderjährige: der
--                   Verzicht geht an die sorgeberechtigte Person.
--   ms_gast         Sponsoren, Gäste, Presse, Helfer — Bereich Tribüne,
--                   Fahrerlager oder Boxengasse; Boxengasse nur mit
--                   unterschriebenem Verzicht akkreditierbar.
--   ms_teil         Teile mit Laufzeit je Leihfahrzeug (Stunden oder Runden,
--                   Grenze, Laufzeit beim Einbau, Tausch).
--   ms_einsatz      Laufzeit-Buchungen je Leihfahrzeug (Stunden, Runden),
--                   optional einem Event zugeordnet.
--   miet_buchung    + Wächter p296_miet_event_sperre: Eine Vermietung, die mit
--                   einem Event-Einsatz desselben Fahrzeugs kollidiert, lehnt
--                   die Datenbank ab (bestehende Regeln bleiben unverändert).
--   miet_fahrzeug   Fahrzeug-Arten + „kart" und „rennfahrzeug" (Liste nur
--                   erweitert, nichts entfernt).
--
-- Rechte: Chef alles; Mitarbeiter mit Recht „Veranstaltungen" sehen, mit
-- Schreibrecht anlegen und ändern. Löschen nur der Chef. Rechnung über
-- „Darf abrechnen" (app/api/rechnung-aus-trackday).
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — sechs neue Tabellen, ein zusätzlicher Wächter an
-- miet_buchung (greift nur, wenn ein Fahrzeug einem Event zugeordnet ist),
-- erweiterte Art-Liste an miet_fahrzeug.
-- ============================================================================

begin;

-- ---------------------------------------------- Fahrzeug-Arten erweitern ---
-- Jede bisherige Art-Prüfung (egal unter welchem Namen) wird durch die erweiterte ersetzt.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.miet_fahrzeug'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%anhaenger%' loop
    execute format('alter table public.miet_fahrzeug drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.miet_fahrzeug add constraint miet_fahrzeug_art_check
  check (art in ('pkw', 'transporter', 'wohnmobil', 'motorrad', 'ebike', 'luxus', 'lkw', 'anhaenger', 'kart', 'rennfahrzeug'));

-- --------------------------------------------------------------- Event ---
create table if not exists public.ms_event (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  art                   text not null default 'trackday' check (art in ('trackday', 'rennschule', 'kart', 'fahrertraining', 'sonstiges')),
  titel                 text not null check (char_length(titel) between 3 and 160),
  strecke               text check (strecke is null or char_length(strecke) <= 160),
  beginn                timestamptz not null,
  ende                  timestamptz not null,
  status                text not null default 'geplant' check (status in ('geplant', 'offen', 'abgesagt', 'beendet')),
  mindestalter          integer not null default 18 check (mindestalter between 0 and 99),
  fuehrerschein_pflicht boolean not null default true,
  briefing_pflicht      boolean not null default true,
  verzicht_text         text check (verzicht_text is null or char_length(verzicht_text) <= 20000),
  verzicht_fest         boolean not null default false,
  notiz                 text check (notiz is null or char_length(notiz) <= 1000),
  erstellt_am           timestamptz not null default now(),
  erstellt_von          uuid default auth.uid(),
  aktualisiert_am       timestamptz not null default now(),
  check (ende > beginn and ende <= beginn + interval '14 days')
);
create index if not exists ms_event_idx on public.ms_event (owner_user_id, beginn desc);

-- -------------------------------------------------------------- Gruppe ---
create table if not exists public.ms_gruppe (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  event_id              uuid not null references public.ms_event(id) on delete cascade,
  name                  text not null check (char_length(name) between 2 and 60),
  startplaetze          integer not null check (startplaetze between 1 and 500),
  startgeld_netto_cent  integer not null default 0 check (startgeld_netto_cent between 0 and 10000000),
  reihenfolge           integer not null default 0 check (reihenfolge between 0 and 99),
  erstellt_am           timestamptz not null default now(),
  unique (event_id, name)
);
create index if not exists ms_gruppe_idx on public.ms_gruppe (event_id, reihenfolge);

-- ---------------------------------------------------------- Teilnehmer ---
create table if not exists public.ms_teilnehmer (
  id                      uuid primary key default gen_random_uuid(),
  owner_user_id           uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  event_id                uuid not null references public.ms_event(id) on delete restrict,
  gruppe_id               uuid not null references public.ms_gruppe(id) on delete restrict,
  status                  text not null default 'angemeldet' check (status in ('angemeldet', 'bestaetigt', 'warteliste', 'freigegeben', 'teilgenommen', 'storniert')),
  name                    text not null check (char_length(name) between 2 and 120),
  email                   text check (email is null or char_length(email) <= 160),
  telefon                 text check (telefon is null or char_length(telefon) <= 40),
  kontakt_id              uuid,
  minderjaehrig           boolean not null default false,
  sorgeberechtigt_name    text check (sorgeberechtigt_name is null or char_length(sorgeberechtigt_name) between 2 and 120),
  startnummer             integer check (startnummer is null or startnummer between 1 and 9999),
  fahrzeug_art            text not null default 'eigen' check (fahrzeug_art in ('eigen', 'leih')),
  eigenes_fahrzeug        text check (eigenes_fahrzeug is null or char_length(eigenes_fahrzeug) <= 120),
  miet_fahrzeug_id        uuid references public.miet_fahrzeug(id) on delete restrict,
  startgeld_netto_cent    integer not null default 0 check (startgeld_netto_cent between 0 and 10000000),
  leih_netto_cent         integer not null default 0 check (leih_netto_cent between 0 and 10000000),
  alter_geprueft          boolean not null default false,
  fuehrerschein_geprueft  boolean not null default false,
  briefing                boolean not null default false,
  verzicht_token          text check (verzicht_token is null or char_length(verzicht_token) between 8 and 80),
  verzicht_gesendet_am    timestamptz,
  freigabe_am             timestamptz,
  freigabe_von            uuid,
  rechnung_id             uuid,
  notiz                   text check (notiz is null or char_length(notiz) <= 1000),
  erstellt_am             timestamptz not null default now(),
  erstellt_von            uuid default auth.uid(),
  aktualisiert_am         timestamptz not null default now(),
  check (not minderjaehrig or sorgeberechtigt_name is not null),
  check ((fahrzeug_art = 'leih') = (miet_fahrzeug_id is not null)),
  check (fahrzeug_art = 'leih' or leih_netto_cent = 0)
);
create index if not exists ms_teilnehmer_idx on public.ms_teilnehmer (event_id, status);
create index if not exists ms_teilnehmer_gruppe_idx on public.ms_teilnehmer (gruppe_id);
create index if not exists ms_teilnehmer_leih_idx on public.ms_teilnehmer (miet_fahrzeug_id) where miet_fahrzeug_id is not null;
create unique index if not exists ms_teilnehmer_startnr_uq on public.ms_teilnehmer (event_id, startnummer) where startnummer is not null and status <> 'storniert';
create unique index if not exists ms_teilnehmer_leih_uq on public.ms_teilnehmer (event_id, miet_fahrzeug_id) where miet_fahrzeug_id is not null and status not in ('storniert', 'warteliste');
create unique index if not exists ms_teilnehmer_token_uq on public.ms_teilnehmer (verzicht_token) where verzicht_token is not null;

-- ------------------------------------------------ Sponsoren und Gäste ---
create table if not exists public.ms_gast (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  event_id              uuid not null references public.ms_event(id) on delete cascade,
  art                   text not null default 'gast' check (art in ('sponsor', 'gast', 'presse', 'helfer')),
  name                  text not null check (char_length(name) between 2 and 120),
  firma                 text check (firma is null or char_length(firma) <= 160),
  email                 text check (email is null or char_length(email) <= 160),
  personen              integer not null default 1 check (personen between 1 and 50),
  bereich               text not null default 'tribuene' check (bereich in ('tribuene', 'fahrerlager', 'boxengasse')),
  leistung              text check (leistung is null or char_length(leistung) <= 500),
  betrag_netto_cent     integer check (betrag_netto_cent is null or betrag_netto_cent between 0 and 100000000),
  verzicht_token        text check (verzicht_token is null or char_length(verzicht_token) between 8 and 80),
  akkreditiert_am       timestamptz,
  akkreditiert_von      uuid,
  notiz                 text check (notiz is null or char_length(notiz) <= 1000),
  erstellt_am           timestamptz not null default now(),
  erstellt_von          uuid default auth.uid()
);
create index if not exists ms_gast_idx on public.ms_gast (event_id, art);
create unique index if not exists ms_gast_token_uq on public.ms_gast (verzicht_token) where verzicht_token is not null;

-- ------------------------------------------------- Teile mit Laufzeit ---
create table if not exists public.ms_teil (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  miet_fahrzeug_id      uuid not null references public.miet_fahrzeug(id) on delete cascade,
  bezeichnung           text not null check (char_length(bezeichnung) between 2 and 80),
  kategorie             text not null default 'sonstiges' check (kategorie in ('motor', 'reifen', 'bremse', 'kette', 'kupplung', 'fahrwerk', 'sicherheit', 'sonstiges')),
  seriennummer          text check (seriennummer is null or char_length(seriennummer) <= 60),
  einheit               text not null default 'stunden' check (einheit in ('stunden', 'runden')),
  grenze                numeric(9,2) not null check (grenze > 0 and grenze <= 100000),
  startwert             numeric(9,2) not null default 0 check (startwert >= 0 and startwert <= 100000),
  eingebaut_am          date not null default ((now() at time zone 'Europe/Berlin')::date),
  ausgebaut_am          date,
  notiz                 text check (notiz is null or char_length(notiz) <= 500),
  erstellt_am           timestamptz not null default now(),
  erstellt_von          uuid default auth.uid(),
  check (ausgebaut_am is null or ausgebaut_am >= eingebaut_am)
);
create index if not exists ms_teil_idx on public.ms_teil (owner_user_id, miet_fahrzeug_id) where ausgebaut_am is null;

create table if not exists public.ms_einsatz (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  miet_fahrzeug_id      uuid not null references public.miet_fahrzeug(id) on delete cascade,
  event_id              uuid references public.ms_event(id) on delete set null,
  datum                 date not null default ((now() at time zone 'Europe/Berlin')::date),
  stunden               numeric(6,2) not null default 0 check (stunden >= 0 and stunden <= 48),
  runden                integer not null default 0 check (runden between 0 and 5000),
  notiz                 text check (notiz is null or char_length(notiz) <= 300),
  erstellt_am           timestamptz not null default now(),
  erstellt_von          uuid default auth.uid(),
  check (stunden > 0 or runden > 0)
);
create index if not exists ms_einsatz_idx on public.ms_einsatz (miet_fahrzeug_id, datum);

-- ---------------------------------------- Hilfe: Leihfahrzeug belegt? ---
-- Liefert einen lesbaren Grund, wenn das Fahrzeug im Zeitraum vermietet oder
-- in einem anderen Event vergeben ist; sonst null.
create or replace function public.p296_leih_konflikt(p_fahrzeug uuid, p_beginn timestamptz, p_ende timestamptz, p_event uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select 'Das Leihfahrzeug ist in diesem Zeitraum vermietet (Vertrag ' || coalesce(b.nummer, '—') || ').'
       from public.miet_buchung b
      where b.fahrzeug_id = p_fahrzeug and b.status in ('reserviert', 'uebergeben')
        and tstzrange(b.abholung, b.rueckgabe_plan, '[)') && tstzrange(p_beginn, p_ende, '[)')
      limit 1),
    (select 'Das Leihfahrzeug ist zur selben Zeit im Event „' || e.titel || '“ vergeben.'
       from public.ms_teilnehmer t join public.ms_event e on e.id = t.event_id
      where t.miet_fahrzeug_id = p_fahrzeug and t.event_id <> p_event
        and t.status not in ('storniert', 'warteliste') and e.status <> 'abgesagt'
        and tstzrange(e.beginn, e.ende, '[)') && tstzrange(p_beginn, p_ende, '[)')
      limit 1)
  );
$$;
revoke all on function public.p296_leih_konflikt(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- Unterschrieben? (Signatur-Modul, gleicher Betrieb)
create or replace function public.p296_signiert(p_token text, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.signatur_anfragen s where s.token = p_token and s.owner_user_id = p_owner and s.status = 'signiert');
$$;
revoke all on function public.p296_signiert(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------- Wächter: Event ---
create or replace function public.p296_event_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grund text;
  r record;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.ms_teilnehmer t where t.event_id = old.id) then
      raise exception 'Das Event hat Teilnehmer und bleibt erhalten — setzen Sie es auf „abgesagt“.';
    end if;
    return old;
  end if;
  new.titel := btrim(new.titel);
  new.aktualisiert_am := now();
  if tg_op = 'INSERT' then
    new.erstellt_am := now(); new.erstellt_von := auth.uid(); new.verzicht_fest := false;
    if new.status not in ('geplant', 'offen') then new.status := 'geplant'; end if;
    return new;
  end if;
  if (new.owner_user_id, new.erstellt_am) is distinct from (old.owner_user_id, old.erstellt_am) or new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Besitzer und Anlage eines Events sind unveränderlich.';
  end if;
  if old.verzicht_fest then
    if new.verzicht_text is distinct from old.verzicht_text then
      raise exception 'Der Haftungsverzicht wurde bereits zur Unterschrift versendet — der Text bleibt für dieses Event so.';
    end if;
    new.verzicht_fest := true;
  end if;
  if old.status in ('abgesagt', 'beendet') and (new.status, new.beginn, new.ende, new.art, new.titel, new.strecke, new.mindestalter, new.fuehrerschein_pflicht, new.briefing_pflicht)
     is distinct from (old.status, old.beginn, old.ende, old.art, old.titel, old.strecke, old.mindestalter, old.fuehrerschein_pflicht, old.briefing_pflicht) then
    raise exception 'Das Event ist % und bleibt so.', old.status;
  end if;
  if new.status <> old.status and not (
       (old.status = 'geplant' and new.status in ('offen', 'abgesagt', 'beendet'))
    or (old.status = 'offen' and new.status in ('geplant', 'abgesagt', 'beendet'))) then
    raise exception 'Dieser Statuswechsel ist nicht möglich (% → %).', old.status, new.status;
  end if;
  -- Pflichten nicht nachträglich lockern, wenn schon Teilnehmer freigegeben sind
  if exists (select 1 from public.ms_teilnehmer t where t.event_id = old.id and t.status in ('freigegeben', 'teilgenommen'))
     and (new.mindestalter < old.mindestalter or (old.fuehrerschein_pflicht and not new.fuehrerschein_pflicht) or (old.briefing_pflicht and not new.briefing_pflicht)) then
    raise exception 'Es sind schon Teilnehmer freigegeben — Mindestalter und Pflichten lassen sich nicht mehr lockern.';
  end if;
  -- Zeit geändert: Leihfahrzeuge dürfen nicht kollidieren
  if (new.beginn, new.ende) is distinct from (old.beginn, old.ende) and new.status <> 'abgesagt' then
    for r in select distinct t.miet_fahrzeug_id from public.ms_teilnehmer t
              where t.event_id = old.id and t.miet_fahrzeug_id is not null and t.status not in ('storniert', 'warteliste') loop
      v_grund := public.p296_leih_konflikt(r.miet_fahrzeug_id, new.beginn, new.ende, old.id);
      if v_grund is not null then raise exception '%', v_grund; end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists p296_event_waechter_trg on public.ms_event;
create trigger p296_event_waechter_trg before insert or update or delete on public.ms_event
  for each row execute function public.p296_event_waechter();
revoke all on function public.p296_event_waechter() from public, anon, authenticated;

-- --------------------------------------------------- Wächter: Gruppe ---
create or replace function public.p296_gruppe_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_belegt integer;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.ms_teilnehmer t where t.gruppe_id = old.id) then
      raise exception 'In der Gruppe stehen Teilnehmer — sie bleibt erhalten.';
    end if;
    return old;
  end if;
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.ms_event e where e.id = new.event_id and e.owner_user_id = new.owner_user_id) then
      raise exception 'Das Event gehört nicht zu diesem Betrieb.';
    end if;
    new.erstellt_am := now();
    return new;
  end if;
  if (new.owner_user_id, new.event_id, new.erstellt_am) is distinct from (old.owner_user_id, old.event_id, old.erstellt_am) then
    raise exception 'Event und Besitzer einer Gruppe sind unveränderlich.';
  end if;
  if new.startplaetze < old.startplaetze then
    select count(*) into v_belegt from public.ms_teilnehmer t
     where t.gruppe_id = old.id and t.status in ('angemeldet', 'bestaetigt', 'freigegeben', 'teilgenommen');
    if v_belegt > new.startplaetze then
      raise exception 'In der Gruppe sind schon % Startplätze belegt.', v_belegt;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists p296_gruppe_waechter_trg on public.ms_gruppe;
create trigger p296_gruppe_waechter_trg before insert or update or delete on public.ms_gruppe
  for each row execute function public.p296_gruppe_waechter();
revoke all on function public.p296_gruppe_waechter() from public, anon, authenticated;

-- ----------------------------------------------- Wächter: Teilnehmer ---
create or replace function public.p296_teilnehmer_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ev public.ms_event%rowtype;
  v_gr public.ms_gruppe%rowtype;
  v_belegt integer;
  v_grund text;
  v_belegend constant text[] := array['angemeldet', 'bestaetigt', 'freigegeben', 'teilgenommen'];
begin
  if tg_op = 'DELETE' then
    if old.rechnung_id is not null or old.status in ('freigegeben', 'teilgenommen') or old.verzicht_token is not null then
      raise exception 'Teilnehmer mit Verzicht, Startfreigabe oder Rechnung bleiben erhalten — setzen Sie sie auf „storniert“.';
    end if;
    return old;
  end if;

  new.name := btrim(new.name);
  new.sorgeberechtigt_name := nullif(btrim(coalesce(new.sorgeberechtigt_name, '')), '');
  new.aktualisiert_am := now();

  if tg_op = 'INSERT' then
    new.erstellt_am := now(); new.erstellt_von := auth.uid();
    new.verzicht_token := null; new.verzicht_gesendet_am := null; new.freigabe_am := null; new.freigabe_von := null; new.rechnung_id := null;
    if new.status <> 'warteliste' then new.status := 'angemeldet'; end if;
  else
    if (new.owner_user_id, new.event_id, new.erstellt_am) is distinct from (old.owner_user_id, old.event_id, old.erstellt_am)
       or new.erstellt_von is distinct from old.erstellt_von then
      raise exception 'Event, Besitzer und Anlage einer Anmeldung sind unveränderlich.';
    end if;
    if old.status in ('storniert', 'teilgenommen') and new.rechnung_id is not distinct from old.rechnung_id
       and (new.status, new.gruppe_id, new.name, new.startnummer, new.fahrzeug_art, new.miet_fahrzeug_id, new.startgeld_netto_cent, new.leih_netto_cent, new.verzicht_token, new.minderjaehrig, new.sorgeberechtigt_name)
           is distinct from
           (old.status, old.gruppe_id, old.name, old.startnummer, old.fahrzeug_art, old.miet_fahrzeug_id, old.startgeld_netto_cent, old.leih_netto_cent, old.verzicht_token, old.minderjaehrig, old.sorgeberechtigt_name) then
      raise exception 'Die Anmeldung ist % und bleibt so.', old.status;
    end if;
    if (new.freigabe_am, new.freigabe_von) is distinct from (old.freigabe_am, old.freigabe_von) and new.status = old.status then
      raise exception 'Die Startfreigabe setzt die Datenbank.';
    end if;
    if new.verzicht_gesendet_am is distinct from old.verzicht_gesendet_am and new.verzicht_token is not distinct from old.verzicht_token then
      raise exception 'Den Versandzeitpunkt setzt die Datenbank.';
    end if;
    -- Nach der Startfreigabe: Person, Gruppe, Fahrzeug und Verzicht fest
    if old.status in ('freigegeben', 'teilgenommen')
       and (new.name, new.gruppe_id, new.startnummer, new.fahrzeug_art, new.miet_fahrzeug_id, new.eigenes_fahrzeug, new.verzicht_token, new.minderjaehrig, new.sorgeberechtigt_name)
           is distinct from
           (old.name, old.gruppe_id, old.startnummer, old.fahrzeug_art, old.miet_fahrzeug_id, old.eigenes_fahrzeug, old.verzicht_token, old.minderjaehrig, old.sorgeberechtigt_name) then
      raise exception 'Der Teilnehmer ist zum Start freigegeben — Person, Gruppe, Startnummer, Fahrzeug und Verzicht bleiben so. Freigabe zuerst zurücknehmen.';
    end if;
    -- Nach der Rechnung: Preise, Gruppe und Fahrzeug fest
    if old.rechnung_id is not null
       and (new.gruppe_id, new.fahrzeug_art, new.miet_fahrzeug_id, new.startgeld_netto_cent, new.leih_netto_cent)
           is distinct from (old.gruppe_id, old.fahrzeug_art, old.miet_fahrzeug_id, old.startgeld_netto_cent, old.leih_netto_cent) then
      raise exception 'Für die Anmeldung gibt es eine Rechnung — Gruppe, Fahrzeug und Preise bleiben so.';
    end if;
    if new.rechnung_id is distinct from old.rechnung_id then
      if new.rechnung_id is null then raise exception 'Die Verknüpfung zur Rechnung bleibt erhalten.'; end if;
      if not exists (select 1 from public.rechnungen r where r.id = new.rechnung_id and r.owner_user_id = new.owner_user_id) then
        raise exception 'Die Rechnung gehört nicht zu diesem Betrieb.';
      end if;
      if new.status in ('warteliste', 'storniert') then
        raise exception 'Für Warteliste und Stornierungen entsteht keine Rechnung.';
      end if;
    end if;
  end if;

  select * into v_ev from public.ms_event e where e.id = new.event_id;
  if not found or v_ev.owner_user_id <> new.owner_user_id then
    raise exception 'Das Event gehört nicht zu diesem Betrieb.';
  end if;
  select * into v_gr from public.ms_gruppe g where g.id = new.gruppe_id;
  if not found or v_gr.event_id <> new.event_id then
    raise exception 'Die Gruppe gehört nicht zu diesem Event.';
  end if;
  if tg_op = 'INSERT' then
    if v_ev.status not in ('geplant', 'offen') then
      raise exception 'Das Event ist % — keine neuen Anmeldungen.', v_ev.status;
    end if;
    if new.startgeld_netto_cent = 0 then new.startgeld_netto_cent := v_gr.startgeld_netto_cent; end if;
  elsif new.gruppe_id <> old.gruppe_id and new.startgeld_netto_cent = old.startgeld_netto_cent then
    new.startgeld_netto_cent := v_gr.startgeld_netto_cent;
  end if;

  -- Fahrzeug
  if new.fahrzeug_art = 'eigen' then
    new.miet_fahrzeug_id := null; new.leih_netto_cent := 0;
  end if;
  if new.miet_fahrzeug_id is not null and new.status not in ('storniert', 'warteliste') and v_ev.status <> 'abgesagt'
     and (tg_op = 'INSERT' or new.miet_fahrzeug_id is distinct from old.miet_fahrzeug_id or old.status in ('storniert', 'warteliste')) then
    if not exists (select 1 from public.miet_fahrzeug m where m.id = new.miet_fahrzeug_id and m.owner_user_id = new.owner_user_id and m.aktiv) then
      raise exception 'Das Leihfahrzeug gehört nicht zu Ihrer aktiven Mietflotte.';
    end if;
    v_grund := public.p296_leih_konflikt(new.miet_fahrzeug_id, v_ev.beginn, v_ev.ende, new.event_id);
    if v_grund is not null then raise exception '%', v_grund; end if;
    if exists (select 1 from public.ms_teilnehmer t where t.event_id = new.event_id and t.miet_fahrzeug_id = new.miet_fahrzeug_id
                and t.id <> new.id and t.status not in ('storniert', 'warteliste')) then
      raise exception 'Das Leihfahrzeug ist in diesem Event schon vergeben.';
    end if;
  end if;

  -- Startplätze (gegen gleichzeitige Anmeldungen gesperrt)
  if new.status = any (v_belegend) and (tg_op = 'INSERT' or not (old.status = any (v_belegend)) or new.gruppe_id <> old.gruppe_id) then
    perform pg_advisory_xact_lock(hashtext('ms_gruppe:' || new.gruppe_id::text));
    select count(*) into v_belegt from public.ms_teilnehmer t
     where t.gruppe_id = new.gruppe_id and t.id <> new.id and t.status = any (v_belegend);
    if v_belegt >= v_gr.startplaetze then
      raise exception 'Die Gruppe „%“ ist voll (% Startplätze) — bitte auf die Warteliste setzen.', v_gr.name, v_gr.startplaetze;
    end if;
  end if;

  -- Haftungsverzicht: Token aus dem Signatur-Modul
  if tg_op = 'UPDATE' and new.verzicht_token is distinct from old.verzicht_token then
    if new.verzicht_token is null then
      raise exception 'Der Verweis auf den Haftungsverzicht bleibt erhalten.';
    end if;
    if old.verzicht_token is not null and public.p296_signiert(old.verzicht_token, old.owner_user_id) then
      raise exception 'Der Haftungsverzicht ist bereits unterschrieben.';
    end if;
    if coalesce(char_length(btrim(v_ev.verzicht_text)), 0) < 50 then
      raise exception 'Bitte zuerst den Text Ihres Haftungsverzichts beim Event hinterlegen.';
    end if;
    if not exists (select 1 from public.signatur_anfragen s where s.token = new.verzicht_token and s.owner_user_id = new.owner_user_id) then
      raise exception 'Die Signatur-Anfrage gehört nicht zu diesem Betrieb.';
    end if;
    new.verzicht_gesendet_am := now();
    update public.ms_event set verzicht_fest = true where id = new.event_id and not verzicht_fest;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- Statuswechsel
  if new.status <> old.status then
    if not ((old.status = 'angemeldet' and new.status in ('bestaetigt', 'warteliste', 'storniert'))
         or (old.status = 'warteliste' and new.status in ('angemeldet', 'bestaetigt', 'storniert'))
         or (old.status = 'bestaetigt' and new.status in ('angemeldet', 'warteliste', 'freigegeben', 'storniert'))
         or (old.status = 'freigegeben' and new.status in ('bestaetigt', 'teilgenommen', 'storniert'))) then
      raise exception 'Dieser Statuswechsel ist nicht möglich (% → %).', old.status, new.status;
    end if;
    if new.status = 'freigegeben' then
      if v_ev.status in ('abgesagt', 'beendet') then raise exception 'Das Event ist % — keine Startfreigabe.', v_ev.status; end if;
      if new.startnummer is null then raise exception 'Bitte zuerst eine Startnummer vergeben.'; end if;
      if new.verzicht_token is null or not public.p296_signiert(new.verzicht_token, new.owner_user_id) then
        raise exception 'Der Haftungsverzicht ist noch nicht unterschrieben.';
      end if;
      if v_ev.mindestalter > 0 and not new.alter_geprueft then raise exception 'Bitte das Mindestalter (% Jahre) prüfen und abhaken.', v_ev.mindestalter; end if;
      if v_ev.fuehrerschein_pflicht and not new.fuehrerschein_geprueft then raise exception 'Bitte den Führerschein prüfen und abhaken.'; end if;
      if v_ev.briefing_pflicht and not new.briefing then raise exception 'Bitte die Teilnahme an der Fahrerbesprechung abhaken.'; end if;
      if new.fahrzeug_art = 'eigen' and coalesce(btrim(new.eigenes_fahrzeug), '') = '' then raise exception 'Bitte das eigene Fahrzeug eintragen.'; end if;
      new.freigabe_am := now(); new.freigabe_von := auth.uid();
    elsif old.status = 'freigegeben' and new.status <> 'teilgenommen' then
      new.freigabe_am := null; new.freigabe_von := null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists p296_teilnehmer_waechter_trg on public.ms_teilnehmer;
create trigger p296_teilnehmer_waechter_trg before insert or update or delete on public.ms_teilnehmer
  for each row execute function public.p296_teilnehmer_waechter();
revoke all on function public.p296_teilnehmer_waechter() from public, anon, authenticated;

-- ----------------------------------------------------- Wächter: Gast ---
create or replace function public.p296_gast_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ev public.ms_event%rowtype;
begin
  new.name := btrim(new.name);
  select * into v_ev from public.ms_event e where e.id = new.event_id;
  if not found or v_ev.owner_user_id <> new.owner_user_id then
    raise exception 'Das Event gehört nicht zu diesem Betrieb.';
  end if;
  if tg_op = 'INSERT' then
    new.erstellt_am := now(); new.erstellt_von := auth.uid();
    new.verzicht_token := null; new.akkreditiert_am := null; new.akkreditiert_von := null;
    return new;
  end if;
  if (new.owner_user_id, new.event_id, new.erstellt_am) is distinct from (old.owner_user_id, old.event_id, old.erstellt_am)
     or new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Event, Besitzer und Anlage eines Gasts sind unveränderlich.';
  end if;
  if new.verzicht_token is distinct from old.verzicht_token then
    if new.verzicht_token is null then raise exception 'Der Verweis auf den Haftungsverzicht bleibt erhalten.'; end if;
    if old.verzicht_token is not null and public.p296_signiert(old.verzicht_token, old.owner_user_id) then
      raise exception 'Der Haftungsverzicht ist bereits unterschrieben.';
    end if;
    if coalesce(char_length(btrim(v_ev.verzicht_text)), 0) < 50 then
      raise exception 'Bitte zuerst den Text Ihres Haftungsverzichts beim Event hinterlegen.';
    end if;
    if not exists (select 1 from public.signatur_anfragen s where s.token = new.verzicht_token and s.owner_user_id = new.owner_user_id) then
      raise exception 'Die Signatur-Anfrage gehört nicht zu diesem Betrieb.';
    end if;
    update public.ms_event set verzicht_fest = true where id = new.event_id and not verzicht_fest;
  end if;
  if new.akkreditiert_am is distinct from old.akkreditiert_am or new.akkreditiert_von is distinct from old.akkreditiert_von then
    if old.akkreditiert_am is not null then
      raise exception 'Die Akkreditierung ist erfasst und bleibt so.';
    end if;
    if new.bereich = 'boxengasse' and (new.verzicht_token is null or not public.p296_signiert(new.verzicht_token, new.owner_user_id)) then
      raise exception 'Für die Boxengasse muss der Haftungsverzicht unterschrieben sein.';
    end if;
    new.akkreditiert_am := now(); new.akkreditiert_von := auth.uid();
  end if;
  if old.akkreditiert_am is not null and new.bereich <> old.bereich then
    raise exception 'Der Gast ist akkreditiert — der Bereich bleibt so.';
  end if;
  return new;
end;
$$;
drop trigger if exists p296_gast_waechter_trg on public.ms_gast;
create trigger p296_gast_waechter_trg before insert or update on public.ms_gast
  for each row execute function public.p296_gast_waechter();
revoke all on function public.p296_gast_waechter() from public, anon, authenticated;

-- ------------------------------------------- Wächter: Teil / Einsatz ---
create or replace function public.p296_teil_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.bezeichnung := btrim(new.bezeichnung);
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.miet_fahrzeug m where m.id = new.miet_fahrzeug_id and m.owner_user_id = new.owner_user_id) then
      raise exception 'Das Fahrzeug gehört nicht zu Ihrer Mietflotte.';
    end if;
    if new.eingebaut_am > (now() at time zone 'Europe/Berlin')::date then raise exception 'Das Einbaudatum liegt in der Zukunft.'; end if;
    new.ausgebaut_am := null; new.erstellt_am := now(); new.erstellt_von := auth.uid();
    return new;
  end if;
  if (new.owner_user_id, new.miet_fahrzeug_id, new.erstellt_am) is distinct from (old.owner_user_id, old.miet_fahrzeug_id, old.erstellt_am)
     or new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Fahrzeug, Besitzer und Anlage eines Teils sind unveränderlich.';
  end if;
  if old.ausgebaut_am is not null and row(new.*) is distinct from row(old.*) then
    raise exception 'Das Teil ist getauscht und bleibt so.';
  end if;
  if new.ausgebaut_am is not null and new.ausgebaut_am > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Das Tauschdatum liegt in der Zukunft.';
  end if;
  return new;
end;
$$;
drop trigger if exists p296_teil_waechter_trg on public.ms_teil;
create trigger p296_teil_waechter_trg before insert or update on public.ms_teil
  for each row execute function public.p296_teil_waechter();
revoke all on function public.p296_teil_waechter() from public, anon, authenticated;

create or replace function public.p296_einsatz_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.miet_fahrzeug m where m.id = new.miet_fahrzeug_id and m.owner_user_id = new.owner_user_id) then
    raise exception 'Das Fahrzeug gehört nicht zu Ihrer Mietflotte.';
  end if;
  if new.event_id is not null and not exists (select 1 from public.ms_event e where e.id = new.event_id and e.owner_user_id = new.owner_user_id) then
    raise exception 'Das Event gehört nicht zu diesem Betrieb.';
  end if;
  if new.datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Das Datum liegt in der Zukunft.'; end if;
  if tg_op = 'INSERT' then
    new.erstellt_am := now(); new.erstellt_von := auth.uid();
  elsif (new.owner_user_id, new.erstellt_am) is distinct from (old.owner_user_id, old.erstellt_am) or new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Besitzer und Anlage eines Einsatzes sind unveränderlich.';
  end if;
  return new;
end;
$$;
drop trigger if exists p296_einsatz_waechter_trg on public.ms_einsatz;
create trigger p296_einsatz_waechter_trg before insert or update on public.ms_einsatz
  for each row execute function public.p296_einsatz_waechter();
revoke all on function public.p296_einsatz_waechter() from public, anon, authenticated;

-- ------------------------- Wächter an der Vermietung (nur zusätzlich) ---
create or replace function public.p296_miet_event_sperre()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_titel text;
begin
  if new.status not in ('reserviert', 'uebergeben') then return new; end if;
  if tg_op = 'UPDATE' and (new.fahrzeug_id, new.abholung, new.rueckgabe_plan, new.status) is not distinct from (old.fahrzeug_id, old.abholung, old.rueckgabe_plan, old.status) then
    return new;
  end if;
  select e.titel into v_titel
    from public.ms_teilnehmer t join public.ms_event e on e.id = t.event_id
   where t.miet_fahrzeug_id = new.fahrzeug_id and t.status not in ('storniert', 'warteliste') and e.status <> 'abgesagt'
     and tstzrange(e.beginn, e.ende, '[)') && tstzrange(new.abholung, new.rueckgabe_plan, '[)')
   limit 1;
  if v_titel is not null then
    raise exception 'Das Fahrzeug ist in diesem Zeitraum als Leihfahrzeug im Event „%“ vergeben.', v_titel;
  end if;
  return new;
end;
$$;
drop trigger if exists p296_miet_event_sperre_trg on public.miet_buchung;
create trigger p296_miet_event_sperre_trg before insert or update on public.miet_buchung
  for each row execute function public.p296_miet_event_sperre();
revoke all on function public.p296_miet_event_sperre() from public, anon, authenticated;

-- ------------------------------------------------------------- Regeln ---
do $$
declare
  t text;
  k text;
begin
  foreach t in array array['ms_event', 'ms_gruppe', 'ms_teilnehmer', 'ms_gast', 'ms_teil', 'ms_einsatz'] loop
    k := replace(t, 'ms_', 'ms');
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', k || '_chef_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid())', k || '_chef_all', t);
    execute format('drop policy if exists %I on public.%I', k || '_ma_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''veranstaltungen'') or public.darf_ich_modul_aendern(''veranstaltungen'')))', k || '_ma_select', t);
    execute format('drop policy if exists %I on public.%I', k || '_ma_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''veranstaltungen''))', k || '_ma_insert', t);
    execute format('drop policy if exists %I on public.%I', k || '_ma_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''veranstaltungen'')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''veranstaltungen''))', k || '_ma_update', t);
  end loop;
end $$;

commit;

-- KONTROLLE (nur lesen) — Erwartung: 6 | 24 | 7 | 2 | 6 | t
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('ms_event', 'ms_gruppe', 'ms_teilnehmer', 'ms_gast', 'ms_teil', 'ms_einsatz')) as tabellen,
       (select count(*) from pg_policies where schemaname = 'public' and tablename in ('ms_event', 'ms_gruppe', 'ms_teilnehmer', 'ms_gast', 'ms_teil', 'ms_einsatz')) as regeln,
       (select count(*) from pg_trigger where tgname in ('p296_event_waechter_trg', 'p296_gruppe_waechter_trg', 'p296_teilnehmer_waechter_trg', 'p296_gast_waechter_trg', 'p296_teil_waechter_trg', 'p296_einsatz_waechter_trg', 'p296_miet_event_sperre_trg')) as waechter,
       (select count(*) from pg_proc where proname in ('p296_leih_konflikt', 'p296_signiert')) as hilfen,
       (select count(*) from pg_class where relname in ('ms_event', 'ms_gruppe', 'ms_teilnehmer', 'ms_gast', 'ms_teil', 'ms_einsatz') and relnamespace = 'public'::regnamespace and relrowsecurity) as rls_an,
       (select pg_get_constraintdef(oid) like '%kart%' from pg_constraint where conname = 'miet_fahrzeug_art_check') as kart_art;
