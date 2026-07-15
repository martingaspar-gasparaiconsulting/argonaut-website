'use client';

// ============================================================
// ARGONAUT OS · BLOCK 2.2 · Sortiment-Analyse
// ------------------------------------------------------------
// Liest die DB-Funktion public.sortiment_analyse(von, bis) und
// zeigt: KPI-Kacheln · ABC-Donut · Renner-Balken · Detail-
// Tabelle mit ABC-Ampel · KI-Klartext ("Was heißt das für mich?").
//
// Visualisierung: recharts (Block-B-Standard).
// Inline-Styles (kein Tailwind). Branding: ARGONAUT / "die KI".
// Marken: Navy #0A1628 · Gold #C9A84C · Cyan #00e5ff.
// Pfad im Repo: app/dashboard/erp/sortiment/page.tsx
// ============================================================

import { useEffect, useState, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import KiKlartext from '../../_components/KiKlartext';

// --- Supabase Browser-Client (Cookie-Session, wie der Rest der App) ---
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

// --- Marken-Tokens ------------------------------------------
const C = {
  navy: '#0A1628',
  navySoft: '#0F2036',
  card: '#0E1D30',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  text: '#E8EEF5',
  dim: '#8FA3B8',
  line: 'rgba(255,255,255,0.08)',
  green: '#3FB950',
  yellow: '#D8A657',
  red: '#E5534B',
  grey: '#5A6B7D',
};

// --- Zeile aus sortiment_analyse ----------------------------
interface Zeile {
  artikel_id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  kategorie: string | null;
  einheit: string;
  verbrauch: number;
  verbrauchswert: number;
  umsatz: number | null;
  deckungsbeitrag: number | null;
  bestand: number;
  lagerwert_gebunden: number;
  umschlag: number | null;
  reichweite_tage: number | null;
  abc_klasse: string;
  status: string;
  preis_pflege: string;
  letzter_abgang: string | null;
}

// --- Zeitraum-Presets ---------------------------------------
const PRESETS = [
  { key: '30', label: '30 Tage', tage: 30 },
  { key: '90', label: '90 Tage', tage: 90 },
  { key: '365', label: '1 Jahr', tage: 365 },
  { key: 'alles', label: 'Gesamt', tage: 3650 },
];

// --- Formatierung -------------------------------------------
function euro(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function zahl(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return n.toLocaleString('de-DE');
}
function abcFarbe(k: string): string {
  if (k === 'A') return C.gold;
  if (k === 'B') return C.cyan;
  if (k === 'C') return C.grey;
  return C.grey;
}
function datum(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE');
}

export default function SortimentPage() {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [preset, setPreset] = useState('90');

  // --- Daten laden --------------------------------------------
  const datenLaden = useCallback(async (tage: number) => {
    setLaden(true);
    setFehler(null);
    const bis = new Date();
    const von = new Date();
    von.setDate(von.getDate() - tage);
    const { data, error } = await supabase.rpc('sortiment_analyse', {
      p_von: von.toISOString(),
      p_bis: bis.toISOString(),
    });
    if (error) {
      setFehler(error.message);
      setZeilen([]);
    } else {
      setZeilen((data ?? []) as Zeile[]);
    }
    setLaden(false);
  }, []);

  useEffect(() => {
    const p = PRESETS.find((x) => x.key === preset) ?? PRESETS[1];
    datenLaden(p.tage);
  }, [preset, datenLaden]);

  // --- Kennzahlen (KPIs) --------------------------------------
  const gebKapital = useMemo(
    () => zeilen.reduce((s, z) => s + (z.lagerwert_gebunden || 0), 0),
    [zeilen],
  );
  const anzahlA = useMemo(() => zeilen.filter((z) => z.abc_klasse === 'A').length, [zeilen]);
  const anzahlLada = useMemo(
    () => zeilen.filter((z) => z.status === 'LADENHÜTER').length,
    [zeilen],
  );
  const topKapital = useMemo(
    () => [...zeilen].sort((a, b) => (b.verbrauchswert || 0) - (a.verbrauchswert || 0))[0] ?? null,
    [zeilen],
  );

  // --- Donut: Verbrauchswert je ABC-Klasse --------------------
  const abcAgg = useMemo(
    () =>
      ['A', 'B', 'C']
        .map((k) => ({
          name: 'Klasse ' + k,
          klasse: k,
          wert: zeilen
            .filter((z) => z.abc_klasse === k)
            .reduce((s, z) => s + (z.verbrauchswert || 0), 0),
        }))
        .filter((d) => d.wert > 0),
    [zeilen],
  );

  // --- Balken: Top 8 nach Verbrauchswert ----------------------
  const topBalken = useMemo(
    () =>
      [...zeilen]
        .filter((z) => (z.verbrauchswert || 0) > 0)
        .sort((a, b) => (b.verbrauchswert || 0) - (a.verbrauchswert || 0))
        .slice(0, 8)
        .map((z) => ({
          name: z.bezeichnung.length > 20 ? z.bezeichnung.slice(0, 19) + '…' : z.bezeichnung,
          wert: z.verbrauchswert,
        })),
    [zeilen],
  );

  // --- KI-Kontext (die Box holt sich damit ihre Einschätzung) -
  const kiKontext = useMemo(() => {
    if (laden || zeilen.length === 0) return '';
    const lada = zeilen.filter((z) => z.status === 'LADENHÜTER');
    const ueber = zeilen.filter((z) => (z.reichweite_tage ?? 0) > 180);
    const label = PRESETS.find((x) => x.key === preset)?.label ?? '';
    return (
      `Sortiment-Analyse Zeitraum ${label}. ${zeilen.length} aktive Artikel. ` +
      `Gebundenes Kapital gesamt ${gebKapital.toFixed(2)} Euro. ${anzahlA} A-Artikel (Kapitaltraeger). ` +
      `Groesster Kapitaltraeger: ${topKapital ? topKapital.bezeichnung + ' mit ' + (topKapital.verbrauchswert || 0).toFixed(2) + ' Euro Verbrauchswert' : 'keiner'}. ` +
      `WICHTIG: Es gibt zwei UNTERSCHIEDLICHE Problemtypen, die NICHT verwechselt werden duerfen. ` +
      `Problemtyp 1 - LADENHUETER: ${lada.length} Artikel mit null Abgang im Zeitraum` +
      `${lada.length > 0 ? ' (' + lada.slice(0, 4).map((z) => z.bezeichnung).join(', ') + ')' : ''}. ` +
      `Diese verkaufen sich gar nicht - es gibt keine Nachfrage. Sinnvolle Massnahme: aus dem Sortiment nehmen pruefen, ` +
      `Restbestand als Sonderposten abverkaufen und NICHT nachbestellen. Ein Rabatt allein hilft hier kaum, weil die Nachfrage fehlt. ` +
      `Problemtyp 2 - UEBERBESTAND: ${ueber.length} Artikel, die zwar laufen, aber eine Reichweite ueber 180 Tage haben` +
      `${ueber.length > 0 ? ' (' + ueber.slice(0, 4).map((z) => z.bezeichnung).join(', ') + ')' : ''}. ` +
      `Hier ist Nachfrage vorhanden, es wurde nur zu viel eingekauft. Sinnvolle Massnahme: Nachbestellung stoppen oder reduzieren ` +
      `und den Bestand ggf. mit einem Rabatt schneller abverkaufen. ` +
      `Formuliere die Handlungsempfehlung so, dass Rabattaktionen nur den Ueberbestaenden (Problemtyp 2) zugeordnet werden, ` +
      `und die Ladenhueter (Problemtyp 1) stattdessen zum Aussortieren/Abverkaufen empfohlen werden.`
    );
  }, [laden, zeilen, preset, gebKapital, anzahlA, topKapital]);

  // ============================================================
  // Styles
  // ============================================================
  const seite: CSSProperties = {
    background: C.navy,
    minHeight: '100vh',
    padding: '28px 32px 60px',
    color: C.text,
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };
  const karte: CSSProperties = {
    background: C.card,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    padding: 20,
  };
  const th: CSSProperties = {
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: 'clamp(12px, 1.06vw, 17px)',
    letterSpacing: 0.4,
    color: C.dim,
    textTransform: 'uppercase',
    borderBottom: `1px solid ${C.line}`,
    whiteSpace: 'nowrap',
  };
  const td: CSSProperties = {
    padding: '11px 12px',
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    borderBottom: `1px solid ${C.line}`,
    whiteSpace: 'nowrap',
  };

  const presetBtn = (aktiv: boolean): CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 9,
    border: `1px solid ${aktiv ? C.gold : C.line}`,
    background: aktiv ? 'rgba(201,168,76,0.14)' : 'transparent',
    color: aktiv ? C.gold : C.dim,
    fontSize: 'clamp(13px, 1.13vw, 18px)',
    fontWeight: 600,
    cursor: 'pointer',
  });

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={seite}>
      {/* Kopf */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, color: C.gold, fontWeight: 700 }}>ERP · BLOCK 2.2</div>
          <h1 style={{ margin: '4px 0 0', fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800 }}>
            Sortiment-Analyse
          </h1>
          <div style={{ color: C.dim, fontSize: 'clamp(14px, 1.25vw, 20px)', marginTop: 4 }}>
            ABC · Renner/Penner · Umschlag · Reichweite · Ladenhüter · gebundenes Kapital
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {PRESETS.map((p) => (
            <button key={p.key} style={presetBtn(preset === p.key)} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fehler */}
      {fehler && (
        <div style={{ ...karte, borderColor: C.red, color: C.red, marginBottom: 20 }}>
          Fehler beim Laden: {fehler}
        </div>
      )}

      {/* Ladezustand */}
      {laden ? (
        <div style={{ ...karte, textAlign: 'center', color: C.dim }}>Analyse wird berechnet …</div>
      ) : zeilen.length === 0 ? (
        <div style={{ ...karte, textAlign: 'center', color: C.dim }}>
          Keine Artikel im gewählten Zeitraum.
        </div>
      ) : (
        <>
          {/* KPI-Kacheln */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Gebundenes Kapital', wert: euro(gebKapital), farbe: C.gold },
              { label: 'A-Artikel (Kapitalträger)', wert: String(anzahlA), farbe: C.cyan },
              { label: 'Ladenhüter', wert: String(anzahlLada), farbe: anzahlLada > 0 ? C.red : C.green },
              {
                label: 'Größter Kapitalträger',
                wert: topKapital ? topKapital.bezeichnung : '–',
                sub: topKapital ? euro(topKapital.verbrauchswert) + ' Verbrauch' : '',
                farbe: C.text,
              },
            ].map((k, i) => (
              <div key={i} style={{ ...karte, flex: '1 1 200px', minWidth: 200 }}>
                <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.dim, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {k.label}
                </div>
                <div style={{ fontSize: 'clamp(22px, 1.94vw, 31px)', fontWeight: 800, color: k.farbe, marginTop: 8, lineHeight: 1.2 }}>
                  {k.wert}
                </div>
                {k.sub && <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.dim, marginTop: 4 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Diagramme */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
            {/* ABC-Donut */}
            <div style={{ ...karte, flex: '1 1 320px', minWidth: 320 }}>
              <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(16px, 1.38vw, 22px)', fontWeight: 700, marginBottom: 12 }}>
                Kapital nach ABC-Klasse
              </div>
              {abcAgg.length === 0 ? (
                <div style={{ color: C.dim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '40px 0', textAlign: 'center' }}>
                  Noch kein Verbrauch im Zeitraum.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={abcAgg}
                      dataKey="wert"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={95}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {abcAgg.map((d, i) => (
                        <Cell key={i} fill={abcFarbe(d.klasse)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: unknown) => euro(Number(v))}
                      contentStyle={{ background: C.navy, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {/* Legende */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 6 }}>
                {abcAgg.map((d) => (
                  <div key={d.klasse} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: abcFarbe(d.klasse) }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Renner-Balken */}
            <div style={{ ...karte, flex: '1 1 380px', minWidth: 380 }}>
              <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(16px, 1.38vw, 22px)', fontWeight: 700, marginBottom: 12 }}>
                Top nach Verbrauchswert
              </div>
              {topBalken.length === 0 ? (
                <div style={{ color: C.dim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '40px 0', textAlign: 'center' }}>
                  Noch kein Verbrauch im Zeitraum.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topBalken} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} stroke={C.line} />
                    <XAxis type="number" tick={{ fill: C.dim, fontSize: 'clamp(11px, 0.94vw, 15px)' }} stroke={C.line} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fill: C.text, fontSize: 'clamp(12px, 1.06vw, 17px)' }}
                      stroke={C.line}
                    />
                    <Tooltip
                      formatter={(v: unknown) => euro(Number(v))}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ background: C.navy, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text }}
                    />
                    <Bar dataKey="wert" fill={C.gold} radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* KI-Klartext */}
          <div style={{ marginBottom: 20 }}>
            <KiKlartext modul="Sortiment-Analyse" kontext={kiKontext} dunkel akzent={C.gold} />
          </div>

          {/* Detail-Tabelle */}
          <div style={{ ...karte, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Art.-Nr.</th>
                    <th style={th}>Bezeichnung</th>
                    <th style={th}>Kategorie</th>
                    <th style={{ ...th, textAlign: 'center' }}>ABC</th>
                    <th style={{ ...th, textAlign: 'right' }}>Verbrauch</th>
                    <th style={{ ...th, textAlign: 'right' }}>Verbrauchswert</th>
                    <th style={{ ...th, textAlign: 'right' }}>Umschlag</th>
                    <th style={{ ...th, textAlign: 'right' }}>Reichweite</th>
                    <th style={{ ...th, textAlign: 'right' }}>geb. Kapital</th>
                    <th style={{ ...th, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((z) => {
                    const ueber = (z.reichweite_tage ?? 0) > 180;
                    return (
                      <tr key={z.artikel_id}>
                        <td style={{ ...td, color: C.dim }}>{z.artikelnummer ?? '–'}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{z.bezeichnung}</td>
                        <td style={{ ...td, color: C.dim }}>{z.kategorie ?? '–'}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              minWidth: 26,
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 'clamp(12px, 1.06vw, 17px)',
                              fontWeight: 800,
                              color: C.navy,
                              background: abcFarbe(z.abc_klasse),
                            }}
                          >
                            {z.abc_klasse}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          {zahl(z.verbrauch)} <span style={{ color: C.dim, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>{z.einheit}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{euro(z.verbrauchswert)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{z.umschlag === null ? '–' : z.umschlag.toLocaleString('de-DE')}</td>
                        <td style={{ ...td, textAlign: 'right', color: ueber ? C.yellow : C.text }}>
                          {z.reichweite_tage === null ? '–' : zahl(z.reichweite_tage) + ' T'}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{euro(z.lagerwert_gebunden)}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          {z.status === 'LADENHÜTER' ? (
                            <span style={{ color: C.red, fontWeight: 700, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>● Ladenhüter</span>
                          ) : (
                            <span style={{ color: C.green, fontWeight: 700, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>● läuft</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hinweis Preis-Pflege */}
          {zeilen.some((z) => z.preis_pflege === 'VK fehlt') && (
            <div style={{ ...karte, marginTop: 16, borderColor: 'rgba(216,166,87,0.4)', color: C.yellow, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
              Hinweis: Bei einigen Artikeln fehlt der Verkaufspreis — Umsatz und Deckungsbeitrag bleiben
              daher leer. Die mengenbasierten Kennzahlen (ABC, Umschlag, Reichweite, Ladenhüter) sind davon
              nicht betroffen.
            </div>
          )}
        </>
      )}
    </div>
  );
}
