// ARGONAUT OS · lib/herstellung.ts — Paket 363 (13.10.2026)
// A4e Fachpaket Lebensmittel-Herstellung: Herstellungsprotokoll (Sud, Milch,
// Mahlgang, Ansatz) mit Schritten, Messwerten, Rohstoff-Chargen, Ausbeute.
//
// Reine Logik (node-getestet in tests/herstellungP363). Dieselben Regeln wie
// supabase-sql/p363-herstellung.sql:
//   · Nummer JJJJ-NNN je Betrieb vergibt die Datenbank.
//   · Messwerte nur anhängen; nach dem Abschluss ist das Protokoll fest.
//   · Abschluss legt die Produkt-Charge (Quarantäne) mit Rückverfolgung an;
//     gesperrte Rohstoff-Chargen lehnt die Datenbank ab.
//   · Brauerei: Stammwürze in °P ist beim Abschluss Pflicht. ARGONAUT berechnet
//     KEINE Biersteuer — die Sud-Übersicht (hl je °P) ist nur eine Hilfe für die
//     eigene Anmeldung beim Zoll.
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

import { leseZahl } from './zahlen';

export const ARTEN = Object.freeze([
  { key: 'sud', name: 'Sud (Brauerei)', icon: '🍺', einheit: 'l' },
  { key: 'milch', name: 'Milchverarbeitung', icon: '🥛', einheit: 'l' },
  { key: 'mahlgang', name: 'Mahlgang (Mühle)', icon: '🌾', einheit: 'kg' },
  { key: 'ansatz', name: 'Ansatz / Herstellung allgemein', icon: '⚗️', einheit: 'kg' },
] as const);
export type Art = (typeof ARTEN)[number]['key'];
export function istArt(x: unknown): x is Art { return typeof x === 'string' && ARTEN.some((a) => a.key === x); }
export function artInfo(k: string | null | undefined) { return ARTEN.find((a) => a.key === k) ?? ARTEN[3]; }

export type Schritt = { schritt: string; groessen: { groesse: string; einheit: string }[] };
/** Vorlagen: typische Schritte und Messgrößen. Frei ergänzbar — nichts davon ist Pflicht. */
export const SCHRITTE: Record<Art, Schritt[]> = {
  sud: [
    { schritt: 'Einmaischen', groessen: [{ groesse: 'Temperatur', einheit: '°C' }, { groesse: 'Schüttung', einheit: 'kg' }, { groesse: 'Hauptguss', einheit: 'l' }] },
    { schritt: 'Rasten', groessen: [{ groesse: 'Temperatur', einheit: '°C' }, { groesse: 'Dauer', einheit: 'min' }] },
    { schritt: 'Abmaischen', groessen: [{ groesse: 'Temperatur', einheit: '°C' }, { groesse: 'Jodprobe', einheit: '' }] },
    { schritt: 'Läutern', groessen: [{ groesse: 'Vorderwürze', einheit: '°P' }, { groesse: 'Nachguss', einheit: 'l' }] },
    { schritt: 'Würzekochen', groessen: [{ groesse: 'Kochzeit', einheit: 'min' }, { groesse: 'Hopfengabe', einheit: 'g' }, { groesse: 'Ausschlagwürze', einheit: '°P' }] },
    { schritt: 'Whirlpool / Kühlen', groessen: [{ groesse: 'Anstelltemperatur', einheit: '°C' }, { groesse: 'Ausschlagmenge', einheit: 'l' }] },
    { schritt: 'Anstellen / Gärung', groessen: [{ groesse: 'Hefegabe', einheit: 'l' }, { groesse: 'Temperatur', einheit: '°C' }, { groesse: 'Extrakt', einheit: '°P' }, { groesse: 'pH', einheit: '' }] },
    { schritt: 'Lagerung / Reifung', groessen: [{ groesse: 'Temperatur', einheit: '°C' }, { groesse: 'Druck', einheit: 'bar' }] },
    { schritt: 'Abfüllung', groessen: [{ groesse: 'Menge', einheit: 'l' }] },
  ],
  milch: [
    { schritt: 'Annahme Rohmilch', groessen: [{ groesse: 'Menge', einheit: 'l' }, { groesse: 'Temperatur', einheit: '°C' }, { groesse: 'Hemmstofftest', einheit: '' }] },
    { schritt: 'Standardisieren', groessen: [{ groesse: 'Fettgehalt', einheit: '%' }] },
    { schritt: 'Erhitzen / Pasteurisieren', groessen: [{ groesse: 'Temperatur', einheit: '°C' }, { groesse: 'Heißhaltezeit', einheit: 's' }] },
    { schritt: 'Kühlen', groessen: [{ groesse: 'Temperatur', einheit: '°C' }] },
    { schritt: 'Abfüllen / Verarbeiten', groessen: [{ groesse: 'Menge', einheit: 'l' }, { groesse: 'pH', einheit: '' }] },
  ],
  mahlgang: [
    { schritt: 'Annahme Getreide', groessen: [{ groesse: 'Menge', einheit: 'kg' }, { groesse: 'Feuchte', einheit: '%' }, { groesse: 'Fallzahl', einheit: 's' }] },
    { schritt: 'Reinigung', groessen: [{ groesse: 'Abgang', einheit: 'kg' }] },
    { schritt: 'Netzen / Abstehen', groessen: [{ groesse: 'Wasserzugabe', einheit: 'l' }, { groesse: 'Dauer', einheit: 'h' }] },
    { schritt: 'Vermahlung', groessen: [{ groesse: 'Mehl', einheit: 'kg' }, { groesse: 'Kleie', einheit: 'kg' }, { groesse: 'Aschegehalt', einheit: '%' }] },
  ],
  ansatz: [
    { schritt: 'Einwiegen', groessen: [{ groesse: 'Menge', einheit: 'kg' }] },
    { schritt: 'Verarbeiten', groessen: [{ groesse: 'Temperatur', einheit: '°C' }, { groesse: 'Dauer', einheit: 'min' }] },
    { schritt: 'Abfüllen', groessen: [{ groesse: 'Menge', einheit: 'kg' }] },
  ],
};

