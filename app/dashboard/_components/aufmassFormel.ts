// ============================================================================
// ARGONAUT OS · aufmassFormel.ts
// Punkt 59 / R9 — Aufmaß-Formeln mit Klammern und Division
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Importe.
// Node-testbar, damit die Formel vor dem Anschließen bewiesen ist.
//
// ▄▄▄ WAS HEUTE FEHLT ▄▄▄
// `rechneMenge()` in aufmassLogik.ts kann Zahlen, × * x, + und −. Sonst nichts.
// Am echten Code nachgesehen (aufmassLogik.ts Z. 140-194):
//
//   "(3,50 + 1,20) x 2,40"   ->  Fehler: "Erlaubt sind nur Zahlen und ..."
//   "12 / 4"                 ->  derselbe Fehler
//
// Beides ist im Aufmaß Alltag. Eine Wand aus zwei Abschnitten mal der Höhe,
// eine Fläche geteilt durch vier Bahnen, ein Umfang geteilt durch den
// Achsabstand. Wer das nicht eintippen kann, rechnet im Kopf und trägt eine
// nackte Zahl ein — und genau dann ist der Rechenweg weg, der als Beleg
// gedacht war.
//
// ▄▄▄ WAS DIESE DATEI ANDERS MACHT ▄▄▄
// Statt die Eingabe an Zeichen zu zerschneiden (das war die Bauart, die am
// 16.09. die stillen Mengen erzeugt hat), liest ein echter Parser sie:
// erst Wortmarken, dann rekursiver Abstieg über eine feste Grammatik.
//
//   ausdruck := ('-')? term (('+'|'-') term)*
//   term     := faktor (('×'|'*'|'x'|'·') faktor | ('/'|':') faktor)*
//   faktor   := zahl | '(' ausdruck ')'
//
// WEITERHIN KEIN eval. Nichts an dieser Datei führt fremden Text aus.
//
// ▄▄▄ DREI FEHLER, DIE DIESE DATEI VERHINDERN SOLL ▄▄▄
//
//  1. EIN UNÄRES MINUS NACH EINEM OPERATOR ZULASSEN.
//     "2*-3" ergab vor dem 16.09. die Menge −1, weil der alte Zerschneider
//     es als "2 − 3" las. Ein mathematisch vollständiger Parser würde daraus
//     −6 machen — also wieder eine plausible Zahl statt einer Rückfrage.
//     In einem Aufmaß gibt es keinen negativen Faktor: eine Wand ist nie
//     −3 m lang. "2 × −3" ist immer ein Tippfehler, und diese Datei sagt das.
//     Ein führendes Minus am Anfang (Abzugsmenge, "12 − 1,5") bleibt erlaubt,
//     genau wie bisher.
//
//  2. EINE TEILUNG DURCH NULL ZU Infinity WERDEN LASSEN.
//     `12 / 0` ist in JavaScript Infinity. Über runde3 käme daraus eine
//     Menge, die in keiner Anzeige als Fehler auffällt. Deshalb: eigener
//     Fehler, keine Zahl.
//
//  3. EINE OFFENE KLAMMER STILL SCHLIESSEN.
//     "(3,50 + 1,20 x 2,40" ohne Schlusszeichen ist eine abgebrochene
//     Eingabe — dieselbe Familie wie "8,20 x". Sie wird gemeldet, nicht
//     zurechtgebogen.
//
// ▄▄▄ ANDOCKPUNKT (noch nicht verbunden) ▄▄▄
// Diese Datei ruft NIEMAND auf. Das Anschließen kommt getrennt und mit
// Ansage, weil `rechneMenge` in app/dashboard/aufmass/page.tsx Z. 341 im
// scharf geschalteten Klickweg liegt. Beim Anschließen ersetzt
// `rechneFormel` den Rumpf von `rechneMenge`, und aufmassLogik.runde3
// verschwindet zugunsten des hier exportierten `runde3` — sonst stünden
// zwei Runder nebeneinander, und genau das ist Punkt 30.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. GRENZEN
// ----------------------------------------------------------------------------

/** Längste Eingabe, die verarbeitet wird. Darüber: Fehler statt Rechenzeit. */
export const MAX_ZEICHEN = 200;

/** Tiefste Klammerschachtelung. Darüber: Fehler statt Stapelüberlauf. */
export const MAX_TIEFE = 20;

