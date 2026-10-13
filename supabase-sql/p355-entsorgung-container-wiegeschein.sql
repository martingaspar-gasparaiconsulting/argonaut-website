-- ============================================================
-- ARGONAUT OS · Paket 355 (13.10.2026) · A4c Fachpaket Entsorgung, Teil 1
-- Container-Dienst und Wiegeschein.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- abfall_schluessel:  die eigene Liste der Abfallschlüssel des Betriebs
--                     (6 Ziffern nach Abfallverzeichnis-Verordnung, Sternchen
--                     = gefährlicher Abfall). KEIN amtlicher Katalog: der
--                     Betrieb trägt seine Schlüssel selbst ein.
-- container_bestand:  der Containerbestand (eigene Nummer, Art, Größe) mit
--                     Stand: auf dem Hof / beim Kunden / voll gemeldet /
--                     in Reparatur.
-- container_auftrag:  Stellen, Tauschen, Abholen mit Termin. Wird ein Auftrag
--                     erledigt, setzt die DATENBANK die Container um (neuer
--                     zum Kunden, alter zurück auf den Hof). Erledigt bleibt
--                     erledigt.
-- wiegeschein:        Nummer je Betrieb und Jahr von der Datenbank, Brutto/
--                     Tara in kg mit Serverzeit je Wägung, Netto rechnet die
--                     Datenbank. Nach dem Abschluss bleibt der Schein, wie er
--                     ist — nur die Geschäftsleitung kann ihn mit Grund
--                     stornieren. Korrektur = neuer Schein.
--
-- Rechte: Besitzer = Betrieb (p181_besitzer). Mitarbeiter lesen mit Modul
-- „entsorgung", anlegen/ändern mit Schreibrecht. Löschen nur die
-- Geschäftsleitung — und nur, was noch nicht erledigt/abgeschlossen ist.
-- ============================================================

-- TEIL 1 von 8: Abfallschlüssel und Container
create table if not exists public.abfall_schluessel (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  schluessel      text not null check (schluessel ~ '^[0-9]{6}\*?$'),
  gefaehrlich     boolean generated always as (right(schluessel, 1) = '*') stored,
  bezeichnung     text not null check (char_length(bezeichnung) between 1 and 200),
  aktiv           boolean not null default true,
  aktualisiert_am timestamptz not null default now(),
  constraint abfall_schluessel_eindeutig unique (owner_user_id, schluessel)
);

create table if not exists public.container_bestand (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer          text not null check (char_length(nummer) between 1 and 30),
  art             text not null default 'absetz' check (art in ('absetz', 'abroll', 'umleer', 'presse', 'bigbag', 'sonstige')),
  groesse_m3      numeric(5,1) check (groesse_m3 is null or (groesse_m3 > 0 and groesse_m3 <= 100)),
  status          text not null default 'lager' check (status in ('lager', 'gestellt', 'voll', 'defekt')),
  kontakt_id      uuid,
  kunde_name      text check (kunde_name is null or char_length(kunde_name) <= 120),
  stellplatz      text check (stellplatz is null or char_length(stellplatz) <= 300),
  gestellt_seit   date,
  notiz           text check (notiz is null or char_length(notiz) <= 500),
  aktiv           boolean not null default true,
  aktualisiert_am timestamptz not null default now(),
  constraint container_bestand_nummer_eindeutig unique (owner_user_id, nummer)
);
create index if not exists container_bestand_idx on public.container_bestand (owner_user_id, status, nummer);

