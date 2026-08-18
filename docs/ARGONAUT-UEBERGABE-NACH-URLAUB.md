# ARGONAUT OS — Übergabe für die Rückkehr (Stand 18.08.2026)

Martin ist zehn Tage weg. Diese Datei ist der Einstieg danach — sie ersetzt die
Übergabe vom 16.08. für alles, was seither passiert ist.

**Wer immer hier weitermacht: erst lesen, dann Abschnitt 6 abarbeiten.**

---

## 1) Arbeitsweise (unverändert gültig)

Es gilt weiterhin alles aus `docs/ARGONAUT-UEBERGABE-GROSSE-BROECKEN.md`,
Abschnitt 1. Die wichtigsten Punkte in Kurzform:

- **Deutsch**, alles copy-paste-fertig, Schritt für Schritt. **Niemals PowerShell — immer CMD.**
- **SQL immer vollständig in den Chat**, nie nur als Dateiverweis.
- **Blockweise**: erst das komplette SQL, dann die Pushes einzeln. Nicht auf
  „erledigt" warten — der Reihe nach liefern.
- **Ein Push darf mehrere Dateien enthalten.** Was zusammengehört, kommt zusammen.
- **Kontrollieren vor bauen**: jede Datei zuerst frisch vom Gerät stagen.
- **esbuild + tsc + Node-Tests vor jedem Push**, jeweils mit **Gegenprobe**
  (absichtlich einen Fehler einbauen und sehen, dass die Prüfung anschlägt).
- **SQL additiv und idempotent.** Bestehendes nie umbauen.
- **„Sie" in allen Kundentexten.** Nie „KI-Agenten" oder „KI-Crew" — es heißt **Bausteine**.
- **GEMEINSAM-Regel**: Kern-Geld-Formulare, Zahlungs-/Bank-Integrationen und
  alles rund um Auth/Login nur gemeinsam und abgesegnet.

### Zwei Regeln, die am 17./18.08. dazugekommen sind

**Dateien zählen.** Nach jedem `device_commit_files` die Zahl der geschriebenen
Dateien mit der Zahl im `git add`-Befehl vergleichen. Am 17.08. sind zwei von
vier Dateien nicht im Repo gelandet, und der Commit meldete nur „2 files
changed" — Martin hat es gemerkt, nicht die Prüfkette. Die Zeile
**„N files changed"** in der Git-Ausgabe ist die beste Kontrolle.

**Umlaute in Kundentexten.** Quelltext-Kommentare dürfen `ae/oe/ue` schreiben,
**sichtbarer Text niemals**. Das ist zweimal passiert (E-Book-Inhaltsverzeichnis,
Formular-Hinweis) und beide Male erst im Probedruck aufgefallen.

---

## 2) Was am 17./18.08. gebaut wurde — alles in Production

| Commit | Was |
|---|---|
| `c7e71f6` | Inhalts-Werkstatt Push 1 — Logik der Bausteine, Wording „KI-Crew" raus |
| `df6dd47` | Push 2 — Erzeugung über die Batch-API, Wording-Wächter, Abhol-Zweig |
| `897bd24` | Push 3 — Redaktion unter `/admin/inhalte`, Kachel im Command Center |
| `0166ba2` | Push 4 — E-Book bauen und ausliefern, Dossier-Wording auf `eb5` |
| `ea9b0f7` + `9e840a0` | Freebie auf der Vergleichsseite, `DossierFreebie` nach `components/`, Duz-Betreff raus |
| `0c0410e` | AGB- und Einwilligungs-Häkchen aus den Anfrageformularen |
| `fd50dc4` | Ernte-Lager-Zuordnung über gewählten Artikel statt Namensvergleich |
| `9c1c375` | Eigene Felder für Leads |
| `89a5ddd` | Gespeicherte Auswertungen im Report-Baukasten |
| `fc9b91a` | 698 Branchen-Vorworte und 698 KI-Dialoge, Stapel je Typ |
| `7a8c884` | Geplante Auswertungen per Mail, täglicher Cron |
| (offen) | Dokument-Details mit eigenen Feldern |

**SQL eingespielt:** Bucket `ebooks`, Spalte `ernte_ernte.artikel_id` mit
Fremdschlüssel, Tabelle `report_gespeichert`.

