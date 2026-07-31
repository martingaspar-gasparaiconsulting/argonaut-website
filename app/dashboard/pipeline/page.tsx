'use client';

// ============================================================
// ARGONAUT OS · CRM · Deal-Pipeline (Kanban) + gewichteter Forecast
// Vertriebschancen als Karten über Stufen (Lead → Qualifiziert → Angebot →
// Verhandlung → Gewonnen/Verloren). KPI-Strip mit Pipeline-Wert, gewichtetem
// Forecast und Win-Rate. Logik aus lib/pipeline (0 €, node-getestet).
// Tabelle: crm_deal (RLS owner + Mitarbeiter). Bestätigung vor dem Löschen.
// Pfad: app/dashboard/pipeline/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import Leerzustand from '../_components/Leerzustand';
import { STUFEN, OFFENE_STUFEN, stufeInfo, stufeWahrscheinlichkeit, zaehlePipeline, dealWahrscheinlichkeit, formatEuro } from '@/lib/pipeline';
import { dealScore, priorisiere } from '@/lib/dealScoring';
import { augePipeline } from '@/lib/auge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Deal = {
  id: string; titel: string; kontakt_id: string | null; firma: string | null;
  wert_netto: number | null; stufe: string; wahrscheinlichkeit: number | null;
  erwartetes_datum: string | null; notiz: string | null;
};
type Kontakt = { id: string; vorname: string | null; nachname: string | null; firma: string | null };

function num(s: string): number { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: unknown) { return formatEuro(n); }
function fmtDate(d: string | null) { return d ? d.split('-').reverse().join('.') : ''; }

const LEER = { titel: '', kontakt_id: '', firma: '', wert_netto: '', stufe: 'lead', erwartetes_datum: '', notiz: '' };

