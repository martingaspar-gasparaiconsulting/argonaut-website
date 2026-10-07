# ARGONAUT · Startprompt KFZ-4 (07.10.2026 abends)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Parallel kann ein Logo-Chat am Repo und an der Bauliste arbeiten — vor jedem Bauliste-Publish das Artifact lesen und vergleichen.

## Stand (Kfz-Pilot, Stufe 3b)
- Live: P266 K6 Verkaufsunterlagen (3b0a77d, SQL ok) · P267 Stornorechnung als Beleg (1c01c51, SQL ok).
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 62: 104 von 138 Pushes (75 %), Kfz offen 18.
- Nächste freie Paketnummer: **P268**. Diese Datei ist untracked — mit P268 gezielt committen.

## Gebaut in KFZ-3
- P266: Tabelle kfz_verkauf (je Fahrzeug nur EIN nicht stornierter Vorgang, Inzahlungnahme-Ankauf nur einmal),
  lib/kfzVerkauf.ts (Beträge, Bar-Summe/GwG ab 10.000 €, Prüfungen je Status, 6 Unterlagen, Text für ARGONAUT-Sign),
  lib/kfzVerkaufPdf.ts, Reiter „Verkauf" in der Handelsakte (app/dashboard/kfz/bestand/KfzVerkauf.tsx),
  Übersicht /dashboard/kfz/verkauf. Kaufvertrag → Bestand „verkauft" + vk_erzielt in kfz_bestand_kalk (wenn leer).
- P267: rechnungen.storno_zu, Funktion p267_storno_erstellen (security invoker, nur Chef, eigene Nummer,
  Positionen mit negativer Menge, festgeschrieben, Original „storniert"), Trigger p267_storno_schutz,
  lib/stornoRechnung.ts, PDF-Route (Titel Stornorechnung, Verweis, kein Zahlbetrag/GiroCode), Rechnungsseite.

## Nächstes Paket: K7 Rechnung Fahrzeugverkauf (Kern-Geld, GETRENNT liefern)
- Aus kfz_verkauf (Status vertrag/uebergeben) eine Rechnung in `rechnungen` + `rechnung_positionen` anlegen,
  Muster: app/api/rechnung-aus-werkstatt/route.ts (Betrieb, standort_id, empfaenger_name, Storno statt Löschen bei Positionsfehler).
- § 25a: Fahrzeugposition OHNE USt-Ausweis, Pflichthinweis „Gebrauchtgegenstände/Sonderregelung" (§ 14a Abs. 6 UStG),
  Zusatzleistungen (Zulassung, Überführung) mit 19 % gesondert — Steuerberater-Frage (Nebenleistung?) in Kontrollgang.
  Regelsteuer: normal 19 %. Inzahlungnahme = KEINE Minderung der Rechnung (eigener Ankauf), nur Zahlungshinweis.
  EU-Lieferung an Unternehmer mit USt-IdNr (steuerfrei § 4 Nr. 1b, Hinweis) und Ausfuhr (§ 4 Nr. 1a, Nachweis) — prüfen, was rechnungen/PDF/XRechnung schon können (reverse_charge, ust_id_kunde, rechnungsart).
- Live-Spalten von `rechnungen` stehen NICHT vollständig im Repo (standort_id, empfaenger_name, reverse_charge, rechnungsart …) — am Code der rechnung-aus-*-Routen und der PDF-Route ablesen.
- Doppelschutz: kfz_verkauf.rechnung_id (eindeutig) oder Prüfung „gibt es schon".
- Danach: K9 Probefahrt, K10 Leads, K11 Börsen … K18 Partner-Netzwerk nach K13.

## Offene Hinweise (Kontrollgang, Auszug)
- Storno: Original + Stornorechnung beide „storniert" → zählen nicht in UStVA/EÜR (rückwirkend) — Steuerberater.
- XRechnung einer Stornorechnung: Typ 380 mit negativen Beträgen — prüfen.
- K6-Vertragstexte = Vorlagen (Anwalt R45); Fernabsatz-Widerruf fehlt; Anzahlung bei Regelsteuer = USt bei Zahlung.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git /home/claude/klon`,
  `npm ci`. Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- SQL-Test: Postgres 16 (initdb als postgres, Port 5499, Socket /tmp/pg). Stubs: Rolle authenticated, auth.uid() über
  `set test.uid`, auth.role() über `set test.role`, Tabelle mitarbeiter_stub(user_id, chef, sehen, aendern, abrechnen) für
  mein_chef_id/darf_ich_modul_*/darf_ich_abrechnen, p181_besitzer, standorte, auftraege — dann p259, p261, p263, p265, p266,
  modul6-r1-rechnungen, p197 (Teil ab Zeile 84), p267; simulierte Live-Spalten an rechnungen ergänzen. Jedes SQL zweimal + RLS-Fälle.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Wächter: nie `Math.round(x*100)/100` (centRunden/rundeStellen),
  kein eigener Zahlen-Leser → leseZahl; öffentliche Routen in lib/offeneTueren.ts + lib/drossel.ts.
- _pNNN.bat aus der vorigen ableiten (CRLF, GIT_LITERAL_PATHSPECS=1 wegen [id]), Gegenproben-Skript: Ersetzung muss eindeutig sein.
