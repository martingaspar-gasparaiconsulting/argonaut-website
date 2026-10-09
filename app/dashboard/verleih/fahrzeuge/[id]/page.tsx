'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/verleih/fahrzeuge/[id] — Mietvertrag (Paket 292)
//
// Ein Mietvertrag von der Reservierung bis zur Rechnung: Mieter, Fahrer mit
// Prüfvermerk (Alter, Führerschein-Dauer, Klasse, Ausweis — OHNE Nummer),
// Kaution (Art, Status, Vorgangsnummer des Zahlungsanbieters — NIE
// Kartendaten), Übergabe und Rückgabe mit km, Tank in Achteln und Fotos,
// Schäden mit Fotos, Abrechnung. Die Datenbank prüft jeden Schritt noch einmal
// (Paket 291) und hält Übergabe, Fotos und Prüfvermerke unveränderlich fest.
// Logik: lib/fahrzeugMiete.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
  STATUS, KAUTION_ARTEN, KAUTION_STATUS, SCHADEN_BEREICHE, SCHADEN_ARTEN, MIET_BUCKET,
  fahrerPruefen, fahrerBewerten, kautionPruefen, einbehaltPruefen, uebergabePruefen, rueckgabePruefen, schadenPruefen,
  abrechnung, achtelText, berlinTag, zeit, fotoPfad, buchungPruefen, ueberfaellig, type BuchungKurz,
} from '@/lib/fahrzeugMiete';
import { verkleinereBild } from '@/lib/bildKlein';
import { pruefeMedium, endungFuer } from '@/lib/kfzMedien';
import { euro } from '@/lib/geld';
import { useDarfAbrechnen } from '../../../_components/useDarfAbrechnen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };

type Buchung = {
  id: string; owner_user_id: string; nummer: string | null; fahrzeug_id: string; kontakt_id: string | null; status: string;
  mieter_name: string; mieter_anschrift: string | null; mieter_email: string | null; mieter_telefon: string | null;
  abholung: string; rueckgabe_plan: string; rueckgabe_ist: string | null; uebergabe_am: string | null;
  tagessatz_cent: number; wochensatz_cent: number | null; frei_km_tag: number | null; mehr_km_cent: number; kaution_cent: number;
  mindestalter: number; fs_jahre_min: number; fs_klasse: string | null; zusatzfahrer_tag_cent: number; tank_achtel_cent: number;
  kaution_art: string; kaution_status: string; kaution_referenz: string | null; kaution_einbehalt_cent: number; kaution_grund: string | null;
  vertrag_unterschrieben: boolean; km_start: number | null; tank_start: number | null; km_ende: number | null; tank_ende: number | null;
  fotos_uebergabe: string[]; fotos_rueckgabe: string[]; rechnung_id: string | null; notiz: string | null;
};
type Fz = { id: string; bezeichnung: string; kennzeichen: string | null; km_stand: number | null };
type Fahrer = { id: string; rolle: string; name: string; geburtsdatum: string; fs_erteilt_am: string; fs_klassen: string | null; fs_gueltig_bis: string | null; ausweis_abgeglichen: boolean; alter_ok: boolean; dauer_ok: boolean; klasse_ok: boolean; dokument_ok: boolean; ergebnis: string; geprueft_am: string; bemerkung: string | null };
type Schaden = { id: string; buchung_id: string | null; phase: string; bereich: string; art: string; beschreibung: string | null; fotos: string[]; behoben_am: string | null; erfasst_am: string };

const BEREICH = Object.fromEntries(SCHADEN_BEREICHE.map((b) => [b.key, b.label])) as Record<string, string>;
const ART = Object.fromEntries(SCHADEN_ARTEN.map((b) => [b.key, b.label])) as Record<string, string>;
const PHASE: Record<string, string> = { uebergabe: 'bei Übergabe', rueckgabe: 'bei Rückgabe', sonstig: 'sonst festgestellt' };

