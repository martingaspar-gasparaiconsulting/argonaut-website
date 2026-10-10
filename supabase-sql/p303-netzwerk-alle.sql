-- ============================================================
-- ARGONAUT OS · Paket 303 (10.10.2026) · N1 Betriebs-Netzwerk für alle Branchen
--
-- Das Partner-Netzwerk aus Paket 278/279 (bisher nur am Fahrzeug im Kfz-Handel)
-- gilt jetzt auch für PROJEKTE, AUFTRÄGE und OBJEKTE: Gewerke am Bau,
-- Subunternehmer, Freelancer, Zulieferer, Reinigungs- und Hausmeisterdienste.
--
-- Additiv und mehrfach ausführbar. Es wird nichts gelöscht.
--  1) partner_auftrag.bezug_typ: zusätzlich 'projekt', 'auftrag', 'objekt'
--     (die alte Prüfregel, die nur 'kfz_bestand' kannte, wird durch eine
--     weitere ersetzt — vorhandene Kfz-Aufträge bleiben gültig);
--     neue Spalte bezug_titel (Name des Projekts/Auftrags/Objekts bzw. Fahrzeugs).
--  2) Rechte je Art: Auftraggeber-Seite braucht das Modul des Bezugs
--     (kfz / projekte / auftraege / objektzeiten); die Partner-Seite bei Kfz „kfz",
--     sonst eines der Module Projekte, Aufträge oder Objektzeiten. Geschäftsleitung immer.
--  3) Der Partner sieht bei Projekt/Auftrag/Objekt NUR: Titel des Bezugs, Auftrag,
--     Beschreibung, Termin, Verlauf — nie Kunde, Adresse, Preise, Positionen, Notizen.
--  4) Partner-Rechnung: bei Kfz wie bisher Belegeingang + Fahrzeugkosten; sonst
--     nur Belegeingang (Fremdleistung, mit Bezug im Text).
--  5) Glocke führt je Art auf die richtige Seite (/dashboard/netzwerk für alles außer Kfz).
--  Die Funktionen p278_* / p279_* werden mit gleicher Schnittstelle ersetzt;
--  für Kfz-Aufträge ändert sich nichts.
-- Aussperr-Risiko: keins. Mitarbeiter mit Recht „Kfz" sehen künftig nur noch
-- Kfz-Partner-Aufträge (bisher gab es keine anderen).
-- ============================================================

-- 1) Bezug-Arten + Titel --------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.partner_auftrag'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%bezug_typ%' and conname <> 'partner_auftrag_bezug_typ_p303'
  loop
    execute format('alter table public.partner_auftrag drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'partner_auftrag_bezug_typ_p303') then
    alter table public.partner_auftrag add constraint partner_auftrag_bezug_typ_p303
      check (bezug_typ in ('kfz_bestand', 'projekt', 'auftrag', 'objekt'));
  end if;
end $$;
alter table public.partner_auftrag add column if not exists bezug_titel text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'partner_auftrag_bezug_titel_p303') then
    alter table public.partner_auftrag add constraint partner_auftrag_bezug_titel_p303 check (bezug_titel is null or char_length(bezug_titel) <= 160);
  end if;
end $$;

-- 2) Hilfen ------------------------------------------------------------------------------------
create or replace function public.p303_modul(p_typ text)
returns text language sql immutable set search_path to 'public'
as $$ select case p_typ when 'kfz_bestand' then 'kfz' when 'projekt' then 'projekte' when 'auftrag' then 'auftraege' when 'objekt' then 'objektzeiten' end $$;

-- Titel des Bezugs, wenn er dem Betrieb gehört (sonst null). Liest die Zeile als JSON,
-- damit fehlende Spalten nie zu einem Fehler führen.
create or replace function public.p303_bezug(p_typ text, p_id uuid, p_owner uuid)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_t text;
  v_j jsonb;
  v_titel text;
