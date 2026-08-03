# ARGONAUT OS — Gesamtliste aller offenen Punkte

**Stand: Montag, 03.08.2026, 22:15 Uhr**
**Präsentation: Donnerstag, 06.08.2026 · Testtag: Mittwoch, 05.08.2026**

> **Das Audit-Muster.** In diesem Projekt hat sich immer wieder gezeigt, dass
> vermeintlich offene Punkte längst gebaut waren — und dass fertig gebaute Teile
> nie eingeschaltet wurden. Allein am 03.08. gefunden: der Laufzeitrabatt (stand
> in den AGB, wurde nie berechnet), der Kostenalarm (definiert, nirgends
> ausgewertet), die Anschlüsse-Bausteine (fertig, nie verdrahtet), KI-Auge,
> KI-Guide und geführte Tour (fertig, von keiner Seite importiert).
> **Vor dem Bau jedes Punktes erst am echten Code prüfen.**

---

# ✅ ERLEDIGT AM 03.08.2026

## Geld und Recht
- [x] Laufzeit-Rabatt 5 % / 8 % wird berechnet — `lib/tarif.ts`, 24 Tests · `d210ca8`
- [x] Laufzeit-Auswahl 12/24/36 in beiden Rechnern · `87cdf51`
- [x] Preise angehoben, Standort-Zuschlag 49 €/Monat + 190 € einmalig · `bafc0ae`
- [x] AGB: § 14 BGB (nur B2B), kein Widerrufsrecht, echter Bestellablauf, Vertragstext, SEPA-Vorabankündigung, Gerichtsstand · `d849f99`
- [x] Rabatt-Prozente auf der Website sichtbar, FAIR_USE-Altlast entfernt · `f95e905`
- [x] Gläubiger-ID beantragt und erhalten — DE31ZZZ00002934437
- [x] Impressum: Telefonnummer eingetragen · `a7e6919`

## Website
- [x] Branchenzahl vereinheitlicht auf 698 (vorher standen 205 UND 690+ auf derselben Seite)
- [x] Alle 698 Branchen-Dossiers erzeugt — 7 Seiten, individuell je Branche

## KI-Kosten und Schutz
- [x] Tagesgrenze je Sitz-Typ (150 / 60 / 15) · `8f0d389`
- [x] Firmen-Topf statt Einzellimit, stiller 2×-Puffer, 70 % Warnung / 100 % Puffer / 200 % Stopp · `0bc20ab`
- [x] Kostenalarm scharfgestellt (war definiert, wurde nirgends ausgewertet)
- [x] KI-Monatsbericht an den Betreiber — je Betrieb Topf, Auslastung, Kosten, Top-5-Nutzer, brachliegende Sitze
- [x] Cron entschärft: social-posten lief **jede Minute** (43.200 Läufe/Monat) → alle 6 Minuten · `5e3949f`
- [x] `APP_ENC_KEY` und `CRON_SECRET` in Vercel gesetzt

## Onboarding
- [x] Ränge „Vom Matrosen zum Kapitän" mit Leiste unter dem Balken · `6c6e6d4`
- [x] Aufleuchtendes Auge — nur bei echtem Aufstieg
- [x] Abschluss-Zertifikat mit Dreizack aus dem Original-Logo, Stempel, beherrschten Bereichen je Branche · `357dfad`
- [x] `lib/onboardingBereiche.ts` — alle 62 Branchenschritte von Hand als Bereiche benannt
- [x] **KI-Guide und geführte Tour eingeschaltet** (lagen fertig im Repo, wurden nie importiert) · `ccf6817`

## Vorführung (am 03.08. dazugekommen, war nicht geplant)
- [x] 21 Vorführ-Betriebe mit eigenen Zugangsdaten, Stammdaten, Modulen, Übungswelt · `fce58dd`
- [x] Anschlüsse-Lücke geschlossen — fünf fertige Bausteine waren nie verdrahtet, Cockpit stand in jeder Demo auf 0 von 6
- [x] Zugangsblatt als PDF, alle 21 auf einer Seite
- [x] Öffentliche Vorführung über **alle 698 Branchen** — Suche, Lockbildschirm, anfassbarer Preis · `b5a816c`
- [x] QR-Code führt auf die echte Branchenseite mit Rechner und Terminbuchung; Kategorie-404 behoben · `357f72d`
- [x] 60-Sekunden-Pitch und Demo-Drehbuch geschrieben

