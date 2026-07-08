// app/dashboard/_components/arbzgLogik.ts
// ============================================================
// ARGONAUT OS · Block 1.1 Arbeitszeit-Nachweis · ArbZG-Waechter (reine Logik)
// Prueft Zeiterfassungs-Daten gegen das Arbeitszeitgesetz. LIEST NUR, aendert nichts.
//
// Grundlage (geltendes ArbZG, Stand 2026):
//   §3  max 10 h Arbeitszeit/Werktag (Regel 8 h, Ausgleich im 6-Monats-Schnitt)
//   §5  min 11 h Ruhezeit (in erlaubten Branchen auf 10 h verkuerzbar, Ausgleich in 4 Wo)
//   §4  Pausen: >6 h -> 30 min, >9 h -> 45 min
//   §9/§10  Sonntagsarbeit grundsaetzlich verboten — ABER viele Branchen-Ausnahmen
//           (Gastro, Baeckerei, Pflege, Tankstelle, Verkehr, Landwirtschaft ...)
//
// BRANCHEN-TAUGLICH: Der Waechter ist pro Betrieb einstellbar (WaechterOptionen),
// damit er z. B. Sonntagsarbeit im Restaurant NICHT als Verstoss meldet.
// Ampel-Ergebnis (gruen/gelb/rot) — Farb-Zuordnung via ampelFarbe().
// ============================================================

export type ZeitSitzung = {
  id: string;
  mitarbeiter_id: string;
  datum: string;            // 'YYYY-MM-DD'
  kommen_um: string;        // ISO-Zeitstempel
  gehen_um: string | null;  // ISO-Zeitstempel | null (Sitzung noch offen)
  pause_minuten: number;
};

export type Schwere = 'gruen' | 'gelb' | 'rot';

export type ArbzgVerstoss = {
  regel: 'hoechstarbeitszeit' | 'ruhezeit' | 'pause' | 'sonntag';
  schwere: Schwere;
  text: string;
};

export type TagesNachweis = {
  datum: string;
  wochentag: string;
  arbeitsminuten: number;   // netto (ohne Pause)
  pauseMinuten: number;
  offen: boolean;           // mind. eine Sitzung ohne gehen_um
  verstoesse: ArbzgVerstoss[];
  ampel: Schwere;
};

export type Nachweis = {
  tage: TagesNachweis[];
  summeArbeitsminuten: number;
  summePauseMinuten: number;
  anzahlVerstoesse: number;
  schlimmsteAmpel: Schwere;
};

// --- Betriebs-Einstellungen (branchenabhaengig) ---
export type WaechterOptionen = {
  sonntagErlaubt?: boolean;   // §10-Ausnahme: Gastro/Tankstelle/Pflege/Baeckerei ... -> kein Sonntags-Alarm
  ruhezeitStunden?: number;   // 11 Standard; 10 in erlaubten Branchen (mit Ausgleich)
  maxArbeitStunden?: number;  // 10 Standard (hoeher nur mit behoerdlicher Ausnahme §15)
  warnUeber8h?: boolean;      // weicher gelber Hinweis ueber 8 h (Regelarbeitszeit) — Standard an
};

const STANDARD: Required<WaechterOptionen> = {
  sonntagErlaubt: false,
  ruhezeitStunden: 11,
  maxArbeitStunden: 10,
  warnUeber8h: true,
};

// --- Feste ArbZG-Werte ---
const REGEL_ARBEIT_MIN = 8 * 60;  // §3 Regelarbeitszeit
const PAUSE_6H_MIN = 30;          // §4 (> 6 h)
const PAUSE_9H_MIN = 45;          // §4 (> 9 h)

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function rangVon(s: Schwere): number {
  return s === 'rot' ? 2 : s === 'gelb' ? 1 : 0;
}
function schwererer(a: Schwere, b: Schwere): Schwere {
  return rangVon(a) >= rangVon(b) ? a : b;
}
function minutenZwischen(vonIso: string, bisIso: string): number {
  const v = new Date(vonIso).getTime();
  const b = new Date(bisIso).getTime();
  if (isNaN(v) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - v) / 60000));
}

