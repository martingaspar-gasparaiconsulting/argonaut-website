// ============================================================================
// ARGONAUT OS · lib/ablaufVorlagen.ts — Vorlagen-Galerie der Abläufe (Paket 158)
//
// Fertige Ketten je Branchengruppe (dieselben Gruppen wie beim Umzug). Jede
// Vorlage nutzt nur Bausteine, die der Motor heute ausführt, und ist sofort
// einschaltbar (Test). Übernommen wird immer eine KOPIE, die ausgeschaltet
// startet. Texte an Kunden stehen in der Sie-Form.
// Gesundheit/Tier: bewusst nur Betriebspost (Rechnung, Zahlung) — keine
// Rückhol-Werbung (Heilmittelwerbegesetz, Anwalt-Liste R10/R23).
// ============================================================================

import type { Ablauf } from './ablauf';

export type BranchenGruppe =
  | 'alle' | 'handwerk' | 'handel' | 'lebensmittel' | 'gastro' | 'gesundheit' | 'tier'
  | 'beratung' | 'immobilien' | 'landwirtschaft' | 'verein';

export const GRUPPEN: { key: BranchenGruppe; label: string }[] = [
  { key: 'alle', label: 'Alle Branchen' },
  { key: 'handwerk', label: 'Handwerk & Bau' },
  { key: 'handel', label: 'Handel' },
  { key: 'lebensmittel', label: 'Lebensmittel' },
  { key: 'gastro', label: 'Gastro & Hotel' },
  { key: 'gesundheit', label: 'Gesundheit' },
  { key: 'tier', label: 'Tier' },
  { key: 'beratung', label: 'Beratung & Planung' },
  { key: 'immobilien', label: 'Immobilien' },
  { key: 'landwirtschaft', label: 'Landwirtschaft' },
  { key: 'verein', label: 'Bildung & Vereine' },
];

export type AblaufVorlage = {
  key: string;
  name: string;
  beschreibung: string;
  gruppen: BranchenGruppe[];
  ablauf: Pick<Ablauf, 'name' | 'beschreibung' | 'ausloeser' | 'schritte'>;
};

const GRUSS = '\n\nFreundliche Grüße';

