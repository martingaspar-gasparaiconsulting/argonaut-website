# ARGONAUT OS — Übergabe für die Rückkehr

**Stand 18.08.2026, abends. Martin ist zwei Wochen weg.**

Diese Datei ist der Einstieg danach. Der vollständige Fahrplan steht in
`ARGONAUT-MASTER-FAHRPLAN.md` (Zählung **M1–M18**); hier steht nur, was für den
Wiedereinstieg zählt.

---

## 1) Zuerst: der Startprompt

Nach zwei Wochen ist der alte Chat kalt. In
**`ARGONAUT-STARTPROMPT-NACH-URLAUB.md`** liegt ein fertiger Text zum Kopieren —
damit beginnt ein neuer Chat ohne Kontextverlust. Das ist der erste Griff, nicht
das Suchen im alten Verlauf.

---

## 2) Was während des Urlaubs von allein läuft

- **Dreizehn Crons** laufen weiter: Automationen, Dossier-Sequenz,
  Batch-Abholung alle 15 Minuten, Social-Posten alle 6 Minuten,
  Report-Versand um 6 Uhr.
- **Die KI-Bremse** aus AGB § 9.3 schützt vor Kostenexplosion, ohne dass jemand
  hinsieht: Warnung ab 70 % des Firmen-Topfs, stiller Puffer bis zum Doppelten,
  dann harte Sperre.
- **Der Post-Deckel** (neu, 18.08.) sorgt dafür, dass Werbepost das
  Tageskontingent nicht mehr aufbrauchen kann. Mahnungen und
  Terminerinnerungen haben Vorrang.
- **Bestellte KI-Stapel** holen sich selbst ab. Ein Stapel ohne Ergebnis wird
  nach 24 Stunden sauber als Fehler abgeschlossen statt ewig zu hängen.

**Was NICHT von allein läuft:** Resend steht weiter im Free-Tarif bei 100 Mails
am Tag. Der Post-Deckel verhindert jetzt, dass eine Info-Serie alles wegfrisst —
aber das Kontingent bleibt klein.

---

## 3) Die drei harten Blocker

Nichts davon ist Code. Alles davon hält etwas anderes auf.

| | Was | Hält auf | Vorlauf |
|---|---|---|---|
| **B1** | **AVV nach Art. 28 DSGVO** (Anwalt) | M15 Bestellstrecke · jeder Kundenbetrieb | ~3 Wochen |
| **B2** | **Resend auf Pro** | jeder Mailversand über 100/Tag · eigene Absender-Domain | 5 Minuten |
| **B3** | **Stripe prüfen** (Schlüssel liegen seit 05.05. in Vercel) | M15 Bestellstrecke | offen |

**B2 dauert fünf Minuten und sollte der erste Handgriff sein.** Danach in Vercel
`MAIL_TAGESBUDGET` auf das tatsächliche Tageskontingent setzen — dann wächst der
Post-Deckel mit. Ohne die Variable gilt weiter der sichere Wert 100.

---

## 4) Was am 17./18.08. gebaut wurde — alles in Production

| Commit | Was |
|---|---|
| `c7e71f6` `df6dd47` `897bd24` `0166ba2` | Inhalts-Werkstatt (Logik, Erzeugung, Redaktion, E-Book) |
| `ea9b0f7` `9e840a0` | Freebie auf der Vergleichsseite |
| `0c0410e` | AGB- und Einwilligungs-Häkchen aus den Anfrageformularen |
| `fd50dc4` | Ernte-Lager-Zuordnung über den gewählten Artikel |
| `9c1c375` | Eigene Felder für Leads |
| `89a5ddd` `7a8c884` | Gespeicherte und geplante Auswertungen, täglicher Cron |
| `fc9b91a` | 698 Branchen-Vorworte und 698 KI-Dialoge, Stapel je Typ |
| `9fb5f21` | Dokument-Details mit eigenen Feldern |
| `13edccd` | **Mastodon und Bluesky** direkt bespielbar |
| `ce8fd05` | **Versandprotokoll sichtbar**, gescheiterte Beiträge wiederholbar |
| `35663fa` | **Telegram** als siebter Kanal, Bot-Kennwort geschützt |
| `1f5e425` | **Threads** als achter Kanal |
| `106711e` | **Post-Deckel** — Werbepost verdrängt keine Betriebspost |
| `6823bc1` | **Master-Fahrplan M1–M18** statt drei paralleler Zählungen |
| `bda5f99` | Liegengebliebene Doc-Dateien nachgetragen |
| `e4ca3bf` | **Avatar Stufe 2** — gezeichnete Figur, Browser-Stimme, eingebaut |

**SQL eingespielt:** Bucket `ebooks`, Spalte `ernte_ernte.artikel_id` mit
Fremdschlüssel, Tabelle `report_gespeichert`. Für alles vom 18.08. abends war
**kein SQL nötig.**

**Node-Tests: 302 grün.**

---

## 5) Zwei Funde, die im Betrieb wehgetan hätten

**Das Telegram-Bot-Kennwort steht in der Adresse.** `api.telegram.org/bot<KENNWORT>/…`
— bei keinem anderen Kanal ist das so. Scheitert der Aufruf auf Netzwerkebene,
schreibt Node die komplette Adresse in die Fehlermeldung, und die landet in
`social_versand.fehler_text` — dauerhaft in der Datenbank und sichtbar im neuen
Versandprotokoll. Fehlermeldungen werden jetzt gefiltert, bevor sie gespeichert
werden (`entferneGeheimnisse` in `lib/socialVersand.ts`).

