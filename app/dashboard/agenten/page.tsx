import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AgentCard from '../AgentCard'

// ============================================================
// ARGONAUT OS · KI-AGENTEN (/dashboard/agenten)
// Liest die 24 Agenten LIVE aus der agents-Tabelle und
// gruppiert sie nach Serie (A-E). Namen/Beschreibungen kommen
// aus der DB -> keine hartkodierten Werte.
// ============================================================

// Kategorie -> Fallback-Icon (DB-Feld icon ist aktuell leer;
// sobald dort ein Emoji steht, wird dieses bevorzugt).
const KAT_ICON: Record<string, string> = {
  'Analyse': '📊',
  'Planung': '📐',
  'Monitoring': '🛡️',
  'Orchestrierung': '🎯',
  'Optimierung': '⚙️',
  'Datenmanagement': '🗂️',
  'Finanzen': '💰',
  'Reporting': '📈',
  'Administration': '📋',
  'Dokumentenmanagement': '📄',
  'HR': '👥',
  'Compliance': '⚖️',
  'Marketing': '📣',
  'Sales': '🤝',
  'Customer Success': '💚',
  'CRM': '🔗',
}

const SERIE_META: Record<string, { titel: string; farbe: string }> = {
  'A-Serie': { titel: 'Analyse & Steuerung', farbe: '#00e5ff' },
  'B-Serie': { titel: 'Finanzen & Buchhaltung', farbe: '#4CAF7D' },
  'C-Serie': { titel: 'Verwaltung & Compliance', farbe: '#C9A84C' },
  'D-Serie': { titel: 'Marketing & Content', farbe: '#A98CE0' },
  'E-Serie': { titel: 'Vertrieb & Kundenbeziehung', farbe: '#4f94e8' },
}
const SERIE_ORDER = ['A-Serie', 'B-Serie', 'C-Serie', 'D-Serie', 'E-Serie']

type Agent = {
  code: string
  name: string
  serie: string
  beschreibung: string | null
  kategorie: string | null
  status: string | null
  icon: string | null
}

export default async function AgentenPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data } = await supabase
    .from('agents')
    .select('code, name, serie, beschreibung, kategorie, status, icon')
    .order('code')

  const agents = (data || []) as Agent[]

  // Nach Serie gruppieren, innerhalb numerisch nach Code sortieren (A1..A6..A10)
  const num = (c: string) => parseInt((c || '').replace(/\D/g, ''), 10) || 0
  const grouped: Record<string, Agent[]> = {}
  for (const a of agents) {
    if (!grouped[a.serie]) grouped[a.serie] = []
    grouped[a.serie].push(a)
  }
  for (const k in grouped) grouped[k].sort((x, y) => num(x.code) - num(y.code))

  const bekannte = SERIE_ORDER.filter((s) => grouped[s]?.length)
  const rest = Object.keys(grouped).filter((s) => !SERIE_ORDER.includes(s)).sort()
  const alleSerien = [...bekannte, ...rest]

  const gesamt = agents.length
  const aktivCount = agents.filter((a) => (a.status || '').toLowerCase() === 'aktiv').length

  const SHELL_MAX = '1600px'
  const SHELL_PAD = 'clamp(16px, 3vw, 48px)'

  return (
    <main style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `clamp(32px, 4vw, 56px) ${SHELL_PAD} 80px` }}>

      {/* Kopf */}
      <section style={{ marginBottom: '40px' }}>
        <p style={{ fontSize: '13px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>KI-Belegschaft</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 46px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Ihre KI-Agenten</h1>
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', color: '#C9A84C', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '999px', padding: '4px 12px' }}>{aktivCount} VON {gesamt} AKTIV</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.1vw, 18px)', margin: 0, maxWidth: '720px' }}>Ihr digitales Team — jeder Agent übernimmt einen Aufgabenbereich automatisch. Hier sehen Sie Ihre gesamte KI-Belegschaft, nach Einsatzfeldern gruppiert.</p>
      </section>

      {gesamt === 0 ? (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          <div style={{ fontSize: '34px', marginBottom: '12px' }}>🤖</div>
          Noch keine Agenten hinterlegt.
        </div>
      ) : (
        alleSerien.map((serie) => {
          const meta = SERIE_META[serie] || { titel: serie, farbe: '#C9A84C' }
          const list = grouped[serie]
          return (
            <section key={serie} style={{ marginBottom: '44px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: meta.farbe, boxShadow: `0 0 8px ${meta.farbe}`, flexShrink: 0 }} />
                <h2 style={{ fontSize: 'clamp(17px, 1.8vw, 24px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>{meta.titel}</h2>
                <span style={{ fontSize: '12px', fontWeight: 700, color: meta.farbe, background: `${meta.farbe}1e`, border: `1px solid ${meta.farbe}55`, borderRadius: '999px', padding: '2px 10px' }}>{serie} · {list.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                {list.map((a) => (
                  <AgentCard
                    key={a.code}
                    name={a.name}
                    role={`${a.code} · ${a.kategorie || ''}`}
                    desc={a.beschreibung || 'Einsatzbereit für seinen Aufgabenbereich.'}
                    icon={<span style={{ fontSize: '24px' }}>{a.icon || KAT_ICON[a.kategorie || ''] || '🤖'}</span>}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}

    </main>
  )
}
