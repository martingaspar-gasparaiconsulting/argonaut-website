'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/veranstaltungen/motorsport — T1 Trackday, Rennschule, Kartbahn (Paket 296)
//
// Übersicht der Motorsport-Events: kommende und vergangene Events mit Start-
// plätzen, Teilnehmern und Warteliste; neues Event anlegen. Die Event-Akte
// (Gruppen, Teilnehmer, Haftungsverzicht, Startfreigabe, Gäste, Laufzeiten)
// liegt unter /motorsport/[id], Teile mit Laufzeit unter /motorsport/teile.
// Unterpfad von /dashboard/veranstaltungen — erbt dessen Freigabe.
// Logik: lib/motorsport.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { MS_ARTEN, EVENT_STATUS, BELEGEND, eventPruefen, kennzahlen, label, zeitraumText, berlinTagVon, type EventForm } from '@/lib/motorsport';
import { euro } from '@/lib/geld';
import Leerzustand from '../../_components/Leerzustand';
import { C, s } from '../../werkstatt/zweirad/_teile/stil';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
type Ev = { id: string; titel: string; art: string; strecke: string | null; beginn: string; ende: string; status: string };
type Gr = { id: string; event_id: string; startplaetze: number };
type Tn = { id: string; event_id: string; status: string; startgeld_netto_cent: number; leih_netto_cent: number };

function morgen(stunde: number): string {
  const tag = berlinTagVon(new Date(Date.now() + 86_400_000).toISOString());
  return `${tag}T${String(stunde).padStart(2, '0')}:00`;
}
const LEER = (): EventForm => ({ titel: '', art: 'trackday', strecke: '', beginn: morgen(8), ende: morgen(18), status: 'offen', mindestalter: '18', fuehrerscheinPflicht: true, briefingPflicht: true, notiz: '' });
const ST_FARBE: Record<string, string> = { geplant: C.cyan, offen: C.ok, abgesagt: C.bad, beendet: C.dim };

