// ============================================================================
// lib/weinbau.ts — Paket 364 (13.10.2026) · A4f Fachpaket Weinbau
// Lesebuch, Partien und Kellerbuch: reine Logik (keine Supabase-Aufrufe, keine
// React-Hooks), importierbar von Seite und Tests. Die Datenbank prüft alles
// noch einmal (supabase-sql/p364-weinbau.sql) — diese Prüfungen geben nur
// früher eine verständliche Meldung.
// ============================================================================

import { zahlLesen } from './herstellung';

export { zahlLesen };

/** Branchen, die das Weinbau-Paket bekommen. */
export function weinbauZusatz(branche: string | null | undefined): boolean {
  return /weing(u|ü)t|winzer|weinbau|wein(bau)?genossenschaft/i.test(String(branche ?? ''));
}
/** Lesebuch/Kellerbuch, Weinberge (Schlagkartei mit Düngung und Pflanzenschutz), Chargen, Etiketten, Cuvées als Rezeptur. */
export const WEINBAU_MODULE = ['weinbau', 'schlagkartei', 'chargen', 'etiketten', 'rezeptur'] as const;

export type KellerArt = {
  key: string; name: string; icon: string;
  /** +1 Zugang, −1 Abgang, 0 Behandlung/Analyse (Bestand bleibt). */
  vorzeichen: 1 | -1 | 0;
  /** Nur über eigene Knöpfe (Lese, Verschnitt, Abfüllung) — nicht im freien Eintrag. */
  intern: boolean;
  mittelPflicht: boolean;
  mittelVorschlaege: string[];
  einheit: string;
};

