# ARGONAUT OS — Übergabe-Prompt · Große Brocken (Stand 14.08.2026)

Ich bin **Martin Gaspar**, Gründer von ARGONAUT OS (KI-Betriebssystem/ERP für den deutschen Mittelstand). Wir bauen zusammen weiter. **Lies zuerst diese Übergabe komplett, bestätige den Stand in zwei Sätzen und leg los** — kein langer Vorspann.

**Nordstern dieser Phase:** Die großen Bausteine bauen — **sehr sorgfältig, Thema für Thema, Push für Push.** Ich (Martin) boxe die CMD-/SQL-Blöcke einzeln durch, wenn ich Zeit habe. Ein Thema komplett fertig, dann das nächste.

---

## 1) Arbeitsweise (verbindlich)
- **Deutsch.** Ich bin Perfektionist, technisches Niveau Anfänger–Mittel: alles **vollständig & copy-paste-fertig**. Führ mich Schritt für Schritt.
- **NIEMALS PowerShell — immer CMD.** Kein localhost.
- **Ein Schritt = ein Push.** Kurz WHY, dann EIN CMD-Block (und ggf. ein SQL-Block im Chat davor). Nicht pro Modul auf „erledigt" warten — ich schicke Screenshots asynchron. Bei kritischen Sachen auf grünes Vercel-„Ready" warten, bevor es weitergeht.
- **Kontrollieren vor bauen:** jedes Modul **erst am echten Code** anschauen (frisch stagen!), nur die echte Lücke schließen. Wenn etwas schon existiert oder anders ist als gedacht — ehrlich sagen, nicht blind bauen.
- **esbuild-Check vor jedem Push** (`npx esbuild <datei> --bundle=false --outfile=/dev/null --loader:.tsx=tsx --jsx=automatic`; bei .ts ohne die Loader-Flags). esbuild prüft **keine Typen** — Typen streng selbst lesen. `tsc` + `next build` laufen bei mir im CMD.
- **SQL additiv & idempotent** (`create table if not exists`, `add column if not exists`, Policies mit `drop policy if exists` + eigenem Namen). Bestehendes nie umbauen. „Success. No rows returned" = passt.
- **Staleness-Regel:** Arbeitskopie im Container ist oft veraltet — jede Datei **zuerst frisch vom Gerät stagen**.
- **Klammer-Pfade** (`app/…/[id]/…`) lassen sich stagen UND committen; im CMD braucht `git add` die **:(literal)-Magic**: `git add ":(literal)app/dashboard/rechnungen/[id]/page.tsx"`.
- **„Gemeinsam"-Regel:** Kern-Geld-Formulare (Rechnung/Angebot), Zahlungs-/Bank-Integrationen und Auth/Login nur **gemeinsam/abgesegnet, nie unbeaufsichtigt**. Bei solchen Pushes: ich schaue nach dem Build einmal kurz drauf.
- **„Sie" in Kundentexten.** Nie „KI-Agenten/KI-Crew".

## 2) Wie du Dateien lieferst (Device-Bridge → CMD)
Ablauf pro Datei: **frisch vom Gerät stagen** → im Container **editieren** → **esbuild** grün → **SendUserFile** → **device_commit_files** (fileUuid → devicePath, `force:true`) schreibt sie auf meinen Rechner → ich bekomme **EINEN CMD-Block** (und ggf. einen SQL-Block im Chat). Ich pushe selbst.
- Repo auf meinem Rechner: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` (`.git` liegt in `gaspar-ai-system`). Verbundener Ordner: `C:\Users\Admin\Desktop\gaspar-ai-system`.
- CMD-Grundmuster (immer `chcp 65001 >nul`, keine inneren Anführungszeichen in der Commit-Message):
  `chcp 65001 >nul && cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && git add <dateien> && git commit -m "…" && git push`
- **Commit-Stil:** `"Abschnitt 5: <Modul> - <kurz> nur im Voll-Modus"` bzw. sprechend zum Thema.
- **Transienter Vercel-Font-Fehler** (`@vercel/turbopack-next/internal/font/google/font`) ist NICHT der Code — Fix: leerer Rebuild `git commit --allow-empty -m "Rebuild" && git push`.
- **Effizienz:** Für große Wellen mehrere Prüf-Agenten parallel stagen/bauen lassen, dann zentral esbuild-verifizieren und gebündelt zurückschreiben; CMD-Blöcke je 2–4 Dateien.

## 3) Technik & Marke
- Next.js 16 App Router, React 19, TypeScript, Vercel Production (argonaut-os.com). Supabase (Postgres + RLS, Helfer `mein_chef_id()`), Resend, Gotenberg (VPS) für PDF.
- Marke: Navy `#0A1628`, Navy2 `#0F2036`, Gold `#C9A84C`, Cyan `#00e5ff`, Grün `#4CAF7D`; Fonts DM Sans + Syne; Logo `components/Dreizack.tsx`. Navigation/Rechte: **eine Quelle** `lib/rechte.ts`.

