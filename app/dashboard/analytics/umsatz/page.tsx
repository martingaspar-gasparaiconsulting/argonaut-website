'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Analytics · Umsatz-Report (Block B-2)
 * ------------------------------------------------------------------
 * Wertet die Tabelle "rechnungen" aus. KPIs werden aus echten Datums-/
 * Betragsspalten berechnet (robust gegen Status-Schreibweisen):
 *   Gesamtumsatz  = Σ brutto_summe (ohne Entwürfe)
 *   Bezahlt       = Σ bezahlter_betrag (auch Teilzahlungen)
 *   Offen         = Σ (brutto - bezahlt), Rest > 0
 *   Überfällig    = Offen, wo faelligkeitsdatum < heute
 * Route: /dashboard/analytics/umsatz
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
import ZeitraumFilter, {
  type Zeitraum,
  imZeitraum,
  vorperiode,
  ZEITRAUM_ALLES,
} from '../../_components/ZeitraumFilter';
import KiKlartext from '../../_components/KiKlartext';
import { erstelleUmsatzReportPdf, type PdfFirma } from '../../_components/umsatzReportPdf';

// ── Datensatz-Form (nur die Spalten, die wir brauchen) ────────────
type Rechnung = {
  id: string;
  zahlungsstatus: string | null;
  rechnungsdatum: string | null;
  faelligkeitsdatum: string | null;
  bezahlt_am: string | null;
  brutto_summe: number | null;
  bezahlter_betrag: number | null;
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MONATE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

// Euro-Format: 1.184,05
function euro(n: number): string {
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function UmsatzReport() {
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeitraum, setZeitraum] = useState<Zeitraum>(ZEITRAUM_ALLES);
  const [kiErgebnis, setKiErgebnis] = useState<{ klartext: string; aktion: string } | null>(null);
  const [pdfLaden, setPdfLaden] = useState(false);

  // Daten laden (RLS filtert automatisch auf den eingeloggten Nutzer)
  useEffect(() => {
    let aktiv = true;
    (async () => {
      const { data, error } = await supabase
        .from('rechnungen')
        .select(
          'id, zahlungsstatus, rechnungsdatum, faelligkeitsdatum, bezahlt_am, brutto_summe, bezahlter_betrag',
        );
      if (!aktiv) return;
      if (error) {
        setFehler(error.message);
        setLaden(false);
        return;
      }
      setRechnungen((data ?? []) as Rechnung[]);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  // Auswertung (rechnet nur neu, wenn sich die Daten ändern)
  const a = useMemo(() => {
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);

    // Entwürfe zählen nicht als Umsatz
    const gestellt = rechnungen.filter(
      (r) => (r.zahlungsstatus ?? '') !== 'entwurf',
    );

    // KPI-Berechnung als wiederverwendbare Funktion (Zeitraum + Vorperiode)
    function kpiFuer(liste: Rechnung[]) {
      let gesamt = 0;
      let bezahlt = 0;
      let offen = 0;
      let ueberfaellig = 0;
      for (const r of liste) {
        const brutto = Number(r.brutto_summe ?? 0);
        const gezahlt = Number(r.bezahlter_betrag ?? 0);
        const rest = Math.max(brutto - gezahlt, 0);
        gesamt += brutto;
        bezahlt += gezahlt;
        offen += rest;
        if (rest > 0 && r.faelligkeitsdatum) {
          const faellig = new Date(r.faelligkeitsdatum);
          faellig.setHours(0, 0, 0, 0);
          if (faellig < heute) ueberfaellig += rest;
        }
      }
      return { gesamt, bezahlt, offen, ueberfaellig };
    }

    // Aktueller Zeitraum
    const imBereich = gestellt.filter((r) => imZeitraum(r.rechnungsdatum, zeitraum));
    const { gesamt, bezahlt, offen, ueberfaellig } = kpiFuer(imBereich);

    // Vorperiode (gleich lang / echter Vor-Kalenderzeitraum)
    const vp = vorperiode(zeitraum);
    const vorKpi = vp ? kpiFuer(gestellt.filter((r) => imZeitraum(r.rechnungsdatum, vp))) : null;

    // Trend in % (undefined = kein sinnvoller Vergleich, z. B. Vorperiode leer)
    const trendProzent = (aktuell: number, vor: number | undefined): number | undefined => {
      if (vor === undefined || vor <= 0) return undefined;
      return Math.round(((aktuell - vor) / vor) * 100);
    };
    const trends = {
      gesamt: trendProzent(gesamt, vorKpi?.gesamt),
      bezahlt: trendProzent(bezahlt, vorKpi?.bezahlt),
    };
    const vorLabel = vp?.label ?? null;

    // Umsatz pro Monat — letzte 12 Monate vorbelegen (auch leere Monate)
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
    for (const r of gestellt) {
      if (!r.rechnungsdatum) continue;
      const d = new Date(r.rechnungsdatum);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monatMap.has(key)) {
        monatMap.set(key, (monatMap.get(key) ?? 0) + Number(r.brutto_summe ?? 0));
      }
    }
    const monatsUmsatz: DiagrammPunkt[] = monate.map((m) => ({
      name: m.label,
      wert: Math.round((monatMap.get(m.key) ?? 0) * 100) / 100,
    }));

    // Status-Verteilung (im gewählten Zeitraum, inkl. Entwürfe)
    const statusMap = new Map<string, number>();
    for (const r of rechnungen) {
      if (!imZeitraum(r.rechnungsdatum, zeitraum)) continue;
      const s = r.zahlungsstatus ?? 'unbekannt';
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    }
    const statusVerteilung: DiagrammPunkt[] = Array.from(
      statusMap.entries(),
    ).map(([name, wert]) => ({ name, wert }));

    return {
      gesamt,
      bezahlt,
      offen,
      ueberfaellig,
      monatsUmsatz,
      statusVerteilung,
      anzahl: imBereich.length,
      trends,
      vorLabel,
    };
  }, [rechnungen, zeitraum]);

  // Kompakter, stabiler KI-Kontext für die Klartext-Auswertung
  const kiKontext = useMemo(() => {
    const teile: string[] = [];
    teile.push(`Zeitraum: ${zeitraum.label}.`);
    teile.push(
      `Gesamtumsatz: ${euro(a.gesamt)} aus ${a.anzahl} Rechnung${a.anzahl === 1 ? '' : 'en'}.`,
    );
    teile.push(
      `Eingegangen (bezahlt): ${euro(a.bezahlt)}. Offen: ${euro(a.offen)}, davon überfällig: ${euro(a.ueberfaellig)}.`,
    );
    if (a.vorLabel && typeof a.trends.gesamt === 'number') {
      const t = a.trends.gesamt;
      teile.push(`Gegenüber ${a.vorLabel}: Umsatz ${Math.abs(t)} % ${t >= 0 ? 'höher' : 'niedriger'}.`);
    } else if (a.vorLabel) {
      teile.push(`Vergleich mit ${a.vorLabel}: keine Vergleichsdaten vorhanden.`);
    }
    return teile.join('\n');
  }, [a, zeitraum]);

  // PDF-Export: lädt die eigenen Firmendaten aus profiles und erzeugt das PDF
  async function exportPdf() {
    setPdfLaden(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let firma: PdfFirma = {};
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select(
            'firma_name, firma_rechtsform, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_ust_id, firma_steuernummer, firma_geschaeftsfuehrer, firma_akzentfarbe',
          )
          .eq('id', user.id)
          .maybeSingle();
        if (prof) {
          firma = {
            name: prof.firma_name,
            rechtsform: prof.firma_rechtsform,
            strasse: prof.firma_strasse,
            plz: prof.firma_plz,
            ort: prof.firma_ort,
            telefon: prof.firma_telefon,
            email: prof.firma_email,
            website: prof.firma_website,
            ustId: prof.firma_ust_id,
            steuernummer: prof.firma_steuernummer,
            geschaeftsfuehrer: prof.firma_geschaeftsfuehrer,
            akzentfarbe: prof.firma_akzentfarbe,
          };
        }
      }
      erstelleUmsatzReportPdf({
        firma,
        zeitraumLabel: zeitraum.label,
        kpi: {
          gesamt: a.gesamt,
          bezahlt: a.bezahlt,
          offen: a.offen,
          ueberfaellig: a.ueberfaellig,
          anzahl: a.anzahl,
        },
        vorLabel: a.vorLabel,
        trendGesamt: a.trends.gesamt,
        trendBezahlt: a.trends.bezahlt,
        monate: a.monatsUmsatz,
        kiText: kiErgebnis?.klartext,
        kiAktion: kiErgebnis?.aktion,
      });
    } catch (e) {
      console.error('PDF-Export fehlgeschlagen', e);
      alert('Der PDF-Export ist fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setPdfLaden(false);
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>
      {/* ── Einheitlicher Modul-Kopf ── */}
      <div
        style={{
          marginBottom: 24,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
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
            <span>📊</span> Umsatz-Report
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
            Umsatzentwicklung, Zahlungseingänge und offene Forderungen auf einen
            Blick — direkt aus deinen Rechnungen.
          </p>
        </div>

        <button
          onClick={exportPdf}
          disabled={pdfLaden || laden || !!fehler}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: '#C9A84C',
            color: '#0A1628',
            fontSize: 14,
            fontWeight: 700,
            cursor: pdfLaden || laden || !!fehler ? 'default' : 'pointer',
            opacity: pdfLaden || laden || !!fehler ? 0.6 : 1,
          }}
        >
          <span>📄</span>
          {pdfLaden ? 'Erstelle PDF …' : 'Als PDF exportieren'}
        </button>
      </div>

      {/* Zeitraum-Filter (Schnellauswahl + Kalender) */}
      <ZeitraumFilter wert={zeitraum} onChange={setZeitraum} />

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
          Lade Umsatzdaten …
        </div>
      ) : (
        <>
          <KpiRaster>
            <KpiKarte
              titel="Gesamtumsatz"
              wert={euro(a.gesamt)}
              einheit="€"
              icon="💶"
              trend={a.trends.gesamt}
              unterzeile={a.vorLabel ? `vs. ${a.vorLabel}` : `${a.anzahl} Rechnung${a.anzahl === 1 ? '' : 'en'}`}
            />
            <KpiKarte
              titel="Bezahlt (eingegangen)"
              wert={euro(a.bezahlt)}
              einheit="€"
              icon="✅"
              akzentFarbe="#22c55e"
              trend={a.trends.bezahlt}
              unterzeile={a.vorLabel ? `vs. ${a.vorLabel}` : undefined}
            />
            <KpiKarte
              titel="Offen"
              wert={euro(a.offen)}
              einheit="€"
              icon="⏳"
              akzentFarbe="#00e5ff"
            />
            <KpiKarte
              titel="Überfällig"
              wert={euro(a.ueberfaellig)}
              einheit="€"
              icon="⚠️"
              akzentFarbe="#ef4444"
            />
          </KpiRaster>

          {/* KI-Klartext: wertet die Zahlen des gewählten Zeitraums aus */}
          {a.gesamt > 0 && (
            <KiKlartext
              kontext={kiKontext}
              modul="Umsatz-Analyse"
              akzent="#C9A84C"
              dunkel
              onErgebnis={(klartext, aktion) => setKiErgebnis({ klartext, aktion })}
              style={{ marginTop: 20 }}
            />
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
              gap: 16,
              marginTop: 20,
            }}
          >
            <DiagrammKarte
              titel="Umsatz pro Monat (letzte 12 Monate)"
              typ="balken"
              daten={a.monatsUmsatz}
              einheit="€"
            />
            <DiagrammKarte
              titel="Rechnungs-Status"
              typ="torte"
              daten={a.statusVerteilung}
            />
          </div>
        </>
      )}
    </div>
  );
}
