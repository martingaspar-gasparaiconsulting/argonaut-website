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

---

## 1 · Start-Schalter (`lib/startSperre.ts`, `START_FREIGABE`)

Technisch aus, nicht nur ein Hinweisschild. Unbekannte Bereiche gelten als gesperrt.

SCHALTER startSperre.shop = aus
SCHALTER startSperre.kiBeraterFremd = aus
SCHALTER startSperre.fernhilfe = aus
SCHALTER startSperre.whatsappWerbung = aus

| Bereich | Was ist aus | Wo im Code | Anwalt-Fragen | Mitziehen beim Öffnen |
|---|---|---|---|---|
| **Webshop** (`shop`) | Bestellungen über Kunden-Websites | `app/api/oeffentlich/shop-bestellung`, `app/dashboard/shop`, `lib/webBloecke.ts` | 2.01–2.04, 2.20, 2.30–2.34 | Widerrufsbelehrung, Bestellbestätigung, Versandkosten/Lieferzeit, Shop-AGB, Retouren-Texte, Datenschutz-Baustein „Shop" (1.67), Steuersätze (S.13). **Zahlung bleibt getrennt** (`ZAHLUNG_LIVE`, Abschnitt 3). Danach die 🟡-Teilbereiche der Dossiers prüfen (Abschnitt 4). |
| **KI-Berater auf fremden Websites** (`kiBeraterFremd`) | Berater auf Adressen außerhalb der ARGONAUT-Websites; auf eigenen `/p/`-Seiten läuft er | `app/api/oeffentlich/chat`, `app/dashboard/webseiten` | 2.06, 2.35, 2.52 | AGB-Klausel Aufpreis/Mengengrenze (1.53), Passage für die Datenschutzerklärung des Betriebs, Bestätigung vor Freigabe einer fremden Adresse, AV-Vertrag (1.54). |
| **Fernhilfe** (`fernhilfe`) | Bildschirm teilen mit Betreiber oder Chef | `app/api/fernhilfe`, `app/dashboard/layout.tsx` (Knopf) | 2.51 | Hinweis in Datenschutzerklärung und AV-Vertrag (Live-Bild, keine Speicherung, Google-STUN erfährt IP), ggf. TURN-Server für Firmennetze. |
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

Frei und mit Text (Stand Paket 236): Handel & E-Commerce 9 von 9, Gastronomie, Hotellerie & Tourismus 14 von 14, Lebensmittel & Nahversorgung 6 von 8.

### Bewusst noch ohne Text (Branchen werden mit dem alten E-Book-Dossier beliefert, nicht beworben)
- Handwerk: `zahntechniker`, `orthopaedie-schuhmacher` (Gesundheitsdaten, Krankenkassen-Abrechnung)
- Dienstleistungen: `inkasso-forderungsmanagement` (Rechtsdienstleistung), `detektei-ermittlungsbuero`, `seniorenbetreuung-alltagshilfe` (Gesundheitsnähe), `bestattungsunternehmen`, `tatort-extremreinigung`
- Industrie: `lebensmittelproduktion` (HACCP liegt nicht im Industrie-Paket), `chemische-industrie`

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
