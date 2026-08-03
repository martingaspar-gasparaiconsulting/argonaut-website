# ARGONAUT OS — Gesamtliste aller offenen Punkte

**Stand: Montag, 03.08.2026, 14:30 Uhr**
**Präsentation: Donnerstag, 06.08.2026**

Grundlage: alle elf Bau-Protokolle aus dem Gedächtnis, abgeglichen mit dem Repo-Stand
vom 03.08. Erledigtes ist nicht mehr aufgeführt.

> **Wichtige Vorbemerkung — das Audit-Muster.** In diesem Projekt hat sich mehrfach
> gezeigt, dass vermeintlich offene Punkte beim Blick in den Code längst gebaut waren
> (Dispatch-Board, XRechnung, Beleg-OCR, Außendienst-Erfassung, vier Singleton-Module).
> Vor dem Bau jedes Punktes unten also erst am echten Code prüfen. Das spart mehr Zeit,
> als es kostet.

---

# TEIL A · Bis Donnerstag

## A1 · SEPA scharfstellen — dein Part

- [ ] **Vier Env-Variablen in Vercel setzen**: `SEPA_CREDITOR_NAME`, `SEPA_CREDITOR_IBAN`, `SEPA_CREDITOR_BIC`, `SEPA_CREDITOR_GLAEUBIGER_ID` (= DE31ZZZ00002934437)
- [ ] **Inkassovereinbarung** für SEPA-Basislastschriften mit der Kreissparkasse Böblingen klären — inklusive Einreichungsfrist, Limits und Upload-Weg für die pain.008-Datei
- [ ] **Probe-Einzug** über `/admin/abo-einzug` durchführen und die Datei im Online-Banking testen
- [ ] Kontofrage klären, bevor die IBAN eingetragen wird

## A2 · Weitere fehlende Umgebungsvariablen

- [ ] **`APP_ENC_KEY`** (32 Byte) — ohne sie funktioniert **kein einziges** verschlüsseltes Verbinden: WhatsApp, Social, Ads, Versand, Banking, ELSTER, Marktplatz, Mail-Sync. Das ist der wichtigste fehlende Schlüssel im ganzen System.
- [ ] **`CRON_SECRET`** — sonst laufen die Cron-Routen nicht (Demo-Aufräumen, Autoresponder, Reminder)
- [ ] `GOOGLE_ADS_DEVELOPER_TOKEN` (nur für Google Ads)
- [ ] shipcloud-API-Key (nur für Versand-Frankierung)

## A3 · Demo-Konto und Präsentation

- [ ] **Demo-Daten Runde 3**: `termine` (braucht `termin_art_id`-FK), Branchen-Module (Aufmaß, Werkstatt, Tierbestand, Schlagkartei), Demo-Werte für eigene Felder
- [ ] Nach dem Einspielen: **Übungswelt im Demo-Konto entfernen und neu laden**, sonst greifen die neuen Beispieldaten nicht
- [ ] **Demo-Drehbuch schreiben** — welcher Weg wird live gezeigt
- [ ] **Generalprobe** einmal komplett durchklicken
- [ ] Entscheiden: Pitch auf eine konkrete Branche zuschneiden oder allgemein halten
- [ ] Prüfen, ob der letzte Präsentations-Modus-Block (PraesentationsModus.tsx, layout.tsx, beispielKern.ts, uebungswelt.ts) wirklich gepusht wurde

## A4 · Letzter Live-Rundumcheck

- [ ] Website nach den Preisänderungen durchklicken — Startseite, Rechner, AGB, Branchenseiten
- [ ] Widersprüchliche Branchenzahlen vereinheitlichen (698 / 690+ / 205 / 200+ kursieren noch)
- [ ] Sitemap auf 698-Abdeckung prüfen
- [ ] Alte weiße Branchenseite `app/branchen` (~200 Branchen, altes Agenten-Preismodell) ablösen

---

# TEIL B · Vor dem Versand der 698 Dossiers

Diese Punkte sind **Voraussetzung** dafür, dass die Dossiers überhaupt rausgehen können.

## B1 · Öffentliche Bestellstrecke — größter Brocken

