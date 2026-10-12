'use client';

// ============================================================
// ARGONAUT OS · Paket 339 (12.10.2026) · BV3a Manufaktur Teil 1 · Reife-Uhr
// Reife-Chargen für Manufakturen (Dry-Aged, Rohschinken, Rohwurst, Käse, Wein,
// Confiserie): Tag X von Ziel, Mindest- und Höchstreife, Reifeverlust aus den
// eigenen Wiegungen, Klima-Messungen mit Abweichung vom Soll.
// Vorgaben je Art sind Startwerte — der Betrieb trägt seine eigenen ein.
// Rechnen: lib/reife.ts (Tests: tests/reifeP339.test.mjs).
// Pfad: Unterpfad von /dashboard/lebensmittel, erbt dessen Freigabe.
// Paket 340: Kalkulation mit Reifeverlust je Charge (ReifeKalkBox, Tabelle
// reife_kalk) — nur Geschäftsleitung oder „Darf abrechnen" (kalkErlaubt).
// Paket 341: MHD je Charge (alle mit Schreibrecht) und Preis-Treppe nach
// Reife/MHD in der Kalkulation (lib/reifeTreppe.ts).
// ============================================================

import { useState, useEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import {
  REIFE_ARTEN, REIFE_EINHEITEN, vorlage, reifeStand, stufenRang, datumText, letzteMenge, verlustProzent, klimaAbweichung,
  tageOhneMessung, chargePruefen, messungPruefen, naechsteNummer, reifeUebersicht, reifeTage,
  type ReifeStand, type ReifeStufe, type ReifeMessung,
} from '@/lib/reife';
import Leerzustand from '../../_components/Leerzustand';
import { useDarfAbrechnen } from '../../_components/useDarfAbrechnen';
import ReifeKalkBox from './ReifeKalkBox';
import { planKalk, preisEinheit, type ReifeKalk } from '@/lib/reifeKalk';
import { reifeStufenAus, mhdStufenAus, preisHeute, mhdPruefen, type TreppenStufe, type MhdStufe } from '@/lib/reifeTreppe';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<ReifeStufe, string> = { geplant: C.dim, jung: C.info, reift: C.gold, bereit: C.ok, ueber: C.bad, fertig: C.dim, verworfen: C.dim };
const STUFE_TEXT: Record<ReifeStufe, string> = { geplant: 'geplant', jung: 'reift (jung)', reift: 'reift', bereit: 'bereit', ueber: 'überreif', fertig: 'abgeschlossen', verworfen: 'verworfen' };

type Charge = {
  id: string; nummer: string; produkt: string; art: string; start_datum: string;
  ziel_tage: number | null; min_tage: number | null; max_tage: number | null;
  start_menge: number | null; einheit: string; lagerort: string | null;
  temp_min: number | null; temp_max: number | null; feuchte_min: number | null; feuchte_max: number | null;
  status: string; end_datum: string | null; end_menge: number | null; notiz: string | null;
  mhd?: string | null;
};
const CHARGE_SPALTEN = 'id, nummer, produkt, art, start_datum, ziel_tage, min_tage, max_tage, start_menge, einheit, lagerort, temp_min, temp_max, feuchte_min, feuchte_max, status, end_datum, end_menge, notiz';
type Messung = ReifeMessung & { id: string; charge_id: string; notiz: string | null };
type Filter = 'laufend' | 'bereit' | 'fertig' | 'alle';
type Zeile = { c: Charge; stand: ReifeStand; mess: Messung[]; letzte: { datum: string; menge: number } | null; verlust: number | null; ohne: number | null; abw: number };

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}
const zahl = (n: number | null | undefined, st = 1) => n === null || n === undefined ? '—' : n.toLocaleString('de-DE', { maximumFractionDigits: st });
const leerTxt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
const ganzOderNull = (t: string) => (t.trim() ? leseZahl(t) : null);

type Entwurf = { produkt: string; art: string; start: string; ziel: string; min: string; max: string; menge: string; einheit: string; lagerort: string; tmin: string; tmax: string; fmin: string; fmax: string; notiz: string };
function entwurfFuer(art: string, tag: string): Entwurf {
  const v = vorlage(art);
  return {
    produkt: '', art, start: tag, ziel: leerTxt(v.zielTage), min: leerTxt(v.minTage), max: leerTxt(v.maxTage), menge: '', einheit: v.einheit, lagerort: '',
    tmin: leerTxt(v.temp?.[0]), tmax: leerTxt(v.temp?.[1]), fmin: leerTxt(v.feuchte?.[0]), fmax: leerTxt(v.feuchte?.[1]), notiz: '',
  };
}
type MEntwurf = { datum: string; menge: string; temp: string; feuchte: string; notiz: string };
const leerMessung = (tag: string): MEntwurf => ({ datum: tag, menge: '', temp: '', feuchte: '', notiz: '' });

