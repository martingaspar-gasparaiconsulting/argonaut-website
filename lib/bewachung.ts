// ============================================================================
// ARGONAUT OS · lib/bewachung.ts — Paket 353 (13.10.2026)
// A4b Fachpaket Bewachung, Teil 1: Wachbuch und Kontrollgänge.
//
// Reine Logik (node-getestet in tests/bewachungP353): Wachbuch-Arten,
// Code der QR-Kontrollpunkte lesen, Rundgang auswerten (welche Punkte fehlen),
// Prüfungen vor dem Speichern (dieselben Grenzen wie supabase-sql/
// p353-bewachung-wachbuch.sql), Druckansichten (QR-Aufkleber, Nachweis für
// den Auftraggeber).
//
// Grundsatz: Zeiten und Namen im Wachbuch und bei Scans setzt die DATENBANK
// (Serverzeit) — nichts hier erzeugt einen Zeitstempel, der gespeichert wird.
// Wachbuch und Scans werden nur angehängt; Korrekturen sind Nachträge.
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

import { qrMatrix } from './qr';

// --- Branchen ---------------------------------------------------------------------

/**
 * Bewachungsgewerbe (§ 34a GewO): Sicherheitsdienste, Wachdienst & Objektschutz,
 * Personen- & Objektschutz, Veranstaltungssicherheit & Ordnerdienst,
 * Werttransport & Geldlogistik. NICHT: Hausnotruf & Sicherheitstechnik,
 * IT-Sicherheit, Detekteien, Blitz-/Holz-/Sonnenschutz.
 */
export function bewachungZusatz(branche: string | null | undefined): boolean {
  const b = String(branche ?? '');
  return /sicherheitsdienst|wachdienst|objektschutz|34a|ordnerdienst|veranstaltungssicherheit|werttransport/i.test(b);
}
/** Module, die ein Bewachungsbetrieb zusätzlich bekommt: Wachbuch/Kontrollgänge und die Objekte (Objektzeiten). */
export const BEWACHUNG_MODULE = ['bewachung', 'objektzeiten'] as const;

// --- Wachbuch ---------------------------------------------------------------------

export const WACHBUCH_ARTEN = Object.freeze([
  { key: 'meldung', name: 'Meldung', stufe: 'info', zeichen: '📝' },
  { key: 'vorkommnis', name: 'Vorkommnis', stufe: 'warn', zeichen: '⚠️' },
  { key: 'uebergabe', name: 'Schichtübergabe', stufe: 'dim', zeichen: '🔁' },
  { key: 'schaden', name: 'Schaden', stufe: 'bad', zeichen: '🛠️' },
  { key: 'polizei', name: 'Polizei / Feuerwehr / Rettung', stufe: 'bad', zeichen: '🚨' },
  { key: 'nachtrag', name: 'Nachtrag', stufe: 'dim', zeichen: '✎' },
] as const);
export type WachbuchArt = (typeof WACHBUCH_ARTEN)[number]['key'];

export function istWachbuchArt(x: unknown): x is WachbuchArt {
  return WACHBUCH_ARTEN.some((a) => a.key === x);
}
export function artName(k: string | null | undefined): string {
  return WACHBUCH_ARTEN.find((a) => a.key === k)?.name ?? String(k ?? '—');
}
export function artStufe(k: string | null | undefined): string {
  return WACHBUCH_ARTEN.find((a) => a.key === k)?.stufe ?? 'dim';
}

export const TEXT_MAX = 4000;

export type EintragEingabe = { art: string; text: string; bezug_id?: string | null; ereignis_am?: string | null };

/**
 * Prüfung vor dem Speichern — dieselben Grenzen wie die Datenbank.
 * `jetztMs` = Uhrzeit des Geräts (nur für die Plausibilität, gespeichert wird die Serverzeit).
 */
export function eintragPruefen(e: EintragEingabe, jetztMs: number): { ok: true } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  if (!istWachbuchArt(e.art)) f.push('Bitte eine Art wählen.');
  const t = String(e.text ?? '').trim();
  if (!t) f.push('Bitte beschreiben, was war.');
  if (t.length > TEXT_MAX) f.push(`Text: höchstens ${TEXT_MAX} Zeichen.`);
  if (e.art === 'nachtrag' && !e.bezug_id) f.push('Ein Nachtrag bezieht sich auf einen Eintrag — bitte beim Eintrag „Nachtrag" wählen.');
  if (e.art !== 'nachtrag' && e.bezug_id) f.push('Nur ein Nachtrag bezieht sich auf einen Eintrag.');
  if (e.ereignis_am) {
    const ms = new Date(e.ereignis_am).getTime();
    if (Number.isNaN(ms)) f.push('Zeitpunkt des Ereignisses: bitte ein gültiges Datum mit Uhrzeit wählen.');
    else if (ms > jetztMs + 5 * 60 * 1000) f.push('Der Zeitpunkt des Ereignisses liegt in der Zukunft.');
  }
  return f.length ? { ok: false, fehler: f } : { ok: true };
}

