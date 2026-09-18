// ============================================================================
// ARGONAUT OS · lib/wiederkehr.ts — Wiederkehr-Formeln (Baustein 1)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Von Client-Seiten
// (Wartungs-Cockpit) UND Server-Routen (/api/rechnung-aus-wartung) nutzbar.
//
// Aufgabe in Block A: aus einem Wartungsvertrag die Rechnungs-Positionen und
// den Abrechnungs-Schutz (keine Doppel-Abrechnung im selben Intervall) rein
// rechnerisch ableiten. In Block B wird diese Datei um die Cockpit-Kennzahlen
// (MRR ueber alle vier Wiederkehr-Quellen) erweitert.
//
// Zeitzonen-Regel (ARGONAUT): Datum IMMER lokal bilden, NIE toISOString() fuer
// die Datumsbildung — wir arbeiten konsequent auf reinen "YYYY-MM-DD"-Strings.
//
// ▄▄▄ REPARATUR PUNKT 20 (18.09.2026) ▄▄▄
// Alle Befunde vorher am echten Code GEMESSEN.
//
// 1. NULL PROZENT UMSATZSTEUER. wartungPositionen prueft den Steuersatz mit
//    Number(v.mwst_satz), und Number(null) ist 0 — die Bedingung "satz >= 0"
//    war damit erfuellt. Ein Wartungsvertrag OHNE hinterlegten Steuersatz
//    (in der Datenbank schlicht NULL) bekam deshalb 0 % statt der 19 %, die
//    der Standard sein sollten. Gemessen: 1.000 EUR netto ergaben eine
//    Rechnung ueber 1.000 EUR brutto — 190 EUR Umsatzsteuer fehlten, die der
//    Betrieb dem Finanzamt trotzdem schuldet. Das ist das SPIEGELBILD des
//    DATEV-Befundes aus Punkt 15: dort erfundene Steuer, hier verschwundene.
//    Ein ausdrueckliches 0 bleibt 0 — steuerfreie Leistungen gibt es wirklich.
//
// 2. JEDES UNBEKANNTE INTERVALL WURDE "MONATLICH". intervallZuMonate kannte
//    nur monat/quartal/jahr/einmalig und antwortete auf alles andere mit 1.
//    Gemessen: "halbjaehrlich" -> 1 Monat. Ein halbjaehrlicher Vertrag waere
//    SECHSMAL zu oft abgerechnet worden, und im Cockpit stand der sechsfache
//    MRR. Jetzt sind die gaengigen deutschen Schreibweisen erkannt, und was
//    trotzdem unbekannt bleibt, meldet intervallUnbekannt() im Klartext.
//
// 3. BETRAEGE ALS TEXT WURDEN 0. normalisiereAbo/normalisiereMitglied lasen
//    mit Number(...) — "1.234,56" aus einem JSON-Positionsfeld ergibt NaN und
//    damit 0. Jetzt liest lib/zahlen.ts.
//
// 4. NEU, WEIL ES IN DER ROUTE FEHLT: naechsteFaelligkeitAb(). Die Route
//    /api/wiederkehr-lauf rechnet ihr naechstes Abo-Datum selbst, mit
//    setMonth() + toISOString(). GEMESSEN: aus dem 31.01. wird der 02.03.
//    (der Februar faellt aus), und jeder Sprung verliert durch die Zeitzone
//    einen Tag — aus dem 15. wird der 14., dann der 13.; nach einem Jahr
//    monatlich sind das zwoelf Tage Drift. Ausserdem rueckt die Route nur um
//    EIN Intervall vor: ein drei Monate ueberfaelliges Abo erzeugt bei vier
//    Klicks am selben Tag VIER Rechnungen an denselben Kunden, obwohl im Kopf
//    der Route "von sich aus idempotent" steht. naechsteFaelligkeitAb springt
//    monatsende-sicher so weit, dass das Ergebnis STRIKT NACH heute liegt.
//    ANDOCKPUNKT: die Route muss diese Funktion noch aufrufen — das ist eine
//    Geld-Route und kommt deshalb getrennt und abgesegnet.
// ============================================================================

