# ARGONAUT · Startprompt KFZ-6 (08.10.2026 vormittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen (parallel kann ein Logo-Chat arbeiten).
Baulog in der Memory: /areas/argonaut-bauliste-1007.md (fortschreiben).

## Stand (Kfz-Pilot, Stufe 3b)
- Live: P270 K9 Probefahrt (e7c95a0, SQL 2/6/1/2/7) · P271 K10 Anfragen und Suchaufträge (94b93e0, SQL 2/8/2/2/7).
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 66: 108 von 139 Pushes (78 %), 31 offen, Kfz offen 15.
- Nächste freie Paketnummer: **P272**. Diese Datei ist untracked — mit P272 gezielt committen.
- Windows Defender: Martin hat den Ordner `...\argonaut-website\out` ausgenommen (Fehlalarm Trojan:Script/ObfusScript.A!ml
  auf out\kasse-tse.js). Wird ein Test „test at …:1:1 test failed" rot und fehlt out\<name>.js → zuerst Defender-Schutzverlauf.

## Gebaut in KFZ-5
- P270: kfz_rote_kennzeichen + kfz_probefahrt, lib/kfzProbefahrt.ts, Reiter „Probefahrt" (KfzProbefahrt.tsx), Seite
  /dashboard/kfz/probefahrt, Nachfass als Erinnerung (Tabelle erinnerung; aufgaben ohne Projekt sind nirgends sichtbar).
- P271: kfz_anfrage + kfz_suchauftrag (eigene Tabellen, NICHT leads), lib/kfzAnfrage.ts, Seite /dashboard/kfz/anfragen
  (?fahrzeug=<id>), KfzAnfrageHinweis in der Akte-Übersicht.

## Nächstes Paket: K11 Börsen und Online-Auftritt (P272) — Claude-Empfehlung
- Befund: lib/marktplatz.ts kennt nur Amazon/eBay/Kaufland/OTTO (Abgleich „in Aufbau"), nichts zu mobile.de/AutoScout24.
  Die Börsen-Schnittstellen brauchen einen Händler-Vertrag bzw. API-Zugang des Händlers → nicht ohne Partner baubar.
- Vorschlag: K11 teilen.
  K11a (jetzt): eigene öffentliche Fahrzeugbörse je Betrieb (/fahrzeuge/<kennung>, Kennung wie Online-Ankauf P264 in
  modul_einstellung), nur inserierte Fahrzeuge (inseriert=true, Status bestand/zulauf/aufbereitung), Fotos aus fahrzeug-medien
  (signierte URLs serverseitig), Detailseite mit Pflichtangaben (Energieverbrauch/CO2-Klasse aus K2), Anfrage-Formular → kfz_anfrage
  quelle 'website' (öffentliche Route in lib/offeneTueren + lib/drossel, Honeypot, Mail an Betrieb), noindex? (Martin fragen: soll
  Google die Börse finden → dann index + Fahrzeug-Strukturdaten). EK/Kalkulation nie öffentlich.
  K11b (Externe Partner): mobile.de/AutoScout24 über das Konto des Händlers — in der Bauliste nach „Externe Partner" verschieben.
- Danach: K12 Markt und Preis (2), K13 Brief-Tresor, K18 Partner-Netzwerk (2), K14, K15, K16, K17, BV2.

## Arbeitsumgebung (kein device_bash)
- Klon /home/claude/klon (klon-arbeit, Push gesperrt): `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- SQL-Test: Postgres 16 (initdb als postgres, Port 5499, Socket /tmp/pg; nach Neustart postmaster.pid löschen). Stubs: Rolle authenticated,
  auth.uid() über `set test.uid`, auth.role() über `set test.role`, mitarbeiter_stub(user_id, chef, sehen, aendern, abrechnen),
  standorte, auftraege; dann p181-besitzer-betrieb-3, modul6-r1-rechnungen, p259, p261, p263, p265, p266, p267, p268, p270, p271;
  `grant usage on all sequences in schema public to authenticated`. Jedes SQL zweimal + RLS-Fälle.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Wächter: nie `Math.round(x*100)/100`, kein eigener Zahlen-Leser → leseZahl;
  öffentliche Routen in lib/offeneTueren.ts + lib/drossel.ts; neue rechnung-aus-* Route → Zähler in b1b2GeldKontakte + darfAbrechnen.
- _pNNN.bat aus der vorigen ableiten (CRLF, GIT_LITERAL_PATHSPECS=1 wegen [id]); Gegenproben-Skript: Ersetzung eindeutig.
