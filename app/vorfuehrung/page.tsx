// ============================================================================
// ARGONAUT OS · app/vorfuehrung/page.tsx — der Einstieg in die Vorführung
//
// OHNE Login, OHNE Datenbank. Gedacht für den Touchscreen bei Veranstaltungen:
// Der Besucher tippt seinen Beruf ein und sieht seine eigene Branche.
//
// Der Server holt hier nur die Listen und reicht sie an die Oberfläche weiter —
// alles Weitere passiert im Browser, damit der Bildschirm auch dann noch läuft,
// wenn das WLAN einbricht.
// ============================================================================

import type { Metadata } from 'next';
import { alleBranchenKurz, kategorienKurz } from '@/lib/vorfuehrung';
import Uebersicht from './Uebersicht';

// Noch nicht in die Suchmaschinen — erst wenn der Praxistest zeigt, dass es
// ankommt. Zum Freischalten die robots-Zeile entfernen.
export const metadata: Metadata = {
  title: 'ARGONAUT OS — Ihre Branche ansehen',
  description: 'Suchen Sie Ihren Beruf. Ohne Anmeldung ansehen, was ARGONAUT in Ihrem Betrieb macht.',
  robots: { index: false, follow: false },
};

export default function VorfuehrungPage() {
  return <Uebersicht branchen={alleBranchenKurz()} kategorien={kategorienKurz()} />;
}
