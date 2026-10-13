'use client';

// ============================================================================
// ARGONAUT OS · Paket 360 (13.10.2026) · VK4 Anruf-Sitzung
// Eine Person nach der anderen: Nummer antippen, Ergebnis wählen, weiter.
// Warteschlange: fällige Rückrufe, neue Leads, erneute Versuche und Kontakte
// aus einer gespeicherten Gruppe (Marketing → Gruppen). Jeder Anruf wird mit
// Ergebnis gespeichert (vk_anruf); die Datenbank rechnet Versuche und den
// nächsten Versuch und zählt im Akquise-Cockpit mit.
// Logik: lib/anrufSitzung.ts · SQL: supabase-sql/p360-anruf-sitzung.sql
// ============================================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import {
  ERGEBNISSE, GRUND_TEXT, MAX_VERSUCHE, warteschlange, rueckrufVorschlaege, lokalZuIso, anrufPruefen, anrufZeile,
  tagesZahlen, seitText, ergebnis as ergebnisInfo, zeitDe, berlinTag, uhrDe,
  ersteReaktion, reaktionsZahlen, personenZahlen, ergebnisVerteilung, dauerText, type AnrufZeile,
  type Eintrag, type LeadRoh, type KontaktRoh, type AnrufKurz, type Quellen, type ErgebnisKey,
} from '@/lib/anrufSitzung';
import { filtere, type Segment } from '@/lib/segmente';
import { ladeVerkaufsteam, type TeamStand } from '@/lib/verkaufsteamLaden';
import Leerzustand from '../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)', rot: '#E06666', warn: '#E0A24C',
};

const LEAD_SPALTEN = 'id, name, telefon, email, status, stufe, quelle, created_at, nachricht, dienstleistung, setter_user_id, closer_user_id, anruf_versuche, letzter_anruf_ergebnis, letzter_anruf_am, naechster_anruf_am, erster_anruf_am';
const KONTAKT_SPALTEN = 'id, vorname, nachname, firma, email, telefon, mobil, ort, plz, land, position, status, quelle, kunde_seit, letzter_kontakt_am, betreuungs_intervall_tage, werbe_einwilligung, werbe_widerspruch_am';
type Gruppe = Segment & { id: string; name: string };
type Gespeichert = { id: string; name: string; ergebnis: string; zeit: string };

async function alleSeiten<T>(abfrage: (von: number, bis: number) => PromiseLike<{ data: unknown; error: unknown }>, max = 5000): Promise<{ daten: T[]; fehler: boolean }> {
  const daten: T[] = [];
  for (let von = 0; von < max; von += 1000) {
    const { data, error } = await abfrage(von, von + 999);
    if (error) return { daten, fehler: true };
    const teil = (data as T[]) ?? [];
    daten.push(...teil);
    if (teil.length < 1000) break;
  }
  return { daten, fehler: false };
}

