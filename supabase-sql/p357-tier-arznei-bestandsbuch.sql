-- ============================================================
-- ARGONAUT OS · Paket 357 (13.10.2026) · A4d Fachpaket Tierhaltung
-- Arzneimittel-Bestandsbuch für Höfe mit Nutztieren: Erwerb (Eingang) und
-- Anwendung je Tiergruppe mit Wartezeiten für Fleisch, Milch und Eier.
-- Baut auf dem Tierbestand auf (tier_gruppe, Paket A6).
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- tier_arznei_eingang:   Erwerb eines Tierarzneimittels — Datum, Mittel,
--                        Zulassungsnummer, Charge, Menge, Lieferant (Tierarzt
--                        bzw. Apotheke), Belegnummer (AuA-Beleg/Lieferschein).
-- tier_arznei_anwendung: Anwendung — Tiergruppe (Abbild von Bezeichnung und
--                        Tierart), Kennzeichnung der Tiere, Anzahl, Mittel,
--                        Belegnummer, Menge, Behandlung von/bis, Wartezeiten in
--                        Tagen. „Frei ab" rechnet die Datenbank: letzter
--                        Behandlungstag + Wartezeit. Antibiotikum ja/nein für
--                        die halbjährliche Übersicht.
--
-- Beide nur anhängen: Zeit und Name der erfassenden Person setzt die
-- Datenbank; Korrektur = Storno mit Grund (nur Geschäftsleitung) und neuer
-- Eintrag; nie löschen. Rechte über das Modul „tierbestand"; Mitarbeiter
-- tragen ein und lesen, stornieren nicht.
-- ARGONAUT übermittelt NICHTS an HIT oder die Antibiotika-Datenbank — das
-- bleibt beim Betrieb.
-- Voraussetzung: tier_gruppe (Tierbestand), Paket 181 (p181_besitzer) und
-- Paket 353 (p353_name).
-- ============================================================

-- TEIL 1 von 6: Erwerb (Eingang)
create table if not exists public.tier_arznei_eingang (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  datum           date not null,
  arzneimittel    text not null check (char_length(arzneimittel) between 1 and 200),
  zulassungs_nr   text check (zulassungs_nr is null or char_length(zulassungs_nr) <= 40),
  charge          text check (charge is null or char_length(charge) <= 40),
  menge           numeric(12,3) not null check (menge > 0 and menge <= 10000000),
  einheit         text not null default 'ml' check (einheit in ('ml', 'l', 'g', 'kg', 'stk', 'dosis')),
  lieferant       text not null check (char_length(lieferant) between 1 and 300),
  beleg_nr        text check (beleg_nr is null or char_length(beleg_nr) <= 40),
  verfall         date,
  notiz           text check (notiz is null or char_length(notiz) <= 500),
  status          text not null default 'gueltig' check (status in ('gueltig', 'storniert')),
  storno_grund    text check (storno_grund is null or char_length(storno_grund) <= 300),
  storniert_am    timestamptz,
  erfasst_am      timestamptz not null default now(),
  erfasst_von     uuid,
  erfasst_name    text
);
create index if not exists tier_arznei_eingang_idx on public.tier_arznei_eingang (owner_user_id, datum desc);

-- TEIL 2 von 6: Anwendung
create table if not exists public.tier_arznei_anwendung (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  gruppe_id          uuid not null references public.tier_gruppe(id) on delete restrict,
  gruppe_bezeichnung text,
  tierart            text,
  tier_kennung       text check (tier_kennung is null or char_length(tier_kennung) <= 1000),
  anzahl_tiere       integer not null check (anzahl_tiere between 1 and 100000),
  arzneimittel       text not null check (char_length(arzneimittel) between 1 and 200),
  eingang_id         uuid references public.tier_arznei_eingang(id) on delete restrict,
  beleg_nr           text check (beleg_nr is null or char_length(beleg_nr) <= 40),
  menge              numeric(12,3) not null check (menge > 0 and menge <= 10000000),
  einheit            text not null default 'ml' check (einheit in ('ml', 'l', 'g', 'kg', 'stk', 'dosis')),
  dosierung          text check (dosierung is null or char_length(dosierung) <= 200),
  datum_von          date not null,
  datum_bis          date not null,
  wartezeit_fleisch  integer check (wartezeit_fleisch is null or wartezeit_fleisch between 0 and 999),
  wartezeit_milch    integer check (wartezeit_milch is null or wartezeit_milch between 0 and 999),
  wartezeit_eier     integer check (wartezeit_eier is null or wartezeit_eier between 0 and 999),
  frei_fleisch_ab    date generated always as (datum_bis + wartezeit_fleisch) stored,
  frei_milch_ab      date generated always as (datum_bis + wartezeit_milch) stored,
  frei_eier_ab       date generated always as (datum_bis + wartezeit_eier) stored,
  antibiotikum       boolean not null default false,
  tierarzt           text check (tierarzt is null or char_length(tierarzt) <= 300),
  anwender_name      text not null check (char_length(anwender_name) between 1 and 200),
  notiz              text check (notiz is null or char_length(notiz) <= 500),
  status             text not null default 'gueltig' check (status in ('gueltig', 'storniert')),
  storno_grund       text check (storno_grund is null or char_length(storno_grund) <= 300),
  storniert_am       timestamptz,
  erfasst_am         timestamptz not null default now(),
  erfasst_von        uuid,
  erfasst_name       text,
  constraint tier_arznei_anwendung_zeitraum check (datum_bis >= datum_von and datum_bis <= datum_von + 365),
  constraint tier_arznei_anwendung_wartezeit check (wartezeit_fleisch is not null or wartezeit_milch is not null or wartezeit_eier is not null)
);
create index if not exists tier_arznei_anwendung_idx on public.tier_arznei_anwendung (owner_user_id, datum_von desc);
create index if not exists tier_arznei_anwendung_gruppe on public.tier_arznei_anwendung (gruppe_id, datum_bis desc);

