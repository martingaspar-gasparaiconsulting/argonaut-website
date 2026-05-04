'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
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
        fontSize: '13px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap' as const,
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
