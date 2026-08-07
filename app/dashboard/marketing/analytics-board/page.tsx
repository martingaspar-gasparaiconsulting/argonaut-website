'use client';

import { useEffect, useState } from 'react';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · Analytics-Board (Punkt 4)
// Ein Blick, alle Marketing-Zahlen — visuell: KPIs, Lead-Funnel,
// Zeit-Trend (Leads je Woche), Regions-Verteilung (geschätzt aus PLZ),
// Quellen-Verteilung, Ads-Effizienz. Ehrliche Skalen, direkte Labels,
// eine Achse. Look = Kunden-Dashboard (Navy/Gold/Cyan) — Kunde UND Betreiber.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

type Kpis = { leadsGesamt: number; dieseWoche: number; vorWoche: number; trendProzent: number | null; ausKampagne: number };
type FunnelStufe = { status: string; label: string; anzahl: number; anteil: number };
type ZeitPunkt = { start: string; label: string; anzahl: number; istAktuell: boolean };
type QuelleAnteil = { quelle: string; anzahl: number; anteil: number };
type Region = { land: string; anzahl: number; anteil: number };
type Ads = { ausgaben: number; umsatz: number; klicks: number; conversions: number; roas: number | null; cpl: number | null };
type Daten = {
  ok: boolean; error?: string;
  kpis: Kpis; funnel: FunnelStufe[]; zeitReihe: ZeitPunkt[];
  quellen: QuelleAnteil[]; ads: Ads; regionen: Region[]; regionMitPlz: number;
};