/** Multiplikationszeichen, die ein Bediener tatsächlich tippt. */
export const MAL_ZEICHEN = ['×', '*', 'x', 'X', '·'] as const;

/** Teilungszeichen, die ein Bediener tatsächlich tippt. */
export const GETEILT_ZEICHEN = ['/', ':', '÷'] as const;

/** Das echte Minuszeichen U+2212 und der Bindestrich gelten gleich. */
export const MINUS_ZEICHEN = ['-', '−', '–'] as const;

// ----------------------------------------------------------------------------
// 2. ERGEBNIS
// ----------------------------------------------------------------------------

export interface FormelErgebnis {
  /** Auf 3 Nachkommastellen gerundet. Null, wenn die Eingabe unverständlich ist. */
  menge: number | null;
  /** Normalisierter Rechenweg, z. B. "(3,50 + 1,20) × 2,40". Null bei reiner Zahl. */
  rechenweg: string | null;
  /** Genau dann gesetzt, wenn menge null ist. */
  fehler: string | null;
  /**
   * Nicht blockierend. Die Menge steht trotzdem.
   * Beispiel: ein Punkt, der als Dezimaltrenner gelesen wurde, obwohl er
   * auch ein Tausenderpunkt sein könnte.
   */
  hinweise: string[];
}

// ----------------------------------------------------------------------------
// 3. RUNDEN
// ----------------------------------------------------------------------------

/**
 * Kaufmännisch runden, symmetrisch um Null.
 *
 * Gleiche Bauart wie aufmassLogik.runde3 und holzLogik.runde — bewusst, damit
 * beim Anschließen nicht zwei Runder nebeneinander stehen. Symmetrisch heißt:
 * −2,3455 wird −2,346, nicht −2,345. Math.round allein rundet auf dem
 * vorzeichenbehafteten Wert und schiebt den halben Schritt immer nach oben.
 */
export function runde3(n: number, stellen = 3): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, stellen);
  const v = Math.round((Math.abs(n) + Number.EPSILON) * f) / f;
  return n < 0 ? -v : v;
}

// ----------------------------------------------------------------------------
// 4. ZAHLEN LESEN
// ----------------------------------------------------------------------------

export interface ZahlErgebnis {
  wert: number;
  /** Der Punkt wurde als Dezimaltrenner gelesen, könnte aber Tausender sein. */
  mehrdeutig: boolean;
}

/**
 * Liest eine deutsche Zahl.
 *
 *   "8,20"      -> 8.2
 *   "1.234,50"  -> 1234.5     (Punkt ist Tausendertrenner, weil ein Komma da ist)
 *   "8.2"       -> 8.2        (Punkt ist Dezimaltrenner, kein Komma da)
 *   "1.234"     -> 1.234      mehrdeutig: könnte 1234 gemeint sein
 *
 * Das Verhalten ist absichtlich dasselbe wie in aufmassLogik.zahl(), damit
 * beim Anschließen keine bestehende Eingabe plötzlich anders gelesen wird.
 * NEU ist nur die Meldung `mehrdeutig` — sie ändert nichts, sie sagt etwas.
 */
export function leseZahl(text: string): ZahlErgebnis | null {
  let s = text.trim().replace(/\s+/g, '');
  if (s === '') return null;

  const hatKomma = s.includes(',');
  const punkte = (s.match(/\./g) || []).length;

  if (hatKomma && punkte > 0) {
    s = s.replace(/\./g, '');
  }
  s = s.replace(',', '.');

  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?\d*$/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  // Ein einzelner Punkt mit genau drei Ziffern dahinter und keinem Komma
  // irgendwo: "1.234" kann 1,234 oder 1234 sein. Gelesen wird wie bisher,
  // gemeldet wird es trotzdem.
  const mehrdeutig = !hatKomma && punkte === 1 && /^\d{1,3}\.\d{3}$/.test(text.trim());

  return { wert: n, mehrdeutig };
}

// ----------------------------------------------------------------------------
// 5. WORTMARKEN
// ----------------------------------------------------------------------------

type MarkenArt = 'zahl' | 'mal' | 'geteilt' | 'plus' | 'minus' | 'auf' | 'zu';

