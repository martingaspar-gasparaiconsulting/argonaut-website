# ARGONAUT · Startprompt SP-12 (12.10.2026 abends, Chatwechsel wegen Kontextlänge)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann sofort weiterbauen (BV3a Teil 2).
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat — lange Blöcke in ZWEI Teilen (Supabase-Editor schneidet beim Einfügen ab, P331: „syntax error at end of input“). Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher Gerät = HEAD per md5 prüfen (CR entfernen).
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen (Inhalt = Repo-bauliste.html mit Kopf „PNNN live“). Wird der Publish abgelehnt: gespeicherte Live-Datei nehmen, nur die eigene Änderung einsetzen, erst `action: read`, dann publish.
- Ein anderer Chat (Gesprächs-Chat) ergänzt manchmal rows.py/gen.py/bauliste.html auf dem Gerät. Vor dem Schreiben immer Gerät gegen HEAD prüfen; nach Martins Push Klon mit origin abgleichen (git fetch, reset --soft origin/main, reset), nie überschreiben.
- Baulog: /areas/argonaut-bauliste-1011.md. Kontrollgang: /areas/argonaut-kontrollgang-2.md. Testtag: /areas/argonaut-testtag-3.md. Anwalt: /areas/argonaut-anwalt-checkliste-2.md.
- GitHub-Fehler „remote rejected / fatal error in commit_refs“ beim Push: Commit liegt lokal, NUR `git push` wiederholen, _pNNN NICHT neu starten.
- NICHT aus dem Klon pushen. Stop-Hinweis „uncommitted changes“ im Container ist bekannt — trotzdem nie selbst pushen.
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein eigener Cent-Runder — auch nicht im KOMMENTAR (tests/centRundungP191).
- Neue Shop-Texte in lib/shopSprachen IMMER in TEXT_ZUSATZ_KEYS.
- Start-Schalter (lib/startSperre) immer zusätzlich als `SCHALTER startSperre.X = aus` + Tabellenzeile in docs/ARGONAUT-SPERR-GEDAECHTNIS.md.
- Martin braucht nach jedem Paket den Anfangs-CMD: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.
- Vercel-Fehler „Git information retrieval failed“ = kein Code-Fehler → Martin klickt „Redeploy“.
- Rechtzeitig vor zu langem Kontext Bescheid geben und den nächsten Startprompt schreiben.

- Neu (P339): Test-PG braucht Stubs auth.uid()/mein_chef_id()/darf_ich_modul_sehen/aendern aus test.uid/test.chef/test.sehen/test.aendern und die Funktion p181_besitzer (aus supabase-sql/p181-besitzer-betrieb-3.sql); neue Tabellen im Test für authenticated granten.
- next build nicht gleichzeitig mit npm test/tsc laufen lassen (SIGKILL = Speicher) — nacheinander.

## Stand (12.10.2026, ~18:45)
- Live: P338 (30941ce, BV2b Feinschliff — BV2b komplett) und P339 (8b04b44, BV3a Teil 1 Reife-Uhr). SQL p339 live 2|7|4|2.
- Bauliste-Artifact Version 136 „P339 live“: 176 von 263 (67 %), 87 offen.
- Diese Datei liegt untracked auf dem Gerät — mit P340 committen.

## Was P339 gebaut hat (Grundlage für Teil 2 und 3)
- SQL p339: reife_charge (nummer RF-JJJJ-NNN unique je Betrieb, produkt, art dry_aged/rohschinken/rohwurst/kaese/wein/confiserie/sonstig, start_datum, ziel/min/max_tage, start_menge, einheit kg/g/l/Stk, lagerort, temp_min/max, feuchte_min/max, status reift/bereit/abgeschlossen/verworfen, end_datum, end_menge, notiz) + reife_messung (datum, menge, temperatur, feuchte, notiz; nie UPDATE). Wächter p339_reife_waechter. Rechte Modul „lebensmittel“, MA ohne delete.
- lib/reife.ts: REIFE_VORLAGEN (Startwerte), tagNr/plusTage/reifeTage, reifeStand (Stufen), letzteMenge, verlustProzent (rundeStellen), klimaAbweichung, tageOhneMessung, chargePruefen, messungPruefen, naechsteNummer, reifeUebersicht.
- Seite app/dashboard/lebensmittel/reife (NAV „⏳ Reife-Uhr“, Guide-Eintrag, Link auf der Lebensmittel-Seite). Tests tests/reifeP339.test.mjs.
- Claude-Entscheidung: Reife-Uhr ohne Start-Schalter (interne Doku); Schalter erst für die Preis-Treppe (Teil 3).

## JETZT: BV3a Teil 2 — Kalkulation mit Reifeverlust (1 Push)
- Je Reife-Charge: Einkaufspreis (netto je Einheit der Startmenge oder gesamt), Nebenkosten (Strom/Reifeschrank je Tag, Arbeit, Verpackung), Parier-/Abschnittverlust in % (Trim nach der Reifung, z. B. Dry-Aged Kruste), daraus Einstandspreis je verkaufsfähigem kg = (EK + Kosten) / (Endmenge × (1 − Parierverlust)); Plan (mit erwartetem Verlust aus Vorlage/Eingabe) vs. Ist (gewogene Endmenge).
- Verkaufspreis-Vorschlag aus Wunsch-Marge (nur Rechnung, keine Marktpreise, kein KI-Preis); Geld über lib/zahlen centRunden.
- SQL additiv: Spalten an reife_charge (ek_gesamt, kosten_tag, kosten_sonst, parier_prozent, erwarteter_verlust, marge_prozent, vk_preis) — Preise nur Chef oder „Darf abrechnen“? → Bestand prüfen (lib/rechte, darf_ich_abrechnen) und entscheiden; EK für Mitarbeiter ohne Recht ausblenden.
- Danach Teil 3: Preis-Treppe nach Reife/MHD (mit Start-Schalter + Sperr-Gedächtnis), dann BV3b Feinkost (3), A0 Freigabe-Zentrale (2) ff., C1, D1 zuletzt; EK1 nach dem Anwalt.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede http-URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- tsc: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` (> 2 Min.).
- Test-PG: /usr/lib/postgresql/16/bin; useradd pgu; initdb -D /home/pgu/data -A trust, Start `-o '-p 5499 -k /tmp'`; Stubs auth.uid()/mein_chef_id() aus test.uid/test.chef; Rollen anon/authenticated/service_role; neue Tabellen im Test explizit granten.
- Container-Zeitzone Europe/Berlin — Zeitzonen-Gegenproben mit `TZ=UTC`.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Nach neuem Test `node scripts/tests-bauen.cjs`. Guide-Einträge nur für Menü-Seiten.
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
- Bauliste: rows.py — bei Mehr-Push-Paketen eine neue Zeile ('NNN', …, 'live') vor die Paket-Zeile und deren Pushes um 1 senken; gen.py-Kopf „_pNNN unterwegs“ committen; fürs Artifact Kopie mit Kopf „PNNN live“ veröffentlichen.
