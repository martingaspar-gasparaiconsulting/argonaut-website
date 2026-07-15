-- ============================================================================
-- ARGONAUT OS · db/funktionen.sql
-- Stand: 15.07.2026 · Supabase-Projekt znrjnndfzzydnhbyntwa (eu-north-1)
-- ----------------------------------------------------------------------------
-- WARUM DIESE DATEI (Q5, Teil 2):
--   Diese 56 Funktionen sind das Herz der Rechte- und Ablauf-Logik. Sie lebten
--   bis heute NUR in Supabase. Ohne sie greift keine einzige Policy aus
--   db/policies.sql — die Policies rufen sie auf (z. B. mein_chef_id()).
--   Ab jetzt: versioniert im Repo, jede Aenderung im git-Diff sichtbar.
--
-- INHALT (56 Funktionen, davon 38x SECURITY DEFINER):
--   RECHTE-KERN:   mein_chef_id · mein_mitarbeiter_id · darf_ich_modul_sehen ·
--                  darf_ich_modul_aendern · darf_ich_verteilen
--   FIELD SERVICE: einsatz_status_setzen · einsatz_foto_speichern/loeschen ·
--                  einsatz_position_speichern/loeschen · einsatz_bericht_speichern ·
--                  einsatz_unterschrift_speichern · firmenkopf_fuer_einsatz
--   RAG:           match_document_chunks (pgvector)
--   GoBD-SPERREN:  inventur_audit_readonly · fn_preis_historie_readonly
--                  (blockieren UPDATE/DELETE hart — Revisionssicherheit)
--   OWNER-TRIGGER: auftraege_set_owner · einsaetze_set_owner · termine_set_owner ·
--                  termin_arten_set_owner · verfuegbarkeiten_set_owner ·
--                  erp_set_owner · erechnung_archiv_set_owner
--   HR-GLOCKE:     hr_notify_on_abwesenheit · hr_notify_on_schicht_tausch ·
--                  hr_notify_on_schicht_bestaetigung · benachrichtigung_erstellen
--   TEAM-CHAT:     ist_chat_mitglied · chat_kanal_mitglieder · chat_team_kollegen ·
--                  chat_mitglied_hinzufuegen · chat_mitglied_per_email · chat_mein_name
--   AUSWERTUNG:    mahnwesen_uebersicht · sortiment_analyse · nachbestell_vorschlag ·
--                  mein_leistungskatalog · fn_artikel_preis_historie
--   NUMMERNKREIS:  fn_rechnung_nummer · set_auftragsnummer · naechste_holz_auftragsnummer
--   ZEITSTEMPEL:   set_updated_at & Verwandte (je Modul eigene Variante)
--
-- ERZEUGT DURCH: read-only Abfrage auf pg_proc (pg_get_functiondef).
--   Aggregate und Extension-Funktionen (pgvector, btree_gist) sind bewusst
--   ausgeschlossen — die gehoeren nicht uns.
--
-- ⚠️ HINWEISE ZUR WIEDERHERSTELLUNG:
--   Alle Anweisungen sind CREATE OR REPLACE -> idempotent, mehrfach ausfuehrbar,
--   nichts wird geloescht.
--   REIHENFOLGE bei komplettem Neuaufbau:
--     1. Tabellen  2. db/funktionen.sql  3. db/trigger.sql  4. db/policies.sql
--   (Policies rufen die Funktionen auf — Funktionen muessen zuerst da sein.)
--
--   SECURITY DEFINER (38 Funktionen): laufen mit den Rechten des Erstellers,
--   NICHT des Aufrufers. Das ist Absicht (z. B. darf_ich_verteilen), aber bei
--   Aenderungen mit besonderer Sorgfalt behandeln — sie umgehen RLS.
-- ============================================================================


