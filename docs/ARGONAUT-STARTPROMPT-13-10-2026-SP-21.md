# ARGONAUT Startprompt SP-21 (13.10.2026, ca. 18:00)

Vorgaenger: SP-20. Baulog: Memory /areas/argonaut-bauliste-1012.md (Abschnitt „13.10. nachmittags (Chat SP-20)") · Kontrollgang /areas/argonaut-kontrollgang-2.md · Testtag /areas/argonaut-testtag-4.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste freie Nummer R59.

## Stand
- P355 (A4c Teil 1 Container + Wiegeschein) live 182a00f, SQL p355 live 4|16|11|4.
- P356 (A4c Teil 2 Abfallregister + ADR-Papier + 1000 Punkte) live 07e9eb4, SQL p356 live 2|8|6|2. A4c komplett.
- Neuer Start-Schalter startSperre.adrPapier = aus (R58): ADR-Papier nur Entwurf, Druck „ENTWURF".
- Bauliste: 193/275 (70 %), 82 offen, Artifact https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T Version 164 „P356 live". docs/bauliste/gen.py hat im Container lokal die Kopfzeile „P356 live (07e9eb4)" — auf dem Geraet steht noch „_p356 unterwegs": beim naechsten Update neu setzen und mit P357 committen. A4d steht in rows.py auf „nächster".
- Diese Datei ist untracked: mit P357 committen.

## Naechster: A4d Fachpaket Tierhaltung (1 Push, Claude)
Vor dem Bau Bestandsaufnahme (Explore-Agent): vorhanden sind schon tierbestand (Landwirtschaft-Kategorie), Tier-Import gesperrt (anwaltFreigabe.tier, R-Liste 3.04), Tierarzt/Tierakten? Branchen in branchen-web-extra.ts suchen (Tierhaltung, Pferdehof/Pensionsstall, Tierpension, Hundeschule, Zucht …). Nur bauen, was fehlt; Gesundheits-/Tierarzt-Daten nicht anfassen (Anwalt). Muster: lib/<fach>.ts rein + tests, app/dashboard/<fach>/, NAV in lib/rechte.ts, branchenkatalog mitX, Guide, sicherungTabellen (Test erzwingt jede neue owner_user_id-Tabelle), Verzeichnis (Loeschfrist mit Ziffer + Dauer), DSGVO-Landkarte bei kontakt_id.
Danach: A4e Lebensmittel-Herstellung (1), A4f Weinbau (1), A4g Vermittlung (1), A4h Drohnen/Flugschule (1), A4i Baeder (3), A5 Schutz-Paket (3, gemeinsam), A6 Dossiertexte (11).

## Hinweise aus SP-20
- Container: GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/martingaspar-gasparaiconsulting/argonaut-website ; npm ci. next build: app/layout.tsx Zeile 3 voruebergehend durch `const DM_Sans = (_o: unknown) => ({ variable: 'stub', className: 'stub' })` ersetzen + Env NEXT_PUBLIC_SUPABASE_URL=https://beispiel.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy; danach zuruecksetzen. tsc ~3 Min.
- Test-Postgres: /usr/lib/postgresql/16/bin, initdb als postgres in /var/tmp, Port 5499. Stub: Rollen anon/authenticated/service_role (bypassrls), auth.uid() aus request.jwt.claims, ma_chef/ma_recht-Stubs, kontakte/mitarbeiter-Stubs, p181_besitzer aus supabase-sql/p181-besitzer-betrieb-3.sql, p353_name aus p353 Teil 2. Test-Helfer t_ok/t_fehler als plpgsql-Funktionen.
- Zahlen-Waechter: Zahlen aus Eingaben NUR ueber lib/zahlen.ts leseZahl (kein replace(',', '.')).
- Nur-anhaengen-Muster mit Storno: im Trigger `new := old;` und nur status/storno_grund setzen (P355 Wiegeschein, P356 Register/ADR). Nummer je Jahr: advisory lock + lpad(v_n::text, greatest(N, length(v_n::text)), '0') (lpad allein schneidet ab — Befund P352 im Kontrollgang).
- Neuer Start-Schalter = startSperre.ts (Typ, START_FREIGABE, GRUND) + freigabeZentrale START_INFO + docs/ARGONAUT-SPERR-GEDAECHTNIS.md (SCHALTER-Zeile + Tabellenzeile); im Browser useFreigabeStand().start + startFrei.
- Stop-Hook im Container: NICHT aus dem Container pushen, Arbeitskopie per git stash beiseite; nach Martins Push fetch + reset --hard origin/main + stash drop.

## Arbeitsweise (unveraendert)
Deutsch, CMD nie PowerShell, „Sie" in Kundentexten, Mitarbeitertexte anredefrei, „Bausteine" nie „KI-Agenten". FREIE HAND: sofort bauen, Martin macht SQL und Push. Jede Aussage in Kundentexten am echten Code pruefen. Pruef-Kette: Tests + Gegenproben rot, tsc + Typfehler-Gegenprobe, next build (nie parallel), Druckansichten rendern und ansehen. Je Paket `_pNNN.bat` (CRLF, ASCII, GIT_LITERAL_PATHSPECS=1, nie ueberschreiben). Geraet vorher gegen HEAD pruefen, nachher Stage + cmp. SQL komplett im Chat in Bloecken + `chcp 65001 >nul && type "supabase-sql\pNNN-….sql" | clip`. Nach jedem Push Bauliste-Artifact (erst lesen, dann veroeffentlichen) + Restzahl. Kontrollgang-Funde ins Memory, Testtag-Punkte in testtag-4, Anwalt in anwalt-checkliste-3. Keine Klicktests zwischendurch. Startbefehl: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` dann `_pNNN`. Weiterbauen bis „Feierabend".
