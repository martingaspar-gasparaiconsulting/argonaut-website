// ============================================================================
// ARGONAUT OS · lib/kundenVorgaenge.ts — Paket PS3 · Vorgänge mit Kunden
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
// Fünf Bereiche, je Branche einer:
//   A  Retouren & Widerruf (Shop)          §§ 355, 356, 357, 357a, 438, 439, 477 BGB
//   B  Schadenabwicklung mit Versicherern (KFZ-Werkstatt)
//   C  SLA-Bericht (IT & MSP)              aus tickets + ticket_verlauf + it_sla
//   D  Nachkauf-Erinnerung (Beauty)        § 7 Abs. 3 UWG
//   E  Impf-Erinnerung an Halter (Tier)
//
// Datum IMMER als 'YYYY-MM-DD'-Text (zeitzonensicher), Zeitpunkte als ISO.
// Beträge über lib/zahlen (nie still 0). Gesetzliche Fristen stehen im Code mit
// Fundstelle; Richtwerte (keine Gesetzesfrist) sind als solche beschriftet.
// Rechtlich stand 25.09.2026 recherchiert — Anwalt-Checkliste R23.
// ============================================================================

import { leseZahl } from './zahlen';
import { istFeiertag } from './feiertage';

// ---------------------------------------------------------------------------
// Gemeinsame Helfer
// ---------------------------------------------------------------------------
function zwei(n: number): string { return String(n).padStart(2, '0'); }

export function istIsoDatum(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(x)) return false;
  const [j, m, t] = x.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

export function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + Math.round(tage)));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}

/** Monate addieren ohne Überlauf (31.01. + 1 Monat = 28./29.02.). */
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

export function datumDe(iso: string | null | undefined): string {
  if (!iso || !istIsoDatum(iso)) return '—';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}

function wochentag(iso: string): number {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t)).getUTCDay(); // 0 = So
}

/**
 * § 193 BGB: Fällt das Fristende auf Samstag, Sonntag oder einen am Leistungsort
 * gesetzlichen Feiertag, endet die Frist am nächsten Werktag.
 */
export function fristEndeWerktag(iso: string, bundesland?: string | null): string {
  let d = iso.slice(0, 10);
  for (let i = 0; i < 10; i++) {
    const w = wochentag(d);
    if (w !== 0 && w !== 6 && !istFeiertag(d, bundesland ?? null)) return d;
    d = plusTage(d, 1);
  }
  return d;
}

export function cent(n: number): number { return Math.round(n * 100) / 100; }

function betrag(x: unknown): number | null {
  const n = leseZahl(x);
  return n == null ? null : cent(n);
}

