// ============================================================================
// ARGONAUT OS · lib/zweiFaktorPflicht.ts — Zwei-Faktor-Pflicht je Betrieb (Paket 190)
//
// Martin 29.09.2026 (Entscheidungsrunde Block 1): Die Pflicht schaltet der
// INHABER für seinen Betrieb selbst ein — Schalter „Für alle Pflicht" mit
// Sicherheitsabfrage: Häkchen „Mitarbeiter informiert" und „Betriebsrat
// einbezogen bzw. keiner vorhanden". Nachweis wer/wann. 7 Tage Übergangsfrist,
// jederzeit abschaltbar.
//
// Wirkung: Ab dem Pflicht-Tag kommt jeder Zugang des Betriebs OHNE zweiten
// Faktor nach dem Passwort auf die Einrichtungs-Seite (kein „Später"). Wer
// einen Faktor hat, merkt nichts. Ausgesperrt wird niemand: die Einrichtung
// liegt außerhalb des Dashboards und ist immer erreichbar.
//
// Rein, ohne Importe, node-getestet (tests/zweiFaktorPflichtP190).
// ============================================================================

export const UEBERGANG_TAGE = 7;
export type Betriebsrat = 'einbezogen' | 'keiner';
export type PflichtStufe = 'aus' | 'uebergang' | 'pflicht';

export type PflichtZeile = {
  an?: boolean | null;
  pflicht_ab?: string | null;
  eingeschaltet_am?: string | null;
  eingeschaltet_von?: string | null;
  mitarbeiter_informiert?: boolean | null;
  betriebsrat?: string | null;
};

function zeitAus(roh: unknown): number | null {
  if (roh === null || roh === undefined || roh === '') return null;
  const t = new Date(String(roh)).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Ab wann gilt die Pflicht, wenn sie JETZT eingeschaltet wird? */
export function pflichtAbFuer(eingeschaltet: Date): Date {
  return new Date(eingeschaltet.getTime() + UEBERGANG_TAGE * 86_400_000);
}

/** Wirkt die Pflicht zu diesem Zeitpunkt? (null/unlesbar = nein) */
export function pflichtWirkt(pflichtAb: unknown, jetzt: Date): boolean {
  const t = zeitAus(pflichtAb);
  return t !== null && jetzt.getTime() >= t;
}

/** Stand für Anzeige: aus · Übergangsfrist (mit Resttagen) · Pflicht. */
export function pflichtStand(z: PflichtZeile | null | undefined, jetzt: Date): { stufe: PflichtStufe; ab: string | null; restTage: number } {
  if (!z || z.an !== true) return { stufe: 'aus', ab: null, restTage: 0 };
  const t = zeitAus(z.pflicht_ab);
  if (t === null) return { stufe: 'aus', ab: null, restTage: 0 };
  const ab = new Date(t).toISOString();
  if (jetzt.getTime() >= t) return { stufe: 'pflicht', ab, restTage: 0 };
  return { stufe: 'uebergang', ab, restTage: Math.ceil((t - jetzt.getTime()) / 86_400_000) };
}

/** Darf dieser Zugang die Pflicht EINSCHALTEN? Grund, wenn nicht. */
export function einschaltenPruefen(o: {
  rolle: string; aal2: boolean; mitarbeiterInformiert: unknown; betriebsrat: unknown;
}): { ja: true; betriebsrat: Betriebsrat } | { ja: false; grund: string } {
  if (o.rolle !== 'chef') return { ja: false, grund: 'Nur die Geschäftsleitung schaltet die Pflicht für den Betrieb ein.' };
  if (!o.aal2) return { ja: false, grund: 'Zuerst selbst die Zwei-Faktor-Anmeldung einrichten bzw. mit Code bestätigen.' };
  if (o.mitarbeiterInformiert !== true) return { ja: false, grund: 'Bitte bestätigen, dass die Mitarbeiter informiert sind.' };
  if (o.betriebsrat !== 'einbezogen' && o.betriebsrat !== 'keiner') return { ja: false, grund: 'Bitte angeben: Betriebsrat einbezogen oder kein Betriebsrat vorhanden.' };
  return { ja: true, betriebsrat: o.betriebsrat };
}

/** Darf dieser Zugang die Pflicht AUSSCHALTEN? (Geschäftsleitung, mit Code) */
export function ausschaltenPruefen(o: { rolle: string; aal2: boolean }): { ja: true } | { ja: false; grund: string } {
  if (o.rolle !== 'chef') return { ja: false, grund: 'Nur die Geschäftsleitung schaltet die Pflicht ab.' };
  if (!o.aal2) return { ja: false, grund: 'Zuerst selbst mit Code anmelden.' };
  return { ja: true };
}

/**
 * Bleibt ein schon laufender Pflicht-Tag beim erneuten Einschalten stehen?
 * Ja, solange die Pflicht an ist — nochmal Klicken verschiebt die Frist nicht.
 * War sie aus, beginnt eine neue Übergangsfrist.
 */
export function neuerPflichtTag(bisher: PflichtZeile | null | undefined, jetzt: Date): string {
  if (bisher?.an === true) {
    const t = zeitAus(bisher.pflicht_ab);
    if (t !== null) return new Date(t).toISOString();
  }
  return pflichtAbFuer(jetzt).toISOString();
}

/** Datum für Texte: 07.10.2026 (Berliner Zeit). */
export function datumDe(iso: string | null | undefined): string {
  const t = zeitAus(iso);
  if (t === null) return '';
  return new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
}
