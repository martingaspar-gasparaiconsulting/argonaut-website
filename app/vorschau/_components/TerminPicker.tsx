'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/TerminPicker.tsx
// Einfacher eigener Termin-Picker: nächste Werktage als Chips + Uhrzeit-Slots.
// Noch ohne Verfügbarkeits-Logik (kommt mit dem Buchungs-Baustein). Gibt einen
// lesbaren String zurück, z. B. "Di, 22.07.2026 um 10:00".
// ============================================================================

import { useMemo, useState } from 'react'

const GOLD = '#c9a84c'
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const TIMES = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']

function pad(n: number) { return n < 10 ? '0' + n : '' + n }

export default function TerminPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [dateKey, setDateKey] = useState('')
  const [time, setTime] = useState('')

  // Nächste 10 Werktage (Mo–Fr), ab morgen.
  const days = useMemo(() => {
    const out: { key: string; wd: string; label: string; d: Date }[] = []
    const base = new Date(); base.setHours(0, 0, 0, 0)
    let i = 1
    while (out.length < 10) {
      const c = new Date(base); c.setDate(base.getDate() + i); i++
      const dow = c.getDay()
      if (dow === 0 || dow === 6) continue
      const key = `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`
      out.push({ key, wd: WD[dow], label: `${pad(c.getDate())}.${pad(c.getMonth() + 1)}.`, d: c })
    }
    return out
  }, [])

  function pick(nextKey: string, nextTime: string) {
    setDateKey(nextKey); setTime(nextTime)
    if (nextKey && nextTime) {
      const day = days.find((d) => d.key === nextKey)
      if (day) onChange(`${day.wd}, ${day.label}${day.d.getFullYear()} um ${nextTime}`)
    } else {
      onChange('')
    }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '9px 13px', borderRadius: '10px', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600, whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'rgba(201,168,76,0.7)' : 'rgba(122,163,179,0.22)'}`,
    background: active ? 'rgba(201,168,76,0.12)' : 'rgba(234,241,246,0.04)',
    color: active ? GOLD : '#c4d3db',
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: dateKey ? '12px' : 0 }}>
        {days.map((d) => (
          <button key={d.key} type="button" onClick={() => pick(d.key, time)} style={{ ...chip(dateKey === d.key), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', lineHeight: 1.2 }}>
            <span style={{ fontSize: '.72rem', opacity: 0.8 }}>{d.wd}</span>
            <span>{d.label}</span>
          </button>
        ))}
      </div>
      {dateKey && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TIMES.map((t) => (
            <button key={t} type="button" onClick={() => pick(dateKey, t)} style={chip(time === t)}>{t}</button>
          ))}
        </div>
      )}
      {value && (
        <p style={{ fontSize: '.85rem', color: GOLD, margin: '12px 0 0' }}>Wunschtermin: {value} Uhr</p>
      )}
    </div>
  )
}
