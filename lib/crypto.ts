// ============================================================================
// ARGONAUT OS · lib/crypto.ts — umkehrbare Verschlüsselung für Fremd-Tokens
//
// ⚠️ NUR SERVERSEITIG. Niemals in eine Client-Komponente importieren.
//
// Für Geheimnisse, die wir SPÄTER WIEDER BRAUCHEN (z. B. WhatsApp-/Meta-Token
// zum Versenden) — anders als ARGONAUTs eigene API-Schlüssel, die gehasht
// werden (lib/apiSchluessel.ts). Verfahren: AES-256-GCM (authentifiziert).
//
// Der Schlüssel kommt aus der Umgebungsvariable APP_ENC_KEY:
//   - 64 Hex-Zeichen  (32 Byte)  ODER
//   - Base64 mit 32 Byte Inhalt.
// Format des Chiffrats:  base64( iv[12] | authTag[16] | ciphertext )
// ============================================================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function schluessel(): Buffer {
  const roh = (process.env.APP_ENC_KEY || '').trim();
  if (!roh) {
    throw new Error('APP_ENC_KEY fehlt — bitte einen 32-Byte-Schlüssel (64 Hex-Zeichen) in den Umgebungsvariablen setzen.');
  }
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(roh)) key = Buffer.from(roh, 'hex');
  else key = Buffer.from(roh, 'base64');
  if (key.length !== 32) {
    throw new Error('APP_ENC_KEY ist ungültig — es werden genau 32 Byte erwartet (64 Hex-Zeichen oder Base64 mit 32 Byte).');
  }
  return key;
}

/** Klartext -> Chiffrat (base64). Leerer/None-Wert -> ''. */
export function verschluessele(klartext: string | null | undefined): string {
  const text = klartext ?? '';
  if (!text) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, schluessel(), iv);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Chiffrat (base64) -> Klartext. Leerer Wert -> ''. Wirft bei Manipulation. */
export function entschluessele(chiffrat: string | null | undefined): string {
  const roh = (chiffrat ?? '').trim();
  if (!roh) return '';
  const buf = Buffer.from(roh, 'base64');
  if (buf.length < 12 + 16 + 1) throw new Error('Chiffrat ist zu kurz oder beschädigt.');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, schluessel(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Ist ein App-Verschlüsselungs-Schlüssel gesetzt & gültig? (für Klartext-Fehlermeldungen) */
export function encKeyBereit(): boolean {
  try { schluessel(); return true; } catch { return false; }
}

/** Harmloser Wiedererkennungs-Hinweis für ein Geheimnis: „abcd…wxyz". */
export function tokenHinweis(klartext: string | null | undefined): string {
  const k = (klartext ?? '').trim();
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
