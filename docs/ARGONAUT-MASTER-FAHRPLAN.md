# ARGONAUT OS — Master-Fahrplan

**Stand 18.08.2026 · Diese Datei ersetzt die parallelen Zählungen.**

---

## Warum es diese Datei gibt

Bis heute liefen **drei Nummerierungen nebeneinander**, und keine war falsch — sie
zählten nur verschiedene Dinge:

| Datei | Zählung | Stand |
|---|---|---|
| `ARGONAUT-ABHAKLISTE.md` | Abschnitte **1–20** | 09.08. |
| `ARGONAUT-UEBERGABE-GROSSE-BROECKEN.md` | Themen **1–10** | 14.08. |
| `ARGONAUT-UEBERGABE-LETZTE-BAUSTEINE.md` | Blöcke **A–O** | 16.08. |

„Punkt 5" konnte damit *Modul-Tiefe*, *Academy* oder *KI-Deckel* heißen. Ab hier gilt
**eine** Zählung: **M1 bis M18**. Die alte Nummer steht in jeder Zeile daneben, damit
sich ältere Notizen weiter zuordnen lassen.

> **Woher der Status kommt:** aus den Übergaben und aus dem, was im Code nachweisbar
> steht — **nicht aus einem Test im Browser.** „Fertig" heißt hier *gebaut und in
> Production*, nicht *geprüft*. Das Prüfen ist **M18**.

**Zeichen:** ✅ fertig · ⚠️ teilweise · ⬜ offen · 🔒 blockiert (Grund dabei)

---

## Zuerst: die drei harten Blocker

Nichts davon ist Code. Alles davon hält etwas anderes auf.

| # | Was | Hält auf | Vorlauf |
|---|---|---|---|
| **B1** | **AVV nach Art. 28 DSGVO** (Anwalt) | M15 Bestellstrecke · jeder Kundenbetrieb | ~3 Wochen |
| **B2** | **Resend auf Pro** | jeder Mailversand über 100/Tag · eigene Absender-Domain | 5 Minuten |
| **B3** | **Stripe prüfen** (Schlüssel liegen seit 05.05. in Vercel) | M15 Bestellstrecke | offen |

---

## M1 — Multistandort ⚠️
*(Abhakliste 1)*

Personal-Entsendung, Vorlagen-Sammelbecken, Pfad-Riegel je Standort, Lager je Filiale,
Filialvergleich, Chef-Schalttisch. Im Code stehen `aktiverStandort.ts`,
`standortModule.ts`, `leitungsrollen.ts`, `standortDaten.ts` — der Unterbau ist da.
**Welche der sechs Punkte wirklich fertig sind, ist ungeprüft.** Siehe
`UEBERGABE-MULTISTANDORT.md`.

## M2 — Termin statt Bestellung auf den Dossiers ⬜
*(Abhakliste 2)*

698 Dossiers auf „Termin vereinbaren" statt „Bestellen", angebunden an den bestehenden
Funnel mit Double-Opt-in. Die Bestellstrecke bleibt bewusst zurückgestellt (→ M15).

## M3 — KI-Kosten ✅
*(Abhakliste 3 · Thema 6 · Block E)*

Batch-API mit halben Kosten (`lib/kiBatch.ts`), Abhol-Cron alle 15 Minuten. Der
dreistufige KI-Deckel aus AGB § 9.3 steht in `lib/ki.ts`: Warnung ab 70 % des
Firmen-Topfs, stiller Puffer bis zum Doppelten, dann harte Sperre.
**Offen:** zentrales Prompt Caching (ungeprüft, ob aktiv).

## M4 — Buchhaltung und Geldfluss ⚠️
*(Abhakliste 4 · Block O)*

