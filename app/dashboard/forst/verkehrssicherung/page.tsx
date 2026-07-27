'use client';

// ============================================================
// ARGONAUT OS · Holzernte-Schäfer · F5 · Verkehrssicherung & Gutachten
// Fällige Kontrollen live aus dem Baumkataster (forst_baeume) mit
// "Kontrolle erledigt"-Knopf (schreibt Protokoll + setzt nächste Kontrolle).
// Ablage für Gutachten/Fällgenehmigungen. Fäll-Sperrfrist-Banner (BNatSchG §39,
// 1. März–30. Sept.) + Hinweis auf kommunale Baumschutzsatzung.
// Pfad: app/dashboard/forst/verkehrssicherung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Baum = { id: string; art: string | null; zustand: string; kontrollintervall_monate: number; letzte_kontrolle: string | null; naechste_kontrolle: string | null; objekt_id: string | null };
type Objekt = { id: string; bezeichnung: string };
type Gutachten = { id: string; objekt_id: string | null; art: string; titel: string; ersteller: string | null; aktenzeichen: string | null; datum: string | null; gueltig_bis: string | null; notiz: string | null };

const GUT_ARTEN: { key: string; label: string }[] = [
  { key: 'kontrollprotokoll', label: '📋 Kontrollprotokoll' },
  { key: 'gutachten', label: '📑 Verkehrssicherheits-Gutachten' },
  { key: 'faellgenehmigung', label: '✅ Fällgenehmigung' },
  { key: 'sonstige', label: '· Sonstige' },
];
function gutLabel(k: string) { return GUT_ARTEN.find((a) => a.key === k)?.label ?? k; }

