// ============================================================================
// ARGONAUT OS · lib/entsorgung.ts — Paket 355 (13.10.2026)
// A4c Fachpaket Entsorgung, Teil 1: Container-Dienst und Wiegeschein.
//
// Reine Logik (node-getestet in tests/entsorgungP355): Branchen, Abfallschlüssel
// lesen/prüfen (eigene Liste des Betriebs — KEIN amtlicher Katalog),
// Containerbestand, Aufträge Stellen/Tauschen/Abholen (dieselben Regeln wie
// supabase-sql/p355-entsorgung-container-wiegeschein.sql), Wiegeschein
// (Netto, Prüfungen), Druckansichten (Wiegeschein, Tagesliste für die Fahrer).
//
// Grundsatz: Nummer, Wägezeiten, Netto und das Umsetzen der Container beim
// Erledigen macht die DATENBANK. Was hier gerechnet wird, ist die Vorschau im
// Browser und die Prüfung vor dem Speichern.
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

import { berlinTag, zeitDe, datumDe, esc, type Firmenkopf } from './bewachung';
import { leseZahl } from './zahlen';

export { berlinTag, zeitDe, datumDe, esc };
export type { Firmenkopf };

// --- Branchen ---------------------------------------------------------------------

/**
 * Container-Dienst, Entsorgungslogistik/Abfalltransport, Abfallwirtschaft,
 * Schrott-/Metallrecycling, Elektroschrott/WEEE, Sonderabfall, Gefahrgut-
 * transport (ADR), „Recycling & Entsorgung". NICHT: Fahrzeugverwertung/
 * Autorecycling, Kompostwerke, Abbruch, Asbest-/Altlastensanierung,
 * Tatortreinigung, chemische Industrie.
 */
export function entsorgungZusatz(branche: string | null | undefined): boolean {
  const b = String(branche ?? '');
  return /container-?dienst|containervermietung|entsorgungslogistik|abfalltransport|abfallwirtschaft|müllentsorgung|muellentsorgung|metallrecycling|schrott|weee|sonderabfall|gefahrgut|^recycling & entsorgung$/i.test(b);
}
/** Module, die ein Entsorgungsbetrieb zusätzlich bekommt. */
export const ENTSORGUNG_MODULE = ['entsorgung'] as const;

// --- Abfallschlüssel --------------------------------------------------------------

/**
 * Abfallschlüssel aus einer Eingabe lesen: „17 09 04", „170904", „17 06 05*"
 * → „170904" bzw. „170605*". Alles andere ergibt null. Ob es den Schlüssel
 * amtlich gibt, prüft ARGONAUT NICHT — die Liste pflegt der Betrieb.
 */
export function schluesselLesen(roh: string | null | undefined): string | null {
  const t = String(roh ?? '').replace(/[\s.\-]/g, '');
  return /^[0-9]{6}\*?$/.test(t) ? t : null;
}
/** „170605*" → „17 06 05*" (Schreibweise der Abfallverzeichnis-Verordnung). */
export function schluesselLesbar(s: string | null | undefined): string {
  const t = String(s ?? '');
  if (!/^[0-9]{6}\*?$/.test(t)) return t || '—';
  return `${t.slice(0, 2)} ${t.slice(2, 4)} ${t.slice(4)}`;
}
/** Sternchen = gefährlicher Abfall (wie die Datenbank-Spalte gefaehrlich). */
export function istGefaehrlich(s: string | null | undefined): boolean {
  return String(s ?? '').endsWith('*');
}

