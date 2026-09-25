// lib/fuhrparkGeraete.ts
// ============================================================================
// ARGONAUT OS · Paket PJ · Fuhrpark (B18) und Geraete mit QR-Code (B24)
// Stand 24.09.2026
//
// ▄▄▄ WAS ES SCHON GAB ▄▄▄
// - /dashboard/erp/fuhrpark: Fahrzeuge mit HU-, Wartungs- und Versicherungs-
//   Ampel, km-Stand. Keine Kosten, kein Verlauf, kein Fahrer, keine UVV.
// - /dashboard/erp/inventar: Geraete mit Pruef-Ampel. Keine Ausgabe an
//   Personen, keine Defekt-Meldung, keine Historie, kein QR-Code.
// - lib/qr.ts: eigener QR-Encoder (fuer GiroCode gebaut).
//
// ▄▄▄ WAS HIER DAZUKOMMT ▄▄▄
// 1. Fahrzeug-Akte: Tanken/Laden, Werkstatt, Reifen, Schaden, km-Stand,
//    Uebergabe — mit Kosten je Monat, Kosten je km und Verbrauch, aber nur,
//    wenn die Zahlen es hergeben (sonst null, nie eine geschaetzte Zahl).
// 2. Geraete-Akte: wer hat das Geraet, seit wann, ist es defekt, wann
//    zuletzt geprueft — errechnet aus der Ereignis-Liste.
// 3. QR-Etiketten: Link auf die Akte, als SVG zum Ausdrucken.
//
// Reine Logik: keine Imports aus Next/Supabase/React, keine Uhr — "heute"
// kommt immer als Parameter (YYYY-MM-DD). Node-getestet:
// tests/fuhrparkGeraeteP83.test.mjs
// ============================================================================

import { qrMatrix } from './qr';
import { leseZahl as zentralLeseZahl } from './zahlen';
import { tageBis, istIsoDatum, datumDe } from './nachweisMotor';

export { datumDe };

// ---------------------------------------------------------------------------
// Kleinzeug
// ---------------------------------------------------------------------------

function iso(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = x.slice(0, 10);
  return istIsoDatum(t) ? t : null;
}

/** Zahl lesen, deutsche Schreibweise erlaubt ("1.234,56"). null statt NaN. */
export function leseZahl(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const t = String(x).trim().replace(/\s|€|km|l$/gi, '');
  if (!t) return null;
  return zentralLeseZahl(t);
}

