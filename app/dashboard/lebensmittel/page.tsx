'use client';

// ============================================================
// ARGONAUT OS · Bündel 30 · Lebensmittel-Fachpaket (Dashboard)
// Reiter "Chargen/MHD" (mit MHD-Ampel) und "HACCP" (Eigenkontrolle).
// Dokumentationswerkzeug — ersetzt keine amtliche HACCP-Beratung.
// Pfad: app/dashboard/lebensmittel/page.tsx
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

type Charge = { id: string; bezeichnung: string; charge_nr: string | null; mhd: string | null; menge: number | null; einheit: string; lieferant: string | null };
type Haccp = { id: string; datum: string; kontrollpunkt: string; messwert: string | null; in_ordnung: boolean; massnahme: string | null; pruefer: string | null };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function mhdAmpel(m: string | null): { txt: string; farbe: string } {
  if (!m) return { txt: 'kein MHD', farbe: C.textDim };
  const tage = Math.ceil((new Date(m + 'T00:00:00').getTime() - new Date(heute() + 'T00:00:00').getTime()) / 86400000);
  if (tage < 0) return { txt: `abgelaufen (${-tage} T)`, farbe: C.danger };
  if (tage <= 3) return { txt: `MHD in ${tage} T`, farbe: C.warn };
  return { txt: `MHD ${d(m)}`, farbe: C.green };
}

