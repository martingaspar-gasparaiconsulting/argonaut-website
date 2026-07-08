'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

const GOLD = '#C9A84C'
const CYAN = '#00e5ff'

type Props = {
  chefName: string
  jahr: number
  einnahmen: number
  gewinn: number
  rechnungenOffen: number
  rechnungenOffenSumme: number
  rechnungenUeberfaellig: number
  leadsOffen: number
  chancenAktiv: number
  chancenSumme: number
  auftraegeOffen: number
  projekteLaufend: number
  kranke: number
  krankeDetails: string[]
  offeneGenehmigungen: number
  eingestempelt: number
  feedCount: number
}

type KiAntwort = { ok: boolean; klartext?: string; punkte?: string[]; stimmung?: 'gut' | 'neutral' | 'achtung' }
// Etappe 3: eine Chat-Zeile kann Text ODER eine offene Aktions-Bestaetigung sein
type ChatMsg = {
  role: 'user' | 'assistant'
  content: string
  aktion?: any            // liegt vor -> Bestaetigungs-Karte anzeigen
  status?: 'offen' | 'erledigt' | 'abgebrochen'
}

const stimmungFarbe: Record<string, string> = { gut: '#3ddc84', neutral: GOLD, achtung: '#ef4444' }
const stimmungLabel: Record<string, string> = { gut: 'Alles im grünen Bereich', neutral: 'Einiges zu tun', achtung: 'Achtung nötig' }

function euro(n: number): string {
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
  } catch {
    return Math.round(n || 0) + ' €'
  }
}

// Text fuer die Sprachausgabe aufbereiten (Sternchen/Markdown raus, Absaetze -> kurze Pausen)
function vorleseText(roh: string): string {
  return roh
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/^\s*[-–•]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Beste installierte deutsche Stimme waehlen (klingt menschlicher als die Standardstimme)
function besteStimme(): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices()
    const de = voices.filter((v) => v.lang.toLowerCase().startsWith('de'))
    const natuerlich = de.find((v) => /natural|online|neural|premium/i.test(v.name))
    return natuerlich || de[0] || null
  } catch {
    return null
  }
}

// Reine Kennzahlen-Zeilen (fuer Bericht UND Rueckfragen wiederverwendet)
function datenZeilen(p: Props): string {
  return [
    'Finanzen: Einnahmen ' + p.jahr + ' ' + euro(p.einnahmen) + ' netto, Gewinn ' + euro(p.gewinn) + '. '
      + 'Offene Rechnungen: ' + p.rechnungenOffen + ' (' + euro(p.rechnungenOffenSumme) + ' offen), davon ' + p.rechnungenUeberfaellig + ' ueberfaellig.',
    'Vertrieb: ' + p.leadsOffen + ' offene Leads, ' + p.chancenAktiv + ' aktive Verkaufschancen (Pipeline ' + euro(p.chancenSumme) + '), ' + p.auftraegeOffen + ' offene Auftraege.',
    'Betrieb: ' + p.projekteLaufend + ' laufende Projekte.',
    'Personal: ' + p.kranke + ' krank gemeldet' + (p.krankeDetails.length ? ' (' + p.krankeDetails.join(', ') + ')' : '')
      + ', ' + p.offeneGenehmigungen + ' offene Genehmigungen, ' + p.eingestempelt + ' Person(en) jetzt eingestempelt.',
    'Aktivitaet letzte 24 Stunden: ' + p.feedCount + ' Ereignisse.',
  ].join('\n')
}

function baueBerichtKontext(p: Props): string {
  return datenZeilen(p) + '\n\n'
    + 'Erstelle daraus einen kurzen, souveraenen Tagesbericht fuer den Chef (ein "Willkommen zurueck"-Briefing): '
    + '2-4 Saetze Klartext, was heute wirklich wichtig ist und worauf er sich konzentrieren sollte, '
    + 'und danach die konkreten naechsten Schritte als kurze Stichpunkte (mit Namen/Zahlen wo vorhanden). '
    + 'Sprich den Chef direkt an, sachlich und motivierend, ohne Floskeln.'
}

