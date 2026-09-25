'use client';

// ============================================================
// ARGONAUT OS · Paket PS4 · Versammlungs-Motor (gemeinsame Seite)
//   Eigentümerversammlung (WEG) und Mitgliederversammlung (Verein):
//   Einladung mit Frist, Tagesordnung, Durchführung mit Auszählung je
//   Mehrheitsart, Protokoll mit Unterschriftszeilen, Beschluss-Sammlung
//   (fortlaufend nummeriert, Anfechtung/Aufhebung vermerkbar).
// Genutzt von /dashboard/immobilien/versammlungen (art="weg") und
// /dashboard/verein/versammlungen (art="verein").
// Logik: lib/versammlungObjekte.ts (getestet). SQL: supabase-sql/ps4-versammlungen-objekte.sql.
// Pfad: app/dashboard/_components/VersammlungenSeite.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  artInfo, MEHRHEITEN, TOP_VORSCHLAEGE, pruefeEinladung, spaetesteEinladung, auszaehlen, anfechtungsFristen,
  naechsteBeschlussNummer, ordneTops, einladungText, protokollText, sammlungZeile, offenePlatzhalter,
  heuteBerlin, datumDe,
  type VersammlungArt, type Mehrheit, type Top,
} from '@/lib/versammlungObjekte';
import { leseZahl } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const lab: CSSProperties = { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 8 };
const raster: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 };
const FARBE: Record<string, string> = { ok: C.green, rot: C.danger, gelb: C.warn, offen: C.cyan };

type Versammlung = {
  id: string; art: VersammlungArt; objekt: string | null; titel: string | null; termin: string; uhrzeit: string | null; ort: string | null; online: string | null;
  frist_tage: number | null; post: boolean; versandt_am: string | null; tagesordnung: Top[]; status: string;
  beginn: string | null; ende: string | null; leitung: string | null; protokollfuehrung: string | null; anwesend: string | null;
  notizen: Record<string, string>; beirat: boolean; erstellt_am: string;
};
type Beschluss = {
  id: string; versammlung_id: string; objekt: string | null; top_nr: number | null; nummer: number | null; text: string; mehrheit: Mehrheit;
  ja: number | null; nein: number | null; enthaltung: number | null; ja_mea: number | null; mea_gesamt: number | null; mitglieder_gesamt: number | null;
  angenommen: boolean | null; beschlossen_am: string | null; angefochten_am: string | null; aufgehoben_am: string | null;
};

function zahlAus(s: string): number | null { return leseZahl(s); }

