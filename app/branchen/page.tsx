'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

const alleBranchen = [
  { kategorie: 'Handwerk & Bau', branchen: [
    { name: 'Elektriker & Elektroinstallation', slug: 'elektriker' },
    { name: 'SHK & Heizungsbau', slug: 'shk' },
    { name: 'Schreiner & Tischler', slug: 'schreiner' },
    { name: 'Maler & Lackierer', slug: 'maler' },
    { name: 'Dachdecker', slug: 'dachdecker' },
    { name: 'Fliesenleger', slug: 'fliesenleger' },
    { name: 'Maurer & Betonbauer', slug: 'maurer' },
    { name: 'Zimmerer', slug: 'zimmerer' },
    { name: 'Gerüstbauer', slug: 'geruestbauer' },
    { name: 'Trockenbauer', slug: 'trockenbauer' },
    { name: 'Bodenleger', slug: 'bodenleger' },
    { name: 'Glaser', slug: 'glaser' },
  ]},
  { kategorie: 'Industrie & Produktion', branchen: [
    { name: 'Maschinenbau', slug: 'maschinenbau' },
    { name: 'Fertigung & Produktion', slug: 'fertigung' },
    { name: 'Automotive-Zulieferer', slug: 'automotive' },
    { name: 'Metallverarbeitung', slug: 'metallverarbeitung' },
    { name: 'Kunststoffverarbeitung', slug: 'kunststoff' },
    { name: 'Elektronikfertigung', slug: 'elektronik' },
    { name: 'Lebensmittelproduktion', slug: 'lebensmittel' },
    { name: 'Pharmahersteller', slug: 'pharma' },
    { name: 'Chemieindustrie', slug: 'chemie' },
    { name: 'Druckereien', slug: 'druckerei' },
    { name: 'Verpackungsindustrie', slug: 'verpackung' },
    { name: 'Textilindustrie', slug: 'textil' },
  ]},
  { kategorie: 'Logistik & Transport', branchen: [
    { name: 'Spedition & Logistik', slug: 'spedition' },
    { name: 'Kurierdienste', slug: 'kurier' },
    { name: 'Lagerhaltung & Fulfillment', slug: 'lager' },
    { name: 'Fuhrparkmanagement', slug: 'fuhrpark' },
    { name: 'Umzugsunternehmen', slug: 'umzug' },
    { name: 'Taxiunternehmen', slug: 'taxi' },
    { name: 'Busunternehmen', slug: 'bus' },
    { name: 'Schifffahrt & Hafen', slug: 'schifffahrt' },
    { name: 'Luftfrachtlogistik', slug: 'luftfracht' },
  ]},
  { kategorie: 'Handel & E-Commerce', branchen: [
    { name: 'Einzelhandel', slug: 'einzelhandel' },
    { name: 'Großhandel', slug: 'grosshandel' },
    { name: 'Online-Shops & E-Commerce', slug: 'ecommerce' },
    { name: 'Autohändler', slug: 'autohandel' },
    { name: 'Möbelhäuser', slug: 'moebel' },
    { name: 'Elektronikhändler', slug: 'elektronikhandel' },
    { name: 'Baustoffhandel', slug: 'baustoff' },
    { name: 'Lebensmittelhandel', slug: 'lebensmittelhandel' },
    { name: 'Modehändler', slug: 'mode' },
  ]},
  { kategorie: 'Dienstleistungen', branchen: [
    { name: 'Steuerberatung & Kanzleien', slug: 'steuerberatung' },
    { name: 'Rechtsanwälte', slug: 'rechtsanwaelte' },
    { name: 'Unternehmensberatung', slug: 'unternehmensberatung' },
    { name: 'Personalvermittlung & HR', slug: 'personal' },
    { name: 'Marketingagenturen', slug: 'marketing' },
    { name: 'Werbeagenturen', slug: 'werbung' },
    { name: 'PR-Agenturen', slug: 'pr' },
    { name: 'Eventmanagement', slug: 'event' },
    { name: 'Reinigung & Facility Management', slug: 'reinigung' },
    { name: 'Sicherheitsdienste', slug: 'sicherheit' },
    { name: 'Bewachungsunternehmen', slug: 'bewachung' },
    { name: 'Detekteien', slug: 'detektei' },
  ]},
  { kategorie: 'IT & Technologie', branchen: [
    { name: 'IT-Dienstleister', slug: 'it' },
    { name: 'Softwareentwicklung', slug: 'software' },
    { name: 'Webagenturen', slug: 'web' },
    { name: 'IT-Security', slug: 'security' },
    { name: 'Cloud-Dienstleister', slug: 'cloud' },
    { name: 'Telekommunikation', slug: 'telekom' },
    { name: 'Drohnendienstleister', slug: 'drohnen' },
    { name: 'KI-Unternehmen', slug: 'ki' },
    { name: 'Medientechnik', slug: 'medien' },
  ]},
  { kategorie: 'Gesundheit & Pflege', branchen: [
    { name: 'Arztpraxen', slug: 'arzt' },
    { name: 'Zahnarztpraxen', slug: 'zahnarzt' },
    { name: 'Physiotherapie', slug: 'physio' },
    { name: 'Pflegeheime', slug: 'pflege' },
    { name: 'Ambulante Pflege', slug: 'ambulante-pflege' },
    { name: 'Apotheken', slug: 'apotheke' },
    { name: 'Sanitätshäuser', slug: 'sanitaet' },
    { name: 'Optiker', slug: 'optiker' },
    { name: 'Hörakustiker', slug: 'hoer' },
  ]},
  { kategorie: 'Immobilien & Finanzen', branchen: [
    { name: 'Immobilienmakler', slug: 'immobilien' },
    { name: 'Hausverwaltungen', slug: 'hausverwaltung' },
    { name: 'Bauträger', slug: 'bautraeger' },
    { name: 'Versicherungen', slug: 'versicherung' },
    { name: 'Finanzberater', slug: 'finanzen' },
    { name: 'Banken & Sparkassen', slug: 'bank' },
    { name: 'Leasinggesellschaften', slug: 'leasing' },
    { name: 'Inkassounternehmen', slug: 'inkasso' },
  ]},
  { kategorie: 'Gastronomie & Tourismus', branchen: [
    { name: 'Restaurants & Gastronomie', slug: 'restaurant' },
    { name: 'Hotels & Pensionen', slug: 'hotel' },
    { name: 'Catering', slug: 'catering' },
    { name: 'Reisebüros', slug: 'reise' },
    { name: 'Tourismusverbände', slug: 'tourismus' },
    { name: 'Freizeitparks', slug: 'freizeit' },
    { name: 'Fitnessstudios', slug: 'fitness' },
    { name: 'Wellnessanlagen', slug: 'wellness' },
  ]},
  { kategorie: 'Bildung & Coaching', branchen: [
    { name: 'Fahrschulen', slug: 'fahrschule' },
    { name: 'Nachhilfeinstitute', slug: 'nachhilfe' },
    { name: 'Sprachschulen', slug: 'sprache' },
    { name: 'Business-Coaching', slug: 'coaching' },
    { name: 'Personalentwicklung', slug: 'personalentwicklung' },
    { name: 'Weiterbildung', slug: 'weiterbildung' },
    { name: 'Kindertagesstätten', slug: 'kita' },
    { name: 'Kindergärten', slug: 'kindergarten' },
  ]},
  { kategorie: 'Land & Forstwirtschaft', branchen: [
    { name: 'Landwirtschaft', slug: 'landwirtschaft' },
    { name: 'Forstwirtschaft & Holzernteservice', slug: 'forstwirtschaft' },
    { name: 'Gartenbau & Landschaftspflege', slug: 'gartenbau' },
    { name: 'Tierhaltung & Veterinäre', slug: 'tiere' },
    { name: 'Weinbau', slug: 'weinbau' },
    { name: 'Fischerei', slug: 'fischerei' },
  ]},
]

