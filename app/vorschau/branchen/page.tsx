import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '../_components/Navbar'
import { websiteKategorien, websiteBranchen } from '../_lib/branchen-web'

// ============================================================================
// ARGONAUT OS · app/vorschau/branchen/page.tsx — Branchen-Übersicht (neu)
// Liest die gefilterte Branchenliste (ohne regulierte Branchen) und zeigt sie
// nach Kategorien. Jede Branche verlinkt auf ihre Detailseite.
// robots: noindex (Vorschau). Route liegt nicht im proxy-Matcher -> erreichbar.
// ============================================================================

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

export const metadata: Metadata = {
  title: 'ARGONAUT — Für Ihre Branche gemacht',
  description: 'ARGONAUT ist für über 180 Branchen vorkonfiguriert — vom Handwerk bis zur Industrie.',
  robots: { index: false, follow: false },
}

export default function BranchenPage() {
  const kategorien = websiteKategorien()
  const total = websiteBranchen().length

  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <style>{`
        .bw-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
        .bw-h1 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(2.2rem, 5.4vw, 3.6rem); line-height: 1.08; padding-bottom: 2px; margin: 0 0 1rem; }
        .bw-kat { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: 1.15rem; color: #EAF1F6; margin: 0 0 14px; display: flex; align-items: center; gap: 10px; }
        .bw-kat::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: ${GOLD}; display: inline-block; }
        .bw-chips { display: flex; flex-wrap: wrap; gap: 10px; }
        .bw-chip { background: rgba(122,163,179,0.06); border: 1px solid rgba(122,163,179,0.16); border-radius: 999px; padding: 9px 16px; font-size: .9rem; color: #c4d3db; text-decoration: none; transition: border-color .2s, color .2s, background .2s; }
        .bw-chip:hover { border-color: rgba(201,168,76,0.5); color: #EAF1F6; background: rgba(201,168,76,0.08); }
      `}</style>

      <Navbar />

      {/* Hero */}
      <section style={{ padding: '130px 0 30px', textAlign: 'center', background: 'radial-gradient(1000px 500px at 50% -8%, rgba(201,168,76,0.12), transparent 60%)' }}>
        <div className="bw-wrap">
          <div style={{ color: GOLD, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: '.8rem', marginBottom: '1.4rem' }}>🔱 Branchen</div>
          <h1 className="bw-h1">Für Ihre Branche <span style={{ color: GOLD }}>gemacht</span>.</h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.2rem)', color: '#b9cdd6', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.6 }}>
            ARGONAUT kommt für <strong style={{ color: '#EAF1F6' }}>{total}+ Branchen</strong> vorkonfiguriert — mit den richtigen Abläufen für Ihren Betrieb, statt als leere Hülle. Wählen Sie Ihre Branche:
          </p>
        </div>
      </section>

      {/* Kategorien */}
      <div className="bw-wrap" style={{ paddingBottom: '40px' }}>
        {kategorien.map((k) => (
          <section key={k.kategorie} style={{ padding: '26px 0', borderTop: '1px solid rgba(122,163,179,0.1)' }}>
            <h2 className="bw-kat">{k.kategorie} <span style={{ color: '#6f8794', fontWeight: 400, fontSize: '.85rem' }}>({k.branchen.length})</span></h2>
            <div className="bw-chips">
              {k.branchen.map((b) => (
                <Link key={b.slug} href={`/vorschau/branchen/${b.slug}`} className="bw-chip">{b.name}</Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Abschluss */}
      <section style={{ padding: '30px 0 90px', textAlign: 'center' }}>
        <div className="bw-wrap">
          <p style={{ fontSize: 'clamp(1.1rem, 2vw, 1.3rem)', color: '#EAF1F6', margin: '0 0 20px' }}>
            Ihre Branche nicht dabei? ARGONAUT passt sich an — fragen Sie einfach.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/vorschau#demo" style={{ background: GOLD, color: NAVY, fontWeight: 600, padding: '14px 30px', borderRadius: '10px', textDecoration: 'none' }}>Demo buchen →</a>
            <Link href="/vorschau" style={{ background: 'transparent', color: '#EAF1F6', fontWeight: 500, padding: '14px 26px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(234,241,246,0.22)' }}>← Zur Startseite</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
