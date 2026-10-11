# ARGONAUT · Startprompt SP-1 (für 11.10.2026)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
- NICHT aus dem Klon pushen (nach Martins Push: git fetch + stash + ff-merge, Inhalt vergleichen, stash weg).
- Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100 (centRunden/rundeStellen aus lib/zahlen).
- Diese Datei ist auf dem Gerät noch nicht committet: mit dem nächsten Paket (P309) committen.

## Stand (10.10.2026 abends, Feierabend 23:10)
- Heute live: P297 bis P308. Kfz-Thema ist FERTIG.
  - P305 FM1 Fahrzeugmappe, P306 FM2 Händler antwortet.
  - P307 FM3 Auslesen und Übernahme (86a5413, kein SQL).
  - P308 FM4 Bewertungs-Empfehlung (3e1b000, SQL-Kontrolle 1|YES|3|1|6).
- Bauliste-Artifact Version 102: 145 von 188 (77 %), Kopf „P308 live · nächster SP1“ nur im Artifact.
- P307: Fahrzeugschein per KI auslesen. Es gibt nur Vorschläge zum Anhaken, keine Personendaten, höchstens 3 Versuche je Mappe (Drossel).
  Beim Ankaufen werden die Fotos der Mappe in die Fahrzeugakte kopiert (nie Schein, Unterlagen oder Botschaft).
- P308: Marktvergleich und DAT/Schwacke gibt es jetzt auch am Ankauf (kfz_marktvergleich.ankauf_id).
  lib/kfzEmpfehlung.ts rechnet mit den Zu- und Abschlägen des Betriebs (modul_einstellung „kfz-ankauf“ .zuschlaege, Start 0 %).
  Keine KI, kein geschätzter Preis.

## Nächstes Paket: P309 SP1 „Was ARGONAUT Ihnen gespart hat“ (1 Push)
- Bauliste-Zeile: Karte im Chef-Blick, nur mit MESSBAREN Werten:
  - genutztes Skonto
  - Verzugszinsen
  - ersetzte Programme laut Umzug (import_altsystem_wahl)
  - THG-Prämie
  - Importe statt Abtippen
- Freigabe zum Teilen (Social Media) nur mit Einwilligung des Betriebs.
- Erst am Code prüfen, wo der Chef-Blick liegt (PP Chef-Blick) und welche Zahlen wirklich belegt sind. Nichts schätzen.
  Stunden nur, wenn es eine belegte Quelle gibt (z. B. Zeit-Normwerte aus P300 lib/demoWachstum? — prüfen, sonst weglassen).

## Danach (offen, frei baubar)
- D1 Datensicherheit und Upgrade-Pfad (2, gemeinsam)
- C1 Einwilligungs-Fenster und Besucher-Tracking (2)
- BV2 Branchen-Vorlagen (4)
- PS-1 Preis-Spiegel für Dienstleister (1)
- BV2b Handel mit Einzelstücken (7)
- BV3 Manufaktur und Feinkost (6)
- Der Rest wartet auf Martin, den Anwalt oder Partner (siehe Bauliste).

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js als Proxy.
  Er liefert für jede URL `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`.
  Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=… NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- Klicktest:
  - Supabase-Attrappe (node http auf 54321, antwortet modul_einstellung/web_ci/profiles), dann `next start -p 3005`.
  - Playwright mit executablePath /opt/pw-browsers/chromium und page.route.
  - Server per PID stoppen.
- Test-PG:
  - Postgres 16 als Nutzer pgu: `initdb -D /home/pgu/data -A trust`, Start mit `-p 5499 -k /tmp`.
  - Stubs: Rollen anon/authenticated/service_role, auth.uid() aus test.uid, mein_chef_id (test.chef), darf_ich_modul_sehen/aendern (test.sehen/test.aendern), p181_besitzer, kfz_bestand.
  - Danach Grants auf authenticated.
- npm test: 1 bekannter Container-Fehler (Windows-1252).
  _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
