'use client';

// ============================================================
// ARGONAUT OS · Block 2 · Welle 1 · B1-3d
// Zwei Karten, die zusammengehören:
//   1. Betriebsstandort — der Startpunkt jeder Anfahrt
//   2. OpenRouteService-Schlüssel — je Betrieb, eigenes Kontingent
//
// Der Schlüssel wird EINMAL eingegeben und danach nie wieder angezeigt.
// Sichtbar bleibt nur ein Hinweis wie "eyJvcmc…4f3a" — genug zum Wiedererkennen,
// zu wenig zum Missbrauchen. Der echte Wert liegt in betriebs_geheimnisse,
// einer Tabelle ohne jede RLS-Policy: der Browser kommt gar nicht erst heran.
//
// Pfad: app/dashboard/einstellungen/AnfahrtEinstellungen.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

/** Richtwert des ORS-Standardplans — nur für die Balkenanzeige. */
const KONTINGENT_RICHTWERT = 2000;

type Standort = {
  id: string;
  bezeichnung: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
  geocode_status: string | null;
  geocode_am: string | null;
  ist_standard: boolean;
  aktiv: boolean;
};

type SchluesselStatus = {
  vorhanden: boolean;
  hinweis?: string | null;
  pruef_status?: string | null;
  pruef_meldung?: string | null;
  zuletzt_geprueft_am?: string | null;
  kontingent_rest?: number | null;
  kontingent_stand_am?: string | null;
};

type StandortForm = { bezeichnung: string; strasse: string; plz: string; ort: string };
const LEER_STANDORT: StandortForm = { bezeichnung: 'Betriebssitz', strasse: '', plz: '', ort: '' };

