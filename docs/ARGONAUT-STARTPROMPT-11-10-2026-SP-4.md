# ARGONAUT · Startprompt SP-4 (11.10.2026, nachmittags)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
- Ein zweiter Start einer schon gelaufenen _pNNN ist harmlos (nichts zu committen -> Abbruch ohne Push), trotzdem nur einmal starten.
- NICHT aus dem Klon pushen (nach Martins Push: git fetch + stash + ff-merge, Inhalt vergleichen, stash weg).
- Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100 (centRunden/rundeStellen aus lib/zahlen).
- Diese Datei ist untracked und wird mit P316 (S3a) committet.
- Martin wiederholt nach jedem Startbefehl gern: „Ich brauche noch den Anfangs-CMD“ -> immer zuerst
  `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN` liefern.

## Stand (11.10.2026, nachmittags)
- Heute live: P309–P313 (SP1, BV2 komplett), P314 CH1 ehrliche Chemie-Texte (eb13d1f), P315 S1 Produkt-Dokumente (24a9ca4, SQL-Kontrolle 1|4|2|3|true).
- Befunde CH1: `nachweise` (mit Gefahrstoffverzeichnis) ist seit P194 Grundausstattung (KERN_MODULE); `etiketten` ist ein reines LMIV-Modul und bleibt aus dem Industrie-Paket (GHS-Etiketten mit S2/G2b).
- S1 gebaut: Tabelle produkt_dokument + Bucket produkt-dokumente (privat, PDF, 20 MB), lib/produktDokumente.ts (26 Sprachen = 24 aus lib/mehrsprachig + nl/zh, Ampel, shopDokumente), Artikel-Akte app/dashboard/erp/[id]/ProduktDokumente.tsx, Übersicht /dashboard/erp/dokumente, öffentliche Tür /api/oeffentlich/produkt-dokument (60-s-Link, Drossel), shop-produkte liefert `dokumente`, public/shop.js zeigt Links.
- Martin 11.10. 12:37 (in rows.py umgesetzt): BV3 getrennt in BV3a Manufaktur + BV3b Feinkost (je 3 Pushes); S4 = „Shop mehrsprachig (24 Sprachen)“, 2 Pushes; R1 Rezeptur in Prozent allgemein für alle Mischbetriebe; S3b „nur Gewerbekunden“ passt.
- Bauliste: 152 von 206 (74 %), Artifact Version 111 (Kopf „P315 live · nächster S3a“ nur im Artifact). Kopf in gen.py beim nächsten Paket auf „_p316 unterwegs“ setzen.
- Achtung rows.py: Es gibt ZWEI Zeilen mit Kennung „S1“ (alte, erledigte Sammelpaket-Zeile weit oben und die Chemie-Zeile, jetzt „315“). Beim Ändern immer die ganze Zeile prüfen, nie die erste Fundstelle nehmen.

## Nächstes (Claude-Empfehlung, Martin hat nicht widersprochen)
1. S3a Geschäftskunden-Shop (technisch, 1–2 SQL, 2 Pushes): Kundenkonto per Link, Kundenpreise/Preislisten, Staffelpreise, Netto-Anzeige, Gebinde und Mindestmenge, Kauf auf Rechnung.
   Bestand zuerst lesen: public/shop.js (Warenkorb, Kasse, nur EUR), app/api/oeffentlich/shop-bestellung, lib/shopUebernahme.ts, app/dashboard/shop, Preisliste unter app/dashboard/erp/preisliste, Kundenportal app/portal/[token]. Geld-Teil = GEMEINSAM-Regel (Befund + Lösung zeigen, dann sofort bauen).
2. G2a Gefahrstoffverzeichnis 2.0, dann Q1, R1, S4 (mehrsprachig), dann Stufe-2-Bausteine (S2, S3b, S5, G2b, G2c: Schalter aus bis R49, Sperr-Gedächtnis P224).
   Danach PS-1, BV2b, BV3a/BV3b, C1, D1 ganz am Schluss.
- Offen (Claude-Befund): bestehende Kontakte haben fast alle Betreuungs-Intervall 30 — Knopf „Takt für alle übernehmen“ wäre ein kleines Zusatzpaket.
- Kontrollgang: „in Echtzeit“ steht 294-mal in branchen-web-extra.ts — vor Go-live gesammelt ersetzen.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- Klicktest: Supabase-Attrappe (node http auf 54321: /auth/v1/user liefert Nutzer, /rest/v1/<tabelle> liefert Zeilen,
  Accept vnd.pgrst.object -> erstes Objekt; CORS-Kopfzeilen + OPTIONS 204 nötig, sonst lädt die Seite nichts), Cookie sb-127-auth-token = "base64-" + base64url(Session-JSON),
  `next start -p 3005`, Playwright mit executablePath /opt/pw-browsers/chromium. Server per PID stoppen (nicht pkill -f, das trifft die eigene Shell).
- Test-PG: useradd pgu; Postgres 16 `initdb -D /home/pgu/data -A trust`, Start `-p 5499 -k /tmp`;
  Stubs: Rollen anon/authenticated/service_role, auth.uid() aus test.uid, mein_chef_id() aus test.chef.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Testbau übersetzt nur lib-Dateien, die Tests importieren
  (nach neuem Test `node scripts/tests-bauen.cjs`).
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
