// ============================================================================
// ARGONAUT OS · lib/betriebsanweisung.ts — Betriebsanweisungs-Entwurf (Paket 329 · G2b)
//
// Reine Logik, node-getestet (tests/betriebsanweisungP329.test.mjs).
//
// Aufbau nach TRGS 555 (§ 14 GefStoffV): Kopf (Betrieb, Arbeitsbereich,
// Tätigkeit, Stoff), dann 1 Gefahren für Mensch und Umwelt, 2 Schutzmaßnahmen
// und Verhaltensregeln, 3 Verhalten im Gefahrfall, 4 Erste Hilfe,
// 5 Sachgerechte Entsorgung.
//
// Ehrlich und ohne Mustertexte: ARGONAUT füllt nur vor, was schon da ist —
// Gefahren- und Sicherheitshinweise mit dem Wortlaut aus dem SDB (Paket 325),
// Piktogramme und Signalwort. Was fehlt, bleibt leer und muss der Betrieb
// schreiben. Freigeben darf nur die Geschäftsleitung, und erst nach der
// Abnahme durch den Anwalt (lib/startSperre „betriebsanweisung", R49). Bis
// dahin trägt der Druck „ENTWURF".
// ============================================================================

import { PIKTOGRAMME } from './qualitaet';

export const ABSCHNITTE = [
  { key: 'gefahren', nr: 1, titel: 'Gefahren für Mensch und Umwelt' },
  { key: 'schutz', nr: 2, titel: 'Schutzmaßnahmen und Verhaltensregeln' },
  { key: 'gefahrfall', nr: 3, titel: 'Verhalten im Gefahrfall' },
  { key: 'erstehilfe', nr: 4, titel: 'Erste Hilfe' },
  { key: 'entsorgung', nr: 5, titel: 'Sachgerechte Entsorgung' },
] as const;
export type AbschnittKey = (typeof ABSCHNITTE)[number]['key'];

export type Inhalt = {
  arbeitsbereich: string;
  taetigkeit: string;
  notruf: string;
  ersthelfer: string;
} & Record<AbschnittKey, string>;

export const LEER_INHALT: Inhalt = {
  arbeitsbereich: '', taetigkeit: '', notruf: '112', ersthelfer: '',
  gefahren: '', schutz: '', gefahrfall: '', erstehilfe: '', entsorgung: '',
};

export const MAX_FELD = 3000;

type Satz = { code: string; text: string };

/** Woher im Sicherheitsdatenblatt (REACH Anhang II) der Inhalt meist kommt. */
export const SDB_ABSCHNITT: Record<AbschnittKey, string> = {
  gefahren: '2', schutz: '7 und 8', gefahrfall: '5 und 6', erstehilfe: '4', entsorgung: '13',
};

/**
 * In welchen Abschnitt gehört ein P-Satz? Nach der Nummer des ersten Teils:
 * P1xx/P2xx Vorsorge und P4xx Lagerung -> Schutzmaßnahmen, P30x–P36x Erste
 * Hilfe, P37x–P39x Brand und Freisetzung -> Gefahrfall, P5xx -> Entsorgung.
 */
export function pAbschnitt(code: unknown): AbschnittKey | null {
  const m = /^P(\d)(\d)\d/.exec(String(code ?? '').toUpperCase().trim());
  if (!m) return null;
  const h = Number(m[1]);
  const z = Number(m[2]);
  if (h === 1 || h === 2 || h === 4) return 'schutz';
  if (h === 3) return z <= 6 ? 'erstehilfe' : 'gefahrfall';
  if (h === 5) return 'entsorgung';
  return null;
}

function zeile(s: Satz): string {
  const t = String(s.text ?? '').trim();
  return t ? `${s.code}: ${t}` : `${s.code}: (Wortlaut aus dem Sicherheitsdatenblatt ergänzen)`;
}

/** H-Codes aus dem freien Feld des Gefahrstoffverzeichnisses (ohne Wortlaut). */
function hCodes(text: unknown): string[] {
  const t = String(text ?? '').toUpperCase();
  return [...new Set((t.match(/\b(?:EUH\s?\d{3}[A-Z]?|H\s?\d{3}[A-Z]{0,2})\b/g) ?? []).map((h) => h.replace(/\s/g, '')))];
}

