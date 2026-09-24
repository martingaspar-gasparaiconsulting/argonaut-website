// ============================================================================
// ARGONAUT OS · lib/ausschreibung.ts — Ausschreibungs-Radar (Paket PH · B12)
//
//   1. RADAR: öffentliche Ausschreibungen aus TED (EU-Amtsblatt, offizielle,
//      kostenlose Schnittstelle ohne Schlüssel) nach Suchprofil finden.
//      Grenze, ehrlich: TED enthält nur Ausschreibungen ab EU-Schwellenwert.
//      Kleinere (nationale) Vergaben stehen auf Landes-/Kommunalportalen —
//      die werden über „Ausschreibung prüfen" (Text einfügen) erfasst.
//   2. PRÜFEN: Ausschreibungstext einfügen -> Frist, Leistung, Ort,
//      geforderte Eignungsnachweise -> Abgleich mit der Nachweis-Mappe (PE).
//   3. VERFOLGEN: Status neu -> prüfen -> bieten -> abgegeben -> gewonnen/
//      verloren, mit Frist-Ampel.
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE Hooks, KEIN fetch.
// Node-getestet in tests/ausschreibungP78.test.mjs.
// ============================================================================

import { leseDatum, leseKiJson, plusTage, tageZwischen } from './sachbearbeiter';
import { bewerte, type NachweisZeile } from './nachweisMotor';

// ---------------------------------------------------------------------------
// Status und Frist
// ---------------------------------------------------------------------------

export type Status = 'neu' | 'pruefen' | 'bieten' | 'abgegeben' | 'gewonnen' | 'verloren' | 'verworfen';

export const STATUS: { key: Status; label: string; offen: boolean }[] = [
  { key: 'neu', label: 'Neu', offen: true },
  { key: 'pruefen', label: 'In Prüfung', offen: true },
  { key: 'bieten', label: 'Wir bieten', offen: true },
  { key: 'abgegeben', label: 'Angebot abgegeben', offen: false },
  { key: 'gewonnen', label: 'Gewonnen', offen: false },
  { key: 'verloren', label: 'Nicht erhalten', offen: false },
  { key: 'verworfen', label: 'Verworfen', offen: false },
];

export function statusFuer(k: unknown): Status {
  return STATUS.some((s) => s.key === k) ? (k as Status) : 'neu';
}

export type FristAmpel = { stufe: 'rot' | 'gelb' | 'gruen' | 'vorbei' | 'offen'; text: string; tage: number | null };

/** Frist-Ampel für die Angebotsabgabe: rot bis 3 Tage, gelb bis 10 Tage. */
export function fristAmpel(abgabe: string | null | undefined, heute: string): FristAmpel {
  const d = leseDatum(abgabe);
  if (!d) return { stufe: 'offen', text: 'Frist unbekannt', tage: null };
  const t = tageZwischen(heute, d);
  if (t < 0) return { stufe: 'vorbei', text: `Frist abgelaufen (${datumDe(d)})`, tage: t };
  if (t === 0) return { stufe: 'rot', text: `Abgabe HEUTE (${datumDe(d)})`, tage: 0 };
  if (t <= 3) return { stufe: 'rot', text: `Abgabe in ${t} Tag${t === 1 ? '' : 'en'} (${datumDe(d)})`, tage: t };
  if (t <= 10) return { stufe: 'gelb', text: `Abgabe in ${t} Tagen (${datumDe(d)})`, tage: t };
  return { stufe: 'gruen', text: `Abgabe bis ${datumDe(d)} (${t} Tage)`, tage: t };
}

export function datumDe(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}

// ---------------------------------------------------------------------------
// Suchprofil und TED-Abfrage
// ---------------------------------------------------------------------------

