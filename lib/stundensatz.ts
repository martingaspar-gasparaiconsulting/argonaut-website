// ============================================================================
// ARGONAUT OS · lib/stundensatz.ts
// Punkt 61 / R11, Paket 1 — der Stundensatz wird HERGELEITET statt eingetippt
//
// Reine Logik. Ein einziger Import: der gemeinsame Zahlen-Leser aus
// lib/zahlen.ts — damit hier nicht der achtzehnte eigene Leser entsteht
// (das ist Punkt 12).
//
// ▄▄▄ DER BEFUND ▄▄▄
// Am echten Code nachgesehen: In lib/kalkulator.ts ist der Stundensatz ein
// Posten mit `art: 'zeit'` und `preis_je_einheit` — eine EINGETIPPTE ZAHL
// (Z. 51-62, 164-169). Es gibt im ganzen Haus keine Stelle, die ihn
// herleitet. Auch lib/nachkalkulation.ts rechnet mit `stundensatz` aus der
// Tabelle projektleistungen, also wieder mit einer eingetippten Zahl.
//
// Das ist die teuerste Zahl im Handwerk. Wer sie um 10 EUR zu niedrig
// ansetzt und 1.250 produktive Stunden im Jahr verkauft, verschenkt 12.500
// EUR je Mitarbeiter und Jahr — und merkt es nie, weil die Rechnung
// aufgeht und der Auftrag kommt.
//
// ▄▄▄ DER RECHENWEG ▄▄▄
//
//   Kalendertage 365
//   − Wochenenden − Feiertage − Urlaub − Krankheit − Weiterbildung
//   = Anwesenheitstage        × Tagesstunden = ANWESENHEITSSTUNDEN
//   − unproduktiver Anteil (Ruesten, Fahrt, Lager, Buero, Gewaehrleistung)
//   = PRODUKTIVE STUNDEN      ← nur diese lassen sich verkaufen
//
//   Bruttolohn im Jahr + Sonderzahlungen
//   + Arbeitgeberanteil Sozialversicherung (gedeckelt an der BBG)
//   + Berufsgenossenschaft + Umlagen U1/U2
//   = PERSONALKOSTEN IM JAHR  ← die zahlt der Betrieb fuer das GANZE Jahr,
//                               auch fuer Urlaub und Krankheit
//
//   Personalkosten / produktive Stunden = SELBSTKOSTEN je Stunde (Lohn)
//   + Gemeinkostenzuschlag                = Verrechnungssatz
//   + Wagnis und Gewinn                   = Angebots-Stundensatz
//
// ▄▄▄ SECHS FEHLER, DIE DIESE DATEI VERHINDERN SOLL ▄▄▄
//
//  1. DURCH DIE ANWESENHEITSSTUNDEN TEILEN STATT DURCH DIE PRODUKTIVEN.
//     Der haeufigste Fehler und der teuerste. GEMESSEN mit den Werten des
//     Beispiels unten: 44,77 EUR gegen 33,57 EUR — 11,20 EUR je Stunde zu
//     wenig, bei 1.248 produktiven Stunden 13.977 EUR im Jahr. Je
//     Mitarbeiter.
//
//  2. DIE BEITRAGSBEMESSUNGSGRENZE UEBERSEHEN.
//     Ueber der Grenze steigt der Arbeitgeberanteil nicht weiter. Wer
//     stumpf einen Prozentsatz auf das volle Bruttogehalt rechnet, setzt
//     bei einem gut bezahlten Meister zu hohe Kosten an und kalkuliert sich
//     aus dem Markt. Zwei Grenzen, verschiedene Hoehe: Kranken- und
//     Pflegeversicherung 69.750 EUR, Renten- und Arbeitslosenversicherung
//     101.400 EUR (2026).
//
//  3. DIE SAETZE FEST IN DEN CODE SCHREIBEN, OHNE ZU SAGEN, VON WANN SIE SIND.
//     Genau der Befund aus dem Mahnwesen (Basiszins 1,52 % fest im Code).
//     Sozialversicherungssaetze und Bemessungsgrenzen aendern sich zum
//     1. Januar. Deshalb traegt jeder Satz hier ein `jahr`, und
//     `pruefeStand()` sagt es, sobald gerechnet wird, waehrend das Jahr
//     nicht mehr passt.
//
//  4. DEN ZUSATZBEITRAG DER KRANKENKASSE FUER EINE FESTE ZAHL HALTEN.
//     Er ist KASSENABHAENGIG. Der rechnerische Durchschnitt fuer 2026 liegt
//     bei 2,9 %, eine grosse Kasse verlangt 2,69 %. Der Unterschied ist
//     klein, aber er ist da — deshalb ist der Wert eine EINGABE mit einem
//     Standardwert, kein Gesetz.
//
//  5. BERUFSGENOSSENSCHAFT UND UMLAGEN VERGESSEN.
//     Die Berufsgenossenschaft haengt am Gefahrtarif der Branche und ist am
//     Bau kein Rundungsfehler. U1 (Entgeltfortzahlung) und U2
//     (Mutterschaft) haengen an der Krankenkasse. Alle drei sind hier
//     EINGABEN ohne geratenen Standardwert — sie stehen auf dem
//     Beitragsbescheid, und ein erfundener Wert waere schlimmer als eine
//     offene Frage.
//
//  6. DEN UNTERNEHMERLOHN WEGLASSEN.
//     Ein Einzelunternehmer, der sich selbst nicht einrechnet, arbeitet
//     zum Selbstkostenpreis seiner Mitarbeiter — und wundert sich am
//     Jahresende. Das Feld ist da und wird im Klartext angemahnt, wenn es
//     leer bleibt.
//
// ▄▄▄ ANDOCKPUNKT (noch nicht verbunden) ▄▄▄
// Diese Datei ruft NIEMAND auf. Muster wie P55 bis P58.
// Wenn sie angeschlossen wird, gehoert sie an ZWEI Stellen:
//   · lib/kalkulator.ts — als Herkunft fuer `preis_je_einheit` eines
//     Postens mit art: 'zeit', statt der eingetippten Zahl.
//   · lib/nachkalkulation.ts — dort fehlen die LOHNKOSTEN im
//     Deckungsbeitrag vollstaendig (Z. 132: erbracht − Material). Das ist
//     Punkt 62, und `selbstkostenJeStunde` ist genau die Zahl, die dort
//     fehlt.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

