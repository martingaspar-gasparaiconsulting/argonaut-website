'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types & config ───────────────────────────────────────────────────────────

type PlanId = 'starter' | 'professional' | 'business' | 'enterprise'

interface PlanConfig {
  id:          PlanId
  name:        string
  netPrice:    number          // EUR net
  description: string
  features:    string[]
  color:       string
  highlight?:  boolean
}

const VAT      = 0.19
const BASIS_FEE = 1500   // mandatory for all customers

const PLANS: PlanConfig[] = [
  {
    id:         'starter',
    name:       'Starter',
    netPrice:   1500,
    description: 'Einstieg in die KI-Automatisierung',
    features:   ['Bis zu 5 Automatisierungen', '2 KI-Agenten', 'E-Mail-Support', 'Basis-Reporting'],
    color:      '#6b7280',
  },
  {
    id:         'professional',
    name:       'Professional',
    netPrice:   2500,
    description: 'Für wachsende Unternehmen',
    features:   ['Bis zu 20 Automatisierungen', '5 KI-Agenten', 'Priority-Support', 'Erweitertes Reporting'],
    color:      '#C9A84C',
    highlight:  true,
  },
  {
    id:         'business',
    name:       'Business',
    netPrice:   4500,
    description: 'Für etablierte Betriebe',
    features:   ['Bis zu 50 Automatisierungen', '8 KI-Agenten', 'Dedizierter Ansprechpartner', 'Custom Integrations'],
    color:      '#4f94e8',
  },
  {
    id:         'enterprise',
    name:       'Enterprise',
    netPrice:   7500,
    description: 'Für höchste Anforderungen',
    features:   ['Unbegrenzte Automatisierungen', 'Alle KI-Agenten', 'SLA-Garantie', 'On-Premise möglich'],
    color:      '#a855f7',
  },
]

