import type { Metadata } from 'next'
import Navbar from '../vorschau/_components/Navbar'
import Footer from '../vorschau/_components/Footer'
import AngebotRechner from '../vorschau/_components/AngebotRechner'

// ============================================================================
// ARGONAUT OS · app/multistandort/page.tsx — Multistandort im dunklen Design.
// Löst die alte weiße Seite (veraltete Agenten-Preise) ab. Erklärt das faire
// Standort-Preismodell (Hauptsitz 100 %, weitere Standorte 40 % eigener Stufe)
// und bindet den Angebot-Rechner (Multistandort-Modus) direkt ein.
// ============================================================================

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

export const metadata: Metadata = {
  title: 'Multistandort — viele Filialen, ein System',
  description: 'ARGONAUT OS für Unternehmen mit mehreren Standorten: jede Filiale arbeitet autonom, die Zentrale sieht alles. Faire Standort-Preise — Hauptsitz voll, jeder weitere Standort nur 40 %.',
}

const vorteile = [
  { icon: '🏢', t: 'Jeder Standort autonom', d: 'Jede Filiale hat ihren eigenen Bereich — Termine, Aufträge, Personal, Abrechnung. Kein Datenmix zwischen den Standorten.' },
  { icon: '👁', t: 'Die Zentrale sieht alles', d: 'Ein zentrales Dashboard über alle Standorte: Umsätze, Auslastung, offene Posten — auf einen Blick, in Echtzeit.' },
  { icon: '⚖️', t: 'Faire Standort-Preise', d: 'Der größte Standort zahlt die volle Grundgebühr, jeder weitere nur 40 % seiner eigenen Größe. Kleine Filialen kosten wenig.' },
  { icon: '⚡', t: 'Neue Filiale in Tagen', d: 'Ein Standort mehr? Einfach dazuschalten — das System steht schon, kein neues IT-Projekt, keine Doppelarbeit.' },
]

const beispiele = [
  { icon: '🏥', branche: 'Arztpraxen', text: '5 Standorte, eine Patientenverwaltung — jede Praxis autonom, die Zentrale mit dem Gesamtbild.' },
  { icon: '💪', branche: 'Fitnessstudios', text: 'Mehrere Studios, ein Mitglieder- und Vertragssystem — Beiträge laufen automatisch, standortübergreifend auswertbar.' },
  { icon: '🏨', branche: 'Hotels & Gastro', text: 'Jedes Haus mit eigenem Team, zentral gesteuerte Preise, Verfügbarkeiten und Abrechnung.' },
  { icon: '⚖️', branche: 'Kanzleien', text: '3 Standorte, ein Mandantensystem — Akten, Fristen und Dokumente zentral, jeder Standort mit eigenem Zugriff.' },
  { icon: '🛒', branche: 'Handel & Filialen', text: 'Filialbelieferung, Warenwirtschaft und Kasse je Standort — die Zentrale plant und wertet aus.' },
  { icon: '🔧', branche: 'Handwerk & Service', text: 'Niederlassungen mit eigener Dispo und Tour, zentrale Aufträge, Rechnungen und Controlling.' },
]

const faq = [
  { q: 'Wie viele Standorte kann ich verbinden?', a: 'So viele Sie brauchen — ob 2 oder 20. Jede Filiale, Niederlassung oder jedes Büro läuft in einem zentralen Dashboard zusammen.' },
  { q: 'Bleiben die Daten je Standort getrennt?', a: 'Ja. Jeder Standort hat seinen eigenen Bereich. Die Zentrale sieht alles, ein Standort nur seine eigenen Daten — kein Datenmix.' },
  { q: 'Wie wird ein zusätzlicher Standort bepreist?', a: 'Der größte Standort ist der Hauptsitz und zahlt die volle Grundgebühr nach seiner Größe. Jeder weitere Standort zahlt nur 40 % seiner eigenen Größenstufe — für Grundgebühr und Einrichtung. Die Nutzer-Sitze rechnen wir über alle Standorte nach echter Nutzerzahl.' },
  { q: 'Wie schnell ist ein neuer Standort eingebunden?', a: 'In der Regel in wenigen Tagen — das System steht bereits, der neue Standort wird nur dazugeschaltet. Kein zusätzliches IT-Projekt.' },
  { q: 'Wer darf was sehen?', a: 'Das bestimmen Sie. Standortleiter sehen nur ihren Bereich, die Geschäftsführung alle Standorte. Rollen und Rechte sind frei konfigurierbar.' },
]

