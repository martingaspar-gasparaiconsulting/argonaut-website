'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/verleih/fahrzeuge — V1 Fahrzeugvermietung Kern (Paket 291)
//
// Für Autovermietung, Luxus-, Wohnmobil-, Transporter-, Motorrad- und
// E-Bike-Verleih: Kalender je Fahrzeug, Buchungen (Mietverträge), Mietflotte
// mit Preisen und Bedingungen, eigene Mietbedingungen. Die Datenbank sperrt
// Doppelbuchungen (Fehler 23P01) und friert die Preise bei der Buchung ein.
// Übergabe, Rückgabe, Fahrer, Kaution, Schäden und Rechnung: Paket 292
// (/dashboard/verleih/fahrzeuge/[id]). Logik: lib/fahrzeugMiete.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ARTEN, STATUS, KAUTION_STATUS, fahrzeugPruefen, buchungPruefen, kalenderZeile, tageAb, berlinTag, kennzahlen, ueberfaellig,
  abrechnung, zeit, type BuchungKurz,
} from '@/lib/fahrzeugMiete';
import { euro } from '@/lib/geld';
import { zahlFeld, leseZahl } from '@/lib/zahlen';
import Leerzustand from '../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };

type Fz = {
  id: string; bezeichnung: string; kennzeichen: string | null; art: string; fs_klasse: string | null;
  tagessatz_cent: number; wochensatz_cent: number | null; frei_km_tag: number | null; mehr_km_cent: number; kaution_cent: number;
  mindestalter: number; fs_jahre_min: number; zusatzfahrer_tag_cent: number; tank_achtel_cent: number; km_stand: number | null; aktiv: boolean; notiz: string | null;
};
type Bu = BuchungKurz & { nummer: string | null; mieter_name: string; kaution_status: string; kaution_cent: number; rechnung_id: string | null };
type Kontakt = { id: string; name: string; email: string | null; anschrift: string | null; telefon: string | null };
type FzForm = { id: string | null; bezeichnung: string; kennzeichen: string; art: string; fsKlasse: string; tagessatz: string; wochensatz: string; freiKmTag: string; mehrKm: string; kaution: string; mindestalter: string; fsJahre: string; zusatzfahrer: string; tankAchtel: string; kmStand: string; notiz: string; aktiv: boolean };
type BuForm = { fahrzeugId: string; kontaktId: string; mieterName: string; anschrift: string; email: string; telefon: string; abholung: string; rueckgabe: string; notiz: string };

const LEER_FZ: FzForm = { id: null, bezeichnung: '', kennzeichen: '', art: 'pkw', fsKlasse: 'B', tagessatz: '', wochensatz: '', freiKmTag: '', mehrKm: '', kaution: '', mindestalter: '18', fsJahre: '1', zusatzfahrer: '', tankAchtel: '', kmStand: '', notiz: '', aktiv: true };
const ART_NAME: Record<string, string> = Object.fromEntries(ARTEN.map((a) => [a.key, a.label]));

function heute(): string { return berlinTag(Date.now()); }
/** datetime-local (Ortszeit des Browsers) */
function lokal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function tagUm(tag: string, stunde: number): number { const [j, m, t] = tag.split('-').map(Number); return new Date(j, m - 1, t, stunde, 0).getTime(); }
function wann(iso: string | null | undefined): string {
  const t = zeit(iso);
  return t === null ? '—' : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
}
function kurzTag(tag: string): string { const d = new Date(tag + 'T12:00:00Z'); return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(d); }
function cent(n: number | null | undefined): string { return n === null || n === undefined ? '—' : euro(n / 100); }
function kontaktLesen(k: Record<string, unknown>): Kontakt {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const name = s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
  const ort = [s(k.plz), s(k.ort)].filter(Boolean).join(' ');
  const anschrift = [s(k.strasse), ort].filter(Boolean).join('\n') || s(k.adresse) || null;
  return { id: String(k.id), name, email: s(k.email) || null, anschrift, telefon: s(k.telefon) || s(k.mobil) || null };
}

