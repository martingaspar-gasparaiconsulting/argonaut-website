'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/AngebotAnfrage.tsx
// EIN GUSS: Preis-Konfigurator + Anfrage in einem durchgehenden Block.
// Der Chef stellt Mitarbeiter/Sitze ein, sieht den Live-Preis und trägt direkt
// darunter seine Daten ein. Config + Preis wandern automatisch in die Anfrage.
// Kontaktwunsch (Anruf/E-Mail, Pflicht), eigener Termin-Picker, Datenschutz+AGB.
// Rollen (Voll/Standard/Self) sind branchengerecht setzbar (optional, mit Fallback).
// Sendet an /api/website-anfrage → n8n → eigenes CRM + Bestätigungsmail.
// ============================================================================

import { useState } from 'react'
import TerminPicker from './TerminPicker'

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

const DEFAULT_ROLLEN = {
  voll: 'Chef, GF, Büro, Dispo',
  std: 'Sachbearbeiter mit Doku',
  self: 'Zeiterfassung, Lohnzettel, Mein Bereich',
}

function grundgebuehr(ma: number) {
  if (ma <= 1) return { name: 'SOLO', fee: 499, solo: true }
  if (ma <= 9) return { name: 'Mini', fee: 490, solo: false }
  if (ma <= 24) return { name: 'Klein', fee: 990, solo: false }
  if (ma <= 99) return { name: 'Mittel', fee: 1990, solo: false }
  if (ma <= 499) return { name: 'Groß', fee: 3490, solo: false }
  return { name: 'Enterprise', fee: 5990, solo: false }
}
function setupFee(ma: number) {
  if (ma <= 1) return '1.500 €'
  if (ma <= 9) return '2.500 €'
  if (ma <= 24) return '5.000 €'
  if (ma <= 99) return '12.000 €'
  return 'auf Anfrage'
}
function vollPrice(n: number) { return n <= 20 ? 380 : n <= 100 ? 320 : n <= 500 ? 260 : 190 }
function stdPrice(n: number) { return n <= 20 ? 170 : n <= 100 ? 145 : n <= 500 ? 120 : 90 }
function selfPrice(n: number) { return n >= 500 ? 14 : 19 }
function fmt(n: number) { return n.toLocaleString('de-DE') }

const stepBtn: React.CSSProperties = {
  width: '30px', height: '30px', borderRadius: '8px',
  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
  color: GOLD, fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: '10px',
  border: '1px solid rgba(122,163,179,0.22)', background: 'rgba(234,241,246,0.04)',
  color: '#EAF1F6', fontSize: '.95rem', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'var(--font-dm-sans), sans-serif',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '.82rem', color: '#8fa9b6', margin: '0 0 6px' }

