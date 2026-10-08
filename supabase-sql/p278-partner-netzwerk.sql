-- ============================================================
-- ARGONAUT OS · Paket 278 (08.10.2026) · K18 Partner-Netzwerk, Push 1
--
-- Betriebe verbinden sich gegenseitig (Einladungs-Code, beide stimmen zu,
-- jederzeit trennbar) und geben einander Aufträge an einem Fahrzeug.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) betrieb_partner    Verbindung zwischen zwei Betrieben (Code, Status)
--  2) partner_auftrag    Auftrag am Bestandsfahrzeug an einen verbundenen Partner
--  3) partner_eintrag    Einträge/Fotos beider Seiten — NUR anlegen, nie ändern, nie löschen
--  4) Speicherordner „partner-ablage" — privat, OHNE Regeln: nur der Server liest/schreibt
--  5) Funktionen p278_* — der EINZIGE Weg für den Partner an Daten des Auftraggebers.
--     Es gibt KEINE Regel, die einem fremden Betrieb kfz_bestand öffnet.
--     Der Partner sieht nur eine Positivliste (Marke, Modell, Farbe, EZ …;
--     FIN, km und Fotos nur mit Freigabe) — nie EK, VK, Kunde, Notiz, Kennzeichen.
--     Zugriff nur, solange Auftrag läuft UND die Verbindung besteht.
-- Verbinden und Trennen: nur die Geschäftsleitung. Aufträge/Einträge: Chef oder
-- Mitarbeiter mit Schreibrecht „kfz"; lesen mit Sicht- oder Schreibrecht „kfz".
-- Aussperr-Risiko: keins (nur neue Tabellen und Funktionen).
-- ============================================================

-- 1) Verbindung --------------------------------------------------------------------------
create table if not exists public.betrieb_partner (
  id               uuid primary key default gen_random_uuid(),
  anfrager_betrieb uuid not null,
  partner_betrieb  uuid,
  anfrager_name    text check (anfrager_name is null or char_length(anfrager_name) <= 160),
  partner_name     text check (partner_name is null or char_length(partner_name) <= 160),
  code             text unique check (code is null or code ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  code_bis         timestamptz,
  notiz            text check (notiz is null or char_length(notiz) <= 200),
  status           text not null default 'anfrage' check (status in ('anfrage', 'angenommen', 'getrennt', 'zurueckgezogen')),
  erstellt_am      timestamptz not null default now(),
  angenommen_am    timestamptz,
  getrennt_am      timestamptz,
  getrennt_von     uuid,
  constraint betrieb_partner_nicht_selbst check (partner_betrieb is null or partner_betrieb <> anfrager_betrieb),
  constraint betrieb_partner_partner_da check (status in ('anfrage', 'zurueckgezogen') or partner_betrieb is not null)
);
create index if not exists betrieb_partner_anfrager_idx on public.betrieb_partner (anfrager_betrieb, status);
create index if not exists betrieb_partner_partner_idx on public.betrieb_partner (partner_betrieb, status);
-- je Betriebspaar höchstens EINE bestehende Verbindung
create unique index if not exists betrieb_partner_paar_uidx on public.betrieb_partner
  (least(anfrager_betrieb, partner_betrieb), greatest(anfrager_betrieb, partner_betrieb)) where status = 'angenommen';

-- 2) Auftrag an den Partner ---------------------------------------------------------------
create table if not exists public.partner_auftrag (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  partner_betrieb uuid not null,
  verbindung_id   uuid references public.betrieb_partner(id) on delete restrict,
  bezug_typ       text not null default 'kfz_bestand' check (bezug_typ in ('kfz_bestand')),
  bezug_id        uuid not null,
  nummer          text,
  titel           text not null check (char_length(titel) between 1 and 120),
  beschreibung    text check (beschreibung is null or char_length(beschreibung) <= 1000),
  faellig_am      date,
  freigabe_fotos  boolean not null default false,
  freigabe_fin    boolean not null default false,
  freigabe_km     boolean not null default true,
  fahrzeug_titel  text check (fahrzeug_titel is null or char_length(fahrzeug_titel) <= 160),
  status          text not null default 'offen' check (status in ('offen', 'angenommen', 'abgelehnt', 'fertig', 'beendet', 'storniert')),
  status_grund    text check (status_grund is null or char_length(status_grund) <= 300),
  angenommen_am   timestamptz,
  fertig_am       timestamptz,
  beendet_am      timestamptz,
  erstellt_von    uuid default auth.uid(),
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint partner_auftrag_nicht_selbst check (partner_betrieb <> owner_user_id)
);
create unique index if not exists partner_auftrag_nummer_uidx on public.partner_auftrag (owner_user_id, nummer);
create index if not exists partner_auftrag_bezug_idx on public.partner_auftrag (owner_user_id, bezug_id);
create index if not exists partner_auftrag_partner_idx on public.partner_auftrag (partner_betrieb, status);

