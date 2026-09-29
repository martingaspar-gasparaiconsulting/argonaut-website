'use client';

// ============================================================================
// ARGONAUT OS · Abläufe — Ergebnisse (Paket 167)
// Pfad: app/dashboard/ablaeufe/_teile/AblaufErgebnisse.tsx
//
// Entwürfe aus dem KI-Baustein und PDFs aus „PDF erstellen". Nur die
// Geschäftsleitung (RLS). Ein Entwurf wird NIE verschickt — kopieren, prüfen,
// selbst senden. Vor SQL p167 fehlt die Tabelle: dann bleibt der Kasten still.
// ============================================================================

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Zeile = {
  id: string; art: 'entwurf' | 'pdf'; titel: string; inhalt: string | null; ablauf_name: string | null;
  status: string; erstellt_am: string;
};

const C = { navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666' };
const karte: CSSProperties = { background: '#0F2036', border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 };
const klein: CSSProperties = { color: C.textDim, fontSize: 12.5, lineHeight: 1.5 };
const knopf: CSSProperties = { padding: '5px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${C.border}`, background: 'transparent', color: C.text, textDecoration: 'none' };

function zeit(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AblaufErgebnisse({ supabase }: { supabase: SupabaseClient }) {
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const { data, error } = await supabase.from('ablauf_ergebnisse')
      .select('id,art,titel,inhalt,ablauf_name,status,erstellt_am').eq('status', 'offen')
      .order('erstellt_am', { ascending: false }).limit(50);
    setZeilen(error ? null : ((data as Zeile[]) ?? []));
  }, [supabase]);

  useEffect(() => { void laden(); }, [laden]);

  async function setze(z: Zeile, status: 'erledigt' | 'verworfen') {
    const { data, error } = await supabase.from('ablauf_ergebnisse')
      .update({ status, erledigt_am: new Date().toISOString() }).eq('id', z.id).select('id');
    if (error || !data || data.length === 0) { setMeldung('Nicht gespeichert — bitte erneut versuchen.'); return; }
    setMeldung(status === 'erledigt' ? `„${z.titel}" als erledigt markiert.` : `„${z.titel}" verworfen.`);
    await laden();
  }

  async function kopiere(z: Zeile) {
    try { await navigator.clipboard.writeText(z.inhalt ?? ''); setMeldung('Entwurf kopiert — bitte vor dem Versand prüfen.'); }
    catch { setMeldung('Kopieren ging nicht — bitte den Text markieren und kopieren.'); }
  }

  if (zeilen === null || zeilen.length === 0) return null;
  return (
    <div style={karte}>
      <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Ergebnisse aus Abläufen</h2>
      <div style={{ ...klein, marginBottom: 8 }}>Entwürfe der Bausteine und erstellte PDFs. Verschickt wird hier nichts — Entwürfe bitte prüfen und selbst senden.</div>
      {meldung && <div style={{ fontSize: 13, color: C.cyan, marginBottom: 8 }}>{meldung}</div>}
      {zeilen.map((z) => (
        <div key={z.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{z.art === 'pdf' ? '📄' : '✍️'} {z.titel || (z.art === 'pdf' ? 'PDF' : 'Entwurf')}</div>
              <div style={klein}>{z.ablauf_name ?? 'Ablauf'} · {zeit(z.erstellt_am)} · {z.art === 'pdf' ? 'PDF' : 'Entwurf (nicht verschickt)'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {z.art === 'pdf'
                ? <a href={`/api/ablaeufe/ergebnis?id=${z.id}`} target="_blank" rel="noopener noreferrer" style={knopf}>Öffnen</a>
                : <>
                    <button type="button" onClick={() => setOffen(offen === z.id ? null : z.id)} style={knopf}>{offen === z.id ? 'Zuklappen' : 'Lesen'}</button>
                    <button type="button" onClick={() => kopiere(z)} style={knopf}>Kopieren</button>
                  </>}
              <button type="button" onClick={() => setze(z, 'erledigt')} style={{ ...knopf, color: C.green }}>✓ Erledigt</button>
              <button type="button" onClick={() => setze(z, 'verworfen')} style={{ ...knopf, color: C.danger }}>✕ Verwerfen</button>
            </div>
          </div>
          {offen === z.id && z.inhalt && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.55, marginTop: 8, padding: 12, borderRadius: 9, background: 'rgba(10,22,40,0.6)', border: `1px solid ${C.border}` }}>{z.inhalt}</div>
          )}
        </div>
      ))}
    </div>
  );
}
