'use client';

// ============================================================
// ARGONAUT OS · Teil C · Singleton #4 · Veranstaltungs-Management
// Events (Kultur/Verein) + Anmeldungen/Tickets, Auslastung, Warteliste,
// Einnahmen. Reine Formeln aus lib/event (0 €, node-getestet).
// Pfad: app/dashboard/veranstaltungen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  EVENT_ARTEN, ANMELDE_STATUS, eventArtLabel, anmeldeStatusLabel,
  eventKennzahl, naechsterStatus, belegtePlaetze, betrag, zaehleEvents,
  type EventLite, type AnmeldungLite,
} from '@/lib/event';
import { augeEvents } from '@/lib/auge';
import { eventPdf } from '@/lib/eventPdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Veranstaltung = { id: string; titel: string; art: string; ort: string | null; beginn: string | null; ende: string | null; kapazitaet: number; preis: number; status: string; beschreibung: string | null };
type Anmeldung = { id: string; veranstaltung_id: string; name: string; email: string | null; plaetze: number; status: string; bezahlt: boolean; betrag: number; angemeldet_am: string | null };

const E_STATUS = [
  { v: 'geplant', l: 'geplant' }, { v: 'aktiv', l: 'aktiv (Anmeldung offen)' },
  { v: 'ausverkauft', l: 'ausverkauft' }, { v: 'abgesagt', l: 'abgesagt' }, { v: 'beendet', l: 'beendet' },
];
const E_ST_FARBE: Record<string, string> = { aktiv: C.green, ausverkauft: C.gold, abgesagt: C.danger, beendet: C.textDim, geplant: C.cyan };

