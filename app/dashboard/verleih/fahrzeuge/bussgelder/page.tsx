'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/verleih/fahrzeuge/bussgelder — V2a (Paket 293)
//
// Halteranfragen, Anhörungsbögen, Bußgelder, Verwarnungen, Maut zu
// Mietfahrzeugen: Schreiben erfassen (Behörde, Aktenzeichen, Tatzeit, Frist),
// die Datenbank findet den Mieter zum Tatzeitpunkt (tatsächliche Übergabe bis
// Rückgabe), Fahrer aus dem Mietvertrag benennen, Text zum Versenden kopieren,
// Bearbeitungsgebühr als eigene Rechnung. ARGONAUT verschickt nichts an
// Behörden. Logik: lib/fahrzeugMieteV2.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { berlinTag } from '@/lib/fahrzeugMiete';
import {
  VORGANG_ARTEN, VORGANG_STATUS, ZUORDNUNG, PLATZHALTER, vorgangPruefen, mieterZurTatzeit, fristAmpel, fristText,
  gebuehrPruefen, benennungText, wannText, type MietZeit, type Ampel,
} from '@/lib/fahrzeugMieteV2';
import { euro } from '@/lib/geld';
import { zahlFeld } from '@/lib/zahlen';
import Leerzustand from '../../../_components/Leerzustand';
import { useDarfAbrechnen } from '../../../_components/useDarfAbrechnen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };
const AMPEL_FARBE: Record<Ampel, string> = { ueber: C.bad, rot: C.bad, gelb: C.warn, gruen: C.ok, keine: C.dim };

type Fz = { id: string; bezeichnung: string; kennzeichen: string | null };
type Bu = MietZeit & { nummer: string | null; mieter_name: string; mieter_anschrift: string | null };
type Vo = {
  id: string; fahrzeug_id: string; art: string; behoerde: string; aktenzeichen: string; tatzeit: string; tatort: string | null; vorwurf: string | null;
  eingang_am: string; frist_am: string; zuordnung: string; buchung_id: string | null; benannt_fahrer_id: string | null; benannt_name: string | null;
  benannt_am: string | null; status: string; gebuehr_cent: number; gebuehr_ust_satz: number; gebuehr_rechnung_id: string | null; notiz: string | null;
};
type Fahrer = { id: string; name: string; rolle: string; geburtsdatum: string; ergebnis: string };
type Form = { fahrzeugId: string; art: string; behoerde: string; aktenzeichen: string; tatzeit: string; tatort: string; vorwurf: string; eingangAm: string; fristAm: string; notiz: string };

function heute(): string { return berlinTag(Date.now()); }
function datum(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}
const ART_NAME: Record<string, string> = Object.fromEntries(VORGANG_ARTEN.map((a) => [a.key, a.label]));

