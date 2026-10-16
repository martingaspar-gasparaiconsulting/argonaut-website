// ============================================================================
// ARGONAUT OS · lib/showUp.ts — Paket VK5 Show-up-Maschine (16.10.2026)
// Reine Logik (importfrei, node-getestet in tests/showUpVK5.test.mjs):
//  - Wer ist erschienen, wer nicht, was ist noch offen (Show-Rate fuer VK7)
//  - Erinnerung 1 Stunde vorher: welche Termine sind jetzt dran
//  - Rueckhol-Folge nach „nicht erschienen": wann die naechste Mail faellig ist
// Der Termin-Status (geplant/abgesagt/…) bleibt unangetastet; ob jemand kam,
// steht in der eigenen Spalte termine.erschienen (true/false/null = offen).
// ============================================================================

export type ShowTermin = {
  id: string;
  beginn_am: string | null;
  status?: string | null;
  kunde_email?: string | null;
  erschienen?: boolean | null;
  erinnerung_1h_am?: string | null;
  rueckhol_stufe?: number | null;
  rueckhol_letzte_am?: string | null;
};

export type ShowEinstellung = {
  erinnerung_1h: boolean;
  rueckhol_an: boolean;
  rueckhol_tage: number[];
};

/** Status, bei denen der Termin gar nicht stattfindet. */
const NICHT_AKTIV = new Set(['abgesagt', 'storniert', 'verschoben', 'ausgefallen']);

export function istAktiv(status: string | null | undefined): boolean {
  return !NICHT_AKTIV.has(String(status ?? '').trim().toLowerCase());
}

/** Voreinstellung ohne gespeicherte Zeile: nichts geht automatisch an Kunden raus. */
export const STANDARD_EINSTELLUNG: ShowEinstellung = { erinnerung_1h: false, rueckhol_an: false, rueckhol_tage: [1, 4] };

export const RUECKHOL_MAX_STUFEN = 3;
export const RUECKHOL_MAX_TAG = 30;

/** Tage nach dem verpassten Termin: ganze Zahlen 1–30, aufsteigend, ohne Doppelte, hoechstens 3. */
export function rueckholTageBereinigen(roh: unknown): number[] {
  const liste = Array.isArray(roh) ? roh : [];
  const zahlen = liste
    .map((x) => (typeof x === 'number' ? x : NaN))
    .filter((x) => Number.isInteger(x) && x >= 1 && x <= RUECKHOL_MAX_TAG);
  return Array.from(new Set(zahlen)).sort((a, b) => a - b).slice(0, RUECKHOL_MAX_STUFEN);
}

export function einstellungLesen(roh: Record<string, unknown> | null | undefined): ShowEinstellung {
  if (!roh) return { ...STANDARD_EINSTELLUNG, rueckhol_tage: [...STANDARD_EINSTELLUNG.rueckhol_tage] };
  const tage = rueckholTageBereinigen(roh.rueckhol_tage);
  return {
    erinnerung_1h: roh.erinnerung_1h === true,
    rueckhol_an: roh.rueckhol_an === true,
    rueckhol_tage: tage.length ? tage : [...STANDARD_EINSTELLUNG.rueckhol_tage],
  };
}

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

