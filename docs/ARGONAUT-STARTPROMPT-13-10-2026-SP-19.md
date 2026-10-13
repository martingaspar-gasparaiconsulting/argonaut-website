# ARGONAUT Startprompt SP-19 (13.10.2026, ca. 14:00)

Vorgaenger: SP-18. Baulog: Memory /areas/argonaut-bauliste-1012.md (Abschnitt „13.10. mittags (Chat SP-18)") · Kontrollgang /areas/argonaut-kontrollgang-2.md · Testtag /areas/argonaut-testtag-4.md · Anwalt /areas/argonaut-anwalt-checkliste-2.md (FAST VOLL -> neue Datei argonaut-anwalt-checkliste-3 anlegen), naechste freie Nummer R57.

## Stand
- P352 (A4a Fachpaket Bestatter) live fc1d70e, SQL p352 live 5|20|11|5.
- Bauliste: 189/275 (69 %), 86 offen, Artifact https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T Version 154 „P352 live". docs/bauliste/gen.py auf dem Geraet hat noch die Kopfzeile „_p352 unterwegs" -> beim naechsten Bauliste-Update einfach neu setzen.
- Diese Datei ist untracked: mit P353 committen.
- Claude-Befund offen (Kontrollgang-2): rechnung-aus-angebot macht aus 0 % USt 19 % (Kern-Geld-Formular, gemeinsam).

## Naechster: A4b Fachpaket Bewachung § 34a (2 Pushes, Claude)
Bestandsaufnahme (SP-18, Explore-Agent): fuer Bewachung NICHTS im Code (kein Wachbuch, Kontrollgang, Bewacherregister, 34a). Andocken:
- Objekte des Wachdiensts = Tabelle `objekte` / Seite app/dashboard/objektzeiten (Spalten bezeichnung, adresse, kennung, archiviert …). NICHT app/dashboard/objekte (das sind Anlagen/assets).
- QR erzeugen: lib/qr.ts (qrMatrix), lib/fuhrparkGeraete.ts qrSvg. Kamera-Scan-Vorlage: app/dashboard/lager-scanner/page.tsx (BarcodeDetector + getUserMedia).
- Qualifikationen mit Ablauf: lib/dispoPlus.ts QUALIFIKATIONEN (14, kein 34a) + Tabelle mitarbeiter_qualifikation (mitarbeiter_id, art, gueltig_bis, nachweis) aus supabase-sql/po-dispo-plus.sql, Seite app/dashboard/dispo/qualifikationen; einsaetze.anforderungen text[] + pruefeZuweisung.
- Mobile: app/dashboard/meine-einsaetze (GPS ueber rpc einsatz_status_setzen, Offline-Cache localStorage).
- Branchen (alle Dienstleistungen ausser Werttransport = Logistik): sicherheitsdienste, wachdienst-objektschutz, personen-objektschutz-paragraph34a, veranstaltungssicherheit-ordnerdienst, werttransport-geldlogistik (Detektei/Hausnotruf NICHT). Muster mitBestattung in lib/branchenkatalog.ts -> mitBewachung analog.
Plan:
- P353 Teil 1 Wachbuch + Kontrollgaenge: SQL p353 wach_kontrollpunkt (objekt_id, name, code zufaellig fuer QR, position, aktiv), wach_rundgang (objekt, mitarbeiter, gestartet/beendet, status), wach_scan (Zeit SERVERSEITIG, lat/lon optional, unveraenderbar), wachbuch_eintrag (Zeitpunkt serverseitig, art meldung/vorkommnis/uebergabe/schaden/polizei, Text; nur anhaengen, Korrektur als Nachtrag, kein Update/Delete auch nicht Chef). Seite /dashboard/bewachung (Reiter Wachbuch, Kontrollgang mit Kamera-Scan oder Code tippen, Kontrollpunkte mit QR drucken), NAV modul „bewachung", Guide, DSGVO, sicherungTabellen (Test erzwingt), Tests + Gegenproben, Test-PG.
- P354 Teil 2 Nachweise + Einsatzplanung: QUALIFIKATIONEN + unterrichtung_34a, sachkunde_34a (Ablauf), Bewacher-ID je Mitarbeiter, Bewacherregister-/Erlaubnis-Nummer des Betriebs als Pflichtfeld (vorher pruefen, wo Firmendaten liegen), Einsatz je Objekt mit Warnung bei fehlendem Nachweis, branchenkatalog mitBewachung.
- Anwalt R57: Rundgaenge mit Zeit/GPS je Mitarbeiter = Leistungs-/Verhaltenskontrolle (§ 87 Abs. 1 Nr. 6 BetrVG, § 26 BDSG) — GPS nur optional, Hinweis; Bewacherregister-Pflichten (§ 11b BewachV) traegt der Betrieb selbst, ARGONAUT meldet nichts.
Danach: A4c Abfall/Gefahrgut (2), A4d Tierhaltung (1), A4e Lebensmittel-Herstellung (1), A4f Weinbau (1), A4g Vermittlung (1), A4h Drohnen/Flugschule (1), A4i Baeder (3), A5 Schutz-Paket (3), A6 Dossiertexte (11).

## Hinweise aus SP-18
- Container: GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/martingaspar-gasparaiconsulting/argonaut-website ; npm ci. next build im Container: app/layout.tsx DM_Sans-Import voruebergehend durch Stub `const DM_Sans = (_o: unknown) => ({ variable: 'stub', className: 'stub' })` ersetzen UND Env setzen: NEXT_PUBLIC_SUPABASE_URL=https://beispiel.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy; danach layout.tsx zuruecksetzen.
- Test-Postgres: initdb als User postgres in /var/tmp; Stub-Schema: Rollen anon/authenticated/service_role, auth.uid() aus request.jwt.claims, mein_chef_id/darf_ich_modul_* ueber Stub-Tabelle, p181_besitzer, kontakte/leistungskatalog/objekte als Stub.
- plpgsql wertet `and`-Ketten nicht kurz aus: Felder einer anderen Tabelle (new.kontakt_id) nur in verschachteltem IF je tg_table_name ansprechen.
- page.tsx darf nur die Seite exportieren — gemeinsame Teile in eigene Datei (Muster app/dashboard/bestattung/bestattungUi.tsx).
- Geld je Zeile ganzzahlig rechnen (Muster lib/bestattung.ts zeilenBetrag), Float weicht von Postgres round ab (0,25 × 1,14).
- Stop-Hook im Container meldet uncommitted changes: NICHT aus dem Container pushen (Martin pusht per _pNNN), Arbeitskopie per git stash beiseitelegen.

## Arbeitsweise (unveraendert)
Deutsch, CMD nie PowerShell, „Sie" in Kundentexten, „Bausteine" nie „KI-Agenten". FREIE HAND: sofort bauen, Martin macht SQL und Push. Jede Aussage in Kundentexten am echten Code pruefen. Pruef-Kette: Tests + Gegenproben rot, tsc + Typfehler-Gegenprobe, next build (nie parallel). Je Paket `_pNNN.bat` (CRLF, ASCII, GIT_LITERAL_PATHSPECS=1, nie ueberschreiben). Geraet vorher gegen HEAD pruefen, nachher Stage + cmp. SQL komplett im Chat in Bloecken <=50 Zeilen + `chcp 65001 >nul && type "supabase-sql\pNNN-….sql" | clip`. Nach jedem Push Bauliste-Artifact (erst lesen, dann veroeffentlichen) + Restzahl. Kontrollgang-Funde ins Memory. Keine Klicktests zwischendurch. Startbefehl: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` dann `_pNNN`. Weiterbauen bis „Feierabend".
