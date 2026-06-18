'use client'

import { useState } from 'react'
import { getBrancheBySlug } from '@/lib/branchen'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ROIRechner from '@/components/ROIRechner'

function normalizeStr(s: string): string {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss').replace(/[^\x20-\x7E]/g, '').trim()
}

interface AgentMeta {
  rolle: string; icon: string; minPaket: string; paketLabel: string; paketColor: string
}

const AGENT_META_RAW: Record<string, AgentMeta> = {
  'Der Empfaenger':    { rolle: 'Kunden-Onboarding & Erstkontakt',      icon: '📥', minPaket: 'SOLO',       paketLabel: 'Ab SOLO',       paketColor: '#C9A84C' },
  'Der Buchhalter':    { rolle: 'Finanzen, Rechnungen & Buchhaltung',    icon: '🧾', minPaket: 'SOLO',       paketLabel: 'Ab SOLO',       paketColor: '#C9A84C' },
  'Der Schreiber':     { rolle: 'Content, Texte & Kommunikation',        icon: '✍️', minPaket: 'SOLO',       paketLabel: 'Ab SOLO',       paketColor: '#C9A84C' },
  'Der Waechter':      { rolle: 'Sicherheit & Compliance',               icon: '🛡️', minPaket: 'START',      paketLabel: 'Ab START',      paketColor: '#4f94e8' },
  'Der Planer':        { rolle: 'Termine, Kalender & Koordination',      icon: '📅', minPaket: 'SOLO',       paketLabel: 'Ab SOLO',       paketColor: '#C9A84C' },
  'Der Verkaeufer':    { rolle: 'Lead-Generierung & Angebote',           icon: '🎯', minPaket: 'START',      paketLabel: 'Ab START',      paketColor: '#4f94e8' },
  'Der Moderator':     { rolle: 'Community & Social Media',              icon: '💬', minPaket: 'START',      paketLabel: 'Ab START',      paketColor: '#4f94e8' },
  'Der Personalchef':  { rolle: 'HR, Recruiting & Onboarding',           icon: '👥', minPaket: 'START',      paketLabel: 'Ab START',      paketColor: '#4f94e8' },
  'Der Schmied':       { rolle: 'Prozess-Automatisierung & Workflows',   icon: '⚙️', minPaket: 'PRO',        paketLabel: 'Ab PRO',        paketColor: '#a855f7' },
  'Der Regisseur':     { rolle: 'Projekte & Kampagnen',                  icon: '🎬', minPaket: 'PRO',        paketLabel: 'Ab PRO',        paketColor: '#a855f7' },
  'Der Forscher':      { rolle: 'Recherche & Marktanalyse',              icon: '🔍', minPaket: 'PRO',        paketLabel: 'Ab PRO',        paketColor: '#a855f7' },
  'Der Uebersetzer':   { rolle: 'Übersetzung & Lokalisierung',           icon: '🌐', minPaket: 'PRO',        paketLabel: 'Ab PRO',        paketColor: '#a855f7' },
  'Der Einkaeufer':    { rolle: 'Einkauf, Bestellungen & Lieferanten',   icon: '🛒', minPaket: 'PRO',        paketLabel: 'Ab PRO',        paketColor: '#a855f7' },
  'Der Analyst':       { rolle: 'Datenanalyse & Reports',                icon: '📊', minPaket: 'PRO',        paketLabel: 'Ab PRO',        paketColor: '#a855f7' },
  'Der Stratege':      { rolle: 'Strategie & Unternehmensentwicklung',   icon: '♟️', minPaket: 'BUSINESS',   paketLabel: 'Ab BUSINESS',   paketColor: '#22c55e' },
  'Der Jurist':        { rolle: 'Verträge, Recht & Compliance',          icon: '⚖️', minPaket: 'PRO',        paketLabel: 'Ab PRO',        paketColor: '#a855f7' },
  'Der Trainer':       { rolle: 'Mitarbeiterschulung & Wissenstransfer', icon: '🎓', minPaket: 'BUSINESS',   paketLabel: 'Ab BUSINESS',   paketColor: '#22c55e' },
  'Der Techniker':     { rolle: 'IT, Systeme & Technik',                 icon: '🔧', minPaket: 'BUSINESS',   paketLabel: 'Ab BUSINESS',   paketColor: '#22c55e' },
  'Der Sicherheitschef': { rolle: 'Datensicherheit & Risikomanagement',  icon: '🔒', minPaket: 'BUSINESS',   paketLabel: 'Ab BUSINESS',   paketColor: '#22c55e' },
  'Der Integrator':    { rolle: 'Systemintegration & Schnittstellen',    icon: '🔗', minPaket: 'BUSINESS',   paketLabel: 'Ab BUSINESS',   paketColor: '#22c55e' },
  'Der Netzwerker':    { rolle: 'Partnerschaften & Netzwerkpflege',      icon: '🤝', minPaket: 'BUSINESS',   paketLabel: 'Ab BUSINESS',   paketColor: '#22c55e' },
  'Der Botschafter':   { rolle: 'Marke, PR & Öffentlichkeitsarbeit',     icon: '📢', minPaket: 'ENTERPRISE', paketLabel: 'Ab ENTERPRISE', paketColor: '#ef4444' },
  'Der Spaeher':       { rolle: 'Wettbewerb & Marktbeobachtung',         icon: '🕵️', minPaket: 'ENTERPRISE', paketLabel: 'Ab ENTERPRISE', paketColor: '#ef4444' },
  'Der Assistent':     { rolle: 'Persönlicher KI-Assistent',             icon: '🤖', minPaket: 'SOLO',       paketLabel: 'Ab SOLO',       paketColor: '#C9A84C' },
}

