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
// ============================================================================

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
  return aktiv && (Number(v.betrag_netto) || 0) > 0;
}

/**
 * Die Rechnungs-Position(en) fuer einen Wartungsvertrag. Aktuell genau eine
 * Pauschal-Position aus betrag_netto + mwst_satz. Gibt [] zurueck, wenn kein
 * abrechenbarer Betrag hinterlegt ist.
 */
export function wartungPositionen(v: WartungAbrechenbar): WiederkehrPosition[] {
  const betrag = Number(v.betrag_netto) || 0;
  if (betrag <= 0) return [];

  const satzRoh = Number(v.mwst_satz);
  const satz = Number.isFinite(satzRoh) && satzRoh >= 0 ? satzRoh : MWST_STD;

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
  if ((Number(v.betrag_netto) || 0) <= 0) return { darf: false, grund: 'Kein Betrag hinterlegt.' };

  const letzte = v.letzte_abrechnung_am ? v.letzte_abrechnung_am.slice(0, 10) : null;
  if (!letzte) return { darf: true, grund: 'Noch nie abgerechnet.' };

  const intervall = Number(v.intervall_monate) > 0 ? Number(v.intervall_monate) : 12;
  const sperrBis = datumPlusMonate(letzte, intervall);

  if (heuteIso.slice(0, 10) < sperrBis) {
    return { darf: false, grund: `Bereits abgerechnet — naechste Abrechnung ab ${sperrBis}.`, sperrBis };
  }
  return { darf: true, grund: 'Faellig zur Abrechnung.', sperrBis };
}

/** Netto-Summe der Positionen (reine Rechnung, ohne Rundungslogik der Route). */
export function positionenNetto(pos: WiederkehrPosition[]): number {
  return pos.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0);
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

/**
 * Intervall-Text (in allen Schreibweisen der vier Tabellen) -> Monate.
 * monat/monatlich=1 · quartal/quartalsweise=3 · jahr/jaehrlich=12 · einmalig=0.
 */
export function intervallZuMonate(text?: string | null): number {
  const t = (text || '').toLowerCase().trim();
  if (t === 'monat' || t === 'monatlich') return 1;
  if (t === 'quartal' || t === 'quartalsweise' || t === 'vierteljaehrlich' || t === 'vierteljährlich') return 3;
  if (t === 'jahr' || t === 'jaehrlich' || t === 'jährlich') return 12;
  if (t === 'einmalig') return 0;
  return 1; // sinnvoller Default: monatlich
}

/** Monatswert = Betrag / Intervall-Monate. Einmalig (0) zaehlt nicht wiederkehrend. */
export function monatswertBerechnen(betragNetto: number, intervallMonate: number): number {
  return intervallMonate > 0 ? (Number(betragNetto) || 0) / intervallMonate : 0;
}

// --- Normalisierer je Quelle ------------------------------------------------

export function normalisiereWartung(r: Record<string, unknown>): WiederkehrEintrag {
  const betragNetto = Number(r.betrag_netto) || 0;
  const intervallMonate = Number(r.intervall_monate) > 0 ? Number(r.intervall_monate) : 12;
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
  const betragNetto = pos.reduce((s, p) => s + (Number(p.menge) || 1) * (Number(p.einzelpreis) || 0), 0);
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
  const betragNetto = Number(r.betrag) || 0;
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
  const betragNetto = Number(r.kosten_betrag) || 0;
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
