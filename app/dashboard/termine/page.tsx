'use client';

// ============================================================
// ARGONAUT OS · Modul Termine · Seite (Schritt 19b)
// (1) Öffnungszeiten-Editor  (2) Freie-Slots-Kalender
// (3) Buchen scharf (Kapazitäts-Prüfung)
// (4) NEU: gebuchte Termine (goldene Kacheln) sind klickbar ->
//     anschauen · verschieben (Zeit ändern) · absagen (Status).
// Pfad: app/dashboard/termine/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { berechneSlots, type Slot, type VerfuegbarkeitRow, type TerminRow, type AbwesenheitRow, type TerminArt } from '../_components/slotLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const WOCHENTAGE: { wt: number; label: string; kurz: string }[] = [
  { wt: 1, label: 'Montag', kurz: 'Mo' }, { wt: 2, label: 'Dienstag', kurz: 'Di' },
  { wt: 3, label: 'Mittwoch', kurz: 'Mi' }, { wt: 4, label: 'Donnerstag', kurz: 'Do' },
  { wt: 5, label: 'Freitag', kurz: 'Fr' }, { wt: 6, label: 'Samstag', kurz: 'Sa' },
  { wt: 0, label: 'Sonntag', kurz: 'So' },
];

type VerfDbRow = {
  id: string; ebene: string | null; art: string | null; mitarbeiter_id: string | null;
  wochentag: number | null; datum_von: string | null; datum_bis: string | null;
  ganztags: boolean | null; von_uhrzeit: string | null; bis_uhrzeit: string | null;
  kapazitaet: number | null; ueberbuchung_erlaubt: boolean | null; aktiv: boolean | null; titel: string | null;
};
type TerminArtRow = {
  id: string; name: string; modus: string | null;
  dauer_minuten: number | null; dauer_min_minuten: number | null; dauer_max_minuten: number | null;
  std_pro_tag: number | null; puffer_minuten: number | null; kapazitaet: number | null;
  farbe: string | null; aktiv: boolean | null; sortierung: number | null;
};
type TerminDbRow = {
  id: string; mitarbeiter_id: string | null; beginn_am: string; ende_am: string; status: string | null;
  titel: string | null; kunde_name: string | null; kunde_email: string | null; notiz: string | null; termin_art_id: string | null;
};
type AbwDbRow = { mitarbeiter_id: string | null; von: string | null; bis: string | null; status: string | null };

