// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · P35 — E-RECHNUNG AUSLESEN
// ------------------------------------------------------------
// Liest eine EINGEHENDE E-Rechnung (XML nach EN 16931) und gibt
// die Daten in einer klaren, menschenlesbaren Struktur zurück.
// Unterstützt beide Norm-Familien:
//   · CII (Cross Industry Invoice)  -> ZUGFeRD & XRechnung-CII
//   · UBL (Universal Business Lang.) -> XRechnung-UBL, PEPPOL
//
// Damit kann ARGONAUT E-Rechnungen von JEDEM Absender lesen —
// egal ob sie aus DATEV, Lexoffice, SAP, sevDesk o.a. kommen.
// Das ist die gesetzliche EMPFANGSPFLICHT seit 01.01.2025.
//
// KEINE externe Library nötig: reiner Regex/String-Parser, der
// ohne DOM auskommt (läuft in Node-API-Route UND im Browser).
// Er ist bewusst tolerant: fehlende Felder -> leer, nie Absturz.
// ============================================================

export interface ERPosition {
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  netto: number;
  mwst_satz: number;
}

export interface ERPartei {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  ust_idnr: string;
  steuernummer: string;
  email: string;
}

export interface ERGebnis {
  erkannt: boolean;              // true, wenn es eine gültige E-Rechnung war
  format: 'CII' | 'UBL' | 'unbekannt';
  rechnungsnummer: string;
  rechnungsdatum: string;        // ISO YYYY-MM-DD
  faelligkeitsdatum: string;
  leistungsdatum: string;
  waehrung: string;
  verkaeufer: ERPartei;          // wer die Rechnung stellt (dein Lieferant)
  kaeufer: ERPartei;             // wer sie bekommt (i.d.R. du)
  positionen: ERPosition[];
  netto_summe: number;
  mwst_summe: number;
  brutto_summe: number;
  kleinunternehmer: boolean;
  notizen: string;
  warnungen: string[];           // was fehlte / auffiel
}

// ─── Helfer ───

/** Holt den Textinhalt des ERSTEN Vorkommens eines Tags (namespace-egal). */
function tag(xml: string, localName: string): string {
  // matcht <irgendwas:localName ...>INHALT</...:localName> oder ohne Präfix
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${localName}>`,
    'i'
  );
  const m = xml.match(re);
  return m ? entfDecode(m[1].trim()) : '';
}

/** Holt ALLE Vorkommen eines Tags als Array von Innen-XML-Blöcken. */
function tagAlle(xml: string, localName: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${localName}>`,
    'gi'
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Attributwert eines Tags (z.B. schemeID, unitCode, currencyID). */
function attr(xml: string, localName: string, attrName: string): string {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${localName}\\s[^>]*${attrName}="([^"]*)"`,
    'i'
  );
  const m = xml.match(re);
  return m ? m[1] : '';
}

