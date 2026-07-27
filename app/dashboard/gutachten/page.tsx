'use client';

// ============================================================
// ARGONAUT OS · A11 · Gutachten / Sachverständige
// Strukturierte Gutachten (Kopf + Positionen Befund/Bewertung) mit
// JVEG-Honorar-Rechner. Logik aus lib/gutachten (0 €, node-getestet).
// Pfad: app/dashboard/gutachten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { HONORARGRUPPEN, KATEGORIEN, honorar, honorarsatz, summePositionen, zaehleGutachten } from '@/lib/gutachten';
import { augeGutachten } from '@/lib/auge';
import { gutachtenPdf } from '@/lib/gutachtenPdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Gutachten = { id: string; titel: string; auftraggeber: string | null; objekt: string | null; art: string | null; aktenzeichen: string | null; datum: string; gutachter: string | null; honorargruppe: string | null; stunden: number | null; zusammenfassung: string | null; status: string; notiz: string | null };
type Position = { id: string; gutachten_id: string; position: number; kategorie: string; titel: string | null; text: string | null; betrag: number | null };

const KAT_LABEL: Record<string, string> = { befund: 'Befund', bewertung: 'Bewertung', mangel: 'Mangel', empfehlung: 'Empfehlung' };
const KAT_FARBE: Record<string, string> = { befund: C.cyan, bewertung: C.gold, mangel: C.danger, empfehlung: C.green };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export default function GutachtenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [ausstellerOrt, setAusstellerOrt] = useState<string | null>(null);
  const [tab, setTab] = useState<'liste' | 'bearbeiten'>('liste');
  const [gutachten, setGutachten] = useState<Gutachten[]>([]);
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [aktivId, setAktivId] = useState<string>('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = heuteLokal();

  const [ng, setNg] = useState({ titel: '', auftraggeber: '', objekt: '', art: '', aktenzeichen: '', datum: H, gutachter: '', honorargruppe: '', stunden: '', zusammenfassung: '' });
  const [np, setNp] = useState({ kategorie: 'befund', titel: '', text: '', betrag: '' });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [g, p] = await Promise.all([
        supabase.from('gutachten').select('*').order('datum', { ascending: false }),
        supabase.from('gutachten_position').select('*').order('position', { ascending: true }),
      ]);
      setGutachten((g.data as Gutachten[]) ?? []);
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
      setAusstellerOrt(str(meta.ort) || str(meta.stadt) || str(meta.firmenort) || null);
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const kennzahlen = useMemo(() => zaehleGutachten(gutachten), [gutachten]);
  const gById = useCallback((id: string) => gutachten.find((x) => x.id === id), [gutachten]);
  const aktiv = gById(aktivId);
  const aktivPos = useMemo(() => positionen.filter((p) => p.gutachten_id === aktivId), [positionen, aktivId]);
  const ngHonorar = useMemo(() => (ng.honorargruppe && num(ng.stunden) > 0 ? honorar(ng.honorargruppe, num(ng.stunden)) : null), [ng.honorargruppe, ng.stunden]);
  const aktivHonorar = useMemo(() => (aktiv?.honorargruppe && aktiv?.stunden ? honorar(aktiv.honorargruppe, aktiv.stunden) : null), [aktiv]);

  async function gutachtenAnlegen() {
    if (!uid || !ng.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setBusy('gutachten'); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('gutachten').insert({
        owner_user_id: uid, titel: ng.titel.trim(), auftraggeber: ng.auftraggeber.trim() || null, objekt: ng.objekt.trim() || null,
        art: ng.art.trim() || null, aktenzeichen: ng.aktenzeichen.trim() || null, datum: ng.datum, gutachter: ng.gutachter.trim() || null,
        honorargruppe: ng.honorargruppe || null, stunden: ng.stunden.trim() ? num(ng.stunden) : null, zusammenfassung: ng.zusammenfassung.trim() || null, status: 'entwurf',
      }).select('id').single();
      if (error) throw error;
      setNg({ titel: '', auftraggeber: '', objekt: '', art: '', aktenzeichen: '', datum: H, gutachter: '', honorargruppe: '', stunden: '', zusammenfassung: '' });
      setOk('Gutachten angelegt.'); await laden_();
      if (data?.id) { setAktivId(data.id); setTab('bearbeiten'); }
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function positionAnlegen() {
    if (!uid || !aktivId) { setFehler('Bitte ein Gutachten wählen.'); return; }
    if (!np.titel.trim() && !np.text.trim()) { setFehler('Bitte Titel oder Text angeben.'); return; }
    setBusy('position'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('gutachten_position').insert({
        owner_user_id: uid, gutachten_id: aktivId, position: aktivPos.length + 1, kategorie: np.kategorie,
        titel: np.titel.trim() || null, text: np.text.trim() || null, betrag: np.betrag.trim() ? num(np.betrag) : null,
      });
      if (error) throw error;
      setNp({ kategorie: 'befund', titel: '', text: '', betrag: '' });
      setOk('Position hinzugefügt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function positionLoeschen(p: Position) {
    setBusy(p.id); setFehler(null);
    try { const { error } = await supabase.from('gutachten_position').delete().eq('id', p.id); if (error) throw error; await laden_(); }
    catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function pdfErstellen(g: Gutachten) {
    const pos = positionen.filter((p) => p.gutachten_id === g.id);
    gutachtenPdf({
      titel: g.titel, auftraggeber: g.auftraggeber, objekt: g.objekt, art: g.art, aktenzeichen: g.aktenzeichen,
      datum: g.datum, gutachter: g.gutachter, honorargruppe: g.honorargruppe, stunden: g.stunden,
      zusammenfassung: g.zusammenfassung, aussteller_ort: ausstellerOrt,
    }, pos);
  }

  async function statusToggle(g: Gutachten) {
    setBusy(g.id); setFehler(null);
    try {
      const { error } = await supabase.from('gutachten').update({ status: g.status === 'fertig' ? 'entwurf' : 'fertig' }).eq('id', g.id);
      if (error) throw error; await laden_();
    } catch (err: unknown) { setFehler('Status fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Gutachten</div>
      <h1 style={styles.h1}>📑 Gutachten & Sachverständige</h1>
      <p style={styles.sub}>Gutachten strukturiert erstellen — Befund und Bewertung getrennt, mit Positions-Beträgen und JVEG-Honorar (Honorargruppe × Stunden).</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Gutachten" value={String(kennzahlen.gesamt)} accent={C.text} />
        <Kpi label="In Arbeit" value={String(kennzahlen.entwurf)} accent={kennzahlen.entwurf > 0 ? C.warn : C.green} />
        <Kpi label="Fertig" value={String(kennzahlen.fertig)} accent={C.green} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Gutachten" regel={augeGutachten(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'liste' ? styles.tabAn : {}) }} onClick={() => setTab('liste')}>📁 Gutachten</button>
        <button style={{ ...styles.tab, ...(tab === 'bearbeiten' ? styles.tabAn : {}) }} onClick={() => setTab('bearbeiten')}>✍ Bearbeiten</button>
      </div>

      {/* ---------- LISTE ---------- */}
      {tab === 'liste' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Gutachten anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Titel<input style={styles.inp} value={ng.titel} onChange={(e) => setNg({ ...ng, titel: e.target.value })} placeholder="z. B. Schadensgutachten Fahrzeug" /></label>
              <label style={styles.lab}>Auftraggeber<input style={styles.inp} value={ng.auftraggeber} onChange={(e) => setNg({ ...ng, auftraggeber: e.target.value })} /></label>
              <label style={styles.lab}>Objekt<input style={styles.inp} value={ng.objekt} onChange={(e) => setNg({ ...ng, objekt: e.target.value })} placeholder="z. B. Pkw, Kennzeichen …" /></label>
              <label style={styles.lab}>Art<input style={styles.inp} value={ng.art} onChange={(e) => setNg({ ...ng, art: e.target.value })} placeholder="Schaden / Wert / Bau …" /></label>
              <label style={styles.lab}>Aktenzeichen<input style={styles.inp} value={ng.aktenzeichen} onChange={(e) => setNg({ ...ng, aktenzeichen: e.target.value })} /></label>
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={ng.datum} onChange={(e) => setNg({ ...ng, datum: e.target.value })} /></label>
              <label style={styles.lab}>Gutachter<input style={styles.inp} value={ng.gutachter} onChange={(e) => setNg({ ...ng, gutachter: e.target.value })} /></label>
              <label style={styles.lab}>JVEG-Honorargruppe
                <select style={styles.inp} value={ng.honorargruppe} onChange={(e) => setNg({ ...ng, honorargruppe: e.target.value })}>
                  <option value="">— optional —</option>
                  {HONORARGRUPPEN.map((k) => <option key={k} value={k}>Gruppe {k} ({honorarsatz(k)} €/h)</option>)}
                </select>
              </label>
              <label style={styles.lab}>Stunden<input style={styles.inp} inputMode="decimal" value={ng.stunden} onChange={(e) => setNg({ ...ng, stunden: e.target.value })} /></label>
            </div>
            <label style={{ ...styles.lab, marginTop: 12 }}>Zusammenfassung / Fazit<textarea style={{ ...styles.inp, minHeight: 60, resize: 'vertical' }} value={ng.zusammenfassung} onChange={(e) => setNg({ ...ng, zusammenfassung: e.target.value })} /></label>
            {ngHonorar != null && <div style={{ ...styles.vorschau, marginTop: 12 }}><span>JVEG-Honorar: <b style={{ color: C.gold }}>{eur(ngHonorar)}</b> <span style={{ color: C.textDim }}>({honorarsatz(ng.honorargruppe)} €/h × {num(ng.stunden)} h)</span></span></div>}
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'gutachten' ? 0.6 : 1 }} disabled={busy === 'gutachten'} onClick={gutachtenAnlegen}>＋ Anlegen & öffnen</button>
          </div>
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {gutachten.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>Noch keine Gutachten.</div> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Datum</th><th style={styles.th}>Titel</th><th style={styles.th}>Auftraggeber</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th></tr></thead>
                  <tbody>
                    {gutachten.map((g) => (
                      <tr key={g.id} style={{ opacity: g.status === 'fertig' ? 0.85 : 1 }}>
                        <td style={styles.td}>{fmtDatum(g.datum)}</td>
                        <td style={styles.td}>{g.titel}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{g.auftraggeber || '—'}</td>
                        <td style={styles.td}><span style={{ ...styles.badge, color: g.status === 'fertig' ? C.green : C.warn, borderColor: g.status === 'fertig' ? C.green : C.warn }}>{g.status === 'fertig' ? 'fertig' : 'Entwurf'}</span></td>
                        <td style={{ ...styles.td, textAlign: 'right' }}><button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} onClick={() => { setAktivId(g.id); setTab('bearbeiten'); }}>öffnen ›</button></td>
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
            <label style={styles.lab}>Gutachten
              <select style={styles.inp} value={aktivId} onChange={(e) => setAktivId(e.target.value)}>
                <option value="">— wählen —</option>
                {gutachten.map((g) => <option key={g.id} value={g.id}>{fmtDatum(g.datum)} · {g.titel}</option>)}
              </select>
            </label>
            {aktiv && (
              <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: C.textDim, fontSize: 'clamp(13px,1.1vw,17px)' }}>{aktiv.objekt || ''}{aktiv.art ? ` · ${aktiv.art}` : ''}{aktivHonorar != null ? ` · Honorar ${eur(aktivHonorar)}` : ''} · Positionen-Summe {eur(summePositionen(aktivPos))}</span>
                <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55`, marginLeft: 'auto' }} onClick={() => pdfErstellen(aktiv)}>📄 Gutachten-PDF</button>
                <button style={{ ...styles.mini, color: aktiv.status === 'fertig' ? C.warn : C.green, borderColor: `${aktiv.status === 'fertig' ? C.warn : C.green}55` }} disabled={busy === aktiv.id} onClick={() => statusToggle(aktiv)}>{aktiv.status === 'fertig' ? '↩ auf Entwurf' : '✓ fertigstellen'}</button>
              </div>
            )}
          </div>

          {aktiv && (
            <>
              <div style={{ ...styles.card, marginTop: 16 }}>
                <div style={styles.cardTitel}>Position hinzufügen</div>
                <div style={styles.grid}>
                  <label style={styles.lab}>Kategorie
                    <select style={styles.inp} value={np.kategorie} onChange={(e) => setNp({ ...np, kategorie: e.target.value })}>
                      {KATEGORIEN.map((k) => <option key={k} value={k}>{KAT_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Titel<input style={styles.inp} value={np.titel} onChange={(e) => setNp({ ...np, titel: e.target.value })} /></label>
                  <label style={styles.lab}>Betrag (€, optional)<input style={styles.inp} inputMode="decimal" value={np.betrag} onChange={(e) => setNp({ ...np, betrag: e.target.value })} /></label>
                </div>
                <label style={{ ...styles.lab, marginTop: 12 }}>Text<textarea style={{ ...styles.inp, minHeight: 70, resize: 'vertical' }} value={np.text} onChange={(e) => setNp({ ...np, text: e.target.value })} /></label>
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'position' ? 0.6 : 1 }} disabled={busy === 'position'} onClick={positionAnlegen}>＋ Hinzufügen</button>
              </div>

              {aktivPos.length > 0 && (
                <div style={{ ...styles.card, marginTop: 16 }}>
                  {aktivPos.map((p) => (
                    <div key={p.id} style={styles.pos}>
                      <div style={{ flex: 1 }}>
                        <span style={{ ...styles.badge, color: KAT_FARBE[p.kategorie] || C.textDim, borderColor: KAT_FARBE[p.kategorie] || C.border, marginRight: 8 }}>{KAT_LABEL[p.kategorie] || p.kategorie}</span>
                        <b>{p.titel || ''}</b>
                        {p.text && <div style={{ color: C.textDim, marginTop: 4, fontSize: 'clamp(13px,1.1vw,17px)' }}>{p.text}</div>}
                      </div>
                      {p.betrag != null && <div style={{ color: C.gold, fontWeight: 700, whiteSpace: 'nowrap' }}>{eur(p.betrag)}</div>}
                      <button style={{ ...styles.mini, color: C.danger, borderColor: `${C.danger}55` }} disabled={busy === p.id} onClick={() => positionLoeschen(p)}>löschen</button>
                    </div>
                  ))}
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
  vorschau: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  pos: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid rgba(143,163,190,0.08)' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
