STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Umzug/Import, ab Paket 136)
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird NUR GEBAUT (fuer den Testtag). Befunde aus dem Testtag-Chat (T1, T2, ...) repariert Claude mit Vorrang.

1. ZUERST (Chatstart-Ritual)

* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-import-umzug.md (Plan), /areas/argonaut-bauliste-0927.md (Baulog, ganz), /areas/argonaut-testtag-2.md (Ende)
* Repo per git clone in die Pruef-Kopie (main). Stand pruefen: .git/logs/HEAD vom Geraet stagen - letzter Commit muss "Paket 135" sein. Sonst erst klaeren.
* AGENTS.md: Next.js mit Breaking Changes. Jede Datei vor dem Aendern frisch vom Geraet holen und am echten Code pruefen.
* Lesen: lib/importParser.ts (ZIELE ab "Paket 132", listen, folgeDatum, nachschlag inkl. pflicht, grenzen, typ zeitpunkt/berlinZeitpunkt, kinder), lib/importMotor.ts (MOTOR_TABELLEN, vergleichsText, nachschlagPflichtGrund), lib/importKatalog.ts, app/dashboard/import/page.tsx (importieren, importiereMitPositionen, ladeVerweisIndex), docs/ARGONAUT-UMZUG-BESTANDSAUFNAHME.md
  Dann spiegeln: 5 Zeilen, was du vorhast, und los (Entscheidungs-Modus).

2. STAND (27.09.2026 spaet)

LIVE: _p123 bis _p134. _p135 ausgeliefert (SQL p135-import-nutzungsrechte + Bat).

* p131: Etiketten, Speisekarte, Zimmer, Raeume, Belegungen gehoeren dem Betrieb (lib/betriebBesitzer.ts, Rueckfall bei RLS-Fehler). Claude-Befund: owner = eigene Kennung steckt noch in ~46 Seiten -> ans Ende (Sicherheit).
* p132: Einsaetze (Zeitpunkt Berlin->UTC, Chef = inhaber_einsatz, unbekannter Mitarbeiter in Beschreibung), Tickets (nur Chef), Inventar, Verleih. vergleichsText gleicht Zeitpunkte im Bestandsabgleich an.
* p133: HACCP-Plan/-Kontrollen (Unklares = Abweichung), Kassen & TSE (nur Chef), Retainer, Duengung, Forst-Objekte, Baeume.
* p134: Pflanzenschutz, Mieteinheiten + Mietvertraege (nur Chef, keine Geldbuchungen), Expose-Interessenten + Kurs-Anmeldungen (Pflicht-Nachschlag), Ehrenamt (grenzen 0 < Stunden <= 24).
* p135: Nutzungsrechte (Medien -> text[], unbekannte in Notiz).
* Motor: 62 Tabellen. Tests 3035 gruen. Naechste Bat: _p136.
* Pruef-Hinweis: Gegenproben IMMER mit "node scripts/tests-bauen.cjs importMotor importParser importKatalog" (importMotor buendelt eine eigene Parser-Kopie).

3. JETZT BAUEN

Schritt 4 Rest:
* artikel_bestand_standort (Bestand je Filiale): 2 Verweise (Artikel ueber Artikelnummer, Standort ueber Namen), Bestand SETZEN statt anlegen (unique artikel_id+standort_id) -> eigener Weg wie importiereMitPositionen; Lager-Bewegung protokollieren? vorher am Code pruefen.
* GEMEINSAM (erst zeigen): markt_verkauf, shop_bestellungen, immo_kaution, immo_zahlungen, mitglieder mit IBAN, aufwand (projektleistungen), gutscheine, spenden, foerdervorhaben, Angebote.
* Anwalt zuerst: Gesundheit (Patienten, Einwilligungen, Recall, Behandlungen), Tier (Tiere, Behandlungen), hilfsmittel, akten.
Schritt 5: KI-Aufraeumer (Lieferanten-/Preis-Import sind schon welche)
Schritt 6: Umzugs-Seite (Auto-Erkennung, Reihenfolge, Rueckgaengig je Datei)
Schritt 7: Datanorm/BMEcat/UGL, vCard, iCal, DATEV-Rest
Schritt 8: Muster-Umzugskarton je Branchengruppe; Haldenberg XXL komplett
DANACH: Ablaeufe (n8n-artig). Sobald Schritt 0-3 live: "Testtag-Import ist bereit" melden.

4. SICHERHEIT (HINTEN ANGEHAENGT - erst nach dem Testtag-Bau)

Checkliste (Claude Doc): https://claude.ai/code/artifact/686617bc-f4ef-4c84-8171-6eacae86e6a7
* Martin-Beschluss: Zwei-Faktor fuer JEDE Anmeldung - GEMEINSAM (Auth).
* Paket S1: 8 KI-Routen ohne Login, branchen-chat + website-anfrage ohne Limit, 3 Test-Routen, erechnung-lesen/rechnung-zugferd ohne Login, frame-ancestors.
* NEU: owner = eigene Kennung in ~46 Seiten (grep "owner_user_id: (uid|userId|user.id)") - Seite fuer Seite auf Betrieb umstellen, RLS je Tabelle pruefen (docs/b1-befund.csv), getrennt liefern.

5. LIEFERWEG UND REGELN

* _pNN.bat im Repo-Wurzelordner (Vorgaenger-Pruefung, 0/4 git status, 1/4 npm test, 2/4 npx next build, 3/4 gezielter git add, [id]-Pfade als ":(literal)pfad", 4/4 git push; Abbruch ohne Push). NIE eine bestehende _pNN.bat ueberschreiben. Waehrend Martins Bat laeuft nichts im Repo aendern; vorher .git/logs/HEAD stagen.
* Nicht aus der Pruef-Kopie committen/pushen (Aenderungen dort per git stash beiseitelegen).
* Pruefkette: esbuild, tsc echt + Typfehler-Gegenprobe, node --test, GEGENPROBEN, SQL zweimal in PGlite + RLS-Probe.
* SQL additiv, idempotent, komplett in den Chat. Aussperrendes vorher sagen und getrennt liefern.
* GEMEINSAM: Rechnung/Angebot, Zahlung/Bank, Login/Auth.
* Kundentexte "Sie", Wort "Bausteine", Mitbewerber nie beim Namen.
* Nach jedem Push: Stand der Liste zeigen, Testtag-Punkte in /areas/argonaut-testtag-2.md sammeln. Durchbauen bis "Feierabend".

6. ERINNERUNG FUER "FEIERABEND"

Separates Thema "eigene KI / lokale KI (Ollama)" komplett auseinandernehmen - Datenschutz, nur Praxiswissen ohne echte Zahlen oder Namen der Kunden, Test naechste Woche gemeinsam.
