'use client';

// ============================================================
// ARGONAUT OS · Förderung Heizungstausch (HW-3, Paket 404, 16.10.2026)
// Zuschuss-Schätzung KfW 458 (Stand 21.07.2026) für Endkunden des
// Heizungsbauers + der richtige Ablauf (Vertrag mit Bedingung → BzA →
// Antrag vor Beginn → Einbau → Nachweis). Nichts wird gespeichert — auch
// das Einkommen nicht. Die Förder-Übersicht für den Kunden (Druck) bleibt
// bis zur Anwalt-Freigabe gesperrt (Start-Schalter „foerderantrag", R67).
// Logik: lib/heizungsfoerderung.ts (getestet). Kein SQL.
// Pfad: app/dashboard/heizungsfoerderung/page.tsx
// ============================================================

import { useMemo, useState, type CSSProperties } from 'react';
import { heuteIso, datumDe } from '@/lib/nachweisMotor';
import { useFreigabeStand } from '@/lib/useFreigabeStand';
import { startFrei, startSperrGrund } from '@/lib/startSperre';
import { schaetzen, ABLAUF, STAND, QUELLE, type Fall } from '@/lib/heizungsfoerderung';
import { leseZahl, zahlText } from '@/lib/zahlen';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};
const euro = (n: number) => `${zahlText(n, 2)} €`;
const ALT: { v: Fall['alteHeizung']; t: string }[] = [
  { v: 'oel', t: 'Ölheizung' }, { v: 'gas', t: 'Gasheizung (zentral)' }, { v: 'gasetage', t: 'Gasetagenheizung' },
  { v: 'nachtspeicher', t: 'Nachtspeicher' }, { v: 'kohle', t: 'Kohle' }, { v: 'biomasse', t: 'Biomasse' }, { v: 'andere', t: 'andere / keine' },
];
function maskiere(t: string): string { return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)); }