function beginnStd() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T18:00`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDT(iso: string | null) { if (!iso) return '—'; const s = iso.slice(0, 16); const [d, t] = s.split('T'); if (!d) return iso; const p = d.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}${t ? ` ${t}` : ''}` : iso; }
function pct(n: number) { return `${(Number(n) * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function auslFarbe(a: number) { return a >= 0.9 ? C.gold : a >= 0.5 ? C.green : C.cyan; }

export default function VeranstaltungenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [events, setEvents] = useState<Veranstaltung[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<Anmeldung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [nEvent, setNEvent] = useState({ titel: '', art: 'konzert', ort: '', beginn: beginnStd(), ende: '', kapazitaet: '', preis: '', status: 'aktiv' });
  const [nAnm, setNAnm] = useState<{ veranstaltung_id: string; name: string; email: string; plaetze: string } | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [e, a] = await Promise.all([
        supabase.from('event_veranstaltung').select('*').order('beginn', { ascending: true }),
        supabase.from('event_anmeldung').select('*').order('angemeldet_am', { ascending: true }),
      ]);
      setEvents((e.data as Veranstaltung[]) ?? []);
      setAnmeldungen((a.data as Anmeldung[]) ?? []);
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const firma = [meta.firmenname, meta.firma, meta.unternehmen, meta.name].find((x) => typeof x === 'string' && (x as string).trim());
      setAussteller(typeof firma === 'string' ? firma : '');
      await laden_();
    })();
  }, [laden_]);

  const anmProEvent = useMemo(() => {
    const map = new Map<string, Anmeldung[]>();
    for (const a of anmeldungen) { const arr = map.get(a.veranstaltung_id) || []; arr.push(a); map.set(a.veranstaltung_id, arr); }
    return map;
  }, [anmeldungen]);
  const kennzahlen = useMemo(() => zaehleEvents(events as EventLite[], anmeldungen as (AnmeldungLite & { veranstaltung_id?: string })[]), [events, anmeldungen]);

  async function eventAnlegen() {
    if (!uid || !nEvent.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setBusy('event'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('event_veranstaltung').insert({
        owner_user_id: uid, titel: nEvent.titel.trim(), art: nEvent.art, ort: nEvent.ort.trim() || null,
        beginn: nEvent.beginn || null, ende: nEvent.ende || null, kapazitaet: Math.round(num(nEvent.kapazitaet)),
        preis: num(nEvent.preis), status: nEvent.status,
      });
      if (error) throw error;
      setNEvent({ titel: '', art: 'konzert', ort: '', beginn: beginnStd(), ende: '', kapazitaet: '', preis: '', status: 'aktiv' });
      setOk('Veranstaltung angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function anmeldungAnlegen() {
    if (!uid || !nAnm) return;
    if (!nAnm.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    const ev = events.find((e) => e.id === nAnm.veranstaltung_id);
    if (!ev) return;
    const plaetze = Math.max(1, Math.round(num(nAnm.plaetze) || 1));
    const belegt = belegtePlaetze((anmProEvent.get(ev.id) || []) as AnmeldungLite[]);
    const status = naechsterStatus(ev.kapazitaet, belegt, plaetze);
    setBusy('anm'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('event_anmeldung').insert({
        owner_user_id: uid, veranstaltung_id: ev.id, name: nAnm.name.trim(), email: nAnm.email.trim() || null,
        plaetze, status, bezahlt: false, betrag: betrag(ev.preis, plaetze), angemeldet_am: new Date().toISOString(),
      });
      if (error) throw error;
      setNAnm(null); setOk(status === 'warteliste' ? 'Kein Platz frei — auf Warteliste gesetzt.' : 'Anmeldung erfasst.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function anmStatus(a: Anmeldung, status: string) {
    setBusy(a.id); setFehler(null);
    try { await supabase.from('event_anmeldung').update({ status }).eq('id', a.id); await laden_(); }
    catch (err: unknown) { setFehler('Fehler: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }
  async function bezahltToggle(a: Anmeldung) {
    setBusy(a.id); setFehler(null);
    try { await supabase.from('event_anmeldung').update({ bezahlt: !a.bezahlt }).eq('id', a.id); await laden_(); }
    catch (err: unknown) { setFehler('Fehler: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }
  async function loesche(tabelle: string, id: string) {
    setBusy(id); setFehler(null);
    try { await supabase.from(tabelle).delete().eq('id', id); await laden_(); }
    catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function druckePdf(ev: Veranstaltung) {
    const abs = (anmProEvent.get(ev.id) || []).slice().sort((x, y) => (x.name || '').localeCompare(y.name || ''));
    const k = eventKennzahl(ev as EventLite, abs as AnmeldungLite[]);
    eventPdf({
      aussteller: aussteller || 'Mein Betrieb',
      titel: ev.titel, art: eventArtLabel(ev.art), ort: ev.ort || '', zeitpunkt: fmtDT(ev.beginn),
      kapazitaet: String(ev.kapazitaet || 0), belegt: String(k.belegt), auslastung: pct(k.auslastung),
      einnahmenBezahlt: eur(k.einnahmenBezahlt), einnahmenOffen: eur(k.einnahmenOffen),
      zeilen: abs.map((a) => ({ name: a.name, plaetze: String(a.plaetze), status: anmeldeStatusLabel(a.status), bezahlt: a.bezahlt ? 'ja' : '—', betrag: eur(a.betrag) })),
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Kultur &amp; Verein</div>
      <h1 style={styles.h1}>🎫 Veranstaltungen</h1>
      <p style={styles.sub}>Events mit Kapazität und Ticketpreis anlegen, Anmeldungen erfassen — die Anlage rechnet Auslastung, freie Plätze und Einnahmen und setzt bei vollem Haus automatisch auf Warteliste. Je Veranstaltung eine Teilnehmer-/Einlassliste als PDF.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* KPIs */}
      <div style={styles.kpis}>
        <Kpi label="Veranstaltungen" value={String(kennzahlen.aktive)} accent={C.text} sub={`${kennzahlen.veranstaltungen} gesamt`} />
        <Kpi label="Auslastung" value={pct(kennzahlen.auslastung)} accent={auslFarbe(kennzahlen.auslastung)} />
        <Kpi label="Belegt / Plätze" value={`${kennzahlen.belegtePlaetze} / ${kennzahlen.gesamtPlaetze}`} accent={C.cyan} />
        <Kpi label="Warteliste" value={String(kennzahlen.wartelisteGesamt)} accent={kennzahlen.wartelisteGesamt ? C.warn : C.green} />
        <Kpi label="Einnahmen bezahlt" value={eur(kennzahlen.einnahmenBezahlt)} accent={C.green} />
        <Kpi label="Einnahmen offen" value={eur(kennzahlen.einnahmenOffen)} accent={kennzahlen.einnahmenOffen ? C.warn : C.green} />
      </div>
      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Veranstaltungen" regel={augeEvents(kennzahlen)} /></div>}

      {/* Neue Veranstaltung */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>Neue Veranstaltung</div>
        <div style={styles.grid}>
          <label style={styles.lab}>Titel<input style={styles.inp} value={nEvent.titel} onChange={(e) => setNEvent({ ...nEvent, titel: e.target.value })} placeholder="z. B. Sommerkonzert" /></label>
          <label style={styles.lab}>Art
            <select style={styles.inp} value={nEvent.art} onChange={(e) => setNEvent({ ...nEvent, art: e.target.value })}>
              {EVENT_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Ort<input style={styles.inp} value={nEvent.ort} onChange={(e) => setNEvent({ ...nEvent, ort: e.target.value })} /></label>
          <label style={styles.lab}>Beginn<input type="datetime-local" style={styles.inp} value={nEvent.beginn} onChange={(e) => setNEvent({ ...nEvent, beginn: e.target.value })} /></label>
          <label style={styles.lab}>Ende<input type="datetime-local" style={styles.inp} value={nEvent.ende} onChange={(e) => setNEvent({ ...nEvent, ende: e.target.value })} /></label>
          <label style={styles.lab}>Kapazität (Plätze)<input style={styles.inp} inputMode="numeric" value={nEvent.kapazitaet} onChange={(e) => setNEvent({ ...nEvent, kapazitaet: e.target.value })} placeholder="0 = unbegrenzt" /></label>
          <label style={styles.lab}>Ticketpreis (€)<input style={styles.inp} inputMode="decimal" value={nEvent.preis} onChange={(e) => setNEvent({ ...nEvent, preis: e.target.value })} placeholder="0 = kostenlos" /></label>
          <label style={styles.lab}>Status
            <select style={styles.inp} value={nEvent.status} onChange={(e) => setNEvent({ ...nEvent, status: e.target.value })}>
              {E_STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </label>
        </div>
        <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'event' ? 0.6 : 1 }} disabled={busy === 'event'} onClick={eventAnlegen}>＋ Veranstaltung</button>
      </div>

      {/* Event-Karten */}
      {events.length === 0 ? (
        <div style={styles.hint}>Noch keine Veranstaltungen — leg die erste an.</div>
      ) : events.map((ev) => {
        const abs = (anmProEvent.get(ev.id) || []).slice().sort((x, y) => (x.angemeldet_am || '').localeCompare(y.angemeldet_am || ''));
        const k = eventKennzahl(ev as EventLite, abs as AnmeldungLite[]);
        return (
          <div key={ev.id} style={{ ...styles.card, marginTop: 14 }}>
            <div style={styles.buchKopf}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 'clamp(15px,1.3vw,20px)' }}>{ev.titel} <span style={{ color: C.textDim, fontWeight: 400 }}>· {eventArtLabel(ev.art)}</span></div>
                <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>{fmtDT(ev.beginn)}{ev.ort ? ` · ${ev.ort}` : ''}{ev.preis ? ` · ${eur(ev.preis)}/Ticket` : ' · kostenlos'}</div>
              </div>
              <span style={{ ...styles.statusPill, color: E_ST_FARBE[ev.status] || C.textDim, borderColor: (E_ST_FARBE[ev.status] || C.textDim) + '55' }}>{k.ausverkauft && ev.status === 'aktiv' ? 'ausverkauft' : (E_STATUS.find((s) => s.v === ev.status)?.l ?? ev.status)}</span>
            </div>

            <div style={styles.oeeRow}>
              <OeeTile label="Auslastung" value={pct(k.auslastung)} accent={auslFarbe(k.auslastung)} gross />
              <OeeTile label="Belegt / frei" value={`${k.belegt} / ${ev.kapazitaet ? k.frei : '∞'}`} />
              <OeeTile label="Warteliste" value={String(k.warteliste)} accent={k.warteliste ? C.warn : C.text} />
              <OeeTile label="Einnahmen" value={eur(k.einnahmenBezahlt)} />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              {nAnm?.veranstaltung_id === ev.id
                ? <button style={styles.mini} onClick={() => setNAnm(null)}>abbrechen</button>
                : <button style={styles.mini} onClick={() => setNAnm({ veranstaltung_id: ev.id, name: '', email: '', plaetze: '1' })}>＋ Anmeldung</button>}
              <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => druckePdf(ev)} disabled={!abs.length}>📄 Teilnehmerliste</button>
              <button style={{ ...styles.mini, color: C.danger, borderColor: `${C.danger}55` }} disabled={busy === ev.id} onClick={() => loesche('event_veranstaltung', ev.id)}>✕ Veranstaltung</button>
            </div>

            {nAnm && nAnm.veranstaltung_id === ev.id && (
              <div style={{ ...styles.subCard, marginBottom: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.6fr auto', gap: 8, alignItems: 'end' }}>
                  <label style={styles.lab}>Name<input style={styles.inp} value={nAnm.name} onChange={(e) => setNAnm({ ...nAnm, name: e.target.value })} /></label>
                  <label style={styles.lab}>E-Mail<input style={styles.inp} value={nAnm.email} onChange={(e) => setNAnm({ ...nAnm, email: e.target.value })} /></label>
                  <label style={styles.lab}>Plätze<input style={styles.inp} inputMode="numeric" value={nAnm.plaetze} onChange={(e) => setNAnm({ ...nAnm, plaetze: e.target.value })} /></label>
                  <button style={{ ...styles.primaer, opacity: busy === 'anm' ? 0.6 : 1 }} disabled={busy === 'anm'} onClick={anmeldungAnlegen}>＋</button>
                </div>
                {ev.kapazitaet > 0 && k.frei < Math.max(1, Math.round(num(nAnm.plaetze) || 1)) && (
                  <div style={{ marginTop: 6, color: C.warn, fontSize: 13 }}>⚠ Kein Platz frei — Anmeldung geht auf die Warteliste.</div>
                )}
              </div>
            )}

            {abs.length === 0 ? <div style={{ color: C.textDim, fontSize: 13 }}>Noch keine Anmeldungen.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Name</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Plätze</th>
                    <th style={styles.th}>Status</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Betrag</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>Bezahlt</th>
                    <th style={styles.th}></th>
                  </tr></thead>
                  <tbody>
                    {abs.map((a) => (
                      <tr key={a.id}>
                        <td style={styles.td}>{a.name}{a.email ? <span style={{ color: C.textDim }}> · {a.email}</span> : ''}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{a.plaetze}</td>
                        <td style={styles.td}>
                          <select style={styles.selMini} value={a.status} onChange={(e) => anmStatus(a, e.target.value)} disabled={busy === a.id}>
                            {ANMELDE_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{eur(a.betrag)}</td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <button style={{ ...styles.mini, color: a.bezahlt ? C.green : C.textDim, borderColor: (a.bezahlt ? C.green : C.textDim) + '55' }} disabled={busy === a.id} onClick={() => bezahltToggle(a)}>{a.bezahlt ? '✓ bezahlt' : 'offen'}</button>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}><button style={styles.miniX} disabled={busy === a.id} onClick={() => loesche('event_anmeldung', a.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div>{sub ? <div style={styles.kSub}>{sub}</div> : null}</div>);
}
function OeeTile({ label, value, gross, accent }: { label: string; value: string; gross?: boolean; accent?: string }) {
  return (<div style={{ ...styles.oeeTile, ...(gross ? { background: 'rgba(201,168,76,0.10)' } : {}) }}><div style={{ fontSize: gross ? 21 : 18, fontWeight: 800, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 900, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 21, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kSub: { color: C.textDim, fontSize: 11, marginTop: 3 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  subCard: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  buchKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  statusPill: { border: '1px solid', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  oeeRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 },
  oeeTile: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  selMini: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
