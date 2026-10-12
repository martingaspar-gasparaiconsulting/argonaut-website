# ARGONAUT · Startprompt SP-11 (12.10.2026, Chatwechsel wegen Kontextlänge)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann sofort weiterbauen (BV2b Feinschliff, letzter BV2b-Push).
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat — lange Blöcke in ZWEI Teilen (Supabase-Editor schneidet beim Einfügen ab, P331: „syntax error at end of input“). Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher Gerät = HEAD per md5 prüfen (CR entfernen).
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen (Inhalt = Repo-bauliste.html mit Kopf „PNNN live“). Wird der Publish abgelehnt: gespeicherte Live-Datei nehmen, nur die eigene Änderung einsetzen, erst `action: read`, dann publish.
- Ein anderer Chat (Gesprächs-Chat) ergänzt manchmal rows.py/gen.py/bauliste.html auf dem Gerät. Vor dem Schreiben immer Gerät gegen HEAD prüfen; nach Martins Push Klon mit origin abgleichen (git fetch, reset --soft origin/main, reset), nie überschreiben.
- Baulog: /areas/argonaut-bauliste-1011.md. Kontrollgang: /areas/argonaut-kontrollgang-2.md. Testtag: /areas/argonaut-testtag-3.md. Anwalt: /areas/argonaut-anwalt-checkliste-2.md.
- GitHub-Fehler „remote rejected / fatal error in commit_refs“ beim Push: Commit liegt lokal, NUR `git push` wiederholen, _pNNN NICHT neu starten.
- NICHT aus dem Klon pushen. Stop-Hinweis „uncommitted changes“ im Container ist bekannt — trotzdem nie selbst pushen.
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein eigener Cent-Runder — auch nicht im KOMMENTAR (tests/centRundungP191).
- Neue Shop-Texte in lib/shopSprachen IMMER in TEXT_ZUSATZ_KEYS.
- Start-Schalter (lib/startSperre) immer zusätzlich als `SCHALTER startSperre.X = aus` + Tabellenzeile in docs/ARGONAUT-SPERR-GEDAECHTNIS.md.
- Martin braucht nach jedem Paket den Anfangs-CMD: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.
- Vercel-Fehler „Git information retrieval failed“ = kein Code-Fehler → Martin klickt „Redeploy“.
- Rechtzeitig vor zu langem Kontext Bescheid geben und den nächsten Startprompt schreiben.

## Stand (12.10.2026, ~17:00)
- Live: P332 bis P336 (BV2b Teile 1–5). P336 = 2c35ac3.
- P337 BV2b Teil 6 Freischaltung gebaut, _p337.bat auf dem Gerät (kein SQL). Falls noch nicht gepusht: Martin führt `_p337` aus. Danach Bauliste-Artifact „P337 live“ (174 von 263, 89 offen).
- Diese Datei liegt untracked auf dem Gerät — mit P338 committen.

## Was BV2b bisher gebaut hat
- lib/einzelstueck.ts (P332): ARTEN, artDef (begriffe, kfzTeile, merkmale, gwg), artFuerBranche, merkmaleSauber, oeffentlicheMerkmale, gwgPruefung.
- lib/einzelstueckBestand.ts (P333–P337): stueckArt, formFelder, datum*, zaehlerText, kennungText, merkmaleKurz, spaltenNachArt, stueckZeile (schreibt nur sichtbare Felder), akteTeile/akteReiterAus/merkmaleListe/merkmaleZahl/akteUnterzeile, einzelstueckHandelZusatz, kfzMenueLabel, hubNachArt, ART_SYMBOL.
- Seiten: kfz/bestand (Liste+Formular), kfz/bestand/[id] (Akte, Reiter je Art), lib/kfzBoerse (BOERSE_SPALTEN_P332, oeffentlich nach Art, fakten/kurzZeile/strukturDaten), lib/kfzVerkauf (gwgInfo/gwgNoetig(v, stueck), pruefen nach Art), kfz/verkauf, kfz/page (Hub nach Art), DashboardNav (Menü-Wort), admin/branchen (brancheModule).
- lib/kfzAkte inseratAmpel(a, einzelstueck?) — Merkmale statt CO₂.

## JETZT: BV2b Feinschliff (1 Push), dann weiter
1. app/fahrzeuge (BoerseAnsichten): „Alle Fahrzeuge“, „keine Fahrzeuge eingestellt“, „Kein Fahrzeug passt“ in den Wörtern der Art des Betriebs (Art aus vorlageFuer('kfz-bestand', branche) des Betriebs; Laden in lib/kfzBoerseLaden firmaZu o. ä.).
2. app/dashboard/kfz/preise: inseratAmpel mit { merkmale } für Einzelstücke (Spalten art, merkmale mit Rückfall laden).
3. lib/guideWissen: Einträge für kfz/bestand und kfz um Einzelstücke ergänzen (Guide nur Menü-Seiten).
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
