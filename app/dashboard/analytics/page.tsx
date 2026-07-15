'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · Report-Cockpit (Block B-8)
 * ------------------------------------------------------------------
 * Übersichtsseite: bündelt alle 6 Reports als anklickbare Kacheln.
 * Route: /dashboard/analytics
 * ══════════════════════════════════════════════════════════════════
 */

import type { CSSProperties } from 'react';

type ReportKachel = {
  icon: string;
  titel: string;
  href: string;
  beschreibung: string;
  akzent: string;
};

const REPORTS: ReportKachel[] = [
  {
    icon: '📊',
    titel: 'Umsatz-Report',
    href: '/dashboard/analytics/umsatz',
    beschreibung: 'Umsatzentwicklung, Zahlungseingänge und offene Forderungen.',
    akzent: '#C9A84C',
  },
  {
    icon: '🎯',
    titel: 'Vertriebs-Report',
    href: '/dashboard/analytics/vertrieb',
    beschreibung: 'Leads, Pipeline-Wert und Abschlusschancen.',
    akzent: '#22c55e',
  },
  {
    icon: '📁',
    titel: 'Projekt & Auftrag',
    href: '/dashboard/analytics/projekt-auftrag',
    beschreibung: 'Projektfortschritt, Aufgabenlast und Auftragswert.',
    akzent: '#00e5ff',
  },
  {
    icon: '📦',
    titel: 'Lager & ERP',
    href: '/dashboard/analytics/lager',
    beschreibung: 'Lagerwert, Nachbestell-Bedarf und Warenfluss.',
    akzent: '#f59e0b',
  },
  {
    icon: '🛎️',
    titel: 'Service',
    href: '/dashboard/analytics/service',
    beschreibung: 'Ticket-Aufkommen, SLA-Einhaltung und Lösungszeit.',
    akzent: '#a855f7',
  },
  {
    icon: '👥',
    titel: 'HR',
    href: '/dashboard/analytics/hr',
    beschreibung: 'Belegschaft, Arbeitszeit und Abwesenheiten.',
    akzent: '#3b82f6',
  },
];

const kachelStil: CSSProperties = {
  background: '#0f2038',
  border: '1px solid rgba(201,168,76,0.18)',
  borderRadius: 14,
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 168,
  textDecoration: 'none',
};

export default function AnalyticsCockpit() {
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>
      <style>{`
        .analytics-kachel {
          transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }
        .analytics-kachel:hover {
          transform: translateY(-3px);
          background: #12294a !important;
          border-color: rgba(201,168,76,0.45) !important;
        }
      `}</style>

      {/* ── Einheitlicher Modul-Kopf ── */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            color: '#C9A84C',
            fontSize: 'clamp(30px, 2.63vw, 42px)',
            fontWeight: 800,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>📊</span> Analytics
        </h1>
        <p
          style={{
            color: '#94a3b8',
            fontSize: 'clamp(15px, 1.31vw, 21px)',
            marginTop: 6,
            maxWidth: 720,
            lineHeight: 1.5,
          }}
        >
          Alle Auswertungen deines Betriebs an einem Ort — wähle einen Report.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {REPORTS.map((r) => (
          <a
            key={r.href}
            href={r.href}
            className="analytics-kachel"
            style={{ ...kachelStil, borderTop: `3px solid ${r.akzent}` }}
          >
            <div style={{ fontSize: 'clamp(32px, 2.81vw, 45px)', lineHeight: 1 }}>{r.icon}</div>
            <div style={{ color: '#e2e8f0', fontSize: 'clamp(18px, 1.56vw, 25px)', fontWeight: 700 }}>
              {r.titel}
            </div>
            <div
              style={{
                color: '#94a3b8',
                fontSize: 'clamp(13.5px, 1.19vw, 19px)',
                lineHeight: 1.5,
              }}
            >
              {r.beschreibung}
            </div>
            <div
              style={{
                color: r.akzent,
                fontSize: 'clamp(13px, 1.13vw, 18px)',
                fontWeight: 700,
                marginTop: 'auto',
              }}
            >
              Report öffnen →
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
