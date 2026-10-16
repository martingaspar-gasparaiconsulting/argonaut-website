// ============================================================================
// ARGONAUT OS · lib/bauzeitenplan.ts — HW-2 Bauzeitenplan (16.10.2026)
//
// Vorgänge (Gewerke) je Projekt mit Dauer in Arbeitstagen und Abhängigkeiten
// („fängt an, wenn X fertig ist", optional mit Puffer). Daraus rechnet der Plan
// Start und Ende jedes Vorgangs, das Bauende und den kritischen Weg (Vorgänge
// ohne Luft — verschiebt sich einer, verschiebt sich das Bauende).
//
// Arbeitstage = Mo–Fr ohne Feiertage (Set aus lib/feiertage, Bundesland des
// Betriebs). Gerechnet wird in Arbeitstag-Nummern, erst am Ende in Datumswerte.
//
// Rein, importfrei, getestet in tests/bauzeitenplanHW2.test.mjs. SQL: p399.
// ============================================================================

export const MAX_DAUER = 500;
export const MAX_PUFFER = 60;
export const MAX_VORGAENGER = 20;
const MAX_TAGE = 4000; // Planungshorizont in Arbeitstagen (≈ 16 Jahre)

export type Vorgang = {
  id: string; titel: string; gewerk?: string | null; firma?: string | null;
  start_wunsch?: string | null; dauer_tage: number; puffer_tage?: number | null;
  vorgaenger?: string[] | null; fortschritt?: number | null; sortierung?: number | null;
};