import { leseZahl, leseZahlOder } from './zahlen';

export interface WartungAbrechenbar {
  titel?: string | null;
  kunde_name?: string | null;
  vertragsnummer?: string | null;
  betrag_netto?: number | null;
  mwst_satz?: number | null;
  intervall_monate?: number | null;
  letzte_abrechnung_am?: string | null; // "YYYY-MM-DD"
  status?: string | null;
}

export interface WiederkehrPosition {
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  mwst_satz: number;
}

/** Standard-MwSt, wenn am Vertrag nichts Gueltiges hinterlegt ist. */
const MWST_STD = 19;

/**
 * Monate additionssicher auf ein "YYYY-MM-DD" addieren — Monatsende-sicher.
 * Beispiel: 31.01. + 1 Monat -> 28.02. (nicht 03.03.), weil der Februar
 * keinen 31. hat. Rein rechnerisch, kein UTC-Versatz.
 */
export function datumPlusMonate(iso: string, monate: number): string {
  const teile = (iso || '').slice(0, 10).split('-');
  const j = parseInt(teile[0], 10);
  const m = parseInt(teile[1], 10);
  const t = parseInt(teile[2], 10);
  if (!j || !m || !t) return (iso || '').slice(0, 10);

  const zielMonatIndex = (m - 1) + monate;              // 0-basiert
  const jahr = j + Math.floor(zielMonatIndex / 12);     // Ueberlauf ins Folgejahr
  const monat = ((zielMonatIndex % 12) + 12) % 12;      // 0..11, immer positiv
  const letzterTag = new Date(jahr, monat + 1, 0).getDate(); // letzter Tag des Zielmonats
  const tag = Math.min(t, letzterTag);

  const mm = String(monat + 1).padStart(2, '0');
  const tt = String(tag).padStart(2, '0');
  return `${jahr}-${mm}-${tt}`;
}

/** Ist der Vertrag grundsaetzlich abrechenbar (aktiv + positiver Betrag)? */
export function istAbrechenbar(v: WartungAbrechenbar): boolean {
  const aktiv = !v.status || v.status === 'aktiv';
  return aktiv && leseZahlOder(v.betrag_netto, 0) > 0;
}

/**
 * Steuersatz eines Vertrags. FEHLT er (null, undefined, leerer Text), gilt der
 * Standard von 19 % — NICHT null Prozent. Ein ausdrueckliches 0 bleibt 0,
 * weil es steuerfreie Leistungen wirklich gibt.
 *
 * Der alte Code schrieb Number(v.mwst_satz) und pruefte "grosser gleich 0".
 * Number(null) ist 0, also war die Pruefung erfuellt und der Standard kam nie
 * zum Zug. Genau daran gingen 19 % Umsatzsteuer still verloren.
 */
export function mwstSatzOderStandard(wert: unknown, standard = MWST_STD): number {
  if (wert === null || wert === undefined) return standard;
  if (typeof wert === 'string' && wert.trim() === '') return standard;
  const n = leseZahl(wert);
  if (n === null || n < 0) return standard;
  return n;
}

