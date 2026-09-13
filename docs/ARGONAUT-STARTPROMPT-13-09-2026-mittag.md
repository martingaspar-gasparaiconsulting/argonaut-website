# ARGONAUT OS · Startprompt für den nächsten Chat

**Stand: Sonntag, 13. September 2026, mittags** — löst den Startprompt vom Morgen des 13.09. ab.

Ich bin Martin Gaspar, Gründer von ARGONAUT OS — ein KI-Betriebssystem für den deutschen Mittelstand. Wir arbeiten weiter daran.

---

## NEU seit heute: Es gibt Skills

Seit dem 13.09. liegen fünf **Skills** in meinem Claude-Konto. Sie greifen in jedem Chat automatisch — du musst sie nicht aufrufen, und vieles, was früher in diesem Startprompt stehen musste, steht jetzt dort:

| Skill | regelt |
|---|---|
| `argonaut-chatstart` | Startritual: **die zwei Ordnerpfade**, Startprompt lesen, Stand holen |
| `argonaut-push` | Prüf-Kette, SQL-Regeln, CMD-Block-Format, freie Hand, GEMEINSAM-Regel |
| `argonaut-branchenmodul` | Bauplan für neue Module: lib + tests + route + page + Kachel |
| `argonaut-content` | Ton und Regeln für alles, was nach außen geht |
| `argonaut-recht` | UWG, DSGVO, AI Act, GoBD + Pflege der Anwaltsliste |

**Wichtig zur Einordnung:** Skills liegen in meinem Claude-Konto und steuern, wie Claude arbeitet. Sie sind **nicht** im ARGONAUT-Code und verändern das Produkt nicht.

Daraus entstand eine **Produktidee**, die noch nicht entschieden ist: ein ARGONAUT-Modul „Arbeitsanweisungen", in dem ein Betrieb einmal seine Regeln hinterlegt (Anrede, Ton, Preisuntergrenzen, Freigaben, Nachfass-Rhythmus) und alle Bausteine sie automatisch ziehen — je Branche vorbelegt aus den vorhandenen 698 Branchendatensätzen. Gehört als eigener Punkt in die Bauliste, nicht dazwischengeschoben.

---

## Das Erste, was du tun musst

**Fordere die beiden Ordner an** (`argonaut-chatstart` kennt die Pfade):

1. `C:\Users\Admin\Desktop\gaspar-ai-system` — nur der Dachordner (ANWALT-RECHT, core, modules)
2. `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` — **das Repo**

Der zweite ist der Bezugspunkt für allen Code. Die Datei-Brücke schafft nur sieben Ordnerebenen ab dem freigegebenen Ordner — ab dem Dachordner sind tiefe Pfade unerreichbar.

* Supabase-Projekt: `znrjnndfzzydnhbyntwa`
* Live: Vercel, Branch `main`, jeder Push deployt automatisch

## Die Checkliste

Angeheftetes Artifact **„ARGONAUT Bautag"**, 36 Punkte:
`https://claude.ai/code/artifact/6a692f72-7b7c-4438-a754-3a37959a0fd7`

**Zum Ändern IMMER erst mit `action: "read"` und dieser URL lesen, dann mit `url` publizieren** — nie ohne, sonst entsteht ein zweites Artifact.

---

# Was am 13.09. vormittags fertig wurde

## 🔴 Churn-Lock repariert — Commit `60f39d3`, live

Die Regel `churned_eigene_email_lesen` war seit dem 12.09. bereits in der Datenbank (per SQL bestätigt: `for select`, `lower(email) = lower(auth.jwt() ->> 'email')`). Offen war nur der Code.

Geändert in `app/auth/callback/route.ts`:

* **`.eq('email', user.email)` entfernt** — die RLS-Regel filtert bereits, und zwar ohne Rücksicht auf Groß-/Kleinschreibung. Ein eigener `eq` war strenger als die Regel und hätte „Max@Firma.de" gegen „max@firma.de" durchgelassen.
* **`.single()` → `.limit(1)`** plus Längenprüfung. `.single()` wirft bei null UND bei mehr als einer Zeile — ein Doppeleintrag hätte die Sperre still ausgehebelt.
* **`error` wird nicht mehr verschluckt**, sondern als `[churn-lock]` in die Vercel-Logs protokolliert.

Bewusst so: Fällt die Abfrage aus, kommt der Nutzer durch, statt dass niemand mehr hereinkommt. Im Code steht als Kommentar, dass wer die Regel ändert die Sperre aushebelt.

**Offen für den Testtag:** mit einer echten gekündigten Test-E-Mail gegenprüfen. Grüner Build beweist hier nichts.

