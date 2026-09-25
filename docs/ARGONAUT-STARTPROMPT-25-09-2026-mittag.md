# ARGONAUT OS · Startprompt Fr 25.09.2026 mittags — Fortsetzung Bautag (Paket PS)

Hallo Claude, ich bin Martin. Wir setzen den Bautag fort.
Bitte zuerst: beide Ordner anfordern (Skill argonaut-chatstart), dann lesen:
dieses Dokument, `docs/ARGONAUT-PS-PLAN-24-09-2026.md` (Plan PS1–PS6) und das Gedaechtnis
`/areas/argonaut-bauliste-0925.md` (Baulog ab 25.09.) sowie `/areas/argonaut-testtag-2.md`. Testtag: So 27.09.2026.

## 1. Stand

| Paket | Inhalt | Bat | Stand |
|---|---|---|---|
| PA–PR, PG3, R1, R2, PS1 | siehe fruehere Startprompts | _p70–_p93 | live |
| PS2 | Qualitaet & Rueckverfolgung | _p94 | live (5ba84b4) |
| PS3 | Vorgaenge mit Kunden: Retouren (Shop), Schadenabwicklung (KFZ), SLA-Bericht (IT), Nachkauf-Erinnerung (Beauty), Impf-Erinnerung (Tier) | _p96 | SQL bestaetigt, _p96 lief (2706 Tests gruen, Build lief) -> Commit + Vercel pruefen |
| PS4 | Versammlungen (WEG + Verein), Mieter-Vorgaenge (Schaden, Mieterhoehung/Index, Kaution), Verwendungsnachweis Foerdermittel, Ehrenamt | _p97 | ausgeliefert, SQL + _p97 von Martin noch auszufuehren (falls nicht gemeldet: nachfragen) |

`_p95.bat` ist ueberfluessig (nie ausfuehren). **Naechste freie Bat-Nummer: _p98.**
**18 von 19 Paketen + PG3 fertig; im letzten Paket PS sind 4 von 6 Unterpaketen gebaut, 2 uebrig (PS5, PS6).**
Diese Datei liegt ungetrackt unter `docs/` -> in _p98 mit `git add docs/ARGONAUT-STARTPROMPT-25-09-2026-mittag.md` aufnehmen.

## 2. Naechste Pakete
- **PS5 Gebuehren & Honorare:** Rechner RVG/StBVV (Kanzlei), GOT (Tiere), Dozentenhonorare + Teilnahmebescheinigungen (Bildung), Trinkgeld-Verteilung (Gastro), Kuendigungsfristen und Check-in Mitglieder (Sport). Zuerst Bestand je Modul stagen, Gebuehrentabellen per Websuche pruefen (RVG-Tabelle Stand 2025 KostBRaeG, GOT-Novelle).
- **PS6 Papiere & Identifizierung:** Meldeschein + Kurtaxe (Gastro), CMR-Frachtbrief + Maut-/Tankkarten-Abgleich (Logistik), GwG-Identifizierung (Recht, Immobilien, KFZ ab 10.000 EUR bar), Nutzungsrechte (Agentur), Duengebedarf/Stoffstrombilanz nur als Fristen-Erinnerung.

## 3. Befunde (Claude)
- Supabase-Editor stuerzte mit "removeChild"-Fehler ab: Ursache Chrome-Uebersetzung der Supabase-Seite -> Seite nie uebersetzen / Inkognito.
- PS3: SLA zaehlt nur bundesweite Feiertage; tier_tiere.kontakt_id wird im Tier-Modul nie gesetzt (Halter-E-Mail jetzt eigenes Feld).
- PS4: Foerdermittel-Betraege "1.234,56" wurden NaN — behoben.
- Anwalt neu: R23 (PS3), R24 (PS4).
- Arbeitsumgebung: kein device_bash -> Dateien stagen, im Container pruefen (esbuild, tsc mit Stubs, node --test ueber scripts/tests-bauen.cjs, Gegenproben, SQL in PGlite), zurueckschreiben.

## 4. Regeln (unveraendert)
Deutsch, CMD, additiv, idempotentes SQL komplett in den Chat, eigene _pNN.bat (nie ueberschreiben), gezielter git add, Pruef-Kette + Gegenproben, neue Seiten als Unterpfad ohne eigenen Modul-Schluessel (Rechte-Test: verhaelt sich wie Eltern-Modul), Besitzer = coalesce(mein_chef_id(), auth.uid()), Loeschen nur Chef, Geld-Tabellen nur Chef.
