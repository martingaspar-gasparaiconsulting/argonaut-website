STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Umzug/Import, ab Schritt 2)
====================================================================

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
  (beschlossener Plan), /areas/argonaut-bauliste-0927.md (letzter Baulog),
  /areas/argonaut-testtag-2.md
- Repo per git clone in die Pruef-Kopie holen:
  github.com/martingaspar-gasparaiconsulting/argonaut-website (Stand main 4cab5b5)
- AGENTS.md: Next.js 16 mit Breaking Changes -> node_modules/next/dist/docs lesen.
  Jede Datei vor dem Aendern frisch vom Geraet holen und am echten Code pruefen.
- Diese Dateien im Repo lesen:
    docs/ARGONAUT-ALTSYSTEME-RECHERCHE-27-09-2026.md  (56 Systeme, Export-Wege, Spalten, Quellen)
    docs/ARGONAUT-STARTPROMPT-27-09-2026-IMPORT.md    (diese Datei)
- Zwei Claude Docs (mit den Docs-Werkzeugen lesen, nicht web-fetchen):
    Bestandsaufnahme Schritt 1: https://claude.ai/code/artifact/ab088f59-5571-4b41-a58c-27f8c29ba6ac
    Ergaenzungsliste 27.09.:     https://claude.ai/code/artifact/0b46070d-8ec0-44cf-8f7f-418441b29c83
Dann spiegeln: 5 Zeilen, was du vorhast, und los (Entscheidungs-Modus).

--------------------------------------------------------------------
2. STAND (27.09.2026 abends)
--------------------------------------------------------------------
- Schritt 0 LIVE (_p123, Commit 4cab5b5): Fortschrittsbalken je Datei (Laden,
  Lesen, Pruefen, Einspielen, Restzeit), Pakete zu 500, Protokoll vor/nach jedem
  Paket, Anhalten, CSV wird im Browser gelesen, Excel mit Upload-Fortschritt,
  seitenweiser Doppelten-Abgleich (vorher Kappung 1.000), Umzug-Leiste mit
  Gesamtbalken + Hochrechnung + Abschluss-Karte, Zeilen-Bilanz "0 verschluckt".
  SQL p123 bestaetigt (14/4/3/0). Neue Dateien: lib/importFortschritt.ts,
  app/dashboard/import/FortschrittAnzeige.tsx, tests/importFortschritt.test.mjs.
- Schritt 1 FERTIG (Claude Doc Bestandsaufnahme): 82 Dateien je Branchengruppe,
  4 Import-Center, 10 nur Modul-Import, 27 nur Vorlage, 41 ohne Weg.
  Doppelte Tabellen: firmen/kontakte, lieferant/lieferanten,
  bestellung/bestellungen, kanzlei_frist/kanzlei_fristen,
  mitglieder/verein_mitglieder, import_laeufe+import_zeilen (CRM-Import) neben
  import_jobs. Vor Schritt 2 am Code klaeren, welche jeweils fuehrend ist.
- Naechste Bat: _p124. NIE eine bestehende _pNN.bat ueberschreiben.

--------------------------------------------------------------------
3. JETZT BAUEN (Reihenfolge beschlossen)
--------------------------------------------------------------------
Schritt 2: EIN Import-Motor
  - Feldkatalog aus der DB, "nichts verschluckt" (unbekannte Spalten -> Eigene
    Felder, Liste "nicht uebernommen, weil ...")
  - doppelte Tueren zusammenlegen (Kunden 3, Artikel 2, Lieferanten 2),
    nichts loeschen
  - Altsysteme-Klickliste "Aus welchem System ziehen Sie um?": eigene Systeme
    anhaken, fremde ausblenden (je Betrieb gemerkt), je System Schritt-fuer-
    Schritt-Exportanleitung + Spalten-Aliase (DE + EN) aus der Recherche-Datei.
    Nicht Belegtes als "Export beim Hersteller erfragen" kennzeichnen.
  - DATEV-Leser (Kopf "EXTF", Debitoren/Kreditoren) + alte .xls (DATEV-OPOS)
  - importierte Daten gehoeren dem Betrieb (mein_chef_id), nicht nur bei Kontakten
  - Kopie der Bestandsaufnahme als docs/ARGONAUT-UMZUG-BESTANDSAUFNAHME.md mitliefern
