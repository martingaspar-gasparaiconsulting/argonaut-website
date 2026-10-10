import type { Metadata } from 'next';
import { betriebZuKennung, mappeDb } from '@/lib/fahrzeugMappeServer';
import { firmaZu } from '@/lib/kfzBoerseLaden';
import { MappeSeite, NichtVerfuegbar } from '../MappeSeite';

// ============================================================
// ARGONAUT OS · Paket 305 · FM1 Fahrzeugmappe unter /ankauf/<kennung>
// (bisher das einfache Online-Ankaufformular aus Paket 264 — gleicher Link,
// gleicher Schalter „🌐 Online-Formular" unter „Ankauf und Bewertung").
// Betrieb NUR über die geheime Kennung; ausgeschaltet -> „nicht verfügbar".
// Nicht für Suchmaschinen (die Seite ist ein Formular, kein Angebot).
// ============================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ kennung: string }> }): Promise<Metadata> {
  const { kennung } = await params;
  const db = mappeDb();
  const betrieb = await betriebZuKennung(db, kennung).catch(() => null);
  const firma = betrieb ? await firmaZu(db, betrieb).catch(() => null) : null;
  return {
    title: firma?.name ? `Fahrzeug bewerten lassen · ${firma.name}` : 'Fahrzeug bewerten lassen',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function AnkaufMappePage({ params }: { params: Promise<{ kennung: string }> }) {
  const { kennung } = await params;
  const db = mappeDb();
  const betrieb = await betriebZuKennung(db, kennung).catch(() => null);
  if (!betrieb) return <NichtVerfuegbar />;
  return <MappeSeite db={db} betrieb={betrieb} kennung={kennung} />;
}