export default function MotorsportPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [gruppen, setGruppen] = useState<Gr[]>([]);
  const [tns, setTns] = useState<Tn[]>([]);
  const [tab, setTab] = useState<'kommend' | 'alle'>('kommend');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [neu, setNeu] = useState<EventForm | null>(null);

  const lade = useCallback(async () => {
    const [e, g, t] = await Promise.all([
      supabase.from('ms_event').select('id, titel, art, strecke, beginn, ende, status').order('beginn', { ascending: false }).limit(1000),
      supabase.from('ms_gruppe').select('id, event_id, startplaetze').limit(5000),
      supabase.from('ms_teilnehmer').select('id, event_id, status, startgeld_netto_cent, leih_netto_cent').limit(10000),
    ]);
    if (e.error) setFehler('Motorsport ist noch nicht eingerichtet (SQL zu Paket 296 fehlt) oder Ihnen fehlt das Recht „Veranstaltungen".');
    setEvents((e.data as Ev[] | null) ?? []);
    setGruppen((g.data as Gr[] | null) ?? []);
    setTns((t.data as Tn[] | null) ?? []);
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const jetzt = Date.now();
  const zahlen = useMemo(() => kennzahlen(events, tns, jetzt), [events, tns, jetzt]);
  const liste = useMemo(() => {
    if (tab === 'alle') return events;
    return events.filter((e) => (e.status === 'geplant' || e.status === 'offen') && Date.parse(e.ende) >= jetzt)
      .sort((a, b) => a.beginn.localeCompare(b.beginn));
  }, [events, tab, jetzt]);

  async function anlegen() {
    if (!neu) return;
    const p = eventPruefen(neu, true);
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('ms_event').insert(p.zeile).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) {
      setFehler(/row-level|permission/i.test(error?.message ?? '') ? 'Dafür braucht es das Schreibrecht „Veranstaltungen".' : 'Event nicht angelegt.');
      return;
    }
    window.location.href = `/dashboard/veranstaltungen/motorsport/${data[0].id}`;
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/veranstaltungen" style={s.zurueck}>← Veranstaltungen</a>
      <h1 style={s.h1}>🏁 Trackday, Rennschule &amp; Kartbahn</h1>
      <p style={s.dim}>
        So geht&apos;s: Legen Sie ein Event mit Startgruppen und Startplätzen an. Teilnehmer melden Sie mit eigenem Fahrzeug oder einem
        Leihfahrzeug aus Ihrer Mietflotte an — die Datenbank sperrt volle Gruppen und doppelt vergebene Fahrzeuge. Den Haftungsverzicht
        (Ihr eigener Text) unterschreibt jeder Teilnehmer digital; die Startfreigabe gibt es erst mit Unterschrift, Alters- und Führerschein-Prüfung
        und Fahrerbesprechung. Sponsoren und Gäste akkreditieren Sie im selben Event, die Laufzeit der Teile Ihrer Leihfahrzeuge unter „🔧 Teile &amp; Laufzeiten".
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <button style={s.btnGold} onClick={() => { setNeu(LEER()); setFehler(null); }}>＋ Neues Event</button>
        <a href="/dashboard/veranstaltungen/motorsport/teile" style={{ ...s.btnAus, textDecoration: 'none' }}>🔧 Teile &amp; Laufzeiten</a>
        <a href="/dashboard/verleih/fahrzeuge" style={{ ...s.btnAus, textDecoration: 'none' }}>🚗 Mietflotte (Leihfahrzeuge)</a>
        <a href="/dashboard/signaturen" style={{ ...s.btnAus, textDecoration: 'none' }}>✍️ Signaturen</a>
      </div>

      {fehler && <div style={{ ...s.box, borderColor: C.bad, color: C.bad }}>{fehler}</div>}

      <div style={s.kacheln}>
        <div style={s.kachel}><span style={s.dim}>Kommende Events</span><span style={s.zahl}>{zahlen.kommend}</span></div>
        <div style={s.kachel}><span style={s.dim}>Startplätze belegt (kommend)</span><span style={s.zahl}>{zahlen.teilnehmer}</span></div>
        <div style={s.kachel}><span style={s.dim}>Warteliste (kommend)</span><span style={{ ...s.zahl, color: zahlen.warteliste ? C.warn : C.text }}>{zahlen.warteliste}</span></div>
        <div style={s.kachel}><span style={s.dim}>Startgeld + Leih (netto, alle)</span><span style={s.zahl}>{euro(zahlen.umsatzNetto / 100)}</span></div>
      </div>

      {neu && (
        <div style={s.box}>
          <h2 style={{ ...s.h2, marginTop: 0 }}>Neues Event</h2>
          <div style={s.raster}>
            <label style={s.feld}>Titel<input style={s.eingabe} value={neu.titel} onChange={(e) => setNeu({ ...neu, titel: e.target.value })} placeholder="z. B. Trackday Frühjahr" /></label>
            <label style={s.feld}>Art<select style={s.eingabe} value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value, mindestalter: e.target.value === 'kart' ? '8' : neu.mindestalter, fuehrerscheinPflicht: e.target.value === 'kart' ? false : neu.fuehrerscheinPflicht })}>
              {MS_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select></label>
            <label style={s.feld}>Strecke / Ort<input style={s.eingabe} value={neu.strecke} onChange={(e) => setNeu({ ...neu, strecke: e.target.value })} /></label>
            <label style={s.feld}>Beginn<input type="datetime-local" style={s.eingabe} value={neu.beginn} onChange={(e) => setNeu({ ...neu, beginn: e.target.value })} /></label>
            <label style={s.feld}>Ende<input type="datetime-local" style={s.eingabe} value={neu.ende} onChange={(e) => setNeu({ ...neu, ende: e.target.value })} /></label>
            <label style={s.feld}>Mindestalter (0 = keins)<input style={s.eingabe} inputMode="numeric" value={neu.mindestalter} onChange={(e) => setNeu({ ...neu, mindestalter: e.target.value })} /></label>
            <label style={s.feld}>Status<select style={s.eingabe} value={neu.status} onChange={(e) => setNeu({ ...neu, status: e.target.value })}>
              <option value="offen">Anmeldung offen</option><option value="geplant">geplant (noch keine Anmeldung)</option>
            </select></label>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 14 }}>
            <label><input type="checkbox" checked={neu.fuehrerscheinPflicht} onChange={(e) => setNeu({ ...neu, fuehrerscheinPflicht: e.target.checked })} /> Führerschein-Prüfung vor dem Start</label>
            <label><input type="checkbox" checked={neu.briefingPflicht} onChange={(e) => setNeu({ ...neu, briefingPflicht: e.target.checked })} /> Fahrerbesprechung Pflicht</label>
          </div>
          <label style={{ ...s.feld, marginTop: 10 }}>Notiz<input style={s.eingabe} value={neu.notiz} onChange={(e) => setNeu({ ...neu, notiz: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={s.btnGold} disabled={busy} onClick={() => void anlegen()}>💾 Anlegen</button>
            <button style={s.btnAus} onClick={() => setNeu(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, margin: '14px 0 4px' }}>
        <button style={tab === 'kommend' ? s.tabAn : s.tab} onClick={() => setTab('kommend')}>Kommend</button>
        <button style={tab === 'alle' ? s.tabAn : s.tab} onClick={() => setTab('alle')}>Alle Events</button>
      </div>

      {laden ? <p style={s.dim}>Lädt …</p> : events.length === 0 ? (
        <Leerzustand icon="🏁" titel="Noch keine Motorsport-Events"
          text="Legen Sie Ihren ersten Trackday, Ihre Rennschule oder Ihr Kart-Event an — mit Startgruppen, Startplätzen und digitalem Haftungsverzicht statt Excel und Papier."
          schritte={['Event anlegen', 'Startgruppen mit Plätzen und Startgeld', 'Text Ihres Haftungsverzichts hinterlegen', 'Teilnehmer anmelden und Verzicht senden']}
          aktionText="＋ Neues Event" onAktion={() => setNeu(LEER())} />
      ) : liste.length === 0 ? <p style={s.dim}>Keine kommenden Events — unter „Alle Events" sehen Sie die vergangenen.</p> : (
        <table style={s.tabelle}>
          <thead><tr><th style={s.th}>Event</th><th style={s.th}>Zeitraum</th><th style={s.th}>Strecke</th><th style={s.th}>Startplätze</th><th style={s.th}>Warteliste</th><th style={s.th}>Status</th></tr></thead>
          <tbody>
            {liste.map((e) => {
              const plaetze = gruppen.filter((g) => g.event_id === e.id).reduce((x, g) => x + g.startplaetze, 0);
              const eigene = tns.filter((t) => t.event_id === e.id);
              const bel = eigene.filter((t) => BELEGEND.includes(t.status)).length;
              const warte = eigene.filter((t) => t.status === 'warteliste').length;
              return (
                <tr key={e.id}>
                  <td style={s.td}><a href={`/dashboard/veranstaltungen/motorsport/${e.id}`} style={{ ...s.link, fontSize: 14, fontWeight: 700 }}>{e.titel}</a><div style={{ color: C.dim, fontSize: 12 }}>{label(MS_ARTEN, e.art)}</div></td>
                  <td style={s.td}>{zeitraumText(e.beginn, e.ende)}</td>
                  <td style={s.td}>{e.strecke || '—'}</td>
                  <td style={s.td}>{plaetze ? `${bel} / ${plaetze}` : '—'}</td>
                  <td style={s.td}>{warte || '—'}</td>
                  <td style={s.td}><span style={{ ...s.marke, color: ST_FARBE[e.status] ?? C.dim, borderColor: ST_FARBE[e.status] ?? C.border }}>{EVENT_STATUS[e.status] ?? e.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