export default function ReifeUhrPage() {
  const tag = heute();
  const [chargen, setChargen] = useState<Charge[]>([]);
  const [messungen, setMessungen] = useState<Messung[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('laufend');
  const [neuOffen, setNeuOffen] = useState(false);
  const [neu, setNeu] = useState<Entwurf>(entwurfFuer('dry_aged', tag));
  const [offen, setOffen] = useState<string | null>(null);
  const [mentwurf, setMentwurf] = useState<MEntwurf>(leerMessung(tag));
  const [abschluss, setAbschluss] = useState<{ id: string; art: 'abgeschlossen' | 'verworfen'; menge: string } | null>(null);
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);
  const kalkErlaubt = useDarfAbrechnen() === true;
  const [kalk, setKalk] = useState<Record<string, ReifeKalk>>({});
  const [kalkSqlFehlt, setKalkSqlFehlt] = useState(false);
  const [treppen, setTreppen] = useState<Record<string, { reife: TreppenStufe[]; mhd: MhdStufe[] }>>({});
  const [mhdEntwurf, setMhdEntwurf] = useState<string | null>(null);

  const ladeKalk = useCallback(async () => {
    if (!kalkErlaubt) { setKalk({}); return; }
    const { data, error } = await supabase.from('reife_kalk').select('*').limit(5000);
    if (error) { setKalkSqlFehlt(true); setKalk({}); return; }
    setKalkSqlFehlt(false);
    const je: Record<string, ReifeKalk> = {};
    const tr: Record<string, { reife: TreppenStufe[]; mhd: MhdStufe[] }> = {};
    for (const z of ((data as unknown) as (Record<string, unknown> & { charge_id: string })[]) ?? []) {
      je[z.charge_id] = {
        ek_art: (z.ek_art as string) ?? 'je_einheit', ek_wert: num(z.ek_wert), kosten_tag: num(z.kosten_tag), kosten_sonst: num(z.kosten_sonst),
        parier_prozent: num(z.parier_prozent), erwarteter_verlust: num(z.erwarteter_verlust), marge_prozent: num(z.marge_prozent),
        mwst_satz: num(z.mwst_satz), vk_preis: num(z.vk_preis),
      };
      tr[z.charge_id] = { reife: reifeStufenAus(z.preis_treppe), mhd: mhdStufenAus(z.mhd_treppe) };
    }
    setKalk(je);
    setTreppen(tr);
  }, [kalkErlaubt]);
  useEffect(() => { void ladeKalk(); }, [ladeKalk]);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user?.id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    const [c, m] = await Promise.all([
      (async () => {
        // mit MHD (SQL Paket 341); fehlt die Spalte noch, wie bisher ohne
        const mit = await supabase.from('reife_charge').select(`${CHARGE_SPALTEN}, mhd`).order('start_datum', { ascending: false }).limit(2000);
        return mit.error ? supabase.from('reife_charge').select(CHARGE_SPALTEN).order('start_datum', { ascending: false }).limit(2000) : mit;
      })(),
      supabase.from('reife_messung').select('id, charge_id, datum, menge, temperatur, feuchte, notiz, erstellt_am').order('datum', { ascending: false }).limit(20000),
    ]);
    if (c.error || m.error) { setSqlFehlt(true); setChargen([]); setMessungen([]); setLaden(false); return; }
    setSqlFehlt(false);
    setChargen((((c.data as unknown) as Charge[]) ?? []).map((z) => ({
      ...z, start_menge: num(z.start_menge), end_menge: num(z.end_menge), temp_min: num(z.temp_min), temp_max: num(z.temp_max),
      feuchte_min: num(z.feuchte_min), feuchte_max: num(z.feuchte_max),
    })));
    setMessungen((((m.data as unknown) as Messung[]) ?? []).map((z) => ({ ...z, menge: num(z.menge), temperatur: num(z.temperatur), feuchte: num(z.feuchte) })));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const zeilen: Zeile[] = useMemo(() => {
    const mJe: Record<string, Messung[]> = {};
    for (const m of messungen) (mJe[m.charge_id] ??= []).push(m);
    return chargen.map((c) => {
      const mess = mJe[c.id] ?? [];
      const stand = reifeStand(c, tag);
      const letzte = letzteMenge(mess);
      const ende = c.status === 'abgeschlossen' && c.end_menge ? c.end_menge : letzte?.menge ?? null;
      const laufend = c.status === 'reift' || c.status === 'bereit';
      return {
        c, stand, mess, letzte,
        verlust: verlustProzent(c.start_menge, ende),
        ohne: laufend ? tageOhneMessung(mess, c.start_datum, tag) : null,
        abw: mess.filter((m) => klimaAbweichung(m, c).length > 0).length,
      };
    }).sort((a, b) => stufenRang(a.stand.stufe) - stufenRang(b.stand.stufe) || a.c.start_datum.localeCompare(b.c.start_datum));
  }, [chargen, messungen, tag]);

  const ueb = reifeUebersicht(zeilen.map((z) => z.stand));
  const passt = (z: Zeile, f: Filter) => f === 'alle' ? true
    : f === 'fertig' ? (z.c.status === 'abgeschlossen' || z.c.status === 'verworfen')
    : f === 'bereit' ? (z.stand.stufe === 'bereit' || z.stand.stufe === 'ueber')
    : (z.c.status === 'reift' || z.c.status === 'bereit');
  const gezeigt = zeilen.filter((z) => passt(z, filter));

  function melde(f: string | null, o: string | null = null) { setFehler(f); setOk(o); }

  async function anlegen() {
    for (const [wert, name] of [[neu.ziel, 'Ziel'], [neu.min, 'Mindestreife'], [neu.max, 'Höchstreife'], [neu.menge, 'Startmenge'], [neu.tmin, 'Temperatur von'], [neu.tmax, 'Temperatur bis'], [neu.fmin, 'Luftfeuchte von'], [neu.fmax, 'Luftfeuchte bis']] as const) {
      if (wert.trim() && leseZahl(wert) === null) { melde(`${name}: bitte als Zahl eintragen.`); return; }
    }
    const r = chargePruefen({
      produkt: neu.produkt, art: neu.art, start_datum: neu.start,
      ziel_tage: ganzOderNull(neu.ziel), min_tage: ganzOderNull(neu.min), max_tage: ganzOderNull(neu.max),
      start_menge: ganzOderNull(neu.menge), einheit: neu.einheit, lagerort: neu.lagerort,
      temp_min: ganzOderNull(neu.tmin), temp_max: ganzOderNull(neu.tmax), feuchte_min: ganzOderNull(neu.fmin), feuchte_max: ganzOderNull(neu.fmax),
      notiz: neu.notiz,
    }, tag);
    if (!r.ok) { melde(r.fehler); return; }
    setBusy(true); melde(null);
    try {
      const nummer = naechsteNummer(chargen.map((c) => c.nummer), Number(neu.start.slice(0, 4)) || Number(tag.slice(0, 4)));
      const { data, error } = await supabase.from('reife_charge').insert({ ...r.felder, nummer }).select('id');
      if (error || nichtsGeschrieben(data)) {
        melde(error?.code === '23505' ? 'Diese Chargennummer gibt es schon — bitte Seite neu laden und nochmal anlegen.' : NICHT_GESPEICHERT);
        return;
      }
      setNeuOffen(false); setNeu(entwurfFuer(neu.art, tag));
      melde(null, `Reife-Charge ${nummer} angelegt.`);
      await lade();
    } finally { setBusy(false); }
  }

  async function messungSpeichern(c: Charge) {
    for (const [wert, name] of [[mentwurf.menge, 'Gewicht/Menge'], [mentwurf.temp, 'Temperatur'], [mentwurf.feuchte, 'Luftfeuchte']] as const) {
      if (wert.trim() && leseZahl(wert) === null) { melde(`${name}: bitte als Zahl eintragen.`); return; }
    }
    const r = messungPruefen({ datum: mentwurf.datum, menge: ganzOderNull(mentwurf.menge), temperatur: ganzOderNull(mentwurf.temp), feuchte: ganzOderNull(mentwurf.feuchte), notiz: mentwurf.notiz }, c.start_datum, tag);
    if (!r.ok) { melde(r.fehler); return; }
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('reife_messung').insert({ ...r.felder, charge_id: c.id }).select('id');
      if (error || nichtsGeschrieben(data)) { melde(NICHT_GESPEICHERT); return; }
      const abw = klimaAbweichung({ datum: String(r.felder.datum), temperatur: r.felder.temperatur as number | null, feuchte: r.felder.feuchte as number | null }, c);
      setMentwurf(leerMessung(tag));
      melde(null, abw.length ? `Messung gespeichert — Achtung: ${abw.join(', ')}.` : 'Messung gespeichert.');
      await lade();
    } finally { setBusy(false); }
  }

  async function status(c: Charge, neuStatus: 'reift' | 'bereit' | 'abgeschlossen' | 'verworfen', endMenge?: number | null) {
    setBusy(true); melde(null);
    try {
      const felder: Record<string, unknown> = { status: neuStatus };
      if (neuStatus === 'abgeschlossen' || neuStatus === 'verworfen') { felder.end_datum = tag; felder.end_menge = endMenge ?? null; }
      if (neuStatus === 'reift' || neuStatus === 'bereit') { felder.end_datum = null; felder.end_menge = null; }
      const { data, error } = await supabase.from('reife_charge').update(felder).eq('id', c.id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Ändern fehlgeschlagen — dafür brauchen Sie das Schreibrecht „Lebensmittel".'); return; }
      setAbschluss(null);
      melde(null, `${c.nummer}: ${neuStatus === 'abgeschlossen' ? 'abgeschlossen' : neuStatus === 'verworfen' ? 'verworfen' : neuStatus === 'bereit' ? 'als bereit markiert' : 'reift wieder'}.`);
      await lade();
    } finally { setBusy(false); }
  }

  async function mhdSpeichern(c: Charge) {
    const r = mhdPruefen(mhdEntwurf ?? '', c.start_datum);
    if (!r.ok) { melde(r.fehler); return; }
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('reife_charge').update({ mhd: r.mhd }).eq('id', c.id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('MHD nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel" (und SQL Paket 341).'); return; }
      setMhdEntwurf(null);
      melde(null, r.mhd ? `${c.nummer}: MHD ${datumText(r.mhd)} gespeichert.` : `${c.nummer}: MHD entfernt.`);
      await lade();
    } finally { setBusy(false); }
  }

  async function messungLoeschen(id: string) {
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('reife_messung').delete().eq('id', id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Löschen darf nur die Geschäftsleitung — Messungen sind ein Nachweis.'); return; }
      setLoeschFrage(null); melde(null, 'Messung gelöscht.'); await lade();
    } finally { setBusy(false); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Reife-Uhr …</p></div>;

  const vNeu = vorlage(neu.art);
  return (
    <div style={s.page}>
      <a href="/dashboard/lebensmittel" style={s.zurueck}>← Lebensmittel</a>
      <h1 style={s.h1}>⏳ Reife-Uhr</h1>
      <p style={s.dim}>
        So geht&apos;s: Legen Sie für jedes Reifestück eine Reife-Charge an — Dry-Aged, Schinken, Salami, Käse, Wein oder Confiserie. Die Uhr zeigt Tag für Tag,
        wann die Mindestreife erreicht ist, wann das Ziel und wann es zu lange wird. Wiegen Sie regelmäßig: daraus errechnet ARGONAUT den Reifeverlust.
        Temperatur und Luftfeuchte werden mit Ihrem Soll-Klima verglichen. Die vorgeschlagenen Werte je Art sind Startwerte — tragen Sie Ihre eigenen ein.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Die Reife-Uhr ist noch nicht eingerichtet (SQL Paket 339 fehlt) oder Ihnen fehlt das Recht „Lebensmittel".</div>}

      {!sqlFehlt && (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Reifen gerade</div><b style={s.zahl}>{ueb.laufend}</b></div>
          <div style={s.kachel}><div style={s.dim}>Ziel erreicht</div><b style={{ ...s.zahl, color: ueb.bereit ? C.ok : C.text }}>{ueb.bereit}</b></div>
          <div style={s.kachel}><div style={s.dim}>Über der Höchstreife</div><b style={{ ...s.zahl, color: ueb.ueber ? C.bad : C.text }}>{ueb.ueber}</b></div>
          <div style={s.kachel}><div style={s.dim}>Noch jung</div><b style={s.zahl}>{ueb.jung}</b></div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px', alignItems: 'center' }}>
          {([['laufend', 'Laufend'], ['bereit', 'Bereit / überreif'], ['fertig', 'Abgeschlossen'], ['alle', 'Alle']] as const).map(([f, n]) => (
            <button key={f} style={filter === f ? s.reiterAn : s.reiterAus} onClick={() => setFilter(f)}>{n} ({zeilen.filter((z) => passt(z, f)).length})</button>
          ))}
          <span style={{ flex: 1 }} />
          {!neuOffen && <button style={s.btnGold} onClick={() => { setNeuOffen(true); melde(null); }}>+ Reife-Charge anlegen</button>}
        </div>

        {neuOffen && (
          <div style={{ ...s.box, marginBottom: 12 }}>
            <b style={{ color: C.gold }}>Neue Reife-Charge</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
              {REIFE_ARTEN.map((a) => (
                <button key={a} style={neu.art === a ? s.reiterAn : s.reiterAus} onClick={() => setNeu({ ...entwurfFuer(a, tag), produkt: neu.produkt, start: neu.start, menge: neu.menge, lagerort: neu.lagerort, notiz: neu.notiz })}>
                  {vorlage(a).symbol} {vorlage(a).label}
                </button>
              ))}
            </div>
            <div style={s.raster}>
              <label style={{ ...s.feld, gridColumn: 'span 2' }}>Produkt<input style={s.input} value={neu.produkt} maxLength={120} placeholder="z. B. Rinderrücken am Knochen, Färse" onChange={(e) => setNeu({ ...neu, produkt: e.target.value })} /></label>
              <label style={s.feld}>Start der Reifung<input style={s.input} type="date" value={neu.start} onChange={(e) => setNeu({ ...neu, start: e.target.value })} /></label>
              <label style={s.feld}>Lagerort<input style={s.input} value={neu.lagerort} maxLength={80} placeholder="z. B. Reifeschrank 1" onChange={(e) => setNeu({ ...neu, lagerort: e.target.value })} /></label>
              <label style={s.feld}>Mindestreife (Tage)<input style={s.input} inputMode="numeric" value={neu.min} onChange={(e) => setNeu({ ...neu, min: e.target.value })} /></label>
              <label style={s.feld}>Ziel (Tage)<input style={s.input} inputMode="numeric" value={neu.ziel} onChange={(e) => setNeu({ ...neu, ziel: e.target.value })} /></label>
              <label style={s.feld}>Höchstreife (Tage)<input style={s.input} inputMode="numeric" value={neu.max} onChange={(e) => setNeu({ ...neu, max: e.target.value })} /></label>
              <label style={s.feld}>Startmenge
                <span style={{ display: 'flex', gap: 4 }}>
                  <input style={{ ...s.input, flex: 1, minWidth: 0 }} inputMode="decimal" value={neu.menge} placeholder={vNeu.verlust ? 'Gewicht beim Einlagern' : 'Menge'} onChange={(e) => setNeu({ ...neu, menge: e.target.value })} />
                  <select style={s.input} value={neu.einheit} onChange={(e) => setNeu({ ...neu, einheit: e.target.value })}>{REIFE_EINHEITEN.map((x) => <option key={x}>{x}</option>)}</select>
                </span>
              </label>
              <label style={s.feld}>Temperatur Soll (°C) von / bis
                <span style={{ display: 'flex', gap: 4 }}>
                  <input style={{ ...s.input, flex: 1, minWidth: 0 }} inputMode="decimal" value={neu.tmin} onChange={(e) => setNeu({ ...neu, tmin: e.target.value })} />
                  <input style={{ ...s.input, flex: 1, minWidth: 0 }} inputMode="decimal" value={neu.tmax} onChange={(e) => setNeu({ ...neu, tmax: e.target.value })} />
                </span>
              </label>
              <label style={s.feld}>Luftfeuchte Soll (%) von / bis
                <span style={{ display: 'flex', gap: 4 }}>
                  <input style={{ ...s.input, flex: 1, minWidth: 0 }} inputMode="decimal" value={neu.fmin} onChange={(e) => setNeu({ ...neu, fmin: e.target.value })} />
                  <input style={{ ...s.input, flex: 1, minWidth: 0 }} inputMode="decimal" value={neu.fmax} onChange={(e) => setNeu({ ...neu, fmax: e.target.value })} />
                </span>
              </label>
              <label style={{ ...s.feld, gridColumn: 'span 2' }}>Notiz<input style={s.input} value={neu.notiz} maxLength={500} placeholder="z. B. Herkunft, Rasse, Rezeptur-Nr." onChange={(e) => setNeu({ ...neu, notiz: e.target.value })} /></label>
            </div>
            <p style={{ ...s.klein, marginTop: 8 }}>Die Werte für „{vNeu.label}" sind Startwerte — bitte an Ihr Produkt, Ihren Reiferaum und Ihr HACCP-Konzept anpassen.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={s.btnGold} disabled={busy} onClick={() => void anlegen()}>Anlegen</button>
              <button style={s.btnAus} onClick={() => setNeuOffen(false)}>Abbrechen</button>
            </div>
          </div>
        )}

        {!zeilen.length && !neuOffen && (
          <Leerzustand icon="⏳" titel="Noch keine Reife-Chargen"
            text="Legen Sie Ihr erstes Reifestück an — zum Beispiel einen Rinderrücken für Dry-Aged, einen Schinken oder einen Käselaib. Die Reife-Uhr zeigt dann Tag für Tag den Stand." />
        )}
        {zeilen.length > 0 && !gezeigt.length && <p style={s.dim}>In dieser Ansicht ist gerade keine Charge.</p>}

        <div style={{ display: 'grid', gap: 8 }}>
          {gezeigt.map((z) => {
            const { c, stand } = z;
            const v = vorlage(c.art);
            const auf = offen === c.id;
            const laufend = c.status === 'reift' || c.status === 'bereit';
            return (
              <div key={c.id} style={s.karte}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <button style={s.titelKnopf} onClick={() => { setOffen(auf ? null : c.id); setMentwurf(leerMessung(tag)); setAbschluss(null); setLoeschFrage(null); setMhdEntwurf(null); }}>
                    {auf ? '▾' : '▸'} {v.symbol} {c.produkt} <span style={{ ...s.klein, fontWeight: 400 }}>{c.nummer}</span>
                  </button>
                  <span style={{ ...s.pill, color: FARBE[stand.stufe], borderColor: FARBE[stand.stufe] }}>{STUFE_TEXT[stand.stufe]}</span>
                </div>
                <div style={s.balken} aria-hidden>
                  <div style={{ width: `${stand.prozent}%`, height: '100%', borderRadius: 999, background: FARBE[stand.stufe] }} />
                </div>
                <div style={{ fontSize: 13.5, color: FARBE[stand.stufe], marginTop: 6 }}>{stand.text}</div>
                <div style={s.werte}>
                  <span><span style={s.dim}>Start</span> {datumText(c.start_datum)}</span>
                  {stand.bereitAb && <span><span style={s.dim}>Mindestreife ab</span> {datumText(stand.bereitAb)}</span>}
                  {stand.zielAm && <span><span style={s.dim}>Ziel am</span> {datumText(stand.zielAm)}</span>}
                  {stand.spaetestens && <span><span style={s.dim}>spätestens</span> {datumText(stand.spaetestens)}</span>}
                  {c.start_menge !== null && <span><span style={s.dim}>Start</span> {zahl(c.start_menge, 3)} {c.einheit}</span>}
                  {z.letzte && <span><span style={s.dim}>zuletzt</span> {zahl(z.letzte.menge, 3)} {c.einheit} ({datumText(z.letzte.datum)})</span>}
                  {z.verlust !== null && <span><span style={s.dim}>Reifeverlust</span> <b style={{ color: z.verlust < 0 ? C.warn : C.text }}>{zahl(z.verlust)} %</b>{z.verlust < 0 ? ' (Zunahme — Wiegung prüfen)' : ''}</span>}
                  {c.lagerort && <span><span style={s.dim}>Lagerort</span> {c.lagerort}</span>}
                  {kalkErlaubt && kalk[c.id] && (() => {
                    const p = planKalk(c, kalk[c.id]);
                    return p.ok ? <span><span style={s.dim}>Einstand (Plan)</span> {p.e.einstand.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}/{preisEinheit(c.einheit).einheit}</span> : null;
                  })()}
                  {kalkErlaubt && kalk[c.id]?.vk_preis && (() => {
                    const t = treppen[c.id];
                    const ph = preisHeute(c, kalk[c.id].vk_preis, t?.reife ?? [], t?.mhd ?? [], tag);
                    return ph.ok ? <span><span style={s.dim}>Preis heute</span> <b style={{ color: C.gold }}>{ph.preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</b>/{preisEinheit(c.einheit).einheit}</span> : null;
                  })()}
                  {c.mhd && (() => {
                    const rest = reifeTage(tag, c.mhd);
                    const vorbei = c.mhd < tag;
                    return <span style={{ color: vorbei ? C.bad : rest !== null && rest <= 3 ? C.warn : C.text }}><span style={s.dim}>MHD</span> {datumText(c.mhd)}{vorbei ? ' — überschritten' : rest === 0 ? ' — heute' : ''}</span>;
                  })()}
                  {z.abw > 0 && <span style={{ color: C.warn }}>⚠ {z.abw} {z.abw === 1 ? 'Messung' : 'Messungen'} außerhalb des Soll-Klimas</span>}
                  {z.ohne !== null && z.ohne >= 7 && <span style={{ color: C.warn }}>seit {z.ohne} Tagen nicht gemessen</span>}
                </div>

                {auf && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'grid', gap: 10 }}>
                    <div style={s.klein}>
                      Soll-Klima: {c.temp_min !== null || c.temp_max !== null ? `${zahl(c.temp_min)} bis ${zahl(c.temp_max)} °C` : 'Temperatur ohne Soll'} · {c.feuchte_min !== null || c.feuchte_max !== null ? `${zahl(c.feuchte_min)} bis ${zahl(c.feuchte_max)} % Luftfeuchte` : 'Luftfeuchte ohne Soll'}
                      {c.notiz ? ` · ${c.notiz}` : ''}
                    </div>

                    {laufend && (
                      <div style={s.box}>
                        <b style={{ fontSize: 14 }}>Messung erfassen</b>
                        <div style={{ ...s.raster, marginTop: 8 }}>
                          <label style={s.feld}>Datum<input style={s.input} type="date" value={mentwurf.datum} max={tag} onChange={(e) => setMentwurf({ ...mentwurf, datum: e.target.value })} /></label>
                          <label style={s.feld}>{v.verlust ? `Gewicht (${c.einheit})` : `Menge (${c.einheit})`}<input style={s.input} inputMode="decimal" value={mentwurf.menge} onChange={(e) => setMentwurf({ ...mentwurf, menge: e.target.value })} /></label>
                          <label style={s.feld}>Temperatur (°C)<input style={s.input} inputMode="decimal" value={mentwurf.temp} onChange={(e) => setMentwurf({ ...mentwurf, temp: e.target.value })} /></label>
                          <label style={s.feld}>Luftfeuchte (%)<input style={s.input} inputMode="decimal" value={mentwurf.feuchte} onChange={(e) => setMentwurf({ ...mentwurf, feuchte: e.target.value })} /></label>
                          <label style={{ ...s.feld, gridColumn: 'span 2' }}>Notiz<input style={s.input} value={mentwurf.notiz} maxLength={200} placeholder="z. B. gewendet, Schimmelrasen gleichmäßig" onChange={(e) => setMentwurf({ ...mentwurf, notiz: e.target.value })} /></label>
                        </div>
                        <button style={{ ...s.btnGold, marginTop: 8 }} disabled={busy} onClick={() => void messungSpeichern(c)}>Messung speichern</button>
                      </div>
                    )}

                    {z.mess.length > 0 ? (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={s.tabelle}>
                          <thead><tr><th style={s.th}>Datum</th><th style={s.th}>Tag</th><th style={s.th}>{v.verlust ? 'Gewicht' : 'Menge'}</th><th style={s.th}>Verlust</th><th style={s.th}>Temp.</th><th style={s.th}>Feuchte</th><th style={s.th}>Notiz</th><th style={s.th} /></tr></thead>
                          <tbody>
                            {z.mess.map((m) => {
                              const abw = klimaAbweichung(m, c);
                              const vl = verlustProzent(c.start_menge, m.menge);
                              const t = reifeStand({ ...c, status: 'reift' }, m.datum).tage;
                              return (
                                <tr key={m.id}>
                                  <td style={s.td}>{datumText(m.datum)}</td>
                                  <td style={s.td}>{t ?? '—'}</td>
                                  <td style={s.td}>{m.menge !== null && m.menge !== undefined ? `${zahl(m.menge, 3)} ${c.einheit}` : '—'}</td>
                                  <td style={s.td}>{vl === null ? '—' : `${zahl(vl)} %`}</td>
                                  <td style={{ ...s.td, color: abw.some((x) => x.startsWith('Temperatur')) ? C.warn : C.text }}>{m.temperatur !== null && m.temperatur !== undefined ? `${zahl(m.temperatur)} °C` : '—'}</td>
                                  <td style={{ ...s.td, color: abw.some((x) => x.startsWith('Luftfeuchte')) ? C.warn : C.text }}>{m.feuchte !== null && m.feuchte !== undefined ? `${zahl(m.feuchte)} %` : '—'}</td>
                                  <td style={s.td}>{m.notiz ?? ''}{abw.length ? <div style={{ ...s.klein, color: C.warn }}>{abw.join(' · ')}</div> : null}</td>
                                  <td style={s.td}>
                                    {loeschFrage === m.id ? (
                                      <span style={{ display: 'inline-flex', gap: 4 }}>
                                        <button style={s.btnRot} disabled={busy} onClick={() => void messungLoeschen(m.id)}>Ja, löschen</button>
                                        <button style={s.btnAus} onClick={() => setLoeschFrage(null)}>Nein</button>
                                      </span>
                                    ) : <button style={s.btnAus} onClick={() => setLoeschFrage(m.id)} title="Fehleingabe löschen (nur Geschäftsleitung)">✕</button>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : <p style={s.dim}>Noch keine Messung.</p>}

                    {c.status !== 'verworfen' && 'mhd' in c && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
                        <label style={{ ...s.feld, maxWidth: 220 }}>Mindesthaltbarkeitsdatum (MHD)
                          <input style={s.input} type="date" min={c.start_datum} value={mhdEntwurf ?? c.mhd ?? ''} onChange={(e) => setMhdEntwurf(e.target.value)} />
                        </label>
                        {mhdEntwurf !== null && mhdEntwurf !== (c.mhd ?? '') && (
                          <button style={s.btnGold} disabled={busy} onClick={() => void mhdSpeichern(c)}>MHD speichern</button>
                        )}
                      </div>
                    )}
                    {kalkErlaubt && !kalkSqlFehlt && (
                      <ReifeKalkBox charge={c} gespeichert={kalk[c.id] ?? null} treppe={treppen[c.id] ?? null} letzteMenge={z.letzte?.menge ?? null} heute={tag} onGespeichert={ladeKalk} />
                    )}
                    {kalkErlaubt && kalkSqlFehlt && <div style={s.hinweis}>Die Kalkulation ist noch nicht eingerichtet (SQL Paket 340 fehlt).</div>}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {c.status === 'reift' && <button style={s.btnAus} disabled={busy} onClick={() => void status(c, 'bereit')}>✓ Als bereit markieren</button>}
                      {laufend && <button style={s.btnGold} disabled={busy} onClick={() => setAbschluss({ id: c.id, art: 'abgeschlossen', menge: z.letzte ? leerTxt(z.letzte.menge) : '' })}>Reifung abschließen</button>}
                      {laufend && <button style={s.btnAus} disabled={busy} onClick={() => setAbschluss({ id: c.id, art: 'verworfen', menge: '' })}>Verwerfen</button>}
                      {!laufend && <button style={s.btnAus} disabled={busy} onClick={() => void status(c, 'reift')}>Wieder öffnen</button>}
                    </div>
                    {abschluss?.id === c.id && (
                      <div style={s.box}>
                        {abschluss.art === 'abgeschlossen' ? (<>
                          <label style={{ ...s.feld, maxWidth: 240 }}>Endmenge ({c.einheit}) — für den Reifeverlust
                            <input style={s.input} inputMode="decimal" value={abschluss.menge} onChange={(e) => setAbschluss({ ...abschluss, menge: e.target.value })} />
                          </label>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button style={s.btnGold} disabled={busy} onClick={() => {
                              if (abschluss.menge.trim() && !((leseZahl(abschluss.menge) ?? 0) > 0)) { melde('Endmenge bitte als positive Zahl eintragen.'); return; }
                              void status(c, 'abgeschlossen', abschluss.menge.trim() ? leseZahl(abschluss.menge) : null);
                            }}>Abschließen</button>
                            <button style={s.btnAus} onClick={() => setAbschluss(null)}>Abbrechen</button>
                          </div>
                        </>) : (<>
                          <p style={{ ...s.dim, margin: 0 }}>Charge {c.nummer} als verworfen markieren? Die Messungen bleiben als Nachweis gespeichert.</p>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button style={s.btnRot} disabled={busy} onClick={() => void status(c, 'verworfen')}>Ja, verwerfen</button>
                            <button style={s.btnAus} onClick={() => setAbschluss(null)}>Abbrechen</button>
                          </div>
                        </>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>)}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '8px 0 6px', color: C.text },
  dim: { color: C.dim, fontSize: 13.5, lineHeight: 1.55 },
  klein: { color: C.dim, fontSize: 12, lineHeight: 1.45 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  hinweis: { background: 'rgba(224,162,76,0.10)', border: `1px solid ${C.warn}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 13.5 },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, margin: '14px 0' },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  zahl: { fontSize: 22, display: 'block', marginTop: 4 },
  box: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  titelKnopf: { background: 'none', border: 'none', color: C.text, fontWeight: 700, fontSize: 15, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' },
  pill: { border: '1px solid', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  werte: { display: 'flex', gap: '6px 16px', flexWrap: 'wrap', fontSize: 13.5, marginTop: 6 },
  balken: { height: 8, background: 'rgba(143,163,190,0.15)', borderRadius: 999, marginTop: 10, maxWidth: 520, overflow: 'hidden' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  reiterAn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' },
  btnRot: { background: C.bad, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit' },
  feld: { display: 'grid', gap: 4, fontSize: 13, color: C.dim },
};
