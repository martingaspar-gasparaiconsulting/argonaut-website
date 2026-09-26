# ARGONAUT OS · Startprompt — Endspurt (ab 26.09.2026 mittags)

Hallo Claude, ich bin Martin. Neuer Chat, Fortsetzung.
Bitte zuerst: beide Ordner anfordern (Skill argonaut-chatstart), dann lesen:
dieses Dokument, `docs/ARGONAUT-OFFENE-PUNKTE.md` (die EINE Liste), das Gedächtnis
`/areas/argonaut-bauliste-0925.md` (unterer Teil ab „F-Paket") und `/areas/argonaut-testtag-2.md`.

## 1. Stand (26.09.2026)
- Live: Paket F (F1–F22), K1–K5, G1–G5, B1b Gruppe 4 (SQL bestätigt). Letzter Commit vor _p117: 55f45c1.
- _p117 (G6–G8 + SQL g7-sepa-vermerk) wurde ausgeliefert — prüfen, ob gelaufen (git log / Vercel).
- Nächste freie Bat: **_p118**.
- Liste: 42 von 50 erledigt. Offen: G9–G14, B1b-2 (Geld-Stellen des Besitzer-Fehlers), B1c (eigene Felder übrige Seiten).
- Martin hat am 26.09. entschieden: **alle Empfehlungen von Claude annehmen**, nahtlos durchbauen („Endspurt"). Trotzdem je G-Punkt kurz Fehler + Lösung nennen.
- Danach GANZ AM ENDE: drei Test-Checklisten (Betreiber / Kunde-Chef / Mitarbeiter) mit Testtagen, Abgleich mit Anwalt-Checkliste (Teil 1 + 2, zuletzt R27/R28), dann Brainstorming.

## 2. Arbeitsweise im Container
- Repo direkt klonen: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git`, `npm ci`.
- Prüf-Kette: `node scripts/tests-bauen.cjs && node --test "tests/*.test.mjs"`, `npx tsc --noEmit -p tsconfig.json` (echte Pakete), Gegenproben (Datei auf HEAD zurück -> Test rot), Typfehler-Gegenprobe.
- Vor dem Schreiben Gerätestand stagen und gegen GitHub vergleichen. Dateien per Bridge schreiben, eigene _pNN.bat (nie überschreiben, [id]-Pfade mit `:(literal)`).
- Nach dem Ausliefern die Prüfkopie mit `git stash` beiseitelegen (Stop-Hook meckert sonst) — nie aus dem Container pushen.
- LEHREN: Supabase-select-Ergebnis nie neu zuweisen (eigene Variablen, sonst Next-Build-Typfehler); Massen-Textersetzungen können Bezeichner und select-Strings treffen — gezielt prüfen.

## 3. Offene Claude-Befunde (notiert)
- Import-Center: Mitarbeiter-Importe gehören dem Mitarbeiter (kontakte ohne Anlege-Regel) -> zu B1b-2/B1c.
- Zahlenfelder mit `value={zahl}` lassen kein Komma tippen (Rezeptur behoben, Rest offen).
- Rechnungs-Libs (abschlagsrechnung, sicherheitseinbehalt, skonto, bauleistung, ustIdNr) noch mit ae/oe/ue in Texten.
- Rechnung-PDF liest Firmendaten des angemeldeten Nutzers (Mitarbeiter -> leer) -> B1b-2.
