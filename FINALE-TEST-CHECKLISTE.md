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

- [ ] **SQL zuerst**: `supabase-sql/buendel10-projekt-abrechnung.sql` im Supabase
      SQL-Editor ausführen (legt die Tabelle `projektleistungen` + RLS an).
- [ ] **Modul freischalten**: falls Starter-Modus aktiv, unter **🔧 Einstellungen**
      das Modul **💼 Projekt-Abrechnung** sichtbar schalten.
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

- [ ] **SQL zuerst**: `supabase-sql/buendel11-kundenportal.sql` im Supabase
      SQL-Editor ausführen (legt `portal_zugaenge` + RLS an).
- [ ] **Modul freischalten**: falls Starter-Modus aktiv, unter **🔧 Einstellungen**
      das Modul **👤 Kunden-Portal** sichtbar schalten.
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

- [ ] **SQL zuerst**: `supabase-sql/buendel12-foerdermittel.sql` im Supabase
      SQL-Editor ausführen (legt `foerder_vorhaben` + RLS an).
- [ ] **Modul freischalten**: falls Starter-Modus aktiv, unter **🔧 Einstellungen**
      das Modul **💰 Fördermittel** sichtbar schalten.
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
