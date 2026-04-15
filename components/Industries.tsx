const industries = [
  'Maschinenbau', 'Fertigung & Produktion', 'Logistik', 'Handwerk & Bau',
  'Handel & E-Commerce', 'Steuerberatung & Kanzleien', 'Immobilien',
  'Gesundheitswesen', 'Automotive-Zulieferer', 'IT-Dienstleister',
]

export default function Industries() {
  return (
    <section id="branchen" className="bg-white px-20 py-28">
      <div className="max-w-[1300px] mx-auto">
        <div className="flex items-center gap-3 mb-12">
          <span className="inline-block w-8 h-px bg-[#c9a84c]" />
          <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)] font-semibold">Branchen</span>
        </div>
        <h2 className="font-[family-name:var(--font-syne)] font-semibold text-5xl leading-tight tracking-tight text-[#1a1a2e] mb-16">
          Vertraut mit dem<br />deutschen Mittelstand
        </h2>
        <div className="flex flex-wrap gap-4">
          {industries.map((name) => (
            <span
              key={name}
              className="px-6 py-3 border border-[#e8e4dc] text-sm text-[#6b6b72] tracking-[0.04em] hover:border-[#c9a84c] hover:text-[#c9a84c] transition-all duration-200 cursor-default font-light"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}