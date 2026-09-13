# ARGONAUT OS · Startprompt für den nächsten Chat

**Stand: Sonntag, 13. September 2026, Abend** — löst den Startprompt vom Mittag ab. Alles darin Genannte ist gebaut, geprüft und auf `main` gepusht.

Ich bin Martin Gaspar, Gründer von ARGONAUT OS. Wir bauen weiter.

---

## Das Erste

Die fünf Skills in meinem Claude-Konto greifen automatisch. `argonaut-chatstart` kennt die zwei Ordnerpfade — **beide sofort anfordern**:

1. `C:\Users\Admin\Desktop\gaspar-ai-system` — nur der Dachordner
2. `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` — **das Repo**

Supabase `znrjnndfzzydnhbyntwa` · Vercel, Branch `main`, jeder Push deployt.

Checkliste: angeheftetes Artifact **„ARGONAUT Bautag"**
`https://claude.ai/code/artifact/6a692f72-7b7c-4438-a754-3a37959a0fd7`
Zum Ändern IMMER erst `action: "read"` mit dieser URL, dann mit `url` publizieren.

---

## NEU seit heute: `npm test` — 730 Tests auf einen Befehl

```
npm test             übersetzt alle Logik-Dateien nach out/ und startet node --test
npm run test:bauen   nur übersetzen
```

Erster grüner Lauf am 13.09.2026 abends: **32 von 32 übersetzt, 730 Tests, 0 Fehler.**

**Warum das wichtig ist:** Die Test-Dateien importieren aus `../out/<name>.js`. Dieses `out/` steht nicht im Repo (.gitignore) und war nur mit 8 von 33 Dateien gefüllt — wer `node --test` startete, bekam für den Rest MODULE_NOT_FOUND und konnte meinen, die Tests seien kaputt. Sie waren es nie; es fehlte die Übersetzung.

Gebündelt wird bewusst: Manche Logik-Dateien greifen auf andere zu (abTest → mailMessung, freebie → newsletter), und TypeScript schreibt solche Importe ohne `.js`-Endung, die Node im ESM-Betrieb aber verlangt.

**Vier Stolpersteine, die dabei behoben wurden — bitte nicht zurückdrehen:**

1. **esbuild steht jetzt als `devDependency`** in der package.json. Das Skript lädt es als **Modul** (`require('esbuild')`) und startet dafür keinen Unterprozess. Der erste Entwurf rief `npx.cmd` auf — Node weigert sich unter Windows seit 18.20/20.12, eine `.cmd`-Datei ohne Shell zu starten (CVE-2024-27980) und antwortet mit `spawnSync npx.cmd EINVAL`. Als Rückfall gibt es weiterhin `node_modules/.bin` und `npx`, unter Windows beide über die Shell und mit gesetzten Anführungszeichen.
2. **`platform: 'node'`**, nicht `neutral`. `lib/whatsappEingang.ts` holt sich `createHmac` aus `node:crypto`; bei „neutral" kennt esbuild die eingebauten Node-Bausteine nicht und meldet „Could not resolve".
3. **`node --test "tests/*.test.mjs"`**, nicht `node --test tests/`. Der Ordner-Aufruf funktioniert je nach Node-Version nicht.
4. **Das Skript schreibt eine eigene kleine `out/package.json` mit `{"type":"module"}`.** Sonst warnt Node bei jeder Datei `MODULE_TYPELESS_PACKAGE_JSON`. In die große package.json darf `"type": "module"` **nicht** — daran hängen `next.config.ts`, eslint und die vielen `.cjs`-Helfer im Wurzelordner.

Fehlt zu einem Test die Quelle, wird das gemeldet, ohne abzubrechen. Nur ein echter Übersetzungsfehler beendet mit Fehlercode.

---

## Was am 13.09. fertig wurde

### 3.15 Marketing-Tiefe — Paket 1: Empfängergruppen ✅

`lib/segmente.ts` (40 Tests) · `app/dashboard/marketing/segmente/page.tsx` · `supabase-sql/marketing-segment.sql` · Kachel „🎯 Empfängergruppen"