export default function BussgelderPage() {
  const darfAbrechnen = useDarfAbrechnen();
  const [uid, setUid] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [betriebName, setBetriebName] = useState<string | null>(null);
  const [tab, setTab] = useState<'offen' | 'alle' | 'einstellungen'>('offen');
  const [fz, setFz] = useState<Fz[]>([]);
  const [bu, setBu] = useState<Bu[]>([]);
  const [vo, setVo] = useState<Vo[]>([]);
  const [gebuehr, setGebuehr] = useState('0');
  const [ust, setUst] = useState('19');
  const [begleit, setBegleit] = useState('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [offenId, setOffenId] = useState<string | null>(null);
  const [fahrer, setFahrer] = useState<Fahrer[]>([]);
  const [frage, setFrage] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const id = u?.user?.id ?? null;
    setUid(id);
    if (!id) { setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const betrieb = typeof chef === 'string' && chef ? chef : id;
    setIstChef(betrieb === id);
    const [f, b, v, e, p] = await Promise.all([
      supabase.from('miet_fahrzeug').select('id, bezeichnung, kennzeichen').order('bezeichnung').limit(1000),
      supabase.from('miet_buchung').select('id, nummer, fahrzeug_id, status, uebergabe_am, rueckgabe_ist, mieter_name, mieter_anschrift').in('status', ['uebergeben', 'zurueck']).order('uebergabe_am', { ascending: false }).limit(1000),
      supabase.from('miet_vorgang').select('*').order('frist_am').limit(1000),
      supabase.from('miet_einstellung').select('bearbeitungsgebuehr_cent, gebuehr_ust_satz, benennung_text').maybeSingle(),
      supabase.from('profiles').select('firma_name').eq('id', betrieb).maybeSingle(),
    ]);
    if (v.error) setFehler('Bußgelder und Halteranfragen sind noch nicht eingerichtet (SQL zu Paket 293 fehlt) oder Ihnen fehlt das Recht „Verleih & Vermietung".');
    setFz((f.data as Fz[] | null) ?? []);
    setBu((b.data as Bu[] | null) ?? []);
    setVo((v.data as Vo[] | null) ?? []);
    setGebuehr(zahlFeld((Number(e.data?.bearbeitungsgebuehr_cent) || 0) / 100));
    setUst(String(e.data?.gebuehr_ust_satz ?? 19));
    setBegleit(String(e.data?.benennung_text ?? ''));
    setBetriebName((p.data?.firma_name as string | null | undefined) ?? null);
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const fzName = useCallback((id: string) => { const f = fz.find((x) => x.id === id); return f ? `${f.bezeichnung}${f.kennzeichen ? ` · ${f.kennzeichen}` : ''}` : '—'; }, [fz]);
  const buchung = useCallback((id: string | null) => (id ? bu.find((x) => x.id === id) ?? null : null), [bu]);
  const h = heute();
  const liste = useMemo(() => (tab === 'offen' ? vo.filter((v) => v.status !== 'erledigt') : [...vo].sort((a, b) => b.tatzeit.localeCompare(a.tatzeit))), [vo, tab]);
  const zahlen = useMemo(() => {
    const offen = vo.filter((v) => v.status !== 'erledigt');
    return {
      offen: offen.length,
      eilig: offen.filter((v) => v.status === 'offen' && ['ueber', 'rot'].includes(fristAmpel(v.frist_am, h).ampel)).length,
      ohneMieter: offen.filter((v) => v.zuordnung !== 'mieter').length,
      gebuehrOffen: vo.filter((v) => v.zuordnung === 'mieter' && v.gebuehr_cent > 0 && !v.gebuehr_rechnung_id).length,
    };
  }, [vo, h]);

  // Vorschau: wer hatte das Fahrzeug? (endgültig ordnet die Datenbank zu)
  const vorschau = useMemo(() => {
    if (!form || !form.fahrzeugId || !form.tatzeit) return null;
    return mieterZurTatzeit(bu, form.fahrzeugId, new Date(form.tatzeit).toISOString());
  }, [form, bu]);

  function neu() {
    setOk(null); setFehler(null); setOffenId(null);
    setForm({ fahrzeugId: fz[0]?.id ?? '', art: 'halteranfrage', behoerde: '', aktenzeichen: '', tatzeit: '', tatort: '', vorwurf: '', eingangAm: heute(), fristAm: '', notiz: '' });
  }

  async function speichern() {
    if (!form) return;
    const p = vorgangPruefen({ ...form, tatzeit: form.tatzeit ? new Date(form.tatzeit).toISOString() : '', jetzt: Date.now(), heute: heute() });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_vorgang').insert(p.zeile).select('id, zuordnung');
    setBusy(false);
    if (error || !data || data.length === 0) {
      const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
      setFehler(/23505|duplicate/i.test(m) ? 'Dieses Aktenzeichen dieser Behörde ist schon erfasst.' : /row-level|permission/i.test(m) ? 'Erfassen braucht das Schreibrecht „Verleih & Vermietung".' : 'Der Vorgang wurde nicht gespeichert.');
      return;
    }
    setForm(null);
    setOk(data[0].zuordnung === 'mieter' ? 'Erfasst. Zum Tatzeitpunkt war das Fahrzeug vermietet — Sie können jetzt den Fahrer benennen.' : data[0].zuordnung === 'mehrdeutig' ? 'Erfasst. Zum Tatzeitpunkt überschneiden sich zwei Mieten — bitte Übergabe- und Rückgabezeiten prüfen.' : 'Erfasst. Zum Tatzeitpunkt war das Fahrzeug nicht vermietet.');
    await lade();
    setOffenId(data[0].id);
    await fahrerLaden(data[0].id);
  }

  async function fahrerLaden(vorgangId: string) {
    setFahrer([]);
    // frisch aus der Datenbank — die Zuordnung kann sich gerade geändert haben
    const { data: vz } = await supabase.from('miet_vorgang').select('buchung_id').eq('id', vorgangId).maybeSingle();
    const buchungId = (vz?.buchung_id as string | null | undefined) ?? null;
    if (!buchungId) return;
    const { data } = await supabase.from('miet_fahrer').select('id, name, rolle, geburtsdatum, ergebnis').eq('buchung_id', buchungId).order('rolle');
    setFahrer((data as Fahrer[] | null) ?? []);
  }

  async function oeffnen(id: string) {
    setFrage(null); setOk(null); setFehler(null);
    if (offenId === id) { setOffenId(null); return; }
    setOffenId(id);
    await fahrerLaden(id);
  }

  async function benennen(v: Vo, fahrerId: string) {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_vorgang').update({ benannt_fahrer_id: fahrerId }).eq('id', v.id).eq('status', 'offen').select('id');
    setBusy(false); setFrage(null);
    if (error || !data || data.length === 0) { setFehler(error?.message?.includes('Mietvertrag') ? error.message : 'Nicht benannt — nur offene Vorgänge mit Mieter, und nur mit Schreibrecht „Verleih & Vermietung".'); return; }
    setOk('Fahrer benannt und festgehalten. Kopieren Sie den Text unten und senden Sie ihn innerhalb der Frist an die Behörde.');
    await lade();
  }

  async function neuZuordnen(v: Vo) {
    // Jede Änderung an einem offenen Vorgang lässt die Datenbank den Mieter neu suchen
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_vorgang').update({ notiz: v.notiz }).eq('id', v.id).eq('status', 'offen').select('zuordnung');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler('Nicht neu zugeordnet — dafür braucht es das Schreibrecht „Verleih & Vermietung".'); return; }
    setOk(data[0].zuordnung === 'mieter' ? 'Neu zugeordnet — der Mieter zum Tatzeitpunkt ist gefunden.' : 'Neu geprüft — weiterhin kein eindeutiger Mieter.');
    await lade();
    await fahrerLaden(v.id);
  }

  async function erledigen(v: Vo) {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_vorgang').update({ status: 'erledigt' }).eq('id', v.id).neq('status', 'erledigt').select('id');
    setBusy(false); setFrage(null);
    if (error || !data || data.length === 0) { setFehler('Nicht gespeichert.'); return; }
    setOk('Als erledigt markiert.'); await lade();
  }

  async function loeschen(v: Vo) {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_vorgang').delete().eq('id', v.id).select('id');
    setBusy(false); setFrage(null);
    if (error || !data || data.length === 0) { setFehler('Nicht gelöscht — Löschen darf nur der Chef, und nur ohne Gebühren-Rechnung.'); return; }
    setOffenId(null); setOk('Vorgang gelöscht.'); await lade();
  }

  async function gebuehrRechnung(v: Vo) {
    if (v.gebuehr_rechnung_id) { window.location.href = `/dashboard/rechnungen/${v.gebuehr_rechnung_id}`; return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-bussgeld', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vorgangId: v.id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && !(res.status === 409 && j.rechnungId)) throw new Error(j.error || 'Fehler');
      setOk(res.status === 409 ? 'Für diesen Vorgang gibt es bereits eine Gebühren-Rechnung.' : 'Gebühren-Rechnung erstellt.');
      await lade();
    } catch (e) { setFehler('Rechnung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  async function einstellungSpeichern() {
    if (!uid) return;
    const p = gebuehrPruefen({ betrag: gebuehr, ust, text: begleit });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_einstellung').upsert({ owner_user_id: uid, bearbeitungsgebuehr_cent: p.cent, gebuehr_ust_satz: p.ust, benennung_text: p.text, aktualisiert_am: new Date().toISOString() }, { onConflict: 'owner_user_id' }).select('owner_user_id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler('Nicht gespeichert — die Einstellungen pflegt nur der Chef.'); return; }
    setOk('Gespeichert. Neue Vorgänge übernehmen diese Gebühr; bestehende behalten ihre.');
  }

  async function kopieren(t: string) {
    try { await navigator.clipboard.writeText(t); setOk('Text kopiert.'); } catch { setFehler('Kopieren ging nicht — bitte den Text markieren und kopieren.'); }
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/verleih/fahrzeuge" style={s.zurueck}>← Fahrzeugvermietung</a>
      <h1 style={s.h1}>🚨 Bußgelder &amp; Halteranfragen</h1>
      <p style={s.dim}>
        So geht&apos;s: Kommt eine Halteranfrage, ein Anhörungsbogen oder ein Bußgeldbescheid zu einem Mietfahrzeug, erfassen Sie hier Behörde, Aktenzeichen, Tatzeit und Frist.
        ARGONAUT sucht den Mieter zum Tatzeitpunkt selbst — maßgeblich sind die tatsächliche Übergabe und Rückgabe im Mietvertrag. Danach benennen Sie den Fahrer aus dem Vertrag,
        kopieren den Text und senden ihn selbst an die Behörde. Ist eine Bearbeitungsgebühr in Ihren Mietbedingungen vereinbart, erstellen Sie dafür eine eigene Rechnung.
      </p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}
      {laden && <p style={s.dim}>Lädt …</p>}

      {!laden && (
        <>
          <div style={s.kacheln}>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.offen}</b><span style={s.dim}>offene Vorgänge</span></div>
            <div style={{ ...s.kachel, borderColor: zahlen.eilig ? C.bad : C.border }}><b style={{ ...s.zahl, color: zahlen.eilig ? C.bad : C.text }}>{zahlen.eilig}</b><span style={s.dim}>Frist in 3 Tagen oder vorbei</span></div>
            <div style={{ ...s.kachel, borderColor: zahlen.ohneMieter ? C.warn : C.border }}><b style={{ ...s.zahl, color: zahlen.ohneMieter ? C.warn : C.text }}>{zahlen.ohneMieter}</b><span style={s.dim}>ohne eindeutigen Mieter</span></div>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.gebuehrOffen}</b><span style={s.dim}>Gebühren noch nicht berechnet</span></div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
            {([['offen', '📬 Offen'], ['alle', '📋 Alle'], ...(istChef ? [['einstellungen', '⚙ Gebühr & Begleittext']] : [])] as [typeof tab, string][]).map(([k, l]) => (
              <button key={k} type="button" style={tab === k ? s.tabAn : s.tab} onClick={() => setTab(k)}>{l}</button>
            ))}
            <a href="/dashboard/verleih/fahrzeuge/auslastung" style={{ ...s.tab, textDecoration: 'none' }}>📊 Auslastung &amp; Fristen</a>
            {fz.length > 0 && tab !== 'einstellungen' && !form && <button type="button" style={{ ...s.btnGold, marginLeft: 'auto' }} onClick={neu}>＋ Schreiben erfassen</button>}
          </div>

          {fz.length === 0 && tab !== 'einstellungen' && (
            <Leerzustand icon="🚨" titel="Noch keine Mietfahrzeuge" text="Zuerst die Mietflotte anlegen — dann ordnet ARGONAUT jede Halteranfrage dem Mieter zum Tatzeitpunkt zu." aktionText="Zur Fahrzeugvermietung" onAktion={() => { window.location.href = '/dashboard/verleih/fahrzeuge'; }} />
          )}

          {form && tab !== 'einstellungen' && (
            <div style={s.box}>
              <b style={{ color: C.gold }}>Schreiben der Behörde erfassen</b>
              <div style={s.raster}>
                <label style={s.feld}>Fahrzeug *
                  <select value={form.fahrzeugId} style={s.eingabe} onChange={(e) => setForm({ ...form, fahrzeugId: e.target.value })}>
                    {fz.map((f) => <option key={f.id} value={f.id}>{f.kennzeichen ? `${f.kennzeichen} · ` : ''}{f.bezeichnung}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Was ist gekommen? *
                  <select value={form.art} style={s.eingabe} onChange={(e) => setForm({ ...form, art: e.target.value })}>
                    {VORGANG_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Behörde *<input value={form.behoerde} maxLength={160} style={s.eingabe} onChange={(e) => setForm({ ...form, behoerde: e.target.value })} /></label>
                <label style={s.feld}>Aktenzeichen *<input value={form.aktenzeichen} maxLength={60} style={s.eingabe} onChange={(e) => setForm({ ...form, aktenzeichen: e.target.value })} /></label>
                <label style={s.feld}>Tatzeit (Datum und Uhrzeit) *<input type="datetime-local" value={form.tatzeit} style={s.eingabe} onChange={(e) => setForm({ ...form, tatzeit: e.target.value })} /></label>
                <label style={s.feld}>Tatort<input value={form.tatort} maxLength={200} style={s.eingabe} onChange={(e) => setForm({ ...form, tatort: e.target.value })} /></label>
                <label style={s.feld}>Vorwurf (kurz)<input value={form.vorwurf} maxLength={300} style={s.eingabe} onChange={(e) => setForm({ ...form, vorwurf: e.target.value })} /></label>
                <label style={s.feld}>Eingang am *<input type="date" value={form.eingangAm} style={s.eingabe} onChange={(e) => setForm({ ...form, eingangAm: e.target.value })} /></label>
                <label style={s.feld}>Frist bis *<input type="date" value={form.fristAm} style={s.eingabe} onChange={(e) => setForm({ ...form, fristAm: e.target.value })} /></label>
                <label style={s.feld}>Notiz<input value={form.notiz} maxLength={1000} style={s.eingabe} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
              </div>
              {vorschau && (
                <p style={{ ...s.dim, marginTop: 10, color: vorschau.art === 'mieter' ? C.ok : C.warn }}>
                  {vorschau.art === 'mieter'
                    ? `Zum Tatzeitpunkt vermietet an ${(vorschau.buchung as Bu).mieter_name} (${(vorschau.buchung as Bu).nummer ?? 'Mietvertrag'}).`
                    : vorschau.art === 'mehrdeutig'
                      ? 'Zum Tatzeitpunkt überschneiden sich zwei Mieten — bitte Übergabe- und Rückgabezeiten in den Mietverträgen prüfen.'
                      : 'Zum Tatzeitpunkt war das Fahrzeug laut Übergabe und Rückgabe nicht vermietet.'}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" style={s.btnGold} disabled={busy} onClick={() => void speichern()}>{busy ? 'Speichert …' : '💾 Erfassen'}</button>
                <button type="button" style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {(tab === 'offen' || tab === 'alle') && fz.length > 0 && (
            liste.length === 0 ? <p style={s.dim}>{tab === 'offen' ? 'Keine offenen Vorgänge.' : 'Noch keine Vorgänge erfasst.'}</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tabelle}>
                  <thead><tr><th style={s.th}>Frist</th><th style={{ ...s.th, textAlign: 'left' }}>Aktenzeichen · Behörde</th><th style={{ ...s.th, textAlign: 'left' }}>Fahrzeug · Tatzeit</th><th style={{ ...s.th, textAlign: 'left' }}>Mieter</th><th style={s.th}>Status</th><th style={s.th}>Gebühr</th><th style={s.th}></th></tr></thead>
                  <tbody>
                    {liste.map((v) => {
                      const a = fristAmpel(v.frist_am, h);
                      const b = buchung(v.buchung_id);
                      return (
                        <tr key={v.id}>
                          <td style={{ ...s.td, color: v.status === 'offen' ? AMPEL_FARBE[a.ampel] : C.dim, fontWeight: 700 }}>{datum(v.frist_am)}<div style={{ fontSize: 11.5, fontWeight: 600 }}>{v.status === 'offen' ? fristText(a.tage) : ''}</div></td>
                          <td style={{ ...s.td, textAlign: 'left' }}><b>{v.aktenzeichen}</b><div style={{ color: C.dim, fontSize: 12 }}>{v.behoerde} · {ART_NAME[v.art] ?? v.art}</div></td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{fzName(v.fahrzeug_id)}<div style={{ color: C.dim, fontSize: 12 }}>{wannText(v.tatzeit)}</div></td>
                          <td style={{ ...s.td, textAlign: 'left', color: v.zuordnung === 'mieter' ? C.text : C.warn }}>
                            {b ? <><a href={`/dashboard/verleih/fahrzeuge/${b.id}`} style={{ color: C.gold }}>{b.nummer ?? 'Vertrag'}</a> · {b.mieter_name}</> : ZUORDNUNG[v.zuordnung] ?? v.zuordnung}
                            {v.benannt_name && <div style={{ color: C.ok, fontSize: 12 }}>benannt: {v.benannt_name}</div>}
                          </td>
                          <td style={s.td}>{VORGANG_STATUS[v.status] ?? v.status}</td>
                          <td style={s.td}>{v.gebuehr_cent > 0 ? euro(v.gebuehr_cent / 100) : '—'}{v.gebuehr_rechnung_id && <div style={{ color: C.ok, fontSize: 11.5 }}>berechnet</div>}</td>
                          <td style={s.td}><button type="button" style={s.link} onClick={() => void oeffnen(v.id)}>{offenId === v.id ? 'schließen' : 'öffnen'}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {offenId && tab !== 'einstellungen' && (() => {
            const v = vo.find((x) => x.id === offenId);
            if (!v) return null;
            const b = buchung(v.buchung_id);
            const f = fz.find((x) => x.id === v.fahrzeug_id);
            const benannt = fahrer.find((x) => x.id === v.benannt_fahrer_id) ?? null;
            const text = b && benannt && f ? benennungText({
              begleittext: begleit || null, betrieb: betriebName ?? '',
              vorgang: { behoerde: v.behoerde, aktenzeichen: v.aktenzeichen, tatzeit: v.tatzeit, tatort: v.tatort },
              fahrzeug: { bezeichnung: f.bezeichnung, kennzeichen: f.kennzeichen },
              buchung: { nummer: b.nummer, mieter_name: b.mieter_name, mieter_anschrift: b.mieter_anschrift, uebergabe_am: b.uebergabe_am, rueckgabe_ist: b.rueckgabe_ist },
              fahrer: { name: benannt.name, geburtsdatum: benannt.geburtsdatum, rolle: benannt.rolle },
            }) : null;
            return (
              <div style={s.box}>
                <b style={{ color: C.gold }}>Vorgang {v.aktenzeichen}</b>
                <p style={{ ...s.dim, fontSize: 13 }}>
                  {ART_NAME[v.art] ?? v.art} von {v.behoerde} · Eingang {datum(v.eingang_am)} · Frist {datum(v.frist_am)} · Tatzeit {wannText(v.tatzeit)}{v.tatort ? ` · ${v.tatort}` : ''}{v.vorwurf ? ` · ${v.vorwurf}` : ''}
                  {v.notiz ? <><br />Notiz: {v.notiz}</> : null}
                </p>
                {!b && (
                  <p style={{ ...s.dim, color: C.warn }}>
                    {v.zuordnung === 'mehrdeutig'
                      ? 'Zum Tatzeitpunkt überschneiden sich zwei Mieten dieses Fahrzeugs. Bitte prüfen Sie Übergabe- und Rückgabezeiten in den Mietverträgen.'
                      : 'Zum Tatzeitpunkt war das Fahrzeug laut Übergabe und Rückgabe nicht vermietet — klären Sie intern, wer gefahren ist.'}
                    {v.status === 'offen' && ' Wurde eine Übergabe erst nachträglich erfasst? Dann „🔄 Neu zuordnen".'}
                  </p>
                )}
                {b && v.status === 'offen' && (
                  <>
                    <p style={{ ...s.dim, margin: '8px 0 4px' }}>Fahrer aus dem Mietvertrag {b.nummer} — wen benennen Sie? Die Benennung wird festgehalten und lässt sich nicht mehr ändern.</p>
                    {fahrer.length === 0 && <p style={s.dim}>Im Mietvertrag ist kein Fahrer eingetragen.</p>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {fahrer.map((x) => frage === `b-${x.id}`
                        ? <span key={x.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={s.dim}>{x.name} benennen?</span><button type="button" style={s.btnGold} disabled={busy} onClick={() => void benennen(v, x.id)}>Ja, benennen</button><button type="button" style={s.btnAus} onClick={() => setFrage(null)}>nein</button></span>
                        : <button key={x.id} type="button" style={s.btnAus} onClick={() => setFrage(`b-${x.id}`)}>👤 {x.name} ({x.rolle === 'haupt' ? 'Hauptfahrer' : 'Zusatzfahrer'})</button>)}
                    </div>
                  </>
                )}
                {text && (
                  <>
                    <p style={{ ...s.dim, margin: '10px 0 4px' }}>Text für die Behörde (benannt am {wannText(v.benannt_am)}). Geben Sie nur weiter, was die Behörde verlangt.</p>
                    <textarea readOnly value={text} rows={12} style={{ ...s.eingabe, width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
                    <button type="button" style={{ ...s.btnAus, marginTop: 6 }} onClick={() => void kopieren(text)}>📋 Text kopieren</button>
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {!b && v.status === 'offen' && <button type="button" style={s.btnAus} disabled={busy} onClick={() => void neuZuordnen(v)}>🔄 Neu zuordnen</button>}
                  {v.status !== 'erledigt' && (frage === `e-${v.id}`
                    ? <><button type="button" style={s.btnGold} disabled={busy} onClick={() => void erledigen(v)}>Ja, erledigt</button><button type="button" style={s.btnAus} onClick={() => setFrage(null)}>nein</button></>
                    : <button type="button" style={s.btnAus} onClick={() => setFrage(`e-${v.id}`)}>✓ Erledigt</button>)}
                  {v.zuordnung === 'mieter' && v.gebuehr_cent > 0 && (v.gebuehr_rechnung_id
                    ? <a href={`/dashboard/rechnungen/${v.gebuehr_rechnung_id}`} style={{ ...s.btnAus, textDecoration: 'none' }}>🧾 Gebühren-Rechnung öffnen</a>
                    : darfAbrechnen !== false && <button type="button" style={s.btnGold} disabled={busy} onClick={() => void gebuehrRechnung(v)}>🧾 Bearbeitungsgebühr {euro(v.gebuehr_cent / 100)} netto berechnen</button>)}
                  {istChef && !v.gebuehr_rechnung_id && (frage === `l-${v.id}`
                    ? <><button type="button" style={{ ...s.btnAus, color: C.bad }} disabled={busy} onClick={() => void loeschen(v)}>Ja, löschen</button><button type="button" style={s.btnAus} onClick={() => setFrage(null)}>nein</button></>
                    : <button type="button" style={{ ...s.btnAus, color: C.bad }} onClick={() => setFrage(`l-${v.id}`)}>Löschen</button>)}
                </div>
                {v.zuordnung === 'mieter' && v.gebuehr_cent > 0 && !v.gebuehr_rechnung_id && <p style={{ ...s.dim, fontSize: 12.5 }}>Berechnen Sie die Gebühr nur, wenn sie in Ihren Mietbedingungen vereinbart ist. Das Bußgeld selbst zahlt der Fahrer an die Behörde — es steht nie auf Ihrer Rechnung.</p>}
              </div>
            );
          })()}

          {tab === 'einstellungen' && istChef && (
            <div style={s.box}>
              <b style={{ color: C.gold }}>⚙ Bearbeitungsgebühr und Begleittext</b>
              <p style={{ ...s.dim, fontSize: 13 }}>
                Die Gebühr gilt für neu erfasste Vorgänge (bestehende behalten ihre). Berechnen dürfen Sie sie nur, wenn sie in Ihren Mietbedingungen vereinbart ist.
                Ob Umsatzsteuer anfällt, klären Sie mit Ihrem Steuerberater. 0 € = keine Gebühr.
              </p>
              <div style={{ ...s.raster, maxWidth: 520 }}>
                <label style={s.feld}>Bearbeitungsgebühr € (netto)<input inputMode="decimal" value={gebuehr} style={s.eingabe} onChange={(e) => setGebuehr(e.target.value)} /></label>
                <label style={s.feld}>Umsatzsteuer
                  <select value={ust} style={s.eingabe} onChange={(e) => setUst(e.target.value)}><option value="19">19 %</option><option value="0">0 %</option></select>
                </label>
              </div>
              <p style={{ ...s.dim, fontSize: 13, marginTop: 12 }}>
                Begleittext zur Fahrerbenennung (Ihr eigener Text — ARGONAUT liefert keinen Mustertext). Platzhalter: {PLATZHALTER.join(' ')}
              </p>
              <textarea value={begleit} rows={8} maxLength={4000} style={{ ...s.eingabe, width: '100%', boxSizing: 'border-box' }} onChange={(e) => setBegleit(e.target.value)} />
              <button type="button" style={{ ...s.btnGold, marginTop: 8 }} disabled={busy} onClick={() => void einstellungSpeichern()}>💾 Speichern</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1200, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '10px 0 6px' },
  dim: { color: C.dim, fontSize: 14, lineHeight: 1.55, margin: '4px 0 10px' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '6px 0 14px' },
  kachel: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 2 },
  zahl: { fontSize: 22, fontWeight: 800 },
  box: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', margin: '12px 0' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 8 },
  feld: { display: 'grid', gap: 4, fontSize: 13.5, color: C.dim },
  eingabe: { background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  tab: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 20, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600 },
  tabAn: { background: 'rgba(201,168,76,0.15)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 20, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700 },
  link: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 13 },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginTop: 10 },
  th: { textAlign: 'center', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { textAlign: 'center', padding: '7px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
};
