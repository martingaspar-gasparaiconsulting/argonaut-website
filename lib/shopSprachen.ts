// ============================================================================
// ARGONAUT OS · lib/shopSprachen.ts — Shop mehrsprachig (Paket 323/324 · S4)
//
// Reine Logik, node-getestet (tests/shopSprachenP323.test.mjs).
//
//   SHOP_SPRACHEN       die 24 Sprachen aus dem mehrsprachigen Team (Paket PM)
//   TEXT_DE / TEXT_EN   Oberflächen-Texte des Shops; Englisch ist fest eingebaut,
//                       alle anderen Sprachen schlägt die KI vor und der Betrieb
//                       gibt sie frei
//   pruefeOberflaeche   Freigabe-Sperre: jeder Text da, Platzhalter ({n},
//                       {link} …) unverändert
//   textHash            Prüfsumme des deutschen Produkttextes — ändert sich das
//                       Deutsch, gilt die Übersetzung als veraltet und der Shop
//                       zeigt wieder Deutsch (nie eine alte, falsche Fassung)
//   produktText         was der Kunde sieht: freigegebene, aktuelle Übersetzung
//                       oder vollständig Deutsch — nie gemischt
//   waehleSprache       Sprache des Besuchers: gemerkte Wahl, sonst Browser,
//                       sonst Deutsch — nur aus den angebotenen Sprachen
//
// Grenzen (ehrlich): Preise, Währung (EUR), Mengen und Zahlen werden nicht
// übersetzt, nur im Format der Sprache angezeigt. Rechtstexte (AGB, Widerruf,
// Datenschutz) bleiben deutsch — der Shop sagt das in der fremden Sprache.
// Sicherheitsdatenblätter übersetzt ARGONAUT nie: die Fassung je Sprache kommt
// vom Hersteller (REACH Art. 31 Abs. 5) und wird unter Produkt-Dokumente
// hochgeladen.
// ============================================================================

import { SPRACHEN, spracheFuer, type Sprache } from './mehrsprachig';

export const SHOP_SPRACHEN: Sprache[] = SPRACHEN;
/** Sprachen, in die übersetzt wird (ohne Deutsch). */
export const FREMD_SPRACHEN: Sprache[] = SPRACHEN.filter((s) => s.code !== 'de');
/** Englisch hat eine fest eingebaute, geprüfte Oberfläche. */
export const EINGEBAUT = 'en';

export const MAX_NAME = 200;
export const MAX_BESCHREIBUNG = 1500;
/** So viele Produkte gehen in einen Übersetzungs-Aufruf (je 2 Texte, Grenze 20). */
export const PRODUKTE_JE_AUFRUF = 10;

export function istFremdSprache(code: unknown): boolean {
  const s = spracheFuer(code);
  return !!s && s.code !== 'de';
}

// ---------------------------------------------------------------------------
// Oberflächen-Texte
// ---------------------------------------------------------------------------

