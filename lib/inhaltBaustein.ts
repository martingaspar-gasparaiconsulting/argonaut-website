// ============================================================================
// ARGONAUT OS · lib/inhaltBaustein.ts
//
// DIE LOGIK DER INHALTS-WERKSTATT. Eine Tabelle (`inhalt_baustein`), vier
// Typen, ein Freigabe-Haken — hier steht, welcher Baustein wie heisst, welche
// Kapitel ein E-Book braucht und wann eines fertig ist.
//
// WARUM DAS EINE EIGENE DATEI IST
// E-Books und die 698 KI-Dialoge kommen aus derselben Quelle. Wuerde jede der
// vier Stellen (Erzeugung, Redaktion, E-Book-Bau, Dialog-Auslieferung) selbst
// ausrechnen, welche Kapitel dazugehoeren, liefen die vier Rechnungen frueher
// oder spaeter auseinander: der Stapel erzeugt Kapitel, die kein Buch abruft,
// und das Buch sucht Kapitel, die nie bestellt wurden. Beides waere teuer und
// voellig unsichtbar. Deshalb: EINE Quelle.
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks. Importiert ausschliesslich die
// drei Kataloge (rechte · branchenkatalog · pakete) — damit von Client,
// Server-Route UND Node aus nutzbar und vollstaendig node-testbar.
//
// DER SCHLUESSEL IST DER VERTRAG
// In der Datenbank liegt ein eindeutiger Index auf
// (owner_user_id, typ, schluessel). Der Schluessel MUSS deshalb aus derselben
// Funktion kommen wie beim Anlegen — sonst legt ein zweiter Lauf Dubletten an
// oder das Buch findet ein vorhandenes Kapitel nicht wieder.
// ============================================================================

import { NAV_LINKS, GRUPPEN } from './rechte';
import { KATEGORIE_MODULE, kategorieModule, kategorieZusatz } from './branchenkatalog';
import { KERN_MODULE } from './pakete';

// ---------------------------------------------------------------------------
// Die vier Typen
// ---------------------------------------------------------------------------

export type BausteinTyp =
  | 'modul_kapitel'       // ~113 · einmal geschrieben, gilt fuer jeden Kunden
  | 'kategorie_kapitel'   //   19 · je Website-Kategorie eines
  | 'branchen_vorwort'    //  698 · kurz, aus Schmerzen + Ergebnissen der Branche
  | 'ki_dialog';          //  698 · der Gespraechseinstieg je Branche

export const BAUSTEIN_TYPEN: readonly BausteinTyp[] = [
  'modul_kapitel',
  'kategorie_kapitel',
  'branchen_vorwort',
  'ki_dialog',
] as const;

export const TYP_LABEL: Record<BausteinTyp, string> = {
  modul_kapitel: 'Modul-Kapitel',
  kategorie_kapitel: 'Kategorie-Kapitel',
  branchen_vorwort: 'Branchen-Vorwort',
  ki_dialog: 'KI-Dialog',
};

/** Ist das ein bekannter Typ? Schuetzt die Route vor Tippfehlern aus dem Netz. */
export function istBausteinTyp(x: unknown): x is BausteinTyp {
  return typeof x === 'string' && (BAUSTEIN_TYPEN as readonly string[]).indexOf(x) >= 0;
}

// ---------------------------------------------------------------------------
// Schluessel — muss zum eindeutigen Index (owner_user_id, typ, schluessel) passen
// ---------------------------------------------------------------------------

/**
 * Aus beliebigem Text einen stabilen, kurzen Schluessel machen.
 * Umlaute werden ausgeschrieben, '&' wird zu '-und-', alles andere zu '-'.
 * Bewusst OHNE Zufall und OHNE Datum: derselbe Text ergibt immer denselben
 * Schluessel, auch in einem Jahr.
 */
export function schluessel(roh: string): string {
  const s = String(roh ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/&/g, '-und-')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
  return s || 'unbekannt';
}

/** Der Datenbank-Schluessel eines Bausteins — Typ und Schluessel zusammen. */
export function bausteinId(typ: string, key: string): string {
  return `${typ}::${key}`;
}

// ---------------------------------------------------------------------------
// Der Modul-Katalog fuers Buch
// ---------------------------------------------------------------------------

