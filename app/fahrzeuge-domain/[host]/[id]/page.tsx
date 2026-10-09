// ============================================================
// ARGONAUT OS · Paket 273 · K11a — Fahrzeug-Detailseite auf der Domain des Betriebs
// autohaus-muster.de/fahrzeuge/<id> -> /fahrzeuge-domain/<host>/<id> (proxy.ts).
// Betrieb nur über die Domain (web_seiten.domain), Börse muss eingeschaltet sein.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { cache } from 'react';
import { domainPfad, hostSauber } from '@/lib/kfzBoerse';
import { aufrufZaehlen, betriebZuDomain, boerseDb, firmaZu, sichtbaresFahrzeug } from '@/lib/kfzBoerseLaden';
import { DetailAnsicht, detailMeta, NICHT_GEFUNDEN_META, type BoerseKontext } from '../../../fahrzeuge/BoerseAnsichten';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ host: string; id: string }> };

const lade = cache(async (hostRoh: string, id: string) => {
  const host = hostSauber(decodeURIComponent(hostRoh));
  if (!host) return null;
  const db = boerseDb();
  const b = await betriebZuDomain(db, host);
  if (!b) return null;
  const [firma, fz] = await Promise.all([firmaZu(db, b.betrieb), sichtbaresFahrzeug(db, b.betrieb, id)]);
  if (!fz) return null;
  const basis = `https://${b.domain}`;
  const ctx: BoerseKontext = { kennung: b.kennung, einst: b.einst, firma, basis, roh: b.roh, pfad: domainPfad, kanon: (fid) => basis + domainPfad(fid) };
  return { ctx, betrieb: b.betrieb, ...fz };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host, id } = await params;
  const d = await lade(host, id);
  return d ? detailMeta(d.ctx, d.f, d.bilder) : NICHT_GEFUNDEN_META;
}

export default async function FahrzeugDomainPage({ params }: Props) {
  const { host, id } = await params;
  const d = await lade(host, id);
  if (!d) notFound();
  await aufrufZaehlen(boerseDb(), d.betrieb, d.f.id, await headers());   // Paket 275: nur die Seite selbst, nicht die Metadaten
  return <DetailAnsicht ctx={d.ctx} f={d.f} bilder={d.bilder} />;
}