function cent(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Ampel = 'fehlt' | 'ueberfaellig' | 'bald' | 'ok';
export type Stufe = 'rot' | 'gelb' | 'info';
export type Hinweis = { stufe: Stufe; text: string };

/** Ab wie vielen Tagen vor Ablauf eine Frist gelb wird. */
export const BALD_TAGE = 30;

export function ampel(datum: unknown, heute: string, baldTage = BALD_TAGE): { ampel: Ampel; tage: number | null } {
  const d = iso(datum);
  if (!d) return { ampel: 'fehlt', tage: null };
  const tage = tageBis(heute, d);
  if (tage < 0) return { ampel: 'ueberfaellig', tage };
  if (tage <= baldTage) return { ampel: 'bald', tage };
  return { ampel: 'ok', tage };
}

// ===========================================================================
// TEIL 1 · FUHRPARK
// ===========================================================================

export type FahrzeugFrist = { key: string; label: string; grundlage: string; pflicht: boolean; baldTage: number };

export const FAHRZEUG_FRISTEN: FahrzeugFrist[] = [
  { key: 'tuev_bis', label: 'HU (TÜV)', grundlage: '§ 29 StVZO', pflicht: true, baldTage: 30 },
  { key: 'uvv_bis', label: 'UVV-Prüfung', grundlage: 'DGUV Vorschrift 70 § 57: bei Bedarf, mindestens jährlich durch einen Sachkundigen (Richtwert)', pflicht: true, baldTage: 30 },
  { key: 'wartung_bis', label: 'Wartung', grundlage: 'Herstellervorgabe', pflicht: false, baldTage: 30 },
  { key: 'versicherung_bis', label: 'Versicherung', grundlage: 'Vertrag', pflicht: false, baldTage: 30 },
  { key: 'leasing_ende', label: 'Leasing-Ende', grundlage: 'Leasingvertrag — Rückgabe und Nachfolger rechtzeitig planen', pflicht: false, baldTage: 90 },
];

export type FahrzeugZeile = {
  bezeichnung?: string | null;
  kennzeichen?: string | null;
  aktiv?: boolean | null;
  km_stand?: number | string | null;
  [feld: string]: unknown;
};

export type FristStand = { key: string; label: string; grundlage: string; datum: string | null; ampel: Ampel; tage: number | null };

/** Alle Fristen eines Fahrzeugs. Pflicht-Fristen ohne Datum = 'fehlt'. */
export function fahrzeugFristen(f: FahrzeugZeile, heute: string): FristStand[] {
  const aus: FristStand[] = [];
  for (const fr of FAHRZEUG_FRISTEN) {
    const datum = iso(f[fr.key]);
    if (!datum && !fr.pflicht) continue;
    const a = ampel(datum, heute, fr.baldTage);
    aus.push({ key: fr.key, label: fr.label, grundlage: fr.grundlage, datum, ampel: a.ampel, tage: a.tage });
  }
  return aus;
}

const AMPEL_RANG: Record<Ampel, number> = { ueberfaellig: 0, fehlt: 1, bald: 2, ok: 3 };

export function schlimmsteAmpel(fristen: FristStand[]): Ampel {
  let best: Ampel = 'ok';
  for (const f of fristen) if (AMPEL_RANG[f.ampel] < AMPEL_RANG[best]) best = f.ampel;
  return best;
}

export type EintragArt = 'tanken' | 'laden' | 'werkstatt' | 'reifen' | 'schaden' | 'km' | 'uebergabe' | 'sonstiges';

export const EINTRAG_ARTEN: { key: EintragArt; label: string; icon: string; kosten: boolean; mitarbeiter: boolean }[] = [
  { key: 'tanken', label: 'Tanken', icon: '⛽', kosten: true, mitarbeiter: true },
  { key: 'laden', label: 'Laden (Strom)', icon: '🔌', kosten: true, mitarbeiter: true },
  { key: 'km', label: 'km-Stand', icon: '📏', kosten: false, mitarbeiter: true },
  { key: 'schaden', label: 'Schaden melden', icon: '💥', kosten: false, mitarbeiter: true },
  { key: 'uebergabe', label: 'Übergabe an Fahrer', icon: '🔑', kosten: false, mitarbeiter: true },
  { key: 'werkstatt', label: 'Werkstatt', icon: '🔧', kosten: true, mitarbeiter: false },
  { key: 'reifen', label: 'Reifen', icon: '🛞', kosten: true, mitarbeiter: false },
  { key: 'sonstiges', label: 'Sonstige Kosten', icon: '🧾', kosten: true, mitarbeiter: false },
];

export function eintragArt(key: unknown) {
  return EINTRAG_ARTEN.find((a) => a.key === key) ?? null;
}

export type FahrzeugEintrag = {
  art: string;
  datum: string;
  km_stand?: number | string | null;
  betrag_brutto?: number | string | null;
  menge?: number | string | null; // Liter oder kWh
  fahrer_name?: string | null;
  erledigt?: boolean | null;
  erstellt_am?: string | null;
};

function nachDatum<T extends { datum: string; erstellt_am?: string | null }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => a.datum.localeCompare(b.datum) || String(a.erstellt_am ?? '').localeCompare(String(b.erstellt_am ?? '')));
}

/**
 * km-Staende pruefen: ein spaeterer Eintrag mit KLEINEREM km-Stand ist ein
 * Tippfehler oder ein Tacho-Problem. Wir melden ihn, korrigieren nichts.
 */
export function kmWarnungen(eintraege: FahrzeugEintrag[]): Hinweis[] {
  const h: Hinweis[] = [];
  let vorher: { km: number; datum: string } | null = null;
  for (const e of nachDatum(eintraege)) {
    const km = leseZahl(e.km_stand);
    if (km == null) continue;
    if (km < 0) { h.push({ stufe: 'gelb', text: `Negativer km-Stand am ${datumDe(e.datum)}.` }); continue; }
    if (vorher && km < vorher.km) {
      h.push({ stufe: 'gelb', text: `km-Stand am ${datumDe(e.datum)} (${km.toLocaleString('de-DE')}) ist kleiner als am ${datumDe(vorher.datum)} (${vorher.km.toLocaleString('de-DE')}) — bitte prüfen.` });
    }
    if (!vorher || km >= vorher.km) vorher = { km, datum: e.datum };
  }
  return h;
}

/** Hoechster bekannter km-Stand aus Stammdaten und Eintraegen. */
export function aktuellerKm(stamm: unknown, eintraege: FahrzeugEintrag[]): number | null {
  let max: number | null = leseZahl(stamm);
  for (const e of eintraege) {
    const km = leseZahl(e.km_stand);
    if (km != null && (max == null || km > max)) max = km;
  }
  return max;
}

