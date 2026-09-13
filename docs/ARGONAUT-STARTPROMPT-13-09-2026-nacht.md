# ARGONAUT OS · Startprompt für den nächsten Chat

**Stand: Sonntag, 13. September 2026, nach dem Abendblock** — löst den Abend-Startprompt ab.
Alles hier Genannte ist gebaut, geprüft und auf `main` gepusht.

Ich bin Martin Gaspar, Gründer von ARGONAUT OS. Wir bauen weiter.

---

## Das Erste

Die Skills in meinem Claude-Konto greifen automatisch. `argonaut-chatstart` kennt die zwei
Ordnerpfade — **beide sofort anfordern**:

1. `C:\Users\Admin\Desktop\gaspar-ai-system` — nur der Dachordner
2. `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` — **das Repo**

Supabase `znrjnndfzzydnhbyntwa` · Vercel, Branch `main`, jeder Push deployt.

Checkliste: angeheftetes Artifact **„ARGONAUT Bautag"**
`https://claude.ai/code/artifact/6a692f72-7b7c-4438-a754-3a37959a0fd7`
Stand: **2 von 28**. Zum Ändern IMMER erst `action: "read"` mit dieser URL, dann mit `url` publizieren.

`npm test` übersetzt alle Logik-Dateien nach `out/` und startet `node --test`.
**Stand: 810 Tests, 0 Fehler.**

---

## DER AUFTRAG FÜR DIESEN CHAT

**Block B der Bautag-Liste — heute noch fertig.** Fünf Punkte, in dieser Reihenfolge:

### 1.–3. Posteingang (3.4), alle drei in EINEM Durchgang

Sie fassen dieselben zwei Dateien an: `app/api/mail/posteingang/route.ts` und
`app/api/mail/nachricht/route.ts`, dazu `app/dashboard/posteingang/page.tsx`.

- **Suche zuerst** (größter Nutzen). Die Route kennt heute nur `n` für die Anzahl — man
  durchsucht also nur die geladenen 25 Zeilen. IMAP kann serverseitig `SEARCH`; dorthin gehört
  es. Im selben Zug die fehlenden Tests für `lib/posteingang.ts` — die Datei ist im Kopf als
  „pure, node-testbar" dokumentiert und hat bis heute keinen einzigen Test.
- **Ordner**: Die Route öffnet nur INBOX, kein `client.list()`, keine Auswahl.
- **Anhänge**: werden über `simpleParser` gelesen und angezeigt (Name, Typ, Größe), aber der
  INHALT wird nie ausgeliefert — man sieht den Anhang und kann ihn nicht öffnen. Braucht eine
  eigene Route je Anhang einer UID.

Befund dazu stammt vom 12.09. und ist am echten Code geprüft.

### 4. Anrede Paket 9 (3.1)

Die Pakete 1–8 sind durch. Offen sind die **148 „ANSEHEN"-Stellen in 73 Dateien** aus
`supabase-sql/_BEFUND-anrede.txt` — vermutete Imperative und Betreiber-Seiten, viele davon
Fehlalarme. Das lässt sich nicht automatisch entscheiden: gemeinsam durchgehen.
**Wichtig:** Der Befund ist lückenhaft und lag in sechs von sechs Paketen daneben — nur als
Wegweiser benutzen, welche Ordner drankommen, nie als Arbeitsliste.

### 5. Rechnungs-PDF-Rest (3.6) — GEMEINSAM

Nur noch zwei Stellen in `app/api/rechnung-pdf/route.ts`: `h1` (Überschrift „Rechnung", das
Angebot nutzt dort `marke.primaer`) und `.paybtn` (Hintergrund; dessen Textfarbe ist fest `#fff`
und bräuchte dann `theadText`). Die übrigen fünf festen `#0A1628` sind **Absicht** — Markenfarbe
als Fließtext wäre bei einer hellen Marke unlesbar. Kern-Geld-Dokument: nur zu zweit, nicht
unbeaufsichtigt.

---

## Was am Abend des 13.09. fertig wurde

