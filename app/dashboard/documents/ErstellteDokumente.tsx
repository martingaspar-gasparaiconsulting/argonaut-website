'use client'

import { useEffect, useState } from 'react'

interface ErstelltesDokument {
  id: string
  name: string
  typ: string
  status: string
  herkunft: string | null
  agent: string | null
  created_at: string
}

const TYP_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pdf: { bg: 'rgba(226,75,74,0.14)', color: '#F09595', label: 'PDF' },
  xlsx: { bg: 'rgba(40,180,120,0.14)', color: '#5DD6A0', label: 'XLS' },
  docx: { bg: 'rgba(55,138,221,0.16)', color: '#85B7EB', label: 'DOC' },
  pptx: { bg: 'rgba(230,126,34,0.16)', color: '#F0B27A', label: 'PPTX' },
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  entwurf: { bg: 'rgba(201,168,76,0.18)', color: '#E7C76A', label: 'Entwurf' },
  gesendet: { bg: 'rgba(40,180,120,0.16)', color: '#5DD6A0', label: 'Gesendet' },
  signiert: { bg: 'rgba(0,229,255,0.14)', color: '#6FE7F5', label: 'Signiert' },
}

export default function ErstellteDokumente() {
  const [docs, setDocs] = useState<ErstelltesDokument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ladeId, setLadeId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/erstellte-dokumente')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setDocs(d.dokumente)
        else setError(d.error || 'Fehler beim Laden')
      })
      .catch(() => setError('Verbindungsfehler'))
      .finally(() => setLoading(false))
  }, [])

  async function herunterladen(id: string) {
    setLadeId(id)
    try {
      const res = await fetch('/api/erstellte-dokumente/download?id=' + encodeURIComponent(id))
      const data = await res.json()
      if (res.ok && data.ok && data.url) {
        // Signed URL in neuem Tab oeffnen -> Browser startet den Download
        window.open(data.url, '_blank')
      } else {
        alert(data.error || 'Download fehlgeschlagen.')
      }
    } catch {
      alert('Verbindungsfehler beim Download.')
    } finally {
      setLadeId(null)
    }
  }

  const boxBase = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '40px 24px',
    textAlign: 'center' as const,
    fontSize: 'clamp(15px, 1.31vw, 21px)',
  }

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif', color: '#FFFFFF' }}>
      <h2 style={{ fontSize: 'clamp(18px, 1.56vw, 25px)', fontWeight: 800, margin: '0 0 16px' }}>
        Erstellt via Chat{' '}
        <span style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#C9A84C', fontWeight: 700 }}>({docs.length})</span>
      </h2>

      {loading ? (
        <div style={{ ...boxBase, color: 'rgba(255,255,255,0.3)' }}>Lädt …</div>
      ) : error ? (
        <div style={{ ...boxBase, color: '#F09595' }}>{error}</div>
      ) : docs.length === 0 ? (
        <div style={{ ...boxBase, color: 'rgba(255,255,255,0.3)' }}>
          Noch keine Dokumente vom Chat erstellt.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {docs.map((doc) => {
            const t = TYP_STYLE[doc.typ] ?? {
              bg: 'rgba(255,255,255,0.08)',
              color: '#FFFFFF',
              label: doc.typ.toUpperCase(),
            }
            const s = STATUS_STYLE[doc.status] ?? {
              bg: 'rgba(255,255,255,0.08)',
              color: '#FFFFFF',
              label: doc.status,
            }
            return (
              <div
                key={doc.id}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(201,168,76,0.15)',
                  borderRadius: 14,
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 9,
                      background: t.bg,
                      color: t.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'clamp(12px, 1.06vw, 17px)',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {t.label}
                  </div>
                  <span style={{ fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {doc.name}
                  </span>
                  <span
                    style={{
                      fontSize: 'clamp(11px, 0.94vw, 15px)',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 20,
                      background: s.bg,
                      color: s.color,
                    }}
                  >
                    {s.label}
                  </span>
                  <button
                    onClick={() => herunterladen(doc.id)}
                    disabled={ladeId === doc.id}
                    style={{
                      fontSize: 'clamp(12px, 1.06vw, 17px)',
                      fontWeight: 700,
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: ladeId === doc.id ? 'rgba(201,168,76,0.4)' : '#C9A84C',
                      color: '#0A1628',
                      cursor: ladeId === doc.id ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {ladeId === doc.id ? 'Lädt …' : 'Download'}
                  </button>
                </div>
                <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                  {doc.herkunft ? doc.herkunft + ' · ' : ''}
                  {doc.agent ?? 'Agent'} · {new Date(doc.created_at).toLocaleDateString('de-DE')}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
