# ARGONAUT OS — Gesamtliste

**Stand: Dienstag, 04.08.2026, 09:45 Uhr**

> **Diese Liste ist jetzt in vier PDFs aufgeteilt** — Donnerstag, Zwei-Personen-Tests,
> Was noch zu bauen ist, Extern & Warten. Sie bleibt die Quelle, aus der die PDFs entstehen.
**Präsentation: Donnerstag, 06.08.2026 · Testtag: Mittwoch, 05.08.2026**

> **Wie diese Liste zu lesen ist.**
> ✅ = am echten Code nachgeprüft und belegt. Nicht „ich glaube, das haben wir gemacht".
> ⬜ = offen.
> ⚠️ = die alte Liste war an dieser Stelle **falsch** — die Korrektur steht dabei.
> 🔍 = konnte in dieser Runde nicht geprüft werden (Rechner war offline), Status unsicher.
>
> **Das Audit-Muster.** In diesem Projekt hat sich immer wieder gezeigt: vermeintlich
> offene Punkte waren längst gebaut — und fertig gebaute Teile wurden nie
> eingeschaltet. Allein am 03.08. gefunden: Laufzeitrabatt (in den AGB, nie
> berechnet), Kostenalarm (definiert, nie ausgewertet), Anschlüsse-Bausteine
> (fertig, nie verdrahtet), KI-Auge/KI-Guide/geführte Tour (fertig, nie importiert),
> Modul-Liste in den Einstellungen (nie nach Branche gefiltert).
> **Vor dem Bau jedes Punktes erst am echten Code prüfen.**

---

# 🔴 STUFE 1 — vor Mittwoch. Nur Martin.

- ⬜ **SQL ausführen**: `supabase-sql/team-chat-mandantentrennung.sql` im Supabase-Editor. Schließt das Loch, durch das man betriebsfremde Personen in einen Chat-Kanal holen konnte.
- ⬜ **Unterschrift als PNG** mit durchsichtigem Hintergrund fürs Zertifikat
- ⬜ **Offene Pushes rausschicken** (liegen fertig im Repo)
- ⬜ **Übungswelt im eigenen Konto einmal entfernen und neu laden** — deine geladene Fassung stammt von vor der Anschlüsse-Reparatur
- ⬜ Entscheidung: Was passiert mit der Kachel **„KI-Calls diesen Monat 0 / 15.000"**? Sie widerspricht deinem eigenen Pitch („KI — unbegrenzt inklusive")

---

# 👥 ZWEI-PERSONEN-TESTS — heute Abend

> **Warum das ein eigener Punkt ist.** Bei Martin sieht die Seite regelmäßig
> anders aus als bei seiner Freundin — anderes Gerät, anderer Browser, anderes
> Konto, andere Rechte. Genau so wurde der unscrollbare Bestätigungsdialog
> gefunden, den vorher niemand bemerkt hatte. Alles, was zwei Menschen oder zwei
> Geräte braucht, gehört hierher statt in einen Einzeltest.

- ⬜ **Team-Chat, beide Richtungen** — ein Fenster als Chef, eines als Mitarbeiter im selben Betrieb.
  Erwartung: Der eigene Satz erscheint **sofort** beim Absender, beim anderen innerhalb von Sekunden.
  Zusätzlich prüfen: Datei anhängen, `@ARGONAUT` ansprechen, Kollegen einladen.
  Wenn etwas nicht klappt, steht der Grund jetzt in einem roten Kasten — **den Wortlaut aufschreiben**, der zeigt die Ursache.
- ⬜ **Zugriffsrechte** — Chef schaltet einem Mitarbeiter Module frei, Mitarbeiter lädt neu: sieht er genau diese und keine anderen?
- ⬜ **Bestätigungsdialoge auf kleinem Bildschirm** — Laptop und Handy, nicht nur der große Monitor
- ⬜ **Login mit gespeichertem Passwort** auf einem zweiten Gerät
- ⬜ **Onboarding aus Sicht eines frischen Kontos** — nicht aus deinem, das schon alles gesehen hat

---

# 🔴 STUFE 2 — vor Donnerstag bauen

Nach Wirkung sortiert. Was ein Besucher am Bildschirm sieht, steht oben.

