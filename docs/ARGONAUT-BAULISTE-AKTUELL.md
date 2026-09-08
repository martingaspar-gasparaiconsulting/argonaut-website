# ARGONAUT OS — Bauliste, Stand 08.09.2026

**22 Punkte · 12 SQL-Blöcke · 31 Pushes.** Nur Code. Was kein Bauen ist, steht unten separat.

- ohne Gruppe 6 (Empfehlungen): **17 Punkte · 10 SQL · 25 Pushes**
- ohne alles, was auf Verträge oder Konten wartet: **14 Punkte · 7 SQL · 18 Pushes** —
  ohne eine einzige Wartezeit durchziehbar

> **Zählweise:** Ein *Punkt* ist eine abgeschlossene Sache mit eigenem Nutzen. Ein *SQL* ist
> ein Block für den Supabase-Editor. Ein *Push* ist ein CMD-Block, der prüft und nur bei Grün
> committet. Die Kontrolle-vor-Bauen-Runde je Punkt ist eingerechnet.

---

## Gruppe 1 · Vor dem ersten echten Kunden
**3 Punkte · 1 SQL · 2 Pushes**

### ⬜ 1.1 Zwei Textkorrekturen — *1 Push*
- **„du" raus aus den Onboarding-Stufen** (`lib/onboardingStufen.ts`, sieben Zeilen).
  Erste Seite für jeden neuen Kunden, einziger Duz-Ort im System; der Guide daneben siezt.
- **KI-Kennzeichnung für den sprechenden Guide** — sichtbarer Hinweis beim ersten Aufklappen.
  Der Shop-Bot ist gekennzeichnet, der Guide nicht. AI Act Art. 50, in Kraft seit 02.08.2026.

### ⬜ 1.2 Sehen Mitarbeiter die Anfragen? — *1 SQL · wartet auf Martins Entscheidung*
Auf `leads` liegt nur eine Besitzer-Regel, keine Mitarbeiter-Regel wie bei allen anderen
Modulen. Heute sieht ausschließlich der Chef die Anfragen. Absicht oder Lücke?
Wenn Mitarbeiter mitarbeiten sollen: ein SQL-Block. Sonst Punkt streichen.

### ⬜ 1.3 Stammdaten-Prüfung vorziehen — *1 Push*
Heute merkt ein Kunde erst beim Erzeugen der ersten Rechnung, dass ein Pflichtfeld fehlt.
`stammdatenPruefung.ts` ist gebaut — sie muss im Onboarding laufen statt im Fehlerfall.
Verhindert die ärgerlichste Sackgasse im System.

---

## Gruppe 2 · Stimme und Gesicht
**3 Punkte · 2 SQL · 4 Pushes** — wartet auf Martins Aufnahmen (2–3 Min. Audio)

### ⬜ 2.1 Stimme, einmal erzeugt und gespeichert — *1 SQL · 2 Pushes*
- **SQL:** Speicherbereich für Audiodateien + Zuordnungstabelle
  (Textstreuwert → Datei → Stimme → Modellstand) + Aufräum-Regel für abgelöste Dateien.
- **Push 1 — der Zwischenspeicher.** Erzeugen über die Anbieter-Schnittstelle, ablegen,
  ausliefern. Dateiname aus *Text + Stimme + Modellstand*: ändert sich ein Text, wird genau
  dieser eine neu erzeugt. Browser-Stimme bleibt als Rückfall.
- **Push 2 — Admin-Knopf „Sprachbibliothek erzeugen"** + Umstellung des Guides von
  `speechSynthesis` auf `<audio>` + Einstellung je Betrieb: vorlesen an/aus.
- **Warum das so gebaut wird:** ohne Zwischenspeicher 120–750 $/Monat bei 500 Nutzern,
  mit unter 2 $/Monat. Faktor ~750. Zusätzlich: keine Daten an einen US-Dienst im Betrieb.

### ⬜ 2.2 Gesicht im Onboarding und in der Academy — *1 SQL · 1 Push*
Vorgerendert, **nicht** Echtzeit (Echtzeit kostet bei 500 Nutzern mehrere hundert Euro/Monat).
- **SQL:** Tabelle für Guide-Videos (Modul, Sprache, Adresse, Kennzeichnung, Stand).
- **Push:** Videoplatz im Guide und in der Academy, Rückfall auf Text, Kennzeichnung im
  ersten Bild.
- **Martins Vorarbeit:** 2–5 Min. Video + **live** aufgenommenes Einverständnisvideo.

### ⬜ 2.3 Der Guide merkt, wenn jemand hängt — *1 Push*
Nach 45 Sekunden ohne Eingabe klappt er von selbst auf. **Einmal**, nicht wieder.

---

## Gruppe 3 · Onboarding, das allein läuft
**2 Punkte · 0 SQL · 2 Pushes** — hängt an nichts

### ⬜ 3.1 Import-Vorlage je Branche — *1 Push*
Das Import-Center steht mit über 100 Alias-Zuordnungen. Es fehlt die fertige Beispieldatei
zum Herunterladen — je Branche eine, richtige Spalten, drei Beispielzeilen.
**Das Nadelöhr des ganzen Onboardings.**

