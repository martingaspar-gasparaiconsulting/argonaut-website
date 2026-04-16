'use client'

import Image from 'next/image'
import Link from 'next/link'

export default function Navbar() {
  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      background: 'rgba(255,255,255,0.97)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(201,168,76,0.2)',
      padding: '0 48px',
      height: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>

      {/* LOGO */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <Image
          src="/images/ARGONAUT_HELM_SPARTAN .png"
          alt="ARGONAUT Logo"
          width={48}
          height={48}
          style={{ objectFit: 'contain' }}
        />
        <span style={{
          fontSize: '26px',
          fontWeight: 900,
          color: '#0A1628',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}>
          ARGONAUT
        </span>
      </Link>

      {/* NAV LINKS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {['Leistungen', 'Vorgehen', 'Branchen', 'Über uns'].map((item) => (
          <a
            key={item}
            href={`#${item.toLowerCase().replace(' ', '-')}`}
            style={{
              padding: '10px 22px',
              borderRadius: '999px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#0A1628',
              textDecoration: 'none',
              letterSpacing: '0.03em',
              transition: 'all 0.2s',
              border: '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(201,168,76,0.1)'
              e.currentTarget.style.color = '#C9A84C'
              e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#0A1628'
              e.currentTarget.style.borderColor = 'transparent'
            }}
          >
            {item}
          </a>
        ))}
      </div>

      {/* CTA BUTTON */}
      <a
        href="#kontakt"
        style={{
          background: '#C9A84C',
          color: '#fff',
          fontWeight: 700,
          fontSize: '14px',
          padding: '14px 32px',
          borderRadius: '999px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          textDecoration: 'none',
          display: 'inline-block',
          transition: 'all 0.2s',
          border: '2px solid #C9A84C',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = '#C9A84C'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#C9A84C'
          e.currentTarget.style.color = '#fff'
        }}
      >
        Gespräch anfragen
      </a>

    </nav>
  )
}
