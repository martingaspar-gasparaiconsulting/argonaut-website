// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · P31 — ZUGFeRD / EN 16931 XML-KERN
// ------------------------------------------------------------
// Erzeugt aus den vorhandenen Rechnungsdaten ein strukturiertes
// XML nach EN 16931 (Europa-Norm für E-Rechnungen). Zwei Profile:
//   · ZUGFeRD 2.x  -> CII (Cross Industry Invoice) fürs PDF-Huckepack
//   · XRechnung    -> dasselbe CII-XML, Profil-Kennung "xrechnung"
//
// WICHTIG: Dieselbe Steuerlogik wie im PDF (steuerLogik.ts) wird
// hier wiederverwendet -> XML und PDF zeigen IMMER identische Zahlen.
// Das ist Pflicht: weichen sie ab, ist die E-Rechnung ungültig.
//
// ADDITIV: Diese Datei ersetzt NICHTS. Sie liest nur die gleichen
// Datenobjekte (rechnung, positionen, aussteller, ...), die die
// bestehende rechnung-pdf-Route ohnehin schon bekommt.
// ============================================================

import { steuerGruppen, type SteuerPosten } from '../app/dashboard/_components/steuerLogik';

// ─── Typen (bewusst tolerant — Daten kommen aus verschiedenen Quellen) ───

export type ZugferdProfil = 'zugferd' | 'xrechnung';

export interface ZugferdAdresse {
  strasse?: string;      // "Musterweg 3"
  plz?: string;          // "71032"
  ort?: string;          // "Böblingen"
  land?: string;         // ISO-2, z.B. "DE" (Default DE)
}

export interface ZugferdPartei {
  name?: string;
  adresse?: ZugferdAdresse;
  ust_idnr?: string;     // USt-IdNr. (DE123456789)
  steuernummer?: string; // alternativ zur USt-IdNr.
  email?: string;
}

export interface ZugferdEingabe {
  rechnung: any;                 // rechnungen-Zeile
  positionen: any[];             // rechnung_positionen
  aussteller: ZugferdPartei;     // Verkäufer (deine Firma)
  empfaenger: ZugferdPartei;     // Käufer (Kunde)
  profil?: ZugferdProfil;        // Default 'zugferd'
  leitweg_id?: string;           // nur B2G/XRechnung (Behörden)
}

// ─── kleine Helfer ───

