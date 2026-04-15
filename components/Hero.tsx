import Link from 'next/link'

const stats = [
  { num: '3×', label: 'Schnellere Prozesse' },
  { num: '-60%', label: 'Manueller Aufwand' },
  { num: 'EU', label: 'DSGVO-konform' },
]

export default function Hero() {
  return (
    <section style={{background:'#0d1b2e'}} className="relative overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-8 md:px-16 pt-24 pb-0">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <span className="inline-block w-8 h-px bg-[#c9a84c]" />
              <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)]">
                KI-Agentur für den Mittelstand
              </span>
            </div>
            <h1 className="font-[family-name:var(--font-syne)] font-semibold text-5xl md:text-6xl leading-[1.05] tracking-tight text-[#f0ede6] mb-8">
              KI, die<br />wirklich<br />
              <span className="text-[#c9a84c]">wirkt.</span>
            </h1>
            <p className="text-[#7a8fa6] text-lg font-light max-w-md leading-relaxed mb-12">
              ARGONAUT automatisiert Prozesse, die heute noch Ihre besten Leute binden — messbar, sicher und auf Ihren Betrieb zugeschnitten.
            </p>
            <div className="flex flex-wrap gap-5 items-center">
              <Link href="#kontakt" className="font-[family-name:var(--font-syne)] font-semibold text-xs tracking-[0.12em] uppercase px-10 py-4 bg-[#c9a84c] text-[#0d1b2e] hover:bg-[#e0b85a] transition-all duration-200">
                Kostenloses Erstgespräch
              </Link>
              <Link href="#leistungen" className="text-sm text-[#7a8fa6] hover:text-[#e8e6e0] transition-colors flex items-center gap-2">
                Leistungen entdecken <span>→</span>
              </Link>
            </div>
          </div>
          <div className="hidden md:flex items-center justify-center py-12">
            <svg width="340" height="300" viewBox="0 0 340 300" xmlns="http://www.w3.org/2000/svg">
              <line x1="170" y1="150" x2="60" y2="70" stroke="#1e3a5f" strokeWidth="1"/>
              <line x1="170" y1="150" x2="280" y2="60" stroke="#1e3a5f" strokeWidth="1"/>
              <line x1="170" y1="150" x2="305" y2="170" stroke="#1e3a5f" strokeWidth="1"/>
              <line x1="170" y1="150" x2="60" y2="240" stroke="#1e3a5f" strokeWidth="1"/>
              <line x1="170" y1="150" x2="170" y2="265" stroke="#1e3a5f" strokeWidth="1"/>
              <circle cx="60" cy="70" r="26" fill="#112240" stroke="#1e3a5f" strokeWidth="1"/>
              <text x="60" y="66" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">PROZESS</text>
              <text x="60" y="76" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">AUTO</text>
              <circle cx="280" cy="60" r="26" fill="#112240" stroke="#1e3a5f" strokeWidth="1"/>
              <text x="280" y="56" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">DATEN</text>
              <text x="280" y="66" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">ANALYSE</text>
              <circle cx="305" cy="170" r="26" fill="#112240" stroke="#1e3a5f" strokeWidth="1"/>
              <text x="305" y="166" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">KI</text>
              <text x="305" y="176" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">AGENT</text>
              <circle cx="60" cy="240" r="26" fill="#112240" stroke="#1e3a5f" strokeWidth="1"/>
              <text x="60" y="236" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">STRATE</text>
              <text x="60" y="246" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">GIE</text>
              <circle cx="170" cy="265" r="26" fill="#112240" stroke="#1e3a5f" strokeWidth="1"/>
              <text x="170" y="261" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">REPORT</text>
              <text x="170" y="271" fontSize="6.5" fill="#7a8fa6" textAnchor="middle" fontFamily="sans-serif">ING</text>
              <circle cx="170" cy="150" r="46" fill="#112240" stroke="#c9a84c" strokeWidth="1.5"/>
              <circle cx="170" cy="150" r="58" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.2"/>
              <text x="170" y="144" fontSize="9" fill="#c9a84c" textAnchor="middle" fontFamily="sans-serif" fontWeight="600">ARGO</text>
              <text x="170" y="158" fontSize="9" fill="#c9a84c" textAnchor="middle" fontFamily="sans-serif" fontWeight="600">NAUT</text>
            </svg>
          </div>
        </div>
      </div>
      <div style={{background:'#0d1b2e', borderTop:'1px solid #1e3a5f'}} className="mt-16">
        <div className="max-w-[1200px] mx-auto grid grid-cols-3">
          {stats.map(({ num, label }, i) => (
            <div key={label} style={{borderRight: i < 2 ? '1px solid #1e3a5f' : 'none'}} className="px-8 py-8">
              <div className="font-[family-name:var(--font-syne)] font-semibold text-3xl text-[#c9a84c]">{num}</div>
              <div className="text-[#7a8fa6] text-xs tracking-[0.08em] uppercase mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}