export type PlanZeile = { id: string; start: string; ende: string; esIdx: number; efIdx: number; luft: number; kritisch: boolean };
export type Plan = { zeilen: Map<string, PlanZeile>; ende: string | null; fehler: string | null };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function istIso(v: unknown): v is string { return typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')); }

function plusTage(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function istArbeitstag(iso: string, feiertage: Set<string>): boolean {
  const wt = new Date(iso + 'T00:00:00Z').getUTCDay();
  return wt !== 0 && wt !== 6 && !feiertage.has(iso);
}

/** Arbeitstage ab (einschließlich) dem ersten Arbeitstag ≥ start, als Liste. */
function kalender(start: string, feiertage: Set<string>, anzahl: number): string[] {
  const out: string[] = [];
  let d = start;
  for (let i = 0; out.length < anzahl && i < anzahl * 2 + 30; i++) {
    if (istArbeitstag(d, feiertage)) out.push(d);
    d = plusTage(d, 1);
  }
  return out;
}

/** Nummer des Arbeitstags für ein Datum (fällt das Datum auf Wochenende/Feiertag: nächster Arbeitstag). */
function idxVon(kal: string[], iso: string): number {
  if (iso <= kal[0]) return 0;
  let lo = 0, hi = kal.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (kal[m] < iso) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * Plan rechnen. Vorwärts: Start = max(Wunschtermin, Ende jedes Vorgängers + 1 + Puffer).
 * Rückwärts: späteste Lage ohne Verschiebung des Bauendes → Luft; Luft 0 = kritisch.
 * Zyklen oder unbekannte Vorgänger → Fehler, kein Plan.
 */
export function planBerechnen(vorgaenge: Vorgang[], projektStart: string, feiertage: Set<string>): Plan {
  const leer: Plan = { zeilen: new Map(), ende: null, fehler: null };
  const liste = (vorgaenge ?? []).filter((v) => v && v.id);
  if (!liste.length) return leer;
  if (!istIso(projektStart)) return { ...leer, fehler: 'Bitte den Baubeginn eintragen.' };
  const byId = new Map(liste.map((v) => [v.id, v]));
  for (const v of liste) {
    for (const p of v.vorgaenger ?? []) {
      if (p === v.id) return { ...leer, fehler: `„${v.titel}" kann nicht auf sich selbst warten.` };
      if (!byId.has(p)) return { ...leer, fehler: `„${v.titel}" wartet auf einen Vorgang, den es nicht mehr gibt — bitte die Abhängigkeit neu wählen.` };
    }
  }
  // Topologische Reihenfolge (Kahn)
  const nach = new Map<string, string[]>(liste.map((v) => [v.id, []]));
  const grad = new Map<string, number>(liste.map((v) => [v.id, 0]));
  for (const v of liste) for (const p of new Set(v.vorgaenger ?? [])) { nach.get(p)!.push(v.id); grad.set(v.id, grad.get(v.id)! + 1); }
  const queue = liste.filter((v) => grad.get(v.id) === 0).map((v) => v.id);
  const ordnung: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordnung.push(id);
    for (const n of nach.get(id)!) { grad.set(n, grad.get(n)! - 1); if (grad.get(n) === 0) queue.push(n); }
  }
  if (ordnung.length !== liste.length) {
    const im = liste.filter((v) => !ordnung.includes(v.id)).map((v) => `„${v.titel}"`).slice(0, 3).join(', ');
    return { ...leer, fehler: `Die Abhängigkeiten drehen sich im Kreis (${im}) — bitte eine davon lösen.` };
  }
  const kal = kalender(projektStart, feiertage, MAX_TAGE);
  const dauer = (v: Vorgang) => Math.min(MAX_DAUER, Math.max(1, Math.trunc(Number(v.dauer_tage) || 1)));
  const puffer = (v: Vorgang) => Math.min(MAX_PUFFER, Math.max(0, Math.trunc(Number(v.puffer_tage) || 0)));
  const es = new Map<string, number>(), ef = new Map<string, number>();
  for (const id of ordnung) {
    const v = byId.get(id)!;
    let s = istIso(v.start_wunsch) ? idxVon(kal, v.start_wunsch) : 0;
    for (const p of v.vorgaenger ?? []) s = Math.max(s, ef.get(p)! + 1 + puffer(v));
    es.set(id, s); ef.set(id, s + dauer(v) - 1);
  }
  const endeIdx = Math.max(...ordnung.map((id) => ef.get(id)!));
  if (endeIdx >= kal.length) return { ...leer, fehler: 'Der Plan ist zu lang (über 16 Jahre) — bitte Dauern prüfen.' };
  const lf = new Map<string, number>();
  for (const id of [...ordnung].reverse()) {
    let l = endeIdx;
    for (const n of nach.get(id)!) { const nv = byId.get(n)!; const ls = lf.get(n)! - dauer(nv) + 1; l = Math.min(l, ls - 1 - puffer(nv)); }
    lf.set(id, l);
  }
  const zeilen = new Map<string, PlanZeile>();
  for (const id of ordnung) {
    const luft = lf.get(id)! - ef.get(id)!;
    zeilen.set(id, { id, start: kal[es.get(id)!], ende: kal[ef.get(id)!], esIdx: es.get(id)!, efIdx: ef.get(id)!, luft, kritisch: luft <= 0 });
  }
  return { zeilen, ende: kal[endeIdx], fehler: null };
}

export type Eingabe = { titel?: string; gewerk?: string; firma?: string; start_wunsch?: string; dauer_tage?: string | number; puffer_tage?: string | number; vorgaenger?: string[] };

export function pruefeVorgang(e: Eingabe, eigeneId?: string | null): { zeile: Omit<Vorgang, 'id'> | null; fehler: string | null } {
  const titel = String(e.titel ?? '').trim();
  if (titel.length < 2) return { zeile: null, fehler: 'Bitte den Vorgang benennen (z. B. Rohbau, Dachstuhl, Estrich).' };
  const d = Number(String(e.dauer_tage ?? '').trim());
  if (!Number.isInteger(d) || d < 1 || d > MAX_DAUER) return { zeile: null, fehler: `Dauer in Arbeitstagen: ganze Zahl von 1 bis ${MAX_DAUER}.` };
  const pRoh = String(e.puffer_tage ?? '').trim();
  const p = pRoh ? Number(pRoh) : 0;
  if (!Number.isInteger(p) || p < 0 || p > MAX_PUFFER) return { zeile: null, fehler: `Wartezeit vor dem Start (z. B. Estrich trocknen lassen): 0 bis ${MAX_PUFFER} Arbeitstage.` };
  const w = String(e.start_wunsch ?? '').trim();
  if (w && !istIso(w)) return { zeile: null, fehler: 'Frühester Start: bitte ein gültiges Datum.' };
  const vg = [...new Set((e.vorgaenger ?? []).map(String).filter(Boolean))];
  if (eigeneId && vg.includes(eigeneId)) return { zeile: null, fehler: 'Ein Vorgang kann nicht auf sich selbst warten.' };
  if (vg.length > MAX_VORGAENGER) return { zeile: null, fehler: `Höchstens ${MAX_VORGAENGER} Vorgänger.` };
  return {
    zeile: {
      titel: titel.slice(0, 200), gewerk: String(e.gewerk ?? '').trim().slice(0, 100) || null, firma: String(e.firma ?? '').trim().slice(0, 150) || null,
      start_wunsch: w || null, dauer_tage: d, puffer_tage: p, vorgaenger: vg,
    },
    fehler: null,
  };
}

/** Würde diese Abhängigkeit einen Kreis bilden? (vor dem Speichern prüfen) */
export function bildetKreis(vorgaenge: Vorgang[], id: string, neueVorgaenger: string[]): boolean {
  const map = new Map((vorgaenge ?? []).map((v) => [v.id, v.id === id ? neueVorgaenger : (v.vorgaenger ?? [])]));
  if (!map.has(id)) map.set(id, neueVorgaenger);
  const seen = new Set<string>();
  const stack = [...neueVorgaenger];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === id) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...(map.get(x) ?? []));
  }
  return false;
}

