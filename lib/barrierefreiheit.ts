// ============================================================================
// ARGONAUT OS · lib/barrierefreiheit.ts — Barrierefreiheits-Check (Paket PR, K04)
//
// Barrierefreiheitsstärkungsgesetz (BFSG), gilt seit 28.06.2025 für
// Dienstleistungen im elektronischen Geschäftsverkehr an Verbraucher — also
// Online-Shops und Websites, auf denen ein Vertrag geschlossen wird.
//   - Nicht betroffen: reine B2B-Angebote.
//   - Ausgenommen (nur für Dienstleistungen): Kleinstunternehmen mit weniger als
//     10 Beschäftigten UND höchstens 2 Mio. € Jahresumsatz oder Bilanzsumme.
//   - Pflicht: Informationen zur Barrierefreiheit (Anlage 3 BFSG) in den AGB
//     oder auf andere deutlich wahrnehmbare Weise, inkl. zuständiger
//     Marktüberwachungsbehörde (MLBF AöR, Magdeburg).
//   - Maßstab in der Praxis: WCAG 2.1 AA (EN 301 549).
//
// Diese Datei prüft, was sich AUTOMATISCH prüfen lässt: Farbkontraste des CI
// und typische Fehler im fertigen HTML einer Seite. Tastatur-Bedienung,
// Screenreader-Verhalten und verständliche Sprache kann nur ein Mensch prüfen
// — das sagt der Bericht auch so. Reine Logik, node-getestet
// (tests/pflichtenP92.test.mjs), 0 €.
// ============================================================================

export const BFSG_STAND = '24.09.2026';

export const MLBF = {
  name: 'Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen (MLBF AöR)',
  anschrift: 'Carl-Miller-Straße 6, 39112 Magdeburg',
  email: 'kontakt@mlbf-barrierefrei.de',
  web: 'https://www.mlbf-barrierefrei.de',
};

// ---------------------------------------------------------------------------
// Betroffenheit
// ---------------------------------------------------------------------------

export type Betroffenheit = { ergebnis: 'betroffen' | 'ausgenommen' | 'nicht_betroffen' | 'unklar'; text: string };

export function betroffenheit(f: { verbraucher: boolean | null; onlineVertrag: boolean | null; beschaeftigte: number | null; umsatzMio: number | null }): Betroffenheit {
  if (f.verbraucher === false) return { ergebnis: 'nicht_betroffen', text: 'Sie verkaufen ausschließlich an Unternehmen (B2B) — das BFSG gilt dann nicht. Tipp: Das auf der Website deutlich sagen („Angebot nur für Gewerbetreibende").' };
  if (f.onlineVertrag === false) return { ergebnis: 'nicht_betroffen', text: 'Auf Ihrer Website wird kein Vertrag geschlossen (keine Bestellung, keine verbindliche Buchung) — dann ist sie in der Regel keine Dienstleistung im elektronischen Geschäftsverkehr. Barrierearm bauen lohnt sich trotzdem.' };
  if (f.verbraucher === null || f.onlineVertrag === null) return { ergebnis: 'unklar', text: 'Bitte die beiden Fragen oben beantworten.' };
  const klein = f.beschaeftigte !== null && f.beschaeftigte < 10 && f.umsatzMio !== null && f.umsatzMio <= 2;
  if (klein) return { ergebnis: 'ausgenommen', text: 'Als Kleinstunternehmen (weniger als 10 Beschäftigte und höchstens 2 Mio. € Umsatz oder Bilanzsumme) sind Sie für Dienstleistungen wie einen Online-Shop ausgenommen. Wächst der Betrieb über eine der Grenzen, gilt die Pflicht.' };
  if (f.beschaeftigte === null || f.umsatzMio === null) return { ergebnis: 'unklar', text: 'Bitte Beschäftigte und Umsatz angeben — davon hängt die Ausnahme für Kleinstunternehmen ab.' };
  return { ergebnis: 'betroffen', text: 'Sie schließen online Verträge mit Verbrauchern und sind kein Kleinstunternehmen — Ihr Shop bzw. Ihre Buchungsstrecke muss barrierefrei sein, und Sie brauchen Informationen zur Barrierefreiheit auf der Website.' };
}

// ---------------------------------------------------------------------------
// Farbkontrast (WCAG 2.1)
// ---------------------------------------------------------------------------

