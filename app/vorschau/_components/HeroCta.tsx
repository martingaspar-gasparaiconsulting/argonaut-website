'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/HeroCta.tsx
// Umschalter-gesteuerter Haupt-Knopf im Hero der Branchen-Dossier-Seiten.
// Liest das Control-Room-Flag (cta_modus) ZUR LAUFZEIT — dadurch wirkt das
// Umlegen im Command Center sofort, ohne neuen Build/Push (die Detailseiten
// sind statisch generiert, deshalb Client-Fetch statt Server-Lesen).
//   • termin (Standard) → „📅 Termin vereinbaren" → #demo (Konfigurator + Termin)
//   • bestellen          → „Jetzt starten"         → /#preise
// Fällt bei Fehler/Nichtwissen sicher auf 'termin' zurück (Nordstern).
// ============================================================================

import { useState, useEffect } from 'react'

const NAVY = '#0A1628'
const GOLD = '#c9a84c'

const btnStyle: React.CSSProperties = {
  background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem',
  padding: '15px 30px', borderRadius: '10px', textDecoration: 'none',
}

export default function HeroCta({ branche }: { branche: string }) {
  const [modus, setModus] = useState<'termin' | 'bestellen'>('termin')

  useEffect(() => {
    fetch('/api/oeffentlich/cta-modus')
      .then((r) => r.json())
      .then((j) => { if (j?.modus === 'bestellen') setModus('bestellen') })
      .catch(() => {})
  }, [])

  if (modus === 'bestellen') {
    return <a href="/#preise" style={btnStyle} aria-label={`ARGONAUT für ${branche} — jetzt starten`}>Jetzt starten →</a>
  }
  return <a href="#demo" style={btnStyle} aria-label={`Termin für ${branche} vereinbaren`}>📅 Termin vereinbaren →</a>
}
