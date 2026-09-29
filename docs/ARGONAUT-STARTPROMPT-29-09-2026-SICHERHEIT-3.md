STARTPROMPT - NEUER CHAT ARGONAUT OS: SICHERHEIT STUFE 0 ABSCHLIESSEN (173) + STUFE 1
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. Wir bauen die Bauliste nach der Rechts-/Sicherheitspruefung vom 29.09. weiter ab.

1. ZUERST (Chatstart-Ritual)
* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-bauliste-0929.md (aktueller Baulog), /areas/argonaut-testtag-3.md, /areas/argonaut-anwalt-checkliste-2.md
* Bauliste IMMER im Blick: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T, Quelle docs/bauliste/ (rows.py, kosten.py, gen.py, LIESMICH.md). Nach jedem fertigen Push: Status in rows.py auf "live" -> Zeile gold, Fortschrittsbalken; Artifact mit url neu veroeffentlichen.
* Rundumschlag-Doc (Befunde mit Fundstellen): https://claude.ai/code/artifact/4ff7a560-0e3e-45f6-bde6-087204a5e81d
* .git/logs/HEAD + refs/remotes/origin/main stagen; Pruef-Kopie per git clone (github.com/martingaspar-gasparaiconsulting/argonaut-website), npm i --ignore-scripts, npm test (Stand 3342 gruen), PGlite fuer SQL (npm i --no-save @electric-sql/pglite).

2. STAND (29.09.2026 abends)
* LIVE: 164 Stufe 2 (e3725e7), 169 Konto-Schutz (24638ec, SQL p169 ok), 170 Admin-Doppelschloss (56d5786). 4 von 45 Pushes erledigt.
* Untracked im Repo, mit _p173 committen: docs/bauliste/*, docs/ARGONAUT-STARTPROMPT-29-09-2026-SICHERHEIT-3.md (diese Datei).
* Offen aus 169: rechnung_zahlbetrag_neu_berechnen prueft fuer Angemeldete keinen Besitzer -> Funktionskoerper live lesen, in Paket 175 absichern.

3. JETZT: PAKET 173 Werbe-Mails rechtssicher (Befunde K6, H7-H10, M7, M8)
* Autoresponder (app/api/autoresponder/eintragen, lib/autoresponderVersand.ts): nur bestaetigte Abonnenten / Kontakte mit werbeStatus erlaubt.
* Bewertungs-Kampagne + bewertung-senden: werbeStatus-Filter, Werbe-Fuss, List-Unsubscribe.
* website-anfrage startet ungefragt Dossier-DOI -> nur mit eigenem Haekchen (Serie genannt); /testen-Text anpassen.
* cron/termin-nachfass: escapeHtml(name), Abmeldelink.
* cron/automationen + lib/ablaufAusfuehren: kundenMailLayout mit werbung/abmeldeLink, absenderName/antwortAn/kundenPost wie rueckholung.
* Abmeldung kanaluebergreifend (Widerspruch am Kontakt), werbeFuss + werbeKopfzeilen in Rueckholung, Freebie, Webinar, Dossier, Lead-Nachfass.
* Newsletter-Versand nur mit bestaetigt_am (Standardwert der Spalte live pruefen).
* Danach Stufe 1: 174 Mandanten-Luecken DB, 175 Geld-Routen (GEMEINSAM), 176 KI-Regeln, 177 Churn (GEMEINSAM), 178 Datenschutzerklaerung, 179 Musterbetrieb XXL, 188 Voice Stufe 1.

4. REGELN (unveraendert)
* _pNNN.bat nie ueberschreiben, nur EINE gleichzeitig; GIT_LITERAL_PATHSPECS=1 erst bei Schritt 3/4; device_commit_files je Paket eigener outputs-Unterordner, Bytegroesse pruefen.
* Pruefkette: esbuild, tsc ganzes Projekt + Typfehler-Gegenprobe, node --test, GEGENPROBEN (jede Reparatur einzeln zurueck -> rot), SQL zweimal in PGlite.
* Nicht aus der Cloud-Pruefkopie pushen (Stop-Hook ignorieren, Aenderungen dort nur stashen).
* SQL additiv, idempotent, komplett in den Chat; Aussperr-Risiko vorher sagen, getrennt liefern. Auth/Geld/Bank nur GEMEINSAM.
* Kundentexte „Sie", Mitarbeitertexte anredefrei, Wort „Bausteine", Mitbewerber nie beim Namen.