export const KELLER_ARTEN: readonly KellerArt[] = Object.freeze([
  { key: 'zugang', name: 'Zugang (Zukauf Most/Wein)', icon: '⬇️', vorzeichen: 1, intern: false, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'zugang_lese', name: 'Zugang aus Lese', icon: '🍇', vorzeichen: 1, intern: true, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'verschnitt_zu', name: 'Verschnitt hinein', icon: '🔀', vorzeichen: 1, intern: true, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'abgang', name: 'Abgang (Fassweinverkauf, Abgabe)', icon: '⬆️', vorzeichen: -1, intern: false, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'verschnitt_ab', name: 'Verschnitt heraus', icon: '🔀', vorzeichen: -1, intern: true, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'abfuellung', name: 'Abfüllung', icon: '🍾', vorzeichen: -1, intern: true, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'schwund', name: 'Schwund (Trub, Hefe, Verlust)', icon: '💧', vorzeichen: -1, intern: false, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'storno_lese', name: 'Storno Lese', icon: '↩️', vorzeichen: -1, intern: true, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'anreicherung', name: 'Anreicherung', icon: '🧂', vorzeichen: 0, intern: false, mittelPflicht: true, mittelVorschlaege: ['Saccharose', 'Rektifiziertes Traubenmostkonzentrat (RTK)', 'Konzentrierter Traubenmost'], einheit: 'kg' },
  { key: 'entsaeuerung', name: 'Entsäuerung', icon: '⚗️', vorzeichen: 0, intern: false, mittelPflicht: true, mittelVorschlaege: ['Kaliumhydrogencarbonat', 'Calciumcarbonat', 'Kaliumtartrat'], einheit: 'g' },
  { key: 'saeuerung', name: 'Säuerung', icon: '🍋', vorzeichen: 0, intern: false, mittelPflicht: true, mittelVorschlaege: ['L-Weinsäure', 'Äpfelsäure', 'Milchsäure'], einheit: 'g' },
  { key: 'suessung', name: 'Süßung', icon: '🍯', vorzeichen: 0, intern: false, mittelPflicht: true, mittelVorschlaege: ['Süßreserve (Traubenmost)', 'Rektifiziertes Traubenmostkonzentrat (RTK)'], einheit: 'l' },
  { key: 'schwefelung', name: 'Schwefelung', icon: '🟡', vorzeichen: 0, intern: false, mittelPflicht: true, mittelVorschlaege: ['Kaliumdisulfit', 'Schweflige Säure (Lösung)', 'Schwefeldioxid (gasförmig)'], einheit: 'g' },
  { key: 'schoenung', name: 'Schönung', icon: '🧪', vorzeichen: 0, intern: false, mittelPflicht: true, mittelVorschlaege: ['Bentonit', 'Gelatine', 'Aktivkohle', 'Kieselsol', 'PVPP'], einheit: 'g' },
  { key: 'filtration', name: 'Filtration', icon: '🧻', vorzeichen: 0, intern: false, mittelPflicht: false, mittelVorschlaege: ['Kieselgur', 'Schichtenfilter', 'Membranfilter'], einheit: '' },
  { key: 'analyse', name: 'Analyse', icon: '📊', vorzeichen: 0, intern: false, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
  { key: 'sonstiges', name: 'Sonstiges', icon: '📝', vorzeichen: 0, intern: false, mittelPflicht: false, mittelVorschlaege: [], einheit: '' },
] as KellerArt[]);

export function kellerArt(k: string | null | undefined): KellerArt {
  return KELLER_ARTEN.find((a) => a.key === k) ?? KELLER_ARTEN[KELLER_ARTEN.length - 1];
}
/** Arten für den freien Kellerbuch-Eintrag (ohne Lese/Verschnitt/Abfüllung). */
export const FREIE_ARTEN = KELLER_ARTEN.filter((a) => !a.intern);

/** Gängige Flascheninhalte in Litern. */
export const NENNVOLUMEN = Object.freeze([0.1875, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 3]);

export type PartieRoh = { id: string; jahrgang: number; bezeichnung: string; rebsorte?: string | null; behaelter?: string | null; bestand_l: number | string; notiz?: string | null; erstellt_am?: string };
export type LeseRoh = {
  id?: string; nummer?: string | null; jahrgang: number; lesedatum: string; schlag_id?: string | null; weinberg: string; flaeche_ha?: number | string | null;
  rebsorte: string; lesart?: string | null; menge_kg: number | string; mostgewicht_oe?: number | string | null; saeure_gl?: number | string | null;
  most_l?: number | string | null; partie_id?: string | null; storniert?: boolean | null; storno_grund?: string | null; erfasst_name?: string | null; bemerkung?: string | null;
};
export type KellerRoh = {
  id?: string; partie_id: string; datum: string; art: string; menge_l?: number | string | null; mittel?: string | null; mittel_menge?: number | string | null; mittel_einheit?: string | null;
  alkohol_vol?: number | string | null; restzucker_gl?: number | string | null; saeure_gl?: number | string | null; so2_frei_mgl?: number | string | null; so2_gesamt_mgl?: number | string | null;
  charge_nr?: string | null; bemerkung?: string | null; bestand_nach_l?: number | string | null; erfasst_am?: string; erfasst_name?: string | null;
};

function n(x: unknown): number | null { return typeof x === 'number' ? (Number.isFinite(x) ? x : null) : zahlLesen(x as string); }
function r(x: number, k: number): number { const f = 10 ** k; return Math.round(x * f) / f; }

/** Optionales Zahlfeld: leer → null, sonst Zahl im Bereich, sonst Fehlertext. */
function feld(t: string, name: string, min: number, max: number, fehler: string[], strengGroesser = false): number | null {
  if (!t.trim()) return null;
  const v = zahlLesen(t);
  if (v == null || v < min || v > max || (strengGroesser && v <= min)) { fehler.push(`${name}: bitte eine Zahl ${strengGroesser ? 'über' : 'ab'} ${String(min).replace('.', ',')} bis ${String(max).replace('.', ',')}.`); return null; }
  return v;
}

export type LeseForm = { jahrgang: string; lesedatum: string; weinberg: string; flaeche: string; rebsorte: string; menge: string; oechsle: string; saeure: string; most: string; partie: string };

export function lesePruefen(e: LeseForm, heute: string): { fehler: string[]; werte: { jahrgang: number | null; flaeche: number | null; menge: number | null; oechsle: number | null; saeure: number | null; most: number | null } } {
  const fehler: string[] = [];
  const jahr = /^\d{4}-\d{2}-\d{2}$/.test(e.lesedatum) ? Number(e.lesedatum.slice(0, 4)) : null;
  if (!jahr) fehler.push('Bitte das Lesedatum angeben.');
  else if (e.lesedatum > heute) fehler.push('Das Lesedatum liegt in der Zukunft.');
  const jahrgang = /^\d{4}$/.test(e.jahrgang.trim()) ? Number(e.jahrgang.trim()) : null;
  if (jahrgang == null) fehler.push('Bitte den Jahrgang angeben (vierstellig).');
  else if (jahr && jahrgang !== jahr && jahrgang !== jahr - 1) fehler.push('Der Jahrgang passt nicht zum Lesedatum (gleiches Jahr, bei Eiswein auch das Vorjahr).');
  if (!e.weinberg.trim()) fehler.push('Bitte den Weinberg angeben.');
  if (!e.rebsorte.trim()) fehler.push('Bitte die Rebsorte angeben.');
  const menge = zahlLesen(e.menge);
  if (menge == null || menge <= 0) fehler.push('Bitte die Lesemenge in kg angeben.');
  const flaeche = feld(e.flaeche, 'Fläche (ha)', 0, 1000, fehler, true);
  const oechsle = feld(e.oechsle, 'Mostgewicht (°Oe)', 0, 350, fehler);
  const saeure = feld(e.saeure, 'Säure (g/l)', 0, 40, fehler);
  const most = feld(e.most, 'Most (l)', 0, 1e9, fehler, true);
  if (e.partie && most == null && !fehler.some((f) => f.startsWith('Most'))) fehler.push('Für die Partie bitte die Most-Menge in Litern angeben.');
  return { fehler, werte: { jahrgang, flaeche, menge: menge != null && menge > 0 ? menge : null, oechsle, saeure, most } };
}

export type KellerForm = { art: string; datum: string; menge: string; mittel: string; mittelMenge: string; mittelEinheit: string; alkohol: string; restzucker: string; saeure: string; so2frei: string; so2gesamt: string; bemerkung: string };

export function kellerPruefen(e: KellerForm, bestand: number, heute: string): { fehler: string[]; zeile: Record<string, unknown> } {
  const fehler: string[] = [];
  const a = KELLER_ARTEN.find((x) => x.key === e.art);
  if (!a) return { fehler: ['Bitte eine Art wählen.'], zeile: {} };
  if (a.intern) fehler.push('Lese, Verschnitt und Abfüllung bitte über die eigenen Knöpfe erfassen.');
  if (e.datum && e.datum > heute) fehler.push('Das Datum liegt in der Zukunft.');
  const zeile: Record<string, unknown> = { art: a.key, datum: e.datum || heute, bemerkung: e.bemerkung.trim() || null };
  if (a.vorzeichen !== 0) {
    const m = zahlLesen(e.menge);
    if (m == null || m <= 0) fehler.push('Bitte die Menge in Litern angeben.');
    else if (a.vorzeichen < 0 && m > bestand + 1e-9) fehler.push(`Nicht genug Wein in der Partie (Bestand ${String(r(bestand, 3)).replace('.', ',')} l).`);
    zeile.menge_l = m;
  }
  if (a.mittelPflicht && !e.mittel.trim()) fehler.push('Bitte das verwendete Mittel angeben.');
  if (e.mittel.trim()) zeile.mittel = e.mittel.trim();
  const mm = feld(e.mittelMenge, 'Menge Mittel', 0, 1e9, fehler, true);
  if (mm != null) { zeile.mittel_menge = mm; zeile.mittel_einheit = e.mittelEinheit.trim() || null; }
  if (a.key === 'analyse') {
    const w = {
      alkohol_vol: feld(e.alkohol, 'Alkohol (% vol)', 0, 25, fehler),
      restzucker_gl: feld(e.restzucker, 'Restzucker (g/l)', 0, 600, fehler),
      saeure_gl: feld(e.saeure, 'Säure (g/l)', 0, 40, fehler),
      so2_frei_mgl: feld(e.so2frei, 'Freie SO₂ (mg/l)', 0, 500, fehler),
      so2_gesamt_mgl: feld(e.so2gesamt, 'Gesamte SO₂ (mg/l)', 0, 1000, fehler),
    };
    if (Object.values(w).every((v) => v == null) && !fehler.some((f) => /Alkohol|Restzucker|Säure|SO₂/.test(f))) fehler.push('Bitte mindestens einen Analysewert angeben.');
    Object.assign(zeile, w);
  }
  if (a.key === 'sonstiges' && !e.bemerkung.trim()) fehler.push('Bitte beschreiben, was gemacht wurde.');
  return { fehler, zeile };
}

export function verschnittPruefen(von: PartieRoh | null | undefined, nach: PartieRoh | null | undefined, menge: string): { fehler: string[]; menge: number | null } {
  const fehler: string[] = [];
  if (!von || !nach) fehler.push('Bitte beide Partien wählen.');
  else if (von.id === nach.id) fehler.push('Bitte zwei verschiedene Partien wählen.');
  const m = zahlLesen(menge);
  if (m == null || m <= 0) fehler.push('Bitte die Menge in Litern angeben.');
  else if (von && m > (n(von.bestand_l) ?? 0) + 1e-9) fehler.push(`Nicht genug Wein in der Partie (Bestand ${String(r(n(von.bestand_l) ?? 0, 3)).replace('.', ',')} l).`);
  return { fehler, menge: m != null && m > 0 ? m : null };
}

export function abfuellPruefen(e: { flaschen: string; nenn: string; charge: string }, bestand: number): { fehler: string[]; flaschen: number | null; nenn: number | null; liter: number | null } {
  const fehler: string[] = [];
  const f = zahlLesen(e.flaschen);
  const fl = f != null && Number.isInteger(f) && f > 0 ? f : null;
  if (fl == null) fehler.push('Bitte die Zahl der Flaschen angeben (ganze Zahl).');
  const v = zahlLesen(e.nenn);
  const nenn = v != null && v > 0 && v <= 30 ? v : null;
  if (nenn == null) fehler.push('Bitte den Flascheninhalt in Litern angeben (z. B. 0,75).');
  if (!e.charge.trim()) fehler.push('Bitte eine Chargennummer (Los) angeben.');
  const liter = fl != null && nenn != null ? r(fl * nenn, 3) : null;
  if (liter != null && liter > bestand + 1e-9) fehler.push(`Nicht genug Wein in der Partie: ${String(liter).replace('.', ',')} l gebraucht, Bestand ${String(r(bestand, 3)).replace('.', ',')} l.`);
  return { fehler, flaschen: fl, nenn, liter };
}

/** Los-Vorschlag: Kürzel der Rebsorte (sonst Bezeichnung) + Jahrgang + laufende Abfüllung. */
export function losVorschlag(p: Pick<PartieRoh, 'bezeichnung' | 'rebsorte' | 'jahrgang'>, bisherigeAbfuellungen: number): string {
  const quelle = (p.rebsorte && p.rebsorte.trim()) || p.bezeichnung.replace(/\b\d{4}\b/g, '');
  const kurz = quelle.toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')[0]?.slice(0, 6) || 'WEIN';
  return `${kurz}-${p.jahrgang}-${Math.max(0, bisherigeAbfuellungen) + 1}`;
}

export type JahrgangZeile = { rebsorte: string; lesen: number; kg: number; most_l: number; oechsle: number | null; saeure: number | null };
export type WeinbergZeile = { weinberg: string; kg: number; most_l: number; ha: number | null; kgJeHa: number | null; hlJeHa: number | null };

/** Jahrgangs-Übersicht aus dem Lesebuch (ohne stornierte Einträge): je Rebsorte und je Weinberg. Ø nach kg gewichtet. */
export function jahrgangUebersicht(lesen: readonly LeseRoh[], jahrgang: number): { sorten: JahrgangZeile[]; weinberge: WeinbergZeile[]; summeKg: number; summeMost: number } {
  const gueltig = lesen.filter((l) => !l.storniert && Number(l.jahrgang) === jahrgang && (n(l.menge_kg) ?? 0) > 0);
  const sorten = new Map<string, { lesen: number; kg: number; most: number; oeG: number; oeKg: number; sG: number; sKg: number }>();
  const berge = new Map<string, { kg: number; most: number; ha: number | null; mostAlle: boolean }>();
  for (const l of gueltig) {
    const kg = n(l.menge_kg) ?? 0; const most = n(l.most_l); const oe = n(l.mostgewicht_oe); const s = n(l.saeure_gl);
    const so = sorten.get(l.rebsorte.trim()) ?? { lesen: 0, kg: 0, most: 0, oeG: 0, oeKg: 0, sG: 0, sKg: 0 };
    so.lesen += 1; so.kg += kg; so.most += most ?? 0;
    if (oe != null) { so.oeG += oe * kg; so.oeKg += kg; }
    if (s != null) { so.sG += s * kg; so.sKg += kg; }
    sorten.set(l.rebsorte.trim(), so);
    const key = l.weinberg.trim();
    const b = berge.get(key) ?? { kg: 0, most: 0, ha: null, mostAlle: true };
    b.kg += kg; b.most += most ?? 0; if (most == null) b.mostAlle = false;
    const ha = n(l.flaeche_ha); if (ha != null && ha > 0) b.ha = Math.max(b.ha ?? 0, ha);
    berge.set(key, b);
  }
  const sortenZ = [...sorten.entries()].map(([rebsorte, s]) => ({
    rebsorte, lesen: s.lesen, kg: r(s.kg, 1), most_l: r(s.most, 1),
    oechsle: s.oeKg > 0 ? r(s.oeG / s.oeKg, 1) : null, saeure: s.sKg > 0 ? r(s.sG / s.sKg, 1) : null,
  })).sort((a, b) => b.kg - a.kg || a.rebsorte.localeCompare(b.rebsorte, 'de'));
  const bergeZ = [...berge.entries()].map(([weinberg, b]) => ({
    weinberg, kg: r(b.kg, 1), most_l: r(b.most, 1), ha: b.ha,
    kgJeHa: b.ha ? r(b.kg / b.ha, 0) : null,
    hlJeHa: b.ha && b.mostAlle && b.most > 0 ? r(b.most / 100 / b.ha, 1) : null,
  })).sort((a, b) => a.weinberg.localeCompare(b.weinberg, 'de'));
  return { sorten: sortenZ, weinberge: bergeZ, summeKg: r(sortenZ.reduce((x, s) => x + s.kg, 0), 1), summeMost: r(sortenZ.reduce((x, s) => x + s.most_l, 0), 1) };
}

/** Bestand je Partie an einem Stichtag (z. B. für die Bestandsmeldung), aus den Kellerbuch-Einträgen bis einschließlich Stichtag. */
export function bestandAm(eintraege: readonly KellerRoh[], stichtag: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of eintraege) {
    if (!e.datum || e.datum > stichtag) continue;
    const v = kellerArt(e.art).vorzeichen; const l = n(e.menge_l);
    if (!v || l == null) { if (!m.has(e.partie_id)) m.set(e.partie_id, 0); continue; }
    m.set(e.partie_id, r((m.get(e.partie_id) ?? 0) + v * l, 3));
  }
  return m;
}

