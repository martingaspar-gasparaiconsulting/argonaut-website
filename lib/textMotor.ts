// ============================================================================
// ARGONAUT OS · lib/textMotor.ts — EIN Text-Motor für vier Textarten (Paket PC)
//
//   B03 E-Book auf Knopfdruck  — Diktat -> Gliederung -> Kapitel -> PDF -> Freebie
//   B04 SEO-Texter / Ratgeber  — Artikel mit Titel, Beschreibung, FAQ -> Website
//   B06 Presse-Baustein        — Pressemitteilung im Aufbau, den Redaktionen erwarten
//   B11 Strategie-Baustein     — Gesamtstrategie für den eigenen oder einen anderen Betrieb
//
// Reine Logik: KEINE Netz-Aufrufe, KEINE Supabase-Aufrufe, KEINE Hooks.
// Node-getestet in tests/textMotorP72.test.mjs.
//
// ▄▄▄ WAS DIESE DATEI GARANTIERT ▄▄▄
// · Kein erfundener Fakt geht ungeprüft durch: alle Prompts verlangen
//   Platzhalter in eckigen Klammern für Zahlen, Namen, Zitate und Termine.
//   pruefeText() zählt die offenen Platzhalter und meldet sie — ein Text mit
//   „[Zahl]" darin darf nicht veröffentlicht werden, ohne dass es jemand sieht.
// · Die SEO-Prüfung rechnet, sie glaubt nicht: Titel- und Beschreibungslänge,
//   Wortzahl, Zwischenüberschriften, Schlüsselwort im Titel und im Einstieg.
// · Alles, was in HTML landet (Website-Baustein, PDF), läuft durch
//   markdownZuHtml — dort wird ZUERST maskiert und DANN formatiert.
// · Kundentexte in der Sie-Form (Martins Regel). Das Wort „KI-Agent" kommt
//   nicht vor.
//
// ▄▄▄ RECHTLICHES (Anwalt-Punkte R02, R03) ▄▄▄
// Art. 50 Abs. 4 KI-VO: KI-erzeugte Texte zu Angelegenheiten von öffentlichem
// Interesse sind zu kennzeichnen — AUSSER sie wurden von einem Menschen
// redaktionell geprüft und verantwortet. Deshalb ist hier jeder Text ein
// ENTWURF, und die Oberfläche verlangt vor dem Veröffentlichen die Prüfung.
// Ob das für Pressemitteilungen reicht, klärt der Anwalt (R02).
// ============================================================================

import { markdownZuHtml, esc, woerter } from './markdownEinfach';

// ---------------------------------------------------------------------------
// Die vier Arten
// ---------------------------------------------------------------------------

export type TextArt = 'ebook' | 'ratgeber' | 'presse' | 'strategie';

export type ArtInfo = {
  art: TextArt;
  label: string;
  icon: string;
  beschreibung: string;
  /** Was im Eingabefeld „Worum geht es?" hilft */
  beispiel: string;
};

export const TEXT_ARTEN: ArtInfo[] = [
  { art: 'ebook', label: 'E-Book', icon: '📘',
    beschreibung: 'Ein Ratgeber zum Verschenken oder als Freebie — Gliederung zuerst, dann Kapitel für Kapitel.',
    beispiel: 'z. B. „Die 7 häufigsten Fehler beim Badumbau — und wie Sie sie vermeiden"' },
  { art: 'ratgeber', label: 'Ratgeber-Artikel (SEO)', icon: '🔎',
    beschreibung: 'Ein Artikel, der bei Google gefunden wird — mit Titel, Beschreibung und Fragen & Antworten.',
    beispiel: 'z. B. „Was kostet eine Wärmepumpe im Altbau?"' },
  { art: 'presse', label: 'Pressemitteilung', icon: '📰',
    beschreibung: 'Im Aufbau, den Redaktionen erwarten: Überschrift, Einstieg mit den W-Fragen, Zitat, Firmenporträt.',
    beispiel: 'z. B. „Betrieb eröffnet zweiten Standort in Sindelfingen"' },
  { art: 'strategie', label: 'Strategie', icon: '🧭',
    beschreibung: 'Eine Gesamtstrategie mit Zielen, Zielgruppen, Maßnahmen für 90 Tage und Kennzahlen.',
    beispiel: 'z. B. „Wir wollen mehr Aufträge im gewerblichen Bereich"' },
];

