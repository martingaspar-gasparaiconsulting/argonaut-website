'use client'

import { useState, type CSSProperties } from 'react'

export type Lead = {
  id: string
  created_at: string
  name: string | null
  telefon: string | null
  email: string | null
  dienstleistung: string | null
  menge: string | null
  einheit: string | null
  wunschtermin: string | null
  nachricht: string | null
  status: string | null
  intent: string | null
  score: number | null
  zusammenfassung: string | null
  quelle: string | null
  ist_bestand: boolean | null
}

type StatusKey = 'neu' | 'offen' | 'gewonnen' | 'verloren'

const STATUS: Record<StatusKey, { label: string; color: string }> = {
  neu:      { label: 'Neu',      color: '#00e5ff' },
  offen:    { label: 'Offen',    color: '#f59e0b' },
  gewonnen: { label: 'Gewonnen', color: '#22c55e' },
  verloren: { label: 'Verloren', color: '#ef4444' },
}

const STATUS_REIHENFOLGE: StatusKey[] = ['neu', 'offen', 'gewonnen', 'verloren']

const css = [
  '.arg-leads button:hover { filter: brightness(1.12); }',
  '.arg-leads .lead-card { transition: border-color .15s ease, transform .15s ease; }',
  '.arg-leads .lead-card:hover { border-color: rgba(201,168,76,0.4); transform: translateY(-1px); }',
].join('\n')

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  } catch {
    return '—'
  }
}

function statusInfo(s: string | null): { label: string; color: string } {
  if (s && s in STATUS) return STATUS[s as StatusKey]
  return { label: s || 'Unbekannt', color: '#9AA7B5' }
}

function pillStyle(active: boolean, accent: string): CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 700,
    border: active ? '1px solid ' + accent + '88' : '1px solid rgba(255,255,255,0.12)',
    background: active ? accent + '22' : 'rgba(255,255,255,0.04)',
    color: active ? accent : 'rgba(255,255,255,0.65)',
    cursor: 'pointer',
    transition: 'all .15s ease',
  }
}

const labelStyle: CSSProperties = { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px', fontWeight: 700 }
const cardStyle: CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '18px 20px' }

export default function LeadsClient({ leads }: { leads: Lead[] }) {
  const [status, setStatus] = useState<'alle' | StatusKey>('alle')
  const [herkunft, setHerkunft] = useState<'alle' | 'neu' | 'bestand'>('alle')

  const nachHerkunft = leads.filter((l) =>
    herkunft === 'alle' ? true : herkunft === 'bestand' ? l.ist_bestand === true : l.ist_bestand !== true
  )
  const gefiltert = nachHerkunft.filter((l) => (status === 'alle' ? true : l.status === status))
  const zaehle = (s: StatusKey) => nachHerkunft.filter((l) => l.status === s).length

  const neueWartend = leads.filter((l) => l.status === 'neu' && l.ist_bestand !== true).length
  const anzahlNeu = leads.filter((l) => l.ist_bestand !== true).length
  const anzahlBestand = leads.filter((l) => l.ist_bestand === true).length

  return (
    <div className="arg-leads">
      <style>{css}</style>

      {neueWartend > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.35)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00e5ff', flexShrink: 0, boxShadow: '0 0 10px #00e5ff' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
            {neueWartend === 1 ? '1 neue Anfrage wartet auf Reaktion' : neueWartend + ' neue Anfragen warten auf Reaktion'}
          </span>
        </div>
      ) : null}

      <div style={{ marginBottom: '22px' }}>
        <p style={labelStyle}>Herkunft</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <button onClick={() => setHerkunft('alle')} style={pillStyle(herkunft === 'alle', '#C9A84C')}>Alle ({leads.length})</button>
          <button onClick={() => setHerkunft('neu')} style={pillStyle(herkunft === 'neu', '#C9A84C')}>Neue Anfragen ({anzahlNeu})</button>
          <button onClick={() => setHerkunft('bestand')} style={pillStyle(herkunft === 'bestand', '#C9A84C')}>Bestand ({anzahlBestand})</button>
        </div>

        <p style={labelStyle}>Status</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setStatus('alle')} style={pillStyle(status === 'alle', '#C9A84C')}>Alle ({nachHerkunft.length})</button>
          {STATUS_REIHENFOLGE.map((s) => (
            <button key={s} onClick={() => setStatus(s)} style={pillStyle(status === s, STATUS[s].color)}>{STATUS[s].label} ({zaehle(s)})</button>
          ))}
        </div>
      </div>

      {gefiltert.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'rgba(255,255,255,0.45)', padding: '40px 20px' }}>
          Keine Anfragen in dieser Ansicht.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {gefiltert.map((l) => {
            const si = statusInfo(l.status)
            return (
              <div key={l.id} className="lead-card" style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>{l.name || 'Ohne Namen'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: si.color, background: si.color + '22', border: '1px solid ' + si.color + '55', borderRadius: '999px', padding: '3px 10px' }}>{si.label}</span>
                    {l.ist_bestand ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#9AA7B5', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '3px 10px' }}>Bestand</span>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#C9A84C', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '999px', padding: '3px 10px' }}>Neue Anfrage</span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{formatDate(l.created_at)}</span>
                </div>

                <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>
                  {l.telefon ? <span>Tel: {l.telefon}</span> : null}
                  {l.email ? <span>E-Mail: {l.email}</span> : null}
                </div>

                <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                  {l.dienstleistung ? <span>Leistung: {l.dienstleistung}</span> : null}
                  {(l.menge || l.einheit) ? <span>Menge: {(l.menge || '') + ' ' + (l.einheit || '')}</span> : null}
                  {l.wunschtermin ? <span>Wunschtermin: {l.wunschtermin}</span> : null}
                  {l.quelle ? <span>Quelle: {l.quelle}</span> : null}
                </div>

                {l.nachricht ? (
                  <p style={{ margin: '12px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{l.nachricht}</p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