export const TEXT_DE = {
  sprache: 'Sprache',
  warenkorb: 'Warenkorb',
  warenkorb_leiste: '{n} Artikel · {summe} — Warenkorb öffnen',
  warenkorb_leiste_netto: '{n} Artikel · {summe} netto — Warenkorb öffnen',
  schliessen: 'Schließen',
  leer: 'Ihr Warenkorb ist leer.',
  gebinde: 'in Gebinden zu {n}',
  mindestmenge: 'Mindestmenge {n}',
  weniger: 'Weniger',
  mehr: 'Mehr',
  entfernen: 'Entfernen',
  summe: 'Summe',
  summe_netto: 'Summe netto',
  hinweis_brutto: 'Alle Preise inkl. MwSt. Versandkosten & Lieferzeit stimmt der Anbieter mit Ihnen ab.',
  hinweis_netto: 'Alle Preise netto zzgl. gesetzlicher MwSt. Den Endbetrag mit MwSt erhalten Sie mit der Bestätigung. Versandkosten & Lieferzeit stimmt der Anbieter mit Ihnen ab.',
  feld_name: 'Name*',
  feld_ansprechpartner: 'Ansprechpartner*',
  feld_email: 'E-Mail',
  feld_telefon: 'Telefon',
  feld_bestellnummer: 'Ihre Bestellnummer (optional)',
  feld_anschrift: 'Anschrift / Nachricht',
  feld_lieferanschrift: 'Lieferanschrift / Nachricht',
  zahlart: 'Zahlart',
  auf_rechnung: 'Auf Rechnung ({n} Tage)',
  vorkasse: 'Vorkasse',
  datenschutz: 'Ich habe die {link}Datenschutzerklärung{/link} gelesen und stimme zu.*',
  bestellen: 'Zahlungspflichtig bestellen',
  senden: 'Senden …',
  fehler_name: 'Bitte Ihren Namen angeben.',
  fehler_ansprechpartner: 'Bitte einen Ansprechpartner angeben.',
  fehler_kontakt: 'Bitte E-Mail oder Telefon angeben.',
  fehler_datenschutz: 'Bitte der Datenschutzerklärung zustimmen.',
  bestellung: 'Bestellung',
  danke: '✓ Vielen Dank! Ihre Bestellung ist eingegangen — wir melden uns mit der Bestätigung.',
  fehler_bestellung: 'Bestellung fehlgeschlagen. Bitte später erneut.',
  fehler_verbindung: 'Verbindung fehlgeschlagen. Bitte später erneut.',
  konto: 'Angemeldet als {name} · Ihre Preise netto zzgl. MwSt',
  konto_rechnung: 'Kauf auf Rechnung ({n} Tage)',
  abmelden: 'Nicht Ihr Konto? Abmelden',
  abgemeldet: 'Sie sind abgemeldet und sehen die normalen Shop-Preise.',
  link_ungueltig: 'Ihr Kundenlink ist nicht mehr gültig. Sie sehen die normalen Shop-Preise; einen neuen Link erhalten Sie beim Anbieter.',
  link_ungueltig_kasse: 'Ihr Kundenlink ist nicht mehr gültig. Bitte fordern Sie beim Anbieter einen neuen an.',
  keine_produkte: 'Noch keine Produkte im Shop.',
  ab: 'ab {n}',
  inkl_mwst: 'inkl. MwSt',
  netto_mwst: 'netto zzgl. MwSt',
  in_warenkorb: 'In den Warenkorb',
  version: 'Version',
  rechtstexte: 'Rechtliche Hinweise (AGB, Widerrufsbelehrung, Datenschutzerklärung) liegen nur auf Deutsch vor.',
  dok_sdb: 'Sicherheitsdatenblatt',
  dok_tdb: 'Technisches Merkblatt',
  dok_leistungserklaerung: 'Leistungserklärung',
  dok_konformitaet: 'Konformitätserklärung',
  dok_spezifikation: 'Produktspezifikation',
  dok_zertifikat: 'Zertifikat',
  dok_anleitung: 'Anleitung',
  dok_sonstiges: 'Dokument',
  // Paket 327 (S3b) — Zusatz-Text: fehlt er in einer freigegebenen Sprache, steht dort Deutsch (siehe TEXT_ZUSATZ_KEYS).
  nur_gewerbe: 'Bestellungen nur für geprüfte Geschäftskunden. Für ein Kundenkonto wenden Sie sich bitte an uns.',
  // Paket 343 (BV3b) — Vorbestellung im Shop, Zusatz-Texte (TEXT_ZUSATZ_KEYS).
  vb_titel: 'Jetzt vorbestellen',
  vb_info: 'Knappe Ware: verbindlich vorbestellen, im Laden abholen, bei der Abholung bezahlen.',
  vb_frei: 'noch {n} frei',
  vb_ausgebucht: 'ausgebucht',
  vb_abholung: 'Abholung vom {von} bis {bis}',
  vb_schluss: 'Bestellschluss {datum}',
  vb_max: 'höchstens {n} je Kunde',
  vb_je: 'je {einheit}',
  vb_gewicht: 'Der Endpreis richtet sich nach dem Gewicht bei der Abholung.',
  vb_zahlung: 'Bezahlung bei der Abholung.',
  vb_pflicht: 'Pflichtangaben (Zutaten, Allergene, Nährwerte)',
  vb_menge: 'Menge ({einheit})',
  vb_wunsch: 'Gewünschte Menge ({einheit})',
  vb_tag: 'Abholtag',
  vb_voraus: 'voraussichtlich {summe}',
  vb_knopf: 'Vorbestellen',
  vb_bestellen: 'Zahlungspflichtig vorbestellen',
  vb_danke: '✓ Vielen Dank! Ihre Vorbestellung ist eingegangen.',
  vb_vormerken_knopf: 'Auf die Vormerkliste',
  vb_vormerken_info: 'Wird wieder etwas frei, benachrichtigen wir Sie der Reihe nach.',
  vb_vormerken: 'Vormerken',
  vb_einwilligung: 'Ich willige ein:',
  vb_fehler_einwilligung: 'Bitte bestätigen Sie, dass wir Sie benachrichtigen dürfen.',
  vb_vormerk_danke: '✓ Sie stehen auf der Vormerkliste. Wir melden uns, sobald etwas frei ist.',
  vb_fehler_menge: 'Bitte eine gültige Menge eintragen.',
  vb_fehler_tag: 'Bitte einen Abholtag wählen.',
  vb_fehler: 'Das hat nicht geklappt. Bitte später erneut.',
  vb_abbrechen: 'Abbrechen',
} as const;

