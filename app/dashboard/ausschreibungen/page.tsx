'use client';

// ============================================================
// ARGONAUT OS · Ausschreibungs-Radar (Paket PH · B12)
//   Radar      Suchprofil -> TED (EU-Amtsblatt) -> Treffer merken
//   Prüfen     Ausschreibungstext einfügen -> Fristen, Leistung, Eignung
//              -> Abgleich mit der Nachweis-Mappe (Paket PE)
//   Meine      gemerkte Ausschreibungen mit Status und Frist-Ampel
//
// Logik: lib/ausschreibung.ts (getestet). Tabellen: ausschreibung,
// ausschreibung_profil (nur Chef). Nachweise werden NUR gelesen.
// Spalte heisst auswertung (analyse ist in PostgreSQL ein reserviertes Wort).
//
// Pfad: app/dashboard/ausschreibungen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties, type ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { heuteIso } from '@/lib/sachbearbeiter';
import {
  STATUS, statusFuer, fristAmpel, CPV_VORSCHLAEGE, abgleich, datumDe,
  type Fund, type Analyse, type Status, type AbgleichZeile,
} from '@/lib/ausschreibung';
import type { NachweisZeile } from '@/lib/nachweisMotor';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const AMPEL: Record<string, string> = { rot: C.danger, gelb: C.warn, gruen: C.green, vorbei: C.textDim, offen: C.textDim };
const STAND: Record<AbgleichZeile['stand'], { farbe: string; zeichen: string }> = {
  ok: { farbe: C.green, zeichen: '✓' }, bald: { farbe: C.warn, zeichen: '⚠' }, abgelaufen: { farbe: C.danger, zeichen: '✗' },
  fehlt: { farbe: C.danger, zeichen: '✗' }, selbst: { farbe: C.textDim, zeichen: '○' },
};

type Zeile = {
  id: string; quelle: 'ted' | 'manuell'; extern_id: string | null; titel: string; auftraggeber: string | null; ort: string | null;
  link: string | null; abgabe_am: string | null; wert: number | null; status: Status; analyse: Analyse | null; notiz: string | null;
};
type Tab = 'meine' | 'radar' | 'pruefen';

const euro = (n: number | null) => (n == null ? '' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));

export default function AusschreibungenPage() {
  const heute = heuteIso(new Date());
  const [tab, setTab] = useState<Tab>('meine');
  const [liste, setListe] = useState<Zeile[]>([]);
  const [nachweise, setNachweise] = useState<NachweisZeile[]>([]);
  const [tabelleFehlt, setTabelleFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);

  const load = useCallback(async () => {
    setLaden(true); setFehler(null);
    const { data, error } = await supabase.from('ausschreibung')
      .select('id,quelle,extern_id,titel,auftraggeber,ort,link,abgabe_am,wert,status,analyse:auswertung,notiz').order('abgabe_am', { ascending: true, nullsFirst: false });
    if (error) { if (/ausschreibung/.test(error.message)) setTabelleFehlt(true); else setFehler(error.message); }
    else { setTabelleFehlt(false); setListe((data as Zeile[]) ?? []); }
    const { data: n } = await supabase.from('nachweis').select('art,letzte_am,intervall_monate,gueltig_bis,kuendigungsfrist_monate');
    setNachweise((n as NachweisZeile[]) ?? []);
    setLaden(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const bekannte = useMemo(() => new Set(liste.map((z) => z.extern_id).filter(Boolean) as string[]), [liste]);

  async function merken(z: Partial<Zeile> & { titel: string }): Promise<string | null> {
    const { error } = await supabase.from('ausschreibung').insert({
      quelle: z.quelle ?? 'manuell', extern_id: z.extern_id ?? null, titel: z.titel, auftraggeber: z.auftraggeber || null, ort: z.ort || null,
      link: z.link || null, abgabe_am: z.abgabe_am || null, wert: z.wert ?? null, status: z.status ?? 'neu', auswertung: z.analyse ?? null,
    });
    if (error) return /duplicate|23505/.test(error.message) ? 'Schon gemerkt.' : error.message;
    await load();
    return null;
  }

  const offen = liste.filter((z) => STATUS.find((s) => s.key === z.status)?.offen);

  return (
    <div style={S.page}>
      <div style={S.eyebrow}>ARGONAUT OS · Vertrieb</div>
      <h1 style={S.h1}>Ausschreibungs-Radar</h1>
      <p style={S.sub}>Öffentliche Aufträge finden, Unterlagen prüfen, Fristen im Blick behalten.</p>

      <div style={S.tabs}>
        {([['meine', `📋 Meine Ausschreibungen${offen.length ? ` (${offen.length})` : ''}`], ['radar', '📡 Radar (EU-weit)'], ['pruefen', '🔍 Ausschreibung prüfen']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabAktiv : {}) }}>{l}</button>
        ))}
      </div>

      {fehler && <div style={S.fehler}>{fehler}</div>}
      {tabelleFehlt ? <div style={S.fehler}>Die Tabellen fehlen noch. Bitte zuerst das SQL aus Paket PH in Supabase ausführen.</div>
        : laden ? <p style={{ color: C.textDim }}>Lädt …</p>
        : (
          <>
            {tab === 'meine' && <Meine liste={liste} nachweise={nachweise} heute={heute} onNeu={load} onTab={setTab} />}
            {tab === 'radar' && <Radar bekannte={bekannte} onMerken={merken} />}
            {tab === 'pruefen' && <Pruefen nachweise={nachweise} heute={heute} onMerken={async (z) => { const f = await merken(z); if (!f) setTab('meine'); return f; }} />}
          </>
        )}
    </div>
  );
}

