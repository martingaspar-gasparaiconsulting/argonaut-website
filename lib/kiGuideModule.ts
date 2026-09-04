// ============================================================================
// ARGONAUT OS · lib/kiGuideModule.ts  (Avatar Stufe 3 · was der Guide je Modul sagt)
//
// WARUM ES DIESE DATEI GIBT
// lib/kiGuideTexte.ts sagt, was der Guide auf der EINRICHTUNGSSEITE sagt.
// Diese Datei sagt, was er auf JEDER Modulseite sagt — damit er von Seite zu
// Seite mitwandern kann, ohne dass jede der rund 130 Seiten angefasst werden
// muss. Der Begleiter (app/dashboard/_components/KiGuideBegleiter.tsx) liest
// den aktuellen Pfad und holt sich hier den passenden Text.
//
// KEINE Hooks, KEIN Supabase, KEINE React-Importe — reine Rechenlogik, damit
// sie sich mit `node --test` pruefen laesst. Die Navigationsliste kommt als
// Parameter herein (lib/rechte.ts NAV_LINKS), nicht als Import: so bleibt die
// Datei fuer den Test allein lauffaehig und es entsteht kein Ringschluss.
//
// SPAETER: Sobald die 113 Modul-Kapitel aus der Inhalts-Werkstatt geschrieben
// sind, treten sie an die Stelle von MODUL_TEXTE — die Form ist schon dieselbe
// (Nachricht + drei Schritte). Bis dahin greift fuer jedes Modul ohne eigenen
// Eintrag ein Fallback, der aus dem Menue-Titel gebaut wird. Es gibt also nie
// eine leere Sprechblase.
//
// „Sie" durchgehend. Keine Werbefloskeln. Nie „KI-Agenten" — es heisst Baustein.
// ============================================================================

import type { GuideInhalt } from './kiGuideTexte';

/** Was diese Datei von einem Navigationseintrag braucht — mehr nicht. */
export type GuideNav = {
  label: string;
  href: string;
  /** Der Pfad gilt nur exakt, nie als Praefix (z. B. '/dashboard'). */
  exakt?: boolean;
};

/** Ein Modultext: die Kernbotschaft und drei konkrete naechste Schritte. */
export type ModulText = {
  nachricht: string;
  schritte: string[];
  /** Optionaler Knopf. Fehlt er, zeigt der Guide keinen. */
  aktionText?: string;
  aktionHref?: string;
};

/**
 * Emojis und Leerzeichen vom Menue-Titel abschneiden.
 *
 * '🧾 Angebote' -> 'Angebote'. Wir schneiden alles vor dem ersten Buchstaben
 * bzw. der ersten Ziffer weg — das trifft jedes Emoji, ohne dass wir eine
 * Emoji-Liste pflegen muessen.
 */
export function titelOhneZeichen(label: string | null | undefined): string {
  const t = String(label ?? '').trim();
  if (!t) return '';
  const treffer = t.match(/[\p{L}\p{N}].*$/u);
  return (treffer ? treffer[0] : t).trim();
}

/**
 * Den passenden Navigationseintrag zu einem Pfad finden.
 *
 * Regeln, in dieser Reihenfolge:
 *   1. Exakte Uebereinstimmung gewinnt immer.
 *   2. Sonst der LAENGSTE Eintrag, dessen Pfad ein echter Ordner-Praefix ist.
 *      '/dashboard/rechnungen/17' findet damit 'Rechnungen', nicht 'Übersicht'.
 *   3. Eintraege mit `exakt` sind von Regel 2 ausgenommen — sonst wuerde
 *      '/dashboard' jede Unterseite an sich ziehen.
 * Fragezeichen-Anhaengsel und Schraegstriche am Ende stoeren nicht.
 */