/** XML-Escape für Textinhalte. */
function x(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Betrag mit exakt 2 Nachkommastellen, Punkt als Trenner (XML-Norm). */
function n2(v: any): string {
  const num = Number(v);
  return (Number.isFinite(num) ? num : 0).toFixed(2);
}

/** Prozentsatz ohne unnötige Nullen, Punkt-Trenner (z.B. "19" oder "7"). */
function nPct(v: any): string {
  const num = Number(v);
  const clean = Number.isFinite(num) ? num : 0;
  return String(clean);
}

/** Datum -> YYYYMMDD (Format 102 der Norm). Fällt auf heute zurück. */
function dat102(d: any): string {
  let dt: Date;
  try {
    dt = d ? new Date(d) : new Date();
    if (isNaN(dt.getTime())) dt = new Date();
  } catch {
    dt = new Date();
  }
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Versucht, aus einer Freitext-Anschrift Straße / PLZ / Ort zu ziehen.
 * Best-effort: erkennt eine deutsche "PLZ Ort"-Zeile (5 Ziffern + Ort).
 * Alles, was davor steht, gilt als Straße. Schlägt es fehl, kommt der
 * ganze Text als Straße ins XML — nie ein Absturz, nie leere Pflichtfelder.
 */
function parseAnschrift(freitext?: string): ZugferdAdresse {
  const out: ZugferdAdresse = { land: 'DE' };
  const t = String(freitext ?? '').trim();
  if (!t) return out;
  const zeilen = t.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  // Suche die "PLZ Ort"-Zeile
  let plzOrtIdx = -1;
  for (let i = 0; i < zeilen.length; i++) {
    const m = zeilen[i].match(/(\d{5})\s+(.+)/);
    if (m) {
      out.plz = m[1];
      out.ort = m[2].trim();
      plzOrtIdx = i;
      break;
    }
  }
  // Straße = alle Zeilen vor der PLZ-Ort-Zeile (bzw. erste Zeile als Fallback)
  const strasseZeilen = plzOrtIdx > 0 ? zeilen.slice(0, plzOrtIdx)
    : plzOrtIdx === 0 ? [] : zeilen;
  if (strasseZeilen.length) out.strasse = strasseZeilen.join(', ');
  else if (!out.plz && zeilen.length) out.strasse = zeilen.join(', ');
  return out;
}

/**
 * Normalisiert eine Partei: nutzt strukturierte Felder, wenn vorhanden,
 * sonst parst es die (evtl. mitgelieferte) Freitext-Anschrift.
 */
function normPartei(p: ZugferdPartei, freitextAnschrift?: string): Required<ZugferdPartei> & { adresse: Required<ZugferdAdresse> } {
  const adrRoh = p.adresse && (p.adresse.plz || p.adresse.ort || p.adresse.strasse)
    ? p.adresse
    : parseAnschrift(freitextAnschrift);
  return {
    name: p.name ?? '',
    email: p.email ?? '',
    ust_idnr: p.ust_idnr ?? '',
    steuernummer: p.steuernummer ?? '',
    adresse: {
      strasse: adrRoh.strasse ?? '',
      plz: adrRoh.plz ?? '',
      ort: adrRoh.ort ?? '',
      land: (adrRoh.land ?? 'DE').toUpperCase().slice(0, 2) || 'DE',
    },
  };
}

// ─── Ergebnis-Typ ───

export interface ZugferdErgebnis {
  xml: string;                // fertiges CII-XML (UTF-8)
  dateiname: string;          // vorgeschlagener Dateiname
  profil: ZugferdProfil;
  warnungen: string[];        // fehlende Pflichtfelder etc. (nicht blockierend)
}

// ============================================================
//  HAUPTFUNKTION
// ============================================================

/**
 * Baut das EN-16931-XML (CII) aus den Rechnungsdaten.
 * Wirft NICHT — fehlende Pflichtfelder landen als Warnung im Ergebnis,
 * werden im XML mit einem klar erkennbaren Platzhalter besetzt.
 */
export function baueZugferdXml(eingabe: ZugferdEingabe): ZugferdErgebnis {
  const { rechnung, positionen, profil = 'zugferd', leitweg_id } = eingabe;
  const warnungen: string[] = [];

  const istXR = profil === 'xrechnung';

  // Verkäufer & Käufer normalisieren (strukturiert bevorzugt, sonst Freitext)
  const seller = normPartei(eingabe.aussteller || {}, (eingabe.aussteller as any)?.anschrift);
  const buyer = normPartei(eingabe.empfaenger || {}, (eingabe.empfaenger as any)?.anschrift);

  const klein = !!rechnung?.kleinunternehmer;
  const waehrung = String(rechnung?.waehrung || 'EUR').toUpperCase().slice(0, 3) || 'EUR';

  // ── Steuer identisch zum PDF berechnen ──
  const posten: SteuerPosten[] = (positionen || []).map((p: any) => ({
    netto: p?.gesamt_netto != null
      ? Number(p.gesamt_netto) || 0
      : (Number(p?.menge) || 0) * (Number(p?.einzelpreis) || 0),
    satz: Number(p?.mwst_satz) || 0,
  }));
  const s = steuerGruppen(posten);

  // Bei Kleinunternehmer: alles Satz 0, Steuerbefreiungsgrund Pflicht
  const nettoGesamt = klein ? posten.reduce((a, p) => a + p.netto, 0) : s.netto;
  const steuerGesamt = klein ? 0 : s.steuer;
  const bruttoGesamt = klein ? nettoGesamt : s.brutto;

  // ── Pflichtfeld-Prüfung (nicht blockierend) ──
  if (!seller.name) warnungen.push('Verkäufer-Name fehlt');
  if (!seller.adresse.ort) warnungen.push('Verkäufer-Ort fehlt');
  if (!seller.ust_idnr && !seller.steuernummer) warnungen.push('Verkäufer USt-IdNr./Steuernummer fehlt');
  if (!buyer.name) warnungen.push('Käufer-Name fehlt');
  if (!buyer.adresse.ort) warnungen.push('Käufer-Ort fehlt');
  if (!rechnung?.rechnungsnummer) warnungen.push('Rechnungsnummer fehlt');
  if (istXR && !leitweg_id) warnungen.push('Leitweg-ID fehlt (bei XRechnung an Behörden Pflicht)');

  const ph = (wert: string, fallback: string) => wert ? x(wert) : x(fallback);

  const rechnungsnr = rechnung?.rechnungsnummer || 'ENTWURF';
  const rDatum = dat102(rechnung?.rechnungsdatum);
  const leistDatum = rechnung?.leistungsdatum ? dat102(rechnung.leistungsdatum) : rDatum;
  const faellig = rechnung?.faelligkeitsdatum ? dat102(rechnung.faelligkeitsdatum) : '';

  // ── Profil-Kennung (GuidelineSpecifiedDocumentContextParameter) ──
  const profilId = istXR
    ? 'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0'
    : 'urn:cen.eu:en16931:2017';

  // ── Steuerbefreiung / Kategorie ──
  // S = Standardsatz, Z = Nullsatz, E = steuerbefreit (Kleinunternehmer §19)
  const taxCat = klein ? 'E' : 'S';
  const taxBefreiung = klein
    ? '<ram:ExemptionReason>Kleinunternehmer gemäß § 19 UStG</ram:ExemptionReason>'
    : '';

  // ── Positionszeilen (CII: IncludedSupplyChainTradeLineItem) ──
  const lineItems = (positionen || []).map((p: any, i: number) => {
    const menge = Number(p?.menge) || 0;
    const einzel = Number(p?.einzelpreis) || 0;
    const netto = p?.gesamt_netto != null ? (Number(p.gesamt_netto) || 0) : menge * einzel;
    const satz = klein ? 0 : (Number(p?.mwst_satz) || 0);
    const cat = klein ? 'E' : 'S';
    // Einheit: ZUGFeRD nutzt UN/ECE-Codes. "C62" = Stück (Default), "HUR" = Stunde.
    const einheitCode = mapEinheit(p?.einheit);
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${ph(p?.bezeichnung, 'Position ' + (i + 1))}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${n2(einzel)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${einheitCode}">${n2(menge)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${cat}</ram:CategoryCode>
          <ram:RateApplicablePercent>${nPct(satz)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${n2(netto)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
  }).join('');

  // ── Steueraufschlüsselung (eine ApplicableTradeTax je Satz) ──
  const taxBlocks = klein
    ? `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>0.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${taxBefreiung}
        <ram:BasisAmount>${n2(nettoGesamt)}</ram:BasisAmount>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`
    : s.gruppen.map((g) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${n2(g.steuer)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${n2(g.netto)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${nPct(g.satz)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`).join('');

  // ── Zahlungsziel ──
  const paymentTerms = faellig
    ? `
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${faellig}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>`
    : '';

  // ── Leitweg-ID (BuyerReference) — bei XRechnung/B2G Pflicht ──
  const buyerRef = leitweg_id
    ? `<ram:BuyerReference>${x(leitweg_id)}</ram:BuyerReference>`
    : (istXR ? `<ram:BuyerReference>${x('LEITWEG-ID-FEHLT')}</ram:BuyerReference>` : '');

  // Verkäufer-Steuerregistrierung
  const sellerTaxReg =
    (seller.ust_idnr
      ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(seller.ust_idnr)}</ram:ID></ram:SpecifiedTaxRegistration>`
      : '') +
    (seller.steuernummer
      ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${x(seller.steuernummer)}</ram:ID></ram:SpecifiedTaxRegistration>`
      : '');

  const buyerTaxReg = buyer.ust_idnr
    ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(buyer.ust_idnr)}</ram:ID></ram:SpecifiedTaxRegistration>`
    : '';

  const sellerEmail = seller.email
    ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(seller.email)}</ram:URIID></ram:URIUniversalCommunication>`
    : '';
  const buyerEmail = buyer.email
    ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(buyer.email)}</ram:URIID></ram:URIUniversalCommunication>`
    : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${profilId}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${x(rechnungsnr)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${rDatum}</udt:DateTimeString>
    </ram:IssueDateTime>${rechnung?.notizen ? `
    <ram:IncludedNote><ram:Content>${x(rechnung.notizen)}</ram:Content></ram:IncludedNote>` : ''}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineItems}
    <ram:ApplicableHeaderTradeAgreement>
      ${buyerRef}
      <ram:SellerTradeParty>
        <ram:Name>${ph(seller.name, 'FIRMENNAME-FEHLT')}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${x(seller.adresse.plz)}</ram:PostcodeCode>
          <ram:LineOne>${x(seller.adresse.strasse)}</ram:LineOne>
          <ram:CityName>${ph(seller.adresse.ort, 'ORT-FEHLT')}</ram:CityName>
          <ram:CountryID>${x(seller.adresse.land)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${sellerEmail}
        ${sellerTaxReg}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${ph(buyer.name, 'KUNDENNAME-FEHLT')}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${x(buyer.adresse.plz)}</ram:PostcodeCode>
          <ram:LineOne>${x(buyer.adresse.strasse)}</ram:LineOne>
          <ram:CityName>${ph(buyer.adresse.ort, 'ORT-FEHLT')}</ram:CityName>
          <ram:CountryID>${x(buyer.adresse.land)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${buyerEmail}
        ${buyerTaxReg}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${leistDatum}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${x(waehrung)}</ram:InvoiceCurrencyCode>${taxBlocks}${paymentTerms}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${n2(nettoGesamt)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${n2(nettoGesamt)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${x(waehrung)}">${n2(steuerGesamt)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${n2(bruttoGesamt)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${n2(bruttoGesamt)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  const basis = String(rechnungsnr).replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 60);
  const dateiname = istXR ? `XRechnung_${basis}.xml` : `ZUGFeRD_${basis}.xml`;

  return { xml, dateiname, profil, warnungen };
}

/**
 * Mappt freie Einheiten-Texte auf UN/ECE-Rec-20-Codes (ZUGFeRD-Pflicht).
 * Unbekanntes -> C62 (Stück), der neutrale Standard.
 */
function mapEinheit(einheit?: string): string {
  const e = String(einheit ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    'stk': 'C62', 'stück': 'C62', 'stueck': 'C62', 'st': 'C62', 'x': 'C62',
    'h': 'HUR', 'std': 'HUR', 'stunde': 'HUR', 'stunden': 'HUR',
    'tag': 'DAY', 'tage': 'DAY',
    'km': 'KMT',
    'm': 'MTR', 'meter': 'MTR',
    'm2': 'MTK', 'm²': 'MTK', 'qm': 'MTK',
    'm3': 'MTQ', 'm³': 'MTQ',
    'kg': 'KGM',
    't': 'TNE', 'to': 'TNE', 'tonne': 'TNE', 'tonnen': 'TNE',
    'l': 'LTR', 'liter': 'LTR',
    'pauschal': 'C62', 'pausch': 'C62', 'psch': 'C62',
  };
  return map[e] || 'C62';
}
