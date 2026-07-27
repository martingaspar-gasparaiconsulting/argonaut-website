'use client';

// ============================================================
// ARGONAUT OS · A3 · Prüfprotokolle (norm-basiert)
// Prüfung aus Norm-Katalog anlegen (DGUV/DIN/VDE), Prüfpunkte abhaken,
// Gesamtergebnis + nächste Fälligkeit automatisch, optional an ein Objekt
// aus dem Asset-Register gekoppelt. Formeln aus lib/pruefungen (0 €, getestet).
// Pfad: app/dashboard/pruefprotokolle/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, Fragment, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  PRUEF_NORMEN, pruefNorm, naechsteFaelligkeit, gesamtErgebnis, faelligBucket, zaehlePruef,
} from '@/lib/pruefungen';
import { augePruef } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Asset = { id: string; bezeichnung: string };
type Protokoll = { id: string; asset_id: string | null; objekt_bezeichnung: string | null; pruef_key: string | null; pruef_art: string; norm: string | null; datum: string; pruefer: string | null; intervall_monate: number | null; naechste_pruefung: string | null; ergebnis: string; bemerkung: string | null };
type Punkt = { id: string; protokoll_id: string; position: number | null; punkt: string; status: string; hinweis: string | null };
type Draft = { punkt: string; status: string; hinweis: string };

const P_STATUS: Record<string, { label: string; farbe: string }> = {
  ok: { label: '✓ ok', farbe: C.green },
  mangel: { label: '⚠ Mangel', farbe: C.danger },
  na: { label: '– n.z.', farbe: C.textDim },
};
const ERG_META: Record<string, { label: string; farbe: string }> = {
  bestanden: { label: '✓ bestanden', farbe: C.green },
  maengel: { label: '⚠ Mängel', farbe: C.warn },
  durchgefallen: { label: '✕ durchgefallen', farbe: C.danger },
};
const AMPEL: Record<string, string> = { ueberfaellig: C.danger, bald: C.warn, ok: C.green };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