begin
  v_t := case p_typ when 'kfz_bestand' then 'kfz_bestand' when 'projekt' then 'projekte' when 'auftrag' then 'auftraege' when 'objekt' then 'objekte' end;
  if v_t is null or p_id is null or p_owner is null then return null; end if;
  begin
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_t) into v_j using p_id;
  exception when others then
    return null;
  end;
  if v_j is null or coalesce(v_j->>'owner_user_id', '') <> p_owner::text then return null; end if;
  v_titel := case p_typ
    when 'kfz_bestand' then concat_ws(' ', v_j->>'marke', v_j->>'modell', v_j->>'variante')
    when 'projekt' then coalesce(nullif(trim(v_j->>'name'), ''), nullif(trim(v_j->>'titel'), ''), 'Projekt')
    when 'auftrag' then concat_ws(' · ', nullif(trim(v_j->>'auftragsnummer'), ''), coalesce(nullif(trim(v_j->>'titel'), ''), 'Auftrag'))
    when 'objekt' then coalesce(nullif(trim(v_j->>'bezeichnung'), ''), nullif(trim(v_j->>'name'), ''), 'Objekt')
  end;
  return left(coalesce(nullif(trim(v_titel), ''), case p_typ when 'kfz_bestand' then 'Fahrzeug' else 'ohne Titel' end), 160);
end $$;

-- Darf die angemeldete Person an DIESEM Auftrag lesen bzw. schreiben?
-- Auftraggeber: Modul des Bezugs. Partner: bei Kfz „kfz", sonst Projekte/Aufträge/Objektzeiten.
create or replace function public.p303_darf_auftrag(p_a public.partner_auftrag, p_schreiben boolean)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_m text[];
  v_x text;
begin
  if auth.uid() is null or p_a.id is null then return false; end if;
  if public.mein_chef_id() is null then return true; end if;
  if p_a.owner_user_id = public.p278_betrieb() or p_a.bezug_typ = 'kfz_bestand' then
    v_m := array[public.p303_modul(p_a.bezug_typ)];
  else
    v_m := array['projekte', 'auftraege', 'objektzeiten'];
  end if;
  foreach v_x in array v_m loop
    if v_x is not null and (public.darf_ich_modul_aendern(v_x) or (not p_schreiben and public.darf_ich_modul_sehen(v_x))) then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- Rechnung des Partners übernehmen: Geschäftsleitung oder „Darf abrechnen" + Schreibrecht im Modul des Bezugs
create or replace function public.p303_darf_uebernehmen(p_typ text)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select auth.uid() is not null and (public.mein_chef_id() is null
    or (public.darf_ich_abrechnen() and public.darf_ich_modul_aendern(public.p303_modul(p_typ))))
$$;

-- Wohin führt die Glocke? Auftraggeber zur Akte des Bezugs, Partner zum Eingang.
create or replace function public.p303_link(p_a public.partner_auftrag, p_auftraggeber boolean)
returns text language sql immutable set search_path to 'public'
as $$
  select case
    when p_a.bezug_typ = 'kfz_bestand' and p_auftraggeber then '/dashboard/kfz/bestand/' || p_a.bezug_id || '?reiter=partner'
    when p_a.bezug_typ = 'kfz_bestand' then '/dashboard/kfz/partner?auftrag=' || p_a.id
    when p_auftraggeber then '/dashboard/netzwerk/bezug?typ=' || p_a.bezug_typ || '&id=' || p_a.bezug_id
    else '/dashboard/netzwerk?auftrag=' || p_a.id end
$$;

-- Tor für die Funktionen: Geschäftsleitung oder irgendein Recht, das am Netzwerk teilnimmt.
-- Je Auftrag entscheidet danach p303_darf_auftrag.
create or replace function public.p278_darf(p_schreiben boolean)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select auth.uid() is not null and (
    public.mein_chef_id() is null
    or exists (select 1 from unnest(array['kfz', 'projekte', 'auftraege', 'objektzeiten']) m
                where public.darf_ich_modul_aendern(m) or (not p_schreiben and public.darf_ich_modul_sehen(m)))
  )
$$;

-- 3) Auslöser am Auftrag (ersetzt Paket 279; nur Bezug-Prüfung und Glocken-Links neu) ----------------
create or replace function public.p278_auftrag_pruefen()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich   uuid := public.p278_betrieb();
  v_verb  public.betrieb_partner;
  v_titel text;
  v_nr    integer;
  v_ok    boolean := false;
