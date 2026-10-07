// ============================================================================
// ARGONAUT OS · lib/kfzVerkauf.ts — Paket 266 (07.10.2026) · K6 Verkaufsunterlagen
//
// Reine Logik für den Verkaufsvorgang (Tabelle kfz_verkauf): Beträge mit
// Zusatzleistungen, Inzahlungnahme und Anzahlung, Bargeld-Summe für den
// GwG-Hinweis, Prüfungen je Status, Status-Wechsel und Bestand-Status,
// Inhalte der sechs Unterlagen (Angebot, Kaufvertrag, Reservierung,
// Anzahlungsquittung, Zulassungsvollmacht, Empfangsbestätigung) und deren
// Textfassung für ARGONAUT-Sign.
//
// GRUNDSÄTZE
// - Nichts wird geschönt: Vorschäden stehen so im Vertrag, wie sie in der
//   Akte erfasst sind; ohne Angabe heißt es „nicht bekannt".
// - Verbraucher: Sachmängelhaftung nie ausgeschlossen, Verkürzung auf ein
//   Jahr nur mit gesonderter Vereinbarung (eigener Abschnitt, eigene
//   Unterschrift). Texte sind Vorlagen — Anwalt-Liste R45.
// - Bargeld ab 10.000 € (Anzahlung + Restzahlung zusammen): Identifizierung
//   nach GwG, ohne Haken kein Vertrag.
// - Rechnung (§ 25a / Regelsteuer) entsteht erst in K7 — hier nur Hinweis.
//
// Nur Import der zentralen Rundung, KEINE Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { centRunden } from './zahlen';

export const UST_SATZ = 19;
export const GWG_BAR_GRENZE = 10000;

export type KaeuferArt = 'verbraucher' | 'unternehmer';
export type VerkaufStatus = 'angebot' | 'reserviert' | 'vertrag' | 'uebergeben' | 'storniert';
export type Gewaehr = 'gesetzlich' | 'ein_jahr' | 'ausgeschlossen';
export type Zusatz = { text: string; betrag: number };

export const VERKAUF_STATUS: { key: VerkaufStatus; label: string; farbe: 'ok' | 'warn' | 'bad' | 'info' | 'gold' | 'dim' }[] = [
  { key: 'angebot', label: 'Angebot', farbe: 'info' },
  { key: 'reserviert', label: 'Reserviert', farbe: 'gold' },
  { key: 'vertrag', label: 'Kaufvertrag', farbe: 'ok' },
  { key: 'uebergeben', label: 'Übergeben', farbe: 'dim' },
  { key: 'storniert', label: 'Storniert', farbe: 'bad' },
];

export const ZAHLARTEN: { key: string; label: string }[] = [
  { key: 'ueberweisung', label: 'Überweisung' },
  { key: 'bar', label: 'Bar' },
  { key: 'karte', label: 'Karte' },
  { key: 'finanzierung', label: 'Finanzierung / Leasing über Dritte' },
];

export const GEWAEHR: { key: Gewaehr; label: string; nurUnternehmer: boolean }[] = [
  { key: 'gesetzlich', label: 'Gesetzliche Sachmängelhaftung', nurUnternehmer: false },
  { key: 'ein_jahr', label: 'Verjährung auf ein Jahr verkürzt', nurUnternehmer: false },
  { key: 'ausgeschlossen', label: 'Sachmängelhaftung ausgeschlossen', nurUnternehmer: true },
];

export const PAPIERE: string[] = [
  'Zulassungsbescheinigung Teil I',
  'Zulassungsbescheinigung Teil II',
  'Serviceheft / Wartungsnachweise',
  'Bericht der letzten Hauptuntersuchung',
  'Bedienungsanleitung',
  'COC-Papier / Übereinstimmungsbescheinigung',
  'Reifen / Räder separat',
];

export type DokArt = 'angebot' | 'kaufvertrag' | 'reservierung' | 'anzahlung' | 'vollmacht' | 'uebergabe';
export const DOK_ARTEN: { key: DokArt; label: string; sign: boolean }[] = [
  { key: 'angebot', label: 'Angebot', sign: true },
  { key: 'reservierung', label: 'Reservierung', sign: true },
  { key: 'anzahlung', label: 'Quittung Anzahlung', sign: false },
  { key: 'kaufvertrag', label: 'Kaufvertrag', sign: true },
  { key: 'vollmacht', label: 'Zulassungsvollmacht', sign: true },
  { key: 'uebergabe', label: 'Empfangsbestätigung', sign: true },
];

