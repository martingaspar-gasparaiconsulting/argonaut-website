// ============================================================================
// ARGONAUT OS · lib/shopB2b.ts — Paket 316/317 (11.10.2026) · S3a Geschäftskunden-Shop
//
// Reine Logik (ohne Datenbank, node-testbar) für den Geschäftskunden-Teil
// des Onlineshops:
//   · Preis-Basis des Artikelstamms (brutto wie bisher im Shop, oder netto)
//   · Kundenpreis aus Preisliste: fester Netto-Preis mit Staffeln („ab 10"),
//     sonst Pauschal-Rabatt der Liste auf den Netto-Basispreis
//   · Gebinde und Mindestmenge
//   · Bestell-Positionen mit Netto-Preisen in Cent, Steuer je Satz
//   · Kreditrahmen für „Kauf auf Rechnung"
//   · Kundenkonto per Link (Token, nur die Prüfsumme liegt in der Datenbank)
//
// Claude-Befunde 11.10.2026 (vorher):
//   1. Der Shop behandelt artikel.verkaufspreis als BRUTTO, der BMEcat-/
//      Datanorm-Import schreibt dort NETTO hinein -> Einstellung je Betrieb.
//   2. Shop-Bestellungen waren anonym (keine Kunden-Zuordnung).
//   3. rechnung-aus-shop rechnete netto aus brutto je Stück zurück -> bei
//      Netto-Preisen Cent-Drift. Neu: Position trägt einzelpreis_netto.
//   4. Keine Mindestmenge, kein Gebinde.
//
// Geld immer in GANZEN Cent rechnen. Kein eigener Zahlenleser (lib/zahlen).
// ============================================================================

import { leseZahl, inCent } from './zahlen';

export const SHOP_B2B_MODUL = 'shop-b2b';

export type PreisBasis = 'brutto' | 'netto';
export const PREIS_BASIS_STANDARD: PreisBasis = 'brutto';

export function preisBasis(wert: unknown): PreisBasis {
  return wert === 'netto' ? 'netto' : 'brutto';
}

export const MENGE_MAX = 100000;
export const RABATT_MAX = 90;
export const ZIEL_MAX = 90;
export const PREIS_MAX_CENT = 100000000; // 1 Mio. € je Stück
export const RAHMEN_MAX_CENT = 2000000000; // 20 Mio. €

// ---------------------------------------------------------------------------
// Cent-Rechnung
// ---------------------------------------------------------------------------

/** Ganze Zahl a/b, kaufmännisch gerundet (nur für a >= 0, b > 0). */
function teileRund(a: number, b: number): number {
  const q = Math.floor(a / b);
  const rest = a - q * b;
  return rest * 2 >= b ? q + 1 : q;
}

/** Brutto in Cent aus Netto in Cent (ganzzahlig, kaufmännisch). */
export function bruttoAusNetto(nettoCent: number, satz: number): number {
  if (!Number.isFinite(nettoCent) || nettoCent <= 0) return 0;
  return teileRund(Math.round(nettoCent) * (100 + satz), 100);
}

/** Netto in Cent aus Brutto in Cent (ganzzahlig, kaufmännisch). */
export function nettoAusBrutto(bruttoCent: number, satz: number): number {
  if (!Number.isFinite(bruttoCent) || bruttoCent <= 0) return 0;
  return teileRund(Math.round(bruttoCent) * 100, 100 + satz);
}

/** Steuer in Cent auf eine Netto-Summe (kaufmännisch). */
export function steuerAus(nettoCent: number, satz: number): number {
  if (!Number.isFinite(nettoCent) || nettoCent <= 0 || satz <= 0) return 0;
  return teileRund(Math.round(nettoCent) * satz, 100);
}