begin
  if tg_op = 'INSERT' then
    new.status := 'offen';
    new.status_grund := null; new.angenommen_am := null; new.fertig_am := null; new.beendet_am := null;
    new.gast_token_hash := null; new.gast_bis := null; new.gast_gesperrt := false;
    if new.partner_betrieb is null then
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
    if public.p303_modul(new.bezug_typ) is null then
      raise exception 'Unbekannte Art des Bezugs.' using errcode = '22023';
    end if;
    v_titel := public.p303_bezug(new.bezug_typ, new.bezug_id, new.owner_user_id);
    if v_titel is null then
      raise exception '%', case new.bezug_typ when 'kfz_bestand' then 'Das Fahrzeug gehört nicht zu Ihrem Betrieb.'
        when 'projekt' then 'Das Projekt gehört nicht zu Ihrem Betrieb.' when 'auftrag' then 'Der Auftrag gehört nicht zu Ihrem Betrieb.'
        else 'Das Objekt gehört nicht zu Ihrem Betrieb.' end using errcode = '42501';
    end if;
    new.bezug_titel := v_titel;
    new.fahrzeug_titel := case when new.bezug_typ = 'kfz_bestand' then v_titel end;
    if new.bezug_typ <> 'kfz_bestand' then
      new.freigabe_fotos := false; new.freigabe_fin := false; new.freigabe_km := false;
    end if;
    select coalesce(max(substring(nummer from 4)::integer), 0) + 1 into v_nr
      from public.partner_auftrag where owner_user_id = new.owner_user_id and nummer ~ '^PA-[0-9]{1,9}$';
    new.nummer := 'PA-' || lpad(v_nr::text, 4, '0');
    new.erstellt_am := now(); new.aktualisiert_am := now();
    return new;
  end if;

  -- UPDATE: Grunddaten bleiben, wie sie sind
  new.owner_user_id := old.owner_user_id; new.partner_betrieb := old.partner_betrieb; new.verbindung_id := old.verbindung_id;
  new.bezug_typ := old.bezug_typ; new.bezug_id := old.bezug_id; new.nummer := old.nummer; new.fahrzeug_titel := old.fahrzeug_titel;
  new.bezug_titel := old.bezug_titel;
  new.erstellt_von := old.erstellt_von; new.erstellt_am := old.erstellt_am; new.gast_name := old.gast_name;
  if auth.uid() is null then
    new.aktualisiert_am := now();
    return new;
  end if;
  new.angenommen_am := old.angenommen_am; new.fertig_am := old.fertig_am; new.beendet_am := old.beendet_am;
  if coalesce(current_setting('p279.link', true), '') <> 'an' then
    new.gast_token_hash := old.gast_token_hash; new.gast_bis := old.gast_bis;
    if old.gast_gesperrt then new.gast_gesperrt := true; end if;
  end if;
  if old.bezug_typ <> 'kfz_bestand' then
    new.freigabe_fotos := old.freigabe_fotos; new.freigabe_fin := old.freigabe_fin; new.freigabe_km := old.freigabe_km;
  end if;
  if old.status in ('abgelehnt', 'beendet', 'storniert') then
    if new.status is distinct from old.status or new.titel is distinct from old.titel or new.beschreibung is distinct from old.beschreibung
       or new.faellig_am is distinct from old.faellig_am or new.freigabe_fotos is distinct from old.freigabe_fotos
       or new.freigabe_fin is distinct from old.freigabe_fin or new.freigabe_km is distinct from old.freigabe_km then
      raise exception 'Der Auftrag ist abgeschlossen und kann nicht mehr geändert werden.' using errcode = '42501';
    end if;
    new.aktualisiert_am := now();
    return new;
  end if;

  if old.partner_betrieb is not null and v_ich = old.partner_betrieb then
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
                left(new.titel || coalesce(' · ' || coalesce(new.bezug_titel, new.fahrzeug_titel), ''), 300), public.p303_link(new, false), 'partner_auftrag', new.id::text, false);
      end if;
    elsif new.status is distinct from old.status then
      v_ziel := case when v_gast or (new.partner_betrieb is not null and v_ich = new.partner_betrieb) then new.owner_user_id else new.partner_betrieb end;
      if v_ziel is not null then
        insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
        values (v_ziel, 'partner_auftrag', left('Partner-Auftrag ' || new.nummer || ': ' || coalesce(v_namen->>new.status, new.status), 200),
                left(new.titel, 300), public.p303_link(new, v_ziel = new.owner_user_id), 'partner_auftrag', new.id::text, false);
      end if;
    end if;
  exception when others then null;
  end;
  return null;
