'use client';

// ============================================================
// ARGONAUT OS · A9 · Spenden / Zuwendungsnachweis
// Zuwendungen erfassen (Geld-/Sachspende, Aufwandsverzicht) + einmalige
// Vereinsdaten für die Zuwendungsbestätigung nach amtlichem Muster (§50 EStDV).
// Logik aus lib/spenden (0 €, node-getestet).
// Pfad: app/dashboard/spenden/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { SPENDE_ARTEN, KLEINBETRAG_GRENZE, kleinbetrag, euroInWorten, zaehleSpenden } from '@/lib/spenden';
import { augeSpenden } from '@/lib/auge';
import { zuwendungPdf } from '@/lib/zuwendungPdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Spende = { id: string; datum: string; spender_name: string; spender_anschrift: string | null; betrag: number; art: string; sachwert_text: string | null; verzicht_aufwand: boolean; zweck: string | null; bestaetigt: boolean; bestaetigt_am: string | null; bestaetigung_nr: string | null; notiz: string | null };
type Einstellung = { org_name: string | null; org_anschrift: string | null; finanzamt: string | null; steuernummer: string | null; freistellung_datum: string | null; freistellung_zeitraum: string | null; koerperschaft_art: string | null; zweck: string | null; aussteller_ort: string | null };

const ART_LABEL: Record<string, string> = { geldzuwendung: 'Geldzuwendung', sachzuwendung: 'Sachzuwendung', aufwandsverzicht: 'Verzicht auf Aufwandsersatz' };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

const LEER_E: Einstellung = { org_name: '', org_anschrift: '', finanzamt: '', steuernummer: '', freistellung_datum: '', freistellung_zeitraum: '', koerperschaft_art: '', zweck: '', aussteller_ort: '' };