export default function LebensmittelPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'chargen' | 'haccp'>('chargen');
  const [chargen, setChargen] = useState<Charge[]>([]);
  const [haccp, setHaccp] = useState<Haccp[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nc, setNc] = useState({ bezeichnung: '', charge_nr: '', mhd: '', menge: '', einheit: 'kg', lieferant: '' });
  const [nh, setNh] = useState({ datum: heute(), kontrollpunkt: '', messwert: '', in_ordnung: true, massnahme: '', pruefer: '' });

  const laden_ = useCallback(async () => {
    const { data: c } = await supabase.from('lm_chargen').select('id, bezeichnung, charge_nr, mhd, menge, einheit, lieferant').order('mhd', { ascending: true, nullsFirst: false });
    setChargen((c as Charge[]) ?? []);
    const { data: h } = await supabase.from('lm_haccp').select('id, datum, kontrollpunkt, messwert, in_ordnung, massnahme, pruefer').order('datum', { ascending: false });
    setHaccp((h as Haccp[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  async function chargeAnlegen() {
    if (!uid || !nc.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('lm_chargen').insert({
      owner_user_id: uid, bezeichnung: nc.bezeichnung.trim(), charge_nr: nc.charge_nr.trim() || null, mhd: nc.mhd || null,
      menge: nc.menge ? num(nc.menge) : null, einheit: nc.einheit.trim() || 'kg', lieferant: nc.lieferant.trim() || null,
    });
    if (error) { setFehler('Charge konnte nicht gespeichert werden.'); return; }
    setNc({ bezeichnung: '', charge_nr: '', mhd: '', menge: '', einheit: 'kg', lieferant: '' }); setOk('Charge gespeichert.'); await laden_();
  }
  async function haccpAnlegen() {
    if (!uid || !nh.kontrollpunkt.trim()) { setFehler('Bitte einen Kontrollpunkt angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('lm_haccp').insert({
      owner_user_id: uid, datum: nh.datum, kontrollpunkt: nh.kontrollpunkt.trim(), messwert: nh.messwert.trim() || null,
      in_ordnung: nh.in_ordnung, massnahme: nh.in_ordnung ? null : (nh.massnahme.trim() || null), pruefer: nh.pruefer.trim() || null,
    });
    if (error) { setFehler('Kontrolle konnte nicht gespeichert werden.'); return; }
    setNh({ datum: heute(), kontrollpunkt: '', messwert: '', in_ordnung: true, massnahme: '', pruefer: '' }); setOk('Kontrolle dokumentiert.'); await laden_();
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🥫 Lebensmittel</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'chargen' ? styles.tabAn : {}) }} onClick={() => setTab('chargen')}>📦 Chargen / MHD</button>
        <button style={{ ...styles.tab, ...(tab === 'haccp' ? styles.tabAn : {}) }} onClick={() => setTab('haccp')}>🌡 HACCP</button>
      </div>
      <p style={styles.sub}>Dokumentationswerkzeug für Chargen und Eigenkontrollen — ersetzt keine amtliche HACCP-Beratung.</p>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'chargen' ? (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Charge erfassen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={nc.bezeichnung} onChange={(e) => setNc({ ...nc, bezeichnung: e.target.value })} placeholder="Produkt" />
              <input style={{ ...styles.inp, width: 120 }} value={nc.charge_nr} onChange={(e) => setNc({ ...nc, charge_nr: e.target.value })} placeholder="Charge-Nr." />
              <label style={styles.lab}>MHD<input type="date" style={styles.inp} value={nc.mhd} onChange={(e) => setNc({ ...nc, mhd: e.target.value })} /></label>
              <label style={styles.lab}>Menge<input style={{ ...styles.inp, width: 70 }} value={nc.menge} onChange={(e) => setNc({ ...nc, menge: e.target.value })} inputMode="decimal" /></label>
              <input style={{ ...styles.inp, width: 56 }} value={nc.einheit} onChange={(e) => setNc({ ...nc, einheit: e.target.value })} />
              <input style={{ ...styles.inp, width: 120 }} value={nc.lieferant} onChange={(e) => setNc({ ...nc, lieferant: e.target.value })} placeholder="Lieferant" />
              <button style={styles.primaer} onClick={chargeAnlegen}>＋ Charge</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {chargen.map((c) => {
                const amp = mhdAmpel(c.mhd);
                return (
                  <div key={c.id} style={styles.item}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{c.bezeichnung} <span style={{ color: C.textDim, fontWeight: 400 }}>{c.charge_nr ? `· ${c.charge_nr}` : ''}</span></div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>{c.menge != null ? `${c.menge} ${c.einheit} · ` : ''}{c.lieferant || '—'}</div>
                    </div>
                    <span style={{ ...styles.badge, color: amp.farbe, borderColor: amp.farbe }}>🗓 {amp.txt}</span>
                  </div>
                );
              })}
              {!chargen.length && <p style={styles.dim}>Noch keine Chargen.</p>}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Kontrolle dokumentieren</div>
            <div style={styles.row}>
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nh.datum} onChange={(e) => setNh({ ...nh, datum: e.target.value })} /></label>
              <input style={{ ...styles.inp, flex: 1 }} value={nh.kontrollpunkt} onChange={(e) => setNh({ ...nh, kontrollpunkt: e.target.value })} placeholder="Kontrollpunkt (z. B. Kühlhaus)" />
              <input style={{ ...styles.inp, width: 100 }} value={nh.messwert} onChange={(e) => setNh({ ...nh, messwert: e.target.value })} placeholder="z. B. 4 °C" />
              <label style={styles.check}><input type="checkbox" checked={nh.in_ordnung} onChange={(e) => setNh({ ...nh, in_ordnung: e.target.checked })} /> i. O.</label>
              <input style={{ ...styles.inp, width: 110 }} value={nh.pruefer} onChange={(e) => setNh({ ...nh, pruefer: e.target.value })} placeholder="Prüfer" />
              <button style={styles.primaer} onClick={haccpAnlegen}>＋ Kontrolle</button>
            </div>
            {!nh.in_ordnung && <input style={styles.inp} value={nh.massnahme} onChange={(e) => setNh({ ...nh, massnahme: e.target.value })} placeholder="Korrekturmaßnahme bei Abweichung" />}
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {haccp.map((h) => (
                <div key={h.id} style={styles.item}>
                  <span style={{ minWidth: 84 }}>{d(h.datum)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{h.kontrollpunkt} {h.messwert ? <span style={{ color: C.textDim, fontWeight: 400 }}>· {h.messwert}</span> : null}</div>
                    {h.massnahme && <div style={{ color: C.warn, fontSize: 13 }}>Maßnahme: {h.massnahme}</div>}
                    {h.pruefer && <div style={{ color: C.textDim, fontSize: 12 }}>{h.pruefer}</div>}
                  </div>
                  <span style={{ ...styles.badge, color: h.in_ordnung ? C.green : C.danger, borderColor: h.in_ordnung ? C.green : C.danger }}>{h.in_ordnung ? '✓ i. O.' : '✕ Abweichung'}</span>
                </div>
              ))}
              {!haccp.length && <p style={styles.dim}>Noch keine Kontrollen.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  sub: { color: C.textDim, fontSize: 14, margin: '4px 0 0' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text, cursor: 'pointer' },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
