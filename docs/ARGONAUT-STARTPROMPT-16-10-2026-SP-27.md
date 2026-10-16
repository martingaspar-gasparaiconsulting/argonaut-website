# ARGONAUT Startprompt SP-27 (16.10.2026, vormittags)

Vorgaenger: SP-26. Baulog: Memory /areas/argonaut-bauliste-1013.md (Abschnitt „16.10. vormittags (Chat SP-26)") · Kontrollgang /areas/argonaut-kontrollgang-2.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste R66 · Testtag /areas/argonaut-testtag-4.md.

## Weg 2 — Claude pusht selbst (wie SP-26)
- Neuer Chat: ZUERST `add_repo` (owner martingaspar-gasparaiconsulting, repo argonaut-website, access push) — sonst 403 beim Push.
- Werkstatt: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git /home/claude/repo`, `bash scripts/claude-start.sh > /tmp/claude-start.log 2>&1 &`.
- /tmp/build.sh (next build mit Env-Platzhaltern + Font-Attrappe /tmp/fontmock/mock.js) und /tmp/push.sh (commit als Martin + Co-Author, push, Vercel-Status pollen) neu anlegen — Inhalt siehe SP-26.
- Sicherungen fuer Gegenproben NIE per basename (page.tsx kollidiert) — vollen Namen nehmen.
- SQL-Bloecke klein, einer je Paket, gesammelt am Ende einer Runde.

## Stand
- Live heute: P384 LK7 Wartungstermine 9c4deff · P385 Salzgrotten/697 · P386 MO0c Mindestlohn-Empfehlung + Gesundheitsangaben · P387 MO1 Teil 1 Messwert-Feld.
- SQL p384 + p386 an Martin geliefert (Ende Runde SP-26) — Kontrolle 4 bzw. 1|1.
- Martin 16.10.: Mindestlohn nie festschreiben, immer Empfehlung mit Stand + naechster Erhoehung, Betrieb kann immer aendern. 697 Branchen (Salzgrotten in Gesundheit & Wellness). Webseite wird Handwerker-Auftritt (Paket WEB-HW, gemeinsam).
- Handwerk Platz 1a offen: MO1 (Teil 2–4), MO1v-HW, LK2, LK5 (2), HW-4, MO4 (4), HW-2 (3), C1 (2, Anwalt), D1 (2, Hetzner), HW-1 (2), HW-3 (2), WEB-HW (2).

## Naechster: MO1 Teil 2 — Bezug + Intervall/Frist
- Motor = Ausbau Formular-Baukasten (lib/formularBaukasten.ts, app/dashboard/formulare/page.tsx, supabase-sql/pl-formulare.sql). Alte Pruefprotokolle (pruef_protokoll/pruef_punkt/assets, KEIN CREATE TABLE im Repo) laufen unveraendert.
- Teil 2 (SQL): formular_eintrag.bezug_typ/bezug_id (anlage/fahrzeug/tier/kunde/baustelle), formular_vorlage.intervall_monate, formular_eintrag.naechste_faellig; Fristen-Helfer aus lib/nachweisMotor.ts (plusMonate, bewerte).
- Teil 3 (SQL): echte Sperre nach Abschluss (auch Chef) + Tabelle formular_nachtrag (nur anhaengen). Vorher Martin sagen: Chef kann Abgeschlossenes dann nicht mehr aendern.
- Teil 4: QR am Objekt „Protokoll starten" (lib/qr.ts, fuhrparkGeraete akteLink/qrSvg), Norm-Startvorlagen aus lib/pruefungen.ts PRUEF_NORMEN.
- Unterschrift-Zeichenflaeche gibt es 6x einzeln — gemeinsame Komponente waere ein eigener Aufraeum-Push.