-- 3) Einträge beider Seiten (nicht änderbar) ------------------------------------------------
create table if not exists public.partner_eintrag (
  id            uuid primary key default gen_random_uuid(),
  auftrag_id    uuid not null references public.partner_auftrag(id) on delete restrict,
  owner_user_id uuid not null,
  von_betrieb   uuid not null,
  seite         text not null check (seite in ('auftraggeber', 'partner')),
  von_name      text check (von_name is null or char_length(von_name) <= 160),
  art           text not null default 'notiz' check (art in ('notiz', 'status')),
  text          text check (text is null or char_length(text) <= 2000),
  fotos         text[] not null default '{}' check (cardinality(fotos) <= 10),
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now(),
  constraint partner_eintrag_inhalt check (coalesce(char_length(text), 0) > 0 or cardinality(fotos) > 0)
);
create index if not exists partner_eintrag_idx on public.partner_eintrag (auftrag_id, erstellt_am);

-- 4) Speicherordner: privat, KEINE Regeln -> nur der Server (Dienst-Rolle) liest und schreibt
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-ablage', 'partner-ablage', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 5) Hilfen (nur intern) ------------------------------------------------------------------------
create or replace function public.p278_betrieb()
returns uuid language sql stable security definer set search_path to 'public'
as $$ select coalesce(public.mein_chef_id(), auth.uid()) $$;

create or replace function public.p278_darf(p_schreiben boolean)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select auth.uid() is not null and (
    public.mein_chef_id() is null
    or (p_schreiben and public.darf_ich_modul_aendern('kfz'))
    or (not p_schreiben and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')))
  )
$$;

create or replace function public.p278_firma(p_betrieb uuid)
returns text language sql stable security definer set search_path to 'public'
as $$ select left(coalesce(nullif(trim(firma_name), ''), 'Betrieb ohne Namen'), 160) from public.profiles where id = p_betrieb $$;

create or replace function public.p278_verbunden(p_a uuid, p_b uuid)
returns uuid language sql stable security definer set search_path to 'public'
as $$
  select id from public.betrieb_partner
   where status = 'angenommen'
     and least(anfrager_betrieb, partner_betrieb) = least(p_a, p_b)
     and greatest(anfrager_betrieb, partner_betrieb) = greatest(p_a, p_b)
   limit 1
$$;

-- Läuft der Auftrag für den Partner noch? (Status offen/angenommen/fertig UND Verbindung besteht)
create or replace function public.p278_aktiv(p_auftrag public.partner_auftrag)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select p_auftrag.status in ('offen', 'angenommen', 'fertig')
     and exists (select 1 from public.betrieb_partner v where v.id = p_auftrag.verbindung_id and v.status = 'angenommen')
$$;

-- 6) Prüfung jedes Anlegens/Änderns am Auftrag ----------------------------------------------------
create or replace function public.p278_auftrag_pruefen()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich   uuid := public.p278_betrieb();
  v_verb  public.betrieb_partner;
  v_fz    record;
  v_nr    integer;
  v_ok    boolean := false;