function getAgentMeta(name: string): AgentMeta | undefined {
  const normalized = normalizeStr(name)
  const key = Object.keys(AGENT_META_RAW).find(k => normalizeStr(k) === normalized)
  return key ? AGENT_META_RAW[key] : undefined
}

const PAKET_ORDER: Record<string, number> = { SOLO: 1, START: 2, PRO: 3, BUSINESS: 4, ENTERPRISE: 5 }
const PAKET_MAX_PROZENT: Record<string, number> = { SOLO: 30, START: 45, PRO: 60, BUSINESS: 75, ENTERPRISE: 92 }

const PAKETE = [
  { key: 'SOLO',       label: 'SOLO Beta',  agenten: 2,  multiplikator: 0.6, color: '#C9A84C' },
  { key: 'START',      label: 'START',      agenten: 8,  multiplikator: 1.0, color: '#4f94e8' },
  { key: 'PRO',        label: 'PRO',        agenten: 16, multiplikator: 1.8, color: '#a855f7' },
  { key: 'BUSINESS',   label: 'BUSINESS',   agenten: 20, multiplikator: 2.6, color: '#22c55e' },
  { key: 'ENTERPRISE', label: 'ENTERPRISE', agenten: 24, multiplikator: 3.5, color: '#ef4444' },
]

