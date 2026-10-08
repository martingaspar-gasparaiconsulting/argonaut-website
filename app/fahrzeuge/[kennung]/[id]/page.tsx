// ============================================================
// ARGONAUT OS · Paket 272 · K11a — Fahrzeug-Detailseite der Fahrzeugbörse (ohne Login)
// /fahrzeuge/<kennung>/<fahrzeug-id> — Fotos, Preis mit Steuerhinweis,
// Kerndaten, Energie und CO₂ (wie in der Akte bestätigt), Ausstattung,
// Beschreibung, Anfrage-Formular (-> Anfragen und Suchaufträge des Betriebs).
// Strukturdaten schema.org/Car nur, wenn der Betrieb Google eingeschaltet hat.
// Nie öffentlich: EK, Kalkulation, FIN, Kennzeichen, Notizen.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import {
  bildPfad, boersePfad, datenschutzHinweis, energieZeilen, fahrzeugName, fakten, jsonSicher, kurzZeile,
  preisText, preisZusatz, statusHinweis, strukturDaten, titel,
} from '@/lib/kfzBoerse';
import { basisAdresse, betriebZuKennung, boerseDb, firmaZu, sichtbaresFahrzeug } from '@/lib/kfzBoerseLaden';
import { BoerseSeite, F, st } from '../../BoerseTeile';
import AnfrageFormular from './AnfrageFormular';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ kennung: string; id: string }> };

const lade = cache(async (k: string, id: string) => {
  const db = boerseDb();
  const b = await betriebZuKennung(db, k);
  if (!b) return null;
  const [firma, fz] = await Promise.all([firmaZu(db, b.betrieb), sichtbaresFahrzeug(db, b.betrieb, id)]);
  if (!fz) return null;
  return { einst: b.einst, firma, ...fz };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kennung, id } = await params;
  const d = await lade(kennung, id);
  if (!d) return { title: 'Fahrzeug nicht gefunden', robots: { index: false, follow: false } };
  const name = titel(d.f);
  return {
    title: `${name} · ${preisText(d.f.vk_brutto)}${d.firma.name ? ' · ' + d.firma.name : ''}`,
    description: [kurzZeile(d.f), d.firma.name ? `Angebot von ${d.firma.name}${d.firma.ort ? ', ' + d.firma.ort : ''}` : null].filter(Boolean).join('. '),
    robots: d.einst.google ? { index: true, follow: true } : { index: false, follow: false },
    alternates: d.einst.google ? { canonical: boersePfad(kennung, id) } : undefined,
    openGraph: d.einst.google && d.bilder.length ? { title: name, images: [basisAdresse() + bildPfad(kennung, d.bilder[0])] } : undefined,
  };
}

export default async function FahrzeugPage({ params }: Props) {
  const { kennung, id } = await params;
  const d = await lade(kennung, id);
  if (!d) notFound();
  const f = d.f;
  const zusatz = preisZusatz(f);
  const hinweis = statusHinweis(f.status);
  const energie = energieZeilen(f);
  const daten = d.einst.google
    ? jsonSicher(strukturDaten(f, { basis: basisAdresse(), kennung, bilder: d.bilder.map((b) => bildPfad(kennung, b)), firma: d.firma.name || null, ort: d.firma.ort || null }))
    : null;

  return (
    <BoerseSeite firma={d.firma}>
      {daten && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: daten }} />}
      <a href={boersePfad(kennung)} style={{ color: F.dim, fontSize: 13.5, textDecoration: 'none' }}>← Alle Fahrzeuge</a>
      <div style={{ margin: '8px 0 16px' }}>
        {hinweis && <span style={{ ...st.pill, marginBottom: 6 }}>{hinweis}</span>}
        <h1 style={st.h1}>{titel(f)}</h1>
        {f.inserat_titel && <div style={st.dim}>{fahrzeugName(f)}</div>}
      </div>

      <div className="bx-zwei">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {d.bilder.length > 0
            ? (
              <div>
                <div className="bx-galerie" aria-label="Fotos">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {d.bilder.map((b, i) => <img key={b} src={bildPfad(kennung, b)} alt={`${titel(f)} – Foto ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} />)}
                </div>
                {d.bilder.length > 1 && <div style={{ ...st.klein, marginTop: 6 }}>{d.bilder.length} Fotos · zur Seite wischen</div>}
              </div>
            )
            : <div className="bx-leer" style={{ borderRadius: 14 }}>FOTOS FOLGEN</div>}

          <section style={st.box}>
            <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Fahrzeugdaten</h2>
            <table style={st.tab}><tbody>
              {fakten(f).map(([a, b]) => <tr key={a}><th style={st.th}>{a}</th><td style={st.td}>{b}</td></tr>)}
            </tbody></table>
          </section>

          {f.ausstattung.length > 0 && (
            <section style={st.box}>
              <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Ausstattung</h2>
              <ul style={{ margin: 0, paddingLeft: 18, columns: '2 220px', columnGap: 24, fontSize: 14, lineHeight: 1.7 }}>
                {f.ausstattung.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </section>
          )}

          {f.inserat_text && (
            <section style={st.box}>
              <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Beschreibung</h2>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.6 }}>{f.inserat_text}</div>
            </section>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <section style={st.box}>
            <div style={st.preis}>{preisText(f.vk_brutto)}</div>
            {zusatz && <div style={st.klein}>{zusatz}</div>}
            {energie.length > 0 && (
              <table style={{ ...st.tab, marginTop: 12, fontSize: 13 }}><tbody>
                {energie.map(([a, b]) => <tr key={a}><th style={{ ...st.th, whiteSpace: 'normal' }}>{a}</th><td style={st.td}>{b}</td></tr>)}
              </tbody></table>
            )}
            {(d.firma.telefon || d.firma.email) && (
              <div style={{ marginTop: 12, display: 'grid', gap: 4, fontSize: 14 }}>
                {d.firma.telefon && <a href={`tel:${d.firma.telefon.replace(/[^+0-9]/g, '')}`} style={{ color: F.text, fontWeight: 700 }}>☎ {d.firma.telefon}</a>}
                {f.interne_nr && <span style={st.klein}>Bitte nennen Sie die Fahrzeug-Nr. {f.interne_nr}</span>}
              </div>
            )}
          </section>
          <section style={st.box}>
            <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Anfrage zu diesem Fahrzeug</h2>
            <AnfrageFormular k={kennung} id={f.id} firma={d.firma.name || null} akzent={d.firma.akzent} hinweis={datenschutzHinweis(d.firma)} />
          </section>
        </aside>
      </div>
    </BoerseSeite>
  );
}
