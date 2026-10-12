# ARGONAUT · Startprompt SP-15 (12.10.2026 spätabends, Chatwechsel nach BV3b Teil 2)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann sofort weiterbauen (BV3b Teil 3 Box-Konfigurator).
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat — in Blöcken von höchstens ca. 40 Zeilen (Supabase-Editor schneidet beim Einfügen ab: P331 und P342 bei Zeile 50). Reihenfolge klar nummerieren (Tabellen vor Funktionen mit %rowtype). Zusätzlich `chcp 65001 >nul && type "supabase-sql\pNNN-....sql" | clip` anbieten. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher Gerät = HEAD per md5 prüfen (CR entfernen).
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen (Inhalt = Repo-bauliste.html mit Kopf „PNNN live“). Wird der Publish abgelehnt: gespeicherte Live-Datei nehmen, nur die eigene Änderung einsetzen, erst `action: read`, dann publish.
- Ein anderer Chat (Gesprächs-Chat) ergänzt manchmal rows.py/gen.py/bauliste.html auf dem Gerät. Vor dem Schreiben immer Gerät gegen HEAD prüfen; nach Martins Push Klon mit origin abgleichen (git fetch, reset --soft origin/main, reset), nie überschreiben.
- Baulog: /areas/argonaut-bauliste-1011.md ist fast voll (45 von 48 KB) — im neuen Chat ZUERST /areas/argonaut-bauliste-1012.md anlegen (Fortsetzung, aliases bauliste-1012, baulog-1012, bauliste-aktuell) und dort weiterschreiben. Kontrollgang: /areas/argonaut-kontrollgang-2.md. Testtag: /areas/argonaut-testtag-3.md. Anwalt: /areas/argonaut-anwalt-checkliste-2.md.
- GitHub-Fehler „remote rejected / fatal error in commit_refs“ beim Push: Commit liegt lokal, NUR `git push` wiederholen, _pNNN NICHT neu starten.
- NICHT aus dem Klon pushen. Stop-Hinweis „uncommitted changes“ im Container ist bekannt — trotzdem nie selbst pushen.
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein eigener Cent-Runder — auch nicht im KOMMENTAR (tests/centRundungP191).
- Neue Shop-Texte in lib/shopSprachen IMMER in TEXT_ZUSATZ_KEYS.
- Start-Schalter (lib/startSperre) immer zusätzlich als `SCHALTER startSperre.X = aus` + Tabellenzeile in docs/ARGONAUT-SPERR-GEDAECHTNIS.md.
- Martin braucht nach jedem Paket den Anfangs-CMD: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.
- Vercel-Fehler „Git information retrieval failed“ = kein Code-Fehler → Martin klickt „Redeploy“.
- Rechtzeitig vor zu langem Kontext Bescheid geben und den nächsten Startprompt schreiben.

- Neu (P339): Test-PG braucht Stubs auth.uid()/mein_chef_id()/darf_ich_modul_sehen/aendern aus test.uid/test.chef/test.sehen/test.aendern und die Funktion p181_besitzer (aus supabase-sql/p181-besitzer-betrieb-3.sql); neue Tabellen im Test für authenticated granten.
- Anwalt-Fragen fortlaufend nummerieren — R53 ist vergeben (Vorbestellung im Shop), nächste freie Nummer R54. /areas/argonaut-anwalt-checkliste-2.md ist fast voll (44 von 48 KB) — bei Bedarf argonaut-anwalt-checkliste-3.md anlegen.
- next build nicht gleichzeitig mit npm test/tsc laufen lassen (SIGKILL = Speicher) — nacheinander.

## Stand (12.10.2026, ~22:15)
- Live: P342 (f8074ae), P343 (49b905e, Vorbestellung im Shop-Schaufenster, SQL p343 1|1|0). BV3b Teil 1 + 2 fertig.
- Bauliste-Artifact Version 140 „P343 live“: 180 von 263 (68 %), 83 offen. BV3b Rest 1 Push (Teil 3).
- Diese Datei liegt untracked auf dem Gerät — mit P344 committen.

## Was P343 gebaut hat (Grundlage für Teil 3)
- vorbestell_aktion.im_shop (SQL p343). lib/vorbestellShop.ts (einheitNorm, fernabsatzFehlend = LMIV ohne MHD, etikettZumArtikel, shopBereitschaft, lmivFuerShop, shopAktion, kundeBisher, shopVorbestellPruefen, vbMailTexte de/en), lib/vorbestellShopServer.ts (ladeAktionen hart owner, fuerSchaufenster).
- Route app/api/oeffentlich/vorbestellung (403 bis Start-Schalter shop UND vorbestellShop frei; Drossel 'oeffentlich/vorbestellung'; offene Tür eingetragen; P0001-Meldungen des Wächters gehen an den Kunden).
- shop-produkte liefert vorbestellung + vb_einwilligung nur mit beiden Schaltern; public/shop.js Kacheln .ao-vb über den Produkten; 28 Texte vb_* in TEXT_DE/TEXT_EN als TEXT_ZUSATZ_KEYS (shop.js DE muss gleich bleiben, Test P324/P343); CSS in lib/webBloecke.ts.
- Seite Vorbestellung: Artikel-Auswahl, Kasten „🛒 Im Online-Shop“ mit Gründen.
- tests/vorbestellShopP343 (9), tests/shopGewerbeP327 angepasst (Zusatz-Liste wächst).

## JETZT: BV3b Teil 3 Box-Konfigurator mit Saison-Kapazität (1 Push) — danach A0 Freigabe-Zentrale ff.
- ZUERST Bestandsaufnahme am echten Code: gibt es schon Geschenkkörbe/Sets/Stücklisten (grep „Set“, „Stückliste“, „bundle“, artikel-Varianten, rezeptur), wie bucht das Lager (lager_bewegung), Kalender/Kapazität (Produktions- oder Abholtage)?
- Vorschlag: Box-Vorlage (Name, Grundpreis, Fächer/Anzahl, wählbare Artikel je Fach, Aufpreise) + Saison-Kapazität je Tag/Woche (max. Boxen, Bestellschluss), intern bestellbar (Theke/Telefon) mit Mengen-Wächter wie p342; Kundenseite im Shop erst hinter eigenem Start-Schalter (z. B. boxShop) bzw. vorbestellShop mitnutzen — Aufpreise/Gesamtpreis immer serverseitig, LMIV je enthaltenem Artikel (Etikett), Allergene der Box = Vereinigung.
- Danach: A0 Freigabe-Zentrale (2), A1 Vorlagen-Prinzip (3), A2 Datei-Sicherung (1), A3, A4a–i, A5, A6; C1, D1 zuletzt; EK1 nach dem Anwalt.
- Offene Claude-Befunde aus dem Kontrollgang: lib/sicherungTabellen.ts kennt Reife- und Vorbestell-Tabellen (P339–P343) noch nicht — bei A2 Datei-Sicherung mitziehen.

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