| Baustein | Stand |
|---|---|
| Beleg-Inbox mit KI-OCR | ✅ `app/api/beleg-ocr` |
| DATEV-Buchungsstapel (EXTF) | ✅ `lib/datevExtf.ts` |
| Liquiditäts-/Cashflow-Vorschau | ✅ `lib/cashflow.ts` |
| SEPA-Mandat, GiroCode/EPC-QR | ✅ `lib/sepa.ts`, `lib/girocode.ts` |
| USt-Aufteilung ohne Rechnung | ✅ Thema 9 |
| **finAPI-Bankabruf** | ⬜ Zugang wird gespeichert, automatischer Abruf fehlt |
| **ELSTER / ERiC** | 🔒 Kennziffern werden berechnet, Übermittlung fehlt — ERiC braucht einen echten Server, läuft nicht auf Vercel |
| Kartenzahlung / Bezahllink | ⚠️ `lib/bezahllink.ts` steht, Stripe ungeprüft (→ B3) |

**Martins Ansage vom 16.08.: finAPI und ELSTER ganz zuletzt.**

## M5 — Modul-Tiefe ⚠️
*(Abhakliste 5 · Block F)*

| Baustein | Stand |
|---|---|
| Fokus-/Detail-Umschalter (Einfach/Voll) | ✅ `lib/ansicht.ts` |
| Report-Baukasten inkl. Speichern und Planen | ✅ 18.08. |
| Angebots-Deckungsbeitrag + Branchen-Kalkulator | ✅ Thema 4 |
| Eigene Felder auf Rest-Module | ⚠️ siehe unten |

**Eigene Felder — der ehrliche Stand.** Von sieben Modulen der alten Liste hatten drei
es längst (`kfz`, `foerdermittel`, `ernte`), zwei kamen am 18.08. dazu (Leads,
Dokumente). **Drei sind fachlich falsch und werden nicht gebaut:** Kasse
(GoBD-Unveränderbarkeit), Mahnwesen (abgeleiteter Vorgang), Academy (globale
Datensätze). Die Fahrzeugakte hat null Schreibvorgänge — sie zeigt nur an.

## M6 — Verzahnung und Quick Wins ⬜
*(Abhakliste 6)*

Kunde-360°-Akte · „Heute"-Zentrale · globale Suche · Fachpaket → Rechnung überall ·
White-Label (Logo und Farben) · Konto-Export als ZIP · Verbrauch je Kunde im Command
Center. **Nicht geprüft, was davon schon existiert** — hier lohnt ein Blick vor dem
Bauen.

## M7 — Automations-Bauer und handelnde KI ⚠️
*(Abhakliste 7 · Thema 1 · Blöcke M und N)*

- ✅ **Automations-Bauer**: `automation_regeln` + `automation_log`, 9 Auslöser,
  5 Aktionen, 8 Vorlagen, Cron
- ⚠️ **WhatsApp**: `lib/whatsappVersand.ts` steht, Freischaltung offen
- ⬜ **Avatar**: `KiGuide.tsx` ist **fertig gebaut und wird nirgends eingesetzt**.
  Er hat `avatarUrl` und `onVorlesen` vorbereitet. Der schnellste Weg ohne Konto:
  gezeichnete SVG-Figur in Markenfarben + `speechSynthesis` des Browsers. Das
  Mitwandern von Modul zu Modul kann die Modul-Kapitel aus M12 vorlesen.
- 🔒 **Telefonassistent**: braucht Partnervertrag (Retell oder Vapi). Steht seit dem
  02.08. in vier Listen und wurde nie gebaut.

## M8 — Academy ✅
*(Abhakliste 8 · Thema 5)*

Videos, Untertitel, Medaillen, Chef-Übersicht. **Abweichendes RLS:** ohne
`mein_chef_id()` — sonst sähe jeder den Lernstand der Kollegen.

## M9 — Beleg-Foto je Einsatz ⚠️
*(Abhakliste 9)*

Foto-Upload → OCR → Ausgaben ist gebaut (`app/api/beleg-ocr`, `app/api/fotos`).
Ob die Kennzeichnung in die richtige Ausgaben-Route läuft, ist ungeprüft.

## M10 — Externe Motoren ⚠️
*(Abhakliste 10 · Block I)*

