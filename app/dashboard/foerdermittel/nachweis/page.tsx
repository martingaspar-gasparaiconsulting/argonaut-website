'use client';

// ============================================================
// ARGONAUT OS · Paket PS4 · Verwendungsnachweis (Fördermittel)
//   Finanzierungsplan je Vorhaben, Belegliste je Position, Soll/Ist mit
//   20-%-Regel (Richtwert ANBest-P), Belege außerhalb des Bewilligungszeitraums,
//   Sachbericht-Vorlage, Druck. Die Summe lässt sich als „verwendet" in die
//   Übersicht übernehmen.
// Logik: lib/versammlungObjekte.ts (getestet). SQL: supabase-sql/ps4-versammlungen-objekte.sql.
// Unterpfad von /dashboard/foerdermittel (sensibel, erbt dessen Freigabe).
// Pfad: app/dashboard/foerdermittel/nachweis/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  verwendungsAuswertung, sachberichtVorlage, offenePlatzhalter, heuteBerlin, datumDe, euroText, UEBERSCHREITUNG_PROZENT,
  type PlanPosition,
} from '@/lib/versammlungObjekte';

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
const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', color: C.textDim, fontSize: 12.5, borderBottom: `1px solid ${C.border}` };
const td: CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 };
const STUFE: Record<string, string> = { ok: C.green, gelb: C.warn, rot: C.danger };

type Vorhaben = { id: string; programm_name: string; status: string; bewilligt_betrag: number | null; verwendet_betrag: number | null; nachweis_frist: string | null; finanzplan: PlanPosition[] | null; bewilligung_von: string | null; bewilligung_bis: string | null; sachbericht: string | null };
type BelegZeile = { id: string; vorhaben_id: string; position: string; betrag: number; datum: string | null; beleg_nr: string | null; lieferant: string | null; notiz: string | null };

function zahlAus(s: string): number | null {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}