begin
  if tg_op = 'INSERT' then
    new.status := 'offen';
    new.status_grund := null; new.angenommen_am := null; new.fertig_am := null; new.beendet_am := null;
    new.verbindung_id := public.p278_verbunden(new.owner_user_id, new.partner_betrieb);
    if new.verbindung_id is null then
      raise exception 'Mit diesem Betrieb besteht keine Partner-Verbindung.' using errcode = '42501';
    end if;
    select marke, modell, variante into v_fz from public.kfz_bestand where id = new.bezug_id and owner_user_id = new.owner_user_id;
    if not found then
      raise exception 'Das Fahrzeug gehört nicht zu Ihrem Betrieb.' using errcode = '42501';
    end if;
    new.fahrzeug_titel := left(nullif(trim(concat_ws(' ', v_fz.marke, v_fz.modell, v_fz.variante)), ''), 160);
    select coalesce(max(substring(nummer from 4)::integer), 0) + 1 into v_nr
      from public.partner_auftrag where owner_user_id = new.owner_user_id and nummer ~ '^PA-[0-9]{1,9}$';
    new.nummer := 'PA-' || lpad(v_nr::text, 4, '0');
    new.erstellt_am := now(); new.aktualisiert_am := now();
    return new;
  end if;

  -- UPDATE: Grunddaten bleiben, wie sie sind
  new.owner_user_id := old.owner_user_id; new.partner_betrieb := old.partner_betrieb; new.verbindung_id := old.verbindung_id;
  new.bezug_typ := old.bezug_typ; new.bezug_id := old.bezug_id; new.nummer := old.nummer; new.fahrzeug_titel := old.fahrzeug_titel;
  new.erstellt_von := old.erstellt_von; new.erstellt_am := old.erstellt_am;
  new.angenommen_am := old.angenommen_am; new.fertig_am := old.fertig_am; new.beendet_am := old.beendet_am;
  if auth.uid() is null then          -- SQL-Editor/Dienst: Korrekturen erlaubt
    new.aktualisiert_am := now();
    return new;
  end if;
  if old.status in ('abgelehnt', 'beendet', 'storniert') then
    raise exception 'Der Auftrag ist abgeschlossen und kann nicht mehr geändert werden.' using errcode = '42501';
  end if;

  if v_ich = old.partner_betrieb then
    -- Partner ändert nur den Status (über p278_status), sonst nichts
    if new.titel is distinct from old.titel or new.beschreibung is distinct from old.beschreibung or new.faellig_am is distinct from old.faellig_am
       or new.freigabe_fotos is distinct from old.freigabe_fotos or new.freigabe_fin is distinct from old.freigabe_fin or new.freigabe_km is distinct from old.freigabe_km then
      raise exception 'Der Partner kann den Auftrag nicht ändern.' using errcode = '42501';
    end if;
    v_ok := (old.status = 'offen' and new.status in ('angenommen', 'abgelehnt'))
         or (old.status = 'angenommen' and new.status = 'fertig')
         or new.status = old.status;
  elsif v_ich = old.owner_user_id then
    v_ok := (old.status in ('offen', 'angenommen') and new.status = 'storniert')
         or (old.status = 'fertig' and new.status in ('beendet', 'angenommen'))
         or new.status = old.status;
  else
    raise exception 'Kein Zugriff auf diesen Auftrag.' using errcode = '42501';
  end if;

  -- Verbindung getrennt: jede Seite darf den Auftrag nur noch schließen
  select * into v_verb from public.betrieb_partner where id = old.verbindung_id;
  if v_verb.status is distinct from 'angenommen' then
    v_ok := new.status = 'storniert' and old.status <> 'storniert';
  end if;
  if not v_ok then
    raise exception 'Statuswechsel % -> % ist nicht erlaubt.', old.status, new.status using errcode = '42501';
  end if;

  if new.status <> old.status then
    if new.status = 'angenommen' and old.status = 'offen' then new.angenommen_am := now(); end if;
    if new.status = 'fertig' then new.fertig_am := now(); end if;
    if new.status in ('beendet', 'storniert', 'abgelehnt') then new.beendet_am := now(); end if;
  else
    new.status_grund := old.status_grund;
  end if;
  new.aktualisiert_am := now();
  return new;
end $$;

