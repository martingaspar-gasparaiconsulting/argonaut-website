'use client';

// ============================================================
// ARGONAUT OS · Bündel 23 · Energie-Fachpaket (Dashboard)
// Anlagen (PV/Wärmepumpe/BHKW) mit Wartungs-Ampel + Ablesungen (Zähler/Ertrag).
// Pfad: app/dashboard/energie/page.tsx
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

type Anlage = { id: string; bezeichnung: string; typ: string | null; standort: string | null; leistung_kw: number | null; inbetriebnahme: string | null; wartung_faellig: string | null };
type Ablesung = { id: string; datum: string; zaehlerstand: number | null; ertrag_kwh: number | null };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function ampel(f: string | null): { txt: string; farbe: string } {
  if (!f) return { txt: 'keine Wartung geplant', farbe: C.textDim };
  const tage = Math.ceil((new Date(f + 'T00:00:00').getTime() - new Date(heute() + 'T00:00:00').getTime()) / 86400000);
  if (tage < 0) return { txt: `Wartung ${-tage} T überfällig`, farbe: C.danger };
  if (tage <= 30) return { txt: `Wartung in ${tage} T`, farbe: C.warn };
  return { txt: `Wartung ${d(f)}`, farbe: C.green };
}

const LEER_A = { bezeichnung: '', typ: 'PV', standort: '', leistung_kw: '', inbetriebnahme: '', wartung_faellig: '' };

