// ============================================================================
// ARGONAUT OS · lib/gesundheitsdaten.ts — Gesundheitsdaten-Schicht (Paket PQ, H03)
//
// NUR SERVER (node:crypto). Die Seite importiert diese Datei nie; sie spricht
// mit /api/gesundheit-notiz.
//
// Warum eigene Verschlüsselung, obwohl die Datenbank schon verschlüsselt ist?
// Die Plattenverschlüsselung schützt vor gestohlenen Festplatten, nicht vor
// einem falschen Zugriff über die Datenbank selbst. Hier liegt der Schlüssel
// NUR auf dem Server (Umgebungsvariable GESUNDHEIT_SCHLUESSEL). Wer die Tabelle
// direkt liest — auch mit gültigem Login — sieht nur Zeichensalat. Lesbar wird
// eine Angabe nur über die API-Route, und die schreibt VOR dem Entschlüsseln
// einen Eintrag ins Zugriffsprotokoll. Klappt das Protokoll nicht, gibt es
// keine Daten (fail closed).
//
// Verfahren: AES-256-GCM, 12 Byte Zufalls-IV je Eintrag, 16 Byte Prüfsumme.
// Als Zusatzdaten (AAD) gehen Betrieb und Kunde mit ein: Ein Eintrag, der in
// der Datenbank auf einen anderen Kunden umgehängt wird, lässt sich nicht mehr
// entschlüsseln.
//
// Format: "v1:<iv base64>:<tag base64>:<daten base64>" — die Datenbank prüft
// dieses Format (Check-Regel), damit niemand Klartext hineinschreiben kann.
//
// ACHTUNG: Geht der Schlüssel verloren, sind die Angaben nicht mehr lesbar.
// Schlüssel im Passwort-Manager sichern.
// ============================================================================
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const SCHLUESSEL_VERSION = 'v1';
const FORMAT = /^v1:([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/;

/** Liest den Schlüssel (Base64, genau 32 Byte). Alles andere -> null. */
export function leseSchluessel(wert: string | undefined | null): Buffer | null {
  const s = String(wert ?? '').trim();
  if (!s || !/^[A-Za-z0-9+/=]+$/.test(s)) return null;
  const b = Buffer.from(s, 'base64');
  return b.length === 32 ? b : null;
}

/** Zusatzdaten, die an Betrieb und Kunde binden. */
export function bindung(ownerId: string, kundeId: string): string {
  return `${ownerId}:${kundeId}`;
}

export function verschluessele(klartext: string, schluessel: Buffer, zusatz: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', schluessel, iv);
  c.setAAD(Buffer.from(zusatz, 'utf8'));
  const daten = Buffer.concat([c.update(klartext, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `${SCHLUESSEL_VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${daten.toString('base64')}`;
}

/** Entschlüsselt. Falscher Schlüssel, falsche Bindung oder veränderte Daten -> null. */
export function entschluessele(paket: string, schluessel: Buffer, zusatz: string): string | null {
  const m = FORMAT.exec(String(paket ?? ''));
  if (!m) return null;
  try {
    const iv = Buffer.from(m[1], 'base64');
    const tag = Buffer.from(m[2], 'base64');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv('aes-256-gcm', schluessel, iv);
    d.setAAD(Buffer.from(zusatz, 'utf8'));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(Buffer.from(m[3], 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function istVerschluesselt(wert: unknown): boolean {
  return typeof wert === 'string' && FORMAT.test(wert);
}