-- Statuswechsel als Eintrag festhalten + Glocke beim Partner (Fehler bei der Glocke stören nie)
create or replace function public.p278_auftrag_melden()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich   uuid := public.p278_betrieb();
  v_seite text;
  v_ziel  uuid;
  v_name  text;
  v_namen constant jsonb := '{"offen":"offen","angenommen":"angenommen","abgelehnt":"abgelehnt","fertig":"fertig gemeldet","beendet":"abgenommen und beendet","storniert":"storniert"}'::jsonb;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_seite := case when v_ich = new.partner_betrieb then 'partner' else 'auftraggeber' end;
    insert into public.partner_eintrag (auftrag_id, owner_user_id, von_betrieb, seite, von_name, art, text)
    values (new.id, new.owner_user_id, coalesce(v_ich, new.owner_user_id), v_seite,
            public.p278_firma(case when v_seite = 'partner' then new.partner_betrieb else new.owner_user_id end), 'status',
            left('Status: ' || coalesce(v_namen->>new.status, new.status) || coalesce(' — ' || nullif(trim(new.status_grund), ''), ''), 2000));
  end if;
  begin
    if tg_op = 'INSERT' then
      v_ziel := new.partner_betrieb;
      v_name := public.p278_firma(new.owner_user_id);
      insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
      values (v_ziel, 'partner_auftrag', left('Neuer Partner-Auftrag von ' || v_name, 200),
              left(new.titel || coalesce(' · ' || new.fahrzeug_titel, ''), 300), '/dashboard/kfz/partner?auftrag=' || new.id, 'partner_auftrag', new.id::text, false);
    elsif new.status is distinct from old.status then
      v_ziel := case when v_ich = new.partner_betrieb then new.owner_user_id else new.partner_betrieb end;
      insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
      values (v_ziel, 'partner_auftrag', left('Partner-Auftrag ' || new.nummer || ': ' || coalesce(v_namen->>new.status, new.status), 200),
              left(new.titel, 300),
              case when v_ziel = new.owner_user_id then '/dashboard/kfz/bestand/' || new.bezug_id || '?reiter=partner' else '/dashboard/kfz/partner?auftrag=' || new.id end,
              'partner_auftrag', new.id::text, false);
    end if;
  exception when others then null;
  end;
  return null;
end $$;

-- Einträge sind unveränderlich
create or replace function public.p278_eintrag_sperre()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  raise exception 'Einträge im Partner-Auftrag können nicht geändert oder gelöscht werden.' using errcode = '42501';
end $$;

drop trigger if exists p181_besitzer on public.partner_auftrag;
create trigger p181_besitzer before insert or update on public.partner_auftrag
  for each row execute function public.p181_besitzer();
drop trigger if exists p278_auftrag_pruefen on public.partner_auftrag;
create trigger p278_auftrag_pruefen before insert or update on public.partner_auftrag
  for each row execute function public.p278_auftrag_pruefen();
drop trigger if exists p278_auftrag_melden on public.partner_auftrag;
create trigger p278_auftrag_melden after insert or update on public.partner_auftrag
  for each row execute function public.p278_auftrag_melden();
drop trigger if exists p278_eintrag_sperre on public.partner_eintrag;
create trigger p278_eintrag_sperre before update or delete on public.partner_eintrag
  for each row execute function public.p278_eintrag_sperre();

-- 7) Funktionen für Oberfläche und Server --------------------------------------------------------

-- Einladung: Code erzeugen (nur Geschäftsleitung, 14 Tage gültig, einmal verwendbar)
create or replace function public.p278_einladen(p_notiz text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich  uuid := auth.uid();
  v_hex  text;
  v_code text;
  v_id   uuid;
  v_bis  timestamptz := now() + interval '14 days';
begin
  if v_ich is null or public.mein_chef_id() is not null then
    raise exception 'Partner verbinden kann nur die Geschäftsleitung.' using errcode = '42501';
  end if;
  if (select count(*) from public.betrieb_partner where anfrager_betrieb = v_ich and status = 'anfrage' and code_bis > now()) >= 20 then
    raise exception 'Es sind schon 20 offene Einladungen da. Bitte alte zurückziehen.' using errcode = '54000';
  end if;
  v_hex := upper(replace(gen_random_uuid()::text, '-', ''));
  v_code := substr(v_hex, 1, 4) || '-' || substr(v_hex, 13, 4) || '-' || substr(v_hex, 21, 4);
  insert into public.betrieb_partner (anfrager_betrieb, anfrager_name, code, code_bis, notiz, status)
  values (v_ich, public.p278_firma(v_ich), v_code, v_bis, left(nullif(trim(coalesce(p_notiz, '')), ''), 200), 'anfrage')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'code', v_code, 'code_bis', v_bis);
end $$;

-- Code annehmen (nur Geschäftsleitung des anderen Betriebs)
create or replace function public.p278_annehmen(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich  uuid := auth.uid();
  v_roh  text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Fa-f]', '', 'g'));
  v_code text;
  v_v    public.betrieb_partner;