function BranchenPill({ name, slug }: { name: string; slug: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link
      href={`/branchen/${slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 20px',
        borderRadius: '999px',
        border: `1px solid ${hovered ? '#C9A84C' : '#e5e7eb'}`,
        background: hovered ? 'rgba(201,168,76,0.08)' : '#fff',
        fontSize: '14px',
        fontWeight: 600,
        color: hovered ? '#C9A84C' : '#0A1628',
        boxShadow: hovered ? '0 4px 16px rgba(201,168,76,0.2)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s',
        textDecoration: 'none',
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </Link>
  )
}

export default function BranchenPage() {
  return (
    <main style={{ background: '#fff', minHeight: '100vh' }}>

      {/* Mini Navbar */}
      <nav style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(201,168,76,0.2)',
        padding: '0 48px',
        height: '72px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Image src="/images/ARGONAUT_HELM_SPARTAN .png" alt="ARGONAUT" width={40} height={40} style={{ objectFit: 'contain' }} />
          <span style={{ fontSize: '22px', fontWeight: 900, color: '#0A1628', letterSpacing: '0.15em' }}>ARGONAUT</span>
        </Link>
        <Link href="/" style={{
          fontSize: '13px',
          color: '#C9A84C',
          fontWeight: 700,
          textDecoration: 'none',
          letterSpacing: '0.05em',
        }}>
          ← Zurück zur Startseite
        </Link>
      </nav>

      {/* Header */}
      <div style={{ background: '#fff', padding: '120px 24px 60px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>
            Alle Branchen
          </p>
          <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)', fontWeight: 900, color: '#0A1628', marginBottom: '20px', lineHeight: 1.1 }}>
            110 Branchen. <span style={{ color: '#C9A84C' }}>Eine Crew.</span>
          </h1>
          <p style={{ fontSize: '18px', color: '#6b7280', maxWidth: '600px', margin: '0 auto', lineHeight: 1.7 }}>
            Für jeden Betrieb die passende Automatisierung — maßgeschneidert, messbar und sofort startklar.
          </p>
        </div>
      </div>

      {/* Branchen */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
        {alleBranchen.map((gruppe, gi) => (
          <div key={gi} style={{ marginBottom: '48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0A1628', margin: 0 }}>{gruppe.kategorie}</h2>
              <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
              <span style={{ fontSize: '12px', color: '#C9A84C', fontWeight: 700, whiteSpace: 'nowrap' }}>{gruppe.branchen.length} Branchen</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {gruppe.branchen.map((b, bi) => (
                <BranchenPill key={bi} name={b.name} slug={b.slug} />
              ))}
            </div>
          </div>
        ))}

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '60px 0 20px', borderTop: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '18px', color: '#6b7280', marginBottom: '24px' }}>
            Ihre Branche nicht dabei? Wir automatisieren auch für Sie!
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

    </main>
  )
}
