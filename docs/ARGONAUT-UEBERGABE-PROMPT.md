# Übergabe-Prompt für den neuen Chat

> **So benutzt du das:** Alles ab der Linie kopieren und als **erste Nachricht** in
> den neuen Chat einfügen. Danach `ARGONAUT-5-Bauen-heute.pdf` hochladen —
> das ist der Arbeitsplan. Die anderen PDFs erst, wenn das Thema dran ist.

---

Ich bin Martin Gaspar, Gründer von ARGONAUT OS — einem KI-Betriebssystem für den
deutschen Mittelstand. Wir arbeiten seit Monaten täglich zusammen. Dies ist die
Fortsetzung eines Chats, der voll geworden ist. **Wir bauen sofort weiter, keine
Aufwärmrunde.**

---

## 1 · Wie du mit mir arbeitest — das ist verbindlich

- **Antworte auf Deutsch.**
- **Führe mich Schritt für Schritt. Warte auf mein „erledigt", bevor du weitermachst.**
  Nicht drei Bauschritte auf einmal. Einer, ich bestätige, dann der nächste.
- **Alles copy-paste-fertig.** Wenn ich etwas ausführen soll, gib mir den
  vollständigen Block — nie die Beschreibung, nie „führe die Datei X aus".
- **Ich bin Perfektionist.** Alles muss überzeugend und vollständig sein.
- **Technisches Niveau: Anfänger bis Mittel.** Erkläre, was du tust und warum,
  aber behandle mich nicht wie ein Kind.
- **Kundenseitig heißt es immer „ARGONAUT" oder „die KI" — niemals „Claude".**

## 2 · Es gibt genau zwei Wege, wie etwas bei mir ankommt

**Weg 1 — Datenbank: reines SQL.**
Alles, was Supabase betrifft, kommt als **fertiger SQL-Block direkt in den Chat**,
den ich markieren und in den Supabase-SQL-Editor einfügen kann. Nicht als
Dateiname, nicht als Pfad, nicht als „öffne die Datei". Ich habe schon zweimal
versehentlich einen Dateipfad in den Editor eingefügt und einen Syntaxfehler
bekommen — das lag daran, dass der Block nicht im Chat stand.
Leg die Datei zusätzlich unter `supabase-sql/` ins Repo, aber **der Chat-Block
ist das, womit ich arbeite.**

**Weg 2 — Rechner: reines CMD.**
- **NIEMALS PowerShell. Immer CMD.** Keine Ausnahme.
- Ein Block, alle Zeilen untereinander, inklusive `cd` in den Projektordner.
- Windows-Pfade mit Backslash, Pfade mit Sonderzeichen in Anführungszeichen.

**Code schreibe ich nicht selbst.** Du legst fertige Dateien in mein Repo
(`device_commit_files` mit `force: true`), sagst mir kurz was geändert wurde,
und ich bestätige und pushe nur. Ich fasse keinen Quelltext von Hand an.

## 3 · Zwei Regeln, die aus echten Fehlern entstanden sind

**Die Staleness-Regel.** Die Arbeitskopie meines Repos in deinem Container ist oft
unvollständig oder veraltet. **Stage jede Datei frisch von meinem Rechner, bevor
du sie liest oder änderst.** Ein Verstoß dagegen hat schon zu einer falschen
Behauptung geführt, die ich mit einem Screenshot widerlegen musste.

**Kontrollieren vor Bauen.** In diesem Projekt waren wiederholt Dinge fertig
gebaut und nur nicht angeschlossen: der Laufzeitrabatt, der Kostenalarm, die
Anschluss-Bausteine, KI-Guide, geführte Tour, die komplette
Benachrichtigungs-Anlage. Genauso oft stand etwas als „offen" auf der Liste, das
längst erledigt war. **Prüfe jeden Punkt am echten Code, bevor du ihn baust oder
als erledigt meldest. Sag mir, wenn eine Liste falsch ist** — das ist mir lieber
als Zustimmung.

## 4 · Technik

- **Next.js 16.2.3** App Router auf **Vercel**, Middleware heißt `proxy.ts`
- **Supabase** (Postgres, Auth, Storage, EU-Stockholm), `@supabase/ssr`
- **Resend** über `lib/mail.ts` · **Gotenberg** auf einem Hostinger-VPS für PDFs
- **Repo:** `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
- **Marke:** Navy `#0A1628`, Navy2 `#0F2036`, Gold `#C9A84C`, Gold2 `#e8c46a`,
  Cyan `#00e5ff`, Grün `#4CAF7D`. Schrift überall **DM Sans**.
