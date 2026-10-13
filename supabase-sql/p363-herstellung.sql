-- ============================================================
-- ARGONAUT OS · Paket 363 (13.10.2026) · A4e Fachpaket Lebensmittel-Herstellung
-- Herstellungsprotokoll für Brauerei (Sud), Molkerei, Mühle und jede andere
-- Herstellung im Großen: Schritte mit Messwerten (Temperatur, Zeit, °P, pH …),
-- eingesetzte Rohstoff-Chargen, Soll-/Ist-Menge und Ausbeute. Beim Abschluss
-- entsteht die Produkt-Charge in der Chargenverwaltung (Quarantäne) samt
-- Rückverfolgung zu den Rohstoff-Chargen — gesperrte Rohstoffe lehnt der
-- vorhandene Wächter p320 ab.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- herstell_protokoll:  Nummer JJJJ-NNN je Betrieb (Datenbank), Art sud/milch/mahlgang/ansatz,
--                      Rezeptur (optional), Soll/Ist, Stammwürze (Brauerei), Status
--                      offen → abgeschlossen (fest) bzw. storniert (Grund, nur Geschäftsleitung).
-- herstell_messung:    Messwerte je Schritt; Zeit und Name vom Server; nur anhängen.
-- herstell_rohstoff:   eingesetzte Rohstoffe mit Charge; nach Abschluss fest.
-- p363_abschliessen(): Abschluss in einem Zug (Charge + Rückverfolgung + Status).
--
-- Rechte: Modul „herstellung" (sehen/ändern); Mitarbeiter löschen nichts.
-- Kein Aussperr-Risiko: an Chargen, Rezepturen und Lager ändert sich nichts.
-- Voraussetzung: charge_los, charge_verwendung (+ p320), rezepturen, p353_name().
-- ============================================================

-- TEIL 1 von 6: Tabellen
create table if not exists public.herstell_protokoll (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer          text,
  art             text not null check (art in ('sud', 'milch', 'mahlgang', 'ansatz')),
  bezeichnung     text not null check (char_length(btrim(bezeichnung)) between 1 and 200),
  rezeptur_id     uuid references public.rezepturen(id) on delete set null,
  soll_menge      numeric check (soll_menge is null or soll_menge > 0),
  ist_menge       numeric check (ist_menge is null or ist_menge > 0),
  einheit         text not null default 'l' check (char_length(einheit) between 1 and 20),
  stammwuerze_p   numeric check (stammwuerze_p is null or (stammwuerze_p >= 0 and stammwuerze_p <= 40)),
  begonnen_am     timestamptz not null default now(),
  beendet_am      timestamptz,
  status          text not null default 'offen' check (status in ('offen', 'abgeschlossen', 'storniert')),
  charge_nr       text,
  charge_los_id   uuid,
  mhd             date,
  notiz           text check (notiz is null or char_length(notiz) <= 2000),
  storno_grund    text,
  erfasst_von     uuid,
  erfasst_name    text,
  abgeschlossen_name text,
  erstellt_am     timestamptz not null default now()
);
create unique index if not exists herstell_protokoll_nummer_uidx on public.herstell_protokoll (owner_user_id, nummer);

create table if not exists public.herstell_messung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  protokoll_id    uuid not null references public.herstell_protokoll(id) on delete restrict,
  schritt         text not null check (char_length(btrim(schritt)) between 1 and 100),
  groesse         text not null check (char_length(btrim(groesse)) between 1 and 60),
  wert            numeric,
  einheit         text check (einheit is null or char_length(einheit) <= 20),
  bemerkung       text check (bemerkung is null or char_length(bemerkung) <= 500),
  gemessen_am     timestamptz not null default now(),
  erfasst_am      timestamptz not null default now(),
  erfasst_name    text,
  constraint herstell_messung_inhalt check (wert is not null or nullif(btrim(coalesce(bemerkung, '')), '') is not null)
);
create index if not exists herstell_messung_protokoll_idx on public.herstell_messung (protokoll_id, gemessen_am);

