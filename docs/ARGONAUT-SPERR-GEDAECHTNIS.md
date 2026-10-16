# ARGONAUT · Sperr-Gedächtnis

Was ist abgeschaltet, gesperrt, nur teilweise frei oder bewusst zurückgehalten, und was muss man beim Wiederöffnen **alles** mitziehen?

Diese Datei ist die eine Quelle dafür. Ein Wächter-Test (`tests/sperrGedaechtnisP224.test.mjs`) vergleicht die Zeilen `SCHALTER …` unten mit dem Code. Wird ein Schalter umgelegt, ohne dass diese Datei angepasst wird, wird der Test rot und der Push bricht ab. Kommt ein neuer Schalter dazu, ohne hier zu stehen, wird er ebenfalls rot.

Die Nummern in Klammern (z. B. **2.01**) sind die Fragen der Anwalt-Liste „ARGONAUT Rechtliche Prüfung" (Ordner `ANWALT-RECHT\NEU-KOMPLETT`).

---

## So wird ein Bereich wieder geöffnet (immer dieselben 8 Schritte)

1. **Antwort ablegen.** Die schriftliche Antwort des Anwalts bzw. der Steuerberatung zur Frage im Ordner `ANWALT-RECHT` ablegen.
2. **Texte einbauen.** Jeder gelieferte Wortlaut kommt an genau eine Stelle im Code (siehe „Mitziehen" je Bereich).
3. **Schalter umlegen.** Schalter im Code auf `true` bzw. „an".
4. **Diese Datei anpassen.** Die Zeile `SCHALTER …` auf `an` setzen. Sonst stoppt der Wächter-Test den Push.
5. **AGB, Datenschutzerklärung und AV-Vertrag** ergänzen, wenn der Bereich neue Empfänger oder Daten bringt.
6. **Werbung nachziehen.** Fachdossiers (`lib/dossierFreigabe.ts`, `lib/fachdossier.ts`), Website, Flyer: erst jetzt dürfen sie den Bereich nennen.
7. **Klicktest.** Den Bereich einmal echt durchklicken (Testtag-Liste).
8. **Bauliste** und dieses Gedächtnis auf „live" setzen.

## Freigabe-Zentrale im Command Center (seit Paket 345)

Alle Schalter dieser Datei stehen im Command Center unter **Freigabe-Zentrale** (`/admin/command-center/freigaben`, `lib/freigabeZentrale.ts`, Tabellen `freigabe_schalter` und `freigabe_protokoll`, SQL p345). Nur der Betreiber mit eingerichteter und bestätigter Zwei-Faktor-Anmeldung.

- **Freigeben** nur für Start-Schalter und Import-Sperren, nur mit Vermerk (mind. 20 Zeichen), Datum der Anwalt-Antwort und Haken „Mitziehen beim Öffnen erledigt" (Schritte 2, 5 und 6 oben). Jede Änderung landet unveränderbar im Protokoll.
- **Seit Paket 346 wirkt eine Freigabe** (A0 Teil 2): Wirksam frei = Schalter im Code an **oder** in der Freigabe-Zentrale freigegeben. Server: `lib/freigabeServer.ts` (liest `freigabe_schalter` mit der Service-Rolle, 60 Sekunden Zwischenspeicher, nach jeder Änderung sofort neu auf dem Server der Zentrale). Seiten im Dashboard: `lib/useFreigabeStand.ts` über `/api/freigaben/stand`. Regel in `lib/freigabeStand.ts`.
- **Jeder Fehler = gesperrt.** Fehlt die Tabelle, ist die Datenbank nicht erreichbar oder kommt Unsinn zurück, gilt der Code-Stand. Unbekannte Schlüssel öffnen nichts.
- **Wieder sperren** in der Zentrale wirkt genauso schnell. Ein freigegebener Schalter lässt sich nicht ausblenden — erst sperren.
- Mit einer Freigabe in der Zentrale entfallen die Schritte 3 und 4 (Code und `SCHALTER`-Zeile bleiben „aus"). Wer dauerhaft im Code öffnen will, geht die 8 Schritte wie bisher; danach kann die Freigabe in der Zentrale bleiben.
- **Code-Standard bleibt „aus".** Die Zeilen `SCHALTER …` unten beschreiben den Code, nicht die Datenbank. Neue Prüfstellen IMMER mit dem wirksamen Stand (`startFreiServer`, `ladeFreigabeStand`, `useFreigabeStand`) — der Test `tests/freigabeWirksamP346.test.mjs` wird sonst rot.
- Neue Start-Schalter oder Import-Bereiche brauchen zusätzlich einen Eintrag in `START_INFO` bzw. `IMPORT_INFO` (`lib/freigabeZentrale.ts`) — der Test `tests/freigabeZentraleP345.test.mjs` wird sonst rot.
- **Ausblenden** (statt Löschen) in drei getrennten Schritten: Klick → Rückfrage → Namen eintippen. Der Schalter im Code bleibt.

---

## 1 · Start-Schalter (`lib/startSperre.ts`, `START_FREIGABE`)

Technisch aus, nicht nur ein Hinweisschild. Unbekannte Bereiche gelten als gesperrt.

SCHALTER startSperre.shop = aus
SCHALTER startSperre.kiBeraterFremd = aus
SCHALTER startSperre.fernhilfe = aus
SCHALTER startSperre.whatsappWerbung = aus
SCHALTER startSperre.gefahrstoffShop = aus
SCHALTER startSperre.gewerbeNachweis = aus
SCHALTER startSperre.sdbVersand = aus
SCHALTER startSperre.betriebsanweisung = aus
SCHALTER startSperre.zusammenlagerung = aus
SCHALTER startSperre.reifePreisTreppe = aus
SCHALTER startSperre.vorbestellShop = aus
SCHALTER startSperre.adrPapier = aus
SCHALTER startSperre.metallzuschlag = aus
SCHALTER startSperre.cookieMessung = aus
SCHALTER startSperre.foerderantrag = aus

| Bereich | Was ist aus | Wo im Code | Anwalt-Fragen | Mitziehen beim Öffnen |
|---|---|---|---|---|
| **Webshop** (`shop`) | Bestellungen über Kunden-Websites | `app/api/oeffentlich/shop-bestellung`, `app/dashboard/shop`, `lib/webBloecke.ts` | 2.01–2.04, 2.20, 2.30–2.34 | Widerrufsbelehrung, Bestellbestätigung, Versandkosten/Lieferzeit, Shop-AGB, Retouren-Texte, Datenschutz-Baustein „Shop" (1.67), Steuersätze (S.13). **Zahlung bleibt getrennt** (`ZAHLUNG_LIVE`, Abschnitt 3). Danach die 🟡-Teilbereiche der Dossiers prüfen (Abschnitt 4). |
| **KI-Berater auf fremden Websites** (`kiBeraterFremd`) | Berater auf Adressen außerhalb der ARGONAUT-Websites; auf eigenen `/p/`-Seiten läuft er | `app/api/oeffentlich/chat`, `app/dashboard/webseiten` | 2.06, 2.35, 2.52 | AGB-Klausel Aufpreis/Mengengrenze (1.53), Passage für die Datenschutzerklärung des Betriebs, Bestätigung vor Freigabe einer fremden Adresse, AV-Vertrag (1.54). |
| **Fernhilfe** (`fernhilfe`) | Bildschirm teilen mit Betreiber oder Chef | `app/api/fernhilfe`, `app/dashboard/layout.tsx` (Knopf) | 2.51 | Hinweis in Datenschutzerklärung und AV-Vertrag (Live-Bild, keine Speicherung, Google-STUN erfährt IP), ggf. TURN-Server für Firmennetze. |
| **Gefahr-Angaben im Shop** (`gefahrstoffShop`, Paket 325/326) | Anzeige von Piktogrammen, Signalwort, H-/P-Sätzen, UN-Nummer und UFI am Shop-Produkt und vor dem Bestellknopf; Pflegen und Bestätigen unter Shop → Gefahr-Angaben geht schon | `lib/shopGefahr.ts`, `app/dashboard/shop/gefahrstoffe`, `app/api/shop/gefahr-auslesen`, Anzeige `app/api/oeffentlich/shop-produkte` + `public/shop.js` (Paket 326) | R49 (Haftung für abgelesene Angaben, CLP Art. 48 Abs. 2 Fernabsatz) | Hinweis in den Shop-AGB „Angaben aus dem SDB des Herstellers“, offizielle GHS-Piktogramm-Grafiken einbinden, S3b/S5/G2b/G2c gemeinsam prüfen. |
| **Nur Gewerbekunden** (`gewerbeNachweis`, Paket 327) | Der Schalter „Nur an geprüfte Geschäftskunden verkaufen“ wirkt nicht (Shop bleibt für alle); Nachweise (USt-IdNr., Gewerbeanmeldung, Handelsregister) erfassen und als geprüft markieren geht schon | `lib/shopGewerbe.ts`, `app/dashboard/shop/geschaeftskunden` (Reiter Preis-Basis & Schalter), `app/api/oeffentlich/shop-bestellung`, `app/api/oeffentlich/shop-produkte`, `public/shop.js` | R49 (ChemVerbotsV § 8 Abgabe nur an Wiederverkäufer/berufsmäßige Verwender mit Identitätsprüfung; REACH Anhang XVII) | Klären, ob Formprüfung + BZSt-Vermerk + Kundenlink genügen oder eine Identitäts-/Verwendungszweckprüfung je Bestellung nötig ist; ggf. Artikel-genauer Schalter statt shopweit. |
| **SDB mit der Bestellbestätigung** (`sdbVersand`, Paket 328) | Sicherheitsdatenblätter hängen nicht an der Bestellbestätigung, kein Nachweis-Eintrag, Nachversand-Knopf gesperrt | `lib/sdbVersand.ts`, `app/api/oeffentlich/shop-bestellung`, `app/api/shop/sdb-nachversand`, `app/dashboard/shop/gefahrstoffe` | R49 (REACH Art. 31 Abs. 8/9: Form „elektronisch per Mail-Anhang“ genügt? Nachweis ausreichend? Nachversand an Empfänger der letzten 12 Monate) | Datenschutz: Empfänger-Mail im Nachweis (Aufbewahrungsfrist klären), Hinweis in der Bestellbestätigung. |
| **Betriebsanweisung freigeben** (`betriebsanweisung`, Paket 329) | Freigabe-Knopf gesperrt, Druck immer mit „ENTWURF“; Entwürfe anlegen und speichern geht | `lib/betriebsanweisung.ts`, `app/dashboard/nachweise/gefahrstoffe/[id]/betriebsanweisung` | R49 (Haftung: Vorbefüllung aus SDB-Wortlaut, Aufbau TRGS 555, keine eigenen Mustertexte — reicht das?) | Hinweis „Entwurf ersetzt keine Gefährdungsbeurteilung“ prüfen; Unterweisung (§ 14 Abs. 2 GefStoffV) bleibt in Nachweise. |
| **Zusammenlagerungs-Ampel** (`zusammenlagerung`, Paket 330) | Ampel je Lagerplatz im Gefahrstoffverzeichnis wird nicht angezeigt; Lagerklasse und Lagerplatz erfassen geht | `lib/zusammenlagerung.ts`, `app/dashboard/nachweise/gefahrstoffe` | R49 (Haftung bei falscher Ampel; Tabelle aus Abbild der TRGS 510 abgelesen) | Tabelle Zelle für Zelle mit der amtlichen TRGS 510 (Abschnitt 13) abgleichen, Bedeutung der Spalten 10*–13* klären, Wortlaut der Bedingungen 1–8 einbauen, Kleinmengen-Regel (400 kg/200 kg) ergänzen. |
| **Preis-Treppe Reife/MHD** (`reifePreisTreppe`, Paket 341) | Preisschild druckt nur mit „ENTWURF“ und ohne Streichpreis; Stufen einrichten und „Preis heute“ intern ansehen geht (nur Geschäftsleitung und „Darf abrechnen“) | `lib/reifeTreppe.ts`, `app/dashboard/lebensmittel/reife/ReifeKalkBox.tsx` | R51 (PAngV § 11 Abs. 4: Ausnahme vom 30-Tage-Tiefstpreis bei drohendem Ablauf der Haltbarkeit — greift sie für MHD-Abschläge? Grundpreis § 4 bei loser Ware; Aufschlag nach Reifedauer als Preisänderung zulässig?) | Wortlaut „reduziert wegen kurzer Haltbarkeit“ prüfen; Verkauf nach MHD (kein automatischer Preis) als Hinweis in Hilfe/AGB; Preisschild-Pflichtangaben (Verkehrsbezeichnung, Herkunft bei Fleisch) mit LMIV/Etiketten abgleichen. |
| **Vorbestellung im Shop** (`vorbestellShop`, Paket 343) | Vorbestell-Aktionen und Vormerkliste erscheinen nicht im Shop, die Schnittstelle `oeffentlich/vorbestellung` lehnt ab (403); Aktionen mit „im Shop zeigen“ vorbereiten und die Bereitschaft (Artikel, Preis, Einheit, LMIV-Pflichtangaben) prüfen geht. Wirkt nur zusammen mit `shop`. | `lib/vorbestellShop.ts`, `lib/vorbestellShopServer.ts`, `app/api/oeffentlich/vorbestellung`, `app/api/oeffentlich/shop-produkte` (Feld `vorbestellung`), `public/shop.js`, `app/dashboard/lebensmittel/vorbestellung` | R52 (Einwilligung Vormerkliste, Löschfrist), R53 (Vorbestellung im Fernabsatz: Widerruf bei verderblicher Ware § 312g Abs. 2 Nr. 2 BGB, Knopf „Zahlungspflichtig vorbestellen“ § 312j, Eingangsbestätigung § 312i, LMIV Art. 14 Pflichtangaben vor dem Kauf, Endpreis nach Gewicht/PAngV) | Widerrufsbelehrung bzw. Ausschluss-Hinweis für verderbliche Ware in den Shop-Rechtstexten; Wortlaut der Einwilligung (`EINWILLIGUNG_WORTLAUT`) und der Bestätigungs-Mails (`vbMailTexte`) nach Anwalt; Datenschutzerklärung des Betriebs um „Vorbestellung/Vormerkliste“ ergänzen. |
| **ADR-Beförderungspapier** (`adrPapier`, Paket 356) | Papier ausstellen geht nicht, jeder Druck trägt „ENTWURF – nicht als Beförderungspapier verwenden“; Entwürfe anlegen, Positionen prüfen und die 1000-Punkte-Rechnung nutzen geht | `lib/adrPapier.ts`, `app/dashboard/entsorgung/Gefahrgut.tsx` | R58 (Haftung bei falschen Angaben, Hilfsmittel-Hinweis, Pflichtangaben 5.4.1.1.1 vollständig? 1.1.3.6-Vermerk auf dem Papier) | Wortlaut des Punkte-Vermerks, Hinweis „Einstufung durch den Betrieb/Gefahrgutbeauftragten“ in Hilfe/AGB; prüfen, ob schriftliche Weisungen (5.4.3) mitgegeben werden müssen (nicht gebaut). |
| **Metallzuschlag in Angebot/Rechnung** (`metallzuschlag`, HW-1, Pakete 402/403) | Knopf „In Angebot/Rechnung übernehmen“ gesperrt; der Rechner (Notiz, Basis, Metallzahl, Länge) bleibt intern nutzbar | `lib/metallzuschlag.ts`, `app/dashboard/metallzuschlag/page.tsx` | R66 (Preisanpassung bei Verbrauchern § 309 Nr. 1 BGB, Transparenz/PAngV: Zuschlag im Angebot ankündigen, Formel und Notiz-Datum auf der Rechnung, AGB-Klausel „Metallzuschlag nach Tagesnotiz“) | Hinweistext im Angebot („zzgl. Metallzuschlag nach DEL-Notiz am Liefertag“), AGB-Baustein, Wortlaut der Rechnungsposition prüfen. |
| **Förder-Übersicht Heizungstausch** (`foerderantrag`, HW-3, Pakete 404/405) | Druck der Förder-Übersicht für den Endkunden gesperrt; Zuschuss-Schätzung (KfW 458, Stand 21.07.2026) und Ablauf-Checkliste intern nutzbar | `lib/heizungsfoerderung.ts`, `app/dashboard/heizungsfoerderung/page.tsx` | R67 (Rechtsdienstleistung/Fördermittelberatung durch Handwerker § 5 RDG als Nebenleistung? Haftung bei falscher Schätzung, Haftungsausschluss-Wortlaut, Muster-Klausel aufschiebende Bedingung im Vertrag, Einkommensangaben des Kunden = sensible Daten) | Wortlaut „unverbindliche Schätzung, maßgeblich KfW am Tag der Antragstellung“, Vertragsklausel-Baustein, Datenschutz-Hinweis Einkommen; Sätze ab 01.02.2027 prüfen (Wächter). |
| **Besucher-Messung mit Einwilligung** (`cookieMessung`, C1, Paket 406) | Einwilligungs-Fenster, Wiedererkennungs-Cookie `ao_einw` und Nachweis auf Kunden-Webseiten; ohne Schalter zählen die Seiten weiter ohne Cookie | `lib/cookieEinwilligung.ts`, `lib/webBloecke.ts`, `app/api/oeffentlich/einwilligung`, `app/api/oeffentlich/analyse`, `app/dashboard/webseiten/besucher-messung` | R68 (§ 25 Abs. 1 TDDDG, Gleichwertigkeit der Knöpfe, Fenster-Wortlaut, Laufzeit 12 Monate, Vermerk „nein“ als technisch notwendig nach § 25 Abs. 2 Nr. 2, Aufbewahrung der Nachweise, Rolle ARGONAUT als Auftragsverarbeiter) | Neuer Fenster-Wortlaut = neue Fassung in `EINWILLIGUNG_VERSIONEN` anhängen, `DATENSCHUTZ_ABSCHNITT`, AVV-Anlage um Besucher-Kennung ergänzen. SQL p406 muss live sein. |
| **WhatsApp-Werbung** (`whatsappWerbung`) | Anmeldung und Kampagnen-Versand per WhatsApp | `app/api/marketing/whatsapp-senden`, `app/api/oeffentlich/whatsapp-optin` | 2.07, 2.08, 2.53, 1.64 | Einwilligungstext, Klausel für von Hand eingetragene Nummern, Meldung „abgemeldet" nach STOP ergänzen. |

## 2 · Import-Sperren (`lib/anwaltFreigabe.ts`, `ANWALT_FREIGABE`)

Vorgebaut, aber jeder Import in diese Ziele wird abgelehnt, auch für die Geschäftsleitung. Unabhängig vom Schalter gehen diese Daten **nie** an den KI-Aufräumer.

SCHALTER anwaltFreigabe.gesundheit = aus
SCHALTER anwaltFreigabe.tier = aus
SCHALTER anwaltFreigabe.hilfsmittel = aus
SCHALTER anwaltFreigabe.kanzlei = aus

| Bereich | Was ist gesperrt | Anwalt-Fragen | Mitziehen |
|---|---|---|---|
| Gesundheit | Patienten- und Behandlungs-Import | 3.20, 3.01–3.03, 3.10, 3.11 | Verpflichtungserklärung § 203, Praxis-Mustertexte, HWG-Wächter abnehmen, Zugriffsprotokoll-Frist (3.05). Dossier-Bereich „Gesundheit & Wellness" freigeben (Abschnitt 4). |
| Tier | Tierakten mit Halter und Behandlung | 3.20, 3.04 | Impf-Einwilligung je Tier. Dossier-Bereich „Tiere". |
| Hilfsmittel | Versorgungen mit Diagnose und Krankenkasse | 3.20 (§ 393 SGB V) | wie Gesundheit |
| Kanzlei | Mandantenakten | 3.20 (§ 203 StGB) | Dossier-Bereich „Recht, Steuern & Finanzen". |

Fundstellen: `lib/importRechte.ts`, `lib/umzugPlan.ts`, `app/api/gesundheit-notiz/stapel`.

## 3 · Bestellstrecke und Zahlung (`lib/flags.ts`)

SCHALTER flags.BESTELLSTRECKE_LIVE = aus
SCHALTER flags.ZAHLUNG_LIVE = aus

- **BESTELLSTRECKE_LIVE**: die öffentliche Buchen-Strecke `/buchen` für ARGONAUT-Abos. Freischalten nur über die Checkliste im Command Center (`BestellstreckeFreischalten.tsx`). Anwalt **2.50**. Nie automatische Abbuchung.
- **ZAHLUNG_LIVE**: Online-Kartenzahlung im Kunden-Shop (`app/dashboard/shop/zahlung`). Setzt den Webshop (Abschnitt 1) **und** einen verbundenen Zahlungsanbieter voraus. Anwalt **2.50**.

## 4 · Fachdossiers (`lib/dossierFreigabe.ts`, `lib/fachdossier.ts`)

### 🔴 Ganz gesperrte Bereiche
Statt Dossier eine Hinweisseite „In rechtlicher Vorbereitung".

SPERRE dossier.bereich = Gesundheit & Wellness
SPERRE dossier.bereich = Recht, Steuern & Finanzen
SPERRE dossier.bereich = Tiere

Öffnen nach Anwalt **3.20**. Dann: Bereich aus `GESPERRTE_BEREICHE` nehmen, Texte je Branche schreiben (am Code geprüft), Wellness-Module im Paket prüfen.

### 🟡 Teilbereiche, in denen nur eine Positivliste frei ist
Frei sind nur Betriebe **ohne Ladenkasse und ohne Webshop**. Neue oder unbekannte Branchen dort sind automatisch gesperrt.

SPERRE dossier.teilbereich = Handel & E-Commerce
SPERRE dossier.teilbereich = Gastronomie, Hotellerie & Tourismus
SPERRE dossier.teilbereich = Sport, Beauty & Lifestyle
SPERRE dossier.teilbereich = Lebensmittel & Nahversorgung

Öffnen, wenn **Webshop** (Abschnitt 1) **und echte Kasse mit TSE** (Abschnitt 5) frei sind. Dann die übrigen Slugs in `FREI_IN_TEILBEREICH` ergänzen bzw. den Bereich ganz freigeben.

**Mitziehen (seit Paket 234):** In diesen vier Bereichen lässt das Dossier die Module **Kasse** und **Shop** im Fachpaket weg (`OHNE_IN_TEILBEREICH` in `lib/dossierFreigabe.ts`); damit entfällt dort auch die Zeile „Kasse mit zertifizierter TSE" unter „Was wir gerade noch bauen". Beim Öffnen die Liste leeren und die Branchentexte der bisher freien Betriebe prüfen (sie nennen bewusst weder Kasse noch Shop).

**Seit Paket 237** lassen die Sport-Dossiers zusätzlich das Modul **„Gesundheit & Wellness“** weg (`ZUSAETZLICH_OHNE`, Kundenkartei mit Behandlungen = Gesundheitsnähe, Anwalt **3.20**). Öffnen zusammen mit dem Bereich „Gesundheit & Wellness“.

Frei und mit Text (Stand Paket 238): Handel & E-Commerce 9 von 9, Gastronomie, Hotellerie & Tourismus 14 von 14, Lebensmittel & Nahversorgung 8 von 8, Sport, Beauty & Lifestyle 17 von 18 (ohne `schuetzen-schiesssportverein`, siehe unten).

### Bewusst noch ohne Text (Branchen werden mit dem alten E-Book-Dossier beliefert, nicht beworben)
- Handwerk: `zahntechniker`, `orthopaedie-schuhmacher` (Gesundheitsdaten, Krankenkassen-Abrechnung)
- Dienstleistungen: `inkasso-forderungsmanagement` (Rechtsdienstleistung), `detektei-ermittlungsbuero`, `seniorenbetreuung-alltagshilfe` (Gesundheitsnähe), `bestattungsunternehmen`, `tatort-extremreinigung`
- Industrie: `lebensmittelproduktion` (HACCP liegt nicht im Industrie-Paket), `chemische-industrie`
- Sport, Beauty & Lifestyle: `schuetzen-schiesssportverein` (steht in der Positivliste, aber Waffen sind auf der Website ausgeschlossen und Waffenrecht ist ein eigenes Rechtsthema; Paket 238)

Regeln für alle Dossier-Texte: nur Gebautes, keine Zahlen- oder Ersparnisversprechen, keine Mitbewerber, kein „inklusive", keine Kasse, kein Shop, keine WhatsApp-Werbung, keine Fernhilfe, kein KI-Berater auf fremden Websites, kein Bankabruf.

## 5 · Kasse (`lib/kasse-tse.ts`)

SCHALTER kasse.modus = demo

Die Kasse liefert immer `modus: 'demo'` und druckt „keine gültige TSE-Signatur nach § 146a AO". Echt erst mit Vertrag über eine zertifizierte TSE (Partner). Anwalt **1.30**. Danach: Dossier-Teilbereiche (Abschnitt 4), Kassenmeldung.

## 6 · Schalter über Umgebungsvariablen (Vercel)

| Variable | Heute | Wirkung | Vor dem Einschalten |
|---|---|---|---|
| `ZWEI_FAKTOR_PFLICHT` | nicht gesetzt (aus) | Zwei-Faktor wird für alle Pflicht | eigenen Faktor + Notfall-Codes einrichten (Aussperr-Gefahr) |
| `RESEND_EIGENE_DOMAINS` | in Vercel prüfen (bis zum Test aus lassen) | eigene Absender-Domain je Betrieb | Domain-Bestätigung, Versand und Rückfall einmal echt testen |
| `KI_RUECKFALL_URL` / `_SCHLUESSEL` / `_MODELL` | leer | zweiter KI-Anbieter bei Ausfall | AV-Vertrag mit dem Anbieter, Datenschutzerklärung ergänzen |
| `MAIL_TAGESBUDGET` | ohne Wert 100/Tag | Deckel für Mails je Tag | Mailtarif prüfen |

## 7 · Gebaut, aber nicht angeschlossen

| Baustein | Datei | Wartet auf |
|---|---|---|
| VOB/C-Übermessung | `app/dashboard/_components/aufmassVob.ts` | Anwalt **3.24** |
| Erweiterter Einwilligungsnachweis (volle IP, Wortlaut) | `lib/einwilligung.ts` | Anwalt **1.13** |
| Prüfung aufgelöster IP-Adressen bei Schnittstellen | `lib/adressPruefung.ts` (`pruefeAufgeloesteIp`) | erster Konnektor, der fremde Adressen anruft |
| Bankabruf über lizenzierten Partner | Partner-Test (Sandbox) | Anwalt **3.21**, Partnervertrag |
| Stimme (synthetisch) | Pakete 188/189 | Anwalt **3.23**, Stimmaufnahme |

Im Fachdossier stehen die laufenden Vorhaben unter „Was wir gerade noch bauen" (`IN_VORBEREITUNG` in `lib/fachdossier.ts`): Bankabruf, DATEV/ELSTER direkt, direkte Großhändler-Anbindung, Kasse mit TSE, Marktplätze und Mail-Kalender-Abgleich (`IN_AUFBAU_MODULE`), Login bei Werbeplattformen.

## 8 · Bewusst nicht gebaut (bis zur Freigabe)

- Bewerber-KI (**3.32**), Telefon-KI (**3.22**), Bonitätsprüfung (**3.28**), Nutzungsmessung je Mitarbeiter (**3.27**), mehrstufige Provisionen (**3.30**), Tankkarten-Abgleich mit Fahrerverhalten (**3.25**), E-Book als Geschenk (**3.26**), Kursverkauf an Dritte (**3.29**)
- Änderungen an Auskunft und Löschung für Anfragen, Webinar, Shop-Bestellungen, eigene Bestellstrecke (**1.82**)
- Werbung an Bestandskunden ohne Einwilligung (**1.81**): wird gezählt, nicht angeschrieben
- Neue Rechtssätze in automatischen Hinweisen (**1.83**), neue steuerliche Auswertungen (**1.84**)
- Eigener Vertrieb: keine Kaltanrufe, keine Kaltmails (**1.85**)

## 9 · Website

`AUSSCHLUSS` in `app/vorschau/_lib/branchen-web.ts`: Banken, Ärzte und Praxen, Zahnärzte, Kliniken, Apotheken, Pflegedienste, Labore, Hebammen, Psychologische Beratung, Suchtberatung, Hospize, Medizintechnik, Pharma, Biotechnologie, Chemie & Pharma, Waffen, Verteidigung, Physio-, Ergo-, Logotherapie, Osteopathie, Podologie, Tierärzte. Diese Branchen erscheinen gar nicht auf der Website. Wiederaufnahme nur zusammen mit Anwalt **3.20** und eigener Entscheidung.