export type SchluesselEingabe = { schluessel: string; bezeichnung: string };
export function schluesselPruefen(e: SchluesselEingabe, vorhanden: readonly string[] = []): { ok: true; schluessel: string } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  const s = schluesselLesen(e.schluessel);
  if (!s) f.push('Abfallschlüssel: 6 Ziffern, bei gefährlichem Abfall mit Sternchen (z. B. 17 09 04 oder 17 06 05*).');
  else if (vorhanden.includes(s)) f.push(`Den Schlüssel ${schluesselLesbar(s)} gibt es in Ihrer Liste schon.`);
  const b = String(e.bezeichnung ?? '').trim();
  if (!b) f.push('Bitte die Bezeichnung des Abfalls eintragen.');
  if (b.length > 200) f.push('Bezeichnung: höchstens 200 Zeichen.');
  return f.length || !s ? { ok: false, fehler: f } : { ok: true, schluessel: s };
}

// --- Container --------------------------------------------------------------------

export const CONTAINER_ARTEN = Object.freeze([
  { key: 'absetz', name: 'Absetzcontainer' },
  { key: 'abroll', name: 'Abrollcontainer' },
  { key: 'umleer', name: 'Umleerbehälter / Tonne' },
  { key: 'presse', name: 'Presscontainer' },
  { key: 'bigbag', name: 'Big Bag' },
  { key: 'sonstige', name: 'Sonstiger Behälter' },
] as const);
export function containerArtName(k: string | null | undefined): string {
  return CONTAINER_ARTEN.find((a) => a.key === k)?.name ?? String(k ?? '—');
}

export const CONTAINER_STATUS = Object.freeze([
  { key: 'lager', name: 'Auf dem Hof', stufe: 'ok' },
  { key: 'gestellt', name: 'Beim Kunden', stufe: 'info' },
  { key: 'voll', name: 'Voll gemeldet', stufe: 'warn' },
  { key: 'defekt', name: 'In Reparatur', stufe: 'dim' },
] as const);
export function containerStatusName(k: string | null | undefined): string {
  return CONTAINER_STATUS.find((a) => a.key === k)?.name ?? String(k ?? '—');
}
export function containerStatusStufe(k: string | null | undefined): string {
  return CONTAINER_STATUS.find((a) => a.key === k)?.stufe ?? 'dim';
}

export type Container = {
  id: string; nummer: string; art: string; groesse_m3: number | null; status: string;
  kontakt_id: string | null; kunde_name: string | null; stellplatz: string | null; gestellt_seit: string | null;
  notiz: string | null; aktiv: boolean;
};

export type ContainerEingabe = { nummer: string; art: string; groesse_m3: string };
export function containerPruefen(e: ContainerEingabe, vorhandeneNummern: readonly string[] = []): { ok: true; groesse: number | null } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  const n = String(e.nummer ?? '').trim();
  if (!n) f.push('Bitte eine Nummer für den Container eintragen (z. B. A-07).');
  if (n.length > 30) f.push('Nummer: höchstens 30 Zeichen.');
  if (n && vorhandeneNummern.some((x) => x.trim().toLowerCase() === n.toLowerCase())) f.push(`Die Nummer ${n} ist schon vergeben.`);
  if (!CONTAINER_ARTEN.some((a) => a.key === e.art)) f.push('Bitte die Art wählen.');
  const g = groesseLesen(e.groesse_m3);
  if (g === undefined) f.push('Größe: eine Zahl über 0 bis 100 m³ (z. B. 7 oder 7,5) — oder leer lassen.');
  return f.length ? { ok: false, fehler: f } : { ok: true, groesse: g ?? null };
}
/** „7", „7,5", „7.5" → 7 / 7.5; leer → null; ungültig → undefined. Eine Nachkommastelle wie die Datenbank. */
export function groesseLesen(roh: string | null | undefined): number | null | undefined {
  if (!String(roh ?? '').trim()) return null;
  const z = leseZahl(roh);
  if (z === null || !Number.isFinite(z) || Math.round(z * 10) !== z * 10) return undefined;
  return z > 0 && z <= 100 ? z : undefined;
}
export function groesseText(m3: number | null | undefined): string {
  if (m3 == null) return '';
  return `${String(m3).replace('.', ',')} m³`;
}
export function containerName(c: Pick<Container, 'nummer' | 'art' | 'groesse_m3'> | null | undefined): string {
  if (!c) return '—';
  return [c.nummer, containerArtName(c.art), groesseText(c.groesse_m3)].filter(Boolean).join(' · ');
}

