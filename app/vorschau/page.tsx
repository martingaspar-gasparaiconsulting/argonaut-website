import type { Metadata } from 'next'

// ============================================================================
// ARGONAUT OS · app/vorschau/page.tsx — NEUE WEBSITE (Parallel-Bau / Vorschau)
//
// Diese Route liegt NICHT im proxy.ts-Matcher -> sie wird NICHT auf /baustelle
// umgeschrieben und ist fuer dich sofort live erreichbar:
//      https://www.argonaut-os.com/vorschau
// Die echte Homepage ('/') bleibt unangetastet hinter der Baustelle.
// robots: noindex/nofollow -> Google sieht die Vorschau nicht.
//
// STAND: SCHRITT 1 — nur der HERO. Weitere Abschnitte folgen einzeln,
// jeder sauber geprueft, bevor der naechste kommt.
//
// Selbsttragende Inline-Styles + ein <style>-Block (Keyframes/Responsive) —
// keine neuen Abhaengigkeiten, kein Build-Risiko. Schriften (Syne/DM Sans)
// kommen aus dem Root-Layout ueber die CSS-Variablen --font-syne/--font-dm-sans.
// ============================================================================

export const metadata: Metadata = {
  title: 'ARGONAUT OS — Vorschau',
  description: 'Das Betriebssystem, das jedes Unternehmen haben wird.',
  robots: { index: false, follow: false },
}

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

