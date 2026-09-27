STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Umzug/Import, ab Schritt 3 Rest)
=========================================================================

Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird NUR
GEBAUT. Befunde aus dem Testtag-Chat (T1, T2, ...) werfe ich hier rein - die
reparierst du mit Vorrang.

--------------------------------------------------------------------
1. ZUERST (Chatstart-Ritual)
--------------------------------------------------------------------
- Skill argonaut-chatstart: beide Ordner freigeben lassen
    C:\Users\Admin\Desktop\gaspar-ai-system
    C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
- Memory lesen: /preferences.md (verbindlich), /areas/argonaut-import-umzug.md
  (beschlossener Plan), /areas/argonaut-bauliste-0927.md (Baulog, ganz lesen),
  /areas/argonaut-testtag-2.md (Ende)
- Repo per git clone in die Pruef-Kopie holen:
  github.com/martingaspar-gasparaiconsulting/argonaut-website (main, Paket 126)
- Stand pruefen: .git/logs/HEAD vom Geraet stagen - letzter Commit muss
  "Paket 126" sein. Sonst erst klaeren.
- AGENTS.md: Next.js 16 mit Breaking Changes. Jede Datei vor dem Aendern frisch
  vom Geraet holen und am echten Code pruefen.
- Diese Dateien im Repo lesen:
    docs/ARGONAUT-UMZUG-BESTANDSAUFNAHME.md       (Tabellen je Branchengruppe + Klaerung Doppeltabellen)
    docs/ARGONAUT-ALTSYSTEME-RECHERCHE-27-09-2026.md
    lib/importMotor.ts, lib/importParser.ts (ZIELE), lib/altsysteme.ts
Dann spiegeln: 5 Zeilen, was du vorhast, und los (Entscheidungs-Modus).

--------------------------------------------------------------------
2. STAND (27.09.2026 abends) - alles LIVE bis Paket 126
--------------------------------------------------------------------
- _p123 Schritt 0 Fortschritt/Stoppuhr/Hochrechnung
- _p124 Schritt 2 EIN Import-Motor: Feldkatalog aus der DB (RPC
  import_feldkatalog, Whitelist), nichts verschluckt (Feld / Eigenes Feld /
  "nicht uebernommen, weil"), Spalten-Bilanz, Bank gesperrt, Altsysteme-
  Klickliste 81 Programme (Tabelle import_altsystem_wahl), DATEV EXTF,
  eigener .xls-Leser, alle Importe gehoeren dem Betrieb, Modul-Tueren -> Motor
- _p125 Schritt 3 Teil 1: Leistungskatalog, Wartung, Chancen, Aktivitaeten,
  Leads; Kunden-Verknuepfung (Nummer > E-Mail > genauer Name, auch Kunden-
  nummer im Notiztext, mehrdeutig nie); Werbe-Einwilligung gesperrt;
  Kunden-Akte zeigt Kundennummer/Mobil/Website/USt-IdNr./Anrede;
  Wartungsseite: owner nur beim Anlegen (Betrieb)
- _p126 Schritt 3 Teil 2: Mitarbeiter (nur Chef, Lohn/SV/Steuer/Zugang
  gesperrt), Auftraege (Angebote mit Grund aussortiert), Projekte, laufende
  Kosten (vertraege, Command-Center-Spalten ausgeblendet), Anlagen, Fuhrpark,
  Eingangsrechnungen (Erkennung lieferant+belegnummer)
- SQL p124/p125/p126 bestaetigt. Katalog kennt 16 Tabellen.
- Tests 2952 gruen. Naechste Bat: _p127. NIE eine bestehende _pNN.bat ueberschreiben.