export const ABLAUF_VORLAGEN: AblaufVorlage[] = [
  {
    key: 'mahnlauf',
    name: 'Mahnlauf in Stufen',
    beschreibung: 'Erinnerung nach 3 Tagen, nach einer Woche — mit Ihrer Freigabe — Mahnstufe und Mahnung, danach Anruf-Aufgabe. Endet von selbst, sobald bezahlt ist.',
    gruppen: ['alle', 'handwerk', 'handel', 'lebensmittel', 'gastro', 'gesundheit', 'tier', 'beratung', 'immobilien', 'landwirtschaft', 'verein'],
    ablauf: {
      name: 'Mahnlauf in Stufen',
      beschreibung: 'Zahlungserinnerung, Mahnung mit Freigabe, Anruf',
      ausloeser: { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 3, filter: { verknuepfung: 'und', regeln: [{ feld: 'mahnstufe', operator: 'gleich', wert: 0 }] } },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Zahlungserinnerung zu Rechnung {{nummer}}', text: 'Guten Tag {{name}},\n\nunsere Rechnung {{nummer}} über {{betrag}} war am {{datum}} fällig. Vermutlich ist das im Alltag untergegangen — wir bitten Sie um Ausgleich.\n\nSollten Sie bereits gezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.' + GRUSS } },
        { id: 's2', typ: 'warten', tage: 7 },
        { id: 's3', typ: 'aktion', aktion: 'freigabe_chef', config: {} },
        { id: 's4', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: { hoechste_stufe: 3 } },
        { id: 's5', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Mahnung zu Rechnung {{nummer}}', text: 'Guten Tag {{name}},\n\ntrotz unserer Erinnerung ist die Rechnung {{nummer}} über {{betrag}} noch offen. Bitte überweisen Sie den Betrag innerhalb von 7 Tagen.' + GRUSS } },
        { id: 's6', typ: 'warten', tage: 7 },
        { id: 's7', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Kunde anrufen: Rechnung {{nummer}} ({{name}})', prioritaet: 'hoch', faellig_in_tagen: 1 } },
      ],
    },
  },
  {
    key: 'dank_zahlung',
    name: 'Danke nach der Zahlung',
    beschreibung: 'Einen Tag nach dem Zahlungseingang ein kurzes Dankeschön. Bei größeren Beträgen zusätzlich eine Aufgabe, persönlich nachzufragen.',
    gruppen: ['alle', 'handwerk', 'handel', 'beratung', 'immobilien', 'landwirtschaft', 'gesundheit', 'tier'],
    ablauf: {
      name: 'Danke nach der Zahlung',
      beschreibung: 'Dankeschön-Mail, bei großen Aufträgen Nachfrage',
      ausloeser: { art: 'datum', trigger: 'rechnung_bezahlt', tage: 1, filter: null },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Vielen Dank für Ihre Zahlung', text: 'Guten Tag {{name}},\n\nvielen Dank — Ihre Zahlung zu Rechnung {{nummer}} ist bei uns eingegangen.' + GRUSS } },
        {
          id: 's2', typ: 'wenn',
          bedingung: { verknuepfung: 'und', regeln: [{ feld: 'brutto_summe', operator: 'groesser_gleich', wert: 1000 }] },
          dann: [{ id: 's3', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Persönlich nachfragen: Zufrieden mit {{nummer}}? ({{name}})', prioritaet: 'normal', faellig_in_tagen: 3 } }],
          sonst: [],
        },
      ],
    },
  },
  {
    key: 'angebot_nachfassen',
    name: 'Angebot nachfassen',
    beschreibung: 'Fünf Tage nach dem Versand eine freundliche Nachfrage, fünf Tage später eine Anruf-Aufgabe. Endet, sobald das Angebot angenommen oder abgelehnt ist.',
    gruppen: ['alle', 'handwerk', 'handel', 'beratung', 'immobilien', 'gastro', 'lebensmittel', 'landwirtschaft'],
    ablauf: {
      name: 'Angebot nachfassen',
      beschreibung: 'Nachfrage-Mail, dann Anruf',
      ausloeser: { art: 'datum', trigger: 'angebot_ohne_antwort', tage: 5, filter: null },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Ihr Angebot {{nummer}} — haben Sie Fragen?', text: 'Guten Tag {{name}},\n\nvor einigen Tagen haben wir Ihnen unser Angebot {{nummer}} geschickt. Gibt es Fragen oder Wünsche? Wir passen es gern an.' + GRUSS } },
        { id: 's2', typ: 'warten', tage: 5 },
        { id: 's3', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Anrufen wegen Angebot {{nummer}} ({{name}})', prioritaet: 'normal', faellig_in_tagen: 1 } },
      ],
    },
  },
  {
    key: 'angebot_laeuft_ab',
    name: 'Angebot läuft ab',
    beschreibung: 'Am Gültig-bis-Tag eine Aufgabe zum Nachfassen und ein Vermerk am Angebot.',
    gruppen: ['alle', 'handwerk', 'handel', 'beratung', 'immobilien'],
    ablauf: {
      name: 'Angebot läuft ab',
      beschreibung: 'Aufgabe und Vermerk am Ablauftag',
      ausloeser: { art: 'datum', trigger: 'angebot_laeuft_ab', tage: 0, filter: null },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Angebot {{nummer}} läuft heute ab — verlängern oder nachfassen ({{name}})', prioritaet: 'hoch', faellig_in_tagen: 0 } },
        { id: 's2', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 'Gültigkeit am {{heute}} erreicht (Ablauf {{ablauf}})' } },
      ],
    },
  },
  {
    key: 'auftrag_start',
    name: 'Auftrag angenommen — Start vorbereiten',
    beschreibung: 'Sobald ein Angebot angenommen ist: Aufgaben für Material und Terminabsprache, Vermerk am Angebot.',
    gruppen: ['handwerk', 'handel', 'beratung', 'landwirtschaft'],
    ablauf: {
      name: 'Auftrag angenommen — Start vorbereiten',
      beschreibung: 'Material, Termin, Vermerk',
      ausloeser: { art: 'datum', trigger: 'angebot_angenommen', tage: 0, filter: null },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Material prüfen und bestellen: {{titel}} ({{name}})', prioritaet: 'hoch', faellig_in_tagen: 1 } },
        { id: 's2', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Starttermin mit {{name}} vereinbaren', prioritaet: 'normal', faellig_in_tagen: 2 } },
        { id: 's3', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 'Angenommen — Start vorbereitet am {{heute}}' } },
      ],
    },
  },
  {
    key: 'projekt_abschluss',
    name: 'Projektende — Abnahme und Schlussrechnung',
    beschreibung: 'Am Enddatum eines laufenden Projekts: Aufgaben für Abnahme und Schlussrechnung, Vermerk im Projekt.',
    gruppen: ['handwerk', 'beratung', 'immobilien'],
    ablauf: {
      name: 'Projektende — Abnahme und Schlussrechnung',
      beschreibung: 'Abnahme, Schlussrechnung, Vermerk',
      ausloeser: { art: 'datum', trigger: 'projekt_endet', tage: 0, filter: null },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Abnahme vereinbaren: {{titel}}', prioritaet: 'hoch', faellig_in_tagen: 2 } },
        { id: 's2', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Schlussrechnung stellen: {{titel}}', prioritaet: 'hoch', faellig_in_tagen: 5 } },
        { id: 's3', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 'Enddatum erreicht am {{heute}}' } },
      ],
    },
  },
  {
    key: 'aufgabe_eskalation',
    name: 'Überfällige Aufgabe hochziehen',
    beschreibung: 'Ist eine Aufgabe zwei Tage überfällig, entsteht eine dringende Folge-Aufgabe und ein Vermerk.',
    gruppen: ['alle', 'handwerk', 'handel', 'lebensmittel', 'gastro', 'gesundheit', 'tier', 'beratung', 'immobilien', 'landwirtschaft', 'verein'],
    ablauf: {
      name: 'Überfällige Aufgabe hochziehen',
      beschreibung: 'Dringende Folge-Aufgabe',
      ausloeser: { art: 'datum', trigger: 'aufgabe_ueberfaellig', tage: 2, filter: null },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Überfällig seit {{tage}} Tagen: {{titel}}', prioritaet: 'dringend', faellig_in_tagen: 0 } },
        { id: 's2', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 'Hochgezogen am {{heute}}' } },
      ],
    },
  },
  {
    key: 'wiedervorlage',
    name: 'Wiedervorlage beim Kunden',
    beschreibung: 'Am eingetragenen „nächster Kontakt"-Tag eine Anruf-Aufgabe — keine Mail an den Kunden.',
    gruppen: ['alle', 'handwerk', 'handel', 'beratung', 'immobilien', 'landwirtschaft', 'verein'],
    ablauf: {
      name: 'Wiedervorlage beim Kunden',
      beschreibung: 'Anruf-Aufgabe am Wiedervorlage-Tag',
      ausloeser: { art: 'datum', trigger: 'kontakt_wiedervorlage', tage: 0, filter: null },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Wiedervorlage: {{name}} kontaktieren', prioritaet: 'normal', faellig_in_tagen: 0 } },
      ],
    },
  },
  {
    key: 'rueckholung',
    name: 'Stammkunden zurückholen',
    beschreibung: 'Nach 180 Tagen Funkstille eine persönliche Mail — nur an Kunden mit Werbe-Einwilligung und ohne Widerspruch —, zwei Wochen später eine Anruf-Aufgabe.',
    gruppen: ['handel', 'gastro', 'lebensmittel', 'handwerk', 'beratung'],
    ablauf: {
      name: 'Stammkunden zurückholen',
      beschreibung: 'Mail mit Einwilligung, dann Anruf',
      ausloeser: { art: 'datum', trigger: 'kontakt_lange_still', tage: 180, filter: null },
      schritte: [
        { id: 's1', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Lange nicht gesehen, {{name}}', text: 'Guten Tag {{name}},\n\nes ist eine Weile her — wir würden uns freuen, wieder von Ihnen zu hören. Wenn wir etwas für Sie tun können, antworten Sie einfach auf diese Mail.' + GRUSS } },
        { id: 's2', typ: 'warten', tage: 14 },
        { id: 's3', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Nachfassen: {{name}} (Rückhol-Mail vor 14 Tagen)', prioritaet: 'niedrig', faellig_in_tagen: 3 } },
      ],
    },
  },
];

export function vorlagenFuer(gruppe: BranchenGruppe): AblaufVorlage[] {
  return gruppe === 'alle' ? ABLAUF_VORLAGEN : ABLAUF_VORLAGEN.filter((v) => v.gruppen.includes(gruppe));
}