## 3.6 Rechnungs-PDF — war längst fertig

`app/api/rechnung-pdf/route.ts` nutzt `baueMarke` seit dem **08.09.** (Zeile 7 Import, Zeile 91 Aufruf). Die Bautag-Liste hatte die Richtung verdreht: Laut Kopfkommentar von `lib/markeCi.ts` trug die **Rechnung** die Marke zuerst (seit 11.08.), Angebot, Mahnung und Auftragsbestätigung zogen am 04.09. nach. Die Rechnung war nur die letzte ohne den Missbrauchs-Schutz.

Rest, rein kosmetisch und nicht gebaut: zwei feste `#0A1628` (Überschrift `h1` und `.paybtn`), die beim Angebot in Markenfarbe stehen. Die übrigen fünf festen Navy-Werte sind Absicht — Markenfarbe als Fließtext wäre bei einer hellen Marke unlesbar.

## N3 Werkstatt für Mitarbeiter — Commit `a044785`

**Entscheidung:** sehen JA · mitarbeiten JA · löschen NEIN.

**Teil 1, SQL:** 22 neue `_ma`-Regeln nach dem Muster `owner_user_id = mein_chef_id()`. Gegenprobe bestanden — bei `MITARBEITER` steht nirgends `DELETE`.

**Es sind ACHT werkstatt_*-Tabellen, nicht vier:** fahrzeuge · fahrzeug_halter_log · auftraege · positionen · material_buchungen · anhaenge (je select/insert/update) sowie status_log · freigabe_log (nur select/insert — Logs haben auch beim Chef kein update).

**Teil 2, SQL:** `grant execute on function public.mein_chef_id() to authenticated` — der Browser ruft die Funktion jetzt direkt auf.

**Teil 3, Code** — und das war ein **älterer Fehler, den N3 erst aufgedeckt hat:**
`werkstatt/page.tsx` setzte an fünf Stellen und `fahrzeugakte/page.tsx` an einer `owner_user_id: uid` aus `supabase.auth.getUser()` — also die Kennung der **eintippenden Person**. Ein Mitarbeiter hätte Datensätze angelegt, die ihm gehören und die der Chef nie wieder sieht.

Fix: Beide Seiten holen beim Laden `supabase.rpc('mein_chef_id')` in einen neuen State `besitzer` und schreiben `owner_user_id: besitzer ?? uid`.

**Bewusst unverändert:** `geaendert_von: uid` im status_log (wer geändert hat, ist die Person, nicht der Betrieb) und der Insert in `buchungen` (andere Tabelle, keine `_ma`-Regel — steht als Andockpunkt-Kommentar in der Datei).

---

# Wissen, das heute dazukam

## mein_chef_id()

```sql
select owner_user_id from public.mitarbeiter
where auth_user_id = auth.uid() limit 1;
```

STABLE, SECURITY DEFINER. **Gibt für einen CHEF null zurück**, weil er keinen Mitarbeiter-Datensatz hat — die `_ma`-Regeln greifen für ihn deshalb nie, er läuft über seine eigenen. Im Supabase-Editor liefert sie ebenfalls null, weil dort niemand angemeldet ist. Das ist kein Fehler.

## owner_user_id — wer setzt was

* Standardwert `auth.uid()`: nur `auftraege` und `werkstatt_freigabe_log`
* **Kein** Standardwert: `leads` und die übrigen sieben `werkstatt_*`
* `auftraege/page.tsx` und `leads/LeadsClient.tsx` setzen `owner_user_id` **gar nicht** selbst — die Werkstatt war eine der wenigen Seiten, die es tat

Ein Standardwert hätte den Werkstatt-Fehler nicht behoben: Er greift nur, wenn der Code die Spalte weglässt.

## Die Navigation war nie das Problem

`lib/rechte.ts` führt „🔨 Werkstatt" (Zeile 152) und „📇 Fahrzeugakte" (Zeile 154) bereits **ohne** `nurChef` und **ohne** `sensibel`. Der Chef muss dem Mitarbeiter unter `/dashboard/rechte` nur das Modul freigeben.

## VS Code und die Datei-Brücke

**Regel:** In VS Code darf kein Tab einen gefüllten Punkt (= ungespeicherte Änderung) haben, während Claude Dateien schreibt — sonst überschreibt späteres Speichern die Arbeit lautlos.

Am 13.09. zeigte VS Code 55 „Probleme", darunter „Cannot find name 'require'". `git diff` war leer und `npx tsc --noEmit` grün: alles Editor-Rauschen, kein Codefehler. **Der Compiler entscheidet, nicht die Editor-Anzeige.**

