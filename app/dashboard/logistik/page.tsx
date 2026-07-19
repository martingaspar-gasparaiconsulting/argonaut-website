'use client';

// ============================================================
// ARGONAUT OS · Bündel 34 · Logistik-Fachpaket (Dashboard)
// Touren (Fahrer/Fahrzeug) + Sendungen mit Status-Tracking je Tour.
// Pfad: app/dashboard/logistik/page.tsx
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

type Tour = { id: string; datum: string; fahrer: string | null; fahrzeug: string | null; status: string };
type Sendung = { id: string; tour_id: string | null; sendungsnr: string | null; empfaenger: string | null; adresse: string | null; status: string; reihenfolge: number };

function heute() { return new Date().toISOString().slice(0, 10); }
function d(iso: string) { const p = (iso || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
const S_STATUS: Record<string, string> = { offen: C.textDim, unterwegs: C.cyan, zugestellt: C.green, fehlgeschlagen: C.danger };
const T_STATUS: Record<string, string> = { geplant: C.textDim, unterwegs: C.cyan, abgeschlossen: C.green };

export default function LogistikPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [touren, setTouren] = useState<Tour[]>([]);
  const [sendungen, setSendungen] = useState<Sendung[]>([]);
  const [aktiv, setAktiv] = useState<Tour | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nt, setNt] = useState({ datum: heute(), fahrer: '', fahrzeug: '' });
  const [ns, setNs] = useState({ sendungsnr: '', empfaenger: '', adresse: '' });

  const laden_ = useCallback(async () => {
    const { data: t } = await supabase.from('logistik_touren').select('id, datum, fahrer, fahrzeug, status').order('datum', { ascending: false });
    setTouren((t as Tour[]) ?? []);
    const { data: s } = await supabase.from('logistik_sendungen').select('id, tour_id, sendungsnr, empfaenger, adresse, status, reihenfolge').order('reihenfolge', { ascending: true });
    setSendungen((s as Sendung[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  async function tourAnlegen() {
    if (!uid) return;
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('logistik_touren').insert({ owner_user_id: uid, datum: nt.datum, fahrer: nt.fahrer.trim() || null, fahrzeug: nt.fahrzeug.trim() || null })
      .select('id, datum, fahrer, fahrzeug, status').single();
    if (error || !data) { setFehler('Tour konnte nicht angelegt werden.'); return; }
    setNt({ datum: heute(), fahrer: '', fahrzeug: '' }); setOk('Tour angelegt.'); await laden_(); setAktiv(data as Tour);
  }
  async function tourStatus(t: Tour, status: string) {
    const { error } = await supabase.from('logistik_touren').update({ status }).eq('id', t.id);
    if (!error) { setTouren((l) => l.map((x) => (x.id === t.id ? { ...x, status } : x))); setAktiv((a) => (a && a.id === t.id ? { ...a, status } : a)); }
  }
  async function sendungAnlegen() {
    if (!uid || !aktiv || !ns.empfaenger.trim()) { setFehler('Bitte einen Empfänger angeben.'); return; }
    setFehler(null);
    const anzahl = sendungen.filter((x) => x.tour_id === aktiv.id).length;
    const { error } = await supabase.from('logistik_sendungen').insert({
      owner_user_id: uid, tour_id: aktiv.id, sendungsnr: ns.sendungsnr.trim() || null, empfaenger: ns.empfaenger.trim(), adresse: ns.adresse.trim() || null, reihenfolge: anzahl + 1,
    });
    if (error) { setFehler('Sendung konnte nicht gespeichert werden.'); return; }
    setNs({ sendungsnr: '', empfaenger: '', adresse: '' }); await laden_();
  }
  async function sendungStatus(s: Sendung, status: string) {
    const { error } = await supabase.from('logistik_sendungen').update({ status }).eq('id', s.id);
    if (!error) setSendungen((l) => l.map((x) => (x.id === s.id ? { ...x, status } : x)));
  }

  const tourSendungen = useMemo(() => (aktiv ? sendungen.filter((s) => s.tour_id === aktiv.id) : []), [aktiv, sendungen]);
  const zugestellt = tourSendungen.filter((s) => s.status === 'zugestellt').length;

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🚚 Logistik</h1>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Tour anlegen</div>
        <div style={styles.row}>
          <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nt.datum} onChange={(e) => setNt({ ...nt, datum: e.target.value })} /></label>
          <input style={{ ...styles.inp, flex: 1 }} value={nt.fahrer} onChange={(e) => setNt({ ...nt, fahrer: e.target.value })} placeholder="Fahrer" />
          <input style={{ ...styles.inp, width: 140 }} value={nt.fahrzeug} onChange={(e) => setNt({ ...nt, fahrzeug: e.target.value })} placeholder="Fahrzeug / Kennz." />
          <button style={styles.primaer} onClick={tourAnlegen}>＋ Tour</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.lvListe}>
            {touren.map((t) => {
              const anz = sendungen.filter((s) => s.tour_id === t.id).length;
              return (
                <button key={t.id} style={{ ...styles.lvItem, ...(aktiv?.id === t.id ? styles.lvAktiv : {}) }} onClick={() => setAktiv(t)}>
                  <div style={{ fontWeight: 700 }}>{d(t.datum)} <span style={{ color: T_STATUS[t.status], fontWeight: 400 }}>· {t.status}</span></div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{t.fahrer || '—'}{t.fahrzeug ? ` · ${t.fahrzeug}` : ''} · {anz} Stopps</div>
                </button>
              );
            })}
            {!touren.length && <p style={styles.dim}>Noch keine Touren.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links eine Tour wählen.</p> : (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontWeight: 800 }}>Tour {d(aktiv.datum)} · {zugestellt}/{tourSendungen.length} zugestellt</div>
                  <select style={styles.statusSelect} value={aktiv.status} onChange={(e) => tourStatus(aktiv, e.target.value)}>
                    <option value="geplant">geplant</option><option value="unterwegs">unterwegs</option><option value="abgeschlossen">abgeschlossen</option>
                  </select>
                </div>
                <div style={styles.row}>
                  <input style={{ ...styles.inp, width: 120 }} value={ns.sendungsnr} onChange={(e) => setNs({ ...ns, sendungsnr: e.target.value })} placeholder="Sendungs-Nr." />
                  <input style={{ ...styles.inp, flex: 1 }} value={ns.empfaenger} onChange={(e) => setNs({ ...ns, empfaenger: e.target.value })} placeholder="Empfänger" />
                  <input style={{ ...styles.inp, flex: 1 }} value={ns.adresse} onChange={(e) => setNs({ ...ns, adresse: e.target.value })} placeholder="Adresse" />
                  <button style={styles.dazuBtn} onClick={sendungAnlegen}>＋ Stopp</button>
                </div>
                {tourSendungen.map((s) => (
                  <div key={s.id} style={styles.posZeile}>
                    <span style={{ minWidth: 24, fontWeight: 800, color: C.gold }}>{s.reihenfolge}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{s.empfaenger}{s.sendungsnr ? ` · ${s.sendungsnr}` : ''}</div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>{s.adresse || '—'}</div>
                    </div>
                    <select style={{ ...styles.statusSelect, borderColor: S_STATUS[s.status] }} value={s.status} onChange={(e) => sendungStatus(s, e.target.value)}>
                      <option value="offen">offen</option><option value="unterwegs">unterwegs</option><option value="zugestellt">zugestellt</option><option value="fehlgeschlagen">fehlgeschlagen</option>
                    </select>
                  </div>
                ))}
                {!tourSendungen.length && <p style={styles.dim}>Noch keine Sendungen auf dieser Tour.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14 },
  statusSelect: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 13, fontFamily: 'inherit' },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
