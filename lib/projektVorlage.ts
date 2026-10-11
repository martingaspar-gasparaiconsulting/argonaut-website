// ============================================================================
// ARGONAUT OS · lib/projektVorlage.ts — Paket 310 (11.10.2026) · BV2a
// Projekte nach Branchen-Vorlage: Ampel mit einstellbaren Schwellen und die
// gespeicherten Suchen der Vorlage (lib/branchenVorlage.ts, Modul „projekte").
//
// Die Ampel rechnet wie bisher in app/dashboard/projekte (projektHealth):
//   rot   = eine offene Aufgabe ist überfällig oder das Enddatum ist vorbei
//   gelb  = pausiert, oder höchstens warnTage bis zum Ende und weniger als
//           warnProzent der Aufgaben erledigt
//   grün  = sonst · neutral = abgeschlossen bzw. abgebrochen
// Neu: die Schwellen (bisher fest 14 Tage / 70 %) kommen aus der Vorlage bzw.
// den Einstellungen des Betriebs, und gerechnet wird mit Kalendertagen
// ('YYYY-MM-DD'), nicht mit der Uhrzeit des Browsers.
//
// Reine Funktionen, keine Imports. Node-getestet: tests/projektVorlageP310.test.mjs
// ============================================================================

export type AmpelKey = 'rot' | 'gelb' | 'gruen' | 'neutral';

export interface ProjektLite {
  status?: string | null;
  end_datum?: string | null;
  prioritaet?: string | null;
  verantwortlich?: string | null;
}
export interface AufgabeLite { erledigt?: boolean | null; status?: string | null; faellig_am?: string | null }

const ISO = /^\d{4}-\d{2}-\d{2}/;
const tag = (s: unknown): string | null => (typeof s === 'string' && ISO.test(s) ? s.slice(0, 10) : null);

/** Kalendertage von heute bis zum Datum (negativ = vorbei); null ohne Datum. */
export function tageBis(datum: unknown, heute: string): number | null {
  const d = tag(datum), h = tag(heute);
  if (!d || !h) return null;
  const ms = Date.parse(d + 'T00:00:00Z') - Date.parse(h + 'T00:00:00Z');
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

const fertig = (a: AufgabeLite) => !!a.erledigt || a.status === 'fertig';

export function fortschritt(aufgaben: readonly AufgabeLite[]): { erledigt: number; gesamt: number; pct: number } {
  const gesamt = aufgaben.length;
  const erledigt = aufgaben.filter(fertig).length;
  return { erledigt, gesamt, pct: gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0 };
}

export function projektAmpel(
  p: ProjektLite,
  aufgaben: readonly AufgabeLite[],
  heute: string,
  warnTage = 14,
  warnProzent = 70,
): AmpelKey {
  if (p.status === 'abgeschlossen' || p.status === 'abgebrochen') return 'neutral';
  const h = tag(heute);
  const ueberfaellig = aufgaben.some((a) => !fertig(a) && tag(a.faellig_am) !== null && h !== null && (tag(a.faellig_am) as string) < h);
  const bisEnde = tageBis(p.end_datum, heute);
  if (ueberfaellig || (bisEnde !== null && bisEnde < 0)) return 'rot';
  if (p.status === 'pausiert') return 'gelb';
  if (bisEnde !== null && bisEnde <= warnTage && fortschritt(aufgaben).pct < warnProzent) return 'gelb';
  return 'gruen';
}

/**
 * Gespeicherte Suche anwenden. Bekannte Regeln:
 *   ampel=rot|gelb|gruen · ende<=N · prio=hoch (hoch + dringend) · verantwortlich=leer
 * Unbekannte Regeln treffen nichts (lieber leer als falsch).
 */
export function suchePasst(regel: string, p: ProjektLite, ampel: AmpelKey, heute: string): boolean {
  const r = String(regel || '').trim();
  let m: RegExpMatchArray | null;
  if ((m = r.match(/^ampel=(rot|gelb|gruen)$/))) return ampel === m[1];
  if ((m = r.match(/^ende<=(\d{1,3})$/))) {
    const t = tageBis(p.end_datum, heute);
    return t !== null && t >= 0 && t <= Number(m[1]) && ampel !== 'neutral';
  }
  if (r === 'prio=hoch') return (p.prioritaet === 'hoch' || p.prioritaet === 'dringend') && ampel !== 'neutral';
  if (r === 'verantwortlich=leer') return !String(p.verantwortlich ?? '').trim() && ampel !== 'neutral';
  return false;
}

/** Hex-Farbe je Vorlagen-Farbe (für Status-Abzeichen). */
export const STATUS_FARBE: Record<string, string> = {
  ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5A8DEE', gold: '#C9A84C', dim: '#8FA3BE',
};
