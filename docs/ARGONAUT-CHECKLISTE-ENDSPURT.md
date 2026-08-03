# ARGONAUT OS — Checkliste Endspurt

**Präsentation: Donnerstag, 06.08.2026**
Letzte Aktualisierung: Montag, 03.08.2026

Diese Datei wird bei jedem erledigten Schritt fortgeschrieben.
Erledigtes bleibt mit `[x]` stehen, damit die Historie sichtbar ist.

---

## 1 · Vor der Präsentation

- [x] **Laufzeit-Rabatt rechnen** — `lib/tarif.ts`: `laufzeitRabattProzent()`, `laufzeitOptionen()`, `monatspreis(..., laufzeit)`, `angebotssumme()`. 24 Node-Tests bestanden. Einrichtung bleibt rabattfrei (AGB § 3.6). · Commit `d210ca8`
- [x] **Laufzeit-Auswahl im Angebot-Rechner** — 12 / 24 (−5 %) / 36 (−8 %) in `AngebotRechner.tsx` und `AngebotAnfrage.tsx`, Preis rechnet live mit, Listenpreis durchgestrichen, Ersparnis sichtbar, Laufzeit wandert in den Anfragetext. Gilt auch bei mehreren Standorten. · Commit `87cdf51`
- [x] **Gläubiger-Identifikationsnummer beantragt und erhalten** — DE31ZZZ00002934437, Deutsche Bundesbank, 03.08.2026
- [x] **B2B-Klausel § 14 BGB in die AGB** — § 1.4 Adressatenkreis, § 1.5 kein Widerrufsrecht, § 2.1 echter Bestellablauf, § 2.3 Vertragstext wird gespeichert und zugesandt, § 4.1a SEPA-Vorabankündigung auf 1 Bankarbeitstag, § 12.2 Gerichtsstand nach § 38 ZPO. · Commit `d849f99`
- [x] **Rabatt-Prozente auf der Website sichtbar** — Häkchenliste, Fußnote unter dem Rechner und Einrichtungs-Block nennen jetzt 5 % und 8 % ausdrücklich
- [x] **Tote FAIR_USE-Altlast aus `lib/tarif.ts` entfernt** — das alte 10k/50k-Staffelmodell mit +200 € widersprach „KI unbegrenzt inklusive" (AGB § 9.1)
- [ ] **Vier SEPA-Env-Variablen in Vercel setzen** — `SEPA_CREDITOR_NAME`, `SEPA_CREDITOR_IBAN`, `SEPA_CREDITOR_BIC`, `SEPA_CREDITOR_GLAEUBIGER_ID`
- [ ] **Inkassovereinbarung für SEPA-Basislastschriften** mit der Kreissparkasse Böblingen klären
- [ ] **Probe-Einzug** über `/admin/abo-einzug` durchführen

---

## 2 · Vor dem Versand der 698 Dossiers

- [x] **Generator + Muster-Dossier Bäckerei** — 698 Branchen aufgelöst, 19 Kategorien, 0 doppelte Slugs, alle mit eigenem SEO-Text. Durchgängig DM Sans wie die Website, große Schrift für Handy-Lesbarkeit, Seite 7 auf den 7+7-Tage-Demo-Funnel umgeschrieben. Überlauf-Wächter je Seite eingebaut.
- [ ] **Alle 698 PDFs erzeugen**
- [ ] **Öffentliche Bestellstrecke bauen** — Stufe und Sitze wählen → Laufzeit 12/24/36 → Unternehmerbestätigung nach § 14 BGB (Pflichtfeld, mit Firmenname und USt-IdNr.) → SEPA-Mandat → AGB, Datenschutz und AVV bestätigen → Bestellung → Konto wird automatisch angelegt → Auftragsbestätigung als PDF per E-Mail (AGB § 2.3 verlangt das)
- [ ] **Dossier-Funnel bauen** — Formular mit drei Häkchen → Lead unbestätigt → Double-Opt-In-Mail → PDF-Mail → Demo-Mail mit Einmalpasswort
- [ ] **Resend auf Pro heben** — das Tageslimit von 100 E-Mails im Free-Plan ist der harte Blocker, nicht das Monatsvolumen
- [ ] **Demo-Ablauf auf 7 Tage setzen** — Kulanzfrist steht bereits auf 7 Tage, zusammen ergibt das die auf Seite 7 versprochenen 14 Tage
- [ ] **AVV als Anlage** bereitstellen, inklusive Unterauftragnehmer-Liste (Supabase, Vercel, Hostinger, Resend, Anthropic, Voyage AI)

---

## 3 · KI-Kosten und Schutzmechanismen

**Was bereits sicher ist:**