begin
  if v_ich is null or public.mein_chef_id() is not null then
    raise exception 'Partner verbinden kann nur die Geschäftsleitung.' using errcode = '42501';
  end if;
  if char_length(v_roh) <> 12 then
    raise exception 'Der Code hat 12 Zeichen (z. B. 3F9A-0C21-B7D4).' using errcode = '22023';
  end if;
  v_code := substr(v_roh, 1, 4) || '-' || substr(v_roh, 5, 4) || '-' || substr(v_roh, 9, 4);
  select * into v_v from public.betrieb_partner where code = v_code and status = 'anfrage' for update;
  if not found or v_v.code_bis < now() then
    raise exception 'Der Code ist ungültig oder abgelaufen.' using errcode = '22023';
  end if;
  if v_v.anfrager_betrieb = v_ich then
    raise exception 'Das ist Ihr eigener Code — bitte an den Partner-Betrieb weitergeben.' using errcode = '22023';
  end if;
  if public.p278_verbunden(v_ich, v_v.anfrager_betrieb) is not null then
    raise exception 'Mit diesem Betrieb sind Sie bereits verbunden.' using errcode = '23505';
  end if;
  update public.betrieb_partner
     set partner_betrieb = v_ich, partner_name = public.p278_firma(v_ich), status = 'angenommen', angenommen_am = now(), code = null
   where id = v_v.id;
  begin
    insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
    values (v_v.anfrager_betrieb, 'partner_verbindung', left('Neuer Partner: ' || public.p278_firma(v_ich), 200),
            'Die Einladung wurde angenommen.', '/dashboard/kfz/partner', 'betrieb_partner', v_v.id::text, false);
  exception when others then null;
  end;
  return jsonb_build_object('id', v_v.id, 'partner', v_v.anfrager_name);
end $$;

-- Trennen bzw. Einladung zurückziehen (jede Seite, nur Geschäftsleitung). Laufende Aufträge enden sofort.
create or replace function public.p278_trennen(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich uuid := auth.uid();
  v_v   public.betrieb_partner;
  v_n   integer := 0;
begin
  if v_ich is null or public.mein_chef_id() is not null then
    raise exception 'Partner trennen kann nur die Geschäftsleitung.' using errcode = '42501';
  end if;
  select * into v_v from public.betrieb_partner where id = p_id and v_ich in (anfrager_betrieb, partner_betrieb) for update;
  if not found then raise exception 'Verbindung nicht gefunden.' using errcode = '42501'; end if;
  if v_v.status = 'anfrage' then
    update public.betrieb_partner set status = 'zurueckgezogen', code = null, getrennt_am = now(), getrennt_von = v_ich where id = p_id;
    return jsonb_build_object('status', 'zurueckgezogen', 'auftraege', 0);
  end if;
  if v_v.status <> 'angenommen' then
    return jsonb_build_object('status', v_v.status, 'auftraege', 0);
  end if;
  update public.betrieb_partner set status = 'getrennt', getrennt_am = now(), getrennt_von = v_ich where id = p_id;
  update public.partner_auftrag set status = 'storniert', status_grund = 'Partner-Verbindung getrennt'
   where verbindung_id = p_id and status in ('offen', 'angenommen', 'fertig');
  get diagnostics v_n = row_count;
  begin
    insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
    values (case when v_ich = v_v.anfrager_betrieb then v_v.partner_betrieb else v_v.anfrager_betrieb end, 'partner_verbindung',
            left('Partner-Verbindung getrennt: ' || public.p278_firma(v_ich), 200),
            case when v_n > 0 then v_n || ' laufende Aufträge wurden beendet.' else 'Es liefen keine Aufträge.' end,
            '/dashboard/kfz/partner', 'betrieb_partner', p_id::text, false);
  exception when others then null;
  end;
  return jsonb_build_object('status', 'getrennt', 'auftraege', v_n);
end $$;

-- Aufträge, die MEIN Betrieb als Partner bekommen hat (Kopfdaten, keine Fahrzeugdaten)
create or replace function public.p278_eingang()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare v_ich uuid := public.p278_betrieb();
begin
  if not public.p278_darf(false) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(z order by (z->>'erstellt_am') desc) from (
      select jsonb_build_object(
        'id', a.id, 'nummer', a.nummer, 'titel', a.titel, 'faellig_am', a.faellig_am, 'status', a.status,
        'status_grund', a.status_grund, 'erstellt_am', a.erstellt_am, 'fahrzeug_titel', a.fahrzeug_titel,
        'auftraggeber', case when v.anfrager_betrieb = a.owner_user_id then v.anfrager_name else v.partner_name end,
        'aktiv', public.p278_aktiv(a)) as z
      from public.partner_auftrag a join public.betrieb_partner v on v.id = a.verbindung_id
      where a.partner_betrieb = v_ich
      order by a.erstellt_am desc limit 300) t), '[]'::jsonb);
