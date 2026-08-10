'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/HeroCta.tsx
// Umschalter-gesteuerte Haupt-Knöpfe im Hero der Branchen-Dossier-Seiten.
// Liest das Control-Room-Flag (cta_modus) ZUR LAUFZEIT — dadurch wirkt das
// Umlegen im Command Center sofort, ohne neuen Build/Push (die Detailseiten
// sind statisch generiert, deshalb Client-Fetch statt Server-Lesen).
//   • termin (Standard) → „📅 Termin vereinbaren" → #demo (Konfigurator + Termin)
//   • beide             → Termin  +  „7 Tage kostenlos testen" → /testen
//   • bestellen         → „Jetzt starten" → /#preise
// Fällt bei Fehler/Nichtwissen sicher auf 'termin' zurück (Nordstern).
// ============================================================================

import { useState, useEffect } from 'react'

const NAVY = '#0A1628'
const GOLD = '#c9a84c'

const primaerStyle: React.CSSProperties = {
  background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem',
  padding: '15px 30px', borderRadius: '10px', textDecoration: 'none',
}
const sekundaerStyle: React.CSSProperties = {
  background: 'transparent', color: GOLD, fontWeight: 600, fontSize: '1rem',
  padding: '15px 26px', borderRadius: '10px', textDecoration: 'none',
  border: '1px solid rgba(201,168,76,0.55)',
}

type Modus = 'termin' | 'beide' | 'bestellen'

export default function HeroCta({ branche }: { branche: string }) {
  const [modus, setModus] = useState<Modus>('termin')

  useEffect(() => {
    fetch('/api/oeffentlich/cta-modus')
      .then((r) => r.json())
      .then((j) => { if (j?.modus === 'bestellen' || j?.modus === 'beide') setModus(j.modus) })
      .catch(() => {})
  }, [])

  if (modus === 'bestellen') {
    return <a href="/#preise" style={primaerStyle} aria-label={`ARGONAUT für ${branche} — jetzt starten`}>Jetzt starten →</a>
  }

  if (modus === 'beide') {
    return (
      <>
        <a href="#demo" style={primaerStyle} aria-label={`Termin für ${branche} vereinbaren`}>📅 Termin vereinbaren →</a>
        <a href="/testen" style={sekundaerStyle} aria-label={`ARGONAUT für ${branche} 7 Tage kostenlos testen`}>7 Tage kostenlos testen →</a>
      </>
    )
  }

  return <a href="#demo" style={primaerStyle} aria-label={`Termin für ${branche} vereinbaren`}>📅 Termin vereinbaren →</a>
}
