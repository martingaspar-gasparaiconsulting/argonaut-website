-- ============================================================
-- ARGONAUT OS · Paket 185b (30.09.2026) · Schreiben nur mit Modul-Schreibrecht
--
-- Befund (Live-Stand 30.09., 503 Regeln): Auf vielen Tabellen durften
-- Mitarbeiter ueber die Datenbank anlegen/aendern/loeschen, auch wenn sie das
-- Modul auf /rechte nur LESEN duerfen (Regeln „owner = mein_chef_id()" ohne
-- Schreibrecht-Pruefung). Die Oberflaeche versteckte die Knoepfe — die
-- Datenbank liess es trotzdem zu.
--
-- WAS HIER PASSIERT (nur zusaetzliche Schranken, nichts wird geloescht,
-- keine bestehende Regel wird geaendert):
--  Je Tabelle RESTRICTIVE-Regeln fuer genau die Schreibarten, die Mitarbeiter
--  heute haben (i = anlegen, u = aendern, d = loeschen):
--    Geschaeftsleitung (mein_chef_id() leer)  -> immer erlaubt, merkt nichts
--    Mitarbeiter -> nur mit Schreibrecht fuer eines der genannten Module
--  Die Module je Tabelle stammen aus den Seiten, die im Programm auf die
--  Tabelle schreiben (184 Tabellen). NICHT dabei (bleiben wie sie sind):
--  Mein Bereich / Zeiterfassung / Urlaub / Chat (hr_*), Rechnungen und
--  Zahlungen (eigenes Recht „Darf abrechnen"), Abo-Rechnungen (185a),
--  Seiten fuer alle (Vorlagen, Formulare, Akquise …) und Tabellen, die auch
--  ueber Server-Wege beschrieben werden.
--  Server-Ablaeufe (Dienstschluessel) sind von RLS nicht betroffen.
--
-- ACHTUNG (darum getrennt, erst NACH der Vorab-Abfrage): Mitarbeiter ohne
-- Schreibrecht fuer ein Modul koennen dort danach nichts mehr anlegen,
-- aendern oder loeschen. Rueckweg: siehe NOTFALL unten.
-- Mehrfach ausfuehrbar.
-- ============================================================

do $$
declare
  z text[];
  t text;
  bed text;
  m text;
  liste text[][] := array[
    array['agentur_nutzungsrecht', 'agentur-kreativ', 'iu'],
    array['agentur_retainer', 'agentur-kreativ', 'i'],
    array['agentur_zeiten', 'agentur-kreativ', 'i'],
    array['agrar_duengebedarf', 'landwirtschaft', 'iu'],
    array['agrar_massnahmen', 'landwirtschaft', 'i'],
    array['agrar_schlaege', 'landwirtschaft', 'i'],
    array['anlagegueter', 'anlagen', 'iu'],
    array['artikel', 'ernte,erp,lager-scanner,shop,varianten', 'iud'],
    array['asset_gruppen', 'objekte', 'iu'],
    array['aufgaben_kommentare', 'projekte', 'iu'],
    array['aufmass_positionen', 'aufmass', 'iu'],
    array['auftrag_positionen', 'auftraege', 'iu'],
    array['autoresponder_schritt', 'marketing', 'iu'],
    array['autoresponder_sequenz', 'marketing', 'iu'],
    array['bau_abnahmen', 'bau-lv', 'i'],
    array['bau_lv_positionen', 'bau-lv', 'iud'],
    array['bau_nachtrag', 'bau-lv', 'i'],
    array['bau_plan', 'bautagebuch', 'i'],
    array['bau_plan_pin', 'bautagebuch', 'iu'],
    array['baustellen_fotos', 'bautagebuch,kundenportal', 'i'],
    array['bautagebuch', 'bautagebuch', 'iu'],
    array['bde_buchung', 'bde', 'iud'],
    array['bde_maschine', 'bde', 'iud'],
    array['bde_stoerung', 'bde', 'id'],
    array['belegung_einheit', 'belegung', 'iu'],
    array['bestellpositionen', 'erp', 'iud'],
    array['bestellung', 'einkauf', 'iu'],
    array['bestellung_position', 'einkauf', 'iu'],
    array['bestellungen', 'erp', 'iud'],
    array['bildung_anmeldungen', 'bildung', 'iu'],
    array['bildung_anwesenheit', 'bildung', 'iu'],
    array['bildung_kurse', 'bildung', 'i'],
    array['bildung_termine', 'bildung', 'iu'],
    array['bk_abrechnung', 'betriebskosten', 'iu'],
    array['bk_einheit', 'betriebskosten', 'iu'],
    array['bk_kostenart', 'betriebskosten', 'iu'],
    array['charge_los', 'chargen', 'iud'],
    array['charge_merkmal', 'chargen', 'iud'],
    array['charge_pruefung', 'chargen', 'iud'],
    array['charge_verwendung', 'chargen', 'iud'],
    array['cmr_frachtbrief', 'logistik', 'iu'],
    array['crm_deal', 'auftraege,pipeline,provisionen', 'iud'],
    array['dsgvo_anfragen', 'dsgvo', 'iu'],
    array['dsgvo_verfahren', 'dsgvo', 'iu'],
    array['energie_ablesungen', 'energie', 'i'],
    array['energie_anlagen', 'energie', 'iu'],
    array['ernte_ernte', 'ernte', 'iud'],
    array['ertrag_ablesung', 'ertraege', 'iud'],
    array['ertrag_anlage', 'ertraege', 'iud'],
    array['etikett_produkt', 'etiketten', 'iud'],
    array['event_veranstaltung', 'veranstaltungen', 'iud'],
    array['expose', 'expose', 'iu'],
    array['expose_interessent', 'expose', 'iud'],
    array['fahrzeug_eintrag', 'erp,logistik', 'i'],
    array['fahrzeuge', 'erp,logistik', 'iu'],
    array['fertigung_auftraege', 'fertigung', 'iu'],
    array['fertigung_stueckliste_positionen', 'fertigung', 'id'],
    array['fertigung_stuecklisten', 'fertigung', 'i'],
    array['foerder_angebote', 'foerder-angebot', 'iu'],
    array['foerder_beleg', 'foerdermittel', 'i'],
    array['forst_auftrag', 'forst', 'iu'],
    array['forst_auftrag_position', 'forst', 'iu'],
    array['forst_baeume', 'forst', 'iu'],
    array['forst_einsatzmittel', 'forst', 'iu'],
    array['forst_gutachten', 'forst', 'iu'],
    array['forst_nachweis', 'forst', 'iu'],
    array['forst_objekte', 'forst', 'iu'],
    array['freistellungen', 'compliance', 'iu'],
    array['gastro_reservierungen', 'gastro', 'iu'],
    array['gastro_trinkgeld', 'gastro', 'i'],
    array['geraet_ereignis', 'erp', 'i'],
    array['gespraech_protokoll', 'crm', 'iu'],
    array['gutachten', 'gutachten', 'iu'],
    array['gutachten_position', 'gutachten', 'iu'],
    array['gutschein', 'gutscheine', 'iu'],
    array['gutschein_einloesung', 'gutscheine', 'i'],
    array['hilfsmittel_position', 'hilfsmittel', 'iu'],
    array['hilfsmittel_versorgung', 'hilfsmittel', 'iu'],
    array['hk_zimmer', 'housekeeping', 'iud'],
    array['hotel_belegungen', 'gastro', 'iu'],
    array['hotel_kurtaxe_beleg', 'gastro', 'iu'],
    array['hotel_meldeschein', 'gastro', 'iu'],
    array['hotel_zimmer', 'gastro', 'iu'],
    array['immo_einheiten', 'immobilien', 'iu'],
    array['immo_mietvertraege', 'immobilien', 'iu'],
    array['immo_schaden', 'immobilien', 'iu'],
    array['immo_zahlungen', 'immobilien', 'i'],
    array['import_altsystem_wahl', 'import', 'iu'],
    array['import_jobs', 'import', 'iu'],
    array['import_umzug', 'import', 'iu'],
    array['inventar', 'erp', 'iu'],
    array['inventur_audit', 'erp', 'i'],
    array['inventur_zaehlung', 'erp', 'iud'],
    array['it_asset', 'itassets', 'iud'],
    array['it_assets', 'it-msp', 'i'],
    array['it_lizenz', 'itassets', 'iud'],
    array['it_sla', 'itassets', 'iud'],
    array['it_vertraege', 'it-msp', 'iu'],
    array['kalkulationen', 'kalkulator', 'iu'],
    array['kanzlei_akte', 'fristen', 'iu'],
    array['kanzlei_frist', 'fristen', 'iu'],
    array['kanzlei_fristen', 'kanzlei', 'iu'],
    array['kanzlei_mandate', 'kanzlei', 'i'],
    array['kfz_fahrzeuge', 'kfz', 'iu'],
    array['kfz_reifeneinlagerung', 'kfz', 'iu'],
    array['kfz_schadenfall', 'kfz', 'iu'],
    array['kontakt_tags', 'crm', 'iu'],
    array['korrespondenz', 'korrespondenz', 'iu'],
    array['kunden_mandate', 'rechnungen', 'iu'],
    array['leistungskatalog', 'kalkulator,leistungskatalog', 'iu'],
    array['lieferant', 'einkauf', 'iu'],
    array['lieferanten', 'erp', 'iud'],
    array['lm_chargen', 'chargen,lebensmittel,rezeptur', 'i'],
    array['lm_haccp', 'lebensmittel', 'i'],
    array['lm_haccp_plan', 'lebensmittel', 'iu'],
    array['logistik_sendungen', 'logistik', 'iu'],
    array['logistik_touren', 'logistik', 'iu'],
    array['maengel', 'bautagebuch', 'iu'],
    array['markt_produkt', 'ernte', 'iud'],
    array['markt_verkauf', 'ernte', 'iud'],
    array['menu_gericht', 'housekeeping', 'iud'],
    array['mitglied_checkin', 'mitglieder', 'i'],
    array['nachkauf_verkauf', 'wellness', 'iu'],
    array['nachweis', 'nachweise', 'iu'],
    array['nachweis_unterschrift', 'nachweise', 'i'],
    array['objekte', 'objektzeiten', 'iu'],
    array['praxis_ausfall', 'wellness', 'i'],
    array['praxis_einwilligung', 'wellness', 'i'],
    array['praxis_recall', 'wellness', 'iu'],
    array['projekt_beteiligte', 'projekte', 'iu'],
    array['projekt_teams', 'projekte', 'iu'],
    array['projekt_vorlagen', 'projekte', 'iu'],
    array['proof_asset', 'freigaben', 'iud'],
    array['proof_feedback', 'freigaben', 'id'],
    array['proof_version', 'freigaben', 'iud'],
    array['pruef_protokoll', 'pruefprotokolle', 'iu'],
    array['pruef_punkt', 'pruefprotokolle', 'iu'],
    array['pruefpflichten', 'compliance', 'iu'],
    array['qs_reklamation', 'chargen', 'iu'],
    array['raum_belegung', 'raeume', 'iud'],
    array['raum_ressource', 'raeume', 'iud'],
    array['reisekosten', 'reisekosten', 'iu'],
    array['reservierung_platz', 'reservierung', 'iu'],
    array['ressourcen', 'buchungen', 'iu'],
    array['rezeptur_zutaten', 'rezeptur', 'iu'],
    array['rezepturen', 'rezeptur', 'iu'],
    array['schlag', 'schlagkartei', 'iu'],
    array['schlag_bedarf', 'schlagkartei', 'iu'],
    array['schlag_duengung', 'schlagkartei', 'iu'],
    array['schlag_psm', 'schlagkartei', 'iu'],
    array['shop_retoure', 'shop', 'iu'],
    array['sofortmeldungen', 'compliance', 'iu'],
    array['spende', 'spenden', 'iu'],
    array['spende_einstellung', 'spenden', 'iu'],
    array['text_werk', 'marketing', 'iu'],
    array['ticket_verlauf', 'service', 'iu'],
    array['tier_behandlungen', 'tier', 'i'],
    array['tier_bewegung', 'tierbestand', 'iu'],
    array['tier_erinnerung', 'tier', 'i'],
    array['tier_got_leistung', 'tier', 'iu'],
    array['tier_gruppe', 'tierbestand', 'iu'],
    array['tier_stichtag', 'tierbestand', 'iu'],
    array['tier_tiere', 'tier', 'iu'],
    array['tour', 'tour', 'iu'],
    array['tour_stopp', 'tour', 'iu'],
    array['variante_artikel', 'varianten', 'iud'],
    array['variante_gruppe', 'varianten', 'iud'],
    array['verein_ehrenamt', 'verein', 'i'],
    array['verein_mitglieder', 'verein', 'iu'],
    array['verein_veranstaltungen', 'verein', 'i'],
    array['verleih_artikel', 'verleih', 'iu'],
    array['vorlagen_aufgaben', 'projekte', 'iu'],
    array['wareneingang', 'erp', 'iud'],
    array['wareneingang_positionen', 'erp', 'iud'],
    array['wartungshistorie', 'wartung', 'i'],
    array['wellness_behandlungen', 'wellness', 'i'],
    array['wellness_kunden', 'wellness', 'i'],
    array['werkstatt_fahrzeug_halter_log', 'fahrzeugakte', 'iu'],
    array['werkstatt_fahrzeuge', 'fahrzeugakte,werkstatt', 'iu'],
    array['werkstatt_freigabe_log', 'werkstatt', 'i'],
    array['werkstatt_positionen', 'werkstatt', 'iu'],
    array['werkstatt_status_log', 'werkstatt', 'i'],
    array['zuschnitt_projekt', 'zuschnitt', 'iu'],
    array['zuschnitt_teil', 'zuschnitt', 'iu']
  ];
begin
  foreach z slice 1 in array liste loop
    t := z[1];
    if to_regclass('public.' || t) is null then
      raise notice '%: Tabelle nicht gefunden, uebersprungen', t;
      continue;
    end if;
    bed := 'public.mein_chef_id() is null';
    foreach m in array string_to_array(z[2], ',') loop
      bed := bed || format(' or public.darf_ich_modul_aendern(%L)', m);
    end loop;
    execute format('drop policy if exists p185b_anlegen on public.%I', t);
    execute format('drop policy if exists p185b_aendern on public.%I', t);
    execute format('drop policy if exists p185b_loeschen on public.%I', t);
    if position('i' in z[3]) > 0 then
      execute format('create policy p185b_anlegen on public.%I as restrictive for insert to authenticated with check (%s)', t, bed);
    end if;
    if position('u' in z[3]) > 0 then
      execute format('create policy p185b_aendern on public.%I as restrictive for update to authenticated using (%s) with check (%s)', t, bed, bed);
    end if;
    if position('d' in z[3]) > 0 then
      execute format('create policy p185b_loeschen on public.%I as restrictive for delete to authenticated using (%s)', t, bed);
    end if;
  end loop;
end $$;

-- KONTROLLE — Erwartung: tabellen_mit_schranke = 184 (bzw. weniger, wenn eine
-- Tabelle live fehlt), permissive_neu = 0
select
  (select count(distinct tablename) from pg_policies where schemaname = 'public' and policyname like 'p185b_%') as tabellen_mit_schranke,
  (select count(*) from pg_policies where schemaname = 'public' and policyname like 'p185b_%') as schranken,
  (select count(*) from pg_policies where schemaname = 'public' and policyname like 'p185b_%' and permissive <> 'RESTRICTIVE') as permissive_neu;

-- NOTFALL (nur falls ein Mitarbeiter etwas Wichtiges nicht mehr kann und die
-- Rechte nicht sofort gesetzt werden koennen): diesen Block auskommentiert lassen.
-- Er nimmt NUR die Schranken aus 185b wieder heraus, sonst nichts.
-- do $$ declare r record; begin
--   for r in select tablename, policyname from pg_policies where schemaname = 'public' and policyname like 'p185b_%' loop
--     execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
--   end loop; end $$;