export default function EnergiePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [anlagen, setAnlagen] = useState<Anlage[]>([]);
  const [aktiv, setAktiv] = useState<Anlage | null>(null);
  const [ablesungen, setAblesungen] = useState<Ablesung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [na, setNa] = useState({ ...LEER_A });
  const [nb, setNb] = useState({ datum: heute(), zaehlerstand: '', ertrag_kwh: '' });

  const ladeAnlagen = useCallback(async () => {
    const { data } = await supabase.from('energie_anlagen').select('id, bezeichnung, typ, standort, leistung_kw, inbetriebnahme, wartung_faellig').order('wartung_faellig', { ascending: true, nullsFirst: false });
    setAnlagen((data as Anlage[]) ?? []);
  }, []);
  const ladeAblesungen = useCallback(async (anlageId: string) => {
    const { data } = await supabase.from('energie_ablesungen').select('id, datum, zaehlerstand, ertrag_kwh').eq('anlage_id', anlageId).order('datum', { ascending: false });
    setAblesungen((data as Ablesung[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeAnlagen(); setLaden(false);
    })();
  }, [ladeAnlagen]);

  async function anlageAnlegen() {
    if (!uid || !na.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('energie_anlagen').insert({
      owner_user_id: uid, bezeichnung: na.bezeichnung.trim(), typ: na.typ.trim() || null, standort: na.standort.trim() || null,
      leistung_kw: na.leistung_kw ? num(na.leistung_kw) : null, inbetriebnahme: na.inbetriebnahme || null, wartung_faellig: na.wartung_faellig || null,
    }).select('id, bezeichnung, typ, standort, leistung_kw, inbetriebnahme, wartung_faellig').single();
    if (error || !data) { setFehler('Anlage konnte nicht angelegt werden.'); return; }
    setNa({ ...LEER_A }); setOk('Anlage gespeichert.'); await ladeAnlagen();
    setAktiv(data as Anlage); await ladeAblesungen((data as Anlage).id);
  }
  async function anlageOeffnen(a: Anlage) { setAktiv(a); await ladeAblesungen(a.id); }
  async function ablesungAnlegen() {
    if (!uid || !aktiv) return;
    setFehler(null);
    const { error } = await supabase.from('energie_ablesungen').insert({
      owner_user_id: uid, anlage_id: aktiv.id, datum: nb.datum, zaehlerstand: nb.zaehlerstand ? num(nb.zaehlerstand) : null, ertrag_kwh: nb.ertrag_kwh ? num(nb.ertrag_kwh) : null,
    });
    if (error) { setFehler('Ablesung konnte nicht gespeichert werden.'); return; }
    setNb({ datum: heute(), zaehlerstand: '', ertrag_kwh: '' }); await ladeAblesungen(aktiv.id);
  }

  const summeErtrag = ablesungen.reduce((s, a) => s + (Number(a.ertrag_kwh) || 0), 0);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>⚡ Energie-Fachpaket</h1>
      <p style={styles.sub}>Energie-Anlagen mit Wartungs-Ampel und Zählerständen/Erträgen — für PV, Wärmepumpe, BHKW & Co.</p>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Anlage anlegen</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1 }} value={na.bezeichnung} onChange={(e) => setNa({ ...na, bezeichnung: e.target.value })} placeholder="Bezeichnung (z. B. PV Dach Halle)" />
          <select style={styles.inp} value={na.typ} onChange={(e) => setNa({ ...na, typ: e.target.value })}>
            <option>PV</option><option>Waermepumpe</option><option>BHKW</option><option>Speicher</option><option>Sonstige</option>
          </select>
          <input style={{ ...styles.inp, width: 130 }} value={na.standort} onChange={(e) => setNa({ ...na, standort: e.target.value })} placeholder="Standort" />
          <label style={styles.lab}>kW<input style={{ ...styles.inp, width: 70 }} value={na.leistung_kw} onChange={(e) => setNa({ ...na, leistung_kw: e.target.value })} inputMode="decimal" /></label>
          <label style={styles.lab}>Inbetriebn.<input type="date" style={styles.inp} value={na.inbetriebnahme} onChange={(e) => setNa({ ...na, inbetriebnahme: e.target.value })} /></label>
          <label style={styles.lab}>Wartung fällig<input type="date" style={styles.inp} value={na.wartung_faellig} onChange={(e) => setNa({ ...na, wartung_faellig: e.target.value })} /></label>
          <button style={styles.primaer} onClick={anlageAnlegen}>＋ Anlage</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.lvListe}>
            {anlagen.map((a) => {
              const amp = ampel(a.wartung_faellig);
              return (
                <button key={a.id} style={{ ...styles.lvItem, ...(aktiv?.id === a.id ? styles.lvAktiv : {}) }} onClick={() => anlageOeffnen(a)}>
                  <div style={{ fontWeight: 700 }}>{a.bezeichnung}</div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{a.typ || '—'}{a.leistung_kw ? ` · ${a.leistung_kw} kW` : ''}</div>
                  <div style={{ color: amp.farbe, fontSize: 12, marginTop: 3 }}>● {amp.txt}</div>
                </button>
              );
            })}
            {!anlagen.length && <p style={styles.dim}>Noch keine Anlagen.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links eine Anlage wählen.</p> : (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{aktiv.bezeichnung} · Ablesungen</div>
                  <div style={{ color: C.gold, fontWeight: 800 }}>Σ {summeErtrag.toLocaleString('de-DE')} kWh</div>
                </div>
                <div style={styles.row}>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nb.datum} onChange={(e) => setNb({ ...nb, datum: e.target.value })} /></label>
                  <label style={styles.lab}>Zählerstand<input style={{ ...styles.inp, width: 120 }} value={nb.zaehlerstand} onChange={(e) => setNb({ ...nb, zaehlerstand: e.target.value })} inputMode="decimal" /></label>
                  <label style={styles.lab}>Ertrag kWh<input style={{ ...styles.inp, width: 110 }} value={nb.ertrag_kwh} onChange={(e) => setNb({ ...nb, ertrag_kwh: e.target.value })} inputMode="decimal" /></label>
                  <button style={styles.dazuBtn} onClick={ablesungAnlegen}>＋ Ablesung</button>
                </div>
                {ablesungen.map((ab) => (
                  <div key={ab.id} style={styles.posZeile}>
                    <span style={{ minWidth: 90 }}>{d(ab.datum)}</span>
                    <span style={{ flex: 1, color: C.textDim }}>Stand {ab.zaehlerstand != null ? ab.zaehlerstand.toLocaleString('de-DE') : '—'}</span>
                    <span style={{ fontWeight: 700 }}>{ab.ertrag_kwh != null ? `${ab.ertrag_kwh.toLocaleString('de-DE')} kWh` : '—'}</span>
                  </div>
                ))}
                {!ablesungen.length && <p style={styles.dim}>Noch keine Ablesungen.</p>}
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