interface Marke {
  art: MarkenArt;
  /** Nur bei 'zahl': der gelesene Wert. */
  wert?: number;
  /** Nur bei 'zahl': der Text, wie er im Rechenweg erscheinen soll. */
  text?: string;
  /** Nur bei 'zahl': der Punkt war mehrdeutig. */
  mehrdeutig?: boolean;
  /** Stelle in der Eingabe, für die Fehlermeldung. */
  stelle: number;
}

class FormelFehler extends Error {}

function istZiffernZeichen(z: string): boolean {
  return /[0-9.,]/.test(z);
}

/** Zerlegt die Eingabe in Wortmarken. Wirft FormelFehler bei fremden Zeichen. */
function markiere(roh: string): Marke[] {
  const marken: Marke[] = [];
  let i = 0;

  while (i < roh.length) {
    const z = roh[i];

    if (/\s/.test(z)) { i += 1; continue; }

    if (istZiffernZeichen(z)) {
      const start = i;
      while (i < roh.length && istZiffernZeichen(roh[i])) i += 1;
      const stueck = roh.slice(start, i);
      const gelesen = leseZahl(stueck);
      if (gelesen === null) {
        throw new FormelFehler(`"${stueck}" ist keine Zahl.`);
      }
      marken.push({
        art: 'zahl',
        wert: gelesen.wert,
        text: zahlText(stueck),
        mehrdeutig: gelesen.mehrdeutig,
        stelle: start,
      });
      continue;
    }

    if ((MAL_ZEICHEN as readonly string[]).includes(z)) {
      marken.push({ art: 'mal', stelle: i }); i += 1; continue;
    }
    if ((GETEILT_ZEICHEN as readonly string[]).includes(z)) {
      marken.push({ art: 'geteilt', stelle: i }); i += 1; continue;
    }
    if (z === '+') {
      marken.push({ art: 'plus', stelle: i }); i += 1; continue;
    }
    if ((MINUS_ZEICHEN as readonly string[]).includes(z)) {
      marken.push({ art: 'minus', stelle: i }); i += 1; continue;
    }
    if (z === '(' || z === '[') {
      marken.push({ art: 'auf', stelle: i }); i += 1; continue;
    }
    if (z === ')' || z === ']') {
      marken.push({ art: 'zu', stelle: i }); i += 1; continue;
    }

    throw new FormelFehler(
      `Das Zeichen "${z}" gehört nicht in eine Aufmaß-Formel. ` +
        'Erlaubt sind Zahlen, Klammern und die Zeichen × * x / : + −',
    );
  }

  return marken;
}

/** Schreibweise einer Zahl für den Rechenweg: Punkt wird Komma. */
function zahlText(roh: string): string {
  const s = roh.trim();
  if (s.includes(',')) return s;
  if (s.includes('.')) return s.replace('.', ',');
  return s;
}

// ----------------------------------------------------------------------------
// 6. PARSER — rekursiver Abstieg
// ----------------------------------------------------------------------------

interface Knoten {
  wert: number;
  /** Rechenweg dieses Teilbaums. */
  weg: string;
  /** true, wenn der Teilbaum eine Summe ist und beim Multiplizieren Klammern braucht. */
  istSumme: boolean;
  mehrdeutig: boolean;
}

class Leser {
  private i = 0;
  constructor(private readonly marken: Marke[]) {}

  private schau(): Marke | undefined { return this.marken[this.i]; }
  private nimm(): Marke | undefined { return this.marken[this.i++]; }
  fertig(): boolean { return this.i >= this.marken.length; }
  rest(): Marke | undefined { return this.marken[this.i]; }

  /** ausdruck := ('-')? term (('+'|'-') term)* */
  ausdruck(tiefe: number): Knoten {
    if (tiefe > MAX_TIEFE) {
      throw new FormelFehler('Die Formel ist zu tief verschachtelt.');
    }

    let vorzeichen = 1;
    let fuehrendesMinus = false;
    const erstes = this.schau();
    if (erstes && erstes.art === 'minus') {
      this.nimm();
      vorzeichen = -1;
      fuehrendesMinus = true;
    } else if (erstes && erstes.art === 'plus') {
      this.nimm();
    }

    let links = this.term(tiefe);
    let wert = vorzeichen * links.wert;
    let weg = (fuehrendesMinus ? '− ' : '') + links.weg;
    let mehrdeutig = links.mehrdeutig;
    let istSumme = fuehrendesMinus;

    for (;;) {
      const naechste = this.schau();
      if (!naechste || (naechste.art !== 'plus' && naechste.art !== 'minus')) break;
      this.nimm();
      const rechts = this.term(tiefe);
      wert = naechste.art === 'plus' ? wert + rechts.wert : wert - rechts.wert;
      weg += (naechste.art === 'plus' ? ' + ' : ' − ') + rechts.weg;
      mehrdeutig = mehrdeutig || rechts.mehrdeutig;
      istSumme = true;
    }

    return { wert, weg, istSumme, mehrdeutig };
  }

