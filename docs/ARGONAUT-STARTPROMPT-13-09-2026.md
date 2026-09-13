# ARGONAUT OS · Startprompt für den nächsten Chat

**Stand: Sonntag, 13. September 2026** — löst den Nacht-Prompt vom 12.09. ab.

Ich bin Martin Gaspar, Gründer von ARGONAUT OS — ein KI-Betriebssystem für den deutschen Mittelstand. Wir arbeiten weiter daran.

---

## Das Erste, was du tun musst

**Fordere die beiden Ordner an.** Ordnerfreigaben gelten nur für den Chat, in dem sie erteilt wurden — in einem neuen Chat ist nichts freigegeben, auch wenn es gestern funktioniert hat. Also sofort `device_request_folder_access` für beide:

1. `C:\Users\Admin\Desktop\gaspar-ai-system` (Drumherum: ANWALT-RECHT, core, modules, tests)
2. `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` (der Repo-Ordner)

**Nimm für alles im Repo den zweiten Ordner als Bezugspunkt.** Die Datei-Brücke schafft nur sieben Ordnerebenen ab dem freigegebenen Ordner; ab `gaspar-ai-system` sind Pfade wie `app/dashboard/marketing/ads/kosten/page.tsx` acht Ebenen tief und unerreichbar. Ab `argonaut-website` sind es fünf. Beide behalten — `ANWALT-RECHT` liegt nur unter dem ersten. Nichts verschieben: In Next.js ist die Ordnerstruktur die URL-Struktur.

* Supabase-Projekt: `znrjnndfzzydnhbyntwa`
* Live: Vercel, Branch `main`, jeder Push deployt automatisch

## Die Checkliste

Es gibt ein angeheftetes Artifact **„ARGONAUT Bautag"** mit allen 36 offenen Punkten zum Abhaken:

`https://claude.ai/code/artifact/6a692f72-7b7c-4438-a754-3a37959a0fd7`

Es speichert seinen Stand selbst (Capability `artifact`). **Wenn du es ändern sollst, lies es zuerst mit `action: "read"` und dieser URL und publiziere dann mit `url` — nie ohne, sonst entsteht ein zweites Artifact.** Neue Punkte gehören dort hinein, erledigte hakt Martin selbst ab.

---

# 🔴 Der Punkt, mit dem wir anfangen

## Der Churn-Lock ist wirkungslos — nachgewiesen, nicht vermutet

`app/auth/callback/route.ts` baut seinen Client in Zeile 15 mit `NEXT_PUBLIC_SUPABASE_ANON_KEY` und fragt damit in Zeile 37 `churned_customers` ab. Diese Tabelle hat RLS an und **null Regeln** (mit einer Supabase-Abfrage am 12.09. bestätigt). Eine Tabelle mit RLS und ohne Regel liefert dem anon-Client garantiert nichts — ohne Fehler, ohne roten Build. `churned` ist also immer `null`, die Sperre schlägt nie zu. **Ein gekündigter Kunde loggt sich weiterhin ein.**

Zweiter Fehler in derselben Abfrage: `.single()` statt `.maybeSingle()`. `.single()` wirft bei null Treffern einen Fehler, der hier verschluckt wird, weil nur `data` destrukturiert wird.

**Der Weg:** Die Prüfung in der Route über einen Service-Role-Client laufen lassen (es ist ein Server-Handler, das geht sauber) und `.maybeSingle()` verwenden. Zwei Zeilen — aber an der Anmeldung, also **GEMEINSAM-Regel: nur mit Martins Freigabe, nie unbeaufsichtigt.**

Damit ist auch der Testtag-Punkt „Churn-Lock prüfen" beantwortet, bevor er getestet wurde.

---

# Was in der Nacht vom 12.09. fertig wurde

## Punkt 3.1 Duz-Umstellung — komplett durch

Alle neun Pakete gepusht und live: **308 Textstellen in 116 Dateien.**

| Paket | Inhalt | Commit |
|---|---|---|
| 1–6 | Finanzen, Marketing, Aufträge, ERP, CRM, Was rausgeht | d031b1e · 6bb3b0a · eaf09e1 · d54f9ec · 409a673 · 3eb5ac7 |
| 7a | Endkunden-Seiten | c19866e |
| 7b | Rest der Chef-Seiten, 94 Stellen in 41 Dateien | `3e06348` |
| 8 | Mitarbeiterbereich anredefrei + Schichtplan/BDE gesiezt, 19 Stellen | `622cc74` |
| 9 | Vorführ-Inhalt, Endkunden-Anmeldung, lib-Texte, 28 Stellen | `c50cc96` |

**Die Regel, die gilt:** CHEF wird gesiezt. Alles was das System verlässt siezt immer. MITARBEITER wird **anredefrei** formuliert.

