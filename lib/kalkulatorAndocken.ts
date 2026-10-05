// ============================================================================
// ARGONAUT OS · lib/kalkulatorAndocken.ts — Paket 211 (05.10.2026) · Stufe 3 B9
// „Paket 2 Andocken": Aufmaß → Kalkulator → Projekt-Ist → echte Marge
//
// BEFUND (am Code, 05.10.2026):
//  1. Die Menge im Kalkulator wird von Hand getippt. Ein Aufmaß mit Rechenweg
//     (z. B. „4,20*2,75*2" = 23,10 m²) erreicht den Kalkulator nie.
//  2. kalkulationen.projekt_id gibt es seit dem ersten SQL, gesetzt wird sie
//     nirgends. Die erfassten Projekt-Stunden (projektleistungen) kommen
//     deshalb nie zur Kalkulation zurück; „Aus der Praxis lernen" lernt nur
//     aus den eigenen SCHÄTZUNGEN (ein Kreis: geschätzt → gemerkt → geschätzt).
//  3. Die Marge im Kalkulator ist die geplante. Ob sie gehalten hat, sieht
//     man nur in der Nachkalkulation je Projekt — ohne Bezug zur Kalkulation.
//
// LÖSUNG (diese Datei rechnet, die Seite zeigt):
//  · mengeAusAufmass(): Positionen eines Aufmaßes übernehmen — nur gleiche
//    Einheit, Rechenweg bleibt sichtbar.
//  · istVergleich(): Plan-Stunden gegen Ist-Stunden des verknüpften Projekts.
//  · echteMarge(): Angebotspreis gegen Ist-Lohn (zum Kostensatz der
//    Kalkulation) + Material (Projektkosten, sonst laut Kalkulation) +
//    Gemeinkosten-Zuschlag der Kalkulation.
//  · ausIstZeiten(): Zeit-Normwerte aus echten Projekten — als VORSCHLAG,
//    nichts wird automatisch übernommen (Grundsatz aus kalkulatorLernen).
//
// Rein, ohne Datenbank — node-testbar.
// ============================================================================

import { rechne, inMinuten, zahl, cent, ZUSCHLAEGE_STANDARD, type Kalkulation, type Posten } from './kalkulator';
import { baueVorschlag, schluesselAus, type LernEingabe, type Vorschlag } from './kalkulatorLernen';

// ---------------------------------------------------------------------------
// 1 · Aufmaß → Menge
// ---------------------------------------------------------------------------

export type AufmassPosition = {
  id: string;
  bezeichnung?: string | null;
  menge?: number | string | null;
  einheit?: string | null;
  rechenweg?: string | null;
};

/** Einheiten vergleichbar machen (m2 = m² = qm, m3 = m³ = cbm, Stck = Stk …). */
export function einheitNorm(e: unknown): string {
  const x = String(e ?? '').trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, '');
  if (['m2', 'm²', 'qm', 'quadratmeter'].includes(x)) return 'm²';
  if (['m3', 'm³', 'cbm', 'kubikmeter'].includes(x)) return 'm³';
  if (['m', 'lfm', 'lfdm', 'meter', 'laufmeter'].includes(x)) return 'm';
  if (['stk', 'stck', 'st', 'stück', 'stueck'].includes(x)) return 'Stk';
  if (['h', 'std', 'stunde', 'stunden'].includes(x)) return 'h';
  if (['psch', 'pauschal', 'pausch'].includes(x)) return 'psch';
  return String(e ?? '').trim();
}

export type MengeErgebnis =
  | { ok: true; menge: number; einheit: string; positionen: number; rechenweg: string }
  | { ok: false; fehler: string };

/** Summe der gewählten Aufmaß-Positionen — nur, wenn alle dieselbe Einheit haben. */
export function mengeAusAufmass(positionen: AufmassPosition[], auswahl: string[]): MengeErgebnis {
  const gewaehlt = (positionen || []).filter((p) => (auswahl || []).includes(p.id));
  if (gewaehlt.length === 0) return { ok: false, fehler: 'Bitte mindestens eine Aufmaß-Position wählen.' };
  const einheiten = Array.from(new Set(gewaehlt.map((p) => einheitNorm(p.einheit))));
  if (einheiten.length > 1) {
    return { ok: false, fehler: `Die gewählten Positionen haben verschiedene Einheiten (${einheiten.join(', ')}) — bitte nur eine Einheit zusammenfassen.` };
  }
  if (einheiten[0] === 'psch') return { ok: false, fehler: 'Pauschal-Positionen haben keine Menge zum Kalkulieren.' };
  let summe = 0;
  const teile: string[] = [];
  for (const p of gewaehlt) {
    const m = zahl(p.menge, NaN);
    if (!Number.isFinite(m) || m <= 0) return { ok: false, fehler: `Position „${p.bezeichnung || 'ohne Bezeichnung'}" hat keine Menge.` };
    summe += m;
    const name = String(p.bezeichnung || 'Position').trim().slice(0, 60);
    teile.push(p.rechenweg ? `${name}: ${String(p.rechenweg).slice(0, 80)} = ${fmt(m)}` : `${name}: ${fmt(m)}`);
  }
  const menge = Math.round(summe * 1000) / 1000;
  return { ok: true, menge, einheit: einheiten[0] || 'Stk', positionen: gewaehlt.length, rechenweg: teile.join(' · ') };
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 3 });
}