  /** term := faktor (mal faktor | geteilt faktor)* */
  private term(tiefe: number): Knoten {
    let links = this.faktor(tiefe);
    let wert = links.wert;
    let weg = links.istSumme ? `(${links.weg})` : links.weg;
    let mehrdeutig = links.mehrdeutig;

    for (;;) {
      const naechste = this.schau();
      if (!naechste || (naechste.art !== 'mal' && naechste.art !== 'geteilt')) break;
      this.nimm();
      const rechts = this.faktor(tiefe);

      if (naechste.art === 'geteilt') {
        if (rechts.wert === 0) {
          throw new FormelFehler('Teilung durch Null — bitte den Teiler prüfen.');
        }
        wert = wert / rechts.wert;
      } else {
        wert = wert * rechts.wert;
      }

      const rechtsWeg = rechts.istSumme ? `(${rechts.weg})` : rechts.weg;
      weg += (naechste.art === 'mal' ? ' × ' : ' / ') + rechtsWeg;
      mehrdeutig = mehrdeutig || rechts.mehrdeutig;
    }

    return { wert, weg, istSumme: false, mehrdeutig };
  }

  /** faktor := zahl | '(' ausdruck ')' */
  private faktor(tiefe: number): Knoten {
    const marke = this.nimm();

    if (!marke) {
      throw new FormelFehler('Unvollständige Rechnung — am Ende fehlt eine Zahl.');
    }

    if (marke.art === 'zahl') {
      return {
        wert: marke.wert as number,
        weg: marke.text as string,
        istSumme: false,
        mehrdeutig: marke.mehrdeutig === true,
      };
    }

    if (marke.art === 'auf') {
      const inner = this.ausdruck(tiefe + 1);
      const schluss = this.nimm();
      if (!schluss || schluss.art !== 'zu') {
        throw new FormelFehler('Eine Klammer wurde geöffnet und nicht geschlossen.');
      }
      // Die Klammer bleibt im Rechenweg stehen, auch wenn sie rechnerisch
      // entbehrlich ist — der Bediener hat sie getippt, und der Rechenweg
      // ist sein Beleg, nicht meine Kurzfassung.
      return { wert: inner.wert, weg: `(${inner.weg})`, istSumme: false, mehrdeutig: inner.mehrdeutig };
    }

    if (marke.art === 'minus' || marke.art === 'plus') {
      // FEHLER 1 aus dem Dateikopf: kein Vorzeichen nach einem Operator.
      throw new FormelFehler(
        'Ein Vorzeichen mitten in der Rechnung ist keine Aufmaß-Formel. ' +
          'Eine Länge ist nie negativ — bitte prüfen, ob ein × oder + zu viel steht.',
      );
    }

    if (marke.art === 'zu') {
      throw new FormelFehler('Eine Klammer wurde geschlossen, die nie geöffnet wurde.');
    }

    throw new FormelFehler('Unvollständige Rechnung — vor oder nach einem Zeichen fehlt eine Zahl.');
  }
}

// ----------------------------------------------------------------------------
// 7. DIE EINE FUNKTION
// ----------------------------------------------------------------------------

/**
 * Rechnet eine Aufmaß-Eingabe aus.
 *
 *   "47,31"                      -> 47,31                     (keine Formel)
 *   "8,20 x 5,77"                -> 47,314                    "8,20 × 5,77"
 *   "(3,50 + 1,20) x 2,40"       -> 11,28                     "(3,50 + 1,20) × 2,40"
 *   "24 / 4"                     -> 6                         "24 / 4"
 *   "2,50 * 1,80 * 4"            -> 18
 *   "8,20 x 5,77 + 3,5"          -> 50,814
 *   "12 - 1,5"                   -> 10,5
 *
 * Und was NICHT geht, geht mit einer Meldung nicht:
 *
 *   "8,20 x"    "2*"    "2**3"    "2*-3"    "12 / 0"    "(3 + 1"
 */
