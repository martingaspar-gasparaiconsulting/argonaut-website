// ============================================================================
// ARGONAUT OS · lib/adrPapier.ts — Paket 356 (13.10.2026)
// A4c Fachpaket Entsorgung, Teil 2: Beförderungspapier nach ADR 5.4.1 (Inland)
// und 1000-Punkte-Rechnung nach ADR 1.1.3.6.
//
// Reine Logik (node-getestet in tests/entsorgungRegisterP356): Positionen
// prüfen (dieselben Pflichtfelder wie supabase-sql/p356-abfallregister-adr.sql),
// die Zeile in der Reihenfolge von 5.4.1.1.1 bauen („UN 1203 BENZIN, 3, II,
// (D/E)"), Abfall („ABFALL" davor) und „UMWELTGEFÄHRDEND", Punkte je
// Beförderungskategorie, Druck.
//
// Grundsatz: Einstufung, Beförderungskategorie und Mengen trägt der Betrieb
// ein — ARGONAUT hat KEINE Gefahrgut-Datenbank und stuft nichts ein. Bis zur
// Freigabe (Start-Schalter „adrPapier", R58) druckt das Papier „ENTWURF".
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

import { datumDe, zeitDe, esc, type Firmenkopf, type Wiegeschein } from './entsorgung';
import { leseZahl } from './zahlen';

/** Gefahrzettelmuster je Klasse (Hauptgefahr). */
export const KLASSEN = Object.freeze([
  { key: '1.1', name: '1.1 Explosive Stoffe (Massenexplosion)' }, { key: '1.2', name: '1.2 Explosive Stoffe (Splitterwirkung)' },
  { key: '1.3', name: '1.3 Explosive Stoffe (Brand)' }, { key: '1.4', name: '1.4 Explosive Stoffe (geringe Gefahr)' },
  { key: '1.5', name: '1.5 Sehr unempfindliche Stoffe' }, { key: '1.6', name: '1.6 Extrem unempfindliche Gegenstände' },
  { key: '2.1', name: '2.1 Entzündbare Gase' }, { key: '2.2', name: '2.2 Nicht entzündbare, nicht giftige Gase' }, { key: '2.3', name: '2.3 Giftige Gase' },
  { key: '3', name: '3 Entzündbare flüssige Stoffe' },
  { key: '4.1', name: '4.1 Entzündbare feste Stoffe' }, { key: '4.2', name: '4.2 Selbstentzündliche Stoffe' }, { key: '4.3', name: '4.3 Mit Wasser entzündliche Gase' },
  { key: '5.1', name: '5.1 Entzündend (oxidierend) wirkende Stoffe' }, { key: '5.2', name: '5.2 Organische Peroxide' },
  { key: '6.1', name: '6.1 Giftige Stoffe' }, { key: '6.2', name: '6.2 Ansteckungsgefährliche Stoffe' },
  { key: '7', name: '7 Radioaktive Stoffe' }, { key: '8', name: '8 Ätzende Stoffe' }, { key: '9', name: '9 Verschiedene gefährliche Stoffe' },
] as const);
const KLASSE_RE = /^(1\.[1-6]|2\.[1-3]|3|4\.[1-3]|5\.[12]|6\.[12]|7|8|9)$/;
export const VERPACKUNGSGRUPPEN = ['', 'I', 'II', 'III'] as const;
export const TUNNELCODES = ['', 'B', 'B1000C', 'B/D', 'B/E', 'C', 'C5000D', 'C/D', 'C/E', 'D', 'D/E', 'E', '-'] as const;

/** Beförderungskategorien nach 1.1.3.6.3 mit Multiplikator für die Punkte (Kategorie 0: keine Freistellung möglich). */
export const KATEGORIEN = Object.freeze([
  { key: '0', faktor: null, name: '0 – keine Freistellung' },
  { key: '1', faktor: 50, name: '1 – Menge × 50' },
  { key: '2', faktor: 3, name: '2 – Menge × 3' },
  { key: '3', faktor: 1, name: '3 – Menge × 1' },
  { key: '4', faktor: 0, name: '4 – unbegrenzt (× 0)' },
] as const);
export const PUNKTE_GRENZE = 1000;

