'use client';

// ============================================================
// ARGONAUT OS · A2 · Bildung & Kurse (vertieft)
// Kurse mit Plätzen/Belegung + Anmeldungen, WARTELISTE (automatisch bei
// vollem Kurs, mit Rang + Nachrücken), SERIENTERMINE + ANWESENHEIT und
// Zertifikats-Berechtigung. Formeln aus lib/kurse (0 €, getestet).
// Pfad: app/dashboard/bildung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import FilialZuordnung, { type FilialeLite } from '../_components/FilialZuordnung';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort } from '@/lib/standortDaten';
import {
  freiePlaetze, istVoll, zaehleBelegt, wartelisteRang, istBelegend,
  zaehleKurse, zertifikatBerechtigt,
} from '@/lib/kurse';
import { augeKurse } from '@/lib/auge';
import { teilnahmebescheinigungPdf } from '@/lib/zertifikat';
import KiAuge from '../_components/KiAuge';
import { NurVoll } from '../_components/Ansicht';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kurs = { id: string; titel: string; start_am: string | null; ende_am: string | null; ort: string | null; plaetze: number; preis: number; status: string; art: string; dozent: string | null; zertifikat_aktiv: boolean };
type Anmeldung = { id: string; kurs_id: string; name: string; email: string | null; status: string; abgerechnet?: boolean; warteliste_seit?: string | null; zertifikat_am?: string | null };
type Termin = { id: string; kurs_id: string; datum: string; von_uhr: string | null; bis_uhr: string | null; thema: string | null };
type Anw = { id?: string; termin_id: string; anmeldung_id: string; anwesend: boolean };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
const AN_STATUS = ['angemeldet', 'bestaetigt', 'teilgenommen', 'storniert', 'warteliste'];