export type Stand = 'fertig' | 'ueberfaellig' | 'hinter_plan' | 'laeuft' | 'geplant';

/** Ampel je Vorgang zum Stichtag: Fortschritt gegen Plan. */
export function stand(z: Pick<PlanZeile, 'start' | 'ende' | 'esIdx' | 'efIdx'>, fortschritt: number | null | undefined, heute: string, feiertage: Set<string>): Stand {
  const f = Math.max(0, Math.min(100, Math.trunc(Number(fortschritt) || 0)));
  if (f >= 100) return 'fertig';
  if (heute > z.ende) return 'ueberfaellig';
  if (heute < z.start) return 'geplant';
  const kal = kalender(z.start, feiertage, z.efIdx - z.esIdx + 1);
  const erledigtTage = kal.filter((d) => d <= heute).length;
  const soll = Math.round((erledigtTage / kal.length) * 100);
  return f + 25 < soll ? 'hinter_plan' : 'laeuft';
}

export const STAND_TEXT: Record<Stand, string> = { fertig: 'fertig', ueberfaellig: 'überfällig', hinter_plan: 'hinter Plan', laeuft: 'läuft', geplant: 'geplant' };

// ============================================================================
// HW-2 Teil 2 — Vorlagen für typische Abläufe (Startwerte, im Plan anpassen)
// ============================================================================

export type VorlageSchritt = { key: string; titel: string; gewerk: string; dauer: number; puffer?: number; nach?: string[] };
export type PlanVorlage = { id: string; name: string; schritte: VorlageSchritt[] };

