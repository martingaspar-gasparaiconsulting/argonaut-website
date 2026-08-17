'use client'

// ============================================================================
// ARGONAUT OS · app/testen/page.tsx — „7 Tage kostenlos testen"
// Andockpunkt für den zweiten Hero-Knopf (Umschalter-Modus 'beide').
// Schlanke Navy-Seite: kurze Anmeldung → landet über /api/website-anfrage im
// eigenen CRM (website_anfragen) + Bestätigungsmail. Markiert als
// angebot='7 Tage kostenlos testen', damit die Test-Leads klar erkennbar sind.
// WICHTIG (Nordstern): 7 Tage kostenlos, KEIN Zahlungsmittel, läuft automatisch
// aus — kein Auto-Abbuchen. Das echte Testkonto mit Ablauf-Sperre ist ein
// späterer, eigener Schritt; hier sammeln wir erst die Interessenten.
// ============================================================================

import { useState } from 'react'
import Link from 'next/link'
import Navbar from '../vorschau/_components/Navbar'
import Footer from '../vorschau/_components/Footer'

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

const VORTEILE = [
  ['🆓', '7 Tage komplett kostenlos', 'Voller Zugang zu ARGONAUT — ohne Kosten, ohne Risiko.'],
  ['💳', 'Kein Zahlungsmittel nötig', 'Keine Kreditkarte, keine Bankdaten. Wir buchen nichts ab.'],
  ['⏳', 'Läuft automatisch aus', 'Nach 7 Tagen endet der Test von selbst. Gefällt es, schalten wir gemeinsam frei.'],
]