### RLS-Muster (exakt so, wie die Projekt-Tabellen es machen)
```sql
alter table public.<tabelle> enable row level security;
drop policy if exists <x>_select on public.<tabelle>;
create policy <x>_select on public.<tabelle> for select to public using ((auth.uid() = owner_user_id));
drop policy if exists <x>_select_ma on public.<tabelle>;
create policy <x>_select_ma on public.<tabelle> for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists <x>_insert on public.<tabelle>;
create policy <x>_insert on public.<tabelle> for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists <x>_update on public.<tabelle>;
create policy <x>_update on public.<tabelle> for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists <x>_delete on public.<tabelle>;
create policy <x>_delete on public.<tabelle> for delete to public using ((auth.uid() = owner_user_id));
```
Spalten: `id uuid primary key default gen_random_uuid()`, `owner_user_id uuid not null` (Client setzt = `auth.uid()`), Zeitstempel `erstellt_am timestamptz not null default now()`.

### Einfach/Voll-Muster (fertig ausgerollt, für neue Formulare)
`import { NurVoll } from '../_components/Ansicht';` (Präfix an Tiefe anpassen). Nur **klar optionale/Experten-Felder** in `<NurVoll>…</NurVoll>` wickeln (technische IDs, Notiz, sekundäre Daten, `<EigeneFelderInputs>`). **NIEMALS** wickeln: Hauptfeld (Name/Titel), Geld-/Steuer-/Mengenfelder, geprüfte Pflichtfelder, Buttons, Pflicht-Selects, Listen. Danach esbuild, committen.

### Eigene Felder einbauen (Referenz: `app/dashboard/kfz/page.tsx`)
Imports `EigeneFelderManager/Inputs/Anzeige, ladeFelder, ladeWerte, speichereWerte` + `type EigenesFeld`; `const MODUL='<key>'`; State `felder/nmExtra/werteMap`; im Laden `setFelder(await ladeFelder(MODUL))` + `setWerteMap(await ladeWerte(MODUL, rows.map(x=>x.id)))`; im Speichern nach `insert().select('id').single()` → `speichereWerte(MODUL, id, uid, nmExtra)`; render `<EigeneFelderInputs>` (in NurVoll), `<EigeneFelderManager>`, `<EigeneFelderAnzeige>`. Nur wo ein echtes Anlage-Formular existiert.

---

