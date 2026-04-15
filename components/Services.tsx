const services = [
  { num: '01', title: 'KI-Prozessautomatisierung', desc: 'Wiederkehrende Workflows automatisiert — von der Angebotserstellung bis zur Rechnungsverarbeitung. Ihre Mitarbeiter konzentrieren sich auf das Wesentliche.' },
  { num: '02', title: 'Intelligente Assistenten', desc: 'Maßgeschneiderte KI-Agenten für Kundenservice, internes Wissensmanagement und Entscheidungsunterstützung — integriert in Ihre bestehende IT.' },
  { num: '03', title: 'Datenanalyse & Reporting', desc: 'Aus Ihren Betriebsdaten werden handlungsrelevante Erkenntnisse. Dashboards, die Chefs und Teams gleichermaßen nutzen — täglich aktuell.' },
  { num: '04', title: 'KI-Strategie & Beratung', desc: 'Keine leeren Versprechen — sondern ein klarer Fahrplan, wo KI in Ihrem Unternehmen echten ROI erzeugt. Bodenständig, mittelstandsgerecht.' },
]

export default function Services() {
  return (
    <section id="leistungen" className="bg-white px-20 py-28">
      <div className="max-w-[1300px] mx-auto">
        <div className="flex items-center gap-3 mb-12">
          <span className="inline-block w-8 h-px bg-[#c9a84c]" />
          <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)] font-semibold">Leistungen</span>
        </div>
        <h2 className="font-[family-name:var(--font-syne)] font-semibold text-5xl leading-tight tracking-tight text-[#1a1a2e] mb-16">
          Was wir für Sie<br />automatisieren
        </h2>
        <div className="grid grid-cols-2 gap-px bg-[#e8e4dc]">
          {services.map(({ num, title, desc }) => (
            <div key={num} className="group bg-white hover:bg-[#faf9f6] px-10 py-12 border-t-2 border-transparent hover:border-[#c9a84c] transition-all duration-300">
              <div className="font-[family-name:var(--font-syne)] text-xs tracking-[0.2em] text-[#c9a84c] opacity-60 mb-6">{num}</div>
              <h3 className="font-[family-name:var(--font-syne)] font-semibold text-xl text-[#1a1a2e] mb-4">{title}</h3>
              <p className="text-sm text-[#6b6b72] leading-relaxed font-light">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}