export type Position = {
  un_nr: string; benennung: string; klasse: string; nebengefahr?: string; vg?: string; tunnel?: string;
  versandstuecke: string; menge: string; kategorie?: string; menge_punkte?: number | null; abfall?: boolean; umwelt?: boolean;
};

/** „UN 1203", „un1203", „1203" → „1203"; sonst null. */
export function unLesen(roh: string | null | undefined): string | null {
  const t = String(roh ?? '').trim().toUpperCase().replace(/^UN\s*/, '');
  return /^\d{4}$/.test(t) ? t : null;
}

/** Nebengefahren „6.1", „(6.1, 8)" → „6.1, 8"; ungültige Klassen → undefined. */
export function nebengefahrLesen(roh: string | null | undefined): string | null | undefined {
  const t = String(roh ?? '').replace(/[()]/g, '').trim();
  if (!t) return null;
  const teile = t.split(/[,;\s]+/).filter(Boolean);
  return teile.every((x) => KLASSE_RE.test(x)) ? teile.join(', ') : undefined;
}

/** Menge für die Punkte (kg bzw. l laut 1.1.3.6.3). Leer → null, ungültig → undefined. */
export function punkteMengeLesen(roh: string | number | null | undefined): number | null | undefined {
  if (roh == null || String(roh).trim() === '') return null;
  const z = typeof roh === 'number' ? roh : leseZahl(roh);
  return z === null || !Number.isFinite(z) || z < 0 || z > 1000000 ? undefined : z;
}

/** Pflichtangaben einer Position — die Datenbank prüft UN-Nummer, Benennung, Klasse, Versandstücke, Menge genauso. */
export function positionPruefen(p: Position, nr: number): string[] {
  const f: string[] = [];
  const n = `Position ${nr}`;
  if (!unLesen(p.un_nr)) f.push(`${n}: UN-Nummer (4 Ziffern).`);
  if (!String(p.benennung ?? '').trim()) f.push(`${n}: offizielle Benennung.`);
  if (String(p.benennung ?? '').length > 300) f.push(`${n}: Benennung höchstens 300 Zeichen.`);
  if (!KLASSE_RE.test(String(p.klasse ?? ''))) f.push(`${n}: Klasse (Gefahrzettelmuster) wählen.`);
  if (nebengefahrLesen(p.nebengefahr) === undefined) f.push(`${n}: Nebengefahren nur als Klassen (z. B. 6.1 oder 6.1, 8).`);
  if (p.vg && !(VERPACKUNGSGRUPPEN as readonly string[]).includes(p.vg)) f.push(`${n}: Verpackungsgruppe I, II oder III.`);
  if (p.tunnel && !(TUNNELCODES as readonly string[]).includes(p.tunnel)) f.push(`${n}: Tunnelbeschränkungscode aus der Liste wählen.`);
  if (!String(p.versandstuecke ?? '').trim()) f.push(`${n}: Anzahl und Art der Versandstücke (z. B. 2 Big Bags).`);
  if (!String(p.menge ?? '').trim()) f.push(`${n}: Gesamtmenge mit Einheit (z. B. 800 kg).`);
  if (p.kategorie && !KATEGORIEN.some((k) => k.key === p.kategorie)) f.push(`${n}: Beförderungskategorie 0 bis 4.`);
  if (p.kategorie && p.kategorie !== '0' && p.kategorie !== '4' && punkteMengeLesen(p.menge_punkte ?? null) == null) f.push(`${n}: Menge für die Punkte (kg bzw. l) eintragen.`);
  return f;
}

/** Gefahrgut-Zeile in der Reihenfolge von ADR 5.4.1.1.1 a–d und k: „UN 1203 BENZIN, 3, II, (D/E)". */
export function positionZeile(p: Position): string {
  const un = unLesen(p.un_nr) ?? String(p.un_nr ?? '').trim();
  const neben = nebengefahrLesen(p.nebengefahr);
  const teile = [`${p.abfall ? 'ABFALL ' : ''}UN ${un} ${String(p.benennung ?? '').trim()}`, `${p.klasse}${neben ? ` (${neben})` : ''}`];
  if (p.vg) teile.push(p.vg);
  if (p.tunnel && p.tunnel !== '-') teile.push(`(${p.tunnel})`);
  if (p.umwelt) teile.push('UMWELTGEFÄHRDEND');
  return teile.join(', ');
}

