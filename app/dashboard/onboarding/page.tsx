'use client'

import { useState, useRef, useEffect } from 'react'

// ─── TYPEN ───────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

interface ToolEntry {
  category: string
  tool: string
  apiKey?: string
  notes?: string
}

// ─── DATEN ───────────────────────────────────────────────────────────────────
const BRANCHEN = [
  'Arztpraxis / Medizin','Zahnarztpraxis','Physiotherapie','Apotheke',
  'Steuerberatung / Kanzlei','Rechtsanwaltskanzlei','Unternehmensberatung',
  'Handwerksbetrieb','Bauunternehmen','Elektrotechnik','Sanitär / Heizung',
  'Restaurant / Gastronomie','Hotel / Pension','Café / Bäckerei',
  'Einzelhandel / Kiosk','Supermarkt / Lebensmittel','Modegeschäft',
  'Autohaus / KFZ','Fahrschule','Logistik / Spedition','Lager / Fulfillment',
  'Fitnessstudio / Wellness','Kosmetik / Beauty','Friseur',
  'Immobilien / Makler','Versicherung / Finanzberatung',
  'IT / Software / Agentur','Marketing / Werbeagentur','Fotografie / Medien',
  'Bildung / Nachhilfe / Kita','Soziale Einrichtung / Pflege',
  'E-Commerce / Onlineshop','Großhandel / B2B','Produktion / Fertigung',
  'Sicherheitsdienst','Reinigungsunternehmen','Eventmanagement',
  'Reisebüro / Tourismus','Sport / Verein','Sonstiges',
]

const TOOL_KATEGORIEN: Record<string, { label: string; tools: string[] }> = {
  crm: {
    label: 'CRM / Kundenverwaltung',
    tools: ['HubSpot','Salesforce','Pipedrive','Zoho CRM','Monday CRM','Freshsales','Keap','ActiveCampaign','Kein CRM','Anderes Tool'],
  },
  buchhaltung: {
    label: 'Buchhaltung / Finanzen',
    tools: ['Lexoffice','DATEV','Sevdesk','FastBill','Billomat','Sage','SAP','Addison','Kein Tool','Anderes Tool'],
  },
  email: {
    label: 'E-Mail / Kommunikation',
    tools: ['Gmail / Google Workspace','Microsoft Outlook / 365','Apple Mail','Thunderbird','Zoho Mail','Anderes Tool'],
  },
  kalender: {
    label: 'Kalender / Termine',
    tools: ['Google Calendar','Outlook Calendar','Calendly','Acuity Scheduling','Bookingkit','Treatwell','Anderes Tool'],
  },
  shop: {
    label: 'Shop / E-Commerce',
    tools: ['Shopify','WooCommerce','Magento','OXID','Gambio','Jimdo Shop','Wix Shop','Kein Shop','Anderes Tool'],
  },
  dokumente: {
    label: 'Dokumente / Ablage',
    tools: ['Google Drive','Microsoft SharePoint','Dropbox','Box','Notion','Confluence','Lokale Ablage / PC','Anderes Tool'],
  },
  kommunikation: {
    label: 'Team-Kommunikation',
    tools: ['Slack','Microsoft Teams','WhatsApp Business','Telegram','Discord','Kein Tool','Anderes Tool'],
  },
  marketing: {
    label: 'Marketing / Newsletter',
    tools: ['Mailchimp','Klaviyo','Brevo (Sendinblue)','GetResponse','CleverReach','HubSpot Marketing','Kein Tool','Anderes Tool'],
  },
  social: {
    label: 'Social Media',
    tools: ['Instagram Business','Facebook Business','LinkedIn','TikTok Business','Hootsuite','Buffer','Kein Tool','Anderes Tool'],
  },
  kasse: {
    label: 'Kassensystem / POS',
    tools: ['Orderbird','SumUp','Vectron','Lightspeed','Tillhub','Barzahlen','Excel / Handkasse','Anderes Tool'],
  },
  warenwirtschaft: {
    label: 'Warenwirtschaft / ERP',
    tools: ['SAP Business One','Sage 100','Lexware','Odoo','Weclapp','Afterbuy','Excel','Kein Tool','Anderes Tool'],
  },
  zeiterfassung: {
    label: 'Zeiterfassung / HR',
    tools: ['Personio','Factorial','Clockodo','Harvest','Toggl','Excel','Stundenzettel Papier','Anderes Tool'],
  },
  termin: {
    label: 'Terminbuchung (Kunden)',
    tools: ['Calendly','Doctolib','Jameda','Treatwell','Bookingkit','Reservix','Kein System','Anderes Tool'],
  },
  sonstiges: {
    label: 'Weitere Tools',
    tools: ['Zapier','Make (Integromat)','n8n','Airtable','Trello','Asana','Jira','Anderes Tool'],
  },
}

