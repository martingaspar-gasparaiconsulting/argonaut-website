-- ============================================================
-- ARGONAUT OS · Paket 279 (08.10.2026) · K18b Partner-Netzwerk: Gast-Link und Partner-Rechnung
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht.
--  1) partner_auftrag: Partner OHNE ARGONAUT als Gast (gast_name, Link-Prüfwert,
--     Ablauf, Sperre). Gespeichert wird nur der SHA-256-Prüfwert des Links, nie der Link.
--     partner_betrieb darf dafür leer sein (nur bei Gast-Aufträgen).
--  2) partner_eintrag.von_betrieb darf leer sein (Einträge des Gastes).
--  3) partner_rechnung: Rechnung des Partners zum Auftrag (Datei im privaten Ordner
--     „partner-ablage"). Der Auftraggeber prüft und übernimmt per Knopf in Belegeingang
--     (eingangsbelege) UND Fahrzeugkosten (kfz_bestand_kosten) — in EINEM Schritt, nie doppelt.
--  4) p278_auftrag_pruefen / p278_auftrag_melden werden ersetzt (Gast-Fall ergänzt, alles
--     andere unverändert).
--  5) Gast-Funktionen p279_gast_* NUR für den Server (Dienst-Rolle): Der öffentliche Link
--     wird im Server gehasht; die Datenbank prüft Prüfwert, Ablauf, Sperre und Status.
-- Rechnung einreichen: Partner-Betrieb (Chef oder Schreibrecht „kfz") oder Gast.
-- Übernehmen/Ablehnen: Chef oder Mitarbeiter mit „Darf abrechnen" UND Schreibrecht „kfz".
-- Aussperr-Risiko: keins.
-- ============================================================

-- 1) Gast-Auftrag -----------------------------------------------------------------------------
alter table public.partner_auftrag alter column partner_betrieb drop not null;
alter table public.partner_auftrag add column if not exists gast_name text;
alter table public.partner_auftrag add column if not exists gast_kontakt text;
alter table public.partner_auftrag add column if not exists gast_token_hash text;
alter table public.partner_auftrag add column if not exists gast_bis timestamptz;
alter table public.partner_auftrag add column if not exists gast_gesperrt boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'partner_auftrag_gast_check') then
    alter table public.partner_auftrag add constraint partner_auftrag_gast_check check (
      (partner_betrieb is not null and gast_name is null and gast_token_hash is null)
      or (partner_betrieb is null and char_length(coalesce(gast_name, '')) between 1 and 120));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partner_auftrag_gast_felder') then
    alter table public.partner_auftrag add constraint partner_auftrag_gast_felder check (
      (gast_kontakt is null or char_length(gast_kontakt) <= 200)
      and (gast_token_hash is null or gast_token_hash ~ '^[0-9a-f]{64}$'));
  end if;
end $$;
create unique index if not exists partner_auftrag_gast_uidx on public.partner_auftrag (gast_token_hash) where gast_token_hash is not null;

-- 2) Einträge des Gastes ------------------------------------------------------------------------
alter table public.partner_eintrag alter column von_betrieb drop not null;

-- 3) Partner-Rechnung -----------------------------------------------------------------------------
create table if not exists public.partner_rechnung (
  id               uuid primary key default gen_random_uuid(),
  auftrag_id       uuid not null references public.partner_auftrag(id) on delete restrict,
  owner_user_id    uuid not null,
  von_betrieb      uuid,
  von_name         text check (von_name is null or char_length(von_name) <= 160),
  rechnungsnummer  text not null check (char_length(rechnungsnummer) between 1 and 60),
  rechnungsdatum   date not null,
  netto            numeric(12,2) not null check (netto > 0 and netto <= 1000000),
  ust_satz         numeric(5,2) not null check (ust_satz in (0, 7, 19)),
  ust_betrag       numeric(12,2) not null check (ust_betrag >= 0),
  brutto           numeric(12,2) not null check (brutto > 0),
  pfad             text not null check (char_length(pfad) <= 300),
  status           text not null default 'eingereicht' check (status in ('eingereicht', 'uebernommen', 'abgelehnt')),
  grund            text check (grund is null or char_length(grund) <= 300),
  beleg_id         uuid,
  kosten_id        uuid,
  eingereicht_am   timestamptz not null default now(),
  entschieden_am   timestamptz,
  entschieden_von  uuid,
  constraint partner_rechnung_summe check (brutto = netto + ust_betrag)
);
create unique index if not exists partner_rechnung_nr_uidx on public.partner_rechnung (auftrag_id, lower(rechnungsnummer)) where status <> 'abgelehnt';
create index if not exists partner_rechnung_owner_idx on public.partner_rechnung (owner_user_id, status);

