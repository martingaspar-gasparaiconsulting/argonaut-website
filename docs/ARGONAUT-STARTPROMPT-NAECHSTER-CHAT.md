# Startprompt für den nächsten Chat

Alles ab der Linie kopieren und als erste Nachricht in den neuen Chat einfügen.
Stand: 09.09.2026, nach Abschluss von Gruppe 1.

---

Ich bin Martin Gaspar, Gründer von ARGONAUT OS — einem KI-Betriebssystem für den deutschen
Mittelstand. Wir bauen gemeinsam weiter. Bitte lies zuerst die Übergabe, dann fangen wir an.

**Repo:** `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
(Next.js 16 / React 19 / Supabase / Vercel — Supabase-Projekt `znrjnndfzzydnhbyntwa`)

**Lies als Erstes diese zwei Dateien vollständig, bevor du irgendetwas vorschlägst:**

1. `docs/ARGONAUT-UEBERGABE-08-09-2026.md` — der komplette Stand: Arbeitsregeln, die
   technischen Fallen (teuer gelernt), was am 08.09. gebaut wurde, Markt und Preise,
   der Avatar, die gefundenen Lücken.
2. `docs/ARGONAUT-BAULISTE-AKTUELL.md` — die Punkte, die noch zu bauen sind, mit
   Unterpunkten, SQL- und Push-Zahlen.

Ergänzend, falls nötig: `docs/ARGONAUT-MASTER-FAHRPLAN.md` (M1–M18-Zählung; die
Statusangaben darin sind teilweise überholt) und
`docs/ARGONAUT-Grosser-Durchgang-08-09-2026.pdf` (Wettbewerb, Preise, Avatar ausführlich).

## So arbeiten wir

- **Deutsch.** Kundentexte immer mit „Sie". Nie „KI-Agenten" oder „KI-Crew" — es heißt **„Bausteine"**.
- **Nie PowerShell — immer CMD**, mit `chcp 65001 >nul` für Umlaute.
- **SQL-Blöcke immer direkt in den Chat** schreiben, vollständig und copy-paste-fertig —
  nie nur auf eine Datei im Repo verweisen, auch wenn der Block lang wird.
- **Kontrollieren vor bauen:** jede Datei zuerst frisch vom Gerät stagen und am echten Code
  ansehen. Ehrlich sagen, wenn etwas schon existiert oder anders ist als gedacht.
  **Das gilt auch für Warnungen** — nichts als Problem melden, ohne vorher geprüft zu haben,
  ob der Code überhaupt läuft (am 09.09. einmal falsch gemacht, siehe unten).
- **Prüf-Kette vor jedem Push:** esbuild-Syntaxcheck + `tsc --noEmit` in der Stub-Umgebung +
  `node --test` für reine Logik-Dateien + Gegenprobe mit absichtlichem Typfehler.
  Vor jedem Push zusätzlich `npx next build`.
- **Gezielter `git add <datei>`**, nie `git add .`. Ein Push darf mehrere Dateien enthalten.
- **SAFETY-FIRST + ADDITIV:** idempotentes SQL, nie destruktiv, aktiv warnen wenn etwas
  destruktiv wäre. Rechte-Regeln lieber mit `alter policy … with check (false)` entschärfen
  als mit `drop policy` entfernen — das ist in fünf Sekunden zurückgedreht.
- **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung/Angebot), Zahlungs- und
  Bank-Integrationen und alles rund um Auth/Rechte nur gemeinsam und abgesegnet.
- **FREIE HAND:** Wenn du eine klare Empfehlung hast, bau sie sofort (Dateien über die
  Brücke ins Repo schreiben) und liefere nur den fertigen CMD-Push-Block. SQL und
  git add/commit/push mache ich selbst.
- Gib mir eine **kurze Vorwarnung, bevor der Kontext knapp wird**.

## Was am 09.09. passiert ist

**Gruppe 1 ist komplett fertig und live** (Vercel `34d0e28`, Production/Ready).

- **1.1 Textkorrekturen.** Die Bauliste sprach von „sieben Zeilen in `lib/onboardingStufen.ts`".
  Tatsächlich waren es **rund 80 Duz-Stellen in sechs Dateien**: `onboardingBranchen.ts` (38),
  `app/dashboard/onboarding/page.tsx` (23), `onboardingStufen.ts` (9), `gefuehrteTour.ts` (6),
  `GefuehrteTour.tsx` (3), `KiGuide.tsx` (1 — der Standardtext hieß „Dein KI-Guide").
  Alles auf „Sie" umgestellt.
  **KI-Kennzeichnung** sitzt jetzt fest in der Sprechblase von `KiGuide.tsx` und bleibt auch
  eingeklappt sichtbar (AI Act Art. 50 verlangt Wahrnehmbarkeit — ein wegklickbarer Hinweis
  reicht nicht). Nicht entfernen.
- **1.2 Mitarbeiter sehen die Anfragen.** Drei neue Regeln auf `leads`: `leads_select_ma`,
  `leads_insert_ma`, `leads_update_ma`, jeweils über `mein_chef_id()`. Bewusst kein
  Löschrecht für Mitarbeiter.
  **Nebenbefund, behoben:** es gab keine `leads_owner_insert` — der Chef rutschte beim
  manuellen Anlegen durch `leads_public_insert`, und die stand auf `with check (true)`,
  war also für jeden mit dem öffentlichen Schlüssel offen. Geprüft: kein Widget und keine
  Browser-Datei schreibt direkt in `leads`, der öffentliche Weg läuft über Service-Role.
  Deshalb: `leads_owner_insert` angelegt, `leads_public_insert` auf `with check (false)`
  gesetzt. Zurückdrehen mit demselben Befehl und `(true)`.
- **1.3 Firmendaten-Prüfung.** Die Bauliste nannte `stammdatenPruefung.ts` — falsche Datei,
  die prüft Lieferanten und Kunden. Richtig ist
  **`app/dashboard/einstellungen/firmaPruefung.ts`** (`pruefeFirma()`).
  Der echte Defekt: das Onboarding hakte „Firmendaten hinterlegen" grün ab, sobald
  **irgendeine Namensspalte** gefüllt war — Anschrift, PLZ, Ort und Steuer wurden nie
  geprüft. Jetzt wird der Haken nur ohne **Fehler** grün, Warnungen blockieren nicht, und
  eine Kachel nennt im Klartext, was fehlt. Ein Adapter (`firmaFelderAus`) fängt ab, dass
  `profiles` historisch gewachsen ist (`firma_name` / `firma` / `company_name` / `company`,
  `firma_iban` / `sepa_iban`). 7 node-Tests.

**Ein Fehler, den der nächste Chat nicht wiederholen soll:** Ich habe
`app/components/WebsiteChat.tsx` gefunden (alte Preise, „Agenten"-Wording, ein
„VERLUSTANGST"-Verkaufsprompt) und als Risiko gemeldet, **ohne zu prüfen, ob die Datei
überhaupt eingebunden ist**. Sie ist es nicht — kein einziger Import, und `app/page.tsx`
sagt selbst, dass die weiße Startseite ein Relikt ist. Auf der dunklen Seite gibt es keinen
Chat und keine alten Preise mehr. **Nicht erneut als offenen Punkt melden.**

## Womit wir anfangen

1. **Frag mich, ob die zehn Minuten Browser-Prüfung erledigt sind** (B9 Anmeldung mit und
   ohne Haken, beide EÜR-Seiten vergleichen). Steht noch aus.
2. **Fünf Dateien der D1-Lagerarbeit vom 08.09. liegen lokal geändert, aber nicht committet:**
   `app/dashboard/analytics/lager/page.tsx`, `app/dashboard/einkauf/page.tsx`,
   `app/dashboard/erp/[id]/page.tsx`, `lib/lagerBuchung.ts`, `tests/lagerBuchung.test.mjs`.
   Frag mich, ob das Absicht war — nicht blind mitpushen.
3. Dann **Gruppe 3** (hängt an nichts, 2 Punkte, 0 SQL, 2 Pushes):
   **3.1 Import-Vorlage je Branche** (das Nadelöhr des Onboardings — Beispieldatei zum
   Herunterladen, je Branche eine, richtige Spalten, drei Beispielzeilen; Bestand:
   `lib/importKatalog.ts`, `lib/importParser.ts`, `app/dashboard/import/`) und
   **3.2 Leere Seiten erklären sich selbst** (`Leerzustand` ist gebaut, aber nie geprüft,
   ob sie überall sitzt).
   Gruppe 2 wartet auf meine Tonaufnahmen, Gruppe 6 ist gestrichen.

**Restumfang: 14 Punkte · 9 SQL · 23 Pushes.**

**Nicht vergessen:** Der Testtag M18 ist wichtiger als jeder neue Baustein — keine der neuen
Oberflächen wurde je von einem Menschen im Browser bedient.
