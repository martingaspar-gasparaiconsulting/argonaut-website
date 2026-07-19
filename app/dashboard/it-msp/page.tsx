'use client';

// ============================================================
// ARGONAUT OS · Bündel 25 · IT & MSP (Dashboard)
// Reiter "Assets" (Kunden-IT) und "Verträge" (Managed Services mit Wartung).
// Pfad: app/dashboard/it-msp/page.tsx
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

type Asset = { id: string; kunde_name: string | null; bezeichnung: string; typ: string | null; hersteller: string | null; seriennummer: string | null; garantie_bis: string | null };
type Vertrag = { id: string; kunde_name: string | null; bezeichnung: string; monatspauschale: number; intervall_tage: number; naechste_wartung: string | null; status: string };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function ampel(f: string | null): { txt: string; farbe: string } {
  if (!f) return { txt: 'keine Wartung geplant', farbe: C.textDim };
  const tage = Math.ceil((new Date(f + 'T00:00:00').getTime() - new Date(heute() + 'T00:00:00').getTime()) / 86400000);
  if (tage < 0) return { txt: `Wartung ${-tage} T überfällig`, farbe: C.danger };
  if (tage <= 7) return { txt: `Wartung in ${tage} T`, farbe: C.warn };
  return { txt: `Wartung ${d(f)}`, farbe: C.green };
}
function plusTage(tage: number) { const dt = new Date(); dt.setDate(dt.getDate() + tage); return dt.toISOString().slice(0, 10); }