export default function FahrzeugvermietungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [tab, setTab] = useState<'kalender' | 'buchungen' | 'flotte' | 'einstellungen'>('kalender');
  const [fz, setFz] = useState<Fz[]>([]);
  const [bu, setBu] = useState<Bu[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [bedingungen, setBedingungen] = useState('');
  const [kulanz, setKulanz] = useState('0');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fzForm, setFzForm] = useState<FzForm | null>(null);
  const [buForm, setBuForm] = useState<BuForm | null>(null);
  const [start, setStart] = useState(heute());
  const [filter, setFilter] = useState<'offen' | 'alle'>('offen');
  const [frage, setFrage] = useState<string | null>(null);
  const [jetzt, setJetzt] = useState(() => Date.now());

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const id = u?.user?.id ?? null;
    setUid(id);
    if (!id) { setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    setIstChef(!(typeof chef === 'string' && chef && chef !== id));
    const [f, b, e, k] = await Promise.all([
      supabase.from('miet_fahrzeug').select('id, bezeichnung, kennzeichen, art, fs_klasse, tagessatz_cent, wochensatz_cent, frei_km_tag, mehr_km_cent, kaution_cent, mindestalter, fs_jahre_min, zusatzfahrer_tag_cent, tank_achtel_cent, km_stand, aktiv, notiz').order('aktiv', { ascending: false }).order('bezeichnung').limit(1000),
      supabase.from('miet_buchung').select('id, nummer, fahrzeug_id, mieter_name, abholung, rueckgabe_plan, status, kaution_status, kaution_cent, rechnung_id').order('abholung', { ascending: false }).limit(1000),
      supabase.from('miet_einstellung').select('mietbedingungen, kulanz_minuten').maybeSingle(),
      supabase.from('kontakte').select('*').limit(1000),
    ]);
    if (f.error || b.error) setFehler('Die Fahrzeugvermietung ist noch nicht eingerichtet (SQL zu Paket 291 fehlt) oder Ihnen fehlt das Recht „Verleih & Vermietung".');
    setFz((f.data as Fz[] | null) ?? []);
    setBu((b.data as Bu[] | null) ?? []);
    setBedingungen(String(e.data?.mietbedingungen ?? ''));
    setKulanz(String(e.data?.kulanz_minuten ?? 0));
    setKontakte(((k.data ?? []) as Record<string, unknown>[]).map(kontaktLesen).sort((x, y) => x.name.localeCompare(y.name, 'de')));
    setJetzt(Date.now());
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const aktive = useMemo(() => fz.filter((f) => f.aktiv), [fz]);
  const fzName = useCallback((id: string) => { const f = fz.find((x) => x.id === id); return f ? `${f.bezeichnung}${f.kennzeichen ? ` · ${f.kennzeichen}` : ''}` : '—'; }, [fz]);
  const tage = useMemo(() => tageAb(start, 14), [start]);
  const zahlen = useMemo(() => kennzahlen(bu, jetzt, heute()), [bu, jetzt]);
  const liste = useMemo(() => (filter === 'offen' ? bu.filter((b) => b.status === 'reserviert' || b.status === 'uebergeben').sort((a, b) => a.abholung.localeCompare(b.abholung)) : bu), [bu, filter]);

  // Vorschau Mietpreis in der neuen Buchung (Preise friert die Datenbank aus der Flotte ein)
  const vorschau = useMemo(() => {
    if (!buForm) return null;
    const f = fz.find((x) => x.id === buForm.fahrzeugId);
    const a = zeit(buForm.abholung ? new Date(buForm.abholung).toISOString() : null), r = zeit(buForm.rueckgabe ? new Date(buForm.rueckgabe).toISOString() : null);
    if (!f || a === null || r === null || r <= a) return null;
    const x = abrechnung({ abholung: new Date(a).toISOString(), rueckgabe_plan: new Date(r).toISOString(), rueckgabe_ist: null, tagessatz_cent: f.tagessatz_cent, wochensatz_cent: f.wochensatz_cent, frei_km_tag: f.frei_km_tag, mehr_km_cent: f.mehr_km_cent, zusatzfahrer_tag_cent: f.zusatzfahrer_tag_cent, tank_achtel_cent: f.tank_achtel_cent, km_start: null, km_ende: null, tank_start: null, tank_ende: null }, 0, 0, f.bezeichnung);
    return { tage: x.tage, netto: x.netto_cent, frei: f.frei_km_tag === null ? null : f.frei_km_tag * x.tage, kaution: f.kaution_cent, f };
  }, [buForm, fz]);

  function neueBuchung(fahrzeugId?: string, tag?: string) {
    setOk(null); setFehler(null); setTab('buchungen');
    const t = tag ?? heute();
    const [j, m, d] = t.split('-').map(Number);
    const morgen = new Date(Date.UTC(j, m - 1, d + 1)).toISOString().slice(0, 10);
    setBuForm({ fahrzeugId: fahrzeugId ?? aktive[0]?.id ?? '', kontaktId: '', mieterName: '', anschrift: '', email: '', telefon: '', abholung: lokal(tagUm(t, 9)), rueckgabe: lokal(tagUm(morgen, 9)), notiz: '' });
  }

  async function buchungSpeichern() {
    if (!buForm) return;
    const p = buchungPruefen({
      fahrzeugId: buForm.fahrzeugId, kontaktId: buForm.kontaktId, mieterName: buForm.mieterName, anschrift: buForm.anschrift, email: buForm.email, telefon: buForm.telefon,
      abholung: buForm.abholung ? new Date(buForm.abholung).toISOString() : '', rueckgabe: buForm.rueckgabe ? new Date(buForm.rueckgabe).toISOString() : '', notiz: buForm.notiz, buchungen: bu,
    });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_buchung').insert(p.zeile).select('id, nummer');
    setBusy(false);
    if (error || !data || data.length === 0) {
      const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
      setFehler(/23P01|exclusion|ueberschneidung/i.test(m) ? 'Das Fahrzeug ist in diesem Zeitraum gerade vergeben worden — bitte den Kalender neu ansehen.' : /row-level|permission/i.test(m) ? 'Buchen braucht das Schreibrecht „Verleih & Vermietung".' : 'Die Buchung wurde nicht gespeichert.');
      await lade();
      return;
    }
    setBuForm(null); setOk(`Reserviert: ${data[0].nummer}. Fahrer, Kaution und Übergabe tragen Sie im Mietvertrag ein.`);
    await lade();
  }

  async function stornieren(id: string) {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_buchung').update({ status: 'storniert' }).eq('id', id).eq('status', 'reserviert').select('id');
    setBusy(false); setFrage(null);
    if (error || !data || data.length === 0) { setFehler('Nicht storniert — nur Reservierungen lassen sich stornieren.'); return; }
    setOk('Reservierung storniert — das Fahrzeug ist in diesem Zeitraum wieder frei.'); await lade();
  }

  function fzBearbeiten(f: Fz) {
    setOk(null); setFehler(null);
    const e = (c: number | null) => (c === null ? '' : zahlFeld(c / 100));
    setFzForm({
      id: f.id, bezeichnung: f.bezeichnung, kennzeichen: f.kennzeichen ?? '', art: f.art, fsKlasse: f.fs_klasse ?? '', tagessatz: e(f.tagessatz_cent), wochensatz: e(f.wochensatz_cent),
      freiKmTag: f.frei_km_tag === null ? '' : String(f.frei_km_tag), mehrKm: e(f.mehr_km_cent), kaution: e(f.kaution_cent), mindestalter: String(f.mindestalter), fsJahre: String(f.fs_jahre_min),
      zusatzfahrer: e(f.zusatzfahrer_tag_cent), tankAchtel: e(f.tank_achtel_cent), kmStand: f.km_stand === null ? '' : String(f.km_stand), notiz: f.notiz ?? '', aktiv: f.aktiv,
    });
  }

  async function fzSpeichern() {
    if (!fzForm) return;
    const p = fahrzeugPruefen(fzForm);
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    const res = fzForm.id
      ? await supabase.from('miet_fahrzeug').update(p.zeile).eq('id', fzForm.id).select('id')
      : await supabase.from('miet_fahrzeug').insert(p.zeile).select('id');
    setBusy(false);
    if (res.error || !res.data || res.data.length === 0) { setFehler('Das Fahrzeug wurde nicht gespeichert — die Mietflotte pflegt nur der Chef.'); return; }
    setFzForm(null); setOk(fzForm.id ? 'Fahrzeug geändert. Bestehende Buchungen behalten ihre Preise.' : 'Fahrzeug in die Mietflotte aufgenommen.');
    await lade();
  }

  async function einstellungSpeichern() {
    if (!uid) return;
    const k = leseZahl(kulanz);
    if (k === null || !Number.isInteger(k) || k < 0 || k > 180) { setFehler('Kulanz: ganze Minuten von 0 bis 180.'); return; }
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('miet_einstellung').upsert({ owner_user_id: uid, mietbedingungen: bedingungen.trim().slice(0, 30000) || null, kulanz_minuten: k, aktualisiert_am: new Date().toISOString() }, { onConflict: 'owner_user_id' }).select('owner_user_id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler('Nicht gespeichert — die Einstellungen pflegt nur der Chef.'); return; }
    setOk('Gespeichert. Neue Übergaben übernehmen diese Fassung der Mietbedingungen in den Vertrag.');
  }

  const STATUS_FARBE: Record<string, string> = { reserviert: C.cyan, uebergeben: C.gold, zurueck: C.ok, storniert: C.dim };

  return (
    <div style={s.page}>
      <a href="/dashboard/verleih" style={s.zurueck}>← Verleih & Vermietung</a>
      <h1 style={s.h1}>🚗 Fahrzeugvermietung</h1>
      <p style={s.dim}>
        So geht&apos;s: Legen Sie Ihre Mietflotte mit Preisen und Bedingungen an (Mindestalter, Führerschein seit, Klasse, Frei-km, Kaution).
        Im Kalender sehen Sie, welches Fahrzeug wann frei ist — ein Klick auf einen freien Tag startet die Reservierung. Doppelt vergeben geht nicht, das sperrt die Datenbank.
        Im Mietvertrag prüfen Sie die Fahrer, nehmen die Kaution, übergeben mit km, Tank und Fotos und rechnen nach der Rückgabe ab.
      </p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}
      {laden && <p style={s.dim}>Lädt …</p>}

      {!laden && (
        <>
          <div style={s.kacheln}>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.unterwegs}</b><span style={s.dim}>unterwegs</span></div>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.heuteAbholung}</b><span style={s.dim}>Abholungen heute</span></div>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.heuteRueckgabe}</b><span style={s.dim}>Rückgaben heute</span></div>
            <div style={{ ...s.kachel, borderColor: zahlen.ueberfaellig ? C.bad : C.border }}><b style={{ ...s.zahl, color: zahlen.ueberfaellig ? C.bad : C.text }}>{zahlen.ueberfaellig}</b><span style={s.dim}>überfällig</span></div>
            <div style={{ ...s.kachel, borderColor: zahlen.kautionOffen ? C.warn : C.border }}><b style={{ ...s.zahl, color: zahlen.kautionOffen ? C.warn : C.text }}>{zahlen.kautionOffen}</b><span style={s.dim}>Kautionen noch zurückzugeben</span></div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
            {([['kalender', '📅 Kalender'], ['buchungen', '📋 Buchungen'], ['flotte', '🚗 Mietflotte'], ...(istChef ? [['einstellungen', '⚙ Mietbedingungen']] : [])] as [typeof tab, string][]).map(([k, l]) => (
              <button key={k} type="button" style={tab === k ? s.tabAn : s.tab} onClick={() => setTab(k)}>{l}</button>
            ))}
            {aktive.length > 0 && <button type="button" style={{ ...s.btnGold, marginLeft: 'auto' }} onClick={() => neueBuchung()}>＋ Neue Buchung</button>}
          </div>

          {fz.length === 0 && tab !== 'flotte' && tab !== 'einstellungen' && (
            <Leerzustand icon="🚗" titel="Noch keine Mietfahrzeuge" text={istChef ? 'Nehmen Sie zuerst Ihre Fahrzeuge mit Preisen und Bedingungen in die Mietflotte auf — dann buchen Sie hier.' : 'Der Chef legt die Mietflotte an — danach buchen Sie hier.'} aktionText={istChef ? 'Zur Mietflotte' : undefined} onAktion={istChef ? () => setTab('flotte') : undefined} />
          )}

          {/* ---------------------------------------------------- Kalender --- */}
          {tab === 'kalender' && aktive.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px' }}>
                <button type="button" style={s.btnAus} onClick={() => setStart(new Date(Date.parse(start + 'T12:00:00Z') - 7 * 86_400_000).toISOString().slice(0, 10))}>← 7 Tage</button>
                <button type="button" style={s.btnAus} onClick={() => setStart(heute())}>Heute</button>
                <button type="button" style={s.btnAus} onClick={() => setStart(tage[7])}>7 Tage →</button>
                <span style={{ ...s.dim, margin: 0 }}><span style={{ color: C.cyan }}>■</span> reserviert · <span style={{ color: C.gold }}>■</span> unterwegs · leer = frei (Klick bucht)</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ ...s.tabelle, minWidth: 900 }}>
                  <thead><tr><th style={{ ...s.th, textAlign: 'left' }}>Fahrzeug</th>{tage.map((t) => <th key={t} style={{ ...s.th, color: t === heute() ? C.gold : C.dim }}>{kurzTag(t)}</th>)}</tr></thead>
                  <tbody>
                    {aktive.map((f) => {
                      const zeile = kalenderZeile(bu, f.id, tage);
                      return (
                        <tr key={f.id}>
                          <td style={{ ...s.td, textAlign: 'left', whiteSpace: 'nowrap' }}>{f.bezeichnung}<div style={{ color: C.dim, fontSize: 11.5 }}>{[f.kennzeichen, ART_NAME[f.art]].filter(Boolean).join(' · ')}</div></td>
                          {zeile.map((b, i) => (
                            <td key={tage[i]} style={{ ...s.td, padding: 2 }}>
                              {b
                                ? <a href={`/dashboard/verleih/fahrzeuge/${b.id}`} title={`${b.nummer ?? ''} · ${b.mieter_name ?? ''}`} style={{ display: 'block', height: 30, borderRadius: 6, background: b.status === 'uebergeben' ? 'rgba(201,168,76,0.55)' : 'rgba(0,229,255,0.35)', color: C.navy, fontSize: 10.5, fontWeight: 700, lineHeight: '30px', overflow: 'hidden', textDecoration: 'none' }}>{(b.mieter_name ?? '').split(' ').slice(-1)[0]}</a>
                                : <button type="button" aria-label={`${f.bezeichnung} am ${tage[i]} buchen`} style={{ width: '100%', height: 30, borderRadius: 6, border: `1px dashed ${C.border}`, background: 'transparent', cursor: 'pointer' }} onClick={() => neueBuchung(f.id, tage[i])} />}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ---------------------------------------------------- Buchungen --- */}
          {tab === 'buchungen' && (
            <>
              {buForm && (
                <div style={s.box}>
                  <b style={{ color: C.gold }}>Neue Buchung (Reservierung)</b>
                  <div style={s.raster}>
                    <label style={s.feld}>Fahrzeug
                      <select value={buForm.fahrzeugId} style={s.eingabe} onChange={(e) => setBuForm({ ...buForm, fahrzeugId: e.target.value })}>
                        {aktive.map((f) => <option key={f.id} value={f.id}>{f.bezeichnung}{f.kennzeichen ? ` · ${f.kennzeichen}` : ''}</option>)}
                      </select>
                    </label>
                    <label style={s.feld}>Abholung<input type="datetime-local" value={buForm.abholung} style={s.eingabe} onChange={(e) => setBuForm({ ...buForm, abholung: e.target.value })} /></label>
                    <label style={s.feld}>Rückgabe<input type="datetime-local" value={buForm.rueckgabe} style={s.eingabe} onChange={(e) => setBuForm({ ...buForm, rueckgabe: e.target.value })} /></label>
                    <label style={s.feld}>Mieter aus Kontakten
                      <select value={buForm.kontaktId} style={s.eingabe} onChange={(e) => {
                        const k = kontakte.find((x) => x.id === e.target.value);
                        setBuForm({ ...buForm, kontaktId: e.target.value, mieterName: k?.name ?? buForm.mieterName, email: k?.email ?? buForm.email, anschrift: k?.anschrift ?? buForm.anschrift, telefon: k?.telefon ?? buForm.telefon });
                      }}>
                        <option value="">— neuer Mieter —</option>
                        {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                      </select>
                    </label>
                    <label style={s.feld}>Name des Mieters *<input value={buForm.mieterName} maxLength={120} style={s.eingabe} onChange={(e) => setBuForm({ ...buForm, mieterName: e.target.value })} /></label>
                    <label style={s.feld}>E-Mail<input type="email" value={buForm.email} maxLength={160} style={s.eingabe} onChange={(e) => setBuForm({ ...buForm, email: e.target.value })} /></label>
                    <label style={s.feld}>Telefon<input value={buForm.telefon} maxLength={40} style={s.eingabe} onChange={(e) => setBuForm({ ...buForm, telefon: e.target.value })} /></label>
                    <label style={s.feld}>Anschrift (spätestens zur Übergabe)<textarea value={buForm.anschrift} rows={2} maxLength={300} style={s.eingabe} onChange={(e) => setBuForm({ ...buForm, anschrift: e.target.value })} /></label>
                    <label style={s.feld}>Notiz<input value={buForm.notiz} maxLength={1000} style={s.eingabe} onChange={(e) => setBuForm({ ...buForm, notiz: e.target.value })} /></label>
                  </div>
                  {vorschau && (
                    <p style={{ ...s.dim, marginTop: 10 }}>
                      {vorschau.tage} Miettag{vorschau.tage === 1 ? '' : 'e'} · Miete <b style={{ color: C.text }}>{cent(vorschau.netto)}</b> netto
                      {vorschau.frei === null ? ' · km frei' : ` · ${vorschau.frei.toLocaleString('de-DE')} km frei, danach ${cent(vorschau.f.mehr_km_cent)} je km`}
                      {vorschau.kaution > 0 ? ` · Kaution ${cent(vorschau.kaution)}` : ''}
                      {` · Mindestalter ${vorschau.f.mindestalter}, Führerschein seit ${vorschau.f.fs_jahre_min} J.${vorschau.f.fs_klasse ? `, Klasse ${vorschau.f.fs_klasse}` : ''}`}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" style={s.btnGold} disabled={busy} onClick={() => void buchungSpeichern()}>{busy ? 'Speichert …' : '📅 Reservieren'}</button>
                    <button type="button" style={s.btnAus} onClick={() => setBuForm(null)}>Abbrechen</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
                <button type="button" style={filter === 'offen' ? s.tabAn : s.tab} onClick={() => setFilter('offen')}>Offen</button>
                <button type="button" style={filter === 'alle' ? s.tabAn : s.tab} onClick={() => setFilter('alle')}>Alle</button>
              </div>
              {liste.length === 0 ? <p style={s.dim}>{filter === 'offen' ? 'Keine offenen Buchungen.' : 'Noch keine Buchungen.'}</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.tabelle}>
                    <thead><tr><th style={s.th}>Vertrag</th><th style={{ ...s.th, textAlign: 'left' }}>Fahrzeug · Mieter</th><th style={s.th}>Abholung</th><th style={s.th}>Rückgabe</th><th style={s.th}>Status</th><th style={s.th}>Kaution</th><th style={s.th}></th></tr></thead>
                    <tbody>
                      {liste.map((b) => (
                        <tr key={b.id}>
                          <td style={s.td}><a href={`/dashboard/verleih/fahrzeuge/${b.id}`} style={{ color: C.gold, fontWeight: 700 }}>{b.nummer ?? '—'}</a></td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{fzName(b.fahrzeug_id)}<div style={{ color: C.dim, fontSize: 12 }}>{b.mieter_name}</div></td>
                          <td style={s.td}>{wann(b.abholung)}</td>
                          <td style={s.td}>{wann(b.rueckgabe_plan)}{ueberfaellig(b, jetzt) && <div style={{ color: C.bad, fontSize: 11.5, fontWeight: 700 }}>überfällig</div>}</td>
                          <td style={{ ...s.td, color: STATUS_FARBE[b.status] ?? C.text, fontWeight: 700 }}>{STATUS[b.status] ?? b.status}{b.rechnung_id && <div style={{ color: C.ok, fontSize: 11.5 }}>abgerechnet</div>}</td>
                          <td style={s.td}>{b.kaution_cent > 0 ? <>{cent(b.kaution_cent)}<div style={{ color: b.kaution_status === 'hinterlegt' && (b.status === 'zurueck' || b.status === 'storniert') ? C.warn : C.dim, fontSize: 11.5 }}>{KAUTION_STATUS[b.kaution_status] ?? b.kaution_status}</div></> : '—'}</td>
                          <td style={s.td}>
                            <a href={`/dashboard/verleih/fahrzeuge/${b.id}`} style={s.link}>öffnen</a>
                            {b.status === 'reserviert' && (frage === b.id
                              ? <> · <button type="button" style={s.link} disabled={busy} onClick={() => void stornieren(b.id)}>Ja, stornieren</button> <button type="button" style={s.link} onClick={() => setFrage(null)}>nein</button></>
                              : <> · <button type="button" style={s.link} onClick={() => setFrage(b.id)}>stornieren</button></>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ---------------------------------------------------- Flotte --- */}
          {tab === 'flotte' && (
            <>
              {istChef && !fzForm && <button type="button" style={s.btnGold} onClick={() => { setOk(null); setFehler(null); setFzForm({ ...LEER_FZ }); }}>＋ Fahrzeug aufnehmen</button>}
              {fzForm && (
                <div style={s.box}>
                  <b style={{ color: C.gold }}>{fzForm.id ? 'Mietfahrzeug ändern' : 'Fahrzeug in die Mietflotte aufnehmen'}</b>
                  <p style={{ ...s.dim, fontSize: 13 }}>Alle Preise netto. Bestehende Buchungen behalten die Preise, die bei der Buchung galten. Leer gelassene Frei-km bedeuten: km frei.</p>
                  <div style={s.raster}>
                    <label style={s.feld}>Bezeichnung *<input value={fzForm.bezeichnung} maxLength={120} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, bezeichnung: e.target.value })} /></label>
                    <label style={s.feld}>Kennzeichen<input value={fzForm.kennzeichen} maxLength={15} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, kennzeichen: e.target.value })} /></label>
                    <label style={s.feld}>Art
                      <select value={fzForm.art} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, art: e.target.value, fsKlasse: e.target.value === 'ebike' ? '' : e.target.value === 'motorrad' ? 'A' : fzForm.fsKlasse })}>
                        {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                      </select>
                    </label>
                    <label style={s.feld}>Führerscheinklasse (leer = keine)<input value={fzForm.fsKlasse} maxLength={4} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, fsKlasse: e.target.value })} /></label>
                    <label style={s.feld}>Tagessatz € *<input inputMode="decimal" value={fzForm.tagessatz} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, tagessatz: e.target.value })} /></label>
                    <label style={s.feld}>Wochensatz €<input inputMode="decimal" value={fzForm.wochensatz} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, wochensatz: e.target.value })} /></label>
                    <label style={s.feld}>Frei-km je Tag<input inputMode="numeric" value={fzForm.freiKmTag} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, freiKmTag: e.target.value })} /></label>
                    <label style={s.feld}>Mehr-km € je km<input inputMode="decimal" value={fzForm.mehrKm} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, mehrKm: e.target.value })} /></label>
                    <label style={s.feld}>Kaution €<input inputMode="decimal" value={fzForm.kaution} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, kaution: e.target.value })} /></label>
                    <label style={s.feld}>Mindestalter<input inputMode="numeric" value={fzForm.mindestalter} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, mindestalter: e.target.value })} /></label>
                    <label style={s.feld}>Führerschein seit mind. (Jahre)<input inputMode="numeric" value={fzForm.fsJahre} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, fsJahre: e.target.value })} /></label>
                    <label style={s.feld}>Zusatzfahrer € je Tag<input inputMode="decimal" value={fzForm.zusatzfahrer} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, zusatzfahrer: e.target.value })} /></label>
                    <label style={s.feld}>Nachtanken/-laden € je Achtel<input inputMode="decimal" value={fzForm.tankAchtel} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, tankAchtel: e.target.value })} /></label>
                    <label style={s.feld}>km-Stand<input inputMode="numeric" value={fzForm.kmStand} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, kmStand: e.target.value })} /></label>
                    <label style={s.feld}>Notiz<input value={fzForm.notiz} maxLength={500} style={s.eingabe} onChange={(e) => setFzForm({ ...fzForm, notiz: e.target.value })} /></label>
                    <label style={{ ...s.feld, gridAutoFlow: 'column', justifyContent: 'start', alignItems: 'center' }}><input type="checkbox" checked={fzForm.aktiv} onChange={(e) => setFzForm({ ...fzForm, aktiv: e.target.checked })} /> in der Mietflotte (buchbar)</label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" style={s.btnGold} disabled={busy} onClick={() => void fzSpeichern()}>{busy ? 'Speichert …' : '💾 Speichern'}</button>
                    <button type="button" style={s.btnAus} onClick={() => setFzForm(null)}>Abbrechen</button>
                  </div>
                </div>
              )}
              {fz.length === 0 && !fzForm && <p style={s.dim}>Noch keine Fahrzeuge in der Mietflotte.</p>}
              {fz.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.tabelle}>
                    <thead><tr><th style={{ ...s.th, textAlign: 'left' }}>Fahrzeug</th><th style={s.th}>Tag / Woche</th><th style={s.th}>km frei · Mehr-km</th><th style={s.th}>Kaution</th><th style={s.th}>Fahrer</th><th style={s.th}>km-Stand</th><th style={s.th}></th></tr></thead>
                    <tbody>
                      {fz.map((f) => (
                        <tr key={f.id} style={{ opacity: f.aktiv ? 1 : 0.5 }}>
                          <td style={{ ...s.td, textAlign: 'left' }}>{f.bezeichnung}<div style={{ color: C.dim, fontSize: 12 }}>{[f.kennzeichen, ART_NAME[f.art], f.aktiv ? null : 'nicht buchbar'].filter(Boolean).join(' · ')}</div></td>
                          <td style={s.td}>{cent(f.tagessatz_cent)}<div style={{ color: C.dim, fontSize: 12 }}>{f.wochensatz_cent ? cent(f.wochensatz_cent) : '—'}</div></td>
                          <td style={s.td}>{f.frei_km_tag === null ? 'frei' : `${f.frei_km_tag} km/Tag`}<div style={{ color: C.dim, fontSize: 12 }}>{f.mehr_km_cent ? `${cent(f.mehr_km_cent)} je km` : '—'}</div></td>
                          <td style={s.td}>{f.kaution_cent ? cent(f.kaution_cent) : '—'}</td>
                          <td style={s.td}>ab {f.mindestalter} J.<div style={{ color: C.dim, fontSize: 12 }}>FS {f.fs_jahre_min} J.{f.fs_klasse ? ` · Kl. ${f.fs_klasse}` : ''}</div></td>
                          <td style={s.td}>{f.km_stand === null ? '—' : f.km_stand.toLocaleString('de-DE')}</td>
                          <td style={s.td}>{istChef && <button type="button" style={s.link} onClick={() => fzBearbeiten(f)}>ändern</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ---------------------------------------------------- Einstellungen --- */}
          {tab === 'einstellungen' && istChef && (
            <div style={s.box}>
              <b style={{ color: C.gold }}>⚙ Ihre Mietbedingungen</b>
              <p style={{ ...s.dim, fontSize: 13 }}>
                Tragen Sie hier Ihre eigenen Mietbedingungen ein (Versicherung und Selbstbeteiligung, Tankregel, Auslandsfahrten, Rauchverbot, Haustiere, Haftung).
                Bei jeder Übergabe wird die gerade gültige Fassung in den Mietvertrag übernommen und dort festgehalten. ARGONAUT liefert dafür keinen Mustertext — lassen Sie Ihre Bedingungen rechtlich prüfen.
              </p>
              <textarea value={bedingungen} rows={12} maxLength={30000} style={{ ...s.eingabe, width: '100%', boxSizing: 'border-box' }} onChange={(e) => setBedingungen(e.target.value)} />
              <div style={{ ...s.raster, maxWidth: 520 }}>
                <label style={s.feld}>Kulanz bei der Rückgabe (Minuten, 0–180)<input inputMode="numeric" value={kulanz} style={s.eingabe} onChange={(e) => setKulanz(e.target.value)} /></label>
              </div>
              <p style={{ ...s.dim, fontSize: 13 }}>Kulanz: so viele Minuten nach Ablauf eines Miettages wird noch kein weiterer Tag berechnet.</p>
              <button type="button" style={s.btnGold} disabled={busy} onClick={() => void einstellungSpeichern()}>💾 Speichern</button>
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
