# ARGONAUT · Beschluss 12.10.2026: Branchen-Ampel, Freigabe-Zentrale, Anwalt

Stand 12.10.2026 · Gesprächs-Chat mit Martin (nur besprochen, nichts gebaut). Gilt ab sofort für Bauliste und Bau-Chats.

## 1. Reihenfolge (Martin, 12.10.)

1. **Alles fertig bauen**: Bauliste plus die neuen Pakete aus diesem Beschluss (Bauliste-Abschnitt „Stufe 3f · Ampel-Beschluss").
2. **Testtag**: Klicktests aus den Testtag-Sammlungen.
3. **Anwalt**: Erstgespräch mit allen 30 Fragen. Der erste Termin ist kostenlos; der Anwalt schätzt die Kosten und nennt möglichst einen Festpreis. Der Termin wurde wegen Krankheit des Anwalts verschoben.

## 2. Kernerkenntnis: Werkzeug bauen ≠ damit werben

- Der **Betrieb** ist Verantwortlicher für seine Daten und sein Branchenrecht. **ARGONAUT** ist Auftragsverarbeiter und liefert das Werkzeug (wie gängige CRM/ERP-Programme).
- Die 107 zurückgestellten Branchen wurden vor allem wegen der **Werbetexte** (Fachdossiers, UWG) zurückgehalten, nicht wegen der Funktionen.
- **Vorlagen-Prinzip:** Verträge, Mietbedingungen, Haftungsverzichte, Shop-AGB und Widerrufsbelehrungen hinterlegt der Betrieb selbst (schon so bei P291 Vermietung und P296 Trackday). Wo ARGONAUT eine Vorlage anbietet, ist sie ein **leeres Gerüst** mit dem Hinweis „durch Ihren Anwalt prüfen lassen".
- **Was ARGONAUT selbst automatisch tut, bleibt unsere Verantwortung**: Mailversand, Einwilligungen, KI-Auswertungen, öffentliche Seiten mit Pflichtangaben.
- Der Anwalt prüft deshalb nicht 313 Branchen, sondern **vier Kerndokumente**: AGB, AV-Vertrag (mit § 203-Klausel), TOMs, Datenschutzerklärung.

## 3. Branchen-Ampel (Claude-Einschätzung, keine Rechtsberatung)

| Ampel | Anzahl (von 107) | Umgang |
|---|---|---|
| 🟢 Jetzt bauen und bewerben | 69 | Fachpakete mit eigenen Vorlagen der Betriebe; Dossiertexte nur Gebautes |
| 🟡 Bauen, aber gesperrt | 27 | Gesperrt, bis der AV-Vertrag mit TOMs geprüft ist (Martin: „der muss sitzen") |
| 🔴 Partner/Zertifikat | 1 | Callcenter → KI-Telefonassistent (B2); Callcenter-Kunden nur mit Sonderbedingungen im Einzelvertrag |
| ⚫ → Standard | 10 | **Nicht ausgeschlossen** (Martin): nutzen die Grundausstattung, bekommen ein Standard-Dossier, keine Fachmodule (Vertriebshürde, kein Rechtsverbot) |

Damit ist **keine Branche ausgeschlossen**.

### Zuordnung der 107 Branchen

| Bereich | 🟢 | 🟡 | 🔴 | ⚫ → Standard |
|---|---|---|---|---|
| Bildung (8) | Berufsakademien, Fernschulen | Berufsförderungswerke, Berufskollegs, Kitas, Schulen, Waldkindergärten | | Universitäten |
| Dienstleistungen (14) | Bestatter, Haushaltshilfe-Vermittlung, Inkasso, Personalvermittlung, Personen-/Objektschutz, Veranstaltungssicherheit, Wachdienst, Schadensanierung, Tatortreinigung | Detektei, Hausnotruf, Babysitter-Vermittlung, Seniorenbetreuung | Callcenter | |
| Energie & Umwelt (6) | Altlasten, Emissionsschutz, ESG-Beratung, Sonderabfall | | | Stadtwerke, Netzbetrieb |
| Fahrzeuge (8) | Abgasanlagen, Drohnen, Autorecycling, Flugschule, Kfz-Gutachter, Motorradhandel, Nutzfahrzeughandel | | | Flugzeugwartung |
| Handwerk (2) | | Orthopädie-Schuhmacher, Zahntechniker | | |
| IT (6) | Datenrettung, DSB-Beratung, IT-Forensik, IT-Sicherheit, KI-Dienstleister, Kassensysteme | | | |
| Immobilien (3) | Franchise, Asset-Management, Wohnungsgenossenschaft | | | |
| Industrie (10) | Batterien, Brauerei, Chemie, Lebensmittelproduktion, Molkerei, Mühlen, Galvanik | | | Bergbau, Halbleiter, Luft- und Raumfahrt |
| Soziales & Öffentliches (18) | Genossenschaften, Stiftungen | Behindertenhilfe, Betreutes Wohnen, Familienberatung, Feuerwehr/Hilfsorganisationen, Jugendhilfe, Jugendzentren, Kirchen, Migrationsdienste, Nachbarschaftshilfe, Obdachlosenhilfe, Sozialpädagogik, Tafeln, Wohlfahrtsverbände | | Stadtverwaltung, Standesamt, Verkehrsbetriebe |
| Landwirtschaft (11) | alle 11 | | | |
| Logistik (10) | Abfalltransport, Gefahrgut, Tiertransport, Luft-/Seefracht, Schwertransport, Silo/Tank, Taxi, Werttransport, Zoll | Krankenfahrten | | |
| Medien (10) | Influencer, Influencer-Agentur, Booking, Marktforschung, Musik, Promotion, Gaming, Verlage | Casting, Model | | |
| Sport (1) | Schützenverein (Website-Ausschluss Waffen beachten, Martin entscheidet) | | | |

Die **206 gesperrten** Branchen: Handel, Gastro, Sport, Lebensmittel hängen nur an Kasse (TSE-Partner) und Shop (eigene Rechtstexte des Betriebs). Gesundheit und Recht brauchen die § 203-Klausel und stärkeren Schutz (🟡). Tiere sind fast alle 🟢.

## 4. Freigabe-Zentrale im Command Center (neu)

- Liste aller Schalter (heute im Code: `lib/startSperre.ts`, `lib/anwaltFreigabe.ts`, `lib/flags.ts`, Dossier-Sperren) mit Status, Grund und Anwalt-Frage.
- **Freigeben** nur mit Vermerk (Datum, welche Anwalt-Antwort); Code-Standard bleibt „aus", wenn die Datenbank nichts sagt.
- **Löschen = ausblenden**, mit **drei getrennten Schritten**: Klick → Rückfrage bestätigen → Namen eintippen. Ein Doppelklick löst es nie aus. Code bleibt, zurückholbar.
- Nur Betreiber mit Zwei-Faktor. Der Wächter-Test des Sperr-Gedächtnisses muss mit umziehen.

## 5. Anwalt

- Dokument „ARGONAUT Anwalt Erstgespräch" (Claude Doc): https://claude.ai/code/artifact/e3fa56f2-3b47-46fc-a440-17c59a0530a2 — 30 Fragen in sechs Themen (A Verträge/Datenschutz 10, B Werbung/Einwilligung 6, C KI 4, D Besondere Daten 4, E Shop/Websites 3, F Partner 3), Prio A (vor dem ersten Kunden, 18) und B (danach).
- Ersetzt für den Start die 137er-Liste in `ANWALT-RECHT\NEU-KOMPLETT`. Die alten Fragen bleiben als Hintergrund; viele entfallen durch das Vorlagen-Prinzip.
- **Kostenrahmen:** 2.000 € netto (Vorsteuer abziehbar). Festpreis je Paket A/B oder Stundenabrechnung mit Obergrenze und Rückmeldung vor Überschreitung. Budget steht bewusst nicht im Dokument.
- **Vor dem Termin liefern:** Systembeschreibung (2 Seiten), AGB-, AV-Vertrag-, TOM-Entwurf, Datenschutzerklärung und Impressum, Werbe-Fuß und Einwilligungstexte (Basis eRecht24 Premium).
- **Martin selbst vorher (ohne Anwalt):** Zwei-Faktor einrichten; AV-Verträge der Anbieter abschließen (Supabase, Vercel, Resend, Anthropic, Voyage); Voyage-Training widersprechen; Supabase-Region bestätigen. **Claude baut:** Datei-Sicherung des Speichers (heute nur Datenbank gesichert).
- Die TOMs müssen stimmen: Was dort steht, muss wirklich laufen.
- Erster Kunde: Kfz passt (Fahrzeugbörse ggf. bis zur Klärung von E3 aus); Gastro nur ohne ARGONAUT-Kasse bis zum TSE-Partner.
- Ehrlich: Eine Garantie „nur zwei, drei Sätze" gibt es nicht; beim AV-Vertrag (USA-Übermittlung, § 203) sind Änderungen wahrscheinlich.

## 6. Weitere Ergebnisse dieses Gesprächs

- **Multiplikator-Branchen:** `docs/strategie/ARGONAUT-MULTIPLIKATOR-BRANCHEN-12-10-2026.md` (Rangliste 1–13, Hausverwaltungen je Landkreis, Bauliste EK1).
- **Partner-Netzwerk:** hängt seit P303/P304 auch an Projekten, Aufträgen und Objektzeiten, nicht nur am Fahrzeug (Korrektur zu EK1).
- **Bäder** (Schwimmbad/Therme/Erlebnisbad, Sauna/Badehaus): nur Branchenseiten, kein Dossier, keine Fachfunktionen. Webseite verspricht „Auslastung in Echtzeit" und „Kasse, Sauna, Gastro in einem System" → Texte zurückschneiden (Kontrollgang). Fehlend: Eintritt/Drehkreuz, Saison- und Wertkarten, Besucherzählung, Wasserqualität, Badeaufsicht, Aufgussplan. Kommunale Bäder schwer (Ausschreibungen), private Thermen interessant.

## 7. Aufwand (Schätzung)

| Block | Pushes | SQL |
|---|---|---|
| Bauliste bisher offen | 42 | ca. 15–20 |
| Stufe 3f (dieser Beschluss) | ca. 35 | ca. 15 |
| Optional: Dossiertexte für die 206 gesperrten, gesperrt vorgeschrieben | ca. 23 | 0 |