| # | Punkt | Warum jetzt |
|---|---|---|
| ✅ | **Gemeinsame Seitenschale** für alle Dashboard-Seiten | erledigt 04.08. — `<main>` im Layout, vier Seiten nachgezogen |
| ✅ | **Repo aufräumen** | erledigt 04.08. · `c4dc879` |
| ✅ | **KI-Calls-Kachel** raus | erledigt 04.08. |
| ✅ | **Team-Chat** repariert und abgesichert | erledigt 04.08. · `07fd664` |
| ⬜ | **KI-Auge auf Personal und Aufträge** | Akt 4 des Drehbuchs — braucht neue Regel in `lib/auge.ts` |
| ⬜ | **Überlauf-Hinweis** `OverusePopup` entscheiden | arbeitet noch mit dem alten KI-Limit |
| ⬜ | Seitenschale über die restlichen Modulseiten nachziehen | Mittwoch, beim Durchklicken |
| ⬜ | Demo-Konten durchklicken (Maler, Autohaus, Bäckerei) | Generalprobe |

## Punkt 1 im Detail — die schiefe Seitenansicht

Ich habe die Ursache gefunden. Sie ist ärgerlich einfach:

**`app/dashboard/layout.tsx` rendert `{children}` ohne jeden Rahmen.** Kopfzeile,
Menü und Demo-Banner sitzen alle in `maxWidth: 1600px`. Der Seiteninhalt darunter
bekommt **gar keinen Container** — jede Modulseite legt ihre Breite selbst fest.
Das Ergebnis:

| Seite | Breite | Innenabstand |
|---|---|---|
| Kopfzeile & Menü | 1600 px | 16–48 px |
| Etiketten & LMIV | 1400 px | **keiner** |
| Rechnungen | 1200 px | 32/24 px |
| CRM | 1200 px | 32/28 px |
| Landwirtschaft, Forst | 1020 px | **4 px** |
| Schlagkartei | **unbegrenzt** | 28/24 px |

Deshalb wirkt der Inhalt mal schmal, mal randlos, und nie bündig mit der Kopfzeile.
Es sind nicht „ein paar Seiten kaputt" — es gibt schlicht **keine gemeinsame
Seitenschale**. Der Fix ist ein Bauteil, das einmal ins Layout kommt.

**Der türkise Rahmen auf deinen Bildern ist dein Screenshot-Werkzeug, nicht die
Seite.** Im ganzen Projekt gibt es kein `zoom`, kein `transform: scale()` und keine
Cyan-Umrandung um den Bildschirm. Der Knopf „Präsentation" unten links und der
goldene Blitz unten rechts (PULS-Chat) sind gewollt und stehen bewusst auf jeder
Seite.

---

# ✅ ERLEDIGT — nachgeprüft

## Geld und Recht
- ✅ Laufzeit-Rabatt 5 % / 8 % wird berechnet — `lib/tarif.ts`, 24 Tests · `d210ca8`
- ✅ Laufzeit-Auswahl 12/24/36 in beiden Rechnern · `87cdf51`
- ✅ Preise angehoben, Standort-Zuschlag 49 €/Monat + 190 € einmalig · `bafc0ae`
- ✅ AGB: § 14 BGB (nur B2B), kein Widerrufsrecht, echter Bestellablauf, Vertragstext, SEPA-Vorabankündigung, Gerichtsstand · `d849f99`
- ✅ Rabatt-Prozente auf der Website sichtbar, FAIR_USE-Altlast entfernt · `f95e905`
- ✅ Gläubiger-ID beantragt und erhalten — DE31ZZZ00002934437
- ✅ Impressum: Telefonnummer eingetragen · `a7e6919`

## Website und Sichtbarkeit
- ✅ Branchenzahl vereinheitlicht auf 698
- ✅ Alle 698 Branchen-Dossiers erzeugt — 7 Seiten, individuell je Branche
- ✅ **Sitemap deckt alle 698 Branchen ab** — `app/sitemap.ts` liest `websiteBranchen()`, kein Zahlenlimit
- ✅ **Alte weiße Branchenseite abgelöst** — `app/branchen/page.tsx` ist nur noch ein Verweis auf die dunkle Seite
- ✅ **Spartanerhelm aus dem gesamten Projekt entfernt**, Dreizack an 7 Stellen (Dashboard, Login, Passwort-neu, Admin, App-Symbol, weiße Restseiten)
- ✅ **Emoji-Dreizack 🔱 durch das echte Logo ersetzt** — Webseiten-Kopf, Fußzeile, Startseite, Vorführbildschirm, Sperrbildschirm, Branchenseite, Terminbuchung
- ✅ Ein Bauteil für das Logo: `components/Dreizack.tsx` — eine Datei, überall gleich