export type Eintrag = {
  id: string; objekt_id: string; art: string; text: string; ereignis_am: string | null; bezug_id: string | null;
  rundgang_id?: string | null; erfasst_am: string; erfasst_name: string | null;
};

/** Nachträge je Eintrag (nach Erfassung sortiert) — damit die Korrektur direkt unter dem Original steht. */
export function nachtraegeJe(eintraege: readonly Eintrag[]): Map<string, Eintrag[]> {
  const m = new Map<string, Eintrag[]>();
  for (const e of eintraege) {
    if (e.art !== 'nachtrag' || !e.bezug_id) continue;
    const l = m.get(e.bezug_id) ?? [];
    l.push(e);
    m.set(e.bezug_id, l);
  }
  for (const l of m.values()) l.sort((a, b) => a.erfasst_am.localeCompare(b.erfasst_am));
  return m;
}

// --- Kontrollpunkte und QR-Code ---------------------------------------------------

/** Kennung im QR-Code: „ARGW-" + 10 Zeichen. Den Code vergibt die Datenbank. */
export const CODE_PRAEFIX = 'ARGW-';
export const CODE_LAENGE = 10;

/** QR-Inhalt eines Kontrollpunkts. */
export function qrInhalt(code: string): string {
  return CODE_PRAEFIX + code;
}

/**
 * Aus einem Scan oder einer Eingabe den Code lesen: Groß-/Kleinschreibung,
 * Leerzeichen und Bindestriche egal, mit oder ohne „ARGW-". Fremde QR-Codes
 * (Web-Adressen, Artikelnummern) ergeben null.
 */
export function codeLesen(roh: string | null | undefined): string | null {
  let t = String(roh ?? '').trim().toUpperCase();
  if (!t) return null;
  if (t.startsWith('ARGW')) t = t.slice(4);
  t = t.replace(/[\s\-_.]/g, '');
  return new RegExp(`^[0-9A-F]{${CODE_LAENGE}}$`).test(t) ? t : null;
}

/** Zum Abtippen lesbar: „A1B2C-3D4E5". */
export function codeLesbar(code: string): string {
  return code.length === CODE_LAENGE ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export type PunktEingabe = { name: string; hinweis?: string | null };

export function punktPruefen(p: PunktEingabe): { ok: true } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  const n = String(p.name ?? '').trim();
  if (!n) f.push('Bitte einen Namen für den Kontrollpunkt eintragen (z. B. „Tor Nord").');
  if (n.length > 120) f.push('Name: höchstens 120 Zeichen.');
  if (String(p.hinweis ?? '').trim().length > 300) f.push('Hinweis: höchstens 300 Zeichen.');
  return f.length ? { ok: false, fehler: f } : { ok: true };
}

export type Kontrollpunkt = { id: string; objekt_id: string; name: string; hinweis: string | null; code: string; position: number; aktiv: boolean };

/** Kontrollpunkt zu einem gelesenen Code finden — nur aktive, nur im gewählten Objekt. */
export function punktZumCode(
  punkte: readonly Kontrollpunkt[], code: string | null, objektId: string,
): { ok: true; punkt: Kontrollpunkt } | { ok: false; fehler: string } {
  if (!code) return { ok: false, fehler: 'Das ist kein ARGONAUT-Kontrollpunkt. Bitte den Aufkleber scannen oder den Code darunter eintippen.' };
  const p = punkte.find((x) => x.code === code);
  if (!p) return { ok: false, fehler: 'Diesen Kontrollpunkt kennt Ihr Betrieb nicht.' };
  if (p.objekt_id !== objektId) return { ok: false, fehler: `„${p.name}" gehört zu einem anderen Objekt.` };
  if (!p.aktiv) return { ok: false, fehler: `„${p.name}" ist ausgeblendet.` };
  return { ok: true, punkt: p };
}

// --- Rundgang ---------------------------------------------------------------------

