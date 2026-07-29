// ============================================================================
// ARGONAUT OS · lib/beispielBelege.ts — Beispiel-Belege der Übungswelt (Punkt 24)
//
// Verzahnte Belege: ein Beispiel-ANGEBOT (an einen Beispiel-Kontakt, Status
// „angenommen") + Beispiel-ZAHLUNGEN direkt in die Finanzen (rechnung_id = null,
// wie Punkt 15a). Bewusst OHNE echte Rechnung: die Rechnungsnummer kommt per
// Trigger fortlaufend (§14/GoBD) — im Live-Mandanten würde eine gelöschte
// Beispiel-Rechnung eine Lücke lassen. Echte Rechnungen erst im wegwerfbaren
// Demo-Konto (Punkt 26).
//
// Reine Builder — kein Supabase, keine Hooks. Node-testbar. Die IDs/Inserts
// erledigt die Route; sie schreibt jede neue Zeile ins Register.
// ============================================================================

const HINWEIS = 'Beispiel-Beleg der Uebungswelt — jederzeit ueber den Schalter im Onboarding entfernbar.';

export type SeedZeile = Record<string, unknown>;

export type KontaktRef = {
  id: string;
  firma?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
};

/** Feste Beispiel-Positionen (universell, Netto-Preise, 19 %). */
const POSITIONEN = [
  { bezeichnung: 'Beispiel-Leistung (Beratung)', menge: 2, einheit: 'Std', einzelpreis: 80, mwst_satz: 19 },
  { bezeichnung: 'Beispiel-Material', menge: 3, einheit: 'Stk', einzelpreis: 15, mwst_satz: 19 },
];

function r2(n: number): number {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}

function kundeName(k: KontaktRef): string {
  const person = [k.vorname, k.nachname].filter(Boolean).join(' ').trim();
  return (k.firma && k.firma.trim()) || person || 'Beispiel-Kunde';
}

/** Netto/MwSt/Brutto der Beispiel-Positionen. */
export function angebotSummen(): { netto: number; mwst: number; brutto: number } {
  let netto = 0;
  let mwst = 0;
  for (const p of POSITIONEN) {
    const g = p.menge * p.einzelpreis;
    netto += g;
    mwst += (g * p.mwst_satz) / 100;
  }
  netto = r2(netto);
  mwst = r2(mwst);
  return { netto, mwst, brutto: r2(netto + mwst) };
}

/** Kopf-Zeile fuer die angebote-Tabelle (Status „angenommen"). */
export function baueAngebotKopf(k: KontaktRef, ownerId: string, gueltigBis: string): SeedZeile {
  const s = angebotSummen();
  return {
    owner_user_id: ownerId,
    kontakt_id: k.id,
    kunde_name: kundeName(k),
    kunde_email: k.email ?? null,
    titel: 'Beispiel-Angebot (Uebungswelt)',
    status: 'angenommen',
    gueltig_bis: gueltigBis,
    netto_summe: s.netto,
    mwst_summe: s.mwst,
    brutto_summe: s.brutto,
    notiz: HINWEIS,
  };
}

/** Positions-Zeilen fuer angebot_positionen (angebot_id kommt aus dem Insert davor). */
export function baueAngebotPositionen(angebotId: string, ownerId: string): SeedZeile[] {
  return POSITIONEN.map((p, i) => ({
    owner_user_id: ownerId,
    angebot_id: angebotId,
    position: i + 1,
    bezeichnung: p.bezeichnung,
    menge: p.menge,
    einheit: p.einheit,
    einzelpreis: p.einzelpreis,
    mwst_satz: p.mwst_satz,
    gesamt_netto: r2(p.menge * p.einzelpreis),
  }));
}

/** Zahlungs-Zeilen (rechnung_id = null → zaehlt in Finanzen/EÜR als voller Umsatz). */
export function baueBeispielZahlungen(ownerId: string, heute: string): SeedZeile[] {
  const s = angebotSummen();
  return [
    { owner_user_id: ownerId, rechnung_id: null, betrag: s.brutto, zahlungsdatum: heute, zahlungsart: 'Uebungswelt', referenz: 'beispiel:zahlung-1' },
    { owner_user_id: ownerId, rechnung_id: null, betrag: 89.0, zahlungsdatum: heute, zahlungsart: 'Uebungswelt', referenz: 'beispiel:zahlung-2' },
  ];
}
