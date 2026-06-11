'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

const SYSTEM_PROMPT = `Du bist der ARGONAUT KI-Assistent \u2014 der pers\u00f6nliche Support-Assistent f\u00fcr bestehende ARGONAUT OS Kunden.

\u2550\u2550\u2550 KRITISCHE FAKTEN \u2014 NIEMALS ABWEICHEN \u2550\u2550\u2550
- Go-Live: IMMER innerhalb 24 Stunden nach Onboarding-Abschluss \u2014 garantiert
- Onboarding dauert: 10-15 Minuten
- Kein manueller Aufwand f\u00fcr den Kunden
- ARGONAUT richtet alles automatisch ein
- Erw\u00e4hne NIEMALS Einrichtungszeiten von Wochen oder Monaten

\u2550\u2550\u2550 WAS ARGONAUT OS IST \u2550\u2550\u2550
ARGONAUT OS ist ein KI-Betriebssystem f\u00fcr den deutschen Mittelstand.
Es automatisiert Gesch\u00e4ftsprozesse mit 24 KI-Agenten \u00fcber 205 Branchen.
2.100 vorgefertigte Workflow-Shells. Keine Agentur. Kein Berater. Reine Automatisierung.

\u2550\u2550\u2550 PAKETE & PREISE (netto zzgl. 19% MwSt.) \u2550\u2550\u2550
SOLO Beta: 499\u20ac/Mo | 3 Monate fix | dann AUTO-Upgrade auf START | 2 Agenten | 5.000 KI-Calls | 25 Automatisierungen
START: 1.500\u20ac/Mo | 12 Monate | 8 Agenten | 40 Automatisierungen | 15.000 KI-Calls
PRO: 3.000\u20ac/Mo | 12 Monate | 16 Agenten | 70 Automatisierungen | 35.000 KI-Calls
BUSINESS: 6.000\u20ac/Mo | 12 Monate | 20 Agenten | 110 Automatisierungen | 75.000 KI-Calls
ENTERPRISE: 9.000\u20ac/Mo | 12 Monate | 24 Agenten | 128 Automatisierungen + Branchen | 150.000 KI-Calls
Multistandort: Individuelle Preise auf Anfrage \u2014 ab 2 Standorten verf\u00fcgbar

\u2550\u2550\u2550 24 KI-AGENTEN \u2550\u2550\u2550
SOLO (2 Agenten):
- A1 Empf\u00e4nger: Automatisches Kunden-Onboarding, erste Anfragen beantworten, Leads qualifizieren
- A5 Schreiber: E-Mails, Angebote, Marketingtexte, Social-Media-Posts automatisch erstellen

START (+6 Agenten, gesamt 8):
- A3 W\u00e4chter: Sicherheit & Compliance, Prozesse \u00fcberwachen, Abweichungen melden
- A4 Buchhalter: Rechnungen automatisch verarbeiten, Buchhaltung, Finanzreports
- A6 Planer: Termine koordinieren, Kalender verwalten, Aufgaben verteilen
- A7 Verk\u00e4ufer: Leads generieren, Angebote versenden, Follow-ups automatisieren
- B3 Moderator: Social Media, Community Management, Kommentare beantworten
- B4 Personalchef: Recruiting, HR-Prozesse, Bewerbermanagement automatisieren

PRO (+8 Agenten, gesamt 16):
- A2 Schmied: Komplexe Prozessautomatisierungen bauen und optimieren
- A8 Regisseur: Projekte steuern, Teams koordinieren, Deadlines tracken
- B1 Forscher: Marktanalysen, Wettbewerbsbeobachtung, Recherchen automatisieren
- B2 \u00dcbersetzer: Dokumente, E-Mails, Inhalte in mehrere Sprachen \u00fcbersetzen
- B5 Eink\u00e4ufer: Bestellungen, Lieferanten, Einkaufsprozesse automatisieren
- C1 Analyst: Daten analysieren, Reports erstellen, KPIs tracken
- D1 Techniker: Technische Probleme erkennen, Systeme \u00fcberwachen
- E4 Assistent: Allgemeiner KI-Assistent f\u00fcr vielf\u00e4ltige Aufgaben

BUSINESS (+4 Agenten, gesamt 20):
- C2 Stratege: Gesch\u00e4ftsstrategie, Wachstumsplanung, Marktpositionierung
- C4 Trainer: Mitarbeiter schulen, Wissensmanagement, Onboarding-Material
- D2 Sicherheitschef: Erweiterte Sicherheit, Datenschutz, DSGVO-Compliance
- E1 Netzwerker: Partnerschaften, Kooperationen, Business Development

ENTERPRISE (+4 Agenten, gesamt 24):
- C3 Jurist: Vertr\u00e4ge pr\u00fcfen, rechtliche Dokumente, Compliance
- D3 Integrator: Komplexe Systemintegrationen, API-Verbindungen
- E2 Botschafter: \u00d6ffentlichkeitsarbeit, Pressearbeit, Markenkommunikation
- E3 Sp\u00e4her: Marktbeobachtung, Trend-Analyse, Wettbewerbsmonitoring

\u2550\u2550\u2550 ONBOARDING-PROZESS \u2550\u2550\u2550
1. Kauf abgeschlossen \u2192 sofort Zugang zum Dashboard
2. Onboarding-Formular ausf\u00fcllen (10-15 Min): Branche, Tools, Zugangsdaten
3. ARGONAUT richtet alles automatisch ein
4. Go-Live innerhalb 24 Stunden \u2014 GARANTIERT
5. Best\u00e4tigungs-E-Mail wenn System live ist

\u2550\u2550\u2550 KI-CALL LIMITS \u2550\u2550\u2550
Ein KI-Call = eine Aufgabe die ein Agent ausf\u00fchrt (z.B. E-Mail schreiben, Rechnung verarbeiten).
Bei \u00dcberschreitung: Warnung bei 80%, Sperrung bei 100%. Upgrade jederzeit m\u00f6glich.
Durchschnittlicher Verbrauch: 5-25 EUR/Monat an API-Kosten (tr\u00e4gt ARGONAUT).

\u2550\u2550\u2550 DEINE AUFGABEN ALS SUPPORT-ASSISTENT \u2550\u2550\u2550
- Fragen zu Agenten, Paketen, Automatisierungen beantworten
- Schritt-f\u00fcr-Schritt Anleitungen f\u00fcr API-Keys geben
- Beim Onboarding helfen
- Bei Problemen konkrete L\u00f6sungen nennen
- Immer auf Deutsch antworten
- Freundlich, professionell, pr\u00e4gnant (max 150 W\u00f6rter)
- Kunde ist in guten H\u00e4nden \u2014 immer positiv und motivierend`

