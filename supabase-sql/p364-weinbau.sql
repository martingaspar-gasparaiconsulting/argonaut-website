-- ============================================================
-- ARGONAUT OS · Paket 364 (13.10.2026) · A4f Fachpaket Weinbau
-- Lesebuch (je Weinberg: Rebsorte, Menge, Mostgewicht °Oechsle, Säure),
-- Partien im Keller mit Bestand in Litern und ein Kellerbuch, in dem jede
-- Bewegung und Behandlung angehängt wird (Zugang, Verschnitt, Anreicherung,
-- Entsäuerung, Süßung, Schwefelung, Analyse, Abfüllung …). Der Bestand
-- rechnet die Datenbank; er kann nie unter 0 fallen. Die Abfüllung legt die
-- Flaschen-Charge (Quarantäne) mit Rückverfolgung zur Partie und Lese an.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- wein_partie:      Partie (Tank/Fass) je Jahrgang; Bestand nur über das Kellerbuch.
-- wein_lese:        Lesebuch, Nummer JJJJ-NNN je Jahrgang; nur anhängen, Storno durch
--                   Geschäftsleitung mit Grund (bucht den Most wieder aus der Partie).
-- wein_kellerbuch:  Einträge je Partie, nur anhängen; Zeit und Name vom Server.
-- p364_verschnitt(), p364_abfuellen(): Verschnitt und Abfüllung in einem Zug.
--
-- Rechte: Modul „weinbau" (sehen/ändern); Mitarbeiter löschen und stornieren nichts.
-- Kein Aussperr-Risiko: an Chargen, Schlagkartei und Lager ändert sich nichts.
-- Voraussetzung: charge_los, charge_verwendung (+ p320), p353_name().
-- ============================================================

-- TEIL 1 von 6: Tabellen
create table if not exists public.wein_partie (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  jahrgang        integer not null check (jahrgang between 1900 and 2200),
  bezeichnung     text not null check (char_length(btrim(bezeichnung)) between 1 and 200),
  rebsorte        text check (rebsorte is null or char_length(rebsorte) <= 120),
  behaelter       text check (behaelter is null or char_length(behaelter) <= 80),
  bestand_l       numeric not null default 0 check (bestand_l >= 0),
  notiz           text check (notiz is null or char_length(notiz) <= 2000),
  erfasst_name    text,
  erstellt_am     timestamptz not null default now()
);
create index if not exists wein_partie_owner_idx on public.wein_partie (owner_user_id, jahrgang);

create table if not exists public.wein_lese (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer          text,
  jahrgang        integer not null check (jahrgang between 1900 and 2200),
  lesedatum       date not null,
  schlag_id       uuid,
  weinberg        text not null check (char_length(btrim(weinberg)) between 1 and 200),
  flaeche_ha      numeric check (flaeche_ha is null or (flaeche_ha > 0 and flaeche_ha <= 1000)),
  rebsorte        text not null check (char_length(btrim(rebsorte)) between 1 and 120),
  lesart          text not null default 'hand' check (lesart in ('hand', 'maschine')),
  menge_kg        numeric not null check (menge_kg > 0),
  mostgewicht_oe  numeric check (mostgewicht_oe is null or (mostgewicht_oe >= 0 and mostgewicht_oe <= 350)),
  saeure_gl       numeric check (saeure_gl is null or (saeure_gl >= 0 and saeure_gl <= 40)),
  most_l          numeric check (most_l is null or most_l > 0),
  partie_id       uuid references public.wein_partie(id) on delete restrict,
  bemerkung       text check (bemerkung is null or char_length(bemerkung) <= 1000),
  storniert       boolean not null default false,
  storno_grund    text,
  erfasst_am      timestamptz not null default now(),
  erfasst_name    text,
  constraint wein_lese_most_partie check (partie_id is null or most_l is not null)
);
create unique index if not exists wein_lese_nummer_uidx on public.wein_lese (owner_user_id, nummer);
create index if not exists wein_lese_jahrgang_idx on public.wein_lese (owner_user_id, jahrgang, lesedatum);

