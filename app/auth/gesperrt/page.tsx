'use client'

// ============================================================================
// ARGONAUT OS · app/auth/gesperrt/page.tsx — Zugang gesperrt (Punkt 11)
//
// Hierher schicken app/dashboard/layout.tsx und app/auth/callback einen Nutzer,
// der in churned_customers steht. Die Seite liegt bewusst NICHT unter
// /dashboard: dort wuerde das Layout erneut sperren und endlos umleiten.
//
// Beim Oeffnen wird die Sitzung beendet. Sonst bliebe der Nutzer angemeldet
// und landete bei jedem Aufruf wieder hier - und die Anmeldeseite waere fuer
// ihn nicht mehr erreichbar, um sich mit einem anderen Konto anzumelden.
//
// Bewusst OHNE Preisangabe: Wer gesperrt ist, soll Kontakt aufnehmen koennen,
// ohne dass hier eine Zahl steht, die veraltet.
// ============================================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Dreizack from '@/components/Dreizack'

export default function GesperrtPage() {
  const [abgemeldet, setAbgemeldet] = useState(false)

  useEffect(() => {
    let aktiv = true
    createClient()
      .auth.signOut()
      .catch(() => { /* Abmelden ist hier nur Aufraeumen - die Sperre greift ohnehin im Dashboard */ })
      .finally(() => { if (aktiv) setAbgemeldet(true) })
    return () => { aktiv = false }
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: '#0A1628', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
      fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF',
    }}>
      <div style={{
        width: '100%', maxWidth: '460px', background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(201,168,76,0.25)', borderRadius: '16px', padding: '44px 36px',
        textAlign: 'center',
      }}>
        <Dreizack hoehe={52} style={{ marginBottom: 18 }} />
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 14px' }}>Ihr Zugang ist gesperrt</h1>
        <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', margin: '0 0 22px' }}>
          Ihr Vertrag für ARGONAUT OS ist beendet. Wenn Sie ARGONAUT wieder nutzen möchten
          oder glauben, dass es sich um einen Irrtum handelt, schreiben Sie uns bitte.
        </p>
        <a
          href="mailto:info@argonaut-os.com?subject=Zugang%20ARGONAUT%20OS"
          style={{
            display: 'inline-block', background: '#C9A84C', color: '#0A1628', fontWeight: 800,
            textDecoration: 'none', borderRadius: '10px', padding: '12px 20px', fontSize: '15px',
          }}
        >
          info@argonaut-os.com
        </a>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '22px 0 0' }}>
          {abgemeldet ? (
            <>Sie wurden abgemeldet. <a href="/auth/login" style={{ color: '#00e5ff' }}>Mit einem anderen Konto anmelden</a></>
          ) : 'Sie werden abgemeldet …'}
        </p>
      </div>
    </div>
  )
}
