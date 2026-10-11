// ============================================================================
// ARGONAUT OS · lib/kontaktVorlage.ts — Paket 312 (11.10.2026) · BV2 Kunden
// Kontakte im CRM nach Branchen-Vorlage (lib/branchenVorlage.ts, Modul
// „kontakte"): Betreuungs-Ampel, gespeicherte Suchen, Kennzahlen.
//
//   grün    = letzter Kontakt liegt höchstens 1 Intervall zurück
//   gelb    = höchstens 2 Intervalle
//   rot     = länger („einschlafend")
//   neutral = noch nie kontaktiert
// Intervall = betreuungs_intervall_tage des Kontakts, sonst das der Vorlage.
// Gerechnet wird mit Kalendertagen ('YYYY-MM-DD', Europe/Berlin von der Seite),
// wie bisher wird der Status dabei NICHT berücksichtigt.
//
// Reine Funktionen, keine Seiteneffekte. Node-getestet: tests/kontaktVorlageP312.test.mjs
// ============================================================================

import { tageBis, type AmpelKey } from './projektVorlage';

export type { AmpelKey };

export interface KontaktLite {
  status?: string | null;
  email?: string | null;
  letzter_kontakt_am?: string | null;
  naechster_kontakt_am?: string | null;
  betreuungs_intervall_tage?: number | null;
}

/** Intervall des Kontakts (ganze Tage ≥ 1), sonst Standard der Vorlage. */
export function intervallVon(k: KontaktLite, standard = 30): number {
  const n = Number(k.betreuungs_intervall_tage);
  if (Number.isFinite(n) && n >= 1) return Math.trunc(n);
  return Math.max(1, Math.trunc(Number(standard) || 30));
}

/** Kalendertage seit dem letzten Kontakt; null ohne (gültiges) Datum. */
export function tageSeitKontakt(k: KontaktLite, heute: string): number | null {
  const t = tageBis(k.letzter_kontakt_am, heute);
  return t === null ? null : -t;
}

export function kontaktAmpel(k: KontaktLite, heute: string, standard = 30): AmpelKey {
  const tage = tageSeitKontakt(k, heute);
  if (tage === null) return 'neutral';
  const iv = intervallVon(k, standard);
  if (tage <= iv) return 'gruen';
  if (tage <= iv * 2) return 'gelb';
  return 'rot';
}

/** Wiedervorlage heute oder früher. */
export function wiedervorlageFaellig(k: KontaktLite, heute: string): boolean {
  const t = tageBis(k.naechster_kontakt_am, heute);
  return t !== null && t <= 0;
}

/**
 * Gespeicherte Suche anwenden. Bekannte Regeln:
 *   ampel=rot|gelb|gruen · wiedervorlage=faellig · kontakt=nie · email=leer
 * Unbekannte Regeln treffen nichts (lieber leer als falsch).
 */
export function suchePasst(regel: string, k: KontaktLite, ampel: AmpelKey, heute: string): boolean {
  const r = String(regel || '').trim();
  const m = r.match(/^ampel=(rot|gelb|gruen)$/);
  if (m) return ampel === m[1];
  if (r === 'wiedervorlage=faellig') return wiedervorlageFaellig(k, heute);
  if (r === 'kontakt=nie') return ampel === 'neutral' && k.status !== 'inaktiv';
  if (r === 'email=leer') return !String(k.email ?? '').trim() && k.status !== 'inaktiv';
  return false;
}

/** Kennzahlen-Kacheln wie bisher (gesamt, Kunden, Wiedervorlage, einschlafend). */
export function zaehlen(liste: readonly KontaktLite[], heute: string, standard = 30) {
  let kunden = 0, wiedervorlage = 0, einschlafend = 0, bald = 0;
  for (const k of liste) {
    if (k.status === 'kunde') kunden++;
    if (wiedervorlageFaellig(k, heute)) wiedervorlage++;
    const a = kontaktAmpel(k, heute, standard);
    if (a === 'rot') einschlafend++;
    if (a === 'gelb') bald++;
  }
  return { gesamt: liste.length, kunden, wiedervorlage, einschlafend, bald };
}
