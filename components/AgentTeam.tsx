'use client'
import Image from 'next/image'

const stats = [
  { zahl: '24', titel: 'KI-Agenten', sub: 'rund um die Uhr aktiv' },
  { zahl: '24/7', titel: 'Immer aktiv', sub: 'keine Pause, kein Ausfall' },
  { zahl: '1.229', titel: 'Automatisierungen', sub: 'fuer jede Branche startklar' },
  { zahl: '110', titel: 'Branchen', sub: 'massgeschneidert fuer Sie' },
]

export default function AgentTeam() {
  return (
    <section id="agenten" style={{ background: '#fff', padding: '80px 24px', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '12px' }}>Ihre komplette KI-Crew</p>
          <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, color: '#0A1628', margin: '0 0 16px' }}>24 Agenten. 1.229 Automatisierungen. Ein System.</h2>
          <p style={{ fontSize: '18px', color: '#6b7280', maxWidth: '640px', margin: '0 auto' }}>Kein Freelancer. Kein Zufall. Sondern ein eingespieltes KI-Team — das Ihre Prozesse kennt, optimiert und niemals schlaeft.</p>
        </div>
        <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', marginBottom: '56px' }}>
          <Image src="/images/argonaut-team.png" alt="Das ARGONAUT Team" width={1920} height={1080} style={{ width: '100%', height: 'auto', display: 'block' }} priority />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {stats.map((stat, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '28px 20px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 900, color: '#C9A84C', margin: '0 0 8px', lineHeight: 1 }}>{stat.zahl}</p>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#0A1628', margin: '0 0 6px' }}>{stat.titel}</p>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>{stat.sub}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '48px' }}>
          <a href="#kontakt" style={{ background: '#C9A84C', color: '#fff', fontWeight: 700, fontSize: '13px', padding: '16px 40px', borderRadius: '999px', letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block' }}>Meine Crew kennenlernen →</a>
        </div>
      </div>
    </section>
  )
}