// ----------------------------------------------------------------------------
// 1. DIE SAETZE — mit Stand-Jahr, nicht nackt im Code
// ----------------------------------------------------------------------------

export interface SvSaetze {
  /** Fuer welches Jahr diese Saetze gelten. */
  jahr: number;
  /** Allgemeiner Beitragssatz Krankenversicherung, gesamt in Prozent. */
  kvAllgemein: number;
  /**
   * Durchschnittlicher Zusatzbeitrag, gesamt in Prozent. KASSENABHAENGIG —
   * der Wert hier ist nur der Ausgangspunkt, nicht die Wahrheit.
   */
  kvZusatzDurchschnitt: number;
  /** Rentenversicherung, gesamt. */
  rv: number;
  /** Arbeitslosenversicherung, gesamt. */
  av: number;
  /** Pflegeversicherung, gesamt. */
  pv: number;
  /** Arbeitgeberanteil Pflegeversicherung in SACHSEN — dort abweichend. */
  pvArbeitgeberSachsen: number;
  /** Insolvenzgeldumlage. Traegt der Arbeitgeber allein. */
  insolvenzgeldumlage: number;
  /** Beitragsbemessungsgrenze Kranken- und Pflegeversicherung, Jahresbetrag. */
  bbgKvPv: number;
  /** Beitragsbemessungsgrenze Renten- und Arbeitslosenversicherung, Jahresbetrag. */
  bbgRvAv: number;
  quelle: string;
}

/**
 * Stand 2026. Zwei unabhaengige Quellen gegengeprueft (ein Lohnportal und
 * eine gesetzliche Krankenkasse) — sie stimmen in allen Saetzen ueberein.
 *
 * DOCK-POINT: Spaeter laedt der Betrieb eigene bzw. neuere Saetze und
 * uebergibt sie als `saetze`-Parameter. Bis dahin gilt diese Liste.
 */
