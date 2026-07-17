'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/TerminPicker.tsx
// Termin-Kalender: Mo–Fr in Reihen über ~4 Wochen, aufklappbar.
// Mo–Do: stündliche Slots (09–17). Freitag (gold umrandet): 20-Minuten-Slots
// 08:00–12:00 — NUR für Betriebe mit 1–5 Mitarbeitern (Quickwins).
// Belegte Slots werden ausgegraut (aus /api/termine). Blockiert wird erst beim
// Absenden (Reservierung in der DB). Gibt (Anzeige, Schlüssel) zurück.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'

const GOLD = '#c9a84c'
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const WEEKDAY_TIMES = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']

function pad(n: number) { return n < 10 ? '0' + n : '' + n }
function ymd(d: Date) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
function fridayTimes() {
  const out: string[] = []
  for (let h = 8; h < 12; h++) for (const m of [0, 20, 40]) out.push(pad(h) + ':' + pad(m))
  return out // 08:00 … 11:40
}

type Day = { key: string; wd: string; label: string; year: number; isFri: boolean; bookable: boolean }

export default function TerminPicker({ ma, value, onChange }: { ma?: number; value: string; onChange: (display: string, key: string) => void }) {
  const [selKey, setSelKey] = useState('')
  const [time, setTime] = useState('')
  const [belegt, setBelegt] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    fetch('/api/termine')
      .then((r) => (r.ok ? r.json() : { belegt: [] }))
      .then((d) => { if (alive) setBelegt(new Set<string>(d.belegt || [])) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const weeks = useMemo<Day[][]>(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const monday = new Date(today); const dow = (monday.getDay() + 6) % 7; monday.setDate(monday.getDate() - dow)
    const rows: Day[][] = []
    for (let w = 0; w < 6 && rows.length < 4; w++) {
      const days: Day[] = []
      let hasFuture = false
      for (let i = 0; i < 5; i++) {
        const c = new Date(monday); c.setDate(monday.getDate() + w * 7 + i)
        const bookable = c >= tomorrow
        if (bookable) hasFuture = true
        days.push({ key: ymd(c), wd: WD[c.getDay()], label: pad(c.getDate()) + '.' + pad(c.getMonth() + 1) + '.', year: c.getFullYear(), isFri: c.getDay() === 5, bookable })
      }
      if (hasFuture) rows.push(days)
    }
    return rows
  }, [])

  const smallBiz = ma != null && ma <= 9
  const flat = useMemo(() => weeks.flat(), [weeks])

  const dayDisabled = (d: Day) => !d.bookable || (d.isFri && !smallBiz)
  const selDay = flat.find((d) => d.key === selKey && !dayDisabled(d))

  function pickDay(d: Day) {
    if (dayDisabled(d)) return
    setSelKey(d.key); setTime('')
  }
  function pickTime(d: Day, t: string) {
    const key = d.key + ' ' + t
    if (belegt.has(key)) return
    setTime(t)
    onChange(`${d.wd}, ${d.label}${d.year} um ${t}`, key)
  }

  const dayChip = (d: Day): React.CSSProperties => {
    const disabled = dayDisabled(d)
    const active = selKey === d.key && !disabled
    return {
      flex: 1, minWidth: 0, padding: '10px 4px', borderRadius: '10px', textAlign: 'center', lineHeight: 1.2,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
      border: `1px solid ${active ? 'rgba(201,168,76,0.85)' : d.isFri ? 'rgba(201,168,76,0.55)' : 'rgba(122,163,179,0.22)'}`,
      background: active ? 'rgba(201,168,76,0.14)' : 'rgba(234,241,246,0.04)',
      color: active ? GOLD : '#c4d3db',
    }
  }
  const timeChip = (taken: boolean, active: boolean): React.CSSProperties => ({
    padding: '9px 13px', borderRadius: '10px', fontSize: '.85rem', fontWeight: 600, whiteSpace: 'nowrap',
    cursor: taken ? 'default' : 'pointer', opacity: taken ? 0.3 : 1, textDecoration: taken ? 'line-through' : 'none',
    border: `1px solid ${active ? 'rgba(201,168,76,0.7)' : 'rgba(122,163,179,0.22)'}`,
    background: active ? 'rgba(201,168,76,0.12)' : 'rgba(234,241,246,0.04)',
    color: active ? GOLD : '#c4d3db',
  })

  const times = selDay ? (selDay.isFri ? fridayTimes() : WEEKDAY_TIMES) : []

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {weeks.map((row, wi) => (
          <div key={wi} style={{ display: 'flex', gap: '8px' }}>
            {row.map((d) => (
              <button key={d.key} type="button" onClick={() => pickDay(d)} disabled={dayDisabled(d)} style={dayChip(d)}>
                <span style={{ display: 'block', fontSize: '.7rem', opacity: 0.8 }}>{d.wd}</span>
                <span style={{ display: 'block', fontSize: '.85rem', fontWeight: 600 }}>{d.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <p style={{ fontSize: '.75rem', color: '#7f97a4', margin: '10px 0 0', lineHeight: 1.5 }}>
        <span style={{ color: GOLD }}>Freitag (gold umrandet)</span>: Kurz-Termine à 20 Min. — nur für Betriebe bis 9 Mitarbeiter.
      </p>

      {selDay && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
          {times.map((t) => {
            const taken = belegt.has(selDay.key + ' ' + t)
            return (
              <button key={t} type="button" onClick={() => pickTime(selDay, t)} disabled={taken} style={timeChip(taken, time === t)}>{t}</button>
            )
          })}
        </div>
      )}

      {value && (
        <p style={{ fontSize: '.85rem', color: GOLD, margin: '12px 0 0' }}>Wunschtermin: {value} Uhr</p>
      )}
    </div>
  )
}