function euro(n: number): string {
  return (n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

export default function AnalyticsBoardPage() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/marketing/analytics-board');
        if (res.status === 401 || res.status === 403) { setFehler('Bitte einloggen.'); setLaden(false); return; }
        const j = (await res.json()) as Daten;
        if (!j.ok) { setFehler(j.error || 'Das Board konnte nicht geladen werden.'); setLaden(false); return; }
        setDaten(j);
      } catch { setFehler('Das Board konnte nicht geladen werden.'); } finally { setLaden(false); }
    })();
  }, []);

  const keineLeads = daten && daten.kpis.leadsGesamt === 0;

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 800, margin: 0 }}>
        📊 Analytics-Board
      </h1>
      <p style={{ color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 22px', maxWidth: 780 }}>
        Alle Marketing-Zahlen auf einen Blick — visuell aufbereitet: wie sich deine Anfragen entwickeln, in welcher Phase sie stecken, woher sie kommen, aus welcher Region, und was deine Werbung bringt.
      </p>

      {fehler && <div style={{ color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>{fehler}</div>}
      {laden ? <p style={{ color: C.textDim }}>Zahlen werden geladen …</p> : daten && (
        <>
          {/* KPI-Kacheln */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
            <KpiTile label="Leads gesamt" wert={String(daten.kpis.leadsGesamt)} farbe={C.cyan} />
            <KpiTile label="Diese Woche" wert={String(daten.kpis.dieseWoche)} farbe={C.gold} trend={daten.kpis.trendProzent} />
            <KpiTile label="Aus Kampagne" wert={String(daten.kpis.ausKampagne)} farbe={C.text} />
            <KpiTile label="Werbe-ROAS" wert={daten.ads.roas != null ? `${daten.ads.roas.toLocaleString('de-DE')}×` : '—'} farbe={daten.ads.roas != null && daten.ads.roas >= 1 ? C.green : C.textDim} />
          </div>

          {keineLeads && (
            <div style={{ background: C.navy2, border: `1px dashed ${C.border}`, borderRadius: 14, padding: 22, color: C.textDim, fontSize: 14, marginBottom: 24 }}>
              Noch keine Anfragen erfasst. Sobald über deine Website, Kampagnen oder Kanäle Leads eingehen, füllt sich das Board automatisch mit Funnel, Trend, Regionen und Quellen.
            </div>
          )}

          {/* Zeit-Trend */}
          <Sektion titel="Anfragen je Woche" hinweis="gleitendes 8-Wochen-Fenster">
            <SaeulenTrend punkte={daten.zeitReihe} />
          </Sektion>

          {/* Lead-Funnel */}
          <Sektion titel="Lead-Funnel" hinweis="Anfragen nach Phase">
            {daten.funnel.length === 0 ? <Leer /> : (
              <div style={{ display: 'grid', gap: 10 }}>
                {daten.funnel.map((f) => (
                  <BalkenZeile key={f.status} label={f.label} anzahl={f.anzahl}
                    anteil={f.anteil} maxAnteil={100} farbe={C.gold}
                    zusatz={`${f.anteil}%`} />
                ))}
              </div>
            )}
          </Sektion>

          {/* Region */}
          <Sektion titel="Anfragen nach Region" hinweis="geschätzt aus der PLZ">
            {daten.regionen.length === 0 ? (
              <div style={{ color: C.textDim, fontSize: 13.5 }}>Noch keine Anfragen mit Postleitzahl. Neue Anfragen über das Website-Formular liefern die Region automatisch.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {daten.regionen.map((r) => (
                  <BalkenZeile key={r.land} label={r.land} anzahl={r.anzahl}
                    anteil={r.anteil} maxAnteil={100} farbe={C.gold} heat />
                ))}
                <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>
                  Basis: {daten.regionMitPlz} Anfrage{daten.regionMitPlz === 1 ? '' : 'n'} mit PLZ. Region über die PLZ-Leitregion geschätzt.
                </div>
              </div>
            )}
          </Sektion>

          {/* Quellen */}
          <Sektion titel="Woher die Anfragen kommen" hinweis="nach Quelle">
            {daten.quellen.length === 0 ? <Leer /> : (
              <div style={{ display: 'grid', gap: 10 }}>
                {daten.quellen.map((q) => {
                  const max = Math.max(...daten.quellen.map((x) => x.anzahl), 1);
                  return (
                    <BalkenZeile key={q.quelle} label={q.quelle} anzahl={q.anzahl}
                      anteil={Math.round((q.anzahl / max) * 100)} maxAnteil={100} farbe={C.cyan}
                      zusatz={`${q.anteil}%`} />
                  );
                })}
              </div>
            )}
          </Sektion>

          {/* Ads-Effizienz */}
          <Sektion titel="Werbung: Ausgaben, Umsatz & Effizienz" hinweis="alle Kampagnen zusammen">
            {daten.ads.ausgaben === 0 && daten.ads.umsatz === 0 ? (
              <div style={{ color: C.textDim, fontSize: 13.5 }}>Noch keine Werbe-Ergebnisse erfasst. Sobald Kampagnen laufen und Ergebnisse eingetragen sind, erscheinen hier Ausgaben, Umsatz und ROAS.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                  {(() => {
                    const max = Math.max(daten.ads.ausgaben, daten.ads.umsatz, 1);
                    return (
                      <>
                        <BalkenZeile label="Ausgaben" anzahl={daten.ads.ausgaben} wertText={euro(daten.ads.ausgaben)} anteil={Math.round((daten.ads.ausgaben / max) * 100)} maxAnteil={100} farbe={C.warn} />
                        <BalkenZeile label="Umsatz" anzahl={daten.ads.umsatz} wertText={euro(daten.ads.umsatz)} anteil={Math.round((daten.ads.umsatz / max) * 100)} maxAnteil={100} farbe={C.green} />
                      </>
                    );
                  })()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  <KpiTile label="ROAS (Umsatz je 1 €)" wert={daten.ads.roas != null ? `${daten.ads.roas.toLocaleString('de-DE')}×` : '—'} farbe={daten.ads.roas != null && daten.ads.roas >= 1 ? C.green : C.danger} klein />
                  <KpiTile label="Kosten je Anfrage (CPL)" wert={daten.ads.cpl != null ? euro(daten.ads.cpl) : '—'} farbe={C.text} klein />
                  <KpiTile label="Klicks" wert={daten.ads.klicks.toLocaleString('de-DE')} farbe={C.cyan} klein />
                </div>
              </>
            )}
          </Sektion>
        </>
      )}
    </div>
  );
}

// ---------------- Bausteine ----------------

function KpiTile({ label, wert, farbe, trend, klein }: { label: string; wert: string; farbe: string; trend?: number | null; klein?: boolean }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: klein ? '14px 16px' : '18px 20px' }}>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: klein ? 22 : 30, color: farbe, lineHeight: 1.1 }}>{wert}</div>
      <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>{label}</div>
      {trend !== undefined && (
        <div style={{ fontSize: 12.5, marginTop: 4, color: trend == null ? C.textDim : trend > 0 ? C.green : trend < 0 ? C.danger : C.textDim }}>
          {trend == null ? 'neu — kein Vergleich' : `${trend > 0 ? '▲ +' : trend < 0 ? '▼ ' : '± '}${trend}% ggü. Vorwoche`}
        </div>
      )}
    </div>
  );
}

