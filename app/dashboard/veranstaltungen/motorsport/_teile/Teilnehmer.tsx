'use client';

// ARGONAUT OS · Paket 296 · Startgruppen und Teilnehmer eines Motorsport-Events
// Anmeldung, Warteliste, Startnummer, Leihfahrzeug, Haftungsverzicht über das
// Signatur-Modul, Prüf-Haken, Startfreigabe (setzt die Datenbank) und Rechnung.

import { useState, useMemo } from 'react';
import {
  TN_STATUS, BELEGEND, tnWeiter, gruppePruefen, teilnehmerPruefen, belegt, frei, naechsteStartnummer, vergebeneLeih,
  freigabeFehlt, verzichtEmpfaenger, verzichtDokument, tnRechnungMoeglich, bruttoCent, type TnForm, type GruppeForm,
} from '@/lib/motorsport';
import { signaturStarten } from '@/lib/signaturStart';
import { euro } from '@/lib/geld';
import Leerzustand from '../../../_components/Leerzustand';
import { useDarfAbrechnen } from '../../../_components/useDarfAbrechnen';
import { C, s } from '../../../werkstatt/zweirad/_teile/stil';
import { supabase, fehlerText, fzName, type Ev, type Gr, type Tn, type MietFz, type SigStatus } from './typen';

type Props = {
  ev: Ev; gruppen: Gr[]; tns: Tn[]; flotte: MietFz[]; sig: SigStatus; ku: boolean | null; betriebName: string;
  lade: () => Promise<void>; meldung: (ok: string | null, fehler: string | null) => void;
};

const LEER_TN = (nr: number): TnForm => ({ name: '', email: '', telefon: '', kontaktId: '', minderjaehrig: false, sorgeberechtigt: '', startnummer: String(nr), fahrzeugArt: 'eigen', eigenesFahrzeug: '', mietFahrzeugId: '', leihPreis: '', leihBrutto: true, notiz: '' });
const ST_FARBE: Record<string, string> = { angemeldet: C.cyan, bestaetigt: C.gold, warteliste: C.warn, freigegeben: C.ok, teilgenommen: C.dim, storniert: C.bad };
const WEG_TEXT: Record<string, string> = {
  bestaetigt: '✔ Bestätigen', angemeldet: '↩ Zurück auf angemeldet', warteliste: '⏳ Auf die Warteliste', freigegeben: '🏁 Startfreigabe',
  teilgenommen: '🏆 Teilgenommen', storniert: '✖ Stornieren',
};

function tnFormAus(t: Tn): TnForm {
  return {
    name: t.name, email: t.email ?? '', telefon: t.telefon ?? '', kontaktId: t.kontakt_id ?? '', minderjaehrig: t.minderjaehrig, sorgeberechtigt: t.sorgeberechtigt_name ?? '',
    startnummer: t.startnummer ? String(t.startnummer) : '', fahrzeugArt: t.fahrzeug_art, eigenesFahrzeug: t.eigenes_fahrzeug ?? '', mietFahrzeugId: t.miet_fahrzeug_id ?? '',
    leihPreis: t.leih_netto_cent ? String(t.leih_netto_cent / 100).replace('.', ',') : '', leihBrutto: false, notiz: t.notiz ?? '',
  };
}

