'use client'

import { useState } from 'react'

export default function Process() {
  const [path, setPath] = useState<'main' | 'solo'>('main')

  return (
    <section id="vorgehen" style={{ background: '#fff', padding: '80px 24px', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: '14px' }}>Vorgehen</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, color: '#0A1628', marginBottom: '14px', lineHeight: 1.2 }}>
            Vom Kauf zum laufenden Betrieb —<br />vollautomatisch in 24–48 Stunden
          </h2>
          <p style={{ fontSize: '16px', color: '#6b7280', maxWidth: '520px', margin: '0 auto', lineHeight: 1.7 }}>
            Kein Gespräch nötig. Paket wählen, Daten übermitteln — ARGONAUT OS konfiguriert alles automatisch.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '44px', flexWrap: 'wrap' }}>
          <button onClick={() => setPath('main')} style={{ padding: '11px 28px', borderRadius: '999px', border: path === 'main' ? '1.5px solid #0A1628' : '1.5px solid #e5e7eb', background: path === 'main' ? '#0A1628' : '#fff', color: path === 'main' ? '#C9A84C' : '#6b7280', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em', transition: 'all 0.2s' }}>
            Hauptpfad — OS-Paket wählen
          </button>
          <button onClick={() => setPath('solo')} style={{ padding: '11px 28px', borderRadius: '999px', border: path === 'solo' ? '1.5px solid #0A1628' : '1.5px solid #e5e7eb', background: path === 'solo' ? '#0A1628' : '#fff', color: path === 'solo' ? '#C9A84C' : '#6b7280', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em', transition: 'all 0.2s' }}>
            Solo Beta — 3 Monate testen
          </button>
        </div>

        {path === 'main' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: '4px solid #C9A84C', borderRadius: '16px', padding: '22px 14px 20px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" stroke="#C9A84C" strokeWidth="2"/><path d="M8 21h8M12 17v4" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#C9A84C', textTransform: 'uppercase', marginBottom: '7px' }}>Schritt 01</p>
                <p style={{ fontSize: '15px', fontWeight: 900, color: '#0A1628', marginBottom: '5px' }}>Paket wählen</p>
                <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, marginBottom: '9px' }}>Start / Pro / Business / Enterprise</p>
                <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.65 }}>8 bis 24 Agenten. Je nach Betrieb und Wachstumsziel. Alles inklusive — kein Basis-Paket nötig.</p>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: '4px solid #C9A84C', borderRadius: '16px', padding: '22px 14px 20px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14 2 14 8 20 8" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="16" y1="13" x2="8" y2="13" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#C9A84C', textTransform: 'uppercase', marginBottom: '7px' }}>Schritt 02</p>
                <p style={{ fontSize: '15px', fontWeight: 900, color: '#0A1628', marginBottom: '5px' }}>Daten übermitteln</p>
                <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, marginBottom: '9px' }}>0 – 2 Stunden</p>
                <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.65 }}>Onboarding-PDF ausfüllen, Zugangsdaten und Betriebsinfos sicher übermitteln.</p>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: '4px solid #C9A84C', borderRadius: '16px', padding: '22px 14px 20px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke="#C9A84C" strokeWidth="2"/><path d="M9 12l2 2 4-4" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#C9A84C', textTransform: 'uppercase', marginBottom: '7px' }}>Schritt 03</p>
                <p style={{ fontSize: '15px', fontWeight: 900, color: '#0A1628', marginBottom: '5px' }}>Automatische Konfiguration</p>
                <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, marginBottom: '9px' }}>2 – 16 Stunden</p>
                <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.65 }}>Branchen-Template laden, Agenten konfigurieren, alle Workflows automatisch aufbauen und prüfen.</p>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: '4px solid #C9A84C', borderRadius: '16px', padding: '22px 14px 20px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/></svg>
                </div>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#C9A84C', textTransform: 'uppercase', marginBottom: '7px' }}>Schritt 04</p>
                <p style={{ fontSize: '15px', fontWeight: 900, color: '#0A1628', marginBottom: '5px' }}>Go-Live</p>
                <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, marginBottom: '9px' }}>16 – 48 Stunden</p>
                <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.65 }}>Alle Agenten aktiv. Dashboard live. Onboarding-Video im Dashboard — sofort abrufbar. ARGONAUT OS läuft.</p>
              </div>

            </div>

            <div style={{ background: '#0A1628', borderRadius: '16px', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9 12 11 14 15 10" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 900, color: '#fff', marginBottom: '5px' }}>Go-Live-Garantie: 24–48 Stunden</p>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>Nach vollständiger Datenübermittlung. Solo & Start in 24h · Pro bis 36h · Business & Enterprise bis 48h.</p>
                </div>
              </div>
              <a href="#preise" style={{ background: '#C9A84C', color: '#0A1628', fontSize: '13px', fontWeight: 700, padding: '12px 28px', borderRadius: '999px', whiteSpace: 'nowrap', letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block' }}>
                Jetzt Paket wählen
              </a>
            </div>
          </>
        )}

        {path === 'solo' && (
          <>
            <div style={{ background: '#f9f9f7', border: '1px solid #e5e7eb', borderLeft: '4px solid #C9A84C', borderRadius: '12px', padding: '16px 20px', marginBottom: '32px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10" stroke="#C9A84C" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/></svg>
              <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65 }}>
                <strong style={{ color: '#0A1628', fontWeight: 700 }}>Solo Beta — für 1–3 Personen.</strong>{' '}
                3 Monate testen, 499 €/Mo · kein Basis-Paket nötig · 2 Agenten inklusive. Nach Ablauf freie Entscheidung: Upgrade auf 12-Monats-Abo oder Vertragsende.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: '4px solid #C9A84C', borderRadius: '16px', padding: '26px 20px 22px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="7" r="4" stroke="#C9A84C" strokeWidth="2"/></svg>
                </div>
                <div style={{ display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'rgba(10,22,40,0.08)', color: '#0A1628', marginBottom: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Solo Beta</div>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#C9A84C', textTransform: 'uppercase', marginBottom: '7px' }}>Schritt 01</p>
                <p style={{ fontSize: '17px', fontWeight: 900, color: '#0A1628', marginBottom: '5px' }}>Solo Beta buchen</p>
                <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, marginBottom: '9px' }}>499 €/Mo · 3 Monate</p>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65 }}>Direkt online buchen — kein Gespräch, kein Warten. 2 Agenten für 1–3 Personen, sofort aktiv.</p>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: '4px solid #C9A84C', borderRadius: '16px', padding: '26px 20px 22px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke="#C9A84C" strokeWidth="2"/><path d="M9 12l2 2 4-4" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#C9A84C', textTransform: 'uppercase', marginBottom: '7px' }}>Schritt 02</p>
                <p style={{ fontSize: '17px', fontWeight: 900, color: '#0A1628', marginBottom: '5px' }}>Onboarding & Go-Live</p>
                <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, marginBottom: '9px' }}>0 – 24 Stunden</p>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65 }}>Daten übermitteln — Konfiguration, Qualitätsprüfung und Go-Live vollautomatisch in 24h.</p>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: '4px solid #C9A84C', borderRadius: '16px', padding: '26px 20px 22px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="#C9A84C" strokeWidth="2" strokeLinejoin="round"/></svg>
                </div>
                <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#C9A84C', textTransform: 'uppercase', marginBottom: '7px' }}>Schritt 03</p>
                <p style={{ fontSize: '17px', fontWeight: 900, color: '#0A1628', marginBottom: '5px' }}>Testen & entscheiden</p>
                <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, marginBottom: '9px' }}>Nach Monat 3</p>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65 }}>3 Monate ARGONAUT OS erleben — dann frei entscheiden: Upgrade auf 12-Monats-Abo oder Vertragsende.</p>
              </div>

            </div>

            <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
              <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f9f9f7', padding: '7px 18px', borderRadius: '999px', border: '1px solid #e5e7eb' }}>
                ↑ Nach Monat 3 — Upgrade auf Start / Pro / Business / Enterprise möglich
              </span>
            </div>

            <div style={{ background: '#0A1628', borderRadius: '16px', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9 12 11 14 15 10" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 900, color: '#fff', marginBottom: '5px' }}>Go-Live-Garantie: 24 Stunden</p>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>Auch für Solo Beta. Vollautomatisch live nach Datenübermittlung.</p>
                </div>
              </div>
              <a href="#solo" style={{ background: '#C9A84C', color: '#0A1628', fontSize: '13px', fontWeight: 700, padding: '12px 28px', borderRadius: '999px', whiteSpace: 'nowrap', letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block' }}>
                Solo Beta buchen
              </a>
            </div>
          </>
        )}

      </div>
    </section>
  )
}