/** Tage, die ein Container beim Kunden steht (Berliner Tage, Stelltag = Tag 0). */
export function standzeitTage(seit: string | null | undefined, heute: string): number | null {
  if (!seit || !/^\d{4}-\d{2}-\d{2}$/.test(seit) || !/^\d{4}-\d{2}-\d{2}$/.test(heute)) return null;
  const t = Math.round((new Date(heute + 'T12:00:00Z').getTime() - new Date(seit + 'T12:00:00Z').getTime()) / 86400000);
  return t >= 0 ? t : null;
}

// --- Aufträge ---------------------------------------------------------------------

export const AUFTRAG_ARTEN = Object.freeze([
  { key: 'stellen', name: 'Stellen', zeichen: '⬇️' },
  { key: 'tauschen', name: 'Tauschen', zeichen: '🔁' },
  { key: 'abholen', name: 'Abholen', zeichen: '⬆️' },
] as const);
export type AuftragArt = (typeof AUFTRAG_ARTEN)[number]['key'];
export function auftragArtName(k: string | null | undefined): string {
  return AUFTRAG_ARTEN.find((a) => a.key === k)?.name ?? String(k ?? '—');
}
/** Braucht diese Art einen Container vom Hof (neu) bzw. einen beim Kunden (alt)? */
export function braucht(art: string): { neu: boolean; alt: boolean } {
  return { neu: art === 'stellen' || art === 'tauschen', alt: art === 'tauschen' || art === 'abholen' };
}

export type Auftrag = {
  id: string; art: string; termin: string; zeitfenster: string | null; kontakt_id: string | null; kunde_name: string; stellplatz: string;
  telefon: string | null; container_id: string | null; container_alt_id: string | null; groesse_m3: number | null;
  abfall_schluessel_id: string | null; fahrer: string | null; status: string; erledigt_am: string | null; notiz: string | null;
};

export type AuftragEingabe = { art: string; termin: string; kunde_name: string; stellplatz: string; container_id?: string | null; container_alt_id?: string | null };

/** Prüfung beim Planen — Container dürfen noch fehlen (werden spätestens beim Erledigen gebraucht). */
export function auftragPruefen(e: AuftragEingabe): { ok: true } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  if (!AUFTRAG_ARTEN.some((a) => a.key === e.art)) f.push('Bitte wählen: Stellen, Tauschen oder Abholen.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.termin ?? ''))) f.push('Bitte einen Termin wählen.');
  const k = String(e.kunde_name ?? '').trim();
  if (!k) f.push('Bitte den Kunden eintragen.');
  if (k.length > 120) f.push('Kunde: höchstens 120 Zeichen.');
  const p = String(e.stellplatz ?? '').trim();
  if (!p) f.push('Bitte den Stellplatz eintragen (Adresse, ggf. „Einfahrt links").');
  if (p.length > 300) f.push('Stellplatz: höchstens 300 Zeichen.');
  const b = braucht(e.art);
  if (!b.neu && e.container_id) f.push('Beim Abholen wird kein Container gestellt.');
  if (!b.alt && e.container_alt_id) f.push('Beim Stellen wird kein Container abgeholt.');
  if (e.container_id && e.container_id === e.container_alt_id) f.push('Gestellter und abgeholter Container müssen verschieden sein.');
  return f.length ? { ok: false, fehler: f } : { ok: true };
}

