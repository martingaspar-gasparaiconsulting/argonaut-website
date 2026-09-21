// ============================================================================
// ARGONAUT OS · lib/gaeb.ts — GAEB-DA-XML (Ausschreibungs-Austausch)
//
// GAEB ist das Standard-Austauschformat für Leistungsverzeichnisse (LV) im Bau:
// Architekt/GU schickt eine Ausschreibung (Phase 83), der Betrieb liest sie ein,
// kalkuliert die Preise und gibt sein Angebot (Phase 84) als GAEB zurück.
//
// Diese Datei ist REINE Logik (String rein/raus). parseGaeb() nutzt den
// Browser-DOMParser — daher NUR aus Client-Komponenten aufrufen.
//
// ANSATZ:
//  - LESEN bewusst TOLERANT: GAEB-Dateien kommen aus vielen Programmen und
//    Versionen (2.0 / 3.x, DA81/83/84/86). Wir suchen die Element-Namen
//    (Item, Qty, QU, UP, Description …) namespace-unabhängig über localName,
//    statt auf eine exakte Schema-Variante zu bestehen.
//  - SCHREIBEN standardkonform als GAEB DA XML 3.2, Phase DA84 (Angebot).
//    Der eigene Export ist wieder importierbar (Rundlauf-Sicherung).
//
// ────────────────────────────────────────────────────────────────────────────
// PUNKT 65 / R12 · Paket 3 (21.09.2026) — WAS HIER REPARIERT WURDE
//
// ▄▄▄ BEFUND 1: Qty × UP ergab nicht IT — das Angebot wird zurückgewiesen ▄▄▄
// Geschrieben wurden die GERUNDETEN Werte für Qty und UP, der Gesamtbetrag IT
// aber aus den UNGERUNDETEN. Jedes GAEB-Prüfprogramm beim Architekten rechnet
// die Zeile nach und weist das Angebot als formal fehlerhaft zurück.
//
// GEMESSEN am alten Stand, Position 12,345 m² zu 14,367 EUR/m²:
//     <Qty>12.35</Qty>  <UP>14.37</UP>  <IT>177.36</IT>
//     12.35 × 14.37 = 177.47  —  in der Datei stand 177.36
//     → 0,11 EUR Abweichung in EINER Zeile.
//
// Jetzt gilt durchgehend: erst runden, dann rechnen. IT entsteht aus genau den
// Zahlen, die auch in der Datei stehen. Der Prüfrechner kommt auf dasselbe.
//
// ▄▄▄ BEFUND 2: die Menge wurde auf 2 Stellen gerundet ▄▄▄
// GAEB erlaubt beim Vordersatz 3 Nachkommastellen. Aus 12,345 m² wurden 12,35 —
// das ist beim Aufmaß bares Geld und bei Tonnen/Kubikmetern spürbar. Jetzt 3.
//
// ▄▄▄ BEFUND 3: toFixed(2) trifft den Grenzfall nicht ▄▄▄
// GEMESSEN: (2.675).toFixed(2) = "2.67", (1.005).toFixed(2) = "1.00".
// Das ist derselbe Befund wie in Punkt 53. Gerundet wird jetzt symmetrisch
// über centRunden() aus lib/zahlen.ts bzw. rundeAuf() nach demselben Muster.
//
// ▄▄▄ BEFUND 4: das Dateidatum nahm die Zeitzone des Servers ▄▄▄
// heuteIso() nutzte getMonth()/getDate(). Auf einem UTC-Server (Vercel) trägt
// ein Angebot, das um 23:30 deutscher Zeit erzeugt wird, den VORTAG. Jetzt UTC,
// und das Datum lässt sich für Tests hereinreichen.
//
// ▄▄▄ BEFUND 5: der Zahlen-Leser verschluckte Tausendertrennzeichen ▄▄▄
// zahl() machte .replace(',', '.') — nur das ERSTE Komma. Aus "1.234,56" wurde
// "1.234.56" und daraus null. Eine Position über 1.000 EUR kam mit Preis 0 an.
//
// ▄▄▄ WAS SICH DAMIT FÜR MARTIN SICHTBAR ÄNDERT ▄▄▄
// Die Angebotssumme in der GAEB-Datei kann jetzt um einige Cent von der Summe
// abweichen, die ARGONAUT intern rechnet — weil sie aus den gerundeten
// Positionsbeträgen gebildet wird, so wie GAEB es verlangt. Das ist kein
// Fehler, sondern der Zweck. baueGaebMitBericht() gibt diese Abweichung
// ausdrücklich zurück, damit die Oberfläche sie benennen kann.
// ============================================================================

