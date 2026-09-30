# ARGONAUT OS – Startprompt SICHERHEIT-5 (30.09.2026 abends)

Hallo Claude, wir machen mit ARGONAUT OS weiter.

## Startritual
1. Beide Ordner anfordern: `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-0929.md` (Baulog, Ende = neuester Stand), `/areas/argonaut-kontrollgang.md` (NEU: Sammelliste für den Kontrollgang vor dem Testtag), `/areas/argonaut-testtag-3.md`, `/areas/argonaut-anwalt-checkliste-2.md`, Preferences.
3. Bauliste im Blick: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/rows.py`, `gen.py`; nach jedem Live-Push Zeile auf „live", `python3 gen.py`, mit url neu veröffentlichen, Dateien aufs Gerät, mit dem nächsten Paket committen).
4. Prüf-Klon in der Cloud (git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git, npm ci, PGlite für SQL). Nie aus dem Klon pushen.

## Stand
- Live bis **Paket 195** (e5cbb88). Heute live: 179 (61b0d14 + 6482a07), 194 (42a7a58), 195 (e5cbb88). 180 als Dokument erledigt. SQL p194 ok (21 Betriebe, RLS an).
- Bauliste V14: **13 von 56 Pushes (23 %)**. `docs/bauliste/*` und diese Datei liegen geändert/neu auf dem Gerät → mit dem nächsten Paket committen.
- **179 Musterbetrieb XXL**: Knopf im Command Center (nur Betreiber), Konto `musterbetrieb-xxl@demo.argonaut-os.com`, Zufallspasswort nur einmal angezeigt, 87 Seeder (Kern + 51 Branchen-Tabellen), Löschen über Register. Spalten wurden per information_schema-CSV von Martin in PGlite geprüft — **Methode für jede neue Tabelle beibehalten** (Schema-Abfrage an Martin, CSV, PGlite-Nachbau).
- **194 Grundausstattung**: `KERN_MODULE` = 53 Module für jeden Betrieb (Anfragen, ERP/Lager, Einkauf, Mahnwesen, DATEV, Personal, Schichtplan, Team-Chat, Marketing, Bewertungen, Nachweise, DSGVO …), Branchen-Pakete nur noch fachlich, Kalkulator im Handwerk-Paket. Alle 698 Branchen geprüft: 56–64 Module je Kategorie. Kein Modul kostet extra.
- **195 Testzugang**: „7 Tage kostenlos testen · Zugang anfordern" – /testen legt KEIN Konto an; Martin schaltet jeden Zugang selbst frei (Command Center → Branchen-Katalog → Kunde einladen, Testdauer per Demo-Tage). 7 Tage ab Freischaltung.
- **Verkaufsdossier Elektro** (11 Seiten, PDF in `gaspar-ai-system\ARGONAUT-Dossier-Elektrobetriebe.pdf`) = **Richtwert für alle 698 Branchen-Dossiers** (Paket B11, erst nach Kontrollgang). Quelle HTML lag nur in der Cloud-Session. Fachbeschreibung als Claude Doc: https://claude.ai/code/artifact/67d2ba7a-678e-460a-b4e7-f7e85f53b9e6

## Offen bei Martin
- Voyage-Opt-out im Dashboard setzen (DSE sagt „widersprochen").
- Supabase-Region bestätigen (DSE: Stockholm).
- **Speicher klären**: Martin sagte „1 TB inklusive"; tarif.ts + AGB sagen 100 GB je Mitarbeiter, 100-GB-Block 5 €.
- 7 oder 14 Tage Testdauer? Webseite sagt überall 7.
- Begründungen auf Dossier-Seite 9 bestätigen (Messwerte mit Praxis-Partnern, Großhändler-Zugänge, Mahnung erst mit eigener Absender-Domain, Partnerverträge Bank/DATEV/ELSTER).

## Reihenfolge ab jetzt (Claude-Empfehlung, Martin 30.09. zur Besprechung)
**Stufe 1 Rest (5 Pushes):**
1. **191 Cent-Rundung** (GEMEINSAM, Geld) – Rundung ohne Gleitkomma, 200.000 Fälle, bestehende Rechnungen unverändert.
2. **190 Zwei-Faktor-Pflicht je Betrieb** (GEMEINSAM, Aussperr-Risiko → getrennt liefern) – Schalter nur Inhaber, Häkchen Mitarbeiter informiert/Betriebsrat, 7 Tage Frist, Nachweis.
3. **192 Knopf-Abläufe + Glocke gezielter**.
4. **193 KI-Modelle zentral** (günstig intern, stärker für Kundentexte).
5. **188 Voice Layer Stufe 1** – erst wenn Martin Stimme geklont + ELEVENLABS-Schlüssel in Vercel.

**Stufe 2 (15 Pushes):** 182 Angebot-Link ab „versendet" → 181 Geld-/Personal-Seiten auf Betrieb → 185 Schreibrechte je Modul → 184 Dateien/Uploads/IBAN → 183 WhatsApp-Bestätigung → 186 Abläufe-Rest → 187 Sammelpaket (+ neu: Übungswelt-Mails auf example.com, Test-Mailstrecke erst ab Freischaltung starten) → **196 Elektro-Feinschliff** (Messwert-Felder, VDE 0100-600, Elektro-Startkatalog, Kalkulator-Beispiele, Rechte-Vorlage Monteur) → 164·3 Zwei-Faktor in der DB (Aussperr-Risiko) → 189 Voice Stufe 2 → 35–40 DSGVO-Werkzeuge nach Anwalt.

**Danach:** Entscheidungsrunde Block 2 → **Kontrollgang** (Liste `/areas/argonaut-kontrollgang.md`: Recht, Webseitentexte gegen Gebautes, Zahlen, Standorte) → Testtag → Stufe 3 (B1–B11, darunter B11 Dossier-Generator) + externe Partner.

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Prüf-Kette esbuild + tsc ganzes Projekt + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite; SQL additiv/idempotent komplett in den Chat; Aussperr-Risiken vorher nennen und getrennt liefern; GEMEINSAM = zeigen + sofort bauen; „Sie" in Kundentexten; „Bausteine"; keine Mitbewerber-Namen; CMD, nie PowerShell. Alles, was beim Bauen auffällt → sofort in `/areas/argonaut-kontrollgang.md`, nicht zwischendurch aufhalten. Supabase-Warnung „creates a table without RLS" bei `with … as (values …)` = Fehlalarm → „Run without RLS".
