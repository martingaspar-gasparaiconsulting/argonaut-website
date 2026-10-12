'use client';

// ============================================================
// ARGONAUT OS · Paket 342 (12.10.2026) · BV3b Feinkost Teil 1
// Vorbestellung und Vormerkliste für knappe Ware (Dry-Aged aus der Reife-Uhr,
// Weihnachtsgans, Saison-Pralinen …): Gesamtmenge, Abholzeitraum,
// Bestellschluss, Höchstmenge je Kunde; ausgebucht -> Vormerkliste NUR mit
// Einwilligung; wird etwas frei, rückt die Liste der Reihe nach nach.
// ARGONAUT versendet in Teil 1 nichts selbst — Telefon- und Mail-Link öffnen
// das eigene Telefon bzw. Mailprogramm des Betriebs mit fertigem Text.
// Rechnen und Prüfen: lib/vorbestellAktion.ts (tests/vorbestellungP342).
// Die Datenbank (SQL p342) lässt nie mehr zu, als da ist.
// Pfad: Unterpfad von /dashboard/lebensmittel, erbt dessen Freigabe.
//
// Paket 343 (BV3b Teil 2): Aktion mit Artikel verknüpfen (Preis und
// LMIV-Pflichtangaben kommen vom Artikel bzw. seinem Etikett) und „im Shop
// zeigen“. Die Karte zeigt, was für den Shop noch fehlt (lib/vorbestellShop,
// dieselbe Regel wie der Server). Kundenseitig erst nach Start-Freigabe
// „shop“ + „vorbestellShop“ (Anwalt R52/R53).
// ============================================================

import { useState, useEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import {
  EINHEITEN, aktionStand, aktionPruefen, postenPruefen, vormerkPruefen, einwilligungText, nachrueckVorschlag, fristAbgelaufen,
  warteReihe, platzInReihe, vormerkLoeschbar, benachrichtigungsText, mailtoLink, telLink, abholListe, mengeText, datumKurz,
  vorbestellUebersicht, belegt, VORMERK_FRIST_STUNDEN,
  type Aktion, type Posten, type Vormerkung, type AktionStand, type Phase,
} from '@/lib/vorbestellAktion';
import Leerzustand from '../../_components/Leerzustand';
import { etikettZumArtikel, shopBereitschaft, type EtikettZeile, type ShopArtikel } from '@/lib/vorbestellShop';
import { startFrei, startSperrGrund } from '@/lib/startSperre';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const PHASE_FARBE: Record<Phase, string> = { entwurf: C.dim, vorbestellbar: C.ok, ausgebucht: C.warn, schluss: C.info, abholung: C.gold, vorbei: C.dim, geschlossen: C.info, abgeschlossen: C.dim };
const PHASE_TEXT: Record<Phase, string> = { entwurf: 'Entwurf', vorbestellbar: 'vorbestellbar', ausgebucht: 'ausgebucht', schluss: 'Bestellschluss', abholung: 'Abholung', vorbei: 'vorbei', geschlossen: 'geschlossen', abgeschlossen: 'abgeschlossen' };
const POSTEN_TEXT: Record<string, [string, string]> = {
  offen: ['offen', C.info], bereit: ['bereit', C.gold], abgeholt: ['abgeholt', C.ok], storniert: ['storniert', C.dim], nicht_abgeholt: ['nicht abgeholt', C.bad],
};
const VM_TEXT: Record<string, [string, string]> = {
  wartet: ['wartet', C.info], benachrichtigt: ['benachrichtigt', C.gold], uebernommen: ['übernommen', C.ok], erloschen: ['erloschen', C.dim], abgemeldet: ['abgemeldet', C.dim],
};
const QUELLE_TEXT: Record<string, string> = { theke: 'Theke', telefon: 'Telefon', mail: 'E-Mail', shop: 'Shop', vormerkliste: 'Vormerkliste' };

type AktionZeile = Aktion & { id: string; reife_charge_id: string | null; notiz: string | null; artikel_id?: string | null; im_shop?: boolean | null };
type PostenZeile = Posten & { id: string; aktion_id: string; notiz: string | null; kunde_tel: string | null; kunde_mail: string | null };
type VmZeile = Vormerkung & { id: string; aktion_id: string; kunde_tel: string | null; kunde_mail: string | null; aktualisiert_am: string | null; notiz: string | null };
type Charge = { id: string; nummer: string; produkt: string; einheit: string; start_menge: number | null; end_menge: number | null; status: string };
type Reiter = 'aktionen' | 'abholung';

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}
const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
const zahlOderNull = (t: string) => (t.trim() ? leseZahl(t) : null);
const leerTxt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

type AEntwurf = { id: string | null; titel: string; charge: string; artikel: string; menge: string; einheit: string; max: string; von: string; bis: string; schluss: string; notiz: string };
const leereAktion = (): AEntwurf => ({ id: null, titel: '', charge: '', artikel: '', menge: '', einheit: 'kg', max: '', von: '', bis: '', schluss: '', notiz: '' });
const AKTION_FELDER = 'id, titel, reife_charge_id, menge_gesamt, einheit, max_je_kunde, abhol_von, abhol_bis, bestell_schluss, status, notiz';
// Kundenseitig erst nach rechtlicher Freigabe (Webshop UND Vorbestellung im Shop)
const SHOP_SPERRE = startFrei('shop') ? startSperrGrund('vorbestellShop') : startSperrGrund('shop');
type KEntwurf = { name: string; tel: string; mail: string; menge: string; tag: string; quelle: string; notiz: string; einwilligung: boolean };
const leererKunde = (tag = ''): KEntwurf => ({ name: '', tel: '', mail: '', menge: '', tag, quelle: 'theke', notiz: '', einwilligung: false });