function hexRgb(hex: string): [number, number, number] | null {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function luminanz([r, g, b]: [number, number, number]): number {
  const k = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
}

/** Kontrastverhältnis nach WCAG (1 bis 21), auf zwei Stellen gerundet. Ungültige Farbe -> null. */
export function kontrast(a: string, b: string): number | null {
  const x = hexRgb(a); const y = hexRgb(b);
  if (!x || !y) return null;
  const l1 = luminanz(x); const l2 = luminanz(y);
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
}

/** Dunkelt `farbe` schrittweise ab, bis sie gegen `gegen` das Ziel erreicht. */
export function abdunkelnBis(farbe: string, gegen: string, ziel: number): string | null {
  const c = hexRgb(farbe);
  if (!c) return null;
  for (let f = 1; f >= 0; f -= 0.02) {
    const h = rgbHex(c[0] * f, c[1] * f, c[2] * f);
    if ((kontrast(h, gegen) ?? 0) >= ziel) return h;
  }
  return '#000000';
}

export type CiFarben = { farbe_primaer?: string | null; farbe_sekundaer?: string | null; farbe_akzent?: string | null };
// Standardwerte wie in lib/webBloecke.ts (seiteCss).
export const CI_STANDARD = { p: '#1F3A5F', s: '#E0A24C', a: '#4CAF7D' };

export type KontrastPaar = { id: string; wo: string; vorne: string; hinten: string; wert: number | null; ziel: number; ok: boolean; feld: 'farbe_primaer' | 'farbe_sekundaer' | 'farbe_akzent'; vorschlag: string | null };

function farbe(v: string | null | undefined, standard: string): string {
  const t = String(v ?? '').trim();
  return hexRgb(t) ? (t.startsWith('#') ? t : '#' + t).toUpperCase() : standard;
}

/** Prüft die Farbpaare, die der Website-Bauer tatsächlich verwendet. */
export function ciKontraste(ci: CiFarben): KontrastPaar[] {
  const p = farbe(ci.farbe_primaer, CI_STANDARD.p);
  const s = farbe(ci.farbe_sekundaer, CI_STANDARD.s);
  const a = farbe(ci.farbe_akzent, CI_STANDARD.a);
  const W = '#FFFFFF';
  const paare: Array<Omit<KontrastPaar, 'wert' | 'ok' | 'vorschlag'>> = [
    { id: 'knopf', wo: 'Knöpfe (weiße Schrift auf Akzentfarbe)', vorne: W, hinten: a, ziel: 4.5, feld: 'farbe_akzent' },
    { id: 'titel', wo: 'Titelbereich und dunkle Knöpfe (weiße Schrift auf Hauptfarbe)', vorne: W, hinten: p, ziel: 4.5, feld: 'farbe_primaer' },
    { id: 'ueberschrift', wo: 'Überschriften (Hauptfarbe auf Weiß, große Schrift)', vorne: p, hinten: W, ziel: 3, feld: 'farbe_primaer' },
    { id: 'oberzeile', wo: 'Kleine Oberzeilen (Zweitfarbe auf Weiß)', vorne: s, hinten: W, ziel: 4.5, feld: 'farbe_sekundaer' },
    // Hinweis: Dieselbe Zweitfarbe steht auf Weiss UND auf der Hauptfarbe. Beides zugleich
    // gelingt nur mit sehr dunkler Hauptfarbe und mittlerer Zweitfarbe — daher kein Farbvorschlag.
    { id: 'oberzeile_titel', wo: 'Oberzeile im Titelbereich (Zweitfarbe auf Hauptfarbe)', vorne: s, hinten: p, ziel: 4.5, feld: 'farbe_sekundaer' },
  ];
  return paare.map((x) => {
    const wert = kontrast(x.vorne, x.hinten);
    const ok = wert !== null && wert >= x.ziel;
    let vorschlag: string | null = null;
    if (!ok) {
      if (x.id === 'knopf' || x.id === 'titel') vorschlag = abdunkelnBis(x.hinten, W, x.ziel);
      else if (x.id === 'ueberschrift' || x.id === 'oberzeile') vorschlag = abdunkelnBis(x.vorne, W, x.ziel);
    }
    return { ...x, wert, ok, vorschlag };
  });
}

// ---------------------------------------------------------------------------
// HTML-Prüfung (was sich automatisch erkennen lässt)
// ---------------------------------------------------------------------------

export type Befund = { id: string; schwere: 'rot' | 'gelb'; titel: string; anzahl: number; beispiel: string; vorschlag: string; wcag: string };

function ohneSkripte(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
}
function attr(tag: string, name: string): string | null {
  const m = new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? '') : (new RegExp('\\s' + name + '(\\s|>|/)', 'i').test(tag) ? '' : null);
}
function textOhneTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function kurz(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 90 ? t.slice(0, 87) + '…' : t;
}