## KI-Kosten und Schutz
- ✅ Tagesgrenze je Sitz-Typ (150 / 60 / 15) · `8f0d389`
- ✅ Firmen-Topf statt Einzellimit, stiller 2×-Puffer, 70 % / 100 % / 200 % · `0bc20ab`
- ✅ Kostenalarm scharfgestellt (war definiert, wurde nirgends ausgewertet)
- ✅ KI-Monatsbericht an den Betreiber
- ✅ Cron entschärft: social-posten lief **jede Minute** → alle 6 Minuten · `5e3949f`
- ✅ `APP_ENC_KEY` und `CRON_SECRET` in Vercel gesetzt
- ✅ **KI-Klartext feuert nicht mehr von selbst** — `autoStart = false`, es passiert erst beim Klick. Geprüft in `KiKlartext.tsx` Zeile 51/77/125.

## Onboarding
- ✅ Ränge „Vom Matrosen zum Kapitän" mit Leiste unter dem Balken · `6c6e6d4`
- ✅ Aufleuchtendes Auge — nur bei echtem Aufstieg
- ✅ Abschluss-Zertifikat mit echtem Dreizack, Stempel, beherrschten Bereichen · `357dfad`
- ✅ `lib/onboardingBereiche.ts` — alle 62 Branchenschritte von Hand benannt
- ✅ KI-Guide und geführte Tour eingeschaltet (lagen fertig im Repo, nie importiert) · `ccf6817`

## Vorführung
- ✅ 21 Vorführ-Betriebe **angelegt und befüllt** — 719 Datensätze, alle Konten leben
- ✅ Anschlüsse-Lücke geschlossen — echtes Schema statt Annahme: `bank_zugang` braucht `aggregator`, fünf Tabellen haben keine `id`
- ✅ Zugangsblatt als PDF, alle 21 auf einer Seite
- ✅ Öffentliche Vorführung über alle 698 Branchen — Suche, Sperrbildschirm, anfassbarer Preis · `b5a816c`
- ✅ QR-Code führt auf die echte Branchenseite mit Rechner und Terminbuchung · `357f72d`
- ✅ 60-Sekunden-Pitch und Demo-Drehbuch — als PDF geliefert

## Zugriffsrechte
- ✅ Ordnung wie im Hauptmenü — vorher 21 von 116 gruppiert, 95 im Auffangtopf · `a56c993`
- ✅ Zähler „116 von 112" korrigiert · `65c4064`
- ✅ Zähler Änderungsrecht korrigiert
- ✅ Bestätigungsdialog scrollbar · `abc351a`
- ✅ Dubletten im Dialog entfernt
- ✅ **Modul-Dublette aufgelöst** — `rechnungen` stand 5× in `NAV_LINKS`

## Einstellungen
- ✅ **„Module & Ansicht" zeigt nur noch die Module des eigenen Betriebs** — dieselbe Quelle wie das Menü (`tenant_module`). Vorher sah ein Metallbauer Baumkataster und KFZ-Fachpaket.

## Kleinigkeiten
- ✅ Login: `autoComplete` gesetzt, Browser bietet Passwort speichern an · `e4ea349`
- ✅ Übungswelt zeigt alle gefüllten Bereiche statt nur „Im CRM ansehen"

---

# ⚠️ KORREKTUREN — hier war die alte Liste falsch

## ✅ Team-Chat — untersucht und repariert am 04.08.

Die alte Fehlerakte `docs/team-chat-bug.md` zeigte in die **falsche Richtung**: sie
vermutete ein Problem mit `owner_user_id` und `mein_chef_id()`. Beides existiert im
Team-Chat gar nicht — er läuft über Kanäle und Mitgliedschaften, nicht über die
Betriebs-Spalte wie der Rest des Systems. Die Akte wurde nach dem Muster der
anderen Module geschrieben, ohne in diese Tabellen zu schauen. Deshalb hat die
Suche nie etwas gefunden.

**Realtime war es nicht.** Geprüft: `chat_nachrichten` steht in
`supabase_realtime`. Die echten Fehler lagen im Code:

- ✅ **Eigene Nachricht erschien nicht beim Absender.** `senden()` fügte ein und
  wartete darauf, dass die Live-Verbindung das Einfügen zurückmeldet — die Zeile
  wurde nie lokal angezeigt. Jetzt gibt die Datenbank die fertige Zeile direkt
  zurück, Dublette wird über die ID abgefangen.
- ✅ **Fehler wurden stumm verschluckt.** Bei einem Fehler sprang nur der Text ins
  Feld zurück, sonst nichts. Jetzt: roter Kasten mit dem Grund auf Deutsch —
  „Du bist kein Mitglied dieses Kanals" statt `42501`.
- ✅ **Datei-Upload:** der Fehler beim Anlegen der Nachricht wurde **gar nicht
  abgefragt**. Datei lag im Speicher, Nachricht erschien nie. Jetzt mit
  Fehlermeldung und Aufräumen der verwaisten Datei.
- ✅ **Sicherheitsnetz**, falls die Live-Verbindung nicht steht (Firmen-Firewall):
  alle 8 Sekunden nachladen, Zustand sichtbar.
