'use client';

// ============================================================
// ARGONAUT OS · Holzernte-Schäfer · F4 · Nachweise je Mitarbeiter
// Motorsägenschein (DGUV 214-059), Erste-Hilfe (24 Mon.), PSA, SVLFG,
// Führerschein u. a. — mit Fälligkeit & Ampel (grün/gelb/rot).
// Vorgabe-Intervalle sind frei änderbar. Regel-Auge (0 €).
// Pfad: app/dashboard/forst/nachweise/page.tsx
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

type Nachweis = {
  id: string; mitarbeiter_name: string; art: string; bezeichnung: string | null;
  ausgestellt_am: string | null; intervall_monate: number; naechste_faellig: string | null; notiz: string | null;
};

// Vorgabe-Arten mit web-verifizierten Standard-Intervallen (frei änderbar).
const ARTEN: { key: string; label: string; bezeichnung: string; intervall: number }[] = [
  { key: 'motorsaegenschein', label: '🪚 Motorsägenschein', bezeichnung: 'DGUV 214-059 · Modul A', intervall: 0 },
  { key: 'erste_hilfe', label: '➕ Erste-Hilfe', bezeichnung: 'Erste-Hilfe-Ausbildung', intervall: 24 },
  { key: 'psa', label: '🦺 PSA-Prüfung', bezeichnung: 'Schnittschutz-PSA geprüft', intervall: 12 },
  { key: 'svlfg', label: '🛡 SVLFG', bezeichnung: 'SVLFG angemeldet', intervall: 0 },
  { key: 'fuehrerschein', label: '🚗 Führerschein-Kontrolle', bezeichnung: 'Führerschein-Sichtkontrolle', intervall: 6 },
  { key: 'vorsorge', label: '🩺 Arbeitsmed. Vorsorge', bezeichnung: 'G-Untersuchung', intervall: 36 },
  { key: 'sonstige', label: '· Sonstige', bezeichnung: '', intervall: 0 },
];
function artLabel(k: string) { return ARTEN.find((a) => a.key === k)?.label ?? k; }

