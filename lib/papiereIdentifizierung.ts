// ============================================================================
// ARGONAUT OS · lib/papiereIdentifizierung.ts — Paket PS6 · Papiere & Identifizierung
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
//   A  Beherbergung: Meldeschein (seit 01.01.2025 nur für Gäste ohne deutsche
//      Staatsangehörigkeit, §§ 29, 30 BMG), Aufbewahrung/Vernichtung, Kurtaxe
//      nach den Sätzen der Gemeinde-Satzung.
//   B  Logistik: CMR-Frachtbrief (Pflichtangaben Art. 6 CMR, Gefahrgut-Angaben),
//      Tankkarten- und Maut-Abgleich (CSV-Import, Plausibilität).
//   C  Geldwäsche: Pflicht zur Identifizierung (Güterhändler bar ab 10.000 €,
//      Makler, Kanzlei-Kataloggeschäfte), Vollständigkeit, PEP/Risiko,
//      verbundene Barzahlungen, Aufbewahrung 5 Jahre (§ 8 Abs. 4 GwG).
//   D  Agentur: Nutzungsrechte — Ablauf, Fremdrechte, Rechteklausel.
//   E  Landwirtschaft: Dünge-Fristen als Erinnerung (Bedarfsermittlung vorher,
//      Aufzeichnung binnen 2 Tagen, Jahressumme bis 31.03., Sperrfristen).
//      Die Stoffstrombilanz ist seit 08.07.2025 abgeschafft.
//
// Datum IMMER als 'YYYY-MM-DD'-Text. Beträge über lib/zahlen (nie still 0).
// Recherchiert 25.09.2026 — Anwalt-Checkliste R26.
// ============================================================================

import { leseZahl } from './zahlen';

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------
function zwei(n: number): string { return String(n).padStart(2, '0'); }
export function istIsoDatum(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(x)) return false;
  const [j, m, t] = x.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}
export function datumDe(iso: string | null | undefined): string {
  if (!istIsoDatum(iso)) return '—';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}
