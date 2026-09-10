# ARGONAUT OS — Startprompt für den 11.09.2026

*Diesen Text komplett in den neuen Chat kopieren.*

---

Ich bin Martin Gaspar, Gründer von ARGONAUT OS. Wir bauen heute weiter.

**Repo:** `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`
**Supabase:** Projekt `znrjnndfzzydnhbyntwa`

## Lies zuerst

1. Diesen Text ganz
2. `docs/ARGONAUT-Tagesabschluss-09-09-2026.pdf` — der Stand von vorgestern
3. `docs/ARGONAUT-BAULISTE-AKTUELL.md` — die alte Bauliste vom 08.09.

**Wichtig:** Wo die Bauliste vom Code abweicht, gilt der Code. Sie hat gestern an **zwei weiteren Stellen** nicht gestimmt (unten unter „Funde"). **Kontrollier jede Datei erst am echten Code, bevor du etwas baust** — frisch vom Gerät stagen, hinschauen, und mir ehrlich sagen, wenn etwas schon existiert oder anders ist als gedacht. Das hat gestern zweimal einen ganzen Push gespart.

## Was am 10.09. fertig geworden ist

**Sechs Punkte, fünf Pushes, zwei SQL-Blöcke, alles live und grün.** Tests von 155 auf **187**.

| Punkt | Was | Commit |
|---|---|---|
| **G3 Push 4** | Betriebs-Akte im Command Center — damit ist **G3 fertig und der Dialog-Block G1–G3 komplett** | `8d5e9b1` (Vorgänger) |
| **E-Mail Push 1** | `nodemailer` + SMTP-Versand über das Kundenpostfach + Mailtext lesen | — |
| **E-Mail Push 2** | Posteingang: Nachricht öffnen, lesen, antworten | `8d5e9b1` |
| **1.3** | war **schon gebaut** — siehe Funde | — |
| **2.3** | Guide klappt nach 45 s Stillstand einmal von selbst auf | — |
| **6.4** | Nutzungsmessung + Auswertung im Command Center | `5639fc5` |

### Was das Neue kann

**Die Betriebs-Akte** (`/admin/command-center/betrieb/[id]`): Einen Kunden anklicken und alles sehen, was bei ihm offen ist — die Einrichtungs-Checkliste zieht ihren Stand aus der Datenbank, nicht aus Häkchen. Zweiter Reiter: der KI-Berater mit den acht Gesprächs-Vorlagen, Fragen, Übergabe-Stichworten und Buchungs-Slug. Die zwei Grenzen (kein erfundener Preis, nie behaupten ein Mensch zu sein) werden angezeigt, nicht eingestellt — sie sind in `baueSetterSystemtext()` fest verdrahtet.

**E-Mail** — es gilt seit dem 09.09. eine feste Trennlinie:

> **Was die Maschine verschickt, geht über uns. Was der Mensch tippt, geht über ihn.**

Rechnungen, Mahnungen, Terminbestätigungen und Newsletter laufen weiter über Resend (`lib/mail.ts`, unangetastet). Was der Mensch im Posteingang tippt, geht über SMTP seines eigenen Postfachs — deshalb steht die Antwort auch in seinem Ordner „Gesendet". Höchstens **fünf Empfänger** je Nachricht: darüber wäre es Massenversand, und der sperrt bei IONOS oder Strato das Konto des Kunden. Der Versand-Server wird aus dem IMAP-Server abgeleitet (`imap.ionos.de` → `smtp.ionos.de`), der Kunde muss nichts eintragen.

**Der Posteingang zeigt nur Text, nie fremdes HTML.** Wer fremdes HTML in die eigene Oberfläche stellt, holt sich Skripte und Zählpixel ins Haus, die dem Absender melden, wann und wo gelesen wurde. Eine abgesicherte HTML-Ansicht bleibt eine spätere eigene Entscheidung.

**Die Nutzungsmessung** (`/admin/command-center/nutzung`): eine Zeile je Betrieb, Modul und Tag. Kein Klick-Protokoll, kein Personenbezug, keine Uhrzeit — nur ein Datum. Die Tabelle `modul_nutzung` hat **keine Spalte, in die eine Person passt**; damit ist sie zur Leistungs- und Verhaltenskontrolle technisch nicht geeignet, nicht bloß nicht so gemeint. Genau darauf kommt es bei § 87 Abs. 1 Nr. 6 BetrVG an.

## Funde am echten Code (10.09.)

| Fund | Konsequenz |
|---|---|
| **Punkt 1.3 war längst gebaut.** In `app/dashboard/onboarding/page.tsx` ab Zeile 376 steht ein Block „PUNKT 1.3 · Sackgassen-Bremse" | Abhaken, kein Push nötig |
| Die Bauliste nennt für 1.3 die **falsche Datei**: `_components/stammdatenPruefung.ts` prüft **Kunden- und Lieferantenlisten** (Dubletten, IBAN). Die Firmen-Pflichtfelder prüft `einstellungen/firmaPruefung.ts` | Zwei ähnlich klingende Prüfungen — nicht verwechseln |
| Drei Punkte in `lib/einrichtung.ts` zeigten auf `/admin/command-center/setter` — **diese Seite gibt es nicht** | Mit G3 Push 4 korrigiert |
| `mail_absender` stand als Punkt je Betrieb in der Checkliste | Auf `geplant: true` gesetzt, bis D6 steht |
| Drei Duz-Stellen in Kundentexten (Posteingang, Mail-Zugang) | Korrigiert. Es gibt vermutlich weitere — beim Vorbeikommen mitnehmen |
| Das SQL von G1/G2/G3 liegt **nicht** im Repo (`supabase-sql/` hat keine `g1-`/`g2-`/`g3-`-Datei) | Die Sammlung ist nicht mehr die vollständige Wahrheit über die Datenbank. Ab jetzt SQL-Blöcke am Ende eines Blocks mit ablegen? |

## Womit wir heute anfangen

### 6.1 Preisrechner gegen Kopfpreis-Anbieter — *1 Push, kein SQL*

**Das stärkste Verkaufsargument, halber Tag Arbeit.** Besucher gibt seine Mitarbeiterzahl ein und sieht: bei ARGONAUT so viel, bei einem Kopfpreis-Anbieter so viel. **Ab etwa fünf Nutzern gewinnt ARGONAUT immer.**

- Die Preise stehen in `lib/tarif.ts` (16,7 KB) — **erst dort hineinschauen**, bevor irgendeine Zahl gerechnet wird.
- **FLYER-Regel gilt auch hier: niemals Mitbewerber beim Namen nennen.** Im Vergleich stehen „führende Mitbewerber" mit Preisspannen je Kopf, nicht „weclapp" oder „Odoo".
- Die Rechenlogik gehört in eine eigene Datei mit `node --test` — eine falsche Zahl auf der öffentlichen Seite ist schlimmer als kein Rechner.
- Wo die Seite hinsoll, entscheide ich: eigene Seite oder Baustein auf `/vergleich`.

### Danach, in dieser Reihenfolge

**1.2** Mitarbeiter sehen die Anfragen — *1 SQL*. **Meine Entscheidung vom 09.09. steht schon: Mitarbeiter DÜRFEN die Anfragen sehen und mitarbeiten, aber ohne Löschrecht.** Auf `leads` liegt heute nur eine Besitzer-Regel. Der SQL-Block kann gebaut werden, sobald jemand hinschaut.
**6.3** Ausfallplan für die KI — zweiter Anbieter hinter derselben `kiFetch`-Funktion (*1 Push*). Genau die Frage, die ein größerer Kunde in der Prüfung stellt.
**6.5** Wachendes Auge auf die restlichen Reiter — `KiAuge` sitzt nur auf einem Teil (*1 Push*).
**6.2** Steuerberater-Zugang als eigener, schreibgeschützter Sitz (*1 SQL · 2 Pushes*). Öffnet einen Vertriebskanal, den es sonst nicht gibt.
**E-Mail Push 3** (optional) — Anhänge herunterladen, Ordner, Suche.

## Wo wir stehen

**Sofort baubar, ohne auf irgendwen zu warten: 4 Punkte · 1 SQL · 5 Pushes** (6.1, 6.3, 6.5, 6.2)
**Dazu 1.2** — 1 SQL, die Entscheidung liegt vor.

**Wartet auf Fremdkonto, Vertrag oder Aufnahme:** A1 Resend Pro · 2.1 Stimme · 2.2 Gesicht · G4 Social · G5 Telefonie · D7 Webinar · B5 Seitenschale · A3 Anwaltspaket · A4 Stripe · M18 Testtag.

**D6 (eigene Absender-Domain je Kunde) ist neu zu bewerten.** Seit die Kunden mit ihrem eigenen Postfach antworten, schließt sich der Kreis von selbst: Rechnung raus über uns, Antwort landet im echten Postfach des Kunden, er sieht sie in ARGONAUT und antwortet über sein SMTP. Standard bleibt `argonaut-os.com`; eigene Domain nur als Angebot für Kunden, die es wollen. Die DNS-Einträge (DKIM/SPF/DMARC) müssten sonst je Kunde von Hand in einem fremden DNS-Panel gesetzt werden — nicht automatisierbar.

## Zwei Punkte für den Testtag (M18)

1. **Zählt ein eingeladener Mitarbeiter auf das Konto seines Betriebs?** Die Nutzungsmessung sucht `mitarbeiter.owner_user_id`. Heißt die Spalte anders, zählt er auf sich selbst und in der Statistik stünden zu viele „Betriebe". Nichts stürzt ab, die Zahl wäre nur schief. Sieht man erst mit einem echten zweiten Login.
2. **Zeigt die Bestandsanzeige im Einkauf die richtige Filiale?** Offen seit dem 09.09., sieht man nur beim Anklicken.

## Ein Punkt, der nicht mitten ins Bauen gehört

`npm` meldet **17 Schwachstellen, davon 1 kritische** (602 auditierte Pakete — die Zahl stand vor nodemailer/mailparser genauso da). **Lass `npm audit fix --force` NICHT laufen** — das springt auf neue Hauptversionen und kann Next oder Supabase unter den Füßen wegziehen. Das gehört in Ruhe angeschaut, mit Blick darauf, welche Pakete im Betrieb laufen und welche nur beim Bauen. Eigener kleiner Block oder Testtag.

## Wie ich arbeite

- **Auf Deutsch**, Schritt für Schritt, alles copy-paste-fertig.
- **Niemals PowerShell — immer CMD**, mit `chcp 65001` für Umlaute.
- **Blockweise:** erst das komplette SQL in EINEM Block, danach die Pushes einzeln nacheinander. Nicht auf „erledigt" warten, sondern der Reihe nach liefern.
- **SQL immer direkt in den Chat schreiben**, vollständig, auch wenn es lang wird — nie nur auf eine Datei im Repo verweisen. Immer additiv und idempotent (`IF NOT EXISTS`), nie destruktiv.
- **Du schreibst die Dateien selbst** über die Bridge ins Repo. Für mich bleiben zwei Copy-paste-Aktionen: der SQL-Block und ein CMD-Block, der prüft und nur bei Grün committet.
- **Ein Push darf mehrere Dateien enthalten** — was zusammengehört, kommt zusammen. Gezielter `git add <datei>`, nie `git add .`.
  *Achtung bei Pfaden mit eckigen Klammern:* Git liest `[id]` als Zeichenklasse. `git add app/…/betrieb/[id]/page.tsx` findet still nichts — den Ordner nehmen.
- **Freie Hand:** Wenn du eine klare Empfehlung hast, bau sie sofort und liefer den fertigen Push-Block. Nicht auf ein separates „los" warten.
- **Fragen stellst du, sobald sie relevant sind** — nicht vorher, nicht auf Vorrat.
- Ich bin **Perfektionist**. Technisches Niveau: Anfänger bis Mittel. Erklär mir das Warum, nicht nur das Was.

## Die Prüf-Kette vor jedem Push — nicht verhandelbar

1. **esbuild-Syntaxcheck** über alle geänderten Dateien
2. **`tsc --noEmit`** in einer Prüf-Umgebung — **mit den echten Paketen**, nicht mit Attrappen. Ein zu lockerer Stub findet nichts.
3. **`node --test`** für alle reinen Logik-Dateien, gegen ein **frisch erzeugtes** `out/` (`rm -rf out` davor — sonst prüft man den Stand von gestern)
4. **Gegenprobe:** in JEDE geänderte Datei einzeln einen Typfehler einbauen, prüfen ob der Prüfer ihn mit Zeilennummer findet, zurücksetzen

Das hat sich gestern dreimal ausgezahlt: zwei echte Fehler in `lib/mailSmtp.ts` (Betreff „Re:" ohne Rumpf, fehlende Leerzeile zwischen Absätzen) und einer in der Nutzungs-Seite (fertige Betriebe wären als Onboarding-Abbrecher gezählt worden).

**Bei mir im CMD-Block:** `npx tsc --noEmit && npx next build` — beides, nicht nur `tsc`. Danach Vercel-Check.

## Konventionen

- **Kundentexte immer mit „Sie".** Nie „KI-Agenten" oder „KI-Crew" — das Wort heißt **„Bausteine"**.
- **Deutsche Anführungszeichen** im Code: `„Text"` mit dem richtigen schließenden Zeichen. Ein ASCII-Zeichen beendet sonst das String-Literal.
- **RLS-Regeln mit Präfix** nach bestehendem Muster (`abs_*`, `lbw_*`, `wan_*`, `dse_*`).
- **Kern-Geld-Formulare** (Rechnung/Angebot), Zahlungs- und Bank-Integrationen sowie alles rund um Auth/Login nur gemeinsam und abgesegnet — nie unbeaufsichtigt.
- **Vor der Kompaktierung** sag mir rechtzeitig Bescheid, damit ich frisch weitermachen kann.

## Grenzen, die nicht verhandelbar sind

- **Nutzungsmessung nie auf Mitarbeiterebene.** § 87 Abs. 1 Nr. 6 BetrVG macht technische Einrichtungen mitbestimmungspflichtig, die zur Leistungs- und Verhaltenskontrolle **geeignet** sind — auf die Absicht kommt es nicht an. Block I der Anwaltsliste, **nicht freigegeben**. Wenn dir beim Bauen auffällt, dass ein Feld eine einzelne Person identifizierbar macht: weglassen und mich fragen.
- **Kein Massenversand über Kundenpostfächer.** Fünf Empfänger je Nachricht, darüber der Newsletter über Resend.
- **Die zwei Grenzen des KI-Beraters** bleiben fest verdrahtet: kein Preis, der nicht in den Stammdaten steht, und er behauptet nie, ein Mensch zu sein (AI Act Art. 50, seit 02.08.2026).
- **`GRUNDSCHRITTE = 11`** in `lib/nutzung.ts` ist die Länge von `SCHRITTE` in der Onboarding-Seite. Wer dort einen Schritt ergänzt oder streicht, **zieht die Zahl mit** — sonst gilt ein fertiger Betrieb als Abbrecher oder umgekehrt.

## Entscheidungen, die noch bei mir liegen

Frag mich danach, sobald sie relevant werden — nicht alle auf einmal:

1. **Duzt oder siezt der Mitarbeiterbereich?** Kundentexte siezen; intern ist es nie festgelegt worden.
2. **`beleg-upload` nachziehen?** Der lässt durch, wenn `ANALYSE_BETREIBER_ID` *nicht* gesetzt ist. Bei den neuen Betreiber-Endpunkten ist es bewusst strenger.
3. **B8 Kleinkram** — hängt an drei Entscheidungen.
4. **Fahrzeugakte** — null Schreibvorgänge, zeigt nur an. Ausbauen oder streichen?
5. **Chat-Domain für Fremdbetriebe:** Das Feld liegt heute im Kunden-Dashboard (`/dashboard/webseiten`). Nach dem Grundsatz „der Kunde richtet nichts ein" müsste der Betreiber es je Betrieb setzen können — heute kommt er dort nicht heran. Andockpunkt, nicht dringend.
6. **SQL-Blöcke künftig im Repo ablegen?** Siehe Funde.

## Zwei Listen, die ich noch will (nicht heute früh)

- **Liste A:** Was ich je Kunde einstellen muss. *Weitgehend erledigt* — `lib/einrichtung.ts` ist genau das, als Funktion statt als Dokument, und die Betriebs-Akte zeigt es an. Fehlt noch: die Punkte, die **nicht** je Betrieb gelten (Resend, Meta-App, Stripe).
- **Liste B:** Wo eine KI dem Kunden Wording und Texte für seine Bots erzeugen kann.

## Was auf mich wartet, nicht auf dich

`A1` Resend auf Pro (5 Min, schaltet D6 frei — aber D6 ist neu zu bewerten) · `A3` Anwaltspaket · `A4` Stripe prüfen · `A5` SEPA-Weg · `M18` Testtag · Aufnahmen für Stimme und Gesicht · Konten für Social · Partnervertrag für Telefonie.

---

**Fang an mit:** die Dokumente lesen, dann `lib/tarif.ts` am echten Code anschauen, dann 6.1 Preisrechner. Sag mir vorher kurz, was du im Repo vorgefunden hast — besonders, wo es von diesem Prompt abweicht.
