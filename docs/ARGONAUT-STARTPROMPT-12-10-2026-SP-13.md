# ARGONAUT · Startprompt SP-13 (12.10.2026 abends, Chatwechsel nach BV3a komplett)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann sofort weiterbauen (BV3b Feinkost Teil 1).
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
- Neu (P341): Anwalt-Fragen fortlaufend nummerieren — R51 ist vergeben (Preis-Treppe), nächste freie Nummer R52. Vorher /areas/argonaut-anwalt-checkliste-2.md lesen.
- next build nicht gleichzeitig mit npm test/tsc laufen lassen (SIGKILL = Speicher) — nacheinander.

## Stand (12.10.2026, ~19:30)
- Live: P339 (Reife-Uhr), P340 (e621567, Kalkulation mit Reifeverlust, SQL p340 1|4|2|1), P341 (8f9818f, Preis-Treppe Reife/MHD, SQL p341 3|2). BV3a komplett (Rest „wartet auf Anwalt“, R51).
- Bauliste-Artifact Version 138 „P341 live“: 178 von 263 (68 %), 85 offen.
- Diese Datei liegt untracked auf dem Gerät — mit P342 committen.

## Was BV3a gebaut hat (Grundlage für BV3b)
- reife_charge (+ mhd seit p341), reife_messung; reife_kalk (eigene Tabelle, nur Chef/„Darf abrechnen“ + Modul lebensmittel; ek, kosten, parier, verlust, marge, mwst 0/7/19, vk_preis brutto je Preis-Einheit, preis_treppe/mhd_treppe jsonb).
- lib/reife.ts, lib/reifeKalk.ts (planKalk/istKalk, preisEinheit g->kg), lib/reifeTreppe.ts (preisHeute, preisschildHtml, mhdPruefen). Seite app/dashboard/lebensmittel/reife (+ ReifeKalkBox.tsx).
- Start-Schalter startSperre.reifePreisTreppe = aus (Preisschild nur ENTWURF, kein Streichpreis).
- Claude-Entscheidung P340: Preise nie als Spalten an Tabellen, die Mitarbeiter ohne „Darf abrechnen“ lesen — eigene Tabelle wie kfz_bestand_kalk (P265).

## JETZT: BV3b Feinkost (3 Pushes) — Bauliste-Zeile
„Verkaufs-Seite: Schaufenster mit Vorbestellung, Vormerkliste und LMIV-Wächter, Box-Konfigurator mit Saison-Kapazität. Baut auf BV3a auf. Freischalten erst nach dem Anwalt (Lebensmittel).“
- ZUERST Bestandsaufnahme am echten Code (nicht raten): Shop S3a/S4 (app/dashboard/shop/*, app/api/oeffentlich/shop-produkte + shop-bestellung, public/shop.js, lib/shopSprachen TEXT_ZUSATZ_KEYS), Etiketten/LMIV (app/dashboard/etiketten, 14 Allergene), Lebensmittel-Chargen (app/dashboard/lebensmittel, charge_los), Artikel/Lager. Was gibt es schon an Vorbestellung/Reservierung (app/dashboard/reservierung?) und Wartelisten?
- Vorschlag Aufteilung: Teil 1 Vorbestellung + Vormerkliste je Artikel/Reife-Charge (knappe Menge, Abholtermin, Benachrichtigung nur mit Einwilligung); Teil 2 LMIV-Wächter im Schaufenster (Allergene/Pflichtangaben aus Etiketten, ohne vollständige Angaben kein Bestellknopf); Teil 3 Box-Konfigurator mit Saison-Kapazität.
- Alles Kundenseitige hinter Start-Schalter (startSperre) + Sperr-Gedächtnis + Anwalt-Frage (R52 ff.). Neue Shop-Texte in TEXT_ZUSATZ_KEYS.
- Danach: A0 Freigabe-Zentrale (2) ff., C1, D1 zuletzt; EK1 nach dem Anwalt.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede http-URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- tsc: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` (> 2 Min.).
- Test-PG: /usr/lib/postgresql/16/bin; useradd -m pgu; initdb -D /home/pgu/data -A trust, Start `-o '-p 5499 -k /tmp'`; Stubs auth.uid()/mein_chef_id() aus test.uid/test.chef; Rollen anon/authenticated/service_role; neue Tabellen im Test explizit granten.
- Container-Zeitzone Europe/Berlin — Zeitzonen-Gegenproben mit `TZ=UTC`.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Nach neuem Test `node scripts/tests-bauen.cjs`. Guide-Einträge nur für Menü-Seiten.
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
- Bauliste: rows.py — bei Mehr-Push-Paketen eine neue Zeile ('NNN', …, 'live') vor die Paket-Zeile und deren Pushes um 1 senken; gen.py-Kopf „_pNNN unterwegs“ committen; fürs Artifact Kopie mit Kopf „PNNN live“ veröffentlichen.
