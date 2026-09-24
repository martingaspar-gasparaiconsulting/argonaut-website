// ============================================================================
// ARGONAUT OS · lib/gespraechsProtokoll.ts — Gesprächsprotokoll mit Nachfass
// (Paket PG · B13)
//
// Aus einem diktierten oder getippten Gesprächsverlauf wird ein sauberes
// Protokoll: Teilnehmer, Themen, Beschlüsse, WER macht WAS bis WANN,
// offene Fragen, nächster Termin — plus ein Nachfass-Termin und ein
// Nachfass-Mailentwurf (ohne zweiten KI-Aufruf, fester Text in Sie-Form).
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE Hooks.
// Node-getestet in tests/gespraechsProtokollP76.test.mjs.
//
// ▄▄▄ WAS DIE KI NICHT DARF (hier durchgesetzt, nicht nur im Prompt) ▄▄▄
//   · Eine Frist nur, wenn im Gespräch eine genannt wurde (Wortlaut in
//     bis_text) — und nie VOR dem Besprechungstag. Sonst: keine Frist.
//   · Beträge, die im Gesprächstext nicht vorkommen, werden gemeldet.
//   · Zuständige, deren Name im Gesprächstext nicht vorkommt, werden gemeldet.
//   · Das Datum der Besprechung setzt der Mensch, nicht die KI.
// ============================================================================

import { leseDatum, leseKiJson, plusTage } from './sachbearbeiter';

export type ProtokollArt = 'kunde' | 'baustelle' | 'intern' | 'lieferant';

export const ARTEN: { key: ProtokollArt; label: string; kurz: string }[] = [
  { key: 'kunde', label: 'Kundengespräch', kurz: 'Kunde' },
  { key: 'baustelle', label: 'Baustellen-Besprechung', kurz: 'Baustelle' },
  { key: 'lieferant', label: 'Lieferanten-/Partnergespräch', kurz: 'Lieferant' },
  { key: 'intern', label: 'Interne Besprechung', kurz: 'Intern' },
];

export function artFuer(k: unknown): ProtokollArt {
  return ARTEN.some((a) => a.key === k) ? (k as ProtokollArt) : 'kunde';
}

export type Seite = 'wir' | 'kunde' | 'andere';

export type Aufgabe = { was: string; wer: string; seite: Seite; bis: string | null; bis_text: string | null };

export type Protokoll = {
  titel: string;
  zusammenfassung: string;
  teilnehmer: string[];
  themen: { titel: string; text: string }[];
  beschluesse: string[];
  aufgaben: Aufgabe[];
  offene_fragen: string[];
  naechster_termin: string | null;
  naechster_termin_text: string | null;
  hinweise: string[];
};

export const MAX_ROH = 30_000;

// ---------------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------------

function wochentag(iso: string): number {
  const [j, m, t] = iso.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t)).getUTCDay();
}

/** n Werktage (Mo–Fr) nach iso. Feiertage bewusst nicht — nur ein Nachfass-Vorschlag. */
export function plusWerktage(iso: string, n: number): string {
  let d = iso;
  let rest = Math.max(0, Math.round(n));
  while (rest > 0) {
    d = plusTage(d, 1);
    const w = wochentag(d);
    if (w !== 0 && w !== 6) rest--;
  }
  return d;
}