export default function TestenPage() {
  const [f, setF] = useState({ name: '', unternehmen: '', email: '', telefon: '', branche: '', nachricht: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.name.trim()) { setError('Bitte Ihren Namen angeben.'); return }
    if (!f.email.trim()) { setError('Bitte eine E-Mail angeben — darüber richten wir Ihren Testzugang ein.'); return }
    setStatus('sending')
    try {
      const res = await fetch('/api/website-anfrage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name, unternehmen: f.unternehmen, email: f.email, telefon: f.telefon,
          branche: f.branche || null, nachricht: f.nachricht,
          kontaktwunsch: 'E-Mail',
          angebot: '7 Tage kostenlos testen',
          preis: 'kostenlos (7 Tage)',
        }),
      })
      if (!res.ok) throw new Error()
      setStatus('success')
    } catch {
      setStatus('error')
      setError('Senden fehlgeschlagen. Bitte später erneut versuchen oder uns direkt kontaktieren.')
    }
  }

  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <Navbar />

      {/* Hero */}
      <section style={{ padding: '150px 0 30px', textAlign: 'center', background: 'radial-gradient(900px 500px at 50% -10%, rgba(201,168,76,0.14), transparent 60%)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ color: GOLD, letterSpacing: '.22em', textTransform: 'uppercase', fontSize: '.78rem', marginBottom: '1.2rem' }}>🔱 Kostenlos testen</div>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(2.2rem, 5.6vw, 3.6rem)', lineHeight: 1.08, margin: '0 0 1rem' }}>
            7 Tage <span style={{ color: GOLD }}>kostenlos</span> testen.
          </h1>
          <p style={{ fontSize: 'clamp(1.05rem, 2vw, 1.25rem)', color: '#b9cdd6', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.6 }}>
            Lernen Sie ARGONAUT in Ruhe kennen — voller Zugang, kein Zahlungsmittel, kein Automatik-Abo. Nach 7 Tagen läuft der Test von selbst aus.
          </p>
        </div>
      </section>

      {/* Vorteile */}
      <section style={{ padding: '10px 0 20px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }} className="testen-grid">
          {VORTEILE.map(([icon, titel, text]) => (
            <div key={titel} style={{ background: 'rgba(122,163,179,0.05)', border: '1px solid rgba(122,163,179,0.14)', borderRadius: '14px', padding: '18px 20px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }} aria-hidden="true">{icon}</div>
              <div style={{ fontWeight: 700, color: '#EAF1F6', marginBottom: '4px' }}>{titel}</div>
              <div style={{ fontSize: '.9rem', color: '#9fb3bd', lineHeight: 1.5 }}>{text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Formular */}
      <section style={{ padding: '20px 0 70px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 24px' }}>
          {status === 'success' ? (
            <div style={{ textAlign: 'center', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '18px', padding: '48px 24px' }}>
              <div style={{ fontSize: '2rem', marginBottom: '.6rem' }} aria-hidden="true">🔱</div>
              <p style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#EAF1F6', margin: '0 0 8px' }}>Fast geschafft!</p>
              <p style={{ color: '#b9cdd6', margin: '0 auto', maxWidth: '46ch', lineHeight: 1.6 }}>
                Danke, {f.name.split(' ')[0] || 'und willkommen'}. Wir richten Ihren 7-Tage-Testzugang ein und melden uns gleich per E-Mail mit den Zugangsdaten. Eine Bestätigung ist schon unterwegs.
              </p>
              <Link href="/branchen" style={{ display: 'inline-block', marginTop: '20px', color: TEAL, textDecoration: 'none' }}>← Zurück zu den Branchen</Link>
            </div>
          ) : (
            <form onSubmit={submit} style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '26px' }}>
              <p style={{ fontWeight: 700, color: '#EAF1F6', fontSize: '1.15rem', margin: '0 0 4px' }}>Testzugang anfordern</p>
              <p style={{ fontSize: '.85rem', color: '#8fa9b6', margin: '0 0 18px' }}>Kurz eintragen — wir schicken Ihnen die Zugangsdaten per E-Mail.</p>

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
                  <label style={labelStyle}>E-Mail *</label>
                  <input type="email" style={inputStyle} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@firma.de" />
                </div>
                <div>
                  <label style={labelStyle}>Telefon</label>
                  <input style={inputStyle} value={f.telefon} onChange={(e) => set('telefon', e.target.value)} placeholder="+49 …" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Branche (optional)</label>
                  <input style={inputStyle} value={f.branche} onChange={(e) => set('branche', e.target.value)} placeholder="z. B. Optiker, Bäckerei, Kanzlei …" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Nachricht (optional)</label>
                  <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={f.nachricht} onChange={(e) => set('nachricht', e.target.value)} placeholder="Worauf sollen wir besonders eingehen?" />
                </div>
              </div>

              {/* Kein Einwilligungs-Haekchen: Bei einer Anfrage entsteht kein Vertrag,
                  deshalb sind AGB hier gegenstandslos (§ 305 Abs. 2 BGB greift erst beim
                  Vertragsschluss). Und die Verarbeitung der Kontaktdaten stuetzt sich auf
                  Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Massnahme), nicht auf eine
                  Einwilligung — ein Haekchen wuerde eine Rechtsgrundlage vortaeuschen, die
                  gar nicht einschlaegig ist, und war ohne gespeicherten Nachweis nach
                  Art. 7 Abs. 1 DSGVO ohnehin unwirksam. Pflicht ist die INFORMATION nach
                  Art. 13 DSGVO — die steht hier. Beim spaeteren Bestellvorgang gehoert das
                  AGB-Haekchen wieder hin, zusammen mit dem § 312j-Button. */}
              <p style={{ fontSize: '.82rem', color: '#8fa9b6', lineHeight: 1.5, margin: '16px 0 0' }}>
                Ihre Angaben verwenden wir ausschließlich, um Ihren Testzugang einzurichten. Wie wir mit
                Ihren Daten umgehen, steht in der{' '}
                <a href="/datenschutz" style={{ color: TEAL }}>Datenschutzerklärung</a>.
              </p>

              {error && <p style={{ color: '#f0a3a3', fontSize: '.85rem', margin: '14px 0 0' }}>{error}</p>}

              <button type="submit" disabled={status === 'sending'} style={{ width: '100%', marginTop: '18px', background: GOLD, color: NAVY, fontWeight: 700, fontSize: '1rem', padding: '16px', borderRadius: '10px', border: 'none', cursor: status === 'sending' ? 'default' : 'pointer', opacity: status === 'sending' ? 0.7 : 1 }}>
                {status === 'sending' ? 'Wird gesendet …' : '7 Tage kostenlos starten →'}
              </button>
              <p style={{ fontSize: '.78rem', color: '#7f97a4', textAlign: 'center', margin: '12px 0 0' }}>
                Kostenlos & unverbindlich · kein Zahlungsmittel · endet automatisch nach 7 Tagen
              </p>
            </form>
          )}
        </div>
      </section>

      <style>{`@media (max-width: 720px) { .testen-grid { grid-template-columns: 1fr !important; } }`}</style>
      <Footer />
    </main>
  )
}
