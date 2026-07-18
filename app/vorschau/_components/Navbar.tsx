'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/Navbar.tsx
// Globale Navigation für die neue Website. Fixiert oben, dunkel/transluzent.
// Menü scrollt zu Abschnitts-Ankern (#module, #preise, #sicherheit, #demo),
// Funktionen/Branchen/Ressourcen -> eigene Seiten, Login -> /auth/login.
// ============================================================================

import { useState } from 'react'

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

const LINKS = [
  { label: 'System', href: '/vorschau#module' },
  { label: 'Preise', href: '/vorschau#preise' },
  { label: 'Branchen', href: '/vorschau/branchen' },
  { label: 'Funktionen', href: '/vorschau/vergleich' },
  { label: 'Ressourcen', href: '/vorschau/ressourcen' },
  { label: 'Sicherheit', href: '/vorschau#sicherheit' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'rgba(10,22,40,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(201,168,76,0.18)' }}>
        <a href="/vorschau" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <span aria-hidden="true">🔱</span>
          <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, letterSpacing: '.16em', color: '#EAF1F6', fontSize: '1rem' }}>ARGONAUT&nbsp;OS</span>
        </a>

        {/* Desktop-Menü */}
        <div className="argnav-desk" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} style={{ color: '#c4d3db', textDecoration: 'none', fontSize: '.9rem', padding: '8px 14px' }}>{l.label}</a>
          ))}
        </div>

        {/* Desktop-Buttons */}
        <div className="argnav-desk" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/auth/login" style={{ color: GOLD, textDecoration: 'none', fontSize: '.9rem', fontWeight: 600, padding: '8px 16px', border: '1px solid rgba(201,168,76,0.5)', borderRadius: '999px' }}>Login</a>
          <a href="/vorschau#demo" style={{ background: GOLD, color: NAVY, textDecoration: 'none', fontSize: '.9rem', fontWeight: 700, padding: '9px 18px', borderRadius: '999px' }}>Demo buchen</a>
        </div>

        {/* Hamburger (mobil) */}
        <button className="argnav-burger" onClick={() => setOpen(!open)} aria-label="Menü öffnen" style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', flexDirection: 'column', gap: '5px', padding: '6px' }}>
          <span style={{ width: '24px', height: '2px', background: '#EAF1F6', display: 'block' }} />
          <span style={{ width: '24px', height: '2px', background: '#EAF1F6', display: 'block' }} />
          <span style={{ width: '24px', height: '2px', background: '#EAF1F6', display: 'block' }} />
        </button>
      </nav>

      {/* Mobiles Menü */}
      {open && (
        <div className="argnav-mob" style={{ position: 'fixed', top: '64px', left: 0, right: 0, zIndex: 999, background: NAVY, borderBottom: '1px solid rgba(201,168,76,0.2)', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} onClick={() => setOpen(false)} style={{ color: '#EAF1F6', textDecoration: 'none', padding: '11px 0', borderBottom: '1px solid rgba(122,163,179,0.12)' }}>{l.label}</a>
          ))}
          <a href="/auth/login" onClick={() => setOpen(false)} style={{ color: GOLD, textDecoration: 'none', padding: '12px 0', fontWeight: 600 }}>Login</a>
          <a href="/vorschau#demo" onClick={() => setOpen(false)} style={{ background: GOLD, color: NAVY, textAlign: 'center', padding: '12px', borderRadius: '10px', textDecoration: 'none', fontWeight: 700, marginTop: '4px' }}>Demo buchen</a>
        </div>
      )}

      <style>{`
        @media (max-width: 820px) {
          .argnav-desk { display: none !important; }
          .argnav-burger { display: flex !important; }
        }
      `}</style>
    </>
  )
}
