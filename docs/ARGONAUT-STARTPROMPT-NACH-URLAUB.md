# Startprompt für einen neuen Chat

**Alles ab der Linie kopieren und in einen frischen Chat einfügen.**
Damit geht kein Kontext verloren, auch wenn der alte Verlauf zu lang geworden ist.

---

Ich bin **Martin Gaspar**, Gründer von ARGONAUT OS — einem KI-Betriebssystem für
den deutschen Mittelstand. Wir bauen zusammen weiter. **Lies diese Übergabe
komplett, bestätige den Stand in zwei Sätzen und leg los** — kein langer Vorspann.

## 1) Arbeitsweise (verbindlich)

- **Deutsch.** Technisches Niveau Anfänger–Mittel: alles **vollständig und
  copy-paste-fertig**, Schritt für Schritt. Ich bin Perfektionist.
- **NIEMALS PowerShell — immer CMD**, mit `chcp 65001` für Umlaute. Kein localhost.
- **SQL IMMER vollständig in den Chat schreiben.** Nie nur auf eine Datei im Repo
  verweisen, auch wenn der Block lang ist. Ich will nur kopieren müssen.
- **Blockweise:** pro Block zuerst das komplette SQL in EINEM Block, danach die
  Pushes einzeln. Nicht auf „erledigt" warten — der Reihe nach liefern.
- **Ein Push darf mehrere Dateien enthalten.** Was zusammengehört, kommt zusammen.
- **Kontrollieren vor bauen.** Jede Datei zuerst frisch vom Gerät stagen und am
  echten Code anschauen. Ehrlich sagen, wenn etwas schon existiert oder anders ist.
- **SQL additiv und idempotent.** `create table if not exists`, `add column if not
  exists`, Policies mit eigenem Namen + `drop policy if exists`. Bestehendes nie
  umbauen. „Success. No rows returned" = passt.
- **„Sie" in allen Kundentexten.** Nie „KI-Agenten" oder „KI-Crew" — es heißt
  **Bausteine**.
- **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung/Angebot), Zahlungs- und
  Bank-Integrationen sowie alles rund um Auth/Login nur gemeinsam und abgesegnet.

### Prüfkette vor JEDEM Push

1. **esbuild-Syntaxcheck** je Datei
2. **`tsc --noEmit`** in einer nachgestellten Prüf-Umgebung mit Stubs für zu große
   Nachbardateien
3. **`node --test`** für jede reine Logik-Datei
4. **Gegenprobe:** absichtlich einen Fehler einbauen und sehen, dass die Prüfung
   anschlägt. Schlägt sie nicht an, ist der Test wertlos.

### Fallen, die uns schon erwischt haben

