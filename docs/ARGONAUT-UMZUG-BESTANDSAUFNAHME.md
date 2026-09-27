<!-- Kopie des Claude Docs „ARGONAUT · Umzug Schritt 1 – Bestandsaufnahme“ (https://claude.ai/code/artifact/ab088f59-5571-4b41-a58c-27f8c29ba6ac), Stand 27.09.2026, mitgeliefert mit Paket 124. Das Claude Doc bleibt die lebende Fassung. -->

# ARGONAUT · Umzug Schritt 1 – Bestandsaufnahme: Welche Daten bringt ein Betrieb mit?

2026-09-27 · Martin

Ein Betrieb bringt beim Umzug 8 bis 20 Tabellen mit. Heute kommen davon nur 4 durch das Import-Center (Kunden, Artikel, Lieferanten, Offene Posten), der Rest nur über Vorlagen oder gar nicht. Diese Liste ist die Grundlage für den Import-Motor (Schritt 2) und die Kataloge je Branchengruppe (Schritt 4).

## So lesen

- **Datei aus dem Altsystem:** was der Betrieb typischerweise exportieren kann.
- **Ziel in ARGONAUT:** die Tabelle in der Datenbank, in der die Zeilen landen müssen (am echten Stand geprüft, 393 Tabellen).
- **Import heute:** ✅ Import-Center · 🟡 eigener Import im Modul · 📄 nur Vorlage zum Herunterladen, kein Einlesen · ❌ nichts.
- **Muss:** ohne diese Datei ist der Betrieb am ersten Tag nicht arbeitsfähig. **Kann:** hilfreich, darf nachkommen.

Geprüft am Code-Stand `dcb32ec` plus Paket 123 (Umzug-Leiste). Die Zählung vom 27.09. (9 Modul-Importe, 26 Nur-Vorlage-Karten) zählt Karten im Import-Center; hier wird je Datei gezählt, daher weichen die Zahlen leicht ab. Jede Tabelle unten ist gegen die Datenbankliste geprüft.

## Kern – das bringt jeder Betrieb mit

Diese 18 Dateien gelten für alle Branchengruppen; nur 4 davon laufen heute durch das Import-Center.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Kunden mit Adresse + Kundennummer | Warenwirtschaft, Lexware, sevDesk, Excel | `kontakte` (+ `firmen`) | ✅ ohne Adresse und Kundennummer | Muss |
| Lieferanten | Warenwirtschaft, DATEV-Kreditoren | `lieferanten` (daneben `lieferant`) | ✅ + 🟡 zweite Tür | Muss |
| Artikel mit Preisen und Bestand | Warenwirtschaft, Großhändler-Datanorm | `artikel` (+ `preis_historie`) | ✅ + 🟡 Preisliste | Muss |
| Leistungskatalog / Stundensätze | Angebotsprogramm, Excel | `leistungskatalog` | ❌ | Muss |
| Offene Posten | Buchhaltung, OP-Liste | `rechnungen` | ✅ ohne Kunden-Verknüpfung | Muss |
| Mitarbeiter | Lohnprogramm, Excel | `mitarbeiter` (+ `personal_vertrag`) | ❌ (nur Chef, Stammdaten) | Muss |
| Qualifikationen / Schulungen | Excel, Zertifikate | `mitarbeiter_qualifikation`, `hr_schulungen` | ❌ | Kann |
| Leads | CRM, Website-Formulare | `leads` | ❌ | Kann |
| Verkaufschancen | CRM (Pipedrive, HubSpot) | `verkaufschancen` (daneben `crm_deal`) | ❌ | Kann |
| Aktivitäten / Gesprächsnotizen | CRM | `kontakt_aktivitaeten` | ❌ | Kann |
| Aufträge (laufend) | Warenwirtschaft | `auftraege` + `auftrag_positionen` | ❌ | Muss |
| Angebote (offen) | Angebotsprogramm | `angebote` + `angebot_positionen` | ❌ – GEMEINSAM | Muss |
| Bestellungen mit Positionen | Einkauf | `bestellung` + `bestellung_position` (daneben `bestellungen`) | ❌ | Kann |
| Eingangsrechnungen (alt) | Buchhaltung, E-Rechnung | `eingangsbelege` | 🟡 nur E-Rechnung einzeln | Kann |
| Laufende Kosten / Verträge | Excel, Kontoauszug | `vertraege` | ❌ | Kann |
| Anlagen / Fuhrpark | Anlagenverzeichnis | `anlagegueter`, `fahrzeuge` | ❌ | Kann |
| Termine | Outlook, Google | `termine` | ❌ (iCal in Schritt 7) | Kann |
| Kontoauszug | Online-Banking CSV/CAMT | Bankabgleich | 🟡 eigener Import | Kann |

Drei Kunden-Türen (Import-Center, CRM-Import, `firmen`) und zwei Artikel-/Lieferanten-Türen führt Schritt 2 zu einer zusammen.

## Handwerk & Bau

Elektro, SHK, Schreiner, Maler, Dachdecker, Bau. Das ist die Gruppe des Musterbetriebs Haldenberg; hier fehlen vor allem Wartung, Objekte und Baustellen-Daten.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Wartungsverträge | Wartungsplaner, Excel | `wartungsvertraege` (+ `wartungshistorie`) | 📄 | Muss |
| Anlagen beim Kunden (Prüfobjekte) | Prüfsoftware, Excel | `objekte`, `pruefpflichten` | 📄 | Muss |
| Prüfprotokolle (E-Check, DGUV V3) | Messgeräte-Software | `pruef_protokoll` + `pruef_punkt` | 📄 | Kann |
| Großhändler-Artikel | Datanorm, BMEcat | `artikel` | ❌ (Schritt 7) | Muss |
| Leistungsverzeichnisse | GAEB X83/D83 | `bau_lv` + `bau_lv_positionen`, `aufmasse` | 🟡 GAEB im Aufmaß | Kann |
| Projekte / Baustellen | Excel, Projektsoftware | `projekte` | ❌ | Muss |
| Einsätze / Dispo | Plantafel | `einsaetze` | ❌ | Kann |
| Service-Tickets | Ticket-System | `tickets` | ❌ | Kann |
| Fahrzeuge / Geräte | Fuhrparkliste | `fahrzeuge`, `inventar` | ❌ | Kann |
| Zuschnitt-Teile (Schreiner, Metallbau) | CAD, Excel | `zuschnitt_teil` | 📄 | Kann |
| Maschinen (BDE) | Maschinenliste | `bde_maschine` | 📄 | Kann |

## Handel & E-Commerce

Einzelhandel, Großhandel, Onlineshop. Artikel und Bestand gehen heute schon rein; Varianten, Lager je Filiale und Shop-Bestellungen noch nicht über den Motor.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Artikel-Varianten (Größe/Farbe) | Shopify, WooCommerce, WaWi | `variante_gruppe` + `variante_artikel` | 🟡 im Modul | Muss |
| Bestand je Filiale | WaWi | `artikel_bestand_standort` | ❌ | Muss bei Filialen |
| Kundenbestellungen (offen) | Shop-Export | `shop_bestellungen` | ❌ | Kann |
| Gutscheine (ausgegeben, Restwert) | Kasse, Shop | `gutschein` | 📄 | Muss |
| Kassen-Stammdaten | Kassensystem | `kassen_system` | ❌ | Kann |
| Preislisten Lieferant | Datanorm, BMEcat, CSV | `artikel`, `preis_historie` | 🟡 Preisliste | Kann |
| Verleih-Artikel | Excel | `verleih_artikel` | ❌ | Kann |

## Lebensmittel

Metzger, Bäcker, Konditor, Lebensmittel-Hersteller. Rezepturen, Chargen und Etiketten sind Pflicht für die Kennzeichnung; zwei davon gibt es nur als Vorlage, HACCP gar nicht.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Rezepturen mit Zutaten | Rezeptur-Software, Excel | `rezepturen` + `rezeptur_zutaten` | 📄 | Muss |
| Produkte mit Zutaten, Allergenen, Nährwerten (LMIV) | Etiketten-Software | `etikett_produkt` | 🟡 im Modul | Muss |
| Chargen | Produktionsliste | `lm_chargen`, `charge_los` | 📄 | Kann |
| HACCP-Plan und Messpunkte | HACCP-Ordner, Excel | `lm_haccp_plan`, `lm_haccp` | ❌ | Muss |
| Filial-/Marktverkäufe | Kasse | `markt_verkauf` | ❌ | Kann |

## Gastro & Hotel

Restaurant, Café, Hotel, Pension. Zimmer, Speisekarte und künftige Buchungen müssen am ersten Tag stimmen, sonst drohen Doppelbelegungen.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Speisekarte mit Allergenen | Kasse, Excel | `menu_gericht` | 🟡 im Modul | Muss |
| Zimmer / Einheiten | Hotelsoftware (PMS) | `hotel_zimmer`, `belegung_einheit` | 📄 | Muss |
| Künftige Buchungen | PMS, Booking-Export | `hotel_belegungen`, `belegung_vorgang` | 📄 | Muss |
| Tischreservierungen | Reservierungs-Tool | `gastro_reservierungen`, `reservierung_vorgang` | 📄 | Kann |
| Tische / Plätze | Excel | `reservierung_platz` | 📄 | Kann |
| Gutscheine | Kasse | `gutschein` | 📄 | Kann |
| Veranstaltungen | Excel | `event_veranstaltung` | 📄 | Kann |

Meldescheine werden nicht importiert: Sie müssen nach einem Jahr vernichtet werden (§ 30 BMG) und entstehen neu.

## Gesundheit

Arztpraxen, Physio, Ergo, Pflege, Hilfsmittel. Patientendaten sind Gesundheitsdaten nach Art. 9 DSGVO; sie gehen erst live, wenn der Anwalt den Import geprüft hat, und xDT-Formate kommen danach.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Patienten (Stammdaten) | Praxissoftware (xDT, CSV) | `kontakte` + `gesundheit_freigabe` | ❌ – Anwalt zuerst | Muss |
| Einwilligungen | Praxissoftware, Papier | `praxis_einwilligung` | ❌ – Anwalt zuerst | Muss |
| Recall-Liste | Praxissoftware | `praxis_recall` | ❌ | Kann |
| Hilfsmittel-Versorgungen | Branchensoftware | `hilfsmittel_versorgung` + `hilfsmittel_position` | 📄 | Muss |
| Termine | Praxiskalender | `termine` | ❌ (iCal in Schritt 7) | Muss |
| Behandlungen (Wellness, Kosmetik) | Studio-Software | `wellness_kunden`, `wellness_behandlungen` | ❌ | Kann |

## Tier

Tierärzte, Tierhaltung, Hufschmied, Hundesalon. Tierakten sind keine Gesundheitsdaten nach Art. 9 DSGVO, die Halterdaten aber Personendaten. Die Tierarzt-Akte kommt trotzdem auf die Anwalt-Liste, weil sie Behandlung und Halter verbindet.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Tiere mit Halter | Praxissoftware (Tierarzt) | `tier_tiere` + `kontakte` | ❌ – Anwalt zuerst | Muss |
| Behandlungen / Impfungen | Praxissoftware | `tier_behandlungen`, `tier_erinnerung` | ❌ | Muss |
| Tierbestand (Landwirt) | HIT, Excel | `tier_gruppe`, `tier_bewegung` | 📄 | Muss |

## Beratung & Planung

Kanzlei, Steuerbüro, Architekt, Ingenieur, Agentur, Gutachter. Hier zählen Akten, Fristen und Zeiten; eine verspätete Frist ist ein Haftungsfall.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Mandate / Akten | Kanzleisoftware, DATEV | `kanzlei_mandate`, `kanzlei_akte` | 📄 | Muss |
| Fristen | Kanzleisoftware | `kanzlei_fristen` (daneben `kanzlei_frist`) | 📄 | Muss |
| Zeiten / Aufwand | Zeiterfassung | `agentur_zeiten`, `projektleistungen` | 📄 Aufwand | Kann |
| Retainer / Rahmenverträge | Excel | `agentur_retainer` | ❌ | Kann |
| Gutachten | Gutachter-Software | `gutachten` + `gutachten_position` | 📄 | Kann |
| Nutzungsrechte | Excel | `agentur_nutzungsrecht` | ❌ | Kann |

## Immobilien

Hausverwaltung, WEG-Verwaltung, Makler. Mietverträge und Kautionen müssen vollständig sein, sonst stimmt die nächste Betriebskostenabrechnung nicht.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Objekte und Einheiten | Verwaltersoftware | `immo_einheiten`, `bk_einheit` | 📄 BK-Einheiten | Muss |
| Mietverträge | Verwaltersoftware | `immo_mietvertraege` | ❌ | Muss |
| Kautionen | Verwaltersoftware | `immo_kaution` | ❌ | Muss |
| Mieteingänge (Sollstellung) | Buchhaltung | `immo_zahlungen` | ❌ | Kann |
| Exposé-Objekte | Maklersoftware, Portale | `expose` | 📄 | Kann |
| Interessenten | Maklersoftware | `expose_interessent` | ❌ | Kann |

## Landwirtschaft

Ackerbau, Tierhaltung, Direktvermarktung, Forst. Schläge und ihre Dünge-/Pflanzenschutz-Aufzeichnungen sind nachweispflichtig.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Schläge / Feldstücke | Ackerschlagkartei, FIONA/Antrag | `agrar_schlaege`, `schlag` | 📄 | Muss |
| Düngung und Pflanzenschutz | Schlagkartei | `schlag_duengung`, `schlag_psm` | ❌ | Muss |
| Markt-Produkte | Excel | `markt_produkt` | 🟡 im Modul | Kann |
| Energie-Anlagen (PV, BHKW) | Anlagenliste | `ertrag_anlage`, `energie_anlagen` | 📄 | Kann |
| Forst-Objekte und Bäume | Forstsoftware | `forst_objekte`, `forst_baeume` | ❌ | Kann |
| Holz-Sortiment und Preise | Excel | `holz_sortiment`, `holz_preise` | 🟡 eigener Import | Kann |

## Bildung, Vereine, Mitglieder

Bildungsträger, Fahrschule, Verein, Studio. Mitglieder mit Bankverbindung und Mandat sind der Kern; ohne sie läuft kein Beitragseinzug.

| Datei aus dem Altsystem | Typische Quelle | Ziel in ARGONAUT | Import heute | Muss/Kann |
|---|---|---|---|---|
| Mitglieder mit IBAN und SEPA-Mandat | Vereinssoftware, Studio-Software | `mitglieder` (daneben `verein_mitglieder`) | ❌ – GEMEINSAM (Bank) | Muss |
| Kurse und Termine | Excel, Kursplaner | `bildung_kurse`, `bildung_termine` | 📄 | Muss |
| Anmeldungen / Teilnehmer | Kursplaner | `bildung_anmeldungen` | ❌ | Muss |
| Räume | Excel | `raum_ressource` | 🟡 im Modul | Kann |
| Spenden | Vereinssoftware | `spende` | 📄 | Kann |
| Fördervorhaben | Excel | `foerder_vorhaben` | 📄 | Kann |
| Ehrenamts-Stunden | Excel | `verein_ehrenamt` | ❌ | Kann |

## Lücken und Folgen für Schritt 2 und 3

Von den 82 Dateien oben laufen 4 durch das Import-Center, 10 nur über einen eigenen Modul-Import und 27 nur als Vorlage; 41 haben heute gar keinen Weg.

**Doppelte Türen und doppelte Tabellen** (werden in Schritt 2 zusammengeführt, nichts wird gelöscht):

| Bereich | Türen / Tabellen heute | Ziel |
|---|---|---|
| Kunden | Import-Center · CRM-Import · Tabelle `firmen` neben `kontakte` | ein Motor, Ziel `kontakte`, Firma verknüpft |
| Artikel | Import-Center · Preislisten-Import | ein Motor, Preisliste als Voreinstellung |
| Lieferanten | Import-Center · Lieferanten-Import · `lieferant` neben `lieferanten` | ein Motor, Tabelle am Code geklärt |
| Bestellungen | `bestellung` neben `bestellungen` | klären, welche das Einkaufsmodul liest |
| Fristen | `kanzlei_frist` neben `kanzlei_fristen` | klären |
| Mitglieder | `mitglieder` neben `verein_mitglieder` | klären |
| Alt-Import | `import_laeufe` + `import_zeilen` (vom CRM-Import) neben `import_jobs` | ein Protokoll |

**Reihenfolge für Schritt 3** (Muss-Dateien zuerst, weil ein Betrieb ohne sie nicht startet):

1. Kunden mit Adresse und Kundennummer, Offene Posten mit Kunde verknüpft
2. Mitarbeiter (nur Chef), Leistungskatalog, laufende Aufträge, Projekte
3. Wartungsverträge, Anlagen beim Kunden, Bestellungen, Eingangsrechnungen, laufende Kosten, Anlagen/Fuhrpark
4. Leads, Verkaufschancen, Aktivitäten, Qualifikationen
5. Die 26 Nur-Vorlage-Karten der Branchengruppen
6. Angebote – GEMEINSAM: erst zeigen, dann bauen

**Bleiben bewusst draußen, bis geklärt:** Patienten und Tierakten (Anwalt), Mitglieder mit Bankdaten (GEMEINSAM-Regel Bank), Meldescheine (Vernichtungspflicht).

**Offene Fragen:**

- Welche der doppelten Tabellen (`bestellung`/`bestellungen`, `kanzlei_frist`/`kanzlei_fristen`, `mitglieder`/`verein_mitglieder`) ist die führende? Klärt Claude am Code vor Schritt 2.
- Welche Altsysteme haben Ihre ersten Kunden je Gruppe? Das entscheidet, welche Spaltennamen der Motor zuerst erkennt.

## Nachtrag Paket 124 (Schritt 2, 27.09.2026) — Klärung der doppelten Tabellen am Code

Am Code-Stand `4cab5b5` gezählt (Stellen mit `.from('tabelle')`):

| Paar | Befund | Ziel des Import-Motors |
|---|---|---|
| `kontakte` (96) / `firmen` (19) | keine Dopplung: `firmen` ist die Firmen-Ebene über den Kontakten (CRM → Firmen, Rechnungen, Mahnwesen) | `kontakte`; Firmenname als Text, Verknüpfung mit `firmen` folgt in Schritt 3 |
| `lieferanten` (14, ERP) / `lieferant` (3, Einkauf) | zwei Module mit je eigener Tabelle | `lieferanten` (ERP); das Einkaufs-Modul liest weiter `lieferant` — Zusammenführung ist eine eigene Entscheidung |
| `bestellungen` (10, ERP) / `bestellung` (5, Einkauf) | wie oben | Schritt 3 |
| `kanzlei_frist` (Fristen-Modul) / `kanzlei_fristen` (Kanzlei-Seite) | zwei Seiten, je eigene Tabelle | Schritt 3/4 |
| `mitglieder` (Studio/Mitglieder) / `verein_mitglieder` (Verein) | zwei Module | GEMEINSAM (Bankdaten) |
| `import_laeufe` + `import_zeilen` / `import_jobs` | `import_laeufe` nur im alten CRM-Import, `import_zeilen` nirgends benutzt | Protokoll ist `import_jobs` |

**Türen:** Der CRM-Import (`/dashboard/crm/import`) bleibt für das Zusammenführen ähnlicher Kontakte und zeigt jetzt auf das Import-Center. Lieferanten- und Preislisten-Import sind KI-Aufräumer für Rohtext (Schritt 5) und bleiben; daneben führt „📥 Datei importieren“ auf den Motor.

## Nachtrag Paket 127 (Schritt 3 Rest, 27.09.2026)

| Datei | Ziel | Import jetzt |
|---|---|---|
| Qualifikationen / Schulungen | `mitarbeiter_qualifikation` (Dispo-Befähigungen) | ✅ Import-Center, nur Chef. Verknüpfung mit dem Mitarbeiter über Personalnummer (Eigenes Feld aus dem Mitarbeiter-Import), E-Mail oder genauen Namen. Bekannte Befähigungen (Elektrofachkraft, Ersthelfer, Hubarbeitsbühne …) werden auf die Dispo-Liste gebracht, alle anderen bleiben mit ihrem Namen. |
| Bestellungen mit Positionen | `bestellungen` + `bestellpositionen` (ERP-Bestellwesen) | ✅ Import-Center. Eine Zeile je Position, gleiche Bestellnummer = eine Bestellung; Lieferant aus `lieferanten`, Artikel über die Artikelnummer. |

**Entscheidung Bestellungen:** Führend ist das Bestellwesen im ERP (`bestellungen`/`bestellpositionen`, Lieferant aus `lieferanten`) — dort landen Lieferanten- und Artikel-Import, Nachbestellung und Wareneingang. Das Einkaufs-Modul (`bestellung`/`bestellung_position`, Lieferant aus `lieferant`) bleibt unverändert; eine Zusammenführung wäre eine eigene Entscheidung.
