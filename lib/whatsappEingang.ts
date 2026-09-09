// ============================================================================
// ARGONAUT OS · lib/whatsappEingang.ts — G2: WhatsApp hört zu
//
// Bis 09.09.2026 war WhatsApp ein Lautsprecher: Versand, Vorlagen, Opt-in und
// Kontakte standen — nur die ANTWORT des Kunden kam nirgends an. Diese Datei
// ist der Verstand hinter dem Eingang:
//
//   1. Signatur pruefen   — beweist, dass die Nachricht wirklich von Meta kommt
//   2. Nutzlast zerlegen  — aus dem verschachtelten Meta-JSON werden Zeilen
//   3. 24-Stunden-Fenster — danach darf nur noch eine freigegebene Vorlage raus
//
// Nur `node:crypto` als Import, sonst nichts: kein Supabase, kein Netzwerk.
// Damit ist die Sicherheitspruefung mit `node --test` pruefbar — und genau das
// ist sie auch, samt Faelschungsversuch.
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// 1) Signatur — kommt die Nachricht wirklich von Meta?
// ---------------------------------------------------------------------------

/**
 * Meta unterschreibt JEDE Webhook-Nutzlast mit dem App-Secret und schickt das
 * Ergebnis im Kopf `X-Hub-Signature-256: sha256=<hex>`.
 *
 * Zwei Dinge sind hier wichtig und leicht falsch zu machen:
 *   · Es muss der ROHE Text geprueft werden, exakt wie empfangen. Wer die
 *     Nutzlast erst durch JSON.parse und wieder zurueck schickt, veraendert
 *     Reihenfolge und Leerzeichen — die Signatur passt dann nie mehr.
 *   · Der Vergleich laeuft zeitkonstant. Ein normales === verraet ueber die
 *     Antwortzeit, wie viele Zeichen schon stimmen.
 */
