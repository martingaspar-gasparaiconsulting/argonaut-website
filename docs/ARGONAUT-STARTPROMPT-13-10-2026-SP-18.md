# ARGONAUT Startprompt SP-18 (13.10.2026, ca. 12:45)

Vorgaenger: SP-17. Baulog: Memory /areas/argonaut-bauliste-1012.md (Abschnitt „13.10. vormittags (Chat SP-17)") · Kontrollgang /areas/argonaut-kontrollgang-2.md · Testtag /areas/argonaut-testtag-4.md · Anwalt /areas/argonaut-anwalt-checkliste-2.md, naechste freie Nummer R56.

## Stand
- P350 (A2 Datei-Sicherung) live 386188c, SQL p350 live 3|7|3|0|1. A2 „wartet auf Martin": Hetzner-Konto + privater Bucket, sechs Vercel-Werte SPEICHER_SICHERUNG_ENDPOINT/_REGION/_BUCKET/_KEY_ID/_SECRET/_SCHLUESSEL (64 Hex, offline aufbewahren), danach im Command Center „Probe-Wiederherstellung". Ohne Werte passiert nichts.
- P351 (A3 Standard-Dossier fuer 10 Branchen) live 89fea2b, kein SQL.
- Bauliste: 188/275 (68 %), 87 offen, Artifact https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T Version 152 „P351 live". Die Academy (Stufe 3g, AK1–AK7, 12 Pushes) steht seit SP-17 auch in docs/bauliste/rows.py (vorher nur im Artifact).
- Diese Datei ist untracked: mit P352 committen.

## Naechster: A4a Fachpaket Bestatter (1 Push, Claude)
Bauliste: Sterbefall-Akte, Behoerden-Checkliste (Standesamt, Friedhof, Rente, Krankenkasse), Kostenvoranschlag aus dem Leistungskatalog, Friedhofsgebuehren als durchlaufende Posten (Steuerberater), Vollmachten als eigene Vorlage, Partner ueber das Netzwerk (Steinmetz, Florist, Trauerredner).
Bestandsaufnahme (SP-17): im Code gibt es fuer Bestatter NICHTS ausser dem Katalog-Eintrag (Slug bestattungsunternehmen, Kategorie Dienstleistungen; Paket dort: einsaetze, objektzeiten, wartung, wiederkehr, schichtplan, tour, service). Vorhanden zum Andocken: Partner-Netzwerk (P278/P279, lib/partnerNetzwerk.ts), Meine Rechtstexte (P347, lib/rechtsTexte.ts — Vollmacht als neuer Katalog-Eintrag, NIE eigener ARGONAUT-Wortlaut), Leistungskatalog/Angebote, Rechnungen (durchlaufende Posten: pruefen, ob Rechnungspositionen das schon koennen, sonst Steuerberater-Frage R56).
Plan-Vorschlag: SQL p352 sterbefall (owner_user_id, Verstorbene/r, Sterbedatum/-ort, Auftraggeber = Kontakt, Bestattungsart, Status) + sterbefall_aufgabe (Checkliste mit Faellig/erledigt) — Daten Verstorbener/Angehoeriger: RLS wie ueblich, MA-Recht Modul, DSGVO-Landkarte + sicherungTabellen eintragen (Test speicherSicherungP350 erzwingt das). lib/bestattung.ts rein + Tests, Seite /dashboard/bestattung, NAV, Guide. Anwalt: Daten Verstorbener (DSGVO gilt nicht, aber Angehoerige), Bestattungsrecht der Laender — R56.
Danach: A4b Bewachung (2), A4c Abfall/Gefahrgut (2), A4d Tierhaltung (1), A4e Lebensmittel-Herstellung (1), A4f Weinbau (1), A4g Vermittlung (1), A4h Drohnen/Flugschule (1), A4i Baeder (3), A5 Schutz-Paket (3), A6 Dossiertexte (11).

## Hinweise aus SP-17
- Container: Repo klonen (oeffentlich): GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/martingaspar-gasparaiconsulting/argonaut-website ; npm ci. next build im Container braucht Schrift-Attrappe (Google Fonts gesperrt): app/layout.tsx voruebergehend DM_Sans-Import durch Stub ersetzen, nach dem Build zuruecksetzen.
- Test-Postgres: /usr/lib/postgresql/16/bin initdb als User postgres in /var/tmp (nicht /tmp/claude-0), Rollen anon/authenticated/service_role + Stub-Schema storage anlegen.
- Dossiers ansehen: lib/fachdossierHtml.ts als CJS buendeln, mit /opt/npm-tools/node_modules/playwright rendern.
- Bauliste: Quelle docs/bauliste/rows.py + gen.py; Artifact vorher lesen. Ein anderer Chat kann das Artifact direkt aendern — dann Aenderung in rows.py uebernehmen statt ueberschreiben.

## Arbeitsweise (unveraendert)
Deutsch, CMD nie PowerShell, „Sie" in Kundentexten, „Bausteine" nie „KI-Agenten". FREIE HAND: sofort bauen, Martin macht SQL und Push. Jede Aussage in Kundentexten am echten Code pruefen. Pruef-Kette: Tests + Gegenproben rot, tsc + Typfehler-Gegenprobe, next build (nie parallel). Je Paket `_pNNN.bat` (CRLF, ASCII, GIT_LITERAL_PATHSPECS=1, nie ueberschreiben). Geraet vorher gegen HEAD pruefen, nachher Stage + cmp. SQL komplett im Chat in Teilen <=50 Zeilen + `chcp 65001 >nul && type "supabase-sql\pNNN-….sql" | clip`. Nach jedem Push Bauliste-Artifact (erst lesen, dann veroeffentlichen) + Restzahl. Kontrollgang-Funde ins Memory. Keine Klicktests zwischendurch. Startbefehl: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` dann `_pNNN`. Weiterbauen bis „Feierabend".
