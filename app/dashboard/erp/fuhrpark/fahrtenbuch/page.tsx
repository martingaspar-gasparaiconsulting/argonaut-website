'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/erp/fuhrpark/fahrtenbuch — F1b Fahrtenbuch und Ladestrom (Paket 290)
//
// Fahrten je Fahrzeug und Monat, km-Vorschlag, Lücken/Überschneidungen,
// „nachgetragen" und „geändert" sichtbar, Ändern nur mit Grund (die Datenbank
// protokolliert), Löschen und Monatsabschluss nur Chef. Darunter Ladestrom zu
// Hause (kWh × Preis je kWh). Logik: lib/fahrtenbuch.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ARTEN, fahrtPruefen, grundPruefen, kmVorschlag, kettePruefen, nachgetragen, auswertung, abschliessbar, monatVon, ladestromPruefen,
  type Fahrt,
} from '@/lib/fahrtenbuch';
import { euro, menge } from '@/lib/geld';
import Leerzustand from '../../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };

type Fz = { id: string; bezeichnung: string; kennzeichen: string | null };
type FahrtVoll = Fahrt & { id: string; fahrzeug_id: string; start_ort: string | null; ziel: string | null; zweck: string | null; partner: string | null; fahrer_name: string | null; aenderung_grund: string | null };
type Ma = { id: string; vorname: string | null; nachname: string | null };
type Lade = { id: string; person_name: string; monat: string; kwh: number; preis_kwh_cent: number; betrag_cent: number; status: string; erstattet_am: string | null; beleg_notiz: string | null };
type Form = { id: string | null; datum: string; kmStart: string; kmEnde: string; art: string; startOrt: string; ziel: string; zweck: string; partner: string; fahrer: string; grund: string; grundBisher: string | null };

