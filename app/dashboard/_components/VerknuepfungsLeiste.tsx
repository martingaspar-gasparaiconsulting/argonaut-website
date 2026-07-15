'use client';

// ============================================================
// ARGONAUT OS · P46 · VerknuepfungsLeiste (Sprung-Navigation)
// Zeigt zu einem Datensatz anklickbare Chips zu seinen verknuepften
// Datensaetzen: Kunde (kontakte), Lead, Auftrag, Rechnung.
// Einbaubar mit EINER Zeile, genau wie EinsatzNachweis:
//   <VerknuepfungsLeiste kontaktId={r.kontakt_id} auftragId={r.auftrag_id} />
// Ist KEINE Verknuepfung gesetzt → rendert NICHTS (unsichtbar).
//
// Sicher & additiv: liest nur (auftragsnummer/rechnungsnummer als Label),
// schreibt nie, kennt keine festen Branchen-Begriffe.
// Ziel-Routen (alle vorhanden):
//   Kunde   -> /dashboard/crm/[id]
//   Lead    -> /dashboard/leads/[id]
//   Auftrag -> /dashboard/auftraege/[id]
//   Rechnung-> /dashboard/rechnungen/[id]
// (Einsatz hat keine eigene Detailseite -> bewusst nicht verlinkt.)
// Pfad: app/dashboard/_components/VerknuepfungsLeiste.tsx
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
};

type Props = {
  kontaktId?: string | null;
  leadId?: string | null;
  auftragId?: string | null;
  rechnungId?: string | null;
};

export default function VerknuepfungsLeiste({ kontaktId, leadId, auftragId, rechnungId }: Props) {
  const [auftragNr, setAuftragNr] = useState<string | null>(null);
  const [rechnungNr, setRechnungNr] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        if (auftragId) {
          const { data } = await supabase
            .from('auftraege').select('auftragsnummer').eq('id', auftragId).maybeSingle();
          if (aktiv) setAuftragNr((data?.auftragsnummer as string | null) ?? null);
        }
        if (rechnungId) {
          const { data } = await supabase
            .from('rechnungen').select('rechnungsnummer').eq('id', rechnungId).maybeSingle();
          if (aktiv) setRechnungNr((data?.rechnungsnummer as string | null) ?? null);
        }
      } catch {
        // Label ist nur Komfort — bei Fehler bleibt der Chip trotzdem klickbar.
      }
    })();
    return () => { aktiv = false; };
  }, [auftragId, rechnungId]);

  const chips: { href: string; label: string }[] = [];
  if (kontaktId) chips.push({ href: `/dashboard/crm/${kontaktId}`, label: '👤 Kunde öffnen' });
  if (leadId) chips.push({ href: `/dashboard/leads/${leadId}`, label: '🎯 Lead öffnen' });
  if (auftragId) chips.push({ href: `/dashboard/auftraege/${auftragId}`, label: `📋 Auftrag${auftragNr ? ' ' + auftragNr : ''}` });
  if (rechnungId) chips.push({ href: `/dashboard/rechnungen/${rechnungId}`, label: `🧾 Rechnung${rechnungNr ? ' ' + rechnungNr : ''}` });

  // Keine Verknuepfung → nichts anzeigen (wie EinsatzNachweis).
  if (chips.length === 0) return null;

  return (
    <div style={styles.leiste}>
      <span style={styles.label}>Verknüpft:</span>
      {chips.map((c) => (
        <a key={c.href} href={c.href} style={styles.chip}>{c.label}</a>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  leiste: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: '10px 14px', marginTop: 16,
  },
  label: { fontSize: 'clamp(11px, 0.94vw, 15px)', letterSpacing: 1, textTransform: 'uppercase', color: C.textDim, fontWeight: 700, marginRight: 2 },
  chip: {
    display: 'inline-block', textDecoration: 'none',
    background: 'rgba(0,229,255,0.10)', color: C.cyan,
    border: `1px solid rgba(0,229,255,0.30)`, borderRadius: 999,
    padding: '6px 13px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 700, whiteSpace: 'nowrap',
  },
};
