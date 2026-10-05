// ============================================================================
// ARGONAUT OS · lib/fachdossier.ts — Paket 214 (05.10.2026) · Stufe 3 B11a
// Fachdossier-Generator für alle 698 Branchen (nach dem Elektro-Richtwert)
//
// RICHTWERT: das Elektro-Dossier vom 30.09.2026 (11 Seiten). Grundsätze, die
// hier fest eingebaut sind:
//  · Nur Gebautes. Die Modul-Listen kommen aus lib/pakete (KERN_MODULE) und
//    lib/branchenkatalog (KATEGORIE_MODULE) — genau das, was ein Betrieb der
//    Kategorie freigeschaltet bekommt. Module „in Aufbau" stehen NICHT in der
//    Liste, sondern unter „Was wir gerade noch bauen – und warum".
//  · Jede Branche individuell: Branchentexte (Alltag, Ablauf eines Auftrags,
//    Schwerpunkte) kommen aus FACH_TEXTE. Fehlt dort ein geprüfter Text,
//    bleibt das Dossier ein ENTWURF (Wasserzeichen, Liste der Lücken).
//    B11b (nach der Abnahme durch den Anwalt) füllt die Texte je Branche.
//  · Kein Mitbewerber-Name, Agenturkosten immer „10.000–35.000 €",
//    „Bausteine" statt „KI-Agenten", Kundenansprache mit „Sie".
//
// Rein, ohne Datenbank — node-testbar. HTML baut lib/fachdossierHtml.ts.
// ============================================================================

import { KERN_MODULE } from './pakete';
import { KATEGORIE_MODULE, STANDARD_AUTOMATION } from './branchenkatalog';
import { NAV_LINKS } from './rechte';

export const FACHDOSSIER_VERSION = 'fd1';
export const AGENTUR_KOSTEN = '10.000–35.000 €';
export const BASIS_URL = 'https://argonaut-os.com';

/** Kern-Module, die noch „in Aufbau" sind — erscheinen nie als fertig. */
export const IN_AUFBAU_MODULE = new Set<string>(['marktplaetze', 'mail-sync']);

/** Anzeigenamen, wo das Menü-Wort für ein Dossier nicht passt. */
const NAMEN: Record<string, string> = {
  crm: 'CRM und Kundenakte', kundenakte: 'Kundenakte', leads: 'Anfragen', pipeline: 'Verkaufschancen',
  banking: 'Bank-Abgleich', elster: 'Umsatzsteuer-Werte', datev: 'DATEV-Export und E-Rechnung',
  einsaetze: 'Einsatzplanung', erp: 'Artikel und Lager', gobd: 'GoBD-Archiv', reports: 'Auswertungen',
  'zeit-nachweis': 'Arbeitszeit-Nachweis', signaturen: 'Digitale Unterschrift', marketing: 'Marketing und Newsletter',
  objekte: 'Objekt-Register', wiederkehr: 'Wiedervorlagen', kundenportal: 'Kundenportal', service: 'Service-Tickets',
  personal: 'Personalakte', anlagen: 'Anlagen und AfA', euer: 'EÜR', [STANDARD_AUTOMATION]: 'Automatisierungen',
};

/** Gruppen der Grundausstattung (wie Seite 10 im Elektro-Dossier). */
export const KERN_GRUPPEN: { titel: string; module: string[] }[] = [
  { titel: 'Kunden und Vertrieb', module: ['leads', 'crm', 'kundenakte', 'pipeline', 'angebote', 'auftraege', 'kundenportal', 'online-buchung', 'termine', 'erinnerungen', 'korrespondenz', 'vertraege', 'provisionen'] },
  { titel: 'Geld und Steuer', module: ['rechnungen', 'mahnwesen', 'zahlungen', 'banking', 'datev', 'euer', 'elster', 'finanzen', 'anlagen', 'reisekosten', 'controlling', 'gobd'] },
  { titel: 'Einsatz und Projekte', module: ['einsaetze', 'projekte', 'service', 'objekte', 'wiederkehr', 'aufwand'] },
  { titel: 'Lager und Einkauf', module: ['erp', 'einkauf', 'lager-scanner', 'versand', 'import'] },
  { titel: 'Team', module: ['personal', 'zeit-nachweis', 'schichtplan', 'team-chat', 'signaturen', 'academy'] },
  { titel: 'Sichtbarkeit', module: ['marketing', 'bewertungen', 'reports', 'analytics'] },
  { titel: 'Sicherheit und Recht', module: ['nachweise', 'compliance', 'dsgvo', 'dokumente', 'aktivitaet'] },
];

