import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Navbar from '../../_components/Navbar'
import AngebotAnfrage from '../../_components/AngebotAnfrage'
import { websiteBranchen, websiteBrancheBySlug, websiteVerwandte } from '../../_lib/branchen-web'
import { seoBySlug } from '../../_lib/branchen-seo'
import { baukastenFor } from '../../_lib/branchen-bausteine'

// ============================================================================
// ARGONAUT OS · app/vorschau/branchen/[slug]/page.tsx — Branchen-Detailseite
// Kompletter Vertriebsweg auf einer Seite: Hero · Schmerzpunkte · Ergebnisse ·
// "Das ist Ihr System" (kategoriespezifischer Baukasten: Kern + Basis) ·
// "Speziell für ..." (kuratierte Spezial-Module) · Preis-Rechner (branchen-
// gerechte Rollen) · Anfrage-Formular (→ CRM). OS-Sprache. noindex (Vorschau).
// ============================================================================

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const SITE = 'https://argonaut-os.com'

export function generateStaticParams() {
  return websiteBranchen().map((b) => ({ slug: b.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const b = websiteBrancheBySlug(slug)
  if (!b) return { title: 'ARGONAUT — Branche' }
  const title = `Software für ${b.name} — ARGONAUT OS`
  const description = `Die Branchensoftware für ${b.name}: CRM, Aufträge, Rechnungen, Personal und Auswertungen in einem System. Für ${b.name} vorkonfiguriert, DSGVO-konform, deutscher Server.`
  const url = `${SITE}/vorschau/branchen/${b.slug}`
  return {
    title,
    description,
    keywords: [`Software ${b.name}`, `${b.name} Software`, `CRM ${b.name}`, `ERP ${b.name}`, `Digitalisierung ${b.name}`, 'ARGONAUT OS'],
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: 'ARGONAUT OS', locale: 'de_DE' },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: false, follow: false },
  }
}

export default async function BrancheDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const b = websiteBrancheBySlug(slug)
  if (!b) notFound()

  const verwandte = websiteVerwandte(slug)
  const seo = seoBySlug(slug)
  const { stack, spezial, rollen } = baukastenFor(b.kategorie)
  const jsonLd: any[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: `ARGONAUT OS für ${b.name}`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, iOS, Android',
      offers: { '@type': 'Offer', price: '499', priceCurrency: 'EUR' },
      description: `Die Branchensoftware für ${b.name}: CRM, Aufträge, Rechnungen, Personal und Auswertungen in einem System.`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Start', item: `${SITE}/vorschau` },
        { '@type': 'ListItem', position: 2, name: 'Branchen', item: `${SITE}/vorschau/branchen` },
        { '@type': 'ListItem', position: 3, name: b.name, item: `${SITE}/vorschau/branchen/${b.slug}` },
      ],
    },
  ]
  if (seo?.faq?.length) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: seo.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    })
  }

  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`
        .bd-wrap { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
        .bd-h1 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(2.2rem, 5.6vw, 3.8rem); line-height: 1.06; padding-bottom: 2px; margin: 0 0 1.1rem; }
        .bd-h2 { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: clamp(1.5rem, 3.2vw, 2.1rem); line-height: 1.25; margin: 0 0 1.4rem; }
        .bd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .bd-card { border-radius: 14px; padding: 20px 22px; line-height: 1.5; }
        .bd-pain { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.14); color: #c4d3db; }
        .bd-win { background: rgba(201,168,76,0.06); border: 1px solid rgba(201,168,76,0.22); color: #EAF1F6; }
        .bd-stack { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .bd-tile { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.14); border-radius: 14px; padding: 18px 18px; transition: border-color .2s, background .2s; }
        .bd-tile:hover { border-color: rgba(201,168,76,0.4); background: rgba(201,168,76,0.05); }
        .bd-tile-extra { background: rgba(201,168,76,0.06); border-color: rgba(201,168,76,0.28); }
        .bd-tile-top { display: flex; align-items: center; gap: 9px; margin-bottom: 7px; flex-wrap: wrap; }
        .bd-tile-icon { font-size: 1.2rem; line-height: 1; }
        .bd-tile-name { font-weight: 700; font-size: .98rem; color: #EAF1F6; }
        .bd-tile-tag { font-size: .68rem; font-weight: 700; letter-spacing: .04em; color: ${GOLD}; background: rgba(201,168,76,0.12); border-radius: 999px; padding: 2px 8px; }
        .bd-tile-sub { font-size: .85rem; color: #9fb3bd; line-height: 1.4; }
        .bd-subhead { display: flex; align-items: center; gap: 10px; margin: 30px 0 14px; }
        .bd-subhead-line { flex: 1; height: 1px; background: rgba(201,168,76,0.2); }
        .bd-subhead-txt { font-size: .82rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${GOLD}; }
        .bd-summary { margin-top: 20px; background: linear-gradient(160deg, rgba(201,168,76,0.08), rgba(122,163,179,0.05)); border: 1px solid rgba(201,168,76,0.28); border-radius: 14px; padding: 20px 24px; font-size: 1.05rem; color: #EAF1F6; line-height: 1.55; }
        @media (max-width: 860px) { .bd-stack { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .bd-grid { grid-template-columns: 1fr; } .bd-stack { grid-template-columns: 1fr; } }
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
            <a href="#demo" style={{ background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '15px 30px', borderRadius: '10px', textDecoration: 'none' }}>Demo für {b.name} buchen →</a>
            <Link href="/vorschau/branchen" style={{ background: 'transparent', color: '#EAF1F6', fontWeight: 500, fontSize: '1rem', padding: '15px 26px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(234,241,246,0.22)' }}>Alle Branchen</Link>
          </div>
        </div>
      </section>

      {/* SEO-Intro (einzigartig je Branche) */}
      {seo?.intro && (
        <section style={{ padding: '4px 0 16px' }}>
          <div className="bd-wrap">
            <p style={{ color: '#c4d3db', fontSize: '1.05rem', lineHeight: 1.75, maxWidth: '72ch' }}>{seo.intro}</p>
          </div>
        </section>
      )}

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

      {/* Das ist Ihr System — Baukasten (Kern + Basis) + kuratierte Spezial-Module */}
      <section style={{ padding: '40px 0 20px' }}>
        <div className="bd-wrap">
          <h2 className="bd-h2">Das ist <span style={{ color: GOLD }}>Ihr System</span> — ARGONAUT für {b.name}.</h2>
          <p style={{ color: '#b9cdd6', maxWidth: '58ch', margin: '-0.6rem 0 1.8rem', lineHeight: 1.6 }}>
            Diese Programme bekommen Sie ab Tag 1 — alles verzahnt, ein Login.
          </p>
          <div className="bd-stack">
            {stack.map((t) => (
              <div key={t.name} className="bd-tile">
                <div className="bd-tile-top">
                  <span className="bd-tile-icon" aria-hidden="true">{t.icon}</span>
                  <span className="bd-tile-name">{t.name}</span>
                  {t.tag && <span className="bd-tile-tag">{t.tag}</span>}
                </div>
                <div className="bd-tile-sub">{t.sub}</div>
              </div>
            ))}
          </div>

          {/* Kuratierte Spezial-Module */}
          {spezial.length > 0 && (
            <>
              <div className="bd-subhead">
                <span className="bd-subhead-txt">Speziell für {b.kategorie}</span>
                <span className="bd-subhead-line" />
              </div>
              <p style={{ color: '#b9cdd6', maxWidth: '58ch', margin: '-4px 0 16px', lineHeight: 1.6 }}>
                Dazu kommen die Funktionen, die {b.name} wirklich brauchen — von Anfang an mit dabei.
              </p>
              <div className="bd-stack">
                {spezial.map((t) => (
                  <div key={t.name} className="bd-tile bd-tile-extra">
                    <div className="bd-tile-top">
                      <span className="bd-tile-icon" aria-hidden="true">{t.icon}</span>
                      <span className="bd-tile-name">{t.name}</span>
                      {t.tag && <span className="bd-tile-tag">{t.tag}</span>}
                    </div>
                    <div className="bd-tile-sub">{t.sub}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="bd-summary">
            Kurz gesagt: Ihr komplettes <strong style={{ color: GOLD }}>CRM, ERP, Warenwirtschaft und DMS</strong> — in einem System, ein Login. Statt fünf Programme, die nicht miteinander reden.
          </p>
        </div>
      </section>

      {/* Reassurance */}
      <section style={{ padding: '30px 0 10px' }}>
        <div className="bd-wrap">
          <div style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '36px 28px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: '#EAF1F6', margin: '0 0 12px', lineHeight: 1.2 }}>
              Ein System statt zwölf — auch für {b.name}.
            </p>
            <p style={{ color: '#b9cdd6', maxWidth: '48ch', margin: '0 auto', lineHeight: 1.6 }}>
              Alles verzahnt, DSGVO-konform, mit KI-Crew an Bord. Wir richten es persönlich mit Ihnen ein.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ (einzigartig je Branche) + FAQ-Schema */}
      {seo?.faq && seo.faq.length > 0 && (
        <section style={{ padding: '30px 0 10px' }}>
          <div className="bd-wrap">
            <h2 className="bd-h2">Häufige Fragen — ARGONAUT für {b.name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {seo.faq.map((f, i) => (
                <div key={i} style={{ background: 'rgba(122,163,179,0.05)', border: '1px solid rgba(122,163,179,0.14)', borderRadius: '12px', padding: '18px 22px' }}>
                  <p style={{ fontWeight: 700, color: '#EAF1F6', margin: '0 0 6px', fontSize: '1rem' }}>{f.q}</p>
                  <p style={{ color: '#b9cdd6', margin: 0, lineHeight: 1.65, fontSize: '.95rem' }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Ähnliche Branchen — interne Verlinkung (SEO) */}
      {verwandte.length > 0 && (
        <section style={{ padding: '20px 0 6px' }}>
          <div className="bd-wrap">
            <h2 className="bd-h2" style={{ fontSize: 'clamp(1.2rem, 2.6vw, 1.6rem)' }}>Ähnliche Branchen</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {verwandte.map((v) => (
                <Link key={v.slug} href={`/vorschau/branchen/${v.slug}`} style={{ background: 'rgba(122,163,179,0.06)', border: '1px solid rgba(122,163,179,0.16)', borderRadius: '999px', padding: '9px 16px', fontSize: '.9rem', color: '#c4d3db', textDecoration: 'none' }}>{v.name}</Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Angebot + Anfrage in einem Guss → eigenes CRM */}
      <AngebotAnfrage branche={b.name} rollen={rollen} />
    </main>
  )
}
