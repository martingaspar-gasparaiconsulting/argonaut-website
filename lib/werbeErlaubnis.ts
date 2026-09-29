// ============================================================================
// ARGONAUT OS · lib/werbeErlaubnis.ts — darf diese Adresse Werbung bekommen?
// (Paket 173, 29.09.2026 · Befunde K6, H7–H10, M7, M8)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Bis heute entschied jeder Kanal für sich, ob er schreiben darf:
//   - der Autoresponder gar nicht (frei getippte Adressen liefen sofort los),
//   - der Newsletter nur nach status = 'aktiv' (nie nach der Bestätigung),
//   - die Bewertungs-Kampagne gar nicht,
//   - Rückholung und Webinar nach kontakte.werbe_widerspruch_am,
//   - Newsletter- und Serien-Abmeldung wirkten nur im eigenen Kanal.
// Wer „keine Werbung mehr" klickt, meint aber nicht „nur diese eine Serie".
// Hier steht die EINE Entscheidung, aus drei Quellen zusammengelesen:
//   1. werbe_sperre (neu, SQL p173) — jede Abmeldung aus jedem Kanal
//   2. kontakte.werbe_widerspruch_am / werbe_einwilligung
//   3. newsletter_abonnenten (status, bestaetigt_am, abgemeldet_am, quelle)
//
// ▄▄▄ DIE REGEL ▄▄▄
// Ein Widerspruch gilt, bis eine SPÄTERE, nachweisbar bestätigte Einwilligung
// kommt (neue Double-Opt-in-Bestätigung). Eine Einwilligung ohne Datum (das
// Häkchen am Kontakt) schlägt einen Widerspruch nie — sie könnte älter sein.
// Ein Widerspruch ohne Datum gilt immer.
//
// ▄▄▄ WAS „BESTÄTIGT" BEIM NEWSLETTER HEISST ▄▄▄
// Nur Einträge, die über eine Double-Opt-in-Strecke kamen (DOI_QUELLEN) UND
// eine Bestätigung tragen. Von Hand eingetragene Adressen („manuell") zählen
// nicht als bestätigt — ob die Spalte bestaetigt_am live einen Standardwert
// hat, ist ungeklärt (Befund M8); die Quelle ist der verlässlichere Nachweis.
// Von Hand eingetragene Adressen mit Häkchen „Einwilligung" am Kontakt bleiben
// erlaubt (so kommen sie aus der CRM-Zielgruppe in die Liste).
//
// KEINE Supabase-, React- oder Next-Abhängigkeit. Reine Formeln, node-getestet.
// ============================================================================

/** Newsletter-Quellen, hinter denen eine Double-Opt-in-Bestätigung steht. */
export const DOI_QUELLEN: readonly string[] = ['opt-in', 'website', 'landingpage'];

export type SperrZeile = { email?: unknown; am?: unknown };
export type KontaktZeile = { email?: unknown; werbe_einwilligung?: unknown; werbe_widerspruch_am?: unknown };
export type AboZeile = { email?: unknown; status?: unknown; bestaetigt_am?: unknown; abgemeldet_am?: unknown; quelle?: unknown };

export type WerbeFakten = {
  sperren: SperrZeile[];
  kontakte: KontaktZeile[];
  abos: AboZeile[];
};

export type WerbeGrund = 'erlaubt' | 'widersprochen' | 'ohne_einwilligung' | 'unbekannt';

export const WERBE_GRUND_TEXT: Record<WerbeGrund, string> = {
  erlaubt: 'darf Werbung erhalten',
  widersprochen: 'hat der Werbung widersprochen oder sich abgemeldet',
  ohne_einwilligung: 'keine bestätigte Einwilligung',
  unbekannt: 'Einwilligung konnte nicht geprüft werden',
};

export type WerbeEntscheid = { erlaubt: boolean; grund: WerbeGrund };

export type PruefOptionen = {
  /**
   * Zeitpunkt, zu dem der Empfänger GENAU DIESEN Kanal bestätigt hat
   * (Freebie-, Webinar-, Dossier-Double-Opt-in). Zählt als Einwilligung und
   * hebt einen älteren Widerspruch auf.
   */
  kanalBestaetigtAm?: unknown;
  /**
   * true = der Kanal hat eine eigene Rechtsgrundlage (z. B. Bestandskunde
   * nach § 7 Abs. 3 UWG bei der Rückholung) — dann wird NUR der Widerspruch
   * geprüft, keine ausdrückliche Einwilligung verlangt.
   */
  nurWiderspruch?: boolean;
};

/** Adresse normalisieren: getrimmt, klein. */
export function normMail(v: unknown): string {
  return (typeof v === 'string' ? v : '').trim().toLowerCase();
}

/** Grobe, strenge Adressprüfung. */
export function istMail(v: unknown): boolean {
  const m = normMail(v);
  return m.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;.]+(\.[^\s@<>,;.]+)+$/.test(m);
}

