-- ============================================================
-- ARGONAUT OS · Paket 362 (13.10.2026) · VK11 Anruf-Sperrliste und Erlaubnis-Ampel
-- Telefonwerbung nach § 7 Abs. 2 Nr. 1 UWG: Verbraucher nur mit vorheriger
-- ausdrücklicher Einwilligung, Firmen bei zumindest mutmaßlicher Einwilligung.
-- Einwilligungen in Telefonwerbung werden nach § 7a UWG dokumentiert und
-- aufbewahrt (nur anhängen, nie löschen).
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- telefon_sperre:       gesperrte Nummern je Betrieb (Widerspruch, falsche Nummer,
--                       von Hand). Jeder im Team kann sperren; nur die Geschäftsleitung
--                       entsperrt — mit Grund, die Zeile bleibt als Nachweis.
-- telefon_einwilligung: Einwilligung in Anrufe mit Quelle, Datum und Nachweis.
--                       Widerruf kann jeder im Team eintragen; er sperrt die Nummer.
-- kontakte / leads:     neue Spalte ist_verbraucher (leer = noch nicht eingeordnet).
-- vk_anruf:             neue Spalten erlaubnis + erlaubnis_grund = Nachweis je Anruf.
--
-- Wächter beim Erfassen eines Anrufs (zusätzlich zu Paket 360):
--   · gesperrte Nummer → abgelehnt
--   · Lead (eigene Anfrage) → erlaubnis „eigene_anfrage", sonst Pflicht
--   · Einwilligung nur, wenn eine gültige vorliegt
--   · „mutmaßlich" nie bei Verbrauchern; „mutmaßlich" und „kein Werbeanruf" nur mit Grund
--
-- HINWEIS ZUR REIHENFOLGE: Zwischen diesem SQL und dem Push von _p362 lassen sich
-- Anrufe an KONTAKTEN nicht speichern (die alte Seite schickt noch keine Erlaubnis).
-- Anrufe an Leads gehen weiter. Bitte SQL und Push direkt nacheinander.
-- Voraussetzung: Paket 353 (p353_name), 358 (p358_frei), 360 (vk_anruf).
-- ============================================================

-- TEIL 1 von 6: Nummern einheitlich (wie lib/anrufErlaubnis.ts nummerNorm)
create or replace function public.p362_nummer(p text)
returns text language plpgsql immutable as $$
declare s text; z text;
begin
  -- „+49 (0)7031 …“: die (0) gehört nicht zur Nummer
  s := regexp_replace(replace(coalesce(p, ''), '(0)', ''), '[^0-9+]', '', 'g');
  if s = '' then return null; end if;
  if left(s, 1) = '+' then z := regexp_replace(substr(s, 2), '[^0-9]', '', 'g');
  elsif left(s, 2) = '00' then z := substr(s, 3);
  elsif left(s, 1) = '0' then z := '49' || substr(s, 2);
  else return null; -- ohne Vorwahl nicht eindeutig
  end if;
  if length(z) < 6 or length(z) > 16 then return null; end if;
  return '+' || z;
end;
$$;

-- TEIL 2 von 6: Tabellen und Spalten
create table if not exists public.telefon_sperre (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer          text not null check (nummer ~ '^\+[0-9]{6,16}$'),
  quelle          text not null default 'widerspruch' check (quelle in ('widerspruch', 'falsche_nummer', 'manuell')),
  grund           text check (grund is null or char_length(grund) <= 500),
  kontakt_id      uuid references public.kontakte(id) on delete set null,
  lead_id         uuid references public.leads(id) on delete set null,
  gesperrt_am     timestamptz not null default now(),
  erfasst_von     uuid,
  erfasst_name    text,
  entsperrt_am    timestamptz,
  entsperrt_grund text,
  entsperrt_name  text
);
create unique index if not exists telefon_sperre_aktiv_uidx on public.telefon_sperre (owner_user_id, nummer) where entsperrt_am is null;

create table if not exists public.telefon_einwilligung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  kontakt_id      uuid references public.kontakte(id) on delete set null,
  lead_id         uuid references public.leads(id) on delete set null,
  nummer          text not null check (nummer ~ '^\+[0-9]{6,16}$'),
  quelle          text not null check (quelle in ('schriftlich', 'online_formular', 'mail', 'muendlich')),
  erteilt_am      date not null,
  nachweis        text not null check (char_length(btrim(nachweis)) between 10 and 1000),
  widerrufen_am   timestamptz,
  widerruf_grund  text,
  erfasst_am      timestamptz not null default now(),
  erfasst_von     uuid,
  erfasst_name    text
);
create index if not exists telefon_einwilligung_nummer_idx on public.telefon_einwilligung (owner_user_id, nummer);