/** Branchen, die das Herstellungsprotokoll zusätzlich bekommen (nach Namen wie im Katalog). */
export function herstellungZusatz(branche: string | null | undefined): boolean {
  return /brauerei|mälzerei|maelzerei|molkerei|milchverarbeitung|getreideverarbeitung|käserei|kaeserei|sektkellerei|ölmühle|oelmuehle|brennerei|destiller|kelterei|mosterei/i.test(String(branche ?? ''));
}
/** Module, die ein Herstellungsbetrieb zusätzlich bekommt (Rezeptur, Etiketten, Chargen, Lebensmittel/HACCP). */
export const HERSTELLUNG_MODULE = ['herstellung', 'rezeptur', 'etiketten', 'chargen', 'lebensmittel'] as const;

// --- Zahlen ---------------------------------------------------------------------
/** Zahl aus einem Eingabefeld (deutsch: 1.234,5) über lib/zahlen. */
export function zahlLesen(t: string | number | null | undefined): number | null {
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  const z = leseZahl(String(t ?? '').trim());
  return z == null || !Number.isFinite(z) ? null : z;
}

/** Ausbeute in Prozent (Ist zu Soll), eine Nachkommastelle. */
export function ausbeute(soll: number | null | undefined, ist: number | null | undefined): number | null {
  if (!soll || !ist || soll <= 0 || ist <= 0) return null;
  return Math.round((ist / soll) * 1000) / 10;
}

/** Menge in Hektoliter (für die Sud-Übersicht); andere Einheiten → null. */
export function inHektoliter(menge: number | null | undefined, einheit: string | null | undefined): number | null {
  if (menge == null || !Number.isFinite(menge)) return null;
  const e = String(einheit ?? '').trim().toLowerCase();
  if (e === 'hl') return menge;
  if (e === 'l') return Math.round((menge / 100) * 1000) / 1000;
  return null;
}

export type ProtokollRoh = {
  id: string; nummer?: string | null; art: string; bezeichnung: string; soll_menge?: number | string | null; ist_menge?: number | string | null;
  einheit?: string | null; stammwuerze_p?: number | string | null; status: string; begonnen_am?: string | null; beendet_am?: string | null;
  charge_nr?: string | null; mhd?: string | null; erfasst_name?: string | null; abgeschlossen_name?: string | null; storno_grund?: string | null; notiz?: string | null;
};
export type MessungRoh = { id?: string; schritt: string; groesse: string; wert: number | string | null; einheit?: string | null; bemerkung?: string | null; gemessen_am: string; erfasst_name?: string | null };
export type RohstoffRoh = { id?: string; bezeichnung: string; charge_nr?: string | null; menge?: number | string | null; einheit?: string | null };

function n(x: unknown): number | null { return typeof x === 'number' ? x : zahlLesen(x as string); }