export default function ItMspPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'assets' | 'vertraege'>('vertraege');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [na, setNa] = useState({ kunde_name: '', bezeichnung: '', typ: 'Server', hersteller: '', seriennummer: '', garantie_bis: '' });
  const [nv, setNv] = useState({ kunde_name: '', bezeichnung: '', monatspauschale: '', intervall_tage: '30', naechste_wartung: plusTage(30) });

  const laden_ = useCallback(async () => {
    const { data: a } = await supabase.from('it_assets').select('id, kunde_name, bezeichnung, typ, hersteller, seriennummer, garantie_bis').order('kunde_name', { ascending: true });
    setAssets((a as Asset[]) ?? []);
    const { data: v } = await supabase.from('it_vertraege').select('id, kunde_name, bezeichnung, monatspauschale, intervall_tage, naechste_wartung, status').order('naechste_wartung', { ascending: true, nullsFirst: false });
    setVertraege((v as Vertrag[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  async function assetAnlegen() {
    if (!uid || !na.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('it_assets').insert({
      owner_user_id: uid, kunde_name: na.kunde_name.trim() || null, bezeichnung: na.bezeichnung.trim(), typ: na.typ.trim() || null,
      hersteller: na.hersteller.trim() || null, seriennummer: na.seriennummer.trim() || null, garantie_bis: na.garantie_bis || null,
    });
    if (error) { setFehler('Asset konnte nicht gespeichert werden.'); return; }
    setNa({ kunde_name: '', bezeichnung: '', typ: 'Server', hersteller: '', seriennummer: '', garantie_bis: '' }); setOk('Asset gespeichert.'); await laden_();
  }
  async function vertragAnlegen() {
    if (!uid || !nv.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('it_vertraege').insert({
      owner_user_id: uid, kunde_name: nv.kunde_name.trim() || null, bezeichnung: nv.bezeichnung.trim(),
      monatspauschale: num(nv.monatspauschale), intervall_tage: parseInt(nv.intervall_tage, 10) || 30, naechste_wartung: nv.naechste_wartung || null,
    });
    if (error) { setFehler('Vertrag konnte nicht gespeichert werden.'); return; }
    setNv({ kunde_name: '', bezeichnung: '', monatspauschale: '', intervall_tage: '30', naechste_wartung: plusTage(30) }); setOk('Vertrag gespeichert.'); await laden_();
  }
  async function wartungErledigt(v: Vertrag) {
    const naechste = plusTage(v.intervall_tage || 30);
    const { error } = await supabase.from('it_vertraege').update({ naechste_wartung: naechste }).eq('id', v.id);
    if (!error) { setVertraege((l) => l.map((x) => (x.id === v.id ? { ...x, naechste_wartung: naechste } : x))); setOk('Wartung erledigt — nächster Termin gesetzt.'); }
  }

  const mrr = vertraege.filter((v) => v.status === 'aktiv').reduce((s, v) => s + (Number(v.monatspauschale) || 0), 0);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>💻 IT & MSP</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'vertraege' ? styles.tabAn : {}) }} onClick={() => setTab('vertraege')}>🛡 Verträge</button>
        <button style={{ ...styles.tab, ...(tab === 'assets' ? styles.tabAn : {}) }} onClick={() => setTab('assets')}>🖥 Assets</button>
      </div>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'vertraege' ? (
        <>
          <div style={styles.mrr}>Wiederkehrender Umsatz (MRR): <strong style={{ color: C.gold }}>{eur(mrr)}</strong> / Monat</div>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Managed-Service-Vertrag anlegen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={nv.kunde_name} onChange={(e) => setNv({ ...nv, kunde_name: e.target.value })} placeholder="Kunde" />
              <input style={{ ...styles.inp, flex: 1 }} value={nv.bezeichnung} onChange={(e) => setNv({ ...nv, bezeichnung: e.target.value })} placeholder="Leistung (z. B. Server-Betreuung)" />
              <label style={styles.lab}>€/Monat<input style={{ ...styles.inp, width: 80 }} value={nv.monatspauschale} onChange={(e) => setNv({ ...nv, monatspauschale: e.target.value })} inputMode="decimal" /></label>
              <label style={styles.lab}>Intervall (T)<input style={{ ...styles.inp, width: 70 }} value={nv.intervall_tage} onChange={(e) => setNv({ ...nv, intervall_tage: e.target.value })} inputMode="numeric" /></label>
              <label style={styles.lab}>Nächste Wartung<input type="date" style={styles.inp} value={nv.naechste_wartung} onChange={(e) => setNv({ ...nv, naechste_wartung: e.target.value })} /></label>
              <button style={styles.primaer} onClick={vertragAnlegen}>＋ Vertrag</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {vertraege.map((v) => {
                const amp = ampel(v.naechste_wartung);
                return (
                  <div key={v.id} style={styles.item}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{v.bezeichnung} <span style={{ color: C.textDim, fontWeight: 400 }}>· {v.kunde_name || '—'}</span></div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>{eur(v.monatspauschale)}/Monat · alle {v.intervall_tage} T</div>
                    </div>
                    <span style={{ ...styles.badge, color: amp.farbe, borderColor: amp.farbe }}>🔧 {amp.txt}</span>
                    <button style={styles.okBtn} onClick={() => wartungErledigt(v)}>✓ Wartung erledigt</button>
                  </div>
                );
              })}
              {!vertraege.length && <p style={styles.dim}>Noch keine Verträge.</p>}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Asset anlegen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={na.kunde_name} onChange={(e) => setNa({ ...na, kunde_name: e.target.value })} placeholder="Kunde" />
              <input style={{ ...styles.inp, flex: 1 }} value={na.bezeichnung} onChange={(e) => setNa({ ...na, bezeichnung: e.target.value })} placeholder="Bezeichnung" />
              <select style={styles.inp} value={na.typ} onChange={(e) => setNa({ ...na, typ: e.target.value })}>
                <option>Server</option><option>Client</option><option>Netzwerk</option><option>Drucker</option><option>Lizenz</option><option>Sonstige</option>
              </select>
              <input style={{ ...styles.inp, width: 120 }} value={na.hersteller} onChange={(e) => setNa({ ...na, hersteller: e.target.value })} placeholder="Hersteller" />
              <input style={{ ...styles.inp, width: 130 }} value={na.seriennummer} onChange={(e) => setNa({ ...na, seriennummer: e.target.value })} placeholder="Seriennr." />
              <label style={styles.lab}>Garantie bis<input type="date" style={styles.inp} value={na.garantie_bis} onChange={(e) => setNa({ ...na, garantie_bis: e.target.value })} /></label>
              <button style={styles.primaer} onClick={assetAnlegen}>＋ Asset</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {assets.map((a) => (
                <div key={a.id} style={styles.item}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{a.bezeichnung} <span style={{ color: C.textDim, fontWeight: 400 }}>· {a.kunde_name || '—'}</span></div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{a.typ || '—'}{a.hersteller ? ` · ${a.hersteller}` : ''}{a.seriennummer ? ` · ${a.seriennummer}` : ''}{a.garantie_bis ? ` · Garantie ${d(a.garantie_bis)}` : ''}</div>
                  </div>
                </div>
              ))}
              {!assets.length && <p style={styles.dim}>Noch keine Assets.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  mrr: { marginTop: 12, background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', fontSize: 15 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  okBtn: { background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
