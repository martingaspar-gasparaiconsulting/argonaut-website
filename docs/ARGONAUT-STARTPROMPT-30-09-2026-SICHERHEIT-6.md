# ARGONAUT OS – Startprompt SICHERHEIT-6 (30.09.2026 nachts)

Hallo Claude, wir machen mit ARGONAUT OS weiter.

## Startritual
1. Beide Ordner anfordern: `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-0929.md` (Baulog, Ende = neuester Stand), `/areas/argonaut-kontrollgang.md`, `/areas/argonaut-testtag-3.md`, `/areas/argonaut-anwalt-checkliste-2.md`, Preferences.
3. Bauliste im Blick: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/rows.py`, `gen.py`, `kosten.py`; nach jedem Live-Push Zeile auf „live", `python3 gen.py`, mit url neu veröffentlichen, Dateien aufs Gerät, mit dem nächsten Paket committen).
4. Prüf-Klon in der Cloud (git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git, npm ci, PGlite für SQL). Nie aus dem Klon pushen. Build im Klon: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<fontmock.js> npx next build --webpack` (Google-Fonts-Mock nötig, sonst scheitert der Build offline).

## Stand (30.09. nachts)
- Live bis **Paket 185a** (99c3ad3). Heute live: 191, 190, 192, 193, 182, 181, 184, 185a – jeweils mit SQL, alle Kontrollen ok.
- **185b** (Schreiben nur mit Modul-Schreibrecht, 184 Tabellen, RESTRICTIVE): `_p185b.bat` liegt im Repo (nur SQL-Datei, Test, Bauliste V21). Vorab-Abfrage gelaufen: nur Sonja Jelcic betroffen → Martin hat ihr Schreibrecht für alle sichtbaren Module gegeben (fehlt_schreiben = 0). **Offen: `_p185b` + SQL p185b** (steht vollständig in `supabase-sql/p185b-schreibrecht-je-modul.sql`, Kontrolle: 184 Tabellen, permissive_neu 0; NOTFALL-Block auskommentiert am Ende). Danach Bauliste 185 → live.
- Bauliste V21: **21 von 57 Pushes (37 %)**, nach 185b 22 von 57.
- Heute beschlossen/gebaut: KI-Modelle zentral in `lib/kiModelle.ts` (schnell = Haiku 4.5, professionell = Sonnet 5.5, premium = Opus 5.5; neue KI-Stellen immer über `modellFuer('<aufgabe>')`). 188 Voice wartet auf Martins Stimme. Kein Mitarbeiter hat derzeit „Darf abrechnen" → Abo-Vorlagen nur der Chef.

## Offen bei Martin
- KI-Berater auf Kundenseiten: bleibt „schnell" (sonst 3.000 Gespräche teurer als 99 €) – oder Stufenpreise anheben?
- 22 Angebote im Status Entwurf: echte verschickte auf „gesendet" stellen (Kunden sehen sonst „noch nicht freigegeben").
- Voyage-Opt-out setzen, Supabase-Region bestätigen, Speicher 1 TB vs. 100 GB/Mitarbeiter, 7 vs. 14 Tage Test, Dossier-Seite 9 Begründungen.

## Reihenfolge ab jetzt
**Stufe 2 Rest:** 183 WhatsApp-Anmeldung mit Bestätigung → 186 Abläufe-Rest → 187 Sammelpaket (+ Personal-Cockpit 15 Anlege-Stellen auf Betrieb, weitere ~30 Seiten mit eigener Kennung, Übungswelt-Mails auf example.com, Test-Mailstrecke ab Freischaltung, Bucket-Grenzen nach Live-Abfrage) → 196 Elektro-Feinschliff → 197 Verschickte Rechnungen fest ablegen (GoBD) → 164·3 Zwei-Faktor in der DB (Aussperr-Risiko, getrennt) → 189 Voice Stufe 2 → 35–40 DSGVO-Werkzeuge nach Anwalt. 188 Voice wenn Martin bereit.
**Danach:** Entscheidungsrunde Block 2 → Kontrollgang → Testtag → Stufe 3.

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Geräte-Dateien vorher stagen und gegen git HEAD vergleichen; Prüf-Kette esbuild + tsc ganzes Projekt + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite; SQL additiv/idempotent komplett in den Chat; bei Rechte-/RLS-Änderungen zuerst Live-Stand per Leseabfrage holen (db/policies.sql ist vom 15.07., veraltet), Aussperr-Risiken vorher nennen und getrennt liefern, bevorzugt RESTRICTIVE-Schranken statt Regeln ersetzen; GEMEINSAM = zeigen + sofort bauen; „Sie" in Kundentexten; „Bausteine"; keine Mitbewerber-Namen; CMD, nie PowerShell. Alles Auffällige → `/areas/argonaut-kontrollgang.md`. Supabase-Warnung „creates a table without RLS" bei CTE = Fehlalarm → „Run without RLS"; Warnung „destructive operations" bei `drop policy if exists p…_` = harmlos.
