// ============================================================================
// ARGONAUT OS · lib/qualitaet.ts — Qualität & Rückverfolgung (Paket PS2)
//
//   8D-Reklamation      Kunden-, Lieferanten- und interne Reklamationen in acht
//                       Schritten, mit Fristen je Schritt und Abschluss-Sperre
//   Lieferanten-Bewertung  Qualität, Liefertreue, Preis, Service -> A/B/C
//   Rückruf             Umfang über Chargen ermitteln (auch über mehrere Stufen),
//                       Mengenbilanz, Checkliste Lebensmittel / Produkte
//   MHD-Warnung         Chargen aus Industrie (charge_los) und Lebensmittel
//                       (lm_chargen) in EINER Liste
//   Gefahrstoffverzeichnis  Pflichtangaben nach § 6 GefStoffV, CMR-Erkennung,
//                       Betriebsanweisung, Alter des Sicherheitsdatenblatts
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE Hooks. Getestet in
// tests/qualitaetPS2.test.mjs. Datumsrechnung nur mit Kalendertagen (UTC),
// damit der Browser in Deutschland nicht auf den Vortag rutscht.
//
// ▄▄▄ WAS DIESE DATEI GARANTIERT ▄▄▄
// · Eine Reklamation lässt sich erst abschließen (D8), wenn D1 bis D7 erledigt
//   sind UND die Wirksamkeit der Abstellmaßnahme bestätigt ist.
// · Rückruf: Eine Charge, die als ROHSTOFF in eine andere Charge eingegangen
//   ist, zieht diese mit — sonst bleibt ein Teil der Ware draußen. Kreise in
//   den Daten führen nicht zur Endlosschleife.
// · Gefahrstoffe: Fehlt eine Pflichtangabe, ist der Eintrag rot — nie still grün.
//
// ▄▄▄ KEINE RECHTSBERATUNG ▄▄▄
// Fristen der 8D-Schritte sind übliche Kundenvorgaben (Richtwerte). Die
// Rückruf-Checklisten nennen die Meldepflichten (Art. 19 VO (EG) 178/2002,
// Art. 20 VO (EU) 2023/988), ersetzen aber nicht die Abstimmung mit der Behörde.
// ============================================================================

// ---------------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------------

function zwei(n: number): string { return n < 10 ? `0${n}` : String(n); }

export function istIsoDatum(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  const [j, m, t] = s.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

export function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + Math.round(tage)));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
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