alter table public.kontakte add column if not exists ist_verbraucher boolean;
alter table public.leads add column if not exists ist_verbraucher boolean;
alter table public.vk_anruf add column if not exists erlaubnis text;
alter table public.vk_anruf add column if not exists erlaubnis_grund text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vk_anruf_erlaubnis_chk') then
    alter table public.vk_anruf add constraint vk_anruf_erlaubnis_chk check (erlaubnis is null or erlaubnis in ('eigene_anfrage', 'einwilligung', 'mutmasslich', 'kein_werbeanruf'));
  end if;
end $$;

-- TEIL 3 von 6: Wächter Sperrliste und Einwilligung
create or replace function public.p362_sperre_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then raise exception 'Gesperrte Nummern bleiben als Nachweis gespeichert. Entsperren kann die Geschäftsleitung mit Grund.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.entsperrt_am is not null then raise exception 'Diese Sperre ist schon aufgehoben. Für eine neue Sperre bitte neu sperren.'; end if;
    if auth.uid() is not null and auth.uid() <> old.owner_user_id then raise exception 'Entsperren kann nur die Geschäftsleitung.'; end if;
    if new.entsperrt_am is null or char_length(btrim(coalesce(new.entsperrt_grund, ''))) < 10 then
      raise exception 'Bitte einen Grund für das Entsperren angeben (mindestens 10 Zeichen), z. B. neue schriftliche Einwilligung.';
    end if;
    -- Nur die Entsperr-Felder ändern sich, alles andere bleibt wie gespeichert.
    old.entsperrt_grund := btrim(new.entsperrt_grund);
    old.entsperrt_am := now();
    old.entsperrt_name := public.p353_name(old.owner_user_id);
    return old;
  end if;
  new.nummer := coalesce(public.p362_nummer(new.nummer), new.nummer);
  new.gesperrt_am := now();
  new.erfasst_von := coalesce(auth.uid(), new.erfasst_von);
  new.erfasst_name := public.p353_name(new.owner_user_id);
  new.entsperrt_am := null; new.entsperrt_grund := null; new.entsperrt_name := null;
  if exists (select 1 from public.telefon_sperre s where s.owner_user_id = new.owner_user_id and s.nummer = new.nummer and s.entsperrt_am is null) then
    return null; -- schon gesperrt: nichts tun, kein Fehler
  end if;
  return new;
end;
$$;

create or replace function public.p362_einwilligung_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then raise exception 'Einwilligungen werden als Nachweis aufbewahrt (§ 7a UWG). Bei Widerruf bitte „widerrufen" eintragen.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.widerrufen_am is not null then raise exception 'Diese Einwilligung ist schon widerrufen.'; end if;
    if new.widerrufen_am is null then raise exception 'Eine Einwilligung lässt sich nicht ändern — nur widerrufen.'; end if;
    -- Nur der Widerruf wird eingetragen, alles andere bleibt wie gespeichert.
    old.widerruf_grund := nullif(btrim(coalesce(new.widerruf_grund, '')), '');
    old.widerrufen_am := now();
    return old;
  end if;
  new.nummer := coalesce(public.p362_nummer(new.nummer), new.nummer);
  if new.erteilt_am > (now() at time zone 'Europe/Berlin')::date then raise exception 'Das Datum der Einwilligung liegt in der Zukunft.'; end if;
  new.erfasst_am := now();
  new.erfasst_von := coalesce(auth.uid(), new.erfasst_von);
  new.erfasst_name := public.p353_name(new.owner_user_id);
  new.widerrufen_am := null; new.widerruf_grund := null;
  new.nachweis := btrim(new.nachweis);
  return new;
end;
$$;

-- Widerruf sperrt die Nummer sofort.
create or replace function public.p362_widerruf_sperrt()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.widerrufen_am is not null and old.widerrufen_am is null then
    insert into public.telefon_sperre (owner_user_id, nummer, quelle, grund, kontakt_id, lead_id)
      values (new.owner_user_id, new.nummer, 'widerspruch', coalesce('Einwilligung widerrufen: ' || new.widerruf_grund, 'Einwilligung widerrufen'), new.kontakt_id, new.lead_id);
  end if;
  return new;
end;
$$;

