STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Umzug/Import, ab Paket 149)
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird NUR GEBAUT (fuer den Testtag). Befunde aus dem Testtag-Chat (T1, T2, ...) repariert Claude mit Vorrang.

1. ZUERST (Chatstart-Ritual)
* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-import-umzug.md (Plan), /areas/argonaut-bauliste-0927.md (Baulog, Ende ab "28.09."), /areas/argonaut-testtag-2.md (Ende), /areas/argonaut-anwalt-checkliste-2.md (R29)
* .git/logs/HEAD vom Geraet stagen: welches Paket ist das letzte im Repo? Repo per git clone in die Pruef-Kopie (main).
* AGENTS.md: Next.js 16 mit Breaking Changes. Jede Datei vor dem Aendern frisch vom Geraet holen und am echten Code pruefen.

2. DIE WARTESCHLANGE (WICHTIG)
Die Pakete 142 bis 148 sind fertig gebaut und geprueft. Weil alle dieselben Kerndateien aendern, liegt immer nur EINE Bat im Repo; die naechste kommt erst aufs Geraet, wenn die vorige FERTIG ist (sonst committet die fruehere Bat Inhalt der spaeteren und der Build bricht).
* Stand beim Chatwechsel: _p140, _p141, _p142 LIVE (6273aa7). _p143 liegt im Repo-Ordner (Dateien schon geschrieben, Martin startet sie bzw. hat sie gestartet - HEAD pruefen).
* _p144 bis _p148 liegen vollstaendig (p143 ebenfalls, schon verbraucht) (Dateien + Bat, gleiche Ordnerstruktur wie im Repo) in:
  C:\Users\Admin\Desktop\gaspar-ai-system\Claude outputs\warteschlange\p143 ... p148
* Ablauf je Paket: .git/logs/HEAD stagen -> Vorgaenger im Repo? -> Dateien aus warteschlange\pNNN stagen und 1:1 an dieselben Pfade im Repo committen (device_commit_files) -> Martin startet _pNNN mit
  cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website\_pNNN.bat"
* Jede Bat prueft ihren Vorgaenger (Test-Datei im Repo) und bricht sonst ohne Push ab. Bricht der Build nur am Google-Font-Laden ab (dm_sans module-not-found), einfach dieselbe Bat noch einmal starten.
* SQL: nur p146 hatte SQL (angebote.standort_id) - von Martin am 28.09. ausgefuehrt und bestaetigt. 143-148 kein SQL.

3. WAS IN DEN PAKETEN IST (Kurz)
* 142 Aufwand nur nicht abgerechnet (projektleistungen)
* 143 Kautionen + Mietzahlungen (nur bezahlt, nur Chef)
* 144 Shop-Bestellungen als Archiv "abgeschlossen" (jsonPositionen), Shop-Seite Archiv getrennt
* 145 KI-Aufraeumer (Schritt 5): /api/import-aufraeumen, Box im Import-Center
* 146 Angebote als Archiv (Status archiv, Positionen in angebot_positionen, kindZeilen), Angebote-Seite Archiv getrennt, rechnung-aus-shop sperrt Archiv
* 147 Umzug alles auf einmal (Schritt 6): lib/umzugPlan.ts + UmzugStapel.tsx, Fixtures tests/fixtures/umzug (17 Haldenberg-Dateien)
* 148 vCard (Schritt 7 Teil 1): lib/vcardLeser.ts
* Tests nach 148: 3140 gruen.

4. JETZT BAUEN (Reihenfolge laut Plan, Martin: Freihand)
* Schritt 7 Rest: Datanorm 4/5 und BMEcat (Artikel/Preise, ERST Spezifikation recherchieren - WebSearch - nicht raten), UGL pruefen, iCal/ICS (Termine: braucht neues Ziel + import_feldkatalog-SQL), DATEV-Rest
* Anwalt zuerst: Gesundheit, Tier, hilfsmittel, akten (nur mit Anwalt-Freigabe scharf)
* Schritt 8: je Branchengruppe ein Muster-Umzugskarton durch die echten Import-Programme
* DANACH Ablaeufe (n8n-artig), siehe argonaut-import-umzug
* Sicherheit hinten: Zwei-Faktor (GEMEINSAM), Paket S1, owner-Umstellung ~46 Seiten, schreib_module fast nirgends geprueft (Claude-Befund)

5. CLAUDE-BEFUNDE 28.09. FUER DEN TESTTAG
* angebote.standort_id fehlte live (seit Block D 09.08.) -> "-> Rechnung" aus Angebot und Anlegen mit Standort scheiterten; per SQL p146 nachgeholt: am Testtag pruefen.
* spende.zweck wird auf die Zuwendungsbestaetigung gedruckt -> alte Bestaetigungsnummer steht in der Notiz.
* mitglieder/shop_bestellungen: Mitarbeiter duerfen dort laut RLS nichts fuer den Betrieb anlegen -> Import nur Chef.

6. LIEFERWEG UND REGELN (unveraendert)
* _pNNN.bat nie ueberschreiben; Pruefkette: esbuild, tsc + Typfehler-Gegenprobe, node --test, GEGENPROBEN (jede Reparatur einzeln zurueckdrehen -> rot), SQL zweimal in PGlite (PGlite im Scratchpad installieren).
* SQL additiv, idempotent, komplett in den Chat. Kundentexte "Sie", Wort "Bausteine", Mitbewerber nie beim Namen.
* Nach jedem Push: Stand der Liste + Testtag-Punkte sammeln. Durchbauen bis "Feierabend".
* Diesen Startprompt (docs/ARGONAUT-STARTPROMPT-28-09-2026-IMPORT-6.md) im naechsten eigenen Paket (149) mit committen.
