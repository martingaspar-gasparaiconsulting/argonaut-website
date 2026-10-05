// ============================================================================
// ARGONAUT OS · lib/fernhilfe.ts  (Stufe 3 · B10 Fernhilfe: Bildschirm teilen, Paket 209)
//
// Reine Logik (ohne Datenbank, ohne Browser) für die Fernhilfe.
//
// Ablauf:
//   1. Wer Hilfe braucht, klickt „Hilfe anfordern", wählt den Helfer
//      (Geschäftsleitung des eigenen Betriebs oder ARGONAUT-Support) und gibt
//      im Browser SELBST frei, was geteilt wird (ganzer Bildschirm, ein Fenster
//      oder nur der ARGONAUT-Tab). Ohne diesen Klick sieht niemand etwas.
//   2. Der Server legt eine Sitzung an (30 Minuten gültig) und gibt einen Link
//      zum Weitergeben. Der Link enthält NUR die Sitzungs-Kennung — den
//      geheimen Kanal bekommt der Helfer erst nach der Rechte-Prüfung.
//   3. Meldet sich der Helfer, fragt die Seite nach: „X möchte zusehen —
//      zulassen?". Erst dann fließt das Bild (direkt zwischen den beiden
//      Browsern, WebRTC). Es wird nichts aufgezeichnet.
//   4. Rotes Band, solange geteilt wird; beenden jederzeit — auch über den
//      Browser-Knopf „Freigabe beenden".
// ============================================================================

export const GUELTIG_MINUTEN = 30;
export const MAX_OFFENE_JE_PERSON = 3;
export const KANAL_PREFIX = 'fernhilfe-';

export type HelferArt = 'betrieb' | 'argonaut';
export type SitzungStatus = 'wartet' | 'verbunden' | 'beendet';

export type Sitzung = {
  id: string;
  owner_user_id: string;
  angefordert_von: string;
  helfer_art: HelferArt | string;
  status: SitzungStatus | string;
  gueltig_bis: string;
  helfer_id?: string | null;
};

/** Kanal-Geheimnis aus 24 Zufalls-Bytes (48 Hex-Zeichen). */
export function kanalAus(bytes: Uint8Array): string {
  if (!bytes || bytes.length < 24) throw new Error('zu wenig Zufall');
  return Array.from(bytes.slice(0, 24), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function istKanal(k: unknown): k is string {
  return typeof k === 'string' && /^[0-9a-f]{48}$/.test(k);
}

export function kanalName(k: string): string {
  return KANAL_PREFIX + k;
}

export function istHelferArt(a: unknown): a is HelferArt {
  return a === 'betrieb' || a === 'argonaut';
}

export function gueltigBis(jetzt: Date, minuten = GUELTIG_MINUTEN): string {
  return new Date(jetzt.getTime() + minuten * 60_000).toISOString();
}

/** Läuft die Sitzung noch (nicht beendet, nicht abgelaufen)? */
export function sitzungAktiv(s: Pick<Sitzung, 'status' | 'gueltig_bis'> | null | undefined, jetzt: Date): boolean {
  if (!s || s.status === 'beendet') return false;
  const bis = Date.parse(String(s.gueltig_bis ?? ''));
  return Number.isFinite(bis) && bis > jetzt.getTime();
}

/** Kurzer Anlass, ohne Steuerzeichen, höchstens 300 Zeichen. */
export function grundSaeubern(g: unknown): string {
  return String(g ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export type BeitrittsLage = {
  userId: string | null;
  /** Betreiber von ARGONAUT (Rolle admin + Betreiber-Kennung + ggf. zweiter Faktor). */
  istBetreiber: boolean;
  jetzt: Date;
};

/**
 * Darf diese Person als Helfer zusehen?
 *  - nie die anfordernde Person selbst
 *  - „betrieb": nur die Geschäftsleitung des Betriebs (Kennung = Betrieb)
 *  - „argonaut": nur der Betreiber
 *  - nur aktive Sitzungen; ist schon ein anderer Helfer verbunden, nein
 */
export function darfBeitreten(s: Sitzung | null | undefined, l: BeitrittsLage): { ok: true } | { ok: false; status: 401 | 403 | 404 | 409 | 410; fehler: string } {
  if (!l.userId) return { ok: false, status: 401, fehler: 'Bitte anmelden.' };
  if (!s) return { ok: false, status: 404, fehler: 'Diese Hilfe-Sitzung gibt es nicht.' };
  if (!sitzungAktiv(s, l.jetzt)) return { ok: false, status: 410, fehler: 'Diese Hilfe-Sitzung ist beendet oder abgelaufen.' };
  if (s.angefordert_von === l.userId) return { ok: false, status: 403, fehler: 'Sie können nicht Ihre eigene Hilfe-Anfrage öffnen.' };
  const erlaubt = s.helfer_art === 'argonaut' ? l.istBetreiber : s.helfer_art === 'betrieb' ? l.userId === s.owner_user_id : false;
  if (!erlaubt) return { ok: false, status: 403, fehler: 'Diese Hilfe-Anfrage ist nicht an Sie gerichtet.' };
  if (s.helfer_id && s.helfer_id !== l.userId) return { ok: false, status: 409, fehler: 'Eine andere Person hilft bereits.' };
  return { ok: true };
}

/** Beenden dürfen beide Seiten (Anfragende Person und verbundener Helfer). */
export function darfBeenden(s: Sitzung | null | undefined, userId: string | null, istBetreiber: boolean): boolean {
  if (!s || !userId) return false;
  if (s.angefordert_von === userId) return true;
  if (s.helfer_id && s.helfer_id === userId) return true;
  return s.helfer_art === 'argonaut' ? istBetreiber : userId === s.owner_user_id;
}

/**
 * Felder, die beim Teilen des ARGONAUT-Tabs unscharf werden.
 * Hinweis: wirkt nur auf ARGONAUT selbst — teilt jemand den ganzen
 * Bildschirm, sind andere Programme nicht verdeckt (steht so im Dialog).
 */
export const VERDECKT_SELEKTOR = [
  'input[type="password"]',
  'input[autocomplete="cc-number"]',
  'input[name*="iban" i]',
  'input[id*="iban" i]',
  'input[name*="bic" i]',
  'input[name*="passwort" i]',
  '[data-vertraulich]',
].join(', ');

export const VERDECKT_CSS = `body.fernhilfe-aktiv :is(${VERDECKT_SELEKTOR}){filter:blur(7px)!important;}`;

/** Öffentlicher STUN-Server (nur Adress-Ermittlung, kein Bild läuft darüber). */
export const ICE_SERVER = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Nachrichten im Kanal — nur diese Arten werden angenommen. */
export const SIGNAL_ARTEN = ['hallo', 'zugelassen', 'abgelehnt', 'angebot', 'antwort', 'kandidat', 'ende'] as const;
export type SignalArt = (typeof SIGNAL_ARTEN)[number];

export function istSignal(x: unknown): x is { art: SignalArt; von: 'teiler' | 'helfer'; daten?: unknown } {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (SIGNAL_ARTEN as readonly string[]).includes(String(o.art)) && (o.von === 'teiler' || o.von === 'helfer');
}
