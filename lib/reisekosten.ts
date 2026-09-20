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
//
// ▄▄▄ PUNKT 29b (20.09.2026) ▄▄▄
//  1. EINE KURZE FAHRT UEBER MITTERNACHT ERGAB 28 EUR.
//     GEMESSEN: Abreise 23:00, Rueckkehr 01:00 — zwei Stunden unterwegs —
//     ergab An- UND Abreisetag zu je 14 EUR. Der Code zaehlte nur die
//     Kalendertage. Wer zwei Stunden unterwegs ist, hat nicht uebernachtet;
//     dann gilt die Eintagesregel, und unter 8 Stunden gibt es gar nichts.
//     REPARIERT NUR, WO ES EINDEUTIG IST: Dauert die Reise insgesamt
//     hoechstens 8 Stunden, kann keine Uebernachtung stattgefunden haben —
//     dieser Fall rechnet jetzt wie eintaegig. Dauert sie laenger und geht
//     ueber Mitternacht, kann der Code NICHT wissen, ob uebernachtet wurde
//     (§ 9 Abs. 4a EStG: ohne Uebernachtung stehen nur 14 EUR zu, dem Tag
//     mit dem ueberwiegenden Teil zugeordnet). Dort bleibt die Rechnung wie
//     bisher, und der Hinweis sagt es. Nicht geraten.
//  2. round2() las mit Number() und rundete unsymmetrisch — "1.234" km
//     ergaben 0,00 EUR Fahrtkosten. Jetzt ueber lib/zahlen.ts.
// Node-getestet: tests/steuerRechnerP29.test.mjs
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

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

  // Punkt 29b: Eine Reise von hoechstens 8 Stunden kann keine Uebernachtung
  // enthalten — auch dann nicht, wenn sie ueber Mitternacht geht. Sie wird
  // deshalb wie eintaegig behandelt. Vorher ergaben zwei Stunden von 23:00
  // bis 01:00 volle 28 EUR, weil nur die Kalendertage gezaehlt wurden.
  const ueberNachtOhneUebernachtung = tageDiff > 0 && stunden <= 8;

  if (tageDiff === 0 || ueberNachtOhneUebernachtung) {
    if (stunden > 8) { brutto = VP_TEIL; teilTage = 1; hinweis = 'Eintägig, über 8 Std. abwesend → 14 €.'; }
    else if (ueberNachtOhneUebernachtung) {
      hinweis = `Nur ${round2(stunden)} Std. unterwegs, auch wenn die Reise über Mitternacht geht — ` +
        'ohne Übernachtung gilt die Eintagesregel, und unter 8 Std. gibt es keine Verpflegungspauschale.';
    } else { hinweis = 'Eintägig, 8 Std. oder weniger → keine Verpflegungspauschale.'; }
  } else {
    volleTage = Math.max(0, tageDiff - 1);
    teilTage = 2;
    brutto = teilTage * VP_TEIL + volleTage * VP_VOLL;
    hinweis = `${tageDiff + 1} Reisetage: An- + Abreisetag (je 14 €) + ${volleTage} volle(r) Tag(e) (je 28 €).`;
    // Ohne Uebernachtung stehen nach § 9 Abs. 4a EStG nur 14 EUR zu, dem Tag
    // mit dem ueberwiegenden Teil zugeordnet. Ob uebernachtet wurde, weiss
    // diese Funktion nicht — also sagen statt raten.
    if (volleTage === 0) {
      hinweis += ' Falls NICHT übernachtet wurde: dann stehen nach § 9 Abs. 4a EStG nur 14 € zu.';
    }
  }

  const mm = { fruehstueck: Math.max(0, m?.fruehstueck || 0), mittag: Math.max(0, m?.mittag || 0), abend: Math.max(0, m?.abend || 0) };
  const kuerzung = round2(mm.fruehstueck * KUERZUNG.fruehstueck + mm.mittag * KUERZUNG.mittag + mm.abend * KUERZUNG.abend);
  const netto = Math.max(0, round2(brutto - kuerzung));
  return { brutto: round2(brutto), kuerzung, netto, volleTage, teilTage, hinweis };
}

/** Fahrtkosten fuer gefahrene Kilometer mit dem Privatfahrzeug. */
export function fahrtkosten(km?: number | null, fahrzeug: Fahrzeug = 'pkw'): number {
  const satz = KM_SATZ[fahrzeug] ?? KM_SATZ.pkw;
  return round2(leseZahlOder(km, 0) * satz);
}

export function round2(n: number): number { return centRunden(leseZahlOder(n, 0)); }
