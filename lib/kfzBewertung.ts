// ============================================================================
// ARGONAUT OS · lib/kfzBewertung.ts — Paket 283 (09.10.2026) · K16 Schnittstellen
//
// FIN-Abfrage und Bewertung (DAT, Schwacke) am Handelsfahrzeug. Martins Linie
// (08.10.2026): ARGONAUT ist nur Softwareanbieter. Die Abfrage laeuft im
// EIGENEN Konto des Haendlers beim Anbieter; ARGONAUT
//   · bereitet die FIN zum Kopieren vor und oeffnet das Konto,
//   · speichert den Wert, den der Haendler aus dem Bericht uebernimmt
//     (kfz_bestand.bewertung_*),
//   · vergleicht ihn mit dem eigenen Verkaufspreis.
// Kein Auslesen fremder Seiten, keine geschaetzten Preise, keine KI.
// Der Abruf per Knopf folgt, sobald ein Anbieter die Schnittstelle fuer den
// Betrieb freischaltet (Schnittstellen-Zentrale, Bereich „Fahrzeugbewertung").
//
// Nur der zentrale Zahlenleser (lib/zahlen), keine Hooks, keine Systemuhr.
// ============================================================================

import { leseZahl, centRunden, rundeStellen } from './zahlen';

export const BEWERTUNG_ANBIETER: { key: 'dat' | 'schwacke' | 'sonstige'; label: string }[] = [
  { key: 'dat', label: 'DAT' },
  { key: 'schwacke', label: 'Schwacke' },
  { key: 'sonstige', label: 'Anderer Anbieter' },
];

export type Bewertung = {
  bewertung_anbieter: 'dat' | 'schwacke' | 'sonstige' | null;
  bewertung_ek: number | null;
  bewertung_vk: number | null;
  bewertung_am: string | null;
  bewertung_url: string | null;
};

export const BEWERTUNG_LEER: Bewertung = { bewertung_anbieter: null, bewertung_ek: null, bewertung_vk: null, bewertung_am: null, bewertung_url: null };

/** Nach so vielen Tagen gilt ein Wert als alt (Markt bewegt sich). */
export const BEWERTUNG_ALT_TAGE = 60;

const HOECHST = 9_999_999_999.99;