### 3.15 Paket 3: Rückhol-Strecke ✅

`lib/rueckholung.ts` (49 Tests) · `supabase-sql/rueckhol-strecke.sql` (4 Tabellen, 13 Regeln) ·
`app/api/cron/rueckholung/route.ts` (Cron täglich 11:00) ·
`app/api/oeffentlich/rueckhol-abmelden/route.ts` ·
`app/dashboard/marketing/rueckholung/page.tsx` · Kachel „↩️ Rückhol-Strecke"

Drei Grenzen sind fest eingebaut, damit aus Rückholung keine Belästigung wird:
**mindestens 30 Tage** Ruhe, bevor jemand als ruhend gilt · wer nach dem Start kauft **oder sich
meldet**, wird sofort gestoppt (der Abbruch schlägt die Fälligkeit) · **180 Tage Sperre** nach
einem Durchlauf, sonst liefe derselbe Kunde alle paar Monate wieder rein.

Maßgeblich ist der letzte **Kauf** aus `rechnungen` (`bezahlt_am`, sonst `faelligkeitsdatum`) —
nicht `letzter_kontakt_am`, das ändert sich schon bei einem Anruf.

Der Abmelde-Link trägt die Lauf-UUID (nicht erratbar), setzt `kontakte.werbe_widerspruch_am`
und stoppt den Lauf. Bewusst GET: Mail-Programme öffnen Links vorab, und ein versehentlicher
Widerspruch ist harmlos — ein nicht ausgeführter ist eine Abmahnung.

### GROSSER FUND: Der Automations-Motor prüfte nie die Werbe-Einwilligung

`/api/cron/automationen` schickte bei „E-Mail senden" an **jede** Adresse, auch an Kontakte mit
eingetragenem Werbewiderspruch. Nachgerüstet — aber **mit Unterscheidung**: neues Feld
`werbung: boolean` je `TriggerDef` in `lib/automation.ts` plus `istWerbung()`.
Nur `kontakt_wiedervorlage` und `kontakt_lange_still` sind Werbung. Rechnung, Angebot, Aufgabe
und Projekt sind **Betriebspost** und laufen weiter — ein Werbewiderspruch darf keine Mahnung
aushebeln. Ein unbekannter Auslöser gilt vorsichtshalber als Werbung.

### 3.15 Paket 4: Anmelde-Einblendung ✅

`lib/einblendung.ts` (21 Tests) · Block-Typ `einblendung` in `lib/webBloecke.ts` ·
`tests/webEinblendung.test.mjs` (12 Tests auf die AUSGABE) · `neuerBlock`/`felderFuer` in
`app/dashboard/webseiten/_components/SeitenEditor.tsx`. **Kein SQL** — der Baustein lebt in
`web_seiten.bloecke`.

Vier Grenzen sind nicht einstellbar: nie vor **8 Sekunden** · nach dem Wegklicken mindestens
**7 Tage** Ruhe · nach der Anmeldung **nie wieder** · unter **640 px ein Balken unten** statt
Vollbild (Google wertet aufdringliche Interstitials auf Mobil seit 2017 ab).

**Der Startprompt vom Abend lag falsch:** `/api/check-popup` hat mit einer Anmelde-Einblendung
nichts zu tun — sie liest `customers.popup_aktiv` über `supabase_user_id`, ein Betreiber-Flag
aus dem Mai, mit `.single()` statt `.maybeSingle()`. Vollständig vorhanden war dagegen
`/api/oeffentlich/web-newsletter` (Double-Opt-in, Honeypot, Branding je Betrieb, `owner_user_id`
kommt aus `web_seiten` und nie vom Client). Es fehlte nur die Einladung dorthin.

### Zwei echte Fehler, die die Prüf-Kette gefunden hat

1. **`Number('')` ist `0`, nicht ungültig.** In `ganzeZahl()` wurde eine leere Angabe still zur
   Null — in `lib/rueckholung.ts` hieß das: eine fehlende Wartezeit wäre als „sofort"
   durchgegangen und `fehltZumStarten()` hätte sie **nie** gemeldet. In beiden Dateien behoben,
   Regressionstests ergänzt.
