'use client';

// ============================================================
// ARGONAUT OS · A8 · Zuschnitt / Stückliste
// Zuschnitt-Projekte + Teileliste mit 1D-Optimierung (Stangenbedarf,
// Verschnitt %, Schnittplan) und Materialgewicht. Logik aus lib/zuschnitt
// (0 €, node-getestet).
// Pfad: app/dashboard/zuschnitt/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { DICHTE, optimiereZuschnitt, gewicht, gewichtProMeter } from '@/lib/zuschnitt';
import Leerzustand from '../_components/Leerzustand';
import { augeZuschnitt } from '@/lib/auge';
import { zuschnittplanPdf } from '@/lib/zuschnittplanPdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Projekt = { id: string; bezeichnung: string; material: string | null; stangenlaenge: number; saegeblatt_mm: number; querschnitt_mm2: number | null; dichte: number | null; status: string; notiz: string | null };
type Teil = { id: string; projekt_id: string; bezeichnung: string | null; laenge: number; anzahl: number; notiz: string | null };

function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function mm(n: number) { return `${(Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })} mm`; }
function kg(n: number) { return `${(Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg`; }

export default function ZuschnittPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState<string | null>(null);
  const [tab, setTab] = useState<'zuschnitt' | 'projekte'>('projekte');
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [teile, setTeile] = useState<Teil[]>([]);
  const [aktivId, setAktivId] = useState<string>('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [np, setNp] = useState({ bezeichnung: '', material: '', stangenlaenge: '6000', saegeblatt_mm: '3', dichteKey: '', querschnitt_mm2: '' });
  const [nt, setNt] = useState({ bezeichnung: '', laenge: '', anzahl: '1' });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [p, t] = await Promise.all([
        supabase.from('zuschnitt_projekt').select('*').order('erstellt_am', { ascending: false }),
        supabase.from('zuschnitt_teil').select('*').order('erstellt_am', { ascending: true }),
      ]);
      setProjekte((p.data as Projekt[]) ?? []);
      setTeile((t.data as Teil[]) ?? []);
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      setAussteller(str(meta.firmenname) || str(meta.firma) || str(meta.name) || null);
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const projektById = useCallback((id: string) => projekte.find((x) => x.id === id), [projekte]);
  const aktiv = projektById(aktivId);
  const aktivTeile = useMemo(() => teile.filter((t) => t.projekt_id === aktivId), [teile, aktivId]);

  const erg = useMemo(() => {
    if (!aktiv || aktivTeile.length === 0) return null;
    return optimiereZuschnitt(aktivTeile.map((t) => ({ laenge: t.laenge, anzahl: t.anzahl })), aktiv.stangenlaenge, aktiv.saegeblatt_mm);
  }, [aktiv, aktivTeile]);

  const gewichtInfo = useMemo(() => {
    if (!aktiv || !erg || !aktiv.querschnitt_mm2 || !aktiv.dichte) return null;
    const proStange = gewicht(aktiv.querschnitt_mm2, aktiv.stangenlaenge, aktiv.dichte);
    return { proMeter: gewichtProMeter(aktiv.querschnitt_mm2, aktiv.dichte), proStange, gesamt: Math.round(proStange * erg.stangen * 100) / 100 };
  }, [aktiv, erg]);

  const kennzahlen = useMemo(() => augeZuschnitt({ projekte: projekte.filter((p) => p.status !== 'erledigt').length, teile: teile.length }), [projekte, teile]);

  async function projektAnlegen() {
    if (!uid || !np.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('projekt'); setFehler(null); setOk(null);
    try {
      const dichte = np.dichteKey && DICHTE[np.dichteKey] ? DICHTE[np.dichteKey] : null;
      const { data, error } = await supabase.from('zuschnitt_projekt').insert({
        owner_user_id: uid, bezeichnung: np.bezeichnung.trim(), material: np.material.trim() || (np.dichteKey || null),
        stangenlaenge: num(np.stangenlaenge) || 6000, saegeblatt_mm: num(np.saegeblatt_mm),
        querschnitt_mm2: np.querschnitt_mm2.trim() ? num(np.querschnitt_mm2) : null, dichte, status: 'offen',
      }).select('id').single();
      if (error) throw error;
      setNp({ bezeichnung: '', material: '', stangenlaenge: '6000', saegeblatt_mm: '3', dichteKey: '', querschnitt_mm2: '' });
      setOk('Projekt angelegt.'); await laden_();
      if (data?.id) { setAktivId(data.id); setTab('zuschnitt'); }
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function teilAnlegen() {
    if (!uid || !aktivId) { setFehler('Bitte ein Projekt wählen.'); return; }
    if (num(nt.laenge) <= 0) { setFehler('Bitte eine Länge > 0 angeben.'); return; }
    setBusy('teil'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('zuschnitt_teil').insert({
        owner_user_id: uid, projekt_id: aktivId, bezeichnung: nt.bezeichnung.trim() || null,
        laenge: num(nt.laenge), anzahl: Math.max(1, Math.round(num(nt.anzahl)) || 1),
      });
      if (error) throw error;
      setNt({ bezeichnung: '', laenge: '', anzahl: '1' });
      setOk('Teil hinzugefügt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function teilLoeschen(t: Teil) {
    setBusy(t.id); setFehler(null);
    try {
      const { error } = await supabase.from('zuschnitt_teil').delete().eq('id', t.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function planErstellen() {
    if (!aktiv || !erg) return;
    zuschnittplanPdf({
      projekt: aktiv.bezeichnung, material: aktiv.material, stangenlaenge: aktiv.stangenlaenge, saegeblatt: aktiv.saegeblatt_mm,
      stangen: erg.stangen, verschnittProzent: erg.verschnittProzent, gesamtLaenge: erg.gesamtLaenge, teileLaenge: erg.teileLaenge,
      gewichtGesamt: gewichtInfo ? gewichtInfo.gesamt : null, plan: erg.plan, aussteller,
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Zuschnitt</div>
      <h1 style={styles.h1}>📐 Zuschnitt & Stückliste</h1>
      <p style={styles.sub}>Teilelisten optimal auf Stangen/Platten verteilen — mit Sägeblatt-Verschnitt, Stangenbedarf, Verschnitt in Prozent und Materialgewicht.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Zuschnitt" regel={kennzahlen} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'projekte' ? styles.tabAn : {}) }} onClick={() => setTab('projekte')}>📁 Projekte</button>
        <button style={{ ...styles.tab, ...(tab === 'zuschnitt' ? styles.tabAn : {}) }} onClick={() => setTab('zuschnitt')}>📐 Zuschnitt</button>
      </div>

      {/* ---------- PROJEKTE ---------- */}
      {tab === 'projekte' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Projekt anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={np.bezeichnung} onChange={(e) => setNp({ ...np, bezeichnung: e.target.value })} placeholder="z. B. Geländer Haus Meyer" /></label>
              <label style={styles.lab}>Material<input style={styles.inp} value={np.material} onChange={(e) => setNp({ ...np, material: e.target.value })} placeholder="z. B. Vierkantrohr 40x40x3" /></label>
              <label style={styles.lab}>Stangenlänge (mm)<input style={styles.inp} inputMode="decimal" value={np.stangenlaenge} onChange={(e) => setNp({ ...np, stangenlaenge: e.target.value })} /></label>
              <label style={styles.lab}>Sägeblatt / Schnittfuge (mm)<input style={styles.inp} inputMode="decimal" value={np.saegeblatt_mm} onChange={(e) => setNp({ ...np, saegeblatt_mm: e.target.value })} /></label>
              <label style={styles.lab}>Material (Dichte, für Gewicht)
                <select style={styles.inp} value={np.dichteKey} onChange={(e) => setNp({ ...np, dichteKey: e.target.value })}>
                  <option value="">— optional —</option>
                  {Object.keys(DICHTE).map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)} ({DICHTE[k]} g/cm³)</option>)}
                </select>
              </label>
              <label style={styles.lab}>Querschnitt (mm², für Gewicht)<input style={styles.inp} inputMode="decimal" value={np.querschnitt_mm2} onChange={(e) => setNp({ ...np, querschnitt_mm2: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'projekt' ? 0.6 : 1 }} disabled={busy === 'projekt'} onClick={projektAnlegen}>＋ Anlegen & öffnen</button>
          </div>
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {projekte.length === 0 ? <Leerzustand icon="✂️" titel="Noch keine Zuschnitt-Projekte" text="Lege ein Projekt mit Teileliste an — ARGONAUT optimiert Stangenbedarf und Verschnitt." schritte={["Projekt oben anlegen", "Teile und Materiallänge erfassen", "Schnittplan optimieren lassen"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Projekt</th><th style={styles.th}>Material</th><th style={{ ...styles.th, textAlign: 'right' }}>Stangenlänge</th><th style={{ ...styles.th, textAlign: 'right' }}>Teile</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th></tr></thead>
                  <tbody>
                    {projekte.map((p) => (
                      <tr key={p.id} style={{ opacity: p.status === 'erledigt' ? 0.5 : 1 }}>
                        <td style={styles.td}>{p.bezeichnung}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{p.material || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{mm(p.stangenlaenge)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{teile.filter((t) => t.projekt_id === p.id).length}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}><button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} onClick={() => { setAktivId(p.id); setTab('zuschnitt'); }}>öffnen ›</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- ZUSCHNITT ---------- */}
      {tab === 'zuschnitt' && (
        <>
          <div style={styles.card}>
            <label style={styles.lab}>Projekt
              <select style={styles.inp} value={aktivId} onChange={(e) => setAktivId(e.target.value)}>
                <option value="">— wählen —</option>
                {projekte.map((p) => <option key={p.id} value={p.id}>{p.bezeichnung}{p.material ? ` · ${p.material}` : ''}</option>)}
              </select>
            </label>
            {aktiv && <div style={{ marginTop: 8, color: C.textDim, fontSize: 'clamp(13px,1.1vw,17px)' }}>Stangenlänge {mm(aktiv.stangenlaenge)} · Schnittfuge {mm(aktiv.saegeblatt_mm)}</div>}
          </div>

          {aktiv && (
            <>
              <div style={{ ...styles.card, marginTop: 16 }}>
                <div style={styles.cardTitel}>Teil hinzufügen</div>
                <div style={styles.grid}>
                  <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={nt.bezeichnung} onChange={(e) => setNt({ ...nt, bezeichnung: e.target.value })} placeholder="z. B. Pfosten" /></label>
                  <label style={styles.lab}>Länge (mm)<input style={styles.inp} inputMode="decimal" value={nt.laenge} onChange={(e) => setNt({ ...nt, laenge: e.target.value })} /></label>
                  <label style={styles.lab}>Anzahl<input style={styles.inp} inputMode="numeric" value={nt.anzahl} onChange={(e) => setNt({ ...nt, anzahl: e.target.value })} /></label>
                </div>
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'teil' ? 0.6 : 1 }} disabled={busy === 'teil'} onClick={teilAnlegen}>＋ Hinzufügen</button>
              </div>

              {aktivTeile.length > 0 && (
                <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>Teil</th><th style={{ ...styles.th, textAlign: 'right' }}>Länge</th><th style={{ ...styles.th, textAlign: 'right' }}>Anzahl</th><th style={{ ...styles.th, textAlign: 'right' }}></th></tr></thead>
                    <tbody>
                      {aktivTeile.map((t) => (
                        <tr key={t.id}>
                          <td style={styles.td}>{t.bezeichnung || '—'}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{mm(t.laenge)}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{t.anzahl}×</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}><button style={{ ...styles.mini, color: C.danger, borderColor: `${C.danger}55` }} disabled={busy === t.id} onClick={() => teilLoeschen(t)}>löschen</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Ergebnis */}
              {erg && (
                <div style={{ ...styles.card, marginTop: 16 }}>
                  <div style={{ ...styles.cardTitel, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>Zuschnitt-Ergebnis
                    <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55`, marginLeft: 'auto' }} onClick={planErstellen}>📄 Zuschnittplan</button>
                  </div>
                  <div style={styles.kpis}>
                    <Kpi label="Stangen nötig" value={String(erg.stangen)} accent={C.gold} />
                    <Kpi label="Verschnitt" value={`${erg.verschnittProzent} %`} accent={erg.verschnittProzent > 20 ? C.warn : C.green} />
                    <Kpi label="Materiallänge" value={mm(erg.gesamtLaenge)} accent={C.text} />
                    {gewichtInfo && <Kpi label="Gewicht gesamt" value={kg(gewichtInfo.gesamt)} accent={C.cyan} />}
                  </div>
                  {erg.zuLang > 0 && <div style={{ ...styles.err, marginTop: 4 }}>{erg.zuLang} Teil(e) sind länger als die Stange ({mm(aktiv.stangenlaenge)}) und wurden nicht eingeplant.</div>}
                  {gewichtInfo && <div style={{ color: C.textDim, fontSize: 'clamp(13px,1.1vw,17px)', marginBottom: 8 }}>{kg(gewichtInfo.proMeter)}/m · {kg(gewichtInfo.proStange)} je Stange</div>}
                  <div style={{ display: 'grid', gap: 8 }}>
                    {erg.plan.map((s, i) => (
                      <div key={i} style={styles.stange}>
                        <span style={{ fontWeight: 700, color: C.gold, whiteSpace: 'nowrap' }}>Stange {i + 1}</span>
                        <span style={{ flex: 1 }}>{s.schnitte.map((l) => `${l}`).join('  +  ')} mm</span>
                        <span style={{ color: s.rest > 0 ? C.textDim : C.green, whiteSpace: 'nowrap' }}>Rest {mm(s.rest)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
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
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
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
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  stange: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 560 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
