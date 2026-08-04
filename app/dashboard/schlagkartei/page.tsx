'use client';

// ============================================================
// ARGONAUT OS · A5 · Schlagkartei / Dünge- & PSM-Doku
// Feldstücke + gesetzeskonforme Dokumentation: Düngebedarfsermittlung,
// Düngung (DüV §10, Frist 14 Tage) und Pflanzenschutz (Pflichtfelder ab
// 01.01.2026, Frist 30 Tage). Fristen-Ampeln + N-Saldo aus lib/schlagkartei
// (0 €, node-getestet).
// Pfad: app/dashboard/schlagkartei/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../_components/Leerzustand';
import {
  DUENGE_FRIST_TAGE, PSM_FRIST_TAGE, DUENGER_ART, PSM_VERWENDUNGSART,
  dokuStatus, summeN, nSaldo, zaehleSchlagkartei,
} from '@/lib/schlagkartei';
import { augeSchlagkartei } from '@/lib/auge';
import { schlagNachweisPdf } from '@/lib/schlagNachweisPdf';
import KiAuge from '../_components/KiAuge';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'schlag';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Schlag = { id: string; bezeichnung: string; flurstueck: string | null; flaeche_ha: number; kultur: string | null; kultur_jahr: number | null; aussaat_am: string | null; ernte_am: string | null; standort: string | null; status: string; notiz: string | null };
type Bedarf = { id: string; schlag_id: string; jahr: number; kultur: string | null; ertragserwartung: number | null; n_bedarf: number; p_bedarf: number; notiz: string | null };
type Duengung = { id: string; schlag_id: string; datum: string; duengemittel: string | null; art: string; menge: number; einheit: string; n_gesamt: number; n_verfuegbar: number | null; p2o5: number; anwender: string | null; notiz: string | null; erstellt_am: string };
type Psm = { id: string; schlag_id: string; datum: string; startzeit: string | null; verwendungsart: string; mittel_name: string | null; zulassungsnr: string | null; aufwandmenge: number; aufwand_einheit: string; kultur: string | null; flaeche_ha: number; eppo_code: string | null; bbch_stadium: string | null; anwendungsgebiet: string | null; wartezeit_tage: number | null; anwender: string | null; notiz: string | null; erstellt_am: string };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function ha(n: number | null) { return `${(Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 4 })} ha`; }

