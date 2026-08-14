'use client';

// ============================================================
// ARGONAUT OS · Reisekosten (Dienstreisen)
// Reise erfassen -> ARGONAUT rechnet Verpflegungspauschale, Fahrtkosten (km)
// und Gesamtbetrag nach den aktuellen deutschen Sätzen (2026). Regel-Ebene,
// keine KI. SQL: supabase-sql/buchhaltung-reisekosten.sql
// Pfad: app/dashboard/reisekosten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { verpflegung, fahrtkosten, round2, type Fahrzeug } from '@/lib/reisekosten';
import Leerzustand from '../_components/Leerzustand';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import { NurVoll } from '../_components/Ansicht';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'reisekosten';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Reise = {
  id: string; reisender: string | null; anlass: string | null; ziel: string | null;
  abreise: string | null; rueckkehr: string | null; km: number | null; fahrzeug: string | null;
  fahrt_betrag: number | null; verpflegung_netto: number | null; uebernachtung: number | null;
  sonstige: number | null; gesamt: number | null; status: string;
};

const LEER = {
  reisender: '', anlass: '', ziel: '', abreise: '', rueckkehr: '', km: '', fahrzeug: 'pkw',
  fruehstueck: '0', mittag: '0', abend: '0', uebernachtung: '', sonstige: '', status: 'offen', notiz: '',
};

