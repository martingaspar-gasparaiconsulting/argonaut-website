// ============================================================
// ARGONAUT OS · Paket 273 · K11a — Fahrzeugbörse auf der Domain des Betriebs
// autohaus-muster.de/fahrzeuge -> proxy.ts schreibt intern auf
// /fahrzeuge-domain/<host> um. Der Betrieb ergibt sich NUR aus der Domain,
// die er im Website-Bauer eingetragen hat (web_seiten.domain), und die Börse
// muss eingeschaltet sein. Links bleiben auf seiner Domain (/fahrzeuge/<id>),
// die Google-Adresse zeigt auf seine Domain. Gleiche Ansicht wie argonaut-os.com.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { domainPfad, filterLesen, hostSauber } from '@/lib/kfzBoerse';
import { betriebZuDomain, boerseDb, firmaZu, sichtbareFahrzeuge } from '@/lib/kfzBoerseLaden';
import { ListeAnsicht, listeMeta, NICHT_GEFUNDEN_META, type BoerseKontext } from '../../fahrzeuge/BoerseAnsichten';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ host: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const lade = cache(async (hostRoh: string) => {
  const host = hostSauber(decodeURIComponent(hostRoh));
  if (!host) return null;
  const db = boerseDb();
  const b = await betriebZuDomain(db, host);
  if (!b) return null;
  const [firma, liste] = await Promise.all([firmaZu(db, b.betrieb), sichtbareFahrzeuge(db, b.betrieb)]);
  const basis = `https://${b.domain}`;
  const ctx: BoerseKontext = { kennung: b.kennung, einst: b.einst, firma, basis, pfad: domainPfad, kanon: (id) => basis + domainPfad(id) };
  return { ctx, liste };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { host } = await params;
  const d = await lade(host);
  return d ? listeMeta(d.ctx, d.liste.length) : NICHT_GEFUNDEN_META;
}

export default async function BoerseDomainPage({ params, searchParams }: Props) {
  const { host } = await params;
  const d = await lade(host);
  if (!d) notFound();
  return <ListeAnsicht ctx={d.ctx} liste={d.liste} filter={filterLesen(await searchParams)} />;
}
