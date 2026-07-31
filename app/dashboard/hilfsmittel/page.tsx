'use client';

// ============================================================
// ARGONAUT OS · A12 · Hilfsmittel-Versorgung
// Versorgungen (Sanitätshaus/Orthopädietechnik) mit Verordnung →
// Kostenvoranschlag → Genehmigung → Versorgung, Positionen mit HMV-Nummer
// und Mehrkosten. Logik aus lib/hilfsmittel (0 €, node-getestet).
// Pfad: app/dashboard/hilfsmittel/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { VERSORGUNG_STATUS, kvSumme, mehrkostenSumme, gesamtSumme, hmvGueltig, zaehleVersorgung } from '@/lib/hilfsmittel';
import Leerzustand from '../_components/Leerzustand';
import { augeHilfsmittel } from '@/lib/auge';
import { kvPdf } from '@/lib/kvPdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Versorgung = { id: string; versicherter: string; versicherten_nr: string | null; krankenkasse: string | null; arzt: string | null; verordnung_datum: string | null; diagnose: string | null; status: string; genehmigt_am: string | null; kv_nummer: string | null; notiz: string | null };
type Position = { id: string; versorgung_id: string; position: number; hmv_nummer: string | null; bezeichnung: string | null; menge: number; einzelpreis: number; mehrkosten: number };

