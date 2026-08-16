# ARGONAUT OS — Übergabe: Die letzten Bausteine (Stand 16.08.2026, abends)

Ich bin **Martin Gaspar**, Gründer von ARGONAUT OS (KI-Betriebssystem für den deutschen
Mittelstand). Wir bauen zusammen weiter. **Lies zuerst diese Übergabe komplett, bestätige den
Stand in zwei Sätzen und leg los** — kein langer Vorspann.

---

## 1) Arbeitsweise (verbindlich)

- **Deutsch.** Ich bin Perfektionist, technisches Niveau Anfänger–Mittel: alles **vollständig
  und copy-paste-fertig**, Schritt für Schritt.
- **NIEMALS PowerShell — immer CMD.** Kein localhost.
- **SQL IMMER vollständig in den Chat schreiben.** Nie nur auf eine Datei im Repo verweisen,
  auch wenn der Block lang ist. Ich will nur kopieren müssen.
- **Blockweise arbeiten:** Pro Block zuerst **das komplette SQL** (alles, was der Block
  braucht, in EINEM Block), danach die Pushes einzeln nacheinander. Ich pushe, wann ich Zeit
  habe — du wartest nicht auf „erledigt", sondern lieferst der Reihe nach.
- **Ein Push darf mehrere Dateien enthalten.** Was zusammengehört, kommt zusammen. Nicht pro
  Datei pushen, sondern pro Zusammenhang.
- **Kontrollieren vor bauen.** Jede Datei zuerst **frisch vom Gerät stagen**, dann am echten
  Code anschauen. Ehrlich sagen, wenn etwas schon existiert oder anders ist als gedacht — das
  hat sich bei Thema 3, 6, 9 und 10 jedes Mal ausgezahlt.
- **esbuild-Check vor jedem Push:**
  `npx esbuild <datei> --bundle=false --outfile=/dev/null --loader:.tsx=tsx --jsx=automatic`
  (bei `.ts` ohne die Loader-Flags). esbuild prüft **keine Typen** — zusätzlich `tsc` in einer
  nachgestellten Prüf-Umgebung mit Stubs für zu große Nachbardateien. **Gegenprobe machen:**
  einmal absichtlich einen Typfehler einbauen und sehen, dass die Prüfung anschlägt.
- **Node-Tests** für jede reine Logik-Datei (`node --test`). Keine Hooks, keine Supabase-Aufrufe
  in solchen Dateien.
- **SQL additiv und idempotent:** `create table if not exists`, `add column if not exists`,
  Policies mit `drop policy if exists` + eigenem Namen. Bestehendes nie umbauen.
  „Success. No rows returned" = passt.
- **Staleness-Regel:** Die Arbeitskopie im Container ist oft veraltet — jede Datei zuerst frisch
  vom Gerät stagen.
- **Klammer-Pfade** brauchen im CMD die `:(literal)`-Magic:
  `git add ":(literal)app/branchen/[slug]/BranchenPageClient.tsx"`
- **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung/Angebot), Zahlungs- und Bank-Integrationen
  sowie **alles rund um Auth/Login** nur gemeinsam und abgesegnet — nie unbeaufsichtigt.
- **„Sie" in allen Kundentexten.** Nie „KI-Agenten" oder „KI-Crew" — das Wort ist seit dem
  16.08. auf den Branchenseiten durch **„Bausteine"** ersetzt.
- **Transienter Vercel-Font-Fehler** (`@vercel/turbopack-next/internal/font/google/font`) ist
  NICHT der Code. Fix: leerer Rebuild —
  `git commit --allow-empty -m "Rebuild" && git push`

### Fallen, in die ich am 16.08. getreten bin (nicht wiederholen)

- **Constraint ≠ Index.** `drop index` scheitert, wenn ein UNIQUE-**Constraint** dahintersteht.
  Richtig: `alter table … drop constraint if exists …`
- **Storage-Tabellen sind gesperrt.** `delete from storage.buckets` wirft
  `42501: Direct deletion from storage tables is not allowed`. Buckets nur über die
  Supabase-Oberfläche löschen.
