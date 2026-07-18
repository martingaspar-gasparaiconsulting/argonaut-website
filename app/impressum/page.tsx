import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '../vorschau/_components/Navbar'
import Footer from '../vorschau/_components/Footer'

// ============================================================================
// ARGONAUT OS · app/impressum/page.tsx — Impressum im neuen dunklen Design.
// Inhalt unverändert (recht24), nur: Steuernummer-Platzhalter entfernt
// (USt-IdNr genügt), Design an /vorschau angeglichen. Telefon folgt später.
// ============================================================================

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

export const metadata: Metadata = {
  title: 'Impressum — ARGONAUT OS',
}

const haftung = [
  { title: 'Haftung für Inhalte', text: 'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.' },
  { title: 'Haftung für Links', text: 'Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.' },
  { title: 'Urheberrecht', text: 'Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.' },
]

export default function Impressum() {
  return (
    <>
      <Navbar />
      <main style={{ background: NAVY, minHeight: '100vh', color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300 }}>
        <style>{`
          .im-wrap { max-width: 800px; margin: 0 auto; padding: 0 24px; }
          .im-h2 { font-family: var(--font-dm-sans), sans-serif; color: #EAF1F6; font-size: 1.25rem; font-weight: 700; margin: 0 0 18px; padding-bottom: 10px; border-bottom: 2px solid ${GOLD}; display: inline-block; }
          .im-card { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.16); border-radius: 12px; padding: 24px 28px; }
          .im-row { display: flex; padding: 11px 0; border-bottom: 1px solid rgba(122,163,179,0.12); font-size: .95rem; }
          .im-row:last-child { border-bottom: none; }
          .im-row .k { width: 160px; font-weight: 600; color: #EAF1F6; flex-shrink: 0; }
          .im-row .v { color: #b9cdd6; }
        `}</style>

        {/* Hero */}
        <div style={{ background: 'radial-gradient(900px 400px at 50% -20%, rgba(201,168,76,0.14), transparent 60%)', padding: '130px 24px 50px' }}>
          <div className="im-wrap">
            <div style={{ color: GOLD, fontSize: '.75rem', letterSpacing: '.22em', textTransform: 'uppercase', marginBottom: '14px' }}>Rechtliches</div>
            <h1 style={{ color: '#EAF1F6', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, margin: 0, fontFamily: 'var(--font-syne), sans-serif' }}>Impressum</h1>
          </div>
        </div>

        <div className="im-wrap" style={{ padding: '56px 24px 80px' }}>

          <section style={{ marginBottom: '40px' }}>
            <h2 className="im-h2">Angaben gemäß § 5 TMG</h2>
            <div className="im-card" style={{ lineHeight: 1.8 }}>
              <p style={{ margin: 0, color: '#EAF1F6' }}>
                <strong>Gaspar AI Consulting</strong><br />
                Martin Gaspar<br />
                Einzelunternehmer<br /><br />
                <span style={{ color: '#b9cdd6' }}>Tübinger Straße 50<br />71032 Böblingen<br />Deutschland</span>
              </p>
            </div>
          </section>

          <section style={{ marginBottom: '40px' }}>
            <h2 className="im-h2">Kontakt</h2>
            <div className="im-card">
              <div className="im-row"><span className="k">E-Mail</span><span className="v">martin@gasparaiconsulting.de</span></div>
              <div className="im-row"><span className="k">Website</span><span className="v">www.argonaut-os.de</span></div>
            </div>
          </section>

          <section style={{ marginBottom: '40px' }}>
            <h2 className="im-h2">Steuerliche Angaben</h2>
            <div className="im-card">
              <div className="im-row"><span className="k">USt-IdNr.</span><span className="v">DE326706056</span></div>
              <div className="im-row"><span className="k">Finanzamt</span><span className="v">Finanzamt Böblingen</span></div>
            </div>
          </section>

          <section style={{ marginBottom: '40px' }}>
            <h2 className="im-h2">Berufsbezeichnung & Aufsicht</h2>
            <div className="im-card">
              <p style={{ margin: 0, color: '#b9cdd6', lineHeight: 1.8 }}>
                Tätigkeit: KI-Beratung und Softwareentwicklung<br />
                Rechtsform: Einzelunternehmen<br />
                Zuständige Kammer: keine berufsrechtliche Kammerpflicht<br />
                Berufsrechtliche Regelungen: keine branchenspezifischen berufsrechtlichen Regelungen anwendbar
              </p>
            </div>
          </section>

          <section style={{ marginBottom: '40px' }}>
            <h2 className="im-h2">Haftungsausschluss</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {haftung.map(({ title, text }) => (
                <div key={title} className="im-card">
                  <h3 style={{ fontSize: '.98rem', fontWeight: 700, color: '#EAF1F6', margin: '0 0 8px' }}>{title}</h3>
                  <p style={{ fontSize: '.9rem', color: '#9fb3bd', lineHeight: 1.8, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: '40px' }}>
            <h2 className="im-h2">Streitschlichtung</h2>
            <div className="im-card">
              <p style={{ fontSize: '.9rem', color: '#9fb3bd', lineHeight: 1.8, margin: 0 }}>
                Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
                <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" style={{ color: GOLD, textDecoration: 'none', fontWeight: 600 }}>https://ec.europa.eu/consumers/odr/</a>.<br /><br />
                Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </div>
          </section>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid rgba(122,163,179,0.14)' }}>
            <Link href="/datenschutz" style={{ fontSize: '.9rem', color: GOLD, textDecoration: 'none', fontWeight: 600 }}>← Datenschutzerklärung</Link>
            <Link href="/agb" style={{ fontSize: '.9rem', color: GOLD, textDecoration: 'none', fontWeight: 600 }}>AGB →</Link>
          </div>

        </div>
      </main>
      <Footer />
    </>
  )
}
