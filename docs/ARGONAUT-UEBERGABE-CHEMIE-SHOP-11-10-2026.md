# ARGONAUT Übergabe: Chemie und Chemie-Shop (11.10.2026)

Quelle: Chat „Chemiebranche / Pfinder" vom 11.10.2026 vormittags.
Code-Stand beim Abgleich: origin/main d21ad80 (nach Paket 310).
Zweck: Der Bau-Chat liest diese Datei und legt daraus einen neuen Abschnitt in der Bauliste an (docs/bauliste/rows.py → gen.py → Artifact neu veröffentlichen).
Diese Datei ist untracked. Bitte mit dem nächsten _pNN gezielt committen.

---

## 1. Anlass

- Interessent: Spezialchemie-Hersteller aus Böblingen (Korrosionsschutz, Hohlraumversiegelung, Kunden aus der Autoindustrie). Weitere Standorte gibt es in China, Mexiko und den USA.
- Martins Kontakt dort will einen **Online-Shop**, auch über die anderen Standorte hinaus.
- **Martins Verkaufsidee:** „Online-Shop für X €, aber nur mit dem ganzen System. Dafür in wenigen Tagen online." Unser Vorteil ist, dass ERP und Shop bereits verbunden sind.
- **Martins Wunsch:** Die Datenblätter des Betriebs (Sicherheitsdatenblatt, Technisches Merkblatt) sollen als Wissen ins System.
- **Martins Vorgabe:** Alles als **allgemeine Bausteine für alle Branchen** bauen. Chemie ist nur die erste Vorlage, nicht umsonst für eine einzige Branche.
- **Martins Vorgabe:** In drei Stufen arbeiten.
  1. Selbst bauen, ohne Anwalt
  2. Bauen, aber erst nach dem Anwalt einschalten
  3. Gar nicht selbst bauen, nur eine Schnittstelle zu einem Partner

---

## 2. Bestand am Code (Abgleich 11.10.)

