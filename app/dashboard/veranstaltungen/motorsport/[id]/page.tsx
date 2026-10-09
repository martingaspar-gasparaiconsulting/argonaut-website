'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/veranstaltungen/motorsport/[id] — Event-Akte (Paket 296, T1)
//
// Reiter: Teilnehmer (Startgruppen, Anmeldung, Warteliste, Verzicht, Prüf-
// Haken, Startfreigabe, Rechnung) · Haftungsverzicht (EIGENER Text des
// Betriebs, kein Mustertext; fest, sobald der erste Verzicht versendet ist) ·
// Sponsoren & Gäste (Akkreditierung) · Laufzeit der Leihfahrzeuge · Event.
// Alle Regeln prüft die Datenbank noch einmal (supabase-sql/p296-motorsport.sql).
// Logik: lib/motorsport.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MS_ARTEN, EVENT_STATUS, BELEGEND, eventWeiter, eventPruefen, verzichtPruefen, label, zeitraumText, berlinLokal, VERZICHT_MIN, type EventForm, type Teil } from '@/lib/motorsport';
import { C, s } from '../../../werkstatt/zweirad/_teile/stil';
import { supabase, fehlerText, type Ev, type Gr, type Tn, type Gast, type MietFz, type Einsatz, type SigStatus } from '../_teile/typen';
import Teilnehmer from '../_teile/Teilnehmer';
import Gaeste from '../_teile/Gaeste';
import Laufzeit from '../_teile/Laufzeit';

type Reiter = 'teilnehmer' | 'verzicht' | 'gaeste' | 'laufzeit' | 'event';
const ST_FARBE: Record<string, string> = { geplant: C.cyan, offen: C.ok, abgesagt: C.bad, beendet: C.dim };
const WEG_TEXT: Record<string, string> = { offen: '📣 Anmeldung öffnen', geplant: '⏸ Anmeldung schließen', abgesagt: '✖ Absagen', beendet: '🏁 Event beenden' };

function formAus(e: Ev): EventForm {
  return {
    titel: e.titel, art: e.art, strecke: e.strecke ?? '', beginn: berlinLokal(e.beginn), ende: berlinLokal(e.ende), mindestalter: String(e.mindestalter),
    fuehrerscheinPflicht: e.fuehrerschein_pflicht, briefingPflicht: e.briefing_pflicht, notiz: e.notiz ?? '',
  };
}

