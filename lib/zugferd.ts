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
import { leseZahlOder, centRunden } from './zahlen';

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
  /**
   * ADDITIV (Punkt 53, 21.09.2026). Alle vier Felder sind OPTIONAL — ein
   * Aufrufer, der sie nicht mitschickt, bekommt dasselbe XML wie bisher,
   * nur mit einer zusaetzlichen Warnung.
   *
   * Die Rechnungsseite laedt diese Werte laengst aus dem Profil und
   * schickt sie an /api/rechnung-pdf (firma_iban, firma_bic, firma_bank,
   * firma_telefon) — nur an die E-Rechnung gingen sie nie mit. Deshalb
   * stand die Bankverbindung auf dem PDF und fehlte im XML.
   */
  telefon?: string;      // BG-6 Kontakt
  bank_iban?: string;    // BG-16 Zahlungsdaten
  bank_bic?: string;
  bank_name?: string;    // Kontoinhaber/Institut, nur Anzeige
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

/**
 * Betrag mit exakt 2 Nachkommastellen, Punkt als Trenner (XML-Norm).
 *
 * PUNKT 53 (21.09.2026): Vorher stand hier `Number(v)`. Aus dem Text
 * "1.234,56", wie ihn eine numeric-Spalte oft liefert, wurde NaN und
 * daraus 0.00 — im XML stand dann eine Position ueber null Euro, und das
 * XML war in sich schluessig, also meldete kein Validator etwas.
 * Jetzt liest lib/zahlen.ts, und centRunden rundet symmetrisch um Null
 * (toFixed kippt eine Gutschrift von -0,005 sonst nach oben).
 */
function n2(v: any): string {
  return centRunden(leseZahlOder(v, 0)).toFixed(2);
}

/** Prozentsatz ohne unnötige Nullen, Punkt-Trenner (z.B. "19" oder "7"). */
function nPct(v: any): string {
  return String(leseZahlOder(v, 0));
}

/**
 * Nettobetrag EINER Zeile — die eine Rundungsstelle fuer das XML.
 *
 * PUNKT 53 (21.09.2026), BR-CO-10: Die Summe der Zeilenbetraege muss die
 * Kopfsumme ergeben. Vorher wurde der Rueckfall `menge * einzelpreis`
 * UNGERUNDET weitergereicht: die Zeile bekam ihn ueber toFixed(2), die
 * Kopfsumme ueber centRunden — zwei verschiedene Rundungen auf denselben
 * Wert. GEMESSEN an der alten Fassung: zweimal 1,5 Std a 66,67 EUR ergab
 * Zeilen 100,00 + 100,00 = 200,00 und im Kopf 200,01. Jede XRechnung mit
 * diesem Muster faellt durch.
 *
 * EHRLICH DAZU: Auf dem normalen Weg ueber die Rechnungsseite ist das NIE
 * passiert — die Seite rechnet `gesamt_netto` selbst mit cent() und
 * schickt es mit (page.tsx `zeileNetto`, Z.313). Betroffen war nur der
 * Rueckfall, wenn ein Aufrufer `gesamt_netto` weglaesst. Diese Funktion
 * wendet jetzt genau dieselbe Regel an wie das Formular.
 */
export function zeilenNetto(p: any): number {
  if (p?.gesamt_netto != null) return centRunden(leseZahlOder(p.gesamt_netto, 0));
  return centRunden(leseZahlOder(p?.menge, 0) * leseZahlOder(p?.einzelpreis, 0));
}

/**
 * Datum -> YYYYMMDD (Format 102 der Norm).
 *
 * PUNKT 53 (21.09.2026), zwei Reparaturen:
 *  1. ZEITZONE. Vorher lasen getFullYear/getMonth/getDate in der Zeitzone
 *     des Servers. Ein als "2026-08-31T22:00:00Z" gespeicherter Beleg —
 *     also deutsche Mitternacht des 1. September — wurde auf einem
 *     UTC-Server zum 31.08. und rutschte in den Vormonat. Derselbe Fehler
 *     war bei datevExtf schon einmal da. Jetzt wird in UTC gelesen.
 *  2. STILLER RUECKFALL. Ein unlesbares Datum wurde stillschweigend HEUTE.
 *     Das Rechnungsdatum ist steuerlich bindend; es darf nicht erfunden
 *     werden, ohne dass es jemand erfaehrt. `lesbar` sagt es jetzt an,
 *     der Aufrufer macht daraus eine Warnung.
 */
function dat102Roh(d: any): { wert: string; lesbar: boolean } {
  let dt: Date | null = null;
  let lesbar = false;
  try {
    if (d != null && String(d).trim() !== '') {
      const versuch = new Date(d as any);
      if (!isNaN(versuch.getTime())) { dt = versuch; lesbar = true; }
    }
  } catch {
    dt = null;
  }
  if (!dt) dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return { wert: `${y}${m}${day}`, lesbar };
}

