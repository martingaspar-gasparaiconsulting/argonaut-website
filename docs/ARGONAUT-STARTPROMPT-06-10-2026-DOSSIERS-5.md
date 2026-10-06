# ARGONAUT · Startprompt DOSSIERS-5 (06.10.2026, nachts)

Nahtlos weiter mit den Fachdossiers, Welle 2. Alle Regeln aus DOSSIERS-4 gelten unverändert:
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, „Sie", „Bausteine" (nie „KI-Agenten"),
nur CMD, Deutsch, Schritt für Schritt, nur bei „Feierabend" stoppen. Nur gebaute Funktionen nennen; keine Zahlen-/Prozentversprechen,
keine Garantien, keine Wettbewerber, keine Plattform-Marken, kein „inklusive", kein „kostet extra", nie „10.000" (VERBOTEN).
Titel-Kopf ≤ 36 Zeichen; titel, rolle, ablaufTitel, lead müssen eindeutig sein (Test P218) — vorher prüfen.
Während Martin eine _pNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Erst schreiben, wenn origin/main den vorigen Commit zeigt;
dann Gerät = origin/main per md5 prüfen.

## Stand
- P241 bis P246 live (P246 = 0a8e05f). P247 Landwirtschaft Welle 2 liegt auf dem Gerät (_p247.bat).
- **297 von 698 Dossiers mit Text** (nach P247). Rund 206 gesperrt (Handel, Recht, Gastro, Sport, Lebensmittel, Tiere, Gesundheit) bis Anwalt.
- Werkzeug-Zählung: /tmp/wz/zaehl.mjs (frei ohne Text / gesperrt je Bereich).

## Zurückgestellt nur in den Wellen-Tests (seit DOSSIERS-4)
Fahrzeuge: kfz-sachverstaendige-gutachter. IT: it-sicherheit-kmu, kassensysteme-pos, datenschutzberatung-ext-dsb.
Energie: nachhaltigkeit, sonderabfall-gefahrgutentsorgung, altlasten-bodensanierung, energieversorger-stadtwerke, stromnetze-netzbetrieb.
Logistik: luftfracht-seefracht-spedition, zoll-aussenhandelslogistik, werttransport-geldlogistik, schwer-grossraumtransport, silo-tanktransport, lebendtier-tiertransport.
Immobilien: franchise, immobilien-asset-management, wohnungsgenossenschaft (P229). Immobilien damit frei komplett.
Marketing: promotion-dialogmarketing, marktforschungsinstitut, castingagentur. Agrar: Tierhaltung, Wein, Kräuter/Heilpflanzen, Landhandel, Kompost.

## Noch frei (Welle 3)
Marketing ~19, Fahrzeuge ~21, Kultur 28, Bildung 18, Industrie ~18, Dienstleistungen ~17, IT ~10, Logistik 3 (taxi, winterdienst-raeumlogistik,
schienengueterverkehr), Energie 1 (wasserstoff erledigt; Rest zurückgestellt), Agrar ~4 (pilzfrei: almwirtschaft? Tier -> zurück).
Nächste Reihenfolge: P248 Bildung W2 → Kultur W2 → Marketing W3 → Fahrzeuge W3 → Industrie W3 → Dienstleistungen W3 → IT W3.

## Ablauf je Welle (Werkzeuge in docs\intern\dossier-werkzeug, in den Container nach /tmp/wz stagen; Klon neu klonen, npm ci)
1. liste.mjs x, ohne.mjs "<Bereich>", kern.mjs "<Bereich>"; Paket-Module am Code prüfen (Befunde: Verleih nicht in Sport/Logistik,
   Wartung nicht in IT/Agrar, Housekeeping/Aufgaben nicht in Immobilien, Tour/Aufmaß/Leistungskatalog nicht in Agrar).
2. /tmp/w/p2NN.py mit b(...); Titel ohne „Ein System." schreiben und per re.sub ergänzen; welle_vorlage.py → /tmp/welle.ts → vor `};` von FACH_TEXTE.
3. render.mjs, messen2.py (nur luft-Zeilen erlaubt), pdf.py → PDFs per SendUserFile (attach).
4. tests/fachdossierP2NN.test.mjs nach Muster P241–P247 (alte Zurückstellungs-Tests respektieren, z. B. P225/P229).
5. npm test (1 bekannter Container-Fehler Windows-1252), tsc, next build --webpack (Font-Mock /home/claude/fontmock/mock.js als Proxy, Platzhalter-Env).
6. _p2NN.bat aus dem vorigen ableiten (CRLF), commit_files mit expectedMtimeMs. Klon danach per git stash leeren (Stop-Hook).
