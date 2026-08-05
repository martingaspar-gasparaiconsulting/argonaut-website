'use client';

// ============================================================
// ARGONAUT OS · I4 · Dossier-/Lead-Funnel (öffentlich, LIVE)
// Interessent fordert ein Dossier an -> Double-Opt-In-Mail -> nach Klick
// bekommt er das Dossier. Rein additiv, eigene Route/Tabelle.
// Pfad: app/dossier/page.tsx
// ============================================================

import { useState, useEffect, CSSProperties } from 'react';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

const VORTEILE = [
  'Was ARGONAUT OS in Ihrer Branche konkret übernimmt',
  'Wie ein System 10–12 Einzel-Tools ersetzt',
  'Rechnungen, Angebote, CRM, Termine & KI in einem',
  'Beispiele und Zahlen aus der Praxis',
];

export default function DossierPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [branche, setBranche] = useState('');
  const [sende, setSende] = useState(false);
  const [status, setStatus] = useState<'idle' | 'gesendet' | 'bestaetigt' | 'fehler'>('idle');
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('bestaetigt') === '1') setStatus('bestaetigt');
    else if (p.get('fehler') === '1') { setStatus('fehler'); setFehler('Der Bestätigungs-Link war ungültig oder ist abgelaufen.'); }
  }, []);

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setSende(true); setFehler(null);
    try {
      const res = await fetch('/api/oeffentlich/dossier-optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, branche }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setFehler(j.error || 'Es ist ein Fehler aufgetreten.'); }
      else setStatus('gesendet');
    } catch {
      setFehler('Netzwerkfehler. Bitte später erneut versuchen.');
    }
    setSende(false);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.page}>
        <div style={styles.grid}>
          {/* Werbe-Seite */}
          <div>
            <div style={styles.kicker}>Kostenloses Dossier</div>
            <h1 style={styles.h1}>Wie <span style={{ color: C.gold }}>ein System</span> Ihren Betrieb steuert — statt zwölf.</h1>
            <p style={styles.sub}>
              Holen Sie sich das ARGONAUT-Dossier für Ihre Branche. Kompakt, konkret, in wenigen Minuten gelesen.
            </p>
            <ul style={styles.liste}>
              {VORTEILE.map((v) => (
                <li key={v} style={styles.listItem}><span style={{ color: C.gold, marginRight: 8 }}>✓</span>{v}</li>
              ))}
            </ul>
          </div>

          {/* Formular */}
          <div style={styles.card}>
            {status === 'bestaetigt' ? (
              <div style={styles.erfolg}>
                <div style={{ fontSize: 40 }}>✅</div>
                <div style={styles.cardTitel}>E-Mail bestätigt!</div>
                <p style={styles.dim}>Ihr Dossier ist unterwegs in Ihr Postfach. Viel Freude beim Lesen.</p>
              </div>
            ) : status === 'gesendet' ? (
              <div style={styles.erfolg}>
                <div style={{ fontSize: 40 }}>📩</div>
                <div style={styles.cardTitel}>Fast geschafft</div>
                <p style={styles.dim}>
                  Wir haben Ihnen eine E-Mail geschickt. Bitte klicken Sie darin auf <b>„E-Mail bestätigen"</b> —
                  danach erhalten Sie Ihr Dossier.
                </p>
              </div>
            ) : (
              <form onSubmit={absenden}>
                <div style={styles.cardTitel}>Dossier anfordern</div>
                <label style={styles.feld}>
                  <span style={styles.feldLabel}>E-Mail *</span>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} placeholder="name@firma.de" />
                </label>
                <label style={styles.feld}>
                  <span style={styles.feldLabel}>Name (optional)</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
                </label>
                <label style={styles.feld}>
                  <span style={styles.feldLabel}>Branche (optional)</span>
                  <input value={branche} onChange={(e) => setBranche(e.target.value)} style={styles.input} placeholder="z. B. Handwerk, Gastro …" />
                </label>
                {fehler && <div style={styles.err}>{fehler}</div>}
                <button type="submit" disabled={sende} style={{ ...styles.btnGold, opacity: sende ? 0.6 : 1 }}>
                  {sende ? 'Wird gesendet …' : 'Dossier kostenlos anfordern'}
                </button>
                <p style={styles.klein}>
                  Double-Opt-In: Sie erhalten zuerst eine Bestätigungs-Mail. Kein Spam, jederzeit abbestellbar.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  page: { maxWidth: 1040, margin: '0 auto', padding: '48px clamp(16px,3vw,40px) 80px' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,420px)', gap: 40, alignItems: 'center' },

  kicker: { display: 'inline-block', color: C.gold, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', fontSize: 12, marginBottom: 12 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px,3.4vw,44px)', fontWeight: 800, lineHeight: 1.1, margin: 0 },
  sub: { color: C.textDim, fontSize: 17, lineHeight: 1.55, margin: '16px 0 20px', maxWidth: 480 },
  liste: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  listItem: { fontSize: 15, color: C.text, display: 'flex', alignItems: 'flex-start' },

  card: { background: C.navy2, border: `1px solid ${C.gold}44`, borderRadius: 18, padding: 26 },
  cardTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 20, marginBottom: 14 },
  feld: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 },
  feldLabel: { fontSize: 12, color: C.textDim, fontWeight: 600 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 13px', fontSize: 15, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  btnGold: { width: '100%', background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '13px 20px', fontSize: 15, fontWeight: 800, cursor: 'pointer', marginTop: 6 },
  klein: { fontSize: 12, color: C.textDim, marginTop: 12, lineHeight: 1.5 },
  erfolg: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: '10px 0' },
  dim: { color: C.textDim, fontSize: 15, lineHeight: 1.6 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', margin: '4px 0 12px', fontSize: 14 },
};