/** Was gerade noch gebaut wird — mit Grund. `wenn`: nur zeigen, wenn eines dieser Module im Dossier vorkommt. */
export type Vorbereitung = { was: string; heute: string; warum: string; wenn?: string[] };
export const IN_VORBEREITUNG: Vorbereitung[] = [
  { was: 'Bankumsätze automatisch abrufen', heute: 'Kontoauszug als Datei (CSV, CAMT, MT940) einlesen, Zahlungen werden zugeordnet', warum: 'Der direkte Abruf läuft über einen zugelassenen Bank-Partner mit BaFin-Lizenz. Der Partner ist ausgewählt, die Anbindung wird getestet.' },
  { was: 'DATEV und ELSTER direkt', heute: 'DATEV-Export als Datei, Werte für die Umsatzsteuer-Voranmeldung', warum: 'Die direkte Übergabe braucht Zertifizierungen der Schnittstellen von DATEV und Finanzverwaltung. Die Anträge sind in Vorbereitung.' },
  { was: 'Direkte Verbindung zum Großhändler', heute: 'DATANORM- und BMEcat-Dateien einlesen', warum: 'Jeder Großhändler vergibt eigene Zugänge und Schnittstellen. Wir binden die Häuser nach und nach an, beginnend mit denen unserer Kunden.', wenn: ['einkauf', 'erp'] },
  { was: 'Kasse mit zertifizierter TSE', heute: 'Kasse im Probebetrieb', warum: 'Für den echten Kassenbetrieb braucht es eine zertifizierte technische Sicherheitseinrichtung (TSE) über einen Partner. Der Vertrag ist in Vorbereitung.', wenn: ['kasse'] },
  { was: 'Marktplätze und Mail-Kalender-Abgleich', heute: 'Verbindung einrichten, Abgleich in Aufbau', warum: 'Jede Plattform hat eigene Freigaben und Prüfungen für Fremd-Programme. Wir schalten sie erst frei, wenn der Abgleich zuverlässig läuft.' },
  { was: 'Anmeldung bei Werbe- und Social-Plattformen per Login', heute: 'Zugangsdaten werden von Hand hinterlegt', warum: 'Die Plattformen prüfen jede App vor der Freigabe. Die Prüfungen sind beantragt.', wenn: ['marketing'] },
];

/** Geprüfte Branchentexte. Ohne Eintrag bleibt das Dossier ein Entwurf (B11b füllt). */
export type FachText = {
  titel: string;            // „Ihr Elektrobetrieb."
  lead: string;             // Unterzeile der Titelseite
  vorteile: string[];       // 6 Kacheln der Titelseite
  rolle: string;            // „Sie sind Elektromeister. Nicht Sachbearbeiter."
  alltag: { titel: string; text: string }[];
  ablaufTitel: string;      // Beispiel-Auftrag
  ablauf: { titel: string; text: string }[];
  schwerpunkt?: { titel: string; text: string; punkte: { titel: string; text: string }[] };
  zielgruppe: string;       // „Elektrobetriebe" (für „Fachdossier für …")
  geprueftAm: string;       // ISO-Datum der Prüfung
};

