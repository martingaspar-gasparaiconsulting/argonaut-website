'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

export default function DashboardChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Willkommen bei ARGONAUT! \u26A1 Ich bin Ihr persönlicher KI-Assistent. Wie kann ich Ihnen heute helfen?\n\nSie können mich alles fragen — zu Ihren Agenten, Automatisierungen, Tools oder dem Onboarding.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', loading: true }])

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `Du bist der ARGONAUT KI-Assistent — der persönliche Assistent für Kunden von ARGONAUT OS.

ARGONAUT OS ist ein KI-Betriebssystem für den deutschen Mittelstand mit 24 KI-Agenten:
- A1 Empfänger (Kunden-Onboarding), A2 Schmied (Prozessautomatisierung), A3 Wächter (Sicherheit), A4 Buchhalter (Finanzen), A5 Schreiber (Content), A6 Planer (Termine), A7 Verkäufer (Lead-Generierung), A8 Regisseur (Projektsteuerung)
- B1 Forscher, B2 Übersetzer, B3 Moderator, B4 Personalchef, B5 Einkäufer
- C1 Analyst, C2 Stratege, C3 Jurist, C4 Trainer
- D1 Techniker, D2 Sicherheitschef, D3 Integrator
- E1 Netzwerker, E2 Botschafter, E3 Späher, E4 Assistent

Pakete: SOLO Beta (499€/Mo, 2 Agenten), START (1.500€, 8 Agenten), PRO (3.000€, 16 Agenten), BUSINESS (6.000€, 20 Agenten), ENTERPRISE (9.000€, 24 Agenten)

Deine Aufgaben:
- Beantworte Fragen zu ARGONAUT OS, Agenten und Automatisierungen
- Hilf beim Onboarding (API-Keys finden, Tools verbinden)
- Erkläre was welcher Agent macht
- Gib konkrete Schritt-für-Schritt Anleitungen
- Antworte immer auf Deutsch, freundlich und professionell
- Halte Antworten prägnant (max 200 Wörter)
- Bei technischen Problemen: konkrete Lösung nennen`,
          messages: messages
            .filter(m => !m.loading)
            .map(m => ({ role: m.role, content: m.content }))
            .concat([{ role: 'user', content: userMsg }]),
        }),
      })

      const data = await response.json()
      const reply = data.content?.[0]?.text || 'Entschuldigung, bitte versuchen Sie es erneut.'
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: reply, loading: false } : m))
    } catch {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: 'Verbindungsfehler. Bitte versuchen Sie es erneut.', loading: false } : m))
    }
    setLoading(false)
  }

  return (
    <>
      {/* CHAT FENSTER */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '90px', right: '24px', zIndex: 9999,
          width: '380px', background: '#0D1F3C',
          border: '1px solid rgba(201,168,76,0.35)', borderRadius: '20px',
          boxShadow: '0 16px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', background: 'rgba(201,168,76,0.1)', borderBottom: '1px solid rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(201,168,76,0.2)', border: '1px solid rgba(201,168,76,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚡</div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#FFFFFF', fontFamily: 'var(--font-syne), sans-serif' }}>ARGONAUT Assistent</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#22c55e' }}>● Online — antwortet sofort</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px' }}>×</button>
          </div>

          {/* Nachrichten */}
          <div style={{ height: '320px', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%', padding: '11px 15px',
                  borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: msg.role === 'user' ? '#C9A84C' : 'rgba(255,255,255,0.07)',
                  color: msg.role === 'user' ? '#0A1628' : '#FFFFFF',
                  fontSize: '13px', lineHeight: 1.55, fontWeight: msg.role === 'user' ? 600 : 400,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.loading ? (
                    <span style={{ opacity: 0.6 }}>tippt…</span>
                  ) : msg.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Schnellvorschläge */}
          {messages.length === 1 && (
            <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {['Was macht A1 Empfänger?', 'Wo finde ich meinen API-Key?', 'Wann bin ich live?'].map(q => (
                <button key={q} onClick={() => { setInput(q); }} style={{ padding: '6px 12px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '999px', color: '#C9A84C', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>{q}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ihre Frage..."
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '11px 14px', color: '#FFFFFF', fontSize: '13px', outline: 'none',
              }}
            />
            <button onClick={send} disabled={loading} style={{
              background: loading ? 'rgba(201,168,76,0.4)' : '#C9A84C',
              color: '#0A1628', border: 'none', borderRadius: '10px',
              padding: '11px 16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px',
            }}>→</button>
          </div>
        </div>
      )}

      {/* CHAT BUTTON */}
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          width: '60px', height: '60px', borderRadius: '50%',
          background: open ? '#0A1628' : '#C9A84C',
          border: open ? '2px solid rgba(201,168,76,0.5)' : 'none',
          boxShadow: '0 4px 24px rgba(201,168,76,0.35)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px', transition: 'all 0.2s',
        }}
      >
        {open ? (
          <span style={{ color: '#C9A84C', fontSize: '20px', fontWeight: 700 }}>×</span>
        ) : (
          <span>⚡</span>
        )}
      </button>
    </>
  )
}
