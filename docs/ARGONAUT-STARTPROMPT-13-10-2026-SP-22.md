# ARGONAUT Startprompt SP-22 (13.10.2026, ca. 19:20)

Vorgaenger: SP-21. Baulog: Memory /areas/argonaut-bauliste-1012.md (Abschnitt „13.10. abends (Chat SP-21)") · Kontrollgang /areas/argonaut-kontrollgang-2.md · Testtag /areas/argonaut-testtag-4.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste freie Nummer R60.

## Stand
- P357 (A4d Tierhaltung, Arzneimittel-Bestandsbuch) live 443fe02, SQL p357 live 2|6|6|2.
- P358 (VK1 Teil 1 Verkaufsteam: Setter/Closer je Lead, vk_funktion, freie Setter) — SQL p358 live 1|5|2|3|3|false. _p358 lief bei Uebergabe (Tests 4677/4677 gruen, Build lief). ERSTER SCHRITT: Vercel pruefen (Commit „Paket 358 …" Ready?), Klon auf origin bringen, Bauliste-Kopfzeile in docs/bauliste/gen.py von „_p358 unterwegs" auf „P358 live (<hash>)" setzen, gen.py laufen lassen, Artifact https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T erst lesen, dann mit url veroeffentlichen.
- Bauliste: 195/308 (63 %), 113 offen. VK1 Rest 1 „nächster".
- Diese Datei ist untracked: mit P359 committen.

## Naechster: P359 = VK1 Teil 2 — eigene Pipelines + Deal-Zustaendige (1 Push, Claude)
Bestand (am Code geprueft in SP-21):
- crm_deal hat KEIN CREATE im Repo; Spalten laut Code: id, owner_user_id, kontakt_id, titel, firma, wert_netto, stufe, wahrscheinlichkeit, erwartetes_datum, notiz, erstellt_am, aktualisiert_am, provision_*, auftrag_id; seit P358 setter_user_id/closer_user_id (Waechter p358_zustaendig prueft Team, Regel p358_frei_deal sperrt crm_deal fuer freie Setter). Vor SQL: information_schema der Live-Tabelle abfragen lassen oder fehlertolerant bauen.
- 6 feste Stufen in lib/pipeline.ts (STUFEN lead 10, qualifiziert 30, angebot 50, verhandlung 75, gewonnen 100, verloren 0; stufeInfo faellt auf lead zurueck). Seite app/dashboard/pipeline/page.tsx (Browser-Client, select('*'), insert, Stufe setzen, delete). Leser von crm_deal: provisionen, heute, auftraege, partner/_Provisionen, reportBaukasten, dsgvoDaten, uebungswelt. p185b: crm_deal Schreibrecht 'auftraege,pipeline,provisionen'.
- Alte Tabelle verkaufschancen nur noch Import — nicht anfassen.
Plan:
- SQL p359: crm_pipeline (owner, name, standard bool, position, aktiv) + crm_pipeline_stufe (pipeline_id, schluessel, name, wahrscheinlichkeit 0-100, art offen/gewonnen/verloren, position; unique pipeline+schluessel); crm_deal.pipeline_id (null = Standard-Pipeline mit den 6 festen Stufen). Waechter: Stufe muss zur Pipeline passen (bei pipeline_id); Pipeline mit Deals nicht loeschbar; je Pipeline genau eine gewonnen- und eine verloren-Stufe. Rechte wie crm_deal (Chef schreibt Pipelines, MA lesen).
- lib/pipelineEigene.ts (rein, getestet): stufenFuer(pipeline|null), stufeInfo mit Rueckfall, Vorlagen (Neukunden, Bestandskunden, je Auftraggeber), pruefen, gewonnen/verloren erkennen (Provision/Heute/Reports muessen „gewonnen" ueber art erkennen, nicht nur ueber Schluessel 'gewonnen' — Leser pruefen!).
- Pipeline-Seite: Auswahl der Pipeline, Spalten aus Stufen, Deal Setter/Closer (wie ZustaendigBox), Filter „Meine Deals"; Pipelines verwalten (nur Chef). Guide, sicherungTabellen (+2), Tests mit Gegenproben.
Danach laut Bauliste-Empfehlung: VK4 Anruf-Sitzung (2), VK11 Anruf-Sperrliste/Erlaubnis-Ampel (1, gemeinsam, Anwalt-Wortlaut), dann A4e Lebensmittel-Herstellung usw.

## Hinweise aus SP-21
- Container: GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/martingaspar-gasparaiconsulting/argonaut-website ; npm ci. next build: app/layout.tsx Zeile 3 voruebergehend `const DM_Sans = (_o: unknown) => ({ variable: 'stub', className: 'stub' })` + Env NEXT_PUBLIC_SUPABASE_URL=https://beispiel.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy; danach zuruecksetzen.
- Test-Postgres: /usr/lib/postgresql/16/bin, initdb als postgres in /var/tmp/pg, Port 5499, Socket /var/tmp/pg. Stub: Rollen anon/authenticated/service_role (bypassrls), auth.uid() aus request.jwt.claims, ma_stub(user_id, chef, sehen, aendern) fuer mein_chef_id/darf_ich_modul_*, mitarbeiter-Stub, p181_besitzer + p353_name per sed aus den SQL-Dateien.
- NEU: Menue-Eintraege fuer UNTERSEITEN bekommen KEINEN eigenen modul-Schluessel (sonst biegt MODUL_PFAD den Pfad um; Waechter-Test in tests/verkaufsteamP358, Ausnahme erp).
- Zahlen aus Eingaben NUR ueber lib/zahlen.ts leseZahl (Zahlen-Waechter faengt auch replace(/\./g,'')).
- JSX-Attribut text="…„x"…" mit geradem " bricht den Build — dann text={'…'} verwenden.
- Nur-anhaengen-Muster: im Trigger `new := old;` und nur status/storno_grund setzen. Einschraenkende Regeln (as restrictive) nur mit Hilfsfunktion, die bei Fehler false liefert.
- Geraet vorher gegen HEAD pruefen (Nebenchats schreiben manchmal untracked in docs/bauliste!), nachher Stage + cmp. Je Paket eigene _pNNN.bat (CRLF, ASCII, GIT_LITERAL_PATHSPECS=1).

## Arbeitsweise (unveraendert)
Deutsch, CMD nie PowerShell, „Sie" in Kundentexten, Mitarbeitertexte anredefrei, „Bausteine" nie „KI-Agenten". FREIE HAND: sofort bauen, Martin macht SQL und Push. Pruef-Kette: Tests + Gegenproben rot, tsc + Typfehler-Gegenprobe, next build, Druckansichten ansehen. SQL komplett im Chat in Bloecken + `chcp 65001 >nul && type "supabase-sql\pNNN-….sql" | clip`. Aussperr-Risiken vorher nennen. Nach jedem Push Bauliste-Artifact + Restzahl. Kontrollgang-Funde ins Memory, Testtag in testtag-4, Anwalt in anwalt-checkliste-3. Keine Klicktests zwischendurch. Startbefehl: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` dann `_pNNN`. Weiterbauen bis „Feierabend".