export function pruefeHtml(htmlRoh: string): Befund[] {
  const befunde: Befund[] = [];
  const html = String(htmlRoh || '');
  const koerper = ohneSkripte(html);
  const neu = (b: Befund) => { if (b.anzahl > 0) befunde.push(b); };

  // Sprache
  const htmlTag = /<html[^>]*>/i.exec(html)?.[0] ?? '';
  if (!attr(htmlTag, 'lang')) neu({ id: 'sprache', schwere: 'rot', titel: 'Seitensprache fehlt', anzahl: 1, beispiel: kurz(htmlTag || '<html>'), vorschlag: 'lang="de" im html-Element setzen.', wcag: '3.1.1' });

  // Zoom gesperrt
  const vp = /<meta[^>]+name=["']viewport["'][^>]*>/i.exec(html)?.[0] ?? '';
  if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp)) neu({ id: 'zoom', schwere: 'rot', titel: 'Vergrößern auf dem Handy ist gesperrt', anzahl: 1, beispiel: kurz(vp), vorschlag: 'user-scalable=no und maximum-scale=1 entfernen.', wcag: '1.4.4' });

  // Bilder
  const imgs = koerper.match(/<img\b[^>]*>/gi) ?? [];
  const ohneAlt = imgs.filter((t) => attr(t, 'alt') === null);
  neu({ id: 'bild_alt', schwere: 'rot', titel: 'Bilder ohne Alternativtext', anzahl: ohneAlt.length, beispiel: kurz(ohneAlt[0] ?? ''), vorschlag: 'Jedes Bild braucht alt="…" mit einer kurzen Beschreibung (bei reiner Deko alt="").', wcag: '1.1.1' });
  const leerAlt = imgs.filter((t) => attr(t, 'alt') === '' && !/aria-hidden\s*=\s*["']true/i.test(t) && !/role\s*=\s*["']presentation/i.test(t));
  neu({ id: 'bild_alt_leer', schwere: 'gelb', titel: 'Bilder mit leerem Alternativtext', anzahl: leerAlt.length, beispiel: kurz(leerAlt[0] ?? ''), vorschlag: 'Nur für reine Deko-Bilder richtig. Zeigt das Bild Inhalt (Produkt, Arbeit, Team), kurz beschreiben.', wcag: '1.1.1' });

  // iframes
  const ifr = (koerper.match(/<iframe\b[^>]*>/gi) ?? []).filter((t) => !String(attr(t, 'title') ?? '').trim());
  neu({ id: 'iframe_titel', schwere: 'gelb', titel: 'Eingebettete Inhalte ohne Titel', anzahl: ifr.length, beispiel: kurz(ifr[0] ?? ''), vorschlag: 'title="Video" bzw. title="Karte" am iframe setzen.', wcag: '4.1.2' });

  // Formularfelder
  const felder = (koerper.match(/<(input|select|textarea)\b[^>]*>/gi) ?? []).filter((t) => {
    const typ = String(attr(t, 'type') ?? '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(typ)) return false;
    if (/aria-hidden\s*=\s*["']true/i.test(t)) return false;
    return true;
  });
  const ohneLabel = felder.filter((t) => {
    if (String(attr(t, 'aria-label') ?? '').trim() || attr(t, 'aria-labelledby') || String(attr(t, 'title') ?? '').trim()) return false;
    const id = attr(t, 'id');
    if (id && new RegExp('<label[^>]*for\\s*=\\s*["\']' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'i').test(koerper)) return false;
    // vom label umschlossen?
    const pos = koerper.indexOf(t);
    const davor = koerper.slice(Math.max(0, pos - 400), pos);
    const offen = davor.lastIndexOf('<label'); const zu = davor.lastIndexOf('</label>');
    if (offen > zu) return false;
    return true;
  });
  neu({ id: 'feld_label', schwere: 'rot', titel: 'Eingabefelder ohne zugeordnete Beschriftung', anzahl: ohneLabel.length, beispiel: kurz(ohneLabel[0] ?? ''), vorschlag: 'Beschriftung mit label for="…"/id verknüpfen oder aria-label setzen — ein Platzhalter reicht nicht.', wcag: '1.3.1 / 4.1.2' });

  // Knöpfe und Links ohne Namen
  const knoepfe = [...koerper.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].filter((m) => !textOhneTags(m[2]) && !/aria-label\s*=\s*["'][^"']+/i.test(m[1]) && !/title\s*=\s*["'][^"']+/i.test(m[1]));
  neu({ id: 'knopf_name', schwere: 'rot', titel: 'Knöpfe ohne erkennbaren Namen', anzahl: knoepfe.length, beispiel: kurz(knoepfe[0]?.[0] ?? ''), vorschlag: 'Sichtbaren Text oder aria-label ergänzen (z. B. aria-label="Menü öffnen").', wcag: '4.1.2' });
  const links = [...koerper.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const leer = links.filter((m) => !textOhneTags(m[2]) && !/aria-label\s*=\s*["'][^"']+/i.test(m[1]) && !/<img[^>]+alt\s*=\s*["'][^"']+/i.test(m[2]));
  neu({ id: 'link_name', schwere: 'rot', titel: 'Links ohne erkennbaren Namen', anzahl: leer.length, beispiel: kurz(leer[0]?.[0] ?? ''), vorschlag: 'Link-Text oder aria-label ergänzen.', wcag: '2.4.4' });
  const vage = links.filter((m) => /^(hier|mehr|klicken sie hier|hier klicken|weiter|link|mehr erfahren|details)$/i.test(textOhneTags(m[2])) && !/aria-label\s*=/i.test(m[1]));
  neu({ id: 'link_vage', schwere: 'gelb', titel: 'Nichtssagende Link-Texte', anzahl: vage.length, beispiel: kurz(vage[0]?.[0] ?? ''), vorschlag: 'Sagen, wohin der Link führt („Preisliste ansehen" statt „hier").', wcag: '2.4.4' });

  // Überschriften
  const hs = [...koerper.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ ebene: +m[1], text: textOhneTags(m[2]) }));
  const h1 = hs.filter((h) => h.ebene === 1).length;
  if (h1 === 0) neu({ id: 'h1_fehlt', schwere: 'gelb', titel: 'Keine Hauptüberschrift (h1)', anzahl: 1, beispiel: '', vorschlag: 'Einen Titelbereich oder Artikel mit Hauptüberschrift an den Anfang stellen.', wcag: '1.3.1 / 2.4.6' });
  if (h1 > 1) neu({ id: 'h1_mehrfach', schwere: 'gelb', titel: 'Mehrere Hauptüberschriften (h1)', anzahl: h1, beispiel: hs.filter((h) => h.ebene === 1).map((h) => h.text).slice(0, 3).join(' | '), vorschlag: 'Nur eine h1 je Seite — weitere als Zwischenüberschrift.', wcag: '1.3.1' });
  let sprung = 0; let bsp = '';
  for (let i = 1; i < hs.length; i++) if (hs[i].ebene > hs[i - 1].ebene + 1) { sprung++; bsp ||= `h${hs[i - 1].ebene} → h${hs[i].ebene} „${hs[i].text}"`; }
  neu({ id: 'h_sprung', schwere: 'gelb', titel: 'Übersprungene Überschriften-Ebenen', anzahl: sprung, beispiel: kurz(bsp), vorschlag: 'Ebenen der Reihe nach verwenden (h2 nach h1, h3 nach h2).', wcag: '1.3.1' });
  const leerH = hs.filter((h) => !h.text).length;
  neu({ id: 'h_leer', schwere: 'gelb', titel: 'Leere Überschriften', anzahl: leerH, beispiel: '', vorschlag: 'Leere Bausteine mit Überschrift füllen oder entfernen.', wcag: '1.3.1' });

  // Fokus unsichtbar gemacht
  const css = (html.match(/<style[\s\S]*?<\/style>/gi) ?? []).join('\n');
  // Nur melden, wenn der Rahmen weg ist UND nichts anderes den Fokus zeigt
  // (box-shadow/border in derselben Regel) und es keine :focus-visible-Regel gibt.
  const ohneFokus = [...css.replace(/<\/?style[^>]*>/gi, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /outline\s*:\s*(none|0)\b/i.test(m[2]) && !/box-shadow|border(-color)?\s*:/i.test(m[2]));
  if (ohneFokus.length && !/:focus-visible/i.test(css)) neu({ id: 'fokus', schwere: 'gelb', titel: 'Fokus-Rahmen wird ausgeblendet', anzahl: ohneFokus.length, beispiel: kurz(ohneFokus[0][0]), vorschlag: 'Einen sichtbaren Fokus (:focus-visible) für Tastatur-Nutzer vorsehen.', wcag: '2.4.7' });

  // Automatisch startende Medien
  const auto = (koerper.match(/<(video|audio)\b[^>]*\bautoplay\b[^>]*>/gi) ?? []).length;
  neu({ id: 'autoplay', schwere: 'gelb', titel: 'Medien starten automatisch', anzahl: auto, beispiel: '', vorschlag: 'Nicht automatisch abspielen oder Stopp-Knopf anbieten.', wcag: '1.4.2' });

  const rang = { rot: 0, gelb: 1 } as const;
  return befunde.sort((a, b) => rang[a.schwere] - rang[b.schwere]);
}

/** Was der Betrieb nach eigener Prüfung als erfüllt ankreuzen kann (nur Angekreuztes kommt in den Text). */
export const ERFUELLT_VORSCHLAEGE = [
  'Alle Funktionen sind mit der Tastatur bedienbar.',
  'Bilder mit Inhalt haben Textbeschreibungen.',
  'Formularfelder sind beschriftet, Fehlermeldungen sagen, was zu tun ist.',
  'Farben haben ausreichenden Kontrast (WCAG AA).',
  'Die Seite bleibt bei 200 % Vergrößerung lesbar.',
  'Videos haben Untertitel.',
];

/** Was eine Maschine nicht prüfen kann — gehört in jeden Bericht. */
export const HANDPRUEFUNG = [
  'Die ganze Seite nur mit der Tastatur bedienen (Tab, Enter, Esc): Kommt man überall hin, auch in den Warenkorb und durch die Bestellung?',
  'Ist immer sichtbar, wo man gerade ist (Fokus-Rahmen)?',
  'Mit dem Handy-Bildschirmleser (VoiceOver/TalkBack) eine Bestellung oder Buchung durchspielen.',
  'Seite auf 200 % vergrößern: Bleibt alles lesbar, ohne seitlich zu scrollen?',
  'Fehlermeldungen im Formular: Wird gesagt, WAS falsch ist und wie es richtig geht?',
  'Texte verständlich, Fachbegriffe erklärt, Videos mit Untertiteln.',
];

// ---------------------------------------------------------------------------
// Informationen zur Barrierefreiheit (Anlage 3 BFSG)
// ---------------------------------------------------------------------------

export function erklaerungText(o: {
  firma: string; anschrift?: string | null; email?: string | null; telefon?: string | null;
  leistung: string; stand: string; erfuellt: string[]; barrieren: string[];
}): string {
  const firma = o.firma.trim() || '[Name des Betriebs]';
  const kontakt = [o.anschrift, o.email ? `E-Mail: ${o.email}` : '', o.telefon ? `Telefon: ${o.telefon}` : ''].filter((x) => String(x ?? '').trim());
  const z: string[] = [];
  z.push(`Stand: ${o.stand}`);
  z.push('');
  z.push('## Unser Angebot');
  z.push(o.leistung.trim() || '[Kurze Beschreibung: Was bieten Sie auf dieser Website an, und wie läuft eine Bestellung oder Buchung ab?]');
  z.push('');
  z.push('## So nutzen Sie diese Website');
  z.push('- Die Darstellung vergrößern Sie in Ihrem Browser mit Strg und + (am Mac: Cmd und +), auf dem Handy mit zwei Fingern.');
  z.push('- Mit der Tabulator-Taste springen Sie von Link zu Link, mit Enter lösen Sie ihn aus.');
  z.push('- Brauchen Sie Hilfe bei einer Bestellung oder Buchung, erreichen Sie uns über die Angaben unten.');
  z.push('');
  z.push('## Wie wir die Anforderungen an die Barrierefreiheit erfüllen');
  z.push(`Wir richten diese Website nach dem Barrierefreiheitsstärkungsgesetz (BFSG) und orientieren uns an den Web Content Accessibility Guidelines (WCAG 2.1, Stufe AA) bzw. der Norm EN 301 549.`);
  for (const e of o.erfuellt.filter((x) => x.trim())) z.push(`- ${e.trim()}`);
  z.push('');
  z.push('## Bekannte Einschränkungen');
  const b = o.barrieren.filter((x) => x.trim());
  if (b.length) { for (const x of b) z.push(`- ${x.trim()}`); } else z.push('Derzeit sind uns keine Barrieren bekannt.');
  z.push('Wir arbeiten laufend daran, bestehende Barrieren zu beseitigen.');
  z.push('');
  z.push('## Barriere melden');
  z.push(`Wenn Ihnen eine Barriere auffällt oder Sie Informationen in einer anderen Form benötigen, melden Sie sich bitte bei ${firma}${kontakt.length ? ':' : '.'}`);
  for (const k of kontakt) z.push(`- ${k}`);
  z.push('');
  z.push('## Zuständige Marktüberwachungsbehörde');
  z.push(`${MLBF.name}, ${MLBF.anschrift}, E-Mail: ${MLBF.email}, ${MLBF.web}`);
  return z.join('\n');
}
