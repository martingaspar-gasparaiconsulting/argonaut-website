'use client';
import { useState, useEffect } from 'react';

const MOCK = { kunden: 0, mrr: 0, pakete: { SOLO: 0, START: 0, PRO: 0, BUSINESS: 0, ENTERPRISE: 0 } };
const TABS = ['ÜBERSICHT', 'KUNDEN', 'UMSATZ', 'AGENTEN', 'SYSTEM'];
const MEILEN = [
  { k: 10, label: 'Erste 10 Kunden', icon: '🎯' },
  { k: 50, label: 'Stadtwerk HU', icon: '🏙️' },
  { k: 100, label: '6-Stellig/Mo', icon: '💰' },
  { k: 250, label: 'Yapeal Start', icon: '🏦' },
  { k: 500, label: 'GmbH + Team', icon: '🏢' },
  { k: 1000, label: 'EIB Vorbereitung', icon: '🌍' },
];

export default function CommandCenter() {
  const [booted, setBooted] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [, setTick] = useState(0);

  const bootLines = [
    'ARGONAUT OS v2.0.26 — INITIALISIERE...',
    'SUPABASE VERBINDUNG... OK',
    'STRIPE SCHNITTSTELLE... OK',
    'N8N WORKFLOWS... 1229 AKTIV',
    'SICHERHEITSPROTOKOLL... AKTIV',
    'WILLKOMMEN, GRÜNDER. ALLE SYSTEME BEREIT.',
  ];

  useEffect(() => {
    if (bootStep < bootLines.length) {
      const t = setTimeout(() => setBootStep(s => s + 1), 400);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setBooted(true), 600);
      return () => clearTimeout(t);
    }
  }, [bootStep]);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const next = MEILEN.find(m => m.k > MOCK.kunden) || MEILEN[MEILEN.length - 1];
  const pct = Math.min(100, (MOCK.kunden / next.k) * 100);

  if (!booted) return (
    <div style={{ position: 'fixed', inset: 0, background: '#020c1b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
      <div style={{ textAlign: 'center', maxWidth: 600, padding: 40 }}>
        <div style={{ fontSize: 64 }}>🔱</div>
        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 36, color: '#C9A84C', letterSpacing: 8, marginBottom: 4 }}>ARGONAUT OS</div>
        <div style={{ color: '#00e5ff', letterSpacing: 6, fontSize: 12, marginBottom: 40 }}>COMMAND CENTER</div>
        <div style={{ textAlign: 'left', marginBottom: 32, minHeight: 160 }}>
          {bootLines.slice(0, bootStep).map((line, i) => (
            <div key={i} style={{ color: '#00e5ff', fontSize: 13, marginBottom: 8, opacity: i === bootStep - 1 ? 1 : 0.5 }}>
              <span style={{ color: '#C9A84C' }}>&gt;</span> {line}
            </div>
          ))}
        </div>
        <div style={{ height: 2, background: 'rgba(0,229,255,0.15)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,#00e5ff,#C9A84C)', width: (bootStep / bootLines.length * 100) + '%', transition: 'width 0.4s ease' }} />
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#020c1b', color: '#c8e8f4', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.03) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 }} />

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid rgba(0,229,255,0.15)', background: 'rgba(2,12,27,0.95)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 32 }}>🔱</span>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', color: '#C9A84C', fontSize: 20, letterSpacing: 4, fontWeight: 700 }}>ARGONAUT OS</div>
            <div style={{ color: '#00e5ff', fontSize: 10, letterSpacing: 3 }}>COMMAND CENTER</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00e676', boxShadow: '0 0 8px #00e676' }} />
          <span style={{ color: '#00e676', fontSize: 12, letterSpacing: 1 }}>ALLE SYSTEME AKTIV</span>
          <div style={{ color: '#00e5ff', fontFamily: 'monospace', fontSize: 14, padding: '4px 12px', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 4 }}>
            {new Date().toLocaleTimeString('de-DE')}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 2, padding: '0 32px', borderBottom: '1px solid rgba(0,229,255,0.1)', background: 'rgba(2,12,27,0.8)', position: 'sticky', top: 65, zIndex: 9 }}>
        {TABS.map((tab, i) => (
          <button key={i} onClick={() => setActiveTab(i)} style={{ padding: '12px 24px', background: 'transparent', border: 'none', color: activeTab === i ? '#00e5ff' : 'rgba(200,232,244,0.5)', cursor: 'pointer', fontSize: 11, letterSpacing: 2, fontFamily: 'Syne, sans-serif', borderBottom: activeTab === i ? '2px solid #00e5ff' : '2px solid transparent' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding: 32, position: 'relative', zIndex: 1 }}>
        {activeTab === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {/* KPI Kacheln */}
            {[
              { label: 'AKTIVE KUNDEN', value: MOCK.kunden, color: '#fff', sub: `Ziel: ${next.k} — ${next.label}` },
              { label: 'MRR', value: `€${MOCK.mrr.toLocaleString('de-DE')}`, color: '#C9A84C', sub: 'Monatlich wiederkehrend' },
              { label: 'ARR', value: `€${(MOCK.mrr * 12).toLocaleString('de-DE')}`, color: '#00e5ff', sub: 'Jahreshochrechnung' },
              { label: 'N8N WORKFLOWS', value: '1.229', color: '#00e676', sub: 'Alle aktiv' },
            ].map((kpi, i) => (
              <div key={i} style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: 24 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(200,232,244,0.5)', marginBottom: 8 }}>{kpi.label}</div>
                <div style={{ fontSize: 40, fontWeight: 700, fontFamily: 'Syne, sans-serif', color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(200,232,244,0.4)', marginTop: 8 }}>{kpi.sub}</div>
              </div>
            ))}

            {/* Meilenstein */}
            <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: 24, gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: '#00e5ff', marginBottom: 16, fontFamily: 'Syne, sans-serif' }}>🎯 NÄCHSTER MEILENSTEIN — {next.label}</div>
              <div style={{ height: 4, background: 'rgba(0,229,255,0.1)', borderRadius: 2, margin: '12px 0' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg,#00e5ff,#C9A84C)', width: pct + '%', transition: 'width 1s ease' }} />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(200,232,244,0.6)', marginBottom: 16 }}>{MOCK.kunden} / {next.k} Kunden ({pct.toFixed(1)}%)</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {MEILEN.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 12px', border: `1px solid ${MOCK.kunden >= m.k ? '#C9A84C' : 'rgba(0,229,255,0.1)'}`, borderRadius: 6, opacity: MOCK.kunden >= m.k ? 1 : 0.4, background: MOCK.kunden >= m.k ? 'rgba(201,168,76,0.1)' : 'transparent', fontSize: 13 }}>
                    <span>{m.icon}</span>
                    <span style={{ fontSize: 11 }}>{m.k}K</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pakete */}
            <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: 24 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: '#00e5ff', marginBottom: 16, fontFamily: 'Syne, sans-serif' }}>📦 PAKET-VERTEILUNG</div>
              {Object.entries(MOCK.pakete).map(([n, c]) => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,229,255,0.06)', fontSize: 13 }}>
                  <span style={{ color: 'rgba(200,232,244,0.7)' }}>{n}</span>
                  <span style={{ color: '#C9A84C', fontWeight: 700 }}>{c}</span>
                </div>
              ))}
            </div>

            {/* System */}
            <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, padding: 24 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: '#00e5ff', marginBottom: 16, fontFamily: 'Syne, sans-serif' }}>⚡ SYSTEM STATUS</div>
              {[['Supabase DB', true], ['Stripe Webhooks', true], ['n8n Automation', true], ['Vercel Edge', true], ['Auth System', true]].map(([n, ok]) => (
                <div key={n as string} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(0,229,255,0.06)', fontSize: 13 }}>
                  <span style={{ color: ok ? '#00e676' : '#ff5252' }}>●</span>
                  <span style={{ marginLeft: 8 }}>{n}</span>
                  <span style={{ marginLeft: 'auto', color: ok ? '#00e676' : '#ff5252', fontSize: 11 }}>{ok ? 'OK' : 'FEHLER'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab !== 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
            <div style={{ fontSize: 48 }}>🔱</div>
            <div style={{ fontFamily: 'Syne, sans-serif', color: '#00e5ff', letterSpacing: 4, fontSize: 14 }}>MODUL IN ENTWICKLUNG</div>
            <div style={{ color: 'rgba(200,232,244,0.4)', fontSize: 12 }}>Wird in Block 3 mit Live-Daten verbunden</div>
          </div>
        )}
      </div>
    </div>
  );
}
