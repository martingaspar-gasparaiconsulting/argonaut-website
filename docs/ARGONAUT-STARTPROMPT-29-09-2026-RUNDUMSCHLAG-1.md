STARTPROMPT - NEUER CHAT ARGONAUT OS: GROSSER RUNDUMSCHLAG + RECHTS-/SICHERHEITSPRUEFUNG
Hallo Claude, ich bin Martin, Gruender von ARGONAUT OS. In diesem Chat machen wir den grossen Rundumschlag.

1. ZUERST (Chatstart-Ritual)
* Skill argonaut-chatstart: beide Ordner freigeben lassen
  C:\Users\Admin\Desktop\gaspar-ai-system
  C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
* Memory lesen: /preferences.md (verbindlich), /areas/argonaut-bauliste-0928.md (Baulog bis 164 Stufe 2 — Datei fast voll: NEUE Datei argonaut-bauliste-0929 anlegen), /areas/argonaut-testtag-3.md (Klicktests + Besprechungs-Checkliste), /areas/argonaut-anwalt-checkliste-2.md, /areas/argonaut-wissen.md (Abschnitt 6 Offen)
* .git/logs/HEAD und .git/refs/remotes/origin/main vom Geraet stagen: ist _p164b (Paket 164 Stufe 2) im Repo und gepusht?
* Repo per git clone (github.com/martingaspar-gasparaiconsulting/argonaut-website) in die Pruef-Kopie, npm i --ignore-scripts, npm test (Stand 3332 gruen). PGlite fuer SQL-Proben (npm i @electric-sql/pglite).

2. STAND (29.09.2026 nachmittags)
* LIVE: 167 Ablauf-Bausteine (7372f8c), 168 Knopf in den Modulen (8e09a1b), 164 Stufe 1 Zwei-Faktor einrichten (e3bec6b). SQL p167, p164, p164b ausgefuehrt.
* 164 Stufe 2 (Zwei-Faktor im Team, Pflicht-Schalter ZWEI_FAKTOR_PFLICHT=an in Vercel, Zuruecksetzen durch Chef + 1 Vertretung, Betreiber-Tuer im Command Center) per _p164b geliefert — Pflicht ist AUS, bis Martin den Schalter setzt.
* Werkzeug-Regeln: set GIT_LITERAL_PATHSPECS=1 in Bats ERST bei Schritt 3/4 (sonst scheitert git check-ignore im Zugangswaechter). device_commit_files: je Paket eigener outputs-Unterordner, danach Bytegroesse pruefen.
* Offen aus 164: Stufe 3 (Datenbank verlangt aal2 per restriktiven RLS-Regeln) — nur GEMEINSAM, hohes Aussperr-Risiko.

