'use client'

const agenten = [
  'Der Architekt — Plant jede Mission',
  'Der Schmied — Baut Automatisierungen',
  'Der Wächter — Testet jeden Schritt',
  'Der Chronist — Dokumentiert alles',
  'Der Schärfer — Optimiert kontinuierlich',
  'Der Bote — Aktualisiert die Website',
  'Der Empfänger — Onboarded neue Kunden',
]

const automatisierungen = [
  'Lead-Automatisierung',
  'Angebotserstellung',
  'Kundenservice',
  'Rechnungsverarbeitung',
  'Terminbuchung',
  'E-Mail-Marketing',
  'WhatsApp-Kommunikation',
  'Mitarbeiter-Onboarding',
  'Dokumentenmanagement',
  'Buchhaltung & Reporting',
]

const agentenDoppelt = [...agenten, ...agenten, ...agenten]
const automatisierungenDoppelt = [...automatisierungen, ...automatisierungen, ...automatisierungen]

export default function ScrollingBanner() {
  return (
    <section className="bg-white py-16 overflow-hidden border-t border-gray-100">

      {/* Überschrift */}
      <div className="text-center mb-14 px-6">
        <p className="text-xs text-[#C9A84C] font-bold tracking-[0.3em] uppercase mb-3">
          Ihre komplette KI-Crew
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-[#0A1628]">
          7 Spezialisten. 10 Automatisierungen. Ein System.
        </h2>
      </div>

      {/* Reihe 1 — Agenten — scrollt nach links */}
      <div style={{ overflow: 'hidden', marginBottom: '20px', padding: '12px 0' }}>
        <div style={{ display: 'flex', gap: '16px', animation: 'scrollLeft 35s linear infinite', width: 'max-content' }}>
          {agentenDoppelt.map((agent, i) => (
            <div
              key={i}
              style={{
                flexShrink: 0,
                border: '1px solid #e5e7eb',
                borderLeft: '4px solid #C9A84C',
                borderRadius: '12px',
                padding: '16px 28px',
                background: '#fff',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              }}
            >
              <p style={{ color: '#0A1628', fontWeight: 700, fontSize: '14px', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                {agent}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Reihe 2 — Automatisierungen — scrollt nach rechts */}
      <div style={{ overflow: 'hidden', padding: '12px 0' }}>
        <div style={{ display: 'flex', gap: '12px', animation: 'scrollRight 28s linear infinite', width: 'max-content' }}>
          {automatisierungenDoppelt.map((item, i) => (
            <div
              key={i}
              style={{
                flexShrink: 0,
                border: '1px solid #C9A84C',
                borderRadius: '999px',
                padding: '12px 28px',
                background: '#fff',
                boxShadow: '0 2px 12px rgba(201,168,76,0.08)',
              }}
            >
              <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center' }}>
                {item}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes scrollLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        @keyframes scrollRight {
          0% { transform: translateX(-33.33%); }
          100% { transform: translateX(0); }
        }
        div:hover > div {
          animation-play-state: paused;
        }
      `}</style>

    </section>
  )
}
