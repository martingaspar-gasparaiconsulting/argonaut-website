# ARGONAUT · Übergabe aus dem Chat „Kfz-Pilot / Luxus-Autohaus" (06.10.2026 abends)

Diese Datei ist für den Dossier-Chat und alle Folge-Chats. Sie fasst zusammen, was in diesem Chat beschlossen wurde.
Mit dem nächsten _pNN gezielt committen (`git add docs/ARGONAUT-UEBERGABE-KFZ-PILOT-06-10-2026.md`).

## 1. Martins Reihenfolge (Stand 06.10.2026 abends)

1. **Heute:** Fachdossiers fertig machen (Dossier-Chat, ab P241 Fahrzeuge Welle 2).
2. **Alles, was auf den Anwalt wartet, in der Bauliste nach unten setzen.** Gebaut wird zuerst, was ohne Anwalt geht.
3. **Alles bauen, was bald mit externen Partnern geht, inklusive aller Zugänge/Schnittstellen.** Getestet wird später mit dem ersten echten Kunden (siehe 3.).
4. **Morgen (07.10.):** Stufe 3b Kfz-Pilot komplett starten und durchziehen. Martin will es **zuerst visuell sehen**, also vor K1 ein anklickbares Muster von Bestand, Handelsakte und Chef-Blick.
5. **Testtag kommt bald.** Martins Freundin spielt im Durchlauf die Mitarbeiterin (sie arbeitet sonst regulär, Termin passt).
6. **Wartet:** Voice Layer (Paket 188/189), weil Martin erkältet ist und die Stimme warten muss. Alles andere darf vorgezogen werden.
7. **Offen, aber bald:** neues Logo (L1), Datensicherheit und Zugänge, KI-Telefonassistent (B2).

## 2. Schnittstellen: Martins Entscheidungen

| Thema | Entscheidung |
| --- | --- |
| Bank-API | Kostenlose Bank-/Konto-API kommt bald dran |
| Kasse/TSE | Anbindung an die echte TSE bauen. Der erste echte Kunde mit Kasse bringt seine TSE mit und wird **Pilot**: Er bekommt das offen gesagt und einen kleinen Rabatt im ersten Monat, bis alles fertig eingerichtet ist |
| DATEV | DATEV Connect bleibt wie geplant. Bis dahin nur Datei-Export und direkte Übergabe an den Steuerberater. **Martin muss den Zugang noch beantragen** |
| Shop- und Versandschnittstellen | Alle Schnittstellen jetzt fertig bauen. Echter Betrieb erst nach den ersten Kunden |
| Grundsatz | Tests laufen über den echten Kunden. Wir sagen ihm **offen und ehrlich**, dass es bei der Übermittlung noch Fehler geben kann |

## 3. Stufe 3b · Kfz-Pilot

- **Ziel:** Den vollen Funktionsumfang der Kfz-Händlersoftware (two Sales, APS Sales, Car Ranking Plus u. a.) nachbauen und übertreffen, vom Gebrauchtwagenhändler bis zum Luxushaus. Martin will gegen Mitbewerber-Videos werben können (Platzierung ja, Mitbewerber-Namen nie).
- **Bauplan (Claude Doc):** „ARGONAUT Bauplan Kfz-Handel", https://claude.ai/code/artifact/ecaaa20f-21d0-4705-a957-f1c0f3170fc4. Enthält Screenshot-Befund, Modul- und Preisrecherche, Code-Abgleich, Pakete und Rechtsfragen.
- **Bauliste:** Artifact X2y63fejjA6Qi6pSyxZP8T, Version 50, neue Sektion „Stufe 3b · Kfz-Pilot" (id `kfz`). Stand: 37 Pushes offen, 49 von 86 erledigt (57 %).
  **docs/bauliste/ im Repo ist noch NICHT angeglichen.** Beim nächsten Bauliste-Push nachziehen. Dabei auch die Anwalt-Pakete nach unten setzen (Punkt 1.2).
- **Umfang nach Code-Abgleich:** 16 Pakete, 20 Pushes, 12 SQL-Blöcke, etwa 10 Blöcke à 2 Std.

