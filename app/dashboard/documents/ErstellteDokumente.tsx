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

  const boxBase = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '40px 24px',
    textAlign: 'center' as const,
    fontSize: 15,
  }

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif', color: '#FFFFFF' }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px' }}>
        Erstellt via Chat{' '}
        <span style={{ fontSize: 13, color: '#C9A84C', fontWeight: 700 }}>({docs.length})</span>
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
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {t.label}
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {doc.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 20,
                      background: s.bg,
                      color: s.color,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
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