- **Views umgehen RLS.** Eine Sicht muss `with (security_invoker = on)` tragen **und**
  zusätzlich einen ausdrücklichen Betriebsfilter — sonst sieht jeder Betrieb alle Daten.
- **Erst prüfen, dann SQL liefern.** Ich habe zwei überflüssige Tabellen anlegen lassen, weil
  ich nicht gründlich genug kontrolliert hatte. Sie sind inzwischen wieder weg.

---

## 2) Wie du Dateien lieferst (Device-Bridge → CMD)

1. Datei frisch vom Gerät stagen (`device_stage_files`)
2. Im Container bearbeiten, esbuild + tsc + Node-Tests grün
3. `SendUserFile`, dann `device_commit_files` auf den echten Repo-Pfad
4. **EIN** CMD-Block für mich, Grundmuster:

```
chcp 65001 >nul && cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && git add <dateien> && git commit -m "…" && git push
```

Repo: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
(`.git` liegt in `gaspar-ai-system`).

---

## 3) Technik & Marke

- Next.js 16 App Router, React 19, TypeScript (`strict: true`), Vercel Production
  (argonaut-os.com), Supabase (Postgres + RLS, Helfer `mein_chef_id()`), Resend,
  Gotenberg (VPS) für PDF.
- Marke: Navy `#0A1628`, Navy2 `#0F2036`, Gold `#C9A84C`, Cyan `#00e5ff`, Grün `#4CAF7D`;
  Fonts DM Sans + Syne. Navigation und Rechte aus `lib/rechte.ts`.
- **RLS-Standardmuster:** `<x>_select` (auth.uid() = owner_user_id), `<x>_select_ma`
  (owner_user_id = mein_chef_id()), `<x>_insert`, `<x>_update`, `<x>_delete`.
- **Einfach/Voll-Muster:** `import { NurVoll } from '../_components/Ansicht'` — nur optionale
  Experten-Felder wickeln, NIEMALS Hauptfeld, Geld-/Steuerfelder, Buttons oder Pflicht-Selects.
- **Navigation:** eine Quelle `lib/rechte.ts` (NAV_LINKS) — ein neuer Eintrag bekommt den
  Pfadschutz automatisch.
- **`kiFetch(route, options)`** aus `lib/ki.ts` — serverseitiger Drop-in für Anthropic mit
  Kostenprotokoll und Rate-Limit.

---

## 4) Stand — was fertig und live ist

**Die zehn großen Brocken (15./16.08., alle in Production):**

1. **Automations-Bauer** — `automation_regeln` + `automation_log`, `lib/automation.ts`
   (9 Auslöser, 5 Aktionen, 8 Vorlagen), Cron alle 24 h, Probelauf-Route
2. **Import-Center Stufe 2** — `import_jobs`, `lib/importParser.ts` (echtes CSV, Zahl-/
   Datumserkennung, >100 Alias-Zuordnungen), 4-Stufen-Oberfläche
3. **PWA + Offline** — maskable Icons, Installier-Knopf, SW v2, Offline-Warteschlange,
   SW-Cache wird beim Abmelden geleert
