'use client';

// ============================================================
// ARGONAUT OS · Beleg-Inbox / Eingangsrechnungen (OCR)
// Foto/PDF hochladen -> KI liest Lieferant/Datum/Betrag/USt -> prüfen ->
// speichern (GoBD-Ablage, Vorsteuer, DATEV-Export). Pfad:
// app/dashboard/eingangsbelege/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties, ChangeEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

type Beleg = {
  id: string; lieferant: string | null; belegnummer: string | null; belegdatum: string | null;
  netto: number | null; ust_betrag: number | null; ust_satz: number | null; brutto: number | null;
  kategorie: string | null; notiz: string | null; datei_pfad: string | null; status: string;
};
const LEER = { lieferant: '', belegnummer: '', belegdatum: '', netto: '', ust_satz: '19', ust_betrag: '', brutto: '', kategorie: '', notiz: '' };

function eur(n: number | null | undefined) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string): number | null { const n = parseFloat((s || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

export default function EingangsbelegePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [laden, setLaden] = useState(true);
  const [ocrLaden, setOcrLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState({ ...LEER });
  const [dateiPfad, setDateiPfad] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true);
    try {
      const { data } = await supabase.from('eingangsbelege').select('id, lieferant, belegnummer, belegdatum, netto, ust_betrag, ust_satz, brutto, kategorie, notiz, datei_pfad, status').order('belegdatum', { ascending: false }).order('created_at', { ascending: false });
      setBelege((data as Beleg[]) ?? []);
    } catch (e: unknown) { setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
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
  function reset() { setForm({ ...LEER }); setDateiPfad(null); setEditId(null); }

  async function dateiGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !uid) return;
    setOcrLaden(true); setFehler(null); setOk(null); setEditId(null);
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('read')); r.readAsDataURL(f); });
      const base64 = dataUrl.split(',')[1] || '';
      const mediaType = f.type || 'image/jpeg';

      // Datei GoBD-tauglich ablegen (best effort).
      let pfad: string | null = null;
      try {
        const safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
        const p = `${uid}/eingangsbelege/${Date.now()}_${safe}`;
        const { error } = await supabase.storage.from('dokumente').upload(p, f, { upsert: false });
        if (!error) pfad = p;
      } catch { /* Ablage optional */ }
      setDateiPfad(pfad);

      const res = await fetch('/api/beleg-ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, mediaType }) });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Beleg konnte nicht gelesen werden.'); }
      else {
        setForm({
          lieferant: j.lieferant || '', belegnummer: j.belegnummer || '', belegdatum: j.belegdatum || '',
          netto: j.netto != null ? String(j.netto) : '', ust_satz: j.ust_satz != null ? String(j.ust_satz) : '19',
          ust_betrag: j.ust_betrag != null ? String(j.ust_betrag) : '', brutto: j.brutto != null ? String(j.brutto) : '',
          kategorie: j.kategorie || '', notiz: '',
        });
        setOk('Beleg gelesen — bitte kurz prüfen und speichern.' + (pfad ? '' : ' (Datei-Ablage übersprungen.)'));
      }
    } catch { setFehler('Verbindungs- oder Lesefehler.'); }
    finally { setOcrLaden(false); e.target.value = ''; }
  }

  async function speichern() {
    if (!uid) return;
    setFehler(null); setOk(null);
    const payload = {
      owner_user_id: uid, lieferant: form.lieferant.trim() || null, belegnummer: form.belegnummer.trim() || null,
      belegdatum: form.belegdatum || null, netto: num(form.netto), ust_satz: num(form.ust_satz), ust_betrag: num(form.ust_betrag),
      brutto: num(form.brutto), kategorie: form.kategorie.trim() || null, notiz: form.notiz.trim() || null,
      datei_pfad: dateiPfad, updated_at: new Date().toISOString(),
    };
    try {
      if (editId) { const { error } = await supabase.from('eingangsbelege').update(payload).eq('id', editId); if (error) throw error; }
      else { const { error } = await supabase.from('eingangsbelege').insert(payload); if (error) throw error; }
      setOk('Beleg gespeichert.'); reset(); await laden_();
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
  }

  function bearbeiten(b: Beleg) {
    setEditId(b.id); setDateiPfad(b.datei_pfad);
    setForm({
      lieferant: b.lieferant || '', belegnummer: b.belegnummer || '', belegdatum: (b.belegdatum || '').slice(0, 10),
      netto: b.netto != null ? String(b.netto) : '', ust_satz: b.ust_satz != null ? String(b.ust_satz) : '19',
      ust_betrag: b.ust_betrag != null ? String(b.ust_betrag) : '', brutto: b.brutto != null ? String(b.brutto) : '',
      kategorie: b.kategorie || '', notiz: b.notiz || '',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function loeschen(b: Beleg) {
    if (typeof window !== 'undefined' && !window.confirm('Diesen Beleg löschen?')) return;
    try { await supabase.from('eingangsbelege').delete().eq('id', b.id); if (editId === b.id) reset(); await laden_(); } catch { /* ignore */ }
  }

  function csvExport() {
    const head = 'Datum;Lieferant;Belegnummer;Netto;USt-Satz;USt-Betrag;Brutto;Kategorie';
    const zeilen = belege.map((b) => [d(b.belegdatum), b.lieferant || '', b.belegnummer || '', b.netto ?? '', b.ust_satz ?? '', b.ust_betrag ?? '', b.brutto ?? '', b.kategorie || ''].map((x) => String(x).replace(/;/g, ',')).join(';'));
    const blob = new Blob(['﻿' + head + '\n' + zeilen.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `Eingangsbelege_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const kpi = useMemo(() => {
    const brutto = belege.reduce((s, b) => s + (Number(b.brutto) || 0), 0);
    const ust = belege.reduce((s, b) => s + (Number(b.ust_betrag) || 0), 0);
    return { anzahl: belege.length, brutto, ust };
  }, [belege]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📥 Beleg-Inbox · Eingangsrechnungen</h1>
      <p style={styles.sub}>Foto oder PDF hochladen — ARGONAUT liest Lieferant, Datum, Beträge und USt automatisch aus. Prüfen, speichern, fertig. Grundlage für Vorsteuer & DATEV.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.cyan }}>{kpi.anzahl}</div><div style={styles.kLabel}>Belege</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.gold }}>{eur(kpi.brutto)}</div><div style={styles.kLabel}>Summe brutto</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.green }}>{eur(kpi.ust)}</div><div style={styles.kLabel}>Vorsteuer (USt)</div></div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitel}>{editId ? '✏️ Beleg bearbeiten' : '📷 Beleg hochladen & auslesen'}</div>
        {!editId && (
          <label style={styles.upload}>
            <input type="file" accept="image/*,application/pdf" onChange={dateiGewaehlt} disabled={ocrLaden} style={{ display: 'none' }} />
            {ocrLaden ? '⏳ ARGONAUT liest den Beleg …' : '📎 Foto/PDF auswählen — Kamera oder Datei'}
          </label>
        )}
        <div style={styles.grid}>
          <label style={styles.lab}>Lieferant<input style={styles.inp} value={form.lieferant} onChange={(e) => setF('lieferant', e.target.value)} /></label>
          <label style={styles.lab}>Belegnummer<input style={styles.inp} value={form.belegnummer} onChange={(e) => setF('belegnummer', e.target.value)} /></label>
          <label style={styles.lab}>Belegdatum<input type="date" style={styles.inp} value={form.belegdatum} onChange={(e) => setF('belegdatum', e.target.value)} /></label>
          <label style={styles.lab}>Kategorie<input style={styles.inp} value={form.kategorie} onChange={(e) => setF('kategorie', e.target.value)} placeholder="z. B. Material" /></label>
          <label style={styles.lab}>Netto €<input style={styles.inp} value={form.netto} onChange={(e) => setF('netto', e.target.value)} inputMode="decimal" /></label>
          <label style={styles.lab}>USt-Satz %<input style={styles.inp} value={form.ust_satz} onChange={(e) => setF('ust_satz', e.target.value)} inputMode="decimal" /></label>
          <label style={styles.lab}>USt-Betrag €<input style={styles.inp} value={form.ust_betrag} onChange={(e) => setF('ust_betrag', e.target.value)} inputMode="decimal" /></label>
          <label style={styles.lab}>Brutto €<input style={styles.inp} value={form.brutto} onChange={(e) => setF('brutto', e.target.value)} inputMode="decimal" /></label>
        </div>
        <label style={{ ...styles.lab, marginTop: 10 }}>Notiz<input style={styles.inp} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} /></label>
        {dateiPfad && <div style={styles.pfad}>📎 Datei abgelegt: {dateiPfad}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button style={styles.primaer} onClick={speichern}>💾 {editId ? 'Änderungen speichern' : 'Beleg speichern'}</button>
          {editId && <button style={styles.ghost} onClick={reset}>Abbrechen</button>}
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={styles.cardTitel}>Belege</div>
          {belege.length > 0 && <button style={styles.ghost} onClick={csvExport}>⬇ CSV-Export (DATEV/Steuerberater)</button>}
        </div>
        {laden ? <p style={styles.dim}>Lädt …</p> : belege.length === 0 ? <p style={styles.dim}>Noch keine Belege. Lade oben den ersten hoch.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Datum</th><th style={styles.th}>Lieferant</th><th style={styles.thR}>Netto</th><th style={styles.thR}>USt</th><th style={styles.thR}>Brutto</th><th style={styles.th}>Kategorie</th><th style={styles.thR}></th>
              </tr></thead>
              <tbody>
                {belege.map((b) => (
                  <tr key={b.id}>
                    <td style={styles.td}>{d(b.belegdatum)}</td>
                    <td style={styles.td}>{b.lieferant || '—'}{b.belegnummer ? <span style={{ color: C.textDim }}> · {b.belegnummer}</span> : null}</td>
                    <td style={styles.tdR}>{eur(b.netto)}</td>
                    <td style={styles.tdR}>{eur(b.ust_betrag)}{b.ust_satz ? <span style={{ color: C.textDim, fontSize: 12 }}> ({b.ust_satz}%)</span> : null}</td>
                    <td style={{ ...styles.tdR, fontWeight: 700 }}>{eur(b.brutto)}</td>
                    <td style={styles.td}>{b.kategorie || '—'}</td>
                    <td style={styles.tdR}>
                      <button style={styles.mini} onClick={() => bearbeiten(b)}>Bearbeiten</button>
                      <button style={{ ...styles.mini, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => loeschen(b)}>🗑</button>
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
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 12, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 17 },
  upload: { display: 'block', textAlign: 'center', border: `2px dashed ${C.border}`, borderRadius: 12, padding: '20px', margin: '12px 0', cursor: 'pointer', color: C.cyan, fontWeight: 700, fontSize: 15 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 6 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  pfad: { color: C.textDim, fontSize: 12, marginTop: 8 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` },
  thR: { textAlign: 'right', padding: '8px 10px', fontSize: 11.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', borderBottom: '1px solid rgba(143,163,190,0.08)' },
  tdR: { padding: '10px', borderBottom: '1px solid rgba(143,163,190,0.08)', textAlign: 'right', whiteSpace: 'nowrap' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
