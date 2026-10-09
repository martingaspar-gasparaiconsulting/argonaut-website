'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/verleih/fahrzeuge/auslastung — V2a (Paket 293)
//
// Welches Mietfahrzeug lohnt sich? Auslastung (tatsächlich vermietete Zeit /
// Kalenderzeit), Ertrag netto aus den Rechnungen der Mieten, Ertrag je
// Miettag, Bußgeld-Vorgänge und Schäden je Fahrzeug. Dazu die Fristen aus dem
// Fuhrpark (HU, Wartung, Versicherung) mit Ampel und Buchungen, die über eine
// Frist hinausreichen. Logik: lib/fahrzeugMieteV2.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { berlinTag } from '@/lib/fahrzeugMiete';
import {
  auslastung, fristenFahrzeug, schlechteste, prozentText, zeitraumLetzte, fristText,
  type AuslastBuchung, type AuslastRechnung, type FuhrparkFristen, type Ampel,
} from '@/lib/fahrzeugMieteV2';
import { euro } from '@/lib/geld';
import Leerzustand from '../../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };
const AMPEL_FARBE: Record<Ampel, string> = { ueber: C.bad, rot: C.bad, gelb: C.warn, gruen: C.ok, keine: C.dim };

type Fz = { id: string; bezeichnung: string; kennzeichen: string | null; aktiv: boolean; fahrzeug_id: string | null };
type Bu = AuslastBuchung & { nummer: string | null };

