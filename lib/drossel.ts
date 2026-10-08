// ============================================================================
// ARGONAUT OS · lib/drossel.ts — Mengen-Deckel für die offenen Türen (Paket S1)
//
// Martins Regel (28.09.2026): Offen bleiben nur Türen für Besucher und Kunden
// eines Betriebs. Offen heißt aber nicht grenzenlos: Ohne Deckel konnte jeder
// mit einem kleinen Skript
//   · beliebige Adressen mit Mails im Namen eines Betriebs fluten
//     (Anmelde-, Buchungs-, Bestell-, Widerrufs-Bestätigungen),
//   · Kalender und Webinar-Plätze mit Fantasie-Buchungen zustellen,
//   · die KI der Branchenseiten auf ARGONAUTs Kosten dauerlaufen lassen.
//
// Jede Tür mit Deckel steht in DROSSEL. Gezählt wird je Tür
//   · 'ip'     — je Absender-Adresse (Browser/Firmennetz),
//   · 'ziel'   — je E-Mail-Adresse/Telefonnummer (+ Betrieb/Seite), an die
//                etwas verschickt würde,
//   · 'gesamt' — alle zusammen (nur, wo ARGONAUT selbst die Kosten trägt).
//
// DATENSCHUTZ: In der Tabelle steht nie eine IP oder Mail-Adresse, nur ein
// Einweg-Hash mit Salz (wie lib/besucherKennung.ts). Einträge verfallen mit
// ihrem Zeitfenster und werden nebenbei gelöscht.
//
// AUSSPERR-SCHUTZ: Fehlt die Datenbank-Funktion (SQL p161 noch nicht
// ausgeführt) oder antwortet sie mit Fehler, geht die Anfrage DURCH. Ein
// kaputter Zähler darf nie einen echten Kunden abweisen.
//
// Rein bis auf `drossel()` (bekommt die Datenbank hereingereicht) — node-testbar.
// ============================================================================

import { createHash } from 'node:crypto';

export type DrosselArt = 'ip' | 'ziel' | 'gesamt';
export type DrosselRegel = { art: DrosselArt; max: number; fensterSek: number };

const MINUTE = 60;
const STUNDE = 3600;
const TAG = 86400;

