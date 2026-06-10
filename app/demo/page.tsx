'use client'

import { useState, useEffect } from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { getAllBranchen } from '@/lib/branchen'

const PAKETE = [
  { key: 'SOLO',       label: 'SOLO Beta',  agenten: 2,  workflows: 25,  preis: 499,   color: '#C9A84C' },
  { key: 'START',      label: 'START',      agenten: 8,  workflows: 40,  preis: 1500,  color: '#4f94e8' },
  { key: 'PRO',        label: 'PRO',        agenten: 16, workflows: 70,  preis: 3000,  color: '#a855f7' },
  { key: 'BUSINESS',   label: 'BUSINESS',   agenten: 20, workflows: 110, preis: 6000,  color: '#22c55e' },
  { key: 'ENTERPRISE', label: 'ENTERPRISE', agenten: 24, workflows: 128, preis: 9000,  color: '#ef4444' },
]

const PAKET_MULTIPLIKATOR: Record<string, number> = {
  SOLO: 0.6, START: 1.0, PRO: 1.8, BUSINESS: 2.6, ENTERPRISE: 3.5,
}

const PAKET_MAX_PROZENT: Record<string, number> = {
  SOLO: 30, START: 45, PRO: 60, BUSINESS: 75, ENTERPRISE: 92,
}

const CLUSTER_ICONS: Record<number, string> = {
  1: '📧', 2: '🧾', 3: '📋', 4: '💬', 5: '🎯',
  6: '👥', 7: '🛒', 8: '📣', 9: '📊', 10: '🗂️',
  11: '⚙️', 12: '🔒', 13: '📌', 14: '✅', 15: '🔗',
}