end $$;

-- 4) Verbindung: Glocke führt ins Netzwerk (sonst wie Paket 278) ------------------------------------
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
            'Die Einladung wurde angenommen.', '/dashboard/netzwerk?reiter=verbindungen', 'betrieb_partner', v_v.id::text, false);
  exception when others then null;
  end;
  return jsonb_build_object('id', v_v.id, 'partner', v_v.anfrager_name);
end $$;

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
            '/dashboard/netzwerk?reiter=verbindungen', 'betrieb_partner', p_id::text, false);
  exception when others then null;
  end;
  return jsonb_build_object('status', 'getrennt', 'auftraege', v_n);
end $$;

-- 5) Partner-Seite: lesen, Status, Einträge, Fotos ---------------------------------------------------
-- Ansicht eines Auftrags (Partner-Betrieb und Gast): Fahrzeug-Positivliste NUR bei Kfz;
-- bei Projekt/Auftrag/Objekt nur der Titel des Bezugs.
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
    'bezug_typ', p_a.bezug_typ, 'bezug_titel', coalesce(p_a.bezug_titel, p_a.fahrzeug_titel),
    'aktiv', p_aktiv) || coalesce(p_extra, '{}'::jsonb);
  if not p_aktiv then return v_erg; end if;
  if p_a.bezug_typ = 'kfz_bestand' then
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
  end if;
  v_erg := v_erg || jsonb_build_object('eintraege', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'seite', e.seite, 'von_name', e.von_name, 'art', e.art, 'text', e.text,
                                        'fotos', cardinality(e.fotos), 'erstellt_am', e.erstellt_am) order by e.erstellt_am)
      from public.partner_eintrag e where e.auftrag_id = p_a.id), '[]'::jsonb));
  return v_erg;
end $$;

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
        'bezug_typ', a.bezug_typ, 'bezug_titel', coalesce(a.bezug_titel, a.fahrzeug_titel),
        'auftraggeber', case when v.anfrager_betrieb = a.owner_user_id then v.anfrager_name else v.partner_name end,
        'aktiv', public.p278_aktiv(a)) as z
      from public.partner_auftrag a join public.betrieb_partner v on v.id = a.verbindung_id
      where a.partner_betrieb = v_ich and public.p303_darf_auftrag(a, false)
      order by a.erstellt_am desc limit 300) t), '[]'::jsonb);
end $$;

