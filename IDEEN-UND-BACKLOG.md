# ARGONAUT OS · Ideen & Backlog

Stand: laufend. Oben **deine Punkte** (fest zugesagt), darunter **Claudes Empfehlungen**
(zusätzlich denkbar). Ganz unten: **deine Kontrolle / Entscheidung**.

---

## 1) DEINE PUNKTE (fest gemerkt)

**Verzahnung (Priorität B)**
- [ ] Fachpaket → Rechnung: „→ Rechnung"-Knopf + Kontakt-Verknüpfung für alle neuen Fachpakete.
- [ ] Bezahllink / Zahlungsanbieter-Konnektor (Stripe/Mollie/PayPal) + Webhook → „bezahlt".
- [ ] Gemeinsames Kunden-SEPA-Mandat (einmal erfasst → überall nutzbar).

**Onboarding-Maschine**
- [ ] Vertrags-/Signatur-Modul (DocuSeal-Nachbau: Bündel-Angebot + Förder-Frage → E-Mail → Kunde signiert + trägt Daten ein wie SEPA).
- [ ] Kunden-Onboarding-Checkliste (nichts vergessen).

**System-Qualität**
- [ ] Design-Einheitlichkeit (globales Dark-Baseline, native Controls, Handy) — Ursache: helle globals.css.
- [ ] „Wachendes Auge" (`KiAuge`) auf alle sinnvollen Reiter ausrollen.
- [ ] Kern-Zusammenstellung final festlegen (`lib/pakete.ts`).

**Betreiber-Kontrolle**
- [ ] Command Center: KI-Kosten + Speicher je Kunde messen & visuell (Paket → Limit → Verbrauch → Upgrade).

---

## 2) CLAUDES EMPFEHLUNGEN (zusätzlich denkbar)

### ⚡ Quick Wins (kleiner Aufwand, sofort spürbar)

- **GiroCode / EPC-QR auf jeder Rechnung** — Kunde scannt den QR mit seiner Banking-App, Überweisung ist vorausgefüllt. Kostet fast nichts, **braucht keinen externen Dienst** (rein selbst gebaut) und beschleunigt den Zahlungseingang massiv.
- **Eigenes Logo & Farben je Betrieb** — ein „Corporate Design"-Feld in den Einstellungen, das automatisch in alle PDFs (Rechnung, Angebot, Bon) und ins Kunden-Portal durchschlägt. Macht ARGONAUT „white-label" für jeden Kunden.
- **Globale Suche (Spotlight)** — ein Suchfeld, das Kontakte, Rechnungen, Angebote, Artikel, Termine überall findet. Riesiger Alltagsnutzen.
- **Vorlagen-System** — wiederverwendbare Textbausteine für Angebote, E-Mails, Mahnungen, Verträge. Spart täglich Zeit.
- **Export/Backup des ganzen Kontos** — ein Knopf „Alles als ZIP" (DSGVO-/Vertrauens-Argument im Verkauf).

### 🔗 Zusammenlegen / Verzahnen (macht „aus einer Hand" erst rund)

- **Kunde-360°-Akte** — EINE Seite je Kontakt mit allem: Angebote, Rechnungen, offene Posten, Termine, Dokumente, Fachpaket-Daten, SEPA. Das ist die stärkste Verzahnung überhaupt und macht die CRM-Wirbelsäule sichtbar.
- **Benachrichtigungs-/„Heute"-Zentrale** — ein Ort, der ALLE Ampeln bündelt: fällige Fristen (Kanzlei, HU/AU, Wartung, MHD), überfällige Rechnungen, Wiedervorlagen, ausgebuchte Kurse. Genau das Ziel deines „wachenden Auges", nur betriebsweit statt pro Modul.
- **Aktivitäts-Timeline** — je Kunde/Projekt eine lückenlose Chronik (Angebot gesendet, Termin, Rechnung, Zahlung). Perfekt für GoBD und Übersicht.

### 🧩 Mittlere Module (klarer Mehrwert, überschaubarer Bau)

- **Wiederkehrende Rechnungen** — Retainer, Wartungsverträge, Mitgliedsbeiträge automatisch monatlich fakturieren. Verzahnt IT-MSP, Agentur, Mitglieder & Immobilien — reine Umsatz-Automatik.
- **Beleg-Inbox mit OCR (Eingangsrechnungen)** — heute ist der Ausgang top, der Eingang fehlt. Foto/PDF rein → KI liest Betrag/Datum/USt → GoBD-Ablage → DATEV. Schließt den Buchhaltungs-Kreis.
- **Liquiditäts-/Cashflow-Vorschau** — offene Rechnungen + wiederkehrende Kosten → „So sieht dein Konto in 30/60/90 Tagen aus". Für den Mittelstand extrem wertvoll.
- **Urlaubs- & Abwesenheits-Workflow** — Antrag → Genehmigung → Kalender (baut auf vorhandenem hr_abwesenheiten auf).
- **Regel-Engine für Automatisierungen** — „wenn Rechnung 7 Tage überfällig → Mahnung", „wenn Termin gebucht → SMS". Macht dein bestehendes Automatisierungs-Modul mächtig.
- **Angebots-Kalkulation mit Deckungsbeitrag** — zeigt je Angebot die Marge, nicht nur den Preis.

### 🏗 Große Bausteine (strategisch, eigener Projekt-Umfang)

- **Installierbare App (PWA) + Offline** — du hast schon einen Service Worker (`SwRegister`). Daraus eine echte, installierbare App machen (Monteur-App, Kasse, Scanner offline). Killer für den Außendienst.
- **WhatsApp-Business- / SMS-Kanal** — Terminerinnerung, Bewertungsbitte, Rechnungsversand per WhatsApp. Im Handwerk enorm wirkungsvoll (Konnektor).
- **KI-Telefonassistent** — nimmt Anrufe an, bucht Termine, legt Kontakte an (du hast schon Voice-Ansätze: crm-voice). Sehr starkes Verkaufsargument.
- **DSGVO-Center** — Auskunft & Löschung je Kontakt auf Knopfdruck + Audit-Log „wer hat was geändert". Vertrauen + Compliance.
- **EÜR / einfache Buchhaltung** — für Kleinunternehmer eine schlanke Einnahmen-Überschuss-Rechnung direkt im System (ergänzt die DATEV-Brücke für alle ohne Steuerberater).

### 🌟 Meine Top 5 (wenn ich wählen müsste)

1. **Kunde-360°-Akte** — macht die Verzahnung erlebbar.
2. **GiroCode-QR auf Rechnungen** — winziger Aufwand, sofort Geld schneller drin.
3. **„Heute"-Zentrale** (alle Ampeln gebündelt) — dein wachendes Auge betriebsweit.
4. **Wiederkehrende Rechnungen** — Umsatz-Automatik über mehrere Module.
5. **Installierbare App + Offline** — der Außendienst-Vorteil, den kaum ein Wettbewerber sauber hat.

---

## 3) DEINE KONTROLLE / ENTSCHEIDUNG

- [ ] Welche Empfehlungen wandern in „DEINE PUNKTE" hoch (= wir bauen sie)?
- [ ] Reihenfolge / Priorität festlegen.
- [ ] Was streichen wir bewusst?

_(Platz für deine Notizen …)_
