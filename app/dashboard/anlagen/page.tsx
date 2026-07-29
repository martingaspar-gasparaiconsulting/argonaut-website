'use client';

// ============================================================
// ARGONAUT OS · Anlagenbuchhaltung (Anlagegüter + AfA)
// Anlagegut erfassen -> ARGONAUT rechnet GWG-Sofortabschreibung oder lineare
// AfA (monatsgenau) nach deutschen Regeln (2026), zeigt Restbuchwert & Plan.
// Regel-Ebene, keine KI. SQL: supabase-sql/buchhaltung-anlagen.sql
// Pfad: app/dashboard/anlagen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { afaPlan, GWG_GRENZE } from '@/lib/afa';
import Leerzustand from '../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

// Gängige Nutzungsdauern (AfA-Tabelle) als Hilfe — frei überschreibbar.
const ND_HILFE = [
  { label: 'PKW', jahre: 6 }, { label: 'Lkw/Transporter', jahre: 9 }, { label: 'Computer/Notebook (digital)', jahre: 1 },
  { label: 'Büromöbel', jahre: 13 }, { label: 'Maschine', jahre: 10 }, { label: 'Werkzeug', jahre: 5 },
  { label: 'Smartphone', jahre: 5 }, { label: 'Ladeneinrichtung', jahre: 8 },
];

type Anlage = {
  id: string; bezeichnung: string; kategorie: string | null; anschaffungsdatum: string | null;
  anschaffungskosten: number | null; nutzungsdauer_jahre: number | null; notiz: string | null; status: string;
};
const LEER = { bezeichnung: '', kategorie: '', anschaffungsdatum: '', anschaffungskosten: '', nutzungsdauer_jahre: '', notiz: '', status: 'aktiv' };

