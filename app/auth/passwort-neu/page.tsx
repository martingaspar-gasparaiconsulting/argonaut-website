'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'

export default function PasswortNeuPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [bereit, setBereit] = useState(false)

  const supabase = createClient()

  // Recovery-Session prüfen: der Klick auf den Mail-Link loggt den Nutzer
  // temporär ein (PASSWORD_RECOVERY). Erst dann darf das Passwort gesetzt werden.
  useEffect(() => {
    let aktiv = true
    supabase.auth.getSession().then(({ data }) => {
      if (aktiv && data.session) setBereit(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setBereit(true)
    })
    return () => { aktiv = false; sub.subscription.unsubscribe() }
  }, [supabase])

  async function handleSetzen(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Das Passwort muss mindestens 8 Zeichen lang sein.'); return }
    if (password !== password2) { setError('Die beiden Passwörter stimmen nicht überein.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Passwort konnte nicht gesetzt werden. Bitte fordere den Link erneut an.')
      setLoading(false)
      return
    }
    setDone(true)
    setLoading(false)
    setTimeout(() => { router.push('/dashboard'); router.refresh() }, 1800)
  }

  const inputStyle = {
    width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#FFFFFF',
    fontSize: '15px', outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color 0.2s',
  }
  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)',
    letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '8px',
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0A1628', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'var(--font-dm-sans), sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(201,168,76,0.25)', borderRadius: '16px', padding: '48px 40px', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '36px' }}>
          <Image src="/images/ARGONAUT_HELM_SPARTAN .png" alt="ARGONAUT" width={56} height={56}
            style={{ objectFit: 'contain', marginBottom: '14px' }} />
          <span style={{
            fontSize: '22px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '0.2em',
            textTransform: 'uppercase', fontFamily: 'var(--font-syne), sans-serif',
          }}>ARGONAUT</span>
          <span style={{ marginTop: '6px', fontSize: '13px', color: '#C9A84C', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Neues Passwort
          </span>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(76,175,125,0.15)',
              border: '1px solid rgba(76,175,125,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: '24px', color: '#4CAF7D',
            }}>✓</div>
            <p style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>Passwort geändert</p>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', lineHeight: 1.6 }}>
              Du wirst angemeldet und weitergeleitet …
            </p>
          </div>
        ) : !bereit ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>Link wird geprüft …</p>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', lineHeight: 1.6 }}>
              Falls hier nichts passiert, ist der Link abgelaufen. Fordere über „Passwort vergessen?" einen neuen an.
            </p>
            <a href="/auth/login" style={{ display: 'inline-block', marginTop: '20px', color: '#C9A84C', fontSize: '14px', textDecoration: 'none' }}>
              Zur Anmeldung
            </a>
          </div>
        ) : (
          <form onSubmit={handleSetzen}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Neues Passwort</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required placeholder="mindestens 8 Zeichen" style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Passwort wiederholen</label>
              <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)}
                required placeholder="••••••••" style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }} />
            </div>

            {error && (
              <div style={{
                marginBottom: '16px', padding: '10px 14px', background: 'rgba(220,53,69,0.15)',
                border: '1px solid rgba(220,53,69,0.35)', borderRadius: '8px', color: '#ff8b96', fontSize: '13px',
              }}>{error}</div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '14px', background: loading ? 'rgba(201,168,76,0.5)' : '#C9A84C',
              color: '#0A1628', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
            }}>
              {loading ? 'Bitte warten...' : 'Passwort speichern'}
            </button>
          </form>
        )}
      </div>

      <a href="/auth/login" style={{
        marginTop: '24px', color: 'rgba(255,255,255,0.3)', fontSize: '13px', textDecoration: 'none', letterSpacing: '0.04em', transition: 'color 0.2s',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#C9A84C' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}>
        Zur Anmeldung
      </a>
    </div>
  )
}
