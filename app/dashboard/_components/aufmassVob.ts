// ============================================================================
// ARGONAUT OS · aufmassVob.ts
// Punkt 59 / R9 (Raumbuch) + Punkt 60 / R10 (VOB/C-Übermessung, Abzugsflächen)
//
// Reine Funktionen. Kein DB-Zugriff, kein React. Ein einziger Import:
// `runde3` aus aufmassFormel — damit NICHT zum dritten Mal ein eigener
// Runder entsteht. Genau das ist Punkt 30.
//
// ▄▄▄ DER BEFUND ▄▄▄
// Über alle Dateien nach `raumbuch|VOB|uebermess|abzugsfl` gesucht: null
// Treffer. Maler, Trockenbau und Bodenleger übermessen heute im Kopf.
// Wer im Kopf rechnet, rechnet irgendwann anders als sein Auftraggeber —
// und bei einer strittigen Schlussrechnung ist der Rechenweg das, was zählt.
//
// ▄▄▄ WAS "ÜBERMESSEN" HEISST ▄▄▄
// Eine Wand mit einem Fenster wird nicht gestrichen, wo das Fenster ist.
// Trotzdem darf der Maler die Fensterfläche mitberechnen, solange sie unter
// einer Grenze bleibt. Der Gedanke dahinter: der Mehraufwand fürs Umschneiden,
// Abkleben und Anarbeiten gleicht die Materialersparnis aus. Über der Grenze
// kippt das — dann wird abgezogen, und die Laibungen werden gesondert
// gerechnet.
//
// ▄▄▄ VIER FEHLER, DIE DIESE DATEI VERHINDERN SOLL ▄▄▄
//
//  1. EINE ZAHL FÜR ALLE GEWERKE.
//     Die Grenze ist NICHT überall 2,50 m². Sie hängt am Gewerk, und
//     innerhalb eines Gewerks sogar an der Art der Unterbrechung: bei
//     Fliesenarbeiten wird eine Wandöffnung (Tür, Fenster) anders behandelt
//     als eine Aussparung für ein eingebautes Teil. Deshalb trägt jedes
//     Gewerk hier zwei Flächengrenzen, nicht eine.
//
//  2. DIE GRENZE ALS FREIBETRAG BEHANDELN.
//     Sie ist eine FREIGRENZE. Ein Fenster mit 2,60 m² wird bei einer Grenze
//     von 2,50 m² GANZ abgezogen, nicht nur die 0,10 m² darüber. Derselbe
//     Denkfehler wie bei der Bagatellgrenze des § 48 EStG in Punkt 57.
//
//  3. DIE GRENZE AUF DIE SUMME ANWENDEN.
//     Sie gilt je EINZELöffnung. Drei Fenster zu je 2,00 m² werden alle drei
//     übermessen, obwohl sie zusammen 6,00 m² ergeben. Wer summiert und dann
//     vergleicht, zieht 6,00 m² ab, die dem Betrieb zustehen.
//
//  4. DIE ÜBERMESSUNG GEGENÜBER EINEM VERBRAUCHER ANWENDEN.
//     Das ist der schwerste Fall, und er steht in keiner DIN. Die
//     Abrechnungsregeln der VOB/C gelten nur, wenn die VOB/C wirksam
//     vereinbart ist. Gegenüber einem Verbraucher ist sie das nach der
//     Rechtsprechung regelmäßig NICHT — eine Klausel, die dem Betrieb
//     Flächen vergütet, an denen er nicht gearbeitet hat, benachteiligt den
//     Verbraucher unangemessen (AGB-Recht, § 310 BGB).
//     Belegt: OLG Stuttgart, Urteil vom 21.02.2008, 2 U 84/07.
//     Deshalb ist `vertragsart` ein Pflichtargument ohne Standardwert:
//     wer diese Datei benutzt, MUSS sich entscheiden. Ein Standardwert 'vob'
//     wäre der bequemste Weg in genau diesen Fehler.
//     → Vom Anwalt zu bestätigen (Block X der Anwalt-Checkliste).
//
// ▄▄▄ EHRLICH ZU DEN ZAHLEN ▄▄▄
// Die ATV-Normen sind kostenpflichtig; ihr Wortlaut ist nicht frei abrufbar.
// Die Werte hier stammen aus mehreren öffentlichen Fachquellen, die sich
// TEILWEISE WIDERSPRECHEN. Jeder Eintrag trägt deshalb ein Feld `beleg`:
//
//   'belegt'  — mehrere unabhängige Quellen stimmen überein
//   'pruefen' — die Quellen widersprechen sich oder es gibt nur eine
//
// Ein 'pruefen'-Wert wird BENUTZT, aber die Auskunft sagt es dazu. Niemand
// soll aus dieser Datei eine Gewissheit ablesen, die sie nicht hat.
// Vor dem ersten echten Einsatz gehören die Werte am Normtext bestätigt.
//
// ▄▄▄ ANDOCKPUNKT (noch nicht verbunden) ▄▄▄
// Diese Datei ruft NIEMAND auf. Muster wie P55 bis P58.
// ============================================================================