export default function VerwendungsnachweisSeite() {
  const heute = heuteBerlin();
  const [vorhaben, setVorhaben] = useState<Vorhaben[]>([]);
  const [belege, setBelege] = useState<BelegZeile[]>([]);
  const [vid, setVid] = useState('');
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ position: string; plan: string }[]>([]);
  const [zeitraum, setZeitraum] = useState({ von: '', bis: '' });
  const [sachbericht, setSachbericht] = useState('');
  const [nb, setNb] = useState({ position: '', betrag: '', datum: heute, beleg_nr: '', lieferant: '' });

  const laden = useCallback(async () => {
    setFehler(null);
    const v = await supabase.from('foerder_vorhaben').select('id, programm_name, status, bewilligt_betrag, verwendet_betrag, nachweis_frist, finanzplan, bewilligung_von, bewilligung_bis, sachbericht').order('aktualisiert_am', { ascending: false });
    if (v.error) { if (/finanzplan|bewilligung_von|sachbericht/.test(v.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + v.error.message); return; }
    setVorhaben((v.data as Vorhaben[]) ?? []);
    const b = await supabase.from('foerder_beleg').select('*').order('datum', { ascending: true });
    if (b.error && /foerder_beleg/.test(b.error.message)) { setSqlFehlt(true); return; }
    setBelege((b.data as BelegZeile[]) ?? []);
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const v = vorhaben.find((x) => x.id === vid) ?? null;
  useEffect(() => {
    if (!v) return;
    setPlan((v.finanzplan ?? []).map((p) => ({ position: p.position, plan: String(p.plan).replace('.', ',') })));
    setZeitraum({ von: v.bewilligung_von ?? '', bis: v.bewilligung_bis ?? '' });
    setSachbericht(v.sachbericht ?? '');
    setNb((n) => ({ ...n, position: (v.finanzplan ?? [])[0]?.position ?? '' }));
  }, [vid]); // eslint-disable-line react-hooks/exhaustive-deps

  const planSauber: PlanPosition[] = plan.filter((p) => p.position.trim()).map((p) => ({ position: p.position.trim(), plan: zahlAus(p.plan) ?? 0 }));
  const eigene = belege.filter((b) => b.vorhaben_id === vid);
  const aus = useMemo(() => verwendungsAuswertung(planSauber, eigene.map((b) => ({ position: b.position, betrag: Number(b.betrag) || 0, datum: b.datum, beleg_nr: b.beleg_nr })), { von: zeitraum.von || null, bis: zeitraum.bis || null }, v?.bewilligt_betrag ?? null), [planSauber, eigene, zeitraum, v]); // eslint-disable-line react-hooks/exhaustive-deps

  async function vorhabenSpeichern(extra: Record<string, unknown> = {}, meldung = 'Gespeichert.') {
    if (!v) return;
    const { error } = await supabase.from('foerder_vorhaben').update({ finanzplan: planSauber, bewilligung_von: zeitraum.von || null, bewilligung_bis: zeitraum.bis || null, sachbericht: sachbericht || null, aktualisiert_am: new Date().toISOString(), ...extra }).eq('id', v.id);
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setOk(meldung); await laden();
  }
  async function belegAnlegen() {
    const b = zahlAus(nb.betrag);
    if (!v || !nb.position.trim() || b == null) { setFehler('Position und Betrag angeben.'); return; }
    const { error } = await supabase.from('foerder_beleg').insert({ vorhaben_id: v.id, position: nb.position.trim(), betrag: b, datum: nb.datum || null, beleg_nr: nb.beleg_nr.trim() || null, lieferant: nb.lieferant.trim() || null });
    if (error) { setFehler('Speichern fehlgeschlagen: ' + error.message); return; }
    setNb({ ...nb, betrag: '', beleg_nr: '', lieferant: '' }); setOk('Beleg erfasst.'); await laden();
  }
  async function belegLoeschen(b: BelegZeile) {
    if (!window.confirm('Beleg aus der Liste entfernen?')) return;
    const { error } = await supabase.from('foerder_beleg').delete().eq('id', b.id);
    if (error) setFehler('Löschen fehlgeschlagen: ' + error.message); else await laden();
  }

  function drucken() {
    if (!v) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const zeilen = aus.zeilen.map((z) => `<tr><td>${esc(z.position)}</td><td>${euroText(z.plan)}</td><td>${euroText(z.ist)}</td><td>${euroText(z.abweichung)}</td><td>${z.prozent == null ? '—' : z.prozent.toLocaleString('de-DE') + ' %'}</td></tr>`).join('');
    const liste = eigene.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.beleg_nr ?? '')}</td><td>${datumDe(b.datum)}</td><td>${esc(b.lieferant ?? '')}</td><td>${esc(b.position)}</td><td>${euroText(Number(b.betrag))}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Verwendungsnachweis</title><style>body{font-family:Arial,sans-serif;margin:32px;font-size:12px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0 18px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}pre{white-space:pre-wrap;font-family:inherit}</style></head><body>
      <h1>Verwendungsnachweis — ${esc(v.programm_name)}</h1><p>Bewilligungszeitraum: ${datumDe(zeitraum.von)} – ${datumDe(zeitraum.bis)} · bewilligt: ${euroText(v.bewilligt_betrag)}</p>
      <h2>Zahlenmäßiger Nachweis</h2><table><tr><th>Position</th><th>Plan</th><th>Ist</th><th>Abweichung</th><th>%</th></tr>${zeilen}<tr><th>Summe</th><th>${euroText(aus.planGesamt)}</th><th>${euroText(aus.istGesamt)}</th><th colspan="2"></th></tr></table>
      <h2>Belegliste</h2><table><tr><th>Nr.</th><th>Beleg</th><th>Datum</th><th>Empfänger</th><th>Position</th><th>Betrag</th></tr>${liste}</table>
      <h2>Sachbericht</h2><pre>${esc(sachbericht)}</pre></body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  const platz = offenePlatzhalter(sachbericht);

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Fördermittel</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🧾 Verwendungsnachweis</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Beleg für Beleg gegen den Finanzierungsplan — damit am Ende nichts zurückgezahlt werden muss. <a href="/dashboard/foerdermittel" style={{ color: C.cyan }}>← Zu den Fördermitteln</a></p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Tabellen für den Verwendungsnachweis sind noch nicht eingerichtet (SQL von Paket PS4 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && (
        <div style={karte}>
          <label style={{ ...lab, marginTop: 0 }}>Vorhaben</label>
          <select style={feld} value={vid} onChange={(e) => setVid(e.target.value)}>
            <option value="">— wählen —</option>
            {vorhaben.map((x) => <option key={x.id} value={x.id}>{x.programm_name} · {x.status}{x.bewilligt_betrag ? ` · ${euroText(x.bewilligt_betrag)}` : ''}</option>)}
          </select>
          {vorhaben.length === 0 && <div style={{ color: C.textDim, marginTop: 6 }}>Legen Sie Vorhaben zuerst im Fördermittel-Assistenten an.</div>}
        </div>
      )}

      {!sqlFehlt && v && (
        <>
          <div style={karte}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Finanzierungsplan (laut Bescheid)</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label>Bewilligt von <input type="date" style={{ ...feld, width: 170 }} value={zeitraum.von} onChange={(e) => setZeitraum({ ...zeitraum, von: e.target.value })} /></label>
              <label>bis <input type="date" style={{ ...feld, width: 170 }} value={zeitraum.bis} onChange={(e) => setZeitraum({ ...zeitraum, bis: e.target.value })} /></label>
              {v.nachweis_frist && <span style={{ alignSelf: 'center', color: v.nachweis_frist < heute ? C.danger : C.textDim }}>Nachweis-Frist: {datumDe(v.nachweis_frist)}</span>}
            </div>
            {plan.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input style={feld} placeholder="Position, z. B. Personalkosten" value={p.position} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, position: e.target.value } : x)))} />
                <input style={{ ...feld, width: 150 }} placeholder="Plan €" value={p.plan} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, plan: e.target.value } : x)))} />
                <button style={knopf} onClick={() => setPlan(plan.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={knopf} onClick={() => setPlan([...plan, { position: '', plan: '' }])}>＋ Position</button>
              <button style={primaer} onClick={() => vorhabenSpeichern()}>Speichern</button>
            </div>
          </div>

          <div style={karte}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Belege</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select style={{ ...feld, width: 200 }} value={nb.position} onChange={(e) => setNb({ ...nb, position: e.target.value })}>
                <option value="">— Position —</option>{planSauber.map((p) => <option key={p.position}>{p.position}</option>)}
              </select>
              <input style={{ ...feld, width: 120 }} placeholder="Betrag €" value={nb.betrag} onChange={(e) => setNb({ ...nb, betrag: e.target.value })} />
              <input type="date" style={{ ...feld, width: 160 }} value={nb.datum} onChange={(e) => setNb({ ...nb, datum: e.target.value })} />
              <input style={{ ...feld, width: 130 }} placeholder="Beleg-Nr." value={nb.beleg_nr} onChange={(e) => setNb({ ...nb, beleg_nr: e.target.value })} />
              <input style={{ ...feld, width: 200 }} placeholder="Empfänger" value={nb.lieferant} onChange={(e) => setNb({ ...nb, lieferant: e.target.value })} />
              <button style={primaer} onClick={belegAnlegen}>＋ Beleg</button>
            </div>
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Datum</th><th style={th}>Beleg</th><th style={th}>Empfänger</th><th style={th}>Position</th><th style={th}>Betrag</th><th style={th}></th></tr></thead>
                <tbody>
                  {eigene.map((b) => {
                    const ausserhalb = aus.ausserhalb.some((x) => x.datum === b.datum && x.betrag === Number(b.betrag) && x.position === b.position);
                    return (
                      <tr key={b.id}>
                        <td style={{ ...td, color: ausserhalb ? C.danger : C.text }}>{datumDe(b.datum)}</td><td style={{ ...td, color: b.beleg_nr ? C.text : C.warn }}>{b.beleg_nr || 'fehlt'}</td>
                        <td style={td}>{b.lieferant}</td><td style={td}>{b.position}</td><td style={td}>{euroText(Number(b.betrag))}</td>
                        <td style={td}><button style={knopf} onClick={() => belegLoeschen(b)}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={karte}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Soll / Ist</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Position</th><th style={th}>Plan</th><th style={th}>Ist</th><th style={th}>Abweichung</th></tr></thead>
                <tbody>
                  {aus.zeilen.map((z) => (
                    <tr key={z.position}><td style={td}>{z.position}</td><td style={td}>{euroText(z.plan)}</td><td style={td}>{euroText(z.ist)}</td><td style={{ ...td, color: STUFE[z.stufe] }}>{euroText(z.abweichung)}{z.prozent != null ? ` (${z.prozent.toLocaleString('de-DE')} %)` : ''}</td></tr>
                  ))}
                  <tr><td style={{ ...td, fontWeight: 800 }}>Summe</td><td style={{ ...td, fontWeight: 800 }}>{euroText(aus.planGesamt)}</td><td style={{ ...td, fontWeight: 800 }}>{euroText(aus.istGesamt)}</td><td style={td}></td></tr>
                </tbody>
              </table>
            </div>
            {aus.hinweise.map((h) => <div key={h} style={{ color: /nicht|mehr als|außerhalb|keiner/.test(h) ? C.warn : C.textDim, fontSize: 13, marginTop: 4 }}>ℹ {h}</div>)}
            {aus.fehlend.length > 0 && <div style={{ color: C.warn, fontSize: 13, marginTop: 4 }}>{aus.fehlend.length} Beleg(e) ohne Belegnummer.</div>}
            <button style={{ ...knopf, marginTop: 8 }} onClick={() => vorhabenSpeichern({ verwendet_betrag: aus.istGesamt }, `„Verwendet" in der Übersicht auf ${euroText(aus.istGesamt)} gesetzt.`)}>Summe als „verwendet" übernehmen</button>
          </div>

          <div style={karte}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Sachbericht</h2>
            {!sachbericht && <button style={knopf} onClick={() => setSachbericht(sachberichtVorlage({ programm: v.programm_name, zeitraum: zeitraum.von || zeitraum.bis ? `${datumDe(zeitraum.von)} – ${datumDe(zeitraum.bis)}` : null }))}>Vorlage einsetzen</button>}
            <textarea style={{ ...feld, minHeight: 220, marginTop: 6 }} value={sachbericht} onChange={(e) => setSachbericht(e.target.value)} />
            {platz.length > 0 && <div style={{ color: C.warn, fontSize: 13 }}>Noch ausfüllen: {platz.join(', ')}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={primaer} onClick={() => vorhabenSpeichern()}>Speichern</button>
              <button style={knopf} disabled={platz.length > 0} onClick={drucken}>🖨 Nachweis drucken / PDF</button>
            </div>
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5 }}>Die {UEBERSCHREITUNG_PROZENT}-%-Regel und die 6-Monats-Frist stammen aus den Allgemeinen Nebenbestimmungen (ANBest-P) und sind Richtwerte — maßgeblich sind Ihr Zuwendungsbescheid und dessen Nebenbestimmungen.</p>
        </>
      )}
    </div>
  );
}
