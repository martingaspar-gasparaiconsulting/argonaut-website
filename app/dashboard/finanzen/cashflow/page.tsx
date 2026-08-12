'use client';

// ============================================================
// ARGONAUT OS · Finanzen · Cashflow / Liquiditäts-Vorschau
// Startsaldo + offene Rechnungen (nach Fälligkeit) + Fixkosten →
// wochenweise Liquiditäts-Timeline mit laufendem Saldo + Runway-Warnung.
// Pfad: app/dashboard/finanzen/cashflow/page.tsx
// ============================================================

import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { liquiditaetsVorschau, type OffeneRechnung } from '@/lib/cashflow';
import { NurVoll } from '../../_components/Ansicht';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(255,255,255,0.08)',
};

function eur(n: number): string {
  try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0); }
  catch { return `${Math.round(Number(n) || 0)} €`; }
}
function heuteIso(): string { return new Date().toISOString(); }

type RechnungRoh = { brutto_summe: number; bezahlter_betrag: number; zahlungsstatus: string; faelligkeitsdatum: string | null };

export default function CashflowSeite() {
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offene, setOffene] = useState<OffeneRechnung[]>([]);
  const [startSaldo, setStartSaldo] = useState<number>(0);
  const [fixkosten, setFixkosten] = useState<number>(0);

  // Startsaldo/Fixkosten aus dem Browser merken (bequem, nicht sicherheitskritisch).
  useEffect(() => {
    try {
      const s = Number(window.localStorage.getItem('cashflow_startsaldo'));
      const f = Number(window.localStorage.getItem('cashflow_fixkosten'));
      if (Number.isFinite(s) && s !== 0) setStartSaldo(s);
      if (Number.isFinite(f) && f !== 0) setFixkosten(f);
    } catch { /* egal */ }
  }, []);
  useEffect(() => { try { window.localStorage.setItem('cashflow_startsaldo', String(startSaldo)); } catch { /* egal */ } }, [startSaldo]);
  useEffect(() => { try { window.localStorage.setItem('cashflow_fixkosten', String(fixkosten)); } catch { /* egal */ } }, [fixkosten]);

  useEffect(() => {
    (async () => {
      setLaden(true); setFehler(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      try {
        const { data, error } = await supabase.from('rechnungen')
          .select('brutto_summe,bezahlter_betrag,zahlungsstatus,faelligkeitsdatum');
        if (error) throw error;
        const rows = (data as RechnungRoh[]) || [];
        const off: OffeneRechnung[] = [];
        for (const r of rows) {
          if (r.zahlungsstatus === 'bezahlt' || r.zahlungsstatus === 'storniert') continue;
          const rest = (Number(r.brutto_summe) || 0) - (Number(r.bezahlter_betrag) || 0);
          if (rest <= 0.005) continue;
          off.push({ rest, faelligkeitsdatum: r.faelligkeitsdatum });
        }
        setOffene(off);
      } catch (e) {
        setFehler(e instanceof Error ? e.message : 'Fehler beim Laden.');
      }
      setLaden(false);
    })();
  }, []);

  const v = useMemo(
    () => liquiditaetsVorschau({ startSaldo, offene, fixkostenProMonat: fixkosten, jetztIso: heuteIso(), wochen: 12 }),
    [startSaldo, offene, fixkosten],
  );

  // Chart-Skalierung
  const werte = v.punkte.map((p) => p.saldo).concat([startSaldo, 0]);
  const min = Math.min(...werte), max = Math.max(...werte);
  const spanne = max - min || 1;
  const W = 640, H = 180, pad = 8;
  const n = v.punkte.length;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, n - 1);
  const y = (val: number) => H - pad - ((val - min) / spanne) * (H - pad * 2);
  const linie = v.punkte.map((p, i) => `${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ');
  const nullY = y(0);
  const endFarbe = v.endSaldo >= 0 ? C.green : C.danger;

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <a href="/dashboard/finanzen" style={{ color: C.cyan, textDecoration: 'none', fontSize: 14 }}>← Zurück zu Finanzen</a>
        <h1 style={styles.h1}>💧 Cashflow-Vorschau</h1>
        <p style={styles.sub}>Wie sich deine Liquidität die nächsten 12 Wochen entwickelt — erwartete Zuflüsse aus offenen Rechnungen (nach Fälligkeit) minus deine Fixkosten, ab deinem aktuellen Kontostand.</p>

        {fehler && <div style={styles.err}>⚠️ {fehler}</div>}

        {/* Eingaben */}
        <div style={styles.eingabe}>
          <label style={styles.lab}>Aktueller Kontostand
            <input style={styles.inp} type="number" value={startSaldo || ''} onChange={(e) => setStartSaldo(Number(e.target.value) || 0)} placeholder="z. B. 12000" />
          </label>
          <label style={styles.lab}>Fixkosten pro Monat (Miete, Gehälter, Abos …)
            <input style={styles.inp} type="number" value={fixkosten || ''} onChange={(e) => setFixkosten(Number(e.target.value) || 0)} placeholder="z. B. 8000" />
          </label>
        </div>

        {laden ? <div style={styles.hint}>Lade offene Rechnungen …</div> : (
          <>
            {/* KPIs */}
            <div style={styles.kpis}>
              <Kpi label="Startsaldo" wert={eur(v.startSaldo)} farbe={C.textDim} />
              <Kpi label="Erwartete Zuflüsse (12 Wo.)" wert={eur(v.summeZufluss)} farbe={C.green} unter={v.ueberfaellig > 0 ? `davon ${eur(v.ueberfaellig)} überfällig` : undefined} />
              <Kpi label="Fixkosten (12 Wo.)" wert={eur(v.summeAbfluss)} farbe={C.warn} unter={`${eur(v.fixkostenProWoche)}/Woche`} />
              <Kpi label="Saldo in 12 Wochen" wert={eur(v.endSaldo)} farbe={endFarbe} />
            </div>

            {/* Runway-Warnung */}
            {v.ersteUnterdeckung ? (
              <div style={styles.warnBox}>
                🔴 <b>Unterdeckung ab {new Date(v.ersteUnterdeckung).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</b> —
                dein Saldo rutscht unter 0. Zuflüsse vorziehen (überfällige Rechnungen anmahnen) oder Ausgaben strecken.
              </div>
            ) : (
              <div style={styles.okBox}>🟢 Kein Liquiditätsengpass in den nächsten 12 Wochen — dein Saldo bleibt durchgehend positiv.</div>
            )}

            {/* Timeline-Chart (laufender Saldo) */}
            <div style={styles.card}>
              <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>Laufender Saldo je Woche</div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
                {min < 0 && max > 0 && <line x1={pad} x2={W - pad} y1={nullY} y2={nullY} stroke={C.danger} strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />}
                <polyline points={linie} fill="none" stroke={endFarbe} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                {v.punkte.map((p, i) => (
                  <circle key={i} cx={x(i)} cy={y(p.saldo)} r={p.unterdeckung ? 4 : 3} fill={p.unterdeckung ? C.danger : endFarbe} />
                ))}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: C.textDim, fontSize: 11, marginTop: 4 }}>
                <span>{v.punkte[0]?.label}</span><span>{v.punkte[v.punkte.length - 1]?.label}</span>
              </div>
            </div>

            {/* Wochen-Tabelle — Detail, im Voll-Modus */}
            <NurVoll>
            <div style={styles.card}>
              <div style={styles.zeileKopf}>
                <span>Woche</span><span style={{ textAlign: 'right' }}>Zufluss</span><span style={{ textAlign: 'right' }}>Fixkosten</span><span style={{ textAlign: 'right' }}>Saldo</span>
              </div>
              {v.punkte.map((p, i) => (
                <div key={i} style={{ ...styles.zeile, color: p.unterdeckung ? C.danger : C.text }}>
                  <span>{p.label}</span>
                  <span style={{ textAlign: 'right', color: p.zufluss > 0 ? C.green : C.textDim }}>{p.zufluss > 0 ? '+' + eur(p.zufluss) : '—'}</span>
                  <span style={{ textAlign: 'right', color: C.warn }}>−{eur(p.abfluss)}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{eur(p.saldo)}</span>
                </div>
              ))}
            </div>
            </NurVoll>

            {v.offeneOhneTermin > 0 && (
              <p style={{ color: C.textDim, fontSize: 13, marginTop: 12 }}>
                Hinweis: {eur(v.offeneOhneTermin)} an offenen Rechnungen haben <b>kein Fälligkeitsdatum</b> und sind hier bewusst nicht eingeplant — trag die Fälligkeit nach, dann fließen sie in die Vorschau ein.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, wert, farbe, unter }: { label: string; wert: string; farbe: string; unter?: string }) {
  return (
    <div style={styles.kpi}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: farbe }} />
      <div style={{ color: C.textDim, fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 'clamp(20px,2vw,28px)', color: farbe }}>{wert}</div>
      {unter && <div style={{ color: C.textDim, fontSize: 12, marginTop: 3 }}>{unter}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { background: C.navy, minHeight: '100vh', padding: '28px 24px 64px', color: C.text, fontFamily: "'DM Sans', sans-serif" },
  h1: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(28px,2.5vw,40px)', fontWeight: 800, margin: '10px 0 0' },
  sub: { color: C.textDim, margin: '6px 0 20px', fontSize: 'clamp(14px,1.2vw,19px)', maxWidth: 820, lineHeight: 1.5 },
  eingabe: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 22 },
  lab: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: C.textDim },
  inp: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', fontSize: 16, fontFamily: 'inherit' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 16 },
  warnBox: { background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: '13px 16px', color: C.text, fontSize: 14.5, marginBottom: 18, lineHeight: 1.5 },
  okBox: { background: 'rgba(76,175,125,0.1)', border: `1px solid ${C.green}`, borderRadius: 12, padding: '13px 16px', color: C.text, fontSize: 14.5, marginBottom: 18 },
  zeileKopf: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, padding: '4px 6px 10px', color: C.textDim, fontSize: 12.5, fontWeight: 700, borderBottom: `1px solid ${C.border}` },
  zeile: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, padding: '9px 6px', fontSize: 14, borderBottom: `1px solid ${C.border}` },
  hint: { color: C.textDim, fontSize: 15, padding: '20px 0' },
  err: { background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 14, color: C.danger, marginBottom: 16 },
};