import { runde3 } from './aufmassFormel';

// ----------------------------------------------------------------------------
// 1. VERTRAGSART — die Frage vor allen Zahlen
// ----------------------------------------------------------------------------

/**
 * 'vob' — Die VOB/B und VOB/C sind wirksam vereinbart. Übermessen gilt.
 *         Im Geschäftsverkehr zwischen Unternehmen der Regelfall.
 *
 * 'bgb' — Reiner Werkvertrag nach BGB, insbesondere jeder Verbrauchervertrag.
 *         KEINE Übermessung: abgerechnet wird die Fläche, an der gearbeitet
 *         wurde. Jede Öffnung wird abgezogen, unabhängig von ihrer Größe.
 */
export type Vertragsart = 'vob' | 'bgb';

/** Die Fundstelle zur BGB-Regel — steht in jeder Begründung, die sie nutzt. */
export const BGB_FUNDSTELLE = 'OLG Stuttgart, Urteil vom 21.02.2008, 2 U 84/07';

export const BGB_HINWEIS =
  'Ohne wirksam vereinbarte VOB/C wird die tatsächlich bearbeitete Fläche ' +
  'abgerechnet. Gegenüber Verbrauchern ist die Übermessung nach der ' +
  `Rechtsprechung regelmäßig unwirksam (${BGB_FUNDSTELLE}). ` +
  'Diese Auskunft ersetzt keine Rechtsberatung.';

// ----------------------------------------------------------------------------
// 2. GEWERKE UND IHRE GRENZEN
// ----------------------------------------------------------------------------

export type Belegstufe = 'belegt' | 'pruefen';

export type GewerkSchluessel =
  | 'mauer'
  | 'beton'
  | 'trockenbau'
  | 'wdvs'
  | 'putz'
  | 'fliesen'
  | 'estrich'
  | 'tischler'
  | 'maler'
  | 'bodenbelag'
  | 'tapezier';

export interface GewerkRegel {
  schluessel: GewerkSchluessel;
  /** Nummer der ATV, z. B. "DIN 18363". */
  atv: string;
  name: string;
  /**
   * Größte Einzel-ÖFFNUNG in m², die noch übermessen wird (Fenster, Türen,
   * Durchbrüche). Größer -> ganz abziehen. null = im Gewerk nicht geregelt.
   */
  oeffnungBisQm: number | null;
  /**
   * Größte Einzel-AUSSPARUNG in m², die noch übermessen wird (Steckdose,
   * Rohrdurchführung, Bodeneinlauf, eingebautes Teil).
   * Fehlt der Wert, gilt `oeffnungBisQm` auch hier.
   */
  aussparungBisQm: number | null;
  /** Öffnungen in Böden und Decken, abweichende Grenze in m². */
  bodenOeffnungBisQm: number | null;
  /**
   * Wird eine Öffnung abgezogen, werden ihre Laibungsflächen gesondert
   * gerechnet. Für Putz ausdrücklich belegt; für die übrigen Flächengewerke
   * die verbreitete Praxis.
   */
  laibungBeiAbzug: boolean;
  beleg: Belegstufe;
  /** Woher der Wert stammt, im Klartext. Steht in der Auskunft. */
  quelle: string;
}

/**
 * Allgemeine Grenzen, die nicht am Gewerk hängen.
 *
 * Längenmaß: eine Unterbrechung bis 1,00 m Einzellänge wird übermessen
 *            (Sockelleiste, die an einer Türzarge unterbrochen ist).
 * Flächenmaß: ein stabförmiges Bauteil bis 0,30 m Einzelbreite wird
 *            übermessen (Stütze, Unterzug, schmaler Pfeiler).
 */
export const ALLGEMEIN = {
  unterbrechungLaengeBisM: 1.0,
  unterbrechungBreiteBisM: 0.3,
  beleg: 'belegt' as Belegstufe,
  quelle: 'VOB/C, gewerkeübergreifende Abrechnungsregel',
} as const;

/**
 * Die Grenzen je Gewerk.
 *
 * DOCK-POINT: Später lädt der Betrieb eigene Werte aus einer Tabelle
 * `vob_grenzen` (Spalte firma_id) und übergibt sie als `regeln`-Parameter.
 * Bis dahin gilt diese Liste. Das Leistungsverzeichnis eines Auftrags kann
 * ohnehin abweichende Regeln vorgeben — dann gilt der Vertrag, nicht die ATV.
 */
