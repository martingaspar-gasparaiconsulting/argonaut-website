// lib/ustva.ts
// ELSTER · Umsatzsteuer-Voranmeldung (Punkt 12): rechnet aus bezahlten
// Rechnungen + Vorsteuer die amtlichen UStVA-Kennziffern (Kz 81/86/66/83).
// Reine Formeln — KEINE Supabase-/React-Abhängigkeit. Node-getestet.
// Vorbereitung/Überblick — die verbindliche Anmeldung prüft der Steuerberater.

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

/** Effektiven Steuersatz einer Rechnung auf den nächsten Regelsatz runden (0/7/19). */
export function satzVon(netto: unknown, mwst: unknown): number {
  const n = z(netto), m = z(mwst);
  if (n <= 0) return 0;
  const p = (m / n) * 100;
  const kandidaten = [0, 7, 19];
  return kandidaten.reduce((best, k) => (Math.abs(k - p) < Math.abs(best - p) ? k : best), 0);
}

export interface UstvaRechnung { netto_summe?: number | string | null; mwst_summe?: number | string | null; }
export interface Kennziffer { kz: string; label: string; wert: number; istBetrag: boolean; }
export interface UstvaErgebnis {
  umsatz19: number; ust19: number;
  umsatz7: number; ust7: number;
  umsatz0: number;
  vorsteuer: number;
  zahllast: number;      // + = an Finanzamt, − = Erstattung
  kennziffern: Kennziffer[];
}

/**
 * UStVA aus bezahlten Rechnungen + Vorsteuer.
 * Kz 81/86 = Bemessungsgrundlage (netto, volle Euro), Kz 66 = Vorsteuer,
 * Kz 83 = verbleibende Vorauszahlung (Zahllast).
 */
export function baueUstva(rechnungen: UstvaRechnung[], vorsteuer: number | string): UstvaErgebnis {
  let umsatz19 = 0, ust19 = 0, umsatz7 = 0, ust7 = 0, umsatz0 = 0;
  for (const r of rechnungen || []) {
    const netto = z(r.netto_summe), mwst = z(r.mwst_summe);
    const s = satzVon(netto, mwst);
    if (s === 19) { umsatz19 += netto; ust19 += mwst; }
    else if (s === 7) { umsatz7 += netto; ust7 += mwst; }
    else { umsatz0 += netto; }
  }
  const vst = z(vorsteuer);
  // Bemessungsgrundlagen für ELSTER: auf volle Euro abgerundet.
  const bg19 = Math.floor(umsatz19), bg7 = Math.floor(umsatz7), bg0 = Math.floor(umsatz0);
  const zahllast = r2(ust19 + ust7 - vst);

  const kennziffern: Kennziffer[] = [
    { kz: '81', label: 'Umsätze zu 19 % (netto)', wert: bg19, istBetrag: true },
    { kz: '—', label: '  darauf Umsatzsteuer 19 %', wert: r2(ust19), istBetrag: true },
    { kz: '86', label: 'Umsätze zu 7 % (netto)', wert: bg7, istBetrag: true },
    { kz: '—', label: '  darauf Umsatzsteuer 7 %', wert: r2(ust7), istBetrag: true },
    { kz: '66', label: 'Vorsteuerbeträge', wert: r2(vst), istBetrag: true },
    { kz: '83', label: zahllast >= 0 ? 'Verbleibende Vorauszahlung (Zahllast)' : 'Überschuss (Erstattung)', wert: Math.abs(zahllast), istBetrag: true },
  ];
  if (bg0 > 0) kennziffern.splice(4, 0, { kz: '48', label: 'Umsätze ohne/steuerfrei (netto)', wert: bg0, istBetrag: true });

  return { umsatz19: r2(umsatz19), ust19: r2(ust19), umsatz7: r2(umsatz7), ust7: r2(ust7), umsatz0: r2(umsatz0), vorsteuer: vst, zahllast, kennziffern };
}

export function formatEuro(n: unknown): string {
  return z(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
