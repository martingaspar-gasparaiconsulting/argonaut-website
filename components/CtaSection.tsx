export default function CtaSection() {
  return (
    <section id="kontakt" style={{background:'#ffffff'}} className="py-32 px-8 text-center">
      <div className="max-w-[800px] mx-auto">
        <div className="flex justify-center items-center gap-3 mb-8">
          <span className="inline-block w-8 h-px bg-[#c9a84c]" />
          <span className="text-[#c9a84c] text-sm tracking-[0.2em] uppercase font-[family-name:var(--font-syne)] font-semibold">Jetzt starten</span>
          <span className="inline-block w-8 h-px bg-[#c9a84c]" />
        </div>
        <h2 className="font-[family-name:var(--font-syne)] font-semibold text-5xl md:text-6xl leading-tight tracking-tight text-[#0A1628] mb-6">
          Bereit für Ihren<br />KI-Vorteil?
        </h2>
        <p className="text-[#4a5a6a] text-xl font-light mb-14 max-w-md mx-auto leading-relaxed">
          30 Minuten. Keine Agentur-Phrasen. Nur ehrliche Einschätzung für Ihr Unternehmen.
        </p>
        <a href="mailto:martin.gaspar@argonaut.de" className="inline-block font-[family-name:var(--font-syne)] font-bold text-sm tracking-[0.12em] uppercase px-14 py-5 bg-[#c9a84c] text-[#0d1b2e] hover:bg-[#e0b85a] transition-all duration-200 rounded-full">
          Kostenloses Erstgespräch buchen
        </a>
        <p className="text-[#4a5a6a] text-sm tracking-[0.1em] uppercase mt-10">
          Martin Gaspar · ARGONAUT · 71032 Böblingen
        </p>
      </div>
    </section>
  )
}
