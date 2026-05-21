"use client";

import { useState } from "react";

const agents = [
  { id: 1, emoji: "🤝", name: "A1 Empfänger", role: "Onboarded neue Kunden", tier: "SOLO", color: "from-teal-900/40 to-teal-800/20", borderHover: "hover:border-teal-500/50", tagColor: "text-teal-400", examples: ["Kunden-Onboarding", "Willkommensflow", "FAQ-Automation"] },
  { id: 2, emoji: "✍️", name: "A5 Schreiber", role: "Erstellt Inhalte", tier: "SOLO", color: "from-pink-900/40 to-pink-800/20", borderHover: "hover:border-pink-500/50", tagColor: "text-pink-400", examples: ["Texterstellung", "Content-Pflege", "Newsletter"] },
  { id: 3, emoji: "🛡️", name: "A3 Wächter", role: "Kein Fehler entkommt ihm", tier: "START", color: "from-green-900/40 to-green-800/20", borderHover: "hover:border-green-500/50", tagColor: "text-green-400", examples: ["Qualitätssicherung", "Fehleranalyse", "Testing"] },
  { id: 4, emoji: "💰", name: "A4 Buchhalter", role: "Verwaltet Finanzen", tier: "START", color: "from-yellow-900/40 to-yellow-800/20", borderHover: "hover:border-yellow-500/50", tagColor: "text-yellow-400", examples: ["Rechnungen", "Buchhaltung", "Reporting"] },
  { id: 5, emoji: "📅", name: "A6 Planer", role: "Koordiniert Termine", tier: "START", color: "from-blue-900/40 to-blue-800/20", borderHover: "hover:border-blue-500/50", tagColor: "text-blue-400", examples: ["Terminplanung", "Kalender", "Koordination"] },
  { id: 6, emoji: "💼", name: "A7 Verkäufer", role: "Generiert Leads", tier: "START", color: "from-orange-900/40 to-orange-800/20", borderHover: "hover:border-orange-500/50", tagColor: "text-orange-400", examples: ["Lead-Generierung", "Angebote", "Follow-up"] },
  { id: 7, emoji: "💬", name: "B3 Moderator", role: "Managed Community", tier: "START", color: "from-purple-900/40 to-purple-800/20", borderHover: "hover:border-purple-500/50", tagColor: "text-purple-400", examples: ["Community", "Kommentare", "Social Media"] },
  { id: 8, emoji: "👥", name: "B4 Personalchef", role: "Rekrutiert Talente", tier: "START", color: "from-red-900/40 to-red-800/20", borderHover: "hover:border-red-500/50", tagColor: "text-red-400", examples: ["Recruiting", "HR-Prozesse", "Onboarding"] },
  { id: 9, emoji: "🔨", name: "A2 Schmied", role: "Baut Automatisierungen", tier: "PRO", color: "from-orange-900/40 to-orange-800/20", borderHover: "hover:border-orange-500/50", tagColor: "text-orange-400", examples: ["API-Integration", "Workflow-Aufbau", "Entwicklung"] },
  { id: 10, emoji: "🎬", name: "A8 Regisseur", role: "Steuert Kampagnen", tier: "PRO", color: "from-pink-900/40 to-pink-800/20", borderHover: "hover:border-pink-500/50", tagColor: "text-pink-400", examples: ["Kampagnen", "Marketing", "Steuerung"] },
  { id: 11, emoji: "🔍", name: "B1 Forscher", role: "Analysiert Märkte", tier: "PRO", color: "from-blue-900/40 to-blue-800/20", borderHover: "hover:border-blue-500/50", tagColor: "text-blue-400", examples: ["Marktanalyse", "Wettbewerb", "Research"] },
  { id: 12, emoji: "🌍", name: "B2 Übersetzer", role: "Lokalisiert Inhalte", tier: "PRO", color: "from-green-900/40 to-green-800/20", borderHover: "hover:border-green-500/50", tagColor: "text-green-400", examples: ["Übersetzung", "Lokalisierung", "Sprachen"] },
  { id: 13, emoji: "🛒", name: "B5 Einkäufer", role: "Optimiert Beschaffung", tier: "PRO", color: "from-yellow-900/40 to-yellow-800/20", borderHover: "hover:border-yellow-500/50", tagColor: "text-yellow-400", examples: ["Einkauf", "Beschaffung", "Lieferanten"] },
  { id: 14, emoji: "📊", name: "C1 Analyst", role: "Wertet Daten aus", tier: "PRO", color: "from-teal-900/40 to-teal-800/20", borderHover: "hover:border-teal-500/50", tagColor: "text-teal-400", examples: ["Datenanalyse", "Reports", "KPIs"] },
  { id: 15, emoji: "🔧", name: "D1 Techniker", role: "Wartet Systeme", tier: "PRO", color: "from-gray-900/40 to-gray-800/20", borderHover: "hover:border-gray-500/50", tagColor: "text-gray-400", examples: ["Systemwartung", "IT-Support", "Updates"] },
  { id: 16, emoji: "🤖", name: "E4 Assistent", role: "Unterstützt täglich", tier: "PRO", color: "from-purple-900/40 to-purple-800/20", borderHover: "hover:border-purple-500/50", tagColor: "text-purple-400", examples: ["Assistenz", "Aufgaben", "Organisation"] },
  { id: 17, emoji: "♟️", name: "C2 Stratege", role: "Entwickelt Konzepte", tier: "BUSINESS", color: "from-blue-900/40 to-blue-800/20", borderHover: "hover:border-blue-500/50", tagColor: "text-blue-400", examples: ["Strategie", "Konzepte", "Planung"] },
  { id: 18, emoji: "🎓", name: "C4 Trainer", role: "Schult Mitarbeiter", tier: "BUSINESS", color: "from-green-900/40 to-green-800/20", borderHover: "hover:border-green-500/50", tagColor: "text-green-400", examples: ["Training", "Schulungen", "Academy"] },
  { id: 19, emoji: "🔐", name: "D2 Sicherheitschef", role: "Schützt Daten", tier: "BUSINESS", color: "from-red-900/40 to-red-800/20", borderHover: "hover:border-red-500/50", tagColor: "text-red-400", examples: ["Datenschutz", "Security", "Compliance"] },
  { id: 20, emoji: "🌐", name: "E1 Netzwerker", role: "Pflegt Kontakte", tier: "BUSINESS", color: "from-teal-900/40 to-teal-800/20", borderHover: "hover:border-teal-500/50", tagColor: "text-teal-400", examples: ["Netzwerk", "Kontakte", "Partnerschaften"] },
  { id: 21, emoji: "⚖️", name: "C3 Jurist", role: "Prüft Verträge", tier: "ENTERPRISE", color: "from-yellow-900/40 to-yellow-800/20", borderHover: "hover:border-yellow-500/50", tagColor: "text-yellow-400", examples: ["Verträge", "Rechtsprüfung", "Compliance"] },
  { id: 22, emoji: "🔗", name: "D3 Integrator", role: "Verbindet Systeme", tier: "ENTERPRISE", color: "from-orange-900/40 to-orange-800/20", borderHover: "hover:border-orange-500/50", tagColor: "text-orange-400", examples: ["Integrationen", "APIs", "Systeme"] },
  { id: 23, emoji: "🏛️", name: "E2 Botschafter", role: "Repräsentiert die Marke", tier: "ENTERPRISE", color: "from-pink-900/40 to-pink-800/20", borderHover: "hover:border-pink-500/50", tagColor: "text-pink-400", examples: ["Branding", "PR", "Repräsentation"] },
  { id: 24, emoji: "🔭", name: "E3 Späher", role: "Beobachtet Wettbewerb", tier: "ENTERPRISE", color: "from-purple-900/40 to-purple-800/20", borderHover: "hover:border-purple-500/50", tagColor: "text-purple-400", examples: ["Wettbewerb", "Marktbeobachtung", "Intelligence"] },
];

