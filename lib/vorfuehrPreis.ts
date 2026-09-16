// ============================================================================
// ARGONAUT OS · lib/vorfuehrPreis.ts — Preisrechnung der Vorführung
//
// Bewusst von lib/vorfuehrung.ts getrennt: Diese Datei importiert NUR lib/tarif
// und ist damit federleicht. Der Abspieler im Browser rechnet den Preis live
// mit, sobald ein Besucher seine Betriebsgröße antippt — er soll dafür aber
// nicht den kompletten Branchenkatalog von einem halben Megabyte mitladen.
//
// Gerechnet wird mit denselben Funktionen wie im Angebot: gleiche Stufen,
// gleiche Sitzpreise, gleicher Laufzeitrabatt. Es gibt keine zweite Wahrheit.
//
// Keine Hooks, keine Seiteneffekte — node-testbar, Client + Server.
// ============================================================================

import { firmenweit, sitzPreis, laufzeitRabattProzent } from './tarif';

export type PreisBild = {
  stufe: string;
  mitarbeiter: number;
  standorte: number;
  posten: { label: string; betrag: number }[];
  monat: number;
  einrichtung: number;
  jeMitarbeiter: number;
  monat36: number;
  ersparnis36: number;
  rabatt36: number;
};

export type SitzMix = { voll: number; standard: number; self: number };

/**
 * Macht aus einer Formulareingabe eine brauchbare ganze Zahl. Leeres Feld,
 * Text, NaN, Unendlich oder eine negative Zahl ergeben den Mindestwert.
 */
function ganzeZahl(wert: number, mindestens: number): number {
  const n = Number(wert);
  if (!Number.isFinite(n)) return mindestens;
  return Math.max(mindestens, Math.round(n));
}

/**
 * Verteilt die Mitarbeiter auf die Standorte, damit firmenweit() eine echte
 * Standortliste bekommt. Der erste Standort erhält den Rest der Division —
 * das entspricht der Praxis: die Zentrale ist größer als die Filiale.
 *
 * REPARIERT 16.09.2026 — waren mehr Standorte gewuenscht als Mitarbeiter da
 * sind, entstanden hier Standorte mit 0 Mitarbeitern. tarif.firmenweit() wirft
 * leere Standorte heraus (zu Recht), damit fiel der Standort-Zuschlag weg und
 * 11 Standorte wurden BILLIGER als 10: 2.966 EUR statt 3.407 EUR im Monat,
 * 3.900 EUR statt 5.610 EUR Einrichtung. Ein Interessent sieht das sofort.
 *
 * Jeder Standort hat mindestens einen Menschen. Sind mehr Standorte angegeben
 * als Mitarbeiter, wird die Mitarbeiterzahl deshalb auf die Standortzahl
 * angehoben — das Ergebnis weist die gezaehlte Zahl in `mitarbeiter` aus.
 */
function standortListe(mitarbeiter: number, standorte: number): { mitarbeiter: number }[] {
  const n = ganzeZahl(standorte, 1);
  const ma = Math.max(ganzeZahl(mitarbeiter, 1), n);
  const pro = Math.floor(ma / n);
  const rest = ma - pro * n;
  return Array.from({ length: n }, (_, i) => ({ mitarbeiter: pro + (i === 0 ? rest : 0) }));
}

/**
 * Sitz-Verteilung zu einer Betriebsgröße.
 *
 * Erfahrungswert aus den durchgerechneten Beispielen: etwa ein Sechstel führt
 * und verwaltet (Voll), zwei Fünftel arbeiten operativ im System (Standard),
 * der Rest braucht nur Zeiterfassung und den eigenen Bereich (Self-Service).
 * Kleine Betriebe haben anteilig mehr Voll-Nutzer — dort macht der Chef alles
 * selbst, und bei ein bis zwei Personen gibt es gar nichts zu verteilen.
 */
