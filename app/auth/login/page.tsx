'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'magic'>('login')
  const [magicSent, setMagicSent] = useState(false)

  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-Mail oder Passwort falsch.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setMagicSent(true)
    setLoading(false)
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A1628',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'var(--font-dm-sans), sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(201,168,76,0.25)',
        borderRadius: '16px',
        padding: '48px 40px',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '36px' }}>
          <Image
            src="/images/ARGONAUT_HELM_SPARTAN .png"
            alt="ARGONAUT"
            width={56}
            height={56}
            style={{ objectFit: 'contain', marginBottom: '14px' }}
          />
          <span style={{
            fontSize: '22px', fontWeight: 900, color: '#FFFFFF',
            letterSpacing: '0.2em', textTransform: 'uppercase',
            fontFamily: 'var(--font-syne), sans-serif',
          }}>ARGONAUT</span>
          <span style={{
            marginTop: '6px', fontSize: '13px', color: '#C9A84C',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>Mitgliederbereich</span>
        </div>

        {magicSent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: '24px',
            }}>✉</div>
            <p style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>
              E-Mail gesendet
            </p>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', lineHeight: 1.6 }}>
              Prüfen Sie Ihr Postfach und klicken Sie auf den Link, um sich anzumelden.
            </p>
            <button onClick={() => setMagicSent(false)}
              style={{ marginTop: '24px', color: '#C9A84C', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
              Zurück
            </button>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', background: 'rgba(255,255,255,0.06)',
              borderRadius: '8px', padding: '3px', marginBottom: '28px',
            }}>
              {(['login', 'magic'] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setError(null) }} style={{
                  flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  letterSpacing: '0.04em', transition: 'all 0.2s',
                  background: mode === m ? '#C9A84C' : 'transparent',
                  color: mode === m ? '#0A1628' : 'rgba(255,255,255,0.5)',
                }}>
                  {m === 'login' ? 'Passwort' : 'Magic Link'}
                </button>
              ))}
            </div>

            <form onSubmit={mode === 'login' ? handleLogin : handleMagicLink}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block', fontSize: '12px', fontWeight: 600,
                  color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
                  textTransform: 'uppercase', marginBottom: '8px',
                }}>E-Mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required placeholder="name@unternehmen.de" style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                />
              </div>

              {mode === 'login' && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block', fontSize: '12px', fontWeight: 600,
                    color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
                    textTransform: 'uppercase', marginBottom: '8px',
                  }}>Passwort</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    required placeholder="••••••••" style={inputStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                  />
                </div>
              )}

              {mode === 'magic' && <div style={{ marginBottom: '24px' }} />}

              {error && (
                <div style={{
                  marginBottom: '16px', padding: '10px 14px',
                  background: 'rgba(220,53,69,0.15)', border: '1px solid rgba(220,53,69,0.35)',
                  borderRadius: '8px', color: '#ff8b96', fontSize: '13px',
                }}>{error}</div>
              )}

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '14px',
                background: loading ? 'rgba(201,168,76,0.5)' : '#C9A84C',
                color: '#0A1628', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}>
                {loading ? 'Bitte warten...' : mode === 'login' ? 'Anmelden' : 'Link senden'}
              </button>
            </form>
          </>
        )}
      </div>

      <a href="/" style={{
        marginTop: '24px', color: 'rgba(255,255,255,0.3)', fontSize: '13px',
        textDecoration: 'none', letterSpacing: '0.04em', transition: 'color 0.2s',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#C9A84C' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}>
        Zurück zur Website
      </a>
    </div>
  )
}