# ARGONAUT OS — STARTPROMPT 21.09.2026 (abends)

Fuer den naechsten Chat. Ohne Umlaute, terminal-sicher.
Ersetzt ARGONAUT-STARTPROMPT-14-09-2026.md als juengsten Stand.

---

## STAND

**33 von 72 erledigt. Offen 39.**
Ich baue 12 . Gemeinsam 12 . Martin selbst 14 . Anwalt 1

    Repo:     C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
    Dachordner: C:\Users\Admin\Desktop\gaspar-ai-system   (beide freigeben, Sieben-Ebenen-Grenze)
    Supabase: znrjnndfzzydnhbyntwa
    Vercel:   Branch main, jeder Push deployt
    Liste:    https://claude.ai/artifact/RtuGx9jjgi615pwdM5kP52   (Artifact-Werkzeug, action:read)
    Testtag:  https://claude.ai/artifact/EWAnHzQuu1MhqjpCeZfpCA

Baulog in der Memory: **argonaut-bauliste-0921** (alles Heutige steht dort ausfuehrlich).

---

## AM 21.09. ERLEDIGT — SECHS COMMITS, ALLE READY AUF PRODUCTION

    2b75a55  P69 Paket 1   Cron-Zugangspruefung (cronZugang + cronGuard), 26 Tests
    8b1cd00  P69 Paket 2   neun Cron-Endpunkte angeschlossen
    72d3f2a  P44           Rueckhol-Strecke fertig, 81 Tests, SQL gelaufen
    9c47087  P30a          Cent-Runder + Zahlen-Leser in cashflow/belegCheck/reportBaukasten
    d211478  P53 Paket 1   E-Rechnung: BR-CO-10, IBAN, Kontakt, Leitweg-ID, Datum
    ff2a50a  P53 Paket 2   Validator prueft die Zahlen, die wirklich rausgehen
    2e7c06d  P55 Paket 1   Skonto als reine Logik, 22 Tests

Dazu ohne Push: Punkte 31 + 32 (Anwaltsvorlage-Nachtrag + Anlage "Das wachende Auge"),
beide PDFs liegen in docs\ und ANWALT-RECHT\ , NICHT committet.

---

## DIE ERSTE AUFGABE IM NEUEN CHAT

**Punkt 56 / R6 — Sicherheitseinbehalt.**

Muster wie P55: zuerst eine reine Logik-Datei mit Tests, die noch niemand aufruft.
Das Anschliessen an die Rechnung beruehrt ein Kern-Geld-Formular und kommt getrennt
und gemeinsam.

Was dabei zu beachten ist (am Fach, nicht am Code):
- Der Einbehalt mindert das ENTGELT NICHT. Die Rechnung weist die volle
  Umsatzsteuer aus, genau wie beim Skonto. Nur der Zahlbetrag sinkt.
- Ueblich sind 5 Prozent Gewaehrleistungseinbehalt, abloesbar durch Buergschaft.
- Die Gewaehrleistungsfrist entscheidet ueber das Rueckgabedatum: VOB/B meist
  vier Jahre bei Bauwerken, BGB fuenf Jahre. NICHT raten, welche gilt - beides
  als Eingabe anbieten.
- lib/skonto.ts ist die Vorlage fuer Aufbau und Ton.

---

## DANACH IN DIESER REIHENFOLGE

    57       Reverse Charge (Paragraf 13b UStG) + Bauabzugsteuer (Paragraf 48 EStG)
    58       Qualifizierte USt-IdNr.-Abfrage beim BZSt
    59 + 60  Aufmass: Klammern, Division, Raumbuch . VOB/C-Uebermessung
    61       Kalkulator lernt aus Ist-Zeiten, Stundensatz herleiten
    62       Nachkalkulation ehrlich machen
    63       Import-Parser haerten (dort auch der Gutschrift-Rest aus Punkt 30)
    65       R12 - der Kleinkram, gebuendelt
    66       Schriften vereinheitlichen - GANZ ZUM SCHLUSS

---

## OFFEN FUER MARTIN

**DRINGEND vor dem Anwaltstermin (Anfang Oktober):**
Punkt 33 - Fremdschluessel-Abfrage in Supabase laufen lassen:

    select conrelid::regclass, confdeltype from pg_constraint where contype = 'f';

c = Cascade, n = set null. Ohne das Ergebnis bleibt Block V1 des Nachtrags eine
offene Frage statt eines Befunds.