**Node-Tests: 176 grün** (vorher rund 690 im Gesamtsystem, die neuen kommen dazu).

---

## 3) Vier Annahmen der alten Übergabe, die sich als falsch erwiesen haben

Das ist der wichtigste Abschnitt für die Planung — **die Restliste ist kürzer,
als sie aussieht.**

**Block E (KI-Deckel) war längst gebaut.** `lib/ki.ts` hat die dreistufige
Bremse aus AGB § 9.3 bereits: Warnung ab 70 % des Firmen-Topfs, stiller Puffer
bis zum Doppelten, dann harte Sperre mit HTTP 429. Ein Push und ein SQL weniger.

**`CRON_SECRET` war seit dem 3. August gesetzt.** Die Sorge „kein Cron läuft"
war unbegründet. Alle zwölf (jetzt dreizehn) Crons laufen.

**Block F war zu 90 % nicht das, was in der Liste stand.** Von sieben Seiten für
„eigene Felder nachziehen" hatten drei es schon (`kfz`, `foerdermittel`,
`ernte`), drei sind fachlich fragwürdig (Kasse ist GoBD/TSE-relevant, Mahnwesen
ist abgeleitet, Academy-Kurse sind global), und die Fahrzeugakte hat **null
Schreibvorgänge** — sie zeigt nur an. Übrig blieben Leads und Dokumente.

**Der Report-Baukasten konnte weder speichern noch planen.** Beides ist jetzt da.

---

## 4) Drei Dinge, die während des Urlaubs von allein laufen

- **Die zwölf Crons** laufen weiter (Automationen, Dossier-Sequenz,
  Batch-Abholung alle 15 Minuten, ab jetzt auch der Report-Versand um 6 Uhr).
- **Die KI-Bremse** schützt vor Kostenexplosion, ohne dass jemand hinsieht.
- **Bestellte KI-Stapel** holen sich selbst ab. Ein Stapel, der nach 24 Stunden
  kein Ergebnis liefert, wird sauber als Fehler abgeschlossen statt ewig zu hängen.

**Was NICHT von allein läuft:** Resend steht weiter im Free-Tarif bei 100 Mails
am Tag. Wenn in den zehn Tagen viel über die Double-Opt-in-Strecke reinkommt,
ist das Kontingent irgendwann erreicht und Mails fallen aus.

---

## 5) Der kritischste Codepunkt im ganzen System

`app/api/cron/reports-versand/route.ts` liest mit der **Service-Rolle**, die RLS
vollständig umgeht. Jede Abfrage auf eine Quell-Tabelle **muss**
`.eq('owner_user_id', ...)` tragen.

**Die Gegenprobe hat gezeigt: `tsc` fängt das NICHT.** Der Filter lässt sich
entfernen und die Typprüfung bleibt grün, weil die Supabase-Kette zu locker
typisiert ist. Am 18.08. wurde am Schema geprüft, dass `rechnungen`, `angebote`,
`crm_deal` und `versand_sendung` alle `owner_user_id` als `uuid` tragen.

**Kommt je eine Quelle zu `QUELLEN` in `lib/reportBaukasten.ts` dazu, MUSS das
Besitzer-Feld vorher genauso geprüft werden.** Fehlt der Filter, bekommt ein
Kunde per Mail die Zahlen eines anderen — eine meldepflichtige Datenpanne, die
niemandem auffällt, weil die Zahlen plausibel aussehen.

---

## 6) HIER STARTEN nach dem Urlaub

### Zuerst: Der Testtag (Block L)

Die Prüfliste liegt als Artefakt „argonaut-testtag-pruefliste" bereit —
33 Punkte mit Klickweg, Soll-Ergebnis und Warnzeichen. **Rund 690 grüne Tests
sind eine Sache, ein Mensch der auf einen Knopf drückt eine andere.**
Keine der neuen Oberflächen wurde je im Browser bedient.

Reihenfolge: erst die drei Geldstellen (DSGVO-Löschung, Provisions-Gutschrift,
EÜR/DATEV), dann das Rechtesystem mit zwei Personen gleichzeitig.

### Dann: Was Vorlauf braucht