const tierColors: Record<string, string> = {
  SOLO: "bg-gray-700/50 text-gray-300",
  START: "bg-blue-900/50 text-blue-300",
  PRO: "bg-yellow-900/50 text-yellow-300",
  BUSINESS: "bg-orange-900/50 text-orange-300",
  ENTERPRISE: "bg-purple-900/50 text-purple-300",
};

export default function Agents() {
  const [activeAgent, setActiveAgent] = useState<number | null>(null);

  return (
    <section className="bg-[#060E1A] py-24 px-6" id="agenten">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[#C9A84C] text-sm font-medium tracking-widest uppercase mb-4">
            Ihre KI-Crew
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            24 Agenten. Rund um die Uhr. Für Sie.
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Jeder Spezialist für seine Mission. Zusammen unschlagbar.
            Rund um die Uhr — ohne Urlaub, ohne Krankentage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-8">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => setActiveAgent(activeAgent === agent.id ? null : agent.id)}
              className={`relative rounded-2xl border p-6 cursor-pointer transition-all duration-300 bg-gradient-to-br ${agent.color} ${agent.borderHover} ${activeAgent === agent.id ? "border-[#C9A84C]/60 scale-[1.02]" : "border-white/10"} hover:scale-[1.02]`}
            >
              <span className="absolute top-4 right-4 text-xs text-gray-600 font-mono">
                {String(agent.id).padStart(2, '0')}
              </span>
              <span className={`absolute top-4 left-4 text-xs px-2 py-0.5 rounded-full font-bold ${tierColors[agent.tier]}`}>
                {agent.tier}
              </span>
              <div className="text-4xl mb-4 mt-6">{agent.emoji}</div>
              <h3 className="text-white font-bold text-lg mb-1">{agent.name}</h3>
              <p className={`text-sm font-medium mb-3 ${agent.tagColor}`}>{agent.role}</p>
              <div className={`overflow-hidden transition-all duration-300 ${activeAgent === agent.id ? "max-h-48 opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="flex flex-wrap gap-1 mb-3">
                  {agent.examples.map((ex) => (
                    <span key={ex} className="text-xs bg-white/5 border border-white/10 text-gray-400 px-2 py-1 rounded-full">
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
              {activeAgent !== agent.id && (
                <p className="text-gray-600 text-xs mt-2">Klick für Details →</p>
              )}
            </div>
          ))}
        </div>

        <div className="text-center">
          <a href="#preise" className="inline-flex items-center gap-2 text-[#C9A84C] hover:text-white border border-[#C9A84C]/40 hover:border-[#C9A84C] px-6 py-3 rounded-lg transition-all duration-200 text-sm font-medium">
            Preise & Pakete ansehen →
          </a>
        </div>
      </div>
    </section>
  );
}