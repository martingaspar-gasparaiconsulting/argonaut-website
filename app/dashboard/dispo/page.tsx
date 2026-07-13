'use client';

// ============================================================
// ARGONAUT OS · Modul Dispo-Board (Field Service · Punkt 22)
// Monteure (Zeilen) × Wochentage (Spalten). Einsätze als Kacheln.
//  (1) "Unzugeordnet"-Panel: Einsätze ohne Monteur -> klick = zuweisen
//  (2) Grid: pro Monteur/Tag eine Zelle, "+"-Knopf legt direkt dort an
//  (3) Klick auf Einsatz: anschauen · verschieben · Monteur/Status ändern · absagen
//  (4) "Neuer Einsatz": frei anlegen
// Tabelle: einsaetze (RLS 1:1 wie termine). NICHT-destruktiv: "Absagen" = Status.
// Pfad: app/dashboard/dispo/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
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

// Status-Katalog (P25 baut darauf den Monteur-Lebenszyklus auf)
const STATUS_OPTIONEN: { key: string; label: string }[] = [
  { key: 'geplant', label: 'Geplant' },
  { key: 'unterwegs', label: 'Unterwegs' },
  { key: 'vor_ort', label: 'Vor Ort' },
  { key: 'erledigt', label: 'Erledigt' },
  { key: 'abgesagt', label: 'Abgesagt' },
];
function statusInfo(s: string | null): { label: string; farbe: string } {
  switch (s ?? 'geplant') {
    case 'unterwegs': return { label: 'Unterwegs', farbe: C.cyan };
    case 'vor_ort':   return { label: 'Vor Ort', farbe: C.warn };
    case 'erledigt':  return { label: 'Erledigt', farbe: C.green };
    case 'abgesagt':  return { label: 'Abgesagt', farbe: C.danger };
    default:          return { label: 'Geplant', farbe: C.gold };
  }
}
function belegend(status: string | null): boolean {
  return (status ?? '').toLowerCase() !== 'abgesagt';
}

