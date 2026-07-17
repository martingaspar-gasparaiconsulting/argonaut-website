'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/AnfrageFormular.tsx
// Demo-/Anfrage-Formular (Abschnitt id="demo"). Sendet an die eigene Route
// /api/website-anfrage (die an n8n weiterleitet → eigenes CRM + Bestätigungsmail).
// Neu: Kontaktwunsch (Anruf/E-Mail), Wunschtermin, AGB, Branchen-Kontext.
// Self-contained (unabhängig von den Start-Seiten-Klassen), auf jeder Seite nutzbar.
// ============================================================================

import { useState } from 'react'
import TerminPicker from './TerminPicker'

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: '10px',
  border: '1px solid rgba(122,163,179,0.22)', background: 'rgba(234,241,246,0.04)',
  color: '#EAF1F6', fontSize: '.95rem', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'var(--font-dm-sans), sans-serif',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '.82rem', color: '#8fa9b6', margin: '0 0 6px' }

export default function AnfrageFormular({ branche }: { branche?: string }) {
  const [f, setF] = useState({
    name: '', unternehmen: '', email: '', telefon: '', mitarbeiter: '',
    kontaktwunsch: '', wunschtermin: '', wunschterminKey: '', nachricht: '', privacy: false, agb: false,
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))

  const maMap: Record<string, number> = { '1 (Einzelunternehmer)': 1, '2–9': 9, '10–24': 24, '25–99': 99, '100–499': 499, '500+': 500 }
  const maNum = maMap[f.mitarbeiter]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.name.trim()) { setError('Bitte Ihren Namen angeben.'); return }
    if (!f.email.trim() && !f.telefon.trim()) { setError('Bitte E-Mail oder Telefon angeben.'); return }
    if (!f.kontaktwunsch) { setError('Bitte wählen: Anruf oder E-Mail.'); return }
    if (!f.privacy) { setError('Bitte der Datenschutzerklärung zustimmen.'); return }
    if (!f.agb) { setError('Bitte den AGB zustimmen.'); return }
    setStatus('sending')
    try {
      const res = await fetch('/api/website-anfrage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, branche: branche ?? null }),
      })
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}))
        setStatus('idle')
        setError(j.error || 'Der gewählte Termin ist gerade vergeben. Bitte einen anderen wählen.')
        setF((p) => ({ ...p, wunschtermin: '', wunschterminKey: '' }))
        setReload((n) => n + 1)
        return
      }
      if (!res.ok) throw new Error()
      setStatus('success')
    } catch {
      setStatus('error')
      setError('Senden fehlgeschlagen. Bitte später erneut versuchen oder uns direkt kontaktieren.')
    }
  }

  const kontaktLabel = f.kontaktwunsch === 'Anruf' ? 'telefonisch' : 'per E-Mail'

  const pill = (val: string, label: string) => (
    <button type="button" onClick={() => set('kontaktwunsch', val)}
      style={{
        flex: 1, padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '.9rem', fontWeight: 600,
        border: `1px solid ${f.kontaktwunsch === val ? 'rgba(201,168,76,0.7)' : 'rgba(122,163,179,0.22)'}`,
        background: f.kontaktwunsch === val ? 'rgba(201,168,76,0.12)' : 'rgba(234,241,246,0.04)',
        color: f.kontaktwunsch === val ? GOLD : '#c4d3db',
      }}>{label}</button>
  )

  return (
    <section id="demo" style={{ padding: '30px 0 60px', textAlign: 'center' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 24px' }}>
        <h2 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', lineHeight: 1.25, margin: '0 0 1rem' }}>
          {branche ? <>Jetzt <span style={{ color: GOLD }}>{branche}</span> mit ARGONAUT starten.</> : <>Sehen Sie ARGONAUT <span style={{ color: GOLD }}>in Aktion</span>.</>}
        </h2>
        <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '48ch', margin: '0 auto', lineHeight: 1.55 }}>
          Kostenlose, unverbindliche Demo — persönlich an Ihrem Betrieb. Wir melden uns innerhalb von 24 Stunden.
        </p>

        {status === 'success' ? (
          <div style={{ marginTop: '32px', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '16px', padding: '40px 24px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.6rem' }} aria-hidden="true">🔱</div>
            <p style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: '1.4rem', color: '#EAF1F6', margin: '0 0 8px' }}>Anfrage erhalten!</p>
            <p style={{ color: '#b9cdd6', margin: 0 }}>
              Danke, {f.name.split(' ')[0] || 'und bis gleich'}. Wir melden uns persönlich {kontaktLabel} — wie gewünscht. Eine Bestätigung ist unterwegs in Ihr Postfach.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: '32px', background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '18px', padding: '28px', textAlign: 'left' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input style={inputStyle} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Vor- und Nachname" />
              </div>
              <div>
                <label style={labelStyle}>Unternehmen</label>
                <input style={inputStyle} value={f.unternehmen} onChange={(e) => set('unternehmen', e.target.value)} placeholder="Firmenname" />
              </div>
              <div>
                <label style={labelStyle}>E-Mail</label>
                <input type="email" style={inputStyle} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@firma.de" />
              </div>
              <div>
                <label style={labelStyle}>Telefon</label>
                <input style={inputStyle} value={f.telefon} onChange={(e) => set('telefon', e.target.value)} placeholder="+49 …" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Mitarbeiterzahl</label>
                <select style={{ ...inputStyle, appearance: 'none', colorScheme: 'dark' }} value={f.mitarbeiter} onChange={(e) => set('mitarbeiter', e.target.value)}>
                  <option value="">Bitte wählen …</option>
                  <option>1 (Einzelunternehmer)</option>
                  <option>2–9</option>
                  <option>10–24</option>
                  <option>25–99</option>
                  <option>100–499</option>
                  <option>500+</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Wie sollen wir Sie kontaktieren? *</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {pill('Anruf', '📞 Anruf')}
                  {pill('E-Mail', '✉️ E-Mail')}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Wunschtermin (optional)</label>
                <TerminPicker key={reload} ma={maNum} value={f.wunschtermin} onChange={(v, k) => setF((p) => ({ ...p, wunschtermin: v, wunschterminKey: k }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nachricht</label>
                <textarea style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} value={f.nachricht} onChange={(e) => set('nachricht', e.target.value)} placeholder="Worum geht's? (optional)" />
              </div>
            </div>

            <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', margin: '16px 0 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.privacy} onChange={(e) => set('privacy', e.target.checked)} style={{ marginTop: '3px', accentColor: GOLD }} />
              <span style={{ fontSize: '.82rem', color: '#8fa9b6', lineHeight: 1.5 }}>
                Ich stimme zu, dass meine Angaben zur Bearbeitung meiner Anfrage verwendet werden. Details in der{' '}
                <a href="/datenschutz" style={{ color: TEAL }}>Datenschutzerklärung</a>. *
              </span>
            </label>
            <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', margin: '10px 0 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.agb} onChange={(e) => set('agb', e.target.checked)} style={{ marginTop: '3px', accentColor: GOLD }} />
              <span style={{ fontSize: '.82rem', color: '#8fa9b6', lineHeight: 1.5 }}>
                Ich akzeptiere die <a href="/agb" style={{ color: TEAL }}>AGB</a>. *
              </span>
            </label>

            {error && <p style={{ color: '#f0a3a3', fontSize: '.85rem', margin: '14px 0 0' }}>{error}</p>}

            <button type="submit" disabled={status === 'sending'} style={{ width: '100%', marginTop: '18px', background: GOLD, color: NAVY, fontWeight: 700, fontSize: '1rem', padding: '15px', borderRadius: '10px', border: 'none', cursor: status === 'sending' ? 'default' : 'pointer', opacity: status === 'sending' ? 0.7 : 1 }}>
              {status === 'sending' ? 'Wird gesendet …' : 'Anfrage senden →'}
            </button>
            <p style={{ fontSize: '.78rem', color: '#7f97a4', textAlign: 'center', margin: '12px 0 0' }}>
              Kostenlos & unverbindlich · Antwort in 24 Stunden
            </p>
          </form>
        )}
      </div>
    </section>
  )
}
