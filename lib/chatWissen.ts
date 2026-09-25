// ============================================================================
// ARGONAUT OS · lib/chatWissen.ts — was der Chat-Assistent weiss (Paket A5)
//
// WARUM
// Der Chat unten rechts trug im Browser einen alten Text mit sich: Preise von
// 499 bis 9.000 €, „24 KI-Agenten", API-Keys. Die Server-Route hat diesen Text
// zwar nie benutzt, aber Willkommensgruss und Schnellfragen („Was macht A4
// Buchhalter?") zeigten ihn jedem Kunden. Und der Assistent kannte das System
// nicht: Auf „Wo trage ich das ein?" konnte er nur raten.
//
// JETZT
// Der Chat bekommt dasselbe Wissen wie der Guide (lib/guideWissen.ts):
//   - die Seite, auf der der Nutzer gerade steht, vollständig
//   - die Seiten, die zu seiner Frage passen (einfaches Wort-Scoring)
//   - das ganze Menü als kurze Liste, damit er überallhin verweisen kann
//   - die Startreihenfolge für Chef bzw. Mitarbeiter
// und klare Regeln: Sie-Form, nichts erfinden, nie behaupten, selbst etwas
// eingetragen zu haben, keine Preise und Pakete nennen.
//
// Reine Logik: KEINE Hooks, KEIN Supabase. Test: tests/chatWissenA5.test.mjs.
// ============================================================================

import {
  WISSEN, WER_TEXT, START_CHEF, START_MITARBEITER, UEBUNGSWELT_HINWEIS,
  wissenFuer, type SeitenWissen,
} from './guideWissen';

export type ChatRolle = 'chef' | 'mitarbeiter';
export type MenuEintrag = { label: string; href: string };

