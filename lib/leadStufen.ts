// ============================================================================
// ARGONAUT OS · lib/leadStufen.ts — feste Stufen statt freier Statusspalte
// (Vertrieb · C3)
//
// Der Status einer Anfrage war bisher Freitext. Damit laesst sich zaehlen, aber
// nicht rechnen: Wieviele der Anfragen werden zu Terminen, wieviele Termine
// finden statt, wieviele davon werden Kunde? Genau diese drei Quoten sind die
// Grundlage jeder Planung — und die Zahlen, die im Termin-Wert-Rechner
// eingetragen werden.
//
// Die Leiter hat vier Sprossen plus einen Seitenausstieg:
//   eintragung -> termin_gebucht -> termin_gehalten -> kunde
//                                                    \-> verloren
//
// Die alte Spalte `status` bleibt unberuehrt und weiter in Benutzung.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEIN Cross-Import —
// pure, node-testbare Funktionen.
// ============================================================================

export type Stufe = 'eintragung' | 'termin_gebucht' | 'termin_gehalten' | 'kunde' | 'verloren';

/** Die Leiter in ihrer Reihenfolge — ohne den Seitenausstieg 'verloren'. */
export const STUFEN_LEITER: Stufe[] = ['eintragung', 'termin_gebucht', 'termin_gehalten', 'kunde'];

/** Alle Stufen inklusive Seitenausstieg, fuer Filter und Umschalter. */
export const STUFEN_ALLE: Stufe[] = [...STUFEN_LEITER, 'verloren'];

export const STUFEN_INFO: Record<Stufe, { label: string; kurz: string; farbe: string }> = {
  eintragung:      { label: 'Anfrage',          kurz: 'Anfrage',   farbe: '#00e5ff' },
  termin_gebucht:  { label: 'Termin gebucht',   kurz: 'Gebucht',   farbe: '#C9A84C' },
  termin_gehalten: { label: 'Termin gehalten',  kurz: 'Gehalten',  farbe: '#e0a24c' },
  kunde:           { label: 'Kunde',            kurz: 'Kunde',     farbe: '#4CAF7D' },
  verloren:        { label: 'Verloren',         kurz: 'Verloren',  farbe: '#E06666' },
};

export function istStufe(v: unknown): v is Stufe {
  return typeof v === 'string' && (STUFEN_ALLE as string[]).includes(v);
}

/** Fehlt oder Unsinn -> 'eintragung'. Es wird nie geraten. */
export function stufeOderStandard(v: unknown): Stufe {
  return istStufe(v) ? v : 'eintragung';
}

/**
 * Aus dem alten Freitext-Status ableiten — bewusst nur die zwei Faelle, die
 * eindeutig sind. Genau dieselbe Regel wie bei der einmaligen Erstbefuellung
 * in der Datenbank, damit Anzeige und Bestand nie auseinanderlaufen.
 */
export function stufeAusStatus(status: unknown): Stufe {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'gewonnen' || s === 'kunde') return 'kunde';
  if (s === 'verloren') return 'verloren';
  return 'eintragung';
}

/** Rang auf der Leiter; 'verloren' steht daneben (-1). */
export function rang(stufe: Stufe): number {
  return stufe === 'verloren' ? -1 : STUFEN_LEITER.indexOf(stufe);
}

/** Die naechste Sprosse, oder null am Ende bzw. bei 'verloren'. */
export function naechsteStufe(stufe: Stufe): Stufe | null {
  const i = rang(stufe);
  if (i < 0 || i >= STUFEN_LEITER.length - 1) return null;
  return STUFEN_LEITER[i + 1];
}

export type Meilensteine = {
  termin_gebucht_am?: string | null;
  termin_gehalten_am?: string | null;
  kunde_seit?: string | null;
};

/**
 * Was beim Setzen einer Stufe in die Datenbank geschrieben wird.
 *
 * Wichtig: ein Meilenstein wird nur gesetzt, wenn er noch leer ist. Wer eine
 * Stufe versehentlich zurueckstellt und wieder vorwaerts, verliert damit NICHT
 * das echte Datum von damals — sonst waeren alle spaeteren Auswertungen falsch.
 */
export function feldwerteFuerStufe(
  stufe: Stufe,
  jetztIso: string,
  bisher: Meilensteine = {},
): Record<string, string | null> {
  const felder: Record<string, string | null> = {
    stufe,
    stufe_geaendert_am: jetztIso,
  };
  const r = rang(stufe);
  if (r >= rang('termin_gebucht') && !bisher.termin_gebucht_am) felder.termin_gebucht_am = jetztIso;
  if (r >= rang('termin_gehalten') && !bisher.termin_gehalten_am) felder.termin_gehalten_am = jetztIso;
  if (stufe === 'kunde' && !bisher.kunde_seit) felder.kunde_seit = jetztIso;
  return felder;
}

export type LeadStufeRoh = { stufe?: unknown; status?: unknown };

export type StufenZeile = { stufe: Stufe; label: string; farbe: string; anzahl: number; erreicht: number };

export type StufenTrichter = {
  gesamt: number;
  zeilen: StufenZeile[];
  verloren: number;
  /** Die drei Quoten in Prozent — null, wenn die Grundlage fehlt. */
  quoteAnfrageZuTermin: number | null;
  quoteTerminGehalten: number | null;
  quoteAbschluss: number | null;
};

function prozent(zaehler: number, nenner: number): number | null {
  if (nenner <= 0) return null;
  return Math.round((zaehler / nenner) * 1000) / 10;
}

/**
 * Zaehlt die Anfragen je Stufe und rechnet die drei Uebergangsquoten.
 *
 * „erreicht" heisst kumulativ: wer Kunde ist, hat auch Termin gebucht und
 * gehalten. Nur so ergeben die Quoten einen Trichter statt einer Momentaufnahme.
 * Anfragen ohne gesetzte Stufe werden aus dem alten Status abgeleitet, damit
 * Bestandsdaten nicht aus der Auswertung fallen.
 */
export function stufenTrichter(leads: LeadStufeRoh[] | null | undefined): StufenTrichter {
  const rows = leads || [];
  const zaehler: Record<Stufe, number> = {
    eintragung: 0, termin_gebucht: 0, termin_gehalten: 0, kunde: 0, verloren: 0,
  };
  for (const l of rows) {
    const s = istStufe(l?.stufe) ? l.stufe : stufeAusStatus(l?.status);
    zaehler[s] += 1;
  }

  const gesamt = rows.length;
  const erreichtTermin = zaehler.termin_gebucht + zaehler.termin_gehalten + zaehler.kunde;
  const erreichtGehalten = zaehler.termin_gehalten + zaehler.kunde;
  const kunden = zaehler.kunde;

  const erreichtJe: Record<Stufe, number> = {
    eintragung: gesamt,
    termin_gebucht: erreichtTermin,
    termin_gehalten: erreichtGehalten,
    kunde: kunden,
    verloren: zaehler.verloren,
  };

  return {
    gesamt,
    zeilen: STUFEN_LEITER.map((s) => ({
      stufe: s,
      label: STUFEN_INFO[s].label,
      farbe: STUFEN_INFO[s].farbe,
      anzahl: zaehler[s],
      erreicht: erreichtJe[s],
    })),
    verloren: zaehler.verloren,
    quoteAnfrageZuTermin: prozent(erreichtTermin, gesamt),
    quoteTerminGehalten: prozent(erreichtGehalten, erreichtTermin),
    quoteAbschluss: prozent(kunden, erreichtGehalten),
  };
}