export default function VersammlungenSeite({ art }: { art: VersammlungArt }) {
  const heute = heuteBerlin();
  const info = artInfo(art);
  const [tab, setTab] = useState<'liste' | 'sammlung'>('liste');
  const [liste, setListe] = useState<Versammlung[]>([]);
  const [beschluesse, setBeschluesse] = useState<Beschluss[]>([]);
  const [mitglieder, setMitglieder] = useState<{ email: string | null; status: string | null }[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [offenId, setOffenId] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [neu, setNeu] = useState({ objekt: '', titel: '', termin: '', uhrzeit: '18:00', ort: '', online: '', frist: String(info.fristTage), post: false });
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    setFehler(null);
    const v = await supabase.from('versammlung').select('*').eq('art', art).order('termin', { ascending: false });
    if (v.error) { if (/versammlung/.test(v.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + v.error.message); return; }
    const vs = ((v.data as Versammlung[]) ?? []).map((x) => ({ ...x, tagesordnung: x.tagesordnung ?? [], notizen: x.notizen ?? {} }));
    setListe(vs);
    const b = await supabase.from('versammlung_beschluss').select('*').eq('art', art).order('nummer', { ascending: true });
    setBeschluesse((b.data as Beschluss[]) ?? []);
    if (art === 'verein') {
      const m = await supabase.from('verein_mitglieder').select('email, status');
      setMitglieder((m.data as { email: string | null; status: string | null }[]) ?? []);
    }
  }, [art]);

  useEffect(() => {
    laden();
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        let chef: string | null = null;
        try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || u?.user?.id || '').maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
    })();
  }, [laden]);

  const aktiveMitglieder = mitglieder.filter((m) => (m.status ?? 'aktiv') === 'aktiv').length;

  async function anlegen() {
    setFehler(null); setOk(null);
    if (!neu.termin) { setFehler('Bitte das Datum der Versammlung angeben.'); return; }
    setBusy(true);
    const tops = TOP_VORSCHLAEGE[art].map((t, i) => ({ nr: i + 1, titel: t, beschluss: /Beschluss|Entlastung|Wahl|Genehmigung/.test(t) }));
    const { error } = await supabase.from('versammlung').insert({
      art, objekt: neu.objekt.trim() || null, titel: neu.titel.trim() || null, termin: neu.termin, uhrzeit: neu.uhrzeit || null, ort: neu.ort.trim() || null, online: neu.online.trim() || null,
      frist_tage: Math.max(0, Math.round(Number(neu.frist) || info.fristTage)), post: neu.post, tagesordnung: tops, status: 'geplant',
    });
    setBusy(false);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk('Versammlung angelegt — Tagesordnung mit Vorschlägen vorbelegt, bitte anpassen.');
    setNeu({ ...neu, titel: '', termin: '' });
    await laden();
  }

  const spaet = neu.termin ? spaetesteEinladung(neu.termin, Number(neu.frist) || info.fristTage, neu.post ? 3 : 0) : null;

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · {art === 'weg' ? 'Immobilien' : 'Verein'}</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🗳 {art === 'weg' ? 'Eigentümerversammlungen' : 'Mitgliederversammlungen'}</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Einladung mit richtiger Frist, Abstimmung mit richtiger Mehrheit, Protokoll und Beschluss-Sammlung — in einem Ablauf. <a href={art === 'weg' ? '/dashboard/immobilien' : '/dashboard/verein'} style={{ color: C.cyan }}>← Zurück</a></p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {([['liste', '🗓 Versammlungen'], ['sammlung', `📚 Beschluss-Sammlung${beschluesse.length ? ` · ${beschluesse.length}` : ''}`]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
      </div>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Versammlungs-Tabellen sind noch nicht eingerichtet (SQL von Paket PS4 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && tab === 'liste' && (
        <>
          <div style={karte}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Neue Versammlung</h2>
            <div style={raster}>
              {art === 'weg' && <div><label style={lab}>Objekt / Gemeinschaft</label><input style={feld} placeholder="z. B. WEG Hauptstraße 12" value={neu.objekt} onChange={(e) => setNeu({ ...neu, objekt: e.target.value })} /></div>}
              <div><label style={lab}>Titel</label><input style={feld} placeholder={art === 'weg' ? 'Ordentliche Versammlung 2026' : 'Jahreshauptversammlung 2026'} value={neu.titel} onChange={(e) => setNeu({ ...neu, titel: e.target.value })} /></div>
              <div><label style={lab}>Datum</label><input type="date" style={feld} value={neu.termin} onChange={(e) => setNeu({ ...neu, termin: e.target.value })} /></div>
              <div><label style={lab}>Uhrzeit</label><input type="time" style={feld} value={neu.uhrzeit} onChange={(e) => setNeu({ ...neu, uhrzeit: e.target.value })} /></div>
              <div><label style={lab}>Ort</label><input style={feld} value={neu.ort} onChange={(e) => setNeu({ ...neu, ort: e.target.value })} /></div>
              <div><label style={lab}>Online-Link (hybrid)</label><input style={feld} value={neu.online} onChange={(e) => setNeu({ ...neu, online: e.target.value })} /></div>
              <div><label style={lab}>Einladungsfrist (Tage)</label><input style={feld} value={neu.frist} onChange={(e) => setNeu({ ...neu, frist: e.target.value })} /></div>
            </div>
            <label style={{ ...lab, fontWeight: 400, color: C.text }}><input type="checkbox" checked={neu.post} onChange={(e) => setNeu({ ...neu, post: e.target.checked })} /> Einladung per Post (3 Tage Postlaufzeit einrechnen)</label>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Frist: {info.fristText}.{spaet ? ` Spätester Versand: ${datumDe(spaet)}.` : ''}</div>
            <button style={{ ...primaer, marginTop: 10 }} disabled={busy} onClick={anlegen}>{busy ? '…' : '＋ Versammlung anlegen'}</button>
          </div>
          {liste.length === 0 && <div style={karte}>Noch keine Versammlung.</div>}
          {liste.map((v) => (
            <VersammlungKarte key={v.id} v={v} art={art} heute={heute} firma={firma} offen={offenId === v.id} onToggle={() => setOffenId(offenId === v.id ? null : v.id)}
              beschluesse={beschluesse} mitgliederEmails={mitglieder.filter((m) => (m.status ?? 'aktiv') === 'aktiv' && m.email).map((m) => m.email as string)} aktiveMitglieder={aktiveMitglieder}
              onFehler={setFehler} onOk={setOk} neuLaden={laden} />
          ))}
        </>
      )}

      {!sqlFehlt && tab === 'sammlung' && <Sammlung art={art} liste={liste} beschluesse={beschluesse} onFehler={setFehler} onOk={setOk} neuLaden={laden} />}

      <p style={{ color: C.textDim, fontSize: 12.5 }}>
        {art === 'weg'
          ? 'Rechtlicher Rahmen (WEG seit 12/2020): Einberufung mindestens drei Wochen vorher in Textform (§ 24 Abs. 4), keine Mindestanwesenheit für Beschlussfähigkeit, Mehrheit der abgegebenen Stimmen (§ 25 Abs. 1), Stimmrecht nach Köpfen, wenn nichts anderes vereinbart ist (§ 25 Abs. 2), Niederschrift mit drei Unterschriften (§ 24 Abs. 6), Beschluss-Sammlung (§ 24 Abs. 7), Anfechtung binnen eines Monats (§ 45).'
          : 'Rechtlicher Rahmen: Einladung, Frist und Form stehen in Ihrer Satzung. Mehrheit der abgegebenen Stimmen (§ 32 BGB), Satzungsänderung drei Viertel (§ 33 BGB), Zweckänderung Zustimmung aller Mitglieder — jeweils sofern die Satzung nichts anderes regelt.'}{' '}Keine Rechtsberatung.
      </p>
    </div>
  );
}

function VersammlungKarte({ v, art, heute, firma, offen, onToggle, beschluesse, mitgliederEmails, aktiveMitglieder, onFehler, onOk, neuLaden }: {
  v: Versammlung; art: VersammlungArt; heute: string; firma: string; offen: boolean; onToggle: () => void; beschluesse: Beschluss[];
  mitgliederEmails: string[]; aktiveMitglieder: number;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [tops, setTops] = useState<Top[]>(v.tagesordnung);
  const [d, setD] = useState({ beginn: v.beginn ?? '', ende: v.ende ?? '', leitung: v.leitung ?? '', protokollfuehrung: v.protokollfuehrung ?? '', anwesend: v.anwesend ?? '', beirat: v.beirat });
  const [notizen, setNotizen] = useState<Record<string, string>>(v.notizen ?? {});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const eigene = beschluesse.filter((b) => b.versammlung_id === v.id);
  const pr = pruefeEinladung({ art, termin: v.termin, versandt_am: v.versandt_am, frist_tage: v.frist_tage, post: v.post }, heute);
  const nachTermin = v.termin <= heute;

  async function speichern(extra: Record<string, unknown> = {}, meldung = 'Gespeichert.') {
    setBusy(true); onFehler(null); onOk(null);
    const { error } = await supabase.from('versammlung').update({
      tagesordnung: ordneTops(tops), beginn: d.beginn || null, ende: d.ende || null, leitung: d.leitung.trim() || null, protokollfuehrung: d.protokollfuehrung.trim() || null,
      anwesend: d.anwesend.trim() || null, beirat: d.beirat, notizen, aktualisiert_am: new Date().toISOString(), ...extra,
    }).eq('id', v.id);
    setBusy(false);
    if (error) { onFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    onOk(meldung); await neuLaden();
  }

  const einladung = () => setText(einladungText({ art, titel: v.titel, termin: v.termin, uhrzeit: v.uhrzeit, ort: v.ort, online: v.online, tops, absender: firma }));
  const protokoll = () => setText(protokollText({ art, titel: v.titel, termin: v.termin, ort: v.ort, beginn: d.beginn, ende: d.ende, leitung: d.leitung, protokoll: d.protokollfuehrung, anwesend: d.anwesend, tops: ordneTops(tops), beschluesse: eigene, notizen, beirat: d.beirat }));
  const platz = offenePlatzhalter(text);

  function drucken() {
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(v.titel || 'Versammlung')}</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#111;white-space:pre-wrap;font-size:13px;line-height:1.5}</style></head><body>${esc(text)}</body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  return (
    <div style={{ ...karte, borderLeft: `4px solid ${v.status === 'abgeschlossen' ? C.textDim : FARBE[pr.stufe]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={onToggle}>
        <div>
          <b>{datumDe(v.termin)}{v.uhrzeit ? ` ${v.uhrzeit.slice(0, 5)} Uhr` : ''}</b> · {v.titel || (art === 'weg' ? 'Eigentümerversammlung' : 'Mitgliederversammlung')}{v.objekt ? ` · ${v.objekt}` : ''}
          <div style={{ color: v.status === 'abgeschlossen' ? C.textDim : FARBE[pr.stufe], fontSize: 13.5, marginTop: 2 }}>{v.status === 'abgeschlossen' ? `Abgeschlossen · ${eigene.length} Beschluss/Beschlüsse` : pr.text}</div>
        </div>
        <div style={{ color: C.textDim, fontSize: 13 }}>{offen ? '▲' : '▼'}</div>
      </div>
      {offen && (
        <div style={{ marginTop: 10 }}>
          <b>Tagesordnung</b>
          {tops.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <span style={{ width: 52, color: C.textDim }}>TOP {i + 1}</span>
              <input style={feld} value={t.titel} onChange={(e) => setTops(tops.map((x, j) => (j === i ? { ...x, titel: e.target.value } : x)))} />
              <label style={{ whiteSpace: 'nowrap', fontSize: 13 }}><input type="checkbox" checked={t.beschluss} onChange={(e) => setTops(tops.map((x, j) => (j === i ? { ...x, beschluss: e.target.checked } : x)))} /> Beschluss</label>
              <button style={knopf} onClick={() => setTops(tops.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button style={{ ...knopf, marginTop: 6 }} onClick={() => setTops([...tops, { nr: tops.length + 1, titel: '', beschluss: true }])}>＋ TOP</button>
          <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 4 }}>{art === 'weg' ? 'Beschlüsse sind nur zu Punkten möglich, die in der Einladung bezeichnet sind.' : 'Beschlüsse nur zu angekündigten Punkten — außer Ihre Satzung erlaubt Dringlichkeitsanträge.'}</div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button style={primaer} disabled={busy} onClick={() => speichern()}>Speichern</button>
            <button style={knopf} onClick={einladung}>✉ Einladung erstellen</button>
            {!v.versandt_am && <button style={knopf} disabled={busy} onClick={() => speichern({ versandt_am: heute, status: 'eingeladen' }, 'Einladung als heute verschickt vermerkt.')}>✓ Heute eingeladen</button>}
            {art === 'verein' && mitgliederEmails.length > 0 && <button style={knopf} onClick={() => { navigator.clipboard?.writeText(mitgliederEmails.join('; ')); onOk(`${mitgliederEmails.length} E-Mail-Adressen kopiert — als BCC einfügen.`); }}>📋 {mitgliederEmails.length} Adressen (BCC)</button>}
          </div>

          {nachTermin && (
            <div style={{ ...karte, background: C.navy, marginTop: 12 }}>
              <b>Durchführung</b>
              <div style={raster}>
                <div><label style={lab}>Beginn</label><input type="time" style={feld} value={d.beginn} onChange={(e) => setD({ ...d, beginn: e.target.value })} /></div>
                <div><label style={lab}>Ende</label><input type="time" style={feld} value={d.ende} onChange={(e) => setD({ ...d, ende: e.target.value })} /></div>
                <div><label style={lab}>Versammlungsleitung</label><input style={feld} value={d.leitung} onChange={(e) => setD({ ...d, leitung: e.target.value })} /></div>
                <div><label style={lab}>Protokollführung</label><input style={feld} value={d.protokollfuehrung} onChange={(e) => setD({ ...d, protokollfuehrung: e.target.value })} /></div>
                <div><label style={lab}>Anwesend / vertreten</label><input style={feld} placeholder={art === 'weg' ? 'z. B. 9 von 12 Eigentümern, 720/1000 MEA' : 'z. B. 38 Mitglieder'} value={d.anwesend} onChange={(e) => setD({ ...d, anwesend: e.target.value })} /></div>
              </div>
              {art === 'weg' && <label style={{ display: 'block', marginTop: 6 }}><input type="checkbox" checked={d.beirat} onChange={(e) => setD({ ...d, beirat: e.target.checked })} /> Es gibt einen Verwaltungsbeirat (Vorsitz unterschreibt mit)</label>}
              {ordneTops(tops).map((t) => (
                <div key={t.nr} style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 8 }}>
                  <b>TOP {t.nr}: {t.titel}</b>
                  <textarea style={{ ...feld, minHeight: 44, marginTop: 4 }} placeholder="Verlauf / Aussprache (kurz)" value={notizen[String(t.nr)] ?? ''} onChange={(e) => setNotizen({ ...notizen, [String(t.nr)]: e.target.value })} />
                  {eigene.filter((b) => b.top_nr === t.nr).map((b) => <div key={b.id} style={{ color: b.angenommen ? C.green : C.danger, fontSize: 13.5, marginTop: 4 }}>Nr. {b.nummer}: {b.text} — {b.angenommen ? 'angenommen' : 'abgelehnt'}</div>)}
                  {t.beschluss && <BeschlussErfassen art={art} v={v} topNr={t.nr} beschluesse={beschluesse} aktiveMitglieder={aktiveMitglieder} heute={heute} onFehler={onFehler} onOk={onOk} neuLaden={neuLaden} />}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button style={primaer} disabled={busy} onClick={() => speichern()}>Speichern</button>
                <button style={knopf} onClick={protokoll}>📝 Protokoll erstellen</button>
                {v.status !== 'abgeschlossen' && <button style={knopf} disabled={busy} onClick={() => speichern({ status: 'abgeschlossen' }, 'Versammlung abgeschlossen.')}>✓ Abschließen</button>}
              </div>
            </div>
          )}

          {text && (
            <div style={{ marginTop: 10 }}>
              <textarea style={{ ...feld, minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} />
              {platz.length > 0 && <div style={{ color: C.warn, fontSize: 13 }}>Noch ausfüllen: {platz.join(', ')}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button style={knopf} disabled={platz.length > 0} onClick={() => { navigator.clipboard?.writeText(text); onOk('Text kopiert.'); }}>📋 Kopieren</button>
                <button style={knopf} disabled={platz.length > 0} onClick={drucken}>🖨 Drucken / PDF</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BeschlussErfassen({ art, v, topNr, beschluesse, aktiveMitglieder, heute, onFehler, onOk, neuLaden }: {
  art: VersammlungArt; v: Versammlung; topNr: number; beschluesse: Beschluss[]; aktiveMitglieder: number; heute: string;
  onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void>;
}) {
  const [f, setF] = useState({ text: '', mehrheit: 'einfach' as Mehrheit, ja: '', nein: '', enthaltung: '', ja_mea: '', mea_gesamt: '', mitglieder_gesamt: aktiveMitglieder ? String(aktiveMitglieder) : '' });
  const erlaubt = MEHRHEITEN.filter((m) => (art === 'weg' ? m.key !== 'dreiviertel' && m.key !== 'alle_mitglieder' : m.key !== 'weg_bauliche'));
  const a = auszaehlen(f.mehrheit, f);

  async function speichern() {
    if (!f.text.trim()) { onFehler('Bitte den Beschlusstext eintragen.'); return; }
    if (a.angenommen == null) { onFehler(a.text); return; }
    // Fortlaufend je Gemeinschaft (WEG: je Objekt) bzw. je Verein.
    const nummer = naechsteBeschlussNummer(beschluesse.filter((b) => (b.objekt ?? '') === (v.objekt ?? '')).map((b) => b.nummer));
    const beschlossen = v.termin.slice(0, 10) <= heute ? v.termin.slice(0, 10) : heute;
    const { error } = await supabase.from('versammlung_beschluss').insert({
      versammlung_id: v.id, art, objekt: v.objekt, top_nr: topNr, nummer, text: f.text.trim(), mehrheit: f.mehrheit,
      ja: zahlAus(f.ja), nein: zahlAus(f.nein), enthaltung: zahlAus(f.enthaltung) ?? 0, ja_mea: zahlAus(f.ja_mea), mea_gesamt: zahlAus(f.mea_gesamt), mitglieder_gesamt: zahlAus(f.mitglieder_gesamt),
      angenommen: a.angenommen, beschlossen_am: beschlossen,
    });
    if (error) { onFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    onOk(`Beschluss Nr. ${nummer} in die Sammlung eingetragen (${a.angenommen ? 'angenommen' : 'abgelehnt'}).`);
    setF({ ...f, text: '', ja: '', nein: '', enthaltung: '', ja_mea: '' });
    await neuLaden();
  }

  return (
    <div style={{ marginTop: 6 }}>
      <textarea style={{ ...feld, minHeight: 40 }} placeholder="Beschlusstext (so, wie er verkündet wird)" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        <select style={{ ...feld, width: 'auto' }} value={f.mehrheit} onChange={(e) => setF({ ...f, mehrheit: e.target.value as Mehrheit })}>{erlaubt.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        <input style={{ ...feld, width: 70 }} placeholder="Ja" value={f.ja} onChange={(e) => setF({ ...f, ja: e.target.value })} />
        <input style={{ ...feld, width: 70 }} placeholder="Nein" value={f.nein} onChange={(e) => setF({ ...f, nein: e.target.value })} />
        <input style={{ ...feld, width: 90 }} placeholder="Enthaltung" value={f.enthaltung} onChange={(e) => setF({ ...f, enthaltung: e.target.value })} />
        {f.mehrheit === 'weg_bauliche' && <><input style={{ ...feld, width: 110 }} placeholder="MEA der Ja" value={f.ja_mea} onChange={(e) => setF({ ...f, ja_mea: e.target.value })} /><input style={{ ...feld, width: 110 }} placeholder="MEA gesamt" value={f.mea_gesamt} onChange={(e) => setF({ ...f, mea_gesamt: e.target.value })} /></>}
        {f.mehrheit === 'alle_mitglieder' && <input style={{ ...feld, width: 130 }} placeholder="Mitglieder gesamt" value={f.mitglieder_gesamt} onChange={(e) => setF({ ...f, mitglieder_gesamt: e.target.value })} />}
        <button style={knopf} onClick={speichern}>Beschluss eintragen</button>
      </div>
      <div style={{ fontSize: 13, marginTop: 4, color: a.angenommen == null ? C.textDim : a.angenommen ? C.green : C.danger }}>{a.text}</div>
      <div style={{ fontSize: 12.5, color: C.textDim }}>{MEHRHEITEN.find((m) => m.key === f.mehrheit)?.hinweis}</div>
    </div>
  );
}

function Sammlung({ art, liste, beschluesse, onFehler, onOk, neuLaden }: { art: VersammlungArt; liste: Versammlung[]; beschluesse: Beschluss[]; onFehler: (s: string | null) => void; onOk: (s: string | null) => void; neuLaden: () => Promise<void> }) {
  const [objekt, setObjekt] = useState('');
  const objekte = useMemo(() => Array.from(new Set(liste.map((v) => v.objekt).filter(Boolean))) as string[], [liste]);
  const titel = (id: string) => { const v = liste.find((x) => x.id === id); return v ? `${datumDe(v.termin)} ${v.titel ?? ''}`.trim() : ''; };
  const sichtbar = beschluesse.filter((b) => !objekt || liste.find((v) => v.id === b.versammlung_id)?.objekt === objekt);

  async function vermerk(b: Beschluss, feldName: 'angefochten_am' | 'aufgehoben_am') {
    const d = window.prompt('Datum (JJJJ-MM-TT):', heuteBerlin());
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const { error } = await supabase.from('versammlung_beschluss').update({ [feldName]: d }).eq('id', b.id);
    if (error) onFehler('Speichern fehlgeschlagen: ' + error.message); else { onOk('Vermerk eingetragen.'); await neuLaden(); }
  }
  function drucken() {
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const zeilen = sichtbar.map((b) => `<li>${esc(sammlungZeile({ ...b, versammlung: titel(b.versammlung_id) }))}</li>`).join('');
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Beschluss-Sammlung</title><style>body{font-family:Arial,sans-serif;margin:40px;font-size:13px}li{margin:6px 0}</style></head><body><h1>Beschluss-Sammlung${objekt ? ` — ${esc(objekt)}` : ''}</h1><ol style="list-style:none;padding:0">${zeilen}</ol></body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  return (
    <div style={karte}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {art === 'weg' && objekte.length > 0 && <select style={{ ...feld, width: 'auto' }} value={objekt} onChange={(e) => setObjekt(e.target.value)}><option value="">alle Objekte</option>{objekte.map((o) => <option key={o}>{o}</option>)}</select>}
        <button style={knopf} onClick={drucken} disabled={!sichtbar.length}>🖨 Sammlung drucken</button>
      </div>
      {sichtbar.length === 0 && <div style={{ color: C.textDim }}>Noch keine Beschlüsse.</div>}
      {sichtbar.map((b) => {
        const af = anfechtungsFristen(art, b.beschlossen_am);
        return (
          <div key={b.id} style={{ borderTop: `1px solid ${C.border}`, padding: '8px 0' }}>
            <div>{sammlungZeile({ ...b, versammlung: titel(b.versammlung_id) })}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
              {af && !b.angefochten_am && <span style={{ color: heuteBerlin() <= af.klage ? C.warn : C.textDim, fontSize: 12.5 }}>{heuteBerlin() <= af.klage ? af.text : 'Anfechtungsfrist abgelaufen — Beschluss bestandskräftig (außer nichtig).'}</span>}
              {!b.angefochten_am && <button style={knopf} onClick={() => vermerk(b, 'angefochten_am')}>Anfechtung vermerken</button>}
              {!b.aufgehoben_am && <button style={knopf} onClick={() => vermerk(b, 'aufgehoben_am')}>Aufhebung vermerken</button>}
            </div>
          </div>
        );
      })}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>Einträge werden nie gelöscht — Anfechtung oder Aufhebung wird vermerkt{art === 'weg' ? ' (§ 24 Abs. 8 WEG)' : ''}.</p>
    </div>
  );
}