4. **Branchen-Kalkulator** — `lib/kalkulator.ts` (8 Gewerke, Skonto/Rabatt „im Hundert"),
   Übergabe ins Angebot mit 3000 Zufallsvergleichen geprüft, Lernen über **Median**
5. **Academy** — Videos, Untertitel, Medaillen, Chef-Übersicht. **Abweichendes RLS:**
   ohne `mein_chef_id()`, sonst sähe jeder den Lernstand der Kollegen
6. **Batch-API** — `ki_batch`, Abhol-Cron alle 15 Min, halbe Kosten für Massenläufe
7. **DSGVO-Center** — Audit-Log (nur Feldnamen, nie Werte), Auskunft nach Art. 15,
   Löschung nach Art. 17 mit Vorschau + Freigabewort + Nachweis, Datenlandkarte über
   51 Tabellen
8. **Partner & Provisionen** — `provision_partner` + `provision_zuordnung`, drei Modelle,
   Gegengeschäft-Mahnliste, gebündelte Auszahlung, Gutschrift-PDF nach § 14 UStG
9. **Tech-Schulden** — Sicht `ausgaben_alle` (EÜR/BWA/Kennzahlen/Export lasen vorher nur
   einen der beiden Ausgaben-Töpfe), USt-Aufteilung für Zahlungen ohne Rechnung mit
   wählbarem Satz, Rechte aufgeräumt + Riegel, Landingpage-Messung entdoppelt
10. **Content-Maschine** — Freebie-Feld auf den Branchenseiten, Control Room unter
    `/admin/dossiers`, Versionsschlüssel in `lib/dossierDatei.ts`

**Zusätzlich am 16.08. abends:**
- Branchenseiten: „KI-Agenten" → **„Bausteine"**, durchgängige Sie-Anrede
- Command Center: Kachel „Branchen-Dossiers"
- **Rechnungsnummern jetzt je Betrieb** statt systemweit (`rechnungen_nummer_je_betrieb`)
- Tabelle **`inhalt_baustein`** angelegt — Grundlage für E-Books und KI-Dialoge

**Rund 690 Node-Tests grün. Aber: keine einzige der neuen Oberflächen wurde je im Browser
bedient.** Das ist der größte offene Posten (Block L).

---

## 5) HIER STARTEN — die Blöcke

Reihenfolge: **A → B → C**, danach nach Bedarf. Pro Block zuerst das komplette SQL, dann die
Pushes einzeln.

---

### Block A · Prüfpunkte (kein Code, 5 Minuten)

1. **`CRON_SECRET` in Vercel prüfen.** Alle zwölf Cron-Routen prüfen darauf. Fehlt die Variable,
   fallen sie auf eine Admin-Session zurück — und Vercel-Crons haben keine Session. Dann liefe
   **kein einziger Cron**. Vorhanden sind laut Screenshot `TERMIN_CRON_GEHEIM` und
   `MAIL_TEST_GEHEIM`, aber `CRON_SECRET` war nicht sichtbar. **Zuerst klären.**
2. `ANALYTICS_SALT` setzen (beliebiger langer Zufallstext, optional).
3. Leeren Bucket `branchen-pdfs` über Storage → Optionen → *Delete bucket* entfernen (optional).

> `GOTENBERG_URL`, `GOTENBERG_USER`, `GOTENBERG_PASSWORD` sind gesetzt (geprüft 16.08.).

---

### Block B · Dossiers erzeugen (kein Code, Martin allein)

1. Command Center → **Branchen-Dossiers**
2. **Eine** Branche suchen → „erzeugen" → „ansehen". PDF wirklich prüfen: Navy-Hintergrund da?
   Umbrüche sauber? Steht irgendwo noch „Agenten"?
3. Dann „alle fehlenden erzeugen" — Pakete zu acht, rund 20 Minuten bei offenem Fenster.

---

### Block C · Inhalts-Werkstatt ← **NÄCHSTER BAU-BROCKEN**
**0 SQL (Tabelle steht bereits) · 4 Pushes**

E-Books **und** die 698 KI-Dialoge aus einem Werkzeug — dieselbe Struktur, dieselbe Erzeugung,
derselbe Freigabe-Haken. Die Tabelle `inhalt_baustein` nimmt vier Typen auf:
`modul_kapitel` · `kategorie_kapitel` · `branchen_vorwort` · `ki_dialog`.

**Die Mengen:**
- ~113 Modul-Kapitel — einmal schreiben, gilt für jeden Kunden
- 19 Kategorie-Kapitel — der Baukasten steht in `app/vorschau/_lib/branchen-bausteine.ts`
- 698 Branchen-Vorworte — kurz, aus Schmerzen + Ergebnissen der Branche

**Push 1 — Logik:** `lib/inhaltBaustein.ts`. Welche Module gehören zu welcher Kategorie
(`lib/branchenkatalog.ts`), welche Kapitel braucht ein E-Book, was ist freigegeben.
Node-getestet, keine Imports außer den Katalogen.

**Push 2 — Erzeugung über die Batch-API.** Nutzt `lib/kiBatch.ts` aus Thema 6 (halbe Kosten).
113 Kapitel als ein Stapel, über Nacht abgeholt. Ergebnis sind **Entwürfe** mit
`freigegeben = false`.

**Push 3 — Redaktion im Control Room.** `/admin/inhalte`: lesen, nachschärfen, Haken setzen.
Ohne Haken erscheint nichts in einem E-Book.

**Push 4 — E-Book bauen und ausliefern.** Wie beim Dossier: HTML zusammensetzen → Gotenberg
(`lib/dossierPdf.ts`) → Bucket. Je Branche: Vorwort + Kategorie-Kapitel + die Modul-Kapitel
dieser Kategorie. Ausspielung über die bestehende Double-Opt-in-Strecke.

**Vorbild für alles:** `app/vorschau/_lib/dossierHtml.ts` und
`app/api/oeffentlich/dossier-pdf/route.ts` — dort steht das Muster schon fertig.

---

### Block D · Liegengebliebene Kleinigkeiten
**0 SQL · 2 Pushes**

- **Freebie auf der Vergleichsseite** — die echte Datei ist `app/vorschau/vergleich/page.tsx`
  (`app/vergleich/page.tsx` ist nur ein Zweizeiler, der dorthin verweist)
- **AGB-Häkchen aus dem reinen Anfrageformular** — bei einer Kontaktanfrage wird kein Vertrag
  geschlossen
- **Eigene Absender-Domain je Kunde** — heute versenden alle über dieselbe Adresse
- **Lager-Zuordnung** im Shop-/Ernte-Weg: echter Katalog-Match statt Namensvergleich
- **„Angemeldet bleiben"-Häkchen** — ⚠️ **GEMEINSAM**, greift in die Sitzungs-Cookies.
  Nicht nebenbei, eigener Termin.

---

### Block E · KI-Deckel für zahlende Kunden
**~1 SQL · 1 Push · wirtschaftlich der wichtigste kleine Punkt**

Heute haben nur Demo-Konten eine Tagesgrenze (`SCHWELLEN.ki.demoKiProTag`). Zahlende Kunden
haben **nur** das Minuten-Limit von 20 — rechnerisch bis zu **28.800 Aufrufe am Tag**. Der
Kostenalarm (`lib/ki.ts:455`) warnt, bremst aber nichts.

AGB § 9.3 deckt die Lösung: erst Warnung, dann Kontakt, dann vorübergehende Begrenzung.
Bei „KI unbegrenzt inklusive" ist das der einzige Schutz gegen einen Kunden, der die
Monatsrechnung sprengt.

---

### Block F · Modul-Tiefe
**~1 SQL · 2 Pushes**

- **Eigene Felder nachziehen** auf: Leads, Dokumente, Fahrzeugakte, Kasse, Academy, Mahnwesen,
  Fördermittel. Muster: `app/dashboard/kfz/page.tsx`
- **Report-Baukasten** — `lib/reportBaukasten.ts` existiert; ob gespeicherte und geplante
  Reports drin sind, ist **ungeprüft**

---

### Block G · Marketing-Tiefe
**~1 SQL · 4 Pushes · nichts davon blockiert einen Verkauf**

Organische Kanäle (YouTube, Pinterest, X, Threads, Bluesky, Mastodon) · Video-Upload-Paket
(Bucket `social-video`, Aufräum-Cron, Quota je Tarif) · Status-Abfrage für Instagram-/
Facebook-Video-Container · native Lead-Formulare, Pixel, Conversion-Optimierung ·
Marketing-Cockpit mit Zeitverlauf und Klickraten · Zielgruppen aus dem CRM · Asset-Bibliothek
mit Bild-KI · SMS, Retargeting, Google-Rezensionen · Landingpage: Branche vorbelegen ·
Autoresponder-Grenzen prüfen (`SOFORT_MAX=50`, `MAX_PRO_DURCHGANG=300`)

---

### Block H · Entscheidungen von Martin (kein Code)

| Frage | Warum sie offen ist |
|---|---|
| **Landingpage-Adressen** | `landingpages.slug` ist systemweit eindeutig — „sommeraktion" gibt es genau einmal. Entweder so lassen, oder Betriebskürzel in die Adresse (`/lp/mueller/sommeraktion`), was bestehende Links ändert. **Nicht einfach umstellen** — die öffentliche Route findet die Seite über genau diesen Slug. |
| **Bereichs-Verteilung der 698 Branchen** | „Handel & E-Commerce" hat **70** in einem Bereich, „Handwerk & Bau" ist sinnvoll in I und II geteilt. Martins Notiz vom 09.08.: erst gemeinsam durchdenken. |
| **Dossier-Look auf den Branchenseiten** | Der aufklappbare Stil von `/vorschau/branchen`. Ein Umbau der Seitenstruktur, kein Textwechsel. |
| **ELSTER-Weg** | ERiC braucht einen echten Server (läuft nicht auf Vercel). Drei Wege: eigener kleiner Server, Dienstleister, oder der Kunde tippt die berechneten Zahlen im Portal ab. |

---

### Block I · Konten und Betrieb (Martin, kein Code)

- Vier SEPA-Variablen: `SEPA_CREDITOR_NAME / IBAN / BIC / GLAEUBIGER_ID`
  (Gläubiger-ID DE31ZZZ00002934437 liegt seit 03.08. vor)
- Inkassovereinbarung mit der Kreissparkasse Böblingen
- Probe-Einzug über `/admin/abo-einzug`
- **Resend auf Pro** — harter Blocker: 100 E-Mails am Tag im Free-Tarif
- Demo-Ablauf auf 7 Tage (plus 7 Kulanz = die versprochenen 14)
- Hostinger-Stufe prüfen (nur noch Gotenberg läuft dort)
- Sieben einfache Zugänge — nur Zugangsdaten eintragen, Code liest sie:
  Bezahllink (Stripe/Mollie/PayPal/SumUp), DATEV, TSE (fiskaly/Epson), Shop
  (Shopware/Shopify/Woo), shipcloud, Marktplätze (Amazon/eBay), Social + WhatsApp

---

### Block J · Bestellstrecke scharfstellen
**0 SQL · 2 Pushes · Reihenfolge zwingend**

Erst Stripe verbinden (Block I), dann Anwaltstermin (Block K), **dann** diese Schalter.

- Kündigungsbutton nach § 312k — Pflicht, sobald Verbraucher online abschließen
- Auftragsbestätigungs-PDF (AGB § 2.3 verlangt es)
- `BESTELLSTRECKE_LIVE` und `ZAHLUNG_LIVE` in `lib/flags.ts` auf `true`

---

### Block K · Recht (Anwaltstermin, ~3 Wochen)

**Der AVV nach Art. 28 DSGVO ist der harte Blocker** — jeder Kunde braucht einen, sonst darf
er ARGONAUT rechtlich nicht einsetzen. Dazu AGB, Widerrufsbelehrung, § 312k, § 48b /
Sofortmeldung. ISO 27001 / TISAX / SOC 2 später.

---

### Block L · Der Testtag ← **zuletzt, ohne Abkürzung**

Zwei Personen gleichzeitig (Chef + Mitarbeiter), damit sich zeigt, ob das Rechtesystem trennt.

**Die drei Geldstellen zuerst:**
- **DSGVO-Löschung** mit einem Testkontakt komplett durchspielen (unumkehrbar)
- **Provisions-Auszahlung** samt Gutschrift-PDF auf Pflichtangaben prüfen
- **EÜR und DATEV-Export** gegen den alten Stand halten — die Zahlen haben sich durch Thema 9
  bewusst geändert (Sicht + USt-Aufteilung)

Dann alles auf dem Telefon, besonders Zeiterfassung und Beleg-Foto.
Vor dem Testtag: Prüfliste mit konkreten Klickwegen schreiben.

---

### Block M · KI-Telefonassistent
**~1 SQL · 3 Pushes · braucht Partnervertrag**

Der digitale Mitarbeiter am Telefon. **Stand in vier Listen und wurde nie gebaut.**
Vorentscheidungen aus `docs/ARGONAUT-GESAMTLISTE.md:347`:

- Anbieter: **Retell** oder **Vapi**
- Stimme: selbst betrieben (XTTS, StyleTTS2, F5-TTS) oder **Cartesia / PlayHT**
- Abrechnung pro Minute — passt zur SEPA-Lastschrift
- **Daran hängt die Gesprächsanalyse**

ARGONAUT bringt die Andockpunkte mit: CRM, Termine, Aufgaben und die Automations-Engine aus
Thema 1. Ein Anruf, der einen Termin einträgt und eine Aufgabe erzeugt, hätte alles.
Es fehlt die Telefonie-Seite und ein Modul, das Gespräche entgegennimmt und protokolliert.

---

### Block N · Avatar Stufe 2–4
**0–1 Push**

Stufe 1 läuft seit 03.08. `KiGuide` hat `avatarUrl` und `onVorlesen` **bereits vorgesehen** —
kein Umbau nötig, nur Inhalte und ein Konto. Gesicht über HeyGen/Synthesia (vorgerendert) oder
Simli/Anam/Tavus (Echtzeit), Stimme über ElevenLabs (~22 USD/Monat).
Offene Frage: geklonte oder neutrale Stimme?
Idee aus dem 09.08.: ein Avatar, der von Modul zu Modul springt und die Texte spricht —
einmal aufnehmen, für immer gleich. Texte liefert Martin.

---

### Block O · Ganz zuletzt (Martins Ansage vom 16.08.)
**~1 SQL · 2 Pushes**

- **finAPI-Bankabruf** — Zugang wird gespeichert, der automatische Abruf fehlt.
  CSV-Abgleich läuft ohne. Steht im Code als „Anschlussfertig, Auto-Abruf noch in Aufbau".
- **ELSTER-Übertragung** — Kennziffern werden berechnet, die Übermittlung fehlt.
  Steht im Code als „die direkte Übermittlung (ERiC) ist noch in Aufbau".

---

### Kleinkram, der nirgends sonst passt

- Connector-SQL automatisieren (muss bei jedem neuen Demo-Konto von Hand wiederholt werden)
- Master-Fahrplan neu durchnummerieren (zwei parallele Zählungen)
- Brand-Story „Die Geschichte vom Argonaut", Trust-Layer, Enterprise-Slot im Control Room
- Geräte: Etikettendrucker, TSE, Waage — nur der Scanner ist live

---

## 6) Was NICHT gemacht wird

- Öffentliche Bestellstrecke vorziehen (bewusst zurückgestellt bis ~100 Kunden)
- § 312k-Button und Auftragsbestätigungs-PDF vorziehen — die gehören an die Bestellstrecke
- Talent-/Bewerber-Marktplatz, ARGONAUT Universum (geparkt)
- Die alte Agenten-Seite wiederbeleben (Schaufenster ohne Funktion, Code bleibt liegen)

---

## 7) Referenzen im Repo

- `docs/ARGONAUT-UEBERGABE-GROSSE-BROECKEN.md` — die Übergabe vom 14.08. (Themen 1–10)
- `docs/ARGONAUT-ABHAKLISTE.md` — 20 Abschnitte, Stand 09.08.
- `docs/ARGONAUT-GESAMTLISTE.md` — 27 KB, Stand 02.08., enthält den Telefonassistenten
- `docs/ARGONAUT-CHECKLISTE-ENDSPURT.md` — SEPA, KI-Kosten, laufende Betriebskosten
- `docs/ARGONAUT-MASTER-BRIEFING.md` — 47 KB Gesamtbriefing
- `supabase-sql/` — alle bisher eingespielten SQL-Dateien

---

**Fang so an:** Bestätige in zwei Sätzen den Stand, dann **Block A** (die drei Prüfpunkte,
besonders `CRON_SECRET`), danach **Block C — die Inhalts-Werkstatt**. Erst das Konzept kurz
bestätigen lassen, dann Push für Push. Sehr sorgfältig, ein Block komplett, dann der nächste.
