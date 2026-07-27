// lib/zuschnitt.ts
// A8 · Zuschnitt / Stückliste — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (zuschnitt.test.mjs, 15/15).
//
// 1D-Zuschnittoptimierung (First-Fit-Decreasing) mit Sägeblatt-Verschnitt (Kerf)
// + Materialgewicht über die Dichte. Dichten verifiziert 07/2026 (g/cm³).

export const DICHTE: Record<string, number> = {
  stahl: 7.85, edelstahl: 7.9, aluminium: 2.70, messing: 8.5, kupfer: 8.96,
};

function r2(n: number): number { return Math.round(n * 100) / 100; }
function r3(n: number): number { return Math.round(n * 1000) / 1000; }

// ---------- Materialgewicht ----------
/** Querschnittsfläche Rundmaterial (mm²) aus Durchmesser d (mm). */
export function flaecheRund(d: number): number { return Math.PI / 4 * d * d; }
/** Querschnittsfläche Flach/Blech (mm²) aus Breite b und Dicke t (mm). */
export function flaecheFlach(b: number, t: number): number { return b * t; }
/** Querschnittsfläche Rohr (mm²) aus Außen- und Innendurchmesser (mm). */
export function flaecheRohr(da: number, di: number): number { return Math.PI / 4 * (da * da - di * di); }

/** Gewicht je Meter (kg/m) aus Querschnittsfläche (mm²) und Dichte (g/cm³). */
export function gewichtProMeter(flaecheMm2: number, dichte: number): number {
  return r3((Number(flaecheMm2) || 0) * (Number(dichte) || 0) / 1000);
}
/** Gewicht (kg) aus Querschnittsfläche (mm²), Länge (mm) und Dichte (g/cm³). */
export function gewicht(flaecheMm2: number, laengeMm: number, dichte: number): number {
  return r3((Number(flaecheMm2) || 0) * (Number(dichte) || 0) / 1000 * (Number(laengeMm) || 0) / 1000);
}

// ---------- 1D-Zuschnittoptimierung ----------
export interface ZuschnittTeil { laenge: number; anzahl: number }
export interface ZuschnittStange { schnitte: number[]; rest: number }
export interface ZuschnittErgebnis {
  stangen: number;
  gesamtLaenge: number;   // stangen * stangenlaenge
  teileLaenge: number;    // Summe aller platzierten Stücke
  verschnitt: number;     // gesamtLaenge - teileLaenge (Kerf + Reststücke)
  verschnittProzent: number;
  zuLang: number;         // Stücke, die länger als die Stange sind (nicht platziert)
  plan: ZuschnittStange[];
}

/** First-Fit-Decreasing: verteilt alle Stücke auf möglichst wenige Stangen.
 *  Der Kerf wird nach jedem Stück reserviert (leicht konservativ → nie zu wenig Stangen). */
export function optimiereZuschnitt(teile: ZuschnittTeil[], stangenlaenge: number, kerf: number): ZuschnittErgebnis {
  const stuecke: number[] = [];
  for (const t of teile) {
    const n = Math.max(0, Math.round(Number(t.anzahl) || 0));
    for (let i = 0; i < n; i++) stuecke.push(Number(t.laenge) || 0);
  }
  const zuLang = stuecke.filter((l) => l > stangenlaenge).length;
  const passend = stuecke.filter((l) => l > 0 && l <= stangenlaenge).sort((a, b) => b - a);

  const bars: { rem: number; schnitte: number[] }[] = [];
  for (const l of passend) {
    let placed = false;
    for (const bar of bars) {
      if (l <= bar.rem) { bar.schnitte.push(l); bar.rem -= (l + kerf); placed = true; break; }
    }
    if (!placed) bars.push({ rem: stangenlaenge - l - kerf, schnitte: [l] });
  }

  const stangen = bars.length;
  const gesamtLaenge = stangen * stangenlaenge;
  const teileLaenge = passend.reduce((s, l) => s + l, 0);
  const verschnitt = gesamtLaenge - teileLaenge;
  const verschnittProzent = gesamtLaenge > 0 ? Math.round((verschnitt / gesamtLaenge) * 10000) / 100 : 0;
  const plan: ZuschnittStange[] = bars.map((b) => ({
    schnitte: b.schnitte,
    rest: r2(stangenlaenge - b.schnitte.reduce((s, l) => s + l, 0) - kerf * b.schnitte.length),
  }));

  return { stangen, gesamtLaenge, teileLaenge, verschnitt, verschnittProzent, zuLang, plan };
}
