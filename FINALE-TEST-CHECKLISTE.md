# ARGONAUT OS — Finale-Test-Checkliste

> Lebendes Dokument. Vor dem Go-Live jedes Modul + jeden Eintrag einmal
> durchklicken: Landet alles dort, wo es hingehört? Kommt/geht nichts verloren?
> Stand angelegt: 18.07.2026

## Bündel 1 · Monteur-/Außendienst-App (offene Punkte fürs Finale)

- [ ] **Tour mit echter Adresse**: Chef-Einsatz mit gültigem „Einsatzort" anlegen
      → „🗺 Meine Tour" öffnet die Google-Maps-Route (mehrere Stopps).
- [ ] **GPS am echten Handy draußen** testen (nicht nur Desktop) — Stempel 📍 bei
      Losfahren / Vor Ort / Erledigt.
- [ ] **Offline**: Handy in den Flugmodus → Einsatzliste bleibt sichtbar
      („📴 Offline"-Hinweis), Seite öffnet trotzdem.
- [ ] **GPS-Standort im Einsatzbericht-PDF** (optional) — als „📍 in Karte öffnen"
      ergänzen, falls gewünscht.
- [ ] **Leistungskatalog-Preise**: im Test standen Positionen auf 0,00 €
      (Katalog-Einträge ohne Preis) — vor Finale echte Preise pflegen.
- [ ] **ORS-Schlüssel** je Betrieb eingetragen (Einstellungen → Anfahrt) → Tour in
      optimierter Reihenfolge + exakte Strecken.

## Bündel 2 · Wartung & Prüfung (offene Punkte fürs Finale)

- [ ] **Prüfprotokoll erfassen**: „✓ Wartung + Protokoll" → Vorlage wählen,
      Punkte abhaken, Ergebnis + Bemerkung → speichern → Fälligkeit rollt weiter.
- [ ] **Historie**: „Historie"-Knopf zeigt alle bisherigen Protokolle je Vertrag.
- [ ] **Automatische Erinnerung**: Cron in n8n einrichten (POST auf
      `/api/wartung-erinnerung`, Header `x-cron-secret`, 1× täglich) → Mail an den
      Betrieb, wenn eine Wartung fällig ist.
- [ ] **Prüfprotokoll-PDF** (noch nicht gebaut) — druckbares DGUV/E-Check-Protokoll,
      falls gewünscht.

## Bündel 3 · GAEB (Aufmaß / LV-Austausch) — offene Punkte fürs Finale

- [ ] **GAEB-Export**: ein Aufmaß mit Positionen öffnen → „⭱ GAEB exportieren" →
      .x84-Datei wird geladen.
- [ ] **GAEB-Rundlauf**: die eben exportierte Datei über „⭳ GAEB importieren"
      wieder einlesen → es entsteht ein Aufmaß mit denselben Positionen.
- [ ] **Echte GAEB-Datei gegenprüfen**: sobald eine echte Ausschreibung (.x83/.x84
      eines Architekten/GU) vorliegt, importieren und Feld-Zuordnung
      (OZ, Kurztext, Menge, Einheit, EP) kontrollieren — GAEB-Varianten prüfen.

## Bündel 4 · Baustellen-Doku (Bautagebuch + Mängel) — offene Punkte fürs Finale

- [ ] **Bautagebuch**: „📒 Bautagebuch" → Projekt wählen → „+ Neuer Eintrag"
      (Wetter, Mannschaft, Arbeiten …) → Foto hochladen → erscheint als Vorschau.
- [ ] **Fotos**: Upload lädt in den neuen Bucket `baustellen-fotos`; Vorschau &
      Löschen funktionieren (Owner-Ordner-Storage-Policy einmal live prüfen).
- [ ] **Mängel**: Mangel anlegen → Status offen → in Arbeit → behoben → abgenommen
      durchschalten; offene Mängel im Tab-Zähler.
- [ ] **Noch offen (Bündel 4b)**: Nachtragsmanagement + Abschlags-/Kumulativ­abrechnung
      (docken an Rechnungen/LV an) + Bautagebuch-/Abnahme-PDF.

## Bündel 5 · E-Rechnung senden — offene Punkte fürs Finale

- [ ] **E-Rechnung per Mail**: Rechnung öffnen → „E-Rechnung (XML)" → Format wählen
      → Empfänger-E-Mail eintragen → „📧 Per E-Mail senden" → Kunde erhält die Mail
      mit XRechnung-/ZUGFeRD-Anhang. Einmal an eigene Adresse testen.
- [ ] **Noch offen (Bündel 5b)**: echter **DATEV-Buchungsstapel** (EXTF-Format mit
      Kontenrahmen SKR03/04, Soll/Haben, BU-Schlüssel) — vorher Konten mit dem
      Steuerberater klären, damit die Buchungen stimmen. ELSTER/USt-Voranmeldung
      (braucht Zertifikat) ebenfalls hier.

## Bündel 6 · Online-Terminbuchung — offene Punkte fürs Finale

- [ ] **Voraussetzung**: in **Termine** Öffnungszeiten hinterlegen + mindestens
      eine **Terminart** aktiv.
- [ ] **Einrichten**: Menü **🌐 Online-Buchung** → Kürzel (Slug) setzen → auf
      „online" schalten → Speichern → Link kopieren.
- [ ] **Kundensicht**: den Link `…/buchen/<slug>` in einem **privaten Fenster
      (ohne Login)** öffnen → freie Slots erscheinen → Slot wählen → Name + E-Mail
      → „Verbindlich buchen" → Bestätigung + E-Mail.
- [ ] **Rückkontrolle**: im Dashboard unter **Termine** taucht der gebuchte Termin
      auf (Quelle „online"). No-Show-/Erinnerungsmail deckt der bestehende
      `termin-erinnerung`-Cron ab.
- [ ] **Sicherheit** (einmal bewusst prüfen): fremder/falscher Slug zeigt nichts;
      offline geschaltete Seite ist nicht buchbar; ein bereits vergebener Slot
      lässt sich nicht doppelt buchen.

## Bündel 7 · Bewertungsmanagement — offene Punkte fürs Finale

- [ ] **Einladen**: Menü **⭐ Bewertungen** → Name + eigene E-Mail → „✉️ Einladung
      senden" → E-Mail mit Bewertungs-Link kommt an.
- [ ] **Abgeben**: Link in einem **privaten Fenster** öffnen → Sterne + Text →
      „Bewertung abgeben".
- [ ] **Rückkontrolle**: die Bewertung erscheint im Dashboard unter „Abgegebene
      Bewertungen"; Ø-Sterne stimmen; „Veröffentlichen" schaltet um; ein bereits
      abgegebener Link lässt sich **nicht** zweimal bewerten.
- [ ] **Optional (später)**: veröffentlichte Bewertungen auf der Website anzeigen
      (Widget/Sektion).

## Bündel 8 · Mitglieder & Abos (SEPA) — offene Punkte fürs Finale

- [ ] **Gläubigerdaten**: Menü **👥 Mitglieder & Abos** → Gläubiger-ID, Kontoinhaber,
      IBAN (+ BIC) speichern.
- [ ] **Mitglied anlegen**: Name, Beitrag, Intervall + **SEPA-Mandat** (IBAN,
      Mandatsreferenz, Mandatsdatum). „✓ Mandat" erscheint in der Liste.
- [ ] **SEPA-Datei**: Fälligkeitstag wählen → „⭱ SEPA-Datei erzeugen" → eine
      **.xml (pain.008.001.02)** wird geladen. Testweise ins Bankprogramm/Prüftool
      einlesen und die Beträge/IBANs kontrollieren.
- [ ] **Wichtig (rechtlich/Bank)**: gültige **Gläubiger-ID** (Bundesbank),
      unterschriebene **Mandate** vor dem ersten Einzug. Manche Banken verlangen
      bei der ersten Einreichung eines Mandats Sequenz **FRST** statt **RCUR** —
      bei Bedarf ergänzen wir das je Posten.

## Bündel 9 · Lager-Scanner (WMS) — offene Punkte fürs Finale

- [ ] **EAN hinterlegen**: bei ein paar Artikeln im Sortiment die **EAN** eintragen
      (neues Feld) — sonst findet der Scanner sie nur über die Artikelnummer.
- [ ] **Buchen**: Menü **📷 Lager-Scanner** → Modus wählen (Eingang/Ausgang/Inventur)
      → Code ins Feld tippen/scannen + Enter → Artikel erscheint → Menge → buchen.
- [ ] **Rückkontrolle**: im ERP/Sortiment stimmt der neue **Bestand**; in den
      Lagerbewegungen steht der Vorgang als Nachweis.
- [ ] **Hardware-Scanner**: ein USB-/Bluetooth-Handscanner tippt den Code ins Feld
      (wie Tastatur) — das ist der Profi-Weg. Kamera-Scan ist der Handy-Bonus
      (Android-Chrome; auf iPhone ggf. nur Eingabefeld).

## Bündel 10 · Projekt-Abrechnung — offene Punkte fürs Finale

- [ ] **Zeit/Leistung erfassen**: Menü **💼 Projekt-Abrechnung** → Projekt wählen →
      Datum, Kunde, Beschreibung, Stunden, Stundensatz → „Erfassen". Der Eintrag
      erscheint unter „Offene Leistungen"; Stundensatz + Kunde werden gemerkt.
- [ ] **Rechnung erstellen**: „🧾 Rechnung erstellen" → aus allen offenen Leistungen
      des Projekts entsteht **eine echte Rechnung** (Menü **🧾 Rechnungen**). MwSt
      wird je Steuersatz auf die Gruppensumme gerechnet.
- [ ] **Rückkontrolle**: die abgerechneten Leistungen wandern in die Tabelle
      „Abgerechnet" (mit Rechnungsbezug) und tauchen bei „Offene Leistungen" nicht
      mehr auf — kein Posten kann versehentlich zweimal fakturiert werden.
- [ ] **Löschen**: eine noch **offene** (nicht abgerechnete) Leistung lässt sich
      wieder entfernen; abgerechnete bleiben als Nachweis stehen.

## Bündel 11 · Kunden-Portal (Self-Service) — offene Punkte fürs Finale

- [ ] **Link erstellen**: Menü **👤 Kunden-Portal** → einen Kunden suchen →
      „🔗 Link erstellen" → der Portal-Link erscheint unter dem Namen.
- [ ] **Kundensicht prüfen**: Link „📋 Kopieren" und in einem **privaten Fenster**
      öffnen → der Kunde sieht **nur seine eigenen** Rechnungen (ohne stornierte)
      und seine kommenden Termine. Kein Login nötig.
- [ ] **Termine-Match**: ein Termin erscheint nur, wenn beim Termin dieselbe
      **E-Mail** wie beim Kontakt hinterlegt ist (termine hat kein kontakt_id).
      Zum Test einen Termin mit der Kunden-E-Mail anlegen.
- [ ] **Deaktivieren**: „⏸ Deaktivieren" → der Link zeigt sofort „ungültig oder
      deaktiviert" und **keine** Daten mehr. „▶ Aktivieren" macht ihn wieder gültig.
- [ ] **Fremddaten-Gegenprobe**: Der Link eines Kunden A zeigt **niemals** Daten
      von Kunde B oder eines anderen Betriebs (fail-closed über den Token).

### Bündel 11+ · Erweiterung: PDF-Download & Kalender

- [ ] **Rechnung als PDF**: im Kundenportal bei einer Rechnung auf **„⬇ PDF"** →
      es öffnet sich ein echtes PDF (über Gotenberg) zum Speichern/Drucken.
      Kopf zeigt Firma/Absender, Positionen, Netto/MwSt/Brutto korrekt.
- [ ] **Fremd-Gegenprobe PDF**: eine Rechnungs-ID eines anderen Kunden lässt sich
      über den Link **nicht** laden (fail-closed über Token + kontakt_id).
- [ ] **Termin in Kalender**: bei einem Termin auf **„📅 Zum Kalender"** → eine
      **.ics**-Datei wird geladen; ein Doppelklick legt den Termin in Apple/Outlook
      an. **„Google"** öffnet den Termin direkt im Google Kalender.
- [ ] **Gotenberg-Check**: läuft der PDF-Dienst nicht, zeigt der „⬇ PDF"-Link
      als Fallback die druckbare HTML-Rechnung (Browser → „Als PDF speichern").

## Bündel 12 · Fördermittel-Assistent — offene Punkte fürs Finale

- [ ] **Matching**: Menü **💰 Fördermittel** → Kategorien wählen (z. B. „Digitalisierung",
      „Beratung"), Phase + optional Förderart → die Trefferliste passt sich an.
- [ ] **Verfolgen**: bei einem Programm „＋ Verfolgen" → es erscheint unter
      „📌 Meine Vorhaben"; das Programm zeigt dort „✓ auf Merkliste".
- [ ] **Frist & Status**: im Vorhaben Status setzen (interessiert → beantragt …),
      eine Frist wählen → die **Fristen-Ampel** (grün/gelb/rot) reagiert; Notiz
      wird beim Verlassen des Feldes gespeichert.
- [ ] **Aktualität**: Katalog enthält nur aktive Programme (Stand Juli 2026);
      ausgelaufene wie „go-digital"/„Digital Jetzt" sind bewusst NICHT drin.
      Landesprogramme verweisen auf die Förderdatenbank (je Bundesland verschieden).
- [ ] **Entfernen**: „🗑 Entfernen" nimmt ein Vorhaben wieder von der Merkliste.

## Bündel 13 · Förder-Angebot-Generator — offene Punkte fürs Finale

- [ ] **Angebot bauen**: Menü **📝 Förder-Angebot** → Kunde eingeben → ein
      fertiges Paket laden (Starter/Betrieb/Komplett) oder Positionen selbst
      erfassen → Förderquote wählen → die **Live-Schätzung** (Netto/Zuschuss/
      Eigenanteil) reagiert sofort → „💾 Angebot speichern".
- [ ] **PDF prüfen**: bei einem gespeicherten Angebot „⬇ PDF" → das PDF (über
      Gotenberg) zeigt Positionen, USt-Hinweis, **Förder-Schätzung**,
      **Leistungsbeschreibung** und den **Reihenfolge-Hinweis** (Antrag vor Kauf).
- [ ] **Fallback**: läuft Gotenberg nicht, kommt die druckbare HTML-Version
      (Browser → „Als PDF speichern").
- [ ] **Löschen**: „🗑" entfernt ein gespeichertes Angebot wieder.

## Bündel 14 · Angebote mit Online-Zusage — offene Punkte fürs Finale

- [ ] **Angebot erstellen**: Menü **🧾 Angebote** → Kunde, Titel, Gültig-bis →
      Positionen (Menge, Einheit, Einzelpreis, MwSt) → die **Live-Summe** stimmt →
      „💾 Angebot erstellen".
- [ ] **PDF prüfen**: „⬇ PDF" erzeugt ein sauberes Angebots-PDF (über Gotenberg).
- [ ] **Online-Zusage**: „🔗 Link" kopieren, in einem **privaten Fenster** öffnen →
      der Kunde sieht Positionen + Summen → „✅ Angebot annehmen".
- [ ] **Rückkontrolle**: im Dashboard springt der Status auf **angenommen**;
      ein bereits entschiedenes Angebot lässt sich **nicht** erneut annehmen;
      ein abgelaufenes (Gültig-bis in der Vergangenheit) kann nicht angenommen werden.
- [ ] **→ Rechnung**: bei einem angenommenen Angebot „→ Rechnung" → es entsteht
      eine echte Rechnung unter **🧾 Rechnungen** (kein Doppel bei erneutem Klick).

## Bündel 15 · Schnittstellen-Basis (Konnektoren) — offene Punkte fürs Finale

- [ ] **Sichtbarkeit**: Menü **🔌 Schnittstellen** erscheint nur beim Chef
      (nicht bei Mitarbeitern).
- [ ] **Demo-Modus**: ohne Eintrag zeigt jeder Bereich „○ Demo-Modus".
- [ ] **Anbieter wählen**: bei „Kasse / TSE" bzw. „Shop / Marktplatz" einen
      echten Anbieter wählen → die passenden Felder erscheinen → speichern.
- [ ] **Live-Schalten**: bei echtem Anbieter „aktiv schalten" nur möglich, wenn
      alle Pflichtfelder ausgefüllt sind → Badge wechselt auf „● Live".
- [ ] **Sicherheit**: ein Mitarbeiter kann die Schnittstellen-Seite weder sehen
      noch die Zugangsdaten auslesen (RLS nur Inhaber).

## Bündel 16 · Kasse mit TSE — offene Punkte fürs Finale

- [ ] **Verkauf**: Menü **🧾 Kasse** → Artikel antippen (aus dem ERP) → Warenkorb
      → Zahlart „Bar" + gegebenen Betrag → Rückgeld wird berechnet → „Kassieren".
- [ ] **Bon**: „🖨 Bon anzeigen / drucken" → 80-mm-Bon als PDF mit MwSt-Ausweis
      und TSE-Signatur (im Demo-Modus klar als „DEMO – keine gültige TSE" markiert).
- [ ] **Bestand**: der verkaufte Artikel hat im ERP weniger Bestand; in den
      Lagerbewegungen steht ein „ausgang" mit der Beleg-Nummer.
- [ ] **Tagesabschluss / Export**: Zeitraum wählen → „⬇ Export" lädt eine CSV
      (DSFinV-K-naher Aufbau) mit allen Belegen/Positionen und TSE-Angaben.
- [ ] **Live-TSE**: unter **🔌 Schnittstellen** einen echten Anbieter (fiskaly
      etc.) hinterlegen → Bon zeigt dann den Anbieter statt „DEMO". (Die echte
      Signatur-Anbindung wird beim Anbieter freigeschaltet.)
- [ ] **Kassierer**: ein Mitarbeiter mit Kassen-Recht kann verkaufen; die
      Zugangsdaten der Schnittstellen sieht er dabei NICHT.

## Bündel 17 · Shop-/Marktplatz-Anbindung — offene Punkte fürs Finale

- [ ] **CSV-Import**: Menü **🛒 Shop / Marktplatz** → Zeilen einfügen
      (`extern_id;besteller;email;bezeichnung;menge;einzelpreis`) → „⬆ Importieren"
      → Bestellungen erscheinen; gleiche extern_id = eine Bestellung.
- [ ] **Doppel-Schutz**: dieselbe CSV erneut importieren → die Bestellungen
      werden übersprungen (unique je Quelle + extern_id).
- [ ] **Status-Board**: Status je Bestellung ändern (neu → in Bearbeitung →
      versendet) → die Zähler oben aktualisieren sich.
- [ ] **Live-Anbieter**: unter **🔌 Schnittstellen** Shopware/Shopify/Woo
      hinterlegen → Badge wechselt von „Manuell-Modus" auf „Live". (Der
      automatische API-Abgleich wird beim Anbieter freigeschaltet.)

## Bündel 18 · KFZ-Fachpaket — offene Punkte fürs Finale

- [ ] **Fahrzeug + HU/AU-Ampel**: Menü **🚗 KFZ-Fachpaket** → Reiter „Fahrzeuge"
      → Kennzeichen, Marke, HU-/AU-Datum → speichern. Die **Ampel** zeigt grün
      (fern), gelb (≤ 60 Tage) oder rot (überfällig); der Zähler im Reiter zeigt
      die fälligen/überfälligen Fahrzeuge.
- [ ] **Reifenhotel**: Reiter „Reifenhotel" → Kunde/Kennzeichen, Saison, Größe,
      Anzahl, Lagerplatz → „Einlagern" → erscheint in der Liste; „⇧ Auslagern"
      setzt das Auslagerdatum und nimmt es aus der aktiven Liste.

## Bündel 19 · Bau & Handwerk komplett — offene Punkte fürs Finale

- [ ] **LV & Positionen**: Menü **🏗 Bau & LV** → Reiter „LV / Kalkulation" → LV
      anlegen → Positionen mit OZ, Kurztext, Menge, Einheit, EP erfassen → die
      Netto-Summe stimmt. Eine Position als **Nachtrag** markieren (mit Grund).
- [ ] **Rechnung aus LV**: „🧾 Aus LV eine Rechnung erstellen" → Rechnung unter
      **🧾 Rechnungen**; erneuter Klick erzeugt keine zweite (Doppel-Schutz).
- [ ] **Abnahme**: Reiter „Abnahme" → Protokoll mit Ort, Teilnehmer, Art
      (ohne/unter Vorbehalt/verweigert) und **Mängelliste** (mit Frist) speichern.
- [ ] **Scope-Hinweis (Ausbaustufe)**: GAEB-XML-Import/-Export und VOB-Aufmaß-
      Verknüpfung sind als spätere Ausbaustufe vorgesehen; der LV-Kern
      (Kalkulation, Nachträge, Abnahme, Rechnung) ist vollständig.

## Bündel 20 · E-Rechnung & DATEV-Brücke — offene Punkte fürs Finale

- [ ] **Kein neues SQL** nötig (nutzt vorhandene `rechnungen` + `betrieb_integrationen`).
- [ ] **DATEV-Export**: Menü **📊 DATEV & E-Rechnung** → Zeitraum wählen →
      „⬇ DATEV-Buchungsstapel (CSV)" → CSV mit Umsatz, Konto/Gegenkonto,
      BU-Schlüssel je Steuersatz, Belegfeld1 = Rechnungsnummer.
- [ ] **Konten hinterlegen**: unter **🔌 Schnittstellen → DATEV** Erlös-/Debitor-
      konten + Berater-/Mandantennummer eintragen → Export nutzt diese Werte.
- [ ] **USt-Vorschau**: die Kacheln zeigen Netto-Umsatz, Umsatzsteuer (Zahllast)
      und Brutto für den Zeitraum (klar als Vorschau gekennzeichnet).
- [ ] **Scope-Hinweis (Brücke)**: Die automatische DATEVconnect-/ELSTER-
      Übermittlung braucht ein Zertifikat und wird über die Schnittstelle
      freigeschaltet; Versand von XRechnung/ZUGFeRD läuft weiter im Rechnungsmodul.

## Bündel 21 · Gastro & Hotel — offene Punkte fürs Finale

- [ ] **Reservierung**: Reiter „Reservierungen" → Datum, Zeit, Personen, Gast, Tisch
      → „Reservieren" → erscheint in der Tagesliste; Status (eingetroffen/No-Show) änderbar.
- [ ] **Hotel**: Reiter „Hotel" → Zimmer anlegen (Nr., Typ, max. Pers., €/Nacht) →
      Belegung buchen (Zimmer, Gast, An-/Abreise). **Überschneidung** wird geblockt.
- [ ] **Check-in/out**: Belegungsstatus auf eingecheckt/ausgecheckt setzen.
- [ ] **Scope-Hinweis (Ausbaustufe/Brücke)**: Rezepturkalkulation, HACCP, Lieferdienst
      und OTA-/Kanal-Anbindung (Booking/HRS) sind spätere Ausbaustufen bzw. Brücken.

## Bündel 22 · Fertigung & PPS — offene Punkte fürs Finale

- [ ] **Stückliste**: Reiter „Stücklisten" → anlegen → Komponenten mit Menge/Einheit
      hinzufügen; links auswählen zeigt die Komponenten.
- [ ] **Fertigungsauftrag**: Reiter „Fertigungsaufträge" → Produkt, optional
      Stückliste, Menge, Start → „Auftrag" → Status wechseln (geplant → in Arbeit
      → fertig; „fertig" setzt das Fertig-Datum).
- [ ] **Scope-Hinweis (Ausbaustufe)**: BDE/MDE-Rückmeldungen, QS-Prüfpläne und
      automatische Materialentnahme aus dem ERP sind spätere Ausbaustufen.

## Bündel 23 · Energie-Fachpaket — offene Punkte fürs Finale

- [ ] **Anlage**: Menü **⚡ Energie** → Bezeichnung, Typ (PV/Wärmepumpe/BHKW),
      Standort, kW, Inbetriebnahme, Wartung fällig → „Anlage". Wartungs-Ampel
      (grün/gelb/rot) je nach Fälligkeit.
- [ ] **Ablesungen**: Anlage links wählen → Datum, Zählerstand, Ertrag (kWh)
      erfassen → Summe der Erträge oben rechts.
- [ ] **Scope-Hinweis (Ausbaustufe)**: PV-Planung/Heizlast, MaStR-Meldung und
      ESG-Reporting sind spätere Ausbaustufen bzw. Brücken.

## Bündel 24 · Immobilienverwaltung — offene Punkte fürs Finale

- [ ] **Einheit**: Reiter „Einheiten" → Objekt/Adresse, Einheit, m², Zi., Kalt+NK
      → „Einheit". Status startet „frei".
- [ ] **Mietvertrag**: Reiter „Verträge & Miete" → Einheit wählen (Miete wird
      vorbefüllt), Mieter, Beginn → „Vertrag". Die Einheit springt auf „vermietet".
- [ ] **Mieteingang**: bei einem Vertrag „＋ Miete erfassen" → Zahlung für den
      aktuellen Monat; die Kacheln Soll/Ist/Offen aktualisieren sich; ein zweites
      Erfassen im selben Monat ist geblockt („Monat bezahlt").
- [ ] **Scope-Hinweis (Ausbaustufe)**: Nebenkostenabrechnung, WEG-Verwaltung und
      Portal-Anbindung (ImmoScout) sind spätere Ausbaustufen/Brücken.

## Bündel 25 · IT & MSP — offene Punkte fürs Finale

- [ ] **Vertrag**: Reiter „Verträge" → Kunde, Leistung, €/Monat, Intervall, nächste
      Wartung → „Vertrag". Oben erscheint der **MRR** (Summe der Monatspauschalen).
      Wartungs-Ampel je Fälligkeit; „✓ Wartung erledigt" setzt den nächsten Termin
      automatisch (heute + Intervall).
- [ ] **Assets**: Reiter „Assets" → Kunde, Bezeichnung, Typ, Hersteller, Seriennr.,
      Garantie → „Asset".
- [ ] **Scope-Hinweis (Ausbaustufe/Brücke)**: Helpdesk mit SLA, RMM/Monitoring und
      CMDB-Automatik sind spätere Ausbaustufen bzw. Konnektor-Brücken.

## Bündel 26 · Agentur & Kreativ — offene Punkte fürs Finale

- [ ] **Retainer**: Menü **🎨 Agentur & Kreativ** → Kunde, Std/Monat, €/Std → „Retainer".
      In der Liste erscheint ein Auslastungs-Balken (grün <80 %, gelb ≥80 %, rot ≥100 %).
- [ ] **Zeit buchen**: Retainer wählen → Datum, Stunden, Tätigkeit → „Buchen" →
      verbrauchte Stunden + Wert (Std × Satz) aktualisieren sich.
- [ ] **Scope-Hinweis (Ausbaustufe)**: Media-Asset-Management, Freigabe-Workflows
      und Redaktionsplan sind spätere Ausbaustufen.

## Bündel 27 · Gesundheit & Wellness — offene Punkte fürs Finale

- [ ] **Kunde**: Name, Telefon, E-Mail, Geburtstag, Hinweise → „Kunde".
- [ ] **Behandlung**: Kunde links wählen → Datum, Behandlung, Dauer, Preis → „＋".
      Hinweise (z. B. Allergien) werden oben deutlich angezeigt.
- [ ] **Rechtlich**: Klar gekennzeichnet als reines Verwaltungswerkzeug — keine
      Medizinberatung. GKV-Abrechnung (§302)/eKV wären Brücken (Ausbaustufe).

## Bündel 28 · Kanzlei & Steuer — offene Punkte fürs Finale

- [ ] **Mandat**: Reiter „Mandate" → Mandant, Art, Aktenzeichen → „Mandat".
- [ ] **Frist**: Reiter „Fristen" → optional Mandat, Bezeichnung, Frist → „Frist".
      Ampel (rot überfällig, gelb ≤7 Tage, grün fern); der Reiter zeigt die Zahl
      kritischer offener Fristen. Haken setzt „erledigt".
- [ ] **Rechtlich**: Klar als Verwaltungswerkzeug gekennzeichnet — keine Steuer-/
      Rechtsberatung. beA/beSt und RVG-Abrechnung wären Brücken (Ausbaustufe).

## Bündel 29 · Bildung & Kurse — offene Punkte fürs Finale

- [ ] **Kurs**: Titel, Start, Ort, Plätze, Preis → „Kurs". Liste zeigt Belegung (x/y).
- [ ] **Anmeldung**: Kurs wählen → Name, E-Mail → „Anmelden". Bei vollem Kurs wird
      geblockt („ausgebucht"). Status je Teilnehmer (angemeldet → bestätigt →
      teilgenommen/storniert). Umsatz = belegte Plätze × Preis.
- [ ] **Scope-Hinweis (Ausbaustufe/Brücke)**: Zertifikate, AZAV-Nachweise und
      Fahrschul-Meldungen sind spätere Ausbaustufen.

## Bündel 30 · Lebensmittel-Fachpaket — offene Punkte fürs Finale

- [ ] **Charge/MHD**: Reiter „Chargen/MHD" → Produkt, Charge-Nr., MHD, Menge,
      Lieferant → „Charge". MHD-Ampel (rot abgelaufen, gelb ≤3 Tage, grün fern).
- [ ] **HACCP**: Reiter „HACCP" → Datum, Kontrollpunkt, Messwert, i.O.-Haken,
      Prüfer → „Kontrolle". Bei nicht i.O. Feld für Korrekturmaßnahme.
- [ ] **Rechtlich**: Klar als Dokumentationswerkzeug gekennzeichnet — ersetzt
      keine amtliche HACCP-Beratung. Waagen-Anbindung wäre eine Konnektor-Brücke.

## Bündel 31 · Landwirtschaft & Forst — offene Punkte fürs Finale

- [ ] **Schlag**: Name, ha, Kultur, Standort → „Schlag". Oben Summe der Hektar.
- [ ] **Maßnahme**: Schlag wählen → Datum, Art (Aussaat/Düngung/Pflanzenschutz/
      Ernte), Mittel, Menge/Einheit → „＋". Historie chronologisch.
- [ ] **Scope-Hinweis (Ausbaustufe/Brücke)**: GAP-Antrag, amtliche Pflanzenschutz-
      Meldung und Baumkataster/GIS sind spätere Ausbaustufen.

## Bündel 32 · Tier-Fachpaket — offene Punkte fürs Finale

- [ ] **Tier**: Name, Art, Rasse, Halter, Chip-Nr. → „Tier".
- [ ] **Behandlung/Impfung**: Tier wählen → Datum, Art (Behandlung/Impfung/
      Untersuchung), Bezeichnung, Wdh.-Fälligkeit, Preis → „＋". Fälligkeits-Ampel
      (rot überfällig, gelb ≤30 Tage, grün fern).
- [ ] **Scope-Hinweis (Ausbaustufe/Brücke)**: HIT-Meldung, Herden-/Zuchtbuch und
      Pensionsstall-Abrechnung sind spätere Ausbaustufen.

## Bündel 33 · Verein, Kultur & Sozial — offene Punkte fürs Finale

- [ ] **Mitglied**: Reiter „Mitglieder" → Name, E-Mail, Beitrag, Intervall, Rolle
      → „Mitglied". Kacheln: aktive Mitglieder + Beitragsvolumen/Jahr.
- [ ] **Veranstaltung**: Reiter „Veranstaltungen" → Titel, Datum, Ort, Teilnehmer,
      Ehrenamt-Stunden → „Veranstaltung". Kacheln: Anzahl + Ehrenamt-Summe.
- [ ] **Verknüpfung**: Der SEPA-Beitragseinzug läuft über „👥 Mitglieder & Abos"
      (Bündel 8) — hier liegt die Vereinsverwaltung.
- [ ] **Scope-Hinweis (Ausbaustufe)**: Spendenquittungen/§10b, Ticketing und
      Fallakte (Sozial) sind spätere Ausbaustufen.

## Bündel 34 · Logistik-Fachpaket — offene Punkte fürs Finale

- [ ] **Tour**: Datum, Fahrer, Fahrzeug → „Tour". Status (geplant/unterwegs/
      abgeschlossen) änderbar; Liste zeigt Anzahl Stopps.
- [ ] **Sendung/Stopp**: Tour wählen → Sendungs-Nr., Empfänger, Adresse → „Stopp"
      (fortlaufende Reihenfolge). Zustell-Status je Stopp (offen → unterwegs →
      zugestellt/fehlgeschlagen); Kopf zeigt „x/y zugestellt".
- [ ] **Scope-Hinweis (Ausbaustufe/Brücke)**: Telematik-Anbindung, CMR/Frachtbrief,
      ADR und Lenkzeiten sind spätere Ausbaustufen bzw. Konnektor-Brücken.

## Control Room · Paket-Freigabe (Admin) — offene Punkte fürs Finale

- [ ] **Kein neues SQL** — nutzt vorhandene `tenant_module` + `/api/admin/tenant-module`.
- [ ] **Katalog prüfen**: `lib/pakete.ts` — KERN_MODULE (12 Kern) + BRANCHEN_PAKETE.
      Hier passt DU an, was ein Kunde bekommt.
- [ ] **Paket anwenden**: Admin → **TENANTS & MODULE** → Kunde aufklappen →
      oben „⚡ Pakete": „🧩 Kern setzen" schaltet die 12 Kern; ein Branchen-Chip
      (z. B. „🚗 KFZ-Betrieb") schaltet Kern + Branchenmodule auf einmal.
- [ ] **Extras zuklicken**: danach unten im Raster einzelne Module dazuschalten
      (z. B. KFZ + „🧾 Kasse" + „📷 Lager-Scanner" für den ATU-Fall).
- [ ] **Rückkontrolle**: der Zähler „x aktiv" steigt; der Kunde sieht nach Login
      genau diese Module. Alles wieder aus → fail-open (sieht wieder alles).
- [ ] **Nächster Schritt (separat)**: Vertrags-/Signatur-Modul (Bündel-Angebot +
      E-Sign + Kundendaten wie SEPA) + Kunden-Onboarding-Checkliste.

## 🧠 Brainstorming · Offene Arbeitspakete (gemerkt)

**Grundsatz-Entscheidung fürs Finale**
- [ ] Endgültige **Kern-Zusammenstellung** festlegen (`lib/pakete.ts` · KERN_MODULE).
      Frei konfigurierbar — Martin prüft im Finale, ob ERP/Personal in den harten Kern sollen.

**Verzahnung (Martin wählte B — alle drei gemerkt)**
- [ ] 1) **Fachpaket → Rechnung**: jedem neuen Fachpaket (KFZ, Gastro, Wellness,
      Bildung, IT-MSP, Immobilien, Tier …) den „→ Rechnung"-Knopf + feste
      Kontakt-Verknüpfung geben (Muster wie rechnung-aus-angebot/-lv steht schon).
- [ ] 2) **Bezahllink / Zahlungsanbieter**: Konnektor „Zahlungsanbieter" (Stripe/
      Mollie/PayPal) → „Jetzt bezahlen"-Link auf Rechnungen → Webhook markiert
      „bezahlt". (Hinweis: bestehendes stripe/ ist NUR fürs ARGONAUT-Abo-Billing.)
- [ ] 3) **Gemeinsames Kunden-SEPA-Mandat**: einmal erfasst → in Rechnungen &
      überall nutzbar (heute nur im Mitglieder-Modul).

