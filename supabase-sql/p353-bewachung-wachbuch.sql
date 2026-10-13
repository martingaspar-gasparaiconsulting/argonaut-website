-- ============================================================
-- ARGONAUT OS · Paket 353 (13.10.2026) · A4b Fachpaket Bewachung, Teil 1
-- Wachbuch und Kontrollgänge (Wächterkontrolle mit QR-Kontrollpunkten).
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- wach_kontrollpunkt:  Kontrollpunkte je Objekt (Tabelle objekte). Den Code
--                      für den QR-Aufkleber vergibt die Datenbank — zufällig,
--                      10 Zeichen, später nicht änderbar.
-- wach_rundgang:       ein Kontrollgang (wer, welches Objekt, Beginn/Ende).
--                      Beginn und Ende setzt die Datenbank (Serverzeit).
--                      Nach dem Ende bleibt er, wie er ist.
-- wach_scan:           ein gescannter Kontrollpunkt. Zeit = Serverzeit,
--                      Standort nur, wenn die Wachkraft ihn mitsendet.
--                      Nur anhängen — nie ändern, nie löschen.
-- wachbuch_eintrag:    das Wachbuch je Objekt (Meldung, Vorkommnis, Übergabe,
--                      Schaden, Polizei/Feuerwehr/Rettung, Nachtrag). Zeit und
--                      Name setzt die Datenbank. Nur anhängen: Korrekturen sind
--                      ein Nachtrag mit Bezug — auch die Geschäftsleitung ändert
--                      und löscht nichts.
--
-- Rechte: Besitzer = Betrieb (p181_besitzer). Mitarbeiter lesen mit Modul
-- „bewachung", gehen Rundgänge und schreiben ins Wachbuch mit Schreibrecht.
-- Löschen: nur Kontrollpunkte ohne Scans, nur die Geschäftsleitung.
-- ============================================================

-- TEIL 1 von 6: Tabellen
create table if not exists public.wach_kontrollpunkt (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  objekt_id       uuid not null,
  name            text not null check (char_length(name) between 1 and 120),
  hinweis         text check (hinweis is null or char_length(hinweis) <= 300),
  code            text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) check (code ~ '^[0-9A-F]{10}$'),
  position        integer not null default 0,
  aktiv           boolean not null default true,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint wach_kontrollpunkt_code_eindeutig unique (code)
);
create index if not exists wach_kontrollpunkt_idx on public.wach_kontrollpunkt (owner_user_id, objekt_id, position);

create table if not exists public.wach_rundgang (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  objekt_id        uuid not null,
  mitarbeiter_user uuid,
  mitarbeiter_name text,
  gestartet_am     timestamptz not null default now(),
  beendet_am       timestamptz,
  status           text not null default 'laeuft' check (status in ('laeuft', 'beendet', 'abgebrochen')),
  notiz            text check (notiz is null or char_length(notiz) <= 500),
  aktualisiert_am  timestamptz not null default now()
);
create index if not exists wach_rundgang_idx on public.wach_rundgang (owner_user_id, objekt_id, gestartet_am desc);
create unique index if not exists wach_rundgang_einer_laeuft on public.wach_rundgang (owner_user_id, mitarbeiter_user) where status = 'laeuft';

create table if not exists public.wach_scan (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  rundgang_id      uuid not null references public.wach_rundgang(id) on delete restrict,
  kontrollpunkt_id uuid not null references public.wach_kontrollpunkt(id) on delete restrict,
  gescannt_am      timestamptz not null default now(),
  art              text not null default 'qr' check (art in ('qr', 'code')),
  lat              numeric(9,6) check (lat is null or lat between -90 and 90),
  lon              numeric(9,6) check (lon is null or lon between -180 and 180),
  genauigkeit_m    integer check (genauigkeit_m is null or genauigkeit_m between 0 and 100000),
  erfasst_von      uuid,
  constraint wach_scan_standort check ((lat is null) = (lon is null))
);
create index if not exists wach_scan_idx on public.wach_scan (owner_user_id, rundgang_id, gescannt_am);

create table if not exists public.wachbuch_eintrag (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  objekt_id     uuid not null,
  art           text not null default 'meldung' check (art in ('meldung', 'vorkommnis', 'uebergabe', 'schaden', 'polizei', 'nachtrag')),
  text          text not null check (char_length(text) between 1 and 4000),
  ereignis_am   timestamptz,
  bezug_id      uuid references public.wachbuch_eintrag(id) on delete restrict,
  rundgang_id   uuid references public.wach_rundgang(id) on delete restrict,
  erfasst_am    timestamptz not null default now(),
  erfasst_von   uuid,
  erfasst_name  text,
  constraint wachbuch_nachtrag check ((art = 'nachtrag') = (bezug_id is not null))
);
create index if not exists wachbuch_eintrag_idx on public.wachbuch_eintrag (owner_user_id, objekt_id, erfasst_am desc);

