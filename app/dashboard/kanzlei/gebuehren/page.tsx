'use client';

// ============================================================
// ARGONAUT OS · Paket PS5 · Gebühren-Rechner Kanzlei (RVG + StBVV)
//   RVG: 1,0-Gebühr nach Anlage 2 (Stand 01.06.2025), Gebührentatbestände
//   aus dem VV, Erhöhung Nr. 1008, Anrechnung der Geschäftsgebühr,
//   Auslagenpauschale je Angelegenheit, Umsatzsteuer.
//   StBVV: Tabelle A mit Zehntel-Rahmen und Mittelgebühr.
// Reine Rechenhilfe — erzeugt KEINE Rechnung (Kostenaufstellung zum Kopieren).
// Logik: lib/gebuehrenHonorare.ts (getestet). Kein SQL nötig.
// Unterpfad von /dashboard/kanzlei (erbt dessen Freigabe).
// Pfad: app/dashboard/kanzlei/gebuehren/page.tsx
// ============================================================

import { useMemo, useState, CSSProperties } from 'react';
import {
  RVG_POSITIONEN, RVG_ANGELEGENHEITEN, RVG_STAND, rvgBerechnung, rvgGebuehrCent,
  STBVV_VORLAGEN, stbvvBerechnung, kostenText, euro, euroText, heuteBerlin,
} from '@/lib/gebuehrenHonorare';
import { leseZahl } from '@/lib/zahlen';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderTop: `1px solid ${C.border}`, fontSize: 14 };

function satzText(s: number): string { return s.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }); }

