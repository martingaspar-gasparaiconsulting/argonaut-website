# ARGONAUT · Altsysteme-Recherche (27.09.2026)

Grundlage fuer die Klick-Liste „Aus welchem System ziehen Sie um?" im Import-Center (Umzug Schritt 2/4).
Quelle: Hersteller-Hilfeseiten (sonst als Drittquelle markiert). Menuepfade und Spaltennamen NUR, wo belegt.
Uebersicht fuer Martin: Claude Doc „ARGONAUT · Ergaenzungsliste 27.09." https://claude.ai/code/artifact/0b46070d-8ec0-44cf-8f7f-418441b29c83

## Erkenntnisse fuer den Import-Motor
- DATEV-Format (Kopf `"EXTF"`) lesen deckt viele Systeme ab: FastBill, Debitoor, sevdesk, ToolTime, HERO, Plancraft, Candis, orderbird, Immoware24.
- Spaltenkoepfe haengen von der Sprache ab (HubSpot, Outlook, Doctolib) -> je Feld deutsche + englische Aliase.
- DATEV OPOS-Liste kommt als altes .xls (BIFF) -> Motor muss .xls lesen (exceljs kann nur xlsx!).
- Fuer die meisten Systeme sind Spaltennamen NICHT belegt -> je eine echte Beispieldatei noetig; bis dahin Erkennung ueber allgemeine Aliase.

## CRM
| System | Daten / Format | Export-Weg | Spalten (belegt) | Quelle |
|---|---|---|---|---|
| HubSpot | Kontakte, Firmen, Deals; CSV/XLSX/XLS | CRM › Objekt › Ansicht › Export (Board: Board options › Export view) | Record ID, First name, Last name, Email, Phone number, Mobile phone number, Street address, City, State/Region, Postal code, Country/Region, Company name, Job title, Contact owner, Lifecycle stage, Lead status, Create date (Koepfe werden uebersetzt!) | knowledge.hubspot.com/import-and-export/export-records · knowledge.hubspot.com/properties/hubspots-default-contact-properties |
| Pipedrive | Deals, Personen, Organisationen, Aktivitaeten, Produkte; CSV/XLSX | Kontomenue › Tools and apps › Export data; Listen: „… › Export filter results"; 28 Tage abrufbar | nicht belegt; eigene Felder kommen mit internen IDs als Kopf | support.pipedrive.com/en/article/exporting-data-from-pipedrive |
| Salesforce | alle Objekte, CSV im ZIP | Setup › Data Export › Export Now; alternativ Data Loader | API-Namen (z. B. Account.Name); Formelfelder fehlen | help.salesforce.com (sf.admin_exportdata.htm) |
| Zoho CRM | Module, CSV (200.000) / XLSX (50.000) | Setup › Data Administration › Export | – | help.zoho.com (export-crm-data) |
| Dynamics 365 | Tabelle/Ansicht als Excel | Befehlsleiste „Export to Excel" | – | learn.microsoft.com/power-apps/user/export-data-excel |
| CentralStationCRM | Personen, Firmen, Angebote, Projekte; Excel/vCard/ZIP | Zahnrad › Account-Einstellungen › Alle Daten exportieren | – | help.centralstationcrm.com/article/287 |
| weclapp | Kunden, Artikel, Belege | Globale Einstellungen › Import/Export › Assistent (Admin) | – | doc.weclapp.com (wie-kann-ich-meine-daten-exportieren) |
| Close | Leads, Kontakte, Chancen, Aktivitaeten; CSV/JSON | Leads › „…" › Export | – | help.close.com/docs/exporting-data |
| monday CRM | Board als Excel | Drei-Punkte › More actions › Export board to Excel | – | support.monday.com (26989749858578) |
| Brevo | Kontakte CSV (; oder ,) | CRM › Contacts › More actions › Export | EMAIL, FIRSTNAME, LASTNAME, LANGUAGE, LAST CHANGED, CREATION DATE | help.brevo.com (5310065850642) |