-- TEIL 2 von 6: Name der angemeldeten Person (für Wachbuch und Rundgang)
create or replace function public.p353_name(p_betrieb uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare v text;
begin
  if auth.uid() is null then return 'System'; end if;
  begin
    select nullif(trim(coalesce(m.vorname, '') || ' ' || coalesce(m.nachname, '')), '') into v
      from public.mitarbeiter m where m.auth_user_id = auth.uid() and m.owner_user_id = p_betrieb limit 1;
  exception when others then v := null;
  end;
  if v is not null then return v; end if;
  if auth.uid() = p_betrieb then return 'Geschäftsleitung'; end if;
  return 'Mitarbeiter';
end;
$$;
revoke all on function public.p353_name(uuid) from public, anon;

-- TEIL 3 von 6: Wächter für Kontrollpunkt und Rundgang
create or replace function public.p353_punkt_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner_user_id is distinct from old.owner_user_id then raise exception 'Der Betrieb eines Kontrollpunkts kann nicht geändert werden.'; end if;
    if new.objekt_id is distinct from old.objekt_id then raise exception 'Ein Kontrollpunkt wandert nicht in ein anderes Objekt — legen Sie dort einen neuen an.'; end if;
    new.code := old.code;
    new.erstellt_am := old.erstellt_am;
  else
    new.code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    new.erstellt_am := now();
    if not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.owner_user_id = new.owner_user_id) then
      raise exception 'Das Objekt gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$$;

create or replace function public.p353_rundgang_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.owner_user_id = new.owner_user_id) then
      raise exception 'Das Objekt gehört nicht zu Ihrem Betrieb.';
    end if;
    new.mitarbeiter_user := auth.uid();
    new.mitarbeiter_name := public.p353_name(new.owner_user_id);
    new.gestartet_am := now();
    new.status := 'laeuft';
    new.beendet_am := null;
  else
    if old.status <> 'laeuft' then raise exception 'Der Rundgang ist abgeschlossen und bleibt, wie er ist.'; end if;
    if auth.uid() is not null and auth.uid() is distinct from old.mitarbeiter_user and auth.uid() is distinct from old.owner_user_id then
      raise exception 'Einen Rundgang beendet, wer ihn geht — oder die Geschäftsleitung.';
    end if;
    new.owner_user_id := old.owner_user_id;
    new.objekt_id := old.objekt_id;
    new.mitarbeiter_user := old.mitarbeiter_user;
    new.mitarbeiter_name := old.mitarbeiter_name;
    new.gestartet_am := old.gestartet_am;
    if new.status = 'laeuft' then new.beendet_am := null; else new.beendet_am := now(); end if;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$$;

-- TEIL 4 von 6: Wächter für Scan und Wachbuch (Zeit und Name setzt die Datenbank)
create or replace function public.p353_scan_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_objekt uuid; v_status text; v_wer uuid; v_punkt_objekt uuid; v_aktiv boolean;
begin
  select r.objekt_id, r.status, r.mitarbeiter_user into v_objekt, v_status, v_wer
    from public.wach_rundgang r where r.id = new.rundgang_id and r.owner_user_id = new.owner_user_id;
  if v_objekt is null then raise exception 'Der Rundgang gehört nicht zu Ihrem Betrieb.'; end if;
  if v_status <> 'laeuft' then raise exception 'Der Rundgang ist beendet — bitte einen neuen beginnen.'; end if;
  if auth.uid() is not null and auth.uid() is distinct from v_wer and auth.uid() is distinct from new.owner_user_id then
    raise exception 'Scannen kann nur, wer den Rundgang geht.';
  end if;
  select k.objekt_id, k.aktiv into v_punkt_objekt, v_aktiv
    from public.wach_kontrollpunkt k where k.id = new.kontrollpunkt_id and k.owner_user_id = new.owner_user_id;
  if v_punkt_objekt is null then raise exception 'Der Kontrollpunkt gehört nicht zu Ihrem Betrieb.'; end if;
  if v_punkt_objekt <> v_objekt then raise exception 'Dieser Kontrollpunkt gehört zu einem anderen Objekt.'; end if;
  if not v_aktiv then raise exception 'Dieser Kontrollpunkt ist ausgeblendet.'; end if;
  new.gescannt_am := now();
  new.erfasst_von := auth.uid();
  return new;
end;
$$;

