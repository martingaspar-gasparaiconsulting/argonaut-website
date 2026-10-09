# ARGONAUT · Startprompt KFZ-8 (09.10.2026 morgens)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen.
Baulog in der Memory: /areas/argonaut-bauliste-1007.md (fortschreiben).
NICHT pushen aus dem Klon (Martin pusht per _pNNN.bat). Offene Arbeit im Klon auf lokalen Zweig pNNN-sicherung legen, main = origin/main lassen.
Im Container nie `pkill -f "next start"` (trifft die eigene Shell) — Server mit setsid starten, per Port beenden.

## Stand (Kfz-Pilot, Stufe 3b)
- Live 08.10.: P278 K18a Partner-Netzwerk (1d37f01) · P279 K18b Gast-Link + Partner-Rechnung (17de0fa). SQL-Kontrollen stimmten.
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 75: 116 von 158 Pushes (73 %), 42 offen.
- Nächste freie Paketnummer: **P280**. Diese Datei ist untracked — mit P280 gezielt committen.

## Nächstes Paket: K14 Chef-Blick Kfz (1 Push, kein SQL laut Bauplan) — dann K15, K16, K17
Bauliste-Text: Kacheln mit Vorjahr, Ertrag je Marke und Preisklasse, Rangliste, Zulauf, Summen-Wächter; über Chef-Blick und Report-Baukasten.
Vorher am Code prüfen: bestehender Chef-Blick (PP), Report-Baukasten, lib/kfzKalkulation.ts (Ertrag je Fahrzeug), kfz_verkauf, kfz_bestand_kosten
(jetzt auch Partner-Rechnungen), Verkäufer-Rangliste = Leistungskontrolle (Anwalt R45, § 87 BetrVG) -> nur Chef, abschaltbar.

## Gebaut in KFZ-7 (Kurzüberblick)
- P278: betrieb_partner (Code XXXX-XXXX-XXXX), partner_auftrag (PA-0001), partner_eintrag (unveränderlich), Bucket partner-ablage ohne Regeln,
  Funktionen p278_*; lib/partnerNetzwerk.ts; Reiter „Partner" (KfzPartner.tsx), Seite /dashboard/kfz/partner, PartnerVerlauf.tsx;
  Routen /api/partner/foto, /api/partner/fahrzeugbild.
- P279: Gast-Auftrag (gast_name, nur SHA-256-Prüfwert, gast_bis, gast_gesperrt), partner_rechnung, Funktionen p279_* (gast_* nur service_role),
  p278_auftrag_pruefen/melden ersetzt; lib/partnerRechnung.ts; Routen /api/partner/rechnung, /rechnung-uebernehmen, /gast-link,
  offene Türen /api/oeffentlich/partner-gast (+ /bild); Seite /partner-gast/<link> (noindex, no-referrer); RechnungEinreichen.tsx.
  Übernahme -> eingangsbelege (Fremdleistung, Datei in dokumente/<Betrieb>/eingangsbelege/partner_<id>) + kfz_bestand_kosten, nie doppelt.

## Arbeitsumgebung (kein device_bash)
- Klon /home/claude/klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- SQL-Test: Postgres 16 (initdb -D /tmp/pgdata als postgres, -p 5499 -k /tmp/pg). Stubs: Rollen authenticated/anon/service_role (bypassrls),
  auth.uid() über `set test.uid`, mitarbeiter_stub(user_id, chef, sehen[], aendern[], abrechnen) mit mein_chef_id/darf_ich_modul_sehen/
  darf_ich_modul_aendern/darf_ich_abrechnen, profiles(id, firma_name), benachrichtigungen, storage.buckets/objects/foldername, standorte,
  werkstatt_auftraege, eingangsbelege; p181_besitzer per sed aus p181-besitzer-betrieb-3.sql; dann p259, p261, p262, p265, p277, p278, p279.
  Jedes SQL zweimal + RLS-Fälle.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Wächter: offene Türen + DROSSEL-Schlüssel = Türpfad, Route braucht wörtlich `status: 429`.
- _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1 wegen [id]/[token]).