const ART_NACH: Record<string, ArtInfo> = Object.fromEntries(TEXT_ARTEN.map((a) => [a.art, a]));

export function istTextArt(a: unknown): a is TextArt {
  return typeof a === 'string' && a in ART_NACH;
}
export function artInfo(a: unknown): ArtInfo | null {
  return istTextArt(a) ? ART_NACH[a] : null;
}

// ---------------------------------------------------------------------------
// Eingabe
// ---------------------------------------------------------------------------

export type Eingabe = {
  thema: string;
  zielgruppe: string;
  stichpunkte: string;
  /** Schlüsselwort für den Ratgeber (optional) */
  keyword: string;
  /** Strategie: für wen? eigener Betrieb oder ein anderer */
  fuerWen: string;
  /** E-Book: gewünschte Kapitelzahl (3 bis 10) */
  kapitelZahl: number;
};

function text(v: unknown, max: number): string {
  return String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

export const MIN_KAPITEL = 3;
export const MAX_KAPITEL = 10;

export function pruefeEingabe(roh: Record<string, unknown>): { ok: true; eingabe: Eingabe } | { ok: false; fehler: string } {
  const thema = text(roh.thema, 600);
  if (thema.length < 8) return { ok: false, fehler: 'Bitte das Thema in ein, zwei Sätzen beschreiben (mindestens 8 Zeichen).' };
  const k = Math.round(Number(roh.kapitelZahl));
  return {
    ok: true,
    eingabe: {
      thema,
      zielgruppe: text(roh.zielgruppe, 300),
      stichpunkte: text(roh.stichpunkte, 4000),
      keyword: text(roh.keyword, 80),
      fuerWen: text(roh.fuerWen, 300),
      kapitelZahl: Number.isFinite(k) ? Math.min(MAX_KAPITEL, Math.max(MIN_KAPITEL, k)) : 6,
    },
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export type Firma = { name: string; branche: string; ort: string };

const GRUNDREGELN = `Grundregeln für jeden Text:
- Deutsch, klar, konkret, ohne Floskeln und ohne Fachchinesisch. Kurze Sätze.
- Leser werden mit „Sie" angesprochen.
- Erfinden Sie KEINE Fakten: keine Zahlen, Preise, Statistiken, Studien, Kundennamen, Zitate von echten Personen, Auszeichnungen oder Termine. Wo so etwas hingehört, schreiben Sie einen Platzhalter in eckigen Klammern, z. B. [Anzahl Mitarbeiter], [Preis ab], [Name, Funktion], [Datum].
- Keine Heil- oder Erfolgsversprechen, keine Garantien, keine abwertenden Aussagen über Mitbewerber.
- Erwähnen Sie nicht, dass der Text von einer KI stammt.`;

function firmaZeile(f: Firma): string {
  const teile = [f.name && `Betrieb: ${f.name}`, f.branche && `Branche: ${f.branche}`, f.ort && `Ort: ${f.ort}`].filter(Boolean);
  return teile.length ? teile.join(' · ') : 'Betrieb: [Firmenname]';
}

function eingabeBlock(e: Eingabe): string {
  return [
    `Thema: ${e.thema}`,
    e.zielgruppe ? `Zielgruppe: ${e.zielgruppe}` : '',
    e.keyword ? `Schlüsselwort: ${e.keyword}` : '',
    e.fuerWen ? `Für wen: ${e.fuerWen}` : '',
    e.stichpunkte ? `Was unbedingt hinein soll (Notizen/Diktat):\n${e.stichpunkte}` : '',
  ].filter(Boolean).join('\n');
}

/** E-Book Schritt 1: die Gliederung als JSON. */
export function promptGliederung(e: Eingabe, f: Firma): { system: string; nutzer: string } {
  return {
    system: `Sie sind Lektor für praxisnahe Ratgeber von Handwerks- und Dienstleistungsbetrieben.
${GRUNDREGELN}

Antworten Sie AUSSCHLIESSLICH mit einem JSON-Objekt:
{"titel": string, "untertitel": string, "kapitel": [{"titel": string, "punkte": [string, string, string]}]}
- Genau ${e.kapitelZahl} Kapitel. Kapiteltitel kurz und nützlich (keine Nummern davor).
- Je Kapitel drei Stichpunkte, worum es darin geht.
- Das letzte Kapitel führt zum nächsten Schritt mit dem Betrieb (Beratung, Termin) — ohne Druck.`,
    nutzer: `${firmaZeile(f)}\n${eingabeBlock(e)}`,
  };
}

export type Gliederung = { titel: string; untertitel: string; kapitel: { titel: string; punkte: string[] }[] };

/** E-Book Schritt 2: ein Kapitel als Markdown. */
export function promptKapitel(e: Eingabe, f: Firma, g: Gliederung, index: number): { system: string; nutzer: string } {
  const k = g.kapitel[index];
  const uebersicht = g.kapitel.map((x, i) => `${i + 1}. ${x.titel}`).join('\n');
  return {
    system: `Sie schreiben ein Kapitel eines Ratgebers von ${f.name || '[Firmenname]'}.
${GRUNDREGELN}

Format: Markdown, NUR diese Mittel:
- Absätze (Leerzeile dazwischen)
- Zwischenüberschriften mit "## "
- Aufzählungen mit "- "
- **fett** für höchstens drei Schlüsselbegriffe
Keine Kapitelüberschrift am Anfang (die setzt das Layout). Kein Fazit „Zusammenfassend lässt sich sagen". Länge: 450 bis 700 Wörter.`,
    nutzer: `${firmaZeile(f)}\n${eingabeBlock(e)}\n\nBuch: ${g.titel} — ${g.untertitel}\nAlle Kapitel:\n${uebersicht}\n\nSchreiben Sie jetzt Kapitel ${index + 1}: „${k.titel}"\nInhalt: ${k.punkte.join('; ')}`,
  };
}

/** Ratgeber, Presse, Strategie: ein Durchgang, Ergebnis als JSON. */
export function promptEinzel(art: Exclude<TextArt, 'ebook'>, e: Eingabe, f: Firma, heute: string): { system: string; nutzer: string } {
  if (art === 'ratgeber') {
    return {
      system: `Sie sind SEO-Texter für lokale Betriebe. Sie schreiben Ratgeber-Artikel, die Menschen wirklich weiterhelfen und deshalb gefunden werden.
${GRUNDREGELN}
- Das Schlüsselwort (falls angegeben) steht im Titel und im ersten Absatz — natürlich, nicht gestopft (höchstens 1–2 % der Wörter).
- Lokaler Bezug zum Ort, wenn er bekannt ist.

Antworten Sie AUSSCHLIESSLICH mit einem JSON-Objekt:
{"titel": string, "beschreibung": string, "text": string, "faq": [{"frage": string, "antwort": string}]}
- titel: höchstens 60 Zeichen.
- beschreibung: 120 bis 155 Zeichen, macht Lust aufs Lesen (Meta-Beschreibung).
- text: Markdown mit mindestens drei "## "-Zwischenüberschriften, Absätzen und "- "-Aufzählungen, 800 bis 1200 Wörter, endet mit einem freundlichen Hinweis auf eine Beratung beim Betrieb.
- faq: drei bis fünf echte Fragen, die Kunden stellen, mit kurzen Antworten.`,
      nutzer: `${firmaZeile(f)}\n${eingabeBlock(e)}`,
    };
  }
  if (art === 'presse') {
    return {
      system: `Sie sind Pressereferent. Sie schreiben Pressemitteilungen, die Lokalredaktionen übernehmen können.
${GRUNDREGELN}
- Sachlicher Nachrichtenton, dritte Person („Die Firma …"), keine Werbesprache, keine Superlative.
- Zitate NUR als Platzhalter-Rahmen: „[Zitat: …]", sagt [Name, Funktion]. Der Betrieb setzt das echte Zitat selbst ein.

Antworten Sie AUSSCHLIESSLICH mit einem JSON-Objekt:
{"titel": string, "unterzeile": string, "text": string}
- titel: höchstens 80 Zeichen, sagt die Nachricht.
- text: Markdown. Erster Absatz beginnt mit „${f.ort || '[Ort]'}, ${heute} — " und beantwortet wer, was, wann, wo, warum. Dann zwei bis drei Absätze Hintergrund, ein Zitat-Platzhalter, danach "## Über ${f.name || '[Firmenname]'}" (drei Sätze Firmenporträt mit Platzhaltern für Zahlen) und "## Pressekontakt" mit Platzhaltern [Name], [Telefon], [E-Mail]. 300 bis 500 Wörter.`,
      nutzer: `${firmaZeile(f)}\n${eingabeBlock(e)}`,
    };
  }
  return {
    system: `Sie sind Unternehmensberater für kleine und mittlere Betriebe. Sie schreiben eine umsetzbare Strategie — keine Theorie.
${GRUNDREGELN}
- Wo Daten fehlen, benennen Sie die Annahme ausdrücklich („Annahme: …") statt sie als Tatsache zu schreiben.

Antworten Sie AUSSCHLIESSLICH mit einem JSON-Objekt:
{"titel": string, "text": string}
- text: Markdown mit genau diesen Abschnitten als "## "-Überschriften: Ausgangslage, Ziele (3, messbar), Zielgruppen, Positionierung, Maßnahmen für die nächsten 90 Tage (als Liste, je Woche oder Monat), Kennzahlen, Risiken und Gegenmaßnahmen, Nächste drei Schritte. 700 bis 1100 Wörter.`,
    nutzer: `${firmaZeile(f)}\n${eingabeBlock(e)}`,
  };
}

// ---------------------------------------------------------------------------
// KI-Antwort lesen
// ---------------------------------------------------------------------------

/** Erstes JSON-Objekt aus einer Antwort — mit Zaun, Vorrede, Nachklapp. */
export function leseJson(roh: unknown): Record<string, unknown> | null {
  const s = String(roh ?? '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  for (let ende = s.lastIndexOf('}'); ende > start; ende = s.lastIndexOf('}', ende - 1)) {
    try {
      const o = JSON.parse(s.slice(start, ende + 1));
      if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
    } catch { /* weiter */ }
  }
  return null;
}

/** Markdown-Text von Zäunen, Kapitel-H1 und Vorrede befreien. */
export function saubererMarkdown(roh: unknown): string {
  let s = String(roh ?? '').replace(/\r\n/g, '\n').trim();
  s = s.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '');
  s = s.replace(/^\s*(hier ist|gerne)[^\n]*\n+/i, '');
  s = s.replace(/^# [^\n]*\n+/, ''); // H1 am Anfang: setzt das Layout
  return s.trim();
}

export function leseGliederung(roh: unknown, kapitelZahl: number): Gliederung | null {
  const o = leseJson(roh);
  if (!o) return null;
  const titel = text(o.titel, 140);
  const kapitelRoh = Array.isArray(o.kapitel) ? o.kapitel : [];
  const kapitel = kapitelRoh
    .map((k) => {
      const kk = (k ?? {}) as Record<string, unknown>;
      const punkte = Array.isArray(kk.punkte) ? kk.punkte.map((p) => text(p, 200)).filter(Boolean).slice(0, 5) : [];
      return { titel: text(kk.titel, 120).replace(/^\d+[.)]\s*/, ''), punkte };
    })
    .filter((k) => k.titel)
    .slice(0, MAX_KAPITEL);
  if (!titel || kapitel.length < MIN_KAPITEL) return null;
  void kapitelZahl;
  return { titel, untertitel: text(o.untertitel, 200), kapitel };
}

