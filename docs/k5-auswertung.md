# K5 · Auswertung Zugriffsregeln (26.09.2026)

Quelle: docs/k5-befund.csv (Leseabfrage supabase-sql/k5-zugriffsregeln-befund.sql, 419 Tabellen).

## Ergebnis

1. **RLS ist bei allen 419 Tabellen an.** Keine Tabelle ist ohne Zugriffsschutz.
2. **Keine Tabelle ist für Anonyme offen.** Die 4 Tabellen mit „alle dürfen lesen" (academy_kurse, agents, automatisierungen, betreiber_flags) wurden am 12.09. bewusst auf angemeldete Nutzer verengt (supabase-sql/mandantentrennung-2-6.sql). Kein Kundendatum darin.
3. **22 Tabellen ohne jede Regel** = nur der Server kommt dran (Zugangsdaten, KI-Verbrauch, öffentliche Anfragen, Betreiber-Tabellen). Jede Stelle im Code, die sie liest, läuft über den Service-Schlüssel (geprüft). Richtig so.
4. **Befund für B1b:** Bei rund 20 Arbeitstabellen hat der Mitarbeiter keine Regel, um Daten des Betriebs zu sehen — er sieht dort nur, was er selbst angelegt hat:
   auftrag_positionen, aufgaben_kommentare, kontakt_aktivitaeten, kontakt_tags, kontakt_tag_zuordnung, projekt_beteiligte, projekt_teams, verkaufschancen, objekte, ressourcen, korrespondenz, post_vorgang, text_werk, geo_routen, benachrichtigungen, import_laeufe/import_zeilen, marketing_* (5), webinar_* (4), rueckhol_* (4), vertrieb_woche.
   Beispiel: Der Mitarbeiter sieht einen Auftrag des Chefs, aber keine Positionen darin.
   Bewusst nur Chef (so lassen): rechnung_*, zahlungen, ausgaben, immo_kaution, immo_mietanpassung, bildung_honorar, personal_vertrag, gobd_verfahrensdoku, verein_pauschale, web_seiten, web_ci, bewerber, gesundheit_freigabe.
   HR-Tabellen (hr_schichten, hr_zeiterfassung …) arbeiten mit eigener Regel über die Mitarbeiter-Kennung — kein Befund.

## Empfehlung

Punkt 4 als **B1b Gruppe 4** zusammen mit der offenen Entscheidung B1b-1 besprechen (SQL-Regel lesen/anlegen/ändern, kein Löschen — wie B1b Gruppe 3).