export type GefahrstoffKurz = {
  bezeichnung?: string | null; hersteller?: string | null; arbeitsbereiche?: string | null;
  h_saetze?: string | null; piktogramme?: string[] | null; signalwort?: string | null;
};
export type AngabenKurz = { h_saetze?: Satz[] | null; p_saetze?: Satz[] | null; piktogramme?: string[] | null; signalwort?: string | null; status?: string | null } | null;

/**
 * Entwurf aus dem Gefahrstoff und — wenn bestätigt — den Gefahr-Angaben des
 * verknüpften Artikels. Nur übernommene Inhalte, keine eigenen Sätze.
 */
export function entwurf(g: GefahrstoffKurz, angaben: AngabenKurz): { inhalt: Inhalt; piktogramme: string[]; signalwort: string | null; hinweise: string[] } {
  const hinweise: string[] = [];
  const inhalt: Inhalt = { ...LEER_INHALT, arbeitsbereich: String(g.arbeitsbereiche ?? '').trim().slice(0, 300) };
  const mitAngaben = !!angaben && angaben.status === 'bestaetigt';
  const h: Satz[] = mitAngaben && angaben!.h_saetze?.length
    ? angaben!.h_saetze!
    : hCodes(g.h_saetze).map((code) => ({ code, text: '' }));
  if (!mitAngaben) hinweise.push('Keine bestätigten Gefahr-Angaben am Artikel — Wortlaut der Sätze bitte aus dem Sicherheitsdatenblatt ergänzen (Shop → Gefahr-Angaben).');
  inhalt.gefahren = h.map(zeile).join('\n');
  const p: Satz[] = mitAngaben ? (angaben!.p_saetze ?? []) : [];
  for (const s of p) {
    const k = pAbschnitt(s.code);
    if (!k) continue;
    inhalt[k] = inhalt[k] ? inhalt[k] + '\n' + zeile(s) : zeile(s);
  }
  for (const a of ABSCHNITTE) if (!inhalt[a.key]) hinweise.push(`Abschnitt ${a.nr} „${a.titel}" ist leer — bitte aus Abschnitt ${SDB_ABSCHNITT[a.key]} des Sicherheitsdatenblatts und Ihrer Gefährdungsbeurteilung ergänzen.`);
  const pikto = [...new Set([...(mitAngaben ? angaben!.piktogramme ?? [] : []), ...(g.piktogramme ?? [])])]
    .filter((k) => PIKTOGRAMME.some((x) => x.key === k)).sort();
  const signal = (mitAngaben ? angaben!.signalwort : null) ?? g.signalwort ?? null;
  return { inhalt, piktogramme: pikto, signalwort: signal === 'Gefahr' || signal === 'Achtung' ? signal : null, hinweise };
}

/** Säubern: nur bekannte Felder, Text, begrenzt. */
export function saubererInhalt(roh: unknown): Inhalt {
  const o = (roh && typeof roh === 'object' && !Array.isArray(roh)) ? roh as Record<string, unknown> : {};
  const aus = { ...LEER_INHALT };
  for (const k of Object.keys(LEER_INHALT) as (keyof Inhalt)[]) {
    const v = o[k];
    aus[k] = typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, k === 'notruf' || k === 'ersthelfer' ? 200 : MAX_FELD) : '';
  }
  return aus;
}

/** Gründe gegen eine Freigabe (leer = freigabefähig). */
export function freigabeFehler(i: Inhalt): string[] {
  const f: string[] = [];
  if (!i.arbeitsbereich.trim()) f.push('Arbeitsbereich fehlt.');
  if (!i.taetigkeit.trim()) f.push('Tätigkeit fehlt.');
  for (const a of ABSCHNITTE) {
    if (!i[a.key].trim()) f.push(`Abschnitt ${a.nr} „${a.titel}" ist leer.`);
    else if (i[a.key].includes('(Wortlaut aus dem Sicherheitsdatenblatt ergänzen)')) f.push(`Abschnitt ${a.nr}: Wortlaut eines Satzes fehlt noch.`);
  }
  if (!i.notruf.trim()) f.push('Notruf fehlt.');
  return f;
}

