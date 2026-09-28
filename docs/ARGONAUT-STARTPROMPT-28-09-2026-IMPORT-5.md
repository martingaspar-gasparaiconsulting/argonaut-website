STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Umzug/Import, ab Paket 140)
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird NUR GEBAUT (fuer den Testtag). Befunde aus dem Testtag-Chat (T1, T2, ...) repariert Claude mit Vorrang.

1. ZUERST (Chatstart-Ritual)

* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-import-umzug.md (Plan), /areas/argonaut-bauliste-0927.md (Baulog, ganz), /areas/argonaut-testtag-2.md (Ende)
* Repo per git clone in die Pruef-Kopie (main). Stand pruefen: .git/logs/HEAD vom Geraet stagen - letzter Commit muss "Paket 139" sein (911673b). Sonst erst klaeren.
* AGENTS.md: Next.js 16 mit Breaking Changes. Jede Datei vor dem Aendern frisch vom Geraet holen und am echten Code pruefen.
* Lesen: lib/importParser.ts (ZIELE ab "Paket 138": gutscheine, foerdervorhaben; nachbereiten; virtuell 'rechnen'), lib/importMotor.ts (MOTOR_TABELLEN = 72), lib/importRechte.ts, lib/importBestand.ts, app/dashboard/import/page.tsx (importieren, importiereMitPositionen, importiereBestand, rueckgaengig)
  Dann spiegeln: 5 Zeilen, was du vorhast, und los (Entscheidungs-Modus).

2. STAND (27.09.2026 abends, Feierabend)

LIVE: _p123 bis _p139 (911673b Ready + Production).

* p136: Bestand je Filiale - Korrektur ueber RPC lager_buchen (Verlauf mit "vorher X"), Artikel ueber Nummer/EAN/Bezeichnung, Filiale ueber Name/Ort/Hauptsitz, nie angelegt; Rueckgaengig nur wo seitdem nicht gebucht (import_jobs.rueck_daten).
* p137: Import-Rechte - Mitarbeiter importiert nur, wenn Bereich (mitarbeiter_rechte.module) UND "darf aendern" (schreib_module). nurChef-Ziele bleiben Chef. Es gibt KEIN getrenntes "neu anlegen"-Recht (anlegen+aendern = darf aendern).
* p138: Gutscheine mit Restwert (Restwert -> wert, Ursprung in Notiz, Mehrfachkarte Restnutzungen, keine Einloesungen/Rechnung). SQL p138: import_feldkatalog kennt ALLE 10 Tabellen des GEMEINSAM-Blocks (72) - fuer die restlichen Punkte kein Katalog-SQL mehr noetig. Alle 10 Tabellen live bestaetigt.
* p139: Foerdervorhaben (nur Chef, Programm-Zuordnung an FOERDER_PROGRAMME, sonst "import-<slug>").
* SQL-Pruefung (docs/SQL-PRUEFUNG-FEHLT-LIVE-27-09-2026.sql): nur dossier-sequenz fehlte -> nachgeholt. Alles andere live.
* Tests 3072 gruen. Naechste Bat: _p140.
* Pruef-Hinweis: Gegenproben mit "node scripts/tests-bauen.cjs importMotor importParser importKatalog importRechte" (importMotor/importRechte buendeln eine eigene Parser-Kopie).

3. JETZT BAUEN - GEMEINSAM-Block (von Martin am 27.09. freigegeben, genau so)

