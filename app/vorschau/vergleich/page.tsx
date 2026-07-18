import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '../_components/Navbar'
import Footer from '../_components/Footer'

// ============================================================================
// ARGONAUT OS · app/vorschau/vergleich/page.tsx — FUNKTIONEN-Showcase
// Positive Leistungs-Seite: "Das volle Spektrum. Ein System." Kein Konkurrenz-
// Vergleich mehr (raus: ✓/–-Matrix + Wettbewerber-Preise → §6-UWG-Risiko weg).
// Bereich für Bereich in Kacheln. Server-Component, Navbar + Footer, noindex.
// ============================================================================

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

export const metadata: Metadata = {
  title: 'Funktionen — alles, was ARGONAUT OS kann',
  description: 'Das volle Spektrum in einem System: CRM, Aufträge, Rechnungen (E-Rechnung), Warenwirtschaft, Kasse, DMS, Personal & Zeit, Auswertungen und KI — für rund 700 Branchen vorkonfiguriert.',
  robots: { index: false, follow: false },
}

type Feature = { name: string; sub: string }
type Bereich = { icon: string; titel: string; tag?: string; lead: string; features: Feature[] }

const BEREICHE: Bereich[] = [
  {
    icon: '📇', titel: 'CRM & Vertrieb', tag: 'CRM',
    lead: 'Jeder Kunde, jede Anfrage, jedes Angebot — an einem Ort.',
    features: [
      { name: 'Kontakte & Firmen', sub: 'Alle Daten & Ansprechpartner zentral' },
      { name: 'Historie & Timeline', sub: 'Jeder Anruf, jede Mail, jedes Angebot' },
      { name: 'Pipeline & Leads', sub: 'Vom Interessenten zum Auftrag' },
      { name: 'Angebote & Nachfassen', sub: 'Automatische Erinnerungen' },
      { name: 'Segmente & Listen', sub: 'Kunden gezielt ansprechen' },
      { name: 'Aufgaben & Wiedervorlagen', sub: 'Nichts wird vergessen' },
    ],
  },
  {
    icon: '📋', titel: 'Aufträge & Projekte',
    lead: 'Vom Auftrag bis zur Abnahme — jeder weiß, was zu tun ist.',
    features: [
      { name: 'Auftragsabwicklung', sub: 'Angebot → Auftrag → erledigt' },
      { name: 'Projekt- & Aufgabenplanung', sub: 'Boards, Fristen, Zuständigkeiten' },
      { name: 'Zeiterfassung je Projekt', sub: 'Sauber abrechenbar' },
      { name: 'Checklisten & Vorlagen', sub: 'Wiederkehrendes standardisiert' },
      { name: 'Statusverfolgung', sub: 'Wo steht welcher Auftrag?' },
    ],
  },
  {
    icon: '🧾', titel: 'Rechnungen & Finanzen', tag: 'Faktura',
    lead: 'Rechnungen in Sekunden — GoBD- und E-Rechnungs-konform.',
    features: [
      { name: 'Angebot → Rechnung per Klick', sub: 'Ohne Abtippen' },
      { name: 'E-Rechnung', sub: 'ZUGFeRD & XRechnung, pflichtkonform' },
      { name: 'Mahnwesen', sub: 'Offene Posten im Griff' },
      { name: 'Wiederkehrende Rechnungen', sub: 'Abos & Wartung automatisch' },
      { name: 'DATEV-Export', sub: 'Brücke zur Steuerberatung' },
      { name: 'Zahlungsabgleich', sub: 'Wer hat bezahlt, wer nicht' },
    ],
  },
  {
    icon: '📦', titel: 'Warenwirtschaft & Lager', tag: 'ERP',
    lead: 'Bestand, Einkauf und Artikel — immer aktuell.',
    features: [
      { name: 'Artikel & Varianten', sub: 'Größen, Farben, Preise' },
      { name: 'Bestand & Inventur', sub: 'Immer aktuell, per Scan' },
      { name: 'Bestellwesen & Lieferanten', sub: 'Preise & Liefertermine' },
      { name: 'Wareneingang', sub: 'Prüfen & einbuchen' },
      { name: 'Seriennummern & Chargen', sub: 'Lückenlos rückverfolgbar' },
    ],
  },
  {
    icon: '💳', titel: 'Kasse & Verkauf', tag: 'POS',
    lead: 'Verkauf an Theke und Tresen — sauber erfasst.',
    features: [
      { name: 'Kassenverkauf', sub: 'Schnell und übersichtlich' },
      { name: 'Zahlarten', sub: 'Bar, Karte, digital' },
      { name: 'Gutscheine & Rabatte', sub: 'Aktionen & Stammkunden' },
      { name: 'Tagesabschluss', sub: 'Sauber & nachvollziehbar' },
    ],
  },
  {
    icon: '📄', titel: 'Dokumente & Verträge', tag: 'DMS',
    lead: 'Ihr digitaler Aktenschrank — nie wieder suchen.',
    features: [
      { name: 'Revisionssichere Ablage', sub: 'GoBD-konform' },
      { name: 'Volltextsuche', sub: 'In Sekunden gefunden' },
      { name: 'Verträge & Fristen', sub: 'Automatische Erinnerung' },
      { name: 'Vorlagen & Textbausteine', sub: 'Immer aktuell' },
      { name: 'Ersetzendes Scannen', sub: 'Papier ade' },
    ],
  },
  {
    icon: '👥', titel: 'Personal & Zeit',
    lead: 'Von der Stunde bis zur Lohn-Brücke — alles verbunden.',
    features: [
      { name: 'Zeiterfassung', sub: 'Web, App oder Terminal' },
      { name: 'Dienst- & Schichtplan', sub: 'Passend zur Auslastung' },
      { name: 'Urlaub & Abwesenheit', sub: 'Antrag & Freigabe' },
      { name: 'Lohn-Brücke', sub: 'Export zur Lohnabrechnung' },
      { name: 'Mitarbeiterakte', sub: 'Alles digital' },
      { name: 'Self-Service', sub: 'Zeit, Zettel, Mein Bereich' },
    ],
  },
  {
    icon: '📊', titel: 'Auswertungen & Dashboards', tag: 'BI',
    lead: 'Ihre Zahlen in Echtzeit — Entscheidungen aus Fakten.',
    features: [
      { name: 'Live-Dashboards', sub: 'Ihr Betrieb auf einen Blick' },
      { name: 'Kennzahlen & Ziele', sub: 'Umsatz, Marge, Auslastung' },
      { name: 'Berichte & Export', sub: 'Auf Knopfdruck' },
      { name: 'Frühwarnungen', sub: 'Bevor es brennt' },
    ],
  },
  {
    icon: '🧭', titel: 'Ihre KI-Crew',
    lead: 'Mitarbeiter, die nie schlafen — und mitdenken.',
    features: [
      { name: 'Routine-Automation', sub: 'Wiederkehrendes von selbst' },
      { name: 'Vorschläge & Entwürfe', sub: 'Texte, Angebote, Antworten' },
      { name: 'Dokumente auslesen', sub: 'Rechnungen, Belege, E-Mails' },
      { name: 'Assistenz rund um die Uhr', sub: 'Fragen sofort beantwortet' },
    ],
  },
  {
    icon: '🧩', titel: 'Branchen-Baukasten',
    lead: 'Für rund 700 Branchen vorkonfiguriert — passgenau statt von der Stange.',
    features: [
      { name: 'Kern für jeden', sub: 'CRM, Faktura, DMS & Co.' },
      { name: 'Kuratierte Spezial-Module', sub: 'Aufmaß, Reifenhotel, Tischplan, HACCP …' },
      { name: 'Passende Nutzer-Rollen', sub: 'Voll, Standard, Self-Service' },
      { name: 'Wächst mit', sub: 'Neue Tools laufend ergänzt' },
    ],
  },
  {
    icon: '🔒', titel: 'Sicherheit & Recht',
    lead: 'Deutsche Server, DSGVO von Grund auf.',
    features: [
      { name: 'Deutsche Server', sub: 'Daten bleiben in Deutschland' },
      { name: 'DSGVO-konform', sub: 'Von Grund auf gebaut' },
      { name: 'Rollen & Rechte', sub: 'Wer darf was' },
      { name: 'Backup & Verschlüsselung', sub: 'Sicher verwahrt' },
    ],
  },
]

