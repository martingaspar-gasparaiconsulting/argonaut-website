'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · Marketing-Report (Block B-9)
 * ------------------------------------------------------------------
 * Wertet "marketing_kampagnen" + "marketing_inhalte" + "marketing_kalender" aus.
 *   Aktive Kampagnen   = status = aktiv
 *   Inhalte gesamt     = count(marketing_inhalte) (+ KI-Anteil)
 *   Geplant (30 Tage)  = Kalender-Einträge geplant_am in nächsten 30 Tagen
 *   Marketing-Budget   = Σ budget aktiver Kampagnen
 * Route: /dashboard/analytics/marketing
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

type Kampagne = {
  id: string;
  status: string | null;
  budget: number | null;
};

type Inhalt = {
  id: string;
  kanal: string | null;
  status: string | null;
  ki_generiert: boolean | null;
  created_at: string | null;
};

type Kalender = {
  id: string;
  geplant_am: string | null;
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MONATE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

function euro(n: number): string {
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function MarketingReport() {
  const [kampagnen, setKampagnen] = useState<Kampagne[]>([]);
  const [inhalte, setInhalte] = useState<Inhalt[]>([]);
  const [kalender, setKalender] = useState<Kalender[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const [kRes, iRes, calRes] = await Promise.all([
        supabase.from('marketing_kampagnen').select('id, status, budget'),
        supabase
          .from('marketing_inhalte')
          .select('id, kanal, status, ki_generiert, created_at'),
        supabase.from('marketing_kalender').select('id, geplant_am'),
      ]);
      if (!aktiv) return;
      const err = kRes.error ?? iRes.error ?? calRes.error;
      if (err) {
        setFehler(err.message);
        setLaden(false);
        return;
      }
      setKampagnen((kRes.data ?? []) as Kampagne[]);
      setInhalte((iRes.data ?? []) as Inhalt[]);
      setKalender((calRes.data ?? []) as Kalender[]);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  const a = useMemo(() => {
    const jetzt = new Date();
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    // ── KPIs ──
    const aktiveKampagnen = kampagnen.filter(
      (k) => (k.status ?? '').toLowerCase() === 'aktiv',
    );
    const anzahlAktiv = aktiveKampagnen.length;

    const marketingBudget = aktiveKampagnen.reduce(
      (s, k) => s + Number(k.budget ?? 0),
      0,
    );

    const inhalteGesamt = inhalte.length;
    const kiAnzahl = inhalte.filter((i) => i.ki_generiert === true).length;
    const kiAnteil =
      inhalteGesamt > 0 ? Math.round((kiAnzahl / inhalteGesamt) * 100) : 0;

    const geplant30 = kalender.filter((k) => {
      if (!k.geplant_am) return false;
      const d = new Date(k.geplant_am);
      return d >= jetzt && d <= in30;
    }).length;

    // ── Kampagnen-Status (Torte) ──
    const statusMap = new Map<string, number>();
    for (const k of kampagnen) {
      const s = k.status ?? 'unbekannt';
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    }
    const kampagnenStatus: DiagrammPunkt[] = Array.from(
      statusMap.entries(),
    ).map(([name, wert]) => ({ name, wert }));

    // ── Inhalte nach Kanal (Balken) ──
    const kanalMap = new Map<string, number>();
    for (const i of inhalte) {
      const k = i.kanal ?? 'ohne Kanal';
      kanalMap.set(k, (kanalMap.get(k) ?? 0) + 1);
    }
    const inhalteNachKanal: DiagrammPunkt[] = Array.from(kanalMap.entries())
      .map(([name, wert]) => ({ name, wert }))
      .sort((x, y) => y.wert - x.wert);

    // ── Inhalte erstellt pro Monat (letzte 12 Monate) ──
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
    for (const i of inhalte) {
      if (!i.created_at) continue;
      const d = new Date(i.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monatMap.has(key)) {
        monatMap.set(key, (monatMap.get(key) ?? 0) + 1);
      }
    }
    const inhalteProMonat: DiagrammPunkt[] = monate.map((m) => ({
      name: m.label,
      wert: monatMap.get(m.key) ?? 0,
    }));

    return {
      anzahlAktiv,
      marketingBudget,
      inhalteGesamt,
      kiAnteil,
      geplant30,
      kampagnenStatus,
      inhalteNachKanal,
      inhalteProMonat,
    };
  }, [kampagnen, inhalte, kalender]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>
      {/* ── Einheitlicher Modul-Kopf ── */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            color: '#C9A84C',
            fontSize: 30,
            fontWeight: 800,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>📣</span> Marketing-Report
        </h1>
        <p
          style={{
            color: '#94a3b8',
            fontSize: 15,
            marginTop: 6,
            maxWidth: 720,
            lineHeight: 1.5,
          }}
        >
          Kampagnen, Content-Produktion und Redaktionsplan im Überblick — damit
          deine Außenwirkung nie stockt.
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
            fontSize: 14,
          }}
        >
          Daten konnten nicht geladen werden: {fehler}
        </div>
      )}

      {laden ? (
        <div style={{ color: '#64748b', fontSize: 15, padding: '40px 0' }}>
          Lade Marketing-Daten …
        </div>
      ) : (
        <>
          <KpiRaster>
            <KpiKarte
              titel="Aktive Kampagnen"
              wert={a.anzahlAktiv}
              icon="📣"
              unterzeile="laufend"
            />
            <KpiKarte
              titel="Inhalte gesamt"
              wert={a.inhalteGesamt}
              icon="📝"
              akzentFarbe="#00e5ff"
              unterzeile={`${a.kiAnteil} % KI-generiert`}
            />
            <KpiKarte
              titel="Geplant (30 Tage)"
              wert={a.geplant30}
              icon="📅"
              akzentFarbe="#a855f7"
              unterzeile="im Redaktionsplan"
            />
            <KpiKarte
              titel="Marketing-Budget"
              wert={euro(a.marketingBudget)}
              einheit="€"
              icon="💰"
              akzentFarbe="#22c55e"
              unterzeile="aktive Kampagnen"
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
              titel="Kampagnen-Status"
              typ="torte"
              daten={a.kampagnenStatus}
            />
            <DiagrammKarte
              titel="Inhalte nach Kanal"
              typ="balken"
              daten={a.inhalteNachKanal}
              farbe="#a855f7"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <DiagrammKarte
              titel="Inhalte erstellt pro Monat (letzte 12 Monate)"
              typ="balken"
              daten={a.inhalteProMonat}
              farbe="#00e5ff"
            />
          </div>
        </>
      )}
    </div>
  );
}