**Der Anrede-Schalter für Mitarbeiter ist endgültig gestrichen** (12.09.). Grund: alle 13 Mitarbeiter-Stellen ließen sich anredefrei formulieren, ohne dass ein Satz gestelzt klingt — ein Schalter hätte null Sätze gerettet. Nicht mehr aufgreifen.

**Bewährte anredefreie Muster:** „Du hast diesen Plan bestätigt" → „Plan bestätigt" · „Bitte wende dich an deinen Vorgesetzten" → „Bitte an den Vorgesetzten wenden" · „dein Vorgesetzter" → „der Vorgesetzte" · „Deine Tour" → „Meine Tour".

## Weitere fertige Punkte

**3.5 C2 `termine.kontakt_id`** — war zu drei Vierteln schon gebaut. Das Formular schrieb `kontakt_id`, die Online-Buchung ordnet per `kontaktIdPerEmail` zu, die Kunden-Akte liest zweigleisig. Gefehlt hat nur die Terminliste selbst. Nachgebaut: Feld im Typ, Spalte im `select`, `kundenNamen`-useMemo, Kunden-Abzeichen mit Sprung auf `/dashboard/crm/<id>`. **Bewusst kein Supabase-Join** `kontakte(anzeigename)` — ein Problem am Kontakt hätte sonst die ganze Terminliste leer gemacht.

**3.7 Fahrzeugakte schreibfähig** — neu `lib/fahrzeugAkte.ts` (19 Tests) + `tests/fahrzeugAkte.test.mjs`. Stammdaten bearbeiten (inkl. nächster HU) und Halterwechsel eintragen. **Kein SQL nötig** — `werkstatt_fahrzeuge` hatte längst alle Spalten. Die FIN ist nicht änderbar, Aufträge und Positionen bleiben lesend, gelöscht wird nichts (alter Halter bekommt `bis_datum`). Der Halterwechsel wird erst **geplant**, dann ausgeführt: `halterWechselPlan()` rechnet alles aus, ohne die Datenbank anzufassen — scheitert eine Prüfung, entsteht gar kein Plan statt eines halben.

**3.4 E-Mail Push 3** — neu `lib/mailAbruf.ts` (23 Tests) + `app/api/mail/anhang/route.ts`; `posteingang/route.ts`, `nachricht/route.ts` und `posteingang/page.tsx` erweitert. Anhänge herunterladen, Ordner wählen, suchen.

**3.8 C5 Video-Upload** — war beim Nachsehen schon fertig, gebaut am 08.09. (`social-video/route.ts` mit signierter Adresse, `eintrag/route.ts`, Tabelle `social_video`, Bucket `social-videos`).

**2.6** Mandantentrennung Abschnitt 3+4 · **2.9** eigene Dossier-Strecke getestet, läuft · **3.2** beleg-upload — alle drei erledigt.

---

# Was ich beim Bauen gelernt habe — bitte übernehmen

## 1. Nachsehen, bevor du baust. Sechs von sechs Mal war die Liste falsch.

3.8 war komplett gebaut. 3.5 zu drei Vierteln. 3.7 brauchte kein SQL, obwohl „1 SQL · 2 Pushes" dastand. Der Anrede-Befund lag in allen Paketen daneben. **Jede Datei zuerst frisch vom Gerät stagen und am echten Code ansehen** — und ehrlich sagen, wenn etwas schon existiert.

## 2. Der Anrede-Scan als Muster für jeden künftigen Scan

`scripts/pruefe-anrede.cjs` fand nur Pronomen. Die eigentliche Lücke sind **Imperative ohne jedes Pronomen**: „Gib … ein", „Leg sie an", „Trag … ein", „Prüf …", „Erfasse …". Immer **zweifach** scannen. Und **immer die Nachbardateien mitprüfen** — `lib/vorfuehrungInhalt.ts` enthielt sechs geduzte Sätze, die ein **Interessent bei der Vorführung** liest, und stand im Befund nur unter „ANSEHEN".

## 3. Ein Skript, das die DB-Regeln nicht kennt, darf nicht „TOT" sagen

`scripts/pruefe-rls-nutzung.cjs` meldete `academy_kurse` als tot. Falsch — die Tabelle hat `academy_read_all` mit `using (true)`. Das Skript warnt selbst davor. **Immer gegen die echte Regel-Liste kreuzen**, nie dem Skript allein glauben. Von 23 verdächtigen Tabellen blieb genau eine echte: `churned_customers`.

## 4. Die Prüf-Kette vor jedem Push

