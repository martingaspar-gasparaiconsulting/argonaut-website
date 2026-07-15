'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · Service-Report (Block B-6)
 * ------------------------------------------------------------------
 * Wertet "tickets" aus. KPIs aus echten Zeitstempeln (robust):
 *   Offene Tickets   = geloest_am IS NULL
 *   Überfällige SLA  = offen & faellig_am < jetzt
 *   Gelöst gesamt    = geloest_am IS NOT NULL
 *   Ø Lösungszeit    = Ø (geloest_am − created_at) der gelösten Tickets
 * Route: /dashboard/analytics/service
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

type Ticket = {
  id: string;
  status: string | null;
  prioritaet: string | null;
  faellig_am: string | null;
  geloest_am: string | null;
  created_at: string | null;
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MONATE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

// Dauer in Stunden hübsch formatieren (h oder Tage)
function formatDauer(stunden: number): string {
  if (stunden >= 24) {
    const tage = stunden / 24;
    return `${tage.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tage`;
  }
  return `${stunden.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`;
}

export default function ServiceReport() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(
          'id, status, prioritaet, faellig_am, geloest_am, created_at',
        );
      if (!aktiv) return;
      if (error) {
        setFehler(error.message);
        setLaden(false);
        return;
      }
      setTickets((data ?? []) as Ticket[]);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  const a = useMemo(() => {
    const jetzt = Date.now();

    // ── KPIs ──
    const offen = tickets.filter((t) => !t.geloest_am);
    const geloest = tickets.filter((t) => !!t.geloest_am);

    const offeneTickets = offen.length;
    const geloestGesamt = geloest.length;

    const ueberfaelligeSLA = offen.filter((t) => {
      if (!t.faellig_am) return false;
      return new Date(t.faellig_am).getTime() < jetzt;
    }).length;

    let avgLoesung: number | null = null;
    if (geloest.length > 0) {
      let summeMs = 0;
      let gezaehlt = 0;
      for (const t of geloest) {
        const created = t.created_at ? new Date(t.created_at).getTime() : null;
        const resolved = t.geloest_am ? new Date(t.geloest_am).getTime() : null;
        if (created !== null && resolved !== null && resolved >= created) {
          summeMs += resolved - created;
          gezaehlt += 1;
        }
      }
      if (gezaehlt > 0) {
        avgLoesung = summeMs / gezaehlt / (1000 * 60 * 60); // Stunden
      }
    }

    // ── Ticket-Status (Torte) ──
    const statusMap = new Map<string, number>();
    for (const t of tickets) {
      const s = t.status ?? 'unbekannt';
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    }
    const statusVerteilung: DiagrammPunkt[] = Array.from(
      statusMap.entries(),
    ).map(([name, wert]) => ({ name, wert }));

    // ── Priorität (Balken) ──
    const prioMap = new Map<string, number>();
    for (const t of tickets) {
      const p = t.prioritaet ?? 'unbekannt';
      prioMap.set(p, (prioMap.get(p) ?? 0) + 1);
    }
    const prioVerteilung: DiagrammPunkt[] = Array.from(prioMap.entries())
      .map(([name, wert]) => ({ name, wert }))
      .sort((x, y) => y.wert - x.wert);

    // ── Tickets pro Monat (letzte 12 Monate) ──
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
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
    for (const t of tickets) {
      if (!t.created_at) continue;
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monatMap.has(key)) {
        monatMap.set(key, (monatMap.get(key) ?? 0) + 1);
      }
    }
    const ticketsProMonat: DiagrammPunkt[] = monate.map((m) => ({
      name: m.label,
      wert: monatMap.get(m.key) ?? 0,
    }));

    return {
      offeneTickets,
      geloestGesamt,
      ueberfaelligeSLA,
      avgLoesung,
      statusVerteilung,
      prioVerteilung,
      ticketsProMonat,
    };
  }, [tickets]);

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
          <span>🛎️</span> Service-Report
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
          Ticket-Aufkommen, SLA-Einhaltung und Lösungsgeschwindigkeit — damit
          kein Kundenanliegen liegen bleibt.
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
          Lade Service-Daten …
        </div>
      ) : (
        <>
          <KpiRaster>
            <KpiKarte
              titel="Offene Tickets"
              wert={a.offeneTickets}
              icon="🎫"
              unterzeile="noch nicht gelöst"
            />
            <KpiKarte
              titel="Überfällige SLA"
              wert={a.ueberfaelligeSLA}
              icon="⚠️"
              akzentFarbe={a.ueberfaelligeSLA > 0 ? '#ef4444' : '#22c55e'}
              unterzeile="Frist überschritten"
            />
            <KpiKarte
              titel="Gelöst gesamt"
              wert={a.geloestGesamt}
              icon="✅"
              akzentFarbe="#22c55e"
            />
            <KpiKarte
              titel="Ø Lösungszeit"
              wert={a.avgLoesung === null ? '–' : formatDauer(a.avgLoesung)}
              icon="⏱️"
              akzentFarbe="#00e5ff"
              unterzeile="gelöste Tickets"
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
              titel="Ticket-Status"
              typ="torte"
              daten={a.statusVerteilung}
            />
            <DiagrammKarte
              titel="Tickets nach Priorität"
              typ="balken"
              daten={a.prioVerteilung}
              farbe="#C9A84C"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <DiagrammKarte
              titel="Tickets pro Monat (letzte 12 Monate)"
              typ="balken"
              daten={a.ticketsProMonat}
              farbe="#00e5ff"
            />
          </div>
        </>
      )}
    </div>
  );
}