export const FACH_TEXTE: Record<string, FachText> = {
  elektriker: {
    zielgruppe: 'Elektrobetriebe',
    titel: 'Ihr Elektrobetrieb. Ein System.',
    lead: 'Vom ersten Anruf bis zur nächsten DGUV-V3-Prüfung in zwölf Monaten: Anfrage, Angebot, Einsatz, Prüfprotokoll, Rechnung und Zahlung laufen in einer Software zusammen.',
    vorteile: ['Angebote, die Kunden online annehmen', 'Einsatzplanung mit Monteur-Handy', 'E-Check mit Wiedervorlage', 'E-Rechnung nach XRechnung und ZUGFeRD', 'DATANORM-Kataloge Ihres Großhändlers', 'Rechenzentren in der EU'],
    rolle: 'Sie sind Elektromeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Angebote am Abend', text: 'Das Aufmaß steht auf dem Block, die Preise in der Großhändler-Liste, das Angebot entsteht nach Feierabend. Und dann hört man vom Kunden nichts mehr.' },
      { titel: 'Wer ist wo?', text: 'Die Wochenplanung hängt an der Wand oder im Kopf. Fällt ein Monteur aus, beginnt das Telefonieren. Die Frage, wer überhaupt die nötige Befähigung hat, kommt oft erst hinterher.' },
      { titel: 'Prüffristen im Blick behalten', text: 'Die DGUV-V3-Prüfung beim Gewerbekunden ist wiederkehrender Umsatz. Aber nur, wenn jemand rechtzeitig daran denkt, bevor der Kunde selbst sucht.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Zehn Programme', text: 'Kalkulation, Kalender, Zeiterfassung, Buchhaltung, Webseite, Mail. Jedes mit eigenem Login, eigener Rechnung und eigener Liste Ihrer Kunden.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Gewerbekunde möchte seine elektrischen Anlagen prüfen lassen.',
    ablauf: [
      { titel: 'Die Anfrage kommt über Ihre Webseite', text: 'Das Kontaktformular legt sie automatisch in Ihrer Kundenliste an. Eine Ampel zeigt, wie lange sie schon wartet.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Positionen kommen aus Ihrem Leistungskatalog. Der Kunde klickt auf „Annehmen", Sie sehen es sofort.' },
      { titel: 'Der Einsatz landet auf dem Handy des Monteurs', text: 'Mit Adresse, Route und Prüfvorlage. Vor Ort hakt er die Prüfpunkte ab, trägt Messwerte ein, macht Fotos und lässt den Kunden auf dem Bildschirm unterschreiben.' },
      { titel: 'Die Rechnung entsteht aus dem Einsatz', text: 'Als E-Rechnung per Mail. Beim Einlesen des Kontoauszugs ordnet das System die Zahlung der Rechnung zu.' },
      { titel: 'Die nächste Prüfung steht schon im Kalender', text: 'Der Wartungsvertrag erinnert Sie 30 Tage vor Fälligkeit. Der Folgeauftrag beginnt, bevor der Kunde daran denkt.' },
    ],
    schwerpunkt: {
      titel: 'Aus jeder Prüfung wird der nächste Auftrag.',
      text: 'Die Wiederholungsprüfung nach DGUV Vorschrift 3 ist planbarer Umsatz. ARGONAUT OS sorgt dafür, dass keine Frist mehr durchrutscht.',
      punkte: [
        { titel: 'Prüfvorlagen für Elektro', text: 'E-Check ortsveränderlicher Geräte nach DIN VDE 0701-0702, ortsfeste Anlagen nach DIN VDE 0105 und Erstprüfung nach DIN VDE 0100-600 — mit Zahlenfeldern für Messwerte und Grenzwerten als Startwert.' },
        { titel: 'Protokoll direkt vor Ort', text: 'Jeder Prüfpunkt als „in Ordnung" oder „Mangel". Liegt ein Messwert außerhalb der Grenze, wird er als Mangel markiert. Das Protokoll gibt es als PDF.' },
        { titel: 'Wartungsverträge mit Erinnerung', text: 'Die Vorlage „DGUV V3 Prüfung (E-Check)" erinnert 30 Tage vorher. Aus der Wartung werden Protokoll und Rechnung per Klick.' },
        { titel: 'Anlagen des Kunden im Verzeichnis', text: 'Jedes Objekt mit Zustand und Fälligkeit. Protokolle und Wartungen hängen direkt daran.' },
      ],
    },
    geprueftAm: '2026-09-30',
  },
};

// ---------------------------------------------------------------------------

export type DossierBranche = { slug: string; name: string; kategorie: string };

export type Modul = { key: string; name: string };
export type Dossier = {
  version: string;
  slug: string;
  name: string;
  kategorie: string;
  zielgruppe: string;
  text: FachText | null;
  entwurf: boolean;
  luecken: string[];
  kern: { titel: string; module: Modul[] }[];
  paket: Modul[];
  vorbereitung: Vorbereitung[];
  qrUrl: string;
  stand: string;
  agenturKosten: string;
};

let _labels: Record<string, string> | null = null;
function labels(): Record<string, string> {
  if (_labels) return _labels;
  const m: Record<string, string> = {};
  for (const l of NAV_LINKS as { modul?: string; label: string }[]) {
    if (l.modul && !m[l.modul]) m[l.modul] = l.label;
  }
  _labels = m;
  return m;
}

