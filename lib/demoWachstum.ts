// ============================================================================
// ARGONAUT OS · lib/demoWachstum.ts — Paket 300: Wachstums-Motor der Zeitreise
//
// Stufe 3 der Zeitreise-Vorführung („nach 18 Monaten") für jede Branche: ein
// Betrieb, der ARGONAUT seit anderthalb Jahren täglich nutzt. Dieser Motor
// baut aus einem Branchen-Profil (lib/demoWachstumProfile) die gemeinsame
// Grundlage, die jede Branche hat —
//
//   Team in Abteilungen · Kunden (privat und gewerblich) · Angebote, Aufträge,
//   Rechnungen mit Zahlungen über 18 Monate mit wachsender Kurve (Chef-Blick,
//   EÜR, Startseite rechnen daraus) · Eingangsbelege · Termine · Projekte mit
//   Aufgaben · Urlaub · Zeiterfassung · Leads und Verkaufschancen · Kampagnen
//
// — und für das Handwerk die volle Baustelle: Einsatzplanung mit Monteuren,
// Baustellen-Projekte, Bautagebuch, Mängel, Aufmaße, Wartungsverträge.
// Dazu kommen die Branchen-Module aus dem Musterbetrieb XXL (Spalten und Werte
// gegen den Live-Aufbau geprüft), je Profil ausgewählt.
//
// Regeln wie bei den Kfz-Fachdaten (P297/P298): alles erfunden, Adressen auf
// example.com, jede Zeile im Register, Löschen Kinder vor Eltern. Rechnungen
// tragen eine eigene Nummer je Betrieb (z. B. „FST-2026-0412") — so verbraucht
// die Vorführung keine Nummern aus dem gemeinsamen Nummernkreis. Rechnungen
// bleiben unverschickt (keine Festschreibung). Gleiche Daten bei jedem Lauf
// (fester Zufall), Zeit nur über `heute`. Unter 1.000 Zeilen je Tabelle.
// Reine Logik, node-getestet (tests/demoWachstumP300).
// ============================================================================

import { tagPlus, berlinZeit, letzteWerktage, XXL_NOTIZ, type XxlKontext } from './musterbetriebXxl';
import { XXL_ALLE_SEEDER, XXL_BRANCHEN_LOESCH_ORDER } from './musterbetriebXxlBranchen';
import { zufall, wochentag } from './demoFachdatenKfzPremium';
import { centRunden } from './zahlen';
import type { SeedZeile } from './uebungswelt';
import type { FachSeeder } from './demoFachdatenKfz';

export const WACHSTUM_NOTIZ = 'Beispiel-Datensatz · Zeitreise nach 18 Monaten';
const QUELLE = 'Beispiel';
/** Monate Geschichte (Rechnungen, Angebote, Belege). */
export const MONATE = 18;

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------
/** [Position, Anzahl, Wochenstunden] */
export type Rolle = [string, number, number?];
export type Abteilung = { name: string; rollen: Rolle[]; aussen?: boolean };
/** [Bezeichnung, Einheit, Menge von, Menge bis, Preis netto je Einheit] */
export type Leistung = [string, string, number, number, number];

