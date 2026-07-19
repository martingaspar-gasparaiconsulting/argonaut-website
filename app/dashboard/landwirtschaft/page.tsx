'use client';

// ============================================================
// ARGONAUT OS · Bündel 31 · Landwirtschaft & Forst (Dashboard)
// Schläge/Flächen + Maßnahmen (Schlagkartei-Kern).
// Pfad: app/dashboard/landwirtschaft/page.tsx
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

type Schlag = { id: string; name: string; flaeche_ha: number | null; kultur: string | null; standort: string | null };
type Massnahme = { id: string; datum: string; art: string; mittel: string | null; menge: number | null; einheit: string | null; ertrag: number | null; notiz: string | null };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function d(iso: string) { const p = (iso || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
const ART_LABEL: Record<string, string> = { aussaat: '🌱 Aussaat', duengung: '💧 Düngung', pflanzenschutz: '🛡 Pflanzenschutz', ernte: '🌾 Ernte', sonstige: '· Sonstige' };

export default function LandwirtschaftPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [schlaege, setSchlaege] = useState<Schlag[]>([]);
  const [aktiv, setAktiv] = useState<Schlag | null>(null);
  const [massnahmen, setMassnahmen] = useState<Massnahme[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ns, setNs] = useState({ name: '', flaeche_ha: '', kultur: '', standort: '' });
  const [nm, setNm] = useState({ datum: heute(), art: 'aussaat', mittel: '', menge: '', einheit: 'kg/ha', ertrag: '', notiz: '' });

  const ladeSchlaege = useCallback(async () => {
    const { data } = await supabase.from('agrar_schlaege').select('id, name, flaeche_ha, kultur, standort').order('name', { ascending: true });
    setSchlaege((data as Schlag[]) ?? []);
  }, []);
  const ladeMassnahmen = useCallback(async (sid: string) => {
    const { data } = await supabase.from('agrar_massnahmen').select('id, datum, art, mittel, menge, einheit, ertrag, notiz').eq('schlag_id', sid).order('datum', { ascending: false });
    setMassnahmen((data as Massnahme[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeSchlaege(); setLaden(false);
    })();
  }, [ladeSchlaege]);

  async function schlagAnlegen() {
    if (!uid || !ns.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('agrar_schlaege').insert({
      owner_user_id: uid, name: ns.name.trim(), flaeche_ha: ns.flaeche_ha ? num(ns.flaeche_ha) : null, kultur: ns.kultur.trim() || null, standort: ns.standort.trim() || null,
    }).select('id, name, flaeche_ha, kultur, standort').single();
    if (error || !data) { setFehler('Schlag konnte nicht gespeichert werden.'); return; }
    setNs({ name: '', flaeche_ha: '', kultur: '', standort: '' }); setOk('Schlag gespeichert.'); await ladeSchlaege(); setAktiv(data as Schlag); setMassnahmen([]);
  }
  async function schlagOeffnen(s: Schlag) { setAktiv(s); await ladeMassnahmen(s.id); }
  async function massnahmeAnlegen() {
    if (!uid || !aktiv) return;
    setFehler(null);
    const { error } = await supabase.from('agrar_massnahmen').insert({
      owner_user_id: uid, schlag_id: aktiv.id, datum: nm.datum, art: nm.art, mittel: nm.mittel.trim() || null,
      menge: nm.menge ? num(nm.menge) : null, einheit: nm.einheit.trim() || null, ertrag: nm.ertrag ? num(nm.ertrag) : null, notiz: nm.notiz.trim() || null,
    });
    if (error) { setFehler('Maßnahme konnte nicht gespeichert werden.'); return; }
    setNm({ datum: heute(), art: 'aussaat', mittel: '', menge: '', einheit: 'kg/ha', ertrag: '', notiz: '' }); await ladeMassnahmen(aktiv.id);
  }

  const gesamtHa = schlaege.reduce((s, x) => s + (Number(x.flaeche_ha) || 0), 0);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🌾 Landwirtschaft & Forst</h1>
      <p style={styles.sub}>Schlagkartei: Flächen mit Kultur und dokumentierten Maßnahmen. Gesamt: {gesamtHa.toLocaleString('de-DE')} ha.</p>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Schlag anlegen</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1 }} value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder="Name (z. B. Acker Nord)" />
          <label style={styles.lab}>ha<input style={{ ...styles.inp, width: 80 }} value={ns.flaeche_ha} onChange={(e) => setNs({ ...ns, flaeche_ha: e.target.value })} inputMode="decimal" /></label>
          <input style={{ ...styles.inp, width: 140 }} value={ns.kultur} onChange={(e) => setNs({ ...ns, kultur: e.target.value })} placeholder="Kultur (z. B. Weizen)" />
          <input style={{ ...styles.inp, width: 140 }} value={ns.standort} onChange={(e) => setNs({ ...ns, standort: e.target.value })} placeholder="Standort" />
          <button style={styles.primaer} onClick={schlagAnlegen}>＋ Schlag</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.lvListe}>
            {schlaege.map((s) => (
              <button key={s.id} style={{ ...styles.lvItem, ...(aktiv?.id === s.id ? styles.lvAktiv : {}) }} onClick={() => schlagOeffnen(s)}>
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div style={{ color: C.textDim, fontSize: 13 }}>{s.flaeche_ha ? `${s.flaeche_ha} ha · ` : ''}{s.kultur || '—'}</div>
              </button>
            ))}
            {!schlaege.length && <p style={styles.dim}>Noch keine Schläge.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links einen Schlag wählen.</p> : (
              <div style={styles.card}>
                <div style={{ fontWeight: 800 }}>{aktiv.name} · Maßnahmen</div>
                <div style={styles.row}>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nm.datum} onChange={(e) => setNm({ ...nm, datum: e.target.value })} /></label>
                  <select style={styles.inp} value={nm.art} onChange={(e) => setNm({ ...nm, art: e.target.value })}>
                    {Object.keys(ART_LABEL).map((k) => <option key={k} value={k}>{ART_LABEL[k]}</option>)}
                  </select>
                  <input style={{ ...styles.inp, flex: 1 }} value={nm.mittel} onChange={(e) => setNm({ ...nm, mittel: e.target.value })} placeholder="Mittel / Sorte" />
                  <label style={styles.lab}>Menge<input style={{ ...styles.inp, width: 66 }} value={nm.menge} onChange={(e) => setNm({ ...nm, menge: e.target.value })} inputMode="decimal" /></label>
                  <input style={{ ...styles.inp, width: 64 }} value={nm.einheit} onChange={(e) => setNm({ ...nm, einheit: e.target.value })} />
                  <button style={styles.dazuBtn} onClick={massnahmeAnlegen}>＋</button>
                </div>
                {massnahmen.map((m) => (
                  <div key={m.id} style={styles.posZeile}>
                    <span style={{ minWidth: 84 }}>{d(m.datum)}</span>
                    <span style={{ minWidth: 130 }}>{ART_LABEL[m.art] || m.art}</span>
                    <span style={{ flex: 1, color: C.textDim }}>{m.mittel || '—'}{m.menge != null ? ` · ${m.menge} ${m.einheit || ''}` : ''}{m.ertrag != null ? ` · Ertrag ${m.ertrag}` : ''}</span>
                  </div>
                ))}
                {!massnahmen.length && <p style={styles.dim}>Noch keine Maßnahmen.</p>}
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
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14 },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
