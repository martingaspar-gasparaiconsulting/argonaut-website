# ARGONAUT Startprompt SP-26 (16.10.2026, vormittags)

Vorgaenger: SP-25. Baulog: Memory /areas/argonaut-bauliste-1013.md (Abschnitt „16.10. WEG 2") · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste R66 · Testtag /areas/argonaut-testtag-4.md.

## NEU: Weg 2 — Claude pusht selbst
- Claude-GitHub-App ist installiert (nur Repo argonaut-website). Claude pusht Pakete direkt aus der Werkstatt nach GitHub; Martin beobachtet Vercel und meldet nur Rot.
- Werkstatt einrichten: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git /home/claude/repo` (bzw. fetch + ff), `bash scripts/claude-start.sh`.
- Pruef-Build: next build braucht Env-Platzhalter (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_URL/SERVICE_ROLE_KEY) und eine Google-Font-Attrappe: NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<datei> mit `module.exports = {"https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap": "@font-face { font-family: 'DM Sans'; font-style: normal; font-weight: 300 500; font-display: swap; src: local('DM Sans'); }"}` (kein url(), sonst Turbopack-Panic). Dauer ~1,5–3,5 Min.
- Commit als `-c user.name="Martin Gaspar" -c user.email=martingaspar@gasparaiconsulting.de` (Vercel-Autor) + Co-Authored-By; gezielter git add; `git push origin main`; Vercel-Status: `gh api repos/martingaspar-gasparaiconsulting/argonaut-website/commits/<sha>/status --jq .state`.
- Pakete mit SQL: Code moeglichst so bauen, dass er vor dem SQL laeuft (Spalten nur mitschicken, wenn vorhanden) — dann sofort pushen und SQL liefern. Sonst warten, bis Martin „SQL durch" meldet.
- SQL-Bloecke KLEIN (einer je Paket, eigene Kontrollzahl), umgebrochen im Chat.
- Push-Meldung kurz: ✅ erledigt · ▶ naechster · 🔨 Handwerk (Platz 1a) Pakete/Pushes uebrig.
- Martins Geraete-Ordner ist hinter GitHub: vor einer eigenen _pNNN.bat dort `git pull`.

## Stand
- Live heute: P380 MO0a 1cd98a4 · P381 MO0b 4e0f5a8 · P382 HW-B 87ad465 · P383 HW-16 dc3cfa5 (SQL p383 an Martin geliefert; Kontrolle 3|1).
- Bauliste 219/595 laut Artifact Version 203 (https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T).
- Handwerk Platz 1a offen: 13 Pakete / 26 Pushes — LK7, MO0c, MO1 (4), MO1v-HW, LK2, LK5 (2), HW-4, MO4 (4), HW-2 (3), C1 (2), D1 (2), HW-1 (2), HW-3 (2). Alle brauchen SQL (D1 braucht Hetzner, C1 Anwalt).

## Naechster: LK7 Wartung legt Termine selbst an
- Befund: wartungsvertraege (Seite app/dashboard/wartung, Logik app/dashboard/_components/wartungsLogik.ts ohne Tests), Cron /api/wartung-erinnerung schickt nur Mail an Betrieb. Kein oeffentlicher Termin-Bestaetigungslink.
- SQL noetig: termine.wartungsvertrag_id, termine.bestaetigung_token (unique), termine.kunde_bestaetigt_am. Plan: Cron legt Terminvorschlag an (Doppelschutz ueber wartungsvertrag_id), Mail an Kunden mit Link, Bestaetigung → Einsatz (Feldbelegung aus termin-zu-einsatz in reine Funktion ziehen), „Gewartet" schreibt Faelligkeit fort; Tests fuer berechneNaechsteFaelligkeit.

## Offene Fragen an Martin
- „Floating- & Salzgrotten" doppelt (Gesundheit + Sport/Beauty): entfernen → 697 statt 698 Branchen? Nicht angefasst.