/** Kalendertag in Europe/Berlin als 'YYYY-MM-DD'. */
export function berlinTag(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Ganze Berliner Kalendertage zwischen zwei Zeitpunkten (b − a). */
export function tageZwischen(a: Date, b: Date): number {
  const ta = Date.parse(berlinTag(a) + 'T00:00:00Z');
  const tb = Date.parse(berlinTag(b) + 'T00:00:00Z');
  return Math.round((tb - ta) / 86400000);
}

/** Vergangener, aktiver Termin — hier darf „erschienen / nicht erschienen" gesetzt werden. */
export function markierbar(t: ShowTermin, jetzt: Date): boolean {
  const b = ms(t.beginn_am);
  return Number.isFinite(b) && b <= jetzt.getTime() && istAktiv(t.status);
}

export type ShowLage = 'erschienen' | 'nicht_erschienen' | 'offen' | 'kommend' | 'entfaellt';

export function lage(t: ShowTermin, jetzt: Date): ShowLage {
  if (!istAktiv(t.status)) return 'entfaellt';
  if (!markierbar(t, jetzt)) return 'kommend';
  if (t.erschienen === true) return 'erschienen';
  if (t.erschienen === false) return 'nicht_erschienen';
  return 'offen';
}

export type ShowRate = { erschienen: number; nicht: number; offen: number; quote: number | null };

/**
 * Show-Rate der letzten `tage` Tage: erschienen ÷ (erschienen + nicht erschienen), in ganzen Prozent.
 * Offene (noch nicht markierte) zaehlen NICHT mit — sonst sinkt die Quote, nur weil keiner abgehakt hat.
 * Ohne eine einzige Markierung: quote = null (keine Zahl erfinden).
 */
export function showRate(termine: ShowTermin[], jetzt: Date, tage = 90): ShowRate {
  const ab = jetzt.getTime() - tage * 86400000;
  let erschienen = 0, nicht = 0, offen = 0;
  for (const t of termine) {
    const b = ms(t.beginn_am);
    if (!Number.isFinite(b) || b < ab) continue;
    const l = lage(t, jetzt);
    if (l === 'erschienen') erschienen++;
    else if (l === 'nicht_erschienen') nicht++;
    else if (l === 'offen') offen++;
  }
  const basis = erschienen + nicht;
  return { erschienen, nicht, offen, quote: basis ? Math.round((erschienen / basis) * 100) : null };
}

/** Fenster fuer die 1-Stunden-Erinnerung bei einem 15-Minuten-Lauf: Beginn in (jetzt+30 Min, jetzt+90 Min]. */
export const FENSTER_VON_MIN = 30;
export const FENSTER_BIS_MIN = 90;

export function faelligEineStunde(t: ShowTermin, jetzt: Date): boolean {
  const b = ms(t.beginn_am);
  if (!Number.isFinite(b)) return false;
  const von = jetzt.getTime() + FENSTER_VON_MIN * 60000;
  const bis = jetzt.getTime() + FENSTER_BIS_MIN * 60000;
  return b > von && b <= bis && istAktiv(t.status) && !!(t.kunde_email ?? '').trim() && !t.erinnerung_1h_am && t.erschienen == null;
}

/**
 * Ist die naechste Rueckhol-Mail faellig?
 *  - nur bei erschienen === false und eingeschalteter Folge
 *  - Stufe n ist faellig ab Tag rueckhol_tage[n] nach dem Termin (Berliner Tage)
 *  - hoechstens eine Mail je Tag, nie aelter als 30 Tage + letzte Stufe
 *  - hat der Kunde inzwischen neu gebucht (neuGebucht), ist Schluss
 */
export function rueckholFaellig(t: ShowTermin, e: ShowEinstellung, jetzt: Date, neuGebucht = false): boolean {
  if (!e.rueckhol_an || t.erschienen !== false || neuGebucht) return false;
  if (!istAktiv(t.status) || !(t.kunde_email ?? '').trim()) return false;
  const b = ms(t.beginn_am);
  if (!Number.isFinite(b) || b > jetzt.getTime()) return false;
  const tage = rueckholTageBereinigen(e.rueckhol_tage);
  const stufe = Math.max(0, Math.floor(Number(t.rueckhol_stufe ?? 0)) || 0);
  if (stufe >= tage.length) return false;
  if (tageZwischen(new Date(b), jetzt) < tage[stufe]) return false;
  if (t.rueckhol_letzte_am && berlinTag(new Date(t.rueckhol_letzte_am)) === berlinTag(jetzt)) return false;
  return true;
}

/** Stunde 0–23 in Europe/Berlin. */
export function berlinStunde(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(d));
}

/** Rueckhol-Mails nur zu ueblichen Geschaeftszeiten (9–18 Uhr Berlin), nie nachts. */
export function rueckholZeit(jetzt: Date): boolean {
  const h = berlinStunde(jetzt);
  return h >= 9 && h < 18;
}

/** Buchungslink des Betriebs (nur wenn die Online-Buchung freigeschaltet ist). */
export function buchungsLink(basis: string, slug: string | null | undefined, aktiv: boolean | null | undefined): string | null {
  const s = String(slug ?? '').trim();
  if (!s || aktiv !== true || !/^[a-z0-9-]+$/i.test(s)) return null;
  return `${basis.replace(/\/+$/, '')}/buchen/${s}`;
}

/** Text der Rueckhol-Mail je Stufe (gesiezt, ohne Werbung, ohne Vorwurf). */
export function rueckholText(stufe: number, link: string | null, letzte = false): { betreff: string; absaetze: string[] } {
  const buchen = link
    ? 'Einen neuen Termin können Sie direkt über den Link unten wählen.'
    : 'Antworten Sie einfach auf diese E-Mail, dann finden wir einen neuen Termin.';
  const schluss = letzte ? ['Danach melden wir uns zu diesem Termin nicht mehr.'] : [];
  if (stufe <= 0) {
    return {
      betreff: 'Wir haben Sie vermisst — neuer Termin?',
      absaetze: ['leider haben wir uns bei Ihrem Termin verpasst. Das kann passieren.', buchen, ...schluss],
    };
  }
  return {
    betreff: 'Ihr Termin ist noch offen',
    absaetze: ['Ihr verpasster Termin ist noch nicht nachgeholt. Falls Sie weiterhin Interesse haben, melden Sie sich gern.', buchen, ...schluss],
  };
}