/** Einen Pfad aus dem Browser nur annehmen, wenn er wie eine Dashboard-Seite aussieht. */
export function sichererPfad(roh: unknown): string | null {
  if (typeof roh !== 'string') return null;
  const p = roh.trim().split(/[?#]/)[0];
  if (p.length > 200) return null;
  if (!/^\/dashboard(\/[a-z0-9\-_/\[\]]*)?$/i.test(p)) return null;
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Emojis vorne abschneiden: '🧾 Angebote' -> 'Angebote'. */
function titel(label: string): string {
  const t = String(label ?? '').trim();
  const m = t.match(/[\p{L}\p{N}].*$/u);
  return (m ? m[0] : t).trim();
}

const STOPP = new Set([
  'der', 'die', 'das', 'und', 'oder', 'ich', 'wie', 'wo', 'was', 'wer', 'ein', 'eine', 'einen', 'mit', 'für', 'fuer',
  'auf', 'in', 'im', 'ist', 'sind', 'kann', 'man', 'mein', 'meine', 'meinen', 'hier', 'zu', 'von', 'den', 'dem',
  'des', 'es', 'bei', 'wird', 'werden', 'mich', 'mir', 'sie', 'ihr', 'ihre', 'noch', 'nicht', 'auch', 'wenn',
  'dann', 'als', 'an', 'am', 'um', 'so', 'bitte', 'gibt', 'finde', 'trage', 'ein', 'eintragen', 'machen', 'mache',
]);

/** Wörter einer Frage, klein, ohne Füllwörter, Umlaute vereinheitlicht. */
export function woerter(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPP.has(w));
}

function seitenText(href: string, label: string, w: SeitenWissen): string {
  return [label, href.replace(/[/\-]/g, ' '), w.zweck, ...w.schritte].join(' ');
}

/**
 * Die Seiten, die zur Frage passen — nach Treffern im Titel (dreifach),
 * im Pfad (doppelt) und im Text (einfach). Wortanfänge zählen: „rechnung"
 * trifft „Rechnungen" und „Eingangsrechnung".
 */
export function relevanteSeiten(frage: string, menu: readonly MenuEintrag[], anzahl = 4): string[] {
  const ww = woerter(frage);
  if (ww.length === 0) return [];
  const punkte: Array<{ href: string; p: number }> = [];
  for (const m of menu) {
    const w = WISSEN[m.href];
    if (!w) continue;
    const t = woerter(titel(m.label)).join(' ');
    const pfad = woerter(m.href.replace(/\//g, ' ')).join(' ');
    const text = woerter(seitenText(m.href, m.label, w)).join(' ');
    let p = 0;
    for (const x of ww) {
      const stamm = x.length > 6 ? x.slice(0, 6) : x;
      if (t.includes(stamm)) p += 3;
      if (pfad.includes(stamm)) p += 2;
      if (text.includes(stamm)) p += 1;
    }
    if (p > 0) punkte.push({ href: m.href, p });
  }
  punkte.sort((a, b) => b.p - a.p || a.href.localeCompare(b.href));
  return punkte.slice(0, anzahl).map((x) => x.href);
}

/** Eine Seite aus der Wissensbasis als Klartext-Block für die KI. */
export function seitenBlock(href: string, label: string | null, w: SeitenWissen): string {
  const zeilen = [
    `SEITE: ${label ? titel(label) : href} (${href})`,
    `Zweck: ${w.zweck}`,
    `Wer: ${WER_TEXT[w.wer]}. ${w.werText}`,
    'Schritte:',
    ...w.schritte.map((s, i) => `${i + 1}. ${s}`),
  ];
  if (w.probe) zeilen.push(`Probe-Eintrag: ${w.probe.anlegen} Wieder löschen: ${w.probe.loeschen}`);
  if (w.landetIn?.length) zeilen.push(`Das landet in: ${w.landetIn.map((v) => v.href ? `${v.text} (${v.href})` : v.text).join('; ')}`);
  if (w.vorher?.length) zeilen.push(`Vorher nötig: ${w.vorher.map((v) => v.href ? `${v.text} (${v.href})` : v.text).join('; ')}`);
  return zeilen.join('\n');
}

/** Das ganze Menü als kurze Liste: „Titel — /pfad". */
export function menuListe(menu: readonly MenuEintrag[]): string {
  return menu.map((m) => `${titel(m.label)} — ${m.href}`).join('\n');
}

export const CHAT_REGELN = `REGELN — IMMER EINHALTEN
- Sprechen Sie den Nutzer immer mit „Sie" an. Antworten auf Deutsch, kurz und klar (in der Regel unter 150 Wörtern).
- Sie sind der ARGONAUT-Assistent. Nennen Sie sich nie anders.
- Sie SAGEN nur, wie etwas geht. Sie tragen nie selbst etwas ein, legen nichts an und löschen nichts. Behaupten Sie nie, etwas erledigt zu haben.
- Erklären Sie Abläufe ausschließlich mit dem Wissen unten (SEITEN-WISSEN, MENÜ). Steht etwas nicht darin, sagen Sie ehrlich, dass Sie es nicht sicher wissen, und nennen Sie die Seite, auf der man nachsehen kann. Nichts erfinden — keine Knöpfe, keine Felder, keine Funktionen.
- Nennen Sie Knöpfe und Felder so, wie sie im Wissen stehen, und den Pfad der Seite (z. B. /dashboard/angebote), damit der Nutzer sie findet.
- Beantworten Sie Fragen „wo landet das?" mit „Das landet in" aus dem Wissen.
- Nennen Sie keine Preise, Pakete oder Vertragsbedingungen von ARGONAUT. Bei Fragen dazu: an den Ansprechpartner bei ARGONAUT verweisen.
- Keine Rechts- oder Steuerberatung. Bei Steuer- und Rechtsfragen auf den Steuerberater bzw. Anwalt verweisen.
- Das Wort „Agent" kommt nicht vor — die Teile von ARGONAUT heißen Bausteine.
- Keine Markdown-Zeichen (keine Sternchen, Rauten, Backticks). Aufzählungen: jede Zeile beginnt mit „– ". Die Antwort wird teils vorgelesen.`;

/**
 * Der komplette Wissens-Teil des Systemtexts.
 * @param pfad   Seite, auf der der Nutzer steht (schon mit sichererPfad geprüft)
 * @param frage  die letzte Nutzer-Frage
 */
export function chatKontext(opts: {
  rolle: ChatRolle;
  pfad: string | null;
  frage: string;
  menu: readonly MenuEintrag[];
}): string {
  const { rolle, pfad, frage, menu } = opts;
  const teile: string[] = [];

  teile.push(rolle === 'chef'
    ? 'ROLLE: Der Nutzer ist der CHEF (Inhaber) des Betriebs. Er richtet ein, pflegt Stammdaten, Geld und Rechte.'
    : 'ROLLE: Der Nutzer ist MITARBEITER. Er sieht nur, was der Chef freigegeben hat. Seiten, die „Trägt der Chef ein" sind, pflegt er nicht — sagen Sie ihm dann, dass das der Chef macht.');

  const start = rolle === 'chef' ? START_CHEF : START_MITARBEITER;
  teile.push(['WO FANGE ICH AN? (feste Reihenfolge)', ...start.map((s, i) => `${i + 1}. ${s.text} (${s.href}) — ${s.warum}`)].join('\n'));
  if (rolle === 'chef') teile.push(`ÜBUNGSWELT: ${UEBUNGSWELT_HINWEIS}`);

  const gezeigt = new Set<string>();
  const labelVon = (href: string) => menu.find((m) => m.href === href)?.label ?? null;
  const hier = wissenFuer(pfad);
  const bloecke: string[] = [];
  if (hier) {
    bloecke.push(`DER NUTZER STEHT GERADE AUF:\n${seitenBlock(hier.href, labelVon(hier.href), hier.wissen)}`);
    gezeigt.add(hier.href);
  }
  for (const href of relevanteSeiten(frage, menu, 4)) {
    if (gezeigt.has(href)) continue;
    bloecke.push(seitenBlock(href, labelVon(href), WISSEN[href]));
    gezeigt.add(href);
  }
  if (bloecke.length) teile.push(`SEITEN-WISSEN\n\n${bloecke.join('\n\n')}`);

  teile.push(`MENÜ (alle Seiten, auf die Sie verweisen dürfen)\n${menuListe(menu)}`);
  return teile.join('\n\n');
}

/** Der ganze Systemtext: Regeln, Wissen, Live-Zahlen. */
export function chatSystemText(opts: {
  rolle: ChatRolle;
  pfad: string | null;
  frage: string;
  menu: readonly MenuEintrag[];
  liveDaten: string;
}): string {
  return [
    'Sie sind der ARGONAUT-Assistent in ARGONAUT OS, der Betriebs-Software des Nutzers. Sie helfen, das System zu bedienen, und beantworten Fragen zu den aktuellen Zahlen des Betriebs.',
    CHAT_REGELN,
    chatKontext(opts),
    opts.liveDaten,
  ].join('\n\n');
}

/** Die letzte Frage des Nutzers aus dem Verlauf. */
export function letzteFrage(verlauf: ReadonlyArray<{ role: string; content: string }>): string {
  for (let i = verlauf.length - 1; i >= 0; i--) {
    if (verlauf[i]?.role === 'user' && typeof verlauf[i].content === 'string') return verlauf[i].content;
  }
  return '';
}
