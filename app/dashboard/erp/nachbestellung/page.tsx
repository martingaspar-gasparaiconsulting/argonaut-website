'use client';

// ============================================================
// ARGONAUT OS · BLOCK 2.3 · Auto-Nachbestellung (Phase A · Lesen)
// ------------------------------------------------------------
// Liest die DB-Funktion public.nachbestell_vorschlag() und zeigt:
// KPI-Kacheln · KI-Auge · nach Lieferant gruppierte Vorschläge
// mit Meldebestand-Ampel, empfohlener Menge & geschätzten Kosten.
//
// Aktion (sicher, kein DB-Schreiben): "Bestell-E-Mail vorbereiten"
// öffnet die Mail-App mit fertigem Text (mailto). Senden = manuell.
// Der Ein-Klick-DB-Beleg folgt in Phase B.
//
// Inline-Styles · Branding: ARGONAUT / "die KI".
// Marken: Navy #0A1628 · Gold #C9A84C · Cyan #00e5ff.
// Pfad im Repo: app/dashboard/erp/nachbestellung/page.tsx
// ============================================================

import { useEffect, useState, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiKlartext from '../../_components/KiKlartext';

// --- Supabase Browser-Client (Cookie-Session, wie der Rest der App) ---
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

// --- Marken-Tokens ------------------------------------------
const C = {
  navy: '#0A1628',
  card: '#0E1D30',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  text: '#E8EEF5',
  dim: '#8FA3B8',
  line: 'rgba(255,255,255,0.08)',
  green: '#3FB950',
  yellow: '#D8A657',
  red: '#E5534B',
};

// --- Zeile aus nachbestell_vorschlag() ----------------------
interface Vorschlag {
  artikel_id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  einheit: string;
  aktueller_bestand: number;
  mindestbestand: number;
  zielbestand: number;
  empfohlene_menge: number;
  einkaufspreis: number | null;
  geschaetzte_kosten: number;
  lieferant_id: string | null;
  lieferant_name: string | null;
  lieferant_email: string | null;
  ampel: string;
}

// --- Gruppe je Lieferant ------------------------------------
interface Gruppe {
  key: string;
  name: string;
  email: string | null;
  zeilen: Vorschlag[];
  summe: number;
}

// --- Formatierung -------------------------------------------
function euro(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function zahl(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return n.toLocaleString('de-DE');
}
function ampelFarbe(a: string): string {
  if (a === 'rot') return C.red;
  if (a === 'gelb') return C.yellow;
  return C.green;
}

export default function NachbestellungPage() {
  const [zeilen, setZeilen] = useState<Vorschlag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // --- Daten laden --------------------------------------------
  const datenLaden = useCallback(async () => {
    setLaden(true);
    setFehler(null);
    const { data, error } = await supabase.rpc('nachbestell_vorschlag');
    if (error) {
      setFehler(error.message);
      setZeilen([]);
    } else {
      setZeilen((data ?? []) as Vorschlag[]);
    }
    setLaden(false);
  }, []);

  useEffect(() => {
    datenLaden();
  }, [datenLaden]);

  // --- Nach Lieferant gruppieren ------------------------------
  const gruppen = useMemo<Gruppe[]>(() => {
    const map = new Map<string, Gruppe>();
    for (const z of zeilen) {
      const key = z.lieferant_id ?? 'ohne';
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: z.lieferant_name ?? 'Kein Lieferant hinterlegt',
          email: z.lieferant_email,
          zeilen: [],
          summe: 0,
        });
      }
      const g = map.get(key)!;
      g.zeilen.push(z);
      g.summe += z.geschaetzte_kosten || 0;
    }
    // Gruppen mit Lieferant zuerst, teuerste oben
    return [...map.values()].sort((a, b) => {
      if (a.key === 'ohne') return 1;
      if (b.key === 'ohne') return -1;
      return b.summe - a.summe;
    });
  }, [zeilen]);

  // --- KPIs ---------------------------------------------------
  const gesamtKosten = useMemo(() => zeilen.reduce((s, z) => s + (z.geschaetzte_kosten || 0), 0), [zeilen]);
  const anzahlRot = useMemo(() => zeilen.filter((z) => z.ampel === 'rot').length, [zeilen]);
  const anzahlLieferanten = useMemo(
    () => new Set(zeilen.filter((z) => z.lieferant_id).map((z) => z.lieferant_id)).size,
    [zeilen],
  );

  // --- KI-Kontext ---------------------------------------------
  const kiKontext = useMemo(() => {
    if (laden || zeilen.length === 0) return '';
    const kritisch = zeilen
      .filter((z) => z.ampel === 'rot')
      .map((z) => z.bezeichnung)
      .slice(0, 4);
    const knapp = zeilen
      .filter((z) => z.ampel === 'gelb')
      .map((z) => `${z.bezeichnung} (${z.aktueller_bestand} statt ${z.mindestbestand})`)
      .slice(0, 4);
    return (
      `Nachbestellung. ${zeilen.length} Artikel am oder unter Meldebestand, verteilt auf ${anzahlLieferanten} Lieferanten. ` +
      `Geschaetzte Gesamtkosten ${gesamtKosten.toFixed(2)} Euro. ` +
      `${anzahlRot} Artikel komplett leer (kritisch): ${kritisch.join(', ') || 'keine'}. ` +
      `Knapp: ${knapp.join(', ') || 'keine'}. Sage, was zuerst bestellt werden sollte und wie dringend.`
    );
  }, [laden, zeilen, anzahlLieferanten, gesamtKosten, anzahlRot]);

  // --- Bestell-E-Mail vorbereiten (mailto, kein Versand) ------
  function mailtoLink(g: Gruppe): string {
    const betreff = `Bestellung – ${g.zeilen.length} Position(en)`;
    const zeilenText = g.zeilen
      .map(
        (z, i) =>
          `${i + 1}. ${z.bezeichnung}${z.artikelnummer ? ' (Art.-Nr. ' + z.artikelnummer + ')' : ''} – ${zahl(z.empfohlene_menge)} ${z.einheit}`,
      )
      .join('\n');
    const body =
      `Sehr geehrte Damen und Herren,\n\n` +
      `wir möchten folgende Artikel bestellen:\n\n` +
      `${zeilenText}\n\n` +
      `Bitte bestätigen Sie uns Verfügbarkeit und Liefertermin.\n\n` +
      `Mit freundlichen Grüßen`;
    return `mailto:${g.email ?? ''}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(body)}`;
  }

  // ============================================================
  // Styles
  // ============================================================
  const seite: CSSProperties = {
    background: C.navy,
    minHeight: '100vh',
    padding: '28px 32px 60px',
    color: C.text,
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };
  const karte: CSSProperties = {
    background: C.card,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    padding: 20,
  };
  const th: CSSProperties = {
    textAlign: 'left',
    padding: '9px 12px',
    fontSize: 11,
    letterSpacing: 0.4,
    color: C.dim,
    textTransform: 'uppercase',
    borderBottom: `1px solid ${C.line}`,
    whiteSpace: 'nowrap',
  };
  const td: CSSProperties = {
    padding: '10px 12px',
    fontSize: 14,
    borderBottom: `1px solid ${C.line}`,
    whiteSpace: 'nowrap',
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={seite}>
      {/* Kopf */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: C.gold, fontWeight: 700 }}>ERP · BLOCK 2.3</div>
        <h1 style={{ margin: '4px 0 0', fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800 }}>
          Auto-Nachbestellung
        </h1>
        <div style={{ color: C.dim, fontSize: 14, marginTop: 4 }}>
          Was ist knapp, wie viel nachbestellen, bei wem — gruppiert nach Lieferant.
        </div>
      </div>

      {/* Fehler */}
      {fehler && (
        <div style={{ ...karte, borderColor: C.red, color: C.red, marginBottom: 20 }}>
          Fehler beim Laden: {fehler}
        </div>
      )}

      {laden ? (
        <div style={{ ...karte, textAlign: 'center', color: C.dim }}>Vorschlag wird berechnet …</div>
      ) : zeilen.length === 0 ? (
        <div style={{ ...karte, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Alles auf Sollbestand</div>
          <div style={{ color: C.dim, fontSize: 14, marginTop: 4 }}>
            Aktuell liegt kein Artikel unter dem Meldebestand. Nichts nachzubestellen.
          </div>
        </div>
      ) : (
        <>
          {/* KPI-Kacheln */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Artikel nachzubestellen', wert: String(zeilen.length), farbe: C.gold },
              { label: 'Geschätzte Gesamtkosten', wert: euro(gesamtKosten), farbe: C.cyan },
              { label: 'Betroffene Lieferanten', wert: String(anzahlLieferanten), farbe: C.text },
              { label: 'Kritisch (leer)', wert: String(anzahlRot), farbe: anzahlRot > 0 ? C.red : C.green },
            ].map((k, i) => (
              <div key={i} style={{ ...karte, flex: '1 1 200px', minWidth: 200 }}>
                <div style={{ fontSize: 12, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {k.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: k.farbe, marginTop: 8 }}>{k.wert}</div>
              </div>
            ))}
          </div>

          {/* KI-Auge */}
          <div style={{ marginBottom: 20 }}>
            <KiKlartext modul="Auto-Nachbestellung" kontext={kiKontext} dunkel akzent={C.gold} />
          </div>

          {/* Gruppen je Lieferant */}
          {gruppen.map((g) => (
            <div key={g.key} style={{ ...karte, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              {/* Lieferant-Kopf */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  borderBottom: `1px solid ${C.line}`,
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700 }}>{g.name}</div>
                  <div style={{ color: C.dim, fontSize: 13, marginTop: 2 }}>
                    {g.zeilen.length} Position(en) · geschätzt {euro(g.summe)}
                    {g.email ? ' · ' + g.email : ''}
                  </div>
                </div>
                {g.email ? (
                  <a
                    href={mailtoLink(g)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 18px',
                      borderRadius: 10,
                      border: `1px solid ${C.gold}`,
                      background: 'rgba(201,168,76,0.14)',
                      color: C.gold,
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    📧 Bestell-E-Mail vorbereiten
                  </a>
                ) : (
                  <span style={{ color: C.dim, fontSize: 13 }}>Keine E-Mail hinterlegt</span>
                )}
              </div>

              {/* Positionen */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'center' }}></th>
                      <th style={th}>Art.-Nr.</th>
                      <th style={th}>Bezeichnung</th>
                      <th style={{ ...th, textAlign: 'right' }}>Bestand</th>
                      <th style={{ ...th, textAlign: 'right' }}>Meldebestand</th>
                      <th style={{ ...th, textAlign: 'right' }}>Empfehlung</th>
                      <th style={{ ...th, textAlign: 'right' }}>EK / Einheit</th>
                      <th style={{ ...th, textAlign: 'right' }}>geschätzt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.zeilen.map((z) => (
                      <tr key={z.artikel_id}>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span
                            title={z.ampel === 'rot' ? 'leer' : 'knapp'}
                            style={{
                              display: 'inline-block',
                              width: 11,
                              height: 11,
                              borderRadius: '50%',
                              background: ampelFarbe(z.ampel),
                            }}
                          />
                        </td>
                        <td style={{ ...td, color: C.dim }}>{z.artikelnummer ?? '–'}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{z.bezeichnung}</td>
                        <td style={{ ...td, textAlign: 'right', color: z.ampel === 'rot' ? C.red : C.text }}>
                          {zahl(z.aktueller_bestand)} <span style={{ color: C.dim, fontSize: 12 }}>{z.einheit}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: C.dim }}>{zahl(z.mindestbestand)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: C.gold }}>
                          + {zahl(z.empfohlene_menge)} {z.einheit}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: C.dim }}>{euro(z.einkaufspreis)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{euro(z.geschaetzte_kosten)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Fußnote */}
          <div style={{ ...karte, borderColor: 'rgba(0,229,255,0.25)', color: C.dim, fontSize: 13 }}>
            <b style={{ color: C.cyan }}>So wird gerechnet:</b> Empfehlung = Auffüllen auf den doppelten
            Meldebestand (Sicherheitspuffer). Die „Bestell-E-Mail vorbereiten" öffnet nur deine Mail-App mit
            fertigem Text — gesendet wird nichts automatisch. Der Ein-Klick-Beleg direkt in die Bestellungen
            (Phase B) und die optimale Andler-Bestellmenge folgen als nächste Ausbaustufen.
          </div>
        </>
      )}
    </div>
  );
}
