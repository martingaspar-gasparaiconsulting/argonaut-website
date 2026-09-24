// ============================================================================
// ARGONAUT OS · lib/firmenWissen.ts — Firmen-Wissen mit Belegen (Paket PG · B14)
//
// Der Wissens-Chat soll nicht nur antworten, sondern zeigen, WOHER:
//   · Treffer aus den eigenen Dokumenten und aus den vom Chef fürs Team
//     freigegebenen Dokumenten zusammenführen (ohne Doppelte, beste zuerst)
//   · Kontext für die KI nummerieren: [1], [2] …
//   · aus der Antwort ablesen, welche Nummern zitiert wurden
//   · je Beleg die passende Textstelle herausschneiden und die Suchwörter
//     zum Hervorheben markieren
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE Hooks.
// Node-getestet in tests/firmenWissenP76b.test.mjs.
//
// WER WAS SIEHT, entscheidet NICHT diese Datei, sondern die Datenbank (RLS):
// ein Mitarbeiter bekommt Treffer des Chefs nur aus Dokumenten mit
// documents.fuer_team = true. Diese Datei mischt nur, was ankommt.
// ============================================================================

export type Treffer = { id: string; document_id: string; content: string; chunk_index?: number; similarity: number };
export type Beleg = { nr: number; document_id: string; datei: string; stelle: string; team: boolean };

export const MAX_TREFFER = 6;