export const PLAN_VORLAGEN: PlanVorlage[] = [
  { id: 'efh', name: 'Einfamilienhaus Neubau', schritte: [
    { key: 'ein', titel: 'Baustelleneinrichtung', gewerk: 'Bauunternehmen', dauer: 2 },
    { key: 'erd', titel: 'Erdarbeiten und Gründung', gewerk: 'Tiefbau', dauer: 8, nach: ['ein'] },
    { key: 'roh', titel: 'Rohbau', gewerk: 'Maurer', dauer: 30, nach: ['erd'] },
    { key: 'dst', titel: 'Dachstuhl', gewerk: 'Zimmerer', dauer: 5, nach: ['roh'] },
    { key: 'dach', titel: 'Dacheindeckung und Spenglerarbeiten', gewerk: 'Dachdecker', dauer: 8, nach: ['dst'] },
    { key: 'fen', titel: 'Fenster und Außentüren', gewerk: 'Fensterbau', dauer: 4, nach: ['dach'] },
    { key: 'elr', titel: 'Elektro Rohinstallation', gewerk: 'Elektro', dauer: 8, nach: ['fen'] },
    { key: 'shk', titel: 'Sanitär und Heizung Rohinstallation', gewerk: 'SHK', dauer: 10, nach: ['fen'] },
    { key: 'put', titel: 'Innenputz', gewerk: 'Stuckateur', dauer: 8, nach: ['elr', 'shk'] },
    { key: 'est', titel: 'Estrich', gewerk: 'Estrichleger', dauer: 3, puffer: 3, nach: ['put'] },
    { key: 'fli', titel: 'Fliesen', gewerk: 'Fliesenleger', dauer: 8, puffer: 20, nach: ['est'] },
    { key: 'mal', titel: 'Maler', gewerk: 'Maler', dauer: 8, nach: ['fli'] },
    { key: 'fs', titel: 'Feininstallation Elektro und Sanitär', gewerk: 'Elektro / SHK', dauer: 5, nach: ['mal'] },
    { key: 'bod', titel: 'Bodenbeläge', gewerk: 'Bodenleger', dauer: 4, nach: ['fs'] },
    { key: 'abn', titel: 'Endreinigung und Abnahme', gewerk: 'Bauunternehmen', dauer: 2, nach: ['bod'] },
  ] },
  { id: 'bad', name: 'Badsanierung', schritte: [
    { key: 'abb', titel: 'Rückbau altes Bad', gewerk: 'SHK', dauer: 2 },
    { key: 'shk', titel: 'Sanitär Rohinstallation', gewerk: 'SHK', dauer: 3, nach: ['abb'] },
    { key: 'ele', titel: 'Elektro Rohinstallation', gewerk: 'Elektro', dauer: 1, nach: ['abb'] },
    { key: 'put', titel: 'Putz und Abdichtung', gewerk: 'Fliesenleger', dauer: 2, puffer: 1, nach: ['shk', 'ele'] },
    { key: 'fli', titel: 'Fliesen', gewerk: 'Fliesenleger', dauer: 4, puffer: 1, nach: ['put'] },
    { key: 'mon', titel: 'Endmontage Sanitär und Elektro', gewerk: 'SHK / Elektro', dauer: 2, nach: ['fli'] },
    { key: 'abn', titel: 'Reinigung und Übergabe', gewerk: 'SHK', dauer: 1, nach: ['mon'] },
  ] },
  { id: 'dach', name: 'Dachsanierung', schritte: [
    { key: 'ger', titel: 'Gerüst stellen', gewerk: 'Gerüstbau', dauer: 1 },
    { key: 'abd', titel: 'Abdecken alte Eindeckung', gewerk: 'Dachdecker', dauer: 3, nach: ['ger'] },
    { key: 'hol', titel: 'Holzarbeiten und Lattung', gewerk: 'Zimmerer', dauer: 3, nach: ['abd'] },
    { key: 'dae', titel: 'Dämmung und Unterdeckbahn', gewerk: 'Dachdecker', dauer: 3, nach: ['hol'] },
    { key: 'ein', titel: 'Neueindeckung', gewerk: 'Dachdecker', dauer: 5, nach: ['dae'] },
    { key: 'spe', titel: 'Spenglerarbeiten', gewerk: 'Spengler', dauer: 2, nach: ['ein'] },
    { key: 'abg', titel: 'Gerüst abbauen und Abnahme', gewerk: 'Gerüstbau', dauer: 1, nach: ['spe'] },
  ] },
  { id: 'heiz', name: 'Heizungstausch (Wärmepumpe)', schritte: [
    { key: 'auf', titel: 'Aufnahme und Heizlast', gewerk: 'SHK', dauer: 1 },
    { key: 'fun', titel: 'Fundament Außengerät', gewerk: 'Bauunternehmen', dauer: 1, puffer: 5, nach: ['auf'] },
    { key: 'dem', titel: 'Demontage alte Heizung', gewerk: 'SHK', dauer: 1, nach: ['auf'] },
    { key: 'mon', titel: 'Montage Wärmepumpe und Speicher', gewerk: 'SHK', dauer: 2, nach: ['fun', 'dem'] },
    { key: 'ele', titel: 'Elektroanschluss', gewerk: 'Elektro', dauer: 1, nach: ['mon'] },
    { key: 'inb', titel: 'Inbetriebnahme und hydraulischer Abgleich', gewerk: 'SHK', dauer: 1, nach: ['ele'] },
    { key: 'ein', titel: 'Einweisung Kunde und Unterlagen', gewerk: 'SHK', dauer: 1, nach: ['inb'] },
  ] },
];