- **Logo:** `components/Dreizack.tsx` — der Dreizack aus dem Original-Logo,
  vektorisiert und inline. **Eine Datei, überall gleich.** Neue Stellen bitte
  immer dieses Bauteil verwenden, nie ein Emoji, nie eine Bilddatei.
- **Preise:** einzige Wahrheit ist `lib/tarif.ts`. Nie Zahlen aus dem Kopf nennen.
- **Rechte:** `lib/rechte.ts` — `NAV_LINKS` hat 116 Einträge, aber nur
  **112 verschiedene** Modul-Schlüssel (`rechnungen` kommt fünfmal vor).
- **KI-Regeln:** `lib/auge.ts` — 52 Regeln von `augeRechnungen` bis
  `augeProvisionen`. **Keine für Personal** (siehe Bauplan A1).
- **Alle KI-Aufrufe** laufen durch **eine** Funktion: `kiFetch()` in `lib/ki.ts`.
- **698 Branchen** liegen in `app/vorschau/_lib/branchen-web.ts` und den
  Nachbardateien. `lib/branchen.ts` ist der **alte** 205-Branchen-Katalog mit
  überholtem Preismodell — nicht verwenden.

## 5 · Drei Dinge, die du wissen musst, bevor du etwas anfasst

**n8n ist NICHT stillgelegt.** `app/api/leads/angebot-senden/route.ts` Zeile
80–124 schickt einen echten POST an einen n8n-Webhook und bricht ohne ihn mit
Fehler 503 ab. Wird der Hostinger-VPS gekündigt, bricht „Angebot an Lead senden".

**`verkaufschancen` ist NICHT verwaist.** Die Tabelle wird an vier Stellen
gelesen, unter anderem im Live-Cockpit. Nicht abschalten.

**Multistandort existiert nur im Preisrechner.** Es gibt keine `standorte`-Tabelle
und kein `standort_id`. Alle Filialen teilen sich heute dieselbe Betreiber-ID.
Das ist die größte Lücke zwischen dem, was ich verkaufe, und dem, was läuft.

## 6 · Wo wir stehen

**Der Termin:** Donnerstag, 06.08.2026, Unternehmerfrühstück. Ich habe
**60 Sekunden Pitch am Ende der Runde** und stelle einen **43-Zoll-Touchscreen**
auf. Testtag ist Mittwoch, 05.08.

**Live und fertig:** 21 Vorführ-Betriebe mit 719 Beispiel-Datensätzen ·
öffentliche Vorführung über alle 698 Branchen mit Suche, Sperrbildschirm,
Preisrechner und QR-Code · Onboarding „Vom Matrosen zum Kapitän" mit Zertifikat ·
Zugriffsrechte aufgeräumt · Spartanerhelm und Emoji-Dreizack aus dem gesamten
Projekt entfernt · Team-Chat repariert und mandantensicher, mit Benachrichtigung ·
gemeinsame Seitenschale für alle Dashboard-Seiten · Repo aufgeräumt.

---

## 7 · WAS WIR HEUTE BAUEN — der Arbeitsplan

Details stehen in **`ARGONAUT-5-Bauen-heute.pdf`**, das ich dir gleich hochlade.
Kurzfassung, damit du sofort loslegen kannst:

### Block A · Was Donnerstag jemand sieht — rund 3 Std
| | Was | Dauer |
|---|---|---|
| A1 | **KI-Auge auf Personal.** Neue Regel `augePersonal` in `lib/auge.ts` (Muster: `augeCrm`), dann `KiAuge` in `app/dashboard/personal/page.tsx` einhängen. Die Seite hält Mitarbeiter, Abwesenheiten, Prüfungen, Schulungen und Bewerber bereits vor. **Achtung: 124 KB große Datei mit Personaldaten — nur die Anzeige anfassen.** | 1,5 Std |
| A2 | **KI-Auge auf Aufträge.** Gleiches Muster: überfällige Aufträge, nicht abgerechnete Leistungen, Aufträge ohne Termin. | 45 Min |
| A3 | **Überlauf-Hinweis abschalten.** Die Kachel „KI-Calls diesen Monat" ist raus, aber `OverusePopup` auf der Startseite arbeitet noch mit demselben Limit und kann mitten in der Vorführung aufpoppen. Widerspricht „KI unbegrenzt inklusive". | 20 Min |
| A4 | **Seitenschale nachziehen.** Die Schale steht im Layout, vier Seiten sind angepasst. Die übrigen Modulseiten setzen noch eigene Breiten und Abstände — doppelt, deshalb raus. | 1 Std |

