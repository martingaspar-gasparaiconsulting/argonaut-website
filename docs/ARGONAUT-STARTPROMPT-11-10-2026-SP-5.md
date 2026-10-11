# ARGONAUT · Startprompt SP-5 (11.10.2026, abends)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1011.md (neu, 1009 ist voll).
- NICHT aus dem Klon pushen (nach Martins Push: git fetch + reset --soft origin/main, Inhalt vergleichen).
- Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100 (centRunden/inCent/rundeStellen aus lib/zahlen).
- Diese Datei ist untracked und wird mit P318 (G2a) committet.
- Martin braucht nach jedem Startbefehl den Anfangs-CMD: zuerst
  `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.

## Stand (11.10.2026, abends)
- Heute live: P309–P317. S3a Geschäftskunden-Shop komplett: P316 Verwaltung (5a3b0a9, SQL p316 Kontrolle 3|6|4|2|4), P317 Schaufenster + Rechnung (eecddb1, kein SQL).
- S3a gebaut: lib/shopB2b.ts (Cent ganzzahlig, Kundenpreis = höchste Staffel sonst Rabatt sonst Basis, Gebinde/Mindestmenge, Kreditrahmen, rechnungsPosten), lib/shopB2bServer.ts (Kunde aus Link-Token, nur Hash, nur Betrieb der Seite), /dashboard/shop/geschaeftskunden (Kunden, Preislisten, Gebinde, Preis-Basis), /api/shop/kundenlink, shop.js (#konto=, Kopfzeile x-shop-konto), rechnung-aus-shop übernimmt einzelpreis_netto.
- Behobene Befunde P317: 0-%-Artikel liefen in der Rechnung mit 19 %; geschlossener Shop überschrieb seinen Hinweis mit Produkten/Warenkorb (shop.js bricht ohne .ao-wk-bar ab); Kassen-Haken volle Breite.
- Bauliste: 154 von 206 (75 %), Artifact Version 112 (Kopf „P317 live · S3a fertig · nächster G2a“ nur im Artifact). Kopf in gen.py beim nächsten Paket auf „_p318 unterwegs“ setzen.

## Nächstes: G2a Gefahrstoffverzeichnis 2.0 (technisch, 2 Pushes)
Bauliste-Zeile: SDB-Datei am Stoff, Verknüpfung Stoff ↔ Artikel, Menge aus dem Lager, Lagerklasse als Feld, QR am Lagerplatz (SDB und Betriebsanweisung am Handy), Erinnerung bei altem SDB.
Bestand (Claude-Befund 11.10., gelesen, nicht gebaut):
- Tabelle public.gefahrstoff aus supabase-sql/ps2-qualitaet.sql: owner default auth.uid() (NICHT coalesce(mein_chef_id(), …)), Regeln nur gefahrstoff_chef (alles) + gefahrstoff_ma_select (lesen, OHNE Modul-Prüfung). Keine Datei, keine Lagerklasse, kein Artikel-Bezug. Felder: bezeichnung, hersteller, h_saetze, piktogramme[], signalwort, mengenbereich, arbeitsbereiche, sdb_datum, betriebsanweisung_am, ersatz_geprueft_am, notiz.
- Seite app/dashboard/nachweise/gefahrstoffe/page.tsx (220 Zeilen, Logik lib/qualitaet.ts: pruefeGefahrstoff, leseHSaetze, verzeichnisZeilen, PIKTOGRAMME, MENGENBEREICHE), NAV ebene 2 sensibel, Unterpfad von nachweise.
- Wiederverwenden: P315 produkt_dokument (SDB je Artikel, Bucket produkt-dokumente, Sprache/Fassung) — SDB am Stoff am besten über den verknüpften Artikel ODER eigene Datei für Stoffe ohne Artikel (Reinigungsmittel im Eigenverbrauch). Lager: artikel.aktueller_bestand bzw. artikel_bestand_standort.
- Lagerklasse nach TRGS 510 nur als Feld (Auswahl 1 … 13), KEINE Zusammenlagerungs-Ampel (das ist G2c, aus bis R49).
- QR am Lagerplatz: Mitarbeiter-Ansicht mit Login (keine öffentliche Tür), zeigt SDB + Betriebsanweisungs-Datum.
Danach: Q1, R1, S4 (2), dann Stufe-2-Bausteine S2, S3b, S5, G2b, G2c (Schalter aus bis R49), dann PS-1, BV2b, BV3a/BV3b, C1, D1 zuletzt.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- Klicktest: Supabase-Attrappe (node http auf 54321, CORS + OPTIONS 204, eq.-Filter je Spalte nachbilden, sonst scheitert maybeSingle bei mehreren Zeilen), Cookie sb-127-auth-token = "base64-" + base64url(Session-JSON), `next start -p 3005`, Playwright in eigenem Ordner (npm i playwright@1.56.1, executablePath /opt/pw-browsers/chromium). Server per PID stoppen (ps -eo pid,cmd).
- Test-PG: useradd pgu; /usr/lib/postgresql/16/bin/initdb -D /home/pgu/data -A trust, Start `-o '-p 5499 -k /tmp'`; Stubs: Rollen anon/authenticated/service_role, auth.uid() aus test.uid, mein_chef_id() aus test.chef, darf_ich_modul_sehen/aendern aus test.sehen/test.aendern.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Testbau übersetzt nur lib-Dateien, die Tests importieren (nach neuem Test `node scripts/tests-bauen.cjs`).
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