- ⬜ **SQL noch auszuführen:** `supabase-sql/team-chat-mandantentrennung.sql`

## 🔒 Team-Chat: Mandantentrennung war offen — SQL liegt bereit

`chat_mitglied_per_email` und `chat_mitglied_hinzufuegen` laufen beide mit
`SECURITY DEFINER` und prüften **nur**, ob der Aufrufer den Kanal erstellt hat —
**nicht**, ob die eingeladene Person zum selben Betrieb gehört. Über die
öffentliche Schnittstelle konnte man damit jeden ARGONAUT-Nutzer in seinen Kanal
holen. Die Oberfläche bot es nur nicht an; verhindert hat sie es nicht.

Behoben in `supabase-sql/team-chat-mandantentrennung.sql`: neuer Helfer
`chat_betrieb_von()`, Prüfung in beiden Funktionen, gleiche Antwort für
„unbekannt" und „fremder Betrieb" (sonst ließe sich durchprobieren, welche
Firmen ARGONAUT einsetzen). Dazu die Löschregel für KI-Nachrichten — die hatten
`absender_id = null` und ließen sich von niemandem entfernen.

## ⚠️ n8n ist **nicht** stillgelegt
Die Liste behauptete: „n8n stillgelegt, nur noch Gotenberg." Falsch.

- `.env.local` enthält weiterhin `N8N_ANGEBOT_SENDEN_URL`
- `app/api/leads/angebot-senden/route.ts` Zeile 80–124 schickt einen **echten POST an den n8n-Webhook** und bricht mit Fehler 503 ab, wenn die Variable fehlt

Der Weg „Angebot an Lead senden" hängt heute an n8n. **Wenn du den VPS kündigst, bricht diese Funktion.** Das muss vor jeder Kündigungsentscheidung geklärt sein.

Gotenberg läuft parallel und wird an drei Stellen benutzt: `lib/document-engine.ts` (Word → PDF), `app/api/signatur-pdf`, `app/api/korrespondenz-pdf`.

## ⚠️ `verkaufschancen` ist **nicht** verwaist
Die Liste sagte „abschalten". Die Tabelle wird an vier Stellen aktiv gelesen:

- `app/dashboard/page.tsx:130` — Live-Cockpit
- `app/api/dashboard-chat/route.ts:45`
- `app/api/crm-nba/route.ts:51`
- `app/api/kontakte/zusammenfuehren/route.ts` (mehrfach)

**Nicht abschalten.** Erst umstellen, dann abschalten — sonst fehlen dir Zahlen im Cockpit.

## ⚠️ Es gibt **kein einziges** TODO/FIXME im Code
Durchsucht: 348 Quelldateien in `app/`, `lib/`, `components/`. Null Treffer. Die offenen Punkte stehen ausschließlich in den Dokumenten, nicht im Code. Das ist ein gutes Zeichen.

---

# 🟡 MITTWOCH — Testtag

- ⬜ Drei Demo-Konten anmelden (Maler, Autohaus, Bäckerei) — Dashboard, CRM, Rechnungen, Anschlüsse, Onboarding
- ⬜ Beim Maler: Rang, Auge, „noch X Prozent bis …"
- ⬜ Zertifikat einmal herunterladen und öffnen
- ⬜ **Auf dem echten 43-Zöller**: Suche („mal", „feuer"), Bildschirmtastatur, Zoom, Touch
- ⬜ QR-Code mit dem Handy scannen
- ⬜ Preisbild antippen: 1 Person → 499 €, 300+ → 41.728 €
- ⬜ Sperrbildschirm: zwei Minuten nichts anfassen
- ⬜ Zugangsblatt ausdrucken
- ⬜ Handy-Hotspot einrichten und testen
- ⬜ Generalprobe komplett durchklicken
- ⬜ Alle ~130 Modulseiten abgehen: wo sitzt das KI-Auge, wo fehlt es

---

# 🟠 KURZ NACH DONNERSTAG — hat eine Frist

## Frist 31.08.2026 — danach wird es teurer
- ⬜ **Prompt Caching aktivieren.** Geprüft: `lib/ki.ts` Zeile 82–83 liest `cache_creation_input_tokens` und `cache_read_input_tokens`, setzt aber **nirgends** `cache_control`. Die Ersparnis wird gemessen, aber nie erzeugt. Halbiert die Kosten.
- ⬜ **Batch API.** Geprüft: kein einziger Treffer auf `messages/batches` im ganzen Projekt. Nochmal −50 % für Newsletter, Social-Posts, Beleg-OCR, Auswertungen.
- ⬜ Grund: Sonnet 5 wird zum 01.09. um 50 % teurer (2/10 → 3/15 USD)

