# ARGONAUT OS · Startprompt Fr 25.09.2026 abends — Paket PS komplett

Hallo Claude, ich bin Martin. Wir setzen fort.
Bitte zuerst: beide Ordner anfordern (Skill argonaut-chatstart), dann lesen:
dieses Dokument, das Gedaechtnis `/areas/argonaut-bauliste-0925.md` (Baulog ab 25.09.),
`/areas/argonaut-testtag-2.md` (Klickpunkte) und `/areas/argonaut-anwalt-checkliste-2.md` (R25, R26 neu).
Testtag: So 27.09.2026.

## 1. Stand

| Paket | Inhalt | Bat | Stand |
|---|---|---|---|
| PA–PR, PG3, R1, R2, PS1–PS4 | siehe fruehere Startprompts | _p70–_p97 | live |
| PS5 | Gebuehren & Honorare: RVG/StBVV (Kanzlei), GOT (Tier), Dozentenhonorare + Bescheinigungen (Bildung), Trinkgeld (Gastro), Kuendigung + Check-in (Mitglieder) | _p98 | SQL bestaetigt, _p98 lief (2727 Tests gruen) -> Vercel pruefen |
| PS6 | Papiere & Identifizierung: Meldeschein + Kurtaxe (Gastro), CMR-Frachtbrief + Tankkarte/Maut (Logistik), GwG-Identifizierung (Kanzlei, Immobilien, KFZ), Nutzungsrechte (Agentur), Duenge-Fristen (Landwirtschaft) | _p99 | ausgeliefert — SQL + _p99 von Martin auszufuehren (falls nicht gemeldet: nachfragen) |

**Damit sind alle 19 Pakete + PG3 gebaut. Paket PS: 6 von 6.** Naechste freie Bat-Nummer: **_p100**.
Diese Datei ist in _p99 enthalten.

## 2. Offene Entscheidungen fuer Martin
- Check-in liegt unter Mitglieder (sensibel): Tresenkraefte brauchen die Mitglieder-Freigabe und sehen dann IBAN/Beitraege. Spaeter eigener Check-in-Schluessel?
- GwG: Mitarbeiter sehen nur ihre eigenen Faelle; die Pruefung "verbundene Barzahlungen" sieht beim Mitarbeiter deshalb nur dessen Faelle (beim Chef alle).
- Tankkarte/Maut nur Chef (Geld). Tankgroesse je Fahrzeug einmal eintragen.

## 3. Befunde (Claude)
- Recherche 25.09.: RVG ab 01.06.2025, StBVV Tabelle A (2 Quellen), GOT 2022 (Evaluierung bis Ende 2026), § 127 SGB IV bis 31.12.2027, § 309 Nr. 9 BGB, Meldeschein seit 01.01.2025 nur Auslaender (§ 30 Abs. 4 BMG: 1 Jahr + 3 Monate), GwG § 10 Abs. 6a / § 8 Abs. 4, Stoffstrombilanz seit 08.07.2025 abgeschafft, DueV 2 Tage / 31.03.
- Anwalt neu: R25 (PS5), R26 (PS6).
- Arbeitsumgebung: kein device_bash -> Dateien stagen, im Container pruefen (esbuild, tsc mit Stubs, node --test, Gegenproben, SQL in PGlite), zurueckschreiben.
- LEHRE: Dateien, die eine laufende _pNN.bat mit git add vormerkt (z. B. lib/rechte.ts), erst NACH deren Ende ueberschreiben.

## 4. Naechster Schritt
Testtag So 27.09. (Klickpunkte in argonaut-testtag + argonaut-testtag-2). Danach: Querschnitt (Schriften) und Befunde vom Testtag.

## 5. Regeln (unveraendert)
Deutsch, CMD, additiv, idempotentes SQL komplett in den Chat, eigene _pNN.bat (nie ueberschreiben), gezielter git add, Pruef-Kette + Gegenproben, neue Seiten als Unterpfad ohne eigenen Modul-Schluessel, Besitzer = coalesce(mein_chef_id(), auth.uid()), Loeschen nur Chef, Geld-Tabellen nur Chef.