/** Emoji und Zierzeichen vor dem Menü-Namen entfernen. */
export function ohneEmoji(s: string): string {
  return String(s ?? '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
}

export function modulName(key: string): string {
  return NAMEN[key] ?? (ohneEmoji(labels()[key] ?? '') || key);
}

/** Monat und Jahr, z. B. „Oktober 2026". */
export function standText(d: Date): string {
  const m = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${m[d.getMonth()]} ${d.getFullYear()}`;
}

/** Zielgruppe aus dem Branchennamen: „Elektriker & Elektrobetriebe" → „Elektriker & Elektrobetriebe". */
export function zielgruppeAus(name: string): string {
  return String(name ?? '').trim() || 'Ihren Betrieb';
}

export function baueDossier(b: DossierBranche, jetzt: Date = new Date()): Dossier {
  const text = FACH_TEXTE[b.slug] ?? null;
  const kernSet = new Set(KERN_MODULE.filter((k) => !IN_AUFBAU_MODULE.has(k)));
  const kern = KERN_GRUPPEN.map((g) => ({
    titel: g.titel,
    module: g.module.filter((k) => kernSet.has(k)).map((key) => ({ key, name: modulName(key) })),
  })).filter((g) => g.module.length > 0);
  const inGruppen = new Set(KERN_GRUPPEN.flatMap((g) => g.module));
  const rest = [...kernSet].filter((k) => !inGruppen.has(k));
  if (rest.length) kern.push({ titel: 'Weitere', module: rest.map((key) => ({ key, name: modulName(key) })) });
  kern.find((g) => g.titel === 'Sicherheit und Recht')?.module.push({ key: STANDARD_AUTOMATION, name: modulName(STANDARD_AUTOMATION) });

  const paketKeys = [...new Set(KATEGORIE_MODULE[b.kategorie] ?? [])].filter((k) => !KERN_MODULE.includes(k) && !IN_AUFBAU_MODULE.has(k));
  const paket = paketKeys.map((key) => ({ key, name: modulName(key) }));

  const alle = new Set<string>([...KERN_MODULE, ...paketKeys]);
  const vorbereitung = IN_VORBEREITUNG.filter((v) => !v.wenn || v.wenn.some((k) => alle.has(k)));

  const luecken: string[] = [];
  if (!text) luecken.push('Branchentexte (Alltag, Ablauf eines Auftrags, Schwerpunkt) fehlen — B11b');
  if (!KATEGORIE_MODULE[b.kategorie]) luecken.push(`Kategorie „${b.kategorie}" hat kein Branchenpaket`);

  return {
    version: FACHDOSSIER_VERSION,
    slug: b.slug, name: b.name, kategorie: b.kategorie,
    zielgruppe: text?.zielgruppe ?? zielgruppeAus(b.name),
    text, entwurf: luecken.length > 0, luecken,
    kern, paket, vorbereitung,
    qrUrl: `${BASIS_URL}/branchen/${encodeURIComponent(b.slug)}`,
    stand: standText(jetzt),
    agenturKosten: AGENTUR_KOSTEN,
  };
}

/** Übersicht für das Command Center: wie viele Dossiers sind vollständig? */
export function dossierStand(branchen: DossierBranche[]): { gesamt: number; fertig: number; entwurf: number; jeKategorie: Record<string, { gesamt: number; fertig: number }> } {
  const jeKategorie: Record<string, { gesamt: number; fertig: number }> = {};
  let fertig = 0;
  for (const b of branchen) {
    const k = (jeKategorie[b.kategorie] ??= { gesamt: 0, fertig: 0 });
    k.gesamt++;
    if (FACH_TEXTE[b.slug] && KATEGORIE_MODULE[b.kategorie]) { k.fertig++; fertig++; }
  }
  return { gesamt: branchen.length, fertig, entwurf: branchen.length - fertig, jeKategorie };
}

/** Verbotene Wörter in Dossier-Texten (Vertriebsregeln). */
export const VERBOTEN = [/KI-Agent/i, /KI-Crew/i, /\bdu\b/i, /\bdein/i, /\bdir\b/i, /\bdich\b/i];
export function textVerstoesse(t: string): string[] {
  return VERBOTEN.filter((r) => r.test(t)).map((r) => r.source);
}