// Dauer eines Einsatzes in Stunden (0, wenn ohne/ungültige Zeiten)
function stundenAusEinsatz(e: { beginn_am: string | null; ende_am: string | null }): number {
  if (!e.beginn_am || !e.ende_am) return 0;
  const b = new Date(e.beginn_am).getTime();
  const en = new Date(e.ende_am).getTime();
  if (isNaN(b) || isNaN(en) || en <= b) return 0;
  return (en - b) / 3600000;
}
function fmtH(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
// Kapazitäts-Ampel: 🟢 <80% · 🟡 80–100% · 🔴 >100% (Tagesziel = Wochenstunden ÷ 5)
function ampelInfo(summe: number, ziel: number): { farbe: string; stufe: 'gruen' | 'gelb' | 'rot' } {
  const q = ziel > 0 ? summe / ziel : 0;
  if (q > 1.0) return { farbe: C.danger, stufe: 'rot' };
  if (q >= 0.8) return { farbe: C.warn, stufe: 'gelb' };
  return { farbe: C.green, stufe: 'gruen' };
}

// --- Datum/Zeit-Helfer (wie Termine-Seite) --------------------------------
function pad(n: number) { return n < 10 ? '0' + n : String(n); }
function isoTag(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function montagVon(d: Date): Date {
  const wd = d.getDay(); const diff = wd === 0 ? -6 : 1 - wd;
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), diff);
}
function uhr(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function baueZeitpunkt(datum: string, zeit: string): Date | null {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum.trim());
  const mz = /^(\d{1,2}):(\d{2})$/.exec(zeit.trim());
  if (!md || !mz) return null;
  const d = new Date(Number(md[1]), Number(md[2]) - 1, Number(md[3]), Number(mz[1]), Number(mz[2]), 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

type MitarbeiterRow = { id: string; vorname: string; nachname: string; position: string | null; status: string; wochenstunden: number | null };
type EinsatzRow = {
  id: string; mitarbeiter_id: string | null; termin_id: string | null; auftrag_id: string | null;
  titel: string | null; beschreibung: string | null; einsatzort: string | null;
  beginn_am: string | null; ende_am: string | null; status: string | null;
  kunde_name: string | null; kunde_email: string | null; kunde_telefon: string | null;
  rechnung_id: string | null;
};
type Form = {
  id: string | null; // null = neuer Einsatz
  titel: string; beschreibung: string; einsatzort: string;
  datum: string; von: string; bis: string;
  mitarbeiterId: string; status: string;
  kundeName: string; kundeEmail: string; kundeTelefon: string;
  rechnungId: string | null;
};

const WT_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export default function DispoPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const [monteure, setMonteure] = useState<MitarbeiterRow[]>([]);
  const [einsaetze, setEinsaetze] = useState<EinsatzRow[]>([]);
  const [wochenStart, setWochenStart] = useState<Date>(() => montagVon(new Date()));

  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [rechnungBusy, setRechnungBusy] = useState(false);
  const [rechnungErgebnis, setRechnungErgebnis] = useState<'neu' | 'bereits' | null>(null);

  const wochenEnde = useMemo(() => addDays(wochenStart, 6), [wochenStart]);

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
      const heute = isoTag(new Date());
      const [maRes, eiRes] = await Promise.all([
        supabase.from('mitarbeiter')
          .select('id, vorname, nachname, position, status, wochenstunden')
          .or(`austrittsdatum.is.null,austrittsdatum.gt.${heute}`)
          .order('nachname', { ascending: true }),
        supabase.from('einsaetze')
          .select('id, mitarbeiter_id, termin_id, auftrag_id, titel, beschreibung, einsatzort, beginn_am, ende_am, status, kunde_name, kunde_email, kunde_telefon, rechnung_id')
          .order('beginn_am', { ascending: true })
          .limit(1000),
      ]);
      if (maRes.error) throw maRes.error;
      if (eiRes.error) throw eiRes.error;
      setMonteure((maRes.data as MitarbeiterRow[]) ?? []);
      setEinsaetze((eiRes.data as EinsatzRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void laden_(); }, [laden_]);

  // Einsätze der Woche pro (Monteur, Tag) buckets: key = `${mid}__${datum}`
  const zelleMap = useMemo(() => {
    const m = new Map<string, EinsatzRow[]>();
    const von = isoTag(wochenStart); const bis = isoTag(wochenEnde);
    for (const e of einsaetze) {
      if (!e.mitarbeiter_id || !e.beginn_am) continue;
      const d = new Date(e.beginn_am);
      if (isNaN(d.getTime())) continue;
      const tag = isoTag(d);
      if (tag < von || tag > bis) continue;
      const key = `${e.mitarbeiter_id}__${tag}`;
      const arr = m.get(key) ?? []; arr.push(e); m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.beginn_am ?? '').localeCompare(b.beginn_am ?? ''));
    return m;
  }, [einsaetze, wochenStart, wochenEnde]);

  // Unzugeordnet: Einsätze ohne Monteur (alle, nicht abgesagt), nach Datum
  const unzugeordnet = useMemo(() => {
    return einsaetze
      .filter((e) => !e.mitarbeiter_id && belegend(e.status))
      .sort((a, b) => (a.beginn_am ?? '').localeCompare(b.beginn_am ?? ''));
  }, [einsaetze]);

  const tagesDaten = useMemo(() => {
    const arr: { datum: string; wt: string; label: string; heute: boolean }[] = [];
    const heute = isoTag(new Date());
    for (let i = 0; i < 7; i++) {
      const d = addDays(wochenStart, i);
      const datum = isoTag(d);
      arr.push({ datum, wt: WT_KURZ[d.getDay()], label: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`, heute: datum === heute });
    }
    return arr;
  }, [wochenStart]);

  const wochenTitel = `${isoTag(wochenStart).split('-').reverse().join('.')} – ${isoTag(wochenEnde).split('-').reverse().join('.')}`;

  // --- Modal öffnen ---------------------------------------------------------
  function neuerEinsatz(mid?: string, datum?: string) {
    setForm({
      id: null, titel: '', beschreibung: '', einsatzort: '',
      datum: datum ?? isoTag(new Date()), von: '08:00', bis: '10:00',
      mitarbeiterId: mid ?? '', status: 'geplant',
      kundeName: '', kundeEmail: '', kundeTelefon: '',
      rechnungId: null,
    });
    setErfolg(null); setRechnungErgebnis(null); setModalAuf(true);
  }
  function oeffneEinsatz(e: EinsatzRow) {
    const b = e.beginn_am ? new Date(e.beginn_am) : null;
    const en = e.ende_am ? new Date(e.ende_am) : null;
    setForm({
      id: e.id, titel: e.titel ?? '', beschreibung: e.beschreibung ?? '', einsatzort: e.einsatzort ?? '',
      datum: b ? isoTag(b) : isoTag(new Date()), von: b ? uhr(b) : '08:00', bis: en ? uhr(en) : '10:00',
      mitarbeiterId: e.mitarbeiter_id ?? '', status: e.status ?? 'geplant',
      kundeName: e.kunde_name ?? '', kundeEmail: e.kunde_email ?? '', kundeTelefon: e.kunde_telefon ?? '',
      rechnungId: e.rechnung_id ?? null,
    });
    setErfolg(null); setRechnungErgebnis(null); setModalAuf(true);
  }
  function setF<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  // --- Speichern (Insert/Update) -------------------------------------------
  async function speichern() {
    if (!uid || !form) return;
    const s = baueZeitpunkt(form.datum, form.von);
    const e = baueZeitpunkt(form.datum, form.bis);
    if (!s || !e || e <= s) { setFehler('Bitte gültige Zeiten wählen (Ende nach Start).'); return; }
    setSpeichert(true); setFehler(null); setErfolg(null);
    try {
      const daten = {
        mitarbeiter_id: form.mitarbeiterId || null,
        titel: form.titel.trim() || 'Einsatz',
        beschreibung: form.beschreibung.trim() || null,
        einsatzort: form.einsatzort.trim() || null,
        beginn_am: s.toISOString(), ende_am: e.toISOString(),
        status: form.status || 'geplant',
        kunde_name: form.kundeName.trim() || null,
        kunde_email: form.kundeEmail.trim() || null,
        kunde_telefon: form.kundeTelefon.trim() || null,
      };
      if (form.id) {
        const { error } = await supabase.from('einsaetze').update(daten).eq('id', form.id);
        if (error) throw error;
        setErfolg('Einsatz gespeichert.');
      } else {
        const { error } = await supabase.from('einsaetze').insert({ owner_user_id: uid, quelle: 'dispo', ...daten });
        if (error) throw error;
        setErfolg('Einsatz angelegt.');
      }
      setModalAuf(false); await laden_();
    } catch (err: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // --- Absagen (nicht-destruktiv, wie Termine) ------------------------------
  async function absagen() {
    if (!form?.id) return;
    if (!window.confirm(`Einsatz „${form.titel || 'Einsatz'}" absagen?\n\nEr bleibt erhalten, gibt Monteur & Zeitraum aber wieder frei.`)) return;
    setSpeichert(true); setFehler(null); setErfolg(null);
    try {
      const { error } = await supabase.from('einsaetze').update({ status: 'abgesagt' }).eq('id', form.id);
      if (error) throw error;
      setModalAuf(false); setErfolg('Einsatz abgesagt.'); await laden_();
    } catch (err: unknown) {
      setFehler('Absagen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // --- Brücke: Rechnung aus Einsatz erzeugen (Chef) -------------------------
  async function rechnungErstellen() {
    if (!form?.id) return;
    setRechnungBusy(true); setFehler(null); setErfolg(null);
    try {
      const resp = await fetch('/api/rechnung-aus-einsatz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ einsatzId: form.id }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error || 'Rechnung konnte nicht erstellt werden.');
      setRechnungErgebnis(j?.bereitsVorhanden ? 'bereits' : 'neu');
      setF('rechnungId', j?.rechnungId ?? null);
      await laden_();
    } catch (err: unknown) {
      setFehler('Rechnung fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setRechnungBusy(false); }
  }

  const gridCols = `minmax(130px, 0.85fr) repeat(7, minmax(0, 1fr))`;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Field Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Dispo-Board</h1>
          <p style={styles.sub}>Einsätze auf Monteure und Tage verteilen. Klick auf eine Kachel zum Ändern, „+" legt direkt für Monteur & Tag an.</p>
        </div>
        <button onClick={() => neuerEinsatz()} style={styles.primaerBtn}>+ Neuer Einsatz</button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {erfolg && <div style={styles.ok}>{erfolg}</div>}

      {/* ===== Wochen-Navigation ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <button style={styles.navBtn} onClick={() => setWochenStart(addDays(wochenStart, -7))}>‹</button>
        <button style={styles.ghostBtn} onClick={() => setWochenStart(montagVon(new Date()))}>Diese Woche</button>
        <button style={styles.navBtn} onClick={() => setWochenStart(addDays(wochenStart, 7))}>›</button>
        <span style={{ fontSize: 13, color: C.textDim, marginLeft: 6 }}>Woche: {wochenTitel}</span>
      </div>

      {/* ===== Unzugeordnet-Panel ===== */}
      <div style={styles.unzuCard}>
        <div style={styles.unzuKopf}>
          <span style={{ fontWeight: 700 }}>Unzugeordnet</span>
          <span style={{ color: C.textDim, fontSize: 12 }}>{unzugeordnet.length} Einsatz(e) ohne Monteur</span>
        </div>
        {unzugeordnet.length === 0 ? (
          <div style={styles.unzuLeer}>Alles verteilt. Neue Einsätze ohne Monteur erscheinen hier.</div>
        ) : (
          <div style={styles.unzuListe}>
            {unzugeordnet.map((e) => {
              const b = e.beginn_am ? new Date(e.beginn_am) : null;
              const si = statusInfo(e.status);
              return (
                <button key={e.id} onClick={() => oeffneEinsatz(e)} style={{ ...styles.chip, borderColor: si.farbe }}
                  title="Klicken zum Zuweisen / Bearbeiten">
                  <span style={{ fontWeight: 700 }}>{e.titel || 'Einsatz'}</span>
                  <span style={{ fontSize: 11, color: C.textDim }}>
                    {b ? `${WT_KURZ[b.getDay()]} ${pad(b.getDate())}.${pad(b.getMonth() + 1)}. · ${uhr(b)}` : 'ohne Datum'}
                    {e.kunde_name ? ` · ${e.kunde_name}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Board-Grid ===== */}
      <div style={styles.boardCard}>
        {laden ? <div style={styles.hint}>Lädt …</div> : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 860 }}>
              {/* Kopfzeile */}
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, marginBottom: 6 }}>
                <div style={styles.eckZelle}>Monteur</div>
                {tagesDaten.map((d) => (
                  <div key={d.datum} style={{ ...styles.kopfZelle, borderColor: d.heute ? C.gold : C.border }}>
                    <span style={{ fontWeight: 700 }}>{d.wt}</span>
                    <span style={{ color: C.textDim, fontSize: 11 }}>{d.label}</span>
                  </div>
                ))}
              </div>

              {/* Monteur-Zeilen */}
              {monteure.length === 0 ? (
                <div style={styles.hint}>Noch keine Mitarbeiter angelegt. Einsätze landen unter „Unzugeordnet", bis Monteure existieren.</div>
              ) : monteure.map((m) => {
                const woStd = m.wochenstunden ?? 0;
                const tagesziel = woStd > 0 ? woStd / 5 : 8;
                const wochenSumme = tagesDaten.reduce((s, d) => {
                  const l = (zelleMap.get(`${m.id}__${d.datum}`) ?? []).filter((e) => belegend(e.status));
                  return s + l.reduce((ss, e) => ss + stundenAusEinsatz(e), 0);
                }, 0);
                return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, marginBottom: 6 }}>
                  <div style={styles.nameZelle}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{m.vorname} {m.nachname}</span>
                    {m.position && <span style={{ color: C.textDim, fontSize: 11 }}>{m.position}</span>}
                    <span style={{ color: C.textDim, fontSize: 10.5, marginTop: 2 }}>Woche: {fmtH(wochenSumme)}h · Ziel {fmtH(tagesziel)}h/Tag</span>
                  </div>
                  {tagesDaten.map((d) => {
                    const liste = zelleMap.get(`${m.id}__${d.datum}`) ?? [];
                    const belegte = liste.filter((e) => belegend(e.status));
                    const summe = belegte.reduce((s, e) => s + stundenAusEinsatz(e), 0);
                    const zeigeAmpel = belegte.length > 0 && tagesziel > 0;
                    const am = ampelInfo(summe, tagesziel);
                    const rot = zeigeAmpel && am.stufe === 'rot';
                    return (
                      <div key={d.datum} style={{ ...styles.tagZelle, borderColor: rot ? C.danger : (d.heute ? 'rgba(201,168,76,0.4)' : C.border), background: rot ? 'rgba(224,102,102,0.07)' : C.navy }}>
                        {zeigeAmpel && (
                          <div style={styles.ampelZeile} title={`Auslastung: ${summe.toFixed(1)}h von ${tagesziel.toFixed(1)}h`}>
                            <span style={{ ...styles.ampelPunkt, background: am.farbe }} />
                            <span style={{ color: am.farbe, fontWeight: 700 }}>{fmtH(summe)}h</span>
                            <span style={{ color: C.textDim }}>/ {fmtH(tagesziel)}h</span>
                          </div>
                        )}
                        {liste.map((e) => {
                          const b = e.beginn_am ? new Date(e.beginn_am) : null;
                          const si = statusInfo(e.status);
                          const abg = !belegend(e.status);
                          return (
                            <button key={e.id} onClick={() => oeffneEinsatz(e)}
                              style={{ ...styles.einsatzKachel, borderColor: si.farbe, opacity: abg ? 0.5 : 1, textDecoration: abg ? 'line-through' : 'none' }}
                              title={`${e.titel ?? 'Einsatz'} · ${b ? uhr(b) : ''} · ${si.label}`}>
                              <span style={{ fontWeight: 700 }}>{b ? uhr(b) : '—'}</span>
                              <span style={{ fontSize: 10.5, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.titel ?? 'Einsatz'}</span>
                            </button>
                          );
                        })}
                        <button onClick={() => neuerEinsatz(m.id, d.datum)} style={styles.plusBtn} title="Einsatz für diesen Monteur & Tag anlegen">+</button>
                      </div>
                    );
                  })}
                </div>
                );
              })}
            </div>
          </div>
        )}
        <div style={styles.legende}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ ...styles.punkt, borderColor: C.gold }} /> Geplant</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}><span style={{ ...styles.punkt, borderColor: C.cyan }} /> Unterwegs</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}><span style={{ ...styles.punkt, borderColor: C.warn }} /> Vor Ort</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}><span style={{ ...styles.punkt, borderColor: C.green }} /> Erledigt</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}><span style={{ ...styles.punkt, borderColor: C.danger }} /> Abgesagt</span>
        </div>
        <div style={{ ...styles.legende, marginTop: 6 }}>
          Auslastung pro Tag:
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 10 }}><span style={{ ...styles.ampelPunkt, background: C.green }} /> locker (&lt;80%)</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}><span style={{ ...styles.ampelPunkt, background: C.warn }} /> voll (80–100%)</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}><span style={{ ...styles.ampelPunkt, background: C.danger }} /> überbucht (&gt;100%)</span>
        </div>
      </div>

      {/* ===== Einsatz-Modal (neu / bearbeiten) ===== */}
      {modalAuf && form && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
            <h2 style={styles.modalTitel}>{form.id ? 'Einsatz bearbeiten' : 'Neuer Einsatz'}</h2>
            <div style={styles.formGrid}>
              <Feld label="Titel" voll><input style={styles.input} value={form.titel} onChange={(e) => setF('titel', e.target.value)} placeholder="z. B. Wartung Heizung Meier / Baumfällung" /></Feld>
              <Feld label="Monteur">
                <select style={styles.input} value={form.mitarbeiterId} onChange={(e) => setF('mitarbeiterId', e.target.value)}>
                  <option value="">— Unzugeordnet —</option>
                  {monteure.map((m) => <option key={m.id} value={m.id}>{m.vorname} {m.nachname}</option>)}
                </select>
              </Feld>
              <Feld label="Status">
                <select style={styles.input} value={form.status} onChange={(e) => setF('status', e.target.value)}>
                  {STATUS_OPTIONEN.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Feld>
              <Feld label="Datum"><input type="date" style={styles.input} value={form.datum} onChange={(e) => setF('datum', e.target.value)} /></Feld>
              <Feld label="Von"><input type="time" style={styles.input} value={form.von} onChange={(e) => setF('von', e.target.value)} /></Feld>
              <Feld label="Bis"><input type="time" style={styles.input} value={form.bis} onChange={(e) => setF('bis', e.target.value)} /></Feld>
              <Feld label="Einsatzort" voll><input style={styles.input} value={form.einsatzort} onChange={(e) => setF('einsatzort', e.target.value)} placeholder="Adresse / Objekt vor Ort" /></Feld>
              <Feld label="Kunde"><input style={styles.input} value={form.kundeName} onChange={(e) => setF('kundeName', e.target.value)} /></Feld>
              <Feld label="Telefon"><input style={styles.input} value={form.kundeTelefon} onChange={(e) => setF('kundeTelefon', e.target.value)} /></Feld>
              <Feld label="E-Mail" voll><input style={styles.input} value={form.kundeEmail} onChange={(e) => setF('kundeEmail', e.target.value)} /></Feld>
              <Feld label="Beschreibung" voll><textarea style={{ ...styles.input, minHeight: 54, resize: 'vertical' }} value={form.beschreibung} onChange={(e) => setF('beschreibung', e.target.value)} placeholder="Was ist zu tun? Material, Hinweise …" /></Feld>
            </div>

            {form.id && (
              <div style={styles.rechnungBox}>
                {(form.rechnungId || rechnungErgebnis === 'bereits') ? (
                  <div style={styles.rechnungOk}>
                    <span>✅ Für diesen Einsatz existiert bereits eine Rechnung.</span>
                    <a href="/dashboard/rechnungen" style={styles.rechnungLink}>Zu den Rechnungen ›</a>
                  </div>
                ) : rechnungErgebnis === 'neu' ? (
                  <div style={styles.rechnungOk}>
                    <span>✅ Rechnung erstellt — die erfassten Leistungen wurden übernommen.</span>
                    <a href="/dashboard/rechnungen" style={styles.rechnungLink}>Zur Rechnung ›</a>
                  </div>
                ) : (
                  <button onClick={rechnungErstellen} disabled={rechnungBusy} style={{ ...styles.rechnungBtn, opacity: rechnungBusy ? 0.6 : 1 }}>
                    {rechnungBusy ? 'Erstellt Rechnung …' : '🧾 Rechnung aus Einsatz erstellen'}
                  </button>
                )}
              </div>
            )}

            <div style={styles.modalAktionen}>
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Schließen</button>
              {form.id && belegend(form.status) && (
                <button onClick={absagen} disabled={speichert} style={{ ...styles.ghostBtn, color: C.danger, borderColor: C.danger }}>Absagen</button>
              )}
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>{speichert ? 'Speichert …' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Feld({ label, children, voll }: { label: string; children: React.ReactNode; voll?: boolean }) {
  return (<div style={{ gridColumn: voll ? '1 / -1' : 'auto' }}><label style={styles.lbl}>{label}</label>{children}</div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 10px', fontSize: 14, maxWidth: 640, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  navBtn: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 13px', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' },

  unzuCard: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 14 },
  unzuKopf: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 },
  unzuLeer: { color: C.textDim, fontSize: 13 },
  unzuListe: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { background: C.navy, color: C.text, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 },

  boardCard: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 },
  eckZelle: { color: C.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', paddingLeft: 4 },
  kopfZelle: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  nameZelle: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' },
  tagZelle: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, minHeight: 66, display: 'flex', flexDirection: 'column', gap: 5 },
  ampelZeile: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, padding: '1px 2px 2px' },
  ampelPunkt: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  einsatzKachel: { background: 'rgba(201,168,76,0.10)', color: C.text, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '5px 7px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' },
  plusBtn: { background: 'transparent', color: C.textDim, border: `1px dashed ${C.border}`, borderRadius: 8, padding: '3px 0', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 },
  punkt: { width: 10, height: 10, borderRadius: 3, background: 'transparent', borderStyle: 'solid', borderWidth: 1, display: 'inline-block' },
  legende: { marginTop: 14, fontSize: 12, color: C.textDim },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '12px 0' },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '12px 0' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 580, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 16px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  rechnungBox: { marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 },
  rechnungBtn: { width: '100%', background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  rechnungOk: { display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', color: C.green, fontSize: 13.5 },
  rechnungLink: { color: C.cyan, fontWeight: 700, textDecoration: 'none' },
};