/** Sud-Übersicht je Monat: Hektoliter je Stammwürze (abgeschlossene Sude). Nur Hilfe, keine Steuerberechnung. */
export function sudUebersicht(liste: readonly ProtokollRoh[], monat: string): { zeilen: { stammwuerze: number; hl: number; sude: number }[]; summeHl: number; ohneHl: number } {
  const m = new Map<number, { hl: number; sude: number }>();
  let ohne = 0;
  for (const p of liste) {
    if (p.art !== 'sud' || p.status !== 'abgeschlossen' || !String(p.beendet_am ?? '').startsWith(monat)) continue;
    const hl = inHektoliter(n(p.ist_menge), p.einheit);
    const sw = n(p.stammwuerze_p);
    if (hl == null || sw == null) { ohne++; continue; }
    const k = Math.round(sw * 10) / 10;
    const a = m.get(k) ?? { hl: 0, sude: 0 };
    a.hl = Math.round((a.hl + hl) * 1000) / 1000; a.sude++;
    m.set(k, a);
  }
  const zeilen = [...m.entries()].map(([stammwuerze, a]) => ({ stammwuerze, ...a })).sort((a, b) => a.stammwuerze - b.stammwuerze);
  return { zeilen, summeHl: Math.round(zeilen.reduce((s, z) => s + z.hl, 0) * 1000) / 1000, ohneHl: ohne };
}

// --- Prüfungen (wie die Datenbank) ------------------------------------------------
export function protokollPruefen(e: { art: string; bezeichnung: string; soll: string; einheit: string }): { fehler: string[]; soll: number | null } {
  const f: string[] = [];
  if (!istArt(e.art)) f.push('Bitte die Art wählen.');
  const b = e.bezeichnung.trim();
  if (!b) f.push('Bitte eine Bezeichnung angeben, z. B. „Pils Sud 14".');
  else if (b.length > 200) f.push('Die Bezeichnung darf höchstens 200 Zeichen haben.');
  let soll: number | null = null;
  if (e.soll.trim()) {
    soll = zahlLesen(e.soll);
    if (soll == null || soll <= 0) f.push('Die Soll-Menge muss eine Zahl größer als 0 sein.');
  }
  if (!e.einheit.trim() || e.einheit.trim().length > 20) f.push('Bitte eine Einheit angeben (z. B. l, hl, kg).');
  return { fehler: f, soll };
}

export function messungPruefen(e: { schritt: string; groesse: string; wert: string; bemerkung: string }, gemessenAm: string | null, jetzt: Date): { fehler: string[]; wert: number | null } {
  const f: string[] = [];
  if (!e.schritt.trim()) f.push('Bitte den Schritt angeben.');
  if (!e.groesse.trim()) f.push('Bitte angeben, was gemessen wurde.');
  let wert: number | null = null;
  if (e.wert.trim()) { wert = zahlLesen(e.wert); if (wert == null) f.push('Der Messwert muss eine Zahl sein (z. B. 62,5).'); }
  if (wert == null && !e.bemerkung.trim() && !f.length) f.push('Bitte einen Messwert oder eine Bemerkung eintragen.');
  if (gemessenAm && new Date(gemessenAm).getTime() > jetzt.getTime() + 5 * 60_000) f.push('Der Messzeitpunkt liegt in der Zukunft.');
  return { fehler: f, wert };
}

export function abschlussPruefen(art: string, e: { ist: string; charge: string; mhd: string; stammwuerze: string }, heute: string): { fehler: string[]; ist: number | null; stammwuerze: number | null } {
  const f: string[] = [];
  const ist = zahlLesen(e.ist);
  if (ist == null || ist <= 0) f.push('Bitte die Ist-Menge angeben.');
  if (!e.charge.trim()) f.push('Bitte eine Chargennummer angeben.');
  else if (e.charge.trim().length > 60) f.push('Die Chargennummer darf höchstens 60 Zeichen haben.');
  if (e.mhd && e.mhd < heute) f.push('Das MHD liegt in der Vergangenheit.');
  let sw: number | null = null;
  if (art === 'sud') {
    sw = zahlLesen(e.stammwuerze);
    if (sw == null || sw <= 0 || sw > 40) f.push('Bitte die Stammwürze in °P angeben (0 bis 40).');
  }
  return { fehler: f, ist, stammwuerze: sw };
}

/** Vorschlag für die Chargennummer: Kurzname + Protokollnummer, z. B. „PILS-2026-014". */
export function chargenVorschlag(p: Pick<ProtokollRoh, 'bezeichnung' | 'nummer'>): string {
  const kurz = p.bezeichnung.toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')[0]?.slice(0, 8) || 'CHARGE';
  return `${kurz}-${p.nummer ?? ''}`.replace(/-$/, '');
}

