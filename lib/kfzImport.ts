// ============================================================================
// ARGONAUT OS · lib/kfzImport.ts — Paket 283 (09.10.2026) · K16 Umzug Kfz-Handel
//
// Zwei Bausteine fuer den Umzug eines Autohauses ins Import-Center:
//
//  1. mobile.de-CSV LESEN
//     Fast jedes Haendlerprogramm (DMS) schickt seinen Bestand im
//     Upload-Format von mobile.de: Semikolon, KEINE Kopfzeile, jedes Feld an
//     einer festen Stelle (Handbuch „Upload-Interface CSV",
//     services.mobile.de/manual/upload-interface-csv_en.html). Diese Datei
//     liegt beim Haendler meist schon vor. Hier werden die belegten Stellen
//     in eine Tabelle mit deutschen Spaltennamen umgesetzt — der Import-Motor
//     ordnet sie danach wie jede andere Datei zu.
//     Nur Stellen, die im Handbuch stehen. Unbelegte Ausstattungs-Schalter
//     werden NICHT geraten, sondern nicht uebernommen (Hinweis an den Nutzer).
//
//  2. NACHARBEIT JE ZEILE (kfz_bestand)
//     Die Tabelle hat Pruefregeln (FIN nach ISO 3779, Vorschaden-Werte,
//     CO2-Klasse …). Eine einzige falsche Zeile wuerde sonst das ganze Paket
//     an der Datenbank scheitern lassen. Hier wird jeder Wert vorher
//     bereinigt; was nicht passt, wandert mit „Laut Altsystem: …" in die
//     Notiz — nichts verschluckt.
//
// Keine Imports, keine Hooks, keine Systemuhr („heute" kommt herein).
// ============================================================================

export type KfzWarnung = { feld: string; meldung: string };

// ---------------------------------------------------------------------------
// 1) mobile.de-Upload-CSV
// ---------------------------------------------------------------------------

/** Belegte Stellen (Index ab 0) laut mobile.de-Handbuch -> deutscher Spaltenname. */
export const MOBILE_DE_FELDER: { index: number; name: string }[] = [
  { index: 1, name: 'Interne Nummer' },
  { index: 2, name: 'Kategorie' },
  { index: 3, name: 'Marke' },
  { index: 4, name: 'Modell' },
  { index: 5, name: 'Leistung kW' },
  { index: 6, name: 'HU bis' },
  { index: 8, name: 'Erstzulassung' },
  { index: 9, name: 'Kilometerstand' },
  { index: 10, name: 'Verkaufspreis' },
  { index: 11, name: 'Besteuerung' },
  { index: 14, name: 'FIN' },
  { index: 15, name: 'Beschädigtes Fahrzeug' },
  { index: 16, name: 'Farbe' },
  { index: 23, name: 'Händlerpreis' },
  { index: 25, name: 'Bemerkung' },
  { index: 29, name: 'MwSt-Satz' },
  { index: 42, name: 'Türen' },
  { index: 52, name: 'Hubraum' },
  { index: 61, name: 'Schadstoffklasse' },
  { index: 109, name: 'Kraftstoff' },
  { index: 110, name: 'Getriebe' },
  { index: 158, name: 'Vorbesitzer' },
];

/** Ausstattungs-Schalter (0/1) laut Handbuch, Index -> Merkmal. */
export const MOBILE_DE_AUSSTATTUNG: { index: number; name: string }[] = [
  { index: 17, name: 'Klimaanlage' },
  { index: 27, name: 'Metallic' },
  { index: 31, name: 'Leichtmetallfelgen' },
  { index: 32, name: 'ESP' },
  { index: 33, name: 'ABS' },
  { index: 34, name: 'Anhängerkupplung' },
  { index: 36, name: 'Wegfahrsperre' },
  { index: 37, name: 'Navigationssystem' },
  { index: 38, name: 'Schiebedach' },
  { index: 39, name: 'Zentralverriegelung' },
];