create table if not exists public.wein_kellerbuch (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  partie_id       uuid not null references public.wein_partie(id) on delete restrict,
  datum           date not null default ((now() at time zone 'Europe/Berlin')::date),
  art             text not null check (art in ('zugang', 'zugang_lese', 'verschnitt_zu', 'abgang', 'verschnitt_ab', 'abfuellung', 'schwund', 'storno_lese',
                                               'anreicherung', 'entsaeuerung', 'saeuerung', 'suessung', 'schwefelung', 'schoenung', 'filtration', 'analyse', 'sonstiges')),
  menge_l         numeric check (menge_l is null or menge_l > 0),
  mittel          text check (mittel is null or char_length(mittel) <= 200),
  mittel_menge    numeric check (mittel_menge is null or mittel_menge > 0),
  mittel_einheit  text check (mittel_einheit is null or char_length(mittel_einheit) <= 20),
  alkohol_vol     numeric check (alkohol_vol is null or (alkohol_vol >= 0 and alkohol_vol <= 25)),
  restzucker_gl   numeric check (restzucker_gl is null or (restzucker_gl >= 0 and restzucker_gl <= 600)),
  saeure_gl       numeric check (saeure_gl is null or (saeure_gl >= 0 and saeure_gl <= 40)),
  so2_frei_mgl    numeric check (so2_frei_mgl is null or (so2_frei_mgl >= 0 and so2_frei_mgl <= 500)),
  so2_gesamt_mgl  numeric check (so2_gesamt_mgl is null or (so2_gesamt_mgl >= 0 and so2_gesamt_mgl <= 1000)),
  gegen_partie_id uuid,
  lese_id         uuid,
  charge_nr       text,
  bemerkung       text check (bemerkung is null or char_length(bemerkung) <= 1000),
  bestand_nach_l  numeric,
  erfasst_am      timestamptz not null default now(),
  erfasst_name    text
);
create index if not exists wein_kellerbuch_partie_idx on public.wein_kellerbuch (partie_id, erfasst_am);
create index if not exists wein_kellerbuch_owner_idx on public.wein_kellerbuch (owner_user_id, datum);

-- TEIL 2 von 6: Wächter Partie und Lese
create or replace function public.p364_zahl(x numeric)
returns text language sql immutable set search_path to 'public' as $$
  select replace(rtrim(to_char(x, 'FM999999990.999'), '.'), '.', ',')
$$;

create or replace function public.p364_partie_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and auth.uid() <> old.owner_user_id then raise exception 'Löschen kann nur die Geschäftsleitung.'; end if;
    if exists (select 1 from public.wein_kellerbuch k where k.partie_id = old.id) or exists (select 1 from public.wein_lese l where l.partie_id = old.id) then
      raise exception 'Die Partie hat schon Einträge im Kellerbuch oder im Lesebuch und bleibt als Nachweis gespeichert.';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.bestand_l := 0;
    new.erstellt_am := now();
    new.erfasst_name := public.p353_name(new.owner_user_id);
    new.bezeichnung := btrim(new.bezeichnung);
    return new;
  end if;
  new.owner_user_id := old.owner_user_id; new.erstellt_am := old.erstellt_am; new.erfasst_name := old.erfasst_name;
  if current_setting('p364.bestand', true) is distinct from 'an' then new.bestand_l := old.bestand_l; end if;
  if new.jahrgang <> old.jahrgang and (exists (select 1 from public.wein_kellerbuch k where k.partie_id = old.id) or exists (select 1 from public.wein_lese l where l.partie_id = old.id)) then
    raise exception 'Der Jahrgang einer Partie mit Einträgen bleibt, wie er ist.';
  end if;
  new.bezeichnung := btrim(new.bezeichnung);
  return new;
end;
$$;

create or replace function public.p364_lese_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_n integer; v_owner uuid; v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then raise exception 'Lesebuch-Einträge bleiben als Nachweis gespeichert. Bei Fehlern bitte stornieren (Geschäftsleitung).'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.lesedatum > v_heute then raise exception 'Das Lesedatum liegt in der Zukunft.'; end if;
    if new.jahrgang not in (extract(year from new.lesedatum)::integer, extract(year from new.lesedatum)::integer - 1) then
      raise exception 'Der Jahrgang passt nicht zum Lesedatum (gleiches Jahr, bei Eiswein auch das Vorjahr).';
    end if;
    if new.partie_id is not null then
      select p.owner_user_id into v_owner from public.wein_partie p where p.id = new.partie_id;
      if v_owner is null or v_owner <> new.owner_user_id then raise exception 'Die Partie gehört nicht zu Ihrem Betrieb.'; end if;
    end if;
    perform pg_advisory_xact_lock(hashtext('p364:' || new.owner_user_id::text || ':' || new.jahrgang::text));
    select coalesce(max(nullif(split_part(l.nummer, '-', 2), '')::integer), 0) + 1 into v_n
      from public.wein_lese l where l.owner_user_id = new.owner_user_id and l.nummer like new.jahrgang::text || '-%';
    new.nummer := new.jahrgang::text || '-' || lpad(v_n::text, greatest(3, length(v_n::text)), '0');
    new.storniert := false; new.storno_grund := null;
    new.erfasst_am := now();
    new.erfasst_name := public.p353_name(new.owner_user_id);
    new.weinberg := btrim(new.weinberg); new.rebsorte := btrim(new.rebsorte);
    return new;
  end if;
  if old.storniert then raise exception 'Dieser Lesebuch-Eintrag ist storniert.'; end if;
  if new.storniert then
    if auth.uid() is not null and auth.uid() <> old.owner_user_id then raise exception 'Stornieren kann nur die Geschäftsleitung.'; end if;
    if char_length(btrim(coalesce(new.storno_grund, ''))) < 10 then raise exception 'Bitte einen Storno-Grund angeben (mindestens 10 Zeichen).'; end if;
    old.storniert := true; old.storno_grund := btrim(new.storno_grund);
    return old;
  end if;
  raise exception 'Lesebuch-Einträge werden nur angehängt. Bei Fehlern bitte stornieren (Geschäftsleitung) und neu erfassen.';
