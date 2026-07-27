'use client';

// ============================================================
// ARGONAUT OS · Bündel 30 + Baustein 5 · Lebensmittel-Fachpaket
// Reiter: Chargen/MHD (Status + Rückverfolgung + MHD-Ampel), Kontrollplan
// (HACCP-Soll mit Fälligkeit) und HACCP-Doku (Ist). Regel-Auge (0 €).
// Dokumentationswerkzeug — ersetzt keine amtliche HACCP-Beratung.
// Pfad: app/dashboard/lebensmittel/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  mhdBucket, kontrolleFaellig, naechsteKontrolle, bewerteMesswert,
  zaehleChargen, zaehleKontrollen,
} from '@/lib/haccp';
import { augeHaccp } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Charge = { id: string; bezeichnung: string; charge_nr: string | null; mhd: string | null; menge: number | null; einheit: string; lieferant: string | null; status: string; herkunft: string | null; verwendung: string | null };
type Plan = { id: string; kontrollpunkt: string; sollwert: string | null; intervall_tage: number; letzte_kontrolle: string | null; aktiv: boolean };
type Haccp = { id: string; datum: string; kontrollpunkt: string; messwert: string | null; in_ordnung: boolean; massnahme: string | null; pruefer: string | null };

function heute() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

const MHD_META: Record<string, { txt: (m: string | null) => string; farbe: string }> = {
  abgelaufen: { txt: () => 'abgelaufen', farbe: C.danger },
  bald: { txt: (m) => `MHD ${d(m)}`, farbe: C.warn },
  ok: { txt: (m) => `MHD ${d(m)}`, farbe: C.green },
  kein: { txt: () => 'kein MHD', farbe: C.textDim },
};
const STATUS_META: Record<string, { label: string; farbe: string }> = {
  aktiv: { label: '● aktiv', farbe: C.green },
  gesperrt: { label: '⛔ gesperrt', farbe: C.danger },
  verbraucht: { label: '✓ verbraucht', farbe: C.textDim },
};

