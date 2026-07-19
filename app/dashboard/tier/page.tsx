'use client';

// ============================================================
// ARGONAUT OS · Bündel 32 · Tier-Fachpaket (Dashboard)
// Tierkartei + Behandlungen/Impfungen mit Fälligkeits-Ampel.
// Pfad: app/dashboard/tier/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Tier = { id: string; halter: string | null; name: string; art: string | null; rasse: string | null; chip_nr: string | null };
type Beh = { id: string; datum: string; art: string; bezeichnung: string; naechste_faellig: string | null; preis: number; notiz: string | null };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function faellig(f: string | null): { txt: string; farbe: string } | null {
  if (!f) return null;
  const tage = Math.ceil((new Date(f + 'T00:00:00').getTime() - new Date(heute() + 'T00:00:00').getTime()) / 86400000);
  if (tage < 0) return { txt: `fällig seit ${-tage} T`, farbe: C.danger };
  if (tage <= 30) return { txt: `fällig in ${tage} T`, farbe: C.warn };
  return { txt: `Wdh. ${d(f)}`, farbe: C.green };
}
const ART_LABEL: Record<string, string> = { behandlung: '🩺 Behandlung', impfung: '💉 Impfung', untersuchung: '🔬 Untersuchung' };

export default function TierPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tiere, setTiere] = useState<Tier[]>([]);
  const [aktiv, setAktiv] = useState<Tier | null>(null);
  const [beh, setBeh] = useState<Beh[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nt, setNt] = useState({ halter: '', name: '', art: 'Hund', rasse: '', chip_nr: '' });
  const [nb, setNb] = useState({ datum: heute(), art: 'impfung', bezeichnung: '', naechste_faellig: '', preis: '', notiz: '' });

  const ladeTiere = useCallback(async () => {
    const { data } = await supabase.from('tier_tiere').select('id, halter, name, art, rasse, chip_nr').order('name', { ascending: true });
    setTiere((data as Tier[]) ?? []);
  }, []);
  const ladeBeh = useCallback(async (tid: string) => {
    const { data } = await supabase.from('tier_behandlungen').select('id, datum, art, bezeichnung, naechste_faellig, preis, notiz').eq('tier_id', tid).order('datum', { ascending: false });
    setBeh((data as Beh[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeTiere(); setLaden(false);
    })();
  }, [ladeTiere]);

  async function tierAnlegen() {
    if (!uid || !nt.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('tier_tiere').insert({
      owner_user_id: uid, halter: nt.halter.trim() || null, name: nt.name.trim(), art: nt.art.trim() || null, rasse: nt.rasse.trim() || null, chip_nr: nt.chip_nr.trim() || null,
    }).select('id, halter, name, art, rasse, chip_nr').single();
    if (error || !data) { setFehler('Tier konnte nicht gespeichert werden.'); return; }
    setNt({ halter: '', name: '', art: 'Hund', rasse: '', chip_nr: '' }); setOk('Tier gespeichert.'); await ladeTiere(); setAktiv(data as Tier); setBeh([]);
  }
  async function tierOeffnen(t: Tier) { setAktiv(t); await ladeBeh(t.id); }
  async function behAnlegen() {
    if (!uid || !aktiv || !nb.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null);
    const { error } = await supabase.from('tier_behandlungen').insert({
      owner_user_id: uid, tier_id: aktiv.id, datum: nb.datum, art: nb.art, bezeichnung: nb.bezeichnung.trim(),
      naechste_faellig: nb.naechste_faellig || null, preis: num(nb.preis), notiz: nb.notiz.trim() || null,
    });
    if (error) { setFehler('Eintrag konnte nicht gespeichert werden.'); return; }
    setNb({ datum: heute(), art: 'impfung', bezeichnung: '', naechste_faellig: '', preis: '', notiz: '' }); await ladeBeh(aktiv.id);
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🐾 Tier-Fachpaket</h1>
      <p style={styles.sub}>Tierkartei mit Halter, Behandlungen und Impfungen inkl. Wiederholungs-Fälligkeit.</p>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Tier anlegen</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1 }} value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} placeholder="Name des Tiers" />
          <select style={styles.inp} value={nt.art} onChange={(e) => setNt({ ...nt, art: e.target.value })}><option>Hund</option><option>Katze</option><option>Pferd</option><option>Rind</option><option>Kleintier</option><option>Sonstige</option></select>
          <input style={{ ...styles.inp, width: 130 }} value={nt.rasse} onChange={(e) => setNt({ ...nt, rasse: e.target.value })} placeholder="Rasse" />
          <input style={{ ...styles.inp, flex: 1 }} value={nt.halter} onChange={(e) => setNt({ ...nt, halter: e.target.value })} placeholder="Halter" />
          <input style={{ ...styles.inp, width: 130 }} value={nt.chip_nr} onChange={(e) => setNt({ ...nt, chip_nr: e.target.value })} placeholder="Chip-Nr." />
          <button style={styles.primaer} onClick={tierAnlegen}>＋ Tier</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.lvListe}>
            {tiere.map((t) => (
              <button key={t.id} style={{ ...styles.lvItem, ...(aktiv?.id === t.id ? styles.lvAktiv : {}) }} onClick={() => tierOeffnen(t)}>
                <div style={{ fontWeight: 700 }}>{t.name} <span style={{ color: C.textDim, fontWeight: 400 }}>· {t.art || '—'}</span></div>
                <div style={{ color: C.textDim, fontSize: 13 }}>{t.halter || '—'}{t.rasse ? ` · ${t.rasse}` : ''}</div>
              </button>
            ))}
            {!tiere.length && <p style={styles.dim}>Noch keine Tiere.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links ein Tier wählen.</p> : (
              <div style={styles.card}>
                <div style={{ fontWeight: 800 }}>{aktiv.name} · Historie{aktiv.chip_nr ? ` · Chip ${aktiv.chip_nr}` : ''}</div>
                <div style={styles.row}>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nb.datum} onChange={(e) => setNb({ ...nb, datum: e.target.value })} /></label>
                  <select style={styles.inp} value={nb.art} onChange={(e) => setNb({ ...nb, art: e.target.value })}>
                    {Object.keys(ART_LABEL).map((k) => <option key={k} value={k}>{ART_LABEL[k]}</option>)}
                  </select>
                  <input style={{ ...styles.inp, flex: 1 }} value={nb.bezeichnung} onChange={(e) => setNb({ ...nb, bezeichnung: e.target.value })} placeholder="Bezeichnung" />
                  <label style={styles.lab}>Wdh. fällig<input type="date" style={styles.inp} value={nb.naechste_faellig} onChange={(e) => setNb({ ...nb, naechste_faellig: e.target.value })} /></label>
                  <label style={styles.lab}>€<input style={{ ...styles.inp, width: 66 }} value={nb.preis} onChange={(e) => setNb({ ...nb, preis: e.target.value })} inputMode="decimal" /></label>
                  <button style={styles.dazuBtn} onClick={behAnlegen}>＋</button>
                </div>
                {beh.map((b) => {
                  const amp = faellig(b.naechste_faellig);
                  return (
                    <div key={b.id} style={styles.posZeile}>
                      <span style={{ minWidth: 84 }}>{d(b.datum)}</span>
                      <span style={{ minWidth: 120 }}>{ART_LABEL[b.art] || b.art}</span>
                      <span style={{ flex: 1 }}>{b.bezeichnung}{b.preis ? ` · ${eur(b.preis)}` : ''}</span>
                      {amp && <span style={{ ...styles.badge, color: amp.farbe, borderColor: amp.farbe }}>⏰ {amp.txt}</span>}
                    </div>
                  );
                })}
                {!beh.length && <p style={styles.dim}>Noch keine Einträge.</p>}
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
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14, flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
