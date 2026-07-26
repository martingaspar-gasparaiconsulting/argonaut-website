// ============================================================================
// ARGONAUT OS · lib/datevKonten.ts — Regel-Ebene: Beleg-Kategorie -> DATEV-Konto
//
// KEINE KI. Eine reine, nachvollziehbare Zuordnung von Stichworten (aus
// Kategorie und Lieferant) auf das passende Aufwands-Sachkonto — jeweils fuer
// SKR03 UND SKR04, die beiden gaengigen Kontenrahmen im Mittelstand.
//
// Wichtig: Das Ergebnis ist ein VORSCHLAG zur Bestaetigung. Die endgueltige
// Kontierung entscheidet der Betrieb bzw. der Steuerberater. Deshalb liefert
// jede Regel beide Rahmen + eine Klartext-Bezeichnung, und der Nutzer kann
// jederzeit ueberschreiben.
//
// Reine Funktionen, keine Hooks/keine Supabase-Aufrufe — ueberall importierbar.
// ============================================================================

export type KontoRegel = {
  keywords: string[];   // Kleinschreibung; Treffer = Teilstring in Kategorie/Lieferant
  skr03: string;
  skr04: string;
  bezeichnung: string;
};

// Reihenfolge = Prioritaet: SPEZIFISCH vor ALLGEMEIN.
export const DATEV_REGELN: KontoRegel[] = [
  { keywords: ['kraftstoff', 'tanken', 'tankstelle', 'diesel', 'benzin', 'aral', 'shell', 'esso', 'jet', 'adblue'], skr03: '4530', skr04: '6530', bezeichnung: 'Laufende Kfz-Betriebskosten (Kraftstoff)' },
  { keywords: ['kfz-reparatur', 'kfz reparatur', 'werkstatt', 'reifen', 'inspektion', 'tuev', 'tüv', 'auspuff', 'bremsen'], skr03: '4540', skr04: '6540', bezeichnung: 'Kfz-Reparaturen' },
  { keywords: ['bewirtung', 'restaurant', 'gaststaette', 'gaststätte', 'bewirtungsbeleg', 'cafe', 'café', 'imbiss'], skr03: '4650', skr04: '6640', bezeichnung: 'Bewirtungskosten' },
  { keywords: ['reise', 'hotel', 'uebernachtung', 'übernachtung', 'bahn', 'db ', 'flug', 'lufthansa', 'mietwagen', 'taxi'], skr03: '4670', skr04: '6670', bezeichnung: 'Reisekosten' },
  { keywords: ['buero', 'büro', 'bürobedarf', 'buerobedarf', 'papier', 'toner', 'druckerpatrone', 'tinte', 'ordner'], skr03: '4930', skr04: '6815', bezeichnung: 'Bürobedarf' },
  { keywords: ['porto', 'post', 'dhl', 'dpd', 'hermes', 'ups', 'gls', 'versand', 'frankier', 'paket'], skr03: '4910', skr04: '6800', bezeichnung: 'Porto' },
  { keywords: ['telefon', 'mobilfunk', 'internet', 'telekom', 'vodafone', 'o2', '1&1', 'handy', 'dsl'], skr03: '4920', skr04: '6805', bezeichnung: 'Telefon / Telekommunikation' },
  { keywords: ['werbung', 'marketing', 'anzeige', 'google ads', 'meta', 'facebook', 'instagram', 'flyer', 'plakat', 'werbe'], skr03: '4600', skr04: '6600', bezeichnung: 'Werbekosten' },
  { keywords: ['miete', 'raummiete', 'pacht', 'buerozins', 'gewerbemiete'], skr03: '4210', skr04: '6310', bezeichnung: 'Raumkosten (Miete/Pacht)' },
  { keywords: ['strom', 'gas', 'wasser', 'heizung', 'energie', 'stadtwerke', 'eon', 'e.on', 'enbw', 'vattenfall'], skr03: '4240', skr04: '6325', bezeichnung: 'Gas, Strom, Wasser' },
  { keywords: ['reinigung', 'putz', 'gebaeudereinigung', 'gebäudereinigung'], skr03: '4250', skr04: '6330', bezeichnung: 'Reinigung' },
  { keywords: ['versicherung', 'haftpflicht', 'police', 'allianz', 'axa', 'gothaer', 'ergo'], skr03: '4360', skr04: '6400', bezeichnung: 'Betriebliche Versicherungen' },
  { keywords: ['beitrag', 'gebuehr', 'gebühr', 'kammer', 'ihk', 'hwk', 'innung', 'mitgliedsbeitrag'], skr03: '4380', skr04: '6420', bezeichnung: 'Beiträge' },
  { keywords: ['fortbildung', 'schulung', 'seminar', 'kurs', 'weiterbildung', 'training'], skr03: '4945', skr04: '6821', bezeichnung: 'Fortbildungskosten' },
  { keywords: ['steuerberater', 'buchfuehrung', 'buchführung', 'buchhaltung', 'jahresabschluss', 'lohnabrechnung'], skr03: '4957', skr04: '6827', bezeichnung: 'Buchführungs- / Abschlusskosten' },
  { keywords: ['rechtsanwalt', 'anwalt', 'notar', 'beratung', 'rechtsberatung', 'kanzlei'], skr03: '4950', skr04: '6825', bezeichnung: 'Rechts- und Beratungskosten' },
  { keywords: ['software', 'lizenz', 'saas', 'hosting', 'cloud', 'microsoft', 'adobe', 'wartung edv', 'edv', 'server'], skr03: '4806', skr04: '6495', bezeichnung: 'Wartung / Software (EDV)' },
  { keywords: ['bankgebuehr', 'bankgebühr', 'kontofuehrung', 'kontoführung', 'kontogebuehr', 'kontogebühr', 'geldverkehr'], skr03: '4970', skr04: '6855', bezeichnung: 'Nebenkosten des Geldverkehrs' },
  { keywords: ['fremdleistung', 'subunternehmer', 'nachunternehmer', 'fremdarbeit', 'subunternehmen'], skr03: '3100', skr04: '5900', bezeichnung: 'Fremdleistungen' },
  { keywords: ['werkzeug', 'kleingeraet', 'kleingerät', 'bohrer', 'maschine klein', 'geraete', 'geräte'], skr03: '4985', skr04: '6845', bezeichnung: 'Werkzeuge und Kleingeräte' },
  { keywords: ['material', 'werkstoff', 'baustoff', 'rohstoff', 'ware', 'wareneinkauf', 'handelsware', 'einkauf'], skr03: '3400', skr04: '5400', bezeichnung: 'Wareneingang / Material (19% VSt)' },
  { keywords: ['reparatur', 'instandhaltung', 'wartung', 'instandsetzung'], skr03: '4805', skr04: '6460', bezeichnung: 'Reparatur / Instandhaltung' },
];

