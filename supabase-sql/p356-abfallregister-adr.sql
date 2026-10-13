-- ============================================================
-- ARGONAUT OS · Paket 356 (13.10.2026) · A4c Fachpaket Entsorgung, Teil 2
-- Abfallregister (Nachweisbuch) und ADR-Beförderungspapier (Inland) mit
-- 1000-Punkte-Rechnung.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- abfall_register:  ein Eintrag je Annahme, Abgabe oder Beförderung — Datum,
--                   Abfallschlüssel (Abbild zum Zeitpunkt), Menge, Erzeuger,
--                   Beförderer, Entsorger mit ihren Nummern, Entsorgungs-
--                   nachweis-, Begleit-/Übernahmeschein-Nummer, Verfahren
--                   (R/D). Zeit und Name der erfassenden Person setzt die
--                   Datenbank. Nur anhängen: Korrektur = Storno mit Grund
--                   (nur Geschäftsleitung) und neuer Eintrag. Je Wiegeschein
--                   höchstens ein gültiger Eintrag.
--                   ARGONAUT übermittelt NICHTS an das eANV/die ZKS — das
--                   bleibt beim Betrieb.
-- adr_papier:       Beförderungspapier nach ADR 5.4.1 für Fahrten im Inland.
--                   Positionen (UN-Nummer, Benennung, Klasse, Verpackungs-
--                   gruppe, Tunnelcode, Versandstücke, Menge, Beförderungs-
--                   kategorie) als Liste. Nummer je Jahr von der Datenbank.
--                   Entwurf änderbar; ausgestellt bleibt es, wie es ist
--                   (Storno nur Geschäftsleitung mit Grund).
--
-- Rechte wie Paket 355 (Modul „entsorgung"). Mitarbeiter löschen nichts.
-- Die Betriebsnummern (Erzeuger-, Beförderer-, Entsorgernummer) stehen in
-- modul_einstellung, Modul „entsorgung" (Tabelle seit Paket 259, Chef schreibt).
-- Voraussetzung: Paket 355 (abfall_schluessel, wiegeschein) und 353 (p353_name).
-- ============================================================

-- TEIL 1 von 6: Abfallregister
create table if not exists public.abfall_register (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  datum                date not null,
  richtung             text not null default 'annahme' check (richtung in ('annahme', 'abgabe', 'befoerderung')),
  abfall_schluessel_id uuid not null references public.abfall_schluessel(id) on delete restrict,
  abfall_schluessel    text,
  abfall_bezeichnung   text,
  gefaehrlich          boolean not null default false,
  menge                numeric(12,3) not null check (menge > 0 and menge <= 100000000),
  einheit              text not null default 'kg' check (einheit in ('kg', 't', 'm3', 'stk')),
  erzeuger             text check (erzeuger is null or char_length(erzeuger) <= 300),
  erzeuger_nr          text check (erzeuger_nr is null or char_length(erzeuger_nr) <= 20),
  befoerderer          text check (befoerderer is null or char_length(befoerderer) <= 300),
  befoerderer_nr       text check (befoerderer_nr is null or char_length(befoerderer_nr) <= 20),
  entsorger            text check (entsorger is null or char_length(entsorger) <= 300),
  entsorger_nr         text check (entsorger_nr is null or char_length(entsorger_nr) <= 20),
  nachweis_nr          text check (nachweis_nr is null or char_length(nachweis_nr) <= 40),
  schein_nr            text check (schein_nr is null or char_length(schein_nr) <= 40),
  verfahren            text check (verfahren is null or verfahren ~ '^(R([1-9]|1[0-3])|D([1-9]|1[0-5]))$'),
  kennzeichen          text check (kennzeichen is null or char_length(kennzeichen) <= 15),
  wiegeschein_id       uuid references public.wiegeschein(id) on delete restrict,
  notiz                text check (notiz is null or char_length(notiz) <= 500),
  status               text not null default 'gueltig' check (status in ('gueltig', 'storniert')),
  storno_grund         text check (storno_grund is null or char_length(storno_grund) <= 300),
  storniert_am         timestamptz,
  erfasst_am           timestamptz not null default now(),
  erfasst_von          uuid,
  erfasst_name         text
);
create index if not exists abfall_register_idx on public.abfall_register (owner_user_id, datum desc);
create unique index if not exists abfall_register_ein_schein on public.abfall_register (wiegeschein_id) where status = 'gueltig' and wiegeschein_id is not null;

-- TEIL 2 von 6: ADR-Beförderungspapier
create table if not exists public.adr_papier (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer          text,
  datum           date not null,
  absender        text not null check (char_length(absender) between 1 and 300),
  empfaenger      text not null check (char_length(empfaenger) between 1 and 300),
  befoerderer     text check (befoerderer is null or char_length(befoerderer) <= 300),
  kennzeichen     text check (kennzeichen is null or char_length(kennzeichen) <= 15),
  wiegeschein_id  uuid references public.wiegeschein(id) on delete restrict,
  positionen      jsonb not null default '[]'::jsonb check (jsonb_typeof(positionen) = 'array' and jsonb_array_length(positionen) <= 20),
  hinweise        text check (hinweise is null or char_length(hinweise) <= 1000),
  status          text not null default 'entwurf' check (status in ('entwurf', 'ausgestellt', 'storniert')),
  ausgestellt_am  timestamptz,
  ausgestellt_name text,
  storno_grund    text check (storno_grund is null or char_length(storno_grund) <= 300),
  storniert_am    timestamptz,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint adr_papier_nummer_eindeutig unique (owner_user_id, nummer)
);
create index if not exists adr_papier_idx on public.adr_papier (owner_user_id, datum desc);

-- TEIL 3 von 6: Wächter Abfallregister (nur anhängen, Storno durch die Geschäftsleitung)
create or replace function public.p356_register_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_status text; v_grund text; v_s text; v_b text; v_g boolean;
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'gueltig' then raise exception 'Der Registereintrag ist storniert und bleibt, wie er ist.'; end if;
    v_status := new.status; v_grund := trim(coalesce(new.storno_grund, ''));
    new := old;
    if v_status <> 'storniert' then raise exception 'Ein Registereintrag bleibt, wie er ist — Korrektur: stornieren und neu eintragen.'; end if;
    if auth.uid() is not null and auth.uid() is distinct from old.owner_user_id then raise exception 'Stornieren darf nur die Geschäftsleitung.'; end if;
    if v_grund = '' then raise exception 'Bitte einen Grund für das Storno eintragen.'; end if;
    new.status := 'storniert'; new.storno_grund := left(v_grund, 300); new.storniert_am := now();
    return new;
  end if;
  new.status := 'gueltig'; new.storno_grund := null; new.storniert_am := null;
  if new.datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Das Datum des Registereintrags liegt in der Zukunft.'; end if;
  select a.schluessel, a.bezeichnung, a.gefaehrlich into v_s, v_b, v_g from public.abfall_schluessel a where a.id = new.abfall_schluessel_id and a.owner_user_id = new.owner_user_id;
  if v_s is null then raise exception 'Der Abfallschlüssel gehört nicht zu Ihrem Betrieb.'; end if;
  new.abfall_schluessel := v_s; new.abfall_bezeichnung := v_b; new.gefaehrlich := v_g;
  if new.wiegeschein_id is not null then
    if not exists (select 1 from public.wiegeschein w where w.id = new.wiegeschein_id and w.owner_user_id = new.owner_user_id and w.status = 'abgeschlossen') then
      raise exception 'Der Wiegeschein gehört nicht zu Ihrem Betrieb oder ist nicht abgeschlossen.';
    end if;
  end if;
  new.kennzeichen := nullif(upper(trim(coalesce(new.kennzeichen, ''))), '');
  new.verfahren := nullif(upper(trim(coalesce(new.verfahren, ''))), '');
  new.erfasst_am := now();
  new.erfasst_von := auth.uid();
  new.erfasst_name := public.p353_name(new.owner_user_id);
  return new;
end;
$$;

create or replace function public.p356_nie_loeschen()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_table_name = 'adr_papier' and old.status = 'entwurf' then return old; end if;
  if current_user in ('authenticated', 'anon') then
    raise exception 'Dieser Eintrag bleibt erhalten — stornieren statt löschen.';
  end if;
  return old;
end;
$$;

-- TEIL 4 von 6: Wächter ADR-Papier (Nummer, Pflichtangaben beim Ausstellen, danach fest)
create or replace function public.p356_adr_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_jahr text; v_n integer; v_status text; v_grund text;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'storniert' then raise exception 'Das Beförderungspapier ist storniert und bleibt, wie es ist.'; end if;
    if old.status = 'ausgestellt' then
      v_status := new.status; v_grund := trim(coalesce(new.storno_grund, ''));
      new := old;
      if v_status <> 'storniert' then raise exception 'Das Beförderungspapier ist ausgestellt und bleibt, wie es ist — Korrektur = neues Papier.'; end if;
      if auth.uid() is not null and auth.uid() is distinct from old.owner_user_id then raise exception 'Stornieren darf nur die Geschäftsleitung.'; end if;
      if v_grund = '' then raise exception 'Bitte einen Grund für das Storno eintragen.'; end if;
      new.status := 'storniert'; new.storno_grund := left(v_grund, 300); new.storniert_am := now(); new.aktualisiert_am := now();
      return new;
    end if;
    if new.owner_user_id is distinct from old.owner_user_id then raise exception 'Der Betrieb eines Papiers kann nicht geändert werden.'; end if;
    new.nummer := old.nummer; new.erstellt_am := old.erstellt_am;
  else
    if new.status = 'storniert' then raise exception 'Ein neues Papier kann nicht storniert angelegt werden.'; end if;
    new.erstellt_am := now();
    v_jahr := to_char(now() at time zone 'Europe/Berlin', 'YYYY');
    perform pg_advisory_xact_lock(hashtext('p356_adr_' || new.owner_user_id::text));
    select coalesce(max(split_part(a.nummer, '-', 3)::integer), 0) + 1 into v_n
      from public.adr_papier a where a.owner_user_id = new.owner_user_id and a.nummer like 'ADR-' || v_jahr || '-%' and split_part(a.nummer, '-', 3) ~ '^[0-9]{1,9}$';
    new.nummer := 'ADR-' || v_jahr || '-' || lpad(v_n::text, greatest(4, length(v_n::text)), '0');
  end if;
  new.aktualisiert_am := now();
  new.kennzeichen := nullif(upper(trim(coalesce(new.kennzeichen, ''))), '');
  new.ausgestellt_am := null; new.ausgestellt_name := null; new.storniert_am := null;
  if new.wiegeschein_id is not null then
    if not exists (select 1 from public.wiegeschein w where w.id = new.wiegeschein_id and w.owner_user_id = new.owner_user_id) then
      raise exception 'Der Wiegeschein gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  if new.status = 'storniert' then
    if coalesce(trim(new.storno_grund), '') = '' then raise exception 'Bitte einen Grund für das Storno eintragen.'; end if;
    new.storniert_am := now();
  elsif new.status = 'ausgestellt' then
    if jsonb_array_length(new.positionen) = 0 then raise exception 'Zum Ausstellen fehlt mindestens eine Gefahrgut-Position.'; end if;
    if exists (select 1 from jsonb_array_elements(new.positionen) e
               where coalesce(e->>'un_nr', '') !~ '^[0-9]{4}$' or coalesce(trim(e->>'benennung'), '') = ''
                  or coalesce(e->>'klasse', '') !~ '^(1\.[1-6]|2\.[1-3]|3|4\.[1-3]|5\.[12]|6\.[12]|7|8|9)$'
                  or coalesce(trim(e->>'versandstuecke'), '') = '' or coalesce(trim(e->>'menge'), '') = '') then
      raise exception 'Zum Ausstellen fehlen Pflichtangaben: je Position UN-Nummer (4 Ziffern), Benennung, Klasse, Versandstücke und Menge.';
    end if;
    new.ausgestellt_am := now();
    new.ausgestellt_name := public.p353_name(new.owner_user_id);
  end if;
  return new;
end;
$$;

-- TEIL 5 von 6: Auslöser und Rechte (Modul „entsorgung"). Registereinträge
-- ändert auch die Geschäftsleitung nur per Storno (Wächter).
do $$
declare
  t text;
begin
  foreach t in array array['abfall_register', 'adr_papier'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop trigger if exists p356_waechter on public.%I', t);
    execute format('create trigger p356_waechter before insert or update on public.%I for each row execute function public.%I()', t,
      case t when 'abfall_register' then 'p356_register_waechter' else 'p356_adr_waechter' end);
    execute format('drop trigger if exists p356_nie_loeschen on public.%I', t);
    execute format('create trigger p356_nie_loeschen before delete on public.%I for each row execute function public.p356_nie_loeschen()', t);
    execute format('drop policy if exists p356_owner_all on public.%I', t);
    execute format('create policy p356_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p356_ma_select on public.%I', t);
    execute format('create policy p356_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''entsorgung'') or public.darf_ich_modul_aendern(''entsorgung'')))', t);
    execute format('drop policy if exists p356_ma_insert on public.%I', t);
    execute format('create policy p356_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''entsorgung''))', t);
    execute format('drop policy if exists p356_ma_update on public.%I', t);
    execute format('create policy p356_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''entsorgung'')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''entsorgung''))', t);
  end loop;
end $$;

-- TEIL 6 von 6: KONTROLLE — Erwartung: tabellen = 2 | regeln = 8 | ausloeser = 6 | rls_an = 2
-- (regeln = 10 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('abfall_register', 'adr_papier')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('abfall_register', 'adr_papier')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.abfall_register'::regclass, 'public.adr_papier'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('abfall_register', 'adr_papier') and relrowsecurity) as rls_an;