Technisch: `device_commit_files` nimmt nur Pfade unter `/mnt/user-data/outputs/` an, nicht den uploads-Pfad von `device_stage_files`.

## Neun Mal in einer Woche

Neun Punkte haben sich beim Nachsehen als schon gebaut herausgestellt (1.2, 1.3, 3.2, 3.5, 3.6, 3.7, 3.8, 2.6, 2.9). **Immer erst am echten Code und an der echten Datenbank prüfen**, nie der Liste glauben — und ehrlich sagen, wenn etwas schon da ist.

---

# Block F — die Entscheidungen vom 13.09.

| | Frage | Entschieden |
|---|---|---|
| N3 | Mitarbeiter und Werkstatt | **Ja**, über `mein_chef_id()`, kein Löschrecht — umgesetzt |
| N2 | Bleibt `app/admin/*` geduzt | **Ja, so lassen.** 40 Textstellen ohne Nutzen anzufassen sind 40 Gelegenheiten, etwas kaputtzumachen |
| N1 | „Guten Morgen, Martin." | **So lassen.** Vorname plus Sie ist im Mittelstand üblich |
| 2.5 | Avatar Stufe 4 | **Nein**, Gerätestimme bleibt. Kostet je Minute und bräuchte einen weiteren AVV |

**Noch offen in Block F:** 2.3 Beachhead-Branche (Vertrieb) · 2.4 Telefonie-Partner Retell oder Vapi (Vertragsfrage, M7).

---

# Womit wir weitermachen

1. **3.3 B8 Kleinkram-Rest** — jetzt frei, weil Block F beantwortet ist. Connector-SQL für Demo-Konten, Brand-Story, Trust-Layer.
2. Danach Block K, die großen Brocken: 3.10 Aktivitäten-Cockpit · 3.11 Freebie-Baukasten · 3.13 Webinar-Baustein · 3.12 Diktat · 3.15 Marketing-Tiefe.
3. Die Klicktests (Block B und C) und der Testtag (Block J) macht Martin selbst.

**Blockiert bis zum Anwalttermin (1.1):** 1.4 AVV · 3.16 DSGVO-Lücke · 3.9 Steuerberater-Zugang · 3.17 Steuerberater-Netzwerk · die Bestellstrecke.

---

# Wie ich geführt werden will

Steht ausführlich im Skill `argonaut-push`. Das Wichtigste:

* Deutsch. Schritt für Schritt. Alles copy-paste-fertig.
* **Niemals PowerShell — immer CMD**, mit `chcp 65001` für Umlaute.
* Technisches Niveau Anfänger bis Mittel. Ich bin Perfektionist — erklär mir das **Warum**, nicht nur das Was.
* **Entscheidungsmodus:** Bei klarer Empfehlung sofort bauen und den fertigen Push-Block hinlegen. Ich melde mich nur, wenn ich etwas anderes will. SQL und Push mache ich selbst.
* **Blockweise:** pro Block zuerst das komplette SQL in EINEM Block, danach die Pushes nacheinander.
* Gezieltes `git add <datei>`, **niemals `git add .`**
* Sag mir ehrlich, wenn etwas schon existiert oder anders ist als gedacht.
* Wenn der Kontext knapp wird, sag es frühzeitig.

# Grenzen, die fest stehen

* **GEMEINSAM-Regel:** Rechnung und Angebot, Zahlungs- und Bank-Integrationen, alles rund um Auth/Login — nur gemeinsam und abgesegnet.
* **SAFETY-FIRST und ADDITIV:** SQL idempotent, nie destruktiv. Warne mich aktiv, wenn etwas Daten vernichten würde.
* SQL-Blöcke immer vollständig in den Chat **und** als Datei in `supabase-sql/`.
* Nutzungsmessung nie auf Mitarbeiterebene (§ 87 Abs. 1 Nr. 6 BetrVG greift schon bei Eignung).
* Kein Massenversand über Kundenpostfächer. Bis 5 Empfänger SMTP, darüber Resend.
* Kundentexte siezen, Mitarbeitertexte anredefrei. Nie „KI-Agenten"/„KI-Crew" — es heißt **„Bausteine"**.
* **FLYER-Regel:** nie Mitbewerber beim Namen nennen — „führende Mitbewerber".
* **Guardrail:** Unternehmerfrühstück, BNI und der 15. Juni sind abgeschlossen — nie mehr als Ziel nennen.

# Was bewusst nicht gebaut wird

Talent-Marktplatz · ARGONAUT Universum · alte Agenten-Seite · Bestellstrecke vorziehen (erst ab rund 100 Kunden) · Gruppe 6 Empfehlungen · 6.1 Preisrechner.