alter table public.partner_rechnung enable row level security;
drop policy if exists pr_owner_select on public.partner_rechnung;
create policy pr_owner_select on public.partner_rechnung for select to authenticated using (auth.uid() = owner_user_id);
drop policy if exists pr_ma_select on public.partner_rechnung;
create policy pr_ma_select on public.partner_rechnung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));

create or replace function public.p279_rechnung_sperre()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Partner-Rechnungen können nicht gelöscht werden.' using errcode = '42501';
  end if;
  if new.auftrag_id is distinct from old.auftrag_id or new.owner_user_id is distinct from old.owner_user_id
     or new.rechnungsnummer is distinct from old.rechnungsnummer or new.rechnungsdatum is distinct from old.rechnungsdatum
     or new.netto is distinct from old.netto or new.ust_satz is distinct from old.ust_satz or new.ust_betrag is distinct from old.ust_betrag
     or new.brutto is distinct from old.brutto or new.pfad is distinct from old.pfad or new.von_betrieb is distinct from old.von_betrieb then
    raise exception 'Eine eingereichte Rechnung kann nicht geändert werden.' using errcode = '42501';
  end if;
  if old.status <> 'eingereicht' then
    raise exception 'Über diese Rechnung wurde schon entschieden.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists p279_rechnung_sperre on public.partner_rechnung;
create trigger p279_rechnung_sperre before update or delete on public.partner_rechnung
  for each row execute function public.p279_rechnung_sperre();

-- 4) Auslöser am Auftrag (ersetzt Paket 278, um den Gast-Fall ergänzt) -----------------------------------
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
    new.gast_token_hash := null; new.gast_bis := null; new.gast_gesperrt := false;
    if new.partner_betrieb is null then
      -- Gast-Auftrag (Partner ohne ARGONAUT): keine Verbindung, Link entsteht danach über p279_gast_link
      new.verbindung_id := null;
      new.gast_name := left(nullif(trim(coalesce(new.gast_name, '')), ''), 120);
      if new.gast_name is null then
        raise exception 'Bitte den Namen des Partners angeben.' using errcode = '22023';
      end if;
    else
      new.gast_name := null; new.gast_kontakt := null;
      new.verbindung_id := public.p278_verbunden(new.owner_user_id, new.partner_betrieb);
      if new.verbindung_id is null then
        raise exception 'Mit diesem Betrieb besteht keine Partner-Verbindung.' using errcode = '42501';
      end if;
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
  new.erstellt_von := old.erstellt_von; new.erstellt_am := old.erstellt_am; new.gast_name := old.gast_name;
  if auth.uid() is null then          -- SQL-Editor/Dienst (auch Gast-Funktionen p279_gast_*): prüfen dort selbst
    new.aktualisiert_am := now();
    return new;
  end if;
  new.angenommen_am := old.angenommen_am; new.fertig_am := old.fertig_am; new.beendet_am := old.beendet_am;
  -- Link-Prüfwert und Ablauf setzt nur p279_gast_link; eine Sperre hebt nur ein neuer Link auf
  if coalesce(current_setting('p279.link', true), '') <> 'an' then
    new.gast_token_hash := old.gast_token_hash; new.gast_bis := old.gast_bis;
    if old.gast_gesperrt then new.gast_gesperrt := true; end if;
  end if;
  if old.status in ('abgelehnt', 'beendet', 'storniert') then
    if new.status is distinct from old.status or new.titel is distinct from old.titel or new.beschreibung is distinct from old.beschreibung
       or new.faellig_am is distinct from old.faellig_am or new.freigabe_fotos is distinct from old.freigabe_fotos
       or new.freigabe_fin is distinct from old.freigabe_fin or new.freigabe_km is distinct from old.freigabe_km then
      raise exception 'Der Auftrag ist abgeschlossen und kann nicht mehr geändert werden.' using errcode = '42501';
    end if;
    new.aktualisiert_am := now();
    return new;                       -- nur Gast-Sperre bleibt möglich
  end if;

  if old.partner_betrieb is not null and v_ich = old.partner_betrieb then
    -- Partner ändert nur den Status (über p278_status), sonst nichts
    if new.titel is distinct from old.titel or new.beschreibung is distinct from old.beschreibung or new.faellig_am is distinct from old.faellig_am
       or new.freigabe_fotos is distinct from old.freigabe_fotos or new.freigabe_fin is distinct from old.freigabe_fin or new.freigabe_km is distinct from old.freigabe_km
       or new.gast_gesperrt is distinct from old.gast_gesperrt then
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

  -- Verbindung getrennt (nur bei Betrieb-Partnern): jede Seite darf den Auftrag nur noch schließen
  if old.verbindung_id is not null then
    select * into v_verb from public.betrieb_partner where id = old.verbindung_id;
    if v_verb.status is distinct from 'angenommen' then
      v_ok := new.status = 'storniert' and old.status <> 'storniert';
    end if;
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