**Design-Einheitlichkeit (systemisch)**
- [ ] Ursache gefunden: `app/globals.css` hat ein HELLES Grund-Theme (body #fff,
      helle Variablen) — dunkle Dashboard-Seiten überschreiben nur lokal, native/
      unstilisierte Elemente fallen auf Weiß zurück (aufklappen = weiß, Hover =
      grau/weiß, am Handy am schlimmsten). Fix: dunkles Baseline + Styling für
      native Controls (select/option/details/input), **begrenzt auf Dashboard/Admin**
      (öffentliche Website bleibt hell).

**„Wachendes Auge" überall ausrollen**
- [ ] Bauteil existiert schon: `KiAuge.tsx` (+ `KiKlartext.tsx`, API ki-auge/
      ki-klartext) und „Kunden-Daten prüfen" (stammdatenPruefung.ts / dublettenLogik.ts).
      To-do: `<KiAuge>` generisch mit Modul-Kontext auf alle sinnvollen Reiter setzen.

**Betreiber-Rundumblick (Command Center · Verbrauch)**
- [ ] Command Center trackt heute nur Geld (MRR/Umsatz/Kunden via /api/admin/stats).
      KI-Kosten & Speicher = 0 (die „GB" im Cockpit sind Deko). To-do:
- [ ] 1) `ki_nutzung`-Tabelle + `logKiNutzung()`-Helfer in alle ~20 KI-Routen
      (Kunde, Endpunkt, Modell, Tokens, Kosten) → KI-Marge je Kunde.