export default function Teilnehmer({ ev, gruppen, tns, flotte, sig, ku, betriebName, lade, meldung }: Props) {
  // Rechnungs-Knopf nur mit Recht „Darf abrechnen“ (der Server prüft weiter selbst).
  const darfAbrechnen = useDarfAbrechnen();
  const [busy, setBusy] = useState(false);
  const [grForm, setGrForm] = useState<(GruppeForm & { id: string | null }) | null>(null);
  const [neu, setNeu] = useState<(TnForm & { gruppeId: string; warteliste: boolean }) | null>(null);
  const [offenId, setOffenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<(TnForm & { gruppeId: string }) | null>(null);
  const [mitStorno, setMitStorno] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const abgeschlossen = ev.status === 'abgesagt' || ev.status === 'beendet';
  const grName = (id: string) => gruppen.find((g) => g.id === id)?.name ?? '—';
  const fz = (id: string | null) => flotte.find((f) => f.id === id) ?? null;
  const liste = useMemo(() => tns
    .filter((t) => mitStorno || t.status !== 'storniert')
    .sort((a, b) => (a.startnummer ?? 99999) - (b.startnummer ?? 99999) || a.name.localeCompare(b.name, 'de')), [tns, mitStorno]);
  const offen = tns.find((t) => t.id === offenId) ?? null;

  async function lauf<T>(fn: () => Promise<{ data: T | null; error: { message?: string; code?: string } | null }>, okText: string, fehlerStandard: string): Promise<boolean> {
    setBusy(true); meldung(null, null);
    const { data, error } = await fn();
    setBusy(false);
    if (error || !data || (Array.isArray(data) && data.length === 0)) { meldung(null, fehlerText(error, fehlerStandard)); return false; }
    meldung(okText, null); await lade(); return true;
  }

  // ------------------------------------------------------------ Gruppen
  async function gruppeSpeichern() {
    if (!grForm) return;
    const p = gruppePruefen(grForm, ku === true);
    if (!p.ok) { meldung(null, p.grund); return; }
    const hinweis = p.exakt ? '' : ' Hinweis: Der Bruttobetrag ist mit 19 % nicht centgenau erreichbar — maßgeblich ist der angezeigte Endpreis.';
    const ok = grForm.id
      ? await lauf(async () => supabase.from('ms_gruppe').update(p.zeile).eq('id', grForm.id as string).select('id'), 'Gruppe gespeichert.' + hinweis, 'Gruppe nicht gespeichert.')
      : await lauf(async () => supabase.from('ms_gruppe').insert({ ...p.zeile, event_id: ev.id }).select('id'), 'Gruppe angelegt.' + hinweis, 'Gruppe nicht angelegt.');
    if (ok) setGrForm(null);
  }
  async function gruppeLoeschen(g: Gr) {
    if (!window.confirm(`Gruppe „${g.name}" löschen?`)) return;
    await lauf(async () => supabase.from('ms_gruppe').delete().eq('id', g.id).select('id'), 'Gruppe gelöscht.', 'Nicht gelöscht — nur der Chef löscht, und nur Gruppen ohne Teilnehmer.');
  }

  // --------------------------------------------------------- Anmeldung
  async function anmelden() {
    if (!neu) return;
    if (!neu.gruppeId) { meldung(null, 'Bitte eine Startgruppe wählen.'); return; }
    const p = teilnehmerPruefen(neu, ku === true);
    if (!p.ok) { meldung(null, p.grund); return; }
    const g = gruppen.find((x) => x.id === neu.gruppeId);
    const warte = neu.warteliste || (g ? frei(g, tns) === 0 : false);
    const ok = await lauf(async () => supabase.from('ms_teilnehmer').insert({ ...p.zeile, event_id: ev.id, gruppe_id: neu.gruppeId, status: warte ? 'warteliste' : 'angemeldet', startgeld_netto_cent: 0 }).select('id'),
      warte ? `${p.zeile.name} steht auf der Warteliste.` : `${p.zeile.name} ist angemeldet.`, 'Anmeldung nicht gespeichert.');
    if (ok) setNeu(null);
  }
  async function aendern(t: Tn, felder: Record<string, unknown>, okText: string): Promise<boolean> {
    return lauf(async () => supabase.from('ms_teilnehmer').update(felder).eq('id', t.id).select('id'), okText, 'Nicht gespeichert.');
  }
  async function editSpeichern(t: Tn) {
    if (!edit) return;
    const p = teilnehmerPruefen(edit, ku === true);
    if (!p.ok) { meldung(null, p.grund); return; }
    const felder: Record<string, unknown> = { ...p.zeile, gruppe_id: edit.gruppeId };
    if (t.rechnung_id) { delete felder.leih_netto_cent; delete felder.gruppe_id; delete felder.miet_fahrzeug_id; delete felder.fahrzeug_art; }
    if (await aendern(t, felder, 'Angaben gespeichert.')) setEdit(null);
  }
  async function loeschen(t: Tn) {
    if (!window.confirm(`Anmeldung von ${t.name} löschen?`)) return;
    await lauf(async () => supabase.from('ms_teilnehmer').delete().eq('id', t.id).select('id'), 'Anmeldung gelöscht.', 'Nicht gelöscht — nur der Chef löscht, und nur Anmeldungen ohne Verzicht, Freigabe oder Rechnung.');
    setOffenId(null);
  }

  // --------------------------------------------------------- Verzicht
  async function verzichtSenden(t: Tn) {
    if (!(ev.verzicht_text ?? '').trim()) { meldung(null, 'Bitte zuerst im Reiter „📜 Haftungsverzicht" Ihren eigenen Text hinterlegen.'); return; }
    const emp = verzichtEmpfaenger(t);
    const fahrzeug = t.fahrzeug_art === 'leih' ? `Leihfahrzeug ${fzName(fz(t.miet_fahrzeug_id))}` : (t.eigenes_fahrzeug || null);
    setBusy(true); meldung(null, null);
    const r = await signaturStarten(supabase, ev.owner_user_id, {
      titel: `Haftungsverzicht ${ev.titel} — ${t.name}`, empfaenger_name: emp.name, empfaenger_email: emp.email, kontakt_id: t.kontakt_id,
      dokument: verzichtDokument({ betrieb: betriebName, event: ev, person: t.name, rolle: 'teilnehmer', minderjaehrig: t.minderjaehrig, sorgeberechtigt: t.sorgeberechtigt_name, startnummer: t.startnummer, fahrzeug }),
      aufbewahrung_jahre: 10,
    });
    setBusy(false);
    if (!r.ok || !r.token) { meldung(null, 'Die Unterschrifts-Anfrage ließ sich nicht anlegen' + (r.error ? ` (${r.error}).` : '.')); return; }
    if (await aendern(t, { verzicht_token: r.token }, '')) {
      try { await navigator.clipboard.writeText(r.link || ''); } catch { /* ohne Zwischenablage weiter */ }
      setLink(r.link || null);
      meldung(`Unterschrifts-Link für ${emp.name}${emp.hinweis ? ` (${emp.hinweis})` : ''} erstellt und kopiert — per Mail schicken oder am Tablet an der Anmeldung öffnen.`, null);
    }
  }

  async function rechnung(t: Tn) {
    setBusy(true); meldung(null, null);
    try {
      const res = await fetch('/api/rechnung-aus-trackday', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teilnehmerId: t.id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && !(res.status === 409 && j.rechnungId)) throw new Error(j.error || 'Fehler');
      meldung(res.status === 409 ? 'Für diese Anmeldung gibt es bereits eine Rechnung.' : `Rechnung für ${t.name} erstellt — zu finden unter Rechnungen.`, null);
      await lade();
    } catch (e) { meldung(null, 'Rechnung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  const freieLeih = (ohneId?: string) => {
    const weg = vergebeneLeih(tns, ohneId);
    return flotte.filter((f) => f.aktiv && !weg.has(f.id));
  };
  const sigText = (t: { verzicht_token: string | null }) => {
    if (!t.verzicht_token) return { text: 'nicht versendet', farbe: C.dim };
    const st = sig[t.verzicht_token];
    if (st === 'signiert') return { text: '✔ unterschrieben', farbe: C.ok };
    if (st === 'abgelehnt') return { text: '✖ abgelehnt', farbe: C.bad };
    if (st === 'angesehen') return { text: 'angesehen', farbe: C.warn };
    if (st) return { text: 'versendet', farbe: C.warn };
    return { text: 'versendet (Status nur mit Recht „Signaturen")', farbe: C.dim };
  };

  const fahrzeugFelder = (f: TnForm, setF: (x: TnForm) => void, ohneId?: string, gesperrt = false) => (
    <>
      <label style={s.feld}>Fahrzeug<select style={s.eingabe} disabled={gesperrt} value={f.fahrzeugArt} onChange={(e) => setF({ ...f, fahrzeugArt: e.target.value })}>
        <option value="eigen">eigenes Fahrzeug</option><option value="leih">Leihfahrzeug aus der Mietflotte</option>
      </select></label>
      {f.fahrzeugArt === 'eigen' ? (
        <label style={s.feld}>Eigenes Fahrzeug (Marke, Modell, Kennzeichen)<input style={s.eingabe} disabled={gesperrt} value={f.eigenesFahrzeug} onChange={(e) => setF({ ...f, eigenesFahrzeug: e.target.value })} /></label>
      ) : (
        <>
          <label style={s.feld}>Leihfahrzeug<select style={s.eingabe} disabled={gesperrt} value={f.mietFahrzeugId} onChange={(e) => {
            const w = flotte.find((x) => x.id === e.target.value);
            setF({ ...f, mietFahrzeugId: e.target.value, leihPreis: f.leihPreis || (w ? String(w.tagessatz_cent / 100).replace('.', ',') : ''), leihBrutto: f.leihPreis ? f.leihBrutto : false });
          }}>
            <option value="">— wählen —</option>
            {freieLeih(ohneId).concat(f.mietFahrzeugId && !freieLeih(ohneId).some((x) => x.id === f.mietFahrzeugId) ? flotte.filter((x) => x.id === f.mietFahrzeugId) : []).map((x) => <option key={x.id} value={x.id}>{fzName(x)}</option>)}
          </select></label>
          <label style={s.feld}>Preis Leihfahrzeug (€, 0 = inklusive)<input style={s.eingabe} disabled={gesperrt} inputMode="decimal" value={f.leihPreis} onChange={(e) => setF({ ...f, leihPreis: e.target.value })} /></label>
          {ku !== true && <label style={{ ...s.feld, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" disabled={gesperrt} checked={f.leihBrutto} onChange={(e) => setF({ ...f, leihBrutto: e.target.checked })} /> Preis ist brutto (inkl. 19 %)</label>}
        </>
      )}
    </>
  );

  const personFelder = (f: TnForm, setF: (x: TnForm) => void, gesperrt = false) => (
    <>
      <label style={s.feld}>Name<input style={s.eingabe} disabled={gesperrt} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label style={s.feld}>E-Mail<input style={s.eingabe} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label style={s.feld}>Telefon<input style={s.eingabe} value={f.telefon} onChange={(e) => setF({ ...f, telefon: e.target.value })} /></label>
      <label style={s.feld}>Startnummer<input style={s.eingabe} disabled={gesperrt} inputMode="numeric" value={f.startnummer} onChange={(e) => setF({ ...f, startnummer: e.target.value })} /></label>
      <label style={{ ...s.feld, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" disabled={gesperrt} checked={f.minderjaehrig} onChange={(e) => setF({ ...f, minderjaehrig: e.target.checked })} /> minderjährig</label>
      {f.minderjaehrig && <label style={s.feld}>Sorgeberechtigte Person (unterschreibt den Verzicht)<input style={s.eingabe} disabled={gesperrt} value={f.sorgeberechtigt} onChange={(e) => setF({ ...f, sorgeberechtigt: e.target.value })} /></label>}
    </>
  );

  return (
    <div>
      {/* ------------------------------------------------------ Gruppen */}
      <h2 style={s.h2}>Startgruppen</h2>
      <p style={s.dim}>Je Gruppe die Startplätze und das Startgeld. Ist eine Gruppe voll, landen neue Anmeldungen automatisch auf der Warteliste.</p>
      {gruppen.length > 0 && (
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Gruppe</th><th style={s.th}>Belegt</th><th style={s.th}>Warteliste</th><th style={s.th}>Startgeld netto</th><th style={s.th}>{ku === true ? 'Endpreis (§ 19 UStG)' : 'Endpreis inkl. 19 %'}</th><th style={s.th}></th></tr></thead>
          <tbody>
            {gruppen.map((g) => (
              <tr key={g.id}>
                <td style={s.td}><b>{g.name}</b></td>
                <td style={s.td}><span style={{ color: frei(g, tns) === 0 ? C.warn : C.text }}>{belegt(tns, g.id)} / {g.startplaetze}</span></td>
                <td style={s.td}>{tns.filter((t) => t.gruppe_id === g.id && t.status === 'warteliste').length || '—'}</td>
                <td style={s.td}>{euro(g.startgeld_netto_cent / 100)}</td>
                <td style={s.td}>{euro(bruttoCent(g.startgeld_netto_cent, ku === true) / 100)}</td>
                <td style={s.td}>
                  {!abgeschlossen && <button style={s.link} onClick={() => setGrForm({ id: g.id, name: g.name, startplaetze: String(g.startplaetze), startgeld: String(g.startgeld_netto_cent / 100).replace('.', ','), brutto: false, reihenfolge: String(g.reihenfolge) })}>✎ ändern</button>}
                  {' · '}<button style={{ ...s.link, color: C.bad }} onClick={() => void gruppeLoeschen(g)}>löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!abgeschlossen && !grForm && <button style={{ ...s.btnAus, marginTop: 8 }} onClick={() => setGrForm({ id: null, name: '', startplaetze: '20', startgeld: '', brutto: ku !== true, reihenfolge: String(gruppen.length) })}>＋ Gruppe</button>}
      {grForm && (
        <div style={s.box}>
          <div style={s.raster}>
            <label style={s.feld}>Name<input style={s.eingabe} value={grForm.name} onChange={(e) => setGrForm({ ...grForm, name: e.target.value })} placeholder="z. B. Einsteiger" /></label>
            <label style={s.feld}>Startplätze<input style={s.eingabe} inputMode="numeric" value={grForm.startplaetze} onChange={(e) => setGrForm({ ...grForm, startplaetze: e.target.value })} /></label>
            <label style={s.feld}>Startgeld (€)<input style={s.eingabe} inputMode="decimal" value={grForm.startgeld} onChange={(e) => setGrForm({ ...grForm, startgeld: e.target.value })} /></label>
            {ku !== true && <label style={{ ...s.feld, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={grForm.brutto} onChange={(e) => setGrForm({ ...grForm, brutto: e.target.checked })} /> Betrag ist brutto (inkl. 19 %)</label>}
            <label style={s.feld}>Reihenfolge<input style={s.eingabe} inputMode="numeric" value={grForm.reihenfolge} onChange={(e) => setGrForm({ ...grForm, reihenfolge: e.target.value })} /></label>
          </div>
          {ku === null && <p style={s.dim}>Hinweis: Ob Ihr Betrieb Kleinunternehmer ist, ließ sich nicht lesen — bitte prüfen Sie, ob Sie brutto oder netto eingeben.</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={s.btnGold} disabled={busy} onClick={() => void gruppeSpeichern()}>💾 Speichern</button>
            <button style={s.btnAus} onClick={() => setGrForm(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- Teilnehmer */}
      <h2 style={s.h2}>Teilnehmer</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!abgeschlossen && gruppen.length > 0 && !neu && <button style={s.btnGold} onClick={() => setNeu({ ...LEER_TN(naechsteStartnummer(tns)), leihBrutto: ku !== true, gruppeId: gruppen[0]?.id ?? '', warteliste: false })}>＋ Anmeldung</button>}
        <label style={{ fontSize: 13.5, color: C.dim }}><input type="checkbox" checked={mitStorno} onChange={(e) => setMitStorno(e.target.checked)} /> Stornierte zeigen</label>
      </div>
      {link && <p style={{ ...s.dim, wordBreak: 'break-all' }}>Letzter Unterschrifts-Link: <a href={link} target="_blank" rel="noreferrer" style={{ color: C.gold }}>{link}</a></p>}

      {neu && (
        <div style={s.box}>
          <div style={s.raster}>
            <label style={s.feld}>Startgruppe<select style={s.eingabe} value={neu.gruppeId} onChange={(e) => setNeu({ ...neu, gruppeId: e.target.value })}>
              {gruppen.map((g) => <option key={g.id} value={g.id}>{g.name} — {frei(g, tns)} frei</option>)}
            </select></label>
            {personFelder(neu, (x) => setNeu({ ...neu, ...x }))}
            {fahrzeugFelder(neu, (x) => setNeu({ ...neu, ...x }))}
            <label style={s.feld}>Notiz<input style={s.eingabe} value={neu.notiz} onChange={(e) => setNeu({ ...neu, notiz: e.target.value })} /></label>
          </div>
          <label style={{ display: 'block', marginTop: 8, fontSize: 14 }}><input type="checkbox" checked={neu.warteliste} onChange={(e) => setNeu({ ...neu, warteliste: e.target.checked })} /> direkt auf die Warteliste</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={s.btnGold} disabled={busy} onClick={() => void anmelden()}>💾 Anmelden</button>
            <button style={s.btnAus} onClick={() => setNeu(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {gruppen.length === 0 ? (
        <Leerzustand icon="🏎️" titel="Noch keine Startgruppen" text="Legen Sie zuerst mindestens eine Startgruppe mit Startplätzen und Startgeld an — danach melden Sie Teilnehmer an." aktionText="＋ Gruppe" onAktion={() => setGrForm({ id: null, name: '', startplaetze: '20', startgeld: '', brutto: ku !== true, reihenfolge: '0' })} />
      ) : liste.length === 0 ? <p style={s.dim}>Noch keine Anmeldungen.</p> : (
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Nr.</th><th style={s.th}>Name</th><th style={s.th}>Gruppe</th><th style={s.th}>Fahrzeug</th><th style={s.th}>Verzicht</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
          <tbody>
            {liste.map((t) => {
              const v = sigText(t);
              return (
                <tr key={t.id} style={{ background: t.id === offenId ? 'rgba(201,168,76,0.07)' : undefined }}>
                  <td style={s.td}><b>{t.startnummer ?? '—'}</b></td>
                  <td style={s.td}>{t.name}{t.minderjaehrig && <span style={{ ...s.marke, marginLeft: 6 }}>minderjährig</span>}</td>
                  <td style={s.td}>{grName(t.gruppe_id)}</td>
                  <td style={s.td}>{t.fahrzeug_art === 'leih' ? `🔑 ${fzName(fz(t.miet_fahrzeug_id))}` : (t.eigenes_fahrzeug || '—')}</td>
                  <td style={{ ...s.td, color: v.farbe }}>{v.text}</td>
                  <td style={s.td}><span style={{ ...s.marke, color: ST_FARBE[t.status], borderColor: ST_FARBE[t.status] }}>{TN_STATUS[t.status] ?? t.status}</span>{t.rechnung_id && <span style={{ ...s.marke, marginLeft: 4 }}>🧾</span>}</td>
                  <td style={s.td}><button style={s.link} onClick={() => { setOffenId(t.id === offenId ? null : t.id); setEdit(null); }}>{t.id === offenId ? 'zu' : 'öffnen'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {offen && (
        <div style={s.box}>
          <h2 style={{ ...s.h2, marginTop: 0 }}>{offen.startnummer ? `#${offen.startnummer} · ` : ''}{offen.name}</h2>
          <p style={s.dim}>
            {grName(offen.gruppe_id)} · {offen.fahrzeug_art === 'leih' ? `Leihfahrzeug ${fzName(fz(offen.miet_fahrzeug_id))}` : `eigenes Fahrzeug: ${offen.eigenes_fahrzeug || '—'}`}
            {' · '}Startgeld {euro(offen.startgeld_netto_cent / 100)}{offen.leih_netto_cent ? ` + Leih ${euro(offen.leih_netto_cent / 100)}` : ''} netto
            {offen.email ? ` · ${offen.email}` : ''}{offen.telefon ? ` · ${offen.telefon}` : ''}
            {offen.minderjaehrig ? ` · Sorgeberechtigt: ${offen.sorgeberechtigt_name}` : ''}
          </p>

          {/* Prüf-Haken */}
          {['angemeldet', 'bestaetigt', 'warteliste'].includes(offen.status) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14, margin: '6px 0' }}>
              {ev.mindestalter > 0 && <label><input type="checkbox" disabled={busy} checked={offen.alter_geprueft} onChange={(e) => void aendern(offen, { alter_geprueft: e.target.checked }, 'Gespeichert.')} /> Alter (ab {ev.mindestalter}) geprüft</label>}
              {ev.fuehrerschein_pflicht && <label><input type="checkbox" disabled={busy} checked={offen.fuehrerschein_geprueft} onChange={(e) => void aendern(offen, { fuehrerschein_geprueft: e.target.checked }, 'Gespeichert.')} /> Führerschein geprüft</label>}
              {ev.briefing_pflicht && <label><input type="checkbox" disabled={busy} checked={offen.briefing} onChange={(e) => void aendern(offen, { briefing: e.target.checked }, 'Gespeichert.')} /> an der Fahrerbesprechung teilgenommen</label>}
            </div>
          )}

          {/* Startfreigabe: was fehlt? */}
          {offen.status === 'bestaetigt' && (() => {
            const fehlt = freigabeFehlt(offen, ev, sig[offen.verzicht_token ?? ''] === 'signiert');
            return fehlt.length ? <p style={{ ...s.dim, color: C.warn }}>Für die Startfreigabe fehlt noch: {fehlt.join(' · ')}</p> : <p style={{ ...s.dim, color: C.ok }}>Alles erledigt — bereit für die Startfreigabe.</p>;
          })()}
          {offen.status === 'freigegeben' && <p style={{ ...s.dim, color: C.ok }}>Zum Start freigegeben. Person, Gruppe, Startnummer, Fahrzeug und Verzicht sind jetzt fest.</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {!['teilgenommen', 'storniert', 'freigegeben'].includes(offen.status) && !abgeschlossen && (!offen.verzicht_token || sig[offen.verzicht_token] === 'abgelehnt') && (
              <button style={s.btnGold} disabled={busy} onClick={() => void verzichtSenden(offen)}>✍️ Haftungsverzicht zur Unterschrift</button>
            )}
            {offen.verzicht_token && sig[offen.verzicht_token] !== 'signiert' && (
              <button style={s.btnAus} onClick={() => { const l = `${window.location.origin}/signieren/${offen.verzicht_token}`; setLink(l); try { void navigator.clipboard.writeText(l); } catch { /* egal */ } meldung('Unterschrifts-Link kopiert.', null); }}>🔗 Link erneut kopieren</button>
            )}
            {tnWeiter(offen.status).filter((w) => !(abgeschlossen && w === 'freigegeben')).map((w) => (
              <button key={w} style={w === 'storniert' ? { ...s.btnAus, color: C.bad } : w === 'freigegeben' ? s.btnGold : s.btnAus} disabled={busy}
                onClick={() => { if (w === 'storniert' && !window.confirm(`Anmeldung von ${offen.name} stornieren? Das lässt sich nicht zurücknehmen.`)) return; void aendern(offen, { status: w }, `${offen.name}: ${TN_STATUS[w]}.`); }}>
                {WEG_TEXT[w] ?? w}
              </button>
            ))}
            {darfAbrechnen !== false && BELEGEND.includes(offen.status) && tnRechnungMoeglich(offen).ok && (
              <button style={s.btnAus} disabled={busy} onClick={() => void rechnung(offen)}>🧾 {offen.rechnung_id ? 'Rechnung (neu, falls storniert)' : 'Rechnung erstellen'}</button>
            )}
            {!edit && !['teilgenommen', 'storniert'].includes(offen.status) && <button style={s.btnAus} onClick={() => setEdit({ ...tnFormAus(offen), gruppeId: offen.gruppe_id })}>✎ Angaben ändern</button>}
            <button style={{ ...s.btnAus, color: C.bad }} disabled={busy} onClick={() => void loeschen(offen)}>Löschen</button>
          </div>

          {edit && (() => {
            const fest = offen.status === 'freigegeben';
            return (
              <div style={{ ...s.box, marginTop: 12 }}>
                {fest && <p style={s.dim}>Nach der Startfreigabe lassen sich nur Kontaktangaben und Notiz ändern.</p>}
                <div style={s.raster}>
                  <label style={s.feld}>Startgruppe<select style={s.eingabe} disabled={fest || !!offen.rechnung_id} value={edit.gruppeId} onChange={(e) => setEdit({ ...edit, gruppeId: e.target.value })}>
                    {gruppen.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select></label>
                  {personFelder(edit, (x) => setEdit({ ...edit, ...x }), fest)}
                  {fahrzeugFelder(edit, (x) => setEdit({ ...edit, ...x }), offen.id, fest || !!offen.rechnung_id)}
                  <label style={s.feld}>Notiz<input style={s.eingabe} value={edit.notiz} onChange={(e) => setEdit({ ...edit, notiz: e.target.value })} /></label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button style={s.btnGold} disabled={busy} onClick={() => void editSpeichern(offen)}>💾 Speichern</button>
                  <button style={s.btnAus} onClick={() => setEdit(null)}>Abbrechen</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
