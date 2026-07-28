'use client';

// ============================================================
// ARGONAUT OS · Teil C · Singleton #1 · BDE / MDE — Betriebsdatenerfassung
// Maschinen-Register + Schicht-/Auftragsbuchungen + Störgründe → OEE live
// (Verfügbarkeit × Leistung × Qualität, VDMA 66412-1). Reine Formeln aus
// lib/bde (0 €, node-getestet). Pfad: app/dashboard/bde/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  STOER_KATALOG, kategorieLabel, kennzahlBuchung, stoerungNachKategorie, zaehleBde,
  type BuchungLite, type StoerungLite,
} from '@/lib/bde';
import { augeBde } from '@/lib/auge';
import { bdePdf } from '@/lib/bdePdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Maschine = { id: string; bezeichnung: string; maschinen_nr: string | null; standort: string | null; ideal_takt_sek: number; status: string; notiz: string | null };
type Buchung = { id: string; maschine_id: string; datum: string | null; auftrag: string | null; schicht: string | null; bediener: string | null; planbelegung_min: number; menge_gesamt: number; menge_gut: number; ideal_takt_sek: number; status: string; notiz: string | null };
type Stoerung = { id: string; buchung_id: string; kategorie: string; grund: string | null; dauer_min: number };

const SCHICHTEN = ['Früh', 'Spät', 'Nacht', 'Tag'];
const M_STATUS = [{ v: 'aktiv', l: 'aktiv' }, { v: 'wartung', l: 'in Wartung' }, { v: 'ausgemustert', l: 'ausgemustert' }];

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function pct(n: number) { return `${(Number(n) * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`; }
function stdVon(min: number) { return (min / 60).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function minMitStd(min: number) { return `${Math.round(min)} min (${stdVon(min)} h)`; }
function oeeFarbe(o: number) { return o >= 0.85 ? C.green : o >= 0.6 ? C.gold : C.danger; }

export default function BdePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [tab, setTab] = useState<'buchungen' | 'maschinen'>('buchungen');
  const [maschinen, setMaschinen] = useState<Maschine[]>([]);
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [stoerungen, setStoerungen] = useState<Stoerung[]>([]);
  const [filterMaschine, setFilterMaschine] = useState<string>('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [nMasch, setNMasch] = useState({ bezeichnung: '', maschinen_nr: '', standort: '', ideal_takt_sek: '', status: 'aktiv' });
  const [nBuch, setNBuch] = useState({ maschine_id: '', datum: heuteLokal(), auftrag: '', schicht: 'Früh', bediener: '', planbelegung_min: '', menge_gesamt: '', menge_gut: '', ideal_takt_sek: '' });
  const [nStoer, setNStoer] = useState<{ buchung_id: string; kategorie: string; grund: string; dauer_min: string } | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [m, b, s] = await Promise.all([
        supabase.from('bde_maschine').select('*').order('bezeichnung', { ascending: true }),
        supabase.from('bde_buchung').select('*').order('datum', { ascending: false }),
        supabase.from('bde_stoerung').select('*'),
      ]);
      setMaschinen((m.data as Maschine[]) ?? []);
      setBuchungen((b.data as Buchung[]) ?? []);
      setStoerungen((s.data as Stoerung[]) ?? []);
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const firma = [meta.firmenname, meta.firma, meta.unternehmen, meta.name].find((x) => typeof x === 'string' && (x as string).trim());
      setAussteller(typeof firma === 'string' ? firma : '');
      await laden_();
    })();
  }, [laden_]);

  // Störzeit je Buchung
  const stzMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stoerungen) map.set(s.buchung_id, (map.get(s.buchung_id) || 0) + (Number(s.dauer_min) || 0));
    return map;
  }, [stoerungen]);
  const stoerProBuchung = useMemo(() => {
    const map = new Map<string, Stoerung[]>();
    for (const s of stoerungen) { const a = map.get(s.buchung_id) || []; a.push(s); map.set(s.buchung_id, a); }
    return map;
  }, [stoerungen]);

  const sichtbareBuchungen = useMemo(
    () => (filterMaschine ? buchungen.filter((b) => b.maschine_id === filterMaschine) : buchungen),
    [buchungen, filterMaschine]
  );
  const kennzahlen = useMemo(
    () => zaehleBde(maschinen, sichtbareBuchungen as BuchungLite[], stoerungen.filter((s) => sichtbareBuchungen.some((b) => b.id === s.buchung_id)) as StoerungLite[]),
    [maschinen, sichtbareBuchungen, stoerungen]
  );
  const maschineVon = useCallback((id: string) => maschinen.find((m) => m.id === id) || null, [maschinen]);

  // --- Live-Vorschau Neue Buchung ---
  const vorschau = useMemo(() => kennzahlBuchung({
    planbelegung_min: num(nBuch.planbelegung_min), menge_gesamt: num(nBuch.menge_gesamt),
    menge_gut: num(nBuch.menge_gut), ideal_takt_sek: num(nBuch.ideal_takt_sek),
  }, 0), [nBuch]);

  async function maschineAnlegen() {
    if (!uid || !nMasch.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('masch'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('bde_maschine').insert({
        owner_user_id: uid, bezeichnung: nMasch.bezeichnung.trim(), maschinen_nr: nMasch.maschinen_nr.trim() || null,
        standort: nMasch.standort.trim() || null, ideal_takt_sek: num(nMasch.ideal_takt_sek), status: nMasch.status,
      });
      if (error) throw error;
      setNMasch({ bezeichnung: '', maschinen_nr: '', standort: '', ideal_takt_sek: '', status: 'aktiv' });
      setOk('Maschine angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function buchungAnlegen() {
    if (!uid || !nBuch.maschine_id) { setFehler('Bitte eine Maschine wählen.'); return; }
    if (num(nBuch.planbelegung_min) <= 0) { setFehler('Bitte die Planbelegungszeit (Minuten) angeben.'); return; }
    setBusy('buch'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('bde_buchung').insert({
        owner_user_id: uid, maschine_id: nBuch.maschine_id, datum: nBuch.datum || null, auftrag: nBuch.auftrag.trim() || null,
        schicht: nBuch.schicht || null, bediener: nBuch.bediener.trim() || null,
        planbelegung_min: Math.round(num(nBuch.planbelegung_min)), menge_gesamt: num(nBuch.menge_gesamt),
        menge_gut: num(nBuch.menge_gut), ideal_takt_sek: num(nBuch.ideal_takt_sek), status: 'offen',
      });
      if (error) throw error;
      setNBuch((v) => ({ ...v, auftrag: '', bediener: '', planbelegung_min: '', menge_gesamt: '', menge_gut: '' }));
      setOk('Buchung angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function stoerungSpeichern() {
    if (!uid || !nStoer) return;
    if (num(nStoer.dauer_min) <= 0) { setFehler('Bitte eine Dauer (Minuten) angeben.'); return; }
    setBusy('stoer'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('bde_stoerung').insert({
        owner_user_id: uid, buchung_id: nStoer.buchung_id, kategorie: nStoer.kategorie,
        grund: nStoer.grund.trim() || null, dauer_min: Math.round(num(nStoer.dauer_min)),
      });
      if (error) throw error;
      setNStoer(null); setOk('Störung erfasst.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function statusUmschalten(b: Buchung) {
    setBusy(b.id); setFehler(null);
    try {
      await supabase.from('bde_buchung').update({ status: b.status === 'abgeschlossen' ? 'offen' : 'abgeschlossen' }).eq('id', b.id);
      await laden_();
    } catch (err: unknown) { setFehler('Fehler: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function loesche(tabelle: string, id: string) {
    setBusy(id); setFehler(null);
    try { await supabase.from(tabelle).delete().eq('id', id); await laden_(); }
    catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function druckePdf(b: Buchung) {
    const st = stoerProBuchung.get(b.id) || [];
    const k = kennzahlBuchung(b as BuchungLite, stzMap.get(b.id) || 0);
    const m = maschineVon(b.maschine_id);
    bdePdf({
      aussteller: aussteller || 'Mein Betrieb',
      maschine: m?.bezeichnung || 'Maschine',
      maschinenNr: m?.maschinen_nr || '',
      auftrag: b.auftrag || '',
      datum: fmtDatum(b.datum),
      schicht: b.schicht || '',
      bediener: b.bediener || '',
      planbelegung: minMitStd(k.planbelegung_min),
      stoerzeit: minMitStd(k.stoerzeit_min),
      laufzeit: minMitStd(k.laufzeit_min),
      mengeGesamt: `${k.menge_gesamt} Stk`,
      mengeGut: `${k.menge_gut} Stk`,
      ausschuss: `${k.ausschuss} Stk`,
      verfuegbarkeit: pct(k.verfuegbarkeit),
      leistung: pct(k.leistung),
      qualitaet: pct(k.qualitaet),
      oee: pct(k.oee),
      leistungHinweis: k.leistungRoh > 1 ? `Hinweis: Roh-Leistung ${pct(k.leistungRoh)} — schneller als der Idealtakt gefahren, Takt/Menge prüfen (für OEE auf 100 % begrenzt).` : undefined,
      stoerungen: st.map((s) => ({ kategorie: kategorieLabel(s.kategorie), grund: s.grund || '', dauer: `${s.dauer_min} min` })),
    });
  }

  const katVon = (key: string) => STOER_KATALOG.find((k) => k.key === key) || STOER_KATALOG[0];

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Fertigung</div>
      <h1 style={styles.h1}>📟 BDE / MDE — Betriebsdatenerfassung</h1>
      <p style={styles.sub}>Maschinenzeiten, Aufträge und Störgründe erfassen — die Anlage rechnet daraus live die OEE (Gesamtanlageneffektivität = Verfügbarkeit × Leistung × Qualität, VDMA 66412-1). Je Buchung ein Schichtbericht als PDF.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* KPIs */}
      <div style={styles.kpis}>
        <Kpi label="OEE (gesamt)" value={pct(kennzahlen.oee)} accent={oeeFarbe(kennzahlen.oee)} />
        <Kpi label="Verfügbarkeit" value={pct(kennzahlen.verfuegbarkeit)} accent={C.cyan} />
        <Kpi label="Leistung" value={pct(kennzahlen.leistung)} accent={C.cyan} />
        <Kpi label="Qualität" value={pct(kennzahlen.qualitaet)} accent={C.cyan} />
        <Kpi label="Offene Buchungen" value={String(kennzahlen.offene)} accent={kennzahlen.offene ? C.warn : C.green} />
        <Kpi label="Top-Störgrund" value={kennzahlen.topStoerLabel ? `${Math.round(kennzahlen.topStoerMin)} min` : '—'} accent={C.gold} sub={kennzahlen.topStoerLabel || 'keine Störung'} />
      </div>
      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="BDE / MDE" regel={augeBde(kennzahlen)} /></div>}

      {/* Tabs */}
      <div style={styles.tabs}>
        <button style={tab === 'buchungen' ? styles.tabAktiv : styles.tab} onClick={() => setTab('buchungen')}>Buchungen &amp; OEE</button>
        <button style={tab === 'maschinen' ? styles.tabAktiv : styles.tab} onClick={() => setTab('maschinen')}>Maschinen</button>
      </div>

      {tab === 'maschinen' && (
        <div style={styles.card}>
          <div style={styles.cardTitel}>Maschine anlegen</div>
          <div style={styles.grid}>
            <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={nMasch.bezeichnung} onChange={(e) => setNMasch({ ...nMasch, bezeichnung: e.target.value })} placeholder="z. B. CNC-Fräse 1" /></label>
            <label style={styles.lab}>Maschinen-Nr.<input style={styles.inp} value={nMasch.maschinen_nr} onChange={(e) => setNMasch({ ...nMasch, maschinen_nr: e.target.value })} /></label>
            <label style={styles.lab}>Standort<input style={styles.inp} value={nMasch.standort} onChange={(e) => setNMasch({ ...nMasch, standort: e.target.value })} placeholder="Halle / Linie" /></label>
            <label style={styles.lab}>Idealtakt (Sek./Teil)<input style={styles.inp} inputMode="decimal" value={nMasch.ideal_takt_sek} onChange={(e) => setNMasch({ ...nMasch, ideal_takt_sek: e.target.value })} placeholder="z. B. 60" /></label>
            <label style={styles.lab}>Status
              <select style={styles.inp} value={nMasch.status} onChange={(e) => setNMasch({ ...nMasch, status: e.target.value })}>
                {M_STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </label>
          </div>
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'masch' ? 0.6 : 1 }} disabled={busy === 'masch'} onClick={maschineAnlegen}>＋ Maschine</button>

          {maschinen.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {maschinen.map((m) => (
                <div key={m.id} style={styles.zeile}>
                  <span>{m.bezeichnung}{m.maschinen_nr ? ` · ${m.maschinen_nr}` : ''} <span style={{ color: C.textDim }}>· Takt {m.ideal_takt_sek || 0} s{m.standort ? ` · ${m.standort}` : ''} · {m.status}</span></span>
                  <button style={styles.miniX} disabled={busy === m.id} onClick={() => loesche('bde_maschine', m.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'buchungen' && (
        <>
          {/* Neue Buchung */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>Neue Buchung (Schicht / Auftrag)</div>
            {maschinen.length === 0 ? (
              <div style={styles.hint}>Leg zuerst eine Maschine im Reiter „Maschinen" an.</div>
            ) : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Maschine
                    <select style={styles.inp} value={nBuch.maschine_id} onChange={(e) => { const m = maschineVon(e.target.value); setNBuch({ ...nBuch, maschine_id: e.target.value, ideal_takt_sek: m ? String(m.ideal_takt_sek || '') : nBuch.ideal_takt_sek }); }}>
                      <option value="">— wählen —</option>
                      {maschinen.map((m) => <option key={m.id} value={m.id}>{m.bezeichnung}{m.maschinen_nr ? ` (${m.maschinen_nr})` : ''}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nBuch.datum} onChange={(e) => setNBuch({ ...nBuch, datum: e.target.value })} /></label>
                  <label style={styles.lab}>Auftrag<input style={styles.inp} value={nBuch.auftrag} onChange={(e) => setNBuch({ ...nBuch, auftrag: e.target.value })} placeholder="Auftrags-/Los-Nr." /></label>
                  <label style={styles.lab}>Schicht
                    <select style={styles.inp} value={nBuch.schicht} onChange={(e) => setNBuch({ ...nBuch, schicht: e.target.value })}>
                      {SCHICHTEN.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Bediener<input style={styles.inp} value={nBuch.bediener} onChange={(e) => setNBuch({ ...nBuch, bediener: e.target.value })} /></label>
                  <label style={styles.lab}>Planbelegung (Min.)<input style={styles.inp} inputMode="numeric" value={nBuch.planbelegung_min} onChange={(e) => setNBuch({ ...nBuch, planbelegung_min: e.target.value })} placeholder="z. B. 480" /></label>
                  <label style={styles.lab}>Idealtakt (Sek./Teil)<input style={styles.inp} inputMode="decimal" value={nBuch.ideal_takt_sek} onChange={(e) => setNBuch({ ...nBuch, ideal_takt_sek: e.target.value })} /></label>
                  <label style={styles.lab}>Menge gesamt (Stk)<input style={styles.inp} inputMode="numeric" value={nBuch.menge_gesamt} onChange={(e) => setNBuch({ ...nBuch, menge_gesamt: e.target.value })} /></label>
                  <label style={styles.lab}>davon Gutmenge (Stk)<input style={styles.inp} inputMode="numeric" value={nBuch.menge_gut} onChange={(e) => setNBuch({ ...nBuch, menge_gut: e.target.value })} /></label>
                </div>
                {(num(nBuch.planbelegung_min) > 0 || num(nBuch.menge_gesamt) > 0) && (
                  <div style={styles.vorschau}>
                    Vorschau (noch ohne Störzeiten): Leistung <b>{pct(vorschau.leistung)}</b> · Qualität <b>{pct(vorschau.qualitaet)}</b> · Ausschuss <b>{vorschau.ausschuss} Stk</b>
                    {vorschau.leistungRoh > 1 ? <span style={{ color: C.warn }}> · Takt/Menge prüfen (Roh-Leistung {pct(vorschau.leistungRoh)})</span> : ''}
                  </div>
                )}
                <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'buch' ? 0.6 : 1 }} disabled={busy === 'buch'} onClick={buchungAnlegen}>＋ Buchung</button>
              </>
            )}
          </div>

          {/* Filter */}
          {maschinen.length > 0 && (
            <div style={{ margin: '14px 0 4px' }}>
              <label style={{ ...styles.lab, maxWidth: 320 }}>Filter Maschine
                <select style={styles.inp} value={filterMaschine} onChange={(e) => setFilterMaschine(e.target.value)}>
                  <option value="">Alle Maschinen</option>
                  {maschinen.map((m) => <option key={m.id} value={m.id}>{m.bezeichnung}</option>)}
                </select>
              </label>
            </div>
          )}

          {/* Buchungs-Karten */}
          {sichtbareBuchungen.length === 0 ? (
            <div style={styles.hint}>Noch keine Buchungen{filterMaschine ? ' für diese Maschine' : ''}.</div>
          ) : sichtbareBuchungen.map((b) => {
            const k = kennzahlBuchung(b as BuchungLite, stzMap.get(b.id) || 0);
            const st = stoerProBuchung.get(b.id) || [];
            const m = maschineVon(b.maschine_id);
            const pareto = stoerungNachKategorie(st as StoerungLite[]);
            return (
              <div key={b.id} style={{ ...styles.card, marginTop: 14 }}>
                <div style={styles.buchKopf}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 'clamp(15px,1.3vw,20px)' }}>{m?.bezeichnung || 'Maschine'} <span style={{ color: C.textDim, fontWeight: 400 }}>· {b.auftrag || 'ohne Auftrag'}</span></div>
                    <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>{fmtDatum(b.datum)}{b.schicht ? ` · ${b.schicht}` : ''}{b.bediener ? ` · ${b.bediener}` : ''}</div>
                  </div>
                  <span style={{ ...styles.statusPill, color: b.status === 'abgeschlossen' ? C.green : C.warn, borderColor: (b.status === 'abgeschlossen' ? C.green : C.warn) + '55' }}>{b.status === 'abgeschlossen' ? 'abgeschlossen' : 'offen'}</span>
                </div>

                {/* OEE-Tiles */}
                <div style={styles.oeeRow}>
                  <OeeTile label="Verfügbarkeit" value={pct(k.verfuegbarkeit)} />
                  <OeeTile label="Leistung" value={pct(k.leistung)} />
                  <OeeTile label="Qualität" value={pct(k.qualitaet)} />
                  <OeeTile label="OEE" value={pct(k.oee)} gross accent={oeeFarbe(k.oee)} />
                </div>
                <div style={styles.zeitRow}>
                  <span>Planbelegung <b>{minMitStd(k.planbelegung_min)}</b></span>
                  <span>Störzeit <b>{minMitStd(k.stoerzeit_min)}</b></span>
                  <span>Laufzeit <b>{minMitStd(k.laufzeit_min)}</b></span>
                  <span>Menge <b>{k.menge_gesamt}</b> · Gut <b>{k.menge_gut}</b> · Ausschuss <b style={{ color: k.ausschuss ? C.warn : C.text }}>{k.ausschuss}</b></span>
                </div>
                {k.leistungRoh > 1 && <div style={{ color: C.warn, fontSize: 13, marginBottom: 8 }}>⚠ Roh-Leistung {pct(k.leistungRoh)} — schneller als Idealtakt; Takt/Menge prüfen (OEE auf 100 % begrenzt).</div>}

                {/* Störgründe */}
                <div style={styles.stoerBox}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <b>Störgründe</b>
                    {nStoer?.buchung_id === b.id
                      ? <button style={styles.mini} onClick={() => setNStoer(null)}>abbrechen</button>
                      : <button style={styles.mini} onClick={() => setNStoer({ buchung_id: b.id, kategorie: 'ruesten', grund: STOER_KATALOG[0].gruende[0], dauer_min: '' })}>＋ Störung</button>}
                  </div>
                  {st.length > 0 ? st.map((s) => (
                    <div key={s.id} style={styles.zeile}>
                      <span>{kategorieLabel(s.kategorie)}<span style={{ color: C.textDim }}>{s.grund ? ` · ${s.grund}` : ''}</span></span>
                      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><b>{s.dauer_min} min</b><button style={styles.miniX} disabled={busy === s.id} onClick={() => loesche('bde_stoerung', s.id)}>✕</button></span>
                    </div>
                  )) : <div style={{ color: C.textDim, fontSize: 13 }}>Keine Störungen erfasst.</div>}

                  {pareto.length > 1 && (
                    <div style={{ marginTop: 6, color: C.textDim, fontSize: 12.5 }}>Verteilung: {pareto.map((p) => `${p.label} ${p.min} min`).join(' · ')}</div>
                  )}

                  {nStoer && nStoer.buchung_id === b.id && (
                    <div style={{ ...styles.subCard, marginTop: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 0.8fr auto', gap: 8, alignItems: 'end' }}>
                        <label style={styles.lab}>Kategorie
                          <select style={styles.inp} value={nStoer.kategorie} onChange={(e) => setNStoer({ ...nStoer, kategorie: e.target.value, grund: katVon(e.target.value).gruende[0] })}>
                            {STOER_KATALOG.map((kk) => <option key={kk.key} value={kk.key}>{kk.label}</option>)}
                          </select>
                        </label>
                        <label style={styles.lab}>Grund
                          <input style={styles.inp} list={`gr-${b.id}`} value={nStoer.grund} onChange={(e) => setNStoer({ ...nStoer, grund: e.target.value })} />
                          <datalist id={`gr-${b.id}`}>{katVon(nStoer.kategorie).gruende.map((g) => <option key={g} value={g} />)}</datalist>
                        </label>
                        <label style={styles.lab}>Dauer (Min.)<input style={styles.inp} inputMode="numeric" value={nStoer.dauer_min} onChange={(e) => setNStoer({ ...nStoer, dauer_min: e.target.value })} /></label>
                        <button style={{ ...styles.primaer, opacity: busy === 'stoer' ? 0.6 : 1 }} disabled={busy === 'stoer'} onClick={stoerungSpeichern}>＋</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Aktionen */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => druckePdf(b)}>📄 Schichtbericht</button>
                  <button style={styles.mini} disabled={busy === b.id} onClick={() => statusUmschalten(b)}>{b.status === 'abgeschlossen' ? '↩ wieder öffnen' : '✓ abschließen'}</button>
                  <button style={{ ...styles.mini, color: C.danger, borderColor: `${C.danger}55` }} disabled={busy === b.id} onClick={() => loesche('bde_buchung', b.id)}>✕ Buchung</button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div>{sub ? <div style={styles.kSub}>{sub}</div> : null}</div>);
}
function OeeTile({ label, value, gross, accent }: { label: string; value: string; gross?: boolean; accent?: string }) {
  return (<div style={{ ...styles.oeeTile, ...(gross ? { background: 'rgba(201,168,76,0.10)' } : {}) }}><div style={{ fontSize: gross ? 22 : 18, fontWeight: 800, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 900, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 21, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kSub: { color: C.textDim, fontSize: 11, marginTop: 3 },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 14px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(13px,1.1vw,17px)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAktiv: { background: C.gold, color: C.navy, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(13px,1.1vw,17px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  subCard: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  vorschau: { marginTop: 10, padding: '8px 12px', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 'clamp(13px,1.1vw,17px)' },
  buchKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  statusPill: { border: '1px solid', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  oeeRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 },
  oeeTile: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' },
  zeitRow: { display: 'flex', gap: 16, flexWrap: 'wrap', color: C.textDim, fontSize: 'clamp(13px,1.13vw,17px)', marginBottom: 8 },
  stoerBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginTop: 4 },
  zeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(143,163,190,0.08)', fontSize: 'clamp(13px,1.13vw,18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