export type KostenAuswertung = {
  gesamt: number;
  jeArt: Record<string, number>;
  jeMonat: { monat: string; betrag: number }[];
  /** Gefahrene km im Zeitraum (hoechster minus niedrigster Stand). null bei weniger als 2 Staenden. */
  km: number | null;
  /** Kosten je km. null, wenn km unbekannt oder 0. */
  jeKm: number | null;
  /** Durchschnittsverbrauch l/100 km nach der Tank-Methode. null, wenn die Daten es nicht hergeben. */
  verbrauch: number | null;
  /** Eintraege mit Kostenart, aber ohne Betrag — die Summe ist dann unvollstaendig. */
  ohneBetrag: number;
};

/**
 * Kosten eines Fahrzeugs im Zeitraum [von, bis] (beide optional, inklusive).
 *
 * Verbrauch (Tank-Methode): Tankvorgaenge nach km sortiert; Liter aller
 * Tankungen AUSSER der ersten, geteilt durch die km zwischen erster und
 * letzter Tankung. Nur wenn mindestens zwei Tankungen km UND Liter haben und
 * keine Tankung dazwischen ohne Liter oder km ist — sonst waere die Zahl
 * falsch, und dann zeigen wir lieber keine.
 */
export function kostenAuswertung(eintraege: FahrzeugEintrag[], von?: string | null, bis?: string | null): KostenAuswertung {
  const imZeitraum = eintraege.filter((e) => iso(e.datum) && (!von || e.datum >= von) && (!bis || e.datum <= bis));
  const k: KostenAuswertung = { gesamt: 0, jeArt: {}, jeMonat: [], km: null, jeKm: null, verbrauch: null, ohneBetrag: 0 };
  const monate = new Map<string, number>();
  const kms: number[] = [];
  for (const e of imZeitraum) {
    const art = eintragArt(e.art);
    const betrag = leseZahl(e.betrag_brutto);
    if (art?.kosten) {
      if (betrag == null) k.ohneBetrag++;
      else {
        k.gesamt = cent(k.gesamt + betrag);
        k.jeArt[e.art] = cent((k.jeArt[e.art] ?? 0) + betrag);
        const m = e.datum.slice(0, 7);
        monate.set(m, cent((monate.get(m) ?? 0) + betrag));
      }
    }
    const km = leseZahl(e.km_stand);
    if (km != null && km >= 0) kms.push(km);
  }
  k.jeMonat = [...monate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([monat, betrag]) => ({ monat, betrag }));
  if (kms.length >= 2) {
    const d = Math.max(...kms) - Math.min(...kms);
    k.km = d;
    k.jeKm = d > 0 ? Math.round((k.gesamt / d) * 1000) / 1000 : null;
  }
  const tank = imZeitraum.filter((e) => e.art === 'tanken');
  const alleVollstaendig = tank.every((e) => leseZahl(e.km_stand) != null && leseZahl(e.menge) != null);
  if (tank.length >= 2 && alleVollstaendig) {
    const sortiert = [...tank].sort((a, b) => (leseZahl(a.km_stand) as number) - (leseZahl(b.km_stand) as number));
    const strecke = (leseZahl(sortiert[sortiert.length - 1].km_stand) as number) - (leseZahl(sortiert[0].km_stand) as number);
    const liter = sortiert.slice(1).reduce((s, e) => s + (leseZahl(e.menge) as number), 0);
    k.verbrauch = strecke > 0 ? Math.round((liter / strecke) * 1000) / 10 : null;
  }
  return k;
}

/** Offene Schaeden (Art schaden, nicht erledigt), neueste zuerst. */
export function offeneSchaeden<T extends FahrzeugEintrag>(eintraege: T[]): T[] {
  return nachDatum(eintraege.filter((e) => e.art === 'schaden' && !e.erledigt)).reverse();
}

/** Wer faehrt das Fahrzeug gerade? Letzte Uebergabe, sonst der Stammdaten-Fahrer. */
export function aktuellerFahrer(stammFahrer: unknown, eintraege: FahrzeugEintrag[]): string | null {
  const ueb = nachDatum(eintraege.filter((e) => e.art === 'uebergabe' && String(e.fahrer_name ?? '').trim()));
  if (ueb.length) return String(ueb[ueb.length - 1].fahrer_name).trim();
  const s = String(stammFahrer ?? '').trim();
  return s || null;
}