/** Kann der Auftrag jetzt erledigt werden? Dieselben Regeln wie der Datenbank-Wächter. */
export function erledigenPruefen(a: Pick<Auftrag, 'art' | 'status' | 'container_id' | 'container_alt_id'>, container: readonly Container[]): { ok: true } | { ok: false; fehler: string } {
  if (a.status !== 'geplant') return { ok: false, fehler: 'Der Auftrag ist schon erledigt oder storniert.' };
  const b = braucht(a.art);
  const finde = (id: string | null) => (id ? container.find((c) => c.id === id) ?? null : null);
  if (b.neu) {
    const c = finde(a.container_id);
    if (!c) return { ok: false, fehler: 'Welcher Container wird gestellt? Bitte einen Container vom Hof wählen.' };
    if (c.status !== 'lager') return { ok: false, fehler: `Container ${c.nummer} steht nicht auf dem Hof (${containerStatusName(c.status)}).` };
  }
  if (b.alt) {
    const c = finde(a.container_alt_id);
    if (!c) return { ok: false, fehler: 'Welcher Container wird abgeholt? Bitte den Container beim Kunden wählen.' };
    if (c.status !== 'gestellt' && c.status !== 'voll') return { ok: false, fehler: `Container ${c.nummer} steht laut ARGONAUT nicht beim Kunden.` };
  }
  return { ok: true };
}

/**
 * Wie sieht der Bestand nach dem Erledigen aus? (Vorschau — die Datenbank macht
 * es genauso: alter Container zurück auf den Hof, neuer zum Kunden.)
 */
export function nachErledigung(a: Pick<Auftrag, 'art' | 'container_id' | 'container_alt_id' | 'kontakt_id' | 'kunde_name' | 'stellplatz'>, container: readonly Container[], heute: string): Container[] {
  const b = braucht(a.art);
  return container.map((c) => {
    if (b.alt && c.id === a.container_alt_id) return { ...c, status: 'lager', kontakt_id: null, kunde_name: null, stellplatz: null, gestellt_seit: null };
    if (b.neu && c.id === a.container_id) return { ...c, status: 'gestellt', kontakt_id: a.kontakt_id, kunde_name: a.kunde_name, stellplatz: a.stellplatz, gestellt_seit: heute };
    return c;
  });
}

const ART_REIHE: Record<string, number> = { abholen: 0, tauschen: 1, stellen: 2 };
/** Aufträge eines Tages: geplante zuerst, dann nach Zeitfenster, Art und Kunde. */
export function tagesListe(auftraege: readonly Auftrag[], tag: string): Auftrag[] {
  return auftraege.filter((a) => a.termin === tag && a.status !== 'storniert').slice().sort((x, y) =>
    (x.status === 'geplant' ? 0 : 1) - (y.status === 'geplant' ? 0 : 1)
    || (x.zeitfenster ? 0 : 1) - (y.zeitfenster ? 0 : 1)
    || String(x.zeitfenster ?? '').localeCompare(String(y.zeitfenster ?? ''), 'de', { numeric: true })
    || (ART_REIHE[x.art] ?? 9) - (ART_REIHE[y.art] ?? 9)
    || x.kunde_name.localeCompare(y.kunde_name, 'de'));
}

// --- Wiegeschein ------------------------------------------------------------------

export const GEWICHT_MAX = 200000;

/** „12.340", „12340", „12 340 kg" → 12340; leer → null; ungültig → undefined. Ganze Kilogramm wie die Datenbank. */
export function kgLesen(roh: string | null | undefined): number | null | undefined {
  const t = String(roh ?? '').trim().replace(/\s*kg$/i, '');
  if (!t) return null;
  const z = leseZahl(t);
  if (z === null || !Number.isInteger(z)) return undefined;
  return z >= 0 && z <= GEWICHT_MAX ? z : undefined;
}
/** 12340 → „12.340 kg" (Punkt bei Tausendern). */
export function kgText(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  const v = Math.round(kg);
  return `${v < 0 ? '-' : ''}${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kg`;
}
/** 12340 → „12,340 t" (drei Nachkommastellen, ganzzahlig gerechnet). */
export function tonnenText(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  const v = Math.round(Math.abs(kg));
  const t = Math.floor(v / 1000);
  return `${kg < 0 ? '-' : ''}${String(t).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(v % 1000).padStart(3, '0')} t`;
}
/** Netto wie die Datenbank: Brutto − Tara, nur wenn beide da sind und Tara nicht schwerer ist. */
export function nettoKg(brutto: number | null | undefined, tara: number | null | undefined): number | null {
  if (brutto == null || tara == null) return null;
  return tara > brutto ? null : brutto - tara;
}
/** Kennzeichen wie die Datenbank: getrimmt, groß. */
export function kennzeichenNorm(k: string | null | undefined): string {
  return String(k ?? '').trim().toUpperCase();
}

