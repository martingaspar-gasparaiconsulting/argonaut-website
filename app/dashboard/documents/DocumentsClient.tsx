'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ===== Typen =====
interface Document {
  id: string
  user_id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  created_at: string
  status: string
  document_type: string | null
}

interface DocumentAgent {
  id: string
  document_id: string
  agent_name: string
}

interface Props {
  userId: string
  paket: string
  initialDocuments: Document[]
  initialDocumentAgents: DocumentAgent[]
}

// ===== Konstanten =====
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/plain': 'TXT',
}

const FILE_SIZE_LIMITS: Record<string, number> = {
  solo: 10, start: 25, pro: 50, bus: 100, ent: 200,
  starter: 25, professional: 50, business: 100, enterprise: 200,
}

const STORAGE_LIMIT_GB = 5

const ALL_AGENTS = [
  { name: 'A1 Empfänger', plans: ['solo', 'start', 'pro', 'bus', 'ent'] },
  { name: 'A2 Schmied',   plans: ['pro', 'bus', 'ent'] },
  { name: 'A3 Wächter',   plans: ['start', 'pro', 'bus', 'ent'] },
  { name: 'A4 Buchhalter',plans: ['start', 'pro', 'bus', 'ent'] },
  { name: 'A5 Schreiber', plans: ['solo', 'start', 'pro', 'bus', 'ent'] },
  { name: 'A6 Planer',    plans: ['start', 'pro', 'bus', 'ent'] },
  { name: 'A7 Verkäufer', plans: ['start', 'pro', 'bus', 'ent'] },
  { name: 'A8 Regisseur', plans: ['pro', 'bus', 'ent'] },
  { name: 'B1 Forscher',  plans: ['pro', 'bus', 'ent'] },
  { name: 'B2 Übersetzer',plans: ['pro', 'bus', 'ent'] },
  { name: 'B3 Moderator', plans: ['start', 'pro', 'bus', 'ent'] },
  { name: 'B4 Personalchef', plans: ['start', 'pro', 'bus', 'ent'] },
]


