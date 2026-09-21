# ARGONAUT OS — STARTPROMPT 21.09.2026 (abends)

Fuer den naechsten Chat. Ohne Umlaute, terminal-sicher.
Ersetzt ARGONAUT-STARTPROMPT-14-09-2026.md als juengsten Stand.

---

## STAND

**37 von 72 erledigt. Offen 35.**
Ich baue 8 . Gemeinsam 12 . Martin selbst 14 . Anwalt 1

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
    ea07360  P56 Paket 1   Sicherheitseinbehalt, 21 Tests
    fe8892d  P57 Paket 1   Paragraf 13b UStG + Paragraf 48 EStG, 23 Tests
    (P58)    P58 Paket 1   USt-IdNr. + Bestaetigungsabfrage, 28 Tests

Dazu ohne Push: Punkte 31 + 32 (Anwaltsvorlage-Nachtrag + Anlage "Das wachende Auge"),
beide PDFs liegen in docs\ und ANWALT-RECHT\ , NICHT committet.

---

## DIE ERSTE AUFGABE IM NEUEN CHAT

**Punkt 59 + 60 — Aufmass und VOB/C-Uebermessung.** Die beiden gehoeren
zusammen und sind der Grund, warum der Chat vom 21.09. beendet wurde: dafuer
muessen app/dashboard/_components/aufmassLogik.ts, holzLogik.ts und
sortimentLogik.ts VOLLSTAENDIG gelesen werden, zusammen ueber 40 KB.

Der Befund aus der Liste: ueber alle 295 Dateien nach
`raumbuch|VOB|uebermess|abzugsfl` gesucht - null Treffer. Maler, Trockenbau
und Bodenleger uebermessen heute im Kopf.

Was dabei zu beachten ist:
- VOB/C (ATV DIN 18299 ff.) regelt je Gewerk, welche Oeffnungen uebermessen
  werden duerfen und ab welcher Groesse abgezogen werden MUSS. Die Grenzen
  sind je Gewerk VERSCHIEDEN - nicht eine Zahl fuer alles raten.
- aufmassLogik.runde3 ist bereits symmetrisch gebaut (am 20.09. geprueft),
  da ist nichts zu reparieren.
- Muster wie P55 bis P58: zuerst eine reine Logik-Datei mit Tests, die noch
  niemand aufruft. Das Anschliessen kommt getrennt.

VIER PAKET-1-BAUSTEINE liegen bereits bereit und rufen alle noch niemanden
auf: lib/skonto.ts . lib/sicherheitseinbehalt.ts . lib/bauleistung.ts .
lib/ustIdNr.ts . Ihre Pakete 2 (Spalten, Formular, PDF, E-Rechnung) treffen
ALLE dieselbe Rechnung und fallen ALLE unter die GEMEINSAM-Regel - sie
gehoeren zusammen geplant, nicht einzeln drangeflanscht.

## DANACH IN DIESER REIHENFOLGE

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

8. **BLEIBT EINE GEGENPROBE GRUEN, ERST DEN PATCH PRUEFEN, DANN DEN TEST.**
   Bei P58 blieb "GR als Griechenland akzeptieren" gruen, weil mein Patch nur
   das Muster-Objekt traf - geprueft wird aber zuerst gegen die Laenderliste.
   Der PATCH war wirkungslos, nicht die Reparatur.

9. **EINEN FREMDEN ALGORITHMUS VOR DEM EINBAU GEGENPRUEFEN, NICHT DANACH.**
   Die Pruefziffer der deutschen USt-IdNr. wurde erst an vier echten Nummern
   und drei Zahlendrehern gemessen und dann in die Datei geschrieben.