create or replace function public.p278_eingang_detail(p_auftrag uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
  v_v   public.betrieb_partner;
begin
  if not public.p278_darf(false) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich;
  if not found or not public.p303_darf_auftrag(v_a, false) then return null; end if;
  select * into v_v from public.betrieb_partner where id = v_a.verbindung_id;
  return public.p279_detail(v_a, public.p278_aktiv(v_a), jsonb_build_object(
    'auftraggeber', case when v_v.anfrager_betrieb = v_a.owner_user_id then v_v.anfrager_name else v_v.partner_name end,
    'darf_schreiben', public.p303_darf_auftrag(v_a, true)));
end $$;

create or replace function public.p278_status(p_auftrag uuid, p_neu text, p_grund text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(true) then
    raise exception 'Dafür fehlt das Schreibrecht.' using errcode = '42501';
  end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and v_ich in (owner_user_id, partner_betrieb) for update;
  if not found then raise exception 'Auftrag nicht gefunden.' using errcode = '42501'; end if;
  if not public.p303_darf_auftrag(v_a, true) then raise exception 'Dafür fehlt das Schreibrecht.' using errcode = '42501'; end if;
  if p_neu not in ('angenommen', 'abgelehnt', 'fertig', 'beendet', 'storniert') then
    raise exception 'Unbekannter Status.' using errcode = '22023';
  end if;
  update public.partner_auftrag set status = p_neu, status_grund = left(nullif(trim(coalesce(p_grund, '')), ''), 300) where id = p_auftrag;
  return jsonb_build_object('id', p_auftrag, 'status', p_neu);
end $$;

create or replace function public.p278_ablage_ziel(p_auftrag uuid)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(true) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and v_ich in (owner_user_id, partner_betrieb);
  if not found or not public.p303_darf_auftrag(v_a, true) then return null; end if;
  if v_ich = v_a.partner_betrieb and not public.p278_aktiv(v_a) then return null; end if;
  return v_a.owner_user_id::text || '/' || v_a.id::text || '/';
end $$;

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
  if not public.p303_darf_auftrag(v_a, false) then return null; end if;
  if v_ich = v_a.owner_user_id then null;
  elsif v_ich = v_a.partner_betrieb and public.p278_aktiv(v_a) then null;
  else return null;
  end if;
  if p_nr is null or p_nr < 1 or p_nr > cardinality(v_e.fotos) then return null; end if;
  return v_e.fotos[p_nr];
end $$;

create or replace function public.p278_fahrzeugfoto_pfad(p_auftrag uuid, p_medium uuid)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(false) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich;
  if not found or v_a.bezug_typ <> 'kfz_bestand' or not v_a.freigabe_fotos or not public.p278_aktiv(v_a)
     or not public.p303_darf_auftrag(v_a, false) then return null; end if;
  return (select m.pfad from public.kfz_bestand_medien m
           where m.id = p_medium and m.bestand_id = v_a.bezug_id and m.owner_user_id = v_a.owner_user_id and m.art = 'foto');
end $$;

-- 6) Partner-Rechnung ----------------------------------------------------------------------------------
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
            left(p_name || ' · Nr. ' || v_nr, 300), public.p303_link(p_a, true), 'partner_rechnung', v_id::text, false);
  exception when others then null;
  end;
  return v_id;
end $$;

create or replace function public.p279_rechnung_ziel(p_auftrag uuid)
returns text language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(true) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich;
  if not found or not public.p303_darf_auftrag(v_a, true) or not public.p279_rechnung_erlaubt(v_a) then return null; end if;
  return v_a.owner_user_id::text || '/' || v_a.id::text || '/';
end $$;

create or replace function public.p279_rechnung_einreichen(p_auftrag uuid, p_nr text, p_datum date, p_netto numeric, p_satz numeric, p_pfad text)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(true) then raise exception 'Dafür fehlt das Schreibrecht.' using errcode = '42501'; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich for update;
  if not found then raise exception 'Auftrag nicht gefunden.' using errcode = '42501'; end if;
  if not public.p303_darf_auftrag(v_a, true) then raise exception 'Dafür fehlt das Schreibrecht.' using errcode = '42501'; end if;
  return public.p279_rechnung_anlegen(v_a, v_ich, public.p278_firma(v_ich), p_nr, p_datum, p_netto, p_satz, p_pfad);
end $$;

