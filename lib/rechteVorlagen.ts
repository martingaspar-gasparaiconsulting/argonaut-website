// ============================================================================
// ARGONAUT OS · lib/rechteVorlagen.ts — Rollen-Vorlagen fuer /dashboard/rechte
//
// Reine Daten + Logik, node-testbar. Vorher stand die Liste direkt in der Seite.
// Paket 196: neue Vorlage „Monteur" (Elektro und alle Handwerke mit Aussendienst):
// Auftraege, Einsaetze, Termine, Service, Wartung, Pruefprotokolle, Aufmass,
// Bautagebuch, Projekte, Dokumente, Lager-Scanner, Team-Chat — bewusst OHNE
// sensible Module (keine Rechnungen, kein Personal, keine Finanzen).
// Vorlagen setzen nur Sicht-Rechte; Schreibrechte bleiben Einzelentscheidung.
// ============================================================================

import { ALLE_MODUL_KEYS } from './rechte';

export interface RechteVorlage { name: string; module: string[]; }

export const MONTEUR_MODULE: string[] = [
  'auftraege', 'einsaetze', 'termine', 'service', 'wartung', 'pruefprotokolle',
  'aufmass', 'bautagebuch', 'projekte', 'dokumente', 'lager-scanner', 'team-chat',
];

export const RECHTE_VORLAGEN: RechteVorlage[] = [
  { name: 'Lager', module: ['erp', 'auftraege'] },
  { name: 'Produktion', module: ['projekte', 'auftraege', 'service', 'erp'] },
  { name: 'Monteur', module: [...MONTEUR_MODULE] },
  { name: 'Büro', module: ['rechnungen', 'korrespondenz', 'dokumente', 'crm', 'auftraege'] },
  { name: 'Vertrieb', module: ['leads', 'crm', 'marketing', 'auftraege', 'rechnungen'] },
  { name: 'Alle', module: [...ALLE_MODUL_KEYS] },
  { name: 'Keine', module: [] },
];