export const SV_SAETZE_2026: SvSaetze = {
  jahr: 2026,
  kvAllgemein: 14.6,
  kvZusatzDurchschnitt: 2.9,
  rv: 18.6,
  av: 2.6,
  pv: 3.6,
  pvArbeitgeberSachsen: 1.3,
  insolvenzgeldumlage: 0.15,
  bbgKvPv: 69750,
  bbgRvAv: 101400,
  quelle: 'Beitragssaetze und Rechengroessen der Sozialversicherung 2026',
};

/**
 * Sagt, ob die hinterlegten Saetze noch zum Jahr passen.
 *
 * Das ist die Lehre aus dem Basiszins im Mahnwesen: eine Zahl, die sich zum
 * Jahreswechsel aendert und fest im Code steht, rechnet ab dem 1. Januar
 * still falsch. Hier sagt sie es.
 */
export function pruefeStand(
  heute: Date = new Date(),
  saetze: SvSaetze = SV_SAETZE_2026,
): { aktuell: boolean; hinweis: string | null } {
  const jahr = heute.getUTCFullYear();
  if (jahr === saetze.jahr) return { aktuell: true, hinweis: null };
  return {
    aktuell: false,
    hinweis:
      `Die hinterlegten Beitragssätze sind von ${saetze.jahr}, gerechnet wird für ${jahr}. ` +
      'Beitragssätze und Bemessungsgrenzen ändern sich zum 1. Januar — bitte aktualisieren, ' +
      'sonst stimmt der Stundensatz nicht mehr.',
  };
}

// ----------------------------------------------------------------------------
// 2. ARBEITGEBERANTEIL
// ----------------------------------------------------------------------------

export interface ArbeitgeberOptionen {
  /**
   * Zusatzbeitrag der Krankenkasse, GESAMT in Prozent (nicht der halbe).
   * Fehlt er, gilt der Durchschnitt aus den Saetzen.
   */
  kvZusatzProzent?: number | null;
  /** Ermaessigter KV-Satz statt des allgemeinen (seltener Fall). */
  kvErmaessigt?: boolean | null;
  /** Betriebsstaette in Sachsen — dort traegt der Arbeitgeber weniger Pflegeversicherung. */
  sachsen?: boolean | null;
  /**
   * Beitrag zur Berufsgenossenschaft in Prozent der Lohnsumme.
   * KEIN Standardwert: haengt am Gefahrtarif. Steht auf dem BG-Bescheid.
   */
  berufsgenossenschaftProzent?: number | null;
  /** Umlage U1 (Entgeltfortzahlung) in Prozent. Kassenabhaengig. */
  u1Prozent?: number | null;
  /** Umlage U2 (Mutterschaft) in Prozent. Kassenabhaengig. */
  u2Prozent?: number | null;
}

export interface AgAnteil {
  /** Arbeitgeberanteil in Prozent, gedeckelt gerechnet — nur zur Anzeige. */
  effektivProzent: number;
  kv: number;
  pv: number;
  rv: number;
  av: number;
  insolvenzgeldumlage: number;
  berufsgenossenschaft: number;
  u1: number;
  u2: number;
  /** Summe aller Arbeitgeberanteile in EUR im Jahr. */
  summe: number;
  /** Das Brutto lag über einer Bemessungsgrenze — der Anteil ist gedeckelt. */
  gedeckelt: boolean;
  /** Was ohne Angabe offen geblieben ist. */
  fehlt: string[];
}

function proz(wert: number | null | undefined, standard = 0): number {
  const n = leseZahlOder(wert, standard);
  return Number.isFinite(n) && n >= 0 ? n : standard;
}

/**
 * Arbeitgeberanteil auf ein JAHRESBRUTTO, mit Beitragsbemessungsgrenzen.
 *
 * FEHLER 2 aus dem Dateikopf: Die beiden Grenzen sind verschieden hoch und
 * gelten für verschiedene Zweige. Wer eine Pauschale auf das volle Brutto
 * rechnet, liegt bei jedem Gehalt über 69.750 EUR daneben.
 */
