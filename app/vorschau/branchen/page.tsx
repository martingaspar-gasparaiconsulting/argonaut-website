import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '../_components/Navbar'
import Footer from '../_components/Footer'
import BranchenRaster from '../_components/BranchenRaster'
import { websiteKategorien, websiteBranchen } from '../_lib/branchen-web'

// ============================================================================
// ARGONAUT OS · app/branchen/page.tsx — Branchen-Übersicht (Aufklapp)
// Server-Komponente: lädt die Kategorien-Struktur, teilt die großen Bereiche in
// erzählbare Unter-Bereiche (22 Kacheln) und übergibt sie an <BranchenRaster>
// (Aufklappen, Suche, Animation).
// robots: noindex (Vorschau).
// ============================================================================

const NAVY = '#0A1628'
const GOLD = '#c9a84c'

export const metadata: Metadata = {
  title: 'ARGONAUT — Für Ihre Branche gemacht',
  description: 'ARGONAUT ist für hunderte Branchen vorkonfiguriert — vom Handwerk bis zur Industrie. Wählen Sie Ihren Bereich.',
  robots: { index: true, follow: true },
}

// ---------------------------------------------------------------------------
// Bereichs-Balance (Strategie 09.08.2026): die großen Bereiche in erzählbare
// Unter-Bereiche teilen, damit keine Kachel deutlich über ~43 Branchen liegt.
// Rein optische Gruppierung fürs Aufklapp-Raster — die kanonische Kategorie
// (websiteKategorieOf/REMAP) und alle Detailseiten/SEO bleiben unangetastet.
//   • „Handel & E-Commerce" (70) → thematisch nach Produktwelt in zwei Hälften.
//     Reiner Online/Offline-Schnitt scheidet aus: fast alles ist stationärer
//     Fachhandel. „Technik/Bau/Garten/Freizeit" ist explizit gelistet, der
//     Rest (Mode/Wohnen/Genuss) ergibt sich automatisch — auch neue Nischen.
//   • „Fahrzeuge & Mobilität" (52) → „Auto & KFZ" (Rest) + Zweirad/Nutzfahrzeug/
//     Boot/Luft (explizit gelistet).
//   • „Handwerk & Bau" (52) → wie gehabt hälftig in I + II.
// ---------------------------------------------------------------------------
const HANDEL_TECHNIK = new Set<string>([
  'Großhandel', 'E-Commerce', 'Sportartikelhandel', 'Küchenstudios', 'Angelbedarf', 'Badstudios',
  'Elektro- & Hausgerätehandel', 'Unterhaltungselektronik & HiFi', 'Computer- & IT-Hardwarehandel',
  'Handy- & Telekommunikationsshops', 'Foto-Fachhandel', 'Bürobedarf & Bürotechnik', 'Baustoffhandel',
  'Fliesen-, Sanitär- & Heizungshandel', 'Farben-, Lack- & Tapetenhandel', 'Eisenwaren-, Werkzeug- & Beschlaghandel',
  'Baumärkte & Heimwerkerbedarf', 'Gartencenter & Gartenmärkte', 'Motorgeräte- & Gartentechnikhandel',
  'Kaminofen- & Ofenstudios', 'Grill- & BBQ-Fachhandel', 'Pool- & Schwimmbadfachhandel', 'Outdoor- & Campingausrüstung',
  'Spielwarenhandel', 'Modellbau- & RC-Fachhandel', 'Bastel- & Kreativbedarf', 'Brettspiel- & Hobbyläden',
  'Videospiel- & Konsolenhandel', 'Nähmaschinen-Fachhandel', 'Landmaschinenhandel', 'Baumaschinenhandel',
  'Jagdbedarf & Jagdausrüstung',
])
const FAHRZEUGE_SPEZIAL = new Set<string>([
  'Motorradwerkstatt', 'Fahrradhandel & Werkstatt', 'Caravan & Wohnmobil', 'Boots- & Yachthandel',
  'Transporter- & LKW-Vermietung', 'Wohnmobilvermietung', 'Nutzfahrzeug- & LKW-Werkstatt', 'Fahrzeug- & Aufbautenbau',
  'Anhänger- & Wohnwagenbau', 'Landmaschinen-Werkstatt & -handel', 'Baumaschinen-Service & -handel',
  'Kommunalfahrzeug- & Kehrmaschinentechnik', 'Gabelstapler- & Flurförderzeug-Service', 'Motorradhandel & -zubehör',
  'Roller- & Mofawerkstatt', 'E-Bike- & Pedelec-Spezialist', 'Fahrradmanufaktur & Rahmenbau',
  'Lastenrad- & Cargobike-Anbieter', 'Nutzfahrzeug- & Transporterhandel', 'Bootswerft & Bootsservice',
  'Marina & Yachthafen', 'Bootsmotoren- & Antriebsservice', 'Segelmacherei & Bootszubehör',
  'Wohnmobil- & Caravan-Stellplatz', 'Flugzeugwartung & Luftfahrttechnik', 'Flugschule & Luftsportbetrieb',
  'Drohnen-Service & UAV', 'Schienenfahrzeug- & Bahntechnik',
])

