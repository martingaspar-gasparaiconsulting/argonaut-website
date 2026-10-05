# ARGONAUT OS – Startprompt STUFE3-1 (04.10.2026)

Hallo Claude, wir machen mit ARGONAUT OS weiter: **Stufe 3 nahtlos durchbauen**, die Tage bis zum Anwalt sinnvoll nutzen.

## Startritual
1. Beide Ordner anfordern (in EINEM Aufruf): `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-1001.md` (Ende = neuester Stand), `/areas/argonaut-kontrollgang.md` (aufgeräumt 04.10.), Preferences.
3. Bauliste: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/`). Erst `read`, dann mit `url` veröffentlichen. Nach jedem Live-Push Zeile auf „live".
4. Prüf-Klon im Container: git clone, npm ci, PGlite in eigenem Ordner, Build `npx next build --webpack` mit Font-Mock (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`) und Platzhalter-Umgebung (Supabase-URL/Keys). Push im Klon sperren, nie aus dem Klon pushen. Gerätedateien vor dem Schreiben stagen und gegen HEAD vergleichen.

## Stand
* Live bis Paket 201 (1a89418). Paket 203 (Zwei-Faktor-Ausnahmen) wurde gepusht — im Vercel-Dashboard bestätigen, dann 203 in der Bauliste auf „live" (38 von 65).
* Entscheidungsrunde Block 2 komplett: 198, 199, 200, 201, 203. Stufe 0–2 nur noch blockiert (188/189 Stimme, 35–40 Anwalt).

## Reihenfolge (Martin, 04.10.2026)
1. **Stufe 3 jetzt bauen, ohne Pause:** B4 Shop aus Inventar → kleines Sammelpaket (Übungswelt-Domains auf example.com, Newsletter-„Abmelden" in die Sperrliste) → B5 Branchenverzeichnis-Eintrag → B3 Website-Texte aus Firmenwissen → B1 Bausteine Presse/SEO-Texter/E-Book/Strategie/Social (3 Pushes) → B10 Fernhilfe Bildschirm teilen → B7 eigene Absender-Domain (Code fertig, scharf mit Resend Scale) → B9 Paket 2 Andocken (Geld: Befund + Lösung zeigen, dann sofort bauen) → B6 Mitbewerber-Funktionen (Recherche, Namen nie nach außen) → B11 nur der Dossier-Generator.
2. **Kurz vor dem Anwalt — externe Partner vorbereiten:** E1 finAPI, E2 echte Kassen-TSE, E3 DATEVconnect, E4 Shop-/Versand-Schnittstellen. Code so weit wie möglich (Sandbox/Platzhalter), dazu Schritt-für-Schritt-Anleitung, was Martin beantragen muss.
3. **Erst nach der Abnahme durch den Anwalt:** die Branchen-Dossiers (B11) wirklich erzeugen und rausgeben — nur Gebautes, jede Branche individuell korrekt.
4. Danach Testtag (ganz zum Schluss, mit Schrift-Querschnitt).

Kontrollgang-Punkte „für mich zum Nachbauen" beim Bauen mitnehmen; alles Neue sofort in die Sammelliste.

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Prüf-Kette esbuild + tsc + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite (+ Verhaltensproben); SQL additiv/idempotent komplett in den Chat; Aussperr-Risiken vorher nennen und getrennt liefern; „Sie" in Kundentexten; nie „KI-Agenten", sondern „Bausteine"; CMD, nie PowerShell; neue Tabellen mit p164s3-Regel; nach jedem Push Bauliste aktualisieren und Stand nennen; nur bei „Feierabend" stoppen.
