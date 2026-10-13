# ARGONAUT · Startprompt SP-16 (13.10.2026, nach Feierabend 12.10. 23:30)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann weiterbauen: **P345 A0 Teil 1 fertig prüfen und liefern**, danach A0 Teil 2.
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat — in nummerierten Teilen von höchstens ca. 40–50 Zeilen (Supabase-Editor schneidet ab; eine Funktion bleibt ein Stück). Zusätzlich `chcp 65001 >nul && type "supabase-sql\pNNN-....sql" | clip` anbieten. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher Gerät = HEAD per md5 prüfen (CR entfernen).
- **Neu (P344):** `device_commit_files` NIE im selben Schritt parallel zu einem `cp` der Quelldatei starten (schrieb die alte Fassung). Nach dem Schreiben stagen und vergleichen.
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen (Inhalt = Repo-bauliste.html mit Kopf „PNNN live“). Wird der Publish abgelehnt: gespeicherte Live-Datei nehmen, nur die eigene Änderung einsetzen, erst `action: read`, dann publish.
- Ein anderer Chat (Gesprächs-Chat) ergänzt manchmal rows.py/gen.py/bauliste.html auf dem Gerät. Vor dem Schreiben immer Gerät gegen HEAD prüfen; nach Martins Push Klon mit origin abgleichen (git fetch, reset --soft origin/main, reset), nie überschreiben.
- Baulog: /areas/argonaut-bauliste-1012.md. Kontrollgang: /areas/argonaut-kontrollgang-2.md. Testtag: /areas/argonaut-testtag-3.md (fast voll, 42 von 48 KB — bei Bedarf testtag-4 anlegen). Anwalt: /areas/argonaut-anwalt-checkliste-2.md (fast voll, 45 von 48 KB — nächste Rechtsfrage in argonaut-anwalt-checkliste-3.md); nächste freie Anwalt-Nummer **R55**.
- GitHub-Fehler „remote rejected / fatal error in commit_refs“: Commit liegt lokal, NUR `git push` wiederholen.
- NICHT aus dem Klon pushen. Stop-Hinweis „uncommitted changes“ im Container ist bekannt.
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein eigener Cent-Runder — auch nicht im Kommentar (tests/centRundungP191).
- Neue Shop-Texte in lib/shopSprachen IMMER in TEXT_ZUSATZ_KEYS.
- Start-Schalter (lib/startSperre) immer zusätzlich als `SCHALTER startSperre.X = aus` + Tabellenzeile in docs/ARGONAUT-SPERR-GEDAECHTNIS.md **und** ab P345 ein Eintrag in `START_INFO` (lib/freigabeZentrale.ts).
- Martin braucht nach jedem Paket den Anfangs-CMD: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.
- Vercel-Fehler „Git information retrieval failed“ = kein Code-Fehler → „Redeploy“.
- Test-PG braucht Stubs auth.uid()/mein_chef_id()/darf_ich_modul_sehen/aendern und p181_besitzer; Rollen anon/authenticated/service_role sind clusterweit (beim zweiten DB-Anlegen nicht neu anlegen).
- next build nicht gleichzeitig mit npm test/tsc laufen lassen (SIGKILL = Speicher).

## Stand (12.10.2026, 23:30, Feierabend)
- Live: P344 (97d4dd7) Box-Konfigurator, SQL p344 live 5|20|11|5. BV3b komplett.
- Bauliste-Artifact Version 141 „P344 live“: 181 von 263 (69 %), 82 offen.
- Diese Datei ist untracked auf dem Gerät — mit P345 committen.