**Kleine Restpruefung P69b:** Vercel - Settings - Cron Jobs - bei
/api/cron/ki-batch-abholen auf Run, dann View Logs. Muss 200 zeigen, nicht 401.
GEFAHRENKARTE: Der Run-Knopf loest den ECHTEN Lauf aus. Nur ZWEI der 18 sind
gefahrlos: ki-batch-abholen und rechnungen-ueberfaellig. VIERZEHN verschicken
echte Mails oder posten wirklich. ZWEI loeschen.

**Zwei Entscheidungen, die bei Martin liegen:**
1. Die Zwei-Cent-Toleranz im E-Rechnungs-Validator versteckt genau die
   Rundungsunterschiede, um die es geht. Fuer OCR-Belege sinnvoll, fuer selbst
   gerechnete Summen nicht. Soll sie bleiben?
2. Punkt 30 Rest: lib/kalkulatorUebergabe.ts (negative Rabattzeile im Angebot)
   ist zeichengleich mit app/dashboard/angebote/page.tsx - faellt unter die
   GEMEINSAM-Regel. Wann?

---

## WEITER OFFEN, UNVERAENDERT

    _p27b.bat    paketLogik wertet `ok` aus - Verhaltensaenderung, die ein Paket
                 blockieren kann. Getrennt und mit Ansage.
    30 Rest (b)  Anzeige-Formatierer in den Beleg-Bibliotheken. Aendert sichtbar
                 jeden Beleg - gehoert auf den Testtag.
    69 Paket 3   Die sechs Bauart-B- und drei Bauart-C-Cron-Routen. Bereits
                 fail-closed; Umstellung waere Vereinheitlichung ohne Gewinn.
    Andockpunkte NEUN offen: staffelUnstimmigkeiten, extfHinweise, ustvaHinweise,
                 bankHinweise, wiederkehrHinweise, datevHinweise, fixpreisHinweise,
                 provisionHinweise, bkHinweise.
    Punkt 12     SIEBZEHN Dateien haben noch einen eigenen Zahl-Leser der kaputten
                 Bauart A/B ohne Anschluss an lib/zahlen.ts. Echte Geldfelder
                 darunter: versandBuchung, dealScoring, terminWert, segmente.

---

## ARBEITSREGELN, DIE AM 21.09. DAZUGEKOMMEN SIND

1. **VOR EINER RUECKFRAGE AN MARTIN ERST DIE BAULOKS DURCHSUCHEN.** Ich hatte
   gefragt, ob ANALYSE_BETREIBER_ID in Vercel gesetzt ist - die Antwort stand
   seit dem 15.09. im eigenen Baulog.

2. **JEDES ZITAT IN EINEM ANWALTSDOKUMENT TRAEGT EIN PRUEFSTUECK**, das ein
   Skript gegen die angegebene Zeile prueft. Zaehlungen werden aus der Datei
   berechnet, nie getippt.

3. **DIE TESTTAG-SAMMLUNG IST ZENTRAL.** Nach jedem gebauten Punkt dort
   ergaenzen - auch das, was ausdruecklich KEINEN Klicktest braucht.

4. **EIN RUNDUNGSTEST OHNE ECHTEN GRENZFALL BEWEIST NICHTS.** Zweimal ist mir
   eine Gegenprobe gruen geblieben, weil der Testwert den .xx5-Fall verfehlte.
   Brauchbare Werte: 2,675 . 1,005 . 2,675 mal Satz. Gleitkomma verfehlt den
   Grenzfall oft von selbst (99,995 minus 100 ist -0,004999999999995).

5. **EINE TOLERANZ KANN EINEN BEFUND VERSTECKEN.** Der E-Rechnungs-Validator
   laesst zwei Cent durch; der Rundungsfehler betrug bei zwei Positionen nur
   einen Cent. Erst ab sechs Zeilen wird er sichtbar. Bei Toleranzen immer
   fragen, ob der gesuchte Fehler ueberhaupt darueber hinauswaechst.

6. **ECKIGE KLAMMERN IM PFAD BRAUCHEN `set GIT_LITERAL_PATHSPECS=1` IN DER .bat.**
   Sonst liest git `app/dashboard/rechnungen/[id]/page.tsx` als Muster, die
   Datei landet NICHT im Commit, und die Erfolgsmeldung kommt trotzdem.

7. **EINE REPARATUR AN EINER STELLE KANN AN DREI ANDEREN VERPUFFEN.** Bei P53
   habe ich die Bankverbindung in rechnungen/[id]/page.tsx ergaenzt - der echte
   Klickweg laeuft aber ueber ERechnungDialog.tsx, wo dieselbe Abfrage DREIMAL
   stand. Vor dem Bauen fragen: wer ruft das WIRKLICH auf?
