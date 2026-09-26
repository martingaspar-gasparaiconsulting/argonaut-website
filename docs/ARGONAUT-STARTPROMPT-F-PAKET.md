# ARGONAUT OS · Startprompt — F-Paket (Abläufe und Fehler), ab 25.09.2026 abends

Hallo Claude, ich bin Martin. Neuer Chat, Fortsetzung.
Bitte zuerst: beide Ordner anfordern (Skill argonaut-chatstart), dann lesen:
dieses Dokument, `docs/ARGONAUT-OFFENE-PUNKTE.md` (die EINE Liste), das Gedächtnis
`/areas/argonaut-bauliste-0925.md` (unterer Teil ab „Assistent Teil 3") und `/areas/argonaut-testtag-2.md`.

## 1. Stand (25.09.2026, ca. 18 Uhr)
- Assistent komplett LIVE: A2e (c7f0fa2), A3 Guide nach Rolle/Rang/Datenstand (807acd0), A4 Lehrplan + A5 Chat aus Wissensbasis (54e1f8d).
- B1a LIVE (fcad0cd): 70 Seiten speichern owner_user_id = Betrieb (rpc mein_chef_id). Wächter tests/besitzerB1.test.mjs.
- B1b Gruppe 3 LIVE (2ca109a) + SQL b1b bestätigt (9 Tabellen je 3 Regeln, 0 Löschrechte).
- Supabase-Befund docs/b1-befund.csv: 0 verwaiste Mitarbeiter-Zeilen.
- Nächste freie Bat: **_p111**.
- Das Repo ist im Container direkt klonbar: `git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git` (volle Prüfkopie, `npm install`, echte Pakete). `next build` geht im Container NICHT (Google Fonts gesperrt) — das macht die Bat.

## 2. Freigegebene Reihenfolge (Martin, 25.09.)
1. **F1–F22** baut Claude allein. Die Liste „Fehler + Lösung" hat Martin bereits gesehen (im Chat 25.09.; steht auch in OFFENE-PUNKTE). Ausnahmen vorher mit Martin klären: **F3** (Weiterleitung Login = Auth) und **F17** (Düngefrist = Rechtswert, Anwalt-Hinweis).
2. **K1–K5** Kleinkram als Sammelpaket.
3. **G1–G14** Geld: je Punkt „Fehler + Lösung + Empfehlung" zeigen, Martin sagt „so" oder ändert — erst dann bauen. B1b-2 (Geld-Stellen des Besitzer-Fehlers) gehört dazu.
4. Offen zur Entscheidung: B1b-1 (Zugänge/Einstellungen bleiben Chef — Empfehlung), B1c (eigene Felder auf den übrigen Seiten, z. B. Werkstatt, dem Betrieb zuordnen).
5. GANZ AM ENDE: drei Test-Checklisten (Betreiber / Kunde-Chef / Mitarbeiter des Kunden) je mit Testtag, danach Abgleich mit Anwalt-Checkliste. Dann Brainstorming.

## 3. Offene Claude-Befunde aus B1a (nicht angefasst)
- Marketing-Routen mit Admin-Client: Mitarbeiter bearbeiten jetzt Betriebsdaten, keine Rollenprüfung.
- Landingpage-Impressum und DSGVO-Kopf lesen das Profil der angemeldeten Person (beim Mitarbeiter leer/falsch).
- Dispo „Ich (Chef)" zeigt beim Mitarbeiter dessen eigenen Namen.
- freebie_mail, FilialZuordnung, Social-Video-Dateien: noch eigene Kennung bzw. Datei im Ordner des Mitarbeiters.
- Mitarbeiter-Ändern scheitert still bei Tabellen ohne Änderungsregel (agrar_*, fertigung_stueckliste*, gutschein_einloesung, lm_chargen, it_assets).

## 4. Regeln (unverändert)
Deutsch, CMD, additiv, idempotentes SQL komplett in den Chat, eigene _pNN.bat (nie überschreiben; erst nach Ende der vorigen Bat Dateien anfassen, die darin stecken), vor dem Schreiben Gerätestand gegen GitHub vergleichen, gezielter git add, Prüf-Kette (Tests, tsc mit echten Paketen, Gegenproben), Kundentexte mit „Sie", „Bausteine" statt „KI-Agenten". Nach jedem Push Stand der Liste nennen. Klicktests für den Testtag sammeln, nicht zwischendurch verlangen.
