import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import OnboardingProgress from '../OnboardingProgress'

// ============================================================
// ARGONAUT OS · EINRICHTUNG & VERWALTUNG (/dashboard/start)
// Ausgelagert von der Uebersicht: Onboarding-Banner + Fortschritt,
// KI-Call-Verbrauch und Abo-Verwaltung. Damit wird /dashboard
// frei fuer das Live-Command-Center.
// ============================================================

const KI_CALL_LIMITS: Record<string, number> = {
  solo: 5000, start: 15000, pro: 35000, bus: 75000, ent: 150000,
  starter: 15000, professional: 35000, business: 75000, enterprise: 150000,
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

export default async function StartPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, onboarding_completed, onboarding_data')
    .eq('id', user.id)
    .single()

  const { data: customerData } = await supabase
    .from('customers')
    .select('paket')
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

  const rawPaket = customerData?.paket?.toLowerCase() || profile?.plan || 'starter'
  const kiLimit = usageData?.ki_calls_limit ?? KI_CALL_LIMITS[rawPaket] ?? 15000
  const kiUsed = usageData?.ki_calls_used ?? 0
  const onboardingCompleted = profile?.onboarding_completed ?? false
  const onboardingData = profile?.onboarding_data ? (typeof profile.onboarding_data === 'string' ? JSON.parse(profile.onboarding_data) : profile.onboarding_data) : null
  const hasApiKeys = onboardingData?.toolEntries?.some((e: { apiKey?: string }) => e.apiKey && e.apiKey.length > 0) ?? false

  const SHELL_MAX = '1600px'
  const SHELL_PAD = 'clamp(16px, 3vw, 48px)'

  return (
    <main style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `clamp(32px, 4vw, 56px) ${SHELL_PAD} 80px` }}>

      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '13px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>Einrichtung & Verwaltung</p>
        <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 46px)', fontWeight: 900, margin: '0 0 10px', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>System einrichten</h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.1vw, 18px)', margin: 0 }}>Onboarding, Verbrauch und Abo — alles zum Start und zur laufenden Verwaltung an einem Ort.</p>
      </section>

      {/* ONBOARDING BANNER */}
      <section style={{ marginBottom: '32px' }}>
        <a href="/dashboard/onboarding" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.05) 100%)',
            border: '2px solid rgba(201,168,76,0.5)',
            borderRadius: '14px',
            padding: '24px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: '0 0 32px rgba(201,168,76,0.1)',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'rgba(201,168,76,0.2)', border: '2px solid rgba(201,168,76,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0,
              }}>⚡</div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 800, color: '#C9A84C' }}>
                  System einrichten — Erstgespräch in 24h
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>
                  Teilen Sie uns Ihre Tools und Zugangsdaten mit — wir richten alles automatisch ein.
                </p>
              </div>
            </div>
            <div style={{
              padding: '12px 28px', background: '#C9A84C', color: '#0A1628',
              borderRadius: '8px', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap',
            }}>
              Jetzt einrichten →
            </div>
          </div>
        </a>
      </section>

      {/* ONBOARDING PROGRESS */}
      <OnboardingProgress onboardingCompleted={onboardingCompleted} hasApiKeys={hasApiKeys} />

      {/* KI-Call Fortschrittsbalken */}
      <section style={{ marginBottom: '32px' }}>
        <KiCallBar used={kiUsed} limit={kiLimit} />
      </section>

      {/* Stripe Kundenportal */}
      <section>
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

    </main>
  )
}
