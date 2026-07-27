import { NextResponse } from 'next/server'

// ============================================================================
// ARGONAUT OS · /api/stripe/create-subscription — STILLGELEGT (26.07.2026)
//
// Die Abrechnung läuft ab sofort KOMPLETT INTERN: einmaliges SEPA-Lastschrift-
// mandat + eigenes Abo-/Wiederkehrende-Rechnungen-System (§14-UStG-Rechnung →
// SEPA-Einzug). KEIN Stripe mehr.
//
// Diese Route wird bewusst NICHT gelöscht (Historie/Referenz), nimmt aber keine
// Abo-Erstellung mehr entgegen und nutzte zuletzt veraltete Paketpreise. Jeder
// Aufruf endet mit 410 (Gone). Das Upgrade läuft jetzt über die interne
// Upgrade-Seite + euren SEPA-/Abo-Weg.
// ============================================================================

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Diese Bezahlroute ist stillgelegt. Die Abrechnung läuft intern über SEPA-Lastschrift und das Abo-/Wiederkehrende-Rechnungen-System.',
    },
    { status: 410 },
  )
}
