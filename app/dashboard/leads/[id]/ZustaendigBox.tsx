'use client'

// ARGONAUT OS · Paket 358 (13.10.2026) · VK1 — Zuständige an einem Lead.
// Setter und Closer getrennt. Ändern dürfen alle mit Schreibrecht „Leads"
// außer freien Settern (Datenbank-Wächter p358). Logik: lib/verkaufsteam.ts.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { auswahl, personName, zuweisungPruefen, funktionName, type Person } from '@/lib/verkaufsteam'
import { nichtsGeschrieben } from '@/lib/speichernPruefen'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
)

const box = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '18px 24px', marginBottom: '24px' }
const sel = { background: '#0F2036', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 12px', fontFamily: 'inherit', fontSize: '15px', minWidth: '200px' }
const label = { fontSize: '12px', color: '#C9A84C', letterSpacing: '0.12em', textTransform: 'uppercase' as const, fontWeight: 700, display: 'grid', gap: '6px' }

export default function ZustaendigBox({ leadId, team, setter, closer, frei, ich }: {
  leadId: string; team: Person[]; setter: string | null; closer: string | null; frei: boolean; ich: string | null
}) {
  const router = useRouter()
  const [s, setS] = useState(setter ?? '')
  const [c, setC] = useState(closer ?? '')
  const [busy, setBusy] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const geaendert = (s || null) !== (setter || null) || (c || null) !== (closer || null)

  async function speichern() {
    const neu = { setter_user_id: s || null, closer_user_id: c || null }
    const f = zuweisungPruefen(neu, team, frei)
    if (f.length) { setMeldung({ ok: false, text: f.join(' ') }); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.from('leads').update(neu).eq('id', leadId).select('id')
      if (error) { setMeldung({ ok: false, text: /Zuständige|gehört nicht/.test(error.message) ? error.message : 'Nicht gespeichert — dafür ist das Schreibrecht „Leads" nötig (und SQL Paket 358).' }); return }
      if (nichtsGeschrieben(data)) { setMeldung({ ok: false, text: 'Nicht gespeichert — dafür ist das Schreibrecht „Leads" nötig.' }); return }
      setMeldung({ ok: true, text: 'Zuständige gespeichert.' })
      router.refresh()
    } finally { setBusy(false) }
  }

  if (!team.length) return null
  if (frei) {
    return (
      <div style={box}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '15px' }}>
          👤 Setter: {personName(team, setter) ?? '—'}{closer ? ` · Closer: ${personName(team, closer)}` : ''}{setter === ich ? ' (Sie)' : ''}
        </span>
      </div>
    )
  }
  const opt = (p: Person) => <option key={p.user_id} value={p.user_id}>{p.name}{p.funktion ? ` · ${funktionName(p.funktion)}` : ''}{p.frei ? ' · frei' : ''}{p.aktiv ? '' : ' (inaktiv)'}</option>
  return (
    <div style={box}>
      <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={label}>Setter
          <select style={sel} value={s} onChange={(e) => { setS(e.target.value); setMeldung(null) }}>
            <option value="">— niemand —</option>
            {auswahl(team, 'setter', setter).map(opt)}
          </select>
        </label>
        <label style={label}>Closer
          <select style={sel} value={c} onChange={(e) => { setC(e.target.value); setMeldung(null) }}>
            <option value="">— niemand —</option>
            {auswahl(team, 'closer', closer).map(opt)}
          </select>
        </label>
        {ich && !s && <button style={{ ...sel, minWidth: 0, cursor: 'pointer' }} onClick={() => setS(ich)}>Ich übernehme</button>}
        <button disabled={!geaendert || busy} onClick={() => void speichern()}
          style={{ background: geaendert ? '#C9A84C' : 'transparent', color: geaendert ? '#0A1628' : 'rgba(255,255,255,0.4)', border: '1px solid #C9A84C', borderRadius: '10px', padding: '9px 18px', fontWeight: 800, fontFamily: 'inherit', cursor: geaendert ? 'pointer' : 'default' }}>
          {busy ? 'Speichert …' : 'Zuständige speichern'}
        </button>
      </div>
      {meldung && <p style={{ margin: '10px 0 0', color: meldung.ok ? '#3ddc84' : '#E06666', fontSize: '14px' }}>{meldung.text}</p>}
    </div>
  )
}
