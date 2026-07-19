'use client';

// ============================================================
// ARGONAUT OS · Bündel 26 · Agentur & Kreativ (Dashboard)
// Retainer je Kunde (Monats-Stundenbudget) + gebuchte Zeiten mit Auslastung.
// Pfad: app/dashboard/agentur/page.tsx
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

type Retainer = { id: string; kunde_name: string | null; bezeichnung: string; monatsstunden: number; stundensatz: number; status: string };
type Zeit = { id: string; retainer_id: string; datum: string; stunden: number; beschreibung: string | null };

function heute() { return new Date().toISOString().slice(0, 10); }
function monatStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export default function AgenturPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [retainer, setRetainer] = useState<Retainer[]>([]);
  const [zeiten, setZeiten] = useState<Zeit[]>([]);
  const [aktiv, setAktiv] = useState<Retainer | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nr, setNr] = useState({ kunde_name: '', bezeichnung: 'Retainer', monatsstunden: '', stundensatz: '' });
  const [nz, setNz] = useState({ datum: heute(), stunden: '', beschreibung: '' });

  const laden_ = useCallback(async () => {
    const { data: r } = await supabase.from('agentur_retainer').select('id, kunde_name, bezeichnung, monatsstunden, stundensatz, status').order('erstellt_am', { ascending: false });
    setRetainer((r as Retainer[]) ?? []);
    const { data: z } = await supabase.from('agentur_zeiten').select('id, retainer_id, datum, stunden, beschreibung').gte('datum', monatStart()).order('datum', { ascending: false });
    setZeiten((z as Zeit[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  const verbraucht = useCallback((rid: string) => zeiten.filter((z) => z.retainer_id === rid).reduce((s, z) => s + (Number(z.stunden) || 0), 0), [zeiten]);

  async function retainerAnlegen() {
    if (!uid || !nr.kunde_name.trim()) { setFehler('Bitte einen Kunden angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('agentur_retainer').insert({
      owner_user_id: uid, kunde_name: nr.kunde_name.trim(), bezeichnung: nr.bezeichnung.trim() || 'Retainer',
      monatsstunden: num(nr.monatsstunden), stundensatz: num(nr.stundensatz),
    });
    if (error) { setFehler('Retainer konnte nicht gespeichert werden.'); return; }
    setNr({ kunde_name: '', bezeichnung: 'Retainer', monatsstunden: '', stundensatz: '' }); setOk('Retainer gespeichert.'); await laden_();
  }
  async function zeitBuchen() {
    if (!uid || !aktiv || num(nz.stunden) <= 0) { setFehler('Bitte Stunden angeben.'); return; }
    setFehler(null);
    const { error } = await supabase.from('agentur_zeiten').insert({ owner_user_id: uid, retainer_id: aktiv.id, datum: nz.datum, stunden: num(nz.stunden), beschreibung: nz.beschreibung.trim() || null });
    if (error) { setFehler('Zeit konnte nicht gebucht werden.'); return; }
    setNz({ datum: heute(), stunden: '', beschreibung: '' }); await laden_();
  }

  const aktivZeiten = useMemo(() => (aktiv ? zeiten.filter((z) => z.retainer_id === aktiv.id) : []), [aktiv, zeiten]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🎨 Agentur & Kreativ</h1>
      <p style={styles.sub}>Retainer je Kunde mit monatlichem Stundenbudget und Auslastung ({new Date().toLocaleDateString('de-DE', { month: 'long' })}).</p>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Retainer anlegen</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1 }} value={nr.kunde_name} onChange={(e) => setNr({ ...nr, kunde_name: e.target.value })} placeholder="Kunde" />
          <input style={{ ...styles.inp, flex: 1 }} value={nr.bezeichnung} onChange={(e) => setNr({ ...nr, bezeichnung: e.target.value })} placeholder="Bezeichnung" />
          <label style={styles.lab}>Std/Monat<input style={{ ...styles.inp, width: 80 }} value={nr.monatsstunden} onChange={(e) => setNr({ ...nr, monatsstunden: e.target.value })} inputMode="decimal" /></label>
          <label style={styles.lab}>€/Std<input style={{ ...styles.inp, width: 70 }} value={nr.stundensatz} onChange={(e) => setNr({ ...nr, stundensatz: e.target.value })} inputMode="decimal" /></label>
          <button style={styles.primaer} onClick={retainerAnlegen}>＋ Retainer</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.lvListe}>
            {retainer.map((r) => {
              const v = verbraucht(r.id); const pct = r.monatsstunden > 0 ? Math.min(100, Math.round((v / r.monatsstunden) * 100)) : 0;
              const farbe = pct >= 100 ? C.danger : pct >= 80 ? C.warn : C.green;
              return (
                <button key={r.id} style={{ ...styles.lvItem, ...(aktiv?.id === r.id ? styles.lvAktiv : {}) }} onClick={() => setAktiv(r)}>
                  <div style={{ fontWeight: 700 }}>{r.kunde_name}</div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{v.toLocaleString('de-DE')} / {r.monatsstunden.toLocaleString('de-DE')} Std</div>
                  <div style={styles.balken}><div style={{ ...styles.balkenFill, width: `${pct}%`, background: farbe }} /></div>
                </button>
              );
            })}
            {!retainer.length && <p style={styles.dim}>Noch keine Retainer.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links einen Retainer wählen, um Zeit zu buchen.</p> : (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{aktiv.kunde_name} · Zeiten</div>
                  <div style={{ color: C.gold, fontWeight: 800 }}>{verbraucht(aktiv.id).toLocaleString('de-DE')} / {aktiv.monatsstunden} Std · Wert {eur(verbraucht(aktiv.id) * aktiv.stundensatz)}</div>
                </div>
                <div style={styles.row}>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nz.datum} onChange={(e) => setNz({ ...nz, datum: e.target.value })} /></label>
                  <label style={styles.lab}>Std<input style={{ ...styles.inp, width: 70 }} value={nz.stunden} onChange={(e) => setNz({ ...nz, stunden: e.target.value })} inputMode="decimal" /></label>
                  <input style={{ ...styles.inp, flex: 1 }} value={nz.beschreibung} onChange={(e) => setNz({ ...nz, beschreibung: e.target.value })} placeholder="Tätigkeit" />
                  <button style={styles.dazuBtn} onClick={zeitBuchen}>＋ Buchen</button>
                </div>
                {aktivZeiten.map((z) => (
                  <div key={z.id} style={styles.posZeile}>
                    <span style={{ minWidth: 84 }}>{z.datum.split('-').reverse().join('.')}</span>
                    <span style={{ flex: 1, color: C.textDim }}>{z.beschreibung || '—'}</span>
                    <span style={{ fontWeight: 700 }}>{z.stunden.toLocaleString('de-DE')} h</span>
                  </div>
                ))}
                {!aktivZeiten.length && <p style={styles.dim}>Diesen Monat noch keine Zeiten.</p>}
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
  balken: { height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 999, marginTop: 6, overflow: 'hidden' },
  balkenFill: { height: '100%', borderRadius: 999 },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14 },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
