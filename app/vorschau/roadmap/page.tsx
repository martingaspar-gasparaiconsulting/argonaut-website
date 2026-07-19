import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '../_components/Navbar'
import Footer from '../_components/Footer'

// ============================================================================
// ARGONAUT OS · app/vorschau/roadmap/page.tsx — Öffentliche Roadmap.
// Drei Status: Verfügbar (Gold) · In Entwicklung · Geplant. Kundentauglich
// benannt, KEINE Datumsversprechen. Handwerk zuerst. Datengetrieben (status
// je Eintrag umschaltbar). Server-Component, Navbar + Footer, noindex (Vorschau).
// HINWEIS: "Verfügbar" ist ein Entwurf nach dem dashboard/-Code — vor Go-Live
// von Martin bestätigen lassen.
// ============================================================================

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

type Status = 'verfuegbar' | 'entwicklung' | 'geplant'
type Item = { name: string; nutzen: string; tag?: string; status: Status }

const ITEMS: Item[] = [
  // ---------- VERFÜGBAR (Entwurf nach dashboard/-Code) ----------
  { status: 'verfuegbar', tag: 'CRM', name: 'Kunden & Vertrieb', nutzen: 'Kontakte, Historie, Pipeline & Leads an einem Ort' },
  { status: 'verfuegbar', name: 'Angebote & Aufträge', nutzen: 'Vom Angebot bis zum erledigten Auftrag' },
  { status: 'verfuegbar', tag: 'Faktura', name: 'Rechnungen & Mahnwesen', nutzen: 'Rechnungen, offene Posten, E-Rechnungs-Import' },
  { status: 'verfuegbar', name: 'Finanzen & Auswertung', nutzen: 'BWA, EÜR, Kennzahlen & Ausgaben im Blick' },
  { status: 'verfuegbar', name: 'GoBD-Belegablage', nutzen: 'Revisionssicher & prüfungsfest abgelegt' },
  { status: 'verfuegbar', tag: 'Warenwirtschaft', name: 'Lager & Bestand', nutzen: 'Sortiment, Inventur, Bestellungen, Lieferanten' },
  { status: 'verfuegbar', tag: 'DMS', name: 'Dokumente & Verträge', nutzen: 'Alles digital, wiederauffindbar, mit Fristen' },
  { status: 'verfuegbar', name: 'Personal & Zeit', nutzen: 'Zeiterfassung, Schichtplan, Urlaub, Lohn-Brücke' },
  { status: 'verfuegbar', name: 'Termine & Kalender', nutzen: 'Planung, Erinnerungen, Team-Kalender' },
  { status: 'verfuegbar', tag: 'BI', name: 'Dashboards & Analytics', nutzen: 'Umsatz, Vertrieb, HR, Service — in Echtzeit' },
  { status: 'verfuegbar', name: 'KI-Crew', nutzen: 'Nimmt Routine ab, liest Belege, denkt mit' },
  { status: 'verfuegbar', name: 'Marketing-Werkzeuge', nutzen: 'Kampagnen, Studio, Redaktionsplan' },
  { status: 'verfuegbar', name: 'Rollen, Rechte & Einstellungen', nutzen: 'Wer darf was — sauber geregelt' },
  { status: 'verfuegbar', name: 'Aufmaß & Leistungskatalog', nutzen: 'Vor Ort messen, Leistungen kalkulieren' },
  { status: 'verfuegbar', name: 'Werkstatt & Fahrzeugakte', nutzen: 'Werkstattauftrag & Fahrzeughistorie' },
  { status: 'verfuegbar', name: 'Service & Wartung', nutzen: 'Serviceaufträge und Wartungsvorgänge' },
  { status: 'verfuegbar', name: 'Monteur- & Außendienst-App', nutzen: 'Tagestour, GPS-Nachweis, mobile Rapporterfassung mit Unterschrift – auch offline nutzbar', tag: 'Handwerk' },
  { status: 'verfuegbar', name: 'Wartung & Prüfung', nutzen: 'Wartungsverträge mit Fälligkeits-Ampel, Prüfprotokolle (DGUV/E-Check), Anlagen-Historie & automatische Erinnerungen', tag: 'Handwerk' },

  // ---------- IN ENTWICKLUNG (Handwerk zuerst + Top-Quer-Bausteine) ----------
  { status: 'verfuegbar', name: 'Bau & Handwerk komplett', nutzen: 'LV-Kalkulation mit Positionen & Nachträgen, Abnahmeprotokoll mit Mängelliste, Rechnung direkt aus dem LV', tag: 'Handwerk' },
  { status: 'verfuegbar', name: 'E-Rechnung & DATEV-Brücke', nutzen: 'XRechnung/ZUGFeRD versenden, DATEV-Buchungsstapel-Export & USt-Vorschau; DATEV-Online/ELSTER als Brücke anbindbar' },
  { status: 'verfuegbar', name: 'Online-Terminbuchung', nutzen: 'Kunden buchen selbst über einen eigenen Link — inkl. Bestätigungs- & No-Show-Mail' },

  // ---------- GEPLANT (weitere Quer-Bausteine + Fachpakete) ----------
  { status: 'verfuegbar', name: 'Schnittstellen & Konnektoren', nutzen: 'Externe Dienste (TSE, Shop) zentral verbinden — bis dahin Demo-/Manuell-Modus, Live-Schalten per Zugangsdaten' },
  { status: 'verfuegbar', tag: 'POS', name: 'Kasse mit TSE', nutzen: 'Kasse mit Warenkorb, Bon-PDF, Bestandsabbuchung & CSV-Export; TSE über zertifizierten Anbieter anbindbar (Demo-Modus vorhanden)' },
  { status: 'verfuegbar', name: 'Mitglieds- & Abo-Verwaltung', nutzen: 'Beiträge & Laufzeitverträge verwalten, SEPA-Lastschrift-Datei fürs Bankprogramm erzeugen' },
  { status: 'verfuegbar', name: 'Lager mit Scanner (WMS)', nutzen: 'Wareneingang, -ausgang & Inventur per Barcode-Scanner (Hardware oder Kamera)' },
  { status: 'verfuegbar', name: 'Projekt-Abrechnung', nutzen: 'Abrechenbare Zeiten & Leistungen je Projekt erfassen und mit einem Klick in eine echte Rechnung verwandeln' },
  { status: 'verfuegbar', name: 'Fördermittel-Assistent', nutzen: 'Fragebogen findet passende, aktuell aktive Förderprogramme (Bund & Land) — mit Merkliste, Status & Fristen-Ampel' },
  { status: 'verfuegbar', name: 'Förder-Angebot-Generator', nutzen: 'Förder-taugliches Angebot (PDF) mit Leistungsbeschreibung & Zuschuss-Schätzung als Kostenvoranschlag für den Digitalbonus-Antrag' },
  { status: 'verfuegbar', name: 'Angebote mit Online-Zusage', nutzen: 'Angebot als PDF, Kunde nimmt per Link online an oder ab — angenommenes Angebot wird mit einem Klick zur Rechnung' },
  { status: 'verfuegbar', name: 'Self-Service-Portal', nutzen: 'Kunden bekommen einen eigenen, login-freien Link und sehen dort ihre eigenen Rechnungen & Termine' },
  { status: 'verfuegbar', name: 'Shop- & Marktplatz-Anbindung', nutzen: 'Bestellungen sammeln & Status verfolgen — CSV-Import im Manuell-Modus, Shopware/Shopify/Woo per Schnittstelle anbindbar' },
  { status: 'verfuegbar', name: 'Bewertungsmanagement', nutzen: 'Kunden per E-Mail um Sterne-Bewertungen bitten, sammeln und freigeben' },
  { status: 'verfuegbar', tag: 'Fahrzeuge', name: 'KFZ-Fachpaket', nutzen: 'Fahrzeuge mit HU/AU-Fristen-Ampel und Reifenhotel (Einlagerung mit Lagerplatz & Saison)' },
  { status: 'verfuegbar', tag: 'Gastro', name: 'Gastro & Hotel', nutzen: 'Tisch-Reservierungen mit Status + Zimmerverwaltung & Belegung mit Überschneidungs-Prüfung (PMS-Kern)' },
  { status: 'verfuegbar', tag: 'Industrie', name: 'Fertigung & PPS', nutzen: 'Stücklisten (BOM) mit Komponenten + Fertigungsaufträge mit Status (geplant → in Arbeit → fertig)' },
  { status: 'verfuegbar', tag: 'Energie', name: 'Energie-Fachpaket', nutzen: 'Energie-Anlagen (PV/Wärmepumpe/BHKW) mit Wartungs-Ampel und Zählerständen/Erträgen' },
  { status: 'geplant', tag: 'Lebensmittel', name: 'Lebensmittel-Fachpaket', nutzen: 'Waagen-Anbindung, MHD/Chargen, Rückverfolgbarkeit, Pfand' },
  { status: 'geplant', tag: 'Landwirtschaft', name: 'Landwirtschaft & Forst', nutzen: 'Schlagkartei, GAP-Antrag, Pflanzenschutz-Doku, Baumkataster' },
  { status: 'geplant', tag: 'Tiere', name: 'Tier-Fachpaket', nutzen: 'Tierbestand & HIT, Herden-/Zuchtbuch, Pensionsstall' },
  { status: 'verfuegbar', tag: 'Immobilien', name: 'Immobilienverwaltung', nutzen: 'Einheiten, Mietverträge und Mieteingänge mit Monats-Soll/Ist-Übersicht' },
  { status: 'geplant', tag: 'IT', name: 'IT & MSP', nutzen: 'Helpdesk mit SLA, RMM, CMDB, Lizenz-/Asset-Verwaltung' },
  { status: 'geplant', tag: 'Agentur', name: 'Agentur & Kreativ', nutzen: 'Media-Asset-Management, Freigaben, Redaktions- & Mediaplan' },
  { status: 'geplant', tag: 'Kanzlei', name: 'Kanzlei & Steuer', nutzen: 'Akten, Fristen, beA/beSt, RVG-/Zeithonorar, FiBu' },
  { status: 'geplant', tag: 'Bildung', name: 'Bildung & Kurse', nutzen: 'Kursverwaltung, Zertifikate, AZAV, Fahrschul-Nachweis' },
  { status: 'geplant', tag: 'Gesundheit', name: 'Gesundheit & Wellness', nutzen: 'Hilfsmittel-eKV, GKV-Abrechnung (§302), Kundenkartei' },
  { status: 'geplant', tag: 'Verein', name: 'Verein, Kultur & Sozial', nutzen: 'Spenden & Zuwendung, Ehrenamt, Ticketing, Fallakte' },
  { status: 'geplant', tag: 'Logistik', name: 'Logistik-Fachpaket', nutzen: 'Telematik, Frachtbrief/CMR, ADR, Lenkzeiten, Track & Trace' },
]

