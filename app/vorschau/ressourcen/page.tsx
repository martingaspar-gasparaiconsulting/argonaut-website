import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '../_components/Navbar'
import Footer from '../_components/Footer'
import { alleArtikel } from '../_lib/ressourcen'

// ============================================================================
// ARGONAUT OS · app/vorschau/ressourcen/page.tsx — Blog-/Ressourcen-Übersicht.
// Zeigt Lesezeit + "Erstellt am" (fester Rhythmus Mo/Mi/Fr). noindex (Vorschau).
// ============================================================================

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

function fmtDatum(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export const metadata: Metadata = {
  title: 'Ressourcen — Wissen für den Mittelstand | ARGONAUT OS',
  description: 'Praxisnahe Artikel für den deutschen Mittelstand: Digitalisierung, Software, Pflichten und wie ein System statt zwölf den Alltag leichter macht.',
  robots: { index: false, follow: false },
}

export default function Ressourcen() {
  const artikel = alleArtikel()
  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <Navbar />

      <section style={{ padding: '130px 24px 30px', textAlign: 'center', background: 'radial-gradient(1000px 500px at 50% -8%, rgba(201,168,76,0.12), transparent 60%)' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ color: GOLD, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: '.8rem', marginBottom: '1.4rem' }}>🔱 Ressourcen</div>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(2.2rem, 5.4vw, 3.4rem)', lineHeight: 1.08, margin: '0 0 1rem' }}>
            Wissen für den <span style={{ color: GOLD }}>Mittelstand</span>.
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.2rem)', color: '#b9cdd6', maxWidth: '54ch', margin: '0 auto', lineHeight: 1.6 }}>
            Praxisnah, ehrlich, ohne Tech-Kauderwelsch — Digitalisierung, Software und Pflichten, verständlich erklärt. Neuer Beitrag jeden Montag, Mittwoch und Freitag.
          </p>
        </div>
      </section>

      <section style={{ padding: '30px 0 90px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
          {artikel.map((a) => (
            <Link key={a.slug} href={`/vorschau/ressourcen/${a.slug}`} style={{ textDecoration: 'none', display: 'block', background: 'linear-gradient(160deg, rgba(18,32,54,0.6), rgba(10,22,40,0.6))', border: '1px solid rgba(122,163,179,0.16)', borderRadius: '16px', padding: '24px 26px', transition: 'border-color .2s' }}>
              <span style={{ display: 'inline-block', fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: GOLD, background: 'rgba(201,168,76,0.12)', borderRadius: '999px', padding: '3px 11px', marginBottom: '14px' }}>{a.tag}</span>
              <h2 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: '1.15rem', color: '#EAF1F6', margin: '0 0 10px', lineHeight: 1.3 }}>{a.title}</h2>
              <p style={{ color: '#9fb3bd', fontSize: '.92rem', lineHeight: 1.55, margin: '0 0 14px' }}>{a.description}</p>
              <div style={{ color: '#7f97a4', fontSize: '.8rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span>{a.lesezeit} Lesezeit</span>
                <span>Erstellt am {fmtDatum(a.datum)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  )
}