export type TextKey = keyof typeof TEXT_DE;
export type Texte = Record<TextKey, string>;
export const TEXT_KEYS = Object.keys(TEXT_DE) as TextKey[];
/**
 * Paket 327: Texte, die NACH der ersten Freigabe dazukamen. Sie sind keine
 * Pflicht für die Freigabe einer Sprache — sonst fiele jede schon freigegebene
 * Sprache aus dem Shop, sobald ein neuer Knopf dazukommt. Fehlt so ein Text,
 * zeigt der Shop ihn auf Deutsch.
 */
export const TEXT_ZUSATZ_KEYS: TextKey[] = [
  'nur_gewerbe',
  'vb_titel',
  'vb_info',
  'vb_frei',
  'vb_ausgebucht',
  'vb_abholung',
  'vb_schluss',
  'vb_max',
  'vb_je',
  'vb_gewicht',
  'vb_zahlung',
  'vb_pflicht',
  'vb_menge',
  'vb_wunsch',
  'vb_tag',
  'vb_voraus',
  'vb_knopf',
  'vb_bestellen',
  'vb_danke',
  'vb_vormerken_knopf',
  'vb_vormerken_info',
  'vb_vormerken',
  'vb_einwilligung',
  'vb_fehler_einwilligung',
  'vb_vormerk_danke',
  'vb_fehler_menge',
  'vb_fehler_tag',
  'vb_fehler',
  'vb_abbrechen',
];
export const TEXT_PFLICHT_KEYS: TextKey[] = TEXT_KEYS.filter((k) => !TEXT_ZUSATZ_KEYS.includes(k));