end;
$$;

-- Nach dem Speichern: Most in die Partie buchen bzw. beim Storno wieder ausbuchen.
create or replace function public.p364_lese_nach()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.partie_id is null or new.most_l is null then return null; end if;
  perform set_config('p364.intern', 'an', true);
  if tg_op = 'INSERT' then
    insert into public.wein_kellerbuch (owner_user_id, partie_id, datum, art, menge_l, lese_id, bemerkung)
    values (new.owner_user_id, new.partie_id, new.lesedatum, 'zugang_lese', new.most_l, new.id,
            left('Lese ' || new.nummer || ' · ' || new.weinberg || ' · ' || new.rebsorte, 1000));
  elsif new.storniert and not old.storniert then
    insert into public.wein_kellerbuch (owner_user_id, partie_id, art, menge_l, lese_id, bemerkung)
    values (new.owner_user_id, new.partie_id, 'storno_lese', new.most_l, new.id, left('Storno Lese ' || new.nummer || ': ' || new.storno_grund, 1000));
  end if;
  perform set_config('p364.intern', '', true);
  return null;
end;
$$;

-- TEIL 3 von 6: Wächter Kellerbuch + Auslöser
create or replace function public.p364_kellerbuch_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_p record; v_vorz integer; v_neu numeric; v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if tg_op <> 'INSERT' then
    if auth.uid() is not null then raise exception 'Das Kellerbuch wird nur fortgeschrieben. Bei einem Fehler bitte einen Gegeneintrag mit Bemerkung erfassen.'; end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select * into v_p from public.wein_partie p where p.id = new.partie_id for update;
  if v_p.id is null or v_p.owner_user_id <> new.owner_user_id then raise exception 'Die Partie gehört nicht zu Ihrem Betrieb.'; end if;
  if new.art in ('zugang_lese', 'storno_lese', 'verschnitt_zu', 'verschnitt_ab', 'abfuellung') and current_setting('p364.intern', true) is distinct from 'an' then
    raise exception 'Lese, Verschnitt und Abfüllung bitte über die eigenen Knöpfe erfassen.';
  end if;
  if new.datum > v_heute then raise exception 'Das Datum liegt in der Zukunft.'; end if;
  v_vorz := case when new.art in ('zugang', 'zugang_lese', 'verschnitt_zu') then 1
                 when new.art in ('abgang', 'verschnitt_ab', 'abfuellung', 'schwund', 'storno_lese') then -1 else 0 end;
  if v_vorz <> 0 and new.menge_l is null then raise exception 'Bitte die Menge in Litern angeben.'; end if;
  if v_vorz = 0 then new.menge_l := null; end if;
  if new.art in ('anreicherung', 'entsaeuerung', 'saeuerung', 'suessung', 'schwefelung', 'schoenung') and nullif(btrim(coalesce(new.mittel, '')), '') is null then
    raise exception 'Bitte das verwendete Mittel angeben.';
  end if;
  if new.art = 'analyse' and coalesce(new.alkohol_vol, new.restzucker_gl, new.saeure_gl, new.so2_frei_mgl, new.so2_gesamt_mgl) is null then
    raise exception 'Bitte mindestens einen Analysewert angeben.';
  end if;
  if new.art = 'sonstiges' and nullif(btrim(coalesce(new.bemerkung, '')), '') is null then raise exception 'Bitte beschreiben, was gemacht wurde.'; end if;
  if new.art <> 'analyse' then new.alkohol_vol := null; new.restzucker_gl := null; new.saeure_gl := null; new.so2_frei_mgl := null; new.so2_gesamt_mgl := null; end if;
  v_neu := v_p.bestand_l + v_vorz * coalesce(new.menge_l, 0);
  if v_neu < 0 then
    raise exception 'Nicht genug Wein in der Partie (Bestand % l).', public.p364_zahl(v_p.bestand_l);
  end if;
  if v_vorz <> 0 then
    perform set_config('p364.bestand', 'an', true);
    update public.wein_partie set bestand_l = v_neu where id = v_p.id;
    perform set_config('p364.bestand', '', true);
  end if;
  new.bestand_nach_l := v_neu;
  new.erfasst_am := now();
  new.erfasst_name := public.p353_name(new.owner_user_id);
  new.mittel := nullif(btrim(coalesce(new.mittel, '')), '');
  new.bemerkung := nullif(btrim(coalesce(new.bemerkung, '')), '');
  return new;
