// ============================================================================
// ARGONAUT OS · Phase 2 · Modul A · Baustein "Wartungs-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten.
// Baut ADDITIV auf ./fristLogik auf: berechnet die Wiederkehr-Daten eines
// Wartungsvertrags und reicht das Ergebnis-Datum an die bestehende
// berechneAmpel()-Logik weiter. KEINE eigene Ampel-Palette, KEIN Doppel-Muster.
//
// Zeitzonen-Regel (ARGONAUT): Datum IMMER lokal auf Mitternacht bilden
// (getFullYear/getMonth/getDate), NIE toISOString() — sonst Tag-Versatz.
// Wir nutzen dafür konsequent parseDatum() aus fristLogik.
//
// Q4 (14.07.26): Die Ampel-Schwellen (gelb/rot) standen doppelt — hier in
// wartungsAmpel UND inline in wartung/page.tsx. Jetzt gibt es dafür EINE
// exportierte Quelle: ampelSchwellen(). Kopf-Kacheln und Zeilen-Ampel lesen
// beide daraus. Verhalten unveraendert, nur keine zwei Rechenwege mehr.
// ============================================================================

import {
  berechneAmpel,
  parseDatum,
  AmpelErgebnis,
} from './fristLogik';

// --- Datentyp: das Minimum, das die Logik zum Rechnen braucht ----------------
// Bewusst schlank gehalten — passt auf eine Zeile aus `wartungsvertraege`.
export interface WartungBasis {
  beginn_am?: string | Date | null;
  intervall_monate?: number | null;
  letzte_wartung_am?: string | Date | null;
  naechste_faelligkeit_am?: string | Date | null;
  erinnerung_tage_vorher?: number | null;
  status?: string | null;
}

// --- Datum lokal auf Mitternacht (gleiche Regel wie fristLogik) --------------
function aufMitternachtLokal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Formatiert ein Date als reines "YYYY-MM-DD" (lokal, ohne UTC-Versatz).
 * Dieses Format speichern wir in der DB-Spalte (Typ date).
 */