### Block B · Technische Schulden — rund 2,5 Std
| | Was | Dauer |
|---|---|---|
| B1 | **Master-Fahrplan neu durchnummerieren.** In `docs/ARGONAUT-MASTER-BRIEFING.md` laufen zwei Zählungen parallel, beide ab 1: „Baustein 1–6" und „A1–A12". Genau das stiftet die Verwirrung. Reine Schreibarbeit. | 30 Min |
| B2 | **Prompt Caching zentral einbauen.** `lib/ki.ts` liest in Zeile 82–83 `cache_creation_input_tokens` und `cache_read_input_tokens` — die Ersparnis wird also gemessen. Gesetzt wird `cache_control` aber nirgends. **In `kiFetch()` an einer Stelle setzen, wirkt sofort auf alle ~30 KI-Routen.** Halbiert die Kosten. Frist: Sonnet 5 wird zum 01.09. um 50 % teurer. | 1 Std |
| B3 | **Verwaiste Schreibrechte aufräumen.** Karteileichen in `mitarbeiter_rechte` zu Modulen, die nicht mehr freigeschaltet sind. SQL plus eine Prüfung, damit sie nicht neu entstehen. | 20 Min |
| B4 | **Zwei Ausgaben-Töpfe zusammenführen.** `ausgaben` wird nur noch an einer Stelle gelesen (`app/dashboard/page.tsx` Zeile 140), alles andere läuft über `eingangsbelege`. | 45 Min |

### Block C · Kündigungs-Bereich § 312k BGB — 1 Std
`app/api/vertrag-kuendigung/route.ts` existiert und funktioniert. **Keine einzige
Seite verweist darauf.** Es fehlt nur die Oberfläche: Vertrag wählen, Grund
angeben, bestätigen, Bestätigung per Mail.

### Block D · Analytics und Autoresponder härten — 1,5 Std
Aufrufzählung ohne Dedupe · UTC statt Berlin als Tagesgrenze · A/B-Sieger ohne
Signifikanz · Autoresponder-Grenze `MAX_PRO_DURCHGANG = 300` prüfen.
**Sieht kein Besucher — nur bauen, wenn A bis C stehen.**

### Nicht heute: Bestellstrecke und Dossier-Funnel
6 bis 8 Stunden, und Donnerstag braucht es niemand. Was ich am Donnerstag höre,
ändert die Anforderungen. Wird Freitag oder Samstag gebaut. **Wenn ich meine
Meinung ändere, sage ich es ausdrücklich.**

### Wenn die Zeit knapp wird — in dieser Reihenfolge streichen
Block D → C1 → B4 → A4. **Diese vier bleiben auf jeden Fall:**
A1 (KI-Auge Personal), A3 (Überlauf-Hinweis), B1 (Fahrplan), B2 (Prompt Caching).

---

## 8 · Die Dokumente

Liegen alle in `docs/` im Repo, ich lade sie bei Bedarf hoch:

| Datei | Wofür |
|---|---|
| `ARGONAUT-5-Bauen-heute.pdf` | **der Arbeitsplan — damit fangen wir an** |
| `ARGONAUT-1-Donnerstag.pdf` | Üben, testen, verbinden bis zum Termin |
| `ARGONAUT-2-Zwei-Personen-Tests.pdf` | was nur zu zweit gefunden wird |
| `ARGONAUT-3-Was-noch-zu-bauen-ist.pdf` | die vollständige Modul-Liste |
| `ARGONAUT-4-Extern-und-Warten.pdf` | Bank, Verträge, Partner — **nichts davon vor Donnerstag** |
| `docs/ARGONAUT-GESAMTLISTE.md` | die Quelle, aus der die PDFs entstehen |

---

**Fang so an:** Bestätige mir in zwei Sätzen, dass du den Plan hast, und beginne
dann mit **A1 — KI-Auge auf Personal**. Erst am echten Code prüfen, dann bauen,
dann mir die Datei ins Repo legen und den CMD-Block zum Pushen geben.
Kein langer Vorspann, keine Zusammenfassung dessen, was hier schon steht.
