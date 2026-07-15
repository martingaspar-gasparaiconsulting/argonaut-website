'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · Verträge-Report (Block B-10)
 * ------------------------------------------------------------------
 * Wertet "vertraege" aus. Kündigungs-Ampel aus echten Datumsspalten:
 *   Kündigungs-Deadline = ende − kuendigungsfrist_tage
 *   Aktive Verträge    = Status nicht gekündigt/beendet & ende ≥ heute
 *   Kündigung bald     = Deadline in nächsten 60 Tagen (aktiv)
 *   Jährliche Kosten   = Σ kosten_betrag × Jahres-Faktor (aus Intervall)
 *   Läuft bald aus     = ende in nächsten 90 Tagen (aktiv)
 * Route: /dashboard/analytics/vertraege
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

type Vertrag = {
  id: string;
  status: string | null;
  kategorie: string | null;
  ende: string | null;
  kuendigungsfrist_tage: number | null;
  kosten_betrag: number | null;
  kosten_intervall: string | null;
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Status, die einen Vertrag als NICHT aktiv markieren
const NICHT_AKTIV = [
  'gekuendigt', 'gekündigt', 'beendet', 'storniert', 'abgelaufen', 'inaktiv',
];

function euro(n: number): string {
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Kosten-Intervall -> Faktor pro Jahr (robust gegen Schreibweisen)
function jahresFaktor(intervall: string | null): number {
  const s = (intervall ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue');
  if (s.includes('woch')) return 52;
  if (s.includes('monat')) return 12;
  if (s.includes('quart') || s.includes('viertel')) return 4;
  if (s.includes('halb')) return 2;
  if (s.includes('jahr') || s.includes('jaehr')) return 1;
  if (s.includes('einmal')) return 0;
  return 1; // Standard: jährlich
}

export default function VertraegeReport() {
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const { data, error } = await supabase
        .from('vertraege')
        .select(
          'id, status, kategorie, ende, kuendigungsfrist_tage, kosten_betrag, kosten_intervall',
        );
      if (!aktiv) return;
      if (error) {
        setFehler(error.message);
        setLaden(false);
        return;
      }
      setVertraege((data ?? []) as Vertrag[]);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  const a = useMemo(() => {
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    const heuteStr = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(
      heute.getDate(),
    ).padStart(2, '0')}`;
    const TAG = 1000 * 60 * 60 * 24;

    const istAktiv = (v: Vertrag): boolean => {
      if (NICHT_AKTIV.includes((v.status ?? '').toLowerCase())) return false;
      if (v.ende && v.ende < heuteStr) return false;
      return true;
    };

    // Tage bis zur Kündigungs-Deadline (ende − Frist). null wenn kein Enddatum.
    const kuendigungsTage = (v: Vertrag): number | null => {
      if (!v.ende) return null;
      const deadline = new Date(v.ende);
      deadline.setHours(0, 0, 0, 0);
      deadline.setDate(deadline.getDate() - Number(v.kuendigungsfrist_tage ?? 0));
      return Math.floor((deadline.getTime() - heute.getTime()) / TAG);
    };

    const tageBisEnde = (v: Vertrag): number | null => {
      if (!v.ende) return null;
      const ende = new Date(v.ende);
      ende.setHours(0, 0, 0, 0);
      return Math.floor((ende.getTime() - heute.getTime()) / TAG);
    };

    const aktive = vertraege.filter(istAktiv);

    // ── KPIs ──
    const aktiveVertraege = aktive.length;

    const kuendigungBald = aktive.filter((v) => {
      const t = kuendigungsTage(v);
      return t !== null && t >= 0 && t <= 60;
    }).length;

    const jaehrlicheKosten = aktive.reduce(
      (s, v) => s + Number(v.kosten_betrag ?? 0) * jahresFaktor(v.kosten_intervall),
      0,
    );

    const laeuftAus = aktive.filter((v) => {
      const t = tageBisEnde(v);
      return t !== null && t >= 0 && t <= 90;
    }).length;

    // ── Verträge nach Kategorie (Torte) ──
    const katMap = new Map<string, number>();
    for (const v of vertraege) {
      const k = v.kategorie ?? 'ohne Kategorie';
      katMap.set(k, (katMap.get(k) ?? 0) + 1);
    }
    const nachKategorie: DiagrammPunkt[] = Array.from(katMap.entries()).map(
      ([name, wert]) => ({ name, wert }),
    );

    // ── Jährliche Kosten nach Kategorie (Balken) ──
    const kostenKatMap = new Map<string, number>();
    for (const v of aktive) {
      const k = v.kategorie ?? 'ohne Kategorie';
      const jahr = Number(v.kosten_betrag ?? 0) * jahresFaktor(v.kosten_intervall);
      kostenKatMap.set(k, (kostenKatMap.get(k) ?? 0) + jahr);
    }
    const kostenNachKategorie: DiagrammPunkt[] = Array.from(
      kostenKatMap.entries(),
    )
      .map(([name, wert]) => ({ name, wert: Math.round(wert * 100) / 100 }))
      .sort((x, y) => y.wert - x.wert);

    // ── Kündigungs-Ampel (Balken) ──
    let gruen = 0;
    let gelb = 0;
    let rot = 0;
    for (const v of aktive) {
      const t = kuendigungsTage(v);
      if (t === null) {
        gruen += 1; // unbefristet / kein Enddatum
        continue;
      }
      if (t <= 14) rot += 1;
      else if (t <= 60) gelb += 1;
      else gruen += 1;
    }
    const ampel: DiagrammPunkt[] = [
      { name: 'Genug Zeit', wert: gruen },
      { name: 'Bald (≤60 T.)', wert: gelb },
      { name: 'Dringend (≤14 T.)', wert: rot },
    ];

    return {
      aktiveVertraege,
      kuendigungBald,
      jaehrlicheKosten,
      laeuftAus,
      nachKategorie,
      kostenNachKategorie,
      ampel,
    };
  }, [vertraege]);

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
          <span>📑</span> Verträge-Report
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
          Laufende Verträge, Kündigungsfristen und jährliche Kosten im Blick —
          damit keine Frist mehr durchrutscht.
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
          Lade Vertragsdaten …
        </div>
      ) : (
        <>
          <KpiRaster>
            <KpiKarte
              titel="Aktive Verträge"
              wert={a.aktiveVertraege}
              icon="📑"
              unterzeile="laufend"
            />
            <KpiKarte
              titel="Kündigung bald fällig"
              wert={a.kuendigungBald}
              icon="⚠️"
              akzentFarbe={a.kuendigungBald > 0 ? '#ef4444' : '#22c55e'}
              unterzeile="nächste 60 Tage"
            />
            <KpiKarte
              titel="Jährliche Kosten"
              wert={euro(a.jaehrlicheKosten)}
              einheit="€"
              icon="💰"
              akzentFarbe="#00e5ff"
              unterzeile="hochgerechnet"
            />
            <KpiKarte
              titel="Läuft bald aus"
              wert={a.laeuftAus}
              icon="⏳"
              akzentFarbe={a.laeuftAus > 0 ? '#C9A84C' : '#22c55e'}
              unterzeile="nächste 90 Tage"
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
              titel="Verträge nach Kategorie"
              typ="torte"
              daten={a.nachKategorie}
            />
            <DiagrammKarte
              titel="Jährliche Kosten nach Kategorie"
              typ="balken"
              daten={a.kostenNachKategorie}
              einheit="€"
              farbe="#00e5ff"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <DiagrammKarte
              titel="Kündigungs-Ampel (aktive Verträge)"
              typ="balken"
              daten={a.ampel}
              farbe="#C9A84C"
              hoehe={240}
            />
          </div>
        </>
      )}
    </div>
  );
}