-- TEIL 2 von 8: Aufträge und Wiegeschein
create table if not exists public.container_auftrag (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  art                  text not null check (art in ('stellen', 'tauschen', 'abholen')),
  termin               date not null,
  zeitfenster          text check (zeitfenster is null or char_length(zeitfenster) <= 40),
  kontakt_id           uuid,
  kunde_name           text not null check (char_length(kunde_name) between 1 and 120),
  stellplatz           text not null check (char_length(stellplatz) between 1 and 300),
  telefon              text check (telefon is null or char_length(telefon) <= 40),
  container_id         uuid references public.container_bestand(id) on delete restrict,
  container_alt_id     uuid references public.container_bestand(id) on delete restrict,
  groesse_m3           numeric(5,1) check (groesse_m3 is null or (groesse_m3 > 0 and groesse_m3 <= 100)),
  abfall_schluessel_id uuid references public.abfall_schluessel(id) on delete restrict,
  fahrer               text check (fahrer is null or char_length(fahrer) <= 80),
  status               text not null default 'geplant' check (status in ('geplant', 'erledigt', 'storniert')),
  erledigt_am          timestamptz,
  erledigt_von         uuid,
  notiz                text check (notiz is null or char_length(notiz) <= 500),
  erstellt_am          timestamptz not null default now(),
  aktualisiert_am      timestamptz not null default now(),
  constraint container_auftrag_art check ((art <> 'stellen' or container_alt_id is null) and (art <> 'abholen' or container_id is null)),
  constraint container_auftrag_zwei check (container_id is null or container_alt_id is null or container_id <> container_alt_id)
);
create index if not exists container_auftrag_idx on public.container_auftrag (owner_user_id, termin, status);

create table if not exists public.wiegeschein (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer               text,
  richtung             text not null default 'eingang' check (richtung in ('eingang', 'ausgang')),
  kontakt_id           uuid,
  kunde_name           text check (kunde_name is null or char_length(kunde_name) <= 120),
  kennzeichen          text not null check (char_length(kennzeichen) between 1 and 15),
  fahrer               text check (fahrer is null or char_length(fahrer) <= 80),
  herkunft             text check (herkunft is null or char_length(herkunft) <= 200),
  container_id         uuid references public.container_bestand(id) on delete restrict,
  auftrag_id           uuid references public.container_auftrag(id) on delete restrict,
  abfall_schluessel_id uuid references public.abfall_schluessel(id) on delete restrict,
  abfall_schluessel    text,
  abfall_bezeichnung   text,
  gefaehrlich          boolean not null default false,
  waage                text check (waage is null or char_length(waage) <= 80),
  brutto_kg            integer check (brutto_kg is null or brutto_kg between 0 and 200000),
  brutto_am            timestamptz,
  tara_kg              integer check (tara_kg is null or tara_kg between 0 and 200000),
  tara_am              timestamptz,
  netto_kg             integer,
  status               text not null default 'offen' check (status in ('offen', 'abgeschlossen', 'storniert')),
  abgeschlossen_am     timestamptz,
  abgeschlossen_name   text,
  storno_grund         text check (storno_grund is null or char_length(storno_grund) <= 300),
  storniert_am         timestamptz,
  notiz                text check (notiz is null or char_length(notiz) <= 500),
  erstellt_von         uuid default auth.uid(),
  erstellt_am          timestamptz not null default now(),
  aktualisiert_am      timestamptz not null default now(),
  constraint wiegeschein_nummer_eindeutig unique (owner_user_id, nummer)
);
create index if not exists wiegeschein_idx on public.wiegeschein (owner_user_id, erstellt_am desc);

-- TEIL 3 von 8: Wächter für Abfallschlüssel und Container
create or replace function public.p355_stamm_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags kann nicht geändert werden.';
  end if;
  new.aktualisiert_am := now();
  if tg_table_name = 'abfall_schluessel' then
    if tg_op = 'UPDATE' and new.schluessel is distinct from old.schluessel then
      raise exception 'Ein Abfallschlüssel wird nicht umgeschrieben — legen Sie den richtigen neu an und blenden Sie diesen aus.';
    end if;
    return new;
  end if;
  -- container_bestand
  if new.kontakt_id is not null then
    if tg_op = 'INSERT' or new.kontakt_id is distinct from old.kontakt_id then
      if not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.owner_user_id = new.owner_user_id) then
        raise exception 'Der Kontakt gehört nicht zu Ihrem Betrieb.';
      end if;
    end if;
  end if;
  if new.status in ('lager', 'defekt') then
    new.kontakt_id := null; new.kunde_name := null; new.stellplatz := null; new.gestellt_seit := null;
  elsif coalesce(trim(new.kunde_name), '') = '' and coalesce(trim(new.stellplatz), '') = '' then
    raise exception 'Bei wem steht der Container? Bitte Kunde oder Stellplatz eintragen — oder einen Auftrag „Stellen" erledigen.';
  end if;
  return new;