/** Netto-Basispreis in Cent aus dem Artikelstamm (null = kein Preis). */
export function basisNettoCent(verkaufspreis: unknown, satz: number, basis: PreisBasis): number | null {
  const v = leseZahl(verkaufspreis);
  if (v == null || v <= 0) return null;
  const c = inCent(v);
  if (c <= 0) return null;
  return basis === 'netto' ? c : nettoAusBrutto(c, satz);
}

/** Brutto-Basispreis in Cent aus dem Artikelstamm (null = kein Preis). */
export function basisBruttoCent(verkaufspreis: unknown, satz: number, basis: PreisBasis): number | null {
  const v = leseZahl(verkaufspreis);
  if (v == null || v <= 0) return null;
  const c = inCent(v);
  if (c <= 0) return null;
  return basis === 'brutto' ? c : bruttoAusNetto(c, satz);
}

/** Cent als Euro-Zahl (für JSON und alte Felder). */
export function euro(cent: number): number {
  return Math.round(cent) / 100;
}

// ---------------------------------------------------------------------------
// Preisliste und Staffeln
// ---------------------------------------------------------------------------

export type PreisZeile = { artikel_id: string; ab_menge: number; netto_cent: number };
export type Preisliste = { id?: string; name?: string; rabatt_prozent: number; preise: PreisZeile[] };

export type Staffel = { ab: number; netto_cent: number };

/** Staffeln eines Artikels aus der Liste, aufsteigend, doppelte „ab" nur einmal. */
export function staffelnFuer(artikelId: string, liste: Preisliste | null | undefined): Staffel[] {
  if (!liste) return [];
  const je = new Map<number, number>();
  for (const z of liste.preise || []) {
    if (!z || z.artikel_id !== artikelId) continue;
    const ab = Math.floor(Number(z.ab_menge));
    const c = Math.round(Number(z.netto_cent));
    if (!(ab >= 1) || !(c > 0)) continue;
    je.set(ab, c);
  }
  return Array.from(je.entries()).sort((a, b) => a[0] - b[0]).map(([ab, netto_cent]) => ({ ab, netto_cent }));
}

export type PreisQuelle = 'liste' | 'rabatt' | 'standard';
export type KundenPreis = { netto_cent: number; quelle: PreisQuelle };

/** Rabatt in Prozent lesen: 0 … 90, sonst 0. */
export function rabattProzent(wert: unknown): number {
  const n = leseZahl(wert);
  if (n == null || !(n > 0) || n > RABATT_MAX) return 0;
  return n;
}

/**
 * Netto-Stückpreis für den Kunden bei dieser Menge.
 * 1. Fester Preis aus der Liste: die höchste Staffel mit ab <= Menge.
 * 2. Sonst Pauschal-Rabatt der Liste auf den Basispreis.
 * 3. Sonst Basispreis. Fester Listenpreis und Rabatt werden NIE addiert.
 */
export function kundenPreis(
  artikelId: string, basisNetto: number | null, menge: number, liste: Preisliste | null | undefined,
): KundenPreis | null {
  const st = staffelnFuer(artikelId, liste);
  let treffer: Staffel | null = null;
  for (const s of st) if (s.ab <= menge) treffer = s;
  if (treffer) return { netto_cent: treffer.netto_cent, quelle: 'liste' };
  if (basisNetto == null || basisNetto <= 0) return null;
  const r = liste ? rabattProzent(liste.rabatt_prozent) : 0;
  if (r > 0) {
    // Rabatt in Hundertstel-Prozent, ganzzahlig: basis * (10000 - r*100) / 10000
    const faktor = 10000 - Math.round(r * 100);
    return { netto_cent: Math.max(1, teileRund(basisNetto * faktor, 10000)), quelle: 'rabatt' };
  }
  return { netto_cent: basisNetto, quelle: 'standard' };
}

