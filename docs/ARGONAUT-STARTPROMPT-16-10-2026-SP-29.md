# ARGONAUT Startprompt SP-29 (16.10.2026, nachmittags)

Vorgaenger: SP-28. Baulog: Memory /areas/argonaut-bauliste-1016.md · Kontrollgang /areas/argonaut-kontrollgang-2.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste R68 · Testtag /areas/argonaut-testtag-4.md.

## Weg 2 — Claude pusht selbst (wie SP-28)
- Neuer Chat: ZUERST `add_repo` (owner martingaspar-gasparaiconsulting, repo argonaut-website, access push), dann `git clone --depth 1 … /home/claude/argonaut-website`, `bash scripts/claude-start.sh > /tmp/claude-start.log 2>&1 &`.
- Hilfsskripte neu anlegen (Inhalt siehe SP-26/SP-28): /tmp/build.sh (next build mit Env-Platzhaltern + Font-Attrappe /tmp/fontmock/mock.js), /tmp/push.sh "Text" dateien… (commit als Martin + Co-Author, push, Vercel pollen), /tmp/kopf.sh "Text", /tmp/live.sh KUERZEL.
- Pruef-DB: vor jeder SQL-Pruefung `create database tNNN template vorlage`; stirbt Postgres: postmaster.pid loeschen, pg_ctl start (Port 5499, Socket /var/tmp/pg).
- Pruef-Kette je Paket: Paket-Tests + Gegenproben + npm test (nur Win-1252 rot) + build.sh; dann push.sh; Bauliste-Artifact neu veroeffentlichen.
- SQL-Bloecke klein, einer je Paket, gesammelt am Rundenende. Martins Geraete-Ordner ist hinter GitHub — git pull nur, wenn er selbst wieder eine _pNNN.bat startet.

## Stand 16.10. nachmittags (alles Vercel success)
- P390 MO1 Teil 3 · P395 LK5 Teil 2 (+ Aussperr-Schutz im SQL) · P397/P398 MO4 Teil 3+4 (Mengen am Auftrag, Storno gibt frei, Monatslauf) · P399–P401 HW-2 Bauzeitenplan (Plan, Vorlagen, Termine je Firma) · P402/P403 HW-1 Metallzuschlag (Rechner frei, Uebernahme ins Angebot hinter Schalter metallzuschlag, R66) · P404/P405 HW-3 Foerderung Heizungstausch KfW 458 (Schaetzung + Vorgaenge; Kunden-Druck hinter Schalter foerderantrag, R67; Waechter wird ab 01.02.2027 rot).
- SQL live: p390, p395, p399. SQL p405 (foerder_vorgang, Kontrolle 1|2) an Martin geliefert.

## Handwerk Platz 1a offen
- C1 Einwilligungs-Fenster + Tracking mit Cookies (Anwalt) — kann hinter Start-Schalter vorgebaut werden.
- D1 (wartet auf Hetzner-Server).
- WEB-HW Webseite als Handwerker-Auftritt (gemeinsam, Wortlaut mit Martin).

## Naechster (Empfehlung)
1. C1 hinter Start-Schalter vorbauen (Einwilligungs-Fenster gleichwertig, Nachweis, Widerruf; Tracking erst nach Ja).
2. Danach Platz 1b (fuer alle Betriebe): VK2 ff., AK1, LK3 …
3. WEB-HW gemeinsam, sobald Martin Zeit hat.