create or replace function public.p353_buch_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.owner_user_id = new.owner_user_id) then
    raise exception 'Das Objekt gehört nicht zu Ihrem Betrieb.';
  end if;
  if new.bezug_id is not null then
    if not exists (select 1 from public.wachbuch_eintrag w where w.id = new.bezug_id and w.owner_user_id = new.owner_user_id and w.objekt_id = new.objekt_id) then
      raise exception 'Ein Nachtrag bezieht sich auf einen Eintrag desselben Objekts.';
    end if;
  end if;
  if new.rundgang_id is not null then
    if not exists (select 1 from public.wach_rundgang r where r.id = new.rundgang_id and r.owner_user_id = new.owner_user_id and r.objekt_id = new.objekt_id) then
      raise exception 'Der Rundgang gehört zu einem anderen Objekt.';
    end if;
  end if;
  if new.ereignis_am is not null and new.ereignis_am > now() + interval '5 minutes' then
    raise exception 'Der Zeitpunkt des Ereignisses liegt in der Zukunft.';
  end if;
  new.erfasst_am := now();
  new.erfasst_von := auth.uid();
  new.erfasst_name := public.p353_name(new.owner_user_id);
  return new;
end;
$$;

-- Nur anhängen: Scan und Wachbuch werden nie geändert. Löschen nur außerhalb der
-- App (spätere Löschfrist über die Service-Rolle), nie durch angemeldete Nutzer.
create or replace function public.p353_fest()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Dieser Eintrag bleibt, wie er ist — Korrekturen bitte als Nachtrag.';
  end if;
  if current_user in ('authenticated', 'anon') then
    raise exception 'Dieser Eintrag bleibt, wie er ist — Korrekturen bitte als Nachtrag.';
  end if;
  return old;
end;
$$;

-- TEIL 5 von 6: Auslöser und Rechte (Modul „bewachung")
do $$
declare
  t text;
begin
  foreach t in array array['wach_kontrollpunkt', 'wach_rundgang', 'wach_scan', 'wachbuch_eintrag'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop trigger if exists p353_waechter on public.%I', t);
    execute format('create trigger p353_waechter before insert%s on public.%I for each row execute function public.%I()',
      case when t in ('wach_kontrollpunkt', 'wach_rundgang') then ' or update' else '' end, t,
      case t when 'wach_kontrollpunkt' then 'p353_punkt_waechter' when 'wach_rundgang' then 'p353_rundgang_waechter'
             when 'wach_scan' then 'p353_scan_waechter' else 'p353_buch_waechter' end);
    -- Geschäftsleitung: lesen und anlegen überall; ändern nur Kontrollpunkte und Rundgänge; löschen nur Kontrollpunkte
    execute format('drop policy if exists p353_owner_select on public.%I', t);
    execute format('create policy p353_owner_select on public.%I for select to authenticated using (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p353_owner_insert on public.%I', t);
    execute format('create policy p353_owner_insert on public.%I for insert to authenticated with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p353_ma_select on public.%I', t);
    execute format('create policy p353_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''bewachung'') or public.darf_ich_modul_aendern(''bewachung'')))', t);
    execute format('drop policy if exists p353_ma_insert on public.%I', t);
    execute format('create policy p353_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bewachung''))', t);
    if t in ('wach_kontrollpunkt', 'wach_rundgang') then
      execute format('drop policy if exists p353_owner_update on public.%I', t);
      execute format('create policy p353_owner_update on public.%I for update to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
      execute format('drop policy if exists p353_ma_update on public.%I', t);
      execute format('create policy p353_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bewachung'')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bewachung''))', t);
    end if;
  end loop;
  drop policy if exists p353_owner_delete on public.wach_kontrollpunkt;
  create policy p353_owner_delete on public.wach_kontrollpunkt for delete to authenticated using (auth.uid() = owner_user_id);
end $$;

drop trigger if exists p353_fest on public.wach_scan;
create trigger p353_fest before update or delete on public.wach_scan for each row execute function public.p353_fest();
drop trigger if exists p353_fest on public.wachbuch_eintrag;
create trigger p353_fest before update or delete on public.wachbuch_eintrag for each row execute function public.p353_fest();

-- TEIL 6 von 6: KONTROLLE — Erwartung: tabellen = 4 | regeln = 21 | ausloeser = 10 | rls_an = 4
-- (regeln = 25 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('wach_kontrollpunkt', 'wach_rundgang', 'wach_scan', 'wachbuch_eintrag')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('wach_kontrollpunkt', 'wach_rundgang', 'wach_scan', 'wachbuch_eintrag')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.wach_kontrollpunkt'::regclass, 'public.wach_rundgang'::regclass, 'public.wach_scan'::regclass, 'public.wachbuch_eintrag'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('wach_kontrollpunkt', 'wach_rundgang', 'wach_scan', 'wachbuch_eintrag') and relrowsecurity) as rls_an;
