'use client'
import { useState } from 'react'
import Navbar from '../vorschau/_components/Navbar'
import Footer from '../vorschau/_components/Footer'

// ============================================================================
// ARGONAUT OS · app/agb/page.tsx — AGB im neuen dunklen Design.
// Fair-Use/Kontingent-Modell entfernt -> „KI unbegrenzt inklusive" (§ 9 neu:
// Faire Nutzung, qualitativ). Rechtstext ansonsten unverändert (recht24).
// ============================================================================

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

const sections = [
  { id: 'gegenstand', label: '§ 1 Gegenstand & Leistungen' },
  { id: 'vertragsschluss', label: '§ 2 Vertragsschluss' },
  { id: 'preise', label: '§ 3 Preise & Tarife' },
  { id: 'zahlung', label: '§ 4 Zahlung & Abrechnung' },
  { id: 'laufzeit', label: '§ 5 Laufzeit & Kündigung' },
  { id: 'leistungsumfang', label: '§ 6 Leistungsumfang & SLA' },
  { id: 'nutzungsrechte', label: '§ 7 Nutzungsrechte' },
  { id: 'ki-training', label: '§ 8 KI-Training & Daten' },
  { id: 'faire-nutzung', label: '§ 9 Faire Nutzung' },
  { id: 'speicher', label: '§ 9a Speicherplatz' },
  { id: 'haftung', label: '§ 10 Haftungsbeschränkung' },
  { id: 'datenschutz', label: '§ 11 Datenschutz' },
  { id: 'schluss', label: '§ 12 Schlussbestimmungen' },
]

const groessen = [
  { name: 'SOLO', ma: '1 (Einzelunternehmer)', fee: '499 €', setup: '1.500 €', highlight: false },
  { name: 'Mini', ma: '2–9', fee: '490 €', setup: '2.500 €', highlight: false },
  { name: 'Klein', ma: '10–24', fee: '990 €', setup: '5.000 €', highlight: false },
  { name: 'Mittel', ma: '25–99', fee: '1.990 €', setup: '12.000 €', highlight: true },
  { name: 'Groß', ma: '100–499', fee: '3.490 €', setup: 'auf Anfrage', highlight: false },
  { name: 'Enterprise', ma: 'ab 500', fee: '5.990 €', setup: 'auf Anfrage', highlight: false },
]

const sitze = [
  { typ: 'Voll-Nutzer', wer: 'Chef, GF, Büro, Dispo', preis: '380 € · ab 21 Sitzen 320 € · ab 101: 260 € · ab 501: 190 €' },
  { typ: 'Standard-Nutzer', wer: 'Sachbearbeiter mit Doku', preis: '170 € · ab 21: 145 € · ab 101: 120 € · ab 501: 90 €' },
  { typ: 'Self-Service', wer: 'Zeiterfassung, Lohnzettel, „Mein Bereich"', preis: '19 € · ab 500 Sitzen 14 €' },
]

