'use client'

import { useState, type CSSProperties } from 'react'
import { pruefeFirma, baueKiKontext, type FirmaFelder, type PruefStatus } from './firmaPruefung'

const CYAN = '#00e5ff'
const GOLD = '#C9A84C'

const ampelFarbe: Record<PruefStatus, string> = {
  ok: '#3ddc84',
  warnung: '#f59e0b',
  fehler: '#ef4444',
}

type KiAntwort = { ok: boolean; klartext?: string; punkte?: string[]; stimmung?: 'gut' | 'neutral' | 'achtung' }

const wrap: CSSProperties = { marginBottom: '24px' }

const keyframes =
  '@keyframes argoPruefPuls { 0%,100% { box-shadow: 0 0 0 1px rgba(0,229,255,0.35), 0 0 10px rgba(0,229,255,0.12); } 50% { box-shadow: 0 0 0 1px rgba(0,229,255,0.7), 0 0 18px rgba(0,229,255,0.4); } }'
  + ' .pruef-auge-puls { animation: argoPruefPuls 2.4s ease-in-out infinite; }'
  + ' .pruef-auge-btn:hover { filter: brightness(1.08); }'

const btn: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '14px 18px',
  borderRadius: '12px',
  border: '1px solid rgba(0,229,255,0.35)',
  background: 'rgba(0,229,255,0.06)',
  color: '#FFFFFF',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--font-dm-sans), sans-serif',
}
const btnOffen: CSSProperties = { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }

const panel: CSSProperties = {
  border: '1px solid rgba(0,229,255,0.35)',
  borderTop: 'none',
  borderBottomLeftRadius: '12px',
  borderBottomRightRadius: '12px',
  background: 'rgba(10,22,40,0.6)',
  padding: '18px',
}
const sektionTitel: CSSProperties = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: CYAN, margin: '0 0 12px' }
const zeileStil: CSSProperties = { display: 'flex', gap: '10px', alignItems: 'flex-start' }

export default function PruefAuge({ daten }: { daten: FirmaFelder }) {
  const [offen, setOffen] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const [ki, setKi] = useState<KiAntwort | null>(null)
  const [kiFehler, setKiFehler] = useState<string | null>(null)

  // Deterministischer Bericht: sofort, kostenlos, live aus den aktuellen Formularwerten.
  const bericht = pruefeFirma(daten)

  async function umschalten() {
    const neu = !offen
    setOffen(neu)
    // KI erst beim Oeffnen starten – geschlossen = keine Kosten.
    if (neu && ki === null && !laedt) {
      setLaedt(true)
      setKiFehler(null)
      try {
        const res = await fetch('/api/ki-auge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modul: 'Firmenprofil – Plausibilitaetspruefung',
            kontext: baueKiKontext(daten),
          }),
        })
        const data = (await res.json()) as KiAntwort
        if (data && data.ok) setKi(data)
        else setKiFehler('Die KI-Pruefung konnte nicht geladen werden.')
      } catch {
        setKiFehler('Verbindungsfehler bei der KI-Pruefung.')
      } finally {
        setLaedt(false)
      }
    }
  }

  const gesamtFarbe = ampelFarbe[bericht.gesamt]
  const gesamtText =
    bericht.gesamt === 'fehler' ? bericht.anzahlFehler + ' Fehler gefunden'
    : bericht.gesamt === 'warnung' ? bericht.anzahlWarnung + ' Hinweis(e)'
    : 'Alle Formalpruefungen bestanden'

  return (
    <div style={wrap}>
      <style>{keyframes}</style>
      <button
        onClick={umschalten}
        className={'pruef-auge-btn' + (offen ? '' : ' pruef-auge-puls')}
        style={{ ...btn, ...(offen ? btnOffen : null) }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>{'\uD83D\uDC41'}</span>
          <span>Firmendaten pruefen</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: gesamtFarbe, boxShadow: '0 0 8px ' + gesamtFarbe }} />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{offen ? 'schliessen' : gesamtText}</span>
        </span>
      </button>

      {offen ? (
        <div style={panel}>
          {/* Deterministische Formal-Checkliste */}
          <p style={sektionTitel}>Formale Pruefung</p>
          <div style={{ display: 'grid', gap: '8px', marginBottom: '22px' }}>
            {bericht.ergebnisse.map((r) => (
              <div key={r.feld + r.label} style={zeileStil}>
                <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: ampelFarbe[r.status], flexShrink: 0, marginTop: '5px' }} />
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', minWidth: '120px', fontWeight: 600 }}>{r.label}</span>
                <span style={{ fontSize: '13px', color: r.status === 'ok' ? 'rgba(255,255,255,0.8)' : ampelFarbe[r.status], lineHeight: 1.5 }}>{r.text}</span>
              </div>
            ))}
          </div>

          {/* KI-Plausibilitaet */}
          <p style={sektionTitel}>KI-Plausibilitaet</p>
          {laedt ? (
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Die KI prueft die Daten auf inhaltliche Stimmigkeit…</p>
          ) : kiFehler ? (
            <p style={{ fontSize: '13px', color: '#ef4444' }}>{kiFehler}</p>
          ) : ki ? (
            <div>
              {ki.klartext ? (
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.6, margin: '0 0 10px' }}>{ki.klartext}</p>
              ) : null}
              {ki.punkte && ki.punkte.length > 0 ? (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {ki.punkte.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                      <span style={{ color: GOLD }}>{'\u2192'}</span><span>{p}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