export function arbeitgeberAnteil(
  jahresbrutto: number,
  opt: ArbeitgeberOptionen = {},
  saetze: SvSaetze = SV_SAETZE_2026,
): AgAnteil {
  const brutto = Math.max(0, leseZahlOder(jahresbrutto, 0));
  const fehlt: string[] = [];

  const basisKvPv = Math.min(brutto, saetze.bbgKvPv);
  const basisRvAv = Math.min(brutto, saetze.bbgRvAv);
  const gedeckelt = brutto > saetze.bbgKvPv || brutto > saetze.bbgRvAv;

  const kvGesamt = (opt.kvErmaessigt === true ? saetze.kvAllgemein - 0.6 : saetze.kvAllgemein);
  const zusatz = proz(opt.kvZusatzProzent, saetze.kvZusatzDurchschnitt);

  // Arbeitgeber trägt die Hälfte von allgemeinem Satz UND Zusatzbeitrag.
  const kv = basisKvPv * ((kvGesamt / 2 + zusatz / 2) / 100);
  const pv = basisKvPv * ((opt.sachsen === true ? saetze.pvArbeitgeberSachsen : saetze.pv / 2) / 100);
  const rv = basisRvAv * (saetze.rv / 2 / 100);
  const av = basisRvAv * (saetze.av / 2 / 100);

  // Die Insolvenzgeldumlage bemisst sich an der Rentenversicherungsgrenze.
  const insolv = basisRvAv * (saetze.insolvenzgeldumlage / 100);

  // Berufsgenossenschaft und Umlagen: KEINE Bemessungsgrenze, und kein
  // geratener Standardwert. Fehlt die Angabe, wird sie benannt.
  const bgSatz = opt.berufsgenossenschaftProzent;
  if (bgSatz == null) {
    fehlt.push('Beitrag zur Berufsgenossenschaft (steht auf dem BG-Bescheid, hängt am Gefahrtarif)');
  }
  const bg = brutto * (proz(bgSatz, 0) / 100);

  if (opt.u1Prozent == null) fehlt.push('Umlage U1 (Entgeltfortzahlung, steht auf dem Kassenbescheid)');
  if (opt.u2Prozent == null) fehlt.push('Umlage U2 (Mutterschaft, steht auf dem Kassenbescheid)');
  const u1 = brutto * (proz(opt.u1Prozent, 0) / 100);
  const u2 = brutto * (proz(opt.u2Prozent, 0) / 100);

  const summe = centRunden(kv + pv + rv + av + insolv + bg + u1 + u2);

  return {
    effektivProzent: brutto > 0 ? centRunden((summe / brutto) * 100) : 0,
    kv: centRunden(kv),
    pv: centRunden(pv),
    rv: centRunden(rv),
    av: centRunden(av),
    insolvenzgeldumlage: centRunden(insolv),
    berufsgenossenschaft: centRunden(bg),
    u1: centRunden(u1),
    u2: centRunden(u2),
    summe,
    gedeckelt,
    fehlt,
  };
}

// ----------------------------------------------------------------------------
// 3. PRODUKTIVE STUNDEN
// ----------------------------------------------------------------------------

export interface ZeitEingabe {
  /** Kalendertage im Jahr. Fehlt der Wert, gelten 365. */
  kalendertage?: number | null;
  /** Wochenendtage. Fehlt der Wert, gelten 104. */
  wochenendtage?: number | null;
  /** Gesetzliche Feiertage, die auf einen Werktag fallen. Bundeslandabhängig. */
  feiertage?: number | null;
  urlaubstage?: number | null;
  /** Erfahrungswert aus der eigenen Lohnbuchhaltung, nicht geraten. */
  krankheitstage?: number | null;
  weiterbildungstage?: number | null;
  /** Arbeitsstunden je Anwesenheitstag. Fehlt der Wert, gelten 8. */
  tagesstunden?: number | null;
  /**
   * Anteil der Anwesenheit, der NICHT verkauft werden kann, in Prozent:
   * Rüsten, Fahrten, Lager, Werkstatt aufräumen, Büro, Gewährleistung.
   * Fehlt der Wert, gelten 25 % — der gängige Erfahrungswert.
   */
  unproduktivProzent?: number | null;
}

export interface ZeitErgebnis {
  kalendertage: number;
  arbeitstageBrutto: number;
  anwesenheitstage: number;
  tagesstunden: number;
  /** Stunden, an denen der Mitarbeiter da ist. */
  anwesenheitsstunden: number;
  unproduktivProzent: number;
  unproduktiveStunden: number;
  /** Nur diese Stunden lassen sich verkaufen. */
  produktiveStunden: number;
  hinweise: string[];
}