const PAKET_ORDER: Record<string, number> = {
  solo: 1, start: 2, pro: 3, business: 4, enterprise: 5,
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

export default function DemoPage() {
  const [selectedPaket, setSelectedPaket] = useState('PRO')
  const [selectedBranche, setSelectedBranche] = useState('')
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)

  const branchen = getAllBranchen()
  const paket = PAKETE.find(p => p.key === selectedPaket) || PAKETE[2]
  const branche = branchen.find(b => b.slug === selectedBranche)

  const stundenBase = branche ? branche.stundenProWoche.mittel : 20
  const stundenPaket = Math.round(stundenBase * (PAKET_MULTIPLIKATOR[selectedPaket] ?? 1))
  const stundenJahr = stundenPaket * 48
  const maxProzent = PAKET_MAX_PROZENT[selectedPaket] ?? 60

  const userPlanLevel = PAKET_ORDER[selectedPaket.toLowerCase()] ?? 3

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/automatisierungen?select=*&order=cluster_id.asc`, {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          }
        })
        const data = await res.json()
        setWorkflows(data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const verfuegbarCount = workflows.filter(w => (PAKET_ORDER[w.min_paket] ?? 1) <= userPlanLevel).length
  const stundenTotal = workflows
    .filter(w => (PAKET_ORDER[w.min_paket] ?? 1) <= userPlanLevel)
    .reduce((sum, w) => sum + Number(w.stunden_pro_woche), 0)

  const clusters = Array.from(new Set(workflows.map(w => w.cluster_id))).map(id => ({
    id,
    name: workflows.find(w => w.cluster_id === id)?.cluster_name || '',
  }))

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#FFFFFF', fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>
      <Navbar />

      {/* HERO */}
      <section style={{ padding: '120px 24px 60px', background: '#0A1628' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#C9A84C', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '6px 16px', borderRadius: '999px', marginBottom: '24px' }}>
            Kostenlose Demo — kein Login nötig
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900, margin: '0 0 20px', lineHeight: 1.1 }}>
            Ihr persönliches<br /><span style={{ color: '#C9A84C' }}>KI-Betriebssystem</span>
          </h1>
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.55)', margin: '0 0 48px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7 }}>
            Wählen Sie Ihre Branche und Ihr Wunschpaket — und sehen Sie sofort welche Automatisierungen für Sie verfügbar sind und wie viele Stunden Sie pro Woche sparen.
          </p>

          {/* BRANCHE + PAKET SELECTOR */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '700px', margin: '0 auto 40px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Ihre Branche
              </label>
              <select
                value={selectedBranche}
                onChange={(e) => setSelectedBranche(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', color: '#FFFFFF', fontSize: '14px', cursor: 'pointer' }}>
                <option value="">Alle Branchen</option>
                {branchen.map(b => (
                  <option key={b.slug} value={b.slug} style={{ background: '#0A1628' }}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Ihr Wunschpaket
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {PAKETE.map(p => (
                  <button key={p.key} onClick={() => setSelectedPaket(p.key)} style={{
                    flex: 1, padding: '10px 8px', borderRadius: '8px',
                    border: `1px solid ${selectedPaket === p.key ? p.color : 'rgba(255,255,255,0.12)'}`,
                    background: selectedPaket === p.key ? `${p.color}22` : 'transparent',
                    color: selectedPaket === p.key ? p.color : 'rgba(255,255,255,0.45)',
                    fontSize: '12px', fontWeight: selectedPaket === p.key ? 700 : 400,
                    cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                  }}>{p.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', maxWidth: '800px', margin: '0 auto' }}>
            {[
              { label: 'Verwaltung reduziert', value: `−${maxProzent} %` },
              { label: 'Stunden gespart / Woche', value: `${stundenPaket} Std` },
              { label: 'Workflows verfügbar', value: loading ? '...' : verfuegbarCount },
              { label: 'KI-Agenten', value: paket.agenten },
            ].map((s, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '12px', padding: '20px 12px' }}>
                <div style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 900, color: '#C9A84C', marginBottom: '6px' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BRANCHE INFO */}
      {branche && (
        <section style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', margin: '0 24px', borderRadius: '16px', padding: '24px 32px', maxWidth: '1200px', marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <p style={{ fontSize: '11px', color: '#C9A84C', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px' }}>Ihre Branche</p>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>{branche.name}</h2>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{branche.beschreibung}</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {branche.agenten.map((a, i) => (
                <div key={i} style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', color: '#C9A84C', fontWeight: 600 }}>
                  {a}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* BIBLIOTHEK */}
      <section style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 24px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px' }}>
              Automatisierungs-Bibliothek
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
              {loading ? 'Lade...' : `${verfuegbarCount} von 2.100+ Workflows im ${paket.label}-Paket verfügbar`}
            </p>
          </div>
          <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '12px', padding: '12px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#C9A84C' }}>{Math.round(stundenTotal)} h</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>gespart / Woche</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.4)' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚡</div>
            <p>Lade Automatisierungen...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '32px' }}>
            {clusters.map(cluster => {
              const clusterWorkflows = workflows.filter(w => w.cluster_id === cluster.id)
              const verfuegbar = clusterWorkflows.filter(w => (PAKET_ORDER[w.min_paket] ?? 1) <= userPlanLevel)
              const clusterStunden = verfuegbar.reduce((sum, w) => sum + Number(w.stunden_pro_woche), 0)

              return (
                <div key={cluster.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(201,168,76,0.12)' }}>
                    <span style={{ fontSize: '20px' }}>{CLUSTER_ICONS[cluster.id]}</span>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>{cluster.name}</h3>
                    {clusterStunden > 0 && (
                      <span style={{ fontSize: '11px', color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                        {clusterStunden.toFixed(1)} h/Woche
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {clusterWorkflows.map(w => {
                      const isAvailable = (PAKET_ORDER[w.min_paket] ?? 1) <= userPlanLevel
                      return (
                        <div key={w.id} style={{
                          background: isAvailable ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)',
                          border: `1px solid ${isAvailable ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)'}`,
                          borderRadius: '10px', padding: '14px 16px',
                          display: 'flex', alignItems: 'center', gap: '14px',
                          opacity: isAvailable ? 1 : 0.4,
                        }}>
                          <div style={{ fontSize: '16px', color: isAvailable ? '#22c55e' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                            {isAvailable ? '✓' : '🔒'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '14px', fontWeight: 600, color: isAvailable ? '#FFFFFF' : 'rgba(255,255,255,0.4)', margin: '0 0 3px' }}>{w.workflow_name}</p>
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>{w.beschreibung}</p>
                          </div>
                          <div style={{ flexShrink: 0, textAlign: 'right' }}>
                            {isAvailable ? (
                              <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 700 }}>{w.stunden_pro_woche} h/Wo</span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '3px 8px' }}>
                                ab {w.min_paket.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: '64px', background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.04) 100%)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '20px', padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
            Bereit für den nächsten Schritt?
          </p>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 900, margin: '0 0 16px', lineHeight: 1.2 }}>
            {paket.label} — {paket.preis.toLocaleString('de-DE')} € / Monat
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', margin: '0 0 32px' }}>
            {paket.agenten} KI-Agenten · {paket.workflows} Automatisierungen · {stundenPaket} Stunden/Woche gespart
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/#preise" style={{ padding: '16px 40px', background: '#C9A84C', color: '#0A1628', borderRadius: '999px', fontWeight: 700, fontSize: '15px', textDecoration: 'none', letterSpacing: '0.05em' }}>
              Jetzt {paket.label} buchen →
            </a>
            <a href="/branchen" style={{ padding: '16px 40px', background: 'transparent', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.4)', borderRadius: '999px', fontWeight: 700, fontSize: '15px', textDecoration: 'none' }}>
              Alle Branchen ansehen
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
