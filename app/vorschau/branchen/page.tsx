import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '../_components/Navbar'
import BranchenAccordion from '../_components/BranchenAccordion'
import { websiteKategorien, websiteBranchen } from '../_lib/branchen-web'

// ============================================================================
// ARGONAUT OS · app/vorschau/branchen/page.tsx — Branchen-Übersicht (Aufklapp)
// Server-Komponente: lädt die gefilterte 19-Kategorien-Struktur und übergibt sie
// an die Client-Komponente <BranchenAccordion> (Aufklappen, Suche, Animation).
// robots: noindex (Vorschau).
// ============================================================================

const NAVY = '#0A1628'
const GOLD = '#c9a84c'

export const metadata: Metadata = {
  title: 'ARGONAUT — Für Ihre Branche gemacht',
  description: 'ARGONAUT ist für hunderte Branchen vorkonfiguriert — vom Handwerk bis zur Industrie. Wählen Sie Ihren Bereich.',
  robots: { index: false, follow: false },
}

export default function BranchenPage() {
  const kategorien = websiteKategorien().map((k) => ({
    kategorie: k.kategorie,
    branchen: k.branchen.map((b) => ({ name: b.name, slug: b.slug })),
  }))
  const total = websiteBranchen().length

  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <Navbar />

      {/* Hero */}
      <section style={{ padding: '130px 0 24px', textAlign: 'center', background: 'radial-gradient(1000px 500px at 50% -8%, rgba(201,168,76,0.12), transparent 60%)' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ color: GOLD, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: '.8rem', marginBottom: '1.4rem' }}>🔱 Branchen</div>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(2.2rem, 5.4vw, 3.6rem)', lineHeight: 1.08, paddingBottom: '2px', margin: '0 0 1rem' }}>
            Für Ihre Branche <span style={{ color: GOLD }}>gemacht</span>.
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.2rem)', color: '#b9cdd6', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.6 }}>
            ARGONAUT kommt für <strong style={{ color: '#EAF1F6' }}>{total} Branchen</strong> vorkonfiguriert — mit den richtigen Abläufen für Ihren Betrieb. Klappen Sie Ihren Bereich auf:
          </p>
        </div>
      </section>

      {/* Aufklapp-Übersicht */}
      <section style={{ padding: '10px 0 40px' }}>
        <BranchenAccordion kategorien={kategorien} total={total} />
      </section>

      {/* Abschluss */}
      <section style={{ padding: '20px 0 90px', textAlign: 'center' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', padding: '0 24px' }}>
          <p style={{ fontSize: 'clamp(1.1rem, 2vw, 1.3rem)', color: '#EAF1F6', margin: '0 0 20px' }}>
            Ihre Branche nicht dabei? ARGONAUT passt sich an — fragen Sie einfach.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/vorschau#demo" style={{ background: GOLD, color: NAVY, fontWeight: 600, padding: '14px 30px', borderRadius: '10px', textDecoration: 'none' }}>Demo buchen →</a>
            <Link href="/vorschau" style={{ background: 'transparent', color: '#EAF1F6', fontWeight: 500, padding: '14px 26px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(234,241,246,0.22)' }}>← Zur Startseite</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
