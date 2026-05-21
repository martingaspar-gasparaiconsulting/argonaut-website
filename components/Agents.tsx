'use client'
import { useState } from 'react'

const agents = [
  { id: 1, emoji: '🤝', name: 'A1 Empfänger', role: 'Onboarded neue Kunden', tier: 'SOLO', examples: ['Kunden-Onboarding', 'Willkommensflow', 'FAQ-Automation'] },
  { id: 2, emoji: '✍️', name: 'A5 Schreiber', role: 'Erstellt Inhalte', tier: 'SOLO', examples: ['Texterstellung', 'Content-Pflege', 'Newsletter'] },
  { id: 3, emoji: '🛡️', name: 'A3 Wächter', role: 'Kein Fehler entkommt ihm', tier: 'START', examples: ['Qualitätssicherung', 'Fehleranalyse', 'Testing'] },
  { id: 4, emoji: '💰', name: 'A4 Buchhalter', role: 'Verwaltet Finanzen', tier: 'START', examples: ['Rechnungen', 'Buchhaltung', 'Reporting'] },
  { id: 5, emoji: '📅', name: 'A6 Planer', role: 'Koordiniert Termine', tier: 'START', examples: ['Terminplanung', 'Kalender', 'Koordination'] },
  { id: 6, emoji: '💼', name: 'A7 Verkäufer', role: 'Generiert Leads', tier: 'START', examples: ['Lead-Generierung', 'Angebote', 'Follow-up'] },
  { id: 7, emoji: '💬', name: 'B3 Moderator', role: 'Managed Community', tier: 'START', examples: ['Community', 'Kommentare', 'Social Media'] },
  { id: 8, emoji: '👥', name: 'B4 Personalchef', role: 'Rekrutiert Talente', tier: 'START', examples: ['Recruiting', 'HR-Prozesse', 'Onboarding'] },
  { id: 9, emoji: '🔨', name: 'A2 Schmied', role: 'Baut Automatisierungen', tier: 'PRO', examples: ['API-Integration', 'Workflow-Aufbau', 'Entwicklung'] },
  { id: 10, emoji: '🎬', name: 'A8 Regisseur', role: 'Steuert Kampagnen', tier: 'PRO', examples: ['Kampagnen', 'Marketing', 'Steuerung'] },
  { id: 11, emoji: '🔍', name: 'B1 Forscher', role: 'Analysiert Märkte', tier: 'PRO', examples: ['Marktanalyse', 'Wettbewerb', 'Research'] },
  { id: 12, emoji: '🌍', name: 'B2 Übersetzer', role: 'Lokalisiert Inhalte', tier: 'PRO', examples: ['Übersetzung', 'Lokalisierung', 'Sprachen'] },
  { id: 13, emoji: '🛒', name: 'B5 Einkäufer', role: 'Optimiert Beschaffung', tier: 'PRO', examples: ['Einkauf', 'Beschaffung', 'Lieferanten'] },
  { id: 14, emoji: '📊', name: 'C1 Analyst', role: 'Wertet Daten aus', tier: 'PRO', examples: ['Datenanalyse', 'Reports', 'KPIs'] },
  { id: 15, emoji: '🔧', name: 'D1 Techniker', role: 'Wartet Systeme', tier: 'PRO', examples: ['Systemwartung', 'IT-Support', 'Updates'] },
  { id: 16, emoji: '🤖', name: 'E4 Assistent', role: 'Unterstützt täglich', tier: 'PRO', examples: ['Assistenz', 'Aufgaben', 'Organisation'] },
  { id: 17, emoji: '♟️', name: 'C2 Stratege', role: 'Entwickelt Konzepte', tier: 'BUSINESS', examples: ['Strategie', 'Konzepte', 'Planung'] },
  { id: 18, emoji: '🎓', name: 'C4 Trainer', role: 'Schult Mitarbeiter', tier: 'BUSINESS', examples: ['Training', 'Schulungen', 'Academy'] },
  { id: 19, emoji: '🔐', name: 'D2 Sicherheitschef', role: 'Schützt Daten', tier: 'BUSINESS', examples: ['Datenschutz', 'Security', 'Compliance'] },
  { id: 20, emoji: '🌐', name: 'E1 Netzwerker', role: 'Pflegt Kontakte', tier: 'BUSINESS', examples: ['Netzwerk', 'Kontakte', 'Partnerschaften'] },
  { id: 21, emoji: '⚖️', name: 'C3 Jurist', role: 'Prüft Verträge', tier: 'ENTERPRISE', examples: ['Verträge', 'Rechtsprüfung', 'Compliance'] },
  { id: 22, emoji: '🔗', name: 'D3 Integrator', role: 'Verbindet Systeme', tier: 'ENTERPRISE', examples: ['Integrationen', 'APIs', 'Systeme'] },
  { id: 23, emoji: '🏛️', name: 'E2 Botschafter', role: 'Repräsentiert die Marke', tier: 'ENTERPRISE', examples: ['Branding', 'PR', 'Repräsentation'] },
  { id: 24, emoji: '🔭', name: 'E3 Späher', role: 'Beobachtet Wettbewerb', tier: 'ENTERPRISE', examples: ['Wettbewerb', 'Marktbeobachtung', 'Intelligence'] },
]

