# ARGONAUT · Marketing-Autopilot — Konzept & Bauplan

> **Status:** Vision festgehalten am 30.07.2026 (aus der Arbeitssession Newsletter/Mail-Branding).
> **Zweck:** Diese Datei sichert den großen Marketing-Block dauerhaft im Repo, damit der
> nächste Chat sauber andockt. Der laufende Fahrplan wird dadurch **nicht** umgeworfen.
> **Merksatz:** Wir bauen die **Marketing-Tools jetzt so groß wie möglich fertig**
> (Newsletter, E-Books, Landingpages, Funnel, Auswertungen). Der **fachspezifische
> Riesenbrocken** (die 698 Branchen einzeln vertiefen) wird **nach hinten verschoben.**

---

## 1. Die Vision in einem Satz

ARGONAUT bekommt eine **autonome Marketing-Abteilung im Kasten**: Der Mittelständler
klickt sich seine Kunden-Strecke **einmal** zusammen (Click-and-Drop), danach läuft das
Marketing **von selbst** über alle Kanäle — und das KI-Auge sagt ihm in Klartext, was
funktioniert und was er als Nächstes tun soll. Es ist der **ClickFunnels-Ersatz + das
Newsletter-Tool + die Marketing-Automation** in einem — und zwar **für die Kunden**,
nicht nur für ARGONAUT selbst. Damit fallen gleich mehrere der „10–12 Werkzeuge", die
ARGONAUT ersetzen will, in eine Säule.

---

## 2. Die Funnel-Maschine (die Strecke)

```
Besucher
   │
   ▼
① Landingpage / Opt-in-Seite   ◄── Kunde baut sie selbst (Baukasten, in SEINEN Farben)
   │      "Hol dir das Gratis-E-Book / Angebot"
   ▼
② Formular: E-Mail eintragen
   │        └─► schreibt automatisch in:  Newsletter-Liste + CRM (Lead) + Kampagnen-Quelle
   ▼
③ Danke-Seite + sofortige Auslieferung (E-Book / Gutschein als PDF)
   │
   ▼
④ Autoresponder-Serie (automatisch, im Branding des Kunden, über mehrere Kanäle)
   │   Tag 0: Willkommen · Tag 2: Nutzen/Story · Tag 5: Angebot · Tag 8: Erinnerung
   ▼
⑤ Lead wird im CRM bewertet (KI-Scoring) → Termin / Kauf
   │
   ▼
⑥ Funnel-Auswertung: Wie viele je Stufe? Wo springen sie ab? (Conversion pro Schritt)
```

---

## 3. Der Clou: ~70 % der Teile stehen schon

Wir müssen die vorhandenen Bausteine „nur" zu einer Strecke verbinden.

**Schon vorhanden**
- Newsletter-Liste + Versand (Punkt 29) — das Sammeln & Anschreiben.
- CRM + Lead-Attribution (`kampagne_id`, KI-Scoring) — die hintere Hälfte des Funnels.
- Kunden-Branding: `firma_akzentfarbe` + `kundenMailLayout` / `absenderBranding`
  (Mail-Branding Paket 1) — alle Funnel-Mails tragen automatisch die Kundenfarben.
- Render-Technik der 698 Branchenseiten — Basis für den Landingpage-Bauer.
- Document-Engine / PDF — Freebie-Auslieferung (E-Book, Gutschein).
- Vercel-Cron — Taktgeber für automatische Serien.
- recharts (Analytics-Block) — Basis für Auswertungen.
- Connector-/API-Schlüssel-Konzept: `lib/konnektoren.ts` + `betrieb/api-schluessel`.

**Wirklich neu**
1. Visueller **Seiten-/Landingpage-Bauer** (Blöcke zusammenklicken, live schalten).
2. **Autoresponder-/Automations-Engine** (Node-Bauer: Trigger → Aktion → Bedingung → Wartezeit).
3. **Funnel-Analytics** (Conversion je Stufe) + A/B-Test-Mechanik.

Und: Unser eigener **E-Book-Funnel** (bisher Block E) ist dann kein Sonderprojekt mehr,
sondern **die erste Funnel-Vorlage** auf genau dieser Maschine.

---

## 4. Auswertungen & Tests (Agentur-Grade, aber vom KI-Auge gedeutet)