## Zugriffsrechte
- [x] Ordnung wie im Hauptmenü — vorher 21 von 116 Modulen gruppiert, 95 im Auffangtopf · `a56c993`
- [x] Zähler „116 von 112" korrigiert · `65c4064`
- [x] Zähler Änderungsrecht korrigiert (33 auf 31 Modulen)
- [x] Bestätigungsdialog scrollbar — war höher als der Bildschirm, Knöpfe unerreichbar · `abc351a`
- [x] Dubletten im Dialog entfernt

## Kleinigkeiten
- [x] Login: `autoComplete` gesetzt, Browser bietet Passwort speichern an · `e4ea349`
- [x] Übungswelt zeigt alle gefüllten Bereiche statt nur „Im CRM ansehen"

---

# 🔴 NUR MARTIN — vor Mittwoch

- [ ] **`/admin/demo-betriebe` aufrufen und den Knopf drücken** — die 21 Konten existieren noch nicht. Ohne das kann sich Donnerstag niemand einloggen. **Wichtigster offener Punkt.**
- [ ] **Übungswelt im eigenen Konto entfernen und neu laden** — die geladene Fassung stammt von vor der Anschlüsse-Reparatur
- [ ] **Unterschrift als PNG** mit durchsichtigem Hintergrund fürs Zertifikat
- [ ] Antwort: Kommt der Pitch am Anfang oder am Ende der Runde? (ändert den ersten Satz)

---

# 🟡 TESTTAG MITTWOCH, 05.08.

- [ ] Drei Demo-Konten anmelden (Maler, Autohaus, Bäckerei) — Dashboard, CRM, Rechnungen, Anschlüsse, Onboarding
- [ ] Beim Maler: Rang, Auge, „noch X Prozent bis …" prüfen
- [ ] Zertifikat einmal herunterladen und öffnen
- [ ] **Auf dem echten 43-Zöller**: Suche („mal", „feuer"), Bildschirmtastatur, Zoom, Touch
- [ ] QR-Code mit dem Handy scannen — muss auf der Branchenseite mit Rechner und Terminfeld landen
- [ ] Preisbild antippen: 1 Person → 499 €, 300+ → 41.728 €
- [ ] Lockbildschirm: zwei Minuten nichts anfassen
- [ ] Zugangsblatt ausdrucken
- [ ] Handy-Hotspot einrichten und testen
- [ ] Generalprobe komplett durchklicken

---

# 🟢 KANN NOCH VOR DONNERSTAG GEBAUT WERDEN

- [ ] **KI-Auge in die Modul-Übersichten** — CRM, Rechnungen, Personal, Aufträge. `KiAuge.tsx` ist fertig gebaut und wird von keiner Seite verwendet. Das ist Akt 4 des Drehbuchs.
- [ ] **Demo-Drehbuch als PDF** fürs Handy
- [ ] **Modul-Dublette auflösen** — „Wiederkehrende Rechnungen" existiert unter zwei Schlüsseln mit demselben Namen
- [ ] Sitemap auf 698-Abdeckung prüfen

---

# TEIL A · Rest bis Donnerstag

## A1 · SEPA scharfstellen — wartet auf die Bank
- [ ] Vier Env-Variablen in Vercel: `SEPA_CREDITOR_NAME`, `SEPA_CREDITOR_IBAN`, `SEPA_CREDITOR_BIC`, `SEPA_CREDITOR_GLAEUBIGER_ID`
- [ ] Inkassovereinbarung mit der Kreissparkasse Böblingen — Einreichungsfrist, Limits, Upload-Weg für pain.008
- [ ] Probe-Einzug über `/admin/abo-einzug`, Datei im Online-Banking testen
- [ ] Kontofrage klären, bevor die IBAN eingetragen wird

## A2 · Restliche Umgebungsvariablen
- [ ] `GOOGLE_ADS_DEVELOPER_TOKEN` (nur für Google Ads)
- [ ] shipcloud-API-Key (nur für Versand-Frankierung)