create or replace function public.p278_auftrag_melden()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich   uuid := public.p278_betrieb();
  v_gast  boolean := coalesce(current_setting('p279.gast', true), '') = 'an';
  v_seite text;
  v_ziel  uuid;
  v_name  text;
  v_namen constant jsonb := '{"offen":"offen","angenommen":"angenommen","abgelehnt":"abgelehnt","fertig":"fertig gemeldet","beendet":"abgenommen und beendet","storniert":"storniert"}'::jsonb;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_seite := case when v_gast or (new.partner_betrieb is not null and v_ich = new.partner_betrieb) then 'partner' else 'auftraggeber' end;
    insert into public.partner_eintrag (auftrag_id, owner_user_id, von_betrieb, seite, von_name, art, text)
    values (new.id, new.owner_user_id,
            case when v_seite = 'partner' then new.partner_betrieb else coalesce(v_ich, new.owner_user_id) end, v_seite,
            case when v_seite = 'partner' and new.partner_betrieb is null then left(new.gast_name || ' (Gast)', 160)
                 else public.p278_firma(case when v_seite = 'partner' then new.partner_betrieb else new.owner_user_id end) end,
            'status',
            left('Status: ' || coalesce(v_namen->>new.status, new.status) || coalesce(' — ' || nullif(trim(new.status_grund), ''), ''), 2000));
  end if;
  begin
    if tg_op = 'INSERT' then
      if new.partner_betrieb is not null then
        v_name := public.p278_firma(new.owner_user_id);
        insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
        values (new.partner_betrieb, 'partner_auftrag', left('Neuer Partner-Auftrag von ' || v_name, 200),
                left(new.titel || coalesce(' · ' || new.fahrzeug_titel, ''), 300), '/dashboard/kfz/partner?auftrag=' || new.id, 'partner_auftrag', new.id::text, false);
      end if;
    elsif new.status is distinct from old.status then
      v_ziel := case when v_gast or (new.partner_betrieb is not null and v_ich = new.partner_betrieb) then new.owner_user_id else new.partner_betrieb end;
      if v_ziel is not null then
        insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
        values (v_ziel, 'partner_auftrag', left('Partner-Auftrag ' || new.nummer || ': ' || coalesce(v_namen->>new.status, new.status), 200),
                left(new.titel, 300),
                case when v_ziel = new.owner_user_id then '/dashboard/kfz/bestand/' || new.bezug_id || '?reiter=partner' else '/dashboard/kfz/partner?auftrag=' || new.id end,
                'partner_auftrag', new.id::text, false);
      end if;
    end if;
  exception when others then null;
  end;
  return null;
end $$;

-- 5) Interne Bausteine (für Betrieb-Partner und Gast gleich) ---------------------------------------------

-- Fahrzeug-Positivliste + Fotos + Verlauf (wie p278_eingang_detail)
create or replace function public.p279_detail(p_a public.partner_auftrag, p_aktiv boolean, p_extra jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_f   public.kfz_bestand;
  v_erg jsonb;
begin
  v_erg := jsonb_build_object(
    'id', p_a.id, 'nummer', p_a.nummer, 'titel', p_a.titel, 'beschreibung', p_a.beschreibung, 'faellig_am', p_a.faellig_am,
    'status', p_a.status, 'status_grund', p_a.status_grund, 'erstellt_am', p_a.erstellt_am, 'fahrzeug_titel', p_a.fahrzeug_titel,
    'aktiv', p_aktiv) || coalesce(p_extra, '{}'::jsonb);
  if not p_aktiv then return v_erg; end if;
  select * into v_f from public.kfz_bestand where id = p_a.bezug_id and owner_user_id = p_a.owner_user_id;
  if found then
    v_erg := v_erg || jsonb_build_object('fahrzeug', jsonb_build_object(
      'marke', v_f.marke, 'modell', v_f.modell, 'variante', v_f.variante, 'farbe', v_f.farbe, 'farbcode', v_f.farbcode,
      'erstzulassung', v_f.erstzulassung, 'kraftstoff', v_f.kraftstoff, 'leistung_kw', v_f.leistung_kw,
      'km_stand', case when p_a.freigabe_km then v_f.km_stand end,
      'fin', case when p_a.freigabe_fin then v_f.fin end));
    if p_a.freigabe_fotos then
      v_erg := v_erg || jsonb_build_object('fotos', coalesce((
        select jsonb_agg(m.id order by m.position, m.erstellt_am) from public.kfz_bestand_medien m
         where m.bestand_id = v_f.id and m.owner_user_id = p_a.owner_user_id and m.art = 'foto'), '[]'::jsonb));
    end if;
  end if;
  v_erg := v_erg || jsonb_build_object('eintraege', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'seite', e.seite, 'von_name', e.von_name, 'art', e.art, 'text', e.text,
                                        'fotos', cardinality(e.fotos), 'erstellt_am', e.erstellt_am) order by e.erstellt_am)
      from public.partner_eintrag e where e.auftrag_id = p_a.id), '[]'::jsonb));
  return v_erg;