end;
$$;

-- TEIL 4 von 8: Wächter für Aufträge (erledigt = Container werden umgesetzt)
create or replace function public.p355_auftrag_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_alt text; v_neu text; v_tag date;
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'geplant' then raise exception 'Der Auftrag ist erledigt oder storniert und bleibt, wie er ist.'; end if;
    if new.owner_user_id is distinct from old.owner_user_id then raise exception 'Der Betrieb eines Auftrags kann nicht geändert werden.'; end if;
    new.erstellt_am := old.erstellt_am;
  else
    if new.status <> 'geplant' then raise exception 'Ein neuer Auftrag beginnt als „geplant".'; end if;
    new.erstellt_am := now();
  end if;
  new.aktualisiert_am := now();
  new.erledigt_am := null; new.erledigt_von := null;
  if new.kontakt_id is not null then
    if not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.owner_user_id = new.owner_user_id) then
      raise exception 'Der Kontakt gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  if new.container_id is not null then
    if not exists (select 1 from public.container_bestand c where c.id = new.container_id and c.owner_user_id = new.owner_user_id) then
      raise exception 'Der Container gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  if new.container_alt_id is not null then
    if not exists (select 1 from public.container_bestand c where c.id = new.container_alt_id and c.owner_user_id = new.owner_user_id) then
      raise exception 'Der Container gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  if new.abfall_schluessel_id is not null then
    if not exists (select 1 from public.abfall_schluessel a where a.id = new.abfall_schluessel_id and a.owner_user_id = new.owner_user_id) then
      raise exception 'Der Abfallschlüssel gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  if new.status <> 'erledigt' then return new; end if;
  -- Erledigt: Container umsetzen (gesperrt, damit zwei gleichzeitige Aufträge nicht denselben Container stellen)
  v_tag := (now() at time zone 'Europe/Berlin')::date;
  if new.art in ('stellen', 'tauschen') then
    if new.container_id is null then raise exception 'Welcher Container wird gestellt? Bitte einen Container vom Hof wählen.'; end if;
    select c.status into v_neu from public.container_bestand c where c.id = new.container_id for update;
    if v_neu <> 'lager' then raise exception 'Der gewählte Container steht nicht auf dem Hof (er ist beim Kunden oder in Reparatur).'; end if;
  end if;
  if new.art in ('tauschen', 'abholen') then
    if new.container_alt_id is null then raise exception 'Welcher Container wird abgeholt? Bitte den Container beim Kunden wählen.'; end if;
    select c.status into v_alt from public.container_bestand c where c.id = new.container_alt_id for update;
    if v_alt not in ('gestellt', 'voll') then raise exception 'Der abzuholende Container steht laut ARGONAUT nicht beim Kunden.'; end if;
    update public.container_bestand set status = 'lager' where id = new.container_alt_id;
  end if;
  if new.art in ('stellen', 'tauschen') then
    update public.container_bestand set status = 'gestellt', kontakt_id = new.kontakt_id, kunde_name = new.kunde_name,
      stellplatz = new.stellplatz, gestellt_seit = v_tag where id = new.container_id;
  end if;
  new.erledigt_am := now();
  new.erledigt_von := auth.uid();
  return new;
end;
$$;