Segmentiert wird **nur nach Stammdaten und erklärten Handlungen** — nie nach beobachtetem Verhalten. `lib/mailMessung.ts` hält aus DSGVO-Gründen nur Summen je Versand und kennt keine Person; `GESPERRTE_MERKMALE` lässt eine Regel auf „geoeffnet"/„geklickt" durchfallen, selbst wenn jemand später so eine Spalte anlegt.

**Der wichtigste Fund dabei:** `public.kontakte` führt seit jeher `werbe_einwilligung`, `werbe_einwilligung_am`, `werbe_einwilligung_quelle` und `werbe_widerspruch_am` — vier Spalten, die nie zusammen ausgewertet wurden. `werbeStatus()` tut das jetzt: **erlaubt · widersprochen · abgemeldet · nicht_bestaetigt · ohne_einwilligung**. Ein Widerspruch schlägt alles. Die Vorschau zeigt sechs Zahlen statt einer, damit gesperrte Empfänger nicht in einer Gesamtzahl verschwinden.

**Katalog-Lehre:** Der erste Entwurf hatte sechs Merkmale, die es gar nicht gibt (Branche, Umsatz, Stufe, Letzter Kauf, Tag, Freebie). Erst Spalten lesen, dann Merkmale bauen.

### 3.15 Paket 2: A/B-Test für Betreffzeilen ✅

`lib/abTest.ts` (28 Tests) · `app/api/newsletter-ab-test/route.ts` · `app/dashboard/marketing/ab-test/page.tsx` · `supabase-sql/newsletter-ab-test.sql` · Kachel „🅰️ Betreffzeilen testen"

`pruefeMenge()` sagt **zuerst**, ob die Liste reicht — unter 60 Empfängern gibt es keinen Test. `teileAuf()` mischt deterministisch über eine Streuzahl aus der Adresse. Vier Stunden Wartezeit vor der Auswertung. Bei Gleichstand gibt es eine Empfehlung, aber offen benannt als „Setzung, kein Ergebnis".

**Entschärfte Falle:** Kommen zwischen Start und Rest-Versand neue Abonnenten dazu, teilt dieselbe Rechnung anders auf — jemand hätte die Mail zweimal bekommen. Der Rest-Versand lädt deshalb nur, wer bei Start schon angemeldet war.

### Weiteres vom Nachmittag

- **3.12 Diktat fertig** — Diktat-Knopf in Ticket-Beschreibung und vier Feldern der Baustellen-Doku. Die Komponente existierte, war aber nur in `meine-einsaetze` eingebaut.
- **N3-SQL nachgezogen** — `supabase-sql/werkstatt-mitarbeiter-n3.sql`, aus `pg_policies` der laufenden Datenbank geschrieben, nicht aus dem Gedächtnis. 22 Regeln, kein Löschrecht, maschinell gegen den Export geprüft.
- **Mandantentrennung endgültig geprüft** — 1.177 Regeln auf Rolle `public`, davon **null** ohne Nutzer-Bezug. Die sechs Treffer der Nachprüfung sind alle erklärbar. Thema abgeschlossen, nicht wieder aufmachen.

---

## Bestandsaufnahme Block K (am echten Code, 13.09.)

| Punkt | Wirklichkeit |
|---|---|
| 3.10 Aktivitäten-Cockpit | **War gebaut** — `/dashboard/akquise` auf `vertrieb_aktivitaet`. Achtung: `/dashboard/aktivitaet` ist etwas anderes (Timeline je Kunde) |
| 3.11 Freebie-Baukasten | **War komplett**, Mailstrecke eingeschlossen. Cron steht in `vercel.json`, täglich 10:30 |
| 3.12 Diktat | War zu 80 % fertig, jetzt ganz |
| 3.13 Webinar | **Wirklich nicht gebaut** — der einzige Punkt ohne Vorarbeit |
| 3.14 Absender-Domain | Kein Bau, Martins Neubewertung |

