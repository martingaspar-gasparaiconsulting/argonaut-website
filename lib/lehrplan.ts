// ============================================================================
// ARGONAUT OS · lib/lehrplan.ts — Lehrplan „Vom Matrosen zum Kapitän" (Paket A4)
//
// WARUM
// Die Academy vergibt Ränge nach der Zahl abgeschlossener Kurse (lib/academy.ts
// MEDAILLEN). Was man auf jedem Rang KÖNNEN soll, stand nirgends. Martins
// Vorgabe: Der Assistent erklärt je Rang eine Lernliste — Schritt für Schritt,
// mit Probe-Einträgen, so dass keine Frage offen bleibt.
//
// AUFBAU
// Acht Etappen: „Leinen los" (noch kein Kurs) und die sieben Academy-Ränge.
// Je Etappe und Rolle (Chef / Mitarbeiter) ein Ziel in einem Satz und 3–4
// Aufgaben. Jede Aufgabe zeigt auf eine echte Menüseite; dort erklärt der
// Guide (lib/guideWissen.ts) die Seite im Detail. `probe: true` heisst: Diese
// Aufgabe übt man mit einem Probe-Eintrag, den man danach wieder löscht.
//
// FESTE REGEL: Der Assistent SAGT nur. Die Aufgaben sind Anleitungen für den
// Menschen — nichts hier trägt etwas ein.
// Mitarbeiter-Aufgaben nutzen nur Seiten, die jeder Mitarbeiter hat, oder
// sagen dazu, dass der Chef sie freischalten muss (`freigabe: true`).
//
// Reine Daten + Logik. Test: tests/lehrplanA4.test.mjs.
// ============================================================================

import { MEDAILLEN, medailleFuer } from './academy';

export type LehrRolle = 'chef' | 'mitarbeiter';

export type Aufgabe = {
  text: string;
  href: string;
  /** Mit Probe-Eintrag üben (anlegen, ansehen, wieder löschen). */
  probe?: boolean;
  /** Seite muss der Chef erst freischalten. */
  freigabe?: boolean;
};

export type Etappe = {
  /** 'start' oder der Schlüssel aus MEDAILLEN. */
  key: string;
  rang: string;
  icon: string;
  abKursen: number;
  ziel: Record<LehrRolle, string>;
  aufgaben: Record<LehrRolle, Aufgabe[]>;
};

const START = { key: 'start', rang: 'Leinen los', icon: '⚓', abKursen: 0 };
const M = (key: string) => {
  const m = MEDAILLEN.find((x) => x.key === key);
  if (!m) throw new Error(`Rang ${key} fehlt in MEDAILLEN`);
  return { key: m.key, rang: m.rang, icon: m.icon, abKursen: m.abKursen };
};

