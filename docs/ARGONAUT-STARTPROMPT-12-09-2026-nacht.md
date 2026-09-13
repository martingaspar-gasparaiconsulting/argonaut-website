# ARGONAUT OS · Startprompt für den nächsten Chat

**Stand: Samstag, 12. September 2026 · Nacht** — löst den Prompt vom Nachmittag ab.

Ich bin Martin Gaspar, Gründer von ARGONAUT OS — ein KI-Betriebssystem für den deutschen Mittelstand. Wir arbeiten weiter daran.

## Wo alles liegt

* Repo auf meinem Rechner: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
* Supabase-Projekt: `znrjnndfzzydnhbyntwa`
* Live: Vercel, Branch `main`, jeder Push deployt automatisch

**Wichtig für dich als Assistent — zwei Ordner sind freigegeben:**

1. `C:\Users\Admin\Desktop\gaspar-ai-system` (Drumherum: ANWALT-RECHT, docs, core, modules, tests)
2. `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` (der Repo-Ordner)

Der zweite wurde am 12.09. abends ergänzt, weil die Datei-Brücke nur **sieben Ordnerebenen ab dem freigegebenen Ordner** schafft. Ab `gaspar-ai-system` waren Pfade wie `app/dashboard/marketing/ads/kosten/page.tsx` acht Ebenen tief und damit unerreichbar. Ab `argonaut-website` sind es fünf. **Nimm für alles im Repo immer den zweiten Ordner als Bezugspunkt.** Beide behalten — ANWALT-RECHT und docs liegen nur unter dem ersten.

Nichts wurde dafür verschoben und darf verschoben werden: In Next.js ist die Ordnerstruktur die URL-Struktur.

## Lies zuerst — in dieser Reihenfolge

1. `docs/ARGONAUT-Was-noch-zu-erledigen-ist-11-09-2026.pdf` — die eine gültige Liste, 38 abhakbare Punkte. **Stand jetzt: 2.6 und 3.2 sind erledigt, 3.1 ist zu zwei Dritteln fertig.**
2. `docs/ARGONAUT-Anwaltsvorlage-11-09-2026.pdf` — alle offenen Rechtsfragen, Blöcke A bis K.
3. `supabase-sql/_BEFUND-anrede.txt` — die Arbeitsliste für 3.1. **Achtung, siehe Warnung weiter unten: der Befund ist lückenhaft.**

Wo eine ältere Liste diesen widerspricht, gelten diese. Und wo sie dem echten Code widersprechen, gilt der Code.

---

# Punkt 3.1 · Duz-Umstellung — der aktuelle Stand

## Die Regel

* **CHEF** wird gesiezt — er ist der zahlende Kunde, auch im System.
* **Alles was das System verlässt** siezt immer: E-Mails, PDFs, Rechnungen, öffentliche Website, Seiten für Endkunden.
* **MITARBEITER** wird **anredefrei** formuliert — weder geduzt noch gesiezt.

Zur letzten Zeile: Ein Kippschalter, mit dem Mitarbeiter selbst wählen, ist zu früh. Duzen und Siezen ist im Deutschen keine Wortersetzung — Verb, Possessivpronomen und Satzstellung ändern sich mit. Ein Schalter müsste jeden Satz dauerhaft in zwei Fassungen vorhalten. Die meisten Sätze brauchen aber gar keine Anrede: „Aktuell sind keine Schichten für dich eingeplant" → „Aktuell sind keine Schichten eingeplant". Erst anredefrei machen, dann zählen was übrig bleibt — **dann** über den Schalter entscheiden.

## Was am 12.09. abends fertig wurde

**167 Textstellen in 58 Dateien, in sieben Pushes, alle auf Vercel grün.**

| Paket | Inhalt | Dateien | Stellen | Commit |
|---|---|---|---|---|
| 1 | Finanzen | 11 | 39 | `d031b1e` |
| 2 | Marketing | 13 | 44 | `6bb3b0a` |
| 3 | Aufträge & Projekte | 9 | 21 | `eaf09e1` |
| 4 | ERP & Lager | 14 | 23 | `d54f9ec` |
| 5 | CRM & Kontakte | 9 | 19 | `409a673` |
| 6 | Was rausgeht | 8 | 13 | `3eb5ac7` |
| 7a | Endkunden-Seiten | 2 | 8 | (zuletzt gepusht) |

Im Einzelnen:

