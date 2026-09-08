# ARGONAUT OS — Übergabe vom 08.09.2026

**Diese Datei ist der Einstieg für den nächsten Chat.** Sie ersetzt die Statusangaben in
`ARGONAUT-MASTER-FAHRPLAN.md` (Stand 18.08.) überall dort, wo sie sich widersprechen —
der Fahrplan bleibt für die M1–M18-Zählung und die Umrechnungstabelle gültig.

> **Zwei Sätze, die alles zusammenfassen:** Der GEMEINSAM-Block ist leer — B3, B6, B9 und
> D1 sind gebaut, und **keiner der vier war das Problem, das auf der Liste stand.**
> Was noch kommt, sind 22 Punkte, 12 SQL-Blöcke und 31 Pushes; 14 davon hängen an nichts.

---

## 1. Wie mit Martin gearbeitet wird — nicht verhandelbar

| Regel | Warum |
|---|---|
| **Deutsch**, Kundentexte immer mit **„Sie"** | Produktsprache |
| **Nie PowerShell — immer CMD**, mit `chcp 65001 >nul` für Umlaute | Umgebung |
| **SQL-Blöcke IMMER direkt in den Chat**, vollständig, copy-paste-fertig | nie auf eine Datei im Repo verweisen |
| **Kontrollieren vor bauen** — jede Datei erst frisch vom Gerät stagen und am echten Code ansehen | hat sich am 08.09. **vier Mal** bezahlt gemacht |
| **Prüf-Kette vor jedem Push:** esbuild + `tsc --noEmit` in der Stub-Umgebung + `node --test` + Gegenprobe mit absichtlichem Typfehler | |
| **Gezielter `git add <datei>`**, nie `git add .` | |
| Ein Push darf mehrere Dateien enthalten — was zusammengehört, kommt zusammen | |
| **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung/Angebot), Zahlungs-/Bank-Integrationen und alles um Auth/Login nur gemeinsam und abgesegnet | |
| Nie „KI-Agenten" oder „KI-Crew" — das Wort heißt **„Bausteine"** (seit 16.08.) | |
| **FREIE HAND:** Bei klarer Empfehlung sofort bauen und den fertigen CMD-Push-Block liefern — nicht auf ein separates „los" warten. SQL und git macht Martin selbst. | |
| Ehrlich sagen, wenn etwas schon existiert oder anders ist als gedacht | |

**Vor der Kontext-Grenze:** Martin rechtzeitig eine kurze Vorwarnung geben, damit er einen
frischen Chat starten kann — nicht stillschweigend komprimieren.

---

## 2. Technische Fallen — teuer gelernt, nicht wieder hineintappen

