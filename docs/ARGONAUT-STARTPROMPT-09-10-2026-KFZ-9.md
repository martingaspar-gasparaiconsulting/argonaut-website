# ARGONAUT · Startprompt KFZ-9 (09.10.2026 vormittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen.
Baulog in der Memory: /areas/argonaut-bauliste-1007.md (fortschreiben).
NICHT pushen aus dem Klon (Martin pusht per _pNNN.bat). Offene Arbeit im Klon auf lokalen Zweig pNNN-sicherung legen, main = origin/main lassen.
Im Container nie `pkill -f "next start"` — Server mit setsid starten, per Port beenden.
Wächter beachten: kein eigener Zahlen-Leser (immer leseZahl aus lib/zahlen), kein lokales Math.round(x * 100) / 100 (centRunden/rundeStellen).

## Stand (Kfz-Pilot, Stufe 3b)
- Live 09.10.: P280 K14 Chef-Blick Fahrzeughandel (0139098) · P281 K15a Kaufstatus im Kundenportal (79e89d3).
- P282 K15b Finanzierungs-Beispiel + Konfigurator: mit _p282.bat unterwegs (diese Datei wird darin mitcommittet).
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T: 119 von 159 Pushes (75 %), 40 offen.
- Nächste freie Paketnummer: **P283**.

## Nächstes Paket: K16 Umzug und Schnittstellen (1 Push laut Bauplan) — dann K17
Bauliste-Text: Kfz-Altsysteme im Import, FIN-Abfrage DAT/Schwacke über das Konto des Händlers, DATEV-Fahrzeugkonten.
Vorher am Code prüfen: lib/altsysteme.ts (81 Programme), lib/importKatalog.ts / importMotor (Feldkatalog per RPC import_feldkatalog —
kfz_bestand ist evtl. noch nicht drin -> dann SQL nötig), lib/konnektoren.ts (Bereich fahrzeughistorie aus P274 als Muster für
DAT/Schwacke: Konto des Händlers, ARGONAUT vermittelt nur), lib/datevExtf.ts (Fahrzeugkonten/Kostenstellen).
K17 Kfz-Schaufenster: Musterbetrieb XXL um Handelsbestand erweitern (P179), Kfz-Fachdossier.

## Gebaut heute (Kurzüberblick)
- P280: lib/kfzChefBlick.ts, Seite /dashboard/kfz/chef (nur Chef, NAV nurChef), Karte im Chef-Blick, Report-Quelle „Fahrzeughandel".
  Rangliste Standard AUS (modul_einstellung kfz-chef {rangliste}), Summen-Wächter in ganzen Cent.
- P281: lib/kfzKaufstatus.ts, KfzKaufstatus.tsx (Reiter Verkauf: Käufer -> Kontakt nur über eindeutige E-Mail, Portal-Link),
  Portal-Route liefert kaeufe (hart owner + kontakt_id), app/portal/[token]/PortalKauf.tsx. Befund: kontakt_id war vorher nie gesetzt.
- P282: lib/kfzFinanzierung.ts (finanzEinstellung, boerseBereit, beispiel mit Schlussrate, effektivZins PAngV-Methode,
  pflichtZeilen, extrasLesen/extrasWahl/nachrichtMitExtras), KfzBoerseExtras.tsx in der Börsen-Leiste,
  Einstellung in modul_einstellung „kfz-boerse" unter finanzierung/extras; betriebZuKennung/-Domain liefern roh;
  Börse-Detail zeigt Beispiel nur wenn bereit; Anfrage-Formular mit Ankreuzliste, Route rechnet Preise aus dem Katalog.

## Arbeitsumgebung (kein device_bash)
- Klon /home/claude/klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- SQL-Test (falls K16 SQL braucht): Postgres 16 (initdb -D /tmp/pgdata als postgres, -p 5499 -k /tmp/pg), Stubs wie in KFZ-8 beschrieben.
- npm test: 1 bekannter Container-Fehler (Windows-1252). _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1).
