// ============================================================================
// ARGONAUT OS · lib/terminWert.ts — Was darf eine Anfrage kosten?
// (Marketing · Termin-Wert-Rechner)
//
// Beantwortet die eine Frage, an der jede Werbeentscheidung haengt:
// Wieviel darf mich eine Eintragung, ein gebuchter und ein gehaltener Termin
// kosten, damit unter dem Strich Geld uebrig bleibt?
//
// Gerechnet wird rueckwaerts vom Kundenwert ueber die drei Quoten:
//   Eintragung --(Eintragungsquote)--> gebuchter Termin
//   gebuchter Termin --(Erscheinungsquote)--> gehaltener Termin
//   gehaltener Termin --(Abschlussquote)--> Kunde
//
// Ehrlich statt schoenrechnen: fehlt eine Quote oder ist sie 0, bleibt das
// Ergebnis null (nicht 0). Es wird nie durch 0 geteilt und nichts geschaetzt.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEIN Cross-Import —
// pure, node-testbare Funktionen (Muster wie lib/marketingRoi.ts).
// ============================================================================

/** Nicht-negative Zahl aus Zahl/String (Komma/Punkt), sonst 0. */
export function zahl(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function runde2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Eine Quote in Prozent: nur 0 < q <= 100 ist brauchbar, sonst null.
 * Damit kann eine fehlende Angabe nie zu einer erfundenen Zahl fuehren.
 */
export function quote(v: unknown): number | null {
  const n = zahl(v);
  if (n <= 0 || n > 100) return null;
  return n;
}

export type KundenwertEingabe = {
  monatlich?: unknown;
  monate?: unknown;
  einmalig?: unknown;
};

/**
 * Kundenwert ueber die betrachtete Laufzeit: wiederkehrender Betrag mal Monate
 * plus einmalige Einrichtung. Monate werden auf 1..120 begrenzt (Standard 12) —
 * eine Betrachtung ueber zehn Jahre hinaus ist keine Planung mehr.
 */
export function kundenwert(e: KundenwertEingabe): number {
  const monatlich = zahl(e?.monatlich);
  const einmalig = zahl(e?.einmalig);
  const roh = zahl(e?.monate);
  const monate = roh <= 0 ? 12 : Math.min(120, Math.floor(roh));
  return runde2(monatlich * monate + einmalig);
}

export type QuotenEingabe = {
  /** Prozent: gehaltener Termin -> Kunde */
  abschluss?: unknown;
  /** Prozent: gebuchter Termin -> gehaltener Termin */
  erscheinen?: unknown;
  /** Prozent: Eintragung -> gebuchter Termin */
  eintragung?: unknown;
};

export type Trichter = {
  kundenwert: number;
  /** Wieviele Stufen-Ereignisse braucht es fuer EINEN Kunden. */
  gehalteneTermine: number | null;
  gebuchteTermine: number | null;
  eintragungen: number | null;
  /** Was eine einzelne Stufe wert ist — zugleich die Obergrenze der Kosten. */
  wertJeGehaltenem: number | null;
  wertJeGebuchtem: number | null;
  wertJeEintragung: number | null;
};

/**
 * Kernstueck: rechnet vom Kundenwert rueckwaerts durch die drei Quoten.
 * Jede Stufe faellt einzeln aus, wenn ihre Quote fehlt — die Stufen davor
 * bleiben gueltig.
 */
export function trichter(wert: unknown, q: QuotenEingabe): Trichter {
  const kw = zahl(wert);
  const qa = quote(q?.abschluss);
  const qe = quote(q?.erscheinen);
  const qi = quote(q?.eintragung);

  const gehalten = qa == null ? null : runde2(100 / qa);
  const gebucht = gehalten == null || qe == null ? null : runde2(gehalten * (100 / qe));
  const eintragungen = gebucht == null || qi == null ? null : runde2(gebucht * (100 / qi));

  return {
    kundenwert: runde2(kw),
    gehalteneTermine: gehalten,
    gebuchteTermine: gebucht,
    eintragungen,
    wertJeGehaltenem: kw > 0 && gehalten ? runde2(kw / gehalten) : null,
    wertJeGebuchtem: kw > 0 && gebucht ? runde2(kw / gebucht) : null,
    wertJeEintragung: kw > 0 && eintragungen ? runde2(kw / eintragungen) : null,
  };
}

/**
 * Obergrenze ist nicht gleich Zielpreis: wer genau den vollen Wert ausgibt,
 * arbeitet umsonst. Standard sind 33 Prozent des Werts — ein Drittel fuer die
 * Gewinnung, zwei Drittel bleiben fuer Leistung und Gewinn.
 */
export function zielpreis(wertJeStufe: number | null, anteilProzent: unknown = 33): number | null {
  if (wertJeStufe == null || wertJeStufe <= 0) return null;
  const a = quote(anteilProzent);
  if (a == null) return null;
  return runde2(wertJeStufe * (a / 100));
}

export type KostenAmpel = 'gut' | 'knapp' | 'verlust' | 'offen';

/**
 * Vergleicht tatsaechliche Kosten mit dem Wert der Stufe.
 * bis 50 % des Werts gut · bis 100 % knapp · darueber Verlust.
 */
export function bewerteKosten(kosten: unknown, wertJeStufe: number | null): { ampel: KostenAmpel; anteil: number | null } {
  const k = zahl(kosten);
  if (k <= 0 || wertJeStufe == null || wertJeStufe <= 0) return { ampel: 'offen', anteil: null };
  const anteil = runde2((k / wertJeStufe) * 100);
  if (anteil > 100) return { ampel: 'verlust', anteil };
  if (anteil > 50) return { ampel: 'knapp', anteil };
  return { ampel: 'gut', anteil };
}

/**
 * Fuer Kanaele ohne Geldeinsatz, aber mit Zeiteinsatz: was ist eine einzelne
 * Aktivitaet wert (Anruf, Nachricht, Vernetzung)? Auch die, bei der niemand
 * antwortet — genau das macht Kaltakquise zu Mathematik statt Ueberwindung.
 */
export function wertJeAktivitaet(wert: unknown, aktivitaetenJeKunde: unknown): number | null {
  const kw = zahl(wert);
  const n = zahl(aktivitaetenJeKunde);
  if (kw <= 0 || n <= 0) return null;
  return runde2(kw / n);
}

/**
 * Wieviele Eintragungen braucht es fuer ein Umsatzziel — die Gegenrichtung,
 * fuer die Monats- und Wochenplanung.
 */
export function bedarfFuerZiel(zielUmsatz: unknown, t: Trichter): { kunden: number | null; termine: number | null; eintragungen: number | null } {
  const ziel = zahl(zielUmsatz);
  if (ziel <= 0 || t.kundenwert <= 0) return { kunden: null, termine: null, eintragungen: null };
  const kunden = runde2(ziel / t.kundenwert);
  return {
    kunden,
    termine: t.gebuchteTermine == null ? null : Math.ceil(kunden * t.gebuchteTermine),
    eintragungen: t.eintragungen == null ? null : Math.ceil(kunden * t.eintragungen),
  };
}