/** Fest eingebaute englische Oberfläche (geprüft, für den ersten Export-Kunden). */
export const TEXT_EN: Texte = {
  sprache: 'Language',
  warenkorb: 'Shopping cart',
  warenkorb_leiste: '{n} items · {summe} — open cart',
  warenkorb_leiste_netto: '{n} items · {summe} net — open cart',
  schliessen: 'Close',
  leer: 'Your cart is empty.',
  gebinde: 'in packs of {n}',
  mindestmenge: 'Minimum quantity {n}',
  weniger: 'Less',
  mehr: 'More',
  entfernen: 'Remove',
  summe: 'Total',
  summe_netto: 'Total (net)',
  hinweis_brutto: 'All prices include VAT. The seller will agree shipping costs and delivery time with you.',
  hinweis_netto: 'All prices are net plus statutory VAT. You will receive the final amount including VAT with the confirmation. The seller will agree shipping costs and delivery time with you.',
  feld_name: 'Name*',
  feld_ansprechpartner: 'Contact person*',
  feld_email: 'Email',
  feld_telefon: 'Phone',
  feld_bestellnummer: 'Your order reference (optional)',
  feld_anschrift: 'Address / message',
  feld_lieferanschrift: 'Delivery address / message',
  zahlart: 'Payment method',
  auf_rechnung: 'On invoice ({n} days)',
  vorkasse: 'Prepayment',
  datenschutz: 'I have read the {link}privacy policy{/link} and agree.*',
  bestellen: 'Order with obligation to pay',
  senden: 'Sending …',
  fehler_name: 'Please enter your name.',
  fehler_ansprechpartner: 'Please enter a contact person.',
  fehler_kontakt: 'Please enter an email address or a phone number.',
  fehler_datenschutz: 'Please agree to the privacy policy.',
  bestellung: 'Order',
  danke: '✓ Thank you! Your order has been received — we will get back to you with the confirmation.',
  fehler_bestellung: 'The order could not be placed. Please try again later.',
  fehler_verbindung: 'Connection failed. Please try again later.',
  konto: 'Signed in as {name} · your prices net plus VAT',
  konto_rechnung: 'purchase on invoice ({n} days)',
  abmelden: 'Not your account? Sign out',
  abgemeldet: 'You are signed out and see the regular shop prices.',
  link_ungueltig: 'Your customer link is no longer valid. You see the regular shop prices; you can get a new link from the seller.',
  link_ungueltig_kasse: 'Your customer link is no longer valid. Please request a new one from the seller.',
  keine_produkte: 'No products in the shop yet.',
  ab: 'from {n}',
  inkl_mwst: 'incl. VAT',
  netto_mwst: 'net plus VAT',
  in_warenkorb: 'Add to cart',
  version: 'Version',
  rechtstexte: 'Legal information (terms and conditions, cancellation policy, privacy policy) is available in German only.',
  dok_sdb: 'Safety data sheet',
  dok_tdb: 'Technical data sheet',
  dok_leistungserklaerung: 'Declaration of performance',
  dok_konformitaet: 'Declaration of conformity',
  dok_spezifikation: 'Product specification',
  dok_zertifikat: 'Certificate',
  dok_anleitung: 'Instructions',
  dok_sonstiges: 'Document',
  nur_gewerbe: 'Orders only for verified business customers. Please contact us to request a customer account.',
  vb_titel: 'Pre-order now',
  vb_info: 'Limited items: pre-order now, collect in store and pay on collection.',
  vb_frei: '{n} still available',
  vb_ausgebucht: 'sold out',
  vb_abholung: 'Collection from {von} to {bis}',
  vb_schluss: 'Order deadline {datum}',
  vb_max: 'maximum {n} per customer',
  vb_je: 'per {einheit}',
  vb_gewicht: 'The final price depends on the weight at collection.',
  vb_zahlung: 'Payment on collection.',
  vb_pflicht: 'Mandatory food information (in German)',
  vb_menge: 'Quantity ({einheit})',
  vb_wunsch: 'Desired quantity ({einheit})',
  vb_tag: 'Collection day',
  vb_voraus: 'approx. {summe}',
  vb_knopf: 'Pre-order',
  vb_bestellen: 'Pre-order with obligation to pay',
  vb_danke: '✓ Thank you! Your pre-order has been received.',
  vb_vormerken_knopf: 'Join the waiting list',
  vb_vormerken_info: 'If something becomes available again, we will notify you in order.',
  vb_vormerken: 'Join waiting list',
  vb_einwilligung: 'I consent (wording in German):',
  vb_fehler_einwilligung: 'Please confirm that we may notify you.',
  vb_vormerk_danke: '✓ You are on the waiting list. We will contact you as soon as something is available.',
  vb_fehler_menge: 'Please enter a valid quantity.',
  vb_fehler_tag: 'Please choose a collection day.',
  vb_fehler: 'That did not work. Please try again later.',
  vb_abbrechen: 'Cancel',
};

/** Platzhalter eines Textes, sortiert ({n}, {summe}, {name}, {link}, {/link}). */
export function platzhalter(text: unknown): string[] {
  return (String(text ?? '').match(/\{\/?[a-z_]+\}/g) ?? []).slice().sort();
}

/** Nur bekannte Schlüssel, nur Text, begrenzt. */
export function saubereTexte(roh: unknown): Partial<Texte> {
  const o = (roh && typeof roh === 'object' && !Array.isArray(roh)) ? roh as Record<string, unknown> : {};
  const aus: Partial<Texte> = {};
  for (const k of TEXT_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) aus[k] = v.replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  return aus;
}

/**
 * Freigabe-Sperre für eine Oberfläche: jeder Pflicht-Text muss da sein, die Platzhalter
 * genau wie im Deutschen. Liefert die Gründe (leer = freigabefähig).
 */
export function pruefeOberflaeche(roh: unknown): string[] {
  const t = saubereTexte(roh);
  const f: string[] = [];
  const fehlen = TEXT_PFLICHT_KEYS.filter((k) => !t[k]);
  if (fehlen.length) f.push(`${fehlen.length} Text${fehlen.length === 1 ? '' : 'e'} fehlen noch: ${fehlen.slice(0, 5).join(', ')}${fehlen.length > 5 ? ' …' : ''}`);
  for (const k of TEXT_KEYS) {
    if (!t[k]) continue;
    if (platzhalter(t[k]).join(' ') !== platzhalter(TEXT_DE[k]).join(' ')) {
      f.push(`„${k}": Platzhalter ${platzhalter(TEXT_DE[k]).join(' ') || '(keine)'} müssen unverändert bleiben.`);
    }
  }
  return f;
}

