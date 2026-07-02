import UpgradePopup from '@/components/UpgradePopup'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import OverusePopup from '@/components/OverusePopup'

// ============================================================
// ARGONAUT OS · DASHBOARD-UEBERSICHT (/dashboard)
// Header + Navigation + PULS-Chat liegen zentral im Layout.
// Onboarding/Verbrauch/Abo sind nach /dashboard/start ausgelagert.
// Diese Seite wird zum Live-Command-Center (KPI-Kacheln + Feed
// folgen im naechsten Schritt). Aktuell: Begruessung + Kennzahlen.
// ============================================================

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
    .select('full_name, plan, status, automations_count, agents_count, last_activity, next_billing, onboarding_completed, onboarding_data')
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
  const onboardingCompleted = profile?.onboarding_completed ?? false
  const onboardingData = profile?.onboarding_data ? (typeof profile.onboarding_data === 'string' ? JSON.parse(profile.onboarding_data) : profile.onboarding_data) : null
  const hasApiKeys = onboardingData?.toolEntries?.some((e: {apiKey?: string}) => e.apiKey && e.apiKey.length > 0) ?? false
  const setupFertig = onboardingCompleted && hasApiKeys

  const stats = [
    { label: 'Aktive Automatisierungen', value: profile?.automations_count ?? 0 },
    { label: 'Agenten', value: profile?.agents_count ?? 8 },
    { label: 'Letzte Aktivität', value: formatDate(profile?.last_activity) },
    { label: 'Nächste Abrechnung', value: formatDate(profile?.next_billing) },
  ]

  // Zentrale Layout-Breite: waechst auf grossen Bildschirmen mit (1200 -> 1600).
  const SHELL_MAX = '1600px'
  const SHELL_PAD = 'clamp(16px, 3vw, 48px)'

  return (
    <>
      <UpgradePopup />
      <OverusePopup kiUsed={kiUsed} kiLimit={kiLimit} currentPaket={rawPaket} userEmail={user.email || ''} />
      <main style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `clamp(32px, 4vw, 56px) ${SHELL_PAD} 80px` }}>

        <section style={{ marginBottom: '40px' }}>
          <p style={{ fontSize: '13px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>Mitgliederbereich</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
            <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 46px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Willkommen zurück, {displayName}</h1>
            <span style={{ padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: planColor, background: `${planColor}22`, border: `1px solid ${planColor}55` }}>{planLabel}</span>
            <span style={{ padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.color}55`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusCfg.color, display: 'inline-block', flexShrink: 0 }} />
              {statusCfg.label}
            </span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.1vw, 18px)', margin: 0 }}>Ihr Live-Überblick — was in Ihrem Betrieb gerade passiert.</p>
        </section>

        {/* SETUP-STREIFEN — erscheint nur, solange die Einrichtung nicht abgeschlossen ist */}
        {!setupFertig && (
          <section style={{ marginBottom: '32px' }}>
            <a href="/dashboard/start" style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.04) 100%)',
                border: '1px solid rgba(201,168,76,0.4)',
                borderRadius: '14px',
                padding: '16px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '22px' }}>⚡</span>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 800, color: '#C9A84C' }}>Einrichtung abschließen</p>
                    <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>Onboarding & Zugangsdaten vervollständigen — dann ist Ihr System startklar.</p>
                  </div>
                </div>
                <div style={{ padding: '8px 20px', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.4)', color: '#C9A84C', borderRadius: '8px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                  Zur Einrichtung →
                </div>
              </div>
            </a>
          </section>
        )}

        {/* Automatisierungen Banner */}
        <section style={{ marginBottom: '32px' }}>
          <a href="/dashboard/automatisierungen" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: '14px',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '28px' }}>⚡</span>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>Automatisierungs-Bibliothek</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>128 Workflows in 15 Clustern — sehen Sie wie viele Stunden Sie sparen.</p>
                </div>
              </div>
              <div style={{ padding: '8px 20px', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: '#C9A84C', borderRadius: '8px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                Bibliothek öffnen →
              </div>
            </div>
          </a>
        </section>

        <section style={{ marginBottom: '52px' }}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '24px 20px' }}>
                <p style={{ fontSize: 'clamp(24px, 2.6vw, 40px)', fontWeight: 900, margin: '0 0 6px', color: '#FFFFFF', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>{stat.value}</p>
                <p style={{ fontSize: 'clamp(13px, 1vw, 16px)', color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.4 }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

      </main>
    </>
  )
}
