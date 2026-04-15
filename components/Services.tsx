const services = [
  { num: '01', title: 'KI-Prozessautomatisierung', desc: 'Wiederkehrende Workflows automatisiert — von der Angebotserstellung bis zur Rechnungsverarbeitung. Ihre Mitarbeiter konzentrieren sich auf das Wesentliche.' },
  { num: '02', title: 'Intelligente Assistenten', desc: 'Maßgeschneiderte KI-Agenten für Kundenservice, internes Wissensmanagement und Entscheidungsunterstützung — integriert in Ihre bestehende IT.' },
  { num: '03', title: 'Datenanalyse & Reporting', desc: 'Aus Ihren Betriebsdaten werden handlungsrelevante Erkenntnisse. Dashboards, die Chefs und Teams gleichermaßen nutzen — täglich aktuell.' },
  { num: '04', title: 'KI-Strategie & Beratung', desc: 'Keine leeren Versprechen — sondern ein klarer Fahrplan, wo KI in Ihrem Unternehmen echten ROI erzeugt. Bodenständig, mittelstandsgerecht.' },
]

export default function Services() {
  return (
    <section id="leistungen" className="px-8 md:px-16 py-24 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 mb-12">
        <span className="inline-block w-8 h-px bg-[#c9a84c]" />
        <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)]">Leistungen</span>
      </div>
      <h2 className="font-[family-name:var(--font-syne)] font-extrabold text-4xl md:text-5xl leading-tight tracking-tight text-[#f0ede6]">
        Was wir für Sie<br />automatisieren
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 border border-[#1e1e22] mt-12" style={{ gap: '1px', background: '#1e1e22' }}>
        {services.map(({ num, title, desc }) => (
          <div key={num} className="group bg-[#0a0a0b] hover:bg-[#111113] px-8 py-10 relative overflow-hidden transition-colors duration-200">
            <div className="absolute top-0 left-0 w-[3px] h-0 bg-[#c9a84c] group-hover:h-full transition-all duration-300" />
            <div className="font-[family-name:var(--font-syne)] text-xs tracking-[0.2em] text-[#8a6e2f] mb-6">{num}</div>
            <h3 className="font-[family-name:var(--font-syne)] font-bold text-lg text-[#e8e6e0] mb-3">{title}</h3>
            <p className="text-sm text-[#6b6b72] leading-relaxed font-light">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}