create table if not exists public.herstell_rohstoff (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  protokoll_id    uuid not null references public.herstell_protokoll(id) on delete restrict,
  bezeichnung     text not null check (char_length(btrim(bezeichnung)) between 1 and 200),
  charge_nr       text check (charge_nr is null or char_length(charge_nr) <= 60),
  menge           numeric check (menge is null or menge > 0),
  einheit         text check (einheit is null or char_length(einheit) <= 20),
  erfasst_am      timestamptz not null default now()
);
create index if not exists herstell_rohstoff_protokoll_idx on public.herstell_rohstoff (protokoll_id);

-- TEIL 2 von 6: Wächter Protokoll (Nummer je Jahr, Abschluss fest, Storno nur Chef mit Grund)
create or replace function public.p363_protokoll_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_jahr text; v_n integer;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'offen' then raise exception 'Abgeschlossene oder stornierte Protokolle bleiben als Nachweis gespeichert.'; end if;
    if auth.uid() is not null and auth.uid() <> old.owner_user_id then raise exception 'Löschen kann nur die Geschäftsleitung.'; end if;
    if exists (select 1 from public.herstell_messung m where m.protokoll_id = old.id) then
      raise exception 'Das Protokoll hat schon Messwerte. Bitte stornieren statt löschen.';
    end if;
    delete from public.herstell_rohstoff r where r.protokoll_id = old.id;
    return old;
  end if;
  if tg_op = 'INSERT' then
    v_jahr := to_char(now() at time zone 'Europe/Berlin', 'YYYY');
    perform pg_advisory_xact_lock(hashtext('p363:' || new.owner_user_id::text || ':' || v_jahr));
    select coalesce(max(nullif(split_part(p.nummer, '-', 2), '')::integer), 0) + 1 into v_n
      from public.herstell_protokoll p where p.owner_user_id = new.owner_user_id and p.nummer like v_jahr || '-%';
    new.nummer := v_jahr || '-' || lpad(v_n::text, greatest(3, length(v_n::text)), '0');
    new.status := 'offen'; new.beendet_am := null; new.charge_los_id := null; new.storno_grund := null; new.abgeschlossen_name := null;
    new.erstellt_am := now();
    new.erfasst_von := coalesce(auth.uid(), new.erfasst_von);
    new.erfasst_name := public.p353_name(new.owner_user_id);
    new.bezeichnung := btrim(new.bezeichnung);
    return new;
  end if;
  -- UPDATE
  new.owner_user_id := old.owner_user_id; new.nummer := old.nummer; new.erstellt_am := old.erstellt_am;
  new.erfasst_von := old.erfasst_von; new.erfasst_name := old.erfasst_name;
  if old.status = 'storniert' then raise exception 'Dieses Protokoll ist storniert.'; end if;
  if old.status = 'abgeschlossen' then
    if new.status = 'storniert' then
      if auth.uid() is not null and auth.uid() <> old.owner_user_id then raise exception 'Stornieren kann nur die Geschäftsleitung.'; end if;
      if char_length(btrim(coalesce(new.storno_grund, ''))) < 10 then raise exception 'Bitte einen Storno-Grund angeben (mindestens 10 Zeichen).'; end if;
      old.status := 'storniert'; old.storno_grund := btrim(new.storno_grund);
      return old;
    end if;
    if current_setting('p363.abschluss', true) = 'an' then return new; end if;
    raise exception 'Ein abgeschlossenes Protokoll bleibt, wie es ist. Bei Fehlern bitte stornieren (Geschäftsleitung).';
  end if;
  -- offen
  if new.status = 'abgeschlossen' and current_setting('p363.abschluss', true) is distinct from 'an' then
    raise exception 'Abschließen bitte über „Abschließen" (legt die Charge an).';
  end if;
  if new.status = 'storniert' then
    if auth.uid() is not null and auth.uid() <> old.owner_user_id then raise exception 'Stornieren kann nur die Geschäftsleitung.'; end if;
    if char_length(btrim(coalesce(new.storno_grund, ''))) < 10 then raise exception 'Bitte einen Storno-Grund angeben (mindestens 10 Zeichen).'; end if;
    new.storno_grund := btrim(new.storno_grund);
  end if;
  return new;
end;
$$;

