// ============================================================
// ARGONAUT OS · lib/bmecatLeser.ts — Umzug Schritt 7: BMEcat 1.2 und 2005
// (Paket 150, 28.09.2026)
//
// Hersteller und Grosshaendler (Elektro, SHK, Buero, IT, Industrie) liefern
// Kataloge als BMEcat-XML. Dieser Leser macht daraus eine Tabelle mit den
// ARGONAUT-Feldnamen der Artikel (Kopfzeile = Feldnamen), die danach durch den
// normalen Import-Motor laeuft (Zuordnung, Pruefung, Rueckgaengig). Nichts
// wird verschluckt: Hersteller, weitere Preisarten, Mindestmenge, Merkmale
// (ETIM) kommen als eigene Spalten mit.
//
// Grundlage (recherchiert 28.09.2026): Spezifikation BMEcat 1.2 und 2005,
// ETIM-BMEcat-Guideline 4.0, oeffentliche Parser.
//  * 1.2:  T_NEW_CATALOG / T_UPDATE_PRODUCTS / T_UPDATE_PRICES > ARTICLE(mode)
//          > SUPPLIER_AID, ARTICLE_DETAILS(DESCRIPTION_SHORT/_LONG, EAN,
//          MANUFACTURER_AID, MANUFACTURER_NAME), ARTICLE_ORDER_DETAILS
//          (ORDER_UNIT, CONTENT_UNIT, NO_CU_PER_OU, PRICE_QUANTITY, QUANTITY_MIN),
//          ARTICLE_PRICE_DETAILS > ARTICLE_PRICE(price_type) (PRICE_AMOUNT,
//          PRICE_CURRENCY, TAX, PRICE_FACTOR, LOWER_BOUND); Warengruppen ueber
//          ARTICLE_TO_CATALOGGROUP_MAP(ART_ID, CATALOG_GROUP_ID) und
//          CATALOG_STRUCTURE(GROUP_ID, GROUP_NAME).
//  * 2005: dasselbe mit PRODUCT/SUPPLIER_PID/PRODUCT_*; EAN als
//          INTERNATIONAL_PID type="gtin"/"ean"; MANUFACTURER_PID;
//          PRODUCT_TO_CATALOGGROUP_MAP(PROD_ID); mehrsprachige Texte (lang).
//  * price_type: net_list = Listenpreis ohne MwSt (rabattfaehig),
//    net_customer = Ihr Netto-Einkaufspreis, gros_list / nrp = Preise MIT MwSt.
//    Endpreis = PRICE_AMOUNT x PRICE_FACTOR; der Preis gilt fuer
//    PRICE_QUANTITY Bestelleinheiten; LOWER_BOUND = Staffel ab Menge;
//    DAILY_PRICE true = Preis auf Anfrage. mode: new / update / delete.
//
// Zuordnung: net_list -> Verkaufspreis, net_customer -> Einkaufspreis. Preise
// mit MwSt werden NICHT still umgerechnet (nur wenn net_list fehlt UND TAX in
// der Datei steht) — sonst eigene Spalte. Fremdwaehrung: nur eigene Spalte.
// Eigener kleiner XML-Leser (laeuft im Browser und in Node, kein DOMParser).
// Reine Logik, node-getestet.
// ============================================================

import { leseZahl } from './zahlen';

export type BmecatErgebnis = {
  kopf: string[];
  zeilen: string[][];
  anzahl: number;
  hinweise: string[];
  version: string | null;
};

// ---------------------------------------------------------------------------
// Kleiner, fehlertoleranter XML-Leser
// ---------------------------------------------------------------------------

export type XmlKnoten = { name: string; attr: Record<string, string>; kinder: XmlKnoten[]; text: string; von: number; bis: number };

const ENTITAETEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', euro: '€' };

export function entitaeten(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (ganz, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ganz;
    }
    return ENTITAETEN[e] ?? ganz;
  });
}

/** Ohne Namensraum-Praefix, gross geschrieben (bmecat:ARTICLE -> ARTICLE). */
const lokal = (n: string) => (n.includes(':') ? n.slice(n.indexOf(':') + 1) : n).toUpperCase();

