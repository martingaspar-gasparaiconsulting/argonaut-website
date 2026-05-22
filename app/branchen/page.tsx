'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

const alleBranchen = [
  { kategorie: 'Medizin & Gesundheit', branchen: [
    { name: 'Ärzte & Praxen', slug: 'aerzte' },
    { name: 'Zahnärzte', slug: 'zahnaerzte' },
    { name: 'Physiotherapie', slug: 'physiotherapie' },
    { name: 'Apotheken', slug: 'apotheken' },
    { name: 'Optiker', slug: 'optiker' },
    { name: 'Hörgeräteakustiker', slug: 'hoergeraete' },
    { name: 'Pflegedienste', slug: 'pflege' },
    { name: 'Kinderbetreuung & Kitas', slug: 'kinderbetreuung' },
    { name: 'Krankenhäuser & Kliniken', slug: 'krankenhauser' },
    { name: 'Medizintechnik', slug: 'medizintechnik' },
    { name: 'Pharmazeutischer Großhandel', slug: 'apotheken-grosshandel' },
    { name: 'Tierärzte', slug: 'tierarzte' },
  ]},
  { kategorie: 'Recht, Steuern & Finanzen', branchen: [
    { name: 'Steuerberatung', slug: 'steuerberatung' },
    { name: 'Steuerberatungsgesellschaften', slug: 'steuerbehoerden' },
    { name: 'Rechtsanwälte', slug: 'rechtsanwaelte' },
    { name: 'Notare', slug: 'notare' },
    { name: 'Finanzberater', slug: 'finanzberater' },
    { name: 'Versicherungsmakler', slug: 'versicherungen' },
    { name: 'Banken & Sparkassen', slug: 'banken' },
    { name: 'Unternehmensberater', slug: 'unternehmensberater' },
    { name: 'Digitalberatung', slug: 'unternehmensberatung-digital' },
  ]},
  { kategorie: 'Handwerk & Bau', branchen: [
    { name: 'Elektriker & Elektrobetriebe', slug: 'elektriker' },
    { name: 'Sanitär & Heizung', slug: 'sanitaer-heizung' },
    { name: 'Maler & Lackierer', slug: 'maler' },
    { name: 'Schreiner & Tischler', slug: 'schreiner' },
    { name: 'Bauunternehmen', slug: 'bauunternehmen' },
    { name: 'Architekten', slug: 'architekten' },
    { name: 'Ingenieurbüros', slug: 'ingenieurbueros' },
    { name: 'Immobilienentwicklung', slug: 'immobilien-entwicklung' },
  ]},
  { kategorie: 'Industrie & Produktion', branchen: [
    { name: 'Industrie & Produktion', slug: 'industrie-produktion' },
    { name: 'Maschinenbau', slug: 'maschinenbau' },
    { name: 'Chemie & Pharma', slug: 'chemie' },
    { name: 'Lebensmittelproduktion', slug: 'lebensmittelproduktion' },
    { name: 'Textil & Mode', slug: 'textilproduktion' },
    { name: 'Möbel & Einrichtung', slug: 'moebel' },
    { name: 'Elektronik & Technologie', slug: 'elektronik' },
    { name: 'Automobilzulieferer', slug: 'automobilzulieferer' },
    { name: 'Luft- & Raumfahrt', slug: 'luft-raumfahrt' },
    { name: 'Verteidigung & Sicherheit', slug: 'verteidigung-sicherheit' },
    { name: 'Bergbau & Rohstoffe', slug: 'bergbau' },
    { name: 'Druckereien', slug: 'druckereien' },
  ]},
  { kategorie: 'Handel & E-Commerce', branchen: [
    { name: 'Einzelhandel', slug: 'einzelhandel' },
    { name: 'Großhandel', slug: 'grosshandel' },
    { name: 'E-Commerce', slug: 'e-commerce' },
    { name: 'KFZ-Werkstätten', slug: 'kfz-werkstaetten' },
    { name: 'KFZ-Handel', slug: 'kfz-handel' },
  ]},
  { kategorie: 'Immobilien & Verwaltung', branchen: [
    { name: 'Immobilienmakler', slug: 'immobilienmakler' },
    { name: 'Hausverwaltungen', slug: 'hausverwaltungen' },
    { name: 'Franchise-Systeme', slug: 'franchise' },
    { name: 'Stadtverwaltungen & Behörden', slug: 'stadtverwaltungen' },
  ]},
  { kategorie: 'Logistik & Transport', branchen: [
    { name: 'Logistik & Spedition', slug: 'logistik' },
    { name: 'Transport & Fuhrpark', slug: 'transport' },
    { name: 'Post & Kurierdienste', slug: 'postdienste' },
  ]},
  { kategorie: 'IT & Technologie', branchen: [
    { name: 'IT-Dienstleister', slug: 'it-dienstleister' },
    { name: 'Softwareentwicklung', slug: 'softwareentwicklung' },
    { name: 'Telekommunikation', slug: 'telekommunikation' },
    { name: 'Wasserwirtschaft & Umwelt', slug: 'wasserwirtschaft' },
    { name: 'Erneuerbare Energien', slug: 'erneuerbare-energien' },
    { name: 'Startups & Scale-ups', slug: 'startups' },
  ]},
  { kategorie: 'Marketing & Kommunikation', branchen: [
    { name: 'Marketing-Agenturen', slug: 'marketing-agenturen' },
    { name: 'Werbeagenturen', slug: 'werbeagenturen' },
    { name: 'PR-Agenturen', slug: 'pr-agenturen' },
    { name: 'Unternehmenskommunikation', slug: 'unternehmenskommunikation' },
    { name: 'Verlage & Medien', slug: 'verlage' },
    { name: 'Fotografen & Videografen', slug: 'fotografen' },
    { name: 'Film & TV-Produktion', slug: 'film-tv' },
    { name: 'Musik & Entertainment', slug: 'musikbranche' },
    { name: 'Spieleentwicklung & Gaming', slug: 'spieleentwicklung' },
    { name: 'Künstler & Kreative', slug: 'kuenstler' },
  ]},
  { kategorie: 'Gastronomie & Tourismus', branchen: [
    { name: 'Gastronomie & Restaurants', slug: 'gastronomie' },
    { name: 'Hotels & Beherbergung', slug: 'hotels' },
    { name: 'Catering & Eventgastronomie', slug: 'catering' },
    { name: 'Reisebüros', slug: 'reisebueros' },
    { name: 'Eventmanagement', slug: 'eventmanagement' },
    { name: 'Freizeit & Unterhaltung', slug: 'freizeitparks' },
    { name: 'Fitnessstudios & Sport', slug: 'fitnessstudios' },
    { name: 'Kosmetik & Beauty', slug: 'kosmetik' },
    { name: 'Friseure & Salons', slug: 'friseure' },
    { name: 'Tattoo Studios', slug: 'tattoo-studios' },
    { name: 'Sportvereine', slug: 'sportvereine' },
  ]},
  { kategorie: 'Bildung & Soziales', branchen: [
    { name: 'Bildung & Weiterbildung', slug: 'bildung-weiterbildung' },
    { name: 'Fahrschulen', slug: 'fahrschulen' },
    { name: 'Schulen & Gymnasien', slug: 'schulen' },
    { name: 'Universitäten & Hochschulen', slug: 'universitaeten' },
    { name: 'Wohlfahrtsverbände & NGOs', slug: 'wohlfahrtsverbaende' },
    { name: 'Verbände & Kammern', slug: 'verbände' },
    { name: 'Berufsverbände & Innungen', slug: 'berufsverbände' },
    { name: 'Kirchen & Religionsgemeinschaften', slug: 'kirchen-religionsgemeinschaften' },
    { name: 'Museen & Kultureinrichtungen', slug: 'museen-kultur' },
    { name: 'Bibliotheken & Archive', slug: 'bibliotheken' },
    { name: 'Archiv & Dokumentenmanagement', slug: 'archiv-dokumentation' },
  ]},
  { kategorie: 'Dienstleistungen', branchen: [
    { name: 'Reinigungsunternehmen', slug: 'reinigungsunternehmen' },
    { name: 'Sicherheitsdienste', slug: 'sicherheitsdienste' },
    { name: 'Personalvermittlung', slug: 'personalvermittlung' },
    { name: 'Landwirtschaft & Agrar', slug: 'landwirtschaft' },
    { name: 'Gartenbau & Landschaftsbau', slug: 'gartenbau' },
    { name: 'Forstwirtschaft & Holz', slug: 'forstwirtschaft' },
    { name: 'Nachhaltigkeit & ESG', slug: 'nachhaltigkeit' },
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
        <Link href="/" style={{ fontSize: '13px', color: '#C9A84C', fontWeight: 700, textDecoration: 'none', letterSpacing: '0.05em' }}>
          &larr; Zurück zur Startseite
        </Link>
      </nav>

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

        <div style={{ textAlign: 'center', padding: '60px 0 20px', borderTop: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '18px', color: '#6b7280', marginBottom: '24px' }}>
            Ihre Branche nicht dabei? Wir automatisieren auch für Sie!
          </p>
          <Link href="/#preise" style={{
            background: '#C9A84C', color: '#fff', fontWeight: 700, fontSize: '14px',
            padding: '16px 40px', borderRadius: '999px', letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block',
          }}>
            Paket buchen &rarr;
          </Link>
        </div>
      </div>

    </main>
  )
}