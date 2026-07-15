'use client';

// ============================================================
// ARGONAUT OS · HR · Team-Abwesenheitskalender (Chef-Überblick)
// Monatsansicht: wer ist wann weg (Urlaub gold / Krank rot / beantragt blass)
// Liest aus hr_abwesenheiten + mitarbeiter (RLS owner). Rein additiv.
// Pfad: app/dashboard/team-kalender/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navySoft: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)', danger: '#E06666',
  urlaub: '#C9A84C', krank: '#E06666',
};

type Mitarbeiter = { id: string; vorname: string; nachname: string };
type Abwesenheit = { id: string; mitarbeiter_id: string; typ: string; von: string; bis: string; status: string };

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseD(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
// ---- Feiertage (DE, pro Bundesland) — wartungsfrei berechnet ----
function osterSonntag(jahr: number): Date {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tg = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tg);
}
function feiertageSet(jahr: number, bl: string): Set<string> {
  const s = new Set<string>();
  const add = (d: Date) => s.add(ymd(d));
  const fix = (m: number, t: number) => new Date(jahr, m - 1, t);
  const ostern = osterSonntag(jahr);
  const off = (n: number) => { const d = new Date(ostern); d.setDate(d.getDate() + n); return d; };
  add(fix(1, 1)); add(off(-2)); add(off(1)); add(fix(5, 1)); add(off(39)); add(off(50));
  add(fix(10, 3)); add(fix(12, 25)); add(fix(12, 26));
  if (['BW', 'BY', 'ST'].includes(bl)) add(fix(1, 6));
  if (['BE', 'MV'].includes(bl)) add(fix(3, 8));
  if (['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(bl)) add(off(60));
  if (['SL'].includes(bl)) add(fix(8, 15));
  if (['TH'].includes(bl)) add(fix(9, 20));
  if (['BB', 'MV', 'SN', 'ST', 'TH', 'HB', 'HH', 'NI', 'SH'].includes(bl)) add(fix(10, 31));
  if (['BW', 'BY', 'NW', 'RP', 'SL'].includes(bl)) add(fix(11, 1));
  if (['SN'].includes(bl)) { const d = fix(11, 23); let back = ((d.getDay() - 3 + 7) % 7); if (back === 0) back = 7; d.setDate(23 - back); add(d); }
  return s;
}

export default function TeamKalenderPage() {
  const [ma, setMa] = useState<Mitarbeiter[]>([]);
  const [abw, setAbw] = useState<Abwesenheit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const heute = new Date();
  const [jahr, setJahr] = useState(heute.getFullYear());
  const [monat, setMonat] = useState(heute.getMonth()); // 0-basiert
  const [bundesland, setBundesland] = useState('BW');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (uid) {
        const { data: einst } = await supabase.from('hr_einstellungen').select('bundesland').eq('owner_user_id', uid).maybeSingle();
        if (einst?.bundesland) setBundesland(einst.bundesland);
      }
      const { data: maRows, error: maErr } = await supabase
        .from('mitarbeiter').select('id,vorname,nachname').order('nachname', { ascending: true });
      if (maErr) throw maErr;
      setMa((maRows as Mitarbeiter[]) ?? []);

      // Abwesenheiten, die den Monat berühren
      const ersterTag = `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
      const letzterTagDate = new Date(jahr, monat + 1, 0);
      const letzterTag = ymd(letzterTagDate);

      const { data: abwRows, error: abwErr } = await supabase
        .from('hr_abwesenheiten')
        .select('id,mitarbeiter_id,typ,von,bis,status')
        .lte('von', letzterTag)
        .gte('bis', ersterTag);
      if (abwErr) throw abwErr;
      setAbw((abwRows as Abwesenheit[]) ?? []);
    } catch (e: unknown) {
      setError('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLoading(false); }
  }, [jahr, monat]);

  useEffect(() => { load(); }, [load]);

  function vorMonat() { if (monat === 0) { setMonat(11); setJahr((j) => j - 1); } else setMonat((m) => m - 1); }
  function nachMonat() { if (monat === 11) { setMonat(0); setJahr((j) => j + 1); } else setMonat((m) => m + 1); }
  function heuteSetzen() { setJahr(heute.getFullYear()); setMonat(heute.getMonth()); }

  const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
  const tage = Array.from({ length: tageImMonat }, (_, i) => i + 1);

  const feiertage = feiertageSet(jahr, bundesland);
  const istFeiertag = (tag: number) => feiertage.has(ymd(new Date(jahr, monat, tag)));

  // Belegung pro Mitarbeiter/Tag ermitteln
  function zustandFuer(maId: string, tag: number): { typ: string; status: string } | null {
    const d = new Date(jahr, monat, tag);
    for (const a of abw) {
      if (a.mitarbeiter_id !== maId) continue;
      const von = parseD(a.von); const bis = parseD(a.bis);
      if (d >= von && d <= bis) return { typ: a.typ, status: a.status };
    }
    return null;
  }

  function zellFarbe(z: { typ: string; status: string } | null): CSSProperties {
    if (!z) return {};
    const beantragt = z.status === 'beantragt';
    if (z.typ === 'urlaub') {
      return beantragt
        ? { background: 'repeating-linear-gradient(45deg, rgba(201,168,76,0.25), rgba(201,168,76,0.25) 4px, transparent 4px, transparent 8px)', border: `1px dashed ${C.gold}` }
        : { background: C.urlaub };
    }
    if (z.typ === 'krankheit') {
      return { background: C.krank };
    }
    return {};
  }

  const istHeute = (tag: number) => jahr === heute.getFullYear() && monat === heute.getMonth() && tag === heute.getDate();
  const wochentag = (tag: number) => { const wd = new Date(jahr, monat, tag).getDay(); return wd === 0 ? 6 : wd - 1; }; // Mo=0..So=6
  const istWE = (tag: number) => { const w = wochentag(tag); return w >= 5; };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>ARGONAUT OS · HR</div>
          <h1 style={styles.h1}>Team-Kalender</h1>
          <p style={styles.sub}>Wer ist wann abwesend — auf einen Blick.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={styles.navBtn} onClick={vorMonat}>‹</button>
          <button style={styles.todayBtn} onClick={heuteSetzen}>Heute</button>
          <button style={styles.navBtn} onClick={nachMonat}>›</button>
          <span style={styles.monatLabel}>{MONATE[monat]} {jahr}</span>
        </div>
      </div>

      <div style={styles.legend}>
        <Legende farbe={C.urlaub} text="Urlaub (genehmigt)" />
        <Legende farbe="transparent" gestrichelt text="Urlaub (beantragt)" />
        <Legende farbe={C.krank} text="Krank" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, display: 'inline-block', background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.3)' }} />
          <span style={{ fontSize: 13, color: C.textDim }}>Feiertag</span>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {loading && <div style={styles.stateBox}>Lädt …</div>}

      {!loading && ma.length === 0 && (
        <div style={styles.stateBox}>Noch keine Mitarbeiter angelegt.</div>
      )}

      {!loading && ma.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.thName }}>Mitarbeiter</th>
                {tage.map((t) => (
                  <th key={t} style={{ ...styles.thDay, ...(istWE(t) ? styles.weHead : {}), ...(istFeiertag(t) ? styles.feiertagHead : {}), ...(istHeute(t) ? styles.todayHead : {}) }} title={istFeiertag(t) ? 'Feiertag' : ''}>
                    <div style={{ fontSize: 10, color: C.textDim }}>{WT[wochentag(t)]}</div>
                    <div>{t}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ma.map((m) => (
                <tr key={m.id}>
                  <td style={styles.tdName}>{m.vorname} {m.nachname}</td>
                  {tage.map((t) => {
                    const z = zustandFuer(m.id, t);
                    return (
                      <td key={t} style={{ ...styles.tdDay, ...(istWE(t) ? styles.weCell : {}), ...(istFeiertag(t) ? styles.feiertagCell : {}), ...(istHeute(t) ? styles.todayCell : {}) }}>
                        <div style={{ ...styles.dayMark, ...zellFarbe(z) }} title={z ? (z.typ === 'urlaub' ? (z.status === 'beantragt' ? 'Urlaub beantragt' : 'Urlaub') : 'Krank') : (istFeiertag(t) ? 'Feiertag' : '')} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Legende({ farbe, text, gestrichelt }: { farbe: string; text: string; gestrichelt?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 16, height: 16, borderRadius: 4, display: 'inline-block',
        background: gestrichelt ? 'repeating-linear-gradient(45deg, rgba(201,168,76,0.25), rgba(201,168,76,0.25) 4px, transparent 4px, transparent 8px)' : farbe,
        border: gestrichelt ? `1px dashed ${C.gold}` : 'none',
      }} />
      <span style={{ fontSize: 13, color: C.textDim }}>{text}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '32px 28px 64px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 20 },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 30, fontWeight: 700, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 0', fontSize: 15 },
  navBtn: { background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 14px', color: C.text, fontSize: 18, cursor: 'pointer', lineHeight: 1 },
  todayBtn: { background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 14px', color: C.cyan, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  monatLabel: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 18, fontWeight: 700, color: C.text, marginLeft: 8, minWidth: 150 },
  legend: { display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 18 },
  stateBox: { padding: 40, textAlign: 'center', color: C.textDim, fontSize: 15 },
  errorBox: { padding: 16, color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, marginBottom: 16 },
  tableWrap: { overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 12, background: C.navySoft },
  table: { borderCollapse: 'collapse', width: '100%' },
  thName: { position: 'sticky', left: 0, background: C.navySoft, textAlign: 'left', padding: '12px 14px', fontSize: 13, color: C.textDim, fontWeight: 600, zIndex: 2, minWidth: 160, borderBottom: `1px solid ${C.line}` },
  thDay: { padding: '6px 0', minWidth: 30, fontSize: 13, color: C.text, fontWeight: 600, textAlign: 'center', borderBottom: `1px solid ${C.line}` },
  weHead: { background: 'rgba(255,255,255,0.02)' },
  feiertagHead: { background: 'rgba(0,229,255,0.06)' },
  feiertagCell: { background: 'rgba(0,229,255,0.05)' },
  todayHead: { background: 'rgba(0,229,255,0.12)', color: C.cyan },
  tdName: { position: 'sticky', left: 0, background: C.navySoft, padding: '10px 14px', fontSize: 14, color: C.text, fontWeight: 500, whiteSpace: 'nowrap', zIndex: 1, borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: `1px solid ${C.line}` },
  tdDay: { padding: 3, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  weCell: { background: 'rgba(255,255,255,0.02)' },
  todayCell: { background: 'rgba(0,229,255,0.06)' },
  dayMark: { width: 22, height: 22, borderRadius: 5, margin: '0 auto' },
};
