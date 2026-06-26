'use client'

import { useState } from 'react'

export type LeadDetail = {
  id: string
  created_at: string
  name: string | null
  telefon: string | null
  email: string | null
  dienstleistung: string | null
  menge: string | null
  einheit: string | null
  wunschtermin: string | null
  nachricht: string | null
  status: string | null
  score: number | null
  ki_intent: string | null
  ki_zusammenfassung: string | null
  ki_naechster_schritt: string | null
  quelle: string | null
  ist_bestand: boolean | null
  angebot_entwurf: string | null
  angebot_status: string | null
  angebot_erstellt_am: string | null
  angebot_versendet_am: string | null
}

const card = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  padding: '24px',
}

const labelStil = { fontSize: '11px', color: '#C9A84C', letterSpacing: '0.12em', textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: '4px' }
const wertStil = { fontSize: '15px', color: '#FFFFFF', margin: 0, wordBreak: 'break-word' as const }
const leerStil = { fontSize: '15px', color: 'rgba(255,255,255,0.3)', margin: 0, fontStyle: 'italic' as const }

function Feld({ label, wert }: { label: string; wert: string | null }) {
  return (
    <div>
      <div style={labelStil}>{label}</div>
      {wert ? <p style={wertStil}>{wert}</p> : <p style={leerStil}>{'\u2014'}</p>}
    </div>
  )
}