export type ModulKapitel = {
  /** Modul-Schluessel aus NAV_LINKS (z. B. 'rechnungen'). */
  modul: string;
  /** Das fuehrende Zeichen aus dem Menue-Label (z. B. '🧾'), ohne Text. */
  icon: string;
  /** Der Menue-Text ohne Zeichen (z. B. 'Rechnungen') — die Kapitel-Ueberschrift. */
  titel: string;
  /** Weitere Menue-Punkte, die auf dasselbe Modul zeigen (z. B. 'Posteingang'). */
  auch: string[];
  /** Anzeige-Gruppe aus dem Menue — gibt dem Buch seine Kapitel-Bloecke. */
  gruppe: string;
  /** Ab welcher Hierarchie-Ebene das Modul besessen werden darf (1–4). */
  ebene: 1 | 2 | 3 | 4;
  /** Der Datenbank-Schluessel dieses Kapitels. */
  schluessel: string;
};

/**
 * Menue-Label in Zeichen und Text zerlegen. '🧾 Rechnungen' -> '🧾' + 'Rechnungen'.
 * Bewusst mit einer einfachen Zeichenklasse statt Unicode-Eigenschaften:
 * das Projekt uebersetzt nach ES2017, und ein Buchstabe ist hier immer
 * lateinisch oder ein deutscher Umlaut.
 */
export function zerlegeLabel(label: string): { icon: string; titel: string } {
  const roh = String(label ?? '').trim();
  const treffer = roh.match(/^[^A-Za-zÄÖÜäöüß0-9]+/);
  if (!treffer) return { icon: '', titel: roh };
  const titel = roh.slice(treffer[0].length).trim();
  return { icon: treffer[0].trim(), titel: titel || roh };
}

let modulCache: ModulKapitel[] | null = null;

/**
 * Alle Modul-Kapitel in Menue-Reihenfolge, je Modul-Schluessel genau EINS.
 * Mehrere Menue-Punkte koennen auf dasselbe Modul zeigen (z. B. 'Mail &
 * Kalender' und 'Posteingang' auf 'mail-sync') — daraus wird ein Kapitel,
 * die weiteren Namen stehen in `auch` und gehoeren spaeter in den Prompt.
 */
export function alleModulKapitel(): ModulKapitel[] {
  if (modulCache) return modulCache;

  const nach = new Map<string, ModulKapitel>();
  for (const l of NAV_LINKS) {
    const key = l.modul;
    if (!key) continue;                       // Infrastruktur ohne Schluessel: kein Kapitel
    const { icon, titel } = zerlegeLabel(l.label);

    const da = nach.get(key);
    if (da) {
      if (titel && titel !== da.titel && da.auch.indexOf(titel) < 0) da.auch.push(titel);
      continue;
    }
    nach.set(key, {
      modul: key,
      icon,
      titel,
      auch: [],
      gruppe: l.gruppe ?? 'verwaltung',
      ebene: l.ebene ?? 3,
      schluessel: schluessel(key),
    });
  }

  const liste: ModulKapitel[] = [];
  nach.forEach((m) => { m.auch = Object.freeze(m.auch) as string[]; liste.push(Object.freeze(m)); });
  modulCache = Object.freeze(liste) as ModulKapitel[];
  return modulCache;
}

/** Ein einzelnes Modul-Kapitel nachschlagen. */
export function modulKapitel(modulKey: string): ModulKapitel | undefined {
  return alleModulKapitel().find((m) => m.modul === modulKey);
}

/**
 * Der lesbare Name einer Menue-Gruppe ('komm' -> 'Kommunikation & Wissen').
 * Wichtig fuer den Prompt: „Bereich im Programm: komm" sagt einem Modell
 * nichts, „Kommunikation & Wissen" schon. Zeichen fallen weg, leere Labels
 * (die Gruppe 'start' hat keines) fallen auf den Schluessel zurueck.
 */
export function gruppeLabel(key: string): string {
  const treffer = GRUPPEN.find((g) => g.key === key);
  const roh = String(treffer?.label ?? '').trim();
  if (!roh) return String(key ?? '');
  return zerlegeLabel(roh).titel || roh;
}

// ---------------------------------------------------------------------------
// Kategorien
// ---------------------------------------------------------------------------

/** Die 19 Website-Kategorien — aus derselben Quelle wie der Branchen-Katalog. */
export const KATEGORIEN: readonly string[] = Object.freeze(Object.keys(KATEGORIE_MODULE));

