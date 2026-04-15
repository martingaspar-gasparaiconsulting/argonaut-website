const steps = [
  { num: '01', title: 'Analyse', desc: 'Wir verstehen Ihre Prozesse, bevor wir etwas empfehlen. Kostenlos & unverbindlich.' },
  { num: '02', title: 'Konzept', desc: 'Klarer Plan mit definierten Ergebnissen, Zeitrahmen und Erfolgskennzahlen.' },
  { num: '03', title: 'Umsetzung', desc: 'Agile Entwicklung in Ihrem Betrieb — eng begleitet, kein Blackbox-Ansatz.' },
  { num: '04', title: 'Betrieb', desc: 'Laufende Optimierung, Support und Weiterentwicklung. Langfristige Partnerschaft.' },
]

export default function Process() {
  return (
    <section id="vorgehen" className="bg-[#faf9f6] border-y border-[#e8e4dc] py-28 px-20">
      <div className="max-w-[1300px] mx-auto">
        <div className="flex items-center gap-3 mb-12">
          <span className="inline-block w-8 h-px bg-[#c9a84c]" />
          <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)] font-semibold">Vorgehen</span>
        </div>
        <h2 className="font-[family-name:var(--font-syne)] font-semibold text-5xl leading-tight tracking-tight text-[#1a1a2e] mb-16">
          Von der Idee zur<br />laufenden Lösung
        </h2>
        <div className="grid grid-cols-4 gap-12">
          {steps.map(({ num, title, desc }, i) => (
            <div key={num} className="relative">
              {i < 3 && (
                <div className="absolute top-6 left-full w-full h-px bg-[#e8e4dc] -translate-y-1/2 z-0" />
              )}
              <div className="font-[family-name:var(--font-syne)] font-semibold text-6xl text-[#e8e4dc] leading-none mb-6">{num}</div>
              <div className="w-8 h-px bg-[#c9a84c] mb-4" />
              <div className="font-[family-name:var(--font-syne)] font-semibold text-base text-[#1a1a2e] mb-3">{title}</div>
              <p className="text-sm text-[#6b6b72] leading-relaxed font-light">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}