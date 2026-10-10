'use client';

// ============================================================
// ARGONAUT OS · Paket 304 · N1b — Knopf „🤝 An Partner geben"
// In Projekt-Akte, Auftrags-Akte und Objektzeiten (je Objekt).
// Führt direkt auf /dashboard/netzwerk/bezug?typ=…&id=… und zeigt,
// wie viele Partner-Aufträge an diesem Bezug laufen (offen/angenommen/fertig).
// Ob die Person dort etwas vergeben darf, prüft die Datenbank (Paket 303).
// Ist die Zählung nicht lesbar (kein Recht, Modul nicht gebucht), steht nur der Knopf da.
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { LAUFEND_STATUS, laufendJeBezug, knopfText, knopfLink, type BezugTyp } from '@/lib/netzwerk';

type Art = Exclude<BezugTyp, 'kfz_bestand'>;

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const GOLD = '#C9A84C';

async function betriebId(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  let chef: unknown = null;
  try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
  return typeof chef === 'string' && chef ? chef : u.user.id;
}

/** Laufende Partner-Aufträge je Bezug dieser Art (eigener Betrieb als Auftraggeber). */
export function usePartnerZaehler(typ: Art, nurId?: string | null, aktiv = true): Record<string, number> | null {
  const [zahl, setZahl] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let weg = false;
    if (!aktiv) return;
    (async () => {
      const betrieb = await betriebId();
      if (!betrieb) return;
      let q = supabase.from('partner_auftrag').select('bezug_typ, bezug_id, status')
        .eq('owner_user_id', betrieb).eq('bezug_typ', typ).in('status', [...LAUFEND_STATUS]);
      if (nurId) q = q.eq('bezug_id', nurId);
      const { data, error } = await q.limit(2000);
      if (!weg) setZahl(error ? null : laufendJeBezug(data as { bezug_typ: unknown; bezug_id: unknown; status: unknown }[] | null, typ));
    })();
    return () => { weg = true; };
  }, [typ, nurId, aktiv]);
  return zahl;
}

/** Knopf. `anzahl` von außen (Liste) — sonst lädt er seine Zahl selbst. */
export default function PartnerKnopf({ typ, id, anzahl, kurz = false, stil }: { typ: Art; id: string; anzahl?: number; kurz?: boolean; stil?: CSSProperties }) {
  const selbst = usePartnerZaehler(typ, id, anzahl === undefined);
  const n = anzahl !== undefined ? anzahl : (selbst?.[id] ?? 0);
  const href = knopfLink(typ, id);
  if (!href) return null;
  return (
    <a
      href={href}
      title="Einen verbundenen Betrieb (Subunternehmer, Partner) beauftragen — er sieht nur den Namen und seine Aufgabe"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        border: `1px solid ${GOLD}66`, color: GOLD, background: 'transparent', textDecoration: 'none',
        borderRadius: 8, padding: kurz ? '4px 10px' : '8px 14px', fontWeight: 700, fontSize: kurz ? 12.5 : 14,
        ...stil,
      }}
    >
      {knopfText(n, kurz)}
    </a>
  );
}