/** Sieht der Text wie ein sauberes "YYYY-MM-DD" aus (inkl. plausiblem Tag)? */
export function istDatum(iso: unknown): boolean {
  const m = String(iso ?? '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const mo = Number(m[2]), t = Number(m[3]);
  return mo >= 1 && mo <= 12 && t >= 1 && t <= 31;
}

/**
 * Die naechste Faelligkeit, die STRIKT NACH `heuteIso` liegt.
 *
 * Warum nicht einfach ein Intervall dazu: ein Abo, das drei Monate liegen
 * geblieben ist, bleibt nach einem Schritt immer noch faellig. Wer den Lauf
 * viermal anstoesst, erzeugt vier Rechnungen an denselben Kunden am selben
 * Tag. Hier wird so lange gesprungen, bis der Termin wirklich in der Zukunft
 * liegt — monatsende-sicher ueber datumPlusMonate, ohne toISOString.
 *
 * intervallMonate <= 0 (einmalig) ergibt null: es gibt keine naechste.
 * `maxSchritte` ist nur eine Reissleine gegen Endlosschleifen bei Unsinn.
 */
export function naechsteFaelligkeitAb(
  bisherIso: string,
  intervallMonate: number,
  heuteIso: string,
  maxSchritte = 600,
): string | null {
  if (!istDatum(bisherIso) || !istDatum(heuteIso)) return null;
  const schritt = Math.trunc(Number(intervallMonate) || 0);
  if (schritt <= 0) return null;

  const heute = String(heuteIso).slice(0, 10);
  let d = String(bisherIso).slice(0, 10);
  let i = 0;
  while (d <= heute && i < maxSchritte) { d = datumPlusMonate(d, schritt); i++; }
  return d > heute ? d : null;
}

/**
 * Darf dieses Abo heute abgerechnet werden? Das Gegenstueck zu darfAbrechnen
 * fuer Wartungsvertraege, das es bisher gar nicht gab.
 *  - nicht aktiv -> nein
 *  - heute schon erzeugt -> nein (der Doppelklick-Schutz, der gefehlt hat)
 *  - naechste Faelligkeit liegt in der Zukunft -> nein
 */
export function darfAboAbrechnen(
  a: { aktiv?: boolean | null; naechste_faellig?: string | null; zuletzt_erzeugt?: string | null },
  heuteIso: string,
): AbrechnungsPruefung {
  if (a.aktiv === false) return { darf: false, grund: 'Abo ist nicht aktiv.' };
  const heute = String(heuteIso).slice(0, 10);

  const zuletzt = a.zuletzt_erzeugt ? String(a.zuletzt_erzeugt).slice(0, 10) : null;
  if (zuletzt && zuletzt >= heute) {
    return { darf: false, grund: 'Heute bereits abgerechnet.' };
  }

  const faellig = a.naechste_faellig ? String(a.naechste_faellig).slice(0, 10) : null;
  if (!faellig) return { darf: false, grund: 'Keine Faelligkeit hinterlegt.' };
  if (!istDatum(faellig)) return { darf: false, grund: `Faelligkeit nicht lesbar: ${faellig}` };
  if (faellig > heute) return { darf: false, grund: `Noch nicht faellig — ab ${faellig}.`, sperrBis: faellig };

  return { darf: true, grund: 'Faellig zur Abrechnung.' };
}

/**
 * Die Rechnungs-Position(en) fuer einen Wartungsvertrag. Aktuell genau eine
 * Pauschal-Position aus betrag_netto + mwst_satz. Gibt [] zurueck, wenn kein
 * abrechenbarer Betrag hinterlegt ist.
 */
export function wartungPositionen(v: WartungAbrechenbar): WiederkehrPosition[] {
  const betrag = leseZahlOder(v.betrag_netto, 0);
  if (betrag <= 0) return [];

  const satz = mwstSatzOderStandard(v.mwst_satz);

  const titel = (v.titel && v.titel.trim()) || 'Wartung';
  const bezeichnung =
    'Wartung: ' + titel + (v.vertragsnummer ? ` (Nr. ${v.vertragsnummer})` : '');

  return [{ bezeichnung, menge: 1, einheit: 'Pauschal', einzelpreis: betrag, mwst_satz: satz }];
}

export interface AbrechnungsPruefung {
  darf: boolean;
  grund: string;
  sperrBis?: string; // "YYYY-MM-DD", ab wann wieder abgerechnet werden darf
}

/**
 * Doppel-Abrechnungs-Schutz: innerhalb EINES Intervalls ab der letzten
 * Abrechnung wird nicht erneut abgerechnet. Reiner Hinweis — die Route kann
 * bewusst ueberstimmen; die UI warnt. So kann man einen Vertrag nicht aus
 * Versehen zweimal im selben Monat/Jahr fakturieren.
 */
export function darfAbrechnen(v: WartungAbrechenbar, heuteIso: string): AbrechnungsPruefung {
  const aktiv = !v.status || v.status === 'aktiv';
  if (!aktiv) return { darf: false, grund: 'Vertrag ist nicht aktiv.' };
  if (leseZahlOder(v.betrag_netto, 0) <= 0) return { darf: false, grund: 'Kein Betrag hinterlegt.' };

  const letzte = v.letzte_abrechnung_am ? v.letzte_abrechnung_am.slice(0, 10) : null;
  if (!letzte) return { darf: true, grund: 'Noch nie abgerechnet.' };
  // Ein unlesbares Datum sperrte frueher ebenfalls, aber mit einer sinnlosen
  // Meldung ("naechste Abrechnung ab kaputt"), weil Ziffern beim Textvergleich
  // kleiner sind als Buchstaben. Gesperrt bleibt es — nur sagt es jetzt warum.
  if (!istDatum(letzte)) return { darf: false, grund: `Letzte Abrechnung nicht lesbar: ${letzte}` };

  const intervall = leseZahlOder(v.intervall_monate, 0) > 0 ? Math.trunc(leseZahlOder(v.intervall_monate, 0)) : 12;
  const sperrBis = datumPlusMonate(letzte, intervall);

  if (heuteIso.slice(0, 10) < sperrBis) {
    return { darf: false, grund: `Bereits abgerechnet — naechste Abrechnung ab ${sperrBis}.`, sperrBis };
  }
  return { darf: true, grund: 'Faellig zur Abrechnung.', sperrBis };
}

/** Netto-Summe der Positionen (reine Rechnung, ohne Rundungslogik der Route). */
export function positionenNetto(pos: WiederkehrPosition[]): number {
  return pos.reduce((s, p) => s + leseZahlOder(p.menge, 0) * leseZahlOder(p.einzelpreis, 0), 0);
}

// ============================================================================
// BLOCK B · Cockpit-Kennzahlen — die vier Wiederkehr-Quellen auf EINEN Nenner.
//
// Wartung (wartungsvertraege), Abo-Rechnungen (abo_rechnungen), Mitglieder
// (mitglieder) und eigene Vertraege (vertraege) haben je eigene Felder. Hier
// werden sie in einen gemeinsamen WiederkehrEintrag normalisiert, damit das
// Cockpit MRR (wiederkehrender Umsatz/Monat), Ausgaben/Monat und die
// Faelligkeits-Buckets ueber alles hinweg rechnen kann. Rein rechnerisch.
// ============================================================================

export type WiederkehrQuelle = 'wartung' | 'abo' | 'mitglied' | 'vertrag';
export type WiederkehrRichtung = 'einnahme' | 'ausgabe';

export interface WiederkehrEintrag {
  id: string;
  quelle: WiederkehrQuelle;
  titel: string;
  partner: string | null;
  betragNetto: number;        // pro Intervall
  intervallMonate: number;    // 0 = einmalig / kein Turnus
  monatswert: number;         // Betrag normalisiert auf 1 Monat (0 bei einmalig)
  naechsteFaelligkeit: string | null; // "YYYY-MM-DD" oder null
  richtung: WiederkehrRichtung;
  aktiv: boolean;
}

/** Tage additionssicher auf ein "YYYY-MM-DD" addieren (lokal, kein UTC-Versatz). */
export function datumPlusTage(iso: string, tage: number): string {
  const teile = (iso || '').slice(0, 10).split('-');
  const j = parseInt(teile[0], 10);
  const m = parseInt(teile[1], 10);
  const t = parseInt(teile[2], 10);
  if (!j || !m || !t) return (iso || '').slice(0, 10);
  const d = new Date(j, m - 1, t);
  d.setDate(d.getDate() + tage);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const tt = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${tt}`;
}

/** Der Standard, wenn ein Intervall-Text nicht zu deuten ist: monatlich. */
const INTERVALL_STD = 1;

/** Intervall-Text -> Monate, oder null, wenn der Text nicht zu deuten ist. */
export function intervallMonateOderNull(text?: string | null): number | null {
  const t = (text || '').toLowerCase().trim().replace(/[\s.\-_]/g, '');
  if (t === '') return null;
  if (t === 'einmalig' || t === 'einmal' || t === 'keine' || t === 'kein') return 0;
  if (t === 'monat' || t === 'monatlich' || t === 'promonat' || t === 'monatl') return 1;
  if (t === 'zweimonatlich' || t === 'alle2monate' || t === 'zweimonatig') return 2;
  if (t === 'quartal' || t === 'quartalsweise' || t === 'quartalsmaessig'
      || t === 'vierteljaehrlich' || t === 'vierteljährlich' || t === 'alle3monate') return 3;
  // Halbjaehrlich fehlte ganz und wurde deshalb zu "monatlich" — sechsmal zu oft.
  if (t === 'halbjaehrlich' || t === 'halbjährlich' || t === 'halbjahr'
      || t === 'halbjaehrig' || t === 'alle6monate') return 6;
  if (t === 'jahr' || t === 'jaehrlich' || t === 'jährlich' || t === 'projahr'
      || t === 'einmaljaehrlich' || t === 'alle12monate') return 12;
  if (t === 'zweijaehrlich' || t === 'zweijährlich' || t === 'alle2jahre' || t === 'alle24monate') return 24;
  // Reine Zahl = Monate ("3" heisst alle drei Monate) — so steht es in
  // wartungsvertraege.intervall_monate, und so kommt es manchmal auch hier an.
  if (/^[0-9]{1,3}$/.test(t)) return Number(t);
  return null;
}

/**
 * Intervall-Text (in allen Schreibweisen der vier Tabellen) -> Monate.
 * Unbekannter Text ergibt weiterhin 1 (monatlich), damit kein Aufrufer
 * ploetzlich mit 0 rechnet — aber intervallUnbekannt() sagt jetzt, dass
 * geraten wurde, statt es stillschweigend zu tun.
 */
export function intervallZuMonate(text?: string | null): number {
  const n = intervallMonateOderNull(text);
  return n === null ? INTERVALL_STD : n;
}

/** Wurde bei diesem Text geraten? Dann gehoert er in die Hinweise. */
export function intervallUnbekannt(text?: string | null): boolean {
  return intervallMonateOderNull(text) === null;
}

/** Monatswert = Betrag / Intervall-Monate. Einmalig (0) zaehlt nicht wiederkehrend. */
export function monatswertBerechnen(betragNetto: number, intervallMonate: number): number {
  return intervallMonate > 0 ? leseZahlOder(betragNetto, 0) / intervallMonate : 0;
}

// --- Normalisierer je Quelle ------------------------------------------------

/** Menge einer Abo-Position. Fehlt sie, ist 1 gemeint — eine 0 bleibt 0. */
function mengeOderEins(wert: unknown): number {
  if (wert === null || wert === undefined || wert === '') return 1;
  const n = leseZahl(wert);
  return n === null ? 1 : n;
}

export function normalisiereWartung(r: Record<string, unknown>): WiederkehrEintrag {
  const betragNetto = leseZahlOder(r.betrag_netto, 0);
  const roh = leseZahlOder(r.intervall_monate, 0);
  const intervallMonate = roh > 0 ? Math.trunc(roh) : 12;
  const status = typeof r.status === 'string' ? r.status : 'aktiv';
  const aktiv = (status === 'aktiv') && r.archiviert !== true;
  return {
    id: String(r.id ?? ''), quelle: 'wartung',
    titel: (typeof r.titel === 'string' && r.titel) || 'Wartungsvertrag',
    partner: typeof r.kunde_name === 'string' ? r.kunde_name : null,
    betragNetto, intervallMonate, monatswert: monatswertBerechnen(betragNetto, intervallMonate),
    naechsteFaelligkeit: typeof r.naechste_faelligkeit_am === 'string' ? r.naechste_faelligkeit_am : null,
    richtung: 'einnahme', aktiv,
  };
}

export function normalisiereAbo(r: Record<string, unknown>): WiederkehrEintrag {
  const pos = Array.isArray(r.positionen) ? (r.positionen as Record<string, unknown>[]) : [];
  // Frueher Number(...): ein Positionspreis als Text ("1.234,56") ergab NaN
  // und damit 0 — die teuerste Zeile fiel still aus dem MRR.
  const betragNetto = pos.reduce((s, p) => s + mengeOderEins(p.menge) * leseZahlOder(p.einzelpreis, 0), 0);
  const intervallMonate = intervallZuMonate(typeof r.intervall === 'string' ? r.intervall : 'monat');
  return {
    id: String(r.id ?? ''), quelle: 'abo',
    titel: (typeof r.titel === 'string' && r.titel) || 'Wiederkehrende Rechnung',
    partner: typeof r.empfaenger_name === 'string' ? r.empfaenger_name : null,
    betragNetto, intervallMonate, monatswert: monatswertBerechnen(betragNetto, intervallMonate),
    naechsteFaelligkeit: typeof r.naechste_faellig === 'string' ? r.naechste_faellig : null,
    richtung: 'einnahme', aktiv: r.aktiv !== false,
  };
}

export function normalisiereMitglied(r: Record<string, unknown>): WiederkehrEintrag {
  const betragNetto = leseZahlOder(r.betrag, 0);
  const intervallMonate = intervallZuMonate(typeof r.intervall === 'string' ? r.intervall : 'monat');
  const status = typeof r.status === 'string' ? r.status : 'aktiv';
  return {
    id: String(r.id ?? ''), quelle: 'mitglied',
    titel: (typeof r.name === 'string' && r.name) || 'Mitglied / Abo',
    partner: typeof r.name === 'string' ? r.name : null,
    betragNetto, intervallMonate, monatswert: monatswertBerechnen(betragNetto, intervallMonate),
    naechsteFaelligkeit: null, // Mitglieder-Tabelle fuehrt keine explizite naechste Faelligkeit
    richtung: 'einnahme', aktiv: status === 'aktiv',
  };
}

export function normalisiereVertrag(r: Record<string, unknown>): WiederkehrEintrag {
  const betragNetto = leseZahlOder(r.kosten_betrag, 0);
  const intervallMonate = intervallZuMonate(typeof r.kosten_intervall === 'string' ? r.kosten_intervall : 'monatlich');
  const status = typeof r.status === 'string' ? r.status : 'aktiv';
  return {
    id: String(r.id ?? ''), quelle: 'vertrag',
    titel: (typeof r.bezeichnung === 'string' && r.bezeichnung) || 'Vertrag',
    partner: typeof r.vertragspartner === 'string' ? r.vertragspartner : null,
    betragNetto, intervallMonate, monatswert: monatswertBerechnen(betragNetto, intervallMonate),
    naechsteFaelligkeit: null, // Vertraege rechnen auf Kuendigungsfrist, nicht auf Faelligkeit
    richtung: 'ausgabe', aktiv: status === 'aktiv',
  };
}

// --- Aggregation ------------------------------------------------------------

/** MRR: wiederkehrender Netto-Umsatz pro Monat (aktive Einnahmen). */
export function mrr(eintraege: WiederkehrEintrag[]): number {
  return eintraege
    .filter((e) => e.aktiv && e.richtung === 'einnahme')
    .reduce((s, e) => s + e.monatswert, 0);
}

/** Wiederkehrende Ausgaben pro Monat (aktive eigene Vertraege). */
export function ausgabenProMonat(eintraege: WiederkehrEintrag[]): number {
  return eintraege
    .filter((e) => e.aktiv && e.richtung === 'ausgabe')
    .reduce((s, e) => s + e.monatswert, 0);
}

export type FaelligBucket = 'faellig' | 'bald' | 'ok' | 'kein';

/**
 * Faelligkeits-Einordnung eines Eintrags relativ zu heute.
 * faellig = heute oder ueberfaellig · bald = in <= `baldTage` Tagen ·
 * ok = spaeter · kein = keine Faelligkeit hinterlegt.
 */
export function faelligBucket(e: WiederkehrEintrag, heuteIso: string, baldTage = 14): FaelligBucket {
  if (!e.naechsteFaelligkeit) return 'kein';
  const n = e.naechsteFaelligkeit.slice(0, 10);
  const heute = heuteIso.slice(0, 10);
  if (n <= heute) return 'faellig';
  if (n <= datumPlusTage(heute, baldTage)) return 'bald';
  return 'ok';
}

/** Zaehlt aktive Einnahme-Eintraege nach Faelligkeits-Bucket. */
export function zaehleFaelligkeiten(
  eintraege: WiederkehrEintrag[],
  heuteIso: string,
  baldTage = 14,
): { faellig: number; bald: number; ok: number; kein: number } {
  const summe = { faellig: 0, bald: 0, ok: 0, kein: 0 };
  for (const e of eintraege) {
    if (!e.aktiv || e.richtung !== 'einnahme') continue;
    summe[faelligBucket(e, heuteIso, baldTage)]++;
  }
  return summe;
}

// ============================================================================
// BLOCK E · Branchen-Vorlagen — Wiederkehr-Typen als Startpunkt.
//
// Jede Vorlage fuellt einen NEUEN Wartungsvertrag mit branchentypischen
// Standardwerten (Titel, Intervall, Erinnerung, ggf. passendes Pruefprotokoll).
// Der eigentliche Reichweiten-Hebel: ein Klick, und der Betrieb hat den
// richtigen Wiederkehr-Typ. Rein Daten — die UI wendet sie an. Erweiterbar.
//
// Rechtlich verifizierte Fristen (WebSearch 27.07.2026):
//  - Feuerloescher: Pruefung alle 2 Jahre (24 Mon.) nach DIN 14406-4.
//  - DGUV V3, Heizung, Aufzug: Standard = jaehrlich, aber betriebs-/
//    gefaehrdungsabhaengig — daher als anpassbarer Default (12 Mon.) gesetzt.
// ============================================================================

export interface WartungVorlage {
  key: string;
  branche: string;
  icon: string;
  titel: string;
  intervallMonate: number;
  erinnerungTage: number;
  /** Passt zu den PRUEF_VORLAGEN im Wartungs-Protokoll (dguv | heizung | allgemein). */
  pruefVorlage?: 'dguv' | 'heizung' | 'allgemein';
  hinweis: string;
}

export const WARTUNG_VORLAGEN: WartungVorlage[] = [
  { key: 'galabau_pflege', branche: 'GaLaBau / Grünpflege', icon: '🌿', titel: 'Grünpflege-Turnus', intervallMonate: 1, erinnerungTage: 7, hinweis: 'Monatlich wiederkehrende Pflege (mähen, schneiden, pflegen) — v. a. in der Saison.' },
  { key: 'dguv_echeck', branche: 'Elektro / DGUV V3', icon: '⚡', titel: 'DGUV V3 Prüfung (E-Check)', intervallMonate: 12, erinnerungTage: 30, pruefVorlage: 'dguv', hinweis: 'Wiederkehrende Prüfung elektrischer Betriebsmittel. Intervall gefährdungsabhängig anpassen (Baustelle kürzer, Büro länger).' },
  { key: 'shk_heizung', branche: 'SHK / Heizung', icon: '🔥', titel: 'Heizungs-Wartungsvertrag', intervallMonate: 12, erinnerungTage: 30, pruefVorlage: 'heizung', hinweis: 'Jährliche Heizungswartung mit Dichtheits- und Funktionsprüfung.' },
  { key: 'retainer', branche: 'Agentur / IT / MSP', icon: '🔁', titel: 'Monats-Retainer', intervallMonate: 1, erinnerungTage: 7, hinweis: 'Monatlich wiederkehrende Betreuungspauschale (Support, Wartung, Leistungskontingent).' },
  { key: 'miete_leasing', branche: 'Vermietung / Leasing', icon: '📄', titel: 'Miet-/Leasingrate', intervallMonate: 1, erinnerungTage: 14, hinweis: 'Wiederkehrende Miet- oder Leasingrate.' },
  { key: 'saison', branche: 'Landwirt / Winterdienst', icon: '🌾', titel: 'Saison-Vertrag', intervallMonate: 12, erinnerungTage: 30, hinweis: 'Saisonale wiederkehrende Leistung (z. B. Winterdienst, Lohnarbeit).' },
  { key: 'aufzug', branche: 'Aufzug / techn. Anlage', icon: '🛗', titel: 'Aufzug-/Anlagenprüfung', intervallMonate: 12, erinnerungTage: 30, pruefVorlage: 'allgemein', hinweis: 'Wiederkehrende Prüfung/Wartung technischer Anlagen (Aufzug i. d. R. jährlich, BetrSichV).' },
  { key: 'brandschutz', branche: 'Brandschutz', icon: '🧯', titel: 'Feuerlöscher-Prüfung', intervallMonate: 24, erinnerungTage: 30, pruefVorlage: 'allgemein', hinweis: 'Feuerlöscher-Prüfung alle 2 Jahre (DIN 14406-4).' },
];

export function wartungVorlage(key: string): WartungVorlage | undefined {
  return WARTUNG_VORLAGEN.find((v) => v.key === key);
}


// ============================================================================
// Klartext vor dem Abrechnen (Punkt 20). Aendert nichts, rechnet nichts um.
// NOCH NICHT auf einer Seite angezeigt — Andockpunkt, gebuendelt mit
// staffelUnstimmigkeiten / extfHinweise / ustvaHinweise / bankHinweise.
// ============================================================================

export interface WiederkehrRohzeile {
  titel?: string | null;
  intervall?: string | null;
  mwst_satz?: unknown;
  naechste_faellig?: string | null;
  zuletzt_erzeugt?: string | null;
}

export function wiederkehrHinweise(zeilen: WiederkehrRohzeile[], heuteIso: string): string[] {
  const h: string[] = [];
  const heute = String(heuteIso).slice(0, 10);

  const geraten = (zeilen || []).filter((z) => z.intervall != null && intervallUnbekannt(z.intervall));
  if (geraten.length > 0) {
    const namen = geraten.map((z) => `${z.titel || 'ohne Titel'} ("${z.intervall}")`).join(', ');
    h.push(`${geraten.length} Eintrag${geraten.length === 1 ? '' : 'e'} mit unbekanntem Intervall — es wird monatlich gerechnet: ${namen}.`);
  }

  const ohneSatz = (zeilen || []).filter((z) => 'mwst_satz' in z && (z.mwst_satz === null || z.mwst_satz === undefined || z.mwst_satz === ''));
  if (ohneSatz.length > 0) {
    h.push(`${ohneSatz.length} Eintrag${ohneSatz.length === 1 ? '' : 'e'} ohne hinterlegten Steuersatz — es werden ${MWST_STD} % angesetzt.`);
  }

  const heuteSchon = (zeilen || []).filter((z) => z.zuletzt_erzeugt && String(z.zuletzt_erzeugt).slice(0, 10) >= heute);
  if (heuteSchon.length > 0) {
    h.push(`${heuteSchon.length} Eintrag${heuteSchon.length === 1 ? '' : 'e'} wurde${heuteSchon.length === 1 ? '' : 'n'} heute bereits abgerechnet und bleibt${heuteSchon.length === 1 ? '' : 'en'} aussen vor.`);
  }

  const ueberfaellig = (zeilen || []).filter((z) => {
    const f = z.naechste_faellig ? String(z.naechste_faellig).slice(0, 10) : null;
    return !!f && istDatum(f) && f < heute;
  });
  if (ueberfaellig.length > 0) {
    h.push(`${ueberfaellig.length} Eintrag${ueberfaellig.length === 1 ? '' : 'e'} ist laenger ueberfaellig — es wird pro Lauf nur EINE Rechnung erzeugt, nicht eine je verpasstem Zeitraum.`);
  }
  return h;
}