end $$;

-- Ein Auftrag aus Sicht des Partners: Positivliste des Fahrzeugs nur solange er läuft
create or replace function public.p278_eingang_detail(p_auftrag uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
  v_v   public.betrieb_partner;
  v_f   public.kfz_bestand;
  v_akt boolean;
  v_erg jsonb;
begin
  if not public.p278_darf(false) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich;
  if not found then return null; end if;
  select * into v_v from public.betrieb_partner where id = v_a.verbindung_id;
  v_akt := public.p278_aktiv(v_a);
  v_erg := jsonb_build_object(
    'id', v_a.id, 'nummer', v_a.nummer, 'titel', v_a.titel, 'beschreibung', v_a.beschreibung, 'faellig_am', v_a.faellig_am,
    'status', v_a.status, 'status_grund', v_a.status_grund, 'erstellt_am', v_a.erstellt_am, 'fahrzeug_titel', v_a.fahrzeug_titel,
    'auftraggeber', case when v_v.anfrager_betrieb = v_a.owner_user_id then v_v.anfrager_name else v_v.partner_name end,
    'aktiv', v_akt, 'darf_schreiben', public.p278_darf(true));
  if not v_akt then return v_erg; end if;
  select * into v_f from public.kfz_bestand where id = v_a.bezug_id and owner_user_id = v_a.owner_user_id;
  if found then
    v_erg := v_erg || jsonb_build_object('fahrzeug', jsonb_build_object(
      'marke', v_f.marke, 'modell', v_f.modell, 'variante', v_f.variante, 'farbe', v_f.farbe, 'farbcode', v_f.farbcode,
      'erstzulassung', v_f.erstzulassung, 'kraftstoff', v_f.kraftstoff, 'leistung_kw', v_f.leistung_kw,
      'km_stand', case when v_a.freigabe_km then v_f.km_stand end,
      'fin', case when v_a.freigabe_fin then v_f.fin end));
    if v_a.freigabe_fotos then
      v_erg := v_erg || jsonb_build_object('fotos', coalesce((
        select jsonb_agg(m.id order by m.position, m.erstellt_am) from public.kfz_bestand_medien m
         where m.bestand_id = v_f.id and m.owner_user_id = v_a.owner_user_id and m.art = 'foto'), '[]'::jsonb));
    end if;
  end if;
  v_erg := v_erg || jsonb_build_object('eintraege', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'seite', e.seite, 'von_name', e.von_name, 'art', e.art, 'text', e.text,
                                        'fotos', cardinality(e.fotos), 'erstellt_am', e.erstellt_am) order by e.erstellt_am)
      from public.partner_eintrag e where e.auftrag_id = v_a.id), '[]'::jsonb));
  return v_erg;
end $$;