export function rechneFormel(eingabe: string | null | undefined): FormelErgebnis {
  const roh = (eingabe ?? '').trim();
  const hinweise: string[] = [];

  if (roh === '') {
    return { menge: null, rechenweg: null, fehler: 'Bitte eine Menge eingeben.', hinweise };
  }

  if (roh.length > MAX_ZEICHEN) {
    return {
      menge: null,
      rechenweg: null,
      fehler: `Die Eingabe ist zu lang (${roh.length} Zeichen, erlaubt sind ${MAX_ZEICHEN}).`,
      hinweise,
    };
  }

  let marken: Marke[];
  try {
    marken = markiere(roh);
  } catch (e) {
    return { menge: null, rechenweg: null, fehler: fehlerText(e), hinweise };
  }

  if (marken.length === 0) {
    return { menge: null, rechenweg: null, fehler: 'Bitte eine Menge eingeben.', hinweise };
  }

  let baum: Knoten;
  const leser = new Leser(marken);
  try {
    baum = leser.ausdruck(0);
    if (!leser.fertig()) {
      const uebrig = leser.rest();
      if (uebrig && uebrig.art === 'zu') {
        throw new FormelFehler('Eine Klammer wurde geschlossen, die nie geöffnet wurde.');
      }
      throw new FormelFehler('Unvollständige Rechnung — nach der letzten Zahl steht noch etwas.');
    }
  } catch (e) {
    return { menge: null, rechenweg: null, fehler: fehlerText(e), hinweise };
  }

  if (!Number.isFinite(baum.wert)) {
    return {
      menge: null,
      rechenweg: null,
      fehler: 'Das Ergebnis ist keine brauchbare Zahl — bitte die Formel prüfen.',
      hinweise,
    };
  }

  if (baum.mehrdeutig) {
    hinweise.push(
      'Ein Punkt wurde als Komma gelesen (z. B. 1.234 = 1,234). ' +
        'War ein Tausenderpunkt gemeint, bitte ohne Punkt eintippen.',
    );
  }

  const menge = runde3(baum.wert);

  if (menge < 0) {
    hinweise.push('Die Formel ergibt eine negative Menge. Bitte prüfen, ob das so gewollt ist.');
  }

  // Eine reine Zahl ohne Rechnung trägt keinen Rechenweg — genau wie bisher.
  // Ein führendes Minus zählt mit dazu: rechneMenge() behandelt "-5" heute als
  // reine Zahl und gibt rechenweg = null zurück. Ohne diese zweite Zeile wäre
  // das Anschließen eine sichtbare Änderung auf jedem Aufmaßblatt mit einer
  // Abzugsmenge — eine Verhaltensänderung, die niemand bestellt hat.
  const nurZahl =
    (marken.length === 1 && marken[0].art === 'zahl') ||
    (marken.length === 2 && marken[0].art === 'minus' && marken[1].art === 'zahl');

  return { menge, rechenweg: nurZahl ? null : baum.weg, fehler: null, hinweise };
}

function fehlerText(e: unknown): string {
  if (e instanceof FormelFehler) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Die Formel konnte nicht gelesen werden.';
}

// ----------------------------------------------------------------------------
// 8. HILFE FÜR DIE OBERFLÄCHE
// ----------------------------------------------------------------------------

/** Kurze Beispiele für ein Hilfefeld neben der Eingabe. */
export const FORMEL_BEISPIELE: readonly { formel: string; bedeutet: string }[] = [
  { formel: '8,20 × 5,77', bedeutet: 'Länge mal Breite' },
  { formel: '(3,50 + 1,20) × 2,40', bedeutet: 'zwei Wandabschnitte mal Höhe' },
  { formel: '24 / 4', bedeutet: 'Fläche auf vier Bahnen geteilt' },
  { formel: '8,20 × 5,77 − 2,10 × 0,90', bedeutet: 'Fläche abzüglich einer Tür' },
  { formel: '2,50 × 1,80 × 4', bedeutet: 'vier gleiche Flächen' },
];

/**
 * Prüft eine Eingabe, ohne zu rechnen — für eine Live-Rückmeldung im Feld,
 * während getippt wird. Gibt null zurück, wenn alles in Ordnung ist.
 */
export function formelFehler(eingabe: string | null | undefined): string | null {
  return rechneFormel(eingabe).fehler;
}
