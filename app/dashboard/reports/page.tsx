'use client';

// ============================================================
// ARGONAUT OS · Report-Baukasten (Punkt 10a)
// Self-Service-Auswertung: Quelle + Kennzahl + Gruppierung + Zeitraum wählen,
// ARGONAUT rechnet und zeigt Tabelle + Anteile. CSV-Export inklusive.
// Logik aus lib/reportBaukasten (0 €, node-getestet). Liest owner-RLS-Tabellen.
// Pfad: app/dashboard/reports/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../_components/Leerzustand';
import { QUELLEN, quelle, zahlFelder, textFelder, baueReport, formatWert, reportCsv, type ReportErgebnis } from '@/lib/reportBaukasten';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

function heutePlus(tage: number) { const d = new Date(); d.setDate(d.getDate() + tage); return d.toISOString().slice(0, 10); }

export default function ReportsSeite() {
  const [quelleKey, setQuelleKey] = useState('rechnungen');
  const [metrik, setMetrik] = useState<'anzahl' | 'summe'>('summe');
  const [summeFeld, setSummeFeld] = useState('brutto_summe');
  const [gruppeFeld, setGruppeFeld] = useState('zahlungsstatus');
  const [von, setVon] = useState(heutePlus(-90));
  const [bis, setBis] = useState(heutePlus(0));
  const [erg, setErg] = useState<ReportErgebnis | null>(null);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const q = quelle(quelleKey);

  // Beim Quellenwechsel gültige Feld-Defaults setzen.
  function quelleWechseln(key: string) {
    const nq = quelle(key);
    setQuelleKey(key);
    setSummeFeld(zahlFelder(nq)[0]?.key ?? '');
    setGruppeFeld(textFelder(nq)[0]?.key ?? '');
    setErg(null);
  }

  const auswerten = useCallback(async () => {
    const qq = quelle(quelleKey);
    if (!qq) return;
    setLaden(true); setFehler(null);
    try {
      const felder = Array.from(new Set([qq.datumFeld, ...qq.felder.map((f) => f.key)]));
      let query = supabase.from(qq.table).select(felder.join(', '));
      if (von) query = query.gte(qq.datumFeld, von);
      if (bis) query = query.lte(qq.datumFeld, bis + 'T23:59:59');
      const { data, error } = await query.limit(5000);
      if (error) throw error;
      const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
      setErg(baueReport(rows, { metrik, summeFeld: metrik === 'summe' ? summeFeld : null, gruppeFeld: gruppeFeld || null }));
    } catch (e) {
      setFehler('Auswertung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
      setErg(null);
    } finally { setLaden(false); }
  }, [quelleKey, metrik, summeFeld, gruppeFeld, von, bis]);

  useEffect(() => { void auswerten(); /* Erstauswertung mit Defaults */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gruppeLabel = q?.felder.find((f) => f.key === gruppeFeld)?.label ?? 'Gesamt';
  const metrikLabel = metrik === 'anzahl' ? 'Anzahl' : `Summe ${q?.felder.find((f) => f.key === summeFeld)?.label ?? ''}`.trim();

  function csvLaden() {
    if (!erg) return;
    const csv = reportCsv(erg, gruppeLabel, metrikLabel);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report-${quelleKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Auswertungen</div>
      <h1 style={styles.h1}>🧮 Report-Baukasten</h1>
      <p style={styles.sub}>Bau dir deine eigene Auswertung: Quelle, Kennzahl, Gruppierung und Zeitraum wählen — ARGONAUT rechnet sofort und du kannst als CSV exportieren.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={styles.grid}>
          <label style={styles.lab}>Quelle
            <select style={styles.inp} value={quelleKey} onChange={(e) => quelleWechseln(e.target.value)}>
              {QUELLEN.map((x) => <option key={x.key} value={x.key}>{x.icon} {x.name}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Kennzahl
            <select style={styles.inp} value={metrik} onChange={(e) => setMetrik(e.target.value as 'anzahl' | 'summe')}>
              <option value="anzahl">Anzahl</option>
              <option value="summe">Summe von …</option>
            </select>
          </label>
          {metrik === 'summe' && (
            <label style={styles.lab}>Summen-Feld
              <select style={styles.inp} value={summeFeld} onChange={(e) => setSummeFeld(e.target.value)}>
                {zahlFelder(q).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
          )}
          <label style={styles.lab}>Gruppieren nach
            <select style={styles.inp} value={gruppeFeld} onChange={(e) => setGruppeFeld(e.target.value)}>
              <option value="">— ohne (Gesamt) —</option>
              {textFelder(q).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Von<input type="date" style={styles.inp} value={von} onChange={(e) => setVon(e.target.value)} /></label>
          <label style={styles.lab}>Bis<input type="date" style={styles.inp} value={bis} onChange={(e) => setBis(e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button style={styles.primaer} disabled={laden} onClick={() => auswerten()}>{laden ? 'Rechnet …' : '📊 Auswerten'}</button>
          {erg && erg.zeilen.length > 0 && <button style={styles.ghost} onClick={csvLaden}>⬇ CSV</button>}
        </div>
      </div>

      {erg && (
        erg.zeilen.length === 0 ? (
          <Leerzustand icon="🧮" titel="Keine Daten im Zeitraum" text="Für diese Quelle und diesen Zeitraum gibt es nichts auszuwerten. Wähle einen anderen Zeitraum oder eine andere Quelle." />
        ) : (
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={styles.gesamtZeile}>
              <span style={styles.gesamtLabel}>{metrikLabel}{gruppeFeld ? ` · nach ${gruppeLabel}` : ''}</span>
              <span style={styles.gesamtWert}>{formatWert(erg.gesamt, erg.istGeld)}</span>
            </div>
            <table style={styles.tab}>
              <thead><tr><th style={styles.th}>{gruppeLabel}</th><th style={{ ...styles.th, textAlign: 'right' }}>{metrikLabel}</th><th style={{ ...styles.th, width: '38%' }}>Anteil</th></tr></thead>
              <tbody>
                {erg.zeilen.map((z, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={styles.td}>{z.gruppe}</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{formatWert(z.wert, erg.istGeld)}</td>
                    <td style={styles.td}>
                      <div style={styles.balken}><div style={{ ...styles.balkenFill, width: `${z.anteil}%` }} /></div>
                      <span style={{ color: C.textDim, fontSize: 12 }}>{z.anteil} %</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 1000, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 18px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(13.5px, 1.2vw, 18px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  gesamtZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 12, marginBottom: 8, flexWrap: 'wrap' },
  gesamtLabel: { color: C.textDim, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' },
  gesamtWert: { fontSize: 28, fontWeight: 800, color: C.gold },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', color: C.textDim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 10px', fontWeight: 700 },
  td: { padding: '10px', verticalAlign: 'middle' },
  balken: { height: 8, borderRadius: 4, background: C.navy, border: `1px solid ${C.border}`, overflow: 'hidden', display: 'inline-block', width: 'calc(100% - 48px)', marginRight: 8, verticalAlign: 'middle' },
  balkenFill: { height: '100%', background: C.gold },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