export type FaqEintrag = { frage: string; antwort: string };

export type Einzeltext = {
  titel: string;
  /** Ratgeber: Meta-Beschreibung · Presse: Unterzeile */
  beschreibung: string;
  text: string;
  faq: FaqEintrag[];
};

export function leseEinzeltext(roh: unknown): Einzeltext | null {
  const o = leseJson(roh);
  if (!o) return null;
  const titel = text(o.titel, 160);
  const t = saubererMarkdown(o.text);
  if (!titel || !t) return null;
  const faq = (Array.isArray(o.faq) ? o.faq : [])
    .map((x) => { const f = (x ?? {}) as Record<string, unknown>; return { frage: text(f.frage, 200), antwort: text(f.antwort, 800) }; })
    .filter((f) => f.frage && f.antwort)
    .slice(0, 8);
  return { titel, beschreibung: text(o.beschreibung ?? o.unterzeile, 300), text: t, faq };
}

// ---------------------------------------------------------------------------
// Prüfen
// ---------------------------------------------------------------------------

/** Offene Platzhalter wie [Preis ab] oder [Name, Funktion]. Markdown-Links gibt es hier nicht. */
export function platzhalter(t: unknown): string[] {
  const treffer = String(t ?? '').match(/\[[^\]\n]{1,60}\]/g) ?? [];
  return [...new Set(treffer)];
}