* **Paket 1 Finanzen:** euer, finanzen/cashflow, finanzen/euer, finanzen/kennzahlen, finanzen, finanzen/ueberweisung, mahnwesen, mahnwesen/[id], provisionen, sepa-einzug, zahlungen
* **Paket 2 Marketing:** marketing/[id], analytics-board, autopilot, bewertung-kampagne, lagebericht, newsletter, roi-verzahnung, seo, studio, `lib/newsletter.ts`, `lib/marketingAutopilot.ts`, `lib/marketingLagebericht.ts`, `app/api/newsletter/abmelden/route.ts`
* **Paket 3 Aufträge & Projekte:** auftraege, auftraege/[id], projekte, projekte/[id], aufmass, bautagebuch, projekt-abrechnung, objektzeiten, nachkalkulation
* **Paket 4 ERP & Lager:** erp, erp/[id], erp/layout, bestellungen, fuhrpark, inventar, inventur, lager, lieferanten/import, nachbestellung, preisliste, preisliste/import, wareneingang, einkauf
* **Paket 5 CRM & Kontakte:** crm, crm/dubletten, crm/firmen, crm/firmen/[id], crm/import, crm/pipeline, crm/wochenfokus, mitglieder, pipeline
* **Paket 6 Was rausgeht:** oeffentlich/buchung, oeffentlich/lp, oeffentlich/optin, oeffentlich/optin-bestaetigen, oeffentlich/web-newsletter, online-buchung, `lib/mailKalender.ts`, `app/vorschau/page.tsx`
* **Paket 7a Endkunden-Seiten:** `app/bewerten/[token]`, `app/whatsapp-anmelden/[slug]`

## Was noch offen ist

```
✅ Paket 1  Finanzen             11 Dateien, 39 Stellen
✅ Paket 2  Marketing            13 Dateien, 44 Stellen
✅ Paket 3  Aufträge & Projekte   9 Dateien, 21 Stellen
✅ Paket 4  ERP & Lager          14 Dateien, 23 Stellen
✅ Paket 5  CRM & Kontakte        9 Dateien, 19 Stellen
✅ Paket 6  Was rausgeht          8 Dateien, 13 Stellen
✅ Paket 7a Endkunden-Seiten      2 Dateien,  8 Stellen
⬜ Paket 7b Rest der Chef-Seiten   ← HIER GEHT ES WEITER
⬜ Paket 8  Mitarbeiterbereich anredefrei
⬜ Paket 9  ANSEHEN gemeinsam durchgehen
```

**Paket 7b — die Ordner, die drankommen** (aus dem Befund, Stellenzahlen dort teils unvollständig):