## 4) STAND — was FERTIG & live ist (14.08., am Code geprüft)
- **Fundament:** Infra, 4-Ebenen-Rechtesystem, KI-Kostenschutz inkl. **Prompt-Caching aktiv**. Multistandort komplett. Geldfluss komplett (Beleg-OCR, DATEV-EXTF, ELSTER-Berechnung, Cashflow, SEPA, GiroCode, wiederkehrende Rechnungen, Reisekosten, Anlagen/AfA, Controlling, Mahnwesen, EÜR, GoBD, Banking-Abgleich CSV).
- **Einfach/Voll: auf ~67 Modulen live** — praktisch jedes echte Anlage-Formular (Branchen + Module). Rest ohne Schalter = reine Ansichten (Analytics, Reports, Banking, DATEV, Kasse …), die keins brauchen. **Abschnitt 5 (Modul-Tiefe) sauber durch.**
- **Team-Chat-Bug behoben:** `app/api/hr/mitarbeiter-einladen/route.ts` trägt neu eingeladene Mitarbeiter automatisch in die Team-Kanäle des Chefs ein (Admin-Client, best effort). Dazu lief `supabase-sql/team-chat-mandantentrennung.sql` (Betriebsgrenze in den Einlade-Funktionen).
- **Material-Deckungsbeitrag (A+) fertig:** neue Tabelle `projekt_kosten` (`supabase-sql/nachkalkulation-projektkosten.sql`, mit vorgesehenem `beleg_id`-Platz für spätere Beleg-Automatik), Rechenlogik in `lib/nachkalkulation.ts` erweitert (kosten/deckungsbeitrag/marge), Nachkalkulations-Seite mit Kosten-Erfassung + Spalten Material/DB/Marge (im Voll-Modus). Node-getestet, esbuild grün.
- **KI-Auge** ist bereits auf ~71 Seiten (kein Rollout mehr nötig).

**Verworfen/zurückgestellt:** öffentliche Bestellstrecke (`BESTELLSTRECKE_LIVE=false`, bewusst bis ~100 Kunden), Kartenzahlung (`ZAHLUNG_LIVE=false`, bis Stripe-Konto). §312k-Betreiber-Kündigungsbutton + Auftragsbestätigungs-PDF gehören an diese zurückgestellte Bestellstrecke — nicht vorziehen.

---

## 5) HIER STARTEN — die großen Brocken, Thema für Thema, Push für Push
Reihenfolge-Empfehlung: 1 → 2 → 3(Teil A) → 4 → 5 → 6 → 7 → 8. Ein Thema komplett, dann das nächste. Jeder Punkt = ein Push [CMD] oder ein SQL-Block [SQL]. Vor jedem Bau: frisch stagen + am Code kontrollieren.

### Thema 1 · Automations-Bauer + Regel-Engine  ⭐ ZUERST
Aus dem ERP wird ein aktiver Assistent: Auslöser → Aktion → Bedingung → Wartezeit.
1. **[SQL]** Tabellen `automation_regeln` (trigger_typ, bedingung(jsonb), aktion_typ, aktion_config(jsonb), wartezeit_tage, aktiv) + `automation_log` (regel_id, ausgeführt_am, ergebnis). RLS-Muster wie oben.
2. **[CMD]** Regel-Logik in `lib/automation.ts` (welche Regel trifft zu, welche Aktion, node-testbar).
3. **[CMD]** Dashboard-Seite „Automationen" — Liste + visueller Baukasten (Trigger→Aktion→Bedingung→Wartezeit), Aktivieren/Pausieren.
4. **[CMD]** Motor als Cron-Route `app/api/cron/automationen/route.ts` — prüft fällige Regeln, feuert Aktionen, schreibt Log (CRON_SECRET absichern).
5. **[CMD]** Aktionen an Bestehendes verdrahten: Mahnung (Mahnwesen), Aufgabe anlegen, Status ändern, Mail (Resend).
6. **[CMD]** Beispiel-Regeln + Log-Ansicht + Feinschliff.
→ **1 SQL + 5 Pushes.**

### Thema 2 · Import-Center Stufe 2
1. **[SQL]** `import_jobs` (typ, status, mapping(jsonb), fehler(jsonb)).
2. **[CMD]** Upload + CSV/Excel-Parser (Spalten erkennen).
3. **[CMD]** Spalten-Zuordnung-Oberfläche (Mapping auf Zielfelder).
4. **[CMD]** Import-Ausführung (Kunden/Artikel/Preise/offene Posten) + Validierung/Fehlerbericht.
5. **[CMD]** Import-Vorlage je Branche + Feinschliff.
→ **1 SQL + 4 Pushes.**