## Wartet auf die Bank
- ⬜ Vier Env-Variablen in Vercel: `SEPA_CREDITOR_NAME`, `_IBAN`, `_BIC`, `_GLAEUBIGER_ID`
- ⬜ Inkassovereinbarung Kreissparkasse Böblingen — Frist, Limits, Upload-Weg für pain.008
- ⬜ Probe-Einzug über `/admin/abo-einzug`
- ⬜ Kontofrage klären, bevor die IBAN eingetragen wird

## Blockiert den Versand der 698 Dossiers
- ⬜ **Resend auf Pro** — Free hat 100 Mails/Tag. Der harte Blocker. Pro 20 USD.

---

# 🧹 AUFRÄUMEN — heute Nacht vorbereitet

## ✅ 25 Sicherungsdateien, rund 600 KB — ERLEDIGT · `c4dc879`
Gelöscht am 04.08. Der Commit zeigt 2.996 entfernte Zeilen. Die 21 kleineren
Dateien standen nie unter Versionskontrolle und tauchen deshalb nicht im Commit
auf — von der Platte sind sie trotzdem weg.

| Ort | Dateien |
|---|---|
| Wurzel | `.env.local.BACKUP.20260616`, `.gitignore.backup` |
| Command Center | 3 Sicherungen à ~70 KB |
| Leads | 6 Sicherungen |
| Dokumente | 5 Sicherungen |
| `lib/document-*` | 5 Sicherungen |
| `db/` | `policies-backup-2026-07-14.sql` (113 KB) |

## ✅ Zwei geparkte Module raus — ERLEDIGT · `c4dc879`
- `app/dashboard/agenten/` (6 KB) — liest Tabelle `agents`, aus dem Menü genommen, **von nirgends mehr verlinkt**
- `app/dashboard/automatisierungen/` (13 KB) — liest Tabelle `automatisierungen`, aus dem Menü genommen
- ✅ Die letzten zwei Verweise darauf im Live-Cockpit habe ich **bereits entfernt**: die Kachel „Aktive Automatisierungen" und den Kasten „Automatisierungs-Bibliothek — 128 Workflows in 15 Clustern" (die Zahl war frei erfunden, nicht gezählt)

## ⬜ Master-Fahrplan neu durchnummerieren
`docs/ARGONAUT-MASTER-BRIEFING.md`, 45 KB, zuletzt 27.07. Die oberste Ebene (0–10) ist sauber. **Darunter laufen zwei Zählungen parallel**, beide fangen bei 1 an: „Baustein 1–6" und „A1–A12". Das ist die Verwirrung.

## ⬜ Weitere technische Schulden
- ⬜ Analytics: `aufruf` zählt jeden GET ohne Dedupe, UTC- statt Berlin-Tagesgrenze, A/B-Sieger ohne Signifikanz
- ⬜ Autoresponder-Grenzen prüfen (`SOFORT_MAX=50`, `MAX_PRO_DURCHGANG=300`)
- ⬜ Lager-Zuordnung im Shop-/Ernte-Weg: echter Katalog-Match statt Namensvergleich
- ⬜ Eigene Absender-Domain je Kunde
- ⬜ **„Angemeldet bleiben"-Häkchen** im Login — greift in die Sitzungs-Cookies

---

# 💾 DATENBANK

- ⚠️ `verkaufschancen` **nicht** abschalten — siehe Korrekturen oben
- ⬜ **`ausgaben` vs. `eingangsbelege`** — zwei getrennte Ausgaben-Töpfe. Geprüft: `ausgaben` wird nur noch an **einer** Stelle gelesen (`app/dashboard/page.tsx:140`), alles andere läuft über `eingangsbelege`. Also ein kleiner, sauberer Umbau.
- ⬜ **Verwaiste Schreibrechte in `mitarbeiter_rechte`** — Karteileichen zu Modulen, die nicht mehr freigeschaltet sind. Ungefährlich, haben aber den Zähler verwirrt.
- 🔍 `termine.kontakt_id` — Termine nur per E-Mail gescoped. Konnte nicht geprüft werden (Rechner offline).
- 🔍 Mehrbank-Migration `bank_zugang` — SQL geliefert, Ausführung nie bestätigt. **Achtung:** Nach der heutigen Reparatur schreibt die Übungswelt `aggregator = 'demo'` in `bank_zugang`. Vor der Migration prüfen.
- ⬜ USt-Aufteilung im Mini-Paket — Zahlung ohne Rechnung zählt als voller Netto
- ⬜ Connector-SQL bei jedem neuen Demo-Konto wiederholen

---

