'use client';

// ============================================================================
// ARGONAUT OS · Paket 364 (13.10.2026) · A4f Fachpaket Weinbau
// Lesebuch (Weinberg, Rebsorte, kg, °Oechsle, Säure), Partien mit Bestand und
// Kellerbuch (nur anhängen, Bestand rechnet die Datenbank), Verschnitt und
// Abfüllung in einem Zug (Charge in Quarantäne mit Rückverfolgung zur Lese),
// Jahrgangs-Übersicht und Bestand zum Stichtag.
// Logik: lib/weinbau.ts · SQL: supabase-sql/p364-weinbau.sql
// ============================================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import {
  FREIE_ARTEN, NENNVOLUMEN, kellerArt, zahlLesen, zahlDe, lesePruefen, kellerPruefen, verschnittPruefen, abfuellPruefen, losVorschlag,
  jahrgangUebersicht, bestandAm, letzteAnalyse, eintragText, kellerbuchHtml, type PartieRoh, type LeseRoh, type KellerRoh,
} from '@/lib/weinbau';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import Leerzustand from '../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)', rot: '#E06666', warn: '#E0A24C' };
type Schlag = { id: string; bezeichnung: string; flaeche_ha: number | null; kultur: string | null };
type Reiter = 'partien' | 'lese' | 'jahrgang';

function heuteBerlin(): string { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date()); }
function datumDe(d: string | null | undefined): string { return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '—'; }
function zahl(x: unknown, k = 2): string { return zahlDe(typeof x === 'number' ? x : zahlLesen(x as string), k); }
function dbFehler(msg: string, recht = 'Weinbau'): string {
  if (/row-level security|permission denied/i.test(msg)) return `Nicht gespeichert — dafür ist das Schreibrecht „${recht}" nötig.`;
  if (/does not exist|schema cache/i.test(msg)) return 'Nicht gespeichert — fehlt SQL Paket 364?';
  return msg;
}

const LEER_LESE = { jahrgang: '', lesedatum: '', weinberg: '', schlag: '', flaeche: '', rebsorte: '', lesart: 'hand', menge: '', oechsle: '', saeure: '', most: '', partie: '', bemerkung: '' };
const LEER_KB = { art: 'analyse', datum: '', menge: '', mittel: '', mittelMenge: '', mittelEinheit: '', alkohol: '', restzucker: '', saeure: '', so2frei: '', so2gesamt: '', bemerkung: '' };

