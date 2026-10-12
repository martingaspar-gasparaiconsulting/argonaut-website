// ============================================================================
// ARGONAUT OS · lib/boxKonfigurator.ts — Paket 344 (12.10.2026)
// BV3b Feinkost Teil 3: Box-Konfigurator mit Saison-Kapazität
//
// Eine Box (Geschenkkiste, Präsentkorb, Grillpaket …) hat einen Grundpreis
// und Fächer („2 Käse nach Wahl", „1 Wein"). Je Fach stehen Artikel mit
// Aufpreis zur Wahl. Je Tag gibt es eine Kapazität (wie viele Boxen gepackt
// werden können) und einen Vorlauf (Bestellschluss X Tage vor Abholung).
//
// Die Datenbank (SQL p344, Wächter p344_box_waechter) rechnet den Preis selbst
// und lässt je Tag nie mehr Boxen zu als die Kapazität. Diese Datei rechnet
// dasselbe für die Anzeige vor, prüft Eingaben und baut Packliste und
// Allergen-Übersicht (Vereinigung der Allergene aller enthaltenen Artikel).
// Keine Hooks, kein Supabase — node-testbar (tests/boxKonfiguratorP344.test.mjs).
// ============================================================================

import { centRunden } from './zahlen';
import { allergenNamen, parseAllergene } from './etiketten';
import { datumKurz, tagNr } from './vorbestellAktion';

export const BOX_STATUS = ['entwurf', 'aktiv', 'archiv'] as const;
export const BESTELL_STATUS = ['offen', 'bereit', 'abgeholt', 'storniert', 'nicht_abgeholt'] as const;
export const BOX_QUELLEN = ['theke', 'telefon', 'mail', 'shop'] as const;
export const MWST_SAETZE = [7, 19, 0] as const;
/** Diese Status belegen Kapazität (wie Paket 342). */
export const BOX_BELEGT: readonly string[] = ['offen', 'bereit', 'abgeholt'];
/** Höchstens so viele Tage legt „Zeitraum anlegen" auf einmal an. */
export const MAX_TAGE_ZEITRAUM = 120;

export type BoxVorlage = {
  id: string; name: string; beschreibung?: string | null; grundpreis: number; mwst_satz: number;
  bestell_vorlauf_tage: number; status: string;
};
export type BoxFach = { id: string; vorlage_id: string; titel: string; anzahl: number; position: number };
export type BoxOption = { id?: string; fach_id: string; artikel_id: string; aufpreis: number; aktiv: boolean };
export type BoxKapazitaet = { id?: string; vorlage_id: string; tag: string; max_boxen: number };
export type AuswahlEintrag = { fach_id: string; artikel_id: string; fach?: string; name?: string; aufpreis?: number };
export type BoxBestellung = {
  id?: string; vorlage_id: string; kunde_name: string; abhol_tag: string; anzahl: number; status: string;
  auswahl: AuswahlEintrag[]; preis_je_box?: number | null; gesamt?: number | null; quelle?: string | null;
};
export type Pruef = { ok: boolean; fehler: string[]; hinweise: string[] };

const fertig = (fehler: string[], hinweise: string[] = []): Pruef => ({ ok: fehler.length === 0, fehler, hinweise });
const istTag = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && tagNr(s) !== null;
const isoVon = (nr: number) => new Date(nr * 86400000).toISOString().slice(0, 10);