// Lesbare Bezeichnungen für die in B1.4 erkannten Dokumenttypen
const DOC_TYPE_LABELS: Record<string, string> = {
  rechnung: 'Rechnung',
  preisliste: 'Preisliste',
  vertrag: 'Vertrag',
  agb: 'AGB',
  produktdatenblatt: 'Produktdatenblatt',
  sonstiges: 'Sonstiges',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeIcon(type: string) {
  const colors: Record<string, string> = { PDF: '#ef4444', DOCX: '#3b82f6', XLSX: '#22c55e', TXT: '#94a3b8' }
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 8, background: `${colors[type] ?? '#6b7280'}22`,
      border: `1px solid ${colors[type] ?? '#6b7280'}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 800, color: colors[type] ?? '#6b7280', letterSpacing: '0.05em', flexShrink: 0,
    }}>{type}</div>
  )
}

// Status-Abzeichen je Dokument (wartet / wird_analysiert / bereit / fehler)
function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string; icon: string }> = {
    wartet:          { label: 'Wartet',           color: '#94a3b8', icon: '⏸' },
    wird_analysiert: { label: 'Wird analysiert',   color: '#f59e0b', icon: '⏳' },
    bereit:          { label: 'Bereit',            color: '#22c55e', icon: '✅' },
    fehler:          { label: 'Fehler',            color: '#ef4444', icon: '⚠️' },
  }
  const s = map[status] ?? map.wartet
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 999,
      background: `${s.color}1a`, border: `1px solid ${s.color}55`,
      color: s.color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span>{s.icon}</span>{s.label}
    </span>
  )
}

// ===== Hauptkomponente =====
export default function DocumentsClient({ userId, paket, initialDocuments, initialDocumentAgents }: Props) {
  const supabase = createClient()
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [documentAgents, setDocumentAgents] = useState<DocumentAgent[]>(initialDocumentAgents)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [agentModal, setAgentModal] = useState<Document | null>(null)
  const [agentToggles, setAgentToggles] = useState<Record<string, boolean>>({})
  const [savingAgents, setSavingAgents] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxMB = FILE_SIZE_LIMITS[paket] ?? 10
  const totalBytes = documents.reduce((s, d) => s + d.file_size, 0)
  const totalGB = totalBytes / (1024 * 1024 * 1024)
  const storagePercent = Math.min(Math.round((totalGB / STORAGE_LIMIT_GB) * 100), 100)
  const storageFull = storagePercent >= 100
  const storageWarning = storagePercent >= 80

  const availableAgents = ALL_AGENTS.filter(a => a.plans.includes(paket))

  // ===== Upload =====
  const handleUpload = useCallback(async (file: File) => {
    setUploadError('')
    const fileType = ALLOWED_TYPES[file.type]
    if (!fileType) { setUploadError('Nur PDF, DOCX, XLSX und TXT erlaubt.'); return }
    if (file.size > maxMB * 1024 * 1024) { setUploadError(`Maximale Dateigröße: ${maxMB} MB`); return }
    if (storageFull) { setUploadError('Speicherlimit erreicht. Bitte Paket upgraden.'); return }

    setUploading(true)
    const path = `${userId}/${Date.now()}_${file.name}`

    const { error: storageError } = await supabase.storage
      .from('customer-documents')
      .upload(path, file)

    if (storageError) { setUploadError('Upload fehlgeschlagen: ' + storageError.message); setUploading(false); return }

    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .insert({ user_id: userId, file_name: file.name, file_type: fileType, file_size: file.size, storage_path: path, status: 'wartet' })
      .select()
      .single()

    if (dbError || !doc) { setUploadError('Datenbankfehler: ' + dbError?.message); setUploading(false); return }

    // Analyse-Pipeline automatisch starten (n8n-Webhook ueber sichere Server-Route)
    try {
      await fetch('/api/documents/trigger-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: doc.id,
          user_id: userId,
          storage_path: path,
          file_type: fileType,
        }),
      })
    } catch (e) {
      console.error('Analyse-Trigger fehlgeschlagen:', e)
    }

    setDocuments(prev => [doc, ...prev])
    setUploading(false)
  }, [userId, maxMB, storageFull, supabase])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  // ===== Löschen =====
  const handleDelete = async (doc: Document) => {
    await supabase.storage.from('customer-documents').remove([doc.storage_path])
    await supabase.from('documents').delete().eq('id', doc.id)
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
    setDocumentAgents(prev => prev.filter(da => da.document_id !== doc.id))
  }

  // ===== Agenten-Modal =====
  const openAgentModal = (doc: Document) => {
    const current = documentAgents.filter(da => da.document_id === doc.id).map(da => da.agent_name)
    const toggles: Record<string, boolean> = {}
    availableAgents.forEach(a => { toggles[a.name] = current.includes(a.name) })
    setAgentToggles(toggles)
    setAgentModal(doc)
  }

  const saveAgents = async () => {
    if (!agentModal) return
    setSavingAgents(true)
    await supabase.from('document_agents').delete().eq('document_id', agentModal.id)
    const selected = Object.entries(agentToggles).filter(([, v]) => v).map(([k]) => k)
    if (selected.length > 0) {
      const inserts = selected.map(a => ({ document_id: agentModal.id, user_id: userId, agent_name: a }))
      const { data: newAgents } = await supabase.from('document_agents').insert(inserts).select()
      setDocumentAgents(prev => [...prev.filter(da => da.document_id !== agentModal.id), ...(newAgents ?? [])])
    } else {
      setDocumentAgents(prev => prev.filter(da => da.document_id !== agentModal.id))
    }
    setSavingAgents(false)
    setAgentModal(null)
  }

  // ===== Render =====
  const barColor = storagePercent >= 100 ? '#ef4444' : storagePercent >= 80 ? '#f59e0b' : '#22c55e'

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif', color: '#FFFFFF', padding: '40px 24px 80px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 13, color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>Dokumente</p>
          <h1 style={{ fontSize: 'clamp(22px,4vw,32px)', fontWeight: 900, margin: '0 0 8px', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Meine Firmendokumente</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, margin: 0 }}>Laden Sie Ihre Dokumente hoch und weisen Sie sie Ihren KI-Agenten zu.</p>
        </div>

        {/* Speicherbalken */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 14, padding: 24, marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Speicher</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{formatBytes(totalBytes)} von {STORAGE_LIMIT_GB} GB</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${storagePercent}%`, background: barColor, borderRadius: 999, transition: 'width 0.5s ease' }} />
          </div>
          {storageWarning && !storageFull && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#f59e0b' }}>⚠️ Speicher fast voll — bitte alte Dateien löschen oder Paket upgraden.</p>
          )}
          {storageFull && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#ef4444' }}>🔒 Speicherlimit erreicht — Upload gesperrt. <a href="/dashboard/upgrade" style={{ color: '#C9A84C', textDecoration: 'underline' }}>Jetzt upgraden →</a></p>
          )}
        </div>

        {/* Upload-Zone */}
        {!storageFull && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#C9A84C' : 'rgba(201,168,76,0.35)'}`,
              borderRadius: 14, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
              background: dragging ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.2s', marginBottom: 32,
            }}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx,.txt" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
            <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>
              {uploading ? 'Wird hochgeladen…' : 'Datei hierher ziehen oder klicken'}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              PDF, DOCX, XLSX, TXT · max. {maxMB} MB
            </p>
            {uploadError && <p style={{ marginTop: 12, fontSize: 13, color: '#ef4444' }}>{uploadError}</p>}
          </div>
        )}

        {/* Dateiliste */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>
            Hochgeladene Dateien <span style={{ fontSize: 13, color: '#C9A84C', fontWeight: 700 }}>({documents.length})</span>
          </h2>

          {documents.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 15 }}>
              Noch keine Dokumente hochgeladen.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {documents.map(doc => {
                const assignedAgents = documentAgents.filter(da => da.document_id === doc.id)
                return (
                  <div key={doc.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {fileTypeIcon(doc.file_type)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</p>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                        {formatBytes(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('de-DE')}
                        {doc.document_type && (
                          <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.55)' }}>· {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}</span>
                        )}
                        {assignedAgents.length > 0 && (
                          <span style={{ marginLeft: 8, color: '#C9A84C' }}>· {assignedAgents.length} Agent{assignedAgents.length !== 1 ? 'en' : ''}</span>
                        )}
                      </p>
                    </div>
                    {statusBadge(doc.status)}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => openAgentModal(doc)} style={{ padding: '7px 14px', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 8, color: '#C9A84C', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        🤖 Agenten
                      </button>
                      <button onClick={() => handleDelete(doc)} style={{ padding: '7px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        🗑 Löschen
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Agenten-Modal */}
      {agentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 24 }}>
          <div style={{ background: '#0D1E35', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 18, padding: 32, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Agenten zuweisen</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 24px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agentModal.file_name}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {availableAgents.map(agent => (
                <div key={agent.name} onClick={() => setAgentToggles(prev => ({ ...prev, [agent.name]: !prev[agent.name] }))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: agentToggles[agent.name] ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${agentToggles[agent.name] ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{agent.name}</span>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: agentToggles[agent.name] ? '#C9A84C' : 'rgba(255,255,255,0.1)', border: `2px solid ${agentToggles[agent.name] ? '#C9A84C' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {agentToggles[agent.name] && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0A1628' }} />}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAgentModal(null)} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                Abbrechen
              </button>
              <button onClick={saveAgents} disabled={savingAgents} style={{ flex: 1, padding: '12px', background: '#C9A84C', border: 'none', borderRadius: 10, color: '#0A1628', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
                {savingAgents ? 'Speichern…' : 'Speichern ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
