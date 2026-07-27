'use client';

// ============================================================
// ARGONAUT OS · Holzernte-Schäfer · F1 · Baumkataster
// Objekte (Standort je Kunde) + einzelne Bäume mit Zustand & Kontrolle.
// Grundlage für Verkehrssicherung/Fällaufträge. Regel-Auge (0 €).
// Pfad: app/dashboard/forst/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Zustand = 'gut' | 'beobachten' | 'kritisch';
type Objekt = { id: string; bezeichnung: string; adresse: string | null; notiz: string | null };
type Baum = {
  id: string; art: string | null; hoehe_m: number | null; stammdurchmesser_cm: number | null;
  zustand: Zustand; kontrollintervall_monate: number;
  letzte_kontrolle: string | null; naechste_kontrolle: string | null; notiz: string | null;
};
type BaumLite = { id: string; zustand: Zustand; naechste_kontrolle: string | null };

const ZUSTAND_LABEL: Record<Zustand, string> = { gut: '🟢 Gut', beobachten: '🟠 Beobachten', kritisch: '🔴 Kritisch' };

function heute() { return new Date().toISOString().slice(0, 10); }
function inTagen(tage: number) { const g = new Date(); g.setDate(g.getDate() + tage); return g.toISOString().slice(0, 10); }
function num(s: string) { const n = parseFloat((s || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function plusMonate(iso: string, monate: number) { const dt = new Date(iso); dt.setMonth(dt.getMonth() + monate); return dt.toISOString().slice(0, 10); }

const HEUTE = heute();
const GRENZE_30 = inTagen(30);

function zustandFarbe(z: Zustand) { return z === 'kritisch' ? C.danger : z === 'beobachten' ? C.warn : C.green; }

export default function ForstPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [objekte, setObjekte] = useState<Objekt[]>([]);
  const [aktiv, setAktiv] = useState<Objekt | null>(null);
  const [baeume, setBaeume] = useState<Baum[]>([]);
  const [alleBaeume, setAlleBaeume] = useState<BaumLite[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [no, setNo] = useState({ bezeichnung: '', adresse: '', notiz: '' });
  const [nb, setNb] = useState({ art: '', hoehe_m: '', stammdurchmesser_cm: '', zustand: 'gut' as Zustand, kontrollintervall_monate: '12', letzte_kontrolle: '', notiz: '' });

  const ladeObjekte = useCallback(async () => {
    const { data } = await supabase.from('forst_objekte').select('id, bezeichnung, adresse, notiz').order('bezeichnung', { ascending: true });
    setObjekte((data as Objekt[]) ?? []);
  }, []);
  const ladeAlleBaeume = useCallback(async () => {
    const { data } = await supabase.from('forst_baeume').select('id, zustand, naechste_kontrolle');
    setAlleBaeume((data as BaumLite[]) ?? []);
  }, []);
  const ladeBaeume = useCallback(async (oid: string) => {
    const { data } = await supabase.from('forst_baeume')
      .select('id, art, hoehe_m, stammdurchmesser_cm, zustand, kontrollintervall_monate, letzte_kontrolle, naechste_kontrolle, notiz')
      .eq('objekt_id', oid).order('naechste_kontrolle', { ascending: true, nullsFirst: false });
    setBaeume((data as Baum[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeObjekte(); await ladeAlleBaeume(); setLaden(false);
    })();
  }, [ladeObjekte, ladeAlleBaeume]);

  async function objektAnlegen() {
    if (!uid || !no.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('forst_objekte').insert({
      owner_user_id: uid, bezeichnung: no.bezeichnung.trim(), adresse: no.adresse.trim() || null, notiz: no.notiz.trim() || null,
    }).select('id, bezeichnung, adresse, notiz').single();
    if (error || !data) { setFehler('Objekt konnte nicht gespeichert werden.'); return; }
    setNo({ bezeichnung: '', adresse: '', notiz: '' }); setOk('Objekt gespeichert.');
    await ladeObjekte(); setAktiv(data as Objekt); setBaeume([]);
  }

  async function objektOeffnen(o: Objekt) { setAktiv(o); setOk(null); setFehler(null); await ladeBaeume(o.id); }

  async function baumAnlegen() {
    if (!uid || !aktiv) return;
    setFehler(null); setOk(null);
    const intervall = Math.max(0, Math.round(num(nb.kontrollintervall_monate)) || 0);
    const letzte = nb.letzte_kontrolle || null;
    const naechste = letzte && intervall > 0 ? plusMonate(letzte, intervall) : null;
    const { error } = await supabase.from('forst_baeume').insert({
      owner_user_id: uid, objekt_id: aktiv.id,
      art: nb.art.trim() || null,
      hoehe_m: nb.hoehe_m ? num(nb.hoehe_m) : null,
      stammdurchmesser_cm: nb.stammdurchmesser_cm ? num(nb.stammdurchmesser_cm) : null,
      zustand: nb.zustand,
      kontrollintervall_monate: intervall || 12,
      letzte_kontrolle: letzte,
      naechste_kontrolle: naechste,
      notiz: nb.notiz.trim() || null,
    });
    if (error) { setFehler('Baum konnte nicht gespeichert werden.'); return; }
    setNb({ art: '', hoehe_m: '', stammdurchmesser_cm: '', zustand: 'gut', kontrollintervall_monate: '12', letzte_kontrolle: '', notiz: '' });
    setOk('Baum erfasst.');
    await ladeBaeume(aktiv.id); await ladeAlleBaeume();
  }

  // --- Kennzahlen (global, aus alleBaeume) -----------------------------
  const gesamt = alleBaeume.length;
  const faellig = alleBaeume.filter((b) => b.naechste_kontrolle != null && b.naechste_kontrolle <= HEUTE).length;
  const bald = alleBaeume.filter((b) => b.naechste_kontrolle != null && b.naechste_kontrolle > HEUTE && b.naechste_kontrolle <= GRENZE_30).length;
  const kritisch = alleBaeume.filter((b) => b.zustand === 'kritisch').length;
  const beobachten = alleBaeume.filter((b) => b.zustand === 'beobachten').length;

  const augePunkte: string[] = [];
  if (faellig > 0) augePunkte.push(`${faellig} Kontrolle(n) überfällig — Verkehrssicherung prüfen`);
  if (bald > 0) augePunkte.push(`${bald} Kontrolle(n) in den nächsten 30 Tagen fällig`);
  if (kritisch > 0) augePunkte.push(`${kritisch} Baum/Bäume im Zustand „kritisch" — Fäll-/Pflegeauftrag anlegen`);
  if (beobachten > 0) augePunkte.push(`${beobachten} Baum/Bäume unter Beobachtung`);
  if (augePunkte.length === 0) augePunkte.push('Alle Kontrollen aktuell, kein kritischer Baum.');

  const augeStimmung: 'gut' | 'neutral' | 'achtung' =
    (faellig > 0 || kritisch > 0) ? 'achtung' : (bald > 0 || beobachten > 0) ? 'neutral' : 'gut';

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🌲 Forst & Baumpflege</h1>
      <div style={styles.subnav}>
        <span style={styles.subnavAktiv}>Baumkataster</span>
        <Link href="/dashboard/forst/einsatzmittel" style={styles.subnavLink}>Einsatzmittel &amp; Sätze</Link>
        <Link href="/dashboard/forst/auftraege" style={styles.subnavLink}>Aufträge</Link>
      </div>
      <p style={styles.sub}>
        Bäume je Kunde/Objekt mit Zustand und Kontrollintervall — die Grundlage für Verkehrssicherung und Fällaufträge.
      </p>

      {!laden && (
        <div style={styles.kpiGrid}>
          <Kpi label="Objekte" value={String(objekte.length)} accent={C.cyan} />
          <Kpi label="Bäume gesamt" value={String(gesamt)} accent={C.text} />
          <Kpi label="Kontrolle fällig" value={String(faellig)} accent={faellig > 0 ? C.danger : C.green} />
          <Kpi label="Kritisch" value={String(kritisch)} accent={kritisch > 0 ? C.danger : C.green} />
        </div>
      )}

      {!laden && gesamt > 0 && (
        <KiAuge
          modul="Baumkataster"
          regel={{ klartext: `${gesamt} Bäume in ${objekte.length} Objekt(en) erfasst.`, punkte: augePunkte, stimmung: augeStimmung }}
          aktionHref="/dashboard/forst"
          aktionText="Zum Baumkataster"
        />
      )}

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Objekt anlegen */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Objekt anlegen</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1, minWidth: 160 }} value={no.bezeichnung} onChange={(e) => setNo({ ...no, bezeichnung: e.target.value })} placeholder="Bezeichnung (z. B. Kunde Müller · Garten)" />
          <input style={{ ...styles.inp, flex: 1, minWidth: 160 }} value={no.adresse} onChange={(e) => setNo({ ...no, adresse: e.target.value })} placeholder="Adresse (optional)" />
          <button style={styles.primaer} onClick={objektAnlegen}>＋ Objekt</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          {/* Objekt-Liste */}
          <div style={styles.lvListe}>
            {objekte.map((o) => (
              <button key={o.id} style={{ ...styles.lvItem, ...(aktiv?.id === o.id ? styles.lvAktiv : {}) }} onClick={() => objektOeffnen(o)}>
                <div style={{ fontWeight: 700 }}>{o.bezeichnung}</div>
                <div style={{ color: C.textDim, fontSize: 13 }}>{o.adresse || '—'}</div>
              </button>
            ))}
            {!objekte.length && <p style={styles.dim}>Noch keine Objekte.</p>}
          </div>

          {/* Baum-Detail */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links ein Objekt wählen.</p> : (
              <div style={styles.card}>
                <div style={{ fontWeight: 800 }}>{aktiv.bezeichnung} · Bäume</div>

                <div style={styles.row}>
                  <input style={{ ...styles.inp, flex: 1, minWidth: 120 }} value={nb.art} onChange={(e) => setNb({ ...nb, art: e.target.value })} placeholder="Baumart (z. B. Eiche)" />
                  <label style={styles.lab}>Höhe m<input style={{ ...styles.inp, width: 72 }} value={nb.hoehe_m} onChange={(e) => setNb({ ...nb, hoehe_m: e.target.value })} inputMode="decimal" /></label>
                  <label style={styles.lab}>Ø Stamm cm<input style={{ ...styles.inp, width: 84 }} value={nb.stammdurchmesser_cm} onChange={(e) => setNb({ ...nb, stammdurchmesser_cm: e.target.value })} inputMode="decimal" /></label>
                  <label style={styles.lab}>Zustand
                    <select style={styles.inp} value={nb.zustand} onChange={(e) => setNb({ ...nb, zustand: e.target.value as Zustand })}>
                      {(Object.keys(ZUSTAND_LABEL) as Zustand[]).map((z) => <option key={z} value={z}>{ZUSTAND_LABEL[z]}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Intervall Mon.<input style={{ ...styles.inp, width: 72 }} value={nb.kontrollintervall_monate} onChange={(e) => setNb({ ...nb, kontrollintervall_monate: e.target.value })} inputMode="numeric" /></label>
                  <label style={styles.lab}>Letzte Kontrolle<input type="date" style={styles.inp} value={nb.letzte_kontrolle} onChange={(e) => setNb({ ...nb, letzte_kontrolle: e.target.value })} /></label>
                  <button style={styles.dazuBtn} onClick={baumAnlegen}>＋ Baum</button>
                </div>

                {nb.letzte_kontrolle && num(nb.kontrollintervall_monate) > 0 && (
                  <div style={styles.hinweis}>Nächste Kontrolle wird gesetzt auf: <strong>{d(plusMonate(nb.letzte_kontrolle, Math.round(num(nb.kontrollintervall_monate))))}</strong></div>
                )}

                {baeume.map((b) => {
                  const ueber = b.naechste_kontrolle != null && b.naechste_kontrolle <= HEUTE;
                  const baldB = b.naechste_kontrolle != null && b.naechste_kontrolle > HEUTE && b.naechste_kontrolle <= GRENZE_30;
                  return (
                    <div key={b.id} style={styles.posZeile}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: zustandFarbe(b.zustand), display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ minWidth: 120, fontWeight: 700 }}>{b.art || 'Baum'}</span>
                      <span style={{ minWidth: 150, color: C.textDim }}>
                        {b.hoehe_m != null ? `${b.hoehe_m} m` : '—'}{b.stammdurchmesser_cm != null ? ` · Ø ${b.stammdurchmesser_cm} cm` : ''}
                      </span>
                      <span style={{ flex: 1, color: ueber ? C.danger : baldB ? C.warn : C.textDim }}>
                        Kontrolle: {d(b.naechste_kontrolle)}{ueber ? ' · überfällig' : baldB ? ' · bald fällig' : ''}
                      </span>
                    </div>
                  );
                })}
                {!baeume.length && <p style={styles.dim}>Noch keine Bäume in diesem Objekt.</p>}
              </div>
            )}
          </div>
        </div>
      )}
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
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  subnav: { display: 'flex', gap: 8, margin: '12px 0 4px', flexWrap: 'wrap' },
  subnavAktiv: { background: C.gold, color: C.navy, borderRadius: 9, padding: '7px 14px', fontSize: 14, fontWeight: 800 },
  subnavLink: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 14px', fontSize: 14, fontWeight: 700, textDecoration: 'none' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 30, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14 },
  hinweis: { fontSize: 13, color: C.cyan, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 9, padding: '8px 12px' },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
