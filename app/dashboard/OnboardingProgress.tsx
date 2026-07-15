'use client'

import { useEffect, useState } from 'react'

interface ProgressItem {
  id: string
  label: string
  done: boolean
  link?: string
}

export default function OnboardingProgress({ onboardingCompleted, hasApiKeys }: {
  onboardingCompleted: boolean
  hasApiKeys: boolean
}) {
  const items: ProgressItem[] = [
    { id: 'konto', label: 'Konto erstellt & eingeloggt', done: true },
    { id: 'onboarding', label: 'Onboarding ausgef\u00fcllt', done: onboardingCompleted, link: '/dashboard/onboarding' },
    { id: 'apikeys', label: 'Zugangsdaten & API-Keys eingetragen', done: hasApiKeys, link: '/dashboard/onboarding' },
    { id: 'golive', label: 'Erstgespr\u00e4ch + Live-Demo (innerhalb 24h)', done: false },
  ]

  const doneCount = items.filter(i => i.done).length
  const pct = Math.round((doneCount / items.length) * 100)
  const allDone = doneCount === items.length

  if (allDone) return null

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(201,168,76,0.2)',
      borderRadius: '14px',
      padding: '24px 28px',
      marginBottom: '32px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
            System-Setup Fortschritt
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            {doneCount} von {items.length} Schritten abgeschlossen
          </p>
        </div>
        <span style={{
          fontSize: '20px', fontWeight: 900, color: pct === 100 ? '#22c55e' : '#C9A84C',
          fontFamily: 'var(--font-dm-sans), sans-serif',
        }}>{pct}%</span>
      </div>

      {/* Balken */}
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '999px', height: '8px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #C9A84C, #e8c96a)',
          borderRadius: '999px',
          transition: 'width 0.6s ease',
        }} />
      </div>

      {/* Schritte */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
              background: item.done ? '#22c55e' : 'rgba(255,255,255,0.08)',
              border: item.done ? 'none' : '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px',
            }}>
              {item.done ? '\u2713' : ''}
            </div>
            {item.link && !item.done ? (
              <a href={item.link} style={{ fontSize: '13px', color: '#C9A84C', textDecoration: 'underline', cursor: 'pointer' }}>
                {item.label}
              </a>
            ) : (
              <span style={{ fontSize: '13px', color: item.done ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.85)', textDecoration: item.done ? 'line-through' : 'none' }}>
                {item.label}
              </span>
            )}
            {!item.done && item.link && (
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#C9A84C', fontWeight: 700, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '999px', padding: '2px 10px' }}>
                Jetzt erledigen
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