/** Alle Zeilen in Seiten zu 1.000 (Supabase liefert höchstens 1.000 je Abfrage). */
async function alle<T>(abfrage: (von: number, bis: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ daten: T[]; fehler: boolean }> {
  const daten: T[] = [];
  for (let von = 0; von < 20_000; von += 1000) {
    const { data, error } = await abfrage(von, von + 999);
    if (error) return { daten, fehler: true };
    const teil = (data as T[] | null) ?? [];
    daten.push(...teil);
    if (teil.length < 1000) break;
  }
  return { daten, fehler: false };
}
function datum(iso: string): string { const [j, m, t] = iso.split('-'); return `${t}.${m}.${j}`; }

export default function AuslastungPage() {
  const [fz, setFz] = useState<Fz[]>([]);
  const [bu, setBu] = useState<Bu[]>([]);
  const [re, setRe] = useState<AuslastRechnung[]>([]);
  const [vo, setVo] = useState<{ fahrzeug_id: string; tatzeit: string }[]>([]);
  const [sc, setSc] = useState<{ fahrzeug_id: string; erfasst_am: string }[]>([]);
  const [fristen, setFristen] = useState<Record<string, FuhrparkFristen>>({});
  const [fuhrparkSichtbar, setFuhrparkSichtbar] = useState(true);
  const [rechnungenSichtbar, setRechnungenSichtbar] = useState(true);
  const [tage, setTage] = useState(90);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [jetzt, setJetzt] = useState(() => Date.now());

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setLaden(false); return; }
    const [f, b, v, s] = await Promise.all([
      supabase.from('miet_fahrzeug').select('id, bezeichnung, kennzeichen, aktiv, fahrzeug_id').order('bezeichnung').limit(1000),
      alle<Bu>((von, bis) => supabase.from('miet_buchung').select('id, nummer, fahrzeug_id, status, abholung, rueckgabe_plan, uebergabe_am, rueckgabe_ist, rechnung_id').neq('status', 'storniert').order('abholung').range(von, bis)),
      supabase.from('miet_vorgang').select('fahrzeug_id, tatzeit').limit(1000),
      supabase.from('miet_schaden').select('fahrzeug_id, erfasst_am').limit(1000),
    ]);
    if (f.error || b.fehler) setFehler('Die Fahrzeugvermietung ist noch nicht eingerichtet oder Ihnen fehlt das Recht „Verleih & Vermietung".');
    const flotte = (f.data as Fz[] | null) ?? [];
    setFz(flotte);
    setBu(b.daten);
    setVo((v.data as { fahrzeug_id: string; tatzeit: string }[] | null) ?? []);
    setSc((s.data as { fahrzeug_id: string; erfasst_am: string }[] | null) ?? []);

    // Rechnungen der Mieten (in Stücken zu 200 Kennungen)
    const ids = b.daten.map((x) => x.rechnung_id).filter((x): x is string => !!x);
    const rech: AuslastRechnung[] = [];
    let rechOk = true;
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('rechnungen').select('id, netto_summe, zahlungsstatus').in('id', ids.slice(i, i + 200));
      if (error) { rechOk = false; break; }
      rech.push(...((data as AuslastRechnung[] | null) ?? []));
    }
    setRe(rech);
    setRechnungenSichtbar(rechOk && (ids.length === 0 || rech.length > 0));

    // Fristen aus dem Fuhrpark (nur verknüpfte Fahrzeuge)
    const fpIds = flotte.map((x) => x.fahrzeug_id).filter((x): x is string => !!x);
    if (fpIds.length) {
      const { data, error } = await supabase.from('fahrzeuge').select('id, tuev_bis, wartung_bis, versicherung_bis').in('id', fpIds);
      setFuhrparkSichtbar(!error);
      const m: Record<string, FuhrparkFristen> = {};
      for (const r of ((data ?? []) as (FuhrparkFristen & { id: string })[])) m[r.id] = { tuev_bis: r.tuev_bis, wartung_bis: r.wartung_bis, versicherung_bis: r.versicherung_bis };
      setFristen(m);
    }
    setJetzt(Date.now());
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const heute = berlinTag(jetzt);
  const zr = useMemo(() => zeitraumLetzte(tage, heute), [tage, heute]);
  const ausw = useMemo(() => auslastung({ fahrzeuge: fz, buchungen: bu, rechnungen: re, vorgaenge: vo, schaeden: sc, von: zr.von, bis: zr.bis, jetzt }), [fz, bu, re, vo, sc, zr, jetzt]);
  const zeilen = useMemo(() => [...ausw.zeilen].sort((a, b) => b.quote - a.quote), [ausw]);
  const fzById = useMemo(() => new Map(fz.map((f) => [f.id, f])), [fz]);
  const fristListe = useMemo(() => fz.filter((f) => f.aktiv).map((f) => {
    const liste = fristenFahrzeug(f.fahrzeug_id ? fristen[f.fahrzeug_id] ?? null : null, bu.filter((b) => b.fahrzeug_id === f.id), heute);
    return { f, liste, schlimmste: schlechteste(liste.map((x) => x.ampel)) };
  }), [fz, fristen, bu, heute]);
  const fristWarnung = fristListe.filter((x) => ['ueber', 'rot', 'gelb'].includes(x.schlimmste) || x.liste.some((y) => y.konflikte.length)).length;
  const maxNetto = Math.max(1, ...zeilen.map((z) => z.netto_cent));

  return (
    <div style={st.page}>
      <a href="/dashboard/verleih/fahrzeuge" style={st.zurueck}>← Fahrzeugvermietung</a>
      <h1 style={st.h1}>📊 Auslastung, Ertrag &amp; Fristen</h1>
      <p style={st.dim}>
        So geht&apos;s: Wählen Sie den Zeitraum. Auslastung ist die tatsächlich vermietete Zeit (Übergabe bis Rückgabe) geteilt durch die Kalenderzeit — Reservierungen zählen erst,
        wenn gefahren wird. Der Ertrag ist das Netto der Rechnungen der Mieten, die im Zeitraum zurückgegeben wurden. Unten sehen Sie HU-, Wartungs- und Versicherungsfristen
        aus dem Fuhrpark und Buchungen, die über eine Frist hinausreichen.
      </p>
      {fehler && <p style={{ ...st.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {laden && <p style={st.dim}>Lädt …</p>}

      {!laden && fz.length === 0 && (
        <Leerzustand icon="📊" titel="Noch keine Mietfahrzeuge" text="Sobald Ihre Mietflotte angelegt ist und Mieten zurückkommen, sehen Sie hier, welches Fahrzeug sich lohnt." aktionText="Zur Fahrzeugvermietung" onAktion={() => { window.location.href = '/dashboard/verleih/fahrzeuge'; }} />
      )}

      {!laden && fz.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px', alignItems: 'center' }}>
            {[30, 90, 365].map((n) => <button key={n} type="button" style={tage === n ? st.tabAn : st.tab} onClick={() => setTage(n)}>{n === 365 ? '12 Monate' : `${n} Tage`}</button>)}
            <span style={{ ...st.dim, margin: 0 }}>{datum(zr.von)} bis {datum(zr.bis)}</span>
            <a href="/dashboard/verleih/fahrzeuge/bussgelder" style={{ ...st.tab, textDecoration: 'none', marginLeft: 'auto' }}>🚨 Bußgelder &amp; Halteranfragen</a>
          </div>

          <div style={st.kacheln}>
            <div style={st.kachel}><b style={st.zahl}>{prozentText(ausw.gesamt.quote)}</b><span style={st.dim}>Auslastung der Flotte</span></div>
            <div style={st.kachel}><b style={st.zahl}>{ausw.gesamt.belegt_tage.toLocaleString('de-DE')}</b><span style={st.dim}>vermietete Tage</span></div>
            <div style={st.kachel}><b style={st.zahl}>{rechnungenSichtbar ? euro(ausw.gesamt.netto_cent / 100) : '—'}</b><span style={st.dim}>Ertrag netto</span></div>
            <div style={{ ...st.kachel, borderColor: fristWarnung ? C.warn : C.border }}><b style={{ ...st.zahl, color: fristWarnung ? C.warn : C.text }}>{fristWarnung}</b><span style={st.dim}>Fahrzeuge mit Frist-Hinweis</span></div>
          </div>
          {!rechnungenSichtbar && <p style={{ ...st.dim, color: C.warn }}>Den Ertrag sieht, wer Rechnungen sehen darf — Auslastung und Fristen stimmen trotzdem.</p>}

          <div style={{ overflowX: 'auto' }}>
            <table style={st.tabelle}>
              <thead><tr>
                <th style={{ ...st.th, textAlign: 'left' }}>Fahrzeug</th><th style={st.th}>Mieten</th><th style={st.th}>vermietet</th><th style={{ ...st.th, minWidth: 160 }}>Auslastung</th>
                <th style={{ ...st.th, minWidth: 140 }}>Ertrag netto</th><th style={st.th}>je Miettag</th><th style={st.th}>ohne Rechnung</th><th style={st.th}>Bußgeld-Vorgänge</th><th style={st.th}>Schäden</th>
              </tr></thead>
              <tbody>
                {zeilen.map((z) => {
                  const f = fzById.get(z.fahrzeug_id);
                  const farbe = z.quote >= 0.6 ? C.ok : z.quote >= 0.3 ? C.gold : C.warn;
                  return (
                    <tr key={z.fahrzeug_id} style={{ opacity: f?.aktiv === false ? 0.55 : 1 }}>
                      <td style={{ ...st.td, textAlign: 'left' }}>{f?.bezeichnung ?? '—'}<div style={{ color: C.dim, fontSize: 12 }}>{[f?.kennzeichen, f?.aktiv === false ? 'nicht mehr in der Flotte' : null].filter(Boolean).join(' · ')}</div></td>
                      <td style={st.td}>{z.mieten}</td>
                      <td style={st.td}>{z.belegt_tage.toLocaleString('de-DE')} T.</td>
                      <td style={st.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${Math.round(z.quote * 100)}%`, height: '100%', background: farbe }} /></div>
                          <span style={{ minWidth: 52, textAlign: 'right', color: farbe, fontWeight: 700 }}>{prozentText(z.quote)}</span>
                        </div>
                      </td>
                      <td style={st.td}>
                        {rechnungenSichtbar ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${Math.round((z.netto_cent / maxNetto) * 100)}%`, height: '100%', background: C.gold }} /></div>
                          <span style={{ minWidth: 70, textAlign: 'right' }}>{euro(z.netto_cent / 100)}</span>
                        </div> : '—'}
                      </td>
                      <td style={st.td}>{rechnungenSichtbar && z.je_miettag_cent !== null ? euro(z.je_miettag_cent / 100) : '—'}</td>
                      <td style={{ ...st.td, color: z.ohne_rechnung ? C.warn : C.dim }}>{z.ohne_rechnung || '—'}</td>
                      <td style={{ ...st.td, color: z.vorgaenge ? C.warn : C.dim }}>{z.vorgaenge || '—'}</td>
                      <td style={{ ...st.td, color: z.schaeden ? C.warn : C.dim }}>{z.schaeden || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ ...st.dim, fontSize: 12.5 }}>„ohne Rechnung": im Zeitraum zurückgegebene Mieten, für die (noch) keine gültige Rechnung verknüpft ist. Kaution und Schadenersatz zählen nicht zum Ertrag.</p>

          <h2 style={st.h2}>🛠 Fristen aus dem Fuhrpark</h2>
          {!fuhrparkSichtbar && <p style={{ ...st.dim, color: C.warn }}>Die Fristen sieht, wer den Fuhrpark sehen darf.</p>}
          <div style={{ overflowX: 'auto' }}>
            <table style={st.tabelle}>
              <thead><tr><th style={{ ...st.th, textAlign: 'left' }}>Fahrzeug</th><th style={{ ...st.th, textAlign: 'left' }}>Fristen</th><th style={{ ...st.th, textAlign: 'left' }}>Buchungen über die Frist hinaus</th></tr></thead>
              <tbody>
                {fristListe.map(({ f, liste }) => (
                  <tr key={f.id}>
                    <td style={{ ...st.td, textAlign: 'left' }}>{f.bezeichnung}<div style={{ color: C.dim, fontSize: 12 }}>{f.kennzeichen ?? ''}</div></td>
                    <td style={{ ...st.td, textAlign: 'left' }}>
                      {!f.fahrzeug_id
                        ? <span style={{ color: C.dim }}>nicht mit dem Fuhrpark verknüpft — in der Mietflotte unter „ändern“ wählen</span>
                        : liste.length === 0 ? <span style={{ color: C.dim }}>keine Fristen im Fuhrpark eingetragen — <a href={`/dashboard/erp/fuhrpark/${f.fahrzeug_id}`} style={{ color: C.gold }}>eintragen</a></span>
                          : liste.map((x) => <div key={x.name} style={{ color: AMPEL_FARBE[x.ampel] }}>● {x.name}: {datum(x.frist)} <span style={{ color: C.dim }}>({fristText(x.tage)})</span></div>)}
                    </td>
                    <td style={{ ...st.td, textAlign: 'left' }}>
                      {liste.some((x) => x.konflikte.length)
                        ? liste.filter((x) => x.konflikte.length).map((x) => <div key={x.name} style={{ color: C.warn }}>{x.name}: {x.konflikte.join(', ')}</div>)
                        : <span style={{ color: C.dim }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1200, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '10px 0 6px' },
  h2: { fontSize: 18, margin: '26px 0 4px', color: C.gold },
  dim: { color: C.dim, fontSize: 14, lineHeight: 1.55, margin: '4px 0 10px' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '6px 0 14px' },
  kachel: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 2 },
  zahl: { fontSize: 22, fontWeight: 800 },
  tab: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 20, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600 },
  tabAn: { background: 'rgba(201,168,76,0.15)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 20, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700 },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginTop: 10 },
  th: { textAlign: 'center', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { textAlign: 'center', padding: '7px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
};