export const GEWERKE: readonly GewerkRegel[] = [
  {
    schluessel: 'maler',
    atv: 'DIN 18363',
    name: 'Maler- und Lackierarbeiten',
    oeffnungBisQm: 2.5,
    aussparungBisQm: null,
    bodenOeffnungBisQm: null,
    laibungBeiAbzug: true,
    beleg: 'belegt',
    quelle: 'ATV DIN 18363 Abschnitt 5; mehrere Fachquellen übereinstimmend 2,50 m²',
  },
  {
    schluessel: 'putz',
    atv: 'DIN 18350',
    name: 'Putz- und Stuckarbeiten',
    oeffnungBisQm: 2.5,
    aussparungBisQm: null,
    bodenOeffnungBisQm: null,
    laibungBeiAbzug: true,
    beleg: 'belegt',
    quelle: 'ATV DIN 18350 Abschnitt 5; Laibungszuschlag bei Abzug ausdrücklich belegt',
  },
  {
    schluessel: 'trockenbau',
    atv: 'DIN 18340',
    name: 'Trockenbauarbeiten',
    oeffnungBisQm: 2.5,
    aussparungBisQm: null,
    bodenOeffnungBisQm: 0.5,
    laibungBeiAbzug: true,
    beleg: 'belegt',
    quelle: 'ATV DIN 18340 Abschnitt 5; Böden/Decken 0,50 m²',
  },
  {
    schluessel: 'mauer',
    atv: 'DIN 18330',
    name: 'Mauerarbeiten',
    oeffnungBisQm: 2.5,
    aussparungBisQm: null,
    bodenOeffnungBisQm: 0.5,
    laibungBeiAbzug: true,
    beleg: 'belegt',
    quelle: 'ATV DIN 18330 Abschnitt 5; Böden/Decken 0,50 m²',
  },
  {
    schluessel: 'tapezier',
    atv: 'DIN 18366',
    name: 'Tapezierarbeiten',
    oeffnungBisQm: 2.5,
    aussparungBisQm: null,
    bodenOeffnungBisQm: null,
    laibungBeiAbzug: true,
    beleg: 'belegt',
    quelle: 'ATV DIN 18366 Abschnitt 5',
  },
  {
    schluessel: 'tischler',
    atv: 'DIN 18355',
    name: 'Tischlerarbeiten',
    oeffnungBisQm: 2.5,
    aussparungBisQm: null,
    bodenOeffnungBisQm: null,
    laibungBeiAbzug: false,
    beleg: 'pruefen',
    quelle: 'ATV DIN 18355 Abschnitt 5; nur eine Quelle gefunden',
  },
  {
    schluessel: 'wdvs',
    atv: 'DIN 18345',
    name: 'Wärmedämm-Verbundsysteme',
    oeffnungBisQm: 2.5,
    aussparungBisQm: null,
    bodenOeffnungBisQm: null,
    laibungBeiAbzug: true,
    beleg: 'pruefen',
    quelle: 'ATV DIN 18345 Abschnitt 5; nur eine Quelle gefunden',
  },
  {
    schluessel: 'fliesen',
    atv: 'DIN 18352',
    name: 'Fliesen- und Plattenarbeiten',
    oeffnungBisQm: 2.5,
    aussparungBisQm: 0.1,
    bodenOeffnungBisQm: 0.1,
    laibungBeiAbzug: true,
    beleg: 'pruefen',
    quelle:
      'ATV DIN 18352 Abschnitt 5. Quellen uneinheitlich: Wandöffnungen 2,50 m², ' +
      'Aussparungen für eingebaute Teile 0,10 m². Eine Quelle nennt 0,50 m². Am Normtext bestätigen.',
  },
  {
    schluessel: 'estrich',
    atv: 'DIN 18353',
    name: 'Estricharbeiten',
    oeffnungBisQm: null,
    aussparungBisQm: 0.1,
    bodenOeffnungBisQm: 0.1,
    laibungBeiAbzug: false,
    beleg: 'pruefen',
    quelle:
      'ATV DIN 18353 Abschnitt 5. Quellen uneinheitlich: 0,10 m² gegen 1,00 m². ' +
      'Am Normtext bestätigen, bevor damit abgerechnet wird.',
  },
  {
    schluessel: 'bodenbelag',
    atv: 'DIN 18365',
    name: 'Bodenbelagarbeiten',
    oeffnungBisQm: null,
    aussparungBisQm: 0.1,
    bodenOeffnungBisQm: 0.1,
    laibungBeiAbzug: false,
    beleg: 'pruefen',
    quelle:
      'ATV DIN 18365 Abschnitt 5. ACHTUNG: eine verbreitete Übersicht führt den Wert ' +
      'unter DIN 18356 — das ist aber Parkett- und Holzpflasterarbeiten. Bodenbelagarbeiten ' +
      'sind DIN 18365. Zuordnung und Wert am Normtext bestätigen.',
  },
  {
    schluessel: 'beton',
    atv: 'DIN 18331',
    name: 'Betonarbeiten',
    oeffnungBisQm: null,
    aussparungBisQm: null,
    bodenOeffnungBisQm: null,
    laibungBeiAbzug: false,
    beleg: 'belegt',
    quelle:
      'ATV DIN 18331 Abschnitt 5 rechnet nach Raummaß: Aussparungen bis 0,50 m³, ' +
      'Schlitze und Kanäle bis 0,10 m³ je m Länge. Flächenmaß ist hier nicht geregelt.',
  },
];

