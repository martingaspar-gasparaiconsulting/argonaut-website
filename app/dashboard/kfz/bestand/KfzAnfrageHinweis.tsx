'use client';

// ============================================================
// ARGONAUT OS · Paket 271 · K10 Hinweis in der Handelsakte (Reiter „Übersicht"):
// offene Anfragen zu diesem Fahrzeug und passende laufende Suchaufträge,
// mit Sprung zur Seite „Anfragen und Suchaufträge". Ohne SQL 271 bleibt er leer.
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { istOffen, passendeSuchen, type FahrzeugFuerSuche, type SuchAuftrag } from '@/lib/kfzAnfrage';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default function KfzAnfrageHinweis({ fz }: { fz: FahrzeugFuerSuche }) {
  const [anfragen, setAnfragen] = useState<number | null>(null);
  const [suchen, setSuchen] = useState<(SuchAuftrag & { name: string | null; nr: string | null })[]>([]);

  // Abhängigkeit als Text: das Objekt entsteht bei jedem Zeichnen neu, sonst würde endlos geladen.
  const schluessel = JSON.stringify(fz);
  useEffect(() => {
    const f = JSON.parse(schluessel) as FahrzeugFuerSuche;
    void (async () => {
      const [a, s] = await Promise.all([
        supabase.from('kfz_anfrage').select('status').eq('bestand_id', f.id).limit(500),
        supabase.from('kfz_suchauftrag').select('nr, name, kriterien, aktiv, gueltig_bis, gesehen_bis').eq('aktiv', true).limit(1000),
      ]);
      if (a.error) return;
      setAnfragen((((a.data as unknown) as { status: string }[]) ?? []).filter((x) => istOffen(x.status)).length);
      setSuchen(passendeSuchen(f, ((s.data as unknown) as (SuchAuftrag & { name: string | null; nr: string | null })[]) ?? [], new Date().toISOString().slice(0, 10)));
    })();
  }, [schluessel]);

  if (anfragen === null) return null;
  return (
    <div style={k.box}>
      <span>📨 {anfragen === 0 ? 'Keine offene Anfrage' : `${anfragen} offene ${anfragen === 1 ? 'Anfrage' : 'Anfragen'}`} zu diesem Fahrzeug</span>
      <span>🔎 {suchen.length === 0 ? 'kein passender Suchauftrag' : `${suchen.length} ${suchen.length === 1 ? 'Suchauftrag passt' : 'Suchaufträge passen'}: ${suchen.slice(0, 3).map((x) => `${x.nr ?? ''} ${x.name ?? ''}`.trim()).join(', ')}${suchen.length > 3 ? ' …' : ''}`}</span>
      <a href={`/dashboard/kfz/anfragen?fahrzeug=${fz.id}`} style={k.link}>＋ Anfrage zu diesem Fahrzeug</a>
      <a href="/dashboard/kfz/anfragen" style={k.link}>Anfragen und Suchaufträge →</a>
    </div>
  );
}

const k: Record<string, CSSProperties> = {
  box: { gridColumn: '1 / -1', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5 },
  link: { color: '#C9A84C', fontWeight: 700, textDecoration: 'none' },
};
