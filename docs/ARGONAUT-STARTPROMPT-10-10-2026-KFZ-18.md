# ARGONAUT · Startprompt KFZ-18 (10.10.2026, abends)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
NICHT pushen aus dem Klon (nach Martins Push: git fetch + stash + ff-merge, Inhalt vergleichen, stash weg).
Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100 (centRunden/rundeStellen aus lib/zahlen).

## Stand
- Live 10.10.: P304 N1b (f3604c7), P305 FM1 Fahrzeugmappe Kunden-Seite (66fc9a2, SQL 1|true|0|2|6|2|2).
- P306 FM2 „Händler antwortet": auf dem Gerät (_p306.bat), SQL supabase-sql/p306-fahrzeugmappe-antwort.sql
  (Kontrolle 6|1|4|2|true|3). Erst prüfen, ob P306 live ist (git log origin/main), sonst Martin fragen.
  Bauliste: 143 von 187 nach P306; Artifact erst nach Live neu veröffentlichen (Kopf „P306 live · nächster FM3" nur im Artifact).

## Fahrzeugmappe — was es gibt
- [Martin 10.10.] Verkäufer schickt EINEM Autohaus (nie mehreren, kein Marktplatz) Fahrzeugschein, 8 Pflichtfotos, Schäden,
  Kaltstart-Video, Unterlagen, Preisvorstellung, Videobotschaft. Kunden-Seite sehr modern (Handy + Desktop). Wie die Börse
  auch auf der Händler-Webseite. carVertical direkt beim Öffnen der Mappe.
- P305: ersetzt das alte Online-Ankaufformular (P264) unter gleichem Link /ankauf/<kennung> und Schalter
  (modul_einstellung „kfz-ankauf".online). Domain: proxy /fahrzeug-verkaufen -> /ankauf-domain/<host>; Menüpunkt
  „Fahrzeug verkaufen" (seiteHtml opts.verkaufenLink). Tabellen kfz_mappe (token_hash, entwurf/eingereicht, ankauf_id unique),
  kfz_mappe_datei (fach, art, status reserviert/fertig), Bucket „fahrzeugmappe" privat ohne Nutzer-Regeln, 50 MB.
  lib/fahrzeugMappe.ts (FAECHER, dateiPruefen, platzFrei, vollstaendigkeit, bildMesswerte/bildUrteil, knopfHtml),
  lib/fahrzeugMappeServer.ts, Türen oeffentlich/fahrzeugmappe(/start,/absenden), signierter Upload direkt (XHR + apikey),
  app/ankauf/FahrzeugMappe.tsx + VideoAufnahme.tsx (720p, 60 s) + Symbole.tsx + MappeSeite.tsx; Händler:
  /api/kfz/fahrzeugmappe (GET/POST/DELETE mit Login), MappeEinstellung.tsx, [id]/MappeKarte.tsx.
- P306: kfz_mappe + token_verschluesselt (lib/crypto) + nachreichen_bis; kfz_mappe_nachricht (Händler angebot/rueckfrage/
  einladung/absage, Verkäufer antwort/termin_ok/nachgereicht; Trigger zieht Ankauf-Status/Angebot nach, Rückfrage öffnet
  14 Tage Nachreichen); kfz_ankauf + historie_url/anbieter/am/befund. lib/fahrzeugMappeAntwort.ts, [id]/MappeAntwort.tsx
  (Historie-Karte, Antwort, Verlauf), Stand-Seite für den Verkäufer, Mails im Look des Händlers (kundenMailLayout) mit Knopf,
  Cron /api/cron/fahrzeugmappe-loeschen (25 3 * * *): Entwurf 30 T, Absage 90 T, ohne Ankauf sofort.

## Nächstes Paket: P307 FM3 „Auslesen und Übernahme" (1 Push)
1. Fahrzeugschein auslesen: Foto im Fach „schein" -> KI (über kiFetch, lib/ki.ts, Modell nach Aufgabe „intern") liest Marke,
   Modell, FIN (Feld E), Erstzulassung (Feld B), Leistung (P.2), Kraftstoff; Verkäufer bestätigt/korrigiert (nie automatisch
   übernehmen), Hinweis „automatisch erkannt — bitte prüfen". Datenschutz: Hinweis in mappeDatenschutz + Anwalt-Liste
   (KI-Anbieter). Kosten im KI-Protokoll, Deckel je Mappe.
2. Optional Motiv-Prüfung der Pflichtfotos (zeigt das Foto das richtige Motiv?) — nur Hinweis, nur wenn günstig.
3. „Ankaufen und in den Bestand übernehmen" (app/dashboard/kfz/ankauf/[id]/page.tsx, ankaufen()): Fotos der Mappe in
   kfz_bestand_medien kopieren (Bucket fahrzeug-medien, Schablone aus Fach: vorne_links usw.), Fahrzeugschein/Unterlagen nicht
   in die Börse. Bei Wunsch „inzahlungnahme" Hinweis/Verknüpfung zum Verkauf (kfz_verkauf Inzahlungnahme, K6).
4. Testtag-Punkte und Kontrollgang ergänzen (/areas/argonaut-kontrollgang.md, Testtag-Datei).
Danach P308 FM4 (siehe unten), dann Kfz-Thema fertig -> Martin fragt nach neuem Chat.

## Danach: P308 FM4 „Bewertungs-Empfehlung" ([Martin 10.10. 18:46] so gewünscht)
- Erste Schätzung sofort aus BELEGTEN Quellen: kfz_marktvergleich (P276, lib/kfzMarkt.ts marktLage), DAT/Schwacke-Werte
  (P283, bewertung_ek/vk am Bestand — für den Ankauf gleiche Felder am kfz_ankauf ergänzen), später mobile.de (K11b).
- Zu-/Abschläge legt das Autohaus selbst fest (wie „Richtwerte für Schäden"): Scheckheft, Vorbesitzer, Zustand, Nichtraucher,
  Schäden aus der Mappe, carVertical-Befund (P306 historie_befund) — eigene Prozent/Beträge je Merkmal.
- Ergebnis: Marktspanne, realistischer VK, max. EK über die vorhandene Bewertungsrechnung (lib/kfzAnkauf.bewertung:
  Aufbereitung, Standtage, Marge) — immer „Empfehlung", mit Rechenweg; zu wenig Vergleichsdaten ehrlich anzeigen.
- REGEL BLEIBT [Martin bestätigt 10.10.]: Die KI schätzt NIE einen Preis. KI darf nur die Begründung aus den Daten formulieren.
- Hinweis: docs/bauliste/rows.py (Zeile FM4), docs/bauliste/bauliste.html und diese Datei sind auf dem Gerät nach P306 geändert (nicht committet) —
  mit P307 committen; Gerät weicht dort bewusst von HEAD ab. Weitere Bauliste: SP1, D1, C1, BV2, PS-1, BV2b, BV3.

## Arbeitsumgebung (kein device_bash)
- Klon: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
- Font-Mock für next build: /home/claude/fontmock/mock.js = Proxy, der für jede URL
  `@font-face{font-family:'DM Sans';…src:url(https://fonts.gstatic.com/mock.woff2)…}` liefert;
  Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=… NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build --webpack`.
- Klicktest: Supabase-Attrappe (node http auf 54321, antwortet modul_einstellung/web_ci/profiles), Build mit dieser URL,
  `next start -p 3005`, Playwright (Chromium /opt/pw-browsers) mit page.route für /api/oeffentlich/fahrzeugmappe*.
  Server stoppen per PID (pkill -f "next start" beendet die eigene Shell).
- Test-PG: Postgres 16 als eigener Nutzer (initdb -D /home/pgu/data, -p 5499 -k /tmp), Stubs: Rollen anon/authenticated/service_role,
  auth.uid() aus test.uid, storage.buckets/objects, mein_chef_id (test.chef), darf_ich_modul_sehen/aendern (test.sehen/test.aendern),
  p181_besitzer, kfz_bestand; dann p263, p305, p306. Danach Grants auf authenticated.
- npm test: 1 bekannter Container-Fehler (Windows-1252). _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1),
  Abgleich git status -uall gegen die git-add-Liste.
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
