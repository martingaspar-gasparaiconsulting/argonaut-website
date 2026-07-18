import type { Metadata } from 'next'
import ErsparnisRechner from './_components/ErsparnisRechner'
import AngebotRechner from './_components/AngebotRechner'
import Navbar from './_components/Navbar'
import AnfrageFormular from './_components/AnfrageFormular'

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

const FAQ: { q: string; a: string }[] = [
  { q: 'Für wen ist ARGONAUT OS?', a: 'Für den deutschen Mittelstand — vom Einzelunternehmer bis zum Betrieb mit mehreren hundert Mitarbeitern. ARGONAUT ist für über 690 Branchen vorkonfiguriert.' },
  { q: 'Was kostet ARGONAUT?', a: 'Eine monatliche Grundgebühr nach Betriebsgröße plus die Nutzer-Sitze, die Sie brauchen — ab 499 € im Monat für Einzelunternehmer. Die KI-Nutzung ist unbegrenzt inklusive.' },
  { q: 'Ist die KI wirklich unbegrenzt inklusive?', a: 'Ja. Kein Kontingent, keine nutzungsabhängigen Zusatzkosten. Sie arbeiten so viel Sie wollen.' },
  { q: 'Wo liegen meine Daten?', a: 'Auf deutschen Servern, DSGVO-konform. Ihre Daten bleiben in Deutschland.' },
  { q: 'Wie läuft die Einführung?', a: 'Persönlich mit Ihnen — Erstgespräch, Einrichtung, Datenübernahme und Einweisung. Keine Installation, kein IT-Projekt. Bis 1 TB Datenübernahme ist inklusive.' },
  { q: 'Brauche ich IT-Kenntnisse?', a: 'Nein. Wir richten ARGONAUT mit Ihnen ein und begleiten den Start. Die Bedienung ist für jeden gedacht, nicht nur für IT-Profis.' },
  { q: 'Kann ich später erweitern?', a: 'Jederzeit. Sitze, Speicher und Funktionen lassen sich flexibel dazubuchen — das System wächst mit Ihrem Betrieb.' },
]