## P345 A0 Teil 1 Freigabe-Zentrale — GEBAUT, NICHT GELIEFERT
Gesichert auf dem Gerät unter `docs/wip-p345/` (gleiche Pfade wie im Repo, NICHT committen; nach dem Übernehmen den Ordner löschen lassen bzw. liegen lassen). Inhalt:
- `supabase-sql/p345-freigabe-zentrale.sql` (3 Teile; Kontrolle 2|2|2|0): freigabe_schalter (schluessel PK mit CHECK-Muster, an, vermerk, anwalt_frage, anwalt_antwort_datum, ausgeblendet; CHECK an nur mit Vermerk ≥ 20 Zeichen + Datum), freigabe_protokoll (Trigger schreibt jede Änderung, Protokoll per Trigger unveränderbar), RLS an, KEINE Regeln, revoke all von anon/authenticated → nur Server. Test-PG F1–F6 grün, zweimal ausführbar.
- `lib/freigabeZentrale.ts`: START_INFO/IMPORT_INFO (je Schalter Titel, was aus, Anwalt-Frage), alleSchalter() = 25 Einträge (11 Start, 4 Import schaltbar; Bestellstrecke, Zahlung, Kasse, 3 Dossier-Bereiche, 4 Teilbereiche nur Info), slug, zeilenMitStand (Teil 1: DB-Freigabe nur „vorgemerkt“, wirksam bleibt Code), uebersicht, freigebenPruefen, ausblendenBereit (drei Schritte), AKTION_TEXT.
- `app/api/admin/freigaben/route.ts`: betreiberPruefung + verlangt hatFaktor UND aal2; GET Katalog+Protokoll, POST freigeben/sperren/ausblenden (Name am Server geprüft)/einblenden, upsert, nichts gelöscht.
- `app/admin/command-center/freigaben/page.tsx` (Kacheln, Gruppen, Vormerken-Formular, Ausblenden in 3 Schritten mit Einfüge-Sperre, Protokoll) + Kachel „Freigabe-Zentrale“ in `app/admin/command-center/page.tsx`.
- `docs/ARGONAUT-SPERR-GEDAECHTNIS.md`: neuer Abschnitt „Freigabe-Zentrale im Command Center“.
- `tests/freigabeZentraleP345.test.mjs` (7 grün, 8 Gegenproben rot). npm test nur Win-1252 rot.
- Bauliste: Zeile 345 live + A0 Rest 1 Push, Kopf „_p345 unterwegs“, 182/263.
- **Offen vor dem Liefern:** tsc meldete zwei Fehler in lib/freigabeZentrale.ts (Vergleich `BESTELLSTRECKE_LIVE === true` bei Literal-Typ false) — repariert mit `Boolean(...)`, aber tsc und next build danach NOCH NICHT erneut gelaufen. Also: WIP vom Gerät übernehmen (md5 gegen docs/wip-p345 prüfen), Gerät-Dateien app/admin/command-center/page.tsx, docs/ARGONAUT-SPERR-GEDAECHTNIS.md, docs/bauliste/* gegen HEAD prüfen, dann tsc + Gegenprobe + next build + npm test, _p345.bat (inkl. Startprompt SP-16), SQL in 3 Teilen an Martin. Kein Aussperr-Risiko (nur neue Admin-Seite, Tabellen ohne Nutzer-Rechte).

## Danach: A0 Teil 2 (1 Push) — Freigabe wirksam machen
- Server-seitig `startFreiServer(bereich)` / `anwaltFreiServer`: Code an ODER freigabe_schalter.an (Service-Rolle, kurzer Cache ~60 s, jeder Fehler = gesperrt). In alle Server-Routen, die heute startFrei/anwaltSperrGrund prüfen (grep), einbauen; Client-Seiten bekommen den wirksamen Stand über eine kleine Route oder Server-Props. Code-Standard bleibt aus. Sperr-Gedächtnis-Text „wirkt noch nicht“ und Test anpassen. Vorsicht: „Freigeben“ öffnet rechtlich gesperrte Bereiche — nur Betreiber mit aal2.
- Dann weiter laut Bauliste: A1 Vorlagen-Prinzip (3), A2 Datei-Sicherung (1, dabei lib/sicherungTabellen.ts um Reife-, Vorbestell- und Box-Tabellen P339–P344 ergänzen), A3, A4a–i, A5, A6; C1, D1 zuletzt; EK1 nach dem Anwalt.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede http-URL eine @font-face-Regel 'DM Sans' mit src https://fonts.gstatic.com/mock.woff2) — in einem neuen Container neu anlegen.
  Build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- tsc: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` (≈ 3 Min.).
- Test-PG: /usr/lib/postgresql/16/bin; useradd -m pgu; initdb -D /home/pgu/data -A trust, Start `-o '-p 5499 -k /tmp'`.
- Container-Zeitzone Europe/Berlin — Zeitzonen-Gegenproben mit `TZ=UTC`.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Nach neuem Test `node scripts/tests-bauen.cjs`.
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, DANN (separater Schritt) device_commit_files (expectedMtimeMs bei bestehenden Dateien), danach stagen und vergleichen.