3. JETZT: GROSSER RUNDUMSCHLAG (Martins Wunsch 29.09.)
* Eine vollstaendige Liste als Claude Doc von ALLEM, was noch fehlt oder nach hinten geschoben wurde, geordnet nach Bereich und Prioritaet, mit „gemeinsam"/„Claude allein"/„Martin selbst". Mindestens:
  - Besprechungs-Checkliste aus argonaut-testtag-3 (P161-P168, P164)
  - 164 Stufe 3 (Datenbank aal2), Pflicht einschalten (wann?)
  - WhatsApp-Anmeldung mit Bestaetigung (eigenes Paket)
  - Angebot im Entwurf per Link annehmbar / Portal zeigt Entwuerfe (GEMEINSAM)
  - Geld-/Personal-Seiten mit Besitzer = eigene Kennung (Abo-Rechnungen, Eingangsbelege, Ausgaben, Reisekosten, Mitglieder, Personal, Provisionen, Nachkalkulation, Ernte-Zahlungen/Marktverkaeufe, Kundenportal-Zugaenge, Vertraege, Foerdervorhaben, Rueckholung) — GEMEINSAM
  - KI-Telefonassistent (Partner Retell oder Vapi, nie gebaut); eigene/lokale KI (Ollama) gemeinsam testen
  - Musterbetrieb XXL, Branchenverzeichnis-Eintrag mit einem Klick, Mitbewerber-Funktionen Top 10, KI-Bilder, Website-Texte aus Firmenwissen, Shop aus Inventar
  - Neue Bausteine: Presse, SEO-Texter, E-Book auf Knopfdruck, Strategie, Telefon, Social
  - Rechnungsseite rechnungen/[id]: parseZahl macht aus 1.234,56 den Wert 1,23 (Kern-Geld, GEMEINSAM)
  - Paket 2 Andocken (Aufmass-Formel, Kalkulator-Ist-Zeiten, echte Marge)
  - 72er-Liste offen: 35-40 DSGVO-Verzeichnis/Auskunft/Sperrung/Leads-Loeschweg/Webinar (nach Anwalt)
  - Eigene Absender-Domain je Betrieb; Upload > 2 GB in Teilen; Grosshandels-Schnittstelle UGL
  - Ablaeufe: Webhook-Neuversuch, Knopf fuer Mitarbeiter?, Wiederholung je Vorgang?, Ereignis-Filter im Editor, Loeschen von Ablaeufen, haengende Laeufe
  - Nebenpunkte: vertragsart 'studio' bei Vereinen; Umzug-Stapel geschuetzte Dateien; angebote.standort_id -> Rechnung; spende.zweck; termine_argo_select owner IS NULL; Widerrufe-Ansicht + Loeschfrist; Passwort aendern fragt 2FA-Code erneut
  - Offene Befunde argonaut-wissen Abschnitt 6 (Churn, ki-batch, Zeitzone pruefungen, Marktpreise, IBAN beim Check-in, MRR-Kachel, Wartungsvertrag naechste_faelligkeit, npm audit 17, centRunden)
  - Martin selbst: Resend Pro + MAIL_TAGESBUDGET + CRON_SECRET, 2FA fuers eigene Vercel-Konto, TOTP in Supabase, Probestapel Steuerberater, Anwalt Anfang Oktober
  - Martin muss entscheiden: Liste aus argonaut-wissen Abschnitt 6
  - Talent-Plattform (Idee), ARGONAUT Universum (Langfrist)
* Dazu eine RECHTS- UND SICHERHEITS-PRUEFUNG ueber alles Gebaute (Martin: „du findest immer wieder was") — systematisch am Code (alle app/api-Routen, Service-Role-Nutzung ohne owner-Filter, RLS-Luecken per Live-Abfrage, offene Tueren, Mail/Werbung/Einwilligung, KI-Datenfluesse, Datei-Uploads, Admin-Wege), Befunde nach Schwere (kritisch/hoch/mittel/niedrig), jeweils mit Fundstelle und Vorschlag. Rechtliches in die Anwalt-Checkliste.

4. DANACH: FACHBESCHREIBUNG JE BRANCHE (Muster Elektriker)
* 8-12 Seiten fuer Laien, Sie-Form; NUR was im Code wirklich gebaut ist; Vorgebautes/Gesperrtes als „in Vorbereitung". Danach Vorlage fuer alle Branchen.

5. REGELN (unveraendert)
* _pNNN.bat nie ueberschreiben, nur EINE Bat gleichzeitig offen; Pruefkette esbuild, tsc (ganzes Projekt) + Typfehler-Gegenprobe, node --test, GEGENPROBEN, SQL zweimal in PGlite.
* SQL additiv, idempotent, komplett in den Chat; Aussperr-Risiko vorher sagen und getrennt liefern. Auth/Geld/Bank nur GEMEINSAM.
* Kundentexte „Sie", Mitarbeitertexte anredefrei, Wort „Bausteine", Mitbewerber nie beim Namen.
* Diesen Startprompt (docs/ARGONAUT-STARTPROMPT-29-09-2026-RUNDUMSCHLAG-1.md) im naechsten Paket mit committen.
