'use client'

import { useState, useEffect } from 'react'

const pakete = [
  { name: 'STARTER', preis: 1500, farbe: '#6b7280' },
  { name: 'PROFESSIONAL', preis: 2500, farbe: '#C9A84C' },
  { name: 'BUSINESS', preis: 4500, farbe: '#C9A84C' },
  { name: 'ENTERPRISE', preis: 7500, farbe: '#C9A84C' },
]

const beispiele = [
  {
    icon: '🏥',
    branche: 'Arztpraxis',
    beschreibung: '5 Standorte, eine Patientenverwaltung',
    detail: 'Jede Praxis läuft autonom — Termine, Dokumente, Abrechnung. Die Zentrale sieht alles auf einen Blick.',
  },
  {
    icon: '💪',
    branche: 'Fitnessstudio',
    beschreibung: '3 Studios, ein Mitgliedersystem',
    detail: 'Mitglieder können in jedem Studio einchecken. Marketing läuft zentral. Jedes Studio behält seine eigene Kasse.',
  },
  {
    icon: '🔧',
    branche: 'Handwerksbetrieb',
    beschreibung: '4 Filialen, ein Auftragssystem',
    detail: 'Aufträge werden zentral vergeben, lokal abgewickelt. Materialbestellung, Zeiterfassung und Rechnungen laufen automatisch.',
  },
  {
    icon: '🏨',
    branche: 'Hotel-Gruppe',
    beschreibung: '8 Häuser, eine Buchungsplattform',
    detail: 'Verfügbarkeiten, Preise, Gästekommunikation — alles zentral gesteuert. Jedes Haus behält sein eigenes Team.',
  },
]