| Paket | Inhalt | Baut auf | Pushes | SQL |
| --- | --- | --- | --- | --- |
| K1 Fahrzeugbestand | Handelsbestand: Liste/Karten, Status, Sparten, Kennzeichen, Standtage-Ampel, Massenbearbeitung, gespeicherte Suchen, Listendruck, FIN-Verknüpfung | Standorte, Eigene Felder | 2 | 1 |
| K2 Handelsakte | Reiter, Ausstattung, Farbcode, Dokumente, Historie, Preisverlauf, Inserats-Ampel, Titel-Wächter, CO₂-Felder | Fahrzeugakte | 1 | 0 |
| K3 Fotos und Medien | Handy-Upload mit Schablone, Reihenfolge, Video | Foto-Markierung | 1 | 1 |
| K4 Ankauf und Bewertung | Ankaufsprotokoll, Schäden am Foto, Schadenskalkulation, Inzahlungnahme, Ankaufschein, Online-Ankaufformular | Foto-Markierung | 2 | 1 |
| K5 Kalkulation und Provision | Plan-/Nachkalkulation je Fahrzeug, Standkosten, Provision Verkäufer und Hereinnehmer, Kommission | Provisionen | 1 | 1 |
| K6 Verkaufsunterlagen | Angebot, Kaufvertrag, Reservierung, Anzahlung, Zulassungsvollmacht; Unterschrift über ARGONAUT-Sign; GwG-Hinweis ab 10.000 € bar | Angebote, Signaturen, GwG | 1 | 1 |
| K7 Rechnung Fahrzeugverkauf | § 25a, Regelsteuer, EU, Ausfuhr, E-Rechnung; **getrennt liefern (Kern-Geld)** | Rechnungen | 1 | 1 |
| K9 Probefahrt und Vorführwagen | Probefahrt-Vertrag, Führerschein, km, Ersatzwagen, Überführung, rote Kennzeichen | Fuhrpark, Verleih | 1 | 1 |
| K10 Leads und Suchaufträge | Anfrage am Fahrzeug, Verantwortlicher, Fälligkeit, Suchaufträge mit Treffer-Hinweis | Leads, CRM | 1 | 1 |
| K11 Börsen und Online-Auftritt | mobile.de, AutoScout24, TruckScout24, eigene Fahrzeugbörse, Google-Fahrzeuganzeigen, Exposé, Diskretions-Link | Marktplätze, Web-Baukasten | 2 | 1 |
| K12 Markt und Preis | Marktposition, regelbasierter Preisvorschlag nur aus lizenzierten Daten (KEINE KI-Schätzung), Standzeit, Klicks/Leads, Inseratsqualität | K1, K11 | 2 | 1 |
| K13 Brief-Tresor und Aufbereitung | ZB II, Schlüssel, Zulassungsauftrag, Aufbereitung als interner Werkstattauftrag | Werkstatt | 1 | 1 |
| K14 Chef-Blick Kfz | Kacheln mit Vorjahr, Ertrag je Marke/Preisklasse, Rangliste, Zulauf, Summen-Wächter | Chef-Blick, Report-Baukasten | 1 | 0 |
| K15 Kunden-Werkzeuge | Kaufstatus im Portal, Finanzierungs-Beispielrechner, Konfigurator | Portal plus | 1 | 1 |
| K16 Umzug und Schnittstellen | Kfz-Altsysteme im Import, FIN-Abfrage DAT/Schwacke, DATEV-Fahrzeugkonten | Import-Motor | 1 | 0 |
| K17 Kfz-Schaufenster | Musterbetrieb mit Handelsbestand, Kfz-Fachdossier | Musterbetrieb XXL | 1 | 0 |

K8 (GwG) entfällt, weil das Modul schon steht: /dashboard/kfz/gwg.