/** Raummaß-Grenzen der Betonarbeiten — eigener Satz, weil m³ statt m². */
export const BETON_RAUMMASS = {
  aussparungBisM3: 0.5,
  schlitzBisM3JeMeter: 0.1,
  beleg: 'belegt' as Belegstufe,
  quelle: 'ATV DIN 18331 Abschnitt 5',
} as const;

export function gewerkRegel(
  schluessel: GewerkSchluessel,
  regeln: readonly GewerkRegel[] = GEWERKE,
): GewerkRegel | undefined {
  return regeln.find((g) => g.schluessel === schluessel);
}

export function gewerkName(schluessel: GewerkSchluessel): string {
  const g = gewerkRegel(schluessel);
  return g ? `${g.name} (${g.atv})` : String(schluessel);
}

/** Alle Gewerke, deren Grenzen noch am Normtext zu bestätigen sind. */
export function ungepruefteGewerke(regeln: readonly GewerkRegel[] = GEWERKE): GewerkRegel[] {
  return regeln.filter((g) => g.beleg === 'pruefen');
}

// ----------------------------------------------------------------------------
// 3. DIE ÖFFNUNG
// ----------------------------------------------------------------------------

/**
 * 'oeffnung'      Fenster, Tür, Durchbruch — geht durch das Bauteil hindurch.
 * 'aussparung'    ausgesparte Teilfläche für ein eingebautes Teil
 *                 (Steckdose, Revisionsklappe, Bodeneinlauf).
 * 'nische'        wird unabhängig von der Größe gesondert gerechnet,
 *                 also nie übermessen.
 * 'unterbrechung' stabförmiges Bauteil oder Lücke in einer Fläche bzw. Linie
 *                 (Stütze, Unterzug, Türzarge in einer Sockelleiste).
 */
export type OeffnungsArt = 'oeffnung' | 'aussparung' | 'nische' | 'unterbrechung';

export interface Oeffnung {
  bezeichnung?: string | null;
  art: OeffnungsArt;
  /** Breite in m. Bei 'unterbrechung' im Längenmaß: die Einzellänge. */
  breite?: number | null;
  /** Höhe in m. */
  hoehe?: number | null;
  /**
   * Fläche in m², falls sie direkt bekannt ist. Schlägt breite × höhe.
   * Nach VOB/C sind bei ungleichen Maßen (Laibungsschräge) die KLEINSTEN
   * Maße der Öffnung maßgebend — wer beide Seiten gemessen hat, trägt die
   * kleineren ein.
   */
  flaeche?: number | null;
  /** Wie oft diese Öffnung vorkommt. Fehlt sie, gilt 1. */
  anzahl?: number | null;
  /** Tiefe der Laibung in m — nur nötig, wenn abgezogen wird. */
  laibungstiefe?: number | null;
  /**
   * Wie viele Seiten der Öffnung eine Laibung haben. 4 bei einem Fenster,
   * 3 bei einer Tür (unten ist der Boden). Fehlt der Wert, gilt 4.
   */
  laibungSeiten?: number | null;
  /** Sitzt die Öffnung in einem Boden oder einer Decke? Dann gilt die Bodengrenze. */
  imBoden?: boolean | null;
}

export interface OeffnungsUrteil {
  bezeichnung: string;
  art: OeffnungsArt;
  /** Fläche EINER Öffnung in m². */
  einzelflaeche: number;
  anzahl: number;
  /** einzelflaeche × anzahl. */
  gesamtflaeche: number;
  /** true = wird von der Fläche abgezogen. false = wird übermessen. */
  abziehen: boolean;
  /** Die angewandte Grenze in m² bzw. m. null, wenn keine greift. */
  grenze: number | null;
  /** Einheit der Grenze, für den Klartext. */
  grenzeEinheit: 'm²' | 'm' | null;
  /** Warum so entschieden wurde — gehört auf das Aufmaßblatt. */
  grund: string;
  /** Die Laibungsflächen werden gesondert gerechnet. */
  laibungGesondert: boolean;
  /** Fläche der Laibungen in m², 0 wenn nicht gesondert oder keine Tiefe bekannt. */
  laibungsflaeche: number;
  /** Der Wert ist am Normtext noch zu bestätigen. */
  pruefen: boolean;
}

function zahlOder(n: number | null | undefined, ersatz: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : ersatz;
}

/** Fläche einer einzelnen Öffnung. Direkte Angabe schlägt Breite × Höhe. */
export function oeffnungsflaeche(o: Oeffnung): number {
  const direkt = o.flaeche;
  if (typeof direkt === 'number' && Number.isFinite(direkt) && direkt >= 0) {
    return runde3(direkt);
  }
  const b = zahlOder(o.breite, 0);
  const h = zahlOder(o.hoehe, 0);
  if (b <= 0 || h <= 0) return 0;
  return runde3(b * h);
}

