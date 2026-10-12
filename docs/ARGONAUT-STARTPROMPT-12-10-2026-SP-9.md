# ARGONAUT · Startprompt SP-9 (12.10.2026, Chatwechsel wegen Kontextlänge)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann sofort weiterbauen (PS-1).
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher Gerät = HEAD per md5 prüfen (CR entfernen).
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Wenn der Publish abgelehnt wird: die vom Tool gespeicherte Live-Datei kopieren, nur die eigene Änderung einsetzen, erst `action: read`, dann publish.
- Ein anderer Chat (Gesprächs-Chat) ergänzt manchmal rows.py/gen.py/bauliste.html auf dem Gerät. Vor dem Schreiben immer Gerät gegen HEAD prüfen; nach Martins Push Klon mit origin abgleichen (git fetch, reset --soft origin/main, reset) und Abweichungen übernehmen, nie überschreiben.
- Baulog: /areas/argonaut-bauliste-1011.md. Kontrollgang: /areas/argonaut-kontrollgang-2.md. Anwalt: /areas/argonaut-anwalt-checkliste-2.md.
- NICHT aus dem Klon pushen. Stop-Hinweis „uncommitted changes“ im Container ist bekannt — trotzdem nie selbst pushen.
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein eigener Cent-Runder — auch nicht im KOMMENTAR (tests/centRundungP191).
- Neue Shop-Texte in lib/shopSprachen IMMER in TEXT_ZUSATZ_KEYS.
- Start-Schalter (lib/startSperre) immer zusätzlich als `SCHALTER startSperre.X = aus` + Tabellenzeile in docs/ARGONAUT-SPERR-GEDAECHTNIS.md.
- Martin braucht nach jedem Paket den Anfangs-CMD: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.
- Vercel-Fehler „Git information retrieval failed“ = kein Code-Fehler → Martin klickt „Redeploy“.
- Rechtzeitig vor zu langem Kontext Bescheid geben und den nächsten Startprompt schreiben.

## Stand (12.10.2026, 14:00)
- Live: P329 (108eb81, SQL 1|2|1) G2b Betriebsanweisungs-Entwurf; P330 (685a8f8, Redeploy Ready, kein SQL) G2c Zusammenlagerungs-Ampel. Chemie-Bausteine komplett.
- Bauliste: Artifact Version 127 „P330 live“, 167 von 263 Pushes (63 %), 96 offen. Neu seit 12.10.: Abschnitt „Stufe 3f · Ampel-Beschluss“ (A0–A7) und AN1 — Beschluss in docs/strategie/ARGONAUT-BESCHLUSS-AMPEL-ANWALT-12-10-2026.md (Reihenfolge: alles fertig bauen → Testtag → Anwalt).
- G2c-Hinweis: Tabelle aus Abbild (skriptorium.eu) abgelesen, vor dem Einschalten mit amtlicher TRGS 510 abgleichen (Kontrollgang).

## JETZT: PS-1 Preis-Spiegel für Dienstleister (1 Push)
Bauliste: „Friseur, Gastronomie oder Handwerk wissen nicht, wo ihre Preise im Umfeld liegen. → Preise von Mitbewerbern von Hand erfassen (keine Namen von Personen, kein Auslesen), Marktmitte und Position wie im Kfz-Marktvergleich.“
Vorbild: lib/kfzMarkt.ts (Marktvergleich P276) + app/dashboard/kfz/preise. Erst Bestandsaufnahme (Skill argonaut-branchenmodul), dann reine Logik-Datei mit Tests, Seite, Menüeintrag (rechte.ts) + guideWissen, SQL additiv.

Danach in dieser Reihenfolge: BV2b Handel mit Einzelstücken (7), BV3a Manufaktur (3), BV3b Feinkost (3), dann Ampel-Beschluss A0 Freigabe-Zentrale (2) ff., C1, D1 zuletzt; EK1 nach dem Anwalt.

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
- Bauliste: rows.py Zeile live setzen, gen.py-Kopf „_pNNN unterwegs“ committen; fürs Artifact eine Kopie mit Kopf „PNNN live“ erzeugen und mit url veröffentlichen.
- Diese Datei liegt untracked auf dem Gerät — mit dem nächsten Paket (P331) committen.
