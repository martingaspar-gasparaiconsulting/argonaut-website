'use client';

// ============================================================
// ARGONAUT OS · Bündel 24 · Immobilienverwaltung (Dashboard)
// Reiter "Einheiten" (Objekte) und "Mietverträge & Miete" (mit Mieteingängen).
// Pfad: app/dashboard/immobilien/page.tsx
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

type Einheit = { id: string; objekt: string | null; bezeichnung: string; flaeche_qm: number | null; zimmer: number | null; kaltmiete: number; nebenkosten: number; status: string };
type Vertrag = { id: string; einheit_id: string | null; mieter_name: string | null; beginn: string | null; kaltmiete: number; nebenkosten: number; status: string };
type Zahlung = { id: string; vertrag_id: string; monat: string; betrag: number };

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function heute() { return new Date().toISOString().slice(0, 10); }
function monatsStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

export default function ImmobilienPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'einheiten' | 'vertraege'>('einheiten');
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [zahlungen, setZahlungen] = useState<Zahlung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [ne, setNe] = useState({ objekt: '', bezeichnung: '', flaeche_qm: '', zimmer: '', kaltmiete: '', nebenkosten: '' });
  const [nv, setNv] = useState({ einheit_id: '', mieter_name: '', mieter_email: '', beginn: heute(), kaltmiete: '', nebenkosten: '', kaution: '' });

  const laden_ = useCallback(async () => {
    const { data: e } = await supabase.from('immo_einheiten').select('id, objekt, bezeichnung, flaeche_qm, zimmer, kaltmiete, nebenkosten, status').order('objekt', { ascending: true });
    setEinheiten((e as Einheit[]) ?? []);
    const { data: v } = await supabase.from('immo_mietvertraege').select('id, einheit_id, mieter_name, beginn, kaltmiete, nebenkosten, status').order('erstellt_am', { ascending: false });
    setVertraege((v as Vertrag[]) ?? []);
    const { data: z } = await supabase.from('immo_zahlungen').select('id, vertrag_id, monat, betrag');
    setZahlungen((z as Zahlung[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  async function einheitAnlegen() {
    if (!uid || !ne.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('immo_einheiten').insert({
      owner_user_id: uid, objekt: ne.objekt.trim() || null, bezeichnung: ne.bezeichnung.trim(),
      flaeche_qm: ne.flaeche_qm ? num(ne.flaeche_qm) : null, zimmer: ne.zimmer ? num(ne.zimmer) : null,
      kaltmiete: num(ne.kaltmiete), nebenkosten: num(ne.nebenkosten),
    });
    if (error) { setFehler('Einheit konnte nicht gespeichert werden.'); return; }
    setNe({ objekt: '', bezeichnung: '', flaeche_qm: '', zimmer: '', kaltmiete: '', nebenkosten: '' }); setOk('Einheit gespeichert.'); await laden_();
  }

  async function vertragAnlegen() {
    if (!uid || !nv.einheit_id || !nv.mieter_name.trim()) { setFehler('Bitte Einheit und Mieter angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('immo_mietvertraege').insert({
      owner_user_id: uid, einheit_id: nv.einheit_id, mieter_name: nv.mieter_name.trim(), mieter_email: nv.mieter_email.trim() || null,
      beginn: nv.beginn || null, kaltmiete: num(nv.kaltmiete), nebenkosten: num(nv.nebenkosten), kaution: num(nv.kaution),
    });
    if (error) { setFehler('Vertrag konnte nicht gespeichert werden.'); return; }
    await supabase.from('immo_einheiten').update({ status: 'vermietet' }).eq('id', nv.einheit_id);
    setNv({ einheit_id: '', mieter_name: '', mieter_email: '', beginn: heute(), kaltmiete: '', nebenkosten: '', kaution: '' }); setOk('Mietvertrag gespeichert.'); await laden_();
  }

  async function mieteErfassen(v: Vertrag) {
    if (!uid) return;
    const betrag = (Number(v.kaltmiete) || 0) + (Number(v.nebenkosten) || 0);
    const { error } = await supabase.from('immo_zahlungen').insert({ owner_user_id: uid, vertrag_id: v.id, monat: monatsStart(), betrag, bezahlt_am: heute() });
    if (error) { setFehler('Zahlung konnte nicht erfasst werden.'); return; }
    setOk(`Miete ${eur(betrag)} für ${new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })} erfasst.`); await laden_();
  }

  const einheitName = useMemo(() => Object.fromEntries(einheiten.map((e) => [e.id, `${e.objekt ? e.objekt + ' · ' : ''}${e.bezeichnung}`])), [einheiten]);
  const zahlungDiesenMonat = (vId: string) => zahlungen.some((z) => z.vertrag_id === vId && z.monat === monatsStart());
  const monatsSoll = vertraege.filter((v) => v.status === 'aktiv').reduce((s, v) => s + (Number(v.kaltmiete) || 0) + (Number(v.nebenkosten) || 0), 0);
  const monatsIst = zahlungen.filter((z) => z.monat === monatsStart()).reduce((s, z) => s + (Number(z.betrag) || 0), 0);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🏢 Immobilienverwaltung</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'einheiten' ? styles.tabAn : {}) }} onClick={() => setTab('einheiten')}>🏠 Einheiten</button>
        <button style={{ ...styles.tab, ...(tab === 'vertraege' ? styles.tabAn : {}) }} onClick={() => setTab('vertraege')}>📄 Verträge & Miete</button>
      </div>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'einheiten' ? (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Einheit anlegen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={ne.objekt} onChange={(e) => setNe({ ...ne, objekt: e.target.value })} placeholder="Objekt / Adresse" />
              <input style={{ ...styles.inp, flex: 1 }} value={ne.bezeichnung} onChange={(e) => setNe({ ...ne, bezeichnung: e.target.value })} placeholder="Einheit (z. B. 1. OG links)" />
              <label style={styles.lab}>m²<input style={{ ...styles.inp, width: 70 }} value={ne.flaeche_qm} onChange={(e) => setNe({ ...ne, flaeche_qm: e.target.value })} inputMode="decimal" /></label>
              <label style={styles.lab}>Zi.<input style={{ ...styles.inp, width: 56 }} value={ne.zimmer} onChange={(e) => setNe({ ...ne, zimmer: e.target.value })} inputMode="decimal" /></label>
              <label style={styles.lab}>Kalt €<input style={{ ...styles.inp, width: 80 }} value={ne.kaltmiete} onChange={(e) => setNe({ ...ne, kaltmiete: e.target.value })} inputMode="decimal" /></label>
              <label style={styles.lab}>NK €<input style={{ ...styles.inp, width: 70 }} value={ne.nebenkosten} onChange={(e) => setNe({ ...ne, nebenkosten: e.target.value })} inputMode="decimal" /></label>
              <button style={styles.primaer} onClick={einheitAnlegen}>＋ Einheit</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {einheiten.map((e) => (
                <div key={e.id} style={styles.item}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{einheitName[e.id]}</div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{e.flaeche_qm ? `${e.flaeche_qm} m² · ` : ''}{e.zimmer ? `${e.zimmer} Zi. · ` : ''}{eur(e.kaltmiete)} kalt + {eur(e.nebenkosten)} NK</div>
                  </div>
                  <span style={{ ...styles.badge, color: e.status === 'vermietet' ? C.green : C.warn, borderColor: e.status === 'vermietet' ? C.green : C.warn }}>{e.status}</span>
                </div>
              ))}
              {!einheiten.length && <p style={styles.dim}>Noch keine Einheiten.</p>}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.miete}>
            <div><div style={styles.mLabel}>Monats-Soll</div><div style={styles.mWert}>{eur(monatsSoll)}</div></div>
            <div><div style={styles.mLabel}>Eingegangen ({new Date().toLocaleDateString('de-DE', { month: 'short' })})</div><div style={{ ...styles.mWert, color: C.green }}>{eur(monatsIst)}</div></div>
            <div><div style={styles.mLabel}>Offen</div><div style={{ ...styles.mWert, color: monatsSoll - monatsIst > 0 ? C.warn : C.green }}>{eur(Math.max(0, monatsSoll - monatsIst))}</div></div>
          </div>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Mietvertrag anlegen</div>
            <div style={styles.row}>
              <select style={{ ...styles.inp, minWidth: 160 }} value={nv.einheit_id} onChange={(e) => { const id = e.target.value; const ein = einheiten.find((x) => x.id === id); setNv({ ...nv, einheit_id: id, kaltmiete: ein ? String(ein.kaltmiete) : nv.kaltmiete, nebenkosten: ein ? String(ein.nebenkosten) : nv.nebenkosten }); }}>
                <option value="">Einheit wählen …</option>
                {einheiten.map((e) => <option key={e.id} value={e.id}>{einheitName[e.id]}</option>)}
              </select>
              <input style={{ ...styles.inp, flex: 1 }} value={nv.mieter_name} onChange={(e) => setNv({ ...nv, mieter_name: e.target.value })} placeholder="Mieter" />
              <label style={styles.lab}>Beginn<input type="date" style={styles.inp} value={nv.beginn} onChange={(e) => setNv({ ...nv, beginn: e.target.value })} /></label>
              <label style={styles.lab}>Kalt €<input style={{ ...styles.inp, width: 80 }} value={nv.kaltmiete} onChange={(e) => setNv({ ...nv, kaltmiete: e.target.value })} inputMode="decimal" /></label>
              <label style={styles.lab}>NK €<input style={{ ...styles.inp, width: 70 }} value={nv.nebenkosten} onChange={(e) => setNv({ ...nv, nebenkosten: e.target.value })} inputMode="decimal" /></label>
              <label style={styles.lab}>Kaution €<input style={{ ...styles.inp, width: 80 }} value={nv.kaution} onChange={(e) => setNv({ ...nv, kaution: e.target.value })} inputMode="decimal" /></label>
              <button style={styles.primaer} onClick={vertragAnlegen}>＋ Vertrag</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {vertraege.map((v) => {
                const bezahlt = zahlungDiesenMonat(v.id);
                return (
                  <div key={v.id} style={styles.item}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{v.mieter_name} <span style={{ color: C.textDim, fontWeight: 400 }}>· {einheitName[v.einheit_id || ''] || 'Einheit'}</span></div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>{eur((Number(v.kaltmiete) || 0) + (Number(v.nebenkosten) || 0))} / Monat{v.beginn ? ` · seit ${v.beginn.split('-').reverse().join('.')}` : ''}</div>
                    </div>
                    {bezahlt ? <span style={{ ...styles.badge, color: C.green, borderColor: C.green }}>✓ Monat bezahlt</span>
                      : <button style={styles.mieteBtn} onClick={() => mieteErfassen(v)}>＋ Miete erfassen</button>}
                  </div>
                );
              })}
              {!vertraege.length && <p style={styles.dim}>Noch keine Mietverträge.</p>}
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
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  miete: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 },
  mLabel: { color: C.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  mWert: { fontSize: 20, fontWeight: 800, marginTop: 3 },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  mieteBtn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