export function istKategorie(kategorie: string): boolean {
  return KATEGORIEN.indexOf(kategorie) >= 0;
}

/**
 * Die Modul-Kapitel einer Kategorie (Kern + kategoriespezifischer Zusatz),
 * in Menue-Reihenfolge. Module aus dem Katalog ohne Menue-Eintrag fallen
 * still raus — sichtbar gemacht werden sie von katalogWarnungen().
 */
export function kategorieKapitel(kategorie: string): ModulKapitel[] {
  const erlaubt = new Set<string>(kategorieModule(kategorie));
  return alleModulKapitel().filter((m) => erlaubt.has(m.modul));
}

/**
 * Module, die in KEINER Kategorie stehen (Stand heute 20 Stueck: Academy,
 * Mahnwesen, Personal, EUeR, Zahlungen, Kalkulator …). Sie sind laut
 * lib/pakete.ts als Extras a la carte buchbar. Ohne sie blieben rund 19 der
 * 113 geschriebenen Kapitel in jedem Buch ungenutzt — deshalb bekommen sie im
 * E-Book eine eigene Schlusssektion.
 */
export function extraKapitel(): ModulKapitel[] {
  const inKategorie = new Set<string>();
  for (const kat of KATEGORIEN) {
    for (const m of kategorieModule(kat)) inKategorie.add(m);
  }
  return alleModulKapitel().filter((m) => !inKategorie.has(m.modul));
}

/**
 * Wo laufen Katalog und Menue auseinander? Ein Modul-Schluessel im Katalog
 * ohne Menue-Eintrag erzeugt kein Kapitel — das faellt sonst niemandem auf.
 * Reine Diagnose, wirft nicht.
 */
export function katalogWarnungen(): string[] {
  const imMenue = new Set<string>(alleModulKapitel().map((m) => m.modul));
  const warnungen: string[] = [];
  const gesehen = new Set<string>();

  const pruefe = (modul: string, herkunft: string) => {
    if (imMenue.has(modul) || gesehen.has(modul)) return;
    gesehen.add(modul);
    warnungen.push(`Modul „${modul}" (${herkunft}) hat keinen Menue-Eintrag — dafuer entsteht kein Kapitel.`);
  };

  for (const m of KERN_MODULE) pruefe(m, 'Kern');
  for (const kat of KATEGORIEN) for (const m of kategorieZusatz(kat)) pruefe(m, kat);

  return warnungen;
}

// ---------------------------------------------------------------------------
// Der Bauplan eines E-Books
// ---------------------------------------------------------------------------

export type AbschnittArt = 'vorwort' | 'kategorie' | 'kern' | 'branche' | 'extra';

export type EbookAbschnitt = {
  art: AbschnittArt;
  typ: BausteinTyp;
  schluessel: string;
  ueberschrift: string;
  icon: string;
  /** Ohne diesen Abschnitt wird das Buch nicht ausgeliefert. */
  pflicht: boolean;
};

/**
 * ACHTUNG: Diese Texte stehen im fertigen Kunden-PDF — hier gehoeren echte
 * Umlaute hin, keine ae/oe/ue-Umschrift. (Am 16.08. im Probedruck aufgefallen:
 * im Inhaltsverzeichnis stand „Speziell FUER Ihre Branche".)
 */
export const ABSCHNITT_UEBERSCHRIFT: Record<AbschnittArt, string> = {
  vorwort: 'Vorwort',
  kategorie: 'Ihre Branche',
  kern: 'Was jeder Betrieb bekommt',
  branche: 'Speziell für Ihre Branche',
  extra: 'Was Sie zusätzlich dazubuchen können',
};

/**
 * Der vollstaendige Bauplan eines Branchen-E-Books, in Lese-Reihenfolge:
 *   Vorwort · Kategorie-Kapitel · Kern-Kapitel · Branchen-Kapitel · Extras.
 *
 * PFLICHT ist alles bis einschliesslich der Kern-Kapitel. Ein Buch ohne
 * Vorwort oder ohne Kern waere unvollstaendig; fehlende Extras faellt keinem
 * Leser auf. Genau daran entscheidet ebookStand(), ob ausgeliefert wird.
 */