**Zur Freebie-Strecke, zwei Stellschrauben:** Ohne `CRON_SECRET` in Vercel lehnt die Route jeden Aufruf ab, ohne Fehlermeldung. Und ohne `MAIL_TAGESBUDGET` gilt 100/Tag → rund **12 Mails je Durchgang**. Punkt 1.2 ist damit die Bremse am Freebie-Baukasten.

---

## Womit wir weitermachen — DER ERSTE BAUAUFTRAG

**3.15 Paket 3: Rückhol-Strecke.** Kunden, die seit X Monaten nichts gekauft haben, bekommen automatisch eine Folge. Die Segmente sind da, der Automations-Motor (`lib/automation.ts` + `/api/cron/automationen`) ist da — es fehlt die Verbindung.

Danach **Paket 4** (Anmelde-Einblendung auf der Website; es gibt bereits eine `check-popup`-Route) und **Paket 5** (Webinar, groß).

---

## Ganz zum Schluss, vor dem Anwalt

**Auftrag:** eine vollständige, koordinierte **Testtag-Checkliste** — Schritt für Schritt in Prüf-Reihenfolge. Bis dahin sammeln sich die Prüfpunkte:

- K4 `ANALYSE_BETREIBER_ID` in Vercel (muss `20dacbde-d2f2-43b8-9881-577ebce83639` sein) · K5 Beleg-Upload als Gegentest
- 4.4 Betriebs-Akte mit echter Kunden-UUID
- Churn-Lock mit echter gekündigter Test-E-Mail
- Website-Texte vom 13.09.: `/vorschau` und `/uber-uns`
- Vertriebs-Kette: eine echte Woche eintragen
- Segmente und A/B-Test einmal durchklicken
- `CRON_SECRET` prüfen
- `npm audit` — Stand 13.09.: 17 Meldungen, davon 1 kritisch. **Nicht** mit `npm audit fix --force` erledigen (kann Next oder Supabase auf inkompatible Versionen ziehen), sondern einzeln durchgehen

---

## Wie ich geführt werden will

Steht im Skill `argonaut-push`. Das Wichtigste:

* Deutsch, Schritt für Schritt, alles copy-paste-fertig.
* **Niemals PowerShell — immer CMD**, mit `chcp 65001`.
* **An Bautagen wird gebaut.** Klicktests NICHT zwischendurch anbieten — die gehören gesammelt auf den Testtag.
* **Erst kontrollieren, was die Liste behauptet.** Elf Punkte haben sich in einer Woche als schon gebaut herausgestellt.
* Entscheidungsmodus: bei klarer Empfehlung sofort bauen und den Push-Block hinlegen.
* Blockweise: pro Block zuerst das komplette SQL in EINEM Block, danach die Pushes.
* Gezieltes `git add <datei>`, **nie `git add .`**
* Sag mir ehrlich, wenn etwas schon existiert oder anders ist als gedacht.

## Grenzen, die fest stehen

* **GEMEINSAM-Regel:** Rechnung und Angebot, Zahlung und Bank, alles rund um Auth/Login.
* **SAFETY-FIRST und ADDITIV:** SQL idempotent, nie destruktiv.
* SQL-Blöcke immer vollständig in den Chat **und** als Datei in `supabase-sql/`.
* Nutzungsmessung nie auf Mitarbeiterebene (§ 87 Abs. 1 Nr. 6 BetrVG).
* Kein Massenversand über Kundenpostfächer. Bis 5 Empfänger SMTP, darüber Resend.
* Kundentexte siezen, Mitarbeitertexte anredefrei. Nie „KI-Agenten"/„KI-Crew" — es heißt **„Bausteine"**. „Crew" bleibt den Menschen vorbehalten.
* **FLYER-Regel:** nie Mitbewerber beim Namen nennen.
* **Guardrail:** Unternehmerfrühstück, BNI und der 15. Juni sind abgeschlossen.

## Was bewusst nicht gebaut wird

Talent-Marktplatz · ARGONAUT Universum · alte Agenten-Seite · Bestellstrecke vorziehen · Gruppe 6 Empfehlungen · 6.1 Preisrechner · Segmentierung nach Öffnungs-/Klickverhalten (bewusste Entscheidung, siehe Anwaltsliste Block L3).
