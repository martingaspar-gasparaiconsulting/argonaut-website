// ============================================================================
// ARGONAUT OS · lib/nutzung.ts — Punkt 6.4: was wirklich benutzt wird
//
// ▄▄▄ DIE GRENZE, DIE HIER NICHT ÜBERSCHRITTEN WIRD ▄▄▄
// Gezählt wird JE BETRIEB, JE MODUL, JE TAG — niemals je Mitarbeiter.
//
// § 87 Abs. 1 Nr. 6 BetrVG macht technische Einrichtungen mitbestimmungs-
// pflichtig, die zur Überwachung von Leistung und Verhalten GEEIGNET sind.
// Auf die Absicht kommt es nicht an: Eine Tabelle mit Bearbeitungsdauer je
// Person wäre auch dann mitbestimmungspflichtig, wenn niemand vorhat,
// hineinzusehen. Deshalb gibt es hier keine Spalte, in die eine Person passt.
//
// Wer diese Datei erweitert: Ein Feld, das eine einzelne Person identifizierbar
// macht — auch mittelbar, etwa „Standort mit einem Mitarbeiter“ oder eine
// Uhrzeit auf die Minute — gehört NICHT hierher, sondern erst nach der
// Freigabe (Block I der Anwaltsliste).
//
// ▄▄▄ WAS BEWUSST NICHT GEZÄHLT WIRD ▄▄▄
// Kein Klick-Protokoll. Das kostet Speicher, erzeugt Lärm und macht aus einer
// Statistik eine Überwachungsanlage. Eine Zeile am Tag je Modul genügt für die
// Frage, die wirklich zählt: Was benutzt niemand?
//
// Die technischen Antwortzeiten je Route misst Vercel bereits — dafür muss
// nichts gebaut werden. Hier geht es um die andere Hälfte: wo der MENSCH nicht
// weiterkommt.
//
// Reine Rechenlogik — kein Netzwerk, keine Datenbank, node-testbar.
// ============================================================================

import { modulKeyFuerPfad } from './tenantModule';

/** Sammelbecken für Seiten, die zu keinem buchbaren Modul gehören. */
export const OHNE_MODUL = 'sonstiges';

/** Die Übersicht ist kein Modul, aber ihr Aufruf sagt etwas aus. */
export const UEBERSICHT = 'uebersicht';

/** Ab wann gilt ein unfertiges Onboarding als hängengeblieben. */
export const HAENGT_AB_TAGEN = 14;

/**
 * Wie viele universelle Grundschritte das Onboarding hat.
 *
 * Das ist die Länge von SCHRITTE in app/dashboard/onboarding/page.tsx. Sie
 * steht hier als Zahl, weil die Onboarding-Seite eine Client-Komponente ist
 * und in einer reinen Logik-Datei nichts zu suchen hat.
 *
 * WER DORT EINEN SCHRITT ERGÄNZT ODER STREICHT, ZIEHT DIESE ZAHL MIT. Sonst
 * gilt ein fertiger Betrieb als Abbrecher (Zahl zu hoch) oder ein Abbrecher
 * als fertig (Zahl zu niedrig). Der Test in tests/nutzung.test.mjs hält beide
 * Fälle fest.
 *
 * Branchenschritte kommen je nach Gewerk obendrauf; wer alle Grundschritte
 * erledigt hat, gilt hier trotzdem als durch. Die Statistik soll Abbrüche am
 * ANFANG finden — dort bricht ab, wer abbricht.
 */
export const GRUNDSCHRITTE = 11;

// ---------------------------------------------------------------------------
// Vom Pfad zum Modul
// ---------------------------------------------------------------------------

/**
 * Zählt dieser Pfad überhaupt?
 *
 * Nur Seiten im Dashboard. Schnittstellen-Aufrufe (/api/…) und alles
 * Öffentliche bleiben draußen: Ein Hintergrundabruf ist keine Benutzung, und
 * eine Statistik, in der die Technik mitzählt, beantwortet die Frage nicht
 * mehr, für die sie gebaut wurde.
 */
export function istZaehlbar(pfad: unknown): boolean {
  const p = String(pfad ?? '').trim();
  if (!p.startsWith('/dashboard')) return false;
  if (p.startsWith('/dashboard/api')) return false;
  return true;
}

/**
 * Der Modul-Schlüssel zu einem Pfad.
 *
 * Bewusst über dieselbe Zuordnung wie das Buchungs-Gate (lib/tenantModule.ts):
 * Würde hier eine zweite Liste gepflegt, zeigte die Statistik eines Tages
 * Module, die es nicht mehr gibt — und niemand wüsste, welche Liste stimmt.
 */
export function modulAusPfad(pfad: unknown): string {
  const p = String(pfad ?? '').trim();
  if (!istZaehlbar(p)) return '';
  const sauber = p.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/dashboard';
  if (sauber === '/dashboard') return UEBERSICHT;
  return modulKeyFuerPfad(sauber) ?? OHNE_MODUL;
}

// ---------------------------------------------------------------------------
// Auswertung der Modulnutzung
// ---------------------------------------------------------------------------

export type NutzungZeile = {
  modul_key: string;
  /** Wie viele verschiedene Betriebe das Modul benutzt haben. */
  betriebe: number;
  /** Summe der Aufrufe im Zeitraum. */
  aufrufe: number;
};

