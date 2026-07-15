'use client';

// ============================================================
// ARGONAUT OS · Phase 2 · Modul C · Block C.3 · Termin-/Ressourcenbuchung
// Generisch für ALLE Branchen (Ressource = Mitarbeiter/Maschine/Fahrzeug/
// Raum/Gerät). Buchung anlegen mit LIVE-Konfliktprüfung (warnt vor dem
// Speichern), Tages-Timeline je Ressource, Ressourcen-Verwaltung, KI-Auge.
// DB-EXCLUDE-Sperre ist das Netz darunter (Fehlercode 23P01 wird abgefangen).
// Design 1:1 wie das übrige Dashboard. Bestätigung vor jedem DB-Schreiben.
// Pfad: app/dashboard/buchungen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import {
  findeKonflikte, buchungsAmpel, zeitraumText, dauerText, uhrzeit,
  baueZeitpunkt, gruppiereNachRessource, zaehleHeute, istGleicherTag, parseZeit,
  type BuchungBasis, type RessourceBasis,
} from '../_components/buchungsLogik';

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
type RessourceRow = RessourceBasis & {
  owner_user_id: string;
  kapazitaet: number;
  status: string;
  notiz: string | null;
  archiviert: boolean;
};
type BuchungRow = BuchungBasis & {
  id: string;
  owner_user_id: string;
  ressource_id: string;
  titel: string;
  beschreibung: string | null;
  beginn_am: string;
  ende_am: string;
  status: string;
  kontakt_id: string | null;
  objekt_id: string | null;
  notiz: string | null;
};

const TYP_OPTIONEN = ['Mitarbeiter', 'Maschine', 'Fahrzeug', 'Raum', 'Tisch', 'Gerät', 'Werkzeug', 'Anlage', 'Behandlungsplatz', 'Sonstiges'];
const FARB_OPTIONEN = ['#00e5ff', '#4CAF7D', '#C9A84C', '#E0A24C', '#A855F7', '#E06666'];
const STATUS_OPTIONEN = [
  { wert: 'geplant', label: 'Geplant' },
  { wert: 'bestaetigt', label: 'Bestätigt' },
  { wert: 'erledigt', label: 'Erledigt' },
  { wert: 'storniert', label: 'Storniert' },
];

// --- Formular-Zustände --------------------------------------------------
type ResForm = {
  id: string | null;
  bezeichnung: string; typ: string; farbe: string; notiz: string; status: string;
};
const RES_LEER: ResForm = { id: null, bezeichnung: '', typ: 'Maschine', farbe: '#00e5ff', notiz: '', status: 'aktiv' };

type BuchForm = {
  id: string | null;
  ressource_id: string;
  titel: string;
  datum: string;      // YYYY-MM-DD
  start: string;      // HH:MM
  ende: string;       // HH:MM
  status: string;
  beschreibung: string;
};
function zwei(n: number) { return n < 10 ? '0' + n : String(n); }
function heuteIso() { const d = new Date(); return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`; }
function isoTag(d: Date) { return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`; }
function buchLeer(resId: string): BuchForm {
  return { id: null, ressource_id: resId, titel: '', datum: heuteIso(), start: '08:00', ende: '10:00', status: 'geplant', beschreibung: '' };
}