export type Verkauf = {
  nr: string | null;
  status: string;
  kaeufer_art: string;
  kaeufer_name: string | null; kaeufer_firma: string | null; kaeufer_anschrift: string | null;
  kaeufer_tel: string | null; kaeufer_email: string | null; kaeufer_ustid: string | null;
  ausweis_geprueft: boolean;
  preis_brutto: number | null;
  zusatz: unknown;
  inzahlung_ankauf_id: string | null;
  inzahlung_betrag: number | null;
  anzahlung: number | null; anzahlung_am: string | null; anzahlung_art: string | null;
  rest_art: string | null;
  gwg_erledigt: boolean;
  gewaehr: string; gewaehr_gesondert: boolean;
  angebot_gueltig_bis: string | null; reserviert_bis: string | null; vertrag_am: string | null; liefertermin: string | null;
  vereinbarungen: string | null;
  uebergabe_am: string | null; km_uebergabe: number | null; schluessel: number | null; papiere: string[] | null;
};

export type FahrzeugFuerVerkauf = {
  interne_nr: string | null;
  marke: string | null; modell: string | null; variante: string | null;
  fin: string | null; kennzeichen: string | null; erstzulassung: string | null;
  km_stand: number | null; leistung_kw: number | null; kraftstoff: string | null; farbe: string | null;
  hu_bis: string | null; vorbesitzer: number | null;
  vorschaden: string | null; vorschaden_text: string | null;
  besteuerung: string | null; vk_brutto: number | null;
};

export type InzahlungFahrzeug = {
  nr: string | null; marke: string | null; modell: string | null; fin: string | null; kennzeichen: string | null;
  km_stand: number | null; verkaeufer_art: string | null; ankaufpreis: number | null; angebot: number | null;
};

function n0(x: number | null | undefined): number {
  return x !== null && x !== undefined && Number.isFinite(x) && x > 0 ? x : 0;
}

