# ARGONAUT · Startprompt KFZ-12 (09.10.2026 nachmittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
NICHT pushen aus dem Klon (Änderungen dort per git stash weglegen). Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100.
NEU: Bei zwei Pushes in einer Lieferung ausdrücklich sagen „_p2 erst starten, wenn _p1 ‚ist gepusht' meldet" — am 09.10. lief _p292 vor _p291 (Vercel rot, danach mit _p291 grün).

## Stand
- Live 09.10.: P289 F1a Führerscheinkontrolle · P290 F1b Fahrtenbuch + Ladestrom · P291 V1a Fahrzeugvermietung
  (/dashboard/verleih/fahrzeuge: Mietflotte, Kalender 14 Tage, Buchungen, Mietbedingungen; lib/fahrzeugMiete.ts) ·
  P292 V1b Mietvertrag (/dashboard/verleih/fahrzeuge/[id] + /vertrag Druckansicht, app/api/rechnung-aus-vermietung,
  19 Rechnung-aus-Wege). SQL supabase-sql/p291-fahrzeugvermietung.sql live (5|14|4|1|3|true).
- Tabellen: miet_fahrzeug, miet_einstellung, miet_buchung (EXCLUDE gist fahrzeug_id+zeitraum, Preise eingefroren,
  Wächter p291_buchung_waechter), miet_fahrer (Prüfvermerk ohne Nummer, DB rechnet), miet_schaden; Bucket „vermietung" privat.
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 89: 129 von 178 (72 %). Nächste freie Paketnummer: **P293**.

## Nächstes Paket: V2 Vermietung — Bußgelder, Auslastung, Online-Buchung (C, 1–2 Pushes)
Bauliste-Zeile V2 lesen (docs/bauliste/rows.py). Vorschlag Reihenfolge:
1. P293 intern: Halteranfrage/Bußgeld → Mieter zum Tatzeitpunkt finden (miet_buchung über Kennzeichen + Zeitpunkt,
   Übergabe–Rückgabe), Vorgang mit Frist und Bearbeitungsgebühr (Betrag vom Betrieb, Rechnung als eigener Posten),
   Fahrer benennen (Daten aus dem Vertrag, Anhörungsbogen-Text vom Betrieb); Auslastung und Ertrag je Fahrzeug
   (Miettage / Kalendertage, Netto aus Rechnungen), HU-/Wartungsfristen aus Fuhrpark (miet_fahrzeug.fahrzeug_id).
2. P294 Online-Buchung NUR als unverbindliche Anfrage (kein Bezahlen, keine Vertragsannahme online) in Börse/Webseite
   (K11a-Börse wiederverwenden, Datenschutz-Hinweis wie Börse) → landet als Reservierungs-Vorschlag; Preise für Verbraucher
   BRUTTO anzeigen (PAngV, siehe Kontrollgang). Verbindliche Online-Buchung/Zahlung erst nach Anwalt (Bestellstrecke dunkel).
Danach: Z1, T1, J1, N1, SP1.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`.
- Test-PG: Postgres 16 (/usr/lib/postgresql/16/bin; initdb -D /tmp/pgdata als postgres, -p 5499 -k /tmp/pg), Stubs: Rollen
  anon/authenticated/service_role, Schemas auth/storage/extensions, auth.uid() aus request.jwt.claim.sub, mitarbeiter(id,
  owner_user_id, auth_user_id), ma_recht, mein_chef_id, darf_ich_modul_aendern/sehen, fahrzeuge(id uuid), storage.buckets/objects/foldername;
  danach p291-SQL einspielen; nach jedem neuen SQL `grant all on all tables in schema public to authenticated`.
- npm test: 1 bekannter Container-Fehler (Windows-1252). _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1).
- guideWissen-Einträge nur für Seiten mit NAV-Eintrag; neue Unterseiten von /dashboard/verleih erben das Modul „verleih".
- Neuer rechnung-aus-*-Weg: Zähler in tests/darfAbrechnen + tests/b1b2GeldKontakte erhöhen; Seite braucht useDarfAbrechnen + „darfAbrechnen !== false".