export type Scan = { id?: string; kontrollpunkt_id: string; gescannt_am: string; art?: string; lat?: number | null; lon?: number | null };
export type Rundgang = { id: string; objekt_id: string; mitarbeiter_name: string | null; gestartet_am: string; beendet_am: string | null; status: string; notiz?: string | null };

export type Auswertung = {
  soll: number; erreicht: number; fehlend: string[]; doppelt: number; scans: number;
  dauerMin: number | null; vollstaendig: boolean; mitStandort: number;
};

/**
 * Was ein Rundgang abgedeckt hat. Soll = aktive Kontrollpunkte des Objekts
 * (ausgeblendete zählen nicht). Wiederholte Scans desselben Punkts zählen
 * einmal, werden aber als „doppelt" ausgewiesen.
 */
export function rundgangAuswerten(r: Pick<Rundgang, 'objekt_id' | 'gestartet_am' | 'beendet_am'>, punkte: readonly Kontrollpunkt[], scans: readonly Scan[], jetztMs?: number): Auswertung {
  const soll = punkte.filter((p) => p.objekt_id === r.objekt_id && p.aktiv).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
  const gesehen = new Set(scans.map((s) => s.kontrollpunkt_id));
  const fehlend = soll.filter((p) => !gesehen.has(p.id)).map((p) => p.name);
  const erreicht = soll.length - fehlend.length;
  const start = new Date(r.gestartet_am).getTime();
  const ende = r.beendet_am ? new Date(r.beendet_am).getTime() : jetztMs ?? NaN;
  const dauerMin = Number.isFinite(start) && Number.isFinite(ende) && ende >= start ? Math.round((ende - start) / 60000) : null;
  return {
    soll: soll.length, erreicht, fehlend, doppelt: scans.length - gesehen.size, scans: scans.length,
    dauerMin, vollstaendig: soll.length > 0 && fehlend.length === 0, mitStandort: scans.filter((s) => s.lat != null && s.lon != null).length,
  };
}

export function statusName(s: string | null | undefined): string {
  return s === 'laeuft' ? 'läuft' : s === 'beendet' ? 'beendet' : s === 'abgebrochen' ? 'abgebrochen' : String(s ?? '—');
}

export function dauerText(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** Kacheln oben auf der Seite. `heute` = Berliner Tag „JJJJ-MM-TT". */
export function uebersicht(rundgaenge: readonly Rundgang[], eintraege: readonly Eintrag[], heute: string): { laufend: number; heuteRundgaenge: number; heuteEintraege: number; vorkommnisse7: number } {
  const tag = (ts: string) => berlinTag(ts);
  const grenze = new Date(heute + 'T12:00:00Z');
  grenze.setUTCDate(grenze.getUTCDate() - 6);
  const ab = grenze.toISOString().slice(0, 10);
  return {
    laufend: rundgaenge.filter((r) => r.status === 'laeuft').length,
    heuteRundgaenge: rundgaenge.filter((r) => tag(r.gestartet_am) === heute).length,
    heuteEintraege: eintraege.filter((e) => tag(e.erfasst_am) === heute).length,
    vorkommnisse7: eintraege.filter((e) => ['vorkommnis', 'schaden', 'polizei'].includes(e.art) && tag(e.erfasst_am) >= ab && tag(e.erfasst_am) <= heute).length,
  };
}

// --- Zeit -------------------------------------------------------------------------

/** Berliner Kalendertag eines Zeitstempels („2026-10-13"). */
export function berlinTag(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
}
/** „13.10.2026, 14:30 Uhr" in Berliner Zeit. */
export function zeitDe(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) + ' Uhr';
}
/** „14:30" in Berliner Zeit. */
export function uhrDe(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(d);
}
/** „13.10.2026" aus „2026-10-13". */
export function datumDe(iso: string | null | undefined): string {
  const t = String(iso ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split('-').reverse().join('.') : '—';
}
/** Zeitraum prüfen (Nachweis): von ≤ bis, höchstens 92 Tage. */
export function zeitraumPruefen(von: string, bis: string): { ok: true } | { ok: false; fehler: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis)) return { ok: false, fehler: 'Bitte Von und Bis wählen.' };
  if (bis < von) return { ok: false, fehler: '„Bis" liegt vor „Von".' };
  const tage = (new Date(bis + 'T12:00:00Z').getTime() - new Date(von + 'T12:00:00Z').getTime()) / 86400000;
  if (tage > 92) return { ok: false, fehler: 'Höchstens drei Monate auf einmal.' };
  return { ok: true };
}