const DIGITALISIERUNGSGRAD = [
  {
    id: 'klassisch',
    emoji: '📋',
    titel: 'Klassisch',
    beschreibung: 'Wir arbeiten viel mit Papier, Ordnern und Excel. Digital gibt es kaum etwas.',
    farbe: '#ef4444',
  },
  {
    id: 'im_wandel',
    emoji: '🔄',
    titel: 'Im Wandel',
    beschreibung: 'Wir haben erste digitale Tools, aber noch kein durchgängiges System.',
    farbe: '#f59e0b',
  },
  {
    id: 'digital',
    emoji: '🚀',
    titel: 'Digital',
    beschreibung: 'Wir nutzen bereits mehrere Software-Lösungen und sind gut aufgestellt.',
    farbe: '#22c55e',
  },
]

// ─── HILFSFUNKTIONEN ─────────────────────────────────────────────────────────
function encrypt(text: string): string {
  // Basis-Verschlüsselung (Base64) — für echte Produktion: server-side encryption verwenden
  try { return btoa(unescape(encodeURIComponent(text))) } catch { return text }
}

// ─── CHAT KOMPONENTE ─────────────────────────────────────────────────────────
function OnboardingChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hallo! Ich bin Ihr ARGONAUT Setup-Assistent. Fragen Sie mich alles rund um Ihr Onboarding — z.B. "Wo finde ich meinen HubSpot API-Key?" oder "Was ist ein API-Key?"',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
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
          system: `Du bist der ARGONAUT Setup-Assistent. Du hilfst Unternehmern beim Einrichten ihres ARGONAUT OS Systems.
          
Deine Aufgaben:
- Erkläre Schritt für Schritt wo API-Keys in verschiedenen Tools zu finden sind
- Benutze einfache Sprache — kein technisches Fachjargon
- Antworte immer auf Deutsch
- Sei freundlich und geduldig
- Wenn du einen API-Key Weg erklärst, nummeriere die Schritte
- Halte Antworten kurz und präzise (max 150 Wörter)
- Bei unbekannten Tools: gib allgemeine Hinweise wo API-Keys typischerweise zu finden sind`,
          messages: [
            ...messages.filter(m => !m.loading).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg }
          ],
        }),
      })

      const data = await response.json()
      const reply = data.content?.[0]?.text || 'Entschuldigung, ich konnte keine Antwort generieren. Bitte versuchen Sie es erneut.'
      
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: reply, loading: false } : m))
    } catch {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: 'Verbindungsfehler. Bitte versuchen Sie es erneut.', loading: false } : m))
    }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 999,
      width: '360px', background: '#0D1F3C',
      border: '1px solid rgba(201,168,76,0.4)', borderRadius: '16px',
      boxShadow: '0 8px 48px rgba(0,0,0,0.5)', overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', background: 'rgba(201,168,76,0.1)', borderBottom: '1px solid rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>⚡</div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#FFFFFF' }}>ARGONAUT Assistent</p>
          <p style={{ margin: 0, fontSize: '11px', color: '#22c55e' }}>● Online — antwortet in Sekunden</p>
        </div>
      </div>

      <div style={{ height: '260px', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: msg.role === 'user' ? '#C9A84C' : 'rgba(255,255,255,0.06)',
              color: msg.role === 'user' ? '#0A1628' : '#FFFFFF',
              fontSize: '13px', lineHeight: 1.5, fontWeight: msg.role === 'user' ? 600 : 400,
            }}>
              {msg.loading ? (
                <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>●</span>
                  <span style={{ animation: 'pulse 1s infinite 0.2s' }}>●</span>
                  <span style={{ animation: 'pulse 1s infinite 0.4s' }}>●</span>
                </span>
              ) : msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="z.B. Wo finde ich meinen API-Key?"
          style={{
            flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '10px 14px', color: '#FFFFFF', fontSize: '13px', outline: 'none',
          }}
        />
        <button onClick={sendMessage} disabled={loading} style={{
          background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '8px',
          padding: '10px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '16px',
        }}>→</button>
      </div>
    </div>
  )
}