export function fahrzeugHinweise(f: FahrzeugZeile, eintraege: FahrzeugEintrag[], heute: string): Hinweis[] {
  const h: Hinweis[] = [];
  for (const fr of fahrzeugFristen(f, heute)) {
    if (fr.ampel === 'ueberfaellig') h.push({ stufe: 'rot', text: `${fr.label} seit ${-(fr.tage as number)} ${fr.tage === -1 ? 'Tag' : 'Tagen'} abgelaufen (${datumDe(fr.datum)}).` });
    else if (fr.ampel === 'bald') h.push({ stufe: 'gelb', text: fr.tage === 0 ? `${fr.label} läuft heute ab.` : `${fr.label} in ${fr.tage} ${fr.tage === 1 ? 'Tag' : 'Tagen'} (${datumDe(fr.datum)}).` });
    else if (fr.ampel === 'fehlt') h.push({ stufe: 'gelb', text: `${fr.label}: kein Datum eingetragen.` });
  }
  const schaeden = offeneSchaeden(eintraege);
  if (schaeden.length) h.push({ stufe: 'rot', text: `${schaeden.length} ${schaeden.length === 1 ? 'offener Schaden' : 'offene Schäden'} — zuletzt am ${datumDe(schaeden[0].datum)}.` });
  h.push(...kmWarnungen(eintraege));
  const rang: Record<Stufe, number> = { rot: 0, gelb: 1, info: 2 };
  return h.sort((a, b) => rang[a.stufe] - rang[b.stufe]);
}

// ===========================================================================
// TEIL 2 · GERAETE
// ===========================================================================

export type GeraetArt = 'ausgabe' | 'rueckgabe' | 'pruefung' | 'reparatur' | 'defekt' | 'standort' | 'notiz';

export const GERAET_ARTEN: { key: GeraetArt; label: string; icon: string; mitarbeiter: boolean }[] = [
  { key: 'ausgabe', label: 'Mitgenommen / ausgegeben', icon: '📤', mitarbeiter: true },
  { key: 'rueckgabe', label: 'Zurückgegeben', icon: '📥', mitarbeiter: true },
  { key: 'defekt', label: 'Defekt gemeldet', icon: '⚠️', mitarbeiter: true },
  { key: 'standort', label: 'Standort geändert', icon: '📍', mitarbeiter: true },
  { key: 'notiz', label: 'Notiz', icon: '📝', mitarbeiter: true },
  { key: 'pruefung', label: 'Prüfung', icon: '✅', mitarbeiter: false },
  { key: 'reparatur', label: 'Repariert', icon: '🔧', mitarbeiter: false },
];

export function geraetArt(key: unknown) {
  return GERAET_ARTEN.find((a) => a.key === key) ?? null;
}

export type GeraetEreignis = {
  art: string;
  datum: string;
  person_name?: string | null;
  standort?: string | null;
  bestanden?: boolean | null;
  naechste_pruefung_am?: string | null;
  erstellt_am?: string | null;
};

export type GeraetStand = {
  bei: string | null;
  seit: string | null;
  tageAusgegeben: number | null;
  defekt: boolean;
  defektSeit: string | null;
  standort: string | null;
  letztePruefung: string | null;
  naechstePruefung: string | null;
};

/**
 * Aktueller Stand eines Geraets aus seinen Ereignissen (chronologisch).
 * - ausgabe: Geraet ist bei person_name.
 * - rueckgabe: niemand hat es mehr; Standort aus dem Ereignis, falls genannt.
 * - defekt / pruefung nicht bestanden: defekt, bis eine Reparatur ODER eine
 *   bestandene Pruefung folgt.
 * `standortStamm` und `pruefungStamm` kommen aus der Inventar-Zeile.
 */
export function geraetStand(ereignisse: GeraetEreignis[], heute: string, standortStamm?: string | null, pruefungStamm?: string | null): GeraetStand {
  const s: GeraetStand = { bei: null, seit: null, tageAusgegeben: null, defekt: false, defektSeit: null, standort: String(standortStamm ?? '').trim() || null, letztePruefung: null, naechstePruefung: iso(pruefungStamm) };
  for (const e of nachDatum(ereignisse.filter((x) => iso(x.datum)))) {
    const ort = String(e.standort ?? '').trim() || null;
    switch (e.art) {
      case 'ausgabe':
        s.bei = String(e.person_name ?? '').trim() || 'unbekannt';
        s.seit = e.datum;
        break;
      case 'rueckgabe':
        s.bei = null; s.seit = null;
        if (ort) s.standort = ort;
        break;
      case 'standort':
        if (ort) s.standort = ort;
        break;
      case 'defekt':
        if (!s.defekt) s.defektSeit = e.datum;
        s.defekt = true;
        break;
      case 'reparatur':
        s.defekt = false; s.defektSeit = null;
        break;
      case 'pruefung':
        s.letztePruefung = e.datum;
        if (iso(e.naechste_pruefung_am)) s.naechstePruefung = iso(e.naechste_pruefung_am);
        if (e.bestanden === false) { if (!s.defekt) s.defektSeit = e.datum; s.defekt = true; }
        else if (e.bestanden === true) { s.defekt = false; s.defektSeit = null; }
        break;
    }
  }
  s.tageAusgegeben = s.seit ? Math.max(0, tageBis(s.seit, heute)) : null;
  return s;
}

