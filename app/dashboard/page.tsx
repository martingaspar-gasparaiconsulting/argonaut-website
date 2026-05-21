import UpgradePopup from '@/components/UpgradePopup'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from './LogoutButton'
import AgentCard from './AgentCard'

type Plan = 'starter' | 'professional' | 'business' | 'enterprise'
type Status = 'active' | 'inactive' | 'trial'

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter', professional: 'Professional', business: 'Business', enterprise: 'Enterprise',
  solo: 'SOLO Beta', start: 'START', pro: 'PRO', bus: 'BUSINESS', ent: 'ENTERPRISE',
  basis: 'BASIS', unbekannt: 'Unbekannt',
}

const PLAN_COLORS: Record<string, string> = {
  starter: '#6b7280', professional: '#C9A84C', business: '#4f94e8', enterprise: '#a855f7',
  solo: '#C9A84C', start: '#C9A84C', pro: '#4f94e8', bus: '#4f94e8', ent: '#a855f7',
  basis: '#6b7280', unbekannt: '#6b7280',
}

const KI_CALL_LIMITS: Record<string, number> = {
  solo: 5000, start: 15000, pro: 35000, bus: 75000, ent: 150000,
  starter: 15000, professional: 35000, business: 75000, enterprise: 150000,
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  active:   { label: 'Aktiv',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
  inactive: { label: 'Inaktiv',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  trial:    { label: 'Testphase', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
}

const AGENTS = [
  { name: 'A1 Empfänger', role: 'Kunden-Onboarding', desc: 'Onboarded neue Kunden automatisch und beantwortet erste Fragen.', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 3V15M12 15L8 11M12 15L16 11" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 17V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V17" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg> },
  { name: 'A3 Wächter', role: 'Sicherheit & Compliance', desc: 'Überwacht alle laufenden Prozesse und meldet Abweichungen sofort.', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6V12C4 16.4 7.4 20.5 12 22C16.6 20.5 20 16.4 20 12V6L12 2Z" stroke="#C9A84C" strokeWidth="1.8" strokeLinejoin="round"/><path d="M9 12L11 14L15 10" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { name: 'A4 Buchhalter', role: 'Finanzen & Abrechnung', desc: 'Automatisiert Buchhaltung, Rechnungsstellung und Finanzreports.', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" stroke="#C9A84C" strokeWidth="1.8"/><path d="M8 7H16M8 11H16M8 15H12" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg> },
  { name: 'A5 Schreiber', role: 'Content & Texte', desc: 'Erstellt professionelle Inhalte, E-Mails und Marketingtexte.', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3L17.7 9.3L7 20H4V17L14.7 6.3Z" stroke="#C9A84C" strokeWidth="1.8" strokeLinejoin="round"/><path d="M16 4L20 8" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg> },
  { name: 'A6 Planer', role: 'Termine & Koordination', desc: 'Koordiniert Termine, Kalender und interne Aufgabenverteilung.', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#C9A84C" strokeWidth="1.8"/><path d="M16 2V6M8 2V6M3 10H21" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg> },
  { name: 'A7 Verkäufer', role: 'Lead-Generierung', desc: 'Generiert Leads, versendet Angebote und führt Follow-ups durch.', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 3H5L5.4 5M7 13H17L21 5H5.4M7 13L5.4 5M7 13L4.7 15.3C4.3 15.7 4.6 16.5 5.1 16.5H17M17 16.5C15.9 16.5 15 17.4 15 18.5S15.9 20.5 17 20.5S19 19.6 19 18.5S18.1 16.5 17 16.5ZM9 18.5C9 19.6 8.1 20.5 7 20.5S5 19.6 5 18.5S5.9 16.5 7 16.5S9 17.4 9 18.5Z" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { name: 'B3 Moderator', role: 'Community & Social', desc: 'Managed Community, beantwortet Kommentare und Social-Media-Anfragen.', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#C9A84C" strokeWidth="1.8" strokeLinejoin="round"/><path d="M22 6L12 13L2 6" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg> },
  { name: 'B4 Personalchef', role: 'HR & Recruiting', desc: 'Automatisiert Recruiting, Onboarding und HR-Prozesse.', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#C9A84C" strokeWidth="1.8"/><path d="M4 20C4 17.8 7.6 16 12 16C16.4 16 20 17.8 20 20" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg> },
]

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

function KiCallBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(Math.round((used / limit) * 100), 100)
  const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e'
  const label = pct >= 100 ? '⚠️ Limit erreicht' : pct >= 80 ? '⚠️ Fast erreicht' : 'Normal'
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '14px', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px' }}>KI-Calls diesen Monat</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{used.toLocaleString('de-DE')} von {limit.toLocaleString('de-DE')} verwendet</p>
        </div>
        <span style={{ fontSize: '12px', fontWeight: 700, color: barColor, background: `${barColor}22`, border: `1px solid ${barColor}55`, borderRadius: '999px', padding: '4px 12px' }}>
          {pct}% · {label}
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '999px', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
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
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { data: usageData } = await supabase
    .from('usage_tracking')
    .select('ki_calls_used, ki_calls_limit')
    .eq('user_id', user.id)
    .order('periode_start', { ascending: false })
    .limit(1)
    .single()

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Nutzer'
  const rawPaket = customerData?.paket?.toLowerCase() || profile?.plan || 'starter'
  const plan = (rawPaket as Plan)
  const status = ((profile?.status as Status) || 'active')
  const planLabel = PLAN_LABELS[plan] ?? plan
  const planColor = PLAN_COLORS[plan] ?? '#6b7280'
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active

  const kiLimit = usageData?.ki_calls_limit ?? KI_CALL_LIMITS[rawPaket] ?? 15000
  const kiUsed = usageData?.ki_calls_used ?? 0

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

      <>
      <UpgradePopup />
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

        {/* KI-Call Fortschrittsbalken */}
        <section style={{ marginBottom: '32px' }}>
          <KiCallBar used={kiUsed} limit={kiLimit} />
        </section>

        {/* Stripe Kundenportal */}
        <section style={{ marginBottom: '40px' }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '14px', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 6px 0' }}>Ihr Abonnement verwalten</h3>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Rechnungen, Zahlungsmethode und Kündigung — alles an einem Ort.</p>
            </div>
            <a href="https://billing.stripe.com/p/login/bpc_1TWAmTGFbovq8BEu7CipgZAd" target="_blank" rel="noopener noreferrer" style={{ padding: '10px 24px', background: '#D4A843', color: '#0D1B3E', borderRadius: '8px', fontWeight: 700, fontSize: '13px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Abo verwalten →
            </a>
          </div>
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
    </>
    </div>
  )
}