const tierColors: Record<string, { bg: string; text: string }> = {
  SOLO:       { bg: '#0A1628', text: '#ffffff' },
  START:      { bg: '#1a3a5c', text: '#ffffff' },
  PRO:        { bg: '#C9A84C', text: '#0A1628' },
  BUSINESS:   { bg: '#0A1628', text: '#C9A84C' },
  ENTERPRISE: { bg: '#C9A84C', text: '#0A1628' },
}

export default function Agents() {
  const [activeAgent, setActiveAgent] = useState<number | null>(null)

  return (
    <section style={{ background: '#ffffff', padding: '80px 24px' }} id="agenten">
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <p style={{ fontSize: '14px', color: '#C9A84C', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>Ihre KI-Crew</p>
          <h2 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 900, color: '#0A1628', margin: '0 0 20px', lineHeight: 1.1 }}>24 Agenten. Rund um die Uhr. Für Sie.</h2>
          <p style={{ fontSize: '18px', color: '#6b7280', maxWidth: '640px', margin: '0 auto' }}>Jeder Spezialist für seine Mission. Zusammen unschlagbar. Rund um die Uhr — ohne Urlaub, ohne Krankentage.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {agents.map((agent) => {
            const tc = tierColors[agent.tier]
            const isActive = activeAgent === agent.id
            return (
              <div
                key={agent.id}
                onClick={() => setActiveAgent(isActive ? null : agent.id)}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '28px 24px',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 8px 32px rgba(10,22,40,0.15)' : '0 2px 12px rgba(0,0,0,0.06)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <span style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{String(agent.id).padStart(2, '0')}</span>
                <span style={{ display: 'inline-block', background: tc.bg, color: tc.text, fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', borderRadius: '999px', marginBottom: '16px' }}>{agent.tier}</span>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>{agent.emoji}</div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0A1628', margin: '0 0 4px' }}>{agent.name}</h3>
                <p style={{ fontSize: '13px', color: '#C9A84C', fontWeight: 600, margin: '0 0 12px' }}>{agent.role}</p>
                {isActive && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                    {agent.examples.map((ex) => (
                      <span key={ex} style={{ fontSize: '11px', background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', padding: '4px 10px', borderRadius: '999px' }}>{ex}</span>
                    ))}
                  </div>
                )}
                {!isActive && <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Klick für Details →</p>}
              </div>
            )
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: '56px' }}>
          <a href="#preise" style={{ display: 'inline-block', color: '#C9A84C', border: '1.5px solid #C9A84C', padding: '14px 32px', borderRadius: '999px', fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>Preise & Pakete ansehen →</a>
        </div>
      </div>
    </section>
  )
}