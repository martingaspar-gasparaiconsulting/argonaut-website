// ============================================================================
// ARGONAUT OS · lib/kfzBoerse.ts — Paket 272 (08.10.2026) · K11a eigene Fahrzeugbörse
//
// Reine Logik für die öffentliche Fahrzeugbörse eines Kfz-Betriebs
// (/fahrzeuge/<kennung>): Einstellung lesen, welche Fahrzeuge sichtbar sind,
// welche Felder überhaupt nach außen dürfen (Positivliste), Preis- und
// Energie-Angaben, Filter und Sortierung, Anfrage-Eingabe prüfen,
// Strukturdaten für Google (schema.org/Car).
//
// GRUNDSÄTZE
// - Nach außen geht NUR, was in BOERSE_SPALTEN steht und oeffentlich() durchlässt.
//   Einkaufspreis, Kalkulation, FIN, Kennzeichen, Notizen, Standort-Interna
//   verlassen den Betrieb nie — auch dann nicht, wenn jemand die Abfrage ändert.
// - Sichtbar ist nur, was der Betrieb ausdrücklich inseriert hat und was im
//   Bestand, in der Aufbereitung oder im Zulauf steht. Reserviert/verkauft: weg.
// - Google darf die Börse finden (Martin 08.10.2026: index). Standard beim
//   Einschalten: an; der Chef kann „Bei Google finden lassen" abschalten (dann noindex).
// - Preis: Endpreis nach PAngV; bei § 25a ohne Steuerausweis, bei Regelbesteuerung
//   „inkl. 19 % MwSt.". Ohne Preis „Preis auf Anfrage" (Anwalt-Punkt).
// - Energie/CO₂ werden gezeigt, wie der Betrieb sie in der Akte bestätigt hat.
//   ARGONAUT rechnet nichts dazu.
// Keine Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { leseZahl, centRunden } from './zahlen';
import { psAusKw, ezText } from './kfzBestand';
import { istElektro } from './kfzAkte';

/** Einstellungs-Modul (modul_einstellung) der Börse. */
export const BOERSE_MODUL = 'kfz-boerse';

/** Status, in denen ein inseriertes Fahrzeug öffentlich erscheint. */
export const BOERSE_STATUS = ['bestand', 'aufbereitung', 'zulauf'];

/**
 * Die einzigen Spalten, die die Börse aus kfz_bestand liest.
 * Eine Zeichenkette (der Supabase-Client liest die Liste auf Typ-Ebene).
 * NIE hinzufügen: ek_netto, fin, kennzeichen, notiz, standort_id, farbcode, erstellt_von.
 */
export const BOERSE_SPALTEN = 'id, interne_nr, status, sparte, marke, modell, variante, erstzulassung, km_stand, leistung_kw, kraftstoff, farbe, vk_brutto, besteuerung, inseriert, ausstattung, polster, vorbesitzer, hu_bis, vorschaden, vorschaden_text, inserat_titel, inserat_text, verbrauch_komb, verbrauch_einheit, co2_g_km, co2_klasse, aktualisiert_am';

/** Felder, die verboten sind — Wächter für Tests und für oeffentlich(). */
export const NIE_OEFFENTLICH = ['ek_netto', 'fin', 'kennzeichen', 'notiz', 'standort_id', 'farbcode', 'erstellt_von', 'owner_user_id'];

// --- Einstellung ------------------------------------------------------------------

/** Kennung: 24 Zeichen a–z, 0–9 (zufällig, keine Betriebs-ID im Link). */
export function kennungGueltig(k: unknown): k is string {
  return typeof k === 'string' && /^[a-z0-9]{24}$/.test(k);
}

