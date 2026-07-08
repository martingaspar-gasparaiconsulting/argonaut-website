'use client';

// ============================================================
// ARGONAUT OS · Block 1.1c · Arbeitszeit-Nachweis (Chef-Ansicht)
// Waehle Mitarbeiter + Monat -> ArbZG-gepruefter Nachweis (Ampel + Verstoesse).
// Nutzt den Waechter aus _components/arbzgLogik.ts. Liest nur, aendert nichts.
// Betriebs-Toggles (Sonntagsarbeit erlaubt / Ruhezeit 10h / 8h-Hinweis) machen
// den Nachweis branchentauglich. Pfad: app/dashboard/arbeitszeit-nachweis/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  berechneNachweis, ampelFarbe, stundenText,
  type ZeitSitzung, type WaechterOptionen, type TagesNachweis,
} from '../_components/arbzgLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

type Mitarbeiter = { id: string; vorname: string; nachname: string };
type ZeitRow = ZeitSitzung; // hr_zeiterfassung passt 1:1

function zwei(n: number): string { return n < 10 ? '0' + n : String(n); }
function isoTag(d: Date): string { return d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-' + zwei(d.getDate()); }
function uhrzeit(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return zwei(d.getHours()) + ':' + zwei(d.getMinutes());
}

export default function ArbeitszeitNachweisPage() {
  const [maListe, setMaListe] = useState<Mitarbeiter[]>([]);
  const [maId, setMaId] = useState<string>('');
  const [monat, setMonat] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [rows, setRows] = useState<ZeitRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Betriebs-Optionen (spaeter persistent aus Betriebs-Einstellung; jetzt lokal)
  const [sonntagErlaubt, setSonntagErlaubt] = useState(false);
  const [ruhezeit10, setRuhezeit10] = useState(false);
  const [warn8h, setWarn8h] = useState(true);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);

  // Mitarbeiter des Chefs laden
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const { data } = await supabase.from('mitarbeiter')
        .select('id,vorname,nachname').eq('owner_user_id', uid)
        .order('nachname', { ascending: true });
      const liste = (data as Mitarbeiter[]) ?? [];
      setMaListe(liste);
      if (liste.length > 0) setMaId(liste[0].id);
      else setLaden(false);
    })();
  }, []);

  const ladeZeiten = useCallback(async () => {
    if (!maId) return;
    setLaden(true); setFehler(null);
    try {
      const start = isoTag(new Date(monat.getFullYear(), monat.getMonth(), 1));
      const ende = isoTag(new Date(monat.getFullYear(), monat.getMonth() + 1, 0));
      const { data, error } = await supabase.from('hr_zeiterfassung')
        .select('id,mitarbeiter_id,datum,kommen_um,gehen_um,pause_minuten')
        .eq('mitarbeiter_id', maId).gte('datum', start).lte('datum', ende)
        .order('kommen_um', { ascending: true });
      if (error) throw error;
      setRows((data as ZeitRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Zeiten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
      setRows([]);
    } finally { setLaden(false); }
  }, [maId, monat]);

  useEffect(() => { void ladeZeiten(); }, [ladeZeiten]);

  // Waechter anwenden
  const optionen: WaechterOptionen = {
    sonntagErlaubt,
    ruhezeitStunden: ruhezeit10 ? 10 : 11,
    warnUeber8h: warn8h,
  };
  const nachweis = berechneNachweis(rows, optionen);

  async function pdfErzeugen() {
    if (!maId) return;
    setPdfLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/arbeitszeit-nachweis-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mitarbeiterId: maId, jahr: monat.getFullYear(), monat: monat.getMonth() + 1, optionen }),
      });
      if (!res.ok) {
        let m = 'PDF-Erstellung fehlgeschlagen.';
        try { const j = await res.json(); if (j?.error) m = j.error; } catch { /* ignore */ }
        setFehler(m);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const m = maListe.find((x) => x.id === maId);
      const name = m ? `${m.vorname}_${m.nachname}` : 'Mitarbeiter';
      const a = document.createElement('a');
      a.href = url;
      a.download = `Arbeitszeitnachweis_${name}_${monat.getFullYear()}-${zwei(monat.getMonth() + 1)}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setFehler('Verbindungsfehler bei der PDF-Erstellung.');
    } finally { setPdfLaeuft(false); }
  }

  // Roh-Zeiten je Tag fuer die Kommen/Gehen-Anzeige
  const rohProTag = new Map<string, ZeitRow[]>();
  for (const r of rows) {
    if (!rohProTag.has(r.datum)) rohProTag.set(r.datum, []);
    rohProTag.get(r.datum)!.push(r);
  }
  function tagesSpanne(datum: string): string {
    const arr = rohProTag.get(datum) || [];
    if (arr.length === 0) return '—';
    const ersteK = arr.map((a) => a.kommen_um).sort()[0];
    const letzteG = arr.filter((a) => a.gehen_um).map((a) => a.gehen_um as string).sort().pop() || null;
    return `${uhrzeit(ersteK)} – ${uhrzeit(letzteG)}`;
  }

  const monatsName = monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const maName = maListe.find((m) => m.id === maId);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Personal</div>
      <h1 style={styles.h1}>Arbeitszeit-Nachweis</h1>
      <p style={styles.sub}>ArbZG-geprüfter Nachweis pro Mitarbeiter und Monat — Höchstarbeitszeit, Pausen, Ruhezeit, Sonntagsarbeit.</p>

      {/* Steuerung */}
      <div style={styles.controls}>
        <div>
          <label style={styles.lbl}>Mitarbeiter</label>
          <select style={styles.input} value={maId} onChange={(e) => setMaId(e.target.value)}>
            {maListe.length === 0 && <option value="">— keine Mitarbeiter —</option>}
            {maListe.map((m) => <option key={m.id} value={m.id}>{m.vorname} {m.nachname}</option>)}
          </select>
        </div>
        <div>
          <label style={styles.lbl}>Monat</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button style={styles.navBtn} onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() - 1, 1))}>‹</button>
            <span style={{ minWidth: 130, textAlign: 'center', fontWeight: 700 }}>{monatsName}</span>
            <button style={styles.navBtn} onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() + 1, 1))}>›</button>
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={pdfErzeugen} disabled={pdfLaeuft || !maId || nachweis.tage.length === 0}
            style={{ ...styles.pdfBtn, opacity: (pdfLaeuft || nachweis.tage.length === 0) ? 0.55 : 1, cursor: (pdfLaeuft || nachweis.tage.length === 0) ? 'not-allowed' : 'pointer' }}>
            {pdfLaeuft ? 'Erstellt PDF …' : '📄 Als PDF'}
          </button>
        </div>
      </div>

      {/* Betriebs-Toggles */}
      <div style={styles.toggles}>
        <span style={{ fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Betrieb:</span>
        <Toggle an={sonntagErlaubt} setAn={setSonntagErlaubt} label="Sonntagsarbeit erlaubt (z. B. Gastro/Tankstelle)" />
        <Toggle an={ruhezeit10} setAn={setRuhezeit10} label="Ruhezeit 10 h (erlaubte Branchen)" />
        <Toggle an={warn8h} setAn={setWarn8h} label="Hinweis über 8 h" />
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Summen */}
      {!laden && !fehler && (
        <>
          <div style={styles.summenGrid}>
            <SummeKarte label="Arbeitszeit gesamt" value={stundenText(nachweis.summeArbeitsminuten)} accent={C.cyan} />
            <SummeKarte label="Pausen gesamt" value={stundenText(nachweis.summePauseMinuten)} />
            <SummeKarte label="Verstöße" value={String(nachweis.anzahlVerstoesse)} accent={nachweis.anzahlVerstoesse > 0 ? C.danger : C.green} />
            <SummeKarte label="Status" value={ampelLabel(nachweis.schlimmsteAmpel)} accent={ampelFarbe(nachweis.schlimmsteAmpel)} />
          </div>

          {/* Tagesblatt */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Tagesnachweis · {maName ? `${maName.vorname} ${maName.nachname}` : ''} · {monatsName}</h2>
            {nachweis.tage.length === 0 ? (
              <div style={styles.hint}>Keine Buchungen in diesem Monat.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Tag</th>
                      <th style={styles.th}>Kommen–Gehen</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Arbeit</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Pause</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nachweis.tage.map((t: TagesNachweis) => (
                      <TagZeile key={t.datum} t={t} spanne={tagesSpanne(t.datum)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={styles.rechtHinweis}>
            Grundlage: ArbZG (§3 Höchstarbeitszeit, §4 Pausen, §5 Ruhezeit, §9/§10 Sonntag). Die Bewertung ist ein Hinweis —
            Branchen-Ausnahmen und der 6-Monats-Ausgleich sind vom Betrieb zu prüfen.
          </div>
        </>
      )}

      {laden && <div style={styles.hint}>Lädt …</div>}
    </div>
  );
}

function TagZeile({ t, spanne }: { t: TagesNachweis; spanne: string }) {
  const farbe = ampelFarbe(t.ampel);
  return (
    <>
      <tr>
        <td style={styles.td}>
          <span style={{ fontWeight: 600 }}>{formatTag(t.datum)}</span>
          <span style={{ color: C.textDim, marginLeft: 6, fontSize: 12 }}>{t.wochentag.slice(0, 2)}</span>
          {t.offen && <span style={{ color: C.green, fontSize: 11, marginLeft: 6 }}>● läuft</span>}
        </td>
        <td style={styles.td}>{spanne}</td>
        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{stundenText(t.arbeitsminuten)}</td>
        <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{t.pauseMinuten} min</td>
        <td style={{ ...styles.td, textAlign: 'center' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: farbe, display: 'inline-block' }} title={ampelLabel(t.ampel)} />
        </td>
      </tr>
      {t.verstoesse.length > 0 && (
        <tr>
          <td colSpan={5} style={{ ...styles.td, paddingTop: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {t.verstoesse.map((v, i) => (
                <span key={i} style={{ fontSize: 12, color: ampelFarbe(v.schwere) }}>
                  ▸ {v.text}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Toggle({ an, setAn, label }: { an: boolean; setAn: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => setAn(!an)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999,
      border: `1px solid ${an ? C.cyan : C.border}`, background: an ? 'rgba(0,229,255,0.1)' : 'transparent',
      color: an ? C.text : C.textDim, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: an ? C.cyan : C.textDim }} />
      {label}
    </button>
  );
}

function SummeKarte({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.summeBox}>
      <div style={styles.summeLabel}>{label}</div>
      <div style={{ ...styles.summeValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

function ampelLabel(a: string): string {
  return a === 'rot' ? 'Verstoß' : a === 'gelb' ? 'Prüfen' : 'In Ordnung';
}
function formatTag(iso: string): string {
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.` : iso;
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 640, lineHeight: 1.5 },

  controls: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 },
  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', minWidth: 220 },
  navBtn: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' },
  pdfBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit' },

  toggles: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, margin: '0 0 14px', color: C.text },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 520 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '9px 10px', fontSize: 14, borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  rechtHinweis: { marginTop: 16, fontSize: 12, color: C.textDim, lineHeight: 1.5, maxWidth: 720 },
};