# 📦 TEIL B — vor dem Versand der 698 Dossiers

## B1 · Öffentliche Bestellstrecke — der größte Brocken
Der Knopf „Jetzt buchen" steht auf Seite 7 aller 698 Dossiers.
- ⬜ Stufe und Sitze → Laufzeit 12/24/36 → **Unternehmerbestätigung § 14 BGB** → Firmendaten → SEPA-Mandat → AGB/Datenschutz/AVV → verbindlich bestellen
- ⬜ Konto automatisch anlegen (Muster: `/api/admin/kunde-einladen`)
- ⬜ Auftragsbestätigung als PDF per E-Mail — AGB § 2.3 verlangt das
- ⬜ Laufzeit-Rabatt serverseitig rechnen, nie im Browser

## B2 · Dossier-Funnel mit Double-Opt-In
- ⬜ Anfrageformular: E-Mail + Branche + drei Pflicht-Häkchen
- ⬜ Lead in Supabase mit Status „unbestätigt" + Einmalpasswort
- ⬜ Bestätigungsmail (Logik liegt fertig in `lib/newsletter.ts`)
- ⬜ Nach Klick: Begrüßungsmail + PDF-Mail + Demo-Mail mit Zugangsdaten
- ⬜ Zugangsseite: E-Mail + Einmalpasswort → Signed-URL → PDF
- ⬜ 698 PDFs in Supabase Storage hochladen
- ⬜ Demo-Ablauf auf 7 Tage (+ 7 Tage Kulanz = die versprochenen 14)