export function signaturGueltig(
  rohBody: string,
  signaturKopf: string | null | undefined,
  appSecret: string | null | undefined,
): boolean {
  const kopf = String(signaturKopf ?? '').trim();
  const secret = String(appSecret ?? '');
  if (!kopf || !secret || typeof rohBody !== 'string') return false;
  if (!kopf.startsWith('sha256=')) return false;

  const geliefert = kopf.slice('sha256='.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(geliefert)) return false;

  const erwartet = createHmac('sha256', secret).update(rohBody, 'utf8').digest('hex');

  const a = Buffer.from(geliefert, 'hex');
  const b = Buffer.from(erwartet, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Der Einrichtungs-Handschlag: Meta ruft die Webhook-Adresse EINMAL per GET auf
 * und erwartet die `challenge` im Klartext zurueck — aber nur, wenn der
 * mitgeschickte Token zu dem passt, den der Betrieb hinterlegt hat.
 * Gibt die Antwort zurueck oder null (dann: 403).
 */
export function pruefeEinrichtung(
  params: { mode?: string | null; token?: string | null; challenge?: string | null },
  erwarteterToken: string | null | undefined,
): string | null {
  const soll = String(erwarteterToken ?? '').trim();
  const ist = String(params?.token ?? '').trim();
  const challenge = String(params?.challenge ?? '').trim();
  if (!soll || !ist || !challenge) return null;
  if (String(params?.mode ?? '') !== 'subscribe') return null;
  if (soll.length !== ist.length) return null;
  if (!timingSafeEqual(Buffer.from(soll, 'utf8'), Buffer.from(ist, 'utf8'))) return null;
  return challenge;
}

// ---------------------------------------------------------------------------
// 2) Nutzlast zerlegen
// ---------------------------------------------------------------------------

export type EingangNachricht = {
  /** Die Nummer des Betriebs, an die geschrieben wurde — ordnet den Betrieb zu. */
  phoneNumberId: string;
  /** Absender, international mit +. */
  von: string;
  /** Anzeigename aus dem WhatsApp-Profil, falls Meta ihn mitschickt. */
  name: string;
  /** Der Text. Bei Bild/Ton/Ort steht hier eine Beschreibung in Klartext. */
  text: string;
  /** 'text' | 'image' | 'audio' | 'document' | 'location' | 'button' | … */
  art: string;
  /** Meta-Kennung der Nachricht — schuetzt vor doppeltem Einlesen. */
  providerId: string;
  /** Zeitpunkt als ISO-Text. */
  zeitpunktIso: string;
};

function alsIso(sekunden: unknown): string {
  const n = Number(sekunden);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  const d = new Date(n * 1000);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Aus einer Nicht-Text-Nachricht wird ein Satz, den ein Mensch lesen kann. */
function beschreibung(art: string, m: Record<string, unknown>): string {
  const bildunterschrift = (schluessel: string) => {
    const teil = m[schluessel] as { caption?: unknown } | undefined;
    const c = String(teil?.caption ?? '').trim();
    return c ? ` — „${c}“` : '';
  };
  switch (art) {
    case 'image':    return `[Bild]${bildunterschrift('image')}`;
    case 'video':    return `[Video]${bildunterschrift('video')}`;
    case 'audio':    return '[Sprachnachricht]';
    case 'document': {
      const d = m.document as { filename?: unknown } | undefined;
      const name = String(d?.filename ?? '').trim();
      return name ? `[Datei: ${name}]` : '[Datei]';
    }
    case 'location': {
      const o = m.location as { name?: unknown; latitude?: unknown; longitude?: unknown } | undefined;
      const name = String(o?.name ?? '').trim();
      return name ? `[Standort: ${name}]` : '[Standort gesendet]';
    }
    case 'contacts': return '[Kontakt geteilt]';
    case 'sticker':  return '[Sticker]';
    case 'button': {
      const b = m.button as { text?: unknown } | undefined;
      return String(b?.text ?? '').trim() || '[Knopf gedrückt]';
    }
    case 'interactive': {
      const i = m.interactive as { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } } | undefined;
      const t = String(i?.button_reply?.title ?? i?.list_reply?.title ?? '').trim();
      return t || '[Auswahl getroffen]';
    }
    default: return `[${art}]`;
  }
}

/**
 * Zerlegt die Meta-Nutzlast in flache Zeilen.
 *
 * Der Aufbau ist tief verschachtelt (entry[] → changes[] → value.messages[])
 * und JEDE Ebene kann fehlen. Deshalb wird durchgehend defensiv gelesen:
 * eine kaputte Nutzlast darf niemals werfen, sonst wiederholt Meta die
 * Zustellung immer wieder — und wir bekommen dieselbe Nachricht dutzendfach.
 *
 * Statusmeldungen (zugestellt/gelesen) landen NICHT hier: sie gehoeren zum
 * Versand, nicht zum Eingang.
 */
export function leseEingang(nutzlast: unknown): EingangNachricht[] {
  const raus: EingangNachricht[] = [];
  const wurzel = nutzlast as { entry?: unknown } | null;
  const eintraege = Array.isArray(wurzel?.entry) ? wurzel.entry : [];

  for (const e of eintraege) {
    const changes = Array.isArray((e as { changes?: unknown })?.changes) ? (e as { changes: unknown[] }).changes : [];
    for (const c of changes) {
      const value = (c as { value?: unknown })?.value as {
        metadata?: { phone_number_id?: unknown };
        contacts?: Array<{ wa_id?: unknown; profile?: { name?: unknown } }>;
        messages?: unknown[];
      } | undefined;
      if (!value) continue;

      const phoneNumberId = String(value.metadata?.phone_number_id ?? '').trim();
      const namen = new Map<string, string>();
      for (const k of Array.isArray(value.contacts) ? value.contacts : []) {
        const id = String(k?.wa_id ?? '').trim();
        const nm = String(k?.profile?.name ?? '').trim();
        if (id && nm) namen.set(id, nm);
      }

      for (const roh of Array.isArray(value.messages) ? value.messages : []) {
        const m = (roh ?? {}) as Record<string, unknown>;
        const von = String(m.from ?? '').trim();
        const providerId = String(m.id ?? '').trim();
        if (!von || !providerId) continue;

        const art = String(m.type ?? 'text').trim() || 'text';
        const textTeil = m.text as { body?: unknown } | undefined;
        const text = art === 'text'
          ? String(textTeil?.body ?? '').trim()
          : beschreibung(art, m);

        raus.push({
          phoneNumberId,
          von: von.startsWith('+') ? von : '+' + von,
          name: namen.get(von) ?? '',
          text,
          art,
          providerId,
          zeitpunktIso: alsIso(m.timestamp),
        });
      }
    }
  }
  return raus;
}

// ---------------------------------------------------------------------------
// 3) Das 24-Stunden-Fenster
// ---------------------------------------------------------------------------

export const FENSTER_STUNDEN = 24;

export type FensterStand = {
  offen: boolean;
  /** Verbleibende volle Minuten. 0, wenn zu. */
  restMinuten: number;
  /** Fuer die Anzeige: „noch 3 Std. 20 Min." oder „geschlossen". */
  text: string;
};

/**
 * Nach WhatsApp-Regeln darf ein Betrieb 24 Stunden lang frei antworten,
 * gerechnet ab der LETZTEN Nachricht des Kunden. Danach geht nur noch eine
 * bei Meta freigegebene Vorlage hinaus.
 *
 * Das ist keine Kleinigkeit fuer die Anzeige: Wer es nicht sieht, tippt eine
 * Antwort, drueckt senden — und sie geht nie hinaus.
 */
export function fensterStand(letzteKundennachrichtIso: string | null | undefined, jetzt?: Date): FensterStand {
  const zu: FensterStand = { offen: false, restMinuten: 0, text: 'geschlossen — nur noch Vorlagen' };
  const roh = String(letzteKundennachrichtIso ?? '').trim();
  if (!roh) return zu;

  const start = new Date(roh);
  if (isNaN(start.getTime())) return zu;

  const bezug = jetzt instanceof Date && !isNaN(jetzt.getTime()) ? jetzt : new Date();
  const endeMs = start.getTime() + FENSTER_STUNDEN * 60 * 60 * 1000;
  const restMs = endeMs - bezug.getTime();
  if (restMs <= 0) return zu;

  const restMinuten = Math.floor(restMs / 60000);
  const std = Math.floor(restMinuten / 60);
  const min = restMinuten % 60;
  const text = std > 0 ? `noch ${std} Std. ${min} Min.` : `noch ${min} Min.`;
  return { offen: true, restMinuten, text };
}

/**
 * Erzeugt einen Verify-Token fuer die Einrichtung. Bewusst ohne Sonderzeichen:
 * der Betrieb tippt ihn im Meta-Formular ab, und ein Bindestrich zu viel
 * kostet einen Abend Fehlersuche.
 */
export function baueWebhookToken(zufall: () => number = Math.random): string {
  const zeichen = 'abcdefghijkmnpqrstuvwxyz23456789'; // ohne l, 1, 0 und o
  let s = '';
  for (let i = 0; i < 24; i++) s += zeichen[Math.floor(zufall() * zeichen.length)] ?? 'a';
  return s;
}
