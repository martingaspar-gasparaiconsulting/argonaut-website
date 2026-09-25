'use client';

// ============================================================
// ARGONAUT OS · Paket PS2 · MHD-Warnung im Lager
// Chargen aus Industrie (charge_los) und Lebensmittel (lm_chargen) mit
// Mindesthaltbarkeit in den nächsten 14 Tagen — abgelaufene zuerst.
// Fail-open: fehlt eine Tabelle oder das Recht, wird sie still übersprungen.
// Nichts zu melden -> die Box erscheint gar nicht.
// Logik: lib/qualitaet.ts (mhdWarnungen, getestet).
// ============================================================

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { mhdWarnungen, heuteBerlin, datumDe, type MhdQuelle, type MhdEintrag } from '@/lib/qualitaet';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy2: '#0F2036', text: '#E8EDF4', textDim: '#8FA3BE', danger: '#E06666', warn: '#E0A24C', cyan: '#00e5ff' };

export default function MhdWarnung({ tage = 14 }: { tage?: number }) {
  const [liste, setListe] = useState<MhdEintrag[]>([]);
  const [offen, setOffen] = useState(false);

  useEffect(() => {
    (async () => {
      const heute = heuteBerlin();
      const bis = new Date(Date.now() + (tage + 1) * 86_400_000).toISOString().slice(0, 10);
      const alle: MhdQuelle[] = [];
      try {
        const r = await supabase.from('charge_los').select('id, charge_nr, bezeichnung, mhd, status, menge, einheit').not('mhd', 'is', null).lte('mhd', bis);
        for (const l of (r.data as { id: string; charge_nr: string; bezeichnung: string | null; mhd: string; status: string | null; menge: number | null; einheit: string | null }[] | null) ?? []) {
          alle.push({ id: l.id, quelle: 'charge_los', bezeichnung: l.bezeichnung || l.charge_nr, charge_nr: l.charge_nr, mhd: l.mhd, status: l.status, menge: l.menge, einheit: l.einheit });
        }
      } catch { /* Tabelle fehlt */ }
      try {
        const r = await supabase.from('lm_chargen').select('id, charge_nr, bezeichnung, mhd, status, menge, einheit').not('mhd', 'is', null).lte('mhd', bis);
        for (const l of (r.data as { id: string; charge_nr: string | null; bezeichnung: string; mhd: string; status: string | null; menge: number | null; einheit: string | null }[] | null) ?? []) {
          alle.push({ id: l.id, quelle: 'lm_chargen', bezeichnung: l.bezeichnung, charge_nr: l.charge_nr, mhd: l.mhd, status: l.status, menge: l.menge, einheit: l.einheit });
        }
      } catch { /* Tabelle fehlt */ }
      setListe(mhdWarnungen(alle, heute, tage));
    })();
  }, [tage]);

  if (liste.length === 0) return null;
  const abgelaufen = liste.filter((x) => x.stufe === 'abgelaufen').length;
  const farbe = abgelaufen ? C.danger : C.warn;

  return (
    <div style={{ background: C.navy2, border: `1px solid ${farbe}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, color: C.text }}>
      <button onClick={() => setOffen(!offen)} style={{ background: 'none', border: 'none', color: farbe, fontWeight: 800, fontSize: 15, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
        ⏳ {abgelaufen ? `${abgelaufen} Charge${abgelaufen === 1 ? '' : 'n'} über MHD` : ''}{abgelaufen && liste.length > abgelaufen ? ' · ' : ''}
        {liste.length > abgelaufen ? `${liste.length - abgelaufen} in den nächsten ${tage} Tagen` : ''} {offen ? '▲' : '▼'}
      </button>
      {offen && (
        <div style={{ marginTop: 10 }}>
          {liste.map((x) => (
            <div key={`${x.quelle}-${x.id}`} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid rgba(143,163,190,0.15)', fontSize: 14 }}>
              <span>
                <b>{x.bezeichnung}</b>{x.charge_nr ? <span style={{ color: C.textDim }}> · Charge {x.charge_nr}</span> : null}
                {x.menge != null ? <span style={{ color: C.textDim }}> · {String(x.menge).replace('.', ',')} {x.einheit ?? ''}</span> : null}
              </span>
              <span style={{ color: x.stufe === 'bald' ? C.warn : C.danger, whiteSpace: 'nowrap' }}>
                MHD {datumDe(x.mhd)} · {x.stufe === 'abgelaufen' ? `seit ${-x.restTage} Tag${x.restTage === -1 ? '' : 'en'} abgelaufen` : x.stufe === 'heute' ? 'heute' : `noch ${x.restTage} Tag${x.restTage === 1 ? '' : 'e'}`}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <a href="/dashboard/chargen" style={{ color: C.cyan }}>Chargen & Prüfplan</a>{' · '}
            <a href="/dashboard/lebensmittel" style={{ color: C.cyan }}>Lebensmittel</a>
          </div>
        </div>
      )}
    </div>
  );
}
