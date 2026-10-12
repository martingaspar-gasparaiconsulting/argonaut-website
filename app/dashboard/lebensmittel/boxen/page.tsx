'use client';

// ============================================================
// ARGONAUT OS · Paket 344 (12.10.2026) · BV3b Feinkost Teil 3
// Box-Konfigurator mit Saison-Kapazität: Geschenkkiste, Präsentkorb,
// Grillpaket, Weihnachtskiste … mit Grundpreis, Fächern („2 Käse nach Wahl")
// und wählbaren Artikeln mit Aufpreis; Kapazität je Tag (wie viele Boxen
// gepackt werden können) und Vorlauf (Bestellschluss).
// Bestellungen nimmt der Betrieb an Theke, Telefon oder per E-Mail auf.
// Der Preis wird IMMER von der Datenbank gerechnet (SQL p344, Wächter
// p344_box_waechter) und je Tag lässt sie nie mehr Boxen zu als die
// Kapazität — auch nicht, wenn zwei gleichzeitig buchen.
// Rechnen und Prüfen: lib/boxKonfigurator.ts (tests/boxKonfiguratorP344).
// Kein Kunden-Zugang in diesem Paket (Shop erst nach rechtlicher Prüfung).
// Pfad: Unterpfad von /dashboard/lebensmittel, erbt dessen Freigabe.
// ============================================================

import { useState, useEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import { datumKurz } from '@/lib/vorbestellAktion';
import {
  MWST_SAETZE, vorlagePruefen, fachPruefen, optionPruefen, kapazitaetPruefen, tageImZeitraum, auswahlPruefen, boxPreis, abPreis,
  standardAuswahl, vorlageBereit, bestellSchluss, kapazitaetListe, bestellungPruefen, boxAllergene, mwstHinweis, packliste,
  auswahlText, boxUebersicht, euro,
  type BoxVorlage, type BoxFach, type BoxOption, type BoxKapazitaet, type BoxBestellung, type AuswahlEintrag, type EtikettAllergen,
} from '@/lib/boxKonfigurator';
import Leerzustand from '../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const BOX_STATUS_TEXT: Record<string, [string, string]> = { entwurf: ['Entwurf', C.dim], aktiv: ['bestellbar', C.ok], archiv: ['archiviert', C.dim] };
const BESTELL_TEXT: Record<string, [string, string]> = {
  offen: ['offen', C.info], bereit: ['gepackt', C.gold], abgeholt: ['abgeholt', C.ok], storniert: ['storniert', C.dim], nicht_abgeholt: ['nicht abgeholt', C.bad],
};
const QUELLE_TEXT: Record<string, string> = { theke: 'Theke', telefon: 'Telefon', mail: 'E-Mail', shop: 'Shop' };
const WOCHENTAGE: [number, string][] = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [7, 'So']];

type Artikel = { id: string; bezeichnung: string | null; aktiv: boolean | null; shop_mwst: number | null };
type BestellZeile = BoxBestellung & { id: string; kunde_tel: string | null; kunde_mail: string | null; notiz: string | null };
type Reiter = 'boxen' | 'bestellungen' | 'packliste';

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}
const zahl = (t: string) => (t.trim() ? leseZahl(t) : null);
const ganz = (t: string) => { const n = zahl(t); return n === null ? null : n; };
const komma = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

type VEntwurf = { id: string | null; name: string; beschreibung: string; grundpreis: string; mwst: number; vorlauf: string };
const leereVorlage = (): VEntwurf => ({ id: null, name: '', beschreibung: '', grundpreis: '', mwst: 7, vorlauf: '2' });
type BEntwurf = { vorlage: string; name: string; tel: string; mail: string; tag: string; anzahl: string; quelle: string; notiz: string; auswahl: AuswahlEintrag[] };