Alles hier braucht nur **Zugangsdaten**, kein neues Modul — der Code liest sie.
Marktplätze (Amazon/eBay/Kaufland/Otto) · shipcloud · Mail-/Kalender-Sync ·
Lohn/DATEV-ITSG · Geräte (TSE, Waage, Etikettendrucker — nur der Scanner ist live).

## M11 — Import-Center ✅
*(Abhakliste 11 · Thema 2)*

`import_jobs`, `lib/importParser.ts` mit echtem CSV, Zahl- und Datumserkennung und über
100 Alias-Zuordnungen, vierstufige Oberfläche. **Offen:** Import-Vorlage je Branche.

## M12 — Inhalte und Wachstum ⚠️
*(Abhakliste 13 · Block C)*

- ✅ **Inhalts-Werkstatt** unter `/admin/inhalte` — vier Knöpfe, ein Stapel je Typ
- ✅ **Provisions- und Empfehlungssystem** samt Gutschrift-PDF nach § 14 UStG
- ⬜ **Die Texte sind noch nicht bestellt.** 113 Modul-Kapitel, 19 Kategorie-Kapitel,
  698 Branchen-Vorworte, 698 KI-Dialoge — zusammen **2,40 USD** über die
  Stapel-Schnittstelle. Ergebnis landet als Entwurf; ohne Haken erscheint nichts.

**Wenn der Ton nicht gefällt:** nicht einzeln redigieren. Den System-Prompt in
`lib/inhaltPrompt.ts` ändern, Entwürfe löschen, für weitere 2,40 USD neu schreiben
lassen. Billiger als ein Abend Handarbeit.

## M13 — Marketing-Tiefe ⚠️
*(Abhakliste 14 · Block G)*

**Acht Kanäle sind direkt bespielbar** (Stand 18.08.):
Facebook · Instagram · Google Unternehmensprofil · LinkedIn · Mastodon · Bluesky ·
Telegram · Threads.

Dazu am 18.08.: **Versandprotokoll sichtbar**, gescheiterte Beiträge **wiederholbar**,
und ein **Post-Deckel**, der verhindert, dass Werbepost das Tageskontingent für
Mahnungen und Terminerinnerungen aufbraucht (`lib/mailBudget.ts`,
Umgebungsvariable `MAIL_TAGESBUDGET`).

**Offen:** YouTube und Pinterest (brauchen Binär-Upload) · X (~100 USD/Monat) ·
Video-Upload-Paket mit Bucket und Aufräum-Cron · Cockpit mit Zeitverlauf und
Klickraten · Zielgruppen aus dem CRM · Asset-Bibliothek mit Bild-KI ·
Landingpage mit vorbelegter Branche (**Neubau**, nicht Nachziehen —
`LP_KATEGORIEN` ist definiert, aber toter Code).

## M14 — Geräte, Außendienst, Infrastruktur ⚠️
*(Abhakliste 15 + 16)*

- ✅ **PWA + Offline**: maskable Icons, Installier-Knopf, Service Worker v2,
  Offline-Warteschlange, Cache-Leerung beim Abmelden
- 🔒 **Resend Pro** (→ B2), danach eigene Absender-Domain je Kunde. **Achtung:** in
  der alten Liste stand „1 Push" — das stimmt nicht. Der Absender*name* ist längst je
  Betrieb einstellbar; die *Domain* bedeutet Resend-Domain-Schnittstelle,
  DNS-Einträge anzeigen, Verifizierung abfragen.
- ⬜ Cloudflare R2, VPS-Batch-Tier

## M15 — Bestellstrecke scharfstellen 🔒
*(Block J · Reihenfolge zwingend)*

**Erst B3 (Stripe), dann B1 (Anwalt), dann diese Schalter.**
Kündigungsbutton nach § 312k · Auftragsbestätigungs-PDF (AGB § 2.3) ·
`BESTELLSTRECKE_LIVE` und `ZAHLUNG_LIVE` in `lib/flags.ts` auf `true`.

## M16 — Recht und Trust 🔒
*(Abhakliste 12 · Block K)*

