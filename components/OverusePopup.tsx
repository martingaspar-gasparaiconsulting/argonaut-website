'use client'

import { useState, useEffect } from 'react'

interface Props {
  kiUsed: number
  kiLimit: number
  currentPaket: string
  userEmail: string
}

const UPGRADE_MAP: Record<string, { label: string; agenten: number; calls: number; auto: number; preis: number }> = {
  solo:       { label: 'START',      agenten: 8,  calls: 15000,  auto: 40,  preis: 1500 },
  start:      { label: 'PRO',        agenten: 16, calls: 35000,  auto: 70,  preis: 3000 },
  pro:        { label: 'BUSINESS',   agenten: 20, calls: 75000,  auto: 110, preis: 6000 },
  business:   { label: 'ENTERPRISE', agenten: 24, calls: 150000, auto: 128, preis: 9000 },
  enterprise: { label: null,         agenten: 0,  calls: 0,      auto: 0,   preis: 0 },
}

const PAKET_LABELS: Record<string, string> = {
  solo: 'SOLO Beta', start: 'START', pro: 'PRO', business: 'BUSINESS', enterprise: 'ENTERPRISE',
}

const OVERUSE_PRICE = 599
const OVERUSE_CALLS = 25000

export default function OverusePopup({ kiUsed, kiLimit, currentPaket, userEmail }: Props) {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<'upgrade' | 'overuse' | null>(null)

  const pct = Math.round((kiUsed / kiLimit) * 100)
  const upgrade = UPGRADE_MAP[currentPaket.toLowerCase()]
  const hasUpgrade = upgrade?.label !== null

  useEffect(() => {
    if (pct >= 100 && !dismissed) setShow(true)
    else if (pct >= 80 && !dismissed && !show) setShow(false) // Banner only at 80%
  }, [pct, dismissed])

  const handleOveruse = async () => {
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    setSuccess('overuse')
    setLoading(false)
  }

  const handleUpgrade = () => {
    window.location.href = '/#preise'
  }

  if (success === 'overuse') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#0A1628', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '20px', padding: '40px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ color: '#FFFFFF', fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>+25.000 KI-Calls aktiviert</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '24px' }}>599 € werden im Folgemonat eingezogen. Ihre neuen Calls sind sofort verfügbar.</p>
          <button onClick={() => { setSuccess(null); setShow(false); setDismissed(true) }}
            style={{ padding: '12px 32px', background: '#C9A84C', color: '#0A1628', borderRadius: '8px', fontWeight: 700, fontSize: '14px', border: 'none', cursor: 'pointer' }}>
            Weiter →
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* BANNER ab 80% */}
      {pct >= 80 && pct < 100 && !dismissed && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div>
              <p style={{ color: '#f59e0b', fontSize: '14px', fontWeight: 700, margin: '0 0 2px' }}>
                {pct}% Ihres KI-Call-Kontingents verbraucht
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: 0 }}>
                Noch {(kiLimit - kiUsed).toLocaleString('de-DE')} von {kiLimit.toLocaleString('de-DE')} Calls übrig
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {hasUpgrade && (
              <button onClick={() => setShow(true)}
                style={{ padding: '8px 16px', background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                Optionen ansehen
              </button>
            )}
            <button onClick={() => setDismissed(true)}
              style={{ padding: '8px 12px', background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* POPUP ab 100% oder bei Klick */}
      {show && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: '#0A1628', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '20px', padding: '40px', maxWidth: '560px', width: '100%' }}>

            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>{pct >= 100 ? '🔴' : '⚠️'}</div>
              <h2 style={{ color: '#FFFFFF', fontSize: '22px', fontWeight: 700, margin: '0 0 8px' }}>
                {pct >= 100 ? 'KI-Call-Limit erreicht' : `${pct}% verbraucht — bald aufgebraucht`}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', margin: 0 }}>
                {kiUsed.toLocaleString('de-DE')} von {kiLimit.toLocaleString('de-DE')} KI-Calls verwendet · Paket: {PAKET_LABELS[currentPaket.toLowerCase()] || currentPaket}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

              {/* OPTION A — Upgrade */}
              {hasUpgrade && upgrade && (
                <div style={{ background: 'rgba(201,168,76,0.08)', border: '2px solid rgba(201,168,76,0.4)', borderRadius: '14px', padding: '24px', cursor: 'pointer' }}
                  onClick={handleUpgrade}>
                  <div style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '12px' }}>
                    ⭐ Empfohlen
                  </div>
                  <h3 style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>
                    Auf {upgrade.label} upgraden
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>✓ {upgrade.calls.toLocaleString('de-DE')} KI-Calls/Monat</li>
                    <li style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>✓ {upgrade.agenten} KI-Agenten</li>
                    <li style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>✓ {upgrade.auto} Automatisierungen</li>
                    <li style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>✓ 12 Monate Laufzeit</li>
                  </ul>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#C9A84C', marginBottom: '12px' }}>
                    {upgrade.preis.toLocaleString('de-DE')} € / Monat
                  </div>
                  <button style={{ width: '100%', padding: '12px', background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                    Jetzt upgraden →
                  </button>
                </div>
              )}

              {/* OPTION B — Einmalig aufstocken */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '24px' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Nur diesen Monat
                </div>
                <h3 style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>
                  +25.000 Calls aufstocken
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>✓ Einmalige Zahlung</li>
                  <li style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>✓ Kein neuer Vertrag</li>
                  <li style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>✓ Sofort verfügbar</li>
                  <li style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>✓ Nächsten Monat normal</li>
                </ul>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#FFFFFF', marginBottom: '12px' }}>
                  599 € einmalig
                </div>
                <button onClick={handleOveruse} disabled={loading}
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Wird verarbeitet...' : 'Einmalig aufstocken'}
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button onClick={() => { setShow(false); setDismissed(true) }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '13px', cursor: 'pointer' }}>
                Später entscheiden
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