export type Punkte = { jeKategorie: { kategorie: string; menge: number; punkte: number }[]; summe: number; kat0: boolean; ohneKategorie: number; freistellung: boolean };

/**
 * 1000-Punkte-Rechnung (1.1.3.6.4): Menge × Faktor je Kategorie, Summe.
 * Freistellung nur, wenn alle Positionen eine Kategorie haben, keine Kategorie 0
 * dabei ist und die Summe 1000 nicht übersteigt.
 */
export function punkteRechnen(pos: readonly Position[]): Punkte {
  const m = new Map<string, number>();
  let kat0 = false;
  let ohne = 0;
  for (const p of pos) {
    if (!p.kategorie) { ohne += 1; continue; }
    if (p.kategorie === '0') { kat0 = true; continue; }
    const menge = punkteMengeLesen(p.menge_punkte ?? null) ?? 0;
    m.set(p.kategorie, (m.get(p.kategorie) ?? 0) + menge);
  }
  const jeKategorie = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([kategorie, menge]) => {
    const f = KATEGORIEN.find((k) => k.key === kategorie)?.faktor ?? 0;
    return { kategorie, menge: Math.round(menge * 1000) / 1000, punkte: Math.round(menge * f * 1000) / 1000 };
  });
  const summe = Math.round(jeKategorie.reduce((s, k) => s + k.punkte, 0) * 1000) / 1000;
  return { jeKategorie, summe, kat0, ohneKategorie: ohne, freistellung: pos.length > 0 && !kat0 && ohne === 0 && summe <= PUNKTE_GRENZE };
}

export function zahlDe(n: number): string {
  const [g, r] = String(Math.round(n * 1000) / 1000).split('.');
  return `${g.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${r ? ',' + r : ''}`;
}

export type AdrPapier = {
  id: string; nummer: string | null; datum: string; absender: string; empfaenger: string; befoerderer: string | null; kennzeichen: string | null;
  wiegeschein_id: string | null; positionen: Position[]; hinweise: string | null; status: string; ausgestellt_am: string | null;
  ausgestellt_name: string | null; storno_grund: string | null; storniert_am: string | null; erstellt_am: string;
};

export type KopfEingabe = { datum: string; absender: string; empfaenger: string };
export function papierPruefen(k: KopfEingabe, pos: readonly Position[], ausstellen: boolean): string[] {
  const f: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(k.datum ?? ''))) f.push('Bitte das Datum der Beförderung wählen.');
  if (!String(k.absender ?? '').trim()) f.push('Bitte Name und Anschrift des Absenders eintragen.');
  if (!String(k.empfaenger ?? '').trim()) f.push('Bitte Name und Anschrift des Empfängers eintragen.');
  if (pos.length > 20) f.push('Höchstens 20 Positionen je Papier.');
  if (ausstellen) {
    if (!pos.length) f.push('Zum Ausstellen fehlt mindestens eine Gefahrgut-Position.');
    pos.forEach((p, i) => f.push(...positionPruefen(p, i + 1)));
  }
  return f;
}

/** Vorbelegung aus einem Wiegeschein (Abgabe): Empfänger = Kunde, Kennzeichen, eine Abfall-Position mit dem Netto. */
export function ausWiegeschein(w: Pick<Wiegeschein, 'id' | 'kunde_name' | 'kennzeichen' | 'netto_kg' | 'abfall_bezeichnung'>, absender: string, heute: string): { kopf: KopfEingabe & { kennzeichen: string; wiegeschein_id: string }; positionen: Position[] } {
  return {
    kopf: { datum: heute, absender, empfaenger: w.kunde_name ?? '', kennzeichen: w.kennzeichen, wiegeschein_id: w.id },
    positionen: [{ un_nr: '', benennung: '', klasse: '', versandstuecke: '', menge: w.netto_kg != null ? `${zahlDe(w.netto_kg)} kg` : '', abfall: true, umwelt: false, kategorie: '', menge_punkte: w.netto_kg ?? null }],
  };
}

