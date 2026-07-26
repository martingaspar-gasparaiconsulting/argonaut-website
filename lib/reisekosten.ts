// ============================================================================
// ARGONAUT OS · lib/reisekosten.ts — Regel-Ebene: Reisekosten rechnen
//
// KEINE KI. Reine Formeln nach den aktuellen deutschen Saetzen (Stand 2026):
//   · Verpflegungspauschale Inland: 28 € voller Tag, 14 € An-/Abreisetag bzw.
//     eintaegig > 8 Std. Abwesenheit.
//   · Kuerzung bei gestellten Mahlzeiten: Fruehstueck 5,60 €, Mittag/Abend je
//     11,20 € (20 % / 40 % / 40 % von 28 €).
//   · Fahrtkosten Dienstreise mit Privatfahrzeug: PKW 0,30 €/km, Motorrad
//     0,20 €/km. (Die 38-Cent-Reform ab 2026 betrifft nur den Arbeitsweg.)
//
// Ergebnis ist rechnerisch eindeutig — richtig, sofort, kostenlos.
// Reine Funktionen, keine Hooks/Supabase — ueberall importierbar.
// ============================================================================

export const VP_VOLL = 28;   // voller Kalendertag (24 Std. abwesend)
export const VP_TEIL = 14;   // An-/Abreisetag oder eintaegig > 8 Std.
export const KUERZUNG = { fruehstueck: 5.60, mittag: 11.20, abend: 11.20 } as const;
export const KM_SATZ = { pkw: 0.30, motorrad: 0.20 } as const;

export type Fahrzeug = 'pkw' | 'motorrad';
export type Mahlzeiten = { fruehstueck: number; mittag: number; abend: number };
export type VpErgebnis = {
  brutto: number; kuerzung: number; netto: number;
  volleTage: number; teilTage: number; hinweis: string;
};

function ganzerTag(d: Date): number { return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }

/**
 * Verpflegungspauschale fuer eine Reise zwischen zwei Zeitpunkten.
 * Liefert Brutto (vor Kuerzung), Kuerzung durch gestellte Mahlzeiten und Netto.
 */
export function verpflegung(abreiseISO?: string | null, rueckkehrISO?: string | null, m?: Partial<Mahlzeiten>): VpErgebnis {
  const leer: VpErgebnis = { brutto: 0, kuerzung: 0, netto: 0, volleTage: 0, teilTage: 0, hinweis: '' };
  if (!abreiseISO || !rueckkehrISO) return { ...leer, hinweis: 'Abreise und Rückkehr angeben.' };
  const a = new Date(abreiseISO), r = new Date(rueckkehrISO);
  if (isNaN(a.getTime()) || isNaN(r.getTime()) || r.getTime() <= a.getTime()) return { ...leer, hinweis: 'Rückkehr muss nach der Abreise liegen.' };

  const stunden = (r.getTime() - a.getTime()) / 3600000;
  const tageDiff = Math.round((ganzerTag(r) - ganzerTag(a)) / 86400000);

  let brutto = 0, volleTage = 0, teilTage = 0, hinweis = '';
  if (tageDiff === 0) {
    if (stunden > 8) { brutto = VP_TEIL; teilTage = 1; hinweis = 'Eintägig, über 8 Std. abwesend → 14 €.'; }
    else { hinweis = 'Eintägig, 8 Std. oder weniger → keine Verpflegungspauschale.'; }
  } else {
    volleTage = Math.max(0, tageDiff - 1);
    teilTage = 2;
    brutto = teilTage * VP_TEIL + volleTage * VP_VOLL;
    hinweis = `${tageDiff + 1} Reisetage: An- + Abreisetag (je 14 €) + ${volleTage} volle(r) Tag(e) (je 28 €).`;
  }

  const mm = { fruehstueck: Math.max(0, m?.fruehstueck || 0), mittag: Math.max(0, m?.mittag || 0), abend: Math.max(0, m?.abend || 0) };
  const kuerzung = round2(mm.fruehstueck * KUERZUNG.fruehstueck + mm.mittag * KUERZUNG.mittag + mm.abend * KUERZUNG.abend);
  const netto = Math.max(0, round2(brutto - kuerzung));
  return { brutto: round2(brutto), kuerzung, netto, volleTage, teilTage, hinweis };
}

/** Fahrtkosten fuer gefahrene Kilometer mit dem Privatfahrzeug. */
export function fahrtkosten(km?: number | null, fahrzeug: Fahrzeug = 'pkw'): number {
  const satz = KM_SATZ[fahrzeug] ?? KM_SATZ.pkw;
  return round2((Number(km) || 0) * satz);
}

export function round2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }
