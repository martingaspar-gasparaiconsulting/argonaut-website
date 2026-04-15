export default function CtaSection() {
  return (
    <section id="kontakt" className="bg-[#111113] border-t border-[#1e1e22] py-32 px-8 text-center">
      <div className="flex justify-center items-center gap-3 mb-8">
        <span className="inline-block w-8 h-px bg-[#c9a84c]" />
        <span className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-[family-name:var(--font-syne)]">Jetzt starten</span>
        <span className="inline-block w-8 h-px bg-[#c9a84c]" />
      </div>
      <h2 className="font-[family-name:var(--font-syne)] font-extrabold text-4xl md:text-5xl leading-tight tracking-tight text-[#f0ede6] mb-4">
        Bereit für Ihren<br />KI-Vorteil?
      </h2>
      <p className="text-[#6b6b72] text-base font-light mb-12 max-w-md mx-auto">
        30 Minuten. Keine Agentur-Phrasen. Nur ehrliche Einschätzung für Ihr Unternehmen.
      </p>
      <a href="mailto:martin.gaspar@argonaut.de" className="inline-block font-[family-name:var(--font-syne)] font-bold text-xs tracking-[0.12em] uppercase px-12 py-4 bg-[#c9a84c] text-[#0a0a0b] hover:bg-[#e0b85a] transition-all duration-200">
        Kostenloses Erstgespräch buchen
      </a>
      <p className="text-[#6b6b72] text-xs tracking-[0.1em] uppercase mt-8">
        Martin Gaspar · ARGONAUT · 71132 Böblingen
      </p>
    </section>
  )
}