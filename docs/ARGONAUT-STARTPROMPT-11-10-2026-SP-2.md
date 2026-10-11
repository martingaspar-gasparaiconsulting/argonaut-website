# ARGONAUT · Startprompt SP-2 (11.10.2026, vormittags)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
- NICHT aus dem Klon pushen (nach Martins Push: git fetch + stash + ff-merge, Inhalt vergleichen, stash weg).
- Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100 (centRunden/rundeStellen aus lib/zahlen).
- Diese Datei ist auf dem Gerät noch nicht committet: mit dem nächsten Paket (P311) committen.
- Martin wiederholt nach jedem Startbefehl gern: „Ich brauche noch den Anfangs-CMD“ -> immer zuerst
  `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN` liefern.

## Stand (11.10.2026, 09:45)
- Heute live:
  - P309 SP1 „Was ARGONAUT Ihnen gespart hat“ (bc816f8, SQL 1|1|4|1|2): Karte im Chef-Blick, nur belegte Werte;
    Skonto am bezahlten Eingangsbeleg (Zahlungen), Tabelle ersparnis_angabe nur Chef, Teilen nur nach Einwilligung.
  - P310 BV2a Projekte nach Branchen-Vorlage (4228ada, kein SQL): lib/branchenVorlage.ts Modul „projekte“
    (Baustelle/Mandat/Veranstaltung/Kundenprojekt, Status-Schlüssel fest), lib/projektVorlage.ts (Ampel, Suchen),
    app/dashboard/projekte/ProjektAnsicht.tsx (Chef: Status-Namen, Kartenfelder, Achtung-Schwelle).
  - Bauliste: Reiter „Offen auf einen Blick“ ganz oben (Martins Wunsch), Handy-Überbreite der Bauliste behoben.
- Bauliste-Artifact Version 105: 147 von 188 (78 %), 41 offen. Kopf „P310 live · nächster BV2 Rest“ nur im Artifact
  (im Repo steht „_p310 unterwegs“ — beim nächsten Paket auf „_p311 unterwegs …“ setzen).
- D1 Datensicherheit bewusst ANS ENDE (Martin 05.10.: Anbieter und Upgrade-Stufen nach dem Bau).

## Nächstes: BV2 Rest (3 Pushes) — Muster wie P310
- Weitere Listen nach Branchen-Vorlage, Handwerk und Bau zuerst: Aufträge (app/dashboard/auftraege/page.tsx),
  dann Kunden (Kontakte) bzw. Einsätze. Gleiches Muster: VORLAGEN-Eintrag in lib/branchenVorlage.ts,
  Feinschliff-Regex umlautfest (siehe PROJEKTE_FEINSCHLIFF), reine Logik-Datei mit Tests, Ansicht-Panel nur Chef
  speichert modul_einstellung „<modul>“, Mitarbeiter lesen. Erst am Code prüfen, welche Status-Werte die DB erlaubt.
- tests/kfzBestandP259 prüft bekannteModule() — bei neuem Modul die Liste dort erweitern.
- Danach: PS-1 Preis-Spiegel (1), BV2b Handel mit Einzelstücken (7), BV3 Manufaktur und Feinkost (6),
  C1 Einwilligungs-Fenster (2, mit Anwalt-Punkt), ganz am Schluss D1.

## Kontrollgang (offen, neu heute)
- Skonto am Eingangsbeleg: Vorsteuer-Korrektur § 17 UStG macht der Steuerberater (DATEV-Export unverändert).
- Teilen-Einwilligung/Social-Media-Text (SP1) vom Anwalt prüfen lassen.
- Alle Dashboard-Seiten am Handy (390 px) seitlich ~815 px breit (Layout) — beim Querschnitt am Schluss.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`).
  Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- Klicktest: Supabase-Attrappe (node http auf 54321: /auth/v1/user liefert Nutzer, /rest/v1/<tabelle> liefert Zeilen,
  Accept vnd.pgrst.object -> erstes Objekt), Cookie sb-127-auth-token = "base64-" + base64url(Session-JSON),
  `next start -p 3005`, Playwright mit executablePath /opt/pw-browsers/chromium. Server per PID stoppen (nicht pkill -f, das trifft die eigene Shell).
- Test-PG: useradd pgu; Postgres 16 `initdb -D /home/pgu/data -A trust`, Start `-p 5499 -k /tmp`;
  Stubs: Rollen anon/authenticated/service_role, auth.uid() aus test.uid, mein_chef_id() aus test.chef.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Testbau übersetzt nur lib-Dateien, die Tests importieren
  (nach neuem Test `node scripts/tests-bauen.cjs`).
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