export default function VorschauPage() {
  return (
    <main
      style={{
        background: NAVY,
        color: '#EAF1F6',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        fontWeight: 300,
        minHeight: '100dvh',
        overflowX: 'hidden',
      }}
    >
      <style>{`
        @keyframes argPulse { 0%{transform:scale(.55);opacity:.85} 100%{transform:scale(1.5);opacity:0} }
        @keyframes argShimmer { 0%,100%{opacity:.45} 50%{opacity:1} }
        @keyframes argFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }

        .arg-wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

        .arg-hero {
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: 56px;
          align-items: center;
          padding: 140px 0 96px;
        }
        .arg-eyebrow { letter-spacing: .28em; }
        .arg-h1 {
          font-family: var(--font-syne), var(--font-dm-sans), sans-serif;
          font-weight: 700;
          font-size: clamp(2.3rem, 5.2vw, 4rem);
          line-height: 1.06;
          letter-spacing: -0.01em;
          margin: 0 0 1.3rem;
        }
        .arg-sub {
          font-size: clamp(1.02rem, 1.9vw, 1.28rem);
          line-height: 1.55;
          color: #b9cdd6;
          max-width: 30ch;
          margin: 0 0 2.2rem;
        }
        .arg-card { animation: argFloat 7s ease-in-out infinite; }
        .arg-eye .ring {
          position: absolute; inset: 0; border-radius: 50%;
          border: 1px solid rgba(122,163,179,.55);
          animation: argPulse 3s ease-out infinite;
        }
        .arg-eye .ring2 { animation-delay: 1.5s; }
        .arg-divider { animation: argShimmer 3.4s ease-in-out infinite; }

        @media (max-width: 900px) {
          .arg-hero { grid-template-columns: 1fr; gap: 40px; padding: 116px 0 72px; }
          .arg-card { order: 2; }
        }
      `}</style>

      {/* ===================== HERO ===================== */}
      <section
        style={{
          position: 'relative',
          background:
            'radial-gradient(1100px 560px at 22% -6%, rgba(201,168,76,0.12), transparent 60%), radial-gradient(900px 500px at 92% 8%, rgba(122,163,179,0.10), transparent 60%)',
        }}
      >
        <div className="arg-wrap">
          <div className="arg-hero">

            {/* ---------- LINKS: Botschaft ---------- */}
            <div>
              <div
                className="arg-eyebrow"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '10px',
                  fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase',
                  color: GOLD, marginBottom: '1.8rem',
                }}
              >
                <span aria-hidden="true">🔱</span> ARGONAUT&nbsp;OS
              </div>

              <h1 className="arg-h1">
                Das Betriebssystem,<br />
                das <span style={{ color: GOLD }}>jedes Unternehmen</span><br />
                haben wird.
              </h1>

              <p className="arg-sub">
                Ein System statt zwölf. Ihre Crew, die niemals schläft.
                Entwickelt für den deutschen Mittelstand.
              </p>

              {/* CTAs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '2.2rem' }}>
                <a
                  href="#demo"
                  style={{
                    background: GOLD, color: NAVY, fontWeight: 600, fontSize: '0.98rem',
                    padding: '15px 30px', borderRadius: '10px', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: '10px',
                    boxShadow: '0 10px 30px rgba(201,168,76,0.25)',
                  }}
                >
                  Demo buchen <span aria-hidden="true">→</span>
                </a>
                <a
                  href="#plattform"
                  style={{
                    background: 'transparent', color: '#EAF1F6', fontWeight: 500, fontSize: '0.98rem',
                    padding: '15px 26px', borderRadius: '10px', textDecoration: 'none',
                    border: '1px solid rgba(234,241,246,0.22)',
                    display: 'inline-flex', alignItems: 'center', gap: '10px',
                  }}
                >
                  <span aria-hidden="true" style={{ color: GOLD }}>▶</span> Plattform ansehen
                </a>
              </div>

              {/* Vertrauens-Zeile */}
              <div
                style={{
                  display: 'flex', flexWrap: 'wrap', gap: '10px 22px',
                  fontSize: '0.86rem', color: TEAL,
                }}
              >
                {['DSGVO-konform', 'EU-Hosting', 'Rollen & Rechte', 'Audit-Trails'].map((t) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span aria-hidden="true" style={{ color: GOLD }}>✓</span> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* ---------- RECHTS: Lebendes Dashboard ---------- */}
            <div
              className="arg-card"
              style={{
                background: 'linear-gradient(160deg, rgba(18,32,54,0.95), rgba(10,22,40,0.92))',
                border: '1px solid rgba(201,168,76,0.20)',
                borderRadius: '18px',
                padding: '22px',
                boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
              }}
            >
              {/* Kopf: Assistent + Auge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <span style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: TEAL }}>
                  🔱 ARGONAUT · KI-Assistent
                </span>
                <div className="arg-eye" style={{ position: 'relative', width: '52px', height: '52px' }}>
                  <span className="ring" />
                  <span className="ring ring2" />
                  <span
                    style={{
                      position: 'absolute', inset: '14px', borderRadius: '50%',
                      background: `radial-gradient(circle at 50% 45%, #d7eef7, ${TEAL} 58%, transparent 74%)`,
                      boxShadow: `0 0 20px rgba(122,163,179,0.75)`,
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute', inset: '22px', borderRadius: '50%',
                      background: NAVY,
                    }}
                  />
                </div>
              </div>

              {/* Begruessung */}
              <p style={{ fontSize: '1.15rem', fontWeight: 500, margin: '0 0 4px', color: '#EAF1F6' }}>
                Guten Morgen, Martin.
              </p>
              <p style={{ fontSize: '0.9rem', color: '#8fa9b6', margin: '0 0 18px' }}>
                Ich habe 12 relevante Updates für dich.
              </p>

              {/* KPI-Kacheln */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {[
                  { k: 'Offene Aufgaben', v: '24' },
                  { k: 'Automatisierungen', v: '17' },
                  { k: 'Einsparpotenzial', v: '€ 38.420' },
                ].map((kpi) => (
                  <div
                    key={kpi.k}
                    style={{
                      background: 'rgba(122,163,179,0.08)',
                      border: '1px solid rgba(122,163,179,0.14)',
                      borderRadius: '12px', padding: '12px 10px',
                    }}
                  >
                    <p style={{ fontSize: '0.66rem', color: '#8fa9b6', margin: '0 0 6px', lineHeight: 1.2 }}>{kpi.k}</p>
                    <p style={{ fontSize: '1.05rem', fontWeight: 600, color: GOLD, margin: 0 }}>{kpi.v}</p>
                  </div>
                ))}
              </div>

              {/* Aktivitaeten */}
              <div style={{ borderTop: '1px solid rgba(234,241,246,0.08)', paddingTop: '12px', marginBottom: '16px' }}>
                {[
                  { t: 'Rechnungslauf abgeschlossen', z: 'vor 5 Min.' },
                  { t: '23 Bewerbungen vorsortiert', z: 'vor 18 Min.' },
                ].map((a) => (
                  <div key={a.t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
                    <span style={{ fontSize: '0.84rem', color: '#c4d3db', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span aria-hidden="true" style={{ color: GOLD }}>✓</span> {a.t}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: '#6f8794' }}>{a.z}</span>
                  </div>
                ))}
              </div>

              {/* Befehls-Eingabe */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(234,241,246,0.05)', border: '1px solid rgba(234,241,246,0.12)',
                  borderRadius: '10px', padding: '11px 14px',
                }}
              >
                <span style={{ fontSize: '0.84rem', color: '#7f97a4' }}>Frag ARGONAUT oder gib einen Befehl ein …</span>
                <span aria-hidden="true" style={{ color: GOLD }}>➤</span>
              </div>
            </div>

          </div>
        </div>

        {/* Abschluss-Trenner (Auge-Shimmer wie auf der Baustelle) */}
        <div className="arg-wrap" style={{ paddingBottom: '46px', textAlign: 'center' }}>
          <div
            className="arg-divider"
            style={{
              width: '64px', height: '2px', borderRadius: '2px', margin: '0 auto',
              background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            }}
          />
        </div>
      </section>

      {/* Weitere Abschnitte folgen in den naechsten Schritten:
          2) Ein System statt zwoelf  3) Module  4) Ersparnis-Rechner
          5) Das Auge/Crew  6) So einfach der Start  7) Ergebnisse
          8) Branchen  9) Preise  10) Vertrauen  11) Abschluss */}
    </main>
  )
}
