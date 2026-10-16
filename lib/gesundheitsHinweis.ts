// ============================================================================
// ARGONAUT OS · lib/gesundheitsHinweis.ts — Paket 386 · MO0c (16.10.2026)
// Erkennt Gesundheitsangaben im Klartext-Feld „Hinweise" der Wellness-Kartei.
//
// Befund: Allergien und ähnliche Angaben landeten im unverschlüsselten Feld
// wellness_kunden.hinweise (Art. 9 DSGVO). Die geschützte Ablage gibt es seit
// Paket PQ (/api/gesundheit-notiz, verschlüsselt, jeder Zugriff protokolliert).
// Ab jetzt:
//   · Beim Anlegen geht ein Hinweis mit Gesundheitsbezug NICHT ins Klartext-
//     Feld, sondern verschlüsselt in die Gesundheitsangaben. Klappt das nicht,
//     wird er gar nicht gespeichert (nie Klartext als Rückfall).
//   · Bestehende Hinweise mit Gesundheitsbezug zeigt die Kartei an, mit Knopf
//     „In geschützte Angaben verschieben".
// Die Erkennung ist eine Wortliste — sie fängt das Übliche, nicht alles. Das
// Feld sagt deshalb weiter „keine Gesundheitsangaben".
//
// Rein — node-testbar (tests/mindestlohnMO0c).
// ============================================================================

export type NotizArtVorschlag = 'allergie' | 'unvertraeglichkeit' | 'kontraindikation' | 'medikation' | 'hinweis';

const MUSTER: { art: NotizArtVorschlag; re: RegExp }[] = [
  { art: 'allergie', re: /allerg|heuschnupfen|latex|nickel(?:allergie)?|duftstoff-?allerg/i },
  { art: 'unvertraeglichkeit', re: /unvertr[äa]glich|intoleranz|laktose|gluten|z[öo]liakie|vertr[äa]gt (?:kein|nicht)/i },
  { art: 'medikation', re: /medikament|tablette|blutverd[üu]nn|marcumar|insulin|cortison|kortison|antibiotik|pille\b|isotretinoin|roaccutan/i },
  { art: 'kontraindikation', re: /schwanger|stillzeit|stillt\b|herzschrittmacher|implantat|thrombose|krampfader|epilep|keine (?:massage|behandlung|w[äa]rme)/i },
  { art: 'hinweis', re: /diabet|zuckerkrank|asthma|neurodermitis|psoriasis|schuppenflechte|rosazea|\bakne\b|ekzem|bluthochdruck|\bherz(?:krank|fehler|rhythm|problem|infarkt|schw[äa]che|-?op)|\bkrebs|chemo|bandscheib|arthros|rheuma|migr[äa]ne|depress|operiert|\boperation|\bOP\b|\bnarbe|\bwunde\b|hautkrank|infekt|herpes|hepatitis|\bhiv\b/i },
];

/** Gesundheitsbezug? Liefert die gefundene Art (erste passende) oder null. */
export function gesundheitsBezug(text: unknown): NotizArtVorschlag | null {
  const t = String(text ?? '');
  if (t.trim().length < 3) return null;
  for (const m of MUSTER) if (m.re.test(t)) return m.art;
  return null;
}

export const HINWEIS_FELD_TEXT = 'Hinweise (Wünsche, Vorlieben — keine Gesundheitsangaben)';
export const GESCHUETZT_TEXT =
  'Das klingt nach einer Gesundheitsangabe. Sie wird nicht im offenen Feld gespeichert, sondern verschlüsselt unter „🔒 Gesundheitsangaben".';
