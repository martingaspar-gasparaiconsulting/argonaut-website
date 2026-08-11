'use client';

// ============================================================
// ARGONAUT OS · ELSTER · USt-Voranmeldung (Punkt 12)
// Rechnet aus bezahlten Rechnungen + Vorsteuer die UStVA-Kennziffern (Kz 81/
// 86/66/83) für einen Zeitraum. Die direkte Übermittlung an ELSTER (ERiC) ist
// anschlussfertig vorbereitet, aber „in Aufbau". Pfad: app/dashboard/elster/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { baueUstva, formatEuro, type UstvaErgebnis } from '@/lib/ustva';
import { ustvaCsv, ustvaZeilen, euroText } from '@/lib/ustvaExport';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

function monatsStart(offset = 0) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return d.toISOString().slice(0, 10); }
function monatsEnde() { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); }

export default function ElsterSeite() {
  const [von, setVon] = useState(monatsStart(0));
  const [bis, setBis] = useState(monatsEnde());
  const [erg, setErg] = useState<UstvaErgebnis | null>(null);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // ELSTER-Zugang (in Aufbau)
  const [verbAuf, setVerbAuf] = useState(false);
  const [steuernummer, setSteuernummer] = useState('');
  const [zertPw, setZertPw] = useState('');
  const [verbunden, setVerbunden] = useState(false);

  const rechnen = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [r, b] = await Promise.all([
        supabase.from('rechnungen').select('netto_summe, mwst_summe, bezahlt_am, zahlungsstatus')
          .eq('zahlungsstatus', 'bezahlt').gte('bezahlt_am', von).lte('bezahlt_am', bis).limit(5000),
        supabase.from('eingangsbelege').select('ust_betrag, belegdatum')
          .gte('belegdatum', von).lte('belegdatum', bis).limit(5000),
      ]);
      const rechnungen = (r.data as unknown as Array<Record<string, unknown>>) ?? [];
      const belege = (b.data as unknown as Array<Record<string, unknown>>) ?? [];
      const vorsteuer = belege.reduce((s, x) => s + (Number(x.ust_betrag) || 0), 0);
      setErg(baueUstva(rechnungen.map((x) => ({ netto_summe: Number(x.netto_summe) || 0, mwst_summe: Number(x.mwst_summe) || 0 })), vorsteuer));
    } catch (e) {
      setFehler('Berechnung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [von, bis]);

  const verbLaden = useCallback(async () => {
    try { const rv = await fetch('/api/elster/verbindung'); const jv = await rv.json(); if (jv?.ok) setVerbunden(!!jv.verbunden); } catch { /* egal */ }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user?.id) { setFehler('Nicht angemeldet.'); return; }
      await rechnen();
      await verbLaden();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function zugangSpeichern() {
    if (!steuernummer.trim() || !zertPw.trim()) { setFehler('Bitte Steuernummer und Zertifikat-Passwort eingeben.'); return; }
    setBusy('verb'); setFehler(null);
    try {
      const rr = await fetch('/api/elster/verbindung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ steuernummer: steuernummer.trim(), zertifikat_pw: zertPw.trim() }) });
      const j = await rr.json();
      if (!j?.ok) { setFehler(j?.error || 'Speichern fehlgeschlagen.'); return; }
      setZertPw(''); setVerbAuf(false); setVerbunden(true);
      setOk('ELSTER-Zugang gespeichert. Die direkte Übermittlung wird gerade finalisiert.');
    } finally { setBusy(null); }
  }

  function exportCsv() {
    if (!erg) return;
    const csv = ustvaCsv(erg, von, bis);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `UStVA_${von}_${bis}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (!erg) return;
    setBusy('pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFontSize(16); doc.text('Umsatzsteuer-Voranmeldung', 20, 22);
      doc.setFontSize(10); doc.setTextColor(110);
      doc.text(`Zeitraum: ${von} bis ${bis}`, 20, 29);
      doc.text('Vorbereitung/Überblick — verbindliche Anmeldung über ELSTER-Online.', 20, 34);
      doc.setTextColor(0);
      let y = 48;
      doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('Kz', 20, y); doc.text('Position', 34, y); doc.text('Betrag', 190, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 2; doc.line(20, y, 190, y); y += 7;
      for (const r of ustvaZeilen(erg)) {
        doc.text(r.kz, 20, y);
        doc.text(r.position, 34, y);
        doc.text(r.betrag, 190, y, { align: 'right' });
        y += 7;
      }
      y += 1; doc.line(20, y, 190, y); y += 9;
      doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text(erg.zahllast >= 0 ? 'USt-Zahllast ans Finanzamt' : 'Erstattung vom Finanzamt', 20, y);
      doc.text(euroText(Math.abs(erg.zahllast)), 190, y, { align: 'right' });
      doc.save(`UStVA_${von}_${bis}.pdf`);
    } catch {
      setFehler('PDF konnte nicht erstellt werden.');
    } finally { setBusy(null); }
  }

  function monatSetzen(offset: number) { setVon(monatsStart(offset)); const d = new Date(); d.setMonth(d.getMonth() + offset + 1); d.setDate(0); setBis(d.toISOString().slice(0, 10)); }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Finanzen · ELSTER</div>
      <h1 style={styles.h1}>🏛 USt-Voranmeldung</h1>
      <p style={styles.sub}>ARGONAUT stellt deine Umsatzsteuer-Voranmeldung aus den bezahlten Rechnungen und der Vorsteuer zusammen — mit den amtlichen Kennziffern. Als Vorbereitung und Überblick; die verbindliche Anmeldung prüft dein Steuerberater.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* ELSTER-Zugang (in Aufbau) */}
      <div style={styles.verbBox}>
        <span style={styles.beta}>in Aufbau</span>
        {verbunden
          ? <span style={{ color: C.green, fontWeight: 700 }}>✓ ELSTER-Zugang hinterlegt · direkte Übermittlung folgt</span>
          : <span style={{ color: C.textDim, fontSize: 13.5 }}>🔗 ELSTER-Zugang (Steuernummer + Zertifikat) schon jetzt hinterlegbar — die Übermittlung ans Finanzamt wird gerade finalisiert.</span>}
        <span style={{ flex: 1 }} />
        <button style={styles.mini} onClick={() => setVerbAuf((v) => !v)}>{verbAuf ? 'Abbrechen' : (verbunden ? 'Zugang ändern' : 'ELSTER verbinden')}</button>
      </div>
      {verbAuf && (
        <div style={{ ...styles.card, marginBottom: 14 }}>
          <div style={styles.grid}>
            <label style={styles.lab}>Steuernummer<input style={styles.inp} value={steuernummer} onChange={(e) => setSteuernummer(e.target.value)} placeholder="z. B. 12/345/67890" /></label>
            <label style={styles.lab}>ELSTER-Zertifikat-Passwort<input style={styles.inp} type="password" value={zertPw} onChange={(e) => setZertPw(e.target.value)} /></label>
          </div>
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'verb' ? 0.6 : 1 }} disabled={busy === 'verb'} onClick={zugangSpeichern}>🔗 Zugang speichern</button>
          <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 8 }}>Das Zertifikat-Passwort wird verschlüsselt gespeichert und nie im Browser angezeigt.</div>
        </div>
      )}

      {/* Zeitraum */}
      <div style={styles.card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={styles.lab}>Von<input type="date" style={styles.inp} value={von} onChange={(e) => setVon(e.target.value)} /></label>
          <label style={styles.lab}>Bis<input type="date" style={styles.inp} value={bis} onChange={(e) => setBis(e.target.value)} /></label>
          <button style={styles.primaer} disabled={laden} onClick={() => rechnen()}>{laden ? 'Rechnet …' : '🧮 Berechnen'}</button>
          <button style={styles.ghost} onClick={() => { monatSetzen(-1); }}>Letzter Monat</button>
          <button style={styles.ghost} onClick={() => { monatSetzen(0); }}>Dieser Monat</button>
        </div>
      </div>

      {erg && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <div style={styles.zahllastZeile}>
            <span style={{ color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 13 }}>{erg.zahllast >= 0 ? 'USt-Zahllast ans Finanzamt' : 'Erstattung vom Finanzamt'}</span>
            <span style={{ fontSize: 30, fontWeight: 800, color: erg.zahllast >= 0 ? C.warn : C.green }}>{formatEuro(Math.abs(erg.zahllast))}</span>
          </div>
          <table style={styles.tab}>
            <thead><tr><th style={{ ...styles.th, width: 70 }}>Kz</th><th style={styles.th}>Position</th><th style={{ ...styles.th, textAlign: 'right' }}>Betrag</th></tr></thead>
            <tbody>
              {erg.kennziffern.map((k, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...styles.td, color: k.kz === '—' ? C.textDim : C.gold, fontWeight: 700 }}>{k.kz}</td>
                  <td style={{ ...styles.td, color: k.label.startsWith('  ') ? C.textDim : C.text }}>{k.label.trim()}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{formatEuro(k.wert)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={{ ...styles.primaer, opacity: busy === 'pdf' ? 0.6 : 1 }} disabled={busy === 'pdf'} onClick={exportPdf}>{busy === 'pdf' ? 'Erstellt …' : '⬇ Als PDF'}</button>
            <button style={styles.ghost} onClick={exportCsv}>⬇ Als CSV</button>
            <button style={{ ...styles.ghost, opacity: 0.55, cursor: 'not-allowed' }} disabled title="Wird gerade finalisiert">📤 An ELSTER übermitteln <span style={styles.betaMini}>in Aufbau</span></button>
            <span style={{ color: C.textDim, fontSize: 12.5 }}>PDF/CSV zum fehlerfreien Abtippen in ELSTER-Online.</span>
          </div>
          <p style={styles.disclaimer}>Automatische Zusammenstellung nach Zufluss (§ 11 EStG — nur bezahlte Rechnungen). Steuersätze je Rechnung anhand des ausgewiesenen USt-Betrags erkannt. Vorbereitung/Überblick — die verbindliche Voranmeldung erstellt bzw. prüft dein Steuerberater.</p>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 900, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  verbBox: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12 },
  beta: { background: 'rgba(0,229,255,0.12)', color: C.cyan, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' },
  betaMini: { background: 'rgba(10,22,40,0.25)', color: C.navy, borderRadius: 999, padding: '1px 7px', fontSize: 10.5, fontWeight: 800, marginLeft: 6 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 18px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(13.5px, 1.2vw, 18px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  zahllastZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 12, marginBottom: 6, flexWrap: 'wrap' },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', color: C.textDim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 10px', fontWeight: 700 },
  td: { padding: '9px 10px', verticalAlign: 'middle' },
  disclaimer: { color: C.textDim, fontSize: 12, lineHeight: 1.5, marginTop: 14, marginBottom: 0 },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
