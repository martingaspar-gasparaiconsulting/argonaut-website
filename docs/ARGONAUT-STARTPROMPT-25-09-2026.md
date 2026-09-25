# ARGONAUT OS · Startprompt Fr 25.09.2026 — Fortsetzung Bautag (Paket PS)

Hallo Claude, ich bin Martin. Wir setzen den Bautag fort.
Bitte zuerst: beide Ordner anfordern (Skill argonaut-chatstart), dann lesen:
dieses Dokument, `docs/ARGONAUT-PS-PLAN-24-09-2026.md` (Plan PS1–PS6) und das Gedaechtnis
`/areas/argonaut-bauliste-0924.md` (Baulog, fast voll -> neue Eintraege in eine neue Datei `argonaut-bauliste-0925`)
sowie `/areas/argonaut-testtag-2.md`. Testtag: So 27.09.2026.

## 1. Stand

| Paket | Inhalt | Bat | Stand |
|---|---|---|---|
| PA–PR, PG3, R1, R2 | siehe Startprompt Nacht | _p70–_p92 | live |
| PS1 | Meldungen & Register im Nachweis-Motor (neue Mappe `meldungen`, jaehrliche Stichtage mit Meldefenster) | _p93 | live (c301260) |
| PS2 | Qualitaet & Rueckverfolgung: 8D-Reklamation, Lieferanten-Bewertung, Rueckruf ueber Chargen (mehrstufig), MHD-Warnung im Lager, Gefahrstoffverzeichnis, 2 HACCP-Formularvorlagen | _p94 | SQL bestaetigt; _p94 lief zuletzt im Build (2692 Tests gruen) -> zuerst pruefen: Commit auf origin/main + Vercel Ready |

**18 von 19 Paketen + PG3 fertig; im letzten Paket PS sind 2 von 6 Unterpaketen fertig, 4 uebrig.**
Naechste freie Bat-Nummer: **_p95**. Diese Datei liegt ungetrackt unter `docs/` -> in _p95 mit `git add docs/ARGONAUT-STARTPROMPT-25-09-2026.md` aufnehmen.

## 2. Naechste Pakete
- **PS3 Vorgaenge mit Kunden:** Retouren-Ablauf (Shop), Schadenabwicklung mit Versicherern (KFZ), SLA-Bericht (IT & MSP), Nachkauf-Erinnerung (Beauty), Impf-Erinnerung an Halter (Tier). Zuerst Bestand je Modul stagen.
- PS4 Versammlungen & Objekte, PS5 Gebuehren & Honorare, PS6 Papiere & Identifizierung (siehe PS-Plan).

## 3. Befunde (Claude)
- PS2: Die Seite `/dashboard/lebensmittel/qualitaet` re-exportiert `../../chargen/qualitaet/page` (neuer Weg im Repo). Falls der Build daran scheiterte: dort eine eigene Seite mit Import der Komponente anlegen.
- PS1: Vollstaendigkeitserklaerung nach VerpackDG (seit 12.08.2026) — Frist 15.05. und Mengenschwellen aus altem VerpackG uebernommen, im neuen Gesetzestext nicht bestaetigt (Anwalt R22).
- Anwalt neu: R22 (PS1-Fristen, Rueckruf-Checklisten/-Text, Gefahrstoffverzeichnis).
- Arbeitsumgebung: kein device_bash -> Dateien stagen, im Container pruefen (esbuild, tsc mit Stubs, node --test, Gegenproben, SQL in PGlite), zurueckschreiben.

## 4. Regeln (unveraendert)
Deutsch, CMD, additiv, idempotentes SQL komplett in den Chat, eigene _pNN.bat (nie ueberschreiben), gezielter git add, Pruef-Kette + Gegenproben, Pfade mit [id]/[token] als `git add -- ":(literal)pfad"`, neue Seiten als Unterpfad oder `immer: true`/`nurChef: true` statt neuem modul-Schluessel, Speicher-Ordner = Betrieb, Besitzer = coalesce(mein_chef_id(), auth.uid()).