- [ ] 2) Speicher je Kunde summieren (Dateiablage prüfen) → belegt vs. Paket-Limit
      → Upgrade-Signal, wenn voll.
- [ ] 3) /api/admin/verbrauch + Panel im Command Center & Tenants-Ansicht:
      KI-Kosten (Monat), Speicher (belegt/Limit), aktive Module — visuell.
      Verzahnt: Paket → Limit → Verbrauch → Upgrade.

## Welle 2 · Kunde-360°-Akte — offene Punkte fürs Finale

- [ ] **Kein neues SQL** — liest kontakte/rechnungen/angebote/termine zusammen.
- [ ] Menü **🧭 Kunden-Akte** → links Kunde suchen/wählen → rechts öffnet sich die
      360°-Akte: KPI-Kacheln (Umsatz, offener Betrag, Anzahl Rechnungen/Angebote,
      nächster Termin) + Sektionen „Offene Posten", „Rechnungen", „Angebote", „Termine".
- [ ] **Offene Posten**: unbezahlte, nicht stornierte Rechnungen stehen oben mit
      Ampel „offen/überfällig".
- [ ] **Termine-Match**: Termine erscheinen, wenn beim Termin dieselbe E-Mail wie
      beim Kontakt hinterlegt ist.
- [ ] **Ausbau (später)**: direkter Absprung aus der CRM-Liste in die Akte;
      Fachpaket-Daten (KFZ-Fahrzeuge, Verträge …) mit in die Akte ziehen.