export type WachstumProfil = {
  /** Vorführ-Betrieb der Stufe 3 (slug in lib/demoBetriebe). */
  slug: string;
  /** Stufe 2 derselben Branche (bestehender Vorführ-Betrieb). */
  basis: string;
  /** Leeres Konto der Stufe 1. */
  start: string;
  /** Zeitreise-Reihe: Anzeige */
  branche: string;
  icon: string;
  /** Kürzel für Rechnungs-, Angebots- und Auftragsnummern (3 Großbuchstaben, je Betrieb eindeutig). */
  prefix: string;
  team: Abteilung[];
  kunden: number;
  firmenAnteil: number;
  leistungen: Leistung[];
  /** Rechnungen je Monat: vor 18 Monaten → heute */
  rechnungenStart: number;
  rechnungenEnde: number;
  /** Rechnungsumsatz netto der letzten 12 Monate, auf den die Mengen hochgerechnet werden (Pauschalen bleiben). */
  umsatzJahr: number;
  /** Laufende Kosten je Monat: [Lieferant, Kategorie, Netto, USt-Satz] */
  kosten: [string, string, number, number][];
  /** Einkauf je Rechnung in Prozent vom Netto (Material, Wareneinsatz) — 0 = keiner */
  einkaufQuote: number;
  einkaufLieferant: string;
  /** Handwerk: Baustellen, Einsatzplanung, Bautagebuch, Mängel, Aufmaße, Wartung */
  handwerk?: { baustellen: string[]; wartung: number; aufmasse: boolean };
  /** Branchen-Module aus dem Musterbetrieb XXL (keys aus XXL_ALLE_SEEDER) */
  module: string[];
  kampagnen: string[];
  /** Was die Stufe-3-Karte in der Vorführung verspricht. */
  zeigt: string;
};

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const ganz = (r: () => number, von: number, bis: number) => von + Math.floor(r() * (bis - von + 1));
const eins = <T,>(r: () => number, l: readonly T[]): T => l[Math.floor(r() * l.length)];
const nimm = (ctx: XxlKontext, tabelle: string, i: number): string | null => {
  const l = ctx.ids[tabelle] || [];
  return l.length ? l[((i % l.length) + l.length) % l.length] : null;
};
const istWerktag = (t: string) => { const w = wochentag(t); return w !== 0 && w !== 6; };
const ascii = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '');
const tageHer = (heute: string, tag: string) => Math.round((Date.parse(heute) - Date.parse(tag)) / 86400000);
/** Startwert je Betrieb — jeder Betrieb hat seine eigenen, aber festen Zahlen. */
export function startwert(slug: string): number {
  let h = 2166136261;
  for (const c of slug) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const nr4 = (n: number) => String(n).padStart(4, '0');

const VORNAMEN = ['Thomas', 'Michael', 'Andreas', 'Stefan', 'Christian', 'Markus', 'Frank', 'Jürgen', 'Matthias', 'Oliver', 'Alexander', 'Martin',
  'Sabine', 'Claudia', 'Susanne', 'Petra', 'Andrea', 'Julia', 'Katrin', 'Nicole', 'Anja', 'Melanie', 'Carina', 'Isabel', 'Tobias', 'Sebastian',
  'Maximilian', 'Felix', 'Benedikt', 'Moritz', 'Konstantin', 'Leonie', 'Charlotte', 'Valentina', 'Hakan', 'Luca', 'Nikolai', 'Elif', 'Jonas',
  'Lea', 'Tim', 'Sarah', 'Florian', 'Laura', 'Dominik', 'Vanessa', 'Patrick', 'Jana', 'Kevin', 'Lisa', 'Marcel', 'Sophie', 'Dennis', 'Emily'];
const NACHNAMEN = ['Bauer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz',
  'Braun', 'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Meier', 'Lehmann', 'Schmid', 'Schulze', 'Maier', 'Köhler',
  'Herrmann', 'König', 'Walter', 'Mayer', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Möller', 'Scholz', 'Weiß', 'Jung', 'Hahn', 'Vogel',
  'Friedrich', 'Keller', 'Günther', 'Frank', 'Berger', 'Winkler', 'Roth', 'Beck', 'Lorenz', 'Baumann', 'Franke', 'Albrecht', 'Ludwig',
  'Kaya', 'Yilmaz', 'Petrović', 'Novak', 'Rossi', 'Ziegler', 'Brandt', 'Haas', 'Graf', 'Seidel', 'Engel', 'Kühn', 'Pohl', 'Busch'];
const ORTE = ['Sindelfingen', 'Böblingen', 'Stuttgart', 'Leonberg', 'Herrenberg', 'Esslingen', 'Ludwigsburg', 'Tübingen', 'Reutlingen',
  'Calw', 'Waiblingen', 'Filderstadt', 'Leinfelden-Echterdingen', 'Holzgerlingen', 'Ehningen', 'Weil der Stadt', 'Nürtingen', 'Kirchheim unter Teck'];
const FIRMEN_TEIL = ['Kessler', 'Hagenmüller', 'Rieger', 'Lindner', 'Weidle', 'Seibold', 'Ostertag', 'Brecht', 'Fritz', 'Ammann', 'Sailer',
  'Nägele', 'Pfleiderer', 'Mauch', 'Haug', 'Dreher', 'Schaal', 'Kübler', 'Rapp', 'Gaiser', 'Dürr', 'Bühler', 'Kurz', 'Eberle'];
const FIRMEN_ART = ['GmbH', 'GmbH & Co. KG', 'KG', 'Immobilien GmbH', 'Hausverwaltung', 'Holding GmbH', 'Architekten', 'Bau GmbH', 'Technik GmbH', 'Service GmbH'];

// ---------------------------------------------------------------------------
// Pläne (aus dem Profil, deterministisch)
// ---------------------------------------------------------------------------
export type Person = { vorname: string; nachname: string; position: string; abteilung: string; aussen: boolean; std: number; eintritt: number };

export function teamPlan(p: WachstumProfil): Person[] {
  const r = zufall(startwert(p.slug) ^ 0x11);
  const aus: Person[] = [];
  const vergeben = new Set<string>();
  let k = startwert(p.slug) % 97;
  for (const a of p.team) {
    for (const [position, anzahl, std] of a.rollen) {
      for (let n = 0; n < anzahl; n++) {
        let v = '', nn = '';
        do { v = VORNAMEN[(k * 7 + 3) % VORNAMEN.length]; nn = NACHNAMEN[(k * 13 + 5) % NACHNAMEN.length]; k++; } while (vergeben.has(`${v} ${nn}`));
        vergeben.add(`${v} ${nn}`);
        const leitung = /leit|meister|geschäftsf|inhaber|vorstand|partner/i.test(position);
        aus.push({ vorname: v, nachname: nn, position, abteilung: a.name, aussen: !!a.aussen, std: std ?? 40, eintritt: -(leitung ? ganz(r, 2000, 6000) : ganz(r, 60, 3200)) });
      }
    }
  }
  return aus;
}

export type Kunde = { vorname: string; nachname: string; firma: string | null; ort: string };
export function kundenPlan(p: WachstumProfil): Kunde[] {
  const r = zufall(startwert(p.slug) ^ 0x22);
  return Array.from({ length: p.kunden }, () => {
    const firma = r() < p.firmenAnteil ? `${eins(r, FIRMEN_TEIL)} ${eins(r, FIRMEN_ART)}` : null;
    return { vorname: eins(r, VORNAMEN), nachname: eins(r, NACHNAMEN), firma, ort: eins(r, ORTE) };
  });
}
const kundeName = (k: Kunde) => k.firma ?? `${k.vorname} ${k.nachname}`;
const kundeMail = (k: Kunde, i: number) => `${ascii(k.vorname)}.${ascii(k.nachname)}${i}@example.com`;

export type Zeile = [string, string, number, number]; // Bezeichnung, Einheit, Menge, Einzelpreis
export type RechnungPlan = {
  i: number; nr: string; datum: string; kunde: number; titel: string; zeilen: Zeile[];
  netto: number; mwst: number; brutto: number; status: 'bezahlt' | 'offen' | 'teilbezahlt'; bezahltAm: string | null; bezahlt: number;
};

/** Rechnungen der letzten 18 Monate — wachsend, nur an Werktagen, Stammkunden kommen wieder. */
export function rechnungsPlan(p: WachstumProfil, heute: string): RechnungPlan[] {
  const r = zufall(startwert(p.slug) ^ 0x33);
  const tage: string[] = [];
  for (let d = MONATE * 30; d >= 1; d--) { const t = tagPlus(heute, -d); if (istWerktag(t)) tage.push(t); }
  const aus: RechnungPlan[] = [];
  const jahrNr: Record<string, number> = {};
  // Positionen je Rechnung so, dass rechnung_positionen unter 1.000 Zeilen bleibt (Seiten laden höchstens 1.000)
  const erwartet = ((p.rechnungenStart + p.rechnungenEnde) / 2) * MONATE;
  const maxZeilen = Math.max(1, Math.min(3, p.leistungen.length, Math.floor(950 / Math.max(1, erwartet * 1.08))));
  tage.forEach((t, j) => {
    const anteil = j / tage.length;
    const jeTag = (p.rechnungenStart + (p.rechnungenEnde - p.rechnungenStart) * anteil) / 21.5;
    let n = Math.floor(jeTag) + (r() < jeTag - Math.floor(jeTag) ? 1 : 0);
    while (n-- > 0) {
      const anzahl = ganz(r, 1, maxZeilen);
      const zeilen: Zeile[] = [];
      const genutzt = new Set<number>();
      while (zeilen.length < anzahl) {
        const li = ganz(r, 0, p.leistungen.length - 1);
        if (genutzt.has(li)) continue;
        genutzt.add(li);
        const L = p.leistungen[li];
        const menge = L[2] === L[3] ? L[2] : centRunden(L[2] + r() * (L[3] - L[2]));
        zeilen.push([L[0], L[1], L[1] === 'Std' || L[1] === 'Stk' || L[1] === 'Psch' || L[1] === 'Monat' ? Math.max(1, Math.round(menge)) : menge, L[4]]);
      }
      const netto = centRunden(zeilen.reduce((s, z) => s + z[2] * z[3], 0));
      const mwst = centRunden(netto * 0.19);
      const brutto = centRunden(netto + mwst);
      // Stammkunden: zwei Drittel der Rechnungen gehen an das erste Drittel der Kunden
      const kunde = r() < 0.66 ? ganz(r, 0, Math.floor(p.kunden / 3) - 1) : ganz(r, 0, p.kunden - 1);
      const alter = tageHer(heute, t);
      const zufallStatus = r();
      const status: RechnungPlan['status'] = alter > 45 ? 'bezahlt' : zufallStatus < 0.55 ? 'bezahlt' : zufallStatus < 0.9 ? 'offen' : 'teilbezahlt';
      const bezahltAm = status === 'bezahlt' ? tagPlus(t, Math.min(alter - 1, ganz(r, 3, 26))) : null;
      const jahr = t.slice(0, 4);
      jahrNr[jahr] = (jahrNr[jahr] || 0) + 1;
      aus.push({
        i: aus.length, nr: `${p.prefix}-${jahr}-${nr4(jahrNr[jahr])}`, datum: t, kunde, titel: zeilen[0][0], zeilen, netto, mwst, brutto, status,
        bezahltAm, bezahlt: status === 'bezahlt' ? brutto : status === 'teilbezahlt' ? centRunden(brutto / 2) : 0,
      });
    }
  });
  return hochrechnen(aus, p.umsatzJahr, heute);
}

const GANZE = new Set(['Std', 'Stk', 'Person', 'Nacht']);
/**
 * Mengen so hochrechnen, dass der Umsatz der letzten 12 Monate zur Betriebsgröße
 * passt (die Vorführung zeigt eine Auswahl an Rechnungen, nicht jede einzelne).
 * Pauschalen und Monatsbeträge bleiben, Preise je Einheit bleiben.
 */
function hochrechnen(liste: RechnungPlan[], ziel: number, heute: string): RechnungPlan[] {
  const jahr = liste.filter((x) => tageHer(heute, x.datum) <= 365);
  const skalierbar = jahr.reduce((s, x) => s + x.zeilen.filter((z) => z[1] !== 'Psch' && z[1] !== 'Monat').reduce((a, z) => a + z[2] * z[3], 0), 0);
  const fest = jahr.reduce((s, x) => s + x.netto, 0) - skalierbar;
  if (skalierbar <= 0 || ziel <= fest + skalierbar) return liste;
  const f = Math.min(8, (ziel - fest) / skalierbar);
  return liste.map((x) => {
    const zeilen: Zeile[] = x.zeilen.map((z) => (z[1] === 'Psch' || z[1] === 'Monat' ? z : [z[0], z[1], GANZE.has(z[1]) ? Math.max(1, Math.round(z[2] * f)) : centRunden(z[2] * f), z[3]]));
    const netto = centRunden(zeilen.reduce((s, z) => s + z[2] * z[3], 0));
    const mwst = centRunden(netto * 0.19);
    const brutto = centRunden(netto + mwst);
    return { ...x, zeilen, netto, mwst, brutto, bezahlt: x.status === 'bezahlt' ? brutto : x.status === 'teilbezahlt' ? centRunden(brutto / 2) : 0 };
  });
}

// Pläne je (Profil, heute) nur einmal rechnen
const CACHE = new Map<string, unknown>();
function einmal<T>(schluessel: string, bau: () => T): T {
  if (!CACHE.has(schluessel)) CACHE.set(schluessel, bau());
  return CACHE.get(schluessel) as T;
}
const rp = (p: WachstumProfil, heute: string) => einmal(`r|${p.slug}|${heute}`, () => rechnungsPlan(p, heute));
const tp = (p: WachstumProfil) => einmal(`t|${p.slug}`, () => teamPlan(p));
const kp = (p: WachstumProfil) => einmal(`k|${p.slug}`, () => kundenPlan(p));

// ---------------------------------------------------------------------------
// Seeder (Profil → Zeilen)
// ---------------------------------------------------------------------------
export function wachstumSeeder(p: WachstumProfil): FachSeeder[] {
  const O = (ctx: XxlKontext) => ({ owner_user_id: ctx.uid });
  const S = (key: string, tabelle: string, baue: (ctx: XxlKontext) => SeedZeile[]): FachSeeder => ({ key, tabelle, baue });

  const team = (ctx: XxlKontext): SeedZeile[] => tp(p).map((m) => ({
    ...O(ctx), standort_id: null, vorname: m.vorname, nachname: m.nachname, email: `${ascii(m.vorname)}.${ascii(m.nachname)}@example.com`, telefon: null,
    position: m.position, abteilung: m.abteilung, status: 'aktiv', eintrittsdatum: tagPlus(ctx.heute, m.eintritt),
    arbeitszeit_modell: m.std < 40 ? 'teilzeit' : 'vollzeit', wochenstunden: m.std, urlaubsanspruch_tage: 30,
  }));

  const kunden = (ctx: XxlKontext): SeedZeile[] => {
    const plan = rp(p, ctx.heute);
    const umsatz = new Map<number, number>();
    for (const x of plan) umsatz.set(x.kunde, (umsatz.get(x.kunde) || 0) + 1);
    return kp(p).map((k, i) => ({
      ...O(ctx), vorname: k.vorname, nachname: k.nachname, firma: k.firma, ort: k.ort, telefon: null, email: kundeMail(k, i),
      status: umsatz.has(i) ? 'kunde' : 'interessent', quelle: QUELLE,
      notizen: `${umsatz.has(i) ? `${umsatz.get(i)} Rechnungen in 18 Monaten` : 'Interessent'} · ${WACHSTUM_NOTIZ}`,
    }));
  };

  const projekte = (ctx: XxlKontext): SeedZeile[] => {
    const namen = p.handwerk ? [...p.handwerk.baustellen, 'Fuhrpark und Werkzeug', 'Ausbildung und Schulungen'] : ['Jahresziele und Wachstum', 'Kundenbindung', 'Prozesse und Qualität'];
    return namen.map((name, i) => ({
      ...O(ctx), name, beschreibung: WACHSTUM_NOTIZ, status: 'aktiv', prioritaet: i < 3 ? 'hoch' : 'normal',
      start_datum: tagPlus(ctx.heute, -10 - i * 6), end_datum: tagPlus(ctx.heute, 20 + i * 9), budget: p.handwerk ? 8000 + i * 6500 : 15000,
      verantwortlich: tp(p)[Math.min(i + 1, tp(p).length - 1)].vorname + ' ' + tp(p)[Math.min(i + 1, tp(p).length - 1)].nachname, farbe: ['#C9A84C', '#00e5ff', '#4CAF7D', '#E0A24C'][i % 4],
    }));
  };

  const rechnungen = (ctx: XxlKontext): SeedZeile[] => rp(p, ctx.heute).map((x) => {
    const k = kp(p)[x.kunde];
    return {
      ...O(ctx), rechnungsnummer: x.nr, kontakt_id: nimm(ctx, 'kontakte', x.kunde), titel: x.titel, empfaenger_name: kundeName(k),
      zahlungsstatus: x.status, rechnungsdatum: x.datum, leistungsdatum: x.datum, faelligkeitsdatum: tagPlus(x.datum, 14),
      zahlungsziel_tage: 14, netto_summe: x.netto, mwst_summe: x.mwst, brutto_summe: x.brutto, waehrung: 'EUR',
      bezahlt_am: x.bezahltAm, bezahlter_betrag: x.bezahlt, created_at: berlinZeit(x.datum, '09:00'),
    };
  });

  const rechnungPositionen = (ctx: XxlKontext): SeedZeile[] => {
    const plan = rp(p, ctx.heute);
    const aus: SeedZeile[] = [];
    (ctx.ids.rechnungen || []).forEach((id, i) => {
      const x = plan[i];
      if (!x) return;
      x.zeilen.forEach((z, j) => aus.push({
        ...O(ctx), rechnung_id: id, position: j + 1, bezeichnung: z[0], beschreibung: null, menge: z[2], einheit: z[1], einzelpreis: z[3], mwst_satz: 19, gesamt_netto: centRunden(z[2] * z[3]),
      }));
    });
    return aus;
  };

  const zahlungen = (ctx: XxlKontext): SeedZeile[] => {
    const plan = rp(p, ctx.heute);
    const aus: SeedZeile[] = [];
    (ctx.ids.rechnungen || []).forEach((id, i) => {
      const x = plan[i];
      if (!x || x.bezahlt <= 0) return;
      aus.push({ ...O(ctx), rechnung_id: id, betrag: x.bezahlt, zahlungsdatum: x.bezahltAm ?? tagPlus(x.datum, 10), zahlungsart: 'Überweisung', referenz: x.nr });
    });
    return aus;
  };

  /** Angebote: je Rechnung der letzten 12 Monate das angenommene Angebot davor, dazu abgelehnte und offene. */
  const angebotPlan = (heute: string) => einmal(`a|${p.slug}|${heute}`, () => {
    const r = zufall(startwert(p.slug) ^ 0x44);
    const aus: { datum: string; kunde: number; titel: string; netto: number; status: string; zeile: Zeile }[] = [];
    for (const x of rp(p, heute)) {
      if (tageHer(heute, x.datum) > 365) continue;
      aus.push({ datum: tagPlus(x.datum, -ganz(r, 10, 35)), kunde: x.kunde, titel: x.titel, netto: x.netto, status: 'angenommen', zeile: [x.titel, 'Psch', 1, x.netto] });
      if (r() < 0.3) aus.push({ datum: tagPlus(x.datum, -ganz(r, 5, 60)), kunde: ganz(r, 0, p.kunden - 1), titel: x.titel, netto: centRunden(x.netto * (0.8 + r() * 0.6)), status: 'abgelehnt', zeile: [x.titel, 'Psch', 1, 0] });
    }
    for (let j = 0; j < 30; j++) {
      const L = p.leistungen[j % p.leistungen.length];
      const netto = centRunden(L[4] * (L[2] + (L[3] - L[2]) * r()));
      aus.push({ datum: tagPlus(heute, -ganz(r, 0, 20)), kunde: ganz(r, 0, p.kunden - 1), titel: L[0], netto, status: j < 24 ? 'gesendet' : 'entwurf', zeile: [L[0], 'Psch', 1, netto] });
    }
    aus.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
    return aus.map((a) => (a.status === 'abgelehnt' ? { ...a, zeile: [a.titel, 'Psch', 1, a.netto] as Zeile } : a));
  });

  const angebote = (ctx: XxlKontext): SeedZeile[] => {
    const jahrNr: Record<string, number> = {};
    return angebotPlan(ctx.heute).map((a) => {
      const k = kp(p)[a.kunde];
      const mwst = centRunden(a.netto * 0.19);
      const jahr = a.datum.slice(0, 4);
      jahrNr[jahr] = (jahrNr[jahr] || 0) + 1;
      return {
        ...O(ctx), angebotsnummer: `${p.prefix}-A-${jahr}-${nr4(jahrNr[jahr])}`, kontakt_id: nimm(ctx, 'kontakte', a.kunde), kunde_name: kundeName(k), kunde_email: null,
        titel: a.titel, status: a.status, gueltig_bis: tagPlus(a.datum, 30), netto_summe: a.netto, mwst_summe: mwst, brutto_summe: centRunden(a.netto + mwst), notiz: WACHSTUM_NOTIZ,
        erstellt_am: berlinZeit(a.datum, '10:00'),
        angenommen_am: a.status === 'angenommen' ? berlinZeit(tagPlus(a.datum, Math.min(6, tageHer(ctx.heute, a.datum))), '15:00') : null,
        abgelehnt_am: a.status === 'abgelehnt' ? berlinZeit(tagPlus(a.datum, Math.min(9, tageHer(ctx.heute, a.datum))), '11:00') : null,
      };
    });
  };

  const angebotPositionen = (ctx: XxlKontext): SeedZeile[] => {
    const plan = angebotPlan(ctx.heute);
    return (ctx.ids.angebote || []).flatMap((id, i) => {
      const a = plan[i];
      return a ? [{ ...O(ctx), angebot_id: id, position: 1, bezeichnung: a.zeile[0], menge: 1, einheit: 'Psch', einzelpreis: a.netto, mwst_satz: 19, gesamt_netto: a.netto }] : [];
    });
  };

  /** Aufträge: je Rechnung der letzten 9 Monate ein abgeschlossener, dazu die laufenden. */
  const auftragPlan = (heute: string) => einmal(`au|${p.slug}|${heute}`, () => {
    const r = zufall(startwert(p.slug) ^ 0x55);
    const fertig = rp(p, heute).filter((x) => tageHer(heute, x.datum) <= 270).map((x) => ({ datum: tagPlus(x.datum, -ganz(r, 5, 25)), kunde: x.kunde, titel: x.titel, netto: x.netto, status: 'abgeschlossen' }));
    const laufend = Array.from({ length: 24 }, (_, j) => {
      const L = p.leistungen[(j * 3) % p.leistungen.length];
      return { datum: tagPlus(heute, -ganz(r, 1, 30)), kunde: ganz(r, 0, p.kunden - 1), titel: L[0], netto: centRunden(L[4] * (L[2] + (L[3] - L[2]) * r())), status: j < 14 ? 'in_bearbeitung' : j < 21 ? 'beauftragt' : 'entwurf' };
    });
    return [...fertig, ...laufend].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  });

  const auftraege = (ctx: XxlKontext): SeedZeile[] => {
    const jahrNr: Record<string, number> = {};
    return auftragPlan(ctx.heute).map((a) => {
      const mwst = centRunden(a.netto * 0.19);
      const jahr = a.datum.slice(0, 4);
      jahrNr[jahr] = (jahrNr[jahr] || 0) + 1;
      return {
        ...O(ctx), auftragsnummer: `${p.prefix}-AU-${jahr}-${nr4(jahrNr[jahr])}`, titel: a.titel, status: a.status, auftragsdatum: a.datum,
        kontakt_id: nimm(ctx, 'kontakte', a.kunde), standort_id: null, waehrung: 'EUR', netto_summe: a.netto, mwst_summe: mwst, brutto_summe: centRunden(a.netto + mwst), notizen: WACHSTUM_NOTIZ,
        created_at: berlinZeit(a.datum, '08:30'),
      };
    });
  };

  const auftragPositionen = (ctx: XxlKontext): SeedZeile[] => {
    const plan = auftragPlan(ctx.heute);
    return (ctx.ids.auftraege || []).flatMap((id, i) => {
      const a = plan[i];
      return a ? [{ ...O(ctx), auftrag_id: id, position: 1, bezeichnung: a.titel, menge: 1, einheit: 'Psch', einzelpreis: a.netto, mwst_satz: 19, gesamt_netto: a.netto }] : [];
    });
  };

  const belege = (ctx: XxlKontext): SeedZeile[] => {
    const r = zufall(startwert(p.slug) ^ 0x66);
    const aus: SeedZeile[] = [];
    for (let m = MONATE - 1; m >= 0; m--) {
      const tag = tagPlus(ctx.heute, -m * 30 - 2);
      for (const [lieferant, kategorie, netto, ust] of p.kosten) {
        const n = centRunden(netto * (0.95 + r() * 0.1));
        const u = centRunden((n * ust) / 100);
        aus.push({ ...O(ctx), lieferant, belegnummer: `${ascii(lieferant).slice(0, 4).toUpperCase()}-${tag.replace(/-/g, '')}`, belegdatum: tag, netto: n, ust_satz: ust, ust_betrag: u, brutto: centRunden(n + u), kategorie, notiz: WACHSTUM_NOTIZ, datev_konto: null, datev_rahmen: null, datei_pfad: null });
      }
    }
    if (p.einkaufQuote > 0) {
      // Wareneinsatz: monatlich gesammelt beim Großhändler
      const jeMonat = new Map<string, number>();
      for (const x of rp(p, ctx.heute)) jeMonat.set(x.datum.slice(0, 7), (jeMonat.get(x.datum.slice(0, 7)) || 0) + x.netto);
      for (const [monat, summe] of jeMonat) {
        const n = centRunden((summe * p.einkaufQuote) / 100);
        const u = centRunden(n * 0.19);
        aus.push({ ...O(ctx), lieferant: p.einkaufLieferant, belegnummer: `EK-${monat.replace('-', '')}`, belegdatum: `${monat}-25`, netto: n, ust_satz: 19, ust_betrag: u, brutto: centRunden(n + u), kategorie: 'Wareneinkauf', notiz: WACHSTUM_NOTIZ, datev_konto: null, datev_rahmen: null, datei_pfad: null });
      }
    }
    return aus.filter((b) => String(b.belegdatum) < ctx.heute);
  };

  const termine = (ctx: XxlKontext): SeedZeile[] => {
    const r = zufall(startwert(p.slug) ^ 0x77);
    const aus: SeedZeile[] = [];
    for (let j = 0; j < 32; j++) {
      const d = tagPlus(ctx.heute, 1 + (j % 14));
      if (!istWerktag(d)) continue;
      const h = ganz(r, 8, 16);
      const L = eins(r, p.leistungen);
      const kunde = ganz(r, 0, p.kunden - 1);
      aus.push({
        ...O(ctx), standort_id: null, titel: j % 5 === 0 ? 'Teambesprechung' : `${L[0]} — ${kundeName(kp(p)[kunde])}`,
        beginn_am: berlinZeit(d, `${String(h).padStart(2, '0')}:00`), ende_am: berlinZeit(d, `${String(h + 1).padStart(2, '0')}:00`),
        ort: j % 5 === 0 ? 'Büro' : p.handwerk ? 'Beim Kunden' : 'Vor Ort', status: 'geplant', kunde_email: null, erinnerung_min: null,
        kontakt_id: j % 5 === 0 ? null : nimm(ctx, 'kontakte', kunde), notiz: WACHSTUM_NOTIZ, ressource: null,
      });
    }
    return aus;
  };

  const aufgaben = (ctx: XxlKontext): SeedZeile[] => {
    const r = zufall(startwert(p.slug) ^ 0x88);
    const T = p.handwerk
      ? ['Material bestellen', 'Baustelle einrichten', 'Abnahme vorbereiten', 'Aufmaß prüfen', 'Nachtrag schreiben', 'Schlussrechnung stellen', 'Gerüst abmelden', 'Fotos ins Bautagebuch']
      : ['Angebot nachfassen', 'Kundentermin vorbereiten', 'Monatsabschluss prüfen', 'Bewertung anfragen', 'Prozess dokumentieren', 'Team-Schulung planen'];
    const ST = ['fertig', 'fertig', 'review', 'in_arbeit', 'in_arbeit', 'todo', 'todo'];
    const ma = tp(p).length;
    return Array.from({ length: 36 }, (_, j) => {
      const s = ST[j % ST.length];
      return {
        ...O(ctx), projekt_id: nimm(ctx, 'projekte', j), titel: T[j % T.length], beschreibung: WACHSTUM_NOTIZ, status: s, prioritaet: j % 9 === 0 ? 'hoch' : 'normal',
        faellig_am: tagPlus(ctx.heute, s === 'fertig' ? -ganz(r, 1, 12) : ganz(r, 1, 21)), mitarbeiter_id: nimm(ctx, 'mitarbeiter', 1 + (j % Math.max(1, ma - 1))), erledigt: s === 'fertig', sortierung: j,
      };
    }).filter((a) => a.projekt_id);
  };

  const abwesenheiten = (ctx: XxlKontext): SeedZeile[] => {
    const ma = tp(p).length;
    return Array.from({ length: Math.min(14, ma) }, (_, j) => {
      const ab = [-30, -12, 3, 6, 10, 14, 17, 21, 24, 30, 38, 45, 52, 60][j];
      const tage = j % 3 === 0 ? 10 : 5;
      return { ...O(ctx), mitarbeiter_id: nimm(ctx, 'mitarbeiter', (j * 3 + 1) % ma), typ: 'urlaub', von: tagPlus(ctx.heute, ab), bis: tagPlus(ctx.heute, ab + tage + Math.floor(tage / 5) * 2 - 1), tage, status: j % 4 === 3 ? 'beantragt' : 'genehmigt', au_vorhanden: false, notiz: WACHSTUM_NOTIZ };
    });
  };

  const zeiterfassung = (ctx: XxlKontext): SeedZeile[] => {
    const tage = letzteWerktage(ctx.heute, 10);
    const aus: SeedZeile[] = [];
    tp(p).forEach((m, i) => {
      if (i < 1 || aus.length > 900) return;
      for (const t of tage) {
        const frueh = m.aussen ? '07:00' : i % 2 ? '08:00' : '07:30';
        const spaet = m.std < 40 ? '12:30' : m.aussen ? '16:00' : '17:00';
        aus.push({ ...O(ctx), mitarbeiter_id: nimm(ctx, 'mitarbeiter', i), datum: t, kommen_um: berlinZeit(t, frueh), gehen_um: berlinZeit(t, spaet), pause_minuten: m.std < 40 ? 0 : 30, quelle: 'nachtrag' });
      }
    });
    return aus;
  };

  const leads = (ctx: XxlKontext): SeedZeile[] => {
    const r = zufall(startwert(p.slug) ^ 0x99);
    const ST: [string, string][] = [['neu', 'eintragung'], ['offen', 'termin_gebucht'], ['offen', 'termin_gehalten'], ['gewonnen', 'kunde'], ['verloren', 'verloren']];
    return Array.from({ length: 24 }, (_, j) => {
      const v = eins(r, VORNAMEN), n = eins(r, NACHNAMEN);
      const L = p.leistungen[j % p.leistungen.length];
      const [s, st] = ST[j % ST.length];
      return {
        ...O(ctx), name: `${v} ${n}`, email: `${ascii(v)}.${ascii(n)}.lead${j}@example.com`, telefon: null, dienstleistung: L[0], nachricht: `${L[0]}: bitte um Rückmeldung. (${WACHSTUM_NOTIZ})`,
        ist_bestand: st === 'kunde', werbung_einwilligung: false, einwilligung_am: null, status: s, stufe: st, quelle: eins(r, ['Website', 'Manuell', 'KI-Berater', 'Empfehlung']), standort_id: null,
      };
    });
  };

  const chancen = (ctx: XxlKontext): SeedZeile[] => {
    const r = zufall(startwert(p.slug) ^ 0xaa);
    const PH: [string, number][] = [['erstkontakt', 10], ['qualifiziert', 30], ['angebot', 50], ['verhandlung', 75], ['gewonnen', 100]];
    return Array.from({ length: 15 }, (_, j) => {
      const L = p.leistungen[j % p.leistungen.length];
      const [ph, w] = PH[j % PH.length];
      return { ...O(ctx), titel: `${L[0]} — ${kundeName(kp(p)[j * 7 % p.kunden])}`, kontakt_id: nimm(ctx, 'kontakte', j * 7), phase: ph, wert: Math.round(L[4] * L[3] * (2 + r() * 6)), wahrscheinlichkeit: w, erwartetes_abschlussdatum: tagPlus(ctx.heute, 7 + j * 6), notizen: WACHSTUM_NOTIZ };
    });
  };

  const kampagnen = (ctx: XxlKontext): SeedZeile[] => p.kampagnen.map((name, j) => ({
    ...O(ctx), name, ziel: 'Anfragen und Stammkunden', beschreibung: WACHSTUM_NOTIZ, status: j === 0 || j === 1 ? 'aktiv' : j === 2 ? 'entwurf' : 'abgeschlossen',
    kanaele: j % 2 ? ['instagram', 'facebook'] : ['email', 'website'], budget: 600 + j * 450, start_datum: tagPlus(ctx.heute, j < 2 ? -20 : j === 2 ? 14 : -200 + j * 20), end_datum: tagPlus(ctx.heute, j < 2 ? 30 : j === 2 ? 60 : -150 + j * 20),
  }));

  const kalender = (ctx: XxlKontext): SeedZeile[] => {
    const r = zufall(startwert(p.slug) ^ 0xbb);
    return Array.from({ length: 20 }, (_, j) => {
      const t = -30 + j * 3;
      const L = p.leistungen[j % p.leistungen.length];
      return {
        ...O(ctx), titel: `${j % 2 ? 'Kundenstimme' : 'Vorher-Nachher'}: ${L[0]}`, kampagne_id: nimm(ctx, 'marketing_kampagnen', j % 2), kanal: eins(r, ['instagram', 'facebook', 'website', 'email']),
        status: t < 0 ? 'veroeffentlicht' : t < 8 ? 'geplant' : 'entwurf', geplant_am: berlinZeit(tagPlus(ctx.heute, t), '10:00'), notiz: WACHSTUM_NOTIZ,
      };
    });
  };

  // --- Handwerk ------------------------------------------------------------
  const einsaetze = (ctx: XxlKontext): SeedZeile[] => {
    if (!p.handwerk) return [];
    const aussen = tp(p).map((m, i) => ({ m, i })).filter((x) => x.m.aussen);
    const laufend = auftragPlan(ctx.heute).map((a, i) => ({ a, i })).filter((x) => x.a.status === 'in_bearbeitung' || x.a.status === 'beauftragt');
    const aus: SeedZeile[] = [];
    for (let d = -14; d <= 10; d++) {
      const t = tagPlus(ctx.heute, d);
      if (!istWerktag(t)) continue;
      aussen.forEach(({ m, i }, k) => {
        if (aus.length >= 950) return;
        const au = laufend[(k + Math.floor((d + 14) / 5)) % Math.max(1, laufend.length)];
        const baustelle = p.handwerk!.baustellen[(k + Math.floor((d + 14) / 5)) % p.handwerk!.baustellen.length];
        aus.push({
          ...O(ctx), standort_id: null, quelle: 'dispo', mitarbeiter_id: nimm(ctx, 'mitarbeiter', i), inhaber_einsatz: false,
          titel: au ? au.a.titel : baustelle, beschreibung: WACHSTUM_NOTIZ, einsatzort: `${baustelle}, ${ORTE[k % ORTE.length]}`,
          beginn_am: berlinZeit(t, m.std < 40 ? '08:00' : '07:00'), ende_am: berlinZeit(t, m.std < 40 ? '12:00' : '16:00'), status: d < 0 ? 'erledigt' : 'geplant',
          kunde_name: au ? kundeName(kp(p)[au.a.kunde]) : baustelle, kunde_email: null, kunde_telefon: null, auftrag_id: au ? nimm(ctx, 'auftraege', au.i) : null,
        });
      });
    }
    return aus;
  };

  const bautagebuch = (ctx: XxlKontext): SeedZeile[] => {
    if (!p.handwerk) return [];
    const W: [string, number][] = [['sonnig', 18], ['bewölkt', 14], ['Regen', 11], ['sonnig', 20], ['bewölkt', 16], ['Nebel', 9]];
    const A = ['Baustelle eingerichtet, Abdeckung', 'Untergrund geprüft und vorbereitet', 'Hauptarbeiten begonnen', 'Hauptarbeiten fortgesetzt', 'Zwischenabnahme mit Bauleitung', 'Nacharbeiten und Reinigung', 'Material angeliefert', 'Restarbeiten'];
    const aus: SeedZeile[] = [];
    p.handwerk.baustellen.slice(0, 6).forEach((_, b) => {
      letzteWerktage(ctx.heute, 8).forEach((t, i) => aus.push({
        ...O(ctx), projekt_id: nimm(ctx, 'projekte', b), erstellt_von: ctx.uid, datum: t, wetter: W[(i + b) % W.length][0], temperatur: String(W[(i + b) % W.length][1]),
        anwesende: `${2 + (b % 3)} Monteure${b % 2 ? ', 1 Azubi' : ''}`, arbeiten: A[(i + b) % A.length], material: i % 3 === 0 ? 'Material laut Lieferschein' : null, vorkommnisse: W[(i + b) % W.length][0] === 'Regen' ? 'Regen, Arbeiten innen fortgesetzt' : null,
      }));
    });
    return aus;
  };

  const maengel = (ctx: XxlKontext): SeedZeile[] => {
    if (!p.handwerk) return [];
    const M = ['Fuge nacharbeiten', 'Kante ausbessern', 'Abdeckleiste fehlt', 'Farbton an Fensterlaibung', 'Silikon erneuern', 'Kratzer an Tür', 'Dichtung prüfen', 'Restmaterial abholen'];
    return Array.from({ length: 18 }, (_, j) => {
      const st = j % 3 === 0 ? 'behoben' : j % 3 === 1 ? 'in_arbeit' : 'offen';
      return { ...O(ctx), projekt_id: nimm(ctx, 'projekte', j % Math.min(6, p.handwerk!.baustellen.length)), titel: M[j % M.length], beschreibung: WACHSTUM_NOTIZ, frist: tagPlus(ctx.heute, -3 + j), status: st, ...(st === 'behoben' ? { erledigt_am: berlinZeit(tagPlus(ctx.heute, -1 - (j % 5)), '15:00') } : {}) };
    });
  };

  const aufmassPlan = (heute: string) => einmal(`am|${p.slug}|${heute}`, () => {
    const r = zufall(startwert(p.slug) ^ 0xcc);
    return Array.from({ length: p.handwerk?.aufmasse ? 24 : 0 }, (_, j) => {
      const pos = Array.from({ length: ganz(r, 2, 3) }, (_, k) => {
        const L = p.leistungen[(j + k) % p.leistungen.length];
        return { L, menge: centRunden(L[2] + r() * (L[3] - L[2])) };
      });
      return { j, datum: tagPlus(heute, -ganz(r, 1, 120)), kunde: ganz(r, 0, p.kunden - 1), pos, st: j < 4 ? 'entwurf' : 'fertig' };
    });
  });

  const aufmasse = (ctx: XxlKontext): SeedZeile[] => aufmassPlan(ctx.heute).map((a) => ({
    ...O(ctx), titel: `Aufmaß ${a.pos[0].L[0]}`, nummer: `${p.prefix}-AM-${nr4(a.j + 1)}`, kunde_name: kundeName(kp(p)[a.kunde]),
    projekt: p.handwerk!.baustellen[a.j % p.handwerk!.baustellen.length], ort: kp(p)[a.kunde].ort, status: a.st, aufmass_datum: a.datum,
    bearbeiter: `${tp(p)[2]?.vorname ?? 'Team'} ${tp(p)[2]?.nachname ?? ''}`.trim(), notiz: WACHSTUM_NOTIZ, standort_id: null,
  }));

  const aufmassPositionen = (ctx: XxlKontext): SeedZeile[] => {
    const plan = aufmassPlan(ctx.heute);
    const aus: SeedZeile[] = [];
    (ctx.ids.aufmasse || []).forEach((id, i) => {
      plan[i]?.pos.forEach((x, k) => aus.push({ ...O(ctx), aufmass_id: id, position_nr: String(k + 1), bezeichnung: x.L[0], menge: x.menge, einheit: x.L[1], einzelpreis_netto: x.L[4], festpreis_netto: null, mwst_satz: 19, rechenweg: null, leistung_id: null }));
    });
    return aus;
  };

  const wartung = (ctx: XxlKontext): SeedZeile[] => {
    const n = p.handwerk?.wartung ?? 0;
    const r = zufall(startwert(p.slug) ^ 0xdd);
    return Array.from({ length: n }, (_, j) => {
      const letzte = tagPlus(ctx.heute, -ganz(r, 10, 360));
      const k = kp(p)[j % p.kunden];
      return {
        ...O(ctx), titel: `Wartung ${p.leistungen[0][0]}`, kunde_name: kundeName(k), kontakt_id: nimm(ctx, 'kontakte', j % p.kunden), status: 'aktiv',
        beginn_am: tagPlus(letzte, -365), intervall_monate: 12, letzte_wartung_am: letzte, naechste_faelligkeit_am: tagPlus(letzte, 365), erinnerung_tage_vorher: 30,
      };
    });
  };

  /** Fuhrpark: je drei Monteure ein Transporter, dazu Firmenwagen der Leitung. */
  const fuhrpark = (ctx: XxlKontext): SeedZeile[] => {
    const r = zufall(startwert(p.slug) ^ 0xee);
    const n = Math.max(2, Math.ceil(tp(p).filter((m) => m.aussen).length / 3));
    const kz = p.prefix.slice(0, 2);
    const aus: SeedZeile[] = Array.from({ length: n }, (_, j) => ({
      ...O(ctx), bezeichnung: `Transporter ${j + 1}`, kennzeichen: `BB-${kz} ${201 + j}`, fahrzeugtyp: 'Transporter', fahrgestellnummer: null,
      erstzulassung: tagPlus(ctx.heute, -ganz(r, 300, 2400)), tuev_bis: tagPlus(ctx.heute, ganz(r, 10, 700)), wartung_bis: tagPlus(ctx.heute, ganz(r, 5, 300)),
      versicherung_bis: tagPlus(ctx.heute, ganz(r, 60, 360)), km_stand: ganz(r, 18, 190) * 1000, kraftstoff: j % 4 === 3 ? 'Elektro' : 'Diesel', notizen: WACHSTUM_NOTIZ, aktiv: true,
    }));
    aus.push({ ...O(ctx), bezeichnung: 'Firmenwagen Geschäftsführung', kennzeichen: `BB-${kz} 1`, fahrzeugtyp: 'PKW', fahrgestellnummer: null, erstzulassung: tagPlus(ctx.heute, -500),
      tuev_bis: tagPlus(ctx.heute, 600), wartung_bis: tagPlus(ctx.heute, 120), versicherung_bis: tagPlus(ctx.heute, 200), km_stand: 31500, kraftstoff: 'Elektro', notizen: WACHSTUM_NOTIZ, aktiv: true });
    return aus;
  };

  // --- Branchen-Module aus dem Musterbetrieb XXL -----------------------------
  const branchen: FachSeeder[] = XXL_ALLE_SEEDER.filter((s) => p.module.includes(s.key)).map((s) => ({
    key: `xxl_${s.key}`, tabelle: s.tabelle,
    baue: (ctx: XxlKontext) => s.baue(ctx).map((z) => {
      const neu: SeedZeile = { ...z };
      for (const [k, v] of Object.entries(neu)) if (typeof v === 'string' && v.includes(XXL_NOTIZ)) neu[k] = v.split(XXL_NOTIZ).join(WACHSTUM_NOTIZ);
      return neu;
    }),
  }));

  const liste: FachSeeder[] = [
    S('team', 'mitarbeiter', team),
    S('kunden', 'kontakte', kunden),
    S('projekte', 'projekte', projekte),
    S('angebote', 'angebote', angebote),
    S('angebot_positionen', 'angebot_positionen', angebotPositionen),
    S('auftraege', 'auftraege', auftraege),
    S('auftrag_positionen', 'auftrag_positionen', auftragPositionen),
    S('rechnungen', 'rechnungen', rechnungen),
    S('rechnung_positionen', 'rechnung_positionen', rechnungPositionen),
    S('zahlungen', 'zahlungen', zahlungen),
    S('eingangsbelege', 'eingangsbelege', belege),
    S('termine', 'termine', termine),
    S('aufgaben', 'aufgaben', aufgaben),
    S('hr_abwesenheiten', 'hr_abwesenheiten', abwesenheiten),
    S('hr_zeiterfassung', 'hr_zeiterfassung', zeiterfassung),
    S('leads', 'leads', leads),
    S('verkaufschancen', 'verkaufschancen', chancen),
    S('marketing_kampagnen', 'marketing_kampagnen', kampagnen),
    S('marketing_kalender', 'marketing_kalender', kalender),
  ];
  if (p.handwerk) {
    liste.push(
      S('einsaetze', 'einsaetze', einsaetze),
      S('bautagebuch', 'bautagebuch', bautagebuch),
      S('maengel', 'maengel', maengel),
    );
    if (p.handwerk.aufmasse) liste.push(S('aufmasse', 'aufmasse', aufmasse), S('aufmass_positionen', 'aufmass_positionen', aufmassPositionen));
    liste.push(S('fahrzeuge', 'fahrzeuge', fuhrpark));
    if (p.handwerk.wartung > 0) liste.push(S('wartungsvertraege', 'wartungsvertraege', wartung));
  }
  return [...liste, ...branchen];
}

/** Kinder vor Eltern. Branchen-Tabellen (verweisen auf Kontakte, Mitarbeiter, Projekte) vor den Eltern. */
export const WACHSTUM_LOESCH_KINDER: string[] = [
  'zahlungen', 'rechnung_positionen', 'rechnungen', 'angebot_positionen', 'angebote', 'einsaetze', 'auftrag_positionen', 'auftraege',
  'aufmass_positionen', 'aufmasse', 'bau_nachtrag', 'bau_lv_positionen', 'bau_lv', 'bautagebuch', 'maengel', 'aufgaben', 'wartungsvertraege',
  'eingangsbelege', 'termine', 'hr_zeiterfassung', 'hr_abwesenheiten', 'leads', 'verkaufschancen', 'marketing_kalender', 'marketing_kampagnen',
  'kontakt_aktivitaeten', 'erinnerung', 'hr_schulungen', 'hr_schichten', 'bewerber', 'leistungskatalog', 'inventar', 'fahrzeuge', 'assets',
];
export const WACHSTUM_LOESCH_ELTERN: string[] = ['projekte', 'mitarbeiter'];

export function wachstumLoeschOrder(): string[] {
  return [...WACHSTUM_LOESCH_KINDER, ...XXL_BRANCHEN_LOESCH_ORDER, ...WACHSTUM_LOESCH_ELTERN];
}
