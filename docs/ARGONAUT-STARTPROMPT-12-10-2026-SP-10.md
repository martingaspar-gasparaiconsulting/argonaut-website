# ARGONAUT · Startprompt SP-10 (12.10.2026, Chatwechsel wegen Kontextlänge)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann sofort weiterbauen (BV2b Teil 2).
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat — lange Blöcke in ZWEI Teilen (Supabase-Editor schneidet beim Einfügen ab, P331: „syntax error at end of input“). Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher Gerät = HEAD per md5 prüfen (CR entfernen).
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen (Inhalt = Repo-bauliste.html mit Kopf „PNNN live“). Wird der Publish abgelehnt: gespeicherte Live-Datei nehmen, nur die eigene Änderung einsetzen, erst `action: read`, dann publish.
- Ein anderer Chat (Gesprächs-Chat) ergänzt manchmal rows.py/gen.py/bauliste.html auf dem Gerät. Vor dem Schreiben immer Gerät gegen HEAD prüfen; nach Martins Push Klon mit origin abgleichen (git fetch, reset --soft origin/main, reset), nie überschreiben.
- Baulog: /areas/argonaut-bauliste-1011.md. Kontrollgang: /areas/argonaut-kontrollgang-2.md. Testtag: /areas/argonaut-testtag-3.md. Anwalt: /areas/argonaut-anwalt-checkliste-2.md.
- NICHT aus dem Klon pushen. Stop-Hinweis „uncommitted changes“ im Container ist bekannt — trotzdem nie selbst pushen.
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein eigener Cent-Runder — auch nicht im KOMMENTAR (tests/centRundungP191).
- Neue Shop-Texte in lib/shopSprachen IMMER in TEXT_ZUSATZ_KEYS.
- Start-Schalter (lib/startSperre) immer zusätzlich als `SCHALTER startSperre.X = aus` + Tabellenzeile in docs/ARGONAUT-SPERR-GEDAECHTNIS.md.
- Martin braucht nach jedem Paket den Anfangs-CMD: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.
- Vercel-Fehler „Git information retrieval failed“ = kein Code-Fehler → Martin klickt „Redeploy“.
- Rechtzeitig vor zu langem Kontext Bescheid geben und den nächsten Startprompt schreiben.

## Stand (12.10.2026, ~15:00)
- Live: P331 (a4f955a, SQL 2|9|4|2) PS-1 Preis-Spiegel (Leistungskatalog → 📊 Preis-Spiegel, lib/preisSpiegel.ts).
- P332 BV2b Teil 1 gebaut, _p332.bat auf dem Gerät (SQL p332: kfz_bestand + art, merkmale jsonb, betriebsstunden, seriennr; Kontrolle 4|4|0). Falls noch nicht gepusht: Martin führt SQL p332 + `_p332` aus. Danach Bauliste-Artifact „P332 live“ (169 von 263).
- Diese Datei liegt untracked auf dem Gerät — mit P333 committen.

## Was P332 gebaut hat (Grundlage für den Rest)
- lib/einzelstueck.ts: ARTEN kfz, boot, maschine, uhr_schmuck, kunst_antik, fahrrad, sonstig; artDef(art) mit begriffe (einheit, titel, ident, zaehler km/betriebsstunden/null, herstellerWort, modellWort, datumWort), kfzTeile (probefahrt, briefTresor, zulassung, co2, fin), merkmale (MerkmalDef key/label/typ/optionen/einheit/min/max/oeffentlich), gwg; artFuerBranche, merkmaleSauber (leseZahl), merkmalText, oeffentlicheMerkmale (Positivliste), seriennrPruefen, betriebsstundenPruefen, gwgPruefung(art, merkmale, betrag, bar).
- lib/branchenVorlage.ts: Vorlage.art; Feinschliffe Boote (art boot, Wortgrenze), Land-/Baumaschinen/Stapler, Uhren/Schmuck, Kunst/Antik, Fahrrad, Second Hand.
- lib/kfzBestand.ts: Bestand + art/merkmale/betriebsstunden/seriennr (optional), regelPasst kennt bh und art.

## JETZT: BV2b Rest (6 Pushes), Reihenfolge
1. Bestand-Liste app/dashboard/kfz/bestand/page.tsx nach Art: Art aus vorlage.art (bzw. Auswahl je Stück), Formular-Wörter aus begriffe, Pflicht „Hersteller oder Modell“, Kennung = FIN nur bei kfzTeile.fin sonst seriennr, Zähler km oder betriebsstunden, Spalten nach Art (SPALTEN-Konstante Z. 44 um art, merkmale, betriebsstunden, seriennr ergänzen). Rückfall ohne SQL p332 (Spalte fehlt → wie bisher).
2. Akte app/dashboard/kfz/bestand/[id] nach Art: Merkmale-Karte (merkmaleSauber beim Speichern), Kfz-Teile ausblenden (Probefahrt, Brief-Tresor, Zulassung, CO₂/Pkw-EnVKV) wenn kfzTeile false.
3. Börse/Inserat: lib/kfzBoerseLaden.ts BOERSE_SPALTEN + oeffentlicheMerkmale (nur Positivliste), CO₂ nur bei kfz.
4. Verkauf: lib/kfzVerkauf.ts GwG-Grenze je Art über gwgPruefung (heute fest bar 10.000 € Z. 27/169).
5. Freischaltung: Modul kfz für Land-/Baumaschinen-, Kunst-, Uhren-, Antiquitäten-, Second-Hand-Handel (lib/branchenkatalog.ts KATEGORIE_MODULE bzw. lib/pakete.ts) — Menü-Wörter („Fahrzeugbestand“) je Art. Prüfen, ob additiv (kein Aussperren).
6. Feinschliff/Test-Rest, Guide-Einträge (guideWissen) für die Kfz-Seiten um Einzelstücke ergänzen.
Danach: BV3a Manufaktur (3), BV3b Feinkost (3), Ampel-Beschluss A0 Freigabe-Zentrale (2) ff., C1, D1 zuletzt; EK1 nach dem Anwalt.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede http-URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- tsc: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` (> 2 Min.).
- Test-PG: /usr/lib/postgresql/16/bin; useradd pgu; initdb -D /home/pgu/data -A trust, Start `-o '-p 5499 -k /tmp'`; Stubs auth.uid()/mein_chef_id() aus test.uid/test.chef; Rollen anon/authenticated/service_role; neue Tabellen im Test explizit granten.
- Container-Zeitzone Europe/Berlin — Zeitzonen-Gegenproben mit `TZ=UTC`.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Nach neuem Test `node scripts/tests-bauen.cjs`. Guide-Einträge nur für Menü-Seiten.
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
- Bauliste: rows.py — bei Mehr-Push-Paketen eine neue Zeile ('NNN', …, 'live') vor die Paket-Zeile und deren Pushes um 1 senken; gen.py-Kopf „_pNNN unterwegs“ committen; fürs Artifact Kopie mit Kopf „PNNN live“ veröffentlichen.
