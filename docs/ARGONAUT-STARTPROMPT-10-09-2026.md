# ARGONAUT OS — Startprompt für den 10.09.2026

*Diesen Text komplett in den neuen Chat kopieren.*

---

Ich bin Martin Gaspar, Gründer von ARGONAUT OS. Wir bauen heute weiter.

**Repo:** `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
**Supabase:** Projekt `znrjnndfzzydnhbyntwa`

## Lies zuerst

1. `docs/ARGONAUT-Tagesabschluss-09-09-2026.pdf` — der aktuelle Stand
2. `docs/ARGONAUT-BAULISTE-AKTUELL.md` — die alte Bauliste vom 08.09.

**Wichtig:** Wo die Bauliste vom Code abweicht, gilt der Code. Am 09.09. stimmte sie an vier Stellen nicht mit dem Repo überein. **Kontrollier jede Datei erst am echten Code, bevor du etwas baust** — frisch vom Gerät stagen, hinschauen, und mir ehrlich sagen, wenn etwas schon existiert oder anders ist als gedacht.

## Wo wir stehen

Gestern fertig geworden: **1.1, 3.1, 3.2, G1, G2** — und **G3 zu zwei Dritteln** (13 Pushes, 3 SQL, alles live und grün, 155 Tests).

Der öffentliche KI-Berater kann seit gestern ein Gespräch führen, sich merken was er erfahren hat, einen Lead im CRM anlegen und den Besucher auf die echte Buchungsseite schicken — mit allem schon ausgefüllt.

**Offen: 17 Punkte · 9 SQL · 23 Pushes.** Davon 8 Punkte sofort baubar, ohne auf irgendwen zu warten.

## Womit wir heute anfangen

### Schritt 1 — eine kleine Korrektur (5 Minuten)

In `lib/einrichtung.ts` steht der Punkt `mail_absender` („E-Mail-Absender verifiziert") als Punkt **je Betrieb**. Das ist falsch, solange alle Kunden über dieselbe Resend-Adresse versenden. Bis D6 gebaut ist, gehört er einmalig auf die Systeme-Seite, nicht in jede Kundenakte.

Entweder ganz raus, oder — besser — als `geplant: true` markieren mit dem Hinweis „wird ein Punkt je Betrieb, sobald D6 steht". Dann verschwindet er aus der Arbeitsliste, bleibt aber sichtbar.

### Schritt 2 — G3 Push 4: die Betriebs-Akte

Das war meine Ansage von gestern: Im Command Center will ich **einen Kunden anklicken und alles sehen, was zu tun ist**. Die ganzen Zugänge — WhatsApp, Meta, Mail, später Bank — mache ich, nicht der Kunde. Der Handwerker versteht das nicht, und dafür werden wir bezahlt.

Zu bauen unter `/admin/command-center/betrieb/[id]`:

- **Die Einrichtungs-Checkliste** aus `lib/einrichtung.ts` — die Logik steht schon, node-getestet. Die Route muss nur die Ist-Zustände aus der Datenbank sammeln und als `Bestand` hereinreichen.
- **Der Setter-Reiter** — Rolle, Ziel, Fragen, Übergabe-Regel, Buchungs-Slug. Die acht Gesprächs-Vorlagen aus `lib/setterVorlagen.ts` als Startpunkt, danach von Hand anpassbar. Tabelle: `dialog_einstellung` (Spalten: `id, owner_user_id, kanal, rolle, ziel, fragen, uebergabe_bei, buchung_slug, aktiv, erstellt_am, aktualisiert_am`).
- **Die zwei Grenzen sichtbar machen** — kein erfundener Preis, nie behaupten ein Mensch zu sein. Beides ist in `baueSetterSystemtext()` fest verdrahtet und nicht abschaltbar; die Seite zeigt es nur.
- **Zwei Kacheln nachziehen** im Raster von `app/admin/command-center/page.tsx`: „Betriebe einrichten" (neu) und **„WhatsApp"** — die Seite von G2 ist dort bisher gar nicht verlinkt, nur per Direkt-URL erreichbar.

Muster für den Betreiber-Endpunkt: `app/api/admin/whatsapp-eingang/route.ts` — zwei Schlösser (`profiles.role === 'admin'` **und** `ANALYSE_BETREIBER_ID`), streng, kein Durchlassen bei fehlender Umgebungsvariable.
Muster für die Seite: `app/admin/command-center/whatsapp/page.tsx`.

### Danach, in dieser Reihenfolge

**1.3** Stammdaten-Prüfung ins Onboarding vorziehen — die Datei liegt in `app/dashboard/_components/stammdatenPruefung.ts` (nicht in `lib/`, die Bauliste sagt es nicht dazu).
**2.3** Guide klappt nach 45 Sekunden Stillstand einmal von selbst auf — geprüft, ist noch nicht drin.
**6.1** Preisrechner gegen Kopfpreis-Anbieter — halber Tag, stärkstes Verkaufsargument.

## Wie ich arbeite

- **Auf Deutsch**, Schritt für Schritt, alles copy-paste-fertig.
- **Niemals PowerShell — immer CMD**, mit `chcp 65001` für Umlaute.
- **Blockweise:** erst das komplette SQL in EINEM Block, danach die Pushes einzeln nacheinander. Nicht auf „erledigt" warten, sondern der Reihe nach liefern.
- **SQL immer direkt in den Chat schreiben**, vollständig, auch wenn es lang wird — nie nur auf eine Datei im Repo verweisen. SQL immer additiv und idempotent (`IF NOT EXISTS`), nie destruktiv.
- **Du schreibst die Dateien selbst** über die Bridge ins Repo. Für mich bleiben zwei Copy-paste-Aktionen: der SQL-Block und ein CMD-Block, der prüft und nur bei Grün committet.
- **Ein Push darf mehrere Dateien enthalten** — was zusammengehört, kommt zusammen. Gezielter `git add <datei>`, nie `git add .`.
- **Freie Hand:** Wenn du eine klare Empfehlung hast, bau sie sofort und liefer den fertigen Push-Block. Nicht auf ein separates „los" warten.
- **Fragen stellst du, sobald sie relevant sind** — nicht vorher, nicht auf Vorrat.
- Ich bin **Perfektionist**. Technisches Niveau: Anfänger bis Mittel. Erklär mir das Warum, nicht nur das Was.

## Die Prüf-Kette vor jedem Push — nicht verhandelbar

1. **esbuild-Syntaxcheck** über alle geänderten Dateien
2. **`tsc --noEmit`** in der Prüf-Umgebung mit Stubs
3. **`node --test`** für alle reinen Logik-Dateien
4. **Gegenprobe:** absichtlich einen Typfehler einbauen, prüfen ob der Prüfer ihn findet, zurücksetzen

Der vierte Schritt hat sich gestern zweimal bezahlt gemacht. Einmal lief `tsc` gegen ein veraltetes `out/` und meldete grün, obwohl nichts geprüft wurde. Einmal deckte die `tsconfig`-Lücke API-Routen gar nicht ab.

**Bei mir im CMD-Block:** `npx tsc --noEmit && npx next build` — beides, nicht nur `tsc`. Danach Vercel-Check.

## Konventionen

- **Kundentexte immer mit „Sie".** Nie „KI-Agenten" oder „KI-Crew" — das Wort heißt **„Bausteine"**.
- **Deutsche Anführungszeichen** im Code: `„Text"` mit dem richtigen schließenden Zeichen. Ein ASCII-Zeichen beendet sonst das String-Literal.
- **RLS-Regeln mit Präfix** nach bestehendem Muster (`abs_*`, `lbw_*`, `wan_*`, `dse_*`).
- **Kern-Geld-Formulare** (Rechnung/Angebot), Zahlungs- und Bank-Integrationen sowie alles rund um Auth/Login nur gemeinsam und abgesegnet — nie unbeaufsichtigt.
- **Vor der Kompaktierung** sag mir rechtzeitig Bescheid, damit ich frisch weitermachen kann.

