'use client';

// ============================================================================
// ARGONAUT OS · Paket 363 (13.10.2026) · A4e Fachpaket Lebensmittel-Herstellung
// Herstellungsprotokoll für Sud (Brauerei), Milchverarbeitung, Mahlgang (Mühle)
// und jede andere Herstellung: Schritte mit Messwerten, Rohstoff-Chargen,
// Soll/Ist, Ausbeute. Abschluss legt die Produkt-Charge (Quarantäne) mit
// Rückverfolgung an. Sud-Übersicht je Monat (hl je °P) als Hilfe.
// Logik: lib/herstellung.ts · SQL: supabase-sql/p363-herstellung.sql
// ============================================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import {
  ARTEN, SCHRITTE, artInfo, ausbeute, zahlLesen, protokollPruefen, messungPruefen, abschlussPruefen, chargenVorschlag,
  nachSchritt, sudUebersicht, protokollHtml, type Art, type ProtokollRoh, type MessungRoh, type RohstoffRoh,
} from '@/lib/herstellung';
import { lokalZuIso } from '@/lib/anrufSitzung';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import Leerzustand from '../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)', rot: '#E06666', warn: '#E0A24C' };
type Rezeptur = { id: string; name: string; typ: string | null; basis_menge: number | null; basis_einheit: string | null };
type Los = { charge_nr: string; bezeichnung: string | null; status: string | null; einheit: string | null };
const STATUS_FARBE: Record<string, string> = { offen: C.cyan, abgeschlossen: C.green, storniert: C.rot };

