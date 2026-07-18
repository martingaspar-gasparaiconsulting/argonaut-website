// ============================================================================
// ARGONAUT OS · app/vorschau/_components/Footer.tsx
// Globaler dunkler Footer im neuen Design. Enthält die rechtlichen Pflicht-Links
// (Impressum · Datenschutz · AGB) + Navigation + Kontakt.
// ============================================================================

import Link from 'next/link'

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

const spalten: { titel: string; links: { label: string; href: string }[] }[] = [
  {
    titel: 'Produkt',
    links: [
      { label: 'System', href: '/vorschau#module' },
      { label: 'Preise', href: '/vorschau#preise' },
      { label: 'Branchen', href: '/vorschau/branchen' },
      { label: 'Funktionen', href: '/vorschau/vergleich' },
      { label: 'Roadmap', href: '/vorschau/roadmap' },
      { label: 'Sicherheit', href: '/vorschau#sicherheit' },
    ],
  },
  {
    titel: 'Rechtliches',
    links: [
      { label: 'Impressum', href: '/impressum' },
      { label: 'Datenschutz', href: '/datenschutz' },
      { label: 'AGB', href: '/agb' },
    ],
  },
  {
    titel: 'Kontakt',
    links: [
      { label: 'Demo buchen', href: '/vorschau#demo' },
      { label: 'info@argonaut-os.com', href: 'mailto:info@argonaut-os.com' },
      { label: 'Login', href: '/auth/login' },
    ],
  },
]

export default function Footer() {
  return (
    <footer style={{ background: '#08111f', borderTop: '1px solid rgba(201,168,76,0.18)', color: '#c4d3db', padding: '56px 24px 32px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '40px', justifyContent: 'space-between' }}>
          {/* Marke */}
          <div style={{ maxWidth: '300px' }}>
            <Link href="/vorschau" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
              <span aria-hidden="true">🔱</span>
              <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, letterSpacing: '.16em', color: '#EAF1F6', fontSize: '1rem' }}>ARGONAUT&nbsp;OS</span>
            </Link>
            <p style={{ margin: '16px 0 0', fontSize: '.9rem', lineHeight: 1.6, color: '#8fa9b6' }}>
              Ein System statt zwölf — das KI-Betriebssystem für den deutschen Mittelstand.
            </p>
          </div>

          {/* Spalten */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px' }}>
            {spalten.map((s) => (
              <div key={s.titel}>
                <div style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: GOLD, marginBottom: '14px' }}>{s.titel}</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {s.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} style={{ color: '#c4d3db', textDecoration: 'none', fontSize: '.9rem' }}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: '44px', paddingTop: '22px', borderTop: '1px solid rgba(122,163,179,0.14)', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', fontSize: '.82rem', color: '#7f97a4' }}>
          <span>© 2026 Gaspar AI Consulting · Martin Gaspar · Böblingen</span>
          <span>Deutscher Server · DSGVO-konform</span>
        </div>
      </div>
    </footer>
  )
}