/** Eigene und Team-Treffer zusammenführen: ohne doppelte Abschnitte, beste zuerst. */
export function mischeTreffer(eigene: Treffer[], team: Treffer[], n = MAX_TREFFER): (Treffer & { team: boolean })[] {
  const gesehen = new Set<string>();
  const alle = [
    ...(eigene ?? []).map((t) => ({ ...t, team: false })),
    ...(team ?? []).map((t) => ({ ...t, team: true })),
  ].filter((t) => t && t.id && typeof t.content === 'string' && Number.isFinite(t.similarity));
  alle.sort((a, b) => b.similarity - a.similarity);
  const out: (Treffer & { team: boolean })[] = [];
  for (const t of alle) {
    if (gesehen.has(t.id)) continue;
    gesehen.add(t.id);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

/** Kontext für die KI: jeder Abschnitt mit seiner Nummer und dem Dateinamen. */
export function kontextAus(treffer: Treffer[], namen: Record<string, string>): string {
  return treffer
    .map((t, i) => `[${i + 1}] Datei: ${namen[t.document_id] || 'Unbekannt'}\n${t.content}`)
    .join('\n\n---\n\n');
}

/** Welche Belegnummern stehen in der Antwort? [1], [2, 3], [1][3] … */
export function zitierteNummern(antwort: string, max: number): number[] {
  const out = new Set<number>();
  const re = /\[(\d+(?:\s*[,;]\s*\d+)*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(antwort ?? '')))) {
    for (const z of m[1].split(/[,;]/)) {
      const n = Number(z.trim());
      if (Number.isInteger(n) && n >= 1 && n <= max) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

const STOPP = new Set(('der die das den dem des ein eine einer eines einem einen und oder aber wie was wer wo wann warum '
  + 'ist sind war wird werden hat haben kann können muss müssen soll sollen darf dürfen ich du er sie es wir ihr '
  + 'mit von zu zum zur für auf aus bei nach über unter vor im in an am als auch nicht noch nur so dass mir mich '
  + 'uns unser unsere gibt bitte welche welcher welches man').split(' '));

/** Suchwörter aus der Frage (ohne Füllwörter, ab 3 Buchstaben). */
export function suchwoerter(frage: string): string[] {
  const w = String(frage ?? '').toLowerCase().match(/[a-zäöüß0-9]{3,}/g) ?? [];
  return [...new Set(w.filter((x) => !STOPP.has(x)))].slice(0, 12);
}

/** Die Textstelle im Abschnitt, die am besten zur Frage passt (ganze Sätze). */
export function besteStelle(content: string, frage: string, max = 320): string {
  const text = String(content ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const saetze = text.split(/(?<=[.!?])\s+/);
  const woerter = suchwoerter(frage);
  let best = 0;
  let bestWert = -1;
  saetze.forEach((s, i) => {
    const l = s.toLowerCase();
    const wert = woerter.reduce((acc, w) => acc + (l.includes(w) ? 1 : 0), 0);
    if (wert > bestWert) { bestWert = wert; best = i; }
  });
  let stelle = saetze[best];
  let a = best, b = best;
  while (stelle.length < max) {
    const vor = a > 0 ? saetze[a - 1] : null;
    const nach = b < saetze.length - 1 ? saetze[b + 1] : null;
    if (nach && (stelle + ' ' + nach).length <= max) { b++; stelle = stelle + ' ' + nach; continue; }
    if (vor && (vor + ' ' + stelle).length <= max) { a--; stelle = vor + ' ' + stelle; continue; }
    break;
  }
  if (stelle.length > max) stelle = stelle.slice(0, max - 1).trimEnd() + '…';
  return `${a > 0 ? '… ' : ''}${stelle}${b < saetze.length - 1 && !stelle.endsWith('…') ? ' …' : ''}`;
}

/** Belege für die Anzeige: nur zitierte Nummern; zitiert die KI keine, alle. */
export function belegeAus(
  treffer: (Treffer & { team?: boolean })[],
  namen: Record<string, string>,
  antwort: string,
  frage: string,
): Beleg[] {
  const zitiert = zitierteNummern(antwort, treffer.length);
  const nummern = zitiert.length ? zitiert : treffer.map((_, i) => i + 1);
  return nummern.map((nr) => {
    const t = treffer[nr - 1];
    return { nr, document_id: t.document_id, datei: namen[t.document_id] || 'Unbekannt', stelle: besteStelle(t.content, frage), team: !!t.team };
  });
}

/** Text in Stücke zerlegen, Suchwörter markiert — für die Hervorhebung. */
export function markiere(text: string, frage: string): { t: string; hit: boolean }[] {
  const woerter = suchwoerter(frage).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const s = String(text ?? '');
  if (!woerter.length || !s) return s ? [{ t: s, hit: false }] : [];
  const re = new RegExp(`(${woerter.join('|')})`, 'gi');
  const out: { t: string; hit: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), hit: false });
    out.push({ t: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), hit: false });
  return out;
}

export const REGELN_BELEGE =
  'Belege jede Aussage aus den Dokument-Auszuegen mit der Nummer des Auszugs in eckigen Klammern, z. B. [1] oder [2][3]. '
  + 'Nutze nur Nummern, die es gibt. Steht die Antwort nicht in den Auszuegen, sage das klar und erfinde nichts.';

// ---------------------------------------------------------------------------
// Freigabe-Warnung: Dateinamen, die nach Vertraulichem klingen
// ---------------------------------------------------------------------------

const SENSIBEL: { re: RegExp; grund: string }[] = [
  { re: /arbeitsvertrag|anstellungsvertrag|\bvertrag|vertr[aä]ge/i, grund: 'Vertrag' },
  { re: /lohn|gehalt|entgelt|abrechnung|verdienst|bonus/i, grund: 'Lohn/Gehalt' },
  { re: /personal|mitarbeiterakte|bewerbung|lebenslauf|zeugnis|abmahnung|k[uü]ndigung|krank|au-?bescheinigung|attest/i, grund: 'Personalsache' },
  { re: /\bbank|kontoauszug|iban|kredit|darlehen|b[uü]rgschaft/i, grund: 'Bank/Finanzen' },
  { re: /steuer|finanzamt|bilanz|bwa|jahresabschluss|elster|ustva|guv/i, grund: 'Steuer/Buchhaltung' },
  { re: /passwort|kennwort|zugangsdaten|login|pin\b/i, grund: 'Zugangsdaten' },
  { re: /ausweis|personalausweis|reisepass|sozialversicherung|sv-?nummer|steuer-?id/i, grund: 'Ausweis/Personendaten' },
];

/** Klingt der Dateiname vertraulich? Dann Warnung vor dem Freigeben. */
export function sensiblerName(dateiname: string): string | null {
  const n = String(dateiname ?? '').replace(/[_\-.]+/g, ' ');
  for (const s of SENSIBEL) if (s.re.test(n)) return s.grund;
  return null;
}