-- TEIL 3 von 6: Wächter Messwerte und Rohstoffe
create or replace function public.p363_kind_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_status text; v_owner uuid; v_pid uuid;
begin
  v_pid := case when tg_op = 'DELETE' then old.protokoll_id else new.protokoll_id end;
  select p.status, p.owner_user_id into v_status, v_owner from public.herstell_protokoll p where p.id = v_pid;
  if tg_table_name = 'herstell_messung' then
    if tg_op <> 'INSERT' and auth.uid() is not null then raise exception 'Messwerte werden nur angehängt. Bei einem Fehler bitte eine Korrektur mit Bemerkung erfassen.'; end if;
    if tg_op = 'INSERT' then
      if v_owner is null or v_owner <> new.owner_user_id then raise exception 'Das Protokoll gehört nicht zu Ihrem Betrieb.'; end if;
      if v_status <> 'offen' then raise exception 'Das Protokoll ist abgeschlossen.'; end if;
      new.erfasst_am := now();
      new.erfasst_name := public.p353_name(new.owner_user_id);
      if new.gemessen_am > now() + interval '5 minutes' then raise exception 'Der Messzeitpunkt liegt in der Zukunft.'; end if;
      new.schritt := btrim(new.schritt); new.groesse := btrim(new.groesse);
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- herstell_rohstoff
  if v_status is not null and v_status <> 'offen' and current_setting('p363.abschluss', true) is distinct from 'an' then
    raise exception 'Das Protokoll ist abgeschlossen — Rohstoffe bleiben, wie sie sind.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if v_owner is null or v_owner <> new.owner_user_id then raise exception 'Das Protokoll gehört nicht zu Ihrem Betrieb.'; end if;
  new.bezeichnung := btrim(new.bezeichnung);
  new.charge_nr := nullif(btrim(coalesce(new.charge_nr, '')), '');
  return new;
end;
$$;

do $$
begin
  drop trigger if exists p363_waechter on public.herstell_protokoll;
  create trigger p363_waechter before insert or update or delete on public.herstell_protokoll for each row execute function public.p363_protokoll_waechter();
  drop trigger if exists p363_waechter on public.herstell_messung;
  create trigger p363_waechter before insert or update or delete on public.herstell_messung for each row execute function public.p363_kind_waechter();
  drop trigger if exists p363_waechter on public.herstell_rohstoff;
  create trigger p363_waechter before insert or update or delete on public.herstell_rohstoff for each row execute function public.p363_kind_waechter();
end $$;