CREATE OR REPLACE FUNCTION public.argonaut_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auftraege_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  chef uuid;
begin
  chef := public.mein_chef_id();
  if chef is not null then
    new.owner_user_id := chef;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auftrag_abgeschlossen_melden()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Nur reagieren, wenn der Status GERADE auf 'abgeschlossen' wechselt
  -- (vorher etwas anderes) UND noch keine Rechnung dranhängt.
  if new.status = 'abgeschlossen'
     and coalesce(old.status, '') <> 'abgeschlossen'
     and new.rechnung_id is null
     and new.owner_user_id is not null
  then
    perform public.benachrichtigung_erstellen(
      new.owner_user_id,
      'auftrag_abgeschlossen',
      'Auftrag ' || coalesce(new.auftragsnummer, '') || ' abgeschlossen',
      coalesce(new.titel, 'Auftrag') || ' ist fertig — jetzt Rechnung erstellen?',
      '/dashboard/auftraege/' || new.id::text,
      'auftraege',
      new.id::text,
      24
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.benachrichtigung_erstellen(p_owner uuid, p_typ text, p_titel text, p_nachricht text DEFAULT NULL::text, p_link text DEFAULT NULL::text, p_ref_tabelle text DEFAULT NULL::text, p_ref_id text DEFAULT NULL::text, p_dedup_stunden integer DEFAULT 24)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if p_ref_id is not null then
    select id into v_id
      from public.benachrichtigungen
     where owner_user_id = p_owner
       and typ = p_typ
       and ref_id = p_ref_id
       and created_at > now() - make_interval(hours => p_dedup_stunden)
     limit 1;
    if v_id is not null then
      return v_id;               -- schon vorhanden -> nicht doppeln
    end if;
  end if;

  insert into public.benachrichtigungen
    (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id)
  values
    (p_owner, p_typ, p_titel, p_nachricht, p_link, p_ref_tabelle, p_ref_id)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_kanal_ersteller_als_mitglied()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.chat_mitglieder (kanal_id, user_id)
  values (new.id, new.erstellt_von)
  on conflict (kanal_id, user_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_kanal_mitglieder(p_kanal uuid)
 RETURNS TABLE(m_user_id uuid, m_anzeige text, m_ist_moderator boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ersteller uuid;
begin
  if not exists (select 1 from public.chat_mitglieder cm
                   where cm.kanal_id = p_kanal and cm.user_id = auth.uid()) then
    return; end if;
  select k.erstellt_von into v_ersteller from public.chat_kanaele k where k.id = p_kanal;
  return query
  select cm.user_id,
    coalesce(nullif(cm.anzeigename, ''),
      nullif((select trim(coalesce(mi.vorname,'') || ' ' || coalesce(mi.nachname,''))
                from public.mitarbeiter mi where mi.auth_user_id = cm.user_id limit 1), ''),
      nullif((select p.full_name from public.profiles p where p.id = cm.user_id limit 1), ''),
      (select split_part(u.email, '@', 1) from auth.users u where u.id = cm.user_id limit 1),
      'Unbekannt'),
    (cm.user_id = v_ersteller)
  from public.chat_mitglieder cm
  where cm.kanal_id = p_kanal
  order by 3 desc, 2;
end; $function$
;

CREATE OR REPLACE FUNCTION public.chat_mein_name()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text;
begin
  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into v_name from public.mitarbeiter where auth_user_id = auth.uid() limit 1;
  if v_name is not null and v_name <> '' then return v_name; end if;
  select full_name into v_name from public.profiles where id = auth.uid() limit 1;
  if v_name is not null and v_name <> '' then return v_name; end if;
  select split_part(email, '@', 1) into v_name from auth.users where id = auth.uid() limit 1;
  return coalesce(v_name, 'Ich');
end; $function$
;

CREATE OR REPLACE FUNCTION public.chat_mitglied_hinzufuegen(p_kanal uuid, p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ersteller uuid; v_anzeige text;
begin
  select erstellt_von into v_ersteller from public.chat_kanaele where id = p_kanal;
  if v_ersteller is null then return 'Kanal nicht gefunden.'; end if;
  if v_ersteller <> auth.uid() then
    return 'Nur der Moderator des Kanals darf Kollegen einladen.'; end if;
  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into v_anzeige from public.mitarbeiter where auth_user_id = p_user limit 1;
  insert into public.chat_mitglieder (kanal_id, user_id, anzeigename)
  values (p_kanal, p_user, nullif(v_anzeige, ''))
  on conflict (kanal_id, user_id) do nothing;
  return 'ok';
end; $function$
;

CREATE OR REPLACE FUNCTION public.chat_mitglied_per_email(p_kanal uuid, p_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user      uuid;
  v_ersteller uuid;
begin
  select erstellt_von into v_ersteller
  from public.chat_kanaele where id = p_kanal;

  if v_ersteller is null then
    return 'Kanal nicht gefunden.';
  end if;

  if v_ersteller <> auth.uid() then
    return 'Nur der Ersteller des Kanals darf Kollegen einladen.';
  end if;

  select id into v_user
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user is null then
    return 'Kein Nutzer mit dieser E-Mail gefunden.';
  end if;

  insert into public.chat_mitglieder (kanal_id, user_id)
  values (p_kanal, v_user)
  on conflict (kanal_id, user_id) do nothing;

  return 'ok';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_team_kollegen(p_kanal uuid)
 RETURNS TABLE(k_auth_user_id uuid, k_anzeige text, k_email text, k_ist_mitglied boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  select m.owner_user_id into v_owner
    from public.mitarbeiter m where m.auth_user_id = auth.uid() limit 1;
  if v_owner is null then v_owner := auth.uid(); end if;
  return query
  select m.auth_user_id,
    coalesce(nullif(trim(coalesce(m.vorname,'') || ' ' || coalesce(m.nachname,'')), ''),
             split_part(m.email, '@', 1)),
    m.email,
    exists (select 1 from public.chat_mitglieder cm
              where cm.kanal_id = p_kanal and cm.user_id = m.auth_user_id)
  from public.mitarbeiter m
  where m.owner_user_id = v_owner and m.auth_user_id is not null
    and m.auth_user_id <> auth.uid()
  order by 2;
end; $function$
;

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.darf_ich_modul_aendern(p_modul text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.mitarbeiter_rechte
    where mitarbeiter_id = mein_mitarbeiter_id()
      and p_modul = any(schreib_module)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.darf_ich_modul_sehen(p_modul text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.mitarbeiter_rechte
    where mitarbeiter_id = mein_mitarbeiter_id()
      and p_modul = any(module)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.darf_ich_verteilen()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(darf_verteilen, false)
  from public.mitarbeiter
  where auth_user_id = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.einsaetze_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then
      new.owner_user_id := coalesce(mein_chef_id(), auth.uid());
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.einsatz_bericht_speichern(p_einsatz_id uuid, p_pfad text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung'; end if;
  update einsaetze set bericht_pfad = p_pfad, bericht_am = now() where id = p_einsatz_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.einsatz_foto_loeschen(p_foto_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_hochvon uuid; v_pfad text;
begin
  select owner_user_id, hochgeladen_von, pfad into v_owner, v_hochvon, v_pfad
  from einsatz_fotos where id = p_foto_id;
  if not found then raise exception 'Foto nicht gefunden'; end if;
  if not (v_owner = v_uid or v_hochvon = v_uid) then raise exception 'Keine Berechtigung'; end if;
  delete from einsatz_fotos where id = p_foto_id;
  return v_pfad;
end; $function$
;

CREATE OR REPLACE FUNCTION public.einsatz_foto_speichern(p_einsatz_id uuid, p_pfad text, p_dateiname text, p_groesse_bytes bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid; v_neu uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;
  insert into einsatz_fotos (owner_user_id, einsatz_id, pfad, dateiname, groesse_bytes, hochgeladen_von)
  values (v_owner, p_einsatz_id, p_pfad, p_dateiname, p_groesse_bytes, v_uid)
  returning id into v_neu;
  return v_neu;
end; $function$
;

CREATE OR REPLACE FUNCTION public.einsatz_position_loeschen(p_position_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_erf uuid;
begin
  select owner_user_id, erfasst_von into v_owner, v_erf from einsatz_positionen where id = p_position_id;
  if not found then raise exception 'Position nicht gefunden'; end if;
  if not (v_owner = v_uid or v_erf = v_uid) then raise exception 'Keine Berechtigung'; end if;
  delete from einsatz_positionen where id = p_position_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.einsatz_position_speichern(p_einsatz_id uuid, p_leistungskatalog_id uuid, p_bezeichnung text, p_menge numeric, p_einheit text, p_einzelpreis_netto numeric, p_mwst_satz numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid; v_neu uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;
  insert into einsatz_positionen (owner_user_id, einsatz_id, leistungskatalog_id, bezeichnung, menge, einheit, einzelpreis_netto, mwst_satz, erfasst_von)
  values (v_owner, p_einsatz_id, p_leistungskatalog_id, p_bezeichnung, coalesce(p_menge,1), p_einheit, coalesce(p_einzelpreis_netto,0), coalesce(p_mwst_satz,19), v_uid)
  returning id into v_neu;
  return v_neu;
end; $function$
;

CREATE OR REPLACE FUNCTION public.einsatz_status_setzen(p_einsatz_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_mid   uuid;
begin
  if p_status not in ('geplant','unterwegs','vor_ort','erledigt','abgesagt') then
    raise exception 'Ungueltiger Status: %', p_status;
  end if;

  select owner_user_id, mitarbeiter_id into v_owner, v_mid
  from einsaetze where id = p_einsatz_id;
  if not found then
    raise exception 'Einsatz nicht gefunden';
  end if;

  -- Erlaubt: Eigentuemer ODER der zugewiesene Monteur
  if not (
    v_owner = v_uid
    or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)
  ) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;

  update einsaetze set
    status       = p_status,
    unterwegs_am = case when p_status = 'unterwegs' and unterwegs_am is null then now() else unterwegs_am end,
    vor_ort_am   = case when p_status = 'vor_ort'   and vor_ort_am   is null then now() else vor_ort_am   end,
    erledigt_am  = case when p_status = 'erledigt'  and erledigt_am  is null then now() else erledigt_am  end
  where id = p_einsatz_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.einsatz_unterschrift_speichern(p_einsatz_id uuid, p_pfad text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;
  update einsaetze set
    unterschrift_pfad = p_pfad,
    unterschrift_name = p_name,
    unterschrift_am   = now()
  where id = p_einsatz_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.erechnung_archiv_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := coalesce(mein_chef_id(), auth.uid());
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.erp_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  chef uuid;
begin
  chef := public.mein_chef_id();
  if chef is not null then
    new.owner_user_id := chef;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.erp_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;

CREATE OR REPLACE FUNCTION public.firmenkopf_fuer_einsatz(p_einsatz_id uuid)
 RETURNS TABLE(firma_name text, firma_strasse text, firma_plz text, firma_ort text, firma_telefon text, firma_email text, firma_ust_id text, firma_steuernummer text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz'; end if;
  return query
    select p.firma_name, p.firma_strasse, p.firma_plz, p.firma_ort,
           p.firma_telefon, p.firma_email, p.firma_ust_id, p.firma_steuernummer
    from profiles p where p.id = v_owner;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fn_artikel_preis_historie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.einkaufspreis is distinct from old.einkaufspreis then
    insert into public.preis_historie(owner_user_id, artikel_id, feld, alt_wert, neu_wert, geaendert_von)
    values (new.owner_user_id, new.id, 'einkaufspreis', old.einkaufspreis, new.einkaufspreis, auth.uid());
  end if;
  if new.verkaufspreis is distinct from old.verkaufspreis then
    insert into public.preis_historie(owner_user_id, artikel_id, feld, alt_wert, neu_wert, geaendert_von)
    values (new.owner_user_id, new.id, 'verkaufspreis', old.verkaufspreis, new.verkaufspreis, auth.uid());
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_preis_historie_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'preis_historie ist ein GoBD-Protokoll und kann nicht geaendert oder geloescht werden.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rechnung_nummer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.rechnungsnummer IS NULL THEN
    NEW.rechnungsnummer := 'RE-'
      || to_char(coalesce(NEW.rechnungsdatum, current_date), 'YYYY')
      || '-' || lpad(nextval('rechnung_nr_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.holz_set_aktualisiert_am()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.aktualisiert_am = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.hr_notify_on_abwesenheit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ma_name text;
  v_titel text;
  v_text  text;
  v_typ   text;
begin
  -- Nur benachrichtigen, wenn der EINREICHER NICHT der Chef (Owner) ist
  -- (d.h. ein Mitarbeiter im Self-Service hat eingereicht)
  if auth.uid() is not distinct from NEW.owner_user_id then
    return NEW;
  end if;

  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into ma_name
    from public.mitarbeiter
   where id = NEW.mitarbeiter_id;

  if NEW.typ = 'urlaub' then
    v_typ := 'urlaubsantrag';
    v_titel := 'Neuer Urlaubsantrag';
    v_text := coalesce(ma_name, 'Ein Mitarbeiter') || ' hat Urlaub vom '
              || to_char(NEW.von, 'DD.MM.YYYY') || ' bis ' || to_char(NEW.bis, 'DD.MM.YYYY')
              || ' beantragt (' || coalesce(NEW.tage, 0) || ' Tage).';
  elsif NEW.typ = 'krankheit' then
    v_typ := 'krankmeldung';
    v_titel := 'Neue Krankmeldung';
    v_text := coalesce(ma_name, 'Ein Mitarbeiter') || ' hat sich krankgemeldet vom '
              || to_char(NEW.von, 'DD.MM.YYYY') || ' bis ' || to_char(NEW.bis, 'DD.MM.YYYY')
              || coalesce(case when NEW.au_vorhanden then ' (AU liegt vor)' else '' end, '') || '.';
  else
    return NEW;
  end if;

  insert into public.hr_benachrichtigungen (owner_user_id, mitarbeiter_id, typ, titel, text, link, gelesen)
  values (NEW.owner_user_id, NEW.mitarbeiter_id, v_typ, v_titel, v_text, '/dashboard/personal', false);

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hr_notify_on_schicht_bestaetigung()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ma_name text;
  v_text  text;
begin
  -- Nur benachrichtigen, wenn der EINREICHER NICHT der Chef ist
  if auth.uid() is not distinct from NEW.owner_user_id then
    return NEW;
  end if;

  -- Nur bei Einwand laeuten (Zustimmung muss nicht stoeren)
  if NEW.status <> 'einwand' then
    return NEW;
  end if;

  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into ma_name
    from public.mitarbeiter
   where id = NEW.mitarbeiter_id;

  v_text := coalesce(ma_name, 'Ein Mitarbeiter') || ' hat einen Einwand zum Schichtplan der Woche ab '
    || to_char(NEW.woche_start, 'DD.MM.YYYY')
    || coalesce(': ' || NEW.kommentar, '') || '.';

  insert into public.hr_benachrichtigungen
    (owner_user_id, mitarbeiter_id, typ, titel, text, link, gelesen)
  values
    (NEW.owner_user_id, NEW.mitarbeiter_id, 'schicht_einwand', 'Einwand zum Schichtplan', v_text, '/dashboard/schichtplan', false);

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hr_notify_on_schicht_tausch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ma_name  text;
  v_titel  text;
  v_text   text;
  s_datum  date;
  s_beginn time;
  s_ende   time;
begin
  -- Nur benachrichtigen, wenn der EINREICHER NICHT der Chef (Owner) ist
  if auth.uid() is not distinct from NEW.owner_user_id then
    return NEW;
  end if;

  -- Nur bei neuen, offenen Antraegen
  if NEW.status <> 'beantragt' then
    return NEW;
  end if;

  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into ma_name
    from public.mitarbeiter
   where id = NEW.von_mitarbeiter_id;

  select datum, beginn_um, ende_um
    into s_datum, s_beginn, s_ende
    from public.hr_schichten
   where id = NEW.schicht_id;

  v_titel := 'Neue Schichttausch-Anfrage';
  v_text := coalesce(ma_name, 'Ein Mitarbeiter') || ' moechte die Schicht am '
    || coalesce(to_char(s_datum, 'DD.MM.YYYY'), '?')
    || coalesce(' (' || to_char(s_beginn, 'HH24:MI') || '-' || to_char(s_ende, 'HH24:MI') || ')', '')
    || ' abgeben'
    || coalesce(' - Grund: ' || NEW.grund, '') || '.';

  insert into public.hr_benachrichtigungen
    (owner_user_id, mitarbeiter_id, typ, titel, text, link, gelesen)
  values
    (NEW.owner_user_id, NEW.von_mitarbeiter_id, 'schicht_tausch', v_titel, v_text, '/dashboard/schichtplan', false);

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inventur_audit_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'GoBD: Inventur-Audit-Eintraege sind unveraenderbar (nur Anlegen erlaubt).';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ist_chat_mitglied(p_kanal uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.chat_mitglieder
    where kanal_id = p_kanal and user_id = p_user
  );
$function$
;

CREATE OR REPLACE FUNCTION public.mahnwesen_uebersicht(p_owner uuid DEFAULT auth.uid())
 RETURNS TABLE(id uuid, rechnungsnummer text, titel text, kontakt_id uuid, firma_id uuid, brutto_summe numeric, bezahlter_betrag numeric, offener_betrag numeric, rechnungsdatum date, faelligkeit_effektiv date, tage_ueberfaellig integer, mahnstufe integer, letzte_mahnung_am date, empfohlene_mahnstufe integer, aktion_faellig boolean, ampel text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH basis AS (
    SELECT
      r.id, r.rechnungsnummer, r.titel, r.kontakt_id, r.firma_id,
      r.brutto_summe, r.bezahlter_betrag,
      GREATEST(r.brutto_summe - r.bezahlter_betrag, 0) AS offener_betrag,
      r.rechnungsdatum,
      COALESCE(r.faelligkeitsdatum, r.rechnungsdatum + r.zahlungsziel_tage) AS faelligkeit_effektiv,
      r.mahnstufe, r.letzte_mahnung_am
    FROM rechnungen r
    WHERE r.owner_user_id = p_owner
      AND r.zahlungsstatus = 'offen'
  ),
  berechnet AS (
    SELECT
      b.*,
      (CURRENT_DATE - b.faelligkeit_effektiv)::integer AS tage_ueberfaellig,
      CASE WHEN b.letzte_mahnung_am IS NOT NULL
           THEN (CURRENT_DATE - b.letzte_mahnung_am)::integer END AS tage_seit_mahnung
    FROM basis b
  ),
  bewertet AS (
    SELECT
      c.*,
      CASE
        WHEN c.tage_ueberfaellig <= 0 THEN 0                                        -- noch nicht fällig
        WHEN c.mahnstufe = 0 THEN 1                                                 -- überfällig, noch nie gemahnt → 1. Mahnung
        WHEN c.mahnstufe = 1 AND COALESCE(c.tage_seit_mahnung, 999) >= 7 THEN 2     -- 7 Tage nach 1. → 2.
        WHEN c.mahnstufe = 2 AND COALESCE(c.tage_seit_mahnung, 999) >= 7 THEN 3     -- 7 Tage nach 2. → 3.
        ELSE c.mahnstufe                                                            -- sonst aktuelle Stufe halten
      END AS empfohlene_mahnstufe
    FROM berechnet c
  )
  SELECT
    w.id, w.rechnungsnummer, w.titel, w.kontakt_id, w.firma_id,
    w.brutto_summe, w.bezahlter_betrag, w.offener_betrag,
    w.rechnungsdatum, w.faelligkeit_effektiv, w.tage_ueberfaellig,
    w.mahnstufe, w.letzte_mahnung_am,
    w.empfohlene_mahnstufe,
    (w.empfohlene_mahnstufe > w.mahnstufe) AS aktion_faellig,
    CASE
      WHEN w.tage_ueberfaellig <= 0     THEN 'gruen'
      WHEN w.mahnstufe = 0              THEN 'gelb'
      WHEN w.mahnstufe IN (1, 2)        THEN 'orange'
      ELSE 'rot'
    END AS ampel
  FROM bewertet w
  ORDER BY w.tage_ueberfaellig DESC NULLS LAST;
$function$
;

CREATE OR REPLACE FUNCTION public.marketing_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_document_chunks(query_embedding vector, match_user_id uuid, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.3)
 RETURNS TABLE(id uuid, document_id uuid, content text, chunk_index integer, similarity double precision)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  q vector(1024);
begin
  q := query_embedding::vector(1024);
  return query
    select
      dc.id,
      dc.document_id,
      dc.content,
      dc.chunk_index,
      (1 - (dc.embedding <=> q))::double precision as similarity
    from public.document_chunks dc
    where dc.user_id = match_user_id
      and (1 - (dc.embedding <=> q)) >= match_threshold
    order by dc.embedding <=> q asc
    limit match_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mein_chef_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select owner_user_id
  from public.mitarbeiter
  where auth_user_id = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.mein_leistungskatalog()
 RETURNS TABLE(id uuid, bezeichnung text, einheit text, einheitspreis_netto numeric, festpreis_netto numeric, stundensatz_netto numeric, mwst_satz numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, bezeichnung, einheit, einheitspreis_netto, festpreis_netto, stundensatz_netto, mwst_satz
  from leistungskatalog
  where owner_user_id = coalesce(mein_chef_id(), auth.uid())
    and coalesce(aktiv, true) = true
  order by bezeichnung;
$function$
;

CREATE OR REPLACE FUNCTION public.mein_mitarbeiter_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.mitarbeiter where auth_user_id = auth.uid() limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.nachbestell_vorschlag()
 RETURNS TABLE(artikel_id uuid, artikelnummer text, bezeichnung text, einheit text, aktueller_bestand numeric, mindestbestand numeric, zielbestand numeric, empfohlene_menge numeric, einkaufspreis numeric, geschaetzte_kosten numeric, lieferant_id uuid, lieferant_name text, lieferant_email text, ampel text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    a.id,
    a.artikelnummer,
    a.bezeichnung,
    a.einheit,
    a.aktueller_bestand,
    a.mindestbestand,
    (a.mindestbestand * 2)                                              AS zielbestand,
    GREATEST(a.mindestbestand * 2 - a.aktueller_bestand, 0)             AS empfohlene_menge,
    a.einkaufspreis,
    ROUND(GREATEST(a.mindestbestand * 2 - a.aktueller_bestand, 0)
          * COALESCE(a.einkaufspreis, 0), 2)                           AS geschaetzte_kosten,
    a.lieferant_id,
    l.name                                                             AS lieferant_name,
    l.email                                                            AS lieferant_email,
    CASE WHEN a.aktueller_bestand <= 0 THEN 'rot' ELSE 'gelb' END       AS ampel
  FROM artikel a
  LEFT JOIN lieferanten l ON l.id = a.lieferant_id
  WHERE a.aktiv = true
    AND a.mindestbestand > 0
    AND a.aktueller_bestand <= a.mindestbestand
  ORDER BY (a.aktueller_bestand <= 0) DESC, l.name NULLS LAST, a.bezeichnung;
$function$
;

CREATE OR REPLACE FUNCTION public.naechste_holz_auftragsnummer(p_owner uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  jahr text := to_char(now(), 'YYYY');
  n integer;
begin
  select coalesce(max((regexp_match(nummer, '^BH-' || jahr || '-(\d+)$'))[1]::integer), 0) + 1
    into n
    from public.holz_auftraege
   where owner_user_id = p_owner and nummer like 'BH-' || jahr || '-%';
  return 'BH-' || jahr || '-' || lpad(n::text, 4, '0');
end $function$
;

CREATE OR REPLACE FUNCTION public.rechnung_zahlbetrag_neu_berechnen(p_rechnung_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_summe         numeric;
  v_letztes_datum date;
  v_brutto        numeric;
  v_status        text;
begin
  select coalesce(sum(betrag), 0), max(zahlungsdatum)
    into v_summe, v_letztes_datum
    from public.zahlungen
    where rechnung_id = p_rechnung_id;

  select brutto_summe, zahlungsstatus
    into v_brutto, v_status
    from public.rechnungen
    where id = p_rechnung_id;

  -- Nur Standard-Status automatisch pflegen; Sonderstatus in Ruhe lassen
  if v_status not in ('offen', 'teilbezahlt', 'bezahlt') then
    update public.rechnungen
      set bezahlter_betrag = v_summe, updated_at = now()
      where id = p_rechnung_id;
    return;
  end if;

  update public.rechnungen
    set bezahlter_betrag = v_summe,
        bezahlt_am = case
            when v_brutto > 0 and v_summe >= v_brutto then v_letztes_datum
            else null
          end,
        zahlungsstatus = case
            when v_brutto > 0 and v_summe >= v_brutto then 'bezahlt'
            when v_summe > 0 then 'teilbezahlt'
            else 'offen'
          end,
        updated_at = now()
    where id = p_rechnung_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_aktualisiert_am()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.aktualisiert_am = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_auftragsnummer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.auftragsnummer is null or new.auftragsnummer = '' then
    new.auftragsnummer := 'AU-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.auftrag_nr_seq')::text, 4, '0');
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sortiment_analyse(p_von timestamp with time zone DEFAULT (now() - '90 days'::interval), p_bis timestamp with time zone DEFAULT now())
 RETURNS TABLE(artikel_id uuid, artikelnummer text, bezeichnung text, kategorie text, einheit text, verbrauch numeric, verbrauchswert numeric, umsatz numeric, deckungsbeitrag numeric, bestand numeric, lagerwert_gebunden numeric, umschlag numeric, reichweite_tage numeric, abc_klasse text, status text, preis_pflege text, letzter_abgang timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH parameter AS (
    SELECT
      p_von AS von,
      p_bis AS bis,
      GREATEST((p_bis::date - p_von::date), 1) AS tage   -- Schutz gegen Division durch 0
  ),
  bewegung AS (
    SELECT
      lb.artikel_id,
      SUM(lb.menge)       FILTER (WHERE lb.typ = 'ausgang') AS menge_ausgang,
      MAX(lb.bewegung_am) FILTER (WHERE lb.typ = 'ausgang') AS letzter_abgang
    FROM lagerbewegungen lb
    CROSS JOIN parameter p
    WHERE lb.bewegung_am BETWEEN p.von AND p.bis
    GROUP BY lb.artikel_id
  ),
  basis AS (
    SELECT
      a.id AS artikel_id,
      a.artikelnummer,
      a.bezeichnung,
      a.kategorie,
      a.einheit,
      COALESCE(b.menge_ausgang, 0)                                        AS menge_ausgang,
      a.aktueller_bestand,
      a.verkaufspreis,
      ROUND(COALESCE(b.menge_ausgang,0) * COALESCE(a.einkaufspreis,0), 2) AS verbrauchswert,
      ROUND(a.aktueller_bestand * COALESCE(a.einkaufspreis,0), 2)         AS lagerwert_gebunden,
      CASE WHEN COALESCE(a.verkaufspreis,0) > 0
           THEN ROUND(COALESCE(b.menge_ausgang,0) * a.verkaufspreis, 2) END AS umsatz,
      CASE WHEN COALESCE(a.verkaufspreis,0) > 0
           THEN ROUND(COALESCE(b.menge_ausgang,0)
                      * (a.verkaufspreis - COALESCE(a.einkaufspreis,0)), 2) END AS deckungsbeitrag,
      b.letzter_abgang,
      p.tage
    FROM artikel a
    CROSS JOIN parameter p
    LEFT JOIN bewegung b ON b.artikel_id = a.id
    WHERE a.aktiv = true
  ),
  ranking AS (
    SELECT
      basis.*,
      SUM(verbrauchswert) OVER ()                                                      AS wert_gesamt,
      SUM(verbrauchswert) OVER (ORDER BY verbrauchswert DESC ROWS UNBOUNDED PRECEDING) AS wert_kum
    FROM basis
  )
  SELECT
    r.artikel_id,
    r.artikelnummer,
    r.bezeichnung,
    r.kategorie,
    r.einheit,
    r.menge_ausgang     AS verbrauch,
    r.verbrauchswert,
    r.umsatz,
    r.deckungsbeitrag,
    r.aktueller_bestand AS bestand,
    r.lagerwert_gebunden,
    ROUND(r.menge_ausgang / NULLIF(r.aktueller_bestand,0), 2) AS umschlag,
    CASE WHEN r.menge_ausgang > 0
         THEN ROUND(r.aktueller_bestand / (r.menge_ausgang / NULLIF(r.tage,0)), 0) END AS reichweite_tage,
    CASE WHEN COALESCE(r.wert_gesamt,0) = 0 THEN '—'
         WHEN 100.0*r.wert_kum/r.wert_gesamt <= 80 THEN 'A'
         WHEN 100.0*r.wert_kum/r.wert_gesamt <= 95 THEN 'B'
         ELSE 'C' END AS abc_klasse,
    CASE WHEN r.menge_ausgang = 0 THEN 'LADENHÜTER' ELSE 'läuft' END AS status,
    CASE WHEN COALESCE(r.verkaufspreis,0) = 0 THEN 'VK fehlt' ELSE 'ok' END AS preis_pflege,
    r.letzter_abgang
  FROM ranking r
  ORDER BY r.verbrauchswert DESC, r.bezeichnung;
$function$
;

CREATE OR REPLACE FUNCTION public.termin_arten_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then
      new.owner_user_id := coalesce(mein_chef_id(), auth.uid());
    end if;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.termin_arten_vorlagen_anlegen(ziel_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare anzahl integer;
begin
  if ziel_owner is null then return 0; end if;
  if exists (select 1 from termin_arten where owner_user_id = ziel_owner and ist_vorlage = true) then
    return 0;  -- schon vorhanden -> nichts doppeln
  end if;
  insert into termin_arten
    (owner_user_id, name, modus, dauer_minuten, dauer_min_minuten, dauer_max_minuten, std_pro_tag, farbe, ist_vorlage, sortierung)
  values
    (ziel_owner, 'Telefonannahme',    'fix',        15,   null, null, null, '#00e5ff', true, 10),
    (ziel_owner, 'Beratung',          'fix',        30,   null, null, null, '#C9A84C', true, 20),
    (ziel_owner, 'Vor-Ort-Termin',    'fix',        60,   null, null, null, '#4CAF7D', true, 30),
    (ziel_owner, 'Vor-Ort-Begehung',  'spanne',     null, 10,   120,  null, '#7E9CD8', true, 40),
    (ziel_owner, 'Wartung',           'fix',        120,  null, null, null, '#E0A458', true, 50),
    (ziel_owner, 'Montage/Baustelle', 'mehrtaegig', null, null, null, 8,    '#D16BA5', true, 60);
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.termine_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then
      new.owner_user_id := coalesce(mein_chef_id(), auth.uid());
    end if;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verfuegbarkeiten_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then
      new.owner_user_id := coalesce(mein_chef_id(), auth.uid());
    end if;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.vertraege_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;

CREATE OR REPLACE FUNCTION public.zahlung_rechnung_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ziel uuid;
begin
  if (tg_op = 'DELETE') then
    v_ziel := old.rechnung_id;
  else
    v_ziel := new.rechnung_id;
  end if;

  perform public.rechnung_zahlbetrag_neu_berechnen(v_ziel);

  -- Falls eine Zahlung auf eine andere Rechnung umgehängt wurde: alte auch neu rechnen
  if (tg_op = 'UPDATE' and old.rechnung_id is distinct from new.rechnung_id) then
    perform public.rechnung_zahlbetrag_neu_berechnen(old.rechnung_id);
  end if;

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$function$
;
