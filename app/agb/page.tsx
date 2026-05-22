'use client'
import { useState } from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const sections = [
  { id: 'gegenstand', label: '§ 1 Gegenstand & Leistungen' },
  { id: 'vertragsschluss', label: '§ 2 Vertragsschluss' },
  { id: 'preise', label: '§ 3 Preise & Tarife' },
  { id: 'zahlung', label: '§ 4 Zahlung & Abrechnung' },
  { id: 'laufzeit', label: '§ 5 Laufzeit & Kündigung' },
  { id: 'leistungsumfang', label: '§ 6 Leistungsumfang & SLA' },
  { id: 'nutzungsrechte', label: '§ 7 Nutzungsrechte' },
  { id: 'ki-training', label: '§ 8 KI-Training & Daten' },
  { id: 'fair-use', label: '§ 9 Fair-Use & Kontingente' },
  { id: 'haftung', label: '§ 10 Haftungsbeschränkung' },
  { id: 'datenschutz', label: '§ 11 Datenschutz' },
  { id: 'schluss', label: '§ 12 Schlussbestimmungen' },
]

const tarife = [
  { name: 'SOLO Beta', preis: '499', laufzeit: '3 Monate (danach AUTO-Upgrade auf START)', agenten: '2 KI-Agenten', automatisierungen: '25 Universal-Automatisierungen (frei w├ñhlbar)', kontingent: '5.000 KI-Calls/Monat', highlight: false },
  { name: 'START', preis: '1.500', laufzeit: '12 Monate', agenten: '8 KI-Agenten', automatisierungen: '40 Automatisierungen', kontingent: '15.000 KI-Calls/Monat', highlight: false },
  { name: 'PRO', preis: '3.000', laufzeit: '12 Monate', agenten: '16 KI-Agenten', automatisierungen: '70 Automatisierungen', kontingent: '35.000 KI-Calls/Monat', highlight: true },
  { name: 'BUSINESS', preis: '6.000', laufzeit: '12 Monate', agenten: '20 KI-Agenten', automatisierungen: '110 Automatisierungen', kontingent: '75.000 KI-Calls/Monat', highlight: false },
  { name: 'ENTERPRISE', preis: '9.000', laufzeit: '12 Monate', agenten: '24 KI-Agenten', automatisierungen: '128 Automatisierungen + Branchen-spezifisch', kontingent: '150.000 KI-Calls/Monat', highlight: false },
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

        <div style={{ background: '#0A1628', padding: '80px 48px 60px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ color: '#C9A84C', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px' }}>Rechtliches</div>
            <h1 style={{ color: '#FFFFFF', fontSize: '42px', fontWeight: '700', marginBottom: '16px', fontFamily: 'Syne, sans-serif' }}>Allgemeine Geschäftsbedingungen</h1>
            <p style={{ color: '#94a3b8', fontSize: '16px', lineHeight: '1.7' }}>
              ARGONAUT OS — Gaspar AI Consulting, Martin Gaspar, Böblingen<br />
              Stand: Mai 2026 | Es gelten ausschließlich diese AGB
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

            <section id="gegenstand" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 1 Gegenstand & Leistungen</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>1.1 Die Gaspar AI Consulting, vertreten durch Martin Gaspar, Böblingen (nachfolgend „Anbieter") betreibt die KI-gestützte Unternehmensplattform ARGONAUT OS, zugänglich unter argonaut-os.com (nachfolgend „Plattform").</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>1.2 ARGONAUT OS bietet Unternehmen des deutschen Mittelstands (nachfolgend „Kunde") KI-Agenten, Automatisierungsworkflows, Analyse- und Verwaltungsfunktionen als Software-as-a-Service (SaaS) an.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>1.3 Die konkret gebuchten Leistungen richten sich nach dem jeweiligen Paket (SOLO Beta, START, PRO, BUSINESS, ENTERPRISE). Der Leistungsumfang ist in § 6 und der aktuellen Leistungsbeschreibung auf argonaut-os.com definiert.</p>
            </section>

            <section id="vertragsschluss" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 2 Vertragsschluss</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>2.1 Der Vertrag kommt durch Auswahl eines Pakets, Eingabe der Zahlungsdaten und Bestätigung der Buchung zustande. Mit Abschluss der Buchung erklärt der Kunde sein Einverständnis mit diesen AGB sowie der Datenschutzerklärung.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>2.2 Der Anbieter ist berechtigt, eine Buchung ohne Angabe von Gründen abzulehnen, insbesondere bei begründetem Verdacht auf missbräuchliche Nutzung.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>2.3 Der Vertrag wird in deutscher Sprache geschlossen. Der Vertragstext wird nach Vertragsschluss nicht gesondert gespeichert und ist über das Kundenkonto abrufbar.</p>
            </section>

            <section id="preise" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 3 Preise & Tarife</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '24px' }}>3.1 Alle Preise verstehen sich in Euro, netto, zuzüglich der gesetzlichen Mehrwertsteuer (derzeit 19 %). Die aktuellen Preise sind:</p>
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#0A1628', color: '#FFFFFF' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Paket</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Preis/Monat (netto)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Laufzeit</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>KI-Agenten</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Inkl. Kontingent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tarife.map((t, i) => (
                      <tr key={i} style={{ background: t.highlight ? '#fef9ee' : i % 2 === 0 ? '#f8fafc' : '#FFFFFF', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '700', color: '#0A1628' }}>
                          {t.highlight && <span style={{ background: '#C9A84C', color: '#0A1628', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>BELIEBT</span>}
                          {t.name}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{t.preis} €</td>
                        <td style={{ padding: '12px 16px', color: '#374151', fontSize: '13px' }}>{t.laufzeit}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{t.agenten}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{t.kontingent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>3.2 Das Paket SOLO Beta ist auf 3 Monate befristet. Nach Ablauf wird der Vertrag automatisch auf START (1.500 €/Monat, netto) umgestellt, sofern der Kunde nicht spätestens bis zum Ende von Monat 2 schriftlich per E-Mail an info@argonaut-os.com kündigt. Der Kunde wird spätestens 30 Tage vor Umstellung per E-Mail informiert.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>3.3 Für Mehrstandort-Kunden gelten individuelle Konditionen, die in einem separaten Angebot schriftlich vereinbart werden.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>3.4 Der Anbieter behält sich vor, Preise mit einer Ankündigungsfrist von 60 Tagen zu ändern. Bestehende Laufzeitverträge sind davon nicht betroffen.</p>
            </section>

            <section id="zahlung" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 4 Zahlung & Abrechnung</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>4.1 Die Zahlung erfolgt monatlich im Voraus per Kreditkarte oder SEPA-Lastschrift über den Zahlungsdienstleister Stripe. Die erste Zahlung ist bei Vertragsschluss fällig.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>4.2 Overuse-Gebühren gemäß § 9 werden im Folgemonat automatisch eingezogen. Der Kunde erhält vor dem Einzug eine Rechnung per E-Mail.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>4.3 Bei Zahlungsverzug von mehr als 14 Tagen ist der Anbieter berechtigt, den Zugang zur Plattform zu sperren. Die Zahlungsverpflichtung bleibt davon unberührt.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>4.4 Rechnungen werden ausschließlich in elektronischer Form per E-Mail zugestellt.</p>
            </section>

            <section id="laufzeit" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 5 Laufzeit & Kündigung</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>5.1 Alle Pakete (außer SOLO Beta) haben eine Mindestlaufzeit von 12 Monaten. Nach Ablauf verlängert sich der Vertrag automatisch um 12 weitere Monate, sofern nicht mit einer Frist von 30 Tagen zum Laufzeitende schriftlich gekündigt wird.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>5.2 SOLO Beta hat eine feste Laufzeit von 3 Monaten. Danach erfolgt das automatische Upgrade auf START gemäß § 3.2, sofern keine Kündigung vorliegt.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>5.3 Kündigungen sind ausschließlich in Textform (E-Mail) an info@argonaut-os.com zu richten.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>5.4 Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.</p>
            </section>

            <section id="leistungsumfang" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 6 Leistungsumfang & SLA</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>6.1 Der Anbieter stellt die Plattform mit einer Verfügbarkeit von mindestens 99,0 % im Jahresmittel bereit (ohne geplante Wartungsfenster).</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>6.2 Wartungsarbeiten werden nach Möglichkeit außerhalb der Geschäftszeiten (Mo–Fr, 08:00–18:00 Uhr MEZ) durchgeführt und mindestens 24 Stunden vorher angekündigt.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>6.3 Der Anbieter ist berechtigt, den Leistungsumfang weiterzuentwickeln, sofern die Kernfunktionen des gebuchten Pakets erhalten bleiben.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>6.4 Ein Anspruch auf bestimmte zukünftige Funktionen besteht nicht, sofern diese nicht ausdrücklich vertraglich zugesichert wurden.</p>
            </section>

            <section id="nutzungsrechte" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 7 Nutzungsrechte</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>7.1 Der Anbieter räumt dem Kunden für die Dauer des Vertragsverhältnisses ein nicht-exklusives, nicht übertragbares Nutzungsrecht an der Plattform ein.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>7.2 Eine Weitergabe von Zugangsdaten an Dritte außerhalb des Unternehmens ist nicht gestattet, sofern kein Mehrstandort-Vertrag vorliegt.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>7.3 Alle Rechte an der Plattform, den KI-Modellen, Workflows und Agenten verbleiben beim Anbieter.</p>
            </section>

            <section id="ki-training" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 8 KI-Training & Daten</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>8.1 Mit der Nutzung von ARGONAUT OS stimmt der Kunde zu, dass anonymisierte, nicht personenbezogene Nutzungsdaten (z. B. Workflow-Strukturen, Automatisierungsmuster, Interaktionsdaten) zur Verbesserung und zum Training von ARGONAUT OS KI-Modellen verwendet werden dürfen.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>8.2 Personenbezogene Daten werden nicht für KI-Training verwendet. Die Anonymisierung erfolgt vor jeder Verwendung zu Trainingszwecken.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>8.3 Der Kunde kann der Verwendung jederzeit schriftlich per E-Mail an info@argonaut-os.com widersprechen. Der Widerspruch gilt für zukünftige Daten.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>8.4 Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).</p>
            </section>

            <section id="fair-use" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 9 Fair-Use & KI-Nutzungskontingente</h2>
              <div style={{ background: '#fef9ee', border: '1px solid #C9A84C', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }}>
                <p style={{ color: '#0A1628', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Transparenz-Hinweis</p>
                <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.7', margin: 0 }}>Jedes Paket enthält ein monatliches KI-Call-Kontingent. Der aktuelle Verbrauch ist jederzeit im persönlichen Dashboard einsehbar. Bei Annäherung an das Kontingent erhält der Kunde automatische Warnmeldungen.</p>
              </div>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '16px' }}>9.1 Im jeweiligen Paket ist ein monatliches KI-Nutzungskontingent enthalten (siehe § 3). Ein KI-Call bezeichnet eine einzelne Anfrage an das KI-System im Rahmen eines Workflows oder Agenten.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '16px' }}>9.2 Bei Überschreitung des inkludierten Kontingents gelten folgende Overuse-Staffeln (netto, zzgl. 19 % MwSt.):</p>
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#0A1628', color: '#FFFFFF' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Mehrbedarf über Kontingent</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left' }}>Zusatzkosten/Monat (netto)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['bis +25.000 KI-Calls', '99 €'],
                      ['bis +50.000 KI-Calls', '179 €'],
                      ['bis +100.000 KI-Calls', '299 €'],
                      ['über +100.000 KI-Calls', 'Individuell — Kontakt: info@argonaut-os.com'],
                    ].map(([stufe, preis], i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#FFFFFF', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 16px', color: '#374151' }}>{stufe}</td>
                        <td style={{ padding: '12px 16px', color: '#0A1628', fontWeight: '600' }}>{preis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>9.3 Der Kunde wird per E-Mail informiert, sobald 80 % des monatlichen Kontingents verbraucht sind. Bei 100 % erfolgt eine weitere Benachrichtigung mit Hinweis auf anfallende Overuse-Kosten.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>9.4 Overuse-Beträge werden im Folgemonat automatisch per Stripe eingezogen. Der Kunde erhält vorab eine Rechnung per E-Mail.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>9.5 Nicht verbrauchte Kontingente verfallen monatlich und können nicht übertragen werden.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>9.6 Bei dauerhafter erheblicher Überschreitung (mehr als 3 aufeinanderfolgende Monate über 100.000 Calls) ist der Anbieter berechtigt, ein individuelles Angebot zu unterbreiten oder den Vertrag mit 30 Tagen Frist zu kündigen.</p>
            </section>

            <section id="haftung" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 10 Haftungsbeschränkung</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>10.1 Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie für vorsätzlich oder grob fahrlässig verursachte Schäden.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>10.2 Für leicht fahrlässig verursachte Schäden haftet der Anbieter nur bei Verletzung wesentlicher Vertragspflichten, begrenzt auf den vertragstypischen Schaden und die Höhe des in den letzten 12 Monaten gezahlten Entgelts.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>10.3 Der Anbieter haftet nicht für Schäden durch fehlerhafte Eingaben, KI-generierte Inhalte ohne menschliche Prüfung oder Systemausfälle Dritter.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>10.4 KI-generierte Ausgaben sind keine Rechts-, Steuer- oder Finanzberatung. Der Kunde ist für die Prüfung und Verwendung der Ergebnisse selbst verantwortlich.</p>
            </section>

            <section id="datenschutz" style={{ marginBottom: '48px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 11 Datenschutz</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>11.1 Die Verarbeitung personenbezogener Daten erfolgt gemäß DSGVO und BDSG. Details entnehmen Sie der Datenschutzerklärung unter argonaut-os.com/datenschutz.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>11.2 Der Anbieter verarbeitet Nutzungsdaten (Verbrauchsdaten, Login-Zeiten, Workflow-Aktivitäten) zur Vertragserfüllung gemäß Art. 6 Abs. 1 lit. b DSGVO sowie zur Abrechnung von Overuse-Gebühren.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>11.3 Sofern der Kunde personenbezogene Daten seiner Mitarbeiter oder Kunden eingibt, ist er selbst Verantwortlicher im Sinne der DSGVO. Auf Anfrage stellt der Anbieter einen Auftragsverarbeitungsvertrag (AVV) zur Verfügung.</p>
            </section>

            <section id="schluss" style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#0A1628', fontSize: '22px', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #C9A84C' }}>§ 12 Schlussbestimmungen</h2>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>12.1 Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG).</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>12.2 Gerichtsstand ist, soweit gesetzlich zulässig, Böblingen.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>12.3 Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8', marginBottom: '12px' }}>12.4 Der Anbieter ist berechtigt, diese AGB mit 30 Tagen Ankündigungsfrist zu ändern. Widerspricht der Kunde nicht innerhalb von 14 Tagen, gelten die geänderten AGB als akzeptiert.</p>
              <p style={{ color: '#374151', fontSize: '15px', lineHeight: '1.8' }}>12.5 Mündliche Nebenabreden bestehen nicht. Änderungen bedürfen der Textform.</p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginTop: '32px' }}>
                <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.7', margin: 0 }}>
                  <strong>Anbieter:</strong> Gaspar AI Consulting, Martin Gaspar<br />
                  Tübinger Straße 50, 71032 Böblingen, Baden-Württemberg, Deutschland<br />
                  E-Mail: info@argonaut-os.com | Web: argonaut-os.com<br />
                  <strong>Stand:</strong> Mai 2026
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