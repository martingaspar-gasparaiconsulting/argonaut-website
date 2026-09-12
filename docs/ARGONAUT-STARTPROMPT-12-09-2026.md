# ARGONAUT OS · Startprompt für den nächsten Chat
**Stand: Samstag, 12. September 2026 · Nachmittag**

---

Ich bin Martin Gaspar, Gründer von ARGONAUT OS — ein KI-Betriebssystem für den deutschen
Mittelstand. Wir arbeiten heute weiter daran.

## Wo alles liegt

- **Repo auf meinem Rechner:** `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
- **Supabase-Projekt:** `znrjnndfzzydnhbyntwa`
- **Live:** Vercel, Branch `main`, jeder Push deployt automatisch

## Lies zuerst — in dieser Reihenfolge

1. `docs/ARGONAUT-Was-noch-zu-erledigen-ist-11-09-2026.pdf` — **die eine gültige Liste.**
   6 Seiten, 38 abhakbare Punkte, Code und Nicht-Code zusammen. Ersetzt alle vorherigen
   Baulisten und Restlisten.
2. `docs/ARGONAUT-Anwaltsvorlage-11-09-2026.pdf` — alle offenen Rechtsfragen, Blöcke A bis K,
   sortiert nach Aufwand beim Anwalt.

**Wo eine ältere Liste diesen beiden widerspricht, gelten diese beiden. Und wo diese beiden dem
echten Code widersprechen, gilt der Code.** Das ist nicht theoretisch: In den letzten drei Tagen
stellten sich vier Punkte beim Nachsehen als längst gebaut heraus.

## Stand vom 11.09.2026, abends

- Letzte Commits: `84a6d64` (Command Center · Menge & Domains, plus `firma_name`-Fix) und
  `c02ee71` (6.5 Teil 2 und 3, nachgeholt). Beide auf Vercel Ready.
- **187 + 48 Tests grün.** Test-Konvention: `tests/*.test.mjs` importieren aus `../out/<name>.js`
  (mit `.js`, nicht `.mjs`).
- Fertig und live: Gruppe 1, Gruppe 3, G1, G2, G3, E-Mail Push 1+2, 6.3 KI-Ausfallplan,
  6.4 Nutzungsmessung, 6.5 komplett (8 Augen), Chat-Deckel, Command-Center-Verwaltung für
  Chat-Stufe und Domains.
- Nicht gepusht, aber auf der Platte: **nichts** — mit `c02ee71` ist alles draußen.
  (Trotzdem nach jedem Paket `git status` ansehen. Am 11.09. lagen zwei fertige Pakete einen
  halben Tag unbemerkt liegen, weil ein Push beim Verbindungsabbruch nie lief.)

## Womit ich weitermachen will

Sag es mir, wenn ich es nicht gleich zu Beginn sage. Die Empfehlung aus der Liste lautet:

1. **Resend auf Pro** umstellen, danach `MAIL_TAGESBUDGET` in Vercel — fünf Minuten, liegt seit
   einer Woche (mache ich selbst)
2. **Abschnitt 3 und 4 von `supabase-sql/_LESEN-stand-exportieren.sql`** ansehen: Tabellen ohne
   RLS, Tabellen mit RLS aber ohne Regel. Das ist die Mandantentrennung — gemeinsam durchgehen
3. **Anwaltstermin** halten (Vorlage liegt fertig)
4. **Duz-Umstellung rollengetrennt** — 96 Duz-Zeilen in 45 Dateien. Chef-Seiten siezen,
   Mitarbeiterbereich duzt, alles was das System verlässt siezt immer
5. **`beleg-upload` nachziehen** — dieselbe Strenge wie die neuen Betreiber-Endpunkte
6. **Dann der Testtag** — vor den großen Brocken, nicht danach

## Wie ich geführt werden will

- **Antworte auf Deutsch.** Führe mich Schritt für Schritt, warte auf mein „erledigt", bevor du
  weitermachst. Alles copy-paste-fertig.
- **Niemals PowerShell — immer CMD**, mit `chcp 65001` für Umlaute.
- Technisches Niveau: Anfänger bis Mittel. Ich bin Perfektionist — erklär mir das *Warum*, nicht
  nur das *Was*.
- **Entscheidungsmodus:** Wenn du eine klare Empfehlung hast, bau sie sofort und leg mir den
  fertigen Push-Block hin. Ich melde mich nur, wenn ich etwas anderes will. SQL und Push mache
  ich selbst.
- **Sag mir ehrlich, wenn etwas schon existiert oder anders ist als gedacht.**

## Die Prüf-Kette — vor jedem Push, ohne Ausnahme

1. **esbuild-Syntaxcheck** auf jede geänderte Datei
2. **`tsc --noEmit --strict`** in der Prüf-Umgebung
3. **`node --test`** gegen ein frisch gebautes `out/` (vorher löschen)
4. **Gegenprobe:** In *jede* geänderte Datei absichtlich einen Fehler einbauen und prüfen, ob die
   Kette ihn mit Zeilennummer fängt — dann zurücknehmen. Ein Test, der nie rot war, beweist nichts.

Bei mir am Rechner läuft danach immer `npx tsc --noEmit` **und** `npx next build`, erst dann der Push.

## Fallen, die am 11.09. Zeit gekostet haben

- **esbuild ist im Projekt nicht installiert.** `npx esbuild` fragt „Ok to proceed? (y)" und
  verschluckt dabei meine nächste eingefügte Zeile. Immer `npx -y esbuild …` schreiben — und jeden
  Befehl in einen **eigenen** Codeblock, damit nie zwei Zeilen zusammen eingefügt werden.
- **Beim Bauen für die Tests `--bundle` benutzen**, sonst fehlt in `out/` die Dateiendung an den
  relativen Importen. Und *alle* benötigten Dateien aufzählen — `lib/auge.ts` zu vergessen kostete
  einen Durchlauf.
- **`git add` mit eckigen Klammern im Pfad** (`betrieb/[id]/page.tsx`) liest sie als Zeichenklasse
  und findet still nichts. Stattdessen den **Ordner** adden.
- **Der Supabase-Editor zeigt bei mehreren Abfragen nur das Ergebnis der letzten.** Lese-Abfragen
  für mich immer als **eine** Abfrage bauen.
- **Platzhalter in SQL-Beispielen sind eine Falle.** `'<uuid-des-betriebs>'` habe ich wörtlich
  eingefügt und einen Fehler bekommen. Immer erst die Abfrage liefern, die die echten Werte holt.
- **In `profiles` heißt die Spalte `firma_name`, nicht `firma`.** (`firma` gibt es in `web_ci`, aber
  nicht in `profiles`.) Ein falscher Spaltenname bricht bei Supabase die **ganze** Select-Liste ab —
  es kommt nicht ein leeres Feld zurück, sondern gar keine Zeile. So war die Betriebs-Akte im
  Command Center einen Tag lang tot, bei grünem Build und grünen Tests.

## Grenzen, die fest stehen

- **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung, Angebot), Zahlungs- und Bank-Integrationen
  und alles rund um Auth/Login **nur gemeinsam und abgesegnet** — nie unbeaufsichtigt.
- **Nutzungsmessung nie auf Mitarbeiterebene.** § 87 Abs. 1 Nr. 6 BetrVG greift schon bei Eignung,
  die Absicht ist egal. Wenn ein Feld eine Einzelperson erkennbar macht: weglassen und mich fragen.
- **Kein Massenversand über Kundenpostfächer.** Bis 5 Empfänger über SMTP, darüber Newsletter über
  Resend. Merksatz: Was die Maschine verschickt, geht über uns; was der Mensch tippt, über sein
  eigenes Postfach.
- **Die zwei Grenzen des KI-Beraters bleiben fest verdrahtet:** kein Preis, der nicht in den
  Stammdaten steht — und er behauptet nie, ein Mensch zu sein (AI Act Art. 50).
- **SAFETY-FIRST und ADDITIV:** SQL immer idempotent (`if not exists`), nie destruktiv. Warne mich
  aktiv, wenn etwas Daten vernichten würde.
- **SQL-Blöcke immer vollständig in den Chat schreiben** *und* zusätzlich als Datei in
  `supabase-sql/` ablegen. Nie nur auf eine Repo-Datei verweisen.
- **Gezieltes `git add <datei>`**, niemals `git add .`
- **FLYER-Regel:** nie Mitbewerber beim Namen nennen — „führende Mitbewerber".
- **Kundentexte siezen.** Nie „KI-Agenten" oder „KI-Crew" — das Wort heißt **„Bausteine"**.
- **Kontrollieren vor bauen:** jede Datei erst frisch vom Gerät holen und am echten Code ansehen.

## Offene Entscheidungen, die bei mir liegen

- Beachhead-Branche für den Vertriebsstart
- Telefonie-Partner (Retell oder Vapi) — ohne Vertrag kein KI-Telefonassistent
- Avatar Stufe 4: echte Stimme und Gesicht, oder bei der Gerätestimme bleiben
- Steuerberater-Netzwerk — erst Anwalt (Steuerberatungsgesetz), dann überhaupt Code

## Was bewusst nicht gebaut wird

Talent-Marktplatz · ARGONAUT Universum · alte Agenten-Seite · Bestellstrecke vorziehen (erst ab
rund 100 Kunden) · Gruppe 6 Empfehlungen · 6.1 Preisrechner (am echten Code nachgerechnet und
zurückgestellt).

**Und ein Guardrail:** Das Unternehmerfrühstück, BNI und der 15. Juni sind abgeschlossen — nie
mehr als Ziel oder Priorität nennen.

---

*Wenn der Kontext in diesem Chat knapp wird, sag es mir frühzeitig, damit ich einen frischen
starten kann, ohne etwas zu verlieren.*
