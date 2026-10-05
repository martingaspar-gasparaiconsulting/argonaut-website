'use client';

// ============================================================
// ARGONAUT OS · Paket 211 (05.10.2026) · Stufe 3 B9
// Kalkulator → „Menge aus Aufmaß übernehmen": Aufmaß wählen, Positionen
// ankreuzen, Summe (gleiche Einheit) mit Rechenweg in die Kalkulation.
// Pfad: app/dashboard/kalkulator/AufmassUebernahme.tsx
// ============================================================

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { mengeAusAufmass, einheitNorm, type AufmassPosition } from '@/lib/kalkulatorAndocken';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', green: '#4CAF7D' };

type AufmassKopf = { id: string; titel: string | null; nummer: string | null; kunde_name: string | null; aufmass_datum: string | null };

export type AufmassUebernommen = { menge: number; einheit: string; aufmassId: string; rechenweg: string; titel: string };

export default function AufmassUebernahme({ onUebernehmen }: { onUebernehmen: (u: AufmassUebernommen) => void }) {
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<AufmassKopf[] | null>(null);
  const [wahl, setWahl] = useState('');
  const [pos, setPos] = useState<AufmassPosition[]>([]);
  const [haken, setHaken] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!offen || liste !== null) return;
    (async () => {
      const { data, error } = await supabase.from('aufmasse')
        .select('id, titel, nummer, kunde_name, aufmass_datum').eq('archiviert', false)
        .order('aufmass_datum', { ascending: false }).limit(60);
      if (error) { setFehler('Aufmaße konnten nicht geladen werden.'); setListe([]); return; }
      setListe((data as AufmassKopf[]) ?? []);
    })();
  }, [offen, liste]);

  useEffect(() => {
    if (!wahl) { setPos([]); setHaken([]); return; }
    (async () => {
      const { data, error } = await supabase.from('aufmass_positionen')
        .select('id, bezeichnung, menge, einheit, rechenweg').eq('aufmass_id', wahl).order('position_nr', { ascending: true });
      if (error) { setFehler('Positionen konnten nicht geladen werden.'); setPos([]); return; }
      setPos((data as AufmassPosition[]) ?? []);
      setHaken([]);
    })();
  }, [wahl]);

  const ergebnis = useMemo(() => (haken.length > 0 ? mengeAusAufmass(pos, haken) : null), [pos, haken]);
  const kopf = (liste ?? []).find((a) => a.id === wahl);

  function uebernehmen() {
    if (!ergebnis || !ergebnis.ok || !kopf) return;
    onUebernehmen({
      menge: ergebnis.menge, einheit: ergebnis.einheit, aufmassId: kopf.id, rechenweg: ergebnis.rechenweg,
      titel: [kopf.nummer, kopf.titel].filter(Boolean).join(' · ') || 'Aufmaß',
    });
    setOffen(false);
  }

  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} style={st.link}>📐 Menge aus Aufmaß übernehmen</button>
    );
  }

  return (
    <div style={st.box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <b style={{ color: C.gold, fontSize: 14 }}>Menge aus Aufmaß</b>
        <button type="button" onClick={() => setOffen(false)} style={st.link}>schließen</button>
      </div>
      {fehler && <div style={{ color: C.danger, fontSize: 13, marginTop: 6 }}>{fehler}</div>}
      {liste === null ? (
        <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>Lädt …</div>
      ) : liste.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>Noch kein Aufmaß angelegt (Menü „Aufmaß“).</div>
      ) : (
        <>
          <select value={wahl} onChange={(e) => setWahl(e.target.value)} style={st.feld}>
            <option value="">Aufmaß wählen …</option>
            {liste.map((a) => (
              <option key={a.id} value={a.id}>
                {[a.nummer, a.titel, a.kunde_name].filter(Boolean).join(' · ') || 'Aufmaß'}{a.aufmass_datum ? ` (${a.aufmass_datum.split('-').reverse().join('.')})` : ''}
              </option>
            ))}
          </select>
          {wahl && pos.length === 0 && <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>Dieses Aufmaß hat keine Positionen.</div>}
          {pos.length > 0 && (
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {pos.map((p) => (
                <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: C.text, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={haken.includes(p.id)}
                    onChange={(e) => setHaken((h) => (e.target.checked ? [...h, p.id] : h.filter((x) => x !== p.id)))}
                  />
                  <span>
                    {p.bezeichnung || 'Position'} — <b>{String(p.menge ?? '—').replace('.', ',')} {einheitNorm(p.einheit)}</b>
                    {p.rechenweg ? <span style={{ color: C.dim }}> ({p.rechenweg})</span> : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          {ergebnis && !ergebnis.ok && <div style={{ color: C.danger, fontSize: 13, marginTop: 8 }}>{ergebnis.fehler}</div>}
          {ergebnis && ergebnis.ok && (
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: C.green, fontSize: 13.5 }}>Summe: <b>{ergebnis.menge.toLocaleString('de-DE')} {ergebnis.einheit}</b> aus {ergebnis.positionen} Position{ergebnis.positionen === 1 ? '' : 'en'}</span>
              <button type="button" onClick={uebernehmen} style={st.knopf}>Übernehmen</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  link: { background: 'none', border: 'none', color: C.gold, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit', textDecoration: 'underline' },
  box: { marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', background: 'rgba(10,22,40,0.5)' },
  feld: { width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text, fontSize: 13.5, fontFamily: 'inherit' },
  knopf: { padding: '7px 14px', borderRadius: 8, border: 'none', background: C.gold, color: '#0A1628', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
