'use client'

import Link from 'next/link'
import { useState } from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const sections = [
  { id: 'verantwortlicher', label: 'Verantwortlicher' },
  { id: 'datenerhebung', label: 'Datenerhebung' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'supabase', label: 'Supabase' },
  { id: 'stripe', label: 'Stripe' },
  { id: 'hubspot', label: 'HubSpot' },
  { id: 'ki-training', label: 'KI-Training' },
  { id: 'rechte', label: 'Ihre Rechte' },
]

export default function Datenschutz() {
  const [activeSection, setActiveSection] = useState('')

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(id)
    }
  }

  return (
    <>
      <Navbar />
      <main style={{ background: '#faf9f6', minHeight: '100vh' }}>

        {/* Hero */}
        <div style={{ background: '#0A1628', padding: '80px 48px 60px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Rechtliches
            </p>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, color: '#ffffff', margin: '0 0 16px', letterSpacing: '-0.02em' }}>
              Datenschutzerklärung
            </h1>
            <p style={{ fontSize: '15px', color: '#9ca3af', margin: 0 }}>
              Gemäß DSGVO (EU) 2016/679 · Stand: Mai 2025
            </p>
          </div>
        </div>

        {/* Layout: TOC + Content */}
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 48px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: '48px', alignItems: 'start' }}>

          {/* Table of Contents */}
          <aside style={{ position: 'sticky', top: '100px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#0A1628', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Inhalt
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {sections.map(({ id, label }) => (
                <button key={id} onClick={() => scrollTo(id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
                    color: activeSection === id ? '#C9A84C' : '#6b7280',
                    fontWeight: activeSection === id ? 700 : 400,
                    borderLeft: activeSection === id ? '2px solid #C9A84C' : '2px solid transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (activeSection !== id) e.currentTarget.style.color = '#0A1628' }}
                  onMouseLeave={(e) => { if (activeSection !== id) e.currentTarget.style.color = '#6b7280' }}
                >{label}</button>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

            {/* 1. Verantwortlicher */}
            <section id="verantwortlicher">
              <h2 style={headingStyle}>1. Verantwortlicher</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website ist:
                </p>
                <div style={{ marginTop: '16px', padding: '20px', background: '#faf9f6', borderRadius: '8px', lineHeight: 1.9 }}>
                  <strong style={{ color: '#0A1628' }}>Gaspar AI Consulting</strong><br />
                  Martin Gaspar (Einzelunternehmer)<br />
                  <span style={{ color: '#6b7280' }}>[Straße und Hausnummer]</span><br />
                  71132 Böblingen, Deutschland<br /><br />
                  E-Mail: <a href="mailto:martin@gasparaiconsulting.de" style={{ color: '#C9A84C', textDecoration: 'none' }}>martin@gasparaiconsulting.de</a><br />
                  Telefon: <span style={{ color: '#6b7280' }}>[+49 XXX XXXXXXXX]</span>
                </div>
              </div>
            </section>

            {/* 2. Datenerhebung */}
            <section id="datenerhebung">
              <h2 style={headingStyle}>2. Datenerhebung auf dieser Website</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  {
                    title: 'Server-Log-Dateien',
                    text: 'Der Hosting-Provider dieser Website erhebt und speichert automatisch Informationen in sogenannten Server-Log-Dateien, die Ihr Browser automatisch übermittelt. Dies sind: Browsertyp und -version, verwendetes Betriebssystem, Referrer-URL, Hostname des zugreifenden Rechners, Uhrzeit der Serveranfrage und IP-Adresse. Diese Daten sind nicht bestimmten Personen zuordbar und werden nicht mit Daten aus anderen Quellen zusammengeführt. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).',
                  },
                  {
                    title: 'Kontaktformular & E-Mail',
                    text: 'Wenn Sie uns per Kontaktformular oder E-Mail kontaktieren, speichern wir Ihre angegebenen Daten (Name, E-Mail, Nachricht) zur Bearbeitung Ihrer Anfrage. Diese Daten werden nicht ohne Ihre Einwilligung weitergegeben. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung) bzw. Art. 6 Abs. 1 lit. f DSGVO.',
                  },
                  {
                    title: 'Registrierung & Nutzerkonto',
                    text: 'Bei der Registrierung für ARGONAUT OS erheben wir Name, E-Mail-Adresse und Passwort (gehashed). Diese Daten werden ausschließlich zur Bereitstellung des Dienstes verwendet. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).',
                  },
                ].map(({ title, text }) => (
                  <div key={title} style={cardStyle}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0A1628', marginBottom: '10px' }}>{title}</h3>
                    <p style={{ ...textStyle, margin: 0 }}>{text}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* 3. Cookies */}
            <section id="cookies">
              <h2 style={headingStyle}>3. Cookies</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  Unsere Website verwendet Cookies. Cookies sind kleine Textdateien, die Ihr Browser auf Ihrem Endgerät speichert. Wir unterscheiden zwischen:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                  {[
                    { type: 'Technisch notwendige Cookies', desc: 'Diese Cookies sind für den Betrieb der Website zwingend erforderlich (z. B. Sitzungstoken, Authentifizierung). Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.', badge: 'Immer aktiv' },
                    { type: 'Analyse-Cookies', desc: 'Sofern Sie eingewilligt haben, setzen wir Analyse-Cookies ein, um die Nutzung unserer Website zu verstehen und zu verbessern. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).', badge: 'Mit Einwilligung' },
                  ].map(({ type, desc, badge }) => (
                    <div key={type} style={{ padding: '16px 20px', background: '#faf9f6', borderRadius: '8px', borderLeft: '3px solid #C9A84C' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0A1628' }}>{type}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#C9A84C', background: '#fef3c7', padding: '2px 8px', borderRadius: '20px', letterSpacing: '0.05em' }}>{badge}</span>
                      </div>
                      <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.7 }}>{desc}</p>
                    </div>
                  ))}
                </div>
                <p style={{ ...textStyle, marginTop: '16px', marginBottom: 0 }}>
                  Sie können Ihren Browser so einstellen, dass keine Cookies gesetzt werden. In diesem Fall kann es jedoch zu Funktionseinschränkungen auf unserer Website kommen.
                </p>
              </div>
            </section>

            {/* 4. Supabase */}
            <section id="supabase">
              <h2 style={headingStyle}>4. Supabase – Datenbankdienst</h2>
              <div style={cardStyle}>
                <div style={badgeRowStyle}>
                  <span style={providerBadge}>Auftragsverarbeitung</span>
                  <span style={providerBadge}>Art. 28 DSGVO</span>
                </div>
                <p style={textStyle}>
                  Wir nutzen Supabase (Supabase Inc., 970 Trestle Glen Rd, Oakland, CA 94610, USA) als Backend-Datenbanklösung für ARGONAUT OS. Supabase speichert Nutzerdaten, Konfigurationsdaten und Systemlogs.
                </p>
                <p style={textStyle}>
                  Supabase verarbeitet Daten in unserem Auftrag auf Basis eines Auftragsverarbeitungsvertrags (AVV) gemäß Art. 28 DSGVO. Die Datenspeicherung erfolgt in der EU (Frankfurt, eu-central-1). Für Datentransfers in die USA greift Supabase auf EU-Standardvertragsklauseln (SCCs) zurück.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Datenschutzerklärung Supabase:{' '}
                  <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#C9A84C', textDecoration: 'none' }}>supabase.com/privacy</a>
                </p>
              </div>
            </section>

            {/* 5. Stripe */}
            <section id="stripe">
              <h2 style={headingStyle}>5. Stripe – Zahlungsabwicklung</h2>
              <div style={cardStyle}>
                <div style={badgeRowStyle}>
                  <span style={providerBadge}>Zahlungsdienstleister</span>
                  <span style={providerBadge}>PCI-DSS konform</span>
                </div>
                <p style={textStyle}>
                  Für die Abwicklung von Zahlungen nutzen wir Stripe (Stripe Inc., 185 Berry St, Suite 550, San Francisco, CA 94107, USA / Stripe Payments Europe Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irland).
                </p>
                <p style={textStyle}>
                  Bei einem Zahlungsvorgang übermitteln wir Ihre Zahlungs- und Rechnungsdaten (Name, E-Mail, Zahlungsmitteldetails, Rechnungsadresse) an Stripe. Stripe verarbeitet diese Daten eigenverantwortlich zur Betrugsprävention und Zahlungsabwicklung. Kreditkartendaten werden ausschließlich bei Stripe gespeichert und sind für uns nicht einsehbar.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Datenschutzerklärung Stripe:{' '}
                  <a href="https://stripe.com/de/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#C9A84C', textDecoration: 'none' }}>stripe.com/de/privacy</a>
                </p>
              </div>
            </section>

            {/* 6. HubSpot */}
            <section id="hubspot">
              <h2 style={headingStyle}>6. HubSpot – CRM & Marketing</h2>
              <div style={cardStyle}>
                <div style={badgeRowStyle}>
                  <span style={providerBadge}>CRM-System</span>
                  <span style={providerBadge}>Auftragsverarbeitung</span>
                </div>
                <p style={textStyle}>
                  Wir setzen HubSpot (HubSpot Germany GmbH, Am Boscheler Berg 1, 52134 Herzogenrath, Deutschland; Muttergesellschaft: HubSpot Inc., One Canal Park, Cambridge, MA 02141, USA) zur Verwaltung von Kundenbeziehungen, E-Mail-Marketing und Lead-Management ein.
                </p>
                <p style={textStyle}>
                  Wenn Sie ein Kontaktformular ausfüllen, sich für unseren Newsletter anmelden oder anderweitig Kontakt aufnehmen, werden Ihre Daten (Name, E-Mail, Unternehmen, Interaktionen) in HubSpot gespeichert. Diese Daten werden genutzt, um Anfragen zu bearbeiten, Sie über relevante Angebote zu informieren und den Vertriebsprozess zu unterstützen.
                </p>
                <p style={textStyle}>
                  HubSpot verarbeitet Daten in unserem Auftrag auf Basis eines AVV. Für Datentransfers in die USA werden EU-Standardvertragsklauseln verwendet.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung bei Newsletter) bzw. Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse bei Vertriebskontakt). Sie können der Verarbeitung jederzeit widersprechen. Datenschutzerklärung HubSpot:{' '}
                  <a href="https://legal.hubspot.com/de/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#C9A84C', textDecoration: 'none' }}>legal.hubspot.com/de/privacy-policy</a>
                </p>
              </div>
            </section>

            {/* 7. KI-Training */}
            <section id="ki-training">
              <h2 style={headingStyle}>7. Nutzung von Daten für KI-Training</h2>
              <div style={{ ...cardStyle, borderColor: '#C9A84C', borderWidth: '1.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '40px', height: '40px', background: '#0A1628', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase' }}>KI-Training Einwilligung</span>
                </div>
                <p style={textStyle}>
                  Gaspar AI Consulting und ARGONAUT OS setzen KI-Modelle ein, um unsere Dienstleistungen kontinuierlich zu verbessern. Mit Ihrer ausdrücklichen Einwilligung können anonymisierte Nutzungsdaten aus Ihrer Verwendung von ARGONAUT OS – insbesondere Workflow-Strukturen, Konfigurationen und Interaktionsmuster – zur Verbesserung und zum Training unserer KI-Modelle verwendet werden.
                </p>
                <div style={{ padding: '16px 20px', background: '#faf9f6', borderRadius: '8px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '14px', color: '#0A1628', fontWeight: 600, marginBottom: '8px' }}>Dies gilt ausdrücklich:</p>
                  <ul style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[
                      'Nur mit Ihrer aktiven, jederzeit widerrufbaren Einwilligung',
                      'Ausschließlich in vollständig anonymisierter und aggregierter Form',
                      'Keine Weitergabe personenbezogener Daten an KI-Drittanbieter',
                      'Keine Rückschlüsse auf Ihre Person oder Ihr Unternehmen möglich',
                    ].map((item) => (
                      <li key={item} style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.7 }}>{item}</li>
                    ))}
                  </ul>
                </div>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung). Sie können Ihre Einwilligung jederzeit ohne Angabe von Gründen in Ihren Kontoeinstellungen oder per E-Mail an{' '}
                  <a href="mailto:martin@gasparaiconsulting.de" style={{ color: '#C9A84C', textDecoration: 'none' }}>martin@gasparaiconsulting.de</a>{' '}
                  widerrufen, ohne dass Ihnen dadurch Nachteile entstehen.
                </p>
              </div>
            </section>

            {/* 8. Rechte */}
            <section id="rechte">
              <h2 style={headingStyle}>8. Ihre Rechte als betroffene Person</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  Gemäß DSGVO stehen Ihnen folgende Rechte zu. Zur Ausübung dieser Rechte wenden Sie sich an:{' '}
                  <a href="mailto:martin@gasparaiconsulting.de" style={{ color: '#C9A84C', textDecoration: 'none' }}>martin@gasparaiconsulting.de</a>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginTop: '16px' }}>
                  {[
                    { art: 'Art. 15 DSGVO', title: 'Auskunftsrecht', desc: 'Sie haben das Recht, Auskunft über die zu Ihrer Person gespeicherten Daten zu erhalten.' },
                    { art: 'Art. 16 DSGVO', title: 'Berichtigungsrecht', desc: 'Sie können die Berichtigung unrichtiger oder Vervollständigung unvollständiger Daten verlangen.' },
                    { art: 'Art. 17 DSGVO', title: 'Recht auf Löschung', desc: 'Sie können die Löschung Ihrer personenbezogenen Daten verlangen, soweit keine gesetzlichen Aufbewahrungspflichten bestehen.' },
                    { art: 'Art. 18 DSGVO', title: 'Einschränkung der Verarbeitung', desc: 'Sie können die Einschränkung der Verarbeitung Ihrer personenbezogenen Daten verlangen.' },
                    { art: 'Art. 20 DSGVO', title: 'Datenübertragbarkeit', desc: 'Sie haben das Recht, Ihre Daten in einem gängigen, maschinenlesbaren Format zu erhalten oder an einen Dritten übermitteln zu lassen.' },
                    { art: 'Art. 21 DSGVO', title: 'Widerspruchsrecht', desc: 'Sie können der Verarbeitung Ihrer Daten auf Basis berechtigter Interessen jederzeit widersprechen.' },
                    { art: 'Art. 7 DSGVO', title: 'Widerruf von Einwilligungen', desc: 'Sie können erteilte Einwilligungen jederzeit mit Wirkung für die Zukunft widerrufen.' },
                    { art: 'Art. 77 DSGVO', title: 'Beschwerderecht', desc: 'Sie haben das Recht, bei der zuständigen Aufsichtsbehörde Beschwerde einzulegen. Zuständig: Landesbeauftragter für den Datenschutz und die Informationsfreiheit Baden-Württemberg.' },
                  ].map(({ art, title, desc }) => (
                    <div key={title} style={{ padding: '16px', background: '#faf9f6', borderRadius: '8px', borderTop: '2px solid #C9A84C' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.08em' }}>{art}</span>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#0A1628', margin: '6px 0 8px' }}>{title}</p>
                      <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Aktualität */}
            <div style={{ padding: '20px 24px', background: '#0A1628', borderRadius: '12px', color: '#9ca3af', fontSize: '13px', lineHeight: 1.7 }}>
              Diese Datenschutzerklärung ist aktuell gültig und hat den Stand Mai 2025. Durch die Weiterentwicklung unserer Website und Angebote oder aufgrund geänderter gesetzlicher bzw. behördlicher Vorgaben kann es notwendig werden, diese Datenschutzerklärung zu ändern. Die aktuelle Datenschutzerklärung kann jederzeit auf dieser Seite abgerufen und ausgedruckt werden.
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              {[
                { label: '← Impressum', href: '/impressum' },
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
        </div>
      </main>
      <Footer />
    </>
  )
}

const headingStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#0A1628',
  marginBottom: '20px',
  paddingBottom: '12px',
  borderBottom: '2px solid #C9A84C',
  display: 'inline-block',
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '28px 32px',
}

const textStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#6b7280',
  lineHeight: 1.8,
  marginBottom: '12px',
}

const badgeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '16px',
  flexWrap: 'wrap',
}

const providerBadge: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#0A1628',
  background: '#f3f4f6',
  padding: '3px 10px',
  borderRadius: '20px',
  letterSpacing: '0.05em',
}
