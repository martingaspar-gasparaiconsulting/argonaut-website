// ============================================================================
// ARGONAUT OS · lib/hwgWaechter.ts — HWG-Wächter (Paket PQ, H02)
//
// Prüft Werbetexte auf Stellen, die nach dem Heilmittelwerbegesetz (HWG)
// heikel sind. Reine Regeln, kein KI-Aufruf, 0 €, node-getestet
// (tests/praxisP91.test.mjs).
//
// Das HWG greift nur, wenn sich die Werbung auf Krankheiten, Leiden,
// Beschwerden, Arzneimittel, Medizinprodukte oder Schönheits-Eingriffe bezieht
// (§ 1 HWG). Deshalb zuerst: Hat der Text überhaupt Gesundheitsbezug? Ohne
// Bezug meldet der Wächter nichts — eine Friseur-Anzeige mit „Gutschein" ist
// kein HWG-Fall.
//
// Ergebnis sind HINWEISE mit Paragraf, Fundstelle und Vorschlag. Das ist
// keine Rechtsberatung; die Regeln stehen auf der Anwalt-Liste (R10).
// rot = so nicht veröffentlichen · gelb = nur mit Beleg bzw. prüfen.
// ============================================================================

export const HWG_STAND = '24.09.2026';

export type HwgTreffer = {
  id: string;
  paragraf: string;
  titel: string;
  schwere: 'rot' | 'gelb';
  stelle: string;
  erklaerung: string;
  vorschlag: string;
};

export type HwgErgebnis = {
  betroffen: boolean;
  ampel: 'gruen' | 'gelb' | 'rot';
  treffer: HwgTreffer[];
};

// Wörter, die einen Gesundheitsbezug herstellen (§ 1 HWG).
const BEZUG = new RegExp([
  'krankheit', 'erkrank', 'leiden\\b', 'beschwerden', 'schmerz', 'heil(?:t|en|ung|mittel|praktik)', 'geheilt', 'therapie', 'therapeut',
  'linder', 'symptom', 'diagnos', 'patient', 'arznei', 'medikament', 'medizinprodukt', 'nebenwirkung',
  'migräne', 'rücken', 'arthrose', 'rheuma', 'depression', 'burn-?out', 'allergi', 'neurodermitis', 'tinnitus', 'schlafstörung',
  'übergewicht', 'abnehm', 'diabetes', 'bluthochdruck', 'krebs', 'tumor', 'sucht', 'entzündung', 'infekt', 'immunsystem',
  'botox', 'hyaluron', 'unterspritz', 'faltenbehandlung', 'lifting', 'fettabsaug', 'liposuktion', 'schönheits-?op', 'brustvergrößer', 'nasenkorrektur', 'operation', 'eingriff',
].join('|'), 'i');

type Regel = { id: string; paragraf: string; titel: string; schwere: 'rot' | 'gelb'; muster: RegExp; ausser?: RegExp; ohneTreffer?: RegExp; nurMit?: RegExp; erklaerung: string; vorschlag: string };

const EINGRIFF = /(operation|\bop\b|eingriff|unterspritz|botox|hyaluron|filler|lifting|fettabsaug|liposuktion|brustvergrößer|nasenkorrektur|lidstraffung|schönheits-?op)/i;