/** Betrag deutsch mit 2 Stellen und €. */
export function euro(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// --- Vorlage, Fach, Option, Kapazität prüfen --------------------------------

export type VorlageEingabe = { name: string; grundpreis: number | null; mwst_satz: number; bestell_vorlauf_tage: number | null; beschreibung: string };
export function vorlagePruefen(e: VorlageEingabe): Pruef {
  const f: string[] = [];
  if (!e.name.trim()) f.push('Bitte einen Namen für die Box eintragen.');
  if (e.name.trim().length > 120) f.push('Der Name ist zu lang (höchstens 120 Zeichen).');
  if (e.grundpreis === null || !Number.isFinite(e.grundpreis) || e.grundpreis < 0) f.push('Bitte einen Grundpreis eintragen (0 oder mehr).');
  else if (e.grundpreis > 100000) f.push('Der Grundpreis ist zu hoch.');
  if (!(MWST_SAETZE as readonly number[]).includes(e.mwst_satz)) f.push('Umsatzsteuer: 7 %, 19 % oder 0 %.');
  if (e.bestell_vorlauf_tage === null || !Number.isInteger(e.bestell_vorlauf_tage) || e.bestell_vorlauf_tage < 0 || e.bestell_vorlauf_tage > 60) {
    f.push('Vorlauf: ganze Tage von 0 bis 60.');
  }
  if (e.beschreibung.length > 600) f.push('Die Beschreibung ist zu lang (höchstens 600 Zeichen).');
  return fertig(f);
}

export function fachPruefen(titel: string, anzahl: number | null): Pruef {
  const f: string[] = [];
  if (!titel.trim()) f.push('Bitte das Fach benennen (z. B. „Käse nach Wahl").');
  if (titel.trim().length > 80) f.push('Der Fach-Name ist zu lang (höchstens 80 Zeichen).');
  if (anzahl === null || !Number.isInteger(anzahl) || anzahl < 1 || anzahl > 20) f.push('Anzahl je Fach: ganze Zahl von 1 bis 20.');
  return fertig(f);
}

export function optionPruefen(artikelId: string, aufpreis: number | null, schonDa: string[]): Pruef {
  const f: string[] = [];
  if (!artikelId) f.push('Bitte einen Artikel wählen.');
  else if (schonDa.includes(artikelId)) f.push('Dieser Artikel steht in diesem Fach schon zur Wahl.');
  if (aufpreis === null || !Number.isFinite(aufpreis) || aufpreis < 0 || aufpreis > 10000) f.push('Aufpreis: 0 bis 10.000 € (0 = ohne Aufpreis).');
  return fertig(f);
}

/**
 * Tage für „Zeitraum anlegen": von – bis, nur die gewählten Wochentage
 * (1 = Montag … 7 = Sonntag). Leer bei ungültigem Zeitraum oder mehr als
 * MAX_TAGE_ZEITRAUM Tagen.
 */
export function tageImZeitraum(von: string, bis: string, wochentage: number[]): string[] {
  if (!istTag(von) || !istTag(bis)) return [];
  const a = tagNr(von) as number, b = tagNr(bis) as number;
  if (b < a || b - a + 1 > MAX_TAGE_ZEITRAUM) return [];
  const raus: string[] = [];
  for (let t = a; t <= b; t++) {
    const wt = ((new Date(t * 86400000).getUTCDay() + 6) % 7) + 1;
    if (wochentage.includes(wt)) raus.push(isoVon(t));
  }
  return raus;
}

export function kapazitaetPruefen(von: string, bis: string, wochentage: number[], max: number | null): Pruef {
  const f: string[] = [];
  if (!istTag(von) || !istTag(bis)) f.push('Bitte Zeitraum von – bis eintragen.');
  else if ((tagNr(bis) as number) < (tagNr(von) as number)) f.push('„bis" liegt vor „von".');
  else if ((tagNr(bis) as number) - (tagNr(von) as number) + 1 > MAX_TAGE_ZEITRAUM) f.push(`Höchstens ${MAX_TAGE_ZEITRAUM} Tage auf einmal.`);
  else if (!wochentage.length) f.push('Bitte mindestens einen Wochentag wählen.');
  else if (!tageImZeitraum(von, bis, wochentage).length) f.push('In diesem Zeitraum liegt keiner der gewählten Wochentage.');
  if (max === null || !Number.isInteger(max) || max < 1 || max > 10000) f.push('Boxen je Tag: ganze Zahl von 1 bis 10.000.');
  return fertig(f);
}

// --- Auswahl und Preis ---------------------------------------------------------

/** Dieselbe Regel wie der Wächter: je Fach genau „anzahl" aktive Optionen dieses Fachs. */
export function auswahlPruefen(faecher: BoxFach[], optionen: BoxOption[], auswahl: AuswahlEintrag[]): Pruef {
  const f: string[] = [];
  for (const fa of faecher) {
    const n = auswahl.filter((a) => a.fach_id === fa.id).length;
    if (n !== fa.anzahl) f.push(`Im Fach „${fa.titel}" sind genau ${fa.anzahl} zu wählen (gewählt: ${n}).`);
  }
  const fachIds = new Set(faecher.map((x) => x.id));
  const passt = (a: AuswahlEintrag) =>
    fachIds.has(a.fach_id) && optionen.some((o) => o.aktiv && o.fach_id === a.fach_id && o.artikel_id === a.artikel_id);
  if (auswahl.some((a) => !passt(a))) f.push('Die Auswahl passt nicht zur Box — bitte neu wählen.');
  return fertig(f);
}

/** Preis je Box = Grundpreis + Aufpreise der gewählten Artikel (wie die Datenbank). */
export function boxPreis(v: Pick<BoxVorlage, 'grundpreis'>, optionen: BoxOption[], auswahl: AuswahlEintrag[]): { je_box: number; aufpreise: number } {
  let auf = 0;
  for (const a of auswahl) {
    const o = optionen.find((x) => x.fach_id === a.fach_id && x.artikel_id === a.artikel_id);
    if (o) auf += Number(o.aufpreis) || 0;
  }
  const aufpreise = centRunden(auf);
  return { je_box: centRunden((Number(v.grundpreis) || 0) + aufpreise), aufpreise };
}

/** Ab-Preis für die Anzeige: Grundpreis + je Fach die günstigsten Aufpreise. */
export function abPreis(v: Pick<BoxVorlage, 'grundpreis'>, faecher: BoxFach[], optionen: BoxOption[]): number {
  let s = Number(v.grundpreis) || 0;
  for (const fa of faecher) {
    const auf = optionen.filter((o) => o.aktiv && o.fach_id === fa.id).map((o) => Number(o.aufpreis) || 0).sort((a, b) => a - b);
    // Wiederholung erlaubt: das günstigste darf mehrfach gewählt werden
    if (auf.length) s += auf[0] * fa.anzahl;
  }
  return centRunden(s);
}

/** Vorschlag für eine neue Auswahl: je Fach die erste aktive Option „anzahl"-mal. */
export function standardAuswahl(faecher: BoxFach[], optionen: BoxOption[]): AuswahlEintrag[] {
  const raus: AuswahlEintrag[] = [];
  for (const fa of [...faecher].sort((a, b) => a.position - b.position)) {
    const o = optionen.find((x) => x.aktiv && x.fach_id === fa.id);
    if (!o) continue;
    for (let i = 0; i < fa.anzahl; i++) raus.push({ fach_id: fa.id, artikel_id: o.artikel_id });
  }
  return raus;
}

/** Warum die Box (noch) nicht bestellbar ist — leer = bereit. */
export function vorlageBereit(v: BoxVorlage, faecher: BoxFach[], optionen: BoxOption[], kap: BoxKapazitaet[], heute: string): string[] {
  const g: string[] = [];
  for (const fa of faecher) {
    if (!optionen.some((o) => o.aktiv && o.fach_id === fa.id)) g.push(`Im Fach „${fa.titel}" steht kein Artikel zur Wahl.`);
  }
  const h = tagNr(heute) ?? 0;
  if (!kap.some((k) => k.vorlage_id === v.id && (tagNr(k.tag) ?? -1) >= h)) g.push('Keine Kapazität ab heute — unter „Kapazität" Tage anlegen.');
  return g;
}

// --- Bestellschluss und Kapazität ----------------------------------------------

/** Letzter Bestelltag für einen Abholtag (Abholtag − Vorlauf). */
export function bestellSchluss(abholTag: string, vorlauf: number): string | null {
  const t = tagNr(abholTag);
  return t === null ? null : isoVon(t - Math.max(0, Math.floor(vorlauf || 0)));
}

/** Im Shop hart (Wächter), an der Theke nur Hinweis. */
export function nachSchluss(abholTag: string, vorlauf: number, heute: string): boolean {
  const s = bestellSchluss(abholTag, vorlauf);
  const h = tagNr(heute);
  return s !== null && h !== null && (tagNr(s) as number) < h;
}

export type TagStand = { tag: string; max: number; belegt: number; frei: number; prozent: number };

export function tagStand(k: BoxKapazitaet, bestellungen: BoxBestellung[]): TagStand {
  const belegt = bestellungen
    .filter((b) => b.vorlage_id === k.vorlage_id && b.abhol_tag === k.tag && BOX_BELEGT.includes(b.status))
    .reduce((s, b) => s + (Number(b.anzahl) || 0), 0);
  const max = Number(k.max_boxen) || 0;
  return { tag: k.tag, max, belegt, frei: Math.max(0, max - belegt), prozent: max > 0 ? Math.min(100, Math.round((belegt / max) * 100)) : 100 };
}

/** Kapazität je Tag einer Box ab „heute", sortiert. */
export function kapazitaetListe(vorlageId: string, kap: BoxKapazitaet[], bestellungen: BoxBestellung[], heute: string, auchVergangene = false): TagStand[] {
  const h = tagNr(heute) ?? 0;
  return kap
    .filter((k) => k.vorlage_id === vorlageId && (auchVergangene || (tagNr(k.tag) ?? -1) >= h))
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .map((k) => tagStand(k, bestellungen));
}

export type BestellEingabe = { kunde_name: string; kunde_tel: string; kunde_mail: string; abhol_tag: string; anzahl: number | null; notiz: string };

/** Eingabe der Bestellung prüfen (die Datenbank prüft Kapazität und Auswahl noch einmal). */
export function bestellungPruefen(
  e: BestellEingabe, v: BoxVorlage, faecher: BoxFach[], optionen: BoxOption[], auswahl: AuswahlEintrag[],
  kap: BoxKapazitaet[], bestellungen: BoxBestellung[], heute: string,
): Pruef {
  const f: string[] = [], h: string[] = [];
  if (v.status !== 'aktiv') f.push('Diese Box ist nicht zum Bestellen freigegeben.');
  if (!e.kunde_name.trim()) f.push('Bitte den Namen des Kunden eintragen.');
  if (e.kunde_mail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.kunde_mail.trim())) f.push('Die E-Mail-Adresse sieht nicht richtig aus.');
  if (e.anzahl === null || !Number.isInteger(e.anzahl) || e.anzahl < 1 || e.anzahl > 100) f.push('Anzahl Boxen: ganze Zahl von 1 bis 100.');
  if (!istTag(e.abhol_tag)) f.push('Bitte einen Abholtag wählen.');
  else {
    const k = kap.find((x) => x.vorlage_id === v.id && x.tag === e.abhol_tag);
    if (!k) f.push('Für diesen Tag ist keine Kapazität eingetragen.');
    else if (e.anzahl !== null) {
      const st = tagStand(k, bestellungen);
      if (e.anzahl > st.frei) f.push(`An diesem Tag sind nur noch ${st.frei} von ${st.max} Boxen frei.`);
    }
    if ((tagNr(e.abhol_tag) as number) < (tagNr(heute) ?? 0)) f.push('Der Abholtag liegt in der Vergangenheit.');
    else if (nachSchluss(e.abhol_tag, v.bestell_vorlauf_tage, heute)) {
      h.push(`Bestellschluss war am ${datumKurz(bestellSchluss(e.abhol_tag, v.bestell_vorlauf_tage))} — an der Theke trotzdem möglich, im Shop nicht.`);
    }
  }
  f.push(...auswahlPruefen(faecher, optionen, auswahl).fehler);
  if (!e.kunde_tel.trim() && !e.kunde_mail.trim()) h.push('Ohne Telefon oder E-Mail können Sie den Kunden bei Rückfragen nicht erreichen.');
  return fertig(f, h);
}