export default function ChefCockpit(props: Props) {
  // Bericht (Etappe 1)
  const [laedt, setLaedt] = useState(false)
  const [ki, setKi] = useState<KiAntwort | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  // Vorlese-Steuerung (ein Key kann gerade sprechen: 'bericht' oder 'a<index>')
  const [sprichtKey, setSprichtKey] = useState<string | null>(null)

  // Rueckfragen (Etappe 2) + Aktionen (Etappe 3)
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [chatLaedt, setChatLaedt] = useState(false)
  const [aktionLaeuft, setAktionLaeuft] = useState<number | null>(null) // Index der gerade ausgefuehrten Karte

  // Mikrofon
  const [voiceOk, setVoiceOk] = useState(false)
  const [hoert, setHoert] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<{ text: string; fehler: boolean } | null>(null)
  const recognitionRef = useRef<any>(null)
  const aktivRef = useRef(false)
  const basisRef = useRef('')
  const letzterTextRef = useRef('')

  const ttsVerfuegbar = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setVoiceOk(!!SR)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices() }
    }
  }, [])

  async function berichtErstellen() {
    setLaedt(true)
    setFehler(null)
    try {
      const res = await fetch('/api/ki-auge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modul: 'Chef-Cockpit Tagesbericht', kontext: baueBerichtKontext(props) }),
      })
      const data = (await res.json()) as KiAntwort
      if (data && data.ok) setKi(data)
      else setFehler('Der Tagesbericht konnte nicht erstellt werden.')
    } catch {
      setFehler('Verbindungsfehler beim Erstellen des Tagesberichts.')
    } finally {
      setLaedt(false)
    }
  }

  function sprich(text: string, key: string) {
    if (!ttsVerfuegbar) return
    if (sprichtKey === key) {
      window.speechSynthesis.cancel()
      setSprichtKey(null)
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(vorleseText(text))
    u.lang = 'de-DE'
    u.rate = 1.0
    const stimme = besteStimme()
    if (stimme) u.voice = stimme
    u.onend = () => setSprichtKey(null)
    u.onerror = () => setSprichtKey(null)
    setSprichtKey(key)
    window.speechSynthesis.speak(u)
  }

  // ---- Mikrofon (Muster wie PULS) ----
  function starteErkennung() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'de-DE'
    rec.interimResults = true
    rec.continuous = true

    rec.onstart = () => setVoiceStatus({ text: 'Ich höre zu … tippe erneut aufs Mikrofon, wenn du fertig bist.', fehler: false })
    rec.onresult = (e: any) => {
      let seg = ''
      for (let i = 0; i < e.results.length; i++) seg += e.results[i][0].transcript
      letzterTextRef.current = seg
      setInput((basisRef.current + ' ' + seg).trim())
    }
    const textSichern = () => {
      if (letzterTextRef.current.trim()) {
        basisRef.current = (basisRef.current + ' ' + letzterTextRef.current).trim()
      }
      letzterTextRef.current = ''
    }
    rec.onerror = (e: any) => {
      const code = e?.error || 'unbekannt'
      if (code === 'aborted' || !aktivRef.current) return
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        aktivRef.current = false
        const meldungen: Record<string, string> = {
          'not-allowed': 'Mikrofon nicht erlaubt. Bitte in der Adressleiste auf das Schloss-Symbol tippen und das Mikrofon zulassen.',
          'service-not-allowed': 'Mikrofon nicht erlaubt. Bitte in den Browser-Einstellungen das Mikrofon zulassen.',
          'audio-capture': 'Kein Mikrofon gefunden. Bitte prüfen, ob ein Mikrofon angeschlossen und aktiv ist.',
        }
        setVoiceStatus({ text: meldungen[code] || 'Mikrofon-Fehler.', fehler: true })
        setHoert(false)
        return
      }
      textSichern()
    }
    rec.onend = () => {
      textSichern()
      if (aktivRef.current) {
        try { rec.start() } catch { /* ignore */ }
      } else {
        setHoert(false)
      }
    }

    recognitionRef.current = rec
    try { rec.start() } catch { /* ignore */ }
  }

  function toggleVoice() {
    if (hoert) {
      aktivRef.current = false
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      setHoert(false)
      setVoiceStatus(null)
    } else {
      basisRef.current = input.trim()
      letzterTextRef.current = ''
      aktivRef.current = true
      setHoert(true)
      setVoiceStatus(null)
      starteErkennung()
    }
  }

  async function frageSenden() {
    const text = input.trim()
    if (!text || chatLaedt) return
    // Mikrofon sicher beenden
    aktivRef.current = false
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    setHoert(false)
    setVoiceStatus(null)
    basisRef.current = ''
    letzterTextRef.current = ''
    // laufendes Vorlesen stoppen
    if (ttsVerfuegbar) window.speechSynthesis.cancel()
    setSprichtKey(null)

    const neu: ChatMsg[] = [...chat, { role: 'user', content: text }]
    setChat(neu)
    setInput('')
    setChatLaedt(true)
    try {
      // fuer die KI nur die reinen Text-Nachrichten mitgeben (ohne Aktions-Metadaten)
      const verlauf = neu.map((m) => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/cockpit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kontext: datenZeilen(props), messages: verlauf }),
      })
      const data = await res.json()
      if (data && data.aktion) {
        // Etappe 3: Befehl erkannt -> Bestaetigungs-Karte anzeigen (noch nichts ausgefuehrt)
        setChat((prev) => [...prev, { role: 'assistant', content: data.klartext || 'Soll ich das ausführen?', aktion: data.aktion, status: 'offen' }])
      } else {
        setChat((prev) => [...prev, { role: 'assistant', content: data.antwort || data.error || 'Es kam keine Antwort zurück.' }])
      }
    } catch {
      setChat((prev) => [...prev, { role: 'assistant', content: 'Verbindungsfehler. Bitte erneut versuchen.' }])
    } finally {
      setChatLaedt(false)
    }
  }

  // ---- Etappe 3: Aktion nach Bestaetigung ausfuehren ----
  async function aktionAusfuehren(index: number) {
    const msg = chat[index]
    if (!msg || !msg.aktion || msg.status !== 'offen' || aktionLaeuft !== null) return
    setAktionLaeuft(index)

    // Team-Nachrichten sollen als der Chef erscheinen -> Namen mitgeben
    const aktion = { ...msg.aktion }
    if (aktion.typ === 'team_nachricht' && !aktion.absender_name) {
      aktion.absender_name = props.chefName || 'Chef'
    }

    try {
      const res = await fetch('/api/cockpit-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktion }),
      })
      const data = await res.json()
      if (data && data.ok) {
        // Karte als erledigt markieren + gruene Erfolgsmeldung anhaengen
        setChat((prev) => {
          const kopie = [...prev]
          if (kopie[index]) kopie[index] = { ...kopie[index], status: 'erledigt' }
          return [...kopie, { role: 'assistant', content: '✓ ' + (data.meldung || 'Erledigt.') }]
        })
      } else if (data && data.rueckfrage) {
        // KI/Route braucht eine Praezisierung -> Karte schliessen, Rueckfrage als Bubble
        const zusatz = Array.isArray(data.optionen) && data.optionen.length
          ? '\n\n' + data.optionen.map((o: string) => '– ' + o).join('\n')
          : ''
        setChat((prev) => {
          const kopie = [...prev]
          if (kopie[index]) kopie[index] = { ...kopie[index], status: 'abgebrochen' }
          return [...kopie, { role: 'assistant', content: (data.rueckfrage || 'Bitte präzisiere kurz.') + zusatz }]
        })
      } else {
        setChat((prev) => [...prev, { role: 'assistant', content: (data && data.meldung) || 'Die Aktion konnte nicht ausgeführt werden.' }])
      }
    } catch {
      setChat((prev) => [...prev, { role: 'assistant', content: 'Verbindungsfehler bei der Ausführung. Bitte erneut versuchen.' }])
    } finally {
      setAktionLaeuft(null)
    }
  }

  function aktionAbbrechen(index: number) {
    setChat((prev) => {
      const kopie = [...prev]
      if (kopie[index]) kopie[index] = { ...kopie[index], status: 'abgebrochen' }
      return kopie
    })
  }

  const stimmung = ki?.stimmung || 'neutral'
  const akzent = stimmungFarbe[stimmung] || GOLD

  return (
    <section style={wrap}>
      <div style={karte}>
        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: ki || laedt ? '18px' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={augeKreis}><span style={{ fontSize: '22px' }}>{'\uD83D\uDC41'}</span></div>
            <div>
              <h2 style={titel}>Dein Betrieb heute</h2>
              <p style={untertitel}>Ein Klick – die KI fasst zusammen, worauf es heute ankommt, liest vor und beantwortet deine Rückfragen.</p>
            </div>
          </div>
          {!ki && !laedt ? (
            <button onClick={berichtErstellen} style={hauptBtn} className="cockpit-btn">Tagesbericht erstellen</button>
          ) : null}
        </div>

        {laedt ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255,255,255,0.6)', fontSize: '14px', paddingTop: '4px' }}>
            <span style={pulsPunkt} /> Die KI wertet deinen Betrieb aus…
          </div>
        ) : null}

        {fehler ? <p style={{ color: '#ef4444', fontSize: '14px', margin: '4px 0 0' }}>{fehler}</p> : null}

        {ki && !laedt ? (
          <div>
            {/* Stimmungs-Badge + Vorlese-Steuerung */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: akzent, background: akzent + '1e', border: '1px solid ' + akzent + '55', borderRadius: '999px', padding: '5px 12px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: akzent, display: 'inline-block' }} />
                {stimmungLabel[stimmung] || 'Überblick'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {ttsVerfuegbar ? (
                  <button onClick={() => sprich([ki.klartext || '', ...(ki.punkte || [])].join('\n'), 'bericht')} style={{ ...nebenBtn, ...(sprichtKey === 'bericht' ? { color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' } : null) }} className="cockpit-btn">
                    {sprichtKey === 'bericht' ? '⏹ Stopp' : '🔊 Vorlesen'}
                  </button>
                ) : null}
                <button onClick={berichtErstellen} style={nebenBtn} className="cockpit-btn">↻ Neu</button>
              </div>
            </div>

            {ki.klartext ? <p style={{ fontSize: '16px', lineHeight: 1.65, color: 'rgba(255,255,255,0.9)', margin: '0 0 16px' }}>{ki.klartext}</p> : null}

            {ki.punkte && ki.punkte.length > 0 ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {ki.punkte.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>
                    <span style={{ color: GOLD, fontWeight: 800, flexShrink: 0 }}>{'\u2192'}</span><span>{p}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* ---- Etappe 2: Rueckfragen + Etappe 3: Aktionen ---- */}
            <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: CYAN, margin: '0 0 12px' }}>Rückfrage oder Auftrag</p>

              {chat.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                  {chat.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      {m.aktion ? (
                        // ----- Etappe 3: Bestaetigungs-Karte -----
                        <div style={{ ...aktionKarte, opacity: m.status && m.status !== 'offen' ? 0.7 : 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={aktionBadge}>{aktionLabel(m.aktion.typ)}</span>
                          </div>
                          <p style={{ margin: '0 0 12px', fontSize: '14px', lineHeight: 1.55, color: 'rgba(255,255,255,0.92)', whiteSpace: 'pre-wrap' }}>{m.content}</p>
                          {m.status === 'offen' ? (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button onClick={() => aktionAusfuehren(i)} disabled={aktionLaeuft !== null} style={{ ...jaBtn, ...(aktionLaeuft !== null ? { opacity: 0.6, cursor: 'not-allowed' } : null) }} className="cockpit-btn">
                                {aktionLaeuft === i ? 'Führe aus…' : '✓ Ja, ausführen'}
                              </button>
                              <button onClick={() => aktionAbbrechen(i)} disabled={aktionLaeuft !== null} style={neinBtn} className="cockpit-btn">Abbrechen</button>
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: m.status === 'erledigt' ? '#3ddc84' : 'rgba(255,255,255,0.45)' }}>
                              {m.status === 'erledigt' ? '✓ Ausgeführt' : 'Abgebrochen'}
                            </p>
                          )}
                        </div>
                      ) : (
                        // ----- normale Text-Bubble -----
                        <>
                          <div style={{
                            maxWidth: '90%', padding: '10px 14px', fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap',
                            borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                            background: m.role === 'user' ? GOLD : 'rgba(255,255,255,0.06)',
                            color: m.role === 'user' ? '#0A1628' : 'rgba(255,255,255,0.9)',
                            fontWeight: m.role === 'user' ? 600 : 400,
                          }}>{m.content}</div>
                          {m.role === 'assistant' && ttsVerfuegbar ? (
                            <button onClick={() => sprich(m.content, 'a' + i)} style={{ marginTop: '4px', background: 'none', border: 'none', color: sprichtKey === 'a' + i ? '#ef4444' : 'rgba(201,168,76,0.85)', fontSize: '12px', cursor: 'pointer', padding: '2px 4px', fontWeight: 600 }} className="cockpit-btn">
                              {sprichtKey === 'a' + i ? '⏹ Stopp' : '🔊 Vorlesen'}
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}
                  {chatLaedt ? <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>ARGONAUT denkt nach…</div> : null}
                </div>
              ) : null}

              {voiceStatus ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: voiceStatus.fehler ? '#E0A24C' : '#E06666', display: 'inline-block' }} />
                  <span style={{ fontSize: '12px', color: voiceStatus.fehler ? '#E0A24C' : '#E06666', fontWeight: 600, lineHeight: 1.4 }}>{voiceStatus.text}</span>
                </div>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); frageSenden() } }}
                  placeholder={hoert ? 'Sprich jetzt …' : 'Frage stellen oder Auftrag geben, z. B. „Leg Thomas eine Aufgabe an: Angebot Müller prüfen"'}
                  rows={1}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '11px 14px', color: '#FFFFFF', fontSize: '14px', lineHeight: 1.5, outline: 'none', resize: 'none', minHeight: '44px', maxHeight: '130px', fontFamily: 'inherit' }}
                />
                {voiceOk ? (
                  <button
                    onClick={toggleVoice}
                    title={hoert ? 'Aufnahme stoppen' : 'Per Sprache fragen'}
                    style={{
                      background: hoert ? '#E06666' : 'rgba(255,255,255,0.06)',
                      border: hoert ? 'none' : '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px', padding: '11px 13px', cursor: 'pointer', fontSize: '16px', lineHeight: 1,
                      boxShadow: hoert ? '0 0 0 3px rgba(224,102,102,0.25)' : 'none',
                    }}
                    className="cockpit-btn"
                  >🎤</button>
                ) : null}
                <button onClick={frageSenden} disabled={chatLaedt} style={{ background: chatLaedt ? 'rgba(201,168,76,0.4)' : GOLD, color: '#0A1628', border: 'none', borderRadius: '10px', padding: '11px 16px', fontWeight: 800, cursor: chatLaedt ? 'not-allowed' : 'pointer', fontSize: '16px' }} className="cockpit-btn">→</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <style>{cockpitCss}</style>
    </section>
  )
}

function aktionLabel(typ: string): string {
  if (typ === 'aufgabe_anlegen') return 'AUFGABE'
  if (typ === 'team_nachricht') return 'TEAM-NACHRICHT'
  if (typ === 'wiedervorlage') return 'WIEDERVORLAGE'
  return 'AKTION'
}

const wrap: CSSProperties = { marginBottom: '28px' }

const karte: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(0,229,255,0.06) 0%, rgba(201,168,76,0.05) 100%)',
  border: '1px solid rgba(0,229,255,0.25)',
  borderRadius: '18px',
  padding: '24px 26px',
}