export default function MotorsportEventPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [ev, setEv] = useState<Ev | null>(null);
  const [gruppen, setGruppen] = useState<Gr[]>([]);
  const [tns, setTns] = useState<Tn[]>([]);
  const [gaeste, setGaeste] = useState<Gast[]>([]);
  const [flotte, setFlotte] = useState<MietFz[]>([]);
  const [einsaetze, setEinsaetze] = useState<Einsatz[]>([]);
  const [teile, setTeile] = useState<(Teil & { bezeichnung: string })[]>([]);
  const [sig, setSig] = useState<SigStatus>({});
  const [ku, setKu] = useState<boolean | null>(null);
  const [betriebName, setBetriebName] = useState('');
  const [reiter, setReiter] = useState<Reiter>('teilnehmer');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EventForm | null>(null);
  const [verzicht, setVerzicht] = useState('');

  const lade = useCallback(async () => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) { setFehler('Event nicht gefunden.'); setLaden(false); return; }
    const [e, g, t, ga, f, ei, te] = await Promise.all([
      supabase.from('ms_event').select('*').eq('id', id).maybeSingle(),
      supabase.from('ms_gruppe').select('*').eq('event_id', id).order('reihenfolge').order('name'),
      supabase.from('ms_teilnehmer').select('*').eq('event_id', id).order('erstellt_am').limit(2000),
      supabase.from('ms_gast').select('*').eq('event_id', id).order('erstellt_am').limit(2000),
      supabase.from('miet_fahrzeug').select('id, bezeichnung, kennzeichen, art, tagessatz_cent, aktiv').order('bezeichnung').limit(1000),
      supabase.from('ms_einsatz').select('*').order('datum', { ascending: false }).limit(5000),
      supabase.from('ms_teil').select('*').limit(5000),
    ]);
    if (e.error || !e.data) { setFehler(e.error ? 'Motorsport ist noch nicht eingerichtet (SQL zu Paket 296 fehlt) oder Ihnen fehlt das Recht „Veranstaltungen".' : 'Event nicht gefunden.'); setLaden(false); return; }
    const evNeu = e.data as Ev;
    const tnNeu = (t.data as Tn[] | null) ?? [];
    const gaNeu = (ga.data as Gast[] | null) ?? [];
    setEv(evNeu); setVerzicht(evNeu.verzicht_text ?? '');
    setGruppen((g.data as Gr[] | null) ?? []);
    setTns(tnNeu); setGaeste(gaNeu);
    setFlotte((f.data as MietFz[] | null) ?? []);
    setEinsaetze((ei.data as Einsatz[] | null) ?? []);
    setTeile((te.data as (Teil & { bezeichnung: string })[] | null) ?? []);
    const tokens = [...tnNeu.map((x) => x.verzicht_token), ...gaNeu.map((x) => x.verzicht_token)].filter((x): x is string => !!x);
    if (tokens.length) {
      const st = await supabase.from('signatur_anfragen').select('token, status').in('token', tokens);
      setSig(Object.fromEntries(((st.data as { token: string; status: string }[] | null) ?? []).map((x) => [x.token, x.status])));
    } else setSig({});
    setLaden(false);
  }, [id]);

  useEffect(() => {
    void lade();
    (async () => {
      try {
        const r = await fetch('/api/betrieb-firmendaten', { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { firma?: Record<string, unknown> };
        setBetriebName(typeof j.firma?.firma_name === 'string' ? j.firma.firma_name : '');
        setKu(j.firma?.kleinunternehmer === true);
      } catch { /* ohne Firmendaten weiter */ }
    })();
  }, [lade]);

  function meldung(o: string | null, f: string | null) { setOk(o); setFehler(f); }

  async function eventAendern(felder: Record<string, unknown>, okText: string): Promise<boolean> {
    if (!ev) return false;
    setBusy(true); meldung(null, null);
    const { data, error } = await supabase.from('ms_event').update(felder).eq('id', ev.id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { meldung(null, fehlerText(error, 'Nicht gespeichert.')); return false; }
    meldung(okText, null); await lade(); return true;
  }
  async function verzichtSpeichern() {
    const p = verzichtPruefen(verzicht);
    if (!p.ok) { meldung(null, p.grund); return; }
    await eventAendern({ verzicht_text: p.text }, 'Text des Haftungsverzichts gespeichert.');
  }
  async function kopfSpeichern() {
    if (!form) return;
    const p = eventPruefen(form, false);
    if (!p.ok) { meldung(null, p.grund); return; }
    if (await eventAendern(p.zeile, 'Event gespeichert.')) setForm(null);
  }
  async function loeschen() {
    if (!ev || !window.confirm(`Event „${ev.titel}" löschen?`)) return;
    setBusy(true);
    const { data, error } = await supabase.from('ms_event').delete().eq('id', ev.id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { meldung(null, fehlerText(error, 'Nicht gelöscht — nur der Chef löscht, und nur Events ohne Teilnehmer.')); return; }
    window.location.href = '/dashboard/veranstaltungen/motorsport';
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lädt …</p></div>;
  if (!ev) return <div style={s.page}><a href="/dashboard/veranstaltungen/motorsport" style={s.zurueck}>← Motorsport</a><p style={{ ...s.dim, color: C.bad }}>{fehler}</p></div>;

  const aktiv = tns.filter((t) => BELEGEND.includes(t.status));
  const plaetze = gruppen.reduce((x, g) => x + g.startplaetze, 0);
  const unterschrieben = aktiv.filter((t) => t.verzicht_token && sig[t.verzicht_token] === 'signiert').length;
  const freigegeben = tns.filter((t) => t.status === 'freigegeben' || t.status === 'teilgenommen').length;

  return (
    <div style={s.page}>
      <a href="/dashboard/veranstaltungen/motorsport" style={s.zurueck}>← Motorsport</a>
      <h1 style={s.h1}>🏁 {ev.titel}</h1>
      <p style={s.dim}>
        {label(MS_ARTEN, ev.art)} · {zeitraumText(ev.beginn, ev.ende)}{ev.strecke ? ` · ${ev.strecke}` : ''} ·{' '}
        <span style={{ ...s.marke, color: ST_FARBE[ev.status], borderColor: ST_FARBE[ev.status] }}>{EVENT_STATUS[ev.status]}</span>
      </p>
      <p style={s.dim}>
        So geht&apos;s: Startgruppen anlegen, Teilnehmer anmelden, Haftungsverzicht zur Unterschrift senden, vor dem Start Alter, Führerschein und
        Fahrerbesprechung abhaken — die Startfreigabe gibt die Datenbank erst, wenn alles erledigt und der Verzicht unterschrieben ist.
      </p>

      <div style={s.kacheln}>
        <div style={s.kachel}><span style={s.dim}>Startplätze belegt</span><span style={s.zahl}>{aktiv.length}{plaetze ? ` / ${plaetze}` : ''}</span></div>
        <div style={s.kachel}><span style={s.dim}>Warteliste</span><span style={s.zahl}>{tns.filter((t) => t.status === 'warteliste').length}</span></div>
        <div style={s.kachel}><span style={s.dim}>Verzicht unterschrieben</span><span style={s.zahl}>{unterschrieben} / {aktiv.length}</span></div>
        <div style={s.kachel}><span style={s.dim}>Startfreigaben</span><span style={{ ...s.zahl, color: C.ok }}>{freigegeben}</span></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        {eventWeiter(ev.status).map((w) => (
          <button key={w} style={w === 'abgesagt' ? { ...s.btnAus, color: C.bad } : s.btnAus} disabled={busy}
            onClick={() => { if ((w === 'abgesagt' || w === 'beendet') && !window.confirm(`Event wirklich auf „${EVENT_STATUS[w]}" setzen? Das lässt sich nicht zurücknehmen.`)) return; void eventAendern({ status: w }, `Event: ${EVENT_STATUS[w]}.`); }}>
            {WEG_TEXT[w] ?? w}
          </button>
        ))}
        <a href={`/dashboard/veranstaltungen/motorsport/${ev.id}/starterliste`} style={{ ...s.btnAus, textDecoration: 'none' }}>🖨️ Starterliste &amp; Gästeliste</a>
      </div>

      {fehler && <div style={{ ...s.box, borderColor: C.bad, color: C.bad }}>{fehler}</div>}
      {ok && <div style={{ ...s.box, borderColor: C.ok, color: C.ok, wordBreak: 'break-word' }}>{ok}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 4px' }}>
        {([['teilnehmer', '🏎️ Teilnehmer'], ['verzicht', '📜 Haftungsverzicht'], ['gaeste', '🤝 Sponsoren & Gäste'], ['laufzeit', '⏱️ Laufzeit'], ['event', '⚙️ Event']] as [Reiter, string][]).map(([k, t]) => (
          <button key={k} style={reiter === k ? s.tabAn : s.tab} onClick={() => { setReiter(k); meldung(null, null); }}>{t}</button>
        ))}
      </div>

      {reiter === 'teilnehmer' && <Teilnehmer ev={ev} gruppen={gruppen} tns={tns} flotte={flotte} sig={sig} ku={ku} betriebName={betriebName} lade={lade} meldung={meldung} />}

      {reiter === 'verzicht' && (
        <div>
          <h2 style={s.h2}>Haftungsverzicht</h2>
          <p style={s.dim}>
            Tragen Sie hier Ihren eigenen, von Ihrem Anwalt geprüften Text ein. ARGONAUT liefert bewusst keinen Mustertext. Jeder Teilnehmer
            (bei Minderjährigen die sorgeberechtigte Person) unterschreibt ihn digital über einen Link — Event, Person, Startnummer und Fahrzeug
            stehen automatisch darüber. Sobald der erste Verzicht versendet ist, bleibt der Text für dieses Event fest, damit alle dasselbe unterschreiben.
          </p>
          <textarea style={{ ...s.eingabe, width: '100%', minHeight: 280, lineHeight: 1.5 }} value={verzicht} disabled={ev.verzicht_fest || busy}
            onChange={(e) => setVerzicht(e.target.value)} placeholder="Ihr Text …" />
          <p style={s.dim}>{verzicht.trim().length.toLocaleString('de-DE')} Zeichen (mindestens {VERZICHT_MIN})</p>
          {ev.verzicht_fest ? <p style={{ ...s.dim, color: C.warn }}>🔒 Der Text ist fest — es wurden bereits Verzichte zur Unterschrift versendet.</p> : (
            <button style={s.btnGold} disabled={busy} onClick={() => void verzichtSpeichern()}>💾 Text speichern</button>
          )}
        </div>
      )}

      {reiter === 'gaeste' && <Gaeste ev={ev} gaeste={gaeste} sig={sig} betriebName={betriebName} lade={lade} meldung={meldung} />}
      {reiter === 'laufzeit' && <Laufzeit ev={ev} tns={tns} flotte={flotte} einsaetze={einsaetze} teile={teile} lade={lade} meldung={meldung} />}

      {reiter === 'event' && (
        <div>
          <h2 style={s.h2}>Event</h2>
          {!form ? (
            <>
              <p style={s.dim}>Mindestalter: {ev.mindestalter || 'keins'} · Führerschein-Prüfung: {ev.fuehrerschein_pflicht ? 'ja' : 'nein'} · Fahrerbesprechung Pflicht: {ev.briefing_pflicht ? 'ja' : 'nein'}{ev.notiz ? ` · ${ev.notiz}` : ''}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {ev.status !== 'abgesagt' && ev.status !== 'beendet' && <button style={s.btnAus} onClick={() => setForm(formAus(ev))}>✎ Ändern</button>}
                <button style={{ ...s.btnAus, color: C.bad }} disabled={busy} onClick={() => void loeschen()}>Löschen</button>
              </div>
            </>
          ) : (
            <div style={s.box}>
              <div style={s.raster}>
                <label style={s.feld}>Titel<input style={s.eingabe} value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} /></label>
                <label style={s.feld}>Art<select style={s.eingabe} value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>{MS_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
                <label style={s.feld}>Strecke / Ort<input style={s.eingabe} value={form.strecke} onChange={(e) => setForm({ ...form, strecke: e.target.value })} /></label>
                <label style={s.feld}>Beginn<input type="datetime-local" style={s.eingabe} value={form.beginn} onChange={(e) => setForm({ ...form, beginn: e.target.value })} /></label>
                <label style={s.feld}>Ende<input type="datetime-local" style={s.eingabe} value={form.ende} onChange={(e) => setForm({ ...form, ende: e.target.value })} /></label>
                <label style={s.feld}>Mindestalter (0 = keins)<input style={s.eingabe} inputMode="numeric" value={form.mindestalter} onChange={(e) => setForm({ ...form, mindestalter: e.target.value })} /></label>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 14 }}>
                <label><input type="checkbox" checked={form.fuehrerscheinPflicht} onChange={(e) => setForm({ ...form, fuehrerscheinPflicht: e.target.checked })} /> Führerschein-Prüfung vor dem Start</label>
                <label><input type="checkbox" checked={form.briefingPflicht} onChange={(e) => setForm({ ...form, briefingPflicht: e.target.checked })} /> Fahrerbesprechung Pflicht</label>
              </div>
              <label style={{ ...s.feld, marginTop: 10 }}>Notiz<input style={s.eingabe} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={s.btnGold} disabled={busy} onClick={() => void kopfSpeichern()}>💾 Speichern</button>
                <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