-- Status ändern (beide Seiten; welche Wechsel erlaubt sind, prüft p278_auftrag_pruefen)
create or replace function public.p278_status(p_auftrag uuid, p_neu text, p_grund text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(true) then
    raise exception 'Dafür fehlt das Schreibrecht „Kfz".' using errcode = '42501';
  end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and v_ich in (owner_user_id, partner_betrieb) for update;
  if not found then raise exception 'Auftrag nicht gefunden.' using errcode = '42501'; end if;
  if p_neu not in ('angenommen', 'abgelehnt', 'fertig', 'beendet', 'storniert') then
    raise exception 'Unbekannter Status.' using errcode = '22023';
  end if;
  update public.partner_auftrag set status = p_neu, status_grund = left(nullif(trim(coalesce(p_grund, '')), ''), 300) where id = p_auftrag;
  return jsonb_build_object('id', p_auftrag, 'status', p_neu);
end $$;

-- Ordner für Fotos eines Eintrags (null = darf nicht). Wird vom Server vor dem Hochladen gefragt.
create or replace function public.p278_ablage_ziel(p_auftrag uuid)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(true) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and v_ich in (owner_user_id, partner_betrieb);
  if not found then return null; end if;
  if v_ich = v_a.partner_betrieb and not public.p278_aktiv(v_a) then return null; end if;
  return v_a.owner_user_id::text || '/' || v_a.id::text || '/';
end $$;

-- Eintrag schreiben (beide Seiten). Fotos müssen vorher über den Server in den Auftragsordner geladen sein.
create or replace function public.p278_eintrag(p_auftrag uuid, p_text text, p_fotos text[])
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich   uuid := public.p278_betrieb();
  v_a     public.partner_auftrag;
  v_ziel  text;
  v_text  text := left(nullif(trim(coalesce(p_text, '')), ''), 2000);
  v_fotos text[] := coalesce(p_fotos, '{}');
  v_p     text;
  v_id    uuid;
begin
  v_ziel := public.p278_ablage_ziel(p_auftrag);
  if v_ziel is null then
    raise exception 'Hier können Sie (nicht mehr) schreiben.' using errcode = '42501';
  end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag;
  if cardinality(v_fotos) > 10 then raise exception 'Höchstens 10 Fotos je Eintrag.' using errcode = '22023'; end if;
  if v_text is null and cardinality(v_fotos) = 0 then raise exception 'Bitte Text oder Foto angeben.' using errcode = '22023'; end if;
  foreach v_p in array v_fotos loop
    if v_p is null or left(v_p, char_length(v_ziel)) <> v_ziel
       or substr(v_p, char_length(v_ziel) + 1) !~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'partner-ablage' and o.name = v_p) then
      raise exception 'Ein Foto gehört nicht zu diesem Auftrag.' using errcode = '22023';
    end if;
  end loop;
  insert into public.partner_eintrag (auftrag_id, owner_user_id, von_betrieb, seite, von_name, art, text, fotos)
  values (v_a.id, v_a.owner_user_id, v_ich, case when v_ich = v_a.partner_betrieb then 'partner' else 'auftraggeber' end,
          public.p278_firma(v_ich), 'notiz', v_text, v_fotos)
  returning id into v_id;
  return v_id;
end $$;

-- Pfad eines Eintrags-Fotos (für den signierten Link des Servers). Partner nur, solange der Auftrag läuft.
create or replace function public.p278_foto_pfad(p_eintrag uuid, p_nr integer)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_e   public.partner_eintrag;
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(false) then return null; end if;
  select * into v_e from public.partner_eintrag where id = p_eintrag;
  if not found then return null; end if;
  select * into v_a from public.partner_auftrag where id = v_e.auftrag_id;
  if v_ich = v_a.owner_user_id then null;
  elsif v_ich = v_a.partner_betrieb and public.p278_aktiv(v_a) then null;
  else return null;
  end if;
  if p_nr is null or p_nr < 1 or p_nr > cardinality(v_e.fotos) then return null; end if;
  return v_e.fotos[p_nr];
end $$;

-- Pfad eines Fahrzeugfotos für den Partner: nur mit Freigabe, nur solange der Auftrag läuft
create or replace function public.p278_fahrzeugfoto_pfad(p_auftrag uuid, p_medium uuid)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(false) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich;
  if not found or not v_a.freigabe_fotos or not public.p278_aktiv(v_a) then return null; end if;
  return (select m.pfad from public.kfz_bestand_medien m
           where m.id = p_medium and m.bestand_id = v_a.bezug_id and m.owner_user_id = v_a.owner_user_id and m.art = 'foto');
end $$;

