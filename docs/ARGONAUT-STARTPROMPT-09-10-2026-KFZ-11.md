# ARGONAUT · Startprompt KFZ-11 (09.10.2026 nachmittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog NEU: /areas/argonaut-bauliste-1009.md (1007 ist voll).
NICHT pushen aus dem Klon (Änderungen dort per git stash weglegen). Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100.

## Stand
- Live 09.10.: P285 Musterbetrieb Handelsbestand · P286 Kfz-Fachdossier neu (Zusatzseite „Ihr Fahrzeughandel im Detail",
  nur Gebautes nach Regel P217) · P287 RF1a Rechts-Freigaben-Zentrale (/dashboard/rechtliche-freigaben, 6 Funktionen,
  12 Monate, Protokoll) · P288 RF1b (Rangliste nur mit Freigabe, Baustein app/dashboard/_components/RechtsFreigabe.tsx,
  Cron /api/cron/rechts-freigaben 30 Tage vor Ablauf) · P289 F1a Führerscheinkontrolle (/dashboard/erp/fuhrpark/fuehrerschein,
  DB-Sperre über rechts_freigabe_besteht()).
- P290 F1b Fahrtenbuch + Ladestrom: mit _p290.bat + SQL p290-fahrtenbuch-ladestrom.sql unterwegs (diese Datei im P291-Commit mitnehmen).
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T: 127 von 178 (71 %). Nächste freie Paketnummer: **P291**.

## Nächstes Paket: V1 Fahrzeugvermietung Kern (C, 2 Pushes)
Bauliste-Zeile V1 lesen (docs/bauliste/rows.py). Vorhandenes prüfen: Modul „verleih" (Rechnung-aus-verleih), Reservierung,
Kfz-Bestand, Fuhrpark (fahrzeuge). Mietvertrag, Übergabe/Rücknahme mit Schäden und km/Tank, Kaution, Führerschein-Prüfvermerk
des Mieters (ohne Nummer), Rechnung. Ortung erst V3 (wartet), immer über Rechts-Freigabe „ortung".
Danach: V2 Online-Buchung/Bußgelder/Auslastung, Z1, T1, J1, N1, SP1.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack` (bricht er mit SIGKILL ab: einfach nochmal starten).
- Test-PG: Postgres 16 (initdb -D /tmp/pgdata als postgres, -p 5499 -k /tmp/pg), Stubs: Rollen anon/authenticated/service_role,
  auth.uid() aus request.jwt.claim.sub, mitarbeiter(id, owner_user_id, auth_user_id), mein_chef_id, darf_ich_modul_aendern
  (Tabelle ma_recht), fahrzeuge(id uuid); nach jedem neuen SQL `grant all on all tables in schema public to authenticated`.
- npm test: 1 bekannter Container-Fehler (Windows-1252). _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1).
- guideWissen-Einträge nur für Seiten mit NAV-Eintrag (Test „Jeder Eintrag gehoert zu einer echten Menue-Seite"); werText von Chef-Seiten muss „Chef" enthalten.