// ---------------------------------------------------------------------------
// 2 · Plan gegen Ist (Stunden)
// ---------------------------------------------------------------------------

export type IstStand = {
  /** Summe projektleistungen.stunden des verknüpften Projekts. */
  istStunden: number;
  /** Summe projekt_kosten.betrag (Material/Fremd) — 0 = nichts erfasst. */
  istKosten: number;
};

export type Vergleich = {
  planStunden: number;
  istStunden: number;
  /** Ist gegenüber Plan in Prozent (+20 = 20 % länger gebraucht). */
  abweichungProzent: number | null;
  /** Ist/Plan — mit diesem Faktor werden die Zeit-Normwerte skaliert. */
  faktor: number | null;
  istStundenJeEinheit: number | null;
};

export function planStunden(k: Pick<Kalkulation, 'menge' | 'posten'>): number {
  const menge = Math.max(0, zahl(k.menge, 0));
  let min = 0;
  for (const p of k.posten || []) if (p.art === 'zeit') min += inMinuten(zahl(p.menge_je_einheit), p.einheit) * menge;
  return cent(min / 60);
}

export function istVergleich(k: Pick<Kalkulation, 'menge' | 'posten'>, ist: IstStand): Vergleich {
  const plan = planStunden(k);
  const istH = Math.max(0, zahl(ist.istStunden, 0));
  const menge = Math.max(0, zahl(k.menge, 0));
  const faktor = plan > 0 && istH > 0 ? istH / plan : null;
  return {
    planStunden: plan,
    istStunden: cent(istH),
    abweichungProzent: faktor === null ? null : Math.round((faktor - 1) * 1000) / 10,
    faktor,
    istStundenJeEinheit: menge > 0 && istH > 0 ? Math.round((istH / menge) * 1000) / 1000 : null,
  };
}

// ---------------------------------------------------------------------------
// 3 · Echte Marge
// ---------------------------------------------------------------------------

export type EchteMarge = {
  angebotNetto: number;
  planMargeProzent: number;
  /** Lohnkosten je Stunde, wie die Kalkulation sie ansetzt (Zeit-Kosten / Plan-Stunden). */
  lohnsatz: number;
  istLohn: number;
  /** Material + Energie + Fremd: erfasste Projektkosten, sonst laut Kalkulation. */
  istMaterial: number;
  materialQuelle: 'projekt' | 'kalkulation';
  istSelbstkosten: number;
  echteMargeProzent: number | null;
  differenzProzentpunkte: number | null;
};

export function echteMarge(k: Kalkulation, ist: IstStand): EchteMarge {
  const e = rechne(k);
  const plan = planStunden(k);
  const lohnsatz = plan > 0 ? cent(e.zeit / plan) : 0;
  const istH = Math.max(0, zahl(ist.istStunden, 0));
  const istLohn = cent(istH * lohnsatz);
  const erfasst = Math.max(0, zahl(ist.istKosten, 0));
  const materialQuelle: EchteMarge['materialQuelle'] = erfasst > 0 ? 'projekt' : 'kalkulation';
  const istMaterial = cent(erfasst > 0 ? erfasst : e.material + e.energie + e.fremd);
  const gk = Math.max(0, zahl({ ...ZUSCHLAEGE_STANDARD, ...(k.zuschlaege || {}) }.gemeinkosten_prozent, 0));
  const istSelbstkosten = cent((istLohn + istMaterial) * (1 + gk / 100));
  const netto = e.angebotspreis_netto;
  const echte = netto > 0 && istH > 0 ? Math.round(((netto - istSelbstkosten) / netto) * 1000) / 10 : null;
  return {
    angebotNetto: netto,
    planMargeProzent: e.marge_prozent,
    lohnsatz,
    istLohn,
    istMaterial,
    materialQuelle,
    istSelbstkosten,
    echteMargeProzent: echte,
    differenzProzentpunkte: echte === null ? null : Math.round((echte - e.marge_prozent) * 10) / 10,
  };
}