Was die großen Tools / Agenturen können und was wir ergänzen:

- **A/B/C- & Multivariate-Tests:** Varianten von Seite/Mail (Überschrift, Knopf, Farbe,
  Angebot, Bild) gegeneinander, Traffic-Split, automatischer Sieger **erst bei
  statistischer Signifikanz**. Auch Betreffzeilen-Test + beste Versandzeit + „nochmal an
  Nicht-Öffner".
- **Funnel-Conversion je Stufe:** Trichter-Grafik, wo genau die Leute abspringen.
- **E-Mail-Kennzahlen:** Öffnungs-, Klick-, Zustell-, Bounce-, Abmelderate — pro Mail &
  pro Sequenz. (Resend kann Öffnungen/Klicks tracken → günstig ergänzbar.)
- **Quellen-Attribution & Kanal-ROI:** nicht „woher die meisten", sondern „woher die
  **besten**" Leads; UTM; reingesteckt vs. rausgekommen.
- **Besucher-/Verhaltens-Analytics:** Aufrufe, Verweildauer, Absprung; teure Klasse:
  Heatmaps + Session-Recordings; Formular-Analytics (wo brechen sie ab).
- **Lead-Scoring & Segmentierung:** verhaltensbasiert (öffnete/klickte/Preis-Seite);
  Fundament = KI-Scoring im CRM.
- **Umsatz-Kennzahlen:** EPC, Warenkorbwert, Wiederkäuferrate, LTV, CAC, ROAS.
- **Bedingte Automatisierung:** Wenn/Dann-Verzweigungen, Tags, Trigger.
- **Reporting & Pixel:** geplante Reports, (White-Label-)Kundenreports; Facebook-/Google-
  Pixel, Conversion-Rückmeldung an Ad-Plattformen, Retargeting-Zielgruppen.

**Der ARGONAUT-USP:** Andere Tools werfen 100 Diagramme hin — man muss selbst deuten.
Bei uns liest das **KI-Auge** die Zahlen und sagt Klartext: *„Stufe ② verliert 60 % —
Überschrift testen, Variante B habe ich dir schon geschrieben, scharfstellen?"* Also
**messen + deuten + die nächste Testvariante gleich vorschlagen und schreiben.**

---

## 5. Fokus / Detail — der Umschalter (Produkt-Prinzip)

- **Zwei Linsen, eine Datenschicht.** Kennzahlen einmal rechnen; der Umschalter ändert nur,
  **wie viel** man sieht. „Einfach" ist nicht weniger korrekt, nur weniger Worte.
- **Für ALLE sichtbar, nicht rollengesperrt.** Der Chef gibt das Modul frei; wer Zugriff
  hat (auch Mitarbeiter), bekommt den **vollen Umfang**. Standard = **Fokus**.
