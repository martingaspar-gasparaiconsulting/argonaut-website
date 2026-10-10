// ============================================================
// ARGONAUT OS · Paket 303 · N1 Betriebs-Netzwerk für alle Branchen (/dashboard/netzwerk)
// Verbindungen, Aufträge von Partnern, eigene Aufträge an Partner — an Projekten,
// Aufträgen, Objekten und Fahrzeugen. Inhalt: PartnerHub (gemeinsam mit /dashboard/kfz/partner).
// ============================================================

import PartnerHub from './PartnerHub';

export default function NetzwerkSeite() {
  return <PartnerHub ort="netzwerk" />;
}
