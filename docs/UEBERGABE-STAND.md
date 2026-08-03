# ARGONAUT OS · Übergabe & Stand (01.08.2026)

Legende: 🟢 erledigt · ☐ offen · **[DU]** = Martin allein · **[ICH]** = Claude · **[WIR]** = gemeinsam

---

## BLOCK A · Präsentation Donnerstag (06.08.) — PRIORITÄT
- 🟢 Präsentations-Modus komplett neu (Willkommen + 10 Stationen + Abschluss, 12 s/Seite, feste Unterzeile, kein Ruckeln) **[ICH]**
- 🟢 Karte verschiebbar per Ziehgriff „⠿ Verschieben" (Doppelklick = zurück) **[ICH]**
- 🟢 Header „ARGONAUT OS für Bäckerei Sonnenschein" · Max Mustermann **[ICH+DU]**
- ☐ Generalprobe: Dauerschleife 1 Std. auf dem 43-Zöller testen **[DU]**
- ☐ 60-Sekunden-Pitch proben **[DU]**
- ☐ Ablauf festlegen: Loop am Screen → sprechen → Live-Demo im Konto **[DU]**

## BLOCK B · Bäckerei-Demo (Max Mustermann) — FERTIG
- 🟢 Kern-Story: Marketing → Lead → Kunde → Pipeline → Angebot → Rechnung → Banking → EÜR (Catering 1.800 €) **[ICH+DU]**
- 🟢 Alle 12 Module gefüllt: Rezeptur, Kasse, Lager, Einkauf, Etiketten, Tour, Chargen, HACCP, Termine, Bewertungen, **Gutscheine, Reservierung** **[ICH+DU]**
- ☐ Letzter Check: Nachtrags-SQL (Gutscheine/Reservierung) ausgeführt? → 12/12 bestätigen **[DU]**
- ☐ Kosmetik: Banking-CSV-Beispiel auf die Stadtwerke-Zahlung (1.926 €) statt „Max Muster 238 €" **[ICH]** (kleiner Code-Fix + Push)

## BLOCK C · Recht & Compliance (aus dem Fahrplan) — NACH der Präsentation
Dringend vor Live-Schaltung der neuen Seite:
- ☐ „Deutscher Server" → „EU-Hosting" an 5 Stellen korrigieren **[ICH]**
- ☐ Alte weiße Startseite ablösen (bewirbt noch altes KI-Call-Kontingent) **[ICH]**
- ☐ „Nur Unternehmer (§14 BGB)"-Klausel in AGB + Bestellprozess **[ICH]**
- ☐ KI-Training-Klausel raus → schlanke „anonyme Produktverbesserung" **[ICH]**

Dokumente & Sauberkeit:
- ☐ AVV-Dokument für Kunden erstellen (+ Seite + PDF; AGB §11.3 anpassen) **[ICH]**
- ☐ Voyage-Retention abschalten (Dashboard → Opted Out) **[DU]**
- ☐ Rest-DPAs sammeln: Supabase, Vercel, Anthropic, Google Workspace, Hostinger **[DU]**
- ☐ Stripe & Lexoffice aus AGB/Datenschutz entfernen; neuen Zahlungs-/Buchhaltungsweg eintragen **[ICH+DU]**
- ☐ Hostinger als Anbieter ergänzen; n8n prüfen (noch aktiv?) **[ICH+DU]**
- ☐ Impressum „§5 TMG" → „§5 DDG" **[ICH]**
- ☐ „100 % DSGVO-konform" entschärfen **[ICH]**
- ☐ Branchenzahl vereinheitlichen (205 vs. 690 → eine verifizierte Zahl) **[ICH]**
- ☐ Öffentliche Subunternehmer-Liste als Unterseite **[ICH]**

## BLOCK D · ISMS & ISO — SPÄTER (mit erstem Umsatz)
- ☐ ISMS-Doku: VVT (Art. 30), TOM (Art. 32), Sicherheitsleitlinie, Risikoanalyse, SoA, Incident-Response, Lösch-/Berechtigungskonzept **[ICH]**
- ☐ Anwältliche Endfreigabe aller Dokumente (~1.800 € Fachanwalt IT-Recht) **[DU]**
- ☐ ISO-27001-Audit durch akkreditierte Stelle (~3.500–5.500 € / Jahr 1 gesamt ~8.000–25.000 €) **[DU]**

## BLOCK E · Zukunft (Backlog, nach Donnerstag)
- ☐ Content-Maschine: 9 weitere Branchen-Demos (je eigenes Konto + SQL) → Videos (698 Branchen) **[ICH baut SQL, DU legst Konten an]**
- ☐ Branchen-Kalkulator: Rezeptur-Rechner-Prinzip für Metallbau, Maler & Co. **[ICH]**
- ☐ (Optional) 9 Drehbücher jetzt schon entwerfen **[ICH]**

## BLOCK F · Offene Entscheidungen — nur DU
- ☐ Zielkunden **nur Unternehmer (B2B)?** (Empfehlung: ja)
- ☐ **Preis/Rabatt** final (Empfehlung: 24 Mon. 5 %, 36 Mon. 8 %, Vorauszahlung 3 %, Einrichtung nie rabattiert)
- ☐ **n8n** noch aktiv?
- ☐ **Zahlung & Buchhaltung** ohne Stripe/Lexoffice — womit jetzt?

---

## Wichtige Fixpunkte fürs Repo
- Repo: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
- Demo-Konto: `gaspar.71032@web.de` (Firma „Bäckerei Sonnenschein", Nutzer „Max Mustermann")
- Wichtige Dateien: `docs/ARGONAUT-Rechts-und-ISO-Fahrplan.html` · `supabase-sql/baeckerei-demo.sql` · `supabase-sql/baeckerei-module.sql` · `app/dashboard/_components/PraesentationsModus.tsx` · `IDEEN-UND-BACKLOG.md`
- SQL-Kniff: Am Anfang `set_config('request.jwt.claims', …, true)` setzen, sonst setzt der owner-Trigger im SQL-Editor `null` und alles rollt zurück.
- Vorgehen: Immer CMD (nie PowerShell), alles copy-paste-fertig, Schritt für Schritt, auf „erledigt" warten.