/** Kennung aus Zufallsbytes (hex) bilden; zu wenig Zufall -> null. */
export function neueKennung(zufall: string): string | null {
  const z = String(zufall || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return z.length >= 24 ? z.slice(0, 24) : null;
}

export type BoerseEinstellung = { aktiv: boolean; kennung: string | null; google: boolean };

/** Einstellung aus modul_einstellung.einstellung lesen. Ohne gültige Kennung nie aktiv; Google nur, wenn aktiv — und dann an, solange nicht ausdrücklich abgeschaltet. */
export function boerseEinstellung(einst: unknown): BoerseEinstellung {
  const e = einst && typeof einst === 'object' ? (einst as Record<string, unknown>) : {};
  const kennung = kennungGueltig(e.kennung) ? e.kennung : null;
  const aktiv = e.aktiv === true && kennung !== null;
  return { aktiv, kennung, google: aktiv && e.google !== false };
}

// --- Sichtbarkeit und Positivliste ----------------------------------------------------

export function sichtbar(f: { status?: unknown; inseriert?: unknown }): boolean {
  return f.inseriert === true && typeof f.status === 'string' && BOERSE_STATUS.includes(f.status);
}

export type BoerseFahrzeug = {
  id: string; interne_nr: string | null; status: string; sparte: string | null;
  marke: string | null; modell: string | null; variante: string | null;
  erstzulassung: string | null; km_stand: number | null; leistung_kw: number | null;
  kraftstoff: string | null; farbe: string | null; vk_brutto: number | null; besteuerung: string | null;
  ausstattung: string[]; polster: string | null; vorbesitzer: number | null; hu_bis: string | null;
  vorschaden: string | null; vorschaden_text: string | null;
  inserat_titel: string | null; inserat_text: string | null;
  verbrauch_komb: number | null; verbrauch_einheit: string | null; co2_g_km: number | null; co2_klasse: string | null;
  aktualisiert_am: string | null;
};

function txt(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function zahl(v: unknown): number | null {
  const n = typeof v === 'number' ? v : leseZahl(v);
  return n === null || !Number.isFinite(n) ? null : n;
}
function tag(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/**
 * Datensatz -> öffentliches Fahrzeug. Nimmt ausschließlich die erlaubten Felder
 * (Positivliste) — alles andere fällt weg, auch wenn es in der Zeile steht.
 * Nicht sichtbare Fahrzeuge -> null.
 */
export function oeffentlich(roh: unknown): BoerseFahrzeug | null {
  if (!roh || typeof roh !== 'object') return null;
  const r = roh as Record<string, unknown>;
  if (!sichtbar(r) || typeof r.id !== 'string') return null;
  const vorschaden = r.vorschaden === 'keine_bekannt' || r.vorschaden === 'ja' || r.vorschaden === 'unbekannt' ? r.vorschaden : null;
  const klasse = typeof r.co2_klasse === 'string' && /^[A-G]$/.test(r.co2_klasse) ? r.co2_klasse : null;
  const einheit = r.verbrauch_einheit === 'l' || r.verbrauch_einheit === 'kwh' || r.verbrauch_einheit === 'kg' ? r.verbrauch_einheit : null;
  return {
    id: r.id, interne_nr: txt(r.interne_nr, 40), status: r.status as string, sparte: txt(r.sparte, 40),
    marke: txt(r.marke, 60), modell: txt(r.modell, 80), variante: txt(r.variante, 80),
    erstzulassung: tag(r.erstzulassung), km_stand: zahl(r.km_stand), leistung_kw: zahl(r.leistung_kw),
    kraftstoff: txt(r.kraftstoff, 40), farbe: txt(r.farbe, 40),
    vk_brutto: zahl(r.vk_brutto), besteuerung: r.besteuerung === '25a' || r.besteuerung === 'regel' ? r.besteuerung : null,
    ausstattung: Array.isArray(r.ausstattung) ? r.ausstattung.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, 60)).slice(0, 80) : [],
    polster: txt(r.polster, 60), vorbesitzer: zahl(r.vorbesitzer), hu_bis: tag(r.hu_bis),
    vorschaden, vorschaden_text: vorschaden === 'ja' ? txt(r.vorschaden_text, 300) : null,
    inserat_titel: txt(r.inserat_titel, 120), inserat_text: txt(r.inserat_text, 6000),
    verbrauch_komb: zahl(r.verbrauch_komb), verbrauch_einheit: einheit, co2_g_km: zahl(r.co2_g_km), co2_klasse: klasse,
    aktualisiert_am: typeof r.aktualisiert_am === 'string' ? r.aktualisiert_am : null,
  };
}

// --- Anzeige ----------------------------------------------------------------------------

export function fahrzeugName(f: Pick<BoerseFahrzeug, 'marke' | 'modell' | 'variante'>): string {
  return [f.marke, f.modell, f.variante].filter(Boolean).join(' ') || 'Fahrzeug';
}

/** Überschrift: Inseratstitel, sonst Marke Modell Ausführung. */
export function titel(f: Pick<BoerseFahrzeug, 'inserat_titel' | 'marke' | 'modell' | 'variante'>): string {
  return f.inserat_titel || fahrzeugName(f);
}

function zahlDe(n: number, stellen: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

/** Preis als Text: ganze Euro ohne Nachkommastellen, sonst mit Cent (der Preis muss exakt stimmen). */
export function preisText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return 'Preis auf Anfrage';
  const cent = Math.round(n * 100);
  return (cent % 100 === 0 ? zahlDe(cent / 100, 0) : zahlDe(cent / 100, 2)) + ' €';
}

/** Zusatz zum Preis je Besteuerung (Endpreis nach PAngV). */
export function preisZusatz(f: Pick<BoerseFahrzeug, 'vk_brutto' | 'besteuerung'>): string | null {
  if (!f.vk_brutto || f.vk_brutto <= 0) return null;
  if (f.besteuerung === '25a') return 'Endpreis · differenzbesteuert nach § 25a UStG, MwSt. nicht ausweisbar';
  if (f.besteuerung === 'regel') return 'Endpreis inkl. 19 % MwSt. · MwSt. ausweisbar';
  return 'Endpreis';
}

export function leistungText(kw: number | null | undefined): string | null {
  const ps = psAusKw(kw);
  return ps && kw ? `${Math.round(kw)} kW (${ps} PS)` : null;
}

export function kmText(km: number | null | undefined): string | null {
  return km === null || km === undefined || !Number.isFinite(km) ? null : `${zahlDe(Math.round(km), 0)} km`;
}

/** Vorschäden ehrlich benennen — „unfallfrei" nur bei bestätigtem „keine bekannt". */
export function vorschadenText(f: Pick<BoerseFahrzeug, 'vorschaden' | 'vorschaden_text'>): string {
  if (f.vorschaden === 'keine_bekannt') return 'Keine Unfallschäden bekannt';
  if (f.vorschaden === 'ja') return f.vorschaden_text ? `Vorschaden: ${f.vorschaden_text}` : 'Vorschaden vorhanden, Einzelheiten auf Anfrage';
  return 'Vorschäden: nicht bekannt';
}

export function statusHinweis(status: string): string | null {
  if (status === 'zulauf') return 'Im Zulauf, bald verfügbar';
  if (status === 'aufbereitung') return 'In Aufbereitung';
  return null;
}

/** Kerndaten als Zeilen [Bezeichnung, Wert] — leere fallen weg. */
export function fakten(f: BoerseFahrzeug): [string, string][] {
  const z: [string, string | null][] = [
    ['Erstzulassung', f.erstzulassung ? ezText(f.erstzulassung) : null],
    ['Kilometerstand', kmText(f.km_stand)],
    ['Leistung', leistungText(f.leistung_kw)],
    ['Kraftstoff', f.kraftstoff],
    ['Farbe', f.farbe],
    ['Polster', f.polster],
    ['Vorbesitzer', f.vorbesitzer === null ? null : String(Math.round(f.vorbesitzer))],
    ['HU bis', f.hu_bis ? ezText(f.hu_bis) : null],
    ['Unfall', vorschadenText(f)],
    ['Fahrzeug-Nr.', f.interne_nr],
  ];
  return z.filter((x): x is [string, string] => !!x[1]);
}

/** Einheit der Verbrauchsangabe. */
function einheitText(f: Pick<BoerseFahrzeug, 'verbrauch_einheit' | 'kraftstoff'>): string {
  const e = f.verbrauch_einheit ?? (istElektro(f.kraftstoff) ? 'kwh' : 'l');
  return e === 'kwh' ? 'kWh/100 km' : e === 'kg' ? 'kg/100 km' : 'l/100 km';
}

/** Energie- und CO₂-Angaben, wie in der Akte bestätigt. Leere Liste, wenn nichts eingetragen ist. */
export function energieZeilen(f: Pick<BoerseFahrzeug, 'verbrauch_komb' | 'verbrauch_einheit' | 'kraftstoff' | 'co2_g_km' | 'co2_klasse'>): [string, string][] {
  const z: [string, string][] = [];
  const elektro = (f.verbrauch_einheit ?? (istElektro(f.kraftstoff) ? 'kwh' : 'l')) === 'kwh';
  if (f.verbrauch_komb !== null && f.verbrauch_komb !== undefined) {
    z.push([elektro ? 'Stromverbrauch kombiniert' : 'Kraftstoffverbrauch kombiniert', `${zahlDe(f.verbrauch_komb, 1)} ${einheitText(f)}`]);
  }
  if (f.co2_g_km !== null && f.co2_g_km !== undefined) z.push(['CO₂-Emissionen kombiniert', `${zahlDe(Math.round(f.co2_g_km), 0)} g/km`]);
  if (f.co2_klasse) z.push(['CO₂-Klasse', f.co2_klasse]);
  return z;
}

/** Kurzzeile für Karten in der Liste: „03/2021 · 45.000 km · 110 kW (150 PS) · Diesel". */
export function kurzZeile(f: BoerseFahrzeug): string {
  return [f.erstzulassung ? `EZ ${ezText(f.erstzulassung)}` : null, kmText(f.km_stand), leistungText(f.leistung_kw), f.kraftstoff].filter(Boolean).join(' · ');
}

// --- Filter und Sortierung ----------------------------------------------------------------

export type Sortierung = 'neu' | 'preis_auf' | 'preis_ab' | 'km';
export type Filter = { marke: string | null; kraftstoff: string | null; preisBis: number | null; sort: Sortierung };

/** Filter aus der Adresszeile (?marke=&kraftstoff=&bis=&sort=) — alles ungültige wird ignoriert. */
export function filterLesen(sp: Record<string, string | string[] | undefined> | null | undefined): Filter {
  const eins = (k: string): string | null => {
    const v = sp?.[k];
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' && s.trim() ? s.trim().slice(0, 60) : null;
  };
  const bisRoh = eins('bis');
  const bis = bisRoh ? leseZahl(bisRoh) : null;
  const sortRoh = eins('sort');
  const sort: Sortierung = sortRoh === 'preis_auf' || sortRoh === 'preis_ab' || sortRoh === 'km' ? sortRoh : 'neu';
  return { marke: eins('marke'), kraftstoff: eins('kraftstoff'), preisBis: bis !== null && bis > 0 ? bis : null, sort };
}

function gleich(a: string | null, b: string | null): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

export function filtern(liste: BoerseFahrzeug[], f: Filter): BoerseFahrzeug[] {
  const aus = liste.filter((x) =>
    (!f.marke || gleich(x.marke, f.marke))
    && (!f.kraftstoff || gleich(x.kraftstoff, f.kraftstoff))
    && (f.preisBis === null || (x.vk_brutto !== null && x.vk_brutto > 0 && x.vk_brutto <= f.preisBis)));
  const preis = (x: BoerseFahrzeug) => (x.vk_brutto && x.vk_brutto > 0 ? x.vk_brutto : null);
  aus.sort((a, b) => {
    if (f.sort === 'preis_auf' || f.sort === 'preis_ab') {
      const pa = preis(a), pb = preis(b);
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;            // ohne Preis immer ans Ende
      if (pb === null) return -1;
      return f.sort === 'preis_auf' ? pa - pb : pb - pa;
    }
    if (f.sort === 'km') return (a.km_stand ?? Number.MAX_SAFE_INTEGER) - (b.km_stand ?? Number.MAX_SAFE_INTEGER);
    return String(b.aktualisiert_am ?? '').localeCompare(String(a.aktualisiert_am ?? ''));
  });
  return aus;
}

/** Auswahlwerte (Marken, Kraftstoffe) aus der Liste, alphabetisch, ohne Doppelte. */
export function auswahlWerte(liste: BoerseFahrzeug[], feld: 'marke' | 'kraftstoff'): string[] {
  const m = new Map<string, string>();
  for (const x of liste) {
    const v = (x[feld] ?? '').trim();
    if (v && !m.has(v.toLowerCase())) m.set(v.toLowerCase(), v);
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

// --- Anfrage-Formular -------------------------------------------------------------------

export const WUENSCHE: { key: string; label: string }[] = [
  { key: 'info', label: 'Frage zum Fahrzeug' },
  { key: 'probefahrt', label: 'Probefahrt vereinbaren' },
  { key: 'rueckruf', label: 'Bitte um Rückruf' },
];

function feld(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

const MAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idGueltig(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

/**
 * Eingabe aus dem Anfrage-Formular prüfen und in einen kfz_anfrage-Datensatz
 * übersetzen (ohne owner_user_id, bestand_id, nr — die setzt die Route aus
 * Kennung und Fahrzeug). Quelle immer „website", Stand „neu".
 * Pflicht: Name, E-Mail oder Telefon, Zustimmung.
 */
export function anfrageEingabePruefen(roh: unknown): { ok: true; daten: { name: string; email: string | null; tel: string | null; nachricht: string; wunsch: string } } | { ok: false; fehler: string } {
  if (!roh || typeof roh !== 'object') return { ok: false, fehler: 'Ungültige Anfrage.' };
  const b = roh as Record<string, unknown>;
  const name = feld(b.name, 120);
  const email = feld(b.email, 160);
  const tel = feld(b.telefon, 40);
  if (!name) return { ok: false, fehler: 'Bitte geben Sie Ihren Namen an.' };
  if (!email && !tel) return { ok: false, fehler: 'Bitte geben Sie eine E-Mail-Adresse oder Telefonnummer an.' };
  if (email && !MAIL_RE.test(email)) return { ok: false, fehler: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' };
  if (tel && !/^[+0-9 ()/-]{5,40}$/.test(tel)) return { ok: false, fehler: 'Bitte prüfen Sie die Telefonnummer.' };
  if (b.datenschutz !== true) return { ok: false, fehler: 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.' };
  const wunsch = WUENSCHE.some((w) => w.key === b.wunsch) ? (b.wunsch as string) : 'info';
  const text = feld(b.nachricht, 1500);
  const wunschLabel = WUENSCHE.find((w) => w.key === wunsch)?.label ?? 'Frage zum Fahrzeug';
  // Spalte nachricht hat max. 2000 Zeichen: Kopfzeile + 1500 Zeichen Text passen immer.
  const nachricht = `[Webseite · ${wunschLabel}]` + (text ? `\n${text}` : '');
  return { ok: true, daten: { name, email, tel, nachricht, wunsch } };
}

// --- Bilder und Strukturdaten ---------------------------------------------------------------

/** Adresse des Bildes über die Bild-Tür (stabil, der signierte Link wird erst beim Abruf erzeugt). */
export function bildPfad(kennung: string, medienId: string): string {
  return `/api/oeffentlich/kfz-boerse-bild?k=${encodeURIComponent(kennung)}&m=${encodeURIComponent(medienId)}`;
}

export function boersePfad(kennung: string, fahrzeugId?: string): string {
  return `/fahrzeuge/${kennung}` + (fahrzeugId ? `/${fahrzeugId}` : '');
}

function kraftstoffSchema(k: string | null): string | null {
  const s = String(k ?? '').toLowerCase();
  if (!s) return null;
  if (/plug|phev/.test(s)) return 'Plug-in-Hybrid';
  if (/hybrid/.test(s)) return 'Hybrid';
  if (istElektro(s)) return 'Elektro';
  if (/diesel/.test(s)) return 'Diesel';
  if (/benzin|super|otto/.test(s)) return 'Benzin';
  return k;
}

/**
 * schema.org/Car für Google (nur, wenn der Betrieb Google eingeschaltet hat).
 * Absolute Adressen; keine FIN, kein Kennzeichen.
 */
export function strukturDaten(f: BoerseFahrzeug, o: { basis: string; kennung: string; bilder: string[]; firma: string | null; ort: string | null }): Record<string, unknown> {
  const basis = o.basis.replace(/\/+$/, '');
  const url = basis + boersePfad(o.kennung, f.id);
  const d: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: titel(f),
    url,
    itemCondition: 'https://schema.org/UsedCondition',
  };
  if (f.marke) d.brand = { '@type': 'Brand', name: f.marke };
  if (f.modell) d.model = f.modell;
  if (f.inserat_text) d.description = f.inserat_text.slice(0, 5000);
  if (o.bilder.length) d.image = o.bilder.map((b) => (b.startsWith('http') ? b : basis + b));
  if (f.erstzulassung) d.dateVehicleFirstRegistered = f.erstzulassung;
  if (f.km_stand !== null) d.mileageFromOdometer = { '@type': 'QuantitativeValue', value: Math.round(f.km_stand), unitCode: 'KMT' };
  const ks = kraftstoffSchema(f.kraftstoff);
  if (ks) d.fuelType = ks;
  if (f.farbe) d.color = f.farbe;
  if (f.leistung_kw) d.vehicleEngine = { '@type': 'EngineSpecification', enginePower: { '@type': 'QuantitativeValue', value: Math.round(f.leistung_kw), unitCode: 'KWT' } };
  if (f.vorbesitzer !== null) d.numberOfPreviousOwners = Math.round(f.vorbesitzer);
  if (f.vk_brutto && f.vk_brutto > 0) {
    d.offers = {
      '@type': 'Offer', price: centRunden(f.vk_brutto),
      priceCurrency: 'EUR', url,
      availability: f.status === 'zulauf' ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      ...(o.firma ? { seller: { '@type': 'AutoDealer', name: o.firma, ...(o.ort ? { address: { '@type': 'PostalAddress', addressLocality: o.ort, addressCountry: 'DE' } } : {}) } } : {}),
    };
  }
  return d;
}

/** JSON sicher in ein <script>-Element einbetten (kein „</script>" möglich). */
export function jsonSicher(o: unknown): string {
  return JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// --- Darstellung und Rechtstexte -------------------------------------------------------------

/** Lesbare Schriftfarbe auf einer Akzentfarbe (#rrggbb): dunkel auf hellen, weiß auf dunklen Farben. */
export function textAuf(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#FFFFFF';
  const lin = (x: string) => { const c = parseInt(x, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return l > 0.45 ? '#111827' : '#FFFFFF';
}

export type FirmaKurz = { name: string; strasse: string; plz: string; ort: string; email: string; telefon: string };

/** Fehlende Angaben für Impressum und Datenschutz-Hinweis der Börse (Mindestangaben § 5 DDG). */
export function firmaFehlt(f: FirmaKurz): string[] {
  const x: string[] = [];
  if (!f.name.trim()) x.push('Firmenname');
  if (!f.strasse.trim()) x.push('Straße und Hausnummer');
  if (!f.plz.trim() || !f.ort.trim()) x.push('PLZ und Ort');
  if (!f.email.trim() && !f.telefon.trim()) x.push('E-Mail oder Telefon');
  return x;
}

/** Kurzer Datenschutz-Hinweis am Anfrage-Formular (Art. 13 DSGVO, Kurzfassung — Anwalt prüft). */
export function datenschutzHinweis(f: FirmaKurz): string {
  const wer = [f.name || 'Der Betrieb', f.strasse, [f.plz, f.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return `Verantwortlich: ${wer}${f.email ? `, ${f.email}` : ''}. `
    + 'Ihre Angaben werden ausschließlich verwendet, um Ihre Anfrage zu beantworten (Art. 6 Abs. 1 lit. b DSGVO), '
    + 'und gelöscht, sobald sie dafür nicht mehr gebraucht werden und keine gesetzliche Aufbewahrungspflicht besteht. '
    + 'Werbung erhalten Sie dadurch nicht. Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, '
    + 'Widerspruch und Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Technisch betrieben mit ARGONAUT OS '
    + '(Gaspar AI Consulting, Böblingen) als Auftragsverarbeiter.';
}
