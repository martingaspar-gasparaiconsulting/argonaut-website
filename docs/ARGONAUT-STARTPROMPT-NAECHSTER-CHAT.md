# Startprompt für den nächsten Chat

Alles ab der Linie kopieren und als erste Nachricht in den neuen Chat einfügen.

---

Ich bin Martin Gaspar, Gründer von ARGONAUT OS — einem KI-Betriebssystem für den deutschen
Mittelstand. Wir bauen gemeinsam weiter. Bitte lies zuerst die Übergabe, dann fangen wir an.

**Repo:** `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
(Next.js 16 / React 19 / Supabase / Vercel — Supabase-Projekt `znrjnndfzzydnhbyntwa`)

**Lies als Erstes diese zwei Dateien vollständig, bevor du irgendetwas vorschlägst:**

1. `docs/ARGONAUT-UEBERGABE-08-09-2026.md` — der komplette Stand: Arbeitsregeln, die
   technischen Fallen (teuer gelernt), was am 08.09. gebaut wurde, Markt und Preise,
   der Avatar, die gefundenen Lücken.
2. `docs/ARGONAUT-BAULISTE-AKTUELL.md` — die 22 Punkte, die noch zu bauen sind, mit
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
  Das hat sich am 08.09. **vier Mal** bezahlt gemacht — jeder der vier Punkte war ein
  anderes Problem als auf der Liste stand.
- **Prüf-Kette vor jedem Push:** esbuild-Syntaxcheck + `tsc --noEmit` in der Stub-Umgebung +
  `node --test` für reine Logik-Dateien + Gegenprobe mit absichtlichem Typfehler.
  Vor jedem Push zusätzlich `npx next build`.
- **Gezielter `git add <datei>`**, nie `git add .`. Ein Push darf mehrere Dateien enthalten.
- **SAFETY-FIRST + ADDITIV:** idempotentes SQL (IF NOT EXISTS), nie destruktiv, aktiv warnen
  wenn etwas destruktiv wäre.
- **GEMEINSAM-Regel:** Kern-Geld-Formulare (Rechnung/Angebot), Zahlungs- und
  Bank-Integrationen und alles rund um Auth/Login nur gemeinsam und abgesegnet.
- **FREIE HAND:** Wenn du eine klare Empfehlung hast, bau sie sofort (Dateien über die
  Brücke ins Repo schreiben) und liefere nur den fertigen CMD-Push-Block. SQL und
  git add/commit/push mache ich selbst.
- Gib mir eine **kurze Vorwarnung, bevor der Kontext knapp wird**, damit ich rechtzeitig
  einen frischen Chat starten kann.

## Womit wir anfangen

1. Frag mich, ob ich die zehn Minuten Browser-Prüfung erledigt habe (B9 mit und ohne Haken;
   beide EÜR-Seiten vergleichen). Falls nicht: das zuerst.
2. Hol dir meine zwei offenen Entscheidungen: **Sehen Mitarbeiter die Anfragen?** und
   **bauen wir die Empfehlungen aus Gruppe 6?**
3. Dann Gruppe 1 der Bauliste — die zwei Textkorrekturen sind vor dem ersten echten Kunden fällig.

Bestätige mir kurz, was du aus den beiden Dateien verstanden hast, und nenne mir die drei
technischen Fallen, die dort stehen. Dann legen wir los.
