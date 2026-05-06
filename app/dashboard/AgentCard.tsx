'use client'

export default function AgentCard({ name, role, desc, icon }: {
  name: string
  role: string
  desc: string
  icon: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(201,168,76,0.15)',
        borderRadius: '14px',
        padding: '24px',
        cursor: 'default',
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'
        e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{
        position: 'absolute', top: '-20px', right: '-20px',
        width: '80px', height: '80px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        background: 'rgba(201,168,76,0.08)',
        border: '1px solid rgba(201,168,76,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '16px',
      }}>
        {icon}
      </div>
      <p style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 4px', fontFamily: 'var(--font-syne), sans-serif' }}>
        {name}
      </p>
      <p style={{ fontSize: '11px', fontWeight: 600, color: '#C9A84C', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 10px' }}>
        {role}
      </p>
      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: '0 0 16px', lineHeight: 1.6 }}>
        {desc}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: '#22c55e', display: 'inline-block',
          boxShadow: '0 0 6px rgba(34,197,94,0.6)',
        }} />
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>Bereit</span>
      </div>
    </div>
  )
}