-- TEIL 5 von 8: Wächter für den Wiegeschein
create or replace function public.p355_wiege_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_jahr text; v_n integer; v_status text; v_grund text;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'storniert' then raise exception 'Der Wiegeschein ist storniert und bleibt, wie er ist.'; end if;
    if old.status = 'abgeschlossen' then
      -- Abgeschlossen: nur noch Storno durch die Geschäftsleitung, mit Grund. Alles andere bleibt.
      v_status := new.status; v_grund := trim(coalesce(new.storno_grund, ''));
      new := old;
      if v_status <> 'storniert' then raise exception 'Der Wiegeschein ist abgeschlossen und bleibt, wie er ist — Korrektur = neuer Schein.'; end if;
      if auth.uid() is not null and auth.uid() is distinct from old.owner_user_id then raise exception 'Stornieren darf nur die Geschäftsleitung.'; end if;
      if v_grund = '' then raise exception 'Bitte einen Grund für das Storno eintragen.'; end if;
      new.status := 'storniert'; new.storno_grund := left(v_grund, 300); new.storniert_am := now(); new.aktualisiert_am := now();
      return new;
    end if;
    if new.owner_user_id is distinct from old.owner_user_id then raise exception 'Der Betrieb eines Wiegescheins kann nicht geändert werden.'; end if;
    new.nummer := old.nummer; new.erstellt_von := old.erstellt_von; new.erstellt_am := old.erstellt_am;
  else
    if new.status = 'storniert' then raise exception 'Ein neuer Wiegeschein kann nicht storniert angelegt werden.'; end if;
    new.erstellt_am := now(); new.erstellt_von := auth.uid();
    v_jahr := to_char(now() at time zone 'Europe/Berlin', 'YYYY');
    perform pg_advisory_xact_lock(hashtext('p355_wiege_' || new.owner_user_id::text));
    select coalesce(max(split_part(w.nummer, '-', 2)::integer), 0) + 1 into v_n
      from public.wiegeschein w where w.owner_user_id = new.owner_user_id and w.nummer like v_jahr || '-%' and split_part(w.nummer, '-', 2) ~ '^[0-9]{1,9}$';
    new.nummer := v_jahr || '-' || lpad(v_n::text, greatest(5, length(v_n::text)), '0');
  end if;
  new.aktualisiert_am := now();
  new.kennzeichen := upper(trim(new.kennzeichen));
  new.abgeschlossen_am := null; new.abgeschlossen_name := null; new.storniert_am := null;
  -- Zeit je Wägung setzt die Datenbank (neu bei jeder Änderung des Gewichts)
  if new.brutto_kg is null then new.brutto_am := null;
  elsif tg_op = 'INSERT' or new.brutto_kg is distinct from old.brutto_kg then new.brutto_am := now();
  else new.brutto_am := old.brutto_am; end if;
  if new.tara_kg is null then new.tara_am := null;
  elsif tg_op = 'INSERT' or new.tara_kg is distinct from old.tara_kg then new.tara_am := now();
  else new.tara_am := old.tara_am; end if;
  if new.brutto_kg is not null and new.tara_kg is not null then
    if new.tara_kg > new.brutto_kg then raise exception 'Tara (leer) ist schwerer als Brutto (voll) — bitte die Gewichte prüfen.'; end if;
    new.netto_kg := new.brutto_kg - new.tara_kg;
  else
    new.netto_kg := null;
  end if;
  return new;
end;
$$;

-- TEIL 6 von 8: Bezüge und Abschluss des Wiegescheins (zweiter Wächter, läuft nach dem ersten)
create or replace function public.p355_wiege_bezug()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_s text; v_b text; v_g boolean;
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'offen' then return new; end if;
  end if;
  if new.kontakt_id is not null then
    if not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.owner_user_id = new.owner_user_id) then raise exception 'Der Kontakt gehört nicht zu Ihrem Betrieb.'; end if;
  end if;
  if new.container_id is not null then
    if not exists (select 1 from public.container_bestand c where c.id = new.container_id and c.owner_user_id = new.owner_user_id) then raise exception 'Der Container gehört nicht zu Ihrem Betrieb.'; end if;
  end if;
  if new.auftrag_id is not null then
    if not exists (select 1 from public.container_auftrag a where a.id = new.auftrag_id and a.owner_user_id = new.owner_user_id) then raise exception 'Der Auftrag gehört nicht zu Ihrem Betrieb.'; end if;
  end if;
  new.abfall_schluessel := null; new.abfall_bezeichnung := null; new.gefaehrlich := false;
  if new.abfall_schluessel_id is not null then
    select a.schluessel, a.bezeichnung, a.gefaehrlich into v_s, v_b, v_g from public.abfall_schluessel a where a.id = new.abfall_schluessel_id and a.owner_user_id = new.owner_user_id;
    if v_s is null then raise exception 'Der Abfallschlüssel gehört nicht zu Ihrem Betrieb.'; end if;
    new.abfall_schluessel := v_s; new.abfall_bezeichnung := v_b; new.gefaehrlich := v_g;
  end if;
  if new.status = 'storniert' then
    if coalesce(trim(new.storno_grund), '') = '' then raise exception 'Bitte einen Grund für das Storno eintragen.'; end if;
    new.storniert_am := now();
  elsif new.status = 'abgeschlossen' then
    if new.brutto_kg is null or new.tara_kg is null then raise exception 'Zum Abschließen fehlen Brutto und Tara.'; end if;
    if new.abfall_schluessel_id is null then raise exception 'Zum Abschließen fehlt der Abfallschlüssel.'; end if;
    new.abgeschlossen_am := now();
    new.abgeschlossen_name := public.p353_name(new.owner_user_id);
  end if;
  return new;
