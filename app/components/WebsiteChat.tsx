'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

const SALES_PROMPT = `Du bist ARGO \u2014 der KI-Verkaufsassistent von ARGONAUT OS.

\u2550\u2550\u2550 DEINE ROLLE \u2550\u2550\u2550
Du bist kein Support-Assistent. Du bist ein freundlicher, kompetenter Berater der Interessenten hilft das richtige ARGONAUT-Paket zu finden und zum Kauf zu f\u00fchren.

\u2550\u2550\u2550 VERKAUFSSTRATEGIE \u2550\u2550\u2550
- H\u00f6re zu was der Interessent macht/braucht
- Empfehle IMMER zuerst SOLO Beta als risikofreien Einstieg (nur 499\u20ac, 3 Monate)
- Bei gr\u00f6\u00dferen Unternehmen (10+ Mitarbeiter, mehrere Standorte): START oder h\u00f6her empfehlen
- Bei mehreren Standorten: SOFORT auf Multistandort-L\u00f6sung hinweisen (argonaut-os.com/multistandort)
- Ziel: Interessent auf "Jetzt Paket w\u00e4hlen" oder Multistandort-Anfrage leiten

\u2550\u2550\u2550 KRITISCHE FAKTEN \u2550\u2550\u2550
- Go-Live: 24 Stunden nach Kauf \u2014 GARANTIERT
- Keine Agentur, kein Berater \u2014 reines KI-Betriebssystem
- 1.229 vorgefertigte Automatisierungen
- 110 Branchen abgedeckt
- Keine Setup-Geb\u00fchr, keine versteckten Kosten

\u2550\u2550\u2550 PAKETE \u2550\u2550\u2550
SOLO Beta: 499\u20ac/Mo \u2014 Perfekter Einstieg, 2 Agenten, 3 Monate testen
START: 1.500\u20ac/Mo \u2014 F\u00fcr wachsende Unternehmen, 8 Agenten
PRO: 3.000\u20ac/Mo \u2014 F\u00fcr etablierte Betriebe, 16 Agenten
BUSINESS: 6.000\u20ac/Mo \u2014 F\u00fcr gr\u00f6\u00dfere Unternehmen, 20 Agenten
ENTERPRISE: 9.000\u20ac/Mo \u2014 Vollst\u00e4ndiges System, alle 24 Agenten
Multistandort: Individuelle Preise \u2014 ab 2 Standorten

\u2550\u2550\u2550 GESPRÄCHSF\u00dcHRUNG \u2550\u2550\u2550
- Frage nach Branche und Mitarbeiteranzahl wenn unklar
- Nenne konkrete Vorteile f\u00fcr ihre Branche
- Bei Zweifeln: "SOLO Beta ist das perfekte Einstiegspaket \u2014 nur 499\u20ac, kein Risiko"
- Bei mehreren Standorten: "Das klingt nach unserer Multistandort-L\u00f6sung \u2014 soll ich Ihnen mehr dazu erkl\u00e4ren?"
- Immer mit klarem CTA enden: Paket w\u00e4hlen oder Gespr\u00e4ch vereinbaren

\u2550\u2550\u2550 STIL \u2550\u2550\u2550
- Immer Deutsch
- Freundlich, kompetent, nicht aufdringlich
- Kurz und pr\u00e4gnant (max 120 W\u00f6rter)
- Du hei\u00dft ARGO`

export default function WebsiteChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hallo! Ich bin ARGO \u2014 Ihr ARGONAUT Assistent. \u26A1\n\nWie kann ich Ihnen helfen? Ich beantworte alle Fragen zu ARGONAUT OS und helfe Ihnen das richtige Paket zu finden.',
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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: SALES_PROMPT,
          messages: messages
            .filter(m => !m.loading)
            .map(m => ({ role: m.role, content: m.content }))
            .concat([{ role: 'user', content: userMsg }]),
        }),
      })
      const data = await res.json()
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: data.reply, loading: false } : m))
    } catch {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: 'Verbindungsfehler. Bitte erneut versuchen.', loading: false } : m))
    }
    setLoading(false)
  }

  const quickQuestions = [
    'Welches Paket passt zu mir?',
    'Was kostet ARGONAUT?',
    'Ich habe mehrere Standorte',
    'Wie schnell bin ich live?',
  ]

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed', bottom: '90px', right: '24px', zIndex: 9999,
          width: '360px', background: '#0A1628',
          border: '1px solid rgba(201,168,76,0.4)', borderRadius: '20px',
          boxShadow: '0 16px 64px rgba(0,0,0,0.5)', overflow: 'hidden',
          fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif',
        }}>
          <div style={{ padding: '16px 20px', background: 'rgba(201,168,76,0.12)', borderBottom: '1px solid rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚡</div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#FFFFFF' }}>ARGO \u2014 ARGONAUT Assistent</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#22c55e' }}>● Online \u2014 antwortet sofort</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px' }}>×</button>
          </div>

          <div style={{ height: '300px', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%', padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: msg.role === 'user' ? '#C9A84C' : 'rgba(255,255,255,0.07)',
                  color: msg.role === 'user' ? '#0A1628' : '#FFFFFF',
                  fontSize: '13px', lineHeight: 1.55, fontWeight: msg.role === 'user' ? 600 : 400,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.loading ? <span style={{ opacity: 0.5 }}>tippt\u2026</span> : msg.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {quickQuestions.map(q => (
                <button key={q} onClick={() => setInput(q)} style={{ padding: '6px 12px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '999px', color: '#C9A84C', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>{q}</button>
              ))}
            </div>
          )}

          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ihre Frage..."
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '10px 14px', color: '#FFFFFF', fontSize: '13px', outline: 'none' }}
            />
            <button onClick={send} disabled={loading} style={{ background: loading ? 'rgba(201,168,76,0.4)' : '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '10px', padding: '10px 14px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px' }}>→</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          width: '60px', height: '60px', borderRadius: '50%',
          background: open ? '#0A1628' : '#C9A84C',
          border: open ? '2px solid #C9A84C' : 'none',
          boxShadow: '0 4px 32px rgba(201,168,76,0.4)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '26px', transition: 'all 0.2s',
        }}
      >
        {open ? <span style={{ color: '#C9A84C', fontSize: '22px', fontWeight: 700 }}>×</span> : <span>⚡</span>}
      </button>
    </>
  )
}