function esc(t: unknown): string {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Druckblatt (A4, Rahmen und Balken in Orange-Rot nach TRGS 555). Ohne Freigabe
 * mit großem „ENTWURF" quer über die Seite.
 */
export function druckHtml(a: {
  firma: string; stoff: string; hersteller?: string | null; inhalt: Inhalt; piktogramme: string[]; signalwort: string | null;
  freigegeben: boolean; freigegebenAm?: string | null; version?: number | null;
}): string {
  const i = a.inhalt;
  const balken = (t: string) => `<div class="balken">${esc(t)}</div>`;
  const text = (t: string) => `<div class="text">${esc(t).replace(/\n/g, '<br>')}</div>`;
  const rauten = a.piktogramme.map((k) => {
    const p = PIKTOGRAMME.find((x) => x.key === k);
    return `<div class="raute"><svg viewBox="0 0 40 40"><rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)" fill="#fff" stroke="#d0021b" stroke-width="3"/><text x="20" y="23" text-anchor="middle" font-size="8" font-weight="700">${esc(k.replace('GHS', ''))}</text></svg><span>${esc(p?.label ?? k)}</span></div>`;
  }).join('');
  const abschnitte = ABSCHNITTE.map((s) => balken(`${s.nr}. ${s.titel}`) + (s.key === 'gefahren'
    ? `<div class="gefahren">${rauten ? `<div class="rauten">${rauten}</div>` : ''}<div>${a.signalwort ? `<div class="signal">${esc(a.signalwort)}</div>` : ''}${text(i.gefahren)}</div></div>`
    : s.key === 'gefahrfall'
      ? text(i.gefahrfall) + `<div class="notruf">Notruf: ${esc(i.notruf)}</div>`
      : s.key === 'erstehilfe'
        ? text(i.erstehilfe) + (i.ersthelfer.trim() ? `<div class="notruf">Ersthelfer: ${esc(i.ersthelfer)}</div>` : '')
        : text(i[s.key]))).join('');
  const stand = a.freigegeben
    ? `Freigegeben${a.freigegebenAm ? ' am ' + esc(a.freigegebenAm) : ''}${a.version ? ' · Version ' + esc(a.version) : ''}`
    : 'ENTWURF — nicht freigegeben';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Betriebsanweisung ${esc(a.stoff)}</title><style>
@page{size:A4;margin:10mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}
.blatt{border:6px solid #e8551e;padding:0;position:relative;min-height:270mm;display:flex;flex-direction:column;box-sizing:border-box}
.kopf{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 12px;border-bottom:3px solid #e8551e}
.kopf h1{margin:0;font-size:22px;letter-spacing:.04em}.kopf .klein{font-size:11px;color:#333}
.stoff{padding:8px 12px;font-size:18px;font-weight:700;text-align:center;border-bottom:3px solid #e8551e}
.balken{background:#e8551e;color:#fff;font-weight:700;padding:4px 12px;font-size:14px}
.text{padding:8px 12px;font-size:12.5px;line-height:1.45;min-height:18mm}
.gefahren{display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:start}
.rauten{display:grid;gap:6px;padding:8px 0 8px 12px}.raute{display:flex;align-items:center;gap:4px;font-size:10px}.raute svg{width:46px;height:46px}
.signal{padding:8px 12px 0;font-weight:800;font-size:16px;text-transform:uppercase;color:#b00016}
.notruf{padding:0 12px 8px;font-weight:700;font-size:13px}
.fuss{margin-top:auto;padding:6px 12px;font-size:10.5px;color:#333;border-top:3px solid #e8551e;display:flex;justify-content:space-between;gap:8px}
.entwurf{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.entwurf span{font-size:110px;font-weight:900;color:rgba(208,2,27,.13);transform:rotate(-35deg)}
</style></head><body><div class="blatt">
${a.freigegeben ? '' : '<div class="entwurf"><span>ENTWURF</span></div>'}
<div class="kopf"><div><h1>BETRIEBSANWEISUNG</h1><div class="klein">gemäß § 14 GefStoffV · ${esc(a.firma)}</div></div>
<div class="klein">Arbeitsbereich: <b>${esc(i.arbeitsbereich)}</b><br>Tätigkeit: <b>${esc(i.taetigkeit)}</b></div></div>
<div class="stoff">${esc(a.stoff)}${a.hersteller ? `<div class="klein" style="font-weight:400">${esc(a.hersteller)}</div>` : ''}</div>
${abschnitte}
<div class="fuss"><span>${stand}</span><span>Unterschrift Unternehmer/in: ____________________</span></div>
</div></body></html>`;
}
