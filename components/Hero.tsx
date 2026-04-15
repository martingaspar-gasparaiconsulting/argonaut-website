import Link from 'next/link'

const stats = [
  { num: '3×', label: 'Schnellere Prozesse' },
  { num: '-60%', label: 'Manueller Aufwand' },
  { num: 'EU', label: 'DSGVO-konform' },
]

export default function Hero() {
  return (
    <section className="px-8 md:px-16 pt-24 pb-16 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 mb-10">
        <span className="inline-block w-8 h-px bg-[#c9a84c]" />
        <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)]">
          KI-Agentur für den Mittelstand
        </span>
      </div>
      <h1 className="font-[family-name:var(--font-syne)] font-extrabold text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.0] tracking-tight text-[#f0ede6] mb-8">
        KI, die<br />
        wirklich<br />
        <span className="text-[#c9a84c]">wirkt.</span>
      </h1>
      <p className="text-[#6b6b72] text-base md:text-lg font-light max-w-lg leading-relaxed mb-12">
        ARGONAUT automatisiert Prozesse, die heute noch Ihre besten Leute binden —
        messbar, sicher und auf Ihren Betrieb zugeschnitten.
      </p>
      <div className="flex flex-wrap gap-5 items-center">
        <Link href="#kontakt" className="font-[family-name:var(--font-syne)] font-bold text-xs tracking-[0.12em] uppercase px-10 py-4 bg-[#c9a84c] text-[#0a0a0b] hover:bg-[#e0b85a] transition-all duration-200">
          Kostenloses Erstgespräch
        </Link>
        <Link href="#leistungen" className="text-sm text-[#6b6b72] hover:text-[#e8e6e0] transition-colors flex items-center gap-2">
          Leistungen entdecken <span>→</span>
        </Link>
      </div>
      <div className="grid grid-cols-3 border border-[#1e1e22] mt-20" style={{ gap: '1px', background: '#1e1e22' }}>
        {stats.map(({ num, label }) => (
          <div key={label} className="bg-[#0a0a0b] px-6 py-8 md:px-7 md:py-9">
            <div className="font-[family-name:var(--font-syne)] font-extrabold text-3xl md:text-4xl text-[#c9a84c]">{num}</div>
            <div className="text-[#6b6b72] text-xs tracking-[0.08em] uppercase mt-1.5">{label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}