// --- Allergene und Steuer ------------------------------------------------------------

export type EtikettAllergen = { artikel_id?: string | null; status?: string | null; allergene?: string | null; spuren?: string | null };

export type BoxAllergene = { keys: string[]; namen: string[]; spuren: string[]; ohneEtikett: string[] };

/**
 * Allergene der Box = Vereinigung der Allergene aller gewählten Artikel
 * (aus ihren Etiketten). Artikel ohne Etikett werden genannt — dann ist die
 * Angabe unvollständig und darf so nicht an den Kunden.
 */
export function boxAllergene(auswahl: AuswahlEintrag[], etiketten: EtikettAllergen[], namen: Record<string, string> = {}): BoxAllergene {
  const keys: string[] = [], spuren: string[] = [], ohne: string[] = [];
  const gesehen = new Set<string>();
  for (const a of auswahl) {
    if (gesehen.has(a.artikel_id)) continue;
    gesehen.add(a.artikel_id);
    const e = etiketten.find((x) => x.artikel_id === a.artikel_id && (x.status == null || x.status === 'aktiv'));
    if (!e) { ohne.push(namen[a.artikel_id] ?? a.name ?? 'Artikel'); continue; }
    for (const k of parseAllergene(e.allergene)) if (!keys.includes(k)) keys.push(k);
    const s = String(e.spuren ?? '').trim();
    if (s && !spuren.includes(s)) spuren.push(s);
  }
  return { keys, namen: allergenNamen(keys), spuren, ohneEtikett: ohne };
}

