# ARGONAUT Startprompt SP-30 (16.10.2026, spaetnachmittags)

Vorgaenger: SP-29. Baulog: Memory /areas/argonaut-bauliste-1016.md (Abschnitt „Chat SP-29") · Kontrollgang /areas/argonaut-kontrollgang-2.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste R69 · Testtag /areas/argonaut-testtag-4.md.

## Weg 2 — Claude pusht selbst
- Neuer Chat: ZUERST `add_repo` (owner martingaspar-gasparaiconsulting, repo argonaut-website, access push), dann `git clone --depth 1 … /home/claude/argonaut-website` (Timeout ~10 Min), `bash scripts/claude-start.sh > /tmp/claude-start.log 2>&1 &`.
- Hilfsskripte neu anlegen: /tmp/fontmock/mock.js (DM-Sans-Attrappe, siehe SP-26), /tmp/build.sh (next build mit Env-Platzhaltern), /tmp/push.sh "Text" dateien… — REIHENFOLGE: erst git add + commit (als Martin + Co-Author), DANN fetch + rebase, dann push, dann Vercel pollen. Build + Vercel-Warten kann > 10 Min dauern → Vercel-Status notfalls separat mit `gh api …/commits/<sha>/status`.
- /tmp/gegen.sh datei "alt" "neu" testdatei fuer Gegenproben (Sicherung, ersetzen, Tests, zuruecksetzen).
- Pruef-DB: `createdb -T vorlage tNNN`; die Vorlage hat p358 (VK1). leads hat dort KEINE RLS → fuer Rollen-Tests owner_all/ma_all selbst anlegen; benachrichtigungen selbst anlegen.
- Waechter, die zuverlaessig anschlagen: zahlenWaechter (nie eigener Zahlenleser → lib/zahlen leseZahl), guideWissenA2 (Guide-Eintrag nur fuer Menue-Seiten → NAV-Eintrag in lib/rechte.ts), sperrGedaechtnisP224 (neuer Start-Schalter → docs/ARGONAUT-SPERR-GEDAECHTNIS.md), datenschutzP178 (public/analyse.js nie document.cookie).

## Stand 16.10. spaetnachmittags (alles Vercel success)
- P406/P407 C1 Einwilligungs-Fenster + Besucher-Messung mit Cookie (Start-Schalter cookieMessung, R68; je Betrieb web_ci.cookie_messung; Auswertung „Wiederkehrende Besucher" in der Website-Analyse).
- P408 VK2 Qualifizierung + Uebergabe Setter → Closer (Boegen, Passt/Passt nicht, Spickzettel, Glocke).
- P409/P410 VK3 Termin-Verteilung (reihum/freie Zeit/Regeln, Online-Buchung teilt zu, Vorschlag, Uebertragen, Kalender je Person).
- SQL p406 (1|1|1), p407 (1|created_at — web_ereignisse hat created_at), p408 (3|8|3), p409 (1|2|1) LIVE seit 16.10. 17:20. Kein SQL offen.
- Bauliste Artifact Version 219: 247 von 598 Pushes.

## Handwerk Platz 1a offen
- D1 (wartet auf Hetzner-Server), WEB-HW (gemeinsam, Wortlaut mit Martin).

## Naechster: Platz 1b weiter
1. VK5 Show-up-Maschine (Bestaetigung sofort, Erinnerung 24 Std. + 1 Std., Status „nicht erschienen", Rueckhol-Folge mit Buchungslink; Show-Rate fuer VK7). Bestand pruefen: lib/wartungTermin.ts, Cron termin-nachfass, Erinnerung am Vortag.
2. VK6 Gespraechsergebnis, VK7 Kennzahlen-Board, VK8 Ziele, VK9 Leitfaeden, VK10 Lead-Bewertung, VK13 Aussendienst, AK1, LK3 …
3. WEB-HW gemeinsam, sobald Martin Zeit hat.
