'use client'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export default function UberUns() {
  return (
    <>
      <Navbar />
      <main style={{ background: '#fff', minHeight: '100vh' }}>

        {/* Hero */}
        <div style={{ background: '#0A1628', padding: '120px 24px 80px', textAlign: 'center' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '24px' }}>Unsere Mission</p>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: '32px' }}>
              Große Ziele erreicht man<br /><span style={{ color: '#C9A84C' }}>nicht alleine.</span>
            </h1>
            <p style={{ fontSize: '20px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, maxWidth: '600px', margin: '0 auto' }}>
              Vor Jahrtausenden brach Jason auf — nicht weil der Weg einfach war, sondern weil das Ziel es wert war.
            </p>
          </div>
        </div>

        {/* Argonauten Block */}
        <div style={{ background: '#C9A84C', padding: '60px 24px' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <p style={{ fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 700, color: '#0A1628', lineHeight: 1.6 }}>
              Er versammelte die besten Köpfe seiner Zeit — die Argonauten — und machte sich auf die Suche nach dem Goldenen Vlies. Nicht alleine. Mit einer Crew, die jeden Sturm mit ihm durchstand.
            </p>
          </div>
        </div>

        {/* Du bist aufgebrochen */}
        <div style={{ padding: '80px 24px', background: '#faf9f6' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>Das kennen wir</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 900, color: '#0A1628', marginBottom: '32px', lineHeight: 1.2 }}>Du bist auch aufgebrochen.</h2>
            <div style={{ display: 'grid', gap: '24px' }}>
              <p style={{ fontSize: '18px', color: '#374151', lineHeight: 1.8 }}>Vielleicht vor fünf Jahren. Vielleicht vor zwanzig. Du hast gekündigt, ein Risiko auf dich genommen, Verantwortung übernommen — für dich, für deine Familie, für deine Mitarbeiter. Du hast etwas aufgebaut, das es vorher nicht gab. Aus einer Idee, einem Können, einem Antrieb.</p>
              <p style={{ fontSize: '18px', color: '#374151', lineHeight: 1.8 }}>Und trotzdem: Irgendwo zwischen Angeboten, Rechnungen, E-Mails und Terminen ist die Zeit geblieben, die du eigentlich für dein Unternehmen brauchst.</p>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#0A1628', lineHeight: 1.6 }}>Das kennen wir. Und genau dafür sind wir da.</p>
            </div>
          </div>
        </div>

        {/* Martin + Mission */}
        <div style={{ padding: '80px 24px', background: '#fff' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>Die Geschichte</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 900, color: '#0A1628', marginBottom: '32px', lineHeight: 1.2 }}>Böblingen, 2024.<br />Eine Mission beginnt.</h2>
            <p style={{ fontSize: '18px', color: '#374151', lineHeight: 1.8, marginBottom: '24px' }}>Martin Gaspar hat jahrelang gesehen, wie der deutsche Mittelstand kämpft — nicht wegen schlechter Produkte oder mangelndem Einsatz, sondern wegen fehlender Werkzeuge. Während Großkonzerne Millionen in KI investierten, blieb der Mittelstand zurück.</p>
            <div style={{ background: '#0A1628', borderRadius: '16px', padding: '32px', marginBottom: '24px' }}>
              <p style={{ fontSize: '22px', fontWeight: 700, color: '#C9A84C', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
                &ldquo;Jedes Unternehmen verdient eine Crew, die niemals schläft.&rdquo;
              </p>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '16px', marginBottom: 0 }}>Martin Gaspar, Gründer ARGONAUT OS</p>
            </div>
            <p style={{ fontSize: '18px', color: '#374151', lineHeight: 1.8 }}>ARGONAUT OS entstand aus dieser einen Überzeugung — und wird heute täglich weiterentwickelt, damit du morgen besser aufgestellt bist als gestern.</p>
          </div>
        </div>

        {/* Zahlen Banner */}
        <div style={{ background: '#0A1628', padding: '60px 24px' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px', textAlign: 'center' }}>
            {[
              { zahl: '2.100', label: 'Automatisierungen bereit', sub: 'individuell anpassbar — für jede Branche' },
              { zahl: '24h', label: 'Go-Live-Garantie', sub: 'Sie erhalten eine E-Mail — sobald alles läuft' },
              { zahl: '110', label: 'Branchen abgedeckt', sub: 'eine Lösung — maßgeschneidert für Sie' },
              { zahl: '24/7', label: 'Ihre Crew im Einsatz', sub: 'non-stop — auch wenn Sie schlafen' },
            ].map(({ zahl, label, sub }) => (
              <div key={zahl}>
                <p style={{ fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', fontWeight: 900, color: '#C9A84C', marginBottom: '8px' }}>{zahl}</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>{label}</p>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Wir sind deine Crew */}
        <div style={{ padding: '80px 24px', background: '#faf9f6' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '16px' }}>Unser Versprechen</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 900, color: '#0A1628', marginBottom: '32px', lineHeight: 1.2 }}>Wir sind deine Crew.</h2>
            <p style={{ fontSize: '18px', color: '#374151', lineHeight: 1.8, marginBottom: '24px' }}>Wie die Argonauten damals — an deiner Seite, jeden Tag, 24/7. Nicht als Software. Als Partner. Wir denken mit, wir handeln, wir liefern. Während du schläfst, während du mit Kunden sprichst, während du dein Unternehmen führst.</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#0A1628', lineHeight: 1.6 }}>Du gibst die Richtung vor. Wir sorgen dafür, dass du ankommst.</p>
          </div>
        </div>

        {/* CTA */}
        <div style={{ background: '#0A1628', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 900, color: '#fff', marginBottom: '20px', lineHeight: 1.2 }}>Deine Mission wartet.</h2>
            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: '40px' }}>Lass uns gemeinsam dein Unternehmen skalieren, automatisieren und auf das nächste Level bringen — damit du wieder das tun kannst, wofür du ursprünglich angetreten bist.</p>
            <Link href='/#preise' style={{ background: '#C9A84C', color: '#0A1628', fontWeight: 900, fontSize: '16px', padding: '18px 48px', borderRadius: '999px', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-block' }}>
              Jetzt starten — Crew beitreten
            </Link>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginTop: '24px' }}>ARGONAUT OS — Deine Crew. Dein Weg. Dein Goldenes Vlies. 🔱</p>
          </div>
        </div>

      </main>
      <Footer />
    </>
  )
}