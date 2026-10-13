# ARGONAUT Startprompt SP-17 (13.10.2026, ca. 10:20)

Vorgaenger: SP-16. Baulog: Memory /areas/argonaut-bauliste-1012.md · Kontrollgang /areas/argonaut-kontrollgang-2.md · Testtag /areas/argonaut-testtag-4.md · Anwalt naechste freie Nummer R55.

## Stand
- P345–P348 live (letzter bestaetigter Commit 8bf60c1). P349 (A1 Teil 3: Praxis-Einwilligungen, Website-AGB, ENTWURF-Hinweis KI-Dokumente) wurde gerade per `_p349` gepusht — Vercel-Status bei Martin erfragen bzw. Screenshot abwarten. Kein SQL.
- Bauliste: 186/263 (71 %), 77 offen, Artifact https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Version 146, Kopf „_p349 unterwegs"). Nach P349-live: Kopf auf „P349 live" setzen.
- A0 und A1 komplett. Naechster: **A2 Datei-Sicherung des Speichers** (1 Push, gemeinsam), dann A3, A4a–i, A5, A6; C1, D1 zuletzt; EK1 nach dem Anwalt.
- Diese Datei ist untracked: mit P350 committen.

## A2 — Plan (noch nichts gebaut)
Ziel laut Bauliste: regelmaessige Kopie des Speichers an einen zweiten Ort, Wiederherstellung einmal echt geprobt, in den TOMs beschrieben.
- Ziel: S3-kompatibler Speicher in Deutschland (Empfehlung Hetzner Object Storage; Martin legt Konto + Bucket + Schluessel an, AV-Vertrag, Versionierung einschalten falls moeglich). Env: SPEICHER_SICHERUNG_ENDPOINT, _REGION, _BUCKET, _KEY_ID, _SECRET, _SCHLUESSEL (64 Hex, AES-256-GCM; Martin bewahrt ihn offline auf — ohne Schluessel ist die Sicherung wertlos). Ohne Env: „nicht eingerichtet", nichts passiert.
- Kein neues npm-Paket: SigV4 (PUT, GET, ListObjectsV2) selbst mit node:crypto, Test mit AWS-Testvektoren.
- SQL p350: speicher_sicherung_datei (bucket, name PK, groesse, quelle_etag, quelle_geaendert, sha256, gesichert_am, fehlt_seit, fehler, versuche), speicher_sicherung_lauf (art sicherung/abgleich/probe, Zahlen, ok, meldung), speicher_sicherung_stand (Cursor + Sperre laeuft_bis); Funktionen security definer nur service_role: speicher_objekte_seit (Keyset updated_at,bucket,name aus storage.objects), Abgleich (fehlt_seit setzen/zuruecknehmen, > 30 Tage geloescht -> im Ziel loeschen), Sperre holen. Bucket „sicherung-probe" privat. Keine Rechte fuer anon/authenticated.
- Cron /api/cron/speicher-sicherung stuendlich (:40), maxDuration 300, Zeitbudget 240 s, gepuffert (Grenze 250 MB, groesste Bucket-Grenze 200 MB), Format AGS1+IV(12)+Chiffrat+Tag(16), Klartext-SHA-256 im Manifest, Fehlversuche bis 5 erneut. Fehler oder letzter Erfolg > 26 h -> Glocke an ANALYSE_BETREIBER_ID (benachrichtigung_erstellen, Dedup 24 h).
- Admin /api/admin/speicher-sicherung (Betreiber + Zwei-Faktor aal2 wie Freigabe-Zentrale): Stand, „Probe-Wiederherstellung" (10 Dateien entschluesseln + Hash, 3 davon echt nach sicherung-probe hochladen, wieder laden, vergleichen, loeschen; Ergebnis im Lauf-Protokoll), Notfall-Wiederherstellung aus Ziel-Liste (upsert false, ueberschreibt nie), Seite im Command Center + Kachel.
- TOMs-Text (Abschnitt Verfuegbarkeit) in docs, Anwalt-Unterlagen.
- Nebenbei: lib/sicherungTabellen.ts um fehlende Tabellen ab P339 (Reife, Vorbestellung, Box: box_vorlage, box_fach, box_option, box_kapazitaet, box_bestellung u. a.) ergaenzen — per Skript alle create table mit owner_user_id gegen die Liste pruefen.
- Aussperr-Risiko: keins (nur neue Tabellen, nur Service-Rolle).

## Arbeitsweise (unveraendert)
Deutsch, CMD nie PowerShell, „Sie" in Kundentexten, „Bausteine" nie „KI-Agenten". FREIE HAND: sofort bauen, Martin macht SQL und Push. Pruef-Kette: Tests + Gegenproben rot, tsc + Typfehler-Gegenprobe, next build (nie parallel). Je Paket `_pNNN.bat` (CRLF, ASCII, GIT_LITERAL_PATHSPECS=1, nie ueberschreiben). Geraet vorher gegen HEAD pruefen, nachher Stage + cmp. SQL komplett im Chat in Teilen <=40–50 Zeilen + `chcp 65001 >nul && type "supabase-sql\pNNN-….sql" | clip`. Nach jedem Push Bauliste-Artifact (erst lesen, dann veroeffentlichen) + Restzahl. Kontrollgang-Funde ins Memory. Keine Klicktests zwischendurch. Startbefehl: `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website"` dann `_pNNN`. Weiterbauen bis „Feierabend".
