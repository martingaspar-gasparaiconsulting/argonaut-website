# ARGONAUT · Startprompt KFZ-10 (09.10.2026 vormittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1007.md (fortschreiben).
NICHT pushen aus dem Klon. Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100.

## Stand
- Live 09.10.: P283 K16a Fahrzeugbestand-Import + Bewertung DAT/Schwacke (d06aa10, SQL 5/48/false) ·
  P284 K16b DATEV Kfz-Sonderfälle (9a01b32).
- P285 K17a Musterbetrieb mit Handelsbestand: mit _p285.bat unterwegs (kein SQL; diese Datei wird darin mitcommittet).
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T: 122 von 178 (69 %). Neue Blöcke heute:
  „Stufe 3c · Für alle Branchen" (RF1 Rechts-Freigaben-Zentrale, F1 Fuhrpark-Pflichten, J1 Jobticket/Dienstrad,
  N1 Betriebs-Netzwerk für alle, SP1 „Was ARGONAUT Ihnen gespart hat") und „Stufe 3d · Mobilität"
  (V1–V3 Fahrzeugvermietung inkl. Ortung über Partner nach RF1, Z1 Zweirad/Dienstrad, T1 Trackday, P1 Personenbeförderung),
  dazu E5 THG-Quote (Partner).
- Martins Grundsatz (09.10.): heikle Funktionen (Ortung usw.) nur, wenn der Betrieb die rechtlichen Voraussetzungen
  hinterlegt/bestätigt hat — ARGONAUT stellt die Plattform, immer rechtssicher.
- Nächste freie Paketnummer: **P286**.

## Nächstes Paket: K17b Kfz-Fachdossier
Dossier nach dem Elektro-Richtwert (lib/fachdossier.ts, Generator B11a/c): nur Gebautes K1–K18, K16 Import/DATEV,
Partner (carVertical, DAT, Schwacke) als „über Ihr eigenes Konto", Wartendes (mobile.de/AutoScout24-Export, Bericht per Knopf)
als „in Vorbereitung" mit Grund. Keine Mitbewerber-Namen, kein „alles inklusive", keine Agentur-Kosten.
Danach: RF1 Rechts-Freigaben-Zentrale (gemeinsam, Vorlagen nach dem Anwalt), dann F1, V1.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- Test-PG: Postgres 16 (initdb -D /tmp/pgdata als postgres, -p 5499 -k /tmp/pg), Stubs minimal (Rollen, auth.uid mit
  grant usage on schema auth, standorte, mein_chef_id, darf_ich_modul_*, darf_ich_abrechnen, p181_besitzer, werkstatt_auftraege).
- npm test: 1 bekannter Container-Fehler (Windows-1252). _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1).
