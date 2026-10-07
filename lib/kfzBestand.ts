// ============================================================================
// ARGONAUT OS · lib/kfzBestand.ts — Paket 259 (07.10.2026) · K1 Fahrzeugbestand
//
// Reine Logik für den Handelsbestand (Tabelle kfz_bestand): Standtage, FIN-
// Prüfung, Suche, gespeicherte Suchen (Regeln aus der Branchen-Vorlage),
// Summen und Massen-Preisänderung.
//
// Abgrenzung (Claude-Befund 06.10.): kfz_fahrzeuge = Kundenfahrzeuge (HU/AU,
// Reifenhotel), werkstatt_fahrzeuge = Lebensakte. Der Handelsbestand ist eine
// eigene Tabelle und wird über die FIN mit der Lebensakte verknüpft (K1 Teil 2),
// keine vierte Insel.
//
// Nur der Import der zentralen Rundung (lib/zahlen), KEINE Hooks, kein Date.now() —
// „heute" kommt als Parameter.
// ============================================================================

import { centRunden } from './zahlen';

export type Bestand = {
  id: string;
  interne_nr: string | null;
  status: string;
  sparte: string | null;
  marke: string | null;
  modell: string | null;
  variante: string | null;
  fin: string | null;
  kennzeichen: string | null;
  erstzulassung: string | null;   // YYYY-MM-DD (Tag egal, Anzeige MM/JJJJ)
  km_stand: number | null;
  leistung_kw: number | null;
  kraftstoff: string | null;
  farbe: string | null;
  farbcode: string | null;
  standort_id: string | null;
  eingang_am: string | null;      // YYYY-MM-DD
  verkauft_am: string | null;
  ek_netto: number | null;
  vk_brutto: number | null;
  besteuerung: string | null;     // '25a' | 'regel'
  inseriert: boolean | null;
  notiz: string | null;
};

const TAG = 86400000;

function datum(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(t) ? t : null;
}

/** Standtage = Eingang bis heute (bzw. bis Verkauf). Im Zulauf oder ohne Eingang: null. */
export function standtage(b: Pick<Bestand, 'status' | 'eingang_am' | 'verkauft_am'>, heuteIso: string): number | null {
  if (b.status === 'zulauf') return null;
  const e = datum(b.eingang_am);
  const bis = datum(b.verkauft_am) ?? datum(heuteIso);
  if (e === null || bis === null) return null;
  return Math.max(0, Math.round((bis - e) / TAG));
}

/** Zählt der Eintrag zum aktiven Bestand (nicht verkauft/archiviert)? */
export function imBestand(status: string): boolean {
  return status !== 'verkauft' && status !== 'archiv';
}

/**
 * FIN prüfen (ISO 3779): 17 Zeichen, nur A–Z ohne I, O, Q, und 0–9.
 * Leer ist erlaubt (Boote, Anhänger ohne FIN, Fahrzeug im Zulauf).
 * Liefert die bereinigte FIN (Großbuchstaben, ohne Leerzeichen) oder einen Fehler.
 */
export function finPruefen(roh: string | null | undefined): { ok: true; fin: string | null } | { ok: false; fehler: string } {
  const f = String(roh ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!f) return { ok: true, fin: null };
  if (/[IOQ]/.test(f)) return { ok: false, fehler: 'Eine FIN enthält nie die Buchstaben I, O oder Q. Bitte prüfen Sie 1 und 0.' };
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(f)) return { ok: false, fehler: 'Die FIN darf nur Buchstaben und Ziffern enthalten.' };
  if (f.length !== 17) return { ok: false, fehler: `Eine FIN hat 17 Zeichen, hier sind es ${f.length}.` };
  return { ok: true, fin: f };
}

/** Erstzulassung als MM/JJJJ, sonst „—". */
export function ezText(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}/.test(iso)) return '—';
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** „03/2022" oder „2022-03" -> „2022-03-01"; sonst null. */
export function ezAusEingabe(roh: string | null | undefined): string | null {
  const s = String(roh ?? '').trim();
  let m = s.match(/^(\d{1,2})[./](\d{4})$/);
  if (m) { const mm = Number(m[1]); return mm >= 1 && mm <= 12 ? `${m[2]}-${String(mm).padStart(2, '0')}-01` : null; }
  m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (m) { const mm = Number(m[2]); return mm >= 1 && mm <= 12 ? `${m[1]}-${m[2]}-01` : null; }
  return null;
}