/** Kraftstoff-Schluessel laut Handbuch (Feld 109). */
export const MOBILE_DE_KRAFTSTOFF: Record<string, string> = {
  '0': 'Sonstige', '1': 'Benzin', '2': 'Diesel', '3': 'Autogas (LPG)', '4': 'Erdgas (CNG)',
  '6': 'Elektro', '7': 'Hybrid (Benzin/Elektro)', '8': 'Wasserstoff', '9': 'Ethanol', '10': 'Hybrid (Diesel/Elektro)',
};
/** Getriebe laut Handbuch (Feld 110). 0 = keine Angabe. */
export const MOBILE_DE_GETRIEBE: Record<string, string> = { '1': 'Schaltgetriebe', '2': 'Halbautomatik', '3': 'Automatik' };

/** So viele Felder hat eine Zeile mindestens (bis Getriebe, Stelle 110). */
export const MOBILE_DE_MIN_FELDER = 111;

const ist01 = (v: unknown) => v === '0' || v === '1';

/** Kopfzeile eines mobile.de-Exports (manche Programme schreiben die Feldnamen davor)? */
function istKopf(z: readonly string[]): boolean {
  const make = String(z[3] ?? '').trim().toLowerCase();
  const km = String(z[9] ?? '').trim().toLowerCase();
  return make === 'make' || make === 'marke' || km === 'kilometre' || km === 'kilometer';
}

/** Sieht diese Zeile wie ein mobile.de-Datensatz aus (feste Stellen plausibel)? */
function istDatensatz(z: readonly string[]): boolean {
  if (z.length < MOBILE_DE_MIN_FELDER) return false;
  const make = String(z[3] ?? '').trim();
  const km = String(z[9] ?? '').trim();
  return make !== '' && !/^\d+$/.test(make) && /^\d+$/.test(km) && ist01(String(z[11] ?? '').trim()) && ist01(String(z[15] ?? '').trim());
}

/**
 * Ist das (roh gelesen, erste Zeile NICHT als Kopf behandelt) eine
 * mobile.de-Upload-Datei? Mindestens die ersten drei Datensaetze muessen
 * passen (bei kleinen Dateien alle) — lieber „normale CSV" als ein falscher
 * Treffer.
 */
export function istMobileDe(roh: readonly (readonly string[])[]): boolean {
  const daten = roh.filter((z) => z.some((x) => String(x ?? '').trim() !== ''));
  const ohneKopf = daten.length > 0 && istKopf(daten[0]) ? daten.slice(1) : daten;
  const probe = ohneKopf.slice(0, 3);
  return probe.length > 0 && probe.every(istDatensatz);
}

/** Preis aus der Datei: „12500" bleibt, „12500.50" wird „12500,50" (kein Tausenderpunkt-Raten). */
function preisText(v: string): string {
  const s = v.trim();
  if (/^\d+\.\d{1,2}$/.test(s)) return s.replace('.', ',');
  return s;
}

/**
 * mobile.de-Datensaetze -> Tabelle mit deutschen Spaltennamen.
 * `roh` = alle Zeilen der Datei (auch die erste), wie sie gelesen wurden.
 */
