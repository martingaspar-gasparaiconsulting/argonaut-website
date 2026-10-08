// ============================================================
// ARGONAUT OS · Paket 272/273 · K11a — Fahrzeugbörse eines Kfz-Betriebs (ohne Login)
// argonaut-os.com/fahrzeuge/<kennung> — alle inserierten Fahrzeuge im Bestand,
// in der Aufbereitung oder im Zulauf, mit Filter und Sortierung.
// Google darf sie finden (Standard), außer der Chef hakt „Bei Google finden
// lassen" ab (dann noindex). Hat der Betrieb eine verbundene Domain, zeigt die
// Google-Adresse auf autohaus-domain/fahrzeuge (Paket 273).
// Daten nur über lib/kfzBoerseLaden (Positivliste); Ansicht in BoerseAnsichten.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { boersePfad, filterLesen, kanonisch } from '@/lib/kfzBoerse';
import { basisAdresse, betriebZuKennung, boerseDb, firmaZu, sichtbareFahrzeuge, verbundeneDomain } from '@/lib/kfzBoerseLaden';
import { ListeAnsicht, listeMeta, NICHT_GEFUNDEN_META, type BoerseKontext } from '../BoerseAnsichten';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ kennung: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const lade = cache(async (k: string) => {
  const db = boerseDb();
  const b = await betriebZuKennung(db, k);
  if (!b) return null;
  const [firma, liste, domain] = await Promise.all([firmaZu(db, b.betrieb), sichtbareFahrzeuge(db, b.betrieb), verbundeneDomain(db, b.betrieb)]);
  const basis = basisAdresse();
  const ctx: BoerseKontext = {
    kennung: k, einst: b.einst, firma, basis,
    pfad: (id) => boersePfad(k, id),
    kanon: (id) => kanonisch({ kennung: k, fahrzeugId: id, domain, basis }),
  };
  return { ctx, liste };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kennung } = await params;
  const d = await lade(kennung);
  return d ? listeMeta(d.ctx, d.liste.length) : NICHT_GEFUNDEN_META;
}

export default async function BoersePage({ params, searchParams }: Props) {
  const { kennung } = await params;
  const d = await lade(kennung);
  if (!d) notFound();
  return <ListeAnsicht ctx={d.ctx} liste={d.liste} filter={filterLesen(await searchParams)} />;
}
