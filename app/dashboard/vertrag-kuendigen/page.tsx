'use client';

// ============================================================
// ARGONAUT OS · C1 · Vertrag kündigen (§ 312k-Ablauf)
// Vertrag wählen → Grund angeben → verbindlich bestätigen → Bestätigung
// per Mail. Schreibt über /api/vertrag-kuendigen (RLS-scoped).
// Breite/Abstand kommen aus der zentralen Seitenschale (layout.tsx).
// ============================================================

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)', inputBg: 'rgba(255,255,255,0.05)', danger: '#E06666', warn: '#E0A24C',
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

type Vertrag = {
  id: string; bezeichnung: string; vertragspartner: string | null; vertragsnummer: string | null;
  ende: string | null; kuendigungsfrist_tage: number | null;
  kosten_betrag: number | null; kosten_intervall: string | null; status: string;
};

function deDatum(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE');
}
function stichtag(ende: string | null, frist: number | null): string | null {
  if (!ende) return null;
  const d = new Date(ende);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - (Number(frist) || 0));
  return d.toISOString().slice(0, 10);
}
function eur(n: number | null): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function VertragKuendigenSeite() {
  const [liste, setListe] = useState<Vertrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [sel, setSel] = useState<string>('');
  const [grund, setGrund] = useState('');
  const [phase, setPhase] = useState<'form' | 'confirm' | 'fertig'>('form');
  const [sende, setSende] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<{ mailGesendet?: boolean; an?: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('vertraege')
          .select('id,bezeichnung,vertragspartner,vertragsnummer,ende,kuendigungsfrist_tage,kosten_betrag,kosten_intervall,status')
          .eq('status', 'aktiv')
          .order('ende', { ascending: true });
        setListe((data as Vertrag[]) || []);
      } catch {
        /* leere Liste */
      } finally {
        setLaden(false);
      }
    })();
  }, []);

  const v = liste.find((x) => x.id === sel) || null;

  async function kuendigen() {
    if (!v) return;
    setSende(true);
    setFehler(null);
    try {
      const res = await fetch('/api/vertrag-kuendigen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vertrag_id: v.id, grund }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) {
        setFehler(d?.fehler || 'Kündigung fehlgeschlagen.');
        setPhase('form');
        return;
      }
      setErgebnis({ mailGesendet: d.mailGesendet, an: d.an });
      setListe((prev) => prev.filter((x) => x.id !== v.id));
      setPhase('fertig');
    } catch {
      setFehler('Verbindungsfehler. Bitte erneut versuchen.');
      setPhase('form');
    } finally {
      setSende(false);
    }
  }

  const card: React.CSSProperties = {
    background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 16, padding: 24, maxWidth: 720,
  };
  const label: React.CSSProperties = { display: 'block', color: C.textDim, fontSize: 13, marginBottom: 6, fontWeight: 600 };
  const input: React.CSSProperties = {
    width: '100%', background: C.inputBg, border: `1px solid ${C.line}`, borderRadius: 10,
    color: C.text, padding: '11px 13px', fontSize: 15, fontFamily: 'inherit',
  };
  const zeile = (l: string, r: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderTop: `1px solid ${C.line}` }}>
      <span style={{ color: C.textDim }}>{l}</span>
      <span style={{ color: C.text, fontWeight: 600, textAlign: 'right' }}>{r}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: C.gold, letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          ARGONAUT OS · Verträge
        </div>
        <h1 style={{ fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 900, margin: 0 }}>Vertrag kündigen</h1>
        <p style={{ color: C.textDim, marginTop: 8, maxWidth: 720 }}>
          Vertrag wählen, Grund angeben, verbindlich bestätigen — die Bestätigung geht anschließend
          automatisch per E-Mail an dich (Textform).
        </p>
      </div>

      {laden ? (
        <div style={{ color: C.textDim }}>Verträge werden geladen …</div>
      ) : phase === 'fertig' ? (
        <div style={{ ...card, borderColor: 'rgba(76,175,125,0.5)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Kündigung erfasst</h2>
          <p style={{ color: C.textDim, margin: '0 0 16px' }}>
            Der Vertrag wurde auf „gekündigt" gesetzt.{' '}
            {ergebnis?.mailGesendet
              ? <>Eine Bestätigung wurde an <b style={{ color: C.text }}>{ergebnis?.an}</b> gesendet.</>
              : 'Die Bestätigungs-Mail konnte nicht zugestellt werden — der Vorgang ist aber gespeichert.'}
          </p>
          <a href="/dashboard/vertraege" style={{ display: 'inline-block', background: C.gold, color: C.navy, borderRadius: 8, padding: '10px 18px', fontWeight: 700, textDecoration: 'none' }}>
            Zu den Verträgen
          </a>
        </div>
      ) : liste.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, color: C.textDim }}>Aktuell sind keine aktiven Verträge vorhanden, die gekündigt werden könnten.</p>
        </div>
      ) : (
        <div style={card}>
          {fehler && (
            <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>
              {fehler}
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={label}>Vertrag wählen</label>
            <select
              value={sel}
              onChange={(e) => { setSel(e.target.value); setPhase('form'); setFehler(null); }}
              style={input}
            >
              <option value="">— bitte wählen —</option>
              {liste.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.bezeichnung}{x.vertragspartner ? ` · ${x.vertragspartner}` : ''}
                </option>
              ))}
            </select>
          </div>

          {v && (
            <>
              <div style={{ marginBottom: 18 }}>
                {zeile('Vertragspartner', v.vertragspartner || '—')}
                {zeile('Vertragsnummer', v.vertragsnummer || '—')}
                {zeile('Vertragsende', deDatum(v.ende))}
                {zeile('Kündigungsfrist', `${Number(v.kuendigungsfrist_tage) || 0} Tage vor Ende`)}
                {zeile('Spätester Kündigungstermin', deDatum(stichtag(v.ende, v.kuendigungsfrist_tage)))}
                {v.kosten_betrag != null && zeile('Kosten', `${eur(v.kosten_betrag)} ${v.kosten_intervall || ''}`.trim())}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={label}>Kündigungsgrund (optional)</label>
                <textarea
                  value={grund}
                  onChange={(e) => setGrund(e.target.value)}
                  rows={3}
                  placeholder="z. B. Wechsel des Anbieters, Kostengründe …"
                  style={{ ...input, resize: 'vertical' }}
                />
              </div>

              {phase === 'confirm' ? (
                <div style={{ background: 'rgba(224,162,76,0.10)', border: `1px solid ${C.warn}`, borderRadius: 12, padding: 16 }}>
                  <p style={{ margin: '0 0 14px', color: C.text }}>
                    <b>„{v.bezeichnung}"</b> wird verbindlich zum nächstmöglichen Termin gekündigt und auf
                    „gekündigt" gesetzt. Eine Bestätigung geht per E-Mail an dich. Fortfahren?
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={kuendigen}
                      disabled={sende}
                      style={{ background: C.danger, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 18px', fontWeight: 700, cursor: sende ? 'wait' : 'pointer', opacity: sende ? 0.7 : 1 }}
                    >
                      {sende ? 'Kündigung wird gesendet …' : 'Ja, verbindlich kündigen'}
                    </button>
                    <button
                      onClick={() => setPhase('form')}
                      disabled={sende}
                      style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.line}`, borderRadius: 8, padding: '11px 18px', cursor: 'pointer' }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setPhase('confirm')}
                  style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '12px 20px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Vertrag kündigen
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