export default function VorbestellungPage() {
  const tag = heute();
  const [aktionen, setAktionen] = useState<AktionZeile[]>([]);
  const [posten, setPosten] = useState<PostenZeile[]>([]);
  const [vm, setVm] = useState<VmZeile[]>([]);
  const [chargen, setChargen] = useState<Charge[]>([]);
  const [betrieb, setBetrieb] = useState('');
  const [istChef, setIstChef] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [reiter, setReiter] = useState<Reiter>('aktionen');
  const [nurLaufend, setNurLaufend] = useState(true);
  const [form, setForm] = useState<AEntwurf | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [kunde, setKunde] = useState<KEntwurf>(leererKunde());
  const [kundeArt, setKundeArt] = useState<'posten' | 'vormerkung' | null>(null);
  const [textFuer, setTextFuer] = useState<string | null>(null);
  const [mitShop, setMitShop] = useState(false);
  const [artikel, setArtikel] = useState<ShopArtikel[]>([]);
  const [etiketten, setEtiketten] = useState<EtikettZeile[]>([]);

  function melde(f: string | null, o: string | null = null) { setFehler(f); setOk(o); }

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const betriebId = typeof chef === 'string' && chef ? chef : uid;
    setIstChef(betriebId === uid);
    // Paket 343: artikel_id und im_shop mitlesen; fehlt die Spalte im_shop (SQL p343 offen), ohne Shop-Teil.
    const ladeA = (felder: string) => supabase.from('vorbestell_aktion').select(felder).order('abhol_von', { ascending: true }).limit(2000);
    const [a0, p, v] = await Promise.all([
      ladeA(AKTION_FELDER + ', artikel_id, im_shop'),
      supabase.from('vorbestell_posten').select('id, aktion_id, kunde_name, kunde_tel, kunde_mail, menge, abhol_tag, status, quelle, notiz').order('erstellt_am', { ascending: true }).limit(20000),
      supabase.from('vormerkung').select('id, aktion_id, kunde_name, kunde_tel, kunde_mail, menge_wunsch, status, erstellt_am, benachrichtigt_am, frist_bis, aktualisiert_am, notiz').order('erstellt_am', { ascending: true }).limit(20000),
    ]);
    const a = a0.error ? await ladeA(AKTION_FELDER) : a0;
    setMitShop(!a0.error);
    if (a.error || p.error || v.error) { setSqlFehlt(true); setLaden(false); return; }
    setSqlFehlt(false);
    setAktionen((((a.data as unknown) as AktionZeile[]) ?? []).map((z) => ({ ...z, menge_gesamt: Number(z.menge_gesamt), max_je_kunde: num(z.max_je_kunde) })));
    setPosten((((p.data as unknown) as PostenZeile[]) ?? []).map((z) => ({ ...z, menge: Number(z.menge) })));
    setVm((((v.data as unknown) as VmZeile[]) ?? []).map((z) => ({ ...z, menge_wunsch: Number(z.menge_wunsch) })));
    // Reife-Chargen (Paket 339) zum Verknüpfen — fehlen Recht oder SQL, geht es ohne
    const c = await supabase.from('reife_charge').select('id, nummer, produkt, einheit, start_menge, end_menge, status').in('status', ['reift', 'bereit', 'abgeschlossen']).order('start_datum', { ascending: false }).limit(500);
    setChargen(c.error ? [] : (((c.data as unknown) as Charge[]) ?? []).map((z) => ({ ...z, start_menge: num(z.start_menge), end_menge: num(z.end_menge) })));
    // Paket 343: Artikel (Preis, Einheit) und Etiketten (LMIV) für die Shop-Bereitschaft — fehlt das Recht, geht es ohne.
    const [ar, et] = await Promise.all([
      supabase.from('artikel').select('id, bezeichnung, verkaufspreis, einheit, aktiv, shop_mwst').order('bezeichnung', { ascending: true }).limit(2000),
      supabase.from('etikett_produkt').select('id, artikel_id, status, art, bezeichnung, zutaten, allergene, nettomenge, mhd, verantwortlicher, energie_kj, energie_kcal, fett, gesaettigt, kohlenhydrate, zucker, eiweiss, salz').not('artikel_id', 'is', null).limit(2000),
    ]);
    setArtikel(ar.error ? [] : (((ar.data as unknown) as ShopArtikel[]) ?? []));
    setEtiketten(et.error ? [] : (((et.data as unknown) as EtikettZeile[]) ?? []));
    const pr = await supabase.from('profiles').select('firma_name').eq('id', betriebId).maybeSingle();
    setBetrieb(String((pr.data as { firma_name?: string } | null)?.firma_name ?? ''));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const jetzt = new Date().toISOString();
  const je = useMemo(() => {
    const pJe: Record<string, PostenZeile[]> = {}, vJe: Record<string, VmZeile[]> = {};
    for (const p of posten) (pJe[p.aktion_id] ??= []).push(p);
    for (const v of vm) (vJe[v.aktion_id] ??= []).push(v);
    return { pJe, vJe };
  }, [posten, vm]);
  const staende: Record<string, AktionStand> = useMemo(() => {
    const m: Record<string, AktionStand> = {};
    for (const a of aktionen) m[a.id] = aktionStand(a, je.pJe[a.id] ?? [], tag);
    return m;
  }, [aktionen, je, tag]);
  const ueb = vorbestellUebersicht(Object.values(staende), vm, jetzt);
  const gezeigt = aktionen.filter((a) => !nurLaufend || !['abgeschlossen', 'vorbei'].includes(staende[a.id]?.phase ?? ''));
  const abhol = useMemo(() => abholListe(posten.filter((p) => {
    const a = aktionen.find((x) => x.id === p.aktion_id);
    return a && a.status !== 'abgeschlossen';
  })), [posten, aktionen]);

  // --- Aktion anlegen / ändern -------------------------------------------------
  async function aktionSpeichern(status: 'entwurf' | 'offen' | null) {
    if (!form) return;
    for (const [w, n] of [[form.menge, 'Gesamtmenge'], [form.max, 'Höchstmenge je Kunde']] as const) {
      if (w.trim() && leseZahl(w) === null) { melde(`${n}: bitte als Zahl eintragen.`); return; }
    }
    const bisher = form.id ? belegt(je.pJe[form.id] ?? []) : 0;
    const r = aktionPruefen({ titel: form.titel, menge_gesamt: zahlOderNull(form.menge), einheit: form.einheit, max_je_kunde: zahlOderNull(form.max), abhol_von: form.von, abhol_bis: form.bis, bestell_schluss: form.schluss, notiz: form.notiz }, bisher);
    if (!r.ok) { melde(r.fehler); return; }
    setBusy(true); melde(null);
    try {
      const felder: Record<string, unknown> = { ...r.felder, reife_charge_id: form.charge || null };
      if (mitShop) felder.artikel_id = form.artikel || null;
      if (status) felder.status = status;
      const q = form.id
        ? supabase.from('vorbestell_aktion').update(felder).eq('id', form.id).select('id')
        : supabase.from('vorbestell_aktion').insert(felder).select('id');
      const { data, error } = await q;
      if (error || nichtsGeschrieben(data)) { melde(error?.message?.includes('vorbestellt') ? error.message : 'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel" (und SQL Paket 342).'); return; }
      melde(null, form.id ? `„${String(r.felder.titel)}" gespeichert.` : status === 'offen' ? `„${String(r.felder.titel)}" ist zum Vorbestellen geöffnet.` : `„${String(r.felder.titel)}" als Entwurf angelegt.`);
      setForm(null); await lade();
    } finally { setBusy(false); }
  }

  async function aktionStatus(a: AktionZeile, status: string) {
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('vorbestell_aktion').update({ status }).eq('id', a.id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel".'); return; }
      melde(null, `„${a.titel}": ${status === 'offen' ? 'zum Vorbestellen geöffnet' : status === 'geschlossen' ? 'für neue Vorbestellungen geschlossen' : status === 'abgeschlossen' ? 'abgeschlossen' : 'zurück auf Entwurf'}.`);
      await lade();
    } finally { setBusy(false); }
  }

  async function shopSchalten(a: AktionZeile, an: boolean) {
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('vorbestell_aktion').update({ im_shop: an }).eq('id', a.id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel“ (und SQL Paket 343).'); return; }
      melde(null, an ? `„${a.titel}“ wird im Shop gezeigt${SHOP_SPERRE ? ', sobald die Vorbestellung im Shop freigeschaltet ist' : ''}.` : `„${a.titel}“ wird nicht mehr im Shop gezeigt.`);
      await lade();
    } finally { setBusy(false); }
  }

  function chargeWaehlen(id: string) {
    if (!form) return;
    const c = chargen.find((x) => x.id === id);
    if (!c) { setForm({ ...form, charge: '' }); return; }
    setForm({ ...form, charge: id, titel: form.titel || c.produkt, einheit: c.einheit === 'g' ? 'kg' : c.einheit, menge: form.menge || leerTxt(c.end_menge ?? null) });
  }

  // --- Kunde: Vorbestellung oder Vormerkung --------------------------------------
  async function kundeSpeichern(a: AktionZeile) {
    const st = staende[a.id];
    if (!st) return;
    if (kunde.menge.trim() && leseZahl(kunde.menge) === null) { melde('Menge: bitte als Zahl eintragen.'); return; }
    if (kundeArt === 'posten') {
      const r = postenPruefen({ kunde_name: kunde.name, kunde_tel: kunde.tel, kunde_mail: kunde.mail, menge: zahlOderNull(kunde.menge), abhol_tag: kunde.tag, quelle: kunde.quelle, notiz: kunde.notiz }, a, st.frei);
      if (!r.ok) { melde(r.fehler); return; }
      setBusy(true); melde(null);
      try {
        const { data, error } = await supabase.from('vorbestell_posten').insert({ ...r.felder, aktion_id: a.id }).select('id');
        if (error || nichtsGeschrieben(data)) { melde(error?.message && /frei|Höchstens|Abhol|geöffnet/.test(error.message) ? error.message : 'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel".'); await lade(); return; }
        melde(null, `Vorbestellung für ${String(r.felder.kunde_name)} gespeichert: ${mengeText(Number(r.felder.menge), a.einheit)}, Abholung ${datumKurz(r.felder.abhol_tag)}.`);
        setKundeArt(null); setKunde(leererKunde()); await lade();
      } finally { setBusy(false); }
    } else {
      const r = vormerkPruefen({ kunde_name: kunde.name, kunde_tel: kunde.tel, kunde_mail: kunde.mail, menge_wunsch: zahlOderNull(kunde.menge), einwilligung: kunde.einwilligung, notiz: kunde.notiz }, a, betrieb);
      if (!r.ok) { melde(r.fehler); return; }
      setBusy(true); melde(null);
      try {
        const { data, error } = await supabase.from('vormerkung').insert({ ...r.felder, aktion_id: a.id }).select('id');
        if (error || nichtsGeschrieben(data)) { melde('Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel".'); return; }
        const platz = warteReihe([...(je.vJe[a.id] ?? [])]).length + 1;
        melde(null, `${String(r.felder.kunde_name)} steht auf der Vormerkliste (Platz ${platz}).`);
        setKundeArt(null); setKunde(leererKunde()); await lade();
      } finally { setBusy(false); }
    }
  }

  async function postenStatus(p: PostenZeile, status: string) {
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('vorbestell_posten').update({ status }).eq('id', p.id).select('id');
      if (error || nichtsGeschrieben(data)) { melde(error?.message?.includes('frei') ? error.message : 'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel".'); return; }
      const frei = status === 'storniert' || status === 'nicht_abgeholt';
      melde(null, `${p.kunde_name}: ${POSTEN_TEXT[status]?.[0] ?? status}.${frei && (je.vJe[p.aktion_id] ?? []).some((v) => v.status === 'wartet') ? ' Es ist wieder etwas frei — die Vormerkliste zeigt, wer nachrückt.' : ''}`);
      await lade();
    } finally { setBusy(false); }
  }

  async function vmStatus(v: VmZeile, status: string) {
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('vormerkung').update({ status }).eq('id', v.id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel".'); return; }
      melde(null, status === 'benachrichtigt' ? `${v.kunde_name}: benachrichtigt — Ware ${VORMERK_FRIST_STUNDEN} Stunden zurückgehalten.` : `${v.kunde_name}: ${VM_TEXT[status]?.[0] ?? status}.`);
      setTextFuer(null); await lade();
    } finally { setBusy(false); }
  }

  async function uebernehmen(a: AktionZeile, v: VmZeile) {
    const st = staende[a.id];
    if (!st) return;
    const menge = Math.min(v.menge_wunsch, st.frei);
    if (!(menge > 0)) { melde('Gerade ist nichts frei.'); return; }
    const abholTag = tag >= a.abhol_von && tag <= a.abhol_bis ? tag : a.abhol_von;
    const r = postenPruefen({ kunde_name: v.kunde_name, kunde_tel: v.kunde_tel ?? '', kunde_mail: v.kunde_mail ?? '', menge, abhol_tag: abholTag, quelle: 'vormerkliste', notiz: '' }, a, st.frei);
    if (!r.ok) { melde(r.fehler); return; }
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('vorbestell_posten').insert({ ...r.felder, aktion_id: a.id, vormerkung_id: v.id }).select('id');
      if (error || nichtsGeschrieben(data)) { melde(error?.message && /frei|Höchstens|geöffnet/.test(error.message) ? error.message : 'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Lebensmittel".'); return; }
      const u = await supabase.from('vormerkung').update({ status: 'uebernommen' }).eq('id', v.id).select('id');
      if (u.error || nichtsGeschrieben(u.data)) { melde(`Die Vorbestellung für ${v.kunde_name} ist gespeichert, die Vormerkung steht aber noch auf „${VM_TEXT[v.status]?.[0] ?? v.status}“ — bitte „abmelden“ drücken.`); await lade(); return; }
      melde(null, `${v.kunde_name} ist von der Vormerkliste übernommen: ${mengeText(menge, a.einheit)}, Abholung ${datumKurz(abholTag)} (in der Liste änderbar).`);
      await lade();
    } finally { setBusy(false); }
  }

  async function erledigteLoeschen(a: AktionZeile) {
    const weg = vormerkLoeschbar(je.vJe[a.id] ?? [], a.abhol_bis, tag).map((v) => v.id as string);
    if (!weg.length) { melde(null, 'Nichts zu löschen.'); return; }
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('vormerkung').delete().in('id', weg).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Löschen darf nur die Geschäftsleitung.'); return; }
      melde(null, `${(data as unknown[]).length} erledigte Vormerkung(en) gelöscht.`); await lade();
    } finally { setBusy(false); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Vorbestellungen …</p></div>;

  return (
    <div style={s.page}>
      <a href="/dashboard/lebensmittel" style={s.zurueck}>← Lebensmittel</a>
      <h1 style={s.h1}>🧺 Vorbestellung & Vormerkliste</h1>
      <p style={s.dim}>
        So geht&apos;s: Legen Sie für knappe Ware eine Vorbestell-Aktion an — Menge, Abholzeitraum, Bestellschluss und Höchstmenge je Kunde.
        Vorbestellungen nehmen Sie an der Theke, am Telefon oder per E-Mail auf; ARGONAUT lässt nie mehr zu, als da ist. Ist alles vergeben,
        kommt der Kunde auf die Vormerkliste — nur wenn er zustimmt, benachrichtigt zu werden. Wird etwas frei, zeigt die Liste, wer als Nächstes dran ist.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Vorbestellungen sind noch nicht eingerichtet (SQL Paket 342 fehlt) oder Ihnen fehlt das Recht „Lebensmittel".</div>}

      {!sqlFehlt && (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Jetzt vorbestellbar</div><b style={{ ...s.zahl, color: ueb.buchbar ? C.ok : C.text }}>{ueb.buchbar}</b></div>
          <div style={s.kachel}><div style={s.dim}>Ausgebucht</div><b style={{ ...s.zahl, color: ueb.ausgebucht ? C.warn : C.text }}>{ueb.ausgebucht}</b></div>
          <div style={s.kachel}><div style={s.dim}>Auf der Vormerkliste</div><b style={s.zahl}>{ueb.wartend}</b></div>
          <div style={s.kachel}><div style={s.dim}>Antwortfrist abgelaufen</div><b style={{ ...s.zahl, color: ueb.fristAbgelaufen ? C.bad : C.text }}>{ueb.fristAbgelaufen}</b></div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px', alignItems: 'center' }}>
          <button style={reiter === 'aktionen' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('aktionen')}>Aktionen ({aktionen.length})</button>
          <button style={reiter === 'abholung' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('abholung')}>Abholliste</button>
          {reiter === 'aktionen' && <label style={{ ...s.klein, display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}><input type="checkbox" checked={nurLaufend} onChange={(e) => setNurLaufend(e.target.checked)} /> nur laufende</label>}
          <span style={{ flex: 1 }} />
          {!form && <button style={s.btnGold} onClick={() => { setForm(leereAktion()); setReiter('aktionen'); melde(null); }}>+ Vorbestell-Aktion</button>}
        </div>

        {form && (
          <div style={{ ...s.box, marginBottom: 12 }}>
            <b style={{ color: C.gold }}>{form.id ? 'Aktion ändern' : 'Neue Vorbestell-Aktion'}</b>
            <div style={{ ...s.raster, marginTop: 10 }}>
              <label style={{ ...s.feld, gridColumn: 'span 2' }}>Ware<input style={s.input} value={form.titel} maxLength={120} placeholder="z. B. Dry-Aged Rib-Eye 42 Tage, Weihnachtsgans" onChange={(e) => setForm({ ...form, titel: e.target.value })} /></label>
              {chargen.length > 0 && (
                <label style={{ ...s.feld, gridColumn: 'span 2' }}>Aus der Reife-Uhr (optional)
                  <select style={s.input} value={form.charge} onChange={(e) => chargeWaehlen(e.target.value)}>
                    <option value="">— ohne Reife-Charge —</option>
                    {chargen.map((c) => <option key={c.id} value={c.id}>{c.nummer} · {c.produkt}</option>)}
                  </select>
                </label>
              )}
              {mitShop && (
                <label style={{ ...s.feld, gridColumn: 'span 2' }}>Artikel (Preis und Pflichtangaben für den Shop, optional)
                  <select style={s.input} value={form.artikel} onChange={(e) => setForm({ ...form, artikel: e.target.value })}>
                    <option value="">— ohne Artikel (nur Theke, Telefon, E-Mail) —</option>
                    {artikel.filter((x) => x.aktiv !== false || x.id === form.artikel).map((x) => <option key={x.id} value={x.id}>{x.bezeichnung ?? 'Artikel'}{x.einheit ? ` · je ${x.einheit}` : ''}</option>)}
                  </select>
                </label>
              )}
              <label style={s.feld}>Verfügbare Gesamtmenge
                <span style={{ display: 'flex', gap: 4 }}>
                  <input style={{ ...s.input, flex: 1, minWidth: 0 }} inputMode="decimal" value={form.menge} onChange={(e) => setForm({ ...form, menge: e.target.value })} />
                  <select style={s.input} value={form.einheit} onChange={(e) => setForm({ ...form, einheit: e.target.value })}>{EINHEITEN.map((x) => <option key={x}>{x}</option>)}</select>
                </span>
              </label>
              <label style={s.feld}>Höchstens je Kunde (optional)<input style={s.input} inputMode="decimal" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} /></label>
              <label style={s.feld}>Abholung von<input style={s.input} type="date" value={form.von} onChange={(e) => setForm({ ...form, von: e.target.value })} /></label>
              <label style={s.feld}>Abholung bis<input style={s.input} type="date" value={form.bis} onChange={(e) => setForm({ ...form, bis: e.target.value })} /></label>
              <label style={s.feld}>Bestellschluss (optional)<input style={s.input} type="date" value={form.schluss} onChange={(e) => setForm({ ...form, schluss: e.target.value })} /></label>
              <label style={{ ...s.feld, gridColumn: 'span 2' }}>Notiz<input style={s.input} value={form.notiz} maxLength={500} placeholder="z. B. Abholung nur samstags, Knochen auf Wunsch" onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {form.id ? (
                <button style={s.btnGold} disabled={busy} onClick={() => void aktionSpeichern(null)}>Speichern</button>
              ) : (<>
                <button style={s.btnGold} disabled={busy} onClick={() => void aktionSpeichern('offen')}>Anlegen und zum Vorbestellen öffnen</button>
                <button style={s.btnAus} disabled={busy} onClick={() => void aktionSpeichern('entwurf')}>Als Entwurf anlegen</button>
              </>)}
              <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
            </div>
          </div>
        )}

        {reiter === 'abholung' && (
          abhol.length === 0 ? <p style={s.dim}>Noch keine Abholungen.</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {abhol.map((t) => (
                <div key={t.tag} style={s.karte}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <b style={{ color: t.tag === tag ? C.gold : C.text }}>{datumKurz(t.tag)}{t.tag === tag ? ' · heute' : ''}</b>
                    <span style={s.klein}>{t.posten.length} Vorbestellung(en), {t.offen} noch abzuholen</span>
                  </div>
                  <table style={{ ...s.tabelle, marginTop: 6 }}>
                    <thead><tr><th style={s.th}>Kunde</th><th style={s.th}>Ware</th><th style={s.th}>Menge</th><th style={s.th}>Status</th></tr></thead>
                    <tbody>
                      {t.posten.map((p0) => {
                        const p = p0 as PostenZeile;
                        const a = aktionen.find((x) => x.id === p.aktion_id);
                        const [txt, farbe] = POSTEN_TEXT[p.status] ?? [p.status, C.dim];
                        return (
                          <tr key={p.id}>
                            <td style={s.td}>{p.kunde_name}{p.kunde_tel ? <div style={s.klein}>{p.kunde_tel}</div> : null}</td>
                            <td style={s.td}>{a?.titel ?? '—'}</td>
                            <td style={s.td}>{mengeText(p.menge, a?.einheit)}</td>
                            <td style={s.td}><span style={{ color: farbe }}>{txt}</span>
                              {(p.status === 'offen' || p.status === 'bereit') && (
                                <span style={{ display: 'inline-flex', gap: 4, marginLeft: 8 }}>
                                  {p.status === 'offen' && <button style={s.mini} disabled={busy} onClick={() => void postenStatus(p, 'bereit')}>bereit</button>}
                                  <button style={s.mini} disabled={busy} onClick={() => void postenStatus(p, 'abgeholt')}>✓ abgeholt</button>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )
        )}

        {reiter === 'aktionen' && (<>
          {!aktionen.length && !form && (
            <Leerzustand icon="🧺" titel="Noch keine Vorbestell-Aktion"
              text="Legen Sie Ihre erste knappe Ware zum Vorbestellen an — zum Beispiel 20 kg Dry-Aged aus der Reife-Uhr oder 30 Weihnachtsgänse. Ist alles vergeben, führt ARGONAUT die Vormerkliste." />
          )}
          {aktionen.length > 0 && !gezeigt.length && <p style={s.dim}>Gerade läuft keine Aktion — Häkchen „nur laufende“ entfernen, um alle zu sehen.</p>}

          <div style={{ display: 'grid', gap: 8 }}>
            {gezeigt.map((a) => {
              const st = staende[a.id];
              const ps = je.pJe[a.id] ?? [];
              const vs = je.vJe[a.id] ?? [];
              const auf = offen === a.id;
              const vorschlag = nachrueckVorschlag(vs, st.frei, jetzt);
              const charge = chargen.find((c) => c.id === a.reife_charge_id);
              const sichtbarePs = ps.filter((p) => p.status !== 'storniert');
              const offeneVs = vs.filter((v) => v.status === 'wartet' || v.status === 'benachrichtigt');
              const loeschbar = vormerkLoeschbar(vs, a.abhol_bis, tag).length;
              return (
                <div key={a.id} style={s.karte}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={s.titelKnopf} onClick={() => { setOffen(auf ? null : a.id); setKundeArt(null); setTextFuer(null); }}>{auf ? '▾' : '▸'} {a.titel}</button>
                    <span style={{ ...s.pill, color: PHASE_FARBE[st.phase], borderColor: PHASE_FARBE[st.phase] }}>{PHASE_TEXT[st.phase]}</span>
                    {offeneVs.length > 0 && <span style={s.klein}>Vormerkliste: {offeneVs.length}</span>}
                  </div>
                  <div style={s.werte}>
                    <span>vorbestellt <b>{mengeText(st.belegt, a.einheit)}</b> von {mengeText(a.menge_gesamt, a.einheit)}</span>
                    <span>frei <b style={{ color: st.frei > 0 ? C.ok : C.warn }}>{mengeText(st.frei, a.einheit)}</b></span>
                    <span>Abholung {datumKurz(a.abhol_von)} – {datumKurz(a.abhol_bis)}</span>
                    {a.bestell_schluss && <span>Bestellschluss {datumKurz(a.bestell_schluss)}</span>}
                    {a.max_je_kunde !== null && <span>höchstens {mengeText(a.max_je_kunde, a.einheit)} je Kunde</span>}
                    {charge && <span>Reife-Charge {charge.nummer}</span>}
                  </div>
                  <div style={s.balken}><div style={{ height: '100%', width: `${st.prozent}%`, background: PHASE_FARBE[st.phase] }} /></div>
                  <div style={{ ...s.klein, marginTop: 4 }}>{st.text}</div>

                  {auf && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {st.buchbar && <button style={s.btnGold} onClick={() => { setKundeArt('posten'); setKunde(leererKunde(tag >= a.abhol_von && tag <= a.abhol_bis ? tag : a.abhol_von)); melde(null); }}>+ Vorbestellung</button>}
                        {a.status !== 'abgeschlossen' && <button style={st.buchbar ? s.btnAus : s.btnGold} onClick={() => { setKundeArt('vormerkung'); setKunde(leererKunde()); melde(null); }}>+ Auf die Vormerkliste</button>}
                        {a.status === 'entwurf' && <button style={s.btnAus} disabled={busy} onClick={() => void aktionStatus(a, 'offen')}>Zum Vorbestellen öffnen</button>}
                        {a.status === 'offen' && <button style={s.btnAus} disabled={busy} onClick={() => void aktionStatus(a, 'geschlossen')}>Für neue Vorbestellungen schließen</button>}
                        {a.status === 'geschlossen' && <button style={s.btnAus} disabled={busy} onClick={() => void aktionStatus(a, 'offen')}>Wieder öffnen</button>}
                        {a.status !== 'abgeschlossen' && <button style={s.btnAus} onClick={() => setForm({ id: a.id, titel: a.titel, charge: a.reife_charge_id ?? '', artikel: a.artikel_id ?? '', menge: leerTxt(a.menge_gesamt), einheit: a.einheit, max: leerTxt(a.max_je_kunde), von: a.abhol_von, bis: a.abhol_bis, schluss: a.bestell_schluss ?? '', notiz: a.notiz ?? '' })}>Ändern</button>}
                        {a.status !== 'abgeschlossen' && (st.phase === 'vorbei' || st.phase === 'abholung') && <button style={s.btnAus} disabled={busy} onClick={() => void aktionStatus(a, 'abgeschlossen')}>Aktion abschließen</button>}
                        {a.status === 'abgeschlossen' && <button style={s.btnAus} disabled={busy} onClick={() => void aktionStatus(a, 'geschlossen')}>Wieder aufnehmen</button>}
                      </div>

                      {mitShop && a.status !== 'abgeschlossen' && (() => {
                        const art = artikel.find((x) => x.id === a.artikel_id) ?? null;
                        const gruende = shopBereitschaft(a, art, etikettZumArtikel(etiketten, a.artikel_id));
                        return (
                          <div style={{ ...s.box, borderColor: a.im_shop ? (gruende.length ? C.warn : C.ok) : C.border }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              <b style={{ fontSize: 14 }}>🛒 Im Online-Shop</b>
                              <label style={{ ...s.klein, display: 'flex', gap: 6, alignItems: 'center', color: C.text }}>
                                <input type="checkbox" checked={!!a.im_shop} disabled={busy} onChange={(e) => void shopSchalten(a, e.target.checked)} /> im Shop zeigen
                              </label>
                              {a.im_shop && !gruende.length && a.status === 'offen' && <span style={{ ...s.klein, color: C.ok }}>{SHOP_SPERRE ? 'bereit — erscheint nach der Freischaltung' : 'steht im Shop'}</span>}
                            </div>
                            {gruende.length > 0 && (
                              <ul style={{ ...s.klein, margin: '6px 0 0', paddingLeft: 18 }}>
                                {gruende.map((g) => <li key={g}>{g}</li>)}
                              </ul>
                            )}
                            {a.status !== 'offen' && <p style={{ ...s.klein, marginTop: 4 }}>Im Shop steht die Aktion nur, solange sie zum Vorbestellen geöffnet ist (ausgebucht: mit Vormerkliste).</p>}
                            {SHOP_SPERRE && <p style={{ ...s.klein, marginTop: 4 }}>{SHOP_SPERRE}</p>}
                          </div>
                        );
                      })()}

                      {kundeArt && (
                        <div style={s.box}>
                          <b style={{ color: C.gold }}>{kundeArt === 'posten' ? 'Neue Vorbestellung' : 'Auf die Vormerkliste setzen'}</b>
                          <div style={{ ...s.raster, marginTop: 10 }}>
                            <label style={s.feld}>Name<input style={s.input} value={kunde.name} maxLength={120} onChange={(e) => setKunde({ ...kunde, name: e.target.value })} /></label>
                            <label style={s.feld}>Telefon<input style={s.input} value={kunde.tel} maxLength={40} inputMode="tel" onChange={(e) => setKunde({ ...kunde, tel: e.target.value })} /></label>
                            <label style={s.feld}>E-Mail<input style={s.input} value={kunde.mail} maxLength={160} inputMode="email" onChange={(e) => setKunde({ ...kunde, mail: e.target.value })} /></label>
                            <label style={s.feld}>{kundeArt === 'posten' ? 'Menge' : 'Gewünschte Menge'} ({a.einheit})<input style={s.input} inputMode="decimal" value={kunde.menge} onChange={(e) => setKunde({ ...kunde, menge: e.target.value })} /></label>
                            {kundeArt === 'posten' && <>
                              <label style={s.feld}>Abholtag<input style={s.input} type="date" min={a.abhol_von} max={a.abhol_bis} value={kunde.tag} onChange={(e) => setKunde({ ...kunde, tag: e.target.value })} /></label>
                              <label style={s.feld}>Bestellt über
                                <select style={s.input} value={kunde.quelle} onChange={(e) => setKunde({ ...kunde, quelle: e.target.value })}>
                                  {(['theke', 'telefon', 'mail'] as const).map((q) => <option key={q} value={q}>{QUELLE_TEXT[q]}</option>)}
                                </select>
                              </label>
                            </>}
                            <label style={{ ...s.feld, gridColumn: 'span 2' }}>Notiz<input style={s.input} value={kunde.notiz} maxLength={300} onChange={(e) => setKunde({ ...kunde, notiz: e.target.value })} /></label>
                          </div>
                          {kundeArt === 'vormerkung' && (
                            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 13.5 }}>
                              <input type="checkbox" checked={kunde.einwilligung} onChange={(e) => setKunde({ ...kunde, einwilligung: e.target.checked })} style={{ marginTop: 3 }} />
                              <span>Der Kunde ist einverstanden (bitte vorlesen oder zeigen): <i style={{ color: C.dim }}>„{einwilligungText(betrieb)}“</i></span>
                            </label>
                          )}
                          <p style={{ ...s.klein, marginTop: 8 }}>
                            {kundeArt === 'posten' ? `Frei sind noch ${mengeText(st.frei, a.einheit)}.` : 'Ohne Häkchen keine Vormerkung. Wortlaut und Zeitpunkt werden gespeichert; Telefon oder E-Mail braucht es für die Benachrichtigung.'}
                          </p>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button style={s.btnGold} disabled={busy} onClick={() => void kundeSpeichern(a)}>Speichern</button>
                            <button style={s.btnAus} onClick={() => setKundeArt(null)}>Abbrechen</button>
                          </div>
                        </div>
                      )}

                      <div>
                        <b style={{ fontSize: 14 }}>Vorbestellungen ({sichtbarePs.length})</b>
                        {sichtbarePs.length === 0 ? <p style={s.dim}>Noch keine.</p> : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ ...s.tabelle, marginTop: 6 }}>
                              <thead><tr><th style={s.th}>Kunde</th><th style={s.th}>Menge</th><th style={s.th}>Abholung</th><th style={s.th}>über</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                              <tbody>
                                {sichtbarePs.map((p) => {
                                  const [txt, farbe] = POSTEN_TEXT[p.status] ?? [p.status, C.dim];
                                  const ueberfaellig = (p.status === 'offen' || p.status === 'bereit') && p.abhol_tag < tag;
                                  return (
                                    <tr key={p.id}>
                                      <td style={s.td}>{p.kunde_name}<div style={s.klein}>{[p.kunde_tel, p.kunde_mail].filter(Boolean).join(' · ')}</div></td>
                                      <td style={s.td}>{mengeText(p.menge, a.einheit)}</td>
                                      <td style={{ ...s.td, color: ueberfaellig ? C.bad : C.text }}>{datumKurz(p.abhol_tag)}{ueberfaellig ? ' · nicht abgeholt?' : ''}</td>
                                      <td style={s.td}>{QUELLE_TEXT[p.quelle ?? ''] ?? '—'}</td>
                                      <td style={s.td}><span style={{ color: farbe }}>{txt}</span></td>
                                      <td style={s.td}>
                                        {(p.status === 'offen' || p.status === 'bereit') && (
                                          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                                            {p.status === 'offen' && <button style={s.mini} disabled={busy} onClick={() => void postenStatus(p, 'bereit')}>bereit</button>}
                                            <button style={s.mini} disabled={busy} onClick={() => void postenStatus(p, 'abgeholt')}>✓ abgeholt</button>
                                            {ueberfaellig && <button style={s.mini} disabled={busy} onClick={() => void postenStatus(p, 'nicht_abgeholt')}>nicht abgeholt</button>}
                                            <button style={s.mini} disabled={busy} onClick={() => void postenStatus(p, 'storniert')}>stornieren</button>
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div>
                        <b style={{ fontSize: 14 }}>Vormerkliste ({offeneVs.length})</b>
                        {vorschlag.naechste && (
                          <div style={{ ...s.hinweis, marginTop: 6 }}>
                            Frei für die Vormerkliste: <b>{mengeText(vorschlag.verfuegbar, a.einheit)}</b> — als Nächstes ist <b>{vorschlag.naechste.kunde_name}</b> dran ({mengeText(vorschlag.naechste.menge_wunsch, a.einheit)}).
                            {vorschlag.uebersprungen.length > 0 && <> Davor warten {vorschlag.uebersprungen.map((v) => v.kunde_name).join(', ')} auf eine größere Menge — Sie können auch ihnen die freie Menge anbieten.</>}
                          </div>
                        )}
                        {vorschlag.zurueckgehalten > 0 && <p style={s.klein}>Für benachrichtigte Kunden zurückgehalten: {mengeText(vorschlag.zurueckgehalten, a.einheit)}.</p>}
                        {vs.length === 0 ? <p style={s.dim}>Niemand vorgemerkt.</p> : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ ...s.tabelle, marginTop: 6 }}>
                              <thead><tr><th style={s.th}>Platz</th><th style={s.th}>Kunde</th><th style={s.th}>Wunsch</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                              <tbody>
                                {vs.map((v) => {
                                  const [txt, farbe] = VM_TEXT[v.status] ?? [v.status, C.dim];
                                  const abgelaufen = fristAbgelaufen(v, jetzt);
                                  const nachricht = benachrichtigungsText(a, v, betrieb, Math.max(st.frei, 0));
                                  const mail = mailtoLink(v.kunde_mail, nachricht.betreff, nachricht.text);
                                  const tel = telLink(v.kunde_tel);
                                  return (
                                    <tr key={v.id}>
                                      <td style={s.td}>{platzInReihe(vs, v.id) ?? '—'}</td>
                                      <td style={s.td}>{v.kunde_name}<div style={s.klein}>{[v.kunde_tel, v.kunde_mail].filter(Boolean).join(' · ')}</div></td>
                                      <td style={s.td}>{mengeText(v.menge_wunsch, a.einheit)}</td>
                                      <td style={s.td}><span style={{ color: abgelaufen ? C.bad : farbe }}>{txt}{v.status === 'benachrichtigt' && v.frist_bis ? ` · Frist ${abgelaufen ? 'abgelaufen' : 'bis ' + new Date(v.frist_bis).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span></td>
                                      <td style={s.td}>
                                        {(v.status === 'wartet' || v.status === 'benachrichtigt') && (
                                          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                                            {tel && <a style={s.mini} href={tel}>📞 anrufen</a>}
                                            {mail && <a style={s.mini} href={mail}>✉ E-Mail</a>}
                                            <button style={s.mini} onClick={() => setTextFuer(textFuer === v.id ? null : v.id)}>Text</button>
                                            {v.status === 'wartet' && st.frei > 0 && <button style={s.mini} disabled={busy} onClick={() => void vmStatus(v, 'benachrichtigt')}>benachrichtigt</button>}
                                            {st.frei > 0 && a.status === 'offen' && <button style={s.mini} disabled={busy} onClick={() => void uebernehmen(a, v)}>→ Vorbestellung</button>}
                                            {v.status === 'benachrichtigt' && <button style={s.mini} disabled={busy} onClick={() => void vmStatus(v, 'erloschen')}>keine Antwort</button>}
                                            <button style={s.mini} disabled={busy} onClick={() => void vmStatus(v, 'abgemeldet')}>abmelden</button>
                                          </span>
                                        )}
                                        {textFuer === v.id && <pre style={s.text}>{nachricht.text}</pre>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {istChef && loeschbar > 0 && (
                          <button style={{ ...s.btnAus, marginTop: 8 }} disabled={busy} onClick={() => void erledigteLoeschen(a)}>{loeschbar} erledigte Vormerkung(en) löschen (älter als 30 Tage)</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>)}
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
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit' },
  feld: { display: 'grid', gap: 4, fontSize: 13, color: C.dim },
  text: { whiteSpace: 'pre-wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, marginTop: 6, maxWidth: 520, fontFamily: 'inherit' },
};