/** Link zum Bericht: nur https, ohne Leerzeichen/Anführungszeichen, höchstens 500 Zeichen (wie die Datenbank). */
export function bewertungUrlGueltig(u: unknown): u is string {
  return typeof u === 'string' && u.length <= 500 && /^https:\/\/[^\s"'<>]+\.[^\s"'<>]+$/.test(u);
}

/** FIN für die Abfrage beim Anbieter: bereinigt (17 Zeichen, ohne I, O, Q) oder null. */
export function finFuerAbfrage(roh: unknown): string | null {
  const f = String(roh ?? '').replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(f) ? f : null;
}

function betrag(roh: unknown, label: string): { ok: true; wert: number | null } | { ok: false; fehler: string } {
  if (roh === null || roh === undefined || String(roh).trim() === '') return { ok: true, wert: null };
  const n = typeof roh === 'number' ? roh : leseZahl(roh);
  if (n === null || !Number.isFinite(n)) return { ok: false, fehler: `${label}: bitte einen Betrag eingeben, z. B. 18.450,00.` };
  if (n < 0) return { ok: false, fehler: `${label} darf nicht negativ sein.` };
  if (n > HOECHST) return { ok: false, fehler: `${label} ist zu groß.` };
  return { ok: true, wert: centRunden(n) };
}

/**
 * Eingabe aus der Akte prüfen -> Felder für kfz_bestand.
 * Beide Werte leer = Bewertung entfernen.
 */
export function bewertungEingabe(
  roh: { anbieter?: unknown; ek?: unknown; vk?: unknown; am?: unknown; url?: unknown },
  heuteIso: string,
): { ok: true; felder: Bewertung } | { ok: false; fehler: string } {
  const ek = betrag(roh.ek, 'Händler-Einkaufswert');
  if (!ek.ok) return ek;
  const vk = betrag(roh.vk, 'Händler-Verkaufswert');
  if (!vk.ok) return vk;
  if (ek.wert === null && vk.wert === null) return { ok: true, felder: { ...BEWERTUNG_LEER } };
  const anbieter = BEWERTUNG_ANBIETER.find((a) => a.key === roh.anbieter)?.key ?? 'sonstige';
  const heute = heuteIso.slice(0, 10);
  const am = typeof roh.am === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(roh.am) ? roh.am : heute;
  if (am > heute) return { ok: false, fehler: 'Das Datum der Bewertung liegt in der Zukunft.' };
  const urlText = typeof roh.url === 'string' ? roh.url.trim() : '';
  if (urlText && !bewertungUrlGueltig(urlText)) return { ok: false, fehler: 'Bitte den vollständigen Link zum Bericht einfügen (beginnt mit https://) oder das Feld leer lassen.' };
  if (ek.wert !== null && vk.wert !== null && ek.wert > vk.wert) {
    return { ok: false, fehler: 'Der Einkaufswert ist höher als der Verkaufswert — bitte die beiden Felder prüfen.' };
  }
  return { ok: true, felder: { bewertung_anbieter: anbieter, bewertung_ek: ek.wert, bewertung_vk: vk.wert, bewertung_am: am, bewertung_url: urlText || null } };
}

function tageZwischen(vonIso: string, bisIso: string): number | null {
  const a = Date.parse(`${vonIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${bisIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export type BewertungLage = {
  anbieter: string;
  ek: number | null;
  vk: number | null;
  am: string | null;
  alterTage: number | null;
  alt: boolean;
  /** Eigener Verkaufspreis gegenüber dem Händler-Verkaufswert in Prozent (+ = darüber). */
  abweichungProzent: number | null;
  stufe: 'ok' | 'warn' | 'info' | 'keine';
  text: string;
};

/**
 * Wie steht der eigene Preis zur Bewertung? Reine Anzeige, ändert nichts.
 * Bis +5 % über dem Händler-Verkaufswert: ok. Darüber: warn. Mehr als 10 %
 * darunter: info (Geld verschenkt?). Ohne Wert oder Preis: keine.
 */
export function bewertungLage(
  b: Partial<Bewertung> | null | undefined,
  vkBrutto: number | null | undefined,
  heuteIso: string,
): BewertungLage | null {
  if (!b || (b.bewertung_ek == null && b.bewertung_vk == null)) return null;
  const anbieter = BEWERTUNG_ANBIETER.find((a) => a.key === b.bewertung_anbieter)?.label ?? 'Bewertung';
  const am = typeof b.bewertung_am === 'string' ? b.bewertung_am.slice(0, 10) : null;
  const alterTage = am ? tageZwischen(am, heuteIso) : null;
  const alt = alterTage !== null && alterTage > BEWERTUNG_ALT_TAGE;
  const vk = typeof b.bewertung_vk === 'number' ? b.bewertung_vk : null;
  const ek = typeof b.bewertung_ek === 'number' ? b.bewertung_ek : null;
  let abweichungProzent: number | null = null;
  let stufe: BewertungLage['stufe'] = 'keine';
  let text = `${anbieter}-Wert hinterlegt.`;
  if (vk !== null && vk > 0 && typeof vkBrutto === 'number' && vkBrutto > 0) {
    abweichungProzent = rundeStellen(((vkBrutto - vk) / vk) * 100, 1);
    if (abweichungProzent > 5) { stufe = 'warn'; text = `Ihr Preis liegt ${abweichungProzent.toLocaleString('de-DE')} % über dem ${anbieter}-Händler-Verkaufswert.`; }
    else if (abweichungProzent < -10) { stufe = 'info'; text = `Ihr Preis liegt ${Math.abs(abweichungProzent).toLocaleString('de-DE')} % unter dem ${anbieter}-Händler-Verkaufswert — Spielraum prüfen.`; }
    else { stufe = 'ok'; text = `Ihr Preis passt zum ${anbieter}-Händler-Verkaufswert (${abweichungProzent > 0 ? '+' : ''}${abweichungProzent.toLocaleString('de-DE')} %).`; }
  }
  if (alt) text += ` Die Bewertung ist ${alterTage} Tage alt — bitte neu abfragen.`;
  return { anbieter, ek, vk, am, alterTage, alt, abweichungProzent, stufe, text };
}