export default function BildungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState<string | null>(null);
  const [kurse, setKurse] = useState<Kurs[]>([]);
  const [anm, setAnm] = useState<Anmeldung[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [anwesenheit, setAnwesenheit] = useState<Anw[]>([]);
  const [aktiv, setAktiv] = useState<Kurs | null>(null);
  const [detTab, setDetTab] = useState<'teilnehmer' | 'termine'>('teilnehmer');
  const [selTermin, setSelTermin] = useState<string | null>(null);
  // Multistandort-Zuordnung (🏢 Filialen)
  const [standorte, setStandorte] = useState<FilialeLite[]>([]);
  const [zuord, setZuord] = useState<{ bildung_kurse_id: string; standort_id: string }[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nk, setNk] = useState({ titel: '', start_am: heute(), ende_am: '', ort: '', plaetze: '10', preis: '', art: 'einzeltermin', dozent: '', zertifikat_aktiv: false });
  const [na, setNa] = useState({ name: '', email: '' });
  const [nt, setNt] = useState({ datum: heute(), von_uhr: '', bis_uhr: '', thema: '' });

  const laden_ = useCallback(async () => {
    // Filialen + Zuordnungen laden (🏢-Knopf + fail-open-Filter der Kursliste)
    const [{ data: st }, { data: zu }] = await Promise.all([
      supabase.from('standorte').select('id, name, ist_hauptsitz').eq('aktiv', true).order('ist_hauptsitz', { ascending: false }).order('name', { ascending: true }),
      supabase.from('bildung_kurse_standorte').select('bildung_kurse_id, standort_id'),
    ]);
    setStandorte((st as FilialeLite[]) ?? []);
    const zuordRows = (zu as { bildung_kurse_id: string; standort_id: string }[]) ?? [];
    setZuord(zuordRows);
    const sid = konkreterStandort(leseStandortCookie());
    const { data: k } = await supabase.from('bildung_kurse').select('id, titel, start_am, ende_am, ort, plaetze, preis, status, art, dozent, zertifikat_aktiv').order('start_am', { ascending: true });
    let kurseRows = (k as Kurs[]) ?? [];
    if (sid) {
      // Fail-open: Kurse ohne Zuordnung ODER dieser Filiale zugeordnet.
      kurseRows = kurseRows.filter((kk) => {
        const zug = zuordRows.filter((z) => z.bildung_kurse_id === kk.id).map((z) => z.standort_id);
        return zug.length === 0 || zug.includes(sid);
      });
    }
    setKurse(kurseRows);
    const { data: a } = await supabase.from('bildung_anmeldungen').select('id, kurs_id, name, email, status, abgerechnet, warteliste_seit, zertifikat_am');
    setAnm((a as Anmeldung[]) ?? []);
    const { data: t } = await supabase.from('bildung_termine').select('id, kurs_id, datum, von_uhr, bis_uhr, thema').order('datum', { ascending: true });
    setTermine((t as Termin[]) ?? []);
    const { data: w } = await supabase.from('bildung_anwesenheit').select('id, termin_id, anmeldung_id, anwesend');
    setAnwesenheit((w as Anw[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const m = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const name = [m.firmenname, m.firma, m.company, m.full_name, m.name].find((x) => typeof x === 'string' && x.trim());
      setAussteller(typeof name === 'string' ? name : null);
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  function setzeZuord(id: string, ids: string[]) {
    setZuord((prev) => [...prev.filter((z) => z.bildung_kurse_id !== id), ...ids.map((sid) => ({ bildung_kurse_id: id, standort_id: sid }))]);
  }

  const anmFor = useCallback((kid: string) => anm.filter((a) => a.kurs_id === kid), [anm]);
  const belegt = useCallback((kid: string) => zaehleBelegt(anmFor(kid)), [anmFor]);
  const warteFor = useCallback((kid: string) => anmFor(kid).filter((a) => a.status === 'warteliste').length, [anmFor]);

  const kennzahlen = useMemo(() => zaehleKurse(kurse, anm), [kurse, anm]);
  const aktivAnm = useMemo(() => (aktiv ? anmFor(aktiv.id) : []), [aktiv, anmFor]);
  const aktivTermine = useMemo(() => (aktiv ? termine.filter((t) => t.kurs_id === aktiv.id) : []), [aktiv, termine]);
  const aktivTerminIds = useMemo(() => new Set(aktivTermine.map((t) => t.id)), [aktivTermine]);

  // Anwesend-Termine je Teilnehmer (nur Termine des aktiven Kurses).
  const anwesendCount = useCallback((anmeldungId: string) => anwesenheit.filter((w) => w.anwesend && w.anmeldung_id === anmeldungId && aktivTerminIds.has(w.termin_id)).length, [anwesenheit, aktivTerminIds]);
  const istAnwesend = useCallback((terminId: string, anmeldungId: string) => anwesenheit.some((w) => w.termin_id === terminId && w.anmeldung_id === anmeldungId && w.anwesend), [anwesenheit]);

  async function kursAnlegen() {
    if (!uid || !nk.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('bildung_kurse').insert({
      owner_user_id: uid, titel: nk.titel.trim(), start_am: nk.start_am || null, ende_am: nk.ende_am || null,
      ort: nk.ort.trim() || null, plaetze: parseInt(nk.plaetze, 10) || 10, preis: num(nk.preis),
      art: nk.art, dozent: nk.dozent.trim() || null, zertifikat_aktiv: nk.zertifikat_aktiv,
    }).select('id, titel, start_am, ende_am, ort, plaetze, preis, status, art, dozent, zertifikat_aktiv').single();
    if (error || !data) { setFehler('Kurs konnte nicht gespeichert werden.'); return; }
    setNk({ titel: '', start_am: heute(), ende_am: '', ort: '', plaetze: '10', preis: '', art: 'einzeltermin', dozent: '', zertifikat_aktiv: false });
    setOk('Kurs gespeichert.'); await laden_(); setAktiv(data as Kurs); setDetTab('teilnehmer');
  }

  async function anmelden() {
    if (!uid || !aktiv || !na.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setFehler(null); setOk(null);
    const voll = istVoll(aktiv.plaetze, anmFor(aktiv.id));
    const payload: Record<string, unknown> = { owner_user_id: uid, kurs_id: aktiv.id, name: na.name.trim(), email: na.email.trim() || null };
    if (voll) { payload.status = 'warteliste'; payload.warteliste_seit = new Date().toISOString(); }
    const { error } = await supabase.from('bildung_anmeldungen').insert(payload);
    if (error) { setFehler('Anmeldung fehlgeschlagen.'); return; }
    setNa({ name: '', email: '' });
    setOk(voll ? 'Kurs voll — auf die Warteliste gesetzt.' : 'Teilnehmer angemeldet.');
    await laden_();
  }

  async function anmStatus(a: Anmeldung, status: string) {
    const patch: Record<string, unknown> = { status };
    if (status === 'warteliste' && !a.warteliste_seit) patch.warteliste_seit = new Date().toISOString();
    if (status !== 'warteliste') patch.warteliste_seit = null;
    const { error } = await supabase.from('bildung_anmeldungen').update(patch).eq('id', a.id);
    if (!error) await laden_();
  }

  async function nachruecken(a: Anmeldung) {
    if (!aktiv) return;
    if (freiePlaetze(aktiv.plaetze, anmFor(aktiv.id)) <= 0) { setFehler('Kein Platz frei — erst einen Platz freigeben (z. B. Storno).'); return; }
    setFehler(null);
    const { error } = await supabase.from('bildung_anmeldungen').update({ status: 'angemeldet', warteliste_seit: null }).eq('id', a.id);
    if (!error) { setOk(`${a.name} ist nachgerückt.`); await laden_(); }
  }

  async function terminAnlegen() {
    if (!uid || !aktiv || !nt.datum) { setFehler('Bitte ein Datum angeben.'); return; }
    setFehler(null);
    const { error } = await supabase.from('bildung_termine').insert({
      owner_user_id: uid, kurs_id: aktiv.id, datum: nt.datum, von_uhr: nt.von_uhr || null, bis_uhr: nt.bis_uhr || null, thema: nt.thema.trim() || null,
    });
    if (error) { setFehler('Termin konnte nicht gespeichert werden.'); return; }
    setNt({ datum: heute(), von_uhr: '', bis_uhr: '', thema: '' }); await laden_();
  }

  async function anwesenheitToggle(terminId: string, anmeldungId: string, aktuell: boolean) {
    if (!uid) return;
    const { error } = await supabase.from('bildung_anwesenheit').upsert(
      { owner_user_id: uid, termin_id: terminId, anmeldung_id: anmeldungId, anwesend: !aktuell },
      { onConflict: 'termin_id,anmeldung_id' },
    );
    if (!error) await laden_();
  }

  async function zertifikatErstellen(a: Anmeldung) {
    if (!aktiv) return;
    setFehler(null); setOk(null);
    teilnahmebescheinigungPdf({
      teilnehmer: a.name,
      kurstitel: aktiv.titel,
      start: aktiv.start_am,
      ende: aktiv.ende_am,
      ort: aktiv.ort,
      dozent: aktiv.dozent,
      termineGesamt: aktivTermine.length,
      termineAnwesend: anwesendCount(a.id),
      ausstellungsdatum: heute(),
      aussteller,
    });
    if (!a.zertifikat_am) {
      const { error } = await supabase.from('bildung_anmeldungen').update({ zertifikat_am: heute() }).eq('id', a.id);
      if (!error) await laden_();
    }
    setOk(`Teilnahmebescheinigung für ${a.name} erstellt (PDF-Download).`);
  }

  async function rechnungErstellen(a: Anmeldung) {
    if (!aktiv) return;
    if (a.abgerechnet) { setFehler('Diese Anmeldung ist bereits berechnet.'); return; }
    if (!(Number(aktiv.preis) > 0)) { setFehler('Der Kurs hat keinen Preis hinterlegt.'); return; }
    setFehler(null); setOk(null);
    const positionen = [{ bezeichnung: `Kursgebühr: ${aktiv.titel}`, menge: 1, einheit: 'Teilnahme', einzelpreis: Number(aktiv.preis) || 0, mwst_satz: 19 }];
    try {
      const res = await fetch('/api/rechnung-aus-fachpaket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titel: `Kurs: ${aktiv.titel}`, empfaenger_name: a.name, empfaenger_email: a.email || undefined, positionen, quelle_tabelle: 'bildung_anmeldungen', quelle_ids: [a.id] }),
      });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Rechnung fehlgeschlagen.'); return; }
      setOk(`Rechnung für ${a.name} erstellt. Sie liegt unter „🧾 Rechnungen".`);
      await laden_();
    } catch { setFehler('Netzwerkfehler bei der Rechnungserstellung.'); }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🎓 Bildung & Kurse</h1>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.kpis}>
        <Kpi label="Kurse" value={String(kennzahlen.kurse)} accent={C.text} />
        <Kpi label="Teilnehmer" value={String(kennzahlen.teilnehmer)} accent={C.gold} />
        <Kpi label="Warteliste" value={String(kennzahlen.warteliste)} accent={kennzahlen.warteliste > 0 ? C.warn : C.green} />
        <Kpi label="Freie Plätze" value={String(kennzahlen.freiePlaetze)} accent={C.cyan} />
      </div>
      {!laden && <div style={{ marginTop: 12 }}><KiAuge modul="Kurse" regel={augeKurse(kennzahlen)} /></div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Kurs anlegen</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1, minWidth: 160 }} value={nk.titel} onChange={(e) => setNk({ ...nk, titel: e.target.value })} placeholder="Kurstitel" />
          <label style={styles.lab}>Art
            <select style={styles.inp} value={nk.art} onChange={(e) => setNk({ ...nk, art: e.target.value })}>
              <option value="einzeltermin">Einzeltermin</option>
              <option value="serie">Serie (mehrere Termine)</option>
            </select>
          </label>
          <label style={styles.lab}>Start<input type="date" style={styles.inp} value={nk.start_am} onChange={(e) => setNk({ ...nk, start_am: e.target.value })} /></label>
          {nk.art === 'serie' && <label style={styles.lab}>Ende<input type="date" style={styles.inp} value={nk.ende_am} onChange={(e) => setNk({ ...nk, ende_am: e.target.value })} /></label>}
          <input style={{ ...styles.inp, width: 130 }} value={nk.ort} onChange={(e) => setNk({ ...nk, ort: e.target.value })} placeholder="Ort" />
          <NurVoll>
            <input style={{ ...styles.inp, width: 140 }} value={nk.dozent} onChange={(e) => setNk({ ...nk, dozent: e.target.value })} placeholder="Dozent (optional)" />
          </NurVoll>
          <label style={styles.lab}>Plätze<input style={{ ...styles.inp, width: 66 }} value={nk.plaetze} onChange={(e) => setNk({ ...nk, plaetze: e.target.value })} inputMode="numeric" /></label>
          <label style={styles.lab}>Preis €<input style={{ ...styles.inp, width: 76 }} value={nk.preis} onChange={(e) => setNk({ ...nk, preis: e.target.value })} inputMode="decimal" /></label>
          <NurVoll>
            <label style={{ ...styles.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={nk.zertifikat_aktiv} onChange={(e) => setNk({ ...nk, zertifikat_aktiv: e.target.checked })} /> Zertifikat</label>
          </NurVoll>
          <button style={styles.primaer} onClick={kursAnlegen}>＋ Kurs</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.lvListe}>
            {kurse.map((k) => {
              const b = belegt(k.id); const voll = b >= k.plaetze; const wl = warteFor(k.id);
              return (
                <button key={k.id} style={{ ...styles.lvItem, ...(aktiv?.id === k.id ? styles.lvAktiv : {}) }} onClick={() => { setAktiv(k); setDetTab('teilnehmer'); setSelTermin(null); }}>
                  <div style={{ fontWeight: 700 }}>{k.titel} {k.art === 'serie' && <span style={styles.serieTag}>Serie</span>}</div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{d(k.start_am)}{k.ort ? ` · ${k.ort}` : ''}</div>
                  <div style={{ color: voll ? C.danger : C.green, fontSize: 12, marginTop: 3 }}>{b} / {k.plaetze} belegt{voll ? ' · ausgebucht' : ''}{wl > 0 ? ` · ${wl} Warteliste` : ''}</div>
                </button>
              );
            })}
            {!kurse.length && <p style={styles.dim}>Noch keine Kurse.</p>}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links einen Kurs wählen.</p> : (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{aktiv.titel}{aktiv.dozent ? ` · ${aktiv.dozent}` : ''}</div>
                  <div style={{ color: C.gold, fontWeight: 800 }}>{belegt(aktiv.id)} / {aktiv.plaetze} · {eur(belegt(aktiv.id) * aktiv.preis)}</div>
                  <FilialZuordnung
                    tabelle="bildung_kurse_standorte" fkSpalte="bildung_kurse_id"
                    recordId={aktiv.id} ownerUserId={uid ?? ''} standorte={standorte}
                    initial={zuord.filter((z) => z.bildung_kurse_id === aktiv.id).map((z) => z.standort_id)}
                    onChange={(ids) => setzeZuord(aktiv.id, ids)}
                  />
                </div>

                <div style={styles.tabs}>
                  <button style={{ ...styles.tab, ...(detTab === 'teilnehmer' ? styles.tabAn : {}) }} onClick={() => setDetTab('teilnehmer')}>👥 Teilnehmer</button>
                  <button style={{ ...styles.tab, ...(detTab === 'termine' ? styles.tabAn : {}) }} onClick={() => setDetTab('termine')}>📅 Termine & Anwesenheit</button>
                </div>

                {detTab === 'teilnehmer' && (
                  <>
                    <div style={styles.row}>
                      <input style={{ ...styles.inp, flex: 1, minWidth: 140 }} value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} placeholder="Name" />
                      <input style={{ ...styles.inp, width: 170 }} value={na.email} onChange={(e) => setNa({ ...na, email: e.target.value })} placeholder="E-Mail" />
                      <button style={styles.dazuBtn} onClick={anmelden}>＋ Anmelden</button>
                    </div>
                    {aktivAnm.filter((a) => a.status !== 'warteliste').map((a) => {
                      const anwCount = anwesendCount(a.id);
                      const zert = aktiv.zertifikat_aktiv && zertifikatBerechtigt(anwCount, aktivTermine.length);
                      return (
                        <div key={a.id} style={styles.posZeile}>
                          <span style={{ flex: 1 }}>{a.name}{a.email ? ` · ${a.email}` : ''}
                            {aktiv.art === 'serie' && aktivTermine.length > 0 && <span style={{ color: C.textDim, fontSize: 12 }}> · {anwCount}/{aktivTermine.length} anwesend</span>}
                            {zert && <span style={styles.zertTag}>🎓 zertifikatsreif</span>}
                            {a.zertifikat_am && <span style={styles.badgeOk}>✓ Zertifikat {d(a.zertifikat_am)}</span>}
                          </span>
                          <select style={styles.statusSelect} value={a.status} onChange={(e) => anmStatus(a, e.target.value)}>
                            {AN_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          {aktiv.zertifikat_aktiv && (a.status === 'teilgenommen' || zert) &&
                            <button style={styles.zertBtn} onClick={() => zertifikatErstellen(a)}>🎓 Bescheinigung</button>}
                          {a.abgerechnet
                            ? <span style={styles.badgeOk}>✓ berechnet</span>
                            : <button style={styles.rechnungBtnSmall} onClick={() => rechnungErstellen(a)}>→ Rechnung</button>}
                        </div>
                      );
                    })}
                    {aktivAnm.some((a) => a.status === 'warteliste') && (
                      <div style={styles.wlBox}>
                        <div style={{ fontWeight: 800, color: C.warn, marginBottom: 6 }}>⏳ Warteliste</div>
                        {aktivAnm.filter((a) => a.status === 'warteliste').map((a) => (
                          <div key={a.id} style={styles.posZeile}>
                            <span style={{ flex: 1 }}><b style={{ color: C.warn }}>#{wartelisteRang(aktivAnm, a.id)}</b> {a.name}{a.email ? ` · ${a.email}` : ''}</span>
                            <button style={styles.nachrueckBtn} onClick={() => nachruecken(a)}>↑ Nachrücken</button>
                            <button style={styles.rechnungBtnSmall} onClick={() => anmStatus(a, 'storniert')}>Absagen</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {!aktivAnm.length && <p style={styles.dim}>Noch keine Anmeldungen.</p>}
                  </>
                )}

                {detTab === 'termine' && (
                  <>
                    <div style={styles.row}>
                      <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nt.datum} onChange={(e) => setNt({ ...nt, datum: e.target.value })} /></label>
                      <label style={styles.lab}>von<input style={{ ...styles.inp, width: 84 }} value={nt.von_uhr} onChange={(e) => setNt({ ...nt, von_uhr: e.target.value })} placeholder="09:00" /></label>
                      <label style={styles.lab}>bis<input style={{ ...styles.inp, width: 84 }} value={nt.bis_uhr} onChange={(e) => setNt({ ...nt, bis_uhr: e.target.value })} placeholder="12:00" /></label>
                      <NurVoll>
                        <input style={{ ...styles.inp, flex: 1, minWidth: 120 }} value={nt.thema} onChange={(e) => setNt({ ...nt, thema: e.target.value })} placeholder="Thema (optional)" />
                      </NurVoll>
                      <button style={styles.dazuBtn} onClick={terminAnlegen}>＋ Termin</button>
                    </div>
                    {!aktivTermine.length ? <p style={styles.dim}>Noch keine Termine. Leg oben den ersten an.</p> : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                        {aktivTermine.map((t) => (
                          <button key={t.id} style={{ ...styles.terminChip, ...(selTermin === t.id ? styles.terminChipAn : {}) }} onClick={() => setSelTermin(selTermin === t.id ? null : t.id)}>
                            {d(t.datum)}{t.von_uhr ? ` ${t.von_uhr}` : ''}{t.thema ? ` · ${t.thema}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    {selTermin && (
                      <div style={styles.wlBox}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Anwesenheit — {d(aktivTermine.find((t) => t.id === selTermin)?.datum ?? null)}</div>
                        {aktivAnm.filter((a) => istBelegend(a.status)).map((a) => {
                          const anwesend = istAnwesend(selTermin, a.id);
                          return (
                            <label key={a.id} style={styles.anwZeile}>
                              <input type="checkbox" checked={anwesend} onChange={() => anwesenheitToggle(selTermin, a.id, anwesend)} />
                              <span style={{ color: anwesend ? C.text : C.textDim }}>{a.name}</span>
                            </label>
                          );
                        })}
                        {!aktivAnm.some((a) => istBelegend(a.status)) && <p style={styles.dim}>Keine belegten Teilnehmer.</p>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 12 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  serieTag: { fontSize: 10.5, background: 'rgba(0,229,255,0.14)', color: C.cyan, borderRadius: 999, padding: '1px 7px', fontWeight: 700, marginLeft: 4 },
  tabs: { display: 'flex', gap: 8, marginTop: 4 },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14, flexWrap: 'wrap' },
  wlBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 },
  anwZeile: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' },
  terminChip: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  terminChipAn: { borderColor: C.gold, color: C.gold },
  statusSelect: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit' },
  rechnungBtnSmall: { background: 'rgba(76,175,125,0.12)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  nachrueckBtn: { background: 'rgba(201,168,76,0.14)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  zertBtn: { background: 'rgba(0,229,255,0.1)', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  zertTag: { display: 'inline-block', border: `1px solid ${C.cyan}`, color: C.cyan, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, marginLeft: 6 },
  badgeOk: { display: 'inline-block', border: `1px solid ${C.green}`, color: C.green, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 6 },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
