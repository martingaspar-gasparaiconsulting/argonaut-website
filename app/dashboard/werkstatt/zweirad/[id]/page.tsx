'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/werkstatt/zweirad/[id] — Rad-Akte (Paket 295, Z1)
//
// Stammdaten mit Rahmen-, Motor-, Akku- und Schlüsselnummer; Inspektion und
// Garantie mit Ampel; Reparatur-Annahme und Inspektion als Auftrag im
// Werkstatt-Board (dort Positionen und Rechnung); Garantiefälle mit
// Vorgangsnummer des Herstellers; Dienstrad-Vorgänge zu diesem Rad.
// Logik: lib/zweirad.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { berlinTag } from '@/lib/fahrzeugMiete';
import {
  RAD_ARTEN, RAD_STATUS, ZUBEHOER, GARANTIE_ARTEN, BAUTEILE, GARANTIE_STATUS, MIT_MOTOR,
  inspektionFaellig, garantieAmpel, gewaehrleistungBis, radName, annahmeAuftrag, garantiePruefen, garantieWeiter,
  drStatusName, kontaktLesen, datumDe, statusErlaubt, type AnnahmeForm, type RadZeile, type ZrKontakt,
} from '@/lib/zweirad';
import { euro } from '@/lib/geld';
import RadFormular, { formAusRad, type RadRoh } from '../_teile/RadFormular';
import { C, s, AMPEL_FARBE } from '../_teile/stil';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
type Auftrag = { id: string; nummer: string | null; titel: string; status: string | null; angenommen_am: string | null; zugesagt_am: string | null };
type Garantie = { id: string; art: string; bauteil: string; fehler: string; status: string; gemeldet_am: string; hersteller_nr: string | null; ergebnis: string | null; erledigt_am: string | null };
type Dr = { id: string; nummer: string | null; status: string; arbeitnehmer_name: string; arbeitgeber_name: string; portal: string | null };
const ART_NAME: Record<string, string> = Object.fromEntries(RAD_ARTEN.map((a) => [a.key, a.label]));
const BAUTEIL_NAME: Record<string, string> = Object.fromEntries(BAUTEILE.map((b) => [b.key, b.label]));
const GARANTIE_ART_NAME: Record<string, string> = Object.fromEntries(GARANTIE_ARTEN.map((a) => [a.key, a.label]));
const LEER_ANNAHME: AnnahmeForm = { art: 'reparatur', anliegen: '', zustand: '', zubehoer: {}, kostengrenze: '', km: '', ladezyklen: '', abholung: '' };