end;
$$;

-- Löschen: nur, was noch offen bzw. geplant ist (die Rechte erlauben Löschen ohnehin nur der Geschäftsleitung)
create or replace function public.p355_loeschwaechter()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_table_name = 'wiegeschein' and old.status <> 'offen' then
    raise exception 'Ein abgeschlossener oder stornierter Wiegeschein bleibt erhalten.';
  end if;
  if tg_table_name = 'container_auftrag' and old.status = 'erledigt' then
    raise exception 'Ein erledigter Auftrag bleibt erhalten — er belegt, wann welcher Container wo war.';
  end if;
  return old;
end;
$$;

-- TEIL 7 von 8: Auslöser und Rechte (Modul „entsorgung")
do $$
declare
  t text;
begin
  foreach t in array array['abfall_schluessel', 'container_bestand', 'container_auftrag', 'wiegeschein'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop trigger if exists p355_waechter on public.%I', t);
    execute format('create trigger p355_waechter before insert or update on public.%I for each row execute function public.%I()', t,
      case t when 'container_auftrag' then 'p355_auftrag_waechter' when 'wiegeschein' then 'p355_wiege_waechter' else 'p355_stamm_waechter' end);
    execute format('drop policy if exists p355_owner_all on public.%I', t);
    execute format('create policy p355_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p355_ma_select on public.%I', t);
    execute format('create policy p355_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''entsorgung'') or public.darf_ich_modul_aendern(''entsorgung'')))', t);
    execute format('drop policy if exists p355_ma_insert on public.%I', t);
    execute format('create policy p355_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''entsorgung''))', t);
    execute format('drop policy if exists p355_ma_update on public.%I', t);
    execute format('create policy p355_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''entsorgung'')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''entsorgung''))', t);
  end loop;
end $$;

-- Zweiter Wächter am Wiegeschein (Name „p355_z…" läuft nach „p355_waechter")
drop trigger if exists p355_z_bezug on public.wiegeschein;
create trigger p355_z_bezug before insert or update on public.wiegeschein for each row execute function public.p355_wiege_bezug();
drop trigger if exists p355_loeschwaechter on public.wiegeschein;
create trigger p355_loeschwaechter before delete on public.wiegeschein for each row execute function public.p355_loeschwaechter();
drop trigger if exists p355_loeschwaechter on public.container_auftrag;
create trigger p355_loeschwaechter before delete on public.container_auftrag for each row execute function public.p355_loeschwaechter();

-- TEIL 8 von 8: KONTROLLE — Erwartung: tabellen = 4 | regeln = 16 | ausloeser = 11 | rls_an = 4
-- (regeln = 20 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('abfall_schluessel', 'container_bestand', 'container_auftrag', 'wiegeschein')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('abfall_schluessel', 'container_bestand', 'container_auftrag', 'wiegeschein')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.abfall_schluessel'::regclass, 'public.container_bestand'::regclass, 'public.container_auftrag'::regclass, 'public.wiegeschein'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('abfall_schluessel', 'container_bestand', 'container_auftrag', 'wiegeschein') and relrowsecurity) as rls_an;