Schritt 3: die 9 Modul-Importe + 26 Nur-Vorlage-Karten auf den Motor, Reihenfolge
  laut Bestandsaufnahme (Kunden mit Adresse+Kundennummer, OP mit Kunde,
  Mitarbeiter nur Chef, Leistungskatalog, Auftraege, Projekte, Wartung, Anlagen,
  Bestellungen, Eingangsrechnungen, laufende Kosten, Leads, Chancen,
  Aktivitaeten, Qualifikationen; Angebote GEMEINSAM: erst zeigen)
Schritt 4: Katalog je Branchengruppe
Schritt 5: KI-Aufraeumer
Schritt 6: Umzugs-Seite (Auto-Erkennung, Reihenfolge, Rueckgaengig je Datei)
Schritt 7: Datanorm/BMEcat/UGL, vCard, iCal, DATEV (Rest)
Schritt 8: Muster-Umzugskarton je Branchengruppe; Haldenberg XXL
  (Ordner MUSTERBETRIEB-ELEKTRO-XXL: 13 CSV + 6 E-Rechnungen) komplett importierbar
Ausbau Schritt 0 (spaeter): Upload in Teilen auf den Hostinger-VPS,
  Verarbeitung im Hintergrund; mehrere Pakete parallel (2-3x schneller)
DANACH: Ablaeufe (n8n-artig) inkl. Fundament 1-5; dann die neue Liste aus der
  Ergaenzungsliste (Reihenfolge dort, Abschnitt "Vorschlag").
Sobald Schritt 0 bis 3 live sind: "Testtag-Import ist bereit" melden.

--------------------------------------------------------------------
4. LIEFERWEG UND REGELN
--------------------------------------------------------------------
- Lieferung per _pNN.bat im Repo-Wurzelordner: 0/4 git status --short,
  1/4 npm test, 2/4 npx next build, 3/4 gezielter git add je Datei (Pfade mit
  [id] als ":(literal)pfad") + commit, 4/4 git push; bei Fehler Abbruch ohne
  Push; keine Umlaute/Sonderzeichen in echo-Zeilen. Aufruf: _p124
- Nicht aus der Pruef-Kopie committen/pushen (Martin pusht selbst).
- Pruefkette: esbuild, tsc mit echten Paketen, node --test, GEGENPROBEN,
  SQL zweimal in PGlite + RLS-Probe. next build geht im Container nicht
  (Google Fonts gesperrt) -> laeuft in der Bat.
- SQL additiv, idempotent, komplett in den Chat. Aussperrendes vorher sagen
  und getrennt liefern.
- GEMEINSAM: Rechnung/Angebot, Zahlung/Bank, Login/Auth.
- Patientendaten/Tierakten und Mitglieder mit Bankdaten: erst Anwalt bzw. gemeinsam.
- Kundentexte "Sie", Wort "Bausteine", Mitbewerber nie beim Namen nennen.
- Nach jedem Push: Stand der Liste (Schritt 0-8 + Ablaeufe) mit Haken zeigen.
  Testtag-Klickpunkte in /areas/argonaut-testtag-2.md sammeln.
- Durchbauen bis "Feierabend". Vor Kontext-Ende warnen.

--------------------------------------------------------------------
5. ERINNERUNG FUER HEUTE ABEND (bei "Feierabend")
--------------------------------------------------------------------
Martin erinnern: separates Thema "eigene KI / lokale KI (Ollama)" komplett
auseinandernehmen - Datenschutz, nur Praxiswissen ("wie wird was gemacht")
ohne echte Zahlen oder Namen der Kunden, Test naechste Woche gemeinsam.
