'use client';

// ============================================================
// ARGONAUT OS · Metallzuschlag-Rechner (HW-1, Paket 402, 16.10.2026)
// Kupfer-/Aluminiumzuschlag für Kabel und Leitungen nach Tagesnotiz:
// (Notiz + 1 % Bezugskosten − Basis) × Metallzahl / 100 = €/km.
// Die Notiz trägt immer ein Mensch ein (mit Datum) — nichts wird geschätzt.
// Übernahme als Position in Angebot/Rechnung erst nach Anwalt-Freigabe
// (Start-Schalter „metallzuschlag", R66); der Rechner selbst ist frei.
// Logik: lib/metallzuschlag.ts (getestet). Kein SQL.
// Pfad: app/dashboard/metallzuschlag/page.tsx
// ============================================================

import { useMemo, useState, type CSSProperties } from 'react';
import { heuteIso } from '@/lib/nachweisMotor';
import { useFreigabeStand } from '@/lib/useFreigabeStand';
import { startFrei, startSperrGrund } from '@/lib/startSperre';
import { METALLE, KUPFERZAHLEN, sammelRechnung, metallzuschlag, notizDatumPruefen, positionsText, type Metall, type KabelZeile } from '@/lib/metallzuschlag';
import { leseZahl, zahlText } from '@/lib/zahlen';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};
const euro = (n: number) => `${zahlText(n, 2)} €`;
const LEERE_ZEILE: KabelZeile = { kabel: '', metallzahl: '', meter: '' };

