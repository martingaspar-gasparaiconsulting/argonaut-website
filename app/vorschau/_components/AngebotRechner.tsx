'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/AngebotRechner.tsx
// Interaktiver Angebots-Konfigurator (Preise selbst zusammenstellen).
// Ein Standort: Mitarbeiterzahl -> Grundgebühr + Sitze dazubuchen.
// Mehrere Standorte: je-Standort-Richtlinie (Hauptsitz 100 %, weitere 40 %)
// im Vergleich zur firmenweiten Variante (alle Mitarbeiter = eine Stufe).
// Zahlen kommen 1:1 aus lib/tarif.ts (EINE Quelle der Wahrheit). Nur Anzeige.
// ============================================================================

import { useState } from 'react'
import { stufeFuerMitarbeiter, sitzPreis, multiStandort, firmenweit, euro, monatspreis, laufzeitOptionen, laufzeitRabattProzent, LAUFZEIT_STANDARD } from '@/lib/tarif'

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
const numInput: React.CSSProperties = {
  width: '64px', textAlign: 'center', color: '#EAF1F6', fontWeight: 700,
  fontSize: '1.1rem', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(201,168,76,0.35)', borderRadius: '8px',
  padding: '5px 4px', fontFamily: 'inherit',
}

export default function AngebotRechner() {
  const [multi, setMulti] = useState(false)
  const [laufzeit, setLaufzeit] = useState<number>(LAUFZEIT_STANDARD)
  const [ma, setMa] = useState(12)
  const [voll, setVoll] = useState(2)
  const [std, setStd] = useState(4)
  const [self, setSelf] = useState(6)
  const [standorte, setStandorte] = useState<{ name: string; mitarbeiter: number }[]>([
    { name: '', mitarbeiter: 40 },
    { name: '', mitarbeiter: 8 },
  ])

  const s = stufeFuerMitarbeiter(ma)
  const solo = !!s.allIn
  const vp = sitzPreis('voll', s.key)
  const sp = sitzPreis('standard', s.key)
  const sfp = sitzPreis('self_service', s.key)

  // Preis kommt komplett aus lib/tarif — inklusive Laufzeit-Rabatt.
  const mp = monatspreis(s.key, solo ? {} : { voll, standard: std, self_service: self }, laufzeit)
  const total = mp.netto
  const rabattProzent = laufzeitRabattProzent(laufzeit)

  const ms = multiStandort(standorte)
  const fw = firmenweit(standorte)
  // Der Laufzeit-Rabatt gilt auch bei mehreren Standorten auf die monatlichen
  // Gebuehren — die einmalige Einrichtung bleibt in beiden Varianten voll.
  const rab = (n: number) => Math.round(n * (1 - rabattProzent / 100) * 100) / 100
  const msMonat = rab(ms.grundgebuehrGesamt)
  const fwMonat = rab(fw.monatGesamt)

  function fillMix() {
    const v = Math.max(1, Math.round(ma * 0.16))
    const st = Math.round(ma * 0.32)
    const se = Math.max(0, ma - v - st)
    setVoll(v); setStd(st); setSelf(se)
  }

  function clampMa(raw: string) { const v = parseInt(raw, 10); return Number.isNaN(v) ? 1 : Math.min(9999, Math.max(1, v)) }
  function setStandortMa(i: number, raw: string) { setStandorte(standorte.map((x, j) => j === i ? { ...x, mitarbeiter: clampMa(raw) } : x)) }
  function setStandortName(i: number, name: string) { setStandorte(standorte.map((x, j) => j === i ? { ...x, name } : x)) }
  function addStandort() { setStandorte([...standorte, { name: '', mitarbeiter: 5 }]) }
  function removeStandort(i: number) { if (standorte.length > 1) setStandorte(standorte.filter((_, j) => j !== i)) }

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
      <p style={{ fontSize: '.9rem', color: '#8fa9b6', margin: '0 0 18px', textAlign: 'center' }}>
        Mitarbeiterzahl eingeben, Sitze dazubuchen — Ihr Preis rechnet sich live.
      </p>

      {/* Umschalter: ein Standort / mehrere Standorte */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '18px' }}>
        <button type="button" onClick={() => setMulti(false)} style={{ padding: '8px 16px', borderRadius: '999px', border: `1px solid ${!multi ? GOLD : 'rgba(122,163,179,0.3)'}`, background: !multi ? 'rgba(201,168,76,0.12)' : 'transparent', color: !multi ? GOLD : '#8fa9b6', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer' }}>Ein Standort</button>
        <button type="button" onClick={() => setMulti(true)} style={{ padding: '8px 16px', borderRadius: '999px', border: `1px solid ${multi ? GOLD : 'rgba(122,163,179,0.3)'}`, background: multi ? 'rgba(201,168,76,0.12)' : 'transparent', color: multi ? GOLD : '#8fa9b6', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer' }}>Mehrere Standorte</button>
      </div>

      {/* Laufzeit — wirkt auf beide Ansichten */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <span style={{ fontSize: '.85rem', color: '#8fa9b6' }}>Vertragslaufzeit:</span>
        {laufzeitOptionen().map((o) => {
          const aktiv = laufzeit === o.monate
          return (
            <button key={o.monate} type="button" onClick={() => setLaufzeit(o.monate)}
              style={{ padding: '8px 15px', borderRadius: '999px', border: `1px solid ${aktiv ? GOLD : 'rgba(122,163,179,0.3)'}`, background: aktiv ? 'rgba(201,168,76,0.14)' : 'transparent', color: aktiv ? GOLD : '#8fa9b6', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer' }}>
              {o.label}
            </button>
          )
        })}
      </div>

      {!multi && (
      <div style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '26px' }}>

        {/* Mitarbeiter + Grundgebühr */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', paddingBottom: '18px', borderBottom: '1px solid rgba(122,163,179,0.14)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#c4d3db' }}>Mitarbeiter im Betrieb:</span>
            <button type="button" onClick={() => setMa(Math.max(1, ma - 1))} style={stepBtn} aria-label="weniger">−</button>
            <input type="number" min={1} max={9999} value={ma} onChange={(e) => setMa(clampMa(e.target.value))} aria-label="Mitarbeiterzahl eingeben" style={numInput} />
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
            <p style={{ margin: 0, fontSize: '.8rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em' }}>Ihr Preis · {laufzeit} Monate</p>
            <p style={{ margin: '4px 0 0', fontSize: '.85rem', color: '#8fa9b6' }}>zuzüglich einmalig im 1. Monat: Einrichtung {setupText(ma)}</p>
            {mp.rabattBetrag > 0 && (
              <p style={{ margin: '6px 0 0', fontSize: '.85rem', color: GOLD }}>
                Sie sparen {fmt(mp.rabattBetrag)} € pro Monat — {fmt(Math.round(mp.rabattBetrag * laufzeit))} € über die Laufzeit.
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {mp.rabattBetrag > 0 && (
              <p style={{ margin: '0 0 2px', fontSize: '.9rem', color: '#8fa9b6', textDecoration: 'line-through' }}>{fmt(mp.nettoVorRabatt)} €</p>
            )}
            <p style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', color: GOLD, margin: 0, lineHeight: 1 }}>
              {fmt(total)} €<span style={{ fontSize: '.9rem', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span>
            </p>
          </div>
        </div>
      </div>
      )}

      {multi && (
      <div style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '26px' }}>
        <p style={{ fontSize: '.85rem', color: '#8fa9b6', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>Ihre Standorte</p>

        {standorte.map((st, i) => {
          const stufe = stufeFuerMitarbeiter(st.mitarbeiter)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(122,163,179,0.10)', flexWrap: 'wrap' }}>
              <input type="text" value={st.name} onChange={(e) => setStandortName(i, e.target.value)} placeholder={`Standort ${i + 1} (Name optional)`} style={{ flex: '1 1 160px', minWidth: 0, color: '#EAF1F6', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(122,163,179,0.25)', borderRadius: '8px', padding: '8px 10px', fontFamily: 'inherit', fontSize: '.9rem' }} />
              <button type="button" onClick={() => setStandortMa(i, String(st.mitarbeiter - 1))} style={stepBtn} aria-label="weniger">−</button>
              <input type="number" min={1} max={9999} value={st.mitarbeiter} onChange={(e) => setStandortMa(i, e.target.value)} aria-label="Mitarbeiter" style={numInput} />
              <button type="button" onClick={() => setStandortMa(i, String(st.mitarbeiter + 1))} style={stepBtn} aria-label="mehr">+</button>
              <span style={{ fontSize: '.78rem', color: TEAL, minWidth: '58px' }}>{stufe.name}</span>
              {standorte.length > 1 && (
                <button type="button" onClick={() => removeStandort(i)} aria-label="Standort entfernen" style={{ ...stepBtn, borderColor: 'rgba(122,163,179,0.3)', color: '#8fa9b6' }}>×</button>
              )}
            </div>
          )
        })}

        <button type="button" onClick={addStandort} style={{ marginTop: '14px', background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: '999px', padding: '9px 18px', color: GOLD, fontFamily: 'inherit', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer' }}>
          + Standort hinzufügen
        </button>

        {/* Vergleich: je Standort vs. firmenweit */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '22px' }}>
          <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.28)', borderRadius: '14px', padding: '18px' }}>
            <p style={{ margin: 0, fontSize: '.78rem', color: GOLD, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Je Standort · autonom</p>
            <p style={{ margin: '10px 0 0', color: '#EAF1F6', fontWeight: 700, fontSize: '1.35rem' }}>{euro(msMonat)}<span style={{ fontSize: '.8rem', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span></p>
            {rabattProzent > 0 && <p style={{ margin: '2px 0 0', fontSize: '.78rem', color: GOLD }}>statt {euro(ms.grundgebuehrGesamt)} — {rabattProzent} % Laufzeit-Rabatt</p>}
            <p style={{ margin: '4px 0 0', fontSize: '.8rem', color: '#8fa9b6' }}>+ einmalig Einrichtung {euro(ms.onboardingGesamt)}</p>
            <p style={{ margin: '8px 0 0', fontSize: '.72rem', color: '#7f97a4', lineHeight: 1.4 }}>Größter Standort 100 %, jeder weitere 40 % seiner eigenen Größe.</p>
          </div>
          <div style={{ background: 'rgba(122,163,179,0.06)', border: '1px solid rgba(122,163,179,0.22)', borderRadius: '14px', padding: '18px' }}>
            <p style={{ margin: 0, fontSize: '.78rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Firmenweit · ein Vertrag</p>
            <p style={{ margin: '10px 0 0', color: '#EAF1F6', fontWeight: 700, fontSize: '1.35rem' }}>{euro(fwMonat)}<span style={{ fontSize: '.8rem', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span></p>
            {rabattProzent > 0 && <p style={{ margin: '2px 0 0', fontSize: '.78rem', color: TEAL }}>statt {euro(fw.monatGesamt)} — {rabattProzent} % Laufzeit-Rabatt</p>}
            <p style={{ margin: '4px 0 0', fontSize: '.8rem', color: '#8fa9b6' }}>+ einmalig Einrichtung {euro(fw.einrichtungGesamt)}</p>
            <p style={{ margin: '8px 0 0', fontSize: '.72rem', color: '#7f97a4', lineHeight: 1.4 }}>{fmt(fw.gesamtMitarbeiter)} Mitarbeiter zusammen → Stufe {fw.stufe.name}. Enthält {fmt(Math.max(0, fw.standorte - 1))} × Standort-Zuschlag ({euro(fw.standortZuschlag)}/Mon., einmalig {euro(fw.standortEinrichtung)}).</p>
          </div>
        </div>
        <p style={{ fontSize: '.78rem', color: '#8fa9b6', textAlign: 'center', margin: '16px 0 0', lineHeight: 1.5 }}>
          Grobe Richtlinie fürs Beratungsgespräch · zzgl. Nutzer-Sitze je nach echter Nutzerzahl · welche Variante besser passt, klären wir gemeinsam.
        </p>
      </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <a href="#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: GOLD, color: NAVY, fontWeight: 600, fontSize: '.98rem', padding: '13px 28px', borderRadius: '10px', textDecoration: 'none', boxShadow: '0 10px 30px rgba(201,168,76,0.22)' }}>
          Dieses Angebot anfragen <span aria-hidden="true">→</span>
        </a>
      </div>

      <p style={{ fontSize: '.78rem', color: '#7f97a4', textAlign: 'center', margin: '16px 0 0', lineHeight: 1.5 }}>
        Unverbindliche Beispielrechnung · Preise netto, zzgl. 19 % MwSt. · Sitzpreise gestaffelt nach Betriebsgröße · Laufzeit-Rabatt ist eingerechnet — die einmalige Einrichtung wird nie rabattiert.
      </p>
    </div>
  )
}