/** Letzte Analyse einer Partie (nach Datum, dann Erfassung). */
export function letzteAnalyse(eintraege: readonly KellerRoh[], partieId: string): KellerRoh | null {
  const a = eintraege.filter((e) => e.partie_id === partieId && e.art === 'analyse')
    .sort((x, y) => (y.datum ?? '').localeCompare(x.datum ?? '') || (y.erfasst_am ?? '').localeCompare(x.erfasst_am ?? ''));
  return a[0] ?? null;
}

/** Kurzer Text für eine Kellerbuch-Zeile (Mittel und Analysewerte). */
export function eintragText(e: KellerRoh): string {
  const teile: string[] = [];
  if (e.mittel) teile.push(e.mittel + (n(e.mittel_menge) != null ? ` ${zahlDe(n(e.mittel_menge))} ${e.mittel_einheit ?? ''}`.trimEnd() : ''));
  if (e.art === 'analyse') {
    if (n(e.alkohol_vol) != null) teile.push(`Alkohol ${zahlDe(n(e.alkohol_vol))} % vol`);
    if (n(e.restzucker_gl) != null) teile.push(`Restzucker ${zahlDe(n(e.restzucker_gl))} g/l`);
    if (n(e.saeure_gl) != null) teile.push(`Säure ${zahlDe(n(e.saeure_gl))} g/l`);
    if (n(e.so2_frei_mgl) != null) teile.push(`SO₂ frei ${zahlDe(n(e.so2_frei_mgl))} mg/l`);
    if (n(e.so2_gesamt_mgl) != null) teile.push(`SO₂ gesamt ${zahlDe(n(e.so2_gesamt_mgl))} mg/l`);
  }
  if (e.bemerkung) teile.push(e.bemerkung);
  return teile.join(' · ');
}

