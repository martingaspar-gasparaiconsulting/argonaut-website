STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Umzug/Import, ab Paket 131)
=====================================================================

Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird NUR
GEBAUT (fuer den Testtag). Befunde aus dem Testtag-Chat (T1, T2, ...) repariert
Claude mit Vorrang.

--------------------------------------------------------------------
1. ZUERST (Chatstart-Ritual)
--------------------------------------------------------------------
- Skill argonaut-chatstart: beide Ordner freigeben lassen
    C:\Users\Admin\Desktop\gaspar-ai-system
    C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
- Memory lesen: /preferences.md (verbindlich), /areas/argonaut-import-umzug.md
  (Plan), /areas/argonaut-bauliste-0927.md (Baulog, ganz), /areas/argonaut-testtag-2.md (Ende)
- Repo per git clone in die Pruef-Kopie (main). Stand pruefen: .git/logs/HEAD
  vom Geraet stagen - letzter Commit muss "Paket 130" sein. Sonst erst klaeren.
- AGENTS.md: Next.js mit Breaking Changes. Jede Datei vor dem Aendern frisch vom
  Geraet holen und am echten Code pruefen.
- Lesen: lib/importParser.ts (ZIELE, listen, folgeDatum, nachschlag,
  nachschlagMit, kinder), lib/importMotor.ts, lib/importBestellungen.ts,
  lib/importKatalog.ts, app/dashboard/import/page.tsx (importieren,
  importiereMitPositionen, ladeVerweisIndex, allesLaden),
  docs/ARGONAUT-UMZUG-BESTANDSAUFNAHME.md
Dann spiegeln: 5 Zeilen, was du vorhast, und los (Entscheidungs-Modus).

--------------------------------------------------------------------
2. STAND (27.09.2026 abends)
--------------------------------------------------------------------
LIVE: _p123 bis _p129. _p130 ausgeliefert (SQL p130-import-karten3 + Bat).
- p127: Qualifikationen (Verweis Mitarbeiter ueber Personalnummer als Eigenes
  Feld), Bestellungen mit Positionen (ERP bestellungen + bestellpositionen ist
  fuehrend, Einkauf bestellung/bestellung_position bleibt), Wartungsprotokolle
  gehoeren dem Betrieb (whist_insert_ma), Lieferanten-Akte zeigt Eigene Felder
- p128: 15 Vorlage-Karten auf dem Motor (Objekte, Pruefprotokolle, BDE, Chargen,
  Expose nie aktiv, Kurse, Veranstaltungen datumZeit, Plaetze, Belegung,
  Erinnerungen, Gutachten, Schlaege, Tierbestand, Energie-Anlagen, Freigaben)
- p129: Rezepturen, Zuschnitt, Tour-Stopps (Eltern per Nachschlag anlegen)
- p130: Betriebskosten-Einheiten (Abrechnung als Entwurf), Reservierungs-Vorgaenge
- Katalog-Whitelist: 44 Tabellen. Tests 2995 gruen. Naechste Bat: _p131.

--------------------------------------------------------------------
3. JETZT BAUEN
--------------------------------------------------------------------
Schritt 3 Rest:
  - Die 6 Seiten mit eigenem CSV-Import (varianten, lizenzen, speisekarte,
    raeume, etiketten, produkte) funktionieren; optional auf den Motor.
  - Claude-Befund: etiketten, speisekarte, raeume, produkte (und
    foerdervorhaben) schreiben owner = uid statt Betrieb. Kann Mitarbeiter
    aussperren -> VORHER sagen, getrennt liefern, RLS je Tabelle pruefen.
  - GEMEINSAM (erst zeigen): aufwand (projektleistungen -> Geld), gutscheine
    (Restwert/USt), spenden, foerdervorhaben, Angebote.
  - Anwalt zuerst: hilfsmittel (Art. 9), akten (Schweigepflicht).
Schritt 4: Katalog je Branchengruppe
Schritt 5: KI-Aufraeumer (Lieferanten-/Preis-Import sind schon welche)
Schritt 6: Umzugs-Seite (Auto-Erkennung, Reihenfolge, Rueckgaengig je Datei)
Schritt 7: Datanorm/BMEcat/UGL, vCard, iCal, DATEV-Rest
Schritt 8: Muster-Umzugskarton je Branchengruppe; Haldenberg XXL komplett
DANACH: Ablaeufe (n8n-artig). Sobald Schritt 0-3 live: "Testtag-Import ist bereit" melden.

--------------------------------------------------------------------
4. SICHERHEIT (HINTEN ANGEHAENGT - erst nach dem Testtag-Bau)
--------------------------------------------------------------------
Checkliste (Claude Doc): https://claude.ai/code/artifact/686617bc-f4ef-4c84-8171-6eacae86e6a7
- Martin-Beschluss: Zwei-Faktor fuer JEDE Anmeldung (Chef, Mitarbeiter,
  Betreiber) - GEMEINSAM (Auth).
- Paket S1: 8 KI-Routen ohne Login (/api/chat, korrespondenz-ki,
  vertrag-kuendigung, projekt-ki-setup, hr/ki-auswertung, mahnung-ki, ki-auge,
  erp-bestellvorschlag; alle Aufrufer im Dashboard; WebsiteChat ist nirgends
  eingebunden), branchen-chat + website-anfrage ohne IP-Limit/Bot-Falle,
  3 document-engine Test-Routen, erechnung-lesen/rechnung-zugferd ohne Login,
  frame-ancestors fuer /dashboard und /admin.

--------------------------------------------------------------------
5. LIEFERWEG UND REGELN
--------------------------------------------------------------------
- _pNN.bat im Repo-Wurzelordner (Vorgaenger-Pruefung, 0/4 git status, 1/4 npm
  test, 2/4 npx next build, 3/4 gezielter git add, [id]-Pfade als
  ":(literal)pfad", 4/4 git push; Abbruch ohne Push). NIE eine bestehende
  _pNN.bat ueberschreiben. Waehrend Martins Bat laeuft nichts im Repo aendern;
  vorher .git/logs/HEAD stagen.
- Nicht aus der Pruef-Kopie committen/pushen.
- Pruefkette: esbuild, tsc echt + Typfehler-Gegenprobe, node --test,
  GEGENPROBEN, SQL zweimal in PGlite + RLS-Probe.
- SQL additiv, idempotent, komplett in den Chat. Aussperrendes vorher sagen.
- GEMEINSAM: Rechnung/Angebot, Zahlung/Bank, Login/Auth.
- Kundentexte "Sie", Wort "Bausteine", Mitbewerber nie beim Namen.
- Nach jedem Push: Stand der Liste zeigen, Testtag-Punkte in
  /areas/argonaut-testtag-2.md sammeln. Durchbauen bis "Feierabend".

--------------------------------------------------------------------
6. ERINNERUNG FUER "FEIERABEND"
--------------------------------------------------------------------
Separates Thema "eigene KI / lokale KI (Ollama)" komplett auseinandernehmen -
Datenschutz, nur Praxiswissen ohne echte Zahlen oder Namen der Kunden, Test
naechste Woche gemeinsam.