export default function LebensmittelPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'chargen' | 'plan' | 'haccp'>('chargen');
  const [chargen, setChargen] = useState<Charge[]>([]);
  const [plaene, setPlaene] = useState<Plan[]>([]);
  const [haccp, setHaccp] = useState<Haccp[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const H = heute();

  const [nc, setNc] = useState({ bezeichnung: '', charge_nr: '', mhd: '', menge: '', einheit: 'kg', lieferant: '', herkunft: '', verwendung: '' });
  const [np, setNp] = useState({ kontrollpunkt: '', sollwert: '', intervall_tage: '1' });
  const [nh, setNh] = useState({ datum: H, kontrollpunkt: '', messwert: '', in_ordnung: true, massnahme: '', pruefer: '' });

  const laden_ = useCallback(async () => {
    const { data: c } = await supabase.from('lm_chargen').select('*').order('mhd', { ascending: true, nullsFirst: false });
    setChargen((c as Charge[]) ?? []);
    const { data: p } = await supabase.from('lm_haccp_plan').select('*').order('kontrollpunkt', { ascending: true });
    setPlaene((p as Plan[]) ?? []);
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

  // --- Kennzahlen (aus lib/haccp) ---
  const kCharge = useMemo(() => zaehleChargen(chargen, H), [chargen, H]);
  const kKontr = useMemo(() => zaehleKontrollen(plaene, H), [plaene, H]);

  // --- Chargen ---
  async function chargeAnlegen() {
    if (!uid || !nc.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('lm_chargen').insert({
      owner_user_id: uid, bezeichnung: nc.bezeichnung.trim(), charge_nr: nc.charge_nr.trim() || null, mhd: nc.mhd || null,
      menge: nc.menge ? num(nc.menge) : null, einheit: nc.einheit.trim() || 'kg', lieferant: nc.lieferant.trim() || null,
      herkunft: nc.herkunft.trim() || null, verwendung: nc.verwendung.trim() || null, status: 'aktiv',
    });
    if (error) { setFehler('Charge konnte nicht gespeichert werden.'); return; }
    setNc({ bezeichnung: '', charge_nr: '', mhd: '', menge: '', einheit: 'kg', lieferant: '', herkunft: '', verwendung: '' });
    setOk('Charge gespeichert.'); await laden_();
  }
  async function statusSetzen(c: Charge, status: string) {
    if (status === 'gesperrt' && !window.confirm(`Charge „${c.bezeichnung}" sperren (Rückruf/Verdacht)?`)) return;
    const { error } = await supabase.from('lm_chargen').update({ status }).eq('id', c.id);
    if (error) { setFehler('Status konnte nicht geändert werden.'); return; }
    await laden_();
  }

  // --- Kontrollplan ---
  async function planAnlegen() {
    if (!uid || !np.kontrollpunkt.trim()) { setFehler('Bitte einen Kontrollpunkt angeben.'); return; }
    setFehler(null); setOk(null);
    const iv = Math.max(1, Math.round(num(np.intervall_tage)) || 1);
    const { error } = await supabase.from('lm_haccp_plan').insert({
      owner_user_id: uid, kontrollpunkt: np.kontrollpunkt.trim(), sollwert: np.sollwert.trim() || null, intervall_tage: iv, aktiv: true,
    });
    if (error) { setFehler('Kontrollpunkt konnte nicht gespeichert werden.'); return; }
    setNp({ kontrollpunkt: '', sollwert: '', intervall_tage: '1' }); setOk('Kontrollpunkt im Plan.'); await laden_();
  }
  async function planKontrollieren(p: Plan) {
    if (!uid) return;
    const mw = window.prompt(`Messwert für „${p.kontrollpunkt}"${p.sollwert ? ` (Soll ${p.sollwert})` : ''}:`, '');
    if (mw === null) return;
    const bewertung = bewerteMesswert(p.sollwert, mw); // true/false/null
    const inOrdnung = bewertung === null ? true : bewertung;
    setFehler(null); setOk(null);
    const { error: e1 } = await supabase.from('lm_haccp').insert({
      owner_user_id: uid, datum: H, kontrollpunkt: p.kontrollpunkt, messwert: mw.trim() || null,
      in_ordnung: inOrdnung, massnahme: inOrdnung ? null : 'Abweichung vom Sollwert — Maßnahme erforderlich', plan_id: p.id,
    });
    if (e1) { setFehler('Kontrolle konnte nicht gespeichert werden.'); return; }
    await supabase.from('lm_haccp_plan').update({ letzte_kontrolle: H }).eq('id', p.id);
    setOk(inOrdnung ? `„${p.kontrollpunkt}" kontrolliert — i. O.` : `„${p.kontrollpunkt}" kontrolliert — ⚠️ Abweichung, bitte Maßnahme prüfen.`);
    await laden_();
  }
  async function planToggle(p: Plan) {
    await supabase.from('lm_haccp_plan').update({ aktiv: !p.aktiv }).eq('id', p.id); await laden_();
  }

  // --- HACCP-Ist (manuell) ---
  async function haccpAnlegen() {
    if (!uid || !nh.kontrollpunkt.trim()) { setFehler('Bitte einen Kontrollpunkt angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('lm_haccp').insert({
      owner_user_id: uid, datum: nh.datum, kontrollpunkt: nh.kontrollpunkt.trim(), messwert: nh.messwert.trim() || null,
      in_ordnung: nh.in_ordnung, massnahme: nh.in_ordnung ? null : (nh.massnahme.trim() || null), pruefer: nh.pruefer.trim() || null,
    });
    if (error) { setFehler('Kontrolle konnte nicht gespeichert werden.'); return; }
    setNh({ datum: H, kontrollpunkt: '', messwert: '', in_ordnung: true, massnahme: '', pruefer: '' });
    setOk('Kontrolle dokumentiert.'); await laden_();
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🥫 Lebensmittel</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'chargen' ? styles.tabAn : {}) }} onClick={() => setTab('chargen')}>📦 Chargen / MHD</button>
        <button style={{ ...styles.tab, ...(tab === 'plan' ? styles.tabAn : {}) }} onClick={() => setTab('plan')}>📋 Kontrollplan{kKontr.faellig > 0 ? ` (${kKontr.faellig})` : ''}</button>
        <button style={{ ...styles.tab, ...(tab === 'haccp' ? styles.tabAn : {}) }} onClick={() => setTab('haccp')}>🌡 HACCP-Doku</button>
      </div>
      <p style={styles.sub}>Chargen mit Rückverfolgung, HACCP-Kontrollplan und Eigenkontrollen — Dokumentationswerkzeug, ersetzt keine amtliche HACCP-Beratung.</p>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* KPI + Regel-Auge */}
      <div style={styles.kpis}>
        <Kpi label="Chargen aktiv" value={String(kCharge.gesamt - kCharge.gesperrt)} accent={C.cyan} />
        <Kpi label="MHD abgelaufen" value={String(kCharge.abgelaufen)} accent={kCharge.abgelaufen > 0 ? C.danger : C.green} />
        <Kpi label="MHD bald (≤ 3 T.)" value={String(kCharge.bald)} accent={kCharge.bald > 0 ? C.warn : C.green} />
        <Kpi label="Kontrollen fällig" value={String(kKontr.faellig)} accent={kKontr.faellig > 0 ? C.warn : C.green} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Lebensmittel" regel={augeHaccp({ abgelaufen: kCharge.abgelaufen, bald: kCharge.bald, gesperrt: kCharge.gesperrt, kontrollenFaellig: kKontr.faellig })} />
        </div>
      )}

      {/* ---------- CHARGEN ---------- */}
      {tab === 'chargen' && (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Charge erfassen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1, minWidth: 130 }} value={nc.bezeichnung} onChange={(e) => setNc({ ...nc, bezeichnung: e.target.value })} placeholder="Produkt" />
              <input style={{ ...styles.inp, width: 120 }} value={nc.charge_nr} onChange={(e) => setNc({ ...nc, charge_nr: e.target.value })} placeholder="Charge-Nr." />
              <label style={styles.lab}>MHD<input type="date" style={styles.inp} value={nc.mhd} onChange={(e) => setNc({ ...nc, mhd: e.target.value })} /></label>
              <label style={styles.lab}>Menge<input style={{ ...styles.inp, width: 70 }} value={nc.menge} onChange={(e) => setNc({ ...nc, menge: e.target.value })} inputMode="decimal" /></label>
              <input style={{ ...styles.inp, width: 56 }} value={nc.einheit} onChange={(e) => setNc({ ...nc, einheit: e.target.value })} />
              <input style={{ ...styles.inp, width: 120 }} value={nc.lieferant} onChange={(e) => setNc({ ...nc, lieferant: e.target.value })} placeholder="Lieferant" />
            </div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1, minWidth: 130 }} value={nc.herkunft} onChange={(e) => setNc({ ...nc, herkunft: e.target.value })} placeholder="Herkunft (woher / Vorprodukt)" />
              <input style={{ ...styles.inp, flex: 1, minWidth: 130 }} value={nc.verwendung} onChange={(e) => setNc({ ...nc, verwendung: e.target.value })} placeholder="Verwendung (wohin / wofür)" />
              <button style={styles.primaer} onClick={chargeAnlegen}>＋ Charge</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {chargen.map((c) => {
                const b = mhdBucket(c.mhd, H);
                const mm = MHD_META[b]; const sm = STATUS_META[c.status] ?? STATUS_META.aktiv;
                return (
                  <div key={c.id} style={{ ...styles.item, opacity: c.status === 'verbraucht' ? 0.55 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{c.bezeichnung} <span style={{ color: C.textDim, fontWeight: 400 }}>{c.charge_nr ? `· ${c.charge_nr}` : ''}</span></div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>{c.menge != null ? `${c.menge} ${c.einheit} · ` : ''}{c.lieferant || '—'}{c.herkunft ? ` · ⟵ ${c.herkunft}` : ''}{c.verwendung ? ` · ⟶ ${c.verwendung}` : ''}</div>
                    </div>
                    <span style={{ ...styles.badge, color: sm.farbe, borderColor: sm.farbe }}>{sm.label}</span>
                    <span style={{ ...styles.badge, color: mm.farbe, borderColor: mm.farbe }}>🗓 {mm.txt(c.mhd)}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.status !== 'gesperrt'
                        ? <button style={styles.mini} onClick={() => statusSetzen(c, 'gesperrt')} title="Sperren / Rückruf">⛔ Sperren</button>
                        : <button style={styles.mini} onClick={() => statusSetzen(c, 'aktiv')} title="Freigeben">Freigeben</button>}
                      {c.status !== 'verbraucht' && <button style={styles.mini} onClick={() => statusSetzen(c, 'verbraucht')} title="Als verbraucht markieren">✓ Verbraucht</button>}
                    </div>
                  </div>
                );
              })}
              {!chargen.length && <p style={styles.dim}>Noch keine Chargen.</p>}
            </div>
          )}
        </>
      )}

      {/* ---------- KONTROLLPLAN ---------- */}
      {tab === 'plan' && (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Kontrollpunkt in den Plan aufnehmen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1, minWidth: 140 }} value={np.kontrollpunkt} onChange={(e) => setNp({ ...np, kontrollpunkt: e.target.value })} placeholder="Kontrollpunkt (z. B. Kühlhaus)" />
              <input style={{ ...styles.inp, width: 130 }} value={np.sollwert} onChange={(e) => setNp({ ...np, sollwert: e.target.value })} placeholder="Soll (z. B. <= 7 °C)" />
              <label style={styles.lab}>alle … Tage<input style={{ ...styles.inp, width: 80 }} value={np.intervall_tage} onChange={(e) => setNp({ ...np, intervall_tage: e.target.value })} inputMode="numeric" /></label>
              <button style={styles.primaer} onClick={planAnlegen}>＋ Punkt</button>
            </div>
            <div style={{ color: C.textDim, fontSize: 12.5 }}>Beim „✓ Kontrollieren" wird der Messwert automatisch gegen den Sollwert geprüft und dokumentiert.</div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {plaene.map((p) => {
                const faellig = kontrolleFaellig(p, H);
                const naechste = naechsteKontrolle(p.letzte_kontrolle, p.intervall_tage);
                return (
                  <div key={p.id} style={{ ...styles.item, opacity: p.aktiv ? 1 : 0.5 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{p.kontrollpunkt} {p.sollwert ? <span style={{ color: C.textDim, fontWeight: 400 }}>· Soll {p.sollwert}</span> : null}</div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>alle {p.intervall_tage} T · {p.letzte_kontrolle ? `zuletzt ${d(p.letzte_kontrolle)}` : 'noch nie'}{naechste ? ` · nächste ${d(naechste)}` : ''}</div>
                    </div>
                    {p.aktiv && <span style={{ ...styles.badge, color: faellig ? C.warn : C.green, borderColor: faellig ? C.warn : C.green }}>{faellig ? 'fällig' : 'im Plan'}</span>}
                    {p.aktiv && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} onClick={() => planKontrollieren(p)}>✓ Kontrollieren</button>}
                    <button style={styles.mini} onClick={() => planToggle(p)}>{p.aktiv ? 'Pausieren' : 'Aktivieren'}</button>
                  </div>
                );
              })}
              {!plaene.length && <p style={styles.dim}>Noch kein Kontrollpunkt im Plan. Nimm oben z. B. „Kühlhaus ≤ 7 °C, täglich" auf.</p>}
            </div>
          )}
        </>
      )}

      {/* ---------- HACCP-DOKU (IST) ---------- */}
      {tab === 'haccp' && (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Kontrolle dokumentieren (manuell)</div>
            <div style={styles.row}>
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nh.datum} onChange={(e) => setNh({ ...nh, datum: e.target.value })} /></label>
              <input style={{ ...styles.inp, flex: 1, minWidth: 130 }} value={nh.kontrollpunkt} onChange={(e) => setNh({ ...nh, kontrollpunkt: e.target.value })} placeholder="Kontrollpunkt" />
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

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  sub: { color: C.textDim, fontSize: 14, margin: '4px 0 0' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, margin: '14px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text, cursor: 'pointer' },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