export default function MultistandortPage() {
  return (
    <>
      <Navbar />
      <main style={{ background: NAVY, minHeight: '100vh', color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, overflowX: 'hidden' }}>
        <style>{`
          .ms-wrap { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
          .ms-narrow { max-width: 780px; margin: 0 auto; padding: 0 24px; }
          .ms-eyebrow { color: ${GOLD}; font-size: .78rem; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; margin: 0 0 16px; }
          .ms-h1 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(2.2rem, 5.4vw, 3.6rem); line-height: 1.1; margin: 0 0 1.2rem; }
          .ms-h2 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(1.7rem, 4vw, 2.5rem); line-height: 1.2; margin: 0 0 1rem; }
          .ms-lead { color: #b9cdd6; font-size: clamp(1.05rem, 2vw, 1.28rem); line-height: 1.6; }
          .ms-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 40px; text-align: left; }
          .ms-card { background: linear-gradient(160deg, rgba(18,32,54,0.7), rgba(10,22,40,0.6)); border: 1px solid rgba(122,163,179,0.14); border-radius: 16px; padding: 24px; }
          .ms-card .ic { font-size: 1.7rem; }
          .ms-card h3 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: 1.2rem; color: #EAF1F6; margin: 12px 0 6px; }
          .ms-card p { color: #90a6b2; font-size: .95rem; line-height: 1.55; margin: 0; }
          .ms-ex { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 36px; text-align: left; }
          .ms-exc { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.12); border-radius: 14px; padding: 20px; }
          .ms-exc .ic { font-size: 1.5rem; }
          .ms-exc b { display: block; font-family: var(--font-syne), sans-serif; color: #EAF1F6; margin: 10px 0 6px; font-size: 1.02rem; }
          .ms-exc span { color: #90a6b2; font-size: .88rem; line-height: 1.5; }
          .ms-faq { text-align: left; margin-top: 30px; }
          .ms-faq details { border-bottom: 1px solid rgba(122,163,179,0.14); padding: 18px 0; }
          .ms-faq summary { cursor: pointer; font-weight: 600; color: #EAF1F6; font-size: 1.05rem; list-style: none; }
          .ms-faq summary::-webkit-details-marker { display: none; }
          .ms-faq p { color: #b9cdd6; font-size: .98rem; line-height: 1.7; margin: 12px 0 0; }
          .ms-btn { display: inline-flex; align-items: center; gap: 10px; background: ${GOLD}; color: ${NAVY}; font-weight: 600; font-size: 1rem; padding: 15px 32px; border-radius: 10px; text-decoration: none; box-shadow: 0 10px 30px rgba(201,168,76,0.22); }
          @media (max-width: 760px) { .ms-grid { grid-template-columns: 1fr; } .ms-ex { grid-template-columns: 1fr; } }
        `}</style>

        {/* Hero */}
        <section style={{ padding: '140px 24px 50px', textAlign: 'center', background: 'radial-gradient(1000px 500px at 50% -10%, rgba(201,168,76,0.14), transparent 60%)' }}>
          <div className="ms-narrow">
            <p className="ms-eyebrow">Multistandort</p>
            <h1 className="ms-h1">Viele Standorte.<br /><span style={{ color: GOLD }}>Ein System.</span></h1>
            <p className="ms-lead" style={{ maxWidth: '620px', margin: '0 auto' }}>
              Jede Filiale arbeitet autonom, die Zentrale sieht alles. Und Sie zahlen fair: der Hauptsitz voll,
              jeder weitere Standort nur <span style={{ color: '#EAF1F6', fontWeight: 600 }}>40 %</span> seiner eigenen Größe.
            </p>
          </div>
        </section>

        {/* Vorteile */}
        <section style={{ padding: '30px 24px 20px' }}>
          <div className="ms-wrap">
            <div className="ms-grid">
              {vorteile.map((v) => (
                <div key={v.t} className="ms-card">
                  <div className="ic">{v.icon}</div>
                  <h3>{v.t}</h3>
                  <p>{v.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Preis-Rechner (Multistandort-Modus) */}
        <section style={{ padding: '50px 24px 20px', textAlign: 'center' }}>
          <div className="ms-wrap">
            <p className="ms-eyebrow">Preis-Richtlinie</p>
            <h2 className="ms-h2">Rechnen Sie Ihre Standorte durch.</h2>
            <p className="ms-lead" style={{ maxWidth: '620px', margin: '0 auto' }}>
              Oben im Rechner auf <span style={{ color: GOLD, fontWeight: 600 }}>„Mehrere Standorte"</span> — tragen Sie je Filiale die Mitarbeiterzahl ein und sehen Sie sofort beide Varianten im Vergleich. Grobe Richtlinie fürs Gespräch, kein Vertrag.
            </p>
            <AngebotRechner />
          </div>
        </section>

        {/* Beispiele */}
        <section style={{ padding: '50px 24px 20px', textAlign: 'center' }}>
          <div className="ms-wrap">
            <h2 className="ms-h2">Für Betriebe mit mehreren Standorten</h2>
            <div className="ms-ex">
              {beispiele.map((b) => (
                <div key={b.branche} className="ms-exc">
                  <div className="ic">{b.icon}</div>
                  <b>{b.branche}</b>
                  <span>{b.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: '50px 24px 30px' }}>
          <div className="ms-narrow">
            <h2 className="ms-h2" style={{ textAlign: 'center' }}>Häufige Fragen</h2>
            <div className="ms-faq">
              {faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '20px 24px 100px', textAlign: 'center' }}>
          <div className="ms-narrow">
            <h2 className="ms-h2">Mehrere Standorte, ein Erstgespräch.</h2>
            <p className="ms-lead" style={{ maxWidth: '560px', margin: '0 auto 28px' }}>
              Wir schauen uns Ihre Standorte gemeinsam an und rechnen die faire Variante für Sie durch.
            </p>
            <a href="/#demo" className="ms-btn">Demo buchen <span aria-hidden="true">→</span></a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
