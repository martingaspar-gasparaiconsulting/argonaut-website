'use client';

// ============================================================
// ARGONAUT OS · Bündel 7 · Öffentliche Bewertungsseite (ohne Login)
// /bewerten/<token> — Kunde vergibt Sterne + Text. Schreibt ausschließlich
// über /api/oeffentlich/bewertung (Service-Role, Token-basiert).
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { useParams } from 'next/navigation';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#c9a84c', text: '#EAF1F6',
  textDim: '#9fb3bd', border: 'rgba(122,163,179,0.18)', green: '#4CAF7D', danger: '#E06666',
};

export default function BewertenSeite() {
  const params = useParams();
  const token = String((params?.token as string) || '');

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState('');
  const [schonAbgegeben, setSchonAbgegeben] = useState(false);
  const [kunde, setKunde] = useState('');

  const [sterne, setSterne] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [senden, setSenden] = useState(false);
  const [fertig, setFertig] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/oeffentlich/bewertung?token=${encodeURIComponent(token)}`);
        const j = await res.json();
        if (!res.ok) { setFehler(j?.error || 'Bewertungs-Link ungültig.'); setLaden(false); return; }
        setBetrieb(j.betrieb || '');
        setKunde(j.kundeName || '');
        setSchonAbgegeben(j.status === 'abgegeben');
      } catch {
        setFehler('Verbindung fehlgeschlagen.');
      } finally { setLaden(false); }
    })();
  }, [token]);

  async function absenden() {
    if (sterne < 1) { setFehler('Bitte wähle 1 bis 5 Sterne.'); return; }
    setSenden(true); setFehler(null);
    try {
      const res = await fetch('/api/oeffentlich/bewertung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, sterne, text: text.trim() }),
      });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Bewertung fehlgeschlagen.'); return; }
      setFertig(true);
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    } finally { setSenden(false); }
  }

  const zeigeStern = (i: number) => (hover || sterne) >= i;

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.brand}>🔱 ARGONAUT OS</div>
        <div style={styles.card}>
          {laden ? (
            <p style={styles.sub}>Lädt …</p>
          ) : fehler && !fertig ? (
            <p style={{ ...styles.sub, color: C.danger }}>{fehler}</p>
          ) : fertig || schonAbgegeben ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🙏</div>
              <h1 style={styles.h1}>Vielen Dank!</h1>
              <p style={styles.sub}>{fertig ? 'Deine Bewertung ist angekommen.' : 'Für diesen Link wurde bereits eine Bewertung abgegeben.'}</p>
            </>
          ) : (
            <>
              <h1 style={styles.h1}>Wie zufrieden warst du{betrieb ? <> mit <span style={{ color: C.gold }}>{betrieb}</span></> : ''}?</h1>
              {kunde && <p style={styles.sub}>Hallo {kunde}, deine Meinung hilft uns sehr.</p>}

              <div style={styles.sterne}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => setSterne(i)}
                    style={{ ...styles.stern, color: zeigeStern(i) ? C.gold : 'rgba(255,255,255,0.18)' }} role="button" aria-label={`${i} Sterne`}>★</span>
                ))}
              </div>

              <textarea style={styles.input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Magst du kurz sagen, was gut war (oder was wir besser machen können)? – optional" />

              {fehler && <div style={styles.err}>{fehler}</div>}

              <button style={{ ...styles.primaer, opacity: senden ? 0.6 : 1, marginTop: 16 }} onClick={absenden} disabled={senden}>
                {senden ? 'Sendet …' : 'Bewertung abgeben'}
              </button>
            </>
          )}
        </div>
        <div style={styles.footer}>Bewertung bereitgestellt über ARGONAUT OS</div>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100dvh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: '40px 16px 64px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' },
  wrap: { maxWidth: 560, width: '100%' },
  brand: { color: C.gold, letterSpacing: '0.22em', textTransform: 'uppercase', fontSize: 13, fontWeight: 700, marginBottom: 18, textAlign: 'center' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 18, padding: 26, textAlign: 'center' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(23px, 4.4vw, 34px)', fontWeight: 700, margin: 0, lineHeight: 1.15 },
  sub: { color: C.textDim, fontSize: 'clamp(15px, 1.4vw, 19px)', lineHeight: 1.5, margin: '10px 0 0' },
  sterne: { display: 'flex', gap: 8, justifyContent: 'center', margin: '22px 0 18px' },
  stern: { fontSize: 'clamp(38px, 9vw, 52px)', cursor: 'pointer', lineHeight: 1, userSelect: 'none', transition: 'color 0.1s' },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 16, fontFamily: 'inherit', minHeight: 96, resize: 'vertical', textAlign: 'left' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 12, padding: '13px 24px', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 15 },
  footer: { marginTop: 34, textAlign: 'center', color: C.textDim, fontSize: 12, opacity: 0.7 },
};