/** Wie dat102Roh, aber nur der Wert — fuer Stellen ohne Warnungsbedarf. */
function dat102(d: any): string {
  return dat102Roh(d).wert;
}

/** IBAN fuer das XML: ohne Leerzeichen, in Grossbuchstaben. */
function normIban(v: unknown): string {
  return String(v ?? '').replace(/[\s-]/g, '').toUpperCase();
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
    telefon: p.telefon ?? '',
    bank_iban: p.bank_iban ?? '',
    bank_bic: p.bank_bic ?? '',
    bank_name: p.bank_name ?? '',
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
  // BR-CO-10: dieselbe, EINMAL gerundete Zahl geht in die Zeile UND in die
  // Steuergruppe. Sonst rundet die Zeile anders als der Kopf (siehe zeilenNetto).
  const posten: SteuerPosten[] = (positionen || []).map((p: any) => ({
    netto: zeilenNetto(p),
    satz: leseZahlOder(p?.mwst_satz, 0),
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
  const rDatumRoh = dat102Roh(rechnung?.rechnungsdatum);
  const rDatum = rDatumRoh.wert;
  if (!rDatumRoh.lesbar) {
    warnungen.push('Rechnungsdatum fehlt oder ist nicht lesbar — im XML steht ersatzweise das heutige Datum. Bitte pruefen.');
  }
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
    const menge = leseZahlOder(p?.menge, 0);
    const einzel = leseZahlOder(p?.einzelpreis, 0);
    const netto = zeilenNetto(p);
    const satz = klein ? 0 : leseZahlOder(p?.mwst_satz, 0);
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
  // PUNKT 53 (21.09.2026): Fehlte die Leitweg-ID, stand bei XRechnung bisher
  // der Text "LEITWEG-ID-FEHLT" im Feld. Der ist syntaktisch gueltig — die
  // Rechnung lief also durch die Pruefung der Behoerde und wurde erst dort
  // abgelehnt, weil die Leitweg-ID nicht existiert. Ein leeres Feld mit
  // Warnung ist ehrlicher: der Fehler faellt HIER auf, nicht beim Empfaenger.
  const buyerRef = leitweg_id
    ? `<ram:BuyerReference>${x(leitweg_id)}</ram:BuyerReference>`
    : '';

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

  // ── BG-6 · Kontaktangaben des Verkaeufers (BR-DE-2/5/6 Pflicht bei XRechnung) ──
  // XSD-Reihenfolge in SellerTradeParty: Name -> DefinedTradeContact ->
  // PostalTradeAddress -> URIUniversalCommunication -> SpecifiedTaxRegistration.
  const sellerKontaktTeile =
    (seller.name ? `\n          <ram:PersonName>${x(seller.name)}</ram:PersonName>` : '') +
    (seller.telefon ? `\n          <ram:TelephoneUniversalCommunication><ram:CompleteNumber>${x(seller.telefon)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : '') +
    (seller.email ? `\n          <ram:EmailURIUniversalCommunication><ram:URIID>${x(seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : '');
  const sellerKontakt = sellerKontaktTeile
    ? `
        <ram:DefinedTradeContact>${sellerKontaktTeile}
        </ram:DefinedTradeContact>`
    : '';
  if (istXR && !seller.telefon) warnungen.push('Telefonnummer des Verkaeufers fehlt (BG-6, bei XRechnung Pflicht)');
  if (istXR && !seller.email) warnungen.push('E-Mail des Verkaeufers fehlt (BG-6, bei XRechnung Pflicht)');

  // ── BG-16 · Zahlungsdaten (IBAN/BIC). Ohne sie weiss der Empfaenger nicht,
  //    wohin er zahlen soll — BR-49/BR-50. Stand bisher nur auf dem PDF. ──
  const iban = normIban(seller.bank_iban);
  const bic = String(seller.bank_bic ?? '').replace(/\s/g, '').toUpperCase();
  const paymentMeans = iban
    ? `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${x(iban)}</ram:IBANID>${seller.bank_name ? `
          <ram:AccountName>${x(seller.bank_name)}</ram:AccountName>` : ''}
        </ram:PayeePartyCreditorFinancialAccount>${bic ? `
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${x(bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>`
    : '';
  if (!iban) warnungen.push('Bankverbindung (IBAN) fehlt — ohne sie enthaelt die E-Rechnung keine Zahlungsdaten (BG-16)');

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
        <ram:Name>${ph(seller.name, 'FIRMENNAME-FEHLT')}</ram:Name>${sellerKontakt}
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
      <ram:InvoiceCurrencyCode>${x(waehrung)}</ram:InvoiceCurrencyCode>${paymentMeans}${taxBlocks}${paymentTerms}
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