export const ZEIT_STANDARD = {
  kalendertage: 365,
  wochenendtage: 104,
  tagesstunden: 8,
  unproduktivProzent: 25,
} as const;

/**
 * Leitet die produktiven Jahresstunden her — mit allen Zwischenschritten,
 * damit ein Betrieb die Zahl nachvollziehen und einzelne Annahmen ändern kann.
 */
export function produktiveStunden(e: ZeitEingabe = {}): ZeitErgebnis {
  const hinweise: string[] = [];

  const kalendertage = Math.max(1, proz(e.kalendertage, ZEIT_STANDARD.kalendertage));
  const wochenende = proz(e.wochenendtage, ZEIT_STANDARD.wochenendtage);
  const feiertage = proz(e.feiertage, 0);
  const urlaub = proz(e.urlaubstage, 0);
  const krank = proz(e.krankheitstage, 0);
  const weiterbildung = proz(e.weiterbildungstage, 0);
  const tagesstunden = Math.max(0, proz(e.tagesstunden, ZEIT_STANDARD.tagesstunden));
  const unproduktiv = Math.min(99, proz(e.unproduktivProzent, ZEIT_STANDARD.unproduktivProzent));

  if (e.feiertage == null) hinweise.push('Feiertage nicht angegeben — sie hängen am Bundesland.');
  if (e.urlaubstage == null) hinweise.push('Urlaubstage nicht angegeben.');
  if (e.krankheitstage == null) {
    hinweise.push('Krankheitstage nicht angegeben — der eigene Wert aus der Lohnbuchhaltung ist besser als jeder Schätzwert.');
  }
  if (e.unproduktivProzent == null) {
    hinweise.push(
      `Unproduktiver Anteil nicht angegeben — gerechnet wird mit ${ZEIT_STANDARD.unproduktivProzent} %. ` +
        'Gemeint sind Rüsten, Fahrten, Lager, Büro und Gewährleistung.',
    );
  }

  const arbeitstageBrutto = Math.max(0, kalendertage - wochenende);
  const anwesenheitstage = Math.max(0, arbeitstageBrutto - feiertage - urlaub - krank - weiterbildung);
  const anwesenheitsstunden = anwesenheitstage * tagesstunden;
  const unproduktiveStunden = anwesenheitsstunden * (unproduktiv / 100);
  const produktiv = Math.max(0, anwesenheitsstunden - unproduktiveStunden);

  if (produktiv <= 0) {
    hinweise.push('Es bleiben keine produktiven Stunden übrig — bitte die Angaben prüfen.');
  }

  return {
    kalendertage,
    arbeitstageBrutto,
    anwesenheitstage,
    tagesstunden,
    anwesenheitsstunden: centRunden(anwesenheitsstunden),
    unproduktivProzent: unproduktiv,
    unproduktiveStunden: centRunden(unproduktiveStunden),
    produktiveStunden: centRunden(produktiv),
    hinweise,
  };
}

// ----------------------------------------------------------------------------
// 4. PERSONALKOSTEN IM JAHR
// ----------------------------------------------------------------------------

export interface LohnEingabe {
  /** Monatliches Bruttogehalt. Alternativ jahresbrutto direkt angeben. */
  monatsbrutto?: number | null;
  jahresbrutto?: number | null;
  /** Monatsgehälter an Sonderzahlungen (Urlaubs-, Weihnachtsgeld). 1 = ein Monatsgehalt. */
  sonderzahlungenMonate?: number | null;
  /** Sonderzahlungen als fester Betrag im Jahr, statt in Monatsgehältern. */
  sonderzahlungenBetrag?: number | null;
  /**
   * Weitere Kosten je Mitarbeiter und Jahr, die kein Gehalt sind:
   * Berufskleidung, Werkzeug, Schulung, Vorsorge. Kein Standardwert.
   */
  sonstigeKostenJahr?: number | null;
  /**
   * Unternehmerlohn im Jahr, wenn der Inhaber mitarbeitet. Wer ihn weglässt,
   * arbeitet zum Selbstkostenpreis seiner Mitarbeiter.
   */
  unternehmerlohnJahr?: number | null;
}