### Thema 3 · Installierbare App (PWA) + Offline
1. **[CMD]** Teil A: `manifest.webmanifest` + Icons + Installier-Knopf (schneller Gewinn).
2. **[CMD]** Service-Worker härten (App-Shell cachen, Offline-Fallback-Seite).
3. **[CMD]** Teil B: Offline-Erfassung für 1–2 Kern-Module (Einsatz/Beleg) mit Sync-Queue.
4. **[CMD]** Sync + Konflikt-Handling + Feinschliff.
→ **4 Pushes** (Teil A allein = 1 Push, sofort spürbar).

### Thema 4 · Branchen-Kalkulator (Rezeptur-/Ausbeute-Rechner je Gewerk)
1. **[SQL]** `kalkulator_normen` (gewerk, eingabe_typ, norm_wert je Betrieb).
2. **[CMD]** Universelle Rechen-Logik (Eingaben Material/Zeit/Energie → Kosten/Einheit, kWh/Einheit), node-testbar.
3. **[CMD]** Kalkulator-Seite mit Branchen-Presets (Metallbau, Maler, Bäcker …).
4. **[CMD]** Verknüpfung zu Angebot/Leistungskatalog (Ergebnis übernehmen).
5. **[CMD]** „Aus echten Projekten lernen" (Normen aus BDE/Zuschnitt/Energie speisen).
→ **1 SQL + 4 Pushes.**

### Thema 5 · Academy-Ausbau
1. **[SQL]** `academy_fortschritt` + `academy_medaillen` + Storage-Bucket-Policy.
2. **[CMD]** Video-Player (abspielen, Fortschritt merken).
3. **[CMD]** Upload/Aufnahme eigener Kurse/Videos (Bucket).
4. **[CMD]** Untertitel + Transkript (KI über kiFetch).
5. **[CMD]** Medaillen + Chef-Übersicht.
→ **1 SQL + 4 Pushes.**

### Thema 6 · Batch-API (KI-Kosten senken)
1. **[CMD]** Batch-Absende-/Abhol-Helfer in `lib/ki.ts` (submit → poll → retrieve).
2. **[CMD]** Newsletter-Massenversand auf Batch umstellen.
3. **[CMD]** Social-Posts + Beleg-OCR auf Batch umstellen.
→ **3 Pushes** (kein SQL). Hinweis: eigenes Projekt, kein 1-Klick-Drop-in.

### Thema 7 · DSGVO-Center + Konto-Export
1. **[SQL]** `audit_log` (wer/was/wann) + Trigger auf sensible Tabellen.
2. **[CMD]** Export je Kontakt + „Alles als ZIP".
3. **[CMD]** Löschung je Kontakt (vorsichtig, kaskadierend) — GEMEINSAM.
4. **[CMD]** Audit-Log-Ansicht.
→ **1 SQL + 3 Pushes.**

### Thema 8 · Provisions-/Multiplikatoren-System
1. **[SQL]** `provision_partner` + `provision_zuordnung` (Empfehlung/Multiplikator).
2. **[CMD]** Multiplikatoren-Verwaltung (Zugänge als Gegengeschäft: Vertrag/Logo/Zitat).
3. **[CMD]** Vermittlungsprovision-Strecke + Auszahlung (baut auf `lib/provision.ts`).
→ **1 SQL + 2 Pushes.**

### Thema 9 · Aufräumen / Tech-Schulden — GEMEINSAM (vor dem Testtag)
1. **[SQL]+[CMD]** `ausgaben` ↔ `eingangsbelege` auf einen Topf zusammenführen.
2. **[CMD]** USt-Aufteilung im Mini-Paket sauber (Zahlung ohne Rechnung zählt aktuell voller Netto).
3. **[SQL]** Verwaiste Schreibrechte in `mitarbeiter_rechte` aufräumen.
4. **[CMD]** Analytics härten (Dedupe, Berlin-Tagesgrenze, A/B-Signifikanz).
→ **2 SQL + 3 Pushes.**

