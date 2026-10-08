// ============================================================
// ARGONAUT OS · Paket 279 · K18b Gast-Link für Partner ohne ARGONAUT
// argonaut-os.com/partner-gast/<link> — ein Auftrag, nichts sonst.
// Nie bei Google (noindex), kein Referrer nach außen (Link steht in der Adresse).
// Daten nur über /api/oeffentlich/partner-gast (Datenbank prüft alles).
// ============================================================

import type { Metadata } from 'next';
import GastAnsicht from './GastAnsicht';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Partner-Auftrag · ARGONAUT OS',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

type Props = { params: Promise<{ token: string }> };

export default async function PartnerGastSeite({ params }: Props) {
  const { token } = await params;
  return <GastAnsicht token={/^[A-Za-z0-9_-]{32}$/.test(token) ? token : ''} />;
}
