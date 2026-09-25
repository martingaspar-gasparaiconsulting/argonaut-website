'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface Message {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
  vorschlag?: any
  quellen?: string[]
}

// Paket A5 (25.09.2026): Hier stand frueher ein langer Systemtext mit alten
// Preisen und „24 KI-Agenten". Die Server-Route hat ihn nie benutzt, aber er
// lag fuer jeden sichtbar im Browser. Jetzt baut der Server den Text selbst aus
// der Wissensbasis (lib/chatWissen.ts); der Browser schickt nur die Seite mit,
// auf der der Nutzer steht.

export default function DashboardChat() {
  const pfad = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Guten Tag! Ich bin Ihr ARGONAUT-Assistent.\n\nFragen Sie mich, wie etwas geht, wo Sie etwas eintragen und wo es danach ankommt \u2014 ich kenne jede Seite im System. Ich erkl\u00e4re nur; eingetragen wird immer von Ihnen. Sie k\u00f6nnen auch auf das Mikrofon tippen und einfach sprechen.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hoert, setHoert] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<{ text: string; fehler: boolean } | null>(null)
  const [voiceOk, setVoiceOk] = useState(false)
  const [gross, setGross] = useState(false)
  const [sprichtIndex, setSprichtIndex] = useState<number | null>(null)
  const [ttsOk, setTtsOk] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)
  const aktivRef = useRef(false)        // Nutzer will zuhoeren (bis manueller Stopp)
  const versuchRef = useRef(0)          // Zaehler erfolgloser Neustarts
  const basisRef = useRef('')           // bereits erkannter Text (ueber Neustarts hinweg)
  const letzterTextRef = useRef('')     // Text der aktuellen Erkennungs-Session

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Textfeld waechst mit dem Inhalt mit (bis max. Hoehe, dann scrollt es)
  useEffect(() => {
    const el = taRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 130) + 'px'
    }
  }, [input])

  // Sprach-Erkennung (Mikrofon) + Sprachausgabe (Vorlesen) nur anzeigen, wenn unterstützt
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      setVoiceOk(!!SR)
      const hatTts = 'speechSynthesis' in window
      setTtsOk(hatTts)
      if (hatTts) {
        // Stimmen vorladen (getVoices() liefert anfangs oft eine leere Liste)
        window.speechSynthesis.getVoices()
        window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices() }
      }
    }
  }, [])

  const MAX_VERSUCHE = 6

  function starteErkennung() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'de-DE'
    rec.interimResults = true
    rec.continuous = true
    let sessionHatteText = false

    rec.onstart = () => {
      setVoiceStatus({ text: 'Ich höre zu … tippen Sie erneut aufs Mikrofon, wenn Sie fertig sind.', fehler: false })
    }
    rec.onresult = (e: any) => {
      let seg = ''
      for (let i = 0; i < e.results.length; i++) {
        seg += e.results[i][0].transcript
      }
      if (seg.trim()) {
        sessionHatteText = true
        versuchRef.current = 0 // es klappt -> Zaehler zuruecksetzen
      }
      letzterTextRef.current = seg
      const gesamt = (basisRef.current + ' ' + seg).trim()
      setInput(gesamt)
    }

    // erkannten Text der Session in die Basis uebernehmen (fuer sauberen Neustart)
    const textSichern = () => {
      if (letzterTextRef.current.trim()) {
        basisRef.current = (basisRef.current + ' ' + letzterTextRef.current).trim()
      }
      letzterTextRef.current = ''
    }

    rec.onerror = (e: any) => {
      const code = e?.error || 'unbekannt'
      // Manueller Abbruch -> stillschweigend beenden
      if (code === 'aborted' || !aktivRef.current) {
        return
      }
      // Harte Fehler -> nicht weiter versuchen
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        aktivRef.current = false
        const meldungen: Record<string, string> = {
          'not-allowed': 'Mikrofon nicht erlaubt. Bitte oben in der Adressleiste auf das Schloss-Symbol tippen und das Mikrofon zulassen.',
          'service-not-allowed': 'Mikrofon nicht erlaubt. Bitte in den Browser-Einstellungen das Mikrofon zulassen.',
          'audio-capture': 'Kein Mikrofon gefunden. Bitte prüfen Sie, ob ein Mikrofon angeschlossen und aktiv ist.',
        }
        setVoiceStatus({ text: meldungen[code], fehler: true })
        setHoert(false)
        return
      }
      // Weiche Fehler (network, no-speech, ...) -> hartnaeckig neu versuchen
      textSichern()
    }

    rec.onend = () => {
      // Kein weiterer Versuch gewuenscht -> beenden
      if (!aktivRef.current) {
        setHoert(false)
        setVoiceStatus(prev => (prev?.fehler ? prev : null))
        return
      }
      textSichern()
      // Bei erfolgreicher Session (Text erkannt) einfach weiter zuhoeren.
      // Sonst Fehlversuch zaehlen und ggf. abbrechen.
      if (!sessionHatteText) {
        versuchRef.current += 1
        if (versuchRef.current >= MAX_VERSUCHE) {
          aktivRef.current = false
          setHoert(false)
          setVoiceStatus({ text: 'Ich konnte gerade nichts hören. Bitte prüfen Sie das Mikrofon und tippen Sie erneut.', fehler: true })
          return
        }
      }
      // Weiter zuhoeren (neue Session)
      setTimeout(() => {
        if (aktivRef.current) starteErkennung()
      }, 250)
    }

    recognitionRef.current = rec
    setHoert(true)
    try {
      rec.start()
    } catch {
      // start() direkt nach stop() kann werfen -> kurz warten und erneut
      setTimeout(() => {
        if (aktivRef.current) starteErkennung()
      }, 300)
    }
  }

  function toggleVoice() {
    if (hoert || aktivRef.current) {
      // Stoppen
      aktivRef.current = false
      recognitionRef.current?.stop()
      setHoert(false)
      setVoiceStatus(null)
      return
    }
    // Starten
    aktivRef.current = true
    versuchRef.current = 0
    basisRef.current = input.trim()   // bereits getippten Text als Basis behalten
    letzterTextRef.current = ''
    setVoiceStatus({ text: 'Mikrofon wird gestartet …', fehler: false })
    starteErkennung()
  }

  // Text fuer die Sprachausgabe von Markdown-/Sonderzeichen saeubern
  function vorleseText(roh: string): string {
    return roh
      .replace(/\*\*/g, '')            // Fett-Sternchen
      .replace(/[*_`#>]/g, '')         // weitere Markdown-Zeichen
      .replace(/^\s*[-–•]\s+/gm, '')   // Aufzaehlungszeichen am Zeilenanfang
      .replace(/\n{2,}/g, '. ')        // Absaetze -> kurze Pause
      .replace(/\n/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  // Beste installierte deutsche Stimme waehlen (klingt menschlicher als die Standardstimme)
  function besteStimme(): SpeechSynthesisVoice | null {
    try {
      const voices = window.speechSynthesis.getVoices()
      const de = voices.filter(v => v.lang.toLowerCase().startsWith('de'))
      const natuerlich = de.find(v => /natural|online|neural|premium/i.test(v.name))
      return natuerlich || de[0] || null
    } catch {
      return null
    }
  }

  // Antwort vorlesen (Sprachausgabe, laeuft lokal im Geraet - offline & kostenlos)
  function vorlesen(text: string, i: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    // Laeuft gerade genau diese Nachricht -> stoppen (Umschalter)
    if (sprichtIndex === i) {
      window.speechSynthesis.cancel()
      setSprichtIndex(null)
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(vorleseText(text))
    u.lang = 'de-DE'
    u.rate = 1.0
    const stimme = besteStimme()
    if (stimme) u.voice = stimme
    u.onend = () => setSprichtIndex(null)
    u.onerror = () => setSprichtIndex(null)
    setSprichtIndex(i)
    window.speechSynthesis.speak(u)
  }

  // Chat schliessen -> laufende Sprachausgabe stoppen
  function schliessen() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setSprichtIndex(null)
    setOpen(false)
  }

  async function send() {
    if (!input.trim() || loading) return
    // laufende Sprach-Erkennung sicher beenden
    aktivRef.current = false
    if (hoert) { recognitionRef.current?.stop() }
    basisRef.current = ''
    letzterTextRef.current = ''
    setVoiceStatus(null)
    // laufende Sprachausgabe stoppen
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSprichtIndex(null)
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', loading: true }])

    try {
      const res = await fetch('/api/dashboard-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pfad,
          messages: messages
            .filter(m => !m.loading)
            .map(m => ({ role: m.role, content: m.content }))
            .concat([{ role: 'user', content: userMsg }]),
        }),
      })
      const data = await res.json(); if(data.modus==="vorschlag"){setMessages(p=>[...p.slice(0,-1),{role:"assistant",content:data.text||"",vorschlag:data.vorschlag,quellen:data.quellen,loading:false}]);setLoading(false);return}
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: data.antwort || data.error || 'Es kam keine Antwort zurück. Bitte erneut versuchen.', loading: false } : m))
    } catch {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'assistant', content: 'Verbindungsfehler. Bitte versuchen Sie es erneut.', loading: false } : m))
    }
    setLoading(false)
  }

  const quickQuestions = [
    'Wo fange ich an?',
    'Was mache ich auf dieser Seite?',
    'Wo landen meine Einträge?',
    'Wie lege ich einen Probe-Eintrag an?',
  ]

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed', bottom: '90px', right: '24px', zIndex: 9999,
          width: gross ? 'min(600px, 92vw)' : 'min(380px, 92vw)', background: '#0D1F3C',
          border: '1px solid rgba(201,168,76,0.35)', borderRadius: '20px',
          boxShadow: '0 16px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', background: 'rgba(201,168,76,0.1)', borderBottom: '1px solid rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(201,168,76,0.2)', border: '1px solid rgba(201,168,76,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(18px, 1.56vw, 25px)' }}>⚡</div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 'clamp(14px, 1.25vw, 20px)', color: '#FFFFFF' }}>ARGONAUT Assistent</p>
                <p style={{ margin: 0, fontSize: 'clamp(11px, 0.94vw, 15px)', color: '#22c55e' }}>● Online — antwortet sofort</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <button onClick={() => setGross(g => !g)} title={gross ? 'Verkleinern' : 'Vergrößern'} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 'clamp(17px, 1.5vw, 24px)', lineHeight: 1, padding: '4px 6px' }}>{gross ? '🗕' : '🗖'}</button>
              <button onClick={schliessen} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 'clamp(20px, 1.75vw, 28px)', lineHeight: 1, padding: '4px' }}>×</button>
            </div>
          </div>

          <div style={{ height: gross ? 'min(560px, 66vh)' : '300px', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%', padding: gross ? '13px 17px' : '11px 15px',
                  borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: msg.role === 'user' ? '#C9A84C' : 'rgba(255,255,255,0.07)',
                  color: msg.role === 'user' ? '#0A1628' : '#FFFFFF',
                  fontSize: gross ? '15px' : '13px', lineHeight: 1.6, fontWeight: msg.role === 'user' ? 600 : 400,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.loading ? <span style={{ opacity: 0.6 }}>tippt…</span> : msg.content}
                </div>
                {msg.role === 'assistant' && !msg.loading && msg.content && ttsOk && (
                  <button onClick={() => vorlesen(msg.content, i)} style={{ marginTop: '5px', background: 'none', border: 'none', color: sprichtIndex === i ? '#E06666' : 'rgba(201,168,76,0.85)', fontSize: 'clamp(12px, 1.06vw, 17px)', cursor: 'pointer', padding: '2px 4px', fontWeight: 600 }}>
                    {sprichtIndex === i ? '⏹ Stopp' : '🔊 Vorlesen'}
                  </button>
                )}
                {msg.vorschlag && (
                  <div style={{ marginTop: '8px', padding: '14px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: '12px' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#C9A84C', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>📄 {msg.vorschlag.name}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 'clamp(11px, 0.94vw, 15px)', color: 'rgba(255,255,255,0.6)' }}>{msg.vorschlag.format} · {msg.vorschlag.agent}</p>
                    {msg.vorschlag.fehlend && msg.vorschlag.fehlend.length > 0 && (
                      <p style={{ margin: '8px 0 0', fontSize: 'clamp(11px, 0.94vw, 15px)', color: '#FFD593' }}>Fehlende: {msg.vorschlag.fehlend.join(', ')}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {quickQuestions.map(q => (
                <button key={q} onClick={() => setInput(q)} style={{ padding: '6px 12px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '999px', color: '#C9A84C', fontSize: 'clamp(11px, 0.94vw, 15px)', cursor: 'pointer', fontWeight: 600 }}>{q}</button>
              ))}
            </div>
          )}

          {voiceStatus && (
            <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: voiceStatus.fehler ? '#E0A24C' : '#E06666', display: 'inline-block', animation: hoert ? 'argonautPulse 1s ease-in-out infinite' : 'none', flexShrink: 0 }} />
              <span style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: voiceStatus.fehler ? '#E0A24C' : '#E06666', fontWeight: 600, lineHeight: 1.4 }}>{voiceStatus.text}</span>
            </div>
          )}

          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <textarea
              ref={taRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={hoert ? 'Sprechen Sie …' : 'Ihre Frage...'}
              rows={1}
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '11px 14px', color: '#FFFFFF', fontSize: 'clamp(13px, 1.13vw, 18px)', lineHeight: 1.5, outline: 'none', resize: 'none', minHeight: '44px', maxHeight: '130px', overflowY: 'auto', fontFamily: 'inherit' }}
            />
            {voiceOk && (
              <button
                onClick={toggleVoice}
                title={hoert ? 'Aufnahme stoppen' : 'Per Sprache eingeben'}
                style={{
                  background: hoert ? '#E06666' : 'rgba(255,255,255,0.06)',
                  border: hoert ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '11px 13px', cursor: 'pointer',
                  fontSize: 'clamp(15px, 1.31vw, 21px)', lineHeight: 1,
                  boxShadow: hoert ? '0 0 0 3px rgba(224,102,102,0.25)' : 'none',
                  transition: 'all 0.15s',
                }}
              >🎤</button>
            )}
            <button onClick={send} disabled={loading} style={{ background: loading ? 'rgba(201,168,76,0.4)' : '#C9A84C', color: '#0A1628', border: 'none', borderRadius: '10px', padding: '11px 16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 'clamp(16px, 1.38vw, 22px)' }}>→</button>
          </div>
        </div>
      )}

      <button
        onClick={() => open ? schliessen() : setOpen(true)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          width: '60px', height: '60px', borderRadius: '50%',
          background: open ? '#0A1628' : '#C9A84C',
          border: open ? '2px solid rgba(201,168,76,0.5)' : 'none',
          boxShadow: '0 4px 24px rgba(201,168,76,0.35)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'clamp(24px, 2.13vw, 34px)', transition: 'all 0.2s',
        }}
      >
        {open ? <span style={{ color: '#C9A84C', fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 700 }}>×</span> : <span>⚡</span>}
      </button>

      <style>{`@keyframes argonautPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </>
  )
}
