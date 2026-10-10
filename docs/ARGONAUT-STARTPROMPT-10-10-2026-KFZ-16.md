# ARGONAUT · Startprompt KFZ-16 (10.10.2026, nachmittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
NICHT pushen aus dem Klon (Änderungen dort per git stash weglegen). Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100.
Bei zwei Pushes in einer Lieferung ausdrücklich sagen „_p2 erst starten, wenn _p1 ‚ist gepusht' meldet".

## Stand
- Live 10.10. (Ausreißer für Martins erste Kundentermine, Vorführung): P297–P300.
  P297 Vorführ-Autohaus Renz mit Kfz-Fachdaten (07389d4) · P298 Premium-Autohaus Valtier (96709fb, 50 Mitarbeiter, ~500 Verkäufe, Media-Abteilung)
  · P299 Zeitreise im Command Center (9ce44af, großer Block + Kachel, kfzstart leer) · P300 Zeitreise für jede Branche (4d1cd0a):
  lib/demoWachstum.ts (Wachstums-Motor, 18 Monate, eigene Rechnungsnummern je Betrieb), lib/demoWachstumProfile.ts (19 Profile,
  Stufe 1 *start leer, Stufe 3 *plus voll; Handwerk vorn: malerplus Farbwerk Steinhauser, heizungplus Kälber Gebäudetechnik),
  lib/demoZeitreise.ts, Seite /admin/demo-betriebe („Alle 20 Zeitreisen anlegen“ Reihe für Reihe). Alle Logins: <slug>@demo.argonaut-os.com / <slug>2026.
- Martin testet die Zeitreisen gerade selbst (Maler zuerst). Meldet er Hinweise aus dem Bericht (z. B. unbekannte Spalte), dann
  gezielt nachbessern — die Grundtabellen-Spalten (rechnungen, auftraege.auftragsnummer, angebote.angebotsnummer, mitarbeiter.abteilung,
  created_at/erstellt_am) sind nicht gegen den Live-Aufbau geprüft, nur gegen Musterbetrieb-XXL-Spalten.
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T: 138 von 184 nach P301 (neu veröffentlichen, sobald P301 live ist), 46 offen. Naechste freie Paketnummer: **P302**.
  gen.py-Kopf im Repo steht noch auf „_p301 unterwegs“ — beim naechsten Paket auf „_p302 unterwegs“ setzen.
- Offen (Claude-Befund, Kontrollgang): sendeMail sperrt example.com / demo.argonaut-os.com nicht (kleines eigenes Paket);
  Vorführ-Betriebe ohne echte Fahrzeugfotos; /mieten nur auf argonaut-os.com, nicht auf der Kunden-Domain.
- P301 (nach P300, gleicher Tag): Menü-Unterseiten erben das Eltern-Modul (lib/rechte navModul — Trinkgeld/Trackday standen beim Autohaus
  im Menü und leiteten auf die Startseite), tote Links behoben, Wächter-Test tests/navUnterseitenP301.
- Später (Martins Wunsch): Stufe 3 der Zeitreise je Branche vertiefen wie Kfz-Premium, Handwerk zuerst; „gesparte Stunden“-Kachel (passt zu SP1).

## Naechstes Paket: J1 Jobticket, Dienstrad und Mobilitaetszuschuss (C, 1 Push) — reguläre Bauliste
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
- Neuer rechnung-aus-*-Weg: Zähler (jetzt 22) in tests/darfAbrechnen + tests/b1b2GeldKontakte erhöhen; Seite braucht useDarfAbrechnen + „darfAbrechnen !== false".