export function findeNav(pfad: string | null | undefined, links: readonly GuideNav[] | null | undefined): GuideNav | null {
  const liste = Array.isArray(links) ? links : [];
  let p = String(pfad ?? '').trim();
  if (!p) return null;
  const schnitt = p.search(/[?#]/);
  if (schnitt >= 0) p = p.slice(0, schnitt);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);

  let treffer: GuideNav | null = null;
  for (const l of liste) {
    const href = String(l?.href ?? '');
    if (!href) continue;
    if (href === p) return l;
    if (l?.exakt) continue;
    if (!p.startsWith(href + '/')) continue;
    if (!treffer || href.length > String(treffer.href).length) treffer = l;
  }
  return treffer;
}

/**
 * Die Texte je Seite. Schluessel ist der Pfad aus NAV_LINKS.
 *
 * Bewusst nur dort, wo sich eine echte Hilfestellung sagen laesst. Alles
 * andere bekommt den Fallback — lieber ein ehrlicher allgemeiner Satz als ein
 * ausgedachter Ablauf, den es im Modul so nicht gibt.
 */
export const MODUL_TEXTE: Record<string, ModulText> = {
  '/dashboard': {
    nachricht:
      'Das ist Ihre Übersicht. Sie zieht die Zahlen aus allen Bausteinen zusammen, die für Sie freigeschaltet sind — Sie müssen dafür nirgends etwas doppelt eintragen.',
    schritte: [
      'Unter „Heute" sehen Sie, was heute ansteht',
      'Mit dem Schalter oben rechts zwischen Einfach und Voll wechseln',
      'Über die Suche finden Sie jeden Vorgang in Sekunden',
    ],
    aktionText: 'Zu „Heute"',
    aktionHref: '/dashboard/heute',
  },
  '/dashboard/heute': {
    nachricht:
      'Hier steht alles, was heute Ihre Aufmerksamkeit braucht — über alle Bausteine hinweg: fällige Termine, offene Posten, ablaufende Fristen.',
    schritte: [
      'Die Liste von oben nach unten abarbeiten',
      'Jeder Eintrag führt Sie direkt an die richtige Stelle',
      'Wiederkehrendes können Sie später automatisch erledigen lassen',
    ],
  },
  '/dashboard/suche': {
    nachricht:
      'Die Suche läuft gleichzeitig über Kontakte, Rechnungen, Angebote, Aufträge, Projekte und Leads. Sie müssen nicht wissen, in welchem Baustein etwas liegt.',
    schritte: [
      'Name, Nummer oder Stichwort eintippen',
      'Die Treffer sind nach Bereich gruppiert',
      'Ein Klick öffnet den Vorgang an seinem Platz',
    ],
  },
  '/dashboard/crm': {
    nachricht:
      'Ihre Kundenkartei. Jeder Kontakt, den Sie hier anlegen, steht sofort in Angeboten, Rechnungen, Terminen und Projekten zur Auswahl.',
    schritte: [
      'Neuen Kontakt anlegen — Name und E-Mail genügen zum Start',
      'In der Einfach-Ansicht sehen Sie nur die nötigen Felder',
      'Die Kunden-Akte zeigt später alles zu diesem Kunden auf einer Seite',
    ],
    aktionText: 'Zur Kunden-Akte',
    aktionHref: '/dashboard/kunde-akte',
  },
  '/dashboard/kunde-akte': {
    nachricht:
      'Die ganze Geschichte eines Kunden auf einer Seite: Umsatz, offene Posten, Rechnungen, Angebote und Termine.',
    schritte: [
      'Oben den Kunden suchen',
      'Offene Posten zuerst prüfen',
      'Von hier aus direkt ein Angebot oder eine Rechnung starten',
    ],
  },
  '/dashboard/angebote': {
    nachricht:
      'Angebote schreiben und verfolgen. Aus einem angenommenen Angebot wird mit einem Klick ein Auftrag oder direkt eine Rechnung — ohne Abtippen.',
    schritte: [
      'Kunde wählen, Positionen eintragen, speichern',
      '„Gültig bis" und Anmerkung sehen Sie nur in der Voll-Ansicht',
      'Nach der Zusage aus dem Angebot die Rechnung erzeugen',
    ],
  },
  '/dashboard/rechnungen': {
    nachricht:
      'Ihre Ausgangsrechnungen. Die Nummern werden fortlaufend je Betrieb vergeben, das PDF erfüllt § 14 UStG und trägt Ihr Logo und Ihre Farben.',
    schritte: [
      'Rechnung anlegen oder aus Angebot/Auftrag übernehmen',
      'Vor dem Versand die Positionen und den Steuersatz prüfen',
      'Offene Posten laufen automatisch ins Mahnwesen',
    ],
  },
  '/dashboard/mahnwesen': {
    nachricht:
      'Alle überfälligen Rechnungen an einem Ort — mit Stufen von der freundlichen Erinnerung bis zur letzten Mahnung.',
    schritte: [
      'Die Arbeitsliste zeigt, was wirklich fällig ist',
      'Stufe wählen und Mahnung erzeugen',
      'Jede Mahnung wird protokolliert',
    ],
  },
  '/dashboard/auftraege': {
    nachricht:
      'Beauftragte Arbeiten mit Status. Der Auftrag verbindet Angebot, Termine, Einsätze und die spätere Rechnung.',
    schritte: [
      'Auftrag aus einem Angebot oder neu anlegen',
      'Termine und Einsätze am Auftrag hängen lassen',
      'Zum Schluss die Rechnung daraus erzeugen',
    ],
  },
  '/dashboard/termine': {
    nachricht:
      'Ihr Terminkalender samt Online-Buchung. Doppelbelegungen verhindert das System selbst — auch wenn zwei Personen gleichzeitig buchen.',
    schritte: [
      'Termin anlegen oder aus der Online-Buchung übernehmen',
      'Verfügbarkeiten hinterlegen, damit Kunden selbst buchen können',
      'Aus einem Termin kann direkt ein Einsatz werden',
    ],
  },
  '/dashboard/projekte': {
    nachricht:
      'Projekte mit Budget und Aufgaben. Was Ihre Leute an Zeit buchen, läuft hier zusammen und lässt sich abrechnen.',
    schritte: [
      'Projekt anlegen und ein Budget hinterlegen',
      'Leistungen und Zeiten laufend erfassen',
      'In der Nachkalkulation sehen Sie Plan gegen Ist',
    ],
    aktionText: 'Zur Nachkalkulation',
    aktionHref: '/dashboard/nachkalkulation',
  },
  '/dashboard/nachkalkulation': {
    nachricht:
      'Hier sehen Sie, ob ein Projekt sein Budget hält: geplante Summe gegen tatsächlich geleistete Stunden — über Budget zuerst.',
    schritte: [
      'Rote Zeilen zuerst ansehen',
      'Offene Leistungen abrechnen, bevor sie liegen bleiben',
      'Stunden und Auslastung zeigt die Voll-Ansicht',
    ],
  },
  '/dashboard/eingangsbelege': {
    nachricht:
      'Ihre Eingangsrechnungen. Ein Foto genügt — das System liest Lieferant, Datum, Netto, Umsatzsteuer und Brutto selbst aus und meldet sich, wenn die Summen nicht zusammenpassen.',
    schritte: [
      'Beleg fotografieren oder hochladen',
      'Vorgeschlagene Werte prüfen und bestätigen',
      'Der Beleg fließt in EÜR und DATEV-Export ein',
    ],
  },
  '/dashboard/finanzen': {
    nachricht:
      'Der Geldfluss auf einen Blick: offene Posten, Zahlungen, Cashflow-Vorschau und Sammelüberweisung.',
    schritte: [
      'Die Cashflow-Vorschau zeigt zwölf Wochen nach vorn',
      'Kontostand und Fixkosten einmal eintragen',
      'Überweisungen als SEPA-Datei fürs Online-Banking erzeugen',
    ],
  },
  '/dashboard/datev': {
    nachricht:
      'Der Export für Ihre Steuerkanzlei: ein echter DATEV-Buchungsstapel im EXTF-Format, Ausgangsrechnungen und Eingangsbelege zusammen.',
    schritte: [
      'Berater- und Mandantennummer einmal unter Schnittstellen hinterlegen',
      'Zeitraum wählen',
      'Stapel herunterladen und der Kanzlei geben',
    ],
  },
  '/dashboard/elster': {
    nachricht:
      'Die Umsatzsteuer-Voranmeldung wird aus Ihren Zahlen berechnet — mit den amtlichen Kennziffern. Die Übertragung machen Sie im ELSTER-Portal.',
    schritte: [
      'Zeitraum wählen und berechnen lassen',
      'Als PDF oder CSV herunterladen',
      'Zahlen im ELSTER-Portal eintragen',
    ],
  },
  '/dashboard/personal': {
    nachricht:
      'Ihre Mitarbeiterinnen und Mitarbeiter mit Stammdaten, Rechten und Filiale. Wer wohin gehört, entscheidet auch, was er im System sieht.',
    schritte: [
      'Person anlegen und zur Filiale zuordnen',
      'Bei Bedarf befristet in eine andere Filiale entsenden',
      'Rechte vergeben Sie unter „Wer sieht was"',
    ],
  },
  '/dashboard/zeiterfassung': {
    nachricht:
      'Die Stempeluhr für Ihre eigene Arbeitszeit — kommen, gehen, Pause. Die Aufzeichnung erfüllt die gesetzliche Aufzeichnungspflicht.',
    schritte: [
      'Zum Arbeitsbeginn stempeln',
      'Pausen sauber erfassen',
      'Am Monatsende den Nachweis prüfen',
    ],
  },
  '/dashboard/marketing': {
    nachricht:
      'Ihre Marketing-Zentrale: analysieren, Inhalte erstellen, auf den Kanälen ausspielen. Acht Kanäle lassen sich direkt bespielen.',
    schritte: [
      'Im Lagebericht sehen Sie, was gerade wirkt',
      'Beiträge im Content-Fließband erzeugen lassen',
      'Kanäle einmal verbinden, dann läuft der Versand',
    ],
  },
  '/dashboard/academy': {
    nachricht:
      'Die Einarbeitung für Ihr Team. Sie können eigene Videos aufnehmen, Untertitel hinterlegen und sehen, wer was abgeschlossen hat.',
    schritte: [
      'Kurs auswählen und ansehen',
      'Abschluss bringt eine Medaille',
      'Als Chef sehen Sie die Übersicht Ihres Teams',
    ],
  },
  '/dashboard/vorlagen': {
    nachricht:
      'Der gemeinsame Vorlagen-Pool. Was hier zentral liegt, steht jeder Filiale zur Verfügung — empfohlene Vorlagen sind gekennzeichnet.',
    schritte: [
      'Vorlage suchen und kopieren',
      'Als Chef oder Leitung eigene Vorlagen anlegen',
      'Bestehende Vorlagen aus den Bausteinen importieren',
    ],
  },
  '/dashboard/schnittstellen': {
    nachricht:
      'Die eine Zentrale für alle Zugänge. Solange kein echter Zugang hinterlegt ist, arbeitet ein Baustein im Demo-Modus: Er rechnet richtig, schickt aber nichts nach draußen.',
    schritte: [
      'Bereich aufklappen und der Anleitung folgen',
      'Zugangsdaten eintragen und auf aktiv stellen',
      'Einen Vorgang zur Probe durchlaufen lassen',
    ],
  },
  '/dashboard/automationen': {
    nachricht:
      'Wiederkehrende Abläufe einmal hinterlegen, statt sie jeden Tag von Hand zu machen: Wenn etwas passiert, tut das System etwas.',
    schritte: [
      'Mit einer der fertigen Vorlagen starten',
      'Auslöser und Aktion prüfen',
      'Erst zur Probe laufen lassen, dann scharf schalten',
    ],
  },
  '/dashboard/datensicherung': {
    nachricht:
      'Ihre Daten gehören Ihnen. Hier laden Sie den kompletten Bestand als Excel-Mappe herunter — je Bereich ein Blatt.',
    schritte: [
      'Komplett-Backup als Excel erzeugen',
      'Datei außerhalb des Systems ablegen',
      'Die JSON-Fassung finden Sie in der Voll-Ansicht',
    ],
  },
  '/dashboard/reports': {
    nachricht:
      'Auswertungen selbst zusammenstellen: Quelle, Kennzahl, Gruppierung, Zeitraum. Fertige Auswertungen können sich regelmäßig per Mail melden.',
    schritte: [
      'Quelle und Kennzahl wählen',
      'Auswertung speichern, damit sie erhalten bleibt',
      'Bei Bedarf einen festen Versandtag einstellen',
    ],
  },
  '/dashboard/filialvergleich': {
    nachricht:
      'Ihre Standorte nebeneinander: Umsatz, offene Posten, Kasse, Aufträge und wer heute vor Ort ist — entsandte Kräfte eingerechnet.',
    schritte: [
      'Stärkste und schwächste Filiale vergleichen',
      'Vorgänge ohne Filiale getrennt prüfen',
      'Personal bei Bedarf befristet entsenden',
    ],
  },
  '/dashboard/wer-sieht-was': {
    nachricht:
      'Die ehrliche Antwort auf die wichtigste Rechtefrage: Welche Bausteine sieht welche Person wirklich — nach Sitz-Typ, Rolle und Filiale gerechnet.',
    schritte: [
      'Person aufklappen und sichtbare Bausteine prüfen',
      'Änderungen nehmen Sie unter „Rechte" vor',
      'Filialbezogenes stellen Sie unter „Filial-Module" ein',
    ],
  },
};

/** Allgemeine Schritte, wenn es für eine Seite noch keinen eigenen Text gibt. */
export const FALLBACK_SCHRITTE: string[] = [
  'Mit dem Schalter oben rechts zwischen Einfach und Voll wechseln',
  'Über die Suche finden Sie jeden Vorgang in Sekunden',
  'Fragen zum Bereich beantwortet Ihnen der Chat unten rechts',
];

/**
 * Der fertige Guide-Inhalt für einen Pfad. Liefert IMMER etwas — im
 * Zweifel den Fallback aus dem Menue-Titel, nie eine leere Sprechblase.
 */
export function modulGuide(pfad: string | null | undefined, links: readonly GuideNav[] | null | undefined): GuideInhalt {
  const nav = findeNav(pfad, links);
  const titel = titelOhneZeichen(nav?.label) || 'ARGONAUT';
  const eigener = nav ? MODUL_TEXTE[String(nav.href)] : undefined;

  if (eigener) {
    return {
      begruessung: titel,
      nachricht: eigener.nachricht,
      schritte: eigener.schritte.slice(0, 3),
      aktionText: eigener.aktionText,
      aktionHref: eigener.aktionHref,
      stimmung: 'neutral',
      fortschritt: -1,
    };
  }

  return {
    begruessung: titel,
    nachricht:
      `Sie sind im Bereich „${titel}". Alles, was Sie hier erfassen, steht sofort auch in den verbundenen Bausteinen bereit — Sie müssen nichts doppelt eintragen.`,
    schritte: FALLBACK_SCHRITTE.slice(0, 3),
    stimmung: 'neutral',
    fortschritt: -1,
  };
}
