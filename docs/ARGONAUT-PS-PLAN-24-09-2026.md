# ARGONAUT · Paket PS · Branchen-Blätter (B21) — Bauplan

Stand 24.09.2026 nachts. Quelle: Artifact „ARGONAUT Büro-Landkarte", Reiter „19 Branchen" (Spalte „Fehlt noch").
Vorher erledigt durch PA–PR: Handwerk & Bau komplett (PI, PE, PH), Ausfallhonorar + Einwilligungen (PQ), Formular-Vorlagen (PL), Kassen-Meldung + Barrierefreiheit (PR).
Partner-Punkte bleiben draußen (Marktplätze live, Buchungsportale, Lenk-/Ruhezeiten/Fahrerkarte, Monitoring, beA, Kassenabrechnung, Ersatzteil-Bestellung).

Regel für jedes Unterpaket: zuerst Bestand am Code prüfen (Modul der Branche frisch stagen), dann EINE Logik-Datei mit Tests,
Seite als Unterpfad des Branchenmoduls (erbt die Freigabe), SQL additiv/idempotent, eigene _pNN.bat. Fristen/Beträge aus Gesetzen vorher per Websuche prüfen.

| Paket | Inhalt | Branchen | Andockpunkt |
|---|---|---|---|
| PS1 Meldungen & Register | Katalog-Erweiterung im Nachweis-Motor (PE): Verpackungsregister LUCID (Datenmeldung), Künstlersozialabgabe (Meldung bis 31.03., Satz prüfen), Marktstammdatenregister + Netzbetreiber-Anmeldung, Agrarantrag-Frist, AZAV-Zulassung, Intrastat-Schwelle, Stiftung EAR. Vorschläge je Kategorie | Handel, Marketing, Energie, Landwirtschaft, Bildung, Industrie | lib/nachweisMotor.ts, /dashboard/nachweise |
| PS2 Qualität & Rückverfolgung | Reklamation mit 8D-Bericht, Lieferanten-Bewertung, Lebensmittel-Rückruf über Chargen, MHD-Warnung im Lager, HACCP-Temperaturprotokoll (Startvorlage im Formular-Baukasten), Gefahrstoffverzeichnis | Industrie, Lebensmittel, Gastro | Chargen, ERP/Lager, lib/formularBaukasten.ts |
| PS3 Vorgänge mit Kunden | Retouren-Ablauf (Shop), Schadenabwicklung mit Versicherern (KFZ), SLA-Bericht (IT), Nachkauf-Erinnerung (Beauty), Impf-Erinnerung an Halter (Tiere) | Handel, Fahrzeuge, IT, Sport/Beauty, Tiere | Shop, KFZ, IT & MSP, Erinnerungen, Tier |
| PS4 Versammlungen & Objekte | EIN Versammlungs-Motor: Eigentümerversammlung + Mitgliederversammlung (Einladung mit Frist, Tagesordnung, Protokoll, Beschlüsse). Mieter-Schadensmeldung, Indexmiete/Mieterhöhung-Rechner, Kautionen, Verwendungsnachweis Fördermittel, Ehrenamtsstunden | Immobilien, Verein | Immobilien, Verein, Fördermittel |
| PS5 Gebühren & Honorare | Rechner RVG/StBVV (Kanzlei), GOT (Tiere), Dozentenhonorare + Teilnahmebescheinigungen (Bildung), Trinkgeld-Verteilung (Gastro), Kündigungsfristen und Check-in Mitglieder (Sport) | Recht, Tiere, Bildung, Gastro, Sport | Kanzlei, Tier, Bildung, Gastro, Mitglieder |
| PS6 Papiere & Identifizierung | Meldeschein + Kurtaxe (Gastro), CMR-Frachtbrief + Maut-/Tankkarten-Abgleich (Logistik), GwG-Identifizierung (Recht, Immobilien, KFZ ab 10.000 € bar), Nutzungsrechte (Agentur), Düngebedarf/Stoffstrombilanz nur als Fristen-Erinnerung | Gastro, Logistik, Recht, Immobilien, Fahrzeuge, Marketing, Landwirtschaft | Gastro, Logistik, Kanzlei, Agentur |

Bewusst NICHT in PS: „Verordnungen verwalten" (Gesundheit) — das sind Art.-9-Daten mit Kassenbezug, gehört zu H04/H05 nach dem C5-Testat.
