// lib/branchenkatalog.ts
// Control-Room Branchen-Katalog — Motor für „ein Modul-Set je Kategorie,
// Wording je Branche". Ordnet jede der 19 Website-Kategorien einem Modul-Set
// (tenant_module-Keys) zu. KEINE Supabase-Aufrufe, KEINE React-Hooks
// (importierbar von Client, Server-Route und Node). Node-getestet.
//
// Modell (freigegeben 28.07.2026): Kategorie-Set + Wording je Branche.
//   · KERN bekommt jede Branche (aus lib/pakete).
//   · Je Kategorie ein kuratiertes Zusatz-Set aus bestehenden NAV-Modulen.
//   · 'automatisierungen' = Standard-Automatisierung, immer dabei.
// Ein Klick im Katalog schaltet genau dieses Set in tenant_module scharf.

import { KERN_MODULE } from './pakete';

/** Standard-Automatisierung, in jedem Branchen-Paket enthalten. */
export const STANDARD_AUTOMATION = 'automatisierungen';

// Zusatzmodule je Website-Kategorie (über den Kern hinaus). Schlüssel = exakt
// die 19 Kategorie-Namen aus branchen-web KATEGORIE_ORDER.
export const KATEGORIE_MODULE: Record<string, string[]> = {
  'Handwerk & Bau': ['bau-lv', 'aufmass', 'bautagebuch', 'objektzeiten', 'leistungskatalog', 'projekte', 'wartung', 'service', 'erp', 'verleih', 'pruefprotokolle', 'zuschnitt', 'einkauf'],
  'Industrie & Produktion': ['fertigung', 'bde', 'erp', 'lager-scanner', 'projekte', 'pruefprotokolle', 'zuschnitt', 'einkauf', 'wartung'],
  'Handel & E-Commerce': ['shop', 'kasse', 'erp', 'lager-scanner', 'bewertungen', 'verleih', 'pruefprotokolle', 'tour', 'gutscheine', 'einkauf'],
  'Fahrzeuge & Mobilität': ['kfz', 'fahrzeugakte', 'werkstatt', 'leistungskatalog', 'erp', 'verleih', 'gutachten', 'reservierung', 'erinnerungen', 'einkauf'],
  'Gastronomie, Hotellerie & Tourismus': ['gastro', 'kasse', 'erp', 'lager-scanner', 'schichtplan', 'rezeptur', 'belegung', 'reservierung', 'gutscheine', 'erinnerungen', 'einkauf'],
  'Lebensmittel & Nahversorgung': ['lebensmittel', 'erp', 'lager-scanner', 'kasse', 'rezeptur', 'reservierung', 'einkauf', 'tour'],
  'Logistik & Transport': ['logistik', 'erp', 'fahrzeugakte', 'schichtplan', 'pruefprotokolle', 'tour', 'einsaetze'],
  'IT & Technologie': ['it-msp', 'vertraege', 'service', 'projekte', 'projekt-abrechnung', 'wiederkehr'],
  'Energie & Umwelt': ['energie', 'ertraege', 'wartung', 'service', 'projekte', 'aufmass', 'pruefprotokolle', 'tour', 'foerdermittel'],
  'Immobilien & Verwaltung': ['immobilien', 'vertraege', 'mitglieder', 'verleih', 'pruefprotokolle', 'belegung', 'gutachten', 'expose', 'betriebskosten', 'wartung'],
  'Marketing, Medien & Kreativ': ['agentur-kreativ', 'projekte', 'projekt-abrechnung', 'marketing', 'leads', 'freigaben'],
  'Recht, Steuern & Finanzen': ['kanzlei', 'vertraege', 'datev', 'fristen'],
  'Bildung & Wissenschaft': ['bildung', 'online-buchung', 'buchungen', 'gutscheine', 'veranstaltungen', 'mitglieder'],
  'Gesundheit & Wellness': ['wellness', 'online-buchung', 'buchungen', 'bildung', 'hilfsmittel', 'gutscheine', 'erinnerungen'],
  'Sport, Beauty & Lifestyle': ['wellness', 'online-buchung', 'buchungen', 'mitglieder', 'gutscheine', 'erinnerungen', 'kasse'],
  'Tiere': ['tier', 'online-buchung', 'buchungen', 'bildung', 'tierbestand', 'erinnerungen', 'mitglieder'],
  'Landwirtschaft, Garten & Forst': ['landwirtschaft', 'erp', 'verleih', 'belegung', 'schlagkartei', 'tierbestand', 'ertraege', 'holz', 'forst'],
  'Dienstleistungen': ['einsaetze', 'objektzeiten', 'wartung', 'wiederkehr', 'schichtplan', 'tour', 'service'],
  'Kultur, Soziales & Öffentliches': ['verein', 'mitglieder', 'online-buchung', 'bildung', 'belegung', 'spenden', 'veranstaltungen', 'foerdermittel', 'projekte'],
};

/** Vollständiges Modul-Set einer Kategorie = Kern + Kategorie-Zusatz + Standard-Automation (dedupliziert). */
export function kategorieModule(kategorie: string): string[] {
  const zusatz = KATEGORIE_MODULE[kategorie] ?? [];
  return [...new Set<string>([...KERN_MODULE, ...zusatz, STANDARD_AUTOMATION])];
}

/** Nur die branchenspezifischen Zusatzmodule (ohne Kern) — für die Anzeige „obendrauf". */
export function kategorieZusatz(kategorie: string): string[] {
  return [...new Set<string>([...(KATEGORIE_MODULE[kategorie] ?? []), STANDARD_AUTOMATION])];
}

/** Ist diese Kategorie im Katalog bekannt? */
export function istKatalogKategorie(kategorie: string): boolean {
  return kategorie in KATEGORIE_MODULE;
}
