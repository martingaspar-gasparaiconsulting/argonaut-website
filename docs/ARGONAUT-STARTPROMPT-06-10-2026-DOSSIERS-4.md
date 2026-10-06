# ARGONAUT · Startprompt DOSSIERS-4 (06.10.2026, nachts)

Nahtlos weiter mit den Fachdossiers, Welle 2. Alle Regeln aus den früheren Startprompts gelten unverändert:
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, „Sie", „Bausteine" (nie „KI-Agenten"),
nur CMD, Deutsch, Schritt für Schritt, nur bei „Feierabend" stoppen. Nur gebaute Funktionen nennen; keine Zahlen-/Prozentversprechen,
keine Garantien, keine Wettbewerber, kein „inklusive", kein „kostet extra", kein Agenturvergleich, nie „10.000" (VERBOTEN).
Titel-Kopf ≤ 36 Zeichen; titel, rolle, ablaufTitel, lead müssen eindeutig sein (Test P218) — vorher mit grep prüfen.

**Wichtig:** Während Martin eine _pNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben (der Commit nimmt sie sonst mit).
Erst schreiben, wenn origin/main den vorigen Commit zeigt; dann Gerät = origin/main prüfen.

## Stand
- P233 bis P239 live (P239 = db84f29). P240 Industrie Welle 2 liegt auf dem Gerät (_p240.bat).
- **228 von 698 Dossiers mit Text** (nach P240).
- 🟡-Teilbereiche fertig: alle freien Betriebe haben Text, außer `schuetzen-schiesssportverein` (Sperr-Gedächtnis).
- Seit P234: lib/dossierFreigabe.ts OHNE_IN_TEILBEREICH (shop, kasse) + seit P237 ZUSAETZLICH_OHNE (Sport: wellness).

## Zurückgestellt nur in den Wellen-Tests (zusätzlich zu DOSSIERS-3)
Dienstleistungen W2: schadensanierung-wasser-brand, callcenter-telefonservice, personalvermittlung.
Industrie W2: luft-raumfahrt, bergbau.

## Nächste Reihenfolge (Welle 2, je 10 nach Betriebszahl)
Fahrzeuge (P241) → IT → Energie → Logistik → Immobilien → Marketing → Landwirtschaft → Bildung → Kultur.
Vor jeder Welle: Paket-Module mit kern.mjs prüfen und NUR diese nennen (Befunde bisher: Verleih nicht im Sport-Paket,
Wartung nicht im IT-Paket, Tour/Aufmaß nicht im Agrar-Paket).

## Ablauf je Welle (Werkzeuge in docs\intern\dossier-werkzeug, in den Container nach /tmp/wz stagen; Klon neu klonen, npm ci)
1. liste.mjs / ohne.mjs "<Bereich>" (Slugs ohne Text), kern.mjs "<Bereich>".
2. /tmp/w/p2NN.py mit b(...), welle_vorlage.py → /tmp/welle.ts → vor dem letzten `};` von FACH_TEXTE einfügen.
3. render.mjs, messen.py (keine Seite > 283), pdf.py → alle PDFs per SendUserFile (attach).
4. tests/fachdossierP2NN.test.mjs nach Muster P239/P240 (Vorsicht-Regex: Groß/Klein beachten, z. B. RoHS vs. Rohstoffe,
   CE- vs. Service-, Prüfung vs. Konfliktprüfung, Steuer vs. Steuerung). Gegenproben gezielt auf die Zeile (sed mit Zeilennummer).
5. npm test (1 bekannter Container-Fehler Windows-1252), tsc, next build (webpack, Font-Mock mit /* latin */ + .woff2-URL, Platzhalter-Env).
6. _p2NN.bat aus _p233.bat ableiten (CRLF), commit_files mit expectedMtimeMs. Klon danach per git stash leeren (Stop-Hook).
