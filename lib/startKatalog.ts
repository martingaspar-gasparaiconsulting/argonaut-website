// lib/startKatalog.ts
// Start-Leistungskatalog je Branche: typische Leistungen, die ein neuer Betrieb
// per Klick in seinen Leistungskatalog laden kann (statt bei Null anzufangen).
// Schlüssel = exakt die 19 Kategorie-Strings aus branchenkatalog.ts (profiles.kategorie).
// KEINE Supabase-Aufrufe, KEINE React-Hooks — node-testbar. Alles frei änderbar
// nach dem Laden; die Preise sind unverbindliche Startwerte.

export type Erfassungsart = 'stunden' | 'minuten' | 'aw' | 'stueck';

export interface StartLeistung {
  bezeichnung: string;
  erfassungsart: Erfassungsart;
  kategorie?: string;            // katalog-interne Gruppierung
  standard_wert?: number;        // Default 1
  stundensatz_netto?: number;    // bei Zeit-Leistungen
  einheit?: string;              // bei Mengen-Leistungen (stueck)
  einheitspreis_netto?: number;  // bei Mengen-Leistungen
  festpreis_netto?: number;      // Pauschale (gewinnt gegen alles)
  aw_minuten?: number;           // bei AW
  mwst_satz?: number;            // Default 19
}

const WELLNESS: StartLeistung[] = [
  { bezeichnung: 'Behandlung 30 Minuten', erfassungsart: 'stunden', kategorie: 'Behandlung', festpreis_netto: 39 },
  { bezeichnung: 'Behandlung 60 Minuten', erfassungsart: 'stunden', kategorie: 'Behandlung', festpreis_netto: 69 },
  { bezeichnung: 'Massage 60 Minuten', erfassungsart: 'stunden', kategorie: 'Behandlung', festpreis_netto: 75 },
  { bezeichnung: 'Beratungsgespräch', erfassungsart: 'stunden', kategorie: 'Service', festpreis_netto: 25 },
  { bezeichnung: 'Paket 10er-Karte', erfassungsart: 'stueck', kategorie: 'Paket', einheit: 'Karte', einheitspreis_netto: 350 },
];

export const STARTKATALOG: Record<string, StartLeistung[]> = {
  'Handwerk & Bau': [
    { bezeichnung: 'Arbeitsstunde Geselle', erfassungsart: 'stunden', kategorie: 'Arbeitszeit', stundensatz_netto: 55 },
    { bezeichnung: 'Arbeitsstunde Meister', erfassungsart: 'stunden', kategorie: 'Arbeitszeit', stundensatz_netto: 75 },
    { bezeichnung: 'Arbeitsstunde Helfer / Azubi', erfassungsart: 'stunden', kategorie: 'Arbeitszeit', stundensatz_netto: 35 },
    { bezeichnung: 'Anfahrtspauschale', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 45 },
    { bezeichnung: 'Kleinmaterial-Pauschale', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 15 },
    { bezeichnung: 'Entsorgung / Container', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 120 },
  ],
  'Fahrzeuge & Mobilität': [
    { bezeichnung: 'Arbeitsstunde Werkstatt', erfassungsart: 'stunden', kategorie: 'Arbeitszeit', stundensatz_netto: 110 },
    { bezeichnung: 'Ölwechsel inkl. Filter', erfassungsart: 'stunden', kategorie: 'Service', festpreis_netto: 89 },
    { bezeichnung: 'Inspektion klein', erfassungsart: 'stunden', kategorie: 'Service', festpreis_netto: 149 },
    { bezeichnung: 'Inspektion groß', erfassungsart: 'stunden', kategorie: 'Service', festpreis_netto: 299 },
    { bezeichnung: 'Reifenwechsel (4 Räder)', erfassungsart: 'stunden', kategorie: 'Service', festpreis_netto: 49 },
    { bezeichnung: 'HU/AU-Vorbereitung', erfassungsart: 'stunden', kategorie: 'Service', festpreis_netto: 39 },
    { bezeichnung: 'Bremsen vorne erneuern', erfassungsart: 'stunden', kategorie: 'Reparatur', festpreis_netto: 220 },
  ],
  'Landwirtschaft, Garten & Forst': [
    { bezeichnung: 'Mähen / Mulchen', erfassungsart: 'stueck', kategorie: 'Fläche', einheit: 'ha', einheitspreis_netto: 120 },
    { bezeichnung: 'Holzrückung', erfassungsart: 'stueck', kategorie: 'Forst', einheit: 'fm', einheitspreis_netto: 25 },
    { bezeichnung: 'Brennholz gespalten, lutro', erfassungsart: 'stueck', kategorie: 'Brennholz', einheit: 'Srm', einheitspreis_netto: 95, mwst_satz: 7 },
    { bezeichnung: 'Heckenschnitt', erfassungsart: 'stunden', kategorie: 'Garten', stundensatz_netto: 45 },
    { bezeichnung: 'Maschinentransport / Anfahrt', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 60 },
  ],
  'IT & Technologie': [
    { bezeichnung: 'Support-Stunde (Remote)', erfassungsart: 'stunden', kategorie: 'Support', stundensatz_netto: 95 },
    { bezeichnung: 'Vor-Ort-Einsatz Stunde', erfassungsart: 'stunden', kategorie: 'Support', stundensatz_netto: 110 },
    { bezeichnung: 'Anfahrtspauschale', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 45 },
    { bezeichnung: 'Wartungsvertrag / Monat', erfassungsart: 'stunden', kategorie: 'Wartung', festpreis_netto: 49 },
    { bezeichnung: 'Arbeitsplatz einrichten', erfassungsart: 'stunden', kategorie: 'Service', festpreis_netto: 120 },
  ],
  'Marketing, Medien & Kreativ': [
    { bezeichnung: 'Konzeption / Beratung Stunde', erfassungsart: 'stunden', kategorie: 'Beratung', stundensatz_netto: 95 },
    { bezeichnung: 'Grafik / Design Stunde', erfassungsart: 'stunden', kategorie: 'Kreation', stundensatz_netto: 85 },
    { bezeichnung: 'Social-Media-Betreuung / Monat', erfassungsart: 'stunden', kategorie: 'Retainer', festpreis_netto: 490 },
    { bezeichnung: 'Fotoshooting halber Tag', erfassungsart: 'stunden', kategorie: 'Produktion', festpreis_netto: 450 },
  ],
  'Energie & Umwelt': [
    { bezeichnung: 'PV-Anlagen-Wartung', erfassungsart: 'stunden', kategorie: 'Wartung', festpreis_netto: 189 },
    { bezeichnung: 'Arbeitsstunde Monteur', erfassungsart: 'stunden', kategorie: 'Arbeitszeit', stundensatz_netto: 75 },
    { bezeichnung: 'Anfahrtspauschale', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 45 },
    { bezeichnung: 'Zählerablesung / Prüfung', erfassungsart: 'stunden', kategorie: 'Service', festpreis_netto: 35 },
  ],
  'Recht, Steuern & Finanzen': [
    { bezeichnung: 'Beratungsstunde', erfassungsart: 'stunden', kategorie: 'Beratung', stundensatz_netto: 190 },
    { bezeichnung: 'Erstberatung (pauschal)', erfassungsart: 'stunden', kategorie: 'Beratung', festpreis_netto: 190 },
    { bezeichnung: 'Schriftsatz / Vertrag', erfassungsart: 'stunden', kategorie: 'Leistung', festpreis_netto: 250 },
  ],
  'Dienstleistungen': [
    { bezeichnung: 'Arbeitsstunde', erfassungsart: 'stunden', kategorie: 'Arbeitszeit', stundensatz_netto: 39 },
    { bezeichnung: 'Unterhaltsreinigung Stunde', erfassungsart: 'stunden', kategorie: 'Reinigung', stundensatz_netto: 32 },
    { bezeichnung: 'Grundreinigung je m²', erfassungsart: 'stueck', kategorie: 'Reinigung', einheit: 'm²', einheitspreis_netto: 3.5 },
    { bezeichnung: 'Anfahrtspauschale', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 35 },
  ],
  'Gesundheit & Wellness': WELLNESS,
  'Sport, Beauty & Lifestyle': WELLNESS,
  __default: [
    { bezeichnung: 'Arbeitsstunde', erfassungsart: 'stunden', kategorie: 'Arbeitszeit', stundensatz_netto: 55 },
    { bezeichnung: 'Beratung Stunde', erfassungsart: 'stunden', kategorie: 'Beratung', stundensatz_netto: 90 },
    { bezeichnung: 'Anfahrtspauschale', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 45 },
    { bezeichnung: 'Materialpauschale', erfassungsart: 'stunden', kategorie: 'Nebenkosten', festpreis_netto: 20 },
  ],
};

