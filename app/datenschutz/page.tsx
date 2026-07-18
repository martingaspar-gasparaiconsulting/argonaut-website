'use client'
import { useState } from 'react'
import Navbar from '../vorschau/_components/Navbar'
import Footer from '../vorschau/_components/Footer'

// ============================================================================
// ARGONAUT OS · app/datenschutz/page.tsx — Datenschutz im neuen dunklen Design.
// Inhalt unverändert (recht24), außer: Overuse/Fair-Use-Reste entfernt bzw. auf
// das neue Modell (KI unbegrenzt, Sitze/Speicher) umgestellt (§ 3-Tabelle, § 7).
// ============================================================================

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

const sections = [
  { id: 'verantwortlicher', label: '§ 1 Verantwortlicher' },
  { id: 'erhebung', label: '§ 2 Erhebung & Verarbeitung' },
  { id: 'zwecke', label: '§ 3 Zwecke & Rechtsgrundlagen' },
  { id: 'speicherung', label: '§ 4 Speicherdauer' },
  { id: 'weitergabe', label: '§ 5 Datenweitergabe' },
  { id: 'ki-training', label: '§ 6 KI-Training & Nutzungsdaten' },
  { id: 'overuse', label: '§ 7 Nutzungs- & Verbrauchsdaten' },
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
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveSection(id) }
  }

  return (
    <>
      <Navbar />
      <main style={{ background: NAVY, minHeight: '100vh', color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300 }}>
        <style>{`
          .lp-h2 { font-family: var(--font-dm-sans), sans-serif; color: #EAF1F6; font-size: 1.35rem; font-weight: 700; margin: 0 0 16px; padding-bottom: 12px; border-bottom: 2px solid ${GOLD}; }
          .lp-p { color: #b9cdd6; font-size: .96rem; line-height: 1.8; margin: 0 0 12px; }
          .lp-card { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.16); border-radius: 12px; padding: 24px 26px; }
          .lp-table { width: 100%; border-collapse: collapse; font-size: .88rem; }
          .lp-table th { padding: 12px 16px; text-align: left; background: rgba(201,168,76,0.12); color: ${GOLD}; font-weight: 700; }
          .lp-table td { padding: 12px 16px; color: #c4d3db; border-bottom: 1px solid rgba(122,163,179,0.12); vertical-align: top; }
          .lp-note { background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.28); border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; }
          .lp-toc button { display: block; width: 100%; text-align: left; padding: 9px 12px; margin-bottom: 3px; border-radius: 8px; border: none; cursor: pointer; font-size: .82rem; background: transparent; color: #c4d3db; transition: all .2s; font-family: inherit; }
          .lp-toc button:hover { background: rgba(122,163,179,0.08); }
          .lp-grid { max-width: 1200px; margin: 0 auto; padding: 60px 24px; display: grid; grid-template-columns: 280px 1fr; gap: 40px; align-items: start; }
          .lp-recht { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.16); border-radius: 10px; padding: 16px 20px; margin-bottom: 8px; }
          @media (max-width: 900px) { .lp-grid { grid-template-columns: 1fr; } .lp-toc { display: none; } }
        `}</style>

        {/* Hero */}
        <div style={{ background: 'radial-gradient(900px 400px at 50% -20%, rgba(201,168,76,0.14), transparent 60%)', padding: '130px 24px 50px' }}>
          <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
            <div style={{ color: GOLD, fontSize: '.75rem', letterSpacing: '.22em', textTransform: 'uppercase', marginBottom: '14px' }}>Rechtliches</div>
            <h1 style={{ color: '#EAF1F6', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, margin: '0 0 14px', fontFamily: 'var(--font-syne), sans-serif' }}>Datenschutzerklärung</h1>
            <p style={{ color: '#8fa9b6', fontSize: '1rem', lineHeight: 1.7, margin: 0 }}>
              ARGONAUT OS — Gaspar AI Consulting, Martin Gaspar, Böblingen<br />
              Stand: Juli 2026 · Gemäß DSGVO und BDSG
            </p>
          </div>
        </div>

        <div className="lp-grid">
          {/* TOC */}
          <div className="lp-toc" style={{ position: 'sticky', top: '84px', background: 'rgba(122,163,179,0.05)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(122,163,179,0.16)' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8fa9b6', marginBottom: '14px' }}>Inhaltsverzeichnis</div>
            {sections.map((s) => (
              <button key={s.id} onClick={() => scrollTo(s.id)} style={{ background: activeSection === s.id ? 'rgba(201,168,76,0.12)' : 'transparent', color: activeSection === s.id ? GOLD : '#c4d3db', fontWeight: activeSection === s.id ? 600 : 400 }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Inhalt */}
          <div className="lp-card" style={{ padding: '40px' }}>

            <section id="verantwortlicher" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 1 Verantwortlicher</h2>
              <p className="lp-p">Verantwortlicher im Sinne der DSGVO ist:</p>
              <div className="lp-note" style={{ background: 'rgba(122,163,179,0.05)', borderColor: 'rgba(122,163,179,0.16)' }}>
                <p style={{ color: '#c4d3db', fontSize: '.92rem', lineHeight: 1.8, margin: 0 }}>
                  <strong style={{ color: '#EAF1F6' }}>Gaspar AI Consulting</strong><br />
                  Martin Gaspar<br />
                  Böblingen, Baden-Württemberg, Deutschland<br />
                  E-Mail: info@argonaut-os.com<br />
                  Web: argonaut-os.com
                </p>
              </div>
              <p className="lp-p">Bei Fragen zum Datenschutz wenden Sie sich jederzeit per E-Mail an info@argonaut-os.com.</p>
            </section>

            <section id="erhebung" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 2 Erhebung & Verarbeitung personenbezogener Daten</h2>
              <p className="lp-p">Wir verarbeiten folgende personenbezogene Daten:</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="lp-table">
                  <thead><tr><th>Datenkategorie</th><th>Beispiele</th><th>Quelle</th></tr></thead>
                  <tbody>
                    {[
                      ['Stammdaten', 'Name, Firmenname, E-Mail, Adresse', 'Registrierung / Buchung'],
                      ['Zahlungsdaten', 'Zahlungsmethode, Transaktions-ID', 'Stripe (verschlüsselt)'],
                      ['Nutzungsdaten', 'Login-Zeiten, Workflow-Aktivitäten, KI-Nutzung, belegter Speicher', 'Automatisch beim Nutzen der Plattform'],
                      ['Kommunikationsdaten', 'E-Mail-Inhalte, Support- und Kontaktanfragen', 'Direktkontakt / Kontaktformular'],
                      ['Technische Daten', 'IP-Adresse, Browser, Geräteinformationen', 'Automatisch beim Websitebesuch'],
                    ].map(([kat, bsp, quelle], i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: '#EAF1F6' }}>{kat}</td>
                        <td>{bsp}</td>
                        <td>{quelle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="zwecke" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 3 Zwecke & Rechtsgrundlagen</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="lp-table">
                  <thead><tr><th>Zweck</th><th>Rechtsgrundlage</th></tr></thead>
                  <tbody>
                    {[
                      ['Vertragserfüllung (Zugang, Abrechnung, Support)', 'Art. 6 Abs. 1 lit. b DSGVO'],
                      ['Rechnungsstellung und Buchhaltung', 'Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Pflicht)'],
                      ['KI-Training mit anonymisierten Daten', 'Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)'],
                      ['Sicherheit und Missbrauchsprävention', 'Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)'],
                      ['Newsletter und Marketing (nur mit Einwilligung)', 'Art. 6 Abs. 1 lit. a DSGVO'],
                    ].map(([zweck, grund], i) => (
                      <tr key={i}>
                        <td>{zweck}</td>
                        <td style={{ color: GOLD, fontWeight: 600 }}>{grund}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="speicherung" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 4 Speicherdauer</h2>
              <p className="lp-p">4.1 Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.</p>
              <p className="lp-p">4.2 Rechnungen und Buchungsdaten werden gemäß § 147 AO und § 257 HGB für 10 Jahre aufbewahrt.</p>
              <p className="lp-p">4.3 Nutzungsdaten (Login, Verbrauch) werden 24 Monate nach Vertragsende gelöscht.</p>
              <p className="lp-p">4.4 Nach Kündigung wird der Zugang zur Plattform deaktiviert. Kundendaten werden auf Anfrage innerhalb von 30 Tagen gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>
            </section>

            <section id="weitergabe" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 5 Datenweitergabe an Dritte</h2>
              <p className="lp-p">Wir geben Daten nur in folgenden Fällen weiter:</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="lp-table">
                  <thead><tr><th>Empfänger</th><th>Zweck</th><th>Rechtsgrundlage</th></tr></thead>
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
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: '#EAF1F6' }}>{emp}</td>
                        <td>{zweck}</td>
                        <td>{grund}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="lp-p" style={{ marginTop: '14px' }}>Eine Weitergabe an weitere Dritte oder für Werbezwecke findet nicht statt.</p>
            </section>

            <section id="ki-training" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 6 KI-Training & Nutzungsdaten</h2>
              <div className="lp-note">
                <p style={{ color: '#EAF1F6', fontSize: '.9rem', fontWeight: 600, margin: '0 0 4px' }}>Wichtiger Hinweis</p>
                <p style={{ color: '#b9cdd6', fontSize: '.9rem', lineHeight: 1.7, margin: 0 }}>Personenbezogene Daten werden niemals für KI-Training verwendet. Nur vollständig anonymisierte, nicht personenbezogene Nutzungsmuster fließen in die Modellverbesserung ein.</p>
              </div>
              <p className="lp-p">6.1 Mit der Nutzung von ARGONAUT OS stimmt der Kunde zu, dass anonymisierte, nicht personenbezogene Nutzungsdaten (z. B. Workflow-Strukturen, Automatisierungsmuster, Interaktionsdaten) zur Verbesserung und zum Training von ARGONAUT OS KI-Modellen verwendet werden dürfen.</p>
              <p className="lp-p">6.2 Die Anonymisierung erfolgt automatisch vor jeder Verwendung zu Trainingszwecken. Eine Rückführung auf einzelne Personen oder Unternehmen ist technisch ausgeschlossen.</p>
              <p className="lp-p">6.3 Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).</p>
              <p className="lp-p">6.4 Der Widerspruch gegen die Verwendung zu Trainingszwecken ist jederzeit möglich per E-Mail an info@argonaut-os.com. Der Widerspruch gilt für zukünftige Daten.</p>
            </section>

            <section id="overuse" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 7 Nutzungs- & Verbrauchsdaten</h2>
              <p className="lp-p">7.1 ARGONAUT OS erfasst automatisch Nutzungsdaten (z. B. Login-Zeiten, Workflow-Aktivitäten, KI-Nutzung, belegter Speicher) zum Betrieb der Plattform, zur Abrechnung der gebuchten Leistungen (Nutzer-Sitze, Speicher) und zur Sicherheit.</p>
              <p className="lp-p">7.2 Der aktuelle Verbrauch ist jederzeit im persönlichen Dashboard einsehbar. Transparenz über den eigenen Datenverbrauch ist ein Kernprinzip von ARGONAUT OS.</p>
              <p className="lp-p">7.3 Die KI-Nutzung ist in allen Tarifen unbegrenzt inklusive. Zum Schutz vor automatisiertem Missbrauch können technische Begrenzungen (Rate-Limits) eingesetzt werden (siehe AGB § 9).</p>
              <p className="lp-p">7.4 Rechtsgrundlage der Verbrauchserfassung ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Sicherheit).</p>
            </section>

            <section id="cookies" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 8 Cookies & Tracking</h2>
              <p className="lp-p">8.1 Wir verwenden technisch notwendige Cookies für den Betrieb der Plattform (Session-Cookies, Authentifizierung). Diese Cookies sind für die Funktionsfähigkeit der Website erforderlich und können nicht deaktiviert werden.</p>
              <p className="lp-p">8.2 Analyse- oder Werbe-Cookies setzen wir nur mit Ihrer ausdrücklichen Einwilligung ein.</p>
              <p className="lp-p">8.3 Rechtsgrundlage für technisch notwendige Cookies ist Art. 6 Abs. 1 lit. f DSGVO. Für optionale Cookies ist Art. 6 Abs. 1 lit. a DSGVO die Rechtsgrundlage.</p>
            </section>

            <section id="rechte" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 9 Ihre Rechte</h2>
              <p className="lp-p">Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:</p>
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
                <div key={i} className="lp-recht">
                  <p style={{ color: '#EAF1F6', fontSize: '.9rem', fontWeight: 600, margin: '0 0 4px' }}>{recht}</p>
                  <p style={{ color: '#9fb3bd', fontSize: '.88rem', lineHeight: 1.7, margin: 0 }}>{beschreibung}</p>
                </div>
              ))}
              <p className="lp-p" style={{ marginTop: '14px' }}>Zur Ausübung Ihrer Rechte wenden Sie sich an: info@argonaut-os.com</p>
            </section>

            <section id="sicherheit" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 10 Datensicherheit</h2>
              <p className="lp-p">10.1 Wir verwenden SSL/TLS-Verschlüsselung für alle Datenübertragungen. Alle Datenbankverbindungen sind verschlüsselt.</p>
              <p className="lp-p">10.2 Zahlungsdaten werden ausschließlich durch Stripe verarbeitet und niemals auf unseren Servern gespeichert. Stripe ist PCI-DSS-zertifiziert.</p>
              <p className="lp-p">10.3 Zugangsdaten werden mit modernen Hashing-Verfahren (bcrypt) gespeichert. Passwörter sind niemals im Klartext gespeichert.</p>
              <p className="lp-p">10.4 Bei Sicherheitsvorfällen informieren wir betroffene Kunden und die zuständige Aufsichtsbehörde innerhalb von 72 Stunden gemäß Art. 33 DSGVO.</p>
            </section>

            <section id="drittanbieter" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 11 Drittanbieter & internationale Übermittlungen</h2>
              <p className="lp-p">11.1 Einige unserer Dienstleister (Stripe, Supabase, Vercel, Anthropic, Voyage AI) haben ihren Sitz in den USA. Die Datenübermittlung erfolgt auf Basis der EU-Standardvertragsklauseln (SCC) gemäß Art. 46 DSGVO.</p>
              <p className="lp-p">11.2 Stripe ist unter dem EU-U.S. Data Privacy Framework zertifiziert. Supabase betreibt unsere Datenbank in der EU (eu-north-1, Stockholm).</p>
              <p className="lp-p">11.3 Voyage AI verarbeitet ausschließlich anonymisierte Textfragmente (Chunks) aus hochgeladenen Dokumenten zur Erstellung von Embeddings für die Dokumentensuche. Personenbezogene Daten werden vor der Übermittlung entfernt. Für Voyage AI liegt ein Data Processing Agreement (DPA) vor.</p>
              <p className="lp-p">11.4 Alle Dienstleister wurden sorgfältig ausgewählt und sind vertraglich zur Einhaltung der DSGVO verpflichtet (Auftragsverarbeitungsverträge gemäß Art. 28 DSGVO).</p>
            </section>

            <section id="aenderungen" style={{ marginBottom: '10px' }}>
              <h2 className="lp-h2">§ 12 Änderungen dieser Datenschutzerklärung</h2>
              <p className="lp-p">12.1 Wir behalten uns vor, diese Datenschutzerklärung bei Bedarf anzupassen. Die aktuelle Version ist stets unter argonaut-os.com/datenschutz abrufbar.</p>
              <p className="lp-p">12.2 Bei wesentlichen Änderungen informieren wir registrierte Kunden per E-Mail.</p>
              <div style={{ background: 'rgba(122,163,179,0.05)', border: '1px solid rgba(122,163,179,0.16)', borderRadius: '10px', padding: '20px', marginTop: '28px' }}>
                <p style={{ color: '#b9cdd6', fontSize: '.88rem', lineHeight: 1.7, margin: 0 }}>
                  <strong style={{ color: '#EAF1F6' }}>Anbieter:</strong> Gaspar AI Consulting, Martin Gaspar<br />
                  Böblingen, Baden-Württemberg, Deutschland<br />
                  E-Mail: info@argonaut-os.com · Web: argonaut-os.com<br />
                  <strong style={{ color: '#EAF1F6' }}>Stand:</strong> Juli 2026
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
