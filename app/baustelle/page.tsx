import type { Metadata } from 'next'

// ============================================================================
// ARGONAUT OS · app/baustelle/page.tsx — Baustellen-/Wartungsseite
//
// Das proxy.ts schreibt alle Marketing-Routen intern auf DIESE Seite um
// (Rewrite -> URL bleibt stehen, kein Redirect). /impressum, /datenschutz,
// /dashboard, /admin, /auth, /api bleiben davon unberuehrt und erreichbar.
//
// robots: noindex/nofollow -> Google indexiert die Baustelle nicht.
// Selbst-tragende Inline-Styles (kein globals-Class-Bezug) -> laeuft auch,
// wenn spaeter am Design geschraubt wird.
// ============================================================================

export const metadata: Metadata = {
  title: 'ARGONAUT OS — In Kürze für Sie da',
  description:
    'Unsere neue Website ist im Aufbau. In Kürze sind wir hier für Sie da.',
  robots: { index: false, follow: false },
}

export default function BaustellePage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem 1.5rem',
        background:
          'radial-gradient(1100px 560px at 50% -8%, rgba(201,168,76,0.10), transparent 62%), #0A1628',
        color: '#EAF1F6',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
      }}
    >
      <style>{`
        @keyframes argShimmer { 0%,100%{opacity:.5} 50%{opacity:1} }
        .arg-divider { animation: argShimmer 3.4s ease-in-out infinite; }
        .arg-wordmark { letter-spacing: .28em; }
        @media (max-width: 560px){ .arg-wordmark{ letter-spacing:.16em } }
      `}</style>

      <div
        aria-hidden="true"
        style={{ fontSize: 'clamp(2.4rem, 6vw, 3.6rem)', lineHeight: 1, marginBottom: '1.4rem' }}
      >
        🔱
      </div>

      <div
        className="arg-wordmark"
        style={{
          fontWeight: 600,
          fontSize: 'clamp(0.95rem, 2.2vw, 1.15rem)',
          textTransform: 'uppercase',
          color: '#c9a84c',
          marginBottom: '2.2rem',
        }}
      >
        ARGONAUT&nbsp;OS
      </div>

      <h1
        style={{
          fontWeight: 600,
          fontSize: 'clamp(1.9rem, 5vw, 3.1rem)',
          lineHeight: 1.12,
          margin: '0 0 1.2rem',
          maxWidth: '18ch',
        }}
      >
        Wir bauen gerade etwas&nbsp;Großes.
      </h1>

      <div
        className="arg-divider"
        style={{
          width: '64px',
          height: '2px',
          borderRadius: '2px',
          background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
          margin: '0.4rem 0 1.6rem',
        }}
      />

      <p
        style={{
          fontSize: 'clamp(1rem, 2.4vw, 1.2rem)',
          lineHeight: 1.6,
          color: '#7aa3b3',
          margin: 0,
          maxWidth: '46ch',
        }}
      >
        Das KI-Betriebssystem für den deutschen Mittelstand. Unsere neue Website
        ist in den letzten Zügen — in Kürze sind wir hier für Sie da.
      </p>

      <div
        style={{
          marginTop: '3rem',
          display: 'flex',
          gap: '1.6rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontSize: '0.9rem',
        }}
      >
        <a href="mailto:martingaspar@gasparaiconsulting.de" style={{ color: '#c9a84c', textDecoration: 'none' }}>
          Kontakt
        </a>
        <a href="/impressum" style={{ color: '#7aa3b3', textDecoration: 'none' }}>
          Impressum
        </a>
        <a href="/datenschutz" style={{ color: '#7aa3b3', textDecoration: 'none' }}>
          Datenschutz
        </a>
      </div>
    </main>
  )
}
