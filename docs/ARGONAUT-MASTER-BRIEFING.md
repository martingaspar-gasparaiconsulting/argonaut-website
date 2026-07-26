# ARGONAUT OS — Master-Briefing & Branchen-Roadmap

> **Für eine neue Claude-Session: Lies diese Datei ZUERST vollständig.**
> Danach bist du auf unserem Stand und kannst sofort Schritt für Schritt weiterbauen.
> Diese Datei ist die einzige Quelle der Wahrheit für Arbeitsweise, Architektur und Plan.
> Letzte Aktualisierung: Session vom 26.07.2026.

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
