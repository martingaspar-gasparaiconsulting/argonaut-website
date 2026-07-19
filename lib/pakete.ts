// ============================================================================
// ARGONAUT OS · lib/pakete.ts — Paket-Katalog (DEINE Steuer-Datei)
//
// Hier definierst DU, was ein Kunde bekommt. Zwei Ebenen:
//   1. KERN_MODULE  — die "12 Kernbausteine", die JEDER Kunde bekommt.
//   2. BRANCHEN_PAKETE — je Branche die Zusatzmodule obendrauf.
// Extras (à la carte) klickst du im Freischalter einfach zusätzlich an.
//
// Die Schlüssel sind die `modul`-Keys aus lib/rechte.ts (NAV_LINKS.modul).
// Ein Klick auf ein Paket schaltet in tenant_module = die Freigabe des Kunden.
//
// HINWEIS: Infrastruktur-Punkte ohne Modul-Schlüssel (Übersicht, Mein Bereich,
// Zeiterfassung, Meine Einsätze, Einstellungen, Rechte, Schnittstellen) sind
// IMMER sichtbar — sie gehen am Buchungs-Gate vorbei und müssen nicht gebucht
// werden. Deshalb stehen sie hier nicht in der Liste, gehören aber zum "Kern".
//
// Keine Imports, keine Hooks — von Client- UND Server-Code nutzbar.
// ============================================================================

/**
 * Die 12 Kernbausteine (jeder Kunde). Davon sind 3 Infrastruktur (immer sichtbar,
 * ohne Schlüssel): Übersicht · Mein Bereich/Zeiterfassung · Einstellungen/Rechte.
 * Die restlichen 9 mit Schlüssel werden beim "Kern setzen" scharfgeschaltet:
 */
export const KERN_MODULE: string[] = [
  'crm',          // 🤝 Vertrieb / CRM (Kontakte)
  'auftraege',    // 📋 Aufträge
  'angebote',     // 🧾 Angebote
  'rechnungen',   // 🧾 Rechnungen
  'termine',      // 🗓 Termine
  'dokumente',    // 📄 Dokumente
  'kundenportal', // 👤 Kunden-Portal
  'finanzen',     // 💶 Finanzen
  'gobd',         // 🗂 GoBD
];

export type BranchenPaket = {
  key: string;
  name: string;
  icon: string;
  /** Zusatzmodule ZUSÄTZLICH zum Kern. */
  module: string[];
};

// --- Die Branchen-Pakete. Frei anpassbar — hier bestimmst du das Angebot. ---
export const BRANCHEN_PAKETE: BranchenPaket[] = [
  { key: 'handwerk', name: 'Handwerk / Bau', icon: '🏗', module: ['bau-lv', 'aufmass', 'bautagebuch', 'objektzeiten', 'leistungskatalog', 'projekte', 'wartung', 'service', 'erp'] },
  { key: 'kfz', name: 'KFZ-Betrieb', icon: '🚗', module: ['kfz', 'fahrzeugakte', 'werkstatt', 'leistungskatalog', 'erp'] },
  { key: 'gastro', name: 'Gastro & Hotel', icon: '🍽', module: ['gastro', 'kasse', 'erp', 'lager-scanner', 'schichtplan'] },
  { key: 'handel', name: 'Handel / Shop', icon: '🛒', module: ['shop', 'kasse', 'erp', 'lager-scanner', 'bewertungen'] },
  { key: 'fertigung', name: 'Fertigung / Industrie', icon: '🏭', module: ['fertigung', 'erp', 'lager-scanner', 'projekte'] },
  { key: 'energie', name: 'Energie / Anlagenbau', icon: '⚡', module: ['energie', 'wartung', 'service', 'projekte', 'aufmass'] },
  { key: 'immobilien', name: 'Immobilienverwaltung', icon: '🏢', module: ['immobilien', 'vertraege', 'mitglieder'] },
  { key: 'it-msp', name: 'IT & MSP', icon: '💻', module: ['it-msp', 'vertraege', 'service', 'projekte'] },
  { key: 'agentur', name: 'Agentur & Kreativ', icon: '🎨', module: ['agentur-kreativ', 'projekte', 'projekt-abrechnung', 'marketing', 'leads'] },
  { key: 'wellness', name: 'Gesundheit & Wellness', icon: '💆', module: ['wellness', 'online-buchung', 'buchungen'] },
  { key: 'kanzlei', name: 'Kanzlei & Steuer', icon: '⚖️', module: ['kanzlei', 'vertraege', 'datev'] },
  { key: 'bildung', name: 'Bildung & Kurse', icon: '🎓', module: ['bildung', 'online-buchung', 'buchungen'] },
  { key: 'lebensmittel', name: 'Lebensmittel', icon: '🥫', module: ['lebensmittel', 'erp', 'lager-scanner', 'kasse'] },
  { key: 'landwirtschaft', name: 'Landwirtschaft & Forst', icon: '🌾', module: ['landwirtschaft', 'erp'] },
  { key: 'tier', name: 'Tier / Praxis', icon: '🐾', module: ['tier', 'online-buchung', 'buchungen'] },
  { key: 'verein', name: 'Verein & Sozial', icon: '🤝', module: ['verein', 'mitglieder', 'online-buchung'] },
  { key: 'logistik', name: 'Logistik / Spedition', icon: '🚚', module: ['logistik', 'erp', 'fahrzeugakte', 'schichtplan'] },
];

export function branchenPaket(key: string): BranchenPaket | undefined {
  return BRANCHEN_PAKETE.find((b) => b.key === key);
}

/**
 * Alle Modul-Keys für eine Branche = Kern + Branchen-Zusatz (dedupliziert).
 * Ein Klick auf "Paket anwenden" schaltet genau diese Liste im tenant_module.
 */
export function paketModule(branchKey: string): string[] {
  const b = branchenPaket(branchKey);
  const set = new Set<string>(KERN_MODULE);
  (b?.module || []).forEach((m) => set.add(m));
  return [...set];
}