## Entscheidungen, die noch bei mir liegen

Frag mich danach, sobald sie relevant werden — nicht alle auf einmal:

1. **Sehen Mitarbeiter die Anfragen?** Auf `leads` liegt nur eine Besitzer-Regel. Heute sieht ausschließlich der Chef. Absicht oder Lücke? (1 SQL, oder Punkt streichen)
2. **Duzt oder siezt der Mitarbeiterbereich?** Kundentexte siezen; intern ist es nie festgelegt worden.
3. **`beleg-upload` nachziehen?** Der lässt durch, wenn `ANALYSE_BETREIBER_ID` *nicht* gesetzt ist. Bei den neuen Betreiber-Endpunkten ist es bewusst strenger.
4. **B8 Kleinkram** — hängt an drei Entscheidungen.
5. **Fahrzeugakte** — null Schreibvorgänge, zeigt nur an. Ausbauen oder streichen?

## Zwei Listen, die ich noch will (nicht heute früh)

- **Liste A:** Was ich je Kunde einstellen muss, inklusive Verhältnis zum bestehenden Stack. *Teilweise erledigt* — `lib/einrichtung.ts` ist genau das, als Funktion statt als Dokument. Fehlt noch: die Punkte, die nicht je Betrieb gelten (Resend, Meta-App, Stripe).
- **Liste B:** Wo eine KI dem Kunden Wording und Texte für seine Bots erzeugen kann.

## Was auf mich wartet, nicht auf dich

`A1` Resend auf Pro (5 Min, schaltet D6 frei) · `A3` Anwaltspaket · `A4` Stripe prüfen · `A5` SEPA-Weg · `M18` Testtag · Aufnahmen für Stimme und Gesicht · Konten für Social · Partnervertrag für Telefonie.

---

**Fang an mit:** die drei Dokumente lesen, dann Schritt 1 (die Korrektur in `lib/einrichtung.ts`), dann G3 Push 4. Sag mir vorher kurz, was du im Repo vorgefunden hast — besonders, wo es von diesem Prompt abweicht.
