// ============================================================================
// ARGONAUT OS · lib/nachkalkulation.ts — Projekt-Nachkalkulation (Plan ↔ Ist)
//
// Reine Logik (KEINE Supabase-/React-Abhängigkeit, node-testbar). Vergleicht je
// Projekt den PLAN (projekte.budget) mit der IST-Leistung (Summe der
// projektleistungen = Stunden × Stundensatz) und zeigt, was davon schon
// abgerechnet bzw. noch offen ist. So sieht der Betrieb, ob ein Projekt im
// Budget liegt und wie viel noch zu fakturieren ist.
//
// HINWEIS: „Ist" = erbrachte (abrechenbare) Leistung. Material-/Fremdkosten für
// einen vollen Deckungsbeitrag lassen sich später ergänzen (Beleg↔Projekt).
//
// ▄▄▄ REPARATUR PUNKT 23 (18.09.2026) ▄▄▄
//
// 1. DIE PRÜFUNG FAND GAR NICHT STATT, WENN DAS BUDGET ALS TEXT KAM.
//    Der Typ erlaubt ausdrücklich `budget?: number | string | null`, gelesen
//    wurde aber mit Number(). GEMESSEN: Budget „12.500,00" ergab
//    budget = 0 → Status „kein_budget", Auslastung 0 — obwohl 6.000 € Leistung
//    erbracht waren. Ein Projekt mit vereinbartem Festpreis meldete also
//    „kein Budget hinterlegt" und hat NIE gewarnt. Jetzt liest lib/zahlen.ts.
//    Dasselbe gilt für Stunden, Stundensatz und die Kostenbeträge.
//
// 2. ASYMMETRISCHE RUNDUNG. r2 rundete −2,345 auf −2,34 statt −2,35 (vom
//    Nullpunkt weg nur in eine Richtung). Betrifft negative Differenzen und
//    negative Deckungsbeiträge — also genau die Projekte, um die es geht.
//    Jetzt centRunden aus lib/zahlen.ts, symmetrisch um Null.
//
// 3. DER DECKUNGSBEITRAG WURDE BERECHNET, ABER NICHT GEZEIGT. Die Ampel
//    (kalkStatus) rechnet nur erbracht/budget; Material- und Fremdkosten
//    fließen nicht ein. GEMESSEN: Budget 10.000 €, erbracht 9.000 €,
//    Kosten 8.000 € ergaben „knapp" — obwohl Leistung und Material zusammen
//    17.000 € gegen 10.000 € stehen.
//    DIE AMPEL BLEIBT, WIE SIE IST — sie ist im Betrieb eingeführt, und was
//    `budget` im Einzelfall bedeutet (vereinbarter Festpreis oder internes
//    Kostenbudget), kann der Code nicht wissen. Stattdessen NEU
//    fixpreisHinweise(): nennt im Klartext, was gegen das Budget läuft, ohne
//    eine Bedeutung zu unterstellen. Gleiches Muster wie die Kennziffer in
//    Punkt 17 und das SKR-Feld in Punkt 15.
//
// Die Datei hatte bis heute KEINEN Test.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

export interface LeistungRoh {
  projekt_id?: string | null;
  stunden?: number | null;
  stundensatz?: number | null;
  abgerechnet?: boolean | null;
}

export interface ProjektRoh {
  id: string;
  name?: string | null;
  budget?: number | string | null;
}

/** Material-/Fremdkosten je Projekt (Tabelle projekt_kosten). */
export interface KostenRoh {
  projekt_id?: string | null;
  betrag?: number | string | null;
}

export type KalkStatus = 'kein_budget' | 'im_budget' | 'knapp' | 'ueber_budget';

export interface ProjektKalk {
  id: string;
  name: string;
  budget: number;
  erbracht: number;      // Ist-Leistung gesamt (netto)
  abgerechnet: number;
  offen: number;         // erbracht − abgerechnet
  stunden: number;
  kosten: number;        // Summe Material-/Fremdkosten (projekt_kosten)
  deckungsbeitrag: number; // erbracht − kosten (echter DB)
  marge: number;         // deckungsbeitrag / erbracht × 100 (0 wenn keine Leistung)
  differenz: number;     // budget − erbracht (positiv = Luft, negativ = drüber)
  auslastung: number;    // erbracht / budget × 100 (0 wenn kein Budget)
  status: KalkStatus;
  // --- ab Punkt 23, additiv ---
  /** Erbrachte Leistung PLUS Material-/Fremdkosten. */
  leistungPlusKosten: number;
  /** budget − leistungPlusKosten (negativ = der Festpreis deckt es nicht mehr). */
  luft: number;
}

