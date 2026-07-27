'use client';

// ============================================================
// ARGONAUT OS · A7 · Kanzlei — Akten & Fristen
// Mandate (Akten) + Fristenverwaltung mit Vorfrist-Ampel und
// Verjährungs-Rechner (§195/§199 BGB). Regel-Logik aus lib/fristen
// (0 €, node-getestet). Eigenes Modul neben „Kanzlei & Steuer".
// Pfad: app/dashboard/fristen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  FRIST_ARTEN, VORFRIST_TAGE_STD, fristStatus, restTage, verjaehrungEnde, zaehleFristen,
  type FristStatus,
} from '@/lib/fristen';
import { augeKanzlei } from '@/lib/auge';
import { fristenlistePdf } from '@/lib/fristenlistePdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Akte = { id: string; aktenzeichen: string | null; mandant: string; gegner: string | null; rechtsgebiet: string | null; kurzbeschreibung: string | null; gegenstandswert: number | null; sachbearbeiter: string | null; status: string; angelegt_am: string; notiz: string | null };
type Frist = { id: string; akte_id: string; bezeichnung: string; art: string; frist_datum: string; vorfrist_tage: number; verantwortlich: string | null; erledigt: boolean; erledigt_am: string | null; notiz: string | null };

const ART_LABEL: Record<string, string> = { notfrist: 'Notfrist', verjaehrung: 'Verjährung', wiedervorlage: 'Wiedervorlage', termin: 'Termin', sonstige: 'Sonstige' };
const STATUS_META: Record<FristStatus, { label: string; farbe: string }> = {
  erledigt: { label: 'erledigt', farbe: C.textDim },
  ueberfaellig: { label: 'überfällig', farbe: C.danger },
  heute: { label: 'heute fällig', farbe: C.danger },
  vorfrist: { label: 'Vorfrist', farbe: C.warn },
  offen: { label: 'offen', farbe: C.green },
};

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number | null) { return n == null ? '—' : (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export default function KanzleiPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState<string | null>(null);
  const [tab, setTab] = useState<'akten' | 'fristen'>('fristen');
  const [akten, setAkten] = useState<Akte[]>([]);
  const [fristen, setFristen] = useState<Frist[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = heuteLokal();

  const [na, setNa] = useState({ aktenzeichen: '', mandant: '', gegner: '', rechtsgebiet: '', gegenstandswert: '', sachbearbeiter: '' });
  const [nf, setNf] = useState({ akte_id: '', bezeichnung: '', art: 'notfrist', frist_datum: H, vorfrist_tage: '7', verantwortlich: '' });
  const [rech, setRech] = useState({ entstehung: '', jahre: '3' });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [a, f] = await Promise.all([
        supabase.from('kanzlei_akte').select('*').order('angelegt_am', { ascending: false }),
        supabase.from('kanzlei_frist').select('*').order('frist_datum', { ascending: true }),
      ]);
      setAkten((a.data as Akte[]) ?? []);
      setFristen((f.data as Frist[]) ?? []);
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
      setAussteller(str(meta.firmenname) || str(meta.firma) || str(meta.name) || str(meta.kanzlei) || null);
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const zf = useMemo(() => zaehleFristen(fristen, new Date()), [fristen]);
  const kennzahlen = useMemo(() => ({ akten: akten.filter((a) => a.status !== 'abgeschlossen').length, ...zf }), [akten, zf]);
  const akteById = useCallback((id: string) => akten.find((x) => x.id === id), [akten]);
  const offeneAkten = akten.filter((a) => a.status !== 'abgeschlossen');
  const rechnerEnde = useMemo(() => (rech.entstehung ? verjaehrungEnde(rech.entstehung, Math.round(num(rech.jahre)) || 3) : null), [rech]);

  async function akteAnlegen() {
    if (!uid || !na.mandant.trim()) { setFehler('Bitte mindestens den Mandanten angeben.'); return; }
    setBusy('akte'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kanzlei_akte').insert({
        owner_user_id: uid, aktenzeichen: na.aktenzeichen.trim() || null, mandant: na.mandant.trim(), gegner: na.gegner.trim() || null,
        rechtsgebiet: na.rechtsgebiet.trim() || null, gegenstandswert: na.gegenstandswert.trim() ? num(na.gegenstandswert) : null,
        sachbearbeiter: na.sachbearbeiter.trim() || null, status: 'offen', angelegt_am: H,
      });
      if (error) throw error;
      setNa({ aktenzeichen: '', mandant: '', gegner: '', rechtsgebiet: '', gegenstandswert: '', sachbearbeiter: '' });
      setOk('Akte angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function fristAnlegen() {
    if (!uid || !nf.akte_id) { setFehler('Bitte eine Akte wählen.'); return; }
    if (!nf.bezeichnung.trim()) { setFehler('Bitte die Frist benennen.'); return; }
    if (!nf.frist_datum) { setFehler('Bitte ein Fristdatum angeben.'); return; }
    setBusy('frist'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kanzlei_frist').insert({
        owner_user_id: uid, akte_id: nf.akte_id, bezeichnung: nf.bezeichnung.trim(), art: nf.art, frist_datum: nf.frist_datum,
        vorfrist_tage: Math.round(num(nf.vorfrist_tage)) || VORFRIST_TAGE_STD, verantwortlich: nf.verantwortlich.trim() || null, erledigt: false,
      });
      if (error) throw error;
      setNf({ akte_id: '', bezeichnung: '', art: 'notfrist', frist_datum: H, vorfrist_tage: '7', verantwortlich: '' });
      setOk('Frist eingetragen.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function fristErledigt(f: Frist) {
    setBusy(f.id); setFehler(null);
    try {
      const { error } = await supabase.from('kanzlei_frist').update({ erledigt: true, erledigt_am: H }).eq('id', f.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Aktualisieren fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function verjaehrungUebernehmen() {
    if (!rechnerEnde) return;
    setNf((f) => ({ ...f, bezeichnung: f.bezeichnung || 'Verjährung (Regelverjährung §195 BGB)', art: 'verjaehrung', frist_datum: rechnerEnde }));
    setOk('Verjährungsende ins Fristformular übernommen — jetzt Akte wählen und speichern.');
  }

  function fristenlisteErstellen() {
    const heute = new Date();
    const offen = fristen.filter((f) => !f.erledigt).map((f) => {
      const a = akteById(f.akte_id);
      return {
        frist_datum: f.frist_datum,
        akte: a ? (a.aktenzeichen || a.mandant) : '—',
        bezeichnung: f.bezeichnung, art: ART_LABEL[f.art] ?? f.art,
        verantwortlich: f.verantwortlich, restTage: restTage(f.frist_datum, heute),
      };
    }).sort((x, z) => x.restTage - z.restTage);
    if (!offen.length) { setOk('Keine offenen Fristen — nichts zu drucken.'); return; }
    fristenlistePdf({ stand: H, aussteller, eintraege: offen });
  }

  function FristBadge({ f }: { f: Frist }) {
    const st = fristStatus(f.frist_datum, f.vorfrist_tage, f.erledigt, new Date());
    const m = STATUS_META[st];
    return <span style={{ ...styles.badge, color: m.farbe, borderColor: m.farbe }}>{m.label}</span>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Kanzlei</div>
      <h1 style={styles.h1}>⚖️ Akten & Fristen</h1>
      <p style={styles.sub}>Mandate und Fristen an einem Ort — mit Vorfrist-Ampel und Verjährungs-Rechner, damit keine Notfrist und keine Verjährung durchrutscht.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Offene Fristen" value={String(kennzahlen.offen)} accent={C.text} />
        <Kpi label="Überfällig" value={String(kennzahlen.ueberfaellig)} accent={kennzahlen.ueberfaellig > 0 ? C.danger : C.green} />
        <Kpi label="In Vorfrist" value={String(kennzahlen.vorfrist)} accent={kennzahlen.vorfrist > 0 ? C.warn : C.green} />
        <Kpi label="Aktive Akten" value={String(kennzahlen.akten)} accent={C.cyan} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Kanzlei" regel={augeKanzlei(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'fristen' ? styles.tabAn : {}) }} onClick={() => setTab('fristen')}>⏰ Fristen</button>
        <button style={{ ...styles.tab, ...(tab === 'akten' ? styles.tabAn : {}) }} onClick={() => setTab('akten')}>📁 Akten</button>
      </div>

      {/* ---------- FRISTEN ---------- */}
      {tab === 'fristen' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Frist eintragen <span style={styles.frist}>Vorfrist = Vorwarnfenster in Tagen</span>
              <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55`, marginLeft: 'auto' }} onClick={fristenlisteErstellen}>📄 Fristenliste</button>
            </div>
            {offeneAkten.length === 0 ? <div style={styles.hint}>Lege zuerst im Reiter „Akten" ein Mandat an.</div> : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Akte
                    <select style={styles.inp} value={nf.akte_id} onChange={(e) => setNf({ ...nf, akte_id: e.target.value })}>
                      <option value="">— wählen —</option>
                      {offeneAkten.map((a) => <option key={a.id} value={a.id}>{a.aktenzeichen ? `${a.aktenzeichen} · ` : ''}{a.mandant}{a.gegner ? ` ./. ${a.gegner}` : ''}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={nf.bezeichnung} onChange={(e) => setNf({ ...nf, bezeichnung: e.target.value })} placeholder="z. B. Berufungsbegründung" /></label>
                  <label style={styles.lab}>Art
                    <select style={styles.inp} value={nf.art} onChange={(e) => setNf({ ...nf, art: e.target.value })}>
                      {FRIST_ARTEN.map((a) => <option key={a} value={a}>{ART_LABEL[a]}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Fristdatum<input type="date" style={styles.inp} value={nf.frist_datum} onChange={(e) => setNf({ ...nf, frist_datum: e.target.value })} /></label>
                  <label style={styles.lab}>Vorfrist (Tage)<input style={styles.inp} inputMode="numeric" value={nf.vorfrist_tage} onChange={(e) => setNf({ ...nf, vorfrist_tage: e.target.value })} /></label>
                  <label style={styles.lab}>Verantwortlich<input style={styles.inp} value={nf.verantwortlich} onChange={(e) => setNf({ ...nf, verantwortlich: e.target.value })} /></label>
                </div>
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'frist' ? 0.6 : 1 }} disabled={busy === 'frist'} onClick={fristAnlegen}>＋ Eintragen</button>
              </>
            )}
          </div>

          {/* Verjährungs-Rechner */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={styles.cardTitel}>Verjährungs-Rechner <span style={styles.frist}>Regelverjährung §195/§199 BGB</span></div>
            <div style={styles.grid}>
              <label style={styles.lab}>Anspruch entstanden am<input type="date" style={styles.inp} value={rech.entstehung} onChange={(e) => setRech({ ...rech, entstehung: e.target.value })} /></label>
              <label style={styles.lab}>Verjährung (Jahre)<input style={styles.inp} inputMode="numeric" value={rech.jahre} onChange={(e) => setRech({ ...rech, jahre: e.target.value })} /></label>
            </div>
            {rechnerEnde && (
              <div style={{ ...styles.vorschau, marginTop: 12 }}>
                <span>Verjährungsende: <b style={{ color: C.gold }}>{fmtDatum(rechnerEnde)}</b> <span style={{ color: C.textDim }}>(31.12. des Jahres Entstehung + {Math.round(num(rech.jahre)) || 3})</span></span>
                <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55`, marginLeft: 12 }} onClick={verjaehrungUebernehmen}>Als Frist übernehmen</button>
              </div>
            )}
          </div>

          {!laden && (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {fristen.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>Noch keine Fristen.</div> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Frist</th><th style={styles.th}>Akte</th><th style={styles.th}>Bezeichnung</th><th style={styles.th}>Art</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th></tr></thead>
                  <tbody>
                    {fristen.map((f) => {
                      const a = akteById(f.akte_id);
                      const rest = restTage(f.frist_datum, new Date());
                      return (
                        <tr key={f.id} style={{ opacity: f.erledigt ? 0.5 : 1 }}>
                          <td style={styles.td}>{fmtDatum(f.frist_datum)}{!f.erledigt && <div style={{ color: C.textDim, fontSize: 'clamp(11px,0.9vw,14px)' }}>{rest < 0 ? `${Math.abs(rest)} T über` : rest === 0 ? 'heute' : `in ${rest} T`}</div>}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>{a ? (a.aktenzeichen || a.mandant) : '—'}</td>
                          <td style={styles.td}>{f.bezeichnung}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>{ART_LABEL[f.art] || f.art}</td>
                          <td style={styles.td}><FristBadge f={f} /></td>
                          <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {!f.erledigt && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === f.id} onClick={() => fristErledigt(f)}>✓ erledigt</button>}
                            {f.erledigt && f.erledigt_am && <span style={{ color: C.textDim }}>{fmtDatum(f.erledigt_am)}</span>}
                          </td>
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

      {/* ---------- AKTEN ---------- */}
      {tab === 'akten' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Akte anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Aktenzeichen<input style={styles.inp} value={na.aktenzeichen} onChange={(e) => setNa({ ...na, aktenzeichen: e.target.value })} placeholder="z. B. 042/2026" /></label>
              <label style={styles.lab}>Mandant<input style={styles.inp} value={na.mandant} onChange={(e) => setNa({ ...na, mandant: e.target.value })} /></label>
              <label style={styles.lab}>Gegner<input style={styles.inp} value={na.gegner} onChange={(e) => setNa({ ...na, gegner: e.target.value })} /></label>
              <label style={styles.lab}>Rechtsgebiet<input style={styles.inp} value={na.rechtsgebiet} onChange={(e) => setNa({ ...na, rechtsgebiet: e.target.value })} placeholder="z. B. Arbeitsrecht" /></label>
              <label style={styles.lab}>Gegenstandswert (€)<input style={styles.inp} inputMode="decimal" value={na.gegenstandswert} onChange={(e) => setNa({ ...na, gegenstandswert: e.target.value })} /></label>
              <label style={styles.lab}>Sachbearbeiter<input style={styles.inp} value={na.sachbearbeiter} onChange={(e) => setNa({ ...na, sachbearbeiter: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'akte' ? 0.6 : 1 }} disabled={busy === 'akte'} onClick={akteAnlegen}>＋ Anlegen</button>
          </div>
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {akten.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>Noch keine Akten.</div> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Aktenzeichen</th><th style={styles.th}>Mandant ./. Gegner</th><th style={styles.th}>Rechtsgebiet</th><th style={{ ...styles.th, textAlign: 'right' }}>Streitwert</th><th style={styles.th}>Status</th></tr></thead>
                  <tbody>
                    {akten.map((a) => (
                      <tr key={a.id} style={{ opacity: a.status === 'abgeschlossen' ? 0.5 : 1 }}>
                        <td style={styles.td}>{a.aktenzeichen || '—'}</td>
                        <td style={styles.td}>{a.mandant}{a.gegner ? <span style={{ color: C.textDim }}> ./. {a.gegner}</span> : ''}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{a.rechtsgebiet || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{eur(a.gegenstandswert)}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' },
  frist: { fontSize: 'clamp(11px, 1vw, 15px)', color: C.textDim, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  vorschau: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