export default function HeizungsfoerderungSeite() {
  const heute = heuteIso(new Date());
  const freigabe = useFreigabeStand().start;
  const frei = startFrei('foerderantrag', freigabe);
  const [kunde, setKunde] = useState('');
  const [datum, setDatum] = useState(heute);
  const [selbst, setSelbst] = useState(true);
  const [alt, setAlt] = useState<Fall['alteHeizung']>('oel');
  const [alter, setAlter] = useState('');
  const [funktion, setFunktion] = useState(true);
  const [einkommen, setEinkommen] = useState('');
  const [kind, setKind] = useState(false);
  const [we, setWe] = useState('1');
  const [kosten, setKosten] = useState('');

  const fall: Fall = {
    datum, selbstgenutzt: selbst, alteHeizung: alt, alterJahre: leseZahl(alter), funktionstuechtig: funktion,
    einkommen: einkommen.trim() ? leseZahl(einkommen) : null, kindUnter18: kind, wohneinheiten: leseZahl(we) ?? 1, kosten: leseZahl(kosten) ?? 0,
  };
  const r = useMemo(() => schaetzen(fall), [datum, selbst, alt, alter, funktion, einkommen, kind, we, kosten]); // eslint-disable-line react-hooks/exhaustive-deps

  function drucken() {
    if (!frei || !r.ergebnis) return;
    const e = r.ergebnis;
    const zeilen = [
      ['Förderfähige Kosten', euro(e.foerderfaehig)], ['Grundförderung', `${e.grund} %`], ['Klimageschwindigkeitsbonus', `${e.klima} %`],
      ['Einkommensbonus', `${e.einkommen} %`], ['Fördersatz (gedeckelt)', `${e.satz} %`], ['Voraussichtlicher Zuschuss', euro(e.zuschuss)],
    ].map(([a, b]) => `<tr><td>${maskiere(a)}</td><td style="text-align:right">${maskiere(b)}</td></tr>`).join('');
    const ablauf = ABLAUF.map((a, i) => `<li><b>${i + 1}. ${maskiere(a.schritt)}</b> (${maskiere(a.wer)}): ${maskiere(a.text)}</li>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Förder-Übersicht</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;color:#111}td{padding:4px 8px;border-bottom:1px solid #ddd}table{border-collapse:collapse;width:100%}small{color:#555}</style></head><body>
<h2>Förder-Übersicht Heizungstausch${kunde.trim() ? ` – ${maskiere(kunde.trim())}` : ''}</h2>
<p>Unverbindliche Schätzung vom ${maskiere(datumDe(heute))} für eine Antragstellung am ${maskiere(datumDe(datum))}.</p>
<table>${zeilen}</table>
${e.hinweise.length ? `<p>${e.hinweise.map(maskiere).join('<br>')}</p>` : ''}
<h3>So läuft es ab</h3><ol style="padding-left:0;list-style:none">${ablauf}</ol>
<p><small>Grundlage: ${maskiere(QUELLE)}. Maßgeblich sind allein die Bedingungen der KfW am Tag der Antragstellung; die Förderung steht unter Haushaltsvorbehalt, ein Rechtsanspruch besteht nicht. Diese Übersicht ist keine Förderzusage und keine Rechts- oder Steuerberatung.</small></p>
</body></html>`);
    w.document.close();
    w.print();
  }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>🔥 Förderung Heizungstausch</h1>
      <p style={s.sub}>Zuschuss nach KfW 458 für Ihre Kunden schätzen — Grundförderung, Klimageschwindigkeitsbonus, Einkommensbonus und Kostengrenze. Stand der Sätze: {datumDe(STAND)}. Nichts wird gespeichert.</p>
      {!frei && <div style={s.hinweis}>{startSperrGrund('foerderantrag', freigabe)}</div>}

      <div style={s.card}>
        <div style={s.row}>
          <label style={{ ...s.lab, flex: 2, minWidth: 200 }}>Kunde (nur für den Ausdruck)<input style={s.inp} value={kunde} onChange={(e) => setKunde(e.target.value)} /></label>
          <label style={s.lab}>Geplanter Antrag am<input type="date" style={s.inp} value={datum} min={heute} onChange={(e) => setDatum(e.target.value)} /></label>
          <label style={s.lab}>Kosten laut Angebot (brutto €)<input style={{ ...s.inp, width: 140 }} inputMode="decimal" value={kosten} onChange={(e) => setKosten(e.target.value)} /></label>
          <label style={s.lab}>Wohneinheiten<input style={{ ...s.inp, width: 80 }} inputMode="numeric" value={we} onChange={(e) => setWe(e.target.value)} /></label>
        </div>
        <div style={s.row}>
          <label style={s.check}><input type="checkbox" checked={selbst} onChange={(e) => setSelbst(e.target.checked)} /> Eigentümer wohnt selbst darin</label>
          <label style={s.lab}>Alte Heizung<select style={s.inp} value={alt} onChange={(e) => setAlt(e.target.value as Fall['alteHeizung'])}>{ALT.map((a) => <option key={a.v} value={a.v}>{a.t}</option>)}</select></label>
          {(alt === 'gas' || alt === 'biomasse') && <label style={s.lab}>Alter (Jahre)<input style={{ ...s.inp, width: 80 }} inputMode="numeric" value={alter} onChange={(e) => setAlter(e.target.value)} /></label>}
          <label style={s.check}><input type="checkbox" checked={funktion} onChange={(e) => setFunktion(e.target.checked)} /> noch funktionstüchtig</label>
        </div>
        {selbst && (
          <div style={s.row}>
            <label style={s.lab}>Zu versteuerndes Haushaltseinkommen (optional, €/Jahr)<input style={{ ...s.inp, width: 180 }} inputMode="decimal" value={einkommen} onChange={(e) => setEinkommen(e.target.value)} /></label>
            <label style={s.check}><input type="checkbox" checked={kind} onChange={(e) => setKind(e.target.checked)} /> Kind unter 18 im Haushalt</label>
            <div style={s.dim}>Wird nicht gespeichert — nur für die Schätzung.</div>
          </div>
        )}
      </div>

      <div style={s.card}>
        {r.fehler && <div style={s.dim}>{r.fehler}</div>}
        {r.ergebnis && (<>
          <div style={s.row}>
            {[['Grundförderung', `${r.ergebnis.grund} %`], ['Klimabonus', `${r.ergebnis.klima} %`], ['Einkommensbonus', `${r.ergebnis.einkommen} %`], ['Fördersatz', `${r.ergebnis.satz} %`], ['förderfähig', euro(r.ergebnis.foerderfaehig)]].map(([a, b]) => (
              <div key={a} style={s.kachel}><div style={s.dim}>{a}</div><div style={{ fontWeight: 800, fontSize: 18 }}>{b}</div></div>
            ))}
            <div style={{ ...s.kachel, borderColor: C.gold }}><div style={s.dim}>Voraussichtlicher Zuschuss</div><div style={{ fontWeight: 800, fontSize: 22, color: C.gold }}>{euro(r.ergebnis.zuschuss)}</div></div>
          </div>
          {r.ergebnis.hinweise.map((h) => <div key={h} style={s.dim}>• {h}</div>)}
        </>)}
        <div style={s.row}>
          <button style={{ ...s.primaer, opacity: frei && r.ergebnis ? 1 : 0.45, cursor: frei && r.ergebnis ? 'pointer' : 'not-allowed' }} disabled={!frei || !r.ergebnis} title={frei ? '' : String(startSperrGrund('foerderantrag', freigabe))} onClick={drucken}>🖨 Förder-Übersicht für den Kunden</button>
        </div>
        <div style={s.dim}>Unverbindliche Schätzung. Maßgeblich sind die KfW-Bedingungen am Tag der Antragstellung; kein Rechtsanspruch (Haushaltsvorbehalt).</div>
      </div>

      <div style={s.card}>
        <div style={{ fontWeight: 800 }}>So läuft es ab — die Reihenfolge entscheidet</div>
        {ABLAUF.map((a, i) => (
          <div key={a.schritt} style={{ display: 'flex', gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <div style={{ color: C.gold, fontWeight: 800, minWidth: 22 }}>{i + 1}</div>
            <div><b>{a.schritt}</b> <span style={s.dim}>({a.wer})</span><div style={s.dim}>{a.text}</div></div>
          </div>
        ))}
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
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  dim: { color: C.textDim, fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text },
  kachel: { border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', minWidth: 120 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit' },
  hinweis: { color: C.warn, background: 'rgba(224,162,76,0.08)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
