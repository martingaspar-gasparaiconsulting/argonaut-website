// ============================================================
// ARGONAUT OS · Paket 272/273 · K11a — Fahrzeug-Detailseite der Fahrzeugbörse (ohne Login)
// argonaut-os.com/fahrzeuge/<kennung>/<fahrzeug-id> — Fotos, Preis mit
// Steuerhinweis, Kerndaten, Energie und CO₂, Ausstattung, Beschreibung,
// Anfrage-Formular. Strukturdaten schema.org/Car nur bei „Bei Google finden".
// Nie öffentlich: EK, Kalkulation, FIN, Kennzeichen, Notizen.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { boersePfad, kanonisch } from '@/lib/kfzBoerse';
import { basisAdresse, betriebZuKennung, boerseDb, firmaZu, sichtbaresFahrzeug, verbundeneDomain } from '@/lib/kfzBoerseLaden';
import { DetailAnsicht, detailMeta, NICHT_GEFUNDEN_META, type BoerseKontext } from '../../BoerseAnsichten';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ kennung: string; id: string }> };

const lade = cache(async (k: string, id: string) => {
  const db = boerseDb();
  const b = await betriebZuKennung(db, k);
  if (!b) return null;
  const [firma, fz, domain] = await Promise.all([firmaZu(db, b.betrieb), sichtbaresFahrzeug(db, b.betrieb, id), verbundeneDomain(db, b.betrieb)]);
  if (!fz) return null;
  const basis = basisAdresse();
  const ctx: BoerseKontext = {
    kennung: k, einst: b.einst, firma, basis,
    pfad: (fid) => boersePfad(k, fid),
    kanon: (fid) => kanonisch({ kennung: k, fahrzeugId: fid, domain, basis }),
  };
  return { ctx, ...fz };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kennung, id } = await params;
  const d = await lade(kennung, id);
  return d ? detailMeta(d.ctx, d.f, d.bilder) : NICHT_GEFUNDEN_META;
}

export default async function FahrzeugPage({ params }: Props) {
  const { kennung, id } = await params;
  const d = await lade(kennung, id);
  if (!d) notFound();
  return <DetailAnsicht ctx={d.ctx} f={d.f} bilder={d.bilder} />;
}