const STATUS_LABEL: Record<string, string> = { verordnet: 'Verordnet', kv_gesendet: 'KV gesendet', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt', versorgt: 'Versorgt', abgerechnet: 'Abgerechnet' };
const STATUS_FARBE: Record<string, string> = { verordnet: C.textDim, kv_gesendet: C.cyan, genehmigt: C.green, abgelehnt: C.danger, versorgt: C.gold, abgerechnet: C.green };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export default function HilfsmittelPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState<{ name: string | null; anschrift: string | null; ort: string | null }>({ name: null, anschrift: null, ort: null });
  const [tab, setTab] = useState<'liste' | 'bearbeiten'>('liste');
  const [versorgungen, setVersorgungen] = useState<Versorgung[]>([]);
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [aktivId, setAktivId] = useState<string>('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = heuteLokal();

  const [nv, setNv] = useState({ versicherter: '', versicherten_nr: '', krankenkasse: '', arzt: '', verordnung_datum: H, diagnose: '' });
  const [np, setNp] = useState({ hmv_nummer: '', bezeichnung: '', menge: '1', einzelpreis: '', mehrkosten: '' });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [v, p] = await Promise.all([
        supabase.from('hilfsmittel_versorgung').select('*').order('erstellt_am', { ascending: false }),
        supabase.from('hilfsmittel_position').select('*').order('position', { ascending: true }),
      ]);
      setVersorgungen((v.data as Versorgung[]) ?? []);
      setPositionen((p.data as Position[]) ?? []);
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
      setAussteller({ name: str(meta.firmenname) || str(meta.firma) || str(meta.name) || null, anschrift: str(meta.anschrift) || null, ort: str(meta.ort) || str(meta.stadt) || null });
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const kennzahlen = useMemo(() => zaehleVersorgung(versorgungen), [versorgungen]);
  const vById = useCallback((id: string) => versorgungen.find((x) => x.id === id), [versorgungen]);
  const aktiv = vById(aktivId);
  const aktivPos = useMemo(() => positionen.filter((p) => p.versorgung_id === aktivId), [positionen, aktivId]);

  async function versorgungAnlegen() {
    if (!uid || !nv.versicherter.trim()) { setFehler('Bitte den Versicherten angeben.'); return; }
    setBusy('versorgung'); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('hilfsmittel_versorgung').insert({
        owner_user_id: uid, versicherter: nv.versicherter.trim(), versicherten_nr: nv.versicherten_nr.trim() || null, krankenkasse: nv.krankenkasse.trim() || null,
        arzt: nv.arzt.trim() || null, verordnung_datum: nv.verordnung_datum || null, diagnose: nv.diagnose.trim() || null, status: 'verordnet',
      }).select('id').single();
      if (error) throw error;
      setNv({ versicherter: '', versicherten_nr: '', krankenkasse: '', arzt: '', verordnung_datum: H, diagnose: '' });
      setOk('Versorgung angelegt.'); await laden_();
      if (data?.id) { setAktivId(data.id); setTab('bearbeiten'); }
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function positionAnlegen() {
    if (!uid || !aktivId) { setFehler('Bitte eine Versorgung wählen.'); return; }
    if (!np.bezeichnung.trim() && !np.hmv_nummer.trim()) { setFehler('Bitte Bezeichnung oder HMV-Nummer angeben.'); return; }
    setBusy('position'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('hilfsmittel_position').insert({
        owner_user_id: uid, versorgung_id: aktivId, position: aktivPos.length + 1, hmv_nummer: np.hmv_nummer.trim() || null, bezeichnung: np.bezeichnung.trim() || null,
        menge: num(np.menge) || 1, einzelpreis: num(np.einzelpreis), mehrkosten: num(np.mehrkosten),
      });
      if (error) throw error;
      setNp({ hmv_nummer: '', bezeichnung: '', menge: '1', einzelpreis: '', mehrkosten: '' });
      setOk('Position hinzugefügt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function positionLoeschen(p: Position) {
    setBusy(p.id); setFehler(null);
    try { const { error } = await supabase.from('hilfsmittel_position').delete().eq('id', p.id); if (error) throw error; await laden_(); }
    catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function statusSetzen(v: Versorgung, status: string) {
    setBusy(v.id); setFehler(null);
    const patch: Record<string, unknown> = { status };
    if (status === 'genehmigt') patch.genehmigt_am = H;
    try { const { error } = await supabase.from('hilfsmittel_versorgung').update(patch).eq('id', v.id); if (error) throw error; await laden_(); }
    catch (err: unknown) { setFehler('Status fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function kvErstellen(v: Versorgung) {
    const pos = positionen.filter((p) => p.versorgung_id === v.id);
    const nr = v.kv_nummer || `KV-${new Date().getFullYear()}-${String(versorgungen.filter((x) => x.kv_nummer).length + 1).padStart(3, '0')}`;
    kvPdf(aussteller, { versicherter: v.versicherter, versicherten_nr: v.versicherten_nr, krankenkasse: v.krankenkasse, arzt: v.arzt, verordnung_datum: v.verordnung_datum, diagnose: v.diagnose, kv_nummer: nr }, pos);
    setBusy(v.id); setFehler(null); setOk(null);
    try {
      if (!v.kv_nummer || v.status === 'verordnet') {
        const patch: Record<string, unknown> = { kv_nummer: nr };
        if (v.status === 'verordnet') patch.status = 'kv_gesendet';
        const { error } = await supabase.from('hilfsmittel_versorgung').update(patch).eq('id', v.id);
        if (error) throw error;
        await laden_();
      }
      setOk('Kostenvoranschlag erstellt.');
    } catch (err: unknown) { setFehler('Aktualisieren fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const npHmvWarnung = np.hmv_nummer.trim() !== '' && !hmvGueltig(np.hmv_nummer);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Hilfsmittel</div>
      <h1 style={styles.h1}>🦽 Hilfsmittel-Versorgung</h1>
      <p style={styles.sub}>Versorgungen von der Verordnung über den Kostenvoranschlag bis zur Abrechnung — mit HMV-Nummer (§139 SGB V), Kassenanteil und Mehrkosten.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Offen" value={String(kennzahlen.offen)} accent={kennzahlen.offen > 0 ? C.warn : C.green} />
        <Kpi label="Wartet auf Genehmigung" value={String(kennzahlen.wartetGenehmigung)} accent={kennzahlen.wartetGenehmigung > 0 ? C.cyan : C.green} />
        <Kpi label="Abgerechnet" value={String(kennzahlen.abgerechnet)} accent={C.green} />
        <Kpi label="Gesamt" value={String(kennzahlen.gesamt)} accent={C.text} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Hilfsmittel" regel={augeHilfsmittel(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'liste' ? styles.tabAn : {}) }} onClick={() => setTab('liste')}>📁 Versorgungen</button>
        <button style={{ ...styles.tab, ...(tab === 'bearbeiten' ? styles.tabAn : {}) }} onClick={() => setTab('bearbeiten')}>✍ Bearbeiten</button>
      </div>

      {/* ---------- LISTE ---------- */}
      {tab === 'liste' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Versorgung anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Versicherter<input style={styles.inp} value={nv.versicherter} onChange={(e) => setNv({ ...nv, versicherter: e.target.value })} /></label>
              <label style={styles.lab}>Versicherten-Nr.<input style={styles.inp} value={nv.versicherten_nr} onChange={(e) => setNv({ ...nv, versicherten_nr: e.target.value })} /></label>
              <label style={styles.lab}>Krankenkasse<input style={styles.inp} value={nv.krankenkasse} onChange={(e) => setNv({ ...nv, krankenkasse: e.target.value })} /></label>
              <label style={styles.lab}>Verordnender Arzt<input style={styles.inp} value={nv.arzt} onChange={(e) => setNv({ ...nv, arzt: e.target.value })} /></label>
              <label style={styles.lab}>Verordnung vom<input type="date" style={styles.inp} value={nv.verordnung_datum} onChange={(e) => setNv({ ...nv, verordnung_datum: e.target.value })} /></label>
              <label style={styles.lab}>Diagnose<input style={styles.inp} value={nv.diagnose} onChange={(e) => setNv({ ...nv, diagnose: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'versorgung' ? 0.6 : 1 }} disabled={busy === 'versorgung'} onClick={versorgungAnlegen}>＋ Anlegen & öffnen</button>
          </div>
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {versorgungen.length === 0 ? <Leerzustand icon="🦽" titel="Noch keine Versorgungen" text="Erfasse Hilfsmittel-Versorgungen von der Verordnung bis zur Genehmigung." schritte={["Versorgung oben anlegen", "Positionen mit HMV-Nummer erfassen", "Kostenvoranschlag und Genehmigung dokumentieren"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Versicherter</th><th style={styles.th}>Krankenkasse</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th></tr></thead>
                  <tbody>
                    {versorgungen.map((v) => (
                      <tr key={v.id}>
                        <td style={styles.td}>{v.versicherter}<div style={{ color: C.textDim, fontSize: 'clamp(12px,0.95vw,15px)' }}>{v.diagnose || ''}</div></td>
                        <td style={{ ...styles.td, color: C.textDim }}>{v.krankenkasse || '—'}</td>
                        <td style={styles.td}><span style={{ ...styles.badge, color: STATUS_FARBE[v.status] || C.textDim, borderColor: STATUS_FARBE[v.status] || C.border }}>{STATUS_LABEL[v.status] || v.status}</span></td>
                        <td style={{ ...styles.td, textAlign: 'right' }}><button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} onClick={() => { setAktivId(v.id); setTab('bearbeiten'); }}>öffnen ›</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- BEARBEITEN ---------- */}
      {tab === 'bearbeiten' && (
        <>
          <div style={styles.card}>
            <label style={styles.lab}>Versorgung
              <select style={styles.inp} value={aktivId} onChange={(e) => setAktivId(e.target.value)}>
                <option value="">— wählen —</option>
                {versorgungen.map((v) => <option key={v.id} value={v.id}>{v.versicherter}{v.krankenkasse ? ` · ${v.krankenkasse}` : ''}</option>)}
              </select>
            </label>
            {aktiv && (
              <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: C.textDim, fontSize: 'clamp(13px,1.1vw,17px)' }}>Kassenanteil {eur(kvSumme(aktivPos))} · Mehrkosten {eur(mehrkostenSumme(aktivPos))} · Gesamt {eur(gesamtSumme(aktivPos))}</span>
                <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55`, marginLeft: 'auto' }} disabled={busy === aktiv.id} onClick={() => kvErstellen(aktiv)}>📄 Kostenvoranschlag</button>
                <label style={{ ...styles.lab, flexDirection: 'row', alignItems: 'center', gap: 8 }}>Status
                  <select style={{ ...styles.inp, width: 'auto' }} value={aktiv.status} onChange={(e) => statusSetzen(aktiv, e.target.value)} disabled={busy === aktiv.id}>
                    {VERSORGUNG_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>

          {aktiv && (
            <>
              <div style={{ ...styles.card, marginTop: 16 }}>
                <div style={styles.cardTitel}>Hilfsmittel-Position hinzufügen</div>
                <div style={styles.grid}>
                  <label style={styles.lab}>HMV-Nummer (10-stellig)<input style={styles.inp} value={np.hmv_nummer} onChange={(e) => setNp({ ...np, hmv_nummer: e.target.value })} placeholder="z. B. 24.99.01.0001" /></label>
                  <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={np.bezeichnung} onChange={(e) => setNp({ ...np, bezeichnung: e.target.value })} /></label>
                  <label style={styles.lab}>Menge<input style={styles.inp} inputMode="decimal" value={np.menge} onChange={(e) => setNp({ ...np, menge: e.target.value })} /></label>
                  <label style={styles.lab}>Kassenanteil / Preis (€)<input style={styles.inp} inputMode="decimal" value={np.einzelpreis} onChange={(e) => setNp({ ...np, einzelpreis: e.target.value })} /></label>
                  <label style={styles.lab}>Mehrkosten (€)<input style={styles.inp} inputMode="decimal" value={np.mehrkosten} onChange={(e) => setNp({ ...np, mehrkosten: e.target.value })} /></label>
                </div>
                {npHmvWarnung && <div style={{ color: C.warn, marginTop: 8, fontSize: 'clamp(13px,1.1vw,17px)' }}>⚠ Die HMV-Nummer sollte 10 Ziffern haben (Punkte erlaubt).</div>}
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'position' ? 0.6 : 1 }} disabled={busy === 'position'} onClick={positionAnlegen}>＋ Hinzufügen</button>
              </div>

              {aktivPos.length > 0 && (
                <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead><tr><th style={styles.th}>HMV-Nr.</th><th style={styles.th}>Bezeichnung</th><th style={{ ...styles.th, textAlign: 'right' }}>Menge</th><th style={{ ...styles.th, textAlign: 'right' }}>Kasse</th><th style={{ ...styles.th, textAlign: 'right' }}>Mehrk.</th><th style={{ ...styles.th, textAlign: 'right' }}></th></tr></thead>
                    <tbody>
                      {aktivPos.map((p) => (
                        <tr key={p.id}>
                          <td style={styles.td}>{p.hmv_nummer || '—'}{p.hmv_nummer && !hmvGueltig(p.hmv_nummer) ? <span style={{ color: C.warn }}> ⚠</span> : null}</td>
                          <td style={styles.td}>{p.bezeichnung || '—'}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{p.menge}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{eur(p.einzelpreis)}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: p.mehrkosten > 0 ? C.warn : C.textDim }}>{eur(p.mehrkosten)}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}><button style={{ ...styles.mini, color: C.danger, borderColor: `${C.danger}55` }} disabled={busy === p.id} onClick={() => positionLoeschen(p)}>löschen</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
