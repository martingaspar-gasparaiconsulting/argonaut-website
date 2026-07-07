'use client'

import { useState, type CSSProperties } from 'react'

const NAVY2 = '#0F1F33'
const GOLD = '#C9A84C'
const CYAN = '#00e5ff'

type Props = {
  chefName: string
  jahr: number
  einnahmen: number
  gewinn: number
  rechnungenOffen: number
  rechnungenOffenSumme: number
  rechnungenUeberfaellig: number
  leadsOffen: number
  chancenAktiv: number
  chancenSumme: number
  auftraegeOffen: number
  projekteLaufend: number
  kranke: number
  krankeDetails: string[]
  offeneGenehmigungen: number
  eingestempelt: number
  feedCount: number
}

type KiAntwort = { ok: boolean; klartext?: string; punkte?: string[]; stimmung?: 'gut' | 'neutral' | 'achtung' }

const stimmungFarbe: Record<string, string> = { gut: '#3ddc84', neutral: GOLD, achtung: '#ef4444' }
const stimmungLabel: Record<string, string> = { gut: 'Alles im grünen Bereich', neutral: 'Einiges zu tun', achtung: 'Achtung nötig' }

function euro(n: number): string {
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
  } catch {
    return Math.round(n || 0) + ' €'
  }
}

function baueKontext(p: Props): string {
  return [
    'Finanzen: Einnahmen ' + p.jahr + ' ' + euro(p.einnahmen) + ' netto, Gewinn ' + euro(p.gewinn) + '. '
      + 'Offene Rechnungen: ' + p.rechnungenOffen + ' (' + euro(p.rechnungenOffenSumme) + ' offen), davon ' + p.rechnungenUeberfaellig + ' ueberfaellig.',
    'Vertrieb: ' + p.leadsOffen + ' offene Leads, ' + p.chancenAktiv + ' aktive Verkaufschancen (Pipeline ' + euro(p.chancenSumme) + '), ' + p.auftraegeOffen + ' offene Auftraege.',
    'Betrieb: ' + p.projekteLaufend + ' laufende Projekte.',
    'Personal: ' + p.kranke + ' krank gemeldet' + (p.krankeDetails.length ? ' (' + p.krankeDetails.join(', ') + ')' : '')
      + ', ' + p.offeneGenehmigungen + ' offene Genehmigungen, ' + p.eingestempelt + ' Person(en) jetzt eingestempelt.',
    'Aktivitaet letzte 24 Stunden: ' + p.feedCount + ' Ereignisse.',
    '',
    'Erstelle daraus einen kurzen, souveraenen Tagesbericht fuer den Chef (ein "Willkommen zurueck"-Briefing): '
      + '2-4 Saetze Klartext, was heute wirklich wichtig ist und worauf er sich konzentrieren sollte, '
      + 'und danach die konkreten naechsten Schritte als kurze Stichpunkte (mit Namen/Zahlen wo vorhanden). '
      + 'Sprich den Chef direkt an, sachlich und motivierend, ohne Floskeln.',
  ].join('\n')
}