/** Nach so vielen Tagen bei derselben Person wird nachgefragt. */
export const AUSGABE_NACHFRAGE_TAGE = 30;

export function geraetHinweise(stand: GeraetStand, heute: string): Hinweis[] {
  const h: Hinweis[] = [];
  if (stand.defekt) h.push({ stufe: 'rot', text: `Defekt${stand.defektSeit ? ` seit ${datumDe(stand.defektSeit)}` : ''} — nicht benutzen, bis es repariert oder geprüft ist.` });
  const p = ampel(stand.naechstePruefung, heute);
  if (p.ampel === 'ueberfaellig') h.push({ stufe: 'rot', text: `Prüfung seit ${-(p.tage as number)} ${p.tage === -1 ? 'Tag' : 'Tagen'} überfällig (${datumDe(stand.naechstePruefung)}).` });
  else if (p.ampel === 'bald') h.push({ stufe: 'gelb', text: p.tage === 0 ? 'Prüfung heute fällig.' : `Prüfung in ${p.tage} ${p.tage === 1 ? 'Tag' : 'Tagen'} fällig.` });
  if (stand.bei && stand.tageAusgegeben != null && stand.tageAusgegeben > AUSGABE_NACHFRAGE_TAGE) {
    h.push({ stufe: 'info', text: `Seit ${stand.tageAusgegeben} Tagen bei ${stand.bei} — noch in Gebrauch?` });
  }
  const rang: Record<Stufe, number> = { rot: 0, gelb: 1, info: 2 };
  return h.sort((a, b) => rang[a.stufe] - rang[b.stufe]);
}

export type GeraeteZahlen = { gesamt: number; ausgegeben: number; defekt: number; pruefungUeberfaellig: number; pruefungBald: number };

export function geraeteZahlen(staende: GeraetStand[], heute: string): GeraeteZahlen {
  const z: GeraeteZahlen = { gesamt: staende.length, ausgegeben: 0, defekt: 0, pruefungUeberfaellig: 0, pruefungBald: 0 };
  for (const s of staende) {
    if (s.bei) z.ausgegeben++;
    if (s.defekt) z.defekt++;
    const a = ampel(s.naechstePruefung, heute).ampel;
    if (a === 'ueberfaellig') z.pruefungUeberfaellig++;
    if (a === 'bald') z.pruefungBald++;
  }
  return z;
}

// ===========================================================================
// TEIL 3 · QR-ETIKETTEN
// ===========================================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Link, auf den der QR-Code zeigt. Nur die eigene Adresse, nur eine echte ID —
 * sonst null (kein Etikett mit kaputtem Link).
 * Der Link fuehrt in den angemeldeten Bereich: wer scannt, muss eingeloggt
 * sein. Fremde sehen nur die Anmeldeseite.
 */
export function akteLink(origin: string, art: 'fahrzeug' | 'geraet', id: string): string | null {
  const o = String(origin ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+$/i.test(o)) return null;
  if (!UUID.test(String(id ?? ''))) return null;
  return `${o}/dashboard/erp/${art === 'fahrzeug' ? 'fuhrpark' : 'inventar'}/${id.toLowerCase()}`;
}

/**
 * QR-Code als SVG-Pfad. Ein Rechteck je dunklem Modul, 4 Module Ruhezone
 * (Pflicht fuer zuverlaessiges Scannen). Groesse in Modulen = n + 8.
 */
export function qrSvg(text: string): { svg: string; module: number } {
  const m = qrMatrix(text);
  const n = m.length;
  const rand = 4;
  const groesse = n + rand * 2;
  let pfad = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) pfad += `M${c + rand} ${r + rand}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${groesse} ${groesse}" shape-rendering="crispEdges"><rect width="${groesse}" height="${groesse}" fill="#fff"/><path d="${pfad}" fill="#000"/></svg>`;
  return { svg, module: groesse };
}
