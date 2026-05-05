import { getBrancheBySlug, getAllBrancheSlugs } from '@/lib/branchen'
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  return getAllBrancheSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}) {
  const branche = getBrancheBySlug(params.slug)
  if (!branche) return {}
  return {
    title: `${branche.name} | ARGONAUT OS`,
    description: branche.beschreibung,
  }
}

export default function BranchePage({
  params,
}: {
  params: { slug: string }
}) {
  const branche = getBrancheBySlug(params.slug)
  if (!branche) notFound()
  const b = branche!

  return (
    <main style={{ backgroundColor: '#0A1628', color: '#FFFFFF', minHeight: '100vh' }}>

      {/* HERO */}
      <section style={{ paddingTop: '8rem', paddingBottom: '5rem', textAlign: 'center', padding: '8rem 1.5rem 5rem' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>{b.icon}</div>
          <div style={{
            display: 'inline-block',
            padding: '0.25rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: '500',
            marginBottom: '1.5rem',
            backgroundColor: 'rgba(201,168,76,0.15)',
            border: '1px solid #C9A84C',
            color: '#C9A84C'
          }}>
            ARGONAUT OS · KI-Automatisierung
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: '700', marginBottom: '1.5rem', lineHeight: '1.2' }}>
            KI-Automatisierung für{' '}
            <span style={{ color: '#C9A84C' }}>{b.name}</span>
          </h1>
          <p style={{ fontSize: '1.25rem', marginBottom: '2.5rem', color: 'rgba(255,255,255,0.7)', maxWidth: '42rem', margin: '0 auto 2.5rem' }}>
            {b.beschreibung}. Kein externes Tool. Kein Agentur-Overhead. Alles in einem System.
          </p>
          <a
            href="https://calendly.com/argonaut"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '1rem 2.5rem',
              borderRadius: '0.5rem',
              fontSize: '1.125rem',
              fontWeight: '700',
              backgroundColor: '#C9A84C',
              color: '#0A1628',
              textDecoration: 'none'
            }}
          >
            Kostenlose Demo buchen
          </a>
        </div>
      </section>

      {/* VIDEO PLATZHALTER */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
          <div style={{
            borderRadius: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            aspectRatio: '16/9',
            backgroundColor: 'rgba(201,168,76,0.08)',
            border: '2px dashed rgba(201,168,76,0.3)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>▶</div>
              <p style={{ fontSize: '1.125rem', fontWeight: '500', color: '#C9A84C' }}>
                ARGONAUT OS in der Praxis — {b.name}
              </p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'rgba(255,255,255,0.4)' }}>
                Video wird geladen · A8-Agent
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SCHMERZEN vs ERGEBNISSE */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div style={{ borderRadius: '1rem', padding: '2rem', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem', color: '#FF6B6B' }}>
              Das kostet Sie heute Geld
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {b.schmerzen.map((s, i) => (
                <li key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', color: 'rgba(255,255,255,0.8)' }}>
                  <span style={{ color: '#FF6B6B', flexShrink: 0 }}>✗</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ borderRadius: '1rem', padding: '2rem', backgroundColor: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem', color: '#C9A84C' }}>
              Das liefert ARGONAUT OS
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {b.ergebnisse.map((e, i) => (
                <li key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', color: 'rgba(255,255,255,0.8)' }}>
                  <span style={{ color: '#C9A84C', flexShrink: 0 }}>✓</span>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* PREISRECHNER */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', borderRadius: '1rem', padding: '2.5rem', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.2)' }}>
          <h2 style={{ fontSize: '1.875rem', fontWeight: '700', textAlign: 'center', marginBottom: '0.5rem' }}>Ihr Investment</h2>
          <p style={{ textAlign: 'center', marginBottom: '2.5rem', color: 'rgba(255,255,255,0.5)' }}>Alle Preise zzgl. 19% MwSt.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ borderRadius: '0.75rem', padding: '1.5rem', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', color: '#C9A84C' }}>PFLICHT · Basis-Layer</div>
              <div style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.25rem' }}>
                1.500 € <span style={{ fontSize: '1rem', fontWeight: '400', color: 'rgba(255,255,255,0.5)' }}>/Monat</span>
              </div>
              <div style={{ fontSize: '0.875rem', marginBottom: '1rem', color: 'rgba(255,255,255,0.5)' }}>25 Basis-Automatisierungen</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
                <li>✓ Alle 24 KI-Agenten</li>
                <li>✓ ARGONAUT OS Zugang</li>
                <li>✓ Onboarding inklusive</li>
              </ul>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { name: 'STARTER', price: '1.500', desc: 'Bis 3 Standorte' },
                { name: 'PROFESSIONAL', price: '2.500', desc: 'Bis 10 Standorte' },
                { name: 'BUSINESS', price: '4.500', desc: 'Bis 30 Standorte' },
                { name: 'ENTERPRISE', price: '7.500', desc: 'Unbegrenzt' },
              ].map((p) => (
                <div key={p.name} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(201,168,76,0.08)',
                  border: '1px solid rgba(201,168,76,0.15)'
                }}>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '0.875rem' }}>{p.name}</span>
                    <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'rgba(255,255,255,0.5)' }}>{p.desc}</span>
                  </div>
                  <span style={{ fontWeight: '700', color: '#C9A84C' }}>{p.price} €/Mo</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderRadius: '0.75rem', padding: '1rem', marginBottom: '2rem', textAlign: 'center', backgroundColor: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)' }}>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              Externe Automatisierungsagentur:{' '}
              <span style={{ fontWeight: '700', color: '#FF6B6B' }}>10.000–35.000 €/Monat</span>
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <a
              href="https://calendly.com/argonaut"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '1rem 2.5rem',
                borderRadius: '0.5rem',
                fontSize: '1.125rem',
                fontWeight: '700',
                backgroundColor: '#C9A84C',
                color: '#0A1628',
                textDecoration: 'none'
              }}
            >
              Jetzt Demo buchen — kostenlos
            </a>
          </div>
        </div>
      </section>

      {/* AGENTEN */}
      <section style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.5rem' }}>Ihre KI-Agenten</h2>
          <p style={{ marginBottom: '2.5rem', color: 'rgba(255,255,255,0.5)' }}>
            Diese Agenten arbeiten 24/7 für {b.name}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem' }}>
            {b.agenten.map((agent, i) => (
              <div key={i} style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '9999px',
                fontWeight: '500',
                backgroundColor: 'rgba(201,168,76,0.12)',
                border: '1px solid rgba(201,168,76,0.3)',
                color: '#C9A84C'
              }}>
                {agent}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '5rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.25rem', fontWeight: '700', marginBottom: '1.5rem' }}>
            Bereit für ARGONAUT OS?
          </h2>
          <p style={{ fontSize: '1.25rem', marginBottom: '2.5rem', color: 'rgba(255,255,255,0.6)' }}>
            Keine Vertragsbindung. Keine versteckten Kosten. Einfach starten.
          </p>
          <a
            href="https://calendly.com/argonaut"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '1.25rem 3rem',
              borderRadius: '0.5rem',
              fontSize: '1.25rem',
              fontWeight: '700',
              backgroundColor: '#C9A84C',
              color: '#0A1628',
              textDecoration: 'none'
            }}
          >
            Kostenlose Demo für {b.name}
          </a>
        </div>
      </section>

    </main>
  )
}