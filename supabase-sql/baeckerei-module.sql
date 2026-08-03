-- ============================================================================
-- ARGONAUT OS · Bäckerei Sonnenschein — ALLE Bäckerei-Module befüllen
-- Läuft NUR für gaspar.71032@web.de. VORAUSSETZUNG: baeckerei-demo.sql wurde
-- schon ausgeführt (Kunden, Artikel, Lieferanten müssen existieren).
-- Jedes Modul steht in einem eigenen Schutzblock (begin/exception): schlägt
-- eines fehl, wird NUR dieses übersprungen + gemeldet, der Rest läuft weiter.
-- ============================================================================
do $$
declare
  v_user uuid;
  v_id uuid; v_id2 uuid; v_id3 uuid;
begin
  select id into v_user from auth.users where email = 'gaspar.71032@web.de';
  if v_user is null then raise exception 'Demo-User nicht gefunden'; end if;

  -- Login-Identität simulieren, damit Trigger owner_user_id korrekt setzen.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  -- ========================= REZEPTUR =========================
  begin
    delete from public.rezeptur_zutaten where owner_user_id=v_user;
    delete from public.rezepturen where owner_user_id=v_user;

    insert into public.rezepturen (owner_user_id, name, typ, basis_menge, basis_einheit, portionen, backverlust_prozent, foodcost_ziel, notiz, archiviert)
    values (v_user,'Bauernbrot','Brot',30,'Stk',30,12,0.25,'Hausrezept, 48h Sauerteigführung',false) returning id into v_id;
    insert into public.rezeptur_zutaten (owner_user_id, rezeptur_id, position, bezeichnung, menge, einheit, preis_pro_einheit, rolle) values
    (v_user,v_id,1,'Weizenmehl Type 550',18,'kg',0.90,'zutat'),
    (v_user,v_id,2,'Roggenmehl Type 1150',6,'kg',1.10,'zutat'),
    (v_user,v_id,3,'Wasser',15,'l',0.00,'zutat'),
    (v_user,v_id,4,'Salz',0.4,'kg',0.50,'zutat'),
    (v_user,v_id,5,'Sauerteig',2,'kg',0.80,'zutat');

    insert into public.rezepturen (owner_user_id, name, typ, basis_menge, basis_einheit, portionen, backverlust_prozent, foodcost_ziel, notiz, archiviert)
    values (v_user,'Sonntagsbrötchen','Kleingebäck',100,'Stk',100,8,0.10,'Knusprig, für Abo-Lieferung',false) returning id into v_id;
    insert into public.rezeptur_zutaten (owner_user_id, rezeptur_id, position, bezeichnung, menge, einheit, preis_pro_einheit, rolle) values
    (v_user,v_id,1,'Weizenmehl Type 550',6,'kg',0.90,'zutat'),
    (v_user,v_id,2,'Wasser',3.6,'l',0.00,'zutat'),
    (v_user,v_id,3,'Hefe',0.3,'kg',3.00,'zutat'),
    (v_user,v_id,4,'Salz',0.12,'kg',0.50,'zutat');

    insert into public.rezepturen (owner_user_id, name, typ, basis_menge, basis_einheit, portionen, backverlust_prozent, foodcost_ziel, notiz, archiviert)
    values (v_user,'Hochzeitstorte 3-stöckig','Torte',1,'Stk',40,0,0.30,'Auf Bestellung, individuell',false) returning id into v_id;
    insert into public.rezeptur_zutaten (owner_user_id, rezeptur_id, position, bezeichnung, menge, einheit, preis_pro_einheit, rolle) values
    (v_user,v_id,1,'Biskuit',3,'kg',2.50,'zutat'),
    (v_user,v_id,2,'Buttercreme',2.5,'kg',4.00,'zutat'),
    (v_user,v_id,3,'Fondant',1.5,'kg',6.00,'zutat'),
    (v_user,v_id,4,'Früchte & Deko',1,'kg',8.00,'zutat');
    raise notice 'Rezeptur OK';
  exception when others then raise notice 'REZEPTUR uebersprungen: %', sqlerrm; end;

  -- ========================= KASSE =========================
  begin
    delete from public.kassen_positionen where owner_user_id=v_user;
    delete from public.kassen_belege where owner_user_id=v_user;

    insert into public.kassen_belege (owner_user_id, beleg_nr, typ, zahlart, netto_summe, mwst_summe, brutto_summe, tse_modus, storniert)
    values (v_user,'B-2026-0001','verkauf','bar',10.84,0.76,11.60,'ohne',false) returning id into v_id;
    insert into public.kassen_positionen (owner_user_id, beleg_id, position, bezeichnung, menge, einzelpreis, mwst_satz, gesamt_brutto) values
    (v_user,v_id,1,'Brötchen',10,0.45,7,4.50),
    (v_user,v_id,2,'Butter-Croissant',2,1.60,7,3.20),
    (v_user,v_id,3,'Bauernbrot 1 kg',1,3.90,7,3.90);

    insert into public.kassen_belege (owner_user_id, beleg_nr, typ, zahlart, netto_summe, mwst_summe, brutto_summe, tse_modus, storniert)
    values (v_user,'B-2026-0002','verkauf','karte',8.32,0.58,8.90,'ohne',false) returning id into v_id;
    insert into public.kassen_positionen (owner_user_id, beleg_id, position, bezeichnung, menge, einzelpreis, mwst_satz, gesamt_brutto) values
    (v_user,v_id,1,'Laugengebäck',5,1.20,7,6.00),
    (v_user,v_id,2,'Roggenmischbrot 750 g',1,2.90,7,2.90);

    insert into public.kassen_belege (owner_user_id, beleg_nr, typ, zahlart, netto_summe, mwst_summe, brutto_summe, tse_modus, storniert)
    values (v_user,'B-2026-0003','verkauf','bar',22.06,1.54,23.60,'ohne',false) returning id into v_id;
    insert into public.kassen_positionen (owner_user_id, beleg_id, position, bezeichnung, menge, einzelpreis, mwst_satz, gesamt_brutto) values
    (v_user,v_id,1,'Brötchen',40,0.45,7,18.00),
    (v_user,v_id,2,'Butter-Croissant',3,1.60,7,4.80),
    (v_user,v_id,3,'Bauernbrot 1 kg',null,null,7,null);
    raise notice 'Kasse OK';
  exception when others then raise notice 'KASSE uebersprungen: %', sqlerrm; end;

  -- ========================= LAGER =========================
  begin
    delete from public.lagerbewegungen where owner_user_id=v_user;
    insert into public.lagerbewegungen (owner_user_id, artikel_id, typ, menge, grund, referenz, bewegung_am) values
    (v_user,(select id from public.artikel where owner_user_id=v_user and bezeichnung ilike 'Weizenmehl%' limit 1),'zugang',25,'Wareneingang','ER-4471', now() - interval '5 days'),
    (v_user,(select id from public.artikel where owner_user_id=v_user and bezeichnung='Brötchen' limit 1),'abgang',200,'Verkauf Theke','Tagesabschluss', now() - interval '1 day'),
    (v_user,(select id from public.artikel where owner_user_id=v_user and bezeichnung='Bauernbrot 1 kg' limit 1),'abgang',18,'Verkauf Theke','Tagesabschluss', now() - interval '1 day');
    raise notice 'Lager OK';
  exception when others then raise notice 'LAGER uebersprungen: %', sqlerrm; end;

  -- ========================= EINKAUF / BESTELLUNGEN =========================
  begin
    delete from public.bestellpositionen where owner_user_id=v_user;
    delete from public.bestellungen where owner_user_id=v_user;

    insert into public.bestellungen (owner_user_id, bestellnummer, lieferant_id, status, bestelldatum, lieferdatum_erwartet, notizen)
    values (v_user,'BE-2026-0001',(select id from public.lieferanten where owner_user_id=v_user and name='Mühle Bauer GmbH' limit 1),'bestellt', date '2026-07-25', date '2026-07-27','Wochenbestellung Mehl') returning id into v_id;
    insert into public.bestellpositionen (owner_user_id, bestellung_id, artikel_id, bezeichnung, menge, einzelpreis, menge_geliefert, position) values
    (v_user,v_id,(select id from public.artikel where owner_user_id=v_user and bezeichnung ilike 'Weizenmehl%' limit 1),'Weizenmehl Type 550 (25 kg)',10,22.00,0,1),
    (v_user,v_id,null,'Roggenmehl Type 1150 (25 kg)',4,26.00,0,2);

    insert into public.bestellungen (owner_user_id, bestellnummer, lieferant_id, status, bestelldatum, lieferdatum_erwartet, notizen)
    values (v_user,'BE-2026-0002',(select id from public.lieferanten where owner_user_id=v_user and name='Großhandel Weber' limit 1),'geliefert', date '2026-07-20', date '2026-07-22','Zutaten & Belag') returning id into v_id;
    insert into public.bestellpositionen (owner_user_id, bestellung_id, artikel_id, bezeichnung, menge, einzelpreis, menge_geliefert, position) values
    (v_user,v_id,null,'Butter 10 kg',5,7.50,5,1),
    (v_user,v_id,null,'Belag-Sortiment',1,120.00,1,2);
    raise notice 'Einkauf OK';
  exception when others then raise notice 'EINKAUF uebersprungen: %', sqlerrm; end;

  -- ========================= ETIKETTEN / LMIV =========================
  begin
    delete from public.etikett_produkt where owner_user_id=v_user;
    insert into public.etikett_produkt (owner_user_id, bezeichnung, art, zutaten, allergene, spuren, nettomenge, aufbewahrung, verantwortlicher, energie_kj, energie_kcal, fett, gesaettigt, kohlenhydrate, zucker, eiweiss, salz, naehrwert_basis, status) values
    (v_user,'Bauernbrot 1 kg','lebensmittel','Weizenmehl, Roggenmehl, Wasser, Salz, Sauerteig, Hefe','Gluten (Weizen, Roggen)','Sesam, Nüsse','1000 g','kühl & trocken lagern','Bäckerei Sonnenschein',1000,240,1.2,0.3,47,2.1,8.5,1.2,'100 g','fertig'),
    (v_user,'Butter-Croissant','lebensmittel','Weizenmehl, Butter, Wasser, Zucker, Hefe, Salz','Gluten (Weizen), Milch','Ei','80 g','am Tag verzehren','Bäckerei Sonnenschein',1550,370,21,13,36,6,6.5,0.9,'100 g','fertig'),
    (v_user,'Hochzeitstorte 3-stöckig','lebensmittel','Biskuit, Buttercreme, Fondant, Früchte','Gluten (Weizen), Milch, Ei','Nüsse','individuell','gekühlt lagern','Bäckerei Sonnenschein',1400,335,18,11,38,28,4.5,0.4,'100 g','fertig');
    raise notice 'Etiketten OK';
  exception when others then raise notice 'ETIKETTEN uebersprungen: %', sqlerrm; end;

  -- ========================= TOUR / LIEFERUNG =========================
  begin
    delete from public.tour_stopp where owner_user_id=v_user;
    delete from public.tour where owner_user_id=v_user;
    insert into public.tour (owner_user_id, bezeichnung, datum, fahrer, fahrzeug, status, notiz)
    values (v_user,'Frühlieferung Montag', date '2026-08-03','Ali Yılmaz','VW Caddy (BB-SO 123)','geplant','Hotels, Cafés & Kitas') returning id into v_id;
    insert into public.tour_stopp (owner_user_id, tour_id, reihenfolge, empfaenger, empfaenger_name, adresse, kolli, status) values
    (v_user,v_id,1,'Hotel Bergblick','Petra Lang','Gipfelstraße 1, 87561 Oberstdorf',3,'offen'),
    (v_user,v_id,2,'Café Central','Markus Frey','Marktplatz 5, 71032 Böblingen',2,'offen'),
    (v_user,v_id,3,'Kindergarten Sonnenblume','Julia Braun','Blumenweg 4, 71034 Böblingen',1,'offen');
    raise notice 'Tour OK';
  exception when others then raise notice 'TOUR uebersprungen: %', sqlerrm; end;

  -- ========================= CHARGEN / RÜCKVERFOLGUNG =========================
  begin
    delete from public.charge_verwendung where owner_user_id=v_user;
    delete from public.charge_los where owner_user_id=v_user;
    insert into public.charge_los (owner_user_id, charge_nr, typ, bezeichnung, menge, einheit, herstell_datum, mhd, herkunft, status)
    values (v_user,'CH-2026-0715','rohstoff','Weizenmehl Type 550',250,'kg', date '2026-07-15', date '2026-12-31','Mühle Bauer GmbH','frei') returning id into v_id;
    insert into public.charge_verwendung (owner_user_id, los_id, richtung, referenz, menge, datum, notiz) values
    (v_user,v_id,'ausgang','Bauernbrot Backtag 03.08.',18,date '2026-08-03','Teigansatz Frühschicht'),
    (v_user,v_id,'ausgang','Sonntagsbrötchen 04.08.',6,date '2026-08-04','Abo-Lieferung');
    raise notice 'Chargen OK';
  exception when others then raise notice 'CHARGEN uebersprungen: %', sqlerrm; end;

  -- ========================= HACCP / HYGIENE =========================
  begin
    delete from public.lm_haccp where owner_user_id=v_user;
    delete from public.lm_haccp_plan where owner_user_id=v_user;
    delete from public.lm_chargen where owner_user_id=v_user;

    insert into public.lm_haccp_plan (owner_user_id, kontrollpunkt, sollwert, intervall_tage, letzte_kontrolle, aktiv)
    values (v_user,'Kühlhaus-Temperatur','2–7 °C',1,date '2026-08-01',true) returning id into v_id;
    insert into public.lm_haccp (owner_user_id, datum, kontrollpunkt, messwert, in_ordnung, pruefer, plan_id) values
    (v_user,date '2026-08-01','Kühlhaus-Temperatur','4 °C',true,'Max Mustermann',v_id),
    (v_user,date '2026-07-31','Kühlhaus-Temperatur','5 °C',true,'Max Mustermann',v_id);
    insert into public.lm_haccp_plan (owner_user_id, kontrollpunkt, sollwert, intervall_tage, letzte_kontrolle, aktiv)
    values (v_user,'Handhygiene Backstube','Sichtprüfung',7,date '2026-07-28',true);

    insert into public.lm_chargen (owner_user_id, bezeichnung, charge_nr, mhd, menge, einheit, lieferant, status, herkunft) values
    (v_user,'Weizenmehl Type 550','CH-2026-0715', date '2026-12-31',250,'kg','Mühle Bauer GmbH','aktiv','Wareneingang'),
    (v_user,'Butter','CH-2026-0720', date '2026-09-30',50,'kg','Großhandel Weber','aktiv','Wareneingang');
    raise notice 'HACCP OK';
  exception when others then raise notice 'HACCP uebersprungen: %', sqlerrm; end;

  -- ========================= TERMINE =========================
  begin
    delete from public.termine where owner_user_id=v_user;
    delete from public.termin_arten where owner_user_id=v_user;
    insert into public.termin_arten (owner_user_id, name, modus, dauer_minuten, puffer_minuten, aktiv, ist_vorlage, sortierung, farbe) values
    (v_user,'Catering-Termin','termin',240,0,true,false,1,'#C9A84C'),
    (v_user,'Tortenabholung','termin',30,0,true,false,2,'#4CAF7D');

    insert into public.termine (owner_user_id, kontakt_id, titel, beschreibung, ort, beginn_am, ende_am, status, kunde_name, quelle) values
    (v_user,(select id from public.kontakte where owner_user_id=v_user and firma='Stadtwerke Böblingen' limit 1),'Catering Firmenjubiläum Stadtwerke','40 Personen, Aufbau vor Ort','Wolfgang-Brumme-Allee 1, Böblingen', timestamptz '2026-08-15 08:00+02', timestamptz '2026-08-15 12:00+02','bestaetigt','Stadtwerke Böblingen','manuell'),
    (v_user,(select id from public.kontakte where owner_user_id=v_user and firma='Privat' limit 1),'Tortenabholung Familie Müller','Hochzeitstorte 3-stöckig','Filiale', timestamptz '2026-08-05 10:00+02', timestamptz '2026-08-05 10:30+02','geplant','Familie Müller','manuell');
    raise notice 'Termine OK';
  exception when others then raise notice 'TERMINE uebersprungen: %', sqlerrm; end;

  -- ========================= GUTSCHEINE =========================
  begin
    delete from public.gutschein_einloesung where owner_user_id=v_user;
    delete from public.gutschein where owner_user_id=v_user;
    insert into public.gutschein (owner_user_id, code, art, mwst_typ, wert, mwst_satz, ausgestellt_am, gueltig_bis, status, empfaenger_name, anlass)
    values (v_user,'GS-2026-001','wert','einzweck',25,7, date '2026-07-01', date '2027-07-01','aktiv','Familie Schmidt','Geburtstag') returning id into v_id;
    insert into public.gutschein_einloesung (owner_user_id, gutschein_id, datum, betrag, nutzungen, bemerkung)
    values (v_user,v_id, now() - interval '3 days',10,1,'Teil-Einlösung an der Theke');
    insert into public.gutschein (owner_user_id, code, art, mwst_typ, wert, mwst_satz, ausgestellt_am, gueltig_bis, status, empfaenger_name, anlass)
    values (v_user,'GS-2026-002','wert','einzweck',50,7, date '2026-07-20', date '2027-07-20','aktiv','Team Stadtwerke','Dankeschön');
    raise notice 'Gutscheine OK';
  exception when others then raise notice 'GUTSCHEINE uebersprungen: %', sqlerrm; end;

  -- ========================= BEWERTUNGEN =========================
  begin
    delete from public.bewertungsanfragen where owner_user_id=v_user;
    insert into public.bewertungsanfragen (owner_user_id, kunde_name, kunde_email, token, status, sterne, text, veroeffentlicht, quelle, abgegeben_am) values
    (v_user,'Sabine Krüger','einkauf@stadtwerke-bb.de','tok-sw-001','abgegeben',5,'Das Catering zum Firmenjubiläum war ein voller Erfolg — pünktlich, lecker, top organisiert!',true,'google', now() - interval '10 days'),
    (v_user,'Markus Frey','kontakt@cafe-central.de','tok-cc-002','abgegeben',5,'Zuverlässige Belieferung, immer frische Ware. Sehr zu empfehlen.',true,'google', now() - interval '4 days'),
    (v_user,'Petra Lang','einkauf@hotel-bergblick.de','tok-hb-003','offen',null,null,false,'email',null);
    raise notice 'Bewertungen OK';
  exception when others then raise notice 'BEWERTUNGEN uebersprungen: %', sqlerrm; end;

  -- ========================= RESERVIERUNG =========================
  begin
    delete from public.reservierung_vorgang where owner_user_id=v_user;
    delete from public.reservierung_platz where owner_user_id=v_user;
    insert into public.reservierung_platz (owner_user_id, art, bezeichnung, standort, kapazitaet, status)
    values (v_user,'tisch','Cafétisch 1','Ladencafé',4,'frei');
    insert into public.reservierung_platz (owner_user_id, art, bezeichnung, standort, kapazitaet, status)
    values (v_user,'tisch','Cafétisch 2','Ladencafé',6,'frei') returning id into v_id;
    insert into public.reservierung_vorgang (owner_user_id, art, platz_id, kunde_name, kunde_tel, von, bis, anzahl, betrag, mwst_satz, status, notiz)
    values (v_user,'tischreservierung',v_id,'Familie Weber','0170 5566778', timestamptz '2026-08-10 15:00+02', timestamptz '2026-08-10 17:00+02',6,0,7,'reserviert','Kaffee & Kuchen, Kindergeburtstag');
    raise notice 'Reservierung OK';
  exception when others then raise notice 'RESERVIERUNG uebersprungen: %', sqlerrm; end;

  raise notice 'FERTIG — Bäckerei-Module verarbeitet.';
end $$;