export function sitzMixFuer(mitarbeiter: number): SitzMix {
  const ma = ganzeZahl(mitarbeiter, 1);
  if (ma <= 2) return { voll: ma, standard: 0, self: 0 };
  if (ma <= 9) {
    const voll = Math.max(1, Math.round(ma * 0.35));
    const standard = Math.round(ma * 0.45);
    return { voll, standard, self: Math.max(0, ma - voll - standard) };
  }
  const voll = Math.max(1, Math.round(ma * 0.16));
  const standard = Math.round(ma * 0.4);
  return { voll, standard, self: Math.max(0, ma - voll - standard) };
}

/** Vollständiges Preisbild zu Größe, Standorten und Sitz-Verteilung. */
export function preisAus(eingabe: { mitarbeiter: number; standorte: number; sitze: SitzMix }): PreisBild {
  const f = firmenweit(standortListe(eingabe.mitarbeiter, eingabe.standorte));
  const pVoll = sitzPreis('voll', f.stufe.key);
  const pStd = sitzPreis('standard', f.stufe.key);
  const pSelf = sitzPreis('self_service', f.stufe.key);

  const posten: { label: string; betrag: number }[] = [
    { label: `Grundgebühr ${f.stufe.name}`, betrag: f.grundgebuehr },
  ];
  if (f.standortZuschlag > 0) {
    posten.push({ label: `${f.standorte - 1} weitere Standorte`, betrag: f.standortZuschlag });
  }
  // SOLO ist All-in: ein Voll-Nutzer und die KI sind enthalten, es gibt keine
  // getrennten Sitze. Sie hier aufzuschlagen wäre schlicht falsch.
  if (!f.stufe.allIn) {
    if (eingabe.sitze.voll > 0) posten.push({ label: `${eingabe.sitze.voll} × Voll-Nutzer`, betrag: eingabe.sitze.voll * pVoll });
    if (eingabe.sitze.standard > 0) posten.push({ label: `${eingabe.sitze.standard} × Standard-Nutzer`, betrag: eingabe.sitze.standard * pStd });
    if (eingabe.sitze.self > 0) posten.push({ label: `${eingabe.sitze.self} × Self-Service`, betrag: eingabe.sitze.self * pSelf });
  } else {
    posten.push({ label: '1 Voll-Nutzer + KI enthalten', betrag: 0 });
  }

  const monat = posten.reduce((a, p) => a + p.betrag, 0);
  const rabatt36 = laufzeitRabattProzent(36);
  const monat36 = Math.round(monat * (1 - rabatt36 / 100) * 100) / 100;

  return {
    stufe: f.stufe.name,
    mitarbeiter: f.gesamtMitarbeiter,
    standorte: f.standorte,
    posten,
    monat,
    einrichtung: f.einrichtungGesamt,
    jeMitarbeiter: Math.round((monat / Math.max(1, f.gesamtMitarbeiter)) * 100) / 100,
    monat36,
    ersparnis36: Math.round((monat - monat36) * 36 * 100) / 100,
    rabatt36,
  };
}

/**
 * Die Mitarbeiterzahl, mit der wirklich gerechnet wird: mindestens eine Person
 * je Standort. Stufe UND Sitz-Mix muessen dieselbe Zahl benutzen — sonst zahlt
 * ein Betrieb mit 2 Personen an 3 Standorten mehr als einer mit 3 Personen.
 */
export function effektiveMitarbeiter(mitarbeiter: number, standorte: number): number {
  return Math.max(ganzeZahl(mitarbeiter, 1), ganzeZahl(standorte, 1));
}

/** Preisbild zu einer frei gewählten Betriebsgröße — für den Abspieler. */
export function preisFuerGroesse(mitarbeiter: number, standorte = 1): PreisBild {
  const ma = effektiveMitarbeiter(mitarbeiter, standorte);
  return preisAus({ mitarbeiter: ma, standorte, sitze: sitzMixFuer(ma) });
}
