'use client'

import { useState, type CSSProperties } from 'react'
import {
  pruefeLieferantenListe,
  baueLieferantenKiKontext,
  type LieferantEingabe,
  type Schwere,
} from '../../_components/stammdatenPruefung'

const CYAN = '#00e5ff'
const GOLD = '#C9A84C'

const schwereFarbe: Record<Schwere, string> = {
  fehler: '#ef4444',
  warnung: '#f59e0b',
  info: '#00e5ff',
}
const schwereTitel: Record<Schwere, string> = {
  fehler: 'Fehler – dringend korrigieren',
  warnung: 'Warnungen',
  info: 'Hinweise',
}

type KiAntwort = { ok: boolean; klartext?: string; punkte?: string[]; stimmung?: 'gut' | 'neutral' | 'achtung' }

const wrap: CSSProperties = { marginBottom: '20px' }

const keyframes =
  '@keyframes argoLiefPuls { 0%,100% { box-shadow: 0 0 0 1px rgba(0,229,255,0.35), 0 0 10px rgba(0,229,255,0.12); } 50% { box-shadow: 0 0 0 1px rgba(0,229,255,0.7), 0 0 18px rgba(0,229,255,0.4); } }'
  + ' .lief-auge-puls { animation: argoLiefPuls 2.4s ease-in-out infinite; }'
  + ' .lief-auge-btn:hover { filter: brightness(1.08); }'

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

export default function LieferantenAuge({ lieferanten }: { lieferanten: LieferantEingabe[] }) {
  const [offen, setOffen] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const [ki, setKi] = useState<KiAntwort | null>(null)
  const [kiFehler, setKiFehler] = useState<string | null>(null)

  // Deterministischer Bericht: sofort, kostenlos, ueber ALLE Lieferanten.
  const bericht = pruefeLieferantenListe(lieferanten)

  async function umschalten() {
    const neu = !offen
    setOffen(neu)
    // KI erst beim Oeffnen – und nur wenn es ueberhaupt Auffaelligkeiten gibt (spart Kosten).
    if (neu && ki === null && !laedt && bericht.befunde.length > 0) {
      setLaedt(true)
      setKiFehler(null)
      try {
        const res = await fetch('/api/ki-auge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modul: 'Lieferanten – Stammdatenpruefung',
            kontext: baueLieferantenKiKontext(bericht),
          }),
        })
        const data = (await res.json()) as KiAntwort
        if (data && data.ok) setKi(data)
        else setKiFehler('Die KI-Zusammenfassung konnte nicht geladen werden.')
      } catch {
        setKiFehler('Verbindungsfehler bei der KI-Zusammenfassung.')
      } finally {
        setLaedt(false)
      }
    }
  }

  const alleSauber = bericht.befunde.length === 0
  const gesamtFarbe = bericht.anzahlFehler > 0 ? schwereFarbe.fehler : bericht.anzahlWarnung > 0 ? schwereFarbe.warnung : alleSauber ? '#3ddc84' : schwereFarbe.info
  const gesamtText = alleSauber
    ? 'Alle ' + bericht.gesamt + ' Lieferanten formal sauber'
    : bericht.anzahlFehler > 0
      ? bericht.anzahlFehler + ' Fehler, ' + bericht.anzahlWarnung + ' Warnungen'
      : bericht.betroffene + ' mit Auffaelligkeiten'

  const gruppen: Schwere[] = ['fehler', 'warnung', 'info']

  return (
    <div style={wrap}>
      <style>{keyframes}</style>
      <button
        onClick={umschalten}
        className={'lief-auge-btn' + (offen ? '' : ' lief-auge-puls')}
        style={{ ...btn, ...(offen ? btnOffen : null) }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>{'\uD83D\uDC41'}</span>
          <span>Lieferanten-Daten pruefen</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: gesamtFarbe, boxShadow: '0 0 8px ' + gesamtFarbe }} />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{offen ? 'schliessen' : gesamtText}</span>
        </span>
      </button>

      {offen ? (
        <div style={panel}>
          {alleSauber ? (
            <p style={{ fontSize: '14px', color: '#3ddc84', margin: 0 }}>
              Alle {bericht.gesamt} Lieferanten haben formal saubere Stammdaten (IBAN, E-Mail, Adresse). Keine Auffaelligkeiten.
            </p>
          ) : (
            <>
              {/* Deterministische Befunde, gruppiert nach Schwere */}
              {gruppen.map((g) => {
                const eintraege = bericht.befunde.filter((b) => b.schwere === g)
                if (eintraege.length === 0) return null
                return (
                  <div key={g} style={{ marginBottom: '18px' }}>
                    <p style={{ ...sektionTitel, color: schwereFarbe[g] }}>{schwereTitel[g]} ({eintraege.length})</p>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {eintraege.map((b, i) => (
                        <div key={b.id + i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          <span style={{ width: '9px', height: '9px', borderRadius: '999px', background: schwereFarbe[g], flexShrink: 0, marginTop: '5px' }} />
                          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', minWidth: '160px', fontWeight: 600 }}>{b.name}</span>
                          <span style={{ fontSize: '13px', color: schwereFarbe[g], lineHeight: 1.5 }}>{b.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* KI-Priorisierung */}
              <p style={sektionTitel}>KI-Empfehlung</p>
              {laedt ? (
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Die KI priorisiert die Befunde…</p>
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
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
