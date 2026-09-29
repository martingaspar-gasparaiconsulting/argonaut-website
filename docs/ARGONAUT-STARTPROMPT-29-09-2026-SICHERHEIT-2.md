STARTPROMPT - NEUER BAU-CHAT ARGONAUT OS (ab Paket 167)
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat wird GEBAUT, danach gibt es den grossen Rundumschlag.

1. ZUERST (Chatstart-Ritual)
* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-bauliste-0928.md (Baulog, Pakete 161-166 stehen dort), /areas/argonaut-testtag-3.md (Klicktests UND die Besprechungs-Checkliste oben), /areas/argonaut-anwalt-checkliste-2.md, /areas/argonaut-wissen.md (Abschnitt 6 Offen)
* .git/logs/HEAD und .git/refs/remotes/origin/main vom Geraet stagen: letztes Paket im Repo UND gepusht?
* Repo per git clone (oeffentlich, github.com/martingaspar-gasparaiconsulting/argonaut-website) in die Pruef-Kopie im Scratchpad, npm i --ignore-scripts, npm test (Stand 3303 gruen). PGlite fuer SQL-Proben in eigenem Ordner (npm i @electric-sql/pglite).
* AGENTS.md: Next.js 16 mit Breaking Changes (proxy.ts statt middleware). Jede Datei vor dem Aendern frisch vom Geraet holen und gegen den Stand von origin/main vergleichen.

2. STAND (29.09.2026)
* LIVE bis Paket 166 (8fd4d87). ALLE SQL-Bloecke bis p166 sind ausgefuehrt.
* 161 S1 offene Tueren: Mengen-Deckel lib/drossel.ts (+SQL oeffentlich_drossel), mail-klick signiert (lib/mailKlickSignatur.ts), Widerrufe in shop_widerrufe, Rahmen-Schutz nur Dashboard/Admin/Auth. lib/offeneTueren.ts: 3 Tueren mit Feld "offen" (whatsapp-optin, oeffentlich/angebot, oeffentlich/portal).
* 162 S2 Nachweisbarkeit: setze_erfasser() auf 9 Tabellen, Ablauf-Entscheidung wer/wann. Waechter: Erfasser nie in Auswertung/Kennzahl/Rangliste.
* 163 S3 proxy.ts getUser statt getSession.
* 165 Besitzer = Betrieb Teil 2: 17 Tabellen mit Trigger p165_besitzer + MA-Regeln (anlegen/aendern nur mit Schreibrecht darf_ich_modul_aendern). Philip, Simone, Test-Mitarbeiter haben live KEINE Schreibrechte.
* 166 Ablaeufe Ausloeser Ereignis: Warteschlange ablauf_ereignisse + AFTER-Trigger (exception-sicher) auf rechnungen, angebote, kontakte, leads, auftraege, termine, aufgaben; Motor Teil 4 (stuendlich, Massenanlage/Import startet nichts, 48 h, Deckel 25/24h). Webhook-Ausloeser von aussen gestrichen.

3. JETZT BAUEN (Reihenfolge)
* 167 Ablauf-Bausteine im Motor: Glocke (benachrichtigung_erstellen), Termin anlegen, PDF erstellen, KI-Schritt NUR als Entwurf (nie automatisch verschicken), Webhook NUR nach aussen (AVV-Hinweis, Adresspruefung lib/adressPruefung.ts gegen interne Adressen, signiert). ABLAUF_AKTIONEN imMotor + aktionPlanen + fuehreAus in lib/ablaufAusfuehren.ts. Tests + Gegenproben.
* 164 Zwei-Faktor-Anmeldung (GEMEINSAM, Auth): Martin 27.09.: Pflicht fuer JEDE Anmeldung (Chef, Mitarbeiter, Betreiber). Supabase MFA (TOTP), Einrichtungs-Seite, Pruefung im proxy.ts (aal2), Notfall-Codes/Rueckweg. AUSSPERR-RISIKO: vorher sagen, getrennt liefern, erst Einrichten ermoeglichen, dann Pflicht per Schalter.
* 168 Knopf direkt in den Modulen (Ablauf per Knopf mit Vorgang) — Rechnungs-/Angebotsseite NICHT anfassen (GEMEINSAM).