export default function BranchenPageClient({ slug }: { slug: string }) {
  const [selectedPaket, setSelectedPaket] = useState('PRO')
  const branche = getBrancheBySlug(slug)
  if (!branche) return null

  const paket = PAKETE.find(p => p.key === selectedPaket) || PAKETE[2]
  const stundenPaket = Math.round(branche.stundenProWoche.mittel * paket.multiplikator)
  const arbeitswochenJahr = Math.round(stundenPaket * 48 / 40)
  const maxProzent = PAKET_MAX_PROZENT[selectedPaket] ?? 60

  const agentenAll = [...branche.agenten].sort((a, b) =>
    (PAKET_ORDER[getAgentMeta(a)?.minPaket || 'PRO'] ?? 3) - (PAKET_ORDER[getAgentMeta(b)?.minPaket || 'PRO'] ?? 3)
  )
  const agentenVerfuegbar = agentenAll.filter(a =>
    (PAKET_ORDER[getAgentMeta(a)?.minPaket || 'PRO'] ?? 3) <= PAKET_ORDER[selectedPaket]
  )

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="bg-[#0A1628] pt-40 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="inline-block bg-[#C9A84C]/10 border border-[#C9A84C]/30 text-[#C9A84C] text-xs tracking-widest uppercase px-4 py-1 rounded-full mb-6">
            {branche.kategorie}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">{branche.name}</h1>
          <p className="text-white/60 text-lg max-w-2xl mb-10">{branche.beschreibung}</p>

          <div style={{ marginBottom: '32px' }}>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '12px' }}>
              Paket wählen — Zahlen passen sich an:
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PAKETE.map(p => (
                <button key={p.key} onClick={() => setSelectedPaket(p.key)} style={{
                  padding: '8px 16px', borderRadius: '999px',
                  border: `1px solid ${selectedPaket === p.key ? p.color : 'rgba(255,255,255,0.15)'}`,
                  background: selectedPaket === p.key ? `${p.color}22` : 'transparent',
                  color: selectedPaket === p.key ? p.color : 'rgba(255,255,255,0.5)',
                  fontSize: '13px', fontWeight: selectedPaket === p.key ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}>{p.label}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-12">
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">−{maxProzent} %</div>
              <div className="text-white/40 text-xs mt-1">Verwaltungsaufwand mit {paket.label}</div>
            </div>
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">{stundenPaket} Std/Woche</div>
              <div className="text-white/40 text-xs mt-1">gespart mit {paket.label}</div>
            </div>
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">{arbeitswochenJahr} Wochen</div>
              <div className="text-white/40 text-xs mt-1">Arbeitszeit gespart / Jahr</div>
            </div>
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">{paket.agenten} Agenten</div>
              <div className="text-white/40 text-xs mt-1">im {paket.label}-Paket verfügbar</div>
            </div>
          </div>
        </div>
      </section>

      <div className="h-1 bg-gradient-to-r from-[#C9A84C] to-transparent" />

      <section className="max-w-5xl mx-auto px-6 py-16">

        <div className="bg-[#0A1628] rounded-2xl aspect-video flex items-center justify-center mb-16 relative overflow-hidden">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#C9A84C] flex items-center justify-center">
              <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[18px] border-l-[#0A1628] ml-1" />
            </div>
            <span className="text-white/50 text-sm tracking-wide">Vorher / Nachher — {branche.name}</span>
          </div>
          <div className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded">2:30</div>
        </div>

        {/* WAS WIR AUTOMATISIEREN */}
        <div className="mb-16">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,7 6,11 12,3" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 className="text-[#0A1628] font-semibold text-sm uppercase tracking-wider">Was wir für Sie automatisieren</h2>
            </div>
            <ul className="space-y-3 mb-5">
              {branche.ergebnisse.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-500 text-sm">
                  <span className="w-1 h-1 rounded-full bg-[#C9A84C] mt-2 flex-shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-400 border-t border-gray-100 pt-4">
              Das sind nur die Top-4. Insgesamt stehen Ihnen bis zu <strong className="text-[#0A1628]">128 Automatisierungen</strong> zur Verfügung — wählbar nach Ihrem Bedarf.
            </p>
          </div>
        </div>

        {/* AGENTEN-RANKING */}
        <div className="mb-16">
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-2xl font-bold text-[#0A1628]">Empfohlene KI-Agenten</h2>
            <span style={{ fontSize: '11px', fontWeight: 700, color: paket.color, background: `${paket.color}15`, border: `1px solid ${paket.color}40`, borderRadius: '999px', padding: '3px 12px' }}>
              {agentenVerfuegbar.length} sofort aktiv
            </span>
          </div>
          <p className="text-gray-500 text-sm mb-8 max-w-2xl">
            Speziell für <strong>{branche.name}</strong> optimiert. Im {paket.label}-Paket sind {agentenVerfuegbar.length} der {agentenAll.length} empfohlenen Agenten sofort aktiv.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {agentenAll.map((agentName, i) => {
              const meta = getAgentMeta(agentName)
              const isVerfuegbar = (PAKET_ORDER[meta?.minPaket || 'PRO'] ?? 3) <= PAKET_ORDER[selectedPaket]
              const isTop = i < 2 && isVerfuegbar
              return (
                <div key={agentName} style={{
                  background: isTop ? '#0A1628' : isVerfuegbar ? '#FFFFFF' : '#f8fafc',
                  border: isTop ? '1px solid rgba(201,168,76,0.4)' : isVerfuegbar ? '1px solid #e5e7eb' : '1px solid #f0f0f0',
                  borderRadius: '16px', padding: '20px 24px',
                  display: 'flex', alignItems: 'flex-start', gap: '16px',
                  position: 'relative', opacity: isVerfuegbar ? 1 : 0.5,
                }}>
                  {isTop && <div style={{ position: 'absolute', top: '12px', right: '16px', fontSize: '10px', fontWeight: 700, color: '#C9A84C', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '999px', padding: '2px 8px' }}>TOP</div>}
                  {!isVerfuegbar && <div style={{ position: 'absolute', top: '12px', right: '16px', fontSize: '10px', color: '#9ca3af' }}>🔒 {meta?.paketLabel}</div>}
                  <div style={{ width: '44px', height: '44px', flexShrink: 0, background: isTop ? 'rgba(201,168,76,0.15)' : isVerfuegbar ? '#f8fafc' : '#f0f0f0', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                    {meta?.icon || '🤖'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: isTop ? '#FFFFFF' : isVerfuegbar ? '#0A1628' : '#9ca3af' }}>{agentName}</span>
                      {isVerfuegbar && meta && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: isTop ? '#0A1628' : meta.paketColor, background: isTop ? meta.paketColor : `${meta.paketColor}22`, border: `1px solid ${meta.paketColor}55`, borderRadius: '999px', padding: '2px 8px' }}>
                          {meta.paketLabel}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: isTop ? 'rgba(255,255,255,0.55)' : isVerfuegbar ? '#6b7280' : '#c0c0c0', margin: 0, lineHeight: 1.5 }}>
                      {meta?.rolle || 'KI-Assistent'}
                    </p>
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: isTop ? 'rgba(255,255,255,0.3)' : '#d1d5db', flexShrink: 0, paddingTop: '2px' }}>#{i + 1}</div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: '24px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0A1628' }}>
                {agentenAll.length - agentenVerfuegbar.length > 0
                  ? `${agentenAll.length - agentenVerfuegbar.length} weitere Agenten mit Upgrade freischaltbar`
                  : `Alle ${agentenAll.length} Agenten im ${paket.label}-Paket aktiv`}
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                Mit jedem höheren Paket schaltest du mehr Agenten frei — bis zu allen 24 Agenten und 128 Automationen im ENTERPRISE-Paket.
              </p>
            </div>
            <a href="/#preise" style={{ padding: '10px 24px', background: '#C9A84C', color: '#0A1628', borderRadius: '8px', fontWeight: 700, fontSize: '13px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Paket wählen →
            </a>
          </div>
        </div>

        <ROIRechner stundenProWoche={branche.stundenProWoche} selectedPaket={selectedPaket} />

        <div className="bg-[#0A1628] rounded-2xl p-10 flex flex-col md:flex-row items-center justify-between gap-6 mt-16">
          <div>
            <h3 className="text-white text-xl font-bold mb-2">Bereit für KI-Automatisierung?</h3>
            <p className="text-white/50 text-sm">Werde Früh-Kunde — exklusive Konditionen sichern.</p>
          </div>
          <a href="/#preise" className="bg-[#C9A84C] hover:bg-[#b8923e] text-white font-semibold px-8 py-3 rounded-full transition-colors whitespace-nowrap">
            Jetzt starten →
          </a>
        </div>

      </section>
      <Footer />
    </main>
  )
}
