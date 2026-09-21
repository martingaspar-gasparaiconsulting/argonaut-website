# ARGONAUT OS — STARTPROMPT 21.09.2026 (nachts)

Fuer den naechsten Chat. Ohne Umlaute, terminal-sicher.
Ersetzt ARGONAUT-STARTPROMPT-21-09-2026-abend.md als juengsten Stand.

---

## STAND

**43 von 72 erledigt. Offen 29.**
Ich baue 2 . Gemeinsam 12 . Martin selbst 14 . Anwalt 1

    Repo:       C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website
    Dachordner: C:\Users\Admin\Desktop\gaspar-ai-system   (beide freigeben, Sieben-Ebenen-Grenze)
    Supabase:   znrjnndfzzydnhbyntwa
    Vercel:     Branch main, jeder Push deployt
    Liste:      https://claude.ai/artifact/RtuGx9jjgi615pwdM5kP52   (Artifact-Werkzeug, action:read)
    Testtag:    https://claude.ai/artifact/EWAnHzQuu1MhqjpCeZfpCA

Baulog in der Memory: **argonaut-bauliste-0921b** (ab Punkt 61; davor argonaut-bauliste-0921).
Anwalt: **argonaut-anwalt-checkliste** . Testtag: **argonaut-testtag**.

---

## AM 21.09. ABENDS ERLEDIGT — ALLE READY AUF PRODUCTION

    9f8b2ef  P59+P60      Aufmass-Formel mit Klammern und Division, VOB/C-Uebermessung
    72dfa12  P61 Paket 1  Stundensatz herleiten statt eintippen
    3ce5628  P62          Deckungsbeitrag mit Lohnkosten, rein additiv
    b7534ba  P63          Import-Parser haerten, acht Befunde, alle gemessen
    cd8b695  P65 Paket 1  Bewirtung, AfA-Sammelposten, Dreimonatsfrist
    5398b4c  P65 Paket 2  Betriebskosten-Frist, Gutscheine, Cashflow, Beleg-Toleranz
    857ca86  P65 Paket 3  GAEB-Export repariert, Adresspruefung, Einwilligungsnachweis

**415 Tests gruen** (Stand 21.09. nachts, von 119 am Nachmittag).
Damit sind die Punkte 59, 60, 61, 62, 63 und 65 durch. R12 ist komplett.

---

## DIE ERSTE AUFGABE IM NEUEN CHAT

**Punkt 54 — Abschlags- und Schlussrechnung nach Paragraf 632a BGB.**

ACHTUNG: **Das faellt unter die GEMEINSAM-Regel.** Es ist ein Kern-Geld-Formular
(Rechnung). Nichts davon wird unbeaufsichtigt gebaut — erst planen, Martin
zeigen, absegnen lassen, dann bauen.

Warum ausgerechnet dieser Punkt als naechstes: **VIER Paket-1-Bausteine liegen
seit dem 21.09. bereit und rufen alle noch niemanden auf.**

    lib/skonto.ts               (P55, 22 Tests)
    lib/sicherheitseinbehalt.ts (P56, 21 Tests)
    lib/bauleistung.ts          (P57, 23 Tests)
    lib/ustIdNr.ts              (P58, 28 Tests)

Ihre Pakete 2 treffen ALLE dieselbe Rechnung — Spalten, Formular, PDF,
E-Rechnung. Einzeln drangeflanscht wuerde jeder von ihnen dieselbe Datei
viermal anfassen. Punkt 54 ist der Ort, an dem sie zusammen gehoeren:
eine Abschlagsrechnung mit Sicherheitseinbehalt und Skonto, bei 13b ohne
Umsatzsteuer, an einen Kunden mit geprueften USt-IdNr.

Vor dem Planen zu lesen: die Rechnungsseite, das Rechnungs-PDF, die
E-Rechnung (lib/zugferd.ts, erechnung-validator.ts) und die vier Bausteine.
Das ist viel — deshalb gehoert dieser Punkt an den ANFANG eines Chats.

## DANACH

    30 Rest (b)  Anzeige-Formatierer in den Beleg-Bibliotheken. Aendert sichtbar
                 JEDEN Beleg (geschuetztes Leerzeichen vor EUR, "0,00 EUR" wird
                 zu einem Strich) — gehoert auf den Testtag.
    66           Schriften vereinheitlichen — GANZ ZUM SCHLUSS.

---

## OFFEN FUER MARTIN

**DRINGEND vor dem Anwaltstermin (Anfang Oktober):**
Punkt 33 — Fremdschluessel-Abfrage in Supabase laufen lassen:

    select conrelid::regclass, confdeltype from pg_constraint where contype = 'f';