export function alsDatumString(d: Date | null): string | null {
  if (!d) return null;
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, '0');
  const tag = String(d.getDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

/**
 * Addiert Monate auf ein Datum — überlaufsicher.
 * Beispiel: 31.01. + 1 Monat -> 28.02. (nicht 03.03.), weil der Februar
 * keinen 31. hat. So bleibt der Wartungsrhythmus sauber am Monatsende.
 */
export function addiereMonate(basis: Date, monate: number): Date {
  const jahr = basis.getFullYear();
  const monat = basis.getMonth();
  const tag = basis.getDate();

  const zielMonat = monat + monate;
  // Letzter Tag des Zielmonats (Tag 0 des Folgemonats):
  const letzterTagZielmonat = new Date(jahr, zielMonat + 1, 0).getDate();
  const sichererTag = Math.min(tag, letzterTagZielmonat);

  return new Date(jahr, zielMonat, sichererTag);
}

/**
 * Herzstück: berechnet die NÄCHSTE Fälligkeit eines Wartungsvertrags.
 *
 * Regel:
 *  - Ausgangspunkt ist die letzte Wartung; fehlt sie, der Vertragsbeginn.
 *  - Es wird das Intervall (in Monaten) aufaddiert.
 *  - Liegt das Ergebnis in der Vergangenheit, wird so lange weiter-
 *    addiert, bis das Datum HEUTE oder in der Zukunft liegt. So bleibt
 *    ein lange nicht gewarteter Vertrag nicht auf einem uralten Datum
 *    hängen, sondern zeigt die realistisch nächste Fälligkeit.
 *
 * @returns Date der nächsten Fälligkeit, oder null wenn kein Startdatum da ist.
 */
export function berechneNaechsteFaelligkeit(v: WartungBasis): Date | null {
  const start =
    parseDatum(v.letzte_wartung_am ?? null) ??
    parseDatum(v.beginn_am ?? null);

  if (!start) return null;

  const intervall =
    v.intervall_monate && v.intervall_monate > 0 ? v.intervall_monate : 12;

  let faellig = addiereMonate(aufMitternachtLokal(start), intervall);
  const heute = aufMitternachtLokal(new Date());

  // Vorrollen, bis die Fälligkeit nicht mehr in der Vergangenheit liegt.
  // Sicherheitslimit gegen Endlosschleifen (max. 1000 Schritte).
  let schutz = 0;
  while (faellig.getTime() < heute.getTime() && schutz < 1000) {
    faellig = addiereMonate(faellig, intervall);
    schutz++;
  }

  return faellig;
}

/**
 * Bequemer Wrapper: nächste Fälligkeit direkt als "YYYY-MM-DD"-String
 * (zum Speichern in wartungsvertraege.naechste_faelligkeit_am).
 */
export function naechsteFaelligkeitString(v: WartungBasis): string | null {
  return alsDatumString(berechneNaechsteFaelligkeit(v));
}

/**
 * EINE Quelle fuer die Ampel-Schwellen eines Wartungsvertrags (Q4).
 *
 * - Gelb-Schwelle = erinnerung_tage_vorher des Vertrags (Default 14).
 * - Rot-Schwelle  = 7 Tage (bzw. kleiner, falls Erinnerung < 7).
 *
 * Vorher stand diese Regel doppelt: hier in wartungsAmpel UND inline in
 * wartung/page.tsx (fuer die Zeilen-Ampel). Damit Kopf-Kacheln und Zeilen-Ampel
 * NIE auseinanderlaufen koennen, liest ab jetzt BEIDES aus dieser Funktion.
 */
export function ampelSchwellen(v: WartungBasis): { gelbAb: number; rotAb: number } {
  const gelbAb =
    v.erinnerung_tage_vorher && v.erinnerung_tage_vorher > 0
      ? v.erinnerung_tage_vorher
      : 14;
  const rotAb = Math.min(7, gelbAb);
  return { gelbAb, rotAb };
}

/**
 * Wartungs-Ampel: dünner Wrapper um die bestehende berechneAmpel().
 *
 * - Nutzt das gespeicherte naechste_faelligkeit_am, wenn vorhanden;
 *   sonst wird es on-the-fly aus letzte Wartung/Beginn berechnet.
 * - Schwellen kommen aus ampelSchwellen() (EINE Quelle, siehe oben).
 * - Pausierte/gekündigte Verträge liefern bewusst KEINE dringende Ampel
 *   (grau/neutral), damit sie die Liste nicht fälschlich rot färben.
 */
export function wartungsAmpel(v: WartungBasis): AmpelErgebnis {
  // Bei nicht-aktiven Verträgen: neutraler Zustand über leeres Datum.
  const istAktiv = !v.status || v.status === 'aktiv';
  if (!istAktiv) {
    return berechneAmpel(null); // -> grau "Kein Datum"-Zustand
  }

  const faellig =
    parseDatum(v.naechste_faelligkeit_am ?? null) ??
    berechneNaechsteFaelligkeit(v);

  const { gelbAb, rotAb } = ampelSchwellen(v);

  return berechneAmpel(faellig, { gelbAbTagen: gelbAb, rotAbTagen: rotAb });
}

/**
 * Sortier-Schlüssel für "dringendste zuerst".
 * Kleinere Zahl = dringender. Verträge ohne Datum landen ganz hinten.
 * Praktisch: Array.sort((a,b) => sortierSchluessel(a) - sortierSchluessel(b))
 */
export function sortierSchluessel(v: WartungBasis): number {
  const a = wartungsAmpel(v);
  if (a.resttage === null) return Number.MAX_SAFE_INTEGER;
  return a.resttage;
}

/**
 * Kleine Helfer für die UI-Zusammenfassung (z. B. Kopf-Kacheln):
 * zählt Verträge nach Ampel-Status.
 */
export function zaehleNachStatus(liste: WartungBasis[]): {
  rot: number;
  gelb: number;
  gruen: number;
  neutral: number;
} {
  const summe = { rot: 0, gelb: 0, gruen: 0, neutral: 0 };
  for (const v of liste) {
    const s = wartungsAmpel(v).status;
    if (s === 'rot') summe.rot++;
    else if (s === 'gelb') summe.gelb++;
    else if (s === 'gruen') summe.gruen++;
    else summe.neutral++;
  }
  return summe;
}