### Schon im Code (geprüft 06.10.2026)
- Werkstatt-Board (/dashboard/werkstatt): Kostenvoranschlag mit Kundenfreigabe, GoBD-Log, Bühnen-Buchung
- Fahrzeugakte (/dashboard/fahrzeugakte): Tabellen werkstatt_fahrzeuge und werkstatt_fahrzeug_halter_log, lib/fahrzeugAkte.ts
- Kfz-Fachpaket (/dashboard/kfz): kfz_fahrzeuge (HU/AU), kfz_reifeneinlagerung (supabase-sql/buendel18-kfz.sql)
- Schadenabwicklung (/dashboard/kfz/schaden, lib/kundenVorgaenge.ts) · GwG (/dashboard/kfz/gwg)
- ARGONAUT-Sign (/dashboard/signaturen) · Provisionen (lib/provision.ts, nur aus Deals) · Fuhrpark (lib/fuhrparkGeraete.ts) · Verleih
- Kundenportal plus (lib/kundenPortalPlus.ts) · Foto-Markierung (lib/fotoMarkierung.ts) · Musterbetrieb XXL mit Werkstatt/Kfz
- Marktplätze (lib/marktplatz.ts): nur Amazon, eBay, Kaufland, OTTO; Abgleich „in Aufbau"
- Exposé (lib/expose.ts): nur Immobilien (GEG)
- **Fehlt komplett:** Handelsbestand, § 25a (nirgends im Code), Kfz-Altsysteme in lib/altsysteme.ts

### Befund für den Kontrollgang
Es gibt zwei Kundenfahrzeug-Tabellen (kfz_fahrzeuge und werkstatt_fahrzeuge) plus den Fuhrpark. Der Handelsbestand bekommt eine eigene Tabelle, wird aber **über die FIN mit werkstatt_fahrzeuge verknüpft** (keine vierte Insel). Ein verkauftes Fahrzeug landet in der Lebensakte.

### Partner-only (nicht im Pilot)
Herstellersysteme (VDH, KOSY, GeWaTo, JAVS, Kia, Skoda, Opel), Bank-Finanzierungsschnittstellen (Partner Connect, BDK, Mercedes-Benz Bank), Telefonanlage (hängt an B2), Outlook-Abgleich, 360°-Aufnahmen, automatisches Freistellen.

### Rechtsfragen (Anwalt-Liste R45, in docs/intern/anwalt-werkzeug/daten.py nachtragen)
§ 25a/Ausfuhr (auch Steuerberater) · Kaufvertrag Verbraucher/Unternehmer, Gewährleistung § 476 BGB · Ankaufschein · einfache E-Signatur ausreichend? · Probefahrt-Haftung und Führerscheinfoto · rote Kennzeichen/Fahrzeugscheinheft · GwG 10.000 € bar · Pkw-EnVKV CO₂-Angaben · Titel-Wächter (UWG) · Finanzierungsrechner PAngV, keine Vermittlung · Marktdaten nur lizenziert · Suchaufträge/Einwilligung · Verkäufer-Rangliste = Leistungskontrolle · Gegen-Werbung ohne Mitbewerber-Namen (§ 6 UWG).

### Preise der Mitbewerber (nur intern, nie nach außen)
two Sales nennt keine Preise. APS Sales XL: 298 € je Standort + 1,50 € je Fahrzeug, einmalig 9.790 €. Car Ranking Plus Gold (101–250 Fzg.): 500 €/Monat, 24 Monate Laufzeit. E-Signatur: 50 €/Monat + 1.400 €. autaxo: 49–149 €/Monat.
Beispiel Händler mit 125 Fahrzeugen: rund 1.035 €/Monat + rund 13.000 € einmalig. ARGONAUT liegt für denselben Betrieb höher. Vertriebsargument ist deshalb die Gesamtrechnung (Werkstatt, Buchhaltung, Personal, Marketing, Webseite inklusive), nicht der Einzelpreis.

## 4. Nächster Schritt im Kfz-Chat (morgen)
1. Startprompt + diese Datei lesen, Bauliste mitnehmen.
2. Anklickbares Muster Bestand / Handelsakte / Chef-Blick im ARGONAUT-Look (Navy #0A1628, Gold #C9A84C, DM Sans) als Artifact, Martin segnet das Aussehen ab.
3. Danach K1: zuerst kfz_fahrzeuge, werkstatt_fahrzeuge und Standorte per information_schema prüfen, dann SQL + _pNN.
