// ============================================================================
// ARGONAUT OS · lib/seoCheck.ts — reiner On-Page-SEO-Check der Kundenseite
// (Marketing-Ausbau · Punkt 6 — SEO-Modul für organische Google-Leads)
//
// Prüft eine veröffentlichte Website (web_seiten + web_ci) mechanisch gegen die
// wichtigsten On-Page-SEO-Faktoren und gibt je Punkt einen klaren Befund + einen
// konkreten Tipp zurück, plus einen Gesamt-Score (0–100). KEIN externer Google-
// Zugang nötig — bewertet nur, was der Betrieb selbst beeinflussen kann.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEIN Cross-Import —
// pure, node-testbare Funktionen (Muster wie lib/marketingCockpit.ts).
// ============================================================================

// Bausteine so lose typisiert, dass fehlende/zusätzliche Felder nichts brechen.
export type Block = Record<string, unknown> & { typ?: string };

export type SeiteRoh = {
  titel?: unknown;
  status?: unknown;
  bloecke?: unknown;
};

export type CiRoh = {
  firma?: unknown;
  slogan?: unknown;
  ueber_uns?: unknown;
  strasse?: unknown;
  plz?: unknown;
  ort?: unknown;
  telefon?: unknown;
  oeffnungszeiten?: unknown;
  branche?: unknown;
};

function txt(v: unknown): string {
  return (typeof v === 'string' ? v : '').trim();
}

/** Zeichen zählen (unicode-sicher). */
export function zaehleZeichen(s: unknown): number {
  return Array.from(txt(s)).length;
}

/** Wörter grob zählen (für die Textmenge einer Seite). */
export function zaehleWoerter(s: string): number {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t ? t.split(' ').length : 0;
}

/** Sammelt allen sichtbaren Text aus den Bausteinen (für die Textmengen-Prüfung). */
export function textAusBloecken(bloecke: Block[] | null | undefined): string {
  const teile: string[] = [];
  const push = (v: unknown) => { const s = txt(v); if (s) teile.push(s); };
  for (const b of bloecke || []) {
    if (!b || typeof b !== 'object') continue;
    push(b.eyebrow); push(b.titel); push(b.unterzeile); push(b.text); push(b.knopf);
    const arr = (k: string) => Array.isArray((b as Record<string, unknown>)[k]) ? (b as Record<string, unknown>)[k] as Record<string, unknown>[] : [];
    for (const p of arr('punkte')) { push(p.titel); push(p.text); }
    for (const f of arr('fragen')) { push(f.frage); push(f.antwort); }
    for (const s of arr('stimmen')) { push(s.text); push(s.name); push(s.rolle); }
    for (const zz of arr('zahlen')) { push(zz.wert); push(zz.label); }
  }
  return teile.join(' ');
}

export type BlockMerkmale = {
  hatHero: boolean;
  heroTitel: string;
  anzahlBilder: number;
  hatFaq: boolean;
  hatTestimonials: boolean;
  hatKontaktOderCta: boolean;
  anzahlLeistungen: number;
};

/** Merkmale der Bausteine für die SEO-Prüfung. */
export function bloeckeMerkmale(bloecke: Block[] | null | undefined): BlockMerkmale {
  let hatHero = false, heroTitel = '', bilder = 0, hatFaq = false, hatTest = false, hatKontakt = false, leistungen = 0;
  for (const b of bloecke || []) {
    if (!b || typeof b !== 'object') continue;
    const typ = txt(b.typ);
    if (typ === 'hero') { hatHero = true; if (!heroTitel) heroTitel = txt(b.titel); if (txt(b.bild)) bilder++; }
    else if (typ === 'galerie') {
      const arr = Array.isArray(b.bilder) ? (b.bilder as unknown[]) : [];
      bilder += arr.filter((x) => txt(x)).length || Math.max(0, Math.floor(Number(b.anzahl) || 0));
    }
    else if (typ === 'faq') hatFaq = true;
    else if (typ === 'testimonials') hatTest = true;
    else if (typ === 'kontakt' || typ === 'cta' || typ === 'termin') hatKontakt = true;
    else if (typ === 'leistungen') { const arr = Array.isArray(b.punkte) ? (b.punkte as unknown[]) : []; leistungen += arr.length; }
  }
  return { hatHero, heroTitel, anzahlBilder: bilder, hatFaq, hatTestimonials: hatTest, hatKontaktOderCta: hatKontakt, anzahlLeistungen: leistungen };
}

