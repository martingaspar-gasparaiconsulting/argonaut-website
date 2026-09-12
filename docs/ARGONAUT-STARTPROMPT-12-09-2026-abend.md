# ARGONAUT OS · Startprompt für den nächsten Chat

**Stand: Samstag, 12. September 2026 · Nachmittag**

Ich bin Martin Gaspar, Gründer von ARGONAUT OS — ein KI-Betriebssystem für den deutschen Mittelstand. Wir arbeiten heute weiter daran.

## Wo alles liegt

* Repo auf meinem Rechner: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
* Supabase-Projekt: `znrjnndfzzydnhbyntwa`
* Live: Vercel, Branch `main`, jeder Push deployt automatisch

## Lies zuerst — in dieser Reihenfolge

1. `docs/ARGONAUT-Was-noch-zu-erledigen-ist-11-09-2026.pdf` — die eine gültige Liste, 38 abhakbare Punkte. **Stand jetzt: 2.6 und 3.2 sind erledigt, 3.1 ist angefangen.**
2. `docs/ARGONAUT-Anwaltsvorlage-11-09-2026.pdf` — alle offenen Rechtsfragen, Blöcke A bis K.
3. `supabase-sql/_BEFUND-anrede.txt` — die Arbeitsliste für 3.1, frisch erzeugt.

Wo eine ältere Liste diesen widerspricht, gelten diese. Und wo sie dem echten Code widersprechen, gilt der Code. Das ist nicht theoretisch: In vier Tagen stellten sich fünf Punkte beim Nachsehen als längst gebaut heraus.

## Was am 12.09. passiert ist

**Punkt 2.6 · Mandantentrennung — erledigt.** In drei Stufen geprüft:

* Keine einzige Tabelle ohne RLS. Die gefährliche Liste war leer.
* 1.200 Regeln, davon 1.196 sauber an Nutzer oder Betrieb gebunden. Nur vier lauteten `using (true)` für die Rolle `public` — `academy_kurse`, `agents`, `automatisierungen`, `betreiber_flags`. Alles Katalogdaten ohne Mandantenspalte: kein Vorfall, nichts für die Anwaltsliste. Alle vier auf `authenticated` verengt.
* SQL in `supabase-sql/mandantentrennung-2-6.sql`, der Rückweg steht auskommentiert am Dateiende.

**GROSSER FUND: Der Churn-Lock war wirkungslos.** `app/auth/callback/route.ts` prüft nach dem Login `churned_customers` — aber mit dem anon-Client, und die Tabelle hatte RLS an ohne jede Regel. Die Abfrage lieferte nie eine Zeile, `churned` war immer `null`, **gekündigte Kunden konnten sich normal anmelden.** Kein Fehler sichtbar, weil nur `data` destrukturiert wird und `error` nicht. Repariert mit der Policy `churned_eigene_email_lesen` (jeder sieht nur seine eigene Zeile). Commit `ff003ec`.

**Punkt 3.2 · beleg-upload — erledigt.** Die Betreiber-Sperre stand dort als *„wenn die Variable gesetzt ist und nicht passt, dann absagen"*. Bei nicht gesetzter `ANALYSE_BETREIBER_ID` kam **jeder Eingeloggte durch** — in die private Buchhaltung, samt KI-Kosten je Hochladung. `profiles.role` wurde gar nicht geprüft. `beleg-bestaetigen` hatte dieselbe Lücke, obwohl die Liste nur `beleg-upload` nennt. Beide ziehen jetzt `betreiberPruefung()` aus `lib/betreiberGuard.ts`. Commit `03e8bf5`.

**Punkt 3.1 · Duz-Umstellung — angefangen.** Siehe eigener Abschnitt unten.

## Architektur-Erkenntnisse vom 12.09. (wichtig für jede RLS-Frage)

* `lib/supabase-server.ts` benutzt den **anon-Schlüssel** plus Cookie. **RLS gilt dort genauso wie im Browser.** Nur `createAdminClient` (Service-Role) umgeht sie. Eine Tabelle mit RLS und ohne Regel liefert über `supabase-server` garantiert nichts — ohne Fehlermeldung, ohne roten Build.
* Viele Routen erzeugen den Admin-Client **nicht** über `lib/supabase-admin.ts`, sondern lokal mit `createClient` aus `@supabase/supabase-js` plus Service-Key in einer eigenen Hilfsfunktion: `admin()` in `app/admin/command-center/page.tsx`, `adminDb()` in `app/api/admin/chat-verwaltung/route.ts`, `getSupabase()` in `app/api/website-anfrage/route.ts`. Wer nach Service-Role sucht, darf nicht nur auf den lib-Import schauen.

## Neue Werkzeuge im Repo