export function datumDe(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function systemPrompt(art: ProtokollArt, firma: string): string {
  const a = ARTEN.find((x) => x.key === art) ?? ARTEN[0];
  return `Sie erstellen ein sachliches Besprechungsprotokoll (${a.label}) für ${firma || 'einen Betrieb'} aus einer diktierten oder getippten Mitschrift.
"Wir" ist immer ${firma || 'der Betrieb'}. Die andere Seite ist "kunde" (bei Lieferanten- oder Partnergesprächen der Partner).

Regeln:
- Nur festhalten, was in der Mitschrift steht. Nichts erfinden: keine Namen, keine Beträge, keine Termine, keine Zusagen.
- Offensichtliche Diktierfehler still korrigieren. Füllwörter weglassen.
- Aufgaben: WER macht WAS. Seite "wir", "kunde" oder "andere".
- Eine Frist NUR, wenn in der Mitschrift eine genannt ist. Dann "bis_text" = der Wortlaut aus der Mitschrift (z. B. "bis Freitag") und "bis" = das ausgerechnete Datum JJJJ-MM-TT relativ zum Besprechungstag. Ohne genannte Frist beide null.
- Unklares gehört unter "offene_fragen", nicht in die Beschlüsse.
- Kurze, klare Sätze. Keine Wertungen über Personen.

Antworten Sie NUR mit JSON, ohne Markdown:
{"titel":"kurzer Titel","zusammenfassung":"2-3 Sätze","teilnehmer":["Name (Rolle)"],"themen":[{"titel":"...","text":"..."}],"beschluesse":["..."],"aufgaben":[{"was":"...","wer":"Name oder wir/Kunde","seite":"wir","bis":"JJJJ-MM-TT oder null","bis_text":"Wortlaut oder null"}],"offene_fragen":["..."],"naechster_termin":"JJJJ-MM-TT oder null","naechster_termin_text":"Wortlaut oder null"}`;
}

export function nutzerPrompt(e: { datum: string; ort?: string; teilnehmer?: string; kontakt?: string; roh: string }): string {
  const wt = /^\d{4}-\d{2}-\d{2}$/.test(e.datum) ? WT[wochentag(e.datum)] : '';
  return [
    `Besprechungstag: ${wt ? `${wt}, ` : ''}${datumDe(e.datum) || e.datum}`,
    e.ort ? `Ort: ${e.ort}` : '',
    e.kontakt ? `Gesprächspartner laut Kundenkartei: ${e.kontakt}` : '',
    e.teilnehmer ? `Teilnehmer laut Eingabe: ${e.teilnehmer}` : '',
    '',
    'Mitschrift:',
    '"""',
    String(e.roh ?? '').slice(0, MAX_ROH),
    '"""',
  ].filter((z, i) => z !== '' || i === 4).join('\n');
}

// ---------------------------------------------------------------------------
// Antwort lesen und absichern
// ---------------------------------------------------------------------------

function txt(v: unknown, max = 600): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function liste(v: unknown, max = 20, len = 400): string[] {
  return (Array.isArray(v) ? v : []).map((x) => txt(x, len)).filter(Boolean).slice(0, max);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

const GENERISCH = /^(wir|uns|kunde|kundin|auftraggeber|bauherr|bauherrin|lieferant|partner|buero|büro|chef|chefin|alle|beide|team|monteur|bauleitung|bauleiter|bauleiterin|architekt|architektin|andere|offen|herr|herrn|frau|familie|dr|firma|—|-)$/i;

/** Kommt der Name (oder ein Teil davon, ab 3 Buchstaben) in der Mitschrift vor? */
export function nameBelegt(wer: string, quelle: string): boolean {
  const w = norm(wer).replace(/\(.*?\)/g, ' ').trim();
  if (!w || GENERISCH.test(w)) return true;
  const q = norm(quelle);
  return w.split(/[\s,/&]+/).filter((t) => t.length >= 3 && !GENERISCH.test(t)).some((t) => q.includes(t));
}

/** Beträge im Stil 1.234,50 € / 250 Euro / 250 EUR — als Zahlen in Cent. */
export function betraege(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?\s?(?:€|euro\b|eur\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const ganz = Number(m[1].replace(/[.\s]/g, ''));
    const cent = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
    out.push(ganz * 100 + cent);
  }
  return out;
}

export function leseProtokoll(roh: unknown, quelle: string, datum: string): Protokoll {
  const o = leseKiJson(roh) ?? {};
  const hinweise: string[] = [];
  const tag = leseDatum(datum);

  const aufgaben: Aufgabe[] = (Array.isArray(o.aufgaben) ? o.aufgaben : []).slice(0, 30).map((x) => {
    const a = (x ?? {}) as Record<string, unknown>;
    const seite: Seite = a.seite === 'wir' || a.seite === 'kunde' ? a.seite : 'andere';
    const was = txt(a.was, 400);
    const wer = txt(a.wer, 120) || (seite === 'wir' ? 'wir' : seite === 'kunde' ? 'Kunde' : 'offen');
    const bisText = txt(a.bis_text, 80) || null;
    let bis = leseDatum(a.bis);
    if (bis && !bisText) { bis = null; hinweise.push(`Frist bei „${was.slice(0, 50)}" entfernt: in der Mitschrift wurde keine genannt.`); }
    if (bis && tag && bis < tag) { bis = null; hinweise.push(`Frist bei „${was.slice(0, 50)}" lag vor dem Besprechungstag — bitte von Hand eintragen.`); }
    if (bis && tag && bis > plusTage(tag, 730)) { bis = null; hinweise.push(`Frist bei „${was.slice(0, 50)}" lag mehr als zwei Jahre entfernt — bitte prüfen.`); }
    if (!nameBelegt(wer, quelle)) hinweise.push(`Zuständig „${wer}" kommt in der Mitschrift nicht vor — bitte prüfen.`);
    return { was, wer, seite, bis, bis_text: bisText };
  }).filter((a) => a.was);

  let naechster = leseDatum(o.naechster_termin);
  const naechsterText = txt(o.naechster_termin_text, 120) || null;
  if (naechster && !naechsterText) naechster = null;
  if (naechster && tag && naechster < tag) naechster = null;

  const p: Protokoll = {
    titel: txt(o.titel, 140) || 'Besprechung',
    zusammenfassung: txt(o.zusammenfassung, 1200),
    teilnehmer: liste(o.teilnehmer, 20, 120),
    themen: (Array.isArray(o.themen) ? o.themen : []).slice(0, 20).map((x) => {
      const t = (x ?? {}) as Record<string, unknown>;
      return { titel: txt(t.titel, 140), text: txt(t.text, 2000) };
    }).filter((t) => t.titel || t.text),
    beschluesse: liste(o.beschluesse),
    aufgaben,
    offene_fragen: liste(o.offene_fragen),
    naechster_termin: naechster,
    naechster_termin_text: naechsterText,
    hinweise,
  };

  // Beträge, die in der Mitschrift nicht vorkommen
  const belegt = new Set(betraege(quelle));
  const alles = [p.zusammenfassung, ...p.themen.map((t) => t.text), ...p.beschluesse, ...p.aufgaben.map((a) => a.was)].join('\n');
  for (const b of betraege(alles)) {
    if (!belegt.has(b)) {
      hinweise.push(`Der Betrag ${(b / 100).toFixed(2).replace('.', ',')} € steht nicht in der Mitschrift — bitte prüfen.`);
    }
  }
  p.hinweise = [...new Set(hinweise)];
  return p;
}

// ---------------------------------------------------------------------------
// Nachfass und Aufgaben
// ---------------------------------------------------------------------------

/**
 * Wann nachfassen?
 * Früheste Frist der Gegenseite + 1 Werktag (hat der Kunde geliefert?);
 * gibt es keine, 3 Werktage nach der Besprechung. Nie vor morgen.
 */
export function nachfassDatum(p: Pick<Protokoll, 'aufgaben'>, datum: string, heute: string): string {
  const fristen = p.aufgaben.filter((a) => a.seite !== 'wir' && a.bis).map((a) => a.bis as string).sort();
  const basis = fristen.length ? plusWerktage(fristen[0], 1) : plusWerktage(leseDatum(datum) ?? heute, 3);
  const morgen = plusTage(heute, 1);
  return basis < morgen ? morgen : basis;
}

/** Nur UNSERE Aufgaben werden Cockpit-Aufgaben. */
export function aufgabenFuerCockpit(p: Protokoll, datum: string, heute: string) {
  return p.aufgaben.filter((a) => a.seite === 'wir').map((a) => ({
    titel: a.was.slice(0, 140),
    beschreibung: `Aus: ${p.titel} (${datumDe(datum)})${a.wer && !/^wir$/i.test(a.wer) ? ` · zuständig: ${a.wer}` : ''}${a.bis_text ? ` · vereinbart: „${a.bis_text}"` : ''}`,
    prioritaet: (a.bis && a.bis <= plusTage(heute, 2) ? 'hoch' : 'normal') as 'hoch' | 'normal',
    ...(a.bis ? { faellig_am: a.bis } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Ausgabe: Markdown (PDF) und Nachfass-Mail
// ---------------------------------------------------------------------------

function aufgabeZeile(a: Aufgabe): string {
  return `- ${a.was} — **${a.wer}**${a.bis ? ` bis ${datumDe(a.bis)}` : a.bis_text ? ` (${a.bis_text})` : ''}`;
}

export function protokollMarkdown(p: Protokoll, k: { datum: string; ort?: string; art: ProtokollArt }): string {
  const art = ARTEN.find((a) => a.key === k.art)?.label ?? '';
  const t: string[] = [];
  t.push(`**${art}** am ${datumDe(k.datum)}${k.ort ? ` · ${k.ort}` : ''}`);
  if (p.teilnehmer.length) t.push('', `**Teilnehmer:** ${p.teilnehmer.join(', ')}`);
  if (p.zusammenfassung) t.push('', p.zusammenfassung);
  if (p.themen.length) {
    t.push('', '### Besprochen');
    for (const th of p.themen) t.push('', `**${th.titel}**`, th.text);
  }
  if (p.beschluesse.length) t.push('', '### Vereinbart', ...p.beschluesse.map((b) => `- ${b}`));
  if (p.aufgaben.length) t.push('', '### Wer macht was', ...p.aufgaben.map(aufgabeZeile));
  if (p.offene_fragen.length) t.push('', '### Offene Fragen', ...p.offene_fragen.map((f) => `- ${f}`));
  if (p.naechster_termin || p.naechster_termin_text) {
    const teile = [p.naechster_termin ? datumDe(p.naechster_termin) : '', p.naechster_termin_text ? `(${p.naechster_termin_text})` : ''].filter(Boolean);
    t.push('', `**Nächster Termin:** ${teile.join(' ')}`);
  }
  return t.join('\n').trim();
}

export function nachfassMail(p: Protokoll, k: { datum: string; firma: string; anrede?: string }): { betreff: string; text: string } {
  const unsere = p.aufgaben.filter((a) => a.seite === 'wir');
  const ihre = p.aufgaben.filter((a) => a.seite === 'kunde');
  const z = (a: Aufgabe) => `– ${a.was}${a.bis ? ` (bis ${datumDe(a.bis)})` : ''}`;
  const t: string[] = [
    `${k.anrede?.trim() || 'Guten Tag'},`,
    '',
    `vielen Dank für das Gespräch am ${datumDe(k.datum)}. Hier die wichtigsten Punkte zusammengefasst:`,
  ];
  if (p.beschluesse.length) t.push('', 'Vereinbart:', ...p.beschluesse.map((b) => `– ${b}`));
  if (unsere.length) t.push('', 'Das übernehmen wir:', ...unsere.map(z));
  if (ihre.length) t.push('', 'Dafür bräuchten wir von Ihnen:', ...ihre.map(z));
  if (p.offene_fragen.length) t.push('', 'Noch offen:', ...p.offene_fragen.map((f) => `– ${f}`));
  if (p.naechster_termin) t.push('', `Unser nächster Termin: ${datumDe(p.naechster_termin)}.`);
  t.push('', 'Falls wir etwas anders verstanden haben, geben Sie uns bitte kurz Bescheid.', '', 'Mit freundlichen Grüßen', k.firma || '[Firmenname]');
  return { betreff: `Zusammenfassung unseres Gesprächs vom ${datumDe(k.datum)}`, text: t.join('\n') };
}