export type WiegeEingabe = { kennzeichen: string; brutto: string; tara: string; abfall_schluessel_id: string | null; abschliessen: boolean };

export function wiegePruefen(e: WiegeEingabe): { ok: true; brutto: number | null; tara: number | null; netto: number | null } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  const k = kennzeichenNorm(e.kennzeichen);
  if (!k) f.push('Bitte das Kennzeichen eintragen.');
  if (k.length > 15) f.push('Kennzeichen: höchstens 15 Zeichen.');
  const b = kgLesen(e.brutto);
  const t = kgLesen(e.tara);
  if (b === undefined) f.push(`Brutto: ganze Kilogramm von 0 bis ${kgText(GEWICHT_MAX)}.`);
  if (t === undefined) f.push(`Tara: ganze Kilogramm von 0 bis ${kgText(GEWICHT_MAX)}.`);
  if (b != null && t != null && t > b) f.push('Tara (leer) ist schwerer als Brutto (voll) — bitte die Gewichte prüfen.');
  if (e.abschliessen) {
    if (b == null || t == null) f.push('Zum Abschließen fehlen Brutto und Tara.');
    if (!e.abfall_schluessel_id) f.push('Zum Abschließen fehlt der Abfallschlüssel.');
  }
  if (f.length) return { ok: false, fehler: f };
  return { ok: true, brutto: b ?? null, tara: t ?? null, netto: nettoKg(b ?? null, t ?? null) };
}

export type Wiegeschein = {
  id: string; nummer: string | null; richtung: string; kontakt_id: string | null; kunde_name: string | null; kennzeichen: string; fahrer: string | null;
  herkunft: string | null; container_id: string | null; auftrag_id: string | null; abfall_schluessel_id: string | null;
  abfall_schluessel: string | null; abfall_bezeichnung: string | null; gefaehrlich: boolean; waage: string | null;
  brutto_kg: number | null; brutto_am: string | null; tara_kg: number | null; tara_am: string | null; netto_kg: number | null;
  status: string; abgeschlossen_am: string | null; abgeschlossen_name: string | null; storno_grund: string | null; storniert_am: string | null;
  notiz: string | null; erstellt_am: string;
};

export function richtungName(r: string | null | undefined): string {
  return r === 'ausgang' ? 'Abgabe (Ausgang)' : 'Anlieferung (Eingang)';
}
export function wiegeStatusName(s: string | null | undefined): string {
  return s === 'offen' ? 'offen' : s === 'abgeschlossen' ? 'abgeschlossen' : s === 'storniert' ? 'storniert' : String(s ?? '—');
}

/** Kacheln oben: Container je Stand, Aufträge heute offen, Wiegescheine/Netto heute (ohne Storno). */
export function uebersicht(container: readonly Container[], auftraege: readonly Auftrag[], scheine: readonly Wiegeschein[], heute: string): {
  hof: number; kunde: number; voll: number; auftraegeHeute: number; ueberfaellig: number; scheineHeute: number; nettoHeute: number;
} {
  const aktiv = container.filter((c) => c.aktiv);
  const heuteScheine = scheine.filter((w) => w.status === 'abgeschlossen' && berlinTag(w.abgeschlossen_am) === heute);
  return {
    hof: aktiv.filter((c) => c.status === 'lager').length,
    kunde: aktiv.filter((c) => c.status === 'gestellt' || c.status === 'voll').length,
    voll: aktiv.filter((c) => c.status === 'voll').length,
    auftraegeHeute: auftraege.filter((a) => a.status === 'geplant' && a.termin === heute).length,
    ueberfaellig: auftraege.filter((a) => a.status === 'geplant' && a.termin < heute).length,
    scheineHeute: heuteScheine.length,
    nettoHeute: heuteScheine.reduce((s, w) => s + (w.netto_kg ?? 0), 0),
  };
}