export function stundenText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Prüft alle Sitzungen EINES Tages (können mehrere sein) für EINEN Mitarbeiter
function pruefeTag(datum: string, sitzungen: ZeitSitzung[], opt: Required<WaechterOptionen>): TagesNachweis {
  let bruttoMin = 0;
  let pauseMin = 0;
  let offen = false;
  for (const s of sitzungen) {
    pauseMin += s.pause_minuten || 0;
    if (!s.gehen_um) { offen = true; continue; }
    bruttoMin += minutenZwischen(s.kommen_um, s.gehen_um);
  }
  const nettoMin = Math.max(0, bruttoMin - pauseMin);
  const verstoesse: ArbzgVerstoss[] = [];
  const maxMin = opt.maxArbeitStunden * 60;

  // §3 Höchstarbeitszeit
  if (nettoMin > maxMin) {
    verstoesse.push({ regel: 'hoechstarbeitszeit', schwere: 'rot', text: `Über ${opt.maxArbeitStunden} h gearbeitet (${stundenText(nettoMin)}) — §3 ArbZG` });
  } else if (opt.warnUeber8h && nettoMin > REGEL_ARBEIT_MIN) {
    verstoesse.push({ regel: 'hoechstarbeitszeit', schwere: 'gelb', text: `Über 8 h (${stundenText(nettoMin)}) — Ausgleich im 6-Monats-Schnitt beachten` });
  }

  // §4 Pausen (Basis: Netto-Arbeitszeit)
  if (nettoMin > 9 * 60 && pauseMin < PAUSE_9H_MIN) {
    verstoesse.push({ regel: 'pause', schwere: 'rot', text: `Bei über 9 h nur ${pauseMin} min Pause (Pflicht: 45 min) — §4 ArbZG` });
  } else if (nettoMin > 6 * 60 && pauseMin < PAUSE_6H_MIN) {
    verstoesse.push({ regel: 'pause', schwere: 'rot', text: `Bei über 6 h nur ${pauseMin} min Pause (Pflicht: 30 min) — §4 ArbZG` });
  }

  // §9/§10 Sonntagsarbeit — nur melden, wenn NICHT branchenweit erlaubt
  const wt = new Date(datum + 'T12:00:00').getDay();
  if (wt === 0 && nettoMin > 0 && !opt.sonntagErlaubt) {
    verstoesse.push({ regel: 'sonntag', schwere: 'gelb', text: 'Sonntagsarbeit — grundsätzlich verboten (§9), Ausnahme/Ersatzruhetag prüfen' });
  }

  const ampel = verstoesse.reduce<Schwere>((a, v) => schwererer(a, v.schwere), 'gruen');
  return { datum, wochentag: WOCHENTAGE[wt] || '', arbeitsminuten: nettoMin, pauseMinuten: pauseMin, offen, verstoesse, ampel };
}

// Hauptfunktion: wertet ALLE Sitzungen EINES Mitarbeiters aus,
// gruppiert nach Tag, prüft Tages-Regeln + tagesübergreifende Ruhezeit (§5).
export function berechneNachweis(sitzungen: ZeitSitzung[], optionen: WaechterOptionen = {}): Nachweis {
  const opt: Required<WaechterOptionen> = { ...STANDARD, ...optionen };
  const ruhezeitMin = opt.ruhezeitStunden * 60;

  const proTag = new Map<string, ZeitSitzung[]>();
  for (const s of sitzungen) {
    if (!proTag.has(s.datum)) proTag.set(s.datum, []);
    proTag.get(s.datum)!.push(s);
  }
  const tageSortiert = [...proTag.keys()].sort();
  const tage: TagesNachweis[] = tageSortiert.map((d) => pruefeTag(d, proTag.get(d)!, opt));

  // §5 Ruhezeit: letztes gehen_um des Vortags vs. erstes kommen_um des Folgetags
  for (let i = 1; i < tageSortiert.length; i++) {
    const vor = proTag.get(tageSortiert[i - 1])!;
    const heute = proTag.get(tageSortiert[i])!;
    const letztesGehen = vor.filter((s) => s.gehen_um).map((s) => s.gehen_um as string).sort().pop();
    const erstesKommen = heute.map((s) => s.kommen_um).sort()[0];
    if (letztesGehen && erstesKommen) {
      const ruhe = minutenZwischen(letztesGehen, erstesKommen);
      if (ruhe > 0 && ruhe < ruhezeitMin) {
        tage[i].verstoesse.push({ regel: 'ruhezeit', schwere: 'rot', text: `Nur ${stundenText(ruhe)} Ruhezeit zum Vortag (Pflicht: ${opt.ruhezeitStunden} h) — §5 ArbZG` });
        tage[i].ampel = schwererer(tage[i].ampel, 'rot');
      }
    }
  }

  return {
    tage,
    summeArbeitsminuten: tage.reduce((a, t) => a + t.arbeitsminuten, 0),
    summePauseMinuten: tage.reduce((a, t) => a + t.pauseMinuten, 0),
    anzahlVerstoesse: tage.reduce((a, t) => a + t.verstoesse.length, 0),
    schlimmsteAmpel: tage.reduce<Schwere>((a, t) => schwererer(a, t.ampel), 'gruen'),
  };
}

// Farb-Zuordnung für die UI (Brand-konform)
export function ampelFarbe(s: Schwere): string {
  return s === 'rot' ? '#E06666' : s === 'gelb' ? '#E0A24C' : '#4CAF7D';
}
