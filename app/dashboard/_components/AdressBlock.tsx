'use client';

// ============================================================
// ARGONAUT OS · Block 2 · Welle 1 · B1-4
// Adressblock für Privatkunden (kontakte) UND Firmenkunden (firmen).
//
// SELBSTSTÄNDIG: bekommt nur `art` und `id`. Lädt, speichert und verortet
// allein. Die einbindende Seite muss nichts wissen und nichts anfassen —
// zwei Zeilen genügen:
//     import AdressBlock from '../../_components/AdressBlock';
//     <AdressBlock art="kontakt" id={kontakt.id} />
//
// `nurVerorten` — für Seiten, die ihre Adressfelder SCHON HABEN (z. B. das
// Firmen-Detail). Dann zeigt der Block nur Status, Verorten und Handeingabe.
// Zwei Formulare für dieselbe Straße wären ein Rezept für verlorene Änderungen.
//     <AdressBlock art="firma" id={firma.id} nurVerorten />
//
// BRANCHENNEUTRAL. Kein Wort über Brennholz. Dieselbe Komponente trägt später
// die KFZ-Werkstatt (Hol- und Bringservice) und den Aufmaß-Termin.
//
// ⚠️ DER WÄCHTER:
//   Ändert sich die Anschrift, zeigen die alten Koordinaten auf das alte Haus.
//   Ein grünes "verortet" wäre dann eine Lüge, und die Anfahrt würde still
//   falsch gerechnet. `verortungVeraltet()` erkennt das an der Spalte
//   `geocode_adresse` — und zwar auch dann, wenn die Adresse ANDERSWO
//   geändert wurde (Firmen-Formular, CSV-Import, direkt in der DB).
//
// Pfad: app/dashboard/_components/AdressBlock.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ausKontakt, ausFirma, pruefeEmpfaenger, adresseEinzeilig, hatKoordinaten,
  verortungVeraltet, adresseVollstaendig,
  type KontaktQuelle, type FirmaQuelle, type Empfaenger,
} from './empfaengerLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

/** Grobe Umhüllende Deutschlands — nur für einen Plausibilitäts-Hinweis. */
const DE = { latMin: 47.2, latMax: 55.1, lonMin: 5.8, lonMax: 15.1 };

type Art = 'kontakt' | 'firma';

const TABELLE: Record<Art, string> = { kontakt: 'kontakte', firma: 'firmen' };
const FELDER: Record<Art, string> = {
  kontakt: 'id, vorname, nachname, firma, firma_id, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse',
  firma: 'id, name, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse',
};

type Form = { strasse: string; plz: string; ort: string };

/** Derselbe Text, den auch /api/geocode an den Kartendienst schickt. */
function geocodeSuchtextLokal(e: Empfaenger): string | null {
  if (!e.plz && !e.ort) return null;
  const ortZeile = [e.plz, e.ort].filter(Boolean).join(' ');
  return [e.strasse, ortZeile, e.land].filter(Boolean).join(', ');
}

function datumHuebsch(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('de-DE') : '—';
}

function statusText(s: string | null | undefined): string {
  if (s === 'ok') return '✓ verortet';
  if (s === 'manuell') return '✓ von Hand gesetzt';
  if (s === 'ungenau') return '⚠ ungenau verortet';
  if (s === 'fehlgeschlagen') return '✕ nicht gefunden';
  return '· nicht verortet';
}

function statusFarbe(s: string | null | undefined): string {
  if (s === 'ok' || s === 'manuell') return C.green;
  if (s === 'ungenau' || s === 'fehlgeschlagen') return C.warn;
  return C.textDim;
}

