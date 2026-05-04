'use client'

import Link from 'next/link'
import { useState } from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const sections = [
  { id: 'gegenstand', label: '§ 1 Gegenstand & Leistungen' },
  { id: 'vertragsschluss', label: '§ 2 Vertragsschluss' },
  { id: 'preise', label: '§ 3 Preise & Tarife' },
  { id: 'zahlung', label: '§ 4 Zahlung & SEPA' },
  { id: 'laufzeit', label: '§ 5 Laufzeit & Kündigung' },
  { id: 'leistungsumfang', label: '§ 6 Leistungsumfang & SLA' },
  { id: 'nutzungsrechte', label: '§ 7 Nutzungsrechte' },
  { id: 'ki-training', label: '§ 8 KI-Training & Daten' },
  { id: 'haftung', label: '§ 9 Haftungsbeschränkung' },
  { id: 'datenschutz', label: '§ 10 Datenschutz' },
  { id: 'schluss', label: '§ 11 Schlussbestimmungen' },
]

const tarife = [
  { name: 'Starter', paket: '1.500', gesamt: '3.000', agents: '3 KI-Agenten', workflows: '15 Workflows', users: '10 Nutzer', support: 'E-Mail & Chat-Support', highlight: false },
  { name: 'Professional', paket: '2.500', gesamt: '4.000', agents: '8 KI-Agenten', workflows: '50 Workflows', users: '25 Nutzer', support: 'Prioritäts-Support', highlight: true },
  { name: 'Business', paket: '4.500', gesamt: '6.000', agents: '20 KI-Agenten', workflows: 'Unbegrenzt', users: '100 Nutzer', support: 'Dedicated Manager', highlight: false },
  { name: 'Enterprise', paket: '7.500', gesamt: '9.000', agents: 'Unbegrenzt', workflows: 'Unbegrenzt', users: 'Unbegrenzt', support: 'SLA + On-Site', highlight: false },
]