end $$;

-- Darf der Partner zu diesem Auftrag (noch) eine Rechnung einreichen? Bis 30 Tage nach Abnahme.
create or replace function public.p279_rechnung_erlaubt(p_a public.partner_auftrag)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select (p_a.status in ('angenommen', 'fertig') or (p_a.status = 'beendet' and p_a.beendet_am > now() - interval '30 days'))
     and (p_a.verbindung_id is null or exists (select 1 from public.betrieb_partner v where v.id = p_a.verbindung_id and v.status = 'angenommen'))
$$;

-- Eingereichte Rechnungen eines Auftrags (für die Partner-Seite)
create or replace function public.p279_rechnungen_json(p_auftrag uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rechnungsnummer', r.rechnungsnummer, 'rechnungsdatum', r.rechnungsdatum,
    'netto', r.netto, 'ust_satz', r.ust_satz, 'brutto', r.brutto, 'status', r.status, 'grund', r.grund, 'eingereicht_am', r.eingereicht_am)
    order by r.eingereicht_am), '[]'::jsonb)
  from public.partner_rechnung r where r.auftrag_id = p_auftrag
$$;

create or replace function public.p279_rechnung_anlegen(p_a public.partner_auftrag, p_von uuid, p_name text, p_nr text, p_datum date,
                                                        p_netto numeric, p_satz numeric, p_pfad text)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ziel text := p_a.owner_user_id::text || '/' || p_a.id::text || '/';
  v_nr   text := left(nullif(trim(coalesce(p_nr, '')), ''), 60);
  v_ust  numeric(12,2);
  v_id   uuid;
begin
  if not public.p279_rechnung_erlaubt(p_a) then
    raise exception 'Zu diesem Auftrag kann keine Rechnung (mehr) eingereicht werden.' using errcode = '42501';
  end if;
  if v_nr is null then raise exception 'Bitte die Rechnungsnummer angeben.' using errcode = '22023'; end if;
  if p_datum is null or p_datum > current_date + 1 or p_datum < current_date - 400 then
    raise exception 'Das Rechnungsdatum ist ungültig.' using errcode = '22023';
  end if;
  if p_netto is null or p_netto <= 0 or p_netto > 1000000 or p_netto <> round(p_netto, 2) then
    raise exception 'Der Nettobetrag ist ungültig.' using errcode = '22023';
  end if;
  if p_satz is null or p_satz not in (0, 7, 19) then raise exception 'Umsatzsteuer: 0, 7 oder 19 %%.' using errcode = '22023'; end if;
  if p_pfad is null or left(p_pfad, char_length(v_ziel)) <> v_ziel
     or substr(p_pfad, char_length(v_ziel) + 1) !~ '^rechnung-[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'partner-ablage' and o.name = p_pfad) then
    raise exception 'Die Rechnungsdatei gehört nicht zu diesem Auftrag.' using errcode = '22023';
  end if;
  if exists (select 1 from public.partner_rechnung r where r.auftrag_id = p_a.id and lower(r.rechnungsnummer) = lower(v_nr) and r.status <> 'abgelehnt') then
    raise exception 'Diese Rechnungsnummer wurde zu diesem Auftrag schon eingereicht.' using errcode = '23505';
  end if;
  v_ust := round(p_netto * p_satz / 100, 2);
  insert into public.partner_rechnung (auftrag_id, owner_user_id, von_betrieb, von_name, rechnungsnummer, rechnungsdatum, netto, ust_satz, ust_betrag, brutto, pfad)
  values (p_a.id, p_a.owner_user_id, p_von, left(p_name, 160), v_nr, p_datum, p_netto, p_satz, v_ust, p_netto + v_ust, p_pfad)
  returning id into v_id;
  insert into public.partner_eintrag (auftrag_id, owner_user_id, von_betrieb, seite, von_name, art, text)
  values (p_a.id, p_a.owner_user_id, p_von, 'partner', left(p_name, 160), 'status',
          left('Rechnung eingereicht: Nr. ' || v_nr || ', ' || replace(to_char(p_netto + v_ust, 'FM999999990.00'), '.', ',') || ' € brutto', 2000));
  begin
    insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
    values (p_a.owner_user_id, 'partner_rechnung', left('Partner-Rechnung zu ' || p_a.nummer || ' — bitte prüfen', 200),
            left(p_name || ' · Nr. ' || v_nr, 300), '/dashboard/kfz/bestand/' || p_a.bezug_id || '?reiter=partner', 'partner_rechnung', v_id::text, false);
  exception when others then null;
  end;
  return v_id;
end $$;

