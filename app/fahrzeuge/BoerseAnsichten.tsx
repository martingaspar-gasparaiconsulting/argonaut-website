// ============================================================
// ARGONAUT OS · Paket 273 · K11a — Ansichten der Fahrzeugbörse (gemeinsam)
// Liste und Detailseite, einmal gebaut, zweimal genutzt:
//  · argonaut-os.com/fahrzeuge/<kennung>[/<id>]         (app/fahrzeuge)
//  · <domain-des-betriebs>/fahrzeuge[/<id>]             (app/fahrzeuge-domain, per Proxy)
// Links laufen über ctx.pfad(), die Google-Adresse über ctx.kanon() — liegt eine
// verbundene Domain des Betriebs vor, zeigt sie IMMER auf diese Domain.
// Daten kommen nur aus lib/kfzBoerseLaden (Positivliste).
// ============================================================

import type { Metadata } from 'next';
import {
  auswahlWerte, bildPfad, datenschutzHinweis, energieZeilen, fahrzeugName, fakten, filtern, jsonSicher, kurzZeile,
  preisText, preisZusatz, statusHinweis, strukturDaten, textAuf, titel, type BoerseEinstellung, type BoerseFahrzeug, type Filter,
} from '@/lib/kfzBoerse';
import type { Firma } from '@/lib/kfzBoerseLaden';
import { historieText } from '@/lib/partnerAnbindung';
import { BoerseSeite, F, st } from './BoerseTeile';
import AnfrageFormular from './[kennung]/[id]/AnfrageFormular';
import { FINANZ_KEY, EXTRAS_KEY, finanzEinstellung, boerseBereit, beispiel, pflichtZeilen, extrasLesen, BEISPIEL_HINWEIS } from '@/lib/kfzFinanzierung';

export type BoerseKontext = {
  kennung: string;
  einst: BoerseEinstellung;
  firma: Firma;
  /** Link innerhalb der Börse (relativ, je nach Weg mit oder ohne Kennung). */
  pfad: (fahrzeugId?: string) => string;
  /** Absolute Google-Adresse (Händler-Domain, wenn verbunden). */
  kanon: (fahrzeugId?: string) => string;
  /** Absolute Basis für Bilder in den Strukturdaten. */
  basis: string;
  /** Paket 282: Einstellung roh (Zusatzleistungen, Finanzierungsbeispiel). */
  roh?: unknown;
};

const NICHT_FINDEN = { index: false, follow: false } as const;

export function listeMeta(ctx: BoerseKontext, anzahl: number): Metadata {
  const name = ctx.firma.name || 'Fahrzeugangebot';
  return {
    title: `Fahrzeuge von ${name}${ctx.firma.ort ? ' in ' + ctx.firma.ort : ''}`,
    description: `${anzahl} Fahrzeuge im Angebot von ${name}${ctx.firma.ort ? ', ' + ctx.firma.ort : ''}. Fotos, Ausstattung, Preise und direkte Anfrage.`,
    robots: ctx.einst.google ? { index: true, follow: true } : NICHT_FINDEN,
    alternates: ctx.einst.google ? { canonical: ctx.kanon() } : undefined,
  };
}

export function detailMeta(ctx: BoerseKontext, f: BoerseFahrzeug, bilder: string[]): Metadata {
  const name = titel(f);
  return {
    title: `${name} · ${preisText(f.vk_brutto)}${ctx.firma.name ? ' · ' + ctx.firma.name : ''}`,
    description: [kurzZeile(f), ctx.firma.name ? `Angebot von ${ctx.firma.name}${ctx.firma.ort ? ', ' + ctx.firma.ort : ''}` : null].filter(Boolean).join('. '),
    robots: ctx.einst.google ? { index: true, follow: true } : NICHT_FINDEN,
    alternates: ctx.einst.google ? { canonical: ctx.kanon(f.id) } : undefined,
    openGraph: ctx.einst.google && bilder.length ? { title: name, url: ctx.kanon(f.id), images: [ctx.basis + bildPfad(ctx.kennung, bilder[0])] } : undefined,
  };
}

export const NICHT_GEFUNDEN_META: Metadata = { title: 'Nicht gefunden', robots: NICHT_FINDEN };