// --- Druck ------------------------------------------------------------------------

export function esc(x: unknown): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** QR-Code als SVG (schwarz auf weiß, mit Ruhezone). */
export function qrSvg(text: string): string {
  const m = qrMatrix(text);
  const n = m.length;
  const rand = 4;
  const g = n + rand * 2;
  let pfad = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) pfad += `M${c + rand} ${r + rand}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g} ${g}" shape-rendering="crispEdges"><rect width="${g}" height="${g}" fill="#fff"/><path d="${pfad}" fill="#000"/></svg>`;
}

export type Firmenkopf = { name: string | null; strasse: string | null; plz: string | null; ort: string | null; telefon: string | null; email: string | null };
export type ObjektDruck = { bezeichnung: string | null; adresse: string | null; kennung?: string | null };

const STIL = '<style>body{font-family:Arial,Helvetica,sans-serif;max-width:780px;margin:28px auto;color:#111;line-height:1.45;font-size:13px}'
  + '.kopf{font-size:12px;color:#444;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:16px}h1{font-size:19px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px}'
  + 'table{width:100%;border-collapse:collapse;margin:6px 0}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:11.5px;color:#555}'
  + '.klein{font-size:11px;color:#555}.rot{color:#b00020;font-weight:700}.nachtrag td{background:#f6f6f6;font-size:12px}'
  + '.etiketten{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.etikett{border:1px dashed #999;padding:10px;text-align:center;page-break-inside:avoid}'
  + '.etikett svg{width:150px;height:150px}.code{font-family:monospace;font-size:15px;letter-spacing:1px}'
  + '@media print{body{margin:10mm}.etikett{border-color:#ccc}}</style>';

function kopfHtml(firma: Firmenkopf | null): string {
  if (!firma?.name) return '<div class="kopf">[Firmendaten fehlen — Einstellungen → Firmendaten]</div>';
  const z = [firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' '), firma.telefon, firma.email].filter((x) => x && String(x).trim());
  return `<div class="kopf"><b>${esc(firma.name)}</b><br>${z.map(esc).join(' · ')}</div>`;
}
function objektName(o: ObjektDruck): string {
  return String(o.bezeichnung ?? '').trim() || 'Objekt';
}

