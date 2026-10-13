// ============================================================================
// ARGONAUT OS · lib/abfallRegister.ts — Paket 356 (13.10.2026)
// A4c Fachpaket Entsorgung, Teil 2: Abfallregister (Nachweisbuch).
//
// Reine Logik (node-getestet in tests/entsorgungRegisterP356): Prüfung vor
// dem Speichern (dieselben Grenzen wie supabase-sql/p356-abfallregister-adr.sql),
// Eintrag aus einem abgeschlossenen Wiegeschein, offene Scheine ohne Eintrag,
// Summen je Abfallschlüssel, Druck und CSV für die Behörde.
//
// Grundsatz: Das Register wird nur angehängt. Korrektur = Storno mit Grund
// (Geschäftsleitung) und neuer Eintrag. ARGONAUT übermittelt nichts an das
// eANV bzw. die ZKS-Abfall — elektronische Nachweise führt der Betrieb dort.
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

import { berlinTag, datumDe, zeitDe, esc, schluesselLesbar, kgText, type Firmenkopf, type Wiegeschein } from './entsorgung';
import { leseZahl } from './zahlen';

export const RICHTUNGEN = Object.freeze([
  { key: 'annahme', name: 'Annahme' },
  { key: 'abgabe', name: 'Abgabe' },
  { key: 'befoerderung', name: 'Beförderung' },
] as const);
export function richtungName(k: string | null | undefined): string {
  return RICHTUNGEN.find((r) => r.key === k)?.name ?? String(k ?? '—');
}

export const EINHEITEN = Object.freeze([
  { key: 'kg', name: 'kg' },
  { key: 't', name: 't' },
  { key: 'm3', name: 'm³' },
  { key: 'stk', name: 'Stück' },
] as const);
export function einheitName(k: string | null | undefined): string {
  return EINHEITEN.find((e) => e.key === k)?.name ?? String(k ?? '');
}

/** Verwertungs- (R1–R13) bzw. Beseitigungsverfahren (D1–D15) — wie die Datenbank. Leer → null, ungültig → undefined. */
export function verfahrenLesen(roh: string | null | undefined): string | null | undefined {
  const t = String(roh ?? '').trim().toUpperCase().replace(/\s/g, '');
  if (!t) return null;
  return /^(R([1-9]|1[0-3])|D([1-9]|1[0-5]))$/.test(t) ? t : undefined;
}

