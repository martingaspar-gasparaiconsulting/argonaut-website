// ============================================================================
// ARGONAUT OS · lib/posteingang.ts — reine Aufbereitung der Posteingang-Zeilen
//
// Wandelt eine IMAP-Nachricht (imapflow: uid/envelope/flags/internalDate) in
// eine saubere, anzeigefertige Zeile. KEINE Netzwerk-/IMAP-Aufrufe — nur pure,
// node-testbare Logik. Der eigentliche Abruf passiert in der Route.
// ============================================================================

export type MailZeile = {
  uid: number;
  vonName: string;
  vonAdresse: string;
  betreff: string;
  datumIso: string;
  gelesen: boolean;
};

/** IMAP-Flags → gelesen? Akzeptiert Set, Array oder nichts. */
export function istGelesen(flags: unknown): boolean {
  if (flags instanceof Set) return flags.has('\\Seen');
  if (Array.isArray(flags)) return flags.includes('\\Seen');
  return false;
}

function alsIso(d: unknown): string {
  if (d instanceof Date) return isNaN(d.getTime()) ? '' : d.toISOString();
  const t = new Date(String(d ?? ''));
  return isNaN(t.getTime()) ? '' : t.toISOString();
}

export type RohMsg = {
  uid?: unknown;
  flags?: unknown;
  internalDate?: unknown;
  envelope?: { subject?: unknown; date?: unknown; from?: Array<{ name?: unknown; address?: unknown }> | null };
};

/** Eine IMAP-Nachricht defensiv in eine Anzeige-Zeile wandeln. */
export function mailZeile(msg: RohMsg): MailZeile {
  const from = (msg?.envelope?.from && msg.envelope.from[0]) || {};
  const betreff = String(msg?.envelope?.subject ?? '').trim();
  return {
    uid: Number(msg?.uid) || 0,
    vonName: String(from.name ?? '').trim(),
    vonAdresse: String(from.address ?? '').trim(),
    betreff: betreff || '(kein Betreff)',
    datumIso: alsIso(msg?.internalDate ?? msg?.envelope?.date),
    gelesen: istGelesen(msg?.flags),
  };
}

/** Absender-Anzeige: Name falls vorhanden, sonst Adresse. */
export function absenderAnzeige(z: MailZeile): string {
  return z.vonName || z.vonAdresse || 'Unbekannt';
}