-- TEIL 3 von 6: Wächter (nur anhängen, Storno durch die Geschäftsleitung, Bezüge im Betrieb)
create or replace function public.p357_arznei_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_status text; v_grund text; v_b text; v_a text;
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'gueltig' then raise exception 'Der Eintrag ist storniert und bleibt, wie er ist.'; end if;
    v_status := new.status; v_grund := trim(coalesce(new.storno_grund, ''));
    new := old;
    if v_status <> 'storniert' then raise exception 'Ein Eintrag im Bestandsbuch bleibt, wie er ist — Korrektur: stornieren und neu eintragen.'; end if;
    if auth.uid() is not null and auth.uid() is distinct from old.owner_user_id then raise exception 'Stornieren darf nur die Geschäftsleitung.'; end if;
    if v_grund = '' then raise exception 'Bitte einen Grund für das Storno eintragen.'; end if;
    new.status := 'storniert'; new.storno_grund := left(v_grund, 300); new.storniert_am := now();
    return new;
  end if;
  new.status := 'gueltig'; new.storno_grund := null; new.storniert_am := null;
  if tg_table_name = 'tier_arznei_eingang' then
    if new.datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Das Datum des Erwerbs liegt in der Zukunft.'; end if;
  else
    if new.datum_von > (now() at time zone 'Europe/Berlin')::date then raise exception 'Der Beginn der Behandlung liegt in der Zukunft.'; end if;
    select g.bezeichnung, g.tierart into v_b, v_a from public.tier_gruppe g where g.id = new.gruppe_id and g.owner_user_id = new.owner_user_id;
    if v_b is null then raise exception 'Die Tiergruppe gehört nicht zu Ihrem Betrieb.'; end if;
    new.gruppe_bezeichnung := v_b; new.tierart := v_a;
    if new.eingang_id is not null and not exists (
      select 1 from public.tier_arznei_eingang e where e.id = new.eingang_id and e.owner_user_id = new.owner_user_id and e.status = 'gueltig') then
      raise exception 'Der Erwerb gehört nicht zu Ihrem Betrieb oder ist storniert.';
    end if;
  end if;
  new.erfasst_am := now();
  new.erfasst_von := auth.uid();
  new.erfasst_name := public.p353_name(new.owner_user_id);
  return new;
end;
$$;

create or replace function public.p357_nie_loeschen()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Einträge im Bestandsbuch bleiben erhalten — stornieren statt löschen.';
  end if;
  return old;
end;
$$;

-- TEIL 4 von 6: Auslöser
do $$
declare t text;
begin
  foreach t in array array['tier_arznei_eingang', 'tier_arznei_anwendung'] loop
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop trigger if exists p357_waechter on public.%I', t);
    execute format('create trigger p357_waechter before insert or update on public.%I for each row execute function public.p357_arznei_waechter()', t);
    execute format('drop trigger if exists p357_nie_loeschen on public.%I', t);
    execute format('create trigger p357_nie_loeschen before delete on public.%I for each row execute function public.p357_nie_loeschen()', t);
  end loop;
end $$;

-- TEIL 5 von 6: Rechte (Modul „tierbestand"). Mitarbeiter lesen und tragen ein,
-- sie ändern und löschen nichts. Auch die Geschäftsleitung ändert nur per Storno (Wächter).
do $$
declare t text;
begin
  foreach t in array array['tier_arznei_eingang', 'tier_arznei_anwendung'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists p357_owner_all on public.%I', t);
    execute format('create policy p357_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p357_ma_select on public.%I', t);
    execute format('create policy p357_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''tierbestand'') or public.darf_ich_modul_aendern(''tierbestand'')))', t);
    execute format('drop policy if exists p357_ma_insert on public.%I', t);
    execute format('create policy p357_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''tierbestand''))', t);
  end loop;
end $$;

-- TEIL 6 von 6: KONTROLLE — Erwartung: tabellen = 2 | regeln = 6 | ausloeser = 6 | rls_an = 2
-- (regeln = 8 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('tier_arznei_eingang', 'tier_arznei_anwendung')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('tier_arznei_eingang', 'tier_arznei_anwendung')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.tier_arznei_eingang'::regclass, 'public.tier_arznei_anwendung'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('tier_arznei_eingang', 'tier_arznei_anwendung') and relrowsecurity) as rls_an;
