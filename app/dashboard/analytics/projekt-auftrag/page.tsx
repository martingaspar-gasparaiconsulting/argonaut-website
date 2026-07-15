'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · Projekt/Auftrag-Report (Block B-4)
 * ------------------------------------------------------------------
 * Wertet "projekte" + "auftraege" + "aufgaben" aus.
 *   Aktive Projekte      = nicht archiviert & Status nicht abgeschlossen/storniert
 *   Offene Aufgaben      = erledigt = false
 *   Auftragswert gesamt  = Σ brutto_summe (ohne stornierte)
 *   Überfällige Projekte = end_datum < heute & nicht abgeschlossen (Ampel)
 * Data-driven: neue Status erscheinen automatisch.
 * Route: /dashboard/analytics/projekt-auftrag
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

type Projekt = {
  id: string;
  status: string | null;
  end_datum: string | null;
  archiviert: boolean | null;
};

type Auftrag = {
  id: string;
  status: string | null;
  brutto_summe: number | null;
};

type Aufgabe = {
  id: string;
  erledigt: boolean | null;
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Status, die ein Projekt/Auftrag als "erledigt" markieren
const PROJEKT_FERTIG = ['abgeschlossen', 'storniert'];
const AUFTRAG_STORNO = 'storniert';

function euro(n: number): string {
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ProjektAuftragReport() {
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const [pRes, oRes, tRes] = await Promise.all([
        supabase.from('projekte').select('id, status, end_datum, archiviert'),
        supabase.from('auftraege').select('id, status, brutto_summe'),
        supabase.from('aufgaben').select('id, erledigt'),
      ]);
      if (!aktiv) return;
      const err = pRes.error ?? oRes.error ?? tRes.error;
      if (err) {
        setFehler(err.message);
        setLaden(false);
        return;
      }
      setProjekte((pRes.data ?? []) as Projekt[]);
      setAuftraege((oRes.data ?? []) as Auftrag[]);
      setAufgaben((tRes.data ?? []) as Aufgabe[]);
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
    const aktiveProjekte = projekte.filter(
      (p) =>
        p.archiviert !== true &&
        !PROJEKT_FERTIG.includes((p.status ?? '').toLowerCase()),
    ).length;

    const offeneAufgaben = aufgaben.filter((t) => t.erledigt !== true).length;
    const erledigteAufgaben = aufgaben.filter((t) => t.erledigt === true).length;

    const auftragswertGesamt = auftraege
      .filter((o) => (o.status ?? '').toLowerCase() !== AUFTRAG_STORNO)
      .reduce((s, o) => s + Number(o.brutto_summe ?? 0), 0);

    const ueberfaelligeProjekte = projekte.filter((p) => {
      if (p.archiviert === true) return false;
      if ((p.status ?? '').toLowerCase() === 'abgeschlossen') return false;
      if (!p.end_datum) return false;
      const end = new Date(p.end_datum);
      end.setHours(0, 0, 0, 0);
      return end < heute;
    }).length;

    // ── Projekt-Status-Verteilung (Torte) ──
    const projektStatusMap = new Map<string, number>();
    for (const p of projekte) {
      const s = p.status ?? 'unbekannt';
      projektStatusMap.set(s, (projektStatusMap.get(s) ?? 0) + 1);
    }
    const projektStatus: DiagrammPunkt[] = Array.from(
      projektStatusMap.entries(),
    ).map(([name, wert]) => ({ name, wert }));

    // ── Auftragswert nach Status (Balken) ──
    const auftragStatusMap = new Map<string, number>();
    for (const o of auftraege) {
      const s = o.status ?? 'unbekannt';
      auftragStatusMap.set(
        s,
        (auftragStatusMap.get(s) ?? 0) + Number(o.brutto_summe ?? 0),
      );
    }
    const auftragswertNachStatus: DiagrammPunkt[] = Array.from(
      auftragStatusMap.entries(),
    ).map(([name, wert]) => ({
      name,
      wert: Math.round(wert * 100) / 100,
    }));

    // ── Aufgaben-Fortschritt (Balken) ──
    const aufgabenFortschritt: DiagrammPunkt[] = [
      { name: 'Offen', wert: offeneAufgaben },
      { name: 'Erledigt', wert: erledigteAufgaben },
    ];

    return {
      aktiveProjekte,
      offeneAufgaben,
      auftragswertGesamt,
      ueberfaelligeProjekte,
      projektStatus,
      auftragswertNachStatus,
      aufgabenFortschritt,
      anzahlAuftraege: auftraege.length,
    };
  }, [projekte, auftraege, aufgaben]);

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
          <span>📁</span> Projekt- &amp; Auftrags-Report
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
          Projektfortschritt, Aufgabenlast und Auftragswert im Blick — inklusive
          Ampel für überfällige Projekte.
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
          Lade Projekt- &amp; Auftragsdaten …
        </div>
      ) : (
        <>
          <KpiRaster>
            <KpiKarte
              titel="Aktive Projekte"
              wert={a.aktiveProjekte}
              icon="📁"
              unterzeile="laufend"
            />
            <KpiKarte
              titel="Offene Aufgaben"
              wert={a.offeneAufgaben}
              icon="✅"
              akzentFarbe="#00e5ff"
            />
            <KpiKarte
              titel="Auftragswert gesamt"
              wert={euro(a.auftragswertGesamt)}
              einheit="€"
              icon="💰"
              akzentFarbe="#22c55e"
              unterzeile={`${a.anzahlAuftraege} Auftr${a.anzahlAuftraege === 1 ? 'ag' : 'äge'}`}
            />
            <KpiKarte
              titel="Überfällige Projekte"
              wert={a.ueberfaelligeProjekte}
              icon="⚠️"
              akzentFarbe={a.ueberfaelligeProjekte > 0 ? '#ef4444' : '#22c55e'}
              unterzeile="Termin überschritten"
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
              titel="Projekt-Status"
              typ="torte"
              daten={a.projektStatus}
            />
            <DiagrammKarte
              titel="Auftragswert nach Status"
              typ="balken"
              daten={a.auftragswertNachStatus}
              einheit="€"
              farbe="#22c55e"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <DiagrammKarte
              titel="Aufgaben — Offen vs. Erledigt"
              typ="balken"
              daten={a.aufgabenFortschritt}
              farbe="#00e5ff"
              hoehe={240}
            />
          </div>
        </>
      )}
    </div>
  );
}