export default function AnrufSitzungSeite() {
  const [stand, setStand] = useState<TeamStand | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRoh[]>([]);
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [kontakte, setKontakte] = useState<KontaktRoh[]>([]);
  const [anrufeK, setAnrufeK] = useState<AnrufKurz[]>([]);
  const [heuteAnrufe, setHeuteAnrufe] = useState<{ ergebnis: string }[]>([]);
  const [bereit, setBereit] = useState(true);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [quellen, setQuellen] = useState<Quellen>({ rueckrufe: true, neue: true, offene: true, liste: false });
  const [gruppeId, setGruppeId] = useState('');
  const [nurMeine, setNurMeine] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [uebersprungen, setUebersprungen] = useState<Set<string>>(new Set());
  const [jetzt, setJetzt] = useState(() => new Date());

  const [wahl, setWahl] = useState<ErgebnisKey | null>(null);
  const [rueckruf, setRueckruf] = useState<string | null>(null);
  const [rueckLokal, setRueckLokal] = useState('');
  const [notiz, setNotiz] = useState('');
  const [busy, setBusy] = useState(false);
  const [zuletzt, setZuletzt] = useState<Gespeichert | null>(null);
  const [erledigt, setErledigt] = useState(0);
  const [auswertungAuf, setAuswertungAuf] = useState(false);
  const [anrufe30, setAnrufe30] = useState<AnrufZeile[] | null>(null);

  const ich = stand?.ich ?? null;

  const laden_ = useCallback(async (st: TeamStand | null) => {
    setLaden(true); setFehler(null);
    try {
      const l = await alleSeiten<LeadRoh>((von, bis) => supabase.from('leads').select(LEAD_SPALTEN).order('created_at', { ascending: false }).range(von, bis));
      // Fehlen die Spalten aus SQL 360, kann die Sitzung nicht arbeiten.
      setBereit(!l.fehler);
      setLeads(l.daten);
      const g = await supabase.from('marketing_segment').select('id, name, quelle, verknuepfung, regeln').eq('quelle', 'kontakte').order('name');
      setGruppen(g.error ? [] : ((g.data as Gruppe[]) ?? []));
      const seit = new Date(Date.now() - 180 * 86_400_000).toISOString();
      const ak = await supabase.from('vk_anruf').select('kontakt_id, ergebnis, rueckruf_am, erstellt_am').not('kontakt_id', 'is', null).gte('erstellt_am', seit).limit(5000);
      setAnrufeK(ak.error ? [] : ((ak.data as AnrufKurz[]) ?? []));
      if (st?.ich) {
        const tag = berlinTag(new Date().toISOString());
        const h = await supabase.from('vk_anruf').select('ergebnis, erstellt_am').eq('user_id', st.ich).gte('erstellt_am', new Date(Date.now() - 36 * 3_600_000).toISOString()).limit(2000);
        const rows = h.error ? [] : ((h.data as { ergebnis: string; erstellt_am: string }[]) ?? []);
        setHeuteAnrufe(rows.filter((r) => berlinTag(r.erstellt_am) === tag));
      }
    } catch (e) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); setJetzt(new Date()); }
  }, []);

  useEffect(() => {
    (async () => {
      const st = await ladeVerkaufsteam(supabase);
      setStand(st);
      if (!st.ich) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setBetrieb(st.chefId ?? st.ich);
      await laden_(st);
    })();
  }, [laden_]);

  // Kontakte erst laden, wenn eine Gruppe gewählt ist.
  useEffect(() => {
    if (!gruppeId) { setKontakte([]); return; }
    (async () => {
      const k = await alleSeiten<KontaktRoh>((von, bis) => supabase.from('kontakte').select(KONTAKT_SPALTEN).range(von, bis));
      const g = gruppen.find((x) => x.id === gruppeId);
      setKontakte(g ? (filtere(k.daten, g, berlinTag(new Date().toISOString())) as KontaktRoh[]) : []);
    })();
  }, [gruppeId, gruppen]);

  const liste = useMemo(() => warteschlange({
    leads, kontakte: quellen.liste ? kontakte : [], anrufeKontakte: anrufeK, jetzt,
    quellen, ich, nurMeine,
  }).filter((x) => !uebersprungen.has(`${x.typ}:${x.id}`)), [leads, kontakte, anrufeK, jetzt, quellen, ich, nurMeine, uebersprungen]);
  const aktuell: Eintrag | null = laeuft ? liste[0] ?? null : null;
  const heute = tagesZahlen(heuteAnrufe);
  const zaehl = useMemo(() => {
    const z = { rueckruf: 0, neu: 0, offen: 0, liste: 0 };
    for (const x of liste) z[x.grund]++;
    return z;
  }, [liste]);

  // Paket 361: Auswertung 30 Tage — nur Geschäftsleitung und Teamleitung.
  const darfAuswertung = !!stand && (stand.istChef || stand.team.some((p) => p.user_id === stand.ich && p.funktion === 'teamleitung'));
  async function auswertungLaden() {
    setAuswertungAuf((v) => !v);
    if (anrufe30) return;
    const seit = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data } = await supabase.from('vk_anruf').select('user_id, anrufer_name, ergebnis, erstellt_am').gte('erstellt_am', seit).limit(10000);
    setAnrufe30(((data as AnrufZeile[]) ?? []));
  }
  const seit30 = jetzt.getTime() - 30 * 86_400_000;
  const reaktion30 = useMemo(() => reaktionsZahlen(leads.filter((l) => l.created_at && new Date(l.created_at).getTime() >= seit30), jetzt), [leads, jetzt, seit30]);
  const namen = useMemo(() => new Map((stand?.team ?? []).map((p) => [p.user_id, p.name] as [string, string])), [stand]);

  function neuStart() { setWahl(null); setRueckruf(null); setRueckLokal(''); setNotiz(''); }

  async function speichern(erg: ErgebnisKey, rueckIso: string | null) {
    if (!aktuell || !betrieb || !ich) return;
    const f = anrufPruefen(erg, rueckIso, notiz, new Date());
    if (f.length) { setFehler(f.join(' ')); return; }
    setBusy(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('vk_anruf').insert(anrufZeile(aktuell, erg, rueckIso, notiz, betrieb, ich)).select('id').single();
      if (error || !data) {
        setFehler(error && /Lead|Kontakt|Rückruf|Betrieb/.test(error.message) ? error.message : 'Nicht gespeichert — fehlt SQL Paket 360? ' + (error?.message ?? ''));
        return;
      }
      setZuletzt({ id: (data as { id: string }).id, name: aktuell.name, ergebnis: erg, zeit: new Date().toISOString() });
      setErledigt((n) => n + 1);
      setHeuteAnrufe((h) => [...h, { ergebnis: erg }]);
      neuStart();
      await laden_(stand);
    } finally { setBusy(false); }
  }

  function ergebnisKlick(k: ErgebnisKey) {
    if (k === 'rueckruf') { setWahl('rueckruf'); return; }
    void speichern(k, null);
  }

  async function zuruecknehmen() {
    if (!zuletzt) return;
    setBusy(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('vk_anruf').delete().eq('id', zuletzt.id).select('id');
      if (error || !data || (data as unknown[]).length === 0) { setFehler(error?.message ?? 'Zurücknehmen geht nur 15 Minuten lang.'); return; }
      setZuletzt(null);
      setErledigt((n) => Math.max(0, n - 1));
      setHeuteAnrufe((h) => h.slice(0, -1));
      await laden_(stand);
    } finally { setBusy(false); }
  }

  function ueberspringen() {
    if (!aktuell) return;
    setUebersprungen((s) => new Set(s).add(`${aktuell.typ}:${aktuell.id}`));
    neuStart();
  }

  if (laden && !leads.length) return <div style={st.seite}><div style={st.dim}>Lädt …</div></div>;

  return (
    <div style={st.seite}>
      <div style={st.eyebrow}>ARGONAUT OS · Vertrieb</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h1 style={st.h1}>📞 Anruf-Sitzung</h1>
          <p style={st.sub}>Eine Person nach der anderen: Nummer antippen, Ergebnis wählen — die nächste kommt von selbst. Rückrufe kommen zur vereinbarten Zeit zurück, nicht Erreichte nach 2 Stunden, ab dem 3. Versuch am nächsten Tag. Nach {MAX_VERSUCHE} Versuchen fällt eine Person aus der Liste.</p>
        </div>
        <Link href="/dashboard/akquise" style={st.knopfLink}>← Akquise-Cockpit</Link>
      </div>

      {fehler && <div style={st.err}>{fehler}</div>}
      {!bereit && <div style={st.err}>Die Anruf-Sitzung braucht SQL Paket 360 (neue Spalten an den Leads). Bitte zuerst einspielen.</div>}

      <div style={st.kpis}>
        <Kpi wert={String(heute.anrufe)} label="Anrufe heute" />
        <Kpi wert={String(heute.erreicht)} label="Erreicht" sub={heute.anrufe ? `${heute.quote} %` : undefined} farbe={C.cyan} />
        <Kpi wert={String(heute.termine)} label="Termine" farbe={C.green} />
        <Kpi wert={String(liste.length)} label="In der Liste" farbe={C.gold} sub={`${zaehl.rueckruf} Rückrufe · ${zaehl.neu} neu`} />
        <Kpi wert={reaktion30.median == null ? '—' : dauerText(reaktion30.median)} label="Bis zum 1. Anruf (Median)" farbe={reaktion30.median == null ? C.dim : reaktion30.median <= 5 ? C.green : reaktion30.median <= 60 ? C.warn : C.rot}
          sub={reaktion30.angerufen ? `${reaktion30.unter5} % in 5 Min. · ${reaktion30.wartend} warten` : (reaktion30.wartend ? `${reaktion30.wartend} warten` : 'letzte 30 Tage')} />
      </div>

      {darfAuswertung && (
        <div style={{ marginBottom: 14 }}>
          <button style={st.knopf} onClick={() => void auswertungLaden()}>{auswertungAuf ? 'Auswertung schließen' : '📊 Auswertung 30 Tage'}</button>
          {auswertungAuf && (
            <div style={{ ...st.karte, marginTop: 10 }}>
              <div style={st.titel}>Anrufe je Person (letzte 30 Tage)</div>
              {!anrufe30 ? <div style={st.dim}>Lädt …</div> : anrufe30.length === 0 ? <div style={st.dim}>Noch keine Anrufe in den letzten 30 Tagen.</div> : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead><tr>{['Person', 'Anrufe', 'Erreicht', 'Quote', 'Termine', 'Anrufe je Termin'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
                      <tbody>{personenZahlen(anrufe30, namen).map((z) => (
                        <tr key={z.user_id}><td style={st.td}>{z.name}</td><td style={st.tdz}>{z.anrufe}</td><td style={st.tdz}>{z.erreicht}</td><td style={st.tdz}>{z.quote} %</td><td style={st.tdz}>{z.termine}</td><td style={st.tdz}>{z.jeTermin ?? '—'}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div style={{ ...st.titel, marginTop: 14 }}>Ergebnisse</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {ergebnisVerteilung(anrufe30).map((e) => {
                      const max = Math.max(...ergebnisVerteilung(anrufe30).map((x) => x.anzahl));
                      return (
                        <div key={e.key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 48px', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                          <span style={{ color: e.farbe }}>{e.name}</span>
                          <div style={{ background: 'rgba(143,163,190,0.12)', borderRadius: 6, height: 12 }}><div style={{ width: `${Math.round((e.anzahl / max) * 100)}%`, background: e.farbe, height: '100%', borderRadius: 6 }} /></div>
                          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.anzahl}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ ...st.dim, marginTop: 12 }}>Die Zahlen dienen der Planung im Team (wie viele Anrufe kostet ein Termin), nicht der Leistungskontrolle einzelner Personen.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!laeuft && (
        <div style={st.karte}>
          <div style={st.titel}>Wen heute anrufen?</div>
          <div style={st.reihe}>
            <Haken an={quellen.rueckrufe} text={`🔁 Fällige Rückrufe (${zaehl.rueckruf})`} onClick={() => setQuellen({ ...quellen, rueckrufe: !quellen.rueckrufe })} />
            <Haken an={quellen.neue} text={`🆕 Neue Leads, noch nie angerufen (${zaehl.neu})`} onClick={() => setQuellen({ ...quellen, neue: !quellen.neue })} />
            <Haken an={quellen.offene} text={`↻ Erneute Versuche (${zaehl.offen})`} onClick={() => setQuellen({ ...quellen, offene: !quellen.offene })} />
            {(stand?.team.length ?? 0) > 1 && !stand?.frei && <Haken an={nurMeine} text="👤 Nur Leads, für die ich zuständig bin" onClick={() => setNurMeine(!nurMeine)} />}
          </div>
          <div style={{ ...st.reihe, marginTop: 10 }}>
            <Haken an={quellen.liste} text="📋 Kontakte aus einer Gruppe" onClick={() => setQuellen({ ...quellen, liste: !quellen.liste })} />
            {quellen.liste && (
              <select style={st.sel} value={gruppeId} onChange={(e) => setGruppeId(e.target.value)}>
                <option value="">— Gruppe wählen —</option>
                {gruppen.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            {quellen.liste && gruppen.length === 0 && <span style={st.dim}>Noch keine Gruppe — <Link href="/dashboard/marketing/segmente" style={{ color: C.gold }}>Marketing → Gruppen</Link></span>}
            {quellen.liste && gruppeId && <span style={st.dim}>{zaehl.liste} Kontakte mit Nummer</span>}
          </div>
          {quellen.liste && (
            <div style={st.warn}>
              ⚠ Kontakte aus einer Gruppe haben nicht selbst angefragt. Werbeanrufe bei Verbrauchern sind nur mit vorheriger ausdrücklicher Einwilligung erlaubt,
              bei Firmen nur bei mutmaßlichem Interesse. Kontakte mit Werbe-Widerspruch sind ausgeblendet. Eine Ampel je Anruf folgt mit dem Paket „Anruf-Sperrliste".
            </div>
          )}
          <button style={{ ...st.primaer, marginTop: 14, opacity: liste.length && bereit ? 1 : 0.5 }} disabled={!liste.length || !bereit}
            onClick={() => { setLaeuft(true); setErledigt(0); setUebersprungen(new Set()); neuStart(); }}>
            ▶ Sitzung starten ({liste.length})
          </button>
        </div>
      )}

      {laeuft && !aktuell && (
        <Leerzustand icon="✅" titel="Liste abgearbeitet" text={`${erledigt} Anrufe in dieser Sitzung. Rückrufe und neue Leads kommen von selbst wieder in die Liste.`}
          schritte={['Später erneut öffnen — fällige Rückrufe stehen dann oben', 'Ergebnisse stehen im Akquise-Cockpit']} aktionText="Sitzung beenden" onAktion={() => setLaeuft(false)} />
      )}

      {aktuell && (
        <div style={st.karte}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ ...st.badge, color: aktuell.grund === 'rueckruf' ? C.cyan : aktuell.grund === 'neu' ? C.green : C.gold }}>{GRUND_TEXT[aktuell.grund]}</span>
            <span style={st.dim}>{erledigt} erledigt · noch {liste.length} in der Liste</span>
          </div>
          <div style={st.name}>{aktuell.name}{aktuell.firma && aktuell.firma !== aktuell.name ? <span style={st.dim}> · {aktuell.firma}</span> : null}</div>
          <a href={`tel:${aktuell.telefon}`} style={st.anrufen}>📞 {aktuell.telefonRoh || aktuell.telefon}</a>
          <div style={st.infos}>
            {aktuell.grund === 'rueckruf' && aktuell.faellig && <span>🔁 Rückruf vereinbart für {zeitDe(aktuell.faellig)}</span>}
            {aktuell.angelegt && <span>Anfrage {seitText(aktuell.angelegt, jetzt)}{aktuell.quelle ? ` · ${aktuell.quelle}` : ''}</span>}
            {aktuell.typ === 'lead' && aktuell.grund === 'neu' && (() => {
              const r = ersteReaktion({ created_at: aktuell.angelegt, telefon: aktuell.telefon }, jetzt);
              return r.minuten != null ? <span style={{ color: r.ampel === 'gruen' ? C.green : r.ampel === 'gelb' ? C.warn : C.rot, fontWeight: 700 }}>⏱ {r.text}</span> : null;
            })()}
            <span>{aktuell.versuche ? `${aktuell.versuche}. Versuch war ${seitText(aktuell.letzterAm, jetzt)} (${ergebnisInfo(aktuell.letztes)?.name ?? '—'})` : 'Erster Anruf'}</span>
            <Link href={aktuell.typ === 'lead' ? `/dashboard/leads/${aktuell.id}` : `/dashboard/crm/${aktuell.id}`} style={{ color: C.gold }} target="_blank">
              {aktuell.typ === 'lead' ? 'Lead öffnen ↗' : 'Kontakt öffnen ↗'}
            </Link>
          </div>
          {aktuell.anliegen && <div style={st.anliegen}>„{aktuell.anliegen.slice(0, 400)}"</div>}

          <div style={{ ...st.titel, marginTop: 16 }}>Ergebnis</div>
          <div style={st.ergebnisse}>
            {ERGEBNISSE.map((e) => (
              <button key={e.key} disabled={busy} onClick={() => ergebnisKlick(e.key)}
                style={{ ...st.erg, borderColor: wahl === e.key ? e.farbe : C.rand, color: e.farbe, background: wahl === e.key ? e.farbe + '22' : 'transparent' }}>
                <span style={{ fontSize: 20 }}>{e.icon}</span>{e.name}
              </button>
            ))}
          </div>

          {wahl === 'rueckruf' && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <div style={st.reihe}>
                {rueckrufVorschlaege(new Date()).map((v) => (
                  <button key={v.text} style={{ ...st.chip, borderColor: rueckruf === v.iso ? C.cyan : C.rand }} onClick={() => { setRueckruf(v.iso); setRueckLokal(''); }}>{v.text}</button>
                ))}
                <input type="datetime-local" style={st.sel} value={rueckLokal} onChange={(e) => { setRueckLokal(e.target.value); setRueckruf(lokalZuIso(e.target.value)); }} aria-label="Eigene Rückruf-Zeit" />
              </div>
              {rueckruf && <span style={st.dim}>Rückruf {zeitDe(rueckruf)}</span>}
              <button style={st.primaer} disabled={busy || !rueckruf} onClick={() => void speichern('rueckruf', rueckruf)}>🔁 Rückruf speichern und weiter</button>
            </div>
          )}

          <label style={{ display: 'grid', gap: 4, marginTop: 12, color: C.dim, fontSize: 13 }}>Notiz (wird mit dem Ergebnis gespeichert)
            <textarea style={{ ...st.sel, minHeight: 56, width: '100%' }} value={notiz} maxLength={2000} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Chef erst ab 15 Uhr da" />
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button style={st.knopf} disabled={busy} onClick={ueberspringen}>Überspringen</button>
            <button style={st.knopf} onClick={() => setLaeuft(false)}>Sitzung beenden</button>
          </div>
        </div>
      )}

      {zuletzt && (
        <div style={st.zuletzt}>
          Gespeichert: {zuletzt.name} — {ergebnisInfo(zuletzt.ergebnis)?.name} ({uhrDe(zuletzt.zeit)})
          {zuletzt.ergebnis === 'termin' && <> · <Link href="/dashboard/termine" style={{ color: C.gold }} target="_blank">Termin eintragen ↗</Link></>}
          {' · '}<button style={st.linkKnopf} disabled={busy} onClick={() => void zuruecknehmen()}>Zurücknehmen</button>
        </div>
      )}
    </div>
  );
}

function Kpi({ wert, label, sub, farbe }: { wert: string; label: string; sub?: string; farbe?: string }) {
  return <div style={st.kpi}><div style={{ fontSize: 22, fontWeight: 800, color: farbe ?? C.text }}>{wert}</div><div style={st.kLabel}>{label}</div>{sub && <div style={{ color: C.dim, fontSize: 11.5 }}>{sub}</div>}</div>;
}
function Haken({ an, text, onClick }: { an: boolean; text: string; onClick: () => void }) {
  return <button onClick={onClick} style={{ ...st.chip, borderColor: an ? C.gold : C.rand, color: an ? C.text : C.dim }}>{an ? '☑' : '☐'} {text}</button>;
}

const st: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 22px 64px', maxWidth: 1000, margin: '0 auto' },
  eyebrow: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontSize: 'clamp(26px, 2.4vw, 36px)', fontWeight: 800, margin: 0 },
  sub: { color: C.dim, margin: '8px 0 16px', fontSize: 15, maxWidth: 760, lineHeight: 1.5 },
  dim: { color: C.dim, fontSize: 13 },
  err: { color: C.rot, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  warn: { color: C.warn, fontSize: 13.5, lineHeight: 1.5, background: 'rgba(224,162,76,0.08)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 10 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '6px 0 14px' },
  kpi: { background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 14, padding: 12, textAlign: 'center' },
  kLabel: { color: C.dim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 },
  karte: { background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20, marginBottom: 14 },
  titel: { fontWeight: 800, fontSize: 17, marginBottom: 10 },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  chip: { background: 'transparent', border: `1px solid ${C.rand}`, borderRadius: 999, padding: '7px 12px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: C.text },
  sel: { background: C.navy, color: C.text, border: `1px solid ${C.rand}`, borderRadius: 9, padding: '8px 10px', fontSize: 14.5, fontFamily: 'inherit', boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '9px 14px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  knopfLink: { color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 10, padding: '8px 14px', fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' },
  badge: { fontSize: 12.5, fontWeight: 800, border: '1px solid currentColor', borderRadius: 999, padding: '3px 10px' },
  name: { fontSize: 'clamp(22px, 2.2vw, 30px)', fontWeight: 800, marginTop: 10 },
  anrufen: { display: 'inline-block', marginTop: 10, background: C.green, color: C.navy, borderRadius: 12, padding: '12px 20px', fontSize: 22, fontWeight: 800, textDecoration: 'none' },
  infos: { display: 'flex', gap: 14, flexWrap: 'wrap', color: C.dim, fontSize: 13.5, marginTop: 10 },
  anliegen: { marginTop: 10, color: C.text, fontSize: 14.5, background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 },
  ergebnisse: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 },
  erg: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid', borderRadius: 12, padding: '12px 12px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  zuletzt: { color: C.dim, fontSize: 14, background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '10px 14px' },
  th: { textAlign: 'left', color: C.dim, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px', borderBottom: `1px solid ${C.rand}` },
  td: { padding: '7px 8px', borderBottom: `1px solid ${C.rand}` },
  tdz: { padding: '7px 8px', borderBottom: `1px solid ${C.rand}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  linkKnopf: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: 0, textDecoration: 'underline' },
};