export const DATEV_FALLBACK = { skr03: '4980', skr04: '6850', bezeichnung: 'Sonstiger Betriebsbedarf' } as const;

export type DatevVorschlag = { skr03: string; skr04: string; bezeichnung: string; treffer: boolean };

function normalisiere(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Liefert den Konto-Vorschlag fuer einen Beleg.
 * Sucht Stichworte zuerst in der Kategorie, dann im Lieferantennamen.
 * @returns immer ein Ergebnis; treffer=false bedeutet: Fallback-Konto benutzt.
 */
export function datevVorschlag(kategorie?: string | null, lieferant?: string | null): DatevVorschlag {
  const heu = normalisiere(`${kategorie || ''} ${lieferant || ''}`);
  if (heu) {
    for (const r of DATEV_REGELN) {
      if (r.keywords.some((k) => heu.includes(k))) {
        return { skr03: r.skr03, skr04: r.skr04, bezeichnung: r.bezeichnung, treffer: true };
      }
    }
  }
  return { ...DATEV_FALLBACK, treffer: false };
}

/** Flache Liste aller Konten fuer ein manuelles Auswahl-Dropdown. */
export function datevKontenListe(rahmen: 'skr03' | 'skr04'): { konto: string; bezeichnung: string }[] {
  const raus = DATEV_REGELN.map((r) => ({ konto: r[rahmen], bezeichnung: r.bezeichnung }));
  raus.push({ konto: DATEV_FALLBACK[rahmen], bezeichnung: DATEV_FALLBACK.bezeichnung });
  return raus;
}
