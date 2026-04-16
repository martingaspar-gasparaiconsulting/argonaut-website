'use client'

import { useState } from 'react'
import Link from 'next/link'

const branchen = [
  { name: 'Maschinenbau', icon: '⚙️' },
  { name: 'Fertigung & Produktion', icon: '🏭' },
  { name: 'Handwerk & Bau', icon: '🔨' },
  { name: 'Elektro & Installation', icon: '⚡' },
  { name: 'SHK & Heizung', icon: '🔧' },
  { name: 'Logistik & Transport', icon: '🚛' },
  { name: 'Handel & E-Commerce', icon: '🛒' },
  { name: 'Steuerberatung & Kanzleien', icon: '📊' },
  { name: 'IT-Dienstleister', icon: '💻' },
  { name: 'Immobilien', icon: '🏠' },
  { name: 'Gesundheitswesen', icon: '🏥' },
  { name: 'Automotive-Zulieferer', icon: '🚗' },
  { name: 'Forstwirtschaft & Landwirtschaft', icon: '🌲' },
  { name: 'Gastronomie & Hotellerie', icon: '🍽️' },
  { name: 'Versicherungen', icon: '🛡️' },
  { name: 'Bildung & Coaching', icon: '📚' },
  { name: 'Marketing & Agenturen', icon: '📣' },
  { name: 'Reinigung & Facility', icon: '🏢' },
  { name: 'Sicherheitsdienste', icon: '🔒' },
]

export default function Industries() {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <section id="branchen" className="bg-white py-20 px-6 border-t border-gray-100">
      <div className="max-w-6xl mx-auto">

        {/* Überschrift */}
        <div className="text-center mb-16">
          <p className="text-xs text-[#C9A84C] font-bold tracking-[0.3em] uppercase mb-3">
            Branchen
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-[#0A1628] mb-4">
            Vertraut mit dem deutschen Mittelstand
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            110 Branchen. Eine Lösung. Maßgeschneidert für Ihren Betrieb —
            vom Elektriker bis zum Maschinenbauer.
          </p>
        </div>

        {/* Branchen Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
          {branchen.map((b, i) => (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: '999px',
                border: `1px solid ${hovered === i ? '#C9A84C' : '#e5e7eb'}`,
                background: hovered === i ? '#0A1628' : '#fff',
                cursor: 'default',
                transition: 'all 0.2s',
                boxShadow: hovered === i ? '0 4px 20px rgba(201,168,76,0.2)' : '0 1px 4px rgba(0,0,0,0.04)',
                transform: hovered === i ? 'translateY(-2px)' : 'translateY(0)',
              }}
            >
              <span style={{ fontSize: '16px' }}>{b.icon}</span>
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: hovered === i ? '#C9A84C' : '#0A1628',
                letterSpacing: '0.02em',
                transition: 'color 0.2s',
                whiteSpace: 'nowrap',
              }}>
                {b.name}
              </span>
            </div>
          ))}

          {/* Alle 110 Branchen Button */}
          <Link
            href="/branchen"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              borderRadius: '999px',
              border: '2px solid #C9A84C',
              background: 'rgba(201,168,76,0.08)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#C9A84C'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(201,168,76,0.08)'
            }}
          >
            <span style={{ fontSize: '16px' }}>⚔️</span>
            <span style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#C9A84C',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}>
              Alle 110 Branchen ansehen →
            </span>
          </Link>
        </div>

        {/* Untertitel */}
        <div className="text-center mt-12">
          <p className="text-sm text-gray-400">
            Ihre Branche nicht dabei?{' '}
            <a href="#kontakt" style={{ color: '#C9A84C', fontWeight: 700, textDecoration: 'none' }}>
              Sprechen Sie uns an →
            </a>
          </p>
        </div>

      </div>
    </section>
  )
}
