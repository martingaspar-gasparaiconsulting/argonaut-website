// ============================================================================
// ARGONAUT OS · lib/ablaufWebhook.ts — Baustein „Webhook senden" (Paket 167)
//
// Martins Sicherheits-Regel (28.09.2026): Abläufe werden NIE von außen
// angestoßen („Webhook rein" ist gestrichen). Erlaubt ist nur die Richtung
// NACH AUSSEN — ein Ablauf meldet z. B. an n8n „Rechnung bezahlt".
//
// Diese Datei ist rein (nur node:crypto) und node-getestet:
//   · pruefeWebhookUrl  nur https, keine internen Adressen (lib/adressPruefung),
//                       nie die eigenen Systeme (ARGONAUT, Supabase, Vercel …)
//   · gesperrtesFeld    Bank-, Steuer-, Gesundheits- und Zugangsdaten gehen nie raus
//   · baueNutzlast      Datensparsam: Vorgangs-Kennung, Nummer, Name, Betrag —
//                       weitere Felder nur, wenn der Chef sie ausdrücklich wählt
//   · webhookSchluessel/signiere  HMAC-SHA256 über „Zeit.Inhalt", damit der
//                       Empfänger prüfen kann, dass die Meldung von uns kommt
// Das eigentliche Senden (mit Prüfung der AUFGELÖSTEN Adresse) steht in
// lib/ablaufWebhookSenden.ts.
// ============================================================================

import { createHmac } from 'node:crypto';
import { gesperrtesFeld, felderListe } from './ablaufWebhookPruefung';

export { pruefeWebhookUrl, gesperrtesFeld, felderListe, istEigenerHost, EIGENE_HOSTS } from './ablaufWebhookPruefung';

function wertAm(daten: Record<string, unknown>, pfad: string): unknown {
  let x: unknown = daten;
  for (const t of pfad.split('.')) {
    if (x === null || x === undefined || typeof x !== 'object') return undefined;
    x = (x as Record<string, unknown>)[t];
  }
  return x;
}

export type Nutzlast = {
  quelle: 'argonaut';
  art: 'ablauf';
  ablauf: { id: string | null; name: string };
  vorgang: { typ: string; id: string | null; nummer: string; name: string; betrag: string } | null;
  felder: Record<string, string | number | boolean | null>;
  zeit: string;
};

/**
 * Was geht raus? Immer nur: Ablauf, Vorgangs-Kennung, Nummer, Name, Betrag.
 * Ausgewählte Zusatzfelder nur als einfache Werte (Text, Zahl, Ja/Nein) —
 * gesperrte Felder und verschachtelte Daten nie.
 */
export function baueNutzlast(opt: {
  ablaufId?: string | null; ablaufName: string; zielTyp: string; zielId: string | null;
  satz: Record<string, unknown>; werte: Record<string, string>; felder: unknown; jetzt: Date;
}): Nutzlast {
  const felder: Nutzlast['felder'] = {};
  for (const f of felderListe(opt.felder)) {
    if (gesperrtesFeld(f)) continue;
    const v = wertAm(opt.satz, f);
    if (v === null || v === undefined) felder[f] = null;
    else if (typeof v === 'string') felder[f] = v.slice(0, 2000);
    else if (typeof v === 'number' || typeof v === 'boolean') felder[f] = v;
    // Objekte/Listen bewusst nicht (könnten ganze Kundendatensätze enthalten)
  }
  const mitVorgang = opt.zielTyp !== 'ohne' && !!opt.zielId;
  return {
    quelle: 'argonaut',
    art: 'ablauf',
    ablauf: { id: opt.ablaufId ?? null, name: opt.ablaufName },
    vorgang: mitVorgang
      ? { typ: opt.zielTyp, id: opt.zielId, nummer: opt.werte.nummer ?? '', name: opt.werte.name ?? '', betrag: opt.werte.betrag ?? '' }
      : null,
    felder,
    zeit: opt.jetzt.toISOString(),
  };
}

/** Grundgeheimnis des Servers (nie im Browser). Leer = Webhooks gehen nicht. */
export function webhookGrundgeheimnis(env: Record<string, string | undefined> = process.env): string {
  return env.ABLAUF_WEBHOOK_GEHEIMNIS || env.APP_ENC_KEY || '';
}

/** Schlüssel je Ablauf — der Chef trägt ihn beim Empfänger (n8n) ein. */
export function webhookSchluessel(ablaufId: string, grund: string = webhookGrundgeheimnis()): string {
  if (!grund || !ablaufId) return '';
  return createHmac('sha256', 'ablauf-webhook|' + grund).update(ablaufId).digest('hex').slice(0, 48);
}

/** Unterschrift: HMAC-SHA256(Schlüssel, "<zeit>.<inhalt>") als Hex. */
export function signiere(schluessel: string, zeit: string, inhalt: string): string {
  return createHmac('sha256', schluessel).update(`${zeit}.${inhalt}`).digest('hex');
}

/** Kopfzeilen der Meldung (Empfänger prüft X-Argonaut-Signatur). */
export function webhookKoepfe(schluessel: string, zeit: string, inhalt: string): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    'user-agent': 'ARGONAUT-Ablauf/1.0',
    'x-argonaut-zeit': zeit,
    'x-argonaut-signatur': 'sha256=' + signiere(schluessel, zeit, inhalt),
  };
}
