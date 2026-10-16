'use client';

// ============================================================
// ARGONAUT OS · Lohnvorbereitung (LK5 Teil 1, 16.10.2026)
// Monatsübersicht je Mitarbeiter aus Zeiterfassung, Abwesenheiten und
// Reisekosten — als CSV fürs Lohnprogramm und PDF fürs Steuerbüro.
// Keine Lohnabrechnung: ARGONAUT sortiert die Zeiten nur in die
// Zeitfenster (Nacht, Sonntag, Feiertag); Sätze regelt Vertrag/Tarif.
// Nur lesend. Unterpfad von /dashboard/personal (Modul personal, sensibel).
// Logik: lib/lohnvorbereitung.ts (getestet).
// Pfad: app/dashboard/personal/lohnvorbereitung/page.tsx
// ============================================================

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { feiertagsSet } from '@/lib/feiertage';
import {
  monatsZeile, monatsGrenzen, csvExport, stunden, arbeitstage, ERKLAERUNG,
  type Mitarbeiter, type Sitzung, type Abwesenheit, type Spesen, type MonatsZeile,
} from '@/lib/lohnvorbereitung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

function vormonat(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monatText(m: string): string {
  const [j, mo] = m.split('-').map(Number);
  return new Date(j, mo - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}
function pdfSicher(t: string): string {
  return t.replace(/[–—]/g, '-').replace(/[„“”]/g, '"').replace(/…/g, '...');
}

export default function Lohnvorbereitung() {
  const [monat, setMonat] = useState(vormonat);
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [sitzungen, setSitzungen] = useState<Sitzung[]>([]);
  const [abw, setAbw] = useState<Abwesenheit[]>([]);
  const [spesen, setSpesen] = useState<Spesen[]>([]);
  const [bundesland, setBundesland] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); return; }
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      const betrieb = chef || uid;
      const [m, e] = await Promise.all([
        supabase.from('mitarbeiter').select('*').eq('owner_user_id', betrieb).order('nachname', { ascending: true }),
        supabase.from('hr_einstellungen').select('bundesland').eq('owner_user_id', betrieb).maybeSingle(),
      ]);
      if (m.error) { setFehler('Mitarbeiter konnten nicht geladen werden.'); return; }
      setMitarbeiter(((m.data as (Mitarbeiter & { status?: string | null })[]) ?? []).filter((x) => x.status !== 'ausgeschieden'));
      setBundesland(((e.data as { bundesland?: string | null } | null)?.bundesland) ?? null);
      try {
        const { data: ci } = await supabase.from('web_ci').select('firma').eq('owner_user_id', betrieb).maybeSingle();
        setFirma(String((ci as { firma?: string | null } | null)?.firma ?? '').trim());
      } catch { /* egal */ }
    })();
  }, []);

  const laden = useCallback(async () => {
    const g = monatsGrenzen(monat); if (!g) return;
    setLaedt(true); setFehler(null);
    try {
      const [z, a, r] = await Promise.all([
        supabase.from('hr_zeiterfassung').select('mitarbeiter_id, datum, kommen_um, gehen_um, pause_minuten').gte('datum', g.von).lte('datum', g.bis).limit(20000),
        supabase.from('hr_abwesenheiten').select('mitarbeiter_id, typ, von, bis, status').lte('von', g.bis).gte('bis', g.von).limit(5000),
        supabase.from('reisekosten').select('reisender, abreise, gesamt').gte('abreise', `${g.von}T00:00:00`).lte('abreise', `${g.bis}T23:59:59`).limit(5000),
      ]);
      if (z.error) { setFehler('Zeiten konnten nicht geladen werden.'); return; }
      setSitzungen((z.data as Sitzung[]) ?? []);
      setAbw(a.error ? [] : ((a.data as Abwesenheit[]) ?? []));
      setSpesen(r.error ? [] : ((r.data as Spesen[]) ?? []));
    } finally { setLaedt(false); }
  }, [monat]);

  useEffect(() => { void laden(); }, [laden]);

  const feiertage = useMemo(() => {
    const g = monatsGrenzen(monat);
    return g ? feiertagsSet(g.von, g.bis, bundesland) : new Set<string>();
  }, [monat, bundesland]);
  const zeilen: MonatsZeile[] = useMemo(
    () => mitarbeiter.map((m) => monatsZeile(m, sitzungen, abw, spesen, monat, feiertage)),
    [mitarbeiter, sitzungen, abw, spesen, monat, feiertage],
  );

  function csvLaden() {
    const blob = new Blob([csvExport(zeilen, monat)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Lohnvorbereitung_${monat}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function pdfLaden() {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = 14;
    doc.setFontSize(14); doc.text(pdfSicher(`Lohnvorbereitung ${monatText(monat)}`), 12, y);
    doc.setFontSize(9); y += 6;
    doc.text(pdfSicher(`${firma || 'Betrieb'} · Bundesland ${bundesland || 'nicht hinterlegt'} · ${arbeitstage(monat, feiertage)} Arbeitstage (Mo-Fr ohne Feiertage) · erstellt ${new Date().toLocaleDateString('de-DE')}`), 12, y);
    y += 5;
    for (const l of doc.splitTextToSize(pdfSicher(ERKLAERUNG), 270)) { doc.text(l, 12, y); y += 4; }
    y += 2;
    const kopf = ['Name', 'Pers.-Nr.', 'Ist', 'Soll', 'Mehr', 'Nacht', '0-4', 'Sonntag', 'Feiertag', 'FT hoch', 'Urlaub', 'Krank', 'Spesen €'];
    const x = [12, 62, 84, 100, 116, 132, 148, 162, 180, 198, 214, 230, 246];
    doc.setFont('helvetica', 'bold'); kopf.forEach((k, i) => doc.text(k, x[i], y)); doc.setFont('helvetica', 'normal');
    y += 2; doc.line(12, y, 285, y); y += 4;
    for (const r of zeilen) {
      if (y > 190) { doc.addPage(); y = 14; }
      const werte = [pdfSicher(r.name).slice(0, 30), r.personalnummer, stunden(r.fenster.gesamt), stunden(r.sollMin), stunden(r.mehrMin), stunden(r.fenster.nacht), stunden(r.fenster.nachtTief),
        stunden(r.fenster.sonntag), stunden(r.fenster.feiertag), stunden(r.fenster.feiertagHoch), String(r.urlaubTage), String(r.krankTage), r.spesen.toFixed(2).replace('.', ',')];
      werte.forEach((w, i) => doc.text(w, x[i], y));
      y += 4.5;
      if (r.hinweise.length) { doc.setFontSize(7.5); doc.text(pdfSicher(`Hinweis: ${r.hinweise.join(' | ')}`).slice(0, 220), 16, y); doc.setFontSize(9); y += 4; }
    }
    y += 4; doc.setFontSize(8);
    doc.text('Alle Zeiten in Stunden (Dezimal). Urlaub/Krankheit in Arbeitstagen. Spesen = Reisekosten mit Abreise im Monat, Zuordnung über den Namen.', 12, Math.min(y, 200));
    doc.save(`Lohnvorbereitung_${monat}.pdf`);
  }

  const summe = useMemo(() => zeilen.reduce((s, r) => s + r.fenster.gesamt, 0), [zeilen]);
  const mitHinweis = zeilen.filter((r) => r.hinweise.length).length;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>💶 Lohnvorbereitung</h1>
      <p style={s.sub}>Monatsübersicht je Mitarbeiter aus Zeiterfassung, Urlaub/Krankheit und Reisekosten — als Datei für Ihr Lohnprogramm oder Ihr Steuerbüro. Das ist <b>keine Lohnabrechnung</b>: Zuschlagssätze regeln Arbeitsvertrag und Tarif.</p>

      <div style={s.card}>
        <div style={s.row}>
          <label style={s.lab}>Monat<input type="month" style={s.inp} value={monat} onChange={(e) => setMonat(e.target.value)} /></label>
          <div style={s.dim}>{arbeitstage(monat, feiertage)} Arbeitstage · Bundesland {bundesland || <span style={{ color: C.warn }}>nicht hinterlegt (Personal → Einstellungen) — Feiertage nur bundesweit</span>}</div>
          <div style={{ flex: 1 }} />
          <button style={s.klein} disabled={laedt || !zeilen.length} onClick={csvLaden}>⬇ CSV fürs Lohnprogramm</button>
          <button style={s.primaer} disabled={laedt || !zeilen.length} onClick={pdfLaden}>📄 PDF fürs Steuerbüro</button>
        </div>
        <div style={s.dim}>{ERKLAERUNG}</div>
      </div>

      {fehler && <div style={s.err}>{fehler}</div>}
      {!fehler && mitHinweis > 0 && <div style={s.warn}>{mitHinweis} Mitarbeiter mit Hinweisen — bitte vor der Weitergabe prüfen (offene Schichten in der Personalakte nachtragen).</div>}

      <div style={s.tabelleRahmen}>
        <table style={s.tabelle}>
          <thead><tr>
            {['Mitarbeiter', 'Ist', 'Soll', 'Mehrarbeit', 'Nacht 20–6', 'davon 0–4', 'Sonntag', 'Feiertag', 'Feiertag hoch', 'Urlaub', 'Krank', 'Spesen'].map((k) => <th key={k} style={s.th}>{k}</th>)}
          </tr></thead>
          <tbody>
            {zeilen.map((r) => (
              <tr key={r.mitarbeiter_id}>
                <td style={s.td}><div style={{ fontWeight: 700 }}>{r.name}</div>{r.hinweise.map((h) => <div key={h} style={{ color: C.warn, fontSize: 12 }}>⚠ {h}</div>)}</td>
                <td style={s.tdZ}>{stunden(r.fenster.gesamt)}</td>
                <td style={s.tdZ}>{stunden(r.sollMin) || '—'}</td>
                <td style={{ ...s.tdZ, color: r.mehrMin == null ? C.textDim : r.mehrMin < 0 ? C.danger : r.mehrMin > 0 ? C.green : C.text }}>{r.mehrMin == null ? '—' : stunden(r.mehrMin)}</td>
                <td style={s.tdZ}>{stunden(r.fenster.nacht)}</td>
                <td style={s.tdZ}>{stunden(r.fenster.nachtTief)}</td>
                <td style={s.tdZ}>{stunden(r.fenster.sonntag)}</td>
                <td style={s.tdZ}>{stunden(r.fenster.feiertag)}</td>
                <td style={s.tdZ}>{stunden(r.fenster.feiertagHoch)}</td>
                <td style={s.tdZ}>{r.urlaubTage}</td>
                <td style={s.tdZ}>{r.krankTage}</td>
                <td style={s.tdZ}>{r.spesen ? r.spesen.toFixed(2).replace('.', ',') + ' €' : '—'}</td>
              </tr>
            ))}
            {!zeilen.length && !laedt && <tr><td style={s.td} colSpan={12}>Keine Mitarbeiter angelegt.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={s.dim}>Summe Ist-Stunden: {stunden(summe)} · Zeiten in Stunden (Dezimal), Urlaub/Krankheit in Arbeitstagen (Urlaub nur genehmigt) · Spesen = Reisekosten mit Abreise im Monat, Zuordnung über den Namen des Reisenden.</div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 12 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 14.5, margin: 0, maxWidth: 820 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 15, fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 13 },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  warn: { color: C.warn, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  tabelleRahmen: { overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 12 },
  tabelle: { width: '100%', borderCollapse: 'collapse', minWidth: 980, fontSize: 14 },
  th: { textAlign: 'left', padding: '10px 10px', color: C.textDim, fontSize: 12, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', background: C.navy2 },
  td: { padding: '9px 10px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  tdZ: { padding: '9px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
};
