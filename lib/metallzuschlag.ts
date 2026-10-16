// ============================================================================
// ARGONAUT OS · lib/metallzuschlag.ts — HW-1 Kupferzuschlag (16.10.2026)
//
// Elektro-Handwerk: Kabelpreise enthalten eine Metall-Basis (z. B. Kupfer
// 150 €/100 kg). Liegt die Börsennotierung (DEL-Notiz) darüber, kommt ein
// Metallzuschlag dazu. Übliche Rechnung (Kabelhersteller/Großhandel):
//
//   Zuschlag €/km = (DEL + 1 % Bezugskosten − Basis) [€/100 kg] × Metallzahl [kg/km] / 100
//   Zuschlag je Meter = Zuschlag €/km / 1000
//
// Liegt die Notiz unter der Basis, gibt es KEINEN negativen Zuschlag (0) —
// außer der Betrieb schaltet „Gutschrift bei niedriger Notiz" ein.
//
// Die Notiz trägt IMMER ein Mensch ein (Tagesnotiz mit Datum) — ARGONAUT
// schätzt nie Preise. Übernahme in Angebot/Rechnung erst nach Anwalt-Freigabe
// (Start-Schalter „metallzuschlag", R66: Preisanpassung/Transparenz ggü.
// Verbrauchern). Rein (nur lib/zahlen), getestet in tests/metallzuschlagHW1.test.mjs.
// ============================================================================

export const METALLE = {
  kupfer: { name: 'Kupfer', basisVorschlag: 150, notiz: 'DEL-Notiz' },
  aluminium: { name: 'Aluminium', basisVorschlag: 225, notiz: 'Aluminium-Notiz' },
} as const;
export type Metall = keyof typeof METALLE;

import { leseZahl, rundeStellen, centRunden, zahlText } from './zahlen';

export const BEZUGSKOSTEN_PROZENT = 1;
const zahl = leseZahl;
const rund = (n: number, stellen: number) => (stellen === 2 ? centRunden(n) : rundeStellen(n, stellen));

export type Eingabe = { notiz: unknown; basis: unknown; metallzahl: unknown; meter: unknown; gutschrift?: boolean; bezugskosten?: boolean };
export type Ergebnis = { jeKm: number; jeMeter: number; gesamt: number; differenz: number; hinweis: string | null };

/** Zuschlag rechnen. Fehler als Text, sonst Ergebnis (Cent-genau gesamt, je Meter auf 4 Stellen). */
export function metallzuschlag(e: Eingabe): { ergebnis: Ergebnis | null; fehler: string | null } {
  const notiz = zahl(e.notiz), basis = zahl(e.basis), mz = zahl(e.metallzahl), m = zahl(e.meter);
  if (notiz == null || notiz <= 0 || notiz > 100000) return { ergebnis: null, fehler: 'Bitte die Tagesnotiz in €/100 kg eintragen (z. B. 912,34).' };
  if (basis == null || basis < 0 || basis > 100000) return { ergebnis: null, fehler: 'Bitte die Metall-Basis im Preis in €/100 kg eintragen (bei Kupfer meist 150).' };
  if (mz == null || mz <= 0 || mz > 100000) return { ergebnis: null, fehler: 'Bitte die Metallzahl in kg/km eintragen (steht im Datenblatt des Kabels, z. B. NYM-J 3×1,5: 43,2).' };
  if (m == null || m <= 0 || m > 1000000) return { ergebnis: null, fehler: 'Bitte die Länge in Metern eintragen.' };
  const mitBezug = e.bezugskosten === false ? notiz : notiz * (1 + BEZUGSKOSTEN_PROZENT / 100);
  let differenz = mitBezug - basis;
  let hinweis: string | null = null;
  if (differenz < 0 && !e.gutschrift) { hinweis = 'Notiz liegt unter der Basis — kein Zuschlag.'; differenz = 0; }
  const jeKm = rund((differenz * mz) / 100, 2);
  const jeMeter = rund(jeKm / 1000, 4);
  const gesamt = rund((differenz * mz / 100) * m / 1000, 2);
  return { ergebnis: { jeKm, jeMeter, gesamt, differenz: rund(differenz, 2), hinweis }, fehler: null };
}

