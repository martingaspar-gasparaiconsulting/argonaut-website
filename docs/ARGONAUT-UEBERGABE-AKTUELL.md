# ARGONAUT OS — Übergabe-Prompt (Stand 09.08.2026, abends)

Ich bin **Martin Gaspar**, Gründer von ARGONAUT OS (KI-Betriebssystem für den deutschen Mittelstand). Wir bauen zusammen weiter. **Lies zuerst diese Übergabe komplett, bestätige den Stand in zwei Sätzen und leg los** — kein langer Vorspann.

## 1) Arbeitsweise (verbindlich)
- **Deutsch.** Perfektionist. Niveau Anfänger–Mittel: alles **vollständig & copy-paste-fertig**.
- **NIEMALS PowerShell — immer CMD.** Kein localhost.
- **Ein Schritt = ein Push:** Du schreibst die Dateien selbst via Device-Bridge ins Repo, prüfst mit **esbuild**, dann bekomme ich **SQL-Block (im Chat)** + **EINEN CMD-Block**. „Am laufenden Band" bauen — nicht pro Modul auf „erledigt" warten; ich schicke Screenshots asynchron.
- **Kontrollieren vor bauen:** jedes Modul erst am echten Code anschauen.
- **SQL additiv & idempotent** (`if not exists`). „Success. No rows returned" = passt.
- **Staleness-Regel:** Arbeitskopie im Container ist oft veraltet — jede Datei **zuerst frisch vom Gerät stagen**.
- **Klammer-Pfade** (`app/branchen/[slug]/…`, `app/…/[id]/…`) lassen sich stagen UND committen; im CMD braucht `git add` aber die **:(literal)-Magic**, sonst versteht git die eckigen Klammern als Muster: `git add ":(literal)app/branchen/[slug]/BranchenPageClient.tsx"`.

## 2) Repo & Technik
- Repo: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` (Zugriff via Device-Bridge; `.git` liegt in `gaspar-ai-system`).
- CMD-Grundmuster: `cd /d "…argonaut-website" && chcp 65001 >nul && npx tsc --noEmit && npx next build && git add <dateien> && git commit -m "…" && git push`
- **esbuild-Check vor jedem Push** (`npx esbuild <datei> --outfile=/dev/null --loader:.tsx=tsx`). tsc + next build laufen bei mir im CMD.
- Next.js 16 App Router, React 19, TypeScript, Vercel (Production, argonaut-os.com). Supabase (Postgres + RLS, Helfer `mein_chef_id()`), Resend, Gotenberg (VPS) für PDF.
- Marke: Navy `#0A1628`, Navy2 `#0F2036`, Gold `#C9A84C`, Cyan `#00e5ff`, Grün `#4CAF7D`; Fonts DM Sans + Syne; Logo `components/Dreizack.tsx`. Navigation/Rechte aus `lib/rechte.ts`.

## 3) Nordstern gerade (Abschnitt 2 „Termine zuerst")
- **Alles geht erst mal nur über „📅 Termin vereinbaren"** (Erstgespräch mit mir, Kalender-Strecke `/demo` existiert schon, hängt an meiner Mail). Kaufen/Bestellen bleibt AUS — ich will erst Feedback von Interessenten sammeln. Bestell-/Kaufstrecke zurückgestellt bis nach den ersten ~100 Kunden.
- **Control-Room-Umschalter** steuert das live: Command Center → „Öffentliche Knöpfe: Termin ↔ Bestellen" (DB-Flag `betreiber_flags.cta_modus`, Standard `termin`). Umlegen wirkt sofort, ohne Push.

## 4) Stand — was fertig ist
**Abschnitt 1 · Multistandort (Block D) KOMPLETT** — alle 6 Punkte grün in Production:
1. Personal-Entsendung (`4e9975e`) · 2. Vorlagen-Sammelbecken (`ab97369`+`e2712a3`) · 3. proxy.ts Pfad-Riegel je Standort/Nutzertyp (`5fbe122`) · 4. Lager je Filiale — Bestand+Umlagern+Zu-/Abgang (`a5102b6`+`33afd76`) · 5. Filialvergleich echte Umsatz-KPIs (`8dcb1f0`) · 6. Chef-Schalttisch „Wer sieht was" (`7541fc5`).

**Abschnitt 2 · Termine zuerst — begonnen:**
- ✅ Schritt 1: Control-Room-Umschalter + Modus-Schalter (`19545ca`)
- ✅ Schritt 2: Branchen-Seiten Haupt-Knopf „Termin vereinbaren" → `/demo`, Umschalter-gesteuert (`b7d7c4b`)
- ⬜ Schritt 3: Dossier-Look auf die Branchen-Seiten übertragen
- ⬜ Schritt 4: E-Book je Branche + Auto-Versand beim Termin

## 5) WO WIR MORGEN STARTEN
**Zuerst strategisch besprechen (NICHT gleich bauen):**
- **Bereichs-Verteilung der 698 Branchen überdenken.** Referenz-Look = `argonaut-os.com/vorschau/branchen` (aufklappbare Bereiche, gefällt mir). Problem: „Handwerk & Bau I" (26) + „Handwerk & Bau II" (26) sind sinnvoll gesplittet, aber „Handel & E-Commerce" hat **70** in EINEM Bereich. Idee: „Handel & E-Commerce" trennen in „nur Handel" und „nur E-Commerce"; die 20 Bereiche insgesamt strategisch neu balancieren. Erst gemeinsam durchdenken.