export default function AdressBlock({
  art,
  id,
  nurVerorten = false,
}: { art: Art; id: string; nurVerorten?: boolean }) {
  const [empf, setEmpf] = useState<Empfaenger | null>(null);
  const [form, setForm] = useState<Form>({ strasse: '', plz: '', ort: '' });
  const [laden, setLaden] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  const [manuellAuf, setManuellAuf] = useState(false);
  const [latEin, setLatEin] = useState('');
  const [lonEin, setLonEin] = useState('');

  function melde(t: string) {
    setErfolg(t); setFehler(null);
    setTimeout(() => setErfolg(null), 3500);
  }

  const alles = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data, error } = await supabase.from(TABELLE[art]).select(FELDER[art]).eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) { setFehler('Datensatz nicht gefunden.'); return; }

      const e = art === 'kontakt'
        ? ausKontakt(data as unknown as KontaktQuelle)
        : ausFirma(data as unknown as FirmaQuelle);

      setEmpf(e);
      setForm({ strasse: e.strasse ?? '', plz: e.plz ?? '', ort: e.ort ?? '' });
      if (e.geoLat != null) setLatEin(String(e.geoLat));
      if (e.geoLon != null) setLonEin(String(e.geoLon));
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [art, id]);

  useEffect(() => { void alles(); }, [alles]);

  // --- Ungespeicherte Änderung im Formular? (nur bei vollem Block) ------
  const geaendert =
    !nurVerorten && !!empf &&
    ((form.strasse.trim() || null) !== empf.strasse ||
      (form.plz.trim() || null) !== empf.plz ||
      (form.ort.trim() || null) !== empf.ort);

  /**
   * Zeigen die GESPEICHERTEN Koordinaten noch auf die GESPEICHERTE Anschrift?
   * Kommt aus empfaengerLogik und funktioniert überall — auch wenn die Adresse
   * im Firmen-Formular oder per Import geändert wurde.
   */
  const verortungAlt = !!empf && verortungVeraltet(empf);

  /** Beim Speichern einer geänderten Anschrift müssen alte Koordinaten weg. */
  const koordinatenWerdenEntfernt = geaendert && !!empf && hatKoordinaten(empf);

  // --- Speichern --------------------------------------------------------
  async function speichern() {
    if (!empf) return;
    if (!form.strasse.trim() || !form.plz.trim() || !form.ort.trim()) {
      setFehler('Bitte Straße, PLZ und Ort angeben.');
      return;
    }

    if (koordinatenWerdenEntfernt) {
      if (!window.confirm(
        'Die Anschrift hat sich geändert.\n\n' +
        'Die bisherigen Koordinaten gehören zur alten Adresse und werden entfernt. ' +
        'Danach bitte neu verorten.\n\nSpeichern?'
      )) return;
    } else if (!window.confirm(`Anschrift speichern?\n\n${form.strasse}\n${form.plz} ${form.ort}`)) {
      return;
    }

    setLaeuft(true); setFehler(null);
    try {
      const payload: Record<string, unknown> = {
        strasse: form.strasse.trim(),
        plz: form.plz.trim(),
        ort: form.ort.trim(),
        land: empf.land || 'DE',
      };
      // Falsche Koordinaten sind schlimmer als keine.
      if (koordinatenWerdenEntfernt) {
        payload.geo_lat = null;
        payload.geo_lon = null;
        payload.geocode_am = null;
        payload.geocode_status = null;
        payload.geocode_quelle = null;
        payload.geocode_adresse = null;
      }

      const { error } = await supabase.from(TABELLE[art]).update(payload).eq('id', id);
      if (error) throw error;

      setLabel(null);
      await alles();
      melde(koordinatenWerdenEntfernt ? 'Gespeichert. Bitte jetzt neu verorten.' : 'Anschrift gespeichert.');
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaeuft(false); }
  }

  // --- Verorten ---------------------------------------------------------
  async function verorten() {
    if (geaendert) { setFehler('Bitte die geänderte Anschrift zuerst speichern.'); return; }
    if (empf && !adresseVollstaendig(empf)) {
      setFehler('Die gespeicherte Anschrift ist unvollständig — bitte zuerst Straße, PLZ und Ort ergänzen.');
      return;
    }
    setLaeuft(true); setFehler(null); setLabel(null);
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ art, id }),
      });
      const daten = await res.json();

      if (!res.ok || !daten?.ok) {
        setFehler(daten?.error ?? 'Verortung fehlgeschlagen.');
        if (daten?.code === 'kein_schluessel') setManuellAuf(true);
        return;
      }
      setLabel(daten.label ?? null);
      await alles();
      melde(daten.genauigkeit === 'ungenau'
        ? 'Verortet — aber nur ungenau. Die Entfernung wird ein Näherungswert.'
        : 'Adresse exakt verortet.');
    } catch {
      setFehler('Verortung fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setLaeuft(false); }
  }

  // --- Koordinaten von Hand ---------------------------------------------
  async function koordinatenSpeichern() {
    const lat = Number(latEin.trim().replace(',', '.'));
    const lon = Number(lonEin.trim().replace(',', '.'));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setFehler('Bitte zwei gültige Zahlen eingeben, z. B. 48.49221 und 8.80264.');
      return;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setFehler('Breitengrad zwischen −90 und 90, Längengrad zwischen −180 und 180.');
      return;
    }

    const inDe = lat >= DE.latMin && lat <= DE.latMax && lon >= DE.lonMin && lon <= DE.lonMax;
    const getauschtWaereDe = lon >= DE.latMin && lon <= DE.latMax && lat >= DE.lonMin && lat <= DE.lonMax;

    if (!inDe) {
      const zusatz = getauschtWaereDe
        ? '\n\nSind Breiten- und Längengrad vertauscht? In Deutschland ist der Breitengrad die größere Zahl (ca. 47–55).'
        : '';
      if (!window.confirm(`Diese Koordinaten liegen außerhalb Deutschlands.${zusatz}\n\nTrotzdem speichern?`)) return;
    } else if (!window.confirm(`Koordinaten von Hand setzen?\n\n${lat} / ${lon}`)) {
      return;
    }

    setLaeuft(true); setFehler(null);
    try {
      // Auch von Hand gesetzte Koordinaten merken sich ihre Anschrift —
      // sonst schlaegt der Waechter beim naechsten Umzug nicht an.
      const { error } = await supabase.from(TABELLE[art]).update({
        geo_lat: lat, geo_lon: lon,
        geocode_am: new Date().toISOString(),
        geocode_status: 'manuell',
        geocode_quelle: 'manuell',
        geocode_adresse: empf ? geocodeSuchtextLokal(empf) : null,
      }).eq('id', id);
      if (error) throw error;
      setManuellAuf(false); setLabel(null);
      await alles();
      melde('Koordinaten übernommen.');
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaeuft(false); }
  }

  // ----------------------------------------------------------------------
  const pruefung = empf ? pruefeEmpfaenger(empf) : null;
  const verortet = !!empf && hatKoordinaten(empf);

  return (
    <div style={styles.card}>
      <div style={styles.kopf}>
        <span style={styles.titel}>📍 Anschrift & Anfahrt</span>
        {empf && (
          <span style={{ color: (verortungAlt || koordinatenWerdenEntfernt) ? C.warn : statusFarbe(empf.geocodeStatus), fontSize: 12.5 }}>
            {(verortungAlt || koordinatenWerdenEntfernt) ? '⚠ Adresse geändert' : statusText(empf.geocodeStatus)}
          </span>
        )}
      </div>
      <p style={styles.sub}>
        Grundlage für die Anfahrtsberechnung. Ohne Koordinaten kann keine Entfernung ermittelt werden.
      </p>

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : (
        <>
          {!nurVerorten ? (
            <div style={styles.grid}>
              <div>
                <label style={styles.lbl}>Straße und Hausnummer</label>
                <input style={styles.input} value={form.strasse} placeholder="z. B. Lindenweg 4"
                  onChange={(e) => setForm((f) => ({ ...f, strasse: e.target.value }))} />
              </div>
              <div>
                <label style={styles.lbl}>PLZ</label>
                <input style={styles.input} inputMode="numeric" value={form.plz} placeholder="72108"
                  onChange={(e) => setForm((f) => ({ ...f, plz: e.target.value }))} />
              </div>
              <div>
                <label style={styles.lbl}>Ort</label>
                <input style={styles.input} value={form.ort} placeholder="Rottenburg"
                  onChange={(e) => setForm((f) => ({ ...f, ort: e.target.value }))} />
              </div>
            </div>
          ) : (
            <div style={styles.hinweisBox}>
              Anschrift oben unter „Stammdaten bearbeiten" pflegen. Hier geht es nur um die Verortung.
            </div>
          )}

          {koordinatenWerdenEntfernt && (
            <div style={styles.warnBox}>
              ⚠ Die Anschrift wurde geändert. Die gespeicherten Koordinaten gehören noch zur alten Adresse.
              Beim Speichern werden sie entfernt — danach bitte neu verorten.
            </div>
          )}

          {verortungAlt && !koordinatenWerdenEntfernt && empf && (
            <div style={styles.warnBox}>
              ⚠ Die Anschrift wurde geändert, seit die Koordinaten ermittelt wurden.<br />
              Verortet wurde: <em>{empf.geocodeAdresse}</em><br />
              Heute gespeichert: <em>{adresseEinzeilig(empf)}</em><br />
              Bitte neu verorten — sonst wird die Anfahrt zur alten Adresse gerechnet.
            </div>
          )}

          {verortet && !koordinatenWerdenEntfernt && !verortungAlt && empf && (
            <div style={empf.geocodeStatus === 'ungenau' ? styles.warnBox : styles.infoBox}>
              <strong>{adresseEinzeilig(empf)}</strong><br />
              {empf.geoLat?.toFixed(5)} / {empf.geoLon?.toFixed(5)} · zuletzt {datumHuebsch(empf.geocodeAm)}
              {label && (<><br /><span style={{ color: C.textDim }}>Verstanden als: {label}</span></>)}
              {empf.geocodeStatus === 'ungenau' && (
                <><br />Nur ungefähr gefunden — die Entfernung wird ein Näherungswert.</>
              )}
            </div>
          )}

          {pruefung && pruefung.fehler.length > 0 && !geaendert && (
            <div style={styles.err}>{pruefung.fehler.map((f, i) => <div key={i}>{f}</div>)}</div>
          )}
          {pruefung && pruefung.hinweise.length > 0 && !verortet && (
            <div style={styles.hinweisBox}>
              {pruefung.hinweise.map((h, i) => <div key={i}>· {h}</div>)}
            </div>
          )}

          {manuellAuf && (
            <div style={styles.sektion}>
              <div style={{ ...styles.titel, fontSize: 13.5, marginBottom: 4 }}>Koordinaten von Hand</div>
              <p style={{ fontSize: 12.5, color: C.textDim, margin: '0 0 12px', lineHeight: 1.5 }}>
                Funktioniert ohne Kartendienst. Punkt in einer Online-Karte suchen, beide Zahlen ablesen.
                Der Breitengrad ist in Deutschland die größere Zahl (etwa 47 bis 55).
              </p>
              <div style={styles.grid}>
                <div>
                  <label style={styles.lbl}>Breitengrad</label>
                  <input style={styles.input} inputMode="decimal" placeholder="48.49221"
                    value={latEin} onChange={(e) => setLatEin(e.target.value)} />
                </div>
                <div>
                  <label style={styles.lbl}>Längengrad</label>
                  <input style={styles.input} inputMode="decimal" placeholder="8.80264"
                    value={lonEin} onChange={(e) => setLonEin(e.target.value)} />
                </div>
              </div>
              <div style={styles.aktionen}>
                <button onClick={() => setManuellAuf(false)} disabled={laeuft} style={styles.ghostBtn}>Abbrechen</button>
                <button onClick={koordinatenSpeichern} disabled={laeuft}
                  style={{ ...styles.goldBtn, opacity: laeuft ? 0.6 : 1 }}>Koordinaten übernehmen</button>
              </div>
            </div>
          )}

          {fehler && <div style={styles.err}>{fehler}</div>}
          {erfolg && <div style={styles.okBox}>{erfolg}</div>}

          <div style={styles.aktionen}>
            {!manuellAuf && (
              <button onClick={() => setManuellAuf(true)} disabled={laeuft}
                style={{ ...styles.ghostBtn, color: C.textDim, marginRight: 'auto' }}>
                ✎ Koordinaten von Hand
              </button>
            )}
            <button onClick={verorten} disabled={laeuft || geaendert}
              style={{ ...(nurVerorten ? styles.goldBtn : styles.ghostBtn), opacity: laeuft || geaendert ? 0.5 : 1 }}
              title={geaendert ? 'Erst die geänderte Anschrift speichern' : 'Adresse über den Kartendienst suchen'}>
              🌍 Verorten
            </button>
            {!nurVerorten && (
              <button onClick={speichern} disabled={laeuft || !geaendert}
                style={{ ...styles.goldBtn, opacity: laeuft || !geaendert ? 0.5 : 1 }}>
                {laeuft ? 'Speichert …' : 'Anschrift speichern'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 20 },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  titel: { fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: C.text },
  sub: { fontSize: 12.5, color: C.textDim, margin: '6px 0 16px', lineHeight: 1.55 },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  lbl: { display: 'block', fontSize: 11.5, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: "'DM Sans', sans-serif" },

  sektion: { marginTop: 16, padding: 14, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12 },
  aktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' },

  goldBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 800, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 14px', fontSize: 13.5, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' },

  hint: { color: C.textDim, fontSize: 13.5, padding: '12px 0' },
  hinweisBox: { color: C.textDim, fontSize: 12.5, marginTop: 12, lineHeight: 1.6 },
  err: { color: C.danger, fontSize: 13.5, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '11px 13px', marginTop: 14, lineHeight: 1.5 },
  okBox: { color: C.green, fontSize: 13.5, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '11px 13px', marginTop: 14 },
  infoBox: { marginTop: 14, padding: '11px 13px', background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
  warnBox: { marginTop: 14, padding: '11px 13px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
};
