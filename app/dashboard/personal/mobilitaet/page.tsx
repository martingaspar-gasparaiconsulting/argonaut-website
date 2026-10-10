'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/personal/mobilitaet — J1 Jobticket, Dienstrad, Mobilitätszuschuss (Paket 302)
//
// Je Mitarbeiter die Mobilitäts-Leistungen des Betriebs mit Betrag, Laufzeit,
// Nachweis und Hinweis für die Lohnabrechnung. Fristen-Ampel (Laufzeit-Ende,
// Nachweis gültig bis) mit Erinnerung, Kosten je Monat, Liste für das
// Steuerbüro als CSV. Steuerliche Einordnung NUR mit Bestätigung des
// Steuerberaters — ARGONAUT rechnet keine Steuern. Logik: lib/mobilitaet.ts. „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ARTEN, BEHANDLUNG, TURNUS, leistungPruefen, kostenJeMonat, fristAmpel, aktiv, erinnerungsTag, lohnListe, lohnCsv, monatVon, centText,
  type Leistung,
} from '@/lib/mobilitaet';
import { euro } from '@/lib/geld';
import Leerzustand from '../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };

type Ma = { id: string; vorname: string | null; nachname: string | null };
type Voll = Leistung & {
  id: string; mitarbeiter_id: string | null; bezeichnung: string | null; stb_bestaetigt_am: string | null; stb_name: string | null;
  nachweis: string | null; nachweis_bis: string | null; notiz: string | null;
};
type Lade = { monat: string; betrag_cent: number };
type Form = {
  id: string | null; mitarbeiterId: string; name: string; art: string; bezeichnung: string; betrag: string; eigenanteil: string;
  turnus: string; beginn: string; ende: string; behandlung: string; stbAm: string; stbName: string; nachweis: string; nachweisBis: string; notiz: string;
};