function eur(n: number | null | undefined) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string): number { const n = parseFloat((s || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function intv(s: string): number { const n = parseInt(s || '0', 10); return Number.isFinite(n) && n > 0 ? n : 0; }
function dtag(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

export default function ReisekostenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [reisen, setReisen] = useState<Reise[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState({ ...LEER });
  const [editId, setEditId] = useState<string | null>(null);
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const laden_ = useCallback(async () => {
    setLaden(true);
    try {
      const { data } = await supabase.from('reisekosten').select('id, reisender, anlass, ziel, abreise, rueckkehr, km, fahrzeug, fahrt_betrag, verpflegung_netto, uebernachtung, sonstige, gesamt, status').order('abreise', { ascending: false });
      const rows = (data as Reise[]) ?? [];
      setReisen(rows);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, rows.map((r) => r.id)));
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
  function reset() { setForm({ ...LEER }); setEditId(null); setNmExtra({}); }

  // ---- Regel-Ebene: live rechnen (kostenlos, sofort) ----
  const rechnung = useMemo(() => {
    const vp = verpflegung(form.abreise || null, form.rueckkehr || null, { fruehstueck: intv(form.fruehstueck), mittag: intv(form.mittag), abend: intv(form.abend) });
    const fahrt = fahrtkosten(num(form.km), (form.fahrzeug === 'motorrad' ? 'motorrad' : 'pkw') as Fahrzeug);
    const uebernachtung = round2(num(form.uebernachtung));
    const sonstige = round2(num(form.sonstige));
    const gesamt = round2(fahrt + vp.netto + uebernachtung + sonstige);
    return { vp, fahrt, uebernachtung, sonstige, gesamt };
  }, [form.abreise, form.rueckkehr, form.km, form.fahrzeug, form.fruehstueck, form.mittag, form.abend, form.uebernachtung, form.sonstige]);

  async function speichern() {
    if (!uid) return;
    setFehler(null); setOk(null);
    if (!form.abreise || !form.rueckkehr) { setFehler('Bitte Abreise und Rückkehr angeben.'); return; }
    const { vp, fahrt, uebernachtung, sonstige, gesamt } = rechnung;
    const payload = {
      owner_user_id: uid, reisender: form.reisender.trim() || null, anlass: form.anlass.trim() || null, ziel: form.ziel.trim() || null,
      abreise: new Date(form.abreise).toISOString(), rueckkehr: new Date(form.rueckkehr).toISOString(),
      km: num(form.km) || null, fahrzeug: form.fahrzeug, km_satz: form.fahrzeug === 'motorrad' ? 0.20 : 0.30, fahrt_betrag: fahrt,
      fruehstueck_anz: intv(form.fruehstueck), mittag_anz: intv(form.mittag), abend_anz: intv(form.abend),
      verpflegung_brutto: vp.brutto, verpflegung_kuerzung: vp.kuerzung, verpflegung_netto: vp.netto,
      uebernachtung, sonstige, gesamt, status: form.status, notiz: form.notiz.trim() || null, updated_at: new Date().toISOString(),
    };
    try {
      if (editId) {
        const { error } = await supabase.from('reisekosten').update(payload).eq('id', editId); if (error) throw error;
        try { await speichereWerte(MODUL, editId, uid, nmExtra); } catch { /* eigene Felder optional */ }
      } else {
        const { data: neu, error } = await supabase.from('reisekosten').insert(payload).select('id').single(); if (error) throw error;
        try { await speichereWerte(MODUL, (neu as { id: string }).id, uid, nmExtra); } catch { /* eigene Felder optional */ }
      }
      setNmExtra({}); setOk('Reise gespeichert.'); reset(); await laden_();
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
  }

  function bearbeiten(r: Reise) {
    setEditId(r.id);
    setNmExtra(werteMap[r.id] ?? {});
    const loc = (iso: string | null) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const lokal = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      return lokal.toISOString().slice(0, 16);
    };
    setForm({
      reisender: r.reisender || '', anlass: r.anlass || '', ziel: r.ziel || '',
      abreise: loc(r.abreise), rueckkehr: loc(r.rueckkehr), km: r.km != null ? String(r.km) : '',
      fahrzeug: r.fahrzeug || 'pkw', fruehstueck: '0', mittag: '0', abend: '0',
      uebernachtung: r.uebernachtung != null ? String(r.uebernachtung) : '', sonstige: r.sonstige != null ? String(r.sonstige) : '',
      status: r.status || 'offen', notiz: '',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function loeschen(r: Reise) {
    if (typeof window !== 'undefined' && !window.confirm('Diese Reise löschen?')) return;
    try { await supabase.from('reisekosten').delete().eq('id', r.id); if (editId === r.id) reset(); await laden_(); } catch { /* ignore */ }
  }
  async function statusToggle(r: Reise) {
    const neu = r.status === 'erstattet' ? 'offen' : 'erstattet';
    try { await supabase.from('reisekosten').update({ status: neu, updated_at: new Date().toISOString() }).eq('id', r.id); await laden_(); } catch { /* ignore */ }
  }

  function csvExport() {
    const head = 'Reisender;Anlass;Ziel;Abreise;Rueckkehr;km;Fahrtkosten;Verpflegung;Uebernachtung;Sonstige;Gesamt;Status';
    const zeilen = reisen.map((r) => [r.reisender || '', r.anlass || '', r.ziel || '', dtag(r.abreise), dtag(r.rueckkehr), r.km ?? '', r.fahrt_betrag ?? '', r.verpflegung_netto ?? '', r.uebernachtung ?? '', r.sonstige ?? '', r.gesamt ?? '', r.status].map((x) => String(x).replace(/;/g, ',')).join(';'));
    const blob = new Blob(['﻿' + head + '\n' + zeilen.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `Reisekosten_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const kpi = useMemo(() => {
    const offen = reisen.filter((r) => r.status !== 'erstattet').reduce((s, r) => s + (Number(r.gesamt) || 0), 0);
    const gesamt = reisen.reduce((s, r) => s + (Number(r.gesamt) || 0), 0);
    return { anzahl: reisen.length, offen, gesamt };
  }, [reisen]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🧳 Reisekosten</h1>
      <p style={styles.sub}>Dienstreise erfassen — ARGONAUT rechnet Verpflegungspauschale, Kilometergeld und Gesamtbetrag automatisch nach den aktuellen deutschen Sätzen (2026). Kein Taschenrechner, keine KI-Kosten.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.okBox}>{ok}</div>}

      <div style={styles.kpis}>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.cyan }}>{kpi.anzahl}</div><div style={styles.kLabel}>Reisen</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.warn }}>{eur(kpi.offen)}</div><div style={styles.kLabel}>offen (zu erstatten)</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.gold }}>{eur(kpi.gesamt)}</div><div style={styles.kLabel}>Summe gesamt</div></div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitel}>{editId ? '✏️ Reise bearbeiten' : '➕ Neue Dienstreise'}</div>
        <div style={styles.grid}>
          <label style={styles.lab}>Reisender<input style={styles.inp} value={form.reisender} onChange={(e) => setF('reisender', e.target.value)} placeholder="Name" /></label>
          <label style={styles.lab}>Anlass / Zweck<input style={styles.inp} value={form.anlass} onChange={(e) => setF('anlass', e.target.value)} placeholder="z. B. Kundentermin" /></label>
          <label style={styles.lab}>Ziel<input style={styles.inp} value={form.ziel} onChange={(e) => setF('ziel', e.target.value)} placeholder="Ort" /></label>
          <label style={styles.lab}>Abreise<input type="datetime-local" style={styles.inp} value={form.abreise} onChange={(e) => setF('abreise', e.target.value)} /></label>
          <label style={styles.lab}>Rückkehr<input type="datetime-local" style={styles.inp} value={form.rueckkehr} onChange={(e) => setF('rueckkehr', e.target.value)} /></label>
          <label style={styles.lab}>Fahrzeug
            <select style={styles.inp} value={form.fahrzeug} onChange={(e) => setF('fahrzeug', e.target.value)}>
              <option value="pkw">PKW (0,30 €/km)</option>
              <option value="motorrad">Motorrad (0,20 €/km)</option>
            </select>
          </label>
          <label style={styles.lab}>Gefahrene km<input style={styles.inp} value={form.km} onChange={(e) => setF('km', e.target.value)} inputMode="decimal" placeholder="0" /></label>
          <label style={styles.lab}>Übernachtung €<input style={styles.inp} value={form.uebernachtung} onChange={(e) => setF('uebernachtung', e.target.value)} inputMode="decimal" placeholder="tatsächliche Kosten" /></label>
          <label style={styles.lab}>Sonstiges € (Bahn, Parken …)<input style={styles.inp} value={form.sonstige} onChange={(e) => setF('sonstige', e.target.value)} inputMode="decimal" placeholder="0" /></label>
          <NurVoll><EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.inp} labStyle={styles.lab} /></NurVoll>
        </div>

        <div style={styles.mahlzeiten}>
          <span style={{ color: C.textDim, fontSize: 13 }}>Vom Arbeitgeber/Hotel gestellte Mahlzeiten (kürzen die Pauschale):</span>
          <label style={styles.mLab}>Frühstück<input style={styles.mInp} value={form.fruehstueck} onChange={(e) => setF('fruehstueck', e.target.value)} inputMode="numeric" /></label>
          <label style={styles.mLab}>Mittag<input style={styles.mInp} value={form.mittag} onChange={(e) => setF('mittag', e.target.value)} inputMode="numeric" /></label>
          <label style={styles.mLab}>Abend<input style={styles.mInp} value={form.abend} onChange={(e) => setF('abend', e.target.value)} inputMode="numeric" /></label>
        </div>

        {/* Live-Berechnung (Regel-Ebene) */}
        <div style={styles.rechenBox}>
          <div style={styles.rechenZeile}><span>🚗 Fahrtkosten{form.km ? ` (${form.km} km)` : ''}</span><b>{eur(rechnung.fahrt)}</b></div>
          <div style={styles.rechenZeile}>
            <span>🍽 Verpflegungspauschale{rechnung.vp.kuerzung > 0 ? ` (${eur(rechnung.vp.brutto)} − ${eur(rechnung.vp.kuerzung)} Kürzung)` : ''}</span>
            <b>{eur(rechnung.vp.netto)}</b>
          </div>
          <div style={styles.rechenZeile}><span>🏨 Übernachtung</span><b>{eur(rechnung.uebernachtung)}</b></div>
          <div style={styles.rechenZeile}><span>🧾 Sonstiges</span><b>{eur(rechnung.sonstige)}</b></div>
          <div style={{ ...styles.rechenZeile, ...styles.rechenSumme }}><span>Gesamt-Erstattung</span><b>{eur(rechnung.gesamt)}</b></div>
          {rechnung.vp.hinweis && <div style={styles.hinweis}>ℹ️ {rechnung.vp.hinweis}</div>}
        </div>

        <NurVoll><label style={{ ...styles.lab, marginTop: 10 }}>Notiz<input style={styles.inp} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} /></label></NurVoll>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button style={styles.primaer} onClick={speichern}>💾 {editId ? 'Änderungen speichern' : 'Reise speichern'}</button>
          {editId && <button style={styles.ghost} onClick={reset}>Abbrechen</button>}
        </div>
      </div>

      {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}

      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={styles.cardTitel}>Reisen</div>
          {reisen.length > 0 && <button style={styles.ghost} onClick={csvExport}>⬇ CSV-Export</button>}
        </div>
        {laden ? <p style={styles.dim}>Lädt …</p> : reisen.length === 0 ? <Leerzustand icon="🧳" titel="Noch keine Reisen erfasst" text="Erfasse Dienstreisen — ARGONAUT rechnet Verpflegungspauschale und Fahrtkosten automatisch." schritte={["Reise oben anlegen", "Reisetage, Ziele und km eintragen", "Gesamtbetrag übernehmen"]} /> : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Reisender</th><th style={styles.th}>Anlass / Ziel</th><th style={styles.th}>Zeitraum</th><th style={styles.thR}>Gesamt</th><th style={styles.th}>Status</th><th style={styles.thR}></th>
              </tr></thead>
              <tbody>
                {reisen.map((r) => (
                  <tr key={r.id}>
                    <td style={styles.td}>{r.reisender || '—'}</td>
                    <td style={styles.td}>{r.anlass || '—'}{r.ziel ? <span style={{ color: C.textDim }}> · {r.ziel}</span> : null}<EigeneFelderAnzeige felder={felder} werte={werteMap[r.id]} /></td>
                    <td style={styles.td}>{dtag(r.abreise)}{r.rueckkehr && dtag(r.rueckkehr) !== dtag(r.abreise) ? <span style={{ color: C.textDim }}> – {dtag(r.rueckkehr)}</span> : null}</td>
                    <td style={{ ...styles.tdR, fontWeight: 700 }}>{eur(r.gesamt)}</td>
                    <td style={styles.td}>
                      <button style={{ ...styles.pill, ...(r.status === 'erstattet' ? styles.pillGruen : styles.pillWarn) }} onClick={() => statusToggle(r)}>
                        {r.status === 'erstattet' ? '✓ erstattet' : 'offen'}
                      </button>
                    </td>
                    <td style={styles.tdR}>
                      <button style={styles.mini} onClick={() => bearbeiten(r)}>Bearbeiten</button>
                      <button style={{ ...styles.mini, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => loeschen(r)}>🗑</button>
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
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 800 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 12, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 17 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  mahlzeiten: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, padding: '10px 12px', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10 },
  mLab: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.text },
  mInp: { width: 54, background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', fontSize: 14, fontFamily: 'inherit', textAlign: 'center' },
  rechenBox: { marginTop: 14, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px' },
  rechenZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 14.5, gap: 12 },
  rechenSumme: { borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 10, fontSize: 17, color: C.gold },
  hinweis: { color: C.textDim, fontSize: 12.5, marginTop: 8, lineHeight: 1.4 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` },
  thR: { textAlign: 'right', padding: '8px 10px', fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', borderBottom: '1px solid rgba(143,163,190,0.08)' },
  tdR: { padding: '10px', borderBottom: '1px solid rgba(143,163,190,0.08)', textAlign: 'right', whiteSpace: 'nowrap' },
  pill: { border: '1px solid', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent' },
  pillWarn: { color: C.warn, borderColor: `${C.warn}66` },
  pillGruen: { color: C.green, borderColor: `${C.green}66` },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  okBox: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
