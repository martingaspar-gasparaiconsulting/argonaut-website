'use client';

// ============================================================
// ARGONAUT OS · Material-Abrufe im Büro (Paket PB · B28)
// Steht oben auf der Einkaufsseite, sobald Monteure etwas angefordert haben.
// Das Büro setzt den Status (bestellt / liegt bereit / erledigt / abgelehnt)
// und kann eine kurze Antwort mitgeben — der Monteur sieht beides am Einsatz.
// Sortierung und Statuswege: lib/materialAbruf.ts (getestet).
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ABRUF_STATUS, NAECHSTE, istStatus, sortiereAbrufe, zaehleAbrufe, type AbrufStatus } from '@/lib/materialAbruf';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const FARBE: Record<string, string> = { gold: C.gold, cyan: C.cyan, green: C.green, textDim: C.textDim, danger: C.danger };

type Zeile = {
  id: string; bezeichnung: string; menge: number | string; einheit: string | null;
  benoetigt_bis: string | null; notiz: string | null; status: string; antwort: string | null;
  einsatz_titel: string | null; mitarbeiter_name: string | null; erstellt_am: string;
};

function heuteLokal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function datum(iso: string | null): string {
  if (!iso) return '';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}

export default function MaterialAbrufeBuero() {
  const [liste, setListe] = useState<Zeile[] | null>(null);
  const [alle, setAlle] = useState(false);
  const [antwort, setAntwort] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    let q = supabase.from('material_abruf')
      .select('id, bezeichnung, menge, einheit, benoetigt_bis, notiz, status, antwort, einsatz_titel, mitarbeiter_name, erstellt_am')
      .order('erstellt_am', { ascending: false })
      .limit(200);
    if (!alle) q = q.in('status', ['angefordert', 'bestellt', 'bereit']);
    const { data, error } = await q;
    if (error) { setListe([]); return; } // Tabelle fehlt (SQL noch nicht gelaufen) -> Bereich bleibt unsichtbar
    setListe((data as Zeile[]) ?? []);
  }, [alle]);

  useEffect(() => { void laden(); }, [laden]);

  const sortiert = useMemo(() => sortiereAbrufe(liste ?? []), [liste]);
  const zahl = useMemo(() => zaehleAbrufe(liste ?? [], heuteLokal()), [liste]);

  async function setzen(z: Zeile, status: AbrufStatus) {
    setFehler(null);
    const text = (antwort[z.id] || '').trim();
    const { error } = await supabase.from('material_abruf').update({
      status,
      ...(text ? { antwort: text.slice(0, 300) } : {}),
      geaendert_am: new Date().toISOString(),
    }).eq('id', z.id);
    if (error) { setFehler('Status konnte nicht gespeichert werden.'); return; }
    await laden();
  }

  if (liste === null) return null;
  if (liste.length === 0 && !alle) return null; // nichts offen -> kein Platz verschwenden

  return (
    <div style={s.box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 16 }}>📦 Material-Abrufe vom Einsatz</b>
        <span style={{ color: C.gold, fontWeight: 700 }}>{zahl.offen} offen</span>
        {zahl.eilig > 0 && <span style={{ color: C.danger, fontWeight: 700 }}>· {zahl.eilig} für heute oder überfällig</span>}
        <span style={{ flex: 1 }} />
        <button type="button" style={s.mini} onClick={() => setAlle((a) => !a)}>{alle ? 'Nur offene' : 'Alle anzeigen'}</button>
      </div>
      {fehler && <div style={{ color: C.danger, fontSize: 13.5, marginTop: 8 }}>{fehler}</div>}
      {sortiert.map((z) => {
        const st = istStatus(z.status) ? z.status : null;
        const info = st ? ABRUF_STATUS[st] : { label: z.status, farbe: 'textDim' as const };
        const eilig = z.benoetigt_bis && z.benoetigt_bis <= heuteLokal() && (st === 'angefordert' || st === 'bestellt');
        return (
          <div key={z.id} style={s.zeile}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div><b>{String(z.menge).replace('.', ',')} {z.einheit || ''} {z.bezeichnung}</b></div>
              <div style={{ color: C.textDim, fontSize: 13 }}>
                {z.mitarbeiter_name || 'Monteur'}{z.einsatz_titel ? ` · ${z.einsatz_titel}` : ''} · {datum(z.erstellt_am)}
                {z.benoetigt_bis && <span style={{ color: eilig ? C.danger : C.textDim }}> · gebraucht bis {datum(z.benoetigt_bis)}</span>}
              </div>
              {z.notiz && <div style={{ fontSize: 13.5, marginTop: 2 }}>„{z.notiz}"</div>}
              {z.antwort && <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>Antwort: {z.antwort}</div>}
              {st && NAECHSTE[st].length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <input
                    style={s.inp}
                    placeholder="Kurze Antwort an den Monteur (optional)"
                    value={antwort[z.id] || ''}
                    onChange={(e) => setAntwort((a) => ({ ...a, [z.id]: e.target.value }))}
                  />
                  {NAECHSTE[st].map((n) => (
                    <button key={n} type="button" style={{ ...s.mini, color: n === 'abgelehnt' ? C.danger : C.text }} onClick={() => void setzen(z, n)}>
                      {ABRUF_STATUS[n].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span style={{ color: FARBE[info.farbe], fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{info.label}</span>
          </div>
        );
      })}
      {sortiert.length === 0 && <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 8 }}>Noch keine Anforderungen.</div>}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  box: { background: C.navy2, border: `1px solid rgba(201,168,76,0.35)`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 },
  zeile: { display: 'flex', gap: 12, alignItems: 'flex-start', borderTop: `1px solid ${C.border}`, padding: '10px 0', marginTop: 8 },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  inp: { flex: '1 1 220px', minWidth: 160, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 13.5, fontFamily: 'inherit' },
};