export default function FunktionenPage() {
  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <style>{`
        .fk-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
        .fk-h1 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(2.2rem, 5.6vw, 3.8rem); line-height: 1.06; padding-bottom: 2px; margin: 0 0 1.1rem; }
        .fk-bereich { margin-top: 46px; }
        .fk-bhead { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
        .fk-btitel { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: clamp(1.4rem, 3vw, 1.9rem); color: #EAF1F6; margin: 0; }
        .fk-btag { font-size: .68rem; font-weight: 700; letter-spacing: .04em; color: ${GOLD}; background: rgba(201,168,76,0.12); border-radius: 999px; padding: 3px 9px; }
        .fk-blead { color: #b9cdd6; margin: 0 0 16px; line-height: 1.55; }
        .fk-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .fk-tile { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.14); border-radius: 12px; padding: 15px 16px; transition: border-color .2s, background .2s; }
        .fk-tile:hover { border-color: rgba(201,168,76,0.4); background: rgba(201,168,76,0.05); }
        .fk-tname { font-weight: 700; font-size: .95rem; color: #EAF1F6; margin: 0 0 3px; }
        .fk-tsub { font-size: .83rem; color: #9fb3bd; line-height: 1.4; margin: 0; }
        @media (max-width: 860px) { .fk-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .fk-grid { grid-template-columns: 1fr; } }
      `}</style>

      <Navbar />

      {/* Hero */}
      <section style={{ padding: '140px 0 20px', textAlign: 'center', background: 'radial-gradient(1000px 500px at 50% -10%, rgba(201,168,76,0.12), transparent 60%)' }}>
        <div className="fk-wrap">
          <div style={{ color: GOLD, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: '.8rem', marginBottom: '1.4rem' }}>
            🔱 Funktionen
          </div>
          <h1 className="fk-h1">Das volle Spektrum. <span style={{ color: GOLD }}>Ein System.</span></h1>
          <p style={{ fontSize: 'clamp(1.05rem, 2vw, 1.28rem)', color: '#b9cdd6', maxWidth: '56ch', margin: '0 auto', lineHeight: 1.6 }}>
            Was andere auf ein Dutzend Programme verteilen, bekommen Sie bei ARGONAUT in einer Oberfläche —
            für rund 700 Branchen vorkonfiguriert. Kein Flickenteppich, keine Insellösungen.
          </p>
        </div>
      </section>

      {/* Bereiche */}
      <section style={{ padding: '20px 0 40px' }}>
        <div className="fk-wrap">
          {BEREICHE.map((b) => (
            <div key={b.titel} className="fk-bereich">
              <div className="fk-bhead">
                <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>{b.icon}</span>
                <h2 className="fk-btitel">{b.titel}</h2>
                {b.tag && <span className="fk-btag">{b.tag}</span>}
              </div>
              <p className="fk-blead">{b.lead}</p>
              <div className="fk-grid">
                {b.features.map((f) => (
                  <div key={f.name} className="fk-tile">
                    <p className="fk-tname">{f.name}</p>
                    <p className="fk-tsub">{f.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* "Ein System statt zwölf" — ohne Namen, nur die Haltung */}
      <section style={{ padding: '30px 0' }}>
        <div className="fk-wrap">
          <div style={{ background: 'linear-gradient(160deg, rgba(201,168,76,0.08), rgba(122,163,179,0.05))', border: '1px solid rgba(201,168,76,0.28)', borderRadius: '18px', padding: '36px 30px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: '#EAF1F6', margin: '0 0 12px', lineHeight: 1.2 }}>
              Ein System statt zwölf.
            </p>
            <p style={{ color: '#b9cdd6', maxWidth: '56ch', margin: '0 auto', lineHeight: 1.6 }}>
              All das oben — CRM, Warenwirtschaft, Rechnungen, Dokumente, Personal, Auswertungen und KI —
              greift ineinander. Eine Oberfläche, ein Login, ein Ansprechpartner. Und es wird laufend mehr.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '20px 0 100px', textAlign: 'center' }}>
        <div className="fk-wrap">
          <a href="/vorschau#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '15px 32px', borderRadius: '10px', textDecoration: 'none', boxShadow: '0 10px 30px rgba(201,168,76,0.25)' }}>
            Demo buchen <span aria-hidden="true">→</span>
          </a>
          <div style={{ marginTop: '18px', display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/vorschau/branchen" style={{ color: TEAL, textDecoration: 'none', fontSize: '.9rem' }}>Alle Branchen ansehen →</Link>
            <Link href="/vorschau" style={{ color: TEAL, textDecoration: 'none', fontSize: '.9rem' }}>← Zurück zur Übersicht</Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