export type SpracheZeile = { sprache: string; aktiv?: boolean | null; texte?: unknown; status?: string | null };

/**
 * Oberfläche einer Sprache für den Shop — oder null, wenn sie (noch) nicht
 * benutzbar ist. Deutsch und Englisch gehen immer (Englisch: eigene, freigegebene
 * Änderungen gehen vor). Alle anderen nur freigegeben und vollständig.
 */
export function oberflaecheFuer(code: unknown, zeile: SpracheZeile | null | undefined): Texte | null {
  const s = spracheFuer(code);
  if (!s) return null;
  if (s.code === 'de') return { ...TEXT_DE };
  const freigegeben = !!zeile && zeile.status === 'freigegeben';
  if (s.code === EINGEBAUT) {
    if (!freigegeben) return { ...TEXT_EN };
    const eigen = saubereTexte(zeile!.texte);
    const aus = { ...TEXT_EN };
    for (const k of TEXT_KEYS) if (eigen[k] && platzhalter(eigen[k]).join(' ') === platzhalter(TEXT_DE[k]).join(' ')) aus[k] = eigen[k]!;
    return aus;
  }
  if (!freigegeben || pruefeOberflaeche(zeile!.texte).length) return null;
  return { ...TEXT_DE, ...saubereTexte(zeile!.texte) } as Texte;
}

/** Darf diese Sprache im Shop angeboten werden? (gleiche Regel wie der Datenbank-Wächter) */
export function darfAnbieten(code: unknown, zeile: SpracheZeile | null | undefined): string | null {
  const s = spracheFuer(code);
  if (!s || s.code === 'de') return 'Unbekannte Sprache.';
  if (s.code === EINGEBAUT) return null;
  if (!zeile || zeile.status !== 'freigegeben') return 'Zuerst die Oberflächen-Texte prüfen und freigeben.';
  const f = pruefeOberflaeche(zeile.texte);
  return f.length ? f[0] : null;
}

/** Angebotene Sprachen in fester Reihenfolge: Deutsch immer zuerst. */
export function angeboteneSprachen(zeilen: SpracheZeile[] | null | undefined): string[] {
  const an = new Set<string>();
  for (const z of zeilen ?? []) {
    if (z && z.aktiv === true && oberflaecheFuer(z.sprache, z) && darfAnbieten(z.sprache, z) === null) an.add(String(z.sprache));
  }
  return SHOP_SPRACHEN.filter((s) => s.code === 'de' || an.has(s.code)).map((s) => s.code);
}

/**
 * Sprache des Besuchers: zuerst seine gemerkte Wahl, dann die Browser-Sprachen
 * (z. B. „en-US,en;q=0.9,de"), sonst Deutsch. Nur angebotene Sprachen.
 */
export function waehleSprache(gewaehlt: unknown, browser: unknown, angeboten: string[]): string {
  const an = new Set(angeboten);
  const g = spracheFuer(gewaehlt);
  if (g && an.has(g.code)) return g.code;
  const liste = String(browser ?? '').split(',').map((x) => x.split(';')[0].trim().toLowerCase()).filter(Boolean).slice(0, 12);
  for (const b of liste) {
    const haupt = b.split('-')[0];
    if (an.has(haupt)) return haupt;
  }
  return 'de';
}

// ---------------------------------------------------------------------------
// Produkt-Texte
// ---------------------------------------------------------------------------