1. **Anwaltstermin** — der AVV nach Art. 28 DSGVO ist der harte Blocker.
   Rund drei Wochen. Ohne ihn darf kein Kunde ARGONAUT einsetzen.
2. **Resend auf Pro** — fünf Minuten, harter Blocker bei 100 Mails/Tag.
3. **Stripe prüfen** — die drei Schlüssel liegen seit dem 5. Mai in Vercel.
   Ungeprüft ist, was davon schon verdrahtet ist.

### Dann: Code

| Block | Pushes | SQL | Anmerkung |
|---|---|---|---|
| **G** Marketing-Tiefe | 4 | ~1 | ⚠ X/Twitter-API kostet ~100 USD/Monat |
| **I+** Absender-Domain je Kunde | 1 | 1 | erst nach Resend Pro |
| **J** Bestellstrecke | 2 | 0 | ⚠ ZWINGEND erst nach I **und** K |
| **M** Telefonassistent | 3 | ~1 | braucht Partnervertrag (Retell/Vapi) |
| **N** Avatar | 1–2 | 0 | `KiGuide` ist fertig, wird aber **nirgends eingesetzt** |
| **O** finAPI + ELSTER | 2 | ~1 | Martins Ansage: ganz zuletzt |
| Kleinkram | ~2 | 0 | Connector-SQL, Master-Fahrplan, Brand-Story |

**Zwei Blöcke dürfen nicht vorgezogen werden:** J braucht den AVV, M braucht den
Partnervertrag.

### Liegengeblieben, bewusst nicht gebaut

- **Landingpage: Branche vorbelegen** — `LP_KATEGORIEN` in `lib/landingpages.ts`
  ist definiert, aber **nirgends verwendet**; die Tabelle hat keine
  Kategorie-Spalte. Das ist ein Neubau (SQL + Editor + öffentliche Seite), kein
  Nachziehen. Nutzen greift erst, wenn Landingpages im Einsatz sind.
- **Eigene Felder an Fahrzeugen** — die Werkstatt hat ein Fahrzeug-Formular, aber
  auch schon `EigeneFelder` für `werkstatt_auftraege`. Ein zweites Modul in einer
  89-KB-Datei mit 1518 Zeilen ist viel Risiko für „Zusatzfeld am Fahrzeug".
- **Kasse, Mahnwesen, Academy** — eigene Felder dort sind fachlich falsch
  (GoBD-Unveränderbarkeit / abgeleiteter Vorgang / globale Datensätze).

---

## 7) Die Inhalts-Werkstatt — so wird sie benutzt

Command Center → **Inhalts-Werkstatt** (`/admin/inhalte`).

Vier Knöpfe, einer je Typ. Alles zusammen kostet **2,40 USD** über die
Stapel-Schnittstelle (halber Preis):

```
113× Modul-Kapitel        0,38 USD
 19× Kategorie-Kapitel    0,06 USD
698× Branchen-Vorwort     0,98 USD
698× KI-Dialog            0,98 USD
```

Jeder Typ geht als eigener Stapel — zusammen wären es 1528 und damit über der
Grenze von 1000 je Absendung. Was gerade unterwegs ist, wird kein zweites Mal
bestellt (die Route liest die `zuordnung` der laufenden Stapel).

Ergebnis kommt meist unter einer Stunde, spätestens nach 24 Stunden, und landet
als **Entwurf**. Ohne Haken erscheint nichts in einem E-Book. Beanstandete
Entwürfe stehen oben mit rotem Rand.

**Wenn der Ton nicht gefällt:** nicht einzeln redigieren. Den System-Prompt in
`lib/inhaltPrompt.ts` ändern, Entwürfe löschen, für weitere 2,40 USD neu
schreiben lassen. Das ist billiger als ein Abend Handarbeit.

---

## 8) Referenzen

- `docs/ARGONAUT-UEBERGABE-GROSSE-BROECKEN.md` — Themen 1–10 (14.08.)
- `docs/ARGONAUT-ABHAKLISTE.md` — 20 Abschnitte (09.08.)
- `docs/ARGONAUT-GESAMTLISTE.md` — enthält den Telefonassistenten (02.08.)
- `supabase-sql/` — alle eingespielten SQL-Dateien
- Artefakte in Cowork: „argonaut-abhakliste" und „argonaut-testtag-pruefliste"
