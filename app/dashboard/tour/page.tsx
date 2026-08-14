'use client';

// ============================================================
// ARGONAUT OS · A10 · Tour / Dispo-ePOD
// Liefertouren + Stopps mit elektronischem Abliefernachweis: Status je
// Stopp, Empfänger-Unterschrift (Canvas) + Zeitstempel. Logik aus lib/tour
// (0 €, node-getestet).
// Pfad: app/dashboard/tour/page.tsx
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { zaehleStopps, fortschrittProzent, zustellquote, zaehleTour } from '@/lib/tour';
import Leerzustand from '../_components/Leerzustand';
import { augeTour } from '@/lib/auge';
import { ablieferPdf } from '@/lib/ablieferPdf';
import KiAuge from '../_components/KiAuge';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import { NurVoll } from '../_components/Ansicht';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'tour';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Tour = { id: string; bezeichnung: string; datum: string; fahrer: string | null; fahrzeug: string | null; status: string; notiz: string | null };
type Stopp = { id: string; tour_id: string; reihenfolge: number; empfaenger: string | null; adresse: string | null; kolli: number; status: string; zugestellt_am: string | null; empfaenger_name: string | null; unterschrift_data: string | null; notiz: string | null };

const STOPP_META: Record<string, { label: string; farbe: string }> = {
  offen: { label: 'offen', farbe: C.textDim },
  zugestellt: { label: '✓ zugestellt', farbe: C.green },
  nicht_angetroffen: { label: 'nicht angetroffen', farbe: C.warn },
  verweigert: { label: 'verweigert', farbe: C.danger },
};
const TOUR_META: Record<string, string> = { geplant: 'geplant', unterwegs: 'unterwegs', abgeschlossen: 'abgeschlossen' };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function fmtZeit(iso: string | null) { if (!iso) return '—'; const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

// ---------- Signatur-Pad ----------
function SignaturPad({ onSave, onCancel }: { onSave: (name: string, dataUrl: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zeichnet = useRef(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  function punkt(e: React.MouseEvent | React.TouchEvent) {
    const c = ref.current!; const r = c.getBoundingClientRect();
    const t = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.MouseEvent | React.TouchEvent) { zeichnet.current = true; const ctx = ref.current!.getContext('2d')!; const p = punkt(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e: React.MouseEvent | React.TouchEvent) { if (!zeichnet.current) return; const ctx = ref.current!.getContext('2d')!; const p = punkt(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#0A1628'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); }
  function end() { zeichnet.current = false; }
  function leeren() { const c = ref.current!; const ctx = c.getContext('2d')!; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height); }

  return (
    <div style={styles.signOverlay}>
      <div style={styles.signBox}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Abliefernachweis — Unterschrift</div>
        <label style={styles.lab}>Name des Empfängers<input style={styles.inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div style={{ marginTop: 10, color: C.textDim, fontSize: 13 }}>Bitte hier unterschreiben:</div>
        <canvas ref={ref} width={440} height={160} style={styles.canvas}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={styles.mini} onClick={leeren}>Löschen</button>
          <button style={{ ...styles.mini, marginLeft: 'auto' }} onClick={onCancel}>Abbrechen</button>
          <button style={styles.primaer} onClick={() => onSave(name, ref.current!.toDataURL('image/png'))}>✓ Zustellung bestätigen</button>
        </div>
      </div>
    </div>
  );
}

export default function TourPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState<string | null>(null);
  const [tab, setTab] = useState<'touren' | 'stopps'>('touren');
  const [touren, setTouren] = useState<Tour[]>([]);
  const [stopps, setStopps] = useState<Stopp[]>([]);
  const [aktivId, setAktivId] = useState<string>('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [signStopp, setSignStopp] = useState<Stopp | null>(null);
  const H = heuteLokal();

  const [nt, setNt] = useState({ bezeichnung: '', datum: H, fahrer: '', fahrzeug: '' });
  const [nst, setNst] = useState({ empfaenger: '', adresse: '', kolli: '1' });
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [t, s] = await Promise.all([
        supabase.from('tour').select('*').order('datum', { ascending: false }),
        supabase.from('tour_stopp').select('*').order('reihenfolge', { ascending: true }),
      ]);
      const tt = (t.data as Tour[]) ?? [];
      setTouren(tt);
      setStopps((s.data as Stopp[]) ?? []);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, tt.map((r) => r.id)));
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

  const kennzahlen = useMemo(() => zaehleTour(touren, stopps), [touren, stopps]);
  const tourById = useCallback((id: string) => touren.find((x) => x.id === id), [touren]);
  const aktiv = tourById(aktivId);
  const aktivStopps = useMemo(() => stopps.filter((s) => s.tour_id === aktivId), [stopps, aktivId]);
  const aktivZahl = useMemo(() => zaehleStopps(aktivStopps), [aktivStopps]);

  async function tourAnlegen() {
    if (!uid || !nt.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('tour'); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('tour').insert({
        owner_user_id: uid, bezeichnung: nt.bezeichnung.trim(), datum: nt.datum, fahrer: nt.fahrer.trim() || null, fahrzeug: nt.fahrzeug.trim() || null, status: 'geplant',
      }).select('id').single();
      if (error) throw error;
      try { await speichereWerte(MODUL, (data as { id: string } | null)?.id, uid, nmExtra); } catch { /* eigene Felder optional */ }
      setNt({ bezeichnung: '', datum: H, fahrer: '', fahrzeug: '' }); setNmExtra({});
      setOk('Tour angelegt.'); await laden_();
      if (data?.id) { setAktivId(data.id); setTab('stopps'); }
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function stoppAnlegen() {
    if (!uid || !aktivId) { setFehler('Bitte eine Tour wählen.'); return; }
    if (!nst.empfaenger.trim() && !nst.adresse.trim()) { setFehler('Bitte Empfänger oder Adresse angeben.'); return; }
    setBusy('stopp'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('tour_stopp').insert({
        owner_user_id: uid, tour_id: aktivId, reihenfolge: aktivStopps.length + 1,
        empfaenger: nst.empfaenger.trim() || null, adresse: nst.adresse.trim() || null, kolli: Math.max(1, Math.round(num(nst.kolli)) || 1), status: 'offen',
      });
      if (error) throw error;
      setNst({ empfaenger: '', adresse: '', kolli: '1' });
      setOk('Stopp hinzugefügt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function statusSetzen(s: Stopp, status: string) {
    setBusy(s.id); setFehler(null);
    try {
      const { error } = await supabase.from('tour_stopp').update({ status, zugestellt_am: new Date().toISOString() }).eq('id', s.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Aktualisieren fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function nachweisErstellen(s: Stopp) {
    const t = tourById(s.tour_id);
    ablieferPdf({
      tour: t?.bezeichnung || 'Tour', datum: t?.datum || s.zugestellt_am || '', fahrer: t?.fahrer, fahrzeug: t?.fahrzeug,
      empfaenger: s.empfaenger, adresse: s.adresse, kolli: s.kolli, status: s.status,
      zugestellt_am: s.zugestellt_am, empfaenger_name: s.empfaenger_name, unterschrift_data: s.unterschrift_data, aussteller,
    });
  }

  async function zustellenMitUnterschrift(name: string, dataUrl: string) {
    const s = signStopp; if (!s) return;
    setSignStopp(null); setBusy(s.id); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('tour_stopp').update({
        status: 'zugestellt', zugestellt_am: new Date().toISOString(), empfaenger_name: name.trim() || null, unterschrift_data: dataUrl,
      }).eq('id', s.id);
      if (error) throw error;
      setOk('Zustellung mit Unterschrift quittiert.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Tour</div>
      <h1 style={styles.h1}>🚚 Tour & Abliefernachweis</h1>
      <p style={styles.sub}>Liefertouren planen und jede Zustellung elektronisch quittieren — mit Empfänger, Unterschrift und Zeitstempel als Abliefernachweis (ePOD).</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Touren offen" value={String(kennzahlen.offeneTouren)} accent={C.text} />
        <Kpi label="Stopps offen" value={String(kennzahlen.offeneStopps)} accent={kennzahlen.offeneStopps > 0 ? C.warn : C.green} />
        <Kpi label="Zugestellt gesamt" value={String(kennzahlen.zugestelltGesamt)} accent={C.green} />
        <Kpi label="Touren gesamt" value={String(kennzahlen.touren)} accent={C.cyan} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Tour" regel={augeTour(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'touren' ? styles.tabAn : {}) }} onClick={() => setTab('touren')}>🗺 Touren</button>
        <button style={{ ...styles.tab, ...(tab === 'stopps' ? styles.tabAn : {}) }} onClick={() => setTab('stopps')}>📦 Stopps</button>
      </div>

      {/* ---------- TOUREN ---------- */}
      {tab === 'touren' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Tour anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={nt.bezeichnung} onChange={(e) => setNt({ ...nt, bezeichnung: e.target.value })} placeholder="z. B. Tour Nord" /></label>
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nt.datum} onChange={(e) => setNt({ ...nt, datum: e.target.value })} /></label>
              <label style={styles.lab}>Fahrer<input style={styles.inp} value={nt.fahrer} onChange={(e) => setNt({ ...nt, fahrer: e.target.value })} /></label>
              <label style={styles.lab}>Fahrzeug<input style={styles.inp} value={nt.fahrzeug} onChange={(e) => setNt({ ...nt, fahrzeug: e.target.value })} /></label>
              <NurVoll>
                <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.inp} labStyle={styles.lab} />
              </NurVoll>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'tour' ? 0.6 : 1 }} disabled={busy === 'tour'} onClick={tourAnlegen}>＋ Anlegen & öffnen</button>
          </div>
          {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {touren.length === 0 ? <Leerzustand icon="🗺️" titel="Noch keine Touren" text="Plane Liefertouren mit Stopps und elektronischem Abliefernachweis." schritte={["Tour oben anlegen", "Stopps und Empfänger zuordnen", "Unterwegs Status und Unterschrift erfassen"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Datum</th><th style={styles.th}>Tour</th><th style={styles.th}>Fahrer</th><th style={{ ...styles.th, textAlign: 'right' }}>Stopps</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th></tr></thead>
                  <tbody>
                    {touren.map((t) => {
                      const ts = stopps.filter((x) => x.tour_id === t.id);
                      return (
                        <tr key={t.id}>
                          <td style={styles.td}>{fmtDatum(t.datum)}</td>
                          <td style={styles.td}>{t.bezeichnung}<span style={{ color: C.textDim }}> · {TOUR_META[t.status] || t.status}</span><EigeneFelderAnzeige felder={felder} werte={werteMap[t.id]} /></td>
                          <td style={{ ...styles.td, color: C.textDim }}>{t.fahrer || '—'}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{fortschrittProzent(ts)}% <span style={{ color: C.textDim }}>({ts.length})</span></td>
                          <td style={{ ...styles.td, textAlign: 'right' }}><button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} onClick={() => { setAktivId(t.id); setTab('stopps'); }}>öffnen ›</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- STOPPS ---------- */}
      {tab === 'stopps' && (
        <>
          <div style={styles.card}>
            <label style={styles.lab}>Tour
              <select style={styles.inp} value={aktivId} onChange={(e) => setAktivId(e.target.value)}>
                <option value="">— wählen —</option>
                {touren.map((t) => <option key={t.id} value={t.id}>{fmtDatum(t.datum)} · {t.bezeichnung}</option>)}
              </select>
            </label>
            {aktiv && (
              <div style={{ marginTop: 10 }}>
                <div style={{ color: C.textDim, fontSize: 'clamp(13px,1.1vw,17px)' }}>{aktivZahl.zugestellt}/{aktivZahl.gesamt} zugestellt · Zustellquote {zustellquote(aktivStopps)}% · {aktivZahl.kolli} Kolli</div>
                <div style={styles.barAussen}><div style={{ ...styles.barInnen, width: `${fortschrittProzent(aktivStopps)}%` }} /></div>
              </div>
            )}
          </div>

          {aktiv && (
            <>
              <div style={{ ...styles.card, marginTop: 16 }}>
                <div style={styles.cardTitel}>Stopp hinzufügen</div>
                <div style={styles.grid}>
                  <label style={styles.lab}>Empfänger<input style={styles.inp} value={nst.empfaenger} onChange={(e) => setNst({ ...nst, empfaenger: e.target.value })} /></label>
                  <label style={styles.lab}>Adresse<input style={styles.inp} value={nst.adresse} onChange={(e) => setNst({ ...nst, adresse: e.target.value })} /></label>
                  <label style={styles.lab}>Kolli<input style={styles.inp} inputMode="numeric" value={nst.kolli} onChange={(e) => setNst({ ...nst, kolli: e.target.value })} /></label>
                </div>
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'stopp' ? 0.6 : 1 }} disabled={busy === 'stopp'} onClick={stoppAnlegen}>＋ Hinzufügen</button>
              </div>

              {aktivStopps.length > 0 && (
                <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>#</th><th style={styles.th}>Empfänger / Adresse</th><th style={{ ...styles.th, textAlign: 'right' }}>Kolli</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th></tr></thead>
                    <tbody>
                      {aktivStopps.map((s) => {
                        const m = STOPP_META[s.status] ?? STOPP_META.offen;
                        return (
                          <tr key={s.id}>
                            <td style={styles.td}>{s.reihenfolge}</td>
                            <td style={styles.td}>{s.empfaenger || '—'}<div style={{ color: C.textDim, fontSize: 'clamp(12px,0.95vw,15px)' }}>{s.adresse || ''}</div></td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{s.kolli}</td>
                            <td style={styles.td}><span style={{ ...styles.badge, color: m.farbe, borderColor: m.farbe }}>{m.label}</span>{s.zugestellt_am && s.status !== 'offen' ? <div style={{ color: C.textDim, fontSize: 'clamp(11px,0.9vw,14px)' }}>{fmtZeit(s.zugestellt_am)}{s.empfaenger_name ? ` · ${s.empfaenger_name}` : ''}</div> : null}</td>
                            <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {s.status === 'offen' && <>
                                <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === s.id} onClick={() => setSignStopp(s)}>✓ Zustellen</button>
                                <button style={{ ...styles.mini, marginLeft: 6 }} disabled={busy === s.id} onClick={() => statusSetzen(s, 'nicht_angetroffen')}>nicht da</button>
                                <button style={{ ...styles.mini, marginLeft: 6 }} disabled={busy === s.id} onClick={() => statusSetzen(s, 'verweigert')}>verweigert</button>
                              </>}
                              {s.status !== 'offen' && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55`, marginLeft: 6 }} onClick={() => nachweisErstellen(s)}>📄 Nachweis</button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {signStopp && <SignaturPad onSave={zustellenMitUnterschrift} onCancel={() => setSignStopp(null)} />}
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
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
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
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  barAussen: { marginTop: 8, height: 8, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 999, overflow: 'hidden' },
  barInnen: { height: '100%', background: C.green },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  signOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  signBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: 'min(480px, 100%)', color: C.text },
  canvas: { marginTop: 6, width: '100%', height: 160, background: '#FFFFFF', borderRadius: 10, border: `1px solid ${C.border}`, touchAction: 'none', cursor: 'crosshair' },
};
