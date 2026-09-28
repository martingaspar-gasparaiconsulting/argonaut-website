STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (Ablaeufe, ab Paket 157)
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird NUR GEBAUT (fuer den Testtag). Befunde aus dem Testtag-Chat (T1, T2, ...) repariert Claude mit Vorrang.

1. ZUERST (Chatstart-Ritual)
* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-import-umzug.md (Beschluss Ablaeufe), /areas/argonaut-bauliste-0928.md (Baulog, komplett - Paketplan Ablaeufe steht dort), /areas/argonaut-testtag-2.md (Ende, fast voll -> bei Bedarf argonaut-testtag-3 anlegen), /areas/argonaut-anwalt-checkliste-2.md (R29-R31), /areas/argonaut-wissen.md (Abschnitt 6 Offen)
* .git/logs/HEAD UND .git/refs/remotes/origin/main vom Geraet stagen: welches Paket ist das letzte im Repo UND gepusht?
* Repo per git clone (oeffentlich, github.com/martingaspar-gasparaiconsulting/argonaut-website) in die Pruef-Kopie im Scratchpad, npm i --ignore-scripts, npm test (Stand 3216 gruen).
* AGENTS.md: Next.js 16 mit Breaking Changes. Jede Datei vor dem Aendern frisch vom Geraet holen und am echten Code pruefen.

2. STAND BEIM CHATWECHSEL (28.09.2026 abends)
* LIVE bis 155 (c494c27). Umzug Schritt 1-8 KOMPLETT, Anwalt-Block (Patienten, Praxis-Behandlungen, Tiere, Tier-Behandlungen, Hilfsmittel, Akten, Fristen) vorgebaut und GESPERRT per lib/anwaltFreigabe.ts (alles false).
* Paket 156 (Ablauf-Kern: lib/ablauf.ts + SQL p156, 4 Tabellen) ist committet (5d2715c), SQL p156 ausgefuehrt (13/2, 14/4, 10/3, 9/3). Der Vercel-Build brach NUR am Google-Font-Laden ab (dm_sans, Netzwerk bei Vercel) -> in Vercel "Redeploy" auf 5d2715c; pruefen, ob 156 Ready ist.
* Live-Feldkatalog aller Import-Tabellen: tests/fixtures/live-katalog-2026-09-28.csv - fuer neue Import-Tests benutzen.

3. JETZT BAUEN (Ablaeufe, Paketplan)
* 157 Motor: neuer Cron /api/cron/ablaeufe (cronGuard wie /api/cron/automationen, Service-Role, streng owner_user_id). Datum-Ausloeser wie die alten Regeln (Tabelle/Grundfilter/datumFeld aus lib/automation TRIGGER, filter = BedingungsGruppe), Laeufe anlegen (einmalig per Unique-Index), fahrplan() abarbeiten, Warten (status wartet + weiter_am), Chef-Freigabe (status freigabe, Knopf auf der Seite), Stopp, Protokoll je Schritt, Probelauf (?probe=1, probe=true, nichts ausgefuehrt). Die 5 alten Aktionen wiederverwenden (Mail nur mit werbeStatus bei Werbung, Deckel MAX_JE_ABLAUF, RUECKBLICK). freigabe_chef dann imMotor true. Alte Regel -> Ablauf per Knopf (regelZuAblauf), alte Regel wird erst beim Einschalten des Ablaufs ausgeschaltet (nie beide aktiv). vercel.json Cron-Eintrag pruefen.
* 158 Oberflaeche /dashboard/ablaeufe: Karten-Kette mit +, Wenn/Sonst, Warten, Probelauf-Anzeige, Versionen (ablauf_versionen), Vorlagen-Galerie je Branche, Freigabe-Liste fuer den Chef.
* 159 Ereignis-/Knopf-/Zeitplan-Ausloeser. 160 Glocke, Termin, PDF, KI-Baustein (nur Entwurf), Webhook rein/raus (n8n-Bruecke, AVV-Hinweis).
* Danach Sicherheit: Zwei-Faktor (GEMEINSAM), Paket S1, owner-Umstellung ~46 Seiten, schreib_module.

4. CLAUDE-BEFUNDE 28.09. FUER DEN TESTTAG / OFFEN
* Rueckgaengig eines Praxis-Behandlungs-Imports loescht die verschluesselten Notizen beim Patienten nicht; bricht ein 2. Notiz-Stapel ab, entstehen beim Wiederholen doppelte Notizen (nur relevant nach Anwalt-Freigabe).
* Umzug-Stapel: Nutzer kann ein geschuetztes File per Hand einem anderen Ziel zuordnen (Dropdown) - pruefen, ob sperren.
* Mitglieder-Import setzt vertragsart Standard 'studio' auch fuer Vereine.
* angebote.standort_id (p146) -> "-> Rechnung" aus Angebot pruefen; spende.zweck auf Zuwendungsbestaetigung; termine_argo_select owner IS NULL toter Zweig.

5. LIEFERWEG UND REGELN (unveraendert)
* _pNNN.bat nie ueberschreiben, nur EINE Bat im Repo gleichzeitig offen (naechste erst nach Push). Pruefkette: esbuild, tsc (echte Pakete) + Typfehler-Gegenprobe, node --test, GEGENPROBEN (jede Regel einzeln zurueckdrehen -> rot; redundante Stellen entfernen), SQL zweimal in PGlite (Scratchpad pgl/), zahlenWaechter (leseZahl aus lib/zahlen statt eigener Zahlen-Leser).
* SQL additiv, idempotent, komplett in den Chat. Kundentexte "Sie", Wort "Bausteine", Mitbewerber nie beim Namen.
* Nach jedem Push: Stand der Liste + Testtag-Punkte sammeln. Durchbauen bis "Feierabend".
* Diesen Startprompt (docs/ARGONAUT-STARTPROMPT-28-09-2026-ABLAEUFE-1.md) im naechsten eigenen Paket (157) mit committen.
