# ARGONAUT Startprompt SP-23 (15.10.2026, ca. 17:00)

Vorgaenger: SP-22 (Chat 13.–15.10.). Baulog: Memory /areas/argonaut-bauliste-1013.md · Kontrollgang /areas/argonaut-kontrollgang-2.md · Testtag /areas/argonaut-testtag-4.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste freie Nummer R63.

## Stand
- Live: P359 ceb93c6 · P360 d5d3273 · P361 6dd75bc · P362 580d47e · P363 4e9286e · P364 e8ce476 (A4f Weinbau, SQL p364 live 3|10|4|2).
- NEUER BAUPLAN (Beschluss 15.10.2026, siehe Bauliste oben): gebaut wird nach Branchen statt nach Themen. Platz 1 Handwerk & Bau komplett, danach Plaetze 2–19, dann B (eigener Server), C (Partner/Zugaenge, laeuft dazwischen), E (Dossiertexte ganz am Schluss). Die ≈ 200 Einzelfaelle der Branchen-Querschau sind jetzt einzelne Zeilen je Branche und zaehlen mit. Anwalt-Teile werden GEBAUT und bleiben bis zur Freigabe gesperrt (Freigabe-Zentrale).
- Bauliste: 201 von 581 Pushes erledigt (35 %), 380 offen (≈ 190 Bloecke). Artifact https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T Version 183. Technik: rows.py hat am Ende den Block „BAUPLAN 15.10.2026" (PLAN-Liste mit Zeilen-IDs; offene Zeilen werden aus den alten Abschnitten in die Plan-Abschnitte p1a, p1b, b02–b19, pB, pC, pE gezogen; neue Zeilen in NEU_PLAN und EF_<Kuerzel>). gen.py zaehlt je Plan-Abschnitt. Neue offene Zeile = in PLAN eintragen, sonst bricht gen.py mit „nicht eingeplant" ab (gewollt).
- docs/bauliste/{rows.py,gen.py,bauliste.html} und diese Datei liegen auf dem Geraet, NICHT committet: mit dem ersten Paket (P365) committen.
- Anwalt: Fahrplan-Doc „Anwalt-Fahrplan nach Branchen" (https://claude.ai/code/artifact/b887b0dd-812d-48d6-b41c-67ed76e70925): Stufe 1a vor dem ersten Handwerker 3.300–6.800 €, Stufe 1b 2.100–4.600 €, Plaetze 2–19 18.700–43.700 €, gesamt ≈ 26.000–60.000 € (Schaetzung). Basis bleibt das Erstgespraech-Doc mit 30 Fragen. Meine R-Liste ist nur internes Notizbuch.

## Naechster: Platz 1a Handwerks-Kern (30 Pushes), Reihenfolge laut Bauliste
1. HW-D Handwerk-Durchgang (0 Pushes): jedes Handwerks-Modul am echten Code pruefen — Anfrage, Aufmass, Angebot, Auftrag, Einsatz, Bautagebuch, Abnahme, Rechnung, Mahnung, Gewaehrleistung. Funde als neue Zeilen in p1a (PLAN) eintragen, Martin die echte Zahl nennen.
2. HW-0 Geld-Fehler: app/api/rechnung-aus-angebot/route.ts setzt `mwst_satz: Number(p.mwst_satz) || MWST_STD` → 0 % wird 19 % (Befund P352). GEMEINSAM-Regel: Befund + Loesung zeigen, dann sofort bauen.
3. Dann MO0a, MO0b, MO0c, MO1 (Protokoll-Motor, 4), MO1v-HW, LK2, LK7, LK5, HW-4, MO4 (Mengen-/Regie-Abrechnung, gemeinsam), HW-2 Bauzeitenplan, HW-B Bedenkenanmeldung, C1 Cookie-Fenster, D1, HW-1 Kupferzuschlag (gesperrt), HW-3 Foerderantrag (gesperrt).
4. Danach Platz 1b (54): Verkaufsteam VK2–VK19, Academy AK1–AK3/AK6, Luecken LK, MO3/MO5/MO6, CO4/CO1/CO10.
Martin will die Handwerker in wenigen Tagen fertig: Tempo ≈ 6–8 Pushes/Tag; der Handwerks-Teil zuerst.

## Hinweise
- Startskript: `bash scripts/claude-start.sh > /tmp/claude-start.log 2>&1 &` (npm ci, Pruef-Postgres Port 5499 Socket /var/tmp/pg, Vorlage-DB „vorlage" inkl. p320, p358–p360, p362–p364, out/ fuer Tests). Je Pruefung `createdb -T vorlage`. Pruefskripte scripts/pruef-pg/pruefung-p3NN.sh.
- KEIN next build im Container — Build laeuft nur in Martins _pNNN. Im Container: npm test, tsc --noEmit (+ Typfehler-Gegenprobe), Gegenproben.
- Klon: /home/claude/argonaut-website, mit `git fetch origin main && git reset origin/main` auf Stand bringen (Datei-Modus-Aenderungen an pruef-pg/*.sh ignorieren).
- Geraet vor dem Schreiben stagen und gegen HEAD vergleichen (Nebenchats!), nachher Stage + cmp. Je Paket eigene _pNNN.bat (CRLF, ASCII, GIT_LITERAL_PATHSPECS=1, gezieltes git add).
- Postgres to_char: „#" ist KEIN Muster → `FM999999990.999` + rtrim('.').
- Bauliste: bei Live-Paket die Zeile auf 'live' setzen (Push-Zahl bleibt), Kopfzeile in gen.py, gen.py laufen lassen, Artifact mit url veroeffentlichen, Restzahl nennen.
- Offene Kontrollgang-Punkte fuer Handwerk: Bedenkenanmeldung fehlt; zwei Pipelines (/dashboard/crm/pipeline alt) — Martin entscheiden; Fertigung/Herstellung buchen kein Lager.

## Arbeitsweise (unveraendert)
Deutsch, CMD nie PowerShell, „Sie" in Kundentexten, Mitarbeitertexte anredefrei, „Bausteine" nie „KI-Agenten". FREIE HAND: sofort bauen, Martin macht SQL und Push. SQL komplett im Chat in Bloecken + `chcp 65001 >nul && type "supabase-sql\pNNN-….sql" | clip`. Aussperr-Risiken vorher nennen. Nach jedem Push Bauliste-Artifact + Restzahl. Kontrollgang-Funde ins Memory, Testtag in testtag-4, Anwalt in anwalt-checkliste-3 (R63). Keine Klicktests zwischendurch. Startbefehl: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` dann `_pNNN`. Weiterbauen bis „Feierabend".
