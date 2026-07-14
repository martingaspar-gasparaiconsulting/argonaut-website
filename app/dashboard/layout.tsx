import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from './LogoutButton'
import DashboardNav from './DashboardNav'
import DashboardChat from './DashboardChat'
import Glocke from './Glocke'
// ============================================================
// ARGONAUT OS · ZENTRALES DASHBOARD-LAYOUT
// Header (Logo + Konto + Glocke + Abmelden) + Navigation + PULS-Chat
// erscheinen ab hier auf ALLEN /dashboard-Unterseiten.
// Vorher lag der Header nur in app/dashboard/page.tsx -> Nav
// war auf Unterseiten unsichtbar. Jetzt zentral (additiv).
//
// P47 (14.07.26): Benachrichtigungs-Glocke rechts neben der E-Mail ergänzt.
// ============================================================
// Zentrale Layout-Breite: waechst auf grossen Bildschirmen mit (1200 -> 1600).
const SHELL_MAX = '1600px'
const SHELL_PAD = 'clamp(16px, 3vw, 48px)'
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')
  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <header style={{ borderBottom: '1px solid rgba(201,168,76,0.15)', background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)', position: 'relative', top: 0, zIndex: 100 }}>
        {/* Zeile 1: Logo links, Konto + Glocke + Abmelden rechts */}
        <div style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `0 ${SHELL_PAD}`, minHeight: '72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, textDecoration: 'none', color: 'inherit' }}>
            <Image src="/images/ARGONAUT_HELM_SPARTAN .png" alt="ARGONAUT" width={40} height={40} style={{ height: 40, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontSize: 'clamp(16px, 1.4vw, 22px)', fontWeight: 900, letterSpacing: '0.15em', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>ARGONAUT</span>
              <span style={{ fontSize: 'clamp(10px, 0.8vw, 12px)', color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>Dashboard</span>
            </div>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <span style={{ fontSize: 'clamp(12px, 0.9vw, 14px)', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>{user.email}</span>
            <Glocke />
            <LogoutButton />
          </div>
        </div>
        {/* Zeile 2: Navigation ueber volle Breite */}
        <div style={{ borderTop: '1px solid rgba(201,168,76,0.08)', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `10px ${SHELL_PAD}` }}>
            <DashboardNav />
          </div>
        </div>
      </header>
      {/* Inhalt der jeweiligen Unterseite */}
      {children}
      {/* PULS · KI-Assistent — zentral, schwebt auf allen Seiten unten rechts */}
      <DashboardChat />
    </div>
  )
}