-- TEIL 4 von 6: Abschluss in einem Zug (Rechte des Nutzers: Regeln von charge_los/charge_verwendung + Wächter p320)
create or replace function public.p363_abschliessen(p_protokoll uuid, p_ist_menge numeric, p_charge_nr text, p_mhd date, p_stammwuerze numeric)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_betrieb uuid := coalesce(public.mein_chef_id(), auth.uid());
  v_p record; v_nr text := left(btrim(coalesce(p_charge_nr, '')), 60); v_los uuid; v_r record; v_roh_los uuid; v_ref text;
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  select * into v_p from public.herstell_protokoll where id = p_protokoll for update;
  if v_p.id is null or v_p.owner_user_id <> v_betrieb then raise exception 'Protokoll nicht gefunden.' using errcode = '42501'; end if;
  if v_p.status <> 'offen' then raise exception 'Das Protokoll ist schon abgeschlossen oder storniert.'; end if;
  if p_ist_menge is null or p_ist_menge <= 0 then raise exception 'Bitte die Ist-Menge angeben.' using errcode = '22023'; end if;
  if v_nr = '' then raise exception 'Bitte eine Chargennummer angeben.' using errcode = '22023'; end if;
  if v_p.art = 'sud' and (p_stammwuerze is null or p_stammwuerze <= 0 or p_stammwuerze > 40) then
    raise exception 'Bitte die Stammwürze in °P angeben (0 bis 40).' using errcode = '22023';
  end if;
  if p_mhd is not null and p_mhd < v_heute then raise exception 'Das MHD liegt in der Vergangenheit.' using errcode = '22023'; end if;
  if exists (select 1 from public.charge_los l where l.owner_user_id = v_betrieb and lower(btrim(l.charge_nr)) = lower(v_nr)) then
    raise exception 'Die Chargennummer % gibt es schon.', v_nr using errcode = '23505';
  end if;

  insert into public.charge_los (owner_user_id, charge_nr, typ, bezeichnung, menge, einheit, herstell_datum, mhd, herkunft, status, bemerkung)
  values (v_betrieb, v_nr, 'charge', v_p.bezeichnung, p_ist_menge, v_p.einheit, v_heute, p_mhd,
          left('Herstellung ' || v_p.nummer, 200), 'quarantaene', left('Aus Herstellungsprotokoll ' || v_p.nummer, 1000))
  returning id into v_los;

  for v_r in select * from public.herstell_rohstoff where protokoll_id = v_p.id order by erfasst_am loop
    v_ref := left(coalesce(v_r.charge_nr, v_r.bezeichnung), 200);
    insert into public.charge_verwendung (owner_user_id, los_id, richtung, referenz, menge, datum, notiz)
    values (v_betrieb, v_los, 'eingang', v_ref, v_r.menge, v_heute, left('Rohstoff ' || v_r.bezeichnung || ' (Protokoll ' || v_p.nummer || ')', 500));
    if v_r.charge_nr is not null then
      select l.id into v_roh_los from public.charge_los l where l.owner_user_id = v_betrieb and lower(btrim(l.charge_nr)) = lower(v_r.charge_nr) limit 1;
      if v_roh_los is not null then
        insert into public.charge_verwendung (owner_user_id, los_id, richtung, referenz, menge, datum, notiz)
        values (v_betrieb, v_roh_los, 'ausgang', v_nr, v_r.menge, v_heute, left('In Charge ' || v_nr || ' (Protokoll ' || v_p.nummer || ')', 500));
      end if;
      v_roh_los := null;
    end if;
  end loop;

  perform set_config('p363.abschluss', 'an', true);
  update public.herstell_protokoll set status = 'abgeschlossen', ist_menge = p_ist_menge, charge_nr = v_nr, charge_los_id = v_los,
    mhd = p_mhd, stammwuerze_p = case when v_p.art = 'sud' then p_stammwuerze else stammwuerze_p end,
    beendet_am = now(), abgeschlossen_name = public.p353_name(v_betrieb)
   where id = v_p.id;
  perform set_config('p363.abschluss', '', true);
  return v_los;
end $$;
revoke all on function public.p363_abschliessen(uuid, numeric, text, date, numeric) from public, anon;
grant execute on function public.p363_abschliessen(uuid, numeric, text, date, numeric) to authenticated;

-- TEIL 5 von 6: Regeln. Modul „herstellung": sehen bzw. ändern; Mitarbeiter löschen nichts.
do $$
declare t text;
begin
  foreach t in array array['herstell_protokoll', 'herstell_messung', 'herstell_rohstoff'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists p363_owner_all on public.%I', t);
    execute format('create policy p363_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p363_ma_select on public.%I', t);
    execute format('create policy p363_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''herstellung'') or public.darf_ich_modul_aendern(''herstellung'')))', t);
    execute format('drop policy if exists p363_ma_insert on public.%I', t);
    execute format('create policy p363_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''herstellung''))', t);
  end loop;
  drop policy if exists p363_ma_update on public.herstell_protokoll;
  create policy p363_ma_update on public.herstell_protokoll for update to authenticated
    using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('herstellung'))
    with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('herstellung'));
  drop policy if exists p363_ma_rohstoff_delete on public.herstell_rohstoff;
  create policy p363_ma_rohstoff_delete on public.herstell_rohstoff for delete to authenticated
    using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('herstellung'));
end $$;

-- TEIL 6 von 6: KONTROLLE — Erwartung: tabellen = 3 | regeln = 11 | ausloeser = 3 | funktion = 1
-- (regeln = 14 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel aus Paket 164, je Tabelle)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('herstell_protokoll', 'herstell_messung', 'herstell_rohstoff')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('herstell_protokoll', 'herstell_messung', 'herstell_rohstoff')) as regeln,
  (select count(*) from pg_trigger where tgname = 'p363_waechter' and not tgisinternal) as ausloeser,
  (select count(*) from pg_proc where proname = 'p363_abschliessen') as funktion;