### 2.1 Supabase `.select()` muss EINE Zeichenkette sein
Wird eine Spaltenliste mit `+` über mehrere Zeilen zusammengesetzt, sieht der Compiler nur
noch `string`, die Abfrage liefert `GenericStringError[]` und **der Build bricht ab** —
obwohl es zur Laufzeit funktioniert. Am 08.09. einmal falsch diagnostiziert („die
generierten Typen kennen die Spalte nicht") und mit einem `unknown`-Cast überdeckt; das war
falsch und wurde zurückgenommen.
**Wächter:** `tests/selectLiteral.test.mjs` durchsucht `app/` und `lib/` und nennt Datei und Zeile.

### 2.2 `MODUL_PFADE` behielt nur den LETZTEN Pfad je Modul
`Object.fromEntries(...)` über `NAV_LINKS` überschrieb Einträge mit gleichem `modul`-Schlüssel.
Ein freigeschalteter Mitarbeiter landete trotzdem auf der Sperre. Behoben mit `reduce` zu
`Record<string, string[]>` plus `flatMap` in `mitarbeiterDarf`. Mit Test abgesichert.

### 2.3 Die Geräte-Brücke schafft nur 7 Ordner Tiefe
`app/dashboard/erp/bestellungen/[id]/page.tsx` liegt 8 Ordner unter dem verbundenen Ordner
und lässt sich **weder stagen noch committen**. Es liegt an der **Tiefe**, nicht an der
eckigen Klammer — das war jahrelang falsch notiert.
**Umweg, der funktioniert:**
```
copy /Y "app\dashboard\erp\bestellungen\[id]\page.tsx" "bestellung-detail.tsx"
```
oben bearbeiten lassen, zurückkopieren, Hilfsdatei mit `del` entfernen.

### 2.4 Die Supabase-Clients sind NICHT typisiert
`lib/supabase.ts` und `lib/supabase-server.ts` übergeben keinen `Database`-Generic.
Deshalb bricht `supabase.rpc('neue_funktion', {...})` den Build **nicht**, auch wenn die
Funktion in keinen generierten Typen steht. Gut zu wissen — aber es heißt auch: Ein
falscher Parametername fällt erst zur Laufzeit auf. Deshalb stehen die RPC-Namen und
Argumente zentral in `lib/lagerBuchung.ts` und sind durch Tests gegen die geprüfte
Signatur gehalten.

### 2.5 Die Sicht `ausgaben_alle` filtert auf `auth.uid()`
Im Supabase-SQL-Editor ist `auth.uid()` NULL → **die Sicht liefert dort 0 Zeilen**.
Das ist kein Defekt. Am 08.09. wäre das beinahe als schwerer Fehler gemeldet worden.

### 2.6 `@supabase/ssr` setzt Cookies mit 400 Tagen Vorgabe
`DEFAULT_COOKIE_OPTIONS.maxAge = 400*24*60*60`. Das war nie eine Entscheidung.
Seit B9 gilt: 30 Tage mit Haken, Sitzungs-Cookie ohne Haken. **`maxAge: 0` wäre der Fehler**
— das löscht das Cookie sofort und meldet den Menschen im selben Moment ab.
`proxy.ts` schreibt bei **jeder** Auffrischung die Cookies neu — jede Dauer-Entscheidung
muss deshalb auch dort lesbar sein (Merk-Cookie `argonaut_angemeldet_bleiben`).

### 2.7 Rechte-Regeln haben Präfixe
Auf den Lager-Tabellen heißen die Policies `abs_*`, `lbw_*`, `lum_*` — **nicht**
`owner_all`/`select_ma`. Wer nach den unpräfixierten Namen sucht, findet nichts und legt
Doppelte an (am 08.09. passiert, danach wieder entfernt).
Bemerkenswert: `lager_bewegung` und `lager_umlagerung` haben **bewusst kein `update_ma`** —
eine Bewegung ist ein Nachweis, kein Notizzettel.

### 2.8 Die Prüf-Umgebung
`/home/claude/pruef` mit Stubs für `next/server`, `next/navigation`, `@supabase/ssr`,
`@supabase/supabase-js`, `next/headers`, `recharts`, `jspdf`, `lib/kasse-tse`, `lib/schwellen`,
`KiAuge`, `Leerzustand`.
**Wenn tsc dort einen Fehler meldet, der im echten Repo nicht existiert: den STUB
korrigieren, niemals den Arbeitscode.** Nach `tsc lib/*.ts --outDir out` müssen den
ESM-Importen in `out/` noch `.js`-Endungen angehängt werden, sonst finden die Tests die Module nicht.

---

## 3. Was am 08.09.2026 gebaut wurde

**Bauliste: 19 von 27.** Der GEMEINSAM-Block ist damit leer.

### B3 · Rechnungs-PDF auf `lib/markeCi` — *1 Fund*
Das PDF hatte eine eigene, ältere Kopie der Marken-Logik; die Felder gingen ungeprüft in
`<style>` und `<img src>`. **Echter Fund:** Ein Betrieb hat `Tübinger Straße 50` im
Logo-Feld stehen — das erzeugte auf **jeder** seiner Rechnungen ein kaputtes Bild-Symbol.
Jetzt: keine echte Bildadresse → kein Bild, keine echte Hex-Farbe → Standardfarbe.
9 Tests, der Straßen-Fall ist einer davon.

### B6 · Beleg-Töpfe — *92 Belege*
Schrumpfte von „zwei Tabellen zusammenlegen" auf **eine Seite liest die falsche Quelle**.
In `ausgaben` steht **eine** Zeile, in `eingangsbelege` **92**. Die EÜR-Seite las nur die
erste Tabelle — sämtliche fotografierten Belege fehlten. Jetzt liest sie `ausgaben_alle`.
**Nichts verschoben, nichts gelöscht.** Die Zusammenlegung ist damit unnötig geworden und
ist bewusst geparkt.

### B9 · „Angemeldet bleiben" — *400 → 30 Tage*
Es fehlte kein Häkchen. Die Bibliothek setzte das Cookie stillschweigend auf **400 Tage**.
Das Häkchen ist deshalb ein **Ausschalter**. Neu: 30 Tage mit Haken (Haken ist
vorbelegt, damit heute niemand unangekündigt hinausfliegt), Sitzungs-Cookie ohne.
12 Tests. Regeln in `lib/anmeldedauer.ts`.

### D1 · Lager je Filiale — *6 Funde, 8 Stellen umgestellt*
Die Struktur existierte längst — sie wurde nur von **acht** Stellen nicht benutzt.
Entwarnung: **kein Betrieb hatte einen Standort angelegt**, es war nichts in Gefahr.

**Datenbank:** `lager_buchen(p_artikel, p_standort, p_typ, p_menge, p_grund, p_herkunft)`
und `lager_umlagern(p_artikel, p_von, p_nach, p_menge, p_notiz)`, beide SECURITY INVOKER,
Rückgabe numeric. **`p_typ` erlaubt NUR `zugang`, `abgang`, `korrektur`** — kein
`umlagerung`. Der Betrieb wird aus dem Artikel gelesen, **nicht** aus `auth.uid()` —
deshalb funktioniert die Funktion auch an der Kasse unter Service-Role.
`artikel.aktueller_bestand` ist ab jetzt die **SUMME** der Filialbestände.
`lager_bewegung.standort_id` musste von NOT NULL befreit werden, sonst wäre **jede**
Buchung mit Fehler 23502 abgebrochen.

**Umgestellt:** Kasse · Werkstatt-Entnahme · Lager-Scanner · Einkauf · Bestell-Detailseite ·
ERP-Artikelseite · Lager-Report · Lager-Matrix.

**Die sechs Funde:**
1. Die **Inventur im Scanner** war mit der Gesamtzahl über *alle* Filialen vorbelegt — wer
   in einer Filiale zählte, hätte alle anderen geleert.
2. Die Werkstatt-Entnahme schrieb `ausgang`, die Rückbuchung `Zugang` mit großem Z — in
   derselben Datei.
3. Eine Entnahme von 3 Stück stand in der Historie als **„+3"**, als wäre Ware gekommen.
4. Im Lager-Report hoben sich Abgänge **gegenseitig auf** (−3 Kasse + 3 Entnahme = 0).
5. Eine **Umlagerung schrieb überhaupt keine Bewegung** — die Ware sprang lautlos von A nach B.
6. Eine Zahl direkt in der Bestandstabelle zu ändern hinterließ keine Spur.

**Wichtig für später:** Die alte Tabelle `lagerbewegungen` bleibt liegen. Es wird in die
neue geschrieben und aus **beiden** gelesen und zusammengeführt (`vereineBewegungen`).
Das ist Absicht — wer nur die alte liest, sieht ab dem 08.09. keine neue Buchung mehr.

**Testbestand: 296 Tests grün.**

---

## 4. Was noch gebaut wird — 22 Punkte · 12 SQL · 31 Pushes

Volle Fassung mit Unterpunkten: **`ARGONAUT-BAULISTE-AKTUELL.md`** (danebenliegend).

| Gruppe | Punkte | SQL | Pushes | wartet auf |
|---|---:|---:|---:|---|
| 1 · Vor dem ersten Kunden | 3 | 1 | 2 | eine Entscheidung |
| 2 · Stimme und Gesicht | 3 | 2 | 4 | Martins Aufnahmen |
| 3 · Onboarding | 2 | 0 | 2 | nichts |
| 4 · Dialog-Block (G1–G5) | 5 | 5 | 11 | nur G4/G5 |
| 5 · Rest der alten Liste | 4 | 2 | 6 | A1 · Testtag |
| 6 · Empfehlungen | 5 | 2 | 6 | Martins Ja |
| **Gesamt** | **22** | **12** | **31** | |

- ohne Gruppe 6: **17 / 10 / 25**
- ohne alles, was auf Verträge und Konten wartet: **14 / 7 / 18** — ohne eine Wartezeit durchziehbar

**Ohne Code, aber offen:** A1 Resend Pro (5 Min) · A3 Anwalt · A4 Stripe · A5 SEPA ·
Prompt-Caching nachsehen · Fahrzeugakte entscheiden · B9+B6 im Browser gegenprüfen ·
**M18 Testtag**.

---

## 5. Der Dialog-Block — was fehlt und warum

**Bestand:** Der KI-Verkaufsberater (`app/api/oeffentlich/chat/route.ts`) ist gebaut und
läuft auf Kundenseiten — er kennt bis zu 40 Shop-Artikel mit Preis und Bestand, ist als KI
gekennzeichnet, Kosten werden protokolliert. **Aber:** Er ist ein Auskunftsgeber, kein
Verkäufer (der Systemtext verweist bei Unbekanntem aufs Kontaktformular), und er läuft
**nur auf Seiten, die in ARGONAUT gebaut sind** (`<script src="/chat.js">`, relativer Pfad,
kein CORS).

**WhatsApp ist ein Lautsprecher, kein Telefon.** Versand, Vorlagen, Opt-in und Kontakte
stehen (`lib/whatsapp.ts`, `lib/whatsappVersand.ts`). Es gibt **keinen Webhook für
eingehende Nachrichten** — die Antwort des Kunden kommt nirgends an.

**Telefonie: null Zeilen.** `crm-voice` ist Spracheingabe fürs CRM, `lib/vorlesen.ts` ist
Vorlesen im Browser. Beides hat mit einem Anruf nichts zu tun.

**„Setter" und „Closer" kommen in keinem Planungsdokument vor** — weder im Backlog noch in
der Gesamtliste noch im Master-Fahrplan. Das ist ein **neuer Block**, kein offener Restpunkt.

---

## 6. Markt und Preise — recherchiert am 08.09.2026

**Kein einziger geprüfter DACH-KMU-Anbieter hat die Kombination** aus Website-Chatbot,
KI-Setter, Voice-Agent und WhatsApp-Dialog. ToolTime, plancraft und Meisterwerk haben Voice
— aber nur Voice. famulor und VITAS haben Voice, aber kein ERP. **Ein KI-Avatar findet sich
bei null Business-Software-Anbietern im DACH-Raum.**

Selbst **ToolTime setzt laut eigenem Blog keine Termine**, sondern liefert nur strukturierte
Notizen. „Termin steht im Kalender" statt „Anruf wurde protokolliert" ist ein messbarer
Unterschied, den heute niemand liefert.

**Preisniveau (Listenpreise 08.09.2026, netto wo ausgewiesen):**

| Segment | Spanne |
|---|---|
| Voice-Agent DACH-KMU | 27–149 €/Mon., Overage 0,13–0,36 €/Min. (famulor 27 €, VITAS 40–49 €, ToolTime 79 €, plancraft 79,90 €) |
| Chatbot als Add-on | Userlike 99 €/Mon. |
| Deutscher Enterprise-Chatbot | **moin.ai 750–2.930 €/Mon.** |
| KMU-Buchhaltung (der Preisanker) | 10–35 €/Mon. je Betrieb |
| ERP je Nutzer | weclapp 39–163 € · myfactory ab 114 € · Odoo 24,90 € |
| ERP je Betrieb | Xentral 99–849 € · plancraft 75–250 € |

**Empfehlung Positionierung:** nicht „All-in-One" (verliert gegen Odoo auf dem Preisblatt),
sondern **die Kette**: Anruf rein → qualifiziert → Termin gesetzt → Schichtplan → Auftrag →
Rechnung mit ZUGFeRD → DATEV. Slogan-Richtung: *„Der KI-Empfang, der auch die Rechnung
schreibt."*

**Empfehlung Preis:** KI-Module separat **79–149 €/Monat** mit 250–500 Freiminuten und
0,15–0,20 €/Min. Overage. Kernsuite als **Betriebspreis**, nicht als Kopfpreis — ab etwa
fünf Nutzern schlägt das jeden Wettbewerber.

**Nachteile ehrlich:** tiefer Preisanker im Markt · Fachtiefe der Alt-Anbieter (pds, Streit,
TopKontor bei Aufmaß/GAEB/DATANORM) · der Steuerberater als heimlicher Entscheider ·
Zertifikate sind bei Kasse/TSE/GoBD Kaufvoraussetzung, nicht Bonus.

---

## 7. Avatar mit Martins Gesicht und Stimme

**Die Kernkorrektur: Martin muss NICHT jeden Satz einsprechen.** Beim Stimmen-Klonen wird
einmal Trainingsmaterial geliefert und danach **beliebiger Text** erzeugt. Es gibt keine
Sprechliste und es braucht keine.

| Wofür | Material |
|---|---|
| Stimme, schneller Start | **1–3 Minuten** Audio (mehr schadet) |
| Stimme, beste Qualität | 30 Min. bis 3 Std. |
| Gesicht (HeyGen/Synthesia) | 2–5 Minuten Video |
| Einverständnisvideo | wenige Sätze, **live** aufgenommen — vorher aufgezeichnete werden abgelehnt |

**Die wichtigste Entscheidung ist eine Architekturfrage, keine Preisfrage.**
Bei 500 Nutzern × 30 Vorlesevorgängen: ohne Zwischenspeicher 120–750 $/Monat, **mit**
Zwischenspeicher unter 2 $/Monat. **Faktor ~750.** Die Guide-Texte sind statisch — jeder
Nutzer hört denselben Satz.
Verfahren: einmal erzeugen, als MP3 ablegen, Dateiname aus Streuwert über
*Text + Stimme + Modellstand*, Browser-Stimme als Rückfall.
**Nebeneffekt, der wichtiger ist als das Geld:** Kommt die Datei aus unserem Speicher, geht
beim Abspielen **kein Byte** an einen US-Dienst — kein Drittlandtransfer im laufenden Betrieb.

**Anbieter:** ElevenLabs Creator ~22 $/Mon. · **Mistral Voxtral (Frankreich)** ~16 $/Mio.
Zeichen, Cloning ab 3 Sekunden Referenz — deutlich günstiger *und* EU-näher.
Selbst betreiben lohnt nicht (eine GPU für 150 $/Mon., um 1 $/Mon. zu sparen).
Video: HeyGen Creator 29 $/Mon. — realistisch ~19 Min. Avatar-Video/Monat, nicht die
beworbenen 30. In Schüben produzieren und zwischendurch kündigen.

**Stand im Code — weiter als in den Notizen:** Der Master-Fahrplan sagt „KiGuide wird
nirgends eingesetzt". **Das stimmt seit dem 04.09. nicht mehr.** `KiGuideBegleiter` hängt
im Dashboard-Layout, wandert über alle ~130 Modulseiten mit, hat Vorlese-Knopf,
Stimmenauswahl und Probesatz. **Es fehlt nur die Stimmquelle.**

### Rechtlich — gehört auf die Anwaltsliste
- **AI Act Art. 50 gilt seit dem 02.08.2026** und wurde im „Digital Omnibus" ausdrücklich
  **nicht** verschoben. Ein Avatar mit echtem Gesicht und echter Stimme ist der Kernfall.
  Die Offenlegung muss **für Menschen wahrnehmbar** sein — die maschinenlesbare Markierung
  des Anbieters reicht laut EU-Kommission **nicht**. Rahmen: bis 15 Mio. € oder 3 % Umsatz.
- **Lizenz Privatperson → Gesellschaft**, wenn eine GmbH/UG das Produkt verkauft.
- **Exit-Klausel:** Was passiert mit Gesicht und Stimme bei einem Verkauf? Persönlichkeits-
  rechte sind im Kern nicht übertragbar. Jetzt aufschreiben ist billig, beim Exit teuer.
- Die geklonte Stimme ist ein **biometrisches Datum** nach Art. 9 DSGVO → eigene
  dokumentierte Einwilligung, AVV mit dem Anbieter, Eintrag ins Verarbeitungsverzeichnis.

---

## 8. Lücken aus dem Systemdurchgang

**Der Fahrplan untertreibt:** **M6 „Verzahnung"** steht als offen mit dem Vermerk „nicht
geprüft". Nachgesehen: Kunde-360°-Akte (`/dashboard/kunde-akte`), „Heute"-Zentrale
(`/dashboard/heute`), globale Suche (`/dashboard/suche`), White-Label (`lib/markeCi.ts`)
und Verbrauch je Kunde (`/api/admin/verbrauch`) **existieren alle**. Von sieben Punkten
sind mindestens fünf gebaut. **M6 gehört überprüft und großteils abgehakt, nicht neu gebaut.**

**Gefunden und offen:**
- **„du" in den Onboarding-Stufen** (`lib/onboardingStufen.ts`) — erste Seite für jeden
  neuen Kunden, einziger Duz-Ort im System; der Guide daneben siezt.
- **Keine KI-Kennzeichnung am sprechenden Guide** — der Shop-Bot hat sie, der Guide nicht.
- **Mitarbeiter sehen keine Anfragen** — auf `leads` liegt nur eine Besitzer-Regel.
  **Martins Entscheidung steht aus.**
- **Prompt-Caching ungeprüft** (offen seit M3) — bei täglich wiederholten System-Prompts
  bares Geld.
- **Import-Vorlage je Branche fehlt** — das Nadelöhr des Onboardings.
- **Fahrzeugakte hat null Schreibvorgänge** — zeigt nur an.
- **`KiAuge` nicht überall ausgerollt.**

**Neu eingebrachte Empfehlungen:** Preisrechner gegen Kopfpreise · Steuerberater-Zugang als
eigener, schreibgeschützter Sitz · Ausfallplan für den KI-Anbieter hinter derselben
`kiFetch`-Funktion · zwei fehlende Kennzahlen (welche Module werden benutzt, wo bricht das
Onboarding ab).

---

## 9. Entscheidungen, die bei Martin liegen

1. **Sehen Mitarbeiter die Anfragen?** (1 SQL oder Punkt streichen)
2. **Empfehlungen aus Gruppe 6 bauen — ja oder nein?** (5 Punkte, 2 SQL, 6 Pushes Unterschied)
3. **B8 Kleinkram-Bündel:** drei Entscheidungen offen
4. Beachhead-Branche · Telefonie-Partner · Stimme geklont oder neutral · ELSTER-Weg ·
   Landingpage-Adressen · Verteilung der 698 Branchen · Fahrzeugakte

---

## 10. Wo was liegt

| Datei | Inhalt |
|---|---|
| `docs/ARGONAUT-BAULISTE-AKTUELL.md` | die 22 Punkte mit Unterpunkten, SQL- und Push-Zahlen |
| `docs/ARGONAUT-Grosser-Durchgang-08-09-2026.pdf` | Markt, Wettbewerb, Avatar, Lücken — ausführlich |
| `docs/ARGONAUT-MASTER-FAHRPLAN.md` | M1–M18-Zählung und Umrechnungstabelle (Status teilweise überholt) |
| `docs/ARGONAUT-GESAMTLISTE.md` | enthält die Vorentscheidungen zum Telefonassistenten |
| `lib/lagerBuchung.ts` | Buchungslogik + RPC-Brücke + Zusammenführung beider Bewegungstabellen |
| `lib/anmeldedauer.ts` | die B9-Entscheidungen |
| `lib/markeCi.ts` | Marke/CI für alle PDFs |
| `tests/selectLiteral.test.mjs` | der Wächter gegen zusammengesetzte Spaltenlisten |

**Artefakte (Seiten im Claude-Konto):** „Die Bauliste" (19/27) · „Dialog-Bestandsaufnahme" ·
„Der große Durchgang" · „Was wirklich noch gebaut wird".

---

## 11. Womit der nächste Chat anfängt

1. **Martin fragen, ob die zehn Minuten Browser-Prüfung erledigt sind** (B9 mit/ohne Haken,
   beide EÜR-Seiten). Falls nicht: das zuerst, es betrifft Anmeldung und Zahlen.
2. **Die zwei Entscheidungen einholen** (Leads-Rechte, Empfehlungen ja/nein).
3. Dann **Gruppe 1** (ein Push, ein SQL) — die Textkorrekturen sind vor dem ersten echten
   Kunden fällig.
4. Danach **A1 Resend Pro** (5 Minuten, schaltet D6 frei), dann **Gruppe 2** sobald Martins
   Tonaufnahme da ist, dann **G1**.

**Nicht vergessen:** Der Testtag M18 ist wichtiger als jeder neue Baustein. 296 Tests sagen
nur, dass der Code richtig rechnet — **keine einzige der neuen Oberflächen wurde je von
einem Menschen im Browser bedient.**