/** CPV-Hauptgruppen zur Auswahl (Unterkategorien findet die Stichwortsuche). */
export const CPV_VORSCHLAEGE: { code: string; label: string }[] = [
  { code: '45000000', label: 'Bauarbeiten (allgemein)' },
  { code: '45100000', label: 'Baustellenvorbereitung, Abbruch, Erdarbeiten' },
  { code: '45210000', label: 'Hochbau' },
  { code: '45230000', label: 'Tief- und Straßenbau' },
  { code: '45260000', label: 'Dacharbeiten' },
  { code: '45310000', label: 'Elektroinstallation' },
  { code: '45330000', label: 'Sanitär und Klempner' },
  { code: '45331000', label: 'Heizung, Lüftung, Klima' },
  { code: '45410000', label: 'Putzarbeiten' },
  { code: '45420000', label: 'Bautischler, Fenster, Türen' },
  { code: '45430000', label: 'Fliesen und Bodenbeläge' },
  { code: '45440000', label: 'Maler und Glaser' },
  { code: '45450000', label: 'Sonstiger Ausbau' },
  { code: '50000000', label: 'Reparatur und Wartung' },
  { code: '71000000', label: 'Architektur und Ingenieurleistungen' },
  { code: '72000000', label: 'IT-Dienstleistungen' },
  { code: '77310000', label: 'Grünflächenpflege' },
  { code: '79000000', label: 'Unternehmensdienstleistungen' },
  { code: '90910000', label: 'Reinigung' },
];

export type Profil = { suchwoerter: string[]; cpv: string[]; region: string[]; tage: number };

/** Gefährliche Zeichen raus: " und \ lassen TED Filter STILL fallen. */
export function saubererBegriff(s: unknown): string {
  return String(s ?? '').replace(/["\\()~*?:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function leseProfil(roh: unknown): Profil {
  const o = (roh ?? {}) as Record<string, unknown>;
  const liste = (v: unknown, max: number) =>
    [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/)).map(saubererBegriff).filter((x) => x.length >= 3))].slice(0, max);
  const cpv = [...new Set((Array.isArray(o.cpv) ? o.cpv : []).map((c) => String(c).replace(/\D/g, '')).filter((c) => /^\d{8}$/.test(c)))].slice(0, 10);
  const tage = Math.min(90, Math.max(1, Math.round(Number(o.tage) || 30)));
  return { suchwoerter: liste(o.suchwoerter, 10), cpv, region: liste(o.region, 10), tage };
}

/** Kompakte TED-Datumsform JJJJMMTT. */
function kompakt(iso: string): string { return iso.replace(/-/g, ''); }

/**
 * Die TED-Suche (Expertensyntax). Ohne Suchwort und ohne CPV -> null
 * (sonst käme ganz Deutschland).
 */
export function tedAbfrage(p: Profil, heute: string): string | null {
  if (!p.suchwoerter.length && !p.cpv.length) return null;
  const teile: string[] = [
    'buyer-country IN (DEU)',
    `publication-date>=${kompakt(plusTage(heute, -p.tage))}`,
  ];
  const oder: string[] = [
    ...p.suchwoerter.map((w) => `FT~("${w}")`),
    ...p.cpv.map((c) => `classification-cpv=${c}`),
  ];
  teile.push(oder.length === 1 ? oder[0] : `(${oder.join(' OR ')})`);
  return `${teile.join(' AND ')} SORT BY publication-date DESC`;
}

export const TED_FELDER = [
  'publication-number', 'publication-date', 'notice-title', 'buyer-name', 'buyer-country',
  'classification-cpv', 'deadline-receipt-tender-date-lot', 'estimated-value-proc', 'estimated-value-cur-proc',
];
/** Zusätzliche Felder — lehnt TED sie ab, fragt die Route ohne sie erneut. */
export const TED_FELDER_EXTRA = ['buyer-city', 'notice-type'];

export type Fund = {
  extern_id: string; titel: string; auftraggeber: string; ort: string; veroeffentlicht: string | null;
  abgabe_am: string | null; cpv: string[]; wert: number | null; link: string; region_treffer: boolean;
};

/** Mehrsprachiges Feld: Deutsch, sonst Englisch, sonst das erste. */
export function textAus(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textAus).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['deu', 'DEU', 'de', 'eng', 'ENG', 'en']) if (o[k] != null) return textAus(o[k]);
    const erst = Object.values(o)[0];
    return textAus(erst);
  }
  return '';
}

function erstesDatum(v: unknown): string | null {
  const s = textAus(Array.isArray(v) ? v[0] : v);
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? leseDatum(m[1]) : null;
}