/**
 * Hinweis, wenn Artikel einer Box verschiedene Steuersätze haben (z. B. Wein
 * 19 % und Käse 7 %). Ob der Preis dann aufzuteilen ist, klärt die
 * Steuerberatung — ARGONAUT setzt den Satz der Box, rechnet nichts um.
 */
export function mwstHinweis(v: Pick<BoxVorlage, 'mwst_satz'>, artikelIds: string[], saetze: Record<string, number | null | undefined>): string | null {
  const andere = [...new Set(artikelIds.map((id) => saetze[id]).filter((s): s is number => typeof s === 'number' && Number.isFinite(s)))]
    .filter((s) => s !== Number(v.mwst_satz));
  if (!andere.length) return null;
  return `In dieser Box stecken Artikel mit ${andere.map((s) => `${s} %`).join(' und ')} Umsatzsteuer, die Box steht auf ${v.mwst_satz} %. Bei gemischten Boxen kann der Preis nach Steuersätzen aufzuteilen sein — bitte mit Ihrer Steuerberatung klären.`;
}

// --- Packliste und Übersicht --------------------------------------------------------

export type PackZeile = { artikel_id: string; name: string; menge: number };
export type PackTag = { tag: string; boxen: number; artikel: PackZeile[]; bestellungen: BoxBestellung[] };

