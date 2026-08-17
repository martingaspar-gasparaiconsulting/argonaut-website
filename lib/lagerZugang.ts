// lib/lagerZugang.ts
// Ernte → Lager (generischer Lager-Zugang): ordnet einen Ernte-Posten einem
// vorhandenen Lager-Artikel zu bzw. liefert die Stammdaten für einen neuen
// Artikel. KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client
// + Node). Node-getestet.
//
// 16.08.26 — ECHTER KATALOG-MATCH STATT NAMENSVERGLEICH
//
// Bis heute lief die Zuordnung ausschließlich über den Namen: der Text im
// Feld „Kultur" musste zeichengenau auf die Artikel-Bezeichnung passen.
// „Kartoffeln" traf nicht auf „Speisekartoffeln", „Weizen" nicht auf
// „Winterweizen". Der Ernte-Posten legte dann klaglos einen ZWEITEN Artikel
// an — und der Bestand stand ab da an zwei Stellen. Das fällt erst bei der
// Inventur auf, und dann weiß niemand mehr, welcher Posten wohin gehörte.
//
// Jetzt gilt eine feste Rangfolge:
//   1. AUSWAHL — der Nutzer hat beim Ernte-Posten einen Artikel gewählt
//                (ernte_ernte.artikel_id). Das ist die einzige Zuordnung,
//                die sicher stimmt, weil sie ein Mensch getroffen hat.
//   2. NUMMER  — die Artikelnummer stimmt überein (falls am Posten gepflegt).
//   3. NAME    — der bisherige Weg, jetzt nur noch als Auffanglösung.
//
// Die Rangfolge wird MITGELIEFERT (`weg`), damit die Oberfläche sagen kann,
// WIE zugeordnet wurde. „Bestand erhöht" und „Bestand erhöht — über den Namen
// gefunden" sind für den Betrieb zwei verschiedene Aussagen: die zweite sollte
// er kurz prüfen.
//
// Eine ausgewählte artikel_id, die es nicht mehr gibt (Artikel gelöscht), wird
// NICHT stillschweigend durch einen Namenstreffer ersetzt — sonst landet die
// Ernte auf einem Artikel, den der Nutzer nie gemeint hat. Sie gilt als
// ungültig und der Posten bleibt offen.

/** Normalisiert einen Namen für den Vergleich (trim, klein, Mehrfach-Leerzeichen → eins). */
export function normName(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface ArtikelLite {
  id: string;
  bezeichnung?: string | null;
  artikelnummer?: string | null;
}

/** Woher die Zuordnung stammt — von der sichersten zur schwächsten. */
export type ZuordnungsWeg = 'auswahl' | 'nummer' | 'name' | 'keiner' | 'auswahl_ungueltig';

export interface Zuordnung {
  artikelId: string | null;
  weg: ZuordnungsWeg;
  /** Klartext für die Rückmeldung an den Betrieb. */
  hinweis: string;
}

export interface ErnteBezug {
  /** Der vom Nutzer gewählte Lager-Artikel. Hat immer Vorrang. */
  artikel_id?: string | null;
  /** Artikelnummer am Posten, falls gepflegt. */
  artikelnummer?: string | null;
  /** Die Kultur/Bezeichnung — der bisherige Weg. */
  kultur?: string | null;
}

/**
 * Ordnet einen Ernte-Posten einem Lager-Artikel zu.
 * Wirft nie; liefert bei jedem Ausgang einen Klartext-Hinweis mit.
 */
export function ordneArtikelZu(bezug: ErnteBezug, artikel: ArtikelLite[]): Zuordnung {
  const liste = Array.isArray(artikel) ? artikel : [];

  // --- 1. Auswahl -----------------------------------------------------------
  const gewaehlt = String(bezug?.artikel_id ?? '').trim();
  if (gewaehlt) {
    const treffer = liste.find((a) => a.id === gewaehlt);
    if (treffer) {
      return {
        artikelId: treffer.id,
        weg: 'auswahl',
        hinweis: `Zugeordnet zum gewählten Artikel „${treffer.bezeichnung ?? treffer.id}".`,
      };
    }
    // Bewusst KEIN Rückfall auf den Namen — siehe Kopf der Datei.
    return {
      artikelId: null,
      weg: 'auswahl_ungueltig',
      hinweis: 'Der zugeordnete Lager-Artikel existiert nicht mehr. Bitte neu auswählen.',
    };
  }

  // --- 2. Artikelnummer -----------------------------------------------------
  const nr = normName(bezug?.artikelnummer);
  if (nr) {
    const treffer = liste.find((a) => normName(a.artikelnummer) === nr);
    if (treffer) {
      return {
        artikelId: treffer.id,
        weg: 'nummer',
        hinweis: `Über die Artikelnummer „${bezug?.artikelnummer}" zugeordnet.`,
      };
    }
  }

  // --- 3. Name (Auffanglösung) ---------------------------------------------
  const ziel = normName(bezug?.kultur);
  if (ziel) {
    const treffer = liste.find((a) => normName(a.bezeichnung) === ziel);
    if (treffer) {
      return {
        artikelId: treffer.id,
        weg: 'name',
        hinweis: `Über den Namen gefunden — bitte kurz prüfen, ob „${treffer.bezeichnung}" wirklich gemeint ist.`,
      };
    }
  }

  return {
    artikelId: null,
    weg: 'keiner',
    hinweis: 'Kein passender Lager-Artikel gefunden — es wird ein neuer angelegt.',
  };
}

/**
 * Findet die artikel_id zu einer Bezeichnung (erster Namens-Treffer) oder null.
 * ALTFASSUNG — bleibt für vorhandene Aufrufer erhalten und benutzt intern
 * dieselbe Rangfolge. Neuer Code nimmt ordneArtikelZu().
 */
export function findeArtikelId(bezeichnung: string | null | undefined, artikel: ArtikelLite[]): string | null {
  return ordneArtikelZu({ kultur: bezeichnung }, artikel).artikelId;
}

/** Darf mit dieser Zuordnung eingelagert werden? */
export function darfBuchen(z: Zuordnung): boolean {
  return z.weg !== 'auswahl_ungueltig';
}

/** Ist die Zuordnung sicher genug, um sie unkommentiert zu übernehmen? */
export function istSicher(z: Zuordnung): boolean {
  return z.weg === 'auswahl' || z.weg === 'nummer';
}

export interface ArtikelStamm { bezeichnung: string; kategorie: string; einheit: string; }

/** Stammdaten für einen neuen Lager-Artikel aus einem Ernte-Posten (ohne Bestand). */
export function artikelStammAusErnte(kultur?: string | null, einheit?: string | null): ArtikelStamm {
  const bez = (kultur || '').trim() || 'Ernte';
  return { bezeichnung: bez.slice(0, 200), kategorie: 'Ernte', einheit: (einheit || '').trim() || 'kg' };
}

/** Menge sauber als nicht-negative Zahl (max. 3 Nachkommastellen). */
export function zugangsMenge(menge: unknown): number {
  const n = Number(menge) || 0;
  return n > 0 ? Math.round(n * 1000) / 1000 : 0;
}

/** Neuer Bestand nach einem Zugang (alt + Zugang, nie negativ). */
export function neuerBestand(alt: unknown, zugang: unknown): number {
  const a = Number(alt) || 0;
  const z = zugangsMenge(zugang);
  return Math.round((a + z) * 1000) / 1000;
}
