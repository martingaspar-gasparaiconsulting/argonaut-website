-- ============================================================================
-- ARGONAUT OS · Demo-Datensatz „Bäckerei Sonnenschein" (Max Mustermann) — v2
-- Läuft NUR für gaspar.71032@web.de. Löscht die alte gemischte Demo-Welt und
-- legt EINEN roten Faden neu an (Catering 1.800 €).
-- NEU in v2: setzt die Login-Identität (auth.uid) auf den Demo-User, damit die
-- Trigger den Besitzer korrekt setzen. Bei einem Fehler wird der Grund als
-- Meldung ausgegeben (Messages-Tab), statt still zurückzurollen.
-- ============================================================================
do $$
declare
  v_user uuid;
  v_lief_muehle uuid; v_lief_weber uuid; v_lief_verp uuid;
  v_kampagne uuid;
  v_lead uuid;
  v_k_stadtwerke uuid; v_k_cafe uuid; v_k_hotel uuid; v_k_kita uuid; v_k_mueller uuid;
  v_rechnung uuid;
  v_angebot uuid;
begin
  select id into v_user from auth.users where email = 'gaspar.71032@web.de';
  if v_user is null then raise exception 'Demo-User nicht gefunden'; end if;

  -- Login-Identität simulieren, damit Trigger owner_user_id korrekt setzen.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  begin
    -- 1) AUFRÄUMEN -----------------------------------------------------------
    update public.kontakte            set lead_id=null, kampagne_id=null, firma_id=null, mitarbeiter_id=null where owner_user_id=v_user;
    update public.leads               set kontakt_id=null, kampagne_id=null where owner_user_id=v_user;
    update public.marketing_kampagnen set lead_id=null, rechnung_id=null, zielgruppe_id=null, firma_id=null where owner_user_id=v_user;
    update public.angebote            set rechnung_id=null, kontakt_id=null where owner_user_id=v_user;
    update public.artikel             set lieferant_id=null, firma_id=null, kunde_id=null where owner_user_id=v_user;

    delete from public.angebot_positionen   where owner_user_id=v_user;
    delete from public.angebote             where owner_user_id=v_user;
    delete from public.rechnungen           where owner_user_id=v_user;
    delete from public.crm_deal             where owner_user_id=v_user;
    delete from public.versand_sendung      where owner_user_id=v_user;
    delete from public.eingangsbelege       where owner_user_id=v_user;
    delete from public.marketing_inhalte    where owner_user_id=v_user;
    delete from public.marketing_kalender   where owner_user_id=v_user;
    delete from public.marketing_kampagnen  where owner_user_id=v_user;
    delete from public.marketing_zielgruppen where owner_user_id=v_user;
    delete from public.ads_kampagne         where owner_user_id=v_user;
    delete from public.leads                where owner_user_id=v_user;
    delete from public.kontakte             where owner_user_id=v_user;
    delete from public.artikel              where owner_user_id=v_user;
    delete from public.lieferanten          where owner_user_id=v_user;
    delete from public.beispiel_datensatz   where owner_user_id=v_user;

    -- 2) ZULIEFERER ----------------------------------------------------------
    insert into public.lieferanten (owner_user_id, name, ansprechpartner, email, telefon, adresse, aktiv)
    values (v_user, 'Mühle Bauer GmbH', 'Herr Bauer', 'kontakt@muehle-bauer.de', '07031 123456', 'Mühlenweg 3, 71032 Böblingen', true) returning id into v_lief_muehle;
    insert into public.lieferanten (owner_user_id, name, ansprechpartner, email, telefon, adresse, aktiv)
    values (v_user, 'Großhandel Weber', 'Frau Weber', 'bestellung@grosshandel-weber.de', '0711 998877', 'Industriestraße 12, 70565 Stuttgart', true) returning id into v_lief_weber;
    insert into public.lieferanten (owner_user_id, name, ansprechpartner, email, telefon, adresse, aktiv)
    values (v_user, 'Verpackungen Meier', 'Herr Meier', 'info@verpackungen-meier.de', '07031 445566', 'Gewerbering 8, 71034 Böblingen', true) returning id into v_lief_verp;

    -- 3) ARTIKEL -------------------------------------------------------------
    insert into public.artikel (owner_user_id, bezeichnung, kategorie, einheit, einkaufspreis, verkaufspreis, mindestbestand, aktueller_bestand, aktiv, lieferant_id) values
    (v_user, 'Bauernbrot 1 kg',            'Brot',        'Stk',    0.80,   3.90, 20, 60, true, v_lief_muehle),
    (v_user, 'Roggenmischbrot 750 g',      'Brot',        'Stk',    0.70,   3.50, 20, 45, true, v_lief_muehle),
    (v_user, 'Brötchen',                   'Kleingebäck', 'Stk',    0.08,   0.45, 200, 480, true, v_lief_muehle),
    (v_user, 'Butter-Croissant',           'Kleingebäck', 'Stk',    0.25,   1.60, 60, 120, true, v_lief_weber),
    (v_user, 'Laugengebäck',               'Kleingebäck', 'Stk',    0.15,   1.20, 80, 150, true, v_lief_muehle),
    (v_user, 'Hochzeitstorte 3-stöckig',   'Torten',      'Stk',   45.00, 189.00,  0,   2, true, v_lief_weber),
    (v_user, 'Catering-Paket „Herzhaft“',  'Catering',    'Person',12.00,  28.00,  0,   0, true, v_lief_weber),
    (v_user, 'Weizenmehl Type 550 (25 kg)','Rohstoff',    'Sack',  18.00,   0.00,  4,  12, true, v_lief_muehle);

    -- 4) MARKETING-KAMPAGNEN -------------------------------------------------
    insert into public.marketing_kampagnen (owner_user_id, name, ziel, beschreibung, status, kanaele, budget, start_datum, end_datum)
    values (v_user, 'Frühlings-Catering 2026', 'Neue Catering-Aufträge gewinnen',
            'Newsletter- und Social-Aktion an Stammkunden für Firmenjubiläen und Frühjahrs-Feiern.',
            'aktiv', array['newsletter','instagram','facebook'], 800, date '2026-06-01', date '2026-08-31')
    returning id into v_kampagne;
    insert into public.marketing_kampagnen (owner_user_id, name, ziel, beschreibung, status, kanaele, budget, start_datum, end_datum) values
    (v_user, 'Sonntagsbrötchen-Abo', 'Stammkunden binden', 'Wöchentliches Brötchen-Abo mit Lieferung am Sonntagmorgen.', 'aktiv',  array['newsletter','whatsapp'], 300, date '2026-05-01', date '2026-12-31'),
    (v_user, 'Hochzeitstorten-Aktion', 'Torten-Aufträge Sommer', 'Aktion für Hochzeits- und Feiertorten in der Sommersaison.', 'entwurf', array['instagram'], 500, date '2026-07-01', date '2026-09-30');

    -- 5) LEADS ---------------------------------------------------------------
    insert into public.leads (owner_user_id, name, telefon, email, dienstleistung, menge, einheit, nachricht, status, quelle, ist_bestand, werbung_einwilligung, kampagne_id, score)
    values (v_user, 'Stadtwerke Böblingen', '07031 654321', 'einkauf@stadtwerke-bb.de', 'Catering Firmenjubiläum', '40', 'Personen',
            'Wir feiern unser Firmenjubiläum und suchen ein Catering für ca. 40 Personen. Bitte um ein Angebot.', 'gewonnen',
            'Kampagne: Frühlings-Catering 2026', false, true, v_kampagne, 92)
    returning id into v_lead;
    insert into public.leads (owner_user_id, name, telefon, email, dienstleistung, menge, einheit, nachricht, status, quelle, ist_bestand, werbung_einwilligung, score)
    values (v_user, 'Café am Markt', '07031 220033', 'leitung@cafe-am-markt.de', 'Kuchenlieferung wöchentlich', '3', 'Bleche',
            'Wir suchen einen Partner für die wöchentliche Kuchenlieferung. Können Sie ein Angebot machen?', 'neu',
            'Website', false, true, 70);

    -- 6) KUNDEN (KONTAKTE) ---------------------------------------------------
    insert into public.kontakte (owner_user_id, vorname, nachname, email, telefon, firma, status, quelle, strasse, plz, ort, land, lead_id, kampagne_id)
    values (v_user, 'Sabine', 'Krüger', 'einkauf@stadtwerke-bb.de', '07031 654321', 'Stadtwerke Böblingen', 'kunde', 'Kampagne: Frühlings-Catering 2026', 'Wolfgang-Brumme-Allee 1', '71032', 'Böblingen', 'DE', v_lead, v_kampagne)
    returning id into v_k_stadtwerke;
    insert into public.kontakte (owner_user_id, vorname, nachname, email, telefon, firma, status, quelle, strasse, plz, ort, land)
    values (v_user, 'Markus', 'Frey', 'kontakt@cafe-central.de', '07031 330044', 'Café Central', 'kunde', 'Beispiel', 'Marktplatz 5', '71032', 'Böblingen', 'DE') returning id into v_k_cafe;
    insert into public.kontakte (owner_user_id, vorname, nachname, email, telefon, firma, status, quelle, strasse, plz, ort, land)
    values (v_user, 'Petra', 'Lang', 'einkauf@hotel-bergblick.de', '08322 112233', 'Hotel Bergblick', 'kunde', 'Beispiel', 'Gipfelstraße 1', '87561', 'Oberstdorf', 'DE') returning id into v_k_hotel;
    insert into public.kontakte (owner_user_id, vorname, nachname, email, telefon, firma, status, quelle, strasse, plz, ort, land)
    values (v_user, 'Julia', 'Braun', 'leitung@kita-sonnenblume.de', '07031 556677', 'Kindergarten Sonnenblume', 'kunde', 'Beispiel', 'Blumenweg 4', '71034', 'Böblingen', 'DE') returning id into v_k_kita;
    insert into public.kontakte (owner_user_id, vorname, nachname, email, telefon, firma, status, quelle, strasse, plz, ort, land)
    values (v_user, 'Familie', 'Müller', 'mueller.hochzeit@web.de', '0170 1234567', 'Privat', 'interessent', 'Beispiel', 'Rosenweg 9', '71032', 'Böblingen', 'DE') returning id into v_k_mueller;

    update public.leads set kontakt_id = v_k_stadtwerke where id = v_lead;

    -- 7) PIPELINE (CRM-DEALS) ------------------------------------------------
    insert into public.crm_deal (owner_user_id, kontakt_id, titel, wert_netto, stufe, wahrscheinlichkeit, firma, erwartetes_datum, notiz) values
    (v_user, v_k_stadtwerke, 'Catering Firmenjubiläum Stadtwerke', 1800, 'gewonnen',     100, 'Stadtwerke Böblingen', date '2026-07-10', 'Aus Kampagne Frühlings-Catering 2026'),
    (v_user, v_k_hotel,      'Frühstücksbelieferung Hotel Bergblick', 3600, 'verhandlung', 60, 'Hotel Bergblick',      date '2026-08-20', 'Rahmenvertrag im Gespräch'),
    (v_user, v_k_mueller,    'Hochzeitstorte Familie Müller',          189, 'angebot',      50, 'Privat',               date '2026-08-05', 'Angebot verschickt'),
    (v_user, v_k_cafe,       'Kuchenlieferung Café am Markt',          620, 'qualifiziert', 30, 'Café am Markt',        date '2026-08-25', 'Erstkontakt über Website');

    -- 8) RECHNUNGEN ----------------------------------------------------------
    insert into public.rechnungen (owner_user_id, rechnungsnummer, kontakt_id, titel, empfaenger_name, zahlungsstatus,
          rechnungsdatum, leistungsdatum, faelligkeitsdatum, zahlungsziel_tage, netto_summe, mwst_summe, brutto_summe,
          waehrung, bezahlt_am, bezahlter_betrag)
    values (v_user, 'RE-2026-0001', v_k_stadtwerke, 'Catering-Paket Firmenjubiläum, 40 Personen', 'Stadtwerke Böblingen', 'bezahlt',
            date '2026-07-15', date '2026-07-12', date '2026-07-29', 14, 1800.00, 126.00, 1926.00, 'EUR', date '2026-07-20', 1926.00)
    returning id into v_rechnung;
    insert into public.rechnungen (owner_user_id, rechnungsnummer, kontakt_id, titel, empfaenger_name, zahlungsstatus,
          rechnungsdatum, leistungsdatum, faelligkeitsdatum, zahlungsziel_tage, netto_summe, mwst_summe, brutto_summe,
          waehrung, bezahlt_am, bezahlter_betrag) values
    (v_user, 'RE-2026-0002', v_k_cafe,  'Sonntagsbrötchen-Lieferung Juli', 'Café Central',  'bezahlt',    date '2026-07-05', date '2026-07-05', date '2026-07-19', 14, 210.00, 14.70, 224.70, 'EUR', date '2026-07-10', 224.70),
    (v_user, 'RE-2026-0003', v_k_hotel, 'Frühstücksbuffet Wochenende',     'Hotel Bergblick','offen',      date '2026-07-22', date '2026-07-20', date '2026-08-05', 14, 480.00, 33.60, 513.60, 'EUR', null, 0),
    (v_user, 'RE-2026-0004', v_k_mueller,'Hochzeitstorte 3-stöckig',       'Familie Müller', 'teilbezahlt',date '2026-07-18', date '2026-07-18', date '2026-08-01', 14, 189.00, 13.23, 202.23, 'EUR', null, 101.00);

    -- 9) ANGEBOT (angenommen) + Positionen -----------------------------------
    insert into public.angebote (owner_user_id, angebotsnummer, kontakt_id, titel, kunde_name, status, gueltig_bis,
          netto_summe, mwst_summe, brutto_summe, token, angenommen_am, rechnung_id, rabatt_prozent, rabatt_betrag,
          genehmigung_noetig, genehmigt, notiz)
    values (v_user, 'AN-2026-0001', v_k_stadtwerke, 'Catering-Paket Firmenjubiläum, 40 Personen', 'Stadtwerke Böblingen', 'angenommen', date '2026-07-20',
            1800.00, 126.00, 1926.00, gen_random_uuid(), timestamptz '2026-07-12 10:00+02', v_rechnung, 0, 0, false, true, 'Aus Kampagne Frühlings-Catering 2026')
    returning id into v_angebot;
    insert into public.angebot_positionen (owner_user_id, angebot_id, position, bezeichnung, menge, einheit, einzelpreis, mwst_satz, gesamt_netto, rabatt_prozent) values
    (v_user, v_angebot, 1, 'Catering-Paket „Herzhaft“ (belegte Brötchen, Laugengebäck)', 40, 'Person',   28.00, 7, 1120.00, 0),
    (v_user, v_angebot, 2, 'Kuchen- und Tortenauswahl',                                  40, 'Person',   12.00, 7,  480.00, 0),
    (v_user, v_angebot, 3, 'Lieferung & Aufbau vor Ort',                                  1, 'Pauschale',200.00, 7,  200.00, 0);

    insert into public.angebote (owner_user_id, angebotsnummer, kontakt_id, titel, kunde_name, status, gueltig_bis,
          netto_summe, mwst_summe, brutto_summe, token, rabatt_prozent, rabatt_betrag, genehmigung_noetig, genehmigt, notiz)
    values (v_user, 'AN-2026-0002', v_k_hotel, 'Frühstücksbelieferung — Rahmenangebot', 'Hotel Bergblick', 'gesendet', date '2026-08-31',
            3600.00, 252.00, 3852.00, gen_random_uuid(), 0, 0, false, false, 'Rahmenvertrag Frühstück, monatlich');

    -- 10) EINGANGSBELEGE -----------------------------------------------------
    insert into public.eingangsbelege (owner_user_id, lieferant, belegnummer, belegdatum, netto, ust_satz, ust_betrag, brutto, kategorie, notiz) values
    (v_user, 'Mühle Bauer GmbH',    'ER-4471', date '2026-07-03', 340.00, 7,  23.80, 363.80, 'Wareneinkauf', 'Mehllieferung Juli'),
    (v_user, 'Großhandel Weber',    'WE-9920', date '2026-07-08', 210.00, 7,  14.70, 224.70, 'Wareneinkauf', 'Zutaten & Belag'),
    (v_user, 'Verpackungen Meier',  'VM-1188', date '2026-07-11',  95.00, 19, 18.05, 113.05, 'Verpackung',   'Catering-Boxen & Tüten'),
    (v_user, 'Stadtwerke Böblingen','SW-2026-07', date '2026-07-14',180.00,19, 34.20, 214.20, 'Nebenkosten',  'Strom Backstube');

    raise notice 'Bäckerei-Kern OK für %', v_user;
  exception when others then
    raise notice 'KERN-FEHLER: %', sqlerrm;
  end;
end $$;
