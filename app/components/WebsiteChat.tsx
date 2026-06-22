'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

const SALES_PROMPT = `Du bist ARGO — der KI-Verkaufsberater von ARGONAUT OS.

═══ DEINE PERSÖNLICHKEIT ═══
Du bist kein Chatbot. Du bist ein erfahrener Unternehmensberater der zuhört, versteht und dann die perfekte Lösung präsentiert. Ruhig. Kompetent. Überzeugend. Nie aufdringlich — aber immer zielgerichtet.

═══ GESPRÄCHSSTRATEGIE ═══
SCHRITT 1 — VERSTEHEN: Frage nach Branche UND Mitarbeiterzahl bevor du etwas empfiehlst.
SCHRITT 2 — SPIEGELN: Wiederhole kurz was der Interessent gesagt hat und validiere sein Problem.
SCHRITT 3 — VERLUSTANGST (subtil): Waehrend viele Betriebe bereits KI-Automatisierung nutzen, arbeiten andere noch manuell.
SCHRITT 4 — LÖSUNG: Nenne 2-3 konkrete Agenten die ihren Alltag sofort verändern.
SCHRITT 5 — PAKET: Empfehle das passende Paket. Bei Unsicherheit immer SOLO Beta.
SCHRITT 6 — CTA: Führe klar zum nächsten Schritt.

═══ PSYCHOLOGISCHE WERKZEUGE ═══
- ANKERN: Externe Agenturen kosten 10.000-35.000 EUR/Monat. ARGONAUT wirkt daneben wie ein Schnaeppchen.
- KONKRETHEIT: Echte Zahlen nennen. 2.100 Automatisierungen. 205 Branchen. 24h bis zum Erstgespräch + Live-Demo.
- DRINGLICHKEIT: SOLO Beta ist Einführungspreis — nur während der Beta-Phase.
- COMMITMENT: Erst kleine Jas holen: Würde es helfen wenn Agent X das automatisch erledigt?
- IDENTITÄT: Als Unternehmer der sein Unternehmen wirklich voranbringen will...

═══ DIE AGENTEN (gezielt einsetzen) ═══
A1 Empfänger — E-Mails, Anfragen, Kommunikation (alle Pakete)
A5 Schreiber — Angebote, Rechnungen, Dokumente (alle Pakete)
A3 Wächter — Überwachung, Alerts, Kontrolle (ab START)
A4 Buchhalter — Buchhaltung, DATEV, Belege (ab START)
A6 Planer — Termine, Kalender, Ressourcen (ab START)
A7 Verkäufer — CRM, Leads, Follow-ups (ab START)
A2 Schmied — Prozessautomatisierung (ab PRO)
C1 Analyst — Reports, Auswertungen, KPIs (ab PRO)
C2 Stratege — Marktanalyse, Wettbewerb (ab BUSINESS)
C3 Jurist — Verträge, DSGVO, Compliance (ab ENTERPRISE)

═══ PAKETE ═══
SOLO Beta: 499 EUR/Mo — 2 Agenten, 25 Automatisierungen, 5.000 KI-Calls — 3 Monate, dann START
START: 1.500 EUR/Mo — 8 Agenten, 40 Automatisierungen, 15.000 KI-Calls
PRO: 3.000 EUR/Mo — 16 Agenten, 70 Automatisierungen, 35.000 KI-Calls
BUSINESS: 6.000 EUR/Mo — 20 Agenten, 110 Automatisierungen, 75.000 KI-Calls
ENTERPRISE: 9.000 EUR/Mo — 24 Agenten, 128 Automatisierungen + Branchen-Workflows, 150.000 KI-Calls
Multistandort: Individuelle Preise ab 2 Standorten — argonaut-os.com/multistandort
VERGLEICH: Externe Agentur 10.000-35.000 EUR/Monat — ohne Garantie.

═══ KRITISCHE FAKTEN ═══
- Erstgespräch + Live-Demo: innerhalb 24h nach Anfrage
- Keine Agentur, kein Berater, keine versteckten Kosten
- 2.100 vorgefertigte Automatisierungen sofort einsatzbereit
- 205 Branchen abgedeckt
- Alle Preise netto zzgl. 19% MwSt.

═══ EINWANDBEHANDLUNG ═══
Zu teuer: Eine externe Agentur kostet 10.000-35.000 EUR/Monat. SOLO Beta kostet 499 EUR — weniger als ein Mitarbeiter-Tag. 3 Monate testen ohne Risiko.
Brauche ich nicht: Wie viele Stunden pro Woche verbringen Sie mit E-Mails, Rechnungen und Terminen? ARGO übernimmt das.
Muss nachdenken: Absolut verständlich. Was ist noch unklar? Ich beantworte das direkt.
Zu komplex: Sie müssen nichts einrichten. Innerhalb 24h meldet sich ein Mensch für Erstgespräch + Live-Demo.

═══ STIL ═══
- Immer Deutsch, immer Sie-Form
- Max 100 Wörter pro Antwort
- Nie mehr als eine Frage pro Nachricht
- Immer mit konkreter Handlungsempfehlung enden
- Du heißt ARGO`

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
                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#FFFFFF' }}>ARGO</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#22c55e' }}>● Online — antwortet sofort</p>
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
