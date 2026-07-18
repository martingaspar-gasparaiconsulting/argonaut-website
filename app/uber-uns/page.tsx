import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '../vorschau/_components/Navbar'
import Footer from '../vorschau/_components/Footer'

// ============================================================================
// ARGONAUT OS · app/uber-uns/page.tsx — Über uns im neuen dunklen Design.
// Story (Jason/Argonauten) + Gründer-Mission, ausgebaut, einheitlich „Sie",
// aktuelle Fakten (690+ Branchen). Neue Sektion „Wofür wir stehen".
// ============================================================================

const GOLD = '#c9a84c'
const NAVY = '#0A1628'

export const metadata: Metadata = {
  title: 'Über uns — die Crew hinter ARGONAUT OS',
  description: 'Warum ARGONAUT OS entstand: ein Betriebssystem für den deutschen Mittelstand, gebaut in Böblingen — bezahlbar, verständlich, auf deutschen Servern.',
}

const werte = [
  { icon: '🔓', t: 'Zugänglich', d: 'KI und moderne Software gehören nicht nur den Großen. Wir machen sie für jeden Betrieb nutzbar — vom Einzelunternehmer bis zum Konzern.' },
  { icon: '🧩', t: 'Ein System statt zwölf', d: 'Ein Login, ein Ort, ein roter Faden — statt Flickenteppich aus Insellösungen, die nicht miteinander reden.' },
  { icon: '🇩🇪', t: 'In Deutschland zu Hause', d: 'Deutscher Server, DSGVO-konform, Sprache und Support auf Augenhöhe. Ihre Daten bleiben hier.' },
  { icon: '🤝', t: 'Persönlich', d: 'Wir richten ARGONAUT mit Ihnen ein und bleiben an Bord — kein anonymer Software-Konzern, sondern eine Crew.' },
]

const zahlen = [
  { zahl: '690+', label: 'Branchen vorkonfiguriert', sub: 'vom Einzelunternehmer bis zum Konzern' },
  { zahl: '1', label: 'System statt zwölf', sub: 'CRM, ERP, Warenwirtschaft, DMS — ein Login' },
  { zahl: '🇩🇪', label: 'Deutscher Server & DSGVO', sub: 'Ihre Daten bleiben in Deutschland' },
  { zahl: '24/7', label: 'Ihre KI-Crew im Einsatz', sub: 'non-stop — auch wenn Sie schlafen' },
]