function norm(t: unknown): string {
  return String(t ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/** Prüfsumme (FNV-1a, 8 Hex-Zeichen) des deutschen Namens und der Beschreibung. */
export function textHash(name: unknown, beschreibung: unknown): string {
  const s = norm(name) + '\u0000' + norm(beschreibung);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export type Deutsch = { name: string | null; beschreibung: string | null };
export type UebersetzungZeile = {
  artikel_id?: string; sprache: string; name: string | null; beschreibung: string | null;
  quelle_hash: string | null; status: string | null;
  rueck_name?: string | null; rueck_beschreibung?: string | null;
};
export type UStatus = 'fehlt' | 'vorschlag' | 'freigegeben' | 'veraltet';

export function uebersetzungsStatus(de: Deutsch, z: UebersetzungZeile | null | undefined): UStatus {
  if (!z || !norm(z.name)) return 'fehlt';
  if (z.quelle_hash !== textHash(de.name, de.beschreibung)) return 'veraltet';
  return z.status === 'freigegeben' ? 'freigegeben' : 'vorschlag';
}

export const STATUS_INFO: Record<UStatus, { label: string; farbe: 'grau' | 'gelb' | 'gruen' | 'rot' }> = {
  fehlt: { label: 'fehlt', farbe: 'grau' },
  vorschlag: { label: 'Vorschlag — prüfen', farbe: 'gelb' },
  freigegeben: { label: 'freigegeben', farbe: 'gruen' },
  veraltet: { label: 'veraltet — Deutsch geändert', farbe: 'rot' },
};

/** Was der Kunde sieht: freigegeben + aktuell -> Übersetzung, sonst vollständig Deutsch. */
export function produktText(de: Deutsch, z: UebersetzungZeile | null | undefined): { name: string; beschreibung: string; uebersetzt: boolean } {
  const deutsch = { name: norm(de.name), beschreibung: norm(de.beschreibung), uebersetzt: false };
  if (uebersetzungsStatus(de, z) !== 'freigegeben') return deutsch;
  if (deutsch.beschreibung && !norm(z!.beschreibung)) return deutsch;
  return { name: norm(z!.name), beschreibung: deutsch.beschreibung ? norm(z!.beschreibung) : '', uebersetzt: true };
}

/** Gründe gegen eine Freigabe (leer = freigabefähig). */
export function freigabeFehler(de: Deutsch, z: { name: string | null; beschreibung: string | null }): string[] {
  const f: string[] = [];
  if (!norm(z.name)) f.push('Der übersetzte Name fehlt.');
  if (norm(de.beschreibung) && !norm(z.beschreibung)) f.push('Die übersetzte Beschreibung fehlt.');
  if (norm(z.name).length > MAX_NAME) f.push(`Name höchstens ${MAX_NAME} Zeichen.`);
  if (norm(z.beschreibung).length > MAX_BESCHREIBUNG) f.push(`Beschreibung höchstens ${MAX_BESCHREIBUNG} Zeichen.`);
  return f;
}

/** Zeile zum Speichern: gesäubert, Prüfsumme des aktuellen Deutsch, Status Vorschlag. */
export function zeileFuerSpeichern(
  artikelId: string, code: string, de: Deutsch,
  u: { name: string | null; beschreibung: string | null; rueck_name?: string | null; rueck_beschreibung?: string | null },
): UebersetzungZeile & { artikel_id: string } {
  const kurz = (t: unknown, n: number) => { const x = norm(t); return x ? x.slice(0, n) : null; };
  return {
    artikel_id: artikelId,
    sprache: code,
    name: kurz(u.name, MAX_NAME),
    beschreibung: kurz(u.beschreibung, MAX_BESCHREIBUNG),
    rueck_name: kurz(u.rueck_name, 3000),
    rueck_beschreibung: kurz(u.rueck_beschreibung, 3000),
    quelle_hash: textHash(de.name, de.beschreibung),
    status: 'vorschlag',
  };
}

/** Texte für einen Übersetzungs-Aufruf: je Produkt Name und (wenn da) Beschreibung. */
export function uebersetzAuftrag(produkte: { id: string; name: string | null; beschreibung: string | null }[]): { texte: string[]; zuordnung: { id: string; feld: 'name' | 'beschreibung' }[] } {
  const texte: string[] = [];
  const zuordnung: { id: string; feld: 'name' | 'beschreibung' }[] = [];
  for (const p of produkte.slice(0, PRODUKTE_JE_AUFRUF)) {
    const n = norm(p.name);
    if (!n) continue;
    texte.push(n); zuordnung.push({ id: p.id, feld: 'name' });
    const b = norm(p.beschreibung);
    if (b) { texte.push(b); zuordnung.push({ id: p.id, feld: 'beschreibung' }); }
  }
  return { texte, zuordnung };
}

/** In Pakete teilen, die /api/uebersetzen annimmt (höchstens 20 Texte, 12 000 Zeichen). */
export function inPakete<T extends { name: string | null; beschreibung: string | null }>(liste: T[]): T[][] {
  const pakete: T[][] = [];
  let akt: T[] = [];
  let zeichen = 0;
  for (const p of liste) {
    const l = norm(p.name).length + norm(p.beschreibung).length;
    if (akt.length && (akt.length >= PRODUKTE_JE_AUFRUF || zeichen + l > 11000)) { pakete.push(akt); akt = []; zeichen = 0; }
    akt.push(p); zeichen += l;
  }
  if (akt.length) pakete.push(akt);
  return pakete;
}

// ---------------------------------------------------------------------------
// Produkt-Dokumente im Shop
// ---------------------------------------------------------------------------

/** Dokumente in der Kundensprache zuerst, dann Deutsch, dann der Rest (stabil). */
export function dokumenteSortiert<T extends { sprache: string }>(doks: T[], code: string): T[] {
  const rang = (s: string) => (s === code ? 0 : s === 'de' ? 1 : 2);
  return doks.map((d, i) => ({ d, i })).sort((a, b) => rang(a.d.sprache) - rang(b.d.sprache) || a.i - b.i).map((x) => x.d);
}

/** Sprachen, in denen es zu einem Artikel Shop-Dokumente gibt (für die Übersicht). */
export function dokSprachen(doks: { sprache?: string | null }[]): string[] {
  return Array.from(new Set((doks ?? []).map((d) => String(d.sprache ?? 'de')))).sort();
}

// ---------------------------------------------------------------------------
// Paket 324: Bestätigungs-Mail an den Käufer
// ---------------------------------------------------------------------------

export type MailTexte = {
  betreff: string; betreffBei: string; titel: string; anrede: string; anredeName: string; dank: string; dankBei: string;
  gruss: string; summe: string; summeNetto: string; ust: string; summeBrutto: string; zahlart: string;
  aufRechnung: string; vorkasse: string; bestellnummer: string;
};

const MAIL_DE: MailTexte = {
  betreff: 'Ihre Bestellung', betreffBei: 'Ihre Bestellung bei {firma}', titel: 'Ihre Bestellung ist eingegangen',
  anrede: 'Guten Tag,', anredeName: 'Guten Tag {name},',
  dank: 'vielen Dank für Ihre Bestellung. Wir haben sie erhalten und melden uns mit der Bestätigung.',
  dankBei: 'vielen Dank für Ihre Bestellung bei {firma}. Wir haben sie erhalten und melden uns mit der Bestätigung.',
  gruss: 'Beste Grüße', summe: 'Summe', summeNetto: 'Summe netto', ust: 'Umsatzsteuer', summeBrutto: 'Summe brutto',
  zahlart: 'Zahlart', aufRechnung: 'auf Rechnung ({n} Tage)', vorkasse: 'Vorkasse', bestellnummer: 'Ihre Bestellnummer',
};

const MAIL_EN: MailTexte = {
  betreff: 'Your order', betreffBei: 'Your order with {firma}', titel: 'Your order has been received',
  anrede: 'Hello,', anredeName: 'Hello {name},',
  dank: 'thank you for your order. We have received it and will get back to you with the confirmation.',
  dankBei: 'thank you for your order with {firma}. We have received it and will get back to you with the confirmation.',
  gruss: 'Kind regards', summe: 'Total', summeNetto: 'Total (net)', ust: 'VAT', summeBrutto: 'Total (gross)',
  zahlart: 'Payment method', aufRechnung: 'on invoice ({n} days)', vorkasse: 'prepayment', bestellnummer: 'Your order reference',
};

/** Mail-Texte: Englisch fest, alle anderen Sprachen vorerst Deutsch (ehrlich, keine ungeprüfte KI-Mail). */
export function mailTexte(code: unknown): MailTexte {
  return spracheFuer(code)?.code === 'en' ? MAIL_EN : MAIL_DE;
}

/** Platzhalter füllen: {n}, {name}, {summe}, {firma} … (Werte werden NICHT maskiert — vorher selbst maskieren). */
export function fuellen(text: string, werte: Record<string, string | number>): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in werte ? String(werte[k]) : m));
}

/** Sprache aus der Bestellung: nur bekannte Codes, sonst null (Deutsch wird nicht extra vermerkt). */
export function bestellSprache(code: unknown): string | null {
  const s = spracheFuer(code);
  return s && s.code !== 'de' ? s.code : null;
}
