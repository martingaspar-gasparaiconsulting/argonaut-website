# ARGONAUT · Startprompt KFZ-3 (07.10.2026 nachmittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Parallel kann ein Logo-Chat am Repo und an der Bauliste arbeiten — vor jedem Bauliste-Publish das Artifact lesen und vergleichen.

## Stand (Kfz-Pilot, Stufe 3b)
- Live: P263 K4a Ankauf (42c1c4c) · P264 K4b Ankaufschein + Online-Ankaufformular (41eef52).
- **P265 K5 Kalkulation und Provision** auf dem Gerät (_p265.bat + SQL supabase-sql/p265-kfz-kalkulation.sql:
  Tabellen kfz_bestand_kosten und kfz_bestand_kalk). Wenn noch nicht gepusht: SQL ausführen, dann `_p265`.
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 60: 102 von 137 Pushes (74 %), Kfz offen 19.
- Nächste freie Paketnummer: **P266**. Diese Datei ist untracked — mit P266 gezielt committen.

## Gebaut (Dateien)
- lib/kfzAnkauf.ts (Prüfprotokoll, Schäden, Bewertung § 25a/Regel, zuBestand, Online-Formular, Ankaufschein-Inhalt), lib/kfzAnkaufPdf.ts
- app/dashboard/kfz/ankauf/page.tsx + [id]/page.tsx · app/ankauf/[kennung] (öffentlich) · app/api/oeffentlich/kfz-ankauf
- lib/kfzKalkulation.ts (Erlös § 25a nur auf Differenz, Rohertrag, Gemeinkosten, Provision rohertrag/umsatz/fest, kostenSummen ohne Doppelzählung)
- app/dashboard/kfz/bestand/KfzKalkulation.tsx = Reiter „Kalkulation" in der Handelsakte
- Tabellen: kfz_ankauf, kfz_bestand_kosten (Recht kfz), kfz_bestand_kalk (nur Chef oder darf_ich_abrechnen)
- modul_einstellung: „kfz-ankauf" {richtwerte, online{aktiv,kennung}}, „kfz-kalk" {gemeinkostenProzent}

## Nächste Pakete (Reihenfolge Bauplan)
1. **K6 Verkaufsunterlagen** (G, 1 SQL): Angebot, Kaufvertrag Verbraucher/Unternehmer, Reservierung, Anzahlung,
   Zulassungsvollmacht, Empfangsbescheinigung, **Inzahlungnahme aus dem Ankauf verrechnet**; Unterschrift über
   ARGONAUT-Sign (/dashboard/signaturen); GwG-Hinweis ab 10.000 € bar (Modul /dashboard/kfz/gwg steht). Rechtsfragen R45.
2. **Stornorechnung/Gutschrift als Beleg VOR K7** (Kern-Geld) · K7 Rechnung § 25a (getrennt) · K9 … K17 · K18 Partner-Netzwerk nach K13.

## Offene Hinweise (Kontrollgang, Auszug)
- Einkaufspreis für alle Mitarbeiter mit KFZ-Leserecht sichtbar (Bestand, Ankauf, Kalkulation-Plan) → eigenes Recht „Einkaufspreise sehen"?
- Schaden-Richtwerte sind Claude-Startwerte; Höchstpreis- und Kalkulationsformeln → Steuerberater.
- Online-Ankaufformular: Link auf Datenschutz/Impressum des Betriebs fehlt, keine Fotos.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git /home/claude/klon`,
  `npm ci`. Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- SQL-Test: Postgres 16 (initdb als postgres, Port 5499, Socket /tmp/pg) mit Stubs: Rolle authenticated, auth.uid() über
  `set test.uid`, Tabelle mitarbeiter_stub(user_id, chef, sehen, aendern, abrechnen) für mein_chef_id/darf_ich_modul_*/darf_ich_abrechnen,
  p181_besitzer, standorte — dann p259, p261, p263, p265 einspielen; jedes SQL zweimal + RLS-Fälle.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Wächter: nie `Math.round(x*100)/100` (centRunden/rundeStellen),
  kein eigener Zahlen-Leser (`replace(',', '.')`) → leseZahl; öffentliche Routen in lib/offeneTueren.ts + lib/drossel.ts.
- _pNNN.bat aus der vorigen ableiten (CRLF, GIT_LITERAL_PATHSPECS=1 wegen [id]), nach Lieferung Klon `git stash -u`.