export default function MultistandortPage() {
  const [selectedStandorte, setSelectedStandorte] = useState(5)
  const [selectedPaket, setSelectedPaket] = useState(pakete[1])

  const basis = 1500
  const gesamtBasis = basis * selectedStandorte
  const gesamtPaket = selectedPaket.preis * selectedStandorte
  const gesamtMonatlich = gesamtBasis + gesamtPaket
  const setupGebuehr = selectedStandorte <= 3 ? 2500 : selectedStandorte <= 5 ? 4500 : 7500

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://js-eu1.hsforms.net/forms/embed/146991109.js'
    script.defer = true
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return (
    <main style={{
      background: '#0A1628',
      minHeight: '100vh',
      fontFamily: 'var(--font-dm-sans), sans-serif',
      color: '#ffffff',
    }}>

      {/* HERO */}
      <section style={{
        position: 'relative',
        padding: '120px 24px 80px',
        textAlign: 'center',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(201,168,76,0.1)',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: '999px',
          padding: '6px 16px',
          marginBottom: '32px',
        }}>
          <span style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Multistandort-Lösung
          </span>
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 5rem)',
          fontWeight: 700,
lineHeight: 1.05,
marginBottom: '24px',
fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
letterSpacing: '-0.02em',
        }}>
          Ein Gehirn.<br />
          <span style={{ color: '#C9A84C' }}>Viele Standorte.</span>
        </h1>

        <p style={{
          fontSize: 'clamp(16px, 2vw, 20px)',
          color: 'rgba(255,255,255,0.6)',
          maxWidth: '600px',
          margin: '0 auto 48px',
          lineHeight: 1.7,
        }}>
          ARGONAUT verbindet alle Ihre Standorte zu einem intelligenten Netzwerk — jeder Standort autonom, alle gemeinsam gesteuert.
        </p>

        {/* Video Placeholder */}
        <div style={{
          maxWidth: '760px',
          margin: '0 auto 80px',
          aspectRatio: '16/9',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(201,168,76,0.05) 0%, transparent 50%, rgba(10,22,40,0.5) 100%)',
          }} />
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(201,168,76,0.15)',
            border: '2px solid rgba(201,168,76,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            position: 'relative',
          }}>▶</div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase', position: 'relative' }}>
            Video folgt in Kürze
          </p>
        </div>
      </section>

      {/* WIE ES FUNKTIONIERT */}
      <section style={{ padding: '80px 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
            Das Konzept
          </p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 700, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', letterSpacing: '-0.02em' }}>Jeder Standort ist eigenständig.<br />Gemeinsam sind sie unschlagbar.</h2></div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}>
          {['Standort A', 'Standort B', 'Standort C', 'Standort D'].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
                fontSize: '20px',
              }}>🏢</div>
              <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>{s}</p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Eigene Automatisierung</p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Eigene Daten</p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Eigenes Team</p>
            </div>
          ))}
        </div>

        <div style={{
          background: 'linear-gradient(135deg, rgba(201,168,76,0.1) 0%, rgba(201,168,76,0.05) 100%)',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: '16px',
          padding: '40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🧠</div>
          <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#C9A84C', marginBottom: '12px', fontFamily: 'var(--font-syne), sans-serif' }}>
            ARGONAUT Zentral-Hub
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.6)', maxWidth: '500px', margin: '0 auto', lineHeight: 1.7 }}>
            Die Geschäftsführung sieht alle Standorte in einem Dashboard. Kein Standort kann in die Automatisierung eines anderen eingreifen — nur die Zentrale hat den Überblick.
          </p>
        </div>
      </section>

      {/* BEISPIELE */}
      <section style={{ padding: '80px 24px', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Beispiele
            </p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900, fontFamily: 'var(--font-syne), sans-serif' }}>
              Für welche Betriebe?
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
            {beispiele.map((b, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '32px',
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,168,76,0.4)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
              >
                <div style={{ fontSize: '36px', marginBottom: '16px' }}>{b.icon}</div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px', color: '#C9A84C' }}>{b.branche}</h3>
                <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'rgba(255,255,255,0.8)' }}>{b.beschreibung}</p>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{b.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PREISRECHNER */}
      <section style={{ padding: '80px 24px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
            Pricing
          </p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900, fontFamily: 'var(--font-syne), sans-serif' }}>
            Ihr individuelles Paket
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '16px' }}>
            Alle Standorte müssen dasselbe Paket buchen. Basis (1.500€) ist immer Pflicht.
          </p>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: '20px',
          padding: '40px',
        }}>
          <div style={{ marginBottom: '40px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
              Anzahl Standorte
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {[2, 3, 4, 5, 7, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedStandorte(n)}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '8px',
                    border: selectedStandorte === n ? '2px solid #C9A84C' : '1px solid rgba(255,255,255,0.12)',
                    background: selectedStandorte === n ? 'rgba(201,168,76,0.15)' : 'transparent',
                    color: selectedStandorte === n ? '#C9A84C' : 'rgba(255,255,255,0.5)',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '40px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
              Paket (für alle Standorte)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              {pakete.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setSelectedPaket(p)}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: selectedPaket.name === p.name ? '2px solid #C9A84C' : '1px solid rgba(255,255,255,0.1)',
                    background: selectedPaket.name === p.name ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.02)',
                    color: '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left',
                  }}
                >
                  <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: selectedPaket.name === p.name ? '#C9A84C' : 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                    {p.name}
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: 900 }}>{p.preis.toLocaleString('de-DE')}€</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>/ Monat</p>
                </button>
              ))}
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.05) 100%)',
            border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: '16px',
            padding: '32px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              <div>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>Basis × {selectedStandorte}</p>
                <p style={{ fontSize: '20px', fontWeight: 700 }}>{gesamtBasis.toLocaleString('de-DE')} €</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>{selectedPaket.name} × {selectedStandorte}</p>
                <p style={{ fontSize: '20px', fontWeight: 700 }}>{gesamtPaket.toLocaleString('de-DE')} €</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>Setup-Gebühr (einmalig)</p>
                <p style={{ fontSize: '20px', fontWeight: 700 }}>{setupGebuehr.toLocaleString('de-DE')} €</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#C9A84C', fontWeight: 700, marginBottom: '4px' }}>Gesamt / Monat</p>
                <p style={{ fontSize: '28px', fontWeight: 900, color: '#C9A84C' }}>{gesamtMonatlich.toLocaleString('de-DE')} €</p>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
              Alle Preise zzgl. 19% MwSt. · Zentral-Hub inklusive ab 3 Standorten
            </p>
          </div>
        </div>
      </section>

      {/* WHITE LABEL */}
      <section style={{ padding: '80px 24px', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(201,168,76,0.1)',
            border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: '999px',
            padding: '6px 16px',
            marginBottom: '32px',
          }}>
            <span style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Nur 50 Plätze verfügbar
            </span>
          </div>

          <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900, fontFamily: 'var(--font-syne), sans-serif', marginBottom: '24px' }}>
            White Label Partner
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '40px', fontSize: '18px' }}>
            Vermarkten Sie ARGONAUT unter Ihrem eigenen Brand. Perfekt für Unternehmensgruppen, die ihre eigene KI-Lösung anbieten möchten — ohne Entwicklungskosten.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            {[
              { label: 'Einmalige Lizenzgebühr', wert: '50.000 €' },
              { label: 'Monatliche Lizenz', wert: '12.000 €' },
              { label: 'Provision pro Kunde', wert: '10 %' },
              { label: 'Verfügbare Plätze', wert: '50 max.' },
            ].map((item, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(201,168,76,0.2)',
                borderRadius: '12px',
                padding: '24px',
              }}>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>{item.label}</p>
                <p style={{ fontSize: '24px', fontWeight: 900, color: '#C9A84C' }}>{item.wert}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WARUM EIN GESPRÄCH */}
      <section style={{ padding: '80px 24px', maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900, fontFamily: 'var(--font-syne), sans-serif', marginBottom: '24px' }}>
          Warum 15–20 Minuten?
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, fontSize: '18px', marginBottom: '48px' }}>
          Jedes Multistandort-Setup ist einzigartig. In einem kurzen Gespräch klären wir Ihre genaue Struktur, welche Standorte verbunden werden sollen und wie die Zentrale gesteuert wird. Kein Verkaufsgespräch — nur technische Klärung damit wir sofort loslegen können.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', marginBottom: '48px' }}>
          {[
            '✓ Welche Standorte werden verbunden?',
            '✓ Welche Daten bleiben lokal, welche zentral?',
            '✓ Wer hat welche Zugriffsrechte?',
            '✓ Wann können wir starten?',
          ].map((punkt, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '16px 24px',
              width: '100%',
              maxWidth: '500px',
              textAlign: 'left',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '15px',
            }}>
              {punkt}
            </div>
          ))}
        </div>

        <a
          href="#kontakt"
          style={{
            display: 'inline-block',
            background: '#C9A84C',
            color: '#0A1628',
            fontWeight: 700,
            fontSize: '13px',
            padding: '20px 48px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            marginBottom: '16px',
          }}
        >
          Jetzt Gespräch vereinbaren
        </a>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
          Martin Gaspar · ARGONAUT · 71032 Böblingen
        </p>
      </section>

      {/* KONTAKT FORMULAR */}
      <section id="kontakt" style={{ padding: '80px 24px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
            Kontakt
          </p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900, fontFamily: 'var(--font-syne), sans-serif' }}>
            Gespräch vereinbaren
          </h2>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '48px',
        }}>
          <div
            className="hs-form-frame"
            data-region="eu1"
            data-form-id="5f732c8a-0994-46b0-a4d4-c37e23b804a7"
            data-portal-id="146991109"
          />
        </div>
      </section>

    </main>
  )
}