### Chemie
- Branche `chemische-industrie` (Industrie & Produktion) mit Seite und SEO-FAQ: app/vorschau/_lib/branchen-web-extra.ts (Zeile ~63), app/vorschau/_lib/branchen-seo.ts (Zeile ~243).
- Fachdossier: **kein Text**, bewusst zurückgestellt (ARGONAUT-SPERR-GEDAECHTNIS.md, „Bewusst noch ohne Text"; Tests P223/P240/P252 halten es fest; Anwaltspunkt R46).
- Industrie-Paket (lib/branchenkatalog.ts KATEGORIE_MODULE): fertigung, bde, erp, lager-scanner, chargen, projekte, pruefprotokolle, zuschnitt, einkauf, wartung.
- **Gebaut, aber NICHT im Industrie-Paket:**
  - Gefahrstoffverzeichnis /dashboard/nachweise/gefahrstoffe. Tabelle `gefahrstoff` aus supabase-sql/ps2-qualitaet.sql: bezeichnung, hersteller, h_saetze, piktogramme[], signalwort, mengenbereich, arbeitsbereiche, sdb_datum, betriebsanweisung_am, ersatz_geprueft_am, notiz. Es gibt **keine Datei, keine Lagerklasse und keine Verknüpfung zu artikel/Lager**.
  - Nachweise & Fristen /dashboard/nachweise (Modul `nachweise`)
  - Mehrsprachige Unterweisung /dashboard/mehrsprachig
  - Etiketten
- Rezeptur /dashboard/rezeptur ist ein **Lebensmittel-Rechner** (Teigausbeute, Backverlust, Food-Cost) und für Chemie nicht geeignet.
- Chargen /dashboard/chargen (Rückverfolgung, Prüfplan Soll ± Toleranz, PDF je Charge) und Qualität /dashboard/chargen/qualitaet (8D, Lieferanten A/B/C, Rückruf) sind gut.

### Shop
- Artikel aus dem ERP (artikel.im_shop, shop_beschreibung, shop_bild_url, shop_mwst, shop_sortierung), Storefront public/shop.js (Warenkorb, Kasse, nur EUR, nur Deutsch), shop_bestellungen → Rechnung/CRM/Lager, Widerruf, Retouren.
- Kartenzahlung dunkel (ZAHLUNG_LIVE=false). Bezahlt wird per Rechnung, Überweisung oder Abholung.
- **Es fehlt:**
  - Dokumente am Artikel
  - Gefahrstoff-Pflichtangaben am Produkt
  - Geschäftskunden-Funktionen: Konto, Kundenpreise, Staffeln, Netto, Gebinde, Mindestmenge
  - Mehrsprachigkeit und weitere Währungen
- Firmen-Wissen: documents.fuer_team + lib/firmenWissen.ts (Andockpunkt für Datenblätter).
- Dokument-Auslese per KI mit Bestätigung gibt es als Muster schon: P307 Fahrzeugschein (Antwort auf Felder gefiltert, nichts gespeichert ohne Klick).

### Befunde (stehen schon im Kontrollgang)
- Die Website-Texte zu `chemische-industrie` versprechen zu viel: „Gefahrstoff-Doku läuft automatisch mit", „Produktion und Labor in einem Blick" (es gibt kein Labor-Modul), „Bestände in Echtzeit", SEO-FAQ „erfüllen hohe Compliance-Anforderungen".

---

## 3. Bauplan in drei Stufen (allgemeine Bausteine, Chemie als erste Vorlage)

### Stufe 1: Jetzt bauen, ohne Anwalt
| Nr | Baustein | Inhalt | Schätzung |
|---|---|---|---|
| CH1 | Industrie-Paket + Chemie-Texte | `nachweise` (inkl. Gefahrstoffe) und `etiketten` in KATEGORIE_MODULE 'Industrie & Produktion'; Website- und SEO-Text chemische-industrie ehrlich (nur Gebautes) | 1 Push, kein SQL |
| S1 | **Produkt-Dokumente** | PDFs je Artikel (Art: Sicherheitsdatenblatt / Technisches Merkblatt / Zertifikat / Anleitung / Leistungserklärung …, Sprache, Version, Datum, gültig bis), Download am Produkt im Shop, automatisch ins Firmen-Wissen (documents.fuer_team), Erinnerung bei alter Version | 1 SQL, 1–2 Pushes |
| S3a | **Geschäftskunden-Shop (technisch)** | Kundenkonto per Link, Kundenpreise und Preislisten, Staffelpreise, Netto-Anzeige, Gebinde und Mindestmenge, Kauf auf Rechnung | 1–2 SQL, 2–3 Pushes |
| G2a | **Gefahrstoffverzeichnis 2.0 (technisch)** | SDB-Datei am Stoff, Verknüpfung Stoff ↔ Artikel, Menge aus dem Lager, Lagerklasse (Feld), QR am Lagerplatz (SDB + Betriebsanweisung mobil), Erinnerung bei SDB älter als Richtwert | 1 SQL, 2 Pushes |
| Q1 | **Prüfzertifikat je Charge** | Analysenzertifikat bzw. Werkszeugnis als PDF aus dem vorhandenen Prüfplan, Sperrstatus für Rohstoffe, die noch nicht freigegeben sind | 1 SQL, 1 Push |
| R1 | **Rezeptur in Prozent** | Anteile in %, Ansatzgröße umrechnen, Versionen, Rohstoffkosten, Rohstoff in allen Rezepten tauschen, Ansatz → Charge. Allgemein (nicht nur Chemie), ohne GHS-Berechnung | 1 SQL, 2 Pushes |
| S4 | **Shop zweisprachig (DE/EN)** | Shop-Texte und Dokumente je Sprache | 1–2 Pushes |

### Stufe 2: Bauen, aber AUS bis zum Anwalt (Anwaltspunkt R49 in der Anwalt-Checkliste)
| Nr | Baustein | Offene Rechtsfrage |
|---|---|---|
| S2 | **Dokument-Auslese + Pflichtangaben im Shop**: KI liest aus dem SDB Piktogramme, Signalwort, H-Sätze, UN-Nummer als Vorschlag, ein Mitarbeiter bestätigt; Anzeige am Produkt UND noch einmal vor dem Bestellknopf | Haftung bei Auslesefehler; Pflichtangaben nach Art. 48/48a CLP (Geltungsbeginn der neuen Fernabsatz-Regel laut Quellen 2028, widersprüchlich) |
| S3b | Schalter „nur Gewerbe" (Prüfung USt-IdNr./Gewerbe) | Abgabeverbote ChemVerbotsV / REACH Anhang XVII, reicht der Nachweis? |
| S5 | SDB automatisch mit der Bestellbestätigung + Nachweis „versendet am" | REACH Art. 31: spätestens bei der ersten Lieferung, reicht der Mail-Versand als Nachweis? |
| G2b | Betriebsanweisungs-Entwurf als PDF mit Piktogrammen | Haftung für Mustertexte |
| G2c | Zusammenlagerungs-Ampel (TRGS 510) | Haftung bei falscher Ampel |
| D1 | Chemie-Fachdossier | Chemie zurückgestellt (R46) |
| — | Shop-Rechtstexte (AGB, Widerruf, Datenschutz Shop) | R32, R34 |

Vorbauen und per Schalter aus lassen, wie bei der Bestellstrecke. Neue Schalter gehören ins Sperr-Gedächtnis (Wächter-Test P224).

### Stufe 3: Nicht selbst bauen, nur Schnittstelle zum Partner
- **Sicherheitsdatenblätter erstellen**: Der Betrieb nutzt sein Fachprogramm, ARGONAUT übernimmt die fertigen PDFs und Daten.
- **GHS-Einstufung berechnen**: Partner.
- **Datenbank für Chemie-Vorschriften**: nur mit Lizenz.
- **Gefahrgut-Versand**: über die Schnittstelle zum Versanddienstleister.
- **Shops für das Ausland** (China, Mexiko, USA), weitere Währungen, Export: später, eigenes Rechts- und Steuerthema.

Grundsatz: ARGONAUT baut die Schnittstelle, der Kunde bringt sein Konto mit.

---

## 4. Nutzen für andere Branchen (warum allgemein bauen)

| Baustein | Nützt außer Chemie auch |
|---|---|
| S1 Produkt-Dokumente | Baustoffhandel (Leistungserklärung), Elektro (Datenblätter, CE), Maschinenbau (Betriebsanleitung), Lebensmittel (Spezifikation), Kosmetik, Möbel |
| S2 Dokument-Auslese (Vorschlag + Bestätigung) | Kfz (Fahrzeugschein, schon gebaut), Zertifikate mit Ablaufdatum, Allergene aus Lieferanten-Spezifikationen, Leistungserklärungen |
| S2 Pflichtangaben am Produkt im Shop | Lebensmittel (Allergene vor dem Kauf), Elektro (Energielabel), Textil (Faserangaben), Spielzeug (Warnhinweise), Batterien, Kfz (CO₂, gebaut) |
| S3 Geschäftskunden-Shop | Großhandel jeder Art, Getränkehandel, Landhandel, Baustoffhandel, alle Industrie-Hersteller |
| S5 Dokument mit Bestellung + Nachweis | Bau (Leistungserklärung), Metall (Werkszeugnis), Garantie-Urkunden, Betriebsanleitungen |
| Q1 Zertifikat je Charge | Metall (Werkszeugnis), Lebensmittel, Kunststoff, Kosmetik |
| R1 Rezeptur in Prozent | Farben und Lacke, Reinigungsmittel, Kosmetik- und Seifenmanufaktur, Futtermittel, Baustoff-Mischungen |
| G2 Gefahrstoffverzeichnis 2.0 | Fast jeder Betrieb mit Gefahrstoffen: Maler, Kfz-Werkstatt, Reinigung, Friseur, Schreiner, Galvanik, Landwirtschaft |
| S4 Zweisprachig | Jeder Betrieb mit Kunden im Ausland |

Umsetzung über die vorhandene Branchen-Vorlage (lib/branchenVorlage.ts, P259): Jeder Baustein ist allgemein und wird je Branche vorbelegt (Dokument-Arten, Pflichtfelder, Wörter).

---

## 5. Empfohlene Reihenfolge

1. CH1 Industrie-Paket + Chemie-Texte
2. S1 Produkt-Dokumente
3. S3a Geschäftskunden-Shop (technisch)
4. G2a Gefahrstoffverzeichnis 2.0 (technisch)
5. S2 + S3b + S5 vorbauen, ausgeschaltet bis R49
6. Q1 Zertifikat je Charge, R1 Rezeptur in Prozent, S4 Englisch

Zusammen etwa 12–15 Pushes und 6–8 SQL-Blöcke, also rund 4–5 Baublöcke à 2 Stunden. Das ist eine Schätzung, je Paket am Code nachprüfen.

---

## 6. Verkauf / Preis (nur Hinweis, Entscheidung Martin)

- Den Shop gibt es nicht einzeln, er ist Teil von ARGONAUT OS (lib/tarif.ts).
  - MITTEL (25–99): 2.690 €/Monat, Einrichtung 7.900 €
  - GROSS (100–499): 4.900 €/Monat, Einrichtung 14.900 €
  - dazu Sitze, firmenweit +49 €/Monat je weiterem Standort
- Formulierungs-Vorschlag: „Ihr Online-Shop mit allen Sicherheits- und Technischen Datenblättern ist Teil Ihrer ARGONAUT-Einrichtung und steht wenige Tage, nachdem Sie Produktdaten und Datenblätter übergeben haben." **Ohne** „alles inklusive" (gestrichen 05.10.).
- Ehrlich: „Wenige Tage" gilt erst nach S1 und S3a. Die Kunden-Domain wird noch von Hand in Vercel eingetragen. Die Kartenzahlung bleibt dunkel, für Geschäftskunden reicht Rechnung.
- Offene Fragen an den Interessenten: (1) Nur Gewerbekunden? (Empfehlung: ja) (2) Welche Standorte soll der Shop abdecken?
- Ehrliche Einschätzung: Ein Hersteller dieser Größe hat meist schon ein großes ERP. Der Einstieg geht dann eher über Shop, Datenblätter, Unterweisung, Nachweise und Marketing.

---

## 7. Notizen für Anwalt / Kontrollgang
- Anwalt: **R49** (Gefahrstoff-Shop) ist in der Anwalt-Checkliste ergänzt und muss in docs\intern\anwalt-werkzeug\daten.py nachgetragen werden.
- Kontrollgang: Die Chemie-Webtexte versprechen zu viel. Das Industrie-Paket enthält weder Gefahrstoffe noch Etiketten. Die Rezeptur ist nur für Lebensmittel.

Quellen (Recht):
- IT-Recht Kanzlei, CLP-Reform Kennzeichnung im Internet: https://www.it-recht-kanzlei.de/clp-reform-kennzeichnung-chemikalien-internet.html
- LAVG Brandenburg, Infoblatt Online-Shop Gefahrstoffe: https://LAVG.Brandenburg.de/sixcms/media.php/9/Infoblatt_Anforderung_Online-Shop_01022022.pdf
