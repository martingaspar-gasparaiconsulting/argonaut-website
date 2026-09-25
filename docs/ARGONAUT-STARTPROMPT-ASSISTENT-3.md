# ARGONAUT OS · Startprompt — Persönlicher Assistent, Teil 3 (ab A2e)

Hallo Claude, ich bin Martin. Neuer Chat, gleiches Thema.
Bitte zuerst: beide Ordner anfordern (Skill argonaut-chatstart), dann lesen:
dieses Dokument, das Gedächtnis `/areas/argonaut-bauliste-0925.md` (unterer Teil ab „neuer Chat Assistent + Bugs"),
`/areas/argonaut-assistent.md` und `/areas/argonaut-testtag-2.md`.

## 1. Stand (25.09.2026 abends)
- A1 Personalakte, A2a–A2c Wissensbasis (98 Seiten): LIVE.
- _p104 Zahlen-Querschnitt: LIVE (5cfdef5). Ein Zahlen-Leser (lib/zahlen.ts: leseZahl, zahlAusFeld, zahlFeld, zahlText) + Wächter-Test tests/zahlenWaechter.test.mjs.
- A2d Verwaltung (jetzt 113 Seiten): liegt als **_p105.bat** im Repo — prüfen, ob gelaufen (git log).
- Nächste freie Bat: **_p106**.

## 2. So wird die Wissensbasis gebaut
- lib/guideWissen.ts, je Menü-Seite: zweck, wer, werText, schritte (≥3), probe, landetIn, vorher.
- Seiten am echten Code prüfen — bewährt: 2–4 Prüf-Helfer parallel mit Auftragsdatei (je 8 Seiten), Einträge danach selbst gegenlesen, nichts erfinden.
- Alte MODUL_TEXTE in lib/kiGuideModule.ts für geprüfte Seiten entfernen (außer personal, personal/dokumente, mein-bereich — daran hängt personalakteA1.test).
- Je Paket eigener Test tests/guideWissenA2x.test.mjs + Gegenproben. Tests bauen: scripts/tests-bauen.cjs.
- Prüf-Umgebung: komplette Kopie + npm install (echte Pakete), `npm test` und `npx tsc --noEmit -p .` — im Container fehlen nur app/globals.css und components/ (3 Schrift-Tests + 25 TS2307 sind dort normal).

## 3. Offen (Reihenfolge von Martin freigegeben)
1. Assistent: A2e Betrieb/Branchen (75 Seiten, 2–3 Bats) → A3 Guide-Anzeige nach Rolle/Rang/Datenstand → A4 Lehrplan Matrose–Kapitän → A5 DashboardChat.tsx (alte Preise, „24 KI-Agenten") ersetzen.
2. Danach GEMEINSAM: Geld- und Ablauf-Befunde (siehe Baulog 0925: SEPA doppelt, Stornieren ohne Rückfrage, E-Rechnung ohne Beleg, Mitglieder-Kündigung/SEPA, EÜR storniert, DSGVO-Frist, Reisekosten-Mahlzeiten) + A2d-Befunde (SCHWER: Filial-Module blenden alles aus; Website-Bauer nimmt Seiten offline).
3. Am Tagesende: Brainstorming — u. a. Martins Idee „mit einem Klick in alle Branchenverzeichnisse".
4. Testtag So 27.09.

## 4. Entscheidungen
- Aufmaß bleibt: „1.234" = 1,234 mit Hinweis.
- Martin nimmt Claudes Empfehlungen an; Build/SQL/Push macht er selbst.

## 5. Regeln (unverändert)
Deutsch, CMD, additiv, idempotentes SQL komplett in den Chat, eigene _pNN.bat (nie überschreiben, erst nach Ende der vorigen Bat Dateien anfassen), gezielter git add, Prüf-Kette (Tests, tsc mit echten Paketen, Gegenproben), Kundentexte mit „Sie", „Bausteine" statt „KI-Agenten". Der Assistent SAGT nur — er trägt nie selbst etwas ein.