function formatDatum(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function LeadDetailClient({ lead }: { lead: LeadDetail }) {
  const [entwurf, setEntwurf] = useState<string>(lead.angebot_entwurf ?? '')
  const [angebotStatus, setAngebotStatus] = useState<string>(lead.angebot_status ?? '')
  const [erstelltAm, setErstelltAm] = useState<string | null>(lead.angebot_erstellt_am ?? null)
  const [ladend, setLadend] = useState(false)
  const [speichernd, setSpeichernd] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [pdfLadend, setPdfLadend] = useState(false)
  const [pdfMeldung, setPdfMeldung] = useState<string | null>(null)
  const [versendetAm, setVersendetAm] = useState<string | null>(lead.angebot_versendet_am ?? null)
  const [sendLadend, setSendLadend] = useState(false)
  const [sendMeldung, setSendMeldung] = useState<string | null>(null)

  const mengeAnzeige = [lead.menge, lead.einheit].filter(Boolean).join(' ') || null

  async function entwurfErzeugen() {
    setLadend(true)
    setMeldung(null)
    try {
      const res = await fetch('/api/leads/angebot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error || 'Erzeugen fehlgeschlagen.')
      }
      const j = await res.json()
      setEntwurf(j.angebot_entwurf ?? '')
      setAngebotStatus(j.angebot_status ?? 'Entwurf')
      setErstelltAm(j.angebot_erstellt_am ?? new Date().toISOString())
      setMeldung('Entwurf erzeugt.')
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : 'Fehler beim Erzeugen.')
    } finally {
      setLadend(false)
    }
  }

  async function speichern(neuerStatus?: string) {
    setSpeichernd(true)
    setMeldung(null)
    try {
      const res = await fetch('/api/leads/angebot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lead.id,
          angebot_entwurf: entwurf,
          angebot_status: neuerStatus ?? angebotStatus ?? 'Entwurf',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error || 'Speichern fehlgeschlagen.')
      }
      if (neuerStatus) setAngebotStatus(neuerStatus)
      setMeldung(neuerStatus === 'Freigegeben' ? 'Angebot freigegeben.' : 'Gespeichert.')
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : 'Fehler beim Speichern.')
    } finally {
      setSpeichernd(false)
    }
  }

  async function pdfErzeugen() {
    setPdfLadend(true)
    setPdfMeldung(null)
    try {
      const res = await fetch('/api/leads/angebot-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error || 'PDF konnte nicht erzeugt werden.')
      setPdfMeldung('PDF erstellt \u2013 im Bereich Dokumente abrufbar.')
    } catch (e) {
      setPdfMeldung(e instanceof Error ? e.message : 'Fehler bei der PDF-Erzeugung.')
    } finally {
      setPdfLadend(false)
    }
  }

  async function angebotSenden() {
    // Sicherheits-Abfrage: nichts versehentlich rausschicken
    const ziel = lead.email || 'den Lead'
    const ok = window.confirm(
      'Angebot als PDF per Mail an ' + ziel + ' senden?\n\n' +
      'Die aktuelle, freigegebene Fassung wird als PDF erzeugt und verschickt.'
    )
    if (!ok) return

    setSendLadend(true)
    setSendMeldung(null)
    try {
      const res = await fetch('/api/leads/angebot-senden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error || 'Versand fehlgeschlagen.')
      setVersendetAm(j.versendet_am ?? new Date().toISOString())
      setSendMeldung('Angebot wurde per Mail versendet.')
    } catch (e) {
      setSendMeldung(e instanceof Error ? e.message : 'Fehler beim Versand.')
    } finally {
      setSendLadend(false)
    }
  }

  const istFreigegeben = angebotStatus === 'Freigegeben'
  const hatEmail = !!(lead.email && lead.email.trim() !== '')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: '24px', alignItems: 'start' }}>

      {/* Linke Spalte: Stammdaten + KI */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 4px' }}>{lead.name || 'Ohne Namen'}</h1>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                Eingegangen am {formatDatum(lead.created_at)}
              </p>
            </div>
            {lead.status && (
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#00e5ff', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: '8px', padding: '5px 12px', whiteSpace: 'nowrap' }}>
                {lead.status}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
            <Feld label="Telefon" wert={lead.telefon} />
            <Feld label="E-Mail" wert={lead.email} />
            <Feld label="Dienstleistung" wert={lead.dienstleistung} />
            <Feld label="Menge" wert={mengeAnzeige} />
            <Feld label="Wunschtermin" wert={lead.wunschtermin} />
            <Feld label="Quelle" wert={lead.quelle} />
          </div>

          <div style={{ marginTop: '18px' }}>
            <Feld label="Nachricht" wert={lead.nachricht} />
          </div>
        </section>

        {(lead.score != null || lead.ki_intent || lead.ki_zusammenfassung || lead.ki_naechster_schritt) && (
          <section style={{ ...card, border: '1px solid rgba(201,168,76,0.25)', background: 'rgba(201,168,76,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase' }}>KI-Einsch\u00e4tzung</span>
              {lead.score != null && (
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0A1628', background: '#C9A84C', borderRadius: '6px', padding: '3px 10px' }}>
                  Score {lead.score}/5
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Feld label="Intent" wert={lead.ki_intent} />
              <Feld label="Zusammenfassung" wert={lead.ki_zusammenfassung} />
              <Feld label="N\u00e4chster Schritt" wert={lead.ki_naechster_schritt} />
            </div>
          </section>
        )}
      </div>

      {/* Rechte Spalte: KI-Angebotsentwurf */}
      <section style={{ ...card, position: 'sticky', top: '92px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 800, margin: 0 }}>KI-Angebotsentwurf</h2>
          {angebotStatus && (
            <span style={{ fontSize: '12px', fontWeight: 700, color: angebotStatus === 'Freigegeben' ? '#3ddc84' : '#C9A84C', background: angebotStatus === 'Freigegeben' ? 'rgba(61,220,132,0.12)' : 'rgba(201,168,76,0.12)', border: `1px solid ${angebotStatus === 'Freigegeben' ? 'rgba(61,220,132,0.3)' : 'rgba(201,168,76,0.3)'}`, borderRadius: '8px', padding: '4px 12px' }}>
              {angebotStatus}
            </span>
          )}
        </div>

        {erstelltAm && (
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>
            Erstellt am {formatDatum(erstelltAm)}
          </p>
        )}

        <textarea
          value={entwurf}
          onChange={(e) => setEntwurf(e.target.value)}
          placeholder="Noch kein Entwurf vorhanden. Klicken Sie auf \u201eEntwurf erzeugen\u201c, um aus den Lead-Daten einen Angebotsvorschlag zu erstellen."
          style={{
            width: '100%',
            minHeight: '320px',
            resize: 'vertical',
            background: 'rgba(10,22,40,0.6)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px',
            padding: '14px',
            color: '#FFFFFF',
            fontSize: '14px',
            lineHeight: 1.6,
            fontFamily: 'var(--font-dm-sans), sans-serif',
            boxSizing: 'border-box',
          }}
        />

        {meldung && (
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: '12px 0 0' }}>{meldung}</p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '18px' }}>
          <button
            onClick={entwurfErzeugen}
            disabled={ladend}
            style={{
              flex: '1 1 auto',
              padding: '12px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(0,229,255,0.4)',
              background: ladend ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.12)',
              color: '#00e5ff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: ladend ? 'default' : 'pointer',
              fontFamily: 'var(--font-dm-sans), sans-serif',
            }}
          >
            {ladend ? 'Wird erzeugt\u2026' : (entwurf ? 'Neu erzeugen' : 'Entwurf erzeugen')}
          </button>

          <button
            onClick={() => speichern()}
            disabled={speichernd || !entwurf}
            style={{
              flex: '0 0 auto',
              padding: '12px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 600,
              cursor: (speichernd || !entwurf) ? 'default' : 'pointer',
              opacity: (!entwurf) ? 0.5 : 1,
              fontFamily: 'var(--font-dm-sans), sans-serif',
            }}
          >
            Speichern
          </button>

          <button
            onClick={() => speichern('Freigegeben')}
            disabled={speichernd || !entwurf}
            style={{
              flex: '0 0 auto',
              padding: '12px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(61,220,132,0.4)',
              background: 'rgba(61,220,132,0.12)',
              color: '#3ddc84',
              fontSize: '14px',
              fontWeight: 700,
              cursor: (speichernd || !entwurf) ? 'default' : 'pointer',
              opacity: (!entwurf) ? 0.5 : 1,
              fontFamily: 'var(--font-dm-sans), sans-serif',
            }}
          >
            Freigeben
          </button>
        </div>

        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '14px 0 0', lineHeight: 1.5 }}>
          Der Entwurf wird nicht automatisch versendet. Pr\u00fcfen, bei Bedarf bearbeiten und erst dann freigeben.
        </p>

        {/* PDF-Erzeugung - erst nach Freigabe */}
        <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={pdfErzeugen}
            disabled={pdfLadend || !istFreigegeben}
            style={{
              width: '100%',
              padding: '12px 18px',
              borderRadius: '10px',
              border: 'none',
              background: istFreigegeben ? '#C9A84C' : 'rgba(255,255,255,0.06)',
              color: istFreigegeben ? '#0A1628' : 'rgba(255,255,255,0.4)',
              fontSize: '14px',
              fontWeight: 800,
              cursor: (pdfLadend || !istFreigegeben) ? 'default' : 'pointer',
              opacity: pdfLadend ? 0.6 : 1,
              fontFamily: 'var(--font-dm-sans), sans-serif',
            }}
          >
            {pdfLadend ? 'PDF wird erzeugt\u2026' : 'Als PDF erzeugen'}
          </button>
          {!istFreigegeben && (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '10px 0 0', lineHeight: 1.5 }}>
              Erst nach Freigabe des Angebots verf\u00fcgbar \u2013 so geht kein Entwurf mit Platzhaltern raus.
            </p>
          )}
          {pdfMeldung && (
            <p style={{ fontSize: '13px', color: '#3ddc84', fontWeight: 600, margin: '10px 0 0' }}>{pdfMeldung}</p>
          )}
        </div>

        {/* V6: Angebot per Mail senden - erst nach Freigabe + nur mit E-Mail */}
        <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={angebotSenden}
            disabled={sendLadend || !istFreigegeben || !hatEmail}
            style={{
              width: '100%',
              padding: '12px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(0,229,255,0.4)',
              background: (istFreigegeben && hatEmail) ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.06)',
              color: (istFreigegeben && hatEmail) ? '#00e5ff' : 'rgba(255,255,255,0.4)',
              fontSize: '14px',
              fontWeight: 800,
              cursor: (sendLadend || !istFreigegeben || !hatEmail) ? 'default' : 'pointer',
              opacity: sendLadend ? 0.6 : 1,
              fontFamily: 'var(--font-dm-sans), sans-serif',
            }}
          >
            {sendLadend ? 'Wird versendet\u2026' : (versendetAm ? 'Angebot erneut senden' : 'Angebot per Mail senden')}
          </button>

          {versendetAm && (
            <p style={{ fontSize: '12px', color: '#3ddc84', fontWeight: 600, margin: '10px 0 0' }}>
              Bereits versendet am {formatDatum(versendetAm)}
            </p>
          )}

          {istFreigegeben && !hatEmail && (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '10px 0 0', lineHeight: 1.5 }}>
              Kein Versand m\u00f6glich \u2013 f\u00fcr diesen Lead ist keine E-Mail-Adresse hinterlegt.
            </p>
          )}
          {!istFreigegeben && (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '10px 0 0', lineHeight: 1.5 }}>
              Erst nach Freigabe des Angebots verf\u00fcgbar.
            </p>
          )}
          {sendMeldung && (
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: '10px 0 0' }}>{sendMeldung}</p>
          )}
        </div>
      </section>
    </div>
  )
}
