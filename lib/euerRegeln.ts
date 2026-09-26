// ============================================================================
// ARGONAUT OS · lib/euerRegeln.ts — Paket G, Punkt G10 (26.09.2026)
//
// ▄▄▄ DIE ZWEI FEHLER ▄▄▄
//  1. Die EÜR (/dashboard/euer) zählte STORNIERTE Rechnungen als Einnahme.
//     Die Rechnungs-Seite sagt beim Stornieren ausdrücklich: „zählt nicht
//     mehr als Umsatz". Die EÜR hielt sich nicht daran.
//  2. Die AfA lief für verkaufte und ausgemusterte Anlagen einfach weiter —
//     jedes Jahr, bis zum Ende der Nutzungsdauer. Ein Gerät, das 2025
//     verschrottet wurde, schrieb 2026 und 2027 noch ab.
//
// ▄▄▄ DIE REGEL BEIM ABGANG (§ 4 Abs. 3 Satz 4 EStG) ▄▄▄
//   Jahre vor dem Abgang     normale AfA
//   Jahr des Abgangs         AfA monatsgenau bis einschließlich Abgangsmonat,
//                            dazu der RESTBUCHWERT als Betriebsausgabe
//   Jahre danach             nichts mehr
//   Ein Verkaufserlös ist eine Einnahme — der gehört als Rechnung erfasst,
//   nicht hierher.
//   Abgang ohne Datum        die Anlage wird NICHT gerechnet und gemeldet —
//                            lieber ein sichtbarer Hinweis als eine falsche Zahl.
//
// Reine Funktionen, keine Hooks/Supabase. Node-getestet: tests/gPaketG9G14.test.mjs
// ============================================================================

import { afaPlan } from './afa';
import { centRunden } from './zahlen';

/** Zählt diese Rechnung als Einnahme? Stornierte nie. */
export function zaehltAlsEinnahme(r: { zahlungsstatus?: string | null }): boolean {
  return String(r.zahlungsstatus ?? '').trim().toLowerCase() !== 'storniert';
}

export type AnlageLite = {
  anschaffungskosten?: number | string | null;
  nutzungsdauer_jahre?: number | null;
  anschaffungsdatum?: string | null;
  status?: string | null;
  abgang_am?: string | null;
};

export type AfaJahresErgebnis = {
  afa: number;              // Abschreibung im Jahr
  restbuchwertAbgang: number; // Restbuchwert, der im Abgangsjahr als Ausgabe zählt
  ohneAbgangsdatum: boolean;  // verkauft/ausgemustert, aber kein Datum -> nicht gerechnet
  zaehlt: boolean;            // trägt diese Anlage im Jahr etwas bei?
};

function isoTag(s: string | null | undefined): string | null {
  const t = String(s ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Ist die Anlage abgegangen (verkauft oder ausgemustert)? */
export function istAbgegangen(a: { status?: string | null }): boolean {
  const s = String(a.status ?? 'aktiv').trim().toLowerCase();
  return s === 'verkauft' || s === 'ausgemustert';
}

/** AfA und Restbuchwert einer Anlage für ein Jahr — mit Abgang. */
export function afaMitAbgang(a: AnlageLite, jahr: number): AfaJahresErgebnis {
  const kosten = Number(a.anschaffungskosten) || 0;
  const nd = Number(a.nutzungsdauer_jahre) || 1;
  const p = afaPlan(kosten, nd, a.anschaffungsdatum || null, jahr);
  const leer: AfaJahresErgebnis = { afa: 0, restbuchwertAbgang: 0, ohneAbgangsdatum: false, zaehlt: false };

  if (!istAbgegangen(a)) {
    return { ...leer, afa: p.afaStichjahr, zaehlt: p.afaStichjahr > 0 };
  }

  const abgang = isoTag(a.abgang_am);
  if (!abgang) return { ...leer, ohneAbgangsdatum: true };

  const aJahr = Number(abgang.slice(0, 4));
  const aMonat = Number(abgang.slice(5, 7));
  if (jahr < aJahr) return { ...leer, afa: p.afaStichjahr, zaehlt: p.afaStichjahr > 0 };
  if (jahr > aJahr) return leer;

  // Abgangsjahr: Buchwert zu Jahresbeginn ermitteln.
  const anschaffung = isoTag(a.anschaffungsdatum);
  if (!anschaffung) return leer;
  const anJahr = Number(anschaffung.slice(0, 4));
  const anMonat = Number(anschaffung.slice(5, 7));
  if (abgang < anschaffung) return leer; // unstimmige Daten: nichts rechnen

  const eintrag = p.plan.find((x) => x.jahr === jahr);
  const vorjahr = p.plan.find((x) => x.jahr === jahr - 1);
  const buchwertAnfang = jahr <= anJahr ? centRunden(kosten) : (vorjahr ? vorjahr.restbuchwert : 0);
  if (buchwertAnfang <= 0) return leer;

  // GWG oder Nutzungsdauer 1 Jahr: im Anschaffungsjahr schon voll abgezogen.
  if (p.methode === 'gwg' || nd <= 1) {
    return { afa: eintrag ? eintrag.afa : 0, restbuchwertAbgang: 0, ohneAbgangsdatum: false, zaehlt: !!eintrag && eintrag.afa > 0 };
  }

  // Lineare AfA: monatsgenau bis einschließlich Abgangsmonat.
  const monate = jahr === anJahr ? Math.max(0, aMonat - anMonat + 1) : aMonat;
  const afa = Math.min(centRunden(p.jahresAfa * monate / 12), buchwertAnfang);
  const rest = centRunden(buchwertAnfang - afa);
  return { afa: centRunden(afa), restbuchwertAbgang: rest, ohneAbgangsdatum: false, zaehlt: afa > 0 || rest > 0 };
}