## B4 · AVV als Anlage
- ⬜ Auftragsverarbeitungsvertrag nach Art. 28 DSGVO als feste Vertragsanlage
- ⬜ Unterauftragnehmer-Liste: Supabase, Vercel, Hostinger, Resend, Anthropic, Voyage AI
- ⬜ Technische und organisatorische Maßnahmen beschreiben
- ⬜ AGB § 11.3 anpassen (stellt den AVV heute nur „auf Anfrage" bereit)

---

# ⚖️ RECHT UND ZERTIFIZIERUNG

- ⬜ **Anwaltstermin** — AGB, Datenschutz, AVV, Impressum, Widerruf, Preisangaben, Werbeaussagen
- ⬜ AGB-Frage: automatische Verlängerung um jeweils ein Jahr
- ⬜ AGB-Häkchen aus dem reinen Anfrageformular nehmen (dort wird kein Vertrag geschlossen)
- ⬜ **Kündigungs-Bereich nach § 312k BGB** — geprüft: `app/api/vertrag-kuendigung/route.ts` existiert, **keine einzige Seite verweist darauf**. Nur die Oberfläche fehlt.
- ⬜ ISO 27001 als Türöffner; zusätzlich 27017/27018, 27701, 9001
- ⬜ TISAX — Pflicht für Automobil-Zulieferer
- ⬜ SOC 2, BSI IT-Grundschutz, Penetrationstest
- ⬜ ISO-Normen auf der Website ausweisen, sobald vorhanden

---

# 🤝 EXTERNE PARTNER

## KI-Telefonassistent
- ⬜ Anbieter wählen: Retell oder Vapi
- ⬜ Stimm-Klon: self-hosted (XTTS, StyleTTS2, F5-TTS) oder Cartesia / PlayHT
- ⬜ Abrechnung pro Minute — passt zur SEPA-Lastschrift
- ⬜ Daran hängt die Gesprächsanalyse

## Avatar und Stimme
- ✅ Stufe 1 läuft seit 03.08. — leuchtende Gestalt mit Text. `KiGuide` hat `avatarUrl` und `onVorlesen` bereits vorgesehen, Stufe 2 und 3 brauchen keinen Umbau.
- ⬜ Gesicht — HeyGen/Synthesia (vorgerendert) oder Simli/Anam/Tavus (Echtzeit)
- ⬜ Stimme — ElevenLabs ab ca. 22 USD/Monat
- ⬜ Entscheidung: geklonte oder neutrale Stimme?

## Banking, Steuern, Lohn
- ⬜ finAPI — Kontoabgleich live (CSV-Abgleich läuft bereits ohne Partner)
- ⬜ ELSTER / ERiC — Steuernummer und Zertifikat. UStVA wird berechnet, nur der Übermitteln-Knopf fehlt.
- ⬜ Lohn / ITSG — Lohnabrechnung und DATEV-Export

## Marketing-Kanäle und Versand
- ⬜ WhatsApp Business API — Meta-Konto + Nummer + Token oder 360dialog
- ⬜ Social-Konten: Facebook, Instagram, Google Unternehmensprofil, LinkedIn
- ⬜ Werbekonten: Meta, Google Ads, LinkedIn, TikTok
- ⬜ Marktplätze: Amazon, eBay, Kaufland, Otto
- ⬜ Versand-Anbieter entscheiden: shipcloud vs. Sendcloud vs. Direktverträge
- ⬜ `GOOGLE_ADS_DEVELOPER_TOKEN`, shipcloud-API-Key

---

# 💰 VERTRIEB UND WACHSTUM

- ⬜ **Multiplikatoren-Programm statt Rabatt** — begrenzte Zahl kostenloser SOLO-Zugänge als Gegengeschäft mit Vertrag (Name, Logo, Zitat, Nennung je Quartal). Schützt die Preisliste, weil es ein Tausch ist und kein Nachlass.
- ⬜ **Vermittlungsprovision** — `lib/provision.ts` liegt bereits im Repo. Kostet nur, wenn es funktioniert.
- ⬜ Schäfer-Pilot ins integrierte System einklinken (vorher echte Daten sichern)
- ⬜ Erste Kunden aus dem 698-Funnel onboarden
- ⬜ **Feuerwehren als Markt** — Modul-Fit ungewöhnlich gut: Prüffristen (Atemschutz, Leitern, Schläuche), Gerätewart, Mitglieder und Jugendfeuerwehr, Lehrgänge, Einsatzberichte. Haken: das Geld kommt von der Kommune, also Ausschreibung und langer Zyklus. Dafür extrem gut vernetzt.
- ⬜ **698 KI-Dialoge** — Ordner `lib/vorfuehrtexte/` mit Blöcken à ~70 Branchen. Der Motor greift bereits darauf zu, ein neuer Block wirkt sofort. Erst nach Donnerstag, mit den echten Fragen aus dem Raum.

---

# 🌍 LANGFRIST-VISION

- Solar- und Wind-M&A in Rumänien, Bulgarien, Spanien, Portugal, Griechenland
- VESTA Stadtwerke
- Neobank-Leiter: Yapeal → Neon → N26 → Commerzbank
- Acht ARGONAUT CITIES: NOVA, KOSMOS, TERRA, VITA, MARE, SOLARIS, AURORA, HELIOS
- Hyperloop-EU-Netz
- ARGONAUT Intelligence — eigenes Llama-Fine-Tuning ab etwa 500 Kunden
- Mond 2040, Mars 2050
- *Verworfen: Kernkraft / PROMETHEUS — nur noch Solar und Wind*

---
---

# 📋 ANHANG — ALLE MODULE, DIE NOCH GEBAUT WERDEN MÜSSEN

Auf deinen Wunsch: alles, was „Modul" ist und noch fehlt, an einem Ort.
Sortiert nach Aufwand, nicht nach Wunsch.

## M1 · Multistandort — Datenebene
**Der Preisrechner ist gebaut und verkauft es. Die Datenebene fehlt komplett.**
Das ist die größte Lücke zwischen dem, was du anbietest, und dem, was läuft.

- ⬜ `standorte`-Tabelle, `mitarbeiter.standort_id`
- ⬜ Modul-Freischaltung pro Filiale
- ⬜ Filialleiter als Rolle in der vierstufigen Delegation
- ⬜ Daten-Scoping über `standort_id` + Filial-Umschalter, Modul für Modul
- ⬜ Zentrale Roll-up-Auswertung und Filialvergleich

## M2 · Sitz-Typ als echte Rechteschicht
**Geprüft: In `lib/rechte.ts` kommt „Sitz" kein einziges Mal vor.** Der Sitz-Typ
(Voll / Standard / Self-Service) existiert nur in `lib/tarif.ts` als Preis. Ohne
diese Schicht verkaufst du eine Staffel, die technisch nicht existiert.

## M3 · Anschluss-Motoren
Die Verbindungskarten stehen, der Datenfluss fehlt.
- ⬜ Marktplatz-Abgleich: Amazon, eBay, Kaufland/Otto
- ⬜ Banking-Sync über finAPI
- ⬜ Mail- und Kalender-Sync
- ⬜ ELSTER-Übermittlung
- ⬜ Shop-/Marktplatz-Tiefe

## M4 · Marketing-Autopilot — Restbausteine
Du hast gefragt: *„Haben wir wirklich noch so viel offen beim Marketing?"*
**Weniger, als die alte Liste behauptet hat.** Was ich prüfen konnte:

- ✅ **Werbeplattformen sind angelegt** — `lib/ads.ts` kennt Meta, Google, LinkedIn **und TikTok**, mit Verbindungs-, Schalt- und Auswertungs-Routen (`app/api/marketing/ads-verbindung`, `ads-schalten`, `ads-insights`)
- ✅ **Social-Veröffentlichung läuft** — der Cron postet nach Facebook, Instagram, Google Unternehmensprofil und LinkedIn
- ⬜ Organische Kanäle darüber hinaus: YouTube, Pinterest, X, Threads, Bluesky, Mastodon
- ⬜ Video-Upload-Paket: Bucket `social-video`, Auto-Cleanup-Cron, Speicher-Quota je Plan
- ⬜ Status-Poll für Instagram-/Facebook-Video-Container
- ⬜ Native Lead-Formulare, Pixel- und Conversion-Optimierung, Zielgruppen-Feinsteuerung
- ⬜ Marketing-Cockpit: Zeitverlauf, Öffnungs- und Klickraten
- ⬜ Zielgruppen direkt aus dem CRM wählen
- ⬜ Asset-Bibliothek um Medien und Bild-KI erweitern
- ⬜ Visueller Automations-Bauer: Trigger → Aktion → Bedingung → Wartezeit
- ⬜ SMS, Retargeting, Google-Rezensionen
- ⬜ Landingpages: Branche aus Profil vorbelegen

**Einschätzung:** Der Kern steht. Was fehlt, ist Tiefe und Komfort — nichts davon
blockiert einen Verkauf.

## M5 · Geräte und Außendienst
- ⬜ Etikettendrucker, TSE, Waage (nur der Scanner ist live)
- ⬜ Außendienst: Offline-Erfassung mit Service-Worker und Sync

## M6 · Auswertung und Tiefe
- ⬜ Report-Baukasten: gespeicherte und geplante Reports
- ⬜ BDE: Buchung mit `fertigung_auftraege` verknüpfen, Maschine als Asset, Schicht-Report-PDF
- ⬜ IT-Assets: SLA-Einhaltung gegen echte Tickets messen
- ⬜ Exposé → Veröffentlichung an Immobilienportale
- ⬜ Import-Center Stufe 2: zentraler Upload statt nur Launcher
- ⬜ Vertriebsgebiete, Genehmigungs-Workflows für Rabatte, Sales-Cadences

## M7 · Bedienung
- ⬜ **Gemeinsame Seitenschale** für alle Dashboard-Seiten (siehe Stufe 2, Punkt 1)
- ⬜ **KI-Auge auf allen Modulseiten** — heute nur CRM und Rechnungen
- ⬜ Fokus-/Detail-Umschalter („einfach ↔ volle Tiefe") — beschlossen, nirgends gebaut
- ⬜ Eigene Felder nachziehen: Leads, Dokumente, Fahrzeugakte, Kasse, Academy, Mahnwesen, Fördermittel

## M8 · Inhalt und Vertrauen
- ⬜ „Die Geschichte vom Argonaut" als Brand-Story
- ⬜ Freebie auf allen 698 Branchenseiten und der Vergleichsseite verlinken
- ⬜ Enterprise-Slot im Control Room
- ⬜ Trust-Layer: Sicherheits- und Compliance-Nachweise, AVV-Vorlage, Referenzen
- ⬜ Schwere Enterprise-Module — erst bei echtem Deal

## M9 · Modulseiten am lebenden System durchklicken
**Bisher waren alle Prüfungen statisch im Code.** Was tatsächlich auf dem
Bildschirm passiert, hat noch niemand systematisch angesehen.

- ⬜ List-1-Module: Kurse & Teilnehmer, Prüfprotokolle, Belegung, Schlagkartei, Tierbestand/HIT, Akten & Fristen, Zuschnitt, Spenden, Tour & ePOD, Gutachten, Hilfsmittel
- ⬜ List-2-Tiefe: Varianten & Matrix, Etiketten/LMIV, Chargen & Prüfplan, Housekeeping & Speisekarte, IT-Assets/Lizenzen/SLA, Ernte & Direktvermarktung, Räume & Ressourcen
- ⬜ Sechs geteilte Bausteine: Wiederkehr, Objekt-Register, Aufwand, Rezeptur, Chargen/HACCP, Fördermittel
- ⬜ Umsatz-Inseln: Trigger bei `rechnung_id = null`
- ⬜ Shop: Rechnung aus Bestellung → erscheint in Rechnungen und Finanzen
- ⬜ Cron-Routen als Admin: `demo-aufraeumen`, `autoresponder`, drei Reminder
- ⬜ Alle externen Motoren gegen die Live-API

---

**Was noch fehlt, um diese Liste zu vervollständigen:** Bei drei Punkten
(`termine.kontakt_id`, Mehrbank-Migration, ein Teil des Marketing-Autopiloten)
war dein Rechner offline, als ich prüfen wollte. Die sind mit 🔍 markiert und
werden Mittwoch nachgezogen.
