# ARGONAUT OS — Übergabe / Drehbuch: MULTISTANDORT (Block D) · Stand 08.08.2026

Hallo Claude. Ich bin **Martin Gaspar**, Gründer von ARGONAUT OS (KI-Betriebssystem für den deutschen Mittelstand). **Dieser Strang baut die Multistandort-Tiefe (Block D) fertig** — Modul für Modul, ein Schritt = ein Push. Erst einlesen, Stand bestätigen, dann auf mein „los" warten.

---

## 1) Arbeitsstil (strikt)
- **Deutsch.** Perfektionist, Niveau Anfänger–Mittel: alles vollständig & copy-paste-fertig.
- **NIEMALS PowerShell — immer CMD.** Kein localhost.
- **Ein Schritt = ein Push.** Ablauf: Datei(en) schreiben → **esbuild-Check** → via `device_commit_files` ins Repo → Martin bekommt **SQL-Block (Supabase)** + **einen CMD-Block** (git add/commit/push). Martin schickt Screenshot, wenn grün.
- **„Kontrollieren vor bauen":** das jeweilige Modul erst anschauen (Insert-Stellen + Listen-Abfrage), dann bauen.
- SQL additiv & idempotent (`add column if not exists`). „Success. No rows returned" = passt.

## 2) Repo & Umgebung
- Repo: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
- `.git` liegt im Ordner `gaspar-ai-system` (deshalb `git add -A` aus dem Website-Ordner = ganzes Repo).
- CMD-Block (immer gleich):
  `cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && git add -A && git commit -m "..." && git push`
- Next.js (App Router), Supabase, Vercel (Production). Zugriff über Device-Bridge `mcp__remote-devices__*`.

## 3) Das Standard-Muster (WICHTIG — so bauen wir jedes Modul)
Zwei Mechanismen, beide **fail-open** (ohne Zuordnung bleibt alles überall sichtbar — nichts verschwindet):

**A · STEMPEL** — Datensatz gehört EINEM Standort (Aufträge, Rechnungen …):
1. SQL: `alter table public.<tabelle> add column if not exists standort_id uuid references public.standorte(id) on delete set null;` + Index.
2. Beim Anlegen stempeln: `standort_id: konkreterStandort(leseStandortCookie())` in JEDE Insert-Stelle.
3. Liste fail-open filtern: `let q = supabase.from(...).select(...); if (sid) q = q.or(standortOrFilter(sid)); await q.order(...)` — **`.or()` IMMER vor `.order()`** (sonst Typfehler).

