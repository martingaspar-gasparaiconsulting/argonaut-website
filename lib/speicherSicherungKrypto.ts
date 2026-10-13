// ============================================================================
// ARGONAUT OS · lib/speicherSicherungKrypto.ts — Paket 350 (A2 Datei-Sicherung)
//
// Die zwei Rechen-Bausteine der Datei-Sicherung, ohne jedes Netz:
//   1. AWS-Signatur Version 4 (SigV4) — damit spricht ARGONAUT mit jedem
//      S3-kompatiblen Speicher (Empfehlung: Hetzner Object Storage, Deutschland).
//      Selbst geschrieben mit node:crypto, KEIN neues npm-Paket. Geprüft gegen
//      die veröffentlichten AWS-Beispiele (tests/speicherSicherungP350).
//   2. Verschlüsselung AES-256-GCM. Jede Datei verlässt Supabase NUR
//      verschlüsselt. Format „AGS1": 4 Byte Kennung + 12 Byte IV + Chiffrat +
//      16 Byte Prüf-Tag. Als Zusatzdaten (AAD) wird „bucket/name" eingerechnet —
//      eine Datei lässt sich nicht unbemerkt unter fremdem Namen zurückspielen.
//
// Der Schlüssel (64 Hex-Zeichen) steht NUR in der Server-Umgebung
// (SPEICHER_SICHERUNG_SCHLUESSEL) und offline bei Martin. Ohne ihn ist die
// Sicherung wertlos — mit ihm allein kommt niemand an die Dateien, der nicht
// auch den Zugang zum Ziel-Speicher hat.
// ============================================================================

import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const FORMAT_KENNUNG = 'AGS1';
const IV_LAENGE = 12;
const TAG_LAENGE = 16;

/** SHA-256 als Hex. */
export function sha256Hex(daten: Uint8Array | string): string {
  return createHash('sha256').update(daten).digest('hex');
}

/** SHA-256 des leeren Inhalts — für GET/DELETE ohne Körper. */
export const LEER_HASH = sha256Hex('');

function hmac(schluessel: Uint8Array | string, text: string): Buffer {
  return createHmac('sha256', schluessel).update(text, 'utf8').digest();
}

/**
 * URI-Kodierung nach SigV4: alles außer A–Z a–z 0–9 - . _ ~ wird %XX (Großbuchstaben),
 * im Pfad bleibt „/" stehen. Mehrbyte-Zeichen werden byteweise kodiert.
 */
export function uriKodieren(text: string, pfad: boolean): string {
  let aus = '';
  for (const byte of Buffer.from(text, 'utf8')) {
    const z = String.fromCharCode(byte);
    if ((byte < 128 && /[A-Za-z0-9\-._~]/.test(z)) || (pfad && z === '/')) aus += z;
    else aus += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
  }
  return aus;
}

