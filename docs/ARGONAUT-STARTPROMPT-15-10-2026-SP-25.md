# ARGONAUT Startprompt SP-25 (15.10.2026, Feierabend 20:51)

Vorgaenger: SP-24. Baulog: Memory /areas/argonaut-bauliste-1013.md · Kontrollgang /areas/argonaut-kontrollgang-2.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste freie Nummer R65 · Testtag /areas/argonaut-testtag-4.md.

## Stand
- Live: P377 b9d4189 (HW-14 Abnahme vollstaendig, kein SQL) · P378 720a356 (HW-15 Nachtrag abrechnen, SQL p378 live).
- Bauliste: HW-14 live, HW-15 noch als „naechster" eingetragen -> mit P379 auf live setzen, HW-16 „naechster". Artifact https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T Version 199 (214/595, 381 offen; nach HW-15 live: 215/595, 380 offen).
- Diese Datei liegt auf dem Geraet, NICHT committet -> mit P379 committen.

## Naechster: HW-16 Projekt als Klammer
- Auftrag, Einsatz und Aufmass kennen kein Projekt, das Bautagebuch nur das Projekt; Dispo legt Einsaetze ohne Auftrag an; zwei Maengellisten nebeneinander.
- Plan: projekt_id an auftraege, einsaetze (Tabellenname pruefen), aufmasse (SQL additiv); Auswahl in den Formularen (nur mitschicken, wenn gesetzt -> laeuft vor SQL); Auftragswahl in der Dispo; Projektseite zeigt die Vorgaenge.
- Danach Platz 1a: MO0a, MO0b, MO0c, MO1 (4), MO1v-HW, LK2, LK7, LK5 (2), HW-4, MO4 (4), HW-2 (3), HW-B, C1 (2), D1 (2), HW-1 (2), HW-3 (2).

## Push-Meldung (neu, Martins Wunsch)
Nach jedem Push NUR: ✅ welches HW-Paket erledigt · ▶ was als Naechstes kommt · 🔨 wie viele Pakete/Pushes Handwerk (Platz 1a) noch uebrig. Stand nach HW-15: 16 Pakete / 29 Pushes nach HW-16 bzw. jetzt 17 Pakete / 30 Pushes.

## Hinweise
- Container frisch: git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git, dann bash scripts/claude-start.sh im Hintergrund. tsc braucht ~3 Min (timeout 590000).
- Neue Logik: lib/bauAbnahme.ts, lib/nachtragAbrechnen.ts, Route /api/rechnung-aus-nachtrag. Waechter zaehlen 23 Rechnung-aus-Wege; jede Seite mit /api/rechnung-aus-* braucht useDarfAbrechnen().
- Nie git stash vor ff-merge mit untracked Dateien; Paket-Stand immer zusaetzlich in /mnt/user-data/outputs/pNNN.
- Pakete, die eine Datei des noch nicht gepushten Pakets teilen, erst nach dessen Push aufs Geraet.
- Stop-Hook „uncommitted changes": nie aus dem Container pushen; Arbeitskopie nach Push per ff-merge auf origin/main ziehen.
- SQL immer umgebrochen im Chat liefern; bei neuer select-Spalte SQL vor Push.

## Arbeitsweise (unveraendert)
Deutsch, CMD nie PowerShell, „Sie" in Kundentexten, Mitarbeitertexte anredefrei, „Bausteine". FREIE HAND: sofort bauen, Martin macht SQL und Push (_pNNN.bat). Nach jedem Push Bauliste-Artifact neu veroeffentlichen. Kontrollgang-Funde ins Memory. Weiterbauen bis „Feierabend".