export default function BranchenPage() {
  const roh = websiteKategorien().map((k) => ({
    kategorie: k.kategorie,
    branchen: k.branchen.map((b) => ({ name: b.name, slug: b.slug })),
  }))
  const kategorien: { kategorie: string; branchen: { name: string; slug: string }[] }[] = []
  for (const k of roh) {
    if (k.kategorie === 'Handwerk & Bau' && k.branchen.length > 30) {
      const mitte = Math.ceil(k.branchen.length / 2)
      kategorien.push({ kategorie: 'Handwerk & Bau I', branchen: k.branchen.slice(0, mitte) })
      kategorien.push({ kategorie: 'Handwerk & Bau II', branchen: k.branchen.slice(mitte) })
    } else if (k.kategorie === 'Handel & E-Commerce') {
      const technik = k.branchen.filter((b) => HANDEL_TECHNIK.has(b.name))
      const mode = k.branchen.filter((b) => !HANDEL_TECHNIK.has(b.name))
      kategorien.push({ kategorie: 'Handel — Mode, Wohnen & Genuss', branchen: mode })
      kategorien.push({ kategorie: 'Handel — Technik, Bau, Garten & Freizeit', branchen: technik })
    } else if (k.kategorie === 'Fahrzeuge & Mobilität') {
      const spezial = k.branchen.filter((b) => FAHRZEUGE_SPEZIAL.has(b.name))
      const auto = k.branchen.filter((b) => !FAHRZEUGE_SPEZIAL.has(b.name))
      kategorien.push({ kategorie: 'Auto & KFZ', branchen: auto })
      kategorien.push({ kategorie: 'Zweirad, Nutzfahrzeug, Boot & Luft', branchen: spezial })
    } else {
      kategorien.push(k)
    }
  }
  const total = websiteBranchen().length

  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <Navbar />

      {/* Hero */}
      <section style={{ padding: '130px 0 24px', textAlign: 'center', background: 'radial-gradient(1000px 500px at 50% -8%, rgba(201,168,76,0.12), transparent 60%)' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ color: GOLD, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: '.8rem', marginBottom: '1.4rem' }}>🔱 Branchen</div>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(2.2rem, 5.4vw, 3.6rem)', lineHeight: 1.08, paddingBottom: '2px', margin: '0 0 1rem' }}>
            Für Ihre Branche <span style={{ color: GOLD }}>gemacht</span>.
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.2rem)', color: '#b9cdd6', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.6 }}>
            ARGONAUT kommt für <strong style={{ color: '#EAF1F6' }}>{total} Branchen</strong> vorkonfiguriert — mit den richtigen Abläufen für Ihren Betrieb. Klappen Sie Ihren Bereich auf:
          </p>
        </div>
      </section>

      {/* Aufklapp-Übersicht */}
      <section style={{ padding: '10px 0 40px' }}>
        <BranchenRaster kategorien={kategorien} total={total} />
      </section>

      {/* Abschluss */}
      <section style={{ padding: '20px 0 90px', textAlign: 'center' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', padding: '0 24px' }}>
          <p style={{ fontSize: 'clamp(1.1rem, 2vw, 1.3rem)', color: '#EAF1F6', margin: '0 0 20px' }}>
            Ihre Branche nicht dabei? ARGONAUT passt sich an — fragen Sie einfach.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/#demo" style={{ background: GOLD, color: NAVY, fontWeight: 600, padding: '14px 30px', borderRadius: '10px', textDecoration: 'none' }}>Demo buchen →</a>
            <Link href="/" style={{ background: 'transparent', color: '#EAF1F6', fontWeight: 500, padding: '14px 26px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(234,241,246,0.22)' }}>← Zur Startseite</Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
