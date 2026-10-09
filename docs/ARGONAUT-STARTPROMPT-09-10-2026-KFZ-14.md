# ARGONAUT · Startprompt KFZ-14 (09.10.2026 abends)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
NICHT pushen aus dem Klon (Änderungen dort per git stash weglegen). Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100.
Bei zwei Pushes in einer Lieferung ausdrücklich sagen „_p2 erst starten, wenn _p1 ‚ist gepusht' meldet".

## Stand
- Live 09.10.: P289–P294 (Führerschein, Fahrtenbuch, Vermietung V1/V2a/V2b) ·
  P295 Z1 Zweirad, E-Bike und Dienstrad-Leasing (59823d7): Tabellen zweirad, zweirad_garantie, dienstrad_vorgang,
  werkstatt_auftraege.zweirad_id; lib/zweirad.ts; Seiten /dashboard/werkstatt/zweirad (+[id], dienstrad, _teile/stil.ts,
  _teile/RadFormular.tsx); 21. Rechnung-aus-Weg app/api/rechnung-aus-dienstrad (Empfänger Leasinggeber). Rechte Modul „werkstatt".
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 92: 132 von 179 (74 %). Nächste freie Paketnummer: **P296**.
- Offen (Claude-Befund): /mieten läuft nur auf argonaut-os.com, nicht auf der Kunden-Domain (wie /fahrzeuge in P273 nachziehen).

## Nächstes Paket: T1 Trackday, Rennschule, Kartbahn (C, 1 Push)
Bauliste-Zeile T1 lesen (docs/bauliste/rows.py). Zuerst Bestandsaufnahme: Veranstaltungen (app/dashboard/veranstaltungen,
rechnung-aus-veranstaltung), Online-Buchung, Signaturen (Modul „signaturen"), Vermietung V1 (miet_fahrzeug) — was lässt sich andocken?
Dann: Event mit Startplätzen/Gruppen, Teilnehmer, Haftungsverzicht (eigener Text des Betriebs, KEIN Mustertext; digitale Unterschrift
über vorhandenes Signatur-Modul, falls passend), Leihfahrzeuge aus V1, Teile mit Laufzeit je Teil (Stunden/Runden), Sponsoren und Gäste.
Haftungsverzicht = Anwalt-Thema (Kontrollgang eintragen).
Danach: J1, N1, SP1.

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
