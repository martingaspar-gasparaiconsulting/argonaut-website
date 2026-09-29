// Gemeinsame Gestaltung der Zwei-Faktor-Seiten (Paket 164) — wie die Anmeldeseite.
import type { CSSProperties } from 'react';

export const seite: CSSProperties = { minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif', color: '#E8EDF4' };
export const karte: CSSProperties = { width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(143,163,190,0.18)', borderRadius: 18, padding: '32px 28px' };
export const titel: CSSProperties = { fontSize: 22, fontWeight: 800, margin: '0 0 8px' };
export const text: CSSProperties = { fontSize: 14.5, lineHeight: 1.6, color: '#B8C4D6', margin: '0 0 16px' };
export const klein: CSSProperties = { fontSize: 12.5, lineHeight: 1.5, color: '#8FA3BE' };
export const eingabe: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(143,163,190,0.3)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 20, letterSpacing: 4, textAlign: 'center', fontFamily: 'inherit' };
export const knopf: CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', background: '#C9A84C', color: '#0A1628', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12 };
export const knopfRand: CSSProperties = { ...knopf, background: 'transparent', color: '#E8EDF4', border: '1px solid rgba(143,163,190,0.3)' };
export const fehler: CSSProperties = { color: '#E06666', fontSize: 13.5, marginTop: 10 };
export const gut: CSSProperties = { color: '#4CAF7D', fontSize: 13.5, marginTop: 10 };
export const link: CSSProperties = { background: 'none', border: 'none', color: '#00e5ff', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit', textDecoration: 'underline' };
