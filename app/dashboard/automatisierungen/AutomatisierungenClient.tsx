'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const PLAN_ORDER: Record<string, number> = {
  solo: 1, start: 2, pro: 3, business: 4, enterprise: 5,
  starter: 2, professional: 3, bus: 4, ent: 5,
}

const PLAN_LABELS: Record<string, string> = {
  solo: 'SOLO', start: 'START', pro: 'PRO', business: 'BUSINESS', enterprise: 'ENTERPRISE',
  starter: 'START', professional: 'PRO', bus: 'BUSINESS', ent: 'ENTERPRISE',
}

const CLUSTER_ICONS: Record<number, string> = {
  1: '📧', 2: '🧾', 3: '📋', 4: '💬', 5: '🎯',
  6: '👥', 7: '🛒', 8: '📣', 9: '📊', 10: '🗂️',
  11: '⚙️', 12: '🔒', 13: '📌', 14: '✅', 15: '🔗',
}

interface Workflow {
  id: number
  cluster_id: number
  cluster_name: string
  workflow_name: string
  beschreibung: string
  stunden_pro_woche: number
  min_paket: string
}

interface Props {
  paket: string
  userName: string
}

export default function AutomatisierungenClient({ paket, userName }: Props) {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCluster, setActiveCluster] = useState<number | null>(null)
  const [filterModus, setFilterModus] = useState<'alle' | 'verfuegbar' | 'gesperrt'>('alle')

  const userPlanLevel = PLAN_ORDER[paket] ?? 1

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('automatisierungen')
        .select('*')
        .order('cluster_id', { ascending: true })
      setWorkflows(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const clusters = Array.from(new Set(workflows.map(w => w.cluster_id))).map(id => ({
    id,
    name: workflows.find(w => w.cluster_id === id)?.cluster_name || '',
  }))

  const filtered = workflows.filter(w => {
    const clusterOk = activeCluster === null || w.cluster_id === activeCluster
    const wLevel = PLAN_ORDER[w.min_paket] ?? 1
    const verfuegbar = wLevel <= userPlanLevel
    if (filterModus === 'verfuegbar') return clusterOk && verfuegbar
    if (filterModus === 'gesperrt') return clusterOk && !verfuegbar
    return clusterOk
  })

  const verfuegbarCount = workflows.filter(w => (PLAN_ORDER[w.min_paket] ?? 1) <= userPlanLevel).length
  const gesperrtCount = workflows.length - verfuegbarCount
  const stundenTotal = workflows
    .filter(w => (PLAN_ORDER[w.min_paket] ?? 1) <= userPlanLevel)
    .reduce((sum, w) => sum + Number(w.stunden_pro_woche), 0)

  return (
    <div style={{ background: '#0A1628', color: '#FFFFFF', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <section style={{ marginBottom: '40px' }}>
          <p style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>Automatisierungs-Bibliothek</p>
          <h1 style={{ fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 900, margin: '0 0 12px', lineHeight: 1.2 }}>128 Workflows. Ihr {PLAN_LABELS[paket] || paket.toUpperCase()}-Paket.</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.31vw, 21px)', margin: 0 }}>Wählen Sie Ihre Automatisierungen — jede spart Ihnen echte Stunden pro Woche.</p>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '40px' }}>
          {[
            { label: 'Verfügbare Workflows', value: loading ? '...' : verfuegbarCount, color: '#22c55e' },
            { label: 'Gesperrte Workflows', value: loading ? '...' : gesperrtCount, color: '#ef4444' },
            { label: 'Stunden/Woche gespart', value: loading ? '...' : Math.round(stundenTotal), color: '#C9A84C' },
            { label: 'Stunden/Jahr gespart', value: loading ? '...' : Math.round(stundenTotal * 48), color: '#4f94e8' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '20px' }}>
              <p style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 900, margin: '0 0 6px', color: s.color }}>{s.value}</p>
              <p style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: 'rgba(255,255,255,0.45)', margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </section>

        {!loading && gesperrtCount > 0 && (
          <section style={{ marginBottom: '32px' }}>
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 700, color: '#C9A84C' }}>🔒 {gesperrtCount} Workflows mit Upgrade freischaltbar</p>
                <p style={{ margin: 0, fontSize: 'clamp(13px, 1.13vw, 18px)', color: 'rgba(255,255,255,0.5)' }}>Höheres Paket = mehr Automatisierungen = mehr gesparte Stunden.</p>
              </div>
              <a href="/#preise" style={{ padding: '10px 24px', background: '#C9A84C', color: '#0A1628', borderRadius: '8px', fontWeight: 700, fontSize: 'clamp(13px, 1.13vw, 18px)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Paket upgraden →</a>
            </div>
          </section>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '32px', alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: '88px' }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 12px' }}>Filter</p>
              {[{ key: 'alle', label: 'Alle Workflows' }, { key: 'verfuegbar', label: '✓ Verfügbar' }, { key: 'gesperrt', label: '🔒 Gesperrt' }].map((f) => (
                <button key={f.key} onClick={() => setFilterModus(f.key as 'alle' | 'verfuegbar' | 'gesperrt')}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: '4px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: 'clamp(13px, 1.13vw, 18px)', background: filterModus === f.key ? 'rgba(201,168,76,0.15)' : 'transparent', color: filterModus === f.key ? '#C9A84C' : 'rgba(255,255,255,0.6)', fontWeight: filterModus === f.key ? 700 : 400 }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '16px' }}>
              <p style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 12px' }}>Cluster</p>
              <button onClick={() => setActiveCluster(null)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: '4px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: 'clamp(13px, 1.13vw, 18px)', background: activeCluster === null ? 'rgba(201,168,76,0.15)' : 'transparent', color: activeCluster === null ? '#C9A84C' : 'rgba(255,255,255,0.6)', fontWeight: activeCluster === null ? 700 : 400 }}>
                Alle Cluster
              </button>
              {clusters.map((c) => (
                <button key={c.id} onClick={() => setActiveCluster(c.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: '4px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: 'clamp(12px, 1.06vw, 17px)', background: activeCluster === c.id ? 'rgba(201,168,76,0.15)' : 'transparent', color: activeCluster === c.id ? '#C9A84C' : 'rgba(255,255,255,0.5)', fontWeight: activeCluster === c.id ? 700 : 400, lineHeight: 1.3 }}>
                  {CLUSTER_ICONS[c.id]} {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.4)' }}>
                <div style={{ fontSize: 'clamp(32px, 2.81vw, 45px)', marginBottom: '16px' }}>⚡</div>
                <p>Lade Automatisierungen...</p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>{filtered.length} Workflows {activeCluster ? `in ${clusters.find(c => c.id === activeCluster)?.name}` : 'gesamt'}</p>
                {clusters.filter(c => activeCluster === null || c.id === activeCluster).map(cluster => {
                  const clusterWorkflows = filtered.filter(w => w.cluster_id === cluster.id)
                  if (clusterWorkflows.length === 0) return null
                  const clusterStunden = clusterWorkflows.filter(w => (PLAN_ORDER[w.min_paket] ?? 1) <= userPlanLevel).reduce((sum, w) => sum + Number(w.stunden_pro_woche), 0)
                  return (
                    <div key={cluster.id} style={{ marginBottom: '32px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
                        <span style={{ fontSize: 'clamp(20px, 1.75vw, 28px)' }}>{CLUSTER_ICONS[cluster.id]}</span>
                        <h2 style={{ fontSize: 'clamp(16px, 1.38vw, 22px)', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>{cluster.name}</h2>
                        {clusterStunden > 0 && <span style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>{clusterStunden.toFixed(1)} h/Woche</span>}
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {clusterWorkflows.map(w => {
                          const isAvailable = (PLAN_ORDER[w.min_paket] ?? 1) <= userPlanLevel
                          return (
                            <div key={w.id} style={{ background: isAvailable ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isAvailable ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px', opacity: isAvailable ? 1 : 0.6 }}>
                              <div style={{ fontSize: 'clamp(16px, 1.38vw, 22px)', flexShrink: 0, color: isAvailable ? '#22c55e' : 'rgba(255,255,255,0.3)' }}>{isAvailable ? '✓' : '🔒'}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600, color: isAvailable ? '#FFFFFF' : 'rgba(255,255,255,0.5)', margin: '0 0 3px', lineHeight: 1.3 }}>{w.workflow_name}</p>
                                <p style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.4 }}>{w.beschreibung}</p>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                {isAvailable ? <span style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: '#22c55e', fontWeight: 700 }}>{w.stunden_pro_woche} h/Wo</span> : <span style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '3px 8px' }}>ab {PLAN_LABELS[w.min_paket] || w.min_paket}</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
