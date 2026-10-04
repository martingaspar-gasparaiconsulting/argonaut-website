# ARGONAUT OS – Startprompt SICHERHEIT-9 (02.10.2026 abends)

Hallo Claude, wir machen mit ARGONAUT OS weiter.

## Startritual
1. Beide Ordner anfordern: `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-1001.md` (Baulog, Ende = neuester Stand), `/areas/argonaut-kontrollgang.md`, `/areas/argonaut-testtag-3.md`, `/areas/argonaut-anwalt-checkliste-2.md`, Preferences.
3. Bauliste: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/rows.py`, `gen.py`, `kosten.py`). V31 liegt auf dem Gerät (geändert, noch nicht committet) → mit dem nächsten Paket committen. Nach jedem Live-Push: Zeile auf „live", `python3 gen.py`, mit url neu veröffentlichen (vorher action read), Dateien aufs Gerät; im Chat Stufen ✅/▶/⬜, Fortschrittsbalken, X von 60, Rest bis Testtag.
4. Prüf-Klon in der Cloud (git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git, npm ci, PGlite für SQL). Nie aus dem Klon pushen. ACHTUNG (Lehre 197): Klon nur per `git fetch` + `git merge --ff-only` aktualisieren; nie `git stash` + `pull` in einer Kette (Stash blieb liegen, veraltete Bauliste wurde committet). Build: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<fontmock.js> npx next build --webpack`. Next.js 16.3.8. Im Container schlägt 1 Test (importFortschritt, Windows-1252) wegen kleinem ICU fehl — auf dem Gerät grün.
5. Anfangs-CMD für jeden Push: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && _pNNN`

## Stand (02.10. abends)
- Live bis **164·3** (a3fc9c5). Heute live: 196 Elektro-Feinschliff (b09d4f8, SQL Messwert-Spalten), 197 Rechnungen fest ablegen (7aefb0b, SQL 1/1/1/3/1/0), 164·3 Zwei-Faktor in der Datenbank (a3fc9c5, SQL 448/0/1/1).
- Bauliste V31: **33 von 60 Pushes (55 %)**. Bis Testtag nur noch Blockiertes: 188 Voice Stufe 1 (wartet auf Martin: Stimme bei ElevenLabs klonen, Schlüssel in Vercel), 189 Voice Stufe 2 (wartet auf 188), 35–40 DSGVO (wartet auf Anwalt).

## Reihenfolge ab jetzt
**Entscheidungsrunde Block 2** (offene BESPRECHUNG-Punkte aus testtag-3 + Kontrollgang) → **Kontrollgang** → **Testtag** → Stufe 3 (B1 Bausteine Presse/SEO/E-Book/Strategie/Social, B3, B4, B5, B6, B7, B9, B10, B11 …). 188/189 sobald die Stimme da ist.

## Offen bei Martin
- Eigenen zweiten Faktor einrichten (0 von 27 Zugängen haben einen) + Notfall-Codes ablegen.
- Beschaffungsliste (Artifact „ARGONAUT Beschaffung"): Resend Pro, Anthropic Guthaben/Deckel, Supabase Pro+PITR, ElevenLabs, finAPI, DATEV, TSE (fiskaly), Entwickler-Apps, Stripe.
- Alte, schon verschickte Rechnungen festschreiben? Grenzwerte/Preise Elektro mit Meister gegenlesen.

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Geräte-Dateien vorher stagen und gegen git HEAD vergleichen; Prüf-Kette esbuild + tsc + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite (+ Verhaltensproben bei Rechten); SQL additiv/idempotent komplett in den Chat (Kontroll-Erwartung genau nennen); bei Rechte-/RLS-Änderungen zuerst Live-Stand per Leseabfrage; Aussperr-Risiken vorher nennen und getrennt liefern; GEMEINSAM = zeigen + sofort bauen; „Sie" in Kundentexten; „Bausteine"; keine Mitbewerber-Namen; CMD, nie PowerShell. Alles Auffällige → `/areas/argonaut-kontrollgang.md`. Neue SQL-Tabellen: danach p164s3-SQL erneut ausführen (Zwei-Faktor-Regel).
