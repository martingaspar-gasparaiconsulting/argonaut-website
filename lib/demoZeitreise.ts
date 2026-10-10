// ============================================================================
// ARGONAUT OS · lib/demoZeitreise.ts — Paket 299: Zeitreise-Vorführung
//
// Beim Kunden vorführen, wie ARGONAUT über die Zeit wächst: erst das leere
// Konto („So fangen Sie an"), dann ein Betrieb nach den ersten Monaten, dann
// einer, der seit anderthalb Jahren alles darin hat — erst da sieht man, was
// das ganze System kann. Je Branche eine Reihe von Stufen; jede Stufe ist ein
// Vorführ-Betrieb aus lib/demoBetriebe mit eigenem Login.
//
// Kfz (leer · Autohaus Renz · Valtier Automobile) und — Paket 300 — jede
// weitere Branche aus lib/demoWachstumProfile, das Handwerk vorneweg. Die Seite
// /admin/demo-betriebe zeigt automatisch jede Reihe dieser Liste.
//
// Keine Imports mit Seiteneffekten, keine Hooks — node-testbar.
// ============================================================================

import { demoBetrieb, demoEmail, demoPasswort } from './demoBetriebe';
import { WACHSTUM_PROFILE } from './demoWachstumProfile';
import type { WachstumProfil } from './demoWachstum';

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

/** Kfz — eigene, tiefere Reihe (P297–P299). */
const KFZ: ZeitreiseReihe = {
  key: 'kfz',
  branche: 'Kfz-Handel und Werkstatt',
  icon: '🚗',
  stufen: [
    { slug: 'kfzstart', titel: 'Tag 1 — so fangen Sie an', zeigt: 'Leeres Konto, nur Name und Branche. Die Startstrecke steht bei 0 % und führt Schritt für Schritt durch die Einrichtung.' },
    { slug: 'autohaus', titel: 'Die ersten Monate', zeigt: 'Kleines Team, rund 20 Fahrzeuge, erste Verkäufe, Werkstatt und Ersatzwagen laufen — der Alltag ist drin.' },
    { slug: 'premium', titel: 'Nach 18 Monaten', zeigt: '50 Mitarbeiter, rund 120 Fahrzeuge, rund 500 Verkäufe, Chef-Blick mit Vorjahr, Media-Abteilung — das ganze System in voller Fahrt.' },
  ],
};

/** Paket 300: je Branche aus dem Wachstums-Profil. */
const ausProfil = (p: WachstumProfil): ZeitreiseReihe => ({
  key: p.slug.replace(/plus$/, ''),
  branche: p.branche,
  icon: p.icon,
  stufen: [
    { slug: p.start, titel: 'Tag 1 — so fangen Sie an', zeigt: 'Leeres Konto, nur Name und Branche. Die Startstrecke steht bei 0 % und führt Schritt für Schritt durch die Einrichtung.' },
    { slug: p.basis, titel: 'Die ersten Monate', zeigt: 'Erste Kunden, Angebote und Rechnungen, die Branchen-Module sind eingerichtet — der Alltag beginnt in ARGONAUT.' },
    { slug: p.slug, titel: 'Nach 18 Monaten', zeigt: p.zeigt },
  ],
});

/** Reihenfolge: Handwerk zuerst (Maler, Sanitär/Heizung), dann Kfz, dann die übrigen Branchen. */
export const ZEITREISE: ZeitreiseReihe[] = (() => {
  const reihen = WACHSTUM_PROFILE.map(ausProfil);
  const handwerk = reihen.filter((r) => r.key === 'maler' || r.key === 'heizung');
  return [...handwerk, KFZ, ...reihen.filter((r) => !handwerk.includes(r))];
})();

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
