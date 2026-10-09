// ============================================================================
// ARGONAUT OS · lib/zweirad.ts — Z1 Zweirad, E-Bike und Dienstrad-Leasing (Paket 295)
//
// 1. Rad-Akte: Fahrrad, Pedelec, S-Pedelec, Lastenrad — Rahmennummer (in Groß-
//    buchstaben, ohne Leerzeichen, je Betrieb einmalig), Motor-, Akku- und
//    Displaynummer, Schlüsselnummer, Akku-Wh, Versicherungskennzeichen
//    (S-Pedelec). Händlerware („Bestand") oder Kundenrad.
// 2. Inspektion: nächste Fälligkeit aus letzter Inspektion (sonst Kaufdatum)
//    plus Intervall in Monaten, Ampel. Herstellergarantie (vom Händler
//    eingetragen) und gesetzliche Gewährleistung gegenüber Verbrauchern
//    (2 Jahre ab Übergabe) nur als Hinweis.
// 3. Reparatur-Annahme und Inspektion legen einen Auftrag im Werkstatt-Board
//    an (werkstatt_auftraege.zweirad_id) — abgerechnet wird dort wie bisher.
// 4. Garantiefälle (Akku, Motor, Display …) mit Vorgangsnummer des Herstellers.
// 5. Dienstrad-Vorgang: Angebot → im Leasing-Portal eingereicht → genehmigt
//    (Bestell-/Auftragsnummer des Portals) → übergeben (Rad mit Rahmennummer,
//    Ausweis geprüft, Einweisung) → abgerechnet (Rechnung an den Leasinggeber).
//    ARGONAUT hat KEINE Schnittstelle zu Leasing-Portalen: das Portal ist das
//    Konto des Betriebs, den Status setzt der Betrieb von Hand.
//    Preise netto in ganzen Cent, 19 % — der Endpreis fürs Portal wird genau
//    so gerechnet wie später die Rechnung (eine Steuergruppe auf die Summe).
//
// Rein (nur lib/zahlen, lib/fahrzeugMiete), node-getestet (tests/zweiradP295).
// Die Datenbank (supabase-sql/p295-zweirad-dienstrad.sql) prüft dasselbe
// noch einmal; der Browser ist nur die Vorschau.
// ============================================================================

import { leseZahl, inCent } from './zahlen';
import { istUuid, istIso, euroInCent } from './fahrzeugMiete';

export const RAD_ARTEN = [
  { key: 'fahrrad', label: 'Fahrrad' },
  { key: 'pedelec', label: 'Pedelec / E-Bike (bis 25 km/h)' },
  { key: 's_pedelec', label: 'S-Pedelec (bis 45 km/h)' },
  { key: 'lastenrad', label: 'Lastenrad' },
  { key: 'lastenrad_e', label: 'E-Lastenrad' },
  { key: 'kinderrad', label: 'Kinderrad' },
  { key: 'sonstiges', label: 'Sonstiges' },
] as const;
export type RadArt = typeof RAD_ARTEN[number]['key'];
const ART_KEYS: readonly string[] = RAD_ARTEN.map((a) => a.key);
/** Arten mit Motor und Akku. */
export const MIT_MOTOR: readonly string[] = ['pedelec', 's_pedelec', 'lastenrad_e'];

export const HERKUNFT = [
  { key: 'bestand', label: 'Unser Bestand (Verkauf)' },
  { key: 'kunde', label: 'Kundenrad' },
] as const;

export const RAD_STATUS: Record<string, string> = {
  bestand: 'im Bestand', reserviert: 'reserviert', verkauft: 'verkauft', kunde: 'Kundenrad', archiv: 'Archiv',
};
/** Erlaubte Status je Herkunft (wie die Datenbank). */
export function statusErlaubt(herkunft: string, status: string): boolean {
  return herkunft === 'kunde' ? (status === 'kunde' || status === 'archiv') : ['bestand', 'reserviert', 'verkauft', 'archiv'].includes(status);
}