end;
$$;

do $$
begin
  drop trigger if exists p364_waechter on public.wein_partie;
  create trigger p364_waechter before insert or update or delete on public.wein_partie for each row execute function public.p364_partie_waechter();
  drop trigger if exists p364_waechter on public.wein_lese;
  create trigger p364_waechter before insert or update or delete on public.wein_lese for each row execute function public.p364_lese_waechter();
  drop trigger if exists p364_nach on public.wein_lese;
  create trigger p364_nach after insert or update on public.wein_lese for each row execute function public.p364_lese_nach();
  drop trigger if exists p364_waechter on public.wein_kellerbuch;
  create trigger p364_waechter before insert or update or delete on public.wein_kellerbuch for each row execute function public.p364_kellerbuch_waechter();
end $$;

-- TEIL 4 von 6: Verschnitt und Abfüllung in einem Zug
create or replace function public.p364_verschnitt(p_von uuid, p_nach uuid, p_menge numeric, p_datum date, p_bemerkung text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_betrieb uuid := coalesce(public.mein_chef_id(), auth.uid()); v_von record; v_nach record;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  if p_von = p_nach then raise exception 'Bitte zwei verschiedene Partien wählen.' using errcode = '22023'; end if;
  if p_menge is null or p_menge <= 0 then raise exception 'Bitte die Menge in Litern angeben.' using errcode = '22023'; end if;
  select * into v_von from public.wein_partie where id = p_von;
  select * into v_nach from public.wein_partie where id = p_nach;
  if v_von.id is null or v_nach.id is null or v_von.owner_user_id <> v_betrieb or v_nach.owner_user_id <> v_betrieb then
    raise exception 'Partie nicht gefunden.' using errcode = '42501';
  end if;
  perform set_config('p364.intern', 'an', true);
  insert into public.wein_kellerbuch (owner_user_id, partie_id, datum, art, menge_l, gegen_partie_id, bemerkung)
  values (v_betrieb, p_von, coalesce(p_datum, (now() at time zone 'Europe/Berlin')::date), 'verschnitt_ab', p_menge, p_nach,
          left('Verschnitt in ' || v_nach.bezeichnung || coalesce(' · ' || nullif(btrim(p_bemerkung), ''), ''), 1000));
  insert into public.wein_kellerbuch (owner_user_id, partie_id, datum, art, menge_l, gegen_partie_id, bemerkung)
  values (v_betrieb, p_nach, coalesce(p_datum, (now() at time zone 'Europe/Berlin')::date), 'verschnitt_zu', p_menge, p_von,
          left('Verschnitt aus ' || v_von.bezeichnung || ' (Jahrgang ' || v_von.jahrgang || coalesce(', ' || v_von.rebsorte, '') || ')' || coalesce(' · ' || nullif(btrim(p_bemerkung), ''), ''), 1000));
  perform set_config('p364.intern', '', true);
end $$;
revoke all on function public.p364_verschnitt(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.p364_verschnitt(uuid, uuid, numeric, date, text) to authenticated;

create or replace function public.p364_abfuellen(p_partie uuid, p_flaschen integer, p_nenn_l numeric, p_charge_nr text, p_datum date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_betrieb uuid := coalesce(public.mein_chef_id(), auth.uid());
  v_p record; v_nr text := left(btrim(coalesce(p_charge_nr, '')), 60); v_los uuid; v_menge numeric; v_lesen text; v_herkunft text;
  v_datum date := coalesce(p_datum, (now() at time zone 'Europe/Berlin')::date);
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  select * into v_p from public.wein_partie where id = p_partie;
  if v_p.id is null or v_p.owner_user_id <> v_betrieb then raise exception 'Partie nicht gefunden.' using errcode = '42501'; end if;
  if p_flaschen is null or p_flaschen <= 0 then raise exception 'Bitte die Zahl der Flaschen angeben.' using errcode = '22023'; end if;
  if p_nenn_l is null or p_nenn_l <= 0 or p_nenn_l > 30 then raise exception 'Bitte den Flascheninhalt in Litern angeben (z. B. 0,75).' using errcode = '22023'; end if;
  if v_nr = '' then raise exception 'Bitte eine Chargennummer (Los) angeben.' using errcode = '22023'; end if;
  if exists (select 1 from public.charge_los l where l.owner_user_id = v_betrieb and lower(btrim(l.charge_nr)) = lower(v_nr)) then
    raise exception 'Die Chargennummer % gibt es schon.', v_nr using errcode = '23505';
  end if;
  v_menge := trim_scale(p_flaschen * p_nenn_l);

  perform set_config('p364.intern', 'an', true);
  insert into public.wein_kellerbuch (owner_user_id, partie_id, datum, art, menge_l, charge_nr, bemerkung)
  values (v_betrieb, v_p.id, v_datum, 'abfuellung', v_menge, v_nr,
          left(p_flaschen || ' Flaschen à ' || public.p364_zahl(p_nenn_l) || ' l, Los ' || v_nr, 1000));
  perform set_config('p364.intern', '', true);

  select string_agg(l.nummer, ', ' order by l.nummer) into v_lesen from public.wein_lese l where l.partie_id = v_p.id and not l.storniert;
  select string_agg(distinct q.bezeichnung, ', ') into v_herkunft
    from public.wein_kellerbuch k join public.wein_partie q on q.id = k.gegen_partie_id
   where k.partie_id = v_p.id and k.art = 'verschnitt_zu';

  insert into public.charge_los (owner_user_id, charge_nr, typ, bezeichnung, menge, einheit, herstell_datum, herkunft, status, bemerkung)
  values (v_betrieb, v_nr, 'charge', left(v_p.bezeichnung, 200), p_flaschen, 'Fl.', v_datum,
          left('Weinbau Partie ' || v_p.bezeichnung || ' · Jahrgang ' || v_p.jahrgang, 200), 'quarantaene',
          left(p_flaschen || ' Fl. à ' || public.p364_zahl(p_nenn_l) || ' l = ' || public.p364_zahl(v_menge) || ' l'
               || coalesce(' · Lese ' || v_lesen, '') || coalesce(' · Verschnitt aus ' || v_herkunft, ''), 1000))
  returning id into v_los;

  insert into public.charge_verwendung (owner_user_id, los_id, richtung, referenz, menge, datum, notiz)
  values (v_betrieb, v_los, 'eingang', left('Partie ' || v_p.bezeichnung, 200), v_menge, v_datum,
          left('Abfüllung aus Partie ' || v_p.bezeichnung || ' (Jahrgang ' || v_p.jahrgang || ')' || coalesce(' · Lese ' || v_lesen, ''), 500));
  return v_los;
end $$;
revoke all on function public.p364_abfuellen(uuid, integer, numeric, text, date) from public, anon;
grant execute on function public.p364_abfuellen(uuid, integer, numeric, text, date) to authenticated;

-- TEIL 5 von 6: Regeln
do $$
declare t text;
begin
  foreach t in array array['wein_partie', 'wein_lese', 'wein_kellerbuch'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists p364_owner_all on public.%I', t);
    execute format('create policy p364_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p364_ma_select on public.%I', t);
    execute format('create policy p364_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''weinbau'') or public.darf_ich_modul_aendern(''weinbau'')))', t);
    execute format('drop policy if exists p364_ma_insert on public.%I', t);
    execute format('create policy p364_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''weinbau''))', t);
  end loop;
  drop policy if exists p364_ma_update on public.wein_partie;
  create policy p364_ma_update on public.wein_partie for update to authenticated
    using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('weinbau'))
    with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('weinbau'));
end $$;

-- TEIL 6 von 6: Kontrolle (erwartet: tabellen 3 | regeln 10 | ausloeser 4 | funktionen 2)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('wein_partie', 'wein_lese', 'wein_kellerbuch')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('wein_partie', 'wein_lese', 'wein_kellerbuch')) as regeln,
  (select count(*) from pg_trigger where tgname in ('p364_waechter', 'p364_nach') and not tgisinternal) as ausloeser,
  (select count(*) from pg_proc where proname in ('p364_verschnitt', 'p364_abfuellen')) as funktionen;
