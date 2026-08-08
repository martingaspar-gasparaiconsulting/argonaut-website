'use client'

// ============================================================================
// ARGONAUT OS · Baustein „Filial-Zuordnung" (Block D · Multistandort-Tiefe)
//
// Wiederverwendbarer Knopf „🏢 Filialen": ordnet EINEN Datensatz (Dokument,
// Produkt, Schulung …) mehreren Filialen zu — dieselbe Haekchen-Logik wie die
// Agenten-Zuweisung im Dokumente-Modul. Fail-open: KEIN Haekchen = ueberall
// sichtbar (nichts verschwindet). Erscheint nur bei ≥2 Filialen (Ein-Standort-
// Betrieb bleibt aufgeraeumt). Schreibt in eine Zuordnungstabelle
// <tabelle>(<fkSpalte>, standort_id, owner_user_id).
// Pfad: app/dashboard/_components/FilialZuordnung.tsx
// ============================================================================

import { useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase'

export type FilialeLite = { id: string; name: string; ist_hauptsitz?: boolean }

interface Props {
  tabelle: string          // z. B. 'document_standorte'
  fkSpalte: string         // z. B. 'document_id'
  recordId: string
  ownerUserId: string
  standorte: FilialeLite[]
  initial: string[]        // bereits zugeordnete standort_id
  onChange?: (standortIds: string[]) => void
  label?: string           // Standard: 'Filialen'
}

export default function FilialZuordnung({
  tabelle, fkSpalte, recordId, ownerUserId, standorte, initial, onChange, label = 'Filialen',
}: Props) {
  const supabase = createClient()
  const [offen, setOffen] = useState(false)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [speichern, setSpeichern] = useState(false)
  const [zugeordnet, setZugeordnet] = useState<string[]>(initial)

  // Ein-Standort-Betrieb: nichts zuzuordnen — Knopf gar nicht zeigen.
  if (standorte.length < 2) return null

  const anzahl = zugeordnet.filter((id) => standorte.some((s) => s.id === id)).length
  const knopfText = anzahl === 0 ? '🏢 Alle Filialen' : `🏢 ${anzahl} Filiale${anzahl !== 1 ? 'n' : ''}`

  const oeffnen = () => {
    const t: Record<string, boolean> = {}
    standorte.forEach((s) => { t[s.id] = zugeordnet.includes(s.id) })
    setSel(t)
    setOffen(true)
  }

  const alle = (v: boolean) => {
    const t: Record<string, boolean> = {}
    standorte.forEach((s) => { t[s.id] = v })
    setSel(t)
  }

  const speichere = async () => {
    setSpeichern(true)
    const gewaehlt = standorte.filter((s) => sel[s.id]).map((s) => s.id)
    await supabase.from(tabelle).delete().eq(fkSpalte, recordId)
    if (gewaehlt.length > 0) {
      const rows = gewaehlt.map((sid) => ({ owner_user_id: ownerUserId, [fkSpalte]: recordId, standort_id: sid }))
      await supabase.from(tabelle).insert(rows)
    }
    setZugeordnet(gewaehlt)
    onChange?.(gewaehlt)
    setSpeichern(false)
    setOffen(false)
  }

  return (
    <>
      <button
        onClick={oeffnen}
        title="Diesem Datensatz Filialen zuordnen"
        style={{
          padding: '7px 14px',
          background: anzahl === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,229,255,0.10)',
          border: `1px solid ${anzahl === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(0,229,255,0.35)'}`,
          borderRadius: 8,
          color: anzahl === 0 ? 'rgba(255,255,255,0.6)' : '#00e5ff',
          fontSize: 'clamp(12px, 1.06vw, 17px)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {knopfText}
      </button>

      {offen && (
        <div
          onClick={() => setOffen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#0D1E35', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 18, padding: 32, width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto' }}
          >
            <h3 style={{ fontSize: 'clamp(18px, 1.56vw, 25px)', fontWeight: 800, margin: '0 0 6px' }}>{label} zuordnen</h3>
            <p style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: 'rgba(255,255,255,0.5)', margin: '0 0 6px' }}>Waehlen Sie, welche Filialen das bekommen.</p>
            <p style={{ fontSize: 'clamp(12px, 1vw, 16px)', color: '#00e5ff', margin: '0 0 18px' }}>Kein Haekchen = fuer alle Filialen sichtbar.</p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <button onClick={() => alle(true)} style={miniStyle}>Alle markieren</button>
              <button onClick={() => alle(false)} style={miniStyle}>Keine</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {standorte.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSel((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: sel[s.id] ? 'rgba(0,229,255,0.10)' : 'rgba(255,255,255,0.04)', border: `1px solid ${sel[s.id] ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600 }}>{s.name}{s.ist_hauptsitz ? ' (Hauptsitz)' : ''}</span>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: sel[s.id] ? '#00e5ff' : 'rgba(255,255,255,0.1)', border: `2px solid ${sel[s.id] ? '#00e5ff' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel[s.id] && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0A1628' }} />}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setOffen(false)} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 'clamp(14px, 1.25vw, 20px)' }}>Abbrechen</button>
              <button onClick={speichere} disabled={speichern} style={{ flex: 1, padding: '12px', background: '#C9A84C', border: 'none', borderRadius: 10, color: '#0A1628', fontWeight: 800, cursor: 'pointer', fontSize: 'clamp(14px, 1.25vw, 20px)' }}>{speichern ? 'Speichern…' : 'Speichern ✓'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const miniStyle: CSSProperties = {
  flex: 1, padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, color: 'rgba(255,255,255,0.75)', fontSize: 'clamp(12px, 1.06vw, 16px)', fontWeight: 600, cursor: 'pointer',
}
