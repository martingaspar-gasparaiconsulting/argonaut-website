'use client';

// ============================================================
// ARGONAUT OS · Nachkalkulation (Plan ↔ Ist je Projekt)
// Vergleicht Budget (Plan) mit erbrachter Leistung (Ist) und zeigt, was schon
// abgerechnet und was noch offen ist — plus Budget-Ampel. Reine Kennzahlen aus
// lib/nachkalkulation (0 €, getestet). Extra-Spalten erscheinen im Voll-Modus.
// Kein neues SQL — liest projekte(budget) + projektleistungen.
// Pfad: app/dashboard/nachkalkulation/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../_components/Leerzustand';
import { NurVoll } from '../_components/Ansicht';
import {
  baueKalkulation, summeKalk,
  type ProjektRoh, type LeistungRoh, type ProjektKalk, type KalkStatus,
} from '@/lib/nachkalkulation';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const STATUS_META: Record<KalkStatus, { label: string; farbe: string }> = {
  im_budget:    { label: '✓ im Budget',   farbe: C.green },
  knapp:        { label: '⚠ knapp',       farbe: C.warn },
  ueber_budget: { label: '✕ über Budget', farbe: C.danger },
  kein_budget:  { label: '– kein Budget', farbe: C.textDim },
};

function eur(n: number): string { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); }
function std(n: number): string { return (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' h'; }

export default function NachkalkulationSeite() {
  const [kalk, setKalk] = useState<ProjektKalk[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [pr, pl] = await Promise.all([
        supabase.from('projekte').select('id, name, budget'),
        supabase.from('projektleistungen').select('projekt_id, stunden, stundensatz, abgerechnet'),
      ]);
      if (pr.error) throw pr.error;
      const projekte = (pr.data as unknown as ProjektRoh[]) ?? [];
      const leistungen = (pl.error ? [] : (pl.data as unknown as LeistungRoh[])) ?? [];
      setKalk(baueKalkulation(projekte, leistungen));
    } catch (e: unknown) {
      setFehler('Nachkalkulation konnte nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user?.id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      await laden_();
    })();
  }, [laden_]);

  const s = useMemo(() => summeKalk(kalk), [kalk]);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Controlling</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>🧮 Nachkalkulation</h1>
          <p style={styles.sub}>Plan gegen Ist je Projekt: Wie viel war geplant (Budget), wie viel Leistung ist erbracht, was ist davon abgerechnet — und was liegt noch offen zum Fakturieren?</p>
        </div>
        <button onClick={() => void laden_()} style={styles.ghostBtn}>↻ Aktualisieren</button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.kpiGrid}>
        <Kpi label="Budget gesamt" value={eur(s.budget)} accent={C.cyan} />
        <Kpi label="Erbracht (Ist)" value={eur(s.erbracht)} accent={C.gold} gross />
        <Kpi label="Offen zum Abrechnen" value={eur(s.offen)} accent={s.offen > 0 ? C.warn : C.green} />
        <Kpi label="Über Budget" value={`${s.ueberBudget} Projekt${s.ueberBudget === 1 ? '' : 'e'}`} accent={s.ueberBudget > 0 ? C.danger : C.green} />
      </div>

      <div style={{ ...styles.card, marginTop: 18 }}>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : kalk.length === 0 ? (
          <Leerzustand icon="🧮" titel="Noch keine Projekte" text="Sobald du Projekte mit Budget anlegst und Leistungen buchst, erscheint hier die Plan-Ist-Nachkalkulation." schritte={["Projekt mit Budget anlegen", "Leistungen (Stunden × Satz) buchen", "Hier Plan gegen Ist prüfen"]} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Projekt</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Budget</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Erbracht</th>
                  <NurVoll><th style={{ ...styles.th, textAlign: 'right' }}>Stunden</th></NurVoll>
                  <NurVoll><th style={{ ...styles.th, textAlign: 'right' }}>Auslastung</th></NurVoll>
                  <NurVoll><th style={{ ...styles.th, textAlign: 'right' }}>Offen</th></NurVoll>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {kalk.map((k) => {
                  const meta = STATUS_META[k.status];
                  return (
                    <tr key={k.id}>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{k.name}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{k.budget > 0 ? eur(k.budget) : '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: C.gold, fontWeight: 700 }}>{eur(k.erbracht)}</td>
                      <NurVoll><td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{k.stunden > 0 ? std(k.stunden) : '—'}</td></NurVoll>
                      <NurVoll><td style={{ ...styles.td, textAlign: 'right', color: k.status === 'ueber_budget' ? C.danger : C.text }}>{k.budget > 0 ? `${k.auslastung.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %` : '—'}</td></NurVoll>
                      <NurVoll><td style={{ ...styles.td, textAlign: 'right', color: k.offen > 0 ? C.warn : C.textDim }}>{k.offen > 0 ? eur(k.offen) : '—'}</td></NurVoll>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <span style={{ color: meta.farbe, fontWeight: 700, fontSize: 'clamp(12px, 1.06vw, 17px)', whiteSpace: 'nowrap' }}>{meta.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.rechtHinweis}>
        „Erbracht" ist die gebuchte, abrechenbare Leistung (Stunden × Satz). Material- und Fremdkosten für einen vollen
        Deckungsbeitrag lassen sich später ergänzen. Auf „Voll" (Einstellungen) erscheinen zusätzlich Stunden, Auslastung und offener Betrag.
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, gross }: { label: string; value: string; accent?: string; gross?: boolean }) {
  return (<div style={styles.kpiBox}><div style={styles.kpiLabel}>{label}</div><div style={{ ...styles.kpiValue, color: accent || C.text, fontSize: gross ? 'clamp(26px, 2.3vw, 37px)' : 'clamp(22px, 2vw, 32px)' }}>{value}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 22px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 780, lineHeight: 1.5 },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  kpiLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 800 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '16px 0' },
  rechtHinweis: { marginTop: 16, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5, maxWidth: 780 },
};
