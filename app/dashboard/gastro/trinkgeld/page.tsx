'use client';

// ============================================================
// ARGONAUT OS · Paket PS5 · Trinkgeld-Verteilung (Gastro)
//   Topf aus Bar- und Kartentrinkgeld je Tag/Schicht, Verteilung centgenau
//   nach Stunden, Punkten oder zu gleichen Teilen — die Summe stimmt immer
//   mit dem Topf überein. Verlauf und Monatssumme je Person.
// Logik: lib/gebuehrenHonorare.ts (getestet). SQL: supabase-sql/ps5-gebuehren-honorare.sql.
// Unterpfad von /dashboard/gastro (erbt dessen Freigabe). Mitarbeiter erfassen,
// ändern/löschen nur der Chef.
// Pfad: app/dashboard/gastro/trinkgeld/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  TRINKGELD_HINWEIS, trinkgeldVerteilen, trinkgeldSummen, euro, euroText, datumDe, heuteBerlin,
  type TrinkgeldMethode,
} from '@/lib/gebuehrenHonorare';
import { leseBetrag } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${C.border}`, fontSize: 14, flexWrap: 'wrap' };
const METHODEN: { k: TrinkgeldMethode; l: string }[] = [{ k: 'stunden', l: 'nach Stunden' }, { k: 'punkte', l: 'nach Punkten' }, { k: 'gleich', l: 'zu gleichen Teilen' }];

type Anteil = { name: string; basis: number; anteilCent: number };
type Verteilung = { id: string; datum: string; schicht: string | null; bar: number; karte: number; methode: TrinkgeldMethode; anteile: Anteil[]; notiz: string | null };
type Person = { name: string; stunden: string; punkte: string; inhaber: boolean };

export default function TrinkgeldSeite() {
  const heute = heuteBerlin();
  const [verlauf, setVerlauf] = useState<Verteilung[]>([]);
  const [istChef, setIstChef] = useState(true);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [datum, setDatum] = useState(heute);
  const [schicht, setSchicht] = useState('');
  const [bar, setBar] = useState('');
  const [karteBetrag, setKarteBetrag] = useState('');
  const [methode, setMethode] = useState<TrinkgeldMethode>('stunden');
  const [personen, setPersonen] = useState<Person[]>([{ name: '', stunden: '', punkte: '1', inhaber: false }]);
  const [monat, setMonat] = useState(heute.slice(0, 7));

  const laden = useCallback(async () => {
    setFehler(null);
    const r = await supabase.from('gastro_trinkgeld').select('id, datum, schicht, bar, karte, methode, anteile, notiz').order('datum', { ascending: false }).limit(400);
    if (r.error) { if (/gastro_trinkgeld/.test(r.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + r.error.message); return; }
    setVerlauf((r.data as Verteilung[]) ?? []);
  }, []);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === data?.user?.id);
      await laden();
    })();
  }, [laden]);

  const bekannteNamen = useMemo(() => Array.from(new Set(verlauf.flatMap((v) => (v.anteile ?? []).map((a) => a.name)))).sort((a, b) => a.localeCompare(b, 'de')), [verlauf]);
  const ergebnis = useMemo(() => trinkgeldVerteilen({ bar, karte: karteBetrag }, personen.map((p) => ({ name: p.name, stunden: p.stunden, punkte: p.punkte, inhaber: p.inhaber })), methode), [bar, karteBetrag, personen, methode]);
  const summen = useMemo(() => trinkgeldSummen(verlauf.map((v) => ({ datum: v.datum, anteile: v.anteile ?? [] })), monat), [verlauf, monat]);

  function setzen(i: number, teil: Partial<Person>) { setPersonen(personen.map((p, j) => (j === i ? { ...p, ...teil } : p))); }
  function letztesTeamUebernehmen() {
    const letzte = verlauf[0];
    if (!letzte) return;
    setPersonen(letzte.anteile.map((a) => ({ name: a.name, stunden: '', punkte: letzte.methode === 'punkte' ? String(a.basis).replace('.', ',') : '1', inhaber: false })));
    setMethode(letzte.methode);
  }
  async function speichern() {
    if (!ergebnis.ok) { setFehler(ergebnis.fehler); return; }
    const z = (s: string) => leseBetrag(s) ?? 0;
    const { error } = await supabase.from('gastro_trinkgeld').insert({
      datum, schicht: schicht.trim() || null, bar: z(bar), karte: z(karteBetrag), methode, anteile: ergebnis.anteile,
    });
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk(`Verteilung vom ${datumDe(datum)} gespeichert.`); setBar(''); setKarteBetrag(''); await laden();
  }
  async function loeschen(v: Verteilung) {
    if (!window.confirm(`Verteilung vom ${datumDe(v.datum)} löschen?`)) return;
    const { error } = await supabase.from('gastro_trinkgeld').delete().eq('id', v.id);
    if (error) { setFehler('Löschen fehlgeschlagen: ' + error.message); return; }
    await laden();
  }
  function aushang(v: Verteilung): string {
    const gesamt = Math.round((Number(v.bar) + Number(v.karte)) * 100);
    return [`Trinkgeld ${datumDe(v.datum)}${v.schicht ? ` · ${v.schicht}` : ''}`, `Topf ${euroText(euro(gesamt))} (bar ${euroText(Number(v.bar))}, Karte ${euroText(Number(v.karte))}) · ${METHODEN.find((m) => m.k === v.methode)?.l ?? v.methode}`, '', ...v.anteile.map((a) => `${a.name.padEnd(24, ' ')} ${v.methode === 'gleich' ? '' : `${String(a.basis).replace('.', ',')} ${v.methode === 'stunden' ? 'Std.' : 'Pkt.'}`.padEnd(10, ' ')} ${euroText(euro(a.anteilCent))}`)].join('\n');
  }

  return (
    <div style={{ color: C.text, maxWidth: 1100, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Gastro & Hotel</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🪙 Trinkgeld-Verteilung</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Fair und nachvollziehbar verteilt — auf den Cent genau. <a href="/dashboard/gastro" style={{ color: C.cyan }}>← Zu Gastro & Hotel</a></p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Trinkgeld-Tabelle ist noch nicht eingerichtet (SQL von Paket PS5 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={karte}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label>Datum<br /><input type="date" style={feld} value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
              <label>Schicht<br /><input style={{ ...feld, width: 130 }} value={schicht} onChange={(e) => setSchicht(e.target.value)} placeholder="z. B. Abend" /></label>
              <label>Bar €<br /><input style={{ ...feld, width: 110 }} value={bar} onChange={(e) => setBar(e.target.value)} /></label>
              <label>Karte €<br /><input style={{ ...feld, width: 110 }} value={karteBetrag} onChange={(e) => setKarteBetrag(e.target.value)} /></label>
              <label>Schlüssel<br /><select style={feld} value={methode} onChange={(e) => setMethode(e.target.value as TrinkgeldMethode)}>{METHODEN.map((m) => <option key={m.k} value={m.k}>{m.l}</option>)}</select></label>
              {verlauf.length > 0 && <button style={knopf} onClick={letztesTeamUebernehmen}>↺ Team der letzten Verteilung</button>}
            </div>
          </div>
          <div style={karte}>
            <b>Wer bekommt etwas?</b>
            <datalist id="tg-namen">{bekannteNamen.map((n) => <option key={n} value={n} />)}</datalist>
            {personen.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <input list="tg-namen" style={{ ...feld, width: 200 }} placeholder="Name" value={p.name} onChange={(e) => setzen(i, { name: e.target.value })} />
                {methode === 'stunden' && <input style={{ ...feld, width: 90 }} placeholder="Stunden" value={p.stunden} onChange={(e) => setzen(i, { stunden: e.target.value })} />}
                {methode === 'punkte' && <input style={{ ...feld, width: 90 }} placeholder="Punkte" value={p.punkte} onChange={(e) => setzen(i, { punkte: e.target.value })} />}
                <label style={{ fontSize: 13, color: C.textDim }}><input type="checkbox" checked={p.inhaber} onChange={(e) => setzen(i, { inhaber: e.target.checked })} /> Inhaber</label>
                <span style={{ minWidth: 90, textAlign: 'right', color: C.gold, fontWeight: 700 }}>{ergebnis.ok ? euroText(euro(ergebnis.anteile.find((a) => a.name === p.name.trim())?.anteilCent ?? 0)) : ''}</span>
                {personen.length > 1 && <button style={{ ...knopf, color: C.danger }} onClick={() => setPersonen(personen.filter((_, j) => j !== i))}>✕</button>}
              </div>
            ))}
            <button style={{ ...knopf, marginTop: 8 }} onClick={() => setPersonen([...personen, { name: '', stunden: '', punkte: '1', inhaber: false }])}>＋ Person</button>
            <div style={{ marginTop: 10, color: ergebnis.ok ? C.textDim : C.warn, fontSize: 13.5 }}>
              {ergebnis.ok ? `Topf ${euroText(euro(ergebnis.topfCent))} — verteilt ${euroText(euro(ergebnis.anteile.reduce((s, a) => s + a.anteilCent, 0)))}` : ergebnis.fehler}
            </div>
            {ergebnis.warnungen.map((w, i) => <div key={i} style={{ color: C.warn, fontSize: 13 }}>{w}</div>)}
            <button style={{ ...primaer, marginTop: 10 }} onClick={speichern} disabled={!ergebnis.ok}>💾 Verteilung speichern</button>
          </div>

          <div style={karte}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <b>Summe je Person</b>
              <input type="month" style={feld} value={monat} onChange={(e) => setMonat(e.target.value)} />
            </div>
            {summen.length === 0 && <div style={{ color: C.textDim, marginTop: 6 }}>Keine Verteilungen im Monat.</div>}
            {summen.map((s) => <div key={s.name} style={zeile}><span>{s.name} · {s.tage} Verteilungen</span><span style={{ color: C.gold }}>{euroText(euro(s.summeCent))}</span></div>)}
          </div>

          <div style={karte}>
            <b>Verlauf</b>
            {verlauf.slice(0, 40).map((v) => (
              <div key={v.id} style={zeile}>
                <span>{datumDe(v.datum)}{v.schicht ? ` · ${v.schicht}` : ''} · {euroText(Number(v.bar) + Number(v.karte))} · {v.anteile.length} Personen</span>
                <span>
                  <button style={{ ...knopf, padding: '3px 8px' }} onClick={() => { navigator.clipboard?.writeText(aushang(v)); setOk('Aushang kopiert.'); }}>📋 Aushang</button>
                  {istChef && <button style={{ ...knopf, padding: '3px 8px', color: C.danger, marginLeft: 6 }} onClick={() => loeschen(v)}>Löschen</button>}
                </span>
              </div>
            ))}
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>{TRINKGELD_HINWEIS} Keine Steuerberatung.</p>
        </>
      )}
    </div>
  );
}
