'use client';

// ============================================================
// ARGONAUT OS · Block 1 · I-2b · Preisliste importieren
//
// EINE ZEILE = EINE VARIANTE MIT IHREN PREISEN.
//   Der Import legt `holz_sortiment` und `holz_preise` in einem Zug an.
//   Man kann keinen Preis importieren, ohne dass die Variante existiert.
//
// DIE VORBELEGUNG IST "NICHT ÜBERSCHREIBEN".
//   Ein Import darf nicht ungefragt die Preise ändern, die letzte Woche von
//   Hand gepflegt wurden. Wer überschreiben will, klickt es an — und sieht
//   vorher, welcher Preis wodurch ersetzt wird.
//
// VOR DER FREIGABE PASSIERT NICHTS.
//
// Pfad: app/dashboard/holz/import/page.tsx
// ============================================================

import { useState, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import DateiImport from '../../_components/DateiImport';
import { leseCsv, type CsvBefund } from '../../_components/csvLogik';
import {
  erkenneSortimentSpalten, pruefeSortimentImport, variantenSchluessel,
  type SortimentZielFeld, type SortimentZeile, type SortimentBefund,
} from '../../_components/sortimentImportLogik';
import { einheitKurz, holzartName, formatZahl } from '../../_components/holzLogik';
import { trocknungsgradName, type Sortiment } from '../../_components/sortimentLogik';
import { eur, type Preis } from '../../_components/preisLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const ZIELE: Array<{ wert: SortimentZielFeld; label: string }> = [
  { wert: 'ignorieren', label: '— nicht übernehmen —' },
  { wert: 'holzart', label: 'Holzart' },
  { wert: 'scheitlaenge', label: 'Scheitlänge' },
  { wert: 'trocknungsgrad', label: 'Trocknungsgrad' },
  { wert: 'restfeuchte', label: 'Restfeuchte %' },
  { wert: 'preis_srm', label: 'Preis je SRM' },
  { wert: 'preis_rm', label: 'Preis je RM' },
  { wert: 'preis_fm', label: 'Preis je FM' },
  { wert: 'preis_m3', label: 'Preis je m³' },
  { wert: 'steuersatz', label: 'Steuersatz %' },
  { wert: 'notiz', label: 'Notiz' },
];

/** Was der Bestand zu einer Zeile sagt. */
type Abgleich = {
  variante: Sortiment | null;
  /** Preise, die es schon gibt — je Einheit. */
  vorhandene: Map<string, Preis>;
};

