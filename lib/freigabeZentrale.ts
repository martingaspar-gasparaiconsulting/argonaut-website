// ============================================================================
// ARGONAUT OS · lib/freigabeZentrale.ts — Paket 345 (12.10.2026)
// A0 Freigabe-Zentrale im Command Center, Teil 1
//
// Martins Beschluss (12.10.2026): Alle Sperren auf einen Blick — Status, Grund,
// Anwalt-Frage. Freigeben nur mit Vermerk (Datum der Anwalt-Antwort). Der
// Code-Standard bleibt „aus", solange die Datenbank nichts anderes sagt.
// Ausblenden (statt Löschen) nur in drei getrennten Schritten: Klick →
// Rückfrage bestätigen → Namen eintippen. Nur der Betreiber mit Zwei-Faktor.
//
// Teil 1 (Paket 345): Übersicht, Vermerk, Freigabe, Protokoll.
// Teil 2 (Paket 346): Die Freigabe WIRKT — Server und Seiten lesen den Stand
// über lib/freigabeServer.ts bzw. lib/useFreigabeStand.ts (Code ODER
// Datenbank, jeder Fehler = gesperrt). Der Code-Standard bleibt „aus".
//
// Keine Hooks, kein Supabase — node-testbar (tests/freigabeZentraleP345).
// ============================================================================

import { START_FREIGABE, type StartBereich } from './startSperre';
import { ANWALT_FREIGABE, type AnwaltBereich } from './anwaltFreigabe';
import { BESTELLSTRECKE_LIVE, ZAHLUNG_LIVE } from './flags';
import { GESPERRTE_BEREICHE, FREI_IN_TEILBEREICH } from './dossierFreigabe';

export type Gruppe = 'start' | 'import' | 'flags' | 'kasse' | 'dossier';
export const GRUPPE_TEXT: Record<Gruppe, string> = {
  start: 'Start-Schalter',
  import: 'Import-Sperren',
  flags: 'Bestellstrecke und Zahlung',
  kasse: 'Kasse',
  dossier: 'Fachdossiers',
};

export type SchalterInfo = {
  /** Was der Schalter freigibt (für Laien). */
  titel: string;
  /** Was heute aus ist. */
  aus: string;
  /** Anwalt-Fragen (R-Nummern bzw. Nummern der Anwalt-Liste). */
  anwalt: string;
};

/** Je Start-Schalter: Titel, was aus ist, Anwalt-Frage. Neue Schalter MÜSSEN hier stehen (Test). */
export const START_INFO: Readonly<Record<StartBereich, SchalterInfo>> = Object.freeze({
  shop: { titel: 'Webshop der Betriebe', aus: 'Bestellungen über Kunden-Websites', anwalt: '2.01–2.04, 2.20, 2.30–2.34' },
  kiBeraterFremd: { titel: 'KI-Berater auf fremden Websites', aus: 'Berater auf Adressen außerhalb der ARGONAUT-Websites', anwalt: '2.06, 2.35, 2.52' },
  fernhilfe: { titel: 'Fernhilfe', aus: 'Bildschirm teilen mit Betreiber oder Chef', anwalt: '2.51' },
  whatsappWerbung: { titel: 'WhatsApp-Werbung', aus: 'Anmeldung und Kampagnen-Versand per WhatsApp', anwalt: '2.07, 2.08, 2.53, 1.64' },
  gefahrstoffShop: { titel: 'Gefahr-Angaben im Shop', aus: 'Piktogramme, Signalwort, H-/P-Sätze am Shop-Produkt', anwalt: 'R49' },
  gewerbeNachweis: { titel: 'Nur Gewerbekunden', aus: 'Schalter „nur geprüfte Geschäftskunden" im Shop', anwalt: 'R49' },
  sdbVersand: { titel: 'Sicherheitsdatenblatt mit der Bestellung', aus: 'SDB-Anhang an der Bestellbestätigung, Nachversand', anwalt: 'R49' },
  betriebsanweisung: { titel: 'Betriebsanweisung freigeben', aus: 'Freigabe-Knopf; Druck immer „ENTWURF"', anwalt: 'R49' },
  zusammenlagerung: { titel: 'Zusammenlagerungs-Ampel (TRGS 510)', aus: 'Ampel je Lagerplatz im Gefahrstoffverzeichnis', anwalt: 'R49' },
  reifePreisTreppe: { titel: 'Preis-Treppe nach Reife und MHD', aus: 'Preisschild ohne „ENTWURF" und mit Streichpreis', anwalt: 'R51' },
  vorbestellShop: { titel: 'Vorbestellung im Shop', aus: 'Vorbestell-Kacheln und Vormerkliste im Shop (wirkt nur mit „Webshop")', anwalt: 'R52, R53' },
  adrPapier: { titel: 'ADR-Beförderungspapier', aus: 'Ausstellen; Druck immer „ENTWURF" (Entsorgung → Gefahrgut)', anwalt: 'R58' },
  foerderantrag: { titel: 'Förder-Übersicht Heizungstausch für Endkunden', aus: 'Druck/Ausgabe der KfW-458-Schätzung an den Kunden (Rechner intern frei)', anwalt: 'R67' },
  metallzuschlag: { titel: 'Metallzuschlag in Angebot und Rechnung', aus: 'Übernahme des Kupferzuschlags als Position (Rechner bleibt nutzbar)', anwalt: 'R66' },
  cookieMessung: { titel: 'Besucher-Messung mit Einwilligung (Cookie)', aus: 'Einwilligungs-Fenster, Wiedererkennungs-Cookie und Nachweis auf Kunden-Webseiten (ohne Schalter: Zählung ohne Cookie)', anwalt: 'R68' },
});