### Thema 10 · Content-Maschine  ← Martins Stellschraube 1
**Form (14.08. mit Martin festgelegt):** in den **Admin-Dashboard / Control Room** — ein Bereich, wo Martin **je Branche PDFs auf Knopfdruck erzeugt** (immer wieder). Dazu auf den **Branchenseiten ein Freebie-Feld**: „E-Mail eintragen → Newsletter + das PDF". Füttert die Newsletter-Liste (Motor `lib/newsletter.ts` existiert).
1. **[SQL]** `branchen_pdf` / Lead-Opt-in-Tabelle (falls nötig) + Storage-Bucket für die PDFs.
2. **[CMD]** Control-Room-Bereich „Branchen-PDFs erzeugen" (Gotenberg-Renderer nutzen, je Branche generieren/ablegen).
3. **[CMD]** Freebie-Formular auf den Branchenseiten (E-Mail → Double-Opt-In → Newsletter-Eintrag + PDF-Zusendung/Signed-URL).
4. Der Rest (698 Videos/E-Books-Inhalte) ist **Inhalts-Arbeit** von Martin — nicht in Pushes messbar.
→ **~1 SQL + 2–3 Pushes** für das Tooling.

**Zeit-Summe Code (Themen 1–9): ~9 SQL + ~32 Pushes ≈ 2–2,5 Std PC-Zeit, verteilt über Sitzungen.** Bei ~3,25 Min pro Push.

---

## 6) Martins Stellschraube 2 — SEPA → Stripe (Strategie)
Martin will statt reinem SEPA-Lastschriftmandat **auf Stripe wechseln**, um **Geld zurückhalten** zu können (nicht sofort komplett auszahlen). Code-Pfad ist vorbereitet (`ZAHLUNG_LIVE`-Flag, Bezahllink) — scharfstellen, sobald Stripe-Konto da ist. **Recherche-Ergebnis (14.08.):** Bei Stripe kann man die Auszahlung auf **„manuell"** stellen und Geld im Guthaben halten, bis man selbst auszahlt — **Höchstfrist Deutschland: 90 Tage** (USA 2 Jahre, Thailand 10 Tage). Kein Escrow, sondern „verzögerte Auszahlung"; neue Konten haben anfangs ~7–14 Tage rollierende Wartezeit. → passt zu Martins Puffer-/Cashflow-Strategie.

## 7) Sind wir dann fertig? (ehrlich)
Nach den großen Brocken ist das **Produkt/Code startklar.** „Fertig mit dem Projekt" braucht zusätzlich (kein Code — Martins Business-Fahrplan):
- **Externe Zugänge scharfstellen** (Code anschlussfertig, es fehlen Konten): finAPI, ELSTER-Zertifikat, Stripe/Mollie, Marktplätze, Social/Ads, WhatsApp, TSE/Geräte, ImmoScout, shipcloud, Lohn-ITSG, Mail/Kalender-Sync.
- **Recht:** Anwaltstermin (AGB, AVV Art. 28, Widerruf, §312k, §48b/Sofortmeldung), ISO 27001/TISAX/SOC 2.
- **Betrieb:** SEPA/Stripe scharf, Resend Pro, zentrale Keys.
- **Testtag** (Zwei-Personen-Tests) vor echten Kunden.
- **Öffentliche Bestellstrecke** live (bewusst zurückgestellt bis ~100 Kunden).
- Geparkt: Talent-/Bewerber-Marktplatz, ARGONAUT Universum.

## 8) Referenzen
- Bau-Roadmap (Artefakt/HTML): „ARGONAUT-Bau-Roadmap große Brocken" (Stand 14.08.).
- Ehrliche Offen-Liste (HTML, 13.08.).
- `docs/ARGONAUT-ABHAKLISTE.md`, `docs/ARGONAUT-GESAMTLISTE.md`, `docs/ARGONAUT-MASTER-BRIEFING.md`.

**Fang so an:** Bestätige in zwei Sätzen den Stand, dann starten wir **Thema 1 (Automations-Bauer)** — erst das SQL, dann Push für Push. Sehr sorgfältig, ein Thema komplett, dann das nächste.
