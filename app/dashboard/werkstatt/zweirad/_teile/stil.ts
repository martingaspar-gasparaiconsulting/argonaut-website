// ARGONAUT OS · Paket 295 · gemeinsame Farben und Stile der Zweirad-Seiten
import type { CSSProperties } from 'react';
import type { Ampel } from '@/lib/zweirad';

export const C = { navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };
export const AMPEL_FARBE: Record<Ampel, string> = { ueber: C.bad, bald: C.warn, ok: C.ok, keine: C.dim };

export const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1200, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '10px 0 6px' },
  h2: { fontSize: 17, margin: '18px 0 6px', color: C.gold },
  dim: { color: C.dim, fontSize: 14, lineHeight: 1.55, margin: '4px 0 10px' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '6px 0 14px' },
  kachel: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 2 },
  zahl: { fontSize: 22, fontWeight: 800 },
  box: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', margin: '12px 0' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 8 },
  feld: { display: 'grid', gap: 4, fontSize: 13.5, color: C.dim },
  eingabe: { background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  tab: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 20, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600 },
  tabAn: { background: 'rgba(201,168,76,0.15)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 20, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700 },
  link: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 13, textDecoration: 'none' },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginTop: 10 },
  th: { textAlign: 'left', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '7px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  marke: { display: 'inline-block', fontSize: 11.5, fontWeight: 700, borderRadius: 10, padding: '2px 8px', border: `1px solid ${C.border}`, color: C.dim },
};
