// ============================================================================
// ARGONAUT OS · lib/nachkalkulation.ts — Projekt-Nachkalkulation (Plan ↔ Ist)
//
// Reine Logik (KEINE Supabase-/React-Abhängigkeit, node-testbar). Vergleicht je
// Projekt den PLAN (projekte.budget) mit der IST-Leistung (Summe der
// projektleistungen = Stunden × Stundensatz) und zeigt, was davon schon
// abgerechnet bzw. noch offen ist. So sieht der Betrieb, ob ein Projekt im
// Budget liegt und wie viel noch zu fakturieren ist.
//
// HINWEIS: „Ist" = erbrachte (abrechenbare) Leistung. Material-/Fremdkosten für
// einen vollen Deckungsbeitrag lassen sich später ergänzen (Beleg↔Projekt).
//
// ▄▄▄ REPARATUR PUNKT 23 (18.09.2026) ▄▄▄
//
// 1. DIE PRÜFUNG FAND GAR NICHT STATT, WENN DAS BUDGET ALS TEXT KAM.
//    Der Typ erlaubt ausdrücklich `budget?: number | string | null`, gelesen
//    wurde aber mit Number(). GEMESSEN: Budget „12.500,00" ergab
//    budget = 0 → Status „kein_budget", Auslastung 0 — obwohl 6.000 € Leistung
//    erbracht waren. Ein Projekt mit vereinbartem Festpreis meldete also
//    „kein Budget hinterlegt" und hat NIE gewarnt. Jetzt liest lib/zahlen.ts.
//    Dasselbe gilt für Stunden, Stundensatz und die Kostenbeträge.
//
// 2. ASYMMETRISCHE RUNDUNG. r2 rundete −2,345 auf −2,34 statt −2,35 (vom
//    Nullpunkt weg nur in eine Richtung). Betrifft negative Differenzen und
//    negative Deckungsbeiträge — also genau die Projekte, um die es geht.
//    Jetzt centRunden aus lib/zahlen.ts, symmetrisch um Null.
//
// 3. DER DECKUNGSBEITRAG WURDE BERECHNET, ABER NICHT GEZEIGT. Die Ampel
//    (kalkStatus) rechnet nur erbracht/budget; Material- und Fremdkosten
//    fließen nicht ein. GEMESSEN: Budget 10.000 €, erbracht 9.000 €,
//    Kosten 8.000 € ergaben „knapp" — obwohl Leistung und Material zusammen
//    17.000 € gegen 10.000 € stehen.
//    DIE AMPEL BLEIBT, WIE SIE IST — sie ist im Betrieb eingeführt, und was
//    `budget` im Einzelfall bedeutet (vereinbarter Festpreis oder internes
//    Kostenbudget), kann der Code nicht wissen. Stattdessen NEU
//    fixpreisHinweise(): nennt im Klartext, was gegen das Budget läuft, ohne
//    eine Bedeutung zu unterstellen. Gleiches Muster wie die Kennziffer in
//    Punkt 17 und das SKR-Feld in Punkt 15.
//
// Die Datei hatte bis heute KEINEN Test.
//
// ▄▄▄ PUNKT 62 (21.09.2026) — DIE NACHKALKULATION EHRLICH MACHEN ▄▄▄
//
// DER BEFUND, an dieser Datei selbst belegt: Zeile 132 rechnet
//   deckungsbeitrag = erbracht − kostenSumme
// `erbracht` ist Stunden mal VERKAUFSPREIS (Z. 110: stunden × stundensatz),
// `kostenSumme` ist nur Material und Fremdleistung. DIE LOHNKOSTEN FEHLEN
// VOLLSTÄNDIG. Was hier „Deckungsbeitrag" heißt, ist Umsatz minus Material.
//
// GEMESSEN mit dem Fall aus der Bauliste: 100 Stunden zu 75 EUR verkauft
// = 7.500 EUR, Material 2.000 EUR. Angezeigt werden 5.500 EUR
// Deckungsbeitrag und 73,3 % Marge. Bei 38 EUR Selbstkosten je Stunde sind
// es in Wahrheit 1.700 EUR und 22,7 %. Mit dem aus lib/stundensatz.ts
// hergeleiteten Satz von 44,77 EUR bleiben 1.023 EUR und 13,6 %.
//
// Wer der ersten Zahl glaubt, unterbietet sich beim nächsten Angebot —
// und je mehr Aufträge er so gewinnt, desto schneller geht es schief.
//
// WIE ES REPARIERT IST: REIN ADDITIV.
//   · `deckungsbeitrag` und `marge` bleiben UNVERÄNDERT. Sie stehen heute
//     auf der Seite; sie stillschweigend umzudefinieren hieße, dass jeder
//     Betrieb am Montag andere Zahlen sieht, ohne dass ihm jemand etwas
//     gesagt hat.
//   · NEU daneben: `lohnkosten`, `deckungsbeitragEcht`, `margeEcht` und
//     `lohnkostenAngesetzt`.
//   · Ohne übergebenen Selbstkostensatz ändert sich GAR NICHTS: die neuen
//     Felder melden dann ehrlich, dass kein Satz hinterlegt ist, statt mit
//     einem geratenen zu rechnen.
//   · Die Ampel `kalkStatus` bleibt, wie sie ist — Entscheidung aus Punkt 23.
//
// Der Selbstkostensatz kommt aus lib/stundensatz.ts (Punkt 61) und ist dort
// hergeleitet, nicht eingetippt.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