export function ebookBauplan(kategorie: string, brancheKey: string): EbookAbschnitt[] {
  const kern = new Set<string>(KERN_MODULE);
  const kapitel = kategorieKapitel(kategorie);
  const bauplan: EbookAbschnitt[] = [];

  bauplan.push({
    art: 'vorwort',
    typ: 'branchen_vorwort',
    schluessel: schluessel(brancheKey),
    ueberschrift: ABSCHNITT_UEBERSCHRIFT.vorwort,
    icon: '',
    pflicht: true,
  });

  bauplan.push({
    art: 'kategorie',
    typ: 'kategorie_kapitel',
    schluessel: schluessel(kategorie),
    ueberschrift: kategorie,
    icon: '',
    pflicht: true,
  });

  const alsAbschnitt = (m: ModulKapitel, art: AbschnittArt, pflicht: boolean): EbookAbschnitt => ({
    art,
    typ: 'modul_kapitel',
    schluessel: m.schluessel,
    ueberschrift: m.titel,
    icon: m.icon,
    pflicht,
  });

  for (const m of kapitel) if (kern.has(m.modul)) bauplan.push(alsAbschnitt(m, 'kern', true));
  for (const m of kapitel) if (!kern.has(m.modul)) bauplan.push(alsAbschnitt(m, 'branche', false));
  for (const m of extraKapitel()) bauplan.push(alsAbschnitt(m, 'extra', false));

  return bauplan;
}

// ---------------------------------------------------------------------------
// Was ist freigegeben — und was fehlt noch
// ---------------------------------------------------------------------------

/** Eine Zeile aus `inhalt_baustein`, nur die Felder, die hier zaehlen. */
export type BausteinZeile = {
  typ: string;
  schluessel: string;
  titel?: string | null;
  text?: string | null;
  freigegeben?: boolean | null;
};

/**
 * Darf dieser Baustein in ein Buch? Nur mit Haken UND mit Text.
 * Ein freigegebener leerer Entwurf wuerde sonst eine leere Seite drucken —
 * deshalb zaehlt der Haken allein nicht.
 */
export function istVerwendbar(b: BausteinZeile | null | undefined): boolean {
  if (!b) return false;
  if (b.freigegeben !== true) return false;
  return typeof b.text === 'string' && b.text.trim().length > 0;
}

/** Zeilen nach Typ+Schluessel greifbar machen. */
export function schluesselIndex(zeilen: BausteinZeile[]): Map<string, BausteinZeile> {
  const index = new Map<string, BausteinZeile>();
  for (const z of zeilen ?? []) {
    if (!z || !z.typ || !z.schluessel) continue;
    index.set(bausteinId(z.typ, z.schluessel), z);
  }
  return index;
}

export type EbookStand = {
  gesamt: number;
  fertig: number;
  prozent: number;
  /** Alle Abschnitte ohne verwendbaren Baustein. */
  fehlend: EbookAbschnitt[];
  /** Nur die Pflicht-Abschnitte davon — die blockieren die Auslieferung. */
  pflichtFehlend: EbookAbschnitt[];
  /** Darf das Buch gebaut werden? */
  bereit: boolean;
};

/** Wie weit ist dieses Buch? */
export function ebookStand(bauplan: EbookAbschnitt[], zeilen: BausteinZeile[]): EbookStand {
  const index = schluesselIndex(zeilen);
  const fehlend: EbookAbschnitt[] = [];
  let fertig = 0;

  for (const a of bauplan ?? []) {
    if (istVerwendbar(index.get(bausteinId(a.typ, a.schluessel)))) fertig++;
    else fehlend.push(a);
  }

  const gesamt = (bauplan ?? []).length;
  const pflichtFehlend = fehlend.filter((a) => a.pflicht);
  return {
    gesamt,
    fertig,
    prozent: gesamt === 0 ? 0 : Math.round((fertig / gesamt) * 100),
    fehlend,
    pflichtFehlend,
    bereit: gesamt > 0 && pflichtFehlend.length === 0,
  };
}