function Sektion({ titel, hinweis, children }: { titel: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16 }}>{titel}</div>
        {hinweis && <div style={{ color: C.textDim, fontSize: 12.5 }}>· {hinweis}</div>}
      </div>
      {children}
    </div>
  );
}

function Leer() {
  return <div style={{ color: C.textDim, fontSize: 13.5 }}>Noch keine Daten in diesem Bereich.</div>;
}

/** Horizontaler Balken mit direktem Label + Wert. anteil 0–100 = Breite. */
function BalkenZeile({ label, anzahl, anteil, maxAnteil, farbe, zusatz, wertText, heat }: {
  label: string; anzahl: number; anteil: number; maxAnteil: number; farbe: string;
  zusatz?: string; wertText?: string; heat?: boolean;
}) {
  const breite = Math.max(2, Math.round((anteil / (maxAnteil || 100)) * 100));
  // „Heat": Deckkraft steigt mit dem Anteil (Palette bleibt gleich).
  const deck = heat ? 0.4 + (anteil / 100) * 0.6 : 1;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 13.5, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</div>
      <div style={{ background: 'rgba(143,163,190,0.10)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
        <div style={{ width: `${breite}%`, height: '100%', background: farbe, opacity: deck, borderRadius: 6, minWidth: 3, transition: 'width .3s' }} />
      </div>
      <div style={{ fontSize: 13.5, color: C.text, fontWeight: 700, minWidth: 44, textAlign: 'right' }}>
        {wertText ?? anzahl}{zusatz ? <span style={{ color: C.textDim, fontWeight: 400, fontSize: 12 }}> · {zusatz}</span> : null}
      </div>
    </div>
  );
}

/** Säulen-Trend: eine €-freie Zählachse, aktuelle Woche in Gold, Rest Cyan. */
function SaeulenTrend({ punkte }: { punkte: ZeitPunkt[] }) {
  const max = Math.max(...punkte.map((p) => p.anzahl), 1);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${punkte.length}, 1fr)`, gap: 8, alignItems: 'end', height: 150 }}>
        {punkte.map((p) => {
          const h = Math.round((p.anzahl / max) * 120);
          return (
            <div key={p.start} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${p.label} — ${p.anzahl} Anfragen`}>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 700, marginBottom: 4 }}>{p.anzahl}</div>
              <div style={{ width: '78%', maxWidth: 46, height: Math.max(3, h), background: p.istAktuell ? C.gold : C.cyan, borderRadius: '5px 5px 0 0', opacity: p.anzahl === 0 ? 0.3 : 1 }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${punkte.length}, 1fr)`, gap: 8, marginTop: 6 }}>
        {punkte.map((p) => (
          <div key={p.start} style={{ fontSize: 11, color: p.istAktuell ? C.gold : C.textDim, textAlign: 'center', fontWeight: p.istAktuell ? 700 : 400 }}>{p.label}</div>
        ))}
      </div>
    </div>
  );
}