export default function PreislisteImportPage() {
  const [schritt, setSchritt] = useState<1 | 2 | 3 | 4>(1);
  const [fehler, setFehler] = useState<string | null>(null);

  const [dateiname, setDateiname] = useState('');
  const [csv, setCsv] = useState<CsvBefund | null>(null);
  const [zuordnung, setZuordnung] = useState<SortimentZielFeld[]>([]);

  const [befund, setBefund] = useState<SortimentBefund | null>(null);
  const [abgleich, setAbgleich] = useState<Map<string, Abgleich>>(new Map());
  const [ueberschreiben, setUeberschreiben] = useState(false);
  const [laden, setLaden] = useState(false);

  const [schreibt, setSchreibt] = useState(false);
  const [fortschritt, setFortschritt] = useState(0);
  const [ergebnis, setErgebnis] = useState<{
    varianten: number; preiseNeu: number; preiseErsetzt: number; uebersprungen: number; fehler: number;
  } | null>(null);

  // --- 1 · Datei ---------------------------------------------------------
  const dateiGewaehlt = useCallback(async (datei: File) => {
    setFehler(null); setBefund(null); setErgebnis(null);
    try {
      const bytes = new Uint8Array(await datei.arrayBuffer());
      const b = leseCsv(bytes);
      if (b.fehler.length > 0) { setFehler(b.fehler.join(' ')); return; }

      setDateiname(datei.name);
      setCsv(b);
      setZuordnung(erkenneSortimentSpalten(b.kopfzeile));
      setSchritt(2);
    } catch {
      setFehler('Die Datei konnte nicht gelesen werden.');
    }
  }, []);

  // --- 3 · Prüfen + Bestand abgleichen ----------------------------------
  async function pruefen() {
    if (!csv) return;
    setLaden(true); setFehler(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); return; }

      const b = pruefeSortimentImport(csv.zeilen, zuordnung);

      const [sRes, pRes] = await Promise.all([
        supabase.from('holz_sortiment').select('*'),
        supabase.from('holz_preise').select('*'),
      ]);
      const sortimente = (sRes.data as Sortiment[]) ?? [];
      const preise = (pRes.data as Preis[]) ?? [];

      const karte = new Map<string, Abgleich>();
      for (const z of b.zeilen) {
        const k = variantenSchluessel(z);
        if (!k) continue;
        const variante = sortimente.find(
          (s) => s.holzart === z.holzart && s.scheitlaenge_cm === z.scheitlaenge_cm && s.trocknungsgrad === z.trocknungsgrad,
        ) ?? null;

        const vorhandene = new Map<string, Preis>();
        if (variante) {
          for (const p of preise.filter((x) => x.sortiment_id === variante.id && x.aktiv)) {
            vorhandene.set(p.einheit, p);
          }
        }
        karte.set(k, { variante, vorhandene });
      }

      setBefund(b);
      setAbgleich(karte);
      setSchritt(3);
    } catch (e: unknown) {
      setFehler('Prüfung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }

  function zeileUmschalten(nr: number) {
    setBefund((b) => (b ? {
      ...b,
      zeilen: b.zeilen.map((z) => (z.nr === nr && z.fehler.length === 0 ? { ...z, uebernehmen: !z.uebernehmen } : z)),
    } : b));
  }

  // --- 4 · Schreiben ------------------------------------------------------
  const zuUebernehmen = useMemo(() => befund?.zeilen.filter((z) => z.uebernehmen) ?? [], [befund]);

  const vorschau = useMemo(() => {
    let variantenNeu = 0, preiseNeu = 0, preiseErsetzt = 0, preiseBehalten = 0;
    for (const z of zuUebernehmen) {
      const k = variantenSchluessel(z);
      const a = k ? abgleich.get(k) : undefined;
      if (!a?.variante) variantenNeu++;
      for (const p of z.preise) {
        const alt = a?.vorhandene.get(p.einheit);
        if (!alt) preiseNeu++;
        else if (ueberschreiben) preiseErsetzt++;
        else preiseBehalten++;
      }
    }
    return { variantenNeu, preiseNeu, preiseErsetzt, preiseBehalten };
  }, [zuUebernehmen, abgleich, ueberschreiben]);

  async function freigeben() {
    if (!befund || zuUebernehmen.length === 0) return;

    const text =
      `Preisliste übernehmen?\n\n` +
      `• ${vorschau.variantenNeu} Variante(n) neu anlegen\n` +
      `• ${vorschau.preiseNeu} Preis(e) neu setzen\n` +
      (ueberschreiben
        ? `• ${vorschau.preiseErsetzt} vorhandene Preis(e) ÜBERSCHREIBEN\n`
        : `• ${vorschau.preiseBehalten} vorhandene Preis(e) unverändert lassen\n`) +
      `\nBestehende Varianten werden nicht gelöscht.`;

    if (!window.confirm(text)) return;

    setSchreibt(true); setFehler(null); setFortschritt(0);
    let varianten = 0, preiseNeu = 0, preiseErsetzt = 0, uebersprungen = 0, fehlerZahl = 0;

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); return; }

      for (let i = 0; i < zuUebernehmen.length; i++) {
        const z = zuUebernehmen[i];
        const k = variantenSchluessel(z);
        if (!k || !z.holzart || z.scheitlaenge_cm === null || !z.trocknungsgrad) { fehlerZahl++; continue; }

        try {
          // --- Variante: upsert auf den Unique-Index -----------------------
          const { data: variante, error: vFehler } = await supabase
            .from('holz_sortiment')
            .upsert({
              owner_user_id: uid,
              holzart: z.holzart,
              scheitlaenge_cm: z.scheitlaenge_cm,
              trocknungsgrad: z.trocknungsgrad,
              restfeuchte_prozent: z.restfeuchte_prozent,
              notiz: z.notiz,
              aktiv: true,
            }, { onConflict: 'owner_user_id,holzart,scheitlaenge_cm,trocknungsgrad' })
            .select('id')
            .single();

          if (vFehler || !variante) throw vFehler ?? new Error('Variante nicht angelegt');

          const bekannt = abgleich.get(k);
          if (!bekannt?.variante) varianten++;

          // --- Preise ------------------------------------------------------
          for (const p of z.preise) {
            const alt = bekannt?.vorhandene.get(p.einheit);

            if (alt && !ueberschreiben) { uebersprungen++; continue; }

            const { error: pFehler } = await supabase.from('holz_preise').upsert({
              owner_user_id: uid,
              sortiment_id: variante.id as string,
              einheit: p.einheit,
              preis_netto: p.preis_netto,
              steuersatz_prozent: z.steuersatz_prozent,
              aktiv: true,
            }, { onConflict: 'owner_user_id,sortiment_id,einheit' });

            if (pFehler) { fehlerZahl++; continue; }
            if (alt) preiseErsetzt++; else preiseNeu++;
          }
        } catch {
          fehlerZahl++;
        }

        setFortschritt(i + 1);
      }

      setErgebnis({ varianten, preiseNeu, preiseErsetzt, uebersprungen, fehler: fehlerZahl });
      setSchritt(4);
    } catch (e: unknown) {
      setFehler('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSchreibt(false); }
  }

  function neuAnfangen() {
    setSchritt(1); setCsv(null); setBefund(null); setErgebnis(null);
    setDateiname(''); setZuordnung([]); setUeberschreiben(false); setFehler(null);
  }

  // ----------------------------------------------------------------------
  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Brennholz</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Preisliste importieren</h1>
          <p style={styles.sub}>
            Eine Zeile ist eine verkaufbare Variante mit ihren Preisen. Aus Excel, aus Lexware,
            aus einer alten Liste — Umlaute, Komma-Zahlen und Semikolon versteht ARGONAUT selbst.
          </p>
        </div>
        <a href="/dashboard/holz" style={styles.ghostBtn}>← Sortiment</a>
      </div>

      <div style={styles.schritte}>
        {(['Datei', 'Spalten zuordnen', 'Prüfen', 'Fertig'] as const).map((label, i) => (
          <div key={label} style={{ ...styles.schrittBox, ...(schritt === i + 1 ? styles.schrittAktiv : {}) }}>
            <span style={{ color: schritt > i + 1 ? C.green : schritt === i + 1 ? C.gold : C.textDim }}>
              {schritt > i + 1 ? '✓' : i + 1}
            </span>
            <span style={{ color: schritt >= i + 1 ? C.text : C.textDim }}>{label}</span>
          </div>
        ))}
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* ============ 1 · DATEI ============ */}
      {schritt === 1 && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>1 · Datei wählen</h2>
          <DateiImport onDatei={dateiGewaehlt} endungen={['csv', 'txt']} dunkel
            hinweis="CSV – aus Excel gespeichert, mit Semikolon und Komma-Zahlen"
            style={{ marginTop: 8 }} />

          <div style={styles.infoBox}>
            <strong>So sieht eine gute Datei aus</strong>
            <div style={styles.codeBlock}>
              Holzart;Länge;Trocknung;Restfeuchte;€/SRM;€/RM;€/FM;USt<br />
              Buche;33 cm;lufttrocken;18;95,00;136,00;238,00;7<br />
              Eiche;25 cm;kammergetrocknet;12;140,50;;;7
            </div>
            <span style={{ color: C.textDim }}>
              Die Spaltenüberschriften dürfen anders heißen — sie werden im nächsten Schritt zugeordnet.
              Leere Preisfelder werden übersprungen, nicht als 0 € gelesen.
            </span>
          </div>
        </div>
      )}

      {/* ============ 2 · ZUORDNEN ============ */}
      {schritt === 2 && csv && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>2 · Spalten zuordnen</h2>
          <div style={{ fontSize: 'clamp(12.5px, 1.13vw, 18px)', color: C.textDim, marginBottom: 14 }}>
            <strong>{dateiname}</strong> · {csv.zeilen.length} Zeilen · Kodierung {csv.kodierung.kodierung} ·
            Trennzeichen „{csv.trennzeichen === '\t' ? 'Tabulator' : csv.trennzeichen}"
          </div>

          {csv.hinweise.length > 0 && (
            <div style={styles.warnBox}>
              {csv.hinweise.map((h, i) => <div key={i}>⚠ {h}</div>)}
            </div>
          )}

          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={styles.tabelle}>
              <thead>
                <tr>
                  <th style={styles.th}>Spalte</th>
                  <th style={styles.th}>Beispiel</th>
                  <th style={{ ...styles.th, width: 200 }}>Wird zu</th>
                </tr>
              </thead>
              <tbody>
                {csv.kopfzeile.map((kopf, i) => (
                  <tr key={i}>
                    <td style={styles.td}><strong>{kopf || `Spalte ${i + 1}`}</strong></td>
                    <td style={{ ...styles.td, color: C.textDim }}>{csv.zeilen[0]?.[i] || '—'}</td>
                    <td style={styles.td}>
                      <select style={styles.select} value={zuordnung[i] ?? 'ignorieren'}
                        onChange={(e) => setZuordnung((z) => z.map((v, j) => (j === i ? (e.target.value as SortimentZielFeld) : v)))}>
                        {ZIELE.map((z) => <option key={z.wert} value={z.wert}>{z.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.aktionen}>
            <button onClick={neuAnfangen} style={styles.ghostBtn}>Andere Datei</button>
            <button onClick={pruefen} disabled={laden} style={{ ...styles.goldBtn, opacity: laden ? 0.6 : 1 }}>
              {laden ? 'Prüft …' : 'Weiter zur Prüfung →'}
            </button>
          </div>
        </div>
      )}

      {/* ============ 3 · PRÜFEN ============ */}
      {schritt === 3 && befund && (
        <>
          <div style={styles.zahlenGrid}>
            <Zahl label="Zeilen" wert={befund.anzahl.gesamt} farbe={C.cyan} />
            <Zahl label="Übernehmbar" wert={befund.anzahl.gut} farbe={C.green} />
            <Zahl label="Doppelt in der Datei" wert={befund.anzahl.doppelt} farbe={befund.anzahl.doppelt ? C.warn : C.textDim} />
            <Zahl label="Unbrauchbar" wert={befund.anzahl.fehler} farbe={befund.anzahl.fehler ? C.danger : C.textDim} />
          </div>

          {befund.hinweise.length > 0 && (
            <div style={styles.warnBox}>
              {befund.hinweise.map((h, i) => <div key={i}>⚠ {h}</div>)}
            </div>
          )}

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>3 · Prüfen</h2>

            <label style={styles.schalterZeile}>
              <input type="checkbox" checked={ueberschreiben} onChange={(e) => setUeberschreiben(e.target.checked)} />
              <span>
                <strong>Vorhandene Preise überschreiben</strong>
                <br />
                <span style={{ color: C.textDim, fontSize: 'clamp(12.5px, 1.13vw, 18px)' }}>
                  Standardmäßig aus. Preise, die du von Hand gepflegt hast, bleiben unangetastet —
                  nur fehlende werden ergänzt.
                </span>
              </span>
            </label>

            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table style={styles.tabelle}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 44 }}>#</th>
                    <th style={styles.th}>Variante</th>
                    <th style={styles.th}>Preise</th>
                    <th style={{ ...styles.th, width: 150 }}>Bestand</th>
                    <th style={{ ...styles.th, width: 90, textAlign: 'center' }}>Übernehmen</th>
                  </tr>
                </thead>
                <tbody>
                  {befund.zeilen.map((z) => (
                    <ZeilenReihe key={z.nr} z={z} abgleich={abgleich} ueberschreiben={ueberschreiben}
                      onToggle={() => zeileUmschalten(z.nr)} />
                  ))}
                </tbody>
              </table>
            </div>

            <div style={styles.summeZeile}>
              <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                {vorschau.variantenNeu} Variante(n) neu ·{' '}
                {vorschau.preiseNeu} Preis(e) neu
                {ueberschreiben
                  ? ` · ${vorschau.preiseErsetzt} überschrieben`
                  : ` · ${vorschau.preiseBehalten} unverändert`}
              </span>
              <span style={{ color: C.gold, fontWeight: 700 }}>{zuUebernehmen.length} Zeilen</span>
            </div>

            {schreibt && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 'clamp(12.5px, 1.13vw, 18px)', color: C.textDim, marginBottom: 6 }}>
                  {fortschritt} von {zuUebernehmen.length} …
                </div>
                <div style={styles.balkenSpur}>
                  <div style={{ ...styles.balken, width: `${(fortschritt / Math.max(1, zuUebernehmen.length)) * 100}%` }} />
                </div>
              </div>
            )}

            <div style={styles.aktionen}>
              <button onClick={() => setSchritt(2)} disabled={schreibt} style={styles.ghostBtn}>← Zurück</button>
              <button onClick={freigeben} disabled={schreibt || zuUebernehmen.length === 0}
                style={{ ...styles.goldBtn, opacity: schreibt || zuUebernehmen.length === 0 ? 0.5 : 1 }}>
                {schreibt ? 'Schreibt …' : '✓ Übernehmen'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ============ 4 · FERTIG ============ */}
      {schritt === 4 && ergebnis && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>4 · Fertig</h2>
          <div style={styles.zahlenGrid}>
            <Zahl label="Varianten neu" wert={ergebnis.varianten} farbe={C.green} />
            <Zahl label="Preise neu" wert={ergebnis.preiseNeu} farbe={C.green} />
            <Zahl label="Preise ersetzt" wert={ergebnis.preiseErsetzt} farbe={ergebnis.preiseErsetzt ? C.warn : C.textDim} />
            <Zahl label="Unverändert" wert={ergebnis.uebersprungen} farbe={C.textDim} />
            <Zahl label="Fehler" wert={ergebnis.fehler} farbe={ergebnis.fehler ? C.danger : C.textDim} />
          </div>

          <div style={styles.infoBox}>
            <strong>Nächster Schritt</strong><br />
            Prüf die Preise im Sortiment — besonders die abgeleiteten Vorschläge für RM und FM,
            falls du nur SRM-Preise importiert hast. Danach kann die Preisauskunft rechnen.
          </div>

          <div style={styles.aktionen}>
            <button onClick={neuAnfangen} style={styles.ghostBtn}>Weitere Datei</button>
            <a href="/dashboard/holz" style={styles.goldBtn}>Zum Sortiment →</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function ZeilenReihe({
  z, abgleich, ueberschreiben, onToggle,
}: {
  z: SortimentZeile;
  abgleich: Map<string, Abgleich>;
  ueberschreiben: boolean;
  onToggle: () => void;
}) {
  const kaputt = z.fehler.length > 0;
  const k = variantenSchluessel(z);
  const a = k ? abgleich.get(k) : undefined;

  const name = z.holzart && z.scheitlaenge_cm !== null && z.trocknungsgrad
    ? `${holzartName(z.holzart)} · ${z.scheitlaenge_cm} cm · ${trocknungsgradName(z.trocknungsgrad).toLowerCase()}`
    : '—';

  return (
    <tr style={{ opacity: kaputt || z.doppeltZu !== null ? 0.55 : 1 }}>
      <td style={{ ...styles.td, color: C.textDim }}>{z.nr}</td>
      <td style={styles.td}>
        <div style={{ fontWeight: 600 }}>{name}</div>
        {z.restfeuchte_prozent !== null && (
          <div style={{ fontSize: 'clamp(11.5px, 1vw, 16px)', color: C.textDim }}>{formatZahl(z.restfeuchte_prozent, 1)} % Restfeuchte</div>
        )}
        {z.fehler.map((f, i) => <div key={i} style={{ fontSize: 'clamp(11.5px, 1vw, 16px)', color: C.danger }}>✕ {f}</div>)}
        {z.hinweise.map((h, i) => <div key={i} style={{ fontSize: 'clamp(11.5px, 1vw, 16px)', color: C.textDim }}>· {h}</div>)}
      </td>
      <td style={styles.td}>
        {z.preise.length === 0 ? <span style={{ color: C.textDim }}>—</span> : z.preise.map((p) => {
          const alt = a?.vorhandene.get(p.einheit);
          const ersetzt = alt && ueberschreiben;
          return (
            <div key={p.einheit} style={{ fontSize: 'clamp(12.5px, 1.13vw, 18px)' }}>
              <strong>{einheitKurz(p.einheit)}</strong> {eur(p.preis_netto)}
              {alt && (
                <span style={{ color: ersetzt ? C.warn : C.textDim, marginLeft: 6 }}>
                  {ersetzt ? `ersetzt ${eur(alt.preis_netto)}` : `(bleibt ${eur(alt.preis_netto)})`}
                </span>
              )}
            </div>
          );
        })}
      </td>
      <td style={{ ...styles.td, fontSize: 'clamp(12.5px, 1.13vw, 18px)', color: C.textDim }}>
        {z.doppeltZu !== null
          ? `= Zeile ${z.doppeltZu}`
          : a?.variante ? 'Variante existiert' : kaputt ? '—' : 'neu'}
      </td>
      <td style={{ ...styles.td, textAlign: 'center' }}>
        <input type="checkbox" checked={z.uebernehmen} disabled={kaputt} onChange={onToggle} />
      </td>
    </tr>
  );
}

function Zahl({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return (
    <div style={styles.zahlBox}>
      <div style={styles.zahlLabel}>{label}</div>
      <div style={{ ...styles.zahlWert, color: farbe }}>{wert}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 640, lineHeight: 1.5 },

  schritte: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  schrittBox: { display: 'flex', alignItems: 'center', gap: 8, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' },
  schrittAktiv: { borderColor: 'rgba(201,168,76,0.4)' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 18 },
  cardTitle: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 700, margin: '0 0 12px', color: C.text, textTransform: 'uppercase', letterSpacing: 1 },

  zahlenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 },
  zahlBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  zahlLabel: { fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  zahlWert: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(22px, 1.94vw, 31px)', fontWeight: 800 },

  tabelle: { width: '100%', borderCollapse: 'collapse', minWidth: 700 },
  th: { textAlign: 'left', padding: '7px 8px', fontSize: 'clamp(10.5px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '8px', fontSize: 'clamp(13px, 1.13vw, 18px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },

  select: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 'clamp(12.5px, 1.13vw, 18px)', fontFamily: 'inherit' },
  schalterZeile: { display: 'flex', alignItems: 'flex-start', gap: 10, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', fontSize: 'clamp(13.5px, 1.19vw, 19px)', lineHeight: 1.5 },

  summeZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 'clamp(14px, 1.25vw, 20px)' },
  balkenSpur: { height: 8, background: C.navy, borderRadius: 999, overflow: 'hidden', border: `1px solid ${C.border}` },
  balken: { height: '100%', background: C.green, borderRadius: 999, transition: 'width 0.2s ease' },

  aktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
  goldBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },

  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  infoBox: { marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,255,0.07)', border: `1px solid rgba(0,229,255,0.22)`, borderRadius: 10, fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.text, lineHeight: 1.6 },
  warnBox: { marginTop: 12, marginBottom: 12, padding: '12px 14px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.text, lineHeight: 1.6 },
  codeBlock: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 'clamp(11.5px, 1vw, 16px)', background: C.navy, borderRadius: 8, padding: '10px 12px', margin: '10px 0', color: C.cyan, lineHeight: 1.7, overflowX: 'auto' },
};