**Werbepost konnte die Betriebspost aushungern.** Der Autoresponder lief um 05:00
und durfte bis zu 300 Mails verschicken — das Dreifache des ganzen
Tageskontingents. An einem starken Tag wären die Mahnungen um 07:00 still
ausgefallen. `lib/mailBudget.ts` gibt Werbepost jetzt höchstens die Hälfte.

Beides hätte ein Klicktest nie gefunden. Man sieht es erst, wenn etwas schiefgeht.

---

## 6) Der kritischste Codepunkt im ganzen System

`app/api/cron/reports-versand/route.ts` liest mit der **Service-Rolle**, die RLS
vollständig umgeht. Jede Abfrage auf eine Quell-Tabelle **muss**
`.eq('owner_user_id', ...)` tragen.

**Die Gegenprobe hat gezeigt: `tsc` fängt das NICHT.** Der Filter lässt sich
entfernen und die Typprüfung bleibt grün, weil die Supabase-Kette zu locker
typisiert ist. Am 18.08. wurde am Schema geprüft, dass `rechnungen`, `angebote`,
`crm_deal` und `versand_sendung` alle `owner_user_id` als `uuid` tragen.

**Kommt je eine Quelle zu `QUELLEN` in `lib/reportBaukasten.ts` dazu, MUSS das
Besitzer-Feld vorher genauso geprüft werden.** Fehlt der Filter, bekommt ein
Kunde per Mail die Zahlen eines anderen — eine meldepflichtige Datenpanne, die
niemandem auffällt, weil die Zahlen plausibel aussehen.

Dasselbe Muster gilt in `app/api/marketing/social-protokoll/route.ts` und
`app/api/cron/social-posten/route.ts`. In allen dreien steht ein auffälliger
Kommentar an der Stelle.

---

## 7) Arbeitsweise — drei Regeln, die am 17./18.08. dazukamen

**Dateien zählen, und zwar eindeutig.** Nach jedem Push die Zeile
**„N files changed"** gegen die Zahl im `git add` halten. Am 17.08. hat eine
*mehrdeutige* Erwartung („1 oder 2, beides ist richtig") dazu geführt, dass eine
Datei tagelang unbemerkt nicht im Repo war. **Nie eine Spanne nennen — immer
genau eine Zahl.**

**Umlaute in Kundentexten.** Quelltext-Kommentare dürfen `ae/oe/ue` schreiben,
**sichtbarer Text niemals**. Das ist dreimal passiert und jedes Mal erst spät
aufgefallen. Es gibt inzwischen Tests, die genau darauf anschlagen.

**Zählungen gehören in die jeweils neueste Testdatei.** Eine Zusicherung wie
„es gibt acht Kanäle" in jeder Datei führt dazu, dass ein neuer Kanal überall
gleichzeitig anschlägt. Und ein Test darf nie über die Liste laufen, die er
prüfen soll — sonst schrumpft er stillschweigend mit.

---

## 8) HIER STARTEN nach dem Urlaub

### Reihenfolge

1. **Resend auf Pro** (B2) — fünf Minuten, danach `MAIL_TAGESBUDGET` in Vercel.
2. **Anwaltstermin anfragen** (B1) — die drei Wochen laufen sonst erst danach.
3. **Der Testtag (M18).** Martins Ansage vom 18.08.: **jedes Modul einzeln**,
   nicht nur eine Auswahl. Ein kompletter eigener Tag.
   Die Prüfliste liegt als Artefakt „argonaut-testtag-pruefliste" bereit.
   Die drei Geldstellen zuerst: DSGVO-Löschung mit einem Testkontakt
   (unumkehrbar) · Provisions-Gutschrift auf Pflichtangaben · EÜR und
   DATEV-Export gegen den alten Stand.
   Dann das Rechtesystem mit zwei Personen gleichzeitig.

### Erst danach: Code

**Zwei Dinge liegen bereit und sind klein:**

- **Avatar Stufe 3** — den Guide ins Dashboard-**Layout** hängen statt auf eine
  Seite, Pfad auslesen, Text zum Modul zeigen. Dann wandert er mit. Ein Push,
  kein SQL. Die Texte kommen aus den 113 Modul-Kapiteln der Inhalts-Werkstatt.
- **Die 1528 Texte bestellen** — vier Knöpfe unter `/admin/inhalte`,
  zusammen **2,40 USD**. Ergebnis landet als Entwurf; ohne Haken erscheint
  nichts. Das kann sogar vor dem Testtag laufen, es stört nichts.

Alles Weitere steht im Master-Fahrplan, M1 bis M18, mit Status und Begründung.

---

## 9) Referenzen

- `ARGONAUT-MASTER-FAHRPLAN.md` — **die eine Zählung M1–M18**, Status je Punkt
- `ARGONAUT-STARTPROMPT-NACH-URLAUB.md` — Text zum Kopieren für den neuen Chat
- `ARGONAUT-UEBERGABE-LETZTE-BAUSTEINE.md` — Blöcke A–O im Detail (16.08.)
- `ARGONAUT-UEBERGABE-GROSSE-BROECKEN.md` — Themen 1–10 (14.08.)
- `team-chat-bug.md` — bekannter Fehler, **bewusst nicht blind gefixt**
- `supabase-sql/` — alle eingespielten SQL-Dateien