export function mobileDeTabelle(roh: readonly (readonly string[])[]): { kopf: string[]; zeilen: string[][]; hinweise: string[] } {
  const daten = roh.filter((z) => z.some((x) => String(x ?? '').trim() !== ''));
  const ohneKopf = daten.length > 0 && istKopf(daten[0]) ? daten.slice(1) : daten;
  const kopf = [...MOBILE_DE_FELDER.map((f) => f.name), 'Zustand', 'Ausstattung'];
  const zeilen: string[][] = [];
  let ausgelassen = 0;
  for (const z of ohneKopf) {
    if (!istDatensatz(z)) { ausgelassen++; continue; }
    const wert = (i: number) => String(z[i] ?? '').trim();
    const zeile = MOBILE_DE_FELDER.map((f) => {
      const v = wert(f.index);
      if (f.index === 10 || f.index === 23) return preisText(v);
      // Feld 11: 0 = MwSt ausweisbar (Regelbesteuerung), 1 = nicht ausweisbar (§ 25a)
      if (f.index === 11) return v === '0' ? 'Regelbesteuerung' : v === '1' ? '§ 25a' : '';
      if (f.index === 15) return v === '1' ? 'ja' : '';
      if (f.index === 61) return /^[1-6]$/.test(v) ? `Euro ${v}` : '';
      if (f.index === 109) return MOBILE_DE_KRAFTSTOFF[v] ?? '';
      if (f.index === 110) return MOBILE_DE_GETRIEBE[v] ?? '';
      return v;
    });
    const zustand = wert(21) === '1' ? 'Neufahrzeug' : wert(20) === '1' ? 'Jahreswagen' : '';
    const ausstattung = MOBILE_DE_AUSSTATTUNG.filter((a) => wert(a.index) === '1').map((a) => a.name).join(', ');
    zeilen.push([...zeile, zustand, ausstattung]);
  }
  const hinweise = [
    `mobile.de-Datei erkannt: ${zeilen.length} ${zeilen.length === 1 ? 'Fahrzeug' : 'Fahrzeuge'}. Die festen Felder wurden nach dem mobile.de-Handbuch in Spalten umgesetzt.`,
    'Weitere Ausstattungs-Schalter der mobile.de-Datei werden nicht übernommen — bitte Ausstattung nach dem Import in der Fahrzeugakte ergänzen.',
  ];
  if (ausgelassen > 0) hinweise.push(`${ausgelassen} ${ausgelassen === 1 ? 'Zeile passt' : 'Zeilen passen'} nicht zum mobile.de-Aufbau und ${ausgelassen === 1 ? 'wurde' : 'wurden'} ausgelassen.`);
  return { kopf, zeilen, hinweise };
}

// ---------------------------------------------------------------------------
// 2) Nacharbeit je Zeile fuer kfz_bestand
// ---------------------------------------------------------------------------

function norm(v: unknown): string {
  return String(v ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9%]+/g, ' ').trim();
}

const TAGE_MONAT = (j: number, m: number) => new Date(Date.UTC(j, m, 0)).getUTCDate();
const zwei = (n: number) => String(n).padStart(2, '0');

/**
 * Monat/Jahr lesen, wie Fahrzeugpapiere es schreiben: „03.2019", „3/2019",
 * „2019-03", „03/19" — oder ein volles Datum. `wo`: Tag im Monat, wenn nur
 * Monat/Jahr dasteht (Erstzulassung: der 1., HU: der letzte Tag).
 */
export function monatJahr(roh: unknown, wo: 'anfang' | 'ende', heuteIso: string): string | null {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  const jetzt = Number(heuteIso.slice(0, 4)) || 2026;
  const jahr4 = (j: string) => {
    if (j.length === 4) return Number(j);
    const n = Number(j);
    const kandidat = 2000 + n;
    return kandidat > jetzt + 10 ? 1900 + n : kandidat;
  };
  const tagFuer = (j: number, m: number) => (wo === 'anfang' ? 1 : TAGE_MONAT(j, m));
  const gut = (j: number, m: number, t: number) => j >= 1900 && j <= 2200 && m >= 1 && m <= 12 && t >= 1 && t <= TAGE_MONAT(j, m);

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) { const j = +m[1], mo = +m[2], t = +m[3]; return gut(j, mo, t) ? `${j}-${zwei(mo)}-${zwei(t)}` : null; }
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) { const j = jahr4(m[3]), mo = +m[2], t = +m[1]; return gut(j, mo, t) ? `${j}-${zwei(mo)}-${zwei(t)}` : null; }
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (m) { const j = +m[1], mo = +m[2]; return gut(j, mo, 1) ? `${j}-${zwei(mo)}-${zwei(tagFuer(j, mo))}` : null; }
  m = /^(\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) { const j = jahr4(m[2]), mo = +m[1]; return gut(j, mo, 1) ? `${j}-${zwei(mo)}-${zwei(tagFuer(j, mo))}` : null; }
  return null;
}

/** FIN nach ISO 3779 bereinigen (wie kfzBestand.finPruefen) — null = unbrauchbar. */
export function finBereinigt(roh: unknown): string | null {
  const f = String(roh ?? '').replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(f) ? f : null;
}

