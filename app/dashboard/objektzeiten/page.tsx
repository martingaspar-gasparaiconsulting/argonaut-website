'use client';

// ============================================================
// ARGONAUT OS · Phase 2 · Modul B · Block B.3 · Objekt-Zeiterfassung
// Objektbezogene Zeiten (Einsatzort/Baustelle/Anlage) — NICHT gesetzliche
// Arbeitszeit (die liegt in hr_zeiterfassung). Objekte verwalten, Zeit
// erfassen, Auswertung je Objekt mit Kosten + aufklappbarem KI-Auge.
// Bestätigung vor jedem DB-Schreiben. Design 1:1 wie das übrige Dashboard.
// Pfad: app/dashboard/objektzeiten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import {
  summiereJeObjekt, summiereGesamt, stundenText, eur,
  type ObjektBasis, type ObjektZeitBasis,
} from '../_components/objektLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

// --- DB-Typen -----------------------------------------------------------
type ObjektRow = ObjektBasis & {
  owner_user_id: string;
  kennung: string | null;
  adresse: string | null;
  typ: string | null;
  status: string;
  notiz: string | null;
  archiviert: boolean;
};
type ZeitRow = ObjektZeitBasis & {
  id: string;
  owner_user_id: string;
  mitarbeiter_id: string | null;
  taetigkeit: string | null;
  notiz: string | null;
};

// --- Formular-Zustände --------------------------------------------------
type ObjForm = {
  id: string | null;
  bezeichnung: string; kennung: string; adresse: string; typ: string;
  status: string; stundensatz_netto: string; notiz: string;
};
const OBJ_LEER: ObjForm = {
  id: null, bezeichnung: '', kennung: '', adresse: '', typ: 'Baustelle',
  status: 'aktiv', stundensatz_netto: '', notiz: '',
};

type ZeitForm = {
  objekt_id: string; datum: string; stunden: string; minuten: string;
  taetigkeit: string; stundensatz_netto: string; abrechenbar: boolean; notiz: string;
};
function zeitLeer(objektId: string): ZeitForm {
  return {
    objekt_id: objektId, datum: heuteIso(), stunden: '', minuten: '',
    taetigkeit: '', stundensatz_netto: '', abrechenbar: true, notiz: '',
  };
}

const TYP_OPTIONEN = ['Baustelle', 'Anlage', 'Standort', 'Fahrzeug', 'Sonstiges'];
const OBJ_STATUS = [
  { wert: 'aktiv', label: 'Aktiv' },
  { wert: 'ruhend', label: 'Ruhend' },
  { wert: 'abgeschlossen', label: 'Abgeschlossen' },
];

// --- Datums-Helfer ------------------------------------------------------
function zwei(n: number) { return n < 10 ? '0' + n : String(n); }
function heuteIso() { const d = new Date(); return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`; }
function isoTag(d: Date) { return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`; }