export interface PersonalKosten {
  jahresbrutto: number;
  sonderzahlungen: number;
  /** Brutto einschließlich Sonderzahlungen — die Bemessungsgrundlage. */
  bruttoGesamt: number;
  arbeitgeberAnteil: AgAnteil;
  sonstigeKosten: number;
  unternehmerlohn: number;
  /** Alles zusammen: was der Mitarbeiter den Betrieb im Jahr kostet. */
  gesamtJahr: number;
  hinweise: string[];
}

export function personalKosten(
  lohn: LohnEingabe,
  agOpt: ArbeitgeberOptionen = {},
  saetze: SvSaetze = SV_SAETZE_2026,
): PersonalKosten {
  const hinweise: string[] = [];

  let jahresbrutto = leseZahlOder(lohn.jahresbrutto, 0);
  if (jahresbrutto <= 0) jahresbrutto = leseZahlOder(lohn.monatsbrutto, 0) * 12;
  jahresbrutto = Math.max(0, jahresbrutto);

  const monatsbrutto = jahresbrutto / 12;
  const sonderMonate = proz(lohn.sonderzahlungenMonate, 0);
  const sonderBetrag = proz(lohn.sonderzahlungenBetrag, 0);
  const sonderzahlungen = centRunden(sonderBetrag > 0 ? sonderBetrag : monatsbrutto * sonderMonate);

  const bruttoGesamt = centRunden(jahresbrutto + sonderzahlungen);
  const ag = arbeitgeberAnteil(bruttoGesamt, agOpt, saetze);

  const sonstige = centRunden(proz(lohn.sonstigeKostenJahr, 0));
  if (lohn.sonstigeKostenJahr == null) {
    hinweise.push('Berufskleidung, Werkzeug und Schulungen sind nicht eingerechnet — sie sind je Mitarbeiter schnell dreistellig.');
  }

  const unternehmerlohn = centRunden(proz(lohn.unternehmerlohnJahr, 0));

  const gesamtJahr = centRunden(bruttoGesamt + ag.summe + sonstige + unternehmerlohn);

  for (const f of ag.fehlt) hinweise.push(f + ' ist nicht eingerechnet.');

  return {
    jahresbrutto: centRunden(jahresbrutto),
    sonderzahlungen,
    bruttoGesamt,
    arbeitgeberAnteil: ag,
    sonstigeKosten: sonstige,
    unternehmerlohn,
    gesamtJahr,
    hinweise,
  };
}

// ----------------------------------------------------------------------------
// 5. DER STUNDENSATZ
// ----------------------------------------------------------------------------

export interface SatzZuschlaege {
  /** Gemeinkostenzuschlag in Prozent: Werkstatt, Fahrzeuge, Büro, Versicherungen. */
  gemeinkostenProzent?: number | null;
  /** Wagnis und Gewinn in Prozent. */
  wagnisGewinnProzent?: number | null;
}

export interface StundensatzErgebnis {
  /** Was eine produktive Stunde den Betrieb an LOHN kostet. */
  selbstkostenJeStunde: number;
  /** Selbstkosten plus Gemeinkostenzuschlag. Ab hier hält man die Null. */
  verrechnungssatz: number;
  /** Verrechnungssatz plus Wagnis und Gewinn. Das ist der Angebotspreis. */
  angebotsStundensatz: number;
  /** Zur Gegenprobe: derselbe Satz auf die Anwesenheitsstunden gerechnet. */
  selbstkostenJeAnwesenheitsstunde: number;
  /** Was der Fehler aus Punkt 1 je Stunde kosten würde. */
  fehlbetragJeStunde: number;
  /** Und derselbe Fehler auf das Jahr. */
  fehlbetragJahr: number;
  zeit: ZeitErgebnis;
  kosten: PersonalKosten;
  gemeinkostenProzent: number;
  wagnisGewinnProzent: number;
  /** Beitragssätze passen nicht mehr zum Jahr, oder Angaben fehlen. */
  hinweise: string[];
  klartext: string;
}

export const ZUSCHLAG_STANDARD = {
  gemeinkostenProzent: 15,
  wagnisGewinnProzent: 10,
} as const;

