'use client';

// ============================================================
// ARGONAUT OS · Baustein 3 · Block L · Aufwand-Cockpit
// Alle abrechenbaren Aufwände (Projekt-Leistungen + Objektzeiten) auf einen
// Blick: offen vs. abgerechnet, Stunden + Betrag, je Projekt/Objekt — mit
// „abrechnen"-Knopf, der in die passende Rechnungs-Route springt.
// Reine Kennzahlen aus lib/aufwand (0 €, getestet).
// Pfad: app/dashboard/aufwand/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../_components/Leerzustand';
import {
  ausProjektleistung,
  ausObjektzeit,
  gruppiere,
  gesamt,
  type AufwandEintrag,
  type AufwandGruppe,
} from '@/lib/aufwand';
import { augeAufwand } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const QUELLE_META: Record<AufwandGruppe['quelle'], { icon: string; label: string; href: string; farbe: string }> = {
  projekt: { icon: '📁', label: 'Projekt', href: '/dashboard/projekt-abrechnung', farbe: C.cyan },
  objekt:  { icon: '🏗', label: 'Objekt',  href: '/dashboard/objektzeiten',       farbe: C.gold },
};

function eur(n: number): string { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function std(n: number): string { return (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' h'; }

export default function AufwandCockpit() {
  const [uid, setUid] = useState<string | null>(null);
  const [eintraege, setEintraege] = useState<AufwandEintrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [quelleFilter, setQuelleFilter] = useState<string>('');

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [pl, pr, oz, ob] = await Promise.all([
        supabase.from('projektleistungen').select('id, projekt_id, stunden, stundensatz, abgerechnet'),
        supabase.from('projekte').select('id, name'),
        supabase.from('objekt_zeiten').select('id, objekt_id, dauer_minuten, stundensatz_netto, abrechenbar, abgerechnet'),
        supabase.from('objekte').select('id, bezeichnung, stundensatz_netto'),
      ]);
      const projektName = new Map<string, string>(((pr.data as { id: string; name: string | null }[]) ?? []).map((p) => [String(p.id), p.name || 'Projekt']));
      const objektName = new Map<string, string>();
      const objektSatz = new Map<string, number>();
      ((ob.data as { id: string; bezeichnung: string | null; stundensatz_netto: number | null }[]) ?? []).forEach((o) => {
        objektName.set(String(o.id), o.bezeichnung || 'Objekt');
        objektSatz.set(String(o.id), Number(o.stundensatz_netto) || 0);
      });

      const alle: AufwandEintrag[] = [
        ...((pl.data as Record<string, unknown>[]) ?? []).map((l) => ausProjektleistung(l, projektName.get(String(l.projekt_id)) ?? 'Projekt')),
        ...(((oz.data as Record<string, unknown>[]) ?? [])
          .map((z) => ausObjektzeit(z, objektName.get(String(z.objekt_id)) ?? 'Objekt', objektSatz.get(String(z.objekt_id)) ?? 0))
          .filter(Boolean) as AufwandEintrag[]),
      ];
      setEintraege(alle);
    } catch (e: unknown) {
      setFehler('Aufwand konnte nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const g = useMemo(() => gesamt(eintraege), [eintraege]);
  const gruppen = useMemo(() => {
    const all = gruppiere(eintraege);
    return quelleFilter ? all.filter((x) => x.quelle === quelleFilter) : all;
  }, [eintraege, quelleFilter]);

  async function abrechnen(gr: AufwandGruppe) {
    if (gr.betragOffen <= 0) return;
    if (!window.confirm(`Offenen Aufwand von „${gr.gruppeName}" abrechnen?\n\n• ${gr.anzahlOffen} Posten · ${std(gr.stundenOffen)}\n• ${eur(gr.betragOffen)} netto\n\nEs wird eine Rechnung erzeugt.`)) return;
    const ziel = gr.quelle === 'projekt'
      ? { url: '/api/rechnung-aus-projekt', body: { projektId: gr.gruppeId } }
      : { url: '/api/rechnung-aus-objektzeit', body: { objektId: gr.gruppeId } };
    setBusy(`${gr.quelle}:${gr.gruppeId}`); setFehler(null); setOk(null);
    try {
      const res = await fetch(ziel.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ziel.body) });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Rechnung fehlgeschlagen.'); return; }
      setOk(`Rechnung für „${gr.gruppeName}" erstellt — unter 🧾 Rechnungen.`);
      await laden_();
    } catch (e: unknown) {
      setFehler('Rechnung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Aufwand</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>⏱ Aufwand-Cockpit</h1>
          <p style={styles.sub}>Aller abrechenbarer Aufwand an einem Ort — Projekt-Leistungen und Objektzeiten, offen wie abgerechnet. Rechne jeden Posten direkt hier ab, bevor Geld liegen bleibt.</p>
        </div>
        <button onClick={() => void laden_()} style={styles.ghostBtn}>↻ Aktualisieren</button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* KPI-Kacheln */}
      <div style={styles.kpiGrid}>
        <Kpi label="Offener Aufwand (netto)" value={eur(g.betragOffen)} accent={C.gold} gross />
        <Kpi label="Offene Stunden" value={std(g.stundenOffen)} accent={C.cyan} />
        <Kpi label="Offene Posten" value={String(g.anzahlOffen)} accent={g.anzahlOffen > 0 ? C.warn : C.green} />
        <Kpi label="Bereits abgerechnet" value={eur(g.betragAbg)} accent={C.green} />
      </div>

      {/* Regel-Auge */}
      {!laden && (
        <div style={{ marginTop: 18 }}>
          <KiAuge modul="Aufwand" regel={augeAufwand({ betragOffen: g.betragOffen, anzahlOffen: g.anzahlOffen, stundenOffen: g.stundenOffen, betragAbg: g.betragAbg })} />
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0 14px' }}>
        <Chip aktiv={quelleFilter === ''} onClick={() => setQuelleFilter('')} label="Alle" farbe={C.text} />
        <Chip aktiv={quelleFilter === 'projekt'} onClick={() => setQuelleFilter('projekt')} label="📁 Projekte" farbe={C.cyan} />
        <Chip aktiv={quelleFilter === 'objekt'} onClick={() => setQuelleFilter('objekt')} label="🏗 Objekte" farbe={C.gold} />
      </div>

      {/* Liste */}
      <div style={styles.card}>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : gruppen.length === 0 ? (
          <Leerzustand icon="⏱️" titel="Kein abrechenbarer Aufwand" text="Sobald du Zeiten buchst, sammelt sich der offene Aufwand hier zum Abrechnen." schritte={["Zeiten unter Projekt-Abrechnung buchen", "oder unter Objekt-Zeiterfassung", "Offene Aufwände hier abrechnen"]} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Quelle</th>
                  <th style={styles.th}>Projekt / Objekt</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Offene Std</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Offen (netto)</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Abgerechnet</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {gruppen.map((gr) => {
                  const meta = QUELLE_META[gr.quelle];
                  const key = `${gr.quelle}:${gr.gruppeId}`;
                  return (
                    <tr key={key}>
                      <td style={styles.td}><a href={meta.href} style={{ ...styles.quelleBadge, color: meta.farbe, borderColor: `${meta.farbe}66` }}>{meta.icon} {meta.label}</a></td>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{gr.gruppeName}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{gr.stundenOffen > 0 ? std(gr.stundenOffen) : '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: C.gold, fontWeight: 700 }}>{gr.betragOffen > 0 ? eur(gr.betragOffen) : '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{gr.betragAbg > 0 ? eur(gr.betragAbg) : '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        {gr.betragOffen > 0 ? (
                          <button onClick={() => abrechnen(gr)} disabled={busy === key} style={{ ...styles.miniBtn, color: C.gold, borderColor: `${C.gold}55` }}>{busy === key ? '…' : '🧾 abrechnen'}</button>
                        ) : <span style={{ color: C.green, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>✓ fakturiert</span>}
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
        Die gesetzliche Arbeitszeit (Stempeluhr) bleibt bewusst außen vor — hier zählt nur abrechenbarer Aufwand. „Abrechnen" erzeugt eine §14-konforme Rechnung und markiert die Posten als abgerechnet.
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, gross }: { label: string; value: string; accent?: string; gross?: boolean }) {
  return (<div style={styles.kpiBox}><div style={styles.kpiLabel}>{label}</div><div style={{ ...styles.kpiValue, color: accent || C.text, fontSize: gross ? 'clamp(26px, 2.3vw, 37px)' : 'clamp(24px, 2.13vw, 34px)' }}>{value}</div></div>);
}
function Chip({ aktiv, onClick, label, farbe }: { aktiv: boolean; onClick: () => void; label: string; farbe: string }) {
  return (<button onClick={onClick} style={{ background: aktiv ? `${farbe}22` : 'transparent', color: aktiv ? farbe : C.textDim, border: `1px solid ${aktiv ? farbe : C.border}`, borderRadius: 999, padding: '6px 14px', fontSize: 'clamp(12.5px, 1.06vw, 17px)', fontWeight: aktiv ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 22px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 760, lineHeight: 1.5 },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  miniBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 'clamp(12.5px, 1.13vw, 18px)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  kpiLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 800 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  quelleBadge: { display: 'inline-block', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '3px 10px', textDecoration: 'none', whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '16px 0' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '16px 0' },
  rechtHinweis: { marginTop: 16, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5, maxWidth: 760 },
};
