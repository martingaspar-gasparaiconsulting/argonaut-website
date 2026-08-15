'use client'

// ============================================================================
// ARGONAUT OS · LogoutButton
//
// 15.08.26: Beim Abmelden wird jetzt zusätzlich der Seiten-Cache des
// Service-Workers geleert. Grund: Der Service-Worker legt besuchte
// Dashboard-Seiten ab, damit sie offline verfügbar bleiben. Auf einem
// geteilten Gerät — Werkstatt-Tablet, Baustellen-Handy — hätte der nächste
// Nutzer im Offline-Fall sonst die Seiten des vorherigen sehen können.
// Der Aufruf ist "best effort": ohne Service-Worker meldet sich der Nutzer
// genau wie vorher ab.
// ============================================================================

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/** Bittet den Service-Worker, den Seiten-Cache zu leeren. Wartet kurz, aber nie lange. */
async function cacheLeeren(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sw = reg?.active
    if (!sw) return
    await new Promise<void>((fertig) => {
      const uhr = setTimeout(fertig, 800)      // nie länger als 0,8 s aufhalten
      const antwort = (e: MessageEvent) => {
        if ((e.data as { typ?: string } | null)?.typ === 'cache-geleert') {
          clearTimeout(uhr)
          navigator.serviceWorker.removeEventListener('message', antwort)
          fertig()
        }
      }
      navigator.serviceWorker.addEventListener('message', antwort)
      sw.postMessage({ typ: 'cache-leeren' })
    })
  } catch {
    /* Abmelden hat Vorrang — ein Cache-Problem darf es nie verhindern. */
  }
}

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    await cacheLeeren()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: '8px 20px',
        background: 'transparent',
        border: '1px solid rgba(201,168,76,0.4)',
        borderRadius: '8px',
        color: '#C9A84C',
        fontSize: 'clamp(13px, 1.13vw, 18px)',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(201,168,76,0.1)'
        e.currentTarget.style.borderColor = '#C9A84C'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)'
      }}
    >
      Abmelden
    </button>
  )
}