function text(roh: unknown, max: number): string | null {
  const t = String(roh ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  return t || null;
}

// ------------------------------------------------------------ Nummern ---

/** Rahmennummer: Großbuchstaben, ohne Leerzeichen; 4–30 Zeichen aus A–Z, 0–9 und . - /. Leer = keine. */
export function rahmennummerPruefen(roh: unknown): { ok: true; wert: string | null } | { ok: false; fehler: string } {
  const s = String(roh ?? '').replace(/\s+/g, '').toUpperCase();
  if (!s) return { ok: true, wert: null };
  if (!/^[A-Z0-9][A-Z0-9.\-/]{3,29}$/.test(s)) {
    return { ok: false, fehler: 'Die Rahmennummer hat 4 bis 30 Zeichen (Buchstaben, Ziffern, Punkt, Strich, Schrägstrich).' };
  }
  return { ok: true, wert: s };
}

/** Motor-, Akku-, Display- und Schlüsselnummern: wie aufgedruckt, ohne Leerzeichen am Rand, max. 40 Zeichen. */
export function teilNummer(roh: unknown): string | null {
  const s = String(roh ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  return s ? s.slice(0, 40) : null;
}

// ------------------------------------------------------------ Rad-Akte ---

export type RadForm = {
  herkunft: string; art: string; marke: string; modell: string; modelljahr: string; farbe: string; rahmengroesse: string;
  rahmennummer: string; motorHersteller: string; motorNr: string; akkuNr: string; akkuWh: string; displayNr: string; schluesselNr: string;
  versicherungskennzeichen: string; kontaktId: string; halterName: string; kaufdatum: string; garantieBis: string;
  intervallMonate: string; letzteInspektion: string; ek: string; vk: string; notiz: string;
};

export type RadZeile = {
  herkunft: string; art: string; marke: string; modell: string | null; modelljahr: number | null; farbe: string | null; rahmengroesse: string | null;
  rahmennummer: string | null; motor_hersteller: string | null; motor_nr: string | null; akku_nr: string | null; akku_wh: number | null;
  display_nr: string | null; schluessel_nr: string | null; versicherungskennzeichen: string | null; kontakt_id: string | null; halter_name: string | null;
  kaufdatum: string | null; garantie_bis: string | null; inspektion_intervall_monate: number; letzte_inspektion: string | null;
  ek_cent: number | null; vk_cent: number | null; notiz: string | null;
};

function ganz(roh: unknown, min: number, max: number): number | null | typeof NaN {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  const n = leseZahl(s);
  if (n === null || !Number.isInteger(n) || n < min || n > max) return NaN;
  return n;
}
function tag(roh: unknown): string | null | false {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  return istIso(s) ? s : false;
}

/** Rad-Akte prüfen. jahr = aktuelles Jahr (für Modelljahr bis Folgejahr). */
export function radPruefen(f: RadForm, jahr: number): { ok: true; zeile: RadZeile; hinweise: string[] } | { ok: false; grund: string } {
  const herkunft = f.herkunft === 'kunde' ? 'kunde' : f.herkunft === 'bestand' ? 'bestand' : '';
  if (!herkunft) return { ok: false, grund: 'Bitte wählen Sie, ob das Rad aus Ihrem Bestand ist oder ein Kundenrad.' };
  if (!ART_KEYS.includes(f.art)) return { ok: false, grund: 'Bitte wählen Sie die Art des Rads.' };
  const marke = text(f.marke, 60);
  if (!marke || marke.length < 2) return { ok: false, grund: 'Bitte geben Sie die Marke an.' };
  const rn = rahmennummerPruefen(f.rahmennummer);
  if (!rn.ok) return { ok: false, grund: rn.fehler };
  const mj = ganz(f.modelljahr, 1950, jahr + 1);
  if (Number.isNaN(mj)) return { ok: false, grund: `Das Modelljahr liegt zwischen 1950 und ${jahr + 1}.` };
  const wh = ganz(f.akkuWh, 1, 5000);
  if (Number.isNaN(wh)) return { ok: false, grund: 'Die Akku-Kapazität ist eine ganze Zahl in Wattstunden (1 bis 5000).' };
  const iv = ganz(f.intervallMonate, 0, 60);
  if (Number.isNaN(iv)) return { ok: false, grund: 'Das Inspektions-Intervall liegt zwischen 0 und 60 Monaten (0 = keins).' };
  const kauf = tag(f.kaufdatum); const gar = tag(f.garantieBis); const insp = tag(f.letzteInspektion);
  if (kauf === false || gar === false || insp === false) return { ok: false, grund: 'Bitte die Daten als gültiges Datum eingeben.' };
  if (kauf && gar && gar < kauf) return { ok: false, grund: 'Die Garantie endet vor dem Kaufdatum.' };
  const ek = euroInCent(f.ek); const vk = euroInCent(f.vk);
  if (Number.isNaN(ek as number) || Number.isNaN(vk as number)) return { ok: false, grund: 'Einkaufs- und Verkaufspreis bitte als Betrag (0 bis 1.000.000 €).' };
  const kontakt = String(f.kontaktId || '').trim();
  if (kontakt && !istUuid(kontakt)) return { ok: false, grund: 'Der Kontakt ist ungültig.' };
  const motor = MIT_MOTOR.includes(f.art);
  const hinweise: string[] = [];
  if (!rn.wert) hinweise.push('Ohne Rahmennummer lässt sich das Rad nicht als Dienstrad übergeben und im Diebstahlfall schwer zuordnen.');
  if (motor && !teilNummer(f.akkuNr)) hinweise.push('Die Akkunummer fehlt — sie wird für Garantie und Rückrufe gebraucht.');
  if (f.art === 's_pedelec' && !text(f.versicherungskennzeichen, 20)) hinweise.push('Ein S-Pedelec braucht ein Versicherungskennzeichen und eine Betriebserlaubnis.');
  return {
    ok: true,
    hinweise,
    zeile: {
      herkunft, art: f.art, marke, modell: text(f.modell, 80), modelljahr: mj as number | null, farbe: text(f.farbe, 40), rahmengroesse: text(f.rahmengroesse, 20),
      rahmennummer: rn.wert,
      motor_hersteller: motor ? text(f.motorHersteller, 40) : null, motor_nr: motor ? teilNummer(f.motorNr) : null,
      akku_nr: motor ? teilNummer(f.akkuNr) : null, akku_wh: motor ? (wh as number | null) : null, display_nr: motor ? teilNummer(f.displayNr) : null,
      schluessel_nr: teilNummer(f.schluesselNr),
      versicherungskennzeichen: f.art === 's_pedelec' ? (text(f.versicherungskennzeichen, 20)?.toUpperCase() ?? null) : null,
      kontakt_id: kontakt || null, halter_name: text(f.halterName, 120),
      kaufdatum: kauf, garantie_bis: gar, inspektion_intervall_monate: (iv as number | null) ?? 12, letzte_inspektion: insp,
      ek_cent: herkunft === 'bestand' ? (ek as number | null) : null, vk_cent: herkunft === 'bestand' ? (vk as number | null) : null,
      notiz: text(f.notiz, 1000),
    },
  };
}

export function radName(r: { marke: string | null; modell: string | null; rahmennummer?: string | null }, mitRahmen = false): string {
  const n = [r.marke, r.modell].filter(Boolean).join(' ') || 'Rad';
  return mitRahmen && r.rahmennummer ? `${n} · RN ${r.rahmennummer}` : n;
}

// ------------------------------------------------- Fristen und Ampeln ---

export type Ampel = 'ueber' | 'bald' | 'ok' | 'keine';

/** Tag plus Monate (Monatsende wird gekappt: 31.01. + 1 Monat = 28./29.02.). */
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const ziel = (m - 1) + monate;
  const jj = j + Math.floor(ziel / 12);
  const mm = ((ziel % 12) + 12) % 12;
  const letzter = new Date(Date.UTC(jj, mm + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(jj, mm, Math.min(t, letzter)));
  return d.toISOString().slice(0, 10);
}
export function tageBis(von: string, bis: string): number {
  const a = Date.UTC(+von.slice(0, 4), +von.slice(5, 7) - 1, +von.slice(8, 10));
  const b = Date.UTC(+bis.slice(0, 4), +bis.slice(5, 7) - 1, +bis.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Nächste Inspektion: letzte Inspektion (sonst Kaufdatum) + Intervall. Kein Intervall oder kein Datum = keine. „bald" = in 30 Tagen. */
export function inspektionFaellig(r: { letzte_inspektion: string | null; kaufdatum: string | null; inspektion_intervall_monate: number | null; status?: string | null }, heute: string): { am: string | null; ampel: Ampel; tage: number | null } {
  const iv = Math.floor(Number(r.inspektion_intervall_monate) || 0);
  const basis = r.letzte_inspektion || r.kaufdatum;
  if (iv <= 0 || !basis || !istIso(basis) || r.status === 'archiv') return { am: null, ampel: 'keine', tage: null };
  const am = plusMonate(basis, iv);
  const tage = tageBis(heute, am);
  return { am, ampel: tage < 0 ? 'ueber' : tage <= 30 ? 'bald' : 'ok', tage };
}

/** Herstellergarantie: läuft ab in 60 Tagen = „bald". */
export function garantieAmpel(garantieBis: string | null, heute: string): { ampel: Ampel; tage: number | null } {
  if (!garantieBis || !istIso(garantieBis)) return { ampel: 'keine', tage: null };
  const tage = tageBis(heute, garantieBis);
  return { ampel: tage < 0 ? 'ueber' : tage <= 60 ? 'bald' : 'ok', tage };
}

/** Gesetzliche Gewährleistung gegenüber Verbrauchern: 2 Jahre ab Übergabe (nur Hinweis, keine Rechtsauskunft). */
export function gewaehrleistungBis(uebergabe: string | null): string | null {
  return uebergabe && istIso(uebergabe) ? plusMonate(uebergabe, 24) : null;
}

// --------------------------------------- Reparatur-Annahme / Inspektion ---

export const ZUBEHOER = [
  { key: 'akku', label: 'Akku' }, { key: 'ladegeraet', label: 'Ladegerät' }, { key: 'schluessel', label: 'Schlüssel' },
  { key: 'display', label: 'Display / Bedienteil' }, { key: 'schloss', label: 'Schloss' }, { key: 'taschen', label: 'Taschen / Korb' },
] as const;

export type AnnahmeForm = {
  art: 'reparatur' | 'inspektion'; anliegen: string; zustand: string; zubehoer: Record<string, boolean>;
  kostengrenze: string; km: string; ladezyklen: string; abholung: string;
};

/**
 * Felder für einen Auftrag im Werkstatt-Board (werkstatt_auftraege). Der
 * Auftrag ist ein normaler Werkstatt-Auftrag — Positionen und Rechnung laufen
 * dort. Kostengrenze und abgegebenes Zubehör stehen im Annahme-Zustand.
 */
export function annahmeAuftrag(
  rad: { id: string; marke: string | null; modell: string | null; rahmennummer: string | null; art: string; halter_name: string | null; versicherungskennzeichen: string | null; akku_nr: string | null },
  f: AnnahmeForm,
  heute: string,
): { ok: true; felder: Record<string, unknown> } | { ok: false; grund: string } {
  const anliegen = text(f.anliegen, 1000);
  if (f.art === 'reparatur' && (!anliegen || anliegen.length < 3)) return { ok: false, grund: 'Bitte beschreiben Sie, was am Rad zu tun ist.' };
  const grenze = euroInCent(f.kostengrenze);
  if (Number.isNaN(grenze as number)) return { ok: false, grund: 'Die Kostengrenze bitte als Betrag.' };
  const km = ganz(f.km, 0, 999_999);
  if (Number.isNaN(km)) return { ok: false, grund: 'Der Kilometerstand ist eine ganze Zahl.' };
  const zyklen = ganz(f.ladezyklen, 0, 99_999);
  if (Number.isNaN(zyklen)) return { ok: false, grund: 'Die Ladezyklen sind eine ganze Zahl.' };
  const ab = tag(f.abholung);
  if (ab === false) return { ok: false, grund: 'Der Abholtermin ist kein gültiges Datum.' };
  if (ab && ab < heute) return { ok: false, grund: 'Der Abholtermin liegt in der Vergangenheit.' };
  const abgegeben = ZUBEHOER.filter((z) => f.zubehoer?.[z.key]).map((z) => z.label);
  const zust: string[] = [];
  const z = text(f.zustand, 600);
  if (z) zust.push(z);
  zust.push(`Abgegeben: ${abgegeben.length ? abgegeben.join(', ') : 'nur das Rad'}`);
  if (zyklen !== null) zust.push(`Akku-Ladezyklen: ${zyklen}`);
  if (rad.akku_nr) zust.push(`Akku-Nr.: ${rad.akku_nr}`);
  zust.push(grenze ? `Kostengrenze: ${(grenze / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € brutto — darüber vorher anrufen` : 'Keine Kostengrenze vereinbart');
  const name = radName(rad);
  return {
    ok: true,
    felder: {
      titel: `${f.art === 'inspektion' ? 'Inspektion' : 'Reparatur'} ${name}`.slice(0, 200),
      kunde_name: rad.halter_name || null,
      kennzeichen: rad.versicherungskennzeichen || null,
      kundenanliegen: anliegen ?? (f.art === 'inspektion' ? 'Inspektion nach Herstellervorgabe' : null),
      annahme_zustand: zust.join('\n').slice(0, 2000),
      beschreibung: rad.rahmennummer ? `Rahmennummer ${rad.rahmennummer}` : null,
      kilometerstand: km,
      zugesagt_am: ab || null,
      prioritaet: 'normal',
      zweirad_id: rad.id,
    },
  };
}

// ---------------------------------------------------------- Garantie ---

export const GARANTIE_ARTEN = [
  { key: 'garantie', label: 'Herstellergarantie' }, { key: 'gewaehrleistung', label: 'Gewährleistung' }, { key: 'kulanz', label: 'Kulanz' },
] as const;
export const BAUTEILE = [
  { key: 'akku', label: 'Akku' }, { key: 'motor', label: 'Motor' }, { key: 'display', label: 'Display / Bedienteil' }, { key: 'ladegeraet', label: 'Ladegerät' },
  { key: 'rahmen', label: 'Rahmen / Gabel' }, { key: 'schaltung', label: 'Schaltung / Antrieb' }, { key: 'bremse', label: 'Bremse' }, { key: 'sonstiges', label: 'Sonstiges' },
] as const;
export const GARANTIE_STATUS: Record<string, string> = {
  offen: 'offen', eingereicht: 'beim Hersteller', genehmigt: 'genehmigt', abgelehnt: 'abgelehnt', erledigt: 'erledigt',
};
const GARANTIE_WEGE: Record<string, readonly string[]> = {
  offen: ['eingereicht', 'erledigt'], eingereicht: ['genehmigt', 'abgelehnt'], genehmigt: ['erledigt'], abgelehnt: ['erledigt'], erledigt: [],
};
export function garantieWeiter(alt: string): readonly string[] { return GARANTIE_WEGE[alt] ?? []; }

export function garantiePruefen(f: { art: string; bauteil: string; fehler: string; herstellerNr: string; gemeldetAm: string }, heute: string):
  { ok: true; zeile: { art: string; bauteil: string; fehler: string; hersteller_nr: string | null; gemeldet_am: string } } | { ok: false; grund: string } {
  if (!GARANTIE_ARTEN.some((a) => a.key === f.art)) return { ok: false, grund: 'Bitte die Art wählen.' };
  if (!BAUTEILE.some((b) => b.key === f.bauteil)) return { ok: false, grund: 'Bitte das Bauteil wählen.' };
  const fehler = text(f.fehler, 1000);
  if (!fehler || fehler.length < 3) return { ok: false, grund: 'Bitte den Fehler beschreiben.' };
  const am = tag(f.gemeldetAm);
  if (!am || am > heute) return { ok: false, grund: 'Das Meldedatum ist ungültig oder liegt in der Zukunft.' };
  return { ok: true, zeile: { art: f.art, bauteil: f.bauteil, fehler, hersteller_nr: text(f.herstellerNr, 60), gemeldet_am: am } };
}

// ------------------------------------------------------------ Dienstrad ---

export const DR_STATUS = [
  { key: 'angebot', label: 'Angebot' },
  { key: 'eingereicht', label: 'im Portal eingereicht' },
  { key: 'genehmigt', label: 'genehmigt' },
  { key: 'uebergeben', label: 'übergeben' },
  { key: 'abgerechnet', label: 'abgerechnet' },
  { key: 'storniert', label: 'storniert' },
] as const;
export function drStatusName(k: string): string { return DR_STATUS.find((s) => s.key === k)?.label ?? k; }

/** Von Hand erlaubte Wechsel (abgerechnet setzt nur die Rechnung). Wie die Datenbank. */
const DR_WEGE: Record<string, readonly string[]> = {
  angebot: ['eingereicht', 'storniert'],
  eingereicht: ['angebot', 'genehmigt', 'storniert'],
  genehmigt: ['uebergeben', 'storniert'],
  uebergeben: [],
  abgerechnet: [],
  storniert: [],
};
export function drWeiter(alt: string): readonly string[] { return DR_WEGE[alt] ?? []; }

export type DrPosten = { bezeichnung: string; menge: number; netto_cent: number };
export const MAX_POSTEN = 30;

/** Posten (Rad, Zubehör, Service-Paket) prüfen: 1–30 Zeilen, Menge 1–99, Netto 0–100.000 € in ganzen Cent, Summe > 0. */
export function postenPruefen(roh: unknown): { ok: true; posten: DrPosten[] } | { ok: false; grund: string } {
  if (!Array.isArray(roh) || roh.length === 0) return { ok: false, grund: 'Das Angebot braucht mindestens eine Position.' };
  if (roh.length > MAX_POSTEN) return { ok: false, grund: `Höchstens ${MAX_POSTEN} Positionen.` };
  const out: DrPosten[] = [];
  for (const p of roh) {
    const o = (p ?? {}) as Record<string, unknown>;
    const bez = text(o.bezeichnung, 200);
    if (!bez || bez.length < 2) return { ok: false, grund: 'Jede Position braucht eine Bezeichnung.' };
    const menge = Number(o.menge);
    if (!Number.isInteger(menge) || menge < 1 || menge > 99) return { ok: false, grund: `„${bez}": Menge 1 bis 99.` };
    const c = Number(o.netto_cent);
    if (!Number.isInteger(c) || c < 0 || c > 10_000_000) return { ok: false, grund: `„${bez}": Preis 0 bis 100.000 € netto.` };
    out.push({ bezeichnung: bez, menge, netto_cent: c });
  }
  if (summeNetto(out) <= 0) return { ok: false, grund: 'Das Angebot hat keinen Betrag.' };
  return { ok: true, posten: out };
}

function summeNetto(p: readonly DrPosten[]): number {
  return p.reduce((s, x) => s + x.menge * x.netto_cent, 0);
}
/** 19 % auf eine Netto-Summe in Cent (kaufmännisch gerundet wie steuerGruppen). */
export function steuer19(nettoCent: number): number {
  return inCent((nettoCent / 100) * (19 / 100)); // genau wie steuerGruppen: cent(netto * (satz / 100))
}
/** Summe wie auf der Rechnung: eine Steuergruppe 19 % auf die Netto-Summe. */
export function drSumme(p: readonly DrPosten[]): { netto_cent: number; steuer_cent: number; brutto_cent: number } {
  const n = summeNetto(p);
  const st = steuer19(n);
  return { netto_cent: n, steuer_cent: st, brutto_cent: n + st };
}

/**
 * Netto zu einem Brutto-Preis (19 %). Gesucht wird der Netto-Betrag, dessen
 * Brutto genau wieder den eingegebenen Preis ergibt; geht das nicht (einzelne
 * Cent-Beträge sind unerreichbar), der nächstliegende mit exakt = false.
 */
export function nettoAusBrutto(bruttoCent: number): { netto_cent: number; exakt: boolean } {
  const b = Math.max(0, Math.floor(bruttoCent));
  const n0 = Math.round(b / 1.19);
  for (const d of [0, -1, 1, -2, 2]) {
    const n = n0 + d;
    if (n >= 0 && n + steuer19(n) === b) return { netto_cent: n, exakt: true };
  }
  return { netto_cent: n0, exakt: false };
}

/** Eingabe einer Position: Betrag als netto oder brutto → netto in Cent. */
export function postenAusEingabe(bezeichnung: string, menge: string, betrag: string, istBrutto: boolean): { ok: true; posten: DrPosten; exakt: boolean } | { ok: false; grund: string } {
  const c = euroInCent(betrag);
  if (c === null || Number.isNaN(c)) return { ok: false, grund: 'Bitte einen Betrag eingeben.' };
  const m = ganz(menge || '1', 1, 99);
  if (m === null || Number.isNaN(m)) return { ok: false, grund: 'Menge 1 bis 99.' };
  const bez = text(bezeichnung, 200);
  if (!bez || bez.length < 2) return { ok: false, grund: 'Bitte eine Bezeichnung eingeben.' };
  const nb = istBrutto ? nettoAusBrutto(c) : { netto_cent: c, exakt: true };
  return { ok: true, posten: { bezeichnung: bez, menge: m as number, netto_cent: nb.netto_cent }, exakt: nb.exakt };
}

export type DrVorgang = {
  status: string; portal: string | null; portal_nr: string | null; posten: unknown; zweirad_id: string | null;
  arbeitnehmer_name: string; arbeitgeber_name: string; leasinggeber_name: string | null; leasinggeber_anschrift: string | null;
  uebergabe_check: Record<string, unknown> | null;
};
export type DrRad = { id: string; herkunft: string; status: string; rahmennummer: string | null } | null;

export const UEBERGABE_PUNKTE = [
  { key: 'ausweis', label: 'Ausweis des Mitarbeiters geprüft', pflicht: true },
  { key: 'einweisung', label: 'Einweisung in Rad, Akku und Laden gegeben', pflicht: true },
  { key: 'protokoll', label: 'Übergabeprotokoll im Portal bestätigt', pflicht: false },
  { key: 'schluessel', label: 'Schlüssel und Ladegerät übergeben', pflicht: false },
] as const;

/** Statuswechsel prüfen (wie die Datenbank). */
export function drWechselPruefen(v: DrVorgang, nach: string, rad: DrRad): { ok: true } | { ok: false; grund: string } {
  if (!drWeiter(v.status).includes(nach)) return { ok: false, grund: `Von „${drStatusName(v.status)}" geht es nicht zu „${drStatusName(nach)}".` };
  if (nach === 'eingereicht') {
    if (!text(v.portal, 80)) return { ok: false, grund: 'Bitte das Leasing-Portal eintragen.' };
    const p = postenPruefen(v.posten);
    if (!p.ok) return p;
  }
  if (nach === 'genehmigt' && !text(v.portal_nr, 60)) return { ok: false, grund: 'Bitte die Bestell- bzw. Auftragsnummer aus dem Portal eintragen.' };
  if (nach === 'uebergeben') {
    if (!rad) return { ok: false, grund: 'Bitte zuerst das Rad aus Ihrem Bestand zuordnen.' };
    if (rad.herkunft !== 'bestand') return { ok: false, grund: 'Ein Kundenrad kann nicht als Dienstrad übergeben werden.' };
    if (!rad.rahmennummer) return { ok: false, grund: 'Das Rad braucht eine Rahmennummer — sie steht im Übergabeprotokoll des Portals.' };
    if (rad.status === 'verkauft' || rad.status === 'archiv') return { ok: false, grund: 'Das Rad ist schon verkauft oder archiviert.' };
    const c = v.uebergabe_check ?? {};
    const fehlt = UEBERGABE_PUNKTE.filter((p) => p.pflicht && c[p.key] !== true).map((p) => p.label);
    if (fehlt.length) return { ok: false, grund: `Vor der Übergabe fehlt: ${fehlt.join(', ')}.` };
  }
  return { ok: true };
}

export function drRechnungMoeglich(v: { status: string; leasinggeber_name: string | null; rechnung_offen?: boolean }): { ok: true } | { ok: false; grund: string } {
  if (v.status !== 'uebergeben' && v.status !== 'abgerechnet') return { ok: false, grund: 'Die Rechnung an den Leasinggeber entsteht erst nach der Übergabe.' };
  if (!text(v.leasinggeber_name, 160)) return { ok: false, grund: 'Bitte den Leasinggeber (Rechnungsempfänger laut Portal) eintragen.' };
  return { ok: true };
}

/** Rechnungsposten (netto, 19 %) — Rahmennummer an der ersten Position, damit sie auf der Rechnung steht. */
export function drRechnungPosten(posten: readonly DrPosten[], rahmennummer: string | null): { bezeichnung: string; menge: number; einheit: string; einzelpreis_cent: number; summe_cent: number; mwst_satz: number }[] {
  return posten.map((p, i) => ({
    bezeichnung: (i === 0 && rahmennummer ? `${p.bezeichnung} · Rahmennummer ${rahmennummer}` : p.bezeichnung).slice(0, 300),
    menge: p.menge, einheit: 'Stück', einzelpreis_cent: p.netto_cent, summe_cent: p.menge * p.netto_cent, mwst_satz: 19,
  }));
}

export function drRechnungText(v: { nummer: string | null; portal: string | null; portal_nr: string | null; arbeitnehmer_name: string; arbeitgeber_name: string }): { titel: string; notiz: string } {
  const titel = `Dienstrad ${v.portal_nr ? `Auftrag ${v.portal_nr}` : v.nummer ?? ''} · Nutzer ${v.arbeitnehmer_name}`.replace(/\s+/g, ' ').trim().slice(0, 200);
  const notiz = `Dienstrad-Überlassung über ${v.portal ?? 'das Leasing-Portal'}${v.portal_nr ? ` (Auftrag ${v.portal_nr})` : ''}. Nutzer: ${v.arbeitnehmer_name}, Arbeitgeber: ${v.arbeitgeber_name}. Vorgang ${v.nummer ?? ''}.`.replace(/\s+/g, ' ').trim();
  return { titel, notiz: notiz.slice(0, 1000) };
}

export type DrForm = {
  arbeitnehmerName: string; arbeitnehmerKontaktId: string; arbeitnehmerTelefon: string; arbeitgeberName: string;
  portal: string; portalNr: string; abholcode: string; leasinggeberName: string; leasinggeberAnschrift: string; notiz: string;
};
export function drKopfPruefen(f: DrForm): { ok: true; zeile: Record<string, string | null> } | { ok: false; grund: string } {
  const an = text(f.arbeitnehmerName, 120);
  if (!an || an.length < 2) return { ok: false, grund: 'Bitte den Namen des Mitarbeiters (Nutzer des Dienstrads) eintragen.' };
  const ag = text(f.arbeitgeberName, 160);
  if (!ag || ag.length < 2) return { ok: false, grund: 'Bitte den Arbeitgeber eintragen.' };
  const k = String(f.arbeitnehmerKontaktId || '').trim();
  if (k && !istUuid(k)) return { ok: false, grund: 'Der Kontakt ist ungültig.' };
  const anschrift = String(f.leasinggeberAnschrift ?? '').trim().slice(0, 400) || null;
  return {
    ok: true,
    zeile: {
      arbeitnehmer_name: an, arbeitnehmer_kontakt_id: k || null, arbeitnehmer_telefon: text(f.arbeitnehmerTelefon, 40), arbeitgeber_name: ag,
      portal: text(f.portal, 80), portal_nr: text(f.portalNr, 60), abholcode: text(f.abholcode, 40),
      leasinggeber_name: text(f.leasinggeberName, 160), leasinggeber_anschrift: anschrift, notiz: text(f.notiz, 1000),
    },
  };
}

// ------------------------------------------------------------- Kontakte ---

export type ZrKontakt = { id: string; name: string; telefon: string | null; anschrift: string | null };
/** Kontakt aus der Kontaktliste lesen (Name, Telefon, Anschrift) — wie in der Fahrzeugvermietung. */
export function kontaktLesen(k: Record<string, unknown>): ZrKontakt {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const name = s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
  const ort = [s(k.plz), s(k.ort)].filter(Boolean).join(' ');
  const anschrift = [s(k.strasse), ort].filter(Boolean).join('\n') || s(k.adresse) || null;
  return { id: String(k.id), name, telefon: s(k.telefon) || s(k.mobil) || null, anschrift };
}

/** Suche über Marke, Modell, Rahmen-, Akku-, Motor-, Schlüsselnummer, Halter und Versicherungskennzeichen (ohne Leerzeichen, ohne Groß/klein). */
export function radPasst(r: { marke: string | null; modell: string | null; rahmennummer: string | null; akku_nr: string | null; motor_nr: string | null; schluessel_nr: string | null; halter_name: string | null; versicherungskennzeichen: string | null }, suche: string): boolean {
  const q = suche.replace(/\s+/g, '').toUpperCase();
  if (!q) return true;
  return [r.marke, r.modell, r.rahmennummer, r.akku_nr, r.motor_nr, r.schluessel_nr, r.halter_name, r.versicherungskennzeichen]
    .some((x) => !!x && x.replace(/\s+/g, '').toUpperCase().includes(q));
}

export function datumDe(iso: string | null | undefined): string {
  if (!iso || !istIso(iso.slice(0, 10))) return '—';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}