- [x] AGB § 9 sauber auf „KI unbegrenzt inklusive" umgestellt — kein Kontingent, keine nutzungsabhängigen Zusatzkosten
- [x] § 9.2 erlaubt technische Rate-Limits, § 9.3 erlaubt Kontaktaufnahme und im Wiederholungsfall vorübergehende Begrenzung
- [x] Rate-Limit von 20 KI-Aufrufen je Nutzer und Minute — greift **vor** dem teuren Anthropic-Call (`lib/ki.ts`)
- [x] Demo-Konten: harte Obergrenze von 40 KI-Aufrufen pro Tag, abgelaufene Demo schaltet die KI serverseitig ab
- [x] Alle Prüfungen laufen als „best effort" — ein Datenbankfehler sperrt nie einen zahlenden Kunden aus

**Was noch fehlt:**

- [ ] **Kostenalarm scharfstellen** — `SCHWELLEN.ki.kostenAlarmTagUsd = 5` ist definiert, wird aber **nirgends im Code ausgewertet**. Es gibt aktuell weder ein Warnsignal noch eine automatische Reaktion.
- [ ] **Tages- oder Monatsobergrenze für zahlende Kunden** — das Minuten-Rate-Limit lässt rechnerisch bis zu 28.800 Aufrufe pro Nutzer und Tag zu. Nötig ist eine zweite Stufe: bei Überschreitung erst Warnung an den Betreiber, dann Kontakt zum Kunden, dann vorübergehende Begrenzung nach AGB § 9.3.
- [ ] **Prompt Caching einbauen** — senkt wiederholte Eingaben um bis zu 90 %
- [ ] **Batch API für asynchrone Aufgaben** — halbiert die Kosten für alles, was nicht in Echtzeit laufen muss: Newsletter, Social-Posts, Beleg-OCR, Auswertungen
- [ ] **Zeitkritisch:** Claude Sonnet 5 wird zum **01.09.2026** um 50 % teurer (2/10 → 3/15 USD je Mio. Token). Caching und Batch vorher scharfstellen.

---

## 4 · Danach

- [ ] Hostinger-Stufe prüfen — n8n ist stillgelegt, auf dem VPS läuft nur noch Gotenberg. Verlängerungspreis liegt beim 2,2- bis 2,6-Fachen des Aktionspreises.
- [ ] AGB-Häkchen aus dem reinen Anfrageformular nehmen — bei einer Kontaktanfrage wird kein Vertrag geschlossen
- [ ] Onboarding-Helfer als geführte Persönlichkeit + automatisches Abschluss-Zertifikat
- [ ] Demo-Drehbuch, Demo-Account, Onboarding-Durchlauf, Generalprobe
- [ ] Anwaltliche Endfreigabe: AGB, Datenschutzerklärung, AVV, Impressum, Preisangaben, Werbeaussagen
- [ ] ISO-Zertifizierungspfad (27001, ggf. 27017/27018/27701/9001)
- [x] AGB § 2.1 und § 2.3 an den echten Bestellablauf angepasst
- [x] Gerichtsstand § 12.2 nach § 38 ZPO präzisiert
- [x] Veralteten „→ n8n"-Kommentar in `AngebotAnfrage.tsx` bereinigt

---

## 5 · Externe Partner (nach der Präsentation)

- [ ] Hologramm-Avatar (Foto + Stimme) für das Onboarding
- [ ] KI-Telefonassistent (Retell/Vapi; Stimm-Klon self-hosted oder Cartesia/PlayHT; Abrechnung pro Minute passt zur SEPA-Lastschrift)
- [ ] Banking/finAPI für den Kontoabgleich
- [ ] Lohn/ITSG für die Lohnabrechnung
- [ ] WhatsApp Business API
- [ ] Import-Center: Schnittstellen zu Alt-Software über Partner

---

## Laufende Betriebskosten (Stand 03.08.2026)

Rund 200 € im Monat. Der einzige Posten, der mit der Kundenzahl mitwächst, ist die KI —
und dafür stehen die beiden Hebel oben unter Abschnitt 3.

| Dienst | Stufe | Kosten/Monat | Nächste Stufe |
|---|---|---|---|
| Google Workspace | Business | 6,80–21,10 € je Nutzer | Standard 13,60 €, Plus 21,10 € |
| eRecht24 | Premium | 34 € | — |
| Anthropic / Claude | API, nutzungsbasiert | ~100 € | wächst mit, keine Stufe |
| Supabase | Pro | 25 USD | Team 599 USD — **gleiche Kontingente**, nur SOC 2 / ISO / SSO |
| Vercel | Pro | 20 USD + Nutzung | Enterprise ~52.700 USD/Jahr (Median) |
| Hostinger | VPS (n8n-Template) | 7,79 € Aktion | Verlängerung 14,99 € |
| Resend | Free / Pro | 0–20 USD | Pro 100k 35 USD, Scale ab 90 USD |
| Voyage AI | Pay-as-you-go | Cent-Beträge | keine Stufen |