2. **`VORLAGE` war von `Einblendung` abgeleitet**, dessen Felder `unknown` sind — `tsc` fing es
   im Editor. Jetzt ein eigener Typ `EinblendungVorlage`: eine Vorlage ist von uns geschrieben,
   nicht aus der Datenbank.

### Weitere Kleinigkeit

`lib/mailBudget.ts`: `WERBE_CRONS` 4 → **5** (die Rückhol-Strecke ist der fünfte Werbe-Cron).
Der Deckel je Werbe-Durchgang sinkt damit von 12 auf **10**, solange Resend im kostenlosen
Tarif läuft. `tests/mailBudget.test.mjs` schreibt die Zahl fest und wurde mit angepasst.

---

## Wie ich geführt werden will

Steht im Skill `argonaut-push`. Das Wichtigste:

* Deutsch, Schritt für Schritt, alles copy-paste-fertig.
* **Niemals PowerShell — immer CMD**, mit `chcp 65001`.
* **An Bautagen wird gebaut.** Klicktests NICHT zwischendurch anbieten — die gehören gesammelt
  auf den Testtag.
* **Erst kontrollieren, was die Liste behauptet.** Zwölf Punkte haben sich in einer Woche als
  schon gebaut herausgestellt, und zwei Startprompt-Angaben waren falsch.
* Entscheidungsmodus: bei klarer Empfehlung sofort bauen und den Push-Block hinlegen.
* Blockweise: pro Block zuerst das komplette SQL in EINEM Block, danach die Pushes.
* Gezieltes `git add <datei>`, **nie `git add .`**
* Prüf-Kette vor jedem Push: esbuild + `tsc` in der Prüf-Umgebung mit Stubs + `node --test`,
  dazu eine **Gegenprobe mit absichtlichem Typfehler**. Sie hat heute zwei echte Fehler
  gefunden — nicht abkürzen.
* Sag mir ehrlich, wenn etwas schon existiert oder anders ist als gedacht.

## Grenzen, die fest stehen

* **GEMEINSAM-Regel:** Rechnung und Angebot, Zahlung und Bank, alles rund um Auth/Login.
* **SAFETY-FIRST und ADDITIV:** SQL idempotent, nie destruktiv.
* SQL-Blöcke immer vollständig in den Chat **und** als Datei in `supabase-sql/`.
* Spaltenlisten in `.select()` immer als EINE Zeichenkette — nie mit `+` zusammengesetzt.
  `tests/selectLiteral.test.mjs` wacht darüber; zusammengesetzt bricht `next build` ab.
* Nutzungsmessung nie auf Mitarbeiterebene (§ 87 Abs. 1 Nr. 6 BetrVG).
* Kein Massenversand über Kundenpostfächer. Bis 5 Empfänger SMTP, darüber Resend.
* Kundentexte siezen, Mitarbeitertexte anredefrei. Nie „KI-Agenten"/„KI-Crew" — es heißt
  **„Bausteine"**. „Crew" bleibt den Menschen vorbehalten.
* **Guardrail:** Unternehmerfrühstück, BNI und der 15. Juni sind abgeschlossen.

## Danach

Nach Block B ist von der Liste offen: **Paket 5 Webinar** (groß, eigener Block — der einzige
Punkt ohne jede Vorarbeit), der **Anwalttermin** mit seinen fünf Folgepunkten, die acht Punkte
**nur für Martin**, und der **Testtag** — dessen koordinierte Checkliste zuerst entsteht, und
zwar vor dem Anwalttermin.

## Was bewusst nicht gebaut wird

Talent-Marktplatz · ARGONAUT Universum · alte Agenten-Seite · Bestellstrecke vorziehen ·
Gruppe 6 Empfehlungen · 6.1 Preisrechner · Avatar Stufe 4 · Anrede-Schalter für Mitarbeiter ·
Segmentierung nach Öffnungs-/Klickverhalten (bewusste Entscheidung, Anwaltsliste Block L3).
