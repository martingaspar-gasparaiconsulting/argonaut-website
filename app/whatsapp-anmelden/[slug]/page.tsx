'use client';

// ============================================================
// ARGONAUT OS · Öffentliche WhatsApp-Anmeldeseite (ohne Login) · WhatsApp P2
// /whatsapp-anmelden/<slug> — Interessent trägt Handynummer + Einwilligung ein.
// Liest & schreibt nur über /api/oeffentlich/whatsapp-optin. Branding des Betriebs.
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { useParams } from 'next/navigation';

const NAVY = '#0A1628';
const NAVY2 = '#0F2036';
const TEXT = '#EAF1F6';
const DIM = '#9fb3bd';
const BORDER = 'rgba(159,179,189,0.18)';
const DANGER = '#E06666';

export default function WhatsappAnmeldenSeite() {
  const params = useParams();
  const slug = String((params?.slug as string) || '').toLowerCase();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState('');
  const [titel, setTitel] = useState('');
  const [text, setText] = useState('');
  const [akzent, setAkzent] = useState('#25D366');

  const [name, setName] = useState('');
  const [telefon, setTelefon] = useState('');
  const [einwilligung, setEinwilligung] = useState(false);
  const [senden, setSenden] = useState(false);
  const [fertig, setFertig] = useState<'angemeldet' | 'bereits' | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLaden(true); setFehler(null);
      try {
        const res = await fetch(`/api/oeffentlich/whatsapp-optin?slug=${encodeURIComponent(slug)}`);
        const j = await res.json();
        if (!res.ok) setFehler(j?.error || 'Anmeldeseite nicht verfügbar.');
        else {
          setBetrieb(j.betrieb || '');
          setTitel(j.titel || 'WhatsApp-Neuigkeiten erhalten');
          setText(j.text || '');
          if (j.akzent && /^#[0-9a-fA-F]{3,8}$/.test(j.akzent)) setAkzent(j.akzent);
        }
      } catch {
        setFehler('Verbindung fehlgeschlagen. Bitte später erneut versuchen.');
      } finally { setLaden(false); }
    })();
  }, [slug]);

  async function absenden() {
    setFehler(null);
    if (telefon.trim().replace(/[^\d]/g, '').length < 8) { setFehler('Bitte eine gültige Handynummer eingeben.'); return; }
    if (!einwilligung) { setFehler('Bitte bestätige die Einwilligung, damit wir dir schreiben dürfen.'); return; }
    setSenden(true);
    try {
      const res = await fetch('/api/oeffentlich/whatsapp-optin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, telefon: telefon.trim(), name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) setFehler(j?.error || 'Anmeldung fehlgeschlagen.');
      else setFertig(j.status === 'bereits' ? 'bereits' : 'angemeldet');
    } catch {
      setFehler('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setSenden(false); }
  }

  const S: Record<string, CSSProperties> = {
    page: { minHeight: '100dvh', background: NAVY, color: TEXT, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: '40px 16px 64px' },
    wrap: { maxWidth: 520, margin: '0 auto' },
    card: { background: NAVY2, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28 },
    h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(24px, 4.5vw, 36px)', fontWeight: 700, margin: '0 0 6px', lineHeight: 1.15 },
    sub: { color: DIM, fontSize: 'clamp(15px, 1.4vw, 18px)', lineHeight: 1.55, margin: '0 0 20px' },
    lbl: { display: 'block', fontSize: 13, color: DIM, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
    input: { width: '100%', boxSizing: 'border-box', background: NAVY, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 13px', fontSize: 16, fontFamily: 'inherit', marginBottom: 14 },
    primaer: { width: '100%', background: akzent, color: '#0A1628', border: 'none', borderRadius: 10, padding: '14px 22px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
    err: { color: DANGER, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '12px 14px', margin: '0 0 14px', fontSize: 15 },
    consent: { display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 18px', color: DIM, fontSize: 14, lineHeight: 1.5, cursor: 'pointer' },
    footer: { marginTop: 28, textAlign: 'center', color: DIM, fontSize: 12, opacity: 0.7 },
  };

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        {laden ? (
          <div style={S.card}><p style={{ color: DIM, margin: 0 }}>Wird geladen …</p></div>
        ) : fehler && !betrieb ? (
          <div style={S.card}>
            <h1 style={S.h1}>Nicht verfügbar</h1>
            <p style={S.sub}>{fehler}</p>
          </div>
        ) : fertig ? (
          <div style={S.card}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{fertig === 'bereits' ? '👍' : '✅'}</div>
            <h1 style={S.h1}>{fertig === 'bereits' ? 'Du bist schon dabei' : 'Angemeldet!'}</h1>
            <p style={S.sub}>
              {fertig === 'bereits'
                ? `Deine Nummer ist bereits bei ${betrieb} eingetragen. Es ist nichts weiter zu tun.`
                : `Danke! Deine Nummer ist bei ${betrieb} eingetragen. Du kannst dich jederzeit wieder abmelden.`}
            </p>
          </div>
        ) : (
          <div style={S.card}>
            <div style={{ color: akzent, fontWeight: 800, fontSize: 15, marginBottom: 10 }}>{betrieb}</div>
            <h1 style={S.h1}>{titel}</h1>
            {text && <p style={S.sub}>{text}</p>}

            {fehler && <div style={S.err}>{fehler}</div>}

            <label style={S.lbl}>Name (optional)</label>
            <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ihr Name" />

            <label style={S.lbl}>Handynummer *</label>
            <input style={S.input} type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="+49 170 1234567" />

            <label style={S.consent}>
              <input type="checkbox" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: akzent }} />
              <span>Ja, ich möchte WhatsApp-Nachrichten von {betrieb} erhalten. Ich kann mich jederzeit wieder abmelden (z. B. mit „STOP").</span>
            </label>

            <button style={{ ...S.primaer, opacity: senden ? 0.6 : 1 }} onClick={absenden} disabled={senden}>
              {senden ? 'Wird gesendet …' : 'Anmelden'}
            </button>
          </div>
        )}
        <div style={S.footer}>Anmeldung bereitgestellt über ARGONAUT OS · WhatsApp</div>
      </div>
    </main>
  );
}
