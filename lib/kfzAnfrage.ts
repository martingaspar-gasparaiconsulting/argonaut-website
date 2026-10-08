// ============================================================================
// ARGONAUT OS · lib/kfzAnfrage.ts — Paket 271 (08.10.2026) · K10 Anfragen und Suchaufträge
//
// Reine Logik für Kaufinteressenten-Anfragen (kfz_anfrage) und Suchaufträge
// (kfz_suchauftrag): Nummern, Stand und Fälligkeit, Abschluss mit Grund,
// Auswertung der Abschlussgründe, Kriterien bereinigen und Treffer im Bestand
// finden (mit „neu seit dem letzten Blick").
//
// GRUNDSÄTZE
// - Anfragen sind keine Werbe-Einwilligung: wer anfragt, bekommt eine Antwort,
//   aber keine Serien-Mails. Deshalb eigene Tabelle statt „leads".
// - Suchaufträge laufen ab (Standard 90 Tage) — danach wird nicht mehr gesucht
//   und die Daten können weg (Datensparsamkeit).
// - Treffer sind nur Vorschläge; nichts wird automatisch verschickt.
//
// Keine Hooks, keine Systemuhr (Tag und Zeitpunkt kommen von außen). Node-testbar.
// ============================================================================

import { leseZahl } from './zahlen';

export type AnfrageStatus = 'neu' | 'in_arbeit' | 'termin' | 'angebot' | 'gewonnen' | 'verloren';

export const QUELLEN: { key: string; label: string }[] = [
  { key: 'telefon', label: 'Telefon' },
  { key: 'mail', label: 'E-Mail' },
  { key: 'laden', label: 'Im Autohaus' },
  { key: 'website', label: 'Webseite' },
  { key: 'boerse', label: 'Fahrzeugbörse' },
  { key: 'empfehlung', label: 'Empfehlung' },
  { key: 'sonstiges', label: 'Sonstiges' },
];

export const STATUS: { key: AnfrageStatus; label: string; farbe: 'info' | 'warn' | 'gold' | 'ok' | 'dim' | 'bad'; offen: boolean }[] = [
  { key: 'neu', label: 'Neu', farbe: 'info', offen: true },
  { key: 'in_arbeit', label: 'In Arbeit', farbe: 'warn', offen: true },
  { key: 'termin', label: 'Termin vereinbart', farbe: 'gold', offen: true },
  { key: 'angebot', label: 'Angebot gemacht', farbe: 'gold', offen: true },
  { key: 'gewonnen', label: 'Gewonnen', farbe: 'ok', offen: false },
  { key: 'verloren', label: 'Verloren', farbe: 'dim', offen: false },
];

export const GRUENDE: { key: string; label: string; gewonnen: boolean }[] = [
  { key: 'gekauft', label: 'Fahrzeug gekauft', gewonnen: true },
  { key: 'preis', label: 'Preis zu hoch', gewonnen: false },
  { key: 'fahrzeug_weg', label: 'Fahrzeug schon verkauft', gewonnen: false },
  { key: 'anderes_fahrzeug', label: 'Woanders gekauft', gewonnen: false },
  { key: 'finanzierung', label: 'Finanzierung abgelehnt', gewonnen: false },
  { key: 'inzahlungnahme', label: 'Inzahlungnahme zu niedrig', gewonnen: false },
  { key: 'kein_kontakt', label: 'Nicht mehr erreichbar', gewonnen: false },
  { key: 'sonstiges', label: 'Sonstiges', gewonnen: false },
];

export type Anfrage = {
  nr: string | null; bestand_id: string | null; quelle: string;
  name: string | null; tel: string | null; email: string | null; nachricht: string | null;
  verantwortlich_id: string | null; verantwortlich_name: string | null;
  status: string; faellig_am: string | null;
  abschluss_grund: string | null; abschluss_notiz: string | null; abgeschlossen_am: string | null;
  erstellt_am: string;
};