Der Knopf „Jetzt buchen" steht auf Seite 7 aller 698 Dossiers. Ohne diese Strecke ist er ein leeres Versprechen.

- [ ] Stufe und Sitze wählen → Laufzeit 12/24/36 → **Unternehmerbestätigung nach § 14 BGB** (Pflichtfeld mit Firmenname und USt-IdNr.) → Firmendaten → SEPA-Mandat → AGB, Datenschutz und AVV bestätigen → verbindlich bestellen
- [ ] Konto wird automatisch angelegt (Muster: `/api/admin/kunde-einladen` existiert bereits)
- [ ] **Auftragsbestätigung als PDF per E-Mail** — AGB § 2.3 verlangt das ausdrücklich
- [ ] Laufzeit-Rabatt serverseitig rechnen, nie im Browser

## B2 · Dossier-Funnel mit Double-Opt-In

- [ ] Anfrageformular: E-Mail + Branche + **drei Pflicht-Häkchen** (AGB / Datenschutz / Newsletter)
- [ ] Lead in Supabase mit Status „unbestätigt" + Einmalpasswort
- [ ] Bestätigungsmail (Double-Opt-In) — Logik liegt fertig in `lib/newsletter.ts`
- [ ] Nach Klick: Begrüßungsmail + PDF-Mail + Demo-Mail mit Zugangsdaten
- [ ] Zugangsseite: E-Mail + Einmalpasswort → Supabase Signed-URL → PDF
- [ ] **698 PDFs in Supabase Storage hochladen**
- [ ] **Demo-Ablauf auf 7 Tage setzen** — die Kulanzfrist steht bereits auf 7 Tage, zusammen ergibt das die auf Seite 7 versprochenen 14 Tage

## B3 · Resend auf Pro heben

- [ ] Free hat ein **Tageslimit von 100 E-Mails** — das ist der harte Blocker, nicht das Monatsvolumen. Pro kostet 20 USD, die 100k-Stufe 35 USD und trägt bis etwa 450.000 Mails im Monat.

## B4 · AVV als Anlage

