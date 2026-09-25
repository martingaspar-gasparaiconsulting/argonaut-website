'use client';

// ============================================================
// ARGONAUT OS · Paket PS5 · Check-in am Tresen (Studio / Verein)
//   Mitglied suchen → Ampel (aktiv / pausiert / abgelaufen / beginnt erst) →
//   einchecken (kein Doppel-Check-in am selben Tag). Heute da, Auslastung je
//   Stunde der letzten 4 Wochen, „lange nicht mehr da gewesen" (Kündigungsgefahr).
// Logik: lib/gebuehrenHonorare.ts (getestet). SQL: supabase-sql/ps5-gebuehren-honorare.sql.
// Unterpfad von /dashboard/mitglieder (sensibel wie das Modul). Mitarbeiter mit
// Mitglieder-Freigabe dürfen einchecken; löschen nur der Chef.
// Pfad: app/dashboard/mitglieder/checkin/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  checkinPruefung, auslastung, langeNichtDa, heuteSchonDa, berlinTeile, datumDe, heuteBerlin, plusTage,
  type CheckinMitglied,
} from '@/lib/gebuehrenHonorare';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800, fontSize: 15 };
const zeile: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: `1px solid ${C.border}`, fontSize: 14.5, flexWrap: 'wrap', alignItems: 'center' };
const AMPEL: Record<string, string> = { ok: C.green, gelb: C.warn, rot: C.danger };

type M = CheckinMitglied & { mitglieds_nr?: string | null };
type Ci = { id: string; mitglied_id: string; zeit: string };

export default function CheckinSeite() {
  const heute = heuteBerlin();
  const [mitglieder, setMitglieder] = useState<M[]>([]);
  const [checkins, setCheckins] = useState<Ci[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [suche, setSuche] = useState('');

  const laden = useCallback(async () => {
    setFehler(null);
    const ab = plusTage(heute, -90);
    const c = await supabase.from('mitglied_checkin').select('id, mitglied_id, zeit').gte('zeit', `${ab}T00:00:00Z`).order('zeit', { ascending: false }).limit(20000);
    if (c.error) { if (/mitglied_checkin/.test(c.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + c.error.message); return; }
    setCheckins((c.data as Ci[]) ?? []);
    const m1 = await supabase.from('mitglieder').select('id, name, status, kuendigung_zum, beginn_am, mitglieds_nr').order('name', { ascending: true });
    // Ohne PS5-SQL fehlt mitglieds_nr — dann ohne diese Spalte laden (eigene Variable, sonst passt der Typ nicht).
    const mDaten: unknown = m1.error ? (await supabase.from('mitglieder').select('id, name, status, kuendigung_zum, beginn_am').order('name', { ascending: true })).data : m1.data;
    setMitglieder((mDaten as M[] | null) ?? []);
  }, [heute]);
  useEffect(() => { laden(); }, [laden]);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return mitglieder.filter((m) => m.name.toLowerCase().includes(q) || (m.mitglieds_nr ?? '').toLowerCase() === q).slice(0, 12);
  }, [suche, mitglieder]);
  const heuteDa = checkins.filter((c) => berlinTeile(c.zeit)?.datum === heute);
  const last = useMemo(() => auslastung(checkins, plusTage(heute, -27), heute), [checkins, heute]);
  const weg = useMemo(() => langeNichtDa(mitglieder, checkins, heute, 30), [mitglieder, checkins, heute]);
  const maxStunde = Math.max(1, ...last.jeStunde);
  const name = (id: string) => mitglieder.find((m) => m.id === id)?.name ?? '—';

  async function einchecken(m: M) {
    setFehler(null); setOk(null);
    const p = checkinPruefung(m, heute);
    if (heuteSchonDa(m.id, checkins, heute)) { setOk(`${m.name} ist heute schon eingecheckt.`); return; }
    if (p.stufe === 'rot' && !window.confirm(`${m.name}: ${p.text} Trotzdem einchecken?`)) return;
    const { error } = await supabase.from('mitglied_checkin').insert({ mitglied_id: m.id });
    if (error) { setFehler('Check-in fehlgeschlagen: ' + error.message); return; }
    setOk(`✅ ${m.name} eingecheckt.`); setSuche(''); await laden();
  }

  return (
    <div style={{ color: C.text, maxWidth: 1100, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Mitglieder & Abos</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>✅ Check-in</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Wer kommt, wer darf — und wer war lange nicht mehr da. <a href="/dashboard/mitglieder" style={{ color: C.cyan }}>← Zu Mitglieder & Abos</a></p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Der Check-in ist noch nicht eingerichtet (SQL von Paket PS5 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green, fontSize: 16 }}>{ok}</div>}

      {!sqlFehlt && (
        <>
          <div style={karte}>
            <input autoFocus style={{ ...feld, width: '100%' }} placeholder="Name oder Mitgliedsnummer eingeben …" value={suche} onChange={(e) => setSuche(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && treffer.length === 1) einchecken(treffer[0]); }} />
            {treffer.map((m) => {
              const p = checkinPruefung(m, heute);
              const schon = heuteSchonDa(m.id, checkins, heute);
              return (
                <div key={m.id} style={zeile}>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: AMPEL[p.stufe], marginRight: 8 }} /><b>{m.name}</b>{m.mitglieds_nr ? ` · ${m.mitglieds_nr}` : ''} <span style={{ color: AMPEL[p.stufe], fontSize: 13 }}>{p.text}</span></span>
                  {schon ? <span style={{ color: C.textDim }}>heute schon da</span> : <button style={primaer} onClick={() => einchecken(m)}>Einchecken</button>}
                </div>
              );
            })}
            {suche.trim() && treffer.length === 0 && <div style={{ color: C.textDim, marginTop: 8 }}>Kein Mitglied gefunden.</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            <div style={karte}>
              <b>Heute da: {heuteDa.length}</b>
              {heuteDa.slice(0, 40).map((c) => { const t = berlinTeile(c.zeit); return <div key={c.id} style={{ ...zeile, fontSize: 13.5 }}><span>{name(c.mitglied_id)}</span><span style={{ color: C.textDim }}>{t ? `${String(t.stunde).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` : ''}</span></div>; })}
            </div>
            <div style={karte}>
              <b>Auslastung je Stunde (Ø letzte 4 Wochen)</b>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 110, marginTop: 10 }}>
                {last.jeStunde.map((n, h) => (
                  <div key={h} style={{ flex: 1, textAlign: 'center' }} title={`${h}–${h + 1} Uhr: Ø ${n.toLocaleString('de-DE')}`}>
                    <div style={{ background: C.gold, height: Math.round((n / maxStunde) * 85), borderRadius: 2 }} />
                    <div style={{ fontSize: 9.5, color: C.textDim }}>{h % 3 === 0 ? h : ''}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>{last.gesamt} Check-ins in {last.tage} Tagen.</div>
            </div>
          </div>

          <div style={karte}>
            <b>Seit 30 Tagen nicht mehr da ({weg.length})</b>
            <div style={{ color: C.textDim, fontSize: 12.5 }}>Aktive, ungekündigte Mitglieder — ein guter Anlass für einen freundlichen Anruf.</div>
            {weg.slice(0, 50).map((w) => <div key={w.id} style={{ ...zeile, fontSize: 13.5 }}><span>{w.name}</span><span style={{ color: C.warn }}>{w.letzter ? `zuletzt ${datumDe(w.letzter)} (${w.tageWeg} Tage)` : 'über 90 Tage nicht da oder noch nie'}</span></div>)}
          </div>
        </>
      )}
    </div>
  );
}
