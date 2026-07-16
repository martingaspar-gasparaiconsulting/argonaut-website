'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/AngebotRechner.tsx
// Interaktiver Angebots-Konfigurator (Preise selbst zusammenstellen).
// Mitarbeiterzahl -> Grundgebühr nach Größe. Sitze dazubuchen (Voll/Standard/
// Self-Service, gestaffelt nach Menge). Live-Gesamtpreis + einmalige Einrichtung.
// Zahlen 1:1 aus der ARGONAUT-Preisliste 2026. Nur Anzeige, unverbindlich.
// ============================================================================

import { useState } from 'react'

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

function grundgebuehr(ma: number) {
  if (ma <= 1) return { name: 'SOLO', fee: 499, solo: true }
  if (ma <= 9) return { name: 'Mini', fee: 490, solo: false }
  if (ma <= 24) return { name: 'Klein', fee: 990, solo: false }
  if (ma <= 99) return { name: 'Mittel', fee: 1990, solo: false }
  if (ma <= 499) return { name: 'Groß', fee: 3490, solo: false }
  return { name: 'Enterprise', fee: 5990, solo: false }
}
function setupFee(ma: number) {
  if (ma <= 1) return '1.500 €'
  if (ma <= 9) return '2.500 €'
  if (ma <= 24) return '5.000 €'
  if (ma <= 99) return '12.000 €'
  return 'auf Anfrage'
}
function vollPrice(n: number) { return n <= 20 ? 380 : n <= 100 ? 320 : n <= 500 ? 260 : 190 }
function stdPrice(n: number) { return n <= 20 ? 170 : n <= 100 ? 145 : n <= 500 ? 120 : 90 }
function selfPrice(n: number) { return n >= 500 ? 14 : 19 }
function fmt(n: number) { return n.toLocaleString('de-DE') }

const stepBtn: React.CSSProperties = {
  width: '30px', height: '30px', borderRadius: '8px',
  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
  color: GOLD, fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1,
}

