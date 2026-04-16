'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'

const branchenData: Record<string, {
  name: string
  emoji: string
  headline: string
  subline: string
  probleme: string[]
  automatisierungen: string[]
  ergebnis: string
}> = {
  elektriker: {
    name: 'Elektriker & Elektroinstallation',
    emoji: '⚡',
    headline: 'KI-Automatisierung für Elektriker',
    subline: 'Schluss mit Papierkram. Mehr Zeit auf der Baustelle.',
    probleme: [
      'Notdienst-Anrufe die niemand beantwortet',
      'Angebote die zu langsam erstellt werden',
      'VDE-Protokolle noch auf Papier',
      'PV-Anfragen die zu lange liegen',
      'Rechnungen die erst Wochen später rausgehen',
    ],
    automatisierungen: [
      'Automatische Angebotserstellung in 5 Minuten',
      'Notdienst-Anfragen rund um die Uhr beantworten',
      'Digitale VDE-Protokolle mit einem Klick',
      'PV-Anfragen sofort qualifizieren & weiterleiten',
      'Rechnungsversand automatisch nach Auftragsabschluss',
      'Kundennachverfolgung & Bewertungsanfragen',
      'Terminbuchung ohne Telefonat',
    ],
    ergebnis: 'Elektriker-Betriebe sparen im Schnitt 12 Stunden pro Woche an Verwaltungsaufwand.',
  },
  dachdecker: {
    name: 'Dachdecker',
    emoji: '🏠',
    headline: 'KI-Automatisierung für Dachdecker',
    subline: 'Weniger Büro. Mehr Baustelle.',
    probleme: [
      'Angebote dauern zu lange',
      'Nachkalkulation geht unter',
      'Materialbestellungen per Hand',
      'Kundenkommunikation chaotisch',
      'Keine Zeit für Nachfassaktionen',
    ],
    automatisierungen: [
      'Angebote automatisch aus Fotos & Maßen erstellen',
      'Materialbestellung automatisch auslösen',
      'Kundenstatus immer aktuell im CRM',
      'Automatische Erinnerungen & Nachfass',
      'Rechnungsversand nach Abnahme',
      'Bewertungsanfragen nach Projektabschluss',
      'Wetterschutz-Notfallservice automatisieren',
    ],
    ergebnis: 'Dachdecker-Betriebe reduzieren Büroaufwand um bis zu 60%.',
  },
  shk: {
    name: 'SHK & Heizungsbau',
    emoji: '🔧',
    headline: 'KI-Automatisierung für SHK-Betriebe',
    subline: 'Von der Notaufnahme bis zur Wartung — alles automatisch.',
    probleme: [
      'Notfälle außerhalb der Geschäftszeiten',
      'Wartungsverträge manuell verwalten',
      'Ersatzteilbestellung zeitaufwändig',
      'Angebote für Heizungserneuerung dauern zu lang',
      'Kundenstamm nicht gepflegt',
    ],
    automatisierungen: [
      '24/7 Notfall-Aufnahme per WhatsApp',
      'Wartungserinnerungen automatisch versenden',
      'Ersatzteilbestellung mit einem Klick',
      'Heizungsangebote in Minuten erstellen',
      'Fördermittel-Informationen automatisch mitschicken',
      'Kundenpflege & Reaktivierung',
      'Digitale Aufmaßerfassung',
    ],
    ergebnis: 'SHK-Betriebe gewinnen bis zu 15 neue Wartungsverträge pro Monat durch automatische Nachfass-Aktionen.',
  },
  maschinenbau: {
    name: 'Maschinenbau',
    emoji: '⚙️',
    headline: 'KI-Automatisierung für den Maschinenbau',
    subline: 'Präzision nicht nur in der Produktion — auch in der Verwaltung.',
    probleme: [
      'Angebotserstellung dauert Wochen',
      'Ersatzteilmanagement unübersichtlich',
      'Serviceeinsätze schlecht geplant',
      'Dokumentation veraltet',
      'Leads werden nicht nachgefasst',
    ],
    automatisierungen: [
      'Technische Angebote automatisch erstellen',
      'Ersatzteil-Verfügbarkeit in Echtzeit',
      'Serviceeinsätze automatisch planen',
      'Dokumentation automatisch aktualisieren',
      'Lead-Qualifizierung & Nachfass',
      'Wartungsintervalle automatisch überwachen',
      'Reporting für Geschäftsführung automatisieren',
    ],
    ergebnis: 'Maschinenbau-Unternehmen reduzieren die Angebotserstellungszeit von 2 Wochen auf 2 Tage.',
  },
}

const defaultData = {
  name: 'Ihr Betrieb',
  emoji: '⚔️',
  headline: 'KI-Automatisierung für Ihren Betrieb',
  subline: 'Maßgeschneiderte Lösungen für Ihre Branche.',
  probleme: [
    'Wiederkehrende manuelle Prozesse fressen Zeit',
    'Angebote und Rechnungen dauern zu lange',
    'Kundenkommunikation nicht skalierbar',
    'Verwaltung kostet wertvolle Arbeitszeit',
    'Kein System für Leads und Nachfass',
  ],
  automatisierungen: [
    'Angebotserstellung automatisieren',
    'Kundenkommunikation per WhatsApp & E-Mail',
    'Rechnungsversand automatisch',
    'Lead-Qualifizierung & Nachfass',
    'Terminbuchung ohne Telefonat',
    'Reporting & Auswertungen automatisch',
    'CRM automatisch befüllen',
  ],
  ergebnis: 'ARGONAUT spart Ihrem Betrieb im Schnitt 10–15 Stunden pro Woche. In Betrieben mit kaufmännischer Abteilung sind es oft ein Vielfaches davon. Was Ihr Team mit dieser gewonnenen Zeit erreicht — das entscheiden Sie.',
}