/** Anzeige-Staffeln für das Schaufenster: Kundenpreis ab Mindestmenge + höhere Staffeln. */
export function schaufensterStaffeln(
  artikelId: string, basisNetto: number | null, mindest: number, liste: Preisliste | null | undefined,
): Staffel[] {
  const start = kundenPreis(artikelId, basisNetto, mindest, liste);
  const aus: Staffel[] = [];
  if (start) aus.push({ ab: mindest, netto_cent: start.netto_cent });
  for (const s of staffelnFuer(artikelId, liste)) {
    if (s.ab <= mindest) continue;
    const vor = aus[aus.length - 1];
    if (vor && vor.netto_cent === s.netto_cent) continue;
    aus.push(s);
  }
  return aus;
}

export type PreisEingabe = { ab_menge: unknown; netto: unknown };

/** Eingabe einer Staffel-Zeile prüfen (Netto in Euro, wie im Feld eingegeben). */
export function preisZeilePruefen(e: PreisEingabe): { ok: true; ab_menge: number; netto_cent: number } | { ok: false; fehler: string } {
  const ab = leseZahl(e.ab_menge);
  if (ab == null || !Number.isInteger(ab) || ab < 1 || ab > MENGE_MAX) {
    return { ok: false, fehler: `„Ab Menge" muss eine ganze Zahl von 1 bis ${MENGE_MAX.toLocaleString('de-DE')} sein.` };
  }
  const n = leseZahl(e.netto);
  if (n == null || n <= 0) return { ok: false, fehler: 'Bitte einen Netto-Preis über 0 eintragen.' };
  const c = inCent(n);
  if (c <= 0 || c > PREIS_MAX_CENT) return { ok: false, fehler: 'Der Netto-Preis liegt außerhalb des erlaubten Bereichs.' };
  return { ok: true, ab_menge: ab, netto_cent: c };
}

// ---------------------------------------------------------------------------
// Gebinde und Mindestmenge
// ---------------------------------------------------------------------------

function ganzeZahl(wert: unknown, standard: number): number {
  const n = leseZahl(wert);
  if (n == null || !Number.isInteger(n) || n < 1 || n > MENGE_MAX) return standard;
  return n;
}

export type MengenRegel = { gebinde: number; mindest: number };

/** Regel aus den Artikel-Feldern; Mindestmenge wird aufs Gebinde aufgerundet. */
export function mengenRegel(gebinde: unknown, mindest: unknown): MengenRegel {
  const g = ganzeZahl(gebinde, 1);
  const m0 = ganzeZahl(mindest, 1);
  const m = Math.ceil(m0 / g) * g;
  return { gebinde: g, mindest: Math.min(m, Math.floor(MENGE_MAX / g) * g) };
}

/** Kleinste gültige Menge >= Wunsch (für die „+"-Schritte und Vorschläge). */
export function mengeVorschlag(wunsch: number, r: MengenRegel): number {
  const w = Number.isFinite(wunsch) ? Math.floor(wunsch) : 0;
  if (w <= r.mindest) return r.mindest;
  const v = Math.ceil(w / r.gebinde) * r.gebinde;
  return Math.min(v, Math.floor(MENGE_MAX / r.gebinde) * r.gebinde);
}

/** Ist die Menge erlaubt? Fehlertext in „Sie"-Form. */
export function mengePruefen(menge: unknown, r: MengenRegel, name = 'Dieser Artikel'): { ok: true; menge: number } | { ok: false; fehler: string } {
  const n = leseZahl(menge);
  if (n == null || !Number.isInteger(n) || n < 1) return { ok: false, fehler: `${name}: bitte eine ganze Menge angeben.` };
  if (n > MENGE_MAX) return { ok: false, fehler: `${name}: höchstens ${MENGE_MAX.toLocaleString('de-DE')} Stück je Bestellung.` };
  if (n < r.mindest) return { ok: false, fehler: `${name}: Mindestmenge ${r.mindest.toLocaleString('de-DE')}.` };
  if (n % r.gebinde !== 0) return { ok: false, fehler: `${name}: nur in Gebinden zu ${r.gebinde.toLocaleString('de-DE')} Stück bestellbar.` };
  return { ok: true, menge: n };
}

