# ARGONAUT · Startprompt SP-6 (11.10.2026, abends)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1011.md.
- NICHT aus dem Klon pushen (nach Martins Push: git fetch + reset --soft origin/main + reset, Inhalt vergleichen).
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein Math.round(x * 100) / 100.
- Diese Datei wurde mit P320 committet.
- Martin braucht nach jedem Startbefehl den Anfangs-CMD: zuerst
  `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.

## Stand (11.10.2026, abends)
- Heute live: P309–P319, P320 unterwegs (Q1).
- G2a Gefahrstoffverzeichnis 2.0 komplett: P318 (381880a, SQL p318 live Kontrolle 6|1|3|3|true|true — die 3. Regel ist p164s3_aal, harmlos), P319 (623f236, kein SQL: QR-Aushang, Handy-Ansicht /dashboard/mein-bereich/gefahrstoffe für alle Beschäftigten).
- P320 Q1 Prüfzertifikat je Charge: lib/chargenZertifikat.ts, Druckseite app/dashboard/chargen/[id]/zertifikat (Server prüft fail-closed: freigegeben + alle Merkmale i. O. + Prüfdatum + Freigabe-Name; 3.1 braucht Abnahmebeauftragten), Knopf „📜 Zertifikat“ in chargen/page.tsx, Freigabe ohne bestandene Prüfung nur mit Rückfrage + Vermerk in bemerkung; SQL p320 Wächter auf charge_verwendung (Ausgang an Quarantäne/gesperrt-Charge und Eingang mit Referenz = Chargennr. einer gesperrten Charge desselben Betriebs → Fehler 23514). Kontrolle 1 | 0.
- Bauliste: 157 von 206 (76 %) nach P320. Kopf in gen.py „_p320 unterwegs“; nach Push im Artifact „P320 live · nächster R1“.

## Nächstes: R1 Rezeptur in Prozent (2 Pushes)
Bauliste-Zeile: Anteile in Prozent, Ansatzgröße umrechnen, Versionen, Rohstoffkosten, Rohstoff in allen Rezepten tauschen, Ansatz → Charge. Ohne GHS-Berechnung. Allgemein für Farben/Lacke, Reinigungsmittel, Kosmetik, Seifen/Kerzen, Futter/Dünger, Baustoff-Mischungen, Brauerei/Destillerie.
Vor dem Bauen Bestand lesen: app/dashboard/rezeptur (Lebensmittel-Rechner: Teigausbeute, Backverlust, Food-Cost), zugehörige lib und SQL; Ansatz → Charge über charge_los (Status Quarantäne bis Endprüfung, Rohstoff-Chargen als Eingang — Wächter p320 beachten).
Danach: S4 (2), dann Stufe-2-Bausteine S2, S3b, S5, G2b, G2c (Schalter aus bis R49), dann PS-1, BV2b, BV3a/BV3b, C1, D1 zuletzt.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede http-URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack` (ohne NODE_OPTIONS einmal SIGKILL).
- Klicktest: Supabase-Attrappe (node http auf 54321, CORS + OPTIONS 204, eq.-Filter je Spalte nachbilden), Cookie sb-127-auth-token = "base64-" + base64url(Session-JSON), `next start -p 3005`, Playwright in eigenem Ordner (npm i playwright@1.56.1, executablePath /opt/pw-browsers/chromium). Server per PID stoppen — NICHT `pkill -f "next start"` im selben Befehl (trifft die eigene Shell).
- Test-PG: useradd pgu; initdb -D /home/pgu/data -A trust, Start `-o '-p 5499 -k /tmp'`; Stubs: auth.uid() aus test.uid, mein_chef_id() aus test.chef, darf_ich_modul_* aus test.sehen/test.aendern; Rollen anon/authenticated/service_role nur einmal je Cluster anlegen.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Nach neuem Test `node scripts/tests-bauen.cjs`. Guide-Einträge (lib/guideWissen) nur für Menü-Seiten (tests/guideWissenA2).
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