const REGELN: Regel[] = [
  {
    id: 'heilversprechen', paragraf: '§ 3 Satz 2 Nr. 2 a HWG', titel: 'Erfolg als sicher dargestellt', schwere: 'rot',
    muster: /\b(heilt\b|heilen\s+(?:sie|ihre|jede|dauerhaft|endgültig)|endgültig\s+geheilt|erfolg\s+garantiert|garantiert(?:e[nrs]?)?\s+(?:erfolg|heilung|wirkung|ergebnis|schmerzfrei|beschwerdefrei)|100\s?%\s*(?:wirksam|erfolg|schmerzfrei|beschwerdefrei)|wirkt\s+(?:immer|garantiert|bei\s+jedem)|sicherer?\s+(?:erfolg|heilung)|nie\s+wieder\s+(?:schmerzen|beschwerden|rückenschmerzen|migräne))/i,
    erklaerung: 'Werbung darf nicht den Eindruck erwecken, dass ein Erfolg mit Sicherheit eintritt.',
    vorschlag: 'Vorsichtig formulieren: „kann helfen", „viele Kundinnen und Kunden berichten …" — ohne Heilversprechen.',
  },
  {
    id: 'nebenwirkungsfrei', paragraf: '§ 3 Satz 2 Nr. 2 b HWG', titel: '„Keine Nebenwirkungen" / „völlig harmlos"', schwere: 'rot',
    muster: /\b(ohne\s+(?:jede\s+)?(?:neben|schädlich\w*\s+)?wirkungen|keine(?:rlei)?\s+nebenwirkungen|nebenwirkungsfrei|völlig\s+(?:unbedenklich|harmlos|risikolos|ungefährlich)|risikofrei|frei\s+von\s+risiken)/i,
    erklaerung: 'Es darf nicht behauptet werden, dass bei bestimmungsgemäßem Gebrauch keine schädlichen Wirkungen eintreten.',
    vorschlag: 'Streichen oder sachlich über mögliche Risiken aufklären („Wir beraten Sie vorab ausführlich").',
  },
  {
    id: 'vorher_nachher_eingriff', paragraf: '§ 11 Abs. 1 Satz 3 Nr. 1 HWG', titel: 'Vorher-Nachher bei Schönheits-Eingriffen', schwere: 'rot',
    muster: /(vorher[\s\-–/]*(?:und\s+|&\s*)?nachher|before\s*[&/]?\s*after|vorher-nachher)/i, nurMit: EINGRIFF,
    erklaerung: 'Für operative plastisch-chirurgische Eingriffe darf nicht mit einem Vergleich des Körperzustands vor und nach dem Eingriff geworben werden. Nach der Rechtsprechung kann das auch Unterspritzungen (z. B. Hyaluron) betreffen.',
    vorschlag: 'Keine Vorher-Nachher-Bilder oder -Beschreibungen zu Eingriffen verwenden — stattdessen Ablauf und Beratung beschreiben.',
  },
  {
    id: 'vorher_nachher', paragraf: '§ 11 Abs. 1 Nr. 5 HWG', titel: 'Vorher-Nachher-Darstellung', schwere: 'gelb',
    muster: /(vorher[\s\-–/]*(?:und\s+|&\s*)?nachher|before\s*[&/]?\s*after|vorher-nachher)/i, ausser: EINGRIFF,
    erklaerung: 'Bildliche Darstellungen von Veränderungen des Körpers durch Krankheit oder Behandlung sind unzulässig, wenn sie missbräuchlich, abstoßend oder irreführend sind.',
    vorschlag: 'Nur echte, unbearbeitete Bilder mit Einwilligung (Einwilligung „Fotos für Werbung") — im Zweifel weglassen.',
  },
  {
    id: 'angst', paragraf: '§ 11 Abs. 1 Nr. 7 HWG', titel: 'Angst erzeugen', schwere: 'gelb',
    muster: /(sonst\s+drohen|drohen\s+(?:schwere|ernste|bleibende)|gefährliche\s+folgen|lebensgefahr|bevor\s+es\s+zu\s+spät|wenn\s+sie\s+jetzt\s+nicht\s+handeln|ernsthaft\s+krank\s+werden|chronisch\s+werden\s+kann)/i,
    erklaerung: 'Werbung darf nicht Angstgefühle hervorrufen oder ausnutzen.',
    vorschlag: 'Sachlich und positiv formulieren — was die Behandlung bietet, nicht was ohne sie droht.',
  },
  {
    id: 'erfahrungsberichte', paragraf: '§ 11 Abs. 1 Nr. 11 HWG', titel: 'Äußerungen Dritter / Heilerfolgs-Berichte', schwere: 'gelb',
    muster: /(hat\s+mir\s+(?:sofort\s+|so\s+sehr\s+)?geholfen|meine\s+(?:schmerzen|beschwerden|migräne)\s+(?:sind|ist)\s+(?:weg|verschwunden)|seit\s+der\s+behandlung\s+(?:bin|habe)\s+ich|dankschreiben|patienten\s+berichten|erfahrungsbericht|kundenstimmen?\b)/i,
    erklaerung: 'Äußerungen Dritter (Dankschreiben, Erfahrungsberichte) sind unzulässig, wenn sie missbräuchlich, abstoßend oder irreführend sind — Heilerfolgs-Berichte sind besonders heikel.',
    vorschlag: 'Nur echte Stimmen mit Einwilligung, ohne Heilerfolg („Ich habe mich gut aufgehoben gefühlt" statt „Meine Schmerzen sind weg").',
  },
  {
    id: 'gewinnspiel', paragraf: '§ 11 Abs. 1 Nr. 13 HWG', titel: 'Gewinnspiel / Verlosung', schwere: 'gelb',
    muster: /(gewinnspiel|verlosung|verlosen|preisausschreiben|zu\s+gewinnen|gewinnen\s+sie)/i,
    erklaerung: 'Gewinnspiele sind im Gesundheitsbereich eingeschränkt — unzulässig, wenn sie einer unzweckmäßigen oder übermäßigen Anwendung Vorschub leisten; bei Schönheits-Eingriffen ganz zu vermeiden.',
    vorschlag: 'Keine Behandlung als Gewinn ausloben. Wenn überhaupt: ein neutraler Preis ohne Gesundheitsbezug.',
  },
  {
    id: 'werbegaben', paragraf: '§ 7 HWG', titel: 'Geschenke, Rabatte, Gratis-Leistungen', schwere: 'gelb',
    muster: /(gratis|kostenlose?[nrs]?\s+(?:behandlung|probebehandlung|anwendung|sitzung|erstbehandlung)|geschenkt|\d+\s?%\s*(?:rabatt|nachlass|günstiger)|2\s*(?:für|zum\s+preis\s+von)\s*1|gratis-?zugabe|gutschein\s+(?:über|im\s+wert))/i,
    erklaerung: 'Zuwendungen und Werbegaben sind bei Heilmittelwerbung nur in engen Grenzen erlaubt (geringwertige Kleinigkeiten, bestimmte Rabatte).',
    vorschlag: 'Rabatte und Gratis-Angebote vorher prüfen lassen; eine kostenlose Beratung ist meist unkritischer als eine kostenlose Behandlung.',
  },
  {
    id: 'fernbehandlung', paragraf: '§ 9 HWG', titel: 'Fernbehandlung', schwere: 'gelb',
    muster: /((?:online|video|telefon|fern)[\s-]?(?:behandlung|diagnose|therapie|sprechstunde)|diagnose\s+(?:per|über)\s+(?:foto|bild|chat|whatsapp|e-?mail)|behandlung\s+(?:per|über)\s+(?:video|telefon|chat))/i,
    erklaerung: 'Werbung für Fernbehandlung ist nur zulässig, wenn nach anerkannten fachlichen Standards kein persönlicher Kontakt nötig ist.',
    vorschlag: 'Online nur für Beratung und Terminvereinbarung werben, nicht für Erkennung oder Behandlung.',
  },
  {
    id: 'anlage_krankheiten', paragraf: '§ 12 HWG mit Anlage', titel: 'Krankheiten, für die nicht geworben werden darf', schwere: 'rot',
    muster: /\b(krebs\w*|tumor\w*|suchterkrank\w*|suchtkrank\w*|(?:alkohol|drogen|medikamenten|spiel|nikotin)sucht|(?:alkohol|drogen|medikamenten|nikotin)abhängig\w*|hiv|aids|hepatitis|tuberkulose|meldepflichtige?\s+krankheit\w*|schwangerschaftskomplikation\w*)\b/i,
    // Nikotinabhaengigkeit ist in der Anlage ausdruecklich ausgenommen — nur DIESE Fundstelle
    // ueberspringen, nicht den ganzen Text (sonst verschwaende „Rauchstopp und Krebs").
    ohneTreffer: /nikotin/i,
    erklaerung: 'Werbung außerhalb der Fachkreise darf sich nicht auf die Erkennung, Verhütung, Beseitigung oder Linderung der in der Anlage zum HWG genannten Krankheiten beziehen (u. a. Krebs, Suchtkrankheiten außer Nikotin, meldepflichtige Infektionen, Schwangerschaftskomplikationen).',
    vorschlag: 'Diese Krankheiten in Werbung nicht nennen — auch nicht als „begleitende" Behandlung.',
  },
  {
    id: 'fachempfehlung', paragraf: '§ 3 HWG / § 11 Abs. 1 Nr. 2 HWG', titel: 'Empfehlung durch Ärzte oder Studien', schwere: 'gelb',
    muster: /((?:von\s+)?ärzt(?:en|lich)\s+(?:empfohlen|getestet|bestätigt)|dermatologisch\s+(?:empfohlen|getestet)|experten\s+empfehlen|klinisch\s+(?:getestet|bewiesen|belegt)|wissenschaftlich\s+(?:bewiesen|belegt|nachgewiesen)|studien\s+(?:zeigen|beweisen|belegen))/i,
    erklaerung: 'Hinweise auf Empfehlungen von Fachleuten oder auf Studien müssen belegbar sein und dürfen bei Arzneimitteln außerhalb der Fachkreise nicht verwendet werden.',
    vorschlag: 'Nur mit konkretem, vorzeigbarem Beleg — sonst streichen.',
  },
  {
    id: 'wunder', paragraf: '§ 3 Satz 2 Nr. 1 HWG', titel: 'Übertriebene Wirkung', schwere: 'gelb',
    muster: /\b(wunder(?:mittel|heilung|kur|waffe)|revolutionär\w*|sensationell\w*|einzigartig\s+wirksam|hilft\s+(?:gegen\s+)?(?:alles|jede\w*))\b/i,
    erklaerung: 'Einer Behandlung darf keine Wirkung beigelegt werden, die sie nicht nachweislich hat.',
    vorschlag: 'Konkret und belegbar beschreiben, was die Behandlung ist und wie sie abläuft.',
  },
  {
    id: 'titel', paragraf: '§ 3 HWG, § 5 UWG', titel: 'Berufsbezeichnung / Titel', schwere: 'gelb',
    muster: /\b(dr\.\s?med\.?|facharzt|fachärztin|arztpraxis|ärztin\b|\barzt\b)/i,
    erklaerung: 'Arzt-Bezeichnungen und Titel dürfen nur verwendet werden, wenn sie tatsächlich zutreffen — sonst ist die Werbung irreführend.',
    vorschlag: 'Nur die eigene, tatsächliche Berufsbezeichnung verwenden (z. B. „Heilpraktikerin", „Physiotherapeut").',
  },
];