- **Etikett benennt die Ansicht, nicht den Menschen** (kein „Anfänger/Profi"). Kandidaten:
  „Fokus ↔ Detail", „Klartext ↔ Analyse", „Das Wesentliche ↔ Alle Zahlen".
- **Brücke = KI-Auge.** Fokus: die 1–3 echten Hebel + nächste Handlung. Detail: dieselbe
  KI kommentiert die volle Diagramm-Batterie.
- **Ehrlich bleiben:** „Einfach" darf nie „beschönigt" heißen. Blutet der Trichter, ist die
  Ampel auch im Fokus-Modus rot.
- Gilt **produktweit**, nicht nur im Marketing (passt zu Nutzer-Typen Chef/Standard/Self-Service).

---

## 6. Omnichannel (die Kanäle)

- **E-Mail** — vorhanden (Resend, `kundenMailLayout`).
- **WhatsApp** — der Hammer im DE-Mittelstand (höchste Öffnungsrate). Über WhatsApp-
  Business-API via Provider (BSP). **Hürde:** Opt-in nötig, **vorab genehmigte
  Nachrichten-Vorlagen**, Kosten pro Konversation, Einrichtung/Freigabe.
- **SMS** — Erinnerungen, hohe Öffnungsrate.
- **Social-Auto-Posting** — Instagram/Facebook/LinkedIn/Google-Business; nutzt das
  vorhandene **KI-Content-Studio**, es fehlt nur Einplanen + automatisches Veröffentlichen.
- **Retargeting / Werbe-Pixel** — Meta/Google; schwerere Integration (Freigaben + Pixel).
- **KI-Anruf** — steht als Partner-Idee im Fahrplan (Outbound-Nachfassen per KI-Stimme).

**Design-Leitplanke:** „Verbinden"-Knöpfe statt API-Key-Gefrickel. Der Kunde klickt
„WhatsApp verbinden", „Instagram verbinden", „Shop verbinden" — kein API-Schlüssel-Eintippen.

---

## 7. „Läuft von selbst" — Automation & Easy-Bedienung

- **Visueller Click-and-Drop-Ablauf-Bauer:** Bausteine = Auslöser → Aktionen (Kanal X
  senden) → Bedingungen (wenn/dann) → Wartezeiten. Beispiel:
  *Neuer Lead übers Formular → WhatsApp-Willkommen → 2 Tage später E-Mail → nicht geöffnet?
  → SMS-Erinnerung → geklickt? → Aufgabe an Chef / KI-Anruf.*
- **KI schreibt jeden Schritt-Inhalt** selbst und wählt Kanal + beste Uhrzeit.
- **Branchen-Vorlagen (698):** „Bäckerei-Neukunden-Funnel", „Handwerker-Bewertungs-Funnel"
  — zu 80 % fertig, Kunde passt nur an. (Der Mittelstand baut nichts bei Null.)
- **KI als Mitbauer:** „Beschreib in einem Satz, was du willst" → KI legt den ganzen Ablauf
  als Entwurf hin, Kunde schiebt nur noch Kästchen.
- **Fokus/Detail auch hier:** Fokus = fertiger Trichter, 3 Knöpfe; Detail = voller Node-Editor.

---

## 8. Gestaffelter Bauplan (Reihenfolge nach Aufwand/Nutzen)

1. **Newsletter-Liste + Versand** ✅ (Punkt 29, erledigt) — Sammeln & Anschreiben.
2. **Autoresponder-Sequenzen** (E-Mail-Serie mit Verzögerung, auf sendeMail +
   kundenMailLayout + Vercel-Cron). Günstig, gehört uns.
3. **Opt-in-/Landingpage-Bauer** (Seiten selbst bauen + live schalten, Branchen-Vorlagen).
4. **Funnel-Auswertung** (Conversion je Stufe) + **A/B-Test-Mechanik** + E-Mail-Kennzahlen.
5. **WhatsApp** als erstes „Wow"-Extra-Kanal (größter DE-Effekt).
6. **Social-Auto-Posting** (KI-Content-Studio → Einplanen/Veröffentlichen).
7. **Ads / Retargeting / Pixel** (später, schwerste Integration).

**Definition-of-Done je neuer Modulseite:** immer der kleine **„So geht's"-Erklärtext**
+ der **Leerzustands-Baustein** (Muster wie in den bisherigen Modulen). Kein Feature ohne
seine Erklärung.

---

## 9. Priorisierung (Beschluss 30.07.2026)

- **JETZT:** Marketing-Tools so groß wie möglich **fertig** bauen — Newsletter, E-Books,
  Landingpages, Funnel, Autoresponder, Auswertungen. „Alles rundum schön & gut."
- **NACH HINTEN:** der fachspezifische Riesenbrocken (die **698 Branchen einzeln
  vertiefen**) wird verschoben, bis der Marketing-Block steht.
- **Einordnung im Master-Fahrplan:** natürliche Erweiterung/Verschmelzung von Block D
  (Marketing-Tiefe) und Block E (E-Book-Funnel). Beim nächsten Umnummerieren als eigene
  Säule **„ARGONAUT Marketing-Autopilot"** einplanen.

---

## 10. Andock-Notiz für den nächsten Chat

Zuerst die Memory-Baulogs lesen (`argonaut-phase2-module` u. a.), dann diese Datei. Der
aktuelle konkrete Stand bleibt: **Mail-Branding Paket 2** (Cron-/Buchungs-Routen:
`termin-erinnerung`, `wartung-erinnerung`, `oeffentlich/buchung`), danach zurück in den
Fahrplan bei Punkt 30 — und von dort in diesen Marketing-Autopilot hineinbauen.