const GRUPPEN: { status: Status; kicker: string; titel: string; sub: string }[] = [
  { status: 'verfuegbar', kicker: '✅ Verfügbar', titel: 'Das läuft heute schon', sub: 'Ab Tag 1 nutzbar — im System vorhanden.' },
  { status: 'entwicklung', kicker: '🔧 In Entwicklung', titel: 'Woran wir gerade bauen', sub: 'Als Nächstes fertig — Handwerk zuerst.' },
  { status: 'geplant', kicker: '🗺️ Geplant', titel: 'Was als Nächstes kommt', sub: 'Auf der Landkarte — wächst laufend weiter.' },
]

export const metadata: Metadata = {
  title: 'Roadmap — was ist da, was kommt | ARGONAUT OS',
  description: 'Offene Roadmap: Was in ARGONAUT OS heute schon verfügbar ist, woran wir gerade bauen und was als Nächstes kommt. Ehrlich, ohne Datumsversprechen.',
  robots: { index: false, follow: false },
}

export default function RoadmapPage() {
  return (
    <main id="top" style={{ background: NAVY, color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, minHeight: '100dvh', overflowX: 'hidden' }}>
      <style>{`
        .rm-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
        .rm-h1 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(2.2rem, 5.6vw, 3.8rem); line-height: 1.06; margin: 0 0 1.1rem; }
        .rm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
        .rm-tile { border-radius: 14px; padding: 16px 18px; border: 1px solid rgba(122,163,179,0.14); background: rgba(122,163,179,0.05); }
        .rm-tile.gold { border-color: rgba(201,168,76,0.55); background: rgba(201,168,76,0.08); box-shadow: 0 0 0 1px rgba(201,168,76,0.25), 0 8px 30px rgba(201,168,76,0.10); }
        .rm-tile.dev { border-color: rgba(122,163,179,0.35); background: rgba(122,163,179,0.07); }
        .rm-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
        .rm-name { font-weight: 700; font-size: .98rem; color: #EAF1F6; }
        .rm-tag { font-size: .66rem; font-weight: 700; letter-spacing: .04em; color: ${GOLD}; background: rgba(201,168,76,0.12); border-radius: 999px; padding: 2px 8px; }
        .rm-nutzen { font-size: .85rem; color: #9fb3bd; line-height: 1.45; margin: 0; }
        .rm-shead { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 46px 0 2px; }
        .rm-kicker { font-size: .8rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${GOLD}; }
        .rm-stitel { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: clamp(1.4rem, 3vw, 1.9rem); color: #EAF1F6; margin: 0; }
        .rm-ssub { color: #b9cdd6; margin: 4px 0 0; }
        @media (max-width: 860px) { .rm-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .rm-grid { grid-template-columns: 1fr; } }
      `}</style>

      <Navbar />

      {/* Hero */}
      <section style={{ padding: '140px 0 10px', textAlign: 'center', background: 'radial-gradient(1000px 500px at 50% -10%, rgba(201,168,76,0.12), transparent 60%)' }}>
        <div className="rm-wrap">
          <div style={{ color: GOLD, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: '.8rem', marginBottom: '1.4rem' }}>🔱 Roadmap</div>
          <h1 className="rm-h1">Was ist da. Was <span style={{ color: GOLD }}>kommt</span>.</h1>
          <p style={{ fontSize: 'clamp(1.05rem, 2vw, 1.28rem)', color: '#b9cdd6', maxWidth: '58ch', margin: '0 auto', lineHeight: 1.6 }}>
            Wir legen offen, woran wir arbeiten. Was heute schon läuft, woran wir gerade bauen und was als Nächstes kommt — ehrlich, ohne leere Datumsversprechen. Und es wird laufend mehr.
          </p>
        </div>
      </section>

      {/* Status-Gruppen */}
      <section style={{ padding: '10px 0 60px' }}>
        <div className="rm-wrap">
          {GRUPPEN.map((g) => {
            const list = ITEMS.filter((i) => i.status === g.status)
            const tileClass = g.status === 'verfuegbar' ? 'rm-tile gold' : g.status === 'entwicklung' ? 'rm-tile dev' : 'rm-tile'
            return (
              <div key={g.status}>
                <div className="rm-shead">
                  <span className="rm-kicker">{g.kicker}</span>
                  <h2 className="rm-stitel">{g.titel}</h2>
                </div>
                <p className="rm-ssub">{g.sub}</p>
                <div className="rm-grid">
                  {list.map((i) => (
                    <div key={i.name} className={tileClass}>
                      <div className="rm-top">
                        <span className="rm-name">{i.name}</span>
                        {i.tag && <span className="rm-tag">{i.tag}</span>}
                      </div>
                      <p className="rm-nutzen">{i.nutzen}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '10px 0 100px', textAlign: 'center' }}>
        <div className="rm-wrap">
          <div style={{ background: 'linear-gradient(160deg, rgba(201,168,76,0.08), rgba(122,163,179,0.05))', border: '1px solid rgba(201,168,76,0.28)', borderRadius: '18px', padding: '36px 30px' }}>
            <p style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: '#EAF1F6', margin: '0 0 12px', lineHeight: 1.2 }}>
              Etwas dabei, das Sie brauchen?
            </p>
            <p style={{ color: '#b9cdd6', maxWidth: '52ch', margin: '0 auto 20px', lineHeight: 1.6 }}>
              Sagen Sie uns, was für Ihren Betrieb zählt — das fließt direkt in unsere Prioritäten ein.
            </p>
            <a href="/vorschau#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '15px 32px', borderRadius: '10px', textDecoration: 'none' }}>Demo buchen →</a>
            <div style={{ marginTop: '16px' }}>
              <Link href="/vorschau/vergleich" style={{ color: TEAL, textDecoration: 'none', fontSize: '.9rem' }}>Alle Funktionen ansehen →</Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