export function leseTedFund(n: unknown, region: string[]): Fund | null {
  const o = (n ?? {}) as Record<string, unknown>;
  const nr = textAus(o['publication-number']).trim();
  if (!nr) return null;
  const titel = textAus(o['notice-title']).replace(/\s+/g, ' ').trim().slice(0, 300) || 'Ohne Titel';
  const auftraggeber = [...new Set(textAus(o['buyer-name']).split(', '))].join(', ').slice(0, 200);
  const ort = [...new Set(textAus(o['buyer-city']).split(', '))].filter(Boolean).join(', ').slice(0, 120);
  const cpv = [...new Set((Array.isArray(o['classification-cpv']) ? o['classification-cpv'] : [o['classification-cpv']]).map((c) => textAus(c)).filter((c) => /^\d{8}/.test(c)).map((c) => c.slice(0, 8)))];
  const wertRoh = Array.isArray(o['estimated-value-proc']) ? o['estimated-value-proc'][0] : o['estimated-value-proc'];
  const wert = wertRoh != null && Number.isFinite(Number(wertRoh)) ? Number(wertRoh) : null;
  const heuhaufen = `${titel} ${auftraggeber} ${ort}`.toLowerCase();
  return {
    extern_id: `ted:${nr}`,
    titel, auftraggeber, ort,
    veroeffentlicht: erstesDatum(o['publication-date']),
    abgabe_am: erstesDatum(o['deadline-receipt-tender-date-lot']),
    cpv, wert,
    link: `https://ted.europa.eu/de/notice/-/detail/${encodeURIComponent(nr)}`,
    region_treffer: region.some((r) => heuhaufen.includes(r.toLowerCase())),
  };
}

/** Region-Treffer zuerst, dann die nächste Frist zuerst, ohne Frist ans Ende. */
export function sortiereFunde(f: Fund[]): Fund[] {
  return [...f].sort((a, b) => {
    if (a.region_treffer !== b.region_treffer) return a.region_treffer ? -1 : 1;
    if (a.abgabe_am && b.abgabe_am) return a.abgabe_am.localeCompare(b.abgabe_am);
    if (a.abgabe_am) return -1;
    if (b.abgabe_am) return 1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Eignungsnachweise erkennen und mit der Nachweis-Mappe abgleichen
// ---------------------------------------------------------------------------

export type Eignung = { key: string; label: string; re: RegExp; nachweis: string[]; hinweis?: string };

export const EIGNUNG: Eignung[] = [
  { key: 'pq', label: 'Präqualifikation (PQ-VOB / Präqualifikationsverzeichnis)', re: /pr[äa]qualifi|pq-?vob|\bpq\b/i, nachweis: [], hinweis: 'Eintrag im PQ-Verzeichnis ersetzt viele Einzelnachweise.' },
  { key: 'gewerbe', label: 'Gewerbeanmeldung / Handwerksrolle / Handelsregister', re: /gewerbeanmeldung|handwerksrolle|handelsregister|berufsregister/i, nachweis: ['gewerbe'] },
  { key: 'finanzamt', label: 'Unbedenklichkeitsbescheinigung Finanzamt', re: /unbedenklichkeit\w*\s+(des\s+)?finanzamt|steuerliche\s+unbedenklichkeit|bescheinigung\s+in\s+steuersachen/i, nachweis: [], hinweis: 'Beim Finanzamt beantragen (Bescheinigung in Steuersachen).' },
  { key: 'krankenkasse', label: 'Unbedenklichkeitsbescheinigung Krankenkasse', re: /unbedenklichkeit\w*\s+(der\s+)?(kranken|sozialversicherung)|sozialversicherungsbeitr/i, nachweis: ['unbedenklichkeit_kk'] },
  { key: 'bg', label: 'Unbedenklichkeitsbescheinigung Berufsgenossenschaft', re: /berufsgenossenschaft|unfallversicherungstr[äa]ger|\bbg\b/i, nachweis: ['unbedenklichkeit_bg'] },
  { key: 'haftpflicht', label: 'Betriebshaftpflichtversicherung', re: /haftpflicht/i, nachweis: ['betriebshaftpflicht'], hinweis: 'Deckungssummen in der Ausschreibung mit der Police vergleichen.' },
  { key: 'freistellung', label: 'Freistellungsbescheinigung § 48b EStG', re: /48\s?b|freistellungsbescheinigung/i, nachweis: [], hinweis: 'Steht im Compliance-Center.' },
  { key: 'mindestlohn', label: 'Erklärung Mindestlohn / Tariftreue', re: /mindestlohn|tariftreue|mindestentgelt/i, nachweis: ['mindestlohn_erklaerung'] },
  { key: 'referenzen', label: 'Referenzen vergleichbarer Leistungen', re: /referenz/i, nachweis: [], hinweis: 'Meist 3 vergleichbare Aufträge der letzten 3–5 Jahre.' },
  { key: 'umsatz', label: 'Umsatzangaben der letzten Geschäftsjahre', re: /umsatz/i, nachweis: [] },
  { key: 'beschaeftigte', label: 'Zahl der Beschäftigten', re: /besch[äa]ftigte|arbeitskr[äa]fte|mitarbeiterzahl/i, nachweis: [] },
  { key: 'sanktionen', label: 'Eigenerklärung Russland-Sanktionen', re: /russland|sanktion|art\.?\s*5k/i, nachweis: [] },
  { key: 'insolvenz', label: 'Eigenerklärung keine Insolvenz / Ausschlussgründe', re: /insolvenz|ausschlussgr[üu]nde|§\s*12[34]\s*gwb|eigenerkl[äa]rung/i, nachweis: [] },
  { key: 'zertifikat', label: 'Zertifikat / Fachbetrieb (z. B. ISO, WHG, SCC)', re: /iso\s?900|iso\s?14001|zertifi|fachbetrieb|\bscc\b|\bwhg\b/i, nachweis: [] },
];

export function erkenneEignung(text: string): string[] {
  const t = String(text ?? '');
  return EIGNUNG.filter((e) => e.re.test(t)).map((e) => e.key);
}

export type AbgleichZeile = { key: string; label: string; stand: 'ok' | 'bald' | 'fehlt' | 'abgelaufen' | 'selbst'; text: string };

/** Geforderte Nachweise gegen die Nachweis-Mappe (Paket PE) halten. */
export function abgleich(keys: string[], nachweise: NachweisZeile[], heute: string, abgabe?: string | null): AbgleichZeile[] {
  const stichtag = leseDatum(abgabe) && (leseDatum(abgabe) as string) > heute ? (leseDatum(abgabe) as string) : heute;
  return keys.map((k) => {
    const e = EIGNUNG.find((x) => x.key === k);
    if (!e) return null;
    if (!e.nachweis.length) return { key: k, label: e.label, stand: 'selbst' as const, text: e.hinweis ?? 'Bitte selbst bereitlegen.' };
    const passende = nachweise.filter((n) => e.nachweis.includes(String(n.art ?? '')));
    if (!passende.length) return { key: k, label: e.label, stand: 'fehlt' as const, text: 'Nicht in der Nachweis-Mappe — bitte anlegen und Dokument bereitlegen.' };
    // Der beste vorhandene Eintrag zählt; gültig sein muss er am ABGABETAG.
    // Gemessen am Ablauf (faellig), nicht an der Kündigungsfrist einer Police.
    const rang = { ok: 3, bald: 2, abgelaufen: 1, fehlt: 0 } as const;
    let best: AbgleichZeile | null = null;
    for (const n of passende) {
      const b = bewerte(n, heute);
      let z: AbgleichZeile;
      if (b.status === 'anlass') z = { key: k, label: e.label, stand: 'ok', text: b.text };
      else if (!b.faellig) z = { key: k, label: e.label, stand: 'fehlt', text: 'In der Mappe, aber ohne Datum — bitte Gültigkeit eintragen.' };
      else if (b.faellig < heute) z = { key: k, label: e.label, stand: 'abgelaufen', text: `Abgelaufen am ${datumDe(b.faellig)} — bitte neu anfordern.` };
      else if (b.faellig < stichtag) z = { key: k, label: e.label, stand: 'bald', text: `Gültig nur bis ${datumDe(b.faellig)} — läuft vor der Abgabe ab.` };
      else z = { key: k, label: e.label, stand: 'ok', text: `Gültig bis ${datumDe(b.faellig)}.` };
      if (!best || rang[z.stand as keyof typeof rang] > rang[best.stand as keyof typeof rang]) best = z;
    }
    return best;
  }).filter((x): x is AbgleichZeile => !!x);
}

// ---------------------------------------------------------------------------
// KI: Ausschreibungstext auswerten
// ---------------------------------------------------------------------------

export const MAX_TEXT = 40_000;

export function systemPrompt(): string {
  return `Sie werten den Text einer öffentlichen Ausschreibung (VOB/A, UVgO, VgV) für einen Handwerks- oder Dienstleistungsbetrieb aus.
Regeln:
- Nur übernehmen, was im Text steht. Nichts erfinden, nichts schätzen.
- Fristen NUR mit dem Wortlaut aus dem Text ("..._text") und als Datum JJJJ-MM-TT. Steht keine Frist da: null.
- Eignungsnachweise vollständig auflisten, wie im Text gefordert.
- Kurze, sachliche Sätze.
Antworten Sie NUR mit JSON, ohne Markdown:
{"titel":"...","auftraggeber":"...","ort":"...","vergabeart":"z. B. Öffentliche Ausschreibung","leistung":"2-4 Sätze","lose":["..."],"abgabe_am":"JJJJ-MM-TT oder null","abgabe_text":"Wortlaut oder null","fragen_bis":"JJJJ-MM-TT oder null","fragen_text":"Wortlaut oder null","ausfuehrung":"Zeitraum laut Text oder null","eignung":["..."],"zuschlag":["Kriterium (Gewichtung)"],"besonderheiten":["z. B. Ortsbesichtigung Pflicht, Sicherheitsleistung, Vertragsstrafe"],"abgabe_weg":"z. B. elektronisch über Vergabeplattform"}`;
}

export type Analyse = {
  titel: string; auftraggeber: string; ort: string; vergabeart: string; leistung: string; lose: string[];
  abgabe_am: string | null; abgabe_text: string | null; fragen_bis: string | null; fragen_text: string | null;
  ausfuehrung: string | null; eignung: string[]; zuschlag: string[]; besonderheiten: string[]; abgabe_weg: string;
  eignung_keys: string[]; hinweise: string[];
};

function t(v: unknown, max = 600): string { return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function l(v: unknown, max = 25): string[] { return (Array.isArray(v) ? v : []).map((x) => t(x, 300)).filter(Boolean).slice(0, max); }

export function leseAnalyse(roh: unknown, quelle: string, heute: string): Analyse {
  const o = leseKiJson(roh) ?? {};
  const hinweise: string[] = [];
  const frist = (d: unknown, w: unknown, name: string): [string | null, string | null] => {
    let datum = leseDatum(d);
    const wort = t(w, 160) || null;
    if (datum && !wort) { datum = null; hinweise.push(`${name}: kein Wortlaut im Text — bitte selbst nachsehen.`); }
    if (datum && datum < plusTage(heute, -400)) { datum = null; hinweise.push(`${name}: Datum liegt lange zurück — bitte prüfen.`); }
    return [datum, wort];
  };
  const [abgabe_am, abgabe_text] = frist(o.abgabe_am, o.abgabe_text, 'Abgabefrist');
  const [fragen_bis, fragen_text] = frist(o.fragen_bis, o.fragen_text, 'Frist für Bieterfragen');
  if (!abgabe_am) hinweise.push('Keine eindeutige Abgabefrist gefunden — unbedingt in den Unterlagen nachsehen.');
  const eignung = l(o.eignung, 30);
  // Deterministische Erkennung zusätzlich — über Text UND KI-Liste.
  const eignung_keys = [...new Set([...erkenneEignung(quelle), ...erkenneEignung(eignung.join('\n'))])];
  return {
    titel: t(o.titel, 200) || 'Ausschreibung', auftraggeber: t(o.auftraggeber, 200), ort: t(o.ort, 120),
    vergabeart: t(o.vergabeart, 120), leistung: t(o.leistung, 1500), lose: l(o.lose, 20),
    abgabe_am, abgabe_text, fragen_bis, fragen_text, ausfuehrung: t(o.ausfuehrung, 200) || null,
    eignung, zuschlag: l(o.zuschlag, 15), besonderheiten: l(o.besonderheiten, 15), abgabe_weg: t(o.abgabe_weg, 200),
    eignung_keys, hinweise,
  };
}