export function ListeAnsicht({ ctx, liste, filter }: { ctx: BoerseKontext; liste: { f: BoerseFahrzeug; bild: string | null }[]; filter: Filter }) {
  const alle = liste.map((x) => x.f);
  const bild = new Map(liste.map((x) => [x.f.id, x.bild]));
  const zeigen = filtern(alle, filter);
  const marken = auswahlWerte(alle, 'marke');
  const kraftstoffe = auswahlWerte(alle, 'kraftstoff');
  const gefiltert = !!(filter.marke || filter.kraftstoff || filter.preisBis);

  return (
    <BoerseSeite firma={ctx.firma}>
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
          <button type="submit" style={{ background: ctx.firma.akzent, color: textAuf(ctx.firma.akzent), border: 0, borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>Anzeigen</button>
          {gefiltert && <a href={ctx.pfad()} style={{ color: F.dim, fontSize: 13.5, padding: '10px 4px' }}>Filter zurücksetzen</a>}
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
            <a key={f.id} href={ctx.pfad(f.id)} className="bx-karte">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b ? <img className="bx-bild" src={bildPfad(ctx.kennung, b)} alt={titel(f)} loading="lazy" /> : <div className="bx-leer">FOTO FOLGT</div>}
              <div style={{ padding: '12px 14px 14px', display: 'grid', gap: 6, flex: 1 }}>
                {hinweis && <span style={{ ...st.pill, justifySelf: 'start' }}>{hinweis}</span>}
                <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>{titel(f)}</div>
                <div style={st.klein}>{kurzZeile(f)}</div>
                {f.historie && <div style={{ ...st.klein, color: '#1F7A4D', fontWeight: 700 }}>✓ Fahrzeughistorie geprüft</div>}
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

export function DetailAnsicht({ ctx, f, bilder }: { ctx: BoerseKontext; f: BoerseFahrzeug; bilder: string[] }) {
  const zusatz = preisZusatz(f);
  const hinweis = statusHinweis(f.status);
  // Paket 282: Zusatzleistungen zum Auswählen und Finanzierungsbeispiel (nur vollständig + bestätigt)
  const roh = ctx.roh && typeof ctx.roh === 'object' ? (ctx.roh as Record<string, unknown>) : {};
  const extras = extrasLesen(roh[EXTRAS_KEY]);
  const fe = finanzEinstellung(roh[FINANZ_KEY]);
  const fb = boerseBereit(fe) ? beispiel(f.vk_brutto, fe) : null;
  const energie = energieZeilen(f);
  const daten = ctx.einst.google
    ? jsonSicher(strukturDaten(f, { basis: ctx.basis, url: ctx.kanon(f.id), bilder: bilder.map((b) => bildPfad(ctx.kennung, b)), firma: ctx.firma.name || null, ort: ctx.firma.ort || null }))
    : null;

  return (
    <BoerseSeite firma={ctx.firma}>
      {daten && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: daten }} />}
      <a href={ctx.pfad()} style={{ color: F.dim, fontSize: 13.5, textDecoration: 'none' }}>← Alle Fahrzeuge</a>
      <div style={{ margin: '8px 0 16px' }}>
        {hinweis && <span style={{ ...st.pill, marginBottom: 6 }}>{hinweis}</span>}
        <h1 style={st.h1}>{titel(f)}</h1>
        {f.inserat_titel && <div style={st.dim}>{fahrzeugName(f)}</div>}
      </div>

      <div className="bx-zwei">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {bilder.length > 0
            ? (
              <div>
                <div className="bx-galerie" aria-label="Fotos">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {bilder.map((b, i) => <img key={b} src={bildPfad(ctx.kennung, b)} alt={`${titel(f)} – Foto ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} />)}
                </div>
                {bilder.length > 1 && <div style={{ ...st.klein, marginTop: 6 }}>{bilder.length} Fotos · zur Seite wischen</div>}
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
            {f.historie && (
              <a href={f.historie.url} target="_blank" rel="noopener nofollow" style={{ display: 'block', marginTop: 12, background: '#E9F7EF', border: '1px solid #4CAF7D', borderRadius: 10, padding: '9px 12px', color: '#14532D', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
                ✓ {historieText(f.historie)} · Bericht ansehen ↗
              </a>
            )}
            {(ctx.firma.telefon || ctx.firma.email) && (
              <div style={{ marginTop: 12, display: 'grid', gap: 4, fontSize: 14 }}>
                {ctx.firma.telefon && <a href={`tel:${ctx.firma.telefon.replace(/[^+0-9]/g, '')}`} style={{ color: F.text, fontWeight: 700 }}>☎ {ctx.firma.telefon}</a>}
                {f.interne_nr && <span style={st.klein}>Bitte nennen Sie die Fahrzeug-Nr. {f.interne_nr}</span>}
              </div>
            )}
          </section>
          {fb && (
            <section style={st.box} aria-label="Finanzierungsbeispiel">
              <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Finanzierungsbeispiel</h2>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{fb.rate.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € <span style={{ fontSize: 13, fontWeight: 500 }}>im Monat</span></div>
              <table style={{ ...st.tab, fontSize: 13 }}><tbody>
                {pflichtZeilen(fb, fe).map(([a2, b2]) => <tr key={a2}><th style={{ ...st.th, whiteSpace: 'normal' }}>{a2}</th><td style={st.td}>{b2}</td></tr>)}
              </tbody></table>
              <div style={{ ...st.klein, marginTop: 8 }}>{BEISPIEL_HINWEIS}{fe.hinweis ? ' ' + fe.hinweis : ''}</div>
            </section>
          )}
          <section style={st.box}>
            <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Anfrage zu diesem Fahrzeug</h2>
            <AnfrageFormular k={ctx.kennung} id={f.id} firma={ctx.firma.name || null} akzent={ctx.firma.akzent} hinweis={datenschutzHinweis(ctx.firma)} extras={extras} preis={f.vk_brutto} />
          </section>
        </aside>
      </div>
    </BoerseSeite>
  );
}
