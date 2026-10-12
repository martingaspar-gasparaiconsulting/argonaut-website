// ============================================================================
// ARGONAUT OS · lib/reifeTreppe.ts — Paket 341 (12.10.2026) · BV3a Manufaktur Teil 3
//
// Preis-Treppe nach Reife und Mindesthaltbarkeit (MHD) je Reife-Charge:
//   Reife-Stufen: ab Reifetag X gilt ein Aufschlag auf den Grundpreis der
//                 Kalkulation (z. B. Dry-Aged ab Tag 45 +15 %, ab Tag 60 +30 %).
//   MHD-Stufen:   ab X Tage vor dem MHD gilt ein Abschlag (z. B. 3 Tage vor
//                 MHD −30 %), wegen drohenden Ablaufs der Haltbarkeit.
//   Beides zusammen: erst die Reife-Stufe, dann der MHD-Abschlag darauf.
//
// Regeln:
//   - Grundpreis = der gewählte Verkaufspreis der Kalkulation (Paket 340,
//     brutto je Preis-Einheit). Ohne Grundpreis keine Treppe.
//   - Reifetage zählen bis heute bzw. bis zum Abschluss der Reifung — nach
//     dem Abschluss reift das Stück nicht weiter.
//   - MHD überschritten: KEIN automatischer Preis. Verkauf nach MHD nur nach
//     eigener Prüfung des Betriebs (das MHD ist kein Verbrauchsdatum, aber
//     die Entscheidung bleibt beim Betrieb).
//   - Alles, was beim Kunden ankommt (Preisschild, Streichpreis), steht hinter
//     dem Start-Schalter „reifePreisTreppe“ (Preisangabenverordnung, R51).
//   - Geld über lib/zahlen (centRunden).
//
// Reine Logik, keine React-/Supabase-Imports.
// ============================================================================

import { centRunden, rundeStellen } from './zahlen';
import { reifeTage, tagNr, plusTage } from './reife';

export type TreppenStufe = { ab_tag: number; aufschlag: number };
export type MhdStufe = { tage_vor: number; abschlag: number };

export const MAX_REIFE_STUFEN = 8;
export const MAX_MHD_STUFEN = 6;

const ganz = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
const proz = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

/** Gespeicherte Stufen lesen — Unbrauchbares fällt weg, sortiert. */
export function reifeStufenAus(roh: unknown): TreppenStufe[] {
  if (!Array.isArray(roh)) return [];
  return roh
    .filter((s): s is TreppenStufe => !!s && typeof s === 'object' && ganz((s as TreppenStufe).ab_tag, 1, 3650) && proz((s as TreppenStufe).aufschlag, 0, 300))
    .map((s) => ({ ab_tag: s.ab_tag, aufschlag: s.aufschlag }))
    .sort((a, b) => a.ab_tag - b.ab_tag)
    .slice(0, MAX_REIFE_STUFEN);
}
export function mhdStufenAus(roh: unknown): MhdStufe[] {
  if (!Array.isArray(roh)) return [];
  return roh
    .filter((s): s is MhdStufe => !!s && typeof s === 'object' && ganz((s as MhdStufe).tage_vor, 0, 365) && proz((s as MhdStufe).abschlag, 0, 90))
    .map((s) => ({ tage_vor: s.tage_vor, abschlag: s.abschlag }))
    .sort((a, b) => b.tage_vor - a.tage_vor)
    .slice(0, MAX_MHD_STUFEN);
}