export default function GebuehrenSeite() {
  const [tab, setTab] = useState<'rvg' | 'stbvv'>('rvg');
  const [ok, setOk] = useState<string | null>(null);

  // --- RVG ---
  const [wert, setWert] = useState('');
  const [auftragAm, setAuftragAm] = useState(heuteBerlin());
  const [ag, setAg] = useState('1');
  const [gewaehlt, setGewaehlt] = useState<Record<string, string>>({ '2300': '1,3' });
  const [anrechnung, setAnrechnung] = useState(true);
  const [pauschale, setPauschale] = useState(true);
  const [ust, setUst] = useState('19');

  const rvg = useMemo(() => rvgBerechnung({
    gegenstandswert: wert,
    positionen: Object.entries(gewaehlt).map(([nr, satz]) => ({ nr, satz })),
    auftraggeber: ag, anrechnung, auslagenpauschale: pauschale, ustSatz: ust, auftragAm,
  }), [wert, gewaehlt, ag, anrechnung, pauschale, ust, auftragAm]);
  const voll = rvgGebuehrCent(wert);

  function umschalten(nr: string, satz: number) {
    const neu = { ...gewaehlt };
    if (nr in neu) delete neu[nr]; else neu[nr] = satzText(satz);
    setGewaehlt(neu);
  }

  // --- StBVV ---
  const [vorlage, setVorlage] = useState(STBVV_VORLAGEN[0].key);
  const v = STBVV_VORLAGEN.find((x) => x.key === vorlage) ?? STBVV_VORLAGEN[0];
  const [sWert, setSWert] = useState('');
  const [von, setVon] = useState(String(v.von));
  const [bis, setBis] = useState(String(v.bis));
  const [zehntel, setZehntel] = useState('');
  const [sPauschale, setSPauschale] = useState(true);
  const [sUst, setSUst] = useState('19');
  const st = useMemo(() => stbvvBerechnung({ gegenstandswert: sWert, zehntelVon: von, zehntelBis: bis, zehntel, mindestwert: v.mindestwert, auslagenpauschale: sPauschale, ustSatz: sUst }), [sWert, von, bis, zehntel, v.mindestwert, sPauschale, sUst]);

  function kopieren(text: string) { navigator.clipboard?.writeText(text); setOk('Kostenaufstellung kopiert.'); }

  return (
    <div style={{ color: C.text, maxWidth: 1100, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Kanzlei & Steuer</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🧮 Gebühren-Rechner</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Gesetzliche Gebühren in Sekunden — als Kostenaufstellung zum Kopieren. <a href="/dashboard/kanzlei" style={{ color: C.cyan }}>← Zur Kanzlei</a></p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {([['rvg', '⚖️ RVG (Anwalt)'], ['stbvv', '📊 StBVV (Steuerberatung)']] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); setOk(null); }} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
      </div>
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {tab === 'rvg' && (
        <>
          <div style={karte}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label>Gegenstandswert €<br /><input style={{ ...feld, width: 160 }} value={wert} onChange={(e) => setWert(e.target.value)} placeholder="z. B. 10.000" /></label>
              <label>Auftrag erteilt am<br /><input type="date" style={feld} value={auftragAm} onChange={(e) => setAuftragAm(e.target.value)} /></label>
              <label>Auftraggeber<br /><input style={{ ...feld, width: 80 }} value={ag} onChange={(e) => setAg(e.target.value)} /></label>
              <label>USt %<br /><input style={{ ...feld, width: 70 }} value={ust} onChange={(e) => setUst(e.target.value)} /></label>
            </div>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 8 }}>1,0-Gebühr: <b style={{ color: C.text }}>{voll == null ? '—' : euroText(euro(voll))}</b> (Anlage 2 RVG, Stand {RVG_STAND})</div>
          </div>
          <div style={karte}>
            {(Object.keys(RVG_ANGELEGENHEITEN) as (keyof typeof RVG_ANGELEGENHEITEN)[]).map((ang) => (
              <div key={ang} style={{ marginBottom: 10 }}>
                <b style={{ color: C.gold }}>{RVG_ANGELEGENHEITEN[ang]}</b>
                {RVG_POSITIONEN.filter((p) => p.angelegenheit === ang).map((p) => (
                  <div key={p.nr} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                    <label style={{ minWidth: 330 }}><input type="checkbox" checked={p.nr in gewaehlt} onChange={() => umschalten(p.nr, p.satz)} /> Nr. {p.nr} · {p.label}</label>
                    {p.nr in gewaehlt && <input style={{ ...feld, width: 70 }} value={gewaehlt[p.nr]} onChange={(e) => setGewaehlt({ ...gewaehlt, [p.nr]: e.target.value })} />}
                    {p.rahmen && <span style={{ color: C.textDim, fontSize: 12.5 }}>Rahmen {satzText(p.rahmen[0])}–{satzText(p.rahmen[1])}</span>}
                  </div>
                ))}
              </div>
            ))}
            <label style={{ marginRight: 16 }}><input type="checkbox" checked={anrechnung} onChange={(e) => setAnrechnung(e.target.checked)} /> Geschäftsgebühr anrechnen (Vorbem. 3 Abs. 4 VV)</label>
            <label><input type="checkbox" checked={pauschale} onChange={(e) => setPauschale(e.target.checked)} /> Auslagenpauschale Nr. 7002</label>
          </div>
          <div style={karte}>
            {!rvg.ok ? <div style={{ color: C.warn }}>{rvg.fehler}</div> : (
              <>
                {rvg.zeilen.map((z, i) => (
                  <div key={i} style={zeile}><span>{z.nr !== '7002' && z.nr !== '7008' && z.satz !== 0 ? `${satzText(Math.abs(z.satz))} · ` : ''}{z.label}{/^\d/.test(z.nr) ? ` (Nr. ${z.nr})` : ''}</span><span style={{ color: z.betragCent < 0 ? C.warn : C.text }}>{euroText(euro(z.betragCent))}</span></div>
                ))}
                <div style={{ ...zeile, fontWeight: 800, fontSize: 15.5 }}><span>Gesamt</span><span style={{ color: C.gold }}>{euroText(euro(rvg.bruttoCent))}</span></div>
                {rvg.hinweise.map((h, i) => <div key={i} style={{ color: C.textDim, fontSize: 12.5, marginTop: 4 }}>{h}</div>)}
                <button style={{ ...knopf, marginTop: 10 }} onClick={() => kopieren(kostenText(`Kostenaufstellung RVG · Gegenstandswert ${euroText(leseZahl(wert))}`, rvg.zeilen, rvg.bruttoCent, rvg.hinweise))}>📋 Als Text kopieren</button>
              </>
            )}
          </div>
        </>
      )}

      {tab === 'stbvv' && (
        <>
          <div style={karte}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label>Tätigkeit<br />
                <select style={feld} value={vorlage} onChange={(e) => { const n = STBVV_VORLAGEN.find((x) => x.key === e.target.value) ?? STBVV_VORLAGEN[0]; setVorlage(n.key); setVon(String(n.von)); setBis(String(n.bis)); setZehntel(''); }}>
                  {STBVV_VORLAGEN.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
              <label>Gegenstandswert €<br /><input style={{ ...feld, width: 160 }} value={sWert} onChange={(e) => setSWert(e.target.value)} /></label>
              <label>Zehntel von<br /><input style={{ ...feld, width: 70 }} value={von} onChange={(e) => setVon(e.target.value)} /></label>
              <label>bis<br /><input style={{ ...feld, width: 70 }} value={bis} onChange={(e) => setBis(e.target.value)} /></label>
              <label>gewählt<br /><input style={{ ...feld, width: 90 }} value={zehntel} onChange={(e) => setZehntel(e.target.value)} placeholder="Mittel" /></label>
              <label>USt %<br /><input style={{ ...feld, width: 70 }} value={sUst} onChange={(e) => setSUst(e.target.value)} /></label>
            </div>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 8 }}>Gegenstandswert: {v.wertHinweis}.</div>
            <label style={{ display: 'block', marginTop: 6 }}><input type="checkbox" checked={sPauschale} onChange={(e) => setSPauschale(e.target.checked)} /> Auslagenpauschale § 16 StBVV</label>
          </div>
          <div style={karte}>
            {!st.ok ? <div style={{ color: C.warn }}>{st.fehler}</div> : (
              <>
                <div style={zeile}><span>Volle Gebühr (10/10) bei {euroText(st.wert)}</span><span>{euroText(euro(st.vollCent ?? 0))}</span></div>
                <div style={zeile}><span>Gebühr {satzText(st.zehntel ?? 0)}/10 (Mittelgebühr {satzText(st.mittel ?? 0)}/10)</span><span>{euroText(euro(st.gebuehrCent))}</span></div>
                {st.pauschaleCent > 0 && <div style={zeile}><span>Auslagenpauschale</span><span>{euroText(euro(st.pauschaleCent))}</span></div>}
                <div style={zeile}><span>Umsatzsteuer</span><span>{euroText(euro(st.ustCent))}</span></div>
                <div style={{ ...zeile, fontWeight: 800, fontSize: 15.5 }}><span>Gesamt</span><span style={{ color: C.gold }}>{euroText(euro(st.bruttoCent))}</span></div>
                {st.hinweise.map((h, i) => <div key={i} style={{ color: C.textDim, fontSize: 12.5, marginTop: 4 }}>{h}</div>)}
                <button style={{ ...knopf, marginTop: 10 }} onClick={() => kopieren(kostenText(`Kostenaufstellung StBVV · ${v.label}`, [
                  { label: `Gebühr ${satzText(st.zehntel ?? 0)}/10 aus ${euroText(st.wert)}`, betragCent: st.gebuehrCent },
                  ...(st.pauschaleCent > 0 ? [{ label: 'Auslagenpauschale § 16 StBVV', betragCent: st.pauschaleCent }] : []),
                  { label: 'Umsatzsteuer', betragCent: st.ustCent },
                ], st.bruttoCent, st.hinweise))}>📋 Als Text kopieren</button>
              </>
            )}
          </div>
        </>
      )}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>Rechenhilfe für die eigene Kanzlei — keine Rechts- oder Steuerberatung. Rechnungen erstellen Sie wie gewohnt im Rechnungsmodul.</p>
    </div>
  );
}