/** Umlaufende Laibungsfläche einer Öffnung in m². */
export function laibungsflaeche(o: Oeffnung): number {
  const tiefe = zahlOder(o.laibungstiefe, 0);
  if (tiefe <= 0) return 0;
  const b = zahlOder(o.breite, 0);
  const h = zahlOder(o.hoehe, 0);
  if (b <= 0 || h <= 0) return 0;
  const seiten = zahlOder(o.laibungSeiten, 4);
  // 4 Seiten: 2 × (b + h). 3 Seiten (Tür): b + 2 × h.
  const umfang = seiten >= 4 ? 2 * (b + h) : b + 2 * h;
  return runde3(umfang * tiefe);
}

/**
 * Entscheidet für EINE Öffnung, ob sie übermessen oder abgezogen wird.
 *
 * Die Grenze ist eine FREIGRENZE: genau auf der Grenze wird noch übermessen,
 * einen Quadratzentimeter darüber wird die GANZE Fläche abgezogen.
 */
export function beurteileOeffnung(
  o: Oeffnung,
  gewerk: GewerkSchluessel,
  vertragsart: Vertragsart,
  regeln: readonly GewerkRegel[] = GEWERKE,
): OeffnungsUrteil {
  const bezeichnung = o.bezeichnung?.trim() || artName(o.art);
  const einzelflaeche = oeffnungsflaeche(o);
  const anzahl = Math.max(0, Math.floor(zahlOder(o.anzahl, 1)));
  const gesamtflaeche = runde3(einzelflaeche * anzahl);
  const regel = gewerkRegel(gewerk, regeln);

  const leer = (
    abziehen: boolean,
    grund: string,
    grenze: number | null,
    einheit: 'm²' | 'm' | null,
    laibungGesondert: boolean,
    pruefen: boolean,
  ): OeffnungsUrteil => ({
    bezeichnung,
    art: o.art,
    einzelflaeche,
    anzahl,
    gesamtflaeche,
    abziehen,
    grenze,
    grenzeEinheit: einheit,
    grund,
    laibungGesondert,
    laibungsflaeche: laibungGesondert ? runde3(laibungsflaeche(o) * anzahl) : 0,
    pruefen,
  });

  // FEHLER 4: Ohne VOB/C gibt es keine Übermessung.
  if (vertragsart === 'bgb') {
    return leer(
      true,
      `Abgezogen: ohne vereinbarte VOB/C wird die bearbeitete Fläche abgerechnet. ${BGB_HINWEIS}`,
      null,
      null,
      true,
      false,
    );
  }

  if (!regel) {
    return leer(
      true,
      `Abgezogen: für "${gewerk}" ist keine Übermessungsregel hinterlegt. ` +
        'Ohne belegte Grenze wird nicht übermessen.',
      null,
      null,
      true,
      true,
    );
  }

  // Nischen: immer gesondert, nie übermessen.
  if (o.art === 'nische') {
    return leer(
      true,
      `Abgezogen: Nischen werden nach ${regel.atv} unabhängig von ihrer Größe gesondert gerechnet.`,
      null,
      null,
      true,
      regel.beleg === 'pruefen',
    );
  }

  // Unterbrechungen: Grenze über die Breite bzw. Länge, nicht über die Fläche.
  if (o.art === 'unterbrechung') {
    const mass = runde3(Math.max(zahlOder(o.breite, 0), 0));
    const grenze = ALLGEMEIN.unterbrechungBreiteBisM;
    const abziehen = mass > grenze;
    return leer(
      abziehen,
      abziehen
        ? `Abgezogen: Einzelbreite ${zahl(mass)} m über der Grenze von ${zahl(grenze)} m.`
        : `Übermessen: Einzelbreite ${zahl(mass)} m bis einschließlich ${zahl(grenze)} m.`,
      grenze,
      'm',
      abziehen && regel.laibungBeiAbzug,
      false,
    );
  }

  const grenze = grenzeFuer(o, regel);

  if (grenze === null) {
    return leer(
      true,
      `Abgezogen: ${regel.atv} regelt für diese Art keine Übermessung. ` +
        `${regel.quelle}`,
      null,
      null,
      regel.laibungBeiAbzug,
      true,
    );
  }

  // FEHLER 2 + 3: Freigrenze, je EINZELöffnung.
  const abziehen = einzelflaeche > grenze;
  const wo = o.imBoden === true ? ' im Boden bzw. in der Decke' : '';
  const grund = abziehen
    ? `Abgezogen: Einzelgröße ${zahl(einzelflaeche)} m²${wo} über der Grenze von ` +
      `${zahl(grenze)} m² nach ${regel.atv}. Über der Grenze wird die ganze Fläche abgezogen, ` +
      'nicht nur der Teil darüber.'
    : `Übermessen: Einzelgröße ${zahl(einzelflaeche)} m²${wo} bis einschließlich ` +
      `${zahl(grenze)} m² nach ${regel.atv}. Die Grenze gilt je Öffnung, nicht für die Summe.`;

  return leer(
    abziehen,
    grund + (regel.beleg === 'pruefen' ? ` HINWEIS: ${regel.quelle}` : ''),
    grenze,
    'm²',
    abziehen && regel.laibungBeiAbzug,
    regel.beleg === 'pruefen',
  );
}