// ------------------------------------------------------------
function Meine({ liste, nachweise, heute, onNeu, onTab }: { liste: Zeile[]; nachweise: NachweisZeile[]; heute: string; onNeu: () => void; onTab: (t: Tab) => void }) {
  const [filter, setFilter] = useState<'offen' | 'alle'>('offen');
  const [offen, setOffen] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const zeigen = liste.filter((z) => filter === 'alle' || STATUS.find((s) => s.key === z.status)?.offen);

  async function status(z: Zeile, s: Status) {
    const { error } = await supabase.from('ausschreibung').update({ status: s, aktualisiert_am: new Date().toISOString() }).eq('id', z.id);
    if (error) { setMeldung(`Nicht gespeichert: ${error.message}`); return; }
    onNeu();
  }
  async function notiz(z: Zeile, n: string) {
    const { error } = await supabase.from('ausschreibung').update({ notiz: n.trim() || null, aktualisiert_am: new Date().toISOString() }).eq('id', z.id);
    setMeldung(error ? `Nicht gespeichert: ${error.message}` : 'Notiz gespeichert.');
  }

  if (!liste.length) {
    return (
      <div style={S.box}>
        <p style={{ marginTop: 0 }}>Noch keine Ausschreibungen gemerkt.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button style={S.knopf} onClick={() => onTab('radar')}>📡 Radar einrichten</button>
          <button style={S.knopf2} onClick={() => onTab('pruefen')}>🔍 Ausschreibungstext prüfen</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...S.tab, ...(filter === 'offen' ? S.tabAktiv : {}) }} onClick={() => setFilter('offen')}>Offen</button>
        <button style={{ ...S.tab, ...(filter === 'alle' ? S.tabAktiv : {}) }} onClick={() => setFilter('alle')}>Alle</button>
      </div>
      {meldung && <div style={{ color: /Nicht/.test(meldung) ? C.danger : C.green, fontSize: 13 }}>{meldung}</div>}
      {zeigen.map((z) => {
        const a = fristAmpel(z.abgabe_am, heute);
        const istOffen = STATUS.find((s) => s.key === z.status)?.offen;
        return (
          <div key={z.id} style={{ ...S.karte, borderLeft: `4px solid ${istOffen ? AMPEL[a.stufe] : C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 320px' }}>
                <div style={{ fontWeight: 600 }}>{z.titel}</div>
                <div style={{ color: C.textDim, fontSize: 13 }}>
                  {[z.auftraggeber, z.ort, euro(z.wert), z.quelle === 'ted' ? 'EU-Amtsblatt' : 'selbst erfasst'].filter(Boolean).join(' · ')}
                </div>
                <div style={{ color: istOffen ? AMPEL[a.stufe] : C.textDim, fontSize: 13, marginTop: 4 }}>{a.text}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={z.status} onChange={(e) => status(z, statusFuer(e.target.value))} style={{ ...S.input, width: 'auto' }}>
                  {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                {z.link && <a href={z.link} target="_blank" rel="noopener noreferrer" style={S.link}>Bekanntmachung ↗</a>}
                <button style={S.knopf2} onClick={() => setOffen(offen === z.id ? null : z.id)}>{offen === z.id ? 'Zu' : 'Details'}</button>
              </div>
            </div>
            {offen === z.id && (
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {z.analyse ? <AnalyseAnsicht a={z.analyse} nachweise={nachweise} heute={heute} />
                  : <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>Noch nicht ausgewertet. Unter „Ausschreibung prüfen" die Unterlagen einfügen — dort wird auch der Nachweis-Abgleich gemacht.</p>}
                <NotizFeld start={z.notiz ?? ''} onSpeichern={(n) => notiz(z, n)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NotizFeld({ start, onSpeichern }: { start: string; onSpeichern: (n: string) => void }) {
  const [n, setN] = useState(start);
  return (
    <Feld label="Notiz (z. B. Ortstermin, Ansprechpartner, Kalkulationsstand)">
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea value={n} onChange={(e) => setN(e.target.value)} style={{ ...S.input, minHeight: 60 }} />
        <button style={S.knopf2} onClick={() => onSpeichern(n)}>Speichern</button>
      </div>
    </Feld>
  );
}

// ------------------------------------------------------------
function Radar({ bekannte, onMerken }: { bekannte: Set<string>; onMerken: (z: Partial<Zeile> & { titel: string }) => Promise<string | null> }) {
  const [suchwoerter, setSuchwoerter] = useState('');
  const [region, setRegion] = useState('');
  const [cpv, setCpv] = useState<string[]>([]);
  const [tage, setTage] = useState(30);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [funde, setFunde] = useState<Fund[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const [gemerkt, setGemerkt] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('ausschreibung_profil').select('suchwoerter,cpv,region,tage').maybeSingle();
      const p = data as { suchwoerter?: string[]; cpv?: string[]; region?: string[]; tage?: number } | null;
      if (p) { setSuchwoerter((p.suchwoerter ?? []).join(', ')); setCpv(p.cpv ?? []); setRegion((p.region ?? []).join(', ')); setTage(p.tage ?? 30); }
    })();
  }, []);

  async function suchen() {
    setLaeuft(true); setFehler(null); setFunde(null);
    try {
      const res = await fetch('/api/ausschreibung-radar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modus: 'suche', profil: { suchwoerter, cpv, region, tage } }) });
      const j = await res.json();
      if (!j.ok) setFehler(j.error || 'Fehler.'); else { setFunde(j.funde); setGesamt(j.gesamt); }
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    setLaeuft(false);
  }

  async function merke(f: Fund) {
    const e = await onMerken({ quelle: 'ted', extern_id: f.extern_id, titel: f.titel, auftraggeber: f.auftraggeber, ort: f.ort, link: f.link, abgabe_am: f.abgabe_am, wert: f.wert });
    setGemerkt((g) => ({ ...g, [f.extern_id]: e ?? 'gemerkt' }));
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={S.hinweis}>
        Das Radar durchsucht das <strong>EU-Amtsblatt (TED)</strong> über die offizielle, kostenlose Schnittstelle. Dort stehen öffentliche Aufträge
        ab dem EU-Schwellenwert (seit 01.01.2026: Bauleistungen ab 5.404.000 €, Liefer- und Dienstleistungen ab 216.000 € netto). Kleinere Aufträge von Städten und
        Landkreisen stehen auf den Vergabeportalen der Länder — deren Text fügen Sie unter „Ausschreibung prüfen" ein.
      </div>
      <div style={S.raster}>
        <Feld label="Stichwörter (mit Komma trennen)"><input value={suchwoerter} placeholder="z. B. Dachsanierung, Flachdach, Spenglerarbeiten" onChange={(e) => setSuchwoerter(e.target.value)} style={S.input} /></Feld>
        <Feld label="Region hervorheben (Orte, Landkreis)"><input value={region} placeholder="z. B. Böblingen, Sindelfingen, Stuttgart" onChange={(e) => setRegion(e.target.value)} style={S.input} /></Feld>
        <Feld label="Zeitraum">
          <select value={tage} onChange={(e) => setTage(Number(e.target.value))} style={S.input}>
            {[7, 14, 30, 60, 90].map((t) => <option key={t} value={t}>veröffentlicht in den letzten {t} Tagen</option>)}
          </select>
        </Feld>
      </div>
      <Feld label="Leistungsgruppen (optional, CPV)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CPV_VORSCHLAEGE.map((c) => {
            const an = cpv.includes(c.code);
            return <button key={c.code} onClick={() => setCpv((alt) => (an ? alt.filter((x) => x !== c.code) : [...alt, c.code]))} style={{ ...S.chip, ...(an ? S.chipAn : {}) }}>{c.label}</button>;
          })}
        </div>
      </Feld>
      <div><button style={S.knopf} disabled={laeuft} onClick={suchen}>{laeuft ? 'Sucht …' : '📡 Jetzt suchen'}</button></div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {funde && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: C.textDim, fontSize: 13 }}>{funde.length} Treffer{gesamt > funde.length ? ` (von ${gesamt}, die neuesten zuerst geladen — Suche ggf. eingrenzen)` : ''}. Treffer in Ihrer Region stehen oben.</div>
          {funde.length === 0 && <p style={{ color: C.textDim }}>Keine laufenden Ausschreibungen gefunden. Versuchen Sie andere Stichwörter oder einen längeren Zeitraum.</p>}
          {funde.map((f) => {
            const schon = bekannte.has(f.extern_id) || gemerkt[f.extern_id] === 'gemerkt';
            return (
              <div key={f.extern_id} style={{ ...S.karte, borderLeft: `4px solid ${f.region_treffer ? C.gold : C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 320px' }}>
                    <div style={{ fontWeight: 600 }}>{f.region_treffer && <span style={{ color: C.gold }}>📍 </span>}{f.titel}</div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{[f.auftraggeber, f.ort, euro(f.wert), f.veroeffentlicht ? `veröffentlicht ${datumDe(f.veroeffentlicht)}` : ''].filter(Boolean).join(' · ')}</div>
                    <div style={{ fontSize: 13, marginTop: 4, color: f.abgabe_am ? C.text : C.textDim }}>{f.abgabe_am ? `Angebotsfrist: ${datumDe(f.abgabe_am)}` : 'Frist in der Bekanntmachung nachsehen'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <a href={f.link} target="_blank" rel="noopener noreferrer" style={S.link}>Ansehen ↗</a>
                    {schon ? <span style={{ color: C.green, fontSize: 13 }}>✓ gemerkt</span>
                      : <button style={S.knopf2} onClick={() => merke(f)}>☆ Merken</button>}
                  </div>
                </div>
                {gemerkt[f.extern_id] && gemerkt[f.extern_id] !== 'gemerkt' && <div style={{ color: C.warn, fontSize: 13, marginTop: 6 }}>{gemerkt[f.extern_id]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
function Pruefen({ nachweise, heute, onMerken }: { nachweise: NachweisZeile[]; heute: string; onMerken: (z: Partial<Zeile> & { titel: string }) => Promise<string | null> }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [a, setA] = useState<Analyse | null>(null);

  async function pruefen() {
    setLaeuft(true); setFehler(null); setA(null);
    try {
      const res = await fetch('/api/ausschreibung-radar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modus: 'pruefen', text }) });
      const j = await res.json();
      if (!j.ok) setFehler(j.error || 'Fehler.'); else setA(j.analyse);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    setLaeuft(false);
  }

  async function uebernehmen() {
    if (!a) return;
    const l = link.trim();
    const e = await onMerken({ quelle: 'manuell', titel: a.titel, auftraggeber: a.auftraggeber, ort: a.ort, abgabe_am: a.abgabe_am, link: /^https?:\/\//i.test(l) ? l : null, analyse: a, status: 'pruefen' });
    if (e) setFehler(e);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Feld label="Bekanntmachung oder Leistungsbeschreibung (Text aus dem Vergabeportal oder der PDF hineinkopieren)">
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ ...S.input, minHeight: 200 }} />
      </Feld>
      <Feld label="Link zur Ausschreibung (optional)"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" style={S.input} /></Feld>
      <div><button style={S.knopf} disabled={laeuft} onClick={pruefen}>{laeuft ? 'Prüft …' : '🔍 Prüfen'}</button></div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {a && (
        <>
          <AnalyseAnsicht a={a} nachweise={nachweise} heute={heute} />
          <div><button style={S.knopf} onClick={uebernehmen}>☆ In „Meine Ausschreibungen" übernehmen</button></div>
        </>
      )}
    </div>
  );
}

function AnalyseAnsicht({ a, nachweise, heute }: { a: Analyse; nachweise: NachweisZeile[]; heute: string }) {
  const ampel = fristAmpel(a.abgabe_am, heute);
  const abg = abgleich(a.eignung_keys ?? [], nachweise, heute, a.abgabe_am);
  const luecken = abg.filter((z) => z.stand === 'fehlt' || z.stand === 'abgelaufen' || z.stand === 'bald').length;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {a.hinweise?.length > 0 && (
        <div style={{ ...S.box, borderColor: C.warn }}>
          {a.hinweise.map((h, i) => <div key={i} style={{ color: C.warn, fontSize: 13 }}>⚠ {h}</div>)}
        </div>
      )}
      <div style={S.box}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{a.titel}</div>
        <div style={{ color: C.textDim, fontSize: 13 }}>{[a.auftraggeber, a.ort, a.vergabeart].filter(Boolean).join(' · ')}</div>
        <div style={{ color: AMPEL[ampel.stufe], marginTop: 6 }}>{ampel.text}{a.abgabe_text ? <span style={{ color: C.textDim }}> — „{a.abgabe_text}"</span> : ''}</div>
        {a.fragen_bis && <div style={{ fontSize: 13, marginTop: 2 }}>Bieterfragen bis {datumDe(a.fragen_bis)}{a.fragen_text ? <span style={{ color: C.textDim }}> — „{a.fragen_text}"</span> : ''}</div>}
        {a.ausfuehrung && <div style={{ fontSize: 13, marginTop: 2 }}>Ausführung: {a.ausfuehrung}</div>}
        {a.abgabe_weg && <div style={{ fontSize: 13, marginTop: 2 }}>Abgabe: {a.abgabe_weg}</div>}
        {a.leistung && <p style={{ fontSize: 14, marginBottom: 0 }}>{a.leistung}</p>}
        <Liste titel="Lose" eintraege={a.lose} />
        <Liste titel="Zuschlagskriterien" eintraege={a.zuschlag} />
        <Liste titel="Besonderheiten" eintraege={a.besonderheiten} />
      </div>
      <div style={{ ...S.box, borderColor: luecken ? C.warn : C.green }}>
        <div style={{ fontWeight: 600 }}>Geforderte Nachweise — Abgleich mit Ihrer Nachweis-Mappe {luecken ? <span style={{ color: C.warn }}>({luecken} offen)</span> : abg.length ? <span style={{ color: C.green }}>(alles da)</span> : ''}</div>
        {abg.length === 0 && <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Keine bekannten Eignungsnachweise erkannt — bitte die Unterlagen selbst durchsehen.</div>}
        {abg.map((z) => (
          <div key={z.key} style={{ fontSize: 14, marginTop: 6 }}>
            <span style={{ color: STAND[z.stand].farbe }}>{STAND[z.stand].zeichen} {z.label}</span>
            <span style={{ color: C.textDim, fontSize: 13 }}> — {z.text}</span>
          </div>
        ))}
        {a.eignung?.length > 0 && <Liste titel="Wortlaut aus der Ausschreibung" eintraege={a.eignung} />}
        <div style={{ marginTop: 8, fontSize: 13 }}><a href="/dashboard/nachweise" style={{ color: C.cyan }}>→ Nachweis-Mappe öffnen</a></div>
      </div>
    </div>
  );
}

function Liste({ titel, eintraege }: { titel: string; eintraege?: string[] }) {
  if (!eintraege?.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: C.textDim, fontSize: 12 }}>{titel}</div>
      <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 14 }}>{eintraege.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}

function Feld({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: 'grid', gap: 4 }}><span style={{ color: C.textDim, fontSize: 12 }}>{label}</span>{children}</label>;
}

const S: Record<string, CSSProperties> = {
  page: { padding: '24px 20px', color: C.text, maxWidth: 1100, margin: '0 auto' },
  eyebrow: { color: C.gold, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  h1: { fontSize: 28, margin: '4px 0' },
  sub: { color: C.textDim, marginTop: 0 },
  hinweis: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: C.textDim, lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' },
  tab: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  tabAktiv: { color: C.navy, background: C.gold, borderColor: C.gold, fontWeight: 600 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 },
  box: { border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  chip: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 16, padding: '5px 10px', cursor: 'pointer', fontSize: 13 },
  chipAn: { color: C.navy, background: C.cyan, borderColor: C.cyan },
  link: { color: C.cyan, fontSize: 14, textDecoration: 'none' },
  knopf: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  knopf2: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  fehler: { color: C.danger, background: 'rgba(224,102,102,0.08)', border: `1px solid ${C.danger}`, borderRadius: 8, padding: '10px 12px', margin: '8px 0' },
};