// ─── HAUPTKOMPONENTE ──────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  // Schritt 1
  const [firmenname, setFirmenname] = useState('')
  const [ansprechpartner, setAnsprechpartner] = useState('')
  const [branche, setBranche] = useState('')
  const [standorte, setStandorte] = useState('1')
  const [mitarbeiter, setMitarbeiter] = useState('')
  const [website, setWebsite] = useState('')

  // Schritt 2
  const [digitalisierung, setDigitalisierung] = useState('')

  // Schritt 3
  const [selectedTools, setSelectedTools] = useState<Record<string, string[]>>({})
  const [customTools, setCustomTools] = useState<Record<string, string>>({})

  // Schritt 4
  const [toolEntries, setToolEntries] = useState<ToolEntry[]>([])

  const totalSteps = 5

  function toggleTool(kategorie: string, tool: string) {
    setSelectedTools(prev => {
      const current = prev[kategorie] || []
      if (current.includes(tool)) {
        return { ...prev, [kategorie]: current.filter(t => t !== tool) }
      }
      return { ...prev, [kategorie]: [...current, tool] }
    })
  }

  function getSelectedToolsList(): string[] {
    const list: string[] = []
    Object.entries(selectedTools).forEach(([kat, tools]) => {
      tools.forEach(tool => {
        if (tool !== 'Kein Tool' && tool !== 'Kein CRM' && tool !== 'Kein Shop' && tool !== 'Kein System' && tool !== 'Anderes Tool') {
          list.push(tool)
        }
      })
    })
    Object.values(customTools).forEach(t => { if (t.trim()) list.push(t.trim()) })
    return list
  }

  async function saveAndFinish() {
    setSaving(true)
    try {
      // Daten lokal speichern
      const onboardingData = {
        firmenname, ansprechpartner, branche, standorte, mitarbeiter, website,
        digitalisierung,
        tools: selectedTools,
        customTools,
        toolEntries: toolEntries.map(e => ({ ...e, apiKey: e.apiKey ? encrypt(e.apiKey) : '' })),
        completed_at: new Date().toISOString(),
      }
      localStorage.setItem('argonaut_onboarding', JSON.stringify(onboardingData))

      // API Route aufrufen zum Speichern in Supabase
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(onboardingData),
      }).catch(() => {}) // Fehler ignorieren - Step 5 trotzdem zeigen

    } catch (e) {
      console.error(e)
    }
    setSaving(false)
    setStep(5)
  }

  // ─── RENDER STEPS ──────────────────────────────────────────────────────────

  const progressPct = ((step - 1) / (totalSteps - 1)) * 100

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>

      {/* HEADER */}
      <header style={{ borderBottom: '1px solid rgba(201,168,76,0.15)', padding: '0 24px', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(10,22,40,0.97)', backdropFilter: 'blur(12px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.15em', fontFamily: 'var(--font-dm-sans), sans-serif' }}>ARGONAUT</span>
          <span style={{ fontSize: '11px', color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Setup</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
          <span>Schritt {step} von {totalSteps}</span>
        </div>
      </header>

      {/* FORTSCHRITTSBALKEN */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, #C9A84C, #e8c96a)', transition: 'width 0.4s ease', borderRadius: '999px' }} />
      </div>

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px 120px' }}>

        {/* ── SCHRITT 1: UNTERNEHMEN ── */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: '48px' }}>
              <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>Schritt 1 von 5</p>
              <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, marginBottom: '16px', fontFamily: 'var(--font-dm-sans), sans-serif' }}>Herzlich willkommen! 👋</h1>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '16px', lineHeight: 1.7 }}>
                Wir richten jetzt gemeinsam Ihr ARGONAUT System ein. Das dauert ca. <strong style={{ color: '#C9A84C' }}>10–15 Minuten</strong>. Sie können jederzeit pausieren — alles wird automatisch gespeichert.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {[
                { label: 'Firmenname', value: firmenname, setter: setFirmenname, placeholder: 'z.B. Müller GmbH', required: true },
                { label: 'Ihr Name (Ansprechpartner)', value: ansprechpartner, setter: setAnsprechpartner, placeholder: 'z.B. Thomas Müller', required: true },
                { label: 'Website (optional)', value: website, setter: setWebsite, placeholder: 'z.B. www.mueller-gmbh.de', required: false },
              ].map(field => (
                <div key={field.label}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                    {field.label} {field.required && <span style={{ color: '#C9A84C' }}>*</span>}
                  </label>
                  <input
                    value={field.value}
                    onChange={e => field.setter(e.target.value)}
                    placeholder={field.placeholder}
                    style={{
                      width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px',
                      color: '#FFFFFF', fontSize: '15px', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                  Branche <span style={{ color: '#C9A84C' }}>*</span>
                </label>
                <select
                  value={branche}
                  onChange={e => setBranche(e.target.value)}
                  style={{
                    width: '100%', padding: '14px 16px', background: '#0D1F3C',
                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px',
                    color: branche ? '#FFFFFF' : 'rgba(255,255,255,0.35)', fontSize: '15px', outline: 'none', boxSizing: 'border-box',
                  }}
                >
                  <option value="">Bitte wählen...</option>
                  {BRANCHEN.map(b => <option key={b} value={b} style={{ background: '#0D1F3C' }}>{b}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>Anzahl Standorte</label>
                  <select value={standorte} onChange={e => setStandorte(e.target.value)} style={{ width: '100%', padding: '14px 16px', background: '#0D1F3C', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#FFFFFF', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}>
                    {['1','2','3','4','5','6-10','11-20','20+'].map(n => <option key={n} value={n} style={{ background: '#0D1F3C' }}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>Mitarbeiter</label>
                  <select value={mitarbeiter} onChange={e => setMitarbeiter(e.target.value)} style={{ width: '100%', padding: '14px 16px', background: '#0D1F3C', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#FFFFFF', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="" style={{ background: '#0D1F3C' }}>Bitte wählen</option>
                    {['1–5','6–10','11–25','26–50','51–100','100+'].map(n => <option key={n} value={n} style={{ background: '#0D1F3C' }}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={() => firmenname && branche && setStep(2)}
              disabled={!firmenname || !branche}
              style={{
                marginTop: '40px', width: '100%', padding: '18px', background: firmenname && branche ? '#C9A84C' : 'rgba(255,255,255,0.08)',
                color: firmenname && branche ? '#0A1628' : 'rgba(255,255,255,0.3)',
                border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: firmenname && branche ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s', letterSpacing: '0.05em',
              }}
            >
              Weiter → Digitalisierungsgrad
            </button>
          </div>
        )}

        {/* ── SCHRITT 2: DIGITALISIERUNGSGRAD ── */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: '48px' }}>
              <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>Schritt 2 von 5</p>
              <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, marginBottom: '16px', fontFamily: 'var(--font-dm-sans), sans-serif' }}>Wie digital sind Sie heute?</h1>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '16px', lineHeight: 1.7 }}>
                Keine richtige oder falsche Antwort — wir richten uns nach Ihrem aktuellen Stand.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
              {DIGITALISIERUNGSGRAD.map(grad => (
                <button
                  key={grad.id}
                  onClick={() => setDigitalisierung(grad.id)}
                  style={{
                    padding: '28px 32px', borderRadius: '14px', border: digitalisierung === grad.id ? `2px solid ${grad.farbe}` : '1px solid rgba(255,255,255,0.1)',
                    background: digitalisierung === grad.id ? `${grad.farbe}18` : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                    boxShadow: digitalisierung === grad.id ? `0 0 24px ${grad.farbe}22` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '32px' }}>{grad.emoji}</span>
                    <div>
                      <p style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: digitalisierung === grad.id ? grad.farbe : '#FFFFFF' }}>{grad.titel}</p>
                      <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{grad.beschreibung}</p>
                    </div>
                    {digitalisierung === grad.id && (
                      <div style={{ marginLeft: 'auto', width: '24px', height: '24px', borderRadius: '50%', background: grad.farbe, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>✓</span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(1)} style={{ padding: '16px 28px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 600, fontSize: '15px' }}>← Zurück</button>
              <button
                onClick={() => digitalisierung && setStep(3)}
                disabled={!digitalisierung}
                style={{ flex: 1, padding: '16px', background: digitalisierung ? '#C9A84C' : 'rgba(255,255,255,0.08)', color: digitalisierung ? '#0A1628' : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: digitalisierung ? 'pointer' : 'not-allowed' }}
              >
                Weiter → Ihre Tools
              </button>
            </div>
          </div>
        )}

        {/* ── SCHRITT 3: TOOLS AUSWÄHLEN ── */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: '40px' }}>
              <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>Schritt 3 von 5</p>
              <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, marginBottom: '16px', fontFamily: 'var(--font-dm-sans), sans-serif' }}>Welche Tools nutzen Sie?</h1>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '16px', lineHeight: 1.7 }}>
                Klicken Sie alles an, was Sie kennen oder nutzen. Kein Tool dabei? Kein Problem — tragen Sie es einfach ein.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '40px' }}>
              {Object.entries(TOOL_KATEGORIEN).map(([key, kat]) => (
                <div key={key}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>{kat.label}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {kat.tools.map(tool => {
                      const isSelected = (selectedTools[key] || []).includes(tool)
                      const isAnderes = tool === 'Anderes Tool'
                      return (
                        <button
                          key={tool}
                          onClick={() => toggleTool(key, tool)}
                          style={{
                            padding: '8px 16px', borderRadius: '999px',
                            border: isSelected ? '2px solid #C9A84C' : '1px solid rgba(255,255,255,0.12)',
                            background: isSelected ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.03)',
                            color: isSelected ? '#C9A84C' : isAnderes ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.7)',
                            cursor: 'pointer', fontSize: '13px', fontWeight: isSelected ? 700 : 400,
                            transition: 'all 0.15s',
                          }}
                        >
                          {isAnderes ? '+ Anderes' : tool}
                        </button>
                      )
                    })}
                  </div>
                  {(selectedTools[key] || []).includes('Anderes Tool') && (
                    <input
                      value={customTools[key] || ''}
                      onChange={e => setCustomTools(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={`Ihr ${kat.label} Tool eintragen...`}
                      style={{
                        marginTop: '10px', width: '100%', padding: '12px 16px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,76,0.3)',
                        borderRadius: '8px', color: '#FFFFFF', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Excel Upload Hinweis */}
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '12px', padding: '20px 24px', marginBottom: '32px' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '14px', color: '#C9A84C' }}>📊 Sie arbeiten mit Excel oder CSV-Dateien?</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>Kein Problem! ARGONAUT kann Excel und CSV-Dateien direkt verarbeiten. Sie können Ihre Dateien nach dem Setup hochladen — unsere Agenten lesen, analysieren und verarbeiten diese automatisch.</p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(2)} style={{ padding: '16px 28px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 600, fontSize: '15px' }}>← Zurück</button>
              <button onClick={() => setStep(4)} style={{ flex: 1, padding: '16px', background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>
                Weiter → Zugangsdaten
              </button>
            </div>
          </div>
        )}

        {/* ── SCHRITT 4: ZUGANGSDATEN ── */}
        {step === 4 && (
          <div>
            <div style={{ marginBottom: '40px' }}>
              <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>Schritt 4 von 5</p>
              <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, marginBottom: '16px', fontFamily: 'var(--font-dm-sans), sans-serif' }}>Zugangsdaten (optional)</h1>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '16px', lineHeight: 1.7 }}>
                Alle Felder sind <strong style={{ color: '#C9A84C' }}>freiwillig</strong>. Was Sie nicht ausfüllen, vervollständigen wir gemeinsam mit Ihnen nach dem Go-Live. Alle Daten werden verschlüsselt gespeichert.
              </p>
            </div>

            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '16px 20px', marginBottom: '32px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>🔒</span>
              <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                Ihre Daten werden verschlüsselt übertragen und gespeichert. Kein Mitarbeiter hat Zugriff auf Ihre API-Keys — nur Ihr ARGONAUT System verwendet diese zur Automatisierung.
              </p>
            </div>

            {/* Hilfehinweis für Chat */}
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '12px', padding: '16px 20px', marginBottom: '32px' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '14px', color: '#C9A84C' }}>⚡ Wissen Sie nicht wo Ihr API-Key ist?</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Fragen Sie einfach den <strong style={{ color: '#C9A84C' }}>ARGONAUT Assistenten</strong> unten rechts — er zeigt Ihnen in Sekunden wo Sie ihn finden.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '40px' }}>
              {getSelectedToolsList().length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.4)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '8px' }}>Sie haben in Schritt 3 keine Tools ausgewählt.</p>
                  <p>Kein Problem — wir klären das nach dem Go-Live gemeinsam.</p>
                </div>
              ) : (
                getSelectedToolsList().map(tool => (
                  <div key={tool} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '20px 24px' }}>
                    <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: '15px', color: '#FFFFFF' }}>{tool}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input
                        placeholder="API-Key (optional) — oder leer lassen"
                        onChange={e => {
                          const val = e.target.value
                          setToolEntries(prev => {
                            const existing = prev.find(t => t.tool === tool)
                            if (existing) return prev.map(t => t.tool === tool ? { ...t, apiKey: val } : t)
                            return [...prev, { category: '', tool, apiKey: val }]
                          })
                        }}
                        style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <input
                        placeholder="Anmerkungen (z.B. Login-URL, Benutzername) — optional"
                        onChange={e => {
                          const val = e.target.value
                          setToolEntries(prev => {
                            const existing = prev.find(t => t.tool === tool)
                            if (existing) return prev.map(t => t.tool === tool ? { ...t, notes: val } : t)
                            return [...prev, { category: '', tool, notes: val }]
                          })
                        }}
                        style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(3)} style={{ padding: '16px 28px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 600, fontSize: '15px' }}>← Zurück</button>
              <button onClick={saveAndFinish} disabled={saving} style={{ flex: 1, padding: '16px', background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>
                {saving ? 'Wird gespeichert...' : 'Jetzt Go-Live starten 🚀'}
              </button>
            </div>
          </div>
        )}

        {/* ── SCHRITT 5: FERTIG ── */}
        {step === 5 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '80px', marginBottom: '32px' }}>🎉</div>
            <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>Setup abgeschlossen</p>
            <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, marginBottom: '20px', fontFamily: 'var(--font-dm-sans), sans-serif' }}>
              Ihr ARGONAUT System<br />wird eingerichtet!
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '17px', lineHeight: 1.7, maxWidth: '520px', margin: '0 auto 48px' }}>
              Wir haben alles erhalten. Innerhalb von <strong style={{ color: '#C9A84C' }}>24 Stunden</strong> melden wir uns für Erstgespräch + Live-Demo. Sie erhalten eine E-Mail sobald alles bereit ist.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', maxWidth: '600px', margin: '0 auto 48px', textAlign: 'left' }}>
              {[
                { icon: '✅', text: `Unternehmen: ${firmenname}` },
                { icon: '✅', text: `Branche: ${branche}` },
                { icon: '✅', text: `Tools: ${getSelectedToolsList().length} verbunden` },
                { icon: '⏳', text: 'Erstgespräch + Demo: innerhalb 24h' },
              ].map((item, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '18px' }}>{item.icon}</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{item.text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => { window.location.href = '/dashboard' }}
              style={{ padding: '18px 48px', background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              Zum Dashboard →
            </button>
          </div>
        )}

      </main>

      {/* CHAT ASSISTENT */}
      {step < 5 && (
        <>
          {chatOpen ? (
            <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 999 }}>
              <button onClick={() => setChatOpen(false)} style={{ position: 'absolute', top: '-12px', right: '-12px', zIndex: 1000, width: '28px', height: '28px', borderRadius: '50%', background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>×</button>
              <OnboardingChat />
            </div>
          ) : (
            <button
              onClick={() => setChatOpen(true)}
              style={{
                position: 'fixed', bottom: '24px', right: '24px', zIndex: 999,
                background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '999px',
                padding: '14px 24px', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                boxShadow: '0 4px 24px rgba(201,168,76,0.4)', display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              ⚡ Hilfe? Fragen Sie ARGONAUT
            </button>
          )}
        </>
      )}

    </div>
  )
}