/** Feld-Eingabe am Artikel prüfen (Dashboard). */
export function regelEingabePruefen(gebinde: unknown, mindest: unknown): { ok: true; gebinde: number; mindest: number } | { ok: false; fehler: string } {
  const g = leseZahl(gebinde);
  const m = leseZahl(mindest);
  if (g == null || !Number.isInteger(g) || g < 1 || g > MENGE_MAX) return { ok: false, fehler: 'Gebinde: ganze Zahl ab 1.' };
  if (m == null || !Number.isInteger(m) || m < 1 || m > MENGE_MAX) return { ok: false, fehler: 'Mindestmenge: ganze Zahl ab 1.' };
  if (m % g !== 0) return { ok: false, fehler: `Die Mindestmenge muss ein Vielfaches des Gebindes (${g}) sein.` };
  return { ok: true, gebinde: g, mindest: m };
}

// ---------------------------------------------------------------------------
// Bestellung
// ---------------------------------------------------------------------------

export type B2bArtikel = {
  id: string;
  bezeichnung: string | null;
  verkaufspreis: number | string | null;
  aktiv?: boolean | null;
  artikelnummer?: string | null;
  einheit?: string | null;
  shop_mwst?: number | string | null;
  shop_gebinde?: number | string | null;
  shop_mindestmenge?: number | string | null;
};

export type B2bPosition = {
  bezeichnung: string;
  menge: number;
  /** Brutto-Stückpreis in Euro (alte Felder, Anzeige im Dashboard). */
  einzelpreis: number;
  /** Netto-Stückpreis in Euro — die Rechnung übernimmt ihn unverändert. */
  einzelpreis_netto: number;
  mwst: number;
  artikelnummer?: string;
  einheit?: string;
  preis_quelle: PreisQuelle;
};

export type B2bErgebnis = {
  positionen: B2bPosition[];
  netto_cent: number;
  steuer_cent: number;
  brutto_cent: number;
  fehler: string[];
};

function satzVon(wert: unknown): number {
  const n = leseZahl(wert);
  return n === 7 || n === 0 ? n : 19;
}

/**
 * Bestellung eines Geschäftskunden: Preise NUR aus Artikel + Preisliste
 * (nie vom Browser). Ungültige Mengen werden als Fehler gemeldet, nicht
 * still korrigiert. Steuer je Satz auf die Netto-Summe (wie die Rechnung).
 * kleinunternehmer = true: keine Steuer.
 */
export function baueB2bBestellung(
  artikel: B2bArtikel[], wunsch: Map<string, number>, liste: Preisliste | null | undefined,
  basis: PreisBasis, kleinunternehmer = false,
): B2bErgebnis {
  const positionen: B2bPosition[] = [];
  const fehler: string[] = [];
  const nettoJeSatz = new Map<number, number>();
  for (const a of artikel) {
    const menge = wunsch.get(a.id) || 0;
    if (menge <= 0) continue;
    if (a.aktiv === false) continue;
    const name = String(a.bezeichnung || 'Produkt');
    const regel = mengenRegel(a.shop_gebinde, a.shop_mindestmenge);
    const mp = mengePruefen(menge, regel, name);
    if (!mp.ok) { fehler.push(mp.fehler); continue; }
    const artSatz = satzVon(a.shop_mwst);
    const satz = kleinunternehmer ? 0 : artSatz;
    const basisN = basisNettoCent(a.verkaufspreis, artSatz, basis);
    const kp = kundenPreis(a.id, basisN, menge, liste);
    if (!kp) continue;
    const zeileNetto = kp.netto_cent * menge;
    nettoJeSatz.set(satz, (nettoJeSatz.get(satz) || 0) + zeileNetto);
    positionen.push({
      bezeichnung: name,
      menge,
      einzelpreis: euro(bruttoAusNetto(kp.netto_cent, satz)),
      einzelpreis_netto: euro(kp.netto_cent),
      mwst: satz,
      ...(a.artikelnummer ? { artikelnummer: String(a.artikelnummer) } : {}),
      ...(a.einheit ? { einheit: String(a.einheit).slice(0, 20) } : {}),
      preis_quelle: kp.quelle,
    });
  }
  let netto = 0;
  let steuer = 0;
  for (const [satz, n] of nettoJeSatz) { netto += n; steuer += steuerAus(n, satz); }
  return { positionen, netto_cent: netto, steuer_cent: steuer, brutto_cent: netto + steuer, fehler };
}