// --- Druck ------------------------------------------------------------------------

const STIL = '<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:28px auto;color:#111;line-height:1.45;font-size:13px}'
  + '.kopf{font-size:12px;color:#444;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:16px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}'
  + 'table{width:100%;border-collapse:collapse;margin:6px 0}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:11.5px;color:#555;width:32%}'
  + '.zahl{text-align:right;font-variant-numeric:tabular-nums}.netto td{font-weight:700;font-size:15px;border-top:2px solid #111}'
  + '.klein{font-size:11px;color:#555}.rot{color:#b00020;font-weight:700}.stempel{border:3px solid #b00020;color:#b00020;font-weight:700;font-size:18px;padding:6px 12px;display:inline-block;margin:8px 0}'
  + '.entwurf{border-color:#a06000;color:#a06000}.unterschrift{display:flex;gap:40px;margin-top:46px}.unterschrift div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#555}'
  + '@media print{body{margin:12mm}}</style>';

function kopf(firma: Firmenkopf | null): string {
  if (!firma?.name) return '<div class="kopf">[Firmendaten fehlen — Einstellungen → Firmendaten]</div>';
  const z = [firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' '), firma.telefon, firma.email].filter((x) => x && String(x).trim());
  return `<div class="kopf"><b>${esc(firma.name)}</b><br>${z.map(esc).join(' · ')}</div>`;
}

/**
 * Wiegeschein zum Drucken/Mitgeben. Zeiten = Serverzeiten der Wägungen.
 * Offen = „ENTWURF", storniert = Stempel mit Grund. Die Gewichte stehen so da,
 * wie sie von der Waage übernommen wurden — ARGONAUT wiegt nicht selbst.
 */