function gross(net: number) { return Math.round(net * (1 + VAT)) }
function fmt(n: number)     { return n.toLocaleString('de-DE') }
function total(planNet: number) { return BASIS_FEE + planNet }

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userEmail:   string
  userName:    string
  currentPlan: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UpgradeForm({ userEmail, userName, currentPlan }: Props) {
  const router = useRouter()

  const [selectedPlan,    setSelectedPlan]    = useState<PlanId>('professional')
  const [iban,            setIban]            = useState('')
  const [accountHolder,   setAccountHolder]   = useState(userName)
  const [mandateAccepted, setMandateAccepted] = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [success,         setSuccess]         = useState(false)

  const plan = PLANS.find(p => p.id === selectedPlan)!

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!mandateAccepted) {
      setError('Bitte akzeptieren Sie das SEPA-Lastschriftmandat.')
      return
    }

    const cleanIban = iban.replace(/\s/g, '').toUpperCase()
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleanIban)) {
      setError('Bitte geben Sie eine gültige IBAN ein (z. B. DE89 3704 0044 0532 0130 00).')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/stripe/create-subscription', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ iban: cleanIban, accountHolderName: accountHolder, plan: selectedPlan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ein unbekannter Fehler ist aufgetreten.')
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 12L10 17L19 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), sans-serif' }}>
          Abonnement aktiviert
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.45)', margin: 0, fontSize: '15px' }}>
          Sie werden in Kürze zu Ihrem Dashboard weitergeleitet…
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>

      {/* ── Plan selection ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '44px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 20px', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#fff' }}>
          Plan wählen
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
          {PLANS.map(p => {
            const active   = p.id === selectedPlan
            const isCurrent = p.id === currentPlan
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlan(p.id)}
                style={{
                  position:     'relative',
                  padding:      '22px 18px 20px',
                  borderRadius: '14px',
                  border:       active ? `2px solid ${p.color}` : '2px solid rgba(255,255,255,0.08)',
                  background:   active ? `${p.color}11` : 'rgba(255,255,255,0.03)',
                  cursor:       'pointer',
                  textAlign:    'left',
                  color:        '#fff',
                  transition:   'border-color 0.18s, background 0.18s',
                }}
              >
                {/* "Beliebt" badge */}
                {p.highlight && (
                  <span style={{
                    position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)',
                    background: '#C9A84C', color: '#0A1628', fontSize: '10px', fontWeight: 800,
                    padding: '3px 12px', borderRadius: '999px', letterSpacing: '0.08em', whiteSpace: 'nowrap',
                  }}>
                    BELIEBT
                  </span>
                )}

                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-dm-sans), sans-serif', color: active ? p.color : '#fff' }}>
                    {p.name}
                  </span>
                  {isCurrent && (
                    <span style={{
                      fontSize: '9px', fontWeight: 700, color: p.color,
                      background: `${p.color}1a`, border: `1px solid ${p.color}40`,
                      borderRadius: '999px', padding: '2px 8px', letterSpacing: '0.06em',
                    }}>
                      AKTUELL
                    </span>
                  )}
                </div>

                {/* Package price */}
                <div style={{ marginBottom: '2px' }}>
                  <span style={{ fontSize: '26px', fontWeight: 900, fontFamily: 'var(--font-dm-sans), sans-serif' }}>
                    {fmt(p.netPrice)} €
                  </span>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginLeft: '4px' }}>/Monat (Paket)</span>
                </div>

                {/* Basis + total breakdown */}
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: '0 0 6px', lineHeight: 1.6 }}>
                  + Basis-Automatisierungen 1.500 €
                  <span style={{ display: 'block', fontWeight: 700, color: active ? p.color : 'rgba(255,255,255,0.55)', fontSize: '13px', marginTop: '2px' }}>
                    = {fmt(total(p.netPrice))} € gesamt netto/Monat
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}>
                    zzgl. 19% MwSt. = {fmt(gross(total(p.netPrice)))} € brutto
                  </span>
                </div>

                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px', lineHeight: 1.55 }}>
                  {p.description}
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {p.features.map(f => (
                    <li key={f} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, marginTop: '1px' }}>
                        <path d="M2 6.5L5 9.5L11 3.5" stroke={p.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', marginBottom: '40px' }} />

      {/* ── SEPA Bankdaten ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '36px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#fff' }}>
          Bankverbindung (SEPA-Lastschrift)
        </h2>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', margin: '0 0 24px' }}>
          Der Betrag wird monatlich per SEPA-Lastschrift von Ihrem Konto abgebucht.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Account holder */}
          <div>
            <label style={labelStyle}>Kontoinhaber</label>
            <input
              type="text"
              value={accountHolder}
              onChange={e => setAccountHolder(e.target.value)}
              placeholder="Vor- und Nachname"
              required
              style={inputStyle}
              onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.55)' }}
              onBlur={e   => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* IBAN */}
          <div>
            <label style={labelStyle}>IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={e => setIban(e.target.value.toUpperCase())}
              placeholder="DE89 3704 0044 0532 0130 00"
              required
              maxLength={42}
              style={{ ...inputStyle, letterSpacing: '0.06em', fontFamily: 'ui-monospace, monospace' }}
              onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.55)' }}
              onBlur={e   => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label style={labelStyle}>E-Mail (Rechnungsempfänger)</label>
            <input
              type="email"
              value={userEmail}
              readOnly
              style={{
                ...inputStyle,
                background:  'rgba(255,255,255,0.02)',
                borderColor: 'rgba(255,255,255,0.06)',
                color:       'rgba(255,255,255,0.3)',
                cursor:      'default',
              }}
            />
          </div>
        </div>
      </section>

      {/* ── SEPA Mandat ────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <div style={{
          background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.18)',
          borderRadius: '12px', padding: '18px 20px',
        }}>
          <label style={{ display: 'flex', gap: '14px', cursor: 'pointer', alignItems: 'flex-start' }}>
            {/* Checkbox */}
            <div
              role="checkbox"
              aria-checked={mandateAccepted}
              tabIndex={0}
              onClick={() => setMandateAccepted(v => !v)}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') setMandateAccepted(v => !v) }}
              style={{
                flexShrink:     0,
                width:          '20px',
                height:         '20px',
                borderRadius:   '5px',
                border:         mandateAccepted ? '2px solid #C9A84C' : '2px solid rgba(255,255,255,0.2)',
                background:     mandateAccepted ? '#C9A84C' : 'transparent',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                marginTop:      '2px',
                transition:     'all 0.15s',
              }}
            >
              {mandateAccepted && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="#0A1628" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>

            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.75 }}>
              Ich ermächtige die <strong style={{ color: '#C9A84C', fontWeight: 700 }}>ARGONAUT AI GmbH</strong> (Gläubiger-ID: DE98ZZZ09999999999), Zahlungen
              von meinem Konto mittels SEPA-Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die auf mein
              Konto gezogenen Lastschriften einzulösen. Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum,
              die Erstattung des belasteten Betrages verlangen. Es gelten die Bedingungen meines Kreditinstituts.
              Die Mandatsreferenz wird separat per E-Mail mitgeteilt.
            </p>
          </label>
        </div>
      </section>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'flex-start',
          padding: '13px 16px', borderRadius: '10px', marginBottom: '24px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#f87171', fontSize: '13px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: '1px' }}>
            <circle cx="12" cy="12" r="9" stroke="#f87171" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16v.01" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          {error}
        </div>
      )}

      {/* ── Submit ─────────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={loading}
        style={{
          width:          '100%',
          padding:        '15px 28px',
          borderRadius:   '10px',
          border:         'none',
          background:     loading ? 'rgba(201,168,76,0.45)' : '#C9A84C',
          color:          '#0A1628',
          fontSize:       '15px',
          fontWeight:     800,
          letterSpacing:  '0.03em',
          cursor:         loading ? 'not-allowed' : 'pointer',
          fontFamily:     'var(--font-dm-sans), sans-serif',
          transition:     'opacity 0.2s',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            '10px',
        }}
        onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.9' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      >
        {loading ? (
          <>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ animation: 'argSpin 0.9s linear infinite' }}>
              <circle cx="12" cy="12" r="9" stroke="rgba(10,22,40,0.3)" strokeWidth="2.5"/>
              <path d="M3 12C3 7.03 7.03 3 12 3" stroke="#0A1628" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            Abonnement wird erstellt…
          </>
        ) : (
          <>
            {plan.name} abonnieren — {fmt(total(plan.netPrice))} € netto/Monat
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M13 6l6 6-6 6" stroke="#0A1628" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </button>

      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: '14px 0 0', lineHeight: 1.6 }}>
        Gesamtpreis inkl. Basis-Automatisierungen (1.500 €) + {plan.name}-Paket ({fmt(plan.netPrice)} €) · zzgl. 19% MwSt. · SSL-verschlüsselt · Stripe · Kündigung jederzeit möglich
      </p>

      <style>{`@keyframes argSpin { to { transform: rotate(360deg); } }`}</style>
    </form>
  )
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display:       'block',
  fontSize:      '11px',
  fontWeight:    700,
  color:         'rgba(255,255,255,0.45)',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  marginBottom:  '8px',
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '13px 15px',
  borderRadius: '10px',
  border:       '1px solid rgba(255,255,255,0.1)',
  background:   'rgba(255,255,255,0.05)',
  color:        '#fff',
  fontSize:     '15px',
  outline:      'none',
  boxSizing:    'border-box',
  fontFamily:   'var(--font-dm-sans), sans-serif',
  transition:   'border-color 0.15s',
}
