'use client';

// ============================================================
// ARGONAUT OS · Bündel 28 · Kanzlei & Steuer (Dashboard)
// Mandate + Fristenkalender mit Ampel. KEINE Steuer-/Rechtsberatung.
// Pfad: app/dashboard/kanzlei/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Mandat = { id: string; mandant: string; art: string | null; aktenzeichen: string | null; status: string };
type Frist = { id: string; mandat_id: string | null; bezeichnung: string; frist: string; erledigt: boolean };

function heute() { return new Date().toISOString().slice(0, 10); }
function d(iso: string) { const p = (iso || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function ampel(f: string): { txt: string; farbe: string } {
  const tage = Math.ceil((new Date(f + 'T00:00:00').getTime() - new Date(heute() + 'T00:00:00').getTime()) / 86400000);
  if (tage < 0) return { txt: `${-tage} T überfällig`, farbe: C.danger };
  if (tage <= 7) return { txt: `in ${tage} T`, farbe: C.warn };
  return { txt: `am ${d(f)}`, farbe: C.green };
}

export default function KanzleiPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'fristen' | 'mandate'>('fristen');
  const [mandate, setMandate] = useState<Mandat[]>([]);
  const [fristen, setFristen] = useState<Frist[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nm, setNm] = useState({ mandant: '', art: 'Steuer', aktenzeichen: '' });
  const [nf, setNf] = useState({ mandat_id: '', bezeichnung: '', frist: heute() });

  const laden_ = useCallback(async () => {
    const { data: m } = await supabase.from('kanzlei_mandate').select('id, mandant, art, aktenzeichen, status').order('mandant', { ascending: true });
    setMandate((m as Mandat[]) ?? []);
    const { data: f } = await supabase.from('kanzlei_fristen').select('id, mandat_id, bezeichnung, frist, erledigt').order('frist', { ascending: true });
    setFristen((f as Frist[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  async function mandatAnlegen() {
    if (!uid || !nm.mandant.trim()) { setFehler('Bitte einen Mandanten angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('kanzlei_mandate').insert({ owner_user_id: uid, mandant: nm.mandant.trim(), art: nm.art.trim() || null, aktenzeichen: nm.aktenzeichen.trim() || null });
    if (error) { setFehler('Mandat konnte nicht gespeichert werden.'); return; }
    setNm({ mandant: '', art: 'Steuer', aktenzeichen: '' }); setOk('Mandat gespeichert.'); await laden_();
  }
  async function fristAnlegen() {
    if (!uid || !nf.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('kanzlei_fristen').insert({ owner_user_id: uid, mandat_id: nf.mandat_id || null, bezeichnung: nf.bezeichnung.trim(), frist: nf.frist });
    if (error) { setFehler('Frist konnte nicht gespeichert werden.'); return; }
    setNf({ mandat_id: '', bezeichnung: '', frist: heute() }); setOk('Frist gespeichert.'); await laden_();
  }
  async function fristErledigt(f: Frist) {
    const { error } = await supabase.from('kanzlei_fristen').update({ erledigt: !f.erledigt, erledigt_am: !f.erledigt ? heute() : null }).eq('id', f.id);
    if (!error) setFristen((l) => l.map((x) => (x.id === f.id ? { ...x, erledigt: !f.erledigt } : x)));
  }

  const mandatName = useMemo(() => Object.fromEntries(mandate.map((m) => [m.id, m.mandant])), [mandate]);
  const offen = fristen.filter((f) => !f.erledigt);
  const offenKritisch = offen.filter((f) => new Date(f.frist) <= new Date(new Date().getTime() + 7 * 86400000)).length;

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>⚖️ Kanzlei & Steuer</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'fristen' ? styles.tabAn : {}) }} onClick={() => setTab('fristen')}>⏰ Fristen {offenKritisch > 0 && <span style={styles.pill}>{offenKritisch}</span>}</button>
        <button style={{ ...styles.tab, ...(tab === 'mandate' ? styles.tabAn : {}) }} onClick={() => setTab('mandate')}>📁 Mandate</button>
      </div>
      <p style={styles.sub}>Reines Verwaltungswerkzeug — keine Steuer- oder Rechtsberatung.</p>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'fristen' ? (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Frist anlegen</div>
            <div style={styles.row}>
              <select style={{ ...styles.inp, minWidth: 150 }} value={nf.mandat_id} onChange={(e) => setNf({ ...nf, mandat_id: e.target.value })}>
                <option value="">Mandat (optional)</option>
                {mandate.map((m) => <option key={m.id} value={m.id}>{m.mandant}</option>)}
              </select>
              <input style={{ ...styles.inp, flex: 1 }} value={nf.bezeichnung} onChange={(e) => setNf({ ...nf, bezeichnung: e.target.value })} placeholder="z. B. USt-Voranmeldung Q1" />
              <label style={styles.lab}>Frist<input type="date" style={styles.inp} value={nf.frist} onChange={(e) => setNf({ ...nf, frist: e.target.value })} /></label>
              <button style={styles.primaer} onClick={fristAnlegen}>＋ Frist</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {fristen.map((f) => {
                const amp = f.erledigt ? { txt: 'erledigt', farbe: C.textDim } : ampel(f.frist);
                return (
                  <div key={f.id} style={styles.item}>
                    <input type="checkbox" checked={f.erledigt} onChange={() => fristErledigt(f)} style={{ width: 18, height: 18 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, textDecoration: f.erledigt ? 'line-through' : 'none', opacity: f.erledigt ? 0.6 : 1 }}>{f.bezeichnung}</div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>{f.mandat_id ? `${mandatName[f.mandat_id] || 'Mandat'} · ` : ''}Frist {d(f.frist)}</div>
                    </div>
                    <span style={{ ...styles.badge, color: amp.farbe, borderColor: amp.farbe }}>⏰ {amp.txt}</span>
                  </div>
                );
              })}
              {!fristen.length && <p style={styles.dim}>Noch keine Fristen.</p>}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Mandat anlegen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={nm.mandant} onChange={(e) => setNm({ ...nm, mandant: e.target.value })} placeholder="Mandant" />
              <select style={styles.inp} value={nm.art} onChange={(e) => setNm({ ...nm, art: e.target.value })}><option>Steuer</option><option>Recht</option><option>Buchhaltung</option><option>Sonstige</option></select>
              <input style={{ ...styles.inp, width: 140 }} value={nm.aktenzeichen} onChange={(e) => setNm({ ...nm, aktenzeichen: e.target.value })} placeholder="Aktenzeichen" />
              <button style={styles.primaer} onClick={mandatAnlegen}>＋ Mandat</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {mandate.map((m) => (
                <div key={m.id} style={styles.item}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{m.mandant} <span style={{ color: C.textDim, fontWeight: 400 }}>· {m.art || '—'}</span></div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{m.aktenzeichen ? `Az. ${m.aktenzeichen} · ` : ''}{fristen.filter((f) => f.mandat_id === m.id && !f.erledigt).length} offene Frist(en)</div>
                  </div>
                  <span style={{ ...styles.badge, color: C.cyan, borderColor: C.cyan }}>{m.status}</span>
                </div>
              ))}
              {!mandate.length && <p style={styles.dim}>Noch keine Mandate.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  pill: { background: C.danger, color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 800 },
  sub: { color: C.textDim, fontSize: 14, margin: '4px 0 0' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