export default function AngebotAnfrage({ branche, rollen }: { branche?: string; rollen?: { voll: string; std: string; self: string } }) {
  const R = rollen ?? DEFAULT_ROLLEN
  // Konfigurator
  const [ma, setMa] = useState(12)
  const [voll, setVoll] = useState(2)
  const [std, setStd] = useState(4)
  const [self, setSelf] = useState(6)
  // Anfrage
  const [f, setF] = useState({ name: '', unternehmen: '', email: '', telefon: '', kontaktwunsch: '', wunschtermin: '', wunschterminKey: '', nachricht: '', privacy: false, agb: false })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))

  const g = grundgebuehr(ma)
  const solo = g.solo
  const vollSum = solo ? 0 : voll * vollPrice(voll)
  const stdSum = solo ? 0 : std * stdPrice(std)
  const selfSum = solo ? 0 : self * selfPrice(self)
  const total = solo ? 499 : g.fee + vollSum + stdSum + selfSum

  function fillMix() {
    const v = Math.max(1, Math.round(ma * 0.16))
    const s = Math.round(ma * 0.32)
    const se = Math.max(0, ma - v - s)
    setVoll(v); setStd(s); setSelf(se)
  }

  function angebotText() {
    if (solo) return `SOLO (Einzelunternehmer) · 499 €/Monat + Einrichtung ${setupFee(ma)}`
    return `${ma} Mitarbeiter · ${voll} Voll / ${std} Standard / ${self} Self-Service · ${fmt(total)} €/Monat + Einrichtung ${setupFee(ma)}`
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.name.trim()) { setError('Bitte Ihren Namen angeben.'); return }
    if (!f.email.trim() && !f.telefon.trim()) { setError('Bitte E-Mail oder Telefon angeben.'); return }
    if (!f.kontaktwunsch) { setError('Bitte wählen: Anruf oder E-Mail.'); return }
    if (!f.privacy) { setError('Bitte der Datenschutzerklärung zustimmen.'); return }
    if (!f.agb) { setError('Bitte den AGB zustimmen.'); return }
    setStatus('sending')
    try {
      const res = await fetch('/api/website-anfrage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          branche: branche ?? null,
          mitarbeiter: String(ma),
          angebot: angebotText(),
          preis: `${fmt(total)} €/Monat`,
        }),
      })
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}))
        setStatus('idle')
        setError(j.error || 'Der gewählte Termin ist gerade vergeben. Bitte einen anderen wählen.')
        setF((p) => ({ ...p, wunschtermin: '', wunschterminKey: '' }))
        setReload((n) => n + 1)
        return
      }
      if (!res.ok) throw new Error()
      setStatus('success')
    } catch {
      setStatus('error')
      setError('Senden fehlgeschlagen. Bitte später erneut versuchen oder uns direkt kontaktieren.')
    }
  }

  const kontaktLabel = f.kontaktwunsch === 'Anruf' ? 'telefonisch' : 'per E-Mail'

  const pill = (val: string, label: string) => (
    <button type="button" onClick={() => set('kontaktwunsch', val)}
      style={{
        flex: 1, padding: '11px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '.92rem', fontWeight: 600,
        border: `1px solid ${f.kontaktwunsch === val ? 'rgba(201,168,76,0.7)' : 'rgba(122,163,179,0.22)'}`,
        background: f.kontaktwunsch === val ? 'rgba(201,168,76,0.12)' : 'rgba(234,241,246,0.04)',
        color: f.kontaktwunsch === val ? GOLD : '#c4d3db',
      }}>{label}</button>
  )

  const Row = ({ label, who, unit, val, setV, min = 0 }: { label: string; who: string; unit: number; val: number; setV: (n: number) => void; min?: number }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px 0', borderBottom: '1px solid rgba(122,163,179,0.10)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 700, color: '#EAF1F6', margin: 0 }}>{label}</p>
        <p style={{ fontSize: '.8rem', color: '#8fa9b6', margin: '2px 0 0' }}>{who} · je {unit} €</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button type="button" onClick={() => setV(Math.max(min, val - 1))} style={stepBtn} aria-label="weniger">−</button>
        <span style={{ minWidth: '30px', textAlign: 'center', color: '#EAF1F6', fontWeight: 600 }}>{val}</span>
        <button type="button" onClick={() => setV(val + 1)} style={stepBtn} aria-label="mehr">+</button>
        <span style={{ minWidth: '86px', textAlign: 'right', color: GOLD, fontWeight: 600 }}>{fmt(val * unit)} €</span>
      </div>
    </div>
  )

  if (status === 'success') {
    return (
      <section id="demo" style={{ padding: '30px 0 70px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '18px', padding: '48px 24px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.6rem' }} aria-hidden="true">🔱</div>
            <p style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#EAF1F6', margin: '0 0 8px' }}>Anfrage erhalten!</p>
            <p style={{ color: '#b9cdd6', margin: 0, lineHeight: 1.6 }}>
              Danke, {f.name.split(' ')[0] || 'und bis gleich'}. Wir melden uns persönlich {kontaktLabel} — wie gewünscht{f.wunschtermin ? `, Wunschtermin ${f.wunschtermin} Uhr` : ''}. Eine Bestätigung ist unterwegs in Ihr Postfach.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="demo" style={{ padding: '20px 0 70px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px' }}>
        <h2 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', lineHeight: 1.25, margin: '0 0 6px', textAlign: 'center' }}>
          Ihr Angebot{branche ? <> für <span style={{ color: GOLD }}>{branche}</span></> : null} — und direkt anfragen.
        </h2>
        <p style={{ fontSize: '.95rem', color: '#8fa9b6', margin: '0 0 22px', textAlign: 'center' }}>
          Mitarbeiter & Sitze einstellen, Preis sehen, Termin wählen — alles in einem Schritt.
        </p>

        <form onSubmit={submit} style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '26px' }}>

          {/* --- KONFIGURATOR --- */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', paddingBottom: '18px', borderBottom: '1px solid rgba(122,163,179,0.14)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#c4d3db' }}>Mitarbeiter im Betrieb:</span>
              <button type="button" onClick={() => setMa(Math.max(1, ma - 1))} style={stepBtn} aria-label="weniger">−</button>
              <span style={{ minWidth: '40px', textAlign: 'center', color: '#EAF1F6', fontWeight: 700, fontSize: '1.1rem' }}>{ma}</span>
              <button type="button" onClick={() => setMa(ma + 1)} style={stepBtn} aria-label="mehr">+</button>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '.78rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em' }}>Größe: {g.name} · Grundgebühr</p>
              <p style={{ margin: '2px 0 0', color: GOLD, fontWeight: 700, fontSize: '1.25rem' }}>{fmt(g.fee)} €<span style={{ fontSize: '.8rem', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span></p>
            </div>
          </div>

          {solo ? (
            <p style={{ color: '#c4d3db', margin: '18px 0 0', lineHeight: 1.6 }}>
              <strong style={{ color: '#EAF1F6' }}>SOLO ist all-in:</strong> 499 €/Monat inkl. 1 Voll-Nutzer und KI unbegrenzt — keine zusätzlichen Sitze nötig.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 4px' }}>
                <span style={{ fontSize: '.85rem', color: '#8fa9b6', textTransform: 'uppercase', letterSpacing: '.06em' }}>Sitze dazubuchen</span>
                <button type="button" onClick={fillMix} style={{ background: 'transparent', border: '1px solid rgba(122,163,179,0.3)', borderRadius: '999px', padding: '5px 12px', color: TEAL, fontSize: '.8rem', cursor: 'pointer' }}>
                  Mit typischem Mix füllen
                </button>
              </div>
              <Row label="Voll-Nutzer" who={R.voll} unit={vollPrice(voll)} val={voll} setV={setVoll} min={1} />
              <Row label="Standard-Nutzer" who={R.std} unit={stdPrice(std)} val={std} setV={setStd} min={0} />
              <Row label="Self-Service" who={R.self} unit={selfPrice(self)} val={self} setV={setSelf} min={0} />
            </>
          )}

          {/* Gesamt */}
          <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '14px', padding: '20px 22px', marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontSize: '.8rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em' }}>Ihr Preis</p>
              <p style={{ margin: '4px 0 0', fontSize: '.85rem', color: '#8fa9b6' }}>+ einmalige Einrichtung: {setupFee(ma)}</p>
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', color: GOLD, margin: 0, lineHeight: 1 }}>
              {fmt(total)} €<span style={{ fontSize: '.9rem', color: '#8fa9b6', fontWeight: 400 }}> / Monat</span>
            </p>
          </div>
          <p style={{ fontSize: '.76rem', color: '#7f97a4', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
            Preise netto, zzgl. 19 % MwSt. · Sitzpreise gestaffelt · Laufzeit-Rabatte (24/36 Mon.) noch nicht eingerechnet.
          </p>

          {/* --- ANFRAGE --- */}
          <div style={{ height: '1px', background: 'rgba(122,163,179,0.16)', margin: '28px 0' }} />
          <p style={{ fontWeight: 700, color: '#EAF1F6', fontSize: '1.1rem', margin: '0 0 4px' }}>Dieses Angebot anfragen</p>
          <p style={{ fontSize: '.85rem', color: '#8fa9b6', margin: '0 0 18px' }}>Ihre Konfiguration schicken wir gleich mit — Sie müssen nichts doppelt eintragen.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input style={inputStyle} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Vor- und Nachname" />
            </div>
            <div>
              <label style={labelStyle}>Unternehmen</label>
              <input style={inputStyle} value={f.unternehmen} onChange={(e) => set('unternehmen', e.target.value)} placeholder="Firmenname" />
            </div>
            <div>
              <label style={labelStyle}>E-Mail</label>
              <input type="email" style={inputStyle} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@firma.de" />
            </div>
            <div>
              <label style={labelStyle}>Telefon</label>
              <input style={inputStyle} value={f.telefon} onChange={(e) => set('telefon', e.target.value)} placeholder="+49 …" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Wie sollen wir Sie kontaktieren? *</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {pill('Anruf', '📞 Anruf')}
                {pill('E-Mail', '✉️ E-Mail')}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Wunschtermin (optional)</label>
              <TerminPicker key={reload} ma={ma} value={f.wunschtermin} onChange={(v, k) => setF((p) => ({ ...p, wunschtermin: v, wunschterminKey: k }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Nachricht</label>
              <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={f.nachricht} onChange={(e) => set('nachricht', e.target.value)} placeholder="Worauf sollen wir besonders eingehen? (optional)" />
            </div>
          </div>

          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', margin: '16px 0 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.privacy} onChange={(e) => set('privacy', e.target.checked)} style={{ marginTop: '3px', accentColor: GOLD }} />
            <span style={{ fontSize: '.82rem', color: '#8fa9b6', lineHeight: 1.5 }}>
              Ich stimme zu, dass meine Angaben zur Bearbeitung meiner Anfrage verwendet werden. Details in der{' '}
              <a href="/datenschutz" style={{ color: TEAL }}>Datenschutzerklärung</a>. *
            </span>
          </label>
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', margin: '10px 0 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.agb} onChange={(e) => set('agb', e.target.checked)} style={{ marginTop: '3px', accentColor: GOLD }} />
            <span style={{ fontSize: '.82rem', color: '#8fa9b6', lineHeight: 1.5 }}>
              Ich akzeptiere die <a href="/agb" style={{ color: TEAL }}>AGB</a>. *
            </span>
          </label>

          {error && <p style={{ color: '#f0a3a3', fontSize: '.85rem', margin: '14px 0 0' }}>{error}</p>}

          <button type="submit" disabled={status === 'sending'} style={{ width: '100%', marginTop: '18px', background: GOLD, color: NAVY, fontWeight: 700, fontSize: '1rem', padding: '16px', borderRadius: '10px', border: 'none', cursor: status === 'sending' ? 'default' : 'pointer', opacity: status === 'sending' ? 0.7 : 1 }}>
            {status === 'sending' ? 'Wird gesendet …' : 'Anfrage senden →'}
          </button>
          <p style={{ fontSize: '.78rem', color: '#7f97a4', textAlign: 'center', margin: '12px 0 0' }}>
            Kostenlos & unverbindlich · Antwort in 24 Stunden
          </p>
        </form>
      </div>
    </section>
  )
}