export type Pruefpunkt = { ok: boolean; text: string };

/** SEO-Prüfung eines Ratgeber-Artikels. Rechnet selbst, statt der KI zu glauben. */
export function seoPruefung(e: Einzeltext, keyword: string): Pruefpunkt[] {
  const p: Pruefpunkt[] = [];
  const tl = e.titel.length;
  p.push({ ok: tl >= 20 && tl <= 60, text: `Titel ${tl} Zeichen (gut: 20 bis 60)` });
  const bl = e.beschreibung.length;
  p.push({ ok: bl >= 120 && bl <= 155, text: `Beschreibung ${bl} Zeichen (gut: 120 bis 155)` });
  const w = woerter(e.text);
  p.push({ ok: w >= 600, text: `${w} Wörter (gut: ab 600)` });
  const h2 = (e.text.match(/^\s*##\s+\S/gm) ?? []).length;
  p.push({ ok: h2 >= 3, text: `${h2} Zwischenüberschriften (gut: ab 3)` });
  p.push({ ok: e.faq.length >= 3, text: `${e.faq.length} Fragen & Antworten (gut: ab 3)` });
  const kw = keyword.trim().toLowerCase();
  if (kw) {
    const ersterAbsatz = e.text.split(/\n\s*\n/)[0]?.toLowerCase() ?? '';
    p.push({ ok: e.titel.toLowerCase().includes(kw), text: `Schlüsselwort „${keyword}" im Titel` });
    p.push({ ok: ersterAbsatz.includes(kw), text: `Schlüsselwort im ersten Absatz` });
    const anzahl = e.text.toLowerCase().split(kw).length - 1;
    const dichte = w > 0 ? (anzahl * kw.split(/\s+/).length) / w * 100 : 0;
    p.push({ ok: dichte <= 2.5, text: `Schlüsselwort-Dichte ${dichte.toLocaleString('de-DE', { maximumFractionDigits: 1 })} % (höchstens 2,5 %, sonst wirkt es gestopft)` });
  }
  return p;
}

/** Hinweise für jede Textart vor dem Veröffentlichen. */
export function pruefeText(t: string): string[] {
  const h: string[] = [];
  const offen = platzhalter(t);
  if (offen.length) h.push(`${offen.length} Platzhalter noch offen: ${offen.slice(0, 6).join(', ')}${offen.length > 6 ? ' …' : ''} — bitte vor dem Veröffentlichen ersetzen.`);
  if (/\b(garantiert|100\s?%|beste[rn]?\s|nummer\s?1|marktführer)/i.test(t)) h.push('Der Text enthält ein Werbeversprechen („garantiert", „der Beste" …) — nur stehen lassen, wenn es belegbar ist.');
  if (/\b(ki-agent|ki-crew|claude|chatgpt)\b/i.test(t)) h.push('Der Text nennt eine KI oder ein Werkzeug — bitte umformulieren.');
  if (/\bdu\b|\bdein(e|en|er|em)?\b/i.test(t)) h.push('Der Text duzt an einer Stelle — Kundentexte bitte in der Sie-Form.');
  return h;
}

// ---------------------------------------------------------------------------
// Weiterverwendung
// ---------------------------------------------------------------------------

/** Slug für eine Ratgeber-Seite: "ratgeber-" + Titel, höchstens 60 Zeichen. */
export function ratgeberSlug(titel: string): string {
  const s = String(titel || 'artikel').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return `ratgeber-${s || 'artikel'}`;
}

/** Bausteine für eine Ratgeber-Seite im Website-Bauer (lib/webBloecke). */
export function ratgeberBloecke(e: Einzeltext): Array<Record<string, unknown>> {
  const b: Array<Record<string, unknown>> = [
    { typ: 'artikel', eyebrow: 'Ratgeber', titel: e.titel, text: e.text },
  ];
  if (e.faq.length) b.push({ typ: 'faq', eyebrow: 'Fragen & Antworten', titel: 'Häufige Fragen', fragen: e.faq });
  b.push({ typ: 'kontakt', titel: 'Sie möchten beraten werden?', text: 'Schreiben Sie uns — wir melden uns schnell zurück.', knopf: 'Anfrage senden' });
  return b;
}

export type Kapitel = { titel: string; text: string };

/**
 * Druckfertiges HTML für das PDF (weiß, gut lesbar, Seitenumbruch je Kapitel).
 * Farbe aus dem CI des Betriebs, sonst ARGONAUT-Gold. Alles wird maskiert.
 */
export function dokumentHtml(opt: {
  titel: string; untertitel?: string; firma: string; farbe?: string | null; kapitel: Kapitel[]; hinweis?: string;
}): string {
  const farbe = /^#[0-9a-f]{3,8}$/i.test(String(opt.farbe ?? '')) ? String(opt.farbe) : '#C9A84C';
  const mehrere = opt.kapitel.length > 1;
  const inhalt = mehrere
    ? `<div class="toc"><h2>Inhalt</h2><ol>${opt.kapitel.map((k) => `<li>${esc(k.titel)}</li>`).join('')}</ol></div>`
    : '';
  const kapitel = opt.kapitel.map((k, i) =>
    `<section class="kap">${mehrere ? `<div class="nr">Kapitel ${i + 1}</div>` : ''}<h2>${esc(k.titel)}</h2>${markdownZuHtml(k.text, 'p')}</section>`,
  ).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(opt.titel)}</title><style>
@page { size: A4; margin: 20mm 18mm 22mm 18mm; }
body { font-family: 'DM Sans', Arial, Helvetica, sans-serif; color: #1c2430; font-size: 11pt; line-height: 1.6; margin: 0; }
.deckblatt { height: 240mm; display: flex; flex-direction: column; justify-content: center; border-left: 6px solid ${farbe}; padding-left: 14mm; page-break-after: always; }
.deckblatt h1 { font-size: 28pt; line-height: 1.15; margin: 0 0 6mm; }
.deckblatt .unter { font-size: 14pt; color: #4a5568; margin: 0 0 14mm; }
.deckblatt .firma { font-size: 12pt; font-weight: 700; color: ${farbe}; }
.toc { page-break-after: always; } .toc h2 { color: ${farbe}; } .toc li { margin: 2mm 0; }
.kap { page-break-before: always; } .kap:first-of-type { page-break-before: auto; }
.nr { text-transform: uppercase; letter-spacing: 1.5px; font-size: 9pt; color: ${farbe}; font-weight: 700; }
h2 { font-size: 18pt; margin: 2mm 0 5mm; line-height: 1.25; }
h3.kh { font-size: 13pt; margin: 7mm 0 2mm; color: #1c2430; }
p { margin: 0 0 3.5mm; } ul.kliste { margin: 0 0 4mm; padding-left: 6mm; } ul.kliste li { margin: 1mm 0; }
.hinweis { margin-top: 12mm; font-size: 8.5pt; color: #718096; border-top: 1px solid #e2e8f0; padding-top: 3mm; }
</style></head><body>
<div class="deckblatt"><h1>${esc(opt.titel)}</h1>${opt.untertitel ? `<p class="unter">${esc(opt.untertitel)}</p>` : ''}<div class="firma">${esc(opt.firma || '')}</div></div>
${inhalt}${kapitel}
${opt.hinweis ? `<p class="hinweis">${esc(opt.hinweis)}</p>` : ''}
</body></html>`;
}

/** Dateiname fürs PDF: nur sichere Zeichen. */
export function pdfName(titel: string): string {
  const s = String(titel || 'Dokument')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${s || 'Dokument'}.pdf`;
}

// ---------------------------------------------------------------------------
// Modellwahl (siehe lib/kiPreise.ts für die Kosten)
// ---------------------------------------------------------------------------

/**
 * Gliederung: Haiku (kurz, strukturiert). Lange Texte: Sonnet 5 — Martins
 * Anspruch an den SEO-Texter ist „präzise, sehr gute Texte". Ein Kapitel mit
 * rund 2.500 Ausgabe-Tokens kostet mit Sonnet 5 etwa 0,03 USD.
 */
export function modellFuer(schritt: 'gliederung' | 'kapitel' | 'einzel'): string {
  return schritt === 'gliederung' ? 'claude-haiku-4-5' : 'claude-sonnet-5';
}

export function maxTokensFuer(schritt: 'gliederung' | 'kapitel' | 'einzel', art?: TextArt): number {
  if (schritt === 'gliederung') return 1500;
  if (schritt === 'kapitel') return 3000;
  return art === 'presse' ? 2000 : 4000;
}