/** Eingaben prüfen (Zahlen sind schon gelesen; null = Zeile leer). */
export function treppePruefen(
  reife: { ab_tag: number | null; aufschlag: number | null }[],
  mhd: { tage_vor: number | null; abschlag: number | null }[],
): { ok: true; reife: TreppenStufe[]; mhd: MhdStufe[] } | { ok: false; fehler: string } {
  const r: TreppenStufe[] = [];
  for (const z of reife) {
    if (z.ab_tag === null && z.aufschlag === null) continue;
    if (!ganz(z.ab_tag, 1, 3650)) return { ok: false, fehler: 'Reife-Stufe: „ab Tag“ bitte als ganze Zahl von 1 bis 3.650.' };
    if (!proz(z.aufschlag, 0, 300)) return { ok: false, fehler: 'Reife-Stufe: Aufschlag bitte zwischen 0 und 300 %.' };
    r.push({ ab_tag: z.ab_tag as number, aufschlag: rundeStellen(z.aufschlag as number, 2) });
  }
  const m: MhdStufe[] = [];
  for (const z of mhd) {
    if (z.tage_vor === null && z.abschlag === null) continue;
    if (!ganz(z.tage_vor, 0, 365)) return { ok: false, fehler: 'MHD-Stufe: „Tage vor MHD“ bitte als ganze Zahl von 0 bis 365.' };
    if (!proz(z.abschlag, 0, 90)) return { ok: false, fehler: 'MHD-Stufe: Abschlag bitte zwischen 0 und 90 %.' };
    m.push({ tage_vor: z.tage_vor as number, abschlag: rundeStellen(z.abschlag as number, 2) });
  }
  if (r.length > MAX_REIFE_STUFEN) return { ok: false, fehler: `Höchstens ${MAX_REIFE_STUFEN} Reife-Stufen.` };
  if (m.length > MAX_MHD_STUFEN) return { ok: false, fehler: `Höchstens ${MAX_MHD_STUFEN} MHD-Stufen.` };
  if (new Set(r.map((x) => x.ab_tag)).size !== r.length) return { ok: false, fehler: 'Zwei Reife-Stufen mit demselben Tag.' };
  if (new Set(m.map((x) => x.tage_vor)).size !== m.length) return { ok: false, fehler: 'Zwei MHD-Stufen mit demselben Abstand zum MHD.' };
  const rs = [...r].sort((a, b) => a.ab_tag - b.ab_tag);
  for (let i = 1; i < rs.length; i++) {
    if (rs[i].aufschlag < rs[i - 1].aufschlag) return { ok: false, fehler: 'Reife-Stufen: ein späterer Tag darf keinen kleineren Aufschlag haben.' };
  }
  const ms = [...m].sort((a, b) => b.tage_vor - a.tage_vor);
  for (let i = 1; i < ms.length; i++) {
    if (ms[i].abschlag < ms[i - 1].abschlag) return { ok: false, fehler: 'MHD-Stufen: näher am MHD darf der Abschlag nicht kleiner werden.' };
  }
  return { ok: true, reife: rs, mhd: ms };
}

/** Vorschlag je Art (nur Startwerte zum Überschreiben). */
export function treppeStartwerte(art: string): { reife: TreppenStufe[]; mhd: MhdStufe[] } {
  if (art === 'dry_aged') return { reife: [{ ab_tag: 45, aufschlag: 15 }, { ab_tag: 60, aufschlag: 30 }], mhd: [{ tage_vor: 3, abschlag: 20 }, { tage_vor: 1, abschlag: 40 }] };
  if (art === 'kaese') return { reife: [{ ab_tag: 180, aufschlag: 15 }, { ab_tag: 365, aufschlag: 35 }], mhd: [{ tage_vor: 5, abschlag: 20 }] };
  if (art === 'rohschinken') return { reife: [{ ab_tag: 365, aufschlag: 20 }], mhd: [{ tage_vor: 5, abschlag: 20 }] };
  if (art === 'rohwurst') return { reife: [{ ab_tag: 60, aufschlag: 10 }], mhd: [{ tage_vor: 5, abschlag: 20 }] };
  if (art === 'confiserie') return { reife: [], mhd: [{ tage_vor: 3, abschlag: 30 }] };
  return { reife: [], mhd: [] };
}

export type PreisHeute =
  | { ok: false; grund: string; abgelaufen?: boolean }
  | {
      ok: true;
      preis: number;              // brutto je Preis-Einheit, heute
      grundpreis: number;         // Grundpreis der Kalkulation
      reifePreis: number;         // nach Reife-Stufe, vor MHD-Abschlag
      reifeStufe: TreppenStufe | null;
      mhdStufe: MhdStufe | null;
      tage: number;               // Reifetage
      mhdRest: number | null;     // Tage bis MHD (0 = heute)
      reduziert: boolean;         // MHD-Abschlag aktiv
      text: string;
      naechste: { datum: string; preis: number; text: string } | null;
    };

