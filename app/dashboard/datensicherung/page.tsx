'use client';

// ============================================================
// ARGONAUT OS · Datensicherung / Backup (Chef)
// „Meine kompletten Daten exportieren" als Sicherung: ein Excel-Workbook mit
// je einem Blatt pro Bereich (Kunden, Rechnungen, Angebote, Aufträge …) plus
// eine dependency-freie JSON-Datei. Alles RLS-scoped (nur die eigenen Daten),
// jede Quelle defensiv (fehlt eine Tabelle, wird sie still übersprungen),
// vollständig paginiert (kein Abschneiden). Kein neues SQL.
// exceljs ist bereits im Projekt; wird per dynamischem Import geladen.
// Pfad: app/dashboard/datensicherung/page.tsx
// ============================================================

import { useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Row = Record<string, unknown>;

// Minimal-Typen für den dynamisch geladenen exceljs-Browser-Build (kein any/@ts-expect-error).
type XlsWS = {
  columns: { header: string; key: string; width: number }[];
  getRow: (n: number) => { font: { bold?: boolean } };
  addRow: (v: unknown) => unknown;
};
type XlsWB = { creator: string; addWorksheet: (name: string) => XlsWS; xlsx: { writeBuffer: () => Promise<ArrayBuffer> } };
type XlsMod = { Workbook: new () => XlsWB };

// Welche Bereiche in die Sicherung wandern (Blatt-Name ≤ 31 Zeichen für Excel).
const BEREICHE: { table: string; blatt: string; label: string }[] = [
  { table: 'kontakte', blatt: 'Kunden', label: '🧭 Kunden & Kontakte' },
  { table: 'leads', blatt: 'Anfragen', label: '🎯 Anfragen & Leads' },
  { table: 'angebote', blatt: 'Angebote', label: '🗒 Angebote' },
  { table: 'auftraege', blatt: 'Auftraege', label: '📋 Aufträge' },
  { table: 'rechnungen', blatt: 'Rechnungen', label: '🧾 Rechnungen' },
  { table: 'eingangsbelege', blatt: 'Ausgaben', label: '💶 Ausgaben & Belege' },
  { table: 'projekte', blatt: 'Projekte', label: '📁 Projekte' },
  { table: 'termine', blatt: 'Termine', label: '🗓 Termine' },
];

function heuteStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Wert für Zelle/JSON: Objekte/Arrays als Text, null → leer. */
function zelle(v: unknown): string | number | boolean {
  if (v == null) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}

/** Eine Tabelle vollständig laden (paginiert). Fehler/RLS → leeres Array. */
async function ladeAlles(table: string): Promise<Row[]> {
  const out: Row[] = [];
  const CHUNK = 1000;
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + CHUNK - 1);
    if (error || !data) break;
    out.push(...(data as Row[]));
    if (data.length < CHUNK) break;
    if (from > 200000) break; // harte Obergrenze als Sicherheitsnetz
  }
  return out;
}

function ladeDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function DatensicherungPage() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<string | null>(null);

  async function sammle(): Promise<{ daten: Record<string, Row[]>; zeilen: number }> {
    const daten: Record<string, Row[]> = {};
    let zeilen = 0;
    for (const b of BEREICHE) {
      setStatus(`Lade ${b.label} …`);
      const rows = await ladeAlles(b.table);
      daten[b.blatt] = rows;
      zeilen += rows.length;
    }
    return { daten, zeilen };
  }

  async function alsExcel() {
    setBusy(true); setFehler(null); setFertig(null);
    try {
      const { daten, zeilen } = await sammle();
      setStatus('Baue Excel-Datei …');
      const mod = await import('exceljs');
      const ExcelJS = ((mod as unknown as { default?: XlsMod }).default ?? (mod as unknown as XlsMod));
      const wb = new ExcelJS.Workbook();
      wb.creator = 'ARGONAUT OS';
      for (const b of BEREICHE) {
        const rows = daten[b.blatt] || [];
        const ws = wb.addWorksheet(b.blatt);
        if (rows.length === 0) { ws.addRow(['(keine Daten)']); continue; }
        const keys = Array.from(rows.reduce((set: Set<string>, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
        ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 2)) }));
        ws.getRow(1).font = { bold: true };
        for (const r of rows) ws.addRow(keys.map((k) => zelle(r[k])));
      }
      const buf = await wb.xlsx.writeBuffer();
      ladeDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `ARGONAUT-Backup_${heuteStr()}.xlsx`);
      setFertig(`Excel-Sicherung erstellt — ${zeilen} Datensätze aus ${BEREICHE.length} Bereichen.`);
    } catch (e) {
      setFehler('Konnte die Excel-Sicherung nicht erstellen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); setStatus(''); }
  }

  async function alsJson() {
    setBusy(true); setFehler(null); setFertig(null);
    try {
      const { daten, zeilen } = await sammle();
      setStatus('Baue JSON-Datei …');
      const inhalt = { erzeugt_am: new Date().toISOString(), quelle: 'ARGONAUT OS', bereiche: daten };
      ladeDownload(new Blob([JSON.stringify(inhalt, null, 2)], { type: 'application/json' }), `ARGONAUT-Backup_${heuteStr()}.json`);
      setFertig(`JSON-Sicherung erstellt — ${zeilen} Datensätze aus ${BEREICHE.length} Bereichen.`);
    } catch (e) {
      setFehler('Konnte die JSON-Sicherung nicht erstellen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); setStatus(''); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Verwaltung</div>
      <h1 style={styles.h1}>🗄 Datensicherung</h1>
      <p style={styles.sub}>
        Laden Sie Ihre kompletten Daten als Sicherung herunter — gehört Ihnen, jederzeit exportierbar. Das
        <strong> Excel-Workbook</strong> enthält je Bereich ein eigenes Tabellenblatt. Die <strong>JSON-Datei</strong> ist
        die vollständige, maschinenlesbare Sicherung. Es werden nur Ihre eigenen Daten exportiert.
      </p>

      <div style={styles.card}>
        <div style={styles.kartenkopf}>Enthaltene Bereiche</div>
        <div style={styles.chips}>
          {BEREICHE.map((b) => <span key={b.table} style={styles.chip}>{b.label}</span>)}
        </div>

        <div style={styles.knopfreihe}>
          <button style={{ ...styles.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={alsExcel}>
            {busy ? 'Bitte warten …' : '⬇ Komplett-Backup als Excel'}
          </button>
          <button style={{ ...styles.line, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={alsJson}>
            ⬇ Als JSON
          </button>
        </div>

        {busy && status && <div style={styles.hint}>{status}</div>}
        {fertig && <div style={styles.ok}>✓ {fertig}</div>}
        {fehler && <div style={styles.err}>{fehler}</div>}
      </div>

      <p style={styles.fuss}>
        Tipp: Legen Sie die Sicherung an einem sicheren Ort ab (z. B. externe Festplatte). Für die laufende Buchhaltung
        gibt es zusätzlich die gezielten Exporte (DATEV, ELSTER, CSV) in den jeweiligen Modulen.
      </p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 820, margin: '0 auto' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(26px, 2.4vw, 38px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 15, lineHeight: 1.55, maxWidth: 720 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  kartenkopf: { fontWeight: 800, fontSize: 14, color: C.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { background: 'rgba(143,163,190,0.1)', border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 13, color: C.text },
  knopfreihe: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  gold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 11, padding: '13px 20px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  line: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 11, padding: '13px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 14, marginTop: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
  fuss: { color: C.textDim, fontSize: 12.5, lineHeight: 1.6, marginTop: 20 },
};