export default function SchlagkarteiPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState<string | null>(null);
  const [tab, setTab] = useState<'schlaege' | 'duengung' | 'psm' | 'bedarf'>('schlaege');
  const [schlaege, setSchlaege] = useState<Schlag[]>([]);
  const [bedarfe, setBedarfe] = useState<Bedarf[]>([]);
  const [duengungen, setDuengungen] = useState<Duengung[]>([]);
  const [psm, setPsm] = useState<Psm[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = heuteLokal();
  const JAHR = new Date().getFullYear();

  const [nsch, setNsch] = useState({ bezeichnung: '', flurstueck: '', flaeche_ha: '', kultur: '', aussaat_am: '', ernte_am: '', standort: '' });
  const [nbed, setNbed] = useState({ schlag_id: '', jahr: String(JAHR), kultur: '', ertragserwartung: '', n_bedarf: '', p_bedarf: '' });
  const [ndue, setNdue] = useState({ schlag_id: '', datum: H, duengemittel: '', art: 'mineralisch', menge: '', einheit: 'kg/ha', n_gesamt: '', n_verfuegbar: '', p2o5: '', anwender: '' });
  const [npsm, setNpsm] = useState({ schlag_id: '', datum: H, startzeit: '', verwendungsart: 'freiland', mittel_name: '', zulassungsnr: '', aufwandmenge: '', aufwand_einheit: 'l/ha', kultur: '', flaeche_ha: '', eppo_code: '', bbch_stadium: '', anwendungsgebiet: '', wartezeit_tage: '', anwender: '' });
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [s, b, d, p] = await Promise.all([
        supabase.from('schlag').select('*').order('bezeichnung', { ascending: true }),
        supabase.from('schlag_bedarf').select('*').order('jahr', { ascending: false }),
        supabase.from('schlag_duengung').select('*').order('datum', { ascending: false }),
        supabase.from('schlag_psm').select('*').order('datum', { ascending: false }),
      ]);
      const schl = (s.data as Schlag[]) ?? [];
      setSchlaege(schl);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, schl.map((r) => r.id)));
      setBedarfe((b.data as Bedarf[]) ?? []);
      setDuengungen((d.data as Duengung[]) ?? []);
      setPsm((p.data as Psm[]) ?? []);
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const m = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      setAussteller(s(m.firmenname) || s(m.firma) || s(m.name) || s(m.betrieb) || null);
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const kennzahlen = useMemo(() => zaehleSchlagkartei(schlaege, bedarfe, duengungen, psm, JAHR), [schlaege, bedarfe, duengungen, psm, JAHR]);
  const schlagById = useCallback((id: string) => schlaege.find((x) => x.id === id), [schlaege]);
  const schlagName = (id: string) => schlagById(id)?.bezeichnung ?? '—';
  const aktiveSchlaege = schlaege.filter((s) => s.status === 'aktiv');

  // N-Saldo-Vorschau für die Düngung (Bedarf des Jahres vs. bereits gedüngt)
  const nInfo = useMemo(() => {
    if (!ndue.schlag_id) return null;
    const bed = bedarfe.find((b) => b.schlag_id === ndue.schlag_id && b.jahr === JAHR);
    const bereits = summeN(duengungen.filter((d) => d.schlag_id === ndue.schlag_id && Number(String(d.datum).slice(0, 4)) === JAHR));
    const bedarf: number | null = bed ? bed.n_bedarf : null;
    const rest: number | null = bed ? nSaldo(bed.n_bedarf, bereits) : null;
    return { bedarf, bereits, rest };
  }, [ndue.schlag_id, bedarfe, duengungen, JAHR]);

  async function schlagAnlegen() {
    if (!uid || !nsch.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('schlag'); setFehler(null); setOk(null);
    try {
      const { data: neu, error } = await supabase.from('schlag').insert({
        owner_user_id: uid, bezeichnung: nsch.bezeichnung.trim(), flurstueck: nsch.flurstueck.trim() || null,
        flaeche_ha: num(nsch.flaeche_ha), kultur: nsch.kultur.trim() || null, kultur_jahr: JAHR,
        aussaat_am: nsch.aussaat_am || null, ernte_am: nsch.ernte_am || null, standort: nsch.standort.trim() || null, status: 'aktiv',
      }).select('id').single();
      if (error || !neu) throw error ?? new Error('Kein Datensatz');
      try { await speichereWerte(MODUL, (neu as { id: string }).id, uid, nmExtra); } catch { /* eigene Felder optional */ }
      setNsch({ bezeichnung: '', flurstueck: '', flaeche_ha: '', kultur: '', aussaat_am: '', ernte_am: '', standort: '' }); setNmExtra({});
      setOk('Schlag angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function bedarfAnlegen() {
    if (!uid || !nbed.schlag_id) { setFehler('Bitte einen Schlag wählen.'); return; }
    setBusy('bedarf'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('schlag_bedarf').insert({
        owner_user_id: uid, schlag_id: nbed.schlag_id, jahr: Math.round(num(nbed.jahr)) || JAHR,
        kultur: nbed.kultur.trim() || null, ertragserwartung: nbed.ertragserwartung.trim() ? num(nbed.ertragserwartung) : null,
        n_bedarf: num(nbed.n_bedarf), p_bedarf: num(nbed.p_bedarf),
      });
      if (error) throw error;
      setNbed({ schlag_id: '', jahr: String(JAHR), kultur: '', ertragserwartung: '', n_bedarf: '', p_bedarf: '' });
      setOk('Düngebedarf erfasst.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function duengungAnlegen() {
    if (!uid || !ndue.schlag_id) { setFehler('Bitte einen Schlag wählen.'); return; }
    setBusy('duengung'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('schlag_duengung').insert({
        owner_user_id: uid, schlag_id: ndue.schlag_id, datum: ndue.datum, duengemittel: ndue.duengemittel.trim() || null,
        art: ndue.art, menge: num(ndue.menge), einheit: ndue.einheit, n_gesamt: num(ndue.n_gesamt),
        n_verfuegbar: ndue.n_verfuegbar.trim() ? num(ndue.n_verfuegbar) : null, p2o5: num(ndue.p2o5), anwender: ndue.anwender.trim() || null,
      });
      if (error) throw error;
      setNdue({ schlag_id: '', datum: H, duengemittel: '', art: 'mineralisch', menge: '', einheit: 'kg/ha', n_gesamt: '', n_verfuegbar: '', p2o5: '', anwender: '' });
      setOk('Düngung dokumentiert.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function psmAnlegen() {
    if (!uid || !npsm.schlag_id) { setFehler('Bitte einen Schlag wählen.'); return; }
    if (!npsm.mittel_name.trim() || !npsm.zulassungsnr.trim()) { setFehler('Mittel-Name und Zulassungsnummer sind Pflicht.'); return; }
    setBusy('psm'); setFehler(null); setOk(null);
    try {
      const sch = schlagById(npsm.schlag_id);
      const { error } = await supabase.from('schlag_psm').insert({
        owner_user_id: uid, schlag_id: npsm.schlag_id, datum: npsm.datum, startzeit: npsm.startzeit.trim() || null,
        verwendungsart: npsm.verwendungsart, mittel_name: npsm.mittel_name.trim(), zulassungsnr: npsm.zulassungsnr.trim(),
        aufwandmenge: num(npsm.aufwandmenge), aufwand_einheit: npsm.aufwand_einheit,
        kultur: npsm.kultur.trim() || sch?.kultur || null, flaeche_ha: npsm.flaeche_ha.trim() ? num(npsm.flaeche_ha) : (sch?.flaeche_ha ?? 0),
        eppo_code: npsm.eppo_code.trim() || null, bbch_stadium: npsm.bbch_stadium.trim() || null,
        anwendungsgebiet: npsm.anwendungsgebiet.trim() || null, wartezeit_tage: npsm.wartezeit_tage.trim() ? Math.round(num(npsm.wartezeit_tage)) : null,
        anwender: npsm.anwender.trim() || null,
      });
      if (error) throw error;
      setNpsm({ schlag_id: '', datum: H, startzeit: '', verwendungsart: 'freiland', mittel_name: '', zulassungsnr: '', aufwandmenge: '', aufwand_einheit: 'l/ha', kultur: '', flaeche_ha: '', eppo_code: '', bbch_stadium: '', anwendungsgebiet: '', wartezeit_tage: '', anwender: '' });
      setOk('Pflanzenschutz dokumentiert.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function nachweisErstellen(s: Schlag) {
    const imJahr = (dat: string) => Number(String(dat).slice(0, 4)) === JAHR;
    schlagNachweisPdf({
      schlag: { bezeichnung: s.bezeichnung, flurstueck: s.flurstueck, flaeche_ha: s.flaeche_ha, kultur: s.kultur, standort: s.standort },
      jahr: JAHR,
      bedarfe: bedarfe.filter((b) => b.schlag_id === s.id && b.jahr === JAHR),
      duengungen: duengungen.filter((d) => d.schlag_id === s.id && imJahr(d.datum)),
      psm: psm.filter((p) => p.schlag_id === s.id && imJahr(p.datum)),
      aussteller,
    });
  }

  function FristBadge({ datum, erfasstAm, frist }: { datum: string; erfasstAm: string; frist: number }) {
    const st = dokuStatus(datum, erfasstAm, frist);
    const spaet = st === 'spaet';
    return <span style={{ ...styles.badge, color: spaet ? C.danger : C.green, borderColor: spaet ? C.danger : C.green }}>{spaet ? 'verspätet' : 'fristgerecht'}</span>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Schlagkartei</div>
      <h1 style={styles.h1}>🌾 Schlagkartei & Nachweise</h1>
      <p style={styles.sub}>Feldstücke, Düngung und Pflanzenschutz gesetzeskonform dokumentieren — mit Düngebedarfsermittlung, N-Saldo und Fristen-Ampel (Düngung 14 Tage, Pflanzenschutz 30 Tage).</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Schläge" value={String(kennzahlen.anzahlSchlaege)} accent={C.text} />
        <Kpi label="Fläche gesamt" value={ha(kennzahlen.flaecheGesamt)} accent={C.cyan} />
        <Kpi label={`Düngungen ${JAHR}`} value={String(kennzahlen.duengungenJahr)} accent={C.text} />
        <Kpi label={`PSM ${JAHR}`} value={String(kennzahlen.psmJahr)} accent={C.text} />
        <Kpi label="Ohne Bedarf" value={String(kennzahlen.schlaegeOhneBedarf)} accent={kennzahlen.schlaegeOhneBedarf > 0 ? C.warn : C.green} />
        <Kpi label="Verspätet" value={String(kennzahlen.spaetDoku)} accent={kennzahlen.spaetDoku > 0 ? C.danger : C.green} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Schlagkartei" regel={augeSchlagkartei(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'schlaege' ? styles.tabAn : {}) }} onClick={() => setTab('schlaege')}>🌾 Schläge</button>
        <button style={{ ...styles.tab, ...(tab === 'duengung' ? styles.tabAn : {}) }} onClick={() => setTab('duengung')}>💩 Düngung</button>
        <button style={{ ...styles.tab, ...(tab === 'psm' ? styles.tabAn : {}) }} onClick={() => setTab('psm')}>🧪 Pflanzenschutz</button>
        <button style={{ ...styles.tab, ...(tab === 'bedarf' ? styles.tabAn : {}) }} onClick={() => setTab('bedarf')}>🎯 Düngebedarf</button>
      </div>

      {/* ---------- SCHLÄGE ---------- */}
      {tab === 'schlaege' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Schlag anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={nsch.bezeichnung} onChange={(e) => setNsch({ ...nsch, bezeichnung: e.target.value })} placeholder="z. B. Acker am Bach" /></label>
              <label style={styles.lab}>Flurstück / FID<input style={styles.inp} value={nsch.flurstueck} onChange={(e) => setNsch({ ...nsch, flurstueck: e.target.value })} /></label>
              <label style={styles.lab}>Fläche (ha)<input style={styles.inp} inputMode="decimal" value={nsch.flaeche_ha} onChange={(e) => setNsch({ ...nsch, flaeche_ha: e.target.value })} /></label>
              <label style={styles.lab}>Kultur<input style={styles.inp} value={nsch.kultur} onChange={(e) => setNsch({ ...nsch, kultur: e.target.value })} placeholder="z. B. Winterweizen" /></label>
              <label style={styles.lab}>Aussaat<input type="date" style={styles.inp} value={nsch.aussaat_am} onChange={(e) => setNsch({ ...nsch, aussaat_am: e.target.value })} /></label>
              <label style={styles.lab}>Ernte<input type="date" style={styles.inp} value={nsch.ernte_am} onChange={(e) => setNsch({ ...nsch, ernte_am: e.target.value })} /></label>
              <label style={styles.lab}>Standort / GPS<input style={styles.inp} value={nsch.standort} onChange={(e) => setNsch({ ...nsch, standort: e.target.value })} /></label>
              <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.inp} labStyle={styles.lab} />
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'schlag' ? 0.6 : 1 }} disabled={busy === 'schlag'} onClick={schlagAnlegen}>＋ Anlegen</button>
          </div>
          {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {schlaege.length === 0 ? <Leerzustand icon="🌾" titel="Noch keine Schläge" text="Lege deine Feldstücke an — Basis für Düngung, Pflanzenschutz und N-Saldo." schritte={["Schlag oben anlegen", "Fläche und Kultur erfassen", "Düngung und Pflanzenschutz dokumentieren"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Schlag</th><th style={styles.th}>Flurstück</th><th style={{ ...styles.th, textAlign: 'right' }}>Fläche</th><th style={styles.th}>Kultur</th><th style={styles.th}>Aussaat–Ernte</th><th style={{ ...styles.th, textAlign: 'right' }}>Nachweis</th></tr></thead>
                  <tbody>
                    {schlaege.map((s) => (
                      <tr key={s.id} style={{ opacity: s.status !== 'aktiv' ? 0.5 : 1 }}>
                        <td style={styles.td}>{s.bezeichnung}<EigeneFelderAnzeige felder={felder} werte={werteMap[s.id]} /></td>
                        <td style={{ ...styles.td, color: C.textDim }}>{s.flurstueck || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{ha(s.flaeche_ha)}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{s.kultur || '—'}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{fmtDatum(s.aussaat_am)} – {fmtDatum(s.ernte_am)}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}><button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} onClick={() => nachweisErstellen(s)}>📄 {JAHR}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- DÜNGUNG ---------- */}
      {tab === 'duengung' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Düngung dokumentieren <span style={styles.frist}>Frist: {DUENGE_FRIST_TAGE} Tage nach der Maßnahme</span></div>
            {aktiveSchlaege.length === 0 ? <div style={styles.hint}>Lege zuerst im Reiter „Schläge" ein Feldstück an.</div> : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Schlag
                    <select style={styles.inp} value={ndue.schlag_id} onChange={(e) => setNdue({ ...ndue, schlag_id: e.target.value })}>
                      <option value="">— wählen —</option>
                      {aktiveSchlaege.map((s) => <option key={s.id} value={s.id}>{s.bezeichnung} ({ha(s.flaeche_ha)})</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={ndue.datum} onChange={(e) => setNdue({ ...ndue, datum: e.target.value })} /></label>
                  <label style={styles.lab}>Düngemittel<input style={styles.inp} value={ndue.duengemittel} onChange={(e) => setNdue({ ...ndue, duengemittel: e.target.value })} placeholder="z. B. KAS 27, Gülle" /></label>
                  <label style={styles.lab}>Art
                    <select style={styles.inp} value={ndue.art} onChange={(e) => setNdue({ ...ndue, art: e.target.value })}>
                      {DUENGER_ART.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Menge / ha<input style={styles.inp} inputMode="decimal" value={ndue.menge} onChange={(e) => setNdue({ ...ndue, menge: e.target.value })} /></label>
                  <label style={styles.lab}>Einheit
                    <select style={styles.inp} value={ndue.einheit} onChange={(e) => setNdue({ ...ndue, einheit: e.target.value })}>
                      {['kg/ha', 'm3/ha', 'dt/ha', 't/ha'].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Gesamt-N (kg N/ha)<input style={styles.inp} inputMode="decimal" value={ndue.n_gesamt} onChange={(e) => setNdue({ ...ndue, n_gesamt: e.target.value })} /></label>
                  {ndue.art === 'organisch' && <label style={styles.lab}>verfügbarer N (kg N/ha)<input style={styles.inp} inputMode="decimal" value={ndue.n_verfuegbar} onChange={(e) => setNdue({ ...ndue, n_verfuegbar: e.target.value })} /></label>}
                  <label style={styles.lab}>P₂O₅ (kg/ha)<input style={styles.inp} inputMode="decimal" value={ndue.p2o5} onChange={(e) => setNdue({ ...ndue, p2o5: e.target.value })} /></label>
                  <label style={styles.lab}>Anwender<input style={styles.inp} value={ndue.anwender} onChange={(e) => setNdue({ ...ndue, anwender: e.target.value })} /></label>
                </div>
                {nInfo && (
                  <div style={{ ...styles.vorschau, borderColor: nInfo.bedarf == null ? C.warn : (nInfo.rest! < 0 ? C.danger : C.border) }}>
                    {nInfo.bedarf == null
                      ? <span style={{ color: C.warn }}>⚠ Für {JAHR} ist noch keine Düngebedarfsermittlung erfasst (Reiter „Düngebedarf"). Bereits gedüngt: <b>{nInfo.bereits}</b> kg N/ha.</span>
                      : <span>N-Bedarf {JAHR}: <b>{nInfo.bedarf}</b> · bereits gedüngt: <b>{nInfo.bereits}</b> · <b style={{ color: nInfo.rest! < 0 ? C.danger : C.green }}>{nInfo.rest! < 0 ? `${Math.abs(nInfo.rest!)} kg N/ha über Bedarf` : `${nInfo.rest} kg N/ha Rest`}</b></span>}
                  </div>
                )}
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'duengung' ? 0.6 : 1 }} disabled={busy === 'duengung'} onClick={duengungAnlegen}>＋ Dokumentieren</button>
              </>
            )}
          </div>
          {!laden && (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {duengungen.length === 0 ? <Leerzustand icon="💧" titel="Noch keine Düngungen" text="Dokumentiere Düngungen DüV-konform (Frist 14 Tage)." schritte={["Schlag wählen", "Düngung mit Menge und Datum erfassen", "N-Saldo und Frist-Ampel im Blick behalten"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Datum</th><th style={styles.th}>Schlag</th><th style={styles.th}>Mittel</th><th style={styles.th}>Art</th><th style={{ ...styles.th, textAlign: 'right' }}>N / P₂O₅</th><th style={styles.th}>Doku</th></tr></thead>
                  <tbody>
                    {duengungen.map((d) => (
                      <tr key={d.id}>
                        <td style={styles.td}>{fmtDatum(d.datum)}</td>
                        <td style={styles.td}>{schlagName(d.schlag_id)}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{d.duengemittel || '—'} <span style={{ color: C.textDim }}>({d.menge} {d.einheit})</span></td>
                        <td style={{ ...styles.td, color: C.textDim }}>{d.art}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{d.n_gesamt} / {d.p2o5}</td>
                        <td style={styles.td}><FristBadge datum={d.datum} erfasstAm={d.erstellt_am} frist={DUENGE_FRIST_TAGE} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- PFLANZENSCHUTZ ---------- */}
      {tab === 'psm' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Pflanzenschutz dokumentieren <span style={styles.frist}>Frist: {PSM_FRIST_TAGE} Tage · Pflichtfelder ab 2026</span></div>
            {aktiveSchlaege.length === 0 ? <div style={styles.hint}>Lege zuerst im Reiter „Schläge" ein Feldstück an.</div> : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Schlag
                    <select style={styles.inp} value={npsm.schlag_id} onChange={(e) => setNpsm({ ...npsm, schlag_id: e.target.value })}>
                      <option value="">— wählen —</option>
                      {aktiveSchlaege.map((s) => <option key={s.id} value={s.id}>{s.bezeichnung} ({ha(s.flaeche_ha)})</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={npsm.datum} onChange={(e) => setNpsm({ ...npsm, datum: e.target.value })} /></label>
                  <label style={styles.lab}>Startzeit (nur bei Auflage)<input style={styles.inp} value={npsm.startzeit} onChange={(e) => setNpsm({ ...npsm, startzeit: e.target.value })} placeholder="z. B. 06:30" /></label>
                  <label style={styles.lab}>Verwendungsart
                    <select style={styles.inp} value={npsm.verwendungsart} onChange={(e) => setNpsm({ ...npsm, verwendungsart: e.target.value })}>
                      {PSM_VERWENDUNGSART.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Mittel-Name *<input style={styles.inp} value={npsm.mittel_name} onChange={(e) => setNpsm({ ...npsm, mittel_name: e.target.value })} /></label>
                  <label style={styles.lab}>Zulassungsnr. *<input style={styles.inp} value={npsm.zulassungsnr} onChange={(e) => setNpsm({ ...npsm, zulassungsnr: e.target.value })} placeholder="z. B. 024676-00" /></label>
                  <label style={styles.lab}>Aufwandmenge<input style={styles.inp} inputMode="decimal" value={npsm.aufwandmenge} onChange={(e) => setNpsm({ ...npsm, aufwandmenge: e.target.value })} /></label>
                  <label style={styles.lab}>Einheit
                    <select style={styles.inp} value={npsm.aufwand_einheit} onChange={(e) => setNpsm({ ...npsm, aufwand_einheit: e.target.value })}>
                      {['l/ha', 'kg/ha'].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Kultur<input style={styles.inp} value={npsm.kultur} onChange={(e) => setNpsm({ ...npsm, kultur: e.target.value })} placeholder="leer = Schlag-Kultur" /></label>
                  <label style={styles.lab}>Behandelte Fläche (ha)<input style={styles.inp} inputMode="decimal" value={npsm.flaeche_ha} onChange={(e) => setNpsm({ ...npsm, flaeche_ha: e.target.value })} placeholder="leer = Schlag-Fläche" /></label>
                  <label style={styles.lab}>EPPO-Code<input style={styles.inp} value={npsm.eppo_code} onChange={(e) => setNpsm({ ...npsm, eppo_code: e.target.value })} placeholder="z. B. TRZAW" /></label>
                  <label style={styles.lab}>BBCH (nur bei Auflage)<input style={styles.inp} value={npsm.bbch_stadium} onChange={(e) => setNpsm({ ...npsm, bbch_stadium: e.target.value })} /></label>
                  <label style={styles.lab}>Anwendungsgebiet / Indikation<input style={styles.inp} value={npsm.anwendungsgebiet} onChange={(e) => setNpsm({ ...npsm, anwendungsgebiet: e.target.value })} /></label>
                  <label style={styles.lab}>Wartezeit (Tage)<input style={styles.inp} inputMode="numeric" value={npsm.wartezeit_tage} onChange={(e) => setNpsm({ ...npsm, wartezeit_tage: e.target.value })} /></label>
                  <label style={styles.lab}>Anwender<input style={styles.inp} value={npsm.anwender} onChange={(e) => setNpsm({ ...npsm, anwender: e.target.value })} /></label>
                </div>
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'psm' ? 0.6 : 1 }} disabled={busy === 'psm'} onClick={psmAnlegen}>＋ Dokumentieren</button>
              </>
            )}
          </div>
          {!laden && (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {psm.length === 0 ? <Leerzustand icon="🐛" titel="Noch keine Pflanzenschutz-Anwendungen" text="Pflichtdokumentation ab 01.01.2026 (Frist 30 Tage)." schritte={["Schlag wählen", "Mittel, Menge und Grund erfassen", "Fristgerecht dokumentieren"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Datum</th><th style={styles.th}>Schlag</th><th style={styles.th}>Mittel (Zul.-Nr.)</th><th style={{ ...styles.th, textAlign: 'right' }}>Aufwand</th><th style={styles.th}>Wartezeit</th><th style={styles.th}>Doku</th></tr></thead>
                  <tbody>
                    {psm.map((p) => (
                      <tr key={p.id}>
                        <td style={styles.td}>{fmtDatum(p.datum)}</td>
                        <td style={styles.td}>{schlagName(p.schlag_id)}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{p.mittel_name || '—'} <span style={{ color: C.textDim }}>({p.zulassungsnr || '—'})</span></td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{p.aufwandmenge} {p.aufwand_einheit}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{p.wartezeit_tage != null ? `${p.wartezeit_tage} T` : '—'}</td>
                        <td style={styles.td}><FristBadge datum={p.datum} erfasstAm={p.erstellt_am} frist={PSM_FRIST_TAGE} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- DÜNGEBEDARF ---------- */}
      {tab === 'bedarf' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Düngebedarf ermitteln <span style={styles.frist}>vor der ersten Düngung · je Schlag & Jahr</span></div>
            {aktiveSchlaege.length === 0 ? <div style={styles.hint}>Lege zuerst im Reiter „Schläge" ein Feldstück an.</div> : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Schlag
                    <select style={styles.inp} value={nbed.schlag_id} onChange={(e) => setNbed({ ...nbed, schlag_id: e.target.value })}>
                      <option value="">— wählen —</option>
                      {aktiveSchlaege.map((s) => <option key={s.id} value={s.id}>{s.bezeichnung} ({ha(s.flaeche_ha)})</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Jahr<input style={styles.inp} inputMode="numeric" value={nbed.jahr} onChange={(e) => setNbed({ ...nbed, jahr: e.target.value })} /></label>
                  <label style={styles.lab}>Kultur<input style={styles.inp} value={nbed.kultur} onChange={(e) => setNbed({ ...nbed, kultur: e.target.value })} /></label>
                  <label style={styles.lab}>Ertragserwartung (dt/ha)<input style={styles.inp} inputMode="decimal" value={nbed.ertragserwartung} onChange={(e) => setNbed({ ...nbed, ertragserwartung: e.target.value })} /></label>
                  <label style={styles.lab}>N-Bedarf (kg N/ha)<input style={styles.inp} inputMode="decimal" value={nbed.n_bedarf} onChange={(e) => setNbed({ ...nbed, n_bedarf: e.target.value })} /></label>
                  <label style={styles.lab}>P-Bedarf (kg P₂O₅/ha)<input style={styles.inp} inputMode="decimal" value={nbed.p_bedarf} onChange={(e) => setNbed({ ...nbed, p_bedarf: e.target.value })} /></label>
                </div>
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'bedarf' ? 0.6 : 1 }} disabled={busy === 'bedarf'} onClick={bedarfAnlegen}>＋ Erfassen</button>
              </>
            )}
          </div>
          {!laden && (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {bedarfe.length === 0 ? <Leerzustand icon="🧮" titel="Noch keine Düngebedarfsermittlung" text="Die Düngebedarfsermittlung ist Voraussetzung für die Düngung." schritte={["Schlag wählen", "Kultur und Ertragserwartung erfassen", "Bedarf berechnen lassen"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Jahr</th><th style={styles.th}>Schlag</th><th style={styles.th}>Kultur</th><th style={{ ...styles.th, textAlign: 'right' }}>N-Bedarf</th><th style={{ ...styles.th, textAlign: 'right' }}>P-Bedarf</th></tr></thead>
                  <tbody>
                    {bedarfe.map((b) => (
                      <tr key={b.id}>
                        <td style={styles.td}>{b.jahr}</td>
                        <td style={styles.td}>{schlagName(b.schlag_id)}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{b.kultur || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{b.n_bedarf} kg/ha</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{b.p_bedarf} kg/ha</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  /* Rand und Hoechstbreite kommen seit 04.08.2026 aus der Seitenschale im Layout.
     `background` und `minHeight` sind hier ueberfluessig — beides setzt bereits
     das Dashboard-Layout; doppelt gesetzt erzeugte es nur eine zweite Flaeche. */
  page: { color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif" },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 860, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 12px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' },
  frist: { fontSize: 'clamp(11px, 1vw, 15px)', color: C.textDim, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  vorschau: { marginTop: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
