// ============================================================================
// ARGONAUT OS · lib/shopGewerbe.ts — Schalter „nur Gewerbekunden" (Paket 327 · S3b)
//
// Reine Logik, node-getestet (tests/shopGewerbeP327.test.mjs).
//
// Wozu: Manche Stoffe dürfen nicht an Privatleute abgegeben werden
// (ChemVerbotsV, REACH Anhang XVII). Mit dem Schalter nimmt der Shop nur noch
// Bestellungen von Geschäftskunden an, deren Gewerbe der Betrieb geprüft hat
// (USt-IdNr., Gewerbeanmeldung oder Handelsregisterauszug).
//
// Ehrlich: ARGONAUT prüft die USt-IdNr. nur auf die FORM (Länder-Muster,
// bei DE die Prüfziffer). Ob sie gültig ist und zur Firma gehört, sagt die
// Bestätigungsabfrage beim Bundeszentralamt für Steuern — die macht der
// Betrieb und vermerkt sie. Das ist keine Identitätsprüfung nach § 8
// ChemVerbotsV; die bleibt beim Betrieb.
//
// Wirkt erst, wenn der Start-Schalter „gewerbeNachweis" frei ist (R49).
// ============================================================================

export const NACHWEIS_ARTEN = [
  { key: 'ustid', label: 'USt-IdNr. (Bestätigungsabfrage beim BZSt)' },
  { key: 'gewerbe', label: 'Gewerbeanmeldung' },
  { key: 'register', label: 'Handelsregisterauszug' },
] as const;
export type NachweisArt = (typeof NACHWEIS_ARTEN)[number]['key'];

export function nachweisArt(roh: unknown): NachweisArt | null {
  return NACHWEIS_ARTEN.find((a) => a.key === roh)?.key ?? null;
}

/** Muster je Land (ohne Länderkürzel geprüft wird nichts). */
const MUSTER: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/, DK: /^\d{8}$/, EE: /^\d{9}$/, EL: /^\d{9}$/, ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/, FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/, HR: /^\d{11}$/, HU: /^\d{8}$/,
  IE: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/, IT: /^\d{11}$/, LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/, LV: /^\d{11}$/, MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/, PL: /^\d{10}$/,
  PT: /^\d{9}$/, RO: /^\d{2,10}$/, SE: /^\d{12}$/, SI: /^\d{8}$/, SK: /^\d{10}$/,
  XI: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
};

/** Prüfziffer deutscher USt-IdNr. (ISO 7064, MOD 11,10). */
export function dePruefziffer(neunStellen: string): boolean {
  if (!/^\d{9}$/.test(neunStellen)) return false;
  let produkt = 10;
  for (let i = 0; i < 8; i++) {
    let summe = (Number(neunStellen[i]) + produkt) % 10;
    if (summe === 0) summe = 10;
    produkt = (2 * summe) % 11;
  }
  const pruef = (11 - produkt) % 10;
  return pruef === Number(neunStellen[8]);
}

/**
 * USt-IdNr. säubern und der Form nach prüfen. Liefert { wert } (z. B. „DE136695976")
 * oder { fehler }. Gültigkeit beim BZSt prüft der Betrieb selbst.
 */
export function ustIdPruefen(roh: unknown): { wert: string | null; fehler: string | null } {
  const t = String(roh ?? '').toUpperCase().replace(/[\s.\-/]/g, '');
  if (!t) return { wert: null, fehler: 'Bitte die USt-IdNr. eintragen.' };
  const land = t.slice(0, 2) === 'GR' ? 'EL' : t.slice(0, 2);
  const rest = t.slice(2);
  const muster = MUSTER[land];
  if (!muster) return { wert: null, fehler: 'Die USt-IdNr. beginnt mit dem Länderkürzel, z. B. DE, AT, FR.' };
  if (!muster.test(rest)) return { wert: null, fehler: `Die USt-IdNr. passt nicht zum Muster für ${land}.` };
  if (land === 'DE' && !dePruefziffer(rest)) return { wert: null, fehler: 'Die Prüfziffer der deutschen USt-IdNr. stimmt nicht — bitte vertippt?' };
  return { wert: land + rest, fehler: null };
}

export type Nachweis = {
  nachweis_art?: string | null;
  ust_id?: string | null;
  nachweis_notiz?: string | null;
  nachweis_ok?: boolean | null;
};

/** Gründe gegen „geprüft" (leer = darf als geprüft gespeichert werden). */
export function nachweisFehler(n: Nachweis): string[] {
  const f: string[] = [];
  const art = nachweisArt(n.nachweis_art);
  if (!art) f.push('Bitte die Art des Nachweises wählen.');
  if (art === 'ustid') {
    const u = ustIdPruefen(n.ust_id);
    if (u.fehler) f.push(u.fehler);
  }
  const notiz = String(n.nachweis_notiz ?? '').trim();
  if (!notiz) f.push(art === 'ustid'
    ? 'Bitte vermerken, wann die Bestätigungsabfrage beim BZSt gemacht wurde (z. B. „BZSt qualifiziert bestätigt am 12.10.2026").'
    : 'Bitte vermerken, was vorgelegt wurde (z. B. „Gewerbeanmeldung Stadt Böblingen vom 01.03.2020 gesehen").');
  return f;
}

/** Zeile zum Speichern (gesäubert). */
export function nachweisZeile(n: Nachweis): { nachweis_art: NachweisArt | null; ust_id: string | null; nachweis_notiz: string | null; nachweis_ok: boolean } {
  const art = nachweisArt(n.nachweis_art);
  const ust = art === 'ustid' ? ustIdPruefen(n.ust_id).wert : null;
  const notiz = String(n.nachweis_notiz ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  const ok = n.nachweis_ok === true && nachweisFehler(n).length === 0;
  return { nachweis_art: art, ust_id: ust, nachweis_notiz: notiz, nachweis_ok: ok };
}

/** Wirkt der Schalter? Nur mit Einstellung des Betriebs UND Start-Freigabe. */
export function nurGewerbeAktiv(einstellung: unknown, frei: boolean): boolean {
  if (!frei) return false;
  const e = (einstellung && typeof einstellung === 'object') ? einstellung as Record<string, unknown> : {};
  return e.nur_gewerbe === true;
}

/** Darf diese Bestellung angenommen werden? */
export function bestellungErlaubt(nurGewerbe: boolean, kunde: { nachweis_ok?: boolean | null } | null | undefined): { ok: boolean; grund: string | null } {
  if (!nurGewerbe) return { ok: true, grund: null };
  if (!kunde) return { ok: false, grund: 'Dieser Shop verkauft nur an geprüfte Geschäftskunden. Bitte fordern Sie beim Anbieter ein Kundenkonto an.' };
  if (kunde.nachweis_ok !== true) return { ok: false, grund: 'Ihr Gewerbenachweis ist noch nicht geprüft. Bitte wenden Sie sich an den Anbieter.' };
  return { ok: true, grund: null };
}