-- 6) Betrieb-Partner: Rechnung einreichen --------------------------------------------------------------------
create or replace function public.p279_rechnung_ziel(p_auftrag uuid)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(true) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich;
  if not found or not public.p279_rechnung_erlaubt(v_a) then return null; end if;
  return v_a.owner_user_id::text || '/' || v_a.id::text || '/';
end $$;

create or replace function public.p279_rechnung_einreichen(p_auftrag uuid, p_nr text, p_datum date, p_netto numeric, p_satz numeric, p_pfad text)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(true) then raise exception 'Dafür fehlt das Schreibrecht „Kfz".' using errcode = '42501'; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich for update;
  if not found then raise exception 'Auftrag nicht gefunden.' using errcode = '42501'; end if;
  return public.p279_rechnung_anlegen(v_a, v_ich, public.p278_firma(v_ich), p_nr, p_datum, p_netto, p_satz, p_pfad);
end $$;

-- Partner liest seine Rechnungen + ob er (noch) einreichen darf
create or replace function public.p279_meine_rechnungen(p_auftrag uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(false) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich;
  if not found then return null; end if;
  return jsonb_build_object('erlaubt', public.p279_rechnung_erlaubt(v_a) and public.p278_darf(true), 'rechnungen', public.p279_rechnungen_json(v_a.id));
end $$;

-- 7) Auftraggeber: Rechnung übernehmen oder ablehnen ------------------------------------------------------------
create or replace function public.p279_darf_uebernehmen()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select auth.uid() is not null and (public.mein_chef_id() is null or (public.darf_ich_abrechnen() and public.darf_ich_modul_aendern('kfz')))
$$;