## A3 · Demodaten Runde 3 — Rest
- [ ] `termine` (braucht `termin_art_id`-FK)
- [ ] Branchen-Module: Aufmaß, Werkstatt, Tierbestand, Schlagkartei
- [ ] Demo-Werte für eigene Felder

## A4 · Live-Rundumcheck
- [ ] Website nach den Preisänderungen durchklicken — Startseite, Rechner, AGB, Branchenseiten
- [ ] Alte weiße Branchenseite `app/branchen` (205 Branchen, altes Agenten-Preismodell) ablösen
- [ ] Vorführungs-Design auf die echte Branchenseite übertragen (große Kacheln statt Liste)

---

# TEIL B · Vor dem Versand der 698 Dossiers

## B1 · Öffentliche Bestellstrecke — größter Brocken
Der Knopf „Jetzt buchen" steht auf Seite 7 aller 698 Dossiers.
- [ ] Stufe und Sitze → Laufzeit 12/24/36 → **Unternehmerbestätigung § 14 BGB** (Firmenname + USt-IdNr.) → Firmendaten → SEPA-Mandat → AGB/Datenschutz/AVV → verbindlich bestellen
- [ ] Konto automatisch anlegen (Muster: `/api/admin/kunde-einladen`)
- [ ] Auftragsbestätigung als PDF per E-Mail — AGB § 2.3 verlangt das
- [ ] Laufzeit-Rabatt serverseitig rechnen, nie im Browser

## B2 · Dossier-Funnel mit Double-Opt-In
- [ ] Anfrageformular: E-Mail + Branche + drei Pflicht-Häkchen
- [ ] Lead in Supabase mit Status „unbestätigt" + Einmalpasswort
- [ ] Bestätigungsmail (Logik liegt fertig in `lib/newsletter.ts`)
- [ ] Nach Klick: Begrüßungsmail + PDF-Mail + Demo-Mail mit Zugangsdaten
- [ ] Zugangsseite: E-Mail + Einmalpasswort → Signed-URL → PDF
- [ ] 698 PDFs in Supabase Storage hochladen
- [ ] Demo-Ablauf auf 7 Tage setzen (+ 7 Tage Kulanz = die versprochenen 14)

## B3 · Resend auf Pro
- [ ] Free hat ein Tageslimit von 100 Mails — der harte Blocker. Pro 20 USD, 100k-Stufe 35 USD.