// ---------------------------------------------------------------------------
// Kauf auf Rechnung
// ---------------------------------------------------------------------------

export type Zahlart = 'rechnung' | 'vorkasse';

export function zahlartPruefen(gewuenscht: unknown, aufRechnungErlaubt: boolean): Zahlart {
  return gewuenscht === 'rechnung' && aufRechnungErlaubt ? 'rechnung' : 'vorkasse';
}

/** Zahlungsziel in Tagen: 0 … 90, sonst 14. */
export function zahlungsziel(wert: unknown): number {
  const n = leseZahl(wert);
  if (n == null || !Number.isInteger(n) || n < 0 || n > ZIEL_MAX) return 14;
  return n;
}

/**
 * Kreditrahmen: offen (offene Rechnungen + noch nicht abgerechnete
 * Bestellungen) plus neue Bestellung darf den Rahmen nicht übersteigen.
 * Kein Rahmen (null) = keine Grenze.
 */
export function rahmenPruefen(rahmenCent: number | null | undefined, offenCent: number, neuCent: number): { ok: boolean; frei_cent: number | null } {
  if (rahmenCent == null || !(rahmenCent > 0)) return { ok: true, frei_cent: null };
  const frei = Math.max(0, rahmenCent - Math.max(0, offenCent));
  return { ok: neuCent <= frei, frei_cent: frei };
}

// ---------------------------------------------------------------------------
// Kundenkonto per Link
// ---------------------------------------------------------------------------

/** Token-Form: 32 Zeichen base64url. */
export function tokenGueltig(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t);
}

export function hashGueltig(h: unknown): h is string {
  return typeof h === 'string' && /^[0-9a-f]{64}$/.test(h);
}

/** Link aufs Schaufenster: Token nur im #-Teil (geht nie an Server oder Protokolle). */
export function kundenLink(basis: string, oeffentlichId: string, token: string): string {
  const b = String(basis || '').trim().replace(/\/+$/, '');
  return `${b}/p/${encodeURIComponent(oeffentlichId)}#konto=${token}`;
}

/** Seite mit Produkt-Baustein (live) für den Link wählen. */
export function shopSeite(seiten: { oeffentlich_id?: string | null; status?: string | null; bloecke?: unknown }[]): string | null {
  for (const s of seiten || []) {
    if (!s || s.status !== 'live' || !s.oeffentlich_id) continue;
    const b = Array.isArray(s.bloecke) ? (s.bloecke as { typ?: unknown }[]) : [];
    if (b.some((x) => x && x.typ === 'produkte')) return String(s.oeffentlich_id);
  }
  return null;
}

/** Anzeigename eines Kontakts (Firma vor Person). */
export function kundeName(k: { firma?: string | null; vorname?: string | null; nachname?: string | null; email?: string | null } | null | undefined): string {
  if (!k) return 'Kunde';
  const f = String(k.firma || '').trim();
  if (f) return f.slice(0, 120);
  const p = [k.vorname, k.nachname].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  return (p || String(k.email || '').trim() || 'Kunde').slice(0, 120);
}

