# ARGONAUT OS – Startprompt SICHERHEIT-8 (02.10.2026)

Hallo Claude, wir machen mit ARGONAUT OS weiter.

## Startritual
1. Beide Ordner anfordern: `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-1001.md` (Baulog, Ende = neuester Stand), `/areas/argonaut-kontrollgang.md`, `/areas/argonaut-testtag-3.md`, `/areas/argonaut-anwalt-checkliste-2.md`, Preferences.
3. Bauliste: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/rows.py`, `gen.py`, `kosten.py`). V28 liegt auf dem Gerät (untracked/geändert) → mit dem nächsten Paket committen. Nach jedem Live-Push: Zeile auf „live", `python3 gen.py`, mit url neu veröffentlichen (vorher action read), Dateien aufs Gerät; im Chat Stufen ✅/▶/⬜, Fortschrittsbalken, X von 60, Rest bis Testtag zeigen.
4. Prüf-Klon in der Cloud (git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git, npm ci, PGlite für SQL). Nie aus dem Klon pushen (Stop-Hook-Meldung ignorieren, kurz erklären). Build: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<fontmock.js> npx next build --webpack` (fontmock.js = Proxy-Modul, das für jede URL ein @font-face-CSS liefert). Seit 187b: Next.js 16.3.8.
5. Anfangs-CMD für jeden Push: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && _pNNN`

## Stand (02.10. früh)
- Live bis **187d Teil 2** (67bc491). Seit SICHERHEIT-7 live: 187a (dda6109, SQL ok), 187b (f6b8a2e: Crons ohne ?secret=, CSP Report-Only + /api/oeffentlich/csp-bericht, Next 16.3.8, nodemailer 10), 187c (2cdec36, SQL Speicher-Grenzen 0/0/16), 187d Teil 1 (63a4096, SQL 13/45/13/2/0), 187d Teil 2 (67bc491, SQL 3/2/0/0/true).
- Bauliste V28: **30 von 60 Pushes (50 %)**, 7 bis zum Testtag.

## Reihenfolge ab jetzt
**Stufe 2 Rest:** 196 Elektro-Feinschliff (Messwert-Felder mit Grenzwerten in Prüfprotokollen, Vorlage VDE 0100-600, Elektro-Startkatalog, Kalkulator-Beispiele Zählerschrank/Wallbox/UV, Rechte-Vorlage Monteur) → 197 Verschickte Rechnungen fest ablegen (GoBD, PDF + Prüfsumme, GEMEINSAM) → 164·3 Zwei-Faktor in der DB (Aussperr-Risiko, getrennt, mit Rückweg) → 189 Voice Stufe 2 → 35–40 DSGVO nach Anwalt. 188 Voice wenn Martin bereit.
**Danach:** Entscheidungsrunde Block 2 → Kontrollgang → Testtag → Stufe 3.
Offene Kleinigkeiten aus 187 (im Kontrollgang): crm/import import_laeufe-Protokoll, eigene Felder (speichereWerte) mit eigener Kennung, Werkstatt-Bühne braucht Recht „buchungen".

## Offen bei Martin
- Beschaffungsliste (02.10. im Chat): Resend Pro, Anthropic Guthaben + Ausgabendeckel je Stufe prüfen/erhöhen, Supabase Pro+PITR, ElevenLabs Creator/Pro, finAPI Access B2X (Angebot), DATEV-Marktplatz anfragen, TSE nur für ARGONAUT-Kasse (fiskaly als Kassenhersteller), Entwickler-Apps, Stripe live.
- KI-Berater auf Kundenseiten „schnell" lassen oder Stufenpreise anheben; 22 Angebote im Entwurf prüfen; Voyage-Opt-out; Supabase-Region; Speicher 1 TB vs. 100 GB/Mitarbeiter; 7 vs. 14 Tage Test; Dossier-Seite 9.

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Geräte-Dateien vorher stagen und gegen git HEAD vergleichen; Prüf-Kette esbuild + tsc ganzes Projekt + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite (+ Verhaltensproben bei Rechten); SQL additiv/idempotent komplett in den Chat (Kontroll-Erwartung genau nennen); bei Rechte-/RLS-Änderungen zuerst Live-Stand per Leseabfrage (CSV), Aussperr-Risiken vorher nennen und getrennt liefern; GEMEINSAM = zeigen + sofort bauen; „Sie" in Kundentexten; „Bausteine"; keine Mitbewerber-Namen; CMD, nie PowerShell. Alles Auffällige → `/areas/argonaut-kontrollgang.md`.
