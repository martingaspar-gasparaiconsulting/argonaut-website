const industries = [
  'Maschinenbau', 'Fertigung & Produktion', 'Logistik', 'Handwerk & Bau',
  'Handel & E-Commerce', 'Steuerberatung & Kanzleien', 'Immobilien',
  'Gesundheitswesen', 'Automotive-Zulieferer', 'IT-Dienstleister',
]

export default function Industries() {
  return (
    <section id="branchen" className="px-8 md:px-16 py-24 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 mb-12">
        <span className="inline-block w-8 h-px bg-[#c9a84c]" />
        <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)]">Branchen</span>
      </div>
      <h2 className="font-[family-name:var(--font-syne)] font-extrabold text-4xl md:text-5xl leading-tight tracking-tight text-[#f0ede6] mb-10">
        Vertraut mit dem<br />deutschen Mittelstand
      </h2>
      <div className="flex flex-wrap gap-3">
        {industries.map((name) => (
          <span key={name} className="px-5 py-2.5 border border-[#1e1e22] text-xs text-[#6b6b72] tracking-[0.04em] hover:border-[#c9a84c] hover:text-[#c9a84c] transition-all duration-200 cursor-default">
            {name}
          </span>
        ))}
      </div>
    </section>
  )
}