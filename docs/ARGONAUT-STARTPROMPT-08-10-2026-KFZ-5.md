# ARGONAUT · Startprompt KFZ-5 (für den 08.10.2026)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Parallel kann ein Logo-Chat am Repo und an der Bauliste arbeiten — vor jedem Bauliste-Publish das Artifact lesen und vergleichen.
Baulog in der Memory: /areas/argonaut-bauliste-1007.md (fortschreiben).

## Stand (Kfz-Pilot, Stufe 3b)
- Live: P268 K7 Rechnung Fahrzeugverkauf (7b7e941, SQL ok 5/4/2/1) · P269 UStVA mit § 25a, EU, Ausfuhr (803ddc8, kein SQL).
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 64: 106 von 139 Pushes (76 %), 33 offen, Kfz offen 17.
- Nächste freie Paketnummer: **P270**. Diese Datei ist untracked — mit P270 gezielt committen.

## Gebaut in KFZ-4
- P268: rechnungen.steuer_sonderfall (diff25a|eu_ig|ausfuhr), empfaenger_anschrift, vorab_bezahlt, diff_bemessung, diff_steuer;
  kfz_verkauf.rechnung_id (eindeutig) + lieferung. lib/kfzRechnung.ts, lib/steuerSonderfall.ts, lib/rechnungAnschrift.ts,
  Route app/api/rechnung-aus-kfz-verkauf (18. Rechnung-aus-Weg), PDF-Route (Pflichthinweis § 14a Abs. 6, Empfänger-Anschrift
  jetzt auf jedem PDF), zugferd (E/K/G + VATEX), rechnung-e (vorab = BT-113), Karte „Rechnung" im Reiter Verkauf.
- P269: lib/ustva.ts — § 25a-Marge in Kz 81, Differenzsteuer in Zahllast, EU Kz 41, Ausfuhr Kz 43; ELSTER-Seite lädt 0-%-Anteil aus den Positionen.

## Nächstes Paket: K9 Probefahrt und Vorführwagen (P270)
- Bauliste: Probefahrt-Vertrag, Führerschein, Rücknahme mit km, Ersatzwagen, Überführung, rote Kennzeichen; Nachfass startet automatisch.
- Vorher am Code prüfen: Fuhrpark/Verleih (was gibt es schon?), ARGONAUT-Sign (signaturStarten), Nachfass/Abläufe, kfz_bestand.
- Führerschein: nur Haken „geprüft" + Klasse/Ablaufdatum, KEINE Nummer, kein Foto (wie Ausweis im Verkauf). Anwalt R45.
- Danach: K10 Leads, K11 Börsen, K12 Markt (2), K13 Brief-Tresor, K18 Partner-Netzwerk (2), K14, K15, K16, K17, BV2.

## Offene Hinweise (Kontrollgang, Auszug)
- Zulassung/Überführung bei § 25a als Nebenleistung? Preis bei EU-Kunden netto/brutto? — Steuerberater.
- UStVA zählt nur „bezahlt" (teilbezahlt fehlt); EÜR/DATEV behandeln § 25a noch nicht gesondert.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git /home/claude/klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- SQL-Test: Postgres 16 (initdb als postgres, Port 5499, Socket /tmp/pg). Stubs: Rolle authenticated, auth.uid() über `set test.uid`,
  auth.role() über `set test.role`, mitarbeiter_stub(user_id, chef, sehen, aendern, abrechnen) für mein_chef_id/darf_ich_*,
  standorte, auftraege; dann p181-besitzer-betrieb-3, modul6-r1-rechnungen, p259, p261, p263, p265, p266, p267, p268;
  `grant usage on all sequences in schema public to authenticated`; simulierte Live-Spalten an rechnungen ergänzen. Jedes SQL zweimal + RLS-Fälle.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Wächter: nie `Math.round(x*100)/100` (centRunden/rundeStellen),
  kein eigener Zahlen-Leser → leseZahl; öffentliche Routen in lib/offeneTueren.ts + lib/drossel.ts; neue rechnung-aus-* Route → Zähler in
  tests/b1b2GeldKontakte + tests/darfAbrechnen anpassen.
- _pNNN.bat aus der vorigen ableiten (CRLF, GIT_LITERAL_PATHSPECS=1 wegen [id]), Gegenproben-Skript: Ersetzung muss eindeutig sein.