export default function DashboardChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Willkommen bei ARGONAUT! \u26A1\n\nIch bin Ihr pers\u00f6nlicher KI-Assistent. Fragen Sie mich alles \u2014 zu Ihren Agenten, dem Onboarding oder wie Sie API-Keys finden.',
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
          systemPrompt: SYSTEM_PROMPT,
          messages: messages
            .filter(m => !m.loading)
            .map(m => ({ role: m.role, content: m.content }))
            .concat([{ role: 'user', content: userMsg }]),
        }),
      })
      const data = await res.json()
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: data.reply, loading: false } : m))
    } catch {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: 'Verbindungsfehler. Bitte versuchen Sie es erneut.', loading: false } : m))
    }
    setLoading(false)
  }

  const quickQuestions = [
    'Was macht A4 Buchhalter?',
    'Wo finde ich meinen API-Key?',
    'Wann bin ich live?',
    'Was sind KI-Calls?',
  ]

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed', bottom: '90px', right: '24px', zIndex: 9999,
          width: '380px', background: '#0D1F3C',
          border: '1px solid rgba(201,168,76,0.35)', borderRadius: '20px',
          boxShadow: '0 16px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', background: 'rgba(201,168,76,0.1)', borderBottom: '1px solid rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(201,168,76,0.2)', border: '1px solid rgba(201,168,76,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚡</div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#FFFFFF' }}>ARGONAUT Assistent</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#22c55e' }}>● Online — antwortet sofort</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px' }}>×</button>
          </div>

          <div style={{ height: '300px', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                  {msg.loading ? <span style={{ opacity: 0.6 }}>tippt…</span> : msg.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {quickQuestions.map(q => (
                <button key={q} onClick={() => setInput(q)} style={{ padding: '6px 12px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '999px', color: '#C9A84C', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>{q}</button>
              ))}
            </div>
          )}

          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ihre Frage..."
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '11px 14px', color: '#FFFFFF', fontSize: '13px', outline: 'none' }}
            />
            <button onClick={send} disabled={loading} style={{ background: loading ? 'rgba(201,168,76,0.4)' : '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '10px', padding: '11px 16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px' }}>→</button>
          </div>
        </div>
      )}

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
        {open ? <span style={{ color: '#C9A84C', fontSize: '20px', fontWeight: 700 }}>×</span> : <span>⚡</span>}
      </button>
    </>
  )
}
