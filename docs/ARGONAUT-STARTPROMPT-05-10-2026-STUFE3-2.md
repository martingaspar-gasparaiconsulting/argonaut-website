# ARGONAUT OS – Startprompt STUFE3-2 (05.10.2026)

Hallo Claude, wir machen mit ARGONAUT OS weiter: **Stufe 3 nahtlos fertig bauen**, danach die externen Partner vorbereiten.

## Startritual
1. Beide Ordner anfordern (in EINEM Aufruf): `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-1001.md` (Ende = neuester Stand), `/areas/argonaut-kontrollgang.md`, `/areas/argonaut-bank-anbindung.md` (für E1), Preferences.
3. Bauliste: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/`). Erst `read`, dann mit `url` veröffentlichen. Nach jedem Live-Push Zeile auf „live".
4. Prüf-Klon im Container: git clone, npm ci, PGlite in eigenem Ordner, Build `npx next build --webpack` mit Font-Mock (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` → JS-Datei mit Proxy, die für jede URL ein @font-face liefert) und Platzhalter-Umgebung (Supabase-URL/Keys). Push im Klon sperren, nie aus dem Klon pushen. **Im Klon keine eigenen Commits** (Stop-Hook meckert) — Arbeitsstand nach jeder Lieferung per `git stash -u` beiseitelegen, nach Martins Push `git fetch` + `reset --hard origin/main`. Gerätedateien vor dem Schreiben stagen und gegen HEAD vergleichen. Build bricht im Container gelegentlich mit SIGKILL ab → einfach wiederholen.

## Stand
* Live bis Paket 208 (357471d). Heute live: 204 Shop aus Inventar, 205 S1 Sammelpaket, 206 B5 Branchenverzeichnisse, 207 B3 Website-Texte aus Firmenwissen, 208 B1 Social-Prüfpflicht (B1 nur 1 Push — Text-Werkstatt gab es schon).
* **Paket 209 B10 Fernhilfe** liegt auf dem Gerät (`_p209.bat`, SQL p209 im Chat). Wenn Martin „live" meldet: Bauliste B10 auf live.
* Bauliste: 43 von 63 Pushes (68 %) vor 209.

## Reihenfolge (Martin, 04.10.2026)
1. **Stufe 3 Rest:** B7 eigene Absender-Domain (Code fertig, scharf mit Resend Scale) → B9 Paket 2 Andocken (Geld: Befund + Lösung zeigen, dann sofort bauen) → B6 Mitbewerber-Funktionen (Recherche, Namen nie nach außen) → B11a nur der Dossier-Generator.
2. **Kurz vor dem Anwalt — externe Partner vorbereiten:** E1 Bank-Abruf (Martin wägt finAPI gegen BANKSapi ab), E2 echte Kassen-TSE, E3 DATEVconnect, E4 Shop-/Versand-Schnittstellen. Code so weit wie möglich (Sandbox/Platzhalter) + Schritt-für-Schritt-Anleitung, was Martin beantragen muss.
3. **Erst nach der Abnahme durch den Anwalt:** Branchen-Dossiers (B11b) wirklich erzeugen — nur Gebautes, jede Branche individuell korrekt. Kosten-Schätzung KI: ca. 50–210 € für alle 698 (Batch halbiert), Hauptaufwand ist die Prüfzeit.
4. Danach Testtag (ganz zum Schluss, mit Schrift-Querschnitt).

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Prüf-Kette esbuild + tsc + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite (+ Verhaltensproben); SQL additiv/idempotent komplett in den Chat; Aussperr-Risiken vorher nennen und getrennt liefern; „Sie" in Kundentexten; nie „KI-Agenten", sondern „Bausteine"; CMD, nie PowerShell; neue Tabellen mit p164s3-Regel; nach jedem Push Bauliste aktualisieren und Stand nennen; Martin ein Anfangs-CMD mitgeben (`cd /d "…\argonaut-website"`, dann `_pNNN`); nur bei „Feierabend" stoppen.
