// ============================================================================
// ARGONAUT OS · lib/heizungsfoerderung.ts — HW-3 Förderung Heizungstausch (16.10.2026)
//
// Zuschuss-Schätzung KfW 458 (BEG Heizungsförderung für Privatpersonen) für
// den Endkunden des Heizungsbauers. STAND 21.07.2026 laut KfW-Infografik
// „Neue Bedingungen der Heizungsförderung" (Juli 2026):
//   Grundförderung 30 %
//   Klimageschwindigkeitsbonus 16 % (nur selbstnutzende Eigentümer, Austausch
//     funktionstüchtiger Öl-/Kohle-/Nachtspeicher-/Gasetagenheizung oder Gas-/
//     Biomasseheizung ≥ 20 Jahre); ab 01.02.2027 halbjährlich −4 Punkte,
//     Anträge ab 01.08.2028 ohne Bonus
//   Einkommensbonus (selbstnutzend, zu versteuerndes Haushaltseinkommen):
//     ≤ 30.000 € 40 %, ≤ 40.000 € 30 %, ≤ 50.000 € 10 %; Kind < 18 im Haushalt:
//     Einkommen einmalig −10.000 €
//   Höchstsatz 70 %, 80 % nur mit 40 % Einkommensbonus
//   Förderfähige Kosten: 1. Wohneinheit 28.000 € (ab 01.02.2027 halbjährlich
//     −750 €), 2.–6. je 15.000 €, ab 7. je 8.000 €
//
// Angekündigt, aber noch nicht beschlossen: Grundförderung für Wärmepumpen
// ab Q1 2027 15 % + EU-Wertschöpfungsbonus 15 %. Deshalb BEKANNT_BIS: danach
// wird der Wächter-Test rot und die Sätze müssen geprüft werden.
//
// Nur Schätzung — maßgeblich sind KfW-Bedingungen am Tag der Antragstellung,
// kein Rechtsanspruch (Haushaltsvorbehalt). Ausgabe an den Endkunden erst nach
// Anwalt-Freigabe (Start-Schalter „foerderantrag", R67).
// Rein, getestet in tests/heizungsfoerderungHW3.test.mjs.
// ============================================================================

import { centRunden } from './zahlen';

export const STAND = '2026-07-21';
export const BEKANNT_BIS = '2027-01-31';
export const QUELLE = 'KfW, BEG Heizungsförderung für Privatpersonen (458), Bedingungen ab 21.07.2026';

export type Fall = {
  datum: string;                  // Tag der geplanten Antragstellung (JJJJ-MM-TT)
  selbstgenutzt: boolean;         // Eigentümer bewohnt die Einheit selbst (Haupt-/alleiniger Wohnsitz)
  alteHeizung: 'oel' | 'kohle' | 'nachtspeicher' | 'gasetage' | 'gas' | 'biomasse' | 'andere';
  alterJahre: number | null;      // Alter der alten Heizung (für Gas/Biomasse ≥ 20)
  funktionstuechtig: boolean;
  einkommen: number | null;       // zu versteuerndes Haushaltsjahreseinkommen; null = nicht angegeben
  kindUnter18: boolean;
  wohneinheiten: number;          // im Gebäude (für die Kostengrenze)
  kosten: number;                 // förderfähige Gesamtkosten brutto laut Angebot
};

/** Anzahl halbjährlicher Absenkungsschritte (01.02. und 01.08.) ab 01.02.2027 bis zum Datum. */
function schritte(datum: string): number {
  if (datum < '2027-02-01') return 0;
  const j = Number(datum.slice(0, 4)), m = Number(datum.slice(5, 7));
  // je Jahr seit 2027 zwei Schritte; im laufenden Jahr ab 01.02. einer, ab 01.08. ein zweiter
  return (j - 2027) * 2 + (m >= 2 ? 1 : 0) + (m >= 8 ? 1 : 0);
}

export function klimabonusSatz(datum: string): number {
  if (datum >= '2028-08-01') return 0;
  return Math.max(0, 16 - 4 * schritte(datum));
}

export function einkommensbonusSatz(einkommen: number | null, kindUnter18: boolean): number {
  if (einkommen == null || !Number.isFinite(einkommen) || einkommen < 0) return 0;
  const e = einkommen - (kindUnter18 ? 10000 : 0);
  if (e <= 30000) return 40;
  if (e <= 40000) return 30;
  if (e <= 50000) return 10;
  return 0;
}

