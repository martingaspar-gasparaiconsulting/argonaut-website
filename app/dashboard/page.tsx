import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from './LogoutButton'
import AgentCard from './AgentCard'

type Plan = 'starter' | 'professional' | 'business' | 'enterprise'
type Status = 'active' | 'inactive' | 'trial'

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  business: 'Business',
  enterprise: 'Enterprise',
  solo: 'SOLO Beta',
  start: 'START',
  pro: 'PRO',
  bus: 'BUSINESS',
  ent: 'ENTERPRISE',
  basis: 'BASIS',
  unbekannt: 'Unbekannt',
}

const PLAN_COLORS: Record<string, string> = {
  starter: '#6b7280',
  professional: '#C9A84C',
  business: '#4f94e8',
  enterprise: '#a855f7',
  solo: '#C9A84C',
  start: '#C9A84C',
  pro: '#4f94e8',
  bus: '#4f94e8',
  ent: '#a855f7',
  basis: '#6b7280',
  unbekannt: '#6b7280',
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  active:   { label: 'Aktiv',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
  inactive: { label: 'Inaktiv',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  trial:    { label: 'Testphase', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
}

const AGENTS = [
  {
    name: 'Der Architekt',
    role: 'Strategie & Planung',
    desc: 'Plant und strukturiert komplexe Automatisierungsvorhaben von Grund auf.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 21V19C3 17.9 3.9 17 5 17H19C20.1 17 21 17.9 21 19V21" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/><path d="M12 3L20 8V13H4V8L12 3Z" stroke="#C9A84C" strokeWidth="1.8" strokeLinejoin="round"/><rect x="9" y="13" width="6" height="4" fill="#C9A84C" opacity="0.4"/></svg>,
  },
  {
    name: 'Der Schmied',
    role: 'Workflow-Entwicklung',
    desc: 'Baut und verfeinert automatisierte Prozesse nach Ihren Anforderungen.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3L17.7 9.3L7 20H4V17L14.7 6.3Z" stroke="#C9A84C" strokeWidth="1.8" strokeLinejoin="round"/><path d="M16 4L20 8" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  },
  {
    name: 'Der Wächter',
    role: 'Sicherheit & Compliance',
    desc: 'Überwacht Systemintegrität und regelt Zugriffsrechte kontinuierlich.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6V12C4 16.4 7.4 20.5 12 22C16.6 20.5 20 16.4 20 12V6L12 2Z" stroke="#C9A84C" strokeWidth="1.8" strokeLinejoin="round"/><path d="M9 12L11 14L15 10" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    name: 'Der Chronist',
    role: 'Dokumentation & Reporting',
    desc: 'Protokolliert alle Aktivitäten und erstellt präzise Berichte.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" stroke="#C9A84C" strokeWidth="1.8"/><path d="M8 7H16M8 11H16M8 15H12" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  },
  {
    name: 'Der Schärfer',
    role: 'Optimierung & Feintuning',
    desc: 'Verbessert kontinuierlich die Performance Ihrer Workflows.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#C9A84C" strokeWidth="1.8"/><path d="M12 7V12L15 15" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    name: 'Der Bote',
    role: 'Kommunikation & Benachrichtigungen',
    desc: 'Verwaltet ausgehende Kommunikation, Mails und System-Alerts.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#C9A84C" strokeWidth="1.8" strokeLinejoin="round"/><path d="M22 6L12 13L2 6" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  },
  {
    name: 'Der Empfänger',
    role: 'Eingehende Daten & Leads',
    desc: 'Verarbeitet eingehende Daten, qualifiziert Leads und priorisiert Anfragen.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 3V15M12 15L8 11M12 15L16 11" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 17V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V17" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  },
  {
    name: 'Der Sammler',
    role: 'Datenerfassung & Analyse',
    desc: 'Sammelt und analysiert relevante Daten aus sämtlichen Quellen.',
    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="6" rx="8" ry="3" stroke="#C9A84C" strokeWidth="1.8"/><path d="M4 6V12C4 13.66 7.58 15 12 15C16.42 15 20 13.66 20 12V6" stroke="#C9A84C" strokeWidth="1.8"/><path d="M4 12V18C4 19.66 7.58 21 12 21C16.42 21 20 19.66 20 18V12" stroke="#C9A84C" strokeWidth="1.8"/></svg>,
  },
]

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, plan, status, automations_count, agents_count, last_activity, next_billing')
    .eq('id', user.id)
    .single()

  const { data: customerData } = await supabase
    .from('customers')
    .select('paket, status')
    .eq('email', user.email)
    .single()

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Nutzer'
  const rawPaket = customerData?.paket?.toLowerCase() || profile?.plan || 'starter'
  const plan = (rawPaket as Plan)
  const status = ((profile?.status as Status) || 'active')
  const planLabel = PLAN_LABELS[plan] ?? plan
  const planColor = PLAN_COLORS[plan] ?? '#6b7280'
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active

  const stats = [
    { label: 'Aktive Automatisierungen', value: profile?.automations_count ?? 0 },
    { label: 'Agenten', value: profile?.agents_count ?? 8 },
    { label: 'Letzte Aktivität', value: formatDate(profile?.last_activity) },
    { label: 'Nächste Abrechnung', value: formatDate(profile?.next_billing) },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>

      <header style={{ borderBottom: '1px solid rgba(201,168,76,0.15)', background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <Image src="/images/ARGONAUT_HELM_SPARTAN .png" alt="ARGONAUT" width={36} height={36} style={{ objectFit: 'contain' }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.15em', fontFamily: 'var(--font-syne), sans-serif' }}>ARGONAUT</span>
              <span style={{ fontSize: '10px', color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>Dashboard</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px 80px' }}>

        <section style={{ marginBottom: '40px' }}>
          <p style={{ fontSize: '13px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>Mitgliederbereich</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
            <h1 style={{ fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-syne), sans-serif' }}>Willkommen zurück, {displayName}</h1>
            <span style={{ padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: planColor, background: `${planColor}22`, border: `1px solid ${planColor}55` }}>{planLabel}</span>
            <span style={{ padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.color}55`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusCfg.color, display: 'inline-block', flexShrink: 0 }} />
              {statusCfg.label}
            </span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '15px', margin: 0 }}>Hier sehen Sie eine Übersicht Ihrer aktiven KI-Agenten und Automatisierungen.</p>
        </section>

        <section style={{ marginBottom: '52px' }}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '24px 20px' }}>
                <p style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 900, margin: '0 0 6px', color: '#FFFFFF', fontFamily: 'var(--font-syne), sans-serif' }}>{stat.value}</p>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.4 }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-syne), sans-serif' }}>Meine Agenten</h2>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#C9A84C', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '999px', padding: '2px 10px' }}>8 AKTIV</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {AGENTS.map((agent) => (
              <AgentCard key={agent.name} name={agent.name} role={agent.role} desc={agent.desc} icon={agent.icon} />
            ))}
          </div>
        </section>

      </main>
    </div>
  )
}