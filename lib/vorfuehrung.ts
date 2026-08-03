// ============================================================================
// ARGONAUT OS · lib/vorfuehrung.ts — Motor der öffentlichen Branchen-Vorführung
//
// Setzt für JEDE der 698 Branchen eine vollständige Vorführung zusammen — OHNE
// Login, OHNE Datenbank, OHNE KI-Aufruf. Alles kommt aus den Katalogen, die auch
// das echte System und die 698 Dossiers steuern:
//
//   · Schmerzpunkte + Ergebnisse  → app/vorschau/_lib/branchen-web (je Branche eigen)
//   · Modul-Set                   → lib/branchenkatalog + lib/rechte
//   · Startstrecke                → lib/onboardingBranchen
//   · Preis                       → lib/tarif (dieselbe Rechnung wie im Angebot)
//   · KI-Dialog + Betriebsgröße   → lib/vorfuehrungInhalt
//
// Von fünf Bausteinen sind VIER je Branche einzeln hinterlegt. Nur der
// KI-Dialog erbt von der Kategorie, weil er konkrete Zahlen und einen Vorschlag
// enthält — den kann man nicht ableiten, den muss jemand schreiben.
//
// ERWEITERBAR: Sobald unter lib/vorfuehrtexte/ handgeschriebene Dialoge je
// Branche liegen, greift der Motor zuerst dort zu. Es braucht dafür KEINEN
// Umbau — ein neuer Block wirkt sofort.
//
// Rein rechnend, keine Seiteneffekte — node-testbar, Client + Server.
// ============================================================================

import { DEMO_BETRIEBE } from './demoBetriebe';
import { VORFUEHR_INHALT, vorfuehrInhalt, type VorfuehrInhalt } from './vorfuehrungInhalt';
import { kategorieModule } from './branchenkatalog';
import { branchenSchritte } from './onboardingBranchen';
import { NAV_LINKS } from './rechte';
import { preisAus, type PreisBild } from './vorfuehrPreis';
import { websiteBranchen, websiteBrancheBySlug, KATEGORIE_ORDER } from '@/app/vorschau/_lib/branchen-web';

export type { PreisBild };
export { preisFuerGroesse, sitzMixFuer } from './vorfuehrPreis';

export type ModulKachel = { key: string; label: string; kern: boolean };

export type VorfuehrDaten = {
  slug: string;
  /** Überschrift des ersten Bildes — der Beruf, wie der Besucher ihn nennt. */
  titel: string;
  kategorie: string;
  /** Zusatzzeile: bei den 21 Vorführ-Betrieben der Firmenname, sonst leer. */
  betrieb: string | null;
  ort: string | null;
  /** Bis zu drei eigene Schmerzpunkte dieser Branche. */
  schmerzen: string[];
  hoehepunkte: string[];
  kiFrage: string;
  kiAntwort: string[];
  /** Ist der KI-Dialog für genau diese Branche geschrieben — oder von der Kategorie geerbt? */
  kiEigen: boolean;
  module: ModulKachel[];
  anzahlModule: number;
  schritte: { icon: string; titel: string; text: string }[];
  preis: PreisBild;
};

// --- Anzeigenamen der Module aus der Navigation ----------------------------
const LABEL_JE_MODUL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const l of NAV_LINKS) if (l.modul && !m[l.modul]) m[l.modul] = l.label;
  return m;
})();

/**
 * Der KI-Dialog und die typische Betriebsgröße je KATEGORIE. Grundlage sind die
 * handgeschriebenen Vorführ-Betriebe: der erste einer Kategorie gibt den Ton vor.
 */
const INHALT_JE_KATEGORIE: Record<string, VorfuehrInhalt> = (() => {
  const m: Record<string, VorfuehrInhalt> = {};
  for (const b of DEMO_BETRIEBE) {
    const i = vorfuehrInhalt(b.slug);
    if (i && !m[b.kategorie]) m[b.kategorie] = i;
  }
  return m;
})();

/** Rückfallebene, falls eine Kategorie einmal ohne hinterlegten Betrieb dasteht. */
const NOTNAGEL: VorfuehrInhalt = VORFUEHR_INHALT.maler;