/** Klartext-Hinweise für eine verknüpfte Kalkulation. */
export function andockHinweise(name: string, v: Vergleich, m: EchteMarge): string[] {
  const h: string[] = [];
  if (v.istStunden <= 0) {
    h.push(`„${name}": Im verknüpften Projekt sind noch keine Stunden erfasst — Plan und Ist lassen sich erst danach vergleichen.`);
    return h;
  }
  if (v.planStunden <= 0) {
    h.push(`„${name}": Die Kalkulation enthält keine Zeit-Positionen — die erfassten ${fmt(v.istStunden)} Stunden fehlen in der Rechnung ganz.`);
  } else if (v.abweichungProzent !== null && Math.abs(v.abweichungProzent) >= 10) {
    h.push(`„${name}": geplant ${fmt(v.planStunden)} h, erfasst ${fmt(v.istStunden)} h (${v.abweichungProzent > 0 ? '+' : ''}${fmt(v.abweichungProzent)} %).`);
  }
  if (m.echteMargeProzent !== null) {
    if (m.echteMargeProzent < 0) {
      h.push(`„${name}": Nach Ist-Stunden trägt sich der Auftrag nicht (echte Marge ${fmt(m.echteMargeProzent)} % statt geplant ${fmt(m.planMargeProzent)} %).`);
    } else if ((m.differenzProzentpunkte ?? 0) <= -5) {
      h.push(`„${name}": echte Marge ${fmt(m.echteMargeProzent)} % statt geplant ${fmt(m.planMargeProzent)} %.`);
    }
  }
  if (m.materialQuelle === 'kalkulation') {
    h.push(`„${name}": Für das Projekt sind keine Material-/Fremdkosten erfasst — die echte Marge rechnet mit dem Material laut Kalkulation.`);
  }
  return h;
}

// ---------------------------------------------------------------------------
// 4 · Zeit-Normwerte aus echten Projekten (nur Vorschläge)
// ---------------------------------------------------------------------------

export type IstKalk = {
  name: string;
  gewerk: string | null;
  einheit: string;
  menge: number;
  posten: Pick<Posten, 'art' | 'bezeichnung' | 'menge_je_einheit' | 'einheit'>[];
  istStunden: number;
  datum?: string;
};

/**
 * Jede verknüpfte Kalkulation mit Ist-Stunden liefert je Zeit-Position eine
 * Beobachtung: geplanter Wert × (Ist/Plan). Wer für 23 m² geplant 4,6 h
 * brauchte und 5,5 h gebraucht hat, liefert 8 min × 1,196 = 9,57 min/m².
 * Die Aufteilung auf mehrere Zeit-Positionen bleibt im Verhältnis des Plans.
 */
export function ausIstZeiten(liste: IstKalk[], gewerk: string, bisherige: Record<string, number> = {}): Vorschlag[] {
  const gesammelt = new Map<string, LernEingabe>();
  for (const k of liste || []) {
    if ((k.gewerk ?? '') !== gewerk) continue;
    const v = istVergleich({ menge: k.menge, posten: k.posten as Posten[] }, { istStunden: k.istStunden, istKosten: 0 });
    if (v.faktor === null || v.faktor > 10 || v.faktor < 0.1) continue; // offensichtlich falsch verknüpft
    for (const p of k.posten || []) {
      if (p.art !== 'zeit') continue;
      const plan = zahl(p.menge_je_einheit, 0);
      if (!(plan > 0) || !String(p.bezeichnung ?? '').trim()) continue;
      const key = schluesselAus(p.bezeichnung, p.art);
      const eintrag = gesammelt.get(key) ?? {
        schluessel: key, bezeichnung: p.bezeichnung, art: p.art, einheit: p.einheit, bezug: k.einheit,
        beobachtungen: [], bisher: bisherige[key],
      };
      eintrag.beobachtungen.push({ quelle: `Ist-Zeit ${k.name}`, wert: cent(plan * v.faktor), datum: k.datum });
      gesammelt.set(key, eintrag);
    }
  }
  return Array.from(gesammelt.values())
    .map(baueVorschlag)
    .filter((x): x is Vorschlag => x !== null)
    .map((x) => ({ ...x, hinweis: `Aus erfassten Projekt-Stunden. ${x.hinweis}` }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

/** Ist-Vorschläge haben Vorrang vor Vorschlägen aus den eigenen Schätzungen. */
export function mitIstVorrang(ausSchaetzung: Vorschlag[], ausIst: Vorschlag[]): Vorschlag[] {
  const ist = new Set(ausIst.map((v) => v.schluessel));
  return [...ausIst, ...ausSchaetzung.filter((v) => !ist.has(v.schluessel))];
}
