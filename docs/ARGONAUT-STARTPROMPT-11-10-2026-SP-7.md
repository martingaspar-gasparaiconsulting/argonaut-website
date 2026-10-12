# ARGONAUT · Startprompt SP-7 (11.10.2026, Feierabend)

Neuer Chat. Zuerst den Skill „argonaut-chatstart“ ausführen (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert:
- Deutsch, nur CMD, „Sie“ in Kundentexten, „Bausteine“ (nie „KI-Agenten“).
- _pNNN.bat nie überschreiben und jede nur EINMAL starten. Prüf-Kette mit Gegenproben, gezielter git add.
- SQL immer vollständig im Chat. Aussperr-Risiken vorher nennen und getrennt liefern. Nur bei „Feierabend“ stoppen.
- Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher Gerät = HEAD per md5 prüfen (CR entfernen).
- Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1011.md.
- NICHT aus dem Klon pushen (nach Martins Push: git fetch + reset --soft origin/main + reset, Inhalt vergleichen). Der Stop-Hinweis „uncommitted changes“ im Container ist bekannt — trotzdem nie selbst pushen.
- Wächter: kein eigener Zahlen-Leser (lib/zahlen leseZahl), kein eigener Cent-Runder — auch nicht als Text im KOMMENTAR (tests/centRundungP191 zählt jede Fundstelle, max. 115).
- Diese Datei liegt untracked auf dem Gerät und wird mit P323 committet.
- Martin braucht nach jedem Startbefehl den Anfangs-CMD: zuerst
  `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` und dann `_pNNN`.

## Stand (11.10.2026, Feierabend)
- Heute live: P309–P322. Letzter Commit 2158ae9 (P322), Vercel Ready.
- P320-Rest erledigt: Altwert status 'frei' bei CH-2026-071 auf 'freigegeben' gesetzt (Kontrolle 0).
- R1 Rezeptur in Prozent KOMPLETT:
  - P321 (66a51fc, SQL p321 live 5|1|0): Typ „mischung“ = Prozent-Rezeptur (keine modus-Spalte; Standard-Ansatz = basis_menge, Verlust = backverlust_prozent), rezeptur_zutaten + anteil_prozent/ist_rest/artikel_id, rezepturen + gebinde_menge/gebinde_kosten, lib/rezepturProzent.ts (Einwaage mit Rundungsausgleich, Summe exakt).
  - P322 (2158ae9, SQL p322 live 1|1|2|4|0): rezeptur_version (nur lesen, Schreiben nur über Funktionen), rezeptur_zutaten_speichern (atomar — behebt: Mitarbeiter haben kein DELETE, Zutaten standen doppelt), rezeptur_version_anlegen, rezeptur_rohstoff_tauschen, rezeptur_ansatz_charge (security invoker, Charge in Quarantäne, Eingang je Rohstoff, Ausgang an Rohstoff-Charge, Wächter p320), rezepturen.artikel_id (Fertigprodukt), Ansatzzettel app/dashboard/rezeptur/[id]/ansatz, lib/rezepturVersion.ts.
- Bauliste: 159 von 206 (77 %), Artifact Version 117 „P322 live · nächster S4“. Noch 47 Pushes offen.

## Nächstes: S4 Shop mehrsprachig (24 Sprachen, 2 Pushes)
Bauliste-Zeile: Shop-Texte und Produkt-Dokumente in den 24 Sprachen, die ARGONAUT schon für das mehrsprachige Team kann (lib „Mehrsprachig“ aus Paket PM), Sprach-Umschalter im Shop; Übersetzung als Vorschlag, der Betrieb prüft und gibt frei. Chemie-Interessent braucht zuerst Englisch.
Vor dem Bauen Bestand lesen: PM Mehrsprachig (lib + Tabellen), Shop (public/shop.js, app/p/[id], web_seiten, artikel.im_shop, shop_preis/shop_kunde aus P316/P317), Produkt-Dokumente (P315, Sprache je Dokument schon vorhanden). KI-Übersetzung nur über kiFetch, nie Preise übersetzen/schätzen.
Danach: Stufe-2-Bausteine S2, S3b, S5, G2b, G2c (Schalter aus bis R49), dann PS-1, BV2b, BV3a/BV3b, C1, D1 zuletzt.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, dann `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js (module.exports = Proxy, liefert für jede http-URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}`) — in einem neuen Container neu anlegen.
  Build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- tsc: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` (dauert > 2 Min., Timeout hochsetzen).
- Test-PG: /usr/lib/postgresql/16/bin; useradd pgu; initdb -D /home/pgu/data -A trust, Start `-o '-p 5499 -k /tmp'`; Stubs: auth.uid() aus test.uid, mein_chef_id() aus test.chef, darf_ich_modul_* aus test.sehen/test.aendern, nachweis_name() über mitarbeiter.auth_user_id; Rollen anon/authenticated/service_role einmal je Cluster. Neue Tabellen brauchen im Test ein explizites grant (Supabase vergibt es selbst).
- Container-Zeitzone ist Europe/Berlin — Zeitzonen-Gegenproben mit `TZ=UTC` laufen lassen.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Nach neuem Test `node scripts/tests-bauen.cjs`. Guide-Einträge (lib/guideWissen) nur für Menü-Seiten.
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1), Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
- Bauliste: rows.py Zeile live setzen, gen.py-Kopf „_pNNN unterwegs“ committen; fürs Artifact eine Kopie mit Kopf „PNNN live“ erzeugen und mit url veröffentlichen.
