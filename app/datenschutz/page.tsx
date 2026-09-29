'use client'
import { useState } from 'react'
import Navbar from '../vorschau/_components/Navbar'
import Footer from '../vorschau/_components/Footer'
import { DSE_ABSCHNITTE, DSE_STAND, type DseTeil } from '@/lib/datenschutzInhalt'

// ============================================================================
// ARGONAUT OS · app/datenschutz/page.tsx — Datenschutzerklaerung (dunkles Design)
// Paket 178 (29.09.2026): Inhalt neu gefasst und nach lib/datenschutzInhalt.ts
// ausgelagert — dort wacht ein Test darueber, dass die Erklaerung zum Code passt.
// Diese Seite zeigt nur an.
// ============================================================================

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

function Teil({ teil }: { teil: DseTeil }) {
  if (typeof teil === 'string') return <p className="lp-p">{teil}</p>
  if ('hinweis' in teil) {
    return (
      <div className="lp-note">
        <p style={{ color: '#EAF1F6', fontSize: '.9rem', fontWeight: 600, margin: '0 0 4px' }}>Wichtiger Hinweis</p>
        <p style={{ color: '#b9cdd6', fontSize: '.9rem', lineHeight: 1.7, margin: 0 }}>{teil.hinweis}</p>
      </div>
    )
  }
  return (
    <div style={{ overflowX: 'auto', margin: '6px 0 16px' }}>
      <table className="lp-table">
        <thead><tr>{teil.tabelle.kopf.map((k) => <th key={k}>{k}</th>)}</tr></thead>
        <tbody>
          {teil.tabelle.zeilen.map((zeile, i) => (
            <tr key={i}>
              {zeile.map((zelle, j) => (
                <td key={j} style={j === 0 ? { fontWeight: 600, color: '#EAF1F6' } : undefined}>{zelle}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Datenschutz() {
  const [activeSection, setActiveSection] = useState('')
  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveSection(id) }
  }

  return (
    <>
      <Navbar />
      <main style={{ background: NAVY, minHeight: '100vh', color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300 }}>
        <style>{`
          .lp-h2 { font-family: var(--font-dm-sans), sans-serif; color: #EAF1F6; font-size: 1.35rem; font-weight: 700; margin: 0 0 16px; padding-bottom: 12px; border-bottom: 2px solid ${GOLD}; }
          .lp-p { color: #b9cdd6; font-size: .96rem; line-height: 1.8; margin: 0 0 12px; }
          .lp-card { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.16); border-radius: 12px; padding: 24px 26px; }
          .lp-table { width: 100%; border-collapse: collapse; font-size: .88rem; }
          .lp-table th { padding: 12px 16px; text-align: left; background: rgba(201,168,76,0.12); color: ${GOLD}; font-weight: 700; }
          .lp-table td { padding: 12px 16px; color: #c4d3db; border-bottom: 1px solid rgba(122,163,179,0.12); vertical-align: top; }
          .lp-note { background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.28); border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; }
          .lp-toc button { display: block; width: 100%; text-align: left; padding: 9px 12px; margin-bottom: 3px; border-radius: 8px; border: none; cursor: pointer; font-size: .82rem; background: transparent; color: #c4d3db; transition: all .2s; font-family: inherit; }
          .lp-toc button:hover { background: rgba(122,163,179,0.08); }
          .lp-grid { max-width: 1200px; margin: 0 auto; padding: 60px 24px; display: grid; grid-template-columns: 280px 1fr; gap: 40px; align-items: start; }
          .lp-recht { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.16); border-radius: 10px; padding: 16px 20px; margin-bottom: 8px; }
          @media (max-width: 900px) { .lp-grid { grid-template-columns: 1fr; } .lp-toc { display: none; } }
        `}</style>

        {/* Hero */}
        <div style={{ background: 'radial-gradient(900px 400px at 50% -20%, rgba(201,168,76,0.14), transparent 60%)', padding: '130px 24px 50px' }}>
          <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
            <div style={{ color: GOLD, fontSize: '.75rem', letterSpacing: '.22em', textTransform: 'uppercase', marginBottom: '14px' }}>Rechtliches</div>
            <h1 style={{ color: '#EAF1F6', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, margin: '0 0 14px', fontFamily: 'var(--font-syne), sans-serif' }}>Datenschutzerklärung</h1>
            <p style={{ color: '#8fa9b6', fontSize: '1rem', lineHeight: 1.7, margin: 0 }}>
              ARGONAUT OS — Gaspar AI Consulting, Martin Gaspar, Böblingen<br />
              Stand: {DSE_STAND} · Gemäß DSGVO, BDSG und TDDDG
            </p>
          </div>
        </div>

        <div className="lp-grid">
          {/* Inhaltsverzeichnis */}
          <div className="lp-toc" style={{ position: 'sticky', top: '84px', background: 'rgba(122,163,179,0.05)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(122,163,179,0.16)' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8fa9b6', marginBottom: '14px' }}>Inhaltsverzeichnis</div>
            {DSE_ABSCHNITTE.map((a) => (
              <button key={a.id} onClick={() => scrollTo(a.id)} style={{ background: activeSection === a.id ? 'rgba(201,168,76,0.12)' : 'transparent', color: activeSection === a.id ? GOLD : '#c4d3db', fontWeight: activeSection === a.id ? 600 : 400 }}>
                {a.titel}
              </button>
            ))}
          </div>

          {/* Inhalt */}
          <div className="lp-card" style={{ padding: '40px' }}>
            {DSE_ABSCHNITTE.map((a, i) => (
              <section key={a.id} id={a.id} style={{ marginBottom: i === DSE_ABSCHNITTE.length - 1 ? '10px' : '44px' }}>
                <h2 className="lp-h2">{a.titel}</h2>
                {a.teile.map((t, j) => <Teil key={j} teil={t} />)}
              </section>
            ))}
            <div style={{ background: 'rgba(122,163,179,0.05)', border: '1px solid rgba(122,163,179,0.16)', borderRadius: '10px', padding: '20px', marginTop: '28px' }}>
              <p style={{ color: '#b9cdd6', fontSize: '.88rem', lineHeight: 1.7, margin: 0 }}>
                <strong style={{ color: '#EAF1F6' }}>Anbieter:</strong> Gaspar AI Consulting, Martin Gaspar<br />
                Böblingen, Baden-Württemberg, Deutschland<br />
                E-Mail: info@argonaut-os.com · Web: argonaut-os.com<br />
                <strong style={{ color: '#EAF1F6' }}>Stand:</strong> {DSE_STAND}
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