-- Für den Server vor dem Kopieren der Datei: Quelle + Ziel (null = darf nicht / schon entschieden)
create or replace function public.p279_rechnung_info(p_rechnung uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_r public.partner_rechnung;
begin
  if not public.p279_darf_uebernehmen() then return null; end if;
  select * into v_r from public.partner_rechnung where id = p_rechnung and owner_user_id = public.p278_betrieb();
  if not found or v_r.status <> 'eingereicht' then return null; end if;
  return jsonb_build_object('quelle', v_r.pfad, 'ziel', v_r.owner_user_id::text || '/eingangsbelege/partner_' || v_r.id::text || '.' || substring(v_r.pfad from '\.([a-z]+)$'));
end $$;

create or replace function public.p279_rechnung_uebernehmen(p_rechnung uuid, p_art text, p_datei text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich   uuid := public.p278_betrieb();
  v_r     public.partner_rechnung;
  v_a     public.partner_auftrag;
  v_beleg uuid;
  v_kost  uuid;
  v_ziel  text;
begin
  if not public.p279_darf_uebernehmen() then
    raise exception 'Übernehmen darf die Geschäftsleitung oder wer „Darf abrechnen" und Schreibrecht „Kfz" hat.' using errcode = '42501';
  end if;
  select * into v_r from public.partner_rechnung where id = p_rechnung and owner_user_id = v_ich for update;
  if not found then raise exception 'Rechnung nicht gefunden.' using errcode = '42501'; end if;
  if v_r.status <> 'eingereicht' then raise exception 'Über diese Rechnung wurde schon entschieden.' using errcode = '23505'; end if;
  if p_art not in ('aufbereitung', 'reparatur', 'teile', 'lack', 'reifen', 'hu', 'transport', 'zulassung', 'werbung', 'fremd', 'sonstiges') then
    raise exception 'Unbekannte Kostenart.' using errcode = '22023';
  end if;
  v_ziel := v_r.owner_user_id::text || '/eingangsbelege/partner_' || v_r.id::text || '.' || substring(v_r.pfad from '\.([a-z]+)$');
  if p_datei is not null and p_datei <> v_ziel then raise exception 'Falscher Dateipfad.' using errcode = '22023'; end if;
  select * into v_a from public.partner_auftrag where id = v_r.auftrag_id;
  insert into public.eingangsbelege (owner_user_id, lieferant, belegnummer, belegdatum, netto, ust_betrag, ust_satz, brutto, kategorie, notiz, datei_pfad, status)
  values (v_r.owner_user_id, v_r.von_name, v_r.rechnungsnummer, v_r.rechnungsdatum, v_r.netto, v_r.ust_betrag, v_r.ust_satz, v_r.brutto,
          'Fremdleistung', left('Partner-Auftrag ' || v_a.nummer || ' · ' || coalesce(v_a.fahrzeug_titel, 'Fahrzeug') || ' · ' || v_a.titel, 500),
          p_datei, 'erfasst')
  returning id into v_beleg;
  insert into public.kfz_bestand_kosten (owner_user_id, bestand_id, art, bezeichnung, betrag_netto, plan, datum)
  values (v_r.owner_user_id, v_a.bezug_id, p_art,
          left('Partner-Rechnung ' || v_r.rechnungsnummer || ' · ' || coalesce(v_r.von_name, 'Partner') || ' · ' || v_a.nummer, 160),
          v_r.netto, false, v_r.rechnungsdatum)
  returning id into v_kost;
  update public.partner_rechnung set status = 'uebernommen', beleg_id = v_beleg, kosten_id = v_kost, entschieden_am = now(), entschieden_von = auth.uid()
   where id = v_r.id;
  insert into public.partner_eintrag (auftrag_id, owner_user_id, von_betrieb, seite, von_name, art, text)
  values (v_a.id, v_a.owner_user_id, v_ich, 'auftraggeber', public.p278_firma(v_ich), 'status', left('Rechnung Nr. ' || v_r.rechnungsnummer || ' übernommen', 2000));
  return jsonb_build_object('beleg_id', v_beleg, 'kosten_id', v_kost);
end $$;

create or replace function public.p279_rechnung_ablehnen(p_rechnung uuid, p_grund text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich   uuid := public.p278_betrieb();
  v_r     public.partner_rechnung;
  v_a     public.partner_auftrag;
  v_grund text := left(nullif(trim(coalesce(p_grund, '')), ''), 300);
begin
  if not public.p279_darf_uebernehmen() then raise exception 'Dafür fehlt das Recht.' using errcode = '42501'; end if;
  if v_grund is null then raise exception 'Bitte den Grund angeben (der Partner sieht ihn).' using errcode = '22023'; end if;
  select * into v_r from public.partner_rechnung where id = p_rechnung and owner_user_id = v_ich for update;
  if not found then raise exception 'Rechnung nicht gefunden.' using errcode = '42501'; end if;
  if v_r.status <> 'eingereicht' then raise exception 'Über diese Rechnung wurde schon entschieden.' using errcode = '23505'; end if;
  update public.partner_rechnung set status = 'abgelehnt', grund = v_grund, entschieden_am = now(), entschieden_von = auth.uid() where id = v_r.id;
  select * into v_a from public.partner_auftrag where id = v_r.auftrag_id;
  insert into public.partner_eintrag (auftrag_id, owner_user_id, von_betrieb, seite, von_name, art, text)
  values (v_a.id, v_a.owner_user_id, v_ich, 'auftraggeber', public.p278_firma(v_ich), 'status',
          left('Rechnung Nr. ' || v_r.rechnungsnummer || ' zurückgewiesen — ' || v_grund, 2000));
  begin
    if v_r.von_betrieb is not null then
      insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
      values (v_r.von_betrieb, 'partner_rechnung', left('Rechnung zu ' || v_a.nummer || ' zurückgewiesen', 200), left(v_grund, 300),
              '/dashboard/kfz/partner?auftrag=' || v_a.id, 'partner_rechnung', v_r.id::text, false);
    end if;
  exception when others then null;
  end;
  return jsonb_build_object('status', 'abgelehnt');
end $$;

-- Gast-Link setzen (Auftraggeber; der Server erzeugt den Link und schickt nur den Prüfwert)
create or replace function public.p279_gast_link(p_auftrag uuid, p_hash text, p_tage integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
  v_bis timestamptz;
begin
  if not public.p278_darf(true) then raise exception 'Dafür fehlt das Schreibrecht „Kfz".' using errcode = '42501'; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and owner_user_id = v_ich for update;
  if not found then raise exception 'Auftrag nicht gefunden.' using errcode = '42501'; end if;
  if v_a.partner_betrieb is not null then raise exception 'Der Partner arbeitet in ARGONAUT — ein Gast-Link ist nicht nötig.' using errcode = '22023'; end if;
  if v_a.status not in ('offen', 'angenommen', 'fertig') and not public.p279_rechnung_erlaubt(v_a) then
    raise exception 'Der Auftrag ist abgeschlossen.' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Ungültiger Prüfwert.' using errcode = '22023'; end if;
  if p_tage is null or p_tage < 1 or p_tage > 60 then raise exception 'Gültigkeit 1 bis 60 Tage.' using errcode = '22023'; end if;
  v_bis := now() + make_interval(days => p_tage);
  perform set_config('p279.link', 'an', true);
  update public.partner_auftrag set gast_token_hash = p_hash, gast_bis = v_bis, gast_gesperrt = false where id = v_a.id;
  perform set_config('p279.link', '', true);
  return jsonb_build_object('bis', v_bis);
end $$;

-- 8) Gast (NUR Dienst-Rolle — der Server hasht den Link) ------------------------------------------------------------
create or replace function public.p279_gast_finden(p_hash text)
returns public.partner_auftrag language sql stable security definer set search_path to 'public'
as $$
  select a.* from public.partner_auftrag a
   where p_hash ~ '^[0-9a-f]{64}$' and a.gast_token_hash = p_hash and a.partner_betrieb is null
     and not a.gast_gesperrt and a.gast_bis > now()
   limit 1
$$;

create or replace function public.p279_gast_aktiv(p_a public.partner_auftrag)
returns boolean language sql stable security definer set search_path to 'public'
as $$ select p_a.id is not null and p_a.status in ('offen', 'angenommen', 'fertig') $$;

create or replace function public.p279_gast_auftrag(p_hash text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare v_a public.partner_auftrag;
begin
  v_a := public.p279_gast_finden(p_hash);
  if v_a.id is null then return null; end if;
  return public.p279_detail(v_a, public.p279_gast_aktiv(v_a), jsonb_build_object(
    'auftraggeber', public.p278_firma(v_a.owner_user_id), 'gast_name', v_a.gast_name, 'gast_bis', v_a.gast_bis,
    'rechnung_erlaubt', public.p279_rechnung_erlaubt(v_a), 'rechnungen', public.p279_rechnungen_json(v_a.id)));
end $$;

create or replace function public.p279_gast_status(p_hash text, p_neu text, p_grund text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_a public.partner_auftrag;
begin
  v_a := public.p279_gast_finden(p_hash);
  if v_a.id is null then raise exception 'Der Link ist ungültig oder abgelaufen.' using errcode = '42501'; end if;
  if not ((v_a.status = 'offen' and p_neu in ('angenommen', 'abgelehnt')) or (v_a.status = 'angenommen' and p_neu = 'fertig')) then
    raise exception 'Statuswechsel % -> % ist nicht erlaubt.', v_a.status, p_neu using errcode = '42501';
  end if;
  if p_neu = 'abgelehnt' and nullif(trim(coalesce(p_grund, '')), '') is null then
    raise exception 'Bitte kurz den Grund angeben.' using errcode = '22023';
  end if;
  perform set_config('p279.gast', 'an', true);
  update public.partner_auftrag set status = p_neu, status_grund = left(nullif(trim(coalesce(p_grund, '')), ''), 300),
         angenommen_am = case when p_neu = 'angenommen' then now() else angenommen_am end,
         fertig_am = case when p_neu = 'fertig' then now() else fertig_am end,
         beendet_am = case when p_neu = 'abgelehnt' then now() else beendet_am end
   where id = v_a.id and status = v_a.status;
  perform set_config('p279.gast', '', true);
  return jsonb_build_object('status', p_neu);
end $$;

-- Ordner für Fotos/Rechnung des Gastes (null = darf nicht)
create or replace function public.p279_gast_ziel(p_hash text, p_rechnung boolean)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare v_a public.partner_auftrag;
begin
  v_a := public.p279_gast_finden(p_hash);
  if v_a.id is null then return null; end if;
  if p_rechnung and not public.p279_rechnung_erlaubt(v_a) then return null; end if;
  if not p_rechnung and not public.p279_gast_aktiv(v_a) then return null; end if;
  return v_a.owner_user_id::text || '/' || v_a.id::text || '/';
end $$;

create or replace function public.p279_gast_eintrag(p_hash text, p_text text, p_fotos text[])
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_a     public.partner_auftrag;
  v_ziel  text;
  v_text  text := left(nullif(trim(coalesce(p_text, '')), ''), 2000);
  v_fotos text[] := coalesce(p_fotos, '{}');
  v_p     text;
  v_id    uuid;
begin
  v_a := public.p279_gast_finden(p_hash);
  if v_a.id is null or not public.p279_gast_aktiv(v_a) then raise exception 'Hier können Sie (nicht mehr) schreiben.' using errcode = '42501'; end if;
  v_ziel := v_a.owner_user_id::text || '/' || v_a.id::text || '/';
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
  values (v_a.id, v_a.owner_user_id, null, 'partner', left(v_a.gast_name || ' (Gast)', 160), 'notiz', v_text, v_fotos)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.p279_gast_rechnung(p_hash text, p_nr text, p_datum date, p_netto numeric, p_satz numeric, p_pfad text)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_a public.partner_auftrag;
begin
  v_a := public.p279_gast_finden(p_hash);
  if v_a.id is null then raise exception 'Der Link ist ungültig oder abgelaufen.' using errcode = '42501'; end if;
  return public.p279_rechnung_anlegen(v_a, null, v_a.gast_name || ' (Gast)', p_nr, p_datum, p_netto, p_satz, p_pfad);
end $$;

-- Pfad eines Fotos für den Gast (Eintrags-Foto oder freigegebenes Fahrzeugfoto), nur solange der Auftrag läuft
create or replace function public.p279_gast_bild_pfad(p_hash text, p_eintrag uuid, p_nr integer, p_medium uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_a public.partner_auftrag;
  v_e public.partner_eintrag;
begin
  v_a := public.p279_gast_finden(p_hash);
  if v_a.id is null or not public.p279_gast_aktiv(v_a) then return null; end if;
  if p_medium is not null then
    if not v_a.freigabe_fotos then return null; end if;
    return (select jsonb_build_object('bucket', 'fahrzeug-medien', 'pfad', m.pfad) from public.kfz_bestand_medien m
             where m.id = p_medium and m.bestand_id = v_a.bezug_id and m.owner_user_id = v_a.owner_user_id and m.art = 'foto');
  end if;
  select * into v_e from public.partner_eintrag where id = p_eintrag and auftrag_id = v_a.id;
  if not found or p_nr is null or p_nr < 1 or p_nr > cardinality(v_e.fotos) then return null; end if;
  return jsonb_build_object('bucket', 'partner-ablage', 'pfad', v_e.fotos[p_nr]);
end $$;

-- Rechnungsdatei für den Auftraggeber ansehen (vor dem Übernehmen)
create or replace function public.p279_rechnung_pfad(p_rechnung uuid)
returns text language sql stable security definer set search_path to 'public'
as $$
  select r.pfad from public.partner_rechnung r
   where r.id = p_rechnung and public.p278_darf(false) and r.owner_user_id = public.p278_betrieb()
$$;

-- Rechte an den Funktionen -------------------------------------------------------------------------------------
revoke all on function public.p279_detail(public.partner_auftrag, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.p279_rechnung_erlaubt(public.partner_auftrag) from public, anon, authenticated;
revoke all on function public.p279_rechnungen_json(uuid) from public, anon, authenticated;
revoke all on function public.p279_rechnung_anlegen(public.partner_auftrag, uuid, text, text, date, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.p279_darf_uebernehmen() from public, anon, authenticated;
revoke all on function public.p279_gast_finden(text) from public, anon, authenticated;
revoke all on function public.p279_gast_aktiv(public.partner_auftrag) from public, anon, authenticated;
revoke all on function public.p279_rechnung_sperre() from public, anon, authenticated;
-- angemeldete Nutzer
revoke all on function public.p279_rechnung_ziel(uuid) from public, anon;
revoke all on function public.p279_rechnung_einreichen(uuid, text, date, numeric, numeric, text) from public, anon;
revoke all on function public.p279_meine_rechnungen(uuid) from public, anon;
revoke all on function public.p279_rechnung_info(uuid) from public, anon;
revoke all on function public.p279_rechnung_uebernehmen(uuid, text, text) from public, anon;
revoke all on function public.p279_rechnung_ablehnen(uuid, text) from public, anon;
revoke all on function public.p279_gast_link(uuid, text, integer) from public, anon;
revoke all on function public.p279_rechnung_pfad(uuid) from public, anon;
grant execute on function public.p279_rechnung_ziel(uuid), public.p279_rechnung_einreichen(uuid, text, date, numeric, numeric, text),
  public.p279_meine_rechnungen(uuid), public.p279_rechnung_info(uuid), public.p279_rechnung_uebernehmen(uuid, text, text),
  public.p279_rechnung_ablehnen(uuid, text), public.p279_gast_link(uuid, text, integer), public.p279_rechnung_pfad(uuid) to authenticated;
-- nur der Server (Dienst-Rolle) für die Gast-Tür
revoke all on function public.p279_gast_auftrag(text) from public, anon, authenticated;
revoke all on function public.p279_gast_status(text, text, text) from public, anon, authenticated;
revoke all on function public.p279_gast_ziel(text, boolean) from public, anon, authenticated;
revoke all on function public.p279_gast_eintrag(text, text, text[]) from public, anon, authenticated;
revoke all on function public.p279_gast_rechnung(text, text, date, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.p279_gast_bild_pfad(text, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.p279_gast_auftrag(text), public.p279_gast_status(text, text, text), public.p279_gast_ziel(text, boolean),
  public.p279_gast_eintrag(text, text, text[]), public.p279_gast_rechnung(text, text, date, numeric, numeric, text),
  public.p279_gast_bild_pfad(text, uuid, integer, uuid) to service_role;

-- KONTROLLE — Erwartung: gast_spalten = 5, rechnung_tabelle = 1, regeln_rechnung = 2, ausloeser_rechnung = 1,
-- funktionen = 22, gast_fuer_anon = false, partner_frei = 1
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'partner_auftrag'
     and column_name in ('gast_name', 'gast_kontakt', 'gast_token_hash', 'gast_bis', 'gast_gesperrt')) as gast_spalten,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'partner_rechnung') as rechnung_tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'partner_rechnung') as regeln_rechnung,
  (select count(*) from pg_trigger where not tgisinternal and tgrelid = 'public.partner_rechnung'::regclass) as ausloeser_rechnung,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'p279\_%') as funktionen,
  (select has_function_privilege('anon', 'public.p279_gast_auftrag(text)', 'execute')
       or has_function_privilege('authenticated', 'public.p279_gast_auftrag(text)', 'execute')) as gast_fuer_anon,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'partner_auftrag'
     and column_name = 'partner_betrieb' and is_nullable = 'YES') as partner_frei;
