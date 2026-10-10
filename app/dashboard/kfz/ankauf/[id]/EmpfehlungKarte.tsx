'use client';

// ============================================================
// ARGONAUT OS · Paket 308 · FM4 — Karte „🎯 Bewertungs-Empfehlung" im Reiter „Bewertung"
// Aus belegten Werten: Marktvergleich am Ankauf, DAT/Schwacke aus dem eigenen
// Konto, Zu- und Abschläge des Autohauses (⚙, nur Geschäftsleitung) und den
// Kosten der Bewertungsrechnung -> empfohlener Verkaufspreis, höchster
// Einkaufspreis, Rechenweg, Begründung (lib/kfzEmpfehlung.ts). Keine KI.
// „Als geplanten Verkaufspreis übernehmen" trägt nur ins Formular ein —
// gespeichert wird erst mit „💾 Bewertung speichern".
// ============================================================

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl, zahlFeld } from '@/lib/zahlen';
import { type Vergleich } from '@/lib/kfzMarkt';
import { befundAmpel, befundBereinigen } from '@/lib/fahrzeugMappeAntwort';
import { ANKAUF_MODUL, type BewertungEingabe } from '@/lib/kfzAnkauf';
import {
  MERKMALE, PROZENT_MAX, besichtigungBereinigen, empfehlung, hatZuschlaege, merkmalWerte, zuschlaegeBereinigen, type Zuschlaege,
} from '@/lib/kfzEmpfehlung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.22)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };

export type AnkaufFuerEmpfehlung = {
  id: string; owner_user_id: string; km_stand: number | null; erstzulassung: string | null;
  serviceheft: string | null; vorbesitzer: number | null; unfall_angabe: string | null; historie_befund?: unknown;
  bewertung_anbieter?: string | null; bewertung_ek?: number | null; bewertung_vk?: number | null; bewertung_am?: string | null;
  empfehlung?: unknown;
};

