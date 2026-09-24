# ARGONAUT OS · Startprompt Do 24.09.2026 (Abend) — Fortsetzung Bautag

Hallo Claude, ich bin Martin. Wir setzen den Bautag vom 24.09.2026 fort.
Bitte zuerst lesen: dieses Dokument, dann `docs/ARGONAUT-STARTPROMPT-24-09-2026.md` (Regeln + Paketplan)
und das Gedaechtnis `/areas/argonaut-bauliste-0924.md` (Baulog heute) sowie `/areas/argonaut-testtag-2.md`.
Repo: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` (Ordner bitte anfordern).
Testtag: So 27.09.2026.

## 1. Stand

| Paket | Inhalt | Bat | Stand |
|---|---|---|---|
| PA–PH, PG3 | siehe Startprompt Mittag | _p70–_p81 | live |
| PI | Nachtraege & Gewaehrleistung (/dashboard/bau-lv/ablaeufe) | _p82 | live (5c51837) |
| PJ | Fahrzeug-Akte, Geraete-Akte, QR-Etiketten (/dashboard/erp/...) | _p83 | live (c21b687) |
| PK | Plaene mit Maengel-Pins + Foto-KI (/dashboard/bautagebuch/plaene) | _p84 | SQL bestaetigt, Push lief |
| PL | Formulare & Checklisten (/dashboard/formulare) | _p85 | ausgeliefert — SQL + Push pruefen |

**12 von 19 Paketen + PG3 fertig, 7 uebrig.** Naechste freie Bat-Nummer: **_p86**.

## 2. Offen aus diesem Chat (Martin hat zugestimmt)
- **R1** Fuhrpark/Inventar: Mitarbeiter lesen/anlegen/aendern, LOESCHEN nur Chef — SQL `supabase-sql/r1-rechte-fuhrpark-inventar.sql` (ausgeliefert, pruefen ob gelaufen).
- **R2** Bautagebuch: Eintraege/Fotos/Maengel von Mitarbeitern liegen unter deren eigener ID -> Chef sieht sie nicht. Schritt 1 = LESEN `supabase-sql/r2-bautagebuch-lesen.sql` (Ergebnis-CSV von Martin). Schritt 2 = Reparatur: Code speichert owner = Betrieb + erstellt_von, neue Mitarbeiter-Regeln (insert/update), Speicher-Regel fuer Betriebs-Ordner, bestehende Zeilen umhaengen. GETRENNT liefern, vorher Datenmenge nennen.
- Oeffentliche Service-Anfrage per QR an Kundenanlagen (B24-Rest): Empfehlung spaeter separat, Martin hat noch nicht entschieden.

## 3. Naechste Pakete
PM Mehrsprachig (B25) -> PN Kunden-Portal plus (B26) -> PO Dispo plus (B29) -> PP Chef-Paket (B30, B31) -> PQ Gesundheit Stufe 1 (H01–H03) -> PR Pflichten-Helfer (K03, K04) -> PS Branchen-Blaetter (B21).

## 4. Regeln (unveraendert) + Lehren heute
- Deutsch, CMD, additiv, idempotentes SQL komplett in den Chat, eigene _pNN.bat, gezielter git add, Pruef-Kette + Gegenproben.
- Pfade mit [id] in der Bat als `git add -- ":(literal)pfad"`.
- Neue Seiten als Unterpfad eines bestehenden Moduls (erbt Freigabe + Buchungs-Gate) oder mit `immer: true`; ein neuer modul-Schluessel wuerde bei Kunden mit Buchungsliste gesperrt.
- Speicher-Buckets: erster Ordner = Betrieb (`coalesce(mein_chef_id(), auth.uid())`), nicht die Person.
