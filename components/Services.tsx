'use client'

import { useState } from 'react'

const leistungen = [
  {
    nr: '01',
    titel: 'KI-Prozessautomatisierung',
    text: 'Wiederkehrende Workflows automatisiert — von der Angebotserstellung bis zur Rechnungsverarbeitung. Ihre Mitarbeiter konzentrieren sich auf das Wesentliche.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    nr: '02',
    titel: 'Intelligente Assistenten',
    text: 'Maßgeschneiderte KI-Agenten für Kundenservice, internes Wissensmanagement und Entscheidungsunterstützung — integriert in Ihre bestehende IT.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="#C9A84C" strokeWidth="2"/>
        <path d="M4 20C4 16 7.6 13 12 13C16.4 13 20 16 20 20" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    nr: '03',
    titel: 'Datenanalyse & Reporting',
    text: 'Aus Ihren Betriebsdaten werden handlungsrelevante Erkenntnisse. Dashboards, die Chefs und Teams gleichermaßen nutzen — täglich aktuell.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#C9A84C" strokeWidth="2"/>
        <path d="M3 9H21M9 21V9" stroke="#C9A84C" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    nr: '04',
    titel: 'KI-Strategie & Beratung',
    text: 'Keine leeren Versprechen — sondern ein klarer Fahrplan, wo KI in Ihrem Unternehmen echten ROI erzeugt. Bodenständig, mittelstandsgerecht.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

export default function Services() {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <section id="leistungen" className="bg-white py-20 px-6 border-t border-gray-100">
      <div className="max-w-6xl mx-auto">

        {/* Überschrift */}
        <div className="text-center mb-14">
          <p className="text-xs text-[#C9A84C] font-bold tracking-[0.3em] uppercase mb-3">
            Leistungen
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-[#0A1628] mb-4">
            Was wir für Sie automatisieren
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Von der ersten Idee bis zum laufenden System — ARGONAUT liefert
            messbare Ergebnisse für Ihren Betrieb.
          </p>
        </div>

        {/* 2x2 Kacheln */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {leistungen.map((item, i) => (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderTop: `4px solid #C9A84C`,
                borderRadius: '16px',
                padding: '36px 32px',
                transition: 'all 0.25s',
                boxShadow: hovered === i ? '0 12px 40px rgba(201,168,76,0.15)' : '0 2px 12px rgba(0,0,0,0.04)',
                transform: hovered === i ? 'translateY(-4px)' : 'translateY(0)',
                cursor: 'default',
              }}
            >
              {/* Icon */}
              <div style={{
                width: '52px',
                height: '52px',
                background: 'rgba(201,168,76,0.1)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                border: '1px solid rgba(201,168,76,0.25)',
              }}>
                {item.icon}
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
                {item.nr}
              </p>

              {/* Titel */}
              <p style={{
                fontSize: '20px',
                fontWeight: 900,
                color: '#0A1628',
                margin: '0 0 14px',
                lineHeight: 1.2,
              }}>
                {item.titel}
              </p>

              {/* Text */}
              <p style={{
                fontSize: '15px',
                color: '#6b7280',
                lineHeight: 1.7,
                margin: 0,
              }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
