# ARGONAUT Startprompt SP-28 (16.10.2026, mittags)

Vorgaenger: SP-27. Baulog: Memory /areas/argonaut-bauliste-1013.md (Abschnitt „16.10. vormittags (Chat SP-27…)", Datei fast voll → neuen Baulog /areas/argonaut-bauliste-1016.md anlegen) · Kontrollgang /areas/argonaut-kontrollgang-2.md · Anwalt /areas/argonaut-anwalt-checkliste-3.md, naechste R66 · Testtag /areas/argonaut-testtag-4.md.

## Weg 2 — Claude pusht selbst (wie SP-27)
- Neuer Chat: ZUERST `add_repo` (owner martingaspar-gasparaiconsulting, repo argonaut-website, access push), dann `git clone --depth 1 … /home/claude/argonaut-website`, `bash scripts/claude-start.sh > /tmp/claude-start.log 2>&1 &`.
- Hilfsskripte neu anlegen: /tmp/build.sh (next build mit Env-Platzhaltern + Font-Attrappe /tmp/fontmock/mock.js, siehe SP-26), /tmp/push.sh "Text" dateien… (commit als Martin + Co-Author, push, Vercel pollen), /tmp/kopf.sh "Text" (Bauliste-Kopfzeile in gen.py + gen.py laufen lassen), /tmp/live.sh KUERZEL (Status in rows.py auf live).
- Pruef-Kette je Paket: Paket-Tests + Gegenproben (Sicherung mit vollem Namen) + npm test (nur Win-1252 rot) + build.sh; danach push.sh; Bauliste-Artifact mit url neu veroeffentlichen.
- SQL-Bloecke klein, einer je Paket, gesammelt am Rundenende.

## Stand (alles Vercel success)
- P388 MO1 Teil 2 Bezug + Frist 647d206 · P389 MO1 Teil 4 QR + Norm-Vorlagen 889df85 · P391 MO1v-HW Vorlagen Handwerk/Energie 68902a1 · P392 LK2 Gewaehrleistung am Auftrag 1659295 · P393 LK5 Teil 1 Lohnvorbereitung 240bb66 · P394 HW-4 Ausfallstunden f33534d · P396 MO4 Teil 1+2 Mengen-Abrechnung + Sammelrechnung 809b496.
- SQL an Martin geliefert (Ende Runde SP-27): p388 (4), p392 (2), p394 (1|2), p396 (1|4). Code laeuft vor dem SQL.
- MARTIN HAT AM 16.10. 11:52 BEIDEN ZUGESTIMMT (P390 ja, P395 ja) — als ERSTES im neuen Chat aufspielen (gebaut, noch NICHT auf main, je eigener Branch):
  - P390 MO1 Teil 3 Sperre nach Abschluss + Nachtraege — Branch `wartet/p390-mo1-teil3-sperre` (Basis P389; vor Merge auf main rebasen, Konflikt nur app/dashboard/formulare/page.tsx), SQL p390 (2|2).
  - P395 LK5 Teil 2 Freigabe + Monats-Sperre — Branch `wartet/p395-lk5-freigabe-sperre` (Basis P394; Konflikt nur lohnvorbereitung/page.tsx), SQL p395 (3|1).
  - Reihenfolge bei Ja: Branch rebasen → Pruef-Kette → push → SQL an Martin. Bei MO1 Teil 3 danach Bauliste MO1 live.

## Handwerk Platz 1a offen
MO1 (Teil 3 wartet), LK5 (Teil 2 wartet), MO4 (Teil 3+4), HW-2 Bauzeitenplan (3), HW-1 Kupferzuschlag (2, gesperrt bis Anwalt), HW-3 Foerderantrag Heizung (2, gesperrt bis Anwalt), C1 (Anwalt), D1 (Hetzner), WEB-HW (gemeinsam).

## Naechster: erst P390 + P395 aufspielen (siehe oben), dann MO4 Teil 3
- Stornierte Sammelrechnung gibt Leistungen frei (rechnung_id → zahlungsstatus storniert ⇒ abgerechnet false, rechnung_id null; Knopf „Leistungen wieder freigeben" auf der Rechnungsseite oder in /dashboard/mengen).
- Mengen am Auftrag/Objekt erfassen (bezug_typ/bezug_id gibt es schon in p396), Vorbelegung per Link aus Auftrag.
- Teil 4: Monatslauf „alle Kunden abrechnen" (Vorschau, dann je Kunde eine Rechnung), Modul „mengen" fuer Landwirtschaft/Spedition/Kanzlei freischalten (branchenkatalog).
- Danach HW-2 Bauzeitenplan (projekte + Gewerke mit Abhaengigkeiten, Gantt-Ansicht), dann HW-1/HW-3 hinter Freigabe-Zentrale-Schalter.
