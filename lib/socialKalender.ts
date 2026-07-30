// ============================================================================
// ARGONAUT OS · lib/socialKalender.ts — reine Helfer fuer den Social-Kalender
// (Social Paket 4 · Redaktionskalender / Postingzentrale)
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen
// (node-testbar). Monatsraster, 12-Monats-Horizont, Beste-Zeiten-Empfehlungen
// je Kanal und der „krumme-Minute"-Vorschlag (natuerlich streuen, damit nicht
// alle Beitraege auf der runden Stunde landen).
// ============================================================================

import type { SocialPlattformId } from './social';

/** Wie weit im Voraus geplant werden darf. */
export const KALENDER_HORIZONT_MONATE = 12;

export type KalenderTag = {
  iso: string;        // 'YYYY-MM-DD' (lokal)
  tag: number;        // Tag im Monat
  imMonat: boolean;   // gehoert zum angezeigten Monat?
  istHeute: boolean;
  imHorizont: boolean; // liegt zwischen heute und heute+12 Monaten?
};

function zweistellig(n: number): string { return String(n).padStart(2, '0'); }

/** Lokales ISO-Datum 'YYYY-MM-DD' aus einem Date. */
export function tagIso(d: Date): string {
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`;
}

/** Datum + n Monate (kappt ueberlaufende Tage sauber auf Monatsende). */
export function plusMonate(d: Date, n: number): Date {
  const j = d.getFullYear();
  const m = d.getMonth() + n;
  const zielJahr = j + Math.floor(m / 12);
  const zielMonat = ((m % 12) + 12) % 12;
  const letzterTag = new Date(zielJahr, zielMonat + 1, 0).getDate();
  return new Date(zielJahr, zielMonat, Math.min(d.getDate(), letzterTag));
}

/**
 * Liegt ein Zielzeitpunkt im erlaubten Fenster [Beginn heute, heute+12 Monate]?
 * jetztIso wird uebergeben (node-testbar, keine Date.now()-Abhaengigkeit).
 */
export function istImHorizont(zielIso: string | null | undefined, jetztIso: string, monate: number = KALENDER_HORIZONT_MONATE): boolean {
  if (!zielIso) return false;
  const ziel = new Date(zielIso);
  if (Number.isNaN(ziel.getTime())) return false;
  const jetzt = new Date(jetztIso);
  const start = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), 0, 0, 0, 0);
  const ende = plusMonate(new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()), monate);
  ende.setHours(23, 59, 59, 999);
  return ziel.getTime() >= start.getTime() && ziel.getTime() <= ende.getTime();
}

/**
 * Monatsraster Montag–Sonntag: 6 Wochen à 7 Tage, inkl. Rand-Tage der Nachbar-
 * monate. jahr (z. B. 2026), monat 1–12. jetztIso setzt „heute" + Horizont.
 */
export function monatsGitter(jahr: number, monat: number, jetztIso: string): KalenderTag[][] {
  const heute = new Date(jetztIso);
  const heuteIso = tagIso(heute);
  const erster = new Date(jahr, monat - 1, 1);
  // Wochentag Mo=0 … So=6
  const versatz = (erster.getDay() + 6) % 7;
  const start = new Date(jahr, monat - 1, 1 - versatz);

  const wochen: KalenderTag[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const tage: KalenderTag[] = [];
    for (let t = 0; t < 7; t++) {
      const iso = tagIso(cursor);
      tage.push({
        iso,
        tag: cursor.getDate(),
        imMonat: cursor.getMonth() === monat - 1,
        istHeute: iso === heuteIso,
        imHorizont: istImHorizont(`${iso}T12:00:00`, jetztIso),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    wochen.push(tage);
  }
  return wochen;
}

// ============================================================================
// BESTE-ZEITEN-EMPFEHLUNGEN je Kanal (Richtwerte, keine Garantie).
// Uhrzeit-Fenster (lokale Zeit) + welcher Beitragstyp dort typisch am besten zieht.
// ============================================================================

export type ZeitFenster = { von: string; bis: string };
export type BesteZeit = { fenster: ZeitFenster[]; beitragstyp: string };

export const BESTE_ZEITEN: Partial<Record<SocialPlattformId, BesteZeit>> = {
  instagram:       { fenster: [{ von: '11:00', bis: '13:00' }, { von: '19:00', bis: '21:00' }], beitragstyp: 'Reels & Bilder' },
  facebook:        { fenster: [{ von: '09:00', bis: '11:00' }, { von: '18:00', bis: '20:00' }], beitragstyp: 'Bilder, Links & kurze Videos' },
  linkedin:        { fenster: [{ von: '08:00', bis: '10:00' }, { von: '17:00', bis: '18:00' }], beitragstyp: 'Fachbeiträge & Karussells (werktags)' },
  google_business: { fenster: [{ von: '08:00', bis: '10:00' }], beitragstyp: 'Angebote & Neuigkeiten' },
  youtube:         { fenster: [{ von: '14:00', bis: '16:00' }, { von: '19:00', bis: '21:00' }], beitragstyp: 'Videos & Shorts' },
  tiktok:          { fenster: [{ von: '12:00', bis: '13:00' }, { von: '19:00', bis: '22:00' }], beitragstyp: 'Kurz-Videos (Trend-Sounds)' },
  pinterest:       { fenster: [{ von: '20:00', bis: '22:00' }], beitragstyp: 'Hochkant-Bilder (Pins)' },
  telegram:        { fenster: [{ von: '09:00', bis: '11:00' }, { von: '18:00', bis: '20:00' }], beitragstyp: 'Text, Bilder & Links' },
  x:               { fenster: [{ von: '08:00', bis: '10:00' }, { von: '12:00', bis: '13:00' }], beitragstyp: 'Kurztext & Links' },
  threads:         { fenster: [{ von: '09:00', bis: '11:00' }, { von: '19:00', bis: '21:00' }], beitragstyp: 'Kurztext & Bilder' },
  bluesky:         { fenster: [{ von: '09:00', bis: '11:00' }], beitragstyp: 'Kurztext & Bilder' },
  mastodon:        { fenster: [{ von: '09:00', bis: '11:00' }], beitragstyp: 'Kurztext & Bilder' },
};

export function besteZeitFuer(id: string | null | undefined): BesteZeit | null {
  return (id && BESTE_ZEITEN[id as SocialPlattformId]) || null;
}

// ============================================================================
// „Natürlich streuen" — eine krumme Minute vorschlagen, damit nicht alle
// Beiträge auf der runden Stunde (:00) landen. zufall injizierbar (node-testbar).
// ============================================================================

export const KRUMME_MINUTEN = [3, 7, 11, 13, 17, 19, 23, 27, 31, 37, 41, 43, 47, 53, 57];

export function krummeMinute(zufall: () => number = Math.random): number {
  const i = Math.floor(zufall() * KRUMME_MINUTEN.length);
  return KRUMME_MINUTEN[Math.min(Math.max(i, 0), KRUMME_MINUTEN.length - 1)];
}

// ============================================================================
// Beiträge nach Tag/Uhrzeit einordnen (für die Kalender-Kacheln).
// ============================================================================

export type KalenderBeitrag = { id: string; text: string | null; kanaele: string[] | null; status: string; geplant_am: string | null };

/** Gruppiert geplante Beiträge nach lokalem Tag 'YYYY-MM-DD'. */
export function beitraegeNachTag(liste: KalenderBeitrag[] | null | undefined): Record<string, KalenderBeitrag[]> {
  const map: Record<string, KalenderBeitrag[]> = {};
  for (const b of liste || []) {
    if (!b?.geplant_am) continue;
    const d = new Date(b.geplant_am);
    if (Number.isNaN(d.getTime())) continue;
    const key = tagIso(d);
    (map[key] ||= []).push(b);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.geplant_am!).getTime() - new Date(b.geplant_am!).getTime());
  }
  return map;
}

/** Uhrzeit 'HH:MM' (lokal) aus einem ISO-Zeitpunkt. */
export function uhrzeit(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`;
}