const STIL = '<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:26px auto;color:#111;line-height:1.45;font-size:13px}'
  + '.kopf{font-size:12px;color:#444;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:14px}h1{font-size:19px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px}'
  + 'table{width:100%;border-collapse:collapse;margin:6px 0}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:11px;color:#555}'
  + '.zeile{font-weight:700;font-size:13.5px}.klein{font-size:11px;color:#555}.zwei{display:grid;grid-template-columns:1fr 1fr;gap:12px}.feld{border:1px solid #999;padding:8px;min-height:54px;white-space:pre-line}'
  + '.stempel{border:3px solid #b00020;color:#b00020;font-weight:700;font-size:17px;padding:6px 12px;display:inline-block;margin:8px 0}.entwurf{border-color:#a06000;color:#a06000}'
  + '.unterschrift{display:flex;gap:40px;margin-top:40px}.unterschrift div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#555}@media print{body{margin:12mm}}</style>';

/**
 * Beförderungspapier zum Drucken. `freigegeben` = Start-Schalter „adrPapier":
 * ohne Freigabe trägt jedes Papier „ENTWURF". Offene Papiere (Entwurf) immer.
 */
export function adrHtml(a: AdrPapier, firma: Firmenkopf | null, freigegeben: boolean): string {
  const pt = punkteRechnen(a.positionen);
  const t: string[] = [];
  t.push(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Beförderungspapier ${esc(a.nummer ?? '')}</title>${STIL}</head><body>`);
  t.push(firma?.name ? `<div class="kopf"><b>${esc(firma.name)}</b><br>${esc([firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' '), firma.telefon].filter(Boolean).join(' · '))}</div>` : '<div class="kopf">[Firmendaten fehlen — Einstellungen → Firmendaten]</div>');
  t.push(`<h1>Beförderungspapier nach ADR 5.4.1</h1><p class="klein">Nr. ${esc(a.nummer ?? '—')} · Beförderung am ${esc(datumDe(a.datum))}${a.kennzeichen ? ` · Fahrzeug ${esc(a.kennzeichen)}` : ''}</p>`);
  if (a.status === 'storniert') t.push(`<div class="stempel">STORNIERT</div><p><b>Grund:</b> ${esc(a.storno_grund ?? '')}</p>`);
  else if (!freigegeben || a.status !== 'ausgestellt') t.push('<div class="stempel entwurf">ENTWURF – nicht als Beförderungspapier verwenden</div>');
  t.push(`<div class="zwei"><div><div class="klein">Absender</div><div class="feld">${esc(a.absender)}</div></div><div><div class="klein">Empfänger</div><div class="feld">${esc(a.empfaenger)}</div></div></div>`);
  if (a.befoerderer) t.push(`<p class="klein">Beförderer: ${esc(a.befoerderer)}</p>`);
  t.push('<h2>Gefährliche Güter</h2><table><thead><tr><th>Bezeichnung</th><th>Versandstücke</th><th>Gesamtmenge</th><th>Kat.</th></tr></thead><tbody>');
  for (const p of a.positionen) {
    t.push(`<tr><td class="zeile">${esc(positionZeile(p))}</td><td>${esc(p.versandstuecke)}</td><td>${esc(p.menge)}</td><td>${esc(p.kategorie ?? '')}</td></tr>`);
  }
  if (!a.positionen.length) t.push('<tr><td colspan="4">Keine Positionen.</td></tr>');
  t.push('</tbody></table>');
  if (pt.jeKategorie.length || pt.kat0) {
    const je = pt.jeKategorie.map((k) => `Kategorie ${k.kategorie}: ${zahlDe(k.menge)} (${zahlDe(k.punkte)} Punkte)`).join(' · ');
    t.push(`<p class="klein">Gesamtmenge je Beförderungskategorie: ${esc(je || '—')}${pt.kat0 ? ' · Kategorie 0 enthalten' : ''}. Berechneter Wert nach ADR 1.1.3.6.4: <b>${esc(zahlDe(pt.summe))}</b> (Grenze ${esc(zahlDe(PUNKTE_GRENZE))}).</p>`);
  }
  if (a.hinweise) t.push(`<p>${esc(a.hinweise).replace(/\n/g, '<br>')}</p>`);
  if (a.ausgestellt_am) t.push(`<p class="klein">Ausgestellt am ${esc(zeitDe(a.ausgestellt_am))} von ${esc(a.ausgestellt_name ?? '—')}.</p>`);
  t.push('<div class="unterschrift"><div>Absender</div><div>Fahrzeugführer</div></div>');
  t.push('</body></html>');
  return t.join('');
}
