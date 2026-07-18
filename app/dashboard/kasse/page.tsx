'use client';

// ============================================================
// ARGONAUT OS · Bündel 16 · Kasse (POS)
// Artikel wählen -> Warenkorb -> kassieren. Beleg wird über /api/kasse-beleg
// signiert (TSE-Konnektor) und der Bestand abgebucht. Bon als PDF, DSFinV-K-Export.
// Pfad: app/dashboard/kasse/page.tsx
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

type Artikel = { id: string; artikelnummer: string | null; bezeichnung: string; verkaufspreis: number; aktueller_bestand: number };
type CartPos = { key: string; artikel_id: string | null; bezeichnung: string; menge: number; einzelpreis: number; mwst_satz: number };
type Beleg = { id: string; beleg_nr: string | null; brutto_summe: number; zahlart: string; erstellt_am: string; tse_modus: string };

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }

export default function KassePage() {
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [suche, setSuche] = useState('');
  const [cart, setCart] = useState<CartPos[]>([]);
  const [zahlart, setZahlart] = useState('bar');
  const [gegeben, setGegeben] = useState('');
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [letzter, setLetzter] = useState<{ nr: string; brutto: number; rueckgeld: number | null; id: string; demo: boolean } | null>(null);
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');

  const heuteBelege = useCallback(async () => {
    const heute = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('kassen_belege')
      .select('id, beleg_nr, brutto_summe, zahlart, erstellt_am, tse_modus')
      .gte('erstellt_am', `${heute}T00:00:00`).order('erstellt_am', { ascending: false });
    setBelege((data as Beleg[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const { data: art } = await supabase.from('artikel').select('id, artikelnummer, bezeichnung, verkaufspreis, aktueller_bestand').eq('aktiv', true).order('bezeichnung', { ascending: true });
      setArtikel((art as Artikel[]) ?? []);
      await heuteBelege();
      setLaden(false);
    })();
  }, [heuteBelege]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return artikel.slice(0, 40);
    return artikel.filter((a) => a.bezeichnung.toLowerCase().includes(q) || (a.artikelnummer || '').toLowerCase().includes(q)).slice(0, 40);
  }, [artikel, suche]);

  const brutto = useMemo(() => cart.reduce((s, p) => s + p.menge * p.einzelpreis, 0), [cart]);
  const rueckgeld = zahlart === 'bar' && gegeben ? num(gegeben) - brutto : null;

  function hinzu(a: Artikel) {
    setCart((c) => {
      const idx = c.findIndex((p) => p.artikel_id === a.id);
      if (idx >= 0) return c.map((p, i) => (i === idx ? { ...p, menge: p.menge + 1 } : p));
      return [...c, { key: uid(), artikel_id: a.id, bezeichnung: a.bezeichnung, menge: 1, einzelpreis: Number(a.verkaufspreis) || 0, mwst_satz: 19 }];
    });
  }
  function freiePos() { setCart((c) => [...c, { key: uid(), artikel_id: null, bezeichnung: '', menge: 1, einzelpreis: 0, mwst_satz: 19 }]); }
  function setPos(key: string, f: keyof CartPos, v: string | number) { setCart((c) => c.map((p) => (p.key === key ? { ...p, [f]: v } : p))); }
  function weg(key: string) { setCart((c) => c.filter((p) => p.key !== key)); }

  async function kassieren() {
    if (!cart.length) { setFehler('Der Warenkorb ist leer.'); return; }
    setBusy(true); setFehler(null); setLetzter(null);
    try {
      const res = await fetch('/api/kasse-beleg', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionen: cart.map((p) => ({ artikel_id: p.artikel_id, bezeichnung: p.bezeichnung, menge: p.menge, einzelpreis: p.einzelpreis, mwst_satz: p.mwst_satz })),
          zahlart, gegeben: zahlart === 'bar' && gegeben ? num(gegeben) : null, typ: 'verkauf',
        }),
      });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Kassieren fehlgeschlagen.'); return; }
      setLetzter({ nr: j.belegNr, brutto: j.brutto, rueckgeld: j.rueckgeld ?? null, id: j.belegId, demo: j.tse?.modus !== 'live' });
      setCart([]); setGegeben('');
      await heuteBelege();
    } finally { setBusy(false); }
  }

  const tagesSumme = belege.reduce((s, b) => s + (Number(b.brutto_summe) || 0), 0);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🧾 Kasse</h1>

      <div style={styles.split}>
        {/* Links: Artikel */}
        <div style={styles.spalte}>
          <input style={styles.suche} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="🔎 Artikel suchen (Name oder Nummer) …" />
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.artGrid}>
              {gefiltert.map((a) => (
                <button key={a.id} type="button" style={styles.artBtn} onClick={() => hinzu(a)}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.bezeichnung}</div>
                  <div style={{ color: C.gold, fontWeight: 800 }}>{eur(Number(a.verkaufspreis) || 0)}</div>
                  <div style={{ color: C.textDim, fontSize: 11 }}>Bestand: {Number(a.aktueller_bestand) || 0}</div>
                </button>
              ))}
              {!gefiltert.length && <p style={styles.dim}>Keine Artikel. Legen Sie welche unter „📦 ERP/Lager" an.</p>}
            </div>
          )}
          <button type="button" style={styles.freiBtn} onClick={freiePos}>＋ Freie Position (ohne Artikel)</button>
        </div>

        {/* Rechts: Warenkorb */}
        <div style={styles.spalte}>
          <div style={styles.cartCard}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Warenkorb</div>
            {cart.length === 0 ? <p style={styles.dim}>Noch leer — links Artikel antippen.</p> : cart.map((p) => (
              <div key={p.key} style={styles.cartRow}>
                <input style={{ ...styles.mini, flex: 1 }} value={p.bezeichnung} onChange={(e) => setPos(p.key, 'bezeichnung', e.target.value)} placeholder="Bezeichnung" />
                <input style={{ ...styles.mini, width: 46, textAlign: 'center' }} value={String(p.menge)} onChange={(e) => setPos(p.key, 'menge', num(e.target.value))} inputMode="decimal" />
                <input style={{ ...styles.mini, width: 74, textAlign: 'right' }} value={String(p.einzelpreis)} onChange={(e) => setPos(p.key, 'einzelpreis', num(e.target.value))} inputMode="decimal" />
                <select style={{ ...styles.mini, width: 56 }} value={String(p.mwst_satz)} onChange={(e) => setPos(p.key, 'mwst_satz', num(e.target.value))}>
                  <option value="19">19%</option><option value="7">7%</option><option value="0">0%</option>
                </select>
                <button type="button" style={styles.wegBtn} onClick={() => weg(p.key)}>✕</button>
              </div>
            ))}

            <div style={styles.summe}>{eur(brutto)}</div>

            <div style={styles.zahlRow}>
              {[['bar', 'Bar'], ['karte', 'Karte'], ['ec', 'EC']].map(([k, l]) => (
                <button key={k} type="button" style={{ ...styles.zahlBtn, ...(zahlart === k ? styles.zahlAn : {}) }} onClick={() => setZahlart(k)}>{l}</button>
              ))}
            </div>
            {zahlart === 'bar' && (
              <div style={styles.barRow}>
                <input style={styles.mini} value={gegeben} onChange={(e) => setGegeben(e.target.value)} placeholder="gegeben €" inputMode="decimal" />
                <div style={{ color: rueckgeld != null && rueckgeld < 0 ? C.danger : C.green, fontWeight: 800 }}>
                  Rückgeld: {rueckgeld != null ? eur(rueckgeld) : '—'}
                </div>
              </div>
            )}

            {fehler && <div style={styles.err}>{fehler}</div>}
            <button style={{ ...styles.kassieren, opacity: busy || !cart.length ? 0.6 : 1 }} disabled={busy || !cart.length} onClick={kassieren}>
              {busy ? 'Bucht …' : `💶 Kassieren · ${eur(brutto)}`}
            </button>

            {letzter && (
              <div style={styles.bonOk}>
                ✅ Beleg <strong>{letzter.nr}</strong> · {eur(letzter.brutto)}
                {letzter.rueckgeld != null && <> · Rückgeld {eur(letzter.rueckgeld)}</>}
                {letzter.demo && <div style={{ color: C.warn, fontSize: 12 }}>Demo-TSE (keine gültige Signatur — Anbieter unter „🔌 Schnittstellen" hinterlegen)</div>}
                <div><a href={`/api/kasse-bon-pdf?id=${letzter.id}`} target="_blank" rel="noreferrer" style={styles.link}>🖨 Bon anzeigen / drucken</a></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tagesabschluss */}
      <h2 style={styles.h2}>Heute <span style={{ color: C.textDim, fontWeight: 400 }}>· {belege.length} Belege · {eur(tagesSumme)}</span></h2>
      <div style={styles.exportRow}>
        <input type="date" style={styles.mini} value={von} onChange={(e) => setVon(e.target.value)} />
        <span style={{ color: C.textDim }}>bis</span>
        <input type="date" style={styles.mini} value={bis} onChange={(e) => setBis(e.target.value)} />
        <a href={`/api/kasse-dsfinvk?von=${von}&bis=${bis}`} target="_blank" rel="noreferrer" style={styles.exportBtn}>⬇ Export (CSV / DSFinV-K-nah)</a>
      </div>
      <div style={styles.belegListe}>
        {belege.map((b) => (
          <div key={b.id} style={styles.belegItem}>
            <span style={{ fontWeight: 700 }}>{b.beleg_nr}</span>
            <span style={{ color: C.textDim }}>{new Date(b.erstellt_am).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · {b.zahlart}</span>
            <span style={{ fontWeight: 700 }}>{eur(Number(b.brutto_summe) || 0)}</span>
            <a href={`/api/kasse-bon-pdf?id=${b.id}`} target="_blank" rel="noreferrer" style={styles.link}>Bon</a>
          </div>
        ))}
        {!belege.length && <p style={styles.dim}>Heute noch keine Belege.</p>}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 19, fontWeight: 700, margin: '28px 0 10px' },
  dim: { color: C.textDim, fontSize: 14 },
  split: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 14 },
  spalte: { display: 'flex', flexDirection: 'column', gap: 10 },
  suche: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', fontSize: 15, fontFamily: 'inherit' },
  artGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, maxHeight: 420, overflowY: 'auto' },
  artBtn: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', color: C.text, fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 2 },
  freiBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  cartCard: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, position: 'sticky', top: 12 },
  cartRow: { display: 'flex', gap: 6, alignItems: 'center' },
  mini: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  wegBtn: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer' },
  summe: { textAlign: 'right', fontSize: 26, fontWeight: 800, color: C.gold, borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4 },
  zahlRow: { display: 'flex', gap: 8 },
  zahlBtn: { flex: 1, background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  zahlAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  barRow: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  kassieren: { background: C.green, color: '#04240f', border: 'none', borderRadius: 12, padding: '15px', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 },
  bonOk: { background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '12px 14px', fontSize: 14, marginTop: 4 },
  link: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  exportRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  exportBtn: { background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 9, padding: '8px 14px', fontSize: 14, fontWeight: 700, textDecoration: 'none' },
  belegListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  belegItem: { display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
