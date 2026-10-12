# ARGONAUT · Startprompt SP-8 (12.10.2026, Chatwechsel wegen Kontextlänge)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann sofort weiterbauen (P329 fertigstellen).
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher Gerät = HEAD per md5 prüfen (CR entfernen).
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen (der andere Chat hat EK1 ergänzt — muss erhalten bleiben). Baulog: /areas/argonaut-bauliste-1011.md. Kontrollgang: /areas/argonaut-kontrollgang-2.md. Anwalt: /areas/argonaut-anwalt-checkliste-2.md.
- NICHT aus dem Klon pushen (nach Martins Push: git fetch + reset --soft origin/main + reset, Inhalt vergleichen). Stop-Hinweis „uncommitted changes“ im Container ist bekannt — trotzdem nie selbst pushen.
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein eigener Cent-Runder — auch nicht im KOMMENTAR (tests/centRundungP191, max. 115).
- Neue Shop-Texte in lib/shopSprachen IMMER in TEXT_ZUSATZ_KEYS (sonst fallen freigegebene Sprachen aus dem Shop).
- Start-Schalter (lib/startSperre) immer zusätzlich als `SCHALTER startSperre.X = aus` + Tabellenzeile in docs/ARGONAUT-SPERR-GEDAECHTNIS.md (tests/sperrGedaechtnisP224).
- Diese Datei und docs/wip-p329/ liegen untracked auf dem Gerät. Diese Datei mit P329 committen; docs/wip-p329/ NICHT committen, nach P329 nur in der Antwort erwähnen, dass Martin den Ordner löschen kann.
- Martin braucht nach jedem Startbefehl den Anfangs-CMD: zuerst
  `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.
- Rechtzeitig vor zu langem Kontext Bescheid geben und den nächsten Startprompt schreiben.

## Stand (12.10.2026, 11:00)
- Live seit SP-7: P323–P328, alle SQL bestätigt. Letzter Commit f809958 (P328), Vercel Ready.
  - P323/P324 S4 Shop mehrsprachig (lib/shopSprachen, Seite Shop → Sprachen, public/shop.js Umschalter, Bestell-Sprache, Kunden-Mail EN).
  - P325/P326 S2 Gefahr-Angaben (lib/shopGefahr, Shop → Gefahr-Angaben, KI-Auslesen aus SDB; Anzeige im Shop, Schalter gefahrstoffShop aus).
  - P327 S3b Nur Gewerbekunden (lib/shopGewerbe, shopB2bServer ladeNurGewerbe fail-closed; Schalter gewerbeNachweis aus).
  - P328 S5 SDB mit Bestellbestätigung + Nachversand (lib/sdbVersand, Tabelle sdb_versand; Schalter sdbVersand aus).
- Bauliste: Artifact Version 124 „P328 live“, 165 von 206, 41 offen (+ EK1 ganz am Schluss nach dem Anwalt).
- Module: heute 115 buchbar (53 Kern), 214 Menüseiten; nach der Bauliste etwa 120–125 Module / ~230 Menüseiten.

## JETZT: P329 G2b Betriebsanweisungs-Entwurf (halb fertig — auf dem Gerät gesichert)
Der Container des alten Chats ist weg. Die fertigen Teile liegen auf dem Gerät unter docs/wip-p329/ (stagen, in den frischen Klon kopieren):
- `betriebsanweisung.ts.txt` → `lib/betriebsanweisung.ts` (ABSCHNITTE gefahren/schutz/gefahrfall/erstehilfe/entsorgung, LEER_INHALT notruf 112, SDB_ABSCHNITT, pAbschnitt P-Satz→Abschnitt, entwurf(g, angaben) nur vorhandener SDB-Wortlaut + Hinweise für leere Abschnitte, saubererInhalt, freigabeFehler, druckHtml TRGS-555-Rahmen orange, Wasserzeichen „ENTWURF“ solange nicht freigegeben). md5 im Klon war d201f560d9b342a9c79a9e4111597c07.
- `p329-betriebsanweisung.sql.txt` → `supabase-sql/p329-betriebsanweisung.sql` (Tabelle betriebsanweisung, unique gefahrstoff_id, Wächter p329_ba_waechter: Betrieb/Stoff fest, Stoff gehört zum Betrieb, Inhaltsänderung nach Freigabe → wieder entwurf, Freigabe nur Chef → version+1 + gefahrstoff.betriebsanweisung_am = heute; RLS Chef alles, MA lesen). Im Test-PG geprüft (T1–T6 grün). Kontrolle: 1 | 2 | 1. Aussperr-Risiko keines. md5 im Klon bfdbd6e81a21f3b98754be07555ff778.
- `p329-startsperre-und-sperrgedaechtnis.patch.txt` → mit `git apply` einspielen (startSperre `betriebsanweisung: false` + GRUND, Sperr-Gedächtnis SCHALTER-Zeile + Tabellenzeile).

Noch zu bauen:
1. Seite `app/dashboard/nachweise/gefahrstoffe/[id]/betriebsanweisung/page.tsx` (Stil wie gefahrstoffe/page.tsx: createBrowserClient, Farben C, karte/feld/knopf/primaer; istChef = !chef || chef === id): Gefahrstoff laden, artikel_gefahr über gefahrstoff.artikel_id, vorhandene betriebsanweisung; Knopf „Entwurf füllen“ (entwurf()), Textfelder je Abschnitt, Speichern als entwurf (upsert onConflict gefahrstoff_id), „Freigeben“ nur Chef und nur wenn startFrei('betriebsanweisung') sonst Grund-Text anzeigen, Druck über window.open + druckHtml. Hinweis „Entwurf ersetzt keine Gefährdungsbeurteilung“.
2. Link „📋 Betriebsanweisung“ je Zeile in app/dashboard/nachweise/gefahrstoffe/page.tsx (Knopfleiste neben „📄 SDB öffnen“, für alle sichtbar).
3. tests/betriebsanweisungP329.test.mjs + Gegenproben, `node scripts/tests-bauen.cjs`, npm test, tsc, build. Kein Guide-Eintrag (keine Menüseite).
4. Bauliste: G2b-Zeile („329“, live), nächster G2c, Kopf „_p329 unterwegs“; EK1 erhalten.
5. Gerät = HEAD f809958 prüfen, _p329.bat aus _p328.bat ableiten, Dateien schreiben, Martin SQL p329 komplett + CMD geben.

Danach: G2c Zusammenlagerungs-Ampel (TRGS 510, Schalter aus bis R49), dann PS-1, BV2b, BV3a/BV3b, C1, D1 zuletzt; EK1 nach dem Anwalt.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede http-URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- tsc: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` (dauert > 2 Min., Timeout hochsetzen).
- Test-PG: /usr/lib/postgresql/16/bin; useradd pgu; initdb -D /home/pgu/data -A trust, Start `-o '-p 5499 -k /tmp'`; Stubs: auth.uid() aus test.uid, mein_chef_id() aus test.chef, darf_ich_modul_* aus test.sehen/test.aendern, nachweis_name() über mitarbeiter.auth_user_id; Rollen anon/authenticated/service_role einmal je Cluster. Neue Tabellen brauchen im Test ein explizites grant (Supabase vergibt es selbst).
- Container-Zeitzone ist Europe/Berlin — Zeitzonen-Gegenproben mit `TZ=UTC` laufen lassen.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Nach neuem Test `node scripts/tests-bauen.cjs`. Guide-Einträge (lib/guideWissen) nur für Menü-Seiten.
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
- Bauliste: rows.py Zeile live setzen, gen.py-Kopf „_pNNN unterwegs“ committen; fürs Artifact eine Kopie mit Kopf „PNNN live“ erzeugen und mit url veröffentlichen.
