'use client'

import { useEffect, useState } from 'react'

const automatisierungen = [
  'Lead-Automatisierung',
  'Angebotserstellung',
  'Kundenservice',
  'Rechnungsverarbeitung',
  'Terminbuchung',
  'E-Mail-Marketing',
  'WhatsApp-Kommunikation',
  'Mitarbeiter-Onboarding',
  'Dokumentenmanagement',
  'Buchhaltung & Reporting',
]

export default function Hero() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % automatisierungen.length)
        setVisible(true)
      }, 400)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="bg-white pt-36 pb-0 px-6">
      <div className="max-w-4xl mx-auto text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 mb-10">
          <span className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase">
            KI-Agentur für den Mittelstand · D/A/CH
          </span>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', fontWeight: 900, color: '#0A1628', lineHeight: 1.1, marginBottom: '1rem' }}>
          Ihre Automatisierung für
        </h1>

        {/* Wechselndes Wort */}
        <div style={{ minHeight: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '2.5rem', padding: '0 16px' }}>
          <span style={{
            fontSize: 'clamp(2.5rem, 7vw, 5.5rem)',
            fontWeight: 900,
            color: '#0A1628',
            lineHeight: 1.15,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(12px)',
            transition: 'all 0.3s ease',
            display: 'inline-block',
            paddingBottom: '16px',
            borderBottom: '6px solid #C9A84C',
            marginBottom: '4px',
          }}>
            {automatisierungen[currentIndex]}
          </span>
        </div>

        {/* OPTION E — Emotional + kursiv */}
        <div style={{ marginBottom: '40px' }}>
          <p style={{ fontSize: '26px', fontWeight: 700, color: '#0A1628', marginBottom: '14px', lineHeight: 1.4 }}>
            Ihre Prozesse laufen heute noch manuell.
          </p>
          <p style={{ fontSize: '24px', fontStyle: 'italic', color: '#C9A84C', fontWeight: 600, marginBottom: '20px', lineHeight: 1.4 }}>
            Mit ARGONAUT gehört das der Vergangenheit an.
          </p>
          <p style={{ fontSize: '15px', color: '#9ca3af' }}>
            Für 2.000.000+ Unternehmen in D/A/CH — vom Solopreneur bis zur GmbH.
          </p>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', marginBottom: '32px' }}>
          <a href="#kontakt" style={{
            background: '#C9A84C',
            color: '#fff',
            fontWeight: 700,
            fontSize: '13px',
            padding: '20px 40px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-block',
          }}>
            Kostenloses Erstgespräch
          </a>
          <a href="#leistungen" style={{
            color: '#0A1628',
            fontWeight: 600,
            fontSize: '13px',
            padding: '20px 40px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-block',
            border: '1px solid #e5e7eb',
          }}>
            Leistungen entdecken →
          </a>
        </div>

        {/* Trust Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'center', marginBottom: '80px', fontSize: '14px', color: '#9ca3af' }}>
          <span>✓ Kein Vorwissen nötig</span>
          <span>✓ In 90 Min. startklar</span>
          <span>✓ DSGVO-konform</span>
          <span>✓ 100% auf Ihren Betrieb zugeschnitten</span>
        </div>

      </div>

      {/* STATS KACHELN */}
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0">

          <div style={{ background: 'linear-gradient(135deg, #0A1628 0%, #1a2d4a 100%)', padding: '56px 28px', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#C9A84C' }}></div>
            <p style={{ fontSize: 'clamp(3rem, 5vw, 5rem)', fontWeight: 900, color: '#C9A84C', lineHeight: 1, marginBottom: '20px' }}>2Mio<span style={{ fontSize: '65%' }}>+</span></p>
            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.95)', fontWeight: 700, marginBottom: '8px' }}>Unternehmen in D/A/CH</p>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)' }}>warten auf ihre Automatisierung</p>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #e8c46a 100%)', padding: '56px 28px', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#0A1628' }}></div>
            <p style={{ fontSize: 'clamp(3rem, 5vw, 5rem)', fontWeight: 900, color: '#0A1628', lineHeight: 1, marginBottom: '20px' }}>4.045</p>
            <p style={{ fontSize: '18px', color: 'rgba(10,22,40,0.95)', fontWeight: 700, marginBottom: '8px' }}>Automatisierungen startklar</p>
            <p style={{ fontSize: '15px', color: 'rgba(10,22,40,0.55)' }}>individuell anpassbar — für jede Branche</p>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #0A1628 0%, #1a2d4a 100%)', padding: '56px 28px', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#C9A84C' }}></div>
            <p style={{ fontSize: 'clamp(3rem, 5vw, 5rem)', fontWeight: 900, color: '#C9A84C', lineHeight: 1, marginBottom: '20px' }}>90<span style={{ fontSize: '55%', marginLeft: '6px' }}>Min.</span></p>
            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.95)', fontWeight: 700, marginBottom: '8px' }}>Vom Formular</p>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)' }}>zur ersten laufenden Automatisierung</p>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #e8c46a 100%)', padding: '56px 28px', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#0A1628' }}></div>
            <p style={{ fontSize: 'clamp(3rem, 5vw, 5rem)', fontWeight: 900, color: '#0A1628', lineHeight: 1, marginBottom: '20px' }}>110</p>
            <p style={{ fontSize: '18px', color: 'rgba(10,22,40,0.95)', fontWeight: 700, marginBottom: '8px' }}>Branchen abgedeckt</p>
            <p style={{ fontSize: '15px', color: 'rgba(10,22,40,0.55)' }}>eine Lösung — maßgeschneidert für Sie</p>
          </div>

        </div>
      </div>

    </section>
  )
}