// --- Nummern ---------------------------------------------------------------------
export function naechsteNr(prefix: 'A' | 'S', vorhanden: (string | null)[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const n of vorhanden) {
    const m = String(n ?? '').match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

export function statusLabel(k: string): string { return STATUS.find((s) => s.key === k)?.label ?? k; }
export function istOffen(k: string): boolean { return STATUS.find((s) => s.key === k)?.offen ?? false; }

export function plusTage(tagIso: string, tage: number): string {
  const d = new Date(tagIso.slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Fälligkeit: überfällig, heute, bald (≤ 2 Tage), später oder ohne. Nur offene Anfragen. */
export function faelligkeit(a: Pick<Anfrage, 'status' | 'faellig_am'>, heuteIso: string): 'ueberfaellig' | 'heute' | 'bald' | 'spaeter' | 'ohne' | 'zu' {
  if (!istOffen(a.status)) return 'zu';
  if (!a.faellig_am) return 'ohne';
  const f = a.faellig_am.slice(0, 10), h = heuteIso.slice(0, 10);
  if (f < h) return 'ueberfaellig';
  if (f === h) return 'heute';
  return f <= plusTage(h, 2) ? 'bald' : 'spaeter';
}

/** Neue Anfrage: nächster Kontakt heute (Telefon/Laden) bzw. morgen spätestens — Antwort am selben Tag ist das Ziel. */
export function startFaellig(quelle: string, heuteIso: string): string {
  return quelle === 'boerse' || quelle === 'website' || quelle === 'mail' ? heuteIso.slice(0, 10) : plusTage(heuteIso, 1);
}

export type Pruefung = { fehler: string[] };

/** Was fehlt beim Anlegen / beim Abschluss. */
export function anfragePruefen(a: Pick<Anfrage, 'name' | 'tel' | 'email' | 'status' | 'abschluss_grund'>): Pruefung {
  const fehler: string[] = [];
  if (!a.name?.trim()) fehler.push('Name fehlt.');
  if (!a.tel?.trim() && !a.email?.trim()) fehler.push('Telefon oder E-Mail angeben — sonst kann niemand antworten.');
  if (a.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) fehler.push('Die E-Mail-Adresse sieht nicht gültig aus.');
  if (!istOffen(a.status) && !a.abschluss_grund) fehler.push('Abschlussgrund wählen.');
  if (a.status === 'gewonnen' && a.abschluss_grund && a.abschluss_grund !== 'gekauft') fehler.push('Gewonnen passt nur zum Grund „Fahrzeug gekauft".');
  if (a.status === 'verloren' && a.abschluss_grund === 'gekauft') fehler.push('„Fahrzeug gekauft" ist kein Verlustgrund.');
  return { fehler };
}

/** Felder beim Statuswechsel (Abschluss setzt Zeitpunkt, Wiedereröffnen räumt ihn). */
export function statusFelder(neu: string, jetztIso: string): Record<string, unknown> {
  if (istOffen(neu)) return { status: neu, abgeschlossen_am: null, abschluss_grund: null };
  return { status: neu, abgeschlossen_am: jetztIso, faellig_am: null, ...(neu === 'gewonnen' ? { abschluss_grund: 'gekauft' } : {}) };
}

// --- Auswertung -------------------------------------------------------------------
export type Auswertung = { offen: number; ueberfaellig: number; heute: number; gewonnen: number; verloren: number; quote: number | null; gruende: { key: string; label: string; anzahl: number }[]; quellen: { key: string; label: string; anzahl: number; gewonnen: number }[] };

export function auswertung(liste: Pick<Anfrage, 'status' | 'faellig_am' | 'abschluss_grund' | 'quelle'>[], heuteIso: string): Auswertung {
  let offen = 0, ueber = 0, heute = 0, gew = 0, verl = 0;
  const g = new Map<string, number>();
  const q = new Map<string, { anzahl: number; gewonnen: number }>();
  for (const a of liste) {
    const f = faelligkeit(a, heuteIso);
    if (istOffen(a.status)) offen++;
    if (f === 'ueberfaellig') ueber++;
    if (f === 'heute') heute++;
    if (a.status === 'gewonnen') gew++;
    if (a.status === 'verloren') { verl++; if (a.abschluss_grund) g.set(a.abschluss_grund, (g.get(a.abschluss_grund) ?? 0) + 1); }
    const qq = q.get(a.quelle) ?? { anzahl: 0, gewonnen: 0 };
    qq.anzahl++; if (a.status === 'gewonnen') qq.gewonnen++;
    q.set(a.quelle, qq);
  }
  const zu = gew + verl;
  return {
    offen, ueberfaellig: ueber, heute, gewonnen: gew, verloren: verl,
    quote: zu > 0 ? Math.round((gew / zu) * 100) : null,
    gruende: GRUENDE.filter((x) => g.has(x.key)).map((x) => ({ key: x.key, label: x.label, anzahl: g.get(x.key) as number })).sort((a, b) => b.anzahl - a.anzahl),
    quellen: QUELLEN.filter((x) => q.has(x.key)).map((x) => ({ key: x.key, label: x.label, ...(q.get(x.key) as { anzahl: number; gewonnen: number }) })),
  };
}

// --- Suchaufträge ------------------------------------------------------------------
export type Kriterien = {
  marke?: string; modell?: string; preis_max?: number; preis_min?: number;
  ez_ab?: number; km_max?: number; kraftstoff?: string; sparte?: string;
};
export const SUCH_LAUFZEIT_TAGE = 90;

/** Eingaben bereinigen: Texte gekürzt, Zahlen über leseZahl, leere Felder fallen weg. */
export function kriterienBereinigen(roh: Record<string, unknown>): Kriterien {
  const k: Kriterien = {};
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined);
  const zahl = (v: unknown) => { const n = leseZahl(v); return n !== null && n >= 0 ? Math.round(n) : undefined; };
  const m = txt(roh.marke); if (m) k.marke = m;
  const mo = txt(roh.modell); if (mo) k.modell = mo;
  const pmax = zahl(roh.preis_max); if (pmax) k.preis_max = pmax;
  const pmin = zahl(roh.preis_min); if (pmin) k.preis_min = pmin;
  const ez = zahl(roh.ez_ab); if (ez && ez >= 1950 && ez <= 2100) k.ez_ab = ez;
  const km = zahl(roh.km_max); if (km) k.km_max = km;
  const kr = txt(roh.kraftstoff); if (kr) k.kraftstoff = kr;
  const sp = txt(roh.sparte); if (sp) k.sparte = sp;
  return k;
}

export function kriterienText(k: Kriterien): string {
  const t: string[] = [];
  if (k.marke || k.modell) t.push([k.marke, k.modell].filter(Boolean).join(' '));
  if (k.sparte) t.push(k.sparte);
  if (k.preis_min && k.preis_max) t.push(`${k.preis_min.toLocaleString('de-DE')}–${k.preis_max.toLocaleString('de-DE')} €`);
  else if (k.preis_max) t.push(`bis ${k.preis_max.toLocaleString('de-DE')} €`);
  else if (k.preis_min) t.push(`ab ${k.preis_min.toLocaleString('de-DE')} €`);
  if (k.ez_ab) t.push(`ab EZ ${k.ez_ab}`);
  if (k.km_max) t.push(`bis ${k.km_max.toLocaleString('de-DE')} km`);
  if (k.kraftstoff) t.push(k.kraftstoff);
  return t.join(' · ') || 'ohne Einschränkung';
}

export type FahrzeugFuerSuche = {
  id: string; status: string; marke: string | null; modell: string | null; vk_brutto: number | null;
  erstzulassung: string | null; km_stand: number | null; kraftstoff: string | null; sparte: string | null; erstellt_am?: string | null;
};

const enthaelt = (wert: string | null, suche: string | undefined) => !suche || (!!wert && wert.toLowerCase().includes(suche.toLowerCase()));
/** Nur verkaufsfähige Fahrzeuge (nicht reserviert, verkauft, archiviert). */
export const SUCH_STATUS = ['zulauf', 'aufbereitung', 'bestand'];

export function passt(k: Kriterien, f: FahrzeugFuerSuche): boolean {
  if (!SUCH_STATUS.includes(f.status)) return false;
  if (!enthaelt(f.marke, k.marke) || !enthaelt(f.modell, k.modell) || !enthaelt(f.kraftstoff, k.kraftstoff) || !enthaelt(f.sparte, k.sparte)) return false;
  if (k.preis_max && (f.vk_brutto === null || f.vk_brutto > k.preis_max)) return false;
  if (k.preis_min && (f.vk_brutto === null || f.vk_brutto < k.preis_min)) return false;
  if (k.ez_ab && (!f.erstzulassung || Number(f.erstzulassung.slice(0, 4)) < k.ez_ab)) return false;
  if (k.km_max && (f.km_stand === null || f.km_stand > k.km_max)) return false;
  return true;
}

export type SuchAuftrag = { kriterien: unknown; aktiv: boolean; gueltig_bis: string | null; gesehen_bis: string | null };

export function laeuft(s: Pick<SuchAuftrag, 'aktiv' | 'gueltig_bis'>, heuteIso: string): boolean {
  return s.aktiv && (!s.gueltig_bis || s.gueltig_bis.slice(0, 10) >= heuteIso.slice(0, 10));
}

/** Treffer eines Suchauftrags; neu = erst nach dem letzten Blick in den Bestand gekommen. */
export function treffer(s: SuchAuftrag, bestand: FahrzeugFuerSuche[], heuteIso: string): { alle: FahrzeugFuerSuche[]; neu: FahrzeugFuerSuche[] } {
  if (!laeuft(s, heuteIso)) return { alle: [], neu: [] };
  const k = kriterienBereinigen((s.kriterien && typeof s.kriterien === 'object' ? s.kriterien : {}) as Record<string, unknown>);
  const alle = bestand.filter((f) => passt(k, f));
  const neu = s.gesehen_bis ? alle.filter((f) => !!f.erstellt_am && f.erstellt_am > (s.gesehen_bis as string)) : alle;
  return { alle, neu };
}

/** Für ein Fahrzeug: welche laufenden Suchaufträge passen? */
export function passendeSuchen<T extends SuchAuftrag>(f: FahrzeugFuerSuche, suchen: T[], heuteIso: string): T[] {
  return suchen.filter((s) => laeuft(s, heuteIso) && passt(kriterienBereinigen((s.kriterien ?? {}) as Record<string, unknown>), f));
}
