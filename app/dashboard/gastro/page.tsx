'use client';

// ============================================================
// ARGONAUT OS · Bündel 21 · Gastro & Hotel (Dashboard)
// Reiter "Reservierungen" (Gastro-Tische) und "Hotel" (Zimmer & Belegung).
// Pfad: app/dashboard/gastro/page.tsx
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

type Res = { id: string; datum: string; uhrzeit: string | null; personen: number; gast_name: string | null; telefon: string | null; tisch: string | null; status: string };
type Zimmer = { id: string; nummer: string; typ: string | null; max_personen: number; preis_nacht: number; aktiv: boolean };
type Belegung = { id: string; zimmer_id: string | null; gast_name: string | null; personen: number; anreise: string; abreise: string; status: string };

function heute() { return new Date().toISOString().slice(0, 10); }
function d(iso: string) { const p = (iso || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

const RES_STATUS: Record<string, string> = { reserviert: C.cyan, eingetroffen: C.green, storniert: C.textDim, no_show: C.danger };
const BEL_STATUS: Record<string, string> = { gebucht: C.cyan, eingecheckt: C.green, ausgecheckt: C.textDim, storniert: C.danger };

export default function GastroPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'res' | 'hotel'>('res');
  const [datum, setDatum] = useState(heute());
  const [res, setRes] = useState<Res[]>([]);
  const [zimmer, setZimmer] = useState<Zimmer[]>([]);
  const [beleg, setBeleg] = useState<Belegung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [nr, setNr] = useState({ uhrzeit: '19:00', personen: '2', gast_name: '', telefon: '', tisch: '' });
  const [nz, setNz] = useState({ nummer: '', typ: 'Doppelzimmer', max_personen: '2', preis_nacht: '' });
  const [nb, setNb] = useState({ zimmer_id: '', gast_name: '', personen: '1', anreise: heute(), abreise: '' });

  const ladeRes = useCallback(async (tag: string) => {
    const { data } = await supabase.from('gastro_reservierungen').select('id, datum, uhrzeit, personen, gast_name, telefon, tisch, status').eq('datum', tag).order('uhrzeit', { ascending: true });
    setRes((data as Res[]) ?? []);
  }, []);
  const ladeHotel = useCallback(async () => {
    const { data: z } = await supabase.from('hotel_zimmer').select('id, nummer, typ, max_personen, preis_nacht, aktiv').order('nummer', { ascending: true });
    setZimmer((z as Zimmer[]) ?? []);
    const { data: b } = await supabase.from('hotel_belegungen').select('id, zimmer_id, gast_name, personen, anreise, abreise, status').neq('status', 'storniert').gte('abreise', heute()).order('anreise', { ascending: true });
    setBeleg((b as Belegung[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeRes(datum); await ladeHotel(); setLaden(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (uid) ladeRes(datum); }, [datum, uid, ladeRes]);

  async function resSpeichern() {
    if (!uid || !nr.gast_name.trim()) { setFehler('Bitte einen Gastnamen angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('gastro_reservierungen').insert({
      owner_user_id: uid, datum, uhrzeit: nr.uhrzeit || null, personen: parseInt(nr.personen, 10) || 2,
      gast_name: nr.gast_name.trim(), telefon: nr.telefon.trim() || null, tisch: nr.tisch.trim() || null,
    });
    if (error) { setFehler('Reservierung fehlgeschlagen.'); return; }
    setNr({ uhrzeit: '19:00', personen: '2', gast_name: '', telefon: '', tisch: '' }); setOk('Reservierung gespeichert.'); await ladeRes(datum);
  }
  async function resStatus(r: Res, status: string) {
    const { error } = await supabase.from('gastro_reservierungen').update({ status }).eq('id', r.id);
    if (!error) setRes((l) => l.map((x) => (x.id === r.id ? { ...x, status } : x)));
  }

  async function zimmerSpeichern() {
    if (!uid || !nz.nummer.trim()) { setFehler('Bitte eine Zimmernummer angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('hotel_zimmer').insert({
      owner_user_id: uid, nummer: nz.nummer.trim(), typ: nz.typ.trim() || null,
      max_personen: parseInt(nz.max_personen, 10) || 2, preis_nacht: parseFloat((nz.preis_nacht || '').replace(',', '.')) || 0,
    });
    if (error) { setFehler('Zimmer konnte nicht gespeichert werden.'); return; }
    setNz({ nummer: '', typ: 'Doppelzimmer', max_personen: '2', preis_nacht: '' }); await ladeHotel();
  }
  async function belegSpeichern() {
    if (!uid || !nb.zimmer_id || !nb.abreise) { setFehler('Bitte Zimmer und Abreise wählen.'); return; }
    if (nb.abreise <= nb.anreise) { setFehler('Abreise muss nach Anreise liegen.'); return; }
    // Überschneidung prüfen (gleiche Zimmer, Zeiträume überlappen)
    const konflikt = beleg.some((b) => b.zimmer_id === nb.zimmer_id && b.status !== 'storniert' && !(nb.abreise <= b.anreise || nb.anreise >= b.abreise));
    if (konflikt) { setFehler('Dieses Zimmer ist im gewählten Zeitraum bereits belegt.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('hotel_belegungen').insert({
      owner_user_id: uid, zimmer_id: nb.zimmer_id, gast_name: nb.gast_name.trim() || null,
      personen: parseInt(nb.personen, 10) || 1, anreise: nb.anreise, abreise: nb.abreise,
    });
    if (error) { setFehler('Belegung fehlgeschlagen.'); return; }
    setNb({ zimmer_id: '', gast_name: '', personen: '1', anreise: heute(), abreise: '' }); setOk('Belegung gespeichert.'); await ladeHotel();
  }
  async function belegStatus(b: Belegung, status: string) {
    const { error } = await supabase.from('hotel_belegungen').update({ status }).eq('id', b.id);
    if (!error) { if (status === 'storniert' || status === 'ausgecheckt') setBeleg((l) => l.filter((x) => x.id !== b.id)); else setBeleg((l) => l.map((x) => (x.id === b.id ? { ...x, status } : x))); }
  }

  const zimmerName = useMemo(() => Object.fromEntries(zimmer.map((z) => [z.id, `${z.nummer}${z.typ ? ` · ${z.typ}` : ''}`])), [zimmer]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🍽 Gastro & Hotel</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'res' ? styles.tabAn : {}) }} onClick={() => setTab('res')}>🍽 Reservierungen</button>
        <button style={{ ...styles.tab, ...(tab === 'hotel' ? styles.tabAn : {}) }} onClick={() => setTab('hotel')}>🛏 Hotel</button>
      </div>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'res' ? (
        <>
          <div style={styles.card}>
            <div style={styles.row}>
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
              <label style={styles.lab}>Zeit<input style={{ ...styles.inp, width: 90 }} value={nr.uhrzeit} onChange={(e) => setNr({ ...nr, uhrzeit: e.target.value })} placeholder="19:00" /></label>
              <label style={styles.lab}>Pers.<input style={{ ...styles.inp, width: 60 }} value={nr.personen} onChange={(e) => setNr({ ...nr, personen: e.target.value })} inputMode="numeric" /></label>
              <input style={{ ...styles.inp, flex: 1, minWidth: 140 }} value={nr.gast_name} onChange={(e) => setNr({ ...nr, gast_name: e.target.value })} placeholder="Gast" />
              <input style={{ ...styles.inp, width: 100 }} value={nr.tisch} onChange={(e) => setNr({ ...nr, tisch: e.target.value })} placeholder="Tisch" />
              <button style={styles.primaer} onClick={resSpeichern}>＋ Reservieren</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : res.length === 0 ? <p style={styles.dim}>Keine Reservierungen für {d(datum)}.</p> : (
            <div style={styles.liste}>
              {res.map((r) => (
                <div key={r.id} style={styles.item}>
                  <div style={{ minWidth: 54, fontWeight: 800, color: C.gold }}>{r.uhrzeit || '—'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{r.gast_name} <span style={{ color: C.textDim, fontWeight: 400 }}>· {r.personen} Pers.{r.tisch ? ` · Tisch ${r.tisch}` : ''}</span></div>
                    {r.telefon && <div style={{ color: C.textDim, fontSize: 13 }}>{r.telefon}</div>}
                  </div>
                  <select style={styles.statusSelect} value={r.status} onChange={(e) => resStatus(r, e.target.value)}>
                    <option value="reserviert">reserviert</option><option value="eingetroffen">eingetroffen</option><option value="no_show">No-Show</option><option value="storniert">storniert</option>
                  </select>
                  <span style={{ ...styles.punkt, background: RES_STATUS[r.status] || C.textDim }} />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Zimmer anlegen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, width: 90 }} value={nz.nummer} onChange={(e) => setNz({ ...nz, nummer: e.target.value })} placeholder="Nr." />
              <input style={{ ...styles.inp, flex: 1, minWidth: 120 }} value={nz.typ} onChange={(e) => setNz({ ...nz, typ: e.target.value })} placeholder="Typ" />
              <label style={styles.lab}>max.<input style={{ ...styles.inp, width: 56 }} value={nz.max_personen} onChange={(e) => setNz({ ...nz, max_personen: e.target.value })} inputMode="numeric" /></label>
              <label style={styles.lab}>€/Nacht<input style={{ ...styles.inp, width: 80 }} value={nz.preis_nacht} onChange={(e) => setNz({ ...nz, preis_nacht: e.target.value })} inputMode="decimal" /></label>
              <button style={styles.primaer} onClick={zimmerSpeichern}>＋ Zimmer</button>
            </div>
            <div style={styles.zimmerRow}>
              {zimmer.map((z) => <span key={z.id} style={styles.zimmerChip}>{z.nummer} · {z.typ} · {eur(z.preis_nacht)}</span>)}
              {!zimmer.length && <span style={styles.dim}>Noch keine Zimmer.</span>}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Belegung / Buchung</div>
            <div style={styles.row}>
              <select style={{ ...styles.inp, minWidth: 150 }} value={nb.zimmer_id} onChange={(e) => setNb({ ...nb, zimmer_id: e.target.value })}>
                <option value="">Zimmer wählen …</option>
                {zimmer.filter((z) => z.aktiv).map((z) => <option key={z.id} value={z.id}>{z.nummer} · {z.typ}</option>)}
              </select>
              <input style={{ ...styles.inp, flex: 1, minWidth: 120 }} value={nb.gast_name} onChange={(e) => setNb({ ...nb, gast_name: e.target.value })} placeholder="Gast" />
              <label style={styles.lab}>Anreise<input type="date" style={styles.inp} value={nb.anreise} onChange={(e) => setNb({ ...nb, anreise: e.target.value })} /></label>
              <label style={styles.lab}>Abreise<input type="date" style={styles.inp} value={nb.abreise} onChange={(e) => setNb({ ...nb, abreise: e.target.value })} /></label>
              <button style={styles.primaer} onClick={belegSpeichern}>＋ Buchen</button>
            </div>
          </div>

          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {beleg.map((b) => (
                <div key={b.id} style={styles.item}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{zimmerName[b.zimmer_id || ''] || 'Zimmer'} <span style={{ color: C.textDim, fontWeight: 400 }}>· {b.gast_name || 'Gast'}</span></div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{d(b.anreise)} → {d(b.abreise)} · {b.personen} Pers.</div>
                  </div>
                  <select style={styles.statusSelect} value={b.status} onChange={(e) => belegStatus(b, e.target.value)}>
                    <option value="gebucht">gebucht</option><option value="eingecheckt">eingecheckt</option><option value="ausgecheckt">ausgecheckt</option><option value="storniert">storniert</option>
                  </select>
                  <span style={{ ...styles.punkt, background: BEL_STATUS[b.status] || C.textDim }} />
                </div>
              ))}
              {!beleg.length && <p style={styles.dim}>Keine aktuellen Belegungen.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 980, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  zimmerRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  zimmerChip: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 12px', fontSize: 13 },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  statusSelect: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' },
  punkt: { width: 12, height: 12, borderRadius: 999 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