c = Cascade, n = set null. Ohne das Ergebnis bleibt Block V1 des Nachtrags eine
offene Frage statt eines Befunds.

**Kleine Restpruefung P69b:** Vercel — Settings — Cron Jobs — bei
/api/cron/ki-batch-abholen auf Run, dann View Logs. Muss 200 zeigen, nicht 401.
GEFAHRENKARTE: Der Run-Knopf loest den ECHTEN Lauf aus. Nur ZWEI der 18 sind
gefahrlos: ki-batch-abholen und rechnungen-ueberfaellig. VIERZEHN verschicken
echte Mails oder posten wirklich. ZWEI loeschen.

**Zwei Entscheidungen, die bei Martin liegen:**
1. Die Zwei-Cent-Toleranz im E-Rechnungs-Validator versteckt genau die
   Rundungsunterschiede, um die es geht. Fuer OCR-Belege sinnvoll, fuer selbst
   gerechnete Summen nicht. Soll sie bleiben?
2. Punkt 30 Rest: lib/kalkulatorUebergabe.ts (negative Rabattzeile im Angebot)
   ist zeichengleich mit app/dashboard/angebote/page.tsx — faellt unter die
   GEMEINSAM-Regel. Wann?

---

## WEITER OFFEN, UNVERAENDERT

    _p27b.bat    paketLogik wertet `ok` aus — Verhaltensaenderung, die ein Paket
                 blockieren kann. Getrennt und mit Ansage.
    69 Paket 3   Die sechs Bauart-B- und drei Bauart-C-Cron-Routen. Bereits
                 fail-closed; Umstellung waere Vereinheitlichung ohne Gewinn.
    Andockpunkte ELF offen: staffelUnstimmigkeiten, extfHinweise, ustvaHinweise,
                 bankHinweise, wiederkehrHinweise, datevHinweise, fixpreisHinweise,
                 provisionHinweise, bkHinweise, lohnHinweise, margeKlartext.
    Punkt 12     SECHZEHN Dateien haben noch einen eigenen Zahl-Leser der kaputten
                 Bauart A/B ohne Anschluss an lib/zahlen.ts (importParser ist am
                 21.09. dazugekommen, gaeb.ts ebenfalls). Echte Geldfelder darunter:
                 versandBuchung, dealScoring, terminWert, segmente.

---

## PAKETE 2, DIE AUF IHREN ANSCHLUSS WARTEN

Alles Folgende ist gebaut, getestet und ruft noch NIEMANDEN auf. Jedes davon
wird erst beim Anschliessen sichtbar — und jedes gehoert dann auf den Testtag.

    lib/stundensatz.ts        P61 — an Kalkulator und Nachkalkulation
    lib/bewirtung.ts          P65 — an die Belegerfassung
    lib/afa.ts Sammelposten   P65 — an die Anlagenverwaltung
    lib/reisekosten.ts Frist  P65 — an die Reisekostenabrechnung
    lib/betriebskosten.ts     P65 — an die Betriebskostenabrechnung
    lib/gutscheine.ts Pruefung P65 — an die Gutscheinverwaltung
    lib/cashflow.ts Termine   P65 — an die Liquiditaets-Vorschau
    lib/adressPruefung.ts     P65 — an die Konnektoren (siehe Warnung unten)
    lib/einwilligung.ts       P65 — an die drei Opt-in-Routen
    aufmassFormel/aufmassVob  P59+P60 — an die Aufmass-Seite
    nachkalkulation ehrlich   P62 — Kachel und Tabellenspalte umstellen

**WARNUNG ZUM ANSCHLUSS DER ADRESSPRUEFUNG:** Die Epson-TSE steht im lokalen
Netz des Betriebs. Die Ausnahme haengt am Feldnamen (`LOKALES_NETZ_FELDER =
['device_url']`). Wer beim Anschliessen die Ausnahme vergisst, sperrt die Kasse
aus. Das ist der Fall, fuer den Martins Regel gilt: vorher sagen, getrennt
liefern.

**WARNUNG ZUM ANSCHLUSS DER VOB/C-UEBERMESSUNG:** `vertragsart` ist ein
Pflichtargument ohne Standardwert. Gegenueber Verbrauchern ist die Uebermessung
nach OLG Stuttgart 21.02.2008, 2 U 84/07 regelmaessig unwirksam. Block X der
Anwalt-Checkliste gehoert VOR dem Anschluss vorgelegt.

---

## ARBEITSREGELN (Stand 21.09. nachts)

1. **VOR EINER RUECKFRAGE AN MARTIN ERST DIE BAULOKS DURCHSUCHEN.**