| Datei | wofür |
|---|---|
| `scripts/pruefe-rls-nutzung.cjs` | sagt je Tabelle, mit welchem Client zugegriffen wird. Ohne Argumente die 23 gesperrten Tabellen, mit Argumenten beliebige: `node scripts/pruefe-rls-nutzung.cjs agents betreiber_flags` |
| `scripts/pruefe-anrede.cjs` | Anrede-Scan nach Rolle, Fassung 2. Ergebnis in `supabase-sql/_BEFUND-anrede.txt` |
| `supabase-sql/_LESEN-mandantentrennung.sql` | Tabellen ohne RLS und mit RLS ohne Regel, als **eine** Abfrage |
| `supabase-sql/_LESEN-regeln-die-nichts-filtern.sql` | findet Regeln, die zwar existieren, aber nichts filtern |

Dazu: `.gitignore` ignorierte pauschal `*.cjs` — ein neues Prüfskript unter `scripts/` wäre beim `git add` lautlos verschwunden. Ausnahme `!scripts/*.cjs` ist ergänzt.

## Punkt 3.1 im Detail — hier geht es weiter

**Die Regel (Entscheidung 11.09., ergänzt 12.09.):**

* **CHEF** wird gesiezt — er ist der zahlende Kunde, auch im System.
* **Alles was das System verlässt** siezt immer: E-Mails, PDFs, Rechnungen, öffentliche Website.
* **MITARBEITER** wird **anredefrei** formuliert — weder geduzt noch gesiezt.

Zur letzten Zeile, weil sie neu ist: Martin schlug einen Kippschalter vor, mit dem Mitarbeiter selbst wählen. Die Idee ist gut, aber zu früh. Duzen und Siezen ist im Deutschen keine Wortersetzung — Verb, Possessivpronomen und Satzstellung ändern sich mit („Bitte sieh dir deinen Plan an und bestätige ihn" → „Bitte sehen Sie sich Ihren Plan an und bestätigen Sie ihn"). Ein Schalter müsste **jeden** Satz dauerhaft in zwei Fassungen vorhalten, auch für jede künftige Seite. Die meisten dieser Sätze brauchen aber gar keine Anrede: „Aktuell sind keine Schichten für dich eingeplant" → „Aktuell sind keine Schichten eingeplant". Deshalb erst anredefrei machen, dann zählen was übrig bleibt — und **dann** über den Schalter entscheiden. Er wird danach billig sein.

**Der Befund (Stand 12.09., 938 Dateien durchsucht):**

| Topf | Stellen | Dateien |
|---|---|---|
| SIEZEN | 184 | 99 |
| ANREDEFREI (Mitarbeiterbereich) | 16 | 4 |
| ANSEHEN (Betreiber-Seiten, vermutete Imperative) | 148 | 73 |
| KI-PROMPT (nicht zu ändern) | 43 | 30 |

Die KI-Prompts sind Anweisungen an das Sprachmodell und werden niemandem angezeigt — das Modell zu duzen ist in Ordnung.

**Vorgeschlagener Schnitt, thematisch statt alphabetisch,** damit pro Paket einmal durchgeklickt werden kann:

1. **Finanzen** — kennzahlen (9), mahnwesen (3+1), cashflow, ueberweisung, euer, finanzen/euer, finanzen, zahlungen, sepa-einzug, provisionen
2. **Marketing** — seo (7), lagebericht (5), `lib/newsletter.ts` (6), autopilot, newsletter, analytics-board, roi-verzahnung, [id], bewertung-kampagne, studio
3. **Aufträge & Projekte** — auftraege/[id] (5), projekte (4), projekte/[id] (3), auftraege, aufmass, bautagebuch, projekt-abrechnung, objektzeiten, nachkalkulation
4. **ERP & Lager** — bestellungen (3), nachbestellung, preisliste, preisliste/import, lieferanten/import, lager, inventar, inventur, wareneingang, fuhrpark, erp, erp/[id], erp/layout, einkauf
5. **CRM & Kontakte** — crm (3), crm/firmen, crm/import, crm/wochenfokus, crm/dubletten, crm/firmen/[id], crm/pipeline, pipeline, mitglieder (5)
6. **Was rausgeht** — `app/api/oeffentlich/*` (5 Dateien), `lib/mailKalender.ts`, `app/vorschau/*`, online-buchung (5)
7. **Rest der Chef-Seiten** — ChefCockpit (4), leistungskatalog (4), rechte (3), versand (6), layout, KiAuge, EigeneFelder, ERechnungDialog, elster, gobd, holz, forst, ernte, werkstatt, verleih, termine, team-kalender, vertraege/[id], vertrag-kuendigen, vorlagen, analyse, analytics, anlagen, aufwand, controlling, personal, marktplaetze, mail-sync, wer-sieht-was, einstellungen/*, rechnungen/[id]
8. **Mitarbeiterbereich anredefrei** — die 16 Stellen in 4 Dateien
9. **ANSEHEN durchgehen** — die 148 Stellen gemeinsam beurteilen: Imperative sind mehrdeutig, Betreiber-Seiten liest nur Martin selbst

**Beleg pro Push** — dasselbe Muster wie beim `lib/auge.ts`-Push am 11.09.: Zeilenzahl und Export-Funktionen unverändert, Code-Gerüst ohne Textliterale identisch. Damit ist nachweisbar, dass ausschließlich Texte geändert wurden.

## Offene Klicktests aus dem 12.09.

* **Beleg-Upload:** `ANALYSE_BETREIBER_ID` in Vercel muss `20dacbde-d2f2-43b8-9881-577ebce83639` sein (das ist der einzige `profiles.role = 'admin'`). Steht dort etwas anderes, ist der Upload jetzt für alle zu — auch für mich. Einmal im Command Center einen Beleg hochladen.
* **Churn-Lock:** Am Testtag mit einer gekündigten Test-E-Mail anmelden und prüfen, ob die Sperre greift. Eine Regel, die nie rot war, beweist nichts.

## Wie ich geführt werden will

* Antworte auf Deutsch. Führe mich Schritt für Schritt, warte auf mein „erledigt", bevor du weitermachst. Alles copy-paste-fertig.
* Niemals PowerShell — immer CMD, mit `chcp 65001` für Umlaute.
* Technisches Niveau: Anfänger bis Mittel. Ich bin Perfektionist — erklär mir das Warum, nicht nur das Was.
* Entscheidungsmodus: Wenn du eine klare Empfehlung hast, bau sie sofort und leg mir den fertigen Push-Block hin. Ich melde mich nur, wenn ich etwas anderes will. SQL und Push mache ich selbst.
* Sag mir ehrlich, wenn etwas schon existiert oder anders ist als gedacht.

## Die Prüf-Kette — vor jedem Push, ohne Ausnahme

1. esbuild-Syntaxcheck auf jede geänderte Datei
2. `tsc --noEmit --strict` in der Prüf-Umgebung mit Stubs
3. `node --test` gegen ein frisch gebautes `out/` (vorher löschen)
4. Gegenprobe: In jede geänderte Datei absichtlich einen Fehler einbauen und prüfen, ob die Kette ihn mit Zeilennummer fängt — dann zurücknehmen. Ein Test, der nie rot war, beweist nichts.

Bei mir am Rechner läuft danach immer `npx tsc --noEmit` und `npx next build`, erst dann der Push.

## Fallen, die Zeit gekostet haben

* `npx esbuild` fragt „Ok to proceed? (y)" und verschluckt die nächste eingefügte Zeile. Immer `npx -y esbuild …`, und jeden Befehl in einen eigenen Codeblock.
* Beim Bauen für die Tests `--bundle` benutzen und alle benötigten Dateien aufzählen.
* `git add` mit eckigen Klammern im Pfad (`betrieb/[id]/page.tsx`) liest sie als Zeichenklasse und findet still nichts — stattdessen den Ordner adden.
* Der Supabase-Editor zeigt bei mehreren Abfragen nur das Ergebnis der letzten. Lese-Abfragen immer als **eine** Abfrage bauen.
* Platzhalter in SQL-Beispielen sind eine Falle. Immer erst die Abfrage liefern, die die echten Werte holt.
* In `profiles` heißt die Spalte `firma_name`, nicht `firma`. Ein falscher Spaltenname bricht bei Supabase die ganze Select-Liste ab — es kommt nicht ein leeres Feld zurück, sondern gar keine Zeile.
* Nach jedem Paket `git status` ansehen. Am 11.09. lagen zwei fertige Pakete einen halben Tag unbemerkt liegen.
* **Neu vom 12.09.:** Eine Prüfung, die auf Dateiebene statt auf Variablenebene schaut, meldet Fehlalarm — eine Route, die mit `supabase-server` die Anmeldung prüft und dann mit dem Admin-Client arbeitet, ist korrekt gebaut. Und eine RLS-Prüfung, die nur `qual` ansieht, übersieht INSERT-Regeln komplett, weil deren Bedingung in `with_check` steht.

## Grenzen, die fest stehen

* **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung, Angebot), Zahlungs- und Bank-Integrationen und alles rund um Auth/Login nur gemeinsam und abgesegnet — nie unbeaufsichtigt.
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
* Anrede-Schalter im Mitarbeiterbereich — **erst nach 3.1 neu bewerten**, wenn feststeht, wie wenige Stellen dann noch eine echte Anrede tragen

## Was bewusst nicht gebaut wird

Talent-Marktplatz · ARGONAUT Universum · alte Agenten-Seite · Bestellstrecke vorziehen (erst ab rund 100 Kunden) · Gruppe 6 Empfehlungen · 6.1 Preisrechner.

Und ein Guardrail: Das Unternehmerfrühstück, BNI und der 15. Juni sind abgeschlossen — nie mehr als Ziel oder Priorität nennen.

## Womit ich weitermachen will

**3.1, Paket 1 (Finanzen).** Wenn ich nichts anderes sage, fang damit an.

Danach in der Reihenfolge oben. Nach Paket 8 ist die Duz-Umstellung durch und wir sehen, ob der Anrede-Schalter noch lohnt.

Wenn der Kontext knapp wird, sag es mir frühzeitig, damit ich einen frischen starten kann, ohne etwas zu verlieren.