export default function WeinbauSeite() {
  const H = heuteBerlin();
  const JAHR = Number(H.slice(0, 4));
  const [ich, setIch] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [partien, setPartien] = useState<PartieRoh[]>([]);
  const [lesen, setLesen] = useState<LeseRoh[]>([]);
  const [buch, setBuch] = useState<KellerRoh[]>([]);
  const [schlaege, setSchlaege] = useState<Schlag[]>([]);
  const [bereit, setBereit] = useState(true);
  const [laden, setLaden] = useState(true);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reiter, setReiter] = useState<Reiter>('partien');
  const [neuP, setNeuP] = useState<{ auf: boolean; jahrgang: string; bezeichnung: string; rebsorte: string; behaelter: string }>({ auf: false, jahrgang: String(JAHR), bezeichnung: '', rebsorte: '', behaelter: '' });
  const [aktivId, setAktivId] = useState<string | null>(null);
  const [lf, setLf] = useState({ ...LEER_LESE, jahrgang: String(JAHR), lesedatum: H });
  const [kb, setKb] = useState({ ...LEER_KB });
  const [vs, setVs] = useState({ nach: '', menge: '', bemerkung: '' });
  const [af, setAf] = useState({ flaschen: '', nenn: '0,75', charge: '' });
  const [storno, setStorno] = useState<{ id: string; grund: string } | null>(null);
  const [jahrgang, setJahrgang] = useState(JAHR);
  const [stichtag, setStichtag] = useState(H);

  const fehler = (t: string) => setMeldung({ ok: false, text: t });
  const gut = (t: string) => setMeldung({ ok: true, text: t });
  const istChef = !!ich && ich === betrieb;

  const ladeAlles = useCallback(async () => {
    const [p, l, k] = await Promise.all([
      supabase.from('wein_partie').select('*').order('jahrgang', { ascending: false }).order('bezeichnung').limit(2000),
      supabase.from('wein_lese').select('*').order('lesedatum', { ascending: false }).order('nummer', { ascending: false }).limit(5000),
      supabase.from('wein_kellerbuch').select('*').order('erfasst_am', { ascending: true }).limit(20000),
    ]);
    setBereit(!p.error);
    setPartien(p.error ? [] : ((p.data as PartieRoh[]) ?? []));
    setLesen(l.error ? [] : ((l.data as LeseRoh[]) ?? []));
    setBuch(k.error ? [] : ((k.data as KellerRoh[]) ?? []));
    setLaden(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setIch(id);
      let chef: unknown = null;
      try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
      const b = typeof chef === 'string' && chef ? chef : id;
      setBetrieb(b);
      if (b) {
        const { data: pr } = await supabase.from('profiles').select('firma_name').eq('id', b).maybeSingle();
        setFirma(String((pr as { firma_name?: string } | null)?.firma_name ?? ''));
      }
      const s = await supabase.from('schlag').select('id, bezeichnung, flaeche_ha, kultur').order('bezeichnung').limit(2000);
      setSchlaege(s.error ? [] : ((s.data as Schlag[]) ?? []));
      await ladeAlles();
    })();
  }, [ladeAlles]);

  const aktiv = useMemo(() => partien.find((p) => p.id === aktivId) ?? null, [partien, aktivId]);
  const aktivBuch = useMemo(() => (aktiv ? buch.filter((e) => e.partie_id === aktiv.id) : []), [buch, aktiv]);
  const bestand = aktiv ? (zahlLesen(String(aktiv.bestand_l)) ?? 0) : 0;
  const analyse = useMemo(() => (aktiv ? letzteAnalyse(buch, aktiv.id) : null), [buch, aktiv]);
  const uebersicht = useMemo(() => jahrgangUebersicht(lesen, jahrgang), [lesen, jahrgang]);
  const amStichtag = useMemo(() => bestandAm(buch, stichtag), [buch, stichtag]);
  const jahrgaenge = useMemo(() => [...new Set<number>([JAHR, ...lesen.map((l) => Number(l.jahrgang)), ...partien.map((p) => Number(p.jahrgang))])].sort((a, b) => b - a), [lesen, partien, JAHR]);
  const kbArt = kellerArt(kb.art);

  function oeffnen(p: PartieRoh) {
    setAktivId(p.id); setMeldung(null);
    setKb({ ...LEER_KB }); setVs({ nach: '', menge: '', bemerkung: '' });
    const bisher = buch.filter((e) => e.partie_id === p.id && e.art === 'abfuellung').length;
    setAf({ flaschen: '', nenn: '0,75', charge: losVorschlag(p, bisher) });
  }

  async function partieAnlegen() {
    if (!betrieb) return;
    const j = Number(neuP.jahrgang);
    if (!/^\d{4}$/.test(neuP.jahrgang) || j < 1900 || j > 2200) { fehler('Bitte den Jahrgang vierstellig angeben.'); return; }
    if (!neuP.bezeichnung.trim()) { fehler('Bitte eine Bezeichnung angeben, z. B. 2026 Riesling trocken.'); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('wein_partie').insert({ owner_user_id: betrieb, jahrgang: j, bezeichnung: neuP.bezeichnung.trim(), rebsorte: neuP.rebsorte.trim() || null, behaelter: neuP.behaelter.trim() || null }).select('*').single();
      if (error || !data) { fehler(dbFehler(error?.message ?? 'Nicht angelegt.')); return; }
      setNeuP({ auf: false, jahrgang: neuP.jahrgang, bezeichnung: '', rebsorte: '', behaelter: '' });
      await ladeAlles();
      oeffnen(data as PartieRoh);
      gut(`Partie „${(data as PartieRoh).bezeichnung}" angelegt.`);
    } finally { setBusy(false); }
  }

  async function partieLoeschen() {
    if (!aktiv || !window.confirm(`Leere Partie „${aktiv.bezeichnung}" ohne Einträge löschen?`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('wein_partie').delete().eq('id', aktiv.id).select('id');
      if (error) { fehler(error.message); return; }
      if (nichtsGeschrieben(data)) { fehler('Löschen kann nur die Geschäftsleitung.'); return; }
      setAktivId(null); await ladeAlles();
    } finally { setBusy(false); }
  }

  function schlagWahl(id: string) {
    const s = schlaege.find((x) => x.id === id);
    setLf((f) => ({ ...f, schlag: id, weinberg: s?.bezeichnung ?? f.weinberg, flaeche: s?.flaeche_ha != null ? String(s.flaeche_ha).replace('.', ',') : f.flaeche, rebsorte: f.rebsorte || s?.kultur || '' }));
  }

  async function leseSpeichern() {
    if (!betrieb) return;
    const pr = lesePruefen(lf, H);
    if (pr.fehler.length) { fehler(pr.fehler.join(' ')); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('wein_lese').insert({
        owner_user_id: betrieb, jahrgang: pr.werte.jahrgang, lesedatum: lf.lesedatum, schlag_id: lf.schlag || null, weinberg: lf.weinberg.trim(), flaeche_ha: pr.werte.flaeche,
        rebsorte: lf.rebsorte.trim(), lesart: lf.lesart, menge_kg: pr.werte.menge, mostgewicht_oe: pr.werte.oechsle, saeure_gl: pr.werte.saeure, most_l: pr.werte.most,
        partie_id: lf.partie || null, bemerkung: lf.bemerkung.trim() || null,
      }).select('nummer').single();
      if (error || !data) { fehler(dbFehler(error?.message ?? 'Nicht gespeichert.')); return; }
      const p = partien.find((x) => x.id === lf.partie);
      gut(`Lese ${(data as { nummer: string }).nummer} gespeichert.${p ? ` ${zahl(pr.werte.most, 1)} l Most in „${p.bezeichnung}" gebucht.` : ''}`);
      setLf((f) => ({ ...LEER_LESE, jahrgang: f.jahrgang, lesedatum: f.lesedatum, rebsorte: f.rebsorte, partie: f.partie, lesart: f.lesart }));
      await ladeAlles();
    } finally { setBusy(false); }
  }

  async function leseStornieren() {
    if (!storno) return;
    if (storno.grund.trim().length < 10) { fehler('Bitte einen Storno-Grund angeben (mindestens 10 Zeichen).'); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('wein_lese').update({ storniert: true, storno_grund: storno.grund.trim() }).eq('id', storno.id).select('id');
      if (error) { fehler(/Nicht genug Wein/.test(error.message) ? `${error.message} Der Most ist schon weiterverarbeitet – bitte im Kellerbuch korrigieren.` : error.message); return; }
      if (nichtsGeschrieben(data)) { fehler('Stornieren kann nur die Geschäftsleitung.'); return; }
      setStorno(null); gut('Lese storniert. Sie bleibt als Nachweis gespeichert; ein zugebuchter Most wurde wieder ausgebucht.');
      await ladeAlles();
    } finally { setBusy(false); }
  }

  async function eintragen() {
    if (!aktiv || !betrieb) return;
    const pr = kellerPruefen(kb, bestand, H);
    if (pr.fehler.length) { fehler(pr.fehler.join(' ')); return; }
    setBusy(true); setMeldung(null);
    try {
      const { error } = await supabase.from('wein_kellerbuch').insert({ owner_user_id: betrieb, partie_id: aktiv.id, ...pr.zeile });
      if (error) { fehler(dbFehler(error.message)); return; }
      setKb({ ...LEER_KB, art: kb.art });
      gut(`${kbArt.name} eingetragen.`);
      await ladeAlles();
    } finally { setBusy(false); }
  }

  async function verschneiden() {
    if (!aktiv) return;
    const nach = partien.find((p) => p.id === vs.nach) ?? null;
    const pr = verschnittPruefen(aktiv, nach, vs.menge);
    if (pr.fehler.length || !nach) { fehler(pr.fehler.join(' ')); return; }
    if (!window.confirm(`${zahl(pr.menge, 3)} l aus „${aktiv.bezeichnung}" in „${nach.bezeichnung}" verschneiden?`)) return;
    setBusy(true); setMeldung(null);
    try {
      const { error } = await supabase.rpc('p364_verschnitt', { p_von: aktiv.id, p_nach: nach.id, p_menge: pr.menge, p_datum: H, p_bemerkung: vs.bemerkung.trim() || null });
      if (error) { fehler(dbFehler(error.message)); return; }
      setVs({ nach: '', menge: '', bemerkung: '' });
      gut(`Verschnitt gebucht: ${zahl(pr.menge, 3)} l nach „${nach.bezeichnung}".`);
      await ladeAlles();
    } finally { setBusy(false); }
  }

  async function abfuellen() {
    if (!aktiv) return;
    const pr = abfuellPruefen(af, bestand);
    if (pr.fehler.length) { fehler(pr.fehler.join(' ')); return; }
    if (!window.confirm(`${pr.flaschen} Flaschen à ${zahl(pr.nenn, 4)} l = ${zahl(pr.liter, 3)} l aus „${aktiv.bezeichnung}" abfüllen? Die Charge ${af.charge.trim()} wird in Quarantäne angelegt.`)) return;
    setBusy(true); setMeldung(null);
    try {
      const { error } = await supabase.rpc('p364_abfuellen', { p_partie: aktiv.id, p_flaschen: pr.flaschen, p_nenn_l: pr.nenn, p_charge_nr: af.charge.trim(), p_datum: H });
      if (error) { fehler(/row-level security/i.test(error.message) ? 'Nicht abgefüllt — dafür ist auch das Schreibrecht „Chargen" nötig.' : dbFehler(error.message)); return; }
      gut(`Abgefüllt. Die Charge ${af.charge.trim()} steht in Quarantäne — nach der Prüfung unter Chargen freigeben.`);
      await ladeAlles();
      const bisher = buch.filter((e) => e.partie_id === aktiv.id && e.art === 'abfuellung').length + 1;
      setAf({ flaschen: '', nenn: af.nenn, charge: losVorschlag(aktiv, bisher) });
    } finally { setBusy(false); }
  }

  function drucken() {
    if (!aktiv) return;
    const w = window.open('', '_blank');
    if (!w) { fehler('Bitte Pop-ups für den Druck erlauben.'); return; }
    w.document.write(kellerbuchHtml(aktiv, buch, firma));
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  const offenePartien = partien.filter((p) => (zahlLesen(String(p.bestand_l)) ?? 0) > 0 || p.id === aktivId);
  const summeStichtag = [...amStichtag.values()].reduce((a, b) => a + b, 0);

  return (
    <div style={st.seite}>
      <div style={st.eyebrow}>ARGONAUT OS · Weinbau</div>
      <h1 style={st.h1}>🍇 Lese- und Kellerbuch</h1>
      <p style={st.sub}>Jede Lese mit Weinberg, Rebsorte, Menge, Mostgewicht und Säure; der Most landet in einer Partie. Im Kellerbuch wird jede Bewegung und Behandlung angehängt – den Bestand rechnet ARGONAUT. Die Abfüllung legt die Flaschen-Charge mit Rückverfolgung bis zur Lese an.</p>
      {!bereit && <div style={st.err}>Diese Seite braucht SQL Paket 364. Bitte zuerst einspielen.</div>}
      {meldung && <div style={{ ...st.err, color: meldung.ok ? C.green : C.rot, borderColor: (meldung.ok ? C.green : C.rot) + '55', background: 'transparent' }}>{meldung.text}</div>}

      <div style={{ display: 'flex', gap: 8, margin: '4px 0 12px', flexWrap: 'wrap' }}>
        <button style={{ ...st.reiter, ...(reiter === 'partien' ? st.reiterAn : {}) }} onClick={() => setReiter('partien')}>🛢 Partien & Kellerbuch</button>
        <button style={{ ...st.reiter, ...(reiter === 'lese' ? st.reiterAn : {}) }} onClick={() => setReiter('lese')}>🍇 Lese</button>
        <button style={{ ...st.reiter, ...(reiter === 'jahrgang' ? st.reiterAn : {}) }} onClick={() => setReiter('jahrgang')}>📊 Jahrgang & Bestand</button>
      </div>

      {reiter === 'lese' && (
        <>
          <div style={st.karte}>
            <div style={st.titel}>Lese erfassen</div>
            <div style={st.reihe}>
              <label style={st.lab}>Lesedatum<input type="date" style={st.inp} max={H} value={lf.lesedatum} onChange={(e) => setLf({ ...lf, lesedatum: e.target.value })} /></label>
              <label style={st.lab}>Jahrgang<input style={{ ...st.inp, width: 80 }} inputMode="numeric" value={lf.jahrgang} onChange={(e) => setLf({ ...lf, jahrgang: e.target.value })} /></label>
              {schlaege.length > 0 && (
                <label style={st.lab}>Weinberg aus Schlagkartei
                  <select style={st.inp} value={lf.schlag} onChange={(e) => schlagWahl(e.target.value)}>
                    <option value="">— wählen (optional) —</option>
                    {schlaege.map((s) => <option key={s.id} value={s.id}>{s.bezeichnung}{s.flaeche_ha ? ` · ${zahl(s.flaeche_ha, 4)} ha` : ''}</option>)}
                  </select>
                </label>
              )}
              <label style={st.lab}>Weinberg / Lage<input style={st.inp} value={lf.weinberg} onChange={(e) => setLf({ ...lf, weinberg: e.target.value })} /></label>
              <label style={st.lab}>Fläche (ha)<input style={{ ...st.inp, width: 90 }} inputMode="decimal" value={lf.flaeche} onChange={(e) => setLf({ ...lf, flaeche: e.target.value })} /></label>
              <label style={st.lab}>Rebsorte<input style={st.inp} value={lf.rebsorte} onChange={(e) => setLf({ ...lf, rebsorte: e.target.value })} /></label>
              <label style={st.lab}>Lese<select style={st.inp} value={lf.lesart} onChange={(e) => setLf({ ...lf, lesart: e.target.value })}><option value="hand">Hand</option><option value="maschine">Maschine</option></select></label>
            </div>
            <div style={{ ...st.reihe, marginTop: 8 }}>
              <label style={st.lab}>Menge (kg)<input style={{ ...st.inp, width: 100 }} inputMode="decimal" value={lf.menge} onChange={(e) => setLf({ ...lf, menge: e.target.value })} /></label>
              <label style={st.lab}>Mostgewicht (°Oe)<input style={{ ...st.inp, width: 90 }} inputMode="decimal" value={lf.oechsle} onChange={(e) => setLf({ ...lf, oechsle: e.target.value })} /></label>
              <label style={st.lab}>Säure (g/l)<input style={{ ...st.inp, width: 80 }} inputMode="decimal" value={lf.saeure} onChange={(e) => setLf({ ...lf, saeure: e.target.value })} /></label>
              <label style={st.lab}>In Partie (optional)
                <select style={st.inp} value={lf.partie} onChange={(e) => setLf({ ...lf, partie: e.target.value })}>
                  <option value="">— keine —</option>
                  {partien.map((p) => <option key={p.id} value={p.id}>{p.bezeichnung}{p.behaelter ? ` · ${p.behaelter}` : ''}</option>)}
                </select>
              </label>
              <label style={st.lab}>Most (l){lf.partie ? ' *' : ''}<input style={{ ...st.inp, width: 100 }} inputMode="decimal" value={lf.most} onChange={(e) => setLf({ ...lf, most: e.target.value })} /></label>
              <label style={{ ...st.lab, flex: 1 }}>Bemerkung<input style={st.inp} maxLength={1000} value={lf.bemerkung} onChange={(e) => setLf({ ...lf, bemerkung: e.target.value })} /></label>
              <button style={st.primaer} disabled={busy} onClick={() => void leseSpeichern()}>Speichern</button>
            </div>
            <p style={st.dim}>Die Nummer vergibt das System je Jahrgang. Lesebuch-Einträge werden nur angehängt; bei einem Fehler storniert die Geschäftsleitung mit Grund und die Lese wird neu erfasst.</p>
          </div>

          <div style={st.karte}>
            <div style={st.titel}>Lesebuch</div>
            {lesen.length === 0 ? <div style={st.dim}>Noch keine Lese erfasst.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.tab}>
                  <thead><tr><th style={st.th}>Nr.</th><th style={st.th}>Datum</th><th style={st.th}>Weinberg</th><th style={st.th}>Rebsorte</th><th style={st.thr}>kg</th><th style={st.thr}>°Oe</th><th style={st.thr}>Säure</th><th style={st.thr}>Most l</th><th style={st.th}>Partie</th><th style={st.th}>Erfasst</th><th style={st.th}></th></tr></thead>
                  <tbody>
                    {lesen.map((l) => (
                      <tr key={l.id} style={l.storniert ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}>
                        <td style={st.td}>{l.nummer}</td><td style={st.td}>{datumDe(l.lesedatum)}</td><td style={st.td}>{l.weinberg}</td><td style={st.td}>{l.rebsorte}</td>
                        <td style={st.tdr}>{zahl(l.menge_kg, 1)}</td><td style={st.tdr}>{zahl(l.mostgewicht_oe, 1)}</td><td style={st.tdr}>{zahl(l.saeure_gl, 1)}</td><td style={st.tdr}>{zahl(l.most_l, 1)}</td>
                        <td style={st.td}>{partien.find((p) => p.id === l.partie_id)?.bezeichnung ?? '—'}</td>
                        <td style={st.td}>{l.erfasst_name ?? '—'}{l.storniert && l.storno_grund ? <span style={{ color: C.rot, textDecoration: 'none' }}> · Storno: {l.storno_grund}</span> : null}</td>
                        <td style={st.td}>{istChef && !l.storniert && l.id && <button style={st.link} onClick={() => setStorno({ id: l.id as string, grund: '' })}>stornieren</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {storno && (
              <div style={{ ...st.reihe, marginTop: 10 }}>
                <input style={{ ...st.inp, flex: 1 }} placeholder="Grund, z. B. falscher Weinberg erfasst" value={storno.grund} onChange={(e) => setStorno({ ...storno, grund: e.target.value })} />
                <button style={{ ...st.knopf, color: C.rot }} disabled={busy} onClick={() => void leseStornieren()}>Stornieren</button>
                <button style={st.knopf} onClick={() => setStorno(null)}>Abbrechen</button>
              </div>
            )}
          </div>
        </>
      )}

      {reiter === 'jahrgang' && (
        <>
          <div style={st.karte}>
            <div style={{ ...st.reihe, marginBottom: 10 }}>
              <span style={st.titel}>Jahrgang</span>
              <select style={st.inp} value={jahrgang} onChange={(e) => setJahrgang(Number(e.target.value))}>{jahrgaenge.map((j) => <option key={j} value={j}>{j}</option>)}</select>
              <span style={st.dim}>{zahl(uebersicht.summeKg, 1)} kg · {zahl(uebersicht.summeMost, 1)} l Most</span>
            </div>
            {uebersicht.sorten.length === 0 ? <div style={st.dim}>Für diesen Jahrgang ist noch keine Lese erfasst.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.tab}>
                  <thead><tr><th style={st.th}>Rebsorte</th><th style={st.thr}>Lesen</th><th style={st.thr}>kg</th><th style={st.thr}>Most l</th><th style={st.thr}>Ø °Oe</th><th style={st.thr}>Ø Säure g/l</th></tr></thead>
                  <tbody>{uebersicht.sorten.map((s) => <tr key={s.rebsorte}><td style={st.td}>{s.rebsorte}</td><td style={st.tdr}>{s.lesen}</td><td style={st.tdr}>{zahl(s.kg, 1)}</td><td style={st.tdr}>{zahl(s.most_l, 1)}</td><td style={st.tdr}>{zahl(s.oechsle, 1)}</td><td style={st.tdr}>{zahl(s.saeure, 1)}</td></tr>)}</tbody>
                </table>
                <table style={{ ...st.tab, marginTop: 14 }}>
                  <thead><tr><th style={st.th}>Weinberg</th><th style={st.thr}>ha</th><th style={st.thr}>kg</th><th style={st.thr}>kg/ha</th><th style={st.thr}>hl/ha</th></tr></thead>
                  <tbody>{uebersicht.weinberge.map((w) => <tr key={w.weinberg}><td style={st.td}>{w.weinberg}</td><td style={st.tdr}>{zahl(w.ha, 4)}</td><td style={st.tdr}>{zahl(w.kg, 1)}</td><td style={st.tdr}>{zahl(w.kgJeHa, 0)}</td><td style={st.tdr}>{zahl(w.hlJeHa, 1)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <p style={st.dim}>Ø nach kg gewichtet, stornierte Lesen zählen nicht. hl/ha nur, wenn bei allen Lesen des Weinbergs Most-Liter und Fläche eingetragen sind. Den Hektarhöchstertrag des Anbaugebiets bitte selbst abgleichen.</p>
          </div>
          <div style={st.karte}>
            <div style={{ ...st.reihe, marginBottom: 10 }}>
              <span style={st.titel}>Bestand zum Stichtag</span>
              <input type="date" style={st.inp} value={stichtag} onChange={(e) => setStichtag(e.target.value)} />
              <span style={st.dim}>Summe {zahl(summeStichtag, 3)} l</span>
            </div>
            {partien.length === 0 ? <div style={st.dim}>Noch keine Partien.</div> : (
              <table style={st.tab}>
                <thead><tr><th style={st.th}>Partie</th><th style={st.th}>Jahrgang</th><th style={st.th}>Rebsorte</th><th style={st.thr}>Liter</th></tr></thead>
                <tbody>{partien.filter((p) => (amStichtag.get(p.id) ?? 0) > 0).map((p) => <tr key={p.id}><td style={st.td}>{p.bezeichnung}</td><td style={st.td}>{p.jahrgang}</td><td style={st.td}>{p.rebsorte ?? '—'}</td><td style={st.tdr}>{zahl(amStichtag.get(p.id) ?? 0, 3)}</td></tr>)}</tbody>
              </table>
            )}
            <p style={st.dim}>Gerechnet aus allen Kellerbuch-Einträgen bis einschließlich Stichtag – als Hilfe für die Bestandsmeldung. Ernte-, Erzeugungs- und Bestandsmeldungen gibt der Betrieb selbst ab; ARGONAUT übermittelt nichts an Behörden.</p>
          </div>
        </>
      )}

      {reiter === 'partien' && (laden ? <div style={st.dim}>Lädt …</div> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button style={st.primaer} onClick={() => setNeuP({ ...neuP, auf: !neuP.auf })}>{neuP.auf ? 'Abbrechen' : '＋ Partie'}</button>
          </div>
          {neuP.auf && (
            <div style={st.karte}>
              <div style={st.titel}>Neue Partie (Tank oder Fass)</div>
              <div style={st.reihe}>
                <input style={{ ...st.inp, width: 80 }} placeholder="Jahrgang" inputMode="numeric" value={neuP.jahrgang} onChange={(e) => setNeuP({ ...neuP, jahrgang: e.target.value })} />
                <input style={{ ...st.inp, flex: 2 }} placeholder="Bezeichnung, z. B. 2026 Riesling trocken" value={neuP.bezeichnung} onChange={(e) => setNeuP({ ...neuP, bezeichnung: e.target.value })} />
                <input style={st.inp} placeholder="Rebsorte (bei Cuvée leer)" value={neuP.rebsorte} onChange={(e) => setNeuP({ ...neuP, rebsorte: e.target.value })} />
                <input style={st.inp} placeholder="Tank / Fass" value={neuP.behaelter} onChange={(e) => setNeuP({ ...neuP, behaelter: e.target.value })} />
                <button style={st.primaer} disabled={busy} onClick={() => void partieAnlegen()}>Anlegen</button>
              </div>
            </div>
          )}
          {partien.length === 0 ? (
            <Leerzustand icon="🍇" titel="Noch keine Partien" text="Eine Partie ist ein Tank oder Fass eines Jahrgangs. Hier hinein bucht die Lese den Most, hier wird das Kellerbuch geführt."
              schritte={['„＋ Partie": Jahrgang, Bezeichnung, Rebsorte, Tank', 'Reiter „🍇 Lese": Lese erfassen und den Most in die Partie buchen', 'Partie öffnen: Behandlungen und Analysen eintragen, verschneiden, abfüllen']} aktionText="＋ Partie" onAktion={() => setNeuP({ ...neuP, auf: true })} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(0, 2.4fr)', gap: 14 }}>
              <div style={st.karte}>
                {partien.map((p) => {
                  const b = zahlLesen(String(p.bestand_l)) ?? 0;
                  return (
                    <button key={p.id} onClick={() => oeffnen(p)} style={{ ...st.listeZeile, borderColor: aktivId === p.id ? C.gold : C.rand, opacity: b > 0 ? 1 : 0.6 }}>
                      <span style={{ fontWeight: 800 }}>{p.bezeichnung}</span>
                      <span style={{ color: b > 0 ? C.green : C.dim, fontSize: 12.5 }}>{zahl(b, 1)} l</span>
                      <span style={{ ...st.dim, flexBasis: '100%' }}>{p.jahrgang}{p.rebsorte ? ` · ${p.rebsorte}` : ''}{p.behaelter ? ` · ${p.behaelter}` : ''}</span>
                    </button>
                  );
                })}
              </div>
              <div>
                {!aktiv ? <div style={{ ...st.karte, ...st.dim }}>Partie links auswählen.</div> : (
                  <>
                    <div style={st.karte}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={st.titel}>🛢 {aktiv.bezeichnung}</div>
                        <span style={{ color: bestand > 0 ? C.green : C.dim, fontWeight: 800, fontSize: 18 }}>{zahl(bestand, 3)} l</span>
                      </div>
                      <div style={st.infos}>
                        <span>Jahrgang {aktiv.jahrgang}</span>
                        {aktiv.rebsorte && <span>{aktiv.rebsorte}</span>}
                        {aktiv.behaelter && <span>{aktiv.behaelter}</span>}
                        {analyse && <span>Letzte Analyse {datumDe(analyse.datum)}: {eintragText(analyse)}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button style={st.knopf} onClick={drucken}>🖨 Kellerbuch drucken</button>
                        {istChef && aktivBuch.length === 0 && !lesen.some((l) => l.partie_id === aktiv.id) && <button style={{ ...st.knopf, color: C.rot }} disabled={busy} onClick={() => void partieLoeschen()}>Löschen</button>}
                      </div>
                    </div>

                    <div style={st.karte}>
                      <div style={st.titel}>Kellerbuch – Eintrag</div>
                      <div style={st.reihe}>
                        <select style={st.inp} value={kb.art} onChange={(e) => { const a = kellerArt(e.target.value); setKb({ ...LEER_KB, art: e.target.value, mittelEinheit: a.einheit, datum: kb.datum }); }}>
                          {FREIE_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.icon} {a.name}</option>)}
                        </select>
                        <input type="date" style={st.inp} max={H} value={kb.datum} onChange={(e) => setKb({ ...kb, datum: e.target.value })} title="Datum (leer = heute)" />
                        {kbArt.vorzeichen !== 0 && <input style={{ ...st.inp, width: 110 }} placeholder="Liter" inputMode="decimal" value={kb.menge} onChange={(e) => setKb({ ...kb, menge: e.target.value })} />}
                        {kbArt.key !== 'analyse' && kbArt.vorzeichen === 0 && kbArt.key !== 'sonstiges' && (
                          <>
                            <input style={{ ...st.inp, flex: 2 }} list="p364-mittel" placeholder={kbArt.mittelPflicht ? 'Mittel *' : 'Mittel (optional)'} value={kb.mittel} onChange={(e) => setKb({ ...kb, mittel: e.target.value })} />
                            <datalist id="p364-mittel">{kbArt.mittelVorschlaege.map((m) => <option key={m} value={m} />)}</datalist>
                            <input style={{ ...st.inp, width: 90 }} placeholder="Menge" inputMode="decimal" value={kb.mittelMenge} onChange={(e) => setKb({ ...kb, mittelMenge: e.target.value })} />
                            <input style={{ ...st.inp, width: 60 }} placeholder="Einh." value={kb.mittelEinheit} onChange={(e) => setKb({ ...kb, mittelEinheit: e.target.value })} />
                          </>
                        )}
                        {kbArt.key === 'analyse' && (
                          <>
                            <input style={{ ...st.inp, width: 110 }} placeholder="Alkohol % vol" inputMode="decimal" value={kb.alkohol} onChange={(e) => setKb({ ...kb, alkohol: e.target.value })} />
                            <input style={{ ...st.inp, width: 120 }} placeholder="Restzucker g/l" inputMode="decimal" value={kb.restzucker} onChange={(e) => setKb({ ...kb, restzucker: e.target.value })} />
                            <input style={{ ...st.inp, width: 100 }} placeholder="Säure g/l" inputMode="decimal" value={kb.saeure} onChange={(e) => setKb({ ...kb, saeure: e.target.value })} />
                            <input style={{ ...st.inp, width: 120 }} placeholder="SO₂ frei mg/l" inputMode="decimal" value={kb.so2frei} onChange={(e) => setKb({ ...kb, so2frei: e.target.value })} />
                            <input style={{ ...st.inp, width: 130 }} placeholder="SO₂ gesamt mg/l" inputMode="decimal" value={kb.so2gesamt} onChange={(e) => setKb({ ...kb, so2gesamt: e.target.value })} />
                          </>
                        )}
                        <input style={{ ...st.inp, flex: 1 }} placeholder={kbArt.key === 'sonstiges' ? 'Was wurde gemacht? *' : 'Bemerkung (optional)'} maxLength={1000} value={kb.bemerkung} onChange={(e) => setKb({ ...kb, bemerkung: e.target.value })} />
                        <button style={st.primaer} disabled={busy} onClick={() => void eintragen()}>Eintragen</button>
                      </div>
                      <p style={st.dim}>Das Kellerbuch wird nur fortgeschrieben. Vertippt? Einen Gegeneintrag mit Bemerkung erfassen. Grenzwerte (Anreicherung, Süßung, Schwefel) prüft ARGONAUT nicht.</p>
                    </div>

                    <div style={st.karte}>
                      <div style={st.titel}>Einträge</div>
                      {aktivBuch.length === 0 ? <div style={st.dim}>Noch keine Einträge.</div> : [...aktivBuch].reverse().map((e) => {
                        const a = kellerArt(e.art); const l = zahlLesen(String(e.menge_l ?? ''));
                        return (
                          <div key={e.id} style={st.zeile}>
                            <span style={{ minWidth: 86 }}>{datumDe(e.datum)}</span>
                            <span style={{ minWidth: 190 }}>{a.icon} {a.name}</span>
                            <b style={{ minWidth: 90, color: a.vorzeichen > 0 ? C.green : a.vorzeichen < 0 ? C.warn : C.dim }}>{a.vorzeichen && l != null ? `${a.vorzeichen > 0 ? '+' : '−'} ${zahl(l, 3)} l` : ''}</b>
                            <span style={st.dim}>→ {zahl(e.bestand_nach_l, 3)} l</span>
                            <span style={{ fontSize: 13.5, flex: 1 }}>{eintragText(e)}</span>
                            <span style={st.dim}>{e.erfasst_name ?? '—'}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={st.karte}>
                      <div style={st.titel}>🔀 Verschnitt</div>
                      <div style={st.reihe}>
                        <select style={st.inp} value={vs.nach} onChange={(e) => setVs({ ...vs, nach: e.target.value })}>
                          <option value="">— in Partie —</option>
                          {partien.filter((p) => p.id !== aktiv.id).map((p) => <option key={p.id} value={p.id}>{p.bezeichnung}{p.behaelter ? ` · ${p.behaelter}` : ''}</option>)}
                        </select>
                        <input style={{ ...st.inp, width: 110 }} placeholder="Liter" inputMode="decimal" value={vs.menge} onChange={(e) => setVs({ ...vs, menge: e.target.value })} />
                        <input style={{ ...st.inp, flex: 1 }} placeholder="Bemerkung (optional)" value={vs.bemerkung} onChange={(e) => setVs({ ...vs, bemerkung: e.target.value })} />
                        <button style={st.knopf} disabled={busy || bestand <= 0} onClick={() => void verschneiden()}>Verschneiden</button>
                      </div>
                    </div>

                    <div style={st.karte}>
                      <div style={st.titel}>🍾 Abfüllen</div>
                      <div style={st.reihe}>
                        <label style={st.lab}>Flaschen<input style={{ ...st.inp, width: 100 }} inputMode="numeric" value={af.flaschen} onChange={(e) => setAf({ ...af, flaschen: e.target.value })} /></label>
                        <label style={st.lab}>Inhalt (l)
                          <input style={{ ...st.inp, width: 90 }} list="p364-nenn" inputMode="decimal" value={af.nenn} onChange={(e) => setAf({ ...af, nenn: e.target.value })} />
                          <datalist id="p364-nenn">{NENNVOLUMEN.map((v) => <option key={v} value={String(v).replace('.', ',')} />)}</datalist>
                        </label>
                        <label style={st.lab}>Los / Chargennummer<input style={st.inp} value={af.charge} onChange={(e) => setAf({ ...af, charge: e.target.value })} /></label>
                        <button style={st.primaer} disabled={busy || bestand <= 0} onClick={() => void abfuellen()}>Abfüllen</button>
                      </div>
                      {(() => { const pr = abfuellPruefen(af, bestand); return pr.liter != null ? <p style={{ ...st.dim, color: pr.liter > bestand ? C.rot : C.dim }}>= {zahl(pr.liter, 3)} l von {zahl(bestand, 3)} l</p> : null; })()}
                      <p style={st.dim}>Die Charge wird in Quarantäne angelegt und unter <Link href="/dashboard/chargen" style={{ color: C.gold }}>Chargen</Link> nach der Prüfung freigegeben. Sie nennt die Lese-Nummern und Verschnitt-Partien zur Rückverfolgung.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {offenePartien.length === 0 && partien.length > 0 && <p style={st.dim}>Alle Partien sind leer.</p>}
        </>
      ))}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 22px 64px', maxWidth: 1300, margin: '0 auto' },
  eyebrow: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontSize: 'clamp(24px, 2.3vw, 34px)', fontWeight: 800, margin: 0 },
  sub: { color: C.dim, margin: '8px 0 14px', fontSize: 15, maxWidth: 860, lineHeight: 1.5 },
  err: { color: C.rot, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 12px', margin: '4px 0 12px' },
  karte: { background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 16, marginBottom: 12 },
  titel: { fontWeight: 800, fontSize: 16, marginBottom: 8 },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.rand}`, borderRadius: 9, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', minWidth: 0 },
  lab: { display: 'grid', gap: 4, color: C.dim, fontSize: 12.5 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', alignSelf: 'flex-end' },
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  reiter: { background: 'transparent', color: C.dim, border: `1px solid ${C.rand}`, borderRadius: 999, padding: '7px 14px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  reiterAn: { color: C.navy, background: C.gold, borderColor: C.gold, fontWeight: 800 },
  listeZeile: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between', width: '100%', textAlign: 'left', background: C.navy, color: C.text, border: '1px solid', borderRadius: 10, padding: '8px 10px', marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit' },
  infos: { display: 'flex', gap: 14, flexWrap: 'wrap', color: C.dim, fontSize: 13.5, marginTop: 6 },
  zeile: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.rand}`, padding: '6px 0', fontSize: 14 },
  link: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: 0, textDecoration: 'underline' },
  dim: { color: C.dim, fontSize: 13 },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', color: C.dim, fontSize: 12, padding: '6px 8px', borderBottom: `1px solid ${C.rand}` },
  thr: { textAlign: 'right', color: C.dim, fontSize: 12, padding: '6px 8px', borderBottom: `1px solid ${C.rand}` },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.rand}` },
  tdr: { padding: '6px 8px', borderBottom: `1px solid ${C.rand}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