function fundstelle(text: string, m: RegExpExecArray): string {
  const von = Math.max(0, m.index - 40);
  const bis = Math.min(text.length, m.index + m[0].length + 40);
  return (von > 0 ? '…' : '') + text.slice(von, bis).replace(/\s+/g, ' ').trim() + (bis < text.length ? '…' : '');
}

/** Hat der Text Gesundheitsbezug im Sinne von § 1 HWG? */
export function gesundheitsBezug(text: string): boolean {
  return BEZUG.test(String(text || ''));
}

/** Prüft einen Werbetext. Ohne Gesundheitsbezug: grün, keine Treffer. */
export function pruefeHwg(text: string): HwgErgebnis {
  const t = String(text || '');
  if (!t.trim() || !gesundheitsBezug(t)) return { betroffen: false, ampel: 'gruen', treffer: [] };
  const treffer: HwgTreffer[] = [];
  for (const r of REGELN) {
    if (r.nurMit && !r.nurMit.test(t)) continue;
    if (r.ausser && r.ausser.test(t)) continue;
    const re = new RegExp(r.muster.source, r.muster.flags.includes('g') ? r.muster.flags : r.muster.flags + 'g');
    let m: RegExpExecArray | null = re.exec(t);
    while (m && r.ohneTreffer && r.ohneTreffer.test(m[0])) m = re.exec(t);
    if (!m) continue;
    treffer.push({ id: r.id, paragraf: r.paragraf, titel: r.titel, schwere: r.schwere, stelle: fundstelle(t, m), erklaerung: r.erklaerung, vorschlag: r.vorschlag });
  }
  treffer.sort((a, b) => (a.schwere === b.schwere ? 0 : a.schwere === 'rot' ? -1 : 1));
  const ampel = treffer.some((x) => x.schwere === 'rot') ? 'rot' : treffer.length ? 'gelb' : 'gruen';
  return { betroffen: true, ampel, treffer };
}

/** Kurzform für bestehende Hinweislisten (z. B. Text-Werkstatt). */
export function hwgHinweise(text: string): string[] {
  const e = pruefeHwg(text);
  return e.treffer.map((x) => `${x.schwere === 'rot' ? '⛔' : '⚠'} Heilmittelwerbegesetz (${x.paragraf}): ${x.titel} — „${x.stelle}". ${x.vorschlag}`);
}
