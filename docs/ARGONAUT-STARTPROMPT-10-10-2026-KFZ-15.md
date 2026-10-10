# ARGONAUT · Startprompt KFZ-15 (10.10.2026)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
NICHT pushen aus dem Klon (Änderungen dort per git stash weglegen). Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100.
Bei zwei Pushes in einer Lieferung ausdrücklich sagen „_p2 erst starten, wenn _p1 ‚ist gepusht' meldet".

## Stand
- Live 09.10. (17 Pakete an einem Tag): P280–P296. Zuletzt P296 T1 Trackday, Rennschule, Kartbahn (da5da3d, SQL-Kontrolle 6|24|7|2|6|true):
  Tabellen ms_event, ms_gruppe, ms_teilnehmer, ms_gast, ms_teil, ms_einsatz; lib/motorsport.ts; Seiten /dashboard/veranstaltungen/motorsport
  (+[id], [id]/starterliste, teile, _teile); 22. Rechnung-aus-Weg app/api/rechnung-aus-trackday; Mietflotte + kart/rennfahrzeug (NUR_STRECKE, nie oeffentlich).
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 93: 133 von 179 (74 %), 46 offen (26 frei baubar, 20 warten). Naechste freie Paketnummer: **P297**.
- gen.py-Kopf „P296 live · naechster J1" steht nur im Artifact — im Repo beim naechsten Paket auf „_p297 unterwegs" setzen.
- Untracked auf dem Geraet, mit P297 per gezieltem git add mitcommitten: diese Datei UND docs/strategie/ARGONAUT-Masterplan-Medienhaus-Vertrieb-09-10-2026.pdf.
- Offen (Claude-Befund): /mieten laeuft nur auf argonaut-os.com, nicht auf der Kunden-Domain (wie /fahrzeuge in P273 nachziehen).

## Naechstes Paket: J1 Jobticket, Dienstrad und Mobilitaetszuschuss (C, 1 Push)
Bauliste-Zeile J1 lesen (docs/bauliste/rows.py). Bestandsaufnahme: Personal/Lohn-Notizen, Dienstrad-Vorgang (P295, dienstrad_vorgang),
Fahrtenbuch (P290), Belege. Keine Steuer-Pauschalen erfinden — steuerfrei/pauschal nur als Hinweis „mit Steuerberater klaeren" (Kontrollgang).
Danach: N1 Betriebs-Netzwerk fuer alle (2), SP1 „Was ARGONAUT Ihnen gespart hat" (1), dann D1, C1, BV2, PS-1, BV2b, BV3.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`.
- Test-PG: Postgres 16 (/usr/lib/postgresql/16/bin; initdb -D /tmp/pgdata als postgres, -p 5499 -k /tmp/pg), Stubs: Rollen
  anon/authenticated/service_role, Schemas auth/storage/extensions, auth.uid() aus request.jwt.claim.sub, mitarbeiter(id,
  owner_user_id, auth_user_id), ma_recht, mein_chef_id, darf_ich_modul_aendern/sehen, nötige Fremdtabellen als Stub;
  Hilfsfunktion fehler(sql, muster) für erwartete Fehler; nach jedem neuen SQL `grant all on all tables in schema public to authenticated`.
- npm test: 1 bekannter Container-Fehler (Windows-1252). _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1).
- Device-Schreiben: Dateien nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
- Neue öffentliche Tür: in lib/offeneTueren.ts + lib/drossel.ts eintragen. guideWissen nur für Seiten mit NAV-Eintrag (Tests prüfen das).
- Neuer rechnung-aus-*-Weg: Zähler (jetzt 21) in tests/darfAbrechnen + tests/b1b2GeldKontakte erhöhen; Seite braucht useDarfAbrechnen + „darfAbrechnen !== false".
