'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer style={{ background: '#fff', borderTop: '1px solid #e5e7eb' }}>

      {/* Haupt-Footer */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 48px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '48px' }}>

          {/* Spalte 1 — Logo & Beschreibung */}
          <div>
            <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Image src="/images/ARGONAUT_HELM_SPARTAN .png" alt="ARGONAUT" width={36} height={36} style={{ objectFit: 'contain' }} />
              <span style={{ fontSize: '18px', fontWeight: 900, color: '#0A1628', letterSpacing: '0.15em' }}>ARGONAUT</span>
            </Link>
            <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.7, marginBottom: '20px', maxWidth: '220px' }}>
              KI-Automatisierung für den Mittelstand in D/A/CH.
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.7 }}>
              Martin Gaspar<br />
              71132 Böblingen<br />
              Stuttgart · Sindelfingen · Leonberg
            </p>
          </div>

          {/* Spalte 2 — Leistungen */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#0A1628', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '20px' }}>
              Leistungen
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {['KI-Prozessautomatisierung', 'Intelligente Assistenten', 'Datenanalyse & Reporting', 'KI-Strategie & Beratung', 'WhatsApp-Automatisierung', 'Lead-Automatisierung'].map((item) => (
                <a key={item} href="#leistungen"
                  style={{ fontSize: '14px', color: '#6b7280', textDecoration: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#C9A84C'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                >{item}</a>
              ))}
            </div>
          </div>

          {/* Spalte 3 — Branchen */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#0A1628', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '20px' }}>
              Branchen
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {['Handwerk & Bau', 'Industrie & Produktion', 'Logistik & Transport', 'Handel & E-Commerce', 'IT & Technologie'].map((item) => (
                <a key={item} href="#branchen"
                  style={{ fontSize: '14px', color: '#6b7280', textDecoration: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#C9A84C'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                >{item}</a>
              ))}
              <Link href="/branchen"
                style={{ fontSize: '14px', color: '#C9A84C', textDecoration: 'none', fontWeight: 700 }}
              >Alle 110 Branchen →</Link>
            </div>
          </div>

          {/* Spalte 4 — Info & Rechtliches */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#0A1628', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '20px' }}>
              Info
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
              {[{ label: 'Über uns', href: '#' }, { label: 'Vorgehen', href: '#vorgehen' }, { label: 'Kontakt', href: '#kontakt' }].map((item) => (
                <a key={item.label} href={item.href}
                  style={{ fontSize: '14px', color: '#6b7280', textDecoration: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#C9A84C'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                >{item.label}</a>
              ))}
            </div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#0A1628', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '20px' }}>
              Rechtliches
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Link href="/impressum" style={{ fontSize: '14px', color: '#6b7280', textDecoration: 'none' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#C9A84C'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
              >Impressum</Link>
              <Link href="/datenschutz" style={{ fontSize: '14px', color: '#6b7280', textDecoration: 'none' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#C9A84C'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
              >Datenschutz</Link>
              <a href="#" style={{ fontSize: '14px', color: '#6b7280', textDecoration: 'none' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#C9A84C'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
              >AGB</a>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Bar */}
      <div style={{ borderTop: '1px solid #e5e7eb', padding: '20px 48px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
            © 2025 ARGONAUT · Martin Gaspar · 71132 Böblingen
          </p>
          <div style={{ display: 'flex', gap: '24px' }}>
            <a href="mailto:martin@gasparaiconsulting.cloud"
              style={{ fontSize: '13px', color: '#9ca3af', textDecoration: 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#C9A84C'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
            >E-Mail</a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '13px', color: '#9ca3af', textDecoration: 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#C9A84C'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
            >LinkedIn</a>
          </div>
        </div>
      </div>

    </footer>
  )
}