ChefCockpit.tsx (4), leistungskatalog (4), rechte (3), versand (6), dashboard/layout.tsx (2), KiAuge, EigeneFelder, ERechnungDialog, elster (2), gobd, holz, forst/einsatzmittel (2), ernte (2), werkstatt, verleih, termine, team-kalender, vertraege/[id], vertrag-kuendigen, vorlagen, analyse, analytics, analytics/umsatz, anlagen, aufwand, controlling, personal, marktplaetze, mail-sync, wer-sieht-was, einstellungen/* (u. a. ApiSchluesselKarte 2), rechnungen/[id]

**Paket 8 — Mitarbeiterbereich anredefrei:** 16 Stellen in 4 Dateien laut Befund. Hier wird **nicht** gesiezt, sondern die Anrede herausgenommen.

**Paket 9 — ANSEHEN:** 148 Stellen in 73 Dateien, gemeinsam beurteilen. Viele davon sind Fehlalarme (siehe unten).

---

# Was ich beim Bauen gelernt habe — bitte übernehmen

## 1. Der Anrede-Befund ist lückenhaft. Nie blind übernehmen.

In sechs von sechs Paketen lag er daneben. **Immer selbst über die echten Dateien scannen**, und zwar zweifach:

* nach Duz-Pronomen: `du|dich|dir|dein|deine|deinem|deinen|deiner|deines|euer|eure|euch`
* **und nach Imperativen** — das ist die eigentliche Lücke. „Gib … ein", „Lade sie hoch", „Trage sie ein", „Leg sie an", „schau bei …", „trag … nach", „Beschreibe kurz", „Füg einfach ein", „Zieh …". Ein Imperativ enthält kein einziges Duz-Pronomen und rutscht durch jedes Pronomen-Muster.

Gefunden wurden so zusätzlich: 13 Stellen bei Finanzen, 10 bei Marketing, 4 bei Aufträgen, mehrere bei ERP und CRM.

**Und: immer die Nachbardateien mitprüfen, nicht nur die aus dem Befund.** Bei Marketing waren `lib/marketingAutopilot.ts` und `lib/marketingLagebericht.ts` im Befund nur als „ANSEHEN/SONSTIGES" geführt, weil sie in `lib/` liegen — dabei sind das genau die Sätze, die der Chef im Autopilot und im Lagebericht liest. Wären sie liegengeblieben, hätte eine gesiezte Seite einen geduzten Berater-Text enthalten.

## 2. Was NICHT geändert wird

* **KI-Prompts.** „Du bist ein freundlicher Verkaufsberater…" in `oeffentlich/chat/route.ts`, `branchen-chat/route.ts`, `marketing-content/route.ts`, `marketing-stratege/route.ts` sind Anweisungen an das Sprachmodell. Sie werden niemandem angezeigt. Das Modell zu duzen ist in Ordnung.
* **Code-Kommentare.** Zum Beispiel `// "KI nimmt, was du hast"` in `erp/lieferanten/import` und `erp/preisliste/import` Zeile 8, oder `// … ist fuer dich sofort live erreichbar` in `vorschau/page.tsx` Zeile 12. Notizen an mich selbst. Der Beleg „nur Textliterale geändert" bleibt sauberer, wenn Kommentare unangetastet bleiben.
* **Feldnamen und CSS-Klassen.** `app/vorschau/_lib/dossierHtml.ts` meldet 25 Treffer — das ist der Feldname `du:` im Typ `{ system: string[]; du: string[] }` plus die CSS-Klasse `col-du`. Die angezeigte Überschrift lautet dort bereits „Sie tun nur noch". Nichts zu tun.
* **Ladeanzeigen.** „Lade Projekte…", „Speichere …", „Prüfe …", „Plane ein…", „Hole Zahlen…" sind erste Person, kein Imperativ.

## 3. Die Prüf-Kette — vor jedem Push, ohne Ausnahme

1. **esbuild-Syntaxcheck** auf jede geänderte Datei. Richtiger Aufruf:
   `npx -y esbuild --loader:.tsx=tsx --jsx=automatic --target=es2020 <datei> --outfile=/dev/null`
   für `.ts`: `--loader:.ts=ts`. (`--loader=tsx` ohne Punkt schlägt fehl: „loader without extension only applies when reading from stdin".)
2. **Gegenprobe**: In eine geänderte Datei absichtlich einen Fehler einbauen und prüfen, ob die Kette ihn mit Zeilennummer fängt — dann zurücknehmen. Ein Test, der nie rot war, beweist nichts. Das wurde in jedem Paket gemacht und hat jedes Mal funktioniert.
3. Bei mir am Rechner danach immer `npx tsc --noEmit` und `npx next build`, erst dann der Push.

## 4. Der Beleg pro Push

Nachweisen, dass **ausschließlich Texte** geändert wurden:

* **Zeilenzahl** jeder Datei vorher = nachher
* **Anzahl der `^export`-Zeilen** vorher = nachher
* Anzahl geänderter Zeilen = Anzahl der Ersetzungen (oder weniger, wenn mehrere auf einer Zeile lagen)

## 5. Die Arbeitsweise, die sich bewährt hat

Ersetzungen als Python-Skript mit Tripeln `(datei, alt, neu)`, das **abbricht und nichts schreibt**, wenn ein `alt` nicht **genau einmal** vorkommt. Kein Regex-Ersetzen über ganze Dateien. Dateien mit `newline=""` lesen und schreiben, damit die Zeilenenden unangetastet bleiben.

Vorsicht bei Anführungszeichen: im Code steht oft `„Text"` — öffnend U+201E, schließend das **gerade** ASCII-Zeichen `"`. Nicht `„…"` annehmen.

---

## Offene Klicktests aus dem 12.09.

* **Beleg-Upload:** `ANALYSE_BETREIBER_ID` in Vercel muss `20dacbde-d2f2-43b8-9881-577ebce83639` sein (der einzige `profiles.role = 'admin'`). Steht dort etwas anderes, ist der Upload jetzt für alle zu — auch für mich. Einmal im Command Center einen Beleg hochladen.
* **Churn-Lock:** Am Testtag mit einer gekündigten Test-E-Mail anmelden und prüfen, ob die Sperre greift. Eine Regel, die nie rot war, beweist nichts.
* **Neu:** Nach Paket 6 einmal die Opt-in-Strecke durchklicken (Newsletter-Anmeldung → Bestätigungsmail → Bestätigungsseite) und die WhatsApp-Anmeldeseite ansehen. Dort wurden Kundentexte geändert.

## Eine offene Design-Frage aus Paket 6

In `app/vorschau/page.tsx` zeigt das Dashboard-Mockup auf der Werbeseite: „**Guten Morgen, Martin.**" und darunter „Ich habe 12 relevante Updates für **Sie**." Das „für dich" wurde gesiezt, der Vorname darüber blieb. Das ist gemischt. Entweder bleibt es so (Vorname + Sie ist im Mittelstand üblich), oder daraus wird „Guten Morgen, Herr Gaspar." Meine Entscheidung, noch nicht getroffen.

## Architektur-Erkenntnisse vom 12.09. (wichtig für jede RLS-Frage)

* `lib/supabase-server.ts` benutzt den **anon-Schlüssel** plus Cookie. **RLS gilt dort genauso wie im Browser.** Nur `createAdminClient` (Service-Role) umgeht sie. Eine Tabelle mit RLS und ohne Regel liefert über `supabase-server` garantiert nichts — ohne Fehlermeldung, ohne roten Build.
* Viele Routen erzeugen den Admin-Client **nicht** über `lib/supabase-admin.ts`, sondern lokal mit `createClient` plus Service-Key in einer eigenen Hilfsfunktion: `admin()` in `app/admin/command-center/page.tsx`, `adminDb()` in `app/api/admin/chat-verwaltung/route.ts`, `getSupabase()` in `app/api/website-anfrage/route.ts`. Wer nach Service-Role sucht, darf nicht nur auf den lib-Import schauen.
* `AGENTS.md` im Repo warnt: Diese Next.js-Version hat Breaking Changes gegenüber dem Trainingsstand. Vor echten Code-Änderungen (nicht bei reinen Textliteralen) den passenden Guide in `node_modules/next/dist/docs/` lesen.

## Werkzeuge im Repo

| Datei | wofür |
|---|---|
| `scripts/pruefe-rls-nutzung.cjs` | sagt je Tabelle, mit welchem Client zugegriffen wird |
| `scripts/pruefe-anrede.cjs` | Anrede-Scan nach Rolle, Fassung 2 → `supabase-sql/_BEFUND-anrede.txt` |
| `supabase-sql/_LESEN-mandantentrennung.sql` | Tabellen ohne RLS und mit RLS ohne Regel, als **eine** Abfrage |
| `supabase-sql/_LESEN-regeln-die-nichts-filtern.sql` | findet Regeln, die existieren, aber nichts filtern |

`.gitignore` ignorierte pauschal `*.cjs`; die Ausnahme `!scripts/*.cjs` ist ergänzt.

---

## Wie ich geführt werden will

* Antworte auf Deutsch. Führe mich Schritt für Schritt, warte auf mein „erledigt", bevor du weitermachst. Alles copy-paste-fertig.
* Niemals PowerShell — immer CMD, mit `chcp 65001` für Umlaute.
* Technisches Niveau: Anfänger bis Mittel. Ich bin Perfektionist — erklär mir das Warum, nicht nur das Was.
* Entscheidungsmodus: Wenn du eine klare Empfehlung hast, bau sie sofort und leg mir den fertigen Push-Block hin. Ich melde mich nur, wenn ich etwas anderes will. SQL und Push mache ich selbst.
* Sag mir ehrlich, wenn etwas schon existiert oder anders ist als gedacht.
* Wenn der Kontext knapp wird, sag es mir frühzeitig, damit ich einen frischen Chat starten kann.

## Fallen, die Zeit gekostet haben

* `npx esbuild` fragt „Ok to proceed? (y)" und verschluckt die nächste eingefügte Zeile. Immer `npx -y esbuild …`, und jeden Befehl in einen eigenen Codeblock.
* `git add` mit eckigen Klammern im Pfad (`betrieb/[id]/page.tsx`) liest sie als Zeichenklasse und findet still nichts — **stattdessen den Ordner adden**. Bei jedem Paket mit `[id]`-Seiten so gemacht, danach `git status` prüfen: die Dateizahl muss stimmen.
* Der Supabase-Editor zeigt bei mehreren Abfragen nur das Ergebnis der letzten. Lese-Abfragen immer als **eine** Abfrage bauen.
* Platzhalter in SQL-Beispielen sind eine Falle. Immer erst die Abfrage liefern, die die echten Werte holt.
* In `profiles` heißt die Spalte `firma_name`, nicht `firma`. Ein falscher Spaltenname bricht bei Supabase die ganze Select-Liste ab — es kommt gar keine Zeile zurück.
* Nach jedem Paket `git status` ansehen. Am 11.09. lagen zwei fertige Pakete einen halben Tag unbemerkt liegen.
* Eine Prüfung, die auf Dateiebene statt auf Variablenebene schaut, meldet Fehlalarm. Und eine RLS-Prüfung, die nur `qual` ansieht, übersieht INSERT-Regeln, weil deren Bedingung in `with_check` steht.

## Grenzen, die fest stehen

* **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung, Angebot), Zahlungs- und Bank-Integrationen und alles rund um Auth/Login nur gemeinsam und abgesegnet — nie unbeaufsichtigt. Bei reinen Textänderungen dort trotzdem den Diff zeigen und benennen, was nicht angefasst wurde.
* Nutzungsmessung nie auf Mitarbeiterebene. § 87 Abs. 1 Nr. 6 BetrVG greift schon bei Eignung, die Absicht ist egal.
* Kein Massenversand über Kundenpostfächer. Bis 5 Empfänger über SMTP, darüber Newsletter über Resend. Merksatz: Was die Maschine verschickt, geht über uns; was der Mensch tippt, über sein eigenes Postfach.
* Die zwei Grenzen des KI-Beraters bleiben fest verdrahtet: kein Preis, der nicht in den Stammdaten steht — und er behauptet nie, ein Mensch zu sein (AI Act Art. 50).
* SAFETY-FIRST und ADDITIV: SQL immer idempotent, nie destruktiv. Warne mich aktiv, wenn etwas Daten vernichten würde.
* SQL-Blöcke immer vollständig in den Chat schreiben **und** als Datei in `supabase-sql/` ablegen.
* Gezieltes `git add <datei>`, niemals `git add .`
* FLYER-Regel: nie Mitbewerber beim Namen nennen — „führende Mitbewerber".
* Kundentexte siezen. Nie „KI-Agenten" oder „KI-Crew" — das Wort heißt „Bausteine".
* Kontrollieren vor bauen: jede Datei erst frisch vom Gerät holen und am echten Code ansehen.

## Offene Entscheidungen, die bei mir liegen

* Beachhead-Branche für den Vertriebsstart
* Telefonie-Partner (Retell oder Vapi) — ohne Vertrag kein KI-Telefonassistent
* Avatar Stufe 4: echte Stimme und Gesicht, oder bei der Gerätestimme bleiben
* Steuerberater-Netzwerk — erst Anwalt (Steuerberatungsgesetz), dann überhaupt Code
* Anrede-Schalter im Mitarbeiterbereich — **erst nach Paket 8 neu bewerten**
* „Guten Morgen, Martin" im Vorschau-Mockup (siehe oben)

## Was bewusst nicht gebaut wird

Talent-Marktplatz · ARGONAUT Universum · alte Agenten-Seite · Bestellstrecke vorziehen (erst ab rund 100 Kunden) · Gruppe 6 Empfehlungen · 6.1 Preisrechner.

Guardrail: Das Unternehmerfrühstück, BNI und der 15. Juni sind abgeschlossen — nie mehr als Ziel oder Priorität nennen.

Querschnitt (Font-Vereinheitlichung) und Testtag kommen **ganz zum Schluss** — ich nehme mir einen eigenen Tag nur zum Testen aller Module. Nicht zwischendrin anbieten.

## Womit ich weitermachen will

**3.1, Paket 7b — Rest der Chef-Seiten.** Wenn ich nichts anderes sage, fang damit an: erst die Ordner oben frisch vom Gerät stagen, selbst nach Duz-Pronomen **und** Imperativen scannen, auch die Nachbardateien in `lib/` und `_components/`, dann bauen, prüfen, Push-Block liefern.

Danach Paket 8 (Mitarbeiterbereich anredefrei), dann Paket 9 (ANSEHEN gemeinsam durchgehen). Nach Paket 8 ist die Duz-Umstellung durch und wir sehen, ob der Anrede-Schalter noch lohnt.