/** Absteigend nach Aufrufen; bei Gleichstand alphabetisch, damit die Reihenfolge stabil ist. */
export function nachNutzung(zeilen: readonly NutzungZeile[] | null | undefined): NutzungZeile[] {
  return (Array.isArray(zeilen) ? zeilen.slice() : []).sort(
    (a, b) => (b.aufrufe - a.aufrufe) || String(a.modul_key).localeCompare(String(b.modul_key), 'de'),
  );
}

/**
 * Die Module, die im Zeitraum NIEMAND geöffnet hat.
 *
 * Das ist die eigentliche Frage. Ein Modul, das oben in der Liste steht,
 * bestätigt nur, was man ohnehin ahnt — ein Modul mit Null Aufrufen ist
 * entweder überflüssig, unauffindbar oder kaputt. Alle drei Fälle sind es
 * wert, dass jemand hinsieht.
 */
export function nieBenutzt(
  alleModule: readonly string[] | null | undefined,
  zeilen: readonly NutzungZeile[] | null | undefined,
): string[] {
  const benutzt = new Set(
    (Array.isArray(zeilen) ? zeilen : [])
      .filter((z) => Number(z?.aufrufe) > 0)
      .map((z) => String(z?.modul_key ?? '')),
  );
  const raus: string[] = [];
  for (const m of Array.isArray(alleModule) ? alleModule : []) {
    const k = String(m ?? '').trim();
    if (k && !benutzt.has(k) && !raus.includes(k)) raus.push(k);
  }
  return raus.sort((a, b) => a.localeCompare(b, 'de'));
}

/** Gesamtzahl der Aufrufe über alle Module. */
export function summeAufrufe(zeilen: readonly NutzungZeile[] | null | undefined): number {
  return (Array.isArray(zeilen) ? zeilen : []).reduce((s, z) => s + (Number(z?.aufrufe) || 0), 0);
}

// ---------------------------------------------------------------------------
// Wo das Onboarding abbricht
// ---------------------------------------------------------------------------

export type OnboardingStand = {
  /** Der BETRIEB, nicht die Person. */
  owner_user_id: string;
  erledigte: number;
  letzte_aktivitaet: string | null;
};

/** Volle Tage seit dem letzten Schritt. -1 = unbekannt (nie etwas erledigt). */
export function tageStill(letzteAktivitaet: unknown, jetzt: Date = new Date()): number {
  const roh = String(letzteAktivitaet ?? '').trim();
  if (!roh) return -1;
  const d = new Date(roh);
  if (isNaN(d.getTime())) return -1;
  const ms = jetzt.getTime() - d.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * Hängt dieser Betrieb im Onboarding fest?
 *
 * Zwei Bedingungen: nicht fertig UND seit mindestens 14 Tagen kein Schritt.
 * Wer gestern angefangen hat, hängt nicht — er arbeitet. Ein Betrieb, der nie
 * einen Schritt erledigt hat, hängt ebenfalls (er ist bei null steckengeblieben).
 */
export function haengtFest(
  stand: OnboardingStand | null | undefined,
  gesamtSchritte: number,
  jetzt: Date = new Date(),
): boolean {
  if (!stand) return false;
  const erledigt = Math.max(0, Number(stand.erledigte) || 0);
  if (gesamtSchritte > 0 && erledigt >= gesamtSchritte) return false;
  const still = tageStill(stand.letzte_aktivitaet, jetzt);
  if (still === -1) return true;
  return still >= HAENGT_AB_TAGEN;
}

export type Abbruchstelle = { erledigte: number; betriebe: number };

/**
 * Wie viele Betriebe stehen bei wie vielen erledigten Schritten?
 *
 * Die Häufung ist die Antwort: Bleiben sechs von zehn Betrieben bei genau
 * zwei Schritten stehen, ist der dritte Schritt das Problem — nicht die
 * Betriebe.
 */
export function abbruchstellen(
  staende: readonly OnboardingStand[] | null | undefined,
  gesamtSchritte: number,
  jetzt: Date = new Date(),
): Abbruchstelle[] {
  const zaehler = new Map<number, number>();
  for (const s of Array.isArray(staende) ? staende : []) {
    if (!haengtFest(s, gesamtSchritte, jetzt)) continue;
    const n = Math.max(0, Number(s?.erledigte) || 0);
    zaehler.set(n, (zaehler.get(n) ?? 0) + 1);
  }
  return Array.from(zaehler.entries())
    .map(([erledigte, betriebe]) => ({ erledigte, betriebe }))
    .sort((a, b) => (b.betriebe - a.betriebe) || (a.erledigte - b.erledigte));
}

/** Ein Satz fürs Command Center — oder leer, wenn nichts hängt. */
export function abbruchSatz(stellen: readonly Abbruchstelle[] | null | undefined): string {
  const liste = Array.isArray(stellen) ? stellen : [];
  if (!liste.length) return '';
  const groesste = liste[0];
  const wort = groesste.betriebe === 1 ? 'Betrieb bleibt' : 'Betriebe bleiben';
  return `${groesste.betriebe} ${wort} nach ${groesste.erledigte} Schritten stehen — dort lohnt der Blick zuerst.`;
}