export interface LeistungRoh {
  projekt_id?: string | null;
  stunden?: number | null;
  stundensatz?: number | null;
  abgerechnet?: boolean | null;
}

export interface ProjektRoh {
  id: string;
  name?: string | null;
  budget?: number | string | null;
}

/** Material-/Fremdkosten je Projekt (Tabelle projekt_kosten). */
export interface KostenRoh {
  projekt_id?: string | null;
  betrag?: number | string | null;
}

export type KalkStatus = 'kein_budget' | 'im_budget' | 'knapp' | 'ueber_budget';

export interface ProjektKalk {
  id: string;
  name: string;
  budget: number;
  erbracht: number;      // Ist-Leistung gesamt (netto)
  abgerechnet: number;
  offen: number;         // erbracht − abgerechnet
  stunden: number;
  kosten: number;        // Summe Material-/Fremdkosten (projekt_kosten)
  deckungsbeitrag: number; // erbracht − kosten (echter DB)
  marge: number;         // deckungsbeitrag / erbracht × 100 (0 wenn keine Leistung)
  differenz: number;     // budget − erbracht (positiv = Luft, negativ = drüber)
  auslastung: number;    // erbracht / budget × 100 (0 wenn kein Budget)
  status: KalkStatus;
  // --- ab Punkt 23, additiv ---
  /** Erbrachte Leistung PLUS Material-/Fremdkosten. */
  leistungPlusKosten: number;
  /** budget − leistungPlusKosten (negativ = der Festpreis deckt es nicht mehr). */
  luft: number;

  // --- ab Punkt 62, additiv. Die Felder darüber bleiben unverändert. ---
  /** Stunden × Selbstkosten je Stunde. 0, wenn kein Satz hinterlegt ist. */
  lohnkosten: number;
  /** erbracht − Material − LOHN. Der Deckungsbeitrag, der stimmt. */
  deckungsbeitragEcht: number;
  /** deckungsbeitragEcht / erbracht × 100. */
  margeEcht: number;
  /**
   * false = es wurde kein Selbstkostensatz übergeben. Dann sind
   * `lohnkosten` 0 und `deckungsbeitragEcht` gleich `deckungsbeitrag` —
   * NICHT weil der Lohn null wäre, sondern weil niemand ihn kennt.
   * Die Anzeige muss das unterscheiden.
   */
  lohnkostenAngesetzt: boolean;
}

/**
 * Woher die Lohn-Selbstkosten kommen (Punkt 62).
 *
 * `selbstkostenJeStunde` ist die Zahl aus lib/stundensatz.ts — Personalkosten
 * im Jahr geteilt durch die PRODUKTIVEN Stunden. Ausdrücklich NICHT der
 * Verkaufs-Stundensatz aus projektleistungen: der steht schon in `erbracht`,
 * und ihn hier noch einmal abzuziehen ergäbe immer genau null.
 */
export interface LohnAnsatz {
  selbstkostenJeStunde?: number | null;
}

/** Zahl aus der Datenbank — auch als deutscher Text („12.500,00"). */
function z(n: unknown): number {
  return leseZahlOder(n, 0);
}
/** Auf Cent runden, symmetrisch um Null. */
function r2(n: number): number { return centRunden(n); }

/** Status-Ampel aus Auslastung (nur wenn ein Budget hinterlegt ist). */
export function kalkStatus(budget: number, erbracht: number): KalkStatus {
  if (budget <= 0) return 'kein_budget';
  const a = erbracht / budget;
  if (a > 1) return 'ueber_budget';
  if (a >= 0.85) return 'knapp';
  return 'im_budget';
}

