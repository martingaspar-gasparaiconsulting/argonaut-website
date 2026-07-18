'use client';

// ============================================================
// ARGONAUT OS · Bündel 14 · Öffentliche Angebots-Seite (ohne Login)
// /angebot/<token> — Kunde sieht das Angebot und nimmt es an oder lehnt ab.
// Schreibt ausschließlich über /api/oeffentlich/angebot (Service-Role, Token).
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { useParams } from 'next/navigation';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#c9a84c', text: '#EAF1F6',
  textDim: '#9fb3bd', border: 'rgba(122,163,179,0.18)', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C',
};

type Pos = { bezeichnung: string; menge: number; einheit: string; einzelpreis: number; netto: number; satz: number };
type Angebot = { nummer: string; titel: string; kunde: string; status: string; gueltigBis: string | null; netto: number; mwst: number; brutto: number };

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function datum(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

export default function AngebotSeite() {
  const params = useParams();
  const token = String((params?.token as string) || '');

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState('');
  const [angebot, setAngebot] = useState<Angebot | null>(null);
  const [positionen, setPositionen] = useState<Pos[]>([]);
  const [senden, setSenden] = useState(false);
  const [ergebnis, setErgebnis] = useState<'angenommen' | 'abgelehnt' | null>(null);

  async function laden_() {
    try {
      const res = await fetch(`/api/oeffentlich/angebot?token=${encodeURIComponent(token)}`);
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Angebots-Link ungültig.'); return; }
      setBetrieb(j.betrieb || '');
      setAngebot(j.angebot);
      setPositionen(Array.isArray(j.positionen) ? j.positionen : []);
      if (j.angebot?.status === 'angenommen') setErgebnis('angenommen');
      if (j.angebot?.status === 'abgelehnt') setErgebnis('abgelehnt');
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLaden(false); }
  }
  useEffect(() => { if (token) laden_(); /* eslint-disable-next-line */ }, [token]);

  async function entscheiden(entscheidung: 'annehmen' | 'ablehnen') {
    setSenden(true); setFehler(null);
    try {
      const res = await fetch('/api/oeffentlich/angebot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, entscheidung }),
      });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Aktion fehlgeschlagen.'); return; }
      setErgebnis(j.status === 'angenommen' ? 'angenommen' : 'abgelehnt');
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setSenden(false); }
  }

  const abgelaufen = angebot?.status === 'abgelaufen';
  const schonEntschieden = ergebnis !== null;

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.brand}>🔱 {betrieb || 'ARGONAUT OS'}</div>

        {laden ? (
          <div style={styles.card}><p style={styles.sub}>Lädt …</p></div>
        ) : fehler && !angebot ? (
          <div style={styles.card}><p style={{ ...styles.sub, color: C.danger }}>{fehler}</p></div>
        ) : angebot ? (
          <>
            <div style={styles.card}>
              <h1 style={styles.h1}>{angebot.titel}</h1>
              <p style={styles.sub}>
                {angebot.nummer ? <>Angebot {angebot.nummer} · </> : null}
                {angebot.kunde ? <>für {angebot.kunde} · </> : null}
                {angebot.gueltigBis ? <>gültig bis {datum(angebot.gueltigBis)}</> : null}
              </p>

              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Leistung</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Menge</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Einzel</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Netto</th>
                  </tr></thead>
                  <tbody>
                    {positionen.map((p, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{p.bezeichnung}</td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>{p.menge.toLocaleString('de-DE')} {p.einheit}</td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>{eur(p.einzelpreis)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>{eur(p.netto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={styles.summe}>
                <div><span style={styles.sk}>Netto</span> {eur(angebot.netto)}</div>
                <div><span style={styles.sk}>MwSt</span> {eur(angebot.mwst)}</div>
                <div style={styles.brutto}><span style={styles.sk}>Gesamt</span> {eur(angebot.brutto)}</div>
              </div>
            </div>

            <div style={styles.card}>
              {schonEntschieden ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 6 }}>{ergebnis === 'angenommen' ? '✅' : '🙏'}</div>
                  <h2 style={styles.h2}>{ergebnis === 'angenommen' ? 'Angebot angenommen' : 'Angebot abgelehnt'}</h2>
                  <p style={styles.sub}>
                    {ergebnis === 'angenommen'
                      ? `Vielen Dank! ${betrieb || 'Der Betrieb'} wurde informiert und meldet sich bei Ihnen.`
                      : 'Danke für Ihre Rückmeldung. Bei Fragen melden Sie sich gern.'}
                  </p>
                </div>
              ) : abgelaufen ? (
                <p style={{ ...styles.sub, color: C.warn, textAlign: 'center' }}>
                  Dieses Angebot ist abgelaufen{angebot.gueltigBis ? ` (gültig war bis ${datum(angebot.gueltigBis)})` : ''}.
                  Bitte fragen Sie ein aktuelles Angebot an.
                </p>
              ) : (
                <>
                  <p style={{ ...styles.sub, textAlign: 'center', marginTop: 0 }}>Möchten Sie dieses Angebot annehmen?</p>
                  {fehler && <div style={styles.err}>{fehler}</div>}
                  <div style={styles.btnRow}>
                    <button style={{ ...styles.primaer, opacity: senden ? 0.6 : 1 }} disabled={senden} onClick={() => entscheiden('annehmen')}>
                      ✅ Angebot annehmen
                    </button>
                    <button style={{ ...styles.ghost, opacity: senden ? 0.6 : 1 }} disabled={senden} onClick={() => entscheiden('ablehnen')}>
                      Ablehnen
                    </button>
                  </div>
                  <p style={{ ...styles.hint }}>Mit „Angebot annehmen" erklären Sie verbindlich Ihr Einverständnis mit den oben genannten Leistungen und Preisen.</p>
                </>
              )}
            </div>
          </>
        ) : null}

        <div style={styles.footer}>Angebot bereitgestellt über ARGONAUT OS</div>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100dvh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: '40px 16px 64px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' },
  wrap: { maxWidth: 680, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 },
  brand: { color: C.gold, letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: 14, fontWeight: 700, textAlign: 'center' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 700, margin: 0, lineHeight: 1.15 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 22, fontWeight: 700, margin: '0 0 4px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '10px 0 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 15 },
  th: { textAlign: 'left', color: C.textDim, fontWeight: 600, fontSize: 13, padding: '0 10px 10px', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  summe: { marginTop: 16, display: 'flex', gap: 20, justifyContent: 'flex-end', flexWrap: 'wrap', fontSize: 15 },
  sk: { color: C.textDim, marginRight: 6 },
  brutto: { fontWeight: 800, color: C.gold, fontSize: 18 },
  btnRow: { display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' },
  primaer: { background: C.green, color: '#04240f', border: 'none', borderRadius: 12, padding: '14px 22px', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 22px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 12.5, textAlign: 'center', marginTop: 12, lineHeight: 1.5 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, textAlign: 'center' },
  footer: { marginTop: 6, textAlign: 'center', color: C.textDim, fontSize: 12, opacity: 0.7 },
};
