# ARGONAUT · Startprompt SP-14 (12.10.2026 abends, Chatwechsel nach BV3b Teil 1)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann sofort weiterbauen (BV3b Teil 2 Shop-Schaufenster).
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat — in Blöcken von höchstens ca. 40 Zeilen (Supabase-Editor schneidet beim Einfügen ab: P331 und P342 bei Zeile 50). Reihenfolge klar nummerieren (Tabellen vor Funktionen mit %rowtype). Zusätzlich `chcp 65001 >nul && type "supabase-sql\pNNN-....sql" | clip` anbieten. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
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
- Neu (P341): Anwalt-Fragen fortlaufend nummerieren — R52 ist vergeben (Vorbestellung/Vormerkliste), nächste freie Nummer R53. Vorher /areas/argonaut-anwalt-checkliste-2.md lesen.
- next build nicht gleichzeitig mit npm test/tsc laufen lassen (SIGKILL = Speicher) — nacheinander.

## Stand (12.10.2026, ~20:10)
- Live: P341 (8f9818f), P342 (f8074ae, Vorbestellung und Vormerkliste, SQL p342 3|12|6|3). BV3a komplett, BV3b Teil 1 fertig.
- Bauliste-Artifact Version 139 „P342 live“: 179 von 263 (68 %), 84 offen. BV3b Rest 2 Pushes.
- Diese Datei liegt untracked auf dem Gerät — mit P343 committen.

## Was P342 gebaut hat (Grundlage für Teil 2)
- Tabellen vorbestell_aktion (titel, reife_charge_id, artikel_id, menge_gesamt, einheit, max_je_kunde, abhol_von/bis, bestell_schluss, status entwurf/offen/geschlossen/abgeschlossen), vorbestell_posten (quelle theke/telefon/mail/shop/vormerkliste — „shop“ ist schon vorgesehen), vormerkung (Einwilligung Pflicht per CHECK, Wortlaut + Zeitpunkt fest).
- Wächter p342_vorbestell_waechter: Aktion FOR UPDATE, nie mehr als menge_gesamt, max je Kunde, Abholtag im Zeitraum, neue Posten nur bei status offen.
- lib/vorbestellAktion.ts (aktionStand, postenPruefen, vormerkPruefen, EINWILLIGUNG_WORTLAUT, nachrueckVorschlag, benachrichtigungsText …), Seite app/dashboard/lebensmittel/vorbestellung. Teil 1 rein intern, kein Versand, kein Start-Schalter.

## JETZT: BV3b Teil 2 Shop-Schaufenster (1 Push) — danach Teil 3 Box-Konfigurator (1 Push)
- ZUERST Bestandsaufnahme am echten Code: app/api/oeffentlich/shop-produkte + shop-bestellung (Service-Role: jede Abfrage .eq owner_user_id, Mengen-Deckel aus P161), public/shop.js, lib/shopSprachen (neue Texte in TEXT_ZUSATZ_KEYS), Etiketten/LMIV (app/dashboard/etiketten, 14 Allergene, Pflichtangaben-Prüfung), startSperre.shop.
- Vorschlag: Aktion bekommt Schalter „im Shop zeigen“ (Spalte additiv). Öffentliche Route liefert offene Aktionen mit frei/Abholzeitraum; Vorbestellung aus dem Shop legt vorbestell_posten mit quelle shop an (Server prüft wie postenPruefen, Wächter schützt ohnehin); ausgebucht -> Vormerk-Formular mit Einwilligungs-Häkchen (Wortlaut aus lib). LMIV-Wächter: ohne vollständige Pflichtangaben (Etikett zum Artikel) kein Vorbestell-Knopf.
- Alles Kundenseitige hinter neuem Start-Schalter (z. B. startSperre.vorbestellShop = aus) + SCHALTER-Zeile + Tabellenzeile im Sperr-Gedächtnis + Anwalt R52 ergänzen (R53 ff. für Neues).
- Danach: Teil 3 Box-Konfigurator, dann A0 Freigabe-Zentrale ff., C1, D1 zuletzt; EK1 nach dem Anwalt.

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
