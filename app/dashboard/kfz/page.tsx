'use client';

// ============================================================
// ARGONAUT OS · Bündel 18 · KFZ-Fachpaket (Dashboard)
// Fahrzeuge mit HU/AU-Fristen (Ampel) + Reifenhotel (Einlagerung).
// Pfad: app/dashboard/kfz/page.tsx
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

type Fahrzeug = {
  id: string; halter: string | null; kennzeichen: string | null; marke: string | null; modell: string | null;
  vin: string | null; erstzulassung: string | null; hu_faellig: string | null; au_faellig: string | null; km_stand: number | null; notiz: string | null;
};
type Reifen = {
  id: string; kunde_name: string | null; kennzeichen: string | null; saison: string; groesse: string | null;
  anzahl: number; lagerplatz: string | null; eingelagert_am: string; ausgelagert_am: string | null;
};

function heute() { return new Date().toISOString().slice(0, 10); }
function dHu(iso: string | null): string { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function ampel(faellig: string | null): { txt: string; farbe: string } {
  if (!faellig) return { txt: 'keine Frist', farbe: C.textDim };
  const tage = Math.ceil((new Date(faellig + 'T00:00:00').getTime() - new Date(heute() + 'T00:00:00').getTime()) / 86400000);
  if (tage < 0) return { txt: `${-tage} T überfällig`, farbe: C.danger };
  if (tage <= 60) return { txt: `in ${tage} T fällig`, farbe: C.warn };
  return { txt: `fällig ${dHu(faellig)}`, farbe: C.green };
}

const LEER_FZ = { halter: '', kennzeichen: '', marke: '', modell: '', vin: '', erstzulassung: '', hu_faellig: '', au_faellig: '', km_stand: '' };
const LEER_R = { kunde_name: '', kennzeichen: '', saison: 'winter', groesse: '', anzahl: '4', lagerplatz: '' };

export default function KfzPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'fahrzeuge' | 'reifen'>('fahrzeuge');
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [reifen, setReifen] = useState<Reifen[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fz, setFz] = useState({ ...LEER_FZ });
  const [r, setR] = useState({ ...LEER_R });

  const laden_ = useCallback(async () => {
    const { data: f } = await supabase.from('kfz_fahrzeuge').select('id, halter, kennzeichen, marke, modell, vin, erstzulassung, hu_faellig, au_faellig, km_stand, notiz').order('hu_faellig', { ascending: true, nullsFirst: false });
    setFahrzeuge((f as Fahrzeug[]) ?? []);
    const { data: re } = await supabase.from('kfz_reifeneinlagerung').select('id, kunde_name, kennzeichen, saison, groesse, anzahl, lagerplatz, eingelagert_am, ausgelagert_am').order('eingelagert_am', { ascending: false });
    setReifen((re as Reifen[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  async function fzSpeichern() {
    if (!uid) return;
    if (!fz.kennzeichen.trim() && !fz.halter.trim()) { setFehler('Bitte mindestens Kennzeichen oder Halter angeben.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kfz_fahrzeuge').insert({
        owner_user_id: uid, halter: fz.halter.trim() || null, kennzeichen: fz.kennzeichen.trim() || null,
        marke: fz.marke.trim() || null, modell: fz.modell.trim() || null, vin: fz.vin.trim() || null,
        erstzulassung: fz.erstzulassung || null, hu_faellig: fz.hu_faellig || null, au_faellig: fz.au_faellig || null,
        km_stand: fz.km_stand ? parseInt(fz.km_stand, 10) : null,
      });
      if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setFz({ ...LEER_FZ }); setOk('Fahrzeug gespeichert.'); await laden_();
    } finally { setBusy(false); }
  }
  async function fzLoeschen(id: string) {
    const { error } = await supabase.from('kfz_fahrzeuge').delete().eq('id', id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    setFahrzeuge((l) => l.filter((x) => x.id !== id));
  }

  async function rSpeichern() {
    if (!uid) return;
    if (!r.kennzeichen.trim() && !r.kunde_name.trim()) { setFehler('Bitte Kunde oder Kennzeichen angeben.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kfz_reifeneinlagerung').insert({
        owner_user_id: uid, kunde_name: r.kunde_name.trim() || null, kennzeichen: r.kennzeichen.trim() || null,
        saison: r.saison, groesse: r.groesse.trim() || null, anzahl: parseInt(r.anzahl, 10) || 4, lagerplatz: r.lagerplatz.trim() || null,
      });
      if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setR({ ...LEER_R }); setOk('Reifen eingelagert.'); await laden_();
    } finally { setBusy(false); }
  }
  async function auslagern(id: string) {
    const { error } = await supabase.from('kfz_reifeneinlagerung').update({ ausgelagert_am: heute() }).eq('id', id);
    if (error) { setFehler('Auslagern fehlgeschlagen.'); return; }
    setReifen((l) => l.map((x) => (x.id === id ? { ...x, ausgelagert_am: heute() } : x)));
  }

  const eingelagert = useMemo(() => reifen.filter((x) => !x.ausgelagert_am), [reifen]);
  const faellig = useMemo(() => fahrzeuge.filter((f) => { const a = ampel(f.hu_faellig); return a.farbe === C.danger || a.farbe === C.warn; }).length, [fahrzeuge]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🚗 KFZ-Fachpaket</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'fahrzeuge' ? styles.tabAn : {}) }} onClick={() => setTab('fahrzeuge')}>
          🚙 Fahrzeuge {faellig > 0 && <span style={styles.pill}>{faellig}</span>}
        </button>
        <button style={{ ...styles.tab, ...(tab === 'reifen' ? styles.tabAn : {}) }} onClick={() => setTab('reifen')}>
          🛞 Reifenhotel <span style={styles.pillDim}>{eingelagert.length}</span>
        </button>
      </div>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'fahrzeuge' ? (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Fahrzeug anlegen</div>
            <div style={styles.grid}>
              <input style={styles.inp} value={fz.kennzeichen} onChange={(e) => setFz({ ...fz, kennzeichen: e.target.value })} placeholder="Kennzeichen" />
              <input style={styles.inp} value={fz.halter} onChange={(e) => setFz({ ...fz, halter: e.target.value })} placeholder="Halter" />
              <input style={styles.inp} value={fz.marke} onChange={(e) => setFz({ ...fz, marke: e.target.value })} placeholder="Marke" />
              <input style={styles.inp} value={fz.modell} onChange={(e) => setFz({ ...fz, modell: e.target.value })} placeholder="Modell" />
              <input style={styles.inp} value={fz.vin} onChange={(e) => setFz({ ...fz, vin: e.target.value })} placeholder="FIN / VIN" />
              <input style={styles.inp} value={fz.km_stand} onChange={(e) => setFz({ ...fz, km_stand: e.target.value })} placeholder="km-Stand" inputMode="numeric" />
              <label style={styles.lab}>Erstzulassung<input type="date" style={styles.inp} value={fz.erstzulassung} onChange={(e) => setFz({ ...fz, erstzulassung: e.target.value })} /></label>
              <label style={styles.lab}>HU fällig<input type="date" style={styles.inp} value={fz.hu_faellig} onChange={(e) => setFz({ ...fz, hu_faellig: e.target.value })} /></label>
              <label style={styles.lab}>AU fällig<input type="date" style={styles.inp} value={fz.au_faellig} onChange={(e) => setFz({ ...fz, au_faellig: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={fzSpeichern}>💾 Fahrzeug speichern</button>
          </div>

          {laden ? <p style={styles.dim}>Lädt …</p> : fahrzeuge.length === 0 ? <p style={styles.dim}>Noch keine Fahrzeuge.</p> : (
            <div style={styles.liste}>
              {fahrzeuge.map((f) => {
                const a = ampel(f.hu_faellig);
                return (
                  <div key={f.id} style={styles.item}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{f.kennzeichen || '—'} <span style={{ color: C.textDim, fontWeight: 400 }}>· {[f.marke, f.modell].filter(Boolean).join(' ') || '—'}{f.halter ? ` · ${f.halter}` : ''}</span></div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>HU {dHu(f.hu_faellig)} · AU {dHu(f.au_faellig)}{f.km_stand ? ` · ${f.km_stand.toLocaleString('de-DE')} km` : ''}</div>
                    </div>
                    <span style={{ ...styles.badge, color: a.farbe, borderColor: a.farbe }}>🔧 HU {a.txt}</span>
                    <button style={styles.wegBtn} onClick={() => fzLoeschen(f.id)}>🗑</button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Reifen einlagern</div>
            <div style={styles.grid}>
              <input style={styles.inp} value={r.kunde_name} onChange={(e) => setR({ ...r, kunde_name: e.target.value })} placeholder="Kunde" />
              <input style={styles.inp} value={r.kennzeichen} onChange={(e) => setR({ ...r, kennzeichen: e.target.value })} placeholder="Kennzeichen" />
              <label style={styles.lab}>Saison
                <select style={styles.inp} value={r.saison} onChange={(e) => setR({ ...r, saison: e.target.value })}>
                  <option value="winter">Winter</option><option value="sommer">Sommer</option>
                </select>
              </label>
              <input style={styles.inp} value={r.groesse} onChange={(e) => setR({ ...r, groesse: e.target.value })} placeholder="Größe z. B. 205/55 R16" />
              <input style={styles.inp} value={r.anzahl} onChange={(e) => setR({ ...r, anzahl: e.target.value })} placeholder="Anzahl" inputMode="numeric" />
              <input style={styles.inp} value={r.lagerplatz} onChange={(e) => setR({ ...r, lagerplatz: e.target.value })} placeholder="Lagerplatz z. B. Regal C-12" />
            </div>
            <button style={{ ...styles.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={rSpeichern}>🛞 Einlagern</button>
          </div>

          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {eingelagert.length === 0 ? <p style={styles.dim}>Aktuell keine eingelagerten Reifen.</p> : eingelagert.map((x) => (
                <div key={x.id} style={styles.item}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{x.kennzeichen || x.kunde_name || '—'} <span style={{ color: C.textDim, fontWeight: 400 }}>· {x.groesse || '—'} · {x.anzahl} Stk</span></div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{x.saison === 'winter' ? '❄️ Winter' : '☀️ Sommer'} · Platz {x.lagerplatz || '—'} · seit {dHu(x.eingelagert_am)}</div>
                  </div>
                  <button style={styles.auslagernBtn} onClick={() => auslagern(x.id)}>⇧ Auslagern</button>
                </div>
              ))}
              {reifen.some((x) => x.ausgelagert_am) && (
                <div style={{ color: C.textDim, fontSize: 13, marginTop: 8 }}>
                  {reifen.filter((x) => x.ausgelagert_am).length} bereits ausgelagert (Historie).
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  pill: { background: C.danger, color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 800 },
  pillDim: { background: C.border, color: C.text, borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 700 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit' },
  primaer: { alignSelf: 'flex-start', background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  wegBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 10px', fontSize: 14, cursor: 'pointer' },
  auslagernBtn: { background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 9, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
