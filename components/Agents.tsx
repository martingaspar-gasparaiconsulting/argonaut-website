"use client";

import { useState } from "react";

const agents = [
  {
    id: 1,
    emoji: "⚔️",
    name: "Der Architekt",
    role: "Plant jede Mission",
    description:
      "Analysiert dein Unternehmen, strukturiert Automatisierungsvorhaben und erstellt den genauen Plan — bevor ein Werkzeug gebaut wird.",
    cost: "1,77",
    color: "from-blue-900/40 to-blue-800/20",
    borderHover: "hover:border-blue-500/50",
    tagColor: "text-blue-400",
    examples: ["Prozessanalyse", "Mission-Briefing", "Workflow-Design"],
  },
  {
    id: 2,
    emoji: "🔨",
    name: "Der Schmied",
    role: "Baut die Werkzeuge",
    description:
      "Setzt die geplanten Automatisierungen um — APIs, Workflows, Integrationen. Was der Architekt plant, baut der Schmied.",
    cost: "5,07",
    color: "from-orange-900/40 to-orange-800/20",
    borderHover: "hover:border-orange-500/50",
    tagColor: "text-orange-400",
    examples: ["API-Integration", "Workflow-Aufbau", "Tool-Entwicklung"],
  },
  {
    id: 3,
    emoji: "🛡️",
    name: "Der Wächter",
    role: "Kein Fehler entkommt ihm",
    description:
      "Testet jeden Schritt, prüft jede Ausgabe. Stellt sicher, dass deine Automatisierungen fehlerfrei laufen — bevor der Kunde es merkt.",
    cost: "1,77",
    color: "from-green-900/40 to-green-800/20",
    borderHover: "hover:border-green-500/50",
    tagColor: "text-green-400",
    examples: ["Qualitätssicherung", "Fehleranalyse", "Testing"],
  },
  {
    id: 4,
    emoji: "📜",
    name: "Der Chronist",
    role: "Dokumentiert alles",
    description:
      "Hält jeden Prozess schriftlich fest. Du weißt immer, was läuft, warum es läuft — und was als Nächstes kommt.",
    cost: "1,62",
    color: "from-purple-900/40 to-purple-800/20",
    borderHover: "hover:border-purple-500/50",
    tagColor: "text-purple-400",
    examples: ["Prozess-Doku", "Mission-Reports", "Wissensbase"],
  },
  {
    id: 5,
    emoji: "⚡",
    name: "Der Schärfer",
    role: "Macht Gutes noch besser",
    description:
      "Optimiert kontinuierlich. Analysiert Schwachstellen und verfeinert deine Systeme — Woche für Woche, Monat für Monat.",
    cost: "1,47",
    color: "from-yellow-900/40 to-yellow-800/20",
    borderHover: "hover:border-yellow-500/50",
    tagColor: "text-yellow-400",
    examples: ["Continuous Improvement", "Performance-Analyse", "Iteration"],
  },
  {
    id: 6,
    emoji: "📣",
    name: "Der Bote",
    role: "Trägt deine Botschaft",
    description:
      "Aktualisiert deine Website, Newsletter und Kommunikationskanäle. Deine Botschaft erreicht Kunden — ohne dein Zutun.",
    cost: "1,50",
    color: "from-pink-900/40 to-pink-800/20",
    borderHover: "hover:border-pink-500/50",
    tagColor: "text-pink-400",
    examples: ["Website-Updates", "Newsletter", "Content-Pflege"],
  },
  {
    id: 7,
    emoji: "🤝",
    name: "Der Empfänger",
    role: "Onboarded neue Helden",
    description:
      "Begrüßt neue Kunden, führt sie durch den Prozess, beantwortet erste Fragen. Der erste Eindruck — automatisch perfekt.",
    cost: "1,50",
    color: "from-teal-900/40 to-teal-800/20",
    borderHover: "hover:border-teal-500/50",
    tagColor: "text-teal-400",
    examples: ["Kunden-Onboarding", "FAQ-Automation", "Willkommensflow"],
  },
];

export default function Agents() {
  const [activeAgent, setActiveAgent] = useState<number | null>(null);

  return (
    <section
      className="bg-[#060E1A] py-24 px-6"
      id="agenten"
    >
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-[#C9A84C] text-sm font-medium tracking-widest uppercase mb-4">
            Deine Crew
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Die 7 Argonauten
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Jeder Spezialist für seine Mission. Zusammen unschlagbar.
            Rund um die Uhr — ohne Urlaub, ohne Krankentage.
          </p>
        </div>

        {/* Agenten-Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-8">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() =>
                setActiveAgent(activeAgent === agent.id ? null : agent.id)
              }
              className={`relative rounded-2xl border p-6 cursor-pointer transition-all duration-300 bg-gradient-to-br ${agent.color} ${agent.borderHover} ${
                activeAgent === agent.id
                  ? "border-[#C9A84C]/60 scale-[1.02]"
                  : "border-white/10"
              } hover:scale-[1.02]`}
            >
              {/* Nummer */}
              <span className="absolute top-4 right-4 text-xs text-gray-600 font-mono">
                0{agent.id}
              </span>

              {/* Emoji */}
              <div className="text-4xl mb-4">{agent.emoji}</div>

              {/* Name & Rolle */}
              <h3 className="text-white font-bold text-lg mb-1">{agent.name}</h3>
              <p className={`text-sm font-medium mb-3 ${agent.tagColor}`}>
                {agent.role}
              </p>

              {/* Beschreibung — nur wenn aktiv */}
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  activeAgent === agent.id ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <p className="text-gray-300 text-sm mb-3 leading-relaxed">
                  {agent.description}
                </p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {agent.examples.map((ex) => (
                    <span
                      key={ex}
                      className="text-xs bg-white/5 border border-white/10 text-gray-400 px-2 py-1 rounded-full"
                    >
                      {ex}
                    </span>
                  ))}
                </div>
              </div>

              {/* Kosten */}
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-gray-500 text-xs">Kosten pro Tag</span>
                <span className="text-[#C9A84C] font-bold text-sm">
                  {agent.cost} €
                </span>
              </div>

              {/* Expand-Hint */}
              {activeAgent !== agent.id && (
                <p className="text-gray-600 text-xs mt-2">
                  Klick für Details →
                </p>
              )}
            </div>
          ))}

          {/* Gesamt-Kachel */}
          <div className="rounded-2xl border border-[#C9A84C]/40 bg-gradient-to-br from-[#C9A84C]/10 to-[#C9A84C]/5 p-6 flex flex-col justify-between">
            <div>
              <div className="text-4xl mb-4">🏆</div>
              <h3 className="text-white font-bold text-lg mb-1">
                Die komplette Crew
              </h3>
              <p className="text-[#C9A84C] text-sm font-medium mb-3">
                Alle 7 Agenten
              </p>
              <p className="text-gray-300 text-sm leading-relaxed">
                Vollständige Automatisierungs-Infrastruktur. Planend, bauend,
                testend, dokumentierend, optimierend, kommunizierend,
                onboardend.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-[#C9A84C]/20">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Gesamt/Tag</span>
                <span className="text-[#C9A84C] font-bold text-xl">14,70 €</span>
              </div>
              <p className="text-gray-500 text-xs mt-1">= weniger als ein Mittagessen</p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center">
          <a
            href="#preise"
            className="inline-flex items-center gap-2 text-[#C9A84C] hover:text-white border border-[#C9A84C]/40 hover:border-[#C9A84C] px-6 py-3 rounded-lg transition-all duration-200 text-sm font-medium"
          >
            Preise & Pakete ansehen →
          </a>
        </div>
      </div>
    </section>
  );
}