function heute(): string { return berlinTag(Date.now()); }
function wann(iso: string | null | undefined): string {
  const t = zeit(iso);
  return t === null ? '—' : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
}
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }
function lokal(ms: number): string {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function cent(n: number | null | undefined): string { return n === null || n === undefined ? '—' : euro(n / 100); }
const TANK = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export default function MietvertragPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const darfAbrechnen = useDarfAbrechnen();
  const [b, setB] = useState<Buchung | null>(null);
  const [fz, setFz] = useState<Fz | null>(null);
  const [fahrer, setFahrer] = useState<Fahrer[]>([]);
  const [schaeden, setSchaeden] = useState<Schaden[]>([]);
  const [andere, setAndere] = useState<BuchungKurz[]>([]);
  const [kulanz, setKulanz] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mieter, setMieter] = useState<{ name: string; anschrift: string; email: string; telefon: string; rueckgabe: string; notiz: string } | null>(null);
  const [fa, setFa] = useState({ rolle: 'haupt', name: '', geburtsdatum: '', fsErteilt: '', klassen: '', gueltigBis: '', ausweis: false, bemerkung: '' });
  const [kau, setKau] = useState({ art: 'keine', status: 'offen', referenz: '' });
  const [einb, setEinb] = useState({ betrag: '', grund: '' });
  const [ueb, setUeb] = useState({ km: '', tank: '8', unterschrieben: false });
  const [rue, setRue] = useState({ km: '', tank: '8', zeit: '' });
  const [sch, setSch] = useState({ phase: 'rueckgabe', bereich: 'vorne', art: 'kratzer', beschreibung: '' });
  const [frage, setFrage] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    if (!uid || !/^[0-9a-f-]{36}$/i.test(id)) { setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const bt = typeof chef === 'string' && chef ? chef : uid;
    setBetrieb(bt); setIstChef(bt === uid);
    const { data: bRoh, error } = await supabase.from('miet_buchung').select('id, owner_user_id, nummer, fahrzeug_id, kontakt_id, status, mieter_name, mieter_anschrift, mieter_email, mieter_telefon, abholung, rueckgabe_plan, rueckgabe_ist, uebergabe_am, tagessatz_cent, wochensatz_cent, frei_km_tag, mehr_km_cent, kaution_cent, mindestalter, fs_jahre_min, fs_klasse, zusatzfahrer_tag_cent, tank_achtel_cent, kaution_art, kaution_status, kaution_referenz, kaution_einbehalt_cent, kaution_grund, vertrag_unterschrieben, km_start, tank_start, km_ende, tank_ende, fotos_uebergabe, fotos_rueckgabe, rechnung_id, notiz').eq('id', id).maybeSingle();
    if (error || !bRoh) { setFehler('Mietvertrag nicht gefunden — oder Ihnen fehlt das Recht „Verleih & Vermietung".'); setLaden(false); return; }
    const x = bRoh as Buchung;
    setB(x);
    setKau({ art: x.kaution_art, status: x.kaution_status === 'einbehalten' ? 'hinterlegt' : x.kaution_status, referenz: x.kaution_referenz ?? '' });
    const [f, fr, sc, an, ei] = await Promise.all([
      supabase.from('miet_fahrzeug').select('id, bezeichnung, kennzeichen, km_stand').eq('id', x.fahrzeug_id).maybeSingle(),
      supabase.from('miet_fahrer').select('id, rolle, name, geburtsdatum, fs_erteilt_am, fs_klassen, fs_gueltig_bis, ausweis_abgeglichen, alter_ok, dauer_ok, klasse_ok, dokument_ok, ergebnis, geprueft_am, bemerkung').eq('buchung_id', x.id).order('geprueft_am'),
      supabase.from('miet_schaden').select('id, buchung_id, phase, bereich, art, beschreibung, fotos, behoben_am, erfasst_am').eq('fahrzeug_id', x.fahrzeug_id).order('erfasst_am', { ascending: false }).limit(200),
      supabase.from('miet_buchung').select('id, fahrzeug_id, abholung, rueckgabe_plan, status, nummer, mieter_name').eq('fahrzeug_id', x.fahrzeug_id).in('status', ['reserviert', 'uebergeben']).limit(500),
      supabase.from('miet_einstellung').select('kulanz_minuten').maybeSingle(),
    ]);
    const fzx = (f.data as Fz | null) ?? null;
    setFz(fzx);
    const frListe = (fr.data as Fahrer[] | null) ?? [];
    setFahrer(frListe);
    setFa((alt) => ({ ...alt, rolle: frListe.some((y) => y.rolle === 'haupt') ? 'zusatz' : 'haupt', name: frListe.length === 0 && !alt.name ? x.mieter_name : alt.name }));
    const scListe = ((sc.data as Schaden[] | null) ?? []).filter((s) => s.buchung_id === x.id || !s.behoben_am);
    setSchaeden(scListe);
    setAndere((an.data as BuchungKurz[] | null) ?? []);
    setKulanz(Number(ei.data?.kulanz_minuten) || 0);
    setUeb((alt) => ({ ...alt, km: alt.km || (fzx?.km_stand !== null && fzx?.km_stand !== undefined ? String(fzx.km_stand) : '') }));
    setRue((alt) => ({ ...alt, zeit: alt.zeit || lokal(Date.now()) }));
    const pfade = [...x.fotos_uebergabe, ...x.fotos_rueckgabe, ...scListe.flatMap((s) => s.fotos)];
    if (pfade.length) {
      const { data: sig } = await supabase.storage.from(MIET_BUCKET).createSignedUrls(pfade, 3600);
      setUrls(Object.fromEntries((sig ?? []).flatMap((s): [string, string][] => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : []))));
    } else setUrls({});
    setLaden(false);
  }, [id]);
  useEffect(() => { void lade(); }, [lade]);

  const abholTag = b ? berlinTag(zeit(b.abholung) ?? Date.now()) : heute();
  const vorschauFahrer = useMemo(() => {
    if (!b || !fa.geburtsdatum || !fa.fsErteilt) return null;
    return fahrerBewerten({ geburtsdatum: fa.geburtsdatum, fs_erteilt_am: fa.fsErteilt, fs_klassen: fa.klassen.toUpperCase().split(/[\s,;/]+/).filter(Boolean).join(', ') || null, fs_gueltig_bis: fa.gueltigBis || null, ausweis_abgeglichen: fa.ausweis }, b, abholTag, berlinTag(zeit(b.rueckgabe_plan) ?? Date.now()));
  }, [b, fa, abholTag]);
  const haupt = fahrer.find((f) => f.rolle === 'haupt') ?? null;
  const abgelehnt = fahrer.filter((f) => f.ergebnis !== 'ok').length;
  const zusatzOk = fahrer.filter((f) => f.rolle === 'zusatz' && f.ergebnis === 'ok').length;
  const abr = useMemo(() => (b ? abrechnung(b, zusatzOk, kulanz, [fz?.bezeichnung, fz?.kennzeichen].filter(Boolean).join(' · ') || 'Fahrzeug') : null), [b, zusatzOk, kulanz, fz]);
  const offeneVorschaeden = schaeden.filter((s) => !s.behoben_am && s.buchung_id !== b?.id);
  const eigeneSchaeden = schaeden.filter((s) => s.buchung_id === b?.id);

  function meldung(m: string | undefined, standard: string): string {
    const t = String(m ?? '');
    if (/23P01|exclusion|ueberschneidung/i.test(t)) return 'Das Fahrzeug ist in diesem Zeitraum schon vergeben.';
    if (/row-level|permission/i.test(t)) return 'Dafür fehlt Ihnen das Schreibrecht „Verleih & Vermietung".';
    const klar = t.match(/^(?:ERROR:\s*)?([A-ZÄÖÜ][^\n]{10,200})$/);
    return klar && !/violates|constraint|null value/i.test(klar[1]) ? klar[1] : standard;
  }
  async function aendern(werte: Partial<Buchung>, erfolg: string, standard = 'Nicht gespeichert.'): Promise<boolean> {
    if (!b) return false;
    setBusy('speichern'); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('miet_buchung').update(werte).eq('id', b.id).select('id');
    setBusy(null);
    if (error || !data || data.length === 0) { setFehler(meldung(error?.message, standard)); return false; }
    setOk(erfolg); await lade(); return true;
  }

  async function mieterSpeichern() {
    if (!b || !mieter) return;
    const p = buchungPruefen({ fahrzeugId: b.fahrzeug_id, mieterName: mieter.name, anschrift: mieter.anschrift, email: mieter.email, telefon: mieter.telefon, abholung: b.abholung, rueckgabe: mieter.rueckgabe ? new Date(mieter.rueckgabe).toISOString() : '', notiz: mieter.notiz, buchungen: andere, ohneId: b.id });
    if (!p.ok) { setFehler(p.grund); return; }
    const werte: Partial<Buchung> = b.status === 'reserviert'
      ? { mieter_name: p.zeile.mieter_name, mieter_anschrift: p.zeile.mieter_anschrift, mieter_email: p.zeile.mieter_email, mieter_telefon: p.zeile.mieter_telefon, rueckgabe_plan: p.zeile.rueckgabe_plan, notiz: p.zeile.notiz }
      : { mieter_anschrift: p.zeile.mieter_anschrift, mieter_email: p.zeile.mieter_email, mieter_telefon: p.zeile.mieter_telefon, rueckgabe_plan: p.zeile.rueckgabe_plan, notiz: p.zeile.notiz };
    if (await aendern(werte, 'Gespeichert.')) setMieter(null);
  }

  async function fahrerSpeichern() {
    if (!b) return;
    const p = fahrerPruefen({ buchungId: b.id, rolle: fa.rolle, name: fa.name, geburtsdatum: fa.geburtsdatum, fsErteilt: fa.fsErteilt, klassen: fa.klassen, gueltigBis: fa.gueltigBis, ausweis: fa.ausweis, bemerkung: fa.bemerkung, heute: heute() });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy('fahrer'); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('miet_fahrer').insert(p.zeile).select('ergebnis');
    setBusy(null);
    if (error || !data || data.length === 0) { setFehler(/duplicate|unique/i.test(error?.message ?? '') ? 'Es gibt schon einen Hauptfahrer — weitere als Zusatzfahrer eintragen.' : meldung(error?.message, 'Der Fahrer wurde nicht gespeichert.')); return; }
    setFa({ rolle: 'zusatz', name: '', geburtsdatum: '', fsErteilt: '', klassen: '', gueltigBis: '', ausweis: false, bemerkung: '' });
    setOk(data[0].ergebnis === 'ok' ? 'Prüfvermerk gespeichert: Bedingungen erfüllt.' : 'Prüfvermerk gespeichert: Bedingungen NICHT erfüllt — dieser Fahrer darf das Fahrzeug nicht fahren.');
    await lade();
  }

  async function fahrerLoeschen(fid: string) {
    setBusy('fahrer'); setFehler(null);
    const { data, error } = await supabase.from('miet_fahrer').delete().eq('id', fid).select('id');
    setBusy(null); setFrage(null);
    if (error || !data || data.length === 0) { setFehler('Nicht entfernt — Fahrer entfernt nur der Chef, und nur vor der Übergabe.'); return; }
    await lade();
  }

  async function kautionSpeichern() {
    if (!b) return;
    const p = kautionPruefen({ art: kau.art, status: kau.status, referenz: kau.referenz, kautionCent: b.kaution_cent });
    if (!p.ok) { setFehler(p.grund); return; }
    await aendern(p.zeile, 'Kaution gespeichert.');
  }
  async function einbehalten() {
    if (!b) return;
    const p = einbehaltPruefen({ betrag: einb.betrag, grund: einb.grund, kautionCent: b.kaution_cent });
    if (!p.ok) { setFehler(p.grund); return; }
    if (await aendern({ kaution_status: 'einbehalten', kaution_einbehalt_cent: p.cent, kaution_grund: p.grund }, `Einbehalt ${cent(p.cent)} festgehalten. Den Rest geben Sie über Ihren Zahlungsanbieter bzw. bar zurück.`, 'Nicht gespeichert — einbehalten darf nur der Chef.')) setEinb({ betrag: '', grund: '' });
  }

  async function fotosHochladen(phase: 'uebergabe' | 'rueckgabe', dateien: FileList | null, schadenId?: string) {
    if (!b || !betrieb || !dateien || !dateien.length) return;
    setBusy('foto'); setFehler(null); setOk(null);
    const neu: string[] = [];
    for (const datei of Array.from(dateien).slice(0, 10)) {
      const p = pruefeMedium('foto', datei.name, datei.type, datei.size);
      if (!p.ok) { setFehler(`${datei.name}: ${p.fehler}`); continue; }
      try {
        const blob = await verkleinereBild(datei, 2000, 0.85);
        const typ = blob.type || datei.type || 'image/jpeg';
        const pfad = fotoPfad(betrieb, b.id, schadenId ? 'schaden' : phase, endungFuer(typ, datei.name), Date.now(), Math.random().toString(36).slice(2));
        if (!pfad) throw new Error('Ablageort ungültig.');
        const { error } = await supabase.storage.from(MIET_BUCKET).upload(pfad, blob, { upsert: false, contentType: typ });
        if (error) throw new Error('Hochladen nicht erlaubt oder fehlgeschlagen (SQL zu Paket 291 ausgeführt? Schreibrecht „Verleih"?).');
        neu.push(pfad);
      } catch (e) { setFehler(`${datei.name}: ${e instanceof Error ? e.message : 'Fehler beim Hochladen.'}`); }
    }
    if (neu.length) {
      if (schadenId) {
        const s = schaeden.find((x) => x.id === schadenId);
        const { data } = await supabase.from('miet_schaden').update({ fotos: [...(s?.fotos ?? []), ...neu].slice(0, 10) }).eq('id', schadenId).select('id');
        if (!data || !data.length) setFehler('Die Fotos zum Schaden wurden nicht gespeichert (nur der Chef ergänzt bestehende Schäden).');
      } else {
        const feld = phase === 'uebergabe' ? 'fotos_uebergabe' : 'fotos_rueckgabe';
        const { data } = await supabase.from('miet_buchung').update({ [feld]: [...b[feld], ...neu].slice(0, 30) }).eq('id', b.id).select('id');
        if (!data || !data.length) setFehler('Die Fotos wurden nicht im Vertrag gespeichert.');
      }
      setOk(`${neu.length} Foto${neu.length === 1 ? '' : 's'} gespeichert.`);
    }
    setBusy(null); await lade();
  }

  async function uebergeben() {
    if (!b) return;
    const p = uebergabePruefen({ km: ueb.km, tank: ueb.tank, kmFlotte: fz?.km_stand ?? null, unterschrieben: ueb.unterschrieben, anschrift: b.mieter_anschrift, hauptOk: haupt?.ergebnis === 'ok', fahrerAbgelehnt: abgelehnt, kautionCent: b.kaution_cent, kautionStatus: b.kaution_status });
    if (!p.ok) { setFehler(p.grund); return; }
    await aendern({ status: 'uebergeben', km_start: p.km, tank_start: p.tank, vertrag_unterschrieben: true, uebergabe_am: new Date().toISOString() }, `Übergeben${p.hinweis ? ` — ${p.hinweis}` : ''}. Gute Fahrt!`);
  }
  async function zuruecknehmen() {
    if (!b) return;
    const p = rueckgabePruefen({ km: rue.km, tank: rue.tank, kmStart: b.km_start });
    if (!p.ok) { setFehler(p.grund); return; }
    const t = rue.zeit ? new Date(rue.zeit).getTime() : Date.now();
    if (!Number.isFinite(t) || t > Date.now() + 5 * 60_000) { setFehler('Die Rückgabe kann nicht in der Zukunft liegen.'); return; }
    await aendern({ status: 'zurueck', km_ende: p.km, tank_ende: p.tank, rueckgabe_ist: new Date(t).toISOString() }, 'Zurückgenommen. Prüfen Sie Schäden und Kaution und erstellen Sie die Rechnung.');
  }

  async function schadenSpeichern(dateien: FileList | null) {
    if (!b) return;
    const p = schadenPruefen({ fahrzeugId: b.fahrzeug_id, buchungId: b.id, phase: sch.phase, bereich: sch.bereich, art: sch.art, beschreibung: sch.beschreibung });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy('schaden'); setFehler(null); setOk(null);
    const fotos: string[] = [];
    if (betrieb && dateien) {
      for (const datei of Array.from(dateien).slice(0, 10)) {
        const pr = pruefeMedium('foto', datei.name, datei.type, datei.size);
        if (!pr.ok) continue;
        try {
          const blob = await verkleinereBild(datei, 2000, 0.85);
          const typ = blob.type || 'image/jpeg';
          const pfad = fotoPfad(betrieb, b.id, 'schaden', endungFuer(typ, datei.name), Date.now(), Math.random().toString(36).slice(2));
          if (pfad && !(await supabase.storage.from(MIET_BUCKET).upload(pfad, blob, { upsert: false, contentType: typ })).error) fotos.push(pfad);
        } catch { /* einzelnes Foto übersprungen */ }
      }
    }
    const { data, error } = await supabase.from('miet_schaden').insert({ ...p.zeile, fotos }).select('id');
    setBusy(null);
    if (error || !data || data.length === 0) { setFehler(meldung(error?.message, 'Der Schaden wurde nicht gespeichert.')); return; }
    setSch({ ...sch, beschreibung: '' });
    setOk(`Schaden festgehalten${fotos.length ? ` (${fotos.length} Foto${fotos.length === 1 ? '' : 's'})` : ''}.`); await lade();
  }
  async function behoben(sid: string) {
    setBusy('schaden'); setFehler(null);
    const { data } = await supabase.from('miet_schaden').update({ behoben_am: heute() }).eq('id', sid).select('id');
    setBusy(null);
    if (!data || !data.length) { setFehler('Nicht gespeichert — „behoben" setzt nur der Chef.'); return; }
    await lade();
  }

  async function rechnungErstellen() {
    if (!b) return;
    if (b.rechnung_id) { window.location.href = `/dashboard/rechnungen/${b.rechnung_id}`; return; }
    setBusy('rechnung'); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-vermietung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buchungId: b.id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && !(res.status === 409 && j.rechnungId)) throw new Error(j.error || 'Fehler');
      setOk(res.status === 409 ? 'Für diesen Mietvertrag gibt es bereits eine Rechnung.' : 'Rechnung erstellt.');
      await lade();
    } catch (e) { setFehler('Rechnung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lädt …</p></div>;
  if (!b) return <div style={s.page}><a href="/dashboard/verleih/fahrzeuge" style={s.zurueck}>← Fahrzeugvermietung</a><p style={{ ...s.dim, color: C.bad }}>{fehler ?? 'Mietvertrag nicht gefunden.'}</p></div>;

  const offen = b.status === 'reserviert' || b.status === 'uebergeben';
  const Fotos = ({ liste }: { liste: string[] }) => liste.length === 0 ? null : (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {liste.map((p) => urls[p] ? <a key={p} href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="Foto" style={{ width: 92, height: 70, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}` }} /></a> : <span key={p} style={{ ...s.dim, fontSize: 12 }}>Foto</span>)}
    </div>
  );
  const fotoKnopf = (phase: 'uebergabe' | 'rueckgabe', text: string) => (
    <label style={{ ...s.btnAus, display: 'inline-block' }}>📷 {text}
      <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} disabled={busy !== null} onChange={(e) => { void fotosHochladen(phase, e.target.files); e.target.value = ''; }} />
    </label>
  );

  return (
    <div style={s.page}>
      <a href="/dashboard/verleih/fahrzeuge" style={s.zurueck}>← Fahrzeugvermietung</a>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h1 style={s.h1}>📄 Mietvertrag {b.nummer}</h1>
        <span style={{ ...s.marke, color: b.status === 'uebergeben' ? C.gold : b.status === 'zurueck' ? C.ok : b.status === 'storniert' ? C.dim : C.cyan }}>{STATUS[b.status] ?? b.status}</span>
        {ueberfaellig(b, Date.now()) && <span style={{ ...s.marke, color: C.bad }}>überfällig</span>}
        <a href={`/dashboard/verleih/fahrzeuge/${b.id}/vertrag`} target="_blank" rel="noreferrer" style={{ ...s.btnAus, marginLeft: 'auto', textDecoration: 'none' }}>🖨 Mietvertrag drucken</a>
      </div>
      <p style={s.dim}>{[fz?.bezeichnung, fz?.kennzeichen].filter(Boolean).join(' · ')} · {wann(b.abholung)} bis {wann(b.rueckgabe_plan)} · {b.mieter_name}</p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}

      {/* ------------------------------------------------ Mieter --- */}
      <div style={s.box}>
        <b style={{ color: C.gold }}>👤 Mieter und Zeitraum</b>
        {!mieter ? (
          <>
            <p style={{ ...s.dim, whiteSpace: 'pre-line' }}>{b.mieter_name}{b.mieter_anschrift ? `\n${b.mieter_anschrift}` : '\nAnschrift fehlt noch (Pflicht zur Übergabe)'}{b.mieter_email ? `\n${b.mieter_email}` : ''}{b.mieter_telefon ? ` · ${b.mieter_telefon}` : ''}</p>
            <p style={s.dim}>Preise laut Buchung (netto): {cent(b.tagessatz_cent)} je Tag{b.wochensatz_cent ? ` · ${cent(b.wochensatz_cent)} je Woche` : ''} · {b.frei_km_tag === null ? 'km frei' : `${b.frei_km_tag} km/Tag frei, dann ${cent(b.mehr_km_cent)} je km`}{b.zusatzfahrer_tag_cent ? ` · Zusatzfahrer ${cent(b.zusatzfahrer_tag_cent)} je Tag` : ''}{b.tank_achtel_cent ? ` · Nachtanken ${cent(b.tank_achtel_cent)} je Achtel` : ''}{b.notiz ? ` · Notiz: ${b.notiz}` : ''}</p>
            {offen && <button type="button" style={s.btnAus} onClick={() => setMieter({ name: b.mieter_name, anschrift: b.mieter_anschrift ?? '', email: b.mieter_email ?? '', telefon: b.mieter_telefon ?? '', rueckgabe: lokal(zeit(b.rueckgabe_plan) ?? Date.now()), notiz: b.notiz ?? '' })}>✎ {b.status === 'uebergeben' ? 'Anschrift / Verlängerung' : 'Mieter / Zeitraum ändern'}</button>}
          </>
        ) : (
          <>
            <div style={s.raster}>
              <label style={s.feld}>Name<input value={mieter.name} disabled={b.status !== 'reserviert'} maxLength={120} style={s.eingabe} onChange={(e) => setMieter({ ...mieter, name: e.target.value })} /></label>
              <label style={s.feld}>Anschrift<textarea value={mieter.anschrift} rows={2} maxLength={300} style={s.eingabe} onChange={(e) => setMieter({ ...mieter, anschrift: e.target.value })} /></label>
              <label style={s.feld}>E-Mail<input value={mieter.email} maxLength={160} style={s.eingabe} onChange={(e) => setMieter({ ...mieter, email: e.target.value })} /></label>
              <label style={s.feld}>Telefon<input value={mieter.telefon} maxLength={40} style={s.eingabe} onChange={(e) => setMieter({ ...mieter, telefon: e.target.value })} /></label>
              <label style={s.feld}>Rückgabe geplant<input type="datetime-local" value={mieter.rueckgabe} style={s.eingabe} onChange={(e) => setMieter({ ...mieter, rueckgabe: e.target.value })} /></label>
              <label style={s.feld}>Notiz<input value={mieter.notiz} maxLength={1000} style={s.eingabe} onChange={(e) => setMieter({ ...mieter, notiz: e.target.value })} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" style={s.btnGold} disabled={busy !== null} onClick={() => void mieterSpeichern()}>💾 Speichern</button>
              <button type="button" style={s.btnAus} onClick={() => setMieter(null)}>Abbrechen</button>
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------ Fahrer --- */}
      <div style={s.box}>
        <b style={{ color: C.gold }}>🪪 Fahrer prüfen</b>
        <p style={{ ...s.dim, fontSize: 13 }}>Bedingungen dieses Vertrags: Mindestalter {b.mindestalter} Jahre, Führerschein seit mindestens {b.fs_jahre_min} Jahr{b.fs_jahre_min === 1 ? '' : 'en'}{b.fs_klasse ? `, Klasse ${b.fs_klasse}` : ''}, gültig bis zur Rückgabe. Lassen Sie sich Führerschein und Ausweis im Original zeigen — gespeichert wird nur der Prüfvermerk, keine Nummer und keine Kopie.</p>
        {fahrer.length > 0 && (
          <ul style={{ margin: '4px 0 10px', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
            {fahrer.map((f) => {
              const e = fahrerBewerten(f, b, abholTag, berlinTag(zeit(b.rueckgabe_plan) ?? Date.now()));
              return (
                <li key={f.id}>
                  <b>{f.rolle === 'haupt' ? 'Hauptfahrer' : 'Zusatzfahrer'}: {f.name}</b> · {e.alter} J. · FS seit {de(f.fs_erteilt_am)}{f.fs_klassen ? ` · Kl. ${f.fs_klassen}` : ''}{f.fs_gueltig_bis ? ` · gültig bis ${de(f.fs_gueltig_bis)}` : ''}{f.ausweis_abgeglichen ? ' · Ausweis abgeglichen' : ''}
                  {' · '}{f.ergebnis === 'ok' ? <span style={{ color: C.ok, fontWeight: 700 }}>✓ erfüllt</span> : <span style={{ color: C.bad, fontWeight: 700 }}>✕ nicht erfüllt ({e.gruende.join(', ')})</span>}
                  <span style={{ color: C.dim }}> · geprüft {wann(f.geprueft_am)}</span>
                  {b.status === 'reserviert' && istChef && (frage === f.id
                    ? <> · <button type="button" style={s.link} onClick={() => void fahrerLoeschen(f.id)}>Ja, entfernen</button> <button type="button" style={s.link} onClick={() => setFrage(null)}>nein</button></>
                    : <> · <button type="button" style={s.link} onClick={() => setFrage(f.id)}>entfernen</button></>)}
                </li>
              );
            })}
          </ul>
        )}
        {offen && (b.status === 'reserviert' || fa.rolle === 'zusatz') && (
          <>
            <div style={s.raster}>
              <label style={s.feld}>Rolle
                <select value={fa.rolle} style={s.eingabe} onChange={(e) => setFa({ ...fa, rolle: e.target.value })}>
                  {!haupt && b.status === 'reserviert' && <option value="haupt">Hauptfahrer (Mieter)</option>}
                  <option value="zusatz">Zusatzfahrer</option>
                </select>
              </label>
              <label style={s.feld}>Name *<input value={fa.name} maxLength={120} style={s.eingabe} onChange={(e) => setFa({ ...fa, name: e.target.value })} /></label>
              <label style={s.feld}>Geburtsdatum *<input type="date" value={fa.geburtsdatum} max={heute()} style={s.eingabe} onChange={(e) => setFa({ ...fa, geburtsdatum: e.target.value })} /></label>
              <label style={s.feld}>Führerschein erteilt am *<input type="date" value={fa.fsErteilt} max={heute()} style={s.eingabe} onChange={(e) => setFa({ ...fa, fsErteilt: e.target.value })} /></label>
              <label style={s.feld}>Klassen (z. B. B, BE)<input value={fa.klassen} maxLength={60} style={s.eingabe} onChange={(e) => setFa({ ...fa, klassen: e.target.value })} /></label>
              <label style={s.feld}>Karte gültig bis (leer = unbefristet)<input type="date" value={fa.gueltigBis} style={s.eingabe} onChange={(e) => setFa({ ...fa, gueltigBis: e.target.value })} /></label>
              <label style={s.feld}>Bemerkung (keine Nummer!)<input value={fa.bemerkung} maxLength={200} style={s.eingabe} onChange={(e) => setFa({ ...fa, bemerkung: e.target.value })} /></label>
              <label style={{ ...s.feld, gridAutoFlow: 'column', justifyContent: 'start', alignItems: 'center' }}><input type="checkbox" checked={fa.ausweis} onChange={(e) => setFa({ ...fa, ausweis: e.target.checked })} /> Führerschein und Ausweis im Original gesehen, Name und Foto passen</label>
            </div>
            {vorschauFahrer && <p style={{ ...s.dim, color: vorschauFahrer.ok ? C.ok : C.warn }}>{vorschauFahrer.ok ? `✓ Bedingungen erfüllt (${vorschauFahrer.alter} Jahre, Führerschein seit ${vorschauFahrer.jahre} Jahren).` : `Noch nicht erfüllt: ${vorschauFahrer.gruende.join(', ')}.`}</p>}
            <button type="button" style={s.btnGold} disabled={busy !== null} onClick={() => void fahrerSpeichern()}>{busy === 'fahrer' ? 'Speichert …' : '✓ Prüfvermerk speichern'}</button>
          </>
        )}
      </div>

      {/* ------------------------------------------------ Kaution --- */}
      {b.kaution_cent > 0 && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>💳 Kaution {cent(b.kaution_cent)}</b>
          <p style={{ ...s.dim, fontSize: 13 }}>Die Kaution nehmen Sie über Ihren eigenen Zahlungsanbieter (Vormerkung auf der Karte), bar gegen Quittung oder per Überweisung. ARGONAUT speichert NIE Kartendaten — nur Art, Status und die Vorgangsnummer Ihres Zahlungsanbieters. Die Kaution ist kein Umsatz und steht nicht auf der Rechnung.</p>
          <p style={s.dim}>Stand: <b style={{ color: b.kaution_status === 'hinterlegt' ? C.ok : b.kaution_status === 'einbehalten' ? C.warn : C.text }}>{KAUTION_STATUS[b.kaution_status] ?? b.kaution_status}</b>{b.kaution_referenz ? ` · Vorgang ${b.kaution_referenz}` : ''}{b.kaution_einbehalt_cent > 0 ? ` · einbehalten ${cent(b.kaution_einbehalt_cent)} (${b.kaution_grund ?? ''})` : ''}</p>
          {b.kaution_status !== 'einbehalten' && (
            <div style={s.raster}>
              <label style={s.feld}>Art
                <select value={kau.art} style={s.eingabe} onChange={(e) => setKau({ ...kau, art: e.target.value })}>{KAUTION_ARTEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
              </label>
              <label style={s.feld}>Status
                <select value={kau.status} style={s.eingabe} onChange={(e) => setKau({ ...kau, status: e.target.value })}>
                  <option value="offen">offen</option><option value="hinterlegt">hinterlegt</option>{(b.status === 'zurueck' || b.status === 'storniert') && <option value="freigegeben">vollständig zurückgegeben</option>}
                </select>
              </label>
              <label style={s.feld}>Vorgangsnummer / Quittung (keine Kartennummer)<input value={kau.referenz} maxLength={60} style={s.eingabe} onChange={(e) => setKau({ ...kau, referenz: e.target.value })} /></label>
              <div style={{ display: 'flex', alignItems: 'end' }}><button type="button" style={s.btnGold} disabled={busy !== null} onClick={() => void kautionSpeichern()}>💾 Kaution speichern</button></div>
            </div>
          )}
          {istChef && b.status === 'zurueck' && b.kaution_status === 'hinterlegt' && (
            <div style={{ ...s.raster, marginTop: 12 }}>
              <label style={s.feld}>Einbehalt € (nur Chef)<input inputMode="decimal" value={einb.betrag} style={s.eingabe} onChange={(e) => setEinb({ ...einb, betrag: e.target.value })} /></label>
              <label style={s.feld}>Grund *<input value={einb.grund} maxLength={300} style={s.eingabe} onChange={(e) => setEinb({ ...einb, grund: e.target.value })} /></label>
              <div style={{ display: 'flex', alignItems: 'end' }}><button type="button" style={s.btnAus} disabled={busy !== null} onClick={() => void einbehalten()}>Teil einbehalten …</button></div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ Übergabe --- */}
      <div style={s.box}>
        <b style={{ color: C.gold }}>🔑 Übergabe</b>
        {b.status === 'reserviert' ? (
          <>
            {offeneVorschaeden.length > 0 && (
              <div style={{ margin: '6px 0' }}>
                <span style={{ color: C.warn, fontSize: 13.5, fontWeight: 700 }}>Bekannte, nicht behobene Schäden — mit dem Mieter durchgehen:</span>
                <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 13.5 }}>{offeneVorschaeden.map((x) => <li key={x.id}>{BEREICH[x.bereich]}: {ART[x.art]}{x.beschreibung ? ` — ${x.beschreibung}` : ''} ({de(x.erfasst_am)})</li>)}</ul>
              </div>
            )}
            <div style={s.raster}>
              <label style={s.feld}>km-Stand *<input inputMode="numeric" value={ueb.km} style={s.eingabe} onChange={(e) => setUeb({ ...ueb, km: e.target.value })} /></label>
              <label style={s.feld}>Tank / Akku *
                <select value={ueb.tank} style={s.eingabe} onChange={(e) => setUeb({ ...ueb, tank: e.target.value })}>{TANK.map((t) => <option key={t} value={t}>{achtelText(t)}</option>)}</select>
              </label>
              <label style={{ ...s.feld, gridAutoFlow: 'column', justifyContent: 'start', alignItems: 'center' }}><input type="checkbox" checked={ueb.unterschrieben} onChange={(e) => setUeb({ ...ueb, unterschrieben: e.target.checked })} /> Mieter hat den Mietvertrag unterschrieben</label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {fotoKnopf('uebergabe', 'Fotos rundum')}
              <button type="button" style={s.btnGold} disabled={busy !== null} onClick={() => void uebergeben()}>🔑 Fahrzeug übergeben</button>
            </div>
          </>
        ) : b.uebergabe_am ? (
          <p style={s.dim}>Übergeben {wann(b.uebergabe_am)} · {b.km_start?.toLocaleString('de-DE')} km · Tank {achtelText(b.tank_start)} · Vertrag unterschrieben</p>
        ) : <p style={s.dim}>—</p>}
        <Fotos liste={b.fotos_uebergabe} />
      </div>

      {/* ------------------------------------------------ Rückgabe --- */}
      {(b.status === 'uebergeben' || b.status === 'zurueck') && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>↩ Rückgabe</b>
          {b.status === 'uebergeben' ? (
            <>
              <div style={s.raster}>
                <label style={s.feld}>Zurück am<input type="datetime-local" value={rue.zeit} style={s.eingabe} onChange={(e) => setRue({ ...rue, zeit: e.target.value })} /></label>
                <label style={s.feld}>km-Stand * (Übergabe {b.km_start?.toLocaleString('de-DE')})<input inputMode="numeric" value={rue.km} style={s.eingabe} onChange={(e) => setRue({ ...rue, km: e.target.value })} /></label>
                <label style={s.feld}>Tank / Akku * (Übergabe {achtelText(b.tank_start)})
                  <select value={rue.tank} style={s.eingabe} onChange={(e) => setRue({ ...rue, tank: e.target.value })}>{TANK.map((t) => <option key={t} value={t}>{achtelText(t)}</option>)}</select>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {fotoKnopf('rueckgabe', 'Fotos rundum')}
                <button type="button" style={s.btnGold} disabled={busy !== null} onClick={() => void zuruecknehmen()}>↩ Fahrzeug zurücknehmen</button>
              </div>
            </>
          ) : (
            <>
              <p style={s.dim}>Zurück {wann(b.rueckgabe_ist)} · {b.km_ende?.toLocaleString('de-DE')} km ({abr?.gefahren?.toLocaleString('de-DE') ?? '—'} km gefahren) · Tank {achtelText(b.tank_ende)}</p>
              {fotoKnopf('rueckgabe', 'weitere Fotos')}
            </>
          )}
          <Fotos liste={b.fotos_rueckgabe} />
        </div>
      )}

      {/* ------------------------------------------------ Schäden --- */}
      <div style={s.box}>
        <b style={{ color: C.gold }}>🛠 Schäden</b>
        {eigeneSchaeden.length === 0 ? <p style={s.dim}>In diesem Mietvertrag ist kein Schaden festgehalten.</p> : (
          <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
            {eigeneSchaeden.map((x) => (
              <li key={x.id}>
                {BEREICH[x.bereich]}: <b>{ART[x.art]}</b>{x.beschreibung ? ` — ${x.beschreibung}` : ''} · {PHASE[x.phase]} · {de(x.erfasst_am)}
                {x.behoben_am ? <span style={{ color: C.ok }}> · behoben {de(x.behoben_am)}</span> : istChef && <> · <button type="button" style={s.link} onClick={() => void behoben(x.id)}>als behoben markieren</button></>}
                <Fotos liste={x.fotos} />
              </li>
            ))}
          </ul>
        )}
        {b.status !== 'storniert' && (
          <div style={s.raster}>
            <label style={s.feld}>Festgestellt
              <select value={sch.phase} style={s.eingabe} onChange={(e) => setSch({ ...sch, phase: e.target.value })}><option value="uebergabe">bei Übergabe (Vorschaden)</option><option value="rueckgabe">bei Rückgabe</option><option value="sonstig">sonst</option></select>
            </label>
            <label style={s.feld}>Stelle
              <select value={sch.bereich} style={s.eingabe} onChange={(e) => setSch({ ...sch, bereich: e.target.value })}>{SCHADEN_BEREICHE.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
            </label>
            <label style={s.feld}>Art
              <select value={sch.art} style={s.eingabe} onChange={(e) => setSch({ ...sch, art: e.target.value })}>{SCHADEN_ARTEN.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
            </label>
            <label style={s.feld}>Beschreibung<input value={sch.beschreibung} maxLength={500} style={s.eingabe} onChange={(e) => setSch({ ...sch, beschreibung: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ ...s.btnAus, display: 'inline-block' }}>📷 Mit Foto festhalten
                <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} disabled={busy !== null} onChange={(e) => { void schadenSpeichern(e.target.files); e.target.value = ''; }} />
              </label>
              <button type="button" style={s.btnAus} disabled={busy !== null} onClick={() => void schadenSpeichern(null)}>ohne Foto</button>
            </div>
          </div>
        )}
        <p style={{ ...s.dim, fontSize: 12.5 }}>Schäden und Einbehalte aus der Kaution stehen nicht auf der Mietrechnung. Was dem Mieter in Rechnung gestellt wird, klären Sie nach Ihren Mietbedingungen — im Zweifel mit Ihrem Steuerberater bzw. Anwalt.</p>
      </div>

      {/* ------------------------------------------------ Abrechnung --- */}
      {b.status === 'zurueck' && abr && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>🧾 Abrechnung</b>
          <table style={s.tabelle}>
            <tbody>
              {abr.posten.map((p, i) => <tr key={i}><td style={{ ...s.td, textAlign: 'left' }}>{p.bezeichnung}</td><td style={s.td}>{p.menge.toLocaleString('de-DE')} {p.einheit}</td><td style={s.td}>× {cent(p.einzelpreis_cent)}</td><td style={{ ...s.td, textAlign: 'right' }}>{cent(p.summe_cent)}</td></tr>)}
              <tr><td style={{ ...s.td, textAlign: 'left', fontWeight: 700 }} colSpan={3}>Summe netto ({abr.tage} Miettag{abr.tage === 1 ? '' : 'e'})</td><td style={{ ...s.td, textAlign: 'right', fontWeight: 800 }}>{cent(abr.netto_cent)}</td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            {b.rechnung_id
              ? <a href={`/dashboard/rechnungen/${b.rechnung_id}`} style={{ ...s.btnGold, textDecoration: 'none', display: 'inline-block' }}>🧾 Zur Rechnung</a>
              : darfAbrechnen !== false
                ? <button type="button" style={s.btnGold} disabled={busy !== null} onClick={() => void rechnungErstellen()}>{busy === 'rechnung' ? 'Erstellt …' : '🧾 Rechnung erstellen'}</button>
                : <p style={s.dim}>Die Rechnung erstellt, wer „Darf abrechnen" hat.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '10px 0 6px' },
  marke: { border: '1px solid currentColor', borderRadius: 20, padding: '2px 10px', fontSize: 12.5, fontWeight: 700 },
  dim: { color: C.dim, fontSize: 14, lineHeight: 1.55, margin: '4px 0 10px' },
  box: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', margin: '12px 0' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 8 },
  feld: { display: 'grid', gap: 4, fontSize: 13.5, color: C.dim },
  eingabe: { background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  link: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 13 },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginTop: 8 },
  td: { textAlign: 'center', padding: '7px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
};