/**
 * Baut je Projekt die Nachkalkulation; sortiert „über Budget" zuerst, dann nach offenem Betrag.
 *
 * Der vierte Parameter ist ab Punkt 62 dazugekommen und optional — ohne ihn
 * rechnet die Funktion Zeile für Zeile dasselbe wie vorher.
 */
export function baueKalkulation(
  projekte: ProjektRoh[],
  leistungen: LeistungRoh[],
  kosten: KostenRoh[] = [],
  lohn: LohnAnsatz = {},
): ProjektKalk[] {
  const satz = Math.max(0, leseZahlOder(lohn.selbstkostenJeStunde, 0));
  const lohnAngesetzt = satz > 0;
  const agg = new Map<string, { erbracht: number; abgerechnet: number; stunden: number }>();
  for (const l of leistungen) {
    const pid = String(l.projekt_id ?? '');
    if (!pid) continue;
    const stunden = z(l.stunden);
    const betrag = stunden * z(l.stundensatz);
    let a = agg.get(pid);
    if (!a) { a = { erbracht: 0, abgerechnet: 0, stunden: 0 }; agg.set(pid, a); }
    a.erbracht += betrag;
    a.stunden += stunden;
    if (l.abgerechnet) a.abgerechnet += betrag;
  }

  // Material-/Fremdkosten je Projekt summieren.
  const kostenAgg = new Map<string, number>();
  for (const k of kosten) {
    const pid = String(k.projekt_id ?? '');
    if (!pid) continue;
    kostenAgg.set(pid, (kostenAgg.get(pid) || 0) + z(k.betrag));
  }

  const out: ProjektKalk[] = (projekte || []).map((p) => {
    const a = agg.get(String(p.id)) || { erbracht: 0, abgerechnet: 0, stunden: 0 };
    const budget = z(p.budget);
    const erbracht = r2(a.erbracht);
    const abgerechnet = r2(a.abgerechnet);
    const kostenSumme = r2(kostenAgg.get(String(p.id)) || 0);
    const deckungsbeitrag = r2(erbracht - kostenSumme);

    // Punkt 62: der Lohn, der bisher fehlte.
    const stunden = r2(a.stunden);
    const lohnkosten = r2(stunden * satz);
    const deckungsbeitragEcht = r2(deckungsbeitrag - lohnkosten);

    return {
      id: String(p.id),
      name: (p.name && String(p.name).trim()) || 'Projekt',
      budget: r2(budget),
      erbracht,
      abgerechnet,
      offen: r2(erbracht - abgerechnet),
      stunden: r2(a.stunden),
      kosten: kostenSumme,
      deckungsbeitrag,
      marge: erbracht > 0 ? r2((deckungsbeitrag / erbracht) * 100) : 0,
      differenz: r2(budget - erbracht),
      auslastung: budget > 0 ? r2((erbracht / budget) * 100) : 0,
      status: kalkStatus(budget, erbracht),
      leistungPlusKosten: r2(erbracht + kostenSumme),
      luft: r2(budget - erbracht - kostenSumme),
      lohnkosten,
      deckungsbeitragEcht,
      margeEcht: erbracht > 0 ? r2((deckungsbeitragEcht / erbracht) * 100) : 0,
      lohnkostenAngesetzt: lohnAngesetzt,
    };
  });

  const rang: Record<KalkStatus, number> = { ueber_budget: 0, knapp: 1, im_budget: 2, kein_budget: 3 };
  return out.sort((x, y) => (rang[x.status] - rang[y.status]) || (y.offen - x.offen));
}

