"use client";

const plans = [
  {
    name: "Setup",
    price: "3.000",
    unit: "€ einmalig",
    description: "Der Grundstein für deine Crew",
    features: [
      "Onboarding-Call (90 Minuten)",
      "Analyse deiner Prozesse",
      "Einrichtung aller 7 Agenten",
      "Erste Mission live schalten",
      "Technische Integration",
    ],
    cta: "Mission starten",
    highlight: false,
  },
  {
    name: "Basis-Paket",
    price: "1.500",
    unit: "€ / Monat",
    badge: "Empfohlen",
    description: "25 laufende Missionen gleichzeitig",
    features: [
      "25 aktive Automatisierungen",
      "Alle 7 Agenten im Einsatz",
      "Monatliche Optimierungsrunde",
      "Mission-Reports",
      "Support per E-Mail",
    ],
    cta: "Jetzt starten",
    highlight: true,
  },
  {
    name: "Zusatzoptionen",
    price: "",
    unit: "",
    description: "Flexibel erweiterbar",
    features: [
      "Zusatz-Mission: 85 € / Monat",
      "Service & Monitoring: 150 € / Monat",
      "Individuelle Agent-Anpassung auf Anfrage",
      "Vor-Ort-Termin in Böblingen: auf Anfrage",
    ],
    cta: "Individuell anfragen",
    highlight: false,
    addons: true,
  },
];

export default function Pricing() {
  return (
    <section className="bg-[#0A1628] py-24 px-6" id="preise">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-[#C9A84C] text-sm font-medium tracking-widest uppercase mb-4">
            Transparente Preise
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Kein Abonnement-Dschungel.
            <br />
            <span className="text-[#C9A84C]">Klare Zahlen.</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Du weißt immer, was du bezahlst — und was du bekommst.
          </p>
        </div>

        {/* Preis-Kacheln */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`rounded-2xl p-8 border transition-all duration-300 flex flex-col ${
                plan.highlight
                  ? "border-[#C9A84C] bg-gradient-to-b from-[#C9A84C]/10 to-transparent"
                  : "border-white/10 bg-white/2 hover:border-white/20"
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="mb-4">
                  <span className="bg-[#C9A84C] text-[#0A1628] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    {plan.badge}
                  </span>
                </div>
              )}

              <h3 className="text-white font-bold text-xl mb-1">{plan.name}</h3>
              <p className="text-gray-400 text-sm mb-4">{plan.description}</p>

              {/* Preis */}
              {plan.price ? (
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">
                    {plan.price}
                  </span>
                  <span className="text-gray-400 text-lg ml-1">{plan.unit}</span>
                </div>
              ) : (
                <div className="mb-6">
                  <span className="text-2xl font-bold text-[#C9A84C]">
                    Flexibel
                  </span>
                </div>
              )}

              {/* Features */}
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-[#C9A84C] mt-0.5 flex-shrink-0">
                      {plan.addons ? "＋" : "✓"}
                    </span>
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href="#kontakt"
                className={`w-full text-center py-3 px-6 rounded-lg font-bold transition-all duration-200 hover:scale-105 ${
                  plan.highlight
                    ? "bg-[#C9A84C] text-[#0A1628] hover:bg-[#b8973d]"
                    : "border border-white/20 text-white hover:border-[#C9A84C]/50 hover:text-[#C9A84C]"
                }`}
              >
                {plan.cta} ⚔️
              </a>
            </div>
          ))}
        </div>

        {/* Transparenz-Hinweis */}
        <div className="text-center text-gray-500 text-sm">
          <p>
            Alle Preise zzgl. MwSt. · Keine versteckten Kosten · Monatlich
            kündbar ab Monat 3 ·{" "}
            <span className="text-[#C9A84C]">Made in Böblingen</span>
          </p>
        </div>

        {/* Tageskostenrechner */}
        <div className="mt-16 rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-8 max-w-2xl mx-auto text-center">
          <p className="text-gray-400 text-sm uppercase tracking-wider mb-2">
            Perspektive
          </p>
          <p className="text-white text-xl font-medium mb-4">
            Das Basis-Paket kostet dich
          </p>
          <div className="flex items-center justify-center gap-6 mb-4">
            <div>
              <p className="text-3xl font-bold text-[#C9A84C]">50 €</p>
              <p className="text-gray-400 text-xs">pro Tag</p>
            </div>
            <div className="text-gray-600">oder</div>
            <div>
              <p className="text-3xl font-bold text-[#C9A84C]">2,08 €</p>
              <p className="text-gray-400 text-xs">pro Stunde</p>
            </div>
            <div className="text-gray-600">oder</div>
            <div>
              <p className="text-3xl font-bold text-[#C9A84C]">0,03 €</p>
              <p className="text-gray-400 text-xs">pro Minute</p>
            </div>
          </div>
          <p className="text-gray-400 text-sm">
            Für eine Crew, die 24/7 für dich arbeitet.
          </p>
        </div>
      </div>
    </section>
  );
}
