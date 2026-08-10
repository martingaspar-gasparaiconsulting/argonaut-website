'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/BranchenChat.tsx  (13.3)
// Branchenbewusster KI-Dialog auf der Branchen-Seite. Fragt /api/oeffentlich/
// branchen-chat (Haiku, günstig). Klar als KI gekennzeichnet (AI-Act).
// ============================================================================

import { useState, useRef, useEffect } from 'react'

const GOLD = '#c9a84c'

type Msg = { role: 'user' | 'assistant'; text: string }

export default function BranchenChat({ slug, name }: { slug: string; name: string }) {
  const [verlauf, setVerlauf] = useState<Msg[]>([])
  const [frage, setFrage] = useState('')
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [verlauf, laedt])

  const vorschlaege = [
    `Was kann ARGONAUT für ${name}?`,
    'Welche Programme ersetzt es?',
    'Was kostet das?',
  ]

  async function senden(text: string) {
    const f = text.trim()
    if (!f || laedt) return
    setFehler(null)
    const neuerVerlauf: Msg[] = [...verlauf, { role: 'user', text: f }]
    setVerlauf(neuerVerlauf)
    setFrage('')
    setLaedt(true)
    try {
      const res = await fetch('/api/oeffentlich/branchen-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, frage: f, verlauf: neuerVerlauf.slice(-6) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.antwort) {
        setFehler(j.error || 'Es ist ein Fehler aufgetreten.')
      } else {
        setVerlauf((v) => [...v, { role: 'assistant', text: j.antwort }])
      }
    } catch {
      setFehler('Netzwerkfehler. Bitte später erneut versuchen.')
    }
    setLaedt(false)
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <style>{`
        .bc-box{background:linear-gradient(160deg,rgba(18,32,54,0.9),rgba(10,22,40,0.9));border:1px solid rgba(201,168,76,0.22);border-radius:18px;padding:22px}
        .bc-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
        .bc-title{font-weight:700;font-size:1.15rem;color:#EAF1F6}
        .bc-badge{font-size:.66rem;font-weight:700;letter-spacing:.04em;color:${GOLD};background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.3);border-radius:999px;padding:2px 9px}
        .bc-sub{color:#8fa9b6;font-size:.85rem;margin:0 0 14px}
        .bc-scroll{max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;margin-bottom:12px}
        .bc-msg{padding:11px 14px;border-radius:12px;font-size:.95rem;line-height:1.5;max-width:85%;white-space:pre-wrap}
        .bc-user{align-self:flex-end;background:rgba(201,168,76,0.14);border:1px solid rgba(201,168,76,0.3);color:#EAF1F6}
        .bc-ai{align-self:flex-start;background:rgba(122,163,179,0.06);border:1px solid rgba(122,163,179,0.16);color:#d4e0e7}
        .bc-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
        .bc-chip{background:rgba(122,163,179,0.06);border:1px solid rgba(122,163,179,0.18);border-radius:999px;padding:8px 14px;font-size:.85rem;color:#c4d3db;cursor:pointer;font-family:inherit}
        .bc-chip:hover{border-color:rgba(201,168,76,0.5);color:#EAF1F6}
        .bc-row{display:flex;gap:8px}
        .bc-input{flex:1;background:rgba(234,241,246,0.04);border:1px solid rgba(122,163,179,0.22);border-radius:10px;padding:12px 14px;color:#EAF1F6;font-size:.95rem;outline:none;font-family:inherit}
        .bc-send{background:${GOLD};color:#0A1628;font-weight:700;border:none;border-radius:10px;padding:0 20px;cursor:pointer;font-family:inherit}
        .bc-send:disabled{opacity:.6;cursor:default}
        .bc-note{font-size:.75rem;color:#7f97a4;margin:10px 0 0;text-align:center}
        .bc-err{color:#f0a3a3;font-size:.85rem;margin:8px 0 0}
      `}</style>
      <div className="bc-box">
        <div className="bc-head">
          <span style={{ fontSize: '1.3rem' }} aria-hidden="true">🔱</span>
          <span className="bc-title">Fragen Sie ARGONAUT für {name}</span>
          <span className="bc-badge">KI</span>
        </div>
        <p className="bc-sub">Stellen Sie Ihre Frage — die KI antwortet direkt für Ihre Branche.</p>

        {verlauf.length > 0 && (
          <div className="bc-scroll" ref={boxRef}>
            {verlauf.map((m, i) => (
              <div key={i} className={`bc-msg ${m.role === 'user' ? 'bc-user' : 'bc-ai'}`}>{m.text}</div>
            ))}
            {laedt && <div className="bc-msg bc-ai">…</div>}
          </div>
        )}

        {verlauf.length === 0 && (
          <div className="bc-chips">
            {vorschlaege.map((v) => (
              <button key={v} type="button" className="bc-chip" onClick={() => senden(v)}>{v}</button>
            ))}
          </div>
        )}

        <form className="bc-row" onSubmit={(e) => { e.preventDefault(); senden(frage) }}>
          <input
            className="bc-input"
            value={frage}
            onChange={(e) => setFrage(e.target.value)}
            placeholder={`Ihre Frage zu ARGONAUT für ${name} …`}
            maxLength={500}
            aria-label="Ihre Frage"
          />
          <button type="submit" className="bc-send" disabled={laedt || !frage.trim()}>{laedt ? '…' : 'Fragen'}</button>
        </form>

        {fehler && <p className="bc-err">{fehler}</p>}
        <p className="bc-note">KI-Assistenz · Antworten können Fehler enthalten und ersetzen keine Beratung.</p>
      </div>
    </div>
  )
}
