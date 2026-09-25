# ARGONAUT OS · Startprompt — Persönlicher Assistent, Teil 2 (ab A2c)

Hallo Claude, ich bin Martin. Neuer Chat, gleiches Thema.
Bitte zuerst: beide Ordner anfordern (Skill argonaut-chatstart), dann lesen:
dieses Dokument, das Gedächtnis `/areas/argonaut-bauliste-0925.md` (unterer Teil ab „neuer Chat Assistent + Bugs"),
`/areas/argonaut-assistent.md` und `/areas/argonaut-testtag-2.md`.

## 1. Stand (25.09.2026 abends)
- A1 Personalakte + Meine Unterlagen: LIVE (_p100, 4d6b620). SQL Teil 1 gelaufen; Teil 2 (schränkt Mitarbeiter ein) führt Martin nach Grün aus — Rückweg-SQL steht im Chat-Verlauf und in supabase-sql/a1-personalakte.sql (Kommentar).
- A2a Wissensbasis 31 Seiten: LIVE (_p101, e931ab1).
- A2b Wissensbasis Vertrieb + Lager (jetzt 66 Seiten): liegt als **_p102.bat** im Repo — prüfen, ob gelaufen (git log / Vercel).
- Nächste freie Bat: **_p103**.

## 2. Wie die Wissensbasis gebaut wird (lib/guideWissen.ts)
- Je Menü-Seite ein Eintrag: zweck, wer ('chef'|'mitarbeiter'|'beide'|'lesen'), werText, schritte (≥3), probe {anlegen, loeschen}, landetIn [{text, href}], vorher.
- JEDE Seite vorher am echten Code prüfen (Seite stagen, Knöpfe/Tabellen/insert/delete ansehen). Nichts erfinden. Beispiele für gefundene Fallen: Status heißt „Inaktiv" (nicht „ausgeschieden"); Angebote löschen OHNE Rückfrage.
- Test tests/guideWissenA2.test.mjs prüft: jeder Eintrag ist Menü-Seite (lib/rechte.ts), jeder Link echte Seite, Sie-Form, kein „Agent", ≥3 Schritte, werText ≥15 Zeichen.
- Tests bauen über scripts/tests-bauen.cjs (esbuild bundle), nicht einzeln.
- kiGuideModule.modulGuide: MODUL_TEXTE zuerst, dann WISSEN, dann Einheitssatz.

## 3. Offen
| Paket | Inhalt |
|---|---|
| A2c | Finanzen (33 Seiten, ohne Personal/Personal-Dokumente) → _p103 |
| A2d | Verwaltung (15) |
| A2e | Betrieb/Branchen (75) — ggf. in 2–3 Bats |
| A3 | Guide-Oberfläche: volle Anzeige aus WISSEN (wer, Probe, landetIn als Knöpfe), nach Rolle (Chef/Mitarbeiter), Rang und Datenstand („0 Mitarbeiter → zuerst anlegen"), „Kenne ich schon"/„Überspringen", Startreihenfolge START_CHEF/START_MITARBEITER |
| A4 | Lehrplan Matrose → Kapitän (Chef und Mitarbeiter getrennt), Fortschritt |
| A5 | DashboardChat.tsx: veralteter Systemprompt (alte Preise, „24 KI-Agenten") raus; Chat antwortet nur aus WISSEN |

## 4. Befunde für Martin
- Angebote → 🗑 löscht sofort ohne Rückfrage (GEMEINSAM-Regel: nur mit Martin ändern).
- Check-in unter Mitglieder braucht Mitglieder-Freigabe (sieht IBAN) — Rechte-Entscheidung offen (aus PS5).

## 5. Regeln (unverändert)
Deutsch, CMD, additiv, idempotentes SQL komplett in den Chat, eigene _pNN.bat (nie überschreiben, erst nach Ende der vorigen Bat Dateien anfassen),
gezielter git add, Prüf-Kette (Tests, tsc mit ECHTEN Paketen, Gegenproben), Kundentexte mit „Sie", „Bausteine" statt „KI-Agenten".
Der Assistent SAGT nur — er trägt nie selbst etwas ein.
