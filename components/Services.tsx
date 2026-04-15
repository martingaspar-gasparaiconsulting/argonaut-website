const services = [
  { num: '01', title: 'KI-Prozessautomatisierung', desc: 'Wiederkehrende Workflows automatisiert — von der Angebotserstellung bis zur Rechnungsverarbeitung. Ihre Mitarbeiter konzentrieren sich auf das Wesentliche.' },
  { num: '02', title: 'Intelligente Assistenten', desc: 'Maßgeschneiderte KI-Agenten für Kundenservice, internes Wissensmanagement und Entscheidungsunterstützung — integriert in Ihre bestehende IT.' },
  { num: '03', title: 'Datenanalyse & Reporting', desc: 'Aus Ihren Betriebsdaten werden handlungsrelevante Erkenntnisse. Dashboards, die Chefs und Teams gleichermaßen nutzen — täglich aktuell.' },
  { num: '04', title: 'KI-Strategie & Beratung', desc: 'Keine leeren Versprechen — sondern ein klarer Fahrplan, wo KI in Ihrem Unternehmen echten ROI erzeugt. Bodenständig, mittelstandsgerecht.' },
]

export default function Services() {
  return (
    <section id="leistungen" className="bg-white px-8 md:px-16 py-24">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-3 mb-12">
          <span className="inline-block w-8 h-px bg-[#2563eb]" />
          <span className="text-[#2563eb] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)] font-semibold">Leistungen</span>
        </div>
        <h2 className="font-[family-name:var(--font-syne)] font-semibold text-4xl md:text-5xl leading-tight tracking-tight text-[#1a1a2e] mb-12">
          Was wir für Sie<br />automatisieren
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#e2e8f0]">
          {services.map(({ num, title, desc }) => (
            <div key={num} className="group bg-white hover:bg-[#f8fafc] px-8 py-10 relative overflow-hidden transition-colors duration-200 border-t-2 border-transparent hover:border-[#2563eb]">
              <div className="font-[family-name:var(--font-syne)] text-xs tracking-[0.2em] text-[#2563eb] opacity-50 mb-6">{num}</div>
              <h3 className="font-[family-name:var(--font-syne)] font-semibold text-lg text-[#1a1a2e] mb-3">{title}</h3>
              <p className="text-sm text-[#64748b] leading-relaxed font-light">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}