// ============================================================================
// ARGONAUT OS · app/vorfuehrung/[slug]/page.tsx
//
// Die Vorführung EINER Branche — öffentlich, ohne Anmeldung. Der Server baut
// die Daten aus den Katalogen und den QR-Code, der Abspieler daneben führt vor.
//
// Vorgebaut werden nur die 21 handgeschriebenen Vorführ-Betriebe; die übrigen
// Branchen entstehen beim ersten Aufruf und werden danach zwischengespeichert.
// Das hält die Bauzeit kurz, ohne dass am Bildschirm etwas fehlt.
// ============================================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { vorfuehrDaten } from '@/lib/vorfuehrung';
import { DEMO_BETRIEBE } from '@/lib/demoBetriebe';
import { qrMatrix } from '@/lib/qr';
import Abspieler from './Abspieler';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Die 21 Vorführ-Betriebe vorbauen — sie werden am häufigsten geöffnet. */
export function generateStaticParams() {
  return DEMO_BETRIEBE.map((b) => ({ slug: b.slug }));
}

export default async function VorfuehrBranche({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const daten = vorfuehrDaten(slug);
  if (!daten) notFound();

  // Der QR-Code führt auf genau diese Seite. Wer ihn scannt, nimmt seine Branche
  // mit nach Hause — ohne dass er uns vorher seine E-Mail-Adresse geben muss.
  const ziel = `https://argonaut-os.com/vorfuehrung/${slug}`;
  let qr: boolean[][] = [];
  try {
    qr = qrMatrix(ziel);
  } catch {
    /* Ohne QR läuft die Vorführung genauso — er ist eine Zugabe, kein Muss. */
  }

  return <Abspieler daten={daten} qr={qr} qrZiel={ziel} />;
}