export default function VorschauPage() {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
  return (
    <main
      id="top"
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

        /* --- Schritt 2: Ein System statt zwoelf --- */
        .arg-consolidate { padding: 76px 0 88px; text-align: center; }
        .arg-h2 {
          font-family: var(--font-dm-sans), sans-serif;
          font-weight: 700; font-size: clamp(1.8rem, 4vw, 2.9rem);
          line-height: 1.25; padding-bottom: 2px; margin: 0 0 .9rem;
        }
        .arg-vs { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 30px; margin-top: 50px; }
        .arg-chaos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .arg-chip {
          background: rgba(122,163,179,0.06); border: 1px solid rgba(122,163,179,0.14);
          border-radius: 9px; padding: 12px 8px; font-size: .8rem; color: #90a6b2;
          animation: argShimmer 3.2s ease-in-out infinite;
        }
        .arg-arrow { font-size: 2.1rem; color: #c9a84c; }
        @media (max-width: 760px) {
          .arg-vs { grid-template-columns: 1fr; gap: 22px; }
          .arg-arrow { transform: rotate(90deg); }
        }

        /* --- Schritt 3: Module-Kacheln --- */
        .arg-modules { padding: 8px 0 96px; text-align: center; }
        .arg-mod-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 48px; text-align: left; }
        .arg-mod {
          background: linear-gradient(160deg, rgba(18,32,54,0.70), rgba(10,22,40,0.60));
          border: 1px solid rgba(122,163,179,0.14); border-radius: 16px; padding: 26px 22px;
          transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
        }
        .arg-mod:hover { transform: translateY(-4px); border-color: rgba(201,168,76,0.50); box-shadow: 0 18px 40px rgba(0,0,0,0.40); }
        .arg-mod-icon { color: #c9a84c; margin-bottom: 15px; }
        .arg-mod h3 { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: 1.2rem; line-height: 1.3; color: #EAF1F6; margin: 0 0 6px; }
        .arg-mod p { font-size: .9rem; color: #90a6b2; margin: 0; line-height: 1.5; }
        @media (max-width: 860px) { .arg-mod-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .arg-mod-grid { grid-template-columns: 1fr; } }
        .arg-more { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 14px; }
        .arg-more-chip { background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.22); color: #d8c88a; border-radius: 999px; padding: 7px 14px; font-size: .82rem; }

        /* --- Schritt 5: Das Auge / Crew --- */
        .arg-crew { padding: 40px 0 104px; text-align: center; }
        .arg-bigeye { position: relative; width: 130px; height: 130px; margin: 0 auto 34px; }
        .arg-pillars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 54px; text-align: left; }
        .arg-pillar { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.12); border-radius: 14px; padding: 24px 22px; }
        .arg-pillar h3 { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: 1.08rem; line-height: 1.35; color: #EAF1F6; margin: 12px 0 8px; }
        .arg-pillar p { font-size: .9rem; color: #90a6b2; margin: 0; line-height: 1.55; }
        @media (max-width: 760px) { .arg-pillars { grid-template-columns: 1fr; } }

        /* --- Schritt 6: So einfach der Start --- */
        .arg-steps { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 52px; }
        .arg-steps-line { position: absolute; top: 26px; left: 13%; right: 13%; height: 2px; background: linear-gradient(90deg, transparent, rgba(201,168,76,0.45), transparent); z-index: 0; }
        .arg-step { position: relative; z-index: 1; text-align: center; padding: 0 6px; }
        .arg-step-num { width: 52px; height: 52px; border-radius: 50%; border: 2px solid rgba(201,168,76,0.55); background: #0A1628; color: #c9a84c; display: flex; align-items: center; justify-content: center; font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: 1.2rem; margin: 0 auto 16px; }
        .arg-step h3 { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: 1.05rem; line-height: 1.3; color: #EAF1F6; margin: 0 0 6px; }
        .arg-step p { font-size: .88rem; color: #90a6b2; line-height: 1.5; margin: 0; }
        @media (max-width: 760px) {
          .arg-steps { grid-template-columns: 1fr; gap: 26px; }
          .arg-steps-line { display: none; }
        }

        /* --- Schritt 7: Ausschnitt vs. Ganzes (Fakten-Beweis) --- */
        .arg-facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 50px 0 36px; }
        .arg-fact { background: linear-gradient(160deg, rgba(18,32,54,0.6), rgba(10,22,40,0.5)); border: 1px solid rgba(201,168,76,0.18); border-radius: 14px; padding: 26px 18px; text-align: center; }
        .arg-fact .val { font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: clamp(1.5rem, 3.2vw, 2.1rem); color: #c9a84c; line-height: 1.15; margin: 0 0 8px; }
        .arg-fact .lab { font-size: .86rem; color: #90a6b2; line-height: 1.45; margin: 0; }
        @media (max-width: 760px) { .arg-facts { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 440px) { .arg-facts { grid-template-columns: 1fr; } }

        /* --- Schritt 9: Preise --- */
        .arg-price-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 44px; text-align: left; }
        .arg-price-card { background: linear-gradient(160deg, rgba(18,32,54,0.7), rgba(10,22,40,0.6)); border: 1px solid rgba(122,163,179,0.14); border-radius: 16px; padding: 24px 22px; }
        .arg-price-card.hot { border-color: rgba(201,168,76,0.55); box-shadow: 0 0 40px rgba(201,168,76,0.12); }
        .arg-price-card .nm { font-size: .78rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #c9a84c; margin: 0 0 4px; }
        .arg-price-card .ma { font-size: .84rem; color: #8fa9b6; margin: 0 0 14px; }
        .arg-price-card .pr { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: 1.9rem; color: #EAF1F6; margin: 0; line-height: 1; }
        .arg-price-card .pr span { font-size: .9rem; color: #8fa9b6; font-weight: 400; }
        .arg-price-card .nt { font-size: .82rem; color: #90a6b2; margin: 8px 0 0; }
        .arg-incl { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 22px; margin-top: 36px; font-size: .9rem; color: #c4d3db; }
        @media (max-width: 860px) { .arg-price-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .arg-price-grid { grid-template-columns: 1fr; } }
        .arg-seats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; text-align: left; }
        .arg-seat { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.12); border-radius: 14px; padding: 20px; }
        .arg-seat .st-nm { font-weight: 700; color: #EAF1F6; margin: 0 0 4px; }
        .arg-seat .st-who { font-size: .82rem; color: #8fa9b6; margin: 0 0 12px; line-height: 1.5; }
        .arg-seat .st-pr { color: #c9a84c; font-weight: 700; font-size: 1.1rem; margin: 0; }
        .arg-setup { background: rgba(201,168,76,0.05); border: 1px solid rgba(201,168,76,0.20); border-radius: 14px; padding: 22px 24px; margin-top: 26px; text-align: left; }
        @media (max-width: 760px) { .arg-seats { grid-template-columns: 1fr; } }

        /* --- Schritt 10: Vertrauen --- */
        .arg-trust-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 44px; text-align: left; }
        .arg-trust { background: rgba(122,163,179,0.05); border: 1px solid rgba(122,163,179,0.12); border-radius: 14px; padding: 24px 20px; }
        .arg-trust-icon { color: #c9a84c; margin-bottom: 14px; }
        .arg-trust h3 { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: 1.05rem; line-height: 1.3; color: #EAF1F6; margin: 0 0 6px; }
        .arg-trust p { font-size: .86rem; color: #90a6b2; margin: 0; line-height: 1.5; }
        @media (max-width: 860px) { .arg-trust-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .arg-trust-grid { grid-template-columns: 1fr; } }

        /* --- Schritt 11: Abschluss / Footer --- */
        .arg-footer { border-top: 1px solid rgba(122,163,179,0.14); margin-top: 40px; padding: 40px 0; }
        .arg-footer-links { display: flex; flex-wrap: wrap; gap: 10px 22px; justify-content: center; }
        .arg-footer-links a { color: #7aa3b3; text-decoration: none; font-size: .9rem; }
        .arg-footer-links a:hover { color: #c9a84c; }
      `}</style>

      <Navbar />

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
                  { k: 'Erledigte Aufgaben', v: '17' },
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

      {/* ============== SCHRITT 2 · EIN SYSTEM STATT ZWOELF ============== */}
      <section className="arg-consolidate">
        <div className="arg-wrap">
          <h2 className="arg-h2">
            Ein System statt <span style={{ color: GOLD }}>zwölf</span>.
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '44ch', margin: '0 auto', lineHeight: 1.55 }}>
            Zwölf Werkzeuge, zwölf Passwörter, zwölf Rechnungen. ARGONAUT ersetzt sie alle —
            und alles spricht endlich dieselbe Sprache.
          </p>

          <div className="arg-vs">
            {/* Links: das Chaos */}
            <div className="arg-chaos">
              {['E-Mail', 'Kalender', 'CRM', 'Buchhaltung', 'Lohn & HR', 'Lager / ERP', 'Angebote', 'Rechnungen', 'Projekte', 'Zeiterfassung', 'Dokumente', 'Analytics'].map((t, i) => (
                <div key={t} className="arg-chip" style={{ animationDelay: `${(i % 6) * 0.35}s` }}>{t}</div>
              ))}
            </div>

            {/* Mitte: Pfeil */}
            <div className="arg-arrow" aria-hidden="true">→</div>

            {/* Rechts: das eine System */}
            <div
              style={{
                background: 'linear-gradient(160deg, rgba(18,32,54,0.95), rgba(10,22,40,0.92))',
                border: '1px solid rgba(201,168,76,0.30)',
                borderRadius: '16px',
                padding: '34px 22px',
                boxShadow: '0 0 55px rgba(201,168,76,0.12)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              }}
            >
              <div className="arg-eye" style={{ position: 'relative', width: '58px', height: '58px' }}>
                <span className="ring" />
                <span className="ring ring2" />
                <span style={{ position: 'absolute', inset: '15px', borderRadius: '50%', background: `radial-gradient(circle at 50% 45%, #d7eef7, ${TEAL} 58%, transparent 74%)`, boxShadow: '0 0 22px rgba(122,163,179,0.75)' }} />
                <span style={{ position: 'absolute', inset: '24px', borderRadius: '50%', background: NAVY }} />
              </div>
              <p style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '1.15rem', color: '#EAF1F6', margin: 0, letterSpacing: '0.12em' }}>
                ARGONAUT&nbsp;OS
              </p>
              <p style={{ fontSize: '0.85rem', color: TEAL, margin: 0 }}>
                Ein Login. Ein System. Alles verbunden.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============== SCHRITT 3 · MODULE-KACHELN ============== */}
      <section id="module" className="arg-modules">
        <div className="arg-wrap">
          <h2 className="arg-h2">
            Alles, was Ihr Betrieb braucht. <span style={{ color: GOLD }}>In einem System.</span>
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '46ch', margin: '0 auto', lineHeight: 1.55 }}>
            Sechs Kern-Bereiche als Anker — und dutzende Werkzeuge darunter. Alles in einer Oberfläche, keine Schnittstellen, die reißen.
          </p>

          <div className="arg-mod-grid">
            {[
              {
                name: 'HR', desc: 'Mitarbeiter, Recruiting & Entwicklung',
                icon: (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="8" r="3" /><path d="M15 8a3 3 0 0 1 0 6" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M17 15c2.4.3 4 2.3 4 5" />
                  </svg>
                ),
              },
              {
                name: 'CRM', desc: 'Kunden, Leads & Opportunities',
                icon: (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
                  </svg>
                ),
              },
              {
                name: 'Rechnungen', desc: 'Angebote, Rechnungen & Mahnwesen',
                icon: (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6M9 8h2" />
                  </svg>
                ),
              },
              {
                name: 'ERP', desc: 'Wareneingang, Lager & Produktion',
                icon: (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8l9-5 9 5-9 5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
                  </svg>
                ),
              },
              {
                name: 'Finanzen', desc: 'Buchhaltung, Kosten & Controlling',
                icon: (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M15 9.2a4 4 0 1 0 0 5.6" /><path d="M7.5 11h6M7.5 13h5" />
                  </svg>
                ),
              },
              {
                name: 'Analytics', desc: 'Dashboards, KPIs & Prognosen',
                icon: (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4v16h16" /><path d="M8 16v-4" /><path d="M13 16V8" /><path d="M18 16v-7" />
                  </svg>
                ),
              },
            ].map((m) => (
              <div key={m.name} className="arg-mod">
                <div className="arg-mod-icon">{m.icon}</div>
                <h3>{m.name}</h3>
                <p>{m.desc}</p>
              </div>
            ))}
          </div>

          <p style={{ marginTop: '40px', fontSize: '.92rem', color: '#8fa9b6' }}>
            Und vieles mehr — alles im selben System:
          </p>
          <div className="arg-more">
            {['Marketing', 'Projekte', 'Dokumente', 'Termine & Kalender', 'Verträge', 'Service & Tickets', 'Leads', 'Zeiterfassung', 'Schichtplan', 'Dispo', 'Werkstatt', 'Wartung', 'Korrespondenz', 'Academy', 'GoBD & Kasse'].map((t) => (
              <span key={t} className="arg-more-chip">{t}</span>
            ))}
            <span className="arg-more-chip" style={{ color: '#c9a84c', borderColor: 'rgba(201,168,76,0.40)' }}>… und mehr</span>
          </div>
        </div>
      </section>

      {/* ============== SCHRITT 4 · ERSPARNIS-RECHNER ============== */}
      <ErsparnisRechner />

      {/* ============== SCHRITT 5 · DAS AUGE / IHRE CREW ============== */}
      <section className="arg-crew">
        <div className="arg-wrap">
          <div className="arg-bigeye arg-eye">
            <span className="ring" />
            <span className="ring ring2" />
            <span style={{ position: 'absolute', inset: '34px', borderRadius: '50%', background: `radial-gradient(circle at 50% 45%, #d7eef7, ${TEAL} 58%, transparent 74%)`, boxShadow: '0 0 42px rgba(122,163,179,0.70)' }} />
            <span style={{ position: 'absolute', inset: '54px', borderRadius: '50%', background: NAVY }} />
          </div>

          <h2 className="arg-h2">
            Ihre Crew, die <span style={{ color: GOLD }}>niemals schläft</span>.
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.6 }}>
            ARGONAUT ist mehr als Software. Es begrüßt Sie mit Namen, führt Sie durch jedes Modul, denkt mit —
            und wächst mit Ihnen. Ein Partner, der nie Feierabend macht.
          </p>

          <div className="arg-pillars">
            {[
              {
                title: 'Begrüßt Sie persönlich',
                desc: 'Kein kaltes Dashboard. ARGONAUT kennt Ihren Namen, Ihren Tag und was gerade wichtig ist.',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5h16v10H9l-5 4z" /><path d="M8 9h8M8 12h5" />
                  </svg>
                ),
              },
              {
                title: 'Führt Sie Schritt für Schritt',
                desc: 'Zehn Minuten am Tag reichen. Sie bestimmen das Tempo, pausieren jederzeit — ARGONAUT passt sich an.',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M6 8v3a4 4 0 0 0 4 4h4" />
                  </svg>
                ),
              },
              {
                title: 'Wächst mit Ihnen',
                desc: 'Vom Matrosen zum Kapitän — mit Zertifikaten, die zeigen, wie sicher Sie Ihr System beherrschen.',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 14l5-5 4 4 6-7" /><path d="M15 6h5v5" />
                  </svg>
                ),
              },
            ].map((p) => (
              <div key={p.title} className="arg-pillar">
                <div style={{ color: GOLD }}>{p.icon}</div>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============== SCHRITT 6 · SO EINFACH IST DER START ============== */}
      <section style={{ padding: '20px 0 100px', textAlign: 'center' }}>
        <div className="arg-wrap">
          <h2 className="arg-h2">
            So einfach ist der <span style={{ color: GOLD }}>Start</span>.
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '48ch', margin: '0 auto', lineHeight: 1.55 }}>
            Kein IT-Projekt, kein Handbuch — ein echter Ansprechpartner bringt Sie an Bord, dann führt Sie Ihre Crew.
          </p>

          <div className="arg-steps">
            <div className="arg-steps-line" aria-hidden="true" />
            {[
              { title: 'Persönlicher Start', desc: 'Erstgespräch, Video-Call oder Vor-Ort — wir richten ARGONAUT mit Ihnen ein. Keine Installation, kein IT-Projekt.' },
              { title: 'Das Auge begrüßt Sie', desc: 'ARGONAUT meldet sich mit Namen: „Sollen wir loslegen?" Sie entscheiden.' },
              { title: '10 Minuten am Tag', desc: 'In kleinen Etappen durchs System — pausierbar, ganz in Ihrem Tempo.' },
              { title: 'Vom Matrosen zum Kapitän', desc: 'Zertifikate zeigen Ihren Fortschritt. Nach einem Jahr können Sie mehr als die meisten Profis.' },
            ].map((s, i) => (
              <div key={s.title} className="arg-step">
                <div className="arg-step-num">{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============== SCHRITT 7 · AUSSCHNITT VS. GANZES (BEWEIS) ============== */}
      <section style={{ padding: '20px 0 100px', textAlign: 'center' }}>
        <div className="arg-wrap">
          <h2 className="arg-h2">
            Ein Ausschnitt kostet oft mehr als <span style={{ color: GOLD }}>das Ganze</span>.
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '54ch', margin: '0 auto', lineHeight: 1.6 }}>
            Andere verkaufen nur CRM. Oder nur ERP. Oder nur HR — jedes mit eigenem Vertrag, eigener Rechnung, eigenem Login.
            ARGONAUT verzahnt alles in einem System.
          </p>

          <div className="arg-facts">
            {[
              { val: '24/7', lab: 'Ihre KI-Crew ist immer an Bord' },
              { val: 'Unbegrenzt', lab: 'KI inklusive — keine Nachzahlung pro Aktion' },
              { val: '100 %', lab: 'DSGVO-konform · EU-Hosting · Audit-Trails' },
              { val: '1 statt 12', lab: 'Ein System, ein Login, ein Preis' },
            ].map((f) => (
              <div key={f.lab} className="arg-fact">
                <p className="val">{f.val}</p>
                <p className="lab">{f.lab}</p>
              </div>
            ))}
          </div>

          <a
            href="/vorschau/vergleich"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: 'transparent', color: '#EAF1F6', fontWeight: 500, fontSize: '0.98rem',
              padding: '14px 28px', borderRadius: '10px', textDecoration: 'none',
              border: '1px solid rgba(201,168,76,0.45)',
            }}
          >
            Vollständiger Preis- &amp; Leistungsvergleich <span aria-hidden="true" style={{ color: GOLD }}>→</span>
          </a>
        </div>
      </section>

      {/* ============== SCHRITT 8 · BRANCHEN ============== */}
      <section className="arg-modules">
        <div className="arg-wrap">
          <h2 className="arg-h2">
            Für Ihre Branche gemacht. <span style={{ color: GOLD }}>205 Branchen.</span>
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.55 }}>
            Vom Handwerk bis zur Industrie — ARGONAUT kommt vorkonfiguriert für Ihren Betrieb, statt als leere Hülle, die Sie erst mühsam einrichten.
          </p>

          <div className="arg-mod-grid">
            {[
              {
                name: 'Handwerk', desc: 'Angebote, Aufmaß, Einsätze & Rechnung — mobil von der Baustelle.',
                icon: (<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.5 2.5-2-2 2.5-2.5z" /></svg>),
              },
              {
                name: 'Produktion', desc: 'Aufträge, Lager, Fertigung & Kennzahlen in Echtzeit.',
                icon: (<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>),
              },
              {
                name: 'Handel & E-Commerce', desc: 'Warenwirtschaft, Bestellungen & Rechnungen verzahnt.',
                icon: (<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M3 4h2l2.4 12h10l2-8H6" /></svg>),
              },
              {
                name: 'Gastronomie & Hotels', desc: 'Tische, Buchungen, Personal & Abrechnung — alles an einem Ort.',
                icon: (<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h11v4a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" /><path d="M16 9h2a2 2 0 1 1 0 4h-2" /><path d="M7 3v2M10 3v2M13 3v2" /></svg>),
              },
              {
                name: 'Dienstleistung', desc: 'Projekte, Zeiterfassung & Abrechnung aus einer Hand.',
                icon: (<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M15 8a3 3 0 0 1 0 6" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M17 15c2.4.3 4 2.3 4 5" /></svg>),
              },
              {
                name: 'IT & Software', desc: 'Kunden, Tickets, Verträge & wiederkehrender Umsatz im Blick.',
                icon: (<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" /></svg>),
              },
            ].map((b) => (
              <div key={b.name} className="arg-mod">
                <div className="arg-mod-icon">{b.icon}</div>
                <h3>{b.name}</h3>
                <p>{b.desc}</p>
              </div>
            ))}
          </div>

          <p style={{ marginTop: '40px', fontSize: '.92rem', color: '#8fa9b6' }}>
            Und über 200 weitere Branchen:
          </p>
          <div className="arg-more">
            {['Gastronomie', 'Bau & Immobilien', 'Logistik', 'Landwirtschaft', 'Steuerberatung', 'Friseure & Beauty', 'Fitness & Wellness', 'Kfz & Werkstatt', 'Reinigung', 'Beratung', 'Bildung', 'Sicherheit'].map((t) => (
              <span key={t} className="arg-more-chip">{t}</span>
            ))}
            <span className="arg-more-chip" style={{ color: '#c9a84c', borderColor: 'rgba(201,168,76,0.40)' }}>… und mehr</span>
          </div>
        </div>
      </section>

      {/* ============== SOCIAL PROOF · AUS DER PRAXIS ============== */}
      <section style={{ padding: '30px 0 70px', textAlign: 'center' }}>
        <div className="arg-wrap">
          <div style={{ color: GOLD, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: '.78rem', marginBottom: '1rem' }}>Aus der Praxis</div>
          <h2 className="arg-h2">Für den Mittelstand gebaut — <span style={{ color: GOLD }}>mit dem Mittelstand</span>.</h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '56ch', margin: '0 auto 2.4rem', lineHeight: 1.55 }}>
            ARGONAUT wird gerade mit echten Betrieben in der Pilotphase erprobt — vom Forstbetrieb bis zur Werkstatt. Die Fakten sprechen für sich:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', textAlign: 'left' }}>
            {[
              { k: '690+', t: 'Branchen vorkonfiguriert', d: 'Vom Einzelunternehmer bis zum Konzern — für jede Branche fertig eingerichtet.' },
              { k: '1', t: 'System statt zwölf', d: 'CRM, ERP, Warenwirtschaft, DMS und KI-Crew — alles an einem Login.' },
              { k: '🇩🇪', t: 'Deutscher Server, DSGVO', d: 'Ihre Daten bleiben in Deutschland — sicher und rechtskonform.' },
            ].map((x) => (
              <div key={x.t} style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.7), rgba(10,22,40,0.6))', border: '1px solid rgba(122,163,179,0.16)', borderRadius: '16px', padding: '26px 24px' }}>
                <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '2.2rem', color: GOLD, lineHeight: 1, marginBottom: '10px' }}>{x.k}</div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#EAF1F6', margin: '0 0 8px' }}>{x.t}</h3>
                <p style={{ fontSize: '.92rem', color: '#9fb3bd', lineHeight: 1.55, margin: 0 }}>{x.d}</p>
              </div>
            ))}
          </div>
          <p style={{ color: '#8fa9b6', fontSize: '.9rem', marginTop: '1.8rem' }}>
            Echte Kundenstimmen folgen nach der Pilotphase — sichern Sie sich einen Pilotplatz und sind Sie von Anfang an dabei.
          </p>
        </div>
      </section>

      {/* ============== SCHRITT 9 · PREISE (nur Anzeige) ============== */}
      <section id="preise" style={{ padding: '8px 0 100px', textAlign: 'center' }}>
        <div className="arg-wrap">
          <h2 className="arg-h2">
            Ein System. Ein Preis nach Ihrer <span style={{ color: GOLD }}>Größe</span>.
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '54ch', margin: '0 auto', lineHeight: 1.55 }}>
            Vom Einzelunternehmer bis zum Konzern — transparent, mit KI unbegrenzt inklusive. Kein Baukasten, keine versteckten Add-ons.
          </p>

          <div className="arg-price-grid">
            {[
              { nm: 'SOLO', ma: '1 Mitarbeiter', pr: '499 €', nt: 'All-in · inkl. 1 Nutzer + KI unbegrenzt', hot: true },
              { nm: 'Mini', ma: '2–9 Mitarbeiter', pr: '490 €', nt: 'Grundgebühr + Nutzer-Sitze' },
              { nm: 'Klein', ma: '10–24 Mitarbeiter', pr: '990 €', nt: 'Grundgebühr + Nutzer-Sitze' },
              { nm: 'Mittel', ma: '25–99 Mitarbeiter', pr: '1.990 €', nt: 'Grundgebühr + Nutzer-Sitze' },
              { nm: 'Groß', ma: '100–499 Mitarbeiter', pr: '3.490 €', nt: 'Grundgebühr + Nutzer-Sitze' },
              { nm: 'Enterprise', ma: '500+ Mitarbeiter', pr: 'ab 5.990 €', nt: 'Individuell erweiterbar' },
            ].map((t) => (
              <div key={t.nm} className={'arg-price-card' + (t.hot ? ' hot' : '')}>
                <p className="nm">{t.nm}</p>
                <p className="ma">{t.ma}</p>
                <p className="pr">{t.pr}<span> / Monat</span></p>
                <p className="nt">{t.nt}</p>
              </div>
            ))}
          </div>

          {/* Sitz-Typen */}
          <h3 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: '1.2rem', color: '#EAF1F6', margin: '46px 0 0' }}>
            So setzen sich die Sitze zusammen
          </h3>
          <div className="arg-seats">
            {[
              { nm: 'Voll-Nutzer', who: 'Chef, GF, Büro, Dispo — alle Module, volle Bearbeitung', pr: 'ab 380 €/Nutzer·Mon' },
              { nm: 'Standard-Nutzer', who: 'Sachbearbeiter, Monteur mit Doku — operative Module', pr: 'ab 170 €/Nutzer·Mon' },
              { nm: 'Self-Service', who: 'Zeiterfassung, Lohnzettel, Mein Bereich — Basis-Zugang', pr: 'ab 19 €/Nutzer·Mon' },
            ].map((s) => (
              <div key={s.nm} className="arg-seat">
                <p className="st-nm">{s.nm}</p>
                <p className="st-who">{s.who}</p>
                <p className="st-pr">{s.pr}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '.85rem', color: '#8fa9b6', margin: '14px auto 0', maxWidth: '66ch', lineHeight: 1.55 }}>
            Gestaffelt nach Menge — je mehr Sitze, desto günstiger. SOLO ist all-in, ohne Sitz-Aufpreis.
            Typischer Mittelstands-Mix: ~16 % Voll · ~32 % Standard · ~52 % Self-Service — so bleibt das Ganze bezahlbar.
          </p>

          {/* Einmalige Einrichtung */}
          <div className="arg-setup">
            <p style={{ fontWeight: 700, color: '#EAF1F6', margin: '0 0 6px' }}>Einmalige Einrichtung — einmal, dann läuft's</p>
            <p style={{ fontSize: '.9rem', color: '#c4d3db', margin: '0 0 8px', lineHeight: 1.6 }}>
              SOLO 1.500 € · Mini 2.500 € · Klein 5.000 € · Mittel 12.000 € · Groß/Enterprise: Projekt auf Anfrage
            </p>
            <p style={{ fontSize: '.85rem', color: '#8fa9b6', margin: 0, lineHeight: 1.55 }}>
              Flexibel zahlbar: sofort (−10 %), 50/50 bei Start &amp; Go-Live, oder auf 12 Monate verteilt — starten Sie ohne große Einstiegssumme. Enthält Ihr komplettes Hologramm-Onboarding samt Zertifikat.
            </p>
          </div>

          <AngebotRechner />

          <div className="arg-incl">
            {['Alle Module inklusive', 'Ihr Dashboard', 'KI unbegrenzt', 'DSGVO & EU-Hosting', 'Hologramm-Onboarding + Zertifikate', 'Laufzeit-Rabatte (24/36 Mon.)'].map((x) => (
              <span key={x} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span aria-hidden="true" style={{ color: GOLD }}>✓</span> {x}
              </span>
            ))}
          </div>

          <p style={{ fontSize: '.82rem', color: '#7f97a4', margin: '22px auto 0', maxWidth: '60ch', lineHeight: 1.5 }}>
            Alle Preise netto, zzgl. 19 % MwSt. · ab „Mini" Grundgebühr + Nutzer-Sitze · Ihr individuelles Angebot in Minuten.
          </p>

          <div style={{ marginTop: '28px', display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#demo" style={{ background: GOLD, color: NAVY, fontWeight: 600, fontSize: '.98rem', padding: '15px 30px', borderRadius: '10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 30px rgba(201,168,76,0.22)' }}>
              Individuelles Angebot anfragen <span aria-hidden="true">→</span>
            </a>
            <a href="/vorschau/vergleich" style={{ background: 'transparent', color: '#EAF1F6', fontWeight: 500, fontSize: '.98rem', padding: '15px 26px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(201,168,76,0.45)', display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
              Warum sich das rechnet <span aria-hidden="true" style={{ color: GOLD }}>→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ============== SCHRITT 10 · VERTRAUEN & SICHERHEIT ============== */}
      <section id="sicherheit" style={{ padding: '20px 0 50px', textAlign: 'center' }}>
        <div className="arg-wrap">
          <h2 className="arg-h2">
            Ihre Daten. Ihre Sicherheit. <span style={{ color: GOLD }}>In Deutschland.</span>
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.18rem)', color: '#b9cdd6', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.55 }}>
            ARGONAUT ist von Grund auf für den deutschen Mittelstand gebaut — sicher, konform und lückenlos nachvollziehbar.
          </p>
          <div className="arg-trust-grid">
            {[
              {
                t: 'DSGVO-konform', d: 'Höchste Datenschutzstandards — nach deutscher und EU-Norm.',
                icon: (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>),
              },
              {
                t: 'EU-Hosting', d: 'Ihre Daten bleiben in Europa. Serverstandort Deutschland/EU.',
                icon: (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>),
              },
              {
                t: 'Rollen & Rechte', d: 'Granulare Zugriffskontrolle — jeder sieht nur, was er darf.',
                icon: (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>),
              },
              {
                t: 'Audit-Trails', d: 'Lückenlos nachvollziehbar — wer hat wann was getan.',
                icon: (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>),
              },
            ].map((x) => (
              <div key={x.t} className="arg-trust">
                <div className="arg-trust-icon">{x.icon}</div>
                <h3>{x.t}</h3>
                <p>{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============== FAQ ============== */}
      <section style={{ padding: '30px 0 30px' }}>
        <div className="arg-wrap" style={{ maxWidth: '820px' }}>
          <h2 className="arg-h2" style={{ textAlign: 'center' }}>Häufige Fragen</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '2rem', textAlign: 'left' }}>
            {FAQ.map((f, i) => (
              <div key={i} style={{ background: 'rgba(122,163,179,0.05)', border: '1px solid rgba(122,163,179,0.14)', borderRadius: '12px', padding: '20px 24px' }}>
                <p style={{ fontWeight: 700, color: '#EAF1F6', margin: '0 0 6px', fontSize: '1.02rem' }}>{f.q}</p>
                <p style={{ color: '#b9cdd6', margin: 0, lineHeight: 1.65, fontSize: '.96rem' }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      </section>

      {/* ============== DEMO-/ANFRAGE-FORMULAR (id="demo") ============== */}
      <AnfrageFormular />

      {/* ============== SCHRITT 11 · ABSCHLUSS + FOOTER ============== */}
      <section style={{ padding: '60px 0 0', textAlign: 'center', background: 'radial-gradient(900px 460px at 50% 130%, rgba(201,168,76,0.14), transparent 60%)' }}>
        <div className="arg-wrap">
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }} aria-hidden="true">🔱</div>
          <h2 className="arg-h2" style={{ fontSize: 'clamp(2rem, 5.2vw, 3.2rem)' }}>
            Werden Sie Teil der <span style={{ color: GOLD }}>Crew</span>.
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 1.9vw, 1.22rem)', color: '#b9cdd6', maxWidth: '50ch', margin: '0 auto 2rem', lineHeight: 1.6 }}>
            Das Betriebssystem, das jedes Unternehmen haben wird. Steigen Sie ein, bevor es Ihre Wettbewerber tun.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#demo" style={{ background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '16px 34px', borderRadius: '10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 30px rgba(201,168,76,0.25)' }}>
              Demo buchen <span aria-hidden="true">→</span>
            </a>
            <a href="#plattform" style={{ background: 'transparent', color: '#EAF1F6', fontWeight: 500, fontSize: '1rem', padding: '16px 30px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(234,241,246,0.22)', display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
              <span aria-hidden="true" style={{ color: GOLD }}>▶</span> Plattform ansehen
            </a>
          </div>
        </div>

        <footer className="arg-footer">
          <div className="arg-wrap">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '18px' }}>
              <span aria-hidden="true">🔱</span>
              <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, letterSpacing: '.2em', color: '#EAF1F6' }}>ARGONAUT&nbsp;OS</span>
            </div>
            <div className="arg-footer-links">
              <a href="/impressum">Impressum</a>
              <a href="/datenschutz">Datenschutz</a>
              <a href="/agb">AGB</a>
              <a href="mailto:martingaspar@gasparaiconsulting.de">Kontakt</a>
            </div>
            <p style={{ textAlign: 'center', color: '#5f7683', fontSize: '.8rem', margin: '18px 0 0' }}>
              © 2026 ARGONAUT OS · Gaspar AI Consulting · Böblingen
            </p>
          </div>
        </footer>
      </section>

      {/* ==== STARTSEITE KOMPLETT (11 Abschnitte) — naechster Schritt: Freischaltung (proxy.ts lockern) ==== */}
    </main>
  )
}