-- TEIL 4 von 6: Wächter am Anruf (zusätzlich zu p360_waechter)
create or replace function public.p362_anruf_erlaubnis()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_tel text; v_nr text; v_verbr boolean;
begin
  if new.lead_id is null and new.kontakt_id is null then return new; end if; -- Pflicht-Bezug prüft vk_anruf_bezug
  if new.lead_id is not null then
    select l.telefon, l.ist_verbraucher into v_tel, v_verbr from public.leads l where l.id = new.lead_id;
  else
    select coalesce(nullif(k.telefon, ''), k.mobil), k.ist_verbraucher into v_tel, v_verbr from public.kontakte k where k.id = new.kontakt_id;
  end if;
  v_nr := public.p362_nummer(v_tel);
  if v_nr is not null and exists (select 1 from public.telefon_sperre s where s.owner_user_id = new.owner_user_id and s.nummer = v_nr and s.entsperrt_am is null) then
    raise exception 'Diese Nummer ist gesperrt (Widerspruch). Bitte nicht anrufen.';
  end if;
  if new.erlaubnis is null and new.lead_id is not null then new.erlaubnis := 'eigene_anfrage'; end if;
  if new.erlaubnis is null then
    raise exception 'Vor dem Anruf bitte angeben, warum er erlaubt ist (Einwilligung, Firma mit mutmaßlichem Interesse oder kein Werbeanruf).';
  end if;
  if new.erlaubnis = 'eigene_anfrage' and new.lead_id is null then
    raise exception '„Eigene Anfrage" gilt nur für Leads.';
  end if;
  if new.erlaubnis = 'einwilligung' and not exists (
      select 1 from public.telefon_einwilligung e where e.owner_user_id = new.owner_user_id and e.widerrufen_am is null
        and (e.nummer = v_nr or (new.kontakt_id is not null and e.kontakt_id = new.kontakt_id) or (new.lead_id is not null and e.lead_id = new.lead_id))) then
    raise exception 'Für diese Nummer liegt keine gültige Einwilligung vor.';
  end if;
  if new.erlaubnis = 'mutmasslich' and v_verbr is true then
    raise exception 'Bei Verbrauchern reicht mutmaßliches Interesse nicht — nötig ist eine ausdrückliche Einwilligung.';
  end if;
  if new.erlaubnis in ('mutmasslich', 'kein_werbeanruf') and char_length(btrim(coalesce(new.erlaubnis_grund, ''))) < 10 then
    raise exception 'Bitte den Grund angeben (mindestens 10 Zeichen).';
  end if;
  new.erlaubnis_grund := nullif(btrim(coalesce(new.erlaubnis_grund, '')), '');
  return new;
end;
$$;

do $$
begin
  drop trigger if exists p362_waechter on public.telefon_sperre;
  create trigger p362_waechter before insert or update or delete on public.telefon_sperre for each row execute function public.p362_sperre_waechter();
  drop trigger if exists p362_waechter on public.telefon_einwilligung;
  create trigger p362_waechter before insert or update or delete on public.telefon_einwilligung for each row execute function public.p362_einwilligung_waechter();
  drop trigger if exists p362_widerruf on public.telefon_einwilligung;
  create trigger p362_widerruf after update on public.telefon_einwilligung for each row execute function public.p362_widerruf_sperrt();
  drop trigger if exists p362_erlaubnis on public.vk_anruf;
  create trigger p362_erlaubnis before insert on public.vk_anruf for each row execute function public.p362_anruf_erlaubnis();
end $$;

-- TEIL 5 von 6: Regeln. Ganzes Team liest und trägt ein; Entsperren nur Geschäftsleitung (Wächter); niemand löscht.
do $$
declare t text;
begin
  foreach t in array array['telefon_sperre', 'telefon_einwilligung'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists p362_owner_all on public.%I', t);
    execute format('create policy p362_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p362_ma_select on public.%I', t);
    execute format('create policy p362_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id())', t);
    execute format('drop policy if exists p362_ma_insert on public.%I', t);
    execute format('create policy p362_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id())', t);
  end loop;
  -- Widerruf darf jeder im Team eintragen (der Wächter lässt nur den Widerruf zu).
  drop policy if exists p362_ma_widerruf on public.telefon_einwilligung;
  create policy p362_ma_widerruf on public.telefon_einwilligung for update to authenticated using (owner_user_id = public.mein_chef_id()) with check (owner_user_id = public.mein_chef_id());
end $$;

-- TEIL 6 von 6: KONTROLLE — Erwartung: tabellen = 2 | spalten = 4 | regeln = 7 | ausloeser = 4 | test_nummer = +4970311234
-- (regeln = 9 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel aus Paket 164, je Tabelle)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('telefon_sperre', 'telefon_einwilligung')) as tabellen,
  (select count(*) from information_schema.columns where table_schema = 'public' and ((table_name in ('kontakte', 'leads') and column_name = 'ist_verbraucher') or (table_name = 'vk_anruf' and column_name in ('erlaubnis', 'erlaubnis_grund')))) as spalten,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('telefon_sperre', 'telefon_einwilligung')) as regeln,
  (select count(*) from pg_trigger where tgname in ('p362_waechter', 'p362_widerruf', 'p362_erlaubnis') and not tgisinternal) as ausloeser,
  public.p362_nummer('07031 / 1234') as test_nummer;