export default function BuchungenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [ressourcen, setRessourcen] = useState<RessourceRow[]>([]);
  const [buchungen, setBuchungen] = useState<BuchungRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Timeline-Tag
  const [tag, setTag] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); });

  // Modals
  const [resModalAuf, setResModalAuf] = useState(false);
  const [resForm, setResForm] = useState<ResForm>(RES_LEER);
  const [buchModalAuf, setBuchModalAuf] = useState(false);
  const [buchForm, setBuchForm] = useState<BuchForm>(buchLeer(''));
  const [speichert, setSpeichert] = useState(false);

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
      const { data: res, error: e1 } = await supabase
        .from('ressourcen').select('*')
        .eq('archiviert', false)
        .order('bezeichnung', { ascending: true });
      if (e1) throw e1;
      setRessourcen((res as RessourceRow[]) ?? []);

      // Buchungen des angezeigten Tages (+ etwas Puffer für mehrtägige)
      const tagStart = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), 0, 0, 0);
      const tagEnde = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), 23, 59, 59);
      // mehrtägige Buchungen einschließen: alles was den Tag berührt
      const { data: buch, error: e2 } = await supabase
        .from('buchungen').select('*')
        .lte('beginn_am', tagEnde.toISOString())
        .gte('ende_am', tagStart.toISOString())
        .order('beginn_am', { ascending: true });
      if (e2) throw e2;
      setBuchungen((buch as BuchungRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid, tag]);

  useEffect(() => { void laden_(); }, [laden_]);

  // --- Ressource speichern ----------------------------------------------
  function resNeu() { setResForm(RES_LEER); setResModalAuf(true); }
  function resBearbeiten(r: RessourceRow) {
    setResForm({ id: r.id, bezeichnung: r.bezeichnung ?? '', typ: r.typ ?? 'Maschine', farbe: r.farbe ?? '#00e5ff', notiz: r.notiz ?? '', status: r.status ?? 'aktiv' });
    setResModalAuf(true);
  }
  async function resSpeichern() {
    if (!uid) return;
    if (!resForm.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung eingeben.'); return; }
    const istNeu = !resForm.id;
    if (!window.confirm(istNeu ? `Neue Ressource anlegen?\n\n• ${resForm.bezeichnung} (${resForm.typ})` : `Änderungen an "${resForm.bezeichnung}" speichern?`)) return;
    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid,
        bezeichnung: resForm.bezeichnung.trim(),
        typ: resForm.typ,
        farbe: resForm.farbe,
        status: resForm.status,
        notiz: resForm.notiz.trim() || null,
        aktualisiert_am: new Date().toISOString(),
      };
      if (istNeu) {
        const { error } = await supabase.from('ressourcen').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ressourcen').update(payload).eq('id', resForm.id);
        if (error) throw error;
      }
      setResModalAuf(false); setResForm(RES_LEER);
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }
  async function resArchivieren(r: RessourceRow) {
    if (!window.confirm(`Ressource "${r.bezeichnung}" archivieren?\n\nBestehende Buchungen bleiben erhalten.`)) return;
    try {
      const { error } = await supabase.from('ressourcen').update({ archiviert: true, aktualisiert_am: new Date().toISOString() }).eq('id', r.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Buchung anlegen (mit Live-Konfliktprüfung) -----------------------
  function buchNeu(resId?: string) {
    const ziel = resId || (ressourcen[0]?.id ?? '');
    setBuchForm({ ...buchLeer(ziel), datum: isoTag(tag) });
    setBuchModalAuf(true);
  }
  function setB<K extends keyof BuchForm>(k: K, v: BuchForm[K]) { setBuchForm((f) => ({ ...f, [k]: v })); }

  // Live-Konflikt: berechnet sich neu, sobald sich das Formular ändert
  const geplanteBuchung: BuchungBasis | null = useMemo(() => {
    const s = baueZeitpunkt(buchForm.datum, buchForm.start);
    const e = baueZeitpunkt(buchForm.datum, buchForm.ende);
    if (!buchForm.ressource_id || !s || !e || e <= s) return null;
    return { id: buchForm.id ?? undefined, ressource_id: buchForm.ressource_id, beginn_am: s, ende_am: e, status: buchForm.status };
  }, [buchForm]);

  const liveKonflikte = useMemo(() => {
    if (!geplanteBuchung || buchForm.status === 'storniert') return [];
    return findeKonflikte(geplanteBuchung, buchungen);
  }, [geplanteBuchung, buchungen, buchForm.status]);

  const zeitUngueltig = useMemo(() => {
    const s = baueZeitpunkt(buchForm.datum, buchForm.start);
    const e = baueZeitpunkt(buchForm.datum, buchForm.ende);
    return !s || !e || e <= s;
  }, [buchForm]);

  async function buchSpeichern() {
    if (!uid) return;
    if (!buchForm.ressource_id) { setFehler('Bitte eine Ressource wählen.'); return; }
    if (!buchForm.titel.trim()) { setFehler('Bitte einen Titel eingeben.'); return; }
    const s = baueZeitpunkt(buchForm.datum, buchForm.start);
    const e = baueZeitpunkt(buchForm.datum, buchForm.ende);
    if (!s || !e || e <= s) { setFehler('Bitte gültige Start-/Endzeit wählen (Ende nach Start).'); return; }
    if (liveKonflikte.length > 0) { setFehler('Zeitraum kollidiert mit einer bestehenden Buchung.'); return; }

    const resName = ressourcen.find((r) => r.id === buchForm.ressource_id)?.bezeichnung ?? 'Ressource';
    if (!window.confirm(`Buchung anlegen?\n\n• ${resName}\n• ${buchForm.titel}\n• ${uhrzeit(s)}–${uhrzeit(e)} am ${buchForm.datum.split('-').reverse().join('.')}`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid,
        ressource_id: buchForm.ressource_id,
        titel: buchForm.titel.trim(),
        beschreibung: buchForm.beschreibung.trim() || null,
        beginn_am: s.toISOString(),
        ende_am: e.toISOString(),
        status: buchForm.status,
        aktualisiert_am: new Date().toISOString(),
      };
      if (buchForm.id) {
        const { error } = await supabase.from('buchungen').update(payload).eq('id', buchForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('buchungen').insert(payload);
        if (error) throw error;
      }
      setBuchModalAuf(false);
      await laden_();
    } catch (e: unknown) {
      // DB-EXCLUDE-Sperre: freundliche Meldung statt Technik-Code
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('23P01') || msg.toLowerCase().includes('exclusion') || msg.includes('buchung_keine_ueberschneidung')) {
        setFehler('Diese Ressource ist in dem Zeitraum bereits belegt. Bitte einen anderen Zeitraum wählen.');
      } else {
        setFehler('Speichern fehlgeschlagen: ' + msg);
      }
    } finally { setSpeichert(false); }
  }

  function buchBearbeiten(b: BuchungRow) {
    const s = parseZeit(b.beginn_am);
    const e = parseZeit(b.ende_am);
    setBuchForm({
      id: b.id,
      ressource_id: b.ressource_id,
      titel: b.titel ?? '',
      datum: s ? isoTag(s) : heuteIso(),
      start: s ? `${zwei(s.getHours())}:${zwei(s.getMinutes())}` : '08:00',
      ende: e ? `${zwei(e.getHours())}:${zwei(e.getMinutes())}` : '10:00',
      status: b.status ?? 'geplant',
      beschreibung: b.beschreibung ?? '',
    });
    setBuchModalAuf(true);
  }
  async function buchStornieren(b: BuchungRow) {
    if (!window.confirm(`Buchung "${b.titel}" stornieren?\n\nSie bleibt erhalten, gibt den Zeitraum aber wieder frei.`)) return;
    try {
      const { error } = await supabase.from('buchungen').update({ status: 'storniert', aktualisiert_am: new Date().toISOString() }).eq('id', b.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Stornieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Timeline-Daten ---------------------------------------------------
  const spuren = gruppiereNachRessource(ressourcen, buchungen);
  const zaehl = zaehleHeute(buchungen, new Date());
  const tagName = tag.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const resName = (id: string | null) => ressourcen.find((r) => r.id === id)?.bezeichnung ?? 'Unbekannt';
  const resFarbe = (id: string | null) => ressourcen.find((r) => r.id === id)?.farbe ?? C.cyan;

  const kiKontext = buchungen.length === 0
    ? ''
    : `${ressourcen.length} Ressourcen. Am ${tagName}: ${buchungen.filter((b) => b.status !== 'storniert').length} Buchungen, davon ${zaehl.laufen} laufen gerade.`;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Termin- &amp; Ressourcenbuchung</h1>
          <p style={styles.sub}>Ressourcen belegen ohne Doppelbuchung — Mitarbeiter, Maschinen, Fahrzeuge, Räume oder Geräte.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={resNeu} style={styles.ghostBtn}>+ Ressource</button>
          <button onClick={() => buchNeu()} disabled={ressourcen.length === 0} style={{ ...styles.primaerBtn, opacity: ressourcen.length === 0 ? 0.5 : 1 }}>+ Buchung</button>
        </div>
      </div>

      {/* Kopf-Kacheln */}
      {!laden && (
        <div style={styles.summenGrid}>
          <SummeKarte label="Ressourcen" value={String(ressourcen.length)} accent={C.cyan} />
          <SummeKarte label="Buchungen (Tag)" value={String(buchungen.filter((b) => b.status !== 'storniert').length)} accent={C.gold} />
          <SummeKarte label="Läuft gerade" value={String(zaehl.laufen)} accent={zaehl.laufen > 0 ? C.green : C.textDim} />
          <SummeKarte label="Heute" value={String(zaehl.heute)} accent={C.green} />
        </div>
      )}

      {/* KI-Auge (on-demand) */}
      {!laden && kiKontext && (
        <KiAuge modul="Termin- & Ressourcenbuchung" kontext={kiKontext} aktionHref="/dashboard/buchungen" aktionText="Zu den Buchungen" />
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Timeline-Tag-Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 14px' }}>
        <button style={styles.navBtn} onClick={() => setTag(new Date(tag.getFullYear(), tag.getMonth(), tag.getDate() - 1))}>‹</button>
        <span style={{ minWidth: 260, textAlign: 'center', fontWeight: 700, fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(16px, 1.38vw, 22px)' }}>{tagName}</span>
        <button style={styles.navBtn} onClick={() => setTag(new Date(tag.getFullYear(), tag.getMonth(), tag.getDate() + 1))}>›</button>
        <button style={{ ...styles.ghostBtn, marginLeft: 6 }} onClick={() => { const d = new Date(); setTag(new Date(d.getFullYear(), d.getMonth(), d.getDate())); }}>Heute</button>
      </div>

      {/* Timeline je Ressource */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Tages-Belegung</h2>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : ressourcen.length === 0 ? (
          <div style={styles.hint}>Noch keine Ressourcen. Leg oben rechts die erste an (z. B. „Harvester", „Werkstatt-Bühne 1", „Techniker Müller").</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {spuren.map(({ ressource, buchungen: bl }) => {
              const tagesBuchungen = bl.filter((b) => {
                const s = parseZeit(b.beginn_am);
                return s && (istGleicherTag(s, tag) || b.status !== 'storniert');
              }).filter((b) => b.status !== 'storniert');
              return (
                <div key={ressource.id} style={styles.spur}>
                  <div style={styles.spurKopf}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: ressource.farbe ?? C.cyan, display: 'inline-block', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ressource.bezeichnung}</div>
                      <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim }}>{ressource.typ}</div>
                    </div>
                  </div>
                  <div style={styles.spurBahn}>
                    {tagesBuchungen.length === 0 ? (
                      <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', alignSelf: 'center' }}>frei</span>
                    ) : (
                      tagesBuchungen.map((b) => {
                        const a = buchungsAmpel(b as BuchungBasis);
                        return (
                          <button
                            key={b.id}
                            onClick={() => buchBearbeiten(b as BuchungRow)}
                            title={`${b.titel} · ${zeitraumText(b.beginn_am, b.ende_am)} · ${dauerText(b.beginn_am, b.ende_am)}`}
                            style={{
                              ...styles.block,
                              background: `${ressource.farbe ?? C.cyan}22`,
                              borderColor: ressource.farbe ?? C.cyan,
                            }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.farbe, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.titel}</span>
                            <span style={{ color: C.textDim, fontSize: 'clamp(11px, 0.94vw, 15px)', whiteSpace: 'nowrap' }}>{uhrzeit(b.beginn_am)}–{uhrzeit(b.ende_am)}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button onClick={() => buchNeu(ressource.id)} style={styles.spurPlus} title="Buchung für diese Ressource">+</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ressourcen-Verwaltung */}
      {!laden && ressourcen.length > 0 && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <h2 style={styles.cardTitle}>Ressourcen</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Bezeichnung</th>
                  <th style={styles.th}>Typ</th>
                  <th style={styles.th}>Farbe</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {ressourcen.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{r.bezeichnung}</td>
                    <td style={styles.td}>{r.typ}</td>
                    <td style={styles.td}><span style={{ width: 16, height: 16, borderRadius: 4, background: r.farbe ?? C.cyan, display: 'inline-block', verticalAlign: 'middle' }} /></td>
                    <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => resBearbeiten(r)} style={styles.miniBtnGhost}>Bearbeiten</button>
                      <button onClick={() => resArchivieren(r)} style={styles.miniBtnGhost}>Archiv</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={styles.rechtHinweis}>
        Die Datenbank verhindert Doppelbuchungen automatisch: dieselbe Ressource kann nicht zweimal im selben Zeitraum belegt werden. Stornierte Buchungen geben ihren Zeitraum wieder frei.
      </div>

      {/* --- Ressourcen-Modal ------------------------------------------ */}
      {resModalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setResModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>{resForm.id ? 'Ressource bearbeiten' : 'Neue Ressource'}</h2>
            <div style={styles.formGrid}>
              <Feld label="Bezeichnung *" voll>
                <input style={styles.input} value={resForm.bezeichnung} onChange={(e) => setResForm((f) => ({ ...f, bezeichnung: e.target.value }))} placeholder="z. B. Harvester John Deere / Werkstatt-Bühne 1 / Techniker Müller" />
              </Feld>
              <Feld label="Typ">
                <select style={styles.input} value={resForm.typ} onChange={(e) => setResForm((f) => ({ ...f, typ: e.target.value }))}>
                  {TYP_OPTIONEN.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Feld>
              <Feld label="Farbe (Timeline)">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                  {FARB_OPTIONEN.map((farbe) => (
                    <button key={farbe} onClick={() => setResForm((f) => ({ ...f, farbe }))}
                      style={{ width: 26, height: 26, borderRadius: 6, background: farbe, cursor: 'pointer',
                        border: resForm.farbe === farbe ? '2px solid #fff' : '2px solid transparent' }} />
                  ))}
                </div>
              </Feld>
              <Feld label="Notiz" voll>
                <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={resForm.notiz} onChange={(e) => setResForm((f) => ({ ...f, notiz: e.target.value }))} />
              </Feld>
            </div>
            <div style={styles.modalAktionen}>
              <button onClick={() => setResModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={resSpeichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Speichert …' : (resForm.id ? 'Speichern' : 'Anlegen')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Buchungs-Modal (mit Live-Konfliktprüfung) ----------------- */}
      {buchModalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setBuchModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>{buchForm.id ? 'Buchung bearbeiten' : 'Neue Buchung'}</h2>
            <div style={styles.formGrid}>
              <Feld label="Ressource *" voll>
                <select style={styles.input} value={buchForm.ressource_id} onChange={(e) => setB('ressource_id', e.target.value)}>
                  <option value="">— wählen —</option>
                  {ressourcen.map((r) => <option key={r.id} value={r.id}>{r.bezeichnung} ({r.typ})</option>)}
                </select>
              </Feld>
              <Feld label="Titel *" voll>
                <input style={styles.input} value={buchForm.titel} onChange={(e) => setB('titel', e.target.value)} placeholder="z. B. Einsatz Baustelle Nord / Kundentermin Meier" />
              </Feld>
              <Feld label="Datum">
                <input type="date" style={styles.input} value={buchForm.datum} onChange={(e) => setB('datum', e.target.value)} />
              </Feld>
              <Feld label="Status">
                <select style={styles.input} value={buchForm.status} onChange={(e) => setB('status', e.target.value)}>
                  {STATUS_OPTIONEN.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                </select>
              </Feld>
              <Feld label="Von (Uhrzeit)">
                <input type="time" style={styles.input} value={buchForm.start} onChange={(e) => setB('start', e.target.value)} />
              </Feld>
              <Feld label="Bis (Uhrzeit)">
                <input type="time" style={styles.input} value={buchForm.ende} onChange={(e) => setB('ende', e.target.value)} />
              </Feld>
              <Feld label="Beschreibung" voll>
                <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={buchForm.beschreibung} onChange={(e) => setB('beschreibung', e.target.value)} />
              </Feld>
            </div>

            {/* LIVE-KONFLIKT-ANZEIGE */}
            {zeitUngueltig ? (
              <div style={styles.konfliktWarn}>Bitte gültige Zeiten wählen (Ende muss nach Start liegen).</div>
            ) : liveKonflikte.length > 0 ? (
              <div style={styles.konfliktRot}>
                ⚠ Diese Ressource ist im gewählten Zeitraum bereits belegt:
                <div style={{ marginTop: 6 }}>
                  {liveKonflikte.map((k) => (
                    <div key={k.id} style={{ fontSize: 'clamp(13px, 1.13vw, 18px)' }}>• {k.titel || 'Buchung'} ({uhrzeit(k.beginn_am)}–{uhrzeit(k.ende_am)})</div>
                  ))}
                </div>
              </div>
            ) : buchForm.ressource_id && buchForm.titel ? (
              <div style={styles.konfliktGruen}>✓ Zeitraum frei — keine Kollision.</div>
            ) : null}

            <div style={styles.modalAktionen}>
              <button onClick={() => setBuchModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              {buchForm.id && (
                <button onClick={() => { const b = buchungen.find((x) => x.id === buchForm.id); if (b) buchStornieren(b); }} disabled={speichert} style={{ ...styles.ghostBtn, color: C.warn, borderColor: C.warn }}>Stornieren</button>
              )}
              <button onClick={buchSpeichern} disabled={speichert || liveKonflikte.length > 0 || zeitUngueltig}
                style={{ ...styles.primaerBtn, opacity: (speichert || liveKonflikte.length > 0 || zeitUngueltig) ? 0.5 : 1, cursor: (liveKonflikte.length > 0 || zeitUngueltig) ? 'not-allowed' : 'pointer' }}>
                {speichert ? 'Speichert …' : (buchForm.id ? 'Speichern' : 'Buchen')}
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
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 640, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer' },
  navBtn: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 'clamp(16px, 1.38vw, 22px)', fontFamily: 'inherit' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 'clamp(12.5px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(24px, 2.13vw, 34px)', fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(17px, 1.5vw, 24px)', fontWeight: 700, margin: '0 0 14px', color: C.text },

  // Timeline
  spur: { display: 'flex', alignItems: 'stretch', gap: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 },
  spurKopf: { display: 'flex', alignItems: 'center', gap: 8, width: 180, flexShrink: 0 },
  spurBahn: { flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minHeight: 40, minWidth: 0 },
  spurPlus: { background: 'transparent', color: C.textDim, border: `1px dashed ${C.border}`, borderRadius: 8, width: 34, flexShrink: 0, cursor: 'pointer', fontSize: 'clamp(18px, 1.56vw, 25px)', fontFamily: 'inherit' },
  block: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 8, border: '1px solid', color: C.text, fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer', fontFamily: 'inherit', maxWidth: 240 },

  table: { width: '100%', borderCollapse: 'collapse', minWidth: 440 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },

  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  rechtHinweis: { marginTop: 16, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5, maxWidth: 720 },

  // Konflikt-Hinweise im Buchungs-Modal
  konfliktRot: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 10, padding: '12px 14px', marginTop: 14, fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600 },
  konfliktGruen: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.green}`, color: C.green, borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600 },
  konfliktWarn: { background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, color: C.warn, borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 'clamp(14px, 1.25vw, 20px)' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
};