function zahl(x: unknown): number | null {
  if (x == null || x === '') return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const s = String(x).trim().replace(/\s/g, '');
  if (!s) return null;
  // 1.234,56 -> 1234.56 ; 12,5 -> 12.5 ; 12.5 -> 12.5
  const norm = /,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// 8D-Reklamation
// ---------------------------------------------------------------------------

export type Richtung = 'kunde' | 'lieferant' | 'intern';

export const RICHTUNGEN: { key: Richtung; label: string; beschreibung: string }[] = [
  { key: 'kunde', label: 'Kundenreklamation', beschreibung: 'Ein Kunde reklamiert bei Ihnen' },
  { key: 'lieferant', label: 'Lieferantenreklamation', beschreibung: 'Sie reklamieren bei einem Lieferanten' },
  { key: 'intern', label: 'Interner Fehler', beschreibung: 'Im eigenen Betrieb entdeckt' },
];

export type SchrittKey = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8';

export const SCHRITTE: { key: SchrittKey; titel: string; frage: string; fristTage: number | null }[] = [
  { key: 'D1', titel: 'Team', frage: 'Wer kümmert sich? (Verantwortlicher und Beteiligte)', fristTage: 1 },
  { key: 'D2', titel: 'Problem beschreiben', frage: 'Was ist wo, wann, wie oft aufgetreten? Menge, Charge, Fotos.', fristTage: 1 },
  { key: 'D3', titel: 'Sofortmaßnahmen', frage: 'Was schützt den Kunden JETZT? (Ware sperren, aussortieren, Ersatz)', fristTage: 1 },
  { key: 'D4', titel: 'Ursache finden', frage: 'Warum ist es passiert — und warum wurde es nicht entdeckt? (5x Warum)', fristTage: 10 },
  { key: 'D5', titel: 'Abstellmaßnahmen festlegen', frage: 'Was beseitigt die Ursache dauerhaft?', fristTage: 14 },
  { key: 'D6', titel: 'Umsetzen und Wirkung prüfen', frage: 'Umgesetzt am? Wie wurde die Wirkung nachgewiesen?', fristTage: 30 },
  { key: 'D7', titel: 'Wiederholung verhindern', frage: 'Was ändert sich an Arbeitsanweisung, Prüfplan, Schulung, bei ähnlichen Produkten?', fristTage: 45 },
  { key: 'D8', titel: 'Abschluss', frage: 'Team würdigen, Kunde informiert, Reklamation abgeschlossen.', fristTage: 60 },
];

export const HINWEIS_8D =
  'Die Fristen je Schritt sind übliche Richtwerte (Sofortmaßnahme binnen 24 Stunden, Ursache binnen 10 Tagen). ' +
  'Vorgaben Ihres Kunden gehen vor — tragen Sie sie dann als eigene Frist ein.';

export type SchrittEintrag = { text?: string | null; erledigt_am?: string | null; frist?: string | null };
export type Schritte = Partial<Record<SchrittKey, SchrittEintrag>>;

export type Reklamation = {
  id?: string;
  nummer?: string | null;
  richtung?: Richtung | string | null;
  eingang_am?: string | null;
  schritte?: Schritte | null;
  wirksam?: boolean | null;
  abgeschlossen_am?: string | null;
  lieferant_id?: string | null;
  kosten?: number | string | null;
};

/** Nächste Nummer R-JJJJ-NNN. Lücken werden nicht aufgefüllt (Nachvollziehbarkeit). */
export function naechsteNummer(vorhanden: (string | null | undefined)[], jahr: number): string {
  const re = new RegExp(`^R-${jahr}-(\\d+)$`);
  let max = 0;
  for (const n of vorhanden ?? []) {
    const m = typeof n === 'string' ? n.trim().match(re) : null;
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `R-${jahr}-${String(max + 1).padStart(3, '0')}`;
}

/** Frist eines Schritts: eigene Frist vor Richtwert (Eingang + Tage). */
export function schrittFrist(r: Reklamation, key: SchrittKey): string | null {
  const eigen = r.schritte?.[key]?.frist;
  if (istIsoDatum(eigen)) return eigen.slice(0, 10);
  const s = SCHRITTE.find((x) => x.key === key);
  if (!s || s.fristTage == null || !istIsoDatum(r.eingang_am)) return null;
  return plusTage(r.eingang_am, s.fristTage);
}

export function schrittErledigt(r: Reklamation, key: SchrittKey): boolean {
  return istIsoDatum(r.schritte?.[key]?.erledigt_am);
}

/** Der erste offene Schritt (Reihenfolge D1..D8), null wenn alles erledigt. */
export function naechsterSchritt(r: Reklamation): SchrittKey | null {
  for (const s of SCHRITTE) if (!schrittErledigt(r, s.key)) return s.key;
  return null;
}

export type SchrittStand = { key: SchrittKey; titel: string; erledigt: boolean; frist: string | null; ueberfaellig: boolean; restTage: number | null };

export function schrittStaende(r: Reklamation, heute: string): SchrittStand[] {
  return SCHRITTE.map((s) => {
    const erledigt = schrittErledigt(r, s.key);
    const frist = schrittFrist(r, s.key);
    const restTage = frist && !erledigt ? tageZwischen(heute, frist) : null;
    return { key: s.key, titel: s.titel, erledigt, frist, ueberfaellig: restTage != null && restTage < 0, restTage };
  });
}

/** Darf D8 gesetzt werden? Liefert die Gründe, warum nicht. */
export function abschlussSperre(r: Reklamation): string[] {
  const gruende: string[] = [];
  for (const s of SCHRITTE) {
    if (s.key === 'D8') continue;
    if (!schrittErledigt(r, s.key)) gruende.push(`${s.key} ${s.titel} ist noch offen`);
    else if (!String(r.schritte?.[s.key]?.text ?? '').trim()) gruende.push(`${s.key} ${s.titel} hat keinen Text`);
  }
  if (r.wirksam !== true) gruende.push('Die Wirksamkeit der Abstellmaßnahme (D6) ist nicht bestätigt');
  return gruende;
}

export type RekStatus = 'offen' | 'in_arbeit' | 'abgeschlossen';

export function rekStatus(r: Reklamation): RekStatus {
  if (istIsoDatum(r.abgeschlossen_am) || schrittErledigt(r, 'D8')) return 'abgeschlossen';
  return SCHRITTE.some((s) => schrittErledigt(r, s.key)) ? 'in_arbeit' : 'offen';
}

export type RekZahlen = { offen: number; ueberfaellig: number; abgeschlossen: number; kosten: number; mittlereTage: number | null };

export function rekZahlen(liste: Reklamation[], heute: string): RekZahlen {
  let offen = 0, ueberfaellig = 0, abgeschlossen = 0, kosten = 0;
  const dauern: number[] = [];
  for (const r of liste ?? []) {
    const st = rekStatus(r);
    kosten += zahl(r.kosten) ?? 0;
    if (st === 'abgeschlossen') {
      abgeschlossen++;
      const ende = istIsoDatum(r.abgeschlossen_am) ? r.abgeschlossen_am : r.schritte?.D8?.erledigt_am;
      if (istIsoDatum(ende) && istIsoDatum(r.eingang_am)) dauern.push(tageZwischen(r.eingang_am, ende));
      continue;
    }
    offen++;
    if (schrittStaende(r, heute).some((s) => s.ueberfaellig)) ueberfaellig++;
  }
  const mittlereTage = dauern.length ? Math.round(dauern.reduce((a, b) => a + b, 0) / dauern.length) : null;
  return { offen, ueberfaellig, abgeschlossen, kosten: Math.round(kosten * 100) / 100, mittlereTage };
}

/** 8D-Bericht als Text (für Druck/Mail) — nur, was eingetragen ist. */
export function berichtText(r: Reklamation & { gegenstand?: string | null; charge_nr?: string | null; partner?: string | null }): string {
  const zeilen: string[] = [];
  zeilen.push(`8D-Bericht ${r.nummer ?? ''}`.trim());
  const ri = RICHTUNGEN.find((x) => x.key === r.richtung);
  if (ri) zeilen.push(ri.label);
  if (r.partner) zeilen.push(`Partner: ${r.partner}`);
  if (r.gegenstand) zeilen.push(`Gegenstand: ${r.gegenstand}`);
  if (r.charge_nr) zeilen.push(`Charge: ${r.charge_nr}`);
  zeilen.push(`Eingang: ${datumDe(r.eingang_am)}`);
  zeilen.push('');
  for (const s of SCHRITTE) {
    const e = r.schritte?.[s.key];
    zeilen.push(`${s.key} ${s.titel}${istIsoDatum(e?.erledigt_am) ? ` (erledigt ${datumDe(e!.erledigt_am)})` : ' (offen)'}`);
    zeilen.push(String(e?.text ?? '').trim() || '—');
    if (s.key === 'D6') zeilen.push(`Wirksamkeit bestätigt: ${r.wirksam === true ? 'ja' : 'nein'}`);
    zeilen.push('');
  }
  return zeilen.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Lieferanten-Bewertung
// ---------------------------------------------------------------------------

export type Kriterium = 'qualitaet' | 'liefertreue' | 'preis' | 'service';

export const KRITERIEN: { key: Kriterium; label: string; frage: string; gewicht: number }[] = [
  { key: 'qualitaet', label: 'Qualität', frage: 'Stimmt die Ware? Wie oft musste reklamiert werden?', gewicht: 40 },
  { key: 'liefertreue', label: 'Liefertreue', frage: 'Kommt die Ware pünktlich und vollständig?', gewicht: 30 },
  { key: 'preis', label: 'Preis', frage: 'Preis-Leistung, Preisstabilität, Konditionen', gewicht: 15 },
  { key: 'service', label: 'Service', frage: 'Erreichbarkeit, Reaktion bei Problemen, Unterlagen', gewicht: 15 },
];

/** Punkte je Kriterium: 1 (schlecht) bis 5 (sehr gut). */
export type Noten = Partial<Record<Kriterium, number | null>>;

export function gueltigeNote(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * Gesamtwert 0–100. Nur bewertete Kriterien zählen, die Gewichte werden auf
 * sie umgelegt. Fehlt die Qualität, gibt es KEINEN Gesamtwert (null) —
 * ein Lieferant ohne Qualitätsurteil darf nicht „A" werden.
 */
export function gesamtWert(noten: Noten, gewichte?: Partial<Record<Kriterium, number>>): number | null {
  if (gueltigeNote(noten.qualitaet) == null) return null;
  let summe = 0, gewSumme = 0;
  for (const k of KRITERIEN) {
    const n = gueltigeNote(noten[k.key]);
    if (n == null) continue;
    const g = Math.max(0, Number(gewichte?.[k.key] ?? k.gewicht) || 0);
    summe += ((n - 1) / 4) * 100 * g;
    gewSumme += g;
  }
  return gewSumme > 0 ? Math.round(summe / gewSumme) : null;
}

export type Klasse = 'A' | 'B' | 'C';

export function klasse(wert: number | null): Klasse | null {
  if (wert == null) return null;
  if (wert >= 80) return 'A';
  if (wert >= 60) return 'B';
  return 'C';
}

export const KLASSEN_TEXT: Record<Klasse, string> = {
  A: 'Bevorzugter Lieferant — weiter so.',
  B: 'Gespräch führen, Ziele vereinbaren, in einem halben Jahr neu bewerten.',
  C: 'Maßnahmenplan mit Frist oder Ersatz suchen; Wareneingang verschärft prüfen.',
};

/**
 * Plausibilität: Wer im Bewertungszeitraum Reklamationen hatte, sollte in der
 * Qualität keine 5 bekommen — Hinweis, keine Sperre.
 */
export function bewertungsHinweise(noten: Noten, reklamationenImZeitraum: number): string[] {
  const h: string[] = [];
  const q = gueltigeNote(noten.qualitaet);
  if (q == null) h.push('Qualität ist nicht bewertet — ohne sie gibt es keinen Gesamtwert.');
  if (q === 5 && reklamationenImZeitraum > 0) h.push(`Qualität mit 5 bewertet, obwohl ${reklamationenImZeitraum} Reklamation${reklamationenImZeitraum === 1 ? '' : 'en'} im Zeitraum vorliegen.`);
  if (q != null && q >= 4 && reklamationenImZeitraum >= 3) h.push('Drei oder mehr Reklamationen — Qualität bitte kritisch prüfen.');
  return h;
}

/** Reklamationen gegen einen Lieferanten in den letzten `tage` Tagen. */
export function reklamationenGegen(lieferantId: string, liste: Reklamation[], heute: string, tage = 365): number {
  const ab = plusTage(heute, -tage);
  return (liste ?? []).filter((r) => r.richtung === 'lieferant' && r.lieferant_id === lieferantId
    && istIsoDatum(r.eingang_am) && r.eingang_am.slice(0, 10) >= ab).length;
}

/** Neubewertung fällig? A jährlich, B/C halbjährlich, nie bewertet = fällig. */
export function bewertungFaellig(letzte: { datum?: string | null; klasse?: string | null } | null | undefined, heute: string): { faellig: boolean; am: string | null } {
  if (!letzte || !istIsoDatum(letzte.datum)) return { faellig: true, am: null };
  const tage = letzte.klasse === 'A' ? 365 : 182;
  const am = plusTage(letzte.datum, tage);
  return { faellig: am <= heute, am };
}

// ---------------------------------------------------------------------------
// Rückruf über Chargen
// ---------------------------------------------------------------------------

export type Los = { id: string; charge_nr: string; bezeichnung?: string | null; menge?: number | string | null; einheit?: string | null; status?: string | null };
export type Verwendung = { id?: string; los_id: string; richtung?: string | null; referenz?: string | null; menge?: number | string | null; datum?: string | null };

export function normCharge(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/^(charge|ch\.?|los)\s*[:#-]?\s*/i, '').replace(/[\s\-_/.:]/g, '');
}

/**
 * Welche Chargen sind betroffen? Die Ausgangs-Charge und jede Charge, in die
 * sie als Eingang (Rohstoff) eingeflossen ist — über beliebig viele Stufen.
 * Verknüpft wird über die Chargen-Nummer im Feld „Referenz" des Eingangs.
 */
export function betroffeneChargen(startId: string, lose: Los[], verwendungen: Verwendung[]): Los[] {
  const nachId = new Map((lose ?? []).map((l) => [l.id, l]));
  const start = nachId.get(startId);
  if (!start) return [];
  const ergebnis: Los[] = [start];
  const gesehen = new Set([start.id]);
  const warteschlange = [start];
  while (warteschlange.length) {
    const aktuell = warteschlange.shift()!;
    const nr = normCharge(aktuell.charge_nr);
    if (!nr) continue;
    for (const v of verwendungen ?? []) {
      if ((v.richtung ?? 'ausgang') !== 'eingang') continue;
      if (normCharge(v.referenz) !== nr) continue;
      const ziel = nachId.get(v.los_id);
      if (ziel && !gesehen.has(ziel.id)) {
        gesehen.add(ziel.id);
        ergebnis.push(ziel);
        warteschlange.push(ziel);
      }
    }
  }
  return ergebnis;
}

export type Abnehmer = { los_id: string; charge_nr: string; referenz: string; menge: number | null; datum: string | null };

/** Alle Ausgänge (Lieferungen/Aufträge) der betroffenen Chargen. */
export function abnehmerListe(betroffen: Los[], verwendungen: Verwendung[]): Abnehmer[] {
  const ids = new Map(betroffen.map((l) => [l.id, l]));
  return (verwendungen ?? [])
    .filter((v) => (v.richtung ?? 'ausgang') === 'ausgang' && ids.has(v.los_id))
    .map((v) => ({
      los_id: v.los_id, charge_nr: ids.get(v.los_id)!.charge_nr, referenz: String(v.referenz ?? '').trim() || '(ohne Angabe)',
      menge: zahl(v.menge), datum: istIsoDatum(v.datum) ? v.datum.slice(0, 10) : null,
    }))
    .sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? '') || a.referenz.localeCompare(b.referenz));
}

export type Bilanz = { hergestellt: number | null; ausgeliefert: number; zurueck: number; imHaus: number | null; draussen: number; ohneMenge: number; vollstaendig: boolean };

/**
 * Mengenbilanz einer Charge: hergestellt, ausgeliefert, zurückgeholt.
 * „draußen" = ausgeliefert − zurück. Vollständig erst, wenn nichts mehr draußen ist.
 * Mehr zurück als ausgeliefert wird nicht still gekappt, sondern bleibt sichtbar (draußen < 0).
 * Eine Auslieferung OHNE Menge macht die Bilanz unvollständig — sonst sähe
 * „nichts mehr draußen" grün aus, obwohl niemand weiß, wie viel draußen ist.
 */
export function mengenBilanz(hergestellt: unknown, ausgaenge: Abnehmer[], zurueckJeReferenz: Record<string, unknown>): Bilanz {
  const h = zahl(hergestellt);
  const ausgeliefert = (ausgaenge ?? []).reduce((s, a) => s + (a.menge ?? 0), 0);
  const zurueck = Object.values(zurueckJeReferenz ?? {}).reduce<number>((s, x) => s + (zahl(x) ?? 0), 0);
  const draussen = Math.round((ausgeliefert - zurueck) * 1000) / 1000;
  const imHaus = h == null ? null : Math.round((h - ausgeliefert) * 1000) / 1000;
  const ohneMenge = (ausgaenge ?? []).filter((a) => a.menge == null).length;
  return { hergestellt: h, ausgeliefert: Math.round(ausgeliefert * 1000) / 1000, zurueck: Math.round(zurueck * 1000) / 1000, imHaus, draussen, ohneMenge, vollstaendig: draussen <= 0 && ohneMenge === 0 };
}

export type RueckrufArt = 'lebensmittel' | 'produkt';

export const RUECKRUF_SCHRITTE: Record<RueckrufArt, { key: string; text: string; grundlage?: string }[]> = {
  lebensmittel: [
    { key: 'sperren', text: 'Betroffene Chargen sofort sperren — auch Rohware und Halbfertigware' },
    { key: 'umfang', text: 'Umfang festlegen: welche Chargen, welche Abnehmer, welche Mengen' },
    { key: 'behoerde', text: 'Zuständige Lebensmittelüberwachung unverzüglich informieren', grundlage: 'Art. 19 VO (EG) 178/2002, § 44 Abs. 4 LFGB' },
    { key: 'abnehmer', text: 'Alle Abnehmer informieren und Ware zurücknehmen lassen' },
    { key: 'verbraucher', text: 'Wenn Ware beim Verbraucher ist: Verbraucher informieren (Aushang, Presse, Behörde veröffentlicht auf lebensmittelwarnung.de)' },
    { key: 'bilanz', text: 'Mengenbilanz: hergestellt = im Haus + zurück + noch draußen' },
    { key: 'ursache', text: 'Ursache klären — als 8D-Reklamation (intern) anlegen' },
  ],
  produkt: [
    { key: 'sperren', text: 'Betroffene Chargen/Serien sofort sperren' },
    { key: 'umfang', text: 'Umfang festlegen: welche Chargen, welche Abnehmer, welche Mengen' },
    { key: 'behoerde', text: 'Gefährliches Produkt über das Safety Business Gateway der EU melden', grundlage: 'Art. 20 VO (EU) 2023/988 (GPSR)' },
    { key: 'abnehmer', text: 'Händler und Kunden informieren, Rücknahme oder Abhilfe anbieten' },
    { key: 'verbraucher', text: 'Rückrufanzeige klar und verständlich formulieren (Produkt, Gefahr, was tun)' },
    { key: 'bilanz', text: 'Mengenbilanz: ausgeliefert, zurück, noch draußen' },
    { key: 'ursache', text: 'Ursache klären — als 8D-Reklamation (intern) anlegen' },
  ],
};

export const HINWEIS_RUECKRUF =
  'Checkliste als Gedächtnisstütze — keine Rechtsberatung. Stimmen Sie Umfang und Text eines öffentlichen Rückrufs mit der Behörde ab.';

/** Fester Text an Abnehmer, Platzhalter in [ ] müssen vor dem Versand ersetzt sein. */
export function abnehmerText(art: RueckrufArt, produkt: string, chargen: string[], grund: string): string {
  const liste = chargen.filter(Boolean).join(', ') || '[Chargen-Nummern]';
  return [
    'Sehr geehrte Damen und Herren,',
    '',
    `vorsorglich rufen wir folgende Ware zurück: ${produkt.trim() || '[Produkt]'}, Charge(n) ${liste}.`,
    `Grund: ${grund.trim() || '[Grund]'}`,
    '',
    art === 'lebensmittel'
      ? 'Bitte nehmen Sie die Ware sofort aus dem Verkauf, verwenden Sie sie nicht weiter und teilen Sie uns die noch vorhandene Menge mit.'
      : 'Bitte verkaufen und verwenden Sie die Ware nicht weiter und teilen Sie uns die noch vorhandene Menge mit.',
    'Wir holen die Ware ab bzw. erstatten den Kaufpreis: [Abwicklung].',
    '',
    'Für Rückfragen: [Ansprechpartner, Telefon].',
    '',
    'Mit freundlichen Grüßen',
    '[Firma]',
  ].join('\n');
}

export function offenePlatzhalter(text: string): string[] {
  return [...new Set((String(text ?? '').match(/\[[^\]]{1,60}\]/g) ?? []))];
}

// ---------------------------------------------------------------------------
// MHD-Warnung (Industrie- und Lebensmittel-Chargen in einer Liste)
// ---------------------------------------------------------------------------

export type MhdQuelle = { id: string; quelle: 'charge_los' | 'lm_chargen'; bezeichnung: string; charge_nr?: string | null; mhd?: string | null; status?: string | null; menge?: number | string | null; einheit?: string | null };
export type MhdEintrag = MhdQuelle & { restTage: number; stufe: 'abgelaufen' | 'heute' | 'bald' };

/**
 * Chargen mit MHD bis `tage` Tage in der Zukunft, abgelaufene zuerst.
 * Verbrauchte und gesperrte Chargen fehlen (die sind nicht mehr im Verkauf).
 */
export function mhdWarnungen(liste: MhdQuelle[], heute: string, tage = 14): MhdEintrag[] {
  const aus: MhdEintrag[] = [];
  for (const c of liste ?? []) {
    if (!istIsoDatum(c.mhd)) continue;
    const st = String(c.status ?? '').toLowerCase();
    if (st === 'verbraucht' || st === 'gesperrt') continue;
    const rest = tageZwischen(heute, c.mhd);
    if (rest > tage) continue;
    aus.push({ ...c, mhd: c.mhd.slice(0, 10), restTage: rest, stufe: rest < 0 ? 'abgelaufen' : rest === 0 ? 'heute' : 'bald' });
  }
  return aus.sort((a, b) => a.restTage - b.restTage || a.bezeichnung.localeCompare(b.bezeichnung));
}

// ---------------------------------------------------------------------------
// Gefahrstoffverzeichnis (§ 6 GefStoffV)
// ---------------------------------------------------------------------------

export const PIKTOGRAMME: { key: string; label: string }[] = [
  { key: 'GHS01', label: 'Explodierende Bombe' },
  { key: 'GHS02', label: 'Flamme' },
  { key: 'GHS03', label: 'Flamme über Kreis' },
  { key: 'GHS04', label: 'Gasflasche' },
  { key: 'GHS05', label: 'Ätzwirkung' },
  { key: 'GHS06', label: 'Totenkopf' },
  { key: 'GHS07', label: 'Ausrufezeichen' },
  { key: 'GHS08', label: 'Gesundheitsgefahr' },
  { key: 'GHS09', label: 'Umwelt' },
];

export const MENGENBEREICHE = ['bis 1 kg/l', '1–10 kg/l', '10–100 kg/l', '100–1.000 kg/l', 'über 1.000 kg/l'];

export type Gefahrstoff = {
  id?: string;
  bezeichnung?: string | null;
  hersteller?: string | null;
  h_saetze?: string | null;
  piktogramme?: string[] | null;
  signalwort?: string | null;
  mengenbereich?: string | null;
  arbeitsbereiche?: string | null;
  sdb_datum?: string | null;
  betriebsanweisung_am?: string | null;
  ersatz_geprueft_am?: string | null;
};

/** H- und EUH-Sätze aus einem freien Text: "H225, H319 / EUH066" -> ['H225','H319','EUH066']. */
export function leseHSaetze(text: unknown): string[] {
  const t = String(text ?? '').toUpperCase().replace(/\s+/g, ' ');
  const treffer = t.match(/\b(?:EUH\s?\d{3}[A-Z]?|H\s?\d{3}[A-Z]{0,2})\b/g) ?? [];
  return [...new Set(treffer.map((h) => h.replace(/\s/g, '')))];
}

/** Krebserzeugend, keimzellmutagen oder reproduktionstoxisch Kategorie 1A/1B. */
export function istCmr(hSaetze: string[]): boolean {
  return hSaetze.some((h) => /^H(340|350|350I|360[A-Z]{0,2})$/i.test(h));
}

export type GefahrPruefung = { stufe: 'rot' | 'gelb' | 'gruen'; fehler: string[]; hinweise: string[]; cmr: boolean };

/**
 * Prüft einen Eintrag. Pflicht (§ 6 GefStoffV): Bezeichnung, Einstufung/gefährliche
 * Eigenschaften, Mengenbereich, Arbeitsbereiche; Verweis aufs Sicherheitsdatenblatt.
 * Betriebsanweisung (§ 14 GefStoffV) fehlt -> rot. SDB älter als 3 Jahre -> gelb
 * (Richtwert: beim Lieferanten nach der aktuellen Fassung fragen).
 */
export function pruefeGefahrstoff(g: Gefahrstoff, heute: string): GefahrPruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const h = leseHSaetze(g.h_saetze);
  const pikt = (g.piktogramme ?? []).filter((p) => PIKTOGRAMME.some((x) => x.key === p));
  if (!String(g.bezeichnung ?? '').trim()) fehler.push('Bezeichnung fehlt');
  if (h.length === 0 && pikt.length === 0) fehler.push('Einstufung fehlt (H-Sätze oder Piktogramme aus Abschnitt 2 des Sicherheitsdatenblatts)');
  if (!String(g.mengenbereich ?? '').trim()) fehler.push('Mengenbereich fehlt');
  if (!String(g.arbeitsbereiche ?? '').trim()) fehler.push('Arbeitsbereiche fehlen');
  if (!istIsoDatum(g.sdb_datum)) fehler.push('Sicherheitsdatenblatt fehlt (Datum der Fassung eintragen)');
  else if (tageZwischen(g.sdb_datum, heute) > 3 * 365) hinweise.push(`Sicherheitsdatenblatt vom ${datumDe(g.sdb_datum)} — beim Lieferanten nach der aktuellen Fassung fragen`);
  if (!istIsoDatum(g.betriebsanweisung_am)) fehler.push('Betriebsanweisung fehlt (§ 14 GefStoffV) — und darin unterweisen');
  const cmr = istCmr(h);
  if (cmr) {
    hinweise.push('Krebserzeugend, erbgutverändernd oder fortpflanzungsgefährdend (1A/1B): Ersatzstoff prüfen, Expositionsverzeichnis führen (40 Jahre aufbewahren)');
    if (!istIsoDatum(g.ersatz_geprueft_am)) fehler.push('Ersatzstoffprüfung für CMR-Stoff nicht dokumentiert');
  }
  return { stufe: fehler.length ? 'rot' : hinweise.length ? 'gelb' : 'gruen', fehler, hinweise, cmr };
}

/** Verzeichnis als Tabelle (für CSV/Druck). */
export function verzeichnisZeilen(liste: Gefahrstoff[]): string[][] {
  const kopf = ['Bezeichnung', 'Hersteller', 'H-Sätze', 'Piktogramme', 'Signalwort', 'Mengenbereich', 'Arbeitsbereiche', 'Sicherheitsdatenblatt vom', 'Betriebsanweisung vom'];
  const zeilen = [...(liste ?? [])]
    .sort((a, b) => String(a.bezeichnung ?? '').localeCompare(String(b.bezeichnung ?? ''), 'de'))
    .map((g) => [
      String(g.bezeichnung ?? ''), String(g.hersteller ?? ''), leseHSaetze(g.h_saetze).join(', '),
      (g.piktogramme ?? []).join(', '), String(g.signalwort ?? ''), String(g.mengenbereich ?? ''),
      String(g.arbeitsbereiche ?? ''), datumDe(g.sdb_datum), datumDe(g.betriebsanweisung_am),
    ]);
  return [kopf, ...zeilen];
}
