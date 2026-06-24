import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react'

export type Lead = {
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
}

type StatusKey = 'neu' | 'offen' | 'gewonnen' | 'verloren'

const STATUS: Record<StatusKey, { label: string; color: string }> = {
  neu:      { label: 'Neu',      color: '#00e5ff' },
  offen:    { label: 'Offen',    color: '#f59e0b' },
  gewonnen: { label: 'Gewonnen', color: '#22c55e' },
  verloren: { label: 'Verloren', color: '#ef4444' },
}

const STATUS_REIHENFOLGE: StatusKey[] = ['neu', 'offen', 'gewonnen', 'verloren']
const plus = { marginLeft: '16px', fontSize: '20px', lineHeight: '20px' };

const css = [
  '.arg-leads button:hover { filter: brightness(1.12); }',
  '.arg-leads .lead-card { transition: border-color .15s ease, transform .15s ease; }',
  '.arg-leads .lead-card:hover { border-color: rgba(201,168,76,0.4); transform: translateY(-1px); }',
].join('\n')

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  } catch {
    return '—'
  }
}

type ScoreInfo = { label: string; color: string }
function scoreInfo(score: number | null): ScoreInfo | null {
  switch (score) {
    case 5: return { label: 'Prioritaet 5 - Heiss', color: '#22c55e' }
    case 4: return { label: 'Prioritaet 4 - Hoch',  color: '#84cc16' }
    case 3: return { label: 'Prioritaet 3 - Mittel', color: '#C9A84C' }
    case 2: return { label: 'Prioritaet 2 - Niedrig', color: '#e08c3c' }
    case 1: return { label: 'Prioritaet 1 - Gering', color: '#b5677a' }
    default: return null
  }
}

function statusInfo(s: string | null): { label: string; color: string } {
  if (s && s in STATUS) return STATUS[s as StatusKey]
  return { label: s || 'Unbekannt', color: '#9AA7B5' }
}

function pillStyle(active: boolean, accent: string): CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 700,
    border: active ? '1px solid ' + accent + '88' : '1px solid rgba(255,255,255,0.12)',
    background: active ? accent + '22' : 'rgba(255,255,255,0.04)',
    color: active ? accent : 'rgba(255,255,255,0.65)',
    cursor: 'pointer',
    transition: 'all .15s ease',
  }
}

