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
// ============================================================================

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

/** Zahl aus GAEB-Text ('.' oder ',' als Dezimaltrenner). */
function zahl(s: string): number | null {
  const t = (s || '').replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
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
    const menge = zahl(mengeText);
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
      einzelpreis: zahl(ersterText(item, ['UP', 'UPrice'])),
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
function dez(n: number | null | undefined): string {
  return (Number.isFinite(n as number) ? (n as number) : 0).toFixed(2);
}
function heuteIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${t}`;
}

/**
 * Baut ein GAEB DA XML 3.2 · Phase 84 (Angebot) aus einem LV.
 * Bewusst schlank, aber strukturell standardkonform und wieder importierbar.
 */
export function baueGaeb(lv: GaebLV): string {
  const items = lv.positionen.map((p, i) => {
    const oz = (p.oz && p.oz.trim()) || String((i + 1) * 10).padStart(4, '0');
    const it = (p.einzelpreis ?? 0) * (p.menge ?? 0);
    return `        <Item RNoPart="${esc(oz)}">
          <Qty>${dez(p.menge)}</Qty>
          <QU>${esc(p.einheit)}</QU>
          <Description>
            <CompleteText>
              <OutlineText><OutlTxt><TextOutlTxt><span>${esc(p.kurztext)}</span></TextOutlTxt></OutlTxt></OutlineText>${
                p.langtext ? `\n              <DetailTxt><Text><p><span>${esc(p.langtext)}</span></p></Text></DetailTxt>` : ''
              }
            </CompleteText>
          </Description>
          <UP>${dez(p.einzelpreis)}</UP>
          <IT>${dez(it)}</IT>
        </Item>`;
  }).join('\n');

  const summe = lv.positionen.reduce((s, p) => s + (p.einzelpreis ?? 0) * (p.menge ?? 0), 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.2">
  <GAEBInfo>
    <Version>3.2</Version>
    <Date>${heuteIso()}</Date>
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
        <Totals><Total>${dez(summe)}</Total></Totals>
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>`;
}