/**
 * Packliste je Abholtag: Summe je Artikel über alle offenen und bereiten
 * Bestellungen (Menge = gewählt × Anzahl Boxen). Abgeholte und stornierte
 * zählen nicht.
 */
export function packliste(bestellungen: BoxBestellung[], namen: Record<string, string> = {}): PackTag[] {
  const je: Record<string, PackTag> = {};
  for (const b of bestellungen) {
    if (b.status !== 'offen' && b.status !== 'bereit') continue;
    const t = (je[b.abhol_tag] ??= { tag: b.abhol_tag, boxen: 0, artikel: [], bestellungen: [] });
    const n = Number(b.anzahl) || 0;
    t.boxen += n;
    t.bestellungen.push(b);
    for (const a of b.auswahl ?? []) {
      let z = t.artikel.find((x) => x.artikel_id === a.artikel_id);
      if (!z) { z = { artikel_id: a.artikel_id, name: namen[a.artikel_id] ?? a.name ?? 'Artikel', menge: 0 }; t.artikel.push(z); }
      z.menge += n;
    }
  }
  return Object.values(je)
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .map((t) => ({ ...t, artikel: t.artikel.sort((a, b) => b.menge - a.menge || a.name.localeCompare(b.name, 'de')) }));
}

/** Auswahl als kurzer Text: „Käse: 2 × Bergkäse · Wein: Riesling". */
export function auswahlText(auswahl: AuswahlEintrag[], namen: Record<string, string> = {}): string {
  const jeFach: { fach: string; teile: Record<string, number> }[] = [];
  for (const a of auswahl) {
    const fach = a.fach ?? 'Auswahl';
    let g = jeFach.find((x) => x.fach === fach);
    if (!g) { g = { fach, teile: {} }; jeFach.push(g); }
    const n = namen[a.artikel_id] ?? a.name ?? 'Artikel';
    g.teile[n] = (g.teile[n] ?? 0) + 1;
  }
  return jeFach.map((g) => `${g.fach}: ${Object.entries(g.teile).map(([n, z]) => (z > 1 ? `${z} × ${n}` : n)).join(', ')}`).join(' · ');
}

export function boxUebersicht(bestellungen: BoxBestellung[], heute: string): { offen: number; heuteAbholen: number; umsatzOffen: number } {
  let offen = 0, heuteAbholen = 0, umsatz = 0;
  for (const b of bestellungen) {
    if (b.status === 'offen' || b.status === 'bereit') {
      offen += Number(b.anzahl) || 0;
      umsatz += Number(b.gesamt) || 0;
      if (b.abhol_tag === heute) heuteAbholen += Number(b.anzahl) || 0;
    }
  }
  return { offen, heuteAbholen, umsatzOffen: centRunden(umsatz) };
}