export default function AGB() {
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
          .lp-table td { padding: 12px 16px; color: #c4d3db; border-bottom: 1px solid rgba(122,163,179,0.12); }
          .lp-note { background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.28); border-radius: 10px; padding: 16px 20px; margin-bottom: 22px; }
          .lp-toc button { display: block; width: 100%; text-align: left; padding: 9px 12px; margin-bottom: 3px; border-radius: 8px; border: none; cursor: pointer; font-size: .82rem; background: transparent; color: #c4d3db; transition: all .2s; font-family: inherit; }
          .lp-toc button:hover { background: rgba(122,163,179,0.08); }
          .lp-grid { max-width: 1200px; margin: 0 auto; padding: 60px 24px; display: grid; grid-template-columns: 280px 1fr; gap: 40px; align-items: start; }
          @media (max-width: 900px) { .lp-grid { grid-template-columns: 1fr; } .lp-toc { display: none; } }
        `}</style>

        {/* Hero */}
        <div style={{ background: 'radial-gradient(900px 400px at 50% -20%, rgba(201,168,76,0.14), transparent 60%)', padding: '130px 24px 50px' }}>
          <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
            <div style={{ color: GOLD, fontSize: '.75rem', letterSpacing: '.22em', textTransform: 'uppercase', marginBottom: '14px' }}>Rechtliches</div>
            <h1 style={{ color: '#EAF1F6', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, margin: '0 0 14px', fontFamily: 'var(--font-syne), sans-serif' }}>Allgemeine Geschäftsbedingungen</h1>
            <p style={{ color: '#8fa9b6', fontSize: '1rem', lineHeight: 1.7, margin: 0 }}>
              ARGONAUT OS — Gaspar AI Consulting, Martin Gaspar, Böblingen<br />
              Stand: Juli 2026 · Es gelten ausschließlich diese AGB
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

            <section id="gegenstand" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 1 Gegenstand & Leistungen</h2>
              <p className="lp-p">1.1 Die Gaspar AI Consulting, vertreten durch Martin Gaspar, Böblingen (nachfolgend „Anbieter") betreibt die KI-gestützte Unternehmensplattform ARGONAUT OS, zugänglich unter argonaut-os.com (nachfolgend „Plattform").</p>
              <p className="lp-p">1.2 ARGONAUT OS bietet Unternehmen des deutschen Mittelstands (nachfolgend „Kunde") KI-Agenten, Automatisierungsworkflows, Analyse- und Verwaltungsfunktionen als Software-as-a-Service (SaaS) an.</p>
              <p className="lp-p">1.3 Die konkret gebuchten Leistungen richten sich nach der Betriebsgröße (monatliche Grundgebühr) und den gebuchten Nutzer-Sitzen (§ 3). Der Leistungsumfang ist in § 6 und der aktuellen Leistungsbeschreibung auf argonaut-os.com definiert.</p>
            </section>

            <section id="vertragsschluss" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 2 Vertragsschluss</h2>
              <p className="lp-p">2.1 Der Vertrag kommt durch Auswahl eines Pakets, Eingabe der Zahlungsdaten und Bestätigung der Buchung zustande. Mit Abschluss der Buchung erklärt der Kunde sein Einverständnis mit diesen AGB sowie der Datenschutzerklärung.</p>
              <p className="lp-p">2.2 Der Anbieter ist berechtigt, eine Buchung ohne Angabe von Gründen abzulehnen, insbesondere bei begründetem Verdacht auf missbräuchliche Nutzung.</p>
              <p className="lp-p">2.3 Der Vertrag wird in deutscher Sprache geschlossen. Der Vertragstext wird nach Vertragsschluss nicht gesondert gespeichert und ist über das Kundenkonto abrufbar.</p>
            </section>

            <section id="preise" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 3 Preise & Tarife</h2>
              <p className="lp-p" style={{ marginBottom: '20px' }}>3.1 Alle Preise verstehen sich in Euro, netto, zuzüglich der gesetzlichen Mehrwertsteuer (derzeit 19 %). ARGONAUT OS wird nach tatsächlichem Bedarf abgerechnet: eine monatliche Grundgebühr nach Betriebsgröße zzgl. der gebuchten Nutzer-Sitze. Die KI-Nutzung ist in allen Tarifen unbegrenzt inklusive.</p>

              <p className="lp-p" style={{ fontWeight: 600, color: '#EAF1F6', margin: '0 0 12px' }}>Grundgebühr nach Betriebsgröße (zzgl. einmaliger Einrichtung):</p>
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table className="lp-table">
                  <thead>
                    <tr><th>Betriebsgröße</th><th>Mitarbeiter</th><th>Grundgebühr/Monat</th><th>Einmalige Einrichtung</th></tr>
                  </thead>
                  <tbody>
                    {groessen.map((g, i) => (
                      <tr key={i} style={{ background: g.highlight ? 'rgba(201,168,76,0.06)' : 'transparent' }}>
                        <td style={{ fontWeight: 700, color: '#EAF1F6' }}>
                          {g.highlight && <span style={{ background: GOLD, color: NAVY, fontSize: '.62rem', padding: '2px 6px', borderRadius: '4px', marginRight: '8px', fontWeight: 700 }}>BELIEBT</span>}
                          {g.name}
                        </td>
                        <td>{g.ma}</td>
                        <td style={{ color: GOLD, fontWeight: 600 }}>{g.fee}</td>
                        <td>{g.setup}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="lp-p" style={{ fontWeight: 600, color: '#EAF1F6', margin: '0 0 12px' }}>Nutzer-Sitze (Preis je Sitz/Monat, gestaffelt nach Menge):</p>
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table className="lp-table">
                  <thead>
                    <tr><th>Sitz-Typ</th><th>Für wen</th><th>Preis je Sitz/Monat (netto)</th></tr>
                  </thead>
                  <tbody>
                    {sitze.map((s, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700, color: '#EAF1F6' }}>{s.typ}</td>
                        <td>{s.wer}</td>
                        <td style={{ fontSize: '.82rem' }}>{s.preis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="lp-p">3.2 SOLO (Einzelunternehmer) ist all-in: 499 €/Monat inkl. 1 Voll-Nutzer und unbegrenzter KI-Nutzung — zusätzliche Sitze sind nicht erforderlich.</p>
              <p className="lp-p">3.3 Die einmalige Einrichtungsgebühr wird bei Vertragsschluss fällig und deckt Einrichtung, Datenübernahme und Einweisung ab.</p>
              <p className="lp-p">3.4 Für Mehrstandort-Kunden gelten individuelle Konditionen, die in einem separaten Angebot schriftlich vereinbart werden.</p>
              <p className="lp-p">3.5 Der Anbieter behält sich vor, Preise mit einer Ankündigungsfrist von 60 Tagen zu ändern. Bestehende Laufzeitverträge sind davon nicht betroffen.</p>
              <p className="lp-p">3.6 Laufzeit-Rabatte: Bei einer Vertragslaufzeit von 24 Monaten gewährt der Anbieter 5 %, bei 36 Monaten 10 % Rabatt auf die monatlichen Gebühren (Grundgebühr und Nutzer-Sitze). Die einmalige Einrichtungsgebühr ist vom Rabatt ausgenommen.</p>
            </section>

            <section id="zahlung" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 4 Zahlung & Abrechnung</h2>
              <p className="lp-p">4.1 Die Zahlung erfolgt monatlich im Voraus per Kreditkarte oder SEPA-Lastschrift über den Zahlungsdienstleister Stripe. Die erste Zahlung ist bei Vertragsschluss fällig.</p>
              <p className="lp-p">4.2 Speicher-Upgrade-Gebühren gemäß § 9a werden im Folgemonat automatisch eingezogen. Der Kunde erhält vor dem Einzug eine Rechnung per E-Mail.</p>
              <p className="lp-p">4.3 Bei Zahlungsverzug von mehr als 14 Tagen ist der Anbieter berechtigt, den Zugang zur Plattform zu sperren. Die Zahlungsverpflichtung bleibt davon unberührt.</p>
              <p className="lp-p">4.4 Rechnungen werden ausschließlich in elektronischer Form per E-Mail zugestellt.</p>
            </section>

            <section id="laufzeit" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 5 Laufzeit & Kündigung</h2>
              <p className="lp-p">5.1 Verträge haben eine Mindestlaufzeit von 12 Monaten; wahlweise sind 24 oder 36 Monate mit Laufzeit-Rabatt (§ 3.6) buchbar. Nach Ablauf verlängert sich der Vertrag automatisch um 12 weitere Monate, sofern nicht mit einer Frist von 30 Tagen zum Laufzeitende schriftlich gekündigt wird.</p>
              <p className="lp-p">5.2 Kündigungen sind ausschließlich in Textform (E-Mail) an info@argonaut-os.com zu richten.</p>
              <p className="lp-p">5.3 Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.</p>
            </section>

            <section id="leistungsumfang" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 6 Leistungsumfang & SLA</h2>
              <p className="lp-p">6.1 Der Anbieter stellt die Plattform mit einer Verfügbarkeit von mindestens 99,0 % im Jahresmittel bereit (ohne geplante Wartungsfenster).</p>
              <p className="lp-p">6.2 Wartungsarbeiten werden nach Möglichkeit außerhalb der Geschäftszeiten (Mo–Fr, 08:00–18:00 Uhr MEZ) durchgeführt und mindestens 24 Stunden vorher angekündigt.</p>
              <p className="lp-p">6.3 Der Anbieter ist berechtigt, den Leistungsumfang weiterzuentwickeln, sofern die Kernfunktionen des gebuchten Pakets erhalten bleiben.</p>
              <p className="lp-p">6.4 Ein Anspruch auf bestimmte zukünftige Funktionen besteht nicht, sofern diese nicht ausdrücklich vertraglich zugesichert wurden.</p>
            </section>

            <section id="nutzungsrechte" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 7 Nutzungsrechte</h2>
              <p className="lp-p">7.1 Der Anbieter räumt dem Kunden für die Dauer des Vertragsverhältnisses ein nicht-exklusives, nicht übertragbares Nutzungsrecht an der Plattform ein.</p>
              <p className="lp-p">7.2 Eine Weitergabe von Zugangsdaten an Dritte außerhalb des Unternehmens ist nicht gestattet, sofern kein Mehrstandort-Vertrag vorliegt.</p>
              <p className="lp-p">7.3 Alle Rechte an der Plattform, den KI-Modellen, Workflows und Agenten verbleiben beim Anbieter.</p>
            </section>

            <section id="ki-training" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 8 KI-Training & Daten</h2>
              <p className="lp-p">8.1 Mit der Nutzung von ARGONAUT OS stimmt der Kunde zu, dass anonymisierte, nicht personenbezogene Nutzungsdaten (z. B. Workflow-Strukturen, Automatisierungsmuster, Interaktionsdaten) zur Verbesserung und zum Training von ARGONAUT OS KI-Modellen verwendet werden dürfen.</p>
              <p className="lp-p">8.2 Personenbezogene Daten werden nicht für KI-Training verwendet. Die Anonymisierung erfolgt vor jeder Verwendung zu Trainingszwecken.</p>
              <p className="lp-p">8.3 Der Kunde kann der Verwendung jederzeit schriftlich per E-Mail an info@argonaut-os.com widersprechen. Der Widerspruch gilt für zukünftige Daten.</p>
              <p className="lp-p">8.4 Rechtsgrundlage ist Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).</p>
            </section>

            <section id="faire-nutzung" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 9 Faire Nutzung</h2>
              <div className="lp-note">
                <p style={{ color: '#EAF1F6', fontSize: '.9rem', fontWeight: 600, margin: '0 0 4px' }}>KI unbegrenzt inklusive</p>
                <p style={{ color: '#b9cdd6', fontSize: '.9rem', lineHeight: 1.7, margin: 0 }}>Alle Pakete enthalten die KI-Nutzung ohne festes Kontingent und ohne nutzungsabhängige Zusatzkosten. Sie arbeiten so viel Sie wollen.</p>
              </div>
              <p className="lp-p">9.1 In allen Paketen ist die KI-Nutzung unbegrenzt inklusive. Es gibt kein monatliches KI-Call-Kontingent und keine nutzungsabhängigen Zusatzkosten.</p>
              <p className="lp-p">9.2 Der Anbieter behält sich vor, zum Schutz vor automatisiertem Missbrauch (z. B. durch Skripte oder Bots) technische Begrenzungen wie Rate-Limits einzusetzen. Die normale Nutzung durch die Mitarbeiter des Kunden ist davon nicht betroffen.</p>
              <p className="lp-p">9.3 Bei offensichtlichem Missbrauch — etwa automatisierten Massenanfragen außerhalb des bestimmungsgemäßen Gebrauchs — ist der Anbieter berechtigt, den Kunden zu kontaktieren und im Wiederholungsfall den Zugang vorübergehend angemessen zu begrenzen.</p>
            </section>

            <section id="speicher" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 9a Speicherplatz</h2>
              <div className="lp-note">
                <p style={{ color: '#EAF1F6', fontSize: '.9rem', fontWeight: 600, margin: '0 0 4px' }}>100 GB pro Mitarbeiter inklusive</p>
                <p style={{ color: '#b9cdd6', fontSize: '.9rem', lineHeight: 1.7, margin: 0 }}>Der Speicher wächst mit Ihrem Team: Jeder Mitarbeiter bringt 100 GB mit, gepoolt für das ganze Unternehmen. Zusätzlicher Speicher ist bei Bedarf günstig buchbar.</p>
              </div>
              <p className="lp-p">9a.1 Im Grundpreis sind 100 GB Speicher pro Mitarbeiter für hochgeladene Dokumente und Dateien enthalten. Der Speicher wird für das gesamte Unternehmen gepoolt (Beispiel: 10 Mitarbeiter = 1.000 GB Gesamtspeicher).</p>
              <p className="lp-p">9a.2 Bei Mehrbedarf kann zusätzlicher Speicher in Blöcken von je 100 GB zum Preis von 5 € pro Monat (netto, zzgl. 19 % MwSt.) gebucht werden — flexibel und beliebig oft.</p>
              <p className="lp-p">9a.3 Zusätzlicher Speicher kann jederzeit über das Dashboard oder per E-Mail an info@argonaut-os.com gebucht werden. Die Aktivierung erfolgt werktags innerhalb von 24 Stunden.</p>
              <p className="lp-p">9a.4 Die Kündigung eines Speicher-Zusatzes ist monatlich zum Monatsende möglich. Hochgeladene Dateien, die das dann verfügbare Kontingent überschreiten, müssen vor Kündigung des Zusatzes gelöscht oder exportiert werden.</p>
              <p className="lp-p">9a.5 Bei dauerhafter Überschreitung des verfügbaren Speicherkontingents ist der Anbieter berechtigt, neue Uploads vorübergehend zu sperren und den Kunden per E-Mail zu informieren.</p>
              <p className="lp-p">9a.6 Für die einmalige Datenübernahme (Onboarding) ist ein Migrationsvolumen von bis zu 1 TB im Preis inbegriffen. Für den laufenden Betrieb danach gilt das Speicherkontingent gemäß 9a.1 (100 GB pro Mitarbeiter); Mehrbedarf wird gemäß 9a.2 berechnet. Für Migrationen über 1 TB erstellt der Anbieter ein individuelles Angebot, das Speicher und Verarbeitungsaufwand abdeckt.</p>
            </section>

            <section id="haftung" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 10 Haftungsbeschränkung</h2>
              <p className="lp-p">10.1 Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie für vorsätzlich oder grob fahrlässig verursachte Schäden.</p>
              <p className="lp-p">10.2 Für leicht fahrlässig verursachte Schäden haftet der Anbieter nur bei Verletzung wesentlicher Vertragspflichten, begrenzt auf den vertragstypischen Schaden und die Höhe des in den letzten 12 Monaten gezahlten Entgelts.</p>
              <p className="lp-p">10.3 Der Anbieter haftet nicht für Schäden durch fehlerhafte Eingaben, KI-generierte Inhalte ohne menschliche Prüfung oder Systemausfälle Dritter.</p>
              <p className="lp-p">10.4 KI-generierte Ausgaben sind keine Rechts-, Steuer- oder Finanzberatung. Der Kunde ist für die Prüfung und Verwendung der Ergebnisse selbst verantwortlich.</p>
            </section>

            <section id="datenschutz" style={{ marginBottom: '44px' }}>
              <h2 className="lp-h2">§ 11 Datenschutz</h2>
              <p className="lp-p">11.1 Die Verarbeitung personenbezogener Daten erfolgt gemäß DSGVO und BDSG. Details entnehmen Sie der Datenschutzerklärung unter argonaut-os.com/datenschutz.</p>
              <p className="lp-p">11.2 Der Anbieter verarbeitet Nutzungsdaten (Login-Zeiten, Workflow-Aktivitäten) zur Vertragserfüllung gemäß Art. 6 Abs. 1 lit. b DSGVO.</p>
              <p className="lp-p">11.3 Sofern der Kunde personenbezogene Daten seiner Mitarbeiter oder Kunden eingibt, ist er selbst Verantwortlicher im Sinne der DSGVO. Auf Anfrage stellt der Anbieter einen Auftragsverarbeitungsvertrag (AVV) zur Verfügung.</p>
            </section>

            <section id="schluss" style={{ marginBottom: '10px' }}>
              <h2 className="lp-h2">§ 12 Schlussbestimmungen</h2>
              <p className="lp-p">12.1 Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG).</p>
              <p className="lp-p">12.2 Gerichtsstand ist, soweit gesetzlich zulässig, Böblingen.</p>
              <p className="lp-p">12.3 Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
              <p className="lp-p">12.4 Der Anbieter ist berechtigt, diese AGB mit 30 Tagen Ankündigungsfrist zu ändern. Widerspricht der Kunde nicht innerhalb von 14 Tagen, gelten die geänderten AGB als akzeptiert.</p>
              <p className="lp-p">12.5 Mündliche Nebenabreden bestehen nicht. Änderungen bedürfen der Textform.</p>
              <div style={{ background: 'rgba(122,163,179,0.05)', border: '1px solid rgba(122,163,179,0.16)', borderRadius: '10px', padding: '20px', marginTop: '28px' }}>
                <p style={{ color: '#b9cdd6', fontSize: '.88rem', lineHeight: 1.7, margin: 0 }}>
                  <strong style={{ color: '#EAF1F6' }}>Anbieter:</strong> Gaspar AI Consulting, Martin Gaspar<br />
                  Tübinger Straße 50, 71032 Böblingen, Baden-Württemberg, Deutschland<br />
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