/** Je Import-Sperre. Neue Bereiche MÜSSEN hier stehen (Test). */
export const IMPORT_INFO: Readonly<Record<AnwaltBereich, SchalterInfo>> = Object.freeze({
  gesundheit: { titel: 'Import Patienten und Behandlungen', aus: 'Import in Gesundheits-Module', anwalt: '3.20, 3.01–3.03, 3.10, 3.11' },
  tier: { titel: 'Import Tierakten', aus: 'Import von Tierakten mit Halter und Behandlung', anwalt: '3.20, 3.04' },
  hilfsmittel: { titel: 'Import Hilfsmittel-Versorgungen', aus: 'Import mit Diagnose und Krankenkasse', anwalt: '3.20 (§ 393 SGB V)' },
  kanzlei: { titel: 'Import Mandantenakten', aus: 'Import von Kanzlei-Akten', anwalt: '3.20 (§ 203 StGB)' },
});

export type Schalter = {
  schluessel: string;
  gruppe: Gruppe;
  titel: string;
  aus: string;
  anwalt: string;
  /** Stand im Code (true = an). */
  codeAn: boolean;
  /** Lässt sich in der Freigabe-Zentrale vormerken (sonst nur Information). */
  schaltbar: boolean;
  /** Wie man ihn öffnet, wenn er nicht schaltbar ist. */
  hinweis: string | null;
};

/** Alle Schalter und Sperren, die es im Code gibt. */
export function alleSchalter(): Schalter[] {
  const raus: Schalter[] = [];
  for (const k of Object.keys(START_FREIGABE) as StartBereich[]) {
    const i = START_INFO[k];
    raus.push({ schluessel: `startSperre.${k}`, gruppe: 'start', titel: i?.titel ?? k, aus: i?.aus ?? '', anwalt: i?.anwalt ?? '', codeAn: START_FREIGABE[k] === true, schaltbar: true, hinweis: null });
  }
  for (const k of Object.keys(ANWALT_FREIGABE) as AnwaltBereich[]) {
    const i = IMPORT_INFO[k];
    raus.push({ schluessel: `anwaltFreigabe.${k}`, gruppe: 'import', titel: i?.titel ?? k, aus: i?.aus ?? '', anwalt: i?.anwalt ?? '', codeAn: ANWALT_FREIGABE[k] === true, schaltbar: true, hinweis: null });
  }
  raus.push({
    schluessel: 'flags.BESTELLSTRECKE_LIVE', gruppe: 'flags', titel: 'Bestellstrecke für ARGONAUT-Abos (/buchen)', aus: 'Verbindliche Bestellung über die Website',
    anwalt: '2.50', codeAn: Boolean(BESTELLSTRECKE_LIVE), schaltbar: false, hinweis: 'Freischalten nur über die Checkliste „Bestellstrecke freischalten" im Command Center und lib/flags.ts.',
  });
  raus.push({
    schluessel: 'flags.ZAHLUNG_LIVE', gruppe: 'flags', titel: 'Online-Kartenzahlung im Kunden-Shop', aus: 'Kartenzahlung im Shop',
    anwalt: '2.50', codeAn: Boolean(ZAHLUNG_LIVE), schaltbar: false, hinweis: 'Braucht den Webshop und ein verbundenes Zahlungskonto (Stripe/Mollie); Schalter in lib/flags.ts.',
  });
  raus.push({
    schluessel: 'kasse.modus', gruppe: 'kasse', titel: 'Kasse mit zertifizierter TSE', aus: 'Kasse liefert nur Demo-Signaturen',
    anwalt: '1.30', codeAn: false, schaltbar: false, hinweis: 'Erst mit Vertrag über eine zertifizierte TSE (Partner) — kein Schalter.',
  });
  for (const b of Object.keys(GESPERRTE_BEREICHE)) {
    raus.push({
      schluessel: `dossier.${slug(b)}`, gruppe: 'dossier', titel: `Dossiers „${b}"`, aus: 'Ganzer Bereich: Hinweisseite statt Dossier',
      anwalt: '3.20', codeAn: false, schaltbar: false, hinweis: 'Texte je Branche schreiben und den Bereich in lib/dossierFreigabe.ts freigeben.',
    });
  }
  for (const [b, liste] of Object.entries(FREI_IN_TEILBEREICH)) {
    raus.push({
      schluessel: `dossierTeil.${slug(b)}`, gruppe: 'dossier', titel: `Dossiers „${b}" (Teilbereich)`, aus: `Nur ${liste.length} Branchen ohne Kasse und Shop frei`,
      anwalt: 'Webshop + TSE', codeAn: false, schaltbar: false, hinweis: 'Öffnen, wenn Webshop und echte Kasse frei sind (Sperr-Gedächtnis Abschnitt 4).',
    });
  }
  return raus;
}