/** Bogen mit QR-Aufklebern zum Ausdrucken (drei je Reihe). Nur aktive Punkte. */
export function etikettenHtml(objekt: ObjektDruck, punkte: readonly Kontrollpunkt[]): string {
  const aktiv = punkte.filter((p) => p.aktiv).slice().sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
  const teile: string[] = [];
  teile.push(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kontrollpunkte ${esc(objektName(objekt))}</title>${STIL}</head><body>`);
  teile.push(`<h1>Kontrollpunkte · ${esc(objektName(objekt))}</h1><p class="klein">Aufkleber ausschneiden und gut sichtbar, wettergeschützt anbringen. Ist ein Aufkleber unlesbar, wird der Code darunter eingetippt.</p>`);
  if (!aktiv.length) teile.push('<p>Für dieses Objekt sind noch keine aktiven Kontrollpunkte angelegt.</p>');
  else {
    teile.push('<div class="etiketten">');
    for (const p of aktiv) {
      teile.push(`<div class="etikett">${qrSvg(qrInhalt(p.code))}<div><b>${esc(p.name)}</b></div><div class="code">${esc(codeLesbar(p.code))}</div><div class="klein">${esc(objektName(objekt))}</div></div>`);
    }
    teile.push('</div>');
  }
  teile.push('</body></html>');
  return teile.join('');
}

export type NachweisDaten = {
  objekt: ObjektDruck; von: string; bis: string; erstellt: string;
  rundgaenge: readonly Rundgang[]; punkte: readonly Kontrollpunkt[]; scans: readonly (Scan & { rundgang_id: string })[]; eintraege: readonly Eintrag[];
  mitWachbuch: boolean;
};

/**
 * Nachweis für den Auftraggeber: Kontrollgänge im Zeitraum (wann, wer, welche
 * Punkte, was fehlte) und — wenn gewählt — das Wachbuch mit Nachträgen direkt
 * unter dem Original. Standortdaten stehen bewusst NICHT im Nachweis.
 */
export function nachweisHtml(d: NachweisDaten, firma: Firmenkopf | null): string {
  const imZeitraum = (ts: string) => { const t = berlinTag(ts); return t >= d.von && t <= d.bis; };
  const rg = d.rundgaenge.filter((r) => imZeitraum(r.gestartet_am)).slice().sort((a, b) => a.gestartet_am.localeCompare(b.gestartet_am));
  const name = (id: string) => d.punkte.find((p) => p.id === id)?.name ?? 'unbekannter Punkt';
  const teile: string[] = [];
  teile.push(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Nachweis ${esc(objektName(d.objekt))}</title>${STIL}</head><body>`);
  teile.push(kopfHtml(firma));
  teile.push(`<h1>Nachweis Bewachung · ${esc(objektName(d.objekt))}</h1>`);
  teile.push(`<p class="klein">${d.objekt.adresse ? esc(d.objekt.adresse) + ' · ' : ''}Zeitraum ${esc(datumDe(d.von))} bis ${esc(datumDe(d.bis))} · erstellt am ${esc(zeitDe(d.erstellt))}. Alle Zeiten sind Serverzeiten (Berlin).</p>`);
  teile.push(`<h2>Kontrollgänge (${rg.length})</h2>`);
  if (!rg.length) teile.push('<p>Im Zeitraum wurden keine Kontrollgänge erfasst.</p>');
  else {
    teile.push('<table><thead><tr><th>Beginn</th><th>Ende</th><th>Wachkraft</th><th>Punkte</th><th>Gescannt (Uhrzeit)</th><th>Nicht erreicht</th></tr></thead><tbody>');
    for (const r of rg) {
      const sc = d.scans.filter((s) => s.rundgang_id === r.id).slice().sort((a, b) => a.gescannt_am.localeCompare(b.gescannt_am));
      const a = rundgangAuswerten(r, d.punkte, sc);
      const liste = sc.map((s) => `${esc(uhrDe(s.gescannt_am))} ${esc(name(s.kontrollpunkt_id))}`).join('<br>') || '—';
      teile.push(`<tr><td>${esc(zeitDe(r.gestartet_am))}</td><td>${r.beendet_am ? esc(uhrDe(r.beendet_am)) : '—'}${r.status === 'abgebrochen' ? ' (abgebrochen)' : r.status === 'laeuft' ? ' (läuft)' : ''}</td>`
        + `<td>${esc(r.mitarbeiter_name ?? '—')}</td><td>${a.erreicht}/${a.soll}</td><td>${liste}</td>`
        + `<td>${a.fehlend.length ? `<span class="rot">${a.fehlend.map(esc).join(', ')}</span>` : '—'}</td></tr>`);
    }
    teile.push('</tbody></table>');
  }
  if (d.mitWachbuch) {
    const eig = d.eintraege.filter((e) => imZeitraum(e.erfasst_am));
    const haupt = eig.filter((e) => e.art !== 'nachtrag').slice().sort((a, b) => a.erfasst_am.localeCompare(b.erfasst_am));
    const nach = nachtraegeJe(d.eintraege);
    teile.push(`<h2>Wachbuch (${haupt.length})</h2>`);
    if (!haupt.length) teile.push('<p>Im Zeitraum keine Einträge.</p>');
    else {
      teile.push('<table><thead><tr><th>Erfasst</th><th>Art</th><th>Eintrag</th><th>Von</th></tr></thead><tbody>');
      for (const e of haupt) {
        const ereignis = e.ereignis_am ? `<div class="klein">Ereignis: ${esc(zeitDe(e.ereignis_am))}</div>` : '';
        teile.push(`<tr><td>${esc(zeitDe(e.erfasst_am))}</td><td>${esc(artName(e.art))}</td><td>${esc(e.text).replace(/\n/g, '<br>')}${ereignis}</td><td>${esc(e.erfasst_name ?? '—')}</td></tr>`);
        for (const n of nach.get(e.id) ?? []) {
          teile.push(`<tr class="nachtrag"><td>${esc(zeitDe(n.erfasst_am))}</td><td>Nachtrag</td><td>${esc(n.text).replace(/\n/g, '<br>')}</td><td>${esc(n.erfasst_name ?? '—')}</td></tr>`);
        }
      }
      teile.push('</tbody></table>');
    }
  }
  teile.push('<p class="klein" style="margin-top:24px">Wachbuch und Scans werden in ARGONAUT nur angehängt: Einträge lassen sich nicht ändern oder löschen, Korrekturen erscheinen als Nachtrag.</p>');
  teile.push('</body></html>');
  return teile.join('');
}
