# ARGONAUT · Startprompt KFZ-2 (07.10.2026 mittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
**Achtung: Parallel arbeitet ein Logo-Chat (L1) am selben Repo und an der Bauliste** — vor jedem Schreiben pullen,
beim Bauliste-Artifact auf Konflikte achten (fremde Version lesen, Zeilen vergleichen, dann veröffentlichen).

## Stand (Kfz-Pilot, Stufe 3b)
- P258 Speicher-Wächter AGB-Formel live · P259 Branchen-Vorlage + K1a live · P260 K1b live · P261 K2 Handelsakte live.
- **P262 K3 Fotos und Medien** auf dem Gerät (_p262.bat + SQL p262-kfz-medien.sql: Speicherordner „fahrzeug-medien",
  Tabelle kfz_bestand_medien). Wenn noch nicht gepusht: SQL aus supabase-sql/p262-kfz-medien.sql, dann `_p262`.
- Bauliste-Artifact X2y63fejjA6Qi6pSyxZP8T Version 57: 99 von 137 Pushes (72 %), Kfz offen 22.
- Kfz-Muster (Artifact AF75PwqqPHHjPJ1ciK7HMV) von Martin freigegeben.
- Nächste freie Paketnummer: **P263**.

## Gebaut (Dateien)
- lib/branchenVorlage.ts (Vorlage je Modul + Feinschliff je Branche + Kunde), lib/kfzBestand.ts, lib/kfzBestandPdf.ts,
  lib/kfzAkte.ts, lib/kfzMedien.ts
- app/dashboard/kfz/bestand/page.tsx (Bestand), [id]/page.tsx (Handelsakte), KfzMedien.tsx (Fotos-Reiter)
- Tabellen: kfz_bestand (+12 Spalten P261), kfz_bestand_preis (nur Auslöser), modul_einstellung, kfz_bestand_medien

## Nächste Pakete (Reihenfolge Bauplan)
1. **K4 Ankauf und Bewertung** (G, 2 Pushes, 1 SQL): Ankaufsprotokoll, Schäden am Foto (Foto-Markierung aus
   app/dashboard/bautagebuch/FotoMarkierung.tsx wiederverwenden), Schadenskalkulation, Inzahlungnahme, Ankaufschein,
   Online-Ankaufformular. Rechtsfragen R45 (Ankaufschein/Zusicherungen).
2. K5 Kalkulation und Provision · K6 Verkaufsunterlagen · **Stornorechnung/Gutschrift als Beleg VOR K7** (Kern-Geld) ·
   K7 Rechnung § 25a (getrennt) · K9 … K17 · K18 Partner-Netzwerk nach K13 · BV2 Vorlagen für alle Bereiche.

## Offene Hinweise (Kontrollgang)
- Einkaufspreis für alle Mitarbeiter mit KFZ-Leserecht sichtbar (Spalte standardmäßig aus) → eigenes Recht „Einkaufspreise sehen"?
- admin/verbrauch zeigt weiter LIMIT_GB_DEFAULT; speicher_bytes_fuer misst nur den Ordner des Hochladenden.
- Anwalt R47 Partner-Brücke (AV-Vertrag zwischen Betrieben, Gast-Link).

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git /home/claude/klon`,
  `npm ci`. Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack`
- SQL-Test: lokales Postgres 16 (`/usr/lib/postgresql/16/bin/initdb`, als Nutzer postgres, Port 5499) mit Stubs für auth.uid(),
  mein_chef_id, darf_ich_modul_sehen/aendern, p181_besitzer, storage.buckets/objects/foldername — jedes SQL zweimal + RLS-Fälle.
- npm test: 1 bekannter Container-Fehler (Windows-1252). Rundungs-Wächter: nie `Math.round(x*100)/100`, immer centRunden.
- _pNNN.bat aus der vorigen ableiten (CRLF, GIT_LITERAL_PATHSPECS=1 wegen [id]), nach Lieferung Klon `git stash -u`.