export default function ObjektzeitenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [objekte, setObjekte] = useState<ObjektRow[]>([]);
  const [zeiten, setZeiten] = useState<ZeitRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Zeitraum für die Auswertung (Monat)
  const [monat, setMonat] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  // Modals
  const [objModalAuf, setObjModalAuf] = useState(false);
  const [objForm, setObjForm] = useState<ObjForm>(OBJ_LEER);
  const [zeitForm, setZeitForm] = useState<ZeitForm>(zeitLeer(''));
  const [speichert, setSpeichert] = useState(false);

  // Chef ermitteln
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!uid) return;
    setLaden(true); setFehler(null);
    try {
      const { data: obj, error: e1 } = await supabase
        .from('objekte').select('*')
        .eq('archiviert', false)
        .order('bezeichnung', { ascending: true });
      if (e1) throw e1;
      const objListe = (obj as ObjektRow[]) ?? [];
      setObjekte(objListe);

      const start = isoTag(new Date(monat.getFullYear(), monat.getMonth(), 1));
      const ende = isoTag(new Date(monat.getFullYear(), monat.getMonth() + 1, 0));
      const { data: z, error: e2 } = await supabase
        .from('objekt_zeiten').select('*')
        .gte('datum', start).lte('datum', ende)
        .order('datum', { ascending: false });
      if (e2) throw e2;
      setZeiten((z as ZeitRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid, monat]);

  useEffect(() => { void laden_(); }, [laden_]);

  // --- Objekt speichern -------------------------------------------------
  function objNeu() { setObjForm(OBJ_LEER); setObjModalAuf(true); }
  function objBearbeiten(o: ObjektRow) {
    setObjForm({
      id: o.id, bezeichnung: o.bezeichnung ?? '', kennung: o.kennung ?? '',
      adresse: o.adresse ?? '', typ: o.typ ?? 'Baustelle', status: o.status ?? 'aktiv',
      stundensatz_netto: o.stundensatz_netto != null ? String(o.stundensatz_netto) : '',
      notiz: o.notiz ?? '',
    });
    setObjModalAuf(true);
  }
  async function objSpeichern() {
    if (!uid) return;
    if (!objForm.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung eingeben.'); return; }
    const satz = objForm.stundensatz_netto.trim() === '' ? null : Number(objForm.stundensatz_netto.replace(',', '.'));
    const istNeu = !objForm.id;
    if (!window.confirm(istNeu ? `Neues Objekt anlegen?\n\n• ${objForm.bezeichnung}` : `Änderungen an "${objForm.bezeichnung}" speichern?`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid,
        bezeichnung: objForm.bezeichnung.trim(),
        kennung: objForm.kennung.trim() || null,
        adresse: objForm.adresse.trim() || null,
        typ: objForm.typ || null,
        status: objForm.status,
        stundensatz_netto: satz != null && Number.isFinite(satz) ? satz : null,
        notiz: objForm.notiz.trim() || null,
        aktualisiert_am: new Date().toISOString(),
      };
      if (istNeu) {
        const { error } = await supabase.from('objekte').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('objekte').update(payload).eq('id', objForm.id);
        if (error) throw error;
      }
      setObjModalAuf(false); setObjForm(OBJ_LEER);
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }
  async function objArchivieren(o: ObjektRow) {
    if (!window.confirm(`Objekt "${o.bezeichnung}" archivieren?\n\nErfasste Zeiten bleiben erhalten.`)) return;
    try {
      const { error } = await supabase.from('objekte')
        .update({ archiviert: true, aktualisiert_am: new Date().toISOString() }).eq('id', o.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Zeit buchen ------------------------------------------------------
  function setZ<K extends keyof ZeitForm>(k: K, v: ZeitForm[K]) { setZeitForm((f) => ({ ...f, [k]: v })); }
  async function zeitSpeichern() {
    if (!uid) return;
    if (!zeitForm.objekt_id) { setFehler('Bitte ein Objekt wählen.'); return; }
    const std = parseInt(zeitForm.stunden || '0', 10);
    const min = parseInt(zeitForm.minuten || '0', 10);
    const dauer = (Number.isFinite(std) ? std : 0) * 60 + (Number.isFinite(min) ? min : 0);
    if (dauer <= 0) { setFehler('Bitte eine Dauer größer als 0 eingeben.'); return; }
    const satz = zeitForm.stundensatz_netto.trim() === '' ? null : Number(zeitForm.stundensatz_netto.replace(',', '.'));
    const objName = objekte.find((o) => o.id === zeitForm.objekt_id)?.bezeichnung ?? 'Objekt';

    if (!window.confirm(`Zeit buchen?\n\n• ${objName}\n• ${stundenText(dauer)} am ${zeitForm.datum.split('-').reverse().join('.')}\n• ${zeitForm.abrechenbar ? 'abrechenbar' : 'nicht abrechenbar'}`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const { error } = await supabase.from('objekt_zeiten').insert({
        owner_user_id: uid,
        objekt_id: zeitForm.objekt_id,
        datum: zeitForm.datum,
        dauer_minuten: dauer,
        taetigkeit: zeitForm.taetigkeit.trim() || null,
        stundensatz_netto: satz != null && Number.isFinite(satz) ? satz : null,
        abrechenbar: zeitForm.abrechenbar,
        notiz: zeitForm.notiz.trim() || null,
      });
      if (error) throw error;
      setZeitForm(zeitLeer(zeitForm.objekt_id)); // Objekt-Auswahl beibehalten (schnelles Nachbuchen)
      await laden_();
    } catch (e: unknown) {
      setFehler('Buchung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }
  async function zeitLoeschen(z: ZeitRow) {
    if (!window.confirm('Diese Zeitbuchung wirklich entfernen?')) return;
    try {
      const { error } = await supabase.from('objekt_zeiten').delete().eq('id', z.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Auswertung -------------------------------------------------------
  const summen = summiereJeObjekt(zeiten, objekte);
  const gesamt = summiereGesamt(summen);
  const monatsName = monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const objName = (id: string | null) => objekte.find((o) => o.id === id)?.bezeichnung ?? (id ? 'Unbekannt' : 'Ohne Objekt');

  const kiKontext = zeiten.length === 0
    ? ''
    : `Im ${monatsName}: ${stundenText(gesamt.minutenGesamt)} auf ${summen.length} Objekte gebucht, davon ${stundenText(gesamt.minutenAbrechenbar)} abrechenbar` +
      (gesamt.kostenAbrechenbar != null ? ` (${eur(gesamt.kostenAbrechenbar)} netto).` : ' (Kosten teils ohne Stundensatz).');

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Objekt-Zeiterfassung</h1>
          <p style={styles.sub}>Zeit je Objekt / Einsatzort erfassen und auswerten — getrennt von der gesetzlichen Arbeitszeit.</p>
        </div>
        <button onClick={objNeu} style={styles.primaerBtn}>+ Neues Objekt</button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Zeit erfassen */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Zeit erfassen</h2>
        {objekte.length === 0 ? (
          <div style={styles.hint}>Lege zuerst oben rechts ein Objekt an — dann kannst du Zeiten darauf buchen.</div>
        ) : (
          <div style={styles.erfassGrid}>
            <div>
              <label style={styles.lbl}>Objekt</label>
              <select style={styles.input} value={zeitForm.objekt_id} onChange={(e) => setZ('objekt_id', e.target.value)}>
                <option value="">— wählen —</option>
                {objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.lbl}>Datum</label>
              <input type="date" style={styles.input} value={zeitForm.datum} onChange={(e) => setZ('datum', e.target.value)} />
            </div>
            <div>
              <label style={styles.lbl}>Stunden</label>
              <input type="number" min={0} style={styles.input} value={zeitForm.stunden} onChange={(e) => setZ('stunden', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={styles.lbl}>Minuten</label>
              <input type="number" min={0} max={59} style={styles.input} value={zeitForm.minuten} onChange={(e) => setZ('minuten', e.target.value)} placeholder="0" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.lbl}>Tätigkeit</label>
              <input style={styles.input} value={zeitForm.taetigkeit} onChange={(e) => setZ('taetigkeit', e.target.value)} placeholder="z. B. Reparatur, Aufbau, Anfahrt …" />
            </div>
            <div>
              <label style={styles.lbl}>Sondersatz €/h (optional)</label>
              <input style={styles.input} value={zeitForm.stundensatz_netto} onChange={(e) => setZ('stundensatz_netto', e.target.value)} placeholder="Objekt-Satz" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={() => setZ('abrechenbar', !zeitForm.abrechenbar)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 999,
                  border: `1px solid ${zeitForm.abrechenbar ? C.cyan : C.border}`,
                  background: zeitForm.abrechenbar ? 'rgba(0,229,255,0.1)' : 'transparent',
                  color: zeitForm.abrechenbar ? C.text : C.textDim, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: zeitForm.abrechenbar ? C.cyan : C.textDim }} />
                {zeitForm.abrechenbar ? 'Abrechenbar' : 'Nicht abrechenbar'}
              </button>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={zeitSpeichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Bucht …' : 'Zeit buchen'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Zeitraum + Auswertung */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 14px' }}>
        <button style={styles.navBtn} onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() - 1, 1))}>‹</button>
        <span style={{ minWidth: 150, textAlign: 'center', fontWeight: 700, fontFamily: "'Syne', sans-serif", fontSize: 16 }}>{monatsName}</span>
        <button style={styles.navBtn} onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() + 1, 1))}>›</button>
      </div>

      {!laden && (
        <>
          <div style={styles.summenGrid}>
            <SummeKarte label="Zeit gesamt" value={stundenText(gesamt.minutenGesamt)} accent={C.cyan} />
            <SummeKarte label="Abrechenbar" value={stundenText(gesamt.minutenAbrechenbar)} accent={C.green} />
            <SummeKarte label="Kosten netto" value={gesamt.kostenAbrechenbar != null ? eur(gesamt.kostenAbrechenbar) : 'n. kalkulierbar'} accent={C.gold} />
            <SummeKarte label="Buchungen" value={String(gesamt.anzahlBuchungen)} />
          </div>

          {/* KI-Auge zur Monatslage (on-demand, startet erst beim Aufklappen) */}
          {kiKontext && (
            <KiAuge
              modul="Objekt-Zeiterfassung"
              kontext={kiKontext}
              aktionHref="/dashboard/objektzeiten"
              aktionText="Zur Objekt-Zeiterfassung"
            />
          )}

          {/* Auswertung je Objekt */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Auswertung je Objekt · {monatsName}</h2>
            {summen.length === 0 ? (
              <div style={styles.hint}>Keine Buchungen in diesem Monat.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Objekt</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Buchungen</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Zeit gesamt</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Abrechenbar</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Kosten netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summen.map((s) => (
                      <tr key={s.objektId ?? 'ohne'}>
                        <td style={{ ...styles.td, fontWeight: 600 }}>{s.bezeichnung}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{s.anzahlBuchungen}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{stundenText(s.minutenGesamt)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.green }}>{stundenText(s.minutenAbrechenbar)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.gold }}>
                          {s.kostenAbrechenbar != null ? eur(s.kostenAbrechenbar) : '— (kein Satz)'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Einzelbuchungen */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <h2 style={styles.cardTitle}>Einzelbuchungen · {monatsName}</h2>
            {zeiten.length === 0 ? (
              <div style={styles.hint}>Keine Buchungen in diesem Monat.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Datum</th>
                      <th style={styles.th}>Objekt</th>
                      <th style={styles.th}>Tätigkeit</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Dauer</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>Abr.</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeiten.map((z) => (
                      <tr key={z.id}>
                        <td style={styles.td}>{(z.datum ?? '').split('-').reverse().join('.')}</td>
                        <td style={styles.td}>{objName(z.objekt_id ?? null)}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{z.taetigkeit || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{stundenText(z.dauer_minuten)}</td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', background: z.abrechenbar !== false ? C.green : C.textDim }} />
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <button onClick={() => zeitLoeschen(z)} style={styles.miniBtnGhost}>Entfernen</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Objekt-Liste (Verwaltung) */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <h2 style={styles.cardTitle}>Objekte</h2>
            {objekte.length === 0 ? (
              <div style={styles.hint}>Noch keine Objekte. Leg oben rechts das erste an.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Bezeichnung</th>
                      <th style={styles.th}>Typ</th>
                      <th style={styles.th}>Kennung</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Satz €/h</th>
                      <th style={styles.th}>Status</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objekte.map((o) => (
                      <tr key={o.id}>
                        <td style={{ ...styles.td, fontWeight: 600 }}>{o.bezeichnung}</td>
                        <td style={styles.td}>{o.typ || '—'}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{o.kennung || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{o.stundensatz_netto != null ? eur(o.stundensatz_netto) : '—'}</td>
                        <td style={styles.td}>{OBJ_STATUS.find((s) => s.wert === o.status)?.label || o.status}</td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => objBearbeiten(o)} style={styles.miniBtnGhost}>Bearbeiten</button>
                          <button onClick={() => objArchivieren(o)} style={styles.miniBtnGhost}>Archiv</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {laden && <div style={styles.hint}>Lädt …</div>}

      {/* --- Objekt-Modal --------------------------------------------- */}
      {objModalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setObjModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>{objForm.id ? 'Objekt bearbeiten' : 'Neues Objekt'}</h2>
            <div style={styles.formGrid}>
              <Feld label="Bezeichnung *" voll>
                <input style={styles.input} value={objForm.bezeichnung} onChange={(e) => setObjForm((f) => ({ ...f, bezeichnung: e.target.value }))} placeholder="z. B. Baustelle Musterweg 12" />
              </Feld>
              <Feld label="Typ">
                <select style={styles.input} value={objForm.typ} onChange={(e) => setObjForm((f) => ({ ...f, typ: e.target.value }))}>
                  {TYP_OPTIONEN.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Feld>
              <Feld label="Kennung / Nr.">
                <input style={styles.input} value={objForm.kennung} onChange={(e) => setObjForm((f) => ({ ...f, kennung: e.target.value }))} />
              </Feld>
              <Feld label="Adresse" voll>
                <input style={styles.input} value={objForm.adresse} onChange={(e) => setObjForm((f) => ({ ...f, adresse: e.target.value }))} />
              </Feld>
              <Feld label="Standard-Stundensatz €/h">
                <input style={styles.input} value={objForm.stundensatz_netto} onChange={(e) => setObjForm((f) => ({ ...f, stundensatz_netto: e.target.value }))} placeholder="z. B. 65" />
              </Feld>
              <Feld label="Status">
                <select style={styles.input} value={objForm.status} onChange={(e) => setObjForm((f) => ({ ...f, status: e.target.value }))}>
                  {OBJ_STATUS.map((s) => <option key={s.wert} value={s.wert}>{s.label}</option>)}
                </select>
              </Feld>
              <Feld label="Notiz" voll>
                <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={objForm.notiz} onChange={(e) => setObjForm((f) => ({ ...f, notiz: e.target.value }))} />
              </Feld>
            </div>
            <div style={styles.modalAktionen}>
              <button onClick={() => setObjModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={objSpeichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Speichert …' : (objForm.id ? 'Speichern' : 'Anlegen')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Feld({ label, children, voll }: { label: string; children: React.ReactNode; voll?: boolean }) {
  return (
    <div style={{ gridColumn: voll ? '1 / -1' : 'auto' }}>
      <label style={styles.lbl}>{label}</label>
      {children}
    </div>
  );
}
function SummeKarte({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.summeBox}>
      <div style={styles.summeLabel}>{label}</div>
      <div style={{ ...styles.summeValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 640, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  navBtn: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, margin: '0 0 14px', color: C.text },

  erfassGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  table: { width: '100%', borderCollapse: 'collapse', minWidth: 560 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', fontSize: 14, borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
};