✅ DSGVO-Center: Audit-Log (nur Feldnamen, nie Werte), Auskunft nach Art. 15, Löschung
nach Art. 17 mit Vorschau, Freigabewort und Nachweis, Datenlandkarte über 51 Tabellen.

🔒 **AVV nach Art. 28 (→ B1)**, AGB, Widerrufsbelehrung, § 312k, § 48b.
ISO 27001 / TISAX / SOC 2 später.

## M17 — Technische Schulden ⚠️
*(Abhakliste 17 · Thema 9)*

✅ Sicht `ausgaben_alle` (EÜR, BWA, Kennzahlen und Export lasen vorher nur einen der
beiden Ausgaben-Töpfe — **die Zahlen haben sich dadurch bewusst geändert**) ·
USt-Aufteilung mit wählbarem Satz · Rechte aufgeräumt · Landingpage-Messung entdoppelt ·
Rechnungsnummern je Betrieb statt systemweit.

⬜ Offen: Team-Chat-Bug (`docs/team-chat-bug.md`) · Analytics härten (Dedupe,
Berlin-Tagesgrenze, A/B-Signifikanz) · Dark-Baseline und Rest-Rollout der Seitenschale ·
`termine.kontakt_id` · tote Auge-Komponenten.

## M18 — Der Testtag ⬜ ← **zuletzt, ohne Abkürzung**
*(Abhakliste 18 · Block L)*

Rund 690 Node-Tests sind eine Sache. **Keine der neuen Oberflächen wurde je im Browser
bedient** — das ist der größte offene Posten im ganzen Projekt.

Zwei Personen gleichzeitig (Chef und Mitarbeiter), damit sich zeigt, ob das Rechtesystem
trennt. **Die drei Geldstellen zuerst:** DSGVO-Löschung mit einem Testkontakt komplett
durchspielen (unumkehrbar) · Provisions-Auszahlung samt Gutschrift-PDF auf
Pflichtangaben prüfen · EÜR und DATEV-Export gegen den alten Stand halten.
Dann alles auf dem Telefon, besonders Zeiterfassung und Beleg-Foto.

---

## Geparkt — wird nicht gebaut

Talent-/Bewerber-Marktplatz · ARGONAUT Universum · die alte Agenten-Seite wiederbeleben
(Schaufenster ohne Funktion, Code bleibt liegen) · öffentliche Bestellstrecke vorziehen
(bewusst zurückgestellt bis ~100 Kunden).

---

## Umrechnungstabelle alt → neu

| Abhakliste | Block | Thema | neu |
|---|---|---|---|
| 1 | — | — | M1 |
| 2 | — | — | M2 |
| 3 | E | 6 | M3 |
| 4 | O | — | M4 |
| 5 | F | 4 | M5 |
| 6 | — | — | M6 |
| 7 | M, N | 1 | M7 |
| 8 | — | 5 | M8 |
| 9 | — | — | M9 |
| 10 | I | — | M10 |
| 11 | — | 2 | M11 |
| 12 | K | 7 | M16 |
| 13 | C | 8, 10 | M12 |
| 14 | G | — | M13 |
| 15, 16 | — | 3 | M14 |
| 17 | — | 9 | M17 |
| 18 | L | — | M18 |
| 19 | I | — | M10 |
| 20 | — | — | geparkt |
| — | D | — | erledigt 17./18.08. |
| — | H | — | Entscheidungen, kein Code |
| — | J | — | M15 |

---

## Weitere Dateien

`ARGONAUT-UEBERGABE-NACH-URLAUB.md` — der Einstieg nach der Rückkehr ·
`ARGONAUT-UEBERGABE-LETZTE-BAUSTEINE.md` — Blöcke A–O im Detail ·
`ARGONAUT-UEBERGABE-GROSSE-BROECKEN.md` — Themen 1–10 ·
`ARGONAUT-ABHAKLISTE.md` — die alte 20er-Zählung ·
`ARGONAUT-GESAMTLISTE.md` — enthält den Telefonassistenten ·
`supabase-sql/` — alle eingespielten SQL-Dateien.