const labelStyle: CSSProperties = { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px', fontWeight: 700 }
const cardStyle: CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '18px 20px' }
export default function LeadsClient({ leads }: { leads: Lead[] }) {
  const [status, setStatus] = useState<'alle' | StatusKey>('alle')
  const [herkunft, setHerkunft] = useState<'alle' | 'neu' | 'bestand'>('alle')
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  const nachHerkunft = leads.filter((l) =>
    herkunft === 'alle' ? true : herkunft === 'bestand' ? l.ist_bestand === true : l.ist_bestand !== true
  )
  const gefiltert = nachHerkunft
    .filter((l) => (status === 'alle' ? true : l.status === status))
    .slice()
    .sort((a, b) => {
      const sa = a.score ?? -1
      const sb = b.score ?? -1
      if (sb !== sa) return sb - sa
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  const zaehle = (s: StatusKey) => nachHerkunft.filter((l) => l.status === s).length

  const neueWartend = leads.filter((l) => l.status === 'neu' && l.ist_bestand !== true).length
  const anzahlNeu = leads.filter((l) => l.ist_bestand !== true).length
  const anzahlBestand = leads.filter((l) => l.ist_bestand === true).length

  return (
    <div className="arg-leads">
      <style>{css}</style>

      {neueWartend > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.35)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00e5ff', flexShrink: 0, boxShadow: '0 0 10px #00e5ff' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
            {neueWartend === 1 ? '1 neue Anfrage wartet auf Reaktion' : neueWartend + ' neue Anfragen warten auf Reaktion'}
          </span>
        </div>
      ) : null}

      <div style={{ marginBottom: '22px' }}>
        <p style={labelStyle}>Herkunft</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <button onClick={() => setHerkunft('alle')} style={pillStyle(herkunft === 'alle', '#C9A84C')}>Alle ({leads.length})</button>
          <button onClick={() => setHerkunft('neu')} style={pillStyle(herkunft === 'neu', '#C9A84C')}>Neue Anfragen ({anzahlNeu})</button>
          <button onClick={() => setHerkunft('bestand')} style={pillStyle(herkunft === 'bestand', '#C9A84C')}>Bestand ({anzahlBestand})</button>
        </div>

        <p style={labelStyle}>Status</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setStatus('alle')} style={pillStyle(status === 'alle', '#C9A84C')}>Alle ({nachHerkunft.length})</button>
          {STATUS_REIHENFOLGE.map((s) => (
            <button key={s} onClick={() => setStatus(s)} style={pillStyle(status === s, STATUS[s].color)}>{STATUS[s].label} ({zaehle(s)})</button>
          ))}
          <button onClick={() => setModalOpen(true)} style={{ ...pillStyle(false, '#C9A84C'), whiteSpace: 'nowrap' }}>
            + Kontakt manuell anlegen<span style={plus}>&#xFF0B;</span>
          </button>
        </div>
      </div>
      {gefiltert.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'rgba(255,255,255,0.45)', padding: '40px 20px' }}>
          Keine Anfragen in dieser Ansicht.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {gefiltert.map((l) => {
            const si = statusInfo(l.status)
            return (
              <a key={l.id} href={"/dashboard/leads/" + l.id} className="lead-card" style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>{l.name || 'Ohne Namen'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: si.color, background: si.color + '22', border: '1px solid ' + si.color + '55', borderRadius: '999px', padding: '3px 10px' }}>{si.label}</span>
                    {(() => { const pi = scoreInfo(l.score); return pi ? (
                      <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em', color: pi.color, background: pi.color + '22', border: '1px solid ' + pi.color + '66', borderRadius: '999px', padding: '3px 10px' }}>{'\u2605 ' + l.score + ' - ' + pi.label.split(' - ')[1]}</span>
                    ) : null })()}
                    {l.ist_bestand ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#9AA7B5', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '3px 10px' }}>Bestand</span>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#C9A84C', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '999px', padding: '3px 10px' }}>Neue Anfrage</span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{formatDate(l.created_at)}</span>
                </div>

                <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>
                  {l.telefon ? <span>Tel: {l.telefon}</span> : null}
                  {l.email ? <span>E-Mail: {l.email}</span> : null}
                </div>

                <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                  {l.dienstleistung ? <span>Leistung: {l.dienstleistung}</span> : null}
                  {(l.menge || l.einheit) ? <span>Menge: {(l.menge || '') + ' ' + (l.einheit || '')}</span> : null}
                  {l.wunschtermin ? <span>Wunschtermin: {l.wunschtermin}</span> : null}
                  {l.quelle ? <span>Quelle: {l.quelle}</span> : null}
                </div>

                {l.nachricht ? (
                  <p style={{ margin: '12px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{l.nachricht}</p>
                ) : null}

                {l.ki_zusammenfassung ? (
                  <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.18)', borderRadius: '10px' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e5ff' }}>KI-Einschaetzung</p>
                    <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>{l.ki_zusammenfassung}</p>
                    {l.ki_naechster_schritt ? (
                      <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}><strong style={{ color: '#C9A84C' }}>Naechster Schritt:</strong> {l.ki_naechster_schritt}</p>
                    ) : null}
                  </div>
                ) : null}
              </a>
            )
          })}
        </div>
      )}

      {modalOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '500px', borderRadius: '12px', background: '#0A1628', border: '1px solid #1C3F53', boxShadow: '0 0 20px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>Kontakt manuell anlegen</h3>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15 5L5 15M5 5l10 10" />
                </svg>
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const body = {
                  name: form.name.value,
                  email: form.email.value,
                  telefon: form.telefon.value,
                  dienstleistung: form.dienstleistung.value,
                  nachricht: form.nachricht.value,
                  ist_bestand: form.ist_bestand.checked,
                  werbung_einwilligung: form.werbung_einwilligung.checked,
                };
                const res = await fetch('/api/leads/manuell', { 
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (res.ok) {
                  setModalOpen(false);
                  router.refresh();
                }
              }}>
                <p style={labelStyle}>Name *</p>
                <input name="name" required style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '6px', marginBottom: '12px' }} />
                
                <p style={labelStyle}>E-Mail</p>
                <input name="email" type="email" style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '6px', marginBottom: '12px' }} />

                <p style={labelStyle}>Telefon</p>
                <input name="telefon" style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '6px', marginBottom: '12px' }} />

                <p style={labelStyle}>Dienstleistung</p>  
                <input name="dienstleistung" style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '6px', marginBottom: '12px' }} />

                <p style={labelStyle}>Nachricht / Notiz</p>
                <textarea name="nachricht" rows={3} style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '6px', marginBottom: '12px', resize: 'vertical' }}></textarea>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                  <label style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input name="ist_bestand" type="checkbox" /> Bestandskunde
                  </label>
                  <label style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input name="werbung_einwilligung" type="checkbox" /> Werbe-Einwilligung liegt vor
                  </label>
                </div>

                <button type="submit" style={{ width: '100%', padding: '12px', border: 'none', borderRadius: '6px', background: '#C9A84C', color: '#0A1628', fontSize: '14px', fontWeight: 700 }}>
                  Kontakt anlegen
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}