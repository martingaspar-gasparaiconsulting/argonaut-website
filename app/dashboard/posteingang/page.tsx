'use client';

// ============================================================
// ARGONAUT OS · Posteingang — E-Mails aus dem verbundenen IMAP-Postfach
// direkt im System (Absender, Betreff, Datum, gelesen/ungelesen), ohne den
// jeweiligen Provider öffnen zu müssen. Microsoft/Google (OAuth) folgen.
// Pfad: app/dashboard/posteingang/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type MailZeile = { uid: number; vonName: string; vonAdresse: string; betreff: string; datumIso: string; gelesen: boolean };

function datum(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const heute = new Date();
  const gleicherTag = d.toDateString() === heute.toDateString();
  return gleicherTag
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function PosteingangSeite() {
  const [mails, setMails] = useState<MailZeile[]>([]);
  const [konto, setKonto] = useState('');
  const [verbunden, setVerbunden] = useState(true);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const r = await fetch('/api/mail/posteingang?n=30');
      const j = await r.json();
      if (!r.ok || !j?.ok) { setFehler(j?.error || 'Abruf fehlgeschlagen.'); setVerbunden(j?.verbunden !== false); return; }
      setVerbunden(!!j.verbunden);
      setKonto(j.konto || '');
      setMails((j.mails || []) as MailZeile[]);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLaden(false); }
  }, []);

  useEffect(() => { void laden_(); }, [laden_]);

  const ungelesen = mails.filter((m) => !m.gelesen).length;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Kommunikation</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={styles.h1}>📥 Posteingang</h1>
        {konto && <span style={styles.konto}>{konto}</span>}
        {ungelesen > 0 && <span style={styles.badge}>{ungelesen} ungelesen</span>}
        <span style={{ flex: 1 }} />
        <button style={styles.mini} onClick={() => void laden_()} disabled={laden}>{laden ? '⏳' : '↻'} Aktualisieren</button>
        <a href="/dashboard/mail-sync" style={styles.mini}>Postfächer</a>
      </div>
      <p style={styles.sub}>Deine letzten E-Mails direkt im System — ohne den Provider zu öffnen. (IMAP; Microsoft 365 & Gmail folgen.)</p>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <div style={styles.hint}>Lade Postfach …</div>
      ) : !verbunden ? (
        <div style={styles.leer}>
          <div style={{ fontSize: 32 }}>✉️</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8 }}>Noch kein Postfach verbunden</div>
          <p style={{ color: C.textDim, margin: '8px 0 14px', maxWidth: 460 }}>Verbinde dein IMAP-Postfach (IONOS, GMX, Strato …) mit E-Mail, Passwort und IMAP-Server — dann erscheinen deine E-Mails hier.</p>
          <a href="/dashboard/mail-sync" style={styles.primaer}>📬 Postfach verbinden</a>
        </div>
      ) : mails.length === 0 && !fehler ? (
        <div style={styles.hint}>Keine Nachrichten im Postfach gefunden.</div>
      ) : (
        <div style={styles.liste}>
          {mails.map((m) => (
            <div key={m.uid} style={{ ...styles.zeile, background: m.gelesen ? 'transparent' : 'rgba(0,229,255,0.05)' }}>
              <span style={{ ...styles.punkt, background: m.gelesen ? 'transparent' : C.cyan, border: m.gelesen ? `1px solid ${C.border}` : 'none' }} />
              <div style={styles.von}>
                <span style={{ fontWeight: m.gelesen ? 600 : 800, color: C.text }}>{m.vonName || m.vonAdresse || 'Unbekannt'}</span>
                {m.vonName && <span style={styles.adr}>{m.vonAdresse}</span>}
              </div>
              <div style={{ ...styles.betreff, fontWeight: m.gelesen ? 400 : 700 }}>{m.betreff}</div>
              <div style={styles.datum}>{datum(m.datumIso)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 1000, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  konto: { color: C.textDim, fontSize: 14, background: 'rgba(143,163,190,0.1)', borderRadius: 999, padding: '4px 12px' },
  badge: { color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 999, padding: '3px 11px', fontSize: 12.5, fontWeight: 800 },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  liste: { display: 'flex', flexDirection: 'column', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' },
  zeile: { display: 'grid', gridTemplateColumns: 'auto minmax(140px, 220px) 1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${C.border}` },
  punkt: { width: 9, height: 9, borderRadius: 999 },
  von: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  adr: { color: C.textDim, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  betreff: { color: C.text, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  datum: { color: C.textDim, fontSize: 12.5, whiteSpace: 'nowrap' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' },
  leer: { textAlign: 'center', padding: '48px 20px', border: `1px dashed ${C.border}`, borderRadius: 16 },
  hint: { color: C.textDim, fontSize: 16, padding: '20px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
