'use client'

import Image from 'next/image'

const stats = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L15 9H22L16.5 13.5L18.5 21L12 17L5.5 21L7.5 13.5L2 9H9L12 2Z" fill="#C9A84C"/>
      </svg>
    ),
    zahl: '7',
    titel: 'KI-Spezialisten',
    sub: 'rund um die Uhr aktiv',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#C9A84C" strokeWidth="2"/>
        <path d="M12 6V12L16 14" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    zahl: '24/7',
    titel: 'Immer aktiv',
    sub: 'keine Pause, kein Ausfall',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="7" height="7" rx="1" fill="#C9A84C"/>
        <rect x="14" y="3" width="7" height="7" rx="1" fill="#C9A84C" opacity="0.6"/>
        <rect x="3" y="14" width="7" height="7" rx="1" fill="#C9A84C" opacity="0.6"/>
        <rect x="14" y="14" width="7" height="7" rx="1" fill="#C9A84C"/>
        <path d="M10 6.5H14M17.5 10V14M10 17.5H14M6.5 10V14" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    zahl: '4.045',
    titel: 'Automatisierungen',
    sub: 'für jede Branche startklar',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 21V19C3 17.9 3.9 17 5 17H19C20.1 17 21 17.9 21 19V21" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/>
        <path d="M12 3L20 8V13H4V8L12 3Z" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/>
        <rect x="9" y="13" width="6" height="4" fill="#C9A84C" opacity="0.5"/>
      </svg>
    ),
    zahl: '110',
    titel: 'Branchen',
    sub: 'maßgeschneidert für Sie',
  },
]

export default function AgentTeam() {
  return (
    <section className="bg-white py-20 px-6 border-t border-gray-100">
      <div className="max-w-6xl mx-auto">

        {/* Überschrift */}
        <div className="text-center mb-14">
          <p className="text-xs text-[#C9A84C] font-bold tracking-[0.3em] uppercase mb-3">
            Ihre KI-Crew
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-[#0A1628] mb-4">
            7 Spezialisten. Rund um die Uhr. Für Sie.
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Kein Freelancer. Kein Zufall. Sondern ein eingespieltes KI-Team —
            das Ihre Prozesse kennt, optimiert und niemals schläft.
          </p>
        </div>

        {/* Bild */}
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl border border-gray-100 mb-14">
          <Image
            src="/images/argonaut-team.png"
            alt="Das ARGONAUT Team — 7 KI-Agenten"
            width={1920}
            height={1080}
            className="w-full h-auto"
            priority
          />
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '28px 20px',
                textAlign: 'center',
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                transition: 'all 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget
                el.style.boxShadow = '0 8px 32px rgba(201,168,76,0.15)'
                el.style.borderColor = '#C9A84C'
                el.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget
                el.style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)'
                el.style.borderColor = '#e5e7eb'
                el.style.transform = 'translateY(0)'
              }}
            >
              {/* Icon Kreis */}
              <div style={{
                width: '52px',
                height: '52px',
                background: 'rgba(201,168,76,0.1)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '1px solid rgba(201,168,76,0.3)',
              }}>
                {stat.icon}
              </div>

              {/* Zahl */}
              <p style={{
                fontSize: 'clamp(2rem, 4vw, 2.8rem)',
                fontWeight: 900,
                color: '#C9A84C',
                margin: '0 0 8px',
                lineHeight: 1,
              }}>
                {stat.zahl}
              </p>

              {/* Titel */}
              <p style={{
                fontSize: '15px',
                fontWeight: 700,
                color: '#0A1628',
                margin: '0 0 6px',
              }}>
                {stat.titel}
              </p>

              {/* Subtitle */}
              <p style={{
                fontSize: '13px',
                color: '#9ca3af',
                margin: 0,
              }}>
                {stat.sub}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <a
            href="#kontakt"
            style={{
              background: '#C9A84C',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              padding: '16px 40px',
              borderRadius: '999px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              display: 'inline-block',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#b8973d' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#C9A84C' }}
          >
            Meine Crew kennenlernen →
          </a>
        </div>

      </div>
    </section>
  )
}
