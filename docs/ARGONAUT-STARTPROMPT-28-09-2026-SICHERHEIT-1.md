STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Sicherheit S1 ff., ab Paket 161)
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird NUR GEBAUT (fuer den Testtag).

1. ZUERST (Chatstart-Ritual)
* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-bauliste-0928.md (Baulog, komplett - Sicherheits-Regel + Paket 160 S0 stehen dort), /areas/argonaut-testtag-2.md (fast voll -> bei Bedarf argonaut-testtag-3 anlegen), /areas/argonaut-anwalt-checkliste-2.md, /areas/argonaut-wissen.md (Abschnitt 6 Offen)
* .git/logs/HEAD UND .git/refs/remotes/origin/main vom Geraet stagen: welches Paket ist das letzte im Repo UND gepusht?
* Repo per git clone (oeffentlich, github.com/martingaspar-gasparaiconsulting/argonaut-website) in die Pruef-Kopie im Scratchpad, npm i --ignore-scripts, npm test (Stand 3251 gruen).
* AGENTS.md: Next.js 16 mit Breaking Changes. Jede Datei vor dem Aendern frisch vom Geraet holen und am echten Code pruefen.

2. STAND (28.09.2026 abends)
* LIVE bis Paket 160 (7b2394f). Ablaeufe 156-159 live: Kern, Motor (Cron /api/cron/ablaeufe stuendlich, nur CRON_SECRET), Baukasten mit Karten-Kette, 9 Vorlagen je Branche, Fassungen, Ausloeser Datum/Zeitplan/Knopf, Chef-Freigabe, Probelauf, Protokoll.
* Paket 160 = S0 Login-Pflicht: lib/nurAngemeldet.ts, 13 interne Routen mit Login, Preisauskunft (API-Schluessel von aussen) abgeschaltet, lib/offeneTueren.ts (42 offene Tueren mit Grund/Schutz/geprueft), Waechter-Test tests/zugangWaechterS0.test.mjs (Build rot bei Route ohne Login, die nicht auf der Liste steht; gitignorte lokale Dateien zaehlen nicht).

3. MARTINS SICHERHEITS-REGEL (verbindlich, 28.09.2026)
* Was ein Betrieb intern macht oder verschickt (Rechnung schreiben, Mahnung, Kunden-/Personaldaten, KI-Auswertungen) darf NIE von aussen angestossen werden - nur mit Login, nachvollziehbar wer.
* Offen bleiben darf, was Besucher/Kunden tun muessen: Webseite, Shop, Buchung, Anfrage, Double-Opt-in, Abmelden, Widerruf, Portal-Link.
* Abläufe: "Webhook rein" gestrichen, nur raus.
* argonaut-os.com hat KEINEN Verkaufs-Chat (WebsiteChat/WebsiteChatGate = toter Code); einzige Frage-Stelle: BranchenChat auf den Branchenseiten (/api/oeffentlich/branchen-chat, ohne Limit).

4. JETZT BAUEN (Abarbeitungsliste)
* 161 S1: die 42 offenen Tueren aus lib/offeneTueren.ts einzeln pruefen (geprueft:false -> true): nur eigener Zweck, liest nie mehr aus dem Betrieb als noetig, Mengenlimit (branchen-chat, website-anfrage, web-anfrage, buchung, shop-bestellung, freebie/optin ...), Protokoll; Einbettungs-Schutz (frame-ancestors) + Sicherheits-Header pruefen (tests/sicherheitsKopfzeilen.test.mjs existiert). Bereits angesehen und gut: portal/bezahlt-melden (setzt nur zahlung_gemeldet_am, nie bezahlt), portal/freigabe, oeffentlich/angebot (Token, nur offen->angenommen/abgelehnt), portal/rechnung, portal, shop-bestellung (Pflichtfelder, Datenschutz-Haken). Toten WebsiteChat + WebsiteChatGate loeschen.
* 162 S2 Nachweisbarkeit: jede Aenderung speichert wer (Punkt 73), inkl. Ablauf-Freigabe (heute nur Text "Freigegeben"). Mit SQL.
* 163 proxy.ts getSession -> getUser (GEMEINSAM, Login).
* 164 Zwei-Faktor-Anmeldung (GEMEINSAM).
* 165 Besitzer-Umstellung ~46 Seiten + schreib_module ueberall.
* 166 Ablaeufe Ereignis-Ausloeser (SQL-Trigger auf Kern-Tabellen, exception-sicher, nur wenn Betrieb passenden Ablauf hat; getrennt liefern).
* 167 Ablaeufe Bausteine Glocke, Termin, PDF, KI-Entwurf, Webhook NUR raus (AVV-Hinweis).
* 168 Knopf in den Modulen (Rechnungs-/Angebotsseite NICHT anfassen).
* Nebenbei: Mitglieder-Import vertragsart 'studio' bei Vereinen; Umzug-Stapel geschuetzte Dateien nicht umlenkbar; Pruefstellen angebote.standort_id -> Rechnung, spende.zweck, termine_argo_select owner IS NULL.

5. LIEFERWEG UND REGELN (unveraendert)
* _pNNN.bat nie ueberschreiben, nur EINE Bat im Repo gleichzeitig offen (naechste erst nach Push). Warteschlange: C:\Users\Admin\Desktop\gaspar-ai-system\Claude outputs\warteschlange\pNNN.
* WERKZEUG-FALLE: device_commit_files mit GLEICHEM stagedPath liefert u. U. die alte Fassung -> bei Korrektur neuen Dateinamen im outputs-Ordner nehmen und danach per stage die Bytegroesse pruefen.
* Pruefkette: esbuild, tsc (ganzes Projekt, echte Pakete) + Typfehler-Gegenprobe, node --test, GEGENPROBEN (jede Regel einzeln zurueckdrehen -> rot; redundante Stellen entfernen), SQL zweimal in PGlite, zahlenWaechter.
* SQL additiv, idempotent, komplett in den Chat. Kundentexte "Sie", Mitarbeitertexte anredefrei, Wort "Bausteine", Mitbewerber nie beim Namen.
* Nach jedem Push: Stand der Liste + Testtag-Punkte sammeln. Durchbauen bis "Feierabend".
* Diesen Startprompt (docs/ARGONAUT-STARTPROMPT-28-09-2026-SICHERHEIT-1.md) im naechsten eigenen Paket (161) mit committen.