function heute() { return new Date().toISOString().slice(0, 10); }
function inTagen(tage: number) { const g = new Date(); g.setDate(g.getDate() + tage); return g.toISOString().slice(0, 10); }
function num(s: string) { const n = parseFloat((s || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function plusMonate(iso: string, monate: number) { const dt = new Date(iso); dt.setMonth(dt.getMonth() + monate); return dt.toISOString().slice(0, 10); }
function istSperrfrist(iso: string) { const p = iso.split('-').map(Number); const md = p[1] * 100 + p[2]; return md >= 301 && md <= 930; }

const HEUTE = heute();
const GRENZE_30 = inTagen(30);
const GRENZE_60 = inTagen(60);

type GForm = { id: string | null; art: string; titel: string; objekt_id: string; ersteller: string; aktenzeichen: string; datum: string; gueltig_bis: string; notiz: string };
function leerG(): GForm { return { id: null, art: 'faellgenehmigung', titel: '', objekt_id: '', ersteller: '', aktenzeichen: '', datum: heute(), gueltig_bis: '', notiz: '' }; }

export default function ForstVerkehrssicherungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [baeume, setBaeume] = useState<Baum[]>([]);
  const [objekte, setObjekte] = useState<Objekt[]>([]);
  const [gutachten, setGutachten] = useState<Gutachten[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [gform, setGform] = useState<GForm>(leerG());
  const [speichert, setSpeichert] = useState(false);

  const objektName = useCallback((id: string | null) => objekte.find((o) => o.id === id)?.bezeichnung ?? '—', [objekte]);

  const ladeAlles = useCallback(async () => {
    const [bRes, oRes, gRes] = await Promise.all([
      supabase.from('forst_baeume').select('id, art, zustand, kontrollintervall_monate, letzte_kontrolle, naechste_kontrolle, objekt_id'),
      supabase.from('forst_objekte').select('id, bezeichnung').order('bezeichnung'),
      supabase.from('forst_gutachten').select('id, objekt_id, art, titel, ersteller, aktenzeichen, datum, gueltig_bis, notiz').order('datum', { ascending: false }),
    ]);
    setBaeume((bRes.data as Baum[]) ?? []);
    setObjekte((oRes.data as Objekt[]) ?? []);
    setGutachten((gRes.data as Gutachten[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeAlles(); setLaden(false);
    })();
  }, [ladeAlles]);

  async function kontrolleErledigt(b: Baum) {
    if (!uid) return;
    setFehler(null); setOk(null);
    const naechste = b.kontrollintervall_monate > 0 ? plusMonate(HEUTE, b.kontrollintervall_monate) : null;
    try {
      const { error: e1 } = await supabase.from('forst_baeume').update({ letzte_kontrolle: HEUTE, naechste_kontrolle: naechste }).eq('id', b.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('forst_gutachten').insert({
        owner_user_id: uid, objekt_id: b.objekt_id, art: 'kontrollprotokoll',
        titel: `Kontrolle ${b.art || 'Baum'}`, datum: HEUTE,
        notiz: `Regelkontrolle durchgeführt. Nächste Kontrolle: ${naechste ? d(naechste) : 'kein Intervall'}.`,
      });
      if (e2) throw e2;
      setOk('Kontrolle protokolliert. Nächste Kontrolle gesetzt.');
      await ladeAlles();
    } catch { setFehler('Kontrolle konnte nicht gespeichert werden.'); }
  }

  function setG<K extends keyof GForm>(k: K, v: GForm[K]) { setGform((f) => ({ ...f, [k]: v })); }
  function neuG() { setGform(leerG()); setOk(null); setFehler(null); }
  function editG(g: Gutachten) {
    setGform({ id: g.id, art: g.art, titel: g.titel, objekt_id: g.objekt_id ?? '', ersteller: g.ersteller ?? '', aktenzeichen: g.aktenzeichen ?? '', datum: g.datum ?? '', gueltig_bis: g.gueltig_bis ?? '', notiz: g.notiz ?? '' });
    setOk(null); setFehler(null);
  }
  async function gutachtenSpeichern() {
    if (!uid || !gform.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setSpeichert(true); setFehler(null); setOk(null);
    const payload = {
      owner_user_id: uid, art: gform.art, titel: gform.titel.trim(), objekt_id: gform.objekt_id || null,
      ersteller: gform.ersteller.trim() || null, aktenzeichen: gform.aktenzeichen.trim() || null,
      datum: gform.datum || null, gueltig_bis: gform.gueltig_bis || null, notiz: gform.notiz.trim() || null,
    };
    try {
      if (gform.id) {
        const { error } = await supabase.from('forst_gutachten').update(payload).eq('id', gform.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('forst_gutachten').insert(payload);
        if (error) throw error;
      }
      setOk(gform.id ? 'Gespeichert.' : 'Dokument abgelegt.'); setGform(leerG()); await ladeAlles();
    } catch { setFehler('Speichern fehlgeschlagen.'); } finally { setSpeichert(false); }
  }
  async function gutachtenLoeschen(id: string) {
    const { error } = await supabase.from('forst_gutachten').delete().eq('id', id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await ladeAlles();
  }

  // Fällige/anstehende Kontrollen (überfällig + nächste 60 Tage)
  const faellige = baeume
    .filter((b) => b.naechste_kontrolle != null && b.naechste_kontrolle <= GRENZE_60)
    .sort((a, b) => (a.naechste_kontrolle || '').localeCompare(b.naechste_kontrolle || ''));
  const ueberfaellig = faellige.filter((b) => b.naechste_kontrolle != null && b.naechste_kontrolle <= HEUTE).length;

  function gAmpel(g: Gutachten): { farbe: string; text: string } {
    if (!g.gueltig_bis) return { farbe: C.textDim, text: 'ohne Ablauf' };
    if (g.gueltig_bis <= HEUTE) return { farbe: C.danger, text: 'abgelaufen' };
    if (g.gueltig_bis <= GRENZE_30) return { farbe: C.warn, text: 'läuft bald ab' };
    return { farbe: C.green, text: 'gültig' };
  }
  const genehmigungenBald = gutachten.filter((g) => g.gueltig_bis != null && g.gueltig_bis > HEUTE && g.gueltig_bis <= GRENZE_30).length;

  const sperrfrist = istSperrfrist(HEUTE);

  const augePunkte: string[] = [];
  if (ueberfaellig > 0) augePunkte.push(`${ueberfaellig} Baum-Kontrolle(n) überfällig — Verkehrssicherungspflicht`);
  if (faellige.length - ueberfaellig > 0) augePunkte.push(`${faellige.length - ueberfaellig} Kontrolle(n) in den nächsten 60 Tagen`);
  if (sperrfrist) augePunkte.push('Fäll-Sperrfrist aktiv (1.3.–30.9.) — Fällungen nur mit Ausnahme');
  if (augePunkte.length === 0) augePunkte.push('Keine fälligen Kontrollen. Verkehrssicherung aktuell.');
  const augeStimmung: 'gut' | 'neutral' | 'achtung' = ueberfaellig > 0 ? 'achtung' : faellige.length > 0 ? 'neutral' : 'gut';

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🌲 Forst & Baumpflege</h1>
      <div style={styles.subnav}>
        <Link href="/dashboard/forst" style={styles.subnavLink}>Baumkataster</Link>
        <Link href="/dashboard/forst/einsatzmittel" style={styles.subnavLink}>Einsatzmittel &amp; Sätze</Link>
        <Link href="/dashboard/forst/auftraege" style={styles.subnavLink}>Aufträge</Link>
        <Link href="/dashboard/forst/nachweise" style={styles.subnavLink}>Nachweise</Link>
        <span style={styles.subnavAktiv}>Verkehrssicherung</span>
      </div>
      <p style={styles.sub}>
        Fällige Baumkontrollen, Kontrollprotokolle und die Ablage für Gutachten &amp; Fällgenehmigungen — an einem Ort.
      </p>

      {/* Fäll-Sperrfrist-Banner */}
      <div style={sperrfrist ? styles.bannerWarn : styles.bannerInfo}>
        {sperrfrist
          ? '⚠ Fäll-Sperrfrist aktiv (1. März–30. September, BNatSchG §39): nur schonende Form- und Pflegeschnitte. Fällungen nur mit artenschutzrechtlicher Ausnahme.'
          : '✓ Außerhalb der Sperrfrist (1. März–30. September): Fällungen grundsätzlich zulässig.'}
        {' '}Zusätzlich immer die kommunale Baumschutzsatzung prüfen (Fällgenehmigung, oft ab Stammdurchmesser ~60–80 cm).
      </div>

      {!laden && (
        <div style={styles.kpiGrid}>
          <Kpi label="Kontrolle fällig" value={String(faellige.length)} accent={faellige.length > 0 ? C.warn : C.green} />
          <Kpi label="davon überfällig" value={String(ueberfaellig)} accent={ueberfaellig > 0 ? C.danger : C.green} />
          <Kpi label="Dokumente" value={String(gutachten.length)} accent={C.cyan} />
          <Kpi label="Genehmigung läuft bald ab" value={String(genehmigungenBald)} accent={genehmigungenBald > 0 ? C.warn : C.green} />
        </div>
      )}

      {!laden && (baeume.length > 0 || gutachten.length > 0) && (
        <KiAuge
          modul="Verkehrssicherung"
          regel={{ klartext: `${faellige.length} fällige Kontrolle(n), ${gutachten.length} Dokument(e) abgelegt.`, punkte: augePunkte, stimmung: augeStimmung }}
          aktionHref="/dashboard/forst/verkehrssicherung"
          aktionText="Zur Verkehrssicherung"
        />
      )}

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Fällige Kontrollen */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Fällige &amp; anstehende Kontrollen</div>
        {laden ? <p style={styles.dim}>Lädt …</p> : !faellige.length ? (
          <p style={styles.dim}>Keine Kontrollen in den nächsten 60 Tagen fällig. 👍</p>
        ) : faellige.map((b) => {
          const ueber = b.naechste_kontrolle != null && b.naechste_kontrolle <= HEUTE;
          return (
            <div key={b.id} style={styles.zeile}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: ueber ? C.danger : C.warn, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ minWidth: 130, fontWeight: 700 }}>{b.art || 'Baum'}</span>
              <span style={{ minWidth: 150, color: C.textDim }}>{objektName(b.objekt_id)}</span>
              <span style={{ flex: 1, color: ueber ? C.danger : C.warn }}>
                Kontrolle {d(b.naechste_kontrolle)}{ueber ? ' · überfällig' : ' · bald'}
              </span>
              <button style={styles.miniBtn} onClick={() => kontrolleErledigt(b)}>Kontrolle erledigt</button>
            </div>
          );
        })}
      </div>

      {/* Gutachten & Genehmigungen */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800 }}>{gform.id ? 'Dokument bearbeiten' : 'Gutachten / Genehmigung ablegen'}</div>
          {gform.id && <button style={styles.ghost} onClick={neuG}>+ Neues statt bearbeiten</button>}
        </div>
        <div style={styles.row}>
          <label style={styles.lab}>Art
            <select style={styles.inp} value={gform.art} onChange={(e) => setG('art', e.target.value)}>
              {GUT_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </label>
          <input style={{ ...styles.inp, flex: 1, minWidth: 150 }} value={gform.titel} onChange={(e) => setG('titel', e.target.value)} placeholder="Titel (z. B. Fällgenehmigung Eiche Garten Müller)" />
          <label style={styles.lab}>Objekt
            <select style={styles.inp} value={gform.objekt_id} onChange={(e) => setG('objekt_id', e.target.value)}>
              <option value="">— ohne —</option>
              {objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}
            </select>
          </label>
        </div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1, minWidth: 130 }} value={gform.ersteller} onChange={(e) => setG('ersteller', e.target.value)} placeholder="Behörde / Gutachter" />
          <input style={{ ...styles.inp, width: 150 }} value={gform.aktenzeichen} onChange={(e) => setG('aktenzeichen', e.target.value)} placeholder="Aktenzeichen" />
          <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={gform.datum} onChange={(e) => setG('datum', e.target.value)} /></label>
          <label style={styles.lab}>Gültig bis<input type="date" style={styles.inp} value={gform.gueltig_bis} onChange={(e) => setG('gueltig_bis', e.target.value)} /></label>
          <button style={{ ...styles.primaer, opacity: speichert ? 0.5 : 1 }} onClick={gutachtenSpeichern} disabled={speichert}>
            {speichert ? 'Speichert …' : gform.id ? 'Speichern' : '＋ Ablegen'}
          </button>
        </div>
        <input style={{ ...styles.inp, width: '100%' }} value={gform.notiz} onChange={(e) => setG('notiz', e.target.value)} placeholder="Notiz (optional)" />

        {gutachten.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gutachten.map((g) => {
              const a = gAmpel(g);
              return (
                <div key={g.id} style={styles.zeile}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: a.farbe, display: 'inline-block', flexShrink: 0 }} />
                  <button style={styles.zeileBtn} onClick={() => editG(g)}>
                    <span style={{ minWidth: 210 }}>{gutLabel(g.art)} · <strong>{g.titel}</strong></span>
                    <span style={{ minWidth: 140, color: C.textDim }}>{objektName(g.objekt_id)}</span>
                    <span style={{ flex: 1, color: a.farbe }}>
                      {g.datum ? d(g.datum) : '—'}{g.gueltig_bis ? ` · gültig bis ${d(g.gueltig_bis)} · ${a.text}` : ''}
                    </span>
                  </button>
                  <button style={styles.xBtn} title="Dokument entfernen" onClick={() => gutachtenLoeschen(g.id)}>✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.kpiBox}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  subnav: { display: 'flex', gap: 8, margin: '12px 0 4px', flexWrap: 'wrap' },
  subnavAktiv: { background: C.gold, color: C.navy, borderRadius: 9, padding: '7px 14px', fontSize: 14, fontWeight: 800 },
  subnavLink: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 14px', fontSize: 14, fontWeight: 700, textDecoration: 'none' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },

  bannerWarn: { marginTop: 14, background: 'rgba(224,162,76,0.1)', border: `1px solid rgba(224,162,76,0.35)`, color: C.warn, borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.5 },
  bannerInfo: { marginTop: 14, background: 'rgba(76,175,125,0.08)', border: `1px solid rgba(76,175,125,0.3)`, color: C.green, borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.5 },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 14 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 28, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14 },
  zeileBtn: { display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', color: C.text, fontFamily: 'inherit', fontSize: 14 },
  xBtn: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', flexShrink: 0 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