export function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + Math.round(tage)));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  return `${ziel.getUTCFullYear()}-${zwei(ziel.getUTCMonth() + 1)}-${zwei(Math.min(t, letzter))}`;
}
export function tageZwischen(von: string, bis: string): number {
  const [a, b, c] = von.slice(0, 10).split('-').map(Number);
  const [d, e, f] = bis.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(d, e - 1, f) - Date.UTC(a, b - 1, c)) / 86_400_000);
}
export function heuteBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}
export function euroText(betrag: number | null | undefined): string {
  if (betrag == null || !Number.isFinite(betrag)) return '—';
  return betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
/** Alter in vollen Jahren an einem Stichtag. */
export function alterAm(geburt: string | null | undefined, stichtag: string): number | null {
  if (!istIsoDatum(geburt) || !istIsoDatum(stichtag)) return null;
  const [gj, gm, gt] = geburt.split('-').map(Number);
  const [sj, sm, st] = stichtag.split('-').map(Number);
  let a = sj - gj;
  if (sm < gm || (sm === gm && st < gt)) a -= 1;
  return a;
}
function leer(s: unknown): boolean { return s == null || String(s).trim() === ''; }
function zahl(x: unknown): number | null { if (x === '' || x == null) return null; return leseZahl(x); }
export type Stufe = 'ok' | 'gelb' | 'rot';
export type Befund = { stufe: Stufe; text: string };

// ===========================================================================
// A  BEHERBERGUNG — Meldeschein und Kurtaxe
// ===========================================================================
export const MELDESCHEIN_HINWEIS = 'Seit 01.01.2025 füllen nur Gäste ohne deutsche Staatsangehörigkeit einen Meldeschein aus (§ 29 Abs. 2 BMG); mitreisende ausländische Ehe-/Lebenspartner unterschreiben mit, minderjährige Kinder werden nur gezählt, bei Reisegruppen über 10 Personen nur die Reiseleitung. Ausweis vorlegen lassen. Aufbewahrung 1 Jahr ab Abreise, danach binnen 3 Monaten vernichten (§ 30 Abs. 4 BMG).';

const DEUTSCH = /^(de|deu|d|deutsch|deutschland|germany|german)$/i;
/** Liste der Staatsangehörigkeiten aus freiem Text („DE, TR" · „deutsch/türkisch"). */
export function staatenListe(text: string | null | undefined): string[] {
  return String(text ?? '').split(/[,;/+]| und /i).map((s) => s.trim()).filter(Boolean);
}
/** Meldescheinpflicht: nur wenn KEINE der Staatsangehörigkeiten deutsch ist. Unbekannt → null. */
export function meldepflichtig(staatsangehoerigkeiten: string | null | undefined): boolean | null {
  const l = staatenListe(staatsangehoerigkeiten);
  if (!l.length) return null;
  return !l.some((s) => DEUTSCH.test(s));
}

export type Meldeschein = {
  ankunft?: string | null; abreise?: string | null; familienname?: string | null; vornamen?: string | null;
  geburtsdatum?: string | null; staatsangehoerigkeit?: string | null; anschrift?: string | null;
  mitreisende_anzahl?: number | null; mitreisende_staaten?: string | null; ausweis_nr?: string | null;
  unterschrift?: string | null; reisegruppe?: boolean | null;
};
export const MELDESCHEIN_PFLICHT: [keyof Meldeschein, string][] = [
  ['ankunft', 'Ankunft'], ['abreise', 'voraussichtliche Abreise'], ['familienname', 'Familienname'], ['vornamen', 'Vornamen'],
  ['geburtsdatum', 'Geburtsdatum'], ['staatsangehoerigkeit', 'Staatsangehörigkeit(en)'], ['anschrift', 'Anschrift'],
  ['ausweis_nr', 'Seriennummer des Passes/Ausweises'], ['unterschrift', 'Unterschrift'],
];
export function pruefeMeldeschein(m: Meldeschein): { vollstaendig: boolean; fehlt: string[]; befunde: Befund[] } {
  const fehlt = MELDESCHEIN_PFLICHT.filter(([k]) => leer(m[k])).map(([, l]) => l);
  const befunde: Befund[] = [];
  if (istIsoDatum(m.ankunft) && istIsoDatum(m.abreise) && m.abreise < m.ankunft) befunde.push({ stufe: 'rot', text: 'Abreise liegt vor der Ankunft.' });
  if (istIsoDatum(m.geburtsdatum) && istIsoDatum(m.ankunft) && m.geburtsdatum > m.ankunft) befunde.push({ stufe: 'rot', text: 'Geburtsdatum liegt in der Zukunft.' });
  if ((m.mitreisende_anzahl ?? 0) > 0 && leer(m.mitreisende_staaten)) fehlt.push('Staatsangehörigkeiten der Mitreisenden');
  if (m.reisegruppe && (m.mitreisende_anzahl ?? 0) < 10) befunde.push({ stufe: 'gelb', text: 'Reisegruppe: Die Sonderregel gilt erst ab mehr als 10 Personen.' });
  if (meldepflichtig(m.staatsangehoerigkeit) === false) befunde.push({ stufe: 'gelb', text: 'Deutsche Staatsangehörigkeit: Seit 2025 ist kein Meldeschein nötig — er darf nicht „auf Vorrat" gespeichert werden.' });
  return { vollstaendig: fehlt.length === 0, fehlt, befunde };
}
/** Aufbewahrung bis Abreise + 1 Jahr, Vernichtung spätestens 3 Monate danach. */
export function meldescheinFristen(abreise: string | null | undefined, heute: string): { aufbewahrenBis: string | null; vernichtenBis: string | null; stufe: Stufe | null; text: string } {
  if (!istIsoDatum(abreise)) return { aufbewahrenBis: null, vernichtenBis: null, stufe: null, text: 'Abreise fehlt.' };
  const bis = plusMonate(abreise, 12);
  const vernichten = plusMonate(bis, 3);
  if (heute <= bis) return { aufbewahrenBis: bis, vernichtenBis: vernichten, stufe: 'ok', text: `aufbewahren bis ${datumDe(bis)}` };
  if (heute <= vernichten) return { aufbewahrenBis: bis, vernichtenBis: vernichten, stufe: 'gelb', text: `jetzt vernichten (spätestens ${datumDe(vernichten)})` };
  return { aufbewahrenBis: bis, vernichtenBis: vernichten, stufe: 'rot', text: `Vernichtung überfällig seit ${datumDe(vernichten)}` };
}

export type KurtaxeSatz = { satz_erwachsen: unknown; satz_kind?: unknown; kind_bis_alter?: unknown; frei_bis_alter?: unknown; max_naechte?: unknown };
export type KurtaxeGast = { name?: string; geburtsdatum?: string | null; alter?: unknown; befreit?: boolean };
export type KurtaxeZeile = { name: string; alter: number | null; naechte: number; satz: number; betragCent: number; grund: string };
export type KurtaxeErgebnis = { ok: boolean; fehler: string | null; naechte: number; zeilen: KurtaxeZeile[]; summeCent: number };

/** Kurtaxe je Gast und Nacht nach den Sätzen der eigenen Gemeinde (Satzung). */
export function kurtaxe(anreise: string, abreise: string, gaeste: KurtaxeGast[], s: KurtaxeSatz): KurtaxeErgebnis {
  const leerE = (fehler: string): KurtaxeErgebnis => ({ ok: false, fehler, naechte: 0, zeilen: [], summeCent: 0 });
  if (!istIsoDatum(anreise) || !istIsoDatum(abreise)) return leerE('An- und Abreise angeben.');
  const n = tageZwischen(anreise, abreise);
  if (n <= 0) return leerE('Abreise muss nach der Anreise liegen.');
  const erw = zahl(s.satz_erwachsen);
  if (erw == null || erw < 0) return leerE('Kurtaxe-Satz fehlt — bitte unter Einstellungen den Satz Ihrer Gemeinde eintragen.');
  const kind = zahl(s.satz_kind) ?? erw;
  const kindBis = zahl(s.kind_bis_alter);
  const freiBis = zahl(s.frei_bis_alter);
  const max = zahl(s.max_naechte);
  const naechte = max != null && max > 0 ? Math.min(n, max) : n;
  if (!gaeste.length) return leerE('Mindestens einen Gast angeben.');
  const zeilen = gaeste.map((g, i) => {
    const alter = istIsoDatum(g.geburtsdatum) ? alterAm(g.geburtsdatum, anreise) : zahl(g.alter);
    const name = g.name?.trim() || `Gast ${i + 1}`;
    if (g.befreit) return { name, alter, naechte, satz: 0, betragCent: 0, grund: 'befreit (laut Satzung)' };
    if (alter != null && freiBis != null && alter <= freiBis) return { name, alter, naechte, satz: 0, betragCent: 0, grund: `frei bis ${freiBis} Jahre` };
    const istKind = alter != null && kindBis != null && alter <= kindBis;
    const satz = istKind ? kind : erw;
    return { name, alter, naechte, satz, betragCent: Math.round(satz * 100) * naechte, grund: istKind ? `Kind bis ${kindBis} Jahre` : alter == null ? 'Erwachsene (Alter unbekannt)' : 'Erwachsene' };
  });
  return { ok: true, fehler: null, naechte, zeilen, summeCent: zeilen.reduce((a, z) => a + z.betragCent, 0) };
}

// ===========================================================================
// B  LOGISTIK — CMR-Frachtbrief, Tankkarten- und Maut-Abgleich
// ===========================================================================
export const CMR_HINWEIS = 'Der CMR-Frachtbrief gilt für grenzüberschreitende Straßentransporte (Übernahme und Ablieferung in verschiedenen Staaten). Drei Originale, unterschrieben von Absender und Frachtführer: Blatt 1 Absender, Blatt 2 begleitet das Gut zum Empfänger, Blatt 3 Frachtführer (Art. 5 CMR). Gefahrgut zusätzlich nach ADR 5.4.1.';
export type CmrPosition = { zeichen?: string; anzahl?: unknown; verpackung?: string; bezeichnung?: string; gewicht_kg?: unknown; volumen_m3?: unknown };
export type CmrGefahrgut = { un_nr?: string; bezeichnung?: string; klasse?: string; vg?: string; tunnel?: string };
export type Cmr = {
  absender?: string; absender_land?: string; empfaenger?: string; empfaenger_land?: string; frachtfuehrer?: string;
  uebernahme_ort?: string; uebernahme_datum?: string | null; ablieferung_ort?: string;
  ausgestellt_ort?: string; ausgestellt_am?: string | null; positionen?: CmrPosition[]; gefahrgut?: CmrGefahrgut[];
  weisungen?: string; kosten?: string;
};
export function pruefeCmr(c: Cmr): { vollstaendig: boolean; fehlt: string[]; befunde: Befund[]; gewichtKg: number | null; packstuecke: number | null } {
  const fehlt: string[] = [];
  const need: [unknown, string][] = [
    [c.ausgestellt_ort, 'Ort der Ausstellung (a)'], [c.ausgestellt_am, 'Tag der Ausstellung (a)'], [c.absender, 'Absender (b)'],
    [c.frachtfuehrer, 'Frachtführer (c)'], [c.uebernahme_ort, 'Übernahmeort (d)'], [c.uebernahme_datum, 'Übernahmetag (d)'],
    [c.ablieferung_ort, 'Ablieferungsort (d)'], [c.empfaenger, 'Empfänger (e)'],
  ];
  for (const [w, l] of need) if (leer(w)) fehlt.push(l);
  const pos = (c.positionen ?? []).filter((p) => !leer(p.bezeichnung) || !leer(p.anzahl) || !leer(p.gewicht_kg));
  const befunde: Befund[] = [];
  if (!pos.length) fehlt.push('mindestens eine Warenposition (f–h)');
  let gewicht: number | null = 0; let stueck: number | null = 0;
  pos.forEach((p, i) => {
    if (leer(p.bezeichnung)) fehlt.push(`Position ${i + 1}: Art des Gutes (f)`);
    if (leer(p.verpackung)) fehlt.push(`Position ${i + 1}: Art der Verpackung (f)`);
    const a = zahl(p.anzahl); const g = zahl(p.gewicht_kg);
    if (a == null || a <= 0) { fehlt.push(`Position ${i + 1}: Anzahl (g)`); stueck = null; } else if (stueck != null) stueck += a;
    if (g == null || g <= 0) { fehlt.push(`Position ${i + 1}: Rohgewicht (h)`); gewicht = null; } else if (gewicht != null) gewicht += g;
  });
  for (const [i, g] of (c.gefahrgut ?? []).entries()) {
    if (leer(g.un_nr) && leer(g.bezeichnung)) continue;
    if (!/^(UN\s?)?\d{4}$/i.test(String(g.un_nr ?? '').trim())) fehlt.push(`Gefahrgut ${i + 1}: UN-Nummer (4 Ziffern)`);
    if (leer(g.bezeichnung)) fehlt.push(`Gefahrgut ${i + 1}: offizielle Benennung`);
    if (leer(g.klasse)) fehlt.push(`Gefahrgut ${i + 1}: Klasse`);
  }
  const al = String(c.absender_land ?? '').trim().toUpperCase(); const el = String(c.empfaenger_land ?? '').trim().toUpperCase();
  if (al && el && al === el) befunde.push({ stufe: 'gelb', text: 'Absender und Empfänger im selben Staat: CMR gilt nur grenzüberschreitend — im Inland Frachtbrief nach § 408 HGB.' });
  if (istIsoDatum(c.uebernahme_datum) && istIsoDatum(c.ausgestellt_am) && c.uebernahme_datum < c.ausgestellt_am) befunde.push({ stufe: 'gelb', text: 'Übernahmetag liegt vor dem Ausstellungstag.' });
  return { vollstaendig: fehlt.length === 0, fehlt, befunde, gewichtKg: gewicht, packstuecke: stueck };
}
export function naechsteCmrNummer(vorhandene: (string | null | undefined)[], jahr: number): string {
  const re = new RegExp(`^CMR-${jahr}-(\\d+)$`);
  const max = vorhandene.reduce((m, n) => { const t = re.exec(String(n ?? '')); return t ? Math.max(m, Number(t[1])) : m; }, 0);
  return `CMR-${jahr}-${String(max + 1).padStart(3, '0')}`;
}

// --- Tankkarten / Maut -------------------------------------------------------
export type KartenArt = 'tanken' | 'maut';
export type KartenBuchung = { datum: string; zeit: string | null; kennzeichen: string; produkt: string | null; liter: number | null; km: number | null; betrag: number | null; ort: string | null; karte: string | null };

function spaltenIndex(kopf: string[], namen: RegExp): number { return kopf.findIndex((k) => namen.test(k)); }
function leseDatum(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(t);
  if (m) { const j = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); const iso = `${j}-${zwei(Number(m[2]))}-${zwei(Number(m[1]))}`; return istIsoDatum(iso) ? iso : null; }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return istIsoDatum(t.slice(0, 10)) ? t.slice(0, 10) : null;
  return null;
}
function zellen(zeile: string, trenner: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < zeile.length; i++) {
    const ch = zeile[i];
    if (ch === '"') { if (q && zeile[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === trenner && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
export function normKennzeichen(k: string | null | undefined): string { return String(k ?? '').toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, ''); }

/** Liest den CSV-Export einer Tankkarte bzw. den Einzelfahrtennachweis der Maut. */
export function leseKartenCsv(text: string): { zeilen: KartenBuchung[]; fehler: string[] } {
  const roh = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((z) => z.trim());
  if (roh.length < 2) return { zeilen: [], fehler: ['Die Datei enthält keine Buchungen.'] };
  const trenner = (roh[0].match(/;/g)?.length ?? 0) >= (roh[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const kopf = zellen(roh[0], trenner).map((k) => k.toLowerCase());
  const iD = spaltenIndex(kopf, /datum|date/); const iK = spaltenIndex(kopf, /kennzeichen|kfz|fahrzeug|plate/);
  if (iD < 0 || iK < 0) return { zeilen: [], fehler: ['Spalten „Datum" und „Kennzeichen" nicht gefunden.'] };
  const iZ = spaltenIndex(kopf, /uhrzeit|zeit|time/); const iP = spaltenIndex(kopf, /produkt|artikel|warenart|kraftstoff|sorte/);
  const iL = spaltenIndex(kopf, /liter|menge|volumen/); const iKm = spaltenIndex(kopf, /strecke|km|kilometer/);
  const iB = spaltenIndex(kopf, /betrag|brutto|umsatz|summe|preis gesamt|gesamt/); const iO = spaltenIndex(kopf, /ort|station|tankstelle|stelle/);
  const iC = spaltenIndex(kopf, /karte|kartennummer|card/);
  const zeilen: KartenBuchung[] = []; const fehler: string[] = [];
  roh.slice(1).forEach((z, n) => {
    const c = zellen(z, trenner);
    const datum = leseDatum(c[iD] ?? '');
    const kz = (c[iK] ?? '').trim();
    if (!datum || !kz) { fehler.push(`Zeile ${n + 2}: Datum oder Kennzeichen unlesbar — übersprungen.`); return; }
    const w = (i: number) => (i >= 0 ? zahl(c[i]) : null);
    zeilen.push({ datum, zeit: iZ >= 0 && /^\d{1,2}:\d{2}/.test(c[iZ] ?? '') ? (c[iZ] as string).slice(0, 5).padStart(5, '0') : null, kennzeichen: kz, produkt: iP >= 0 ? c[iP] || null : null, liter: w(iL), km: w(iKm), betrag: w(iB), ort: iO >= 0 ? c[iO] || null : null, karte: iC >= 0 ? c[iC] || null : null });
  });
  return { zeilen, fehler };
}
/** Schlüssel gegen doppelten Import. */
export function buchungsSchluessel(b: Pick<KartenBuchung, 'datum' | 'zeit' | 'kennzeichen' | 'liter' | 'km' | 'betrag'>): string {
  return [b.datum, b.zeit ?? '', normKennzeichen(b.kennzeichen), b.liter ?? '', b.km ?? '', b.betrag ?? ''].join('|');
}

export type KraftstoffKlasse = 'diesel' | 'benzin' | 'adblue' | 'strom' | 'gas' | 'sonstiges';
export function kraftstoffKlasse(text: string | null | undefined): KraftstoffKlasse {
  const t = String(text ?? '').toLowerCase();
  if (/adblue|harnstoff/.test(t)) return 'adblue';
  if (/diesel|hvo|b7/.test(t)) return 'diesel';
  if (/super|benzin|e10|e5|\b9[58]\b|ottokraftstoff|v-power|ultimate 102/.test(t)) return 'benzin';
  if (/strom|laden|kwh|elektro|ladung/.test(t)) return 'strom';
  if (/lpg|autogas|cng|erdgas/.test(t)) return 'gas';
  return 'sonstiges';
}
export type FahrzeugLite = { id: string; kennzeichen: string | null; bezeichnung?: string | null; kraftstoff: string | null; tank_liter?: number | null };
export type TourLite = { datum: string; fahrzeug: string | null };

/** Befunde je Tankbuchung: Kennzeichen, Kraftstoff, Tankgröße, Preis, Tour, Wochenende. */
export function pruefeTankung(b: KartenBuchung, fahrzeuge: FahrzeugLite[], touren: TourLite[], alle: KartenBuchung[]): Befund[] {
  const out: Befund[] = [];
  const f = fahrzeuge.find((x) => normKennzeichen(x.kennzeichen) === normKennzeichen(b.kennzeichen));
  if (!f) out.push({ stufe: 'rot', text: 'Kennzeichen nicht im Fuhrpark.' });
  const kl = kraftstoffKlasse(b.produkt);
  if (f && f.kraftstoff) {
    const fk = kraftstoffKlasse(f.kraftstoff);
    const erlaubt: Record<string, KraftstoffKlasse[]> = { diesel: ['diesel', 'adblue'], benzin: ['benzin'], strom: ['strom'], gas: ['gas', 'benzin'] };
    if (erlaubt[fk] && ['diesel', 'benzin', 'adblue', 'strom', 'gas'].includes(kl) && !erlaubt[fk].includes(kl)) out.push({ stufe: 'rot', text: `Produkt „${b.produkt}" passt nicht zum Kraftstoff des Fahrzeugs (${f.kraftstoff}).` });
  }
  if (kl === 'sonstiges' && b.produkt) out.push({ stufe: 'gelb', text: `Kein Kraftstoff: „${b.produkt}" — privat oder Betriebsbedarf?` });
  if (f?.tank_liter && b.liter != null && (kl === 'diesel' || kl === 'benzin')) {
    const tag = alle.filter((x) => x.datum === b.datum && normKennzeichen(x.kennzeichen) === normKennzeichen(b.kennzeichen) && ['diesel', 'benzin'].includes(kraftstoffKlasse(x.produkt)));
    const summe = tag.reduce((s, x) => s + (x.liter ?? 0), 0);
    if (b.liter > f.tank_liter * 1.05) out.push({ stufe: 'rot', text: `${b.liter.toLocaleString('de-DE')} l — mehr als der Tank fasst (${f.tank_liter} l).` });
    else if (tag.length > 1 && summe > f.tank_liter * 1.05) out.push({ stufe: 'rot', text: `Am selben Tag zusammen ${summe.toLocaleString('de-DE')} l — mehr als ein Tank (${f.tank_liter} l).` });
  }
  if (b.liter != null && b.betrag != null && b.liter > 0 && (kl === 'diesel' || kl === 'benzin')) {
    const pl = b.betrag / b.liter;
    if (pl < 0.9 || pl > 3.5) out.push({ stufe: 'gelb', text: `Literpreis ${pl.toFixed(2).replace('.', ',')} € unplausibel — Menge oder Betrag prüfen.` });
  }
  if (f && touren.length) {
    const hat = touren.some((t) => t.datum === b.datum && (normKennzeichen(t.fahrzeug) === normKennzeichen(f.kennzeichen) || (f.bezeichnung && String(t.fahrzeug ?? '').trim().toLowerCase() === f.bezeichnung.trim().toLowerCase())));
    if (!hat) out.push({ stufe: 'gelb', text: 'An diesem Tag keine Tour mit dem Fahrzeug geplant.' });
  }
  const wt = new Date(`${b.datum}T12:00:00Z`).getUTCDay();
  if (wt === 0 || wt === 6) out.push({ stufe: 'gelb', text: 'Tankung am Wochenende.' });
  if (b.zeit && (Number(b.zeit.slice(0, 2)) >= 22 || Number(b.zeit.slice(0, 2)) < 5)) out.push({ stufe: 'gelb', text: `Tankung nachts (${b.zeit} Uhr).` });
  return out;
}
export function pruefeMaut(b: KartenBuchung, fahrzeuge: FahrzeugLite[], touren: TourLite[]): Befund[] {
  const out: Befund[] = [];
  const f = fahrzeuge.find((x) => normKennzeichen(x.kennzeichen) === normKennzeichen(b.kennzeichen));
  if (!f) out.push({ stufe: 'rot', text: 'Kennzeichen nicht im Fuhrpark.' });
  if (f && touren.length && !touren.some((t) => t.datum === b.datum && (normKennzeichen(t.fahrzeug) === normKennzeichen(f.kennzeichen) || (f.bezeichnung && String(t.fahrzeug ?? '').trim().toLowerCase() === f.bezeichnung.trim().toLowerCase())))) {
    out.push({ stufe: 'gelb', text: 'Mautfahrt an einem Tag ohne Tour.' });
  }
  if (b.km != null && b.betrag != null && b.km > 0 && b.betrag / b.km > 1) out.push({ stufe: 'gelb', text: 'Mehr als 1 € Maut je km — Achsklasse/CO₂-Klasse prüfen.' });
  return out;
}
/** Summen je Kennzeichen und Monat. */
export function kartenSummen(buchungen: (KartenBuchung & { art: KartenArt })[], monat: string): { kennzeichen: string; tankenCent: number; liter: number; mautCent: number; mautKm: number }[] {
  const m = new Map<string, { kennzeichen: string; tankenCent: number; liter: number; mautCent: number; mautKm: number }>();
  for (const b of buchungen) {
    if (!b.datum.startsWith(monat)) continue;
    const k = normKennzeichen(b.kennzeichen);
    const x = m.get(k) ?? { kennzeichen: b.kennzeichen.trim().toUpperCase(), tankenCent: 0, liter: 0, mautCent: 0, mautKm: 0 };
    if (b.art === 'maut') { x.mautCent += Math.round((b.betrag ?? 0) * 100); x.mautKm += b.km ?? 0; }
    else { x.tankenCent += Math.round((b.betrag ?? 0) * 100); x.liter += b.liter ?? 0; }
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.tankenCent + b.mautCent - (a.tankenCent + a.mautCent));
}

// ===========================================================================
// C  GELDWÄSCHE — Identifizierung nach GwG
// ===========================================================================
export type GwgBereich = 'kfz' | 'immobilien' | 'kanzlei' | 'handel';
export const GWG_SCHWELLE_BAR = 10_000;
export const GWG_SCHWELLE_EDELMETALL = 2_000;
export const GWG_SCHWELLE_MIETE = 10_000;
export const GWG_HINWEIS = 'Güterhändler identifizieren bei Barzahlungen ab 10.000 € (Edelmetalle ab 2.000 €, Kunst ab 10.000 € auch unbar) — auch wenn mehrere verbundene Zahlungen zusammen die Schwelle erreichen (§ 10 Abs. 6a GwG). Makler: bei Kaufverträgen sowie Mieten ab 10.000 € im Monat. Aufzeichnungen 5 Jahre aufbewahren, danach vernichten, spätestens nach 10 Jahren (§ 8 Abs. 4 GwG). Verdachtsfälle unverzüglich über goAML an die FIU melden — dem Kunden gegenüber nichts erwähnen (§ 47 GwG). Ab 10.07.2027 gilt EU-weit eine Bargeld-Obergrenze von 10.000 €.';
export const KANZLEI_KATALOG: { key: string; label: string }[] = [
  { key: 'immobilie', label: 'Kauf/Verkauf von Immobilien oder Gewerbebetrieben' },
  { key: 'vermoegen', label: 'Verwaltung von Geld, Wertpapieren oder sonstigen Vermögenswerten' },
  { key: 'konto', label: 'Eröffnung oder Verwaltung von Bank-, Spar- oder Wertpapierkonten' },
  { key: 'gesellschaft', label: 'Gründung, Betrieb oder Verwaltung von Gesellschaften (inkl. Mittelbeschaffung)' },
  { key: 'treuhand', label: 'Treuhandgeschäfte / Finanz- oder Immobilientransaktionen im Namen des Mandanten' },
  { key: 'steuer', label: 'Steuerberatung (Steuerberater sind stets verpflichtet)' },
];

export type GwgAnlass = { bereich: GwgBereich; bar?: unknown; betrag?: unknown; ware?: 'allgemein' | 'edelmetall' | 'kunst'; makler?: 'kauf' | 'miete'; monatsmiete?: unknown; katalog?: string[] };
export function gwgPflicht(a: GwgAnlass): { pflichtig: boolean; grund: string } {
  const bar = zahl(a.bar) ?? 0; const betrag = zahl(a.betrag) ?? 0;
  if (a.bereich === 'immobilien') {
    if (a.makler === 'kauf') return { pflichtig: true, grund: 'Vermittlung eines Kaufvertrags: beide Vertragsparteien identifizieren.' };
    const m = zahl(a.monatsmiete) ?? 0;
    if (m >= GWG_SCHWELLE_MIETE) return { pflichtig: true, grund: `Monatsmiete ${euroText(m)} erreicht die Schwelle von 10.000 €.` };
    if (bar >= GWG_SCHWELLE_BAR) return { pflichtig: true, grund: `Barzahlung ${euroText(bar)} ab 10.000 €.` };
    return { pflichtig: false, grund: 'Mietvermittlung unter 10.000 € Monatsmiete.' };
  }
  if (a.bereich === 'kanzlei') {
    const k = (a.katalog ?? []).filter((x) => KANZLEI_KATALOG.some((y) => y.key === x));
    return k.length ? { pflichtig: true, grund: `Kataloggeschäft: ${KANZLEI_KATALOG.filter((y) => k.includes(y.key)).map((y) => y.label).join('; ')}.` } : { pflichtig: false, grund: 'Kein Kataloggeschäft nach § 2 Abs. 1 Nr. 10 GwG gewählt.' };
  }
  if (a.ware === 'edelmetall' && bar >= GWG_SCHWELLE_EDELMETALL) return { pflichtig: true, grund: `Edelmetall bar ${euroText(bar)} ab 2.000 €.` };
  if (a.ware === 'kunst' && Math.max(bar, betrag) >= GWG_SCHWELLE_BAR) return { pflichtig: true, grund: `Kunstgeschäft ${euroText(Math.max(bar, betrag))} ab 10.000 €.` };
  if (bar >= GWG_SCHWELLE_BAR) return { pflichtig: true, grund: `Barzahlung ${euroText(bar)} ab 10.000 €.` };
  return { pflichtig: false, grund: bar > 0 ? `Barzahlung ${euroText(bar)} unter der Schwelle.` : 'Keine Barzahlung.' };
}
/** Verbundene Barzahlungen desselben Kunden (Stückelung) innerhalb von `tage` Tagen. */
export function verbundeneBarzahlungen(zahlungen: { kunde: string; datum: string; bar: number }[], kunde: string, datum: string, barNeu: number, tage = 365): { summe: number; anzahl: number; erreicht: boolean } {
  const k = kunde.trim().toLowerCase();
  const rel = zahlungen.filter((z) => z.kunde.trim().toLowerCase() === k && istIsoDatum(z.datum) && Math.abs(tageZwischen(z.datum, datum)) <= tage);
  const summe = rel.reduce((s, z) => s + (Number(z.bar) || 0), 0) + barNeu;
  return { summe, anzahl: rel.length + 1, erreicht: rel.length > 0 && barNeu < GWG_SCHWELLE_BAR && summe >= GWG_SCHWELLE_BAR };
}

export type GwgPerson = {
  art: 'natuerlich' | 'juristisch';
  nachname?: string | null; vornamen?: string | null; geburtsdatum?: string | null; geburtsort?: string | null; staatsangehoerigkeit?: string | null; anschrift?: string | null;
  ausweis_art?: string | null; ausweis_nr?: string | null; ausweis_behoerde?: string | null; ausweis_gueltig_bis?: string | null;
  firma?: string | null; rechtsform?: string | null; register_nr?: string | null; vertreter?: string | null; wirtschaftlich_berechtigte?: string | null; transparenzregister?: boolean | null;
  pep?: boolean | null; mittelherkunft?: string | null; leitung_zugestimmt?: boolean | null; risiko?: 'gering' | 'normal' | 'hoch' | null;
};
export function pruefeIdentifizierung(p: GwgPerson, datum: string): { vollstaendig: boolean; fehlt: string[]; befunde: Befund[] } {
  const fehlt: string[] = []; const befunde: Befund[] = [];
  const need = (w: unknown, l: string) => { if (leer(w)) fehlt.push(l); };
  if (p.art === 'juristisch') {
    need(p.firma, 'Firma/Name'); need(p.rechtsform, 'Rechtsform'); need(p.register_nr, 'Registernummer'); need(p.anschrift, 'Anschrift Sitz');
    need(p.vertreter, 'Vertretungsberechtigte'); need(p.wirtschaftlich_berechtigte, 'wirtschaftlich Berechtigte');
    if (!p.transparenzregister) fehlt.push('Transparenzregister-Auszug eingesehen');
  }
  // Auftretende natürliche Person (auch Vertreter einer Firma) immer mit Ausweis.
  need(p.nachname, 'Nachname'); need(p.vornamen, 'Vornamen'); need(p.geburtsdatum, 'Geburtsdatum'); need(p.geburtsort, 'Geburtsort');
  need(p.staatsangehoerigkeit, 'Staatsangehörigkeit'); if (p.art === 'natuerlich') need(p.anschrift, 'Wohnanschrift');
  need(p.ausweis_art, 'Art des Ausweises'); need(p.ausweis_nr, 'Ausweisnummer'); need(p.ausweis_behoerde, 'ausstellende Behörde');
  if (istIsoDatum(p.ausweis_gueltig_bis) && istIsoDatum(datum) && p.ausweis_gueltig_bis < datum) befunde.push({ stufe: 'rot', text: `Ausweis abgelaufen am ${datumDe(p.ausweis_gueltig_bis)} — nicht zur Identifizierung geeignet.` });
  if (leer(p.ausweis_gueltig_bis)) fehlt.push('Ausweis gültig bis');
  if (p.pep || p.risiko === 'hoch') {
    if (leer(p.mittelherkunft)) fehlt.push('Herkunft der Mittel (verstärkte Sorgfalt)');
    if (!p.leitung_zugestimmt) fehlt.push('Zustimmung der Geschäftsleitung (verstärkte Sorgfalt)');
    befunde.push({ stufe: 'gelb', text: p.pep ? 'Politisch exponierte Person: verstärkte Sorgfaltspflichten (§ 15 GwG).' : 'Hohes Risiko: verstärkte Sorgfaltspflichten (§ 15 GwG).' });
  }
  return { vollstaendig: fehlt.length === 0, fehlt, befunde };
}
/** Aufbewahrung: 5 Jahre ab Ende des Kalenderjahres, dann vernichten; spätestens nach 10 Jahren. */
export function gwgAufbewahrung(datum: string, heute: string): { bis: string | null; spaetestens: string | null; stufe: Stufe | null; text: string } {
  if (!istIsoDatum(datum)) return { bis: null, spaetestens: null, stufe: null, text: 'Datum fehlt.' };
  const j = Number(datum.slice(0, 4));
  const bis = `${j + 5}-12-31`; const spaet = `${j + 10}-12-31`;
  if (heute <= bis) return { bis, spaetestens: spaet, stufe: 'ok', text: `aufbewahren bis ${datumDe(bis)}` };
  if (heute <= spaet) return { bis, spaetestens: spaet, stufe: 'gelb', text: `Frist abgelaufen — vernichten (spätestens ${datumDe(spaet)})` };
  return { bis, spaetestens: spaet, stufe: 'rot', text: 'Höchstfrist 10 Jahre überschritten — sofort vernichten' };
}

// ===========================================================================
// D  AGENTUR — Nutzungsrechte
// ===========================================================================
export type Nutzungsrecht = {
  werk: string; kunde?: string | null; recht: 'einfach' | 'ausschliesslich'; raum?: string | null; medien?: string[] | null;
  von?: string | null; bis?: string | null; bearbeitung?: boolean | null; weiterlizenz?: boolean | null;
  urheber?: string | null; fremd_recht?: 'einfach' | 'ausschliesslich' | null; fremd_bis?: string | null; fremd_medien?: string[] | null;
};
export const MEDIEN = ['Print', 'Website', 'Social Media', 'Online-Werbung', 'TV/Video', 'Außenwerbung', 'Verpackung', 'Messe/Event'];
export function nutzungsStand(n: Nutzungsrecht, heute: string, vorlaufTage = 60): Befund[] {
  const out: Befund[] = [];
  if (istIsoDatum(n.bis)) {
    if (n.bis < heute) out.push({ stufe: 'rot', text: `Nutzungsrecht abgelaufen am ${datumDe(n.bis)} — Kunde darf nicht mehr nutzen oder verlängern.` });
    else if (tageZwischen(heute, n.bis) <= vorlaufTage) out.push({ stufe: 'gelb', text: `Läuft am ${datumDe(n.bis)} ab — Verlängerung anbieten.` });
  }
  if (!leer(n.urheber)) {
    if (n.fremd_recht === 'einfach' && n.recht === 'ausschliesslich') out.push({ stufe: 'rot', text: 'Sie räumen ein ausschließliches Recht ein, haben selbst aber nur ein einfaches.' });
    if (istIsoDatum(n.fremd_bis) && (!istIsoDatum(n.bis) || n.fremd_bis < n.bis)) out.push({ stufe: 'rot', text: `Ihr eigenes Recht vom Urheber endet schon am ${datumDe(n.fremd_bis)} — früher als das Recht des Kunden.` });
    if (istIsoDatum(n.fremd_bis) && n.fremd_bis < heute) out.push({ stufe: 'rot', text: 'Ihr eigenes Recht vom Urheber ist abgelaufen.' });
    const fehlen = (n.medien ?? []).filter((m) => n.fremd_medien && n.fremd_medien.length && !n.fremd_medien.includes(m));
    if (fehlen.length) out.push({ stufe: 'rot', text: `Für ${fehlen.join(', ')} haben Sie selbst keine Rechte vom Urheber.` });
  }
  if (!(n.medien ?? []).length) out.push({ stufe: 'gelb', text: 'Keine Nutzungsarten benannt — im Zweifel gilt nur der Vertragszweck (§ 31 Abs. 5 UrhG).' });
  if (!out.length) out.push({ stufe: 'ok', text: istIsoDatum(n.bis) ? `gültig bis ${datumDe(n.bis)}` : 'unbefristet' });
  return out;
}
export function rechteKlausel(n: Nutzungsrecht, agentur: string): string {
  const art = n.recht === 'ausschliesslich' ? 'das ausschließliche' : 'das einfache';
  const zeit = istIsoDatum(n.bis) ? `vom ${datumDe(n.von ?? null)} bis zum ${datumDe(n.bis)}` : `ab ${datumDe(n.von ?? null)} zeitlich unbegrenzt`;
  const medien = (n.medien ?? []).length ? (n.medien as string[]).join(', ') : '[Nutzungsarten]';
  return [
    `Nutzungsrechte an „${n.werk}"`,
    '',
    `${agentur || '[Agentur]'} räumt ${n.kunde || '[Kunde]'} ${art} Recht ein, das Werk ${zeit} im Gebiet ${n.raum || '[Gebiet]'} für folgende Nutzungsarten zu verwenden: ${medien}.`,
    n.bearbeitung ? 'Bearbeitungen und Umgestaltungen sind gestattet.' : 'Bearbeitungen und Umgestaltungen bedürfen der vorherigen Zustimmung.',
    n.weiterlizenz ? 'Die Weitergabe an Dritte ist gestattet.' : 'Eine Weitergabe oder Unterlizenzierung an Dritte ist nicht gestattet.',
    'Weitere Nutzungsarten sind nicht eingeräumt. Das Recht geht erst mit vollständiger Zahlung der vereinbarten Vergütung über.',
    n.urheber ? `Urhebervermerk: © ${n.urheber}` : '',
  ].filter((z) => z !== '').join('\n');
}

// ===========================================================================
// E  LANDWIRTSCHAFT — Dünge-Fristen (nur Erinnerung)
// ===========================================================================
export const DUENGE_HINWEIS = 'Düngeverordnung: Düngebedarf für Stickstoff und Phosphat VOR der Düngung je Schlag ermitteln, jede Düngung spätestens 2 Tage danach aufzeichnen, Jahressumme bis 31. März des Folgejahres. Sperrfristen: Ackerland nach Ernte der Hauptfrucht bis 31.01. (Ausnahmen bis 01.10.), Grünland 01.11.–31.01. (rote Gebiete ab 15.10.), Festmist/Kompost und Phosphat 01.12.–15.01. Die Stoffstrombilanz ist seit 08.07.2025 abgeschafft. Landesrecht und rote Gebiete können abweichen — nur Erinnerung, keine Fachberatung.';
export type Flaechenart = 'acker' | 'gruenland';
export function flaechenart(kultur: string | null | undefined, gesetzt?: string | null): Flaechenart {
  if (gesetzt === 'acker' || gesetzt === 'gruenland') return gesetzt;
  return /grünland|gruenland|wiese|weide|dauergrün|mähweide/i.test(String(kultur ?? '')) ? 'gruenland' : 'acker';
}
function mmtt(iso: string): number { return Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10)); }
function inZeitraum(iso: string, von: number, bis: number): boolean { const x = mmtt(iso); return von <= bis ? x >= von && x <= bis : x >= von || x <= bis; }

export type DuengeMassnahme = { id: string; schlag_id: string; datum: string; erstellt_am?: string | null; mittel?: string | null; art?: string | null };
export function pruefeDuengung(m: DuengeMassnahme, schlag: { kultur?: string | null; flaechenart?: string | null; rotes_gebiet?: boolean | null }, bedarfErmitteltAm: string | null): Befund[] {
  const out: Befund[] = [];
  if (!istIsoDatum(m.datum)) return [{ stufe: 'gelb', text: 'Datum fehlt.' }];
  if (!istIsoDatum(bedarfErmitteltAm)) out.push({ stufe: 'rot', text: `Keine Düngebedarfsermittlung für ${m.datum.slice(0, 4)} eingetragen.` });
  else if (bedarfErmitteltAm > m.datum) out.push({ stufe: 'rot', text: `Bedarf erst am ${datumDe(bedarfErmitteltAm)} ermittelt — nach der Düngung.` });
  if (m.erstellt_am) {
    const erf = String(m.erstellt_am).slice(0, 10);
    if (istIsoDatum(erf) && tageZwischen(m.datum, erf) > 2) out.push({ stufe: 'gelb', text: `Aufgezeichnet am ${datumDe(erf)} — später als 2 Tage nach der Düngung.` });
  }
  const mittel = String(m.mittel ?? '').toLowerCase();
  const art = flaechenart(schlag.kultur, schlag.flaechenart);
  if (/festmist|kompost/.test(mittel)) {
    if (inZeitraum(m.datum, 1201, 115)) out.push({ stufe: 'rot', text: 'Festmist/Kompost in der Sperrfrist 01.12.–15.01.' });
  } else {
    if (/phosphat|\bp2o5\b|tsp|dap/.test(mittel) && inZeitraum(m.datum, 1201, 115)) out.push({ stufe: 'rot', text: 'Phosphathaltiger Dünger in der Sperrfrist 01.12.–15.01.' });
    if (art === 'gruenland') {
      const beginn = schlag.rotes_gebiet ? 1015 : 1101;
      if (inZeitraum(m.datum, beginn, 131)) out.push({ stufe: 'rot', text: `Grünland in der Sperrfrist ${schlag.rotes_gebiet ? '15.10.' : '01.11.'}–31.01.` });
    } else {
      if (inZeitraum(m.datum, 1002, 131)) out.push({ stufe: 'rot', text: 'Ackerland nach der Ernte: Sperrfrist bis 31.01. (Ausnahmen nur bis 01.10.).' });
      else if (inZeitraum(m.datum, 801, 1001)) out.push({ stufe: 'gelb', text: 'Herbstdüngung nach der Ernte nur für Zwischenfrüchte, Winterraps, Feldfutter oder Wintergerste nach Getreide — Ausnahme prüfen.' });
    }
  }
  return out;
}
export type DuengeFrist = { datum: string; titel: string; stufe: Stufe };
/** Kalender der festen Dünge-Termine rund um `heute` (nächste 12 Monate + gerade laufend). */
export function duengeFristen(heute: string, rotesGebiet = false): DuengeFrist[] {
  const j = Number(heute.slice(0, 4));
  const roh: { datum: string; titel: string }[] = [];
  for (const y of [j - 1, j, j + 1]) {
    roh.push({ datum: `${y}-03-31`, titel: `Jahressumme Nährstoffeinsatz ${y - 1} fertig` });
    roh.push({ datum: `${y}-01-31`, titel: 'Ende Sperrfrist Stickstoff (Acker/Grünland)' });
    roh.push({ datum: `${y}-01-15`, titel: 'Ende Sperrfrist Festmist/Kompost/Phosphat' });
    roh.push({ datum: `${y}-10-01`, titel: 'Letzter Tag Herbst-Ausnahmen Ackerland' });
    roh.push({ datum: rotesGebiet ? `${y}-10-15` : `${y}-11-01`, titel: `Beginn Sperrfrist Grünland${rotesGebiet ? ' (rotes Gebiet)' : ''}` });
    roh.push({ datum: `${y}-12-01`, titel: 'Beginn Sperrfrist Festmist/Kompost/Phosphat' });
    roh.push({ datum: `${y}-02-01`, titel: `Düngebedarf ${y} vor der ersten Gabe ermitteln` });
  }
  const bis = plusMonate(heute, 12);
  return roh.filter((f) => f.datum >= plusTage(heute, -30) && f.datum <= bis)
    .map((f) => ({ ...f, stufe: (f.datum < heute || tageZwischen(heute, f.datum) <= 14 ? 'gelb' : 'ok') as Stufe }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}