/**
 * Preis heute nach Treppe.
 * c: Charge (Start, Status, Ende, MHD); grund: Verkaufspreis brutto aus der Kalkulation.
 */
export function preisHeute(
  c: { start_datum: string; status?: string | null; end_datum?: string | null; mhd?: string | null },
  grund: number | null | undefined,
  reife: TreppenStufe[],
  mhd: MhdStufe[],
  heute: string,
): PreisHeute {
  if (c.status === 'verworfen') return { ok: false, grund: 'Charge verworfen.' };
  if (grund === null || grund === undefined || !(grund > 0)) return { ok: false, grund: 'Erst in der Kalkulation Ihren Verkaufspreis eintragen — er ist der Grundpreis der Treppe.' };
  const fertig = c.status === 'abgeschlossen' && !!c.end_datum;
  const bis = fertig ? (c.end_datum as string) : heute;
  const tage = reifeTage(c.start_datum, bis);
  if (tage === null) return { ok: false, grund: 'Die Reifung hat noch nicht begonnen.' };
  const mhdNr = c.mhd ? tagNr(c.mhd) : null;
  const h = tagNr(heute);
  const mhdRest = mhdNr !== null && h !== null ? mhdNr - h : null;
  if (mhdRest !== null && mhdRest < 0) {
    return { ok: false, abgelaufen: true, grund: `MHD seit ${-mhdRest} ${mhdRest === -1 ? 'Tag' : 'Tagen'} überschritten — kein automatischer Preis. Verkauf nur nach Ihrer eigenen Prüfung.` };
  }
  const rs = reifeStufenAus(reife);
  const ms = mhdStufenAus(mhd);
  const reifeStufe = [...rs].reverse().find((s) => tage >= s.ab_tag) ?? null;
  const reifePreis = centRunden(grund * (1 + (reifeStufe?.aufschlag ?? 0) / 100));
  const passend = mhdRest === null ? [] : ms.filter((s) => mhdRest <= s.tage_vor);
  const mhdStufe = passend.length ? passend.reduce((a, b) => (b.abschlag > a.abschlag ? b : a)) : null;
  const preis = centRunden(reifePreis * (1 - (mhdStufe?.abschlag ?? 0) / 100));
  const teile: string[] = [];
  teile.push(reifeStufe ? `ab Reifetag ${reifeStufe.ab_tag}: +${zahlText(reifeStufe.aufschlag)} %` : 'Grundpreis');
  if (mhdStufe) teile.push(`${mhdRest === 0 ? 'MHD heute' : `${mhdRest} ${mhdRest === 1 ? 'Tag' : 'Tage'} vor MHD`}: −${zahlText(mhdStufe.abschlag)} %`);

  // Nächste Änderung: nächste Reife-Stufe (nur solange die Charge reift) oder nächste MHD-Stufe
  const kandidaten: { datum: string; preis: number; text: string }[] = [];
  if (!fertig) {
    const nr = rs.find((s) => s.ab_tag > tage);
    if (nr) {
      const d = plusTage(c.start_datum, nr.ab_tag);
      const rp = centRunden(grund * (1 + nr.aufschlag / 100));
      const datumNr = d ? tagNr(d) : null;
      const restAmTag = mhdNr !== null && datumNr !== null ? mhdNr - datumNr : null;
      const m2 = restAmTag === null ? [] : ms.filter((s) => restAmTag <= s.tage_vor);
      const ab = m2.length ? Math.max(...m2.map((s) => s.abschlag)) : 0;
      if (d && (restAmTag === null || restAmTag >= 0)) kandidaten.push({ datum: d, preis: centRunden(rp * (1 - ab / 100)), text: `Reifetag ${nr.ab_tag}: +${zahlText(nr.aufschlag)} %` });
    }
  }
  if (mhdNr !== null && mhdRest !== null) {
    const aktuell = mhdStufe?.abschlag ?? 0;
    const nm = ms.filter((s) => s.tage_vor < mhdRest && s.abschlag > aktuell).sort((a, b) => b.tage_vor - a.tage_vor)[0];
    if (nm) {
      const d = plusTage(c.mhd as string, -nm.tage_vor);
      if (d) kandidaten.push({ datum: d, preis: centRunden(reifePreis * (1 - nm.abschlag / 100)), text: `${nm.tage_vor === 0 ? 'MHD-Tag' : `${nm.tage_vor} ${nm.tage_vor === 1 ? 'Tag' : 'Tage'} vor MHD`}: −${zahlText(nm.abschlag)} %` });
    }
  }
  kandidaten.sort((a, b) => a.datum.localeCompare(b.datum));
  return {
    ok: true, preis, grundpreis: centRunden(grund), reifePreis, reifeStufe, mhdStufe, tage, mhdRest,
    reduziert: !!mhdStufe && mhdStufe.abschlag > 0,
    text: teile.join(' · '),
    naechste: kandidaten[0] ?? null,
  };
}