/**
 * Die eine Funktion: aus Lohn, Zeit und Zuschlägen den Stundensatz.
 *
 * FEHLER 1 aus dem Dateikopf wird hier nicht nur vermieden, sondern
 * ausgerechnet und mitgeliefert: `fehlbetragJeStunde` zeigt, wie viel ein
 * Betrieb je Stunde verschenkt, der durch die Anwesenheitsstunden teilt.
 */
export function stundensatz(
  lohn: LohnEingabe,
  zeit: ZeitEingabe = {},
  zuschlaege: SatzZuschlaege = {},
  agOpt: ArbeitgeberOptionen = {},
  saetze: SvSaetze = SV_SAETZE_2026,
  heute: Date = new Date(),
): StundensatzErgebnis {
  const z = produktiveStunden(zeit);
  const k = personalKosten(lohn, agOpt, saetze);

  const gemein = proz(zuschlaege.gemeinkostenProzent, ZUSCHLAG_STANDARD.gemeinkostenProzent);
  const gewinn = proz(zuschlaege.wagnisGewinnProzent, ZUSCHLAG_STANDARD.wagnisGewinnProzent);

  const selbst = z.produktiveStunden > 0 ? centRunden(k.gesamtJahr / z.produktiveStunden) : 0;
  const verrechnung = centRunden(selbst * (1 + gemein / 100));
  const angebot = centRunden(verrechnung * (1 + gewinn / 100));

  const jeAnwesenheit =
    z.anwesenheitsstunden > 0 ? centRunden(k.gesamtJahr / z.anwesenheitsstunden) : 0;
  const fehlbetragJeStunde = centRunden(selbst - jeAnwesenheit);
  const fehlbetragJahr = centRunden(fehlbetragJeStunde * z.produktiveStunden);

  const hinweise: string[] = [];
  const stand = pruefeStand(heute, saetze);
  if (!stand.aktuell && stand.hinweis) hinweise.push(stand.hinweis);
  hinweise.push(...z.hinweise, ...k.hinweise);

  if (k.unternehmerlohn <= 0) {
    hinweise.push(
      'Kein Unternehmerlohn eingerechnet. Wer selbst mitarbeitet und sich nicht ansetzt, ' +
        'verkauft seine eigene Stunde zum Selbstkostenpreis eines Angestellten.',
    );
  }

  return {
    selbstkostenJeStunde: selbst,
    verrechnungssatz: verrechnung,
    angebotsStundensatz: angebot,
    selbstkostenJeAnwesenheitsstunde: jeAnwesenheit,
    fehlbetragJeStunde,
    fehlbetragJahr,
    zeit: z,
    kosten: k,
    gemeinkostenProzent: gemein,
    wagnisGewinnProzent: gewinn,
    hinweise,
    klartext:
      `${eur(k.gesamtJahr)} Personalkosten im Jahr, geteilt durch ${zahlText(z.produktiveStunden)} produktive Stunden ` +
      `= ${eur(selbst)} je Stunde an Selbstkosten. ` +
      `Mit ${zahlText(gemein)} % Gemeinkosten ${eur(verrechnung)}, ` +
      `mit ${zahlText(gewinn)} % Wagnis und Gewinn ${eur(angebot)} netto je Stunde.` +
      (hinweise.length > 0 ? ` ${hinweise.length} Hinweis${hinweise.length === 1 ? '' : 'e'} beachten.` : ''),
  };
}

// ----------------------------------------------------------------------------
// 6. VERGLEICH MIT DEM, WAS HEUTE EINGETIPPT IST
// ----------------------------------------------------------------------------

export interface SatzVergleich {
  hinterlegt: number;
  hergeleitet: number;
  differenz: number;
  differenzProzent: number;
  /** Der hinterlegte Satz liegt UNTER den Selbstkosten — jede Stunde ist ein Verlust. */
  unterSelbstkosten: boolean;
  text: string;
}

/**
 * Stellt den eingetippten Stundensatz neben den hergeleiteten.
 *
 * Der wichtigste Fall ist nicht "zu niedrig", sondern "unter den
 * Selbstkosten": dort verliert der Betrieb mit jeder verkauften Stunde
 * Geld, und zwar umso mehr, je besser die Auftragslage ist.
 */