- **Dateien zählen, eindeutig.** Nach jedem Push die Zeile „N files changed" gegen
  die Zahl im `git add` halten. **Nie eine Spanne nennen** („1 oder 2, beides ist
  richtig") — dadurch lag eine Datei tagelang unbemerkt außerhalb des Repos.
- **Umlaute:** Quelltext-Kommentare dürfen `ae/oe/ue`, **sichtbarer Kundentext
  niemals.** Ist dreimal passiert.
- **Ein Test darf nie über die Liste laufen, die er prüfen soll** — sonst schrumpft
  er stillschweigend mit. Zählungen nur in der jeweils neuesten Testdatei.
- **Constraint ≠ Index:** `alter table … drop constraint if exists …`
- **Storage-Tabellen sind gesperrt** (`42501`) — Buckets nur über die Oberfläche.
- **Views umgehen RLS** — brauchen `security_invoker = on` UND Betriebsfilter.
- **`tsc` fängt einen fehlenden Besitzer-Filter NICHT.** Die Supabase-Kette ist zu
  locker typisiert. Bei Service-Rollen-Abfragen jede Zeile von Hand prüfen.
- **Transienter Vercel-Font-Fehler** ist nicht der Code. Fix:
  `git commit --allow-empty -m "Rebuild" && git push`

### Lieferweg

Datei frisch stagen → im Container bearbeiten → Prüfkette grün → ins Repo
schreiben → **EIN** CMD-Block für mich:

```
chcp 65001 >nul && cd /d "C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website" && git add <dateien> && git commit -m "…" && git push
```

Repo: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
(`.git` liegt in `gaspar-ai-system`). Klammer-Pfade brauchen `:(literal)`.

## 2) Technik & Marke

Next.js 16 App Router, React 19, TypeScript `strict`, ES2017, Vercel Production
(argonaut-os.com), Supabase (Postgres + RLS, Helfer `mein_chef_id()`), Resend,
Gotenberg (VPS) für PDF, Anthropic Batch-API für Massenläufe (halber Preis).

Marke: Navy `#0A1628`, Navy2 `#0F2036`, Gold `#C9A84C`, Cyan `#00e5ff`,
Grün `#4CAF7D`; DM Sans + Syne.

- **RLS-Muster:** `<x>_select` (auth.uid() = owner_user_id), `<x>_select_ma`
  (owner_user_id = mein_chef_id()), `_insert`, `_update`, `_delete`
- **Navigation und Rechte:** eine Quelle `lib/rechte.ts` (NAV_LINKS, 113 Module)
- **Einfach/Voll:** `import { NurVoll } from '../_components/Ansicht'` — nur
  optionale Experten-Felder, NIEMALS Hauptfeld, Geld-/Steuerfelder oder Buttons
- **`kiFetch(route, options)`** aus `lib/ki.ts` — Drop-in mit Kostenprotokoll und
  Rate-Limit

## 3) Stand

**302 Node-Tests grün. 13 Crons laufen.** Alles Gebaute ist in Production.

Der vollständige Fahrplan steht in **`docs/ARGONAUT-MASTER-FAHRPLAN.md`** mit der
Zählung **M1–M18** und Status je Punkt (✅ / ⚠️ / ⬜ / 🔒). Dazu:
`docs/ARGONAUT-UEBERGABE-NACH-URLAUB.md` für den Einstieg.

**Acht Social-Kanäle sind direkt bespielbar:** Facebook, Instagram, Google
Unternehmensprofil, LinkedIn, Mastodon, Bluesky, Telegram, Threads.

**Der kritischste Codepunkt:** `app/api/cron/reports-versand/route.ts` liest mit
der Service-Rolle und umgeht RLS. Jede Abfrage MUSS `.eq('owner_user_id', …)`
tragen. Dasselbe in `app/api/marketing/social-protokoll/route.ts` und
`app/api/cron/social-posten/route.ts`.

## 4) Die drei harten Blocker (kein Code)

1. **AVV nach Art. 28 DSGVO** — Anwalt, ~3 Wochen. Blockiert die Bestellstrecke
   und jeden Kundenbetrieb.
2. **Resend auf Pro** — 5 Minuten. Danach `MAIL_TAGESBUDGET` in Vercel auf das
   echte Tageskontingent setzen, dann wächst der Post-Deckel mit.
3. **Stripe prüfen** — die drei Schlüssel liegen seit 05.05. in Vercel.

## 5) Womit wir weitermachen

**Der Testtag (M18) steht an — jedes Modul einzeln, nicht nur eine Auswahl.**
Rund 300 Node-Tests sind eine Sache, ein Mensch am Knopf eine andere. Keine der
neuen Oberflächen wurde je im Browser bedient.

Zwei Dinge liegen daneben bereit und sind klein:
- **Avatar Stufe 3** — den KI-Guide ins Dashboard-**Layout** hängen statt auf eine
  Seite, damit er von Modul zu Modul mitwandert. Ein Push, kein SQL.
- **Die 1528 Texte bestellen** — vier Knöpfe unter `/admin/inhalte`, zusammen
  2,40 USD. Landet als Entwurf; ohne Haken erscheint nichts.

**Fang so an:** Bestätige in zwei Sätzen den Stand, lies
`docs/ARGONAUT-MASTER-FAHRPLAN.md`, und schlag mir vor, womit wir loslegen.