export function leseXml(text: string): XmlKnoten {
  const wurzel: XmlKnoten = { name: '#WURZEL', attr: {}, kinder: [], text: '', von: 0, bis: text.length };
  const stapel: XmlKnoten[] = [wurzel];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    const oben = stapel[stapel.length - 1];
    if (lt < 0) { oben.text += entitaeten(text.slice(i)); break; }
    if (lt > i) oben.text += entitaeten(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) { const e = text.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (text.startsWith('<![CDATA[', lt)) { const e = text.indexOf(']]>', lt + 9); oben.text += text.slice(lt + 9, e < 0 ? n : e); i = e < 0 ? n : e + 3; continue; }
    if (text[lt + 1] === '?' || text[lt + 1] === '!') { const e = text.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    // Tag-Ende suchen, Anfuehrungszeichen beachten
    let j = lt + 1; let q = '';
    while (j < n) { const c = text[j]; if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++; }
    const inhalt = text.slice(lt + 1, j);
    i = j + 1;
    if (inhalt.startsWith('/')) {
      const name = lokal(inhalt.slice(1).trim());
      for (let k = stapel.length - 1; k > 0; k--) if (stapel[k].name === name) { stapel[k].bis = lt; stapel.length = k; break; }
      continue;
    }
    const zu = inhalt.endsWith('/');
    const roh = zu ? inhalt.slice(0, -1) : inhalt;
    const m = /^\s*([^\s/>]+)/.exec(roh);
    if (!m) continue;
    const knoten: XmlKnoten = { name: lokal(m[1]), attr: {}, kinder: [], text: '', von: i, bis: zu ? i : n };
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    const rest = roh.slice(m[0].length);
    while ((a = re.exec(rest))) knoten.attr[lokal(a[1]).toLowerCase()] = entitaeten(a[3] ?? a[4] ?? '');
    oben.kinder.push(knoten);
    if (!zu) stapel.push(knoten);
  }
  return wurzel;
}

const kind = (k: XmlKnoten | undefined, name: string) => k?.kinder.find((c) => c.name === name);
const kinder = (k: XmlKnoten | undefined, name: string) => (k ? k.kinder.filter((c) => c.name === name) : []);
const txt = (k: XmlKnoten | undefined): string => (k ? (k.text + k.kinder.map((c) => txt(c)).join('')).replace(/\s+/g, ' ').trim() : '');

/** Mehrsprachige Texte (2005): deutsch bevorzugen, sonst der erste. */
function deutsch(liste: XmlKnoten[]): XmlKnoten | undefined {
  return liste.find((k) => /^(deu|ger|de)/i.test(k.attr.lang ?? '')) ?? liste.find((k) => !k.attr.lang) ?? liste[0];
}

/** HTML im Langtext zu lesbarem Text (Absaetze/Zeilenumbrueche bleiben). */
export function ohneHtml(roh: string): string {
  // Maskiertes HTML (&lt;br&gt;) erst entschluesseln, damit die Tags wegfallen
  const s = /&lt;\s*\/?\s*[a-z]/i.test(roh) ? entitaeten(roh) : roh;
  return entitaeten(s.replace(/<\s*(br|\/?p|\/?ul|\/?ol|\/li|\/?div|\/h\d)\b[^>]*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ''))
    .split('\n').map((z) => z.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Einheiten (UN/ECE Rec. 20, wie in BMEcat ueblich)
// ---------------------------------------------------------------------------

const EINHEITEN: Record<string, string> = {
  C62: 'Stk', H87: 'Stk', PCE: 'Stk', EA: 'Stk', STK: 'Stk', PK: 'Pak', PA: 'Pak', CS: 'Karton', CT: 'Karton', BX: 'Box', SET: 'Set', PR: 'Paar',
  MTR: 'm', CMT: 'cm', MMT: 'mm', KMT: 'km', MTK: 'm²', MTQ: 'm³', LTR: 'l', MLT: 'ml', KGM: 'kg', GRM: 'g', TNE: 't',
  HUR: 'Std', MIN: 'Min', DAY: 'Tag', RO: 'Rolle', RL: 'Rolle', TN: 'Dose', BO: 'Flasche', BG: 'Beutel', DR: 'Fass', PL: 'Eimer', KT: 'Bausatz',
};
export function einheitAusCode(code: string): { einheit: string; bekannt: boolean } {
  const c = code.trim().toUpperCase();
  if (!c) return { einheit: '', bekannt: true };
  return EINHEITEN[c] ? { einheit: EINHEITEN[c], bekannt: true } : { einheit: code.trim(), bekannt: false };
}

/** Zahl deutsch schreiben: mindestens 2, hoechstens 4 Nachkommastellen. */
function zahlDe(n: number): string {
  let t = (Math.round(n * 10000) / 10000).toFixed(4);
  while (t.endsWith('0') && t.split('.')[1].length > 2) t = t.slice(0, -1);
  return t.replace('.', ',');
}

/** BMEcat schreibt Zahlen mit Punkt (xsd:decimal); Komma tolerieren. */
const zahl = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return leseZahl(t);
};

export function istBmecat(dateiname: string, anfang: string): boolean {
  if (/\.(xml|bmecat)$/i.test(dateiname) || /^\s*</.test(anfang)) return /<(\w+:)?BMECAT[\s>]/i.test(anfang.slice(0, 5000));
  return false;
}

type Preis = { art: string; betrag: number; waehrung: string; steuer: number | null; ab: number };

const PREISNAME: Record<string, string> = {
  net_list: 'Listenpreis netto', gros_list: 'Listenpreis brutto', net_customer: 'Ihr Nettopreis', nrp: 'Unverbindl. Preisempfehlung',
  net_customer_exp: 'Nettopreis (zeitlich)', gros_customer: 'Kundenpreis brutto',
};

const KOPF_FELDER = ['artikelnummer', 'bezeichnung', 'beschreibung', 'kategorie', 'einheit', 'verkaufspreis', 'einkaufspreis', 'ean'] as const;

/**
 * BMEcat lesen (1.2 oder 2005, alle drei Transaktionen).
 */
export function leseBmecat(text: string): BmecatErgebnis {
  const hinweise: string[] = [];
  const quelle = text.replace(/^\uFEFF/, '');
  const wurzel = leseXml(quelle);
  // Langtext roh aus der Quelle (HTML ohne CDATA bleibt in der richtigen Reihenfolge)
  const roh = (k: XmlKnoten | undefined) => (k ? quelle.slice(k.von, k.bis).replace(/<!\[CDATA\[|\]\]>/g, '') : '');
  const bme = kind(wurzel, 'BMECAT');
  if (!bme) return { kopf: [...KOPF_FELDER], zeilen: [], anzahl: 0, hinweise: ['Keine BMEcat-Datei (Element BMECAT fehlt).'], version: null };
  const version = bme.attr.version ?? null;
  const katalog = kind(kind(bme, 'HEADER'), 'CATALOG');
  const katWaehrung = txt(kind(katalog, 'CURRENCY')) || 'EUR';

  // Warengruppen: Name je GROUP_ID (1.2 CATALOG_STRUCTURE, 2005 CATALOG_GROUP_SYSTEM > CATALOG_STRUCTURE)
  const gruppenName = new Map<string, string>();
  const suchGruppen = (k: XmlKnoten) => {
    for (const c of k.kinder) {
      if (c.name === 'CATALOG_STRUCTURE') {
        const id = txt(kind(c, 'GROUP_ID'));
        const name = txt(deutsch(kinder(c, 'GROUP_NAME')));
        if (id) gruppenName.set(id, name || id);
      } else if (c.name !== 'ARTICLE' && c.name !== 'PRODUCT') suchGruppen(c);
    }
  };

  type Zeile = Record<string, string>;
  const zeilen: Zeile[] = [];
  const nachNr = new Map<string, Zeile>();
  const gruppeVon = new Map<string, string>();
  let geloescht = 0, fremd = 0, mitSteuerUmgerechnet = 0, mitSteuerOhne = 0, anfrage = 0, staffel = 0, unbekannteEinheit = 0, ohneNr = 0, ohneListe = 0;
  const transaktionen: string[] = [];

  for (const t of bme.kinder) {
    if (!/^T_/.test(t.name)) continue;
    transaktionen.push(t.name);
    suchGruppen(t);
    for (const map of [...kinder(t, 'ARTICLE_TO_CATALOGGROUP_MAP'), ...kinder(t, 'PRODUCT_TO_CATALOGGROUP_MAP')]) {
      const nr = txt(kind(map, 'ART_ID') ?? kind(map, 'PROD_ID'));
      const g = txt(kind(map, 'CATALOG_GROUP_ID'));
      if (nr && g && !gruppeVon.has(nr)) gruppeVon.set(nr, g);
    }
    for (const a of [...kinder(t, 'ARTICLE'), ...kinder(t, 'PRODUCT')]) {
      const neu = a.name === 'PRODUCT';
      const nr = txt(kind(a, neu ? 'SUPPLIER_PID' : 'SUPPLIER_AID'));
      if (!nr) { ohneNr++; continue; }
      const mode = (a.attr.mode ?? '').toLowerCase();
      if (mode === 'delete') { geloescht++; nachNr.delete(nr); continue; }
      const det = kind(a, neu ? 'PRODUCT_DETAILS' : 'ARTICLE_DETAILS');
      const best = kind(a, neu ? 'PRODUCT_ORDER_DETAILS' : 'ARTICLE_ORDER_DETAILS');
      const z: Zeile = nachNr.get(nr) ?? { artikelnummer: nr };
      if (!nachNr.has(nr)) { nachNr.set(nr, z); zeilen.push(z); }

      if (det) {
        const kurz = txt(deutsch(kinder(det, 'DESCRIPTION_SHORT')));
        if (kurz) z.bezeichnung = kurz;
        const langK = deutsch(kinder(det, 'DESCRIPTION_LONG'));
        const lang = langK ? ohneHtml(roh(langK)) : '';
        if (lang) z.beschreibung = lang;
        let ean = txt(kind(det, 'EAN'));
        for (const p of kinder(det, 'INTERNATIONAL_PID')) if (!ean && /^(gtin|ean)/i.test(p.attr.type ?? 'gtin')) ean = txt(p);
        if (ean) { if (/^\d{8}$|^\d{12,14}$/.test(ean)) z.ean = ean; else z.eanRoh = ean; }
        const hName = txt(kind(det, 'MANUFACTURER_NAME')); if (hName) z.hersteller = hName;
        const hNr = txt(kind(det, 'MANUFACTURER_AID') ?? kind(det, 'MANUFACTURER_PID')); if (hNr) z.herstellerNr = hNr;
        const typ = txt(kind(det, 'MANUFACTURER_TYPE_DESCR')); if (typ) z.typ = typ;
        const lz = txt(kind(det, 'DELIVERY_TIME')); if (lz) z.lieferzeit = lz;
        const sw = kinder(det, 'KEYWORD').map(txt).filter(Boolean); if (sw.length) z.stichworte = sw.join(', ');
      }
      // Warengruppe direkt am Artikel (manche Kataloge)
      const direkt = kind(a, 'ARTICLE_TO_CATALOGGROUP_MAP') ?? kind(a, 'PRODUCT_TO_CATALOGGROUP_MAP');
      if (direkt) { const g = txt(kind(direkt, 'CATALOG_GROUP_ID')); if (g) gruppeVon.set(nr, g); }

      // Merkmale (ETIM u. a.) — als ein lesbarer Text
      const merk: string[] = [];
      for (const fs of [...kinder(a, 'ARTICLE_FEATURES'), ...kinder(a, 'PRODUCT_FEATURES')]) {
        const sys = txt(kind(fs, 'REFERENCE_FEATURE_SYSTEM_NAME'));
        const klasse = txt(kind(fs, 'REFERENCE_FEATURE_GROUP_ID'));
        if (sys || klasse) merk.push(`${sys}${klasse ? ' ' + klasse : ''}`.trim());
        for (const f of kinder(fs, 'FEATURE')) {
          const name = txt(deutsch(kinder(f, 'FNAME')));
          const werte = kinder(f, 'FVALUE').map(txt).filter(Boolean).join('/');
          const einheit = txt(kind(f, 'FUNIT'));
          if (name && werte) merk.push(`${name}: ${werte}${einheit ? ' ' + einheit : ''}`);
        }
      }
      if (merk.length) z.merkmale = merk.join('; ');

      // Bestelldaten
      let preisMenge = 1;
      if (best) {
        const code = txt(kind(best, 'ORDER_UNIT'));
        if (code) {
          const e = einheitAusCode(code);
          z.einheit = e.einheit;
          if (!e.bekannt) unbekannteEinheit++;
        }
        const inhalt = txt(kind(best, 'CONTENT_UNIT')), anz = txt(kind(best, 'NO_CU_PER_OU'));
        if (inhalt && anz && anz !== '1') z.inhalt = `${anz.replace('.', ',')} ${einheitAusCode(inhalt).einheit} je ${z.einheit || 'Bestelleinheit'}`;
        const pm = zahl(txt(kind(best, 'PRICE_QUANTITY')));
        if (pm && pm > 0) preisMenge = pm;
        const min = txt(kind(best, 'QUANTITY_MIN')); if (min && min !== '1') z.mindestmenge = min.replace('.', ',');
        const iv = txt(kind(best, 'QUANTITY_INTERVAL')); if (iv && iv !== '1') z.intervall = iv.replace('.', ',');
      }

      // Preise
      const preise: Preis[] = [];
      let taeglich = false;
      for (const pd of kinder(a, neu ? 'PRODUCT_PRICE_DETAILS' : 'ARTICLE_PRICE_DETAILS')) {
        if (/^true$/i.test(txt(kind(pd, 'DAILY_PRICE')))) taeglich = true;
        for (const p of kinder(pd, neu ? 'PRODUCT_PRICE' : 'ARTICLE_PRICE')) {
          const betrag = zahl(txt(kind(p, 'PRICE_AMOUNT')));
          if (betrag === null) continue;
          const faktor = zahl(txt(kind(p, 'PRICE_FACTOR')));
          const st = zahl(txt(kind(p, 'TAX')));
          preise.push({
            art: (p.attr.price_type ?? '').toLowerCase(),
            betrag: betrag * (faktor && faktor > 0 ? faktor : 1),
            waehrung: txt(kind(p, 'PRICE_CURRENCY')) || katWaehrung,
            steuer: st === null ? null : (st > 1 ? st / 100 : st),
            ab: zahl(txt(kind(p, 'LOWER_BOUND'))) ?? 1,
          });
        }
      }
      if (taeglich && preise.length === 0) { anfrage++; z.preisHinweis = 'Preis auf Anfrage'; }
      if (preise.length > 0) {
        // Staffel: der Preis ab der kleinsten Menge gilt als Grundpreis
        const art = (x: string) => preise.filter((p) => p.art === x).sort((p1, p2) => p1.ab - p2.ab)[0];
        if (preise.some((p) => p.ab > 1)) { staffel++; z.staffel = preise.filter((p) => p.ab > 1).map((p) => `${PREISNAME[p.art] ?? p.art} ab ${String(p.ab).replace('.', ',')}: ${zahlDe(p.betrag / preisMenge)} ${p.waehrung}`).join('; '); }
        const inEuro = (p: Preis | undefined) => (p && /^EUR$/i.test(p.waehrung) ? p : undefined);
        const liste = inEuro(art('net_list'));
        const kunde = inEuro(art('net_customer'));
        if (preise.some((p) => !/^EUR$/i.test(p.waehrung))) fremd++;
        if (liste) z.verkaufspreis = zahlDe(liste.betrag / preisMenge);
        else {
          const mitSt = inEuro(art('gros_list')) ?? inEuro(art('nrp'));
          if (mitSt && mitSt.steuer !== null && mitSt.steuer >= 0 && mitSt.steuer < 1) {
            z.verkaufspreis = zahlDe(mitSt.betrag / (1 + mitSt.steuer) / preisMenge);
            mitSteuerUmgerechnet++;
          } else if (mitSt) mitSteuerOhne++;
          else if (!kunde) ohneListe++;
        }
        if (kunde) z.einkaufspreis = zahlDe(kunde.betrag / preisMenge);
        // alle weiteren Preisarten als Text — nichts geht verloren
        const weitere = preise.filter((p) => p !== liste && p !== kunde && p.ab <= 1);
        if (weitere.length) z.weiterePreise = weitere.map((p) => `${PREISNAME[p.art] ?? p.art}: ${zahlDe(p.betrag / preisMenge)} ${p.waehrung}${p.steuer !== null ? ` (MwSt ${zahlDe(p.steuer * 100).replace(/,00$/, '')} %)` : ''}`).join('; ');
        if (preisMenge !== 1) z.preisMenge = `Preise galten je ${String(preisMenge).replace('.', ',')} ${z.einheit || 'Einheiten'}`;
      }
    }
  }

  for (const z of zeilen) {
    const g = gruppeVon.get(z.artikelnummer);
    if (g) z.kategorie = gruppenName.get(g) ?? g;
  }

  const EXTRA: [string, string][] = [
    ['hersteller', 'Hersteller'], ['herstellerNr', 'Hersteller-Artikelnummer'], ['typ', 'Typbezeichnung'],
    ['inhalt', 'Inhalt je Bestelleinheit'], ['mindestmenge', 'Mindestbestellmenge'], ['intervall', 'Bestellintervall'],
    ['preisMenge', 'Preisbasis laut Katalog'], ['weiterePreise', 'Weitere Preise laut Katalog'], ['staffel', 'Staffelpreise'],
    ['preisHinweis', 'Preishinweis'], ['lieferzeit', 'Lieferzeit (Tage)'], ['stichworte', 'Stichworte'], ['merkmale', 'Merkmale'],
    ['eanRoh', 'EAN laut Datei (ungültig)'],
  ];
  const extras = EXTRA.filter(([k]) => zeilen.some((z) => z[k]));
  const kopf = [...KOPF_FELDER, ...extras.map(([, l]) => l)];
  const tabelle = zeilen.map((z) => [...KOPF_FELDER.map((k) => z[k] ?? ''), ...extras.map(([k]) => z[k] ?? '')]);

  hinweise.push(`BMEcat ${version ?? ''} erkannt (${[...new Set(transaktionen)].join(', ') || 'keine Transaktion'}): ${tabelle.length} Artikel.`.replace('  ', ' '));
  if (transaktionen.includes('T_UPDATE_PRICES') && !transaktionen.includes('T_NEW_CATALOG')) hinweise.push('Reine Preisaktualisierung: Artikel ohne Bezeichnung werden nur übernommen, wenn sie schon in ARGONAUT stehen — bitte „Aktualisieren" wählen oder den vollständigen Katalog importieren.');
  if (tabelle.some((z) => z[0] && !z[1])) hinweise.push(`${tabelle.filter((z) => !z[1]).length} Artikel ohne Bezeichnung in dieser Datei.`);
  if (zeilen.some((z) => z.verkaufspreis)) hinweise.push('Listenpreis netto (net_list) als Verkaufspreis übernommen, Ihr Nettopreis (net_customer) als Einkaufspreis.');
  if (mitSteuerUmgerechnet > 0) hinweise.push(`${mitSteuerUmgerechnet} Artikel nur mit Bruttopreis: mit dem MwSt-Satz aus der Datei auf netto umgerechnet.`);
  if (mitSteuerOhne > 0) hinweise.push(`${mitSteuerOhne} Artikel nur mit Bruttopreis ohne MwSt-Angabe — NICHT als Verkaufspreis übernommen (steht unter „Weitere Preise").`);
  if (ohneListe > 0) hinweise.push(`${ohneListe} Artikel nur mit unbekannten Preisarten — Preise stehen unter „Weitere Preise".`);
  if (fremd > 0) hinweise.push(`${fremd} Artikel mit Preisen in Fremdwährung — nicht als Preis übernommen.`);
  if (staffel > 0) hinweise.push(`${staffel} Artikel mit Staffelpreisen: Grundpreis übernommen, Staffel als eigene Spalte.`);
  if (anfrage > 0) hinweise.push(`${anfrage} Artikel mit „Preis auf Anfrage".`);
  if (unbekannteEinheit > 0) hinweise.push(`${unbekannteEinheit} Artikel mit unbekanntem Einheiten-Code — Code übernommen, bitte prüfen.`);
  if (geloescht > 0) hinweise.push(`${geloescht} Artikel sind als gelöscht markiert (mode="delete") und werden nicht übernommen.`);
  if (ohneNr > 0) hinweise.push(`${ohneNr} Einträge ohne Artikelnummer übersprungen.`);

  return { kopf, zeilen: tabelle, anzahl: tabelle.length, hinweise, version };
}
