STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Umzug/Import, ab Paket 153)
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird NUR GEBAUT (fuer den Testtag). Befunde aus dem Testtag-Chat (T1, T2, ...) repariert Claude mit Vorrang.

1. ZUERST (Chatstart-Ritual)
* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-import-umzug.md (Plan), /areas/argonaut-bauliste-0928.md (Baulog, komplett), /areas/argonaut-testtag-2.md (Ende), /areas/argonaut-anwalt-checkliste-2.md (R29, R30), /areas/argonaut-wissen.md (Abschnitt 6 Offen)
* .git/logs/HEAD UND .git/refs/remotes/origin/main vom Geraet stagen: welches Paket ist das letzte im Repo UND gepusht?
* Repo per git clone (oeffentlich, github.com/martingaspar-gasparaiconsulting/argonaut-website) in die Pruef-Kopie im Scratchpad, npm i --ignore-scripts, dann die Warteschlange drueberlegen.
* AGENTS.md: Next.js 16 mit Breaking Changes. Jede Datei vor dem Aendern frisch vom Geraet holen und am echten Code pruefen.

2. DIE WARTESCHLANGE (WICHTIG)
Immer nur EINE Bat im Repo; die naechste erst aufs Geraet, wenn die vorige gepusht ist (origin/main = HEAD pruefen). Dateien liegen 1:1 in Repo-Struktur unter
  C:\Users\Admin\Desktop\gaspar-ai-system\Claude outputs\warteschlange\pNNN
* Stand beim Chatwechsel: 140-149 LIVE (149 = f412881). _p150 (BMEcat) liegt im Repo-Ordner und lief gerade (Build).
* Noch in der Warteschlange: p151 (Termine + iCal) und p152 (DATEV im Umzug-Stapel).
* SQL p151 hat Martin am 28.09. schon ausgefuehrt (Kontrolle: termine 27 Spalten). p152 kein SQL.
* Ablauf je Paket: HEAD + origin stagen -> Vorgaenger gepusht? -> Dateien aus warteschlange\pNNN stagen, nach /mnt/user-data/outputs kopieren, 1:1 an dieselben Pfade im Repo committen (device_commit_files) -> Martin startet
  cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website\_pNNN.bat"
* Bricht der Build nur am Google-Font-Laden ab (dm_sans), dieselbe Bat noch einmal starten.

3. WAS IN 149-152 IST (Kurz)
* 149 DATANORM 4/5 (lib/datanormLeser.ts): CP850, PE 10/100/1000 umgerechnet, Brutto->VK, Netto->EK, DATPREIS gemeinsam waehlen, V5-Endesatz-Pruefung. V5-P-Satz/Rabattregeln bewusst nicht geraten.
* 150 BMEcat 1.2/2005 (lib/bmecatLeser.ts, eigener XML-Leser): net_list->VK, net_customer->EK, Faktor/Preismenge, Staffel, Brutto nur mit TAX, Fremdwaehrung nie; Import-Center nimmt .xml.
* 151 Termine (neues Ziel termine, MOTOR_TABELLEN 73) + iCal (lib/icalLeser.ts): Zeitzonen via Intl, ganztags, Serie nur erster Termin, keine automatischen Mails fuer importierte Termine, ende_am standard '' (Live-Pflicht).
* 152 DATEV im Umzug-Stapel: Kat. 16 zweimal eingeplant (Kunden + Kreditoren-Kopie als Lieferanten), uebrige Kategorien mit Grund.
* UGL geprueft: kein Umzugsformat (Vorgangsaustausch mit Grosshandel) -> Wunschliste Grosshandels-Schnittstelle.
* Tests nach 152: 3167 gruen.

4. JETZT BAUEN (Reihenfolge laut Plan, Martin: Freihand, Schritt fuer Schritt)
* Schritt 7 ist FERTIG.
* Anwalt-Block: Gesundheit (Praxis, Gesundheitsdaten verschluesselt, GESUNDHEIT_SCHLUESSEL), Tier, Karten hilfsmittel + akten (heute nur Vorlage, kein Motor). Nur vorbauen, SCHARF erst mit Anwalt-Freigabe (Schalter/Sperre wie altsysteme sperre 'anwalt'). Vorher Live-Schema der Tabellen per Nur-Lese-SQL abfragen (wie bei termine).
* Schritt 8: je Branchengruppe ein Muster-Umzugskarton durch die echten Import-Programme (Fixtures + Tests wie tests/fixtures/umzug).
* DANACH Ablaeufe (n8n-artig), siehe argonaut-import-umzug.
* Sicherheit hinten: Zwei-Faktor (GEMEINSAM), Paket S1, owner-Umstellung ~46 Seiten (u. a. termine-Seite speichert owner_user_id: uid), schreib_module fast nirgends geprueft.

5. CLAUDE-BEFUNDE 28.09. FUER DEN TESTTAG
* angebote.standort_id per SQL p146 nachgeholt: "-> Rechnung" aus Angebot pruefen.
* spende.zweck wird auf die Zuwendungsbestaetigung gedruckt -> alte Bestaetigungsnummer in der Notiz.
* termine_argo_select erlaubt owner_user_id IS NULL (toter Zweig, Spalte ist NOT NULL) - nur Hinweis.
* Umzug-Stapel erkannte DATEV-Dateien vorher gar nicht (p152 behebt).

6. LIEFERWEG UND REGELN (unveraendert)
* _pNNN.bat nie ueberschreiben; Pruefkette: esbuild, tsc (echte Pakete) + Typfehler-Gegenprobe, node --test, GEGENPROBEN (jede Regel einzeln zurueckdrehen -> rot; redundante Stellen entfernen), SQL zweimal in PGlite (im Scratchpad pgl/).
* Tests fuer Import-Ziele mit Live-Katalog nachbauen (dbFuer mit echten Pflichtspalten) - so wurde der ende_am-Fehler gefunden.
* SQL additiv, idempotent, komplett in den Chat. Kundentexte "Sie", Wort "Bausteine", Mitbewerber nie beim Namen.
* Nach jedem Push: Stand der Liste + Testtag-Punkte sammeln. Durchbauen bis "Feierabend".
* Diesen Startprompt (docs/ARGONAUT-STARTPROMPT-28-09-2026-IMPORT-7.md) im naechsten eigenen Paket (153) mit committen.
