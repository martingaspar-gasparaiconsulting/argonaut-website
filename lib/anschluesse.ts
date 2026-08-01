// ============================================================================
// ARGONAUT OS · lib/anschluesse.ts — Anschlüsse-Cockpit (Registry + Helfer)
//
// Zentrale Liste ALLER externen Anschlüsse (verschlüsselte *_zugang-Tabellen).
// Das Cockpit zeigt je Anschluss: verbunden / nicht verbunden — plus den
// Hinweis „Sync in Aufbau". Reiner Katalog + reine Logik (KEINE Imports,
// KEINE Hooks) — von Client- und Server-Code nutzbar.
// ============================================================================

export type AnschlussKat = 'Kommunikation' | 'Vertrieb' | 'Finanzen' | 'Logistik' | 'Marketing';

export type Anschluss = {
  /** Stabiler Schlüssel. */
  key: string;
  /** Anzeigename. */
  name: string;
  /** Emoji. */
  icon: string;
  /** Rubrik im Cockpit. */
  kategorie: AnschlussKat;
  /** Zugehörige verschlüsselte Zugangs-Tabelle (hat immer owner_user_id). */
  tabelle: string;
  /** Dashboard-Seite zum Einrichten. */
  href: string;
  /** Ein-Zeiler: was dieser Anschluss macht. */
  was: string;
};

export const ANSCHLUSS_KATEGORIEN: AnschlussKat[] = ['Kommunikation', 'Vertrieb', 'Finanzen', 'Logistik', 'Marketing'];

export const ANSCHLUESSE: Anschluss[] = [
  { key: 'mail',       name: 'Mail & Kalender',      icon: '📬', kategorie: 'Kommunikation', tabelle: 'mail_zugang',       href: '/dashboard/mail-sync',    was: 'Postfach & Kalender (Outlook · Google · IMAP · CalDAV)' },
  { key: 'marktplatz', name: 'Marktplätze',          icon: '🛒', kategorie: 'Vertrieb',      tabelle: 'marktplatz_zugang', href: '/dashboard/marktplaetze', was: 'Bestellungen & Bestand (Amazon · eBay · Kaufland · OTTO)' },
  { key: 'versand',    name: 'Versand & Frankierung',icon: '📦', kategorie: 'Logistik',      tabelle: 'versand_zugang',    href: '/dashboard/versand',      was: 'Versandlabels & Sendungsverfolgung (shipcloud)' },
  { key: 'banking',    name: 'Banking-Abgleich',     icon: '🏦', kategorie: 'Finanzen',      tabelle: 'bank_zugang',       href: '/dashboard/banking',      was: 'Bank-Umsätze ↔ Rechnungen (mehrere Banken)' },
  { key: 'elster',     name: 'ELSTER / UStVA',       icon: '🏛', kategorie: 'Finanzen',      tabelle: 'elster_zugang',     href: '/dashboard/elster',       was: 'USt-Voranmeldung ans Finanzamt' },
  { key: 'ads',        name: 'Werbeanzeigen',        icon: '📣', kategorie: 'Marketing',     tabelle: 'ads_zugang',        href: '/dashboard/marketing',    was: 'Anzeigen-Konten (Google Ads · Meta)' },
];

export type AnschlussStatus = 'verbunden' | 'offen';

/** Anschluss samt aktuellem Verbindungs-Status (fürs Cockpit). */
export type AnschlussMitStatus = Anschluss & { status: AnschlussStatus; anzahl: number };

export function anschlussInfo(key: string): Anschluss | undefined {
  return ANSCHLUESSE.find((a) => a.key === key);
}

/** Aus einer Zähl-Map { key: anzahl } die Status-Liste in Katalog-Reihenfolge bauen. */
export function baueStatusListe(anzahlMap: Record<string, number>): AnschlussMitStatus[] {
  return ANSCHLUESSE.map((a) => {
    const anzahl = Math.max(0, Number(anzahlMap[a.key] ?? 0)) | 0;
    return { ...a, anzahl, status: anzahl > 0 ? 'verbunden' : 'offen' };
  });
}

/** Nach Kategorie gruppiert, leere Rubriken fallen raus, feste Reihenfolge. */
export function gruppiereNachKategorie(
  items: AnschlussMitStatus[],
): { kategorie: AnschlussKat; eintraege: AnschlussMitStatus[] }[] {
  return ANSCHLUSS_KATEGORIEN
    .map((kat) => ({ kategorie: kat, eintraege: items.filter((i) => i.kategorie === kat) }))
    .filter((g) => g.eintraege.length > 0);
}

/** Fortschritt: wie viele Anschlüsse sind verbunden. */
export function fortschritt(items: AnschlussMitStatus[]): { verbunden: number; gesamt: number; prozent: number } {
  const gesamt = items.length;
  const verbunden = items.filter((i) => i.status === 'verbunden').length;
  const prozent = gesamt === 0 ? 0 : Math.round((verbunden / gesamt) * 100);
  return { verbunden, gesamt, prozent };
}
