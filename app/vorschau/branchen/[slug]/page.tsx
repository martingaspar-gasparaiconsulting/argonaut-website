import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Navbar from '../../_components/Navbar'
import { websiteBranchen, websiteBrancheBySlug } from '../../_lib/branchen-web'

// ============================================================================
// ARGONAUT OS · app/vorschau/branchen/[slug]/page.tsx — Branchen-Detailseite
// Eine Vorlage, gespeist aus lib/branchen (Schmerzpunkte + Ergebnisse je Branche).
// Bewusst in OS-Sprache (kein "Automatisierungen/Agenten"). Alle Seiten statisch
// vorgerendert. Hintergrundbild folgt später (Stock + Navy-Schleier) — Slot ist da.
// robots: noindex (Vorschau).
// ============================================================================

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

export function generateStaticParams() {
  return websiteBranchen().map((b) => ({ slug: b.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const b = websiteBrancheBySlug(slug)
  return {
    title: b ? `ARGONAUT für ${b.name} — Ihr Betrieb in einem System` : 'ARGONAUT — Branche',
    description: b ? `ARGONAUT für ${b.name}: alle Abläufe in einem System, für Ihren Betrieb vorkonfiguriert.` : undefined,
    robots: { index: false, follow: false },
  }
}

export default async function BrancheDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const b = websiteBrancheBySlug(slug)
  if (!b) notFound()

  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <style>{`
        .bd-wrap { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
        .bd-h1 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(2.2rem, 5.6vw, 3.8rem); line-height: 1.06; padding-bottom: 2px; margin: 0 0 1.1rem; }
        .bd-h2 { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: clamp(1.5rem, 3.2vw, 2.1rem); line-height: 1.25; margin: 0 0 1.4rem; }
        .bd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .bd-card { border-radius: 14px; padding: 20px 22px; line-height: 1.5; }
        .bd-pain { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.14); color: #c4d3db; }
        .bd-win { background: rgba(201,168,76,0.06); border: 1px solid rgba(201,168,76,0.22); color: #EAF1F6; }
        @media (max-width: 640px) { .bd-grid { grid-template-columns: 1fr; } }
      `}</style>

      <Navbar />

      {/* Hero — Bild-Slot: hier kommt später ein dezentes Branchen-Stockbild mit Navy-Schleier rein */}
      <section style={{
        padding: '150px 0 70px', textAlign: 'center',
        background: 'radial-gradient(900px 500px at 50% -10%, rgba(201,168,76,0.14), transparent 60%), linear-gradient(180deg, rgba(18,32,54,0.5), transparent)',
      }}>
        <div className="bd-wrap">
          <div style={{ color: GOLD, letterSpacing: '.22em', textTransform: 'uppercase', fontSize: '.78rem', marginBottom: '1.2rem' }}>
            🔱 ARGONAUT für {b.kategorie}
          </div>
          <h1 className="bd-h1">{b.name}</h1>
          <p style={{ fontSize: 'clamp(1.05rem, 2vw, 1.28rem)', color: '#b9cdd6', maxWidth: '46ch', margin: '0 auto 2rem', lineHeight: 1.55 }}>
            Ihr ganzer Betrieb in <span style={{ color: GOLD }}>einem System</span> — für {b.name} fertig eingerichtet. Kein Flickenteppich, keine Insellösungen.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/vorschau#demo" style={{ background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '15px 30px', borderRadius: '10px', textDecoration: 'none' }}>Demo für {b.name} buchen →</a>
            <Link href="/vorschau/branchen" style={{ background: 'transparent', color: '#EAF1F6', fontWeight: 500, fontSize: '1rem', padding: '15px 26px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(234,241,246,0.22)' }}>Alle Branchen</Link>
          </div>
        </div>
      </section>

      {/* Schmerzpunkte */}
      <section style={{ padding: '30px 0' }}>
        <div className="bd-wrap">
          <h2 className="bd-h2">Kennen Sie das?</h2>
          <div className="bd-grid">
            {b.schmerzen.map((s) => (
              <div key={s} className="bd-card bd-pain">
                <span aria-hidden="true" style={{ color: '#8fa9b6', marginRight: '8px' }}>✕</span>{s}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ergebnisse */}
      <section style={{ padding: '30px 0' }}>
        <div className="bd-wrap">
          <h2 className="bd-h2">Mit ARGONAUT läuft das <span style={{ color: GOLD }}>von selbst</span>.</h2>
          <div className="bd-grid">
            {b.ergebnisse.map((e) => (
              <div key={e} className="bd-card bd-win">
                <span aria-hidden="true" style={{ color: GOLD, marginRight: '8px', fontWeight: 700 }}>✓</span>{e}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reassurance + CTA */}
      <section style={{ padding: '40px 0 100px' }}>
        <div className="bd-wrap">
          <div style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '40px 28px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: '#EAF1F6', margin: '0 0 12px', lineHeight: 1.2 }}>
              Ein System statt zwölf — auch für {b.name}.
            </p>
            <p style={{ color: '#b9cdd6', maxWidth: '48ch', margin: '0 auto 24px', lineHeight: 1.6 }}>
              CRM, Aufträge, Rechnungen, Personal, Auswertungen — alles verzahnt, DSGVO-konform, mit KI-Crew an Bord. Wir richten es persönlich mit Ihnen ein.
            </p>
            <a href="/vorschau#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '15px 32px', borderRadius: '10px', textDecoration: 'none', boxShadow: '0 10px 30px rgba(201,168,76,0.25)' }}>
              Demo buchen <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