import { centRunden, leseZahl } from './zahlen';

export interface GaebPosition {
  /** Ordnungszahl (OZ / RNoPart), z. B. "01.0010". */
  oz: string;
  /** Kurztext der Position. */
  kurztext: string;
  /** Ausführlicher Langtext (optional). */
  langtext?: string;
  /** Menge / Vordersatz. */
  menge: number;
  /** Mengeneinheit (m², lfm, Stk …). */
  einheit: string;
  /** Einheitspreis netto — im Angebot (84) gesetzt, in der Ausschreibung (83) oft leer. */
  einzelpreis: number | null;
}

export interface GaebLV {
  projekt: string;
  waehrung: string;
  positionen: GaebPosition[];
}

/**
 * Nachkommastellen, wie GAEB DA XML sie für die beiden Felder vorsieht.
 * Qty (Vordersatz): 3 · UP (Einheitspreis) und IT (Gesamtbetrag): 2.
 */
export const QTY_STELLEN = 3;
export const PREIS_STELLEN = 2;

// ----------------------------------------------------------------------------
// ZAHLEN
// ----------------------------------------------------------------------------

/**
 * Symmetrisch auf `stellen` Nachkommastellen runden — dasselbe Muster wie
 * centRunden() in lib/zahlen.ts, nur mit frei wählbarer Stellenzahl.
 *
 * Warum nicht einfach toFixed(): GEMESSEN ist (2.675).toFixed(2) = "2.67" und
 * (1.005).toFixed(2) = "1.00". Die Binärdarstellung liegt knapp unter dem
 * Grenzwert, und toFixed rundet ab. Mit dem Epsilon-Zuschlag auf dem BETRAG
 * (nicht auf dem vorzeichenbehafteten Wert) trifft es beide Richtungen gleich.
 */
export function rundeAuf(n: number, stellen: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, Math.max(0, Math.floor(stellen)));
  const v = Math.round((Math.abs(n) + Number.EPSILON) * f) / f;
  if (v === 0) return 0;           // kein "-0"
  return n < 0 ? -v : v;
}

/**
 * Liest eine Zahl aus einem GAEB-Feld.
 *
 * GAEB DA XML schreibt den PUNKT als Dezimaltrennzeichen vor — "12.345" sind
 * zwölfkommadreivierfünf, nicht zwölftausend. Exportprogramme aus dem
 * deutschsprachigen Raum liefern aber auch Komma-Schreibweisen. Deshalb wird
 * die Schreibweise hier am Text selbst entschieden:
 *
 *   · beide Trennzeichen vorhanden  → das RECHTE ist das Dezimaltrennzeichen
 *   · nur Komma                     → Dezimalkomma  ("12,345" → 12,345)
 *   · nur Punkt, einer              → Dezimalpunkt  ("12.345" → 12,345, GAEB-Norm)
 *   · nur Punkt, mehrere            → Tausenderpunkte ("1.234.567" → 1234567)
 *
 * Der alte Leser machte .replace(',', '.') und ersetzte damit nur das ERSTE
 * Komma: aus "1.234,56" wurde "1.234.56" und daraus null — die Position kam
 * mit Preis 0 an. GEMESSEN.
 */
export function gaebZahl(s: string): number | null {
  const t = (s || '').replace(/\s/g, '');
  if (t === '') return null;

  const hatKomma = t.includes(',');
  const hatPunkt = t.includes('.');

  let roh: string;
  if (hatKomma && hatPunkt) {
    // Das rechte Zeichen trennt die Nachkommastellen, das linke gruppiert.
    const dezimal = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    const gruppe = dezimal === ',' ? '.' : ',';
    roh = t.split(gruppe).join('').replace(dezimal, '.');
  } else if (hatKomma) {
    if (t.split(',').length > 2) return null;  // "1,234,567" ist in GAEB nichts
    roh = t.replace(',', '.');
  } else if (hatPunkt) {
    // Mehrere Punkte können nur Tausendertrennzeichen sein.
    roh = t.split('.').length > 2 ? t.split('.').join('') : t;
  } else {
    roh = t;
  }

  if (!/^[+-]?\d*\.?\d*$/.test(roh) || !/\d/.test(roh)) return null;
  const n = Number(roh);
  return Number.isFinite(n) ? n : null;
}