export type CheckStatus = 'gut' | 'warnung' | 'fehlt';
export type SeoCheck = {
  schluessel: string;
  titel: string;
  status: CheckStatus;
  gewicht: number;
  befund: string;
  tipp: string;
};

const FAKTOR: Record<CheckStatus, number> = { gut: 1, warnung: 0.5, fehlt: 0 };

/**
 * Prüft EINE Seite (web_seiten-Zeile + web_ci des Betriebs) und liefert Checks,
 * Score und Ampel. ci ist betriebsweit (gilt für alle Seiten).
 */
export function seoPruefungSeite(seite: SeiteRoh, ci: CiRoh | null | undefined) {
  const c = ci || {};
  const titel = txt(seite?.titel);
  const bloecke = Array.isArray(seite?.bloecke) ? (seite.bloecke as Block[]) : [];
  const m = bloeckeMerkmale(bloecke);
  const seitenText = textAusBloecken(bloecke);
  const woerter = zaehleWoerter(seitenText);
  const metaQuelle = txt(c.slogan) || txt(c.ueber_uns);
  const metaLen = zaehleZeichen(metaQuelle);

  const checks: SeoCheck[] = [];

  // 1) Seitentitel-Länge (Title-Tag) — stärkstes On-Page-Signal.
  const tl = zaehleZeichen(titel);
  checks.push({
    schluessel: 'titel', titel: 'Seitentitel', gewicht: 3,
    status: !titel ? 'fehlt' : (tl >= 30 && tl <= 60 ? 'gut' : 'warnung'),
    befund: !titel ? 'Kein Seitentitel gesetzt.' : `Seitentitel ist ${tl} Zeichen lang.`,
    tipp: 'Idealer Titel: 30–60 Zeichen, mit Leistung + Ort (z. B. „Bäckerei Müller – frisches Brot in Regensburg").',
  });

  // 2) Meta-Beschreibung (aus Slogan / Über-uns abgeleitet).
  checks.push({
    schluessel: 'meta', titel: 'Meta-Beschreibung', gewicht: 3,
    status: !metaQuelle ? 'fehlt' : (metaLen >= 70 && metaLen <= 160 ? 'gut' : 'warnung'),
    befund: !metaQuelle ? 'Keine Beschreibung (Slogan/Über-uns leer).' : `Beschreibung ist ${metaLen} Zeichen lang.`,
    tipp: 'Hinterlege in den Firmendaten einen Slogan oder Über-uns-Text mit 70–160 Zeichen — das ist der Google-Vorschautext.',
  });

  // 3) Aufmacher / H1.
  checks.push({
    schluessel: 'h1', titel: 'Aufmacher (Überschrift)', gewicht: 2,
    status: m.hatHero && m.heroTitel ? 'gut' : 'fehlt',
    befund: m.hatHero && m.heroTitel ? `Aufmacher-Überschrift vorhanden: „${m.heroTitel.slice(0, 60)}".` : 'Kein Titelbereich mit klarer Überschrift.',
    tipp: 'Setz oben einen Titelbereich mit einer klaren Hauptüberschrift, die dein Angebot benennt.',
  });

  // 4) Textmenge.
  checks.push({
    schluessel: 'text', titel: 'Textmenge', gewicht: 2,
    status: woerter >= 250 ? 'gut' : (woerter >= 80 ? 'warnung' : 'fehlt'),
    befund: `Rund ${woerter} Wörter Text auf der Seite.`,
    tipp: 'Google mag Substanz: mind. ~250 Wörter echten Inhalt (Leistungen, Über uns, FAQ) — nicht nur Schlagworte.',
  });

  // 5) Bilder.
  checks.push({
    schluessel: 'bilder', titel: 'Bilder', gewicht: 1,
    status: m.anzahlBilder >= 1 ? 'gut' : 'fehlt',
    befund: m.anzahlBilder >= 1 ? `${m.anzahlBilder} Bild(er) eingebunden.` : 'Noch keine Bilder.',
    tipp: 'Echte Fotos (Team, Arbeit, Ergebnisse) schaffen Vertrauen und verbessern die Verweildauer.',
  });

  // 6) FAQ (People-also-ask).
  checks.push({
    schluessel: 'faq', titel: 'Häufige Fragen (FAQ)', gewicht: 1,
    status: m.hatFaq ? 'gut' : 'fehlt',
    befund: m.hatFaq ? 'FAQ-Bereich vorhanden.' : 'Kein FAQ-Bereich.',
    tipp: 'Ein FAQ-Baustein beantwortet echte Google-Suchfragen und kann als „Auch gefragt" erscheinen.',
  });

  // 7) Bewertungen.
  checks.push({
    schluessel: 'bewertungen', titel: 'Bewertungen', gewicht: 1,
    status: m.hatTestimonials ? 'gut' : 'fehlt',
    befund: m.hatTestimonials ? 'Kundenstimmen vorhanden.' : 'Keine Kundenstimmen.',
    tipp: 'Kundenstimmen erhöhen die Glaubwürdigkeit — bau einen Bewertungs-Baustein ein.',
  });

  // 8) Handlungsaufruf / Kontakt.
  checks.push({
    schluessel: 'cta', titel: 'Kontakt / Handlungsaufruf', gewicht: 1,
    status: m.hatKontaktOderCta ? 'gut' : 'fehlt',
    befund: m.hatKontaktOderCta ? 'Kontakt- oder Anfrage-Baustein vorhanden.' : 'Kein klarer Kontakt-/Anfrage-Weg.',
    tipp: 'Ein klarer Kontakt- oder Handlungsaufruf-Baustein verwandelt Besucher in Anfragen (Leads).',
  });

  // 9) Adresse / Local SEO (NAP).
  const napTeile = [txt(c.strasse), txt(c.plz), txt(c.ort)].filter(Boolean).length;
  checks.push({
    schluessel: 'adresse', titel: 'Adresse (lokale Suche)', gewicht: 2,
    status: napTeile >= 3 ? 'gut' : (napTeile >= 1 ? 'warnung' : 'fehlt'),
    befund: napTeile >= 3 ? 'Vollständige Adresse hinterlegt.' : napTeile >= 1 ? 'Adresse unvollständig.' : 'Keine Adresse hinterlegt.',
    tipp: 'Vollständige Adresse (Straße, PLZ, Ort) hilft bei „…in deiner Stadt"-Suchen und im Google-Unternehmensprofil.',
  });

  // 10) Öffnungszeiten + Telefon (lokale Signale).
  const hatTel = !!txt(c.telefon);
  const hatOeff = !!txt(c.oeffnungszeiten);
  checks.push({
    schluessel: 'kontaktdaten', titel: 'Telefon & Öffnungszeiten', gewicht: 1,
    status: hatTel && hatOeff ? 'gut' : (hatTel || hatOeff ? 'warnung' : 'fehlt'),
    befund: `${hatTel ? 'Telefon ✓' : 'Telefon fehlt'} · ${hatOeff ? 'Öffnungszeiten ✓' : 'Öffnungszeiten fehlen'}.`,
    tipp: 'Telefonnummer und Öffnungszeiten sind starke lokale Signale — bitte in den Firmendaten pflegen.',
  });

  // 11) Veröffentlicht?
  const live = txt(seite?.status) === 'live';
  checks.push({
    schluessel: 'live', titel: 'Veröffentlicht', gewicht: 1,
    status: live ? 'gut' : 'warnung',
    befund: live ? 'Seite ist live.' : 'Seite ist noch nicht veröffentlicht.',
    tipp: 'Nur veröffentlichte Seiten kann Google finden — schalte die Seite live.',
  });

  // Score.
  let summe = 0, max = 0;
  for (const ch of checks) { summe += ch.gewicht * FAKTOR[ch.status]; max += ch.gewicht; }
  const score = max > 0 ? Math.round((summe / max) * 100) : 0;
  const note: 'gut' | 'mittel' | 'schwach' = score >= 80 ? 'gut' : score >= 50 ? 'mittel' : 'schwach';

  const offen = checks.filter((ch) => ch.status !== 'gut').length;
  return { titel: titel || 'Ohne Titel', score, note, offen, checks };
}

export type SeoSeiteErgebnis = ReturnType<typeof seoPruefungSeite>;

/** Kürzt einen langen Text auf n Zeichen (…), für Anzeigen. */
export function kuerze(s: string, n: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}