export function wiegescheinHtml(w: Wiegeschein, container: Pick<Container, 'nummer' | 'art' | 'groesse_m3'> | null, firma: Firmenkopf | null): string {
  const t: string[] = [];
  t.push(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Wiegeschein ${esc(w.nummer ?? '')}</title>${STIL}</head><body>`);
  t.push(kopf(firma));
  t.push(`<h1>Wiegeschein Nr. ${esc(w.nummer ?? '—')}</h1>`);
  t.push(`<p class="klein">${esc(richtungName(w.richtung))} · angelegt am ${esc(zeitDe(w.erstellt_am))}. Alle Zeiten sind Serverzeiten (Berlin).</p>`);
  if (w.status === 'offen') t.push('<div class="stempel entwurf">ENTWURF – noch nicht abgeschlossen</div>');
  if (w.status === 'storniert') t.push(`<div class="stempel">STORNIERT</div><p><b>Grund:</b> ${esc(w.storno_grund ?? '')}${w.storniert_am ? ` · am ${esc(zeitDe(w.storniert_am))}` : ''}</p>`);
  const zeilen: [string, string][] = [
    ['Kunde', esc(w.kunde_name ?? '—')],
    ['Kennzeichen', `<b>${esc(w.kennzeichen)}</b>`],
    ['Fahrer', esc(w.fahrer ?? '—')],
    ['Herkunft / Anfallstelle', esc(w.herkunft ?? '—')],
    ['Container', container ? esc(containerName(container)) : '—'],
    ['Abfall', w.abfall_schluessel
      ? `<b>${esc(schluesselLesbar(w.abfall_schluessel))}</b> ${esc(w.abfall_bezeichnung ?? '')}${w.gefaehrlich ? ' <span class="rot">· gefährlicher Abfall</span>' : ''}`
      : '<span class="rot">[Abfallschlüssel fehlt]</span>'],
  ];
  t.push('<table><tbody>' + zeilen.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') + '</tbody></table>');
  t.push('<h2>Wägung</h2><table><thead><tr><th>Wägung</th><th>Zeit</th><th class="zahl">Gewicht</th></tr></thead><tbody>');
  t.push(`<tr><td>Brutto (voll)</td><td>${esc(w.brutto_am ? zeitDe(w.brutto_am) : '—')}</td><td class="zahl">${esc(kgText(w.brutto_kg))}</td></tr>`);
  t.push(`<tr><td>Tara (leer)</td><td>${esc(w.tara_am ? zeitDe(w.tara_am) : '—')}</td><td class="zahl">${esc(kgText(w.tara_kg))}</td></tr>`);
  t.push(`<tr class="netto"><td>Netto</td><td></td><td class="zahl">${esc(kgText(w.netto_kg))}<br><span class="klein">${esc(tonnenText(w.netto_kg))}</span></td></tr>`);
  t.push('</tbody></table>');
  t.push(`<p class="klein">Waage: ${esc(w.waage || '—')}. Die Gewichte wurden von dieser Waage übernommen.${w.abgeschlossen_am ? ` Abgeschlossen am ${esc(zeitDe(w.abgeschlossen_am))} von ${esc(w.abgeschlossen_name ?? '—')}.` : ''}</p>`);
  if (w.notiz) t.push(`<p class="klein">Bemerkung: ${esc(w.notiz)}</p>`);
  t.push('<div class="unterschrift"><div>Fahrer</div><div>Wägung / Annahme</div></div>');
  t.push('</body></html>');
  return t.join('');
}

/** Tagesliste für die Fahrer: alle Aufträge eines Tages mit Containern. */
export function tageslisteHtml(tag: string, auftraege: readonly Auftrag[], container: readonly Container[], firma: Firmenkopf | null): string {
  const liste = tagesListe(auftraege, tag);
  const nr = (id: string | null) => (id ? container.find((c) => c.id === id) ?? null : null);
  const t: string[] = [];
  t.push(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Tagesliste ${esc(datumDe(tag))}</title>${STIL}</head><body>`);
  t.push(kopf(firma));
  t.push(`<h1>Container-Aufträge · ${esc(datumDe(tag))}</h1><p class="klein">${liste.length} Aufträge</p>`);
  if (!liste.length) t.push('<p>Für diesen Tag sind keine Aufträge geplant.</p>');
  else {
    t.push('<table><thead><tr><th style="width:auto">Zeit</th><th style="width:auto">Art</th><th style="width:auto">Kunde / Stellplatz</th><th style="width:auto">Container</th><th style="width:auto">Erledigt</th></tr></thead><tbody>');
    for (const a of liste) {
      const neu = nr(a.container_id);
      const alt = nr(a.container_alt_id);
      const cont = [alt ? `ab: ${esc(alt.nummer)}` : '', neu ? `hin: ${esc(neu.nummer)}` : (braucht(a.art).neu ? `hin: ${a.groesse_m3 ? esc(groesseText(a.groesse_m3)) : 'noch offen'}` : '')].filter(Boolean).join('<br>');
      t.push(`<tr><td>${esc(a.zeitfenster ?? '')}</td><td>${esc(auftragArtName(a.art))}</td><td><b>${esc(a.kunde_name)}</b><br>${esc(a.stellplatz)}${a.telefon ? `<br>☎ ${esc(a.telefon)}` : ''}${a.notiz ? `<br><span class="klein">${esc(a.notiz)}</span>` : ''}</td>`
        + `<td>${cont || '—'}</td><td>${a.status === 'erledigt' ? '✓' : '☐'}</td></tr>`);
    }
    t.push('</tbody></table>');
  }
  t.push('</body></html>');
  return t.join('');
}
