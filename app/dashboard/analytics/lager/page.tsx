'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · Lager/ERP-Report (Block B-5)
 * ------------------------------------------------------------------
 * Wertet "artikel" + "bestellungen" + "lagerbewegungen" aus.
 *   Artikel (aktiv)    = count(artikel where aktiv ≠ false)
 *   Lagerwert          = Σ (aktueller_bestand × einkaufspreis)
 *   Niedrige Bestände  = Bestand < Mindestbestand (nur aktive, Mindest > 0)
 *   Offene Bestellungen= Status ≠ geliefert/abgeschlossen/storniert
 * Robust bei leeren Tabellen (Bestellungen/Bewegungen).
 * Route: /dashboard/analytics/lager
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

type Artikel = {
  id: string;
  kategorie: string | null;
  einkaufspreis: number | null;
  aktueller_bestand: number | null;
  mindestbestand: number | null;
  aktiv: boolean | null;
};

type Bestellung = {
  id: string;
  status: string | null;
};

type Bewegung = {
  id: string;
  typ: string | null;
  menge: number | null;
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Status, die eine Bestellung als "abgeschlossen" markieren
const BESTELLUNG_FERTIG = ['geliefert', 'abgeschlossen', 'storniert'];

function euro(n: number): string {
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function LagerReport() {
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [bestellungen, setBestellungen] = useState<Bestellung[]>([]);
  const [bewegungen, setBewegungen] = useState<Bewegung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const [aRes, bRes, mRes] = await Promise.all([
        supabase
          .from('artikel')
          .select(
            'id, kategorie, einkaufspreis, aktueller_bestand, mindestbestand, aktiv',
          ),
        supabase.from('bestellungen').select('id, status'),
        supabase.from('lagerbewegungen').select('id, typ, menge'),
      ]);
      if (!aktiv) return;
      const err = aRes.error ?? bRes.error ?? mRes.error;
      if (err) {
        setFehler(err.message);
        setLaden(false);
        return;
      }
      setArtikel((aRes.data ?? []) as Artikel[]);
      setBestellungen((bRes.data ?? []) as Bestellung[]);
      setBewegungen((mRes.data ?? []) as Bewegung[]);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  const a = useMemo(() => {
    // ── KPIs ──
    const artikelAktiv = artikel.filter((x) => x.aktiv !== false).length;

    const lagerwert = artikel.reduce(
      (s, x) =>
        s + Number(x.aktueller_bestand ?? 0) * Number(x.einkaufspreis ?? 0),
      0,
    );

    const niedrigeBestaende = artikel.filter((x) => {
      if (x.aktiv === false) return false;
      const bestand = Number(x.aktueller_bestand ?? 0);
      const mindest = Number(x.mindestbestand ?? 0);
      return mindest > 0 && bestand < mindest;
    }).length;

    const offeneBestellungen = bestellungen.filter(
      (b) => !BESTELLUNG_FERTIG.includes((b.status ?? '').toLowerCase()),
    ).length;

    // ── Lagerwert nach Kategorie (Balken) ──
    const katMap = new Map<string, number>();
    for (const x of artikel) {
      const k = x.kategorie ?? 'ohne Kategorie';
      const wert = Number(x.aktueller_bestand ?? 0) * Number(x.einkaufspreis ?? 0);
      katMap.set(k, (katMap.get(k) ?? 0) + wert);
    }
    const lagerwertNachKategorie: DiagrammPunkt[] = Array.from(katMap.entries())
      .map(([name, wert]) => ({ name, wert: Math.round(wert * 100) / 100 }))
      .sort((x, y) => y.wert - x.wert);

    // ── Bestellungen nach Status (Torte) ──
    const bestellStatusMap = new Map<string, number>();
    for (const b of bestellungen) {
      const s = b.status ?? 'unbekannt';
      bestellStatusMap.set(s, (bestellStatusMap.get(s) ?? 0) + 1);
    }
    const bestellungenNachStatus: DiagrammPunkt[] = Array.from(
      bestellStatusMap.entries(),
    ).map(([name, wert]) => ({ name, wert }));

    // ── Lagerbewegungen nach Typ (Balken) ──
    const bewegTypMap = new Map<string, number>();
    for (const m of bewegungen) {
      const t = m.typ ?? 'unbekannt';
      bewegTypMap.set(t, (bewegTypMap.get(t) ?? 0) + Number(m.menge ?? 0));
    }
    const bewegungenNachTyp: DiagrammPunkt[] = Array.from(
      bewegTypMap.entries(),
    ).map(([name, wert]) => ({ name, wert: Math.round(wert * 100) / 100 }));

    return {
      artikelAktiv,
      lagerwert,
      niedrigeBestaende,
      offeneBestellungen,
      lagerwertNachKategorie,
      bestellungenNachStatus,
      bewegungenNachTyp,
    };
  }, [artikel, bestellungen, bewegungen]);

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
          <span>📦</span> Lager- &amp; ERP-Report
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
          Lagerwert, Nachbestell-Bedarf und Warenfluss auf einen Blick — damit
          nichts unbemerkt zur Neige geht.
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
          Lade Lager- &amp; ERP-Daten …
        </div>
      ) : (
        <>
          <KpiRaster>
            <KpiKarte
              titel="Artikel (aktiv)"
              wert={a.artikelAktiv}
              icon="📦"
              unterzeile="im Sortiment"
            />
            <KpiKarte
              titel="Lagerwert"
              wert={euro(a.lagerwert)}
              einheit="€"
              icon="💰"
              akzentFarbe="#22c55e"
              unterzeile="zu Einkaufspreisen"
            />
            <KpiKarte
              titel="Niedrige Bestände"
              wert={a.niedrigeBestaende}
              icon="⚠️"
              akzentFarbe={a.niedrigeBestaende > 0 ? '#ef4444' : '#22c55e'}
              unterzeile="unter Mindestbestand"
            />
            <KpiKarte
              titel="Offene Bestellungen"
              wert={a.offeneBestellungen}
              icon="🚚"
              akzentFarbe="#00e5ff"
              unterzeile="in Zulauf"
            />
          </KpiRaster>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
              gap: 16,
              marginTop: 20,
            }}
          >
            <DiagrammKarte
              titel="Lagerwert nach Kategorie"
              typ="balken"
              daten={a.lagerwertNachKategorie}
              einheit="€"
              farbe="#22c55e"
            />
            <DiagrammKarte
              titel="Bestellungen nach Status"
              typ="torte"
              daten={a.bestellungenNachStatus}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <DiagrammKarte
              titel="Lagerbewegungen nach Typ (Menge)"
              typ="balken"
              daten={a.bewegungenNachTyp}
              farbe="#00e5ff"
              hoehe={240}
            />
          </div>
        </>
      )}
    </div>
  );
}