/** Menge mit bis zu drei Nachkommastellen (deutsches Komma). Leer → null, ungültig → undefined. */
export function mengeLesen(roh: string | null | undefined): number | null | undefined {
  if (!String(roh ?? '').trim()) return null;
  const z = leseZahl(roh);
  if (z === null || !Number.isFinite(z) || z <= 0 || z > 100000000) return undefined;
  return Math.abs(z * 1000 - Math.round(z * 1000)) < 1e-6 ? z : undefined;
}
/** 4000 kg → „4.000 kg", 2,5 t → „2,5 t". */
export function mengeText(menge: number | null | undefined, einheit: string | null | undefined): string {
  if (menge == null || !Number.isFinite(menge)) return '—';
  const [ganz, rest] = String(Math.round(menge * 1000) / 1000).split('.');
  const g = ganz.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rest ? `${g},${rest}` : g} ${einheitName(einheit)}`;
}
/** Menge in kg (nur für kg und t), sonst null. */
export function inKg(menge: number, einheit: string): number | null {
  if (einheit === 'kg') return menge;
  if (einheit === 't') return Math.round(menge * 1000 * 1000) / 1000;
  return null;
}

export type BetriebNummern = { erzeuger_nr: string; befoerderer_nr: string; entsorger_nr: string };
/** modul_einstellung.modul für die Betriebsnummern. */
export const EINSTELLUNG_MODUL = 'entsorgung';
export function nummernLesen(einst: unknown): BetriebNummern {
  const e = einst && typeof einst === 'object' ? (einst as Record<string, unknown>) : {};
  const t = (x: unknown) => (typeof x === 'string' ? x.trim().toUpperCase().slice(0, 20) : '');
  return { erzeuger_nr: t(e.erzeuger_nr), befoerderer_nr: t(e.befoerderer_nr), entsorger_nr: t(e.entsorger_nr) };
}

export type RegisterEingabe = {
  datum: string; richtung: string; abfall_schluessel_id: string | null; menge: string; einheit: string;
  erzeuger?: string; erzeuger_nr?: string; befoerderer?: string; befoerderer_nr?: string; entsorger?: string; entsorger_nr?: string;
  nachweis_nr?: string; schein_nr?: string; verfahren?: string; kennzeichen?: string; notiz?: string;
};

/** Prüfung vor dem Speichern. `gefaehrlich` = gewählter Schlüssel mit Sternchen → Hinweise (keine Sperre). */
export function eintragPruefen(e: RegisterEingabe, heute: string, gefaehrlich = false): { ok: true; menge: number; verfahren: string | null; hinweise: string[] } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.datum ?? ''))) f.push('Bitte ein Datum wählen.');
  else if (e.datum > heute) f.push('Das Datum liegt in der Zukunft.');
  if (!RICHTUNGEN.some((r) => r.key === e.richtung)) f.push('Bitte wählen: Annahme, Abgabe oder Beförderung.');
  if (!e.abfall_schluessel_id) f.push('Bitte den Abfallschlüssel wählen.');
  const m = mengeLesen(e.menge);
  if (m == null) f.push('Bitte die Menge eintragen (über 0, höchstens drei Nachkommastellen).');
  if (!EINHEITEN.some((x) => x.key === e.einheit)) f.push('Bitte die Einheit wählen.');
  const v = verfahrenLesen(e.verfahren);
  if (v === undefined) f.push('Verfahren: R1 bis R13 (Verwertung) oder D1 bis D15 (Beseitigung) — oder leer lassen.');
  const lang: [string | undefined, number, string][] = [
    [e.erzeuger, 300, 'Erzeuger'], [e.befoerderer, 300, 'Beförderer'], [e.entsorger, 300, 'Entsorger'],
    [e.erzeuger_nr, 20, 'Erzeugernummer'], [e.befoerderer_nr, 20, 'Beförderernummer'], [e.entsorger_nr, 20, 'Entsorgernummer'],
    [e.nachweis_nr, 40, 'Nachweisnummer'], [e.schein_nr, 40, 'Begleit-/Übernahmeschein'], [e.kennzeichen, 15, 'Kennzeichen'], [e.notiz, 500, 'Bemerkung'],
  ];
  for (const [w, max, name] of lang) if (String(w ?? '').trim().length > max) f.push(`${name}: höchstens ${max} Zeichen.`);
  if (f.length || m == null) return { ok: false, fehler: f };
  const hinweise: string[] = [];
  if (gefaehrlich) {
    if (!String(e.nachweis_nr ?? '').trim()) hinweise.push('Gefährlicher Abfall: Nummer des Entsorgungs- bzw. Sammelentsorgungsnachweises fehlt.');
    if (!String(e.schein_nr ?? '').trim()) hinweise.push('Gefährlicher Abfall: Nummer des Begleit- bzw. Übernahmescheins fehlt.');
  }
  return { ok: true, menge: m, verfahren: v ?? null, hinweise };
}

export type RegisterEintrag = {
  id: string; datum: string; richtung: string; abfall_schluessel_id: string; abfall_schluessel: string | null; abfall_bezeichnung: string | null;
  gefaehrlich: boolean; menge: number; einheit: string; erzeuger: string | null; erzeuger_nr: string | null; befoerderer: string | null;
  befoerderer_nr: string | null; entsorger: string | null; entsorger_nr: string | null; nachweis_nr: string | null; schein_nr: string | null;
  verfahren: string | null; kennzeichen: string | null; wiegeschein_id: string | null; notiz: string | null; status: string;
  storno_grund: string | null; storniert_am: string | null; erfasst_am: string; erfasst_name: string | null;
};

/**
 * Vorbelegung aus einem abgeschlossenen Wiegeschein: Datum = Abschlusstag
 * (Berlin), Menge = Netto in kg, Annahme bei Eingang, Abgabe bei Ausgang.
 * Bei der Annahme ist der Kunde der Erzeuger und der eigene Betrieb der
 * Entsorger; bei der Abgabe umgekehrt.
 */
export function ausWiegeschein(w: Pick<Wiegeschein, 'richtung' | 'abgeschlossen_am' | 'netto_kg' | 'abfall_schluessel_id' | 'kunde_name' | 'kennzeichen' | 'herkunft'>, nummern: BetriebNummern, firmaName: string | null): RegisterEingabe {
  const annahme = w.richtung !== 'ausgang';
  const kunde = [w.kunde_name, w.herkunft].map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
  return {
    datum: berlinTag(w.abgeschlossen_am), richtung: annahme ? 'annahme' : 'abgabe', abfall_schluessel_id: w.abfall_schluessel_id,
    menge: w.netto_kg != null ? String(w.netto_kg) : '', einheit: 'kg', kennzeichen: w.kennzeichen,
    erzeuger: annahme ? kunde : (firmaName ?? ''), erzeuger_nr: annahme ? '' : nummern.erzeuger_nr,
    entsorger: annahme ? (firmaName ?? '') : kunde, entsorger_nr: annahme ? nummern.entsorger_nr : '',
    befoerderer: '', befoerderer_nr: '', nachweis_nr: '', schein_nr: '', verfahren: '', notiz: '',
  };
}

/** Abgeschlossene Wiegescheine (mit Netto), zu denen es noch keinen gültigen Registereintrag gibt. */
export function offeneScheine<W extends Pick<Wiegeschein, 'id' | 'status' | 'netto_kg'>>(scheine: readonly W[], eintraege: readonly Pick<RegisterEintrag, 'wiegeschein_id' | 'status'>[]): W[] {
  const belegt = new Set(eintraege.filter((e) => e.status === 'gueltig' && e.wiegeschein_id).map((e) => e.wiegeschein_id));
  return scheine.filter((w) => w.status === 'abgeschlossen' && w.netto_kg != null && !belegt.has(w.id));
}

export type Summe = { schluessel: string; bezeichnung: string; gefaehrlich: boolean; richtung: string; kg: number; sonst: { menge: number; einheit: string }[]; anzahl: number };

/** Summen je Abfallschlüssel und Richtung im Zeitraum (nur gültige). kg und t zusammen in kg, m³/Stück getrennt. */
export function summen(eintraege: readonly RegisterEintrag[], von: string, bis: string): Summe[] {
  const m = new Map<string, Summe>();
  for (const e of eintraege) {
    if (e.status !== 'gueltig' || e.datum < von || e.datum > bis) continue;
    const k = `${e.abfall_schluessel}|${e.richtung}`;
    const s = m.get(k) ?? { schluessel: e.abfall_schluessel ?? '', bezeichnung: e.abfall_bezeichnung ?? '', gefaehrlich: e.gefaehrlich, richtung: e.richtung, kg: 0, sonst: [], anzahl: 0 };
    const kg = inKg(Number(e.menge), e.einheit);
    if (kg != null) s.kg = Math.round((s.kg + kg) * 1000) / 1000;
    else {
      const x = s.sonst.find((y) => y.einheit === e.einheit);
      if (x) x.menge = Math.round((x.menge + Number(e.menge)) * 1000) / 1000; else s.sonst.push({ menge: Number(e.menge), einheit: e.einheit });
    }
    s.anzahl += 1;
    m.set(k, s);
  }
  return [...m.values()].sort((a, b) => a.schluessel.localeCompare(b.schluessel) || a.richtung.localeCompare(b.richtung));
}

// --- Ausgabe ----------------------------------------------------------------------

/** CSV-Zelle: Semikolon-sicher und gegen Formel-Einschleusung (=, +, -, @) geschützt. */
export function csvZelle(x: unknown): string {
  let t = String(x ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const CSV_KOPF = ['Datum', 'Richtung', 'Abfallschlüssel', 'Bezeichnung', 'gefährlich', 'Menge', 'Einheit', 'Erzeuger', 'Erzeugernummer', 'Beförderer', 'Beförderernummer',
  'Entsorger', 'Entsorgernummer', 'Nachweisnummer', 'Begleit-/Übernahmeschein', 'Verfahren', 'Kennzeichen', 'Status', 'Storno-Grund', 'erfasst am', 'erfasst von'];

/** Register als CSV (Semikolon, Komma als Dezimalzeichen, UTF-8 mit BOM für Excel). */
export function registerCsv(eintraege: readonly RegisterEintrag[]): string {
  const zeilen = eintraege.slice().sort((a, b) => a.datum.localeCompare(b.datum) || a.erfasst_am.localeCompare(b.erfasst_am)).map((e) => [
    datumDe(e.datum), richtungName(e.richtung), schluesselLesbar(e.abfall_schluessel), e.abfall_bezeichnung, e.gefaehrlich ? 'ja' : 'nein',
    String(e.menge).replace('.', ','), einheitName(e.einheit), e.erzeuger, e.erzeuger_nr, e.befoerderer, e.befoerderer_nr, e.entsorger, e.entsorger_nr,
    e.nachweis_nr, e.schein_nr, e.verfahren, e.kennzeichen, e.status === 'storniert' ? 'storniert' : 'gültig', e.storno_grund, zeitDe(e.erfasst_am), e.erfasst_name,
  ].map(csvZelle).join(';'));
  return '﻿' + [CSV_KOPF.map(csvZelle).join(';'), ...zeilen].join('\r\n') + '\r\n';
}

const STIL = '<style>body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111;line-height:1.4;font-size:11.5px}'
  + '.kopf{font-size:12px;color:#444;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:14px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}'
  + 'table{width:100%;border-collapse:collapse;margin:6px 0}th,td{text-align:left;padding:3px 5px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:10.5px;color:#555}'
  + '.zahl{text-align:right;white-space:nowrap}.klein{font-size:10.5px;color:#555}.rot{color:#b00020;font-weight:700}tr.storno td{color:#888;text-decoration:line-through}tr.storno td.grund{text-decoration:none}'
  + '@media print{body{margin:10mm}@page{size:A4 landscape}}</style>';

/** Register eines Zeitraums zum Drucken (Querformat), mit Summen je Schlüssel. Stornierte bleiben sichtbar (durchgestrichen, mit Grund). */
export function registerHtml(eintraege: readonly RegisterEintrag[], von: string, bis: string, firma: Firmenkopf | null, nummern: BetriebNummern, erstellt: string): string {
  const liste = eintraege.filter((e) => e.datum >= von && e.datum <= bis).slice().sort((a, b) => a.datum.localeCompare(b.datum) || a.erfasst_am.localeCompare(b.erfasst_am));
  const nr = [nummern.erzeuger_nr && `Erzeugernummer ${nummern.erzeuger_nr}`, nummern.befoerderer_nr && `Beförderernummer ${nummern.befoerderer_nr}`, nummern.entsorger_nr && `Entsorgernummer ${nummern.entsorger_nr}`].filter(Boolean).join(' · ');
  const t: string[] = [];
  t.push(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Abfallregister ${esc(datumDe(von))}–${esc(datumDe(bis))}</title>${STIL}</head><body>`);
  t.push(firma?.name ? `<div class="kopf"><b>${esc(firma.name)}</b><br>${esc([firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}${nr ? `<br>${esc(nr)}` : ''}</div>` : '<div class="kopf">[Firmendaten fehlen — Einstellungen → Firmendaten]</div>');
  t.push(`<h1>Abfallregister</h1><p class="klein">Zeitraum ${esc(datumDe(von))} bis ${esc(datumDe(bis))} · ${liste.length} Einträge · erstellt am ${esc(zeitDe(erstellt))}. Einträge werden nur angehängt; Stornos bleiben mit Grund sichtbar.</p>`);
  if (!liste.length) t.push('<p>Im Zeitraum keine Einträge.</p>');
  else {
    t.push('<table><thead><tr><th>Datum</th><th>Richtung</th><th>Abfall</th><th class="zahl">Menge</th><th>Erzeuger</th><th>Beförderer</th><th>Entsorger</th><th>Nachweis / Schein</th><th>Verf.</th><th>Erfasst</th></tr></thead><tbody>');
    for (const e of liste) {
      const p = (n: string | null, nr2: string | null) => `${esc(n ?? '—')}${nr2 ? `<br><span class="klein">${esc(nr2)}</span>` : ''}`;
      t.push(`<tr${e.status === 'storniert' ? ' class="storno"' : ''}><td>${esc(datumDe(e.datum))}</td><td>${esc(richtungName(e.richtung))}</td>`
        + `<td><b>${esc(schluesselLesbar(e.abfall_schluessel))}</b>${e.gefaehrlich ? ' <span class="rot">*</span>' : ''}<br>${esc(e.abfall_bezeichnung ?? '')}</td>`
        + `<td class="zahl">${esc(mengeText(Number(e.menge), e.einheit))}</td><td>${p(e.erzeuger, e.erzeuger_nr)}</td><td>${p(e.befoerderer, e.befoerderer_nr)}</td><td>${p(e.entsorger, e.entsorger_nr)}</td>`
        + `<td>${esc(e.nachweis_nr ?? '—')}<br>${esc(e.schein_nr ?? '')}</td><td>${esc(e.verfahren ?? '')}</td><td>${esc(zeitDe(e.erfasst_am))}<br><span class="klein">${esc(e.erfasst_name ?? '')}</span></td></tr>`);
      if (e.status === 'storniert') t.push(`<tr class="storno"><td></td><td colspan="9" class="grund klein rot">storniert${e.storniert_am ? ` am ${esc(zeitDe(e.storniert_am))}` : ''}: ${esc(e.storno_grund ?? '')}</td></tr>`);
    }
    t.push('</tbody></table>');
    const s = summen(liste, von, bis);
    if (s.length) {
      t.push('<h2>Summen je Abfallschlüssel (nur gültige Einträge)</h2><table><thead><tr><th>Abfall</th><th>Richtung</th><th class="zahl">Einträge</th><th class="zahl">Menge</th></tr></thead><tbody>');
      for (const x of s) {
        const teile = [x.kg ? kgText(x.kg) : '', ...x.sonst.map((y) => mengeText(y.menge, y.einheit))].filter(Boolean).join(' + ');
        t.push(`<tr><td><b>${esc(schluesselLesbar(x.schluessel))}</b> ${esc(x.bezeichnung)}</td><td>${esc(richtungName(x.richtung))}</td><td class="zahl">${x.anzahl}</td><td class="zahl">${esc(teile || '—')}</td></tr>`);
      }
      t.push('</tbody></table>');
    }
  }
  t.push('<p class="klein">Elektronische Nachweise (eANV) und Meldungen an Behörden führt der Betrieb selbst — ARGONAUT übermittelt nichts.</p>');
  t.push('</body></html>');
  return t.join('');
}
