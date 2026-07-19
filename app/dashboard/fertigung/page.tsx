'use client';

// ============================================================
// ARGONAUT OS · Bündel 22 · Fertigung & PPS (Dashboard)
// Reiter "Stücklisten" (BOM mit Komponenten) und "Fertigungsaufträge" (Status).
// Pfad: app/dashboard/fertigung/page.tsx
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

type SL = { id: string; name: string; produkt: string | null };
type SLPos = { id: string; komponente: string; menge: number; einheit: string };
type Auftrag = { id: string; auftragsnr: string | null; produkt: string | null; stueckliste_id: string | null; menge: number; status: string; start_am: string | null; fertig_am: string | null };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
const ST_STATUS: { key: string; label: string; farbe: string }[] = [
  { key: 'geplant', label: 'Geplant', farbe: C.cyan },
  { key: 'in_arbeit', label: 'In Arbeit', farbe: C.warn },
  { key: 'fertig', label: 'Fertig', farbe: C.green },
  { key: 'storniert', label: 'Storniert', farbe: C.danger },
];
function stInfo(k: string) { return ST_STATUS.find((s) => s.key === k) || ST_STATUS[0]; }

export default function FertigungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'sl' | 'auf'>('sl');
  const [sls, setSls] = useState<SL[]>([]);
  const [aktivSl, setAktivSl] = useState<SL | null>(null);
  const [pos, setPos] = useState<SLPos[]>([]);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [nsl, setNsl] = useState({ name: '', produkt: '' });
  const [np, setNp] = useState({ komponente: '', menge: '1', einheit: 'Stk' });
  const [na, setNa] = useState({ auftragsnr: '', produkt: '', stueckliste_id: '', menge: '1', start_am: heute() });

  const ladeSls = useCallback(async () => {
    const { data } = await supabase.from('fertigung_stuecklisten').select('id, name, produkt').order('erstellt_am', { ascending: false });
    setSls((data as SL[]) ?? []);
  }, []);
  const ladePos = useCallback(async (slId: string) => {
    const { data } = await supabase.from('fertigung_stueckliste_positionen').select('id, komponente, menge, einheit').eq('stueckliste_id', slId).order('position', { ascending: true });
    setPos((data as SLPos[]) ?? []);
  }, []);
  const ladeAuftraege = useCallback(async () => {
    const { data } = await supabase.from('fertigung_auftraege').select('id, auftragsnr, produkt, stueckliste_id, menge, status, start_am, fertig_am').order('erstellt_am', { ascending: false });
    setAuftraege((data as Auftrag[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeSls(); await ladeAuftraege(); setLaden(false);
    })();
  }, [ladeSls, ladeAuftraege]);

  async function slAnlegen() {
    if (!uid || !nsl.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('fertigung_stuecklisten').insert({ owner_user_id: uid, name: nsl.name.trim(), produkt: nsl.produkt.trim() || null }).select('id, name, produkt').single();
    if (error || !data) { setFehler('Stückliste konnte nicht angelegt werden.'); return; }
    setSls((l) => [data as SL, ...l]); setNsl({ name: '', produkt: '' }); setAktivSl(data as SL); setPos([]);
  }
  async function slOeffnen(sl: SL) { setAktivSl(sl); await ladePos(sl.id); }
  async function posAnlegen() {
    if (!uid || !aktivSl || !np.komponente.trim()) { setFehler('Bitte eine Komponente angeben.'); return; }
    setFehler(null);
    const { error } = await supabase.from('fertigung_stueckliste_positionen').insert({ owner_user_id: uid, stueckliste_id: aktivSl.id, komponente: np.komponente.trim(), menge: num(np.menge), einheit: np.einheit.trim() || 'Stk', position: pos.length + 1 });
    if (error) { setFehler('Komponente konnte nicht gespeichert werden.'); return; }
    setNp({ komponente: '', menge: '1', einheit: 'Stk' }); await ladePos(aktivSl.id);
  }
  async function posLoeschen(id: string) { if (!aktivSl) return; await supabase.from('fertigung_stueckliste_positionen').delete().eq('id', id); await ladePos(aktivSl.id); }

  async function auftragAnlegen() {
    if (!uid || !na.produkt.trim()) { setFehler('Bitte ein Produkt angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('fertigung_auftraege').insert({
      owner_user_id: uid, auftragsnr: na.auftragsnr.trim() || null, produkt: na.produkt.trim(),
      stueckliste_id: na.stueckliste_id || null, menge: num(na.menge) || 1, start_am: na.start_am || null,
    });
    if (error) { setFehler('Auftrag konnte nicht angelegt werden.'); return; }
    setNa({ auftragsnr: '', produkt: '', stueckliste_id: '', menge: '1', start_am: heute() }); setOk('Fertigungsauftrag angelegt.'); await ladeAuftraege();
  }
  async function auftragStatus(a: Auftrag, status: string) {
    const patch: Record<string, unknown> = { status };
    if (status === 'fertig') patch.fertig_am = heute();
    const { error } = await supabase.from('fertigung_auftraege').update(patch).eq('id', a.id);
    if (!error) setAuftraege((l) => l.map((x) => (x.id === a.id ? { ...x, status, fertig_am: status === 'fertig' ? heute() : x.fertig_am } : x)));
  }

  const slName = useMemo(() => Object.fromEntries(sls.map((s) => [s.id, s.name])), [sls]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🏭 Fertigung & PPS</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'sl' ? styles.tabAn : {}) }} onClick={() => setTab('sl')}>🧩 Stücklisten</button>
        <button style={{ ...styles.tab, ...(tab === 'auf' ? styles.tabAn : {}) }} onClick={() => setTab('auf')}>🏭 Fertigungsaufträge</button>
      </div>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'sl' ? (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Neue Stückliste</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={nsl.name} onChange={(e) => setNsl({ ...nsl, name: e.target.value })} placeholder="Name (z. B. Tisch Modell A)" />
              <input style={{ ...styles.inp, flex: 1 }} value={nsl.produkt} onChange={(e) => setNsl({ ...nsl, produkt: e.target.value })} placeholder="Produkt / Artikel-Nr." />
              <button style={styles.primaer} onClick={slAnlegen}>＋ Anlegen</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.split}>
              <div style={styles.lvListe}>
                {sls.map((s) => (
                  <button key={s.id} style={{ ...styles.lvItem, ...(aktivSl?.id === s.id ? styles.lvAktiv : {}) }} onClick={() => slOeffnen(s)}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{s.produkt || '—'}</div>
                  </button>
                ))}
                {!sls.length && <p style={styles.dim}>Noch keine Stücklisten.</p>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {!aktivSl ? <p style={styles.dim}>Links eine Stückliste wählen.</p> : (
                  <div style={styles.card}>
                    <div style={{ fontWeight: 800 }}>{aktivSl.name} · Komponenten</div>
                    {pos.map((p) => (
                      <div key={p.id} style={styles.posZeile}>
                        <span style={{ flex: 1 }}>{p.komponente}</span>
                        <span style={{ color: C.textDim }}>{p.menge.toLocaleString('de-DE')} {p.einheit}</span>
                        <button style={styles.wegBtn} onClick={() => posLoeschen(p.id)}>✕</button>
                      </div>
                    ))}
                    <div style={styles.row}>
                      <input style={{ ...styles.inp, flex: 1 }} value={np.komponente} onChange={(e) => setNp({ ...np, komponente: e.target.value })} placeholder="Komponente / Material" />
                      <input style={{ ...styles.inp, width: 70 }} value={np.menge} onChange={(e) => setNp({ ...np, menge: e.target.value })} inputMode="decimal" />
                      <input style={{ ...styles.inp, width: 60 }} value={np.einheit} onChange={(e) => setNp({ ...np, einheit: e.target.value })} />
                      <button style={styles.dazuBtn} onClick={posAnlegen}>＋</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Neuer Fertigungsauftrag</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, width: 110 }} value={na.auftragsnr} onChange={(e) => setNa({ ...na, auftragsnr: e.target.value })} placeholder="Auftrags-Nr." />
              <input style={{ ...styles.inp, flex: 1 }} value={na.produkt} onChange={(e) => setNa({ ...na, produkt: e.target.value })} placeholder="Produkt" />
              <select style={{ ...styles.inp, minWidth: 140 }} value={na.stueckliste_id} onChange={(e) => setNa({ ...na, stueckliste_id: e.target.value })}>
                <option value="">Stückliste (optional)</option>
                {sls.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <label style={styles.lab}>Menge<input style={{ ...styles.inp, width: 70 }} value={na.menge} onChange={(e) => setNa({ ...na, menge: e.target.value })} inputMode="decimal" /></label>
              <label style={styles.lab}>Start<input type="date" style={styles.inp} value={na.start_am} onChange={(e) => setNa({ ...na, start_am: e.target.value })} /></label>
              <button style={styles.primaer} onClick={auftragAnlegen}>＋ Auftrag</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {auftraege.map((a) => {
                const si = stInfo(a.status);
                return (
                  <div key={a.id} style={styles.item}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{a.auftragsnr ? `#${a.auftragsnr} · ` : ''}{a.produkt} <span style={{ color: C.textDim, fontWeight: 400 }}>· {a.menge} Stk</span></div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>{a.stueckliste_id ? `${slName[a.stueckliste_id] || 'Stückliste'} · ` : ''}{a.start_am ? `Start ${a.start_am.split('-').reverse().join('.')}` : ''}{a.fertig_am ? ` · fertig ${a.fertig_am.split('-').reverse().join('.')}` : ''}</div>
                    </div>
                    <select style={styles.statusSelect} value={a.status} onChange={(e) => auftragStatus(a, e.target.value)}>
                      {ST_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <span style={{ ...styles.punkt, background: si.farbe }} />
                  </div>
                );
              })}
              {!auftraege.length && <p style={styles.dim}>Noch keine Fertigungsaufträge.</p>}
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
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6 },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  wegBtn: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  statusSelect: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' },
  punkt: { width: 12, height: 12, borderRadius: 999 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