// ----------------------------------------------------------------------------
// LESEN
// ----------------------------------------------------------------------------

/** Alle Nachfahren mit diesem localName (namespace-unabhängig). */
function alle(wurzel: Element, local: string): Element[] {
  const out: Element[] = [];
  const stack: Element[] = [...Array.from(wurzel.children)];
  while (stack.length) {
    const el = stack.shift() as Element;
    if (el.localName === local) out.push(el);
    for (const c of Array.from(el.children)) stack.push(c);
  }
  return out;
}

/** Text des ERSTEN Nachfahren mit einem der Namen (in Reihenfolge). */
function ersterText(wurzel: Element, namen: string[]): string {
  for (const n of namen) {
    const t = alle(wurzel, n)[0];
    if (t) {
      const s = (t.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (s) return s;
    }
  }
  return '';
}

/**
 * Liest eine GAEB-DA-XML-Datei in ein LV.
 * @throws Error wenn die Datei kein lesbares GAEB/XML ist.
 */
export function parseGaeb(xml: string): GaebLV {
  if (typeof DOMParser === 'undefined') {
    throw new Error('GAEB-Import ist nur im Browser möglich.');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
    throw new Error('Die Datei ist kein gültiges XML.');
  }
  const root = doc.documentElement;

  const projekt = ersterText(root, ['NamePrj', 'Name', 'LblTx']) || 'GAEB-Import';
  const waehrung = ersterText(root, ['Cur', 'Currency']) || 'EUR';

  const items = alle(root, 'Item');
  const positionen: GaebPosition[] = [];
  for (const item of items) {
    // Reine Zwischentitel ohne Menge überspringen (haben keine Qty).
    const mengeText = ersterText(item, ['Qty']);
    const menge = gaebZahl(mengeText);
    const kurztext =
      ersterText(item, ['OutlTxt', 'OutlineText', 'TextOutlTxt', 'CompleteText', 'Description', 'ShortText']) ||
      '';
    if (menge === null && !kurztext) continue;

    const langtext = ersterText(item, ['DetailTxt']);
    const oz = item.getAttribute('RNoPart') || item.getAttribute('RNoIndex') || ersterText(item, ['ID', 'RNoPart']) || '';

    positionen.push({
      oz,
      kurztext: kurztext || 'Position',
      langtext: langtext || undefined,
      menge: menge ?? 0,
      einheit: ersterText(item, ['QU', 'Unit']) || '',
      einzelpreis: gaebZahl(ersterText(item, ['UP', 'UPrice'])),
    });
  }

  return { projekt, waehrung, positionen };
}

// ----------------------------------------------------------------------------
// SCHREIBEN
// ----------------------------------------------------------------------------

function esc(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Zahl als GAEB-Feldtext mit fester Stellenzahl — symmetrisch gerundet. */
export function dez(n: number | null | undefined, stellen: number = PREIS_STELLEN): string {
  const roh = Number.isFinite(n as number) ? (n as number) : 0;
  return rundeAuf(roh, stellen).toFixed(Math.max(0, Math.floor(stellen)));
}

/**
 * Das heutige Datum als YYYY-MM-DD in UTC.
 *
 * Vorher wurde mit getMonth()/getDate() gearbeitet, also in der Zeitzone des
 * Servers. Auf Vercel läuft der in UTC: ein Angebot, das um 23:30 deutscher
 * Zeit erzeugt wird, trug den VORTAG. Derselbe Befund wie bei datevExtf und
 * zugferd.
 */
export function heuteIso(jetzt: Date = new Date()): string {
  return new Date(jetzt.getTime()).toISOString().slice(0, 10);
}

export type GaebOptionen = {
  /** Dateidatum als YYYY-MM-DD. Ohne Angabe: heute (UTC). Für Tests. */
  datumIso?: string;
};

/** Eine Position, so wie sie WIRKLICH in der Datei landet. */
export type GaebZeile = {
  oz: string;
  /** Der Vordersatz, auf 3 Stellen gerundet — genau dieser Wert steht in <Qty>. */
  menge: number;
  /** Der Einheitspreis, auf 2 Stellen gerundet — genau dieser Wert steht in <UP>. */
  einzelpreis: number;
  /** menge × einzelpreis, auf 2 Stellen — genau dieser Wert steht in <IT>. */
  gesamt: number;
  /** Die Menge musste für die Datei gerundet werden. */
  mengeGerundet: boolean;
  /** Der Einheitspreis musste für die Datei gerundet werden. */
  preisGerundet: boolean;
};

export type GaebBericht = {
  /** Summe der Positionsbeträge, wie sie in der Datei stehen. */
  summe: number;
  /** Summe aus den ungerundeten Eingabewerten — das, was ARGONAUT intern rechnet. */
  summeUngerundet: number;
  /** summe − summeUngerundet. Cent-Beträge sind normal, sie sind der Preis der Norm. */
  abweichung: number;
  zeilen: GaebZeile[];
  /** Klartext für die Oberfläche. Leer, wenn es nichts zu sagen gibt. */
  hinweise: string[];
};

function euro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Baut ein GAEB DA XML 3.2 · Phase 84 (Angebot) aus einem LV — und gibt
 * daneben aus, was dabei gerundet werden musste.
 *
 * DIE REGEL, auf der alles steht: erst runden, dann rechnen. <IT> entsteht aus
 * genau den Zahlen, die in <Qty> und <UP> stehen, und <Total> ist die Summe
 * der <IT>. Damit kommt das Prüfprogramm beim Architekten Zeile für Zeile auf
 * dasselbe Ergebnis.
 */
export function baueGaebMitBericht(lv: GaebLV, opt: GaebOptionen = {}): { xml: string; bericht: GaebBericht } {
  const zeilen: GaebZeile[] = [];

  const items = (lv.positionen || []).map((p, i) => {
    const oz = (p.oz && p.oz.trim()) || String((i + 1) * 10).padStart(4, '0');

    const mengeRoh = Number.isFinite(p.menge) ? p.menge : 0;
    const preisRoh = Number.isFinite(p.einzelpreis as number) ? (p.einzelpreis as number) : 0;

    // Erst runden …
    const menge = rundeAuf(mengeRoh, QTY_STELLEN);
    const preis = rundeAuf(preisRoh, PREIS_STELLEN);
    // … dann rechnen. NICHT umgekehrt — das war der Fehler.
    const gesamt = centRunden(menge * preis);

    zeilen.push({
      oz,
      menge,
      einzelpreis: preis,
      gesamt,
      mengeGerundet: menge !== mengeRoh,
      preisGerundet: preis !== preisRoh,
    });

    return `        <Item RNoPart="${esc(oz)}">
          <Qty>${dez(menge, QTY_STELLEN)}</Qty>
          <QU>${esc(p.einheit)}</QU>
          <Description>
            <CompleteText>
              <OutlineText><OutlTxt><TextOutlTxt><span>${esc(p.kurztext)}</span></TextOutlTxt></OutlTxt></OutlineText>${
                p.langtext ? `\n              <DetailTxt><Text><p><span>${esc(p.langtext)}</span></p></Text></DetailTxt>` : ''
              }
            </CompleteText>
          </Description>
          <UP>${dez(preis, PREIS_STELLEN)}</UP>
          <IT>${dez(gesamt, PREIS_STELLEN)}</IT>
        </Item>`;
  }).join('\n');

  // Die Angebotssumme ist die Summe der geschriebenen Positionsbeträge.
  const summe = centRunden(zeilen.reduce((s, z) => s + z.gesamt, 0));
  const summeUngerundet = centRunden(
    (lv.positionen || []).reduce(
      (s, p) =>
        s +
        (Number.isFinite(p.menge) ? p.menge : 0) *
          (Number.isFinite(p.einzelpreis as number) ? (p.einzelpreis as number) : 0),
      0,
    ),
  );
  const abweichung = centRunden(summe - summeUngerundet);

  const hinweise: string[] = [];
  if (abweichung !== 0) {
    hinweise.push(
      `Die GAEB-Datei weist ${euro(summe)} EUR aus, die Kalkulation rechnet ${euro(summeUngerundet)} EUR ` +
      `— ${euro(Math.abs(abweichung))} EUR ${abweichung > 0 ? 'mehr' : 'weniger'}. ` +
      `Das ist kein Fehler: GAEB verlangt, dass jede Zeile aus den gerundeten Werten gerechnet wird, ` +
      `und die Angebotssumme ist die Summe dieser Zeilen. Der Prüfrechner des Architekten kommt auf denselben Betrag.`,
    );
  }
  const gerundeteMengen = zeilen.filter((z) => z.mengeGerundet);
  if (gerundeteMengen.length > 0) {
    hinweise.push(
      `${gerundeteMengen.length} ${gerundeteMengen.length === 1 ? 'Menge wurde' : 'Mengen wurden'} auf ` +
      `${QTY_STELLEN} Nachkommastellen gerundet (${gerundeteMengen.slice(0, 5).map((z) => z.oz).join(', ')}` +
      `${gerundeteMengen.length > 5 ? ', …' : ''}). Mehr lässt GAEB beim Vordersatz nicht zu.`,
    );
  }
  const gerundetePreise = zeilen.filter((z) => z.preisGerundet);
  if (gerundetePreise.length > 0) {
    hinweise.push(
      `${gerundetePreise.length} ${gerundetePreise.length === 1 ? 'Einheitspreis wurde' : 'Einheitspreise wurden'} auf ` +
      `Cent gerundet (${gerundetePreise.slice(0, 5).map((z) => z.oz).join(', ')}` +
      `${gerundetePreise.length > 5 ? ', …' : ''}). Der Einheitspreis ist im Angebot verbindlich — ` +
      `bitte kurz ansehen, ob der gerundete Preis so gewollt ist.`,
    );
  }

  const datum = (opt.datumIso || '').trim() || heuteIso();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2">
  <GAEBInfo>
    <Version>3.2</Version>
    <Date>${esc(datum)}</Date>
    <ProgSystem>ARGONAUT OS</ProgSystem>
  </GAEBInfo>
  <PrjInfo>
    <NamePrj>${esc(lv.projekt)}</NamePrj>
    <Cur>${esc(lv.waehrung || 'EUR')}</Cur>
  </PrjInfo>
  <Award>
    <DP>84</DP>
    <BoQ>
      <BoQInfo><Name>${esc(lv.projekt)}</Name></BoQInfo>
      <BoQBody>
        <Itemlist>
${items}
        </Itemlist>
        <Totals><Total>${dez(summe, PREIS_STELLEN)}</Total></Totals>
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>`;

  return { xml, bericht: { summe, summeUngerundet, abweichung, zeilen, hinweise } };
}

/**
 * Baut ein GAEB DA XML 3.2 · Phase 84 (Angebot) aus einem LV.
 * Bewusst schlank, aber strukturell standardkonform und wieder importierbar.
 *
 * Unveränderte Signatur — wer nur die Datei braucht, ruft weiter so auf.
 * Wer den Rundungsbericht braucht, nimmt baueGaebMitBericht().
 */
export function baueGaeb(lv: GaebLV, opt: GaebOptionen = {}): string {
  return baueGaebMitBericht(lv, opt).xml;
}

/**
 * Prüft eine fertige GAEB-Zeile so, wie es ein Prüfprogramm tut:
 * passt der geschriebene Gesamtbetrag zu Menge × Einheitspreis?
 *
 * Wird nicht zum Schreiben gebraucht — die Funktion gibt es, damit sich
 * eine FREMDE Datei prüfen lässt, bevor sie weitergereicht wird.
 */
export function pruefeZeile(menge: number, einzelpreis: number, gesamt: number): {
  stimmt: boolean;
  soll: number;
  differenz: number;
} {
  const soll = centRunden(rundeAuf(menge, QTY_STELLEN) * rundeAuf(einzelpreis, PREIS_STELLEN));
  const ist = centRunden(gesamt);
  return { stimmt: soll === ist, soll, differenz: centRunden(ist - soll) };
}

/**
 * Eine Zahl, die aus der Oberfläche kommt (Text aus einem Eingabefeld, Wert
 * aus einer numeric-Spalte), für das LV lesen. Deutsche Schreibweise gilt —
 * das ist die Eingabe des Betriebs, nicht der Inhalt einer GAEB-Datei.
 * Nicht lesbar heißt null, NIE still 0.
 */
export function leseLvZahl(wert: unknown): number | null {
  return leseZahl(wert);
}