/** Höchstgrenze der förderfähigen Kosten für das Gebäude. */
export function kostenGrenze(wohneinheiten: number, datum: string): number {
  const we = Math.max(1, Math.trunc(Number(wohneinheiten) || 1));
  const erste = Math.max(22000, 28000 - 750 * schritte(datum));
  const zwei_sechs = Math.min(we, 6) - 1;
  const ab7 = Math.max(0, we - 6);
  return erste + zwei_sechs * 15000 + ab7 * 8000;
}

export function klimabonusMoeglich(f: Pick<Fall, 'selbstgenutzt' | 'alteHeizung' | 'alterJahre' | 'funktionstuechtig'>): { ja: boolean; grund: string } {
  if (!f.selbstgenutzt) return { ja: false, grund: 'Nur für selbstnutzende Eigentümer.' };
  if (!f.funktionstuechtig) return { ja: false, grund: 'Die alte Heizung muss noch funktionstüchtig sein.' };
  if (['oel', 'kohle', 'nachtspeicher', 'gasetage'].includes(f.alteHeizung)) return { ja: true, grund: 'Öl-, Kohle-, Nachtspeicher- oder Gasetagenheizung wird ersetzt.' };
  if (f.alteHeizung === 'gas' || f.alteHeizung === 'biomasse') {
    return (f.alterJahre ?? 0) >= 20 ? { ja: true, grund: 'Gas- bzw. Biomasseheizung ist mindestens 20 Jahre alt.' } : { ja: false, grund: 'Gas- oder Biomasseheizung erst ab 20 Jahren Alter.' };
  }
  return { ja: false, grund: 'Diese alte Heizung zählt nicht für den Bonus.' };
}

export type Schaetzung = {
  grund: number; klima: number; einkommen: number; summeSaetze: number; deckel: number; satz: number;
  kostenGrenze: number; foerderfaehig: number; zuschuss: number; hinweise: string[];
};

export function schaetzen(f: Fall): { ergebnis: Schaetzung | null; fehler: string | null } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.datum))) return { ergebnis: null, fehler: 'Bitte das geplante Antragsdatum eintragen.' };
  if (!Number.isFinite(f.kosten) || f.kosten <= 0) return { ergebnis: null, fehler: 'Bitte die Kosten laut Angebot (brutto) eintragen.' };
  const hinweise: string[] = [];
  const grund = 30;
  const kb = klimabonusMoeglich(f);
  const klima = kb.ja ? klimabonusSatz(f.datum) : 0;
  if (kb.ja && klima === 0) hinweise.push('Der Klimageschwindigkeitsbonus ist zum gewählten Datum ausgelaufen.');
  if (!kb.ja) hinweise.push(`Kein Klimageschwindigkeitsbonus: ${kb.grund}`);
  const einkommen = f.selbstgenutzt ? einkommensbonusSatz(f.einkommen, f.kindUnter18) : 0;
  if (f.selbstgenutzt && f.einkommen == null) hinweise.push('Einkommensbonus nicht berücksichtigt (Einkommen nicht angegeben).');
  const summeSaetze = grund + klima + einkommen;
  const deckel = einkommen === 40 ? 80 : 70;
  const satz = Math.min(summeSaetze, deckel);
  if (summeSaetze > deckel) hinweise.push(`Gedeckelt auf ${deckel} %.`);
  const grenze = kostenGrenze(f.wohneinheiten, f.datum);
  const foerderfaehig = Math.min(f.kosten, grenze);
  if (f.kosten > grenze) hinweise.push(`Gefördert werden höchstens ${grenze.toLocaleString('de-DE')} € Kosten.`);
  if (f.datum > BEKANNT_BIS) hinweise.push('Für dieses Datum sind die Fördersätze noch nicht bekannt — bitte auf kfw.de prüfen.');
  return { ergebnis: { grund, klima, einkommen, summeSaetze, deckel, satz, kostenGrenze: grenze, foerderfaehig, zuschuss: centRunden(foerderfaehig * satz / 100), hinweise }, fehler: null };
}