/** Welche der drei Flächengrenzen für diese Öffnung gilt. */
function grenzeFuer(o: Oeffnung, regel: GewerkRegel): number | null {
  if (o.imBoden === true && regel.bodenOeffnungBisQm !== null) {
    return regel.bodenOeffnungBisQm;
  }
  if (o.art === 'aussparung') {
    return regel.aussparungBisQm !== null ? regel.aussparungBisQm : regel.oeffnungBisQm;
  }
  return regel.oeffnungBisQm;
}

function artName(art: OeffnungsArt): string {
  switch (art) {
    case 'oeffnung': return 'Öffnung';
    case 'aussparung': return 'Aussparung';
    case 'nische': return 'Nische';
    case 'unterbrechung': return 'Unterbrechung';
  }
}

/** Zahl im deutschen Format, ohne überflüssige Nullen. */
function zahl(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

// ----------------------------------------------------------------------------
// 4. DAS AUFMASS EINER FLÄCHE
// ----------------------------------------------------------------------------

export interface FlaechenAufmass {
  /** Die gemessene Fläche vor jedem Abzug, in m². */
  roh: number;
  /** Summe der abgezogenen Öffnungen, in m². */
  abzug: number;
  /** Summe der übermessenen Öffnungen, in m² — das, was der Betrieb behält. */
  uebermessen: number;
  /** Gesondert gerechnete Laibungsflächen, in m². */
  laibungen: number;
  /** roh − abzug. Die Laibungen sind NICHT eingerechnet, sie sind eine eigene Position. */
  ergebnis: number;
  urteile: OeffnungsUrteil[];
  /** Mindestens ein angewandter Wert ist noch am Normtext zu bestätigen. */
  pruefen: boolean;
  /** Ein Satz fürs Aufmaßblatt. */
  klartext: string;
}

/**
 * Rechnet eine Fläche mit ihren Öffnungen ab.
 *
 * Die Laibungen werden NICHT in `ergebnis` eingerechnet. Sie sind nach VOB/C
 * eine gesonderte Position mit eigenem Preis — wer sie stillschweigend auf die
 * Wandfläche addiert, rechnet sie zum Wandpreis ab, und das ist regelmäßig
 * zu wenig.
 */
export function flaechenAufmass(
  rohflaeche: number,
  oeffnungen: readonly Oeffnung[],
  gewerk: GewerkSchluessel,
  vertragsart: Vertragsart,
  regeln: readonly GewerkRegel[] = GEWERKE,
): FlaechenAufmass {
  const roh = runde3(Math.max(0, zahlOder(rohflaeche, 0)));
  const urteile = oeffnungen.map((o) => beurteileOeffnung(o, gewerk, vertragsart, regeln));

  let abzug = 0;
  let uebermessen = 0;
  let laibungen = 0;
  for (const u of urteile) {
    if (u.abziehen) abzug += u.gesamtflaeche;
    else uebermessen += u.gesamtflaeche;
    laibungen += u.laibungsflaeche;
  }

  abzug = runde3(abzug);
  uebermessen = runde3(uebermessen);
  laibungen = runde3(laibungen);
  const ergebnis = runde3(Math.max(0, roh - abzug));
  const pruefen = urteile.some((u) => u.pruefen);

  const regel = gewerkRegel(gewerk, regeln);
  const kopf = regel ? `${regel.name} (${regel.atv})` : String(gewerk);
  const art = vertragsart === 'vob' ? 'nach VOB/C' : 'ohne VOB/C (BGB)';

  const teile = [
    `${kopf}, ${art}: ${zahl(roh)} m² gemessen`,
    abzug > 0 ? `− ${zahl(abzug)} m² abgezogen` : null,
    uebermessen > 0 ? `${zahl(uebermessen)} m² übermessen` : null,
    `= ${zahl(ergebnis)} m²`,
    laibungen > 0 ? `zuzüglich ${zahl(laibungen)} m² Laibungen als eigene Position` : null,
  ].filter(Boolean) as string[];

  return {
    roh,
    abzug,
    uebermessen,
    laibungen,
    ergebnis,
    urteile,
    pruefen,
    klartext:
      teile.join(' · ') +
      (pruefen ? ' — ACHTUNG: mindestens eine Grenze ist noch am Normtext zu bestätigen.' : ''),
  };
}

// ----------------------------------------------------------------------------
// 5. LÄNGENMASS
// ----------------------------------------------------------------------------

export interface LaengenAufmass {
  roh: number;
  abzug: number;
  uebermessen: number;
  ergebnis: number;
  urteile: { bezeichnung: string; laenge: number; anzahl: number; abziehen: boolean; grund: string }[];
  klartext: string;
}

/**
 * Sockelleisten, Fugen, Kantenschutz: Unterbrechungen bis 1,00 m Einzellänge
 * werden übermessen. Eine Türzarge von 0,90 m bleibt also drin, eine
 * Terrassentür von 2,40 m wird abgezogen.
 */
export function laengenAufmass(
  rohlaenge: number,
  unterbrechungen: readonly { bezeichnung?: string | null; laenge: number; anzahl?: number | null }[],
  vertragsart: Vertragsart,
): LaengenAufmass {
  const roh = runde3(Math.max(0, zahlOder(rohlaenge, 0)));
  const grenze = ALLGEMEIN.unterbrechungLaengeBisM;

  let abzug = 0;
  let uebermessen = 0;
  const urteile: LaengenAufmass['urteile'] = [];

  for (const u of unterbrechungen) {
    const laenge = runde3(Math.max(0, zahlOder(u.laenge, 0)));
    const anzahl = Math.max(0, Math.floor(zahlOder(u.anzahl, 1)));
    const gesamt = runde3(laenge * anzahl);
    const abziehen = vertragsart === 'bgb' ? true : laenge > grenze;
    if (abziehen) abzug += gesamt;
    else uebermessen += gesamt;
    urteile.push({
      bezeichnung: u.bezeichnung?.trim() || 'Unterbrechung',
      laenge,
      anzahl,
      abziehen,
      grund:
        vertragsart === 'bgb'
          ? `Abgezogen: ohne vereinbarte VOB/C wird die bearbeitete Länge abgerechnet. ${BGB_HINWEIS}`
          : abziehen
            ? `Abgezogen: Einzellänge ${zahl(laenge)} m über der Grenze von ${zahl(grenze)} m.`
            : `Übermessen: Einzellänge ${zahl(laenge)} m bis einschließlich ${zahl(grenze)} m.`,
    });
  }

  abzug = runde3(abzug);
  uebermessen = runde3(uebermessen);
  const ergebnis = runde3(Math.max(0, roh - abzug));

  return {
    roh,
    abzug,
    uebermessen,
    ergebnis,
    urteile,
    klartext:
      `${zahl(roh)} m gemessen` +
      (abzug > 0 ? ` · − ${zahl(abzug)} m abgezogen` : '') +
      (uebermessen > 0 ? ` · ${zahl(uebermessen)} m übermessen` : '') +
      ` · = ${zahl(ergebnis)} m`,
  };
}

// ----------------------------------------------------------------------------
// 6. RAUMBUCH
// ----------------------------------------------------------------------------

export interface Raum {
  name: string;
  /** Länge in m. Zusammen mit breite ergibt sich Boden, Decke und Umfang. */
  laenge?: number | null;
  breite?: number | null;
  /** Raumhöhe in m. */
  hoehe?: number | null;
  /**
   * Umfang in m, falls der Raum nicht rechteckig ist. Wird er angegeben,
   * schlägt er 2 × (länge + breite).
   */
  umfang?: number | null;
  /**
   * Bodenfläche in m², falls der Raum nicht rechteckig ist. Schlägt
   * länge × breite. Für einen Raum mit Erker oder Schräge das ehrlichere Maß.
   */
  bodenflaeche?: number | null;
  oeffnungen?: Oeffnung[];
  /** Summe der Türbreiten in m — die Sockelleiste läuft dort nicht durch. */
  tuerbreitenSumme?: number | null;
}

export interface RaumMasse {
  name: string;
  /** Bodenfläche in m². */
  boden: number;
  /** Deckenfläche in m² — gleich der Bodenfläche, solange keine Schräge da ist. */
  decke: number;
  /** Umfang in m. */
  umfang: number;
  /** Wandfläche brutto in m², also Umfang × Höhe, vor jedem Abzug. */
  wandBrutto: number;
  /** Länge der Sockelleiste in m: Umfang abzüglich der Türbreiten. */
  sockelLaenge: number;
  /** Was fehlt, um die Maße vollständig zu rechnen. */
  fehlt: string[];
}

/**
 * Rechnet aus den Rohmaßen eines Raums die vier Größen, die im Aufmaß
 * gebraucht werden. Keine Öffnungen, kein Gewerk — das kommt in raumAufmass.
 *
 * Fehlende Maße werden GEMELDET, nicht geschätzt. Eine Wandfläche ohne
 * Raumhöhe ist keine Wandfläche von 0 m², sondern eine offene Angabe.
 */
export function raumMasse(raum: Raum): RaumMasse {
  const fehlt: string[] = [];
  const l = zahlOder(raum.laenge, 0);
  const b = zahlOder(raum.breite, 0);
  const h = zahlOder(raum.hoehe, 0);

  let boden = zahlOder(raum.bodenflaeche, 0);
  if (boden <= 0) {
    if (l > 0 && b > 0) boden = l * b;
    else fehlt.push('Bodenfläche (Länge und Breite, oder die Fläche direkt)');
  }

  let umfang = zahlOder(raum.umfang, 0);
  if (umfang <= 0) {
    if (l > 0 && b > 0) umfang = 2 * (l + b);
    else fehlt.push('Umfang (Länge und Breite, oder den Umfang direkt)');
  }

  if (h <= 0) fehlt.push('Raumhöhe');

  const wandBrutto = umfang > 0 && h > 0 ? umfang * h : 0;
  const tueren = Math.max(0, zahlOder(raum.tuerbreitenSumme, 0));
  const sockel = umfang > 0 ? Math.max(0, umfang - tueren) : 0;

  return {
    name: raum.name,
    boden: runde3(boden),
    decke: runde3(boden),
    umfang: runde3(umfang),
    wandBrutto: runde3(wandBrutto),
    sockelLaenge: runde3(sockel),
    fehlt,
  };
}

export type Flaechenteil = 'wand' | 'decke' | 'boden';

export interface RaumAufmass {
  raum: string;
  teil: Flaechenteil;
  masse: RaumMasse;
  aufmass: FlaechenAufmass;
}

/**
 * Das Aufmaß eines Raumteils: Rohfläche aus den Raummaßen, Öffnungen nach
 * den Regeln des Gewerks beurteilt.
 *
 * Für Böden und Decken wird `imBoden` auf jeder Öffnung gesetzt, die es nicht
 * selbst mitbringt — sonst griffe dort die Wandgrenze, und bei Trockenbau
 * und Mauerarbeiten ist das der Unterschied zwischen 0,50 und 2,50 m².
 */
export function raumAufmass(
  raum: Raum,
  teil: Flaechenteil,
  gewerk: GewerkSchluessel,
  vertragsart: Vertragsart,
  regeln: readonly GewerkRegel[] = GEWERKE,
): RaumAufmass {
  const masse = raumMasse(raum);
  const roh = teil === 'wand' ? masse.wandBrutto : teil === 'decke' ? masse.decke : masse.boden;

  const alle = raum.oeffnungen ?? [];
  const passend = alle.map((o) =>
    teil === 'wand' || o.imBoden != null ? o : { ...o, imBoden: true },
  );

  return {
    raum: raum.name,
    teil,
    masse,
    aufmass: flaechenAufmass(roh, passend, gewerk, vertragsart, regeln),
  };
}

export interface RaumbuchSumme {
  gewerk: GewerkSchluessel;
  teil: Flaechenteil;
  vertragsart: Vertragsart;
  raeume: RaumAufmass[];
  roh: number;
  abzug: number;
  uebermessen: number;
  laibungen: number;
  ergebnis: number;
  pruefen: boolean;
  /** Räume, bei denen Maße fehlen — die Summe ist dann zu niedrig. */
  unvollstaendig: string[];
  klartext: string;
}

/** Mehrere Räume auf einmal — das eigentliche Raumbuch. */
export function raumbuch(
  raeume: readonly Raum[],
  teil: Flaechenteil,
  gewerk: GewerkSchluessel,
  vertragsart: Vertragsart,
  regeln: readonly GewerkRegel[] = GEWERKE,
): RaumbuchSumme {
  const einzeln = raeume.map((r) => raumAufmass(r, teil, gewerk, vertragsart, regeln));

  let roh = 0, abzug = 0, uebermessen = 0, laibungen = 0, ergebnis = 0;
  const unvollstaendig: string[] = [];

  for (const r of einzeln) {
    roh += r.aufmass.roh;
    abzug += r.aufmass.abzug;
    uebermessen += r.aufmass.uebermessen;
    laibungen += r.aufmass.laibungen;
    ergebnis += r.aufmass.ergebnis;
    if (r.masse.fehlt.length > 0) unvollstaendig.push(r.raum);
  }

  const pruefen = einzeln.some((r) => r.aufmass.pruefen);
  const teilName = teil === 'wand' ? 'Wandflächen' : teil === 'decke' ? 'Deckenflächen' : 'Bodenflächen';

  return {
    gewerk,
    teil,
    vertragsart,
    raeume: einzeln,
    roh: runde3(roh),
    abzug: runde3(abzug),
    uebermessen: runde3(uebermessen),
    laibungen: runde3(laibungen),
    ergebnis: runde3(ergebnis),
    pruefen,
    unvollstaendig,
    klartext:
      `${teilName}, ${einzeln.length} ${einzeln.length === 1 ? 'Raum' : 'Räume'}: ` +
      `${zahl(runde3(ergebnis))} m² abzurechnen` +
      (runde3(uebermessen) > 0 ? ` (davon ${zahl(runde3(uebermessen))} m² übermessen)` : '') +
      (runde3(laibungen) > 0 ? ` · ${zahl(runde3(laibungen))} m² Laibungen gesondert` : '') +
      (unvollstaendig.length > 0
        ? ` · UNVOLLSTÄNDIG: bei ${unvollstaendig.join(', ')} fehlen Maße`
        : '') +
      (pruefen ? ' · mindestens eine Grenze ist noch am Normtext zu bestätigen' : ''),
  };
}