function heute(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function euro(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} €`;
}
const ANBIETER: Record<string, string> = { dat: 'DAT', schwacke: 'Schwacke', sonstige: 'Bewertung' };

export default function EmpfehlungKarte({ a, istChef, darfSchreiben, kosten, neuLaden, onVk }: {
  a: AnkaufFuerEmpfehlung; istChef: boolean; darfSchreiben: boolean; kosten: Omit<BewertungEingabe, 'zielVk'>;
  neuLaden: number; onVk: (vk: number) => void;
}) {
  const [vergleiche, setVergleiche] = useState<Vergleich[]>([]);
  const [einst, setEinst] = useState<Record<string, unknown>>({});
  const [zuschlaege, setZuschlaege] = useState<Zuschlaege>({});
  const [besicht, setBesicht] = useState(() => besichtigungBereinigen(a.empfehlung));
  const [zOffen, setZOffen] = useState(false);
  const [zEntwurf, setZEntwurf] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const lade = useCallback(async () => {
    const [v, e] = await Promise.all([
      supabase.from('kfz_marktvergleich').select('preis, km, erstzulassung, erfasst_am').eq('ankauf_id', a.id).limit(200),
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', a.owner_user_id).eq('modul', ANKAUF_MODUL).maybeSingle(),
    ]);
    setVergleiche(((v.data as unknown as Vergleich[]) ?? []).map((z) => ({ ...z, preis: z.preis === null ? null : Number(z.preis) })));
    const roh = ((e.data as { einstellung?: Record<string, unknown> } | null)?.einstellung) ?? {};
    setEinst(roh);
    setZuschlaege(zuschlaegeBereinigen(roh.zuschlaege));
  }, [a.id, a.owner_user_id]);
  useEffect(() => { void lade(); }, [lade, neuLaden]);
  useEffect(() => { setBesicht(besichtigungBereinigen(a.empfehlung)); }, [a.empfehlung]);

  const historie = useMemo(() => {
    const b = befundBereinigen(a.historie_befund);
    const amp = befundAmpel(b);
    return amp === 'dim' ? null : amp;
  }, [a.historie_befund]);

  const merkmale = useMemo(() => merkmalWerte({
    serviceheft: a.serviceheft, vorbesitzer: a.vorbesitzer, unfall_angabe: a.unfall_angabe, historie_ampel: historie, empfehlung: besicht,
  }), [a.serviceheft, a.vorbesitzer, a.unfall_angabe, historie, besicht]);

  const e = useMemo(() => empfehlung({
    fahrzeug: { km: a.km_stand, erstzulassung: a.erstzulassung },
    vergleiche,
    dat: a.bewertung_ek != null || a.bewertung_vk != null
      ? { anbieter: ANBIETER[String(a.bewertung_anbieter ?? 'sonstige')] ?? 'Bewertung', ek: a.bewertung_ek != null ? Number(a.bewertung_ek) : null, vk: a.bewertung_vk != null ? Number(a.bewertung_vk) : null, am: a.bewertung_am ?? null }
      : null,
    merkmale, zuschlaege, kosten, heuteIso: heute(),
  }), [a, vergleiche, merkmale, zuschlaege, kosten]);

  async function besichtigungSetzen(key: 'zustand' | 'nichtraucher', wert: string) {
    const neu = besichtigungBereinigen({ ...besicht, [key]: wert || undefined });
    setBesicht(neu); setMeldung(null);
    const { error } = await supabase.from('kfz_ankauf').update({ empfehlung: neu, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
    if (error) setMeldung({ ok: false, text: 'Nicht gespeichert. Schreibrecht „KFZ" und SQL Paket 308?' });
  }

  function zOeffnen() {
    const d: Record<string, Record<string, string>> = {};
    for (const m of MERKMALE) { d[m.key] = {}; for (const o of m.optionen) d[m.key][o.key] = zuschlaege[m.key]?.[o.key] ? zahlFeld(zuschlaege[m.key][o.key]) : ''; }
    setZEntwurf(d); setZOffen(true);
  }

  async function zSpeichern() {
    if (!istChef) return;
    const roh: Record<string, Record<string, number>> = {};
    for (const [m, o] of Object.entries(zEntwurf)) for (const [k, v] of Object.entries(o)) {
      if (!v.trim()) continue;
      const n = leseZahl(v);
      if (n === null || !Number.isFinite(n) || Math.abs(n) > PROZENT_MAX) { setMeldung({ ok: false, text: `Bitte nur Prozentwerte zwischen −${PROZENT_MAX} und +${PROZENT_MAX} eintragen.` }); return; }
      (roh[m] = roh[m] ?? {})[k] = n;
    }
    const z = zuschlaegeBereinigen(roh);
    setBusy(true); setMeldung(null);
    try {
      // Frisch lesen und nur „zuschlaege" ersetzen — Richtwerte und Online-Schalter bleiben unberührt.
      const { data } = await supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', a.owner_user_id).eq('modul', ANKAUF_MODUL).maybeSingle();
      const aktuell = ((data as { einstellung?: Record<string, unknown> } | null)?.einstellung) ?? einst;
      const { error } = await supabase.from('modul_einstellung').upsert({ owner_user_id: a.owner_user_id, modul: ANKAUF_MODUL, einstellung: { ...aktuell, zuschlaege: z }, aktualisiert_am: new Date().toISOString() }, { onConflict: 'owner_user_id,modul' });
      if (error) { setMeldung({ ok: false, text: 'Zu- und Abschläge ließen sich nicht speichern.' }); return; }
      setZOffen(false); setMeldung({ ok: true, text: 'Zu- und Abschläge gespeichert.' }); await lade();
    } finally { setBusy(false); }
  }

  const farbeBasis = e.basis === 'keine' ? C.warn : C.gold;

  return (
    <div style={s.karte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={s.h3}>🎯 Bewertungs-Empfehlung</h3>
          <div style={s.dim}>Aus Ihren Marktvergleichen, dem DAT/Schwacke-Wert und Ihren eigenen Zu- und Abschlägen — mit Rechenweg. Es ist eine Empfehlung; die Entscheidung treffen Sie. ARGONAUT schätzt keine Preise.</div>
        </div>
        {istChef && <button style={s.btn} onClick={zOeffnen}>⚙ Zu- und Abschläge</button>}
      </div>

      <div style={s.zahlen}>
        <div style={s.zahl}><span style={s.dim}>Marktspanne</span><b>{e.spanne ? `${euro(e.spanne.q1)} – ${euro(e.spanne.q3)}` : '—'}</b><span style={s.dim}>{e.spanne ? `Mitte ${euro(e.basis === 'markt' ? e.basisWert : null)} · ${e.spanne.anzahl} Angebote` : 'zu wenige Vergleiche'}</span></div>
        <div style={{ ...s.zahl, borderColor: farbeBasis }}><span style={s.dim}>Empfohlener Verkaufspreis</span><b style={{ color: C.gold, fontSize: 22 }}>{euro(e.vk)}</b><span style={s.dim}>{e.basis === 'markt' ? 'aus der Marktmitte' : e.basis === 'dat' ? `aus dem ${e.dat?.anbieter ?? 'DAT'}-Wert` : 'keine Empfehlung'}{e.prozentSumme ? ` · ${e.prozentSumme > 0 ? '+' : ''}${e.prozentSumme.toLocaleString('de-DE')} %` : ''}</span></div>
        <div style={s.zahl}><span style={s.dim}>Höchster Einkaufspreis</span><b style={{ fontSize: 22 }}>{e.maxEk !== null ? euro(e.maxEk) : '—'}</b><span style={s.dim}>{e.besteuerung === '25a' ? 'Zahlbetrag, § 25a' : `netto${e.maxEkBrutto !== null ? `, brutto ${euro(e.maxEkBrutto)}` : ''}`}{e.datEkAbweichung !== null ? ` · ${e.dat?.anbieter ?? 'DAT'}-EK ${e.datEkAbweichung > 0 ? '+' : ''}${e.datEkAbweichung.toLocaleString('de-DE')} %` : ''}</span></div>
      </div>

      {e.hinweise.map((h, i) => <div key={i} style={{ ...s.hinweis, borderColor: i === 0 && e.basis === 'keine' ? C.warn : C.border }}>{h}</div>)}

      <div style={s.lab}>Merkmale</div>
      <div style={s.merkmale}>
        {MERKMALE.map((m) => {
          const w = merkmale[m.key];
          const p = w ? zuschlaege[m.key]?.[w] ?? 0 : 0;
          if (m.quelle === 'besichtigung') {
            const k = m.key as 'zustand' | 'nichtraucher';
            return (
              <label key={m.key} style={s.merkmal}>
                <span style={s.dim}>{m.titel}</span>
                <select style={s.inp} disabled={!darfSchreiben} value={besicht[k] ?? ''} onChange={(ev) => void besichtigungSetzen(k, ev.target.value)}>
                  <option value="">— noch nicht beurteilt —</option>
                  {m.optionen.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                {p !== 0 && <span style={{ fontSize: 12, color: p > 0 ? C.ok : C.warn }}>{p > 0 ? '+' : ''}{p.toLocaleString('de-DE')} %</span>}
              </label>
            );
          }
          return (
            <div key={m.key} style={s.merkmal}>
              <span style={s.dim}>{m.titel}</span>
              <b style={{ fontSize: 13.5 }}>{w ? m.optionen.find((o) => o.key === w)?.label : <span style={s.dim}>unbekannt</span>}</b>
              {p !== 0 && <span style={{ fontSize: 12, color: p > 0 ? C.ok : C.warn }}>{p > 0 ? '+' : ''}{p.toLocaleString('de-DE')} %</span>}
            </div>
          );
        })}
      </div>
      <div style={{ ...s.dim, marginTop: 6 }}>Serviceheft, Vorbesitzer und Unfall kommen aus „Fahrzeug und Verkäufer", die Historie aus der Fahrzeugmappe. Schäden zählen als Kosten (Reiter „Schäden"), nicht als Abschlag.{!hatZuschlaege(zuschlaege) ? ' Noch keine Zu- und Abschläge eingestellt — ' + (istChef ? 'über „⚙ Zu- und Abschläge".' : 'das macht die Geschäftsleitung.') : ''}</div>

      {e.vk !== null && (
        <>
          <div style={s.lab}>Begründung</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{e.begruendung}</div>
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', color: C.gold, fontWeight: 700, fontSize: 13 }}>Rechenweg</summary>
            <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>{e.rechenweg.map((r, i) => <div key={i} style={{ fontSize: 13 }}>{r}</div>)}</div>
          </details>
          {darfSchreiben && <button style={s.gold} onClick={() => onVk(e.vk as number)}>Als geplanten Verkaufspreis übernehmen</button>}
        </>
      )}
      {meldung && <div style={{ ...s.dim, color: meldung.ok ? C.ok : C.bad, marginTop: 6 }} role={meldung.ok ? 'status' : 'alert'}>{meldung.text}</div>}

      {zOffen && (
        <div style={s.overlay} role="dialog" aria-modal="true" onClick={() => setZOffen(false)}>
          <div style={s.dialog} onClick={(ev) => ev.stopPropagation()}>
            <h3 style={s.h3}>⚙ Zu- und Abschläge (in % des Marktwerts)</h3>
            <div style={s.dim}>Legen Sie selbst fest, wie stark ein Merkmal den Verkaufspreis hebt (+) oder senkt (−). Leer = 0 %. Je Merkmal höchstens ±{PROZENT_MAX} %, alle zusammen höchstens ±40 %. Gilt für alle Ankäufe Ihres Betriebs.</div>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              {MERKMALE.map((m) => (
                <div key={m.key}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{m.titel}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                    {m.optionen.map((o) => (
                      <label key={o.key} style={s.labKlein}>{o.label}
                        <input style={s.inp} inputMode="decimal" placeholder="0" value={zEntwurf[m.key]?.[o.key] ?? ''}
                          onChange={(ev) => setZEntwurf({ ...zEntwurf, [m.key]: { ...zEntwurf[m.key], [o.key]: ev.target.value } })} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button style={{ ...s.gold, marginTop: 0, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void zSpeichern()}>💾 Speichern</button>
              <button style={s.btn} onClick={() => setZOffen(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.gold}`, borderRadius: 12, padding: 16, minWidth: 0, display: 'grid', gap: 8 },
  h3: { margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: C.text },
  dim: { color: C.dim, fontSize: 12.5, lineHeight: 1.5 },
  lab: { color: C.dim, fontSize: 12, fontWeight: 700, marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.04em' },
  labKlein: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim, minWidth: 0 },
  zahlen: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 6 },
  zahl: { display: 'grid', gap: 2, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 },
  hinweis: { border: '1px solid', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: C.text },
  merkmale: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 },
  merkmal: { display: 'grid', gap: 3, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', minWidth: 0 },
  inp: { background: C.navy3, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 9px', fontSize: 13.5, minWidth: 0 },
  btn: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  gold: { background: C.gold, border: 0, color: C.navy, borderRadius: 8, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', marginTop: 8, width: 'fit-content' },
  overlay: { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(5,10,20,0.8)', display: 'grid', placeItems: 'center', padding: 12 },
  dialog: { width: 'min(760px, 100%)', maxHeight: '92vh', overflow: 'auto', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, color: C.text },
};