function heute(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }
function monatText(m: string): string { const n = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']; return `${n[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`; }
function monatsende(m: string): string { const [j, mo] = m.split('-').map(Number); return new Date(Date.UTC(j, mo, 0)).toISOString().slice(0, 10); }
function letzteMonate(tag: string, n: number): string[] {
  const r: string[] = []; const [j, m] = tag.split('-').map(Number);
  for (let i = 0; i < n; i++) { const d = new Date(Date.UTC(j, m - 1 - i, 1)); r.push(d.toISOString().slice(0, 10)); }
  return r;
}
const ART_NAME: Record<string, string> = Object.fromEntries(ARTEN.map((a) => [a.key, a.label]));

export default function FahrtenbuchPage() {
  const tag = heute();
  const [fz, setFz] = useState<Fz[]>([]);
  const [fzId, setFzId] = useState('');
  const [monat, setMonat] = useState(monatVon(tag));
  const [fahrten, setFahrten] = useState<FahrtVoll[]>([]);
  const [abgeschlossen, setAbgeschlossen] = useState<string[]>([]);
  const [aenderungen, setAenderungen] = useState<Record<string, number>>({});
  const [ma, setMa] = useState<Ma[]>([]);
  const [lade, setLade] = useState<Lade[]>([]);
  const [istChef, setIstChef] = useState(false);
  const [meinName, setMeinName] = useState('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [frage, setFrage] = useState<string | null>(null);
  const [ls, setLs] = useState<{ mitarbeiterId: string; name: string; monat: string; anfang: string; ende: string; preis: string; beleg: string } | null>(null);

  const ladeStamm = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    if (!uid) { setLaden(false); return; }
    const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
    setMeinName(String(meta.full_name ?? meta.name ?? '').trim() || String(u?.user?.email ?? '').split('@')[0]);
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const b = typeof chef === 'string' && chef ? chef : uid;
    setIstChef(b === uid);
    const [f, m] = await Promise.all([
      supabase.from('fahrzeuge').select('id, bezeichnung, kennzeichen').eq('aktiv', true).order('bezeichnung').limit(500),
      supabase.from('mitarbeiter').select('id, vorname, nachname').eq('owner_user_id', b).order('nachname').limit(1000),
    ]);
    const liste = (f.data as Fz[] | null) ?? [];
    setFz(liste);
    setMa((m.data as Ma[] | null) ?? []);
    const wunsch = new URLSearchParams(window.location.search).get('fahrzeug');
    setFzId((alt) => alt || (wunsch && liste.some((x) => x.id === wunsch) ? wunsch : liste[0]?.id ?? ''));
  }, []);

  const ladeDaten = useCallback(async () => {
    if (!fzId) { setLaden(false); return; }
    const [fa, ab, ae, ld] = await Promise.all([
      supabase.from('fahrtenbuch_fahrt').select('id, fahrzeug_id, datum, km_start, km_ende, art, start_ort, ziel, zweck, partner, fahrer_name, erfasst_am, aenderung_grund').eq('fahrzeug_id', fzId).order('km_start').limit(5000),
      supabase.from('fahrtenbuch_abschluss').select('monat').eq('fahrzeug_id', fzId).limit(1000),
      supabase.from('fahrtenbuch_aenderung').select('fahrt_id').limit(5000),
      supabase.from('ladestrom_erstattung').select('id, person_name, monat, kwh, preis_kwh_cent, betrag_cent, status, erstattet_am, beleg_notiz').order('monat', { ascending: false }).limit(500),
    ]);
    if (fa.error) setFehler('Das Fahrtenbuch ist noch nicht eingerichtet (SQL zu Paket 290 fehlt) oder Ihnen fehlt das Recht „Fuhrpark".');
    setFahrten(((fa.data ?? []) as FahrtVoll[]).map((x) => ({ ...x, km_start: Number(x.km_start), km_ende: Number(x.km_ende) })));
    setAbgeschlossen(((ab.data ?? []) as { monat: string }[]).map((x) => x.monat));
    const z: Record<string, number> = {};
    for (const x of (ae.data ?? []) as { fahrt_id: string }[]) z[x.fahrt_id] = (z[x.fahrt_id] ?? 0) + 1;
    setAenderungen(z);
    setLade(((ld.data ?? []) as Lade[]).map((x) => ({ ...x, kwh: Number(x.kwh), preis_kwh_cent: Number(x.preis_kwh_cent), betrag_cent: Number(x.betrag_cent) })));
    setLaden(false);
  }, [fzId]);

  useEffect(() => { void ladeStamm(); }, [ladeStamm]);
  useEffect(() => { void ladeDaten(); }, [ladeDaten]);

  const imMonat = useMemo(() => fahrten.filter((f) => f.datum >= monat && f.datum <= monatsende(monat)).sort((a, b) => a.km_start - b.km_start), [fahrten, monat]);
  const kette = useMemo(() => kettePruefen(fahrten), [fahrten]);
  const ausM = useMemo(() => auswertung(fahrten, monat, monatsende(monat)), [fahrten, monat]);
  const ausJ = useMemo(() => auswertung(fahrten, `${monat.slice(0, 4)}-01-01`, `${monat.slice(0, 4)}-12-31`), [fahrten, monat]);
  const monatZu = abgeschlossen.includes(monat);
  const maName = (m: Ma) => [m.vorname, m.nachname].filter(Boolean).join(' ').trim() || 'Ohne Namen';

  function neu() {
    setOk(null); setFehler(null);
    const v = kmVorschlag(fahrten);
    setForm({ id: null, datum: tag, kmStart: v === null ? '' : String(v), kmEnde: '', art: 'dienst', startOrt: '', ziel: '', zweck: '', partner: '', fahrer: meinName, grund: '', grundBisher: null });
  }
  function bearbeiten(f: FahrtVoll) {
    setOk(null); setFehler(null);
    setForm({ id: f.id, datum: f.datum, kmStart: String(f.km_start), kmEnde: String(f.km_ende), art: f.art, startOrt: f.start_ort ?? '', ziel: f.ziel ?? '', zweck: f.zweck ?? '', partner: f.partner ?? '', fahrer: f.fahrer_name ?? '', grund: '', grundBisher: f.aenderung_grund });
  }

  async function speichern() {
    if (!form) return;
    const p = fahrtPruefen({ fahrzeugId: fzId, datum: form.datum, kmStart: form.kmStart, kmEnde: form.kmEnde, art: form.art, startOrt: form.startOrt, ziel: form.ziel, zweck: form.zweck, partner: form.partner, fahrer: form.fahrer, heute: tag, abgeschlossen });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    let res;
    if (form.id) {
      const g = grundPruefen(form.grund, form.grundBisher);
      if (!g.ok) { setBusy(false); setFehler(g.grund); return; }
      res = await supabase.from('fahrtenbuch_fahrt').update({ ...p.zeile, aenderung_grund: g.grund }).eq('id', form.id).select('id');
    } else {
      res = await supabase.from('fahrtenbuch_fahrt').insert(p.zeile).select('id');
    }
    setBusy(false);
    if (res.error || !res.data || res.data.length === 0) { setFehler(res.error?.message?.includes('abgeschlossen') ? 'Der Monat ist abgeschlossen.' : 'Die Fahrt wurde nicht gespeichert.'); return; }
    setForm(null); setOk(form.id ? 'Fahrt geändert — die Änderung steht im Protokoll.' : 'Fahrt eingetragen.');
    await ladeDaten();
  }

  async function loeschen(id: string) {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('fahrtenbuch_fahrt').delete().eq('id', id).select('id');
    setBusy(false); setFrage(null);
    if (error || !data || data.length === 0) { setFehler('Nicht gelöscht — nur der Chef löscht, und nur in offenen Monaten.'); return; }
    setOk('Fahrt gelöscht — der alte Stand bleibt im Protokoll.'); await ladeDaten();
  }

  async function abschliessen() {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('fahrtenbuch_abschluss').insert({ fahrzeug_id: fzId, monat }).select('monat');
    setBusy(false); setFrage(null);
    if (error || !data || data.length === 0) { setFehler('Der Monat wurde nicht abgeschlossen.'); return; }
    setOk(`${monatText(monat)} ist abgeschlossen.`); await ladeDaten();
  }

  async function ladestromSpeichern() {
    if (!ls) return;
    const p = ladestromPruefen({ mitarbeiterId: ls.mitarbeiterId || null, name: ls.name, fahrzeugId: fzId || null, monat: ls.monat, anfang: ls.anfang, ende: ls.ende, preisCent: ls.preis, beleg: ls.beleg, heute: tag });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('ladestrom_erstattung').insert(p.zeile).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler(/duplicate|unique/i.test(error?.message ?? '') ? 'Für diese Person, dieses Fahrzeug und diesen Monat gibt es schon eine Erstattung.' : 'Die Erstattung wurde nicht gespeichert.'); return; }
    setLs(null); setOk(`Ladestrom erfasst: ${menge(p.zeile.kwh, 'kWh')} = ${euro(p.zeile.betrag_cent / 100)}.`); await ladeDaten();
  }

  async function erstattet(id: string) {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('ladestrom_erstattung').update({ status: 'erstattet', erstattet_am: tag }).eq('id', id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler('Nicht gespeichert — das setzt nur der Chef.'); return; }
    await ladeDaten();
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/erp/fuhrpark" style={s.zurueck}>← Fuhrpark</a>
      <h1 style={s.h1}>📒 Fahrtenbuch und Ladestrom</h1>
      <p style={s.dim}>
        So geht&apos;s: Tragen Sie jede Fahrt zeitnah ein — Datum, Kilometerstand bei Beginn und Ende, Art und bei Dienstfahrten Reiseziel und Zweck.
        Ändern geht nur mit Grund; der alte Stand bleibt im Protokoll. Ist ein Monat fertig, schließt der Chef ihn ab — danach ist er gesperrt.
        Ob ein Fahrtenbuch steuerlich anerkannt wird, entscheidet das Finanzamt; klären Sie die Einzelheiten mit Ihrem Steuerberater.
      </p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}
      {laden && <p style={s.dim}>Lädt …</p>}

      {!laden && fz.length === 0 && <Leerzustand icon="📒" titel="Noch keine Fahrzeuge" text="Legen Sie zuerst ein Fahrzeug im Fuhrpark an — dann führen Sie hier sein Fahrtenbuch." aktionText="Zum Fuhrpark" aktionHref="/dashboard/erp/fuhrpark" />}

      {!laden && fz.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '6px 0 12px' }}>
            <label style={s.feld}>Fahrzeug
              <select value={fzId} style={s.eingabe} onChange={(e) => { setForm(null); setFzId(e.target.value); }}>
                {fz.map((f) => <option key={f.id} value={f.id}>{f.bezeichnung}{f.kennzeichen ? ` · ${f.kennzeichen}` : ''}</option>)}
              </select>
            </label>
            <label style={s.feld}>Monat
              <select value={monat} style={s.eingabe} onChange={(e) => setMonat(e.target.value)}>
                {letzteMonate(tag, 24).map((m) => <option key={m} value={m}>{monatText(m)}{abgeschlossen.includes(m) ? ' · abgeschlossen' : ''}</option>)}
              </select>
            </label>
          </div>

          <div style={s.kacheln}>
            <div style={s.kachel}><b style={s.zahl}>{ausM.gesamt.toLocaleString('de-DE')} km</b><span style={s.dim}>{monatText(monat)} · {ausM.fahrten} Fahrten</span></div>
            <div style={s.kachel}><b style={s.zahl}>{ausM.dienst.toLocaleString('de-DE')}</b><span style={s.dim}>km dienstlich</span></div>
            <div style={s.kachel}><b style={s.zahl}>{ausM.privat.toLocaleString('de-DE')}</b><span style={s.dim}>km privat · {ausM.arbeitsweg.toLocaleString('de-DE')} km Arbeitsweg</span></div>
            <div style={s.kachel}><b style={s.zahl}>{ausJ.anteilPrivat === null ? '—' : `${ausJ.anteilPrivat} %`}</b><span style={s.dim}>Anteil privat {monat.slice(0, 4)}</span></div>
          </div>

          {kette.length > 0 && (
            <div style={{ ...s.box, borderColor: C.warn }}>
              <b style={{ color: C.warn }}>Kilometer-Kette prüfen</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                {kette.slice(0, 10).map((k, i) => <li key={i}>{k.art === 'luecke' ? `Lücke: ${k.von.toLocaleString('de-DE')} bis ${k.bis.toLocaleString('de-DE')} km fehlen` : `Überschneidung: ${k.von.toLocaleString('de-DE')} bis ${k.bis.toLocaleString('de-DE')} km doppelt`}</li>)}
              </ul>
            </div>
          )}

          {!monatZu && !form && <button type="button" style={s.btnGold} onClick={neu}>＋ Fahrt eintragen</button>}
          {monatZu && <p style={{ ...s.dim, color: C.gold }}>🔒 {monatText(monat)} ist abgeschlossen.</p>}

          {form && (
            <div style={s.box}>
              <b style={{ color: C.gold }}>{form.id ? 'Fahrt ändern' : 'Fahrt eintragen'}</b>
              <div style={s.raster}>
                <label style={s.feld}>Datum<input type="date" value={form.datum} max={tag} style={s.eingabe} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></label>
                <label style={s.feld}>km Beginn<input inputMode="numeric" value={form.kmStart} style={s.eingabe} onChange={(e) => setForm({ ...form, kmStart: e.target.value })} /></label>
                <label style={s.feld}>km Ende<input inputMode="numeric" value={form.kmEnde} style={s.eingabe} onChange={(e) => setForm({ ...form, kmEnde: e.target.value })} /></label>
                <label style={s.feld}>Art
                  <select value={form.art} style={s.eingabe} onChange={(e) => setForm({ ...form, art: e.target.value })}>
                    {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </label>
                {form.art !== 'privat' && <label style={s.feld}>Reiseziel{form.art === 'dienst' ? ' *' : ''}<input value={form.ziel} maxLength={200} style={s.eingabe} onChange={(e) => setForm({ ...form, ziel: e.target.value })} /></label>}
                {form.art !== 'privat' && <label style={s.feld}>Zweck{form.art === 'dienst' ? ' *' : ''}<input value={form.zweck} maxLength={200} style={s.eingabe} onChange={(e) => setForm({ ...form, zweck: e.target.value })} /></label>}
                {form.art === 'dienst' && <label style={s.feld}>Geschäftspartner<input value={form.partner} maxLength={120} style={s.eingabe} onChange={(e) => setForm({ ...form, partner: e.target.value })} /></label>}
                <label style={s.feld}>Start<input value={form.startOrt} maxLength={120} style={s.eingabe} onChange={(e) => setForm({ ...form, startOrt: e.target.value })} /></label>
                <label style={s.feld}>Fahrer<input value={form.fahrer} maxLength={120} style={s.eingabe} onChange={(e) => setForm({ ...form, fahrer: e.target.value })} /></label>
              </div>
              {form.id && <label style={s.feld}>Grund der Änderung *<input value={form.grund} maxLength={300} style={s.eingabe} onChange={(e) => setForm({ ...form, grund: e.target.value })} /></label>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" style={s.btnGold} disabled={busy} onClick={() => void speichern()}>{busy ? 'Speichert …' : '💾 Speichern'}</button>
                <button type="button" style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {imMonat.length === 0 ? <p style={s.dim}>Keine Fahrten in {monatText(monat)}.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.tab}>
                <thead><tr><th style={s.th}>Datum</th><th style={s.th}>km</th><th style={s.th}>Art</th><th style={{ ...s.th, textAlign: 'left' }}>Ziel · Zweck</th><th style={s.th}>Fahrer</th><th style={s.th}></th></tr></thead>
                <tbody>
                  {imMonat.map((f) => (
                    <tr key={f.id}>
                      <td style={s.td}>{de(f.datum)}{nachgetragen(f) && <div style={{ color: C.warn, fontSize: 11.5 }}>nachgetragen</div>}</td>
                      <td style={s.td}>{f.km_start.toLocaleString('de-DE')}–{f.km_ende.toLocaleString('de-DE')}<div style={{ color: C.dim, fontSize: 11.5 }}>{(f.km_ende - f.km_start).toLocaleString('de-DE')} km</div></td>
                      <td style={s.td}>{ART_NAME[f.art] ?? f.art}</td>
                      <td style={{ ...s.td, textAlign: 'left' }}>{[f.ziel, f.zweck, f.partner].filter(Boolean).join(' · ') || '—'}{aenderungen[f.id] ? <div style={{ color: C.warn, fontSize: 11.5 }}>{aenderungen[f.id]}× geändert — zuletzt: {f.aenderung_grund ?? 'gelöscht/geändert'}</div> : null}</td>
                      <td style={s.td}>{f.fahrer_name ?? '—'}</td>
                      <td style={s.td}>
                        {!monatZu && <button type="button" style={s.link} onClick={() => bearbeiten(f)}>ändern</button>}
                        {!monatZu && istChef && (frage === f.id
                          ? <> <button type="button" style={s.link} disabled={busy} onClick={() => void loeschen(f.id)}>Ja, löschen</button> <button type="button" style={s.link} onClick={() => setFrage(null)}>nein</button></>
                          : <> · <button type="button" style={s.link} onClick={() => setFrage(f.id)}>löschen</button></>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {istChef && !monatZu && abschliessbar(monat, tag) && (
            frage === 'monat'
              ? <div style={s.box}>Monat {monatText(monat)} abschließen? Danach lassen sich Fahrten dieses Monats nicht mehr anlegen, ändern oder löschen — auch nicht von Ihnen.
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button type="button" style={s.btnGold} disabled={busy} onClick={() => void abschliessen()}>Ja, abschließen</button><button type="button" style={s.btnAus} onClick={() => setFrage(null)}>Abbrechen</button></div></div>
              : <button type="button" style={{ ...s.btnAus, marginTop: 10 }} onClick={() => setFrage('monat')}>🔒 {monatText(monat)} abschließen …</button>
          )}

          <div style={s.box}>
            <b style={{ color: C.gold }}>⚡ Ladestrom zu Hause</b>
            <p style={{ ...s.dim, fontSize: 13 }}>Wer ein Firmen-Elektroauto zu Hause lädt, bekommt den Strom erstattet: kWh laut Zähler × Preis je kWh laut Stromvertrag. Ob und wie das lohnsteuerfrei geht, klären Sie mit Ihrem Steuerberater. Ausgezahlt wird über die Lohnabrechnung bzw. Überweisung — hier steht der Nachweis.</p>
            {!ls && <button type="button" style={s.btnAus} onClick={() => setLs({ mitarbeiterId: '', name: '', monat: monat.slice(0, 7), anfang: '', ende: '', preis: '', beleg: '' })}>＋ Ladestrom erfassen</button>}
            {ls && (
              <div style={s.raster}>
                <label style={s.feld}>Mitarbeiter
                  <select value={ls.mitarbeiterId} style={s.eingabe} onChange={(e) => { const m = ma.find((x) => x.id === e.target.value); setLs({ ...ls, mitarbeiterId: e.target.value, name: m ? maName(m) : ls.name }); }}>
                    <option value="">— Name eintragen —</option>
                    {ma.map((m) => <option key={m.id} value={m.id}>{maName(m)}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Name<input value={ls.name} maxLength={120} style={s.eingabe} onChange={(e) => setLs({ ...ls, name: e.target.value })} /></label>
                <label style={s.feld}>Monat<input type="month" value={ls.monat} style={s.eingabe} onChange={(e) => setLs({ ...ls, monat: e.target.value })} /></label>
                <label style={s.feld}>Zähler Anfang (kWh)<input value={ls.anfang} inputMode="decimal" style={s.eingabe} onChange={(e) => setLs({ ...ls, anfang: e.target.value })} /></label>
                <label style={s.feld}>Zähler Ende (kWh)<input value={ls.ende} inputMode="decimal" style={s.eingabe} onChange={(e) => setLs({ ...ls, ende: e.target.value })} /></label>
                <label style={s.feld}>Preis je kWh (Cent)<input value={ls.preis} inputMode="decimal" style={s.eingabe} onChange={(e) => setLs({ ...ls, preis: e.target.value })} /></label>
                <label style={s.feld}>Beleg (z. B. Stromrechnung 2026)<input value={ls.beleg} maxLength={200} style={s.eingabe} onChange={(e) => setLs({ ...ls, beleg: e.target.value })} /></label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                  <button type="button" style={s.btnGold} disabled={busy} onClick={() => void ladestromSpeichern()}>💾 Speichern</button>
                  <button type="button" style={s.btnAus} onClick={() => setLs(null)}>Abbrechen</button>
                </div>
              </div>
            )}
            {lade.length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                {lade.map((l) => (
                  <li key={l.id}>
                    {monatText(l.monat)} · {l.person_name} · {menge(l.kwh, 'kWh')} × {menge(l.preis_kwh_cent, 'ct', 3)} = <b>{euro(l.betrag_cent / 100)}</b>
                    {l.beleg_notiz ? ` · ${l.beleg_notiz}` : ''} · {l.status === 'erstattet' ? <span style={{ color: C.ok }}>erstattet {de(l.erstattet_am)}</span> : <span style={{ color: C.warn }}>offen</span>}
                    {istChef && l.status !== 'erstattet' && <> · <button type="button" style={s.link} disabled={busy} onClick={() => void erstattet(l.id)}>als erstattet markieren</button></>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '10px 0 6px' },
  dim: { color: C.dim, fontSize: 14, lineHeight: 1.55, margin: '4px 0 10px' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, margin: '6px 0 14px' },
  kachel: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 2 },
  zahl: { fontSize: 22, fontWeight: 800 },
  box: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', margin: '12px 0' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 8 },
  feld: { display: 'grid', gap: 4, fontSize: 13.5, color: C.dim },
  eingabe: { background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  link: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 13 },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginTop: 10 },
  th: { textAlign: 'center', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { textAlign: 'center', padding: '7px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
};