function heute(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function monatKurz(m: string): string { return `${MONATE[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`; }
function monatPlus(m: string, n: number): string {
  const [j, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(j, mo - 1 + n, 1)).toISOString().slice(0, 10);
}
const ART: Record<string, { label: string; icon: string }> = Object.fromEntries(ARTEN.map((a) => [a.key, { label: a.label, icon: a.icon }]));
const BEH: Record<string, string> = Object.fromEntries(BEHANDLUNG.map((b) => [b.key, b.label]));
const ZAHL = (c: number) => euro(c / 100);

export default function MobilitaetPage() {
  const tag = heute();
  const [liste, setListe] = useState<Voll[]>([]);
  const [ma, setMa] = useState<Ma[]>([]);
  const [lade, setLade] = useState<Lade[]>([]);
  const [istChef, setIstChef] = useState(false);
  const [besitzer, setBesitzer] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [frage, setFrage] = useState<string | null>(null);
  const [auchBeendet, setAuchBeendet] = useState(false);
  const [lohnMonat, setLohnMonat] = useState(monatVon(tag));

  const ladeAlles = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    if (!uid) { setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const b = typeof chef === 'string' && chef ? chef : uid;
    setIstChef(b === uid); setBesitzer(b);
    const [l, m, ld] = await Promise.all([
      supabase.from('mobilitaet_leistung').select('id, mitarbeiter_id, person_name, art, bezeichnung, betrag_cent, eigenanteil_cent, turnus, beginn, ende, lohn_behandlung, stb_bestaetigt_am, stb_name, nachweis, nachweis_bis, notiz').order('person_name').limit(2000),
      supabase.from('mitarbeiter').select('id, vorname, nachname').eq('owner_user_id', b).order('nachname').limit(1000),
      supabase.from('ladestrom_erstattung').select('monat, betrag_cent').limit(5000),
    ]);
    if (l.error) setFehler('Die Mobilitäts-Leistungen sind noch nicht eingerichtet (SQL zu Paket 302 fehlt) oder Ihnen fehlt das Recht „Personal“.');
    setListe(((l.data ?? []) as Voll[]).map((x) => ({ ...x, betrag_cent: Number(x.betrag_cent), eigenanteil_cent: Number(x.eigenanteil_cent) })));
    setMa((m.data as Ma[] | null) ?? []);
    setLade(((ld.data ?? []) as Lade[]).map((x) => ({ monat: x.monat, betrag_cent: Number(x.betrag_cent) })));
    setLaden(false);
  }, []);
  useEffect(() => { void ladeAlles(); }, [ladeAlles]);

  const maName = (m: Ma) => [m.vorname, m.nachname].filter(Boolean).join(' ').trim() || 'Ohne Namen';
  const monatJetzt = monatVon(tag);
  const zwoelf = useMemo(() => kostenJeMonat(liste, monatPlus(monatJetzt, -11), monatJetzt), [liste, monatJetzt]);
  const jetzt = zwoelf[zwoelf.length - 1];
  const ladeJe = useMemo(() => {
    const r: Record<string, number> = {};
    for (const x of lade) r[x.monat.slice(0, 10)] = (r[x.monat.slice(0, 10)] ?? 0) + x.betrag_cent;
    return r;
  }, [lade]);
  const fristen = useMemo(() => liste
    .map((l) => ({ l, a: fristAmpel(l, tag) }))
    .filter((x) => x.a.stufe === 'abgelaufen' || x.a.stufe === 'bald')
    .filter((x) => !(x.a.was === 'laufzeit' && x.a.stufe === 'abgelaufen' && x.l.ende !== null && x.l.ende < monatPlus(monatJetzt, -3)))
    .sort((a, b) => (a.a.tage ?? 0) - (b.a.tage ?? 0)), [liste, tag, monatJetzt]);
  const offenStb = liste.filter((l) => l.lohn_behandlung === 'offen' && aktiv(l, tag)).length;
  const sichtbar = useMemo(() => liste.filter((l) => auchBeendet || aktiv(l, tag) || l.beginn > tag), [liste, auchBeendet, tag]);
  const lohn = useMemo(() => lohnListe(liste, lohnMonat), [liste, lohnMonat]);

  function neu() {
    setOk(null); setFehler(null);
    setForm({ id: null, mitarbeiterId: '', name: '', art: 'jobticket', bezeichnung: '', betrag: '', eigenanteil: '', turnus: 'monatlich', beginn: monatJetzt, ende: '', behandlung: 'offen', stbAm: '', stbName: '', nachweis: '', nachweisBis: '', notiz: '' });
  }
  function bearbeiten(l: Voll) {
    setOk(null); setFehler(null);
    const zahl = (c: number) => (c ? centText(c) : '');
    setForm({
      id: l.id, mitarbeiterId: l.mitarbeiter_id ?? '', name: l.person_name, art: l.art, bezeichnung: l.bezeichnung ?? '', betrag: zahl(l.betrag_cent) || '0',
      eigenanteil: zahl(l.eigenanteil_cent), turnus: l.turnus, beginn: l.beginn, ende: l.ende ?? '', behandlung: l.lohn_behandlung,
      stbAm: l.stb_bestaetigt_am ?? '', stbName: l.stb_name ?? '', nachweis: l.nachweis ?? '', nachweisBis: l.nachweis_bis ?? '', notiz: l.notiz ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function speichern() {
    if (!form) return;
    const p = leistungPruefen({
      mitarbeiterId: form.mitarbeiterId || null, name: form.name, art: form.art, bezeichnung: form.bezeichnung, betrag: form.betrag, eigenanteil: form.eigenanteil,
      turnus: form.turnus, beginn: form.beginn, ende: form.turnus === 'einmalig' ? '' : form.ende, behandlung: form.behandlung, stbAm: form.stbAm, stbName: form.stbName,
      nachweis: form.nachweis, nachweisBis: form.nachweisBis, notiz: form.notiz, heute: tag,
    });
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    const res = form.id
      ? await supabase.from('mobilitaet_leistung').update(p.zeile).eq('id', form.id).select('id')
      : await supabase.from('mobilitaet_leistung').insert(p.zeile).select('id');
    setBusy(false);
    if (res.error || !res.data || res.data.length === 0) { setFehler('Nicht gespeichert — dafür braucht es das Schreibrecht „Personal“.'); return; }
    setForm(null); setOk(form.id ? 'Leistung geändert.' : 'Leistung angelegt.');
    await ladeAlles();
  }

  async function loeschen(id: string) {
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('mobilitaet_leistung').delete().eq('id', id).select('id');
    setBusy(false); setFrage(null);
    if (error || !data || data.length === 0) { setFehler('Nicht gelöscht — löschen darf nur der Chef. Statt zu löschen können Sie ein Enddatum setzen; dann bleibt der Nachweis erhalten.'); return; }
    setOk('Leistung gelöscht.'); await ladeAlles();
  }

  async function erinnern(l: Voll, frist: string, was: string) {
    if (!besitzer) return;
    setBusy(true); setFehler(null);
    const { error } = await supabase.from('erinnerung').insert({
      owner_user_id: besitzer, bezug_typ: 'frei', kanal: 'persoenlich', status: 'offen',
      titel: `${ART[l.art]?.label ?? 'Mobilität'} · ${l.person_name}: ${was} endet ${de(frist)}`.slice(0, 200),
      faellig_am: `${erinnerungsTag(frist, tag)}T09:00`, kunde_name: l.person_name,
      notiz: 'Verlängern, Nachweis neu anfordern oder Leistung beenden — und der Lohnabrechnung Bescheid geben.',
    });
    setBusy(false);
    if (error) { setFehler('Die Erinnerung wurde nicht angelegt — dafür braucht es das Recht „Erinnerungen“.'); return; }
    setOk(`Erinnerung angelegt für ${de(erinnerungsTag(frist, tag))} (unter „Erinnerungen“).`);
  }

  function csvLaden() {
    const blob = new Blob(['﻿' + lohnCsv(lohn, lohnMonat)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mobilitaet-lohn-${lohnMonat.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/personal" style={s.zurueck}>← Personal</a>
      <h1 style={s.h1}>🚆 Jobticket, Dienstrad und Mobilität</h1>
      <p style={s.dim}>
        So geht&apos;s: Tragen Sie je Mitarbeiter ein, was Ihr Betrieb zur Mobilität zahlt — Jobticket, Dienstrad, Ladestrom, Fahrtkosten-Zuschuss —
        mit Betrag, Laufzeit und Nachweis. Ob eine Leistung steuerfrei, pauschal versteuert oder normaler Arbeitslohn ist, klären Sie mit Ihrem
        Steuerberater; erst mit seiner Bestätigung tragen Sie das hier ein. ARGONAUT rechnet keine Steuern aus, sondern liefert die Liste für die Lohnabrechnung.
      </p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}
      {laden && <p style={s.dim}>Lädt …</p>}

      {!laden && (
        <>
          <div style={s.kacheln}>
            <div style={s.kachel}><b style={s.zahl}>{ZAHL(jetzt?.betrieb_cent ?? 0)}</b><span style={s.dim}>Kosten des Betriebs im {monatKurz(monatJetzt)}</span></div>
            <div style={s.kachel}><b style={s.zahl}>{liste.filter((l) => aktiv(l, tag)).length}</b><span style={s.dim}>laufende Leistungen</span></div>
            <div style={s.kachel}><b style={s.zahl}>{ZAHL(jetzt?.eigen_cent ?? 0)}</b><span style={s.dim}>Eigenanteile der Mitarbeiter (Gehaltsumwandlung)</span></div>
            <div style={s.kachel}><b style={{ ...s.zahl, color: offenStb ? C.warn : C.ok }}>{offenStb}</b><span style={s.dim}>laufend, noch mit Steuerberater zu klären</span></div>
          </div>

          {fristen.length > 0 && (
            <div style={{ ...s.box, borderColor: C.warn }}>
              <b style={{ color: C.warn }}>⏰ Fristen</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8 }}>
                {fristen.map(({ l, a }) => {
                  const frist = a.was === 'nachweis' ? l.nachweis_bis! : l.ende!;
                  const was = a.was === 'nachweis' ? 'Nachweis' : 'Laufzeit';
                  return (
                    <li key={l.id}>
                      {ART[l.art]?.icon} {l.person_name} · {ART[l.art]?.label ?? l.art}: {was} {a.stufe === 'abgelaufen' ? <b style={{ color: C.bad }}>abgelaufen am {de(frist)}</b> : <b style={{ color: C.warn }}>endet {de(frist)} (in {a.tage} Tagen)</b>}
                      {' · '}<button type="button" style={s.link} disabled={busy} onClick={() => void erinnern(l, frist, was)}>🔔 Erinnerung anlegen</button>
                      {' · '}<button type="button" style={s.link} onClick={() => bearbeiten(l)}>öffnen</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!form && <button type="button" style={s.btnGold} onClick={neu}>＋ Leistung eintragen</button>}

          {form && (
            <div style={s.box}>
              <b style={{ color: C.gold }}>{form.id ? 'Leistung ändern' : 'Leistung eintragen'}</b>
              <div style={s.raster}>
                <label style={s.feld}>Mitarbeiter
                  <select value={form.mitarbeiterId} style={s.eingabe} onChange={(e) => { const m = ma.find((x) => x.id === e.target.value); setForm({ ...form, mitarbeiterId: e.target.value, name: m ? maName(m) : form.name }); }}>
                    <option value="">— Name eintragen —</option>
                    {ma.map((m) => <option key={m.id} value={m.id}>{maName(m)}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Name *<input value={form.name} maxLength={120} style={s.eingabe} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label style={s.feld}>Art *
                  <select value={form.art} style={s.eingabe} onChange={(e) => setForm({ ...form, art: e.target.value })}>
                    {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Bezeichnung<input value={form.bezeichnung} maxLength={120} placeholder={form.art === 'dienstrad' ? 'z. B. E-Bike, Leasing 36 Monate' : form.art === 'jobticket' ? 'z. B. Deutschlandticket Job' : ''} style={s.eingabe} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} /></label>
                <label style={s.feld}>Turnus
                  <select value={form.turnus} style={s.eingabe} onChange={(e) => setForm({ ...form, turnus: e.target.value, ende: e.target.value === 'einmalig' ? '' : form.ende })}>
                    {TURNUS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Betrag Betrieb in € *<input value={form.betrag} inputMode="decimal" placeholder="z. B. 29,00" style={s.eingabe} onChange={(e) => setForm({ ...form, betrag: e.target.value })} /></label>
                <label style={s.feld}>Eigenanteil Mitarbeiter in €<input value={form.eigenanteil} inputMode="decimal" placeholder="z. B. Gehaltsumwandlung" style={s.eingabe} onChange={(e) => setForm({ ...form, eigenanteil: e.target.value })} /></label>
                <label style={s.feld}>{form.turnus === 'einmalig' ? 'Datum *' : 'Beginn *'}<input type="date" value={form.beginn} style={s.eingabe} onChange={(e) => setForm({ ...form, beginn: e.target.value })} /></label>
                {form.turnus === 'monatlich' && <label style={s.feld}>Ende (leer = unbefristet)<input type="date" value={form.ende} style={s.eingabe} onChange={(e) => setForm({ ...form, ende: e.target.value })} /></label>}
                <label style={s.feld}>Nachweis<input value={form.nachweis} maxLength={200} placeholder="z. B. Ticket-Abo liegt in der Personalakte" style={s.eingabe} onChange={(e) => setForm({ ...form, nachweis: e.target.value })} /></label>
                <label style={s.feld}>Nachweis gültig bis<input type="date" value={form.nachweisBis} style={s.eingabe} onChange={(e) => setForm({ ...form, nachweisBis: e.target.value })} /></label>
                <label style={s.feld}>Hinweis für die Lohnabrechnung
                  <select value={form.behandlung} style={s.eingabe} onChange={(e) => setForm({ ...form, behandlung: e.target.value, ...(e.target.value === 'offen' ? { stbAm: '', stbName: '' } : {}) })}>
                    {BEHANDLUNG.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                </label>
                {form.behandlung !== 'offen' && <label style={s.feld}>Vom Steuerberater bestätigt am *<input type="date" value={form.stbAm} max={tag} style={s.eingabe} onChange={(e) => setForm({ ...form, stbAm: e.target.value })} /></label>}
                {form.behandlung !== 'offen' && <label style={s.feld}>Steuerberater / Kanzlei<input value={form.stbName} maxLength={120} style={s.eingabe} onChange={(e) => setForm({ ...form, stbName: e.target.value })} /></label>}
                <label style={s.feld}>Notiz<input value={form.notiz} maxLength={300} style={s.eingabe} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
              </div>
              <p style={{ ...s.dim, fontSize: 12.5, marginTop: 8 }}>Monatliche Leistungen zählen in jedem Monat ihrer Laufzeit mit dem vollen Betrag (keine Tagesanteile). Beträge, Freigrenzen und Pauschalen legt ARGONAUT nicht fest — das gibt Ihr Steuerberater vor.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" style={s.btnGold} disabled={busy} onClick={() => void speichern()}>{busy ? 'Speichert …' : '💾 Speichern'}</button>
                <button type="button" style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {liste.length === 0 && !form && (
            <Leerzustand icon="🚆" titel="Noch keine Mobilitäts-Leistungen" text="Zahlen Sie Ihren Mitarbeitern ein Jobticket, ein Dienstrad oder einen Fahrtkosten-Zuschuss? Tragen Sie es hier ein — dann sehen Sie Kosten, Fristen und die Liste für die Lohnabrechnung an einem Ort." />
          )}

          {liste.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
                <b style={{ color: C.gold }}>Leistungen je Mitarbeiter</b>
                <label style={{ ...s.dim, margin: 0, fontSize: 13 }}><input type="checkbox" checked={auchBeendet} onChange={(e) => setAuchBeendet(e.target.checked)} /> auch beendete zeigen</label>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tab}>
                  <thead><tr><th style={{ ...s.th, textAlign: 'left' }}>Mitarbeiter</th><th style={{ ...s.th, textAlign: 'left' }}>Leistung</th><th style={s.th}>Betrieb</th><th style={s.th}>Eigenanteil</th><th style={s.th}>Laufzeit</th><th style={{ ...s.th, textAlign: 'left' }}>Lohnabrechnung</th><th style={s.th}></th></tr></thead>
                  <tbody>
                    {sichtbar.map((l) => {
                      const a = fristAmpel(l, tag);
                      const farbe = a.stufe === 'abgelaufen' ? C.bad : a.stufe === 'bald' ? C.warn : C.dim;
                      return (
                        <tr key={l.id}>
                          <td style={{ ...s.td, textAlign: 'left' }}>{l.person_name}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{ART[l.art]?.icon} {ART[l.art]?.label ?? l.art}{l.bezeichnung ? <div style={{ color: C.dim, fontSize: 12 }}>{l.bezeichnung}</div> : null}{l.nachweis ? <div style={{ color: C.dim, fontSize: 12 }}>Nachweis: {l.nachweis}{l.nachweis_bis ? ` (bis ${de(l.nachweis_bis)})` : ''}</div> : <div style={{ color: C.warn, fontSize: 12 }}>kein Nachweis eingetragen</div>}</td>
                          <td style={s.td}>{ZAHL(l.betrag_cent)}<div style={{ color: C.dim, fontSize: 11.5 }}>{l.turnus}</div></td>
                          <td style={s.td}>{l.eigenanteil_cent ? ZAHL(l.eigenanteil_cent) : '—'}</td>
                          <td style={{ ...s.td, color: farbe }}>{l.turnus === 'einmalig' ? de(l.beginn) : `${de(l.beginn)} – ${l.ende ? de(l.ende) : 'unbefristet'}`}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{l.lohn_behandlung === 'offen' ? <span style={{ color: C.warn }}>mit Steuerberater klären</span> : <>{BEH[l.lohn_behandlung]}<div style={{ color: C.dim, fontSize: 11.5 }}>bestätigt {de(l.stb_bestaetigt_am)}{l.stb_name ? ` · ${l.stb_name}` : ''}</div></>}</td>
                          <td style={s.td}>
                            <button type="button" style={s.link} onClick={() => bearbeiten(l)}>ändern</button>
                            {istChef && (frage === l.id
                              ? <> <button type="button" style={s.link} disabled={busy} onClick={() => void loeschen(l.id)}>Ja, löschen</button> <button type="button" style={s.link} onClick={() => setFrage(null)}>nein</button></>
                              : <> · <button type="button" style={s.link} onClick={() => setFrage(l.id)}>löschen</button></>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={s.box}>
                <b style={{ color: C.gold }}>📊 Kosten je Monat (letzte 12 Monate)</b>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.tab}>
                    <thead><tr><th style={{ ...s.th, textAlign: 'left' }}>Monat</th>{ARTEN.map((a) => <th key={a.key} style={s.th}>{a.icon}</th>)}<th style={s.th}>Betrieb gesamt</th><th style={s.th}>Eigenanteile</th><th style={s.th}>⚡ nach kWh*</th></tr></thead>
                    <tbody>
                      {[...zwoelf].reverse().map((z) => (
                        <tr key={z.monat}>
                          <td style={{ ...s.td, textAlign: 'left' }}>{monatKurz(z.monat)}</td>
                          {ARTEN.map((a) => <td key={a.key} style={s.td}>{z.jeArt[a.key] ? ZAHL(z.jeArt[a.key]) : '—'}</td>)}
                          <td style={{ ...s.td, fontWeight: 700 }}>{ZAHL(z.betrieb_cent)}</td>
                          <td style={s.td}>{z.eigen_cent ? ZAHL(z.eigen_cent) : '—'}</td>
                          <td style={s.td}>{ladeJe[z.monat] ? ZAHL(ladeJe[z.monat]) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ ...s.dim, fontSize: 12.5 }}>* Ladestrom-Erstattungen nach Zählerstand aus dem <a href="/dashboard/erp/fuhrpark/fahrtenbuch" style={{ color: C.gold }}>Fahrtenbuch</a> — getrennt gezeigt und nicht in „Betrieb gesamt“ enthalten (sichtbar nur mit Recht „Fuhrpark“).</p>
              </div>

              <div style={s.box}>
                <b style={{ color: C.gold }}>🧾 Liste für die Lohnabrechnung</b>
                <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginTop: 6 }}>
                  <label style={s.feld}>Monat<input type="month" value={lohnMonat.slice(0, 7)} style={s.eingabe} onChange={(e) => e.target.value && setLohnMonat(`${e.target.value}-01`)} /></label>
                  <button type="button" style={s.btnAus} disabled={lohn.length === 0} onClick={csvLaden}>⬇ CSV für das Steuerbüro</button>
                </div>
                {lohn.length === 0 ? <p style={s.dim}>Keine Leistungen in diesem Monat.</p> : (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                    {lohn.map((z, i) => (
                      <li key={i}>{z.person} · {ART[z.art]?.label ?? z.art}: Betrieb {ZAHL(z.betrieb_cent)}{z.eigen_cent ? `, Eigenanteil ${ZAHL(z.eigen_cent)}` : ''} · {z.behandlung === 'offen' ? <span style={{ color: C.warn }}>mit Steuerberater klären</span> : `${BEH[z.behandlung]} (bestätigt ${de(z.bestaetigt)})`}</li>
                    ))}
                  </ul>
                )}
                <p style={{ ...s.dim, fontSize: 12.5 }}>Die Liste ist ein Hinweis für Ihre Lohnabrechnung — sie ersetzt keine Lohnabrechnung und keine steuerliche Prüfung.</p>
              </div>
            </>
          )}
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