export const LEHRPLAN: Etappe[] = [
  {
    ...START,
    ziel: {
      chef: 'Das Schiff klarmachen: Firmendaten stehen, Sie haben sich einmal gefahrlos durch die Übungswelt geklickt.',
      mitarbeiter: 'An Bord ankommen: Ihre Daten stimmen, Sie erfassen Ihre Arbeitszeit und wissen, wo Ihre Aufträge stehen.',
    },
    aufgaben: {
      chef: [
        { text: 'Firmendaten, Logo und Bankverbindung eintragen — die Ampel unter „Firmendaten prüfen" muss grün sein', href: '/dashboard/einstellungen' },
        { text: '„🎁 Übungswelt laden" und fünf Minuten durch die Bereiche klicken', href: '/dashboard/onboarding', probe: true },
        { text: 'Den ersten Academy-Kurs ansehen', href: '/dashboard/academy' },
      ],
      mitarbeiter: [
        { text: '„Mein Bereich" öffnen und prüfen, ob Name, Urlaubsanspruch und Unterlagen stimmen — Fehler dem Chef melden', href: '/dashboard/mein-bereich' },
        { text: 'Zu Arbeitsbeginn „Kommen" drücken, zum Feierabend „Gehen"', href: '/dashboard/zeiterfassung' },
        { text: 'Den ersten Academy-Kurs ansehen', href: '/dashboard/academy' },
      ],
    },
  },
  {
    ...M('erste_fahrt'),
    ziel: {
      chef: 'Die Mannschaft an Bord holen: Mitarbeiter angelegt, Rechte festgelegt, eingeladen.',
      mitarbeiter: 'Den Tagesablauf beherrschen: Einsätze lesen, im Team absprechen, Urlaub und Krankmeldung selbst erledigen.',
    },
    aufgaben: {
      chef: [
        { text: 'Mitarbeiter anlegen und die Personalakte vervollständigen, bis die Ampel grün ist', href: '/dashboard/personal' },
        { text: 'Festlegen, wer was sieht — erst die Rechte, dann die Einladung', href: '/dashboard/rechte' },
        { text: 'Unter „Wer sieht was" gegenprüfen, was ein Mitarbeiter tatsächlich zu sehen bekommt', href: '/dashboard/wer-sieht-was' },
        { text: 'Mitarbeiter mit „Zum Self-Service einladen" zu „Mein Bereich" einladen', href: '/dashboard/personal' },
      ],
      mitarbeiter: [
        { text: '„Meine Einsätze" öffnen: Wo muss ich heute hin, was ist zu tun?', href: '/dashboard/meine-einsaetze' },
        { text: 'Im Team-Chat eine Nachricht an die Kollegen schreiben', href: '/dashboard/team-chat', freigabe: true },
        { text: 'Wissen, wo Urlaubsantrag und Krankmeldung sitzen: beides in „Mein Bereich". Einen gestellten Urlaubsantrag können Sie selbst nicht zurücknehmen — das macht der Chef', href: '/dashboard/mein-bereich' },
      ],
    },
  },
  {
    ...M('smutje'),
    ziel: {
      chef: 'Kunden und Termine im Griff: Die Kundenliste steht, der Kalender ist gefüllt.',
      mitarbeiter: 'Sauber dokumentieren: Formulare mit Foto und Unterschrift, Dokumente finden.',
    },
    aufgaben: {
      chef: [
        { text: 'Kunden anlegen oder über das Import-Center einlesen', href: '/dashboard/crm' },
        { text: 'Einen Probe-Kunden „Test" anlegen, in der Kunden-Akte ansehen und wieder löschen', href: '/dashboard/kunde-akte', probe: true },
        { text: 'Den ersten Termin mit Kunde anlegen', href: '/dashboard/termine' },
      ],
      mitarbeiter: [
        { text: 'Ein Formular ausfüllen — mit Foto und Unterschrift', href: '/dashboard/formulare', probe: true },
        { text: 'Unter „Dokumente" eine Anleitung oder ein Datenblatt suchen', href: '/dashboard/documents', freigabe: true },
        { text: 'Mit der Suche einen Kunden oder Auftrag in Sekunden finden', href: '/dashboard/suche' },
      ],
    },
  },
  {
    ...M('matrose'),
    ziel: {
      chef: 'Vom Angebot zum Auftrag: Angebote schreiben, annehmen lassen, Aufträge und Einsätze planen.',
      mitarbeiter: 'Mitdenken: Termine kennen, Kundenhistorie nachsehen, „Heute" als Tagesliste nutzen.',
    },
    aufgaben: {
      chef: [
        { text: 'Ein Probe-Angebot an den Probe-Kunden schreiben und als PDF ansehen', href: '/dashboard/angebote', probe: true },
        { text: 'Aus dem angenommenen Angebot einen Auftrag machen', href: '/dashboard/auftraege' },
        { text: 'Den Auftrag im Dispo-Board einem Mitarbeiter zuteilen', href: '/dashboard/dispo' },
      ],
      mitarbeiter: [
        { text: 'Im Kalender nachsehen, welche Termine diese Woche anstehen', href: '/dashboard/termine', freigabe: true },
        { text: 'Vor dem Einsatz in der Kunden-Akte nachsehen, was beim Kunden zuletzt war', href: '/dashboard/kunde-akte', freigabe: true },
        { text: 'Morgens „Heute" öffnen und von oben nach unten abarbeiten', href: '/dashboard/heute' },
      ],
    },
  },
  {
    ...M('bootsmann'),
    ziel: {
      chef: 'Das Geld kommt rein: Rechnungen schreiben, Zahlungen verfolgen, freundlich mahnen.',
      mitarbeiter: 'Selbstständig arbeiten: Vorlagen nutzen, Firmen-Wissen nachschlagen, Anweisungen in Ihrer Sprache lesen.',
    },
    aufgaben: {
      chef: [
        { text: 'Eine Rechnung aus dem Auftrag erzeugen und das PDF prüfen (Absender, Steuer, Bankverbindung)', href: '/dashboard/rechnungen' },
        { text: 'Nachsehen, wie die Mahnstufen laufen und wann eine Erinnerung rausgeht', href: '/dashboard/mahnwesen' },
        { text: 'Einen Eingangsbeleg fotografieren und in der Beleg-Inbox prüfen', href: '/dashboard/eingangsbelege', probe: true },
      ],
      mitarbeiter: [
        { text: 'Im Vorlagen-Pool eine Vorlage suchen und verwenden', href: '/dashboard/vorlagen' },
        { text: 'Im Firmen-Wissen nachschlagen, wie der Betrieb etwas regelt', href: '/dashboard/documents/wissen', freigabe: true },
        { text: 'Unter „Mehrsprachiges Team" die Anweisungen des Chefs lesen', href: '/dashboard/mehrsprachig' },
      ],
    },
  },
  {
    ...M('steuermann'),
    ziel: {
      chef: 'Den Überblick behalten: Chef-Blick lesen, Finanzen verstehen, Daten an den Steuerberater geben.',
      mitarbeiter: 'Den eigenen Fachbereich sicher bedienen — mit Probe-Eintrag geübt.',
    },
    aufgaben: {
      chef: [
        { text: 'Den Chef-Blick morgens vorlesen lassen: Auslastung, Frühwarnungen, Bank-Mappe', href: '/dashboard/chef-blick' },
        { text: 'Unter „Finanzen" Einnahmen und Ausgaben des Monats nachvollziehen', href: '/dashboard/finanzen' },
        { text: 'Den DATEV-Export einmal erzeugen und mit dem Steuerberater abstimmen', href: '/dashboard/datev' },
      ],
      mitarbeiter: [
        { text: 'In Ihrem Fachbereich (z. B. Werkstatt, Service, Bautagebuch) einen Probe-Eintrag anlegen, im Guide unter „Das landet in" nachsehen, wo er ankommt, und ihn wieder löschen — oder den Chef bitten, falls Sie nicht löschen dürfen', href: '/dashboard/heute', probe: true },
        { text: 'Den Guide auf jeder Seite aufklappen: „Wer trägt ein" und „Wer darf was" lesen', href: '/dashboard/heute' },
        { text: 'Die Pflichtschulungen in der Academy abschließen', href: '/dashboard/academy' },
      ],
    },
  },
  {
    ...M('navigator'),
    ziel: {
      chef: 'Den Betrieb arbeiten lassen: Automationen, Nachkalkulation und Auswertungen nutzen.',
      mitarbeiter: 'Andere mitnehmen: neue Kollegen einweisen und Fehler sauber melden.',
    },
    aufgaben: {
      chef: [
        { text: 'Eine Automation aus einer Vorlage anlegen, sofort pausieren und den „🔍 Probelauf" ansehen', href: '/dashboard/automationen', probe: true },
        { text: 'Ein abgeschlossenes Projekt nachkalkulieren: Hat es sich gelohnt?', href: '/dashboard/nachkalkulation' },
        { text: 'Im Report-Baukasten eine eigene Auswertung bauen', href: '/dashboard/reports' },
      ],
      mitarbeiter: [
        { text: 'Einem neuen Kollegen „Mein Bereich", Zeiterfassung und „Meine Einsätze" zeigen', href: '/dashboard/mein-bereich' },
        { text: 'Stimmt etwas im System nicht: im Team-Chat genau beschreiben, auf welcher Seite, was Sie getan haben, was passiert ist', href: '/dashboard/team-chat', freigabe: true },
        { text: 'Fünf weitere Academy-Kurse abschließen', href: '/dashboard/academy' },
      ],
    },
  },
  {
    ...M('kapitaen'),
    ziel: {
      chef: 'Das Schiff sicher führen: Datensicherung, Steuer und Rechte regelmäßig prüfen.',
      mitarbeiter: 'Ansprechpartner an Bord: Sie kennen jeden Ablauf, den Sie brauchen, und helfen anderen.',
    },
    aufgaben: {
      chef: [
        { text: 'Eine Datensicherung herunterladen und prüfen, was darin enthalten ist', href: '/dashboard/datensicherung' },
        { text: 'Die Umsatzsteuer-Voranmeldung vorbereiten und mit dem Steuerberater abgleichen', href: '/dashboard/elster' },
        { text: 'Einmal im Quartal: „Wer sieht was" durchgehen — stimmen alle Freigaben noch?', href: '/dashboard/wer-sieht-was' },
      ],
      mitarbeiter: [
        { text: 'Alle Pflichtschulungen sind abgeschlossen und aktuell', href: '/dashboard/academy' },
        { text: 'Vorlagen und Formulare, die im Alltag fehlen, dem Chef vorschlagen', href: '/dashboard/formulare' },
        { text: 'Neue Kollegen bis zur „Ersten Fahrt" begleiten', href: '/dashboard/academy' },
      ],
    },
  },
];

/** Die Etappe, in der jemand mit so vielen abgeschlossenen Kursen gerade steht. */
export function etappeFuer(kurse: number | null | undefined): Etappe {
  const m = medailleFuer(Math.max(0, Math.floor(Number(kurse) || 0)));
  if (!m) return LEHRPLAN[0];
  return LEHRPLAN.find((e) => e.key === m.key) ?? LEHRPLAN[0];
}

/** Die nächste Etappe — null auf dem Kapitäns-Rang. */
export function naechsteEtappe(kurse: number | null | undefined): Etappe | null {
  const jetzt = etappeFuer(kurse);
  const i = LEHRPLAN.findIndex((e) => e.key === jetzt.key);
  return LEHRPLAN[i + 1] ?? null;
}

/** Kurzer Satz für den Guide: das Lernziel der aktuellen Etappe. */
export function lernzielSatz(rolle: LehrRolle, kurse: number | null | undefined): string {
  const e = etappeFuer(kurse);
  return `Ihr Lernziel als „${e.rang}": ${e.ziel[rolle]}`;
}
