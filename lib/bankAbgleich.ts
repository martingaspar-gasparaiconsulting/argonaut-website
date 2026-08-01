// lib/bankAbgleich.ts
// Banking-Abgleich (Punkt 11): Kontoumsätze (CSV) gegen offene Rechnungen
// matchen. Funktioniert OHNE externen Partner — der finAPI-Auto-Abruf kommt
// anschlussfertig obendrauf. Reine Formeln/Parser, KEINE Supabase-/React-
// Abhängigkeit. Node-getestet.

export interface Transaktion { datum: string; betrag: number; verwendungszweck: string; name: string; }
export interface OffeneRechnung { id: string; nummer: string; brutto: number; }
export interface MatchZeile {
  transaktion: Transaktion;
  rechnungId: string | null;
  rechnungNummer: string | null;
  sicher: boolean;      // Rechnungsnummer stand im Verwendungszweck
  grund: string;
}

/** Deutschen Betrag parsen: „1.234,56" / „1234,56" / „-50,00" -> Number. */
export function parseBetrag(s: unknown): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  let t = String(s ?? '').trim();
  if (!t) return 0;
  const neg = /^-/.test(t) || /-$/.test(t) || /\(.*\)/.test(t);
  t = t.replace(/[^0-9.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
  const n = Number(t.replace(/(?!^)-/g, ''));
  const v = Number.isFinite(n) ? Math.abs(n) : 0;
  return neg ? -v : v;
}

function splitZeile(zeile: string, delim: string): string[] {
  // einfacher CSV-Split mit Anführungszeichen-Schutz
  const out: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') { if (inQ && zeile[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === delim && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim().replace(/^"|"$/g, ''));
}

function findeSpalte(header: string[], keys: string[]): number {
  const h = header.map((x) => x.toLowerCase());
  for (let i = 0; i < h.length; i++) if (keys.some((k) => h[i].includes(k))) return i;
  return -1;
}

/** Bank-CSV (flexibel) -> Transaktionen. Erkennt Trennzeichen + Spalten per Kopfzeile. */
export function parseUmsaetzeCsv(text: string): Transaktion[] {
  const zeilen = String(text || '').split(/\r?\n/).filter((z) => z.trim() !== '');
  if (zeilen.length < 2) return [];
  const delim = (zeilen[0].match(/;/g)?.length ?? 0) >= (zeilen[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitZeile(zeilen[0], delim);
  const iDatum = findeSpalte(header, ['datum', 'buchungstag', 'valuta']);
  const iBetrag = findeSpalte(header, ['betrag', 'umsatz', 'wert']);
  const iZweck = findeSpalte(header, ['verwendungszweck', 'buchungstext', 'verwendung', 'text']);
  const iName = findeSpalte(header, ['name', 'beguenstigter', 'begünstigter', 'auftraggeber', 'empfaenger', 'empfänger', 'zahlungspflichtiger']);
  const out: Transaktion[] = [];
  for (let r = 1; r < zeilen.length; r++) {
    const sp = splitZeile(zeilen[r], delim);
    const betrag = parseBetrag(iBetrag >= 0 ? sp[iBetrag] : '');
    if (betrag === 0 && !(iBetrag >= 0 && sp[iBetrag])) continue;
    out.push({
      datum: (iDatum >= 0 ? sp[iDatum] : '') || '',
      betrag,
      verwendungszweck: (iZweck >= 0 ? sp[iZweck] : '') || '',
      name: (iName >= 0 ? sp[iName] : '') || '',
    });
  }
  return out;
}

export function normNummer(s: unknown): string {
  return String(s ?? '').toUpperCase().replace(/[\s._/-]/g, '');
}

/** Match EINER Eingangs-Transaktion gegen offene Rechnungen. */
export function matchTransaktion(t: Transaktion, offene: OffeneRechnung[]): MatchZeile {
  const leer: MatchZeile = { transaktion: t, rechnungId: null, rechnungNummer: null, sicher: false, grund: 'Kein Treffer' };
  if (t.betrag <= 0) return { ...leer, grund: 'Kein Zahlungseingang' };

  const zweckNorm = normNummer(t.verwendungszweck);
  const betragTreffer = (offene || []).filter((r) => Math.abs(r.brutto - t.betrag) < 0.01);

  // 1) Rechnungsnummer steht im Verwendungszweck -> sicher.
  const perNummer = betragTreffer.find((r) => r.nummer && zweckNorm.includes(normNummer(r.nummer)))
    || (offene || []).find((r) => r.nummer && normNummer(r.nummer).length >= 4 && zweckNorm.includes(normNummer(r.nummer)));
  if (perNummer) return { transaktion: t, rechnungId: perNummer.id, rechnungNummer: perNummer.nummer, sicher: true, grund: 'Rechnungsnummer im Verwendungszweck' };

  // 2) Genau eine Rechnung mit passendem Betrag -> wahrscheinlich.
  if (betragTreffer.length === 1) return { transaktion: t, rechnungId: betragTreffer[0].id, rechnungNummer: betragTreffer[0].nummer, sicher: false, grund: 'Betrag passt eindeutig' };

  if (betragTreffer.length > 1) return { ...leer, grund: `${betragTreffer.length} Rechnungen mit gleichem Betrag — bitte manuell zuordnen` };
  return leer;
}

export function matchAlle(transaktionen: Transaktion[], offene: OffeneRechnung[]): MatchZeile[] {
  return (transaktionen || []).filter((t) => t.betrag > 0).map((t) => matchTransaktion(t, offene));
}

export function zaehleMatches(zeilen: MatchZeile[]): { sicher: number; wahrscheinlich: number; offen: number } {
  return {
    sicher: zeilen.filter((z) => z.rechnungId && z.sicher).length,
    wahrscheinlich: zeilen.filter((z) => z.rechnungId && !z.sicher).length,
    offen: zeilen.filter((z) => !z.rechnungId).length,
  };
}
