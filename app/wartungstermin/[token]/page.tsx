'use client';

// ============================================================
// ARGONAUT OS · Paket 384 · LK7 · Öffentliche Seite (ohne Login)
// /wartungstermin/<token> — der Kunde bestätigt den vorgeschlagenen
// Wartungstermin oder nennt einen anderen Wunschtermin.
// Schreibt ausschließlich über /api/oeffentlich/wartung-termin (Token).
// ============================================================

import Dreizack from '@/components/Dreizack';
import { useEffect, useState, CSSProperties } from 'react';
import { useParams } from 'next/navigation';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#c9a84c', text: '#EAF1F6',
  textDim: '#9fb3bd', border: 'rgba(122,163,179,0.18)', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C',
};

type Termin = { titel: string; kunde: string; beginn: string; ende: string | null; stand: 'offen' | 'bestaetigt' | 'vorbei' | 'abgesagt' };

function wann(beginn: string, ende: string | null): { datum: string; zeit: string } {
  const b = new Date(beginn);
  const e = ende ? new Date(ende) : null;
  const datum = b.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
  const uhr = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return { datum, zeit: e ? `${uhr(b)}–${uhr(e)} Uhr` : `${uhr(b)} Uhr` };
}

export default function WartungsterminSeite() {
  const params = useParams();
  const token = String((params?.token as string) || '');

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState('');
  const [termin, setTermin] = useState<Termin | null>(null);
  const [senden, setSenden] = useState(false);
  const [aendern, setAendern] = useState(false);
  const [wunsch, setWunsch] = useState('');
  const [wunschGesendet, setWunschGesendet] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/oeffentlich/wartung-termin?token=${encodeURIComponent(token)}`);
        const j = await res.json();
        if (!res.ok) { setFehler(j?.error || 'Termin-Link ungültig.'); return; }
        setBetrieb(j.betrieb || '');
        setTermin(j.termin);
      } catch { setFehler('Verbindung fehlgeschlagen.'); }
      finally { setLaden(false); }
    })();
  }, [token]);

  async function absenden(aktion: 'bestaetigen' | 'anderer') {
    setSenden(true); setFehler(null);
    try {
      const res = await fetch('/api/oeffentlich/wartung-termin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, aktion, nachricht: aktion === 'anderer' ? wunsch : undefined }),
      });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Das hat nicht geklappt.'); return; }
      if (aktion === 'bestaetigen') setTermin((t) => (t ? { ...t, stand: 'bestaetigt' } : t));
      else { setWunschGesendet(true); setAendern(false); }
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setSenden(false); }
  }

  const w = termin ? wann(termin.beginn, termin.ende) : null;

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.brand}>{betrieb ? betrieb : <><Dreizack hoehe={15} style={{ display: 'inline-block', verticalAlign: '-3px', marginRight: 8 }} />ARGONAUT OS</>}</div>

        {laden ? (
          <div style={styles.card}><p style={styles.sub}>Lädt …</p></div>
        ) : fehler && !termin ? (
          <div style={styles.card}><p style={{ ...styles.sub, color: C.danger }}>{fehler}</p></div>
        ) : termin && w ? (
          <div style={styles.card}>
            <h1 style={styles.h1}>{termin.titel}</h1>
            {termin.kunde ? <p style={styles.sub}>für {termin.kunde}</p> : null}
            <div style={styles.termin}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{w.datum}</div>
              <div style={{ color: C.textDim, marginTop: 4 }}>{w.zeit}</div>
            </div>

            {termin.stand === 'bestaetigt' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 6 }}>✅</div>
                <h2 style={styles.h2}>Termin bestätigt</h2>
                <p style={styles.sub}>Vielen Dank! {betrieb || 'Der Betrieb'} ist informiert. Wir freuen uns auf Sie.</p>
              </div>
            ) : termin.stand === 'abgesagt' ? (
              <p style={{ ...styles.sub, color: C.warn, textAlign: 'center' }}>Dieser Termin wurde abgesagt. {betrieb || 'Der Betrieb'} meldet sich mit einem neuen Vorschlag.</p>
            ) : termin.stand === 'vorbei' ? (
              <p style={{ ...styles.sub, color: C.warn, textAlign: 'center' }}>Dieser Termin liegt bereits in der Vergangenheit. Bitte wenden Sie sich direkt an {betrieb || 'den Betrieb'}.</p>
            ) : wunschGesendet ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 6 }}>🙏</div>
                <h2 style={styles.h2}>Wunsch übermittelt</h2>
                <p style={styles.sub}>{betrieb || 'Der Betrieb'} meldet sich mit einem neuen Terminvorschlag bei Ihnen.</p>
              </div>
            ) : (
              <>
                {fehler && <div style={styles.err}>{fehler}</div>}
                {!aendern ? (
                  <div style={styles.btnRow}>
                    <button style={{ ...styles.primaer, opacity: senden ? 0.6 : 1 }} disabled={senden} onClick={() => absenden('bestaetigen')}>
                      ✅ Termin bestätigen
                    </button>
                    <button style={styles.ghost} disabled={senden} onClick={() => setAendern(true)}>
                      Anderen Termin wünschen
                    </button>
                  </div>
                ) : (
                  <>
                    <label style={{ display: 'block', marginTop: 14, fontSize: 14, color: C.textDim }}>
                      Wann passt es Ihnen besser?
                      <textarea value={wunsch} onChange={(e) => setWunsch(e.target.value)} maxLength={500} rows={3}
                        placeholder="z. B. nächste Woche Dienstag oder Donnerstag ab 14 Uhr" style={styles.input} />
                    </label>
                    <div style={styles.btnRow}>
                      <button style={{ ...styles.primaer, opacity: senden || wunsch.trim().length < 3 ? 0.6 : 1 }} disabled={senden || wunsch.trim().length < 3} onClick={() => absenden('anderer')}>
                        Wunsch senden
                      </button>
                      <button style={styles.ghost} disabled={senden} onClick={() => setAendern(false)}>Zurück</button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ) : null}

        <div style={styles.footer}>Terminabstimmung bereitgestellt über ARGONAUT OS</div>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100dvh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: '40px 16px 64px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' },
  wrap: { maxWidth: 560, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 },
  brand: { color: C.gold, letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: 14, fontWeight: 700, textAlign: 'center' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 700, margin: 0, lineHeight: 1.15 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 22, fontWeight: 700, margin: '0 0 4px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '10px 0 0' },
  termin: { margin: '18px 0', padding: '16px 18px', borderLeft: `4px solid ${C.gold}`, background: 'rgba(10,22,40,0.6)', borderRadius: 10 },
  btnRow: { display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' },
  primaer: { background: C.green, color: '#04240f', border: 'none', borderRadius: 12, padding: '14px 22px', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 22px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  input: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text, fontSize: 16, fontFamily: 'inherit', resize: 'vertical' },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, textAlign: 'center' },
  footer: { marginTop: 6, textAlign: 'center', color: C.textDim, fontSize: 12, opacity: 0.7 },
};