## B4 · AVV als Anlage
- [ ] Auftragsverarbeitungsvertrag nach Art. 28 DSGVO als feste Vertragsanlage
- [ ] Unterauftragnehmer-Liste: Supabase, Vercel, Hostinger, Resend, Anthropic, Voyage AI
- [ ] Technische und organisatorische Maßnahmen beschreiben
- [ ] AGB § 11.3 anpassen (stellt den AVV heute nur „auf Anfrage" bereit)

---

# TEIL C · KI — was noch offen ist

- [ ] **Prompt Caching aktivieren** — `lib/ki.ts` liest `cache_read_input_tokens`, setzt aber nie `cache_control`. Halbiert die Kosten. **Frist 31.08.**
- [ ] **Batch API** für Newsletter, Social-Posts, Beleg-OCR, Auswertungen. Nochmal −50 %.
- [ ] **Zeitkritisch bis 31.08.2026** — Sonnet 5 wird zum 01.09. um 50 % teurer (2/10 → 3/15 USD)
- [ ] KI-Klartext prüfen — die einzige Route, die ungefragt beim Öffnen eines Reiters feuert
- [ ] **Sitz-Typ als echte Rechteschicht** — heute reines Preisschild, `lib/rechte.ts` kennt nur Ebenen 1–4. Ohne das ist die Sitz-Staffel nicht verkaufbar.

---

# TEIL D · Externe Partner

## D1 · KI-Telefonassistent
- [ ] Anbieter wählen: Retell oder Vapi
- [ ] Stimm-Klon: self-hosted (XTTS, StyleTTS2, F5-TTS) oder Cartesia / PlayHT
- [ ] Abrechnung pro Minute — passt zur SEPA-Lastschrift
- [ ] Daran hängt die Gesprächsanalyse

## D2 · Avatar und Stimme
- [ ] 15a Gesicht — HeyGen/Synthesia (vorgerendert) oder Simli/Anam/Tavus (Echtzeit)
- [ ] 15b Stimme — ElevenLabs ab ca. 22 USD/Monat, Voice-Clone ab dieser Stufe
- [ ] 15c Feinschliff
- [ ] Entscheidung: geklonte oder neutrale Stimme?
- [ ] Optional DeepL für Mehrsprachigkeit
- **Hinweis:** Stufe 1 (leuchtende Gestalt mit Text) läuft seit 03.08. `KiGuide` hat `avatarUrl` und `onVorlesen` bereits vorgesehen — Stufe 2 und 3 brauchen keinen Umbau.

## D3 · Banking, Steuern, Lohn
- [ ] finAPI — Kontoabgleich live (CSV-Abgleich läuft bereits ohne Partner)
- [ ] ELSTER / ERiC — Steuernummer und Zertifikat. UStVA wird berechnet, nur der Übermitteln-Knopf fehlt.
- [ ] Lohn / ITSG — Lohnabrechnung und DATEV-Export
- [ ] Mehrbank-Migration `bank_zugang` — SQL geliefert, Ausführung nie bestätigt

## D4 · Marketing-Kanäle
- [ ] WhatsApp Business API — Meta-Konto + Nummer + Token oder 360dialog, dazu Template-Freigabe
- [ ] Social-Konten: Facebook, Instagram, Google Unternehmensprofil, LinkedIn
- [ ] Werbekonten: Meta, Google Ads, LinkedIn, TikTok
- [ ] Marktplätze: Amazon, eBay, Kaufland, Otto

## D5 · Versand und Shop
- [ ] Versand-Anbieter entscheiden: shipcloud vs. Sendcloud vs. Direktverträge
- [ ] Onlineshop-Live-Sync — nie begonnen
- [ ] Import-Center: Alt-Software-Schnittstellen über Partner

---

# TEIL E · Recht und Zertifizierung

- [ ] **Anwaltstermin** — AGB, Datenschutz, AVV, Impressum, Widerruf, Preisangaben, Werbeaussagen
- [ ] AGB-Frage für den Anwalt: automatische Verlängerung um jeweils ein Jahr
- [ ] AGB-Häkchen aus dem reinen Anfrageformular nehmen (dort wird kein Vertrag geschlossen)
- [ ] **Kündigungs-Bereich nach § 312k BGB** — Route `/api/vertrag-kuendigung` existiert, Oberfläche fehlt
- [ ] ISO 27001 als Türöffner; zusätzlich 27017/27018, 27701, 9001
- [ ] TISAX — Pflicht für Automobil-Zulieferer
- [ ] SOC 2, BSI IT-Grundschutz, Penetrationstest
- [ ] ISO-Normen auf der Website ausweisen, sobald vorhanden

---

# TEIL F · Testtag — Module durchklicken

**Claude kann die Live-Website nicht klicken.** Alle bisherigen Prüfungen waren statisch im Code.

- [ ] List-1-Module: Kurse & Teilnehmer, Prüfprotokolle, Belegung, Schlagkartei, Tierbestand/HIT, Akten & Fristen, Zuschnitt, Spenden, Tour & ePOD, Gutachten, Hilfsmittel
- [ ] List-2-Tiefe: Varianten & Matrix, Etiketten/LMIV, Chargen & Prüfplan, Housekeeping & Speisekarte, IT-Assets/Lizenzen/SLA, Ernte & Direktvermarktung, Räume & Ressourcen
- [ ] Sechs geteilte Bausteine: Wiederkehr, Objekt-Register, Aufwand, Rezeptur, Chargen/HACCP, Fördermittel
- [ ] Umsatz-Inseln: Trigger bei `rechnung_id = null` prüfen
- [ ] Shop: Rechnung aus Bestellung → erscheint in Rechnungen und Finanzen
- [ ] Cron-Routen als Admin: `demo-aufraeumen`, `autoresponder`, drei Reminder
- [ ] Alle externen Motoren gegen die Live-API

---

# TEIL G · Noch zu bauende Module

## G1 · Multistandort — Datenebene
Der Preisrechner ist gebaut. Die Datenebene fehlt komplett.
- [ ] `standorte`-Tabelle, `mitarbeiter.standort_id`
- [ ] Modul-Freischaltung pro Filiale
- [ ] Filialleiter als Rolle in der vierstufigen Delegation
- [ ] Daten-Scoping über `standort_id` + Filial-Umschalter, Modul für Modul
- [ ] Zentrale Roll-up-Auswertung und Filialvergleich

## G2 · Anschluss-Motoren
Die Verbindungskarten stehen, der Datenfluss fehlt.
- [ ] Marktplatz-Abgleich: Amazon, eBay, Kaufland/Otto
- [ ] Banking-Sync über finAPI
- [ ] Mail- und Kalender-Sync
- [ ] ELSTER-Übermittlung
- [ ] Shop-/Marktplatz-Tiefe

## G3 · Marketing-Autopilot — Restbausteine
- [ ] Video-Upload-Paket: Bucket `social-video`, Auto-Cleanup-Cron, Speicher-Quota je Plan
- [ ] Social-Schwanz-Kanäle: TikTok, YouTube, Pinterest, X, Threads, Bluesky, Mastodon
- [ ] Status-Poll für IG-/FB-Video-Container
- [ ] Volle Anzeigen-Tiefe je Plattform
- [ ] Native Lead-Formulare, Pixel-/Conversion-Optimierung, Zielgruppen-Feinsteuerung
- [ ] Marketing-Cockpit: Zeitverlauf, Öffnungs- und Klickraten
- [ ] Zielgruppen direkt aus dem CRM wählen
- [ ] Asset-Bibliothek um Medien und Bild-KI erweitern
- [ ] Visueller Automations-Bauer: Trigger → Aktion → Bedingung → Wartezeit
- [ ] Weitere Kanäle: SMS, Retargeting, Google-Rezensionen
- [ ] Landingpages: Branche aus Profil vorbelegen

## G4 · Onboarding-Helfer
- [x] Geführte Persönlichkeit, die den Kunden durchführt — `KiGuide` eingeschaltet 03.08.
- [x] Automatisches Abschluss-Zertifikat — gebaut und verzahnt 03.08.
- [ ] `KiAuge` in die Modul-Übersichten einhängen

## G5 · Weitere Module
- [ ] A4 Geräte: Etikettendrucker, TSE, Waage (nur der Scanner ist live)
- [ ] A10 Außendienst: Offline-Erfassung mit Service-Worker und Sync
- [ ] A9 Report-Baukasten: gespeicherte und geplante Reports
- [ ] Exposé → Veröffentlichung an Immobilienportale
- [ ] BDE: Buchung mit `fertigung_auftraege` verknüpfen, Maschine als Asset, Schicht-Report-PDF
- [ ] IT-Assets: SLA-Einhaltung gegen echte Tickets messen
- [ ] Import-Center Stufe 2: zentraler Upload statt nur Launcher
- [ ] Vertriebsgebiete, Genehmigungs-Workflows für Rabatte, Sales-Cadences
- [ ] Fokus-/Detail-Umschalter („einfach ↔ volle Tiefe") — beschlossen, nirgends gebaut
- [ ] Eigene Felder nachziehen: Leads, Dokumente, Fahrzeugakte, Kasse, Academy, Mahnwesen, Fördermittel

## G6 · E-Book-Freebie-Funnel
- [ ] „Die Geschichte vom Argonaut" als Brand-Story schreiben
- [ ] Freebie auf jeder der 698 Branchenseiten und der Vergleichsseite verlinken

## G7 · Enterprise-Readiness
- [ ] Enterprise-Slot im Control Room
- [ ] Trust-Layer: Sicherheits- und Compliance-Nachweise, AVV-Vorlage, Referenzen
- [ ] Schwere Enterprise-Module — erst bei echtem Deal

## G8 · 698 KI-Dialoge (neu am 03.08.)
- [ ] Ordner `lib/vorfuehrtexte/` mit Blöcken à ~70 Branchen. Der Motor greift bereits darauf zu — ein neuer Block wirkt sofort, ohne Umbau. **Erst nach Donnerstag**, mit den echten Fragen aus dem Raum.

---

# TEIL H · Technische Schulden

- [ ] **Team-Chat-Bug** — seit dem allerersten Backlog offen
- [ ] `.backup`-Dateien im Repo aufräumen
- [ ] Geparkter Code: `agenten/page.tsx` und `automatisierungen` liegen noch im Repo
- [ ] Visuelle Konsistenz: Farben, Abstände, mobile Darstellung
- [ ] Analytics: `aufruf` zählt jeden GET ohne Dedupe, UTC- statt Berlin-Tagesgrenzen, A/B-Sieger ohne Signifikanz
- [ ] Autoresponder-Caps prüfen (`SOFORT_MAX=50`, `MAX_PRO_DURCHGANG=300`)
- [ ] Lager-Zuordnung im Shop-/Ernte-Weg: echter Katalog-Match statt Namens-Normalisierung
- [ ] Eigene Absender-Domain je Kunde
- [ ] Hostinger-VPS-Audit — n8n stillgelegt, nur noch Gotenberg. Verlängerung kostet das 2,2- bis 2,6-Fache.
- [ ] Master-Fahrplan neu durchnummerieren
- [ ] **„Angemeldet bleiben"-Häkchen** im Login (neu am 03.08. — greift in die Sitzungs-Cookies, deshalb erst nach Donnerstag)

---

# TEIL I · Datenbank

- [ ] Mehrbank-Migration `bank_zugang` — SQL geliefert, Ausführung nicht bestätigt
- [ ] `termine.kontakt_id` — Termine nur per E-Mail gescoped; bei geteilter Firmen-Mail vermischen sie sich innerhalb eines Betriebs
- [ ] `verkaufschancen`-Tabelle ist verwaist — `auftraege` liest jetzt `crm_deal`. Abschalten.
- [ ] `ausgaben` vs. `eingangsbelege` — zwei getrennte Ausgaben-Töpfe
- [ ] USt-Aufteilung im Mini-Paket — Zahlung ohne Rechnung zählt als voller Netto
- [ ] Connector-SQL bei jedem neuen Demo-Konto wiederholen
- [ ] **Verwaiste Schreibrechte in `mitarbeiter_rechte`** (neu am 03.08.) — Karteileichen zu Modulen, die nicht mehr freigeschaltet sind. Ungefährlich, aber sie haben den Zähler verwirrt.

---

# TEIL J · Vertrieb und Wachstum

- [ ] **Multiplikatoren-Programm statt Rabatt** — begrenzte Zahl kostenloser SOLO-Zugänge als Gegengeschäft mit Vertrag (Name, Logo, Zitat, Nennung je Quartal). Schützt die Preisliste, weil es ein Tausch ist und kein Nachlass.
- [ ] **Vermittlungsprovision** — `lib/provision.ts` liegt bereits im Repo. Für jemanden mit Netzwerk passender als ein Gratiszugang: kostet nur, wenn es funktioniert.
- [ ] Schäfer-Pilot komplett neu ins integrierte System einklinken (vorher echte Daten sichern)
- [ ] Erste Kunden aus dem 698-Funnel onboarden
- [ ] **Feuerwehren als Markt** (neu am 03.08.) — Modul-Fit ist ungewöhnlich gut: Prüffristen (Atemschutz, Leitern, Schläuche), Gerätewart, Mitglieder und Jugendfeuerwehr, Lehrgänge, Einsatzberichte. Haken: das Geld kommt von der Kommune, also Ausschreibung und langer Zyklus. Dafür ein extrem gut vernetzter Markt.

---

# TEIL K · Langfrist-Vision

- Solar- und Wind-M&A in Rumänien, Bulgarien, Spanien, Portugal, Griechenland
- VESTA Stadtwerke
- Neobank-Leiter: Yapeal → Neon → N26 → Commerzbank
- Acht ARGONAUT CITIES: NOVA, KOSMOS, TERRA, VITA, MARE, SOLARIS, AURORA, HELIOS
- Hyperloop-EU-Netz
- ARGONAUT Intelligence — eigenes Llama-Fine-Tuning ab etwa 500 Kunden
- Mond 2040, Mars 2050
- *Verworfen: Kernkraft / PROMETHEUS — nur noch Solar und Wind*
