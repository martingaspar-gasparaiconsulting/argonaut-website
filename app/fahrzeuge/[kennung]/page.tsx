// ============================================================
// ARGONAUT OS · Paket 272 · K11a — Fahrzeugbörse eines Kfz-Betriebs (ohne Login)
// /fahrzeuge/<kennung> — alle inserierten Fahrzeuge im Bestand, in der
// Aufbereitung oder im Zulauf, mit Filter (Marke, Kraftstoff, Preis bis)
// und Sortierung. Serverseitig gerendert, damit Google die Seite lesen kann
// — Google darf sie finden (Standard), außer der Chef hakt „Bei Google finden
// lassen" ab (dann noindex). Daten nur über lib/kfzBoerseLaden (Positivliste).
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { auswahlWerte, bildPfad, boersePfad, energieZeilen, filterLesen, filtern, kurzZeile, preisText, preisZusatz, statusHinweis, textAuf, titel } from '@/lib/kfzBoerse';
import { betriebZuKennung, boerseDb, firmaZu, sichtbareFahrzeuge } from '@/lib/kfzBoerseLaden';
import { BoerseSeite, F, st } from '../BoerseTeile';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ kennung: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const lade = cache(async (k: string) => {
  const db = boerseDb();
  const b = await betriebZuKennung(db, k);
  if (!b) return null;
  const [firma, liste] = await Promise.all([firmaZu(db, b.betrieb), sichtbareFahrzeuge(db, b.betrieb)]);
  return { einst: b.einst, firma, liste };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kennung } = await params;
  const d = await lade(kennung);
  if (!d) return { title: 'Nicht gefunden', robots: { index: false, follow: false } };
  const name = d.firma.name || 'Fahrzeugangebot';
  return {
    title: `Fahrzeuge von ${name}${d.firma.ort ? ' in ' + d.firma.ort : ''}`,
    description: `${d.liste.length} Fahrzeuge im Angebot von ${name}${d.firma.ort ? ', ' + d.firma.ort : ''}. Fotos, Ausstattung, Preise und direkte Anfrage.`,
    robots: d.einst.google ? { index: true, follow: true } : { index: false, follow: false },
    alternates: d.einst.google ? { canonical: boersePfad(kennung) } : undefined,
  };
}

export default async function BoersePage({ params, searchParams }: Props) {
  const { kennung } = await params;
  const d = await lade(kennung);
  if (!d) notFound();
  const filter = filterLesen(await searchParams);
  const alle = d.liste.map((x) => x.f);
  const bild = new Map(d.liste.map((x) => [x.f.id, x.bild]));
  const zeigen = filtern(alle, filter);
  const marken = auswahlWerte(alle, 'marke');
  const kraftstoffe = auswahlWerte(alle, 'kraftstoff');
  const gefiltert = !!(filter.marke || filter.kraftstoff || filter.preisBis);

  return (
    <BoerseSeite firma={d.firma}>
      <h1 style={st.h1}>Unsere Fahrzeuge</h1>
      <p style={{ ...st.dim, margin: '0 0 16px' }}>{alle.length === 1 ? '1 Fahrzeug' : `${alle.length} Fahrzeuge`} im Angebot{gefiltert ? ` · ${zeigen.length} passend` : ''}</p>

      {alle.length > 0 && (
        <form method="get" className="bx-filter" style={{ ...st.box, marginBottom: 18 }}>
          <label>Marke<select name="marke" defaultValue={filter.marke ?? ''}><option value="">alle</option>{marken.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label>Kraftstoff<select name="kraftstoff" defaultValue={filter.kraftstoff ?? ''}><option value="">alle</option>{kraftstoffe.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label>Preis bis (€)<input name="bis" inputMode="numeric" defaultValue={filter.preisBis ? String(filter.preisBis) : ''} placeholder="z. B. 25000" style={{ width: 130 }} /></label>
          <label>Sortieren<select name="sort" defaultValue={filter.sort}>
            <option value="neu">Neueste zuerst</option><option value="preis_auf">Preis aufsteigend</option><option value="preis_ab">Preis absteigend</option><option value="km">Kilometer aufsteigend</option>
          </select></label>
          <button type="submit" style={{ background: d.firma.akzent, color: textAuf(d.firma.akzent), border: 0, borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>Anzeigen</button>
          {gefiltert && <a href={boersePfad(kennung)} style={{ color: F.dim, fontSize: 13.5, padding: '10px 4px' }}>Filter zurücksetzen</a>}
        </form>
      )}

      {alle.length === 0 && <div style={st.box}><p style={{ margin: 0 }}>Zurzeit sind keine Fahrzeuge eingestellt. Rufen Sie uns gern an — vieles ist auch kurzfristig verfügbar.</p></div>}
      {alle.length > 0 && zeigen.length === 0 && <div style={st.box}><p style={{ margin: 0 }}>Kein Fahrzeug passt zu diesem Filter.</p></div>}

      <div className="bx-raster">
        {zeigen.map((f) => {
          const b = bild.get(f.id);
          const hinweis = statusHinweis(f.status);
          const zusatz = preisZusatz(f);
          const energie = energieZeilen(f);
          return (
            <a key={f.id} href={boersePfad(kennung, f.id)} className="bx-karte">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b ? <img className="bx-bild" src={bildPfad(kennung, b)} alt={titel(f)} loading="lazy" /> : <div className="bx-leer">FOTO FOLGT</div>}
              <div style={{ padding: '12px 14px 14px', display: 'grid', gap: 6, flex: 1 }}>
                {hinweis && <span style={{ ...st.pill, justifySelf: 'start' }}>{hinweis}</span>}
                <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>{titel(f)}</div>
                <div style={st.klein}>{kurzZeile(f)}</div>
                {energie.length > 0 && <div style={{ ...st.klein, fontSize: 11.5 }}>{energie.map(([a, b2]) => `${a}: ${b2}`).join(' · ')}</div>}
                <div style={{ marginTop: 'auto' }}>
                  <div style={st.preis}>{preisText(f.vk_brutto)}</div>
                  {zusatz && <div style={st.klein}>{zusatz}</div>}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </BoerseSeite>
  );
}