1. **esbuild-Syntaxcheck** je Datei:
   `npx -y esbuild --loader:.tsx=tsx --jsx=automatic --target=es2020 <datei> --outfile=/dev/null`
   für `.ts`: `--loader:.ts=ts`. (`--loader=tsx` ohne Punkt schlägt fehl.)
2. **tsc in einer Prüf-Umgebung mit Stubs** — funktioniert zuverlässig; `process` wird dort als Fehler gemeldet, das ist eine Eigenheit der Prüf-Umgebung und kein Befund.
3. **node --test** für reine Logik-Dateien. Konvention im Repo: Tests liegen in `tests/*.test.mjs` und importieren aus `../out/<name>.js`. Vorher bauen:
   `npx -y esbuild lib/<name>.ts --outfile=out/<name>.js --format=esm --target=es2020`
   Die Warnung `MODULE_TYPELESS_PACKAGE_JSON` ist harmlos — **nicht** mit `"type": "module"` beheben, das kann Next.js durcheinanderbringen.
4. **Gegenprobe**: absichtlich einen Fehler einbauen, prüfen dass die Kette ihn mit Zeilennummer fängt, zurücknehmen. Wurde bei jedem Paket gemacht und hat jedes Mal funktioniert.
5. Bei Martin danach `npx tsc --noEmit` und `npx next build`, erst dann der Push.

## 5. Der Beleg pro Push

Zeilenzahl je Datei vorher = nachher · Anzahl `^export`-Zeilen vorher = nachher · Anzahl geänderter Zeilen = Anzahl der Ersetzungen (oder weniger, wenn mehrere auf einer Zeile lagen). Bei Paket 7b: 94 Ersetzungen auf 88 Zeilen — und git meldete exakt `88 insertions(+), 88 deletions(-)`.

## 6. Die Arbeitsweise, die trägt

Ersetzungen als Python-Skript mit Tripeln `(datei, alt, neu)`, das **abbricht und nichts schreibt**, wenn ein `alt` nicht **genau einmal** vorkommt. Kein Regex über ganze Dateien. Dateien mit `newline=""` lesen und schreiben.

## 7. Wenn die Datei-Brücke das Zurückschreiben verweigert

Meldung „device file changed since stage" heißt meist nur: git hat beim Commit den Zeitstempel verändert. **Nicht mit `force` überschreiben** — frisch stagen, mit der eigenen Fassung vergleichen, Änderung neu aufsetzen. Am 12.09. war die Datei inhaltlich identisch.

---

# Fallen, die Zeit gekostet haben

* `npx esbuild` fragt „Ok to proceed? (y)" und verschluckt die nächste eingefügte Zeile. Immer `npx -y esbuild …`, jeden Befehl in einen eigenen Codeblock.
* `git add` mit eckigen Klammern im Pfad (`rechnungen/[id]/page.tsx`) liest sie als Zeichenklasse und findet still nichts — **stattdessen den Ordner adden**, danach `git status --short` prüfen: die Dateizahl muss stimmen.
* Der Supabase-Editor zeigt bei mehreren Abfragen nur das Ergebnis der letzten. Lese-Abfragen immer als **eine** Abfrage bauen.
* Platzhalter in SQL-Beispielen sind eine Falle. Immer erst die Abfrage liefern, die die echten Werte holt.
* In `profiles` heißt die Spalte `firma_name`, nicht `firma`. Ein falscher Spaltenname bricht bei Supabase die ganze Select-Liste ab — es kommt gar keine Zeile zurück.
* Nach jedem Paket `git status` ansehen.

# Architektur-Wissen, das man braucht

* `lib/supabase-server.ts` benutzt den **anon-Schlüssel** plus Cookie. **RLS gilt dort genauso wie im Browser.** Nur `createAdminClient` (Service-Role) umgeht sie.
* Viele Routen erzeugen den Admin-Client **nicht** über `lib/supabase-admin.ts`, sondern lokal: `admin()` in `app/admin/command-center/page.tsx`, `adminDb()` in `app/api/admin/chat-verwaltung/route.ts`, `getSupabase()` in `app/api/website-anfrage/route.ts`, `service()` in mehreren Cron-Routen. Wer nach Service-Role sucht, darf nicht nur auf den lib-Import schauen.
* Die `werkstatt_*`-Tabellen haben **keine SQL-Datei** in `supabase-sql/` und stehen nicht in `_ALLE-TABELLEN.sql` (Stand 18.08.) — sie wurden direkt im Editor angelegt. Vor jedem Werkstatt-SQL die echten Spalten per `information_schema` abfragen.
* **Alle `werkstatt_*`-Regeln lauten `auth.uid() = owner_user_id`** — es gibt keine Mitarbeiter-Regel (`mein_chef_id()`). Ein Mitarbeiter sieht die Werkstatt gar nicht. Kein Fehler, eine nie getroffene Entscheidung (steht in der Checkliste, Block F).
* `AGENTS.md` warnt: Diese Next.js-Version hat Breaking Changes gegenüber dem Trainingsstand. Vor echten Code-Änderungen den passenden Guide in `node_modules/next/dist/docs/` lesen.

