// ============================================================
// ARGONAUT OS · Paket 278 · K18 Partner-Netzwerk  (/dashboard/kfz/partner)
// Seit Paket 303 (N1) ist die Seite für alle Branchen gleich: Inhalt in
// app/dashboard/netzwerk/PartnerHub.tsx, hier mit Kfz-Texten.
// ============================================================

import PartnerHub from '../../netzwerk/PartnerHub';

export default function PartnerNetzwerkSeite() {
  return <PartnerHub ort="kfz" />;
}