/** Messwerte nach Schritt gruppiert, in der Reihenfolge der Vorlage (fremde Schritte danach). */
export function nachSchritt(art: string, messungen: readonly MessungRoh[]): { schritt: string; werte: MessungRoh[] }[] {
  const reihe = (SCHRITTE[(istArt(art) ? art : 'ansatz') as Art]).map((s) => s.schritt);
  const m = new Map<string, MessungRoh[]>();
  for (const x of [...messungen].sort((a, b) => a.gemessen_am.localeCompare(b.gemessen_am))) {
    if (!m.has(x.schritt)) m.set(x.schritt, []);
    m.get(x.schritt)!.push(x);
  }
  const rang = (s: string) => { const i = reihe.indexOf(s); return i < 0 ? 999 : i; };
  return [...m.entries()].map(([schritt, werte]) => ({ schritt, werte })).sort((a, b) => rang(a.schritt) - rang(b.schritt));
}

// --- Druck --------------------------------------------------------------------------
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function zahlText(x: unknown, nachkomma = 2): string {
  const v = n(x);
  return v == null ? '—' : v.toLocaleString('de-DE', { maximumFractionDigits: nachkomma });
}
function zeit(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function protokollHtml(p: ProtokollRoh, messungen: readonly MessungRoh[], rohstoffe: readonly RohstoffRoh[], firma: string): string {
  const a = artInfo(p.art);
  const aus = ausbeute(n(p.soll_menge), n(p.ist_menge));
  const gruppen = nachSchritt(p.art, messungen);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Herstellungsprotokoll ${esc(p.nummer)}</title>
<style>body{font:12px/1.45 Helvetica,Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:8px 0 14px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f1f1}.r{text-align:right}.k{color:#555}.storno{color:#b00;font-weight:bold}h2{font-size:14px;margin:14px 0 4px}</style></head><body>
<div class="k">${esc(firma)}</div>
<h1>Herstellungsprotokoll ${esc(p.nummer)} · ${esc(a.name)}</h1>
${p.status === 'storniert' ? `<p class="storno">STORNIERT: ${esc(p.storno_grund)}</p>` : ''}
<table><tr><th>Bezeichnung</th><td>${esc(p.bezeichnung)}</td><th>Status</th><td>${esc(p.status)}</td></tr>
<tr><th>Begonnen</th><td>${zeit(p.begonnen_am)} (${esc(p.erfasst_name)})</td><th>Abgeschlossen</th><td>${zeit(p.beendet_am)}${p.abgeschlossen_name ? ` (${esc(p.abgeschlossen_name)})` : ''}</td></tr>
<tr><th>Soll-Menge</th><td>${zahlText(p.soll_menge)} ${esc(p.einheit)}</td><th>Ist-Menge</th><td>${zahlText(p.ist_menge)} ${esc(p.einheit)}${aus != null ? ` · Ausbeute ${zahlText(aus, 1)} %` : ''}</td></tr>
<tr><th>Charge</th><td>${esc(p.charge_nr ?? '—')}</td><th>MHD</th><td>${p.mhd ? esc(String(p.mhd).split('-').reverse().join('.')) : '—'}</td></tr>
${p.art === 'sud' ? `<tr><th>Stammwürze</th><td colspan="3">${zahlText(p.stammwuerze_p, 1)} °P</td></tr>` : ''}
</table>
<h2>Rohstoffe</h2>
<table><tr><th>Rohstoff</th><th>Charge</th><th class="r">Menge</th></tr>${rohstoffe.length ? rohstoffe.map((r) => `<tr><td>${esc(r.bezeichnung)}</td><td>${esc(r.charge_nr ?? '—')}</td><td class="r">${zahlText(r.menge, 3)} ${esc(r.einheit ?? '')}</td></tr>`).join('') : '<tr><td colspan="3">—</td></tr>'}</table>
<h2>Messwerte</h2>
<table><tr><th>Schritt</th><th>Größe</th><th class="r">Wert</th><th>Zeit</th><th>Bemerkung</th><th>Erfasst von</th></tr>
${gruppen.length ? gruppen.map((g) => g.werte.map((w, i) => `<tr><td>${i === 0 ? esc(g.schritt) : ''}</td><td>${esc(w.groesse)}</td><td class="r">${w.wert == null ? '—' : zahlText(w.wert, 3) + ' ' + esc(w.einheit ?? '')}</td><td>${zeit(w.gemessen_am)}</td><td>${esc(w.bemerkung ?? '')}</td><td>${esc(w.erfasst_name ?? '')}</td></tr>`).join('')).join('') : '<tr><td colspan="6">—</td></tr>'}
</table>
${p.notiz ? `<h2>Notiz</h2><p>${esc(p.notiz)}</p>` : ''}
<p class="k">Messwerte und Zeitpunkte werden beim Speichern vom Server festgehalten und lassen sich danach nicht mehr ändern.</p>
</body></html>`;
}