function entfDecode(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function zahl(s: string): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Datum aus 102-Format (YYYYMMDD) ODER ISO (YYYY-MM-DD) -> ISO. */
function datumIso(s: string): string {
  if (!s) return '';
  const t = s.trim();
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : t;
}

/** UN/ECE-Einheitencode -> lesbar. */
function einheitLesbar(code: string): string {
  const map: Record<string, string> = {
    C62: 'Stk', H87: 'Stk', HUR: 'Std', DAY: 'Tag', KMT: 'km',
    MTR: 'm', MTK: 'm²', MTQ: 'm³', KGM: 'kg', TNE: 't', LTR: 'l',
  };
  return map[(code || '').toUpperCase()] || (code || 'Stk');
}

function leerePartei(): ERPartei {
  return { name: '', strasse: '', plz: '', ort: '', land: '', ust_idnr: '', steuernummer: '', email: '' };
}

// ─── CII-Parser (ZUGFeRD / XRechnung-CII) ───

function parseCII(xml: string): ERGebnis {
  const warnungen: string[] = [];
  const g: ERGebnis = basisGebnis('CII');

  // Kopf
  const doc = tag(xml, 'ExchangedDocument');
  g.rechnungsnummer = tag(doc, 'ID');
  g.rechnungsdatum = datumIso(tag(tag(doc, 'IssueDateTime'), 'DateTimeString'));
  g.notizen = tag(tag(doc, 'IncludedNote'), 'Content');

  // Parteien
  const agreement = tag(xml, 'ApplicableHeaderTradeAgreement');
  g.verkaeufer = parseCIIPartei(tag(agreement, 'SellerTradeParty'));
  g.kaeufer = parseCIIPartei(tag(agreement, 'BuyerTradeParty'));

  // Lieferdatum
  const delivery = tag(xml, 'ApplicableHeaderTradeDelivery');
  g.leistungsdatum = datumIso(tag(tag(tag(delivery, 'ActualDeliverySupplyChainEvent'), 'OccurrenceDateTime'), 'DateTimeString'));

  // Settlement
  const settlement = tag(xml, 'ApplicableHeaderTradeSettlement');
  g.waehrung = tag(settlement, 'InvoiceCurrencyCode') || 'EUR';
  g.faelligkeitsdatum = datumIso(tag(tag(tag(settlement, 'SpecifiedTradePaymentTerms'), 'DueDateDateTime'), 'DateTimeString'));

  // Summen
  const sum = tag(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  g.netto_summe = zahl(tag(sum, 'TaxBasisTotalAmount') || tag(sum, 'LineTotalAmount'));
  g.mwst_summe = zahl(tag(sum, 'TaxTotalAmount'));
  g.brutto_summe = zahl(tag(sum, 'GrandTotalAmount') || tag(sum, 'DuePayableAmount'));

  // Kleinunternehmer erkennen (CategoryCode E)
  const taxBlocks = tagAlle(settlement, 'ApplicableTradeTax');
  g.kleinunternehmer = taxBlocks.some((t) => tag(t, 'CategoryCode') === 'E');

  // Positionen
  const items = tagAlle(xml, 'IncludedSupplyChainTradeLineItem');
  for (const it of items) {
    const bez = tag(tag(it, 'SpecifiedTradeProduct'), 'Name');
    const preis = zahl(tag(tag(it, 'NetPriceProductTradePrice'), 'ChargeAmount'));
    const mengeBlock = tag(it, 'SpecifiedLineTradeDelivery');
    const menge = zahl(tag(mengeBlock, 'BilledQuantity'));
    const einheit = einheitLesbar(attr(mengeBlock, 'BilledQuantity', 'unitCode'));
    const posSettle = tag(it, 'SpecifiedLineTradeSettlement');
    const netto = zahl(tag(tag(posSettle, 'SpecifiedTradeSettlementLineMonetarySummation'), 'LineTotalAmount'));
    const satz = zahl(tag(tag(posSettle, 'ApplicableTradeTax'), 'RateApplicablePercent'));
    g.positionen.push({ bezeichnung: bez, menge, einheit, einzelpreis: preis, netto, mwst_satz: satz });
  }

  pruefe(g, warnungen);
  g.warnungen = warnungen;
  g.erkannt = !!(g.rechnungsnummer || g.brutto_summe);
  return g;
}

function parseCIIPartei(block: string): ERPartei {
  const p = leerePartei();
  if (!block) return p;
  p.name = tag(block, 'Name');
  const adr = tag(block, 'PostalTradeAddress');
  p.plz = tag(adr, 'PostcodeCode');
  p.strasse = tag(adr, 'LineOne');
  p.ort = tag(adr, 'CityName');
  p.land = tag(adr, 'CountryID');
  // Steuerregistrierungen: schemeID VA = USt-IdNr, FC = Steuernummer
  const taxRegs = tagAlle(block, 'SpecifiedTaxRegistration');
  for (const tr of taxRegs) {
    const scheme = attr(tr, 'ID', 'schemeID');
    const id = tag(tr, 'ID');
    if (scheme === 'VA') p.ust_idnr = id;
    else if (scheme === 'FC') p.steuernummer = id;
  }
  p.email = tag(tag(block, 'URIUniversalCommunication'), 'URIID');
  return p;
}

// ─── UBL-Parser (XRechnung-UBL / PEPPOL) ───

function parseUBL(xml: string): ERGebnis {
  const warnungen: string[] = [];
  const g: ERGebnis = basisGebnis('UBL');

  g.rechnungsnummer = tag(xml, 'ID'); // erstes ID = Invoice-ID
  g.rechnungsdatum = datumIso(tag(xml, 'IssueDate'));
  g.faelligkeitsdatum = datumIso(tag(xml, 'DueDate'));
  g.waehrung = tag(xml, 'DocumentCurrencyCode') || 'EUR';
  g.notizen = tag(xml, 'Note');

  const supplier = tag(xml, 'AccountingSupplierParty');
  const customer = tag(xml, 'AccountingCustomerParty');
  g.verkaeufer = parseUBLPartei(supplier);
  g.kaeufer = parseUBLPartei(customer);

  const totals = tag(xml, 'LegalMonetaryTotal');
  g.netto_summe = zahl(tag(totals, 'TaxExclusiveAmount') || tag(totals, 'LineExtensionAmount'));
  g.brutto_summe = zahl(tag(totals, 'TaxInclusiveAmount') || tag(totals, 'PayableAmount'));
  g.mwst_summe = zahl(tag(tag(xml, 'TaxTotal'), 'TaxAmount'));

  const taxCat = tag(tag(tag(xml, 'TaxTotal'), 'TaxSubtotal'), 'TaxCategory');
  g.kleinunternehmer = tag(taxCat, 'ID') === 'E';

  const lines = tagAlle(xml, 'InvoiceLine');
  for (const ln of lines) {
    const bez = tag(tag(ln, 'Item'), 'Name');
    const menge = zahl(tag(ln, 'InvoicedQuantity'));
    const einheit = einheitLesbar(attr(ln, 'InvoicedQuantity', 'unitCode'));
    const netto = zahl(tag(ln, 'LineExtensionAmount'));
    const preis = zahl(tag(tag(ln, 'Price'), 'PriceAmount'));
    const satz = zahl(tag(tag(tag(ln, 'Item'), 'ClassifiedTaxCategory'), 'Percent'));
    g.positionen.push({ bezeichnung: bez, menge, einheit, einzelpreis: preis, netto, mwst_satz: satz });
  }

  pruefe(g, warnungen);
  g.warnungen = warnungen;
  g.erkannt = !!(g.rechnungsnummer || g.brutto_summe);
  return g;
}

function parseUBLPartei(block: string): ERPartei {
  const p = leerePartei();
  if (!block) return p;
  const party = tag(block, 'Party');
  p.name = tag(tag(party, 'PartyName'), 'Name') || tag(tag(party, 'PartyLegalEntity'), 'RegistrationName');
  const adr = tag(party, 'PostalAddress');
  p.strasse = tag(adr, 'StreetName');
  p.plz = tag(adr, 'PostalZone');
  p.ort = tag(adr, 'CityName');
  p.land = tag(tag(adr, 'Country'), 'IdentificationCode');
  p.ust_idnr = tag(tag(party, 'PartyTaxScheme'), 'CompanyID');
  p.email = tag(tag(party, 'Contact'), 'ElectronicMail');
  return p;
}

// ─── gemeinsame Helfer ───

function basisGebnis(format: 'CII' | 'UBL'): ERGebnis {
  return {
    erkannt: false, format,
    rechnungsnummer: '', rechnungsdatum: '', faelligkeitsdatum: '', leistungsdatum: '',
    waehrung: 'EUR', verkaeufer: leerePartei(), kaeufer: leerePartei(),
    positionen: [], netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
    kleinunternehmer: false, notizen: '', warnungen: [],
  };
}

function pruefe(g: ERGebnis, warnungen: string[]): void {
  if (!g.rechnungsnummer) warnungen.push('Rechnungsnummer fehlt');
  if (!g.verkaeufer.name) warnungen.push('Lieferanten-Name fehlt');
  if (!g.brutto_summe) warnungen.push('Gesamtbetrag fehlt oder 0');
  if (!g.rechnungsdatum) warnungen.push('Rechnungsdatum fehlt');
  // Plausibilität: netto + mwst ~ brutto?
  if (g.brutto_summe && Math.abs((g.netto_summe + g.mwst_summe) - g.brutto_summe) > 0.02) {
    warnungen.push('Netto + USt weicht vom Gesamtbetrag ab — bitte prüfen');
  }
}

// ============================================================
//  HAUPTFUNKTION — erkennt Format automatisch
// ============================================================

/**
 * Liest eine E-Rechnung aus XML-Text. Erkennt CII vs. UBL selbst.
 * Wirft nie — bei Unlesbarem kommt { erkannt:false } zurück.
 */
export function leseERechnung(xmlText: string): ERGebnis {
  const xml = String(xmlText || '');
  try {
    // Format-Weiche: CII hat CrossIndustryInvoice, UBL hat <Invoice> mit ubl-Namespace
    if (/CrossIndustryInvoice/i.test(xml)) {
      return parseCII(xml);
    }
    if (/<(?:[a-zA-Z0-9]+:)?Invoice[\s>]/i.test(xml) && /oasis|ubl/i.test(xml)) {
      return parseUBL(xml);
    }
    // Fallback: versuche CII, dann UBL
    const cii = parseCII(xml);
    if (cii.erkannt) return cii;
    const ubl = parseUBL(xml);
    if (ubl.erkannt) return ubl;

    const leer = basisGebnis('CII');
    leer.format = 'unbekannt';
    leer.warnungen = ['Kein gültiges E-Rechnungs-Format erkannt (weder CII/ZUGFeRD noch UBL).'];
    return leer;
  } catch (e: any) {
    const leer = basisGebnis('CII');
    leer.format = 'unbekannt';
    leer.warnungen = ['Fehler beim Auslesen: ' + (e?.message || String(e))];
    return leer;
  }
}

/**
 * Zieht aus einem ZUGFeRD-PDF (Base64 oder Buffer) das eingebettete XML.
 * ZUGFeRD bettet die XML als Datei-Anhang ein; wir suchen den XML-Block
 * zwischen <rsm:CrossIndustryInvoice> ... </rsm:CrossIndustryInvoice>
 * bzw. <Invoice> ... </Invoice> im dekomprimierten PDF-Text.
 * Hinweis: funktioniert für unkomprimiert eingebettete XML (der Normalfall
 * bei ZUGFeRD). Für zusätzliche Robustheit kann später eine PDF-Lib ergänzt
 * werden — Andockpunkt hier.
 */
export function extrahiereXmlAusPdf(pdfText: string): string {
  const t = String(pdfText || '');
  const ciiM = t.match(/<[a-zA-Z0-9]*:?CrossIndustryInvoice[\s\S]*?<\/[a-zA-Z0-9]*:?CrossIndustryInvoice>/i);
  if (ciiM) return ciiM[0];
  const ublM = t.match(/<([a-zA-Z0-9]*:?)Invoice[\s>][\s\S]*?<\/\1Invoice>/i);
  if (ublM) return ublM[0];
  return '';
}