**Dann bauen:**
- **Schritt 3 — Dossier-Look:** den aufklappbaren Stil von `/vorschau/branchen` auf die echten Branchen-Seiten (`app/branchen/[slug]/BranchenPageClient.tsx`) übertragen. Inhalt bleibt, nur optisch aufgeräumt/aufklappbar. Preisrechner (`components/ROIRechner.tsx`) + „📅 Termin vereinbaren"-Knopf am Ende behalten.
- **Schritt 4 — E-Book je Branche:** wer einen Termin bucht, bekommt vorab das branchenspezifische E-Book/Dossier („für alle frei + branchenspezifische Extras" = Alleinstellung). Viel gemeinsam, nur branchenspezifisches variiert — nicht 698× neu erfinden. Auch Onboarding vor dem Termin.

**Später (nach „Termine zuerst"):** eigener **KI-Avatar**, der von Modul zu Modul springt und die Texte spricht — einmal aufnehmen, für immer gleich. Dafür liefere ich die Texte.

## 6) Externe Partner — kurz nennen, dann ÜBERSPRINGEN
Alles, was ein Konto/Zugang braucht, den wir noch **nicht** haben, nur kurz benennen und überspringen (nicht bauen bis Zugang da): DATEV-EXTF, finAPI, ELSTER/ERiC, Amazon/eBay/Kaufland/Otto, Meta/Google/LinkedIn (Social+Ads), WhatsApp/360dialog, TSE/fiskaly, shipcloud, ImmoScout, Telefonie/SMS, Lohn-ITSG, Stripe/Mollie. Bevorzugt die **code-only-Teile** bauen.

## 7) Gedächtnis
Verlauf/Fahrplan in deinem Gedächtnis: `/areas/argonaut-dossier-termin.md` (Abschnitt 2 · Termine zuerst — aktuell), `/areas/argonaut-blockd-rest.md` (Multistandort-Rest), `/areas/argonaut-roadmap.md` (große Liste), `docs\ARGONAUT-ABHAKLISTE.md` (20 Abschnitte).

---

# 📋 ABHAKLISTE — wo wir stehen

Fortschritt: **▓░░░░░░░░░  Abschnitt 1 von 20 komplett** (Abschnitt 2 läuft: 2 von 4 Schritten ✅)

- ✅ **1. Multistandort fertig machen** — KOMPLETT (alle 6 Unterpunkte grün)
- 🔧 **2. Termine zuerst — Dossiers auf „Termin vereinbaren"** — LÄUFT
  - ✅ Control-Room-Umschalter (Termin ↔ Bestellen, live)
  - ✅ Branchen-Seiten Haupt-Knopf „Termin vereinbaren" → /demo
  - ⬜ Dossier-Look (aufklappbar, Referenz /vorschau/branchen) auf Branchen-Seiten
  - ⬜ E-Book je Branche + Auto-Versand beim Termin
  - ⬜ (Strategie zuerst) Bereichs-Verteilung neu balancieren (Handel vs. E-Commerce trennen)
- ⬜ **3. KI-Kosten senken (Frist 01.09.)** — Prompt Caching · Batch-API
- ⬜ **4. Buchhaltung & Geldfluss** — Beleg-Inbox KI-OCR · DATEV-EXTF · ELSTER · finAPI · Cashflow · SEPA überall · GiroCode · Stripe/Mollie
- ⬜ **5. Modul-Tiefe** — Fokus-/Detail-Umschalter · Report-Baukasten · Analysen · Deckungsbeitrag · Branchen-Vertiefung · Eigene Felder Rest
- ⬜ **6. Verzahnung & Quick Wins** — Kunde-360° · „Heute"-Zentrale · Globale Suche · Fachpaket→Rechnung · White-Label · Backup-ZIP · Verbrauch je Kunde
- ⬜ **7. Automations-Bauer & handelnde KI** — Automations-Bauer · KI-Telefon · Avatar & Stimme · WhatsApp/SMS
- ⬜ **8. Eigene Academy** — eigene Kurse/Videos · Untertitel+Transkript · Medaillen
- ⬜ **9. Beleg-Foto pro Einsatz** — Foto→OCR→Ausgaben · Kennzeichnung→richtige Route
- ⬜ **10. Externe Motoren (Konto/Partner nötig)** — Marktplätze · shipcloud · Mail/Kalender · Social & Ads · Lohn/Geräte
- ⬜ **11. Import-Center** — zentrales Import-Center · Import-Vorlage je Branche
- ⬜ **12. Recht, Compliance & Trust** — Anwalts-Freigabe · AVV · DSGVO-Center · ISO 27001
- ⬜ **13. Content & Wachstum** — 698 E-Books+Demo · 698 KI-Dialoge · Provisions-/Empfehlungssystem
- ⬜ **14. Marketing-Tiefe** — Kanäle+Video · Cockpit-Auswertung · Content-Maschine
- ⬜ **15. Geräte & Außendienst** — PWA + Offline
- ⬜ **16. Infrastruktur & Skalierung** — Cloudflare R2+VPS · E-Mail Multi-Tenant/Resend Pro
- ⬜ **17. Technische Schulden & Design** — Aufräumen/zusammenführen · Analytics härten · Design-Rollout
- ⬜ **18. Testtag** — Live-/Zwei-Personen-Tests · Voraussetzungen setzen
- ⬜ **19. Deine externen To-dos (kein Code)** — SEPA scharf · zentrale Keys · Provider-Konten
- ⬜ **20. Zukunft (geparkt)** — Talent-Marktplatz · ARGONAUT Universum

**Fang so an:** Bestätige in zwei Sätzen den Stand, dann besprechen wir kurz die Bereichs-Verteilung (Handel/E-Commerce) — danach Schritt 3 (Dossier-Look).
