# ARGONAUT OS – Startprompt SICHERHEIT-11 (04.10.2026)

Hallo Claude, wir machen mit ARGONAUT OS weiter: Block 2 ist gebaut — jetzt Kontrollgang, dann Testtag.

## Startritual
1. Beide Ordner anfordern (in EINEM Aufruf): `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-1001.md` (Ende = neuester Stand), `/areas/argonaut-kontrollgang.md`, Preferences.
3. Bauliste: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/`). Nach jedem Live-Push Zeile auf „live", neu veröffentlichen.
4. Prüf-Klon im Container (git clone, npm ci, PGlite in eigenem Ordner, Build `--webpack` mit Font-Mock `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` + Platzhalter-Umgebung). Nie aus dem Klon pushen. Gerätedateien vor dem Schreiben stagen und gegen HEAD vergleichen.

## Stand
* Live bis Paket 201 (1a89418). Paket 203 (Zwei-Faktor-Ausnahmen je Mitarbeiter) liegt als `_p203.bat` auf dem Gerät — falls noch nicht gelaufen: zuerst SQL p203, dann `_p203`.
* Entscheidungsrunde Block 2 komplett gebaut: 198, 199 (D1/D3/D6/D7/C9), 200 (E7/E8), 201 (E4), 203 (B4). D2 und Paket 202 entfallen (Leseabfragen 0).
* Stufe 0–2 nur noch blockiert: 188/189 Voice (Stimme Martin), 35–40 DSGVO (Anwalt).

## Offen (in dieser Reihenfolge)
1. Kontrollgang (`/areas/argonaut-kontrollgang.md`) gemeinsam abarbeiten: Recht, Zahlen/Fakten, Standorte (Supabase-/Vercel-Region), Webseite/Dossier nur Gebautes.
2. Martins Aufgaben vor dem Testtag (Entscheidungsrunde Teil H): eigener zweiter Faktor + Notfall-Codes, Vercel-2FA, Resend Pro, Anthropic-Deckel, Supabase Pro + PITR, Rechte Testmitarbeiter (E2), Musterbetrieb XXL.
3. Testtag (Klicklisten testtag 1–3).
4. Danach Stufe 3 (B1 ff.).

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Prüf-Kette esbuild + tsc + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite (+ Verhaltensproben); SQL additiv/idempotent komplett in den Chat; Aussperr-Risiken vorher nennen und getrennt liefern; „Sie" in Kundentexten; CMD, nie PowerShell; Auffälliges → Kontrollgang; neue Tabellen mit p164s3-Regel.