export default function UberUns() {
  return (
    <>
      <Navbar />
      <main style={{ background: NAVY, minHeight: '100vh', color: '#EAF1F6', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 300, overflowX: 'hidden' }}>
        <style>{`
          .uu-wrap { max-width: 820px; margin: 0 auto; padding: 0 24px; }
          .uu-eyebrow { color: ${GOLD}; font-size: .78rem; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; margin: 0 0 16px; }
          .uu-h1 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(2.2rem, 5.4vw, 3.6rem); line-height: 1.1; margin: 0 0 1.4rem; }
          .uu-h2 { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(1.7rem, 4vw, 2.6rem); line-height: 1.2; margin: 0 0 1.4rem; }
          .uu-p { color: #c4d3db; font-size: 1.08rem; line-height: 1.85; margin: 0 0 1.2rem; }
          .uu-lead { color: #b9cdd6; font-size: clamp(1.1rem, 2vw, 1.35rem); line-height: 1.6; }
          .uu-strong { color: #EAF1F6; font-weight: 600; }
        `}</style>

        {/* Hero */}
        <section style={{ padding: '140px 24px 60px', textAlign: 'center', background: 'radial-gradient(1000px 500px at 50% -10%, rgba(201,168,76,0.14), transparent 60%)' }}>
          <div className="uu-wrap">
            <p className="uu-eyebrow">Unsere Mission</p>
            <h1 className="uu-h1">Große Ziele erreicht man<br /><span style={{ color: GOLD }}>nicht allein.</span></h1>
            <p className="uu-lead" style={{ maxWidth: '600px', margin: '0 auto' }}>
              Vor Jahrtausenden brach Jason auf — nicht weil der Weg einfach war, sondern weil das Ziel es wert war.
            </p>
          </div>
        </section>

        {/* Argonauten */}
        <section style={{ padding: '30px 24px 20px' }}>
          <div className="uu-wrap">
            <div style={{ background: 'linear-gradient(160deg, rgba(201,168,76,0.1), rgba(122,163,179,0.05))', border: '1px solid rgba(201,168,76,0.28)', borderRadius: '18px', padding: '36px 32px', textAlign: 'center' }}>
              <p style={{ fontSize: 'clamp(1.15rem, 2.4vw, 1.55rem)', fontWeight: 600, color: '#EAF1F6', lineHeight: 1.55, margin: 0 }}>
                Er versammelte die besten Köpfe seiner Zeit — die <span style={{ color: GOLD }}>Argonauten</span> — und segelte los, auf der Suche nach dem Goldenen Vlies. Nicht allein. Mit einer Crew, die jeden Sturm mit ihm durchstand.
              </p>
            </div>
          </div>
        </section>

        {/* Sie sind aufgebrochen */}
        <section style={{ padding: '50px 24px' }}>
          <div className="uu-wrap">
            <p className="uu-eyebrow">Das kennen wir</p>
            <h2 className="uu-h2">Sie sind auch aufgebrochen.</h2>
            <p className="uu-p">Vielleicht vor fünf Jahren. Vielleicht vor zwanzig. Sie haben gekündigt, ein Risiko auf sich genommen, Verantwortung übernommen — für sich, für Ihre Familie, für Ihre Mitarbeiter. Sie haben etwas aufgebaut, das es vorher nicht gab: aus einer Idee, einem Können, einem Antrieb.</p>
            <p className="uu-p">Und trotzdem verschwindet die Zeit — irgendwo zwischen Angeboten, Rechnungen, E-Mails und Terminen. Zwölf Programme, die nicht miteinander reden. Zettel, die verschwinden. Zahlen, die niemand zusammenführt. Am Ende bleibt für das, wofür Sie eigentlich angetreten sind, zu wenig übrig.</p>
            <p className="uu-p uu-strong" style={{ fontSize: '1.2rem' }}>Das kennen wir. Und genau dafür gibt es ARGONAUT.</p>
          </div>
        </section>

        {/* Gründer-Story */}
        <section style={{ padding: '30px 24px 50px' }}>
          <div className="uu-wrap">
            <p className="uu-eyebrow">Die Geschichte</p>
            <h2 className="uu-h2">Böblingen, 2024.<br />Eine Mission beginnt.</h2>
            <p className="uu-p">Martin Gaspar hat jahrelang gesehen, wie der deutsche Mittelstand kämpft — nicht wegen schlechter Produkte oder fehlenden Einsatzes, sondern wegen fehlender Werkzeuge. Während Großkonzerne Millionen in KI und Software investierten, blieb das Rückgrat unserer Wirtschaft mit Insellösungen und Papierkram zurück.</p>
            <div style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '16px', padding: '32px', margin: '10px 0 24px' }}>
              <p style={{ fontSize: 'clamp(1.25rem, 2.6vw, 1.6rem)', fontWeight: 700, color: GOLD, lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
                „Jedes Unternehmen verdient ein System, das mitdenkt — und eine Crew, die niemals schläft."
              </p>
              <p style={{ fontSize: '.9rem', color: '#8fa9b6', margin: '16px 0 0' }}>Martin Gaspar, Gründer ARGONAUT OS</p>
            </div>
            <p className="uu-p">Aus dieser Überzeugung entstand ARGONAUT OS: ein Betriebssystem, das den ganzen Betrieb in einem System bündelt — bezahlbar, verständlich und auf deutschen Servern. Kein Werkzeug für IT-Abteilungen, sondern für Menschen, die anpacken.</p>
          </div>
        </section>

        {/* Wofür wir stehen */}
        <section style={{ padding: '30px 24px 50px' }}>
          <div className="uu-wrap" style={{ maxWidth: '1000px' }}>
            <p className="uu-eyebrow" style={{ textAlign: 'center' }}>Wofür wir stehen</p>
            <h2 className="uu-h2" style={{ textAlign: 'center', marginBottom: '2.2rem' }}>Vier Überzeugungen, ein Kompass.</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {werte.map((w) => (
                <div key={w.t} style={{ background: 'rgba(122,163,179,0.05)', border: '1px solid rgba(122,163,179,0.16)', borderRadius: '16px', padding: '26px 24px' }}>
                  <div style={{ fontSize: '1.6rem', marginBottom: '12px' }} aria-hidden="true">{w.icon}</div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#EAF1F6', margin: '0 0 8px' }}>{w.t}</h3>
                  <p style={{ fontSize: '.95rem', color: '#9fb3bd', lineHeight: 1.6, margin: 0 }}>{w.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Zahlen */}
        <section style={{ padding: '30px 24px' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '28px', textAlign: 'center', background: 'linear-gradient(160deg, rgba(18,32,54,0.7), rgba(10,22,40,0.6))', border: '1px solid rgba(122,163,179,0.16)', borderRadius: '18px', padding: '44px 28px' }}>
            {zahlen.map((z) => (
              <div key={z.label}>
                <p style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(2.2rem, 5vw, 3.2rem)', fontWeight: 700, color: GOLD, margin: '0 0 8px', lineHeight: 1 }}>{z.zahl}</p>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: '#EAF1F6', margin: '0 0 6px' }}>{z.label}</p>
                <p style={{ fontSize: '.85rem', color: '#8fa9b6', margin: 0 }}>{z.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Wir sind Ihre Crew */}
        <section style={{ padding: '50px 24px' }}>
          <div className="uu-wrap">
            <p className="uu-eyebrow">Unser Versprechen</p>
            <h2 className="uu-h2">Wir sind Ihre Crew.</h2>
            <p className="uu-p">Wie die Argonauten damals — an Ihrer Seite, jeden Tag. Nicht nur als Software, sondern als Partner, der mitdenkt, handelt und liefert. Während Sie schlafen, während Sie mit Kunden sprechen, während Sie Ihren Betrieb führen.</p>
            <p className="uu-p uu-strong" style={{ fontSize: '1.2rem' }}>Sie geben die Richtung vor. Wir sorgen dafür, dass Sie ankommen.</p>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '40px 24px 100px', textAlign: 'center', background: 'radial-gradient(900px 460px at 50% 130%, rgba(201,168,76,0.14), transparent 60%)' }}>
          <div className="uu-wrap" style={{ maxWidth: '700px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }} aria-hidden="true">🔱</div>
            <h2 className="uu-h2">Ihre Mission wartet.</h2>
            <p className="uu-p" style={{ color: '#b9cdd6', margin: '0 auto 2rem' }}>
              Lassen Sie uns gemeinsam Ihren Betrieb aufs nächste Level bringen — damit Sie wieder das tun können, wofür Sie ursprünglich angetreten sind.
            </p>
            <a href="/vorschau#demo" style={{ background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '16px 34px', borderRadius: '10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 30px rgba(201,168,76,0.25)' }}>
              Demo buchen <span aria-hidden="true">→</span>
            </a>
            <p style={{ fontSize: '.85rem', color: '#7f97a4', marginTop: '24px' }}>ARGONAUT OS — Ihre Crew. Ihr Weg. Ihr Goldenes Vlies. 🔱</p>
          </div>
        </section>

      </main>
      <Footer />
    </>
  )
}
