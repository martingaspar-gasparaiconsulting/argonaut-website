import type { Metadata } from 'next'
import VergleichClient from '../_components/VergleichClient'

// ============================================================================
// ARGONAUT OS · app/vorschau/vergleich/page.tsx
// Preis- & Leistungsvergleichsseite. Server-Wrapper (Metadata + noindex),
// rendert die interaktive Client-Komponente VergleichClient.
// Route liegt NICHT im proxy.ts-Matcher -> direkt erreichbar unter /vorschau/vergleich.
// ============================================================================

export const metadata: Metadata = {
  title: 'ARGONAUT OS — Preis- & Leistungsvergleich',
  description: 'Wer kann was — und was kostet es? Offener Vergleich mit Quellen zum Nachprüfen.',
  robots: { index: false, follow: false },
}

export default function VergleichPage() {
  return <VergleichClient />
}