4. DANACH: GROSSER RUNDUMSCHLAG (Martins Wunsch 29.09.)
* Eine vollstaendige Liste (als Claude Doc) von ALLEM, was noch fehlt oder nach hinten geschoben wurde. Mindestens:
  - Besprechungs-Checkliste aus argonaut-testtag-3 (alle P161-P166-Punkte)
  - WhatsApp-Anmeldung mit Bestaetigung (eigenes Paket)
  - Angebot im Entwurf per Link annehmbar / Portal zeigt Entwuerfe (GEMEINSAM)
  - Geld-/Personal-Seiten mit Besitzer = eigene Kennung: Abo-Rechnungen, Eingangsbelege, Ausgaben, Reisekosten, Mitglieder, Personal, Provisionen, Nachkalkulation, Ernte-Zahlungen/Marktverkaeufe, Kundenportal-Zugaenge, Vertraege, Foerdervorhaben, Rueckholung (Chefsache?) — GEMEINSAM
  - KI-Telefonassistent (Partner Retell oder Vapi, nie gebaut)
  - Eigene KI / lokale KI (Ollama) gemeinsam testen
  - Musterbetrieb XXL fuer den Testtag, Branchenverzeichnis-Eintrag mit einem Klick, Mitbewerber-Funktionen Top 10, KI-Bilder, Website-Texte aus Firmenwissen, Shop aus Inventar mit Bildern
  - Neue Bausteine: Presse, SEO-Texter, E-Book auf Knopfdruck, Strategie, Telefon, Social
  - Rechnungsseite rechnungen/[id]: parseZahl macht aus 1.234,56 den Wert 1,23 (Kern-Geld, GEMEINSAM)
  - Paket 2 Andocken (Aufmass-Formel, Kalkulator-Ist-Zeiten, echte Marge)
  - 72er-Liste offen: 35-40 DSGVO-Verzeichnis/Auskunft/Sperrung/Leads-Loeschweg/Webinar (nach Anwalt, GEMEINSAM)
  - Eigene Absender-Domain je Betrieb (heute alles ueber noreply@argonaut-os.com)
  - Upload grosser Mengen (> 2 GB) in Teilen + Hintergrund-Verarbeitung; Grosshandels-Schnittstelle UGL (Bestellung senden, Angebot empfangen)
  - Nebenpunkte: Mitglieder-Import vertragsart 'studio' bei Vereinen; Umzug-Stapel geschuetzte Dateien; angebote.standort_id -> Rechnung; spende.zweck; termine_argo_select owner IS NULL; Widerrufe-Ansicht + Loeschfrist; Ereignis-Filter im Editor
  - Offene Befunde aus argonaut-wissen Abschnitt 6 (Churn, ki-batch, Zeitzone pruefungen, Marktpreise, IBAN beim Check-in, MRR-Kachel, Wartungsvertrag naechste_faelligkeit, npm audit 17)
  - Martin selbst: Resend Pro + MAIL_TAGESBUDGET + CRON_SECRET, 2FA fuers eigene Vercel-Konto, Probestapel Steuerberater, Anwalt Anfang Oktober
  - Martin muss entscheiden: Liste aus argonaut-wissen Abschnitt 6
  - Talent-Plattform (Idee), ARGONAUT Universum (Langfrist)
* Dazu eine RECHTS- UND SICHERHEITS-PRUEFUNG ueber alles Gebaute (Martin: „du findest immer wieder was") — systematisch, am Code, mit Befunden nach Schwere.

5. DANACH: FACHBESCHREIBUNG JE BRANCHE (Muster Elektriker)
* 8-12 Seiten fuer Laien, Sie-Form: Auf einen Blick, Ein Tag im Betrieb, Was drin ist (nach Bereichen), Was automatisch laeuft (Ablaeufe), Bausteine, Umzug, Sicherheit/Recht, FAQ, Glossar.
* NUR was im Code wirklich gebaut ist (am Code pruefen); Vorgebautes/Gesperrtes als "in Vorbereitung". Keine Mitbewerber-Namen, keine erfundenen Zahlen, "Bausteine" statt "KI-Agenten". Danach Vorlage fuer alle Branchen.

6. LIEFERWEG UND REGELN (unveraendert)
* _pNNN.bat nie ueberschreiben, nur EINE Bat gleichzeitig offen (naechste erst nach Push); jede Bat prueft, ob das Vorgaenger-Paket im Repo ist.
* WERKZEUG-FALLE: device_commit_files mit GLEICHEM stagedPath liefert u. U. die alte Fassung -> je Paket eigener outputs-Unterordner, danach Bytegroesse per device_list_dir pruefen.
* Pruefkette: esbuild, tsc (ganzes Projekt) + Typfehler-Gegenprobe, node --test, GEGENPROBEN (jede Regel einzeln zurueckdrehen -> rot), SQL zweimal in PGlite + Verhaltens-Probe.
* SQL additiv, idempotent, komplett in den Chat; Aussperr-Risiko vorher sagen und getrennt liefern.
* Nach jedem Push: Stand der Liste + Testtag-Klickpunkte UND Besprechungspunkte in argonaut-testtag-3.
* Kundentexte "Sie", Mitarbeitertexte anredefrei, Wort "Bausteine", Mitbewerber nie beim Namen.
* Diesen Startprompt (docs/ARGONAUT-STARTPROMPT-29-09-2026-SICHERHEIT-2.md) im Paket 167 mit committen.