const augeKreis: CSSProperties = {
  width: '46px', height: '46px', borderRadius: '14px',
  background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.35)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

const titel: CSSProperties = { fontSize: 'clamp(18px, 2vw, 24px)', fontWeight: 900, margin: 0, color: '#FFFFFF', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }
const untertitel: CSSProperties = { fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }

const hauptBtn: CSSProperties = {
  background: GOLD, color: '#0A1628', border: 'none', borderRadius: '10px',
  padding: '12px 22px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif',
}

const nebenBtn: CSSProperties = {
  background: 'rgba(255,255,255,0.05)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '9px', padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}

const pulsPunkt: CSSProperties = {
  width: '10px', height: '10px', borderRadius: '999px', background: CYAN, display: 'inline-block', boxShadow: '0 0 10px ' + CYAN,
}

// ---- Etappe 3: Stile der Bestaetigungs-Karte ----
const aktionKarte: CSSProperties = {
  maxWidth: '92%', width: '100%', padding: '14px 16px',
  borderRadius: '12px 12px 12px 3px',
  background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.35)',
}

const aktionBadge: CSSProperties = {
  fontSize: '10px', fontWeight: 800, letterSpacing: '0.09em', color: CYAN,
  background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.4)',
  borderRadius: '6px', padding: '3px 8px',
}

const jaBtn: CSSProperties = {
  background: '#3ddc84', color: '#04160c', border: 'none', borderRadius: '9px',
  padding: '9px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
}

const neinBtn: CSSProperties = {
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: '9px', padding: '9px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}

const cockpitCss = '.cockpit-btn:hover { filter: brightness(1.1); }'
