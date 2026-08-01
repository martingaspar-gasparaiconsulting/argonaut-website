// ============================================================================
// ARGONAUT OS · lib/mailKalender.ts — Mail-/Kalender-Sync (Punkt 14 · A14)
//
// Reiner Katalog + Helfer (KEINE Imports, KEINE Hooks) — von Client- und
// Server-Code nutzbar. Definiert die anschließbaren Anbieter (Outlook/Google/
// IMAP/CalDAV). Der eigentliche Sync (Postfach ↔ ARGONAUT, Kalender-Abgleich)
// ist „in Aufbau"; hier steckt nur, WAS sich verbinden lässt und WAS es kann.
// ============================================================================

export type MailAnbieter = {
  /** Stabiler Schlüssel (in mail_zugang.anbieter gespeichert). */
  key: string;
  /** Anzeigename. */
  name: string;
  /** Emoji fürs Kärtchen. */
  icon: string;
  /** Beschriftung des Konto-/Kennungsfeldes. */
  idLabel: string;
  /** Beschriftung des Geheimnis-Feldes (Client-Secret / App-Passwort). */
  tokenLabel: string;
  /** Was dieser Anbieter synchronisieren kann. */
  bereiche: string[];
  /** Kurzer Hinweis, wo der Kunde die Zugangsdaten herbekommt. */
  hinweis: string;
};

export const MAIL_ANBIETER: MailAnbieter[] = [
  {
    key: 'microsoft',
    name: 'Microsoft 365 / Outlook',
    icon: '📧',
    idLabel: 'E-Mail-Adresse (Postfach)',
    tokenLabel: 'Client-Secret (Azure-App)',
    bereiche: ['E-Mail', 'Kalender', 'Kontakte'],
    hinweis: 'Azure-Portal → App-Registrierung → Client-Secret.',
  },
  {
    key: 'google',
    name: 'Google Workspace / Gmail',
    icon: '📨',
    idLabel: 'E-Mail-Adresse (Konto)',
    tokenLabel: 'Client-Secret (Google Cloud)',
    bereiche: ['E-Mail', 'Kalender', 'Kontakte'],
    hinweis: 'Google Cloud Console → OAuth-Client → Client-Secret.',
  },
  {
    key: 'imap',
    name: 'IMAP / SMTP (andere)',
    icon: '✉️',
    idLabel: 'E-Mail-Adresse',
    tokenLabel: 'Passwort / App-Passwort',
    bereiche: ['E-Mail'],
    hinweis: 'Zugangsdaten aus deinem E-Mail-Anbieter (z. B. IONOS, GMX).',
  },
  {
    key: 'caldav',
    name: 'CalDAV (Kalender)',
    icon: '🗓',
    idLabel: 'Kalender-URL',
    tokenLabel: 'Passwort',
    bereiche: ['Kalender'],
    hinweis: 'Kalender-Freigabe-URL + Passwort aus deinem Kalender-Dienst.',
  },
];

/** Prüft, ob ein Schlüssel ein bekannter Anbieter ist. */
export function istMailAnbieter(key: unknown): boolean {
  return typeof key === 'string' && MAIL_ANBIETER.some((a) => a.key === key);
}

/** Voller Anbieter-Datensatz oder undefined. */
export function mailAnbieterInfo(key: string): MailAnbieter | undefined {
  return MAIL_ANBIETER.find((a) => a.key === key);
}

/** Anzeigename oder „—". */
export function mailAnbieterName(key: string): string {
  return mailAnbieterInfo(key)?.name ?? '—';
}

/** Bereiche als lesbarer Text, z. B. „E-Mail · Kalender · Kontakte". */
export function bereicheText(key: string): string {
  const a = mailAnbieterInfo(key);
  return a ? a.bereiche.join(' · ') : '';
}