/** Datum der Notiz: Pflicht, nicht in der Zukunft, nicht älter als 31 Tage (sonst Hinweis, kein Fehler). */
export function notizDatumPruefen(iso: unknown, heute: string): { fehler: string | null; alt: boolean } {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { fehler: 'Bitte das Datum der Notiz eintragen.', alt: false };
  if (iso > heute) return { fehler: 'Das Datum der Notiz liegt in der Zukunft.', alt: false };
  const tage = (Date.parse(heute + 'T00:00:00Z') - Date.parse(iso + 'T00:00:00Z')) / 86400000;
  return { fehler: null, alt: tage > 31 };
}

function de(iso: string): string { const [j, mo, t] = iso.split('-'); return `${t}.${mo}.${j}`; }
function geld(n: number, stellen = 2): string { return zahlText(n, stellen); }

/**
 * Positionstext für Angebot/Rechnung — nachvollziehbar mit Notiz, Datum, Basis,
 * Metallzahl und Menge (Transparenz). Wird erst nach Freigabe übernommen.
 */
export function positionsText(p: { metall: Metall; kabel: string; notiz: number; notizDatum: string; basis: number; metallzahl: number; meter: number; bezugskosten?: boolean }): string {
  const mt = METALLE[p.metall];
  const kabel = String(p.kabel ?? '').trim().slice(0, 120) || 'Kabel/Leitung';
  return `Metallzuschlag ${mt.name} für ${kabel}: ${geld(p.meter, 0)} m × Metallzahl ${geld(p.metallzahl, 1)} kg/km, ${mt.notiz} ${geld(p.notiz)} €/100 kg vom ${de(p.notizDatum)}${p.bezugskosten === false ? '' : ` zzgl. ${BEZUGSKOSTEN_PROZENT} % Bezugskosten`}, Basis ${geld(p.basis)} €/100 kg`.slice(0, 500);
}

export type KabelZeile = { kabel: string; metallzahl: string; meter: string };

/** Mehrere Kabel auf einmal: Summe nur aus gültigen Zeilen, ungültige werden gemeldet. */
export function sammelRechnung(zeilen: KabelZeile[], gemeinsam: { notiz: unknown; basis: unknown; gutschrift?: boolean; bezugskosten?: boolean }): { zeilen: { kabel: string; ergebnis: Ergebnis | null; fehler: string | null }[]; summe: number } {
  const out = (zeilen ?? []).filter((z) => String(z.kabel ?? '').trim() || String(z.meter ?? '').trim()).map((z) => {
    const r = metallzuschlag({ ...gemeinsam, metallzahl: z.metallzahl, meter: z.meter });
    return { kabel: String(z.kabel ?? '').trim(), ergebnis: r.ergebnis, fehler: r.fehler };
  });
  const summe = rund(out.reduce((a, z) => a + (z.ergebnis?.gesamt ?? 0), 0), 2);
  return { zeilen: out, summe };
}

/** Häufige Leitungen mit Kupferzahl (kg/km) als Startwerte — immer am Datenblatt prüfen. */
export const KUPFERZAHLEN: { kabel: string; kgKm: number }[] = [
  { kabel: 'NYM-J 3×1,5', kgKm: 43.2 },
  { kabel: 'NYM-J 5×1,5', kgKm: 72 },
  { kabel: 'NYM-J 3×2,5', kgKm: 72 },
  { kabel: 'NYM-J 5×2,5', kgKm: 120 },
  { kabel: 'NYM-J 5×4', kgKm: 192 },
  { kabel: 'NYM-J 5×6', kgKm: 288 },
  { kabel: 'NYM-J 5×10', kgKm: 480 },
  { kabel: 'NYY-J 5×16', kgKm: 768 },
];