export default function AGB() {
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
              Allgemeine Geschäftsbedingungen
            </h1>
            <p style={{ fontSize: '15px', color: '#9ca3af', margin: 0 }}>
              ARGONAUT OS SaaS · Gaspar AI Consulting · Stand: Mai 2025
            </p>
          </div>
        </div>

        {/* Intro Banner */}
        <div style={{ background: '#C9A84C', padding: '20px 48px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <p style={{ fontSize: '13px', color: '#0A1628', fontWeight: 600, margin: 0, lineHeight: 1.6 }}>
              Diese AGB gelten für alle Verträge zwischen Gaspar AI Consulting (Martin Gaspar, Böblingen) und gewerblichen Kunden über die Nutzung der SaaS-Plattform ARGONAUT OS. Es gelten ausschließlich diese AGB; abweichende Bedingungen des Kunden werden nicht anerkannt.
            </p>
          </div>
        </div>

        {/* Layout */}
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '64px 48px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: '48px', alignItems: 'start' }}>

          {/* TOC */}
          <aside style={{ position: 'sticky', top: '100px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#0A1628', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Inhalt
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {sections.map(({ id, label }) => (
                <button key={id} onClick={() => scrollTo(id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    padding: '7px 10px', borderRadius: '6px', fontSize: '12px',
                    color: activeSection === id ? '#C9A84C' : '#6b7280',
                    fontWeight: activeSection === id ? 700 : 400,
                    borderLeft: activeSection === id ? '2px solid #C9A84C' : '2px solid transparent',
                    transition: 'all 0.15s', lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => { if (activeSection !== id) e.currentTarget.style.color = '#0A1628' }}
                  onMouseLeave={(e) => { if (activeSection !== id) e.currentTarget.style.color = '#6b7280' }}
                >{label}</button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

            {/* § 1 Gegenstand */}
            <section id="gegenstand">
              <h2 style={headingStyle}>§ 1 Gegenstand & Leistungen</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>1.1</strong> Gaspar AI Consulting (nachfolgend „Anbieter") betreibt die KI-Automatisierungsplattform ARGONAUT OS (nachfolgend „Plattform") und stellt diese gewerblichen Unternehmen (nachfolgend „Kunde") als Software-as-a-Service (SaaS) zur Verfügung.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>1.2</strong> Die Plattform umfasst insbesondere:
                </p>
                <ul style={{ margin: '0 0 16px', padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    'KI-gestützte Prozessautomatisierung und Workflow-Management',
                    'Intelligente KI-Agenten zur Automatisierung operativer Aufgaben',
                    'Integration in bestehende Unternehmenssysteme (CRM, ERP, E-Mail, WhatsApp)',
                    'Datenanalyse, Reporting und KI-Auswertungen',
                    'Dashboard und Verwaltungsoberfläche für alle gebuchten KI-Agenten',
                    'Technischer Support gemäß gewähltem Tarif',
                  ].map((item) => (
                    <li key={item} style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.7 }}>{item}</li>
                  ))}
                </ul>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>1.3</strong> Der genaue Leistungsumfang richtet sich nach dem vom Kunden gewählten Tarif (§ 3) und dem jeweiligen Auftragsformular. Individuelle Implementierungs- und Beratungsleistungen werden separat vereinbart.
                </p>
              </div>
            </section>

            {/* § 2 Vertragsschluss */}
            <section id="vertragsschluss">
              <h2 style={headingStyle}>§ 2 Vertragsschluss</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>2.1</strong> Der Vertrag kommt zustande durch die Registrierung auf der ARGONAUT OS Plattform, die Auswahl eines Tarifs und die Bestätigung des Auftrags (Angebot des Kunden) sowie der anschließenden Auftragsbestätigung durch den Anbieter per E-Mail (Annahme).
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>2.2</strong> Der Anbieter bietet Leistungen ausschließlich für Unternehmen, Gewerbetreibende, Freiberufler und Behörden an (B2B). Vertragsabschlüsse mit Verbrauchern (§ 13 BGB) sind ausgeschlossen.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>2.3</strong> Mit dem Vertragsschluss erkennt der Kunde diese AGB in der zum Zeitpunkt des Vertragsschlusses gültigen Fassung an. Änderungen der AGB werden dem Kunden mindestens 30 Tage vor Inkrafttreten schriftlich oder per E-Mail mitgeteilt.
                </p>
              </div>
            </section>

            {/* § 3 Preise */}
            <section id="preise">
              <h2 style={headingStyle}>§ 3 Preise & Tarife</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>3.1</strong> Alle Preise verstehen sich als Nettopreise in Euro (EUR) zuzüglich der gesetzlichen Mehrwertsteuer (derzeit 19 % MwSt.). Die Vergütungsstruktur besteht aus zwei verpflichtenden Komponenten:
                </p>

                {/* Basis fee callout */}
                <div style={{ padding: '16px 20px', background: '#0A1628', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Pflichtkomponente (alle Kunden)</span>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: '#ffffff' }}>Basis-Automatisierungen</span>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: '#C9A84C' }}>1.500 €</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af', display: 'block' }}>/Monat netto</span>
                  </div>
                </div>
                <p style={{ ...textStyle, marginBottom: '16px' }}>
                  <strong style={{ color: '#0A1628' }}>Zusätzlich</strong> wählt der Kunde eines der folgenden Pakete (Paketpreis + Basis = Gesamtpreis):
                </p>

                {/* Pricing Table */}
                <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#0A1628' }}>
                        {['Paket', 'Paketpreis/Monat', '+ Basis 1.500 €', 'Gesamt/Monat (netto)', 'KI-Agenten', 'Workflows', 'Support'].map((h) => (
                          <th key={h} style={{ padding: '12px 16px', color: '#C9A84C', fontWeight: 700, textAlign: 'left', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tarife.map((t, i) => (
                        <tr key={t.name} style={{ background: t.highlight ? '#fef3c7' : i % 2 === 0 ? '#ffffff' : '#faf9f6', borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0A1628' }}>
                            {t.highlight && <span style={{ fontSize: '10px', fontWeight: 700, color: '#ffffff', background: '#C9A84C', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>BELIEBT</span>}
                            {t.name}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0A1628' }}>{t.paket} €</td>
                          <td style={{ padding: '12px 16px', color: '#6b7280' }}>1.500 €</td>
                          <td style={{ padding: '12px 16px', fontWeight: 900, color: '#0A1628', fontSize: '14px' }}>{t.gesamt} €</td>
                          <td style={{ padding: '12px 16px', color: '#374151' }}>{t.agents}</td>
                          <td style={{ padding: '12px 16px', color: '#374151' }}>{t.workflows}</td>
                          <td style={{ padding: '12px 16px', color: '#374151' }}>{t.support}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>3.2</strong> Individuelle Implementierungsleistungen, Custom-Integrationen sowie Beratungsprojekte werden gesondert auf Basis eines Angebots abgerechnet und sind nicht im monatlichen Grundentgelt enthalten.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>3.3</strong> Der Anbieter behält sich das Recht vor, Preise mit einer Ankündigungsfrist von 60 Tagen zum Ende des nächsten Abrechnungszeitraums anzupassen. Der Kunde hat in diesem Fall ein Sonderkündigungsrecht bis zum Inkrafttreten der Preisänderung.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>3.4</strong> Tarifwechsel sind jederzeit möglich. Upgrades werden anteilig zum nächsten Abrechnungszeitraum wirksam; Downgrades werden zum Beginn des nächsten vollständigen Abrechnungszeitraums wirksam.
                </p>
              </div>
            </section>

            {/* § 4 Zahlung */}
            <section id="zahlung">
              <h2 style={headingStyle}>§ 4 Zahlung & SEPA-Lastschrift</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>4.1</strong> Die Zahlung erfolgt monatlich im Voraus. Der Rechnungsbetrag wird jeweils zum 1. des Monats fällig.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>4.2</strong> Die bevorzugte Zahlungsweise ist das SEPA-Lastschriftverfahren. Mit Erteilung des SEPA-Lastschriftmandats ermächtigt der Kunde den Anbieter, monatliche Zahlungen von seinem Konto einzuziehen. Die Vorankündigungsfrist (Pre-notification) beträgt 5 Kalendertage.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>4.3</strong> Alternativ werden Zahlungen per Kreditkarte (Visa, Mastercard) und SEPA-Überweisung akzeptiert. Die Zahlungsabwicklung erfolgt über Stripe (vgl. Datenschutzerklärung § 5).
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>4.4</strong> Bei Zahlungsverzug ist der Anbieter berechtigt, nach Mahnung die Leistungen vorübergehend zu sperren. Verzugszinsen werden gemäß § 288 BGB berechnet (Geschäftsverkehr: 9 Prozentpunkte über dem Basiszinssatz).
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>4.5</strong> Rechnungen werden ausschließlich elektronisch per E-Mail in PDF-Format übermittelt. Der Kunde erklärt sich mit der elektronischen Rechnungsstellung einverstanden.
                </p>
              </div>
            </section>

            {/* § 5 Laufzeit */}
            <section id="laufzeit">
              <h2 style={headingStyle}>§ 5 Vertragslaufzeit & Kündigung</h2>
              <div style={cardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {[
                    { label: 'Mindestlaufzeit', value: '1 Monat', icon: '📅' },
                    { label: 'Verlängerung', value: 'Automatisch um 1 Monat', icon: '🔄' },
                    { label: 'Kündigungsfrist', value: '30 Tage zum Monatsende', icon: '📋' },
                  ].map(({ label, value, icon }) => (
                    <div key={label} style={{ padding: '20px', background: '#0A1628', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
                      <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</p>
                      <p style={{ fontSize: '15px', color: '#C9A84C', fontWeight: 700, margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>5.1</strong> Der Vertrag wird auf unbestimmte Zeit geschlossen und läuft monatlich. Er verlängert sich automatisch um jeweils einen Monat, wenn er nicht rechtzeitig gekündigt wird.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>5.2</strong> Die Kündigung muss spätestens 30 Tage vor Ende des laufenden Abrechnungszeitraums schriftlich (E-Mail genügt) beim Anbieter eingehen. Eine Kündigung über das Dashboard ist ebenfalls möglich.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>5.3</strong> Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Ein wichtiger Grund auf Seiten des Anbieters liegt insbesondere vor, wenn der Kunde mit mehr als zwei Monatsentgelten in Zahlungsverzug gerät.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>5.4</strong> Nach Vertragsende erhält der Kunde eine 30-tägige Frist, um seine Daten zu exportieren. Danach werden alle Kundendaten unwiderruflich gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten bestehen.
                </p>
              </div>
            </section>

            {/* § 6 Leistungsumfang */}
            <section id="leistungsumfang">
              <h2 style={headingStyle}>§ 6 Leistungsumfang & Verfügbarkeit</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>6.1</strong> Der Anbieter stellt die Plattform mit einer angestrebten Verfügbarkeit von 99,0 % im monatlichen Durchschnitt bereit (ausgenommen geplante Wartungsfenster und höhere Gewalt).
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>6.2</strong> Geplante Wartungsarbeiten werden, soweit möglich, mindestens 24 Stunden im Voraus angekündigt und außerhalb der üblichen Geschäftszeiten (Mo–Fr, 9–18 Uhr MEZ) durchgeführt.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>6.3</strong> Der Anbieter behält sich das Recht vor, die Plattform weiterzuentwickeln, Features zu ändern oder einzustellen, sofern die wesentliche Funktionalität erhalten bleibt. Wesentliche Änderungen werden dem Kunden mit 30 Tagen Vorlauf mitgeteilt.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>6.4</strong> Der Kunde ist für die Bereitstellung geeigneter Hardware, Internetverbindung und kompatiblen Browsers verantwortlich.
                </p>
              </div>
            </section>

            {/* § 7 Nutzungsrechte */}
            <section id="nutzungsrechte">
              <h2 style={headingStyle}>§ 7 Nutzungsrechte & Pflichten</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>7.1</strong> Der Anbieter räumt dem Kunden für die Dauer des Vertrags ein einfaches, nicht übertragbares, nicht unterlizenzierbares Nutzungsrecht an der Plattform gemäß dem jeweiligen Tarif ein.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>7.2</strong> Der Kunde darf die Plattform nicht: (a) reverse engineeren, dekompilieren oder disassemblieren; (b) für illegale Zwecke nutzen; (c) Zugangsdaten an Dritte außerhalb seiner Organisation weitergeben; (d) automatisierte Massenanfragen stellen, die die Infrastruktur übermäßig belasten.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>7.3</strong> Der Kunde bleibt Eigentümer seiner in die Plattform eingespeisten Daten und Inhalte. Er gewährt dem Anbieter ein beschränktes Recht zur Verarbeitung dieser Daten, soweit dies zur Erbringung der Leistungen erforderlich ist.
                </p>
              </div>
            </section>

            {/* § 8 KI-Training */}
            <section id="ki-training">
              <h2 style={headingStyle}>§ 8 KI-Training & Datennutzung</h2>
              <div style={{ ...cardStyle, borderColor: '#C9A84C', borderWidth: '1.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ width: '40px', height: '40px', background: '#0A1628', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Einwilligungsklausel KI-Training</span>
                </div>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>8.1</strong> Der Anbieter kann Nutzungsdaten des Kunden zur Verbesserung seiner KI-Modelle und Algorithmen verwenden. Dies erfolgt <strong style={{ color: '#0A1628' }}>ausschließlich auf Basis der ausdrücklichen, schriftlichen Einwilligung des Kunden</strong> und nur in vollständig anonymisierter und aggregierter Form.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>8.2</strong> Ohne Einwilligung werden keinerlei Kundendaten für KI-Trainingsmaßnahmen verwendet. Die Einwilligung ist optional und hat keinen Einfluss auf den Leistungsumfang oder den Preis.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>8.3</strong> Bei Einwilligung gilt: (a) Alle Daten werden vor der Verwendung vollständig anonymisiert; (b) Eine Rückführung auf den Kunden oder einzelne Nutzer ist technisch ausgeschlossen; (c) Keine Weitergabe von Rohdaten an Dritte; (d) Nur strukturelle Muster (Workflow-Typen, Konfigurationsmuster) werden genutzt – keine Inhalte oder Geschäftsdaten.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>8.4</strong> Die Einwilligung kann jederzeit ohne Angabe von Gründen mit Wirkung für die Zukunft widerrufen werden (Dashboard → Einstellungen → Datenschutz oder per E-Mail). Der Widerruf berührt die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung nicht.
                </p>
              </div>
            </section>

            {/* § 9 Haftung */}
            <section id="haftung">
              <h2 style={headingStyle}>§ 9 Haftungsbeschränkung</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>9.1</strong> Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie für vorsätzlich oder grob fahrlässig verursachte Schäden und bei Übernahme einer Garantie.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>9.2</strong> Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten (Kardinalspflichten) ist die Haftung auf den vertragstypisch vorhersehbaren Schaden begrenzt. Diese beträgt maximal das 3-fache des in den letzten 12 Monaten vom Kunden gezahlten Nettoentgelts.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>9.3</strong> Für leicht fahrlässige Verletzung nicht wesentlicher Vertragspflichten ist die Haftung des Anbieters ausgeschlossen.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>9.4</strong> Der Anbieter übernimmt keine Haftung für: (a) Datenverluste, die durch unzureichende Datensicherung des Kunden entstehen; (b) Schäden durch unsachgemäße Nutzung der Plattform; (c) Ausfälle von Drittanbieterdiensten (z. B. Stripe, Supabase, HubSpot) außerhalb des Einflussbereichs des Anbieters.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>9.5</strong> Die KI-Ausgaben der Plattform sind als Unterstützungswerkzeug zu verstehen und ersetzen keine Rechts-, Finanz- oder Fachberatung. Der Kunde ist für die Überprüfung und Verwendung von KI-generierten Inhalten eigenverantwortlich.
                </p>
              </div>
            </section>

            {/* § 10 Datenschutz */}
            <section id="datenschutz">
              <h2 style={headingStyle}>§ 10 Datenschutz</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>10.1</strong> Beide Parteien verpflichten sich zur Einhaltung der geltenden Datenschutzgesetze, insbesondere der DSGVO (EU) 2016/679 und des BDSG.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>10.2</strong> Soweit der Anbieter personenbezogene Daten im Auftrag des Kunden verarbeitet, wird ein separater Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO abgeschlossen.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>10.3</strong> Einzelheiten zur Datenverarbeitung sind der{' '}
                  <Link href="/datenschutz" style={{ color: '#C9A84C', textDecoration: 'none', fontWeight: 600 }}>Datenschutzerklärung</Link>{' '}
                  zu entnehmen.
                </p>
              </div>
            </section>

            {/* § 11 Schluss */}
            <section id="schluss">
              <h2 style={headingStyle}>§ 11 Schlussbestimmungen</h2>
              <div style={cardStyle}>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>11.1 Anwendbares Recht:</strong> Es gilt ausschließlich das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG).
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>11.2 Gerichtsstand:</strong> Ausschließlicher Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesem Vertrag ist – sofern der Kunde Vollkaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen ist – Stuttgart. Der Anbieter ist berechtigt, den Kunden auch an seinem allgemeinen Gerichtsstand zu verklagen.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>11.3 Schriftform:</strong> Änderungen und Ergänzungen dieser AGB bedürfen der Textform (E-Mail genügt). Mündliche Nebenabreden haben keine Gültigkeit.
                </p>
                <p style={textStyle}>
                  <strong style={{ color: '#0A1628' }}>11.4 Salvatorische Klausel:</strong> Sollten einzelne Bestimmungen dieser AGB unwirksam oder undurchführbar sein oder werden, berührt dies die Wirksamkeit der übrigen Bestimmungen nicht. An Stelle der unwirksamen Bestimmung tritt eine wirksame Regelung, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung am nächsten kommt.
                </p>
                <p style={{ ...textStyle, marginBottom: 0 }}>
                  <strong style={{ color: '#0A1628' }}>11.5 Abtretungsverbot:</strong> Der Kunde darf Rechte und Pflichten aus diesem Vertrag nur mit vorheriger schriftlicher Zustimmung des Anbieters an Dritte abtreten.
                </p>
              </div>
            </section>

            {/* Footer Info */}
            <div style={{ padding: '24px 28px', background: '#0A1628', borderRadius: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                {[
                  { label: 'Anbieter', value: 'Gaspar AI Consulting\nMartin Gaspar' },
                  { label: 'Adresse', value: '[Straße]\n71132 Böblingen, Deutschland' },
                  { label: 'Kontakt', value: 'martin@gasparaiconsulting.de' },
                  { label: 'Stand', value: 'Mai 2025' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</p>
                    <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0, whiteSpace: 'pre-line', lineHeight: 1.6 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              {[
                { label: '← Datenschutzerklärung', href: '/datenschutz' },
                { label: 'Impressum →', href: '/impressum' },
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
