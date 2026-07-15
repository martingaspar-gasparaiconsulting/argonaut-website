'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · Vertriebs-Report (Block B-3)
 * ------------------------------------------------------------------
 * Wertet "leads" + "verkaufschancen" aus.
 *   Leads gesamt        = count(leads)
 *   Ø Lead-Score        = Durchschnitt score (nur bewertete)
 *   Offener Pipeline-Wert = Σ wert, Phase ≠ gewonnen/verloren
 *   Gewichteter Wert    = Σ (wert × wahrscheinlichkeit/100), offen
 * Data-driven: neue Phasen/Status erscheinen automatisch.
 * Route: /dashboard/analytics/vertrieb
 * ══════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  KpiKarte,
  KpiRaster,
  DiagrammKarte,
  type DiagrammPunkt,
} from '../../_components/ReportBausteine';

type Lead = {
  id: string;
  status: string | null;
  score: number | null;
  created_at: string | null;
};

type Chance = {
  id: string;
  phase: string | null;
  wert: number | null;
  wahrscheinlichkeit: number | null;
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MONATE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

const GEWONNEN = 'gewonnen';
const VERLOREN = 'verloren';

function euro(n: number): string {
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function VertriebsReport() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [chancen, setChancen] = useState<Chance[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const [leadsRes, chancenRes] = await Promise.all([
        supabase.from('leads').select('id, status, score, created_at'),
        supabase
          .from('verkaufschancen')
          .select('id, phase, wert, wahrscheinlichkeit'),
      ]);
      if (!aktiv) return;
      if (leadsRes.error || chancenRes.error) {
        setFehler(leadsRes.error?.message ?? chancenRes.error?.message ?? 'Unbekannter Fehler');
        setLaden(false);
        return;
      }
      setLeads((leadsRes.data ?? []) as Lead[]);
      setChancen((chancenRes.data ?? []) as Chance[]);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  const a = useMemo(() => {
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);

    // ── KPIs ──
    const leadsGesamt = leads.length;

    const scores = leads
      .map((l) => l.score)
      .filter((s): s is number => typeof s === 'number');
    const avgScore = scores.length
      ? scores.reduce((x, y) => x + y, 0) / scores.length
      : null;

    const istOffen = (c: Chance) => {
      const p = (c.phase ?? '').toLowerCase();
      return p !== GEWONNEN && p !== VERLOREN;
    };
    const offene = chancen.filter(istOffen);
    const pipelineWert = offene.reduce((s, c) => s + Number(c.wert ?? 0), 0);
    const gewichtet = offene.reduce(
      (s, c) =>
        s + Number(c.wert ?? 0) * (Number(c.wahrscheinlichkeit ?? 0) / 100),
      0,
    );

    // ── Pipeline-Wert nach Phase (alle Chancen) ──
    const phaseMap = new Map<string, number>();
    for (const c of chancen) {
      const p = c.phase ?? '(offen)';
      phaseMap.set(p, (phaseMap.get(p) ?? 0) + Number(c.wert ?? 0));
    }
    const pipelineNachPhase: DiagrammPunkt[] = Array.from(
      phaseMap.entries(),
    ).map(([name, wert]) => ({
      name,
      wert: Math.round(wert * 100) / 100,
    }));

    // ── Leads pro Monat (letzte 12 Monate) ──
    const monatMap = new Map<string, number>();
    const monate: { key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(heute.getFullYear(), heute.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monate.push({
        key,
        label: `${MONATE[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      });
      monatMap.set(key, 0);
    }
    for (const l of leads) {
      if (!l.created_at) continue;
      const d = new Date(l.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monatMap.has(key)) {
        monatMap.set(key, (monatMap.get(key) ?? 0) + 1);
      }
    }
    const leadsProMonat: DiagrammPunkt[] = monate.map((m) => ({
      name: m.label,
      wert: monatMap.get(m.key) ?? 0,
    }));

    // ── Lead-Status-Verteilung ──
    const statusMap = new Map<string, number>();
    for (const l of leads) {
      const s = l.status ?? 'unbekannt';
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    }
    const statusVerteilung: DiagrammPunkt[] = Array.from(
      statusMap.entries(),
    ).map(([name, wert]) => ({ name, wert }));

    return {
      leadsGesamt,
      avgScore,
      pipelineWert,
      gewichtet,
      pipelineNachPhase,
      leadsProMonat,
      statusVerteilung,
    };
  }, [leads, chancen]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>
      {/* ── Einheitlicher Modul-Kopf ── */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            color: '#C9A84C',
            fontSize: 'clamp(30px, 2.63vw, 42px)',
            fontWeight: 800,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>🎯</span> Vertriebs-Report
        </h1>
        <p
          style={{
            color: '#94a3b8',
            fontSize: 'clamp(15px, 1.31vw, 21px)',
            marginTop: 6,
            maxWidth: 720,
            lineHeight: 1.5,
          }}
        >
          Leads, Pipeline und Abschlusschancen im Überblick — von der ersten
          Anfrage bis zum gewonnenen Deal.
        </p>
      </div>

      {fehler && (
        <div
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#fca5a5',
            borderRadius: 10,
            padding: '14px 18px',
            fontSize: 'clamp(14px, 1.25vw, 20px)',
          }}
        >
          Daten konnten nicht geladen werden: {fehler}
        </div>
      )}

      {laden ? (
        <div style={{ color: '#64748b', fontSize: 'clamp(15px, 1.31vw, 21px)', padding: '40px 0' }}>
          Lade Vertriebsdaten …
        </div>
      ) : (
        <>
          <KpiRaster>
            <KpiKarte
              titel="Leads gesamt"
              wert={a.leadsGesamt}
              icon="👥"
              unterzeile="alle Anfragen"
            />
            <KpiKarte
              titel="Ø Lead-Score"
              wert={
                a.avgScore === null
                  ? '–'
                  : a.avgScore.toLocaleString('de-DE', {
                      maximumFractionDigits: 1,
                    })
              }
              einheit={a.avgScore === null ? undefined : '/ 5'}
              icon="⭐"
              akzentFarbe="#00e5ff"
              unterzeile="KI-Bewertung"
            />
            <KpiKarte
              titel="Offener Pipeline-Wert"
              wert={euro(a.pipelineWert)}
              einheit="€"
              icon="💰"
              akzentFarbe="#22c55e"
            />
            <KpiKarte
              titel="Gewichteter Wert"
              wert={euro(a.gewichtet)}
              einheit="€"
              icon="🎯"
              akzentFarbe="#C9A84C"
              unterzeile="× Wahrscheinlichkeit"
            />
          </KpiRaster>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 16,
              marginTop: 20,
            }}
          >
            <DiagrammKarte
              titel="Pipeline-Wert nach Phase"
              typ="balken"
              daten={a.pipelineNachPhase}
              einheit="€"
              farbe="#22c55e"
            />
            <DiagrammKarte
              titel="Lead-Status"
              typ="torte"
              daten={a.statusVerteilung}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <DiagrammKarte
              titel="Leads pro Monat (letzte 12 Monate)"
              typ="balken"
              daten={a.leadsProMonat}
            />
          </div>
        </>
      )}
    </div>
  );
}
