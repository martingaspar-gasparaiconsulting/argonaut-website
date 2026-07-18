import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Navbar from '../../_components/Navbar'
import Footer from '../../_components/Footer'
import { alleArtikel, artikelBySlug } from '../../_lib/ressourcen'

// ============================================================================
// ARGONAUT OS · app/vorschau/ressourcen/[slug]/page.tsx — Artikel-Vorlage.
// Rendert die Blöcke, Article-JSON-LD, Metadaten. robots: noindex (Vorschau).
// ============================================================================

const GOLD = '#c9a84c'
const NAVY = '#0A1628'
const SITE = 'https://argonaut-os.com'

export function generateStaticParams() {
  return alleArtikel().map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = artikelBySlug(slug)
  if (!a) return { title: 'Ressourcen — ARGONAUT OS' }
  const url = `${SITE}/ressourcen/${a.slug}`
  return {
    title: `${a.title} | ARGONAUT OS`,
    description: a.description,
    alternates: { canonical: url },
    openGraph: { title: a.title, description: a.description, url, type: 'article', siteName: 'ARGONAUT OS', locale: 'de_DE' },
    robots: { index: false, follow: false },
  }
}

export default async function Artikel({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = artikelBySlug(slug)
  if (!a) notFound()

  const weitere = alleArtikel().filter((x) => x.slug !== a.slug).slice(0, 3)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    datePublished: a.datum,
    author: { '@type': 'Organization', name: 'ARGONAUT OS' },
    publisher: { '@type': 'Organization', name: 'ARGONAUT OS' },
    mainEntityOfPage: `${SITE}/ressourcen/${a.slug}`,
  }

  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`
        .art-wrap { max-width: 760px; margin: 0 auto; padding: 0 24px; }
        .art-h1 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; margin: 0 0 1rem; }
        .art-h2 { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: clamp(1.35rem, 3vw, 1.7rem); color: #EAF1F6; margin: 2.2rem 0 0.9rem; }
        .art-p { color: #c4d3db; font-size: 1.08rem; line-height: 1.8; margin: 0 0 1.1rem; }
        .art-ul { color: #c4d3db; font-size: 1.05rem; line-height: 1.7; margin: 0 0 1.1rem; padding-left: 1.2rem; }
        .art-ul li { margin-bottom: .5rem; }
      `}</style>

      <Navbar />

      <article style={{ padding: '120px 0 40px' }}>
        <div className="art-wrap">
          <Link href="/vorschau/ressourcen" style={{ color: GOLD, textDecoration: 'none', fontSize: '.9rem' }}>← Alle Ressourcen</Link>
          <div style={{ margin: '20px 0 10px' }}>
            <span style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: GOLD, background: 'rgba(201,168,76,0.12)', borderRadius: '999px', padding: '3px 11px' }}>{a.tag}</span>
            <span style={{ color: '#7f97a4', fontSize: '.85rem', marginLeft: '12px' }}>{a.lesezeit} Lesezeit</span>
          </div>
          <h1 className="art-h1">{a.title}</h1>

          <div style={{ marginTop: '1.6rem' }}>
            {a.blocks.map((b, i) => {
              if (b.type === 'h2') return <h2 key={i} className="art-h2">{b.text}</h2>
              if (b.type === 'ul') return <ul key={i} className="art-ul">{(b.items || []).map((it, j) => <li key={j}>{it}</li>)}</ul>
              return <p key={i} className="art-p">{b.text}</p>
            })}
          </div>

          {/* CTA */}
          <div style={{ marginTop: '2.5rem', background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '32px 28px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', color: '#EAF1F6', margin: '0 0 12px', lineHeight: 1.2 }}>
              Ein System statt zwölf — sehen Sie es live.
            </p>
            <a href="/vorschau#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '14px 30px', borderRadius: '10px', textDecoration: 'none' }}>Demo buchen →</a>
          </div>
        </div>
      </article>

      {/* Weitere Artikel */}
      {weitere.length > 0 && (
        <section style={{ padding: '10px 0 80px' }}>
          <div className="art-wrap">
            <h2 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: '1.3rem', margin: '0 0 16px' }}>Weiterlesen</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {weitere.map((w) => (
                <Link key={w.slug} href={`/vorschau/ressourcen/${w.slug}`} style={{ color: '#c4d3db', textDecoration: 'none', background: 'rgba(122,163,179,0.05)', border: '1px solid rgba(122,163,179,0.14)', borderRadius: '12px', padding: '14px 18px' }}>
                  <span style={{ color: GOLD, fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{w.tag}</span>
                  <div style={{ color: '#EAF1F6', fontWeight: 600, marginTop: '4px' }}>{w.title}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </main>
  )
}