### ⬜ 3.2 Leere Seiten erklären sich selbst — *1 Push*
`Leerzustand` ist gebaut, aber ob sie überall sitzt, hat nie jemand geprüft. Genau dort
entsteht der Eindruck „das System kann nichts". Jede Leerstelle mit einem Satz und einem
Knopf, der weiterführt.

---

## Gruppe 4 · Der Dialog-Block — das neue Produkt
**5 Punkte · 5 SQL · 11 Pushes.** G1–G3 brauchen **kein Fremdkonto** (Zugang erst zum Testen).

### ⬜ G1 Der Berater für jede Kundenwebsite — *1 SQL · 1 Push*
Heute läuft er nur auf Seiten, die *in* ARGONAUT gebaut sind (`<script src="/chat.js">`,
relativer Pfad, kein CORS).
- **SQL:** Feld für die Kundendomain — ohne das könnte jede fremde Seite den Bot auf unsere
  Kosten laufen lassen.
- **Push:** absolute Adresse im Widget, CORS **geprüft gegen die hinterlegte Domain**,
  Einbett-Schnipsel zum Kopieren im Dashboard.

### ⬜ G2 WhatsApp hört zu — *1 SQL · 2 Pushes*
Der Versand steht komplett; es fehlt der Eingang. Ohne ihn ist jede Setter-Idee auf WhatsApp
gegenstandslos.
- **SQL:** Tabellen für eingehende Nachrichten und Gesprächsverläufe, Zuordnung zum Kontakt,
  Rechte-Regeln nach bestehendem Muster (**mit Präfix**, siehe Übergabe 2.7).
- **Push 1:** der Webhook — Verifizierung beim Einrichten, **Signaturprüfung bei jeder
  Nachricht**, Zuordnung, Speicherung. Mit nachgestelltem Aufruf prüfbar, bevor Meta etwas schickt.
- **Push 2:** Posteingang im Dashboard, **24-Stunden-Fenster sichtbar** (danach nur noch
  freigegebene Vorlagen), Antwort durch das bestehende Gehirn.

### ⬜ G3 Die zweite Stufe: Setter statt Auskunft — *1 SQL · 3 Pushes*
Der Betrieb wählt je Kanal: **Auskunft** oder **Setter**.
- **SQL:** Einstellungen je Betrieb und Kanal — Rolle, Ziel, Qualifizierungsfragen,
  Übergabe-Regel an einen Menschen.
- **Push 1:** Gesprächsführung — Ziel verfolgen, Fragen stellen, erkennen wann Schluss ist.
  Reine Logik, node-getestet.
- **Push 2:** Handeln — Kontakt anlegen, Lead-Stufe setzen, Termin buchen **über denselben
  Weg wie die Online-Buchung** (sonst entstehen Termine, die im Schichtplan fehlen),
  Aufgabe erzeugen.
- **Push 3:** Einrichtungsseite + die zwei Grenzen: **kein Preis, der nicht in den
  Stammdaten steht** — und **er behauptet nie, ein Mensch zu sein**, auch nicht auf Nachfrage.

### ⬜ G4 Social hört zu — *1 SQL · 2 Pushes · braucht Konten*
Kommentare und Direktnachrichten auf Facebook, Instagram, LinkedIn. Dasselbe Muster wie G2 —
deshalb **erst nach G2**: Wer zwei Webhook-Muster gleichzeitig baut, baut zwei Mal denselben Fehler.
- **SQL:** Eingang je Netzwerk, an die bestehende Kanalverwaltung angehängt.
- **Push 1:** Webhooks je Netzwerk. **Push 2:** Zusammenführung in denselben Posteingang wie WhatsApp.

### ⬜ G5 KI-Telefonie — *1 SQL · 3 Pushes · braucht Partnervertrag*
Zwei Rollen wie bei G3.
**Anbieter neu bewerten:** Retell und Vapi weisen **kein EU-Hosting** aus; famulor
(Frankfurt, ab 27 €/Mon.), VITAS (ISO 27001 + BSI C5) und sipgate (0,15–0,20 €/Min.) tun es.
- **SQL:** Nummern je Betrieb, Gesprächsprotokolle, Verknüpfung zu Kontakt und Termin.
- **Push 1:** Anbindung und Anruf-Eingang. **Push 2:** Gesprächsführung + Protokoll ins CRM.
  **Push 3:** Einrichtung, Minutenzähler, Kostendeckel je Betrieb.
- **Vor dem Vertrag:** Testanruf bei zwei Anbietern, deutsche Sprachqualität selbst hören,
  AVV lesen (wo wird verarbeitet, wie lange liegt es).

---

## Gruppe 5 · Rest der alten Bauliste
**4 Punkte · 2 SQL · 6 Pushes**

### ⬜ B8 Kleinkram-Bündel — *1 Push · wartet auf 3 Entscheidungen*
Connector-SQL für neue Demo-Konten automatisieren · Brand-Story „Die Geschichte vom
Argonaut" · Trust-Layer und Enterprise-Slot im Control Room.