/** Zahl aus der Datenbank — auch als deutscher Text („12.500,00"). */
function z(n: unknown): number {
  return leseZahlOder(n, 0);
}
/** Auf Cent runden, symmetrisch um Null. */
function r2(n: number): number { return centRunden(n); }

/** Status-Ampel aus Auslastung (nur wenn ein Budget hinterlegt ist). */
export function kalkStatus(budget: number, erbracht: number): KalkStatus {
  if (budget <= 0) return 'kein_budget';
  const a = erbracht / budget;
  if (a > 1) return 'ueber_budget';
  if (a >= 0.85) return 'knapp';
  return 'im_budget';
}

/** Baut je Projekt die Nachkalkulation; sortiert „über Budget" zuerst, dann nach offenem Betrag. */
export function baueKalkulation(projekte: ProjektRoh[], leistungen: LeistungRoh[], kosten: KostenRoh[] = []): ProjektKalk[] {
  const agg = new Map<string, { erbracht: number; abgerechnet: number; stunden: number }>();
  for (const l of leistungen) {
    const pid = String(l.projekt_id ?? '');
    if (!pid) continue;
    const stunden = z(l.stunden);
    const betrag = stunden * z(l.stundensatz);
    let a = agg.get(pid);
    if (!a) { a = { erbracht: 0, abgerechnet: 0, stunden: 0 }; agg.set(pid, a); }
    a.erbracht += betrag;
    a.stunden += stunden;
    if (l.abgerechnet) a.abgerechnet += betrag;
  }

  // Material-/Fremdkosten je Projekt summieren.
  const kostenAgg = new Map<string, number>();
  for (const k of kosten) {
    const pid = String(k.projekt_id ?? '');
    if (!pid) continue;
    kostenAgg.set(pid, (kostenAgg.get(pid) || 0) + z(k.betrag));
  }

  const out: ProjektKalk[] = (projekte || []).map((p) => {
    const a = agg.get(String(p.id)) || { erbracht: 0, abgerechnet: 0, stunden: 0 };
    const budget = z(p.budget);
    const erbracht = r2(a.erbracht);
    const abgerechnet = r2(a.abgerechnet);
    const kostenSumme = r2(kostenAgg.get(String(p.id)) || 0);
    const deckungsbeitrag = r2(erbracht - kostenSumme);
    return {
      id: String(p.id),
      name: (p.name && String(p.name).trim()) || 'Projekt',
      budget: r2(budget),
      erbracht,
      abgerechnet,
      offen: r2(erbracht - abgerechnet),
      stunden: r2(a.stunden),
      kosten: kostenSumme,
      deckungsbeitrag,
      marge: erbracht > 0 ? r2((deckungsbeitrag / erbracht) * 100) : 0,
      differenz: r2(budget - erbracht),
      auslastung: budget > 0 ? r2((erbracht / budget) * 100) : 0,
      status: kalkStatus(budget, erbracht),
      leistungPlusKosten: r2(erbracht + kostenSumme),
      luft: r2(budget - erbracht - kostenSumme),
    };
  });

  const rang: Record<KalkStatus, number> = { ueber_budget: 0, knapp: 1, im_budget: 2, kein_budget: 3 };
  return out.sort((x, y) => (rang[x.status] - rang[y.status]) || (y.offen - x.offen));
}