/** Freitextsuche über Marke, Modell, Variante, Kennzeichen, FIN, interne Nr. */
export function passtSuche(b: Bestand, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const heu = [b.marke, b.modell, b.variante, b.kennzeichen, b.fin, b.interne_nr].map((x) => String(x ?? '').toLowerCase()).join(' ');
  return s.split(/\s+/).every((w) => heu.includes(w));
}

/**
 * Regel einer gespeicherten Suche auswerten. Format: „feld OP wert", mehrere mit „&".
 * Felder: standtage, vk, ek, km, status, sparte, besteuerung, inseriert (ja/nein), standort.
 * OP: = != > >= < <=. Unbekanntes Feld oder kaputte Regel -> false (lieber nichts als falsch).
 */
export function regelPasst(b: Bestand, regel: string, heuteIso: string): boolean {
  const teile = String(regel || '').split('&').map((x) => x.trim()).filter(Boolean);
  if (!teile.length) return false;
  return teile.every((t) => {
    const m = t.match(/^([a-z_]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
    if (!m) return false;
    const [, feld, op, wertRoh] = m;
    const wert = wertRoh.trim();
    let ist: string | number | null;
    switch (feld) {
      case 'standtage': ist = standtage(b, heuteIso); break;
      case 'vk': ist = b.vk_brutto; break;
      case 'ek': ist = b.ek_netto; break;
      case 'km': ist = b.km_stand; break;
      case 'status': ist = b.status; break;
      case 'sparte': ist = b.sparte; break;
      case 'besteuerung': ist = b.besteuerung; break;
      case 'standort': ist = b.standort_id; break;
      case 'inseriert': ist = b.inseriert ? 'ja' : 'nein'; break;
      default: return false;
    }
    if (ist === null || ist === undefined) return false;
    if (typeof ist === 'number') {
      const w = Number(wert);
      if (!Number.isFinite(w)) return false;
      return op === '=' ? ist === w : op === '!=' ? ist !== w : op === '>' ? ist > w : op === '>=' ? ist >= w : op === '<' ? ist < w : ist <= w;
    }
    if (op === '=') return String(ist) === wert;
    if (op === '!=') return String(ist) !== wert;
    return false;
  }) && (/(^|&)\s*status\s*=/.test(regel) || imBestand(b.status));
}

export type Summen = { anzahl: number; ekSumme: number | null; vkSumme: number | null; standtageSchnitt: number | null; ohneEk: number };

/** Summen über den aktiven Bestand. EK-Summe null, wenn kein einziger EK bekannt (nie 0 erfinden). */
export function summen(liste: Bestand[], heuteIso: string): Summen {
  const aktiv = liste.filter((b) => imBestand(b.status));
  const eks = aktiv.map((b) => b.ek_netto).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const vks = aktiv.map((b) => b.vk_brutto).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const tage = aktiv.map((b) => standtage(b, heuteIso)).filter((x): x is number => x !== null);
  return {
    anzahl: aktiv.length,
    ekSumme: eks.length ? centRunden(eks.reduce((s, x) => s + x, 0)) : null,
    vkSumme: vks.length ? centRunden(vks.reduce((s, x) => s + x, 0)) : null,
    standtageSchnitt: tage.length ? Math.round(tage.reduce((s, x) => s + x, 0) / tage.length) : null,
    ohneEk: aktiv.length - eks.length,
  };
}

/**
 * Neuer Preis nach Prozent-Änderung, gerundet auf volle 10 € (Händler-Üblichkeit).
 * Nie negativ, nie unter 0; ohne alten Preis null (es wird kein Preis erfunden).
 */
export function preisNachProzent(alt: number | null, prozent: number): number | null {
  if (alt === null || !Number.isFinite(alt) || alt <= 0 || !Number.isFinite(prozent)) return null;
  const neu = Math.round((alt * (1 + prozent / 100)) / 10) * 10;
  return Math.max(0, neu);
}

/** Nächste interne Nummer im Muster F-0001 aus den vorhandenen. */
export function naechsteNr(vorhanden: (string | null)[]): string {
  let max = 0;
  for (const n of vorhanden) {
    const m = String(n ?? '').match(/^F-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `F-${String(max + 1).padStart(4, '0')}`;
}

/** Euro-Text ohne Cent für Listen („134.900 €"); null -> „—". */
export function euro(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('de-DE') + ' €';
}

/** PS aus kW (für die Anzeige „450 PS / 331 kW"). */
export function psAusKw(kw: number | null | undefined): number | null {
  if (kw === null || kw === undefined || !Number.isFinite(kw) || kw <= 0) return null;
  return Math.round(kw * 1.35962);
}
