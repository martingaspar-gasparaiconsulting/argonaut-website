import type { Metadata } from 'next'
import ErsparnisRechner from './_components/ErsparnisRechner'

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

        /* --- Schritt 2: Ein System statt zwoelf --- */
        .arg-consolidate { padding: 76px 0 88px; text-align: center; }
        .arg-h2 {
          font-family: var(--font-syne), var(--font-dm-sans), sans-serif;
          font-weight: 700; font-size: clamp(1.8rem, 4vw, 2.9rem);
          line-height: 1.18; padding-bottom: 2px; margin: 0 0 .9rem;
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
      <section className="arg-modules">
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
            In Minuten startklar — und ARGONAUT nimmt Sie an die Hand. Kein IT-Projekt, kein Handbuch.
          </p>

          <div className="arg-steps">
            <div className="arg-steps-line" aria-hidden="true" />
            {[
              { title: 'Konto erstellen', desc: 'In wenigen Minuten startklar. Keine Installation, kein IT-Projekt.' },
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

      {/* Weitere Abschnitte folgen in den naechsten Schritten:
          7) Ergebnisse  8) Branchen  9) Preise  10) Vertrauen  11) Abschluss */}
    </main>
  )
}