function datumHuebsch(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusFarbe(s: string | null | undefined): string {
  if (s === 'ok') return C.green;
  if (s === 'kontingent') return C.warn;
  if (s === 'ungueltig') return C.danger;
  return C.textDim;
}

function statusText(s: string | null | undefined): string {
  if (s === 'ok') return '✓ Verbindung steht';
  if (s === 'kontingent') return '⚠ Kontingent erschöpft';
  if (s === 'ungueltig') return '✕ Schlüssel ungültig';
  return '· noch nicht geprüft';
}

export default function AnfahrtEinstellungen() {
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);

  // --- Standort ---------------------------------------------------------
  const [standort, setStandort] = useState<Standort | null>(null);
  const [form, setForm] = useState<StandortForm>(LEER_STANDORT);
  const [standortSpeichert, setStandortSpeichert] = useState(false);
  const [verortet, setVerortet] = useState(false);
  const [verortungsLabel, setVerortungsLabel] = useState<string | null>(null);

  // --- Schlüssel --------------------------------------------------------
  const [schluessel, setSchluessel] = useState<SchluesselStatus>({ vorhanden: false });
  const [eingabeAuf, setEingabeAuf] = useState(false);
  const [neuerSchluessel, setNeuerSchluessel] = useState('');
  const [schluesselLaeuft, setSchluesselLaeuft] = useState(false);

  function melde(text: string) {
    setErfolg(text);
    setFehler(null);
    setTimeout(() => setErfolg(null), 3500);
  }

  // --- Laden ------------------------------------------------------------
  const alesLaden = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const id = authData?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); return; }
      setUid(id);

      const [stRes, keyRes] = await Promise.all([
        supabase.from('betriebs_standort').select('*')
          .eq('owner_user_id', id).eq('aktiv', true).eq('ist_standard', true).maybeSingle(),
        fetch('/api/betrieb/schluessel', { cache: 'no-store' }),
      ]);

      if (stRes.data) {
        const s = stRes.data as Standort;
        setStandort(s);
        setForm({
          bezeichnung: s.bezeichnung ?? 'Betriebssitz',
          strasse: s.strasse ?? '',
          plz: s.plz ?? '',
          ort: s.ort ?? '',
        });
      }

      if (keyRes.ok) setSchluessel((await keyRes.json()) as SchluesselStatus);
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void alesLaden(); }, [alesLaden]);

  // --- Standort speichern ------------------------------------------------
  async function standortSpeichern() {
    if (!uid) return;
    if (!form.strasse.trim() || !form.plz.trim() || !form.ort.trim()) {
      setFehler('Bitte Straße, PLZ und Ort angeben — sonst kann die Anfahrt nicht berechnet werden.');
      return;
    }
    if (!window.confirm(`Betriebsstandort speichern?\n\n${form.strasse}\n${form.plz} ${form.ort}`)) return;

    setStandortSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid,
        bezeichnung: form.bezeichnung.trim() || 'Betriebssitz',
        strasse: form.strasse.trim(),
        plz: form.plz.trim(),
        ort: form.ort.trim(),
        land: 'DE',
        ist_standard: true,
        aktiv: true,
      };

      if (standort) {
        const { error } = await supabase.from('betriebs_standort').update(payload).eq('id', standort.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('betriebs_standort').insert(payload);
        if (error) throw error;
      }
      setVerortet(false); setVerortungsLabel(null);
      await alesLaden();
      melde('Standort gespeichert. Jetzt noch verorten.');
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setStandortSpeichert(false); }
  }

  // --- Standort verorten -------------------------------------------------
  async function standortVerorten() {
    if (!standort) { setFehler('Bitte den Standort zuerst speichern.'); return; }
    setVerortet(true); setFehler(null); setVerortungsLabel(null);
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ art: 'standort', id: standort.id }),
      });
      const daten = await res.json();

      if (!res.ok || !daten?.ok) {
        setFehler(daten?.error ?? 'Verortung fehlgeschlagen.');
        return;
      }
      setVerortungsLabel(daten.label ?? null);
      await alesLaden();
      melde(
        daten.genauigkeit === 'ungenau'
          ? 'Verortet — aber nur ungenau. Entfernungen sind Näherungswerte.'
          : 'Standort exakt verortet.',
      );
    } catch {
      setFehler('Verortung fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setVerortet(false); }
  }

  // --- Schlüssel ---------------------------------------------------------
  async function schluesselSpeichern() {
    const k = neuerSchluessel.trim();
    if (!k) { setFehler('Bitte den Schlüssel einfügen.'); return; }

    setSchluesselLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/betrieb/schluessel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schluessel: k }),
      });
      const daten = await res.json();
      if (!res.ok) { setFehler(daten?.error ?? 'Der Schlüssel wurde nicht angenommen.'); return; }

      setNeuerSchluessel(''); setEingabeAuf(false);
      setSchluessel(daten as SchluesselStatus);
      melde('Schlüssel geprüft und gespeichert.');
    } catch {
      setFehler('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setSchluesselLaeuft(false); }
  }

  async function schluesselTesten() {
    setSchluesselLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/betrieb/schluessel', { method: 'PATCH' });
      const daten = await res.json();
      if (!res.ok) { setFehler(daten?.error ?? 'Test fehlgeschlagen.'); return; }
      setSchluessel(daten as SchluesselStatus);
      melde(daten?.pruef_meldung ?? 'Getestet.');
    } catch {
      setFehler('Test fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setSchluesselLaeuft(false); }
  }

  async function schluesselEntfernen() {
    if (!window.confirm(
      'Schlüssel entfernen?\n\nDie Anfahrtsberechnung funktioniert danach nicht mehr, ' +
      'bis ein neuer Schlüssel hinterlegt ist.'
    )) return;

    setSchluesselLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/betrieb/schluessel', { method: 'DELETE' });
      if (!res.ok) { setFehler('Entfernen fehlgeschlagen.'); return; }
      setSchluessel({ vorhanden: false });
      melde('Schlüssel entfernt.');
    } catch {
      setFehler('Entfernen fehlgeschlagen.');
    } finally { setSchluesselLaeuft(false); }
  }

  // --- Ableitungen -------------------------------------------------------
  const hatKoordinaten = standort?.geo_lat != null && standort?.geo_lon != null;
  const ungenau = standort?.geocode_status === 'ungenau';
  const rest = schluessel.kontingent_rest;
  const restAnteil = rest != null ? Math.max(0, Math.min(1, rest / KONTINGENT_RICHTWERT)) : null;
  const bereitFuerAnfahrt = hatKoordinaten && schluessel.vorhanden && schluessel.pruef_status !== 'ungueltig';

  return (
    <section style={styles.wrap}>
      <h2 style={styles.h2}>Anfahrt & Entfernungen</h2>
      <p style={styles.sub}>
        Damit ARGONAUT die Anfahrt zu jedem Kunden selbst berechnen kann, braucht es zwei Dinge:
        deinen Betriebsstandort als Startpunkt und einen Schlüssel für den Kartendienst.
        Beides einmal einrichten — danach läuft es von allein.
      </p>

      {/* Gesamtstatus */}
      <div style={{ ...styles.statusLeiste, borderColor: bereitFuerAnfahrt ? 'rgba(76,175,125,0.4)' : C.border }}>
        <span style={{ color: bereitFuerAnfahrt ? C.green : C.textDim, fontWeight: 700 }}>
          {bereitFuerAnfahrt ? '✓ Anfahrtsberechnung ist einsatzbereit' : '· Anfahrtsberechnung noch nicht einsatzbereit'}
        </span>
        {!bereitFuerAnfahrt && (
          <span style={{ color: C.textDim, fontSize: 12.5 }}>
            {!hatKoordinaten ? 'Standort fehlt oder ist nicht verortet.' : 'Schlüssel fehlt oder ist ungültig.'}
          </span>
        )}
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {erfolg && <div style={styles.okBox}>{erfolg}</div>}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : (
        <>
          {/* ================= KARTE 1: STANDORT ================= */}
          <div style={styles.card}>
            <div style={styles.cardKopf}>
              <span style={styles.cardTitel}>📍 Betriebsstandort</span>
              {hatKoordinaten && (
                <span style={{ color: ungenau ? C.warn : C.green, fontSize: 12.5 }}>
                  {ungenau ? '⚠ ungenau verortet' : '✓ verortet'}
                </span>
              )}
            </div>
            <p style={styles.cardSub}>Von hier aus wird jede Entfernung gerechnet.</p>

            <div style={styles.grid}>
              <Feld label="Bezeichnung">
                <input style={styles.input} value={form.bezeichnung}
                  onChange={(e) => setForm((f) => ({ ...f, bezeichnung: e.target.value }))} />
              </Feld>
              <Feld label="Straße und Hausnummer *">
                <input style={styles.input} value={form.strasse} placeholder="z. B. Starenweg 1"
                  onChange={(e) => setForm((f) => ({ ...f, strasse: e.target.value }))} />
              </Feld>
              <Feld label="PLZ *">
                <input style={styles.input} value={form.plz} inputMode="numeric" placeholder="72108"
                  onChange={(e) => setForm((f) => ({ ...f, plz: e.target.value }))} />
              </Feld>
              <Feld label="Ort *">
                <input style={styles.input} value={form.ort} placeholder="Rottenburg-Ergenzingen"
                  onChange={(e) => setForm((f) => ({ ...f, ort: e.target.value }))} />
              </Feld>
            </div>

            {hatKoordinaten && (
              <div style={ungenau ? styles.warnBox : styles.infoBox}>
                <strong>Koordinaten:</strong>{' '}
                {standort?.geo_lat?.toFixed(5)} / {standort?.geo_lon?.toFixed(5)}
                {' · '}zuletzt geprüft {datumHuebsch(standort?.geocode_am)}
                {verortungsLabel && (<><br /><span style={{ color: C.textDim }}>Verstanden als: {verortungsLabel}</span></>)}
                {ungenau && (
                  <><br />Die Adresse konnte nur ungefähr gefunden werden. Entfernungen sind Näherungswerte —
                  prüf die Schreibweise oder setz die Koordinaten später von Hand.</>
                )}
              </div>
            )}

            <div style={styles.aktionen}>
              <button onClick={standortVerorten} disabled={!standort || verortet || standortSpeichert}
                style={{ ...styles.ghostBtn, opacity: !standort || verortet ? 0.5 : 1 }}>
                {verortet ? 'Sucht …' : '🌍 Adresse verorten'}
              </button>
              <button onClick={standortSpeichern} disabled={standortSpeichert}
                style={{ ...styles.primaerBtn, opacity: standortSpeichert ? 0.6 : 1 }}>
                {standortSpeichert ? 'Speichert …' : standort ? 'Standort speichern' : 'Standort anlegen'}
              </button>
            </div>
          </div>

          {/* ================= KARTE 2: SCHLÜSSEL ================= */}
          <div style={styles.card}>
            <div style={styles.cardKopf}>
              <span style={styles.cardTitel}>🔑 OpenRouteService</span>
              {schluessel.vorhanden && (
                <span style={{ color: statusFarbe(schluessel.pruef_status), fontSize: 12.5 }}>
                  {statusText(schluessel.pruef_status)}
                </span>
              )}
            </div>
            <p style={styles.cardSub}>
              Der Kartendienst, der die echte Fahrstrecke berechnet — nicht die Luftlinie.
              Jeder Betrieb nutzt seinen eigenen Schlüssel und damit sein eigenes Kontingent.
            </p>

            {schluessel.vorhanden && !eingabeAuf ? (
              <>
                <div style={styles.schluesselZeile}>
                  <code style={styles.code}>{schluessel.hinweis ?? '…'}</code>
                  <span style={{ color: C.textDim, fontSize: 12 }}>
                    zuletzt geprüft {datumHuebsch(schluessel.zuletzt_geprueft_am)}
                  </span>
                </div>

                {rest != null ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.textDim, marginBottom: 6 }}>
                      <span>Kontingent heute</span>
                      <span>{rest.toLocaleString('de-DE')} von ca. {KONTINGENT_RICHTWERT.toLocaleString('de-DE')} frei</span>
                    </div>
                    <div style={styles.balkenSpur}>
                      <div style={{
                        ...styles.balken,
                        width: `${(restAnteil ?? 0) * 100}%`,
                        background: (restAnteil ?? 0) > 0.25 ? C.green : C.warn,
                      }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ ...styles.hint, paddingBottom: 0 }}>
                    Reststand unbekannt — beim nächsten Test wird er ausgelesen.
                  </div>
                )}

                {schluessel.pruef_status === 'ungueltig' && schluessel.pruef_meldung && (
                  <div style={styles.err}>{schluessel.pruef_meldung}</div>
                )}

                <div style={styles.aktionen}>
                  <button onClick={schluesselEntfernen} disabled={schluesselLaeuft}
                    style={{ ...styles.ghostBtn, color: C.textDim, marginRight: 'auto' }}>Entfernen</button>
                  <button onClick={() => setEingabeAuf(true)} disabled={schluesselLaeuft} style={styles.ghostBtn}>Ersetzen</button>
                  <button onClick={schluesselTesten} disabled={schluesselLaeuft}
                    style={{ ...styles.primaerBtn, opacity: schluesselLaeuft ? 0.6 : 1 }}>
                    {schluesselLaeuft ? 'Testet …' : 'Verbindung testen'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <Feld label={schluessel.vorhanden ? 'Neuer Schlüssel' : 'Schlüssel'}>
                  <input type="password" autoComplete="off" style={styles.input}
                    placeholder="Schlüssel hier einfügen"
                    value={neuerSchluessel} onChange={(e) => setNeuerSchluessel(e.target.value)} />
                </Feld>

                <div style={styles.infoBox}>
                  Kostenlos unter <strong>openrouteservice.org</strong> registrieren und dort einen Schlüssel
                  erzeugen. Der Schlüssel wird <strong>sofort getestet</strong> — ein falscher wird gar nicht
                  erst gespeichert.
                  <br /><br />
                  <span style={{ color: C.textDim }}>
                    ⚠ Nach dem Speichern lässt er sich nicht mehr anzeigen — auch nicht von ARGONAUT.
                    Bewahr ihn dort auf, wo du ihn erzeugt hast. Verloren? Dann erzeugst du in drei Minuten einen neuen.
                  </span>
                  {schluessel.vorhanden && (
                    <><br /><br />Der bisherige Schlüssel bleibt aktiv, bis der neue geprüft ist.</>
                  )}
                </div>

                <div style={styles.aktionen}>
                  {schluessel.vorhanden && (
                    <button onClick={() => { setEingabeAuf(false); setNeuerSchluessel(''); }}
                      disabled={schluesselLaeuft} style={styles.ghostBtn}>Abbrechen</button>
                  )}
                  <button onClick={schluesselSpeichern} disabled={schluesselLaeuft || !neuerSchluessel.trim()}
                    style={{ ...styles.primaerBtn, opacity: schluesselLaeuft || !neuerSchluessel.trim() ? 0.5 : 1 }}>
                    {schluesselLaeuft ? 'Prüft …' : 'Prüfen und speichern'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={styles.lbl}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { marginTop: 40 },
  h2: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: C.text },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: '0 0 20px', lineHeight: 1.6, maxWidth: 640 },

  statusLeiste: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 18, fontSize: 13.5 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 18 },
  cardKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  cardTitel: { fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, color: C.text },
  cardSub: { fontSize: 13, color: C.textDim, margin: '6px 0 18px', lineHeight: 1.55 },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 },
  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' },

  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, color: C.gold, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', letterSpacing: 1 },
  schluesselZeile: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },

  balkenSpur: { height: 8, background: C.navy, borderRadius: 999, overflow: 'hidden', border: `1px solid ${C.border}` },
  balken: { height: '100%', borderRadius: 999, transition: 'width 0.3s ease' },

  aktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginTop: 16, lineHeight: 1.5 },
  okBox: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  infoBox: { marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 10, fontSize: 13.5, color: C.text, lineHeight: 1.6 },
  warnBox: { marginTop: 16, padding: '12px 14px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, fontSize: 13.5, color: C.text, lineHeight: 1.6 },
};
