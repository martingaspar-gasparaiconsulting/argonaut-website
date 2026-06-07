import { getBrancheBySlug, getAllBrancheSlugs } from '@/lib/branchen'
import { notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ROIRechner from '@/components/ROIRechner'

export async function generateStaticParams() {
  const slugs = getAllBrancheSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const branche = getBrancheBySlug(slug)
  if (!branche) return {}
  return {
    title: `${branche.name} | ARGONAUT OS`,
    description: branche.beschreibung,
  }
}

const AGENT_META: Record<string, { rolle: string; icon: string; minPaket: string; paketLabel: string; paketColor: string }> = {
  'Der Empfänger':    { rolle: 'Kunden-Onboarding & Erstkontakt',     icon: '📥', minPaket: 'SOLO',     paketLabel: 'Ab SOLO',     paketColor: '#C9A84C' },
  'Der Buchhalter':   { rolle: 'Finanzen, Rechnungen & Buchhaltung',   icon: '🧾', minPaket: 'SOLO',     paketLabel: 'Ab SOLO',     paketColor: '#C9A84C' },
  'Der Schreiber':    { rolle: 'Content, Texte & Kommunikation',       icon: '✍️', minPaket: 'SOLO',     paketLabel: 'Ab SOLO',     paketColor: '#C9A84C' },
  'Der Wächter':      { rolle: 'Sicherheit & Compliance',              icon: '🛡️', minPaket: 'START',    paketLabel: 'Ab START',    paketColor: '#4f94e8' },
  'Der Planer':       { rolle: 'Termine, Kalender & Koordination',     icon: '📅', minPaket: 'SOLO',     paketLabel: 'Ab SOLO',     paketColor: '#C9A84C' },
  'Der Verkäufer':    { rolle: 'Lead-Generierung & Angebote',          icon: '🎯', minPaket: 'START',    paketLabel: 'Ab START',    paketColor: '#4f94e8' },
  'Der Moderator':    { rolle: 'Community & Social Media',             icon: '💬', minPaket: 'START',    paketLabel: 'Ab START',    paketColor: '#4f94e8' },
  'Der Personalchef': { rolle: 'HR, Recruiting & Onboarding',          icon: '👥', minPaket: 'START',    paketLabel: 'Ab START',    paketColor: '#4f94e8' },
  'Der Schmied':      { rolle: 'Prozess-Automatisierung & Workflows',  icon: '⚙️', minPaket: 'PRO',      paketLabel: 'Ab PRO',      paketColor: '#a855f7' },
  'Der Regisseur':    { rolle: 'Projekte & Kampagnen',                 icon: '🎬', minPaket: 'PRO',      paketLabel: 'Ab PRO',      paketColor: '#a855f7' },
  'Der Forscher':     { rolle: 'Recherche & Marktanalyse',             icon: '🔍', minPaket: 'PRO',      paketLabel: 'Ab PRO',      paketColor: '#a855f7' },
  'Der Übersetzer':   { rolle: 'Übersetzung & Lokalisierung',          icon: '🌐', minPaket: 'PRO',      paketLabel: 'Ab PRO',      paketColor: '#a855f7' },
  'Der Einkäufer':    { rolle: 'Einkauf, Bestellungen & Lieferanten',  icon: '🛒', minPaket: 'PRO',      paketLabel: 'Ab PRO',      paketColor: '#a855f7' },
  'Der Analyst':      { rolle: 'Datenanalyse & Reports',               icon: '📊', minPaket: 'PRO',      paketLabel: 'Ab PRO',      paketColor: '#a855f7' },
  'Der Stratege':     { rolle: 'Strategie & Unternehmensentwicklung',  icon: '♟️', minPaket: 'BUSINESS', paketLabel: 'Ab BUSINESS', paketColor: '#22c55e' },
  'Der Jurist':       { rolle: 'Verträge, Recht & Compliance',         icon: '⚖️', minPaket: 'PRO',      paketLabel: 'Ab PRO',      paketColor: '#a855f7' },
  'Der Trainer':      { rolle: 'Mitarbeiterschulung & Wissenstransfer', icon: '🎓', minPaket: 'BUSINESS', paketLabel: 'Ab BUSINESS', paketColor: '#22c55e' },
  'Der Techniker':    { rolle: 'IT, Systeme & Technik',                icon: '🔧', minPaket: 'BUSINESS', paketLabel: 'Ab BUSINESS', paketColor: '#22c55e' },
  'Der Sicherheitschef': { rolle: 'Datensicherheit & Risikomanagement', icon: '🔒', minPaket: 'BUSINESS', paketLabel: 'Ab BUSINESS', paketColor: '#22c55e' },
  'Der Integrator':   { rolle: 'Systemintegration & Schnittstellen',   icon: '🔗', minPaket: 'BUSINESS', paketLabel: 'Ab BUSINESS', paketColor: '#22c55e' },
  'Der Netzwerker':   { rolle: 'Partnerschaften & Netzwerkpflege',     icon: '🤝', minPaket: 'BUSINESS', paketLabel: 'Ab BUSINESS', paketColor: '#22c55e' },
  'Der Botschafter':  { rolle: 'Marke, PR & Öffentlichkeitsarbeit',    icon: '📢', minPaket: 'ENTERPRISE', paketLabel: 'Ab ENTERPRISE', paketColor: '#ef4444' },
  'Der Späher':       { rolle: 'Wettbewerb & Marktbeobachtung',        icon: '🕵️', minPaket: 'ENTERPRISE', paketLabel: 'Ab ENTERPRISE', paketColor: '#ef4444' },
  'Der Assistent':    { rolle: 'Persönlicher KI-Assistent',            icon: '🤖', minPaket: 'SOLO',     paketLabel: 'Ab SOLO',     paketColor: '#C9A84C' },
}

const PAKET_ORDER: Record<string, number> = {
  SOLO: 1, START: 2, PRO: 3, BUSINESS: 4, ENTERPRISE: 5,
}

export default async function BranchenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const branche = getBrancheBySlug(slug)
  if (!branche) notFound()

  const stundenMittel = branche.stundenProWoche.mittel

  const agentenSorted = [...branche.agenten].sort((a, b) => {
    const aLevel = PAKET_ORDER[AGENT_META[a]?.minPaket || 'PRO'] ?? 3
    const bLevel = PAKET_ORDER[AGENT_META[b]?.minPaket || 'PRO'] ?? 3
    return aLevel - bLevel
  })

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      {/* HERO */}
      <section className="bg-[#0A1628] pt-40 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="inline-block bg-[#C9A84C]/10 border border-[#C9A84C]/30 text-[#C9A84C] text-xs tracking-widest uppercase px-4 py-1 rounded-full mb-6">
            {branche.kategorie}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">{branche.name}</h1>
          <p className="text-white/60 text-lg max-w-2xl mb-10">{branche.beschreibung}</p>
          <div className="flex flex-wrap gap-12">
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">−{Math.round(stundenMittel * 100 / 40)} %</div>
              <div className="text-white/40 text-xs mt-1">Verwaltungsaufwand</div>
            </div>
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">{stundenMittel} Std/Woche</div>
              <div className="text-white/40 text-xs mt-1">durchschnittlich gespart</div>
            </div>
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">ab Tag 1</div>
              <div className="text-white/40 text-xs mt-1">messbare Ergebnisse</div>
            </div>
          </div>
        </div>
      </section>

      <div className="h-1 bg-gradient-to-r from-[#C9A84C] to-transparent" />

      <section className="max-w-5xl mx-auto px-6 py-16">

        {/* VIDEO PLACEHOLDER */}
        <div className="bg-[#0A1628] rounded-2xl aspect-video flex items-center justify-center mb-16 relative overflow-hidden">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#C9A84C] flex items-center justify-center">
              <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[18px] border-l-[#0A1628] ml-1" />
            </div>
            <span className="text-white/50 text-sm tracking-wide">Vorher / Nachher — {branche.name}</span>
          </div>
          <div className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded">2:30</div>
        </div>

        {/* SCHMERZEN / ERGEBNISSE */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="2" x2="2" y2="12" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              <h2 className="text-[#0A1628] font-semibold text-sm uppercase tracking-wider">Schmerzpunkte heute</h2>
            </div>
            <ul className="space-y-3">
              {branche.schmerzen.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-500 text-sm">
                  <span className="w-1 h-1 rounded-full bg-[#C9A84C] mt-2 flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,7 6,11 12,3" stroke="#639922" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 className="text-[#0A1628] font-semibold text-sm uppercase tracking-wider">Mit ARGONAUT OS</h2>
            </div>
            <ul className="space-y-3">
              {branche.ergebnisse.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-500 text-sm">
                  <span className="w-1 h-1 rounded-full bg-[#C9A84C] mt-2 flex-shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* AGENTEN-RANKING */}
        <div className="mb-16">
          <div className="flex items-baseline gap-3 mb-8">
            <h2 className="text-2xl font-bold text-[#0A1628]">Empfohlene KI-Agenten</h2>
            <span className="text-xs font-bold tracking-widest text-[#C9A84C] bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-full px-3 py-1">
              {agentenSorted.length} AGENTEN
            </span>
          </div>
          <p className="text-gray-500 text-sm mb-8 max-w-2xl">
            Diese KI-Agenten sind speziell für <strong>{branche.name}</strong> optimiert — sortiert nach Priorität und Verfügbarkeit je Paket.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {agentenSorted.map((agentName, i) => {
              const meta = AGENT_META[agentName]
              const isTop = i < 2
              return (
                <div key={agentName} style={{
                  background: isTop ? '#0A1628' : '#FFFFFF',
                  border: isTop ? '1px solid rgba(201,168,76,0.4)' : '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  position: 'relative',
                }}>
                  {isTop && (
                    <div style={{
                      position: 'absolute', top: '12px', right: '16px',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                      color: '#C9A84C', background: 'rgba(201,168,76,0.15)',
                      border: '1px solid rgba(201,168,76,0.3)',
                      borderRadius: '999px', padding: '2px 8px',
                    }}>TOP</div>
                  )}
                  <div style={{
                    width: '44px', height: '44px', flexShrink: 0,
                    background: isTop ? 'rgba(201,168,76,0.15)' : '#f8fafc',
                    borderRadius: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px',
                  }}>
                    {meta?.icon || '🤖'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: isTop ? '#FFFFFF' : '#0A1628' }}>
                        {agentName}
                      </span>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                        color: isTop ? '#0A1628' : meta?.paketColor || '#C9A84C',
                        background: isTop ? meta?.paketColor || '#C9A84C' : `${meta?.paketColor || '#C9A84C'}22`,
                        border: `1px solid ${meta?.paketColor || '#C9A84C'}55`,
                        borderRadius: '999px', padding: '2px 8px',
                      }}>
                        {meta?.paketLabel || 'Ab SOLO'}
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', color: isTop ? 'rgba(255,255,255,0.55)' : '#6b7280', margin: 0, lineHeight: 1.5 }}>
                      {meta?.rolle || 'KI-Assistent'}
                    </p>
                  </div>
                  <div style={{
                    fontSize: '11px', fontWeight: 700,
                    color: isTop ? 'rgba(255,255,255,0.3)' : '#d1d5db',
                    flexShrink: 0, paddingTop: '2px',
                  }}>
                    #{i + 1}
                  </div>
                </div>
              )
            })}
          </div>

          {/* CTA unter Agenten */}
          <div style={{ marginTop: '24px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0A1628' }}>
                Alle {agentenSorted.length} Agenten freischalten
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                Ab SOLO Beta — 2 Agenten sofort verfügbar. Mehr Agenten mit höherem Paket.
              </p>
            </div>
            <a href="/#preise" style={{ padding: '10px 24px', background: '#C9A84C', color: '#0A1628', borderRadius: '8px', fontWeight: 700, fontSize: '13px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Paket wählen →
            </a>
          </div>
        </div>

        {/* ROI RECHNER */}
        <ROIRechner stundenProWoche={branche.stundenProWoche} />

        {/* CTA */}
        <div className="bg-[#0A1628] rounded-2xl p-10 flex flex-col md:flex-row items-center justify-between gap-6 mt-16">
          <div>
            <h3 className="text-white text-xl font-bold mb-2">Bereit für KI-Automatisierung?</h3>
            <p className="text-white/50 text-sm">Werde Früh-Kunde — exklusive Konditionen sichern.</p>
          </div>
          <a href="/#kontakt" className="bg-[#C9A84C] hover:bg-[#b8923e] text-white font-semibold px-8 py-3 rounded-full transition-colors whitespace-nowrap">
            Jetzt starten →
          </a>
        </div>

      </section>

      <Footer />
    </main>
  )
}