export function zahlDe(x: number | null | undefined, k = 3): string {
  return x == null ? '—' : x.toLocaleString('de-DE', { maximumFractionDigits: k });
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function datumDe(d: string | null | undefined): string {
  return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '—';
}

/** Kellerbuch einer Partie zum Drucken (maskiert). Einträge in Reihenfolge der Erfassung. */
export function kellerbuchHtml(p: PartieRoh, eintraege: readonly KellerRoh[], firma: string): string {
  const zeilen = [...eintraege].filter((e) => e.partie_id === p.id)
    .sort((a, b) => (a.erfasst_am ?? '').localeCompare(b.erfasst_am ?? ''))
    .map((e) => {
      const a = kellerArt(e.art); const l = n(e.menge_l);
      const menge = a.vorzeichen && l != null ? `${a.vorzeichen > 0 ? '+' : '−'} ${zahlDe(l)} l` : '';
      return `<tr><td>${datumDe(e.datum)}</td><td>${esc(a.name)}</td><td class="r">${menge}</td><td class="r">${n(e.bestand_nach_l) != null ? zahlDe(n(e.bestand_nach_l)) + ' l' : ''}</td><td>${esc(eintragText(e))}</td><td>${esc(e.erfasst_name ?? '')}</td></tr>`;
    }).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kellerbuch ${esc(p.bezeichnung)}</title>
<style>body{font-family:system-ui,sans-serif;font-size:12px;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}.r{text-align:right;white-space:nowrap}.k{color:#555}</style></head><body>
<div class="k">${esc(firma)}</div><h1>Kellerbuch · ${esc(p.bezeichnung)}</h1>
<div class="k">Jahrgang ${esc(p.jahrgang)}${p.rebsorte ? ' · ' + esc(p.rebsorte) : ''}${p.behaelter ? ' · ' + esc(p.behaelter) : ''} · Bestand ${zahlDe(n(p.bestand_l))} l</div>
<table><thead><tr><th>Datum</th><th>Vorgang</th><th class="r">Menge</th><th class="r">Bestand</th><th>Mittel / Werte / Bemerkung</th><th>Erfasst</th></tr></thead><tbody>${zeilen || '<tr><td colspan="6">Noch keine Einträge.</td></tr>'}</tbody></table>
<p class="k">Erstellt mit ARGONAUT OS. Hilfe zur Kellerbuchführung – amtliche Meldungen und Grenzwerte prüft der Betrieb selbst.</p></body></html>`;
}