function heute() { return new Date().toISOString().slice(0, 10); }
function inTagen(tage: number) { const g = new Date(); g.setDate(g.getDate() + tage); return g.toISOString().slice(0, 10); }
function num(s: string) { const n = parseFloat((s || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function plusMonate(iso: string, monate: number) { const dt = new Date(iso); dt.setMonth(dt.getMonth() + monate); return dt.toISOString().slice(0, 10); }

const HEUTE = heute();
const GRENZE_30 = inTagen(30);

type Form = { id: string | null; mitarbeiter_name: string; art: string; bezeichnung: string; ausgestellt_am: string; intervall_monate: string; notiz: string };
function leerForm(): Form { return { id: null, mitarbeiter_name: '', art: 'motorsaegenschein', bezeichnung: 'DGUV 214-059 · Modul A', ausgestellt_am: '', intervall_monate: '0', notiz: '' }; }

export default function ForstNachweisePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Nachweis[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(leerForm());
  const [speichert, setSpeichert] = useState(false);

  const ladeListe = useCallback(async () => {
    const { data } = await supabase.from('forst_nachweis')
      .select('id, mitarbeiter_name, art, bezeichnung, ausgestellt_am, intervall_monate, naechste_faellig, notiz')
      .order('mitarbeiter_name', { ascending: true }).order('naechste_faellig', { ascending: true, nullsFirst: false });
    setListe((data as Nachweis[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeListe(); setLaden(false);
    })();
  }, [ladeListe]);

  function setF<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }
  function neu() { setForm(leerForm()); setOk(null); setFehler(null); }
  function artWechseln(key: string) {
    const preset = ARTEN.find((a) => a.key === key);
    setForm((f) => ({ ...f, art: key, bezeichnung: preset ? preset.bezeichnung : f.bezeichnung, intervall_monate: preset ? String(preset.intervall) : f.intervall_monate }));
  }
  function editieren(n: Nachweis) {
    setForm({
      id: n.id, mitarbeiter_name: n.mitarbeiter_name, art: n.art, bezeichnung: n.bezeichnung ?? '',
      ausgestellt_am: n.ausgestellt_am ?? '', intervall_monate: String(n.intervall_monate), notiz: n.notiz ?? '',
    });
    setOk(null); setFehler(null);
  }

  async function speichern() {
    if (!uid || !form.mitarbeiter_name.trim()) { setFehler('Bitte einen Mitarbeiter-Namen angeben.'); return; }
    setSpeichert(true); setFehler(null); setOk(null);
    const intervall = Math.max(0, Math.round(num(form.intervall_monate)));
    const ausg = form.ausgestellt_am || null;
    const naechste = ausg && intervall > 0 ? plusMonate(ausg, intervall) : null;
    const payload = {
      owner_user_id: uid, mitarbeiter_name: form.mitarbeiter_name.trim(), art: form.art,
      bezeichnung: form.bezeichnung.trim() || null, ausgestellt_am: ausg,
      intervall_monate: intervall, naechste_faellig: naechste, notiz: form.notiz.trim() || null,
    };
    try {
      if (form.id) {
        const { error } = await supabase.from('forst_nachweis').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('forst_nachweis').insert(payload);
        if (error) throw error;
      }
      setOk(form.id ? 'Gespeichert.' : 'Nachweis erfasst.'); setForm(leerForm()); await ladeListe();
    } catch {
      setFehler('Speichern fehlgeschlagen.');
    } finally { setSpeichert(false); }
  }

  async function loeschen(id: string) {
    const { error } = await supabase.from('forst_nachweis').delete().eq('id', id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await ladeListe();
  }

  function ampel(n: Nachweis): { farbe: string; text: string } {
    if (!n.naechste_faellig) return { farbe: C.textDim, text: 'kein Ablauf' };
    if (n.naechste_faellig <= HEUTE) return { farbe: C.danger, text: 'überfällig' };
    if (n.naechste_faellig <= GRENZE_30) return { farbe: C.warn, text: 'bald fällig' };
    return { farbe: C.green, text: 'gültig' };
  }

  const mitarbeiter = Array.from(new Set(liste.map((n) => n.mitarbeiter_name)));
  const faellig = liste.filter((n) => n.naechste_faellig != null && n.naechste_faellig <= HEUTE).length;
  const bald = liste.filter((n) => n.naechste_faellig != null && n.naechste_faellig > HEUTE && n.naechste_faellig <= GRENZE_30).length;

  const augePunkte: string[] = [];
  if (faellig > 0) augePunkte.push(`${faellig} Nachweis(e) überfällig — nicht ohne gültigen Nachweis einsetzen`);
  if (bald > 0) augePunkte.push(`${bald} Nachweis(e) in den nächsten 30 Tagen fällig`);
  if (augePunkte.length === 0) augePunkte.push('Alle erfassten Nachweise sind gültig.');
  const augeStimmung: 'gut' | 'neutral' | 'achtung' = faellig > 0 ? 'achtung' : bald > 0 ? 'neutral' : 'gut';

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🌲 Forst & Baumpflege</h1>
      <div style={styles.subnav}>
        <Link href="/dashboard/forst" style={styles.subnavLink}>Baumkataster</Link>
        <Link href="/dashboard/forst/einsatzmittel" style={styles.subnavLink}>Einsatzmittel &amp; Sätze</Link>
        <Link href="/dashboard/forst/auftraege" style={styles.subnavLink}>Aufträge</Link>
        <span style={styles.subnavAktiv}>Nachweise</span>
        <Link href="/dashboard/forst/verkehrssicherung" style={styles.subnavLink}>Verkehrssicherung</Link>
      </div>
      <p style={styles.sub}>
        Qualifikationen &amp; Pflicht-Nachweise je Mitarbeiter — Motorsägenschein, Erste-Hilfe, PSA, SVLFG. Ampel warnt vor Ablauf.
      </p>

      {!laden && (
        <div style={styles.kpiGrid}>
          <Kpi label="Mitarbeiter" value={String(mitarbeiter.length)} accent={C.cyan} />
          <Kpi label="Nachweise" value={String(liste.length)} accent={C.text} />
          <Kpi label="Überfällig" value={String(faellig)} accent={faellig > 0 ? C.danger : C.green} />
          <Kpi label="Bald fällig" value={String(bald)} accent={bald > 0 ? C.warn : C.green} />
        </div>
      )}

      {!laden && liste.length > 0 && (
        <KiAuge
          modul="Nachweise"
          regel={{ klartext: `${liste.length} Nachweise für ${mitarbeiter.length} Mitarbeiter erfasst.`, punkte: augePunkte, stimmung: augeStimmung }}
          aktionHref="/dashboard/forst/nachweise"
          aktionText="Zu den Nachweisen"
        />
      )}

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Formular */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800 }}>{form.id ? 'Nachweis bearbeiten' : 'Nachweis erfassen'}</div>
          {form.id && <button style={styles.ghost} onClick={neu}>+ Neuer statt bearbeiten</button>}
        </div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1, minWidth: 150 }} value={form.mitarbeiter_name} onChange={(e) => setF('mitarbeiter_name', e.target.value)} placeholder="Mitarbeiter (Name)" />
          <label style={styles.lab}>Art
            <select style={styles.inp} value={form.art} onChange={(e) => artWechseln(e.target.value)}>
              {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </label>
          <input style={{ ...styles.inp, flex: 1, minWidth: 150 }} value={form.bezeichnung} onChange={(e) => setF('bezeichnung', e.target.value)} placeholder="Bezeichnung / Detail" />
        </div>
        <div style={styles.row}>
          <label style={styles.lab}>Ausgestellt am<input type="date" style={styles.inp} value={form.ausgestellt_am} onChange={(e) => setF('ausgestellt_am', e.target.value)} /></label>
          <label style={styles.lab}>Intervall Monate (0 = kein Ablauf)<input style={{ ...styles.inp, width: 90 }} value={form.intervall_monate} onChange={(e) => setF('intervall_monate', e.target.value)} inputMode="numeric" /></label>
          <input style={{ ...styles.inp, flex: 1, minWidth: 150 }} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} placeholder="Notiz (optional)" />
          <button style={{ ...styles.primaer, opacity: speichert ? 0.5 : 1 }} onClick={speichern} disabled={speichert}>
            {speichert ? 'Speichert …' : form.id ? 'Speichern' : '＋ Erfassen'}
          </button>
        </div>
        {form.ausgestellt_am && num(form.intervall_monate) > 0 && (
          <div style={styles.hinweis}>Nächste Fälligkeit wird gesetzt auf: <strong>{d(plusMonate(form.ausgestellt_am, Math.round(num(form.intervall_monate))))}</strong></div>
        )}
      </div>

      {/* Liste je Mitarbeiter */}
      {laden ? <p style={styles.dim}>Lädt …</p> : !liste.length ? (
        <p style={styles.dim}>Noch keine Nachweise. Erfasse oben den ersten — z. B. Motorsägenschein Modul A.</p>
      ) : (
        mitarbeiter.map((name) => (
          <div key={name} style={styles.card}>
            <div style={{ fontWeight: 800 }}>👤 {name}</div>
            {liste.filter((n) => n.mitarbeiter_name === name).map((n) => {
              const a = ampel(n);
              return (
                <div key={n.id} style={styles.zeile}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: a.farbe, display: 'inline-block', flexShrink: 0 }} />
                  <button style={styles.zeileBtn} onClick={() => editieren(n)}>
                    <span style={{ minWidth: 150, fontWeight: 700 }}>{artLabel(n.art)}</span>
                    <span style={{ minWidth: 160, color: C.textDim }}>{n.bezeichnung || '—'}</span>
                    <span style={{ flex: 1, color: a.farbe }}>
                      {n.naechste_faellig ? `fällig ${d(n.naechste_faellig)} · ${a.text}` : a.text}
                    </span>
                  </button>
                  <button style={styles.xBtn} title="Nachweis entfernen" onClick={() => loeschen(n.id)}>✕</button>
                </div>
              );
            })}
          </div>
        ))
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
  ghost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  hinweis: { fontSize: 13, color: C.cyan, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 9, padding: '8px 12px' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6 },
  zeileBtn: { display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', color: C.text, fontFamily: 'inherit', fontSize: 14 },
  xBtn: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', flexShrink: 0 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
