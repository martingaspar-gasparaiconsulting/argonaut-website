// ============================================================
// ARGONAUT OS · Paket 264 · Online-Ankaufformular — Rahmen
// Die Formulare der Betriebe sollen nicht in Suchmaschinen landen
// (der Link gehört auf die Webseite des Betriebs).
// ============================================================

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fahrzeug anbieten',
  robots: { index: false, follow: false },
};

export default function AnkaufRahmen({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