/** Nur die verwendbaren Abschnitte, in Lese-Reihenfolge — das Inhaltsverzeichnis. */
export function ebookInhalt(
  bauplan: EbookAbschnitt[],
  zeilen: BausteinZeile[],
): Array<{ abschnitt: EbookAbschnitt; baustein: BausteinZeile }> {
  const index = schluesselIndex(zeilen);
  const out: Array<{ abschnitt: EbookAbschnitt; baustein: BausteinZeile }> = [];
  for (const a of bauplan ?? []) {
    const b = index.get(bausteinId(a.typ, a.schluessel));
    if (istVerwendbar(b)) out.push({ abschnitt: a, baustein: b as BausteinZeile });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Was muss in den naechsten Stapel? (Grundlage fuer Push 2)
// ---------------------------------------------------------------------------

export type OffenerBaustein = {
  typ: BausteinTyp;
  schluessel: string;
  ueberschrift: string;
  /** Zusatzangaben fuer den Prompt — je nach Typ Modul-Gruppe oder Kategorie. */
  kontext: Record<string, string>;
};

/**
 * Eine Branche, so weit sie fuer Vorwort und Dialog zaehlt.
 * Bewusst als PARAMETER statt als Import: die Branchendaten liegen in
 * app/vorschau/_lib/branchen-web.ts und ziehen ueber eine Megabyte
 * SEO-Texte nach. Diese Datei bleibt dadurch node-testbar und ohne
 * Abhaengigkeit zur Website-Ebene.
 */
export type BrancheLite = {
  slug: string;
  name: string;
  kategorie: string;
  schmerzen?: string[];
  ergebnisse?: string[];
};

/**
 * Welche Modul- und Kategorie-Kapitel gibt es noch gar nicht?
 * Bewusst NICHT „noch nicht freigegeben": ein Entwurf, der auf Redaktion
 * wartet, darf nicht ein zweites Mal erzeugt werden — das kostet Geld und
 * ueberschreibt Martins Korrekturen.
 */
export function offeneKapitel(zeilen: BausteinZeile[], branchen: BrancheLite[] = []): OffenerBaustein[] {
  const vorhanden = schluesselIndex(zeilen);
  const offen: OffenerBaustein[] = [];

  for (const m of alleModulKapitel()) {
    if (vorhanden.has(bausteinId('modul_kapitel', m.schluessel))) continue;
    offen.push({
      typ: 'modul_kapitel',
      schluessel: m.schluessel,
      ueberschrift: m.titel,
      kontext: { modul: m.modul, gruppe: gruppeLabel(m.gruppe), auch: m.auch.join(', ') },
    });
  }

  for (const kat of KATEGORIEN) {
    const key = schluessel(kat);
    if (vorhanden.has(bausteinId('kategorie_kapitel', key))) continue;
    offen.push({
      typ: 'kategorie_kapitel',
      schluessel: key,
      ueberschrift: kat,
      kontext: { kategorie: kat, module: kategorieKapitel(kat).map((m) => m.titel).join(', ') },
    });
  }

  // --- Vorwort und Dialog je Branche ---------------------------------------
  // Beide brauchen dieselben Angaben, deshalb in einem Durchlauf. Eine Branche
  // ohne Schmerzen und Ergebnisse bekommt trotzdem einen Auftrag — der Prompt
  // kommt mit dem Namen und der Kategorie allein aus, nur weniger konkret.
  const gesehen = new Set<string>();
  for (const b of branchen ?? []) {
    const key = schluessel(b?.slug || b?.name);
    if (!key || key === 'unbekannt') continue;
    if (gesehen.has(key)) continue;          // doppelte Slugs waeren sonst doppelt bestellt
    gesehen.add(key);

    const kontext: Record<string, string> = {
      kategorie: String(b?.kategorie ?? ''),
      schmerzen: (b?.schmerzen ?? []).slice(0, 6).join(' · '),
      ergebnisse: (b?.ergebnisse ?? []).slice(0, 6).join(' · '),
    };

    if (!vorhanden.has(bausteinId('branchen_vorwort', key))) {
      offen.push({ typ: 'branchen_vorwort', schluessel: key, ueberschrift: b.name, kontext });
    }
    if (!vorhanden.has(bausteinId('ki_dialog', key))) {
      offen.push({ typ: 'ki_dialog', schluessel: key, ueberschrift: b.name, kontext });
    }
  }

  return offen;
}

/** Mengengeruest fuer die Anzeige im Control Room. */
export function mengen(): { modulKapitel: number; kategorieKapitel: number; extras: number; kategorien: number } {
  return {
    modulKapitel: alleModulKapitel().length,
    kategorieKapitel: KATEGORIEN.length,
    extras: extraKapitel().length,
    kategorien: KATEGORIEN.length,
  };
}