export default function MetallzuschlagSeite() {
  const heute = heuteIso(new Date());
  const freigabe = useFreigabeStand().start;
  const frei = startFrei('metallzuschlag', freigabe);
  const [metall, setMetall] = useState<Metall>('kupfer');
  const [notiz, setNotiz] = useState('');
  const [notizDatum, setNotizDatum] = useState(heute);
  const [basis, setBasis] = useState(String(METALLE.kupfer.basisVorschlag));
  const [bezugskosten, setBezugskosten] = useState(true);
  const [gutschrift, setGutschrift] = useState(false);
  const [zeilen, setZeilen] = useState<KabelZeile[]>([{ ...LEERE_ZEILE }]);
  const [kopiert, setKopiert] = useState<string | null>(null);

  const datum = notizDatumPruefen(notizDatum, heute);
  const ergebnis = useMemo(() => sammelRechnung(zeilen, { notiz, basis, bezugskosten, gutschrift }), [zeilen, notiz, basis, bezugskosten, gutschrift]);

  function setZeile(i: number, z: Partial<KabelZeile>) {
    setZeilen((alt) => {
      const neu = alt.map((x, k) => (k === i ? { ...x, ...z } : x));
      // Kupferzahl aus der Startliste vorschlagen, wenn das Kabel bekannt ist und noch keine Zahl drinsteht
      if (z.kabel !== undefined && metall === 'kupfer' && !neu[i].metallzahl) {
        const t = KUPFERZAHLEN.find((k) => k.kabel.toLowerCase() === String(z.kabel).trim().toLowerCase());
        if (t) neu[i] = { ...neu[i], metallzahl: zahlText(t.kgKm, 1) };
      }
      if (i === neu.length - 1 && (neu[i].kabel || neu[i].meter)) neu.push({ ...LEERE_ZEILE });
      return neu;
    });
  }

  function zeileRechnen(z: KabelZeile) {
    if (!String(z.kabel ?? '').trim() && !String(z.meter ?? '').trim()) return null;
    return metallzuschlag({ notiz, basis, metallzahl: z.metallzahl, meter: z.meter, bezugskosten, gutschrift });
  }

  function texte(): string[] {
    const n = leseZahl(notiz), b = leseZahl(basis);
    if (n == null || b == null || datum.fehler) return [];
    return zeilen.flatMap((z) => {
      const r = zeileRechnen(z);
      if (!r?.ergebnis) return [];
      return [`${positionsText({ metall, kabel: z.kabel, notiz: n, notizDatum, basis: b, metallzahl: leseZahl(z.metallzahl) ?? 0, meter: leseZahl(z.meter) ?? 0, bezugskosten })}: ${euro(r.ergebnis.gesamt)}`];
    });
  }

  async function kopieren() {
    const t = texte();
    if (!t.length) return;
    try { await navigator.clipboard.writeText(t.join('\n')); setKopiert(`${t.length} Zeile(n) kopiert — nur für interne Zwecke, bis die Übernahme freigegeben ist.`); }
    catch { setKopiert('Kopieren ging nicht — bitte markieren und kopieren.'); }
  }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>🔌 Metallzuschlag-Rechner</h1>
      <p style={s.sub}>Kupfer- oder Aluminiumzuschlag für Kabel und Leitungen nach der Tagesnotiz ausrechnen: (Notiz{bezugskosten ? ' + 1 % Bezugskosten' : ''} − Basis) × Metallzahl ÷ 100 = € je km. Die Notiz tragen Sie selbst mit Datum ein — ARGONAUT schätzt keine Preise.</p>
      {!frei && <div style={s.hinweis}>{startSperrGrund('metallzuschlag', freigabe)}</div>}

      <div style={s.card}>
        <div style={s.row}>
          <label style={s.lab}>Metall<select style={s.inp} value={metall} onChange={(e) => { const m = e.target.value as Metall; setMetall(m); setBasis(String(METALLE[m].basisVorschlag)); }}>
            {(Object.keys(METALLE) as Metall[]).map((m) => <option key={m} value={m}>{METALLE[m].name}</option>)}
          </select></label>
          <label style={s.lab}>{METALLE[metall].notiz} (€/100 kg)<input style={{ ...s.inp, width: 130 }} inputMode="decimal" value={notiz} placeholder="z. B. 912,34" onChange={(e) => setNotiz(e.target.value)} /></label>
          <label style={s.lab}>vom<input type="date" style={s.inp} value={notizDatum} max={heute} onChange={(e) => setNotizDatum(e.target.value)} /></label>
          <label style={s.lab}>Basis im Preis (€/100 kg)<input style={{ ...s.inp, width: 110 }} inputMode="decimal" value={basis} onChange={(e) => setBasis(e.target.value)} /></label>
        </div>
        <div style={s.row}>
          <label style={s.check}><input type="checkbox" checked={bezugskosten} onChange={(e) => setBezugskosten(e.target.checked)} /> 1 % Bezugskosten auf die Notiz</label>
          <label style={s.check}><input type="checkbox" checked={gutschrift} onChange={(e) => setGutschrift(e.target.checked)} /> Gutschrift, wenn die Notiz unter der Basis liegt</label>
        </div>
        {datum.fehler && <div style={s.err}>{datum.fehler}</div>}
        {!datum.fehler && datum.alt && <div style={s.warn}>Die Notiz ist älter als einen Monat — bitte die aktuelle Tagesnotiz eintragen.</div>}
      </div>

      <div style={s.card}>
        <div style={{ fontWeight: 800 }}>Kabel und Leitungen</div>
        <datalist id="kupferzahlen">{KUPFERZAHLEN.map((k) => <option key={k.kabel} value={k.kabel} />)}</datalist>
        {zeilen.map((z, i) => {
          const r = zeileRechnen(z);
          return (
            <div key={i} style={s.zeile}>
              <label style={{ ...s.lab, flex: 2, minWidth: 170 }}>Kabel<input list="kupferzahlen" style={s.inp} value={z.kabel} placeholder="z. B. NYM-J 3×1,5" onChange={(e) => setZeile(i, { kabel: e.target.value })} /></label>
              <label style={s.lab}>Metallzahl (kg/km)<input style={{ ...s.inp, width: 110 }} inputMode="decimal" value={z.metallzahl} onChange={(e) => setZeile(i, { metallzahl: e.target.value })} /></label>
              <label style={s.lab}>Länge (m)<input style={{ ...s.inp, width: 100 }} inputMode="decimal" value={z.meter} onChange={(e) => setZeile(i, { meter: e.target.value })} /></label>
              <div style={{ minWidth: 150, textAlign: 'right', alignSelf: 'center' }}>
                {r?.ergebnis && <><div style={{ fontWeight: 800 }}>{euro(r.ergebnis.gesamt)}</div><div style={s.dim}>{zahlText(r.ergebnis.jeKm, 2)} €/km{r.ergebnis.hinweis ? ` · ${r.ergebnis.hinweis}` : ''}</div></>}
                {r?.fehler && (String(notiz).trim() !== '') && <div style={{ ...s.dim, color: C.warn }}>{r.fehler}</div>}
              </div>
            </div>
          );
        })}
        <div style={{ ...s.row, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <div style={{ flex: 1, fontWeight: 800 }}>Metallzuschlag gesamt (netto): <span style={{ color: C.gold }}>{euro(ergebnis.summe)}</span></div>
          <button style={s.klein} disabled={!texte().length} onClick={kopieren}>📋 Positionstexte kopieren (intern)</button>
          <button style={{ ...s.primaer, opacity: frei ? 1 : 0.45, cursor: frei ? 'pointer' : 'not-allowed' }} disabled title={frei ? 'Kommt im nächsten Schritt' : String(startSperrGrund('metallzuschlag', freigabe))}>🧾 In Angebot übernehmen</button>
        </div>
        {kopiert && <div style={s.dim}>{kopiert}</div>}
        <div style={s.dim}>Die Metallzahlen der Liste sind Startwerte — bitte immer mit dem Datenblatt bzw. der Preisliste des Großhändlers abgleichen.</div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 12 },
  h1: { fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 14.5, margin: 0 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  zeile: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  dim: { color: C.textDim, fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit' },
  hinweis: { color: C.warn, background: 'rgba(224,162,76,0.08)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  warn: { color: C.warn, fontSize: 13.5 },
  err: { color: C.danger, fontSize: 13.5 },
};