2. **JEDES ZITAT IN EINEM ANWALTSDOKUMENT TRAEGT EIN PRUEFSTUECK**, das ein
   Skript gegen die angegebene Zeile prueft. Zaehlungen werden aus der Datei
   berechnet, nie getippt.

3. **DIE TESTTAG-SAMMLUNG IST ZENTRAL.** Nach jedem gebauten Punkt dort
   ergaenzen — auch das, was ausdruecklich KEINEN Klicktest braucht.

4. **EIN RUNDUNGSTEST OHNE ECHTEN GRENZFALL BEWEIST NICHTS.** Brauchbare
   Werte: 2,675 . 1,005 . 12,345 . 1234,565 . 99,995. Gleitkomma verfehlt den
   Grenzfall oft von selbst (-2,345 mal 100 ist -234,50000000000002).

5. **EINE TOLERANZ KANN EINEN BEFUND VERSTECKEN.** Immer fragen, ob der
   gesuchte Fehler ueberhaupt ueber die Toleranz hinauswaechst.

6. **ECKIGE KLAMMERN IM PFAD BRAUCHEN `set GIT_LITERAL_PATHSPECS=1` IN DER .bat.**

7. **EINE REPARATUR AN EINER STELLE KANN AN DREI ANDEREN VERPUFFEN.** Vor dem
   Bauen fragen: wer ruft das WIRKLICH auf? Bei P62 stellte sich heraus, dass
   app/dashboard/projekte/page.tsx die Nachkalkulation GAR NICHT nutzt.

8. **BLEIBT EINE GEGENPROBE GRUEN, ERST DEN PATCH PRUEFEN, DANN DEN TEST.**
   Das ist am 21.09. SECHSMAL passiert, und FUENFMAL lag es am Testwert, nicht
   am Patch. Die Faelle, damit sie sich nicht wiederholen:
   - Ein Testwert, der fuer sich allein schon eindeutig ist, prueft die
     Entscheidung nicht (P63, Dezimaltrenner: "1,234.56" statt "12,345").
   - Eine Rest-Aufloesung muss am NACH UNTEN rundenden Fall geprueft werden
     (P65-1: 1.000,01 statt 1.333,33).
   - Ein Datums-Test braucht einen Monat, in dem die Sache auseinandergeht
     (P65-2: September 2026 endet Mittwoch, da sind die drei letzten
     Kalendertage zugleich Bankarbeitstage. Brauchbar: Mai 2026).
   - Schon gerundete Testwerte pruefen keine Rundung (P65-3: 12.345/14.367
     statt 12.35/14.37).
   - **NEU: ein `some()`-Test ueber eine Liste beweist nichts ueber den
     einzelnen Eintrag** (P65-3: "irgendwo steht pruefen" blieb wahr, als
     ein einzelner Eintrag hochgestuft wurde. Jeder wird jetzt beim Namen
     geprueft.)
   Der eine Fall, in dem wirklich der Patch schuld war: P58, "GR als
   Griechenland" — der Patch traf nur das Muster-Objekt.

9. **EINEN FREMDEN ALGORITHMUS VOR DEM EINBAU GEGENPRUEFEN, NICHT DANACH.**

10. **DIE BAULISTE IST NICHT IMMER GENAU — AM ECHTEN CODE NACHSEHEN UND
    EHRLICH WIDERSPRECHEN.** Am 21.09. war sie fuenfmal ungenau:
    holzLogik/sortimentLogik hatten mit dem Aufmass nichts zu tun; die
    Groessengrenze im Import gab es sehr wohl, sie griff nur zu spaet;
    Einzweck/Mehrzweck kannte lib/gutscheine.ts bereits; beim Cashflow fehlte
    die Sozialversicherung in der Liste, und sie ist der groesste Posten;
    "US-Datum wird leer" stimmte nur fuer den harmlosen Fall — der
    gefaehrliche wurde still FALSCH gelesen.

11. **NEU: WAS EINE ZAHL AUF EINEM DOKUMENT AENDERT, KOMMT MIT ANSAGE.**
    Bei P65-3 aendert sich die Angebotssumme in der GAEB-Datei um Cent-Betraege.
    Das steht in der .bat-Ausgabe, in der Commit-Nachricht und in der Nachricht
    an Martin — bevor er die .bat aufruft.

12. **NEU: EINE PRUEFUNG, DIE MARTIN ODER SEINE KUNDEN AUSSPERREN KANN, BRAUCHT
    EINE BENANNTE AUSNAHMELISTE, KEINE REGEL.** Bei der Adresspruefung haengt
    die Ausnahme fuer das lokale Netz an genau einem Feldnamen (`device_url`),
    nicht an einem Muster ueber Feldnamen. Wer spaeter ein Feld hinzufuegt,
    muss sich ausdruecklich entscheiden.
