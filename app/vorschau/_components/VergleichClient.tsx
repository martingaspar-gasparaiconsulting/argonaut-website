'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/VergleichClient.tsx
// Interaktive Preis- & Leistungsvergleichsseite (Schritt: /vorschau/vergleich).
// Sichere Version: Wer-kann-was-Matrix + Baustein-Transparenz (mit Quell-Links)
// + "1 statt viele"-Regler + "Preis-versteckt"-Block. KEIN "wir sind billiger"-Rechner.
// Alle Wettbewerber-Preise = öffentliche Listenpreise (Stand 07/2026), verlinkt.
// ============================================================================

import { useState } from 'react'

const NAVY = '#0A1628'
const GOLD = '#c9a84c'
const TEAL = '#7aa3b3'

const COLS = ['ARGONAUT', 'Salesforce', 'HubSpot', 'Zoho', 'SAP', 'Pipedrive']

// v = [ARGONAUT, Salesforce, HubSpot, Zoho, SAP, Pipedrive]
const ROWS = [
  { f: 'CRM & Vertrieb',              v: [1, 1, 1, 1, 0, 1] },
  { f: 'Marketing & Content',         v: [1, 0, 1, 1, 0, 0] },
  { f: 'Angebote & Rechnungen',       v: [1, 0, 0, 1, 1, 0] },
  { f: 'Buchhaltung & GoBD (DE)',     v: [1, 0, 0, 0, 1, 0] },
  { f: 'Lohn & Personal (DE)',        v: [1, 0, 0, 0, 0, 0] },
  { f: 'Lager & Warenwirtschaft',     v: [1, 0, 0, 0, 1, 0] },
  { f: 'Zeiterfassung & Schichtplan', v: [1, 0, 0, 0, 0, 0] },
  { f: 'Field Service / Außendienst', v: [1, 0, 0, 0, 0, 0] },
  { f: 'Projekte',                    v: [1, 0, 0, 1, 0, 0] },
  { f: 'E-Signatur',                  v: [1, 0, 1, 1, 0, 0] },
  { f: 'Dashboards & Analytics',      v: [1, 1, 1, 1, 1, 1] },
  { f: 'Alles in EINER Oberfläche',   v: [1, 0, 0, 0, 0, 0] },
]

const BAUSTEINE = [
  { fn: 'CRM (nur Vertrieb)',    anbieter: 'Salesforce Enterprise',   preis: '175 €/Nutzer·Mon',        url: 'https://www.salesforce.com/eu/sales/pricing/' },
  { fn: 'Marketing',             anbieter: 'HubSpot Marketing Hub',   preis: '880–3.300 €/Mon',         url: 'https://www.hubspot.de/pricing' },
  { fn: 'Buchhaltung & GoBD',    anbieter: 'Lexware Office / sevDesk', preis: 'ab 7,90 € / 12,90 €/Mon', url: 'https://www.lexware.de/preise/' },
  { fn: 'ERP / Warenwirtschaft', anbieter: 'weclapp',                 preis: '39–163 €/Nutzer·Mon',     url: 'https://www.weclapp.com/de/preise/' },
  { fn: 'HR & Personal',         anbieter: 'Factorial',               preis: 'ab 8 €/Mitarbeiter·Mon',  url: 'https://factorialhr.de/preise' },
  { fn: 'E-Signatur',            anbieter: 'DocuSign Business Pro',    preis: '38 €/Nutzer·Mon',         url: 'https://ecom.docusign.com/de-DE/plans-and-pricing/esignature' },
  { fn: 'Projekt / Work',        anbieter: 'monday.com',              preis: '9–19 €/Nutzer·Mon',       url: 'https://monday.com/pricing' },
  { fn: 'All-in-One (global)',   anbieter: 'Zoho CRM Plus / Odoo',    preis: '57 € / 31–61 €/Nutzer·Mon', url: 'https://www.zoho.com/de/crm/crmplus/' },
]

const VERSTECKT = [
  { anbieter: 'SAP',          was: 'ERP',           url: 'https://www.sap.com' },
  { anbieter: 'Personio',     was: 'HR',            url: 'https://www.personio.de/preise/' },
  { anbieter: 'ServiceTitan', was: 'Field Service', url: 'https://www.servicetitan.com/pricing' },
]

