'use client';

// ============================================================
// ARGONAUT OS · Block 1 · I-1c-3b · Kontakte importieren
//
// VIER SCHRITTE. VOR DER FREIGABE PASSIERT NICHTS.
//   1 Datei      -> Kodierung, Trennzeichen, Warnungen
//   2 Zuordnen   -> automatisch vorbelegt, jede Spalte umstellbar
//   3 Prüfen     -> Dubletten gegen Bestand UND innerhalb der Datei
//   4 Freigeben  -> erst hier wird geschrieben
//
// DIE SEITE RECHNET NICHTS SELBST.
//   csvLogik liest, importLogik entscheidet, dublettenLogik vergleicht.
//   Diese Datei zeigt an und schreibt. Mehr nicht.
//
// NICHTS IST VORANGEHAKT.
//   Auch ein Treffer mit 100 Punkten steht auf "überspringen". Ein Mensch
//   klickt, oder es passiert nichts. Zusammenführen ist ein eigener Schritt.
//
// Pfad: app/dashboard/crm/import/page.tsx
// ============================================================

import { useState, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import DateiImport from '../../_components/DateiImport';
import {
  leseCsv, type CsvBefund, type ZielFeld,
} from '../../_components/csvLogik';
import {
  pruefeImport, planeUebernahme, uebernahmeKlartext,
  statusText, statusFarbe, kandidatKurz,
  type ImportZeile, type ImportBefund, type ZeilenAktion,
} from '../../_components/importLogik';
import type { Kandidat } from '../../_components/dublettenLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const FARBE: Record<'gruen' | 'gelb' | 'rot' | 'grau', string> = {
  gruen: C.green, gelb: C.warn, rot: C.danger, grau: C.textDim,
};

const ZIELE: Array<{ wert: ZielFeld; label: string }> = [
  { wert: 'ignorieren', label: '— nicht übernehmen —' },
  { wert: 'vorname', label: 'Vorname' },
  { wert: 'nachname', label: 'Nachname' },
  { wert: 'name', label: 'Name (wird zerlegt)' },
  { wert: 'firmenname', label: 'Firma' },
  { wert: 'email', label: 'E-Mail' },
  { wert: 'telefon', label: 'Telefon' },
  { wert: 'strasse', label: 'Straße' },
  { wert: 'plz', label: 'PLZ' },
  { wert: 'ort', label: 'Ort' },
  { wert: 'land', label: 'Land' },
  { wert: 'notiz', label: 'Notiz' },
];

const AKTIONEN: Array<{ wert: ZeilenAktion; label: string }> = [
  { wert: 'anlegen', label: 'anlegen' },
  { wert: 'aktualisieren', label: 'aktualisieren' },
  { wert: 'ueberspringen', label: 'überspringen' },
];

/** Wie viele Zeilen auf einmal schreiben? Nicht 300 in einem Rutsch. */
const BLOCK = 50;

const K_FELDER =
  'id, vorname, nachname, firma, email, telefon, strasse, plz, ort, import_schluessel';

