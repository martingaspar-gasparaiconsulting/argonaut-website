# ARGONAUT · Startprompt SP-3 (11.10.2026, mittags)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
- Ein zweiter Start einer schon gelaufenen _pNNN ist harmlos (nichts zu committen -> Abbruch ohne Push), trotzdem nur einmal starten.
- NICHT aus dem Klon pushen (nach Martins Push: git fetch + stash + ff-merge, Inhalt vergleichen, stash weg).
- Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100 (centRunden/rundeStellen aus lib/zahlen).
- Diese Datei ist mit P313 committet.
- Martin wiederholt nach jedem Startbefehl gern: „Ich brauche noch den Anfangs-CMD“ -> immer zuerst
  `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN` liefern.

## Stand (11.10.2026, mittags)
- Heute live: P309 SP1 Ersparnis, P310 Projekte, P311 Aufträge (4a50a39), P312 Kunden/CRM (d21ad80) nach Branchen-Vorlage.
- P313 BV2 Einsätze (Dispo + Meine Einsätze) ist mit diesem Startprompt auf dem Weg (_p313, kein SQL). Damit ist BV2 abgeschlossen.
- Gemeinsamer Vorlage-Haken: app/dashboard/_components/useBranchenVorlage.ts (Betrieb, Branche, modul_einstellung, statusLabel, sichtbar, spaltenLabel).
  Branchen-Erkennung zentral in lib/branchenVorlage.ts (RX_KANZLEI, RX_EVENT, RX_HANDWERK, RX_AGENTUR, RX_OBJEKT). Module mit Vorlage:
  kfz-bestand, projekte, auftraege, kontakte, einsaetze (tests/kfzBestandP259 prüft die Liste).
- NEU in der Bauliste: Abschnitt „Stufe 3e · Chemie und Shop-Bausteine“ (sid chem) aus docs/ARGONAUT-UEBERGABE-CHEMIE-SHOP-11-10-2026.md
  (mit P313 committet): CH1, S1, S3a, G2a, Q1, R1, S4 frei; S2, S3b, S5, G2b, G2c vorbauen und aus bis R49; CH-D1 wartet auf R46
  (umbenannt, weil D1 Datensicherheit ist). Bauliste nach P313: 150 von 205 (73 %).
- Bauliste-Artifact: Kopf im Repo „_p313 unterwegs …“; nach Live im Artifact „P313 live · nächster CH1“ setzen (nur im Artifact).

## Nächstes (Claude-Empfehlung, Martin hat nicht widersprochen)
1. CH1 Industrie-Paket + ehrliche Chemie-Texte (1 Push, kein SQL): `nachweise` und `etiketten` in KATEGORIE_MODULE „Industrie & Produktion“
   (lib/branchenkatalog.ts), Texte chemische-industrie in app/vorschau/_lib/branchen-web-extra.ts (~Z. 63) und branchen-seo.ts (~Z. 243)
   nur mit Gebautem (kein Labor-Modul, keine automatische Gefahrstoff-Doku, keine Echtzeit-Versprechen). Sperr-Gedächtnis/Tests P223/P240/P252
   zum Chemie-Dossier beachten (bleibt ohne Text).
2. S1 Produkt-Dokumente am Artikel (SQL + Push), 3. S3a Geschäftskunden-Shop, 4. G2a Gefahrstoffverzeichnis 2.0.
   Danach PS-1, BV2b, BV3, C1, Q1/R1/S4, Stufe-2-Bausteine (Schalter aus, Sperr-Gedächtnis P224), D1 ganz am Schluss.
- Offen (Claude-Befund): bestehende Kontakte haben fast alle Betreuungs-Intervall 30 — neuer Branchen-Takt gilt nur für neue Kontakte;
  ein Knopf „Takt für alle übernehmen“ (nur Chef, Rückfrage) wäre ein kleines Zusatzpaket.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- Klicktest: Supabase-Attrappe (node http auf 54321: /auth/v1/user liefert Nutzer, /rest/v1/<tabelle> liefert Zeilen,
  Accept vnd.pgrst.object -> erstes Objekt; CORS-Kopfzeilen + OPTIONS 204 nötig, sonst lädt die Seite nichts), Cookie sb-127-auth-token = "base64-" + base64url(Session-JSON),
  `next start -p 3005`, Playwright mit executablePath /opt/pw-browsers/chromium. Server per PID stoppen (nicht pkill -f, das trifft die eigene Shell).
- Test-PG: useradd pgu; Postgres 16 `initdb -D /home/pgu/data -A trust`, Start `-p 5499 -k /tmp`;
  Stubs: Rollen anon/authenticated/service_role, auth.uid() aus test.uid, mein_chef_id() aus test.chef.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Testbau übersetzt nur lib-Dateien, die Tests importieren
  (nach neuem Test `node scripts/tests-bauen.cjs`).
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
