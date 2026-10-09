# ARGONAUT · Startprompt KFZ-13 (09.10.2026 spätnachmittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
NICHT pushen aus dem Klon (Änderungen dort per git stash weglegen). Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100.
Bei zwei Pushes in einer Lieferung ausdrücklich sagen „_p2 erst starten, wenn _p1 ‚ist gepusht' meldet".

## Stand
- Live 09.10.: P289 Führerscheinkontrolle · P290 Fahrtenbuch + Ladestrom · P291/292 V1 Fahrzeugvermietung ·
  P293 V2a Bußgelder/Halteranfragen (miet_vorgang, DB ordnet Mieter zu, /dashboard/verleih/fahrzeuge/bussgelder,
  20. Rechnung-aus-Weg rechnung-aus-bussgeld) + Auslastung & Fristen (/dashboard/verleih/fahrzeuge/auslastung) ·
  P294 V2b Online-Anfrage (öffentlich /mieten/<kennung>, Tür /api/oeffentlich/miet-anfrage, miet_anfrage,
  Reiter „📨 Anfragen", Einstellung modul_einstellung „miet-online"; lib/mietOnline.ts, lib/mietOnlineLaden.ts).
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 91: 131 von 179 (73 %). Nächste freie Paketnummer: **P295**.
- Offen (Claude-Befund): /mieten läuft nur auf argonaut-os.com, nicht auf der Kunden-Domain (wie /fahrzeuge in P273 nachziehen).

## Nächstes Paket: Z1 Zweirad, E-Bike und Dienstrad-Leasing (C, 1 Push)
Bauliste-Zeile Z1 lesen (docs/bauliste/rows.py). Zuerst Bestandsaufnahme: was gibt es im Kfz-Bestand (kfz_bestand, sparte),
Werkstatt (werkstatt_*), Fahrzeugakte schon für Zweiräder? Dann: Rahmen- und Akkunummer, Inspektionen, Garantie,
Dienstrad-Vorgang (Angebot → Leasing-Portal → Übergabe → Rechnung an den Leasinggeber), Reparatur-Annahme.
Keine Leasing-Portal-Schnittstelle erfinden (Portal = Konto des Betriebs, Status von Hand).
Danach: T1, J1, N1, SP1.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`.
- Test-PG: Postgres 16 (/usr/lib/postgresql/16/bin; initdb -D /tmp/pgdata als postgres, -p 5499 -k /tmp/pg), Stubs: Rollen
  anon/authenticated/service_role, Schemas auth/storage/extensions, auth.uid() aus request.jwt.claim.sub, mitarbeiter(id,
  owner_user_id, auth_user_id), ma_recht, mein_chef_id, darf_ich_modul_aendern/sehen, fahrzeuge(id uuid), storage.buckets/objects/foldername;
  Hilfsfunktion fehler(sql, muster) für erwartete Fehler; nach jedem neuen SQL `grant all on all tables in schema public to authenticated`.
- npm test: 1 bekannter Container-Fehler (Windows-1252). _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1).
- Neue öffentliche Tür: in lib/offeneTueren.ts + lib/drossel.ts eintragen. guideWissen nur für Seiten mit NAV-Eintrag.
- Neuer rechnung-aus-*-Weg: Zähler (jetzt 20) in tests/darfAbrechnen + tests/b1b2GeldKontakte erhöhen; Seite braucht useDarfAbrechnen + „darfAbrechnen !== false".
