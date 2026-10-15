# ARGONAUT Startprompt SP-24 (15.10.2026, ca. 19:30)

Vorgaenger: SP-23. Baulog: Memory /areas/argonaut-bauliste-1013.md · Kontrollgang /areas/argonaut-kontrollgang-2.md (Abschnitt „Handwerk-Durchgang Geld") · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste freie Nummer R64.

## Stand
- Live: P365 bf27cbf (HW-0 Steuersatz) · P366 d3b553d (HW-5 § 13b) · P367 7fb1321 (HW-6 Mahnung zahlbar jetzt) · P368 a85dbc5 (HW-7 Rechnung aus Auftrag) · P369 a3b830e (HW-18 Zahlungsstatus, SQL p369 live) · P370 06fa7a7 (HW-8 Doppelabrechnung) · P371 62b94c7 (HW-9 Abschlag/Schluss am Auftrag) · P372 a4b95d9 (HW-17 Grund bei 0 %, SQL p372 live) · P373 7cde83d (HW-10 Auftrag aus Angebot, SQL p373 live) · P374 cb8caa6 (HW-11 Angebot aus Aufmass, SQL p374 live) · P375 95c24e5 (HW-12 Lead weiter).
- P376 LIVE 733e2eb (HW-13 eine Pipeline). docs/bauliste/rows.py, gen.py, bauliste.html liegen mit HW-13 live auf dem Geraet, NICHT committet — mit dem ersten Paket (P377) zusammen mit diesem Startprompt committen.
- Bauliste 213/595 (36 %), 382 offen, Artifact https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T Version 198. Platz 1a Reihenfolge (PLAN p1a): HW-14 Abnahme vollstaendig, HW-15 Nachtrag abrechnen, HW-16 Projekt als Klammer, dann MO0a, MO0b, MO0c, MO1 (4), MO1v-HW, LK2, LK7, LK5, HW-4, MO4 (4), HW-2 (3), HW-B, C1, D1, HW-1, HW-3.

## Naechster: HW-14 Abnahme vollstaendig
- bau-lv/page.tsx ~Z. 183-186 speichert bau_abnahmen ohne lv_id/projekt_id; bau-lv/ablaeufe ~Z. 552 bietet auch verweigerte Abnahmen zur Gewaehrleistung an; kein Abnahmeprotokoll-PDF. Zusammen mit LK2 (Gewaehrleistungsfristen) denken.

## Hinweise (neu in SP-23 gelernt)
- Pruef-Postgres stirbt zwischen Runden: `rm -f /var/tmp/pg/data/postmaster.pid; su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pg/data -o '-p 5499 -k /var/tmp/pg' -l /var/tmp/pg/log start"`.
- Waechter-Tests: select-Spaltenlisten nie mit + zusammensetzen (selectLiteral); nie eigener Zahlenleser (leseZahl/leseZahlOder aus lib/zahlen nutzen); Steuersatz nur ueber lib/steuersatz.ts (Waechter gegen „|| 19").
- Neue Ein-Stellen-Logik: lib/steuersatz.ts, lib/rechnungKopf.ts (kopfSummen), lib/zahlbarJetzt.ts, lib/doppelabrechnung.ts, lib/rechnungAusAuftrag.ts (auftragZuRechnung, abschlagAusAuftrag), lib/nullGrund.ts, lib/angebotZuAuftrag.ts + lib/auftragAusAngebotServer.ts, lib/aufmassZuAngebot.ts, lib/leadWeiter.ts.
- SQL immer umgebrochen liefern (jede Zeile im Chat sichtbar), nie eine lange Zeile.
- Spalten nur mitschicken, wenn gesetzt (laeuft vor SQL); bei select einer neuen Spalte: SQL VOR Push (sonst laedt die Seite nicht).
- Stop-Hook „uncommitted changes": nie aus dem Container pushen — Lieferweg bleibt _pNNN.bat.

## Arbeitsweise (unveraendert)
Deutsch, CMD nie PowerShell, „Sie" in Kundentexten, Mitarbeitertexte anredefrei, „Bausteine". FREIE HAND: sofort bauen, Martin macht SQL und Push. Nach jedem Push Bauliste-Artifact + Restzahl. Kontrollgang-Funde ins Memory. Weiterbauen bis „Feierabend".
