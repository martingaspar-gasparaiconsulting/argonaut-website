// ============================================================================
// ARGONAUT OS · lib/socialVideo.ts — eigene Videos für Social (C5)
//
// Skripte konnte ARGONAUT schon schreiben, Videos aber nicht ausspielen. Was
// fehlte: ein Speicherbereich, ein Aufraeum-Programm und ein Kontingent —
// sonst fuellt ein einziger Kunde den Speicher fuer alle.
//
// WARUM NUR mp4/webm/ogg: genau diese drei erkennt videoEinbettung() als
// Video-Datei. Ein .mov vom iPhone waere hochgeladen, aber im Beitrag
// unsichtbar — das faellt erst beim Kunden auf. Deshalb hier die Grenze.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

/** 200 MB je Datei — dieselbe Grenze wie im Speicherbereich. */
export const MAX_BYTES = 200 * 1024 * 1024;

export const ERLAUBTE_TYPEN = ['video/mp4', 'video/webm', 'video/ogg'] as const;
export const ERLAUBTE_ENDUNGEN = ['mp4', 'webm', 'ogg'] as const;

/** Liegt ein Video so lange unbenutzt herum, raeumt der Cron es weg. */
export const AUFRAEUM_TAGE = 30;

const TAG_MS = 86_400_000;

export function endungVon(dateiname: unknown): string {
  const teile = String(dateiname ?? '').trim().toLowerCase().split('.');
  if (teile.length < 2) return '';
  return teile[teile.length - 1].replace(/[^a-z0-9]/g, '');
}

export type Pruefung = { ok: boolean; fehler: string | null };

/**
 * Prueft eine Datei VOR dem Hochladen. Der Server stellt die signierte
 * Adresse erst danach aus — so wird nie eine Datei uebertragen, die
 * hinterher abgelehnt wird.
 */
export function pruefeVideo(dateiname: unknown, typ: unknown, groesse: unknown): Pruefung {
  const endung = endungVon(dateiname);
  const mime = String(typ ?? '').trim().toLowerCase();
  const bytes = Number(groesse);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, fehler: 'Die Datei scheint leer zu sein.' };
  }
  if (bytes > MAX_BYTES) {
    return { ok: false, fehler: `Das Video ist größer als ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Bitte kürzen oder kleiner exportieren.` };
  }
  if (!(ERLAUBTE_ENDUNGEN as readonly string[]).includes(endung)) {
    return { ok: false, fehler: 'Nur MP4, WebM oder OGG. Ein Video vom iPhone (.mov) wäre zwar hochgeladen, im Beitrag aber unsichtbar.' };
  }
  if (mime && !(ERLAUBTE_TYPEN as readonly string[]).includes(mime)) {
    return { ok: false, fehler: 'Dieses Videoformat wird nicht unterstützt. Bitte MP4, WebM oder OGG verwenden.' };
  }
  return { ok: true, fehler: null };
}

/** Dateiname entschaerfen — keine Umlaute, Leerzeichen oder Pfadtrenner. */
export function sichererName(dateiname: unknown): string {
  const roh = String(dateiname ?? '').trim();
  const endung = endungVon(roh) || 'mp4';
  const basis = roh.slice(0, roh.length - endung.length - 1) || 'video';
  const sauber = basis
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 60);
  return `${sauber || 'video'}.${endung}`;
}

/** Ablage-Pfad: immer im eigenen Ordner — daran haengt die Speichermessung. */
export function pfadFuer(ownerUserId: unknown, dateiname: unknown, jetztMs: number = Date.now()): string | null {
  const owner = String(ownerUserId ?? '').trim();
  if (!owner) return null;
  return `${owner}/social/${jetztMs}_${sichererName(dateiname)}`;
}

export type BeitragRoh = { medien_urls?: unknown };

/** Steckt diese Adresse in irgendeinem Beitrag? */
export function istVerwendet(url: unknown, beitraege: BeitragRoh[] | null | undefined): boolean {
  const gesucht = String(url ?? '').trim();
  if (!gesucht) return false;
  for (const b of beitraege || []) {
    const urls = Array.isArray(b?.medien_urls) ? b.medien_urls : [];
    for (const u of urls) {
      if (String(u ?? '').trim() === gesucht) return true;
    }
  }
  return false;
}

export type VideoRoh = { id?: unknown; pfad?: unknown; url?: unknown; erstellt_am?: unknown };

function zeit(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Was darf weg: alt genug UND in keinem Beitrag verwendet.
 *
 * Beide Bedingungen zusammen — ein Video, das seit gestern in einem geplanten
 * Beitrag haengt, verschwindet nicht, und ein frisch hochgeladenes auch nicht,
 * nur weil es noch nirgends eingebaut ist.
 */
export function zumAufraeumen(
  videos: VideoRoh[] | null | undefined,
  beitraege: BeitragRoh[] | null | undefined,
  jetztIso: string,
  tage: number = AUFRAEUM_TAGE,
): VideoRoh[] {
  const jetzt = zeit(jetztIso) || Date.now();
  const grenze = jetzt - Math.max(1, tage) * TAG_MS;
  return (videos || []).filter((v) => {
    const alt = zeit(v?.erstellt_am);
    if (alt <= 0 || alt > grenze) return false;
    return !istVerwendet(v?.url, beitraege);
  });
}

/** Menschlicher Satz fuers Cron-Protokoll. */
export function aufraeumBericht(geprueft: number, geloescht: number, tage: number = AUFRAEUM_TAGE): string {
  if (geloescht === 0) {
    return `Nichts aufzuräumen (${geprueft} Videos geprüft, keines älter als ${tage} Tage und ungenutzt).`;
  }
  return `${geloescht} von ${geprueft} Videos entfernt — älter als ${tage} Tage und in keinem Beitrag verwendet.`;
}
