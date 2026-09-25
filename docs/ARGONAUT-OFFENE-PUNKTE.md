# ARGONAUT OS · Offene Punkte (Stand 25.09.2026)

Eine Liste für alles, was noch zu bauen oder zu ändern ist. Wird nach jedem Push fortgeschrieben.
Reihenfolge von Martin freigegeben am 25.09.2026.

**Stand: 1 von 45 erledigt** (A3 mit _p107; A1 und A2 zählen nicht mit, sie waren vorher fertig)

## 1. Assistent fertigbauen — Claude baut allein

| Nr. | Was | Stand |
|---|---|---|
| A1 | Personalakte | ✅ live |
| A2 | Wissensbasis für alle 188 Menüseiten | ✅ live (_p106, c7f0fa2) |
| A3 | Guide nach Rolle, Rang und Datenstand | ✅ gebaut (_p107) |
| A4 | Lehrplan Matrose bis Kapitän | ⬜ |
| A5 | Chat-Assistent ersetzen (alte Preise, „24 KI-Agenten") | ⬜ |

## 2. Schwerer Querschnitt

| Nr. | Was | Stand |
|---|---|---|
| B1 | Besitzer-Fehler: ca. 122 Seiten speichern Mitarbeiter-Einträge unter der eigenen Kennung statt beim Betrieb — der Chef sieht sie nie. Reparatur je Tabelle geprüft. | ⬜ |

## 3. Geld und Abläufe — nur gemeinsam

Ablauf: je Punkt zeigt Claude **Fehler + Lösung + Empfehlung**, Martin sagt „so" oder ändert — erst dann wird gebaut.

| Nr. | Fehler | Stand |
|---|---|---|
| G1 | Beleg-Inbox, Reisekosten, Anlagen, Förder-Angebot: erkannter Wert „119.5" wird 1195 | ⬜ |
| G2 | Reisekosten „Bearbeiten" setzt Mahlzeiten auf 0 und leert die Notiz | ⬜ |
| G3 | Rechnung: Stornieren ohne Rückfrage, keine Registerdaten, Logo-Upload fehlt | ⬜ |
| G4 | Angebote: 🗑 löscht sofort ohne Rückfrage | ⬜ |
| G5 | Spendenbescheinigung: Nummer beginnt nicht je Jahr neu | ⬜ |
| G6 | E-Rechnung-Import legt keinen Eingangsbeleg an | ⬜ |
| G7 | SEPA-Einzug markiert Rechnungen nicht — Doppel-Einzug möglich | ⬜ |
| G8 | Banking/Zahlungen: immer voller Betrag und „bezahlt heute" | ⬜ |
| G9 | Mitglieder-Kündigung nimmt sofort aus dem SEPA-Einzug | ⬜ |
| G10 | EÜR zählt stornierte Rechnungen und AfA ausgemusterter Anlagen | ⬜ |
| G11 | Objektzeiten: Doppel-Abrechnung möglich, Rechnung sofort „offen" ohne Empfänger | ⬜ |
| G12 | Bau & LV: Positionen nach Rechnung änderbar, unlesbare Werte still 0 | ⬜ |
| G13 | Schadenabwicklung: „Gekürzt" falsch bei offener SB, Zahlung nicht entfernbar | ⬜ |
| G14 | Förder-Angebot enthält ARGONAUT-eigene Pakete | ⬜ |

## 4. Abläufe und Fehler — Claude baut allein

Ablauf: Claude schreibt vorher je Punkt **Fehler + Lösung** auf, dann wird gebaut.

| Nr. | Fehler | Stand |
|---|---|---|
| F1 | Filial-Module: Aus- und wieder Einschalten blendet alle anderen Module aus (SCHWER) | ⬜ |
| F2 | Website-Bauer: jedes Speichern nimmt die Seite offline, Bausteine werden nicht wieder geladen | ⬜ |
| F3 | Rechte-Seite leitet auf /login (gibt es nicht) | ⬜ |
| F4 | Filialleitung schreibt andere Tabelle, als der Filialvergleich liest | ⬜ |
| F5 | Standorte: Hauptsitz löschbar | ⬜ |
| F6 | Import: falsche Zeilennummern, kein Rückgängig | ⬜ |
| F7 | Automation ist sofort nach dem Anlegen aktiv | ⬜ |
| F8 | Datensicherung „komplett" = nur 8 Bereiche | ⬜ |
| F9 | Rezeptur: 2,125 kg wird beim Laden 2125, Speichern löscht erst alle Zutaten | ⬜ |
| F10 | KFZ: Fahrzeug löschen ohne Rückfrage, km „84.500" wird 84 | ⬜ |
| F11 | Chargen-Rückruf: „Jetzt sperren" verliert die Checklisten-Haken | ⬜ |
| F12 | BDE: Pause senkt die OEE wie eine Störung | ⬜ |
| F13 | Versammlung: „Verschiedenes" wird als Beschluss markiert | ⬜ |
| F14 | Belegung: Status-Schild nach Check-in falsch | ⬜ |
| F15 | Gastro: Reservierungs-Zahl immer 0, Felder Telefon/Personen fehlen | ⬜ |
| F16 | Tierbestand: Bestand ändert sich nie | ⬜ |
| F17 | Dünge-Fristen: 14 Tage und 2 Tage widersprechen sich | ⬜ |
| F18 | Tour: Status nicht änderbar | ⬜ |
| F19 | Aufmaß-Preisfeld liest „1.234" als 1234 (Menge bewusst als 1,234) | ⬜ |
| F20 | Werkstatt, Versammlungen, Brennholz: Speichern scheitert still oder meldet „✓ gespeichert" | ⬜ |
| F21 | DSGVO-Frist einen Tag zu früh | ⬜ |
| F22 | Arbeitszeit-Nachweis und GoBD zeigen nur die eigenen Daten | ⬜ |

## 5. Kleinkram — ein Sammel-Paket

| Nr. | Was | Stand |
|---|---|---|
| K1 | Löschen ohne Rückfrage an vielen Stellen (BDE, Erträge, Chargen, Fertigung, Zuschnitt, Betriebskosten, Exposé, Gutachten, Hilfsmittel, Ernte, Bau & LV) | ⬜ |
| K2 | Du-Form in Leerzuständen (ca. 15 Seiten) | ⬜ |
| K3 | Fehlende Umlaute („Waermepumpe", „bestaetigt", „Waehlen" …) | ⬜ |
| K4 | Leertexte versprechen, was es nicht gibt („Kaution buchen", „in Angebot übernehmen", Standort-Feld, Stunden im Bautagebuch) | ⬜ |
| K5 | Für ca. 20 Branchen-Tabellen fehlt die SQL-Datei im Repo — eine Leseabfrage in Supabase klärt die Zugriffsregeln | ⬜ |

## 6. Danach

- Brainstorming (u. a. „mit einem Klick in alle Branchenverzeichnisse")
- Testtag So 27.09.
