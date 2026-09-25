'use client';

// ============================================================
// ARGONAUT OS · Paket PS6 · Dünge-Fristen (Landwirtschaft) — nur Erinnerung
//   Je Schlag und Jahr: Düngebedarf ermittelt (vor der ersten Gabe)?
//   Jede Düngung aus den Maßnahmen wird geprüft: Bedarf vorher, Aufzeichnung
//   binnen 2 Tagen, Sperrfristen je Acker/Grünland/rotes Gebiet, Festmist.
//   Kalender der festen Termine (31.03. Jahressumme, Sperrfristen).
//   Die Stoffstrombilanz ist seit 08.07.2025 abgeschafft.
// Logik: lib/papiereIdentifizierung.ts (getestet). SQL: supabase-sql/ps6-papiere-identifizierung.sql.
// Unterpfad von /dashboard/landwirtschaft (erbt dessen Freigabe).
// Pfad: app/dashboard/landwirtschaft/duengung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { DUENGE_HINWEIS, flaechenart, pruefeDuengung, duengeFristen, datumDe, heuteBerlin } from '@/lib/papiereIdentifizierung';
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
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${C.border}`, fontSize: 14, flexWrap: 'wrap', alignItems: 'center' };
const FARBE: Record<string, string> = { ok: C.green, gelb: C.warn, rot: C.danger };

type Schlag = { id: string; name: string; flaeche_ha: number | null; kultur: string | null; flaechenart?: string | null; rotes_gebiet?: boolean | null };
type Massnahme = { id: string; schlag_id: string; datum: string; art: string; mittel: string | null; menge: number | null; einheit: string | null; erstellt_am: string };
type Bedarf = { id: string; schlag_id: string; jahr: number; n_kg_ha: number | null; p2o5_kg_ha: number | null; ermittelt_am: string };

export default function DuengungSeite() {
  const heute = heuteBerlin();
  const [jahr, setJahr] = useState(Number(heute.slice(0, 4)));
  const [schlaege, setSchlaege] = useState<Schlag[]>([]);
  const [massnahmen, setMassnahmen] = useState<Massnahme[]>([]);
  const [bedarf, setBedarf] = useState<Bedarf[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [eingabe, setEingabe] = useState<Record<string, { n: string; p: string; am: string }>>({});

  const laden = useCallback(async () => {
    setFehler(null);
    const b = await supabase.from('agrar_duengebedarf').select('*');
    if (b.error) { if (/agrar_duengebedarf/.test(b.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + b.error.message); return; }
    setBedarf((b.data as Bedarf[]) ?? []);
    const s1 = await supabase.from('agrar_schlaege').select('id, name, flaeche_ha, kultur, flaechenart, rotes_gebiet').order('name', { ascending: true });
    const sDaten: unknown = s1.error ? (await supabase.from('agrar_schlaege').select('id, name, flaeche_ha, kultur').order('name', { ascending: true })).data : s1.data;
    setSchlaege((sDaten as Schlag[] | null) ?? []);
    const m = await supabase.from('agrar_massnahmen').select('id, schlag_id, datum, art, mittel, menge, einheit, erstellt_am').eq('art', 'duengung').order('datum', { ascending: false }).limit(3000);
    setMassnahmen((m.data as Massnahme[]) ?? []);
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const bedarfFuer = (sid: string, j: number) => bedarf.find((x) => x.schlag_id === sid && x.jahr === j) ?? null;
  const pruefungen = useMemo(() => massnahmen.filter((m) => m.datum.startsWith(String(jahr))).map((m) => {
    const s = schlaege.find((x) => x.id === m.schlag_id);
    return { m, s, befunde: s ? pruefeDuengung(m, s, bedarfFuer(s.id, Number(m.datum.slice(0, 4)))?.ermittelt_am ?? null) : [] };
  }), [massnahmen, schlaege, bedarf, jahr]); // eslint-disable-line react-hooks/exhaustive-deps
  const kalender = useMemo(() => duengeFristen(heute, schlaege.some((s) => s.rotes_gebiet)), [heute, schlaege]);
  const probleme = pruefungen.filter((p) => p.befunde.length);

  async function schlagSetzen(s: Schlag, teil: Record<string, unknown>) {
    const { error } = await supabase.from('agrar_schlaege').update(teil).eq('id', s.id);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    await laden();
  }
  async function bedarfSpeichern(s: Schlag) {
    const e = eingabe[s.id] ?? { n: '', p: '', am: heute };
    const vorhanden = bedarfFuer(s.id, jahr);
    const daten = { schlag_id: s.id, jahr, kultur: s.kultur, n_kg_ha: e.n.trim() ? leseZahl(e.n) : null, p2o5_kg_ha: e.p.trim() ? leseZahl(e.p) : null, ermittelt_am: e.am || heute };
    const { error } = vorhanden ? await supabase.from('agrar_duengebedarf').update(daten).eq('id', vorhanden.id) : await supabase.from('agrar_duengebedarf').insert(daten);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk(`Düngebedarf ${jahr} für ${s.name} eingetragen.`); await laden();
  }

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Landwirtschaft</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🧪 Dünge-Fristen</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Bedarf vorher, Aufzeichnung rechtzeitig, Sperrfristen im Blick. <a href="/dashboard/landwirtschaft" style={{ color: C.cyan }}>← Zur Landwirtschaft</a></p>
      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Dünge-Fristen sind noch nicht eingerichtet (SQL von Paket PS6 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={karte}>
            <b>Nächste Termine</b>
            {kalender.map((k) => <div key={k.datum + k.titel} style={{ ...zeile, fontSize: 13.5 }}><span>{datumDe(k.datum)} · {k.titel}</span><span style={{ color: FARBE[k.stufe] }}>{k.datum < heute ? 'läuft' : k.stufe === 'gelb' ? 'bald' : ''}</span></div>)}
          </div>
          <div style={karte}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <b>Schläge — Düngebedarf {jahr}</b>
              <select style={feld} value={jahr} onChange={(e) => setJahr(Number(e.target.value))}>{[0, 1, 2].map((d) => Number(heute.slice(0, 4)) - d).concat(Number(heute.slice(0, 4)) + 1).sort().map((j) => <option key={j} value={j}>{j}</option>)}</select>
            </div>
            {schlaege.length === 0 && <div style={{ color: C.textDim, marginTop: 6 }}>Noch keine Schläge — in der Landwirtschaft anlegen.</div>}
            {schlaege.map((s) => { const b = bedarfFuer(s.id, jahr); const e = eingabe[s.id] ?? { n: '', p: '', am: heute }; const art = flaechenart(s.kultur, s.flaechenart); return (
              <div key={s.id} style={zeile}>
                <span style={{ flex: '1 1 300px' }}><b>{s.name}</b> · {s.kultur ?? '—'}{s.flaeche_ha ? ` · ${Number(s.flaeche_ha).toLocaleString('de-DE')} ha` : ''}<br />
                  <select style={{ ...feld, marginTop: 4 }} value={art} onChange={(ev) => schlagSetzen(s, { flaechenart: ev.target.value })}><option value="acker">Ackerland</option><option value="gruenland">Grünland</option></select>{' '}
                  <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!s.rotes_gebiet} onChange={(ev) => schlagSetzen(s, { rotes_gebiet: ev.target.checked })} /> rotes Gebiet</label></span>
                {b ? <span style={{ color: C.green }}>✓ ermittelt {datumDe(b.ermittelt_am)}{b.n_kg_ha != null ? ` · N ${b.n_kg_ha} kg/ha` : ''}{b.p2o5_kg_ha != null ? ` · P₂O₅ ${b.p2o5_kg_ha} kg/ha` : ''}</span> : (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input style={{ ...feld, width: 90 }} placeholder="N kg/ha" value={e.n} onChange={(ev) => setEingabe({ ...eingabe, [s.id]: { ...e, n: ev.target.value } })} />
                    <input style={{ ...feld, width: 100 }} placeholder="P₂O₅ kg/ha" value={e.p} onChange={(ev) => setEingabe({ ...eingabe, [s.id]: { ...e, p: ev.target.value } })} />
                    <input type="date" style={feld} value={e.am} onChange={(ev) => setEingabe({ ...eingabe, [s.id]: { ...e, am: ev.target.value } })} />
                    <button style={knopf} onClick={() => bedarfSpeichern(s)}>✓ Bedarf ermittelt</button>
                  </span>
                )}
              </div>
            ); })}
          </div>
          <div style={karte}>
            <b>Düngungen {jahr}: {pruefungen.length} · davon mit Hinweis {probleme.length}</b>
            {probleme.length === 0 && <div style={{ color: C.green, marginTop: 6 }}>{pruefungen.length ? 'Alles im Rahmen.' : 'Keine Düngungen erfasst (Maßnahme „Düngung" in der Landwirtschaft).'}</div>}
            {probleme.map(({ m, s, befunde }) => (
              <div key={m.id} style={zeile}>
                <span>{datumDe(m.datum)} · {s?.name ?? '—'} · {m.mittel ?? 'Dünger'}{m.menge != null ? ` ${m.menge} ${m.einheit ?? ''}` : ''}{befunde.map((x, i) => <div key={i} style={{ color: FARBE[x.stufe], fontSize: 13 }}>{x.text}</div>)}</span>
              </div>
            ))}
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>{DUENGE_HINWEIS}</p>
        </>
      )}
    </div>
  );
}