function zahlText(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/**
 * Text für das Preisschild (Grundpreis nach Preisangabenverordnung):
 * kg/l = der Preis ist schon je kg bzw. l; g wird je kg gerechnet; Stück ohne Grundpreis.
 */
export function preisschildEinheit(einheit: string): { je: string; grundpreisNoetig: boolean } {
  if (einheit === 'kg' || einheit === 'g') return { je: '1 kg', grundpreisNoetig: true };
  if (einheit === 'l') return { je: '1 l', grundpreisNoetig: true };
  return { je: 'Stück', grundpreisNoetig: false };
}

/** MHD prüfen: gültiges Datum, nicht vor dem Start der Reifung. Leer = kein MHD. */
export function mhdPruefen(mhd: string, start: string): { ok: true; mhd: string | null } | { ok: false; fehler: string } {
  const t = mhd.trim();
  if (!t) return { ok: true, mhd: null };
  const m = tagNr(t), s = tagNr(start);
  if (m === null) return { ok: false, fehler: 'Bitte ein gültiges MHD eintragen.' };
  if (s !== null && m < s) return { ok: false, fehler: 'Das MHD liegt vor dem Start der Reifung.' };
  return { ok: true, mhd: t.slice(0, 10) };
}

function esc(t: unknown): string {
  return String(t ?? '').replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z] as string));
}
const euroText = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const datumDe = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

/**
 * Preisschild für die Theke (Druck). `frei` = Start-Schalter „reifePreisTreppe“.
 * Ohne Freigabe: Aufdruck ENTWURF und KEIN Streichpreis.
 */
export function preisschildHtml(a: {
  produkt: string; nummer: string; einheit: string; preis: number; streichpreis: number | null;
  tage: number | null; mhd: string | null; frei: boolean;
}): string {
  const pe = preisschildEinheit(a.einheit);
  const streich = a.frei && a.streichpreis !== null && a.streichpreis > a.preis
    ? `<div class="alt">statt <s>${esc(euroText(a.streichpreis))}</s></div><div class="grund">reduziert wegen kurzer Haltbarkeit</div>` : '';
  const zeilen: string[] = [];
  if (a.tage !== null && a.tage > 0) zeilen.push(`${esc(a.tage)} Tage gereift`);
  if (a.mhd) zeilen.push(`mindestens haltbar bis ${esc(datumDe(a.mhd))}`);
  zeilen.push(`Charge ${esc(a.nummer)}`);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Preisschild ${esc(a.produkt)}</title><style>
@page{size:A6 landscape;margin:6mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}
.schild{border:2px solid #111;border-radius:6px;padding:10px 14px;position:relative;overflow:hidden;min-height:80mm;box-sizing:border-box}
h1{font-size:22px;margin:0 0 6px}.preis{font-size:44px;font-weight:700;margin:6px 0 0}.je{font-size:16px;font-weight:400}
.alt{font-size:16px;color:#444;margin-top:2px}.grund{font-size:12px;color:#444}
.info{font-size:13px;margin-top:10px;color:#222}
.entwurf{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;color:rgba(200,0,0,.28);transform:rotate(-18deg);pointer-events:none;text-align:center}
</style></head><body><div class="schild">
<h1>${esc(a.produkt)}</h1>
<div class="preis">${esc(euroText(a.preis))} <span class="je">je ${esc(pe.je)}</span></div>
${streich}
<div class="info">${zeilen.join(' · ')}</div>
${a.frei ? '' : '<div class="entwurf">ENTWURF<br>nicht zur Preisauszeichnung</div>'}
</div></body></html>`;
}