Reihenfolge: 2 -> 8 -> 4 -> 5 -> 7 -> 6 -> 9
* 2 Mitglieder (Tabelle mitglieder, 27 Spalten): Name, Beitrag, Intervall, Status uebernehmen; IBAN/BIC/Mandatsreferenz/Mandat-Datum/letzte Einziehung NIE (ausblenden + sperren), Hinweis "SEPA-Mandat bitte neu erfassen".
* 8 Spenden (spende): immer bestaetigt=false, keine Bestaetigungsnummer; alte Nummer in den Zweck-Text.
* 4 Angebote (angebote + angebot_positionen): nur Kopf + Summen als Archiv mit Status aus dem Altsystem; kein Token/Annahme-Link, keine Rechnungs-Verknuepfung, Nummernkreis unberuehrt; Positionen wie Bestellungen (importiereMitPositionen). VORHER Martin einen Ausschnitt zeigen.
* 5 Aufwand (projektleistungen): nur NICHT abgerechnete Stunden; abgerechnete mit Grund raus.
* 7 Kautionen (immo_kaution, nur Chef): Soll/Eingaenge/Anlage je Mietvertrag.
* 6 Mietzahlungen (immo_zahlungen, nur Chef): Historie je Vertrag+Monat nur als erledigt, keine Buchungen/Mahnlaeufe.
* 9 Shop-Bestellungen (shop_bestellungen): nur Archiv "abgeschlossen", keine Lagerbuchung, keine Rechnung, keine Mails.
* 10 Marktverkaeufe: NICHT importieren.
Danach: Anwalt zuerst (Gesundheit: Patienten, Einwilligungen, Recall, Behandlungen; Tier; hilfsmittel; akten), Schritt 5 KI-Aufraeumer, Schritt 6 Umzugs-Seite, Schritt 7 Datanorm/BMEcat/UGL, vCard, iCal, DATEV-Rest, Schritt 8 Muster-Umzugskarton; DANACH Ablaeufe (n8n-artig).

4. SICHERHEIT (HINTEN ANGEHAENGT - erst nach dem Testtag-Bau)

Checkliste (Claude Doc): https://claude.ai/code/artifact/686617bc-f4ef-4c84-8171-6eacae86e6a7
* Zwei-Faktor fuer JEDE Anmeldung - GEMEINSAM (Auth).
* Paket S1: 8 KI-Routen ohne Login, branchen-chat + website-anfrage ohne Limit, 3 Test-Routen, erechnung-lesen/rechnung-zugferd ohne Login, frame-ancestors.
* owner = eigene Kennung in ~46 Seiten - Seite fuer Seite auf Betrieb umstellen (z. B. foerdermittel-Seite insert owner = uid), getrennt liefern.
* Claude-Befund 27.09.: "darf aendern" (schreib_module) wird ausser im Import-Center und auf /rechte fast nirgends geprueft.

5. LIEFERWEG UND REGELN

* _pNN.bat im Repo-Wurzelordner (Vorgaenger-Pruefung, 0/4 git status, 1/4 npm test, 2/4 npx next build, 3/4 gezielter git add, 4/4 git push; Abbruch ohne Push). NIE eine bestehende _pNN.bat ueberschreiben. Vor dem Schreiben .git/logs/HEAD stagen, Geraete-Dateien gegen den letzten Commit vergleichen.
* Nicht aus der Pruef-Kopie committen/pushen (Aenderungen dort per git stash beiseitelegen).
* Pruefkette: esbuild, tsc echt + Typfehler-Gegenprobe, node --test, GEGENPROBEN, SQL zweimal in PGlite.
* SQL additiv, idempotent, komplett in den Chat; lange Bloecke zusaetzlich "type <datei> | clip".
* Kundentexte "Sie", Wort "Bausteine", Mitbewerber nie beim Namen.
* Nach jedem Push: Stand der Liste zeigen, Testtag-Punkte in /areas/argonaut-testtag-2.md sammeln. Durchbauen bis "Feierabend".
* Diese Datei (docs/ARGONAUT-STARTPROMPT-28-09-2026-IMPORT-5.md) im naechsten Paket mit committen.

6. OFFEN AUS DER FEIERABEND-ERINNERUNG

Separates Thema "eigene KI / lokale KI (Ollama)" komplett auseinandernehmen - Datenschutz, nur Praxiswissen ohne echte Zahlen oder Namen der Kunden, Test naechste Woche gemeinsam (nicht im Bau-Chat bauen, eigener Chat).