function modulListe(kategorie: string): ModulKachel[] {
  // Kern = was jede Branche bekommt. Wir leiten ihn aus einer Kategorie ab, die
  // es bewusst nicht gibt — kategorieModule() liefert dann nur Kern + Automation.
  const kern = new Set(kategorieModule('__kern_nur__'));
  return kategorieModule(kategorie)
    .map((key) => ({ key, label: LABEL_JE_MODUL[key] || key, kern: kern.has(key) }))
    .filter((m) => m.label !== m.key)          // reine Systemschlüssel ohne Menüpunkt raus
    .sort((a, b) => Number(a.kern) - Number(b.kern));
}

function schritteFuer(kategorie: string) {
  return branchenSchritte(kategorie).map((s) => ({ icon: s.icon, titel: s.titel, text: s.text }));
}

/**
 * Die vollständige Vorführung zu einem Schlüssel.
 * Zuerst wird unter den 21 handgeschriebenen Vorführ-Betrieben gesucht,
 * danach unter allen 698 Branchen. null = unbekannter Schlüssel.
 */
export function vorfuehrDaten(slug: string): VorfuehrDaten | null {
  // --- Fall 1: einer der handgeschriebenen Vorführ-Betriebe ----------------
  const demo = DEMO_BETRIEBE.find((b) => b.slug === slug);
  if (demo) {
    const i = vorfuehrInhalt(demo.slug) || INHALT_JE_KATEGORIE[demo.kategorie] || NOTNAGEL;
    const module = modulListe(demo.kategorie);
    return {
      slug,
      titel: demo.branche,
      kategorie: demo.kategorie,
      betrieb: `${demo.firma} ${demo.rechtsform}`.trim(),
      ort: demo.ort,
      schmerzen: [i.schmerz],
      hoehepunkte: i.hoehepunkte,
      kiFrage: i.kiFrage,
      kiAntwort: i.kiAntwort,
      kiEigen: true,
      module,
      anzahlModule: module.length,
      schritte: schritteFuer(demo.kategorie),
      preis: preisAus(i),
    };
  }

  // --- Fall 2: eine der 698 Branchen --------------------------------------
  const b = websiteBrancheBySlug(slug);
  if (!b) return null;
  const i = INHALT_JE_KATEGORIE[b.kategorie] || NOTNAGEL;
  const module = modulListe(b.kategorie);
  return {
    slug,
    titel: b.name,
    kategorie: b.kategorie,
    betrieb: null,
    ort: null,
    schmerzen: (b.schmerzen || []).slice(0, 3),
    hoehepunkte: (b.ergebnisse || []).slice(0, 3),
    kiFrage: i.kiFrage,
    kiAntwort: i.kiAntwort,
    kiEigen: false,
    module,
    anzahlModule: module.length,
    schritte: schritteFuer(b.kategorie),
    preis: preisAus(i),
  };
}

// ---------------------------------------------------------------------------
// Listen für die Übersichtsseite
// ---------------------------------------------------------------------------

export type BrancheKurz = { slug: string; name: string; kategorie: string };

/** Alle 698 für die Suche — bewusst schlank, das geht in den Browser. */
export function alleBranchenKurz(): BrancheKurz[] {
  return websiteBranchen()
    .map((b) => ({ slug: b.slug, name: b.name, kategorie: b.kategorie }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Die 19 Kategorien mit Anzahl — zum Blättern für die, die nicht tippen wollen. */
export function kategorienKurz(): { kategorie: string; anzahl: number; beispiele: string[] }[] {
  const map = new Map<string, string[]>();
  for (const b of websiteBranchen()) {
    if (!map.has(b.kategorie)) map.set(b.kategorie, []);
    map.get(b.kategorie)!.push(b.name);
  }
  const sortiert = [...map.keys()].sort(
    (a, b) => (KATEGORIE_ORDER.indexOf(a) + 1 || 99) - (KATEGORIE_ORDER.indexOf(b) + 1 || 99),
  );
  return sortiert.map((k) => ({
    kategorie: k,
    anzahl: map.get(k)!.length,
    beispiele: map.get(k)!.slice(0, 3),
  }));
}

/** Wie viele Branchen stehen insgesamt bereit? */
export function anzahlBranchen(): number {
  return websiteBranchen().length;
}
