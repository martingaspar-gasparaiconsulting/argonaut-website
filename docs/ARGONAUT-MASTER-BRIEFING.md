# ARGONAUT OS — Master-Briefing & Branchen-Roadmap

> **Für eine neue Claude-Session: Lies diese Datei ZUERST vollständig.**
> Danach bist du auf unserem Stand und kannst sofort Schritt für Schritt weiterbauen.
> Diese Datei ist die einzige Quelle der Wahrheit für Arbeitsweise, Architektur und Plan.
> Letzte Aktualisierung: Session vom 27.07.2026 (Bausteine 1–18 komplett: 6 geteilte + 12 große List-1-Module).

---

## STAND 08.08.2026 — Multistandort (Block D) läuft (NEU — überschreibt ältere Multistandort-Notizen)

> **Wichtig:** Frühere Aussagen wie „Multistandort existiert nur im Preisrechner, es gibt keine `standorte`-Tabelle / kein `standort_id`" sind **überholt.** Multistandort ist jetzt real und wird Modul für Modul ausgerollt.

**Heute grün (alle live):**
- Fundament: `standorte`-Tabelle, Filial-Umschalter (Cookie `argonaut_standort`), Filialleitung/Rollen, Filial-Module, Filialvergleich.
- Wiederverwendbar: `lib/aktiverStandort.ts`, `lib/standortDaten.ts` (`konkreterStandort`, `standortOrFilter`), Baustein `app/dashboard/_components/FilialZuordnung.tsx`.
- **D-Pilot Leads** (Stempel) · **D2 Dokumente** (`document_standorte`) · **D3 Sortiment** (`artikel_standorte`) · **D4 Aufträge** (`auftraege.standort_id`).
- Modell-Kontrolle: alle KI-Aufrufe über `kiFetch`; 22 Routen Haiku, 9 gezielt Sonnet (bewusst so).

**Muster (so jedes weitere Modul):** *Stempel* = `standort_id`-Spalte + beim Anlegen stempeln + Liste fail-open (`.or(standortOrFilter(sid))` **vor** `.order()`). *Zuordnung* = Join-Tabelle `<x>_standorte` + `FilialZuordnung`-Knopf + fail-open. Ohne Zuordnung bleibt alles überall sichtbar (nichts verschwindet).

**Nächster Schritt:** Rechnungen (Stempel). **Voller Plan + Push-Liste (~15 Kern / ~25 alles):** siehe `docs/UEBERGABE-MULTISTANDORT.md` — das aktuelle Drehbuch für diesen Strang.

---

## 0. Was ist ARGONAUT OS?

Ein KI-Betriebssystem (SaaS) für den deutschen Mittelstand. Ein einziges System
für den ganzen Betrieb: Vertrieb/CRM, Angebote, Rechnungen, Termine, Lager,
Buchhaltung, Recht/Compliance, Branchen-Fachpakete. Gründer & Nutzer: **Martin
Gaspar**. Ziel: durch **Tiefe** und **Branchen-Schärfe** die Wettbewerber
verdrängen — nicht durch noch mehr Module (Breite ist fast erschlagen, ~80 Module).

---

## 1. Nutzer & Arbeitsstil (STRIKT einhalten)

- **Sprache: Deutsch.** Immer.
- **Schritt für Schritt.** Immer nur EINEN Schritt liefern, dann auf Martins
  **„erledigt"** warten, bevor es weitergeht.
- **Alles copy-paste fertig.** Vollständige Blöcke, nichts Halbes.
- **NIEMALS PowerShell — immer CMD.** Kein `localhost`.
- **Perfektionist. „Korrigier lieber doppelt."** Keine Fehler. Vor jedem Push
  Build-Check. Bei Zahlen/Rechtsvorgaben (Steuersätze, Grenzwerte) IMMER vorher
  per WebSearch die aktuellen Werte prüfen — nie aus dem Bauch.
- Technisches Niveau: Anfänger bis Mittel. Erklär knapp, was zu tun ist.
- Bei langem SQL: Martin darauf hinweisen, den Supabase-Editor zu leeren
  (**Strg+A, Entf**) und dann komplett einzufügen — sonst wird abgeschnitten.

### Rhythmus pro Baustein (immer diese Reihenfolge)
1. **SQL zuerst** (falls nötig) → Martin führt es im Supabase-SQL-Editor aus.
2. **Build-Check** (Martin im CMD):
   ```
   cd /d C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
   chcp 65001 >nul && npx tsc --noEmit && npx next build
   ```
   Erwartung: „✓ Compiled successfully", kein rotes `Error:`.
3. **Gezielter `git add`** (nur die geänderten Dateien, nie `git add -A` —
   `docs/` und evtl. `ki-landkarte.js` bewusst draußen lassen, außer explizit).
4. **EIN `git commit`** mit sprechender Message.
5. **EIN `git push`**.

Bei eckigen Klammern im Pfad (`[token]`) den **Ordner** adressieren
(`git add app/portal`) statt den Datei­pfad — sonst git-Probleme.

---

## 2. Technik & Architektur

- **Next.js 16 App Router (Turbopack), React 19, TypeScript.** Inline-Styles im
  Dashboard (kein Tailwind in den Modulen).
- **Supabase Postgres + RLS Tenant-Muster** (Mandantentrennung):
  - Jede Tabelle: `owner_user_id uuid not null`.
  - Helfer `mein_chef_id()` (Chef → eigene ID, Mitarbeiter → Chef-ID).
  - Policies IMMER: `owner_all` (auth.uid()=owner_user_id) + `select_ma` /
    `insert_ma` / `update_ma` (owner_user_id = mein_chef_id()).
  - **SQL immer idempotent**: `create table if not exists`, `add column if not
    exists`, `drop policy if exists` vor `create policy`.
- **Supabase-Clients:**
  - Browser: `createBrowserClient` aus `@supabase/ssr`.
  - Server: `createClient` aus `@/lib/supabase-server`.
  - Öffentliche Routen (login-frei): lokaler `admin()` = Service-Role aus
    `@supabase/supabase-js`, `runtime='nodejs'`, `dynamic='force-dynamic'`.
  - Admin: `createAdminClient` aus `@/lib/supabase-admin`.
- **Regel-Ebene & KI-Auge (Kostenphilosophie):**
  - Wo die Antwort berechenbar ist → **Formel** (0 €, sofort, nie falsch).
  - `lib/auge.ts` = Regelfunktionen (augeRechnungen, augeHeute, augeMahnwesen,
    augeLager, augeCrm, augeAmpel …) → geben `{klartext, punkte, stimmung}`.
  - Komponente `app/dashboard/_components/KiAuge.tsx` mit Prop `regel` → zeigt
    die Regel-Antwort beim Aufklappen SOFORT ohne KI-Aufruf. Pulsierend, klickbar.
  - Nur bei echtem Freitext ruft ein Modul die echte KI-Route.
  - `lib/ki.ts` = `kiFetch`: Rate-Limit (SCHWELLEN.ki.rateLimitProMinute=20/Min
    pro User), Kosten-Logging in Tabelle `ki_nutzung`, Kosten-Alarm.
  - `lib/schwellen.ts` = zentrale Schwellenwerte.
- **PDF:** Gotenberg (`${GOTENBERG_URL}/forms/chromium/convert/html`, Basic-Auth).
- **OCR:** Anthropic Vision (claude-haiku-4-5) für Belege.
- **Marken-Palette** (in jedem Modul als `const C = {...}`):
  navy `#0A1628` · navy2 `#0F2036` · gold `#C9A84C` · cyan `#00e5ff` ·
  green `#4CAF7D` · text `#E8EDF4` · textDim `#8FA3BE` ·
  border `rgba(143,163,190,0.18)` · danger `#E06666` · warn `#E0A24C` · lila `#A98CE0`.
  Fonts: `var(--font-syne)` (H1), `var(--font-dm-sans)` (Text).

---

## 3. Repo & Auslieferung