/** Euro-Text für Mails und Seiten (Punkt bei Tausendern, Komma vor Cent). */
export function centText(cent: number): string {
  return (Math.round(cent) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// ---------------------------------------------------------------------------
// Paket 317: offene Beträge für den Kreditrahmen (in Cent, brutto)
// ---------------------------------------------------------------------------

export type OffeneRechnung = { brutto_summe: unknown; bezahlter_betrag?: unknown; zahlungsstatus?: string | null };
export type OffeneBestellung = { brutto_summe: unknown; status?: string | null; rechnung_id?: string | null };

const RECHNUNG_OFFEN = new Set(['offen', 'teilbezahlt', 'ueberfaellig']);

/** Offene Rechnungen des Kontakts: Brutto minus schon bezahlt, nie negativ. */
export function offenAusRechnungen(zeilen: OffeneRechnung[]): number {
  let c = 0;
  for (const r of zeilen || []) {
    if (!r || !RECHNUNG_OFFEN.has(String(r.zahlungsstatus ?? ''))) continue;
    const b = leseZahl(r.brutto_summe) ?? 0;
    const p = leseZahl(r.bezahlter_betrag) ?? 0;
    c += Math.max(0, inCent(b) - inCent(p));
  }
  return c;
}

/** Bestellungen des Kunden, die noch keine Rechnung haben und nicht storniert/archiviert sind. */
export function offenAusBestellungen(zeilen: OffeneBestellung[]): number {
  let c = 0;
  for (const b of zeilen || []) {
    if (!b || b.rechnung_id || b.status === 'storniert' || b.status === 'abgeschlossen') continue;
    c += Math.max(0, inCent(leseZahl(b.brutto_summe) ?? 0));
  }
  return c;
}

/** Endkunden-Preis (brutto, Euro) aus dem Artikelstamm je nach Preis-Basis. */
export function endkundenPreis(verkaufspreis: unknown, satz: unknown, basis: PreisBasis): number {
  const c = basisBruttoCent(verkaufspreis, satzVon(satz), basis);
  return c == null ? 0 : euro(c);
}

/** Liegt der letzte Besuch länger als eine Stunde zurück? (Schreibt „zuletzt im Shop" höchstens stündlich.) */
export function besuchMerken(zuletzt: string | null | undefined, jetztMs: number): boolean {
  if (!zuletzt) return true;
  const t = Date.parse(zuletzt);
  return !Number.isFinite(t) || jetztMs - t > 3600000;
}

/** Menge aus dem Warenkorb für die Prüfung lesen: Zahl 1 … 100.000, sonst 0. Nicht gerundet — mengePruefen lehnt Bruchteile ab. */
export function leseWunschMenge(wert: unknown): number {
  const n = typeof wert === 'number' ? wert : leseZahl(wert);
  if (n == null || !Number.isFinite(n) || n < 1 || n > MENGE_MAX) return 0;
  return n;
}

/**
 * Rechnung aus einer Shop-Bestellung: Satz und Netto-Stückpreis je Position.
 * · Geschäftskunden-Position mit einzelpreis_netto: Netto unverändert (keine Rückrechnung).
 * · Sonst Netto aus dem Brutto-Preis (Endkunde hat brutto bezahlt).
 * · mwst 0 bleibt 0 (steuerfreie Artikel); fehlt der Satz, 19 %. Kleinunternehmer: 0.
 * `runden` = Cent-Rundung des Aufrufers (steuerLogik.cent), damit die Rechnung wie bisher rundet.
 */
export function rechnungsPosten(
  p: { einzelpreis?: unknown; einzelpreis_netto?: unknown; mwst?: unknown },
  kleinunternehmer: boolean, runden: (n: number) => number,
): { satz: number; nettoEinzel: number } {
  const m = p?.mwst;
  const satz = kleinunternehmer ? 0 : (m === 0 ? 0 : (Number(m) > 0 ? Number(m) : 19));
  const vorgabe = leseZahl(p?.einzelpreis_netto);
  if (vorgabe != null && vorgabe > 0) return { satz, nettoEinzel: runden(vorgabe) };
  const brutto = Number(p?.einzelpreis) || 0;
  return { satz, nettoEinzel: runden(brutto / (1 + satz / 100)) };
}
