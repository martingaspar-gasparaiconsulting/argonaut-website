'use client'

// ============================================================
// ARGONAUT OS · KPI-KACHEL (Command-Center)
// Klickbare Live-Kachel mit Hover-Effekt. Springt ins jeweilige
// Modul. alarm=true faerbt sie rot (z.B. Krankmeldungen, ueberfaellig).
// ============================================================

const C = {
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  danger: '#E06666',
  warn: '#E0A24C',
  lila: '#A98CE0',
  textDim: '#8FA3BE',
}

export default function KpiKachel({
  href,
  icon,
  label,
  wert,
  sub,
  details,
  akzent = C.gold,
  alarm = false,
}: {
  href: string
  icon: string
  label: string
  wert: string | number
  sub?: string
  details?: string[]
  akzent?: string
  alarm?: boolean
}) {
  const rand = alarm ? C.danger : akzent
  const wertFarbe = alarm ? C.danger : '#FFFFFF'

  return (
    <a
      href={href}
      style={{
        display: 'block',
        textDecoration: 'none',
        background: alarm ? 'rgba(224,102,102,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${alarm ? 'rgba(224,102,102,0.5)' : 'rgba(201,168,76,0.15)'}`,
        borderRadius: '14px',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.16s ease',
        boxShadow: alarm ? '0 0 20px rgba(224,102,102,0.18)' : 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.borderColor = alarm ? 'rgba(224,102,102,0.8)' : 'rgba(201,168,76,0.5)'
        e.currentTarget.style.background = alarm ? 'rgba(224,102,102,0.12)' : 'rgba(255,255,255,0.07)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = alarm ? 'rgba(224,102,102,0.5)' : 'rgba(201,168,76,0.15)'
        e.currentTarget.style.background = alarm ? 'rgba(224,102,102,0.08)' : 'rgba(255,255,255,0.04)'
      }}
    >
      {/* Akzent-Leiste links */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: rand }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontSize: '22px', lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: '18px', color: rand, opacity: 0.5, lineHeight: 1 }}>→</span>
      </div>

      <p style={{
        fontFamily: 'var(--font-dm-sans), sans-serif',
        fontSize: '30px',
        fontWeight: 800,
        margin: '0 0 4px',
        color: wertFarbe,
        lineHeight: 1.05,
      }}>
        {wert}
      </p>

      <p style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
        {label}
      </p>

      {sub && (
        <p style={{ fontSize: '12px', color: C.textDim, margin: '6px 0 0' }}>{sub}</p>
      )}

      {details && details.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {details.map((d, i) => (
            <p key={i} style={{
              fontSize: '12px',
              color: alarm ? '#F0A9A9' : C.textDim,
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {d}
            </p>
          ))}
        </div>
      )}
    </a>
  )
}