- **Device-Repo (auf Martins Rechner):**
  `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website\`
- **Cloud-Spiegel:** `/mnt/user-data/uploads/argonaut-website/`
  — ACHTUNG: unvollständig! Manche Seiten liegen nur auf dem Device. Fehlt eine
  Datei, per `mcp__remote-devices__device_stage_files` vom Device holen, bearbeiten,
  zurückliefern.
- **Auslieferung einer Datei:** Datei im Cloud-Workspace schreiben →
  `SendUserFile` → `mcp__remote-devices__device_commit_files` (force:true) an den
  passenden Device-Pfad.
- **`lib/rechte.ts` → `NAV_LINKS`** ist die EINZIGE Quelle für Module, Rechte,
  Navigation. Ein neuer Eintrag `{ label, href, modul, ebene, gruppe }` bekommt
  automatisch Pfadschutz + Rechte-Katalog. Gruppen (GRUPPEN): `start, mein, komm,
  vertrieb, termine, betrieb, lager, finanzen, verwaltung`. Ebenen: 1=Eigentümer,
  2=Admin (sensibel), 3=operativ, 4=jeder. `sensibel:true` → 2-fach-Bestätigung.
- **`lib/pakete.ts`** = Branchen-Pakete: welche Module ein Kunde je Branche
  bekommt (KERN_MODULE + BRANCHEN_PAKETE). Hier neue Branchen-Bündel eintragen.

### Muster: ein neues Modul bauen
1. `supabase-sql/<name>.sql` — Tabelle(n), idempotent, RLS nach Tenant-Muster.
2. `lib/<name>.ts` — reine Formeln/Logik (keine Hooks, keine Supabase-Aufrufe),
   web-verifizierte Werte, klar getippt.
3. `app/dashboard/<name>/page.tsx` — self-contained Client-Seite mit `C`-Palette,
   `createBrowserClient`, Laden/Speichern, KPIs, ggf. KiAuge mit `regel`.
4. `lib/rechte.ts` — NAV_LINKS-Eintrag (Modul-Key, Gruppe, Ebene).
5. ggf. `lib/pakete.ts` — Modul dem/den Branchen-Paket(en) zuordnen.
6. Zahlen/Formeln vorab mit einem kleinen Node-Test gegenprüfen.

---

## 4. Stand: was ist schon gebaut & gepusht

**~80 Module** insgesamt (siehe NAV_LINKS). In der jüngsten Session live gegangen:

- **KI-Absicherung:** Rate-Limit + Kosten-Alarm (`lib/ki.ts`, `lib/schwellen.ts`,
  Admin-Verbrauch), **Regel-Auge (0 €)** auf Rechnungen, Heute, Mahnwesen, CRM, Lager.
- **Compliance:** Prüffristen (`pruefpflichten`), **DSGVO-Center**
  (`dsgvo_verfahren` VVT Art. 30 + `dsgvo_anfragen` DSAR 1-Monats-Frist).
- **Aktivitäts-Timeline** (`/dashboard/aktivitaet`) — Kundenchronik.
- **Verträge → Unterschrift** (Brücke via `lib/signaturStart.ts`).
- **Buchhaltung-Rest (komplett):**
  - Beleg → **DATEV-Kontovorschlag** (`lib/datevKonten.ts`, SKR03/SKR04).
  - **Reisekosten** (`lib/reisekosten.ts`) — Verpflegungspauschale + km-Geld.
  - **Anlagenbuchhaltung + AfA** (`lib/afa.ts`) — GWG-Sofort + lineare AfA
    monatsgenau, Abschreibungsplan.
  - **Controlling** (`lib/controlling.ts`) — Ergebnis/Marge, Break-even,
    Liquidität, Stundensatz, EK-Quote.
  - **EÜR** (`/dashboard/euer`) — Verzahnung Rechnungen/Belege/Reisekosten/AfA
    + USt-Übersicht.
- **Zahlungen Ein-/Ausgänge** (`/dashboard/zahlungen`) + Portal-Knopf „Ich habe
  bezahlt" (`zahlung_gemeldet_am`). Als Brücke zum späteren Banktool gebaut.
- **Team-Chat-Bug** dokumentiert in `docs/team-chat-bug.md` (nicht blind gefixt).

### Verifizierte Fakten (Stand 2026, per WebSearch geprüft)
- Verpflegungspauschale Inland: **28 €** (voller Tag), **14 €** (An-/Abreise bzw.
  eintägig >8 h). Kürzung: Frühstück 5,60 €, Mittag/Abend je 11,20 €.
- km-Pauschale Dienstreise Privat-Pkw: **0,30 €**/km (Motorrad 0,20 €).
  (Die 38-Cent-Reform 2026 betrifft NUR den Arbeitsweg/Pendlerpauschale.)
- **GWG-Grenze: 800 € netto** (Sofortabschreibung). Darüber lineare AfA
  monatsgenau (pro rata temporis).
- Aufbewahrung: Buchungsbelege **8 J** (seit BEG IV), Bücher/Inventare/
  Jahresabschlüsse **10 J**, Handels-/Geschäftsbriefe **6 J**.

### Baustein 1 · Verträge/Abos/Wartung & Wiederkehr — KOMPLETT (27.07.2026)
Der erste geteilte Baustein (~375 Branchen) ist gebaut & gepusht. Vorher lag
„Wiederkehr" vierfach zersplittert (wartungsvertraege, abo_rechnungen,
mitglieder, vertraege). Jetzt verbunden:
- **Block A — Wartung→Rechnung-Brücke:** SQL (`wartungsvertraege` +
  `mwst_satz`, `letzte_abrechnung_am`, `kontakt_id`); `lib/wiederkehr.ts`
  (reine Formeln, node-getestet); Route `app/api/rechnung-aus-wartung`;
  „→ Rechnung"-Knopf + Doppel-Abrechnungs-Schutz im Wartungs-Modul.
- **Block B — Wiederkehr-Cockpit:** `app/dashboard/wiederkehr` zieht alle 4
  Quellen zusammen (MRR, jetzt/bald fällig, Ausgaben/Monat), Regel-Auge
  `augeWiederkehr` in `lib/auge.ts`, NAV in `rechte.ts` (Modul-Key `wiederkehr`).
- **Block C — Auto-Trigger-Engine:** Tabelle `wiederkehr_lauf` (Lauf-Protokoll);
  Route `app/api/wiederkehr-lauf` (Vorschau + echter Lauf, idempotent);
  „⚡ Alle fälligen abrechnen"-Knopf mit Nachfrage im Cockpit.
- **Block D — Verzahnung:** Wartung↔CRM-Kontakt (D1). D2/D3/D4 waren schon in
  B/C abgedeckt (Verträge als Ausgabe, Mitglieder im MRR, Wartung-Auto-Abr.).
- **Block E — Branchen-Vorlagen:** `WARTUNG_VORLAGEN` (8 Typen: GaLaBau-Turnus,
  DGUV V3, SHK-Heizung, Retainer, Miete, Saison, Aufzug, Feuerlöscher) +
  „Aus Vorlage starten" im Wartungs-Formular. Fristen web-geprüft
  (Feuerlöscher alle 2 J. / DIN 14406-4).
- **Block F — Abschluss:** `wiederkehr` als KERN-Modul in `pakete.ts`;
  Import-Vorlage `public/vorlagen/wartungsvertraege-import-vorlage.csv`;
  §14-UStG bestätigt (Auto-Nummer-Trigger `fn_rechnung_nummer` greift für alle
  erzeugten Rechnungen).
- **OFFEN → Testtag:** Live-Tests (Baustein 12 etc.) gebündelt; optional später:
  bestehende `pruefpflichten`-Einträge als Wartungsverträge importieren.

### Baustein 2 · Objekt-/Asset-Register — KOMPLETT (27.07.2026)
Zweiter geteilter Baustein (~295 Branchen), Baumkataster (`forst`) als Blaupause.
- **Block G — Fundament:** SQL `asset_gruppen` (optionale Standort-/Gruppen-Ebene)
  + `assets` (generisch: typ, bezeichnung, standort, zustand-Ampel gut/beobachten/
  kritisch, kontrollintervall_monate, letzte_/naechste_kontrolle, anschaffung,
  gruppe_id/kontakt_id/wartungsvertrag_id). `lib/assets.ts` (Formeln node-getestet:
  Kontroll-Fälligkeit, Zustand-Ampel, Alter). Seite `app/dashboard/objekte`
  (KPIs, Ampeln, Filter, CRUD, neue Gruppe inline). Regel-Auge `augeObjekte`.
  NAV in `rechte.ts` (Modul-Key `objekte`, Gruppe betrieb).
- **Block H — Verzahnung:** „🔧 Wartung aus Objekt anlegen" → legt Wartungsvertrag
  an (Termin = Objekt-Kontrolle) und setzt `assets.wartungsvertrag_id`. Damit
  fließt jedes Objekt in Wartung → Rechnung → Wiederkehr-Cockpit (Baustein 1).
- **Block I — Typen & Fristen:** `OBJEKT_TYPEN` (10 Typen mit web-geprüften
  Standard-Prüffristen: Feuerlöscher 24 Mon./DIN 14406-4, Aufzug jährlich/BetrSichV,
  DGUV-Richtwerte); Typ-Wahl setzt die Frist automatisch. Andockpunkte AfA/
  Fahrzeugakte bewusst nicht dupliziert, sondern markiert.
- **Block F/J — Abschluss:** `objekte` als KERN-Modul in `pakete.ts`; Import-Vorlage
  `public/vorlagen/objekte-import-vorlage.csv`.
- **OFFEN → Testtag:** Live-Tests gebündelt.
- **Nächster Baustein:** #3 Projekt-/Zeiterfassung + Aufwand-Abrechnung (~250) —
  laut Strategie nur glattziehen; danach #4 Rezeptur/Ausbeute, #5 Chargen/HACCP,
  #6 Fördermittel/Nachweise.

### Baustein 3 · Projekt-/Zeiterfassung + Aufwand-Abrechnung — KOMPLETT (27.07.2026)
Dritter geteilter Baustein (~250 Branchen), Strategie „nur glattziehen".
Ausgangslage: drei parallele Zeit-Systeme — HR-Stempeluhr (`zeit_sitzungen`,
gesetzliche Arbeitszeit, bleibt außen vor), Objektzeiten (`objekte`+`objekt_zeiten`,
Dauer als `dauer_minuten`, mit `abrechenbar`), Projekt-Leistungen
(`projektleistungen`, voll abrechenbar via `/api/rechnung-aus-projekt`).
- **Block K — Objektzeit→Rechnung-Brücke (Lücke geschlossen):** SQL macht
  `objekt_zeiten` abrechnungsfähig (`abgerechnet`, `rechnung_id`, `mwst_satz`);
  Route `/api/rechnung-aus-objektzeit` (Muster wie rechnung-aus-projekt; Satz
  je Zeile oder Objekt-Fallback); „🧾 Rechnung"-Knopf je Objekt in `objektzeiten`
  + Abgerechnet-Markierung + Lösch-Schutz.
- **Block L — Aufwand-Cockpit:** `lib/aufwand.ts` (Formeln node-getestet:
  Projekt- + Objektzeit-Normalisierung, offen/abgerechnet, Gruppierung);
  Seite `app/dashboard/aufwand` (KPIs offener Aufwand/Std/Posten/abgerechnet,
  Liste je Projekt/Objekt mit „abrechnen"-Knopf → passende Route);
  Regel-Auge `augeAufwand`; NAV `rechte.ts` Modul-Key `aufwand` (Gruppe vertrieb).
- **Block M — Glattziehen/Abschluss:** persistenter Standard-Stundensatz
  (`profiles.standard_stundensatz`, vorbelegt + lernt beim Buchen in
  projekt-abrechnung); `aufwand` als KERN-Modul; Import-Vorlage
  `public/vorlagen/aufwand-import-vorlage.csv`; §14 vererbt.
- **OFFEN → Testtag:** Live-Tests. Größere Idee für später (NICHT jetzt, heikel):
  objektzeiten-`objekte` und das neue `assets`-Register zusammenlegen.
- **Nächster Baustein:** #4 Rezeptur-/Ausbeute-Rechner (~114, Neubau, öffnet
  Lebensmittel + Gastro).

### Baustein 4 · Rezeptur-/Ausbeute-Rechner — KOMPLETT (27.07.2026)
Vierter geteilter Baustein (~114 Branchen), Neubau. Dockt aufs Lebensmittel-
Fachpaket (`lm_chargen`/`lm_haccp`) an; die Branchen-Schärfe für Bäcker/
Metzger/Konditor/Brauer/Küche.
- **Block N:** `lib/rezeptur.ts` (Fachformeln node-getestet + web-verifiziert:
  Teigausbeute TA=(Mehl+Wasser)/Mehl×100, Schüttwasser, Backverlust hin/zurück,
  Zerlege-/Sud-Ausbeute, Skalierung, Wareneinsatz, Food-Cost-Verkaufspreis);
  SQL `rezepturen` + `rezeptur_zutaten` (Zutat mit rolle mehl/wasser/sonstige,
  RLS); Seite `app/dashboard/rezeptur` (Rezept + Zutaten, Live-Rechner je Typ,
  Skalierung); Regel-Auge `augeRezeptur`; NAV `rechte.ts` Modul-Key `rezeptur`
  (Gruppe betrieb).
- **Block O:** typ-spezifische Rechner (Teig/Wurst/Konditor/Getränk) schon in N;
  „🏷 Charge erzeugen" (Rezept → `lm_chargen`, Andock ans Lebensmittel-Fachpaket).
- **Block P:** `rezeptur` in die Branchen-Pakete Lebensmittel + Gastro (NICHT
  Kern — branchenspezifisch); Import-Vorlage `public/vorlagen/rezeptur-import-vorlage.csv`.
- **Lektion (27.07.):** `lib/rezeptur.ts` fiel beim N-Commit durch (Vercel-Build
  rot „Module not found @/lib/rezeptur"); per `git add lib/rezeptur.ts` nachgereicht
  → grün. Merke: nach jedem Push Vercel-Status prüfen; neue lib-Datei wirklich mit-adden.
- **OFFEN → Testtag:** Live-Tests.
- **Nächster Baustein:** #5 Chargen/HACCP als sauberer Baustein (~71) — Fundament
  `lm_chargen`/`lm_haccp` steht schon.

### Baustein 5 · Chargen/HACCP schärfen — KOMPLETT (27.07.2026)
Fünfter geteilter Baustein (~71 Branchen), Schärfen des vorhandenen Lebensmittel-
Fachpakets (kein neues Modul — alles im `lebensmittel`-Modul, 3 Reiter).
- **Block Q — Chargen-Rückverfolgung:** SQL additiv (`lm_chargen` +status
  aktiv/gesperrt/verbraucht +herkunft +verwendung; neue `lm_haccp_plan`;
  `lm_haccp` +plan_id); `lib/haccp.ts` (Formeln node-getestet: MHD-Ampel,
  Kontroll-Fälligkeit, Sollwert-Bewertung "<= 7 °C" gegen Messwert);
  Lebensmittel-Seite: Chargen-Status + Sperren/Freigeben/Verbraucht +
  Herkunft/Verwendung + MHD-KPIs; Regel-Auge `augeHaccp`.
- **Block R — HACCP-Kontrollplan (Soll→Ist):** neuer Reiter „Kontrollplan"
  (Punkt + Sollwert + Intervall), fällige Kontrollen live, „✓ Kontrollieren"
  fragt Messwert ab, bewertet automatisch gegen Sollwert (bewerteMesswert),
  schreibt HACCP-Doku + Plan fort. Alter HACCP-Reiter bleibt als manuelle Doku.
- **Deploy-Notiz:** tsc fing 2 Typfehler vor dem Push (MHD_META txt-Param war
  optional → `undefined` nicht auf `string|null` zuweisbar); gefixt, dann grün.
- **OFFEN → Testtag:** Live-Tests. Import-Vorlage
  `public/vorlagen/chargen-import-vorlage.csv`.
- **Nächster/letzter Baustein:** #6 Fördermittel/Beiträge/Nachweise (~92) —
  danach sind alle 6 großen geteilten Bausteine durch.

### Baustein 6 · Fördermittel-Nachweise & Fristen — KOMPLETT (27.07.2026)
Sechster und LETZTER geteilter Baustein (~92 Branchen). Schärfen des vorhandenen
Fördermittel-Assistenten (`foerder_vorhaben` + Katalog `programme.ts`).
Ausgangslage: Programm-Merkliste mit Status + Frist-Ampel; „Beiträge" schon durch
`mitglieder` abgedeckt. Lücke: kein Verwendungsnachweis, keine Fristen-Übersicht.
- **Block T:** SQL additiv (`foerder_vorhaben` +bewilligt_betrag, +verwendet_betrag,
  +nachweis_frist, +nachweis_status offen/eingereicht/anerkannt); `lib/foerder.ts`
  (Formeln node-getestet: Fristen-Ampel Antrag+Nachweis, Rest-Verwendung, Quote,
  nachweisOffen, zaehleFoerder); Fördermittel-Seite: Verwendungsnachweis-Block je
  bewilligtem Vorhaben (Bewilligt/Verwendet/Nachweis-Frist/Nachweis-Status + Rest +
  Quote + Nachweis-Ampel), Fristen-/Nachweis-KPIs, Regel-Auge `augeFoerder`.
- **Block U:** Import-Vorlage `public/vorlagen/foerdervorhaben-import-vorlage.csv`;
  `foerdermittel` ist bereits buchbares Modul (kein pakete.ts-Eintrag nötig).
- **OFFEN → Testtag:** Live-Tests.

### 🏆 ALLE 6 GETEILTEN BAUSTEINE KOMPLETT (27.07.2026)
An einem Tag: #1 Wiederkehr (~375), #2 Objekt-Register (~295), #3 Aufwand (~250),
#4 Rezeptur (~114), #5 Chargen/HACCP (~71), #6 Fördermittel-Nachweise (~92). Alle
live in Produktion, alle mit reinen node-getesteten Formeln + Regel-Auge, alle
verzahnt. Neue KERN-Module: wiederkehr, objekte, aufwand. Nächste Phase: Testtag
(gebündelte Live-Tests) + verbleibende Branchen-Feinschliffe.

### Große List-1-Module · Baustein 7–18 (die 12 branchenspezifischen Vertiefungen)
Fortlaufend im Anschluss an die 6 geteilten Bausteine nummeriert. In früheren Notizen
liefen diese Module als »A1–A12«; Zuordnung: A1 = Baustein 7, A2 = 8, A3 = 9, A4 = 10,
A5 = 11, A6 = 12, A7 = 13, A8 = 14, A9 = 15, A10 = 16, A11 = 17, A12 = 18.

### Baustein 7 · Verleih-/Vermietungs-Modul — KOMPLETT (27.07.2026)
Erstes Modul aus der List-1-Build-Queue (Baustein 7, ~15 Branchen: KFZ-/Baumaschinen-/
Event-/Self-Storage-/Geräteverleih). Neuer Modul-Key `verleih`, NAV
„🔑 Verleih & Vermietung" (ebene 3, Gruppe betrieb, nach Objektzeiten).
- **V1–V3:** SQL `verleih_artikel` (bezeichnung/kategorie/inventar_nr/tagessatz/
  wochensatz/kaution/anzahl/status) + `verleih_vorgang` (artikel_id/kontakt_id/
  mieter_name/von/bis/tagessatz/kaution/status reserviert|ausgegeben|zurueck|
  storniert/rechnung_id), beide Tenant-RLS; `lib/verleih.ts` (18 node-getestete
  Formeln: `mietTage` inklusiv, `mietPreis` mit Wochenstaffel, `belegteAnzahl`/
  `freieAnzahl` via Überschneidungs-Check, `istUeberfaellig`, `zaehleVerleih`).
- **V4–V6:** `app/dashboard/verleih/page.tsx` (2 Reiter Ausleihen + Mietgegenstände,
  KPIs, Live-Vorschau Tage/Preis/Kaution/frei, Status-Aktionen); `augeVerleih` in
  `lib/auge.ts`; NAV in `rechte.ts`. Live + grün.
- **W1 — Rechnung aus Verleih:** Route `app/api/rechnung-aus-verleih` (§14-Rechnung
  aus Vorgang; Wochenstaffel sauber in Positionen Woche + Resttage aufgeteilt =
  deckt sich mit `mietPreis`; **Kaution ist KEIN Umsatz**, nicht auf der Rechnung;
  Doppel-Rechnung via `rechnung_id` verhindert; sicheres Muster wie
  `rechnung-aus-abo`). „€ Rechnung"-Knopf → danach „Rechnung ›"-Link in der Tabelle.
- **W2 — Vorlagen + Pakete:** `VERLEIH_VORLAGEN` (18 typische Mietgegenstände nach
  Branche, bewusst OHNE Preise) + „Aus Vorlage starten"-Dropdown; `verleih` in den
  Branchen-Paketen Handwerk/KFZ/Handel/Immobilien/Landwirtschaft (NICHT Kern).
- **OFFEN → Testtag:** Live-Tests. Nächste List-1-Module: Baustein 8 Kurse/Teilnehmer (~22),
  Baustein 9 Prüfprotokolle (~14).

### Baustein 8 · Kurse & Teilnehmer — KOMPLETT (27.07.2026)
Zweites List-1-Modul (~22 Branchen: Fahr-/Musik-/Koch-/Hundeschule, VHS, Studios,
BGM). Kein Neubau — **Vertiefung** des vorhandenen `bildung`-Moduls (`bildung_kurse`
+ `bildung_anmeldungen`, hatte schon „Rechnung aus Anmeldung").
- **K1:** SQL additiv (`bildung_kurse` +art einzeltermin|serie, +ende_am, +dozent,
  +zertifikat_aktiv; `bildung_anmeldungen` +warteliste_seit, +zertifikat_am; neue
  Tabellen `bildung_termine` + `bildung_anwesenheit` mit unique(termin_id,
  anmeldung_id), Tenant-RLS); `lib/kurse.ts` (14 node-getestete Formeln: freie
  Plätze, Wartelisten-Rang, Anwesenheitsquote, Zertifikatsreife Schwelle 80 %).
- **K2:** Seite vertieft — KPIs + `augeKurse`; **automatische Warteliste** bei
  vollem Kurs (Rang + „Nachrücken" nur bei freiem Platz); Sub-Reiter Teilnehmer/
  Termine; **Serientermine + Anwesenheit** je Termin (upsert); Zertifikatsreife.
- **K3:** `lib/zertifikat.ts` (jsPDF, A4 quer, **neutrale** Teilnahmebescheinigung
  mit Unterschrift-/Stempelfeld + Anwesenheitsquote; §20-SGB-V-Präventions-
  Zertifikat bewusst NICHT abgebildet); „🎓 Bescheinigung"-Knopf setzt zertifikat_am.
- **K4:** `bildung` in Branchen-Pakete Wellness/Tier/Verein; Import-Vorlage
  `public/vorlagen/kurse-import-vorlage.csv`.
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 9 Prüfprotokolle (~14).

### Baustein 9 · Prüfprotokolle — KOMPLETT (27.07.2026)
Drittes List-1-Modul (~14 Branchen: Elektro/E-Check, Leitern, Regale, Spielplätze,
PSA, Feuerlöscher). Neues Modul `pruefprotokolle`, NAV „📋 Prüfprotokolle".
- **P1:** SQL `pruef_protokoll` (optional `asset_id`→Register, pruef_art, norm,
  datum, pruefer, intervall, naechste_pruefung, ergebnis) + `pruef_punkt` (punkt,
  status ok|mangel|na, hinweis), Tenant-RLS; `lib/pruefungen.ts` (**Norm-Katalog
  8 Normen** + 10 node-getestete Formeln). **Fristen per WebSearch verifiziert:**
  DGUV V3 24/12/3 & ortsfest 48; Feuerlöscher 24; Leiter 12; Regal 12; Spielplatz
  12/3; PSAgA 12.
- **P2:** Seite `/dashboard/pruefprotokolle` (Norm wählen → Prüfpunkte-Vorlage,
  Status je Punkt, Live-Ergebnis + Fälligkeit, „Sonstige"-frei, Objekt-Kopplung,
  KPIs, `augePruef`).
- **P3:** `lib/pruefPdf.ts` (jsPDF, A4 hoch, Prüfpunkt-Tabelle + Unterschrift);
  „📄 PDF". **Andockung an Objekt-Register:** Ergebnis → `assets.zustand`
  (gut/beobachten/kritisch) + letzte/nächste Kontrolle.
- **P4:** `pruefprotokolle` in Pakete Handwerk/Fertigung/Handel/Energie/Immobilien/
  Logistik; Import-Vorlage `public/vorlagen/pruefprotokolle-import-vorlage.csv`.
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 10 Belegung generisch (~13).

### Baustein 10 · Belegung generisch — KOMPLETT (27.07.2026)
Viertes List-1-Modul (~13 Branchen: Ferienwohnung, Camping/Stellplatz, Halle/Bahn/
Platz, Serviced Apartments). Neuer Modul-Key `belegung`, NAV „🗓 Belegung".
- **B1:** SQL `belegung_einheit` (abrechnungsart nacht|tag|stunde, preis_pro_einheit,
  grundgebuehr, kaution, mwst_satz default 7, max_belegung) + `belegung_vorgang`
  (einheit_id, von/bis timestamptz, Snapshots, status reserviert|bestaetigt|
  eingecheckt|ausgecheckt|storniert, rechnung_id). **Doppelbelegungs-Schutz per
  `btree_gist EXCLUDE`** (einheit_id =, tstzrange(von,bis,'[)') &&) WHERE
  status<>'storniert' + check(bis>von). `lib/belegung.ts` (24/24 node-getestet).
  **Intervall halb-offen [von,bis) exklusiv** → Abreise=Anreise kollidiert NICHT;
  `tag` zählt als Differenz (nicht +1).
- **MwSt verifiziert:** Beherbergung 7 % (§12 Abs.2 Nr.11 UStG), Halle/Platz/Bahn +
  Nebenleistung 19 % — je Einheit wählbar.
- **B2:** Seite `/dashboard/belegung` (Reiter Belegungen + Einheiten, KPIs,
  Live-Vorschau + Verfügbarkeit, Input date vs datetime-local je Art, Status-Aktionen,
  DB-Exclusion-Fehler 23P01 abgefangen).
- **B3:** Route `app/api/rechnung-aus-belegung` (§14; MwSt aus Vorgang; Grundgebühr als
  Position; **Kaution kein Umsatz**; Doppel-Rechnungs-Schutz); „€ Rechnung"-Knopf +
  „Rechnung ›"-Link.
- **B4:** `augeBelegung`; NAV; `belegung` in Pakete Gastro/Immobilien/Verein/
  Landwirtschaft; Import-Vorlage `public/vorlagen/belegung-import-vorlage.csv`.
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 11 Schlagkartei / Dünge- & PSM-Doku (~15).

### Baustein 11 · Schlagkartei / Dünge- & PSM-Doku — KOMPLETT (27.07.2026)
Fünftes List-1-Modul (~15 Branchen: Landwirt Acker, Lohnunternehmer, Winzer,
Obst/Gemüse, Gärtnerei, Baumschule …). Neubau, Modul-Key `schlagkartei`,
NAV „🌾 Schlagkartei".
- **B1:** SQL 4 Tabellen — `schlag` + `schlag_bedarf` (Düngebedarfsermittlung) +
  `schlag_duengung` (DüV §10) + `schlag_psm` (PSM). `lib/schlagkartei.ts`
  (13/13 node-getestet: Fristen-Ampel 14/30 Tage, N-Saldo, Flächen/Mengen, KPIs).
- **Rechtslage verifiziert (07/2026):** PSM-Doku neue Pflichtfelder ab **01.01.2026**
  (Zulassungsnr., EPPO-Code, BBCH/Startzeit nur bei Auflage, Anwender), Frist 30 Tage,
  Digital-Pflicht erst 2027, Aufbewahrung 3 J. **DüV §10:** Düngung binnen 14 Tagen,
  Düngebedarfsermittlung VOR Düngung, 7 J. **StoffBilV am 07.07.2025 aufgehoben** →
  bewusst nicht gebaut.
- **B2:** Seite `/dashboard/schlagkartei` (4 Reiter Schläge/Düngung/PSM/Düngebedarf,
  N-Saldo-Vorschau Bedarf↔gedüngt, Doku-Ampel fristgerecht/verspätet je Zeile,
  PSM Mittel+Zulassungsnr. Pflicht); `augeSchlagkartei`.
- **B3:** `lib/schlagNachweisPdf.ts` (jsPDF A4: Schlag-Kopf + Düngebedarf + Düngung +
  PSM lückenlos); „📄 {Jahr}"-Knopf je Schlag = Jahresnachweis für Kontrolle.
- **B4:** NAV; `schlagkartei` in Paket Landwirtschaft; Import-Vorlage
  `public/vorlagen/schlaege-import-vorlage.csv`.
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 12 Tierbestand / HIT-Meldung (~12).

### Baustein 12 · Tierbestand / HIT-Meldung — KOMPLETT (27.07.2026)
Sechstes List-1-Modul (~12 Branchen: Rinder-/Schweine-/Schaf-/Ziegenhalter,
Milchvieh, Reitbetrieb, Geflügel). Neubau, Modul-Key `tierbestand`, NAV „🐄 Tierbestand".
- **B1:** SQL 3 Tabellen — `tier_gruppe` (tierart, VVVO-Betriebsnummer, meldefrist_tage
  default 7, aktueller_bestand) + `tier_bewegung` (art geburt|zugang|einfuhr|abgang|
  tod|schlachtung|ausfuhr, gemeldet/gemeldet_am) + `tier_stichtag`. `lib/tierbestand.ts`
  (10/10 node-getestet: meldeStatus offen|ueberfaellig|gemeldet|spaet, Bestandssaldo, KPIs).
- **HIT-Fristen verifiziert (07/2026):** Rind Geburt/Zugang/Abgang/Tod je **binnen 7 Tagen**
  an HI-Tier; Schaf/Ziege zusätzlich jährliche Stichtagsmeldung zum 01.01.
- **B2:** Seite `/dashboard/tierbestand` (3 Reiter Bestände/Bewegungen/Stichtag,
  Melde-Ampel + „✓ gemeldet"-Knopf); `augeTierbestand`.
- **B3:** `lib/hitMeldelistePdf.ts` (jsPDF: nicht gemeldete Bewegungen, überfällige zuerst,
  Frist-Rest als Checkliste); „📄 HIT-Meldeliste"-Knopf.
- **B4:** NAV; `tierbestand` in Pakete Landwirtschaft + Tier; Import-Vorlage
  `public/vorlagen/tiergruppen-import-vorlage.csv`.
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 13 Kanzlei — Akten & Fristen (~13).

### Baustein 13 · Kanzlei — Akten & Fristen — KOMPLETT (27.07.2026)
Siebtes List-1-Modul (~13 Branchen: Rechtsanwalt, Steuerberater, Notar, WP, Inkasso).
Neubau. **Wichtig:** Modul-Key `fristen`, Pfad `/dashboard/fristen`, NAV „⚖️ Akten &
Fristen" — bewusst NEBEN dem schon existierenden `kanzlei`-Modul (⚖️ Kanzlei & Steuer).
- **B1:** SQL `kanzlei_akte` + `kanzlei_frist` (art notfrist|verjaehrung|wiedervorlage|
  termin|sonstige, `vorfrist_tage` default 7, erledigt/erledigt_am). `lib/fristen.ts`
  (11/11 node-getestet: fristStatus erledigt|ueberfaellig|heute|vorfrist|offen,
  `verjaehrungEnde` §195/§199 = 31.12. Jahr Entstehung + 3, KPIs).
- **Rechtslage verifiziert (07/2026):** §195 BGB Regelverjährung 3 Jahre ab Schluss des
  Entstehungsjahres (§199); BGH hohe Anforderungen an Vorfrist + Notfristenkontrolle.
- **B2:** Seite `/dashboard/fristen` (Reiter Fristen/Akten, Vorfrist-Ampel + „✓ erledigt",
  Verjährungs-Rechner mit „als Frist übernehmen"); `augeKanzlei`.
- **B3:** `lib/fristenlistePdf.ts` (jsPDF: offene Fristen, überfällige/Vorfrist zuerst).
- **B4:** NAV (Modul `fristen`); `fristen` in Kanzlei-Paket; Import-Vorlage
  `public/vorlagen/akten-import-vorlage.csv`.
- **Lehre:** vor jedem neuen Modul prüfen, ob Pfad/Modul-Key schon existiert (rechte.ts +
  pakete.ts grep) — hatte versehentlich /dashboard/kanzlei überschrieben, per
  `git checkout` wiederhergestellt (war nicht committet).
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 14 Zuschnitt / Stückliste (~10).

### Baustein 14 · Zuschnitt / Stückliste — KOMPLETT (27.07.2026)
Achtes List-1-Modul (~10 Branchen: Tischler, Metallbau, Glaser, Trockenbau, Zimmerei,
Stahlbau). Neubau, Modul-Key `zuschnitt`, NAV „📐 Zuschnitt".
- **B1:** SQL `zuschnitt_projekt` (stangenlaenge, saegeblatt_mm/Kerf, querschnitt_mm2,
  dichte) + `zuschnitt_teil` (laenge, anzahl). `lib/zuschnitt.ts` (15/15 node-getestet:
  `optimiereZuschnitt` = 1D-FFD-Bin-Packing mit Kerf → Stangenbedarf, Verschnitt %,
  Schnittplan; Materialgewicht `flaecheRund/Flach/Rohr` + `gewicht`; `DICHTE` Stahl 7,85
  usw. — verifiziert). **B1+B2 in EINEM Push** (Lehre aus der lib-Falle bei Baustein 13).
- **B2:** Seite `/dashboard/zuschnitt` (Projekte + Teile, Live-Ergebnis Stangen/
  Verschnitt/Gewicht + Schnittplan je Stange); `augeZuschnitt`.
- **B3:** `lib/zuschnittplanPdf.ts` (jsPDF: Schnittplan je Stange für die Werkstatt).
- **B4:** NAV; `zuschnitt` in Pakete Handwerk + Fertigung; Import-Vorlage
  `public/vorlagen/zuschnitt-teile-import-vorlage.csv`.
- **Lib-Falle-Lehre:** neue lib nicht mehr allein in B1 vorschicken (wird ungenutzt grün
  gepusht und fällt erst beim ersten Import auf) — mit dem ersten Nutzer bündeln.
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 15 Spenden / Zuwendungsnachweis (~20).

### Baustein 15 · Spenden / Zuwendungsnachweis — KOMPLETT (27.07.2026)
Neuntes List-1-Modul (~20 Branchen: Vereine, Stiftungen, gemeinnützige Organisationen,
Fördervereine). Neubau, Modul-Key `spenden`, NAV „❤️ Spenden" (Gruppe finanzen).
- **B1:** SQL `spende` (art geldzuwendung|sachzuwendung|aufwandsverzicht, bestaetigt,
  bestaetigung_nr) + `spende_einstellung` (Vereinsdaten, ein Satz je Owner via unique
  owner_user_id). `lib/spenden.ts` (18/18 node-getestet: `KLEINBETRAG_GRENZE`=300,
  `euroInWorten` = deutsche Zahl-in-Worten, `zaehleSpenden`).
- **Verifiziert (07/2026):** bis **300 €** vereinfachter Nachweis, darüber Zuwendungs-
  bestätigung nach amtlichem Muster §50 EStDV / §10b EStG.
- **B2:** Seite `/dashboard/spenden` (Zuwendungen + Vereinsdaten, Live-Vorschau
  „Betrag in Worten" + Nachweis-Ampel); `augeSpenden`. **B1+B2 gebündelt gepusht.**
- **B3:** `lib/zuwendungPdf.ts` (jsPDF, amtliches Muster: Betrag Ziffern+Buchstaben,
  Freistellungsdaten, Haftungshinweis §10b Abs.4); „📄 Bestätigung" markiert bestätigt
  + fortlaufende Beleg-Nr. ZB-JAHR-NNN.
- **B4:** NAV; `spenden` in Verein-Paket; Import-Vorlage
  `public/vorlagen/spenden-import-vorlage.csv`.
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 16 Tour / Dispo-ePOD (~18).

### Baustein 16 · Tour / Dispo-ePOD — KOMPLETT (27.07.2026)
Zehntes List-1-Modul (~18 Branchen: Logistik/Spedition, Kurier, Lieferdienste,
Möbelspedition, Getränkelieferung, Entsorgung). Neubau, Modul-Key `tour`,
NAV „🚚 Tour & ePOD" (nicht = /dashboard/dispo Field-Service).
- **B1:** SQL `tour` + `tour_stopp` (status offen|zugestellt|nicht_angetroffen|
  verweigert, zugestellt_am, empfaenger_name, `unterschrift_data`=base64).
  `lib/tour.ts` (6/6 node-getestet: zaehleStopps, fortschrittProzent, zustellquote).
- **Verifiziert (07/2026):** POD = Empfänger + Unterschrift + Zeitstempel (§408/§409
  HGB); digitaler Frachtbrief eCMR/eFTI ab August 2026.
- **B2:** Seite `/dashboard/tour` (Touren/Stopps, Fortschrittsbalken, **Canvas-
  Signatur-Pad** Maus+Touch → PNG-Data-URL); `augeTour`. **B1+B2 gebündelt.**
- **B3:** `lib/ablieferPdf.ts` (jsPDF, eingebettete Unterschrift via addImage);
  „📄 Nachweis"-Knopf je Stopp.
- **B4:** NAV; `tour` in Pakete Logistik + Handel; Import-Vorlage
  `public/vorlagen/tour-stopps-import-vorlage.csv`.
- **Zwischenfall:** Device-Bridge riss kurz ab (device_commit_files verschwand) →
  get_device_info-Reconnect + Tool via ToolSearch neu geladen, dann committet.
- **OFFEN → Testtag:** Live-Tests. Nächstes: Baustein 17 Gutachten / Sachverständige (~7).

### Baustein 17 · Gutachten / Sachverständige — KOMPLETT (27.07.2026)
Elftes List-1-Modul (~7 Branchen: KFZ-/Bau-/Immobilien-/Schadensgutachter). Neubau,
Modul-Key `gutachten`, NAV „📑 Gutachten".
- **B1:** SQL `gutachten` (honorargruppe, stunden, status entwurf|fertig) +
  `gutachten_position` (kategorie befund|bewertung|mangel|empfehlung, betrag).
  `lib/gutachten.ts` (10/10 node-getestet: `JVEG_HONORAR` Gruppen 1–13 + M1/M2/M3,
  honorar, summePositionen). **Verifiziert (KostBRÄG ab 01.06.2025):** JVEG §9
  Honorargruppen 71–136 €/h.
- **B2:** Seite `/dashboard/gutachten` (JVEG-Honorar live, Positionen gegliedert
  Befund/Bewertung/Mangel/Empfehlung, fertigstellen-Toggle); `augeGutachten`.
- **B3:** `lib/gutachtenPdf.ts` (jsPDF: gegliederte Positionen, Summe, JVEG-Honorar).
- **B4:** NAV; `gutachten` in Pakete KFZ + Immobilien; Import-Vorlage
  `public/vorlagen/gutachten-import-vorlage.csv`.
- **OFFEN → Testtag:** Live-Tests. Nächstes + LETZTES der 12 großen: Baustein 18 Hilfsmittel-
  Versorgung (~5). Danach: List-1 Teil B/C + Querschnitt (siehe §9/§6).

### Baustein 18 · Hilfsmittel-Versorgung — KOMPLETT (27.07.2026) — 🏁 ALLE 12 GROSSEN LIST-1-MODULE (BAUSTEIN 7–18) DURCH
Zwölftes + letztes der großen List-1-Module (~5 Branchen: Sanitätshaus, Ortho-
pädietechnik, Hörgeräteakustiker, Orthopädieschuhtechnik, Reha-Technik). Modul-Key
`hilfsmittel`, NAV „🦽 Hilfsmittel".
- **B1:** SQL `hilfsmittel_versorgung` (status verordnet|kv_gesendet|genehmigt|abgelehnt|
  versorgt|abgerechnet, kv_nummer) + `hilfsmittel_position` (hmv_nummer, einzelpreis=
  Kassenanteil, mehrkosten). `lib/hilfsmittel.ts` (10/10 node-getestet: kvSumme,
  mehrkostenSumme, hmvGueltig=10 Ziffern). **Verifiziert:** HMV §139 SGB V, 10-stellige Nr.
- **B2:** Seite `/dashboard/hilfsmittel` (Status-Workflow, HMV-Prüfung, Live-Summen);
  `augeHilfsmittel`.
- **B3:** `lib/kvPdf.ts` (jsPDF Kostenvoranschlag an Krankenkasse); Knopf setzt
  kv_gesendet + fortlaufende KV-Nummer.
- **B4:** NAV; `hilfsmittel` in Wellness/Gesundheit-Paket; Import-Vorlage
  `public/vorlagen/hilfsmittel-import-vorlage.csv`.

### 🏁 ALLE 12 GROSSEN LIST-1-MODULE KOMPLETT · BAUSTEIN 7–18 (27.07.2026)
Baustein 7 Verleih · 8 Kurse · 9 Prüfprotokolle · 10 Belegung · 11 Schlagkartei · 12 Tier-
bestand · 13 Akten&Fristen · 14 Zuschnitt · 15 Spenden · 16 Tour/ePOD · 17 Gutachten ·
18 Hilfsmittel — alle live, alle mit node-getesteten Formeln + Regel-Auge + (meist)
PDF-Nachweis + NAV + Branchen-Paket + Import-Vorlage. Modul-Zähler jetzt 92.
**Danach:** List-1 Teil B (schmale 2–5er-Gruppen) + Teil C (Singletons) + Querschnitt
(Testtag, Import-Center, Font-Vereinheitlichung, Aufräumen, Gläubiger-ID, Partner-Brocken).

---

## 5. Strategie — der Burggraben

**Drei Hebel, ungleich wertvoll:**
1. **Breite** (mehr Module) — fast durch, kopierbar → geringer Graben.
2. **Tiefe** (jedes Modul kann das Fünffache) → hoher Graben.
3. **Branchen-Schärfe** (echte Fachlogik je Gewerk) → **sehr hoher Graben —
   hier gewinnen.** Generische Tools können „Teigausbeute" oder „Zerlege-
   Ausbeute" nicht abbilden, ohne unscharf zu werden.

**Import-Center = Pflicht (Daten-Übernahme).** Ein Kunde wechselt nur, wenn sein
komplettes Alt-System mitkommt (Kunden, Artikel, Preise, offene Posten,
Historie, Lieferanten, Belege). Bereits vorhanden: Kontakte-/Lieferanten-/
Preislisten-Import. Ausbau zum zentralen **Import-Center**: Upload CSV/Excel →
Spalten zuordnen → Vorschau + Dubletten-Check → Import ins richtige Modul +
Fehlerbericht. Alte Belege/Papier via vorhandene OCR. Pro Branche eigene
Import-Vorlage. CSV/Excel selbst baubar (95 % der Fälle); direkte Alt-Software-
Schnittstellen teils über Datei-Export (machbar), wenige über Partner (klar
markieren). **Import-Vorlage bei JEDEM Branchen-Build gleich mitliefern.**

---

## 6. Baureihenfolge (aktuelle Roadmap)

1. **🪵 Holzernte-Schäfer** (Forst/Baumfällarbeiten + Brennholz) — *nächster
   echter Kunde, zuerst bauen.* Baut auf dem vorhandenen Brennholz-Fachpaket auf.
2. **🌾 Landwirt** — baut auf dem Landwirtschafts-Fachpaket auf.
3. **🏗 Handwerk-Kernberufe** (Dachdecker, SHK, Elektro, Maler, Fliesen, GaLaBau,
   Metallbau, Zimmerei …).
4. **🥖 Lebensmittel-Handwerk** (Bäcker, Metzger, Konditor, Imker, Hofladen …).
5. **🌾 Agrar, Forst & Grün** (Forstwirt, Winzer, Baumpflege, Lohnunternehmer …).

**Querschnitt:** Import-Center + Import-Vorlage je Branche.
**Vor dem ersten Branchen-Build offen:** kurzes Aufräumen (tote Auge-Komponenten,
siehe §9) — optional, kann auch später.

---

## 7. Branchen-Fachlogik — Top 50 (die Haken)

### Ausführliche Steckbriefe der zwei ersten Builds

**🪵 Holzernte-Schäfer**
- *Dienstleistung (Baumfäll-/Forstarbeiten):* Baumkataster je Kunde/Objekt
  (Art, Höhe, Zustand, GPS); Verkehrssicherung & Gutachten (Kontrolltermine,
  Fällgenehmigung); Auftragsarten Fällung/Kronenpflege/Sturmschaden(Notdienst-
  Zuschlag)/Wurzelfräsen/Häckseln; Einsatzmittel Seilwinde/Hubsteiger/
  Rückefahrzeug mit Std-Sätzen + Wegepauschale; Nachweise Kettensägen-/
  Motorsägenschein, PSA, SVLFG je Mitarbeiter.
- *Ware (Holz/Brennholz):* Umrechnung **Festmeter ↔ Ster ↔ Schüttraummeter** je
  Holzart & Scheitlänge (25/33/50 cm); Polter-/Chargenliste (Standort,
  Restfeuchte, Trocknungsstatus); Verkauf lose/geschüttet/palettiert,
  Selbstabholer-Slots, Liefertour; Preisstaffel je Holzart/Trockenheit/Menge.

**🌾 Landwirt**
- *Feld & Kultur:* Schlagkartei (Feldstück, ha, Kultur, Fruchtfolge, Aussaat/
  Ernte); Dünge-/Pflanzenschutz-Doku (gesetzlich: Mittel, Menge, Datum,
  Wartezeit); Ernte-Mengen je Schlag → Lager.
- *Technik & Betrieb:* Maschinenstunden je Schlag, Diesel/AdBlue, Wartung
  (verzahnt Anlagen/AfA); Tierhaltung optional (Bestand, HIT-Meldung, Futter,
  Leistung); Förder-/Agrarantrag (verzahnt Fördermittel); Direktvermarktung
  Hofladen (verzahnt Kasse/Lager).

### Top 50 — Branche → Fachlogik-Haken

**Handwerk & Bau (Priorität 1):**
1. Holzernte/Forst ★ — Fm↔Ster↔SRM, Baumkataster, Verkehrssicherung, Seilwinde-Std, Kettensägeschein.
2. Brennholzhandel ★ — Restfeuchte-Klassen, Trocknungsstatus/Polter, Selbstabholer-Slots, Preisstaffel.
3. Zimmerei/Holzbau — Abbund-/Holzliste, Dachflächen-Aufmaß, Stücklisten, Statik.
4. Dachdecker — Dachflächen nach Neigung, Material/m², Gerüst-Position, Wetterfenster.
5. Elektriker — Zählernummern, E-Check/VDE-Protokoll, Wallbox/PV-Anmeldung, Stromlaufplan.
6. SHK/Heizung — Heizlast & hydraul. Abgleich, Therme-Wartungsvertrag, Notdienst-Zuschlag, BEG-Förderung.
7. Maler/Lackierer — Flächen-Aufmaß mit Abzug, Farb-/Gebinde-Rechner, Untergrund-Doku.
8. Fliesenleger — m² mit Verschnitt, Verlegemuster-Faktor, Kleber-/Fugen-Bedarf.
9. Maurer/Hochbau — Mauerwerks-Mengen, Beton-m³, Abschlagsrechnung nach Baufortschritt.
10. Trockenbau — Platten-/Ständer-Bedarf, m²-Aufmaß, Brandschutzklassen.
11. GaLaBau — Aushub-m³/Pflaster-m², Pflanzlisten, Pflege-Verträge (Turnus), Saison-Dispo.
12. Metallbau/Schlosser — Zuschnittlisten, Materialgewicht (Stahl kg/m), Verzinkung, Statik.
13. Tischler/Schreiner — Zuschnitt-/Kantenoptimierung, Beschlag-Listen, Aufmaß.
14. Stuckateur/Putz — Flächen, Putzstärke→Materialmenge, WDVS.
15. Gerüstbau — Gerüst-m², Standzeit-Miete/Tag, Auf-/Abbau.
16. Estrichleger — m²×Stärke→m³, Trocknungszeit, Randdämmstreifen.
17. Straßen-/Tiefbau — Aushub-m³, Massenermittlung, Verdichtungsprotokoll.
18. Schornsteinfeger — Kehrbezirk & KÜO-Intervalle, Feuerstätten-Kataster, Mess-Protokoll.
19. Raumausstatter/Bodenleger — Bodenflächen, Verschnitt, Muster-/Kollektionen.
20. Glaser — Scheiben-Maße/Fläche, Bruch-Notdienst, Isolierglas-Aufbau.
21. KFZ-Werkstatt — AW-Zeiten, HU/AU-Erinnerung, Räder-Einlagerung, KV-Freigabe per Link.
22. Karosserie/Autolack — Schadensgutachten, Lack-Mischformel, Herstellervorgabe.
23. Reifenservice — Einlagerungsplätze, Saison-Erinnerung, DOT-Alter.
24. Landmaschinen-Service — Saison-Wartung, Ersatzteil-Vorhaltung, Ernte-Bereitschaft.

**Lebensmittel-Handwerk (Priorität 2):**
25. Bäckerei — Bäcker-Prozent, Teigausbeute/Schüttwasser, Backverlust, LMIV-Etikett, Filial-Frühbestellung.
26. Konditorei — Rezept-Skalierung je Portion, Kühlketten, Bestelltorten mit Termin.
27. Metzgerei — Zerlege-Ausbeute, Wurst-Rezepturen, Chargen/QS/HACCP, kg↔Stück.
28. Partyservice/Catering — Portionskalkulation je Gast, Event-Dispo, Leihgeschirr-Rückgabe.
29. Brauerei/Getränke — Sude/Chargen, Stammwürze, Leergut-/Pfand-Verwaltung.
30. Imkerei — Schleuder-Chargen, Sortenhonig, Glas-/Etikett-Bestand, Kennzeichnung.
31. Hofladen/Direktvermarkter — Eigenerzeugnis↔Zukauf, Waage+Kasse, Saison-Sortiment.
32. Hofkäserei/Molkerei — Reifelager (Tage/Charge), Ausbeute Milch→Käse, Chargen-Rückverfolgung.
33. Fischhandel/Räucherei — Fangdatum/Herkunft, Kühlkette, Räucher-Chargen.
34. Eisdiele — Rezepturen, Sorten-Tagesplan, Saison, Waffel-/Becher-Bestand.
35. Foodtruck/Imbiss — Standplatz-Dispo, mobile Kasse, Tagesbedarf.

**Agrar, Forst & Grün (Priorität 3):**
36. Landwirt Acker ★ — Schlagkartei, Dünge-/PSM-Doku, Ernte-Mengen/Lager, Maschinenstunden.
37. Landwirt Tierhaltung — Tierbestand, HIT-Meldung, Futter, Milchleistung, Stall-/Weideplan.
38. Forstwirt/Waldbesitzer — Poltertabelle/Holzlisten (Fm), Rücke-/Fuhr-Nachweis, Fördermittel.
39. Agrar-Lohnunternehmer — Maschinen-Einsatz je Kunde/Schlag, ha-/Std-Abrechnung, Saison-Dispo.
40. Winzer/Weinbau — Parzellen, Lese-Menge/Öchsle, Fass-/Tank-Belegung, Abfüll-Chargen.
41. Obst-/Gemüsebau — Kultur/Reihe, Ernte-Kalender, Kühllager, Vermarktung.
42. Gärtnerei/Baumschule — Kultur-Sätze, Topf-/Stellplatz, Saison-Bestellung.
43. Baumpflege/Arborist — Baumkataster, Verkehrssicherungs-Kontrolle, Kletter-/Hubsteiger, Gutachten.
44. Garten-/Grünpflege — Pflege-Verträge (Turnus), Flächen, Saison-Touren.
45. Schäferei — Herden-/Weide-Management, Ablammung, Wanderschäferei-Route.
46. Teichwirtschaft/Fischerei — Besatz/Abfischung, Bestandsführung, Verkaufschargen.
47. Reitbetrieb/Pensionsstall — Einstell-Verträge, Boxen, Futter, Zusatzleistungen.
48. Jagd/Wildverwertung — Streckenliste, Wildbret-Chargen/Kühlung, Trichinen-Nachweis.
49. Kommunaler Bauhof — Objektpflege-Turnus, Winterdienst-Doku, Fuhrpark.
50. Entsorgung/Container — Container-Dispo, Wiege-/Entsorgungsnachweis, Tour-Planung.

★ = auf der Sofort-Bauliste.

Wiederverwendbare Rechen-Bausteine (einmal bauen, mehrfach nutzen):
Aufmaß/Mengen (Dachdecker, Fliesen, Maler, GaLaBau) · Umrechnungstabellen (Holz,
Stahlgewicht) · Chargen/Rückverfolgung (Metzger, Käserei, Wild, Imker) ·
Turnus-/Wartungsverträge (SHK, GaLaBau, Baumpflege).

---

## 8. Bau-Prinzip für Branchen (damit 50 Branchen nicht 50× Arbeit sind)

- **Gemeinsamer Kern, spezifische Haken.** Rechnung/CRM/Termine sind für alle
  gleich. Jede Branche bekommt nur ihre Fachlogik-Bausteine obendrauf — als
  Modul-Erweiterung, nicht als neues System.
- **Regel-Ebene zuerst** (Formeln statt KI, web-verifizierte Werte).
- **Import-Vorlage je Branche** von Anfang an mitliefern.
- **Branchen-Vorlagen ab Werk** (Angebots-/Checklisten-/Preis-Vorlagen), damit
  der Kunde in Minuten startklar ist.
- **Feedback-Kreis:** bauen → echter Kunde nutzt → nachschärfen. Die letzten
  10 % (regionale Sonderfälle) beim echten Kunden abholen.

---

## 9. Offene Punkte / TODO

- **Aufräumen:** tote Auge-Komponenten entfernen — `MahnwesenAuge.tsx`,
  `CrmAuge.tsx`, `LagerAuge.tsx`, `RechnungenAuge.tsx`, `VertraegeAuge.tsx`
  (durch Regel-Auge ersetzt, jetzt ungenutzt). `device_bash`/rm entfernt nicht —
  Dateien per `mv` in einen `_to_delete/`-Ordner verschieben lassen ODER Martin
  löscht manuell.
- **Import-Center** bauen (siehe §5) — hohe Priorität, Querschnitt.
- **Team-Chat-Bug** live reproduzieren + fixen (`docs/team-chat-bug.md`).
- **Große Brocken mit externem Partner** (ARGONAUT-Seite baubar, Live braucht
  Partner): Lohn/ITSG, Banking/finAPI (Kontoabgleich für Zahlungen), WhatsApp
  Business-API, KI-Telefonassistent.
- **Marketing-Tiefe** (2. großer Hebel): Redaktionsplan, Bild-KI, A/B-Betreff,
  Newsletter mit CRM-Segmenten, Wirkungs-Report.

---

## 10. So startet die neue Session

1. Diese Datei komplett lesen.
2. Martin begrüßen, Stand kurz spiegeln, fragen mit welcher Branche/welchem
   Baustein wir weitermachen (Vorschlag: Build #1 Holzernte-Schäfer, oder das
   Import-Center, oder Aufräumen).
3. Immer im Rhythmus aus §1 arbeiten: EIN Schritt → „erledigt" abwarten →
   SQL → Build-Check → gezielter Commit → Push.
4. Zahlen/Rechtsvorgaben vor dem Bauen per WebSearch verifizieren.
5. Nach jedem Build diese Datei bei Bedarf aktualisieren (Stand, offene Punkte).

*Ende des Master-Briefings.*