export default function PruefprotokollePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [protokolle, setProtokolle] = useState<Protokoll[]>([]);
  const [punkte, setPunkte] = useState<Punkt[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const H = heuteLokal();

  const [nk, setNk] = useState({ pruef_key: '', asset_id: '', objekt_bezeichnung: '', datum: H, pruefer: '', bemerkung: '', pruef_art_custom: '', norm_custom: '', intervall_custom: '12', durchgefallen: false });
  const [draft, setDraft] = useState<Draft[]>([]);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [p, pk, a] = await Promise.all([
        supabase.from('pruef_protokoll').select('*').order('datum', { ascending: false }),
        supabase.from('pruef_punkt').select('*').order('position', { ascending: true }),
        supabase.from('assets').select('id, bezeichnung').order('bezeichnung', { ascending: true }),
      ]);
      setProtokolle((p.data as Protokoll[]) ?? []);
      setPunkte((pk.data as Punkt[]) ?? []);
      setAssets((a.data as Asset[]) ?? []);
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const kennzahlen = useMemo(() => zaehlePruef(protokolle, H), [protokolle, H]);
  const aktNorm = useMemo(() => (nk.pruef_key && nk.pruef_key !== 'sonstige' ? pruefNorm(nk.pruef_key) : undefined), [nk.pruef_key]);
  const intervall = useMemo(() => (aktNorm ? aktNorm.intervall_monate : Math.max(0, parseInt(nk.intervall_custom, 10) || 0)), [aktNorm, nk.intervall_custom]);
  const naechste = useMemo(() => (nk.datum && intervall > 0 ? naechsteFaelligkeit(nk.datum, intervall) : ''), [nk.datum, intervall]);
  const ergebnisLive = useMemo(() => (nk.durchgefallen ? 'durchgefallen' : gesamtErgebnis(draft)), [nk.durchgefallen, draft]);

  function normWahl(key: string) {
    const n = key && key !== 'sonstige' ? pruefNorm(key) : undefined;
    setNk((f) => ({ ...f, pruef_key: key }));
    setDraft(n ? n.pruefpunkte.map((p) => ({ punkt: p, status: 'ok', hinweis: '' })) : []);
  }

  function assetWahl(id: string) {
    const a = assets.find((x) => x.id === id);
    setNk((f) => ({ ...f, asset_id: id, objekt_bezeichnung: a ? a.bezeichnung : f.objekt_bezeichnung }));
  }

  function setDraftStatus(i: number, status: string) { setDraft((l) => l.map((p, j) => (j === i ? { ...p, status } : p))); }
  function setDraftHinweis(i: number, hinweis: string) { setDraft((l) => l.map((p, j) => (j === i ? { ...p, hinweis } : p))); }
  function punktHinzu() { setDraft((l) => [...l, { punkt: '', status: 'ok', hinweis: '' }]); }
  function punktWeg(i: number) { setDraft((l) => l.filter((_, j) => j !== i)); }
  function setDraftText(i: number, punkt: string) { setDraft((l) => l.map((p, j) => (j === i ? { ...p, punkt } : p))); }

  async function speichern() {
    if (!uid) return;
    const pruef_art = aktNorm ? aktNorm.bezeichnung : nk.pruef_art_custom.trim();
    const norm = aktNorm ? aktNorm.norm : nk.norm_custom.trim() || null;
    if (!pruef_art) { setFehler('Bitte eine Prüfart wählen oder eingeben.'); return; }
    if (!nk.datum) { setFehler('Bitte ein Prüfdatum angeben.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data: neu, error } = await supabase.from('pruef_protokoll').insert({
        owner_user_id: uid, asset_id: nk.asset_id || null, objekt_bezeichnung: nk.objekt_bezeichnung.trim() || null,
        pruef_key: nk.pruef_key || null, pruef_art, norm, datum: nk.datum, pruefer: nk.pruefer.trim() || null,
        intervall_monate: intervall || null, naechste_pruefung: naechste || null, ergebnis: ergebnisLive, bemerkung: nk.bemerkung.trim() || null,
      }).select('id').single();
      if (error || !neu) throw new Error(error?.message || 'Speichern fehlgeschlagen.');
      const reihen = draft.filter((p) => p.punkt.trim()).map((p, i) => ({
        owner_user_id: uid, protokoll_id: neu.id, position: i + 1, punkt: p.punkt.trim(), status: p.status, hinweis: p.hinweis.trim() || null,
      }));
      if (reihen.length) {
        const { error: pe } = await supabase.from('pruef_punkt').insert(reihen);
        if (pe) throw new Error(pe.message);
      }
      setNk({ pruef_key: '', asset_id: '', objekt_bezeichnung: '', datum: H, pruefer: '', bemerkung: '', pruef_art_custom: '', norm_custom: '', intervall_custom: '12', durchgefallen: false });
      setDraft([]); setOk('Prüfprotokoll gespeichert.'); await laden_();
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Prüfwesen</div>
      <h1 style={styles.h1}>📋 Prüfprotokolle</h1>
      <p style={styles.sub}>Norm-basierte Prüfungen (DGUV, DIN, VDE) dokumentieren — mit Prüfpunkten, automatischem Ergebnis und der nächsten Fälligkeit. Optional an ein Objekt aus dem Register gekoppelt.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Protokolle" value={String(kennzahlen.gesamt)} accent={C.text} />
        <Kpi label="Mit Mängeln" value={String(kennzahlen.maengel)} accent={kennzahlen.maengel > 0 ? C.warn : C.green} />
        <Kpi label="Überfällig" value={String(kennzahlen.ueberfaellig)} accent={kennzahlen.ueberfaellig > 0 ? C.danger : C.green} />
        <Kpi label="Bald fällig" value={String(kennzahlen.bald)} accent={kennzahlen.bald > 0 ? C.warn : C.green} />
      </div>
      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Prüfprotokolle" regel={augePruef(kennzahlen)} /></div>}

      {/* Neue Prüfung */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>Neue Prüfung</div>
        <div style={styles.grid}>
          <label style={styles.lab}>Prüfart / Norm
            <select style={styles.inp} value={nk.pruef_key} onChange={(e) => normWahl(e.target.value)}>
              <option value="">— wählen —</option>
              {PRUEF_NORMEN.map((n) => <option key={n.key} value={n.key}>{n.bezeichnung} · {n.norm} ({n.intervall_monate} Mon.)</option>)}
              <option value="sonstige">Sonstige (frei eingeben)</option>
            </select>
          </label>
          <label style={styles.lab}>Objekt (aus Register)
            <select style={styles.inp} value={nk.asset_id} onChange={(e) => assetWahl(e.target.value)}>
              <option value="">— kein Objekt —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Objekt (Freitext)<input style={styles.inp} value={nk.objekt_bezeichnung} onChange={(e) => setNk({ ...nk, objekt_bezeichnung: e.target.value })} placeholder="z. B. Leiter Werkstatt Nr. 3" /></label>
          <label style={styles.lab}>Prüfdatum<input type="date" style={styles.inp} value={nk.datum} onChange={(e) => setNk({ ...nk, datum: e.target.value })} /></label>
          <label style={styles.lab}>Prüfer<input style={styles.inp} value={nk.pruefer} onChange={(e) => setNk({ ...nk, pruefer: e.target.value })} placeholder="Name der befähigten Person" /></label>
          {nk.pruef_key === 'sonstige' && <>
            <label style={styles.lab}>Prüfart (frei)<input style={styles.inp} value={nk.pruef_art_custom} onChange={(e) => setNk({ ...nk, pruef_art_custom: e.target.value })} placeholder="z. B. Toranlage" /></label>
            <label style={styles.lab}>Norm (frei)<input style={styles.inp} value={nk.norm_custom} onChange={(e) => setNk({ ...nk, norm_custom: e.target.value })} placeholder="z. B. DIN EN 12453" /></label>
            <label style={styles.lab}>Intervall (Monate)<input style={styles.inp} inputMode="numeric" value={nk.intervall_custom} onChange={(e) => setNk({ ...nk, intervall_custom: e.target.value })} /></label>
          </>}
        </div>

        {nk.pruef_key && (
          <>
            <div style={styles.punktKopf}>
              <span>Prüfpunkte</span>
              <button style={styles.miniAdd} onClick={punktHinzu}>＋ Punkt</button>
            </div>
            {draft.map((p, i) => (
              <div key={i} style={styles.punktZeile}>
                <input style={{ ...styles.inp, flex: 1, minWidth: 140 }} value={p.punkt} onChange={(e) => setDraftText(i, e.target.value)} placeholder="Prüfpunkt" />
                <select style={{ ...styles.inp, width: 120, color: P_STATUS[p.status]?.farbe }} value={p.status} onChange={(e) => setDraftStatus(i, e.target.value)}>
                  <option value="ok">✓ ok</option>
                  <option value="mangel">⚠ Mangel</option>
                  <option value="na">– n.z.</option>
                </select>
                <input style={{ ...styles.inp, flex: 1, minWidth: 120 }} value={p.hinweis} onChange={(e) => setDraftHinweis(i, e.target.value)} placeholder="Hinweis (optional)" />
                <button style={styles.miniWeg} onClick={() => punktWeg(i)}>✕</button>
              </div>
            ))}
            {!draft.length && <div style={styles.hint}>Noch keine Prüfpunkte — mit „＋ Punkt" ergänzen.</div>}

            <div style={styles.vorschau}>
              <span>Ergebnis: <b style={{ color: ERG_META[ergebnisLive]?.farbe }}>{ERG_META[ergebnisLive]?.label}</b></span>
              {naechste && <span>Nächste Prüfung: <b style={{ color: C.gold }}>{d(naechste)}</b> (in {intervall} Mon.)</span>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textDim, fontSize: 13 }}>
                <input type="checkbox" checked={nk.durchgefallen} onChange={(e) => setNk({ ...nk, durchgefallen: e.target.checked })} /> als „durchgefallen" werten
              </label>
            </div>
            <label style={{ ...styles.lab, marginTop: 8 }}>Bemerkung<input style={styles.inp} value={nk.bemerkung} onChange={(e) => setNk({ ...nk, bemerkung: e.target.value })} placeholder="optional" /></label>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={speichern}>✓ Protokoll speichern</button>
          </>
        )}
      </div>

      {/* Liste */}
      {laden ? <p style={styles.hint}>Lädt …</p> : (
        <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
          {protokolle.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>Noch keine Prüfprotokolle.</div> : (
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Prüfart</th><th style={styles.th}>Objekt</th><th style={styles.th}>Datum</th>
                <th style={styles.th}>Ergebnis</th><th style={styles.th}>Nächste</th><th style={styles.th}></th>
              </tr></thead>
              <tbody>
                {protokolle.map((p) => {
                  const em = ERG_META[p.ergebnis] ?? ERG_META.bestanden;
                  const bucket = faelligBucket(p.naechste_pruefung, H);
                  const pkte = punkte.filter((x) => x.protokoll_id === p.id);
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td style={styles.td}><b>{p.pruef_art}</b>{p.norm ? <div style={{ color: C.textDim, fontSize: 'clamp(11px,0.9vw,14px)' }}>{p.norm}</div> : null}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{p.objekt_bezeichnung || '—'}</td>
                        <td style={styles.td}>{d(p.datum)}{p.pruefer ? <div style={{ color: C.textDim, fontSize: 'clamp(11px,0.9vw,14px)' }}>{p.pruefer}</div> : null}</td>
                        <td style={styles.td}><span style={{ ...styles.badge, color: em.farbe, borderColor: em.farbe }}>{em.label}</span></td>
                        <td style={styles.td}><span style={{ color: AMPEL[bucket] }}>● </span>{d(p.naechste_pruefung)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {pkte.length > 0 && <button style={styles.mini} onClick={() => setOffen(offen === p.id ? null : p.id)}>{offen === p.id ? 'Punkte ▲' : `Punkte (${pkte.length}) ▼`}</button>}
                        </td>
                      </tr>
                      {offen === p.id && (
                        <tr>
                          <td style={{ ...styles.td, background: C.navy }} colSpan={6}>
                            {pkte.map((x) => (
                              <div key={x.id} style={styles.punktZeigen}>
                                <span style={{ color: P_STATUS[x.status]?.farbe, fontWeight: 700, minWidth: 90 }}>{P_STATUS[x.status]?.label}</span>
                                <span style={{ flex: 1 }}>{x.punkt}{x.hinweis ? <span style={{ color: C.textDim }}> — {x.hinweis}</span> : ''}</span>
                              </div>
                            ))}
                            {p.bemerkung && <div style={{ color: C.textDim, marginTop: 6, fontSize: 'clamp(13px,1.1vw,17px)' }}>Bemerkung: {p.bemerkung}</div>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 780, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  punktKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 6, fontWeight: 700 },
  punktZeile: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' },
  punktZeigen: { display: 'flex', gap: 10, alignItems: 'baseline', padding: '4px 0', fontSize: 'clamp(13px,1.1vw,17px)', borderBottom: '1px solid rgba(143,163,190,0.08)' },
  vorschau: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)', alignItems: 'center' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniAdd: { background: 'transparent', color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 8, padding: '5px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  miniWeg: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
