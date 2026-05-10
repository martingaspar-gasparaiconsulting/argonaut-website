'use client'

import { useState } from 'react'

const schritte = [
  {
    nr: '01',
    titel: 'Analyse',
    sub: 'Kostenlos & unverbindlich',
    text: 'Wir verstehen Ihre Prozesse, bevor wir etwas empfehlen. 30 Minuten reichen um zu wissen wo der größte Hebel liegt.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="#C9A84C" strokeWidth="2"/>
        <path d="M20 20L16.5 16.5" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    nr: '02',
    titel: 'Konzept',
    sub: 'Klarer Plan mit Zeitrahmen',
    text: 'Klarer Plan mit definierten Ergebnissen, Zeitrahmen und Erfolgskennzahlen. Kein Blackbox-Ansatz — Sie sehen jeden Schritt.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#C9A84C" strokeWidth="2"/>
        <path d="M7 8H17M7 12H13M7 16H11" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    nr: '03',
    titel: 'Umsetzung',
    sub: 'Agil & transparent',
    text: 'Agile Entwicklung in Ihrem Betrieb — eng begleitet, kein Blackbox-Ansatz. Sie sehen Fortschritte in Echtzeit.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    nr: '04',
    titel: 'Betrieb',
    sub: 'Langfristige Partnerschaft',
    text: 'Laufende Optimierung, Support und Weiterentwicklung. Langfristige Partnerschaft — wir wachsen mit Ihrem Betrieb.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#C9A84C" strokeWidth="2"/>
        <path d="M12 6V12L16 14" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export default function Process() {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <section id="vorgehen" className="bg-white py-20 px-6 border-t border-gray-100">
      <div className="max-w-6xl mx-auto">

        {/* Überschrift */}
        <div className="text-center mb-16">
          <p className="text-xs text-[#C9A84C] font-bold tracking-[0.3em] uppercase mb-3">
            Vorgehen
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-[#0A1628] mb-4">
            Von der Idee zur laufenden Lösung
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            In 4 klaren Schritten — transparent, messbar und immer auf Augenhöhe mit Ihrem Betrieb.
          </p>
        </div>

        {/* Schritte */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">

          {/* Verbindungslinie — nur Desktop */}
          <div className="hidden md:block absolute top-[52px] left-[12.5%] right-[12.5%] h-[2px] bg-gradient-to-r from-transparent via-[#C9A84C] to-transparent opacity-30 z-0" />

          {schritte.map((s, i) => (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: hovered === i ? '#0A1628' : '#fff',
                border: `1px solid ${hovered === i ? '#0A1628' : '#e5e7eb'}`,
                borderTop: `4px solid #C9A84C`,
                borderRadius: '16px',
                padding: '32px 24px',
                textAlign: 'center',
                transition: 'all 0.25s',
                boxShadow: hovered === i ? '0 16px 48px rgba(10,22,40,0.2)' : '0 2px 12px rgba(0,0,0,0.04)',
                transform: hovered === i ? 'translateY(-6px)' : 'translateY(0)',
                cursor: 'default',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {/* Icon */}
              <div style={{
                width: '64px',
                height: '64px',
                background: hovered === i ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.1)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                border: '1px solid rgba(201,168,76,0.3)',
              }}>
                {s.icon}
              </div>

              {/* Nummer */}
              <p style={{
                fontSize: '11px',
                color: '#C9A84C',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                margin: '0 0 10px',
              }}>
                {s.nr}
              </p>

              {/* Titel */}
              <p style={{
                fontSize: '20px',
                fontWeight: 900,
                color: hovered === i ? '#fff' : '#0A1628',
                margin: '0 0 6px',
                transition: 'color 0.25s',
              }}>
                {s.titel}
              </p>

              {/* Sub */}
              <p style={{
                fontSize: '12px',
                color: '#C9A84C',
                fontWeight: 600,
                letterSpacing: '0.05em',
                margin: '0 0 14px',
              }}>
                {s.sub}
              </p>

              {/* Text */}
              <p style={{
                fontSize: '14px',
                color: hovered === i ? 'rgba(255,255,255,0.7)' : '#6b7280',
                lineHeight: 1.7,
                margin: 0,
                transition: 'color 0.25s',
              }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