--------------------------------------------------------------------
3. JETZT BAUEN
--------------------------------------------------------------------
Schritt 3 Rest (_p127):
  - Qualifikationen (mitarbeiter_qualifikation: art aus lib/dispoPlus.ts Liste,
    unique mitarbeiter_id+art) - braucht Verweis auf Mitarbeiter (Name/E-Mail/
    Personalnummer als Eigenes Feld) -> kundeVerweis verallgemeinern
  - Bestellungen mit Positionen (Haldenberg 13: Zeilen je Bestellnummer
    gruppieren). ERP bestellungen+bestellpositionen (lieferant_id -> lieferanten)
    vs Einkauf bestellung+bestellung_position (lieferant_id -> lieferant):
    mit Martin klaeren, welches Modul fuehrend ist - Vorschlag ERP.
  - Die 26 Nur-Vorlage-Karten auf den Motor (je Karte Ziel in ZIELE + Tabelle
    in die Katalog-Whitelist)
  - Angebote GEMEINSAM: erst zeigen, dann bauen
  - Eigene Felder bei Lieferanten und Offenen Posten sind gespeichert, aber dort
    noch nicht sichtbar (EigeneFelderAnzeige einbauen; Rechnungen = GEMEINSAM)
  - wartungshistorie owner weiter uid (Claude-Befund, offen)
Schritt 4: Katalog je Branchengruppe
Schritt 5: KI-Aufraeumer (Lieferanten-/Preis-Import sind schon KI-Aufraeumer fuer Rohtext)
Schritt 6: Umzugs-Seite (Auto-Erkennung, Reihenfolge, Rueckgaengig je Datei)
Schritt 7: Datanorm/BMEcat/UGL, vCard, iCal, DATEV (Rest, z. B. OPOS-Spalten)
Schritt 8: Muster-Umzugskarton je Branchengruppe; Haldenberg XXL komplett
  (06 Kontoauszug -> Bankabgleich, E-Rechnungen -> eigener Import)
DANACH: Ablaeufe (n8n-artig) inkl. Fundament 1-5; dann die Ergaenzungsliste.
Sobald Schritt 0 bis 3 live sind: "Testtag-Import ist bereit" melden.

--------------------------------------------------------------------
4. LIEFERWEG UND REGELN
--------------------------------------------------------------------
- Lieferung per _pNN.bat im Repo-Wurzelordner (0/4 git status, 1/4 npm test,
  2/4 npx next build, 3/4 gezielter git add, Pfade mit [id] als
  ":(literal)pfad", 4/4 git push; Abbruch ohne Push). Die Bat prueft zuerst,
  ob das Vorgaenger-Paket im Repo ist.
- WICHTIG: Waehrend Martins Bat laeuft, KEINE Datei im Repo-Ordner aendern
  (Race: git add nimmt sonst neuere Dateien mit). Vor dem Schreiben
  .git/logs/HEAD stagen und pruefen, ob der Vorgaenger committet ist.
- Nicht aus der Pruef-Kopie committen/pushen (Martin pusht selbst).
- Pruefkette: esbuild, tsc echt, node --test, GEGENPROBEN, SQL zweimal in
  PGlite + RLS-Probe. next build nur in der Bat (Google Fonts im Container gesperrt).
- SQL additiv, idempotent, komplett in den Chat. Aussperrendes vorher sagen.
- GEMEINSAM: Rechnung/Angebot, Zahlung/Bank, Login/Auth.
- Patientendaten/Tierakten und Mitglieder mit Bankdaten: erst Anwalt bzw. gemeinsam.
- Kundentexte "Sie", Wort "Bausteine", Mitbewerber nie beim Namen nennen.
- Nach jedem Push: Stand der Liste (Schritt 0-8 + Ablaeufe) zeigen.
  Testtag-Klickpunkte in /areas/argonaut-testtag-2.md sammeln.
- Durchbauen bis "Feierabend". Vor Kontext-Ende warnen.

--------------------------------------------------------------------
5. ERINNERUNG FUER "FEIERABEND"
--------------------------------------------------------------------
Martin erinnern: separates Thema "eigene KI / lokale KI (Ollama)" komplett
auseinandernehmen - Datenschutz, nur Praxiswissen ("wie wird was gemacht")
ohne echte Zahlen oder Namen der Kunden, Test naechste Woche gemeinsam.
