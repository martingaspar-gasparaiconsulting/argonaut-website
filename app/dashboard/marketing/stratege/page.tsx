'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · M7 KI-Kampagnen-Stratege
// Ziel -> /api/marketing-stratege -> Plan -> "Kampagne anlegen"
// legt Kampagne + Inhalte + Kalender-Termine in einem Rutsch an.
// ============================================================

const C = {
  navy: '#0A1628',
  navy2: '#0F1F33',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  danger: '#E06666',
  warn: '#E0A24C',
  textDim: '#8FA3BE',
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Inhalt = { titel: string; typ: string; kanal: string; tag_offset: number; inhalt: string };
type Phase = { phase: string; fokus: string; aktivitaeten: string[] };
type Plan = {
  name: string;
  ziel: string;
  beschreibung: string;
  kanaele: string[];
  empfohlenes_budget: number | null;
  botschaften: string[];
  zeitplan: Phase[];
  inhalte: Inhalt[];
};

const TON_OPTS = ['professionell', 'locker', 'verkäuferisch', 'sachlich-informativ', 'emotional', 'humorvoll'];

function typLabel(v: string): string {
  const m: Record<string, string> = { post: 'Social-Post', newsletter: 'Newsletter', anzeige: 'Anzeige', blog: 'Blog-Artikel' };
  return m[v] ?? v;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0F1F33',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9,
  padding: '10px 12px',
  color: '#fff',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  boxSizing: 'border-box',
};

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, flex: 1 }}>
      <label style={{ display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.textDim, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

export default function KampagnenStratege() {
  const [ziel, setZiel] = useState('');
  const [start, setStart] = useState('');
  const [ende, setEnde] = useState('');
  const [budget, setBudget] = useState('');
  const [tonalitaet, setTonalitaet] = useState('professionell');

  const [planen, setPlanen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [quellen, setQuellen] = useState<string[]>([]);
  const [anlegen, setAnlegen] = useState(false);

  async function planGenerieren() {
    if (!ziel.trim()) { setFehler('Bitte ein Ziel angeben.'); return; }
    setPlanen(true);
    setFehler(null);
    setPlan(null);
    setQuellen([]);
    try {
      const res = await fetch('/api/marketing-stratege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ziel,
          start_datum: start || null,
          end_datum: ende || null,
          budget: budget.trim() ? Number(budget.replace(',', '.')) : null,
          tonalitaet,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFehler(data?.error ?? 'Planung fehlgeschlagen.'); setPlanen(false); return; }
      setPlan(data.plan as Plan);
      setQuellen(data.quellen ?? []);
    } catch {
      setFehler('Netzwerkfehler. Bitte erneut versuchen.');
    }
    setPlanen(false);
  }

  async function kampagneAnlegen() {
    if (!plan) return;
    setAnlegen(true);
    try {
      // 1) Kampagne anlegen
      const kampagnePayload: Record<string, unknown> = {
        name: plan.name,
        ziel: plan.ziel || null,
        beschreibung: plan.beschreibung || null,
        status: 'aktiv',
        kanaele: plan.kanaele,
        budget: plan.empfohlenes_budget ?? (budget.trim() ? Number(budget.replace(',', '.')) : null),
        start_datum: start || null,
        end_datum: ende || null,
      };
      const { data: kData, error: kErr } = await supabase
        .from('marketing_kampagnen').insert(kampagnePayload).select('id').single();
      if (kErr || !kData?.id) { alert('Fehler beim Anlegen der Kampagne: ' + (kErr?.message ?? '')); setAnlegen(false); return; }
      const kampagneId = kData.id as string;

      // 2) Inhalte anlegen
      if (plan.inhalte.length > 0) {
        const inhaltRows = plan.inhalte.map((i) => ({
          kampagne_id: kampagneId,
          titel: i.titel,
          typ: i.typ,
          kanal: i.kanal,
          inhalt: i.inhalt,
          status: 'entwurf',
          ki_generiert: true,
        }));
        const { error: iErr } = await supabase.from('marketing_inhalte').insert(inhaltRows);
        if (iErr) console.error('Inhalte-Fehler:', iErr.message);
      }

      // 3) Kalender-Termine (nur wenn Startdatum gesetzt)
      if (start) {
        const startDate = new Date(start + 'T09:00:00');
        const kalenderRows = plan.inhalte.map((i) => {
          const d = new Date(startDate);
          d.setDate(d.getDate() + (i.tag_offset || 0));
          return {
            kampagne_id: kampagneId,
            titel: i.titel,
            kanal: i.kanal,
            geplant_am: d.toISOString(),
            status: 'geplant',
          };
        });
        if (kalenderRows.length > 0) {
          const { error: calErr } = await supabase.from('marketing_kalender').insert(kalenderRows);
          if (calErr) console.error('Kalender-Fehler:', calErr.message);
        }
      }

      // 4) Sprung auf die neue Detailseite
      window.location.href = `/dashboard/marketing/${kampagneId}`;
    } catch (e) {
      alert('Unerwarteter Fehler beim Anlegen.');
      setAnlegen(false);
    }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <a href="/dashboard/marketing" style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)', textDecoration: 'none' }}>
          ← Zurück zu Marketing
        </a>

        <div style={{ margin: '16px 0 24px' }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 700, color: C.gold, margin: 0 }}>🧠 KI-Kampagnen-Stratege</h1>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
            Ein Ziel rein — ein kompletter Kampagnenplan raus. Per Klick anlegen: Kampagne, Inhalte und Termine entstehen automatisch.
          </p>
        </div>

        {/* Briefing */}
        <div style={{ background: C.navy2, borderRadius: 16, padding: '26px 28px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 28 }}>
          <Feld label="Kampagnen-Ziel *">
            <textarea
              value={ziel}
              onChange={(e) => setZiel(e.target.value)}
              rows={2}
              placeholder="z. B. Im Herbst 30 neue Anfragen für professionelle Holzernte gewinnen"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Feld>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Feld label="Start (optional)">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
            </Feld>
            <Feld label="Ende (optional)">
              <input type="date" value={ende} onChange={(e) => setEnde(e.target.value)} style={inputStyle} />
            </Feld>
            <Feld label="Budget € (optional)">
              <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="z. B. 1500" style={inputStyle} />
            </Feld>
            <Feld label="Tonalität">
              <select value={tonalitaet} onChange={(e) => setTonalitaet(e.target.value)} style={inputStyle}>
                {TON_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Feld>
          </div>
          <button
            onClick={planGenerieren}
            disabled={planen}
            style={{ marginTop: 8, background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '13px 28px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)', cursor: planen ? 'wait' : 'pointer', opacity: planen ? 0.7 : 1 }}
          >
            {planen ? '🧠 KI plant…' : '🧠 Kampagnenplan generieren'}
          </button>
          {fehler && (
            <div style={{ marginTop: 16, background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 10, padding: 14, color: C.danger, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
              {fehler}
            </div>
          )}
        </div>

        {/* PLAN */}
        {plan && (
          <div>
            {quellen.length > 0 && (
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', marginBottom: 16 }}>
                📚 Genutztes Firmen-Wissen: {quellen.join(', ')}
              </p>
            )}

            {/* Übersicht */}
            <div style={{ background: C.navy2, borderRadius: 16, padding: '24px 28px', border: `1px solid ${C.gold}`, marginBottom: 18 }}>
              <h2 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.gold, fontSize: 'clamp(24px, 2.13vw, 34px)', margin: '0 0 8px' }}>{plan.name}</h2>
              {plan.ziel && <p style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff', margin: '0 0 12px', fontSize: 'clamp(15px, 1.31vw, 21px)' }}>🎯 {plan.ziel}</p>}
              {plan.beschreibung && <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 14px', fontSize: 'clamp(14px, 1.25vw, 20px)', lineHeight: 1.6 }}>{plan.beschreibung}</p>}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)', color: C.textDim }}>
                {plan.kanaele.length > 0 && <span>📡 Kanäle: <span style={{ color: '#fff' }}>{plan.kanaele.join(', ')}</span></span>}
                {plan.empfohlenes_budget != null && <span>💶 Empf. Budget: <span style={{ color: '#fff' }}>{plan.empfohlenes_budget.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span></span>}
              </div>
            </div>

            {/* Botschaften */}
            {plan.botschaften.length > 0 && (
              <div style={{ background: C.navy2, borderRadius: 14, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 18 }}>
                <h3 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.cyan, fontSize: 'clamp(17px, 1.5vw, 24px)', margin: '0 0 12px' }}>Kernbotschaften</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontFamily: 'DM Sans, sans-serif', color: '#fff', fontSize: 'clamp(14px, 1.25vw, 20px)', lineHeight: 1.8 }}>
                  {plan.botschaften.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            )}

            {/* Zeitplan */}
            {plan.zeitplan.length > 0 && (
              <div style={{ background: C.navy2, borderRadius: 14, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 18 }}>
                <h3 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.cyan, fontSize: 'clamp(17px, 1.5vw, 24px)', margin: '0 0 14px' }}>Zeitplan</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {plan.zeitplan.map((p, i) => (
                    <div key={i} style={{ borderLeft: `3px solid ${C.gold}`, paddingLeft: 14 }}>
                      <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.gold, fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)' }}>{p.phase}{p.fokus ? ` — ${p.fokus}` : ''}</div>
                      {p.aktivitaeten.length > 0 && (
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', lineHeight: 1.6 }}>
                          {p.aktivitaeten.map((a, j) => <li key={j}>{a}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inhalte */}
            {plan.inhalte.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.cyan, fontSize: 'clamp(17px, 1.5vw, 24px)', margin: '0 0 14px' }}>Erste Inhalte ({plan.inhalte.length})</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {plan.inhalte.map((i, idx) => (
                    <div key={idx} style={{ background: C.navy2, borderRadius: 12, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 700, color: '#fff' }}>{i.titel}</span>
                        <span style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>{typLabel(i.typ)} · {i.kanal} · Tag {i.tag_offset}</span>
                      </div>
                      <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{i.inhalt}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Anlegen */}
            <div style={{ position: 'sticky', bottom: 0, background: C.navy, padding: '16px 0', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                Legt Kampagne + {plan.inhalte.length} Inhalte{start ? ' + Kalender-Termine' : ''} an.
              </span>
              <button
                onClick={kampagneAnlegen}
                disabled={anlegen}
                style={{ background: C.green, color: C.navy, border: 'none', borderRadius: 10, padding: '13px 30px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(16px, 1.38vw, 22px)', cursor: anlegen ? 'wait' : 'pointer', opacity: anlegen ? 0.7 : 1 }}
              >
                {anlegen ? 'Lege an…' : '✓ Kampagne anlegen'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