/** Summen über alle Projekte (für die KPI-Leiste). */
export function summeKalk(kalk: ProjektKalk[]): {
  budget: number; erbracht: number; abgerechnet: number; offen: number; ueberBudget: number;
  kosten: number; deckungsbeitrag: number; marge: number;
} {
  const s = { budget: 0, erbracht: 0, abgerechnet: 0, offen: 0, ueberBudget: 0, kosten: 0, deckungsbeitrag: 0 };
  for (const k of kalk) {
    s.budget += k.budget;
    s.erbracht += k.erbracht;
    s.abgerechnet += k.abgerechnet;
    s.offen += k.offen;
    s.kosten += k.kosten;
    s.deckungsbeitrag += k.deckungsbeitrag;
    if (k.status === 'ueber_budget') s.ueberBudget += 1;
  }
  return {
    budget: r2(s.budget), erbracht: r2(s.erbracht), abgerechnet: r2(s.abgerechnet), offen: r2(s.offen),
    ueberBudget: s.ueberBudget, kosten: r2(s.kosten), deckungsbeitrag: r2(s.deckungsbeitrag),
    marge: s.erbracht > 0 ? r2((s.deckungsbeitrag / s.erbracht) * 100) : 0,
  };
}


// ============================================================================
// Klartext zur Budget-/Fixpreis-Prüfung (Punkt 23). Ändert keine Ampel und
// keine Zahl. NOCH NICHT auf der Seite angezeigt — Andockpunkt, gebündelt mit
// staffelUnstimmigkeiten / extfHinweise / ustvaHinweise / bankHinweise /
// wiederkehrHinweise / datevHinweise / fristenHinweise.
//
// Bewusst NEUTRAL formuliert: es wird gesagt, was gemessen ist („Leistung und
// Material zusammen übersteigen das hinterlegte Budget um X"), nicht, was
// `budget` bedeuten soll. Ob das ein vereinbarter Festpreis oder ein internes
// Kostenbudget ist, entscheidet der Betrieb, nicht diese Datei.
// ============================================================================

function eur(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
}

export function fixpreisHinweise(kalk: ProjektKalk[]): string[] {
  const h: string[] = [];
  const mit = (kalk || []).filter((k) => k.budget > 0);

  const ohne = (kalk || []).filter((k) => k.budget <= 0 && (k.erbracht > 0 || k.kosten > 0));
  if (ohne.length > 0) {
    h.push(`${ohne.length} Projekt${ohne.length === 1 ? '' : 'e'} ohne hinterlegtes Budget — dort findet keine Prüfung statt: ${ohne.map((k) => k.name).join(', ')}.`);
  }

  const ueberFakturiert = mit.filter((k) => k.abgerechnet - k.budget > 0.005);
  if (ueberFakturiert.length > 0) {
    h.push(`${ueberFakturiert.length} Projekt${ueberFakturiert.length === 1 ? '' : 'e'} ist bereits über das Budget hinaus abgerechnet: ${ueberFakturiert.map((k) => `${k.name} (${eur(k.abgerechnet)} von ${eur(k.budget)})`).join(', ')}.`);
  }

  const gedeckt = mit.filter((k) => k.luft < -0.005);
  if (gedeckt.length > 0) {
    h.push(`Bei ${gedeckt.length} Projekt${gedeckt.length === 1 ? '' : 'en'} übersteigen Leistung und Material zusammen das Budget: ${gedeckt.map((k) => `${k.name} (${eur(k.leistungPlusKosten)} gegen ${eur(k.budget)}, ${eur(-k.luft)} darüber)`).join(', ')}.`);
  }

  const minusDb = (kalk || []).filter((k) => k.erbracht > 0 && k.deckungsbeitrag < -0.005);
  if (minusDb.length > 0) {
    h.push(`${minusDb.length} Projekt${minusDb.length === 1 ? '' : 'e'} mit negativem Deckungsbeitrag: ${minusDb.map((k) => `${k.name} (${eur(k.deckungsbeitrag)})`).join(', ')}.`);
  }

  const nochOffen = mit.filter((k) => k.offen > 0.005 && k.abgerechnet >= k.budget - 0.005);
  if (nochOffen.length > 0) {
    h.push(`${nochOffen.length} Projekt${nochOffen.length === 1 ? '' : 'e'} hat noch nicht abgerechnete Leistung, obwohl das Budget bereits voll fakturiert ist: ${nochOffen.map((k) => `${k.name} (${eur(k.offen)} offen)`).join(', ')}.`);
  }
  return h;
}