export default function SpendenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'spenden' | 'einstellungen'>('spenden');
  const [spenden, setSpenden] = useState<Spende[]>([]);
  const [eForm, setEForm] = useState<Einstellung>(LEER_E);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = heuteLokal();
  const JAHR = new Date().getFullYear();

  const [ns, setNs] = useState({ datum: H, spender_name: '', spender_anschrift: '', betrag: '', art: 'geldzuwendung', sachwert_text: '', verzicht_aufwand: false, zweck: '' });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [s, e] = await Promise.all([
        supabase.from('spende').select('*').order('datum', { ascending: false }),
        supabase.from('spende_einstellung').select('*').maybeSingle(),
      ]);
      setSpenden((s.data as Spende[]) ?? []);
      if (e.data) setEForm({ ...LEER_E, ...(e.data as Partial<Einstellung>) });
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
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

  const kennzahlen = useMemo(() => zaehleSpenden(spenden, JAHR), [spenden, JAHR]);
  const vorschauWorte = useMemo(() => (num(ns.betrag) > 0 && ns.art !== 'sachzuwendung' ? euroInWorten(num(ns.betrag)) : null), [ns.betrag, ns.art]);

  async function spendeAnlegen() {
    if (!uid || !ns.spender_name.trim()) { setFehler('Bitte den Spender angeben.'); return; }
    setBusy('spende'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('spende').insert({
        owner_user_id: uid, datum: ns.datum, spender_name: ns.spender_name.trim(), spender_anschrift: ns.spender_anschrift.trim() || null,
        betrag: num(ns.betrag), art: ns.art, sachwert_text: ns.sachwert_text.trim() || null, verzicht_aufwand: ns.art === 'aufwandsverzicht' || ns.verzicht_aufwand,
        zweck: ns.zweck.trim() || null, bestaetigt: false,
      });
      if (error) throw error;
      setNs({ datum: H, spender_name: '', spender_anschrift: '', betrag: '', art: 'geldzuwendung', sachwert_text: '', verzicht_aufwand: false, zweck: '' });
      setOk('Zuwendung erfasst.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function einstellungSpeichern() {
    if (!uid) return;
    setBusy('einstellung'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('spende_einstellung').upsert({
        owner_user_id: uid,
        org_name: eForm.org_name || null, org_anschrift: eForm.org_anschrift || null, finanzamt: eForm.finanzamt || null,
        steuernummer: eForm.steuernummer || null, freistellung_datum: eForm.freistellung_datum || null, freistellung_zeitraum: eForm.freistellung_zeitraum || null,
        koerperschaft_art: eForm.koerperschaft_art || null, zweck: eForm.zweck || null, aussteller_ort: eForm.aussteller_ort || null,
      }, { onConflict: 'owner_user_id' });
      if (error) throw error;
      setOk('Vereinsdaten gespeichert.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const setE = (k: keyof Einstellung, v: string) => setEForm((f) => ({ ...f, [k]: v }));

  async function bestaetigungErstellen(s: Spende) {
    if (!eForm.org_name) { setFehler('Bitte zuerst unter „Vereinsdaten" mindestens den Namen der Körperschaft hinterlegen.'); setTab('einstellungen'); return; }
    setBusy(s.id); setFehler(null); setOk(null);
    try {
      const nr = s.bestaetigung_nr || `ZB-${JAHR}-${String(spenden.filter((x) => x.bestaetigung_nr).length + 1).padStart(3, '0')}`;
      zuwendungPdf(eForm, { ...s, bestaetigung_nr: nr });
      if (!s.bestaetigt) {
        const { error } = await supabase.from('spende').update({ bestaetigt: true, bestaetigt_am: H, bestaetigung_nr: nr }).eq('id', s.id);
        if (error) throw error;
        await laden_();
      }
      setOk('Zuwendungsbestätigung erstellt.');
    } catch (err: unknown) { setFehler('Erstellen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Spenden</div>
      <h1 style={styles.h1}>❤️ Spenden & Zuwendungsnachweis</h1>
      <p style={styles.sub}>Zuwendungen erfassen und die Bestätigung nach amtlichem Muster vorbereiten — bis {eur(KLEINBETRAG_GRENZE)} genügt der vereinfachte Nachweis, darüber die formelle Zuwendungsbestätigung.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label={`Zuwendungen ${JAHR}`} value={String(kennzahlen.anzahlJahr)} accent={C.text} />
        <Kpi label={`Summe ${JAHR}`} value={eur(kennzahlen.summeJahr)} accent={C.cyan} />
        <Kpi label="Offene Bestätigungen" value={String(kennzahlen.offeneBestaetigungen)} accent={kennzahlen.offeneBestaetigungen > 0 ? C.warn : C.green} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Spenden" regel={augeSpenden(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'spenden' ? styles.tabAn : {}) }} onClick={() => setTab('spenden')}>❤️ Zuwendungen</button>
        <button style={{ ...styles.tab, ...(tab === 'einstellungen' ? styles.tabAn : {}) }} onClick={() => setTab('einstellungen')}>🏛 Vereinsdaten</button>
      </div>

      {/* ---------- ZUWENDUNGEN ---------- */}
      {tab === 'spenden' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Zuwendung erfassen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={ns.datum} onChange={(e) => setNs({ ...ns, datum: e.target.value })} /></label>
              <label style={styles.lab}>Spender<input style={styles.inp} value={ns.spender_name} onChange={(e) => setNs({ ...ns, spender_name: e.target.value })} /></label>
              <label style={styles.lab}>Anschrift<input style={styles.inp} value={ns.spender_anschrift} onChange={(e) => setNs({ ...ns, spender_anschrift: e.target.value })} /></label>
              <label style={styles.lab}>Art
                <select style={styles.inp} value={ns.art} onChange={(e) => setNs({ ...ns, art: e.target.value })}>
                  {SPENDE_ARTEN.map((a) => <option key={a} value={a}>{ART_LABEL[a]}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Betrag / Wert (€)<input style={styles.inp} inputMode="decimal" value={ns.betrag} onChange={(e) => setNs({ ...ns, betrag: e.target.value })} /></label>
              {ns.art === 'sachzuwendung' && <label style={styles.lab}>Sachwert-Beschreibung<input style={styles.inp} value={ns.sachwert_text} onChange={(e) => setNs({ ...ns, sachwert_text: e.target.value })} /></label>}
              <label style={styles.lab}>Zweck<input style={styles.inp} value={ns.zweck} onChange={(e) => setNs({ ...ns, zweck: e.target.value })} placeholder="z. B. Jugendarbeit" /></label>
            </div>
            {vorschauWorte && (
              <div style={{ ...styles.vorschau, marginTop: 12 }}>
                <span>In Worten: <b style={{ color: C.gold }}>{vorschauWorte}</b></span>
                <span style={{ color: kleinbetrag(num(ns.betrag)) ? C.textDim : C.warn }}>{kleinbetrag(num(ns.betrag)) ? 'vereinfachter Nachweis möglich' : 'Zuwendungsbestätigung nötig'}</span>
              </div>
            )}
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'spende' ? 0.6 : 1 }} disabled={busy === 'spende'} onClick={spendeAnlegen}>＋ Erfassen</button>
          </div>
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {spenden.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>Noch keine Zuwendungen.</div> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Datum</th><th style={styles.th}>Spender</th><th style={styles.th}>Art</th><th style={{ ...styles.th, textAlign: 'right' }}>Betrag</th><th style={styles.th}>Bestätigung</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th></tr></thead>
                  <tbody>
                    {spenden.map((s) => (
                      <tr key={s.id}>
                        <td style={styles.td}>{fmtDatum(s.datum)}</td>
                        <td style={styles.td}>{s.spender_name}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{ART_LABEL[s.art] || s.art}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{eur(s.betrag)}</td>
                        <td style={styles.td}>{s.bestaetigt
                          ? <span style={{ ...styles.badge, color: C.green, borderColor: C.green }}>bestätigt {s.bestaetigt_am ? fmtDatum(s.bestaetigt_am) : ''}</span>
                          : <span style={{ ...styles.badge, color: kleinbetrag(s.betrag) ? C.textDim : C.warn, borderColor: kleinbetrag(s.betrag) ? C.border : C.warn }}>{kleinbetrag(s.betrag) ? 'einfacher Nachweis' : 'offen'}</span>}</td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === s.id} onClick={() => bestaetigungErstellen(s)}>📄 {s.bestaetigt ? 'erneut' : 'Bestätigung'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- VEREINSDATEN ---------- */}
      {tab === 'einstellungen' && (
        <div style={styles.card}>
          <div style={styles.cardTitel}>Vereinsdaten für die Zuwendungsbestätigung</div>
          <div style={styles.grid}>
            <label style={styles.lab}>Name der Körperschaft<input style={styles.inp} value={eForm.org_name ?? ''} onChange={(e) => setE('org_name', e.target.value)} /></label>
            <label style={styles.lab}>Anschrift<input style={styles.inp} value={eForm.org_anschrift ?? ''} onChange={(e) => setE('org_anschrift', e.target.value)} /></label>
            <label style={styles.lab}>Finanzamt<input style={styles.inp} value={eForm.finanzamt ?? ''} onChange={(e) => setE('finanzamt', e.target.value)} /></label>
            <label style={styles.lab}>Steuernummer<input style={styles.inp} value={eForm.steuernummer ?? ''} onChange={(e) => setE('steuernummer', e.target.value)} /></label>
            <label style={styles.lab}>Freistellungsbescheid vom<input type="date" style={styles.inp} value={eForm.freistellung_datum ?? ''} onChange={(e) => setE('freistellung_datum', e.target.value)} /></label>
            <label style={styles.lab}>Freistellung für Zeitraum<input style={styles.inp} value={eForm.freistellung_zeitraum ?? ''} onChange={(e) => setE('freistellung_zeitraum', e.target.value)} placeholder="z. B. 2022–2024" /></label>
            <label style={styles.lab}>Körperschaft-Art<input style={styles.inp} value={eForm.koerperschaft_art ?? ''} onChange={(e) => setE('koerperschaft_art', e.target.value)} placeholder="z. B. §5 Abs.1 Nr.9 KStG" /></label>
            <label style={styles.lab}>Gemeinnütziger Zweck<input style={styles.inp} value={eForm.zweck ?? ''} onChange={(e) => setE('zweck', e.target.value)} /></label>
            <label style={styles.lab}>Ausstellungsort<input style={styles.inp} value={eForm.aussteller_ort ?? ''} onChange={(e) => setE('aussteller_ort', e.target.value)} /></label>
          </div>
          <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'einstellung' ? 0.6 : 1 }} disabled={busy === 'einstellung'} onClick={einstellungSpeichern}>Speichern</button>
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
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 12px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  vorschau: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
