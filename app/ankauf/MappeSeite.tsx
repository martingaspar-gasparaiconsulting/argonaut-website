// ============================================================
// ARGONAUT OS · Paket 305 · FM1 Fahrzeugmappe — Rahmen der Seite (Server)
// Kopf und Fuß (Impressum) im Look des AUTOHAUSES wie die Fahrzeugbörse,
// darin die Mappe. Gemeinsam für /ankauf/<kennung> und /fahrzeug-verkaufen.
// ============================================================

import { BoerseSeite } from '@/app/fahrzeuge/BoerseTeile';
import { firmaZu } from '@/lib/kfzBoerseLaden';
import { textAuf } from '@/lib/kfzBoerse';
import { mappeDatenschutz } from '@/lib/fahrzeugMappe';
import type { MappeDb } from '@/lib/fahrzeugMappeServer';
import FahrzeugMappe from './FahrzeugMappe';

export const MAPPE_FUSS = 'Unverbindliche Anfrage. Ein verbindliches Angebot erhalten Sie erst nach der Besichtigung des Fahrzeugs.';

export function NichtVerfuegbar() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F4F6F9', color: '#111827', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Diese Seite ist gerade nicht verfügbar</h1>
        <p style={{ color: '#5B6676', lineHeight: 1.6, margin: 0 }}>Das Autohaus nimmt im Moment keine Fahrzeugmappen über das Internet an. Bitte wenden Sie sich direkt an den Betrieb.</p>
      </div>
    </main>
  );
}

export async function MappeSeite({ db, betrieb, kennung }: { db: MappeDb; betrieb: string; kennung: string }) {
  const firma = await firmaZu(db, betrieb);
  return (
    <BoerseSeite firma={firma} fussHinweis={MAPPE_FUSS}>
      <FahrzeugMappe k={kennung} firma={firma.name} akzent={firma.akzent} vorne={textAuf(firma.akzent)} datenschutz={mappeDatenschutz(firma)} />
    </BoerseSeite>
  );
}