/** Summen über alle Projekte (für die KPI-Leiste). Ab Punkt 62 mit Lohn-Feldern. */
export function summeKalk(kalk: ProjektKalk[]): {
  budget: number; erbracht: number; abgerechnet: number; offen: number; ueberBudget: number;
  kosten: number; deckungsbeitrag: number; marge: number;
  lohnkosten: number; deckungsbeitragEcht: number; margeEcht: number; lohnkostenAngesetzt: boolean;
} {
  const s = { budget: 0, erbracht: 0, abgerechnet: 0, offen: 0, ueberBudget: 0, kosten: 0, deckungsbeitrag: 0, lohnkosten: 0, deckungsbeitragEcht: 0 };
  for (const k of kalk) {
    s.budget += k.budget;
    s.erbracht += k.erbracht;
    s.abgerechnet += k.abgerechnet;
    s.offen += k.offen;
    s.kosten += k.kosten;
    s.deckungsbeitrag += k.deckungsbeitrag;
    s.lohnkosten += k.lohnkosten;
    s.deckungsbeitragEcht += k.deckungsbeitragEcht;
    if (k.status === 'ueber_budget') s.ueberBudget += 1;
  }
  const erbracht = r2(s.erbracht);
  const dbEcht = r2(s.deckungsbeitragEcht);
  return {
    budget: r2(s.budget), erbracht, abgerechnet: r2(s.abgerechnet), offen: r2(s.offen),
    ueberBudget: s.ueberBudget, kosten: r2(s.kosten), deckungsbeitrag: r2(s.deckungsbeitrag),
    marge: erbracht > 0 ? r2((s.deckungsbeitrag / erbracht) * 100) : 0,
    lohnkosten: r2(s.lohnkosten),
    deckungsbeitragEcht: dbEcht,
    margeEcht: erbracht > 0 ? r2((dbEcht / erbracht) * 100) : 0,
    // Angesetzt heißt: bei ALLEN Projekten, nicht bei einigen. Eine halbe
    // Summe wäre irreführender als gar keine.
    lohnkostenAngesetzt: kalk.length > 0 && kalk.every((k) => k.lohnkostenAngesetzt),
  };
}


// ============================================================================
// Klartext zur Budget-/Fixpreis-Prüfung (Punkt 23). Ändert keine Ampel und
// keine Zahl. NOCH NICHT auf der Seite angezeigt — Andockpunkt, gebündelt mit
// staffelUnstimmigkeiten / extfHinweise / ustvaHinweise / bankHinweise /
// wiederkehrHinweise / datevHinweise / fristenHinweise.
//
// Bewusst NEUTRAL formuliert: es wird gesagt, was gemessen ist („Leistung und
// Material zusammen übersteigen das hinterlegte Budget um X"), nicht, was
// `budget` bedeuten soll. Ob das ein vereinbarter Festpreis oder ein internes
// Kostenbudget ist, entscheidet der Betrieb, nicht diese Datei.
// ============================================================================

function eur(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
}

export function fixpreisHinweise(kalk: ProjektKalk[]): string[] {
  const h: string[] = [];
  const mit = (kalk || []).filter((k) => k.budget > 0);

  const ohne = (kalk || []).filter((k) => k.budget <= 0 && (k.erbracht > 0 || k.kosten > 0));
  if (ohne.length > 0) {
    h.push(`${ohne.length} Projekt${ohne.length === 1 ? '' : 'e'} ohne hinterlegtes Budget — dort findet keine Prüfung statt: ${ohne.map((k) => k.name).join(', ')}.`);
  }

  const ueberFakturiert = mit.filter((k) => k.abgerechnet - k.budget > 0.005);
  if (ueberFakturiert.length > 0) {
    h.push(`${ueberFakturiert.length} Projekt${ueberFakturiert.length === 1 ? '' : 'e'} ist bereits über das Budget hinaus abgerechnet: ${ueberFakturiert.map((k) => `${k.name} (${eur(k.abgerechnet)} von ${eur(k.budget)})`).join(', ')}.`);
  }

  const gedeckt = mit.filter((k) => k.luft < -0.005);
  if (gedeckt.length > 0) {
    h.push(`Bei ${gedeckt.length} Projekt${gedeckt.length === 1 ? '' : 'en'} übersteigen Leistung und Material zusammen das Budget: ${gedeckt.map((k) => `${k.name} (${eur(k.leistungPlusKosten)} gegen ${eur(k.budget)}, ${eur(-k.luft)} darüber)`).join(', ')}.`);
  }

  const minusDb = (kalk || []).filter((k) => k.erbracht > 0 && k.deckungsbeitrag < -0.005);
  if (minusDb.length > 0) {
    h.push(`${minusDb.length} Projekt${minusDb.length === 1 ? '' : 'e'} mit negativem Deckungsbeitrag: ${minusDb.map((k) => `${k.name} (${eur(k.deckungsbeitrag)})`).join(', ')}.`);
  }

  const nochOffen = mit.filter((k) => k.offen > 0.005 && k.abgerechnet >= k.budget - 0.005);
  if (nochOffen.length > 0) {
    h.push(`${nochOffen.length} Projekt${nochOffen.length === 1 ? '' : 'e'} hat noch nicht abgerechnete Leistung, obwohl das Budget bereits voll fakturiert ist: ${nochOffen.map((k) => `${k.name} (${eur(k.offen)} offen)`).join(', ')}.`);
  }
  return h;
}


