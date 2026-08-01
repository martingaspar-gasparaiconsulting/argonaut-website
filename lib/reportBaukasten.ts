// lib/reportBaukasten.ts
// Report-Baukasten (Punkt 10a): Self-Service-Auswertungen. Der Nutzer wählt
// Quelle + Kennzahl (Anzahl / Summe) + Gruppierung + Zeitraum; diese Datei
// definiert die Quellen und rechnet das Ergebnis. Reine Daten/Formeln — KEINE
// Supabase-/React-Abhängigkeit. Node-getestet.

export type FeldTyp = 'zahl' | 'text' | 'datum';
export interface Feld { key: string; label: string; typ: FeldTyp; }
export interface Quelle {
  key: string; name: string; icon: string; table: string;
  datumFeld: string;           // Feld für den Zeitraum-Filter
  felder: Feld[];              // auswertbare Felder
}

// Quellen = Tabellen mit owner-RLS, die ARGONAUT sicher je Betrieb liest.
export const QUELLEN: Quelle[] = [
  { key: 'rechnungen', name: 'Rechnungen', icon: '🧾', table: 'rechnungen', datumFeld: 'rechnungsdatum',
    felder: [
      { key: 'brutto_summe', label: 'Brutto-Betrag', typ: 'zahl' },
      { key: 'netto_summe', label: 'Netto-Betrag', typ: 'zahl' },
      { key: 'zahlungsstatus', label: 'Zahlungsstatus', typ: 'text' },
      { key: 'rechnungsdatum', label: 'Rechnungsdatum', typ: 'datum' },
    ] },
  { key: 'angebote', name: 'Angebote', icon: '🗒', table: 'angebote', datumFeld: 'erstellt_am',
    felder: [
      { key: 'brutto_summe', label: 'Brutto-Betrag', typ: 'zahl' },
      { key: 'status', label: 'Status', typ: 'text' },
      { key: 'erstellt_am', label: 'Erstellt am', typ: 'datum' },
    ] },
  { key: 'deals', name: 'Deals (Pipeline)', icon: '📊', table: 'crm_deal', datumFeld: 'erstellt_am',
    felder: [
      { key: 'wert_netto', label: 'Deal-Wert', typ: 'zahl' },
      { key: 'stufe', label: 'Stufe', typ: 'text' },
      { key: 'erstellt_am', label: 'Erstellt am', typ: 'datum' },
    ] },
  { key: 'versand', name: 'Versand', icon: '📦', table: 'versand_sendung', datumFeld: 'erstellt_am',
    felder: [
      { key: 'kosten', label: 'Versandkosten', typ: 'zahl' },
      { key: 'status', label: 'Status', typ: 'text' },
      { key: 'carrier', label: 'Dienstleister', typ: 'text' },
      { key: 'richtung', label: 'Richtung', typ: 'text' },
      { key: 'erstellt_am', label: 'Erstellt am', typ: 'datum' },
    ] },
];

export function quelle(key: string | null | undefined): Quelle | undefined {
  return QUELLEN.find((q) => q.key === key);
}
export function zahlFelder(q: Quelle | undefined): Feld[] { return (q?.felder ?? []).filter((f) => f.typ === 'zahl'); }
export function textFelder(q: Quelle | undefined): Feld[] { return (q?.felder ?? []).filter((f) => f.typ === 'text'); }

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

export type MetrikTyp = 'anzahl' | 'summe';
export interface ReportKonfig {
  metrik: MetrikTyp;
  summeFeld?: string | null;   // bei metrik='summe'
  gruppeFeld?: string | null;  // optional gruppieren
}
export interface ReportZeile { gruppe: string; wert: number; anteil: number; }
export interface ReportErgebnis { zeilen: ReportZeile[]; gesamt: number; istGeld: boolean; }

/**
 * Rechnet die Auswertung über bereits (zeit-)gefilterte Rows.
 * metrik 'anzahl' = Zeilen zählen; 'summe' = summeFeld aufsummieren.
 * gruppeFeld gesetzt = je Ausprägung eine Zeile (sonst eine Gesamtzeile).
 */
export function baueReport(rows: Array<Record<string, unknown>>, konfig: ReportKonfig): ReportErgebnis {
  const list = rows || [];
  const istSumme = konfig.metrik === 'summe' && !!konfig.summeFeld;
  const wertVon = (r: Record<string, unknown>): number => istSumme ? z(r[konfig.summeFeld as string]) : 1;

  const map = new Map<string, number>();
  let gesamt = 0;
  for (const r of list) {
    const g = konfig.gruppeFeld ? String(r[konfig.gruppeFeld] ?? '—').trim() || '—' : 'Gesamt';
    const w = wertVon(r);
    map.set(g, (map.get(g) || 0) + w);
    gesamt += w;
  }
  gesamt = istSumme ? r2(gesamt) : gesamt;

  const zeilen: ReportZeile[] = [...map.entries()]
    .map(([gruppe, wert]) => ({ gruppe, wert: istSumme ? r2(wert) : wert, anteil: gesamt > 0 ? Math.round((wert / gesamt) * 100) : 0 }))
    .sort((a, b) => b.wert - a.wert);

  return { zeilen, gesamt, istGeld: istSumme };
}

export function formatWert(n: number, istGeld: boolean): string {
  if (istGeld) return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  return (Number(n) || 0).toLocaleString('de-DE');
}

/** CSV aus dem Ergebnis (für Export, 10b). */
export function reportCsv(erg: ReportErgebnis, gruppeLabel: string, metrikLabel: string): string {
  const head = `${gruppeLabel};${metrikLabel};Anteil %`;
  const zeilen = erg.zeilen.map((z2) => `${String(z2.gruppe).replace(/;/g, ',')};${z2.wert};${z2.anteil}`);
  return [head, ...zeilen, `Gesamt;${erg.gesamt};100`].join('\n');
}