// --- Nummer -------------------------------------------------------------------------
export function naechsteVerkaufNr(vorhanden: (string | null)[]): string {
  let max = 0;
  for (const n of vorhanden) {
    const m = String(n ?? '').match(/^V-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `V-${String(max + 1).padStart(4, '0')}`;
}

// --- Zusatzleistungen -----------------------------------------------------------------
/** Zusatzleistungen (Zulassung, Überführung …) bereinigen: höchstens 10, Text bis 120 Zeichen, Betrag brutto ≥ 0. */
export function zusatzBereinigen(roh: unknown): Zusatz[] {
  if (!Array.isArray(roh)) return [];
  const aus: Zusatz[] = [];
  for (const z of roh) {
    if (!z || typeof z !== 'object') continue;
    const r = z as Record<string, unknown>;
    const text = typeof r.text === 'string' ? r.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '';
    const b = typeof r.betrag === 'number' ? r.betrag : Number(r.betrag);
    if (!text || !Number.isFinite(b) || b < 0) continue;
    aus.push({ text, betrag: centRunden(b) });
    if (aus.length >= 10) break;
  }
  return aus;
}

// --- Beträge --------------------------------------------------------------------------
export type Betraege = {
  fahrzeug: number;          // vereinbarter Fahrzeugpreis brutto
  zusatz: number;            // Summe Zusatzleistungen brutto
  gesamt: number;            // fahrzeug + zusatz
  inzahlung: number;         // Anrechnung Inzahlungnahme
  anzahlung: number;
  rest: number;              // gesamt − inzahlung − anzahlung (negativ = Betrieb zahlt an Käufer)
};

export function betraege(v: Pick<Verkauf, 'preis_brutto' | 'zusatz' | 'inzahlung_ankauf_id' | 'inzahlung_betrag' | 'anzahlung'>): Betraege {
  const fahrzeug = centRunden(n0(v.preis_brutto));
  const zusatz = centRunden(zusatzBereinigen(v.zusatz).reduce((s, z) => s + z.betrag, 0));
  const gesamt = centRunden(fahrzeug + zusatz);
  const inzahlung = v.inzahlung_ankauf_id ? centRunden(n0(v.inzahlung_betrag)) : 0;
  const anzahlung = centRunden(n0(v.anzahlung));
  return { fahrzeug, zusatz, gesamt, inzahlung, anzahlung, rest: centRunden(gesamt - inzahlung - anzahlung) };
}

/** Bargeld insgesamt: Anzahlung bar + Restzahlung bar (zusammengehörende Zahlungen zählen zusammen). */
export function barSumme(v: Parameters<typeof betraege>[0] & Pick<Verkauf, 'anzahlung_art' | 'rest_art'>): number {
  const b = betraege(v);
  let s = 0;
  if (v.anzahlung_art === 'bar') s += b.anzahlung;
  if (v.rest_art === 'bar' && b.rest > 0) s += b.rest;
  return centRunden(s);
}

export function gwgNoetig(v: Parameters<typeof barSumme>[0]): boolean {
  return barSumme(v) >= GWG_BAR_GRENZE;
}

/** Vorschlag für die Anrechnung der Inzahlungnahme: vereinbarter Ankaufspreis, sonst Angebot; bei Unternehmen mit USt brutto. */
export function inzahlungVorschlag(a: InzahlungFahrzeug): number | null {
  const basis = a.ankaufpreis !== null && Number.isFinite(a.ankaufpreis) && a.ankaufpreis > 0 ? a.ankaufpreis
    : a.angebot !== null && Number.isFinite(a.angebot) && a.angebot > 0 ? a.angebot : null;
  if (basis === null) return null;
  return a.verkaeufer_art === 'gewerblich' ? centRunden(basis * (1 + UST_SATZ / 100)) : centRunden(basis);
}

/** Steuerzeilen zum Fahrzeugpreis (Richtangabe; die Rechnung kommt mit K7). */
export function steuerZeilen(preisBrutto: number, besteuerung: string | null): string[] {
  if (besteuerung === 'regel') {
    const netto = centRunden(preisBrutto / (1 + UST_SATZ / 100));
    return [`darin ${UST_SATZ} % Umsatzsteuer: ${geld(preisBrutto - netto)} (netto ${geld(netto)})`];
  }
  if (besteuerung === '25a') return ['Differenzbesteuerung nach § 25a UStG — die Umsatzsteuer wird nicht gesondert ausgewiesen.'];
  return [];
}

// --- Haftung ----------------------------------------------------------------------------
export function gewaehrErlaubt(kaeuferArt: string, g: string): boolean {
  if (g === 'gesetzlich' || g === 'ein_jahr') return true;
  return g === 'ausgeschlossen' && kaeuferArt === 'unternehmer';
}

// --- Status -----------------------------------------------------------------------------
const WECHSEL: Record<VerkaufStatus, VerkaufStatus[]> = {
  angebot: ['reserviert', 'vertrag', 'storniert'],
  reserviert: ['angebot', 'vertrag', 'storniert'],
  vertrag: ['uebergeben', 'storniert'],
  uebergeben: [],
  storniert: [],
};

export function wechselErlaubt(von: string, nach: string): boolean {
  const v = von as VerkaufStatus;
  return Array.isArray(WECHSEL[v]) && WECHSEL[v].includes(nach as VerkaufStatus);
}

export type Pruefung = { fehler: string[]; hinweise: string[] };

/**
 * Was fehlt, bevor ein Vorgang in den Status `ziel` gehen darf (fehler = blockiert),
 * und was zu beachten ist (hinweise = blockiert nicht).
 */
export function pruefen(v: Verkauf, fz: Pick<FahrzeugFuerVerkauf, 'fin' | 'vk_brutto' | 'vorschaden' | 'besteuerung'>, ziel: string, heuteIso: string): Pruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const b = betraege(v);
  const ist = (x: string) => ziel === x;
  if (v.status !== ziel && !wechselErlaubt(v.status, ziel)) fehler.push(`Von „${statusLabel(v.status)}" geht es nicht zu „${statusLabel(ziel)}".`);
  if (ziel === 'storniert') return { fehler, hinweise };

  if (b.fahrzeug <= 0) fehler.push('Bitte den vereinbarten Fahrzeugpreis eintragen.');
  if (!v.kaeufer_name && !v.kaeufer_firma) fehler.push('Bitte den Käufer eintragen.');
  if (!gewaehrErlaubt(v.kaeufer_art, v.gewaehr)) fehler.push('Gegenüber Verbrauchern kann die Sachmängelhaftung nicht ausgeschlossen werden.');
  if (ist('reserviert')) {
    if (!v.reserviert_bis) fehler.push('Bitte eintragen, bis wann reserviert ist.');
    else if (v.reserviert_bis < heuteIso.slice(0, 10)) fehler.push('Das Reservierungsdatum liegt in der Vergangenheit.');
  }
  if (ist('vertrag') || ist('uebergeben')) {
    if (!v.kaeufer_anschrift) fehler.push('Für den Kaufvertrag fehlt die Anschrift des Käufers.');
    if (v.kaeufer_art === 'verbraucher' && v.gewaehr === 'ein_jahr' && !v.gewaehr_gesondert) fehler.push('Die Verkürzung auf ein Jahr muss mit dem Verbraucher gesondert vereinbart werden: Haken „gesondert vereinbart" setzen und den eigenen Abschnitt im Vertrag unterschreiben lassen.');
    if (gwgNoetig(v) && !v.gwg_erledigt) fehler.push(`Bargeld ${geld(barSumme(v))}: Ab 10.000 € muss der Käufer nach dem Geldwäschegesetz identifiziert werden. Erst identifizieren (GwG-Identifizierung), dann Haken setzen.`);
    if (!fz.fin) hinweise.push('Die FIN fehlt in den Stammdaten — sie gehört in den Kaufvertrag.');
    if (!fz.vorschaden) hinweise.push('Vorschäden sind in der Akte nicht erfasst — im Vertrag steht dann „nicht bekannt".');
  }
  if (ist('uebergeben')) {
    if (v.km_uebergabe === null || v.km_uebergabe === undefined) fehler.push('Bitte den Kilometerstand bei der Übergabe eintragen.');
    if (b.rest > 0) hinweise.push(`Es sind noch ${geld(b.rest)} offen. Ohne vollständige Zahlung die Zulassungsbescheinigung Teil II nicht mitgeben.`);
  }
  if (v.kaeufer_art === 'unternehmer' && !v.kaeufer_firma) hinweise.push('Unternehmer als Käufer: Firmenname eintragen.');
  if (fz.vk_brutto !== null && fz.vk_brutto > 0 && b.fahrzeug > 0 && b.fahrzeug < fz.vk_brutto) hinweise.push(`Nachlass ${geld(fz.vk_brutto - b.fahrzeug)} gegenüber dem Inseratspreis.`);
  if (b.rest < 0) hinweise.push(`Die Inzahlungnahme ist höher als der Kaufpreis: ${geld(-b.rest)} zahlt der Betrieb an den Käufer aus.`);
  if (v.inzahlung_ankauf_id && b.inzahlung === 0) hinweise.push('Inzahlungnahme gewählt, aber kein Anrechnungsbetrag eingetragen.');
  if (gwgNoetig(v) && !v.gwg_erledigt && !ist('vertrag') && !ist('uebergeben')) hinweise.push(`Bargeld ${geld(barSumme(v))}: Vor dem Kaufvertrag ist die Identifizierung nach dem Geldwäschegesetz nötig.`);
  if (fz.besteuerung !== '25a' && fz.besteuerung !== 'regel') hinweise.push('Die Besteuerung des Fahrzeugs ist offen — bitte in den Stammdaten festlegen (§ 25a oder Regelsteuer).');
  return { fehler, hinweise };
}

export function statusLabel(k: string): string {
  return VERKAUF_STATUS.find((s) => s.key === k)?.label ?? k;
}

/**
 * Bestand-Status nach einem Verkaufs-Status. Bei Storno geht ein reserviertes oder
 * verkauftes Fahrzeug zurück in den Bestand; andere Bestand-Status bleiben.
 */
export function bestandNachVerkauf(verkaufStatus: string, bestandStatus: string, heuteIso: string, vertragAm: string | null): Record<string, unknown> | null {
  const tag = heuteIso.slice(0, 10);
  if (verkaufStatus === 'reserviert') return bestandStatus === 'verkauft' ? null : { status: 'reserviert' };
  if (verkaufStatus === 'vertrag' || verkaufStatus === 'uebergeben') return { status: 'verkauft', verkauft_am: vertragAm || tag };
  if (verkaufStatus === 'storniert' || verkaufStatus === 'angebot') {
    if (bestandStatus === 'reserviert' || bestandStatus === 'verkauft') return { status: 'bestand', verkauft_am: null };
  }
  return null;
}

// --- Unterlagen -------------------------------------------------------------------------
export type Firmenkopf = { name: string | null; strasse: string | null; plz: string | null; ort: string | null; telefon: string | null; email: string | null };

export type DokAbschnitt = { titel: string; zeilen?: [string, string][]; text?: string[]; eigeneUnterschrift?: string };
export type DokInhalt = {
  titel: string; nr: string; datum: string;
  links: { titel: string; zeilen: string[] };
  rechts: { titel: string; zeilen: string[] };
  abschnitte: DokAbschnitt[];
  unterschriften: string[];
};

function de(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}
export function geld(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function zahlartText(k: string | null): string {
  return ZAHLARTEN.find((z) => z.key === k)?.label ?? '—';
}
function firmaZeilen(f: Firmenkopf | null): string[] {
  if (!f || !f.name) return ['______________________________'];
  return [f.name, f.strasse, [f.plz, f.ort].filter(Boolean).join(' '), [f.telefon, f.email].filter(Boolean).join(' · ')]
    .filter((x): x is string => !!x && x.trim() !== '');
}
function kaeuferZeilen(v: Verkauf): string[] {
  const z = [v.kaeufer_firma, v.kaeufer_name, ...(v.kaeufer_anschrift ?? '').split(/\n+/), [v.kaeufer_tel, v.kaeufer_email].filter(Boolean).join(' · '),
    v.kaeufer_art === 'unternehmer' && v.kaeufer_ustid ? `USt-IdNr. ${v.kaeufer_ustid}` : null]
    .filter((x): x is string => !!x && x.trim() !== '');
  return z.length ? z : ['______________________________'];
}
function fahrzeugZeilen(fz: FahrzeugFuerVerkauf, kmUebergabe: number | null): [string, string][] {
  return [
    ['Fahrzeug', [fz.marke, fz.modell, fz.variante].filter(Boolean).join(' ') || '—'],
    ['FIN', fz.fin ?? '—'],
    ['Kennzeichen', fz.kennzeichen ?? '—'],
    ['Erstzulassung', fz.erstzulassung ? `${fz.erstzulassung.slice(5, 7)}/${fz.erstzulassung.slice(0, 4)}` : '—'],
    ['Kilometerstand laut Tacho', kmUebergabe !== null && kmUebergabe !== undefined ? `${kmUebergabe.toLocaleString('de-DE')} km` : fz.km_stand !== null && fz.km_stand !== undefined ? `${fz.km_stand.toLocaleString('de-DE')} km` : '—'],
    ['Leistung', fz.leistung_kw ? `${fz.leistung_kw} kW` : '—'],
    ['Kraftstoff', fz.kraftstoff ?? '—'],
    ['Farbe', fz.farbe ?? '—'],
    ['Nächste Hauptuntersuchung', fz.hu_bis ? de(fz.hu_bis) : '—'],
    ['Anzahl Vorbesitzer', fz.vorbesitzer !== null && fz.vorbesitzer !== undefined ? String(fz.vorbesitzer) : '—'],
    ['Interne Nummer', fz.interne_nr ?? '—'],
  ];
}
/** Vorschaden-Satz — nie geschönt. */
export function vorschadenSatz(fz: Pick<FahrzeugFuerVerkauf, 'vorschaden' | 'vorschaden_text'>): string {
  if (fz.vorschaden === 'keine_bekannt') return 'Dem Verkäufer sind keine Unfall- oder Vorschäden bekannt.';
  if (fz.vorschaden === 'ja') return `Bekannte Unfall- oder Vorschäden: ${fz.vorschaden_text?.trim() || 'ja (siehe Akte)'}.`;
  return 'Ob das Fahrzeug Unfall- oder Vorschäden hat, ist dem Verkäufer nicht bekannt.';
}
/** Text zur Sachmängelhaftung (Vorlage, Anwalt-Liste R45). */
export function haftungText(kaeuferArt: string, g: string): string[] {
  const vorbehalt = 'Unberührt bleiben Ansprüche auf Schadensersatz wegen Verletzung von Leben, Körper oder Gesundheit, bei Vorsatz oder grober Fahrlässigkeit, bei arglistig verschwiegenen Mängeln sowie aus einer ausdrücklich vereinbarten Beschaffenheit.';
  if (g === 'ausgeschlossen' && kaeuferArt === 'unternehmer') return ['Das Fahrzeug wird unter Ausschluss der Sachmängelhaftung verkauft.', vorbehalt];
  if (g === 'ein_jahr') {
    return [
      'Ansprüche wegen Sachmängeln verjähren ein Jahr nach Übergabe des Fahrzeugs.' + (kaeuferArt === 'verbraucher' ? ' Diese Verkürzung ist gesondert vereinbart (eigener Abschnitt unten).' : ''),
      vorbehalt,
    ];
  }
  return ['Es gelten die gesetzlichen Rechte bei Sachmängeln.'];
}

function preisAbschnitt(v: Verkauf, fz: FahrzeugFuerVerkauf, inz: InzahlungFahrzeug | null, mitZahlung: boolean): DokAbschnitt {
  const b = betraege(v);
  const zeilen: [string, string][] = [['Fahrzeugpreis', geld(b.fahrzeug)]];
  for (const z of zusatzBereinigen(v.zusatz)) zeilen.push([z.text, geld(z.betrag)]);
  if (b.zusatz > 0) zeilen.push(['Gesamtpreis', geld(b.gesamt)]);
  if (v.inzahlung_ankauf_id && b.inzahlung > 0) {
    const was = inz ? [inz.marke, inz.modell].filter(Boolean).join(' ') + (inz.fin ? `, FIN ${inz.fin}` : inz.kennzeichen ? `, ${inz.kennzeichen}` : '') : 'Fahrzeug des Käufers';
    zeilen.push([`abzüglich Inzahlungnahme (${was})`, `- ${geld(b.inzahlung)}`]);
  }
  if (mitZahlung && b.anzahlung > 0) zeilen.push([`abzüglich Anzahlung${v.anzahlung_am ? ` vom ${de(v.anzahlung_am)}` : ''} (${zahlartText(v.anzahlung_art)})`, `- ${geld(b.anzahlung)}`]);
  if (b.rest >= 0) zeilen.push([mitZahlung ? 'Noch zu zahlen' : 'Zu zahlen', geld(mitZahlung ? b.rest : centRunden(b.gesamt - b.inzahlung))]);
  else zeilen.push(['Auszahlung an den Käufer', geld(-b.rest)]);
  const text = [...steuerZeilen(b.fahrzeug, fz.besteuerung)];
  if (mitZahlung && v.rest_art) text.push(`Zahlung des Restbetrags: ${zahlartText(v.rest_art)}.`);
  if (v.rest_art === 'finanzierung') text.push('Die Finanzierung oder das Leasing schließt der Käufer selbst mit dem Geldgeber ab; der Verkäufer vermittelt nicht.');
  return { titel: 'Preis', zeilen, text };
}

/** Inhalt einer Unterlage — reine Daten, das PDF und ARGONAUT-Sign zeichnen nur. */
export function dokumentInhalt(art: DokArt, v: Verkauf, fz: FahrzeugFuerVerkauf, firma: Firmenkopf | null, inz: InzahlungFahrzeug | null, heuteIso: string): DokInhalt {
  const nr = v.nr ?? '—';
  const verk = { titel: 'VERKÄUFER', zeilen: firmaZeilen(firma) };
  const kaeu = { titel: 'KÄUFER', zeilen: kaeuferZeilen(v) };
  const fzA: DokAbschnitt = { titel: 'Fahrzeug', zeilen: fahrzeugZeilen(fz, art === 'uebergabe' ? v.km_uebergabe : null) };
  const sonst: DokAbschnitt[] = v.vereinbarungen?.trim() ? [{ titel: 'Weitere Vereinbarungen', text: v.vereinbarungen.trim().split(/\n+/) }] : [];

  if (art === 'angebot') {
    return {
      titel: 'Angebot', nr, datum: de(heuteIso), links: verk, rechts: kaeu,
      abschnitte: [
        fzA,
        { titel: 'Zustand', text: [vorschadenSatz(fz)] },
        preisAbschnitt(v, fz, inz, false),
        { titel: 'Sachmängelhaftung', text: haftungText(v.kaeufer_art, v.gewaehr) },
        ...sonst,
        { titel: 'Gültigkeit', text: [v.angebot_gueltig_bis ? `Dieses Angebot gilt bis zum ${de(v.angebot_gueltig_bis)}. Zwischenverkauf vorbehalten.` : 'Zwischenverkauf vorbehalten.', 'Mit der Unterschrift nimmt der Käufer dieses Angebot an. Der Kaufvertrag wird danach gesondert ausgefertigt.'] },
      ],
      unterschriften: ['Ort, Datum, Unterschrift Käufer (Annahme)'],
    };
  }
  if (art === 'reservierung') {
    const b = betraege(v);
    return {
      titel: 'Reservierungsbestätigung', nr, datum: de(heuteIso), links: verk, rechts: kaeu,
      abschnitte: [
        fzA,
        { titel: 'Reservierung', zeilen: [['Reserviert bis', de(v.reserviert_bis)], ['Vereinbarter Fahrzeugpreis', geld(b.fahrzeug)], ...(b.anzahlung > 0 ? [['Anzahlung', `${geld(b.anzahlung)} (${zahlartText(v.anzahlung_art)})`] as [string, string]] : [])] },
        { titel: 'Bedingungen', text: [
          'Der Verkäufer bietet das Fahrzeug bis zum genannten Tag keinem anderen Interessenten an.',
          'Kommt bis dahin kein Kaufvertrag zustande, endet die Reservierung ohne weitere Erklärung.' + (b.anzahlung > 0 ? ' Eine geleistete Anzahlung wird dann in voller Höhe zurückgezahlt, soweit unten nichts anderes vereinbart ist.' : ''),
          'Kommt der Kaufvertrag zustande, wird die Anzahlung auf den Kaufpreis angerechnet.',
        ] },
        ...sonst,
      ],
      unterschriften: ['Ort, Datum, Unterschrift Käufer', 'Ort, Datum, Unterschrift Verkäufer'],
    };
  }
  if (art === 'anzahlung') {
    const b = betraege(v);
    return {
      titel: 'Quittung über eine Anzahlung', nr, datum: de(v.anzahlung_am ?? heuteIso), links: { titel: 'EMPFÄNGER', zeilen: firmaZeilen(firma) }, rechts: { titel: 'ZAHLER', zeilen: kaeuferZeilen(v) },
      abschnitte: [
        { titel: 'Betrag', zeilen: [['Erhalten', geld(b.anzahlung)], ['Zahlart', zahlartText(v.anzahlung_art)], ['Am', de(v.anzahlung_am ?? heuteIso)]] },
        { titel: 'Wofür', text: [`Anzahlung auf den Kauf des Fahrzeugs ${[fz.marke, fz.modell, fz.variante].filter(Boolean).join(' ') || '—'}${fz.fin ? `, FIN ${fz.fin}` : ''}. Die Anzahlung wird auf den Kaufpreis angerechnet.`] },
      ],
      unterschriften: ['Ort, Datum, Unterschrift Empfänger'],
    };
  }
  if (art === 'vollmacht') {
    return {
      titel: 'Vollmacht zur Zulassung', nr, datum: de(heuteIso), links: { titel: 'VOLLMACHTGEBER (HALTER)', zeilen: kaeuferZeilen(v) }, rechts: { titel: 'BEVOLLMÄCHTIGT', zeilen: firmaZeilen(firma) },
      abschnitte: [
        fzA,
        { titel: 'Umfang', text: [
          'Der Vollmachtgeber bevollmächtigt den oben genannten Betrieb und dessen Beauftragte, das genannte Fahrzeug auf seinen Namen bei der Zulassungsbehörde zuzulassen und alle dafür nötigen Erklärungen abzugeben und Unterlagen entgegenzunehmen.',
          'Für die Kraftfahrzeugsteuer ist zusätzlich das SEPA-Lastschriftmandat für die Zollverwaltung nötig (eigenes Formular).',
          'Bitte eine Kopie des Personalausweises oder Reisepasses beilegen; bei Firmen zusätzlich einen aktuellen Handelsregisterauszug oder die Gewerbeanmeldung.',
        ] },
      ],
      unterschriften: ['Ort, Datum, Unterschrift Vollmachtgeber'],
    };
  }
  if (art === 'uebergabe') {
    const papiere = (v.papiere ?? []).filter((p) => typeof p === 'string' && p.trim());
    return {
      titel: 'Empfangsbestätigung', nr, datum: de(v.uebergabe_am ?? heuteIso), links: verk, rechts: kaeu,
      abschnitte: [
        fzA,
        { titel: 'Übergeben', zeilen: [['Datum der Übergabe', de(v.uebergabe_am ?? heuteIso)], ['Kilometerstand', v.km_uebergabe !== null && v.km_uebergabe !== undefined ? `${v.km_uebergabe.toLocaleString('de-DE')} km` : '—'], ['Schlüssel', v.schluessel !== null && v.schluessel !== undefined ? String(v.schluessel) : '—']] },
        { titel: 'Unterlagen', text: papiere.length ? papiere.map((p) => `- ${p}`) : ['- keine'] },
        { titel: 'Bestätigung', text: ['Der Käufer bestätigt, das Fahrzeug mit den genannten Schlüsseln und Unterlagen erhalten zu haben.'] },
      ],
      unterschriften: ['Ort, Datum, Unterschrift Käufer'],
    };
  }
  // Kaufvertrag
  const abschnitte: DokAbschnitt[] = [
    fzA,
    { titel: 'Zustand und Beschaffenheit', text: [vorschadenSatz(fz), 'Der Kilometerstand ist der vom Tacho abgelesene Wert.'] },
    preisAbschnitt(v, fz, inz, true),
    { titel: 'Übergabe und Eigentum', text: [
      v.liefertermin ? `Übergabe voraussichtlich am ${de(v.liefertermin)}.` : 'Der Übergabetermin wird gesondert vereinbart.',
      'Das Fahrzeug bleibt bis zur vollständigen Zahlung des Kaufpreises Eigentum des Verkäufers. Die Zulassungsbescheinigung Teil II wird nach vollständiger Zahlung übergeben.',
      ...(v.inzahlung_ankauf_id && inz ? [`Das Fahrzeug des Käufers (Ankauf ${inz.nr ?? '—'}) geht mit der Übergabe in das Eigentum des Verkäufers über. Für dieses Fahrzeug gilt der Ankaufschein.`] : []),
    ] },
    { titel: 'Sachmängelhaftung', text: haftungText(v.kaeufer_art, v.gewaehr) },
    ...sonst,
  ];
  if (v.kaeufer_art === 'verbraucher' && v.gewaehr === 'ein_jahr') {
    abschnitte.push({
      titel: 'Gesonderte Vereinbarung zur Verjährung',
      text: [
        'Der Käufer wurde vor Abgabe seiner Vertragserklärung eigens darauf hingewiesen, dass die Verjährungsfrist für Ansprüche wegen Sachmängeln bei diesem gebrauchten Fahrzeug auf ein Jahr ab Übergabe verkürzt werden soll.',
        'Diese Verkürzung wird hiermit ausdrücklich und gesondert vereinbart.',
      ],
      eigeneUnterschrift: 'Ort, Datum, Unterschrift Käufer (gesonderte Vereinbarung)',
    });
  }
  return {
    titel: 'Kaufvertrag über ein gebrauchtes Kraftfahrzeug', nr, datum: de(v.vertrag_am ?? heuteIso), links: verk, rechts: kaeu,
    abschnitte,
    unterschriften: ['Ort, Datum, Unterschrift Käufer', 'Ort, Datum, Unterschrift Verkäufer'],
  };
}

/** Textfassung für ARGONAUT-Sign (Zeilen bleiben erhalten). */
export function alsText(d: DokInhalt): string {
  const z: string[] = [`${d.titel.toUpperCase()}`, `Nr. ${d.nr} · ${d.datum}`, ''];
  z.push(`${d.links.titel}:`, ...d.links.zeilen, '', `${d.rechts.titel}:`, ...d.rechts.zeilen, '');
  for (const a of d.abschnitte) {
    z.push(a.titel.toUpperCase());
    for (const [k, w] of a.zeilen ?? []) z.push(`${k}: ${w}`);
    for (const t of a.text ?? []) z.push(t);
    if (a.eigeneUnterschrift) z.push('(Mit der Unterschrift unter diesem Dokument wird auch diese gesonderte Vereinbarung unterschrieben.)');
    z.push('');
  }
  return z.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Dateiname ohne Sonderzeichen. */
export function dateiName(art: DokArt, nr: string | null): string {
  const name = DOK_ARTEN.find((d) => d.key === art)?.label ?? art;
  return `${name}-${nr ?? 'Verkauf'}.pdf`.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9.-]+/g, '-');
}