function heuteBerlin(): string { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date()); }
function zeit(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
function zahl(x: unknown, k = 2): string { const v = typeof x === 'number' ? x : zahlLesen(x as string); return v == null ? '—' : v.toLocaleString('de-DE', { maximumFractionDigits: k }); }

export default function HerstellungSeite() {
  const [ich, setIch] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [liste, setListe] = useState<ProtokollRoh[]>([]);
  const [rezepturen, setRezepturen] = useState<Rezeptur[]>([]);
  const [lose, setLose] = useState<Los[]>([]);
  const [bereit, setBereit] = useState(true);
  const [laden, setLaden] = useState(true);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reiter, setReiter] = useState<'protokolle' | 'sud'>('protokolle');
  const [neuAuf, setNeuAuf] = useState(false);
  const [neu, setNeu] = useState({ art: 'sud' as string, bezeichnung: '', rezeptur: '', soll: '', einheit: 'l' });
  const [aktivId, setAktivId] = useState<string | null>(null);
  const [messungen, setMessungen] = useState<MessungRoh[]>([]);
  const [rohstoffe, setRohstoffe] = useState<RohstoffRoh[]>([]);
  const [mw, setMw] = useState({ schritt: '', groesse: '', wert: '', einheit: '', bemerkung: '', zeit: '' });
  const [rs, setRs] = useState({ bezeichnung: '', charge: '', menge: '', einheit: 'kg' });
  const [ab, setAb] = useState({ ist: '', charge: '', mhd: '', stammwuerze: '' });
  const [storno, setStorno] = useState('');
  const [monat, setMonat] = useState(() => heuteBerlin().slice(0, 7));

  const fehler = (t: string) => setMeldung({ ok: false, text: t });
  const gut = (t: string) => setMeldung({ ok: true, text: t });
  const istChef = !!ich && ich === betrieb;

  const ladeListe = useCallback(async () => {
    const { data, error } = await supabase.from('herstell_protokoll').select('*').order('erstellt_am', { ascending: false }).limit(1000);
    setBereit(!error);
    setListe(error ? [] : ((data as ProtokollRoh[]) ?? []));
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
      const [r, l] = await Promise.all([
        supabase.from('rezepturen').select('id, name, typ, basis_menge, basis_einheit').order('name').limit(1000),
        supabase.from('charge_los').select('charge_nr, bezeichnung, status, einheit').in('status', ['freigegeben']).order('created_at', { ascending: false }).limit(1000),
      ]);
      setRezepturen(r.error ? [] : ((r.data as Rezeptur[]) ?? []));
      setLose(l.error ? [] : ((l.data as Los[]) ?? []));
      await ladeListe();
    })();
  }, [ladeListe]);

  const aktiv = useMemo(() => liste.find((p) => p.id === aktivId) ?? null, [liste, aktivId]);

  const ladeDetail = useCallback(async (id: string) => {
    const [m, r] = await Promise.all([
      supabase.from('herstell_messung').select('id, schritt, groesse, wert, einheit, bemerkung, gemessen_am, erfasst_name').eq('protokoll_id', id).order('gemessen_am').limit(2000),
      supabase.from('herstell_rohstoff').select('id, bezeichnung, charge_nr, menge, einheit').eq('protokoll_id', id).order('erfasst_am'),
    ]);
    setMessungen(((m.data as MessungRoh[]) ?? []));
    setRohstoffe(((r.data as RohstoffRoh[]) ?? []));
  }, []);

  function oeffnen(p: ProtokollRoh) {
    setAktivId(p.id); setMeldung(null);
    const art = (p.art as Art) in SCHRITTE ? (p.art as Art) : 'ansatz';
    setMw({ schritt: SCHRITTE[art][0]?.schritt ?? '', groesse: SCHRITTE[art][0]?.groessen[0]?.groesse ?? '', wert: '', einheit: SCHRITTE[art][0]?.groessen[0]?.einheit ?? '', bemerkung: '', zeit: '' });
    setAb({ ist: '', charge: chargenVorschlag(p), mhd: '', stammwuerze: p.stammwuerze_p != null ? String(p.stammwuerze_p).replace('.', ',') : '' });
    setRs({ bezeichnung: '', charge: '', menge: '', einheit: p.art === 'sud' || p.art === 'milch' ? 'kg' : 'kg' });
    setStorno('');
    void ladeDetail(p.id);
  }

  async function anlegen() {
    const pr = protokollPruefen({ art: neu.art, bezeichnung: neu.bezeichnung, soll: neu.soll, einheit: neu.einheit });
    if (pr.fehler.length || !betrieb) { fehler(pr.fehler.join(' ')); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('herstell_protokoll').insert({
        owner_user_id: betrieb, art: neu.art, bezeichnung: neu.bezeichnung.trim(), rezeptur_id: neu.rezeptur || null, soll_menge: pr.soll, einheit: neu.einheit.trim(),
      }).select('*').single();
      if (error || !data) { fehler(error ? (/Modul|security/.test(error.message) ? 'Nicht angelegt — dafür ist das Schreibrecht „Herstellung" nötig.' : 'Nicht angelegt — fehlt SQL Paket 363? ' + error.message) : 'Nicht angelegt.'); return; }
      setNeuAuf(false); setNeu({ art: neu.art, bezeichnung: '', rezeptur: '', soll: '', einheit: artInfo(neu.art).einheit });
      await ladeListe();
      oeffnen(data as ProtokollRoh);
      gut(`Protokoll ${(data as ProtokollRoh).nummer} angelegt.`);
    } finally { setBusy(false); }
  }

  function rezepturWahl(id: string) {
    const r = rezepturen.find((x) => x.id === id);
    setNeu((n) => ({ ...n, rezeptur: id, bezeichnung: n.bezeichnung || r?.name || '', soll: n.soll || (r?.basis_menge ? String(r.basis_menge).replace('.', ',') : ''), einheit: r?.basis_einheit || n.einheit }));
  }

  async function messungSpeichern() {
    if (!aktiv || !betrieb) return;
    const gemessen = mw.zeit ? lokalZuIso(mw.zeit) : null;
    const pr = messungPruefen(mw, gemessen, new Date());
    if (pr.fehler.length) { fehler(pr.fehler.join(' ')); return; }
    setBusy(true); setMeldung(null);
    try {
      const zeile: Record<string, unknown> = { owner_user_id: betrieb, protokoll_id: aktiv.id, schritt: mw.schritt.trim(), groesse: mw.groesse.trim(), wert: pr.wert, einheit: mw.einheit.trim() || null, bemerkung: mw.bemerkung.trim() || null };
      if (gemessen) zeile.gemessen_am = gemessen;
      const { error } = await supabase.from('herstell_messung').insert(zeile);
      if (error) { fehler(/Zukunft|abgeschlossen|Betrieb/.test(error.message) ? error.message : 'Nicht gespeichert — dafür ist das Schreibrecht „Herstellung" nötig.'); return; }
      setMw((m) => ({ ...m, wert: '', bemerkung: '', zeit: '' }));
      await ladeDetail(aktiv.id);
    } finally { setBusy(false); }
  }

  async function rohstoffSpeichern() {
    if (!aktiv || !betrieb) return;
    if (!rs.bezeichnung.trim()) { fehler('Bitte den Rohstoff angeben.'); return; }
    const menge = rs.menge.trim() ? zahlLesen(rs.menge) : null;
    if (rs.menge.trim() && (menge == null || menge <= 0)) { fehler('Die Menge muss eine Zahl größer als 0 sein.'); return; }
    setBusy(true); setMeldung(null);
    try {
      const { error } = await supabase.from('herstell_rohstoff').insert({ owner_user_id: betrieb, protokoll_id: aktiv.id, bezeichnung: rs.bezeichnung.trim(), charge_nr: rs.charge.trim() || null, menge, einheit: rs.einheit.trim() || null });
      if (error) { fehler(/abgeschlossen|Betrieb/.test(error.message) ? error.message : 'Nicht gespeichert — dafür ist das Schreibrecht „Herstellung" nötig.'); return; }
      setRs({ bezeichnung: '', charge: '', menge: '', einheit: rs.einheit });
      await ladeDetail(aktiv.id);
    } finally { setBusy(false); }
  }

  async function rohstoffWeg(r: RohstoffRoh) {
    if (!aktiv || !r.id) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('herstell_rohstoff').delete().eq('id', r.id).select('id');
      if (error || nichtsGeschrieben(data)) { fehler(error?.message ?? 'Nicht entfernt — fehlendes Recht.'); return; }
      await ladeDetail(aktiv.id);
    } finally { setBusy(false); }
  }

  async function abschliessen() {
    if (!aktiv) return;
    const pr = abschlussPruefen(aktiv.art, ab, heuteBerlin());
    if (pr.fehler.length) { fehler(pr.fehler.join(' ')); return; }
    if (!window.confirm(`Protokoll ${aktiv.nummer} abschließen? Danach lässt es sich nicht mehr ändern; die Charge ${ab.charge.trim()} wird in Quarantäne angelegt.`)) return;
    setBusy(true); setMeldung(null);
    try {
      const { error } = await supabase.rpc('p363_abschliessen', { p_protokoll: aktiv.id, p_ist_menge: pr.ist, p_charge_nr: ab.charge.trim(), p_mhd: ab.mhd || null, p_stammwuerze: pr.stammwuerze });
      if (error) { fehler(error.message.includes('security') ? 'Nicht abgeschlossen — dafür ist auch das Schreibrecht „Chargen" nötig.' : error.message); return; }
      gut(`Abgeschlossen. Die Charge ${ab.charge.trim()} steht in Quarantäne — nach der Prüfung unter Chargen freigeben.`);
      await ladeListe();
      await ladeDetail(aktiv.id);
    } finally { setBusy(false); }
  }

  async function stornieren() {
    if (!aktiv) return;
    if (storno.trim().length < 10) { fehler('Bitte einen Storno-Grund angeben (mindestens 10 Zeichen).'); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('herstell_protokoll').update({ status: 'storniert', storno_grund: storno.trim() }).eq('id', aktiv.id).select('id');
      if (error) { fehler(error.message); return; }
      if (nichtsGeschrieben(data)) { fehler('Stornieren kann nur die Geschäftsleitung.'); return; }
      gut('Protokoll storniert. Es bleibt als Nachweis gespeichert.' + (aktiv.charge_nr ? ` Die Charge ${aktiv.charge_nr} bitte unter Chargen sperren.` : ''));
      await ladeListe();
    } finally { setBusy(false); }
  }

  async function loeschen() {
    if (!aktiv || !window.confirm(`Offenes Protokoll ${aktiv.nummer} ohne Messwerte löschen?`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('herstell_protokoll').delete().eq('id', aktiv.id).select('id');
      if (error) { fehler(error.message); return; }
      if (nichtsGeschrieben(data)) { fehler('Löschen kann nur die Geschäftsleitung.'); return; }
      setAktivId(null); await ladeListe();
    } finally { setBusy(false); }
  }

  function drucken() {
    if (!aktiv) return;
    const w = window.open('', '_blank');
    if (!w) { fehler('Bitte Pop-ups für den Druck erlauben.'); return; }
    w.document.write(protokollHtml(aktiv, messungen, rohstoffe, firma));
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  const art = (aktiv && (aktiv.art as Art) in SCHRITTE ? aktiv.art : 'ansatz') as Art;
  const schrittInfo = SCHRITTE[art].find((s) => s.schritt === mw.schritt);
  const gruppen = useMemo(() => (aktiv ? nachSchritt(aktiv.art, messungen) : []), [aktiv, messungen]);
  const sud = useMemo(() => sudUebersicht(liste, monat), [liste, monat]);
  const hatSud = liste.some((p) => p.art === 'sud');

  return (
    <div style={st.seite}>
      <div style={st.eyebrow}>ARGONAUT OS · Herstellung</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={st.h1}>🏭 Herstellungsprotokoll</h1>
          <p style={st.sub}>Sud, Milchverarbeitung, Mahlgang oder eigener Ansatz: Messwerte je Schritt, eingesetzte Rohstoff-Chargen, Soll und Ist. Beim Abschluss entsteht die Charge mit Rückverfolgung – gesperrte Rohstoffe lassen sich nicht verwenden.</p>
        </div>
        <button style={st.primaer} onClick={() => setNeuAuf(!neuAuf)}>{neuAuf ? 'Abbrechen' : '＋ Neues Protokoll'}</button>
      </div>
      {!bereit && <div style={st.err}>Diese Seite braucht SQL Paket 363. Bitte zuerst einspielen.</div>}
      {meldung && <div style={{ ...st.err, color: meldung.ok ? C.green : C.rot, borderColor: (meldung.ok ? C.green : C.rot) + '55', background: 'transparent' }}>{meldung.text}</div>}

      {neuAuf && (
        <div style={st.karte}>
          <div style={st.titel}>Neues Protokoll</div>
          <div style={st.reihe}>
            <select style={st.inp} value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value, einheit: artInfo(e.target.value).einheit })}>
              {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.icon} {a.name}</option>)}
            </select>
            {rezepturen.length > 0 && (
              <select style={st.inp} value={neu.rezeptur} onChange={(e) => rezepturWahl(e.target.value)}>
                <option value="">— Rezeptur (optional) —</option>
                {rezepturen.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <input style={{ ...st.inp, flex: 2 }} placeholder="Bezeichnung, z. B. Pils Sud 14" value={neu.bezeichnung} onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} />
            <input style={{ ...st.inp, width: 110 }} placeholder="Soll-Menge" inputMode="decimal" value={neu.soll} onChange={(e) => setNeu({ ...neu, soll: e.target.value })} />
            <input style={{ ...st.inp, width: 70 }} placeholder="Einheit" value={neu.einheit} onChange={(e) => setNeu({ ...neu, einheit: e.target.value })} />
            <button style={st.primaer} disabled={busy} onClick={() => void anlegen()}>Anlegen</button>
          </div>
        </div>
      )}

      {hatSud && (
        <div style={{ display: 'flex', gap: 8, margin: '4px 0 12px' }}>
          <button style={{ ...st.reiter, ...(reiter === 'protokolle' ? st.reiterAn : {}) }} onClick={() => setReiter('protokolle')}>📋 Protokolle</button>
          <button style={{ ...st.reiter, ...(reiter === 'sud' ? st.reiterAn : {}) }} onClick={() => setReiter('sud')}>🍺 Sud-Übersicht</button>
        </div>
      )}

      {reiter === 'sud' && hatSud && (
        <div style={st.karte}>
          <div style={{ ...st.reihe, marginBottom: 10 }}>
            <span style={st.titel}>Abgeschlossene Sude im Monat</span>
            <input type="month" style={st.inp} value={monat} onChange={(e) => setMonat(e.target.value)} />
          </div>
          {sud.zeilen.length === 0 ? <div style={st.dim}>Keine abgeschlossenen Sude in diesem Monat.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr><th style={st.th}>Stammwürze</th><th style={st.thr}>Sude</th><th style={st.thr}>Hektoliter</th></tr></thead>
              <tbody>
                {sud.zeilen.map((z) => <tr key={z.stammwuerze}><td style={st.td}>{zahl(z.stammwuerze, 1)} °P</td><td style={st.tdr}>{z.sude}</td><td style={st.tdr}>{zahl(z.hl, 3)} hl</td></tr>)}
                <tr><td style={{ ...st.td, fontWeight: 800 }}>Summe</td><td style={st.tdr}></td><td style={{ ...st.tdr, fontWeight: 800 }}>{zahl(sud.summeHl, 3)} hl</td></tr>
              </tbody>
            </table>
          )}
          {sud.ohneHl > 0 && <p style={{ ...st.dim, color: C.warn }}>{sud.ohneHl} Sud(e) ohne Menge in l/hl oder ohne Stammwürze – nicht mitgezählt.</p>}
          <p style={st.dim}>Nur eine Hilfe für die eigene Biersteuer-Anmeldung: ARGONAUT berechnet keine Biersteuer und übermittelt nichts an den Zoll. Maßgeblich ist die Menge, die das Steuerlager verlässt.</p>
        </div>
      )}

      {reiter === 'protokolle' && (laden ? <div style={st.dim}>Lädt …</div> : liste.length === 0 ? (
        <Leerzustand icon="🏭" titel="Noch keine Herstellungsprotokolle" text="Das erste Protokoll anlegen – z. B. für den nächsten Sud oder die nächste Pasteurisierung."
          schritte={['„＋ Neues Protokoll": Art, Bezeichnung, Soll-Menge', 'Rohstoffe mit Charge eintragen, Messwerte je Schritt erfassen', '„Abschließen": Ist-Menge und Chargennummer – die Charge entsteht automatisch']} aktionText="＋ Neues Protokoll" onAktion={() => setNeuAuf(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(0, 2.4fr)', gap: 14 }}>
          <div style={st.karte}>
            {liste.map((p) => (
              <button key={p.id} onClick={() => oeffnen(p)} style={{ ...st.listeZeile, borderColor: aktivId === p.id ? C.gold : C.rand }}>
                <span style={{ fontWeight: 800 }}>{artInfo(p.art).icon} {p.nummer}</span>
                <span style={{ color: STATUS_FARBE[p.status] ?? C.dim, fontSize: 12.5 }}>{p.status}</span>
                <span style={{ flexBasis: '100%', fontSize: 13.5 }}>{p.bezeichnung}</span>
                <span style={{ ...st.dim, flexBasis: '100%' }}>{zeit(p.begonnen_am)}{p.charge_nr ? ` · Charge ${p.charge_nr}` : ''}</span>
              </button>
            ))}
          </div>

          <div>
            {!aktiv ? <div style={{ ...st.karte, ...st.dim }}>Protokoll links auswählen.</div> : (
              <>
                <div style={st.karte}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={st.titel}>{artInfo(aktiv.art).icon} {aktiv.nummer} · {aktiv.bezeichnung}</div>
                    <span style={{ color: STATUS_FARBE[aktiv.status], fontWeight: 800 }}>{aktiv.status}</span>
                  </div>
                  <div style={st.infos}>
                    <span>Begonnen {zeit(aktiv.begonnen_am)} · {aktiv.erfasst_name ?? '—'}</span>
                    <span>Soll {zahl(aktiv.soll_menge)} {aktiv.einheit}</span>
                    {aktiv.ist_menge != null && <span>Ist {zahl(aktiv.ist_menge)} {aktiv.einheit}{ausbeute(zahlLesen(String(aktiv.soll_menge ?? '')), zahlLesen(String(aktiv.ist_menge))) != null ? ` · Ausbeute ${zahl(ausbeute(Number(aktiv.soll_menge), Number(aktiv.ist_menge)), 1)} %` : ''}</span>}
                    {aktiv.stammwuerze_p != null && <span>Stammwürze {zahl(aktiv.stammwuerze_p, 1)} °P</span>}
                    {aktiv.charge_nr && <span>Charge <Link href="/dashboard/chargen" style={{ color: C.gold }}>{aktiv.charge_nr}</Link></span>}
                    {aktiv.storno_grund && <span style={{ color: C.rot }}>Storno: {aktiv.storno_grund}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button style={st.knopf} onClick={drucken}>🖨 Protokoll drucken</button>
                    {istChef && aktiv.status === 'offen' && messungen.length === 0 && <button style={{ ...st.knopf, color: C.rot }} disabled={busy} onClick={() => void loeschen()}>Löschen</button>}
                  </div>
                </div>

                <div style={st.karte}>
                  <div style={st.titel}>Rohstoffe</div>
                  {rohstoffe.length === 0 ? <div style={st.dim}>Noch keine Rohstoffe eingetragen.</div> : rohstoffe.map((r) => (
                    <div key={r.id} style={st.zeile}>
                      <span style={{ minWidth: 180 }}>{r.bezeichnung}</span>
                      <span style={st.dim}>Charge {r.charge_nr ?? '—'}</span>
                      <span>{zahl(r.menge, 3)} {r.einheit ?? ''}</span>
                      {aktiv.status === 'offen' && <button style={st.link} disabled={busy} onClick={() => void rohstoffWeg(r)}>entfernen</button>}
                    </div>
                  ))}
                  {aktiv.status === 'offen' && (
                    <div style={{ ...st.reihe, marginTop: 10 }}>
                      <input style={{ ...st.inp, flex: 2 }} placeholder="Rohstoff, z. B. Pilsner Malz" value={rs.bezeichnung} onChange={(e) => setRs({ ...rs, bezeichnung: e.target.value })} />
                      <input style={st.inp} list="p363-lose" placeholder="Charge (freigegeben)" value={rs.charge} onChange={(e) => {
                        const l = lose.find((x) => x.charge_nr === e.target.value);
                        setRs({ ...rs, charge: e.target.value, bezeichnung: rs.bezeichnung || l?.bezeichnung || '', einheit: l?.einheit || rs.einheit });
                      }} />
                      <datalist id="p363-lose">{lose.map((l) => <option key={l.charge_nr} value={l.charge_nr}>{l.bezeichnung ?? ''}</option>)}</datalist>
                      <input style={{ ...st.inp, width: 100 }} placeholder="Menge" inputMode="decimal" value={rs.menge} onChange={(e) => setRs({ ...rs, menge: e.target.value })} />
                      <input style={{ ...st.inp, width: 64 }} placeholder="Einh." value={rs.einheit} onChange={(e) => setRs({ ...rs, einheit: e.target.value })} />
                      <button style={st.knopf} disabled={busy} onClick={() => void rohstoffSpeichern()}>＋ Rohstoff</button>
                    </div>
                  )}
                </div>

                <div style={st.karte}>
                  <div style={st.titel}>Messwerte</div>
                  {aktiv.status === 'offen' && (
                    <div style={{ ...st.reihe, marginBottom: 12 }}>
                      <input style={st.inp} list="p363-schritte" placeholder="Schritt" value={mw.schritt} onChange={(e) => {
                        const s = SCHRITTE[art].find((x) => x.schritt === e.target.value);
                        setMw({ ...mw, schritt: e.target.value, groesse: s?.groessen[0]?.groesse ?? mw.groesse, einheit: s?.groessen[0]?.einheit ?? mw.einheit });
                      }} />
                      <datalist id="p363-schritte">{SCHRITTE[art].map((s) => <option key={s.schritt} value={s.schritt} />)}</datalist>
                      <input style={st.inp} list="p363-groessen" placeholder="Messgröße" value={mw.groesse} onChange={(e) => {
                        const g = schrittInfo?.groessen.find((x) => x.groesse === e.target.value);
                        setMw({ ...mw, groesse: e.target.value, einheit: g ? g.einheit : mw.einheit });
                      }} />
                      <datalist id="p363-groessen">{(schrittInfo?.groessen ?? []).map((g) => <option key={g.groesse} value={g.groesse} />)}</datalist>
                      <input style={{ ...st.inp, width: 100 }} placeholder="Wert" inputMode="decimal" value={mw.wert} onChange={(e) => setMw({ ...mw, wert: e.target.value })} />
                      <input style={{ ...st.inp, width: 64 }} placeholder="Einh." value={mw.einheit} onChange={(e) => setMw({ ...mw, einheit: e.target.value })} />
                      <input style={{ ...st.inp, flex: 1 }} placeholder="Bemerkung (optional)" maxLength={500} value={mw.bemerkung} onChange={(e) => setMw({ ...mw, bemerkung: e.target.value })} />
                      <input type="datetime-local" style={st.inp} value={mw.zeit} onChange={(e) => setMw({ ...mw, zeit: e.target.value })} title="Messzeitpunkt (leer = jetzt)" />
                      <button style={st.primaer} disabled={busy} onClick={() => void messungSpeichern()}>Speichern</button>
                    </div>
                  )}
                  {gruppen.length === 0 ? <div style={st.dim}>Noch keine Messwerte.</div> : gruppen.map((g) => (
                    <div key={g.schritt} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{g.schritt}</div>
                      {g.werte.map((w) => (
                        <div key={w.id} style={st.zeile}>
                          <span style={{ minWidth: 150 }}>{w.groesse}</span>
                          <b style={{ minWidth: 90 }}>{w.wert == null ? '—' : `${zahl(w.wert, 3)} ${w.einheit ?? ''}`}</b>
                          <span style={st.dim}>{zeit(w.gemessen_am)} · {w.erfasst_name ?? '—'}</span>
                          {w.bemerkung && <span style={{ fontSize: 13.5 }}>„{w.bemerkung}"</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                  {aktiv.status === 'offen' && <p style={st.dim}>Messwerte werden nur angehängt. Vertippt? Einfach einen neuen Wert mit Bemerkung „Korrektur" erfassen.</p>}
                </div>

                {aktiv.status === 'offen' && (
                  <div style={st.karte}>
                    <div style={st.titel}>Abschließen</div>
                    <div style={st.reihe}>
                      <label style={st.lab}>Ist-Menge ({aktiv.einheit})<input style={st.inp} inputMode="decimal" value={ab.ist} onChange={(e) => setAb({ ...ab, ist: e.target.value })} /></label>
                      <label style={st.lab}>Chargennummer<input style={st.inp} value={ab.charge} onChange={(e) => setAb({ ...ab, charge: e.target.value })} /></label>
                      <label style={st.lab}>MHD (optional)<input type="date" style={st.inp} value={ab.mhd} onChange={(e) => setAb({ ...ab, mhd: e.target.value })} /></label>
                      {aktiv.art === 'sud' && <label style={st.lab}>Stammwürze (°P)<input style={{ ...st.inp, width: 90 }} inputMode="decimal" value={ab.stammwuerze} onChange={(e) => setAb({ ...ab, stammwuerze: e.target.value })} /></label>}
                      <button style={st.primaer} disabled={busy} onClick={() => void abschliessen()}>✓ Abschließen</button>
                    </div>
                    {zahlLesen(ab.ist) != null && aktiv.soll_menge != null && <p style={st.dim}>Ausbeute: {zahl(ausbeute(Number(aktiv.soll_menge), zahlLesen(ab.ist)), 1)} %</p>}
                    <p style={st.dim}>Die Charge wird in Quarantäne angelegt und erst nach der Prüfung unter „Chargen" freigegeben. Rohstoffe aus gesperrten Chargen lehnt das System ab.</p>
                  </div>
                )}

                {istChef && aktiv.status !== 'storniert' && (
                  <div style={st.karte}>
                    <div style={st.titel}>Stornieren (Geschäftsleitung)</div>
                    <div style={st.reihe}>
                      <input style={{ ...st.inp, flex: 1 }} placeholder="Grund, z. B. Sud verworfen – Infektion" value={storno} onChange={(e) => setStorno(e.target.value)} />
                      <button style={{ ...st.knopf, color: C.rot }} disabled={busy} onClick={() => void stornieren()}>Stornieren</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
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
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', alignSelf: 'flex-start' },
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  reiter: { background: 'transparent', color: C.dim, border: `1px solid ${C.rand}`, borderRadius: 999, padding: '7px 14px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  reiterAn: { color: C.navy, background: C.gold, borderColor: C.gold, fontWeight: 800 },
  listeZeile: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between', width: '100%', textAlign: 'left', background: C.navy, color: C.text, border: '1px solid', borderRadius: 10, padding: '8px 10px', marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit' },
  infos: { display: 'flex', gap: 14, flexWrap: 'wrap', color: C.dim, fontSize: 13.5, marginTop: 6 },
  zeile: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.rand}`, padding: '6px 0', fontSize: 14 },
  link: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: 0, textDecoration: 'underline' },
  dim: { color: C.dim, fontSize: 13 },
  th: { textAlign: 'left', color: C.dim, fontSize: 12, padding: '6px 8px', borderBottom: `1px solid ${C.rand}` },
  thr: { textAlign: 'right', color: C.dim, fontSize: 12, padding: '6px 8px', borderBottom: `1px solid ${C.rand}` },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.rand}` },
  tdr: { padding: '6px 8px', borderBottom: `1px solid ${C.rand}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
