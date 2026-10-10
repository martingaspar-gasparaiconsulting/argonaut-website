import type { Metadata } from 'next';
import { betriebZuDomain, mappeDb } from '@/lib/fahrzeugMappeServer';
import { firmaZu } from '@/lib/kfzBoerseLaden';
import { MappeSeite, NichtVerfuegbar } from '../../ankauf/MappeSeite';

// ============================================================
// ARGONAUT OS · Paket 305 · FM1 Fahrzeugmappe auf der Domain des Autohauses
// autohaus.de/fahrzeug-verkaufen -> (proxy.ts) /ankauf-domain/<host>.
// Welcher Betrieb, entscheidet allein die Domain im Website-Bauer (genau ein
// Besitzer) und ob dort der Online-Ankauf eingeschaltet ist — sonst „nicht verfügbar".
// ============================================================

export const dynamic = 'force-dynamic';

async function laden(host: string) {
  const db = mappeDb();
  const t = await betriebZuDomain(db, decodeURIComponent(host || '')).catch(() => null);
  return { db, t };
}

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const { host } = await params;
  const { db, t } = await laden(host);
  const firma = t ? await firmaZu(db, t.betrieb).catch(() => null) : null;
  return {
    title: firma?.name ? `Fahrzeug bewerten lassen · ${firma.name}` : 'Fahrzeug bewerten lassen',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function AnkaufDomainPage({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const { db, t } = await laden(host);
  if (!t) return <NichtVerfuegbar />;
  return <MappeSeite db={db} betrieb={t.betrieb} kennung={t.kennung} />;
}
