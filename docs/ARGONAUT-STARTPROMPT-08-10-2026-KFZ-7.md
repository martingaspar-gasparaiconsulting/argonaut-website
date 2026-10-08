# ARGONAUT · Startprompt KFZ-7 (08.10.2026 abends)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen.
Baulog in der Memory: /areas/argonaut-bauliste-1007.md (fortschreiben).
NICHT pushen aus dem Klon (Martin pusht per _pNNN.bat). Meldet ein Prüfschritt ungepushte Commits im Klon:
Arbeit auf einen lokalen Zweig pNNN-sicherung legen und main = origin/main lassen.

## Stand (Kfz-Pilot, Stufe 3b)
- Live heute: P272 K11a Börse (da62b88) · P273 Börse auf Händler-Domain (7f3b5b3) · P274 Partner-Andockstelle carVertical (dcb1bb1)
  · P275 K12a Preise und Standzeit (8d7bb22) · P276 K12b Marktvergleich (7bef3d7) · P277 K13 Brief-Tresor, Zulassung, Aufbereitung (e5fabb5).
  Alle SQL-Kontrollen stimmten.
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 73: 114 von 158 Pushes (72 %), 44 offen.
  Neu offen (Martin 08.10., Brainstorming): BV2b „Handel mit Einzelstücken" (7), PS-1 „Preis-Spiegel" (1), BV3 „Manufaktur und Feinkost" (6).
- Nächste freie Paketnummer: **P278**. Diese Datei ist untracked — mit P278 gezielt committen.

## Nächstes Paket: K18 Partner-Netzwerk (Partner-Brücke), 2 Pushes — dann K14, K15, K16, K17
Bauliste-Text: Betriebe verbinden sich gegenseitig (beide stimmen zu, jederzeit trennbar), Auftrag am Fahrzeug an Partner,
Partner sieht nur dieses Fahrzeug ohne Preise und Kunde, schreibt Einträge und Fotos (nicht änderbar), Rechnung landet im
Belegeingang und in der Kalkulation, Zugriff endet mit dem Auftrag; Gast-Link für Partner ohne ARGONAUT. Allgemeiner Kern, Kfz zuerst.
Freigabe je Eintrag, Server prüft jeden Zugriff, Gegenproben. Anwalt R47 (AV-Vertrag/gemeinsame Verantwortlichkeit, FIN+Halter,
Gast-Link-Hinweis = Werbung?, Einträge nicht änderbar, keine TÜV-Aussage).
Claude-Vorschlag (vorher am Code prüfen):
- Push 1 (SQL): betrieb_partner (anfrage/angenommen/getrennt, beide Seiten), partner_auftrag (bestand_id, partner_betrieb, status
  offen/angenommen/fertig/beendet, freigabe-Felder), partner_eintrag (nur einfügen, nie ändern; Text, Fotos-Pfade, erstellt_von).
  Zugriff des Partners NUR über security-definer-Funktionen bzw. Server-Route mit Prüfung „Auftrag offen + Partner verbunden" —
  keine RLS-Regel, die fremden Betrieben kfz_bestand öffnet. Fahrzeugdaten an den Partner nur Positivliste (Marke, Modell, FIN,
  km, Farbe, Fotos auf Freigabe) — nie EK/VK/Kunde/Notiz. Aussperr-Risiko: keins (nur neue Tabellen), trotzdem Gegenproben B sieht A nie.
- Push 2: Gast-Link (Token, Ablauf, Drossel, lib/offeneTueren + lib/drossel), Partner-Rechnung → Belegeingang + kfz_bestand_kosten.
- Wiederverwendbare Bausteine: lib/kfzBoerseLaden.ts (Positivliste/Service-Rolle-Muster), lib/kfzTresor.ts (Verlauf nur per Auslöser),
  lib/partnerAnbindung.ts (Partner-Muster), KfzMedien (Fotos, Bucket fahrzeug-medien).

## Gebaut in KFZ-6/7 (Kurzüberblick)
- P275 lib/kfzPreis.ts + /dashboard/kfz/preise (Preis-Treppe in modul_einstellung „kfz-preis", Untergrenze, Börsen-Aufrufe
  kfz_boerse_aufruf über RPC p275_aufruf_zaehlen nur service_role).
- P276 lib/kfzMarkt.ts + KfzMarkt.tsx in der Akte-Übersicht (kfz_marktvergleich, ab 3 passenden Vergleichen der letzten 30 Tage).
- P277 lib/kfzTresor.ts + Reiter „Brief und Schlüssel" (KfzTresor.tsx) + /dashboard/kfz/tresor; kfz_tresor, kfz_tresor_log (nur Auslöser),
  kfz_zulassung, werkstatt_auftraege.kfz_bestand_id; rechnung-aus-werkstatt antwortet 409 für interne Aufträge.
  Testtag-Notiz: Werkstatt-Board zeigt bei internen Aufträgen noch „Rechnung erstellen" (nur Hinweis, keine Rechnung).

## Arbeitsumgebung (kein device_bash)
- Klon /home/claude/klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- SQL-Test: Postgres 16 (/usr/lib/postgresql/16/bin; initdb -D /tmp/pgdata als postgres, Start mit -p 5499 -k /tmp/pg; nach
  Container-Neustart postmaster.pid löschen und neu starten). Stubs: Rollen authenticated/anon/service_role (bypassrls),
  auth.uid() über `set test.uid`, auth.role() über `set test.role`, Tabelle mitarbeiter_stub(user_id, chef, sehen[], aendern[], abrechnen)
  mit mein_chef_id/darf_ich_modul_sehen/darf_ich_modul_aendern/darf_ich_abrechnen, Tabelle standorte; p181_besitzer per sed aus
  supabase-sql/p181-besitzer-betrieb-3.sql; dann die gebrauchten Kfz-SQLs (p259, p261, p265, p266, p268, p271, p274–p277);
  Stub werkstatt_auftraege(id, owner_user_id, titel, status). Danach `grant all on all tables in schema public to authenticated, anon, service_role`.
  Jedes SQL zweimal + RLS-Fälle (Chef A, Chef B, MA lesen, MA schreiben, MA ohne Recht).
- npm test: 1 bekannter Container-Fehler (Windows-1252). Wächter: nie `Math.round(x*100)/100` (auch nicht `*100)/1000`), kein eigener
  Zahlen-Leser → leseZahl; öffentliche Routen in lib/offeneTueren.ts + lib/drossel.ts; neue rechnung-aus-* Route → Zähler in b1b2 + darfAbrechnen.
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1 wegen [id]); Gegenproben-Skript: Ersetzung eindeutig.
