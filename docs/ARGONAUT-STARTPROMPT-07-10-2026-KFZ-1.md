# ARGONAUT · Startprompt KFZ-1 (07.10.2026)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Erst wenn origin/main den vorigen
Commit zeigt, schreiben; vorher Gerät = origin/main per md5 prüfen.

## Stand
- Letzter Push: **P257 live (32547245)** – Bauliste im Repo angeglichen + Anwaltsliste der 107 zurückgestellten Branchen
  (docs/anwalt/ZURUECKGESTELLTE-BRANCHEN-2026-10-07.md).
- **Fachdossiers fertig ohne Anwalt:** 385 von 698 mit Text, 206 gesperrt (Anwalt), 107 bewusst zurückgestellt.
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 51: 91 von 128 Pushes (71 %), offen 37 (Kfz-Pilot 20).
  Quelle docs/bauliste/ (rows.py, gen.py → python3 gen.py). Nach jedem Push: Status in rows.py auf "live", neu erzeugen, Artifact mit url neu veröffentlichen.
- Nächste freie Paketnummer: **P258**.

## Heute in dieser Reihenfolge (von Martin freigegeben)
1. **Kfz-Pilot, Muster zuerst.** Vor dem Bauen lesen: docs/ARGONAUT-UEBERGABE-KFZ-PILOT-06-10-2026.md und das Claude Doc
   „ARGONAUT Bauplan Kfz-Handel" (https://claude.ai/code/artifact/ecaaa20f-21d0-4705-a957-f1c0f3170fc4).
   Martin will es zuerst SEHEN: klickbares Muster (Artifact) für K1 Fahrzeugbestand + K2 Handelsakte, im ARGONAUT-Look,
   nur mit Beispieldaten. Erst nach seinem Okay K1 bauen. Code-Abgleich 06.10.: vorhanden Werkstatt-Board, Fahrzeugakte
   (werkstatt_fahrzeuge), kfz_fahrzeuge (HU/AU, Reifenhotel), Schaden, GwG kfz, Sign, Provisionen, Fuhrpark/Verleih;
   FEHLT Handelsbestand, § 25a. Handelsbestand per FIN mit den bestehenden Tabellen verknüpfen, keine vierte Insel.
2. **Speicher-Wächter auf AGB-Formel (getrennt liefern, Aussperr-Risiko für Kunden!)** – bauen, während Martin das Muster ansieht.
   Befund am Code: lib/speicher.ts hat feste Grenzen je Tarif (solo 5 / mini 15 / klein 50 / mittel 150 / gross 500 /
   enterprise 1024 GB, Standard 25), wirkt in Upload-Routen (u. a. app/api/webseite-foto, app/api/wissen-dokument,
   erstellte-dokumente, marketing/freebie, social-video, documents/trigger-analysis). AGB § 9a.1: 100 GB je Mitarbeiter gepoolt
   + Zusatzblöcke à 100 GB (lib/tarif.ts). Lösung: Formel aus Sitzanzahl, nie unter der alten Grenze, Tests + Gegenproben.
3. **Stornorechnung und Gutschrift als echter Beleg** – VOR K7 (Rechnung Fahrzeugverkauf). Kern-Geld (GEMEINSAM-Regel:
   Befund + Lösung zeigen, dann sofort bauen). Heute nur freies Dokument ohne Nummernkreis/Ablage; Stornieren-Dialog
   verweist auf eine „Stornorechnung", die es nicht gibt. Eigener Nummernkreis, Bezug zur Originalrechnung, feste Ablage
   mit Prüfsumme wie P197, E-Rechnung.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git /home/claude/klon`,
  Zweig klon-arbeit, Push sperren (`git remote set-url --push origin no-push`), `npm ci`.
- Build im Container: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<Mock> NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`. Mock liegt auf dem Gerät:
  docs\intern\dossier-werkzeug\fontmock.js (nach /home/claude/fontmock/mock.js stagen).
- npm test: 1 bekannter Container-Fehler (Windows-1252-Dekodierung), auf Martins Rechner grün.
- Testdatei nach dem Schreiben immer mit `wc -l` prüfen (am 07.10. war eine beim Umbau leer geworden; die Gegenproben haben es gezeigt).
- Nach der Lieferung den Klon per `git stash -u` leeren (Stop-Hook).
- _pNNN.bat aus der vorigen ableiten (CRLF, keine Umlaute in echo-Zeilen), Gerät per device_commit_files mit expectedMtimeMs.

## Offen, aber nicht heute
Logo L1 (Martins Entscheidung), Datei-Sicherung außerhalb Supabase (D1, Anbieterwahl), externe Partner E1–E4, Voice Layer (wartet).