/** Die Abfrage-Parameter in kanonischer Form (kodiert, sortiert). */
export function kanonischeAbfrage(abfrage: Array<[string, string]>): string {
  return abfrage
    .map(([k, v]) => [uriKodieren(k, false), uriKodieren(v, false)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

export type SignaturEingabe = {
  methode: string;
  /** Bereits kodierter Pfad, z. B. /bucket/speicher/a%20b.ags */
  pfad: string;
  abfrage?: Array<[string, string]>;
  /** ALLE zu signierenden Köpfe, inkl. host und x-amz-date. */
  koepfe: Record<string, string>;
  inhaltHash: string;
  region: string;
  dienst: string;
  schluesselId: string;
  geheimnis: string;
  /** Format 20130524T000000Z */
  amzDatum: string;
};

export type Signatur = { authorization: string; signierteKoepfe: string; kanonischeAnfrage: string; zuSignieren: string; signatur: string };

/** SigV4: rechnet den Authorization-Kopf. Rein, ohne Uhr und ohne Netz. */
export function signieren(e: SignaturEingabe): Signatur {
  const namen = Object.keys(e.koepfe).map((k) => k.toLowerCase());
  const werte = new Map<string, string>();
  for (const [k, v] of Object.entries(e.koepfe)) werte.set(k.toLowerCase(), String(v).trim().replace(/\s+/g, ' '));
  const sortiert = [...new Set(namen)].sort();
  const kanonischeKoepfe = sortiert.map((k) => `${k}:${werte.get(k)}\n`).join('');
  const signierteKoepfe = sortiert.join(';');
  const kanonischeAnfrage = [
    e.methode.toUpperCase(),
    e.pfad || '/',
    kanonischeAbfrage(e.abfrage ?? []),
    kanonischeKoepfe,
    signierteKoepfe,
    e.inhaltHash,
  ].join('\n');
  const tag = e.amzDatum.slice(0, 8);
  const bereich = `${tag}/${e.region}/${e.dienst}/aws4_request`;
  const zuSignieren = ['AWS4-HMAC-SHA256', e.amzDatum, bereich, sha256Hex(kanonischeAnfrage)].join('\n');
  const kDatum = hmac('AWS4' + e.geheimnis, tag);
  const kRegion = hmac(kDatum, e.region);
  const kDienst = hmac(kRegion, e.dienst);
  const kSign = hmac(kDienst, 'aws4_request');
  const signatur = createHmac('sha256', kSign).update(zuSignieren, 'utf8').digest('hex');
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${e.schluesselId}/${bereich}, SignedHeaders=${signierteKoepfe}, Signature=${signatur}`,
    signierteKoepfe, kanonischeAnfrage, zuSignieren, signatur,
  };
}

/** 2026-10-13T10:40:00.123Z -> 20261013T104000Z */
export function amzDatum(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function schluesselBytes(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('Der Sicherungs-Schlüssel muss aus 64 Hex-Zeichen bestehen.');
  return Buffer.from(hex, 'hex');
}

/** Kurze, nicht umkehrbare Kennung des Schlüssels — zeigt, WELCHER Schlüssel eine Datei verschlüsselt hat. */
export function schluesselKennung(hex: string): string {
  return 'k' + sha256Hex('argonaut-speicher-sicherung:' + hex.toLowerCase()).slice(0, 11);
}

/** AES-256-GCM. Ergebnis: AGS1 | IV(12) | Chiffrat | Tag(16). */
export function verschluesseln(klar: Uint8Array, schluesselHex: string, zusatz: string, iv: Uint8Array = randomBytes(IV_LAENGE)): Buffer {
  if (iv.length !== IV_LAENGE) throw new Error('IV muss 12 Byte lang sein.');
  const c = createCipheriv('aes-256-gcm', schluesselBytes(schluesselHex), iv);
  c.setAAD(Buffer.from(zusatz, 'utf8'));
  const teil = Buffer.concat([c.update(klar), c.final()]);
  return Buffer.concat([Buffer.from(FORMAT_KENNUNG, 'ascii'), Buffer.from(iv), teil, c.getAuthTag()]);
}

/** Gegenstück. Wirft bei falschem Schlüssel, falschem Namen oder veränderten Bytes. */
export function entschluesseln(daten: Uint8Array, schluesselHex: string, zusatz: string): Buffer {
  const b = Buffer.from(daten);
  if (b.length < 4 + IV_LAENGE + TAG_LAENGE || b.subarray(0, 4).toString('ascii') !== FORMAT_KENNUNG) {
    throw new Error('Keine ARGONAUT-Sicherungsdatei (Format AGS1 erwartet).');
  }
  const iv = b.subarray(4, 4 + IV_LAENGE);
  const tag = b.subarray(b.length - TAG_LAENGE);
  const chiffrat = b.subarray(4 + IV_LAENGE, b.length - TAG_LAENGE);
  const d = createDecipheriv('aes-256-gcm', schluesselBytes(schluesselHex), iv);
  d.setAAD(Buffer.from(zusatz, 'utf8'));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(chiffrat), d.final()]);
}