export default function VergleichClient() {
  const [ma, setMa] = useState(25)
  const tools = 10
  const flick = ma * tools

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
        .vg-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
        .vg-h1 { font-family: var(--font-syne), sans-serif; font-weight:700; font-size: clamp(2rem,5vw,3.4rem); line-height:1.12; padding-bottom:2px; margin:0 0 1rem; }
        .vg-h2 { font-family: var(--font-syne), sans-serif; font-weight:700; font-size: clamp(1.6rem,3.6vw,2.4rem); line-height:1.18; padding-bottom:2px; margin:0 0 .8rem; }
        .vg-sub { font-size: clamp(1rem,1.7vw,1.15rem); color:#b9cdd6; line-height:1.6; margin:0; }
        .vg-tablewrap { overflow-x:auto; margin-top:30px; border-radius:14px; border:1px solid rgba(122,163,179,0.16); }
        table.vg { border-collapse:collapse; width:100%; min-width:720px; font-size:.9rem; }
        table.vg th, table.vg td { padding:12px 10px; text-align:center; border-bottom:1px solid rgba(122,163,179,0.10); }
        table.vg th.fn, table.vg td.fn { text-align:left; color:#c4d3db; font-weight:400; white-space:nowrap; }
        table.vg thead th { font-family: var(--font-dm-sans),sans-serif; font-weight:700; color:#EAF1F6; font-size:.85rem; }
        table.vg .argcol { background: rgba(201,168,76,0.10); }
        table.vg thead th.argcol { color:#c9a84c; }
        table.vg td.yes { color:#c9a84c; font-weight:700; }
        table.vg td.no { color:#54697a; }
        .vg-foot { font-size:.78rem; color:#7f97a4; margin-top:12px; line-height:1.5; }
        .vg-cards { display:grid; grid-template-columns: repeat(2,1fr); gap:12px; margin-top:30px; }
        .vg-card { background: linear-gradient(160deg, rgba(18,32,54,0.6), rgba(10,22,40,0.5)); border:1px solid rgba(122,163,179,0.14); border-radius:12px; padding:16px 18px; }
        .vg-card .fn { font-size:.72rem; color:${TEAL}; text-transform:uppercase; letter-spacing:.06em; margin:0 0 6px; }
        .vg-card .an { font-weight:700; color:#EAF1F6; margin:0 0 2px; }
        .vg-card .pr { color:#c9a84c; font-weight:600; margin:0 0 8px; }
        .vg-card a { font-size:.8rem; color:${TEAL}; text-decoration:none; }
        .vg-card a:hover { color:#c9a84c; }
        .vg-vs { display:grid; grid-template-columns:1fr auto 1fr; gap:20px; align-items:center; margin-top:26px; }
        .vg-big { font-family: var(--font-syne),sans-serif; font-weight:700; font-size: clamp(2.2rem,7vw,3.4rem); line-height:1; margin:0; }
        input[type=range]{ width:100%; accent-color:${GOLD}; cursor:pointer; }
        @media (max-width:640px){ .vg-cards{ grid-template-columns:1fr; } .vg-vs{ grid-template-columns:1fr; gap:16px; } }
      `}</style>

      {/* ---------- INTRO ---------- */}
      <section style={{ padding: '120px 0 30px', background: 'radial-gradient(1000px 500px at 30% -10%, rgba(201,168,76,0.10), transparent 60%)' }}>
        <div className="vg-wrap" style={{ textAlign: 'center' }}>
          <div style={{ color: GOLD, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: '.8rem', marginBottom: '1.4rem' }}>
            🔱 Preis- &amp; Leistungsvergleich
          </div>
          <h1 className="vg-h1">Vergleichen Sie selbst.</h1>
          <p className="vg-sub" style={{ maxWidth: '58ch', margin: '0 auto' }}>
            Jeder Wettbewerber verkauft nur einen Ausschnitt. Wir zeigen offen, wer was kann und was es kostet —
            jede Zahl mit Quelle zum Nachprüfen. Denn wer alles offenlegt, hat nichts zu verstecken.
          </p>
        </div>
      </section>

      {/* ---------- MATRIX ---------- */}
      <section style={{ padding: '40px 0' }}>
        <div className="vg-wrap">
          <h2 className="vg-h2">Wer kann was?</h2>
          <p className="vg-sub">ARGONAUT deckt den ganzen Betrieb ab. Die anderen jeweils nur ihr Feld.</p>
          <div className="vg-tablewrap">
            <table className="vg">
              <thead>
                <tr>
                  <th className="fn"></th>
                  {COLS.map((c, i) => <th key={c} className={i === 0 ? 'argcol' : ''}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.f}>
                    <td className="fn">{r.f}</td>
                    {r.v.map((val, i) => (
                      <td key={i} className={(i === 0 ? 'argcol ' : '') + (val ? 'yes' : 'no')}>{val ? '✓' : '–'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="vg-foot">
            ✓ = im Kern-/Standardprodukt enthalten. – = nicht enthalten oder nur über separate, zusätzlich kostende Produkte.
            „(DE)" = auf den deutschen Mittelstand zugeschnitten (GoBD, DATEV, Lohn). Stand 07/2026, Angaben ohne Gewähr.
          </p>
        </div>
      </section>

      {/* ---------- BAUSTEIN-TRANSPARENZ ---------- */}
      <section style={{ padding: '40px 0' }}>
        <div className="vg-wrap">
          <h2 className="vg-h2">Was die einzelnen Bausteine kosten</h2>
          <p className="vg-sub">Echte Listenpreise, jeweils mit Quelle. Zusammengezählt ergibt das den Flickenteppich — ARGONAUT ist all das in einem.</p>
          <div className="vg-cards">
            {BAUSTEINE.map((b) => (
              <div key={b.fn} className="vg-card">
                <p className="fn">{b.fn}</p>
                <p className="an">{b.anbieter}</p>
                <p className="pr">{b.preis}</p>
                <a href={b.url} target="_blank" rel="noopener noreferrer">Quelle ansehen →</a>
              </div>
            ))}
          </div>
          <p className="vg-foot">Listenpreise Stand 07/2026, netto, ohne Gewähr — Anbieterpreise können abweichen.</p>
        </div>
      </section>

      {/* ---------- PREIS VERSTECKT ---------- */}
      <section style={{ padding: '40px 0' }}>
        <div className="vg-wrap">
          <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '16px', padding: '32px 26px', textAlign: 'center' }}>
            <h2 className="vg-h2">Drei der Größten verraten ihren Preis nicht.</h2>
            <p className="vg-sub" style={{ maxWidth: '52ch', margin: '0 auto 18px' }}>
              SAP, Personio und ServiceTitan nennen keinen öffentlichen Preis — „nur auf Anfrage". Wir zeigen unseren offen.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {VERSTECKT.map((v) => (
                <a key={v.anbieter} href={v.url} target="_blank" rel="noopener noreferrer"
                  style={{ background: 'rgba(84,105,122,0.15)', border: '1px solid rgba(122,163,179,0.25)', borderRadius: '999px', padding: '8px 16px', color: '#c4d3db', textDecoration: 'none', fontSize: '.85rem' }}>
                  {v.anbieter} <span style={{ color: '#8fa9b6' }}>· {v.was} · Preis auf Anfrage</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 1 STATT VIELE (REGLER) ---------- */}
      <section style={{ padding: '40px 0' }}>
        <div className="vg-wrap">
          <h2 className="vg-h2">Ein System statt eines Flickenteppichs.</h2>
          <p className="vg-sub">Stellen Sie Ihre Mitarbeiterzahl ein — und sehen Sie, was Sie sich zu verwalten sparen.</p>
          <div style={{ background: 'linear-gradient(160deg, rgba(18,32,54,0.9), rgba(10,22,40,0.9))', border: '1px solid rgba(201,168,76,0.22)', borderRadius: '18px', padding: '28px', marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#c4d3db' }}>Mitarbeiter</span>
              <span style={{ color: GOLD, fontWeight: 600 }}>{ma}</span>
            </div>
            <input type="range" min={1} max={500} value={ma} onChange={(e) => setMa(Number(e.target.value))} aria-label="Mitarbeiterzahl" />
            <div className="vg-vs">
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '.78rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>Flickenteppich</p>
                <p className="vg-big" style={{ color: '#8fa9b6' }}>bis zu {flick}</p>
                <p style={{ color: '#90a6b2', margin: '8px 0 0', fontSize: '.9rem' }}>Einzel-Zugänge in ~{tools} Programmen · {tools}+ Verträge · viele Rechnungen</p>
              </div>
              <div style={{ textAlign: 'center', color: GOLD, fontSize: '1.6rem' }} aria-hidden="true">→</div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '.78rem', color: TEAL, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>ARGONAUT</p>
                <p className="vg-big" style={{ color: GOLD }}>{ma}</p>
                <p style={{ color: '#c4d3db', margin: '8px 0 0', fontSize: '.9rem' }}>Zugänge in <strong style={{ color: '#EAF1F6' }}>1 System</strong> · 1 Vertrag · 1 Rechnung</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- CTA + DISCLAIMER ---------- */}
      <section style={{ padding: '20px 0 100px', textAlign: 'center' }}>
        <div className="vg-wrap">
          <a href="#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: GOLD, color: NAVY, fontWeight: 600, fontSize: '1rem', padding: '15px 32px', borderRadius: '10px', textDecoration: 'none', boxShadow: '0 10px 30px rgba(201,168,76,0.25)' }}>
            Demo buchen <span aria-hidden="true">→</span>
          </a>
          <div style={{ marginTop: '18px' }}>
            <a href="/vorschau" style={{ color: TEAL, textDecoration: 'none', fontSize: '.9rem' }}>← Zurück zur Übersicht</a>
          </div>
          <p className="vg-foot" style={{ maxWidth: '62ch', margin: '26px auto 0' }}>
            Alle genannten Wettbewerber-Preise sind öffentliche Listenpreise (Stand 07/2026, netto) der jeweiligen Anbieter,
            verlinkt zum Nachprüfen. Angaben ohne Gewähr; Preise und Leistungen können sich ändern.
            Marken- und Produktnamen gehören ihren jeweiligen Inhabern.
          </p>
        </div>
      </section>
    </main>
  )
}