create or replace function public.p279_meine_rechnungen(p_auftrag uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
begin
  if not public.p278_darf(false) then return null; end if;
  select * into v_a from public.partner_auftrag where id = p_auftrag and partner_betrieb = v_ich;
  if not found or not public.p303_darf_auftrag(v_a, false) then return null; end if;
  return jsonb_build_object('erlaubt', public.p279_rechnung_erlaubt(v_a) and public.p303_darf_auftrag(v_a, true), 'rechnungen', public.p279_rechnungen_json(v_a.id));
end $$;

create or replace function public.p279_rechnung_info(p_rechnung uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_r public.partner_rechnung;
  v_a public.partner_auftrag;
begin
  select * into v_r from public.partner_rechnung where id = p_rechnung and owner_user_id = public.p278_betrieb();
  if not found or v_r.status <> 'eingereicht' then return null; end if;
  select * into v_a from public.partner_auftrag where id = v_r.auftrag_id;
  if not public.p303_darf_uebernehmen(v_a.bezug_typ) then return null; end if;
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
  select * into v_r from public.partner_rechnung where id = p_rechnung and owner_user_id = v_ich for update;
  if not found then raise exception 'Rechnung nicht gefunden.' using errcode = '42501'; end if;
  select * into v_a from public.partner_auftrag where id = v_r.auftrag_id;
  if not public.p303_darf_uebernehmen(v_a.bezug_typ) then
    raise exception 'Übernehmen darf die Geschäftsleitung oder wer „Darf abrechnen" und Schreibrecht im Modul hat.' using errcode = '42501';
  end if;
  if v_r.status <> 'eingereicht' then raise exception 'Über diese Rechnung wurde schon entschieden.' using errcode = '23505'; end if;
  if p_art not in ('aufbereitung', 'reparatur', 'teile', 'lack', 'reifen', 'hu', 'transport', 'zulassung', 'werbung', 'fremd', 'sonstiges') then
    raise exception 'Unbekannte Kostenart.' using errcode = '22023';
  end if;
  v_ziel := v_r.owner_user_id::text || '/eingangsbelege/partner_' || v_r.id::text || '.' || substring(v_r.pfad from '\.([a-z]+)$');
  if p_datei is not null and p_datei <> v_ziel then raise exception 'Falscher Dateipfad.' using errcode = '22023'; end if;
  insert into public.eingangsbelege (owner_user_id, lieferant, belegnummer, belegdatum, netto, ust_betrag, ust_satz, brutto, kategorie, notiz, datei_pfad, status)
  values (v_r.owner_user_id, v_r.von_name, v_r.rechnungsnummer, v_r.rechnungsdatum, v_r.netto, v_r.ust_betrag, v_r.ust_satz, v_r.brutto,
          'Fremdleistung', left('Partner-Auftrag ' || v_a.nummer || ' · ' || coalesce(v_a.bezug_titel, v_a.fahrzeug_titel,
            case when v_a.bezug_typ = 'kfz_bestand' then 'Fahrzeug' else 'ohne Titel' end) || ' · ' || v_a.titel, 500),
          p_datei, 'erfasst')
  returning id into v_beleg;
  if v_a.bezug_typ = 'kfz_bestand' then
    insert into public.kfz_bestand_kosten (owner_user_id, bestand_id, art, bezeichnung, betrag_netto, plan, datum)
    values (v_r.owner_user_id, v_a.bezug_id, p_art,
            left('Partner-Rechnung ' || v_r.rechnungsnummer || ' · ' || coalesce(v_r.von_name, 'Partner') || ' · ' || v_a.nummer, 160),
            v_r.netto, false, v_r.rechnungsdatum)
    returning id into v_kost;
  end if;
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
  select * into v_r from public.partner_rechnung where id = p_rechnung and owner_user_id = v_ich for update;
  if not found then raise exception 'Rechnung nicht gefunden.' using errcode = '42501'; end if;
  select * into v_a from public.partner_auftrag where id = v_r.auftrag_id;
  if not public.p303_darf_uebernehmen(v_a.bezug_typ) then raise exception 'Dafür fehlt das Recht.' using errcode = '42501'; end if;
  if v_grund is null then raise exception 'Bitte den Grund angeben (der Partner sieht ihn).' using errcode = '22023'; end if;
  if v_r.status <> 'eingereicht' then raise exception 'Über diese Rechnung wurde schon entschieden.' using errcode = '23505'; end if;
  update public.partner_rechnung set status = 'abgelehnt', grund = v_grund, entschieden_am = now(), entschieden_von = auth.uid() where id = v_r.id;
  insert into public.partner_eintrag (auftrag_id, owner_user_id, von_betrieb, seite, von_name, art, text)
  values (v_a.id, v_a.owner_user_id, v_ich, 'auftraggeber', public.p278_firma(v_ich), 'status',
          left('Rechnung Nr. ' || v_r.rechnungsnummer || ' zurückgewiesen — ' || v_grund, 2000));
  begin
    if v_r.von_betrieb is not null then
      insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
      values (v_r.von_betrieb, 'partner_rechnung', left('Rechnung zu ' || v_a.nummer || ' zurückgewiesen', 200), left(v_grund, 300),
              public.p303_link(v_a, false), 'partner_rechnung', v_r.id::text, false);
    end if;
  exception when others then null;
  end;
  return jsonb_build_object('status', 'abgelehnt');
end $$;

create or replace function public.p279_gast_link(p_auftrag uuid, p_hash text, p_tage integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ich uuid := public.p278_betrieb();
  v_a   public.partner_auftrag;
  v_bis timestamptz;
begin
  select * into v_a from public.partner_auftrag where id = p_auftrag and owner_user_id = v_ich for update;
  if not found then raise exception 'Auftrag nicht gefunden.' using errcode = '42501'; end if;
  if not public.p303_darf_auftrag(v_a, true) then raise exception 'Dafür fehlt das Schreibrecht.' using errcode = '42501'; end if;
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
    if v_a.bezug_typ <> 'kfz_bestand' or not v_a.freigabe_fotos then return null; end if;
    return (select jsonb_build_object('bucket', 'fahrzeug-medien', 'pfad', m.pfad) from public.kfz_bestand_medien m
             where m.id = p_medium and m.bestand_id = v_a.bezug_id and m.owner_user_id = v_a.owner_user_id and m.art = 'foto');
  end if;
  select * into v_e from public.partner_eintrag where id = p_eintrag and auftrag_id = v_a.id;
  if not found or p_nr is null or p_nr < 1 or p_nr > cardinality(v_e.fotos) then return null; end if;
  return jsonb_build_object('bucket', 'partner-ablage', 'pfad', v_e.fotos[p_nr]);
end $$;

create or replace function public.p279_rechnung_pfad(p_rechnung uuid)
returns text language sql stable security definer set search_path to 'public'
as $$
  select r.pfad from public.partner_rechnung r join public.partner_auftrag a on a.id = r.auftrag_id
   where r.id = p_rechnung and r.owner_user_id = public.p278_betrieb() and public.p303_darf_auftrag(a, false)
$$;

-- Rechte an den Funktionen (Hilfen nie von außen) ------------------------------------------------------
revoke all on function public.p303_modul(text) from public, anon;
grant execute on function public.p303_modul(text) to authenticated;   -- wird in den Zugriffsregeln gebraucht
revoke all on function public.p303_bezug(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.p303_darf_auftrag(public.partner_auftrag, boolean) from public, anon, authenticated;
revoke all on function public.p303_darf_uebernehmen(text) from public, anon, authenticated;
revoke all on function public.p303_link(public.partner_auftrag, boolean) from public, anon, authenticated;
revoke all on function public.p278_darf(boolean) from public, anon, authenticated;
revoke all on function public.p278_auftrag_pruefen() from public, anon, authenticated;
revoke all on function public.p278_auftrag_melden() from public, anon, authenticated;
revoke all on function public.p279_detail(public.partner_auftrag, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.p279_rechnung_anlegen(public.partner_auftrag, uuid, text, text, date, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.p278_annehmen(text) from public, anon;
revoke all on function public.p278_trennen(uuid) from public, anon;
revoke all on function public.p278_eingang() from public, anon;
revoke all on function public.p278_eingang_detail(uuid) from public, anon;
revoke all on function public.p278_status(uuid, text, text) from public, anon;
revoke all on function public.p278_ablage_ziel(uuid) from public, anon;
revoke all on function public.p278_foto_pfad(uuid, integer) from public, anon;
revoke all on function public.p278_fahrzeugfoto_pfad(uuid, uuid) from public, anon;
revoke all on function public.p279_rechnung_ziel(uuid) from public, anon;
revoke all on function public.p279_rechnung_einreichen(uuid, text, date, numeric, numeric, text) from public, anon;
revoke all on function public.p279_meine_rechnungen(uuid) from public, anon;
revoke all on function public.p279_rechnung_info(uuid) from public, anon;
revoke all on function public.p279_rechnung_uebernehmen(uuid, text, text) from public, anon;
revoke all on function public.p279_rechnung_ablehnen(uuid, text) from public, anon;
revoke all on function public.p279_gast_link(uuid, text, integer) from public, anon;
revoke all on function public.p279_rechnung_pfad(uuid) from public, anon;
grant execute on function public.p278_annehmen(text), public.p278_trennen(uuid), public.p278_eingang(), public.p278_eingang_detail(uuid),
  public.p278_status(uuid, text, text), public.p278_ablage_ziel(uuid), public.p278_foto_pfad(uuid, integer), public.p278_fahrzeugfoto_pfad(uuid, uuid),
  public.p279_rechnung_ziel(uuid), public.p279_rechnung_einreichen(uuid, text, date, numeric, numeric, text), public.p279_meine_rechnungen(uuid),
  public.p279_rechnung_info(uuid), public.p279_rechnung_uebernehmen(uuid, text, text), public.p279_rechnung_ablehnen(uuid, text),
  public.p279_gast_link(uuid, text, integer), public.p279_rechnung_pfad(uuid) to authenticated;
revoke all on function public.p279_gast_bild_pfad(text, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.p279_gast_bild_pfad(text, uuid, integer, uuid) to service_role;

-- 7) Zugriffsregeln je Art (Mitarbeiter): Modul des Bezugs statt immer „kfz" ---------------------------
drop policy if exists p181_ma_select on public.partner_auftrag;
create policy p181_ma_select on public.partner_auftrag for select to authenticated
  using (owner_user_id = public.mein_chef_id()
         and (public.darf_ich_modul_sehen(public.p303_modul(bezug_typ)) or public.darf_ich_modul_aendern(public.p303_modul(bezug_typ))));
drop policy if exists p181_ma_insert on public.partner_auftrag;
create policy p181_ma_insert on public.partner_auftrag for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(public.p303_modul(bezug_typ)));
drop policy if exists p181_ma_update on public.partner_auftrag;
create policy p181_ma_update on public.partner_auftrag for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(public.p303_modul(bezug_typ)))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(public.p303_modul(bezug_typ)));

drop policy if exists pe_ma_select on public.partner_eintrag;
create policy pe_ma_select on public.partner_eintrag for select to authenticated
  using (owner_user_id = public.mein_chef_id() and exists (
    select 1 from public.partner_auftrag a where a.id = auftrag_id
       and (public.darf_ich_modul_sehen(public.p303_modul(a.bezug_typ)) or public.darf_ich_modul_aendern(public.p303_modul(a.bezug_typ)))));

drop policy if exists pr_ma_select on public.partner_rechnung;
create policy pr_ma_select on public.partner_rechnung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and exists (
    select 1 from public.partner_auftrag a where a.id = auftrag_id
       and (public.darf_ich_modul_sehen(public.p303_modul(a.bezug_typ)) or public.darf_ich_modul_aendern(public.p303_modul(a.bezug_typ)))));

drop policy if exists bp_ma_select on public.betrieb_partner;
create policy bp_ma_select on public.betrieb_partner for select to authenticated
  using ((public.mein_chef_id() = anfrager_betrieb or public.mein_chef_id() = partner_betrieb)
         and exists (select 1 from unnest(array['kfz', 'projekte', 'auftraege', 'objektzeiten']) m
                      where public.darf_ich_modul_sehen(m) or public.darf_ich_modul_aendern(m)));

-- KONTROLLE — Erwartung: arten = true, titel_spalte = 1, hilfen = 5, regeln_auftrag = 6, regeln_eintrag = 2,
-- regeln_rechnung = 2, regeln_verbindung = 2, hilfen_fuer_angemeldete = false
select
  (select pg_get_constraintdef(oid) like '%objekt%' from pg_constraint where conname = 'partner_auftrag_bezug_typ_p303') as arten,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'partner_auftrag' and column_name = 'bezug_titel') as titel_spalte,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'p303\_%') as hilfen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'partner_auftrag') as regeln_auftrag,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'partner_eintrag') as regeln_eintrag,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'partner_rechnung') as regeln_rechnung,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'betrieb_partner') as regeln_verbindung,
  (select has_function_privilege('authenticated', 'public.p303_bezug(text, uuid, uuid)', 'execute')) as hilfen_fuer_angemeldete;