### ⬜ D6 Eigene Absender-Domain je Kunde — *1 SQL · 2 Pushes · nach A1*
Heute versenden alle Betriebe über dieselbe Adresse — das drückt die Zustellrate. Der
Absender*name* ist längst je Betrieb einstellbar; die *Domain* ist deutlich mehr.
- **SQL:** Domain je Betrieb mit Prüfstand.
- **Push 1:** Domain-Schnittstelle + Verifizierungs-Abfrage. **Push 2:** DNS-Einträge zum
  Kopieren anzeigen, Statusanzeige, Umschaltung des Versands.

### ⬜ B5 Seitenschale nachziehen — *1 Push · am Testtag*
Einzelne Modulseiten setzen ihre Breite noch selbst. Fällt beim Durchklicken auf, sonst nicht.

### ⬜ D7 Webinar-Baustein „Ernten" — *1 SQL · 2 Pushes · nach Testtag*
- **SQL:** Webinare, Anmeldungen, Erinnerungsstrecke.
- **Push 1:** Anlegen + öffentliche Anmeldeseite mit Double-Opt-in.
  **Push 2:** Erinnerungen und Nachfass über die bestehende Strecke.

---

## Gruppe 6 · Empfehlungen — Martin entscheidet, ob überhaupt
**5 Punkte · 2 SQL · 6 Pushes**

### ⬜ 6.1 Preisrechner gegen Kopfpreise — *1 Push*
Besucher gibt Mitarbeiterzahl ein, sieht: bei ARGONAUT so viel, bei einem Kopfpreis-Anbieter
so viel. **Ab etwa fünf Nutzern gewinnt ARGONAUT immer** (weclapp 39–163 €, myfactory ab
114 €, Odoo 24,90 € je Kopf). Halber Tag Arbeit, stärkstes Verkaufsargument.

### ⬜ 6.2 Steuerberater-Zugang als eigener Sitz — *1 SQL · 2 Pushes*
Lexware und sevdesk gewinnen den Mittelstand über den Steuerberater. Kostenloser,
**schreibgeschützter** Zugang für die Kanzlei (Belege + DATEV-Export) öffnet einen
Vertriebskanal, den es sonst nicht gibt.
- **SQL:** Sitz-Typ „Kanzlei" mit eigenen, rein lesenden Rechte-Regeln.
- **Push 1:** Einladung und Zugang. **Push 2:** Kanzlei-Ansicht.

### ⬜ 6.3 Ausfallplan für die KI — *1 Push*
Sehr viel hängt an einem einzigen Schlüssel. Zweiter Anbieter als Rückfall **hinter
derselben `kiFetch`-Funktion**. Genau die Frage, die ein größerer Kunde in der Prüfung stellt.

### ⬜ 6.4 Die zwei fehlenden Zahlen — *1 SQL · 1 Push*
Welche Module werden **tatsächlich** benutzt, und wo bricht das Onboarding ab?
- **SQL:** schlanke Nutzungszählung je Modul und Betrieb, **ohne Personenbezug**.
- **Push:** zwei Kacheln im Command Center.

### ⬜ 6.5 Wachendes Auge auf die Rest-Reiter — *1 Push*
`KiAuge` ist gebaut und sitzt nur auf einem Teil der Reiter.

---

## Ohne Code — auch offen, kostet aber keinen Push

| Punkt | Aufwand |
|---|---|
| **B9 und B6 im Browser gegenprüfen** — Anmeldung mit/ohne Haken · beide EÜR-Seiten vergleichen | 10 Minuten |
| **A1 Resend auf Pro** — schaltet D6 frei, hebt den Post-Deckel | 5 Minuten |
| **A3 Anwaltspaket** — H1–H6 **plus neu:** KI-Kennzeichnung, Stimmlizenz Person → Gesellschaft, Exit-Klausel für Gesicht und Stimme | Termin |
| **A4 Stripe prüfen** — Schlüssel liegen seit 05.05. ungenutzt in Vercel | Prüfung |
| **A5 SEPA-Weg neu aufsetzen** | Martins Wahl |
| **Prompt-Caching nachsehen** — offen seit M3, bei wiederholten System-Prompts bares Geld | 1 Stunde |
| **Fahrzeugakte entscheiden** — null Schreibvorgänge, zeigt nur an | Martins Wahl |
| **M18 Testtag** — keine Oberfläche wurde je von einem Menschen bedient | 1 Tag, zu zweit |

---

## Was bewusst NICHT gebaut wird

- Zusammenlegung `ausgaben` / `eingangsbelege` — nach B6 unnötig, die gemeinsame Sicht
  liefert alles. Ein Umzug von 93 Zeilen wäre Risiko ohne Gegenwert.
- Öffentliche Bestellstrecke — zurückgestellt bis ~100 Kunden.
- Talent-Marktplatz · ARGONAUT Universum · die alte Agenten-Seite · 698 Demo-Konten ·
  Rundgang-Video je Branche · Belohnungsmodell Provision.
- Eigene Felder für Kasse (GoBD-Unveränderbarkeit), Mahnwesen (abgeleiteter Vorgang) und
  Academy (globale Datensätze) — fachlich falsch.
