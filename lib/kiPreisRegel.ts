// ============================================================================
// ARGONAUT OS · lib/kiPreisRegel.ts — die KI erfindet keine Preise (Paket 176)
//
// Grundregel von ARGONAUT: Preise kommen aus den Unterlagen des Betriebs oder
// vom Betrieb selbst — nie aus einer Schätzung der KI. Bis 29.09.2026 bat
// /api/auftrag-ki-positionen die KI ausdrücklich, „marktübliche Netto-Preise"
// zu schätzen; die landeten mit einem Klick im Auftrag.
//
// Jetzt: Nur ein Preis, den die KI in den Dokument-Auszügen des Betriebs
// gefunden hat, bleibt stehen. Alles andere wird auf 0 gesetzt und mit dem
// sichtbaren Platzhalter „[Preis bitte ergänzen]" versehen — vergisst man
// ihn, fällt er spätestens im Auftrag auf, statt als erfundener Preis beim
// Kunden zu landen. Gilt serverseitig, egal was die KI antwortet.
//
// Reine Formel, node-getestet.
// ============================================================================

export const PREIS_PLATZHALTER = '[Preis bitte ergänzen]';

export type KiPositionRoh = Record<string, unknown>;
export type KiPosition = {
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  mwst_satz: number;
  quelle: 'dokument' | 'fehlt';
  quelle_datei: string;
};

export function kiPositionSaeubern(p: KiPositionRoh | null | undefined, einheiten: readonly string[]): KiPosition | null {
  const bezRoh = String(p?.bezeichnung ?? '').replace(PREIS_PLATZHALTER, '').trim().slice(0, 170);
  if (!bezRoh) return null;
  const menge = Number(p?.menge);
  const preis = Number(p?.einzelpreis);
  const m = Number(p?.mwst_satz);
  const datei = String(p?.quelle_datei ?? '').trim().slice(0, 120);
  // „dokument" zählt nur mit genannter Quelle UND einem echten Preis.
  const ausDokument = p?.quelle === 'dokument' && datei.length > 0 && Number.isFinite(preis) && preis > 0;
  const einheit = String(p?.einheit ?? '');
  return {
    bezeichnung: ausDokument ? bezRoh : `${bezRoh} ${PREIS_PLATZHALTER}`,
    menge: Number.isFinite(menge) && menge > 0 ? menge : 1,
    einheit: einheiten.includes(einheit) ? einheit : 'Stk',
    einzelpreis: ausDokument ? Math.round(preis * 100) / 100 : 0,
    mwst_satz: Number.isFinite(m) && m >= 0 && m <= 100 ? m : 19,
    quelle: ausDokument ? 'dokument' : 'fehlt',
    quelle_datei: ausDokument ? datei : '',
  };
}