const BESTEUERUNG_25A = new Set(['25a', '25 a', 'differenz', 'differenzbesteuert', 'differenzbesteuerung', 'diff', 'diff besteuert',
  'nicht ausweisbar', 'mwst nicht ausweisbar', 'nein', 'marge', 'margenbesteuert', 'margenbesteuerung']);
const BESTEUERUNG_REGEL = new Set(['regel', 'regelbesteuert', 'regelbesteuerung', 'ausweisbar', 'mwst ausweisbar', 'ja', 'netto',
  'mit mwst', 'mwst', '19', '19%', '19 %', 'regelsteuer']);

/**
 * „§ 25a" / „Differenz" / „MwSt ausweisbar: ja" -> '25a' | 'regel' | null.
 * Eine nackte 0 oder 1 wird NICHT gedeutet (mobile.de meint mit 1 „nicht
 * ausweisbar", andere Listen mit 1 „ja") — der mobile.de-Leser setzt Text.
 */
export function besteuerungLesen(roh: unknown): '25a' | 'regel' | null {
  let n = norm(roh);
  const frage = /^(mwst ausweisbar|ausweisbar|mwst)\s+(ja|nein)$/.exec(n);
  if (frage) n = frage[2];
  if (!n) return null;
  if (/(^| )25 ?a( |$)/.test(n) || BESTEUERUNG_25A.has(n)) return '25a';
  if (BESTEUERUNG_REGEL.has(n)) return 'regel';
  return null;
}

/** Vorschaden laut Datei -> Wert der Tabelle. Nur Eindeutiges; „unfallfrei" heisst „keine bekannt". */
export function vorschadenLesen(roh: unknown): 'keine_bekannt' | 'ja' | 'unbekannt' | null {
  const n = norm(roh);
  if (!n) return null;
  if (['nein', 'unfallfrei', 'keine', 'keiner', 'kein', 'keine bekannt', 'ohne', 'schadenfrei', 'kein unfall'].includes(n)) return 'keine_bekannt';
  if (['ja', 'unfall', 'unfallfahrzeug', 'unfallwagen', 'beschaedigt', 'vorschaden', 'reparierter unfallschaden', 'repariert'].includes(n)) return 'ja';
  if (['unbekannt', 'k a', 'ka', 'keine angabe', 'nicht bekannt'].includes(n)) return 'unbekannt';
  return null;
}

/** Ausstattungs-Text („Klima, Navi; AHK") -> Liste, ohne Doppelte, je Merkmal hoechstens 60 Zeichen, hoechstens 100. */
export function ausstattungListe(roh: unknown): string[] {
  const raus: string[] = [];
  const gesehen = new Set<string>();
  for (const teil of String(roh ?? '').split(/[,;|\n\r]+/)) {
    const t = teil.trim().replace(/\s+/g, ' ').slice(0, 60);
    const k = t.toLowerCase();
    if (!t || gesehen.has(k)) continue;
    gesehen.add(k);
    raus.push(t);
    if (raus.length >= 100) break;
  }
  return raus;
}