export default function ChefCockpit(props: Props) {
  const [laedt, setLaedt] = useState(false)
  const [ki, setKi] = useState<KiAntwort | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [spricht, setSpricht] = useState(false)

  const ttsVerfuegbar = typeof window !== 'undefined' && 'speechSynthesis' in window

  async function berichtErstellen() {
    setLaedt(true)
    setFehler(null)
    try {
      const res = await fetch('/api/ki-auge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modul: 'Chef-Cockpit Tagesbericht', kontext: baueKontext(props) }),
      })
      const data = (await res.json()) as KiAntwort
      if (data && data.ok) setKi(data)
      else setFehler('Der Tagesbericht konnte nicht erstellt werden.')
    } catch {
      setFehler('Verbindungsfehler beim Erstellen des Tagesberichts.')
    } finally {
      setLaedt(false)
    }
  }

  function vorlesen() {
    if (!ttsVerfuegbar || !ki) return
    const text = [ki.klartext || '', ...(ki.punkte || [])].filter(Boolean).join('. ')
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'de-DE'
    const stimmen = window.speechSynthesis.getVoices()
    const de = stimmen.find((v) => v.lang && v.lang.toLowerCase().startsWith('de'))
    if (de) utter.voice = de
    utter.onend = () => setSpricht(false)
    utter.onerror = () => setSpricht(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
    setSpricht(true)
  }

  function stopp() {
    if (!ttsVerfuegbar) return
    window.speechSynthesis.cancel()
    setSpricht(false)
  }

  const stimmung = ki?.stimmung || 'neutral'
  const akzent = stimmungFarbe[stimmung] || GOLD

  return (
    <section style={wrap}>
      <div style={karte}>
        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: ki || laedt ? '18px' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={augeKreis}>
              <span style={{ fontSize: '22px' }}>{'\uD83D\uDC41'}</span>
            </div>
            <div>
              <h2 style={titel}>Dein Betrieb heute</h2>
              <p style={untertitel}>Ein Klick – die KI fasst zusammen, worauf es heute ankommt, und liest es dir vor.</p>
            </div>
          </div>

          {!ki && !laedt ? (
            <button onClick={berichtErstellen} style={hauptBtn} className="cockpit-btn">
              Tagesbericht erstellen
            </button>
          ) : null}
        </div>

        {/* Ladezustand */}
        {laedt ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255,255,255,0.6)', fontSize: '14px', paddingTop: '4px' }}>
            <span style={pulsPunkt} />
            Die KI wertet deinen Betrieb aus…
          </div>
        ) : null}

        {/* Fehler */}
        {fehler ? (
          <p style={{ color: '#ef4444', fontSize: '14px', margin: '4px 0 0' }}>{fehler}</p>
        ) : null}

        {/* Bericht */}
        {ki && !laedt ? (
          <div>
            {/* Stimmungs-Badge + Vorlese-Steuerung */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: akzent, background: akzent + '1e', border: '1px solid ' + akzent + '55', borderRadius: '999px', padding: '5px 12px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: akzent, display: 'inline-block' }} />
                {stimmungLabel[stimmung] || 'Überblick'}
              </span>

              {ttsVerfuegbar ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!spricht ? (
                    <button onClick={vorlesen} style={nebenBtn} className="cockpit-btn">🔊 Vorlesen</button>
                  ) : (
                    <button onClick={stopp} style={{ ...nebenBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }} className="cockpit-btn">⏹ Stopp</button>
                  )}
                  <button onClick={berichtErstellen} style={nebenBtn} className="cockpit-btn">↻ Neu</button>
                </div>
              ) : (
                <button onClick={berichtErstellen} style={nebenBtn} className="cockpit-btn">↻ Neu</button>
              )}
            </div>

            {/* Klartext */}
            {ki.klartext ? (
              <p style={{ fontSize: '16px', lineHeight: 1.65, color: 'rgba(255,255,255,0.9)', margin: '0 0 16px' }}>{ki.klartext}</p>
            ) : null}

            {/* Aktionspunkte */}
            {ki.punkte && ki.punkte.length > 0 ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {ki.punkte.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>
                    <span style={{ color: GOLD, fontWeight: 800, flexShrink: 0 }}>{'\u2192'}</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <style>{cockpitCss}</style>
    </section>
  )
}

const wrap: CSSProperties = { marginBottom: '28px' }

const karte: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(0,229,255,0.06) 0%, rgba(201,168,76,0.05) 100%)',
  border: '1px solid rgba(0,229,255,0.25)',
  borderRadius: '18px',
  padding: '24px 26px',
}

const augeKreis: CSSProperties = {
  width: '46px',
  height: '46px',
  borderRadius: '14px',
  background: 'rgba(0,229,255,0.1)',
  border: '1px solid rgba(0,229,255,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const titel: CSSProperties = { fontSize: 'clamp(18px, 2vw, 24px)', fontWeight: 900, margin: 0, color: '#FFFFFF', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }
const untertitel: CSSProperties = { fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }

const hauptBtn: CSSProperties = {
  background: GOLD,
  color: '#0A1628',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 22px',
  fontSize: '14px',
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif',
}

const nebenBtn: CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  color: '#FFFFFF',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '9px',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const pulsPunkt: CSSProperties = {
  width: '10px',
  height: '10px',
  borderRadius: '999px',
  background: CYAN,
  display: 'inline-block',
  boxShadow: '0 0 10px ' + CYAN,
}

const cockpitCss =
  '.cockpit-btn:hover { filter: brightness(1.1); }'