**B · ZUORDNUNG** — Datensatz gilt für MEHRERE Filialen, Chef hakt an (Dokumente, Sortiment …):
1. SQL: Join-Tabelle `<x>_standorte (id, owner_user_id, <x>_id, standort_id, unique(<x>_id,standort_id))` mit RLS wie `document_standorte` (Chef sieht eigene + Mitarbeiter via `mein_chef_id()`).
2. UI: den Baustein `app/dashboard/_components/FilialZuordnung.tsx` einsetzen (Knopf „🏢 Filialen"), Props: `tabelle`, `fkSpalte`, `recordId`, `ownerUserId`, `standorte`, `initial`, `onChange`.
3. Liste fail-open: Datensatz sichtbar, wenn keine Zuordnung ODER Zuordnung enthält aktiven Standort.

**Wiederverwendbare Teile (fertig, nicht neu bauen):**
- `lib/aktiverStandort.ts` — Cookie `argonaut_standort`, `leseStandortCookie()`, `ALLE_STANDORTE`.
- `lib/standortDaten.ts` — `konkreterStandort(wert)` (UUID-geprüft) + `standortOrFilter(id)`.
- `app/dashboard/_components/FilialZuordnung.tsx` — der „🏢 Filialen"-Knopf (erscheint ab 2 Standorten).

## 4) Was heute lief (08.08.2026) — alle grün ✅
- **D-Pilot: Leads** (Stempel) — `07a8552`.
- **D2: Dokumente↔Filialen** (Zuordnung, neuer Baustein `FilialZuordnung`, `document_standorte`) — `f63548d`.
- **D3: Sortiment/Artikel↔Filialen** (Zuordnung, `artikel_standorte`, im Produkte-Modul) — `8a5f101`.
- **D4: Aufträge** (Stempel, `auftraege.standort_id`) — `b082094`.
- **Modell-Kontrolle:** alle KI-Aufrufe laufen über `kiFetch` (Kosten in `ki_nutzung` geloggt). 22 Routen Haiku (Massen-/Chat-/Text-Kram), 9 gezielt Sonnet (teuer-wenn-falsch: Auftragspositionen, Bestellvorschlag, HR, Strategie, Projekt-Setup, Korrespondenz, Marketing-Content, Statusbericht, Visitenkarte-Vision). **Bewusst so lassen.**
- **Anwalt-Checkliste** Abschnitt 6 aktualisiert (Fail-open-Default-Frage bei Personalunterlagen).
- **Rundumblick-PDF** erstellt (Master-Checkliste, 4 Teile + Fazit).

## 5) Push-Plan Multistandort (verbleibend)
**Stempel — Kern (Pflicht für Großkunden):**
- [ ] Rechnungen  ← **HIER geht's weiter**
- [ ] Angebote
- [ ] Termine
- [ ] Kasse

**Stempel — operative Welle 2 (nach Branche):**
- [ ] Mahnwesen · Eingangsbelege/Einkauf · Bestellungen/Wareneingang
- [ ] Service · Projekte · Aufmaß · Bautagebuch
- [ ] Touren/Dispo · Meine Einsätze · Zeiterfassung · BDE
- [ ] Inventur · Chargen · Reservierung/Belegung · Fertigung

**Zuordnung (der „🏢 Filialen"-Knopf):**
- [ ] Schulungen/Academy · Leistungskatalog/Preislisten · Vorlagen · Lieferanten

**Feinschliff:**
- [ ] Personal-Zuschnitt (Mitarbeiter-Liste je Filiale; `mitarbeiter.standort_id` existiert schon)
- [ ] Chef-Schalttisch „wer kriegt was" (baut auf allem auf → zum Schluss)
- [ ] Öffentlicher Shop je Filiale (D3 intern erledigt; Endkunden-Ansicht offen)

**Anzahl:** ~15 Pushs für den Kern, ~25 Pushs für alles.

## 6) Nächster Schritt konkret: RECHNUNGEN (Stempel)
1. Modul anschauen: `app/dashboard/rechnungen/page.tsx` (+ evtl. `[id]`) — Insert-Stelle(n) beim Rechnung-Anlegen und die Listen-Abfrage finden. Achtung: Rechnungen entstehen oft aus anderen Vorgängen (`app/api/rechnung-aus-*`) — dort ggf. auch stempeln (aus dem Ursprungs-Standort ableiten, sonst `null` = fail-open).
2. SQL: `alter table public.rechnungen add column if not exists standort_id uuid references public.standorte(id) on delete set null;` + Index.
3. Stempeln + Liste fail-open (Muster oben). esbuild-Check → commit → SQL+CMD an Martin.

## 7) Business-Kontext (nicht vergessen)
- Ziel: **ab 1. September komplett durchstarten.** Bis dahin Multistandort fertig.
- Vertrieb läuft schon: **7 Tage kostenlose Nutzung** als Türöffner, um vor September erste Kunden zu gewinnen.
- Danach: Modul-für-Modul-Ausbau (siehe Rundumblick-PDF, Teil B) — beim Drankommen jedes Modul zugleich schlauer machen.

---
**Start für den neuen Chat:** Erst dieses Dokument + `lib/standortDaten.ts`, `lib/aktiverStandort.ts`, `app/dashboard/_components/FilialZuordnung.tsx` und das Aufträge-Muster (`app/dashboard/auftraege/page.tsx`) anschauen. Dann Stand bestätigen und mit **Rechnungen** loslegen — Muster aus Punkt 3/6. Auf Martins „los" warten.