- [ ] Auftragsverarbeitungsvertrag nach Art. 28 DSGVO als feste Vertragsanlage
- [ ] **Unterauftragnehmer-Liste**: Supabase, Vercel, Hostinger, Resend, Anthropic, Voyage AI
- [ ] Beschreibung der technischen und organisatorischen Maßnahmen
- [ ] AGB § 11.3 anpassen (stellt den AVV heute nur „auf Anfrage" bereit)

---

# TEIL C · KI — Kosten und Schutz

Befund vom 03.08.: Von 117 API-Routen rufen 27 Anthropic auf, 26 davon nur auf Nutzerklick.
52 Regelfunktionen in `lib/auge.ts` rechnen lokal ohne KI. Die Marge ist gesund —
aber es gibt keine Obergrenze nach oben.

- [ ] **Tagesgrenze pro Sitz-Typ** in `lib/schwellen.ts` + `lib/ki.ts`: Voll 150, Standard 60, Self-Service 15 Aufrufe pro Tag. Liegt 2- bis 5-fach über realer Nutzung, stoppt aber Skripte. **Ohne das kann ein einzelner Kunde theoretisch 21.000 € Kosten im Monat auslösen.**
- [ ] **Kostenalarm scharfstellen** — `SCHWELLEN.ki.kostenAlarmTagUsd = 5` ist definiert, wird aber **nirgends ausgewertet**. Weder Warnung noch Reaktion.
- [ ] **Drei Stufen nach AGB § 9.3**: bei 70 % Warnung an den Betreiber, bei 100 % freundliche Meldung an den Nutzer, bei wiederholtem Anschlagen Kontakt und dann Begrenzung
- [ ] **Prompt Caching aktivieren** — `lib/ki.ts` hat die Caching-Preise bereits durchgerechnet und liest `cache_read_input_tokens` aus, setzt aber nie ein `cache_control`. Der Schalter ist gebaut und nie umgelegt worden. Halbiert die Kosten.
- [ ] **Batch API** für alles, was nicht in Echtzeit laufen muss: Newsletter, Social-Posts, Beleg-OCR, Auswertungen. Nochmal −50 %.
- [ ] **Zeitkritisch: bis 31.08.2026** — Claude Sonnet 5 wird zum 01.09. um 50 % teurer (2/10 → 3/15 USD je Mio. Token). Caching und Batch vorher scharf.
- [ ] **KI-Klartext prüfen** — die einzige Route, die ungefragt beim Öffnen eines Reiters feuert
- [ ] **Sitz-Typ als echte Rechteschicht** — heute ist er ein reines Preisschild, `lib/rechte.ts` kennt nur Hierarchie-Ebenen 1–4. Ohne das ist die Sitz-Staffel nicht verkaufbar.

---

# TEIL D · Externe Partner

## D1 · KI-Telefonassistent

- [ ] Anbieter wählen: Retell oder Vapi für die Telefonie
- [ ] Stimm-Klon: self-hosted (XTTS, StyleTTS2, F5-TTS) oder Cartesia / PlayHT
- [ ] Abrechnung pro Minute — passt zur SEPA-Lastschrift
- [ ] Konzept liegt vor: `ARGONAUT-KI-Telefonassistent-Konzept.html`
- [ ] Daran hängt die **Gesprächsanalyse / Conversation Intelligence**

## D2 · Hologramm-Avatar + Stimme (A13)

Noch gar nicht begonnen. Steht auf der Website versprochen („Hologramm-Onboarding + Zertifikat") und ist Teil der Einrichtungsgebühr.

- [ ] 15a Avatar / Gesicht — HeyGen oder Synthesia (vorgerendert, kaum Laufkosten) oder Simli / Anam / Tavus (Echtzeit, 0,01–0,35 USD je Minute)
- [ ] 15b Stimme — ElevenLabs ab ca. 22 USD im Monat, Voice-Clone ab dieser Stufe
- [ ] 15c Feinschliff
- [ ] Entscheidung: Martins geklonte Stimme oder neutrale Stimme? Start mit Stufe 1 (Stimme im KI-Auge)?
- [ ] Optional DeepL für Mehrsprachigkeit (29 Sprachen)

## D3 · Banking, Steuern, Lohn

- [ ] **finAPI** — Kontoabgleich live. Der CSV-Abgleich läuft bereits ohne Partner.
- [ ] **ELSTER / ERiC** — Steuernummer und Zertifikat, echte Übermittlungsschnittstelle. Die UStVA wird bereits berechnet, nur der Übermitteln-Knopf fehlt.
- [ ] **Lohn / ITSG** — Lohnabrechnung und DATEV-Export
- [ ] **Mehrbank-Migration**: `bank_zugang` Primärschlüssel umbauen (`id` + `bank_name` ergänzen, alten PK droppen). SQL wurde geliefert, **Ausführung nie bestätigt → prüfen**

## D4 · Marketing-Kanäle

- [ ] **WhatsApp Business API** — Meta-Konto + Nummer + Token oder 360dialog (49/99/249 € je Nummer und Monat). Dazu **Template-Freigabe bei Meta**. Martin will die Schritt-für-Schritt-Anleitung ganz am Ende.
- [ ] **Social-Konten verbinden**: Facebook-Seite, Instagram, Google Unternehmensprofil, LinkedIn (App-Freigabe nötig)
- [ ] **Werbekonten**: Meta (`act_…` + System-User-Token), Google Ads Customer-ID, LinkedIn sponsoredAccount-URN, TikTok Advertiser-ID
- [ ] **Marktplätze**: Verkäuferkonten bei Amazon, eBay, Kaufland, Otto

## D5 · Versand und Shop

- [ ] **Versand-Anbieter entscheiden**: shipcloud (Default) vs. Sendcloud vs. Direktverträge
- [ ] **Onlineshop-Live-Sync** (L2-8) — nie begonnen
- [ ] **Import-Center**: wenige Alt-Software-Schnittstellen über Partner

---

# TEIL E · Recht und Zertifizierung

- [ ] **Anwaltstermin** für die finale Freigabe: AGB, Datenschutzerklärung, AVV, Impressum, Widerruf, Preisangaben, Werbeaussagen. Fachanwalt IT-Recht/Datenschutz, u. a. über eRecht24 Premium.
- [ ] Offene AGB-Frage für den Anwalt: automatische Verlängerung um jeweils ein Jahr
- [ ] **AGB-Häkchen aus dem reinen Anfrageformular nehmen** — bei einer Kontaktanfrage wird kein Vertrag geschlossen, die Kopplung ist unnötig
- [ ] **Kündigungs-Bereich nach § 312k BGB** — die Route `/api/vertrag-kuendigung` existiert, die **Oberfläche fehlt bzw. ist nicht verlinkt**. Mit Warnhinweisen zu Kündigungsdatum und Datenexport-Frist plus Bestätigungsseite.
- [ ] Impressum: Telefonnummer folgt noch
- [ ] **ISO 27001** als Türöffner; zusätzlich denkbar 27017/27018 (Cloud), 27701 (Datenschutz), 9001 (QM)
- [ ] **TISAX** — Pflicht für Automobil-Zulieferer, also die Eintrittskarte zu Mercedes und BMW
- [ ] SOC 2, BSI IT-Grundschutz, Penetrationstest
- [ ] ISO-Normen auf der Website ausweisen, sobald vorhanden

---

# TEIL F · Testtag

Bewusst gebündelt, nie zwischendrin. **Claude kann die Live-Website nicht klicken** — alle bisherigen Prüfungen waren statisch im Code. Echte Klick-Tests stehen komplett aus.

- [ ] **List-1-Module A2–A12**: Kurse & Teilnehmer, Prüfprotokolle, Belegung, Schlagkartei mit Dünge+PSM, Tierbestand/HIT, Akten & Fristen, Zuschnitt, Spenden & Zuwendungsnachweis, Tour & ePOD, Gutachten, Hilfsmittel
- [ ] **List-2-Tiefe**: Varianten & Matrix, Etiketten/LMIV, Chargen & Prüfplan, Housekeeping & Speisekarte, IT-Assets/Lizenzen/SLA, Ernte & Direktvermarktung, Räume & Ressourcen
- [ ] **Die sechs geteilten Bausteine**: Wiederkehr, Objekt-Register, Aufwand, Rezeptur, Chargen/HACCP, Fördermittel-Nachweise
- [ ] Umsatz-Inseln: Knopf einmal klicken, prüfen ob der Trigger bei `rechnung_id = null` sauber durchläuft
- [ ] Shop: Rechnung aus Bestellung → erscheint in Rechnungen und Finanzen
- [ ] Cron-Routen im Browser als Admin: `demo-aufraeumen`, `autoresponder`, die drei Reminder
- [ ] **Alle externen Motoren** gegen die Live-API — erst möglich, wenn die Konten verbunden und `APP_ENC_KEY` gesetzt ist

---

# TEIL G · Noch zu bauende Module

## G1 · Multistandort — Datenebene

Der **Preisrechner** ist gebaut (40-%-Modell plus Standort-Zuschlag seit 03.08.). Die **Datenebene** fehlt komplett.

- [ ] `standorte`-Tabelle, `mitarbeiter.standort_id`
- [ ] Modul-Freischaltung pro Filiale
- [ ] Filialleiter als Rolle in der vierstufigen Delegation
- [ ] Daten-Scoping über `standort_id` + Filial-Umschalter, Modul für Modul
- [ ] Zentrale Roll-up-Auswertung und Filialvergleich

> Der in alten Protokollen notierte Preis von 79 €/59 € je Filiale ist **überholt** —
> es gilt das 40-%-Modell mit Standort-Zuschlag 49 €/Monat und 190 € einmalig.

## G2 · Anschluss-Motoren

Die Verbindungskarten stehen, der Datenfluss fehlt.

- [ ] Marktplatz-Abgleich: Amazon, eBay, Kaufland/Otto
- [ ] Banking-Sync über finAPI
- [ ] Mail- und Kalender-Sync
- [ ] ELSTER-Übermittlung
- [ ] Shop-/Marktplatz-Tiefe (einziges echtes inhaltliches Gap aus der Kontroll-Review)

## G3 · Marketing-Autopilot — Restbausteine

- [ ] Video-Upload-Paket: Bucket `social-video`, Auto-Cleanup-Cron, Speicher-Quota je Plan
- [ ] Social-Schwanz-Kanäle: TikTok, YouTube, Pinterest, X, Threads, Bluesky, Mastodon
- [ ] Status-Poll für IG-/FB-Video-Container (Meta arbeitet asynchron)
- [ ] Volle Anzeigen-Tiefe je Plattform (Google, LinkedIn, TikTok wie bei Meta)
- [ ] Native Lead-Formulare, Pixel-/Conversion-Optimierung, Zielgruppen-Feinsteuerung
- [ ] Marketing-Cockpit: Zeitverlauf, Newsletter-Öffnungs- und Klickraten
- [ ] Zielgruppen direkt aus dem CRM wählen
- [ ] Asset-Bibliothek um Medien und Bild-KI erweitern (speichert heute nur Texte)
- [ ] Visueller Automations-Bauer: Trigger → Aktion → Bedingung → Wartezeit
- [ ] Weitere Kanäle: SMS, Retargeting, Google-Rezensionen lesen und beantworten
- [ ] Landingpages: Branche aus Profil vorbelegen, Sequenz je Landingpage

## G4 · Onboarding-Helfer

- [ ] Der **Onboarding-Helfer als geführte Persönlichkeit**, die den Kunden durchführt
- [ ] **Automatisches Abschluss-Zertifikat**, wenn das Onboarding einmal komplett durchlaufen wurde. Bausteine liegen bereit: `lib/zertifikat.ts` (markengetreues PDF), `lib/auge.ts`, Dashboard-Onboarding. Es fehlt die Verzahnung.

## G5 · Weitere Module

- [ ] A4 Geräte: Etikettendrucker, TSE, Waage (nur der Scanner ist live)
- [ ] A10 Außendienst: Offline-Erfassung mit Service-Worker und Sync
- [ ] A9 Report-Baukasten: gespeicherte und geplante Reports
- [ ] Exposé → Portal-Veröffentlichung an Immobilienportale
- [ ] BDE: Buchung mit `fertigung_auftraege` verknüpfen, Maschine als Asset, Schicht-Report-PDF
- [ ] IT-Assets: SLA-Einhaltung gegen echte Tickets messen
- [ ] Import-Center Stufe 2: zentraler Upload statt nur Launcher
- [ ] Vertriebsgebiete, Genehmigungs-Workflows für Rabatte, Sales-Cadences
- [ ] Fokus-/Detail-Umschalter („einfach ↔ volle Tiefe", Standard = Fokus) — als Prinzip beschlossen, nirgends gebaut
- [ ] Eigene Felder nachziehen für Leads, Dokumente, Fahrzeugakte, Kasse, Academy, Mahnwesen, Fördermittel

## G6 · E-Book-Freebie-Funnel

Teilweise durch die 698 Dossiers erledigt. Offen bleibt:

- [ ] „Die Geschichte vom Argonaut" als Brand-Story schreiben
- [ ] Verlinkung des Freebies auf **jeder** der 698 Branchenseiten und der Vergleichsseite

## G7 · Enterprise-Readiness

- [ ] Enterprise-Slot im Control Room (`tenant_module` schaltet Enterprise-Module je Kunde)
- [ ] Trust-Layer: Sicherheits- und Compliance-Nachweise, AVV-Vorlage, Referenzen
- [ ] Schwere Enterprise-Module (volle Kostenrechnung, Lager→EWM, MRP) — **erst bei echtem Deal**, kein spekulativer Vorbau

---

# TEIL H · Technische Schulden

- [ ] **Team-Chat-Bug** — seit dem allerersten Backlog offen, nie angefasst
- [ ] `.backup`-Dateien im Repo aufräumen
- [ ] Geparkter Code: `agenten/page.tsx` und `automatisierungen` sind aus der Navigation raus, liegen aber noch im Repo
- [ ] Visuelle Konsistenz: Farben, Abstände, mobile Darstellung (die Schrift ist erledigt)
- [ ] Analytics: `aufruf` zählt jeden GET ohne Dedupe, UTC- statt Berlin-Tagesgrenzen, A/B-Sieger ohne Signifikanzrechnung
- [ ] Autoresponder-Caps prüfen (`SOFORT_MAX=50`, `MAX_PRO_DURCHGANG=300`)
- [ ] Lager-Zuordnung im Shop-/Ernte-Weg: echter Katalog-Match statt Namens-Normalisierung
- [ ] Eigene Absender-Domain je Kunde (heute läuft alles über `noreply@argonaut-os.com`)
- [ ] **Hostinger-VPS-Audit** — n8n ist stillgelegt, es läuft nur noch Gotenberg. Stufe prüfen: Verlängerung kostet das 2,2- bis 2,6-Fache des Aktionspreises.
- [ ] Master-Fahrplan neu durchnummerieren (nach dem Umbau von 41 auf 48 Punkte nie gemacht)

---

# TEIL I · Datenbank

- [ ] **Mehrbank-Migration** `bank_zugang` — SQL geliefert, Ausführung nicht bestätigt
- [ ] **`termine.kontakt_id`** — Termine sind nur per E-Mail gescoped. Bei geteilter Firmen-Mail vermischen sich Termine **innerhalb** eines Betriebs. Kein Datenleck nach außen, aber unsauber.
- [ ] **`verkaufschancen`-Tabelle ist verwaist** — nichts schreibt sie mehr, `auftraege` liest jetzt `crm_deal`. Abschalten.
- [ ] **`ausgaben` vs. `eingangsbelege`** — zwei getrennte Ausgaben-Töpfe. Das Finanz-Cockpit nutzt `eingangsbelege`, die alte Unterseite schreibt weiter in `ausgaben`.
- [ ] **USt-Aufteilung im Mini-Paket** — Zahlung ohne Rechnung zählt als voller Netto. Für Kleinunternehmer korrekt, für USt-pflichtige Betriebe fehlt die Aufteilung.
- [ ] Connector-SQL bei jedem neuen Demo-Konto wiederholen (`*_zugang`-Tabellen haben RLS ohne Policy, nur über den SQL-Editor befüllbar)

---

# TEIL J · Vertrieb und Wachstum

- [ ] **Influencer-/Affiliate-Programm**: Influencer bekommen das System, machen Werbung, Tracking-Link und Provision
- [ ] **Schäfer-Pilot** komplett neu ins integrierte System einklinken (vorher echte Daten sichern)
- [ ] Erste Kunden aus dem 698-Funnel onboarden

---

# TEIL K · Langfrist-Vision

Nicht für Donnerstag, aber festgehalten:

- Solar- und Wind-M&A in Rumänien, Bulgarien, Spanien, Portugal, Griechenland
- VESTA Stadtwerke
- Neobank-Leiter: Yapeal → Neon → N26 → Commerzbank
- Acht ARGONAUT CITIES: NOVA, KOSMOS, TERRA, VITA, MARE, SOLARIS, AURORA, HELIOS
- Hyperloop-EU-Netz
- **ARGONAUT Intelligence** — eigenes Llama-Fine-Tuning ab etwa 500 Kunden
- Mond 2040, Mars 2050
- *Verworfen: Kernkraft / PROMETHEUS — nur noch Solar und Wind*

---

# Was heute (03.08.) fertig wurde

- [x] Laufzeit-Rabatt rechnen — `lib/tarif.ts`, 24 Tests · Commit `d210ca8`
- [x] Laufzeit-Auswahl 12/24/36 in beiden Rechnern · Commit `87cdf51`
- [x] Gläubiger-ID beantragt und erhalten — DE31ZZZ00002934437
- [x] B2B-Klausel § 14 BGB, echter Bestellablauf, Vertragstext, SEPA-Vorabankündigung, Gerichtsstand · Commit `d849f99`
- [x] Rabatt-Prozente auf der Website sichtbar, FAIR_USE-Altlast entfernt · Commit `f95e905`
- [x] Preise angehoben, Standort-Zuschlag 49 €/190 € eingeführt · Commit `bafc0ae`
- [x] **Alle 698 Branchen-Dossiers erzeugt** — 7 Seiten, individuell je Branche, kein Seitenüberlauf