export default function PipelineSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [formAuf, setFormAuf] = useState(false);
  const [form, setForm] = useState({ ...LEER });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [d, k] = await Promise.all([
        supabase.from('crm_deal').select('*').order('erstellt_am', { ascending: false }),
        supabase.from('kontakte').select('id, vorname, nachname, firma').order('nachname', { ascending: true }),
      ]);
      setDeals((d.data as Deal[]) ?? []);
      setKontakte((k.data as Kontakt[]) ?? []);
    } catch (e) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await laden_();
    })();
  }, [laden_]);

  const kpi = useMemo(() => zaehlePipeline(deals), [deals]);
  const heute = useMemo(() => new Date(), []);
  const scores = useMemo(() => {
    const m = new Map<string, ReturnType<typeof dealScore>>();
    deals.forEach((d) => m.set(d.id, dealScore(d, heute)));
    return m;
  }, [deals, heute]);
  const topDeals = useMemo(() => priorisiere(deals, heute).slice(0, 3), [deals, heute]);
  const kontaktName = useCallback((id: string | null) => {
    if (!id) return '';
    const k = kontakte.find((x) => x.id === id);
    if (!k) return '';
    return [k.vorname, k.nachname].filter(Boolean).join(' ').trim() || (k.firma ?? '');
  }, [kontakte]);
  const dealsNachStufe = useCallback((stufe: string) => deals.filter((d) => d.stufe === stufe), [deals]);

  async function anlegen() {
    if (!uid || !form.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setBusy('anlegen'); setFehler(null);
    try {
      const { error } = await supabase.from('crm_deal').insert({
        owner_user_id: uid, titel: form.titel.trim(), kontakt_id: form.kontakt_id || null,
        firma: form.firma.trim() || null, wert_netto: num(form.wert_netto), stufe: form.stufe,
        wahrscheinlichkeit: stufeWahrscheinlichkeit(form.stufe),
        erwartetes_datum: form.erwartetes_datum || null, notiz: form.notiz.trim() || null,
      });
      if (error) throw error;
      setForm({ ...LEER }); setFormAuf(false); await laden_();
    } catch (e) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function stufeSetzen(d: Deal, stufe: string) {
    setBusy(d.id); setFehler(null);
    try {
      const { error } = await supabase.from('crm_deal')
        .update({ stufe, wahrscheinlichkeit: stufeWahrscheinlichkeit(stufe), aktualisiert_am: new Date().toISOString() })
        .eq('id', d.id);
      if (error) throw error;
      await laden_();
    } catch (e) { setFehler('Verschieben fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function loeschen(d: Deal) {
    if (!window.confirm(`Deal „${d.titel}" wirklich löschen?`)) return;
    setBusy(d.id);
    try {
      const { error } = await supabase.from('crm_deal').delete().eq('id', d.id);
      if (error) throw error;
      await laden_();
    } catch (e) { setFehler('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const ueberfaelligAnzahl = useMemo(
    () => [...scores.values()].filter((s) => s.gruende.some((g) => g.includes('überfällig'))).length,
    [scores],
  );
  const augeRegel = augePipeline({
    offen: kpi.offen, pipelineWert: kpi.pipelineWert, gewichtet: kpi.gewichtet, winRate: kpi.winRate,
    gewonnen: kpi.gewonnen, verloren: kpi.verloren,
    topTitel: topDeals[0]?.deal.titel, topScore: topDeals[0]?.score.score, ueberfaellig: ueberfaelligAnzahl,
  });

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Vertrieb</div>
      <div style={styles.kopf}>
        <div>
          <h1 style={styles.h1}>📊 Deal-Pipeline</h1>
          <p style={styles.sub}>Deine Vertriebschancen als Karten über die Stufen. Verschieb einen Deal weiter, und der gewichtete Forecast rechnet sich automatisch mit der Abschlusswahrscheinlichkeit.</p>
        </div>
        <button style={styles.primaer} onClick={() => setFormAuf((v) => !v)}>{formAuf ? 'Abbrechen' : '＋ Neuer Deal'}</button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.kpis}>
        <Kpi label="Pipeline-Wert (offen)" value={eur(kpi.pipelineWert)} accent={C.cyan} />
        <Kpi label="Gewichteter Forecast" value={eur(kpi.gewichtet)} accent={C.gold} />
        <Kpi label="Offene Deals" value={String(kpi.offen)} accent={C.text} />
        <Kpi label="Win-Rate" value={`${kpi.winRate} %`} accent={kpi.winRate >= 50 ? C.green : C.warn} sub={`${kpi.gewonnen} gewonnen · ${kpi.verloren} verloren`} />
        <Kpi label="Gewonnen (Wert)" value={eur(kpi.gewonnenWert)} accent={C.green} />
      </div>

      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Deal-Pipeline" regel={augeRegel} /></div>}

      {formAuf && (
        <div style={styles.card}>
          <div style={styles.cardTitel}>Neuer Deal</div>
          <div style={styles.grid}>
            <label style={styles.lab}>Titel *<input style={styles.inp} value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} placeholder="z. B. Angebot Heizungssanierung" /></label>
            <label style={styles.lab}>Kontakt
              <select style={styles.inp} value={form.kontakt_id} onChange={(e) => setForm({ ...form, kontakt_id: e.target.value })}>
                <option value="">— optional —</option>
                {kontakte.map((k) => <option key={k.id} value={k.id}>{[k.vorname, k.nachname].filter(Boolean).join(' ') || k.firma || 'Kontakt'}</option>)}
              </select>
            </label>
            <label style={styles.lab}>Firma<input style={styles.inp} value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} /></label>
            <label style={styles.lab}>Wert netto (€)<input style={styles.inp} inputMode="decimal" value={form.wert_netto} onChange={(e) => setForm({ ...form, wert_netto: e.target.value })} placeholder="0" /></label>
            <label style={styles.lab}>Stufe
              <select style={styles.inp} value={form.stufe} onChange={(e) => setForm({ ...form, stufe: e.target.value })}>
                {STUFEN.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.wahrscheinlichkeit} %)</option>)}
              </select>
            </label>
            <label style={styles.lab}>Erwarteter Abschluss<input type="date" style={styles.inp} value={form.erwartetes_datum} onChange={(e) => setForm({ ...form, erwartetes_datum: e.target.value })} /></label>
            <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Notiz<input style={styles.inp} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
          </div>
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'anlegen' ? 0.6 : 1 }} disabled={busy === 'anlegen'} onClick={anlegen}>＋ Deal anlegen</button>
        </div>
      )}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : deals.length === 0 ? (
        <Leerzustand icon="📊" titel="Noch keine Deals" text="Leg deine erste Vertriebschance an — ARGONAUT zeigt dir Pipeline-Wert und gewichteten Forecast." schritte={["Oben „＋ Neuer Deal“ anlegen", "Wert und Stufe erfassen", "Deal durch die Stufen ziehen bis „Gewonnen“"]} aktionText="＋ Neuer Deal" onAktion={() => setFormAuf(true)} />
      ) : (
        <div style={styles.board}>
          {OFFENE_STUFEN.map((s) => {
            const ds = dealsNachStufe(s.key);
            const summe = ds.reduce((a, d) => a + (Number(d.wert_netto) || 0), 0);
            return (
              <div key={s.key} style={styles.spalte}>
                <div style={{ ...styles.spalteKopf, borderColor: s.farbe + '55' }}>
                  <span style={{ fontWeight: 800, color: s.farbe }}>{s.label}</span>
                  <span style={styles.spalteMeta}>{ds.length} · {eur(summe)}</span>
                </div>
                {ds.length === 0 ? <div style={styles.spalteLeer}>—</div> : ds.map((d) => {
                  const sc = scores.get(d.id);
                  return (
                  <div key={d.id} style={styles.deal}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{d.titel}</div>
                      {sc && <span style={{ ...styles.scorePill, background: sc.farbe + '22', color: sc.farbe, border: `1px solid ${sc.farbe}66` }} title={sc.gruende.join(' · ')}>🔥 {sc.score}</span>}
                    </div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                      {(d.firma || kontaktName(d.kontakt_id) || '—')}{d.erwartetes_datum ? ` · ${fmtDate(d.erwartetes_datum)}` : ''}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontWeight: 800, color: C.gold }}>{eur(d.wert_netto)}</span>
                      <span style={{ color: C.textDim, fontSize: 12 }}>{dealWahrscheinlichkeit(d)} %</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                      <select style={styles.selMini} value={d.stufe} disabled={busy === d.id} onChange={(e) => stufeSetzen(d, e.target.value)}>
                        {STUFEN.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                      </select>
                      <button style={styles.miniX} disabled={busy === d.id} onClick={() => loeschen(d)}>✕</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {(kpi.gewonnen > 0 || kpi.verloren > 0) && !laden && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <div style={styles.cardTitel}>Entschieden</div>
          <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>Über das Stufen-Menü einer Karte lässt sich ein Deal auf „Gewonnen" oder „Verloren" setzen.</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span style={{ color: C.green }}>✓ Gewonnen: <b>{kpi.gewonnen}</b> · {eur(kpi.gewonnenWert)}</span>
            <span style={{ color: C.danger }}>✕ Verloren: <b>{kpi.verloren}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div>{sub ? <div style={styles.kSub}>{sub}</div> : null}</div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '10px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kSub: { color: C.textDim, fontSize: 11, marginTop: 3 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 18px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 18px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  board: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 4 },
  spalte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, minHeight: 120 },
  spalteKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid', paddingBottom: 8, marginBottom: 10 },
  spalteMeta: { color: C.textDim, fontSize: 12 },
  spalteLeer: { color: C.textDim, fontSize: 13, textAlign: 'center', padding: '18px 0' },
  deal: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 },
  scorePill: { flexShrink: 0, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', lineHeight: 1.4 },
  selMini: { flex: 1, background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
