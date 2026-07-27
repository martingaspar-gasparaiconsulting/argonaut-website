'use client';

// ============================================================
// ARGONAUT OS · Holzernte-Schäfer · F2 · Einsatzmittel & Std-Sätze
// Maschinen/Fahrzeuge mit Stundensatz + Wegepauschale (+ optional km-Satz).
// Reine Stammdaten — Grundlage für Angebot/Auftrag. Regel-Auge (0 €).
// Pfad: app/dashboard/forst/einsatzmittel/page.tsx
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

type Art = 'maschine' | 'fahrzeug' | 'werkzeug' | 'sonstige';
type Mittel = {
  id: string; bezeichnung: string; art: Art;
  stundensatz_netto: number | null; wegepauschale_netto: number | null; km_satz_netto: number | null;
  steuersatz_prozent: number; aktiv: boolean; notiz: string | null;
};

const ART_LABEL: Record<Art, string> = { maschine: '⚙️ Maschine', fahrzeug: '🚜 Fahrzeug', werkzeug: '🪚 Werkzeug', sonstige: '· Sonstige' };

function numOrNull(s: string): number | null {
  const t = (s || '').trim().replace(',', '.'); if (t === '') return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
}
function eur(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

type Form = {
  id: string | null; bezeichnung: string; art: Art;
  stundensatz_netto: string; wegepauschale_netto: string; km_satz_netto: string;
  steuersatz_prozent: string; aktiv: boolean; notiz: string;
};
function leerForm(): Form {
  return { id: null, bezeichnung: '', art: 'maschine', stundensatz_netto: '', wegepauschale_netto: '', km_satz_netto: '', steuersatz_prozent: '19', aktiv: true, notiz: '' };
}

export default function ForstEinsatzmittelPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Mittel[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(leerForm());
  const [speichert, setSpeichert] = useState(false);

  const ladeListe = useCallback(async () => {
    const { data } = await supabase.from('forst_einsatzmittel')
      .select('id, bezeichnung, art, stundensatz_netto, wegepauschale_netto, km_satz_netto, steuersatz_prozent, aktiv, notiz')
      .order('bezeichnung', { ascending: true });
    setListe((data as Mittel[]) ?? []);
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
  function editieren(m: Mittel) {
    setForm({
      id: m.id, bezeichnung: m.bezeichnung, art: m.art,
      stundensatz_netto: m.stundensatz_netto != null ? String(m.stundensatz_netto) : '',
      wegepauschale_netto: m.wegepauschale_netto != null ? String(m.wegepauschale_netto) : '',
      km_satz_netto: m.km_satz_netto != null ? String(m.km_satz_netto) : '',
      steuersatz_prozent: String(m.steuersatz_prozent), aktiv: m.aktiv, notiz: m.notiz ?? '',
    });
    setOk(null); setFehler(null);
  }

  async function speichern() {
    if (!uid || !form.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setSpeichert(true); setFehler(null); setOk(null);
    const payload = {
      owner_user_id: uid, bezeichnung: form.bezeichnung.trim(), art: form.art,
      stundensatz_netto: numOrNull(form.stundensatz_netto),
      wegepauschale_netto: numOrNull(form.wegepauschale_netto),
      km_satz_netto: numOrNull(form.km_satz_netto),
      steuersatz_prozent: numOrNull(form.steuersatz_prozent) ?? 19,
      aktiv: form.aktiv, notiz: form.notiz.trim() || null,
    };
    try {
      if (form.id) {
        const { error } = await supabase.from('forst_einsatzmittel').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('forst_einsatzmittel').insert(payload);
        if (error) throw error;
      }
      setOk(form.id ? 'Gespeichert.' : 'Einsatzmittel angelegt.');
      setForm(leerForm()); await ladeListe();
    } catch {
      setFehler('Speichern fehlgeschlagen.');
    } finally { setSpeichert(false); }
  }

  const aktive = liste.filter((m) => m.aktiv).length;
  const ohneSatz = liste.filter((m) => m.aktiv && m.stundensatz_netto == null).length;

  const augePunkte: string[] = [];
  if (ohneSatz > 0) augePunkte.push(`${ohneSatz} aktive(s) Einsatzmittel ohne Stundensatz — für Angebote ergänzen`);
  if (aktive === 0) augePunkte.push('Noch kein aktives Einsatzmittel hinterlegt.');
  if (augePunkte.length === 0) augePunkte.push('Alle aktiven Einsatzmittel haben einen Stundensatz.');
  const augeStimmung: 'gut' | 'neutral' | 'achtung' = ohneSatz > 0 ? 'neutral' : 'gut';

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🌲 Forst & Baumpflege</h1>
      <div style={styles.subnav}>
        <Link href="/dashboard/forst" style={styles.subnavLink}>Baumkataster</Link>
        <span style={styles.subnavAktiv}>Einsatzmittel &amp; Sätze</span>
        <Link href="/dashboard/forst/auftraege" style={styles.subnavLink}>Aufträge</Link>
        <Link href="/dashboard/forst/nachweise" style={styles.subnavLink}>Nachweise</Link>
      </div>
      <p style={styles.sub}>
        Deine Maschinen und Fahrzeuge mit Stundensatz und Wegepauschale — die Preis-Grundlage für Fäll- und Pflegeaufträge.
      </p>

      {!laden && (
        <div style={styles.kpiGrid}>
          <Kpi label="Einsatzmittel" value={String(liste.length)} accent={C.cyan} />
          <Kpi label="Aktiv" value={String(aktive)} accent={C.green} />
          <Kpi label="Ohne Stundensatz" value={String(ohneSatz)} accent={ohneSatz > 0 ? C.warn : C.green} />
        </div>
      )}

      {!laden && liste.length > 0 && (
        <KiAuge
          modul="Einsatzmittel"
          regel={{ klartext: `${liste.length} Einsatzmittel hinterlegt, davon ${aktive} aktiv.`, punkte: augePunkte, stimmung: augeStimmung }}
          aktionHref="/dashboard/forst/einsatzmittel"
          aktionText="Zu den Einsatzmitteln"
        />
      )}

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Formular */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800 }}>{form.id ? 'Einsatzmittel bearbeiten' : 'Einsatzmittel anlegen'}</div>
          {form.id && <button style={styles.ghost} onClick={neu}>+ Neues statt bearbeiten</button>}
        </div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1, minWidth: 160 }} value={form.bezeichnung} onChange={(e) => setF('bezeichnung', e.target.value)} placeholder="Bezeichnung (z. B. Seilwinde, Hubsteiger 18 m)" />
          <label style={styles.lab}>Art
            <select style={styles.inp} value={form.art} onChange={(e) => setF('art', e.target.value as Art)}>
              {(Object.keys(ART_LABEL) as Art[]).map((a) => <option key={a} value={a}>{ART_LABEL[a]}</option>)}
            </select>
          </label>
        </div>
        <div style={styles.row}>
          <label style={styles.lab}>Stundensatz €<input style={{ ...styles.inp, width: 110 }} value={form.stundensatz_netto} onChange={(e) => setF('stundensatz_netto', e.target.value)} inputMode="decimal" placeholder="z. B. 85" /></label>
          <label style={styles.lab}>Wegepauschale €<input style={{ ...styles.inp, width: 120 }} value={form.wegepauschale_netto} onChange={(e) => setF('wegepauschale_netto', e.target.value)} inputMode="decimal" placeholder="z. B. 45" /></label>
          <label style={styles.lab}>km-Satz € (optional)<input style={{ ...styles.inp, width: 130 }} value={form.km_satz_netto} onChange={(e) => setF('km_satz_netto', e.target.value)} inputMode="decimal" placeholder="z. B. 1,20" /></label>
          <label style={styles.lab}>USt %<input style={{ ...styles.inp, width: 70 }} value={form.steuersatz_prozent} onChange={(e) => setF('steuersatz_prozent', e.target.value)} inputMode="decimal" /></label>
          <label style={styles.check}><input type="checkbox" checked={form.aktiv} onChange={(e) => setF('aktiv', e.target.checked)} /> aktiv</label>
        </div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1, minWidth: 160 }} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} placeholder="Notiz (optional)" />
          <button style={{ ...styles.primaer, opacity: speichert ? 0.5 : 1 }} onClick={speichern} disabled={speichert}>
            {speichert ? 'Speichert …' : form.id ? 'Speichern' : '＋ Anlegen'}
          </button>
        </div>
      </div>

      {/* Liste */}
      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.card}>
          <div style={{ fontWeight: 800 }}>Einsatzmittel</div>
          {liste.map((m) => (
            <button key={m.id} style={{ ...styles.zeile, opacity: m.aktiv ? 1 : 0.55 }} onClick={() => editieren(m)}>
              <span style={{ minWidth: 150, fontWeight: 700 }}>{m.bezeichnung}</span>
              <span style={{ minWidth: 110, color: C.textDim }}>{ART_LABEL[m.art]}</span>
              <span style={{ flex: 1, color: C.textDim }}>
                {m.stundensatz_netto != null ? `${eur(m.stundensatz_netto)}/Std` : 'kein Stundensatz'}
                {m.wegepauschale_netto != null ? ` · Anfahrt ${eur(m.wegepauschale_netto)}` : ''}
                {m.km_satz_netto != null ? ` · ${eur(m.km_satz_netto)}/km` : ''}
              </span>
              <span style={{ color: m.aktiv ? C.green : C.textDim, flexShrink: 0 }}>{m.aktiv ? 'aktiv' : 'inaktiv'}</span>
            </button>
          ))}
          {!liste.length && <p style={styles.dim}>Noch keine Einsatzmittel. Leg oben dein erstes an — z. B. Seilwinde, 85 €/Std.</p>}
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
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text, alignSelf: 'flex-end', paddingBottom: 8 },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: C.text, fontFamily: 'inherit', fontSize: 14 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
