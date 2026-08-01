import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from './LogoutButton'
import DashboardNav from './DashboardNav'
import DashboardChat from './DashboardChat'
import Glocke from './Glocke'
import SwRegister from './_components/SwRegister'
import { demoStatus, demoRestText } from '@/lib/demo'
import DemoReadonlyGuard from './_components/DemoReadonlyGuard'

// ============================================================
// ARGONAUT OS · ZENTRALES DASHBOARD-LAYOUT
// Header (Logo + Konto + Glocke + Abmelden) + Navigation + PULS-Chat
// erscheinen ab hier auf ALLEN /dashboard-Unterseiten.
//
// P47 (14.07.26): Benachrichtigungs-Glocke rechts neben der E-Mail ergänzt.
//
// Q6c (15.07.26): Header spürbar groesser + Wortmarke "ARGONAUT OS".
//   Statt der E-Mail steht jetzt der NAME des Nutzers — gleiche Quelle und
//   gleiche Reihenfolge wie im Live-Cockpit (app/dashboard/page.tsx):
//     1. mitarbeiter.vorname + nachname  (eingeladener Mitarbeiter)
//     2. profiles.full_name              (Chef/Inhaber)
//     3. Teil vor dem @ der E-Mail       (Notnagel)
//   Die E-Mail bleibt als Tooltip (title) erhalten — nichts geht verloren.
//   Alle Groessen als clamp(min, vw, max): waechst am Desktop mit, bleibt am
//   Handy lesbar, ohne Media-Query (Inline-Styles koennen keine).
//
// TODO (vorgemerkt 15.07.26): neues Logo. Der Spartaner-Helm bleibt vorerst,
//   soll aber durch eine Konzern-Wortmarke/Signet ersetzt werden.
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

  // Anzeige-Name holen — beide Quellen parallel, damit kein Wasserfall entsteht.
  // maybeSingle() wirft nicht, wenn nichts da ist -> Fehler koennen den Header
  // nie kaputt machen (Notnagel greift dann).
  const [profilRes, mitarbeiterRes] = await Promise.all([
    supabase.from('profiles').select('full_name, firma_name, demo, demo_ablauf').eq('id', user.id).maybeSingle(),
    supabase.from('mitarbeiter').select('vorname, nachname').eq('auth_user_id', user.id).maybeSingle(),
  ])

  const maName = [mitarbeiterRes.data?.vorname, mitarbeiterRes.data?.nachname]
    .filter(Boolean)
    .join(' ')
    .trim()

  const anzeigeName =
    maName || profilRes.data?.full_name || user.email?.split('@')[0] || 'Nutzer'

  // Firmenname des Inhabers für den Header ("ARGONAUT OS für <Firma>").
  const firmaName = ((profilRes.data as { firma_name?: string | null } | null)?.firma_name || '').trim()

  // Demo-Konto-Status (Punkt 26): steuert das Banner. profilRes kann demo-Felder
  // erst nach dem SQL-Rollout liefern — vorher ist demo schlicht false.
  const demoInfo = demoStatus(
    (profilRes.data as { demo?: boolean } | null)?.demo,
    (profilRes.data as { demo_ablauf?: string | null } | null)?.demo_ablauf,
    new Date().toISOString(),
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <header style={{ borderBottom: '1px solid rgba(201,168,76,0.15)', background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)', position: 'relative', top: 0, zIndex: 100 }}>
        {/* Zeile 1: Logo links, Name + Glocke + Abmelden rechts */}
        <div style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `0 ${SHELL_PAD}`, minHeight: 'clamp(76px, 6vw, 96px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1vw, 16px)', flexShrink: 0, textDecoration: 'none', color: 'inherit' }}>
            <Image
              src="/images/ARGONAUT_HELM_SPARTAN .png"
              alt="ARGONAUT"
              width={56}
              height={56}
              style={{ height: 'clamp(40px, 3.4vw, 56px)', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
            />
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '10px', rowGap: '2px', lineHeight: 1.1 }}>
              <span style={{ fontSize: 'clamp(20px, 2vw, 32px)', fontWeight: 900, letterSpacing: '0.14em', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>
                ARGONAUT OS
              </span>
              {firmaName
                ? <span style={{ fontSize: 'clamp(13px, 1.1vw, 19px)', color: '#C9A84C', fontWeight: 600, letterSpacing: '0.01em' }}>für {firmaName}</span>
                : <span style={{ fontSize: 'clamp(11px, 0.85vw, 14px)', color: '#C9A84C', letterSpacing: '0.22em', textTransform: 'uppercase' }}>Dashboard</span>}
            </div>
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 1vw, 16px)', flexShrink: 0 }}>
            <span
              title={user.email ?? undefined}
              style={{
                fontSize: 'clamp(15px, 1.25vw, 21px)',
                fontWeight: 700,
                color: 'rgba(255,255,255,0.88)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 'clamp(120px, 22vw, 320px)',
              }}
            >
              {anzeigeName}
            </span>
            <Glocke />
            <LogoutButton />
          </div>
        </div>

        {/* Zeile 2: Navigation ueber volle Breite */}
        <div style={{ borderTop: '1px solid rgba(201,168,76,0.08)', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `12px ${SHELL_PAD}` }}>
            <DashboardNav />
          </div>
        </div>
      </header>

      {/* Demo-Modus-Banner (Punkt 26): Countdown bzw. Read-only-Hinweis */}
      {demoInfo.istDemo && (
        <div
          style={{
            background: demoInfo.abgelaufen ? 'rgba(224,102,102,0.14)' : 'rgba(201,168,76,0.14)',
            borderBottom: `1px solid ${demoInfo.abgelaufen ? 'rgba(224,102,102,0.5)' : 'rgba(201,168,76,0.5)'}`,
          }}
        >
          <div style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `10px ${SHELL_PAD}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: 'clamp(13px, 1vw, 15px)' }}>
            <span style={{ fontWeight: 800, color: demoInfo.abgelaufen ? '#E0A24C' : '#C9A84C', whiteSpace: 'nowrap' }}>
              {demoInfo.abgelaufen ? '🔒 Demo abgelaufen' : `🧪 ${demoRestText(demoInfo)}`}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>
              {demoInfo.abgelaufen
                ? 'Du kannst alles ansehen, aber nichts mehr ändern. Sichere dir deinen ARGONAUT mit einem Termin.'
                : 'Du testest ARGONAUT im Demo-Modus — danach bleibt alles sichtbar, zum Weiterarbeiten vereinbare einen Termin.'}
            </span>
            <span style={{ flex: 1 }} />
            <a
              href="mailto:info@argonaut-os.com?subject=Termin%20ARGONAUT%20OS"
              style={{ color: '#00e5ff', fontWeight: 700, textDecoration: 'none', border: '1px solid rgba(0,229,255,0.4)', borderRadius: '8px', padding: '6px 12px', whiteSpace: 'nowrap' }}
            >
              Termin vereinbaren ›
            </a>
          </div>
        </div>
      )}

      {/* Inhalt der jeweiligen Unterseite */}
      {children}

      {/* PULS · KI-Assistent — zentral, schwebt auf allen Seiten unten rechts */}
      <DashboardChat />

      {/* Service-Worker für Offline-Grundfähigkeit (rendert nichts) */}
      <SwRegister />

      {/* Read-only-Sperre fuer abgelaufene Demo-Konten (Punkt 26b) */}
      <DemoReadonlyGuard readonly={demoInfo.abgelaufen} />
    </div>
  )
}