/** Die Deckel je Tür (Pfad unter app/api wie in lib/offeneTueren.ts). */
export const DROSSEL: Record<string, DrosselRegel[]> = {
  // --- ARGONAUT-eigene Webseite ---
  'website-anfrage': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  'oeffentlich/branchen-chat': [
    { art: 'ip', max: 10, fensterSek: MINUTE },
    { art: 'ip', max: 60, fensterSek: TAG },
    { art: 'gesamt', max: 3000, fensterSek: TAG },
  ],
  'oeffentlich/dossier-optin': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 2, fensterSek: TAG },
  ],
  'oeffentlich/dossier-pdf': [{ art: 'ip', max: 30, fensterSek: STUNDE }],
  'oeffentlich/ebook-pdf': [{ art: 'ip', max: 30, fensterSek: STUNDE }],
  // --- Webseiten, Shops, Landingpages der Betriebe ---
  'oeffentlich/chat': [
    { art: 'ip', max: 6, fensterSek: MINUTE },
    { art: 'ip', max: 150, fensterSek: TAG },
  ],
  'oeffentlich/lp': [
    { art: 'ip', max: 10, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  'oeffentlich/web-anfrage': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  // Paket 264: Online-Ankaufformular (Kfz) — je Absender und je Verkaeufer-Adresse.
  'oeffentlich/kfz-ankauf': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  // Paket 272: Anfrage-Formular der eigenen Fahrzeugboerse (Kfz) — je Absender und je Interessent+Fahrzeug.
  'oeffentlich/kfz-boerse-anfrage': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  // Paket 279: Gast-Link Partner-Auftrag (je IP und je Link)
  'oeffentlich/partner-gast': [
    { art: 'ip', max: 120, fensterSek: STUNDE },
    { art: 'ziel', max: 400, fensterSek: TAG },
  ],
  'oeffentlich/partner-gast/bild': [
    { art: 'ip', max: 300, fensterSek: STUNDE },
    { art: 'ziel', max: 1000, fensterSek: TAG },
  ],
  'oeffentlich/web-newsletter': [
    { art: 'ip', max: 10, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  'oeffentlich/shop-bestellung': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 5, fensterSek: TAG },
  ],
  'oeffentlich/widerruf': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 5, fensterSek: TAG },
  ],
  'oeffentlich/buchung': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 5, fensterSek: TAG },
  ],
  'oeffentlich/freebie': [
    { art: 'ip', max: 10, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  'oeffentlich/optin': [
    { art: 'ip', max: 10, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  'oeffentlich/whatsapp-optin': [
    { art: 'ip', max: 5, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  'oeffentlich/webinar': [
    { art: 'ip', max: 10, fensterSek: STUNDE },
    { art: 'ziel', max: 3, fensterSek: TAG },
  ],
  // --- Paket 187b: CSP-Meldungen der Browser (nur Protokollzeile) ---
  'oeffentlich/csp-bericht': [{ art: 'ip', max: 60, fensterSek: STUNDE }],
  // --- Kundenportal: PDF wird bei jedem Aufruf neu erzeugt ---
  'oeffentlich/portal/rechnung': [{ art: 'ip', max: 60, fensterSek: STUNDE }],
};

/** Antwort-Texte (Sie-Form). */
export const ZU_VIEL_TEXT = 'Zu viele Anfragen in kurzer Zeit. Bitte versuchen Sie es später erneut.';
export const SCHON_GESCHICKT_TEXT =
  'Für diese Angaben ist heute schon genug eingegangen. Bitte sehen Sie in Ihrem Postfach nach (auch im Spam-Ordner) oder versuchen Sie es morgen erneut.';

/** Text zur Art, die gegriffen hat. */
export function drosselText(art: DrosselArt): string {
  return art === 'ziel' ? SCHON_GESCHICKT_TEXT : ZU_VIEL_TEXT;
}

/**
 * Zähl-Schlüssel: Einweg-Hash, nie Klartext. Die Mail-Adresse wird vorher
 * klein geschrieben und getrimmt, damit „A@x.de " und „a@x.de" gleich zählen.
 * Ohne Wert (keine IP lesbar, keine Mail angegeben) -> null = nicht zählen.
 */
export function drosselSchluessel(tuer: string, regel: DrosselRegel, wert: string | null | undefined, salz: string): string | null {
  const w = regel.art === 'gesamt' ? 'alle' : String(wert ?? '').trim().toLowerCase();
  if (!w) return null;
  const roh = [tuer, regel.art, regel.fensterSek, w, salz].join('|');
  return 'd' + createHash('sha256').update(roh).digest('hex').slice(0, 40);
}

export type DrosselWerte = { ip?: string | null; ziel?: string | null };
export type DrosselDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

function salzStandard(): string {
  return process.env.ANALYTICS_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'argonaut-os-standardsalz';
}

/**
 * Zählt die Anfrage für jede Regel der Tür hoch. Gibt die Art zurück, deren
 * Deckel überschritten ist — oder null (= darf weiter).
 * Fehler/fehlende Funktion -> null (nie aussperren).
 */
export async function drossel(
  db: DrosselDb,
  tuer: string,
  werte: DrosselWerte,
  salz: string = salzStandard(),
): Promise<DrosselArt | null> {
  const regeln = DROSSEL[tuer];
  if (!regeln) return null;
  for (const regel of regeln) {
    const wert = regel.art === 'ip' ? werte.ip : regel.art === 'ziel' ? werte.ziel : 'alle';
    const schluessel = drosselSchluessel(tuer, regel, wert, salz);
    if (!schluessel) continue;
    try {
      const { data, error } = await db.rpc('drossel_zaehlen', {
        p_schluessel: schluessel, p_max: regel.max, p_fenster_sek: regel.fensterSek,
      });
      if (error) { console.warn('drossel:', tuer, 'Zaehler nicht erreichbar'); return null; }
      if (data === false) return regel.art;
    } catch {
      console.warn('drossel:', tuer, 'Zaehler nicht erreichbar');
      return null;
    }
  }
  return null;
}

/** Absender-IP hinter Vercel (erster Eintrag von x-forwarded-for). */
export function drosselIp(kopfzeilen: Headers | null | undefined): string {
  if (!kopfzeilen) return '';
  const erste = (kopfzeilen.get('x-forwarded-for') || '').split(',')[0]?.trim();
  return erste || (kopfzeilen.get('x-real-ip') || '').trim();
}
