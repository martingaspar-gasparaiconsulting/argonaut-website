'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · HR-Report (Block B-7)
 * ------------------------------------------------------------------
 * Wertet "mitarbeiter" + "hr_zeiterfassung" + "hr_abwesenheiten" aus.
 * DSGVO: es werden KEINE sensiblen Felder geladen (sv_nummer/iban/…).
 *   Aktive Mitarbeiter    = austrittsdatum NULL & Status ≠ inaktiv
 *   Erfasste Stunden (M.)  = Σ (gehen − kommen − Pause) im akt. Monat
 *   Abwesend heute        = Zeitraum enthält heute & nicht abgelehnt/storniert
 *   Offene Anträge        = Status noch nicht bearbeitet (z.B. beantragt)
 * Route: /dashboard/analytics/hr
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

type Mitarbeiter = {
  id: string;
  status: string | null;
  abteilung: string | null;
  austrittsdatum: string | null;
};

type Zeit = {
  id: string;
  datum: string | null;
  kommen_um: string | null;
  gehen_um: string | null;
  pause_minuten: number | null;
};

type Abwesenheit = {
  id: string;
  typ: string | null;
  status: string | null;
  von: string | null;
  bis: string | null;
  tage: number | null;
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MONATE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

// Antrag gilt als "bearbeitet" (nicht offen), wenn Status hier steht
const ANTRAG_ERLEDIGT = ['genehmigt', 'abgelehnt', 'erfasst', 'storniert'];
// Diese Status zählen NICHT als tatsächliche Abwesenheit
const ABWESEND_UNGUELTIG = ['abgelehnt', 'storniert'];

// Datum-String "YYYY-MM-DD" -> {jahr, monat(0-basiert)}
function jahrMonat(datum: string): { jahr: number; monat: number } | null {
  const t = datum.split('-');
  if (t.length < 2) return null;
  const jahr = Number(t[0]);
  const monat = Number(t[1]) - 1;
  if (Number.isNaN(jahr) || Number.isNaN(monat)) return null;
  return { jahr, monat };
}

// Netto-Arbeitsstunden aus einem Zeiterfassungs-Eintrag
function stunden(z: Zeit): number {
  if (!z.kommen_um || !z.gehen_um) return 0;
  const kommen = new Date(z.kommen_um).getTime();
  const gehen = new Date(z.gehen_um).getTime();
  if (Number.isNaN(kommen) || Number.isNaN(gehen) || gehen <= kommen) return 0;
  const brutto = (gehen - kommen) / (1000 * 60 * 60);
  const pause = Number(z.pause_minuten ?? 0) / 60;
  return Math.max(brutto - pause, 0);
}

function stundenText(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

export default function HrReport() {
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [zeiten, setZeiten] = useState<Zeit[]>([]);
  const [abwesenheiten, setAbwesenheiten] = useState<Abwesenheit[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const [mRes, zRes, aRes] = await Promise.all([
        supabase
          .from('mitarbeiter')
          .select('id, status, abteilung, austrittsdatum'),
        supabase
          .from('hr_zeiterfassung')
          .select('id, datum, kommen_um, gehen_um, pause_minuten'),
        supabase
          .from('hr_abwesenheiten')
          .select('id, typ, status, von, bis, tage'),
      ]);
      if (!aktiv) return;
      const err = mRes.error ?? zRes.error ?? aRes.error;
      if (err) {
        setFehler(err.message);
        setLaden(false);
        return;
      }
      setMitarbeiter((mRes.data ?? []) as Mitarbeiter[]);
      setZeiten((zRes.data ?? []) as Zeit[]);
      setAbwesenheiten((aRes.data ?? []) as Abwesenheit[]);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  const a = useMemo(() => {
    const heute = new Date();
    const jetztJahr = heute.getFullYear();
    const jetztMonat = heute.getMonth();
    const heuteStr = `${jetztJahr}-${String(jetztMonat + 1).padStart(2, '0')}-${String(
      heute.getDate(),
    ).padStart(2, '0')}`;

    // ── KPIs ──
    const aktiveMitarbeiter = mitarbeiter.filter(
      (m) =>
        !m.austrittsdatum && (m.status ?? '').toLowerCase() !== 'inaktiv',
    ).length;

    const erfassteStundenMonat = zeiten.reduce((s, z) => {
      if (!z.datum) return s;
      const jm = jahrMonat(z.datum);
      if (!jm) return s;
      if (jm.jahr === jetztJahr && jm.monat === jetztMonat) {
        return s + stunden(z);
      }
      return s;
    }, 0);

    const abwesendHeute = abwesenheiten.filter((ab) => {
      if (!ab.von || !ab.bis) return false;
      if (ABWESEND_UNGUELTIG.includes((ab.status ?? '').toLowerCase())) return false;
      return ab.von <= heuteStr && heuteStr <= ab.bis;
    }).length;

    const offeneAntraege = abwesenheiten.filter(
      (ab) => !ANTRAG_ERLEDIGT.includes((ab.status ?? '').toLowerCase()),
    ).length;

    // ── Mitarbeiter nach Abteilung (Torte) ──
    const abtMap = new Map<string, number>();
    for (const m of mitarbeiter) {
      const k = m.abteilung ?? 'ohne Abteilung';
      abtMap.set(k, (abtMap.get(k) ?? 0) + 1);
    }
    const nachAbteilung: DiagrammPunkt[] = Array.from(abtMap.entries()).map(
      ([name, wert]) => ({ name, wert }),
    );

    // ── Abwesenheitstage nach Typ (Balken) ──
    const typMap = new Map<string, number>();
    for (const ab of abwesenheiten) {
      const k = ab.typ ?? 'unbekannt';
      typMap.set(k, (typMap.get(k) ?? 0) + Number(ab.tage ?? 0));
    }
    const abwesenheitNachTyp: DiagrammPunkt[] = Array.from(typMap.entries())
      .map(([name, wert]) => ({ name, wert: Math.round(wert * 10) / 10 }))
      .sort((x, y) => y.wert - x.wert);

    // ── Erfasste Stunden pro Monat (letzte 12 Monate) ──
    const monatMap = new Map<string, number>();
    const monate: { key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(jetztJahr, jetztMonat - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monate.push({
        key,
        label: `${MONATE[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      });
      monatMap.set(key, 0);
    }
    for (const z of zeiten) {
      if (!z.datum) continue;
      const jm = jahrMonat(z.datum);
      if (!jm) continue;
      const key = `${jm.jahr}-${jm.monat}`;
      if (monatMap.has(key)) {
        monatMap.set(key, (monatMap.get(key) ?? 0) + stunden(z));
      }
    }
    const stundenProMonat: DiagrammPunkt[] = monate.map((m) => ({
      name: m.label,
      wert: Math.round((monatMap.get(m.key) ?? 0) * 10) / 10,
    }));

    return {
      aktiveMitarbeiter,
      erfassteStundenMonat,
      abwesendHeute,
      offeneAntraege,
      nachAbteilung,
      abwesenheitNachTyp,
      stundenProMonat,
    };
  }, [mitarbeiter, zeiten, abwesenheiten]);

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
          <span>👥</span> HR-Report
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
          Belegschaft, erfasste Arbeitszeit und Abwesenheiten im Überblick — für
          eine vorausschauende Personalplanung.
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
          Lade HR-Daten …
        </div>
      ) : (
        <>
          <KpiRaster>
            <KpiKarte
              titel="Aktive Mitarbeiter"
              wert={a.aktiveMitarbeiter}
              icon="👥"
              unterzeile="in Beschäftigung"
            />
            <KpiKarte
              titel="Erfasste Stunden (Monat)"
              wert={stundenText(a.erfassteStundenMonat)}
              einheit="h"
              icon="⏱️"
              akzentFarbe="#00e5ff"
            />
            <KpiKarte
              titel="Abwesend heute"
              wert={a.abwesendHeute}
              icon="🌴"
              akzentFarbe={a.abwesendHeute > 0 ? '#C9A84C' : '#22c55e'}
              unterzeile="Urlaub / krank"
            />
            <KpiKarte
              titel="Offene Anträge"
              wert={a.offeneAntraege}
              icon="📋"
              akzentFarbe={a.offeneAntraege > 0 ? '#ef4444' : '#22c55e'}
              unterzeile="zu genehmigen"
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
              titel="Mitarbeiter nach Abteilung"
              typ="torte"
              daten={a.nachAbteilung}
            />
            <DiagrammKarte
              titel="Abwesenheitstage nach Typ"
              typ="balken"
              daten={a.abwesenheitNachTyp}
              einheit="Tage"
              farbe="#C9A84C"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <DiagrammKarte
              titel="Erfasste Stunden pro Monat (letzte 12 Monate)"
              typ="balken"
              daten={a.stundenProMonat}
              einheit="h"
              farbe="#00e5ff"
            />
          </div>
        </>
      )}
    </div>
  );
}
