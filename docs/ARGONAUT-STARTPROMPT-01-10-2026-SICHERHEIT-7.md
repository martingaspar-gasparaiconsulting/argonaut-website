# ARGONAUT OS – Startprompt SICHERHEIT-7 (01.10.2026)

Hallo Claude, wir machen mit ARGONAUT OS weiter.

## Startritual
1. Beide Ordner anfordern: `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-0929.md` (Baulog, Ende = neuester Stand; Datei fast voll -> neue Fortsetzung argonaut-bauliste-1001 anlegen), `/areas/argonaut-kontrollgang.md`, `/areas/argonaut-testtag-3.md`, `/areas/argonaut-anwalt-checkliste-2.md`, Preferences.
3. Bauliste im Blick: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/rows.py`, `gen.py`, `kosten.py`; nach jedem Live-Push Zeile auf „live", `python3 gen.py`, mit url neu veröffentlichen, Dateien aufs Gerät, mit dem nächsten Paket committen). NEU: nach jedem Push die Bauliste auch im Chat zeigen (Stufen mit ✅/▶/⬜, Fortschrittsbalken, X von 57, Rest bis Testtag).
4. Prüf-Klon in der Cloud (git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git, npm ci, PGlite für SQL). Nie aus dem Klon pushen (Stop-Hook-Meldung „uncommitted changes" ignorieren und kurz erklären). Build: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<fontmock.js> npx next build --webpack` (fontmock.js = Proxy-Modul, das für jede URL ein @font-face-CSS liefert).
5. Anfangs-CMD für jeden Push mitliefern: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && _pNNN`

## Stand (01.10.)
- Live bis **Paket 186** (7a2e07b). Seit SICHERHEIT-6 live: 185b (4bcdc92), 183 WhatsApp-Bestätigung (d6902f0, SQL ok), 186 Abläufe-Rest (7a2e07b, SQL ok 4/1/0).
- Bauliste V24: **25 von 57 Pushes (44 %)**, offen 32, davon 9 bis zum Testtag.
- ARGONAUT nutzt kein n8n; der Ablauf-Schritt „Webhook senden" ist ein optionaler Kunden-Schritt nach außen (Martin: Neuversuch drinlassen).

## Reihenfolge ab jetzt
**Stufe 2 Rest:** 187 Sammelpaket (2 Pushes): Prüf-Fälligkeiten (Tag-Versatz, 31.01.+1 Monat), MRR-Kachel alte Preise, Rechnungs-Knöpfe beim Mitarbeiter, Artikel-Import überschreibt Filialbestände, Vereine Vertragsart „Studio", alte Crons Geheimnis per URL, CSP im Beobachtungsmodus, npm-Warnungen; dazu aus dem Kontrollgang: Personal-Cockpit 15 Anlege-Stellen auf Betrieb, ~30 Seiten mit eigener Kennung, Übungswelt-Mails auf example.com, Test-Mailstrecke ab Freischaltung, Bucket-Grenzen nach Live-Abfrage, whatsapp-kontakte ohne Modul-Schreibrecht-Prüfung → 196 Elektro-Feinschliff → 197 Verschickte Rechnungen fest ablegen (GoBD) → 164·3 Zwei-Faktor in der DB (Aussperr-Risiko, getrennt) → 189 Voice Stufe 2 → 35–40 DSGVO nach Anwalt. 188 Voice wenn Martin bereit.
**Danach:** Entscheidungsrunde Block 2 → Kontrollgang → Testtag → Stufe 3.

## Offen bei Martin
- KI-Berater auf Kundenseiten „schnell" lassen oder Stufenpreise anheben; 22 Angebote im Entwurf prüfen; Voyage-Opt-out; Supabase-Region; Speicher 1 TB vs. 100 GB/Mitarbeiter; 7 vs. 14 Tage Test; Dossier-Seite 9.

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Geräte-Dateien vorher stagen und gegen git HEAD vergleichen; Prüf-Kette esbuild + tsc ganzes Projekt + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite; SQL additiv/idempotent komplett in den Chat (Kontroll-Erwartung genau nennen); bei Rechte-/RLS-Änderungen zuerst Live-Stand per Leseabfrage, Aussperr-Risiken vorher nennen und getrennt liefern, RESTRICTIVE-Schranken statt Regeln ersetzen; GEMEINSAM = zeigen + sofort bauen; „Sie" in Kundentexten; „Bausteine"; keine Mitbewerber-Namen; CMD, nie PowerShell. Alles Auffällige → `/areas/argonaut-kontrollgang.md`.