export default function KontaktImportPage() {
  const [schritt, setSchritt] = useState<1 | 2 | 3 | 4>(1);
  const [fehler, setFehler] = useState<string | null>(null);

  const [dateiname, setDateiname] = useState('');
  const [csv, setCsv] = useState<CsvBefund | null>(null);
  const [zuordnung, setZuordnung] = useState<ZielFeld[]>([]);
  const [idSpalte, setIdSpalte] = useState<number | null>(null);
  const [quelle, setQuelle] = useState('csv');

  const [bestand, setBestand] = useState<Kandidat[]>([]);
  const [befund, setBefund] = useState<ImportBefund | null>(null);
  const [laden, setLaden] = useState(false);

  const [schreibt, setSchreibt] = useState(false);
  const [fortschritt, setFortschritt] = useState(0);
  const [ergebnis, setErgebnis] = useState<{ angelegt: number; aktualisiert: number; fehlgeschlagen: number } | null>(null);

  // --- Schritt 1: Datei lesen -------------------------------------------
  const dateiGewaehlt = useCallback(async (datei: File) => {
    setFehler(null); setBefund(null); setErgebnis(null);
    try {
      const bytes = new Uint8Array(await datei.arrayBuffer());
      const b = leseCsv(bytes);
      if (b.fehler.length > 0) { setFehler(b.fehler.join(' ')); return; }

      setDateiname(datei.name);
      setCsv(b);
      setZuordnung([...b.zuordnung]);
      setIdSpalte(null);
      setSchritt(2);
    } catch {
      setFehler('Die Datei konnte nicht gelesen werden.');
    }
  }, []);

  // --- Schritt 3: prüfen -------------------------------------------------
  async function pruefen() {
    if (!csv) return;
    setLaden(true); setFehler(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;

      const { data, error } = await supabase.from('kontakte').select(K_FELDER);
      if (error) throw error;

      const liste = ((data as unknown as Array<Record<string, string | null>>) ?? []).map((k) => ({
        id: k.id as string,
        vorname: k.vorname, nachname: k.nachname, firmenname: k.firma,
        email: k.email, telefon: k.telefon, strasse: k.strasse, plz: k.plz, ort: k.ort,
        import_schluessel: k.import_schluessel,
      })) as Kandidat[];

      setBestand(liste);
      setBefund(pruefeImport(csv.zeilen, zuordnung, liste, { quelle, idSpalte }));
      setSchritt(3);
    } catch (e: unknown) {
      setFehler('Prüfung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }

  function aktionAendern(nr: number, aktion: ZeilenAktion) {
    setBefund((b) => (b ? { ...b, zeilen: b.zeilen.map((z) => (z.nr === nr ? { ...z, aktion } : z)) } : b));
  }

  /** Alle Dubletten auf einmal anlegen — bewusst umständlich zu erreichen. */
  function alleDublettenAnlegen() {
    if (!window.confirm(
      'Alle möglichen Doppelten trotzdem anlegen?\n\n' +
      'Dabei entstehen mit hoher Wahrscheinlichkeit doppelte Kundendatensätze. ' +
      'Nur sinnvoll, wenn du sicher bist, dass es verschiedene Personen sind.'
    )) return;
    setBefund((b) => (b ? {
      ...b,
      zeilen: b.zeilen.map((z) => (z.status === 'dublette' ? { ...z, aktion: 'anlegen' as ZeilenAktion } : z)),
    } : b));
  }

  const plan = useMemo(() => (befund ? planeUebernahme(befund.zeilen) : null), [befund]);

  // --- Schritt 4: schreiben ----------------------------------------------
  async function freigeben() {
    if (!plan || !csv) return;
    const zusammenfassung = uebernahmeKlartext(plan);

    if (!window.confirm(
      `Import jetzt ausführen?\n\n${zusammenfassung}\n\n` +
      'Angelegte Datensätze bleiben bestehen. Ein Rückgängigmachen ist nicht vorgesehen.'
    )) return;

    setSchreibt(true); setFehler(null); setFortschritt(0);
    let angelegt = 0, aktualisiert = 0, fehlgeschlagen = 0;

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); return; }

      // Lauf protokollieren, bevor geschrieben wird.
      const { data: lauf } = await supabase.from('import_laeufe').insert({
        owner_user_id: uid, quelle, ziel: 'kontakte', dateiname,
        zeilen_gesamt: csv.zeilen.length,
        status: 'geprueft',
        spalten_zuordnung: { kopfzeile: csv.kopfzeile, zuordnung, idSpalte },
      }).select('id').single();

      const laufId = lauf?.id as string | undefined;

      const alle = [...plan.anlegen, ...plan.aktualisieren];
      for (let i = 0; i < alle.length; i += BLOCK) {
        const teil = alle.slice(i, i + BLOCK);

        for (const z of teil) {
          const nutzlast: Record<string, unknown> = {
            owner_user_id: uid,
            vorname: z.daten.vorname ?? null,
            nachname: z.daten.nachname ?? null,
            firma: z.daten.firmenname ?? null,
            email: z.daten.email ?? null,
            telefon: z.daten.telefon ?? null,
            strasse: z.daten.strasse ?? null,
            plz: z.daten.plz ?? null,
            ort: z.daten.ort ?? null,
            import_schluessel: z.importSchluessel,
          };
          if (z.daten.notiz) nutzlast.notizen = z.daten.notiz;

          try {
            if (z.aktion === 'aktualisieren' && z.treffer?.kandidat.id) {
              const { error } = await supabase.from('kontakte').update(nutzlast).eq('id', z.treffer.kandidat.id);
              if (error) throw error;
              aktualisiert++;
            } else {
              const { error } = await supabase.from('kontakte').insert(nutzlast);
              if (error) throw error;
              angelegt++;
            }
          } catch {
            // Eine kaputte Zeile darf die anderen nicht aufhalten.
            fehlgeschlagen++;
          }
        }

        setFortschritt(Math.min(alle.length, i + teil.length));
      }

      if (laufId) {
        await supabase.from('import_laeufe').update({
          status: 'uebernommen',
          zeilen_uebernommen: angelegt + aktualisiert,
          uebernommen_am: new Date().toISOString(),
        }).eq('id', laufId);
      }

      setErgebnis({ angelegt, aktualisiert, fehlgeschlagen });
      setSchritt(4);
    } catch (e: unknown) {
      setFehler('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSchreibt(false); }
  }

  function neuAnfangen() {
    setSchritt(1); setCsv(null); setBefund(null); setErgebnis(null);
    setDateiname(''); setZuordnung([]); setIdSpalte(null); setFehler(null);
  }

  // ----------------------------------------------------------------------
  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · CRM</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Kontakte importieren</h1>
          <p style={styles.sub}>
            CSV aus Lexware, Excel, HubSpot oder einem anderen System. Doppelte werden erkannt,
            bevor etwas gespeichert wird. Vor der Freigabe passiert nichts.
          </p>
        </div>
        <a href="/dashboard/crm" style={styles.ghostBtn}>← Zum CRM</a>
      </div>

      {/* Schrittanzeige */}
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
          <DateiImport
            onDatei={dateiGewaehlt}
            endungen={['csv', 'txt']}
            dunkel
            hinweis="CSV – auch aus Lexware oder Excel, mit Umlauten und Semikolon"
            style={{ marginTop: 8 }}
          />
          <div style={styles.infoBox}>
            <strong>Was hier passiert</strong><br />
            Die Datei wird <strong>im Browser</strong> gelesen, nichts wird hochgeladen und nichts
            gespeichert. Kodierung und Trennzeichen erkennt ARGONAUT selbst — auch Windows-1252
            aus älteren Programmen, bei dem Umlaute sonst zerbrechen.
          </div>
        </div>
      )}

      {/* ============ 2 · ZUORDNEN ============ */}
      {schritt === 2 && csv && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>2 · Spalten zuordnen</h2>
          <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 14, lineHeight: 1.55 }}>
            <strong>{dateiname}</strong> · {csv.zeilen.length.toLocaleString('de-DE')} Zeilen ·
            Kodierung {csv.kodierung.kodierung} ·
            Trennzeichen „{csv.trennzeichen === '\t' ? 'Tabulator' : csv.trennzeichen}"
          </div>

          {csv.hinweise.length > 0 && (
            <div style={styles.warnBox}>
              {csv.hinweise.map((h, i) => <div key={i} style={{ marginBottom: 4 }}>⚠ {h}</div>)}
            </div>
          )}

          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table style={styles.tabelle}>
              <thead>
                <tr>
                  <th style={styles.th}>Spalte in der Datei</th>
                  <th style={styles.th}>Beispielwert</th>
                  <th style={{ ...styles.th, width: 210 }}>Wird zu</th>
                  <th style={{ ...styles.th, width: 90, textAlign: 'center' }}>ID</th>
                </tr>
              </thead>
              <tbody>
                {csv.kopfzeile.map((kopf, i) => (
                  <tr key={i}>
                    <td style={styles.td}><strong>{kopf || `Spalte ${i + 1}`}</strong></td>
                    <td style={{ ...styles.td, color: C.textDim, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {csv.zeilen[0]?.[i] || '—'}
                    </td>
                    <td style={styles.td}>
                      <select style={styles.select} value={zuordnung[i] ?? 'ignorieren'}
                        onChange={(e) => setZuordnung((z) => z.map((v, j) => (j === i ? (e.target.value as ZielFeld) : v)))}>
                        {ZIELE.map((z) => <option key={z.wert} value={z.wert}>{z.label}</option>)}
                      </select>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <input type="radio" name="idspalte" checked={idSpalte === i}
                        onChange={() => setIdSpalte(idSpalte === i ? null : i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.infoBox}>
            <strong>Die ID-Spalte</strong> ist die Kundennummer aus dem Herkunftssystem.
            Wählst du sie, kannst du dieselbe Datei später erneut importieren — es entstehen
            dann Aktualisierungen statt Doppelter. Ohne ID-Spalte geht das nicht.
            <div style={{ marginTop: 10 }}>
              <label style={styles.lbl}>Herkunft (für den Schlüssel)</label>
              <input style={{ ...styles.input, maxWidth: 220 }} value={quelle}
                onChange={(e) => setQuelle(e.target.value.trim() || 'csv')} placeholder="csv" />
            </div>
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
      {schritt === 3 && befund && plan && (
        <>
          <div style={styles.zahlenGrid}>
            <Zahl label="Zeilen" wert={befund.anzahl.gesamt} farbe={C.cyan} />
            <Zahl label="Neu" wert={befund.anzahl.neu} farbe={C.green} />
            <Zahl label="Mögliche Doppelte" wert={befund.anzahl.dubletten} farbe={befund.anzahl.dubletten ? C.warn : C.textDim} />
            <Zahl label="Doppelt in der Datei" wert={befund.anzahl.internDoppelt} farbe={befund.anzahl.internDoppelt ? C.warn : C.textDim} />
            <Zahl label="Aktualisieren" wert={befund.anzahl.aktualisieren} farbe={C.green} />
            <Zahl label="Unbrauchbar" wert={befund.anzahl.fehler} farbe={befund.anzahl.fehler ? C.danger : C.textDim} />
          </div>

          {befund.hinweise.length > 0 && (
            <div style={styles.warnBox}>
              {befund.hinweise.map((h, i) => <div key={i} style={{ marginBottom: 4 }}>⚠ {h}</div>)}
            </div>
          )}

          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ ...styles.cardTitle, margin: 0 }}>3 · Prüfen</h2>
              {befund.anzahl.dubletten > 0 && (
                <button onClick={alleDublettenAnlegen} style={styles.miniBtn}>
                  Alle Doppelten trotzdem anlegen
                </button>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: C.textDim, margin: '8px 0 14px', lineHeight: 1.55 }}>
              Doppelte sind <strong>nicht</strong> vorausgewählt. Das Zusammenführen zweier
              Datensätze ist ein eigener Schritt — hier wird nur angelegt, aktualisiert oder übersprungen.
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={styles.tabelle}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 44 }}>#</th>
                    <th style={styles.th}>Datensatz</th>
                    <th style={{ ...styles.th, width: 170 }}>Status</th>
                    <th style={styles.th}>Treffer</th>
                    <th style={{ ...styles.th, width: 150 }}>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {befund.zeilen.map((z) => <ZeilenReihe key={z.nr} z={z} onAktion={aktionAendern} />)}
                </tbody>
              </table>
            </div>

            <div style={styles.summeZeile}>
              <span style={{ color: C.textDim, fontSize: 13 }}>{uebernahmeKlartext(plan)}</span>
              <span style={{ color: C.gold, fontWeight: 700 }}>
                {plan.anlegen.length + plan.aktualisieren.length} Datensätze werden geschrieben
              </span>
            </div>

            {schreibt && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 6 }}>
                  {fortschritt} von {plan.anlegen.length + plan.aktualisieren.length} …
                </div>
                <div style={styles.balkenSpur}>
                  <div style={{ ...styles.balken, width: `${(fortschritt / Math.max(1, plan.anlegen.length + plan.aktualisieren.length)) * 100}%` }} />
                </div>
              </div>
            )}

            <div style={styles.aktionen}>
              <button onClick={() => setSchritt(2)} disabled={schreibt} style={styles.ghostBtn}>← Zurück</button>
              <button onClick={freigeben} disabled={schreibt || plan.anlegen.length + plan.aktualisieren.length === 0}
                style={{ ...styles.goldBtn, opacity: schreibt || plan.anlegen.length + plan.aktualisieren.length === 0 ? 0.5 : 1 }}>
                {schreibt ? 'Schreibt …' : '✓ Import freigeben'}
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
            <Zahl label="Angelegt" wert={ergebnis.angelegt} farbe={C.green} />
            <Zahl label="Aktualisiert" wert={ergebnis.aktualisiert} farbe={C.green} />
            <Zahl label="Fehlgeschlagen" wert={ergebnis.fehlgeschlagen} farbe={ergebnis.fehlgeschlagen ? C.danger : C.textDim} />
          </div>

          {ergebnis.fehlgeschlagen > 0 && (
            <div style={styles.warnBox}>
              ⚠ {ergebnis.fehlgeschlagen} Zeile(n) konnten nicht geschrieben werden. Die übrigen sind angelegt.
            </div>
          )}

          <div style={styles.infoBox}>
            <strong>Nächster Schritt</strong><br />
            Die importierten Kontakte haben noch keine Koordinaten. Ohne sie kann ARGONAUT keine
            Anfahrt berechnen. Öffne einen Kontakt und nutze <em>Verorten</em> — oder warte auf die
            Massen-Verortung, die als Nächstes gebaut wird.
          </div>

          <div style={styles.aktionen}>
            <button onClick={neuAnfangen} style={styles.ghostBtn}>Weitere Datei importieren</button>
            <a href="/dashboard/crm" style={styles.goldBtn}>Zum CRM →</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function ZeilenReihe({ z, onAktion }: { z: ImportZeile; onAktion: (nr: number, a: ZeilenAktion) => void }) {
  const farbe = FARBE[statusFarbe(z.status)];
  const kaputt = z.status === 'fehler';

  return (
    <tr style={{ opacity: kaputt ? 0.55 : 1 }}>
      <td style={{ ...styles.td, color: C.textDim }}>{z.nr}</td>
      <td style={styles.td}>
        <div style={{ fontWeight: 600 }}>{kandidatKurz(z.daten)}</div>
        {z.fehler.map((f, i) => <div key={i} style={{ fontSize: 11.5, color: C.danger }}>✕ {f}</div>)}
        {z.hinweise.map((h, i) => <div key={i} style={{ fontSize: 11.5, color: C.textDim }}>· {h}</div>)}
      </td>
      <td style={{ ...styles.td, color: farbe, fontSize: 12.5 }}>{statusText(z.status)}</td>
      <td style={{ ...styles.td, fontSize: 12.5, color: C.textDim }}>
        {z.treffer
          ? <>
              <div>{kandidatKurz(z.treffer.kandidat)}</div>
              <div style={{ color: farbe }}>{z.treffer.vergleich.punkte} Punkte</div>
            </>
          : z.internDoppeltZu !== null ? `= Zeile ${z.internDoppeltZu}` : '—'}
      </td>
      <td style={styles.td}>
        <select style={styles.select} value={z.aktion} disabled={kaputt}
          onChange={(e) => onAktion(z.nr, e.target.value as ZeilenAktion)}>
          {AKTIONEN.filter((a) => a.wert !== 'aktualisieren' || z.treffer !== null)
            .map((a) => <option key={a.wert} value={a.wert}>{a.label}</option>)}
        </select>
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
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 640, lineHeight: 1.5 },

  schritte: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  schrittBox: { display: 'flex', alignItems: 'center', gap: 8, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 13 },
  schrittAktiv: { borderColor: 'rgba(201,168,76,0.4)' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 18 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: C.text, textTransform: 'uppercase', letterSpacing: 1 },

  zahlenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 },
  zahlBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  zahlLabel: { fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  zahlWert: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  tabelle: { width: '100%', borderCollapse: 'collapse', minWidth: 700 },
  th: { textAlign: 'left', padding: '7px 8px', fontSize: 10.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '8px', fontSize: 13, borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },

  lbl: { display: 'block', fontSize: 11.5, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13.5, fontFamily: 'inherit' },
  select: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12.5, fontFamily: 'inherit' },

  summeZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 14 },
  balkenSpur: { height: 8, background: C.navy, borderRadius: 999, overflow: 'hidden', border: `1px solid ${C.border}` },
  balken: { height: '100%', background: C.green, borderRadius: 999, transition: 'width 0.2s ease' },

  aktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
  goldBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  miniBtn: { background: 'rgba(224,162,76,0.12)', color: C.warn, border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },

  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, lineHeight: 1.5 },
  infoBox: { marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,255,0.07)', border: `1px solid rgba(0,229,255,0.22)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
  warnBox: { marginTop: 12, marginBottom: 12, padding: '12px 14px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
};