export default function RadAktePage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const [rad, setRad] = useState<RadRoh | null>(null);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [garantien, setGarantien] = useState<Garantie[]>([]);
  const [dienstrad, setDienstrad] = useState<Dr[]>([]);
  const [kontakte, setKontakte] = useState<ZrKontakt[]>([]);
  const [istChef, setIstChef] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [annahme, setAnnahme] = useState<AnnahmeForm | null>(null);
  const [gForm, setGForm] = useState<{ art: string; bauteil: string; fehler: string; herstellerNr: string; gemeldetAm: string } | null>(null);
  const [frage, setFrage] = useState<string | null>(null);

  const lade = useCallback(async () => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) { setFehler('Ungültige Rad-Akte.'); setLaden(false); return; }
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    setIstChef(!!uid && !(typeof chef === 'string' && chef && chef !== uid));
    const [r, a, g, d, k] = await Promise.all([
      supabase.from('zweirad').select('*').eq('id', id).maybeSingle(),
      supabase.from('werkstatt_auftraege').select('id, nummer, titel, status, angenommen_am, zugesagt_am').eq('zweirad_id', id).order('angenommen_am', { ascending: false }).limit(200),
      supabase.from('zweirad_garantie').select('*').eq('zweirad_id', id).order('gemeldet_am', { ascending: false }),
      supabase.from('dienstrad_vorgang').select('id, nummer, status, arbeitnehmer_name, arbeitgeber_name, portal').eq('zweirad_id', id).order('erstellt_am', { ascending: false }),
      supabase.from('kontakte').select('*').limit(1000),
    ]);
    if (r.error || !r.data) { setFehler('Rad nicht gefunden — oder Ihnen fehlt das Recht „Werkstatt".'); setLaden(false); return; }
    setRad(r.data as RadRoh);
    setAuftraege((a.data as Auftrag[] | null) ?? []);
    setGarantien((g.data as Garantie[] | null) ?? []);
    setDienstrad((d.data as Dr[] | null) ?? []);
    setKontakte(((k.data as Record<string, unknown>[] | null) ?? []).map(kontaktLesen).sort((x, y) => x.name.localeCompare(y.name, 'de')));
    setLaden(false);
  }, [id]);
  useEffect(() => { void lade(); }, [lade]);

  const h = berlinTag(Date.now());
  const gesperrt = dienstrad.some((d) => d.status === 'uebergeben' || d.status === 'abgerechnet');

  function meldung(error: { message?: string; code?: string } | null, standard: string): string {
    const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
    if (/23505|duplicate/i.test(m)) return 'Diese Rahmennummer ist bei einem anderen Rad erfasst.';
    if (/row-level|permission/i.test(m)) return 'Dafür braucht es das Schreibrecht „Werkstatt".';
    if (error?.message && /[äöüÄÖÜß]|Rad|Dienstrad|Garantie/.test(error.message)) return error.message;
    return standard;
  }

  async function speichern(zeile: RadZeile, hinweise: string[]) {
    if (!rad) return;
    setBusy(true); setFehler(null); setOk(null);
    const status = statusErlaubt(zeile.herkunft, rad.status) ? rad.status : zeile.herkunft === 'kunde' ? 'kunde' : 'bestand';
    const { data, error } = await supabase.from('zweirad').update({ ...zeile, status }).eq('id', rad.id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler(meldung(error, 'Nicht gespeichert.')); return; }
    setBearbeiten(false); setOk(['Gespeichert.', ...hinweise].join(' ')); await lade();
  }

  async function statusSetzen(nach: string) {
    if (!rad) return;
    setBusy(true); setFehler(null); setOk(null); setFrage(null);
    const { data, error } = await supabase.from('zweirad').update({ status: nach }).eq('id', rad.id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler(meldung(error, 'Status nicht geändert.')); return; }
    setOk(`Status: ${RAD_STATUS[nach] ?? nach}.`); await lade();
  }

  async function inspektionErledigt() {
    if (!rad) return;
    setBusy(true); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('zweirad').update({ letzte_inspektion: h }).eq('id', rad.id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler(meldung(error, 'Nicht gespeichert.')); return; }
    setOk('Inspektion heute eingetragen — die nächste Fälligkeit ist neu berechnet.'); await lade();
  }

  async function annehmen() {
    if (!rad || !annahme) return;
    const p = annahmeAuftrag(rad, annahme, h);
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('werkstatt_auftraege').insert({ ...p.felder, owner_user_id: rad.owner_user_id, aktualisiert_am: new Date().toISOString() }).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler('Auftrag ließ sich nicht anlegen. Haben Sie das Schreibrecht „Werkstatt" und ist SQL Paket 295 ausgeführt?'); return; }
    setAnnahme(null);
    setOk(`${annahme.art === 'inspektion' ? 'Inspektion' : 'Reparatur'} angenommen — der Auftrag steht im Werkstatt-Board. Positionen, Kostenvoranschlag und Rechnung machen Sie dort.`);
    await lade();
  }

  async function garantieAnlegen() {
    if (!rad || !gForm) return;
    const p = garantiePruefen(gForm, h);
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('zweirad_garantie').insert({ ...p.zeile, zweirad_id: rad.id, owner_user_id: rad.owner_user_id }).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler(meldung(error, 'Garantiefall nicht gespeichert.')); return; }
    setGForm(null); setOk('Garantiefall angelegt.'); await lade();
  }

  async function garantieWeiterSetzen(g: Garantie, nach: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('zweirad_garantie').update({ status: nach, ...extra }).eq('id', g.id).eq('status', g.status).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler(meldung(error, 'Nicht gespeichert.')); return; }
    setOk(`Garantiefall: ${GARANTIE_STATUS[nach] ?? nach}.`); await lade();
  }

  async function garantieFeld(g: Garantie, felder: Record<string, unknown>) {
    const { data, error } = await supabase.from('zweirad_garantie').update(felder).eq('id', g.id).select('id');
    if (error || !data || data.length === 0) setFehler(meldung(error, 'Nicht gespeichert.'));
    else { setOk('Gespeichert.'); await lade(); }
  }

  async function loeschen() {
    if (!rad) return;
    setBusy(true); setFehler(null); setFrage(null);
    const { data, error } = await supabase.from('zweirad').delete().eq('id', rad.id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler('Nicht gelöscht — löschen darf nur der Chef, und ein Rad mit Dienstrad-Vorgang bleibt erhalten. Nutzen Sie „Archiv".'); return; }
    window.location.href = '/dashboard/werkstatt/zweirad';
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lädt …</p></div>;
  if (!rad) return <div style={s.page}><a href="/dashboard/werkstatt/zweirad" style={s.zurueck}>← Zweirad &amp; E-Bike</a><p style={{ ...s.dim, color: C.bad }}>{fehler}</p></div>;

  const insp = inspektionFaellig(rad, h);
  const gar = garantieAmpel(rad.garantie_bis, h);
  const gew = rad.herkunft === 'bestand' && rad.status === 'verkauft' ? gewaehrleistungBis(rad.verkauft_am) : null;
  const motor = MIT_MOTOR.includes(rad.art);
  const zeile = (l: string, w: string | number | null | undefined, mono = false) => (
    <div style={{ display: 'grid', gap: 2 }}><span style={{ color: C.dim, fontSize: 12.5 }}>{l}</span><span style={{ fontFamily: mono ? 'monospace' : 'inherit' }}>{w === null || w === undefined || w === '' ? '—' : w}</span></div>
  );
  const statusWege = rad.herkunft === 'kunde'
    ? (rad.status === 'archiv' ? ['kunde'] : ['archiv'])
    : rad.status === 'bestand' ? ['reserviert', 'verkauft', 'archiv'] : rad.status === 'reserviert' ? ['bestand', 'verkauft'] : rad.status === 'verkauft' && !gesperrt ? ['bestand', 'archiv'] : rad.status === 'archiv' && !gesperrt ? ['bestand'] : rad.status === 'verkauft' ? ['archiv'] : [];

  return (
    <div style={s.page}>
      <a href="/dashboard/werkstatt/zweirad" style={s.zurueck}>← Zweirad &amp; E-Bike</a>
      <h1 style={s.h1}>🚲 {radName(rad)}</h1>
      <p style={{ ...s.dim, margin: 0 }}>
        {ART_NAME[rad.art] ?? rad.art} · <span style={s.marke}>{RAD_STATUS[rad.status] ?? rad.status}</span>
        {rad.halter_name ? ` · ${rad.halter_name}` : ''}
      </p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}

      <div style={s.kacheln}>
        <div style={{ ...s.kachel, borderColor: AMPEL_FARBE[insp.ampel] }}><b style={{ ...s.zahl, fontSize: 18, color: AMPEL_FARBE[insp.ampel] }}>{insp.am ? datumDe(insp.am) : '—'}</b><span style={s.dim}>{insp.ampel === 'ueber' ? 'Inspektion überfällig' : insp.am ? 'nächste Inspektion' : 'kein Inspektions-Intervall'}</span></div>
        <div style={{ ...s.kachel, borderColor: AMPEL_FARBE[gar.ampel] }}><b style={{ ...s.zahl, fontSize: 18, color: AMPEL_FARBE[gar.ampel] }}>{rad.garantie_bis ? datumDe(rad.garantie_bis) : '—'}</b><span style={s.dim}>{gar.ampel === 'ueber' ? 'Herstellergarantie abgelaufen' : 'Herstellergarantie bis'}</span></div>
        {gew && <div style={s.kachel}><b style={{ ...s.zahl, fontSize: 18 }}>{datumDe(gew)}</b><span style={s.dim}>Gewährleistung gegenüber Verbrauchern (2 Jahre ab Übergabe) — nur Hinweis</span></div>}
        <div style={s.kachel}><b style={{ ...s.zahl, fontSize: 18 }}>{auftraege.length}</b><span style={s.dim}>Werkstatt-Aufträge</span></div>
      </div>

      {bearbeiten ? (
        <RadFormular start={formAusRad(rad)} kontakte={kontakte} gesperrt={gesperrt} busy={busy} onSpeichern={(z, hw) => void speichern(z, hw)} onAbbrechen={() => setBearbeiten(false)} />
      ) : (
        <div style={s.box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ color: C.gold }}>Stammdaten</b>
            <button type="button" style={s.btnAus} onClick={() => { setBearbeiten(true); setOk(null); }}>✏ Ändern</button>
          </div>
          <div style={s.raster}>
            {zeile('Rahmennummer', rad.rahmennummer, true)}
            {zeile('Rahmengröße', rad.rahmengroesse)}
            {zeile('Modelljahr', rad.modelljahr)}
            {zeile('Farbe', rad.farbe)}
            {motor && zeile('Motor', [rad.motor_hersteller, rad.motor_nr].filter(Boolean).join(' · '), true)}
            {motor && zeile('Akkunummer', rad.akku_nr, true)}
            {motor && zeile('Akku', rad.akku_wh ? `${rad.akku_wh} Wh` : null)}
            {motor && zeile('Display', rad.display_nr, true)}
            {zeile('Schlüsselnummer', rad.schluessel_nr, true)}
            {rad.art === 's_pedelec' && zeile('Versicherungskennzeichen', rad.versicherungskennzeichen, true)}
            {zeile('Kaufdatum', rad.kaufdatum ? datumDe(rad.kaufdatum) : null)}
            {zeile('Letzte Inspektion', rad.letzte_inspektion ? datumDe(rad.letzte_inspektion) : null)}
            {zeile('Intervall', rad.inspektion_intervall_monate ? `${rad.inspektion_intervall_monate} Monate` : 'keins')}
            {rad.herkunft === 'bestand' && zeile('Verkaufspreis brutto', rad.vk_cent !== null ? euro(rad.vk_cent / 100) : null)}
            {rad.herkunft === 'bestand' && zeile('Einkaufspreis netto', rad.ek_cent !== null ? euro(rad.ek_cent / 100) : null)}
            {rad.status === 'verkauft' && zeile('Verkauft am', rad.verkauft_am ? datumDe(rad.verkauft_am) : null)}
          </div>
          {rad.notiz && <p style={{ ...s.dim, marginTop: 10 }}>{rad.notiz}</p>}
          {statusWege.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              <span style={{ color: C.dim, fontSize: 13 }}>Status:</span>
              {statusWege.map((st) => <button key={st} type="button" style={s.btnAus} disabled={busy} onClick={() => void statusSetzen(st)}>→ {RAD_STATUS[st] ?? st}</button>)}
              {istChef && !gesperrt && dienstrad.length === 0 && (frage === 'loeschen'
                ? <><span style={{ color: C.bad, fontSize: 13 }}>Rad-Akte wirklich löschen?</span><button type="button" style={{ ...s.btnAus, borderColor: C.bad, color: C.bad }} onClick={() => void loeschen()}>Ja, löschen</button><button type="button" style={s.btnAus} onClick={() => setFrage(null)}>Nein</button></>
                : <button type="button" style={{ ...s.btnAus, marginLeft: 'auto', color: C.dim }} onClick={() => setFrage('loeschen')}>Löschen</button>)}
            </div>
          )}
        </div>
      )}

      <h2 style={s.h2}>🔧 Werkstatt</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={s.btnGold} onClick={() => { setAnnahme({ ...LEER_ANNAHME, art: 'reparatur' }); setOk(null); }}>🛠 Reparatur annehmen</button>
        <button type="button" style={s.btnAus} onClick={() => { setAnnahme({ ...LEER_ANNAHME, art: 'inspektion' }); setOk(null); }}>🔍 Inspektion annehmen</button>
        <button type="button" style={s.btnAus} disabled={busy} onClick={() => void inspektionErledigt()}>✓ Inspektion heute erledigt</button>
        <a href="/dashboard/werkstatt" style={{ ...s.btnAus, textDecoration: 'none' }}>Zum Werkstatt-Board</a>
      </div>
      {annahme && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>{annahme.art === 'inspektion' ? 'Inspektion annehmen' : 'Reparatur annehmen'}</b>
          <div style={s.raster}>
            <label style={s.feld}>{annahme.art === 'inspektion' ? 'Zusätzliche Wünsche' : 'Was ist zu tun? *'}<textarea rows={3} maxLength={1000} value={annahme.anliegen} style={s.eingabe} onChange={(e) => setAnnahme({ ...annahme, anliegen: e.target.value })} /></label>
            <label style={s.feld}>Zustand bei Annahme (Kratzer, Schäden)<textarea rows={3} maxLength={600} value={annahme.zustand} style={s.eingabe} onChange={(e) => setAnnahme({ ...annahme, zustand: e.target.value })} /></label>
            <label style={s.feld}>Kostengrenze brutto (€, leer = keine)<input inputMode="decimal" value={annahme.kostengrenze} style={s.eingabe} onChange={(e) => setAnnahme({ ...annahme, kostengrenze: e.target.value })} /></label>
            {motor && <label style={s.feld}>km-Stand laut Display<input inputMode="numeric" value={annahme.km} style={s.eingabe} onChange={(e) => setAnnahme({ ...annahme, km: e.target.value })} /></label>}
            {motor && <label style={s.feld}>Akku-Ladezyklen (laut Diagnose)<input inputMode="numeric" value={annahme.ladezyklen} style={s.eingabe} onChange={(e) => setAnnahme({ ...annahme, ladezyklen: e.target.value })} /></label>}
            <label style={s.feld}>Abholung zugesagt am<input type="date" value={annahme.abholung} style={s.eingabe} onChange={(e) => setAnnahme({ ...annahme, abholung: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ color: C.dim, fontSize: 13 }}>Mit abgegeben:</span>
            {ZUBEHOER.map((z) => (
              <label key={z.key} style={{ fontSize: 13.5 }}><input type="checkbox" checked={!!annahme.zubehoer[z.key]} onChange={(e) => setAnnahme({ ...annahme, zubehoer: { ...annahme.zubehoer, [z.key]: e.target.checked } })} /> {z.label}</label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={s.btnGold} disabled={busy} onClick={() => void annehmen()}>{busy ? 'Legt an …' : '📋 Im Werkstatt-Board anlegen'}</button>
            <button type="button" style={s.btnAus} onClick={() => setAnnahme(null)}>Abbrechen</button>
          </div>
        </div>
      )}
      {auftraege.length === 0 ? <p style={s.dim}>Noch keine Werkstatt-Aufträge zu diesem Rad.</p> : (
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Angenommen</th><th style={s.th}>Auftrag</th><th style={s.th}>Status</th><th style={s.th}>Abholung</th></tr></thead>
          <tbody>
            {auftraege.map((a) => (
              <tr key={a.id}>
                <td style={s.td}>{datumDe(a.angenommen_am)}</td>
                <td style={s.td}>{a.nummer ? `${a.nummer} · ` : ''}{a.titel}</td>
                <td style={s.td}><span style={s.marke}>{a.status ?? '—'}</span></td>
                <td style={s.td}>{datumDe(a.zugesagt_am)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={s.h2} id="garantie">🛡 Garantie und Gewährleistung</h2>
      {!gForm && <button type="button" style={s.btnAus} onClick={() => { setGForm({ art: 'garantie', bauteil: motor ? 'akku' : 'rahmen', fehler: '', herstellerNr: '', gemeldetAm: h }); setOk(null); }}>＋ Garantiefall anlegen</button>}
      {gForm && (
        <div style={s.box}>
          <div style={s.raster}>
            <label style={s.feld}>Art<select value={gForm.art} style={s.eingabe} onChange={(e) => setGForm({ ...gForm, art: e.target.value })}>{GARANTIE_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
            <label style={s.feld}>Bauteil<select value={gForm.bauteil} style={s.eingabe} onChange={(e) => setGForm({ ...gForm, bauteil: e.target.value })}>{BAUTEILE.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
            <label style={s.feld}>Fehler *<input maxLength={1000} value={gForm.fehler} style={s.eingabe} onChange={(e) => setGForm({ ...gForm, fehler: e.target.value })} /></label>
            <label style={s.feld}>Vorgangsnummer beim Hersteller<input maxLength={60} value={gForm.herstellerNr} style={s.eingabe} onChange={(e) => setGForm({ ...gForm, herstellerNr: e.target.value })} /></label>
            <label style={s.feld}>Gemeldet am<input type="date" value={gForm.gemeldetAm} style={s.eingabe} onChange={(e) => setGForm({ ...gForm, gemeldetAm: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={s.btnGold} disabled={busy} onClick={() => void garantieAnlegen()}>💾 Anlegen</button>
            <button type="button" style={s.btnAus} onClick={() => setGForm(null)}>Abbrechen</button>
          </div>
        </div>
      )}
      {garantien.length > 0 && (
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Gemeldet</th><th style={s.th}>Art · Bauteil · Fehler</th><th style={s.th}>Hersteller-Nr.</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
          <tbody>
            {garantien.map((g) => (
              <tr key={g.id}>
                <td style={s.td}>{datumDe(g.gemeldet_am)}</td>
                <td style={s.td}><b>{GARANTIE_ART_NAME[g.art] ?? g.art} · {BAUTEIL_NAME[g.bauteil] ?? g.bauteil}</b><div style={{ color: C.dim, fontSize: 12.5 }}>{g.fehler}</div>{g.ergebnis && <div style={{ fontSize: 12.5 }}>Ergebnis: {g.ergebnis}</div>}</td>
                <td style={s.td}>
                  {g.status === 'erledigt' ? (g.hersteller_nr ?? '—') : (
                    <input defaultValue={g.hersteller_nr ?? ''} maxLength={60} style={{ ...s.eingabe, width: 130 }} onBlur={(e) => { const w = e.target.value.trim() || null; if (w !== g.hersteller_nr) void garantieFeld(g, { hersteller_nr: w }); }} />
                  )}
                </td>
                <td style={s.td}><span style={s.marke}>{GARANTIE_STATUS[g.status] ?? g.status}</span></td>
                <td style={s.td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {garantieWeiter(g.status).map((n) => (
                      <button key={n} type="button" style={s.btnAus} disabled={busy} onClick={() => {
                        const erg = n === 'erledigt' || n === 'abgelehnt' ? window.prompt('Ergebnis (z. B. Akku getauscht, Gutschrift, abgelehnt wegen …)', g.ergebnis ?? '') : null;
                        void garantieWeiterSetzen(g, n, erg !== null && erg.trim() ? { ergebnis: erg.trim().slice(0, 1000) } : {});
                      }}>→ {GARANTIE_STATUS[n]}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={s.h2}>💼 Dienstrad</h2>
      {dienstrad.length === 0 ? (
        <p style={s.dim}>{rad.herkunft === 'bestand' ? 'Dieses Rad hängt an keinem Dienstrad-Vorgang. Einen Vorgang legen Sie unter „Dienstrad-Leasing" an und ordnen dort das Rad zu.' : 'Kundenräder können nicht als Dienstrad übergeben werden.'}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {dienstrad.map((d) => (
            <li key={d.id} style={{ margin: '4px 0' }}>
              <a href={`/dashboard/werkstatt/zweirad/dienstrad?vorgang=${d.id}`} style={s.link}>{d.nummer}</a> · {d.arbeitnehmer_name} ({d.arbeitgeber_name}) · {d.portal ?? 'Portal offen'} · <span style={s.marke}>{drStatusName(d.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