/** Reihenfolge zum Anlegen: jeder Schritt erst, wenn alle Vorgänger schon angelegt sind. Kreis → null. */
export function vorlageReihenfolge(v: PlanVorlage): VorlageSchritt[] | null {
  const fertig = new Set<string>(); const out: VorlageSchritt[] = [];
  const keys = new Set(v.schritte.map((x) => x.key));
  if (v.schritte.some((x) => (x.nach ?? []).some((n) => !keys.has(n)))) return null;
  let rest = [...v.schritte];
  while (rest.length) {
    const bereit = rest.filter((x) => (x.nach ?? []).every((n) => fertig.has(n)));
    if (!bereit.length) return null;
    for (const b of bereit) { out.push(b); fertig.add(b.key); }
    rest = rest.filter((x) => !fertig.has(x.key));
  }
  return out;
}

// ============================================================================
// HW-2 Teil 3 — Termine je Firma (für Subunternehmer und eigene Kolonnen)
// ============================================================================

function de(iso: string): string { const [j, m, t] = iso.split('-'); return `${t}.${m}.${j}`; }

export type FirmenTermine = { firma: string; zeilen: { titel: string; start: string; ende: string; kritisch: boolean }[]; text: string };

/**
 * Je Firma (ohne Firma: je Gewerk, sonst „Eigene Leute") die geplanten Termine,
 * zeitlich sortiert, mit fertigem Mitteilungstext (gesiezt, ohne Preise).
 */
export function termineJeFirma(vorgaenge: Vorgang[], plan: Plan, projektName: string, absender: string): FirmenTermine[] {
  if (plan.fehler) return [];
  const m = new Map<string, FirmenTermine['zeilen']>();
  for (const v of vorgaenge ?? []) {
    const p = plan.zeilen.get(v.id);
    if (!p) continue;
    if ((Number(v.fortschritt) || 0) >= 100) continue;
    const firma = String(v.firma ?? '').trim() || String(v.gewerk ?? '').trim() || 'Eigene Leute';
    const l = m.get(firma) ?? [];
    l.push({ titel: v.titel, start: p.start, ende: p.ende, kritisch: p.kritisch });
    m.set(firma, l);
  }
  const proj = String(projektName ?? '').trim() || 'Bauvorhaben';
  return [...m.entries()].map(([firma, zeilen]) => {
    zeilen.sort((a, b) => a.start.localeCompare(b.start));
    const liste = zeilen.map((z) => `- ${z.titel}: ${de(z.start)}${z.start !== z.ende ? ` bis ${de(z.ende)}` : ''}${z.kritisch ? ' (Termin ist fest eingeplant — bitte unbedingt halten)' : ''}`).join('\n');
    const text = `Guten Tag,\n\nfür das Bauvorhaben „${proj}" sind Sie wie folgt eingeplant:\n\n${liste}\n\nBitte geben Sie uns kurz Bescheid, wenn ein Termin nicht passt.\n\nMit freundlichen Grüßen\n${String(absender ?? '').trim()}`.trim();
    return { firma, zeilen, text };
  }).sort((a, b) => a.zeilen[0].start.localeCompare(b.zeilen[0].start));
}
