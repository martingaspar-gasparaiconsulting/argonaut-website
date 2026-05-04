import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from '../LogoutButton'
import UpgradeForm from './UpgradeForm'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function UpgradePage() {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, plan')
    .eq('id', user.id)
    .single()

  const userName   = (profile?.full_name as string | null) || user.email?.split('@')[0] || 'Nutzer'
  const userEmail  = (profile?.email    as string | null) || user.email || ''
  const currentPlan = (profile?.plan    as string | null) || 'starter'

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#fff' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom:    '1px solid rgba(201,168,76,0.15)',
        background:      'rgba(10,22,40,0.95)',
        backdropFilter:  'blur(12px)',
        position:        'sticky',
        top:             0,
        zIndex:          100,
      }}>
        <div style={{
          maxWidth:       '1200px',
          margin:         '0 auto',
          padding:        '0 24px',
          height:         '68px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            '16px',
        }}>
          {/* Logo */}
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', color: 'inherit', flexShrink: 0 }}>
            <Image
              src="/images/ARGONAUT_HELM_SPARTAN .png"
              alt="ARGONAUT"
              width={36}
              height={36}
              style={{ objectFit: 'contain' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.15em', fontFamily: 'var(--font-syne), sans-serif' }}>
                ARGONAUT
              </span>
              <span style={{ fontSize: '10px', color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>
                Plan upgraden
              </span>
            </div>
          </Link>

          {/* Right: email + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              fontSize:      '13px',
              color:         'rgba(255,255,255,0.4)',
              overflow:      'hidden',
              textOverflow:  'ellipsis',
              whiteSpace:    'nowrap',
              maxWidth:      '180px',
            }}>
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '52px 24px 100px' }}>

        {/* Breadcrumb */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '36px', fontSize: '13px' }}>
          <Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={undefined}
          >
            Dashboard
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>›</span>
          <span style={{ color: '#C9A84C', fontWeight: 600 }}>Plan upgraden</span>
        </nav>

        {/* Page title */}
        <section style={{ marginBottom: '44px' }}>
          <p style={{ fontSize: '12px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 10px' }}>
            Abonnement
          </p>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 900, margin: '0 0 12px', fontFamily: 'var(--font-syne), sans-serif', lineHeight: 1.1 }}>
            Ihren Plan upgraden
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.4)', margin: 0, maxWidth: '560px', lineHeight: 1.65 }}>
            Wählen Sie Ihr Paket. Alle Kunden zahlen die Basis-Automatisierungen (1.500 € netto/Monat) plus das gewählte Paket.
            Geben Sie anschließend Ihre Bankverbindung für die monatliche SEPA-Lastschrift an.
          </p>
        </section>

        {/* Card */}
        <div style={{
          background:   'rgba(255,255,255,0.03)',
          border:       '1px solid rgba(201,168,76,0.14)',
          borderRadius: '18px',
          padding:      'clamp(24px, 4vw, 48px)',
        }}>
          <UpgradeForm
            userEmail={userEmail}
            userName={userName}
            currentPlan={currentPlan}
          />
        </div>

        {/* Trust strip */}
        <div style={{
          display:        'flex',
          flexWrap:       'wrap',
          justifyContent: 'center',
          gap:            '28px',
          marginTop:      '40px',
        }}>
          {[
            { icon: '🔒', text: 'SSL-verschlüsselt' },
            { icon: '⚡', text: 'Sofortige Aktivierung' },
            { icon: '📄', text: 'Konforme Rechnung' },
            { icon: '✋', text: 'Kündigung jederzeit' },
          ].map(item => (
            <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
              <span>{item.icon}</span>
              {item.text}
            </div>
          ))}
        </div>

      </main>
    </div>
  )
}
