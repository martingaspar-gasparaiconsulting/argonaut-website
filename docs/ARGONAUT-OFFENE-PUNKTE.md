# ARGONAUT OS · Offene Punkte (Stand 26.09.2026)

Eine Liste für alles, was noch zu bauen oder zu ändern ist. Wird nach jedem Push fortgeschrieben.
Reihenfolge von Martin freigegeben am 25.09.2026.

**Stand: 49 von 50 erledigt** (B1c mit _p119 + SQL b1c; G9–G14 mit _p118 + SQL g-paket-g9-g14; G6–G8 live mit _p117, G3–G5 mit _p116; B1b Gruppe 4, G1–G2, K1–K5, F1–F22 live; A1 und A2 zählen nicht mit)

## 1. Assistent fertigbauen — Claude baut allein

| Nr. | Was | Stand |
|---|---|---|
| A1 | Personalakte | ✅ live |
| A2 | Wissensbasis für alle 188 Menüseiten | ✅ live (_p106, c7f0fa2) |
| A3 | Guide nach Rolle, Rang und Datenstand | ✅ live (_p107, 807acd0) |
| A4 | Lehrplan Matrose bis Kapitän | ✅ gebaut (_p108) |
| A5 | Chat-Assistent ersetzen (alte Preise, „24 KI-Agenten") | ✅ gebaut (_p108) |

## 2. Schwerer Querschnitt

| Nr. | Was | Stand |
|---|---|---|
| B1a | Besitzer-Fehler Teil A: 70 Seiten, deren Tabellen Mitarbeitern das Anlegen für den Betrieb schon erlauben — reiner Code-Fix | ✅ live (_p109, fcad0cd) |
| B1b | Besitzer-Fehler Teil B, Gruppe 3 Arbeitsseiten (Aufmaß, Nachweise, Objektzeiten, Service-Verlauf, Hotelzimmer, Immobilien-Einheiten und Mietverträge, Wartungsverträge): SQL-Regel + Code | ✅ gebaut (_p110 + SQL) |
| B1b-1 | Gruppe 1 Zugänge und Einstellungen — bleiben beim Chef (Empfehlung) | ✅ entschieden 26.09.: Zugänge und Einstellungen bleiben beim Chef |
| B1b-4 | Gruppe 4 (Befund K5): Aufgaben, Kommentare, Auftragspositionen, Kontakt-Tags und -Aktivitäten, Projekt-Beteiligte/-Teams/-Vorlagen, Verkaufschancen, Objekte, Ressourcen, Korrespondenz, Post, Text-Werkstatt | ✅ live (_p115 + SQL b1b-gruppe4) |
| B1b-2 | Gruppe 2 Geld (Rechnung aus …, Angebote, Zahlungen, Kalkulator, Projektabrechnung, Förder-Angebot) — kommt zu G | ⬜ Vorschlag Fehler + Lösung am 26.09. vorgelegt, wartet auf Martins „so“ |
| B1c | Eigene Felder auf den übrigen Seiten (Werkstatt, Service …) ebenfalls dem Betrieb zuordnen | ✅ gebaut (_p119 + SQL b1c) — zentral in EigeneFelder: Felder und Werte immer mit Betriebs-Kennung; alte Mitarbeiter-Einträge umgehängt |

## 3. Geld und Abläufe — nur gemeinsam

Ablauf: je Punkt zeigt Claude **Fehler + Lösung + Empfehlung**, Martin sagt „so" oder ändert — erst dann wird gebaut.

| Nr. | Fehler | Stand |
|---|---|---|
| G1 | Beleg-Inbox, Reisekosten, Anlagen, Förder-Angebot: erkannter Wert „119.5" wird 1195 | ✅ war durch Zahlen-Querschnitt (_p104) schon behoben — Test dazu (_p114) |
| G2 | Reisekosten „Bearbeiten" setzt Mahlzeiten auf 0 und leert die Notiz | ✅ gebaut (_p114) |
| G3 | Rechnung: Stornieren ohne Rückfrage, keine Registerdaten, Logo-Upload fehlt | ✅ live (_p116) — Storno-Rückfrage, Registerdaten im Fuß, Logo-Upload |
| G4 | Angebote: 🗑 löscht sofort ohne Rückfrage | ✅ live (_p116) |
| G5 | Spendenbescheinigung: Nummer beginnt nicht je Jahr neu | ✅ live (_p116) |
| G6 | E-Rechnung-Import legt keinen Eingangsbeleg an | ✅ gebaut (_p117) — Eingangsbeleg automatisch, kein Doppel |
| G7 | SEPA-Einzug markiert Rechnungen nicht — Doppel-Einzug möglich | ✅ gebaut (_p117 + SQL g7) — Vermerk „in SEPA-Datei“, Zurücksetzen, nur offener Rest |
| G8 | Banking/Zahlungen: immer voller Betrag und „bezahlt heute" | ✅ gebaut (_p117) — Zahlung mit echtem Betrag und Buchungsdatum, Teilzahlung bleibt offen |
| G9 | Mitglieder-Kündigung nimmt sofort aus dem SEPA-Einzug | ✅ gebaut (_p118) — Gekündigte bleiben bis Vertragsende im Einzug, „zahlt bis …“ in der Liste |
| G10 | EÜR zählt stornierte Rechnungen und AfA ausgemusterter Anlagen | ✅ gebaut (_p118 + SQL) — Storno zählt nicht; Abgangsdatum (Pflicht), AfA bis Abgangsmonat, Restbuchwert als Ausgabe |
| G11 | Objektzeiten: Doppel-Abrechnung möglich, Rechnung sofort „offen" ohne Empfänger | ✅ gebaut (_p118) — Zeiten erst reservieren, dann abrechnen; Empfänger Pflicht |
| G12 | Bau & LV: Positionen nach Rechnung änderbar, unlesbare Werte still 0 | ✅ gebaut (_p118 + SQL-Trigger) — abgerechnetes LV gesperrt (frei nach Storno), klare Meldung statt 0 |
| G13 | Schadenabwicklung: „Gekürzt" falsch bei offener SB, Zahlung nicht entfernbar | ✅ gebaut (_p118) — Status aus allen Zahlungen, ✕ entfernt eine Zahlung mit Rückfrage |
| G14 | Förder-Angebot enthält ARGONAUT-eigene Pakete | ✅ gebaut (_p118 + SQL) — neutrale Vorlagen, eigene Leistungsbeschreibung, Löschen mit Rückfrage |

## 4. Abläufe und Fehler — Claude baut allein

Ablauf: Claude schreibt vorher je Punkt **Fehler + Lösung** auf, dann wird gebaut. F3 und F17 von Martin am 26.09. freigegeben (Empfehlung).

| Nr. | Fehler | Stand |
|---|---|---|
| F1 | Filial-Module: Aus- und wieder Einschalten blendet alle anderen Module aus (SCHWER) | ✅ gebaut (_p112) — Sperrliste statt Positivliste; Filial-Module/Standorte/Einstellungen nie abschaltbar |
| F2 | Website-Bauer: jedes Speichern nimmt die Seite offline, Bausteine werden nicht wieder geladen | ✅ gebaut (_p111) — Live-Status bleibt beim Speichern, gespeicherte Bausteine werden geladen, Domain/Berater überschreiben nichts |
| F3 | Rechte-Seite leitet auf /login (gibt es nicht) | ✅ gebaut (_p111) — 9 Seiten auf /auth/login, Wächter-Test |
| F4 | Filialleitung schreibt andere Tabelle, als der Filialvergleich liest | ✅ gebaut (_p111) — Vergleich liest mitarbeiter_standorte |
| F5 | Standorte: Hauptsitz löschbar | ✅ gebaut (_p111) |
| F6 | Import: falsche Zeilennummern, kein Rückgängig | ✅ gebaut (_p111 + SQL f6) — echte Dateizeile, „↺ … löschen“ je Import (nicht bei Offenen Posten) |
| F7 | Automation ist sofort nach dem Anlegen aktiv | ✅ gebaut (_p111) — neue Regeln starten pausiert |
| F8 | Datensicherung „komplett" = nur 8 Bereiche | ✅ gebaut (_p111) — alle Tabellen außer Zugangsdaten |
| F9 | Rezeptur: 2,125 kg wird beim Laden 2125, Speichern löscht erst alle Zutaten | ✅ gebaut (_p111) — Komma-Vorbelegung, erst schreiben dann alte löschen |
| F10 | KFZ: Fahrzeug löschen ohne Rückfrage, km „84.500" wird 84 | ✅ gebaut (_p111) |
| F11 | Chargen-Rückruf: „Jetzt sperren" verliert die Checklisten-Haken | ✅ gebaut (_p111) |
| F12 | BDE: Pause senkt die OEE wie eine Störung | ✅ gebaut (_p111) — Pause kürzt die Planbelegung |
| F13 | Versammlung: „Verschiedenes" wird als Beschluss markiert | ✅ gebaut (_p111) |
| F14 | Belegung: Status-Schild nach Check-in falsch | ✅ gebaut (_p111) — eingecheckt = belegt bis Check-out |
| F15 | Gastro: Reservierungs-Zahl immer 0, Felder Telefon/Personen fehlen | ✅ gebaut (_p111) — Zahl zählt „reserviert“, Telefon-Feld ergänzt |
| F16 | Tierbestand: Bestand ändert sich nie | ✅ gebaut (_p111) — Bewegungen ändern den Bestand |
| F17 | Dünge-Fristen: 14 Tage und 2 Tage widersprechen sich | ✅ gebaut (_p111) — 2 Tage (DüV § 10 Abs. 2), Anwalt-Checkliste 2 |
| F18 | Tour: Status nicht änderbar | ✅ gebaut (_p111) |
| F19 | Aufmaß-Preisfeld liest „1.234" als 1234 (Menge bewusst als 1,234) | ✅ gebaut (_p111) — Preis mit Komma vorbelegt |
| F20 | Werkstatt, Versammlungen, Brennholz: Speichern scheitert still oder meldet „✓ gespeichert" | ✅ gebaut (_p111) — 0 geänderte Zeilen = Fehlermeldung; Holz-Positionen erst schreiben, dann löschen |
| F21 | DSGVO-Frist einen Tag zu früh | ✅ gebaut (_p111) — Monatsfrist rein als Datum, Monatsende |
| F22 | Arbeitszeit-Nachweis und GoBD zeigen nur die eigenen Daten | ✅ gebaut (_p111) — Mitarbeiter sehen eigenen Nachweis; GoBD-Doku klar beim Inhaber |

### Claude-Befunde beim Bau von F (26.09.2026, noch nicht gezählt)

- Import-Center speichert neue Datensätze mit der eigenen Kennung — importiert ein Mitarbeiter Kontakte, sieht der Chef sie nicht (gleicher Fehler wie B1; kontakte hat keine Anlege-Regel für Mitarbeiter → gehört zu B1b-Entscheidung).
- Zahlenfelder, die die Zahl direkt als Wert halten (`value={zahl}`), lassen kein Komma tippen — in der Rezeptur behoben, auf anderen Seiten noch zu suchen (Kandidat für K-Paket).
- Werkstatt: Positionen einzeln speichern meldet jetzt Fehler; das Löschen eines Mitarbeiters dort wirkt weiterhin still nicht (A2e-Befund, offen).

## 5. Kleinkram — ein Sammel-Paket

| Nr. | Was | Stand |
|---|---|---|
| K1 | Löschen ohne Rückfrage an vielen Stellen (BDE, Erträge, Chargen, Fertigung, Zuschnitt, Betriebskosten, Exposé, Gutachten, Hilfsmittel, Ernte, Bau & LV) | ✅ gebaut (_p113) — 12 Stellen mit Rückfrage und Meldung, wenn nichts gelöscht wurde |
| K2 | Du-Form in Leerzuständen (ca. 15 Seiten) | ✅ gebaut (_p113) — 29 Leertexte auf „Sie“, Wächter-Test |
| K3 | Fehlende Umlaute („Waermepumpe", „bestaetigt", „Waehlen" …) | ✅ gebaut (_p113) — sichtbare Texte in 36 Dateien; Rechnungs-Texte (Abschlag, Einbehalt, Skonto, § 13b, USt-IdNr) bewusst NICHT angefasst → zu G |
| K4 | Leertexte versprechen, was es nicht gibt („Kaution buchen", „in Angebot übernehmen", Standort-Feld, Stunden im Bautagebuch) | ✅ gebaut (_p113) — Aufmaß, Verleih, Personal, Bautagebuch |
| K5 | Für ca. 20 Branchen-Tabellen fehlt die SQL-Datei im Repo — eine Leseabfrage in Supabase klärt die Zugriffsregeln | ✅ Abfrage geliefert (supabase-sql/k5-zugriffsregeln-befund.sql, nur lesen) — Auswertung, sobald docs/k5-befund.csv im Repo liegt |

## 6. Ganz am Ende — Test-Checklisten und Testtage (Martins Auftrag 25.09.)

Erst nach allen 44 Punkten. Drei Checklisten, jede in logischer Reihenfolge, jede mit eigenem Testtag:

1. **Martin als ARGONAUT-Betreiber** — Kunden anlegen, freischalten, betreuen, abrechnen
2. **Der Kunde** (Chef eines Betriebs, z. B. Elektrobetrieb) — vom ersten Login bis zum Monatsabschluss
3. **Mitarbeiter des Kunden** — vom Einladungs-Link bis zum Arbeitsalltag

Je Testtag durch alle Module: Läuft es? Kommt es an? Kommt es **richtig** an (beim Chef, beim Mitarbeiter, in Rechnung, Finanzen, Auswertung)?
Danach Abgleich mit dem Anwaltstermin: offene Punkte aus der Anwalt-Checkliste (Teil 1 und 2) mit aufnehmen.

## 7. Danach

- Brainstorming (u. a. „mit einem Klick in alle Branchenverzeichnisse")
