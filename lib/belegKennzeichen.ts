// ============================================================================
// ARGONAUT OS · lib/belegKennzeichen.ts — Beleg-Foto je Einsatz (C1)
//
// Der Monteur steht 400 km von zuhause auf der Baustelle und kauft Material im
// Baumarkt. Heute landet der Zettel im Handschuhfach. Kuenftig: Foto am
// Einsatz, die Beleg-KI liest ihn, und der Beleg landet gleichzeitig in den
// Ausgaben (Vorsteuer, DATEV) UND am Einsatz (Nachkalkulation je Baustelle).
//
// DAS KENNZEICHEN ist der Kern dieser Datei: Material, Hotel, Sprit,
// Bewirtung oder Sonstiges steuern, in welche Ausgaben-Route der Beleg laeuft.
// Bewirtung ist der Sonderfall — dort verlangt das Gesetz Anlass und
// Teilnehmer auf dem Beleg.
//
// Bei einer unplausiblen Angabe wird GEWARNT, aber NICHT blockiert. Der Mensch
// vor Ort weiss besser, was er gekauft hat, als eine Regel im Code.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

export type Kennzeichen = 'material' | 'hotel' | 'sprit' | 'bewirtung' | 'sonstiges';

export type KennzeichenInfo = {
  schluessel: Kennzeichen;
  label: string;
  /** Wandert als Kategorie in den Beleg — daran haengt der DATEV-Vorschlag. */
  kategorie: string;
  hinweis: string;
  /** Nur Bewirtung: Anlass und Teilnehmer sind Pflichtangaben. */
  brauchtAnlass: boolean;
};

export const KENNZEICHEN: KennzeichenInfo[] = [
  {
    schluessel: 'material',
    label: 'Material',
    kategorie: 'Material',
    hinweis: 'Baumarkt, Fachhandel, Ersatzteile — geht in die Kosten dieser Baustelle.',
    brauchtAnlass: false,
  },
  {
    schluessel: 'hotel',
    label: 'Hotel / Übernachtung',
    kategorie: 'Reisekosten',
    hinweis: 'Übernachtung auf Montage. Frühstück steht auf der Rechnung oft getrennt.',
    brauchtAnlass: false,
  },
  {
    schluessel: 'sprit',
    label: 'Sprit / Tanken',
    kategorie: 'Kfz',
    hinweis: 'Tankbeleg unterwegs — auch an der Raststätte, wenn der Weg zum Lager zu weit war.',
    brauchtAnlass: false,
  },
  {
    schluessel: 'bewirtung',
    label: 'Bewirtung',
    kategorie: 'Bewirtung',
    hinweis:
      'Bewirtungskosten sind steuerlich nur teilweise abziehbar, und Anlass sowie Teilnehmer '
      + 'gehören zwingend zum Beleg. Tragen Sie beides gleich hier ein — später weiß es niemand mehr. '
      + 'Die genaue Behandlung klärt Ihre Steuerberatung.',
    brauchtAnlass: true,
  },
  {
    schluessel: 'sonstiges',
    label: 'Sonstiges',
    kategorie: 'Sonstiges',
    hinweis: 'Alles, was in keine der anderen Schubladen passt.',
    brauchtAnlass: false,
  },
];

export function istKennzeichen(v: unknown): v is Kennzeichen {
  return typeof v === 'string' && KENNZEICHEN.some((k) => k.schluessel === v);
}

export function kennzeichenInfo(v: unknown): KennzeichenInfo {
  return KENNZEICHEN.find((k) => k.schluessel === v) ?? KENNZEICHEN[KENNZEICHEN.length - 1];
}

/**
 * Vorschlag aus dem, was die Beleg-KI als Kategorie gelesen hat. Trifft nichts
 * zu, bleibt es bei 'sonstiges' — es wird nicht geraten.
 */
export function kennzeichenAusKategorie(kategorie: unknown): Kennzeichen {
  const k = String(kategorie ?? '').toLowerCase();
  if (!k.trim()) return 'sonstiges';
  if (/bewirt|restaurant|gastst|bewirtung/.test(k)) return 'bewirtung';
  if (/hotel|übernacht|uebernacht|pension|logis/.test(k)) return 'hotel';
  if (/kfz|tank|sprit|diesel|benzin|kraftstoff/.test(k)) return 'sprit';
  if (/material|baumarkt|werkstoff|ersatzteil|baustoff/.test(k)) return 'material';
  return 'sonstiges';
}