export default function BranchenDetailPage() {
  const params = useParams()
  const slug = params?.slug as string
  const data = branchenData[slug] || { ...defaultData, name: slug || 'Ihr Betrieb' }

  return (
    <main style={{ background: '#fff', minHeight: '100vh' }}>

      {/* Navbar */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(201,168,76,0.2)',
        padding: '0 48px', height: '72px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Image src="/images/ARGONAUT_HELM_SPARTAN .png" alt="ARGONAUT" width={40} height={40} style={{ objectFit: 'contain' }} />
          <span style={{ fontSize: '22px', fontWeight: 900, color: '#0A1628', letterSpacing: '0.15em' }}>ARGONAUT</span>
        </Link>
        <Link href="/branchen" style={{ fontSize: '13px', color: '#C9A84C', fontWeight: 700, textDecoration: 'none' }}>
          ← Alle Branchen
        </Link>
      </nav>

      {/* Hero */}
      <div style={{ background: '#fff', padding: '120px 24px 60px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>{data.emoji}</div>
          <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>
            {data.name}
          </p>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 900, color: '#0A1628', marginBottom: '16px', lineHeight: 1.1 }}>
            {data.headline}
          </h1>
          <p style={{ fontSize: '20px', fontStyle: 'italic', color: '#C9A84C', fontWeight: 600, marginBottom: '32px' }}>
            {data.subline}
          </p>
          <Link href="/#kontakt" style={{
            background: '#C9A84C', color: '#fff', fontWeight: 700, fontSize: '14px',
            padding: '16px 40px', borderRadius: '999px', letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block',
          }}>
            Kostenloses Erstgespräch →
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '60px 24px' }}>

        {/* Video Placeholder */}
        <div style={{
          background: '#0A1628', borderRadius: '20px', padding: '60px 24px',
          textAlign: 'center', marginBottom: '60px',
          border: '1px solid rgba(201,168,76,0.3)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎬</div>
          <p style={{ fontSize: '14px', color: '#C9A84C', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Erklärvideo
          </p>
          <p style={{ fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>
            So arbeitet ARGONAUT für {data.name}
          </p>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)' }}>
            Video folgt in Kürze — vorher/nachher mit ARGONAUT
          </p>
        </div>

        {/* 2 Spalten — Probleme + Automatisierungen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '60px' }}>

          {/* Probleme */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '16px', padding: '36px', borderTop: '4px solid #ef4444' }}>
            <p style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Ohne ARGONAUT
            </p>
            <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#0A1628', marginBottom: '24px' }}>
              Diese Probleme kennen Sie
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data.probleme.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '16px', marginTop: '2px' }}>✗</span>
                  <span style={{ fontSize: '15px', color: '#6b7280', lineHeight: 1.5 }}>{p}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Automatisierungen */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '16px', padding: '36px', borderTop: '4px solid #C9A84C' }}>
            <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Mit ARGONAUT
            </p>
            <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#0A1628', marginBottom: '24px' }}>
              Ihre Automatisierungen
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data.automatisierungen.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ color: '#C9A84C', fontWeight: 900, fontSize: '16px', marginTop: '2px' }}>✓</span>
                  <span style={{ fontSize: '15px', color: '#0A1628', fontWeight: 500, lineHeight: 1.5 }}>{a}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Ergebnis Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0A1628 0%, #1a2d4a 100%)',
          borderRadius: '16px', padding: '40px 48px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '24px', flexWrap: 'wrap', marginBottom: '60px',
          borderLeft: '6px solid #C9A84C',
        }}>
          <div>
            <p style={{ fontSize: '12px', color: '#C9A84C', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px' }}>
              Das Ergebnis
            </p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.5 }}>
              {data.ergebnis}
            </p>
          </div>
          <Link href="/#kontakt" style={{
            background: '#C9A84C', color: '#fff', fontWeight: 700, fontSize: '13px',
            padding: '14px 32px', borderRadius: '999px', letterSpacing: '0.1em',
            textTransform: 'uppercase', textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            Jetzt starten →
          </Link>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '60px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#0A1628', marginBottom: '16px' }}>
            Bereit für Ihren KI-Vorteil?
          </h2>
          <p style={{ fontSize: '18px', color: '#6b7280', marginBottom: '32px' }}>
            30 Minuten. Keine Agentur-Phrasen. Nur ehrliche Einschätzung.
          </p>
          <Link href="/#kontakt" style={{
            background: '#C9A84C', color: '#fff', fontWeight: 700, fontSize: '14px',
            padding: '18px 48px', borderRadius: '999px', letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block',
          }}>
            Kostenloses Erstgespräch buchen →
          </Link>
        </div>

      </div>
    </main>
  )
}