// ============================================================================
// Klartext zum Deckungsbeitrag (Punkt 62). Ändert keine bestehende Zahl und
// keine Ampel. NOCH NICHT auf der Seite angezeigt — Andockpunkt, gebündelt
// mit fixpreisHinweise und den übrigen offenen Hinweis-Funktionen.
//
// Der wichtigste Satz ist der erste: solange kein Selbstkostensatz hinterlegt
// ist, ist die angezeigte Marge KEINE Marge. Das muss dastehen, bevor
// irgendeine Zahl daneben erscheint.
// ============================================================================

export function lohnHinweise(kalk: ProjektKalk[]): string[] {
  const h: string[] = [];
  const mitLeistung = (kalk || []).filter((k) => k.erbracht > 0);
  if (mitLeistung.length === 0) return h;

  const ohneSatz = mitLeistung.filter((k) => !k.lohnkostenAngesetzt);
  if (ohneSatz.length > 0) {
    h.push(
      `Für ${ohneSatz.length} Projekt${ohneSatz.length === 1 ? '' : 'e'} ist kein Selbstkostensatz je Stunde hinterlegt. ` +
        'Der ausgewiesene Deckungsbeitrag enthält dort NUR Material und Fremdleistung — die Lohnkosten fehlen. ' +
        'Die Marge ist damit deutlich zu hoch dargestellt.',
    );
  }

  const mitSatz = mitLeistung.filter((k) => k.lohnkostenAngesetzt);

  const negativ = mitSatz.filter((k) => k.deckungsbeitragEcht < -0.005);
  if (negativ.length > 0) {
    h.push(
      `${negativ.length} Projekt${negativ.length === 1 ? '' : 'e'} trägt sich nach Abzug von Material UND Lohn nicht: ` +
        negativ.map((k) => `${k.name} (${eur(k.deckungsbeitragEcht)})`).join(', ') + '.',
    );
  }

  // Die Projekte, bei denen die alte Zahl gut aussah und die neue nicht.
  const geschoent = mitSatz.filter((k) => k.marge >= 30 && k.margeEcht < 15);
  if (geschoent.length > 0) {
    h.push(
      `Bei ${geschoent.length} Projekt${geschoent.length === 1 ? '' : 'en'} sieht die Marge ohne Lohnkosten deutlich besser aus, als sie ist: ` +
        geschoent
          .map((k) => `${k.name} (${zahl(k.marge)} % gegen ${zahl(k.margeEcht)} % mit Lohn)`)
          .join(', ') + '.',
    );
  }

  const duenn = mitSatz.filter((k) => k.deckungsbeitragEcht >= -0.005 && k.margeEcht < 5);
  if (duenn.length > 0) {
    h.push(
      `${duenn.length} Projekt${duenn.length === 1 ? '' : 'e'} unter 5 % echter Marge — dort bleibt nach Material und Lohn fast nichts: ` +
        duenn.map((k) => `${k.name} (${zahl(k.margeEcht)} %)`).join(', ') + '.',
    );
  }

  return h;
}

function zahl(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

/**
 * Ein Satz für die Kopfzeile der Nachkalkulation.
 * Sagt ausdrücklich, WELCHE der beiden Margen gemeint ist.
 */
export function margeKlartext(s: ReturnType<typeof summeKalk>): string {
  if (s.erbracht <= 0) return 'Noch keine erbrachte Leistung erfasst.';
  if (!s.lohnkostenAngesetzt) {
    return (
      `${eur(s.erbracht)} erbracht, ${eur(s.kosten)} Material. Ausgewiesen sind ${zahl(s.marge)} % — ` +
      'das ist Umsatz minus Material, NICHT die Marge. Ohne hinterlegten Selbstkostensatz je Stunde ' +
      'lässt sich der echte Deckungsbeitrag nicht rechnen.'
    );
  }
  return (
    `${eur(s.erbracht)} erbracht, ${eur(s.kosten)} Material, ${eur(s.lohnkosten)} Lohn. ` +
    `Echter Deckungsbeitrag ${eur(s.deckungsbeitragEcht)} (${zahl(s.margeEcht)} %). ` +
    `Ohne Lohn stünden dort ${zahl(s.marge)} %.`
  );
}