/** Der richtige Ablauf — die Reihenfolge entscheidet über die Förderung. */
export const ABLAUF: { schritt: string; wer: 'Betrieb' | 'Kunde' | 'beide'; text: string }[] = [
  { schritt: 'Angebot', wer: 'Betrieb', text: 'Angebot mit allen förderfähigen Kosten (Gerät, Einbau, Umfeldmaßnahmen) erstellen.' },
  { schritt: 'Vertrag mit Bedingung', wer: 'beide', text: 'Liefer-/Leistungsvertrag mit aufschiebender oder auflösender Bedingung der Förderzusage abschließen — nachträglich einfügen ist nicht zulässig.' },
  { schritt: 'Bestätigung zum Antrag (BzA)', wer: 'Betrieb', text: 'Fachunternehmen oder Energieeffizienz-Experte erstellt die BzA bei der KfW; der Kunde erhält die BzA-ID.' },
  { schritt: 'Antrag', wer: 'Kunde', text: 'Der Kunde stellt den Antrag selbst in „Meine KfW“ — vor Beginn der Arbeiten.' },
  { schritt: 'Einbau', wer: 'Betrieb', text: 'Nach der Zusage einbauen (bzw. nach Antragstellung auf eigenes Risiko).' },
  { schritt: 'Nachweis', wer: 'beide', text: 'Bestätigung nach Durchführung (BnD) durch den Betrieb, Rechnung; der Kunde reicht die Nachweise fristgerecht bei der KfW ein.' },
];

// ============================================================================
// HW-3 Teil 2 — Förder-Vorgang je Kunde (Status in fester Reihenfolge, Fristen)
// ============================================================================

export const STATUS = [
  'geplant', 'vertrag', 'bza', 'antrag', 'zusage', 'eingebaut', 'nachweis', 'ausgezahlt',
] as const;
export type Status = (typeof STATUS)[number] | 'abgelehnt';
export const STATUS_TEXT: Record<Status, string> = {
  geplant: 'Geplant', vertrag: 'Vertrag mit Bedingung', bza: 'BzA erstellt', antrag: 'Antrag gestellt',
  zusage: 'Zusage erhalten', eingebaut: 'Eingebaut', nachweis: 'Nachweis eingereicht', ausgezahlt: 'Ausgezahlt', abgelehnt: 'Abgelehnt',
};
export const NAECHSTER_SCHRITT: Record<Status, string> = {
  geplant: 'Vertrag mit aufschiebender oder auflösender Bedingung der Förderzusage abschließen',
  vertrag: 'Bestätigung zum Antrag (BzA) bei der KfW erstellen und dem Kunden die BzA-ID geben',
  bza: 'Kunde stellt den Antrag in „Meine KfW“ — erst danach mit den Arbeiten beginnen',
  antrag: 'Auf die Zusage warten (Einbau vorher nur auf eigenes Risiko des Kunden)',
  zusage: 'Einbauen',
  eingebaut: 'Bestätigung nach Durchführung (BnD) erstellen, Rechnung an den Kunden; Kunde reicht Nachweise ein',
  nachweis: 'Auf die Auszahlung warten',
  ausgezahlt: '—',
  abgelehnt: '—',
};

/** Darf der Status so wechseln? Nur ein Schritt vor (oder auf „abgelehnt"); zurück nie. */
export function statusWechselOk(alt: Status, neu: Status): string | null {
  if (alt === neu) return null;
  if (alt === 'ausgezahlt' || alt === 'abgelehnt') return 'Der Vorgang ist abgeschlossen.';
  if (neu === 'abgelehnt') return null;
  const a = STATUS.indexOf(alt as (typeof STATUS)[number]), n = STATUS.indexOf(neu as (typeof STATUS)[number]);
  if (n < 0) return 'Unbekannter Status.';
  if (n < a) return 'Zurück geht nicht — bitte eine Notiz schreiben.';
  if (n > a + 1) return `Bitte der Reihe nach: als Nächstes kommt „${STATUS_TEXT[STATUS[a + 1]]}“. Gerade die Reihenfolge Vertrag → BzA → Antrag → Einbau entscheidet über die Förderung.`;
  return null;
}

export type Vorgang = { status: Status; nachweis_bis?: string | null; antrag_am?: string | null };

/** Ampel: Nachweis-Frist (rot ≤ 14 Tage oder überschritten, gelb ≤ 60 Tage). */
export function fristAmpel(v: Vorgang, heute: string): 'rot' | 'gelb' | 'gruen' | null {
  if (!v.nachweis_bis || ['nachweis', 'ausgezahlt', 'abgelehnt'].includes(v.status)) return null;
  const tage = (Date.parse(v.nachweis_bis + 'T00:00:00Z') - Date.parse(heute + 'T00:00:00Z')) / 86400000;
  if (tage <= 14) return 'rot';
  if (tage <= 60) return 'gelb';
  return 'gruen';
}