type TagState = { id: string | null; aktiv: boolean; von: string; bis: string; kapazitaet: number; ueberbuchung: boolean };
function standardTag(wt: number): TagState {
  const werktag = wt >= 1 && wt <= 5;
  return { id: null, aktiv: werktag, von: '08:00', bis: '17:00', kapazitaet: 1, ueberbuchung: false };
}
function kuerzeZeit(z: string | null): string {
  if (!z) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(z);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

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
function belegend(status: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  return !(s === 'abgesagt' || s === 'storniert' || s === 'verschoben');
}

type BuchForm = { titel: string; kundeName: string; kundeEmail: string; notiz: string };
type BearbForm = { id: string; datum: string; von: string; bis: string; titel: string; kundeName: string; kundeEmail: string; notiz: string; status: string };

export default function TerminePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const [tage, setTage] = useState<Record<number, TagState>>(() => {
    const init: Record<number, TagState> = {};
    for (const w of WOCHENTAGE) init[w.wt] = standardTag(w.wt);
    return init;
  });

  const [verfAlle, setVerfAlle] = useState<VerfDbRow[]>([]);
  const [arten, setArten] = useState<TerminArtRow[]>([]);
  const [termine, setTermine] = useState<TerminDbRow[]>([]);
  const [abwesenheiten, setAbwesenheiten] = useState<AbwDbRow[]>([]);
  const [bundesland, setBundesland] = useState<string | null>(null);

  const [artId, setArtId] = useState<string>('');
  const [wochenStart, setWochenStart] = useState<Date>(() => montagVon(new Date()));

  // Buchen-Modal
  const [buchAuf, setBuchAuf] = useState(false);
  const [buchSlot, setBuchSlot] = useState<Slot | null>(null);
  const [buchForm, setBuchForm] = useState<BuchForm>({ titel: '', kundeName: '', kundeEmail: '', notiz: '' });

  // Bearbeiten-Modal (verschieben/absagen)
  const [bearbAuf, setBearbAuf] = useState(false);
  const [bearbForm, setBearbForm] = useState<BearbForm | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
    })();
  }, []);

  const wochenEnde = useMemo(() => addDays(wochenStart, 6), [wochenStart]);

  const laden_ = useCallback(async () => {
    if (!uid) return;
    setLaden(true); setFehler(null);
    try {
      const wStart = new Date(wochenStart.getFullYear(), wochenStart.getMonth(), wochenStart.getDate(), 0, 0, 0);
      const wEnde = new Date(wochenEnde.getFullYear(), wochenEnde.getMonth(), wochenEnde.getDate(), 23, 59, 59);

      const [verfRes, artRes, termRes, abwRes, einstRes] = await Promise.all([
        supabase.from('verfuegbarkeiten').select('id, ebene, art, mitarbeiter_id, wochentag, datum_von, datum_bis, ganztags, von_uhrzeit, bis_uhrzeit, kapazitaet, ueberbuchung_erlaubt, aktiv, titel'),
        supabase.from('termin_arten').select('id, name, modus, dauer_minuten, dauer_min_minuten, dauer_max_minuten, std_pro_tag, puffer_minuten, kapazitaet, farbe, aktiv, sortierung').eq('aktiv', true).order('sortierung', { ascending: true }),
        supabase.from('termine').select('id, mitarbeiter_id, beginn_am, ende_am, status, titel, kunde_name, kunde_email, notiz, termin_art_id').lte('beginn_am', wEnde.toISOString()).gte('ende_am', wStart.toISOString()),
        supabase.from('hr_abwesenheiten').select('mitarbeiter_id, von, bis, status'),
        supabase.from('hr_einstellungen').select('bundesland').limit(1),
      ]);
      if (verfRes.error) throw verfRes.error;
      if (artRes.error) throw artRes.error;
      if (termRes.error) throw termRes.error;

      const verf = (verfRes.data as VerfDbRow[]) ?? [];
      setVerfAlle(verf);
      const aList = (artRes.data as TerminArtRow[]) ?? [];
      setArten(aList);
      setTermine((termRes.data as TerminDbRow[]) ?? []);
      setAbwesenheiten(abwRes.error ? [] : ((abwRes.data as AbwDbRow[]) ?? []));
      setBundesland(einstRes.error ? null : ((einstRes.data?.[0]?.bundesland as string) ?? null));

      const next: Record<number, TagState> = {};
      for (const w of WOCHENTAGE) next[w.wt] = standardTag(w.wt);
      for (const r of verf) {
        if (r.ebene !== 'betrieb' || r.art !== 'regel' || r.wochentag == null) continue;
        if (next[r.wochentag]?.id) continue;
        next[r.wochentag] = {
          id: r.id, aktiv: r.aktiv !== false,
          von: kuerzeZeit(r.von_uhrzeit) || '08:00', bis: kuerzeZeit(r.bis_uhrzeit) || '17:00',
          kapazitaet: r.kapazitaet ?? 1, ueberbuchung: r.ueberbuchung_erlaubt === true,
        };
      }
      setTage(next);
      setArtId((cur) => (cur && aList.some((a) => a.id === cur) ? cur : (aList[0]?.id ?? '')));
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid, wochenStart, wochenEnde]);

  useEffect(() => { void laden_(); }, [laden_]);

  // --- Öffnungszeiten speichern ---------------------------------------------
  function setTag(wt: number, patch: Partial<TagState>) {
    setTage((t) => ({ ...t, [wt]: { ...t[wt], ...patch } }));
    setErfolg(null);
  }
  function zeitenGueltig(): boolean {
    for (const w of WOCHENTAGE) { const t = tage[w.wt]; if (t.aktiv && !(t.von < t.bis)) return false; }
    return true;
  }
  async function speichernZeiten() {
    if (!uid) return;
    if (!zeitenGueltig()) { setFehler('Bei aktiven Tagen muss „Bis" nach „Von" liegen.'); return; }
    const offen = WOCHENTAGE.filter((w) => tage[w.wt].aktiv).map((w) => w.kurz).join(', ') || 'keine';
    if (!window.confirm(`Öffnungszeiten speichern?\n\nOffene Tage: ${offen}`)) return;
    setSpeichert(true); setFehler(null); setErfolg(null);
    try {
      for (const w of WOCHENTAGE) {
        const t = tage[w.wt];
        if (t.id) {
          const { error } = await supabase.from('verfuegbarkeiten').update({
            von_uhrzeit: t.von, bis_uhrzeit: t.bis, kapazitaet: t.kapazitaet,
            ueberbuchung_erlaubt: t.ueberbuchung, aktiv: t.aktiv,
          }).eq('id', t.id);
          if (error) throw error;
        } else if (t.aktiv) {
          const { error } = await supabase.from('verfuegbarkeiten').insert({
            owner_user_id: uid, ebene: 'betrieb', art: 'regel', wochentag: w.wt,
            von_uhrzeit: t.von, bis_uhrzeit: t.bis, kapazitaet: t.kapazitaet,
            ueberbuchung_erlaubt: t.ueberbuchung, aktiv: true,
          });
          if (error) throw error;
        }
      }
      setErfolg('Öffnungszeiten gespeichert.');
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // --- Slot-Berechnung -------------------------------------------------------
  const aktiveArt = useMemo(() => arten.find((a) => a.id === artId) ?? null, [arten, artId]);

  const slotErgebnis = useMemo(() => {
    if (!aktiveArt) return null;
    const art: TerminArt = {
      modus: aktiveArt.modus, dauer_minuten: aktiveArt.dauer_minuten,
      dauer_min_minuten: aktiveArt.dauer_min_minuten, dauer_max_minuten: aktiveArt.dauer_max_minuten,
      std_pro_tag: aktiveArt.std_pro_tag, puffer_minuten: aktiveArt.puffer_minuten, kapazitaet: aktiveArt.kapazitaet,
    };
    return berechneSlots({
      von: isoTag(wochenStart), bis: isoTag(wochenEnde),
      verfuegbarkeiten: verfAlle as unknown as VerfuegbarkeitRow[],
      termine: termine as unknown as TerminRow[],
      abwesenheiten: abwesenheiten as unknown as AbwesenheitRow[],
      bundesland, art, mitarbeiterId: null, jetzt: new Date(),
    });
  }, [aktiveArt, wochenStart, wochenEnde, verfAlle, termine, abwesenheiten, bundesland]);

  const tageMap = useMemo(() => {
    const m = new Map<string, { buchbar: boolean; grund?: string; slots: Slot[] }>();
    if (slotErgebnis) for (const t of slotErgebnis.tage) m.set(t.datum, { buchbar: t.buchbar, grund: t.grund, slots: t.slots });
    return m;
  }, [slotErgebnis]);

  const termineNachTag = useMemo(() => {
    const m = new Map<string, TerminDbRow[]>();
    for (const t of termine) {
      if (!belegend(t.status)) continue;
      const d = new Date(t.beginn_am);
      if (isNaN(d.getTime())) continue;
      const key = isoTag(d);
      const arr = m.get(key) ?? []; arr.push(t); m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.beginn_am.localeCompare(b.beginn_am));
    return m;
  }, [termine]);

  // --- Buchen ----------------------------------------------------------------
  function slotKlick(slot: Slot) {
    if (!slot.frei || !aktiveArt) return;
    setBuchSlot(slot);
    setBuchForm({ titel: '', kundeName: '', kundeEmail: '', notiz: '' });
    setBuchAuf(true);
  }
  async function buchenScharf() {
    if (!uid || !buchSlot || !aktiveArt) return;
    const datumTxt = buchSlot.datum.split('-').reverse().join('.');
    if (!window.confirm(`Termin buchen?\n\n${aktiveArt.name}\n${datumTxt} · ${uhr(buchSlot.beginn)}–${uhr(buchSlot.ende)}`)) return;
    setSpeichert(true); setFehler(null); setErfolg(null);
    try {
      if (!buchSlot.ueberbuchung) {
        const { data: konf, error: kErr } = await supabase
          .from('termine').select('id, status')
          .lt('beginn_am', buchSlot.ende.toISOString()).gt('ende_am', buchSlot.beginn.toISOString());
        if (kErr) throw kErr;
        const belegt = ((konf as { id: string; status: string | null }[]) ?? []).filter((t) => belegend(t.status)).length;
        if (belegt >= buchSlot.kapazitaet) {
          setFehler('Dieser Slot ist inzwischen belegt. Bitte einen anderen Zeitpunkt wählen.');
          setBuchAuf(false); setSpeichert(false); await laden_(); return;
        }
      }
      const { error } = await supabase.from('termine').insert({
        owner_user_id: uid, termin_art_id: aktiveArt.id,
        beginn_am: buchSlot.beginn.toISOString(), ende_am: buchSlot.ende.toISOString(),
        titel: buchForm.titel.trim() || aktiveArt.name,
        kunde_name: buchForm.kundeName.trim() || null, kunde_email: buchForm.kundeEmail.trim() || null,
        notiz: buchForm.notiz.trim() || null, status: 'geplant', quelle: 'intern',
      });
      if (error) throw error;
      setBuchAuf(false); setErfolg('Termin gebucht.'); await laden_();
    } catch (e: unknown) {
      setFehler('Buchen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // --- Bearbeiten: anschauen / verschieben / absagen ------------------------
  function oeffneBearbeiten(t: TerminDbRow) {
    const b = new Date(t.beginn_am); const e = new Date(t.ende_am);
    setBearbForm({
      id: t.id, datum: isoTag(b), von: uhr(b), bis: uhr(e),
      titel: t.titel ?? '', kundeName: t.kunde_name ?? '', kundeEmail: t.kunde_email ?? '',
      notiz: t.notiz ?? '', status: t.status ?? 'geplant',
    });
    setBearbAuf(true);
  }
  function setBearb<K extends keyof BearbForm>(k: K, v: BearbForm[K]) {
    setBearbForm((f) => (f ? { ...f, [k]: v } : f));
  }
  async function terminSpeichern() {
    if (!uid || !bearbForm) return;
    const s = baueZeitpunkt(bearbForm.datum, bearbForm.von);
    const e = baueZeitpunkt(bearbForm.datum, bearbForm.bis);
    if (!s || !e || e <= s) { setFehler('Bitte gültige Zeiten wählen (Ende nach Start).'); return; }
    setSpeichert(true); setFehler(null); setErfolg(null);
    try {
      // Soft-Konflikt: andere aktive Termine im neuen Zeitraum (Warnung, keine harte Sperre)
      const { data: konf } = await supabase.from('termine')
        .select('id, status').lt('beginn_am', e.toISOString()).gt('ende_am', s.toISOString()).neq('id', bearbForm.id);
      const konflikte = ((konf as { id: string; status: string | null }[]) ?? []).filter((x) => belegend(x.status));
      if (konflikte.length > 0 && !window.confirm(`Im gewählten Zeitraum liegen bereits ${konflikte.length} Termin(e). Trotzdem verschieben?`)) {
        setSpeichert(false); return;
      }
      const { error } = await supabase.from('termine').update({
        beginn_am: s.toISOString(), ende_am: e.toISOString(),
        titel: bearbForm.titel.trim() || 'Termin',
        kunde_name: bearbForm.kundeName.trim() || null, kunde_email: bearbForm.kundeEmail.trim() || null,
        notiz: bearbForm.notiz.trim() || null,
      }).eq('id', bearbForm.id);
      if (error) throw error;
      setBearbAuf(false); setErfolg('Termin gespeichert.'); await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }
  async function terminAbsagen() {
    if (!bearbForm) return;
    if (!window.confirm(`Termin „${bearbForm.titel || 'Termin'}" absagen?\n\nEr bleibt erhalten, gibt den Zeitraum aber wieder frei.`)) return;
    setSpeichert(true); setFehler(null); setErfolg(null);
    try {
      const { error } = await supabase.from('termine').update({ status: 'abgesagt' }).eq('id', bearbForm.id);
      if (error) throw error;
      setBearbAuf(false); setErfolg('Termin abgesagt.'); await laden_();
    } catch (e: unknown) {
      setFehler('Absagen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  const wochenTitel = `${isoTag(wochenStart).split('-').reverse().join('.')} – ${isoTag(wochenEnde).split('-').reverse().join('.')}`;
  const tagesDaten = useMemo(() => {
    const arr: { datum: string; label: string; wtLabel: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(wochenStart, i);
      arr.push({ datum: isoTag(d), label: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`, wtLabel: ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()] });
    }
    return arr;
  }, [wochenStart]);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Termine</div>
      <h1 style={styles.h1}>Terminplanung</h1>
      <p style={styles.sub}>
        Öffnungszeiten festlegen, dann freie Slots buchen. Feiertage, Urlaub und bereits
        gebuchte Termine werden automatisch abgezogen.
      </p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {erfolg && <div style={styles.ok}>{erfolg}</div>}

      {/* ===== Öffnungszeiten-Editor ===== */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Öffnungszeiten (Betrieb)</h2>
        {laden ? <div style={styles.hint}>Lädt …</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ ...styles.zeile, color: C.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
              <div style={styles.zTag}>Tag</div><div style={styles.zAktiv}>Offen</div><div style={styles.zZeit}>Von</div>
              <div style={styles.zZeit}>Bis</div><div style={styles.zKap}>Parallel</div><div style={styles.zUeber}>Überbuchung</div>
            </div>
            {WOCHENTAGE.map((w) => {
              const t = tage[w.wt]; const ungueltig = t.aktiv && !(t.von < t.bis);
              return (
                <div key={w.wt} style={{ ...styles.zeile, opacity: t.aktiv ? 1 : 0.55 }}>
                  <div style={styles.zTag}>{w.label}</div>
                  <div style={styles.zAktiv}><input type="checkbox" checked={t.aktiv} onChange={(e) => setTag(w.wt, { aktiv: e.target.checked })} /></div>
                  <div style={styles.zZeit}><input type="time" disabled={!t.aktiv} value={t.von} onChange={(e) => setTag(w.wt, { von: e.target.value })} style={{ ...styles.input, borderColor: ungueltig ? C.danger : C.border }} /></div>
                  <div style={styles.zZeit}><input type="time" disabled={!t.aktiv} value={t.bis} onChange={(e) => setTag(w.wt, { bis: e.target.value })} style={{ ...styles.input, borderColor: ungueltig ? C.danger : C.border }} /></div>
                  <div style={styles.zKap}><input type="number" min={1} disabled={!t.aktiv} value={t.kapazitaet} onChange={(e) => setTag(w.wt, { kapazitaet: Math.max(1, Number(e.target.value) || 1) })} style={styles.input} /></div>
                  <div style={styles.zUeber}><input type="checkbox" disabled={!t.aktiv} checked={t.ueberbuchung} onChange={(e) => setTag(w.wt, { ueberbuchung: e.target.checked })} /></div>
                </div>
              );
            })}
          </div>
        )}
        <div style={styles.legende}>
          <b>Parallel</b> = wie viele Termine im selben Zeitfenster möglich sind (z. B. mehrere Monteure).
          <b> Überbuchung</b> = erlaubt beliebig viele Termine gleichzeitig, ohne harte Grenze.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={speichernZeiten} disabled={speichert || laden} style={{ ...styles.primaerBtn, opacity: (speichert || laden) ? 0.6 : 1 }}>
            {speichert ? 'Speichert …' : 'Öffnungszeiten speichern'}
          </button>
        </div>
      </div>

      {/* ===== Slot-Kalender ===== */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
          <h2 style={{ ...styles.cardTitle, margin: 0 }}>Freie Termine</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: C.textDim }}>Termin-Art:</label>
            <select value={artId} onChange={(e) => setArtId(e.target.value)} style={{ ...styles.input, width: 'auto', minWidth: 190 }}>
              {arten.length === 0 && <option value="">— keine Arten —</option>}
              {arten.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={styles.navBtn} onClick={() => setWochenStart(addDays(wochenStart, -7))}>‹</button>
              <button style={styles.ghostBtn} onClick={() => setWochenStart(montagVon(new Date()))}>Diese Woche</button>
              <button style={styles.navBtn} onClick={() => setWochenStart(addDays(wochenStart, 7))}>›</button>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>Woche: {wochenTitel}</div>

        {slotErgebnis?.hinweis ? (
          <div style={styles.mehrtag}>{slotErgebnis.hinweis}</div>
        ) : (
          <div style={styles.kalenderGrid}>
            {tagesDaten.map((d) => {
              const info = tageMap.get(d.datum);
              const freie = (info?.slots ?? []).filter((s) => s.frei);
              const gebucht = termineNachTag.get(d.datum) ?? [];
              const heute = d.datum === isoTag(new Date());
              return (
                <div key={d.datum} style={{ ...styles.tagSpalte, borderColor: heute ? C.gold : C.border }}>
                  <div style={styles.tagKopf}>
                    <span style={{ fontWeight: 700 }}>{d.wtLabel}</span>
                    <span style={{ color: C.textDim, fontSize: 12 }}>{d.label}</span>
                  </div>
                  <div style={styles.tagBody}>
                    {gebucht.map((t) => {
                      const b = new Date(t.beginn_am); const e = new Date(t.ende_am);
                      return (
                        <button key={t.id} onClick={() => oeffneBearbeiten(t)} style={styles.buchtBlock} title={`${t.titel ?? 'Termin'} · ${uhr(b)}–${uhr(e)} · zum Anschauen/Ändern klicken`}>
                          <span style={{ fontWeight: 700 }}>{uhr(b)}</span>
                          <span style={{ fontSize: 10.5, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titel ?? 'Termin'}</span>
                        </button>
                      );
                    })}
                    {laden ? <span style={styles.tagLeer}>…</span>
                      : !info?.buchbar ? <span style={styles.tagBlock}>{info?.grund ?? 'geschlossen'}</span>
                      : freie.length === 0 && gebucht.length === 0 ? <span style={styles.tagLeer}>ausgebucht</span>
                      : freie.map((s, i) => {
                        const zeigeKap = s.kapazitaet > 1;
                        return (
                          <button key={i} onClick={() => slotKlick(s)} style={styles.slotBtn}
                            title={`${uhr(s.beginn)}–${uhr(s.ende)}${zeigeKap ? ` · ${s.belegt}/${s.kapazitaet} belegt` : ''}`}>
                            <span style={{ fontWeight: 700 }}>{uhr(s.beginn)}</span>
                            {zeigeKap && <span style={{ fontSize: 10.5, color: C.textDim }}>{s.kapazitaet - s.belegt} frei</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={styles.legende2}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={styles.punktGruen} /> frei / buchbar</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 16 }}><span style={styles.punktGold} /> gebucht (klicken zum Ändern)</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 16 }}><span style={styles.punktGrau} /> geschlossen · Feiertag · gesperrt</span>
        </div>
      </div>

      {/* ===== Buch-Modal ===== */}
      {buchAuf && buchSlot && (
        <div style={styles.overlay} onClick={() => !speichert && setBuchAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>Termin buchen</h2>
            <div style={styles.buchKopf}>
              <div><b>{aktiveArt?.name}</b></div>
              <div style={{ color: C.textDim, fontSize: 14 }}>{buchSlot.datum.split('-').reverse().join('.')} · {uhr(buchSlot.beginn)}–{uhr(buchSlot.ende)}</div>
            </div>
            <div style={styles.formGrid}>
              <Feld label="Titel" voll><input style={styles.input} value={buchForm.titel} onChange={(e) => setBuchForm({ ...buchForm, titel: e.target.value })} placeholder="z. B. Ölwechsel Meier / Erstberatung" /></Feld>
              <Feld label="Kunde"><input style={styles.input} value={buchForm.kundeName} onChange={(e) => setBuchForm({ ...buchForm, kundeName: e.target.value })} /></Feld>
              <Feld label="E-Mail (für Bestätigung)"><input style={styles.input} value={buchForm.kundeEmail} onChange={(e) => setBuchForm({ ...buchForm, kundeEmail: e.target.value })} /></Feld>
              <Feld label="Notiz" voll><textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={buchForm.notiz} onChange={(e) => setBuchForm({ ...buchForm, notiz: e.target.value })} /></Feld>
            </div>
            <div style={styles.modalAktionen}>
              <button onClick={() => setBuchAuf(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={buchenScharf} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>{speichert ? 'Bucht …' : 'Buchen'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Bearbeiten-Modal (verschieben/absagen) ===== */}
      {bearbAuf && bearbForm && (
        <div style={styles.overlay} onClick={() => !speichert && setBearbAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>Termin bearbeiten</h2>
            <div style={styles.formGrid}>
              <Feld label="Titel" voll><input style={styles.input} value={bearbForm.titel} onChange={(e) => setBearb('titel', e.target.value)} /></Feld>
              <Feld label="Datum"><input type="date" style={styles.input} value={bearbForm.datum} onChange={(e) => setBearb('datum', e.target.value)} /></Feld>
              <Feld label="Status"><input style={{ ...styles.input, opacity: 0.7 }} value={bearbForm.status} disabled /></Feld>
              <Feld label="Von (Uhrzeit)"><input type="time" style={styles.input} value={bearbForm.von} onChange={(e) => setBearb('von', e.target.value)} /></Feld>
              <Feld label="Bis (Uhrzeit)"><input type="time" style={styles.input} value={bearbForm.bis} onChange={(e) => setBearb('bis', e.target.value)} /></Feld>
              <Feld label="Kunde"><input style={styles.input} value={bearbForm.kundeName} onChange={(e) => setBearb('kundeName', e.target.value)} /></Feld>
              <Feld label="E-Mail"><input style={styles.input} value={bearbForm.kundeEmail} onChange={(e) => setBearb('kundeEmail', e.target.value)} /></Feld>
              <Feld label="Notiz" voll><textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={bearbForm.notiz} onChange={(e) => setBearb('notiz', e.target.value)} /></Feld>
            </div>
            <div style={styles.hinweisZeile}>Datum/Uhrzeit ändern = Termin verschieben. „Absagen" gibt den Zeitraum wieder frei.</div>
            <div style={styles.modalAktionen}>
              <button onClick={() => setBearbAuf(false)} disabled={speichert} style={styles.ghostBtn}>Schließen</button>
              <button onClick={terminAbsagen} disabled={speichert} style={{ ...styles.ghostBtn, color: C.danger, borderColor: C.danger }}>Absagen</button>
              <button onClick={terminSpeichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>{speichert ? 'Speichert …' : 'Speichern'}</button>
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
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 680, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  navBtn: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 13px', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, margin: '0 0 16px', color: C.text },

  zeile: { display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 1fr 1fr 0.9fr 1fr', alignItems: 'center', gap: 10, padding: '4px 0' },
  zTag: { fontWeight: 600, fontSize: 14 }, zAktiv: { textAlign: 'center' }, zZeit: {}, zKap: {}, zUeber: { textAlign: 'center' },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  legende: { marginTop: 16, fontSize: 12.5, color: C.textDim, lineHeight: 1.6, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' },

  kalenderGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 },
  tagSpalte: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 8, minHeight: 180, display: 'flex', flexDirection: 'column' },
  tagKopf: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', paddingBottom: 8, borderBottom: `1px solid ${C.border}`, marginBottom: 8 },
  tagBody: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' },
  slotBtn: { background: 'rgba(76,175,125,0.14)', color: C.text, border: `1px solid ${C.green}`, borderRadius: 8, padding: '6px 4px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  buchtBlock: { background: 'rgba(201,168,76,0.16)', color: C.text, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '6px 8px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' },
  tagBlock: { color: C.textDim, fontSize: 11.5, textAlign: 'center', padding: '10px 2px', lineHeight: 1.35 },
  tagLeer: { color: C.textDim, fontSize: 12, textAlign: 'center', padding: '10px 2px' },
  legende2: { marginTop: 14, fontSize: 12, color: C.textDim },
  punktGruen: { width: 10, height: 10, borderRadius: 3, background: 'rgba(76,175,125,0.5)', border: `1px solid ${C.green}`, display: 'inline-block' },
  punktGold: { width: 10, height: 10, borderRadius: 3, background: 'rgba(201,168,76,0.4)', border: `1px solid ${C.gold}`, display: 'inline-block' },
  punktGrau: { width: 10, height: 10, borderRadius: 3, background: C.navy, border: `1px solid ${C.border}`, display: 'inline-block' },
  mehrtag: { color: C.warn, fontSize: 14, background: 'rgba(224,162,76,0.1)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '14px 16px', lineHeight: 1.5 },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 560, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 14px', color: C.text },
  buchKopf: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 3 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  hinweisZeile: { marginTop: 14, fontSize: 12.5, color: C.textDim, lineHeight: 1.5 },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' },
};