function eur(n: number | null | undefined) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string): number { const n = parseFloat((s || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function intv(s: string): number { const n = parseInt(s || '0', 10); return Number.isFinite(n) && n > 0 ? n : 0; }
function dtag(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

export default function AnlagenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [anlagen, setAnlagen] = useState<Anlage[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState({ ...LEER });
  const [editId, setEditId] = useState<string | null>(null);
  const [planOffen, setPlanOffen] = useState(false);

  const jahr = new Date().getFullYear();

  const laden_ = useCallback(async () => {
    setLaden(true);
    try {
      const { data } = await supabase.from('anlagegueter').select('id, bezeichnung, kategorie, anschaffungsdatum, anschaffungskosten, nutzungsdauer_jahre, notiz, status').order('anschaffungsdatum', { ascending: false });
      setAnlagen((data as Anlage[]) ?? []);
    } catch { setFehler('Laden fehlgeschlagen. Ist das SQL eingespielt?'); }
    finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_();
    })();
  }, [laden_]);

  function setF<K extends keyof typeof LEER>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  function reset() { setForm({ ...LEER }); setEditId(null); setPlanOffen(false); }

  // ---- Regel-Ebene: AfA live rechnen ----
  const rechnung = useMemo(
    () => afaPlan(num(form.anschaffungskosten), intv(form.nutzungsdauer_jahre), form.anschaffungsdatum || null, jahr),
    [form.anschaffungskosten, form.nutzungsdauer_jahre, form.anschaffungsdatum, jahr]
  );

  async function speichern() {
    if (!uid) return;
    setFehler(null); setOk(null);
    if (!form.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    const payload = {
      owner_user_id: uid, bezeichnung: form.bezeichnung.trim(), kategorie: form.kategorie.trim() || null,
      anschaffungsdatum: form.anschaffungsdatum || null, anschaffungskosten: num(form.anschaffungskosten),
      nutzungsdauer_jahre: intv(form.nutzungsdauer_jahre) || 1, notiz: form.notiz.trim() || null,
      status: form.status, updated_at: new Date().toISOString(),
    };
    try {
      if (editId) { const { error } = await supabase.from('anlagegueter').update(payload).eq('id', editId); if (error) throw error; }
      else { const { error } = await supabase.from('anlagegueter').insert(payload); if (error) throw error; }
      setOk('Anlagegut gespeichert.'); reset(); await laden_();
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
  }

  function bearbeiten(a: Anlage) {
    setEditId(a.id);
    setForm({
      bezeichnung: a.bezeichnung || '', kategorie: a.kategorie || '', anschaffungsdatum: (a.anschaffungsdatum || '').slice(0, 10),
      anschaffungskosten: a.anschaffungskosten != null ? String(a.anschaffungskosten) : '',
      nutzungsdauer_jahre: a.nutzungsdauer_jahre != null ? String(a.nutzungsdauer_jahre) : '', notiz: a.notiz || '', status: a.status || 'aktiv',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function loeschen(a: Anlage) {
    if (typeof window !== 'undefined' && !window.confirm('Dieses Anlagegut löschen?')) return;
    try { await supabase.from('anlagegueter').delete().eq('id', a.id); if (editId === a.id) reset(); await laden_(); } catch { /* ignore */ }
  }

  // Für Liste + KPIs: AfA je Anlage rechnen.
  const berechnet = useMemo(() => anlagen.map((a) => ({ a, p: afaPlan(Number(a.anschaffungskosten) || 0, a.nutzungsdauer_jahre || 1, a.anschaffungsdatum || null, jahr) })), [anlagen, jahr]);

  const kpi = useMemo(() => {
    const anschaffung = anlagen.reduce((s, a) => s + (Number(a.anschaffungskosten) || 0), 0);
    const restbuchwert = berechnet.reduce((s, x) => s + (x.p.restbuchwertHeute || 0), 0);
    const afaJahr = berechnet.reduce((s, x) => s + (x.p.afaStichjahr || 0), 0);
    return { anzahl: anlagen.length, anschaffung, restbuchwert, afaJahr };
  }, [anlagen, berechnet]);

  function csvExport() {
    const head = `Bezeichnung;Kategorie;Anschaffung;Kosten netto;Nutzungsdauer;Methode;AfA ${jahr};Restbuchwert ${jahr};Status`;
    const zeilen = berechnet.map(({ a, p }) => [a.bezeichnung, a.kategorie || '', dtag(a.anschaffungsdatum), a.anschaffungskosten ?? '', a.nutzungsdauer_jahre ?? '', p.methode.toUpperCase(), p.afaStichjahr, p.restbuchwertHeute, a.status].map((x) => String(x).replace(/;/g, ',')).join(';'));
    const blob = new Blob(['﻿' + head + '\n' + zeilen.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const el = document.createElement('a');
    el.href = url; el.download = `Anlagenverzeichnis_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(el); el.click(); el.remove(); URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🏗️ Anlagenbuchhaltung</h1>
      <p style={styles.sub}>Anlagegüter erfassen — ARGONAUT erkennt automatisch GWG (Sofortabschreibung bis {GWG_GRENZE} € netto) und rechnet sonst die lineare AfA monatsgenau. Mit Restbuchwert und Abschreibungsplan, nach deutschen Regeln (2026).</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.okBox}>{ok}</div>}

      <div style={styles.kpis}>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.cyan }}>{kpi.anzahl}</div><div style={styles.kLabel}>Anlagegüter</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.textDim }}>{eur(kpi.anschaffung)}</div><div style={styles.kLabel}>Anschaffung gesamt</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.gold }}>{eur(kpi.restbuchwert)}</div><div style={styles.kLabel}>Restbuchwert {jahr}</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.green }}>{eur(kpi.afaJahr)}</div><div style={styles.kLabel}>AfA {jahr}</div></div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitel}>{editId ? '✏️ Anlagegut bearbeiten' : '➕ Neues Anlagegut'}</div>
        <div style={styles.grid}>
          <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={form.bezeichnung} onChange={(e) => setF('bezeichnung', e.target.value)} placeholder="z. B. VW Transporter" /></label>
          <label style={styles.lab}>Kategorie<input style={styles.inp} value={form.kategorie} onChange={(e) => setF('kategorie', e.target.value)} placeholder="z. B. Fuhrpark" /></label>
          <label style={styles.lab}>Anschaffungsdatum<input type="date" style={styles.inp} value={form.anschaffungsdatum} onChange={(e) => setF('anschaffungsdatum', e.target.value)} /></label>
          <label style={styles.lab}>Anschaffungskosten € (netto)<input style={styles.inp} value={form.anschaffungskosten} onChange={(e) => setF('anschaffungskosten', e.target.value)} inputMode="decimal" placeholder="0,00" /></label>
          <label style={styles.lab}>Nutzungsdauer (Jahre)
            <input style={styles.inp} value={form.nutzungsdauer_jahre} onChange={(e) => setF('nutzungsdauer_jahre', e.target.value)} inputMode="numeric" list="nd-hilfe" placeholder="z. B. 6" />
          </label>
          <label style={styles.lab}>Status
            <select style={styles.inp} value={form.status} onChange={(e) => setF('status', e.target.value)}>
              <option value="aktiv">aktiv</option>
              <option value="verkauft">verkauft</option>
              <option value="ausgemustert">ausgemustert</option>
            </select>
          </label>
        </div>
        <div style={styles.ndHilfe}>
          <span style={{ color: C.textDim, fontSize: 12.5 }}>Übliche Nutzungsdauer:</span>
          {ND_HILFE.map((h) => (
            <button key={h.label} type="button" style={styles.ndChip} onClick={() => setF('nutzungsdauer_jahre', String(h.jahre))}>{h.label} · {h.jahre} J.</button>
          ))}
        </div>

        {/* Live-AfA (Regel-Ebene) */}
        {form.anschaffungsdatum && num(form.anschaffungskosten) > 0 && (
          <div style={styles.rechenBox}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...styles.badge, ...(rechnung.methode === 'gwg' ? styles.badgeGwg : styles.badgeLin) }}>{rechnung.methode === 'gwg' ? 'GWG · Sofortabschreibung' : 'Lineare AfA'}</span>
              <span style={{ color: C.textDim, fontSize: 13 }}>{rechnung.hinweis}</span>
            </div>
            <div style={styles.rechenGrid}>
              <div><div style={styles.rLabel}>AfA pro Jahr</div><div style={styles.rWert}>{eur(rechnung.jahresAfa)}</div></div>
              <div><div style={styles.rLabel}>AfA {jahr}</div><div style={styles.rWert}>{eur(rechnung.afaStichjahr)}</div></div>
              <div><div style={styles.rLabel}>Restbuchwert Ende {jahr}</div><div style={{ ...styles.rWert, color: C.gold }}>{eur(rechnung.restbuchwertHeute)}</div></div>
            </div>
            {rechnung.plan.length > 1 && (
              <>
                <button type="button" style={styles.planBtn} onClick={() => setPlanOffen((o) => !o)}>{planOffen ? '▾ Abschreibungsplan verbergen' : '▸ Abschreibungsplan anzeigen'}</button>
                {planOffen && (
                  <table style={styles.planTable}>
                    <thead><tr><th style={styles.planTh}>Jahr</th><th style={styles.planThR}>AfA</th><th style={styles.planThR}>Restbuchwert</th></tr></thead>
                    <tbody>
                      {rechnung.plan.map((p) => (
                        <tr key={p.jahr} style={p.jahr === jahr ? { background: 'rgba(201,168,76,0.08)' } : undefined}>
                          <td style={styles.planTd}>{p.jahr}</td><td style={styles.planTdR}>{eur(p.afa)}</td><td style={styles.planTdR}>{eur(p.restbuchwert)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        )}

        <label style={{ ...styles.lab, marginTop: 10 }}>Notiz<input style={styles.inp} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button style={styles.primaer} onClick={speichern}>💾 {editId ? 'Änderungen speichern' : 'Anlagegut speichern'}</button>
          {editId && <button style={styles.ghost} onClick={reset}>Abbrechen</button>}
        </div>
      </div>

      <datalist id="nd-hilfe">{ND_HILFE.map((h) => <option key={h.label} value={h.jahre}>{h.label}</option>)}</datalist>

      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={styles.cardTitel}>Anlagenverzeichnis</div>
          {anlagen.length > 0 && <button style={styles.ghost} onClick={csvExport}>⬇ CSV-Export</button>}
        </div>
        {laden ? <p style={styles.dim}>Lädt …</p> : anlagen.length === 0 ? (
          <Leerzustand
            icon="🏗️"
            titel="Noch keine Anlagegüter"
            text="Erfasse dein Anlagevermögen (Maschinen, Fahrzeuge, Ausstattung) — ARGONAUT rechnet die AfA automatisch je Jahr."
            schritte={["Anlagegut mit Anschaffungswert anlegen", "Nutzungsdauer und Methode wählen", "AfA und Restbuchwert erscheinen automatisch"]}
          />
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Bezeichnung</th><th style={styles.th}>Anschaffung</th><th style={styles.thR}>Kosten</th><th style={styles.th}>Methode</th><th style={styles.thR}>AfA {jahr}</th><th style={styles.thR}>Restbuchwert</th><th style={styles.thR}></th>
              </tr></thead>
              <tbody>
                {berechnet.map(({ a, p }) => (
                  <tr key={a.id}>
                    <td style={styles.td}>{a.bezeichnung}{a.kategorie ? <span style={{ color: C.textDim }}> · {a.kategorie}</span> : null}{a.status !== 'aktiv' ? <span style={{ color: C.warn, fontSize: 12 }}> ({a.status})</span> : null}</td>
                    <td style={styles.td}>{dtag(a.anschaffungsdatum)}</td>
                    <td style={styles.tdR}>{eur(a.anschaffungskosten)}</td>
                    <td style={styles.td}><span style={{ color: p.methode === 'gwg' ? C.cyan : C.textDim, fontSize: 13 }}>{p.methode === 'gwg' ? 'GWG' : `linear · ${a.nutzungsdauer_jahre} J.`}</span></td>
                    <td style={styles.tdR}>{eur(p.afaStichjahr)}</td>
                    <td style={{ ...styles.tdR, fontWeight: 700, color: C.gold }}>{eur(p.restbuchwertHeute)}</td>
                    <td style={styles.tdR}>
                      <button style={styles.mini} onClick={() => bearbeiten(a)}>Bearbeiten</button>
                      <button style={{ ...styles.mini, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => loeschen(a)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 820 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' },
  kWert: { fontSize: 21, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 12, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 17 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  ndHilfe: { display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
  ndChip: { background: C.navy, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  rechenBox: { marginTop: 14, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  badge: { fontSize: 12.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999 },
  badgeGwg: { background: 'rgba(0,229,255,0.14)', color: C.cyan },
  badgeLin: { background: 'rgba(201,168,76,0.14)', color: C.gold },
  rechenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 12 },
  rLabel: { color: C.textDim, fontSize: 12 },
  rWert: { fontSize: 18, fontWeight: 800, marginTop: 2 },
  planBtn: { background: 'transparent', color: C.cyan, border: 'none', padding: '10px 0 0', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  planTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginTop: 8 },
  planTh: { textAlign: 'left', padding: '6px 8px', color: C.textDim, fontSize: 11.5, borderBottom: `1px solid ${C.border}` },
  planThR: { textAlign: 'right', padding: '6px 8px', color: C.textDim, fontSize: 11.5, borderBottom: `1px solid ${C.border}` },
  planTd: { padding: '6px 8px', borderBottom: '1px solid rgba(143,163,190,0.07)' },
  planTdR: { padding: '6px 8px', borderBottom: '1px solid rgba(143,163,190,0.07)', textAlign: 'right' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 680 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` },
  thR: { textAlign: 'right', padding: '8px 10px', fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', borderBottom: '1px solid rgba(143,163,190,0.08)' },
  tdR: { padding: '10px', borderBottom: '1px solid rgba(143,163,190,0.08)', textAlign: 'right', whiteSpace: 'nowrap' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  okBox: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