/** Schlüssel-Teil aus einem Bereichsnamen: nur Buchstaben, Umlaute umschreiben. */
export function slug(name: string): string {
  return name.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toLowerCase()).slice(0, 40) || 'bereich';
}

// --- Datenbank-Stand (freigabe_schalter) ---------------------------------------

export type DbZeile = {
  schluessel: string; an: boolean; vermerk: string | null; anwalt_frage: string | null;
  anwalt_antwort_datum: string | null; ausgeblendet: boolean; geaendert_am: string | null;
};

export type Stand = 'aus' | 'freigegeben' | 'an' | 'info';
export type ZeileMitStand = Schalter & { db: DbZeile | null; stand: Stand; ausgeblendet: boolean };

/**
 * Stand je Schalter (Teil 2): „an" = im Code an, „freigegeben" = in der
 * Freigabe-Zentrale freigegeben und damit wirksam, „aus" = gesperrt,
 * „info" = nur hier sichtbar, Öffnen anderswo. Unbekannte Datenbank-Zeilen
 * (Schalter gibt es im Code nicht mehr) werden ignoriert.
 */
export function zeilenMitStand(db: DbZeile[]): ZeileMitStand[] {
  const je = new Map(db.map((z) => [z.schluessel, z]));
  return alleSchalter().map((s) => {
    const d = je.get(s.schluessel) ?? null;
    const stand: Stand = !s.schaltbar ? (s.codeAn ? 'an' : 'info') : s.codeAn ? 'an' : d?.an === true ? 'freigegeben' : 'aus';
    return { ...s, db: d, stand, ausgeblendet: d?.ausgeblendet === true };
  });
}

export function uebersicht(z: ZeileMitStand[]): { gesamt: number; aus: number; freigegeben: number; an: number; ausgeblendet: number } {
  return {
    gesamt: z.length,
    aus: z.filter((x) => x.stand === 'aus' || x.stand === 'info').length,
    freigegeben: z.filter((x) => x.stand === 'freigegeben').length,
    an: z.filter((x) => x.stand === 'an').length,
    ausgeblendet: z.filter((x) => x.ausgeblendet).length,
  };
}

// --- Prüfungen (gleiche Regeln wie die Datenbank) -------------------------------

export const MIN_VERMERK = 20;
const istTag = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

export type FreigabeEingabe = {
  schluessel: string; vermerk: string; anwalt_frage: string; anwalt_antwort_datum: string;
  /** Paket 346: „Mitziehen beim Öffnen" aus dem Sperr-Gedächtnis erledigt (Haken). */
  mitgezogen?: boolean;
};

export function freigebenPruefen(e: FreigabeEingabe, heute: string): string[] {
  const f: string[] = [];
  const s = alleSchalter().find((x) => x.schluessel === e.schluessel);
  if (!s) f.push('Diesen Schalter gibt es nicht.');
  else if (!s.schaltbar) f.push('Dieser Bereich wird nicht hier freigegeben: ' + (s.hinweis ?? ''));
  else if (s.codeAn) f.push('Dieser Schalter ist im Code schon an.');
  const v = e.vermerk.trim();
  if (v.length < MIN_VERMERK) f.push(`Bitte einen Vermerk mit mindestens ${MIN_VERMERK} Zeichen (welche Anwalt-Antwort, was eingebaut ist).`);
  if (v.length > 1000) f.push('Der Vermerk ist zu lang (höchstens 1.000 Zeichen).');
  if (e.anwalt_frage.trim().length > 120) f.push('Anwalt-Frage: höchstens 120 Zeichen.');
  if (e.mitgezogen !== true) f.push('Bitte bestätigen, dass die Punkte „Mitziehen beim Öffnen" aus dem Sperr-Gedächtnis erledigt sind.');
  if (!istTag(e.anwalt_antwort_datum)) f.push('Bitte das Datum der Anwalt-Antwort eintragen.');
  else if (e.anwalt_antwort_datum > heute) f.push('Das Datum der Anwalt-Antwort liegt in der Zukunft.');
  return f;
}

/**
 * Ausblenden in drei getrennten Schritten. Schritt 1: Klick („Ausblenden …"),
 * Schritt 2: Rückfrage bestätigt, Schritt 3: Titel exakt eingetippt. Erst wenn
 * alle drei erfüllt sind, darf gesendet werden. Ein Doppelklick erfüllt nie
 * Schritt 3.
 */
export function ausblendenBereit(schritt: { geklickt: boolean; bestaetigt: boolean; getippt: string }, titel: string): boolean {
  return schritt.geklickt && schritt.bestaetigt && schritt.getippt.trim() === titel.trim() && titel.trim().length > 0;
}

export const AKTION_TEXT: Record<string, string> = {
  freigeben: 'Freigegeben', sperren: 'Wieder gesperrt', ausblenden: 'Ausgeblendet', einblenden: 'Wieder eingeblendet', vermerk: 'Vermerk geändert',
};