/** Gibt es für diese Branche eine kuratierte Vorlage (nicht nur den Default)? */
export function hatStartKatalog(kategorie: string | null | undefined): boolean {
  return !!kategorie && kategorie in STARTKATALOG && kategorie !== '__default';
}

/** Typische Leistungen einer Branche (Fallback = generischer Default). */
export function startLeistungen(kategorie: string | null | undefined): StartLeistung[] {
  const k = (kategorie || '').trim();
  return STARTKATALOG[k] ?? STARTKATALOG.__default;
}

export interface KatalogInsertRow {
  owner_user_id: string;
  bezeichnung: string;
  kuerzel: null;
  kategorie: string | null;
  erfassungsart: Erfassungsart;
  standard_wert: number;
  aw_minuten: number | null;
  einheit: string | null;
  einheitspreis_netto: number | null;
  stundensatz_netto: number | null;
  festpreis_netto: number | null;
  mwst_satz: number;
  notiz: null;
}

/**
 * Baut die insert-fertigen leistungskatalog-Zeilen für eine Branche.
 * - Bezeichnungen, die es (case-insensitiv) schon gibt, werden übersprungen (kein Duplikat).
 * - Preise sind Startwerte, alles frei änderbar.
 */
export function baueStartKatalog(
  kategorie: string | null | undefined,
  ownerId: string,
  vorhandeneBezeichnungen: Iterable<string>
): KatalogInsertRow[] {
  const gesehen = new Set<string>();
  for (const b of vorhandeneBezeichnungen) gesehen.add((b || '').trim().toLowerCase());
  const rows: KatalogInsertRow[] = [];
  for (const l of startLeistungen(kategorie)) {
    const key = l.bezeichnung.trim().toLowerCase();
    if (!key || gesehen.has(key)) continue;
    gesehen.add(key);
    const menge = l.erfassungsart === 'stueck';
    rows.push({
      owner_user_id: ownerId,
      bezeichnung: l.bezeichnung,
      kuerzel: null,
      kategorie: l.kategorie ?? null,
      erfassungsart: l.erfassungsart,
      standard_wert: l.standard_wert ?? 1,
      aw_minuten: l.erfassungsart === 'aw' ? (l.aw_minuten ?? 6) : null,
      einheit: menge ? (l.einheit ?? null) : null,
      einheitspreis_netto: menge ? (l.einheitspreis_netto ?? null) : null,
      stundensatz_netto: menge ? null : (l.stundensatz_netto ?? null),
      festpreis_netto: l.festpreis_netto ?? null,
      mwst_satz: l.mwst_satz ?? 19,
      notiz: null,
    });
  }
  return rows;
}