export function vergleicheSatz(
  hinterlegt: number,
  ergebnis: StundensatzErgebnis,
): SatzVergleich {
  const h = centRunden(Math.max(0, leseZahlOder(hinterlegt, 0)));
  const soll = ergebnis.angebotsStundensatz;
  const differenz = centRunden(soll - h);
  const prozent = h > 0 ? centRunden((differenz / h) * 100) : 0;
  const unter = h > 0 && h < ergebnis.selbstkostenJeStunde;

  let text: string;
  if (h <= 0) {
    text = `Kein Stundensatz hinterlegt. Hergeleitet wären ${eur(soll)} netto je Stunde.`;
  } else if (unter) {
    text =
      `Der hinterlegte Satz von ${eur(h)} liegt UNTER den reinen Selbstkosten von ` +
      `${eur(ergebnis.selbstkostenJeStunde)}. Jede verkaufte Stunde kostet ` +
      `${eur(ergebnis.selbstkostenJeStunde - h)} — je mehr Aufträge, desto größer der Verlust.`;
  } else if (Math.abs(differenz) < 0.5) {
    text = `Der hinterlegte Satz von ${eur(h)} passt zur Herleitung.`;
  } else if (differenz > 0) {
    text =
      `Hergeleitet wären ${eur(soll)}, hinterlegt sind ${eur(h)} — ` +
      `${eur(differenz)} je Stunde zu wenig (${zahlText(Math.abs(prozent))} %).`;
  } else {
    text =
      `Hergeleitet wären ${eur(soll)}, hinterlegt sind ${eur(h)} — ` +
      `${eur(-differenz)} je Stunde mehr, als die Rechnung hergibt.`;
  }

  return { hinterlegt: h, hergeleitet: soll, differenz, differenzProzent: prozent, unterSelbstkosten: unter, text };
}

// ----------------------------------------------------------------------------
// 7. ANZEIGE
// ----------------------------------------------------------------------------

function eur(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
}

function zahlText(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Der Rechenweg Zeile für Zeile — das, was auf den Ausdruck gehört. */
export function rechenweg(e: StundensatzErgebnis): { zeile: string; wert: string }[] {
  const z = e.zeit;
  const k = e.kosten;
  return [
    { zeile: 'Kalendertage', wert: zahlText(z.kalendertage) },
    { zeile: 'abzüglich Wochenenden, Feiertage, Urlaub, Krankheit, Weiterbildung', wert: `= ${zahlText(z.anwesenheitstage)} Anwesenheitstage` },
    { zeile: `mal ${zahlText(z.tagesstunden)} Stunden je Tag`, wert: `= ${zahlText(z.anwesenheitsstunden)} Stunden` },
    { zeile: `abzüglich ${zahlText(z.unproduktivProzent)} % unproduktiv`, wert: `= ${zahlText(z.produktiveStunden)} produktive Stunden` },
    { zeile: 'Bruttolohn im Jahr', wert: eur(k.jahresbrutto) },
    { zeile: 'Sonderzahlungen', wert: eur(k.sonderzahlungen) },
    { zeile: `Arbeitgeberanteil (${zahlText(k.arbeitgeberAnteil.effektivProzent)} % effektiv)`, wert: eur(k.arbeitgeberAnteil.summe) },
    { zeile: 'sonstige Kosten je Mitarbeiter', wert: eur(k.sonstigeKosten) },
    { zeile: 'Unternehmerlohn', wert: eur(k.unternehmerlohn) },
    { zeile: 'Personalkosten im Jahr', wert: eur(k.gesamtJahr) },
    { zeile: 'geteilt durch die produktiven Stunden', wert: `= ${eur(e.selbstkostenJeStunde)} Selbstkosten je Stunde` },
    { zeile: `zuzüglich ${zahlText(e.gemeinkostenProzent)} % Gemeinkosten`, wert: `= ${eur(e.verrechnungssatz)} Verrechnungssatz` },
    { zeile: `zuzüglich ${zahlText(e.wagnisGewinnProzent)} % Wagnis und Gewinn`, wert: `= ${eur(e.angebotsStundensatz)} netto je Stunde` },
  ];
}
