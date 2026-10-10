'use client';

// ============================================================
// ARGONAUT OS · Paket 278 · K18 Reiter „Partner" in der Handelsakte
// Seit Paket 303 (N1) gemeinsam mit Projekt, Auftrag und Objekt:
// Inhalt in app/dashboard/netzwerk/PartnerAuftraege.tsx (Fahrzeug-Freigaben,
// Kostenart und Fahrzeugkosten bleiben nur hier beim Fahrzeug).
// ============================================================

import PartnerAuftraege from '../../netzwerk/PartnerAuftraege';

type Fz = { id: string; owner_user_id: string; marke: string | null; modell: string | null; fin: string | null; km_stand: number | null };

export default function KfzPartner({ fz }: { fz: Fz }) {
  const titel = [fz.marke, fz.modell].filter(Boolean).join(' ') || 'Fahrzeug';
  return <PartnerAuftraege bezug={{ typ: 'kfz_bestand', id: fz.id, owner_user_id: fz.owner_user_id, titel }} />;
}
