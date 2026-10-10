// ============================================================================
// ARGONAUT OS · lib/demoZeitreise.ts — Paket 299: Zeitreise-Vorführung
//
// Beim Kunden vorführen, wie ARGONAUT über die Zeit wächst: erst das leere
// Konto („So fangen Sie an"), dann ein Betrieb nach den ersten Monaten, dann
// einer, der seit anderthalb Jahren alles darin hat — erst da sieht man, was
// das ganze System kann. Je Branche eine Reihe von Stufen; jede Stufe ist ein
// Vorführ-Betrieb aus lib/demoBetriebe mit eigenem Login.
//
// Heute: Kfz (leer · Autohaus Renz · Valtier Automobile). Weitere Branchen
// kommen hier dazu, sobald ihre Fachdaten stehen — die Seite
// /admin/demo-betriebe zeigt automatisch jede Reihe dieser Liste.
//
// Keine Imports mit Seiteneffekten, keine Hooks — node-testbar.
// ============================================================================

import { demoBetrieb, demoEmail, demoPasswort } from './demoBetriebe';

export type ZeitreiseStufe = {
  /** Vorführ-Betrieb (slug aus lib/demoBetriebe). */
  slug: string;
  /** Kurzer Titel der Stufe für die Vorführung. */
  titel: string;
  /** Ein Satz, was der Kunde in dieser Stufe sieht. */
  zeigt: string;
};

export type ZeitreiseReihe = {
  key: string;
  branche: string;
  icon: string;
  stufen: ZeitreiseStufe[];
};

export const ZEITREISE: ZeitreiseReihe[] = [
  {
    key: 'kfz',
    branche: 'Kfz-Handel und Werkstatt',
    icon: '🚗',
    stufen: [
      { slug: 'kfzstart', titel: 'Tag 1 — so fangen Sie an', zeigt: 'Leeres Konto, nur Name und Branche. Die Startstrecke steht bei 0 % und führt Schritt für Schritt durch die Einrichtung.' },
      { slug: 'autohaus', titel: 'Die ersten Monate', zeigt: 'Kleines Team, rund 20 Fahrzeuge, erste Verkäufe, Werkstatt und Ersatzwagen laufen — der Alltag ist drin.' },
      { slug: 'premium', titel: 'Nach 18 Monaten', zeigt: '50 Mitarbeiter, rund 120 Fahrzeuge, rund 500 Verkäufe, Chef-Blick mit Vorjahr, Media-Abteilung — das ganze System in voller Fahrt.' },
    ],
  },
];

export type ZeitreiseKarte = ZeitreiseStufe & { nr: number; firma: string; email: string; passwort: string };

/** Die Stufen einer Reihe mit Zugangsdaten (unbekannte Betriebe fallen heraus). */
export function zeitreiseKarten(reihe: ZeitreiseReihe): ZeitreiseKarte[] {
  return reihe.stufen.flatMap((s, i) => {
    const b = demoBetrieb(s.slug);
    return b ? [{ ...s, nr: i + 1, firma: `${b.firma} ${b.rechtsform}`.trim(), email: demoEmail(s.slug), passwort: demoPasswort(s.slug) }] : [];
  });
}

/** Alle Slugs einer Reihe — zum gemeinsamen Anlegen. */
export function zeitreiseSlugs(reihe: ZeitreiseReihe): string[] {
  return reihe.stufen.map((s) => s.slug);
}

/** Anmeldeseite der Kunden (Vorführ-Logins laufen über dieselbe Seite wie echte Kunden). */
export const KUNDEN_LOGIN = '/auth/login';