# Werkzeuge im Repo

| Datei | wofür |
|---|---|
| `scripts/pruefe-rls-nutzung.cjs` | sagt je Tabelle, mit welchem Client zugegriffen wird — kennt die DB-Regeln NICHT |
| `scripts/pruefe-anrede.cjs` | Anrede-Scan nach Rolle → `supabase-sql/_BEFUND-anrede.txt` |
| `supabase-sql/_LESEN-mandantentrennung.sql` | Tabellen ohne RLS und mit RLS ohne Regel, als **eine** Abfrage |
| `supabase-sql/_LESEN-regeln-die-nichts-filtern.sql` | findet Regeln, die existieren, aber nichts filtern |
| `docs/ARGONAUT-Offen-12-09-2026.pdf` | die Offen-Liste als PDF (Papierfassung der Checkliste) |

---

# Wie ich geführt werden will

* Antworte auf Deutsch. Führe mich Schritt für Schritt. Alles copy-paste-fertig.
* **Niemals PowerShell — immer CMD**, mit `chcp 65001` für Umlaute.
* Technisches Niveau: Anfänger bis Mittel. Ich bin Perfektionist — erklär mir das Warum, nicht nur das Was.
* **Entscheidungsmodus:** Wenn du eine klare Empfehlung hast, bau sie sofort und leg mir den fertigen Push-Block hin. Ich melde mich nur, wenn ich etwas anderes will. SQL und Push mache ich selbst.
* **Blockweise arbeiten:** pro Block zuerst das komplette SQL in EINEM Block, danach die Pushes nacheinander — nicht auf „erledigt" warten.
* Ein Push darf mehrere Dateien enthalten. Gezieltes `git add <datei>`, **niemals `git add .`**
* Sag mir ehrlich, wenn etwas schon existiert oder anders ist als gedacht.
* Wenn der Kontext knapp wird, sag es mir frühzeitig, damit ich einen frischen Chat starten kann.

# Grenzen, die fest stehen

* **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung, Angebot), Zahlungs- und Bank-Integrationen und alles rund um Auth/Login nur gemeinsam und abgesegnet — nie unbeaufsichtigt. Bei reinen Textänderungen dort trotzdem den Diff zeigen und benennen, was nicht angefasst wurde.
* **SAFETY-FIRST und ADDITIV:** SQL immer idempotent, nie destruktiv. Warne mich aktiv, wenn etwas Daten vernichten würde.
* SQL-Blöcke immer vollständig in den Chat schreiben **und** als Datei in `supabase-sql/` ablegen.
* Nutzungsmessung nie auf Mitarbeiterebene. § 87 Abs. 1 Nr. 6 BetrVG greift schon bei Eignung.
* Kein Massenversand über Kundenpostfächer. Bis 5 Empfänger über SMTP, darüber Newsletter über Resend. Merksatz: Was die Maschine verschickt, geht über uns; was der Mensch tippt, über sein eigenes Postfach.
* Die zwei Grenzen des KI-Beraters bleiben fest verdrahtet: kein Preis, der nicht in den Stammdaten steht — und er behauptet nie, ein Mensch zu sein (AI Act Art. 50).
* **FLYER-Regel:** nie Mitbewerber beim Namen nennen — „führende Mitbewerber".
* Kundentexte siezen. Nie „KI-Agenten" oder „KI-Crew" — das Wort heißt **„Bausteine"**.
* **Guardrail:** Unternehmerfrühstück, BNI und der 15. Juni sind abgeschlossen — nie mehr als Ziel oder Priorität nennen.

# Was bewusst nicht gebaut wird

Talent-Marktplatz · ARGONAUT Universum · alte Agenten-Seite · Bestellstrecke vorziehen (erst ab rund 100 Kunden) · Gruppe 6 Empfehlungen · 6.1 Preisrechner.

---

# Womit wir weitermachen

1. **Der Churn-Lock** (oben) — gemeinsam, zuerst.
2. Danach das, was in der Checkliste oben steht: Block A (Resend Pro, Termin-Wert-Rechner), dann Block B und C — die beiden sind Klicktests, die ich selbst mache.
3. Zum Bauen bleiben **3.6 Rechnungs-PDF auf `lib/markeCi`** (gemeinsam) und **3.3 B8 Kleinkram-Rest** (braucht erst meine Entscheidungen aus Block F).

Alles andere wartet auf den Anwalttermin, den Testtag oder ist ein großer Brocken.