function zeit(v: unknown): number | null {
  if (v == null || v === '') return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function gefuellt(v: unknown): boolean {
  return v != null && String(v).trim() !== '';
}

/** Ist dieser Newsletter-Eintrag eine nachweisbar bestätigte Anmeldung? Liefert den Zeitpunkt oder null. */
export function aboBestaetigtAm(a: AboZeile | null | undefined): number | null {
  if (!a) return null;
  if (String(a.status ?? '').trim().toLowerCase() !== 'aktiv') return null;
  if (!DOI_QUELLEN.includes(String(a.quelle ?? '').trim().toLowerCase())) return null;
  const b = zeit(a.bestaetigt_am);
  if (b === null) return null;
  const ab = zeit(a.abgemeldet_am);
  // Wiederangemeldet: die Bestätigung muss NACH der alten Abmeldung liegen.
  if (ab !== null && b <= ab) return null;
  return b;
}

type Sperre = { am: number | null };

/**
 * Die Entscheidung für EINE Adresse. Leere/kaputte Adresse = nie erlaubt.
 */
export function entscheideWerbung(emailRoh: unknown, fakten: WerbeFakten | null | undefined, opt: PruefOptionen = {}): WerbeEntscheid {
  const email = normMail(emailRoh);
  if (!istMail(email)) return { erlaubt: false, grund: 'ohne_einwilligung' };
  if (!fakten) return { erlaubt: false, grund: 'unbekannt' };

  const gleich = (v: unknown) => normMail(v) === email;
  const sperren: Sperre[] = [];
  const zustimmungen: (number | null)[] = []; // null = ohne Datum

  for (const s of fakten.sperren ?? []) {
    if (gleich(s?.email)) sperren.push({ am: zeit(s?.am) });
  }
  for (const k of fakten.kontakte ?? []) {
    if (!gleich(k?.email)) continue;
    if (gefuellt(k?.werbe_widerspruch_am)) sperren.push({ am: zeit(k?.werbe_widerspruch_am) });
    else if (k?.werbe_einwilligung === true) zustimmungen.push(null);
  }
  for (const a of fakten.abos ?? []) {
    if (!gleich(a?.email)) continue;
    const st = String(a?.status ?? '').trim().toLowerCase();
    if (st === 'abgemeldet' || st === 'widersprochen') sperren.push({ am: zeit(a?.abgemeldet_am) });
    const b = aboBestaetigtAm(a);
    if (b !== null) zustimmungen.push(b);
  }
  const kanal = zeit(opt.kanalBestaetigtAm);
  if (kanal !== null) zustimmungen.push(kanal);

  if (sperren.length > 0) {
    // Ein Widerspruch ohne Datum gilt immer.
    if (sperren.some((s) => s.am === null)) return { erlaubt: false, grund: 'widersprochen' };
    const letzte = Math.max(...sperren.map((s) => s.am as number));
    const spaeter = zustimmungen.some((z) => z !== null && z > letzte);
    if (!spaeter) return { erlaubt: false, grund: 'widersprochen' };
    return { erlaubt: true, grund: 'erlaubt' };
  }
  if (opt.nurWiderspruch === true) return { erlaubt: true, grund: 'erlaubt' };
  if (zustimmungen.length > 0) return { erlaubt: true, grund: 'erlaubt' };
  return { erlaubt: false, grund: 'ohne_einwilligung' };
}

/** Eine Liste aufteilen: wer darf, wer nicht (mit Grund). Doppelte fallen weg. */
export function teileEmpfaenger(
  emails: unknown[], fakten: WerbeFakten | null | undefined, opt: PruefOptionen = {},
): { erlaubt: string[]; abgelehnt: { email: string; grund: WerbeGrund }[] } {
  const erlaubt: string[] = [];
  const abgelehnt: { email: string; grund: WerbeGrund }[] = [];
  const gesehen = new Set<string>();
  for (const roh of emails ?? []) {
    const e = normMail(roh);
    if (!e || gesehen.has(e)) continue;
    gesehen.add(e);
    const r = entscheideWerbung(e, fakten, opt);
    if (r.erlaubt) erlaubt.push(e); else abgelehnt.push({ email: e, grund: r.grund });
  }
  return { erlaubt, abgelehnt };
}

/** Kurzer Satz für die Rückmeldung an den Betrieb: wie viele wurden aus welchem Grund nicht angeschrieben. */
export function ablehnungsHinweis(abgelehnt: { grund: WerbeGrund }[]): string {
  if (!abgelehnt || abgelehnt.length === 0) return '';
  const zahl = (g: WerbeGrund) => abgelehnt.filter((a) => a.grund === g).length;
  const teile: string[] = [];
  const w = zahl('widersprochen'); if (w) teile.push(`${w} abgemeldet bzw. widersprochen`);
  const o = zahl('ohne_einwilligung'); if (o) teile.push(`${o} ohne bestätigte Einwilligung`);
  const u = zahl('unbekannt'); if (u) teile.push(`${u} nicht prüfbar`);
  return `${abgelehnt.length} Adresse${abgelehnt.length === 1 ? '' : 'n'} nicht angeschrieben (${teile.join(', ')}). `
    + 'Werbung geht nur an Personen, die sich über Ihre Anmeldeseite bestätigt angemeldet haben oder am Kontakt eine Einwilligung tragen.';
}
