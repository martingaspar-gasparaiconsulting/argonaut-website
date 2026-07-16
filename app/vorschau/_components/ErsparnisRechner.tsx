'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/ErsparnisRechner.tsx
// Interaktiver Ersparnis-/Tool-Kosten-Rechner (Schritt 4 der neuen Website).
// Reine Client-Komponente (useState) — wird in app/vorschau/page.tsx eingebunden.
// Selbsttragende Inline-Styles, keine neuen Abhaengigkeiten.
// ============================================================================

import { useState } from 'react'

const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

export default function ErsparnisRechner() {
  const [tools, setTools] = useState(8)
  const [kosten, setKosten] = useState(80)

  const proMonat = tools * kosten
  const proJahr = proMonat * 12
  const fmt = (n: number) => n.toLocaleString('de-DE')

  return (
    <section style={{ padding: '8px 0 100px' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
        <h2
          style={{
            fontFamily: 'var(--font-syne), sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 2.9rem)',
            lineHeight: 1.1,
            margin: '0 0 .9rem',
            color: '#EAF1F6',
          }}
        >
          Wie viel kostet Sie Ihr <span style={{ color: GOLD }}>Tool-Wildwuchs</span>?
        </h2>
        <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '46ch', margin: '0 auto 40px', lineHeight: 1.55 }}>
          Verschieben Sie die Regler — und sehen Sie schwarz auf gold, was Ihr Betrieb Monat für Monat für lauter Insellösungen zahlt.
        </p>

        <div
          style={{
            background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))',
            border: '1px solid rgba(201,168,76,0.22)',
            borderRadius: '18px',
            padding: '30px 28px',
            boxShadow: '0 30px 70px rgba(0,0,0,0.4)',
          }}
        >
          {/* Regler 1 — Anzahl Tools */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '.95rem', color: '#c4d3db' }}>Software-Tools im Einsatz</span>
              <span style={{ fontSize: '1.05rem', fontWeight: 600, color: GOLD }}>{tools}</span>
            </div>
            <input
              type="range" min={1} max={20} value={tools}
              onChange={(e) => setTools(Number(e.target.value))}
              aria-label="Anzahl Software-Tools"
              style={{ width: '100%', accentColor: GOLD, cursor: 'pointer' }}
            />
          </div>

          {/* Regler 2 — Kosten pro Tool */}
          <div style={{ marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '.95rem', color: '#c4d3db' }}>Ø Kosten pro Tool / Monat</span>
              <span style={{ fontSize: '1.05rem', fontWeight: 600, color: GOLD }}>{kosten} €</span>
            </div>
            <input
              type="range" min={20} max={300} step={5} value={kosten}
              onChange={(e) => setKosten(Number(e.target.value))}
              aria-label="Kosten pro Tool pro Monat"
              style={{ width: '100%', accentColor: GOLD, cursor: 'pointer' }}
            />
          </div>

          {/* Ergebnis */}
          <div
            style={{
              background: 'rgba(201,168,76,0.08)',
              border: '1px solid rgba(201,168,76,0.25)',
              borderRadius: '14px',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '.8rem', color: TEAL, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Ihre Tool-Kosten heute
            </p>
            <p style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(2.2rem, 7vw, 3.4rem)', color: GOLD, margin: 0, lineHeight: 1 }}>
              {fmt(proMonat)} €<span style={{ fontSize: '40%', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span>
            </p>
            <p style={{ fontSize: '1rem', color: '#c4d3db', margin: '10px 0 0' }}>
              das sind <strong style={{ color: '#EAF1F6' }}>{fmt(proJahr)} €</strong> im Jahr — für Software, die nicht miteinander spricht.
            </p>
          </div>

          <p style={{ fontSize: '.9rem', color: '#8fa9b6', margin: '18px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
            Dazu kommt der versteckte Preis: ständiges Umschalten, doppelte Eingaben, Daten, die nicht zusammenpassen.
          </p>

          <div style={{ textAlign: 'center', marginTop: '22px' }}>
            <a
              href="#demo"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                background: GOLD, color: '#0A1628', fontWeight: 600, fontSize: '.98rem',
                padding: '14px 28px', borderRadius: '10px', textDecoration: 'none',
                boxShadow: '0 10px 30px rgba(201,168,76,0.22)',
              }}
            >
              Alles in einem System — Demo buchen <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
