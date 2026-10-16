# ARGONAUT Startprompt SP-31 (16.10.2026, abends)

Vorgaenger: SP-30. Baulog: Memory /areas/argonaut-bauliste-1016.md (Abschnitt „Chat SP-30") · Kontrollgang /areas/argonaut-kontrollgang-2.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste R70 · Testtag /areas/argonaut-testtag-4.md.

## Weg 2 — Claude pusht selbst
- Neuer Chat: ZUERST `add_repo` (owner martingaspar-gasparaiconsulting, repo argonaut-website, access push), dann `git clone --depth 1 … /home/claude/argonaut-website` (Timeout ~10 Min), `bash scripts/claude-start.sh > /tmp/claude-start.log 2>&1 &`.
- Hilfsskripte neu anlegen (Inhalt wie SP-26/SP-30): /tmp/fontmock/mock.js, /tmp/build.sh, /tmp/push.sh "Text" dateien… (erst add+commit als Martin + Co-Author, dann fetch+rebase, push, Vercel pollen), /tmp/gegen.sh datei "alt" "neu" testdatei — NACH dem Zuruecksetzen `node scripts/tests-bauen.cjs` laufen lassen (sonst veralteter out/-Stand).
- WICHTIG: Der Container laeuft in Europe/Berlin, Vercel in UTC. Zeit-Tests und Zeit-Gegenproben mit `TZ=UTC` laufen lassen.
- Pruef-DB: `createdb -h /var/tmp/pg -p 5499 -U postgres -T vorlage tNNN`. leads hat dort keine RLS → fuer Rollen-Tests selbst anlegen.

## Stand 16.10. abends
- P411/P412/P413 VK5 Show-up LIVE: erschienen/nicht erschienen + Show-Rate (Termine-Seite), Cron /api/cron/termin-showup alle 15 Min (1-Std.-Erinnerung, Rueckhol-Folge, je Betrieb in vk_showup, Voreinstellung AUS), WhatsApp-Erinnerung als Vorlage. Anwalt R69.
- P414 VK6 Teil 1 LIVE: Gespraechsergebnis am Lead (GespraechBox, /api/gespraech-ergebnis, lib/gespraechErgebnis.ts), Lead-Stufe zieht nach (nie zurueck).
- P415 VK6 Teil 2: Uebergabe aus Abschluss (Angebot-Link, Auftrag, Projekt, Kundenportal + Willkommens-Mail ueber /api/gespraech-weiter), Karte „Gespraechsergebnisse (90 Tage)" auf /dashboard/leads/team. Freie Setter: kein Geld, kein „Abgeschlossen".
- SQL OFFEN: p411 (Kontrolle 1|2|5) und p414 (Kontrolle 1|4|1) — an Martin geliefert am 16.10. abends. Erst nach „SQL durch" gilt VK5/VK6 als scharf.
- Bauliste: VK5 live (248 von 598). VK6 nach P415 als live markieren (rows.py, gen.py, Artifact neu veroeffentlichen).

## Naechster: Platz 1b weiter
1. (erledigt: Bauliste VK6 live = 249/598, Testtag-4 VK6 eingetragen)
2. VK7 Kennzahlen-Board und Rangliste (2 Pushes): Show-Rate aus termine.erschienen, Abschluss/vereinbart aus vk_gespraech (lib/gespraechErgebnis auswerten/jeCloser), Anrufe aus vk_anruf, Zeit bis 1. Anruf (P361), Quelle/UTM fest am Lead, Stillstand-Warnung Deals.
3. VK8 Ziele/Prognose/Tagesabschluss, VK9 Leitfaeden + Einwand-Bibliothek (Einwaende aus vk_gespraech zaehlen), VK10, VK13, AK1, LK3 …
4. WEB-HW gemeinsam, D1 wartet auf Hetzner.
