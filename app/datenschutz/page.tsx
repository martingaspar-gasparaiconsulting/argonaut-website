'use client'
import { useState } from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const sections = [
  { id: 'verantwortlicher', label: '§ 1 Verantwortlicher' },
  { id: 'erhebung', label: '§ 2 Erhebung & Verarbeitung' },
  { id: 'zwecke', label: '§ 3 Zwecke & Rechtsgrundlagen' },
  { id: 'speicherung', label: '§ 4 Speicherdauer' },
  { id: 'weitergabe', label: '§ 5 Datenweitergabe' },
  { id: 'ki-training', label: '§ 6 KI-Training & Nutzungsdaten' },
  { id: 'overuse', label: '§ 7 Verbrauchsdaten & Abrechnung' },
  { id: 'cookies', label: '§ 8 Cookies & Tracking' },
  { id: 'rechte', label: '§ 9 Ihre Rechte' },
  { id: 'sicherheit', label: '§ 10 Datensicherheit' },
  { id: 'drittanbieter', label: '§ 11 Drittanbieter' },
  { id: 'aenderungen', label: '§ 12 Änderungen' },
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

        <div style={{ background: '#0A1628', padding: '80px 48px 60px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ color: '#C9A84C', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px' }}>Rechtliches</div>
            <h1 style={{ color: '#FFFFFF', fontSize: '42px', fontWeight: '700', marginBottom: '16px', fontFamily: 'Syne, sans-serif' }}>Datenschutzerklärung</h1>
            <p style={{ color: '#94a3b8', fontSize: '16px', lineHeight: '1.7' }}>
              ARGONAUT OS — Gaspar AI Consulting, Martin Gaspar, Böblingen<br />
              Stand: Juni 2026 | Gemäß DSGVO und BDSG
            </p>
          </div>
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '48px', alignItems: 'start' }}>

          <div style={{ position: 'sticky', top: '24px', background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '16px' }}>Inhaltsverzeichnis</div>
            {sections.map((s) => (
              <button key={s.id} onClick={() => scrollTo(s.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', background: activeSection === s.id ? '#0A1628' : 'transparent', color: activeSection === s.id ? '#C9A84C' : '#374151', fontWeight: activeSection === s.id ? '600' : '400', transition: 'all 0.2s' }}>
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '48px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>

            <section id="verantwortlicher" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 1 Verantwortlicher</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>Verantwortlicher im Sinne der DSGVO ist:</p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '12px' }}>
                <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.8', margin: 0 }}>
                  <strong>Gaspar AI Consulting</strong><br />
                  Martin Gaspar<br />
                  Böblingen, Baden-Württemberg, Deutschland<br />
                  E-Mail: info@argonaut-os.com<br />
                  Web: argonaut-os.com
                </p>
              </div>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>Bei Fragen zum Datenschutz wenden Sie sich jederzeit per E-Mail an info@argonaut-os.com.</p>
            </section>

            <section id="erhebung" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 2 Erhebung & Verarbeitung personenbezogener Daten</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>Wir verarbeiten folgende personenbezogene Daten:</p>
              <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#0A1628', color: '#FFFFFF' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Datenkategorie</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Beispiele</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Quelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Stammdaten', 'Name, Firmenname, E-Mail, Adresse', 'Registrierung / Buchung'],
                      ['Zahlungsdaten', 'Zahlungsmethode, Transaktions-ID', 'Stripe (verschlüsselt)'],
                      ['Nutzungsdaten', 'Login-Zeiten, Workflow-Aktivitäten, KI-Call-Verbrauch', 'Automatisch beim Nutzen der Plattform'],
                      ['Kommunikationsdaten', 'E-Mail-Inhalte, Support-Anfragen', 'Direktkontakt'],
                      ['Technische Daten', 'IP-Adresse, Browser, Geräteinformationen', 'Automatisch beim Websitebesuch'],
                    ].map(([kat, bsp, quelle], i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#FFFFFF', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '600', color: '#0A1628' }}>{kat}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{bsp}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{quelle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="zwecke" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 3 Zwecke & Rechtsgrundlagen</h2>
              <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#0A1628', color: '#FFFFFF' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Zweck</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Rechtsgrundlage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Vertragserfüllung (Zugang, Abrechnung, Support)', 'Art. 6 Abs. 1 lit. b DSGVO'],
                      ['Rechnungsstellung und Buchhaltung', 'Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Pflicht)'],
                      ['Overuse-Abrechnung (KI-Call-Überschreitung)', 'Art. 6 Abs. 1 lit. b DSGVO'],
                      ['KI-Training mit anonymisierten Daten', 'Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)'],
                      ['Sicherheit und Missbrauchsprävention', 'Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)'],
                      ['Newsletter und Marketing (nur mit Einwilligung)', 'Art. 6 Abs. 1 lit. a DSGVO'],
                    ].map(([zweck, grund], i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#FFFFFF', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{zweck}</td>
                        <td style={{ padding: '12px 16px', color: '#0A1628', fontWeight: '600' }}>{grund}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="speicherung" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 4 Speicherdauer</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>4.1 Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>4.2 Rechnungen und Buchungsdaten werden gemäß § 147 AO und § 257 HGB für 10 Jahre aufbewahrt.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>4.3 Nutzungsdaten (Login, Verbrauch) werden 24 Monate nach Vertragsende gelöscht.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>4.4 Nach Kündigung wird der Zugang zur Plattform deaktiviert. Kundendaten werden auf Anfrage innerhalb von 30 Tagen gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>
            </section>

            <section id="weitergabe" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 5 Datenweitergabe an Dritte</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '16px' }}>Wir geben Daten nur in folgenden Fällen weiter:</p>
              <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#0A1628', color: '#FFFFFF' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Empfänger</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Zweck</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Rechtsgrundlage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Stripe Inc.', 'Zahlungsabwicklung', 'Art. 6 Abs. 1 lit. b DSGVO'],
                      ['Lexoffice (Haufe)', 'Rechnungsstellung & Buchhaltung', 'Art. 6 Abs. 1 lit. c DSGVO'],
                      ['Supabase Inc.', 'Datenbankhosting (verschlüsselt, EU-North-1 Stockholm)', 'Art. 6 Abs. 1 lit. b DSGVO'],
                      ['Vercel Inc.', 'Website-Hosting', 'Art. 6 Abs. 1 lit. f DSGVO'],
                      ['Anthropic PBC', 'KI-API für Agenten & Workflow-Ausführung (anonymisiert, USA)', 'Art. 6 Abs. 1 lit. b DSGVO, SCC gemäß Art. 46 DSGVO'],
                      ['Voyage AI Inc.', 'Embedding-API für Dokumentensuche & RAG (anonymisierte Chunks, USA)', 'Art. 6 Abs. 1 lit. b DSGVO, SCC gemäß Art. 46 DSGVO'],
                      ['n8n GmbH', 'Workflow-Automatisierungsplattform (selbstgehostet)', 'Art. 6 Abs. 1 lit. b DSGVO'],
                    ].map(([emp, zweck, grund], i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#FFFFFF', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '600', color: '#0A1628' }}>{emp}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{zweck}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{grund}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>Eine Weitergabe an weitere Dritte oder für Werbezwecke findet nicht statt.</p>
            </section>

            <section id="ki-training" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 6 KI-Training & Nutzungsdaten</h2>
              <div style={{ background: '#fef9ee', border: '1px solid #C9A84C', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px' }}>
                <p style={{ color: '#0A1628', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Wichtiger Hinweis</p>
                <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.7', margin: 0 }}>Personenbezogene Daten werden niemals für KI-Training verwendet. Nur vollständig anonymisierte, nicht personenbezogene Nutzungsmuster fließen in die Modellverbesserung ein.</p>
              </div>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>6.1 Mit der Nutzung von ARGONAUT OS stimmt der Kunde zu, dass anonymisierte, nicht personenbezogene Nutzungsdaten (z. B. Workflow-Strukturen, Automatisierungsmuster, Interaktionsdaten) zur Verbesserung und zum Training von ARGONAUT OS KI-Modellen verwendet werden dürfen.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>6.2 Die Anonymisierung erfolgt automatisch vor jeder Verwendung zu Trainingszwecken. Eine Rückführung auf einzelne Personen oder Unternehmen ist technisch ausgeschlossen.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>6.3 Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>6.4 Der Widerspruch gegen die Verwendung zu Trainingszwecken ist jederzeit möglich per E-Mail an info@argonaut-os.com. Der Widerspruch gilt für zukünftige Daten.</p>
            </section>

            <section id="overuse" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 7 Verbrauchsdaten & Overuse-Abrechnung</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>7.1 ARGONAUT OS erfasst automatisch den monatlichen KI-Call-Verbrauch jedes Kunden zur Abrechnung gemäß den Fair-Use-Kontingenten (siehe AGB § 9).</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>7.2 Der aktuelle Verbrauch ist jederzeit im persönlichen Dashboard einsehbar. Transparenz über den eigenen Datenverbrauch ist ein Kernprinzip von ARGONAUT OS.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>7.3 Bei Überschreitung des inkludierten Kontingents wird der Kunde per E-Mail informiert (bei 80 % und bei 100 %). Overuse-Gebühren werden im Folgemonat automatisch eingezogen.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>7.4 Rechtsgrundlage der Verbrauchserfassung ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).</p>
            </section>

            <section id="cookies" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 8 Cookies & Tracking</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>8.1 Wir verwenden technisch notwendige Cookies für den Betrieb der Plattform (Session-Cookies, Authentifizierung). Diese Cookies sind für die Funktionsfähigkeit der Website erforderlich und können nicht deaktiviert werden.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>8.2 Analyse- oder Werbe-Cookies setzen wir nur mit Ihrer ausdrücklichen Einwilligung ein.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>8.3 Rechtsgrundlage für technisch notwendige Cookies ist Art. 6 Abs. 1 lit. f DSGVO. Für optionale Cookies ist Art. 6 Abs. 1 lit. a DSGVO die Rechtsgrundlage.</p>
            </section>

            <section id="rechte" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 9 Ihre Rechte</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '16px' }}>Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:</p>
              {[
                ['Auskunft (Art. 15 DSGVO)', 'Sie können jederzeit Auskunft über die zu Ihrer Person gespeicherten Daten verlangen.'],
                ['Berichtigung (Art. 16 DSGVO)', 'Sie können die Berichtigung unrichtiger Daten verlangen.'],
                ['Löschung (Art. 17 DSGVO)', 'Sie können die Löschung Ihrer Daten verlangen, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.'],
                ['Einschränkung (Art. 18 DSGVO)', 'Sie können die Einschränkung der Verarbeitung Ihrer Daten verlangen.'],
                ['Datenübertragbarkeit (Art. 20 DSGVO)', 'Sie können Ihre Daten in einem maschinenlesbaren Format herausverlangen.'],
                ['Widerspruch (Art. 21 DSGVO)', 'Sie können der Verarbeitung Ihrer Daten auf Basis berechtigter Interessen widersprechen.'],
                ['Widerruf (Art. 7 Abs. 3 DSGVO)', 'Sie können eine erteilte Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen.'],
                ['Beschwerde', 'Sie haben das Recht, sich bei der zuständigen Datenschutzaufsichtsbehörde zu beschweren (Landesbeauftragte für Datenschutz Baden-Württemberg).'],
              ].map(([recht, beschreibung], i) => (
                <div key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#FFFFFF', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', marginBottom: '8px' }}>
                  <p style={{ color: '#0A1628', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>{recht}</p>
                  <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.7', margin: 0 }}>{beschreibung}</p>
                </div>
              ))}
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginTop: '16px' }}>Zur Ausübung Ihrer Rechte wenden Sie sich an: info@argonaut-os.com</p>
            </section>

            <section id="sicherheit" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 10 Datensicherheit</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>10.1 Wir verwenden SSL/TLS-Verschlüsselung für alle Datenübertragungen. Alle Datenbankverbindungen sind verschlüsselt.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>10.2 Zahlungsdaten werden ausschließlich durch Stripe verarbeitet und niemals auf unseren Servern gespeichert. Stripe ist PCI-DSS-zertifiziert.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>10.3 Zugangsdaten werden mit modernen Hashing-Verfahren (bcrypt) gespeichert. Passwörter sind niemals im Klartext gespeichert.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>10.4 Bei Sicherheitsvorfällen informieren wir betroffene Kunden und die zuständige Aufsichtsbehörde innerhalb von 72 Stunden gemäß Art. 33 DSGVO.</p>
            </section>

            <section id="drittanbieter" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 11 Drittanbieter & internationale Übermittlungen</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>11.1 Einige unserer Dienstleister (Stripe, Supabase, Vercel, Anthropic, Voyage AI) haben ihren Sitz in den USA. Die Datenübermittlung erfolgt auf Basis der EU-Standardvertragsklauseln (SCC) gemäß Art. 46 DSGVO.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>11.2 Stripe ist unter dem EU-U.S. Data Privacy Framework zertifiziert. Supabase betreibt unsere Datenbank in der EU (eu-north-1, Stockholm).</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>11.3 Voyage AI verarbeitet ausschließlich anonymisierte Textfragmente (Chunks) aus hochgeladenen Dokumenten zur Erstellung von Embeddings für die Dokumentensuche. Personenbezogene Daten werden vor der Übermittlung entfernt. Für Voyage AI liegt ein Data Processing Agreement (DPA) vor.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>11.4 Alle Dienstleister wurden sorgfältig ausgewählt und sind vertraglich zur Einhaltung der DSGVO verpflichtet (Auftragsverarbeitungsverträge gemäß Art. 28 DSGVO).</p>
            </section>

            <section id="aenderungen" style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 12 Änderungen dieser Datenschutzerklärung</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>12.1 Wir behalten uns vor, diese Datenschutzerklärung bei Bedarf anzupassen. Die aktuelle Version ist stets unter argonaut-os.com/datenschutz abrufbar.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>12.2 Bei wesentlichen Änderungen informieren wir registrierte Kunden per E-Mail.</p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginTop: '32px' }}>
                <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.7', margin: 0 }}>
                  <strong>Anbieter:</strong> Gaspar AI Consulting, Martin Gaspar<br />
                  Böblingen, Baden-Württemberg, Deutschland<br />
                  E-Mail: info@argonaut-os.com | Web: argonaut-os.com<br />
                  <strong>Stand:</strong> Juni 2026
                </p>
              </div>
            </section>

          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