function zahl(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Text an die Notiz haengen („Laut Altsystem: …"), ohne Doppelte. */
function anNotiz(werte: Record<string, unknown>, text: string): void {
  const alt = typeof werte.notiz === 'string' ? werte.notiz.trim() : '';
  if (alt.includes(text)) return;
  werte.notiz = alt ? `${alt}\n${text}` : text;
}

/**
 * Eine gepruefte Import-Zeile fuer kfz_bestand nacharbeiten (veraendert
 * `werte`). Die Rechenfelder (leistung_ps, standtage, ausstattung_text,
 * besteuerung_text, vorschaden_text_roh, zustand) entfernt der Motor danach.
 */
export function kfzBestandNacharbeit(werte: Record<string, unknown>, heuteIso: string): KfzWarnung[] {
  const w: KfzWarnung[] = [];
  const heute = heuteIso.slice(0, 10);

  // FIN
  if (werte.fin !== undefined && werte.fin !== null && String(werte.fin).trim() !== '') {
    const f = finBereinigt(werte.fin);
    if (f) werte.fin = f;
    else {
      anNotiz(werte, `FIN laut Altsystem: ${String(werte.fin).trim().slice(0, 40)}`);
      w.push({ feld: 'FIN', meldung: `„${String(werte.fin).trim()}" ist keine gültige FIN (17 Zeichen, ohne I, O, Q) — in die Notiz übernommen.` });
      delete werte.fin;
    }
  } else delete werte.fin;

  // Datumsfelder mit Monat/Jahr
  for (const [feld, label, wo] of [['erstzulassung', 'Erstzulassung', 'anfang'], ['hu_bis', 'HU bis', 'ende']] as const) {
    const roh = werte[feld];
    if (roh === undefined || roh === null || String(roh).trim() === '') { delete werte[feld]; continue; }
    const d = monatJahr(roh, wo, heute);
    if (d) werte[feld] = d;
    else {
      anNotiz(werte, `${label} laut Altsystem: ${String(roh).trim().slice(0, 40)}`);
      w.push({ feld: label, meldung: `„${String(roh).trim()}" ist kein lesbares Datum — in die Notiz übernommen.` });
      delete werte[feld];
    }
  }
  if (typeof werte.erstzulassung === 'string' && werte.erstzulassung > heute) {
    w.push({ feld: 'Erstzulassung', meldung: `Erstzulassung ${werte.erstzulassung} liegt in der Zukunft — bitte prüfen.` });
  }

  // Leistung: kW geht vor, sonst aus PS
  const kw = zahl(werte.leistung_kw);
  const ps = zahl(werte.leistung_ps);
  if (kw === null && ps !== null && ps > 0) {
    werte.leistung_kw = Math.round(ps / 1.35962);
    w.push({ feld: 'Leistung', meldung: `${ps} PS in ${werte.leistung_kw} kW umgerechnet.` });
  }

  // Ganzzahlen und Untergrenzen der Datenbank
  for (const [feld, label, max] of [['km_stand', 'Kilometerstand', 9_999_999], ['leistung_kw', 'Leistung kW', 5_000], ['vorbesitzer', 'Vorbesitzer', 99], ['co2_g_km', 'CO2 g/km', 2_000]] as const) {
    const v = zahl(werte[feld]);
    if (werte[feld] === undefined || werte[feld] === null || werte[feld] === '') { delete werte[feld]; continue; }
    if (v === null || v < 0 || v > max) {
      w.push({ feld: label, meldung: `„${String(werte[feld])}" liegt außerhalb des gültigen Bereichs — Feld bleibt leer.` });
      delete werte[feld];
    } else werte[feld] = Math.round(v);
  }
  for (const [feld, label] of [['ek_netto', 'Einkaufspreis netto'], ['vk_brutto', 'Verkaufspreis brutto'], ['verbrauch_komb', 'Verbrauch']] as const) {
    const v = zahl(werte[feld]);
    if (werte[feld] === undefined || werte[feld] === null || werte[feld] === '') { delete werte[feld]; continue; }
    if (v === null || v < 0) {
      w.push({ feld: label, meldung: `„${String(werte[feld])}" ist kein gültiger Betrag — Feld bleibt leer.` });
      delete werte[feld];
    }
  }

  // Ein Verkaufspreis von 0 € ist kein Preis (unlesbarer Wert wird im Motor zu 0)
  if (werte.vk_brutto === 0) {
    delete werte.vk_brutto;
    w.push({ feld: 'Verkaufspreis brutto', meldung: 'Verkaufspreis 0 € — Feld bleibt leer, bitte in der Akte eintragen.' });
  }

  // Besteuerung (eigene Spalte oder Rechenfeld)
  const bRoh = werte.besteuerung ?? werte.besteuerung_text;
  delete werte.besteuerung;
  if (bRoh !== undefined && bRoh !== null && String(bRoh).trim() !== '') {
    const b = besteuerungLesen(bRoh);
    if (b) werte.besteuerung = b;
    else {
      anNotiz(werte, `Besteuerung laut Altsystem: ${String(bRoh).trim().slice(0, 40)}`);
      w.push({ feld: 'Besteuerung', meldung: `„${String(bRoh).trim()}" ist weder § 25a noch Regelbesteuerung — bitte in der Akte festlegen.` });
    }
  }

  // Vorschaden
  const vRoh = werte.vorschaden;
  delete werte.vorschaden;
  if (vRoh !== undefined && vRoh !== null && String(vRoh).trim() !== '') {
    const v = vorschadenLesen(vRoh);
    if (v) werte.vorschaden = v;
    if (v !== 'keine_bekannt' && norm(vRoh) !== 'ja') {
      const text = typeof werte.vorschaden_text === 'string' && werte.vorschaden_text.trim() ? `${werte.vorschaden_text.trim()} · ` : '';
      werte.vorschaden_text = `${text}Laut Altsystem: ${String(vRoh).trim().slice(0, 200)}`;
    }
    if (!v) w.push({ feld: 'Vorschaden', meldung: `„${String(vRoh).trim()}" ist nicht eindeutig — als Text übernommen, bitte in der Akte festlegen.` });
  }

  // CO2-Klasse, Verbrauchseinheit, Inserat-Titel
  if (werte.co2_klasse !== undefined) {
    const k = String(werte.co2_klasse ?? '').trim().toUpperCase();
    if (/^[A-G]$/.test(k)) werte.co2_klasse = k;
    else { if (k) w.push({ feld: 'CO2-Klasse', meldung: `„${k}" ist keine CO2-Klasse (A bis G) — Feld bleibt leer.` }); delete werte.co2_klasse; }
  }
  if (werte.verbrauch_einheit !== undefined) {
    const e = norm(werte.verbrauch_einheit);
    const m = /^(l|liter|l 100 ?km)$/.test(e) ? 'l' : /^kwh/.test(e) ? 'kwh' : /^kg/.test(e) ? 'kg' : null;
    if (m) werte.verbrauch_einheit = m; else delete werte.verbrauch_einheit;
  }
  if (typeof werte.inserat_titel === 'string' && werte.inserat_titel.length > 120) {
    werte.inserat_titel = werte.inserat_titel.slice(0, 120);
    w.push({ feld: 'Inserat-Titel', meldung: 'Inserat-Titel auf 120 Zeichen gekürzt.' });
  }

  // Ausstattung als Liste
  if (typeof werte.ausstattung_text === 'string' && werte.ausstattung_text.trim()) {
    const liste = ausstattungListe(werte.ausstattung_text);
    if (liste.length > 0) werte.ausstattung = liste;
  }

  // Zustand (Neufahrzeug/Jahreswagen) als Notiz
  if (typeof werte.zustand === 'string' && werte.zustand.trim()) anNotiz(werte, `Zustand laut Altsystem: ${werte.zustand.trim().slice(0, 40)}`);

  // Standtage -> Eingangsdatum (nur wenn keins geliefert)
  const st = zahl(werte.standtage);
  if (!werte.eingang_am && st !== null && st >= 0 && st < 10_000) {
    const t = Date.parse(`${heute}T00:00:00Z`) - Math.round(st) * 86_400_000;
    werte.eingang_am = new Date(t).toISOString().slice(0, 10);
  }
  if (typeof werte.eingang_am === 'string' && werte.eingang_am > heute) {
    w.push({ feld: 'Eingang', meldung: `Eingangsdatum ${werte.eingang_am} liegt in der Zukunft — als heute eingetragen.` });
    werte.eingang_am = heute;
  }

  // Kennzeichen: Grossbuchstaben, einfache Leerzeichen
  if (typeof werte.kennzeichen === 'string') {
    const k = werte.kennzeichen.trim().toUpperCase().replace(/\s+/g, ' ');
    if (k) werte.kennzeichen = k; else delete werte.kennzeichen;
  }

  // Verkauft ohne Datum: Status bleibt, aber Hinweis (Standtage laufen sonst weiter)
  if (werte.status === 'verkauft' && !werte.verkauft_am) {
    w.push({ feld: 'Status', meldung: 'Verkauft ohne Verkaufsdatum — Standtage und Chef-Blick zählen das Fahrzeug erst mit Datum richtig.' });
  }
  return w;
}
