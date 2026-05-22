'use client'

import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export default function Impressum() {
  return (
    <>
      <Navbar />
      <main style={{ background: '#faf9f6', minHeight: '100vh' }}>

        {/* Hero */}
        <div style={{ background: '#0A1628', padding: '80px 48px 60px' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Rechtliches
            </p>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
              Impressum
            </h1>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '64px 48px' }}>

          {/* Angaben gemäß §5 TMG */}
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0A1628', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C', display: 'inline-block' }}>
              Angaben gemäß § 5 TMG
            </h2>
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '28px 32px', lineHeight: 1.8 }}>
              <p style={{ fontSize: '16px', color: '#0A1628', margin: 0 }}>
                <strong>Gaspar AI Consulting</strong><br />
                Martin Gaspar<br />
                Einzelunternehmer<br /><br />
                <span style={{ color: '#6b7280' }}>Tübinger Straße 50</span><br />
                71032 Böblingen<br />
                Deutschland
              </p>
            </div>
          </section>

          {/* Kontakt */}
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0A1628', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C', display: 'inline-block' }}>
              Kontakt
            </h2>
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '28px 32px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { label: 'Telefon', value: '[+49 XXX XXXXXXXX]' },
                    { label: 'E-Mail', value: 'martin@gasparaiconsulting.de' },
                    { label: 'Website', value: 'www.argonaut-os.de' },
                  ].map(({ label, value }) => (
                    <tr key={label} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 0', fontSize: '14px', fontWeight: 600, color: '#0A1628', width: '160px' }}>{label}</td>
                      <td style={{ padding: '12px 0', fontSize: '14px', color: value.startsWith('[') ? '#6b7280' : '#374151' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Steuerliche Angaben */}
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0A1628', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C', display: 'inline-block' }}>
              Steuerliche Angaben
            </h2>
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '28px 32px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { label: 'Steuernummer', value: '[XX/XXX/XXXXX]' },
                    { label: 'USt-IdNr.', value: 'DE326706056' },
                  ].map(({ label, value }) => (
                    <tr key={label} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 0', fontSize: '14px', fontWeight: 600, color: '#0A1628', width: '160px' }}>{label}</td>
                      <td style={{ padding: '12px 0', fontSize: '14px', color: '#6b7280' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '16px', marginBottom: 0 }}>
                Zuständiges Finanzamt: Finanzamt Böblingen
              </p>
            </div>
          </section>

          {/* Berufsbezeichnung */}
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0A1628', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C', display: 'inline-block' }}>
              Berufsbezeichnung & Aufsicht
            </h2>
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '28px 32px' }}>
              <p style={{ fontSize: '15px', color: '#374151', lineHeight: 1.8, margin: 0 }}>
                Tätigkeit: KI-Beratung und Softwareentwicklung<br />
                Rechtsform: Einzelunternehmen<br />
                Zuständige Kammer: keine berufsrechtliche Kammerpflicht<br />
                Berufsrechtliche Regelungen: keine branchenspezifischen berufsrechtlichen Regelungen anwendbar
              </p>
            </div>
          </section>

          {/* Haftungsausschluss */}
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0A1628', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C', display: 'inline-block' }}>
              Haftungsausschluss
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                {
                  title: 'Haftung für Inhalte',
                  text: 'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.',
                },
                {
                  title: 'Haftung für Links',
                  text: 'Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.',
                },
                {
                  title: 'Urheberrecht',
                  text: 'Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.',
                },
              ].map(({ title, text }) => (
                <div key={title} style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px 32px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0A1628', marginBottom: '10px' }}>{title}</h3>
                  <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.8, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Streitschlichtung */}
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0A1628', marginBottom: '20px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C', display: 'inline-block' }}>
              Streitschlichtung
            </h2>
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '28px 32px' }}>
              <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.8, margin: 0 }}>
                Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
                <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer"
                  style={{ color: '#C9A84C', textDecoration: 'none', fontWeight: 600 }}>
                  https://ec.europa.eu/consumers/odr/
                </a>
                .<br /><br />
                Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </div>
          </section>

          {/* Navigation */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
            {[
              { label: '← Datenschutzerklärung', href: '/datenschutz' },
              { label: 'AGB →', href: '/agb' },
            ].map(({ label, href }) => (
              <Link key={href} href={href}
                style={{ fontSize: '14px', color: '#C9A84C', textDecoration: 'none', fontWeight: 600 }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.75'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >{label}</Link>
            ))}
          </div>

        </div>
      </main>
      <Footer />
    </>
  )
}
