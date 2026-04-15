const steps = [
  { num: '01', title: 'Analyse', desc: 'Wir verstehen Ihre Prozesse, bevor wir etwas empfehlen. Kostenlos & unverbindlich.' },
  { num: '02', title: 'Konzept', desc: 'Klarer Plan mit definierten Ergebnissen, Zeitrahmen und Erfolgskennzahlen.' },
  { num: '03', title: 'Umsetzung', desc: 'Agile Entwicklung in Ihrem Betrieb — eng begleitet, kein Blackbox-Ansatz.' },
  { num: '04', title: 'Betrieb', desc: 'Laufende Optimierung, Support und Weiterentwicklung. Langfristige Partnerschaft.' },
]

export default function Process() {
  return (
    <section id="vorgehen" className="bg-[#111113] border-y border-[#1e1e22] py-24 px-8 md:px-16">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-3 mb-12">
          <span className="inline-block w-8 h-px bg-[#c9a84c]" />
          <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)]">Vorgehen</span>
        </div>
        <h2 className="font-[family-name:var(--font-syne)] font-extrabold text-4xl md:text-5xl leading-tight tracking-tight text-[#f0ede6] mb-12">
          Von der Idee zur<br />laufenden Lösung
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map(({ num, title, desc }) => (
            <div key={num}>
              <div className="font-[family-name:var(--font-syne)] font-extrabold text-5xl text-[#1e1e22] leading-none mb-4">{num}</div>
              <div className="font-[family-name:var(--font-syne)] font-bold text-sm text-[#e8e6e0] mb-2 tracking-[0.02em]">{title}</div>
              <p className="text-xs text-[#6b6b72] leading-relaxed font-light">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}