/** Nächste laufende Nummer PREFIX-JJJJ-NNN; Lücken werden nicht aufgefüllt. */
export function naechsteNummer(vorhanden: (string | null | undefined)[], prefix: string, jahr: number): string {
  const muster = new RegExp(`^${prefix}-${jahr}-(\\d+)$`);
  let max = 0;
  for (const v of vorhanden) {
    const m = typeof v === 'string' ? v.match(muster) : null;
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${jahr}-${String(max + 1).padStart(3, '0')}`;
}

/** Offene [Platzhalter] in einem Text. */
export function offenePlatzhalter(text: string): string[] {
  return Array.from(new Set((text.match(/\[[^\]\n]{1,60}\]/g) ?? [])));
}

export function normName(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\b(gmbh|mbh|ag|kg|ug|ohg|gbr|e\.?\s?k\.?|e\.?\s?v\.?|co\.?|haftungsbeschraenkt|&)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ===========================================================================
// A · RETOUREN & WIDERRUF (Shop)
// ===========================================================================
export const RETOUREN_ARTEN = [
  { key: 'widerruf', label: 'Widerruf (Verbraucher, 14 Tage)', hinweis: 'Gesetzliches Widerrufsrecht bei Fernabsatz, §§ 312g, 355 BGB. Gilt nur für Verbraucher.' },
  { key: 'reklamation', label: 'Reklamation (Mangel)', hinweis: 'Gewährleistung: Nacherfüllung nach § 439 BGB, Kosten trägt der Verkäufer. Frist 2 Jahre ab Ablieferung (§ 438 BGB).' },
  { key: 'kulanz', label: 'Kulanz-Rücknahme', hinweis: 'Freiwillig — Bedingungen legen Sie selbst fest.' },
] as const;
export type RetourenArt = (typeof RETOUREN_ARTEN)[number]['key'];

export const RETOUREN_STATUS = [
  { key: 'gemeldet', label: 'Gemeldet' },
  { key: 'unterwegs', label: 'Ware unterwegs' },
  { key: 'eingegangen', label: 'Ware eingegangen' },
  { key: 'geprueft', label: 'Geprüft' },
  { key: 'erstattet', label: 'Erstattet' },
  { key: 'ersetzt', label: 'Ersatz geliefert / repariert' },
  { key: 'abgelehnt', label: 'Abgelehnt' },
] as const;
export type RetourenStatus = (typeof RETOUREN_STATUS)[number]['key'];
export const RETOUREN_ERLEDIGT: RetourenStatus[] = ['erstattet', 'ersetzt', 'abgelehnt'];

export const ZUSTAENDE = [
  { key: 'neuwertig', label: 'Neuwertig — wieder verkaufbar', lager: true },
  { key: 'geoeffnet', label: 'Geöffnet / ausprobiert — verkaufbar', lager: true },
  { key: 'gebrauchsspuren', label: 'Gebrauchsspuren — Wertersatz prüfen', lager: false },
  { key: 'beschaedigt', label: 'Beschädigt / defekt', lager: false },
  { key: 'unvollstaendig', label: 'Unvollständig', lager: false },
] as const;
export type Zustand = (typeof ZUSTAENDE)[number]['key'];

export type RetourePosition = { bezeichnung: string; menge: number; einzelpreis: number; artikelnummer?: string | null };

/**
 * Ende der Widerrufsfrist (§ 355 Abs. 2, § 356 Abs. 2 Nr. 1 a, Abs. 3 BGB):
 * 14 Tage ab Erhalt der Ware; ohne ordnungsgemäße Belehrung spätestens
 * 12 Monate und 14 Tage nach Erhalt. Fristende nach § 193 BGB auf den
 * nächsten Werktag verschoben. Ohne Erhalt-Datum: null (nicht raten).
 */
export function widerrufsFristEnde(erhaltenAm: string | null | undefined, belehrtOk = true, bundesland?: string | null): string | null {
  if (!istIsoDatum(erhaltenAm)) return null;
  const roh = belehrtOk ? plusTage(erhaltenAm, 14) : plusTage(plusMonate(erhaltenAm, 12), 14);
  return fristEndeWerktag(roh, bundesland);
}

export type WiderrufPruefung = { stufe: 'ok' | 'spaet' | 'offen'; text: string };

/** War der Widerruf rechtzeitig? Rechtzeitige Absendung genügt (§ 355 Abs. 1 S. 5 BGB). */
export function pruefeWiderruf(r: { erhalten_am?: string | null; widerruf_am?: string | null; belehrung_ok?: boolean | null }, bundesland?: string | null): WiderrufPruefung {
  const ende = widerrufsFristEnde(r.erhalten_am ?? null, r.belehrung_ok !== false, bundesland);
  if (!ende) return { stufe: 'offen', text: 'Wann hat der Kunde die Ware erhalten? Ohne dieses Datum lässt sich die Frist nicht prüfen.' };
  if (!istIsoDatum(r.widerruf_am)) return { stufe: 'offen', text: `Widerrufsdatum fehlt. Frist endet am ${datumDe(ende)}.` };
  if (r.widerruf_am.slice(0, 10) <= ende) return { stufe: 'ok', text: `Rechtzeitig: Widerruf am ${datumDe(r.widerruf_am)}, Frist bis ${datumDe(ende)}.` };
  return { stufe: 'spaet', text: `Nach Fristende (${datumDe(ende)}) — kein gesetzliches Widerrufsrecht mehr. Kulanz ist möglich.${r.belehrung_ok === false ? '' : ' Prüfen Sie, ob Ihre Widerrufsbelehrung korrekt war — sonst gilt die Frist von 12 Monaten und 14 Tagen.'}` };
}

/**
 * Erstattungsbetrag beim Widerruf (§ 357 Abs. 1, 2; § 357a Abs. 1 BGB):
 *  + Warenwert der zurückgegebenen Positionen (brutto)
 *  + Hinsendekosten — nur bei Widerruf der GANZEN Bestellung, und nur die
 *    Standard-Lieferkosten (Mehrkosten einer teureren Lieferart nicht, § 357 Abs. 2)
 *  − Wertersatz (§ 357a Abs. 1) — nur wenn richtig belehrt und ein Betrag eingetragen ist
 * Fehlt ein Preis: null (nie eine Teilsumme ausgeben).
 */
export function erstattungsBetrag(e: {
  positionen: { menge: unknown; einzelpreis: unknown }[];
  vollstaendig: boolean;
  hinversand?: unknown;
  mehrkostenLieferart?: unknown;
  wertersatz?: unknown;
  belehrungOk?: boolean;
}): { betrag: number | null; teile: { text: string; betrag: number }[]; hinweise: string[] } {
  const teile: { text: string; betrag: number }[] = [];
  const hinweise: string[] = [];
  let summe = 0;
  for (const p of e.positionen) {
    const menge = leseZahl(p.menge);
    const preis = leseZahl(p.einzelpreis);
    if (menge == null || preis == null || menge <= 0) return { betrag: null, teile: [], hinweise: ['Bei mindestens einer Position fehlt Menge oder Preis.'] };
    summe += menge * preis;
  }
  if (e.positionen.length === 0) return { betrag: null, teile: [], hinweise: ['Keine Position ausgewählt.'] };
  teile.push({ text: 'Warenwert', betrag: cent(summe) });
  const hin = betrag(e.hinversand) ?? 0;
  const mehr = betrag(e.mehrkostenLieferart) ?? 0;
  if (e.vollstaendig && hin > 0) {
    const std = cent(Math.max(0, hin - mehr));
    teile.push({ text: mehr > 0 ? 'Hinsendekosten (Standardversand)' : 'Hinsendekosten', betrag: std });
    summe += std;
    if (mehr > 0) hinweise.push('Mehrkosten der gewählten Express-/Sonderlieferung werden nicht erstattet (§ 357 Abs. 2 BGB).');
  } else if (!e.vollstaendig && hin > 0) {
    hinweise.push('Teil-Widerruf: Hinsendekosten werden nach herrschender Meinung nicht erstattet — sie wären auch für die behaltene Ware angefallen.');
  }
  const wert = betrag(e.wertersatz) ?? 0;
  if (wert > 0) {
    if (e.belehrungOk === false) {
      hinweise.push('Wertersatz kann nur verlangt werden, wenn der Kunde richtig über das Widerrufsrecht belehrt wurde (§ 357a Abs. 1 Nr. 2 BGB) — hier nicht abgezogen.');
    } else {
      const abzug = cent(Math.min(wert, summe));
      teile.push({ text: 'Wertersatz (Prüfung über das Nötige hinaus)', betrag: -abzug });
      summe -= abzug;
      hinweise.push('Wertersatz nur für Wertverlust durch einen Umgang, der zur Prüfung von Beschaffenheit, Eigenschaften und Funktionsweise nicht nötig war. Begründung dokumentieren.');
    }
  }
  return { betrag: cent(Math.max(0, summe)), teile, hinweise };
}

export type ErstattungsStand = { stufe: 'erledigt' | 'rot' | 'gelb' | 'gruen' | 'offen'; text: string; bis: string | null };

/**
 * Erstattungsfrist (§ 357 Abs. 1 BGB, § 355 Abs. 3 S. 2): spätestens 14 Tage ab
 * Zugang des Widerrufs. Zurückbehaltungsrecht (§ 357 Abs. 4): solange die Ware
 * nicht zurück ist oder kein Nachweis der Rücksendung vorliegt — außer der
 * Händler hat Abholung angeboten.
 */
export function erstattungsStand(r: {
  art: RetourenArt; status: RetourenStatus; widerruf_am?: string | null; ware_zurueck_am?: string | null;
  rueckversand_nachweis?: boolean | null; abholung_angeboten?: boolean | null; erstattet_am?: string | null;
}, heute: string): ErstattungsStand {
  if (r.erstattet_am || RETOUREN_ERLEDIGT.includes(r.status)) return { stufe: 'erledigt', text: r.erstattet_am ? `Erstattet am ${datumDe(r.erstattet_am)}` : 'Erledigt', bis: null };
  if (r.art !== 'widerruf') return { stufe: 'offen', text: r.art === 'reklamation' ? 'Nacherfüllung: angemessene Frist — zügig reparieren oder ersetzen.' : 'Kulanz: keine gesetzliche Frist.', bis: null };
  if (!istIsoDatum(r.widerruf_am)) return { stufe: 'offen', text: 'Widerrufsdatum fehlt — Erstattungsfrist unbekannt.', bis: null };
  const bis = plusTage(r.widerruf_am, 14);
  const rest = tageZwischen(heute, bis);
  const wareDa = istIsoDatum(r.ware_zurueck_am) || !!r.rueckversand_nachweis;
  if (!wareDa && !r.abholung_angeboten) {
    return { stufe: 'gelb', text: `Sie dürfen die Erstattung zurückhalten, bis die Ware da ist oder der Kunde die Rücksendung nachweist (§ 357 Abs. 4 BGB). Frist sonst bis ${datumDe(bis)}.`, bis };
  }
  if (rest < 0) return { stufe: 'rot', text: `Erstattung seit ${-rest} Tag(en) überfällig (Frist ${datumDe(bis)}, § 357 Abs. 1 BGB).`, bis };
  if (rest <= 3) return { stufe: 'gelb', text: `Erstattung spätestens am ${datumDe(bis)} — noch ${rest} Tag(e).`, bis };
  return { stufe: 'gruen', text: `Erstattung bis ${datumDe(bis)} (noch ${rest} Tage).`, bis };
}

/** Gewährleistung beim Verbrauchsgüterkauf: 2 Jahre (§ 438), Vermutung 1 Jahr (§ 477). */
export function gewaehrleistung(abgeliefertAm: string | null | undefined, meldungAm: string | null | undefined): { text: string; stufe: 'ok' | 'abgelaufen' | 'offen' } {
  if (!istIsoDatum(abgeliefertAm)) return { stufe: 'offen', text: 'Lieferdatum fehlt — Gewährleistung nicht prüfbar.' };
  const stichtag = istIsoDatum(meldungAm) ? meldungAm.slice(0, 10) : null;
  if (!stichtag) return { stufe: 'offen', text: 'Datum der Mängelmeldung fehlt.' };
  const ende = plusMonate(abgeliefertAm, 24);
  if (stichtag > ende) return { stufe: 'abgelaufen', text: `Gewährleistung am ${datumDe(ende)} abgelaufen (§ 438 BGB, 2 Jahre bei neuen Sachen; bei gebrauchten ggf. vertraglich 1 Jahr).` };
  const vermutung = plusMonate(abgeliefertAm, 12);
  return stichtag <= vermutung
    ? { stufe: 'ok', text: `Innerhalb eines Jahres: Es wird vermutet, dass der Mangel schon bei Lieferung vorlag (§ 477 BGB) — Sie müssten das Gegenteil beweisen.` }
    : { stufe: 'ok', text: `Gewährleistung läuft bis ${datumDe(ende)}. Nach dem ersten Jahr muss der Kunde beweisen, dass der Mangel schon bei Lieferung da war.` };
}

export type RetoureLite = { art: RetourenArt; status: RetourenStatus; widerruf_am?: string | null; ware_zurueck_am?: string | null; rueckversand_nachweis?: boolean | null; abholung_angeboten?: boolean | null; erstattet_am?: string | null; erstattung_betrag?: number | null; grund?: string | null };

export function retourenZahlen(liste: RetoureLite[], heute: string, bestellungen = 0): { offen: number; ueberfaellig: number; erstattet: number; summeErstattet: number; quote: number | null; gruende: { grund: string; anzahl: number }[] } {
  let offen = 0, ueberfaellig = 0, erstattet = 0, summe = 0;
  const g = new Map<string, number>();
  for (const r of liste) {
    const s = erstattungsStand(r, heute);
    if (s.stufe === 'erledigt') { if (r.erstattet_am) { erstattet++; summe += Number(r.erstattung_betrag) || 0; } }
    else offen++;
    if (s.stufe === 'rot') ueberfaellig++;
    const grund = (r.grund ?? '').trim() || 'ohne Angabe';
    g.set(grund, (g.get(grund) ?? 0) + 1);
  }
  return {
    offen, ueberfaellig, erstattet, summeErstattet: cent(summe),
    quote: bestellungen > 0 ? Math.round((liste.length / bestellungen) * 1000) / 10 : null,
    gruende: Array.from(g, ([grund, anzahl]) => ({ grund, anzahl })).sort((a, b) => b.anzahl - a.anzahl || a.grund.localeCompare(b.grund)),
  };
}

export const RETOUREN_GRUENDE = ['Gefällt nicht', 'Passt nicht / falsche Größe', 'Falscher Artikel geliefert', 'Defekt / beschädigt', 'Zu spät geliefert', 'Anders als beschrieben', 'Sonstiges'];

/** Mitteilung an den Kunden — fester Text, Sie-Form, Platzhalter in [ ]. */
export function retourenText(art: 'eingang' | 'erstattung' | 'ablehnung_frist', o: { name?: string | null; nummer?: string | null; bestellung?: string | null; betrag?: number | null; firma?: string | null; weg?: string | null }): string {
  const anrede = o.name?.trim() ? `Guten Tag ${o.name.trim()},` : 'Guten Tag,';
  const best = o.bestellung?.trim() || '[Bestellnummer]';
  const gruss = `\n\nMit freundlichen Grüßen\n${o.firma?.trim() || '[Ihr Firmenname]'}`;
  if (art === 'eingang') return `${anrede}\n\nwir haben Ihren Widerruf zur Bestellung ${best} erhalten (Vorgang ${o.nummer || '[Vorgangsnummer]'}). Bitte senden Sie die Ware an [Rücksendeadresse]. Sobald die Ware bei uns ist oder Sie uns die Rücksendung nachweisen, erstatten wir den Betrag über das Zahlungsmittel, mit dem Sie bezahlt haben.${gruss}`;
  if (art === 'erstattung') {
    const b = o.betrag != null ? o.betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) : '[Betrag]';
    return `${anrede}\n\nIhre Rücksendung zur Bestellung ${best} ist bei uns eingegangen. Wir haben ${b} an Sie zurückgezahlt${o.weg?.trim() ? ` (${o.weg.trim()})` : ' — über dasselbe Zahlungsmittel, mit dem Sie bezahlt haben'}. Je nach Bank kann die Gutschrift einige Tage dauern.${gruss}`;
  }
  return `${anrede}\n\nvielen Dank für Ihre Nachricht zur Bestellung ${best}. Die Widerrufsfrist war zum Zeitpunkt Ihres Widerrufs leider bereits abgelaufen (Ware erhalten am [Datum], Frist bis [Datum]). [Bitte hier Ihr Kulanzangebot oder Ihre Entscheidung eintragen.]${gruss}`;
}

// ===========================================================================
// B · SCHADENABWICKLUNG MIT VERSICHERERN (KFZ)
// ===========================================================================
export const SCHADEN_ARTEN = [
  { key: 'haftpflicht', label: 'Fremdschaden — gegnerische Haftpflicht', sb: false, hinweis: 'Der Geschädigte darf Werkstatt und Gutachter frei wählen. Mit Sicherungsabtretung rechnen Sie direkt mit dem Versicherer ab.' },
  { key: 'vollkasko', label: 'Vollkasko des Kunden', sb: true, hinweis: 'Selbstbeteiligung zahlt der Kunde. Werkstattbindung im Vertrag des Kunden prüfen.' },
  { key: 'teilkasko', label: 'Teilkasko (Glas, Wild, Hagel, Diebstahl …)', sb: true, hinweis: 'Selbstbeteiligung zahlt der Kunde. Bei Glasschaden oft Direktabrechnung mit dem Versicherer möglich.' },
  { key: 'selbstzahler', label: 'Selbstzahler / ohne Versicherung', sb: false, hinweis: 'Normaler Werkstattauftrag.' },
  { key: 'unklar', label: 'Noch unklar (Haftung strittig)', sb: false, hinweis: 'Solange die Haftung strittig ist, keine Direktabrechnung zusagen — der Kunde bleibt Ihr Auftraggeber. Rechtsfragen gehören zum Anwalt des Kunden.' },
] as const;
export type SchadenArt = (typeof SCHADEN_ARTEN)[number]['key'];

export const SCHADEN_STATUS = [
  { key: 'aufgenommen', label: 'Aufgenommen' },
  { key: 'gemeldet', label: 'Beim Versicherer gemeldet' },
  { key: 'gutachten', label: 'Gutachten / Kostenvoranschlag' },
  { key: 'freigegeben', label: 'Reparatur freigegeben' },
  { key: 'reparatur', label: 'In Reparatur' },
  { key: 'abgerechnet', label: 'Abgerechnet' },
  { key: 'bezahlt', label: 'Vollständig bezahlt' },
  { key: 'gekuerzt', label: 'Gekürzt — Rest offen' },
  { key: 'abgeschlossen', label: 'Abgeschlossen' },
] as const;
export type SchadenStatus = (typeof SCHADEN_STATUS)[number]['key'];

export const UNTERLAGEN = [
  { key: 'auftrag', label: 'Reparaturauftrag vom Kunden unterschrieben', arten: ['haftpflicht', 'vollkasko', 'teilkasko', 'selbstzahler', 'unklar'] },
  { key: 'schadennummer', label: 'Schadennummer des Versicherers', arten: ['haftpflicht', 'vollkasko', 'teilkasko'] },
  { key: 'abtretung', label: 'Sicherungsabtretung / Zahlungsanweisung', arten: ['haftpflicht', 'vollkasko', 'teilkasko'] },
  { key: 'fotos', label: 'Schadenfotos', arten: ['haftpflicht', 'vollkasko', 'teilkasko', 'unklar'] },
  { key: 'gutachten', label: 'Gutachten oder Kostenvoranschlag', arten: ['haftpflicht', 'vollkasko', 'teilkasko', 'unklar'] },
  { key: 'freigabe', label: 'Reparaturfreigabe des Versicherers (schriftlich)', arten: ['vollkasko', 'teilkasko'] },
  { key: 'unfallbericht', label: 'Unfallbericht / Polizeiliches Aktenzeichen (falls vorhanden)', arten: ['haftpflicht', 'unklar'] },
  { key: 'rechnung', label: 'Reparaturrechnung', arten: ['haftpflicht', 'vollkasko', 'teilkasko', 'selbstzahler', 'unklar'] },
  { key: 'ersatzwagen', label: 'Nachweis Ersatzwagen / Nutzungsausfall-Tage', arten: ['haftpflicht'] },
] as const;
export type UnterlageKey = (typeof UNTERLAGEN)[number]['key'];

export function unterlagenFuer(art: SchadenArt): { key: UnterlageKey; label: string }[] {
  return UNTERLAGEN.filter((u) => (u.arten as readonly string[]).includes(art)).map((u) => ({ key: u.key, label: u.label }));
}

export function fehlendeUnterlagen(art: SchadenArt, vorhanden: Record<string, boolean> | null | undefined): string[] {
  const v = vorhanden ?? {};
  return unterlagenFuer(art).filter((u) => !v[u.key]).map((u) => u.label);
}

/** Richtwert, keine Gesetzesfrist: Prüffrist des Versicherers nach vollständigen Unterlagen. */
export const PRUEFFRIST_TAGE = 28;
/** Richtwert der Rechtsprechung: bis etwa zu diesem Betrag genügt meist ein Kostenvoranschlag statt Gutachten. */
export const BAGATELLGRENZE = 750;

export type Zahlung = { am: string; betrag: number; von?: string | null; notiz?: string | null };

export type SchadenLite = {
  art: SchadenArt; status: SchadenStatus;
  rechnung_betrag?: number | null; selbstbeteiligung?: number | null;
  zahlungen?: Zahlung[] | null; unterlagen?: Record<string, boolean> | null;
  unterlagen_komplett_am?: string | null; gemeldet_am?: string | null;
  kva_betrag?: number | null; ersatz_von?: string | null; ersatz_bis?: string | null;
  abgeschlossen_am?: string | null;
};

/** Offener Betrag: Rechnung − eingegangene Zahlungen (Versicherer + Kunde). */
export function schadenOffen(s: SchadenLite): { rechnung: number | null; gezahlt: number; offen: number | null; sbKunde: number; offenVersicherer: number | null } {
  const rechnung = s.rechnung_betrag == null ? null : cent(Number(s.rechnung_betrag));
  const gezahlt = cent((s.zahlungen ?? []).reduce((a, z) => a + (Number(z.betrag) || 0), 0));
  const artInfo = SCHADEN_ARTEN.find((a) => a.key === s.art);
  const sb = artInfo?.sb ? cent(Number(s.selbstbeteiligung) || 0) : 0;
  const vomKunde = cent((s.zahlungen ?? []).filter((z) => z.von === 'kunde').reduce((a, z) => a + (Number(z.betrag) || 0), 0));
  const vomVers = cent(gezahlt - vomKunde);
  if (rechnung == null || !Number.isFinite(rechnung)) return { rechnung: null, gezahlt, offen: null, sbKunde: cent(Math.max(0, sb - vomKunde)), offenVersicherer: null };
  return {
    rechnung, gezahlt, offen: cent(rechnung - gezahlt),
    sbKunde: cent(Math.max(0, sb - vomKunde)),
    offenVersicherer: cent(Math.max(0, rechnung - sb - vomVers)),
  };
}

export type SchadenStand = { stufe: 'rot' | 'gelb' | 'gruen' | 'grau'; text: string; nachfassAm: string | null };

export function schadenStand(s: SchadenLite, heute: string): SchadenStand {
  if (s.status === 'abgeschlossen' || s.abgeschlossen_am) return { stufe: 'grau', text: 'Abgeschlossen', nachfassAm: null };
  const o = schadenOffen(s);
  if (s.art !== 'selbstzahler' && s.art !== 'unklar') {
    const fehlt = fehlendeUnterlagen(s.art, s.unterlagen).filter((f) => !/Rechnung|Ersatzwagen|Unfallbericht/.test(f));
    if (fehlt.length && !['abgerechnet', 'bezahlt', 'gekuerzt'].includes(s.status)) {
      return { stufe: 'gelb', text: `Es fehlen noch: ${fehlt.join(', ')}.`, nachfassAm: null };
    }
  }
  if (o.rechnung != null && o.offen != null) {
    if (o.offen <= 0.005) return { stufe: 'gruen', text: 'Rechnung vollständig bezahlt — Vorgang abschließen.', nachfassAm: null };
    const start = s.unterlagen_komplett_am ?? null;
    if (istIsoDatum(start)) {
      const nach = plusTage(start, PRUEFFRIST_TAGE);
      const rest = tageZwischen(heute, nach);
      if (o.gezahlt > 0) return { stufe: 'rot', text: `Teilzahlung erhalten, ${o.offen.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} offen — Kürzung prüfen (Prüfbericht anfordern).`, nachfassAm: heute };
      if (rest < 0) return { stufe: 'rot', text: `Seit ${-rest} Tag(en) über der üblichen Prüffrist von ${PRUEFFRIST_TAGE} Tagen (Richtwert) — nachfassen.`, nachfassAm: heute };
      return { stufe: 'gelb', text: `Warten auf Zahlung — nachfassen ab ${datumDe(nach)} (Richtwert ${PRUEFFRIST_TAGE} Tage nach vollständigen Unterlagen).`, nachfassAm: nach };
    }
    return { stufe: 'gelb', text: 'Tragen Sie ein, wann die Unterlagen vollständig beim Versicherer waren — ab dann läuft die Prüffrist.', nachfassAm: null };
  }
  if (s.kva_betrag != null && Number(s.kva_betrag) > BAGATELLGRENZE && !(s.unterlagen ?? {}).gutachten) {
    return { stufe: 'gelb', text: `Schaden über ca. ${BAGATELLGRENZE} € (Richtwert): Bei Fremdschaden hat der Kunde meist Anspruch auf ein Gutachten.`, nachfassAm: null };
  }
  return { stufe: 'grau', text: 'In Arbeit.', nachfassAm: null };
}

/** Tage mit Ersatzwagen / Nutzungsausfall (Von und Bis zählen mit). */
export function ersatzTage(von: string | null | undefined, bis: string | null | undefined): number | null {
  if (!istIsoDatum(von) || !istIsoDatum(bis)) return null;
  const t = tageZwischen(von, bis) + 1;
  return t > 0 ? t : null;
}

/**
 * G13 (26.09.2026): Status aus den Zahlungen ableiten — bei jeder neuen UND
 * jeder entfernten Zahlung neu.
 *
 * Vorher: Jede Versicherer-Zahlung unter dem Rechnungsbetrag hiess
 * „gekuerzt". Bei einem Kaskoschaden mit 300 EUR Selbstbeteiligung zahlt der
 * Versicherer aber korrekt Rechnung minus SB — der Rest ist Sache des Kunden.
 * Der Fall stand trotzdem als „Gekürzt" da und zaehlte oben mit.
 *
 * Jetzt:
 *   alles bezahlt                                   -> bezahlt
 *   Versicherer hat gezahlt, sein Anteil fehlt noch -> gekuerzt
 *   nur noch SB des Kunden offen / nichts gezahlt   -> war es bezahlt/gekuerzt,
 *                                                      zurück auf abgerechnet,
 *                                                      sonst bleibt der Status
 *   abgeschlossen oder keine Rechnung               -> bleibt
 */
export function schadenStatusNachZahlungen(s: SchadenLite): SchadenStatus {
  if (s.status === 'abgeschlossen') return s.status;
  const o = schadenOffen(s);
  if (o.rechnung == null || o.offen == null) return s.status;
  if (o.offen <= 0.005) return 'bezahlt';
  const vomVers = (s.zahlungen ?? []).filter((z) => z.von !== 'kunde').reduce((a, z) => a + (Number(z.betrag) || 0), 0);
  if (vomVers > 0.005 && (o.offenVersicherer ?? 0) > 0.005) return 'gekuerzt';
  if (s.status === 'bezahlt' || s.status === 'gekuerzt') return 'abgerechnet';
  return s.status;
}

export function schadenZahlen(liste: SchadenLite[], heute: string): { offen: number; nachfassen: number; summeOffen: number; gekuerzt: number } {
  let offen = 0, nachfassen = 0, summe = 0, gekuerzt = 0;
  for (const s of liste) {
    const st = schadenStand(s, heute);
    if (st.stufe === 'grau' && (s.status === 'abgeschlossen' || s.abgeschlossen_am)) continue;
    offen++;
    if (st.stufe === 'rot') nachfassen++;
    if (s.status === 'gekuerzt') gekuerzt++;
    const o = schadenOffen(s);
    if (o.offen != null && o.offen > 0) summe += o.offen;
  }
  return { offen, nachfassen, summeOffen: cent(summe), gekuerzt };
}

/** Feste Schreiben — sachlich, keine rechtliche Argumentation (RDG). */
export function schadenSchreiben(art: 'meldung' | 'erinnerung' | 'pruefbericht' | 'kunde_sb', o: {
  firma?: string | null; versicherer?: string | null; schadennummer?: string | null; kennzeichen?: string | null;
  schadentag?: string | null; kunde?: string | null; betrag?: number | null; rechnungAm?: string | null; sb?: number | null; unterlagen?: string[];
}): string {
  const eur = (n: number | null | undefined) => (n == null ? '[Betrag]' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));
  const kopf = `Schadennummer: ${o.schadennummer?.trim() || '[Schadennummer]'}\nKennzeichen: ${o.kennzeichen?.trim() || '[Kennzeichen]'}\nSchadentag: ${o.schadentag ? datumDe(o.schadentag) : '[Schadentag]'}\nIhr Versicherungsnehmer / Anspruchsteller: ${o.kunde?.trim() || '[Name]'}`;
  const gruss = `\n\nMit freundlichen Grüßen\n${o.firma?.trim() || '[Ihr Firmenname]'}`;
  const an = `An: ${o.versicherer?.trim() || '[Versicherer]'}\n\n`;
  if (art === 'meldung') {
    const liste = (o.unterlagen ?? []).length ? (o.unterlagen ?? []).map((u) => `- ${u}`).join('\n') : '- [Unterlagen]';
    return `${an}${kopf}\n\nSehr geehrte Damen und Herren,\n\nim Auftrag unseres Kunden reparieren wir das oben genannte Fahrzeug. Anbei erhalten Sie folgende Unterlagen:\n${liste}\n\nEine Sicherungsabtretung bzw. Zahlungsanweisung unseres Kunden liegt bei. Bitte teilen Sie uns mit, ob Sie eine Besichtigung wünschen.${gruss}`;
  }
  if (art === 'erinnerung') {
    return `${an}${kopf}\n\nSehr geehrte Damen und Herren,\n\nunsere Rechnung vom ${o.rechnungAm ? datumDe(o.rechnungAm) : '[Rechnungsdatum]'} über ${eur(o.betrag)} ist bislang nicht ausgeglichen. Die Unterlagen liegen Ihnen vollständig vor. Bitte überweisen Sie den offenen Betrag bis zum [Datum] oder teilen Sie uns mit, welche Unterlagen noch fehlen.${gruss}`;
  }
  if (art === 'pruefbericht') {
    return `${an}${kopf}\n\nSehr geehrte Damen und Herren,\n\nvon unserer Rechnung über ${eur(o.betrag)} haben Sie einen Teilbetrag gezahlt. Bitte senden Sie uns den Prüfbericht bzw. die Begründung der Kürzung, damit wir sie mit unserem Kunden besprechen können.${gruss}`;
  }
  return `Guten Tag ${o.kunde?.trim() || '[Name]'},\n\ndie Reparatur Ihres Fahrzeugs ${o.kennzeichen?.trim() || '[Kennzeichen]'} ist abgeschlossen. Laut Ihrem Versicherungsvertrag tragen Sie eine Selbstbeteiligung von ${eur(o.sb)}. Diesen Betrag begleichen Sie bitte bei Abholung oder per Überweisung; den Rest rechnen wir direkt mit Ihrer Versicherung ab.${gruss}`;
}

// ===========================================================================
// C · SLA-BERICHT (IT & MSP)
// ===========================================================================
/** Standard-Lösungsziele je Priorität in Stunden — dieselben Werte wie das Ticket-Cockpit. */
export const SLA_STANDARD_STUNDEN: Record<string, number> = { dringend: 4, hoch: 24, mittel: 72, niedrig: 168 };

export type Servicezeit = { tage: number[]; von: number; bis: number } | 'rund';

const TAGE: Record<string, number> = { so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6 };

/**
 * Liest eine Servicezeit wie „Mo–Fr 8–17", „Mo-Fr 08:00-17:30", „Mo-Sa 7-18",
 * „24/7" oder „rund um die Uhr". Unlesbares -> null (dann Kalenderstunden + Hinweis).
 */
export function leseServicezeit(text: string | null | undefined): Servicezeit | null {
  const t = String(text ?? '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/24\s*\/\s*7|rund um die uhr|24 ?h/.test(t)) return 'rund';
  const m = t.match(/^(mo|di|mi|do|fr|sa|so)\s*-\s*(mo|di|mi|do|fr|sa|so)\.?\s*,?\s*(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?$/);
  if (!m) return null;
  const a = TAGE[m[1]], b = TAGE[m[2]];
  const von = Number(m[3]) + (m[4] ? Number(m[4]) / 60 : 0);
  const bis = Number(m[5]) + (m[6] ? Number(m[6]) / 60 : 0);
  if (!(von >= 0 && bis <= 24 && von < bis)) return null;
  const tage: number[] = [];
  for (let i = a; ; i = (i + 1) % 7) { tage.push(i); if (i === b) break; if (tage.length > 7) return null; }
  return { tage, von, bis };
}

const BERLIN_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Berliner Ortszeit eines Zeitpunkts: Tag und Stunde als Dezimalzahl. */
function berlinTeile(ms: number): { tag: string; std: number } {
  const p = Object.fromEntries(BERLIN_FMT.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { tag: `${p.year}-${p.month}-${p.day}`, std: Number(p.hour) + Number(p.minute) / 60 };
}

/** Abstand Berlin zu UTC in Stunden an diesem Kalendertag (1 im Winter, 2 im Sommer), gemessen um 12 Uhr UTC. */
function berlinVersatz(tag: string): number {
  const [j, m, t] = tag.split('-').map(Number);
  const mittag = Date.UTC(j, m - 1, t, 12);
  const b = berlinTeile(mittag);
  return Math.round(b.std - 12);
}

/**
 * Stunden zwischen zwei Zeitpunkten, gezählt nur in der Servicezeit (Ortszeit
 * Berlin, Sommerzeit berücksichtigt). 'rund' oder null = Kalenderstunden.
 * Gesetzliche Feiertage zählen bei fester Servicezeit NICHT mit.
 * Rechnet tageweise: je Tag das Servicefenster in UTC bilden und mit [von, bis] schneiden.
 */
export function stundenInServicezeit(vonIso: string, bisIso: string, zeit: Servicezeit | null, bundesland?: string | null): number {
  const a = Date.parse(vonIso), b = Date.parse(bisIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  if (!zeit || zeit === 'rund') return Math.round(((b - a) / 3_600_000) * 100) / 100;
  let tag = berlinTeile(a).tag;
  const letzter = berlinTeile(b).tag;
  let summe = 0;
  for (let i = 0; i < 800 && tag <= letzter; i++, tag = plusTage(tag, 1)) {
    if (!zeit.tage.includes(wochentag(tag)) || istFeiertag(tag, bundesland ?? null)) continue;
    const [j, m, t] = tag.split('-').map(Number);
    const versatz = berlinVersatz(tag);
    const fStart = Date.UTC(j, m - 1, t) + (zeit.von - versatz) * 3_600_000;
    const fEnde = Date.UTC(j, m - 1, t) + (zeit.bis - versatz) * 3_600_000;
    const s = Math.max(a, fStart), e = Math.min(b, fEnde);
    if (e > s) summe += (e - s) / 3_600_000;
  }
  return Math.round(summe * 100) / 100;
}

export type TicketLite = { id: string; ticket_nummer?: string | null; betreff?: string | null; status: string; prioritaet: string; kunde_name?: string | null; created_at: string; geloest_am?: string | null };
export type VerlaufLite = { ticket_id: string; typ: string; alt_status?: string | null; neu_status?: string | null; created_at: string };
export type SlaVertrag = { kunde?: string | null; bezeichnung?: string | null; reaktion_std?: number | null; wiederherstell_std?: number | null; servicezeit?: string | null; verfuegbarkeit?: number | null; gueltig_bis?: string | null };

/** Passenden SLA-Vertrag zum Kunden finden (Name ohne Rechtsform, gültig am Tag). */
export function vertragFuer(kunde: string | null | undefined, vertraege: SlaVertrag[], amTag: string): SlaVertrag | null {
  const k = normName(kunde);
  if (!k) return null;
  const passend = vertraege.filter((v) => normName(v.kunde) === k && (!v.gueltig_bis || v.gueltig_bis.slice(0, 10) >= amTag));
  return passend[0] ?? null;
}

/** Erste Reaktion = erster Kommentar oder erster Statuswechsel weg von „offen" (interne Notizen zählen nicht). */
export function ersteReaktion(ticket: TicketLite, verlauf: VerlaufLite[]): string | null {
  const start = Date.parse(ticket.created_at);
  const kandidaten = verlauf
    .filter((v) => v.ticket_id === ticket.id && Date.parse(v.created_at) >= start)
    .filter((v) => v.typ === 'kommentar' || (v.typ === 'statuswechsel' && v.alt_status === 'offen' && v.neu_status !== 'offen'))
    .map((v) => v.created_at)
    .sort((x, y) => Date.parse(x) - Date.parse(y));
  if (kandidaten.length) return kandidaten[0];
  if (ticket.geloest_am && Date.parse(ticket.geloest_am) >= start) return ticket.geloest_am;
  return null;
}

/** Zeiträume, in denen das Ticket auf den Kunden wartete (Status „wartet"). */
export function wartePhasen(ticket: TicketLite, verlauf: VerlaufLite[], bisIso: string): { von: string; bis: string }[] {
  const wechsel = verlauf
    .filter((v) => v.ticket_id === ticket.id && v.typ === 'statuswechsel')
    .sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
  const phasen: { von: string; bis: string }[] = [];
  let seit: string | null = null;
  for (const w of wechsel) {
    if (w.neu_status === 'wartet' && !seit) seit = w.created_at;
    else if (w.neu_status !== 'wartet' && seit) { phasen.push({ von: seit, bis: w.created_at }); seit = null; }
  }
  if (seit && Date.parse(bisIso) > Date.parse(seit)) phasen.push({ von: seit, bis: bisIso });
  return phasen;
}

export type TicketSla = {
  id: string; nummer: string; betreff: string; kunde: string; prio: string;
  reaktionStd: number | null; reaktionZiel: number | null; reaktionOk: boolean | null;
  loesungStd: number | null; loesungZiel: number; loesungOk: boolean | null;
  wartenStd: number; offen: boolean; quelleZiel: 'vertrag' | 'standard';
};

/**
 * SLA je Ticket. Lösungszeit = Eingang bis „gelöst", abzüglich Wartezeit auf den
 * Kunden (optional), gezählt in der Servicezeit. Offene Tickets, die ihr Ziel schon
 * überschritten haben, zählen als verletzt — offene innerhalb der Zeit als „läuft".
 */
export function ticketSla(t: TicketLite, verlauf: VerlaufLite[], vertrag: SlaVertrag | null, jetztIso: string, o: { warteAbziehen?: boolean; bundesland?: string | null } = {}): TicketSla {
  const zeit = leseServicezeit(vertrag?.servicezeit ?? null);
  const ende = t.geloest_am && ['geloest', 'geschlossen'].includes(t.status) ? t.geloest_am : null;
  const bis = ende ?? jetztIso;
  const brutto = stundenInServicezeit(t.created_at, bis, zeit, o.bundesland);
  let warten = 0;
  if (o.warteAbziehen !== false) {
    for (const p of wartePhasen(t, verlauf, bis)) warten += stundenInServicezeit(p.von, p.bis, zeit, o.bundesland);
  }
  warten = Math.round(warten * 100) / 100;
  const netto = Math.max(0, Math.round((brutto - warten) * 100) / 100);
  const vZiel = vertrag?.wiederherstell_std != null && Number(vertrag.wiederherstell_std) > 0 ? Number(vertrag.wiederherstell_std) : null;
  const loesungZiel = vZiel ?? SLA_STANDARD_STUNDEN[t.prioritaet] ?? SLA_STANDARD_STUNDEN.mittel;
  const rZiel = vertrag?.reaktion_std != null && Number(vertrag.reaktion_std) > 0 ? Number(vertrag.reaktion_std) : null;
  const reaktionAm = ersteReaktion(t, verlauf);
  const reaktionStd = reaktionAm ? stundenInServicezeit(t.created_at, reaktionAm, zeit, o.bundesland) : null;
  const reaktionLaeuft = reaktionAm == null ? stundenInServicezeit(t.created_at, jetztIso, zeit, o.bundesland) : null;
  let reaktionOk: boolean | null = null;
  if (rZiel != null) reaktionOk = reaktionStd != null ? reaktionStd <= rZiel : (reaktionLaeuft != null && reaktionLaeuft > rZiel ? false : null);
  let loesungOk: boolean | null;
  if (ende) loesungOk = netto <= loesungZiel;
  else loesungOk = netto > loesungZiel ? false : null;
  return {
    id: t.id, nummer: t.ticket_nummer ?? '', betreff: t.betreff ?? '', kunde: t.kunde_name?.trim() || 'ohne Kunde', prio: t.prioritaet,
    reaktionStd, reaktionZiel: rZiel, reaktionOk,
    loesungStd: ende ? netto : null, loesungZiel, loesungOk,
    wartenStd: warten, offen: !ende, quelleZiel: vZiel != null ? 'vertrag' : 'standard',
  };
}

export type SlaKunde = {
  kunde: string; tickets: number; geloest: number; offen: number;
  loesungOk: number; loesungVerletzt: number; loesungQuote: number | null; mittlereLoesung: number | null;
  reaktionOk: number; reaktionVerletzt: number; reaktionQuote: number | null;
  vertrag: string | null; verfuegbarkeitZiel: number | null; servicezeit: string | null; hinweise: string[];
  verstoesse: TicketSla[];
};

function quote(ok: number, verletzt: number): number | null {
  const n = ok + verletzt;
  return n ? Math.round((ok / n) * 1000) / 10 : null;
}

/** Tickets im Monat (Eingang im Monat JJJJ-MM, Ortszeit Berlin). */
export function ticketsImMonat<T extends { created_at: string }>(tickets: T[], monat: string): T[] {
  return tickets.filter((t) => berlinTeile(Date.parse(t.created_at)).tag.slice(0, 7) === monat);
}

export function slaBericht(tickets: TicketLite[], verlauf: VerlaufLite[], vertraege: SlaVertrag[], monat: string, jetztIso: string, o: { warteAbziehen?: boolean; bundesland?: string | null } = {}): SlaKunde[] {
  const imMonat = ticketsImMonat(tickets, monat);
  const gruppen = new Map<string, TicketLite[]>();
  for (const t of imMonat) {
    const k = t.kunde_name?.trim() || 'ohne Kunde';
    const schl = normName(k) || 'ohne kunde';
    const g = gruppen.get(schl) ?? [];
    g.push(t);
    gruppen.set(schl, g);
  }
  const ergebnis: SlaKunde[] = [];
  for (const g of gruppen.values()) {
    const name = g[0].kunde_name?.trim() || 'ohne Kunde';
    const vertrag = vertragFuer(name, vertraege, `${monat}-01`);
    const zeilen = g.map((t) => ticketSla(t, verlauf, vertrag, jetztIso, o));
    const geloest = zeilen.filter((z) => !z.offen);
    const lOk = zeilen.filter((z) => z.loesungOk === true).length;
    const lV = zeilen.filter((z) => z.loesungOk === false).length;
    const rOk = zeilen.filter((z) => z.reaktionOk === true).length;
    const rV = zeilen.filter((z) => z.reaktionOk === false).length;
    const hinweise: string[] = [];
    if (!vertrag) hinweise.push('Kein SLA-Vertrag hinterlegt — gemessen an den Standardzielen je Priorität.');
    else if (vertrag.servicezeit && !leseServicezeit(vertrag.servicezeit)) hinweise.push(`Servicezeit „${vertrag.servicezeit}" nicht lesbar — gezählt in Kalenderstunden. Schreibweise z. B. „Mo-Fr 8-17".`);
    if (vertrag && vertrag.reaktion_std == null) hinweise.push('Im Vertrag ist keine Reaktionszeit hinterlegt.');
    if (vertrag?.verfuegbarkeit != null) hinweise.push('Die Verfügbarkeit (Uptime) misst ARGONAUT nicht — dafür braucht es ein Monitoring-System.');
    ergebnis.push({
      kunde: name, tickets: zeilen.length, geloest: geloest.length, offen: zeilen.length - geloest.length,
      loesungOk: lOk, loesungVerletzt: lV, loesungQuote: quote(lOk, lV),
      mittlereLoesung: geloest.length ? Math.round((geloest.reduce((a, z) => a + (z.loesungStd ?? 0), 0) / geloest.length) * 10) / 10 : null,
      reaktionOk: rOk, reaktionVerletzt: rV, reaktionQuote: quote(rOk, rV),
      vertrag: vertrag?.bezeichnung ?? null, verfuegbarkeitZiel: vertrag?.verfuegbarkeit ?? null, servicezeit: vertrag?.servicezeit ?? null,
      hinweise, verstoesse: zeilen.filter((z) => z.loesungOk === false || z.reaktionOk === false),
    });
  }
  return ergebnis.sort((a, b) => b.tickets - a.tickets || a.kunde.localeCompare(b.kunde));
}

export function stundenText(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} Min.`;
  if (h < 48) return `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std.`;
  return `${(h / 24).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tage`;
}

export function monatText(monat: string): string {
  const [j, m] = monat.split('-').map(Number);
  const namen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return m >= 1 && m <= 12 ? `${namen[m - 1]} ${j}` : monat;
}

// ===========================================================================
// D · NACHKAUF-ERINNERUNG (Beauty)
// ===========================================================================
export const NACHKAUF_VORLAUF_TAGE = 7;

export const REICHWEITE_VORSCHLAEGE = [
  { produkt: 'Gesichtscreme 50 ml', tage: 60 },
  { produkt: 'Serum 30 ml', tage: 45 },
  { produkt: 'Reinigung 200 ml', tage: 90 },
  { produkt: 'Shampoo 250 ml', tage: 60 },
  { produkt: 'Haarkur / Maske 200 ml', tage: 90 },
  { produkt: 'Nagelöl 10 ml', tage: 60 },
  { produkt: 'Wimpernserum', tage: 90 },
];

export type NachkaufVerkauf = {
  id: string; kunde_id: string; produkt: string; produkt_id?: string | null; menge?: number | null; reichweite_tage?: number | null;
  verkauft_am: string; email?: string | null; hinweis_widerspruch?: boolean | null; einwilligung_werbung?: boolean | null;
  widerspruch_am?: string | null; erinnert_am?: string | null;
};

/** Wann ist das Produkt voraussichtlich aufgebraucht? Reichweite × Menge. */
export function aufgebrauchtAm(v: { verkauft_am: string; reichweite_tage?: number | null; menge?: number | null }): string | null {
  const r = Number(v.reichweite_tage);
  if (!istIsoDatum(v.verkauft_am) || !(r > 0)) return null;
  const menge = Number(v.menge) > 0 ? Number(v.menge) : 1;
  return plusTage(v.verkauft_am, Math.round(r * menge));
}

/**
 * Darf per E-Mail an den Nachkauf erinnert werden?
 *  1. ausdrückliche Einwilligung in Werbung per E-Mail, oder
 *  2. § 7 Abs. 3 UWG (Bestandskunde): E-Mail beim Verkauf erhalten, Werbung für
 *     eigene ähnliche Waren (Nachkauf desselben Produkts), kein Widerspruch,
 *     bei Erhebung UND in jeder Mail auf das Widerspruchsrecht hingewiesen.
 * Ein Widerspruch sticht alles.
 */
export function darfNachkaufWerben(v: Pick<NachkaufVerkauf, 'email' | 'hinweis_widerspruch' | 'einwilligung_werbung' | 'widerspruch_am'>, widersprochen = false): { ok: boolean; grund: string } {
  if (widersprochen || istIsoDatum(v.widerspruch_am)) return { ok: false, grund: 'Die Kundin hat Werbung widersprochen.' };
  if (!v.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return { ok: false, grund: 'Keine gültige E-Mail-Adresse.' };
  if (v.einwilligung_werbung) return { ok: true, grund: 'Einwilligung in Werbung per E-Mail liegt vor.' };
  if (v.hinweis_widerspruch) return { ok: true, grund: 'Bestandskunde nach § 7 Abs. 3 UWG (Hinweis auf Widerspruchsrecht beim Kauf gegeben).' };
  return { ok: false, grund: 'Weder Einwilligung noch Hinweis auf das Widerspruchsrecht beim Kauf dokumentiert (§ 7 Abs. 3 Nr. 4 UWG).' };
}

export type NachkaufZeile = { verkauf: NachkaufVerkauf; aufgebraucht: string; erinnernAb: string; faellig: boolean; darf: { ok: boolean; grund: string } };

/**
 * Nachkauf-Liste: je Kundin und Produkt nur der NEUESTE Kauf zählt (wer schon
 * nachgekauft hat, bekommt keine Erinnerung für den alten Kauf). Bereits
 * erinnerte Käufe fallen raus. Sortiert nach Fälligkeit.
 */
export function nachkaufListe(verkaeufe: NachkaufVerkauf[], heute: string, widerspruchKunden: Set<string> = new Set(), vorlauf = NACHKAUF_VORLAUF_TAGE): NachkaufZeile[] {
  const neueste = new Map<string, NachkaufVerkauf>();
  for (const v of verkaeufe) {
    const schl = `${v.kunde_id}|${v.produkt_id || normName(v.produkt)}`;
    const alt = neueste.get(schl);
    if (!alt || v.verkauft_am > alt.verkauft_am) neueste.set(schl, v);
  }
  const zeilen: NachkaufZeile[] = [];
  for (const v of neueste.values()) {
    if (v.erinnert_am) continue;
    const auf = aufgebrauchtAm(v);
    if (!auf) continue;
    const ab = plusTage(auf, -vorlauf);
    zeilen.push({ verkauf: v, aufgebraucht: auf, erinnernAb: ab, faellig: ab <= heute, darf: darfNachkaufWerben(v, widerspruchKunden.has(v.kunde_id)) });
  }
  return zeilen.sort((a, b) => a.erinnernAb.localeCompare(b.erinnernAb) || a.verkauf.produkt.localeCompare(b.verkauf.produkt));
}

export const WIDERSPRUCH_HINWEIS = 'Sie können der Verwendung Ihrer E-Mail-Adresse für solche Hinweise jederzeit widersprechen — eine kurze Antwort auf diese E-Mail genügt. Dafür entstehen Ihnen keine anderen als die Übermittlungskosten nach den Basistarifen.';

/** Text für die Erinnerung. Er wird hinter „dies ist eine freundliche Erinnerung." gesetzt. Keine Gesundheits- oder Wirkversprechen. */
export function nachkaufText(o: { produkt: string; verkauftAm: string; firma?: string | null }): { titel: string; text: string } {
  return {
    titel: `${o.produkt}: Zeit zum Nachkaufen?`,
    text: `Ihr ${o.produkt} vom ${datumDe(o.verkauftAm)} dürfte bald aufgebraucht sein. Gern legen wir Ihnen ein neues zurück — antworten Sie einfach auf diese E-Mail oder sprechen Sie uns bei Ihrem nächsten Besuch an.\n\n${WIDERSPRUCH_HINWEIS}`,
  };
}

// ===========================================================================
// E · IMPF-ERINNERUNG AN HALTER (Tier)
// ===========================================================================
export const IMPF_VORLAUF_TAGE = 21;

export type TierLite = { id: string; name: string; halter?: string | null; kontakt_id?: string | null; erinnerung_ok?: boolean | null; erinnerung_widerruf_am?: string | null };
export type BehandlungLite = { id: string; tier_id: string; datum: string; art: string; bezeichnung: string; naechste_faellig?: string | null };
export type TierErinnerungLite = { behandlung_id: string; erinnert_am: string };

export type ImpfZeile = { tier: TierLite; behandlung: BehandlungLite; faellig: string; tage: number; stufe: 'ueberfaellig' | 'bald' | 'spaeter'; erinnert: string | null; darf: boolean; grund: string };

/**
 * Fällige Wiederholungen: je Tier und Bezeichnung zählt nur die neueste Behandlung
 * (wer schon nachgeimpft ist, erscheint nicht mehr). Fenster: bis `vorlauf` Tage
 * voraus, Überfällige bis 180 Tage zurück.
 */
export function impfListe(tiere: TierLite[], behandlungen: BehandlungLite[], erinnerungen: TierErinnerungLite[], heute: string, vorlauf = IMPF_VORLAUF_TAGE): ImpfZeile[] {
  const tierMap = new Map(tiere.map((t) => [t.id, t]));
  const neueste = new Map<string, BehandlungLite>();
  for (const b of behandlungen) {
    const schl = `${b.tier_id}|${normName(b.bezeichnung) || b.art}`;
    const alt = neueste.get(schl);
    if (!alt || b.datum > alt.datum) neueste.set(schl, b);
  }
  const erinnert = new Map<string, string>();
  for (const e of erinnerungen) {
    const alt = erinnert.get(e.behandlung_id);
    if (!alt || e.erinnert_am > alt) erinnert.set(e.behandlung_id, e.erinnert_am);
  }
  const zeilen: ImpfZeile[] = [];
  for (const b of neueste.values()) {
    if (!istIsoDatum(b.naechste_faellig)) continue;
    const t = tierMap.get(b.tier_id);
    if (!t) continue;
    const tage = tageZwischen(heute, b.naechste_faellig);
    if (tage > vorlauf || tage < -180) continue;
    let darf = true, grund = 'Einwilligung des Halters liegt vor.';
    if (istIsoDatum(t.erinnerung_widerruf_am)) { darf = false; grund = 'Halter hat Erinnerungen widerrufen.'; }
    else if (!t.erinnerung_ok) { darf = false; grund = 'Keine Einwilligung des Halters für Erinnerungen hinterlegt.'; }
    zeilen.push({ tier: t, behandlung: b, faellig: b.naechste_faellig.slice(0, 10), tage, stufe: tage < 0 ? 'ueberfaellig' : tage <= 7 ? 'bald' : 'spaeter', erinnert: erinnert.get(b.id) ?? null, darf, grund });
  }
  return zeilen.sort((a, b) => a.faellig.localeCompare(b.faellig) || a.tier.name.localeCompare(b.tier.name));
}

/** Text für den Halter — keine medizinische Empfehlung, nur Termin-Hinweis. */
export function impfText(o: { tier: string; bezeichnung: string; faellig: string }): { titel: string; text: string } {
  return {
    titel: `${o.tier}: ${o.bezeichnung} steht an`,
    text: `Laut unserer Kartei ist für ${o.tier} am ${datumDe(o.faellig)} die nächste ${o.bezeichnung} vorgesehen. Bitte vereinbaren Sie dafür einen Termin — telefonisch oder per Antwort auf diese E-Mail.\n\nWenn Sie keine Erinnerungen mehr erhalten möchten, antworten Sie einfach kurz auf diese E-Mail.`,
  };
}