-- Rechte an den Funktionen: nur angemeldete Nutzer, Hilfen gar nicht von außen
revoke all on function public.p278_betrieb() from public, anon, authenticated;
revoke all on function public.p278_darf(boolean) from public, anon, authenticated;
revoke all on function public.p278_firma(uuid) from public, anon, authenticated;
revoke all on function public.p278_verbunden(uuid, uuid) from public, anon, authenticated;
revoke all on function public.p278_aktiv(public.partner_auftrag) from public, anon, authenticated;
revoke all on function public.p278_auftrag_pruefen() from public, anon, authenticated;
revoke all on function public.p278_auftrag_melden() from public, anon, authenticated;
revoke all on function public.p278_einladen(text) from public, anon;
revoke all on function public.p278_annehmen(text) from public, anon;
revoke all on function public.p278_trennen(uuid) from public, anon;
revoke all on function public.p278_eingang() from public, anon;
revoke all on function public.p278_eingang_detail(uuid) from public, anon;
revoke all on function public.p278_status(uuid, text, text) from public, anon;
revoke all on function public.p278_ablage_ziel(uuid) from public, anon;
revoke all on function public.p278_eintrag(uuid, text, text[]) from public, anon;
revoke all on function public.p278_foto_pfad(uuid, integer) from public, anon;
revoke all on function public.p278_fahrzeugfoto_pfad(uuid, uuid) from public, anon;
grant execute on function public.p278_einladen(text), public.p278_annehmen(text), public.p278_trennen(uuid),
  public.p278_eingang(), public.p278_eingang_detail(uuid), public.p278_status(uuid, text, text), public.p278_ablage_ziel(uuid),
  public.p278_eintrag(uuid, text, text[]), public.p278_foto_pfad(uuid, integer), public.p278_fahrzeugfoto_pfad(uuid, uuid) to authenticated;

-- 8) Zugriffsregeln (RLS): nur die EIGENE Seite liest direkt ---------------------------------------
alter table public.betrieb_partner enable row level security;
alter table public.partner_auftrag enable row level security;
alter table public.partner_eintrag enable row level security;

-- betrieb_partner: beide beteiligten Betriebe lesen; geschrieben wird nur über p278_einladen/annehmen/trennen
drop policy if exists bp_beteiligt_select on public.betrieb_partner;
create policy bp_beteiligt_select on public.betrieb_partner for select to authenticated
  using (auth.uid() = anfrager_betrieb or auth.uid() = partner_betrieb);
drop policy if exists bp_ma_select on public.betrieb_partner;
create policy bp_ma_select on public.betrieb_partner for select to authenticated
  using ((public.mein_chef_id() = anfrager_betrieb or public.mein_chef_id() = partner_betrieb)
         and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));

-- partner_auftrag: NUR der Auftraggeber (Partner liest über p278_eingang*). Löschen: niemand.
drop policy if exists pa_owner_select on public.partner_auftrag;
create policy pa_owner_select on public.partner_auftrag for select to authenticated using (auth.uid() = owner_user_id);
drop policy if exists pa_owner_insert on public.partner_auftrag;
create policy pa_owner_insert on public.partner_auftrag for insert to authenticated with check (auth.uid() = owner_user_id);
drop policy if exists pa_owner_update on public.partner_auftrag;
create policy pa_owner_update on public.partner_auftrag for update to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.partner_auftrag;
create policy p181_ma_select on public.partner_auftrag for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.partner_auftrag;
create policy p181_ma_insert on public.partner_auftrag for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.partner_auftrag;
create policy p181_ma_update on public.partner_auftrag for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- partner_eintrag: Auftraggeber liest; geschrieben wird nur über p278_eintrag
drop policy if exists pe_owner_select on public.partner_eintrag;
create policy pe_owner_select on public.partner_eintrag for select to authenticated using (auth.uid() = owner_user_id);
drop policy if exists pe_ma_select on public.partner_eintrag;
create policy pe_ma_select on public.partner_eintrag for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));

-- KONTROLLE — Erwartung: tabellen = 3, regeln_verbindung = 2, regeln_auftrag = 6, regeln_eintrag = 2,
-- ausloeser = 4, funktionen = 18, rls_an = 3, ordner_privat = true, ordner_regeln = 0
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('betrieb_partner', 'partner_auftrag', 'partner_eintrag')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'betrieb_partner') as regeln_verbindung,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'partner_auftrag') as regeln_auftrag,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'partner_eintrag') as regeln_eintrag,
  (select count(*) from pg_trigger where not tgisinternal and tgrelid in ('public.partner_auftrag'::regclass, 'public.partner_eintrag'::regclass)) as ausloeser,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'p278\_%') as funktionen,
  (select count(*) from pg_class where relname in ('betrieb_partner', 'partner_auftrag', 'partner_eintrag') and relrowsecurity) as rls_an,
  (select public = false from storage.buckets where id = 'partner-ablage') as ordner_privat,
  (select count(*) from pg_policies where schemaname = 'storage' and qual like '%partner-ablage%') as ordner_regeln;
