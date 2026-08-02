'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/AngebotRechner.tsx
// Interaktiver Angebots-Konfigurator (Preise selbst zusammenstellen).
// Mitarbeiterzahl -> Grundgebühr nach Größe. Sitze dazubuchen (Voll/Standard/
// Self-Service, Staffel an die Betriebsgröße gekoppelt). Live-Gesamtpreis +
// einmalige Einrichtung.
// Zahlen kommen 1:1 aus lib/tarif.ts (EINE Quelle der Wahrheit). Nur Anzeige.
// ============================================================================

import { useState } from 'react'
import { stufeFuerMitarbeiter, sitzPreis } from '@/lib/tarif'

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

function fmt(n: number) { return n.toLocaleString('de-DE') }
function setupText(ma: number) {
  const s = stufeFuerMitarbeiter(ma)
  return s.abPreis ? 'auf Anfrage' : `${fmt(s.onboarding)} €`
}

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

  const s = stufeFuerMitarbeiter(ma)
  const solo = !!s.allIn
  const vp = sitzPreis('voll', s.key)
  const sp = sitzPreis('standard', s.key)
  const sfp = sitzPreis('self_service', s.key)

  const vollSum = solo ? 0 : voll * vp
  const stdSum = solo ? 0 : std * sp
  const selfSum = solo ? 0 : self * sfp
  const total = solo ? s.grundgebuehr : s.grundgebuehr + vollSum + stdSum + selfSum

  function fillMix() {
    const v = Math.max(1, Math.round(ma * 0.16))
    const st = Math.round(ma * 0.32)
    const se = Math.max(0, ma - v - st)
    setVoll(v); setStd(st); setSelf(se)
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
            <p style={{ margin: 0, fontSize: '.78rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em' }}>Größe: {s.name} · Grundgebühr</p>
            <p style={{ margin: '2px 0 0', color: GOLD, fontWeight: 700, fontSize: '1.25rem' }}>{fmt(s.grundgebuehr)} €<span style={{ fontSize: '.8rem', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span></p>
          </div>
        </div>

        {solo ? (
          <p style={{ color: '#c4d3db', margin: '18px 0 0', lineHeight: 1.6 }}>
            <strong style={{ color: '#EAF1F6' }}>SOLO ist all-in:</strong> {fmt(s.grundgebuehr)} €/Monat inkl. 1 Voll-Nutzer und KI unbegrenzt — keine zusätzlichen Sitze nötig.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 4px' }}>
              <span style={{ fontSize: '.85rem', color: '#8fa9b6', textTransform: 'uppercase', letterSpacing: '.06em' }}>Sitze dazubuchen</span>
              <button type="button" onClick={fillMix} style={{ background: 'transparent', border: '1px solid rgba(122,163,179,0.3)', borderRadius: '999px', padding: '5px 12px', color: TEAL, fontSize: '.8rem', cursor: 'pointer' }}>
                Mit typischem Mix füllen
              </button>
            </div>
            <Row label="Voll-Nutzer" who="Chef, GF, Büro, Dispo" unit={vp} val={voll} set={setVoll} min={1} />
            <Row label="Standard-Nutzer" who="Sachbearbeiter, Monteur mit Doku" unit={sp} val={std} set={setStd} min={0} />
            <Row label="Self-Service" who="Zeiterfassung, Lohnzettel, Mein Bereich" unit={sfp} val={self} set={setSelf} min={0} />
          </>
        )}

        {/* Gesamt */}
        <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '14px', padding: '20px 22px', marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '.8rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em' }}>Ihr Preis</p>
            <p style={{ margin: '4px 0 0', fontSize: '.85rem', color: '#8fa9b6' }}>zuzüglich einmalig im 1. Monat: Einrichtung {setupText(ma)}</p>
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
          Unverbindliche Beispielrechnung · Preise netto, zzgl. 19 % MwSt. · Sitzpreise gestaffelt nach Betriebsgröße · Laufzeit-Rabatte (24/36 Mon.) noch nicht eingerechnet.
        </p>
      </div>
    </div>
  )
}