export default function BoxenPage() {
  const tag = heute();
  const [vorlagen, setVorlagen] = useState<BoxVorlage[]>([]);
  const [faecher, setFaecher] = useState<BoxFach[]>([]);
  const [optionen, setOptionen] = useState<(BoxOption & { id: string })[]>([]);
  const [kap, setKap] = useState<(BoxKapazitaet & { id: string })[]>([]);
  const [bestellungen, setBestellungen] = useState<BestellZeile[]>([]);
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [etiketten, setEtiketten] = useState<EtikettAllergen[]>([]);
  const [istChef, setIstChef] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [reiter, setReiter] = useState<Reiter>('boxen');
  const [form, setForm] = useState<VEntwurf | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [neuFach, setNeuFach] = useState({ titel: '', anzahl: '1' });
  const [neuOpt, setNeuOpt] = useState<Record<string, { artikel: string; aufpreis: string }>>({});
  const [zeitraum, setZeitraum] = useState({ von: '', bis: '', max: '', tage: [1, 2, 3, 4, 5, 6] as number[] });
  const [kapEdit, setKapEdit] = useState<Record<string, string>>({});
  const [bestell, setBestell] = useState<BEntwurf | null>(null);
  const [nurOffen, setNurOffen] = useState(true);

  function melde(f: string | null, o: string | null = null) { setFehler(f); setOk(o); }

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    setIstChef(!(typeof chef === 'string' && chef) || chef === uid);
    const [v, f, o, k, b] = await Promise.all([
      supabase.from('box_vorlage').select('id, name, beschreibung, grundpreis, mwst_satz, bestell_vorlauf_tage, status').order('name', { ascending: true }).limit(500),
      supabase.from('box_fach').select('id, vorlage_id, titel, anzahl, position').order('position', { ascending: true }).limit(5000),
      supabase.from('box_option').select('id, fach_id, artikel_id, aufpreis, aktiv').limit(20000),
      supabase.from('box_kapazitaet').select('id, vorlage_id, tag, max_boxen').order('tag', { ascending: true }).limit(20000),
      supabase.from('box_bestellung').select('id, vorlage_id, kunde_name, kunde_tel, kunde_mail, abhol_tag, anzahl, auswahl, preis_je_box, gesamt, status, quelle, notiz').order('abhol_tag', { ascending: true }).limit(20000),
    ]);
    if (v.error || f.error || o.error || k.error || b.error) { setSqlFehlt(true); setLaden(false); return; }
    setSqlFehlt(false);
    setVorlagen((((v.data as unknown) as BoxVorlage[]) ?? []).map((x) => ({ ...x, grundpreis: Number(x.grundpreis), mwst_satz: Number(x.mwst_satz) })));
    setFaecher(((f.data as unknown) as BoxFach[]) ?? []);
    setOptionen((((o.data as unknown) as (BoxOption & { id: string })[]) ?? []).map((x) => ({ ...x, aufpreis: Number(x.aufpreis) })));
    setKap(((k.data as unknown) as (BoxKapazitaet & { id: string })[]) ?? []);
    setBestellungen((((b.data as unknown) as BestellZeile[]) ?? []).map((x) => ({
      ...x, preis_je_box: Number(x.preis_je_box), gesamt: Number(x.gesamt), auswahl: Array.isArray(x.auswahl) ? x.auswahl : [],
    })));
    // Artikel (Namen, Steuersatz) und Etiketten (Allergene) — fehlt das Recht, geht es ohne
    const [ar, et] = await Promise.all([
      supabase.from('artikel').select('id, bezeichnung, aktiv, shop_mwst').order('bezeichnung', { ascending: true }).limit(3000),
      supabase.from('etikett_produkt').select('artikel_id, status, allergene, spuren').not('artikel_id', 'is', null).limit(3000),
    ]);
    setArtikel(ar.error ? [] : (((ar.data as unknown) as Artikel[]) ?? []));
    setEtiketten(et.error ? [] : (((et.data as unknown) as EtikettAllergen[]) ?? []));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const namen = useMemo(() => Object.fromEntries(artikel.map((a) => [a.id, a.bezeichnung ?? 'Artikel'])), [artikel]);
  const saetze = useMemo(() => Object.fromEntries(artikel.map((a) => [a.id, a.shop_mwst === null ? null : Number(a.shop_mwst)])), [artikel]);
  const ueb = boxUebersicht(bestellungen, tag);
  const fJe = (vid: string) => faecher.filter((x) => x.vorlage_id === vid).sort((a, b) => a.position - b.position);
  const oJe = (fid: string) => optionen.filter((x) => x.fach_id === fid);
  const optVon = (vid: string) => { const ids = new Set(fJe(vid).map((x) => x.id)); return optionen.filter((o) => ids.has(o.fach_id)); };
  const pack = useMemo(() => packliste(bestellungen.filter((b) => b.abhol_tag >= tag), namen), [bestellungen, namen, tag]);

  // --- Box anlegen / ändern ----------------------------------------------------
  async function vorlageSpeichern() {
    if (!form) return;
    if (form.grundpreis.trim() && zahl(form.grundpreis) === null) { melde('Grundpreis: bitte als Zahl eintragen.'); return; }
    const e = { name: form.name, beschreibung: form.beschreibung, grundpreis: zahl(form.grundpreis), mwst_satz: form.mwst, bestell_vorlauf_tage: ganz(form.vorlauf) };
    const r = vorlagePruefen(e);
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      const felder = { name: e.name.trim(), beschreibung: e.beschreibung.trim() || null, grundpreis: e.grundpreis, mwst_satz: e.mwst_satz, bestell_vorlauf_tage: e.bestell_vorlauf_tage };
      const q = form.id ? supabase.from('box_vorlage').update(felder).eq('id', form.id).select('id') : supabase.from('box_vorlage').insert(felder).select('id');
      const { data, error } = await q;
      if (error || nichtsGeschrieben(data)) { melde('Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel" (und SQL Paket 344).'); return; }
      const neuId = (data as { id: string }[])[0]?.id;
      melde(null, form.id ? `„${felder.name}" gespeichert.` : `„${felder.name}" angelegt — jetzt Fächer, Artikel und Kapazität eintragen.`);
      setForm(null); if (neuId) setOffen(neuId); await lade();
    } finally { setBusy(false); }
  }

  async function vorlageStatus(v: BoxVorlage, status: 'entwurf' | 'aktiv' | 'archiv') {
    if (status === 'aktiv') {
      const g = vorlageBereit(v, fJe(v.id), optVon(v.id), kap, tag);
      if (g.length) { melde('Noch nicht bestellbar: ' + g.join(' ')); return; }
    }
    await schreibe(supabase.from('box_vorlage').update({ status }).eq('id', v.id).select('id'),
      status === 'aktiv' ? `„${v.name}" ist bestellbar.` : status === 'archiv' ? `„${v.name}" archiviert.` : `„${v.name}" wieder im Entwurf.`);
  }

  async function schreibe(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, okText: string, fehlText = 'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel".') {
    setBusy(true); melde(null);
    try {
      const { data, error } = await q;
      // Meldungen des Wächters (Kapazität, Auswahl, Bestellschluss) direkt zeigen
      if (error) { melde(/frei|Kapazität|wählen|Auswahl|Bestellschluss|gebucht|Box|Fach|Artikel/.test(error.message) ? error.message : fehlText); return false; }
      if (nichtsGeschrieben(data)) { melde(fehlText); return false; }
      melde(null, okText); await lade(); return true;
    } finally { setBusy(false); }
  }

  async function fachAnlegen(v: BoxVorlage) {
    const anzahl = ganz(neuFach.anzahl);
    const r = fachPruefen(neuFach.titel, anzahl);
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    const pos = Math.max(0, ...fJe(v.id).map((x) => x.position)) + 1;
    if (await schreibe(supabase.from('box_fach').insert({ vorlage_id: v.id, titel: neuFach.titel.trim(), anzahl, position: pos }).select('id'), `Fach „${neuFach.titel.trim()}" angelegt.`)) {
      setNeuFach({ titel: '', anzahl: '1' });
    }
  }

  async function fachLoeschen(fa: BoxFach) {
    if (!window.confirm(`Fach „${fa.titel}" mit allen Artikeln entfernen? Bestehende Bestellungen behalten ihre Auswahl.`)) return;
    await schreibe(supabase.from('box_fach').delete().eq('id', fa.id).select('id'), `Fach „${fa.titel}" entfernt.`, 'Entfernen darf nur die Geschäftsleitung.');
  }

  async function optionAnlegen(fa: BoxFach) {
    const n = neuOpt[fa.id] ?? { artikel: '', aufpreis: '' };
    if (n.aufpreis.trim() && zahl(n.aufpreis) === null) { melde('Aufpreis: bitte als Zahl eintragen.'); return; }
    const auf = n.aufpreis.trim() ? zahl(n.aufpreis) : 0;
    const r = optionPruefen(n.artikel, auf, oJe(fa.id).map((o) => o.artikel_id));
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    if (await schreibe(supabase.from('box_option').insert({ fach_id: fa.id, artikel_id: n.artikel, aufpreis: auf }).select('id'), `${namen[n.artikel] ?? 'Artikel'} steht in „${fa.titel}" zur Wahl.`)) {
      setNeuOpt({ ...neuOpt, [fa.id]: { artikel: '', aufpreis: '' } });
    }
  }

  async function kapAnlegen(v: BoxVorlage) {
    const max = ganz(zeitraum.max);
    const r = kapazitaetPruefen(zeitraum.von, zeitraum.bis, zeitraum.tage, max);
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    const vorhanden = new Set(kap.filter((k) => k.vorlage_id === v.id).map((k) => k.tag));
    const neu = tageImZeitraum(zeitraum.von, zeitraum.bis, zeitraum.tage).filter((t) => !vorhanden.has(t));
    if (!neu.length) { melde('Alle diese Tage haben schon eine Kapazität — einzelne Tage ändern Sie in der Liste.'); return; }
    await schreibe(supabase.from('box_kapazitaet').insert(neu.map((t) => ({ vorlage_id: v.id, tag: t, max_boxen: max }))).select('id'),
      `${neu.length} Tag(e) mit je ${max} Boxen angelegt${neu.length < tageImZeitraum(zeitraum.von, zeitraum.bis, zeitraum.tage).length ? ' (vorhandene Tage unverändert)' : ''}.`);
  }

  // --- Bestellung ----------------------------------------------------------------
  function neueBestellung(vid?: string) {
    const v = vorlagen.find((x) => x.id === vid) ?? vorlagen.find((x) => x.status === 'aktiv');
    if (!v) { melde('Zuerst eine Box anlegen und auf „bestellbar" stellen.'); return; }
    const tage = kapazitaetListe(v.id, kap, bestellungen, tag).filter((t) => t.frei > 0);
    setBestell({ vorlage: v.id, name: '', tel: '', mail: '', tag: tage[0]?.tag ?? '', anzahl: '1', quelle: 'theke', notiz: '', auswahl: standardAuswahl(fJe(v.id), optVon(v.id)) });
    setReiter('bestellungen'); melde(null);
  }

  function auswahlSetzen(fachId: string, idx: number, artikelId: string) {
    if (!bestell) return;
    const inFach = bestell.auswahl.filter((a) => a.fach_id === fachId);
    inFach[idx] = { fach_id: fachId, artikel_id: artikelId };
    const rest = bestell.auswahl.filter((a) => a.fach_id !== fachId);
    setBestell({ ...bestell, auswahl: [...rest, ...inFach] });
  }

  const bV = bestell ? vorlagen.find((x) => x.id === bestell.vorlage) ?? null : null;
  const bPruef = bestell && bV ? bestellungPruefen(
    { kunde_name: bestell.name, kunde_tel: bestell.tel, kunde_mail: bestell.mail, abhol_tag: bestell.tag, anzahl: ganz(bestell.anzahl), notiz: bestell.notiz },
    bV, fJe(bV.id), optVon(bV.id), bestell.auswahl, kap, bestellungen, tag) : null;
  const bPreis = bestell && bV ? boxPreis(bV, optVon(bV.id), bestell.auswahl) : null;
  const bAll = bestell ? boxAllergene(bestell.auswahl, etiketten, namen) : null;

  async function bestellungSpeichern() {
    if (!bestell || !bV || !bPruef) return;
    if (!bPruef.ok) { melde(bPruef.fehler.join(' ')); return; }
    const felder = {
      vorlage_id: bV.id, kunde_name: bestell.name.trim(), kunde_tel: bestell.tel.trim() || null, kunde_mail: bestell.mail.trim() || null,
      abhol_tag: bestell.tag, anzahl: ganz(bestell.anzahl), quelle: bestell.quelle, notiz: bestell.notiz.trim() || null,
      // Preis rechnet die Datenbank — hier nur die Auswahl
      auswahl: bestell.auswahl.map((a) => ({ fach_id: a.fach_id, artikel_id: a.artikel_id })),
    };
    if (await schreibe(supabase.from('box_bestellung').insert(felder).select('id'), `${felder.anzahl} × „${bV.name}" für ${felder.kunde_name} am ${datumKurz(felder.abhol_tag)} eingetragen.`,
      'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel" (und SQL Paket 344).')) {
      setBestell(null);
    }
  }

  async function bestellStatus(b: BestellZeile, status: string) {
    if (status === 'storniert' && !window.confirm(`Bestellung von ${b.kunde_name} stornieren? Die Boxen werden wieder frei.`)) return;
    await schreibe(supabase.from('box_bestellung').update({ status }).eq('id', b.id).select('id'), `${b.kunde_name}: ${BESTELL_TEXT[status]?.[0] ?? status}.`);
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Boxen …</p></div>;

  const gezeigteBestellungen = bestellungen
    .filter((b) => !nurOffen || ((b.status === 'offen' || b.status === 'bereit') && b.abhol_tag >= tag) || (b.status === 'offen' && b.abhol_tag < tag))
    .sort((a, b) => a.abhol_tag.localeCompare(b.abhol_tag) || a.kunde_name.localeCompare(b.kunde_name, 'de'));

  return (
    <div style={s.page}>
      <a href="/dashboard/lebensmittel" style={s.zurueck}>← Lebensmittel</a>
      <h1 style={s.h1}>🎁 Box-Konfigurator</h1>
      <p style={s.dim}>
        So geht&apos;s: Legen Sie eine Box an — Grundpreis, Fächer wie „2 Käse nach Wahl" und je Fach die Artikel mit Aufpreis. Tragen Sie ein,
        wie viele Boxen Sie je Tag packen können. Bestellungen nehmen Sie an der Theke, am Telefon oder per E-Mail auf: Der Kunde wählt je Fach,
        ARGONAUT rechnet den Preis und lässt je Tag nie mehr Boxen zu, als Sie packen können. Die Packliste zeigt je Tag, was Sie brauchen.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Der Box-Konfigurator ist noch nicht eingerichtet (SQL Paket 344 fehlt) oder Ihnen fehlt das Recht „Lebensmittel".</div>}

      {!sqlFehlt && (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Bestellbare Boxen</div><b style={s.zahl}>{vorlagen.filter((v) => v.status === 'aktiv').length}</b></div>
          <div style={s.kachel}><div style={s.dim}>Boxen offen</div><b style={s.zahl}>{ueb.offen}</b></div>
          <div style={s.kachel}><div style={s.dim}>Heute abzuholen</div><b style={{ ...s.zahl, color: ueb.heuteAbholen ? C.gold : C.text }}>{ueb.heuteAbholen}</b></div>
          <div style={s.kachel}><div style={s.dim}>Wert offener Bestellungen</div><b style={s.zahl}>{euro(ueb.umsatzOffen)}</b></div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px', alignItems: 'center' }}>
          <button style={reiter === 'boxen' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('boxen')}>Boxen ({vorlagen.length})</button>
          <button style={reiter === 'bestellungen' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('bestellungen')}>Bestellungen</button>
          <button style={reiter === 'packliste' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('packliste')}>Packliste</button>
          <span style={{ flex: 1 }} />
          {reiter === 'boxen' && !form && <button style={s.btnGold} onClick={() => { setForm(leereVorlage()); melde(null); }}>+ Neue Box</button>}
          {reiter === 'bestellungen' && !bestell && <button style={s.btnGold} onClick={() => neueBestellung()}>+ Box-Bestellung</button>}
          {reiter === 'packliste' && <button style={s.btnAus} onClick={() => window.print()}>🖨 Drucken</button>}
        </div>

        {/* ---------------- Boxen ---------------- */}
        {reiter === 'boxen' && (<>
          {form && (
            <div style={{ ...s.box, marginBottom: 12 }}>
              <b style={{ color: C.gold }}>{form.id ? 'Box ändern' : 'Neue Box'}</b>
              <div style={{ ...s.raster, marginTop: 10 }}>
                <label style={{ ...s.feld, gridColumn: 'span 2' }}>Name<input style={s.input} value={form.name} maxLength={120} placeholder="z. B. Weihnachtskiste, Grillpaket, Präsentkorb Genießer" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label style={s.feld}>Grundpreis (brutto, €)<input style={s.input} inputMode="decimal" value={form.grundpreis} onChange={(e) => setForm({ ...form, grundpreis: e.target.value })} /></label>
                <label style={s.feld}>Umsatzsteuer
                  <select style={s.input} value={form.mwst} onChange={(e) => setForm({ ...form, mwst: Number(e.target.value) })}>{MWST_SAETZE.map((x) => <option key={x} value={x}>{x} %</option>)}</select>
                </label>
                <label style={s.feld}>Bestellschluss (Tage vor Abholung)<input style={s.input} inputMode="numeric" value={form.vorlauf} onChange={(e) => setForm({ ...form, vorlauf: e.target.value })} /></label>
                <label style={{ ...s.feld, gridColumn: 'span 2' }}>Beschreibung (optional)<input style={s.input} value={form.beschreibung} maxLength={600} placeholder="z. B. Holzkiste mit Stroh, Grußkarte auf Wunsch" onChange={(e) => setForm({ ...form, beschreibung: e.target.value })} /></label>
              </div>
              <p style={s.klein}>Der Grundpreis gilt für Kiste, Verpackung und alles, was fest drin ist. Was der Kunde wählt, kostet den Aufpreis des Artikels im Fach (0 € = ohne Aufpreis).</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button style={s.btnGold} disabled={busy} onClick={() => void vorlageSpeichern()}>{form.id ? 'Speichern' : 'Anlegen'}</button>
                <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {!vorlagen.length && !form && (
            <Leerzustand icon="🎁" titel="Noch keine Box"
              text="Legen Sie Ihre erste Box an — zum Beispiel eine Weihnachtskiste mit 2 Käse nach Wahl und 1 Wein, oder ein Grillpaket. Danach tragen Sie ein, wie viele Boxen Sie je Tag packen können." />
          )}

          <div style={{ display: 'grid', gap: 8 }}>
            {vorlagen.filter((v) => v.status !== 'archiv' || offen === v.id).map((v) => {
              const fs = fJe(v.id), os = optVon(v.id);
              const [stTxt, stFarbe] = BOX_STATUS_TEXT[v.status] ?? [v.status, C.dim];
              const auf = offen === v.id;
              const tage = kapazitaetListe(v.id, kap, bestellungen, tag);
              const freiGesamt = tage.reduce((s0, t) => s0 + t.frei, 0);
              const bereit = vorlageBereit(v, fs, os, kap, tag);
              const mw = mwstHinweis(v, os.filter((o) => o.aktiv).map((o) => o.artikel_id), saetze);
              const allAlle = boxAllergene(os.filter((o) => o.aktiv).map((o) => ({ fach_id: o.fach_id, artikel_id: o.artikel_id })), etiketten, namen);
              return (
                <div key={v.id} style={s.karte}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={s.titelKnopf} onClick={() => setOffen(auf ? null : v.id)}>{auf ? '▾' : '▸'} {v.name}</button>
                    <span style={{ ...s.pill, color: stFarbe, borderColor: stFarbe }}>{stTxt}</span>
                    <span style={s.klein}>ab {euro(abPreis(v, fs, os))} · {fs.length} Fach/Fächer · {tage.length ? `${freiGesamt} Boxen frei an ${tage.length} Tag(en)` : 'keine Kapazität'}</span>
                  </div>
                  {auf && (
                    <div style={{ marginTop: 10 }}>
                      <div style={s.werte}>
                        <span>Grundpreis <b>{euro(v.grundpreis)}</b></span>
                        <span>Umsatzsteuer <b>{v.mwst_satz} %</b></span>
                        <span>Bestellschluss <b>{v.bestell_vorlauf_tage} Tag(e) vorher</b></span>
                        {v.beschreibung && <span style={s.klein}>{v.beschreibung}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <button style={s.mini} onClick={() => setForm({ id: v.id, name: v.name, beschreibung: v.beschreibung ?? '', grundpreis: komma(v.grundpreis), mwst: v.mwst_satz, vorlauf: String(v.bestell_vorlauf_tage) })}>Ändern</button>
                        {v.status !== 'aktiv' && <button style={s.mini} disabled={busy} onClick={() => void vorlageStatus(v, 'aktiv')}>✓ bestellbar machen</button>}
                        {v.status === 'aktiv' && <button style={s.mini} disabled={busy} onClick={() => neueBestellung(v.id)}>+ Bestellung</button>}
                        {v.status === 'aktiv' && <button style={s.mini} disabled={busy} onClick={() => void vorlageStatus(v, 'entwurf')}>zurück in den Entwurf</button>}
                        {v.status !== 'archiv' && <button style={s.mini} disabled={busy} onClick={() => void vorlageStatus(v, 'archiv')}>archivieren</button>}
                        {v.status === 'archiv' && <button style={s.mini} disabled={busy} onClick={() => void vorlageStatus(v, 'entwurf')}>wieder holen</button>}
                      </div>
                      {v.status !== 'aktiv' && bereit.length > 0 && <div style={s.hinweis}>Für „bestellbar" fehlt noch: {bereit.join(' ')}</div>}
                      {mw && <div style={s.hinweis}>{mw}</div>}

                      <h3 style={s.h3}>Fächer und Auswahl</h3>
                      {!fs.length && <p style={s.klein}>Ohne Fach ist die Box fest gepackt (nur Grundpreis). Mit Fächern wählt der Kunde.</p>}
                      <div style={{ display: 'grid', gap: 8 }}>
                        {fs.map((fa) => {
                          const n = neuOpt[fa.id] ?? { artikel: '', aufpreis: '' };
                          const schon = oJe(fa.id).map((o) => o.artikel_id);
                          return (
                            <div key={fa.id} style={s.fach}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <b>{fa.titel}</b><span style={s.klein}>{fa.anzahl} nach Wahl</span>
                                <span style={{ flex: 1 }} />
                                {istChef && <button style={s.mini} disabled={busy} onClick={() => void fachLoeschen(fa)}>Fach entfernen</button>}
                              </div>
                              <table style={{ ...s.tabelle, marginTop: 6 }}>
                                <tbody>
                                  {oJe(fa.id).map((o) => (
                                    <tr key={o.id}>
                                      <td style={{ ...s.td, color: o.aktiv ? C.text : C.dim }}>{namen[o.artikel_id] ?? 'Artikel'}</td>
                                      <td style={s.td}>{o.aufpreis > 0 ? `+ ${euro(o.aufpreis)}` : 'ohne Aufpreis'}</td>
                                      <td style={s.td}>
                                        <button style={s.mini} disabled={busy} onClick={() => void schreibe(supabase.from('box_option').update({ aktiv: !o.aktiv }).eq('id', o.id).select('id'), o.aktiv ? 'Nicht mehr wählbar.' : 'Wieder wählbar.')}>{o.aktiv ? 'nicht mehr anbieten' : 'wieder anbieten'}</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                <select style={{ ...s.input, minWidth: 200 }} value={n.artikel} onChange={(e) => setNeuOpt({ ...neuOpt, [fa.id]: { ...n, artikel: e.target.value } })}>
                                  <option value="">— Artikel wählen —</option>
                                  {artikel.filter((a) => a.aktiv !== false && !schon.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.bezeichnung ?? 'Artikel'}</option>)}
                                </select>
                                <input style={{ ...s.input, width: 110 }} inputMode="decimal" placeholder="Aufpreis €" value={n.aufpreis} onChange={(e) => setNeuOpt({ ...neuOpt, [fa.id]: { ...n, aufpreis: e.target.value } })} />
                                <button style={s.btnAus} disabled={busy} onClick={() => void optionAnlegen(fa)}>＋ zur Wahl stellen</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <input style={{ ...s.input, minWidth: 220 }} placeholder="Neues Fach, z. B. Käse nach Wahl" maxLength={80} value={neuFach.titel} onChange={(e) => setNeuFach({ ...neuFach, titel: e.target.value })} />
                        <input style={{ ...s.input, width: 90 }} inputMode="numeric" title="Wie viele wählt der Kunde?" value={neuFach.anzahl} onChange={(e) => setNeuFach({ ...neuFach, anzahl: e.target.value })} />
                        <button style={s.btnAus} disabled={busy} onClick={() => void fachAnlegen(v)}>＋ Fach</button>
                      </div>
                      {os.length > 0 && (
                        <p style={s.klein}>
                          Allergene, die je nach Wahl drin sein können: {allAlle.namen.length ? allAlle.namen.join(', ') : 'keine laut Etiketten'}
                          {allAlle.ohneEtikett.length ? ` — ohne Etikett: ${allAlle.ohneEtikett.join(', ')}` : ''}
                        </p>
                      )}

                      <h3 style={s.h3}>Kapazität (Boxen je Tag)</h3>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input style={s.input} type="date" value={zeitraum.von} onChange={(e) => setZeitraum({ ...zeitraum, von: e.target.value })} />
                        <span style={s.klein}>bis</span>
                        <input style={s.input} type="date" value={zeitraum.bis} onChange={(e) => setZeitraum({ ...zeitraum, bis: e.target.value })} />
                        {WOCHENTAGE.map(([n, t]) => (
                          <label key={n} style={{ ...s.klein, display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                            <input type="checkbox" checked={zeitraum.tage.includes(n)} onChange={(e) => setZeitraum({ ...zeitraum, tage: e.target.checked ? [...zeitraum.tage, n] : zeitraum.tage.filter((x) => x !== n) })} />{t}
                          </label>
                        ))}
                        <input style={{ ...s.input, width: 110 }} inputMode="numeric" placeholder="Boxen je Tag" value={zeitraum.max} onChange={(e) => setZeitraum({ ...zeitraum, max: e.target.value })} />
                        <button style={s.btnAus} disabled={busy} onClick={() => void kapAnlegen(v)}>＋ Tage anlegen</button>
                      </div>
                      {tage.length > 0 && (
                        <table style={{ ...s.tabelle, marginTop: 8 }}>
                          <thead><tr><th style={s.th}>Tag</th><th style={s.th}>Bestellschluss</th><th style={s.th}>gebucht</th><th style={s.th}>Boxen je Tag</th><th style={s.th}></th></tr></thead>
                          <tbody>
                            {tage.map((t) => {
                              const k = kap.find((x) => x.vorlage_id === v.id && x.tag === t.tag)!;
                              const ed = kapEdit[k.id];
                              return (
                                <tr key={k.id}>
                                  <td style={s.td}>{datumKurz(t.tag)}</td>
                                  <td style={s.td}>{datumKurz(bestellSchluss(t.tag, v.bestell_vorlauf_tage))}</td>
                                  <td style={{ ...s.td, color: t.frei === 0 ? C.warn : C.text }}>{t.belegt} von {t.max}{t.frei === 0 ? ' · voll' : ''}</td>
                                  <td style={s.td}>
                                    <input style={{ ...s.input, width: 80, padding: '3px 6px' }} inputMode="numeric" value={ed ?? String(t.max)} onChange={(e) => setKapEdit({ ...kapEdit, [k.id]: e.target.value })} />
                                    {ed !== undefined && ed !== String(t.max) && (
                                      <button style={{ ...s.mini, marginLeft: 4 }} disabled={busy} onClick={() => {
                                        const m = ganz(ed);
                                        if (m === null || !Number.isInteger(m) || m < 1 || m > 10000) { melde('Boxen je Tag: ganze Zahl von 1 bis 10.000.'); return; }
                                        void schreibe(supabase.from('box_kapazitaet').update({ max_boxen: m }).eq('id', k.id).select('id'), `${datumKurz(t.tag)}: ${m} Boxen.`).then((gut) => { if (gut) { const r = { ...kapEdit }; delete r[k.id]; setKapEdit(r); } });
                                      }}>speichern</button>
                                    )}
                                  </td>
                                  <td style={s.td}>
                                    {istChef && t.belegt === 0 && <button style={s.mini} disabled={busy} onClick={() => void schreibe(supabase.from('box_kapazitaet').delete().eq('id', k.id).select('id'), `${datumKurz(t.tag)} entfernt.`, 'Entfernen darf nur die Geschäftsleitung.')}>✕</button>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {vorlagen.some((v) => v.status === 'archiv') && <p style={s.klein}>{vorlagen.filter((v) => v.status === 'archiv').length} archivierte Box(en) ausgeblendet.</p>}
        </>)}

        {/* ---------------- Bestellungen ---------------- */}
        {reiter === 'bestellungen' && (<>
          {bestell && (
            <div style={{ ...s.box, marginBottom: 12 }}>
              <b style={{ color: C.gold }}>Neue Box-Bestellung</b>
              <div style={{ ...s.raster, marginTop: 10 }}>
                <label style={{ ...s.feld, gridColumn: 'span 2' }}>Box
                  <select style={s.input} value={bestell.vorlage} onChange={(e) => {
                    const vid = e.target.value;
                    const tage = kapazitaetListe(vid, kap, bestellungen, tag).filter((t) => t.frei > 0);
                    setBestell({ ...bestell, vorlage: vid, tag: tage[0]?.tag ?? '', auswahl: standardAuswahl(fJe(vid), optVon(vid)) });
                  }}>
                    {vorlagen.filter((v) => v.status === 'aktiv').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Abholtag
                  <select style={s.input} value={bestell.tag} onChange={(e) => setBestell({ ...bestell, tag: e.target.value })}>
                    <option value="">— Tag wählen —</option>
                    {bV && kapazitaetListe(bV.id, kap, bestellungen, tag).map((t) => (
                      <option key={t.tag} value={t.tag} disabled={t.frei === 0}>{datumKurz(t.tag)} · {t.frei === 0 ? 'voll' : `${t.frei} frei`}</option>
                    ))}
                  </select>
                </label>
                <label style={s.feld}>Anzahl Boxen<input style={s.input} inputMode="numeric" value={bestell.anzahl} onChange={(e) => setBestell({ ...bestell, anzahl: e.target.value })} /></label>
              </div>

              {bV && fJe(bV.id).map((fa) => {
                const gewaehlt = bestell.auswahl.filter((a) => a.fach_id === fa.id);
                return (
                  <div key={fa.id} style={{ marginTop: 10 }}>
                    <div style={s.klein}><b style={{ color: C.text }}>{fa.titel}</b> — {fa.anzahl} nach Wahl</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {Array.from({ length: fa.anzahl }, (_, i) => (
                        <select key={i} style={{ ...s.input, minWidth: 200 }} value={gewaehlt[i]?.artikel_id ?? ''} onChange={(e) => auswahlSetzen(fa.id, i, e.target.value)}>
                          <option value="">— wählen —</option>
                          {oJe(fa.id).filter((o) => o.aktiv).map((o) => <option key={o.id} value={o.artikel_id}>{namen[o.artikel_id] ?? 'Artikel'}{o.aufpreis > 0 ? ` (+ ${euro(o.aufpreis)})` : ''}</option>)}
                        </select>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div style={{ ...s.raster, marginTop: 12 }}>
                <label style={s.feld}>Kunde<input style={s.input} value={bestell.name} maxLength={120} onChange={(e) => setBestell({ ...bestell, name: e.target.value })} /></label>
                <label style={s.feld}>Telefon<input style={s.input} value={bestell.tel} maxLength={40} onChange={(e) => setBestell({ ...bestell, tel: e.target.value })} /></label>
                <label style={s.feld}>E-Mail<input style={s.input} value={bestell.mail} maxLength={160} onChange={(e) => setBestell({ ...bestell, mail: e.target.value })} /></label>
                <label style={s.feld}>Bestellt über
                  <select style={s.input} value={bestell.quelle} onChange={(e) => setBestell({ ...bestell, quelle: e.target.value })}>
                    {['theke', 'telefon', 'mail'].map((q) => <option key={q} value={q}>{QUELLE_TEXT[q]}</option>)}
                  </select>
                </label>
                <label style={{ ...s.feld, gridColumn: 'span 2' }}>Notiz<input style={s.input} value={bestell.notiz} maxLength={300} placeholder="z. B. Grußkarte „Frohe Weihnachten, Familie Meier“" onChange={(e) => setBestell({ ...bestell, notiz: e.target.value })} /></label>
              </div>

              {bPreis && (
                <div style={s.werte}>
                  <span>Preis je Box <b>{euro(bPreis.je_box)}</b>{bPreis.aufpreise > 0 ? <span style={s.klein}> (davon Aufpreise {euro(bPreis.aufpreise)})</span> : null}</span>
                  {ganz(bestell.anzahl) && <span>Gesamt <b style={{ color: C.gold }}>{euro((ganz(bestell.anzahl) ?? 0) * bPreis.je_box)}</b></span>}
                </div>
              )}
              {bAll && bestell.auswahl.length > 0 && (
                <p style={s.klein}>Allergene dieser Box: {bAll.namen.length ? bAll.namen.join(', ') : 'keine laut Etiketten'}{bAll.spuren.length ? ` · Spuren: ${bAll.spuren.join('; ')}` : ''}
                  {bAll.ohneEtikett.length ? <span style={{ color: C.warn }}> — ohne Etikett (Angabe unvollständig): {bAll.ohneEtikett.join(', ')}</span> : null}</p>
              )}
              {bPruef && bPruef.hinweise.map((h) => <div key={h} style={s.hinweis}>{h}</div>)}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button style={s.btnGold} disabled={busy} onClick={() => void bestellungSpeichern()}>Bestellung eintragen</button>
                <button style={s.btnAus} onClick={() => setBestell(null)}>Abbrechen</button>
              </div>
              {bPruef && !bPruef.ok && <p style={{ ...s.klein, color: C.warn }}>{bPruef.fehler.join(' ')}</p>}
            </div>
          )}

          <label style={{ ...s.klein, display: 'flex', gap: 6, alignItems: 'center', margin: '0 0 8px' }}><input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} /> nur offene und gepackte</label>
          {!gezeigteBestellungen.length && <p style={s.dim}>{bestellungen.length ? 'Gerade nichts offen — Häkchen entfernen, um alle zu sehen.' : 'Noch keine Box-Bestellung.'}</p>}
          {gezeigteBestellungen.length > 0 && (
            <table style={s.tabelle}>
              <thead><tr><th style={s.th}>Abholung</th><th style={s.th}>Kunde</th><th style={s.th}>Box</th><th style={s.th}>Preis</th><th style={s.th}>Status</th></tr></thead>
              <tbody>
                {gezeigteBestellungen.map((b) => {
                  const v = vorlagen.find((x) => x.id === b.vorlage_id);
                  const [txt, farbe] = BESTELL_TEXT[b.status] ?? [b.status, C.dim];
                  const vorbei = b.abhol_tag < tag;
                  return (
                    <tr key={b.id}>
                      <td style={{ ...s.td, color: b.abhol_tag === tag ? C.gold : C.text }}>{datumKurz(b.abhol_tag)}{b.abhol_tag === tag ? ' · heute' : ''}</td>
                      <td style={s.td}>{b.kunde_name}<div style={s.klein}>{[b.kunde_tel, b.kunde_mail].filter(Boolean).join(' · ')}{b.quelle ? ` · über ${QUELLE_TEXT[b.quelle] ?? b.quelle}` : ''}</div></td>
                      <td style={s.td}>{b.anzahl} × {v?.name ?? 'Box'}<div style={s.klein}>{auswahlText(b.auswahl)}</div>{b.notiz ? <div style={s.klein}>📝 {b.notiz}</div> : null}</td>
                      <td style={s.td}>{euro(b.gesamt)}{b.anzahl > 1 ? <div style={s.klein}>je {euro(b.preis_je_box)}</div> : null}</td>
                      <td style={s.td}><span style={{ color: farbe }}>{txt}</span>
                        <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6, flexWrap: 'wrap' }}>
                          {b.status === 'offen' && <button style={s.mini} disabled={busy} onClick={() => void bestellStatus(b, 'bereit')}>gepackt</button>}
                          {(b.status === 'offen' || b.status === 'bereit') && <button style={s.mini} disabled={busy} onClick={() => void bestellStatus(b, 'abgeholt')}>✓ abgeholt</button>}
                          {(b.status === 'offen' || b.status === 'bereit') && vorbei && <button style={s.mini} disabled={busy} onClick={() => void bestellStatus(b, 'nicht_abgeholt')}>nicht abgeholt</button>}
                          {(b.status === 'offen' || b.status === 'bereit') && <button style={s.mini} disabled={busy} onClick={() => void bestellStatus(b, 'storniert')}>stornieren</button>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>)}

        {/* ---------------- Packliste ---------------- */}
        {reiter === 'packliste' && (
          !pack.length ? <p style={s.dim}>Keine offenen Boxen ab heute.</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {pack.map((t) => (
                <div key={t.tag} style={s.karte}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <b style={{ color: t.tag === tag ? C.gold : C.text }}>{datumKurz(t.tag)}{t.tag === tag ? ' · heute' : ''}</b>
                    <span style={s.klein}>{t.boxen} Box(en) aus {t.bestellungen.length} Bestellung(en)</span>
                  </div>
                  <table style={{ ...s.tabelle, marginTop: 6, maxWidth: 520 }}>
                    <thead><tr><th style={s.th}>Artikel</th><th style={s.th}>Stück</th></tr></thead>
                    <tbody>{t.artikel.map((z) => <tr key={z.artikel_id}><td style={s.td}>{z.name}</td><td style={s.td}><b>{z.menge}</b></td></tr>)}</tbody>
                  </table>
                  <div style={{ ...s.klein, marginTop: 6 }}>
                    {t.bestellungen.map((b) => <div key={b.id}>☐ {b.kunde_name}: {b.anzahl} × {vorlagen.find((v) => v.id === b.vorlage_id)?.name ?? 'Box'} — {auswahlText(b.auswahl)}</div>)}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </>)}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '8px 0 6px', color: C.text },
  h3: { fontSize: 14.5, margin: '16px 0 6px', color: C.gold },
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
  fach: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' },
  titelKnopf: { background: 'none', border: 'none', color: C.text, fontWeight: 700, fontSize: 15, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' },
  pill: { border: '1px solid', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  werte: { display: 'flex', gap: '6px 16px', flexWrap: 'wrap', fontSize: 13.5, marginTop: 8 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  reiterAn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit' },
  feld: { display: 'grid', gap: 4, fontSize: 13, color: C.dim },
};
