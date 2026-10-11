// ============================================================================
// ARGONAUT OS · lib/auftragVorlage.ts — Paket 311 (11.10.2026) · BV2 Aufträge
// Aufträge nach Branchen-Vorlage (lib/branchenVorlage.ts, Modul „auftraege"):
// Ampel nach dem Termin, gespeicherte Suchen, Kennzahlen.
//
//   rot     = Termin (lieferdatum) ist vorbei und der Auftrag läuft noch
//   gelb    = Termin in höchstens warnTage Kalendertagen
//   grün    = sonst (auch ohne Termin)
//   neutral = abgeschlossen bzw. storniert
// Gerechnet wird mit Kalendertagen ('YYYY-MM-DD', Europe/Berlin von der Seite),
// nicht mit der Uhrzeit des Browsers.
//
// Reine Funktionen, keine Seiteneffekte. Node-getestet: tests/auftragVorlageP311.test.mjs
// ============================================================================

import { tageBis, type AmpelKey } from './projektVorlage';

export type { AmpelKey };

export interface AuftragLite {
  status?: string | null;
  auftragsdatum?: string | null;
  lieferdatum?: string | null;
  created_at?: string | null;
  kontakt_id?: string | null;
  firma_id?: string | null;
  rechnung_id?: string | null;
}

const FERTIG = new Set(['abgeschlossen', 'storniert']);

/** Läuft der Auftrag noch (nicht abgeschlossen, nicht storniert)? */
export function laeuft(a: AuftragLite): boolean {
  return !FERTIG.has(String(a.status ?? 'entwurf'));
}

export function auftragAmpel(a: AuftragLite, heute: string, warnTage = 7): AmpelKey {
  if (!laeuft(a)) return 'neutral';
  const t = tageBis(a.lieferdatum, heute);
  if (t === null) return 'gruen';
  if (t < 0) return 'rot';
  if (t <= warnTage) return 'gelb';
  return 'gruen';
}

/** Fertig, aber noch keine Rechnung daraus erzeugt. */
export function nichtAbgerechnet(a: AuftragLite): boolean {
  return a.status === 'abgeschlossen' && !String(a.rechnung_id ?? '').trim();
}

/** Kalendertage seit Anlage (created_at, sonst Auftragsdatum); null ohne Datum. */
export function alterTage(a: AuftragLite, heute: string): number | null {
  const t = tageBis(a.created_at ?? a.auftragsdatum, heute);
  return t === null ? null : -t;
}

/**
 * Gespeicherte Suche anwenden. Bekannte Regeln:
 *   ampel=rot|gelb|gruen · termin<=N · abgerechnet=nein · kunde=leer · entwurf>N
 * Unbekannte Regeln treffen nichts (lieber leer als falsch).
 */
export function suchePasst(regel: string, a: AuftragLite, ampel: AmpelKey, heute: string): boolean {
  const r = String(regel || '').trim();
  let m: RegExpMatchArray | null;
  if ((m = r.match(/^ampel=(rot|gelb|gruen)$/))) return ampel === m[1];
  if ((m = r.match(/^termin<=(\d{1,3})$/))) {
    const t = tageBis(a.lieferdatum, heute);
    return laeuft(a) && t !== null && t >= 0 && t <= Number(m[1]);
  }
  if (r === 'abgerechnet=nein') return nichtAbgerechnet(a);
  if (r === 'kunde=leer') return a.status !== 'storniert' && !String(a.kontakt_id ?? '').trim() && !String(a.firma_id ?? '').trim();
  if ((m = r.match(/^entwurf>(\d{1,3})$/))) {
    const t = alterTage(a, heute);
    return a.status === 'entwurf' && t !== null && t > Number(m[1]);
  }
  return false;
}

/** Kennzahlen-Kacheln (Anzahlen; die Netto-Summe rechnet die Seite in Cent). */
export function zaehlen(liste: readonly AuftragLite[], heute: string, warnTage = 7) {
  let offen = 0, inArbeit = 0, fertig = 0, offenAbrechnung = 0, ueberfaellig = 0;
  for (const a of liste) {
    if (a.status === 'entwurf' || a.status === 'beauftragt') offen++;
    if (a.status === 'in_bearbeitung') inArbeit++;
    if (a.status === 'abgeschlossen') fertig++;
    if (nichtAbgerechnet(a)) offenAbrechnung++;
    if (auftragAmpel(a, heute, warnTage) === 'rot') ueberfaellig++;
  }
  return { offen, inArbeit, fertig, offenAbrechnung, ueberfaellig };
}