export default function AngebotRechner() {
  const [ma, setMa] = useState(12)
  const [voll, setVoll] = useState(2)
  const [std, setStd] = useState(4)
  const [self, setSelf] = useState(6)

  const g = grundgebuehr(ma)
  const solo = g.solo
  const vollSum = solo ? 0 : voll * vollPrice(voll)
  const stdSum = solo ? 0 : std * stdPrice(std)
  const selfSum = solo ? 0 : self * selfPrice(self)
  const total = solo ? 499 : g.fee + vollSum + stdSum + selfSum

  function fillMix() {
    const v = Math.max(1, Math.round(ma * 0.16))
    const s = Math.round(ma * 0.32)
    const se = Math.max(0, ma - v - s)
    setVoll(v); setStd(s); setSelf(se)
  }

  const Row = ({ label, who, unit, val, set, min = 0 }: { label: string; who: string; unit: number; val: number; set: (n: number) => void; min?: number }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px 0', borderBottom: '1px solid rgba(122,163,179,0.10)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 700, color: '#EAF1F6', margin: 0 }}>{label}</p>
        <p style={{ fontSize: '.8rem', color: '#8fa9b6', margin: '2px 0 0' }}>{who} · je {unit} €</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button type="button" onClick={() => set(Math.max(min, val - 1))} style={stepBtn} aria-label="weniger">−</button>
        <span style={{ minWidth: '30px', textAlign: 'center', color: '#EAF1F6', fontWeight: 600 }}>{val}</span>
        <button type="button" onClick={() => set(val + 1)} style={stepBtn} aria-label="mehr">+</button>
        <span style={{ minWidth: '86px', textAlign: 'right', color: GOLD, fontWeight: 600 }}>{fmt(val * unit)} €</span>
      </div>
    </div>
  )

  return (
    <div style={{ textAlign: 'left', marginTop: '30px' }}>
      <h3 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: '1.2rem', color: '#EAF1F6', margin: '0 0 4px', textAlign: 'center' }}>
        Stellen Sie Ihr Angebot selbst zusammen
      </h3>
      <p style={{ fontSize: '.9rem', color: '#8fa9b6', margin: '0 0 22px', textAlign: 'center' }}>
        Mitarbeiterzahl eingeben, Sitze dazubuchen — Ihr Preis rechnet sich live.
      </p>

      <div style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '26px' }}>

        {/* Mitarbeiter + Grundgebühr */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', paddingBottom: '18px', borderBottom: '1px solid rgba(122,163,179,0.14)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#c4d3db' }}>Mitarbeiter im Betrieb:</span>
            <button type="button" onClick={() => setMa(Math.max(1, ma - 1))} style={stepBtn} aria-label="weniger">−</button>
            <span style={{ minWidth: '40px', textAlign: 'center', color: '#EAF1F6', fontWeight: 700, fontSize: '1.1rem' }}>{ma}</span>
            <button type="button" onClick={() => setMa(ma + 1)} style={stepBtn} aria-label="mehr">+</button>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '.78rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em' }}>Größe: {g.name} · Grundgebühr</p>
            <p style={{ margin: '2px 0 0', color: GOLD, fontWeight: 700, fontSize: '1.25rem' }}>{fmt(g.fee)} €<span style={{ fontSize: '.8rem', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span></p>
          </div>
        </div>

        {solo ? (
          <p style={{ color: '#c4d3db', margin: '18px 0 0', lineHeight: 1.6 }}>
            <strong style={{ color: '#EAF1F6' }}>SOLO ist all-in:</strong> 499 €/Monat inkl. 1 Voll-Nutzer und KI unbegrenzt — keine zusätzlichen Sitze nötig.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 4px' }}>
              <span style={{ fontSize: '.85rem', color: '#8fa9b6', textTransform: 'uppercase', letterSpacing: '.06em' }}>Sitze dazubuchen</span>
              <button type="button" onClick={fillMix} style={{ background: 'transparent', border: '1px solid rgba(122,163,179,0.3)', borderRadius: '999px', padding: '5px 12px', color: TEAL, fontSize: '.8rem', cursor: 'pointer' }}>
                Mit typischem Mix füllen
              </button>
            </div>
            <Row label="Voll-Nutzer" who="Chef, GF, Büro, Dispo" unit={vollPrice(voll)} val={voll} set={setVoll} min={1} />
            <Row label="Standard-Nutzer" who="Sachbearbeiter, Monteur mit Doku" unit={stdPrice(std)} val={std} set={setStd} min={0} />
            <Row label="Self-Service" who="Zeiterfassung, Lohnzettel, Mein Bereich" unit={selfPrice(self)} val={self} set={setSelf} min={0} />
          </>
        )}

        {/* Gesamt */}
        <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '14px', padding: '20px 22px', marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '.8rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em' }}>Ihr Preis</p>
            <p style={{ margin: '4px 0 0', fontSize: '.85rem', color: '#8fa9b6' }}>+ einmalige Einrichtung: {setupFee(ma)}</p>
          </div>
          <p style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', color: GOLD, margin: 0, lineHeight: 1 }}>
            {fmt(total)} €<span style={{ fontSize: '.9rem', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span>
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a href="#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: GOLD, color: NAVY, fontWeight: 600, fontSize: '.98rem', padding: '13px 28px', borderRadius: '10px', textDecoration: 'none', boxShadow: '0 10px 30px rgba(201,168,76,0.22)' }}>
            Dieses Angebot anfragen <span aria-hidden="true">→</span>
          </a>
        </div>

        <p style={{ fontSize: '.78rem', color: '#7f97a4', textAlign: 'center', margin: '16px 0 0', lineHeight: 1.5 }}>
          Unverbindliche Beispielrechnung · Preise netto, zzgl. 19 % MwSt. · Sitzpreise gestaffelt nach Menge · Laufzeit-Rabatte (24/36 Mon.) noch nicht eingerechnet.
        </p>
      </div>
    </div>
  )
}