export type Pruefung = { ok: boolean; warnung: string | null };

/**
 * Plausibilitaet: passt das gewaehlte Kennzeichen zu dem, was auf dem Beleg
 * steht? Bei Zweifel gibt es einen Hinweis — aber der Beleg laeuft trotzdem
 * durch. Blockieren waere hier falsch: der Monteur weiss es besser.
 */
export function pruefePlausibel(kennzeichen: unknown, kategorie: unknown, lieferant: unknown): Pruefung {
  if (!istKennzeichen(kennzeichen)) return { ok: false, warnung: 'Bitte wählen Sie ein Kennzeichen.' };
  const text = `${String(kategorie ?? '')} ${String(lieferant ?? '')}`.trim();
  if (!text) return { ok: true, warnung: null };

  const vorschlag = kennzeichenAusKategorie(text);
  if (vorschlag === 'sonstiges' || vorschlag === kennzeichen) return { ok: true, warnung: null };

  return {
    ok: true,
    warnung:
      `Auf dem Beleg steht eher nach „${kennzeichenInfo(vorschlag).label}" aus. `
      + `Gespeichert wird trotzdem, was Sie gewählt haben — prüfen Sie es nur kurz.`,
  };
}

/** Bewirtung ohne Anlass oder Teilnehmer ist unvollstaendig. */
export function fehlendeAngaben(kennzeichen: unknown, anlass: unknown, teilnehmer: unknown): string[] {
  if (kennzeichen !== 'bewirtung') return [];
  const fehlt: string[] = [];
  if (!String(anlass ?? '').trim()) fehlt.push('Anlass');
  if (!String(teilnehmer ?? '').trim()) fehlt.push('Teilnehmer');
  return fehlt;
}

export type OcrFelder = {
  lieferant?: unknown;
  belegnummer?: unknown;
  belegdatum?: unknown;
  netto?: unknown;
  ust_betrag?: unknown;
  ust_satz?: unknown;
  brutto?: unknown;
  kategorie?: unknown;
};

export type NutzlastEingang = {
  ocr: OcrFelder;
  kennzeichen: Kennzeichen;
  einsatzId: string;
  ownerUserId: string;
  anlass?: unknown;
  teilnehmer?: unknown;
  dateiPfad?: string | null;
  standortId?: string | null;
};

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}
function zahl(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Baut die Zeile fuer eingangsbelege — pur, damit sie ohne Datenbank
 * geprueft werden kann. Die Notiz haelt fest, woher der Beleg kam; bei
 * Bewirtung stehen Anlass und Teilnehmer darin, wie es der Beleg verlangt.
 */
export function belegNutzlast(e: NutzlastEingang): Record<string, unknown> {
  const info = kennzeichenInfo(e.kennzeichen);
  const teile: string[] = [`Beleg vom Einsatz (${info.label})`];
  if (e.kennzeichen === 'bewirtung') {
    const anlass = text(e.anlass);
    const teilnehmer = text(e.teilnehmer);
    if (anlass) teile.push(`Anlass: ${anlass}`);
    if (teilnehmer) teile.push(`Teilnehmer: ${teilnehmer}`);
  }

  return {
    owner_user_id: e.ownerUserId,
    einsatz_id: e.einsatzId,
    kennzeichen: e.kennzeichen,
    bewirtung_anlass: e.kennzeichen === 'bewirtung' ? text(e.anlass) : null,
    bewirtung_teilnehmer: e.kennzeichen === 'bewirtung' ? text(e.teilnehmer) : null,
    lieferant: text(e.ocr.lieferant),
    belegnummer: text(e.ocr.belegnummer),
    belegdatum: text(e.ocr.belegdatum),
    netto: zahl(e.ocr.netto),
    ust_satz: zahl(e.ocr.ust_satz),
    ust_betrag: zahl(e.ocr.ust_betrag),
    brutto: zahl(e.ocr.brutto),
    kategorie: text(e.ocr.kategorie) ?? info.kategorie,
    notiz: teile.join(' · '),
    datei_pfad: e.dateiPfad ?? null,
    standort_id: e.standortId ?? null,
  };
}
