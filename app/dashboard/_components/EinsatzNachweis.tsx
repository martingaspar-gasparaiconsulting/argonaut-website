'use client';

// ============================================================
// ARGONAUT OS · Wiederverwendbarer Baustellen-Nachweis
// Zeigt zu einem Einsatz: Bericht-PDF, Fotos, Unterschrift, Zeiten.
// Wird per rechnung_id ODER einsatz_id gefüttert → einbaubar auf
// Rechnung, Auftrag, CRM … mit EINER Zeile:
//   <EinsatzNachweis rechnungId={rechnung.id} />
//   <EinsatzNachweis einsatzId={...} />
// Findet kein verknüpfter Einsatz → rendert NICHTS (unsichtbar).
// Pfad: app/dashboard/_components/EinsatzNachweis.tsx
// ============================================================

import { useEffect, useState, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C',
};

function pad(n: number) { return n < 10 ? '0' + n : String(n); }
function datumZeit(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}. ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

type EinsatzRow = {
  id: string; titel: string | null; kunde_name: string | null;
  beginn_am: string | null; unterwegs_am: string | null; vor_ort_am: string | null; erledigt_am: string | null;
  unterschrift_pfad: string | null; unterschrift_name: string | null; unterschrift_am: string | null;
  bericht_pfad: string | null; bericht_am: string | null;
};
type FotoRow = { id: string; pfad: string; dateiname: string | null };

export default function EinsatzNachweis({ rechnungId, einsatzId }: { rechnungId?: string; einsatzId?: string }) {
  const [einsatz, setEinsatz] = useState<EinsatzRow | null>(null);
  const [fotos, setFotos] = useState<FotoRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({}); // Pfad -> signierte URL
  const [laden, setLaden] = useState(true);

  const laden_ = useCallback(async () => {
    if (!rechnungId && !einsatzId) { setLaden(false); return; }
    setLaden(true);
    try {
      const spalten = 'id, titel, kunde_name, beginn_am, unterwegs_am, vor_ort_am, erledigt_am, unterschrift_pfad, unterschrift_name, unterschrift_am, bericht_pfad, bericht_am';
      const q = supabase.from('einsaetze').select(spalten).limit(1);
      const { data: eArr } = einsatzId ? await q.eq('id', einsatzId) : await q.eq('rechnung_id', rechnungId as string);
      const e = (eArr?.[0] as EinsatzRow | undefined) ?? null;
      if (!e) { setEinsatz(null); setLaden(false); return; }
      setEinsatz(e);

      const { data: fArr } = await supabase
        .from('einsatz_fotos').select('id, pfad, dateiname')
        .eq('einsatz_id', e.id).order('created_at', { ascending: true });
      const frows = (fArr as FotoRow[]) ?? [];
      setFotos(frows);

      const pfade = [...frows.map((f) => f.pfad), e.unterschrift_pfad, e.bericht_pfad].filter((p): p is string => !!p);
      if (pfade.length) {
        const { data: signed } = await supabase.storage.from('einsatz-fotos').createSignedUrls(pfade, 3600);
        const map: Record<string, string> = {};
        if (signed) for (const s of signed) { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; }
        setUrls(map);
      } else setUrls({});
    } finally { setLaden(false); }
  }, [rechnungId, einsatzId]);

  useEffect(() => { void laden_(); }, [laden_]);

  // Kein verknüpfter Einsatz oder noch am Laden → nichts anzeigen
  if (laden || !einsatz) return null;

  const e = einsatz;
  const hatZeiten = e.unterwegs_am || e.vor_ort_am || e.erledigt_am;

  return (
    <div style={styles.card}>
      <div style={styles.kopf}>
        <span style={styles.titel}>🔧 Baustellen-Nachweis</span>
        <span style={styles.dim}>{e.titel || 'Einsatz'}{e.kunde_name ? ` · ${e.kunde_name}` : ''}</span>
      </div>

      {hatZeiten && (
        <div style={styles.zeiten}>
          {e.unterwegs_am && <span>▶ Los {datumZeit(e.unterwegs_am)}</span>}
          {e.vor_ort_am && <span>📍 Vor Ort {datumZeit(e.vor_ort_am)}</span>}
          {e.erledigt_am && <span>✅ Fertig {datumZeit(e.erledigt_am)}</span>}
        </div>
      )}

      {e.bericht_pfad && urls[e.bericht_pfad] && (
        <a href={urls[e.bericht_pfad]} target="_blank" rel="noopener noreferrer" style={styles.berichtBtn}>
          📄 Einsatzbericht öffnen{e.bericht_am ? ` · ${datumZeit(e.bericht_am)}` : ''}
        </a>
      )}

      {fotos.length > 0 && (
        <div>
          <div style={styles.abschnitt}>Fotos ({fotos.length})</div>
          <div style={styles.fotoGrid}>
            {fotos.map((f) => (
              <a key={f.id} href={urls[f.pfad] || '#'} target="_blank" rel="noopener noreferrer" style={styles.thumb}>
                {urls[f.pfad] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[f.pfad]} alt={f.dateiname ?? 'Foto'} style={styles.img} />
                ) : <div style={styles.imgLaedt}>…</div>}
              </a>
            ))}
          </div>
        </div>
      )}

      {e.unterschrift_pfad && urls[e.unterschrift_pfad] && (
        <div>
          <div style={styles.abschnitt}>Unterschrift Kunde{e.unterschrift_name ? ` · ${e.unterschrift_name}` : ''}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[e.unterschrift_pfad]} alt="Unterschrift" style={styles.sig} />
        </div>
      )}

      {!e.bericht_pfad && fotos.length === 0 && !e.unterschrift_pfad && (
        <div style={styles.dim}>Für diesen Einsatz wurden noch keine Nachweise (Bericht, Fotos, Unterschrift) erfasst.</div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  kopf: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  titel: { fontWeight: 800, fontSize: 15, color: C.text },
  dim: { color: C.textDim, fontSize: 13 },
  zeiten: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: C.textDim, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px' },
  berichtBtn: { display: 'inline-block', background: C.gold, color: '#0A1628', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 800, textDecoration: 'none', textAlign: 'center' },
  abschnitt: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.textDim, fontWeight: 700, marginBottom: 8 },
  fotoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 },
  thumb: { display: 'block', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.navy },
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  imgLaedt: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim },
  sig: { maxWidth: 260, width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, background: '#fff', display: 'block' },
};
