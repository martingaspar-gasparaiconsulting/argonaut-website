import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from './LogoutButton'
import CustomersTable, { type Customer, type Plan } from './CustomersTable'

// ─── MRR config ───────────────────────────────────────────────────────────────

const MRR_BY_PLAN: Record<string, number> = {
  SOLO:  1799,
  START: 3000,
  PRO:   4000,
  BUS:   6000,
  ENT:   9000,
  BASIS: 1500,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

function oneWeekAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const supabase = await createClient()

  // ── Auth guard (double protection alongside proxy.ts) ──
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') redirect('/dashboard')

  // ── Fetch all customers ────────────────────────────────
  const { data: rawCustomers } = await supabase
    .from('customers')
    .select('id, name, email, paket, status, created_at')
    .order('created_at', { ascending: false })

  const customers: Customer[] = (rawCustomers ?? []) as Customer[]

  // ── Compute summary stats ──────────────────────────────
  const totalKunden  = customers.length
  const activeKunden = customers.filter((c) => c.status === 'active').length

  const mrr = customers
    .filter((c) => c.status === 'aktiv' || c.status === 'active') && c.paket && c.paket in MRR_BY_PLAN)
    .reduce((sum, c) => sum + MRR_BY_PLAN[c.paket as string], 0)

  const weekCutoff   = oneWeekAgo()
  const neueWoche    = customers.filter((c) => c.created_at && c.created_at >= weekCutoff).length

  const summaryStats = [
    {
      label: 'Gesamt Kunden',
      value: totalKunden.toString(),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="9"  cy="7"  r="4" stroke="#C9A84C" strokeWidth="1.8"/>
          <circle cx="17" cy="9"  r="3" stroke="#C9A84C" strokeWidth="1.8" opacity="0.6"/>
          <path d="M2 21C2 18.24 5.13 16 9 16C12.87 16 16 18.24 16 21" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M17 15C19.21 15 21 16.57 21 18.5" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" opacity="0.6"/>
        </svg>
      ),
      sub: 'Registrierte Profile',
    },
    {
      label: 'Aktive Kunden',
      value: activeKunden.toString(),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L15 9H22L16.5 13.5L18.5 21L12 17L5.5 21L7.5 13.5L2 9H9L12 2Z" fill="#C9A84C" opacity="0.9"/>
        </svg>
      ),
      sub: `${totalKunden > 0 ? Math.round((activeKunden / totalKunden) * 100) : 0}% Aktivierungsrate`,
    },
    {
      label: 'MRR',
      value: formatEur(mrr),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#C9A84C" strokeWidth="1.8"/>
          <path d="M12 6V8M12 16V18" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M9 10C9 8.9 10.34 8 12 8C13.66 8 15 8.9 15 10C15 11.1 13.66 12 12 12C10.34 12 9 12.9 9 14C9 15.1 10.34 16 12 16C13.66 16 15 15.1 15 14" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
      sub: 'Monatlich wiederkehrend',
    },
    {
      label: 'Neue diese Woche',
      value: neueWoche.toString(),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="17" rx="2" stroke="#C9A84C" strokeWidth="1.8"/>
          <path d="M3 9H21" stroke="#C9A84C" strokeWidth="1.8"/>
          <path d="M8 2V6M16 2V6" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M12 13V17M10 15H14" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
      sub: 'Letzte 7 Tage',
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>

      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: '1px solid rgba(201,168,76,0.15)',
        background: 'rgba(10,22,40,0.97)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 24px',
          height: '68px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}>
          {/* Logo + breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
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
              <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>Admin</span>
                <span style={{ color: '#C9A84C' }}> · Kundenverwaltung</span>
              </span>
            </div>
          </div>

          {/* Right: badge + email + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              padding: '3px 10px',
              background: 'rgba(201,168,76,0.12)',
              border: '1px solid rgba(201,168,76,0.35)',
              borderRadius: '999px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#C9A84C',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              Admin
            </span>
            <span style={{
              fontSize: '13px',
              color: 'rgba(255,255,255,0.35)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '160px',
              display: 'none',  /* hidden on very small screens */
            }}
              className="sm:block"
            >
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Page title */}
        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '12px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>
            Verwaltung
          </p>
          <h1 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-syne), sans-serif' }}>
            Kundenverwaltung
          </h1>
        </div>

        {/* Summary stat cards */}
        <section style={{ marginBottom: '48px' }}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryStats.map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(201,168,76,0.15)',
                  borderRadius: '14px',
                  padding: '24px 20px',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
      
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'rgba(201,168,76,0.1)',
                  border: '1px solid rgba(201,168,76,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}>
                  {stat.icon}
                </div>
                <p style={{
                  fontSize: 'clamp(18px, 2.5vw, 26px)',
                  fontWeight: 900,
                  margin: '0 0 4px',
                  fontFamily: 'var(--font-syne), sans-serif',
                  letterSpacing: stat.label === 'MRR' ? '-0.01em' : '0',
                }}>
                  {stat.value}
                </p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>
                  {stat.label}
                </p>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                  {stat.sub}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Customers table */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, fontFamily: 'var(--font-syne), sans-serif' }}>
              Alle Kunden
            </h2>
            <span style={{
              padding: '2px 10px',
              background: 'rgba(201,168,76,0.1)',
              border: '1px solid rgba(201,168,76,0.25)',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#C9A84C',
              letterSpacing: '0.08em',
            }}>
              {totalKunden}
            </span>
          </div>

          <CustomersTable customers={customers} />
        </section>

      </main>
    </div>
  )
}