## Buchhaltung / Rechnung
| System | Daten / Format | Export-Weg | Spalten (belegt) | Quelle |
|---|---|---|---|---|
| DATEV Kanzlei-Rechnungswesen | Debitoren/Kreditoren im DATEV-Format (Kopf "EXTF"); OPOS als XLS | Stammdaten: Bestand › Exportieren › DATEV-Format › Reiter Stammdaten („Nur geaenderte Daten" abwaehlen). OPOS: Anwendungen › Auswertungen Rechnungswesen › OPOS › Drucker › Export xls; alternativ Bestand › Exportieren › ASCII | Konto, Name (Adressattyp Unternehmen), Unternehmensgegenstand, Name (Adressattyp natuerl. Person), Vorname (Adressattyp natuerl. Person), Adressattyp, Kurzbezeichnung, EU-Land, EU-UStID, Anrede, Strasse, Postfach, Postleitzahl, Ort, Land, Telefon, E-Mail, Internet, Fax | hilfe.candis.io (258513) · help.commitly.com (7032978) · manuals.dekodi.de (manueller_export_aus_datev) |
| Lexware Office | Kunden/Lieferanten CSV/vCard; Artikel CSV; Belege DATEV-ZIP | Kontakte › Liste › „…" oben rechts; Artikel „…"; Einstellungen › Export | Kundennummer, Lieferantennummer, Firmenname, Ansprechpartner bei Firma; Land als Kuerzel (DE) | help.lexware.de (548273) · hilfe.sevdesk.de (12683848) |
| Lexware faktura+auftrag / WaWi | Artikel, Kunden, Lieferanten; CSV ANSI ; | Datei › Export | "Kundennummer";"Anrede";"Name";"Vorname";"Firma" · "Artikelnummer";"Bezeichnung";"Kurzbezeichnung";"Warengruppe" · "Lieferantennummer";"Kreditorenkonto";"Matchcode" | guide.jtl-software.com/jtl-wawi/jtl-ameise/lexware/ |
| sevdesk | DATEV-kompatibles CSV-ZIP mit Belegen; Kontakte nur im DATEV-Stammdatenteil | Kontakt-Export-Pfad nicht belegt | – | hilfe.sevdesk.de (9373838) |
| Debitoor / SumUp Rechnungen | Rechnungen+Positionen, Gutschriften, Ausgaben, Zahlungen, Angebote, Kunden, Lieferanten, Produkte; CSV/XLSX/DATEV | Einstellungen › Profil › Datenexport | – | debitoor.de/tutorial/einstellungen/... |
| FastBill | Kunden, Produkte, Rechnungen; CSV/XLSX/XML; DATEV Deb/Kred | Import Export › Export als Excel/XML/CSV › Kundendaten | Kunden-Nr., Kundenart, Firmenname, Anrede, Vorname, Nachname, Adresse, Postleitzahl, Ort, Land, Telefon, E-Mail, USt-IdNr., Zahlungsziel, DATEV Debitorenkontonummer (aus Import-Beschreibung) | support.fastbill.com (360012777940, 225471187) |
| Billomat | Kunden, Lieferanten, Artikel, Belege; CSV/XML/JSON; Komplett-ZIP | Berichte/Exporte › Belegart; Komplett-Backup. Loeschung 6 Wochen nach Kuendigung | – | support.aifinyo.de (22629706660764, 22529244940444) |
| Candis | DATEV-nahe Exporte | Stammdaten-Pfad nicht belegt | – | hilfe.candis.io/de/collections/623430-export |
| BuchhaltungsButler | Einstellungen › Import & Export (Inhalt nicht belegt) | – | – | wissen.buchhaltungsbutler.de (11421251511965) |
| Papierkram | Kontakte CSV | Stammdaten › Adressbuch › „CSV" | – | hilfe.papierkram.de/adressverwaltung/ |
| easybill | Kunden CSV, Spalten waehlbar | Kontakte › Exportieren (Datei unter Hintergrundprozesse) | – | support.easybill.de (360001770099) |
| Collmex | Angebote/Auftraege/Rechnungen CSV (Collmex-Satzarten) | Verkauf › Liste › Exportieren | – | collmex.de/handbuch_pro.html |
| orgaMAX | Artikel, Interessenten, Kunden, Lieferanten, Preise, Auftraege, Rechnungen; Excel | orgaMAX › Daten-Export; Ansicht › Tabelle exportieren | – | info.orgamax.de/faq/datenexport |
| WISO MeinBuero | Kunden, Artikel, Lieferanten; Excel (nur sichtbare Spalten) | Web: Pfeil oben rechts; Desktop: Datei › Daten-Export › Kunden | KUNDENNUMMER, NACHNAMEFIRMA, STRASSE, PLZ, ORT, EMAIL | handbuch.meinbuero.de · guide.jtl-software.com/.../wiso/ |
| SAP Business One | Tabellen als Excel/Text/XML | Pfad nicht belegt (Drittquelle) | – | sap-b1-blog.com |

## Handwerk & Bau
| System | Daten / Format | Export-Weg | Quelle |
|---|---|---|---|
| Plancraft | nur Kontakte CSV; Rechnungen ZIP/DATEV | Kontakte › Symbol neben „Neuer Kontakt" › Kontakte exportieren | help.plancraft.com (382746) |
| Craftnote | Projekt-ZIP (Chat, Bilder, Dokumente) | Web-App › Projekt › Details › Daten exportieren | hilfe.mycraftnote.de (360023632271) |
| HERO | Kunden, Buchhaltung, Belege CSV/Excel/DATEV; Pfad nicht belegt | – | hero-software.de/features/stammdaten/daten-export |
| Taifun | Kunden Excel; Artikel als Datanorm (Zusatzmodul); Pfad nicht belegt | – | taifun-software.de |
| Moser MOS'aik | Projekte Excel („Analysieren"), Zeiten TIM-Datei | Zeiterfassung › Auswertungen › MOS'aik-Export | doku.mein-handwerker-app.de (103000269661) |
| openHandwerk | Mitarbeiter CSV | Einstellungen › Benutzer/Mitarbeiter › Benutzerdaten exportieren | wissensdatenbank.openhandwerk.de |
| ToolTime | Angebote, Rechnungen, Positionen, Kunden, DATEV, GoBD; CSV/XLSX/PDF (Inhaber-Rolle) | Dashboard › Datenexport | support.tooltime.de (4538822) |
| Nicht gefunden | Streit V.1, Label, TopKontor (Artikel nicht abrufbar), pds, Sander & Doll | – | – |

## Handel / Shop / Kasse
| System | Daten / Format | Export-Weg | Spalten (belegt) | Quelle |
|---|---|---|---|---|
| JTL-Wawi | Kunden, Artikel CSV (JTL-Ameise) | JTL-Ameise › Export › Kunden › Kundendaten | frei waehlbar | guide.jtl-software.com (kundendaten-exportieren) |
| Xentral | Adressen CSV/Excel | Verkauf › Adressen › Uebersicht (bis 1.000); gross: Import/Export Center | – | help.xentral.com (4499048021788) |
| Shopify | Kunden CSV (ab 50 per Mail) | Admin › Customers › Export | First Name, Last Name, Email, Accepts Email Marketing, Default Address Company, Default Address Address1, Default Address City, Default Address Zip, Default Address Country Code, Phone, Note, Tax Exempt, Tags | help.shopify.com (import-export-customers) |
| WooCommerce | Produkte CSV; Kunden ueber Analytics | Produkte › Alle Produkte › Export; WooCommerce › Analytics › Customers › Download | ID, Type, SKU, Name, Published, Short description, Regular price, Sale price, Stock, Categories, Tags, Images, Weight (unit); Kunden: Name, Email, Orders, Lifetime value, Last order | woocommerce.com (product-csv-importer-exporter, customer-analytics) |
| Shopware 6 | Kunden, Produkte, Kategorien, Bestellungen CSV UTF-8 ; | Einstellungen › Shop › Import/Export | Profile | docs.shopware.com (importexport) |
| PlentyONE | Artikel, Auftraege, Kontakte, Bestand | Daten › Daten exportieren | – | knowledge.plentyone.com |
| Billbee | Kunden | Kund:innen › Uebersicht › Export › Exportdatei erzeugen | – | hilfe.billbee.io (425) |
| Amazon Seller Central | Angebotsbericht TXT (Tab) | Inventory › Inventory Reports | item-name, seller-sku, price, quantity, asin1, fulfillment-channel | webretailer.com (Drittquelle) |
| eBay | Bestellungen, Angebote CSV | Seller Hub › Reports › Downloads | – | ebay.com/help (4096) |
| Lightspeed | Retail: Customers › Export list; eCom: Tools › Exports; Restaurant: Users › Customers › Export | – | – | lightspeedhq.com Support |
| ready2order | Kunden, Produkte, Umsaetze | Einstellungen › Datenexport › Stammdaten | – | support.ready2order.com |
| Gastrofix | Artikel CSV/XLS/PDF | Auswertung › Auswertung › Artikel | – | support.gastrofix.com |
| SumUp Kasse / orderbird | Artikelkatalog (SumUp, Inhalt nicht lesbar) / nur Umsatz- und Pruefer-Exporte (orderbird) | – | – | help.sumup.com · support.orderbird.com |

## Gastro & Hotel
| System | Daten | Export-Weg | Quelle |
|---|---|---|---|
| Mews | Gastprofile Excel | Menu › Profiles › Customer Profiles › Mode „Created" › Export | help.mews.com (4355037) |
| protel | Gaestekartei Text/dBASE (Mailing-Assistent) | Pfad nicht genauer belegt | help.protel.net |
| Apaleo | Import-Schema als Erkennungsvorlage: PropertyCode, FirstName, LastName, Email, Phone, AddressLine1, PostalCode, City, Arrival, Departure, Adults, PricePerNight | – | apaleo.zendesk.com (360008351139) |
| Quandoo | stellt laut Drittquelle ein (keine neuen Buchungen ab 30.09.2026, Abschaltung 31.12.2026); Gaeste-CSV nur auf Anfrage | – | restaurantbookingsystem.com (Drittquelle) |
| OpenTable | „Export your Guestbook" (Inhalt nicht ladbar) | – | support.opentable.com |
| Nicht gefunden | Hotelfriend; resmio nur Import | – | – |

## Gesundheit / Tier
| System | Daten | Export-Weg | Spalten | Quelle |
|---|---|---|---|---|
| Doctolib | Patientenbasis + Terminhistorie CSV/XLSX (Koepfe DE oder EN, nur Gesamtadmin) | Einstellungen › Weitere Einstellungen › Patientendaten › Exporte | Dateien export_patients-part-1.xlsx + export_rdv_[Start]-[Ende].xlsx (beide noetig) | doctolib.zendesk.com (204738165) |
| easyVET | Kunden, Tiere, Produkte | Datensaetze › Filter › AlleKunden/AllePatienten › Nummer ≥ 0 › exportieren | – | handbuch.debevet.de (Mitbewerber-Quelle) |
| Shore | Kunden CSV (Link per Mail) | Kunden › Pfeil neben „Optionen" | first_name, last_name, gender, email, mobile, birthday, Adressfelder, additional_attributes, tags | help.shore.com |
| Treatwell | Kunden CSV (unsicher, Drittquelle) | – | – | dothebeauty.com |
| Vetera | nur ueber Hersteller-Support | – | – | – |
| Nicht belegt | THEORG, Starke | – | – | – |
| RECHT | Patienten- und Tierakten erst nach Anwalt-Pruefung live schalten; xDT danach | | | |

## Verein / Bildung
| System | Daten | Export-Weg | Quelle |
|---|---|---|---|
| easyVerein | Mitglieder XLSX/CSV/PDF/vCard | Mitglieder › Export/Import | hilfe.easyverein.com (3382210) |
| ClubDesk | Mitglieder CSV (Forum) | Pfad nicht belegt | forum.clubdesk.com |
| Nicht belegt | WISO Mein Verein, Campai, Fahrschulcockpit | – | – |
| RECHT | Mitglieder mit IBAN/Mandat = GEMEINSAM-Regel (Bank) | | |

## Immobilien
| System | Daten | Export-Weg | Quelle |
|---|---|---|---|
| onOffice enterprise | Adressen, Immobilien, Aufgaben, Termine CSV (tagsueber max. 5.000) | Extras › Datenexport | de.enterprisehilfe.onoffice.com |
| FLOWFACT | alter CRM Performer: Adressliste › Excel-Band; neues FLOWFACT gesperrt | – | performer-service.flowfact.de |
| Propstack | JSON-Datendump ueber API (kostenpflichtig) | – | docs.propstack.de/reference/datendump |
| Immoware24 | Auswertungen CSV (Kontakte, Belegung, Mietvertraege, Kautionen, Zaehler, Zahlungen) | Export-Knopf in der Fusszeile | support.immoware24.de (360018128817) |
| DOMUS ERP | adressen.csv (ID, Name, Adresse, Postleitzahl, Stadt) | Berichte › Berichtsbaum › Bericht Nr. 900 | domus-software.de |
| Nicht belegt | Haufe PowerHaus / wowinex | – | – |

## Allgemein
| System | Daten | Export-Weg | Spalten | Quelle |
|---|---|---|---|---|
| Google Kontakte | CSV (Google/Outlook) oder vCard | Kontakte waehlen › Drei-Punkte › Exportieren | First Name, Last Name, Middle Name, Email 1 - Value, Phone 1 - Value, Address 1 - Street, Organization Name, Organization Title, Birthday, Notes, Labels | support.google.com/contacts (7199294) |
| Outlook-Kontakte | CSV (Koepfe in Outlook-Sprache: Vorname, Nachname, E-Mail-Adresse) | Klassisch: Datei › Oeffnen und Exportieren › Importieren/Exportieren › In Datei exportieren › CSV; Neu: Personen › Kontakte exportieren | – | support.microsoft.com |
| Google Kalender | ICS/ZIP | Einstellungen › Importieren & Exportieren › Exportieren | – | support.google.com/calendar (37111) |
| Outlook-Kalender | ICS | Kalender › Datei › Kalender speichern | – | support.microsoft.com |
| Excel | XLSX/CSV direkt | – | – | – |
