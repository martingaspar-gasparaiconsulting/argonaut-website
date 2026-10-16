// ============================================================================
// ARGONAUT OS · lib/gespraechErgebnis.ts — Paket VK6 Gespraechsergebnis (16.10.2026)
// Reine Logik (node-getestet in tests/gespraechErgebnisVK6.test.mjs):
//  - Ergebnis-Formular nach jedem Verkaufsgespraech pruefen und bereinigen
//    (erschienen, angeboten, Ergebnis, vereinbart, Anzahlung, Haupteinwand)
//  - welche Lead-Stufe daraus folgt
//  - Auswertung: Abschlussquote, vereinbart, Anzahlung, haeufigste Einwaende (VK7/VK9)
// Geld nur ueber lib/zahlen (leseBetrag/inCent) — nie ein eigener Zahlenleser.
// ============================================================================

import { leseBetrag, inCent } from './zahlen';
import { rang, stufeOderStandard } from './leadStufen';

export const ERGEBNISSE = [
  { key: 'abgeschlossen', label: 'Abgeschlossen', farbe: 'gruen' },
  { key: 'offen', label: 'Noch offen', farbe: 'gold' },
  { key: 'verloren', label: 'Kein Abschluss', farbe: 'rot' },
  { key: 'nicht_erschienen', label: 'Nicht erschienen', farbe: 'grau' },
] as const;
export type Ergebnis = (typeof ERGEBNISSE)[number]['key'];

/** Haupteinwand — gleiche Liste wie der Datenbank-Check in p414. */
export const EINWAENDE = [
  { key: 'preis', label: 'Zu teuer / Preis' },
  { key: 'zeitpunkt', label: 'Jetzt nicht / später' },
  { key: 'partner', label: 'Muss mit Partner/Chef sprechen' },
  { key: 'vergleich', label: 'Will noch vergleichen' },
  { key: 'vertrauen', label: 'Zweifel an Qualität/Firma' },
  { key: 'bedarf', label: 'Bedarf unklar' },
  { key: 'finanzierung', label: 'Finanzierung fehlt' },
  { key: 'sonstiges', label: 'Sonstiges' },
] as const;
export type Einwand = (typeof EINWAENDE)[number]['key'];

export function istErgebnis(x: unknown): x is Ergebnis {
  return ERGEBNISSE.some((e) => e.key === x);
}
export function istEinwand(x: unknown): x is Einwand {
  return EINWAENDE.some((e) => e.key === x);
}

export type GespraechEingabe = {
  ergebnis?: unknown;
  angeboten?: unknown;
  vereinbart?: unknown; // Text aus dem Feld, z. B. "12.500" oder "12.500,50"
  anzahlung?: unknown;
  einwand?: unknown;
  einwand_text?: unknown;
  naechster_schritt?: unknown;
  folgetermin_am?: unknown; // ISO
  notiz?: unknown;
};

export type GespraechSauber = {
  ergebnis: Ergebnis;
  angeboten: boolean;
  vereinbart_cent: number | null;
  anzahlung_cent: number | null;
  einwand: Einwand | null;
  einwand_text: string | null;
  naechster_schritt: string | null;
  folgetermin_am: string | null;
  notiz: string | null;
};

function text(v: unknown, max: number): string | null {
  const s = String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, ' ').trim().slice(0, max);
  return s || null;
}

function betragCent(v: unknown): { cent: number | null; fehler: boolean } {
  const roh = String(v ?? '').replace(/€/g, '').trim();
  if (!roh) return { cent: null, fehler: false };
  const b = leseBetrag(roh);
  if (b === null || b < 0) return { cent: null, fehler: true };
  return { cent: inCent(b), fehler: false };
}

/**
 * Prueft das Formular. Liefert entweder { ok: true, wert } oder { ok: false, fehler: [...] }.
 * Regeln:
 *  - Ergebnis Pflicht
 *  - „nicht erschienen": keine Betraege, nicht angeboten, kein Einwand
 *  - „abgeschlossen": vereinbarter Betrag Pflicht und > 0; Anzahlung ≤ vereinbart
 *  - „kein Abschluss": Haupteinwand Pflicht; „Sonstiges" braucht einen Text
 *  - „noch offen": naechster Schritt ODER Folgetermin Pflicht (sonst bleibt der Lead liegen)
 *  - Folgetermin nicht in der Vergangenheit
 */
export function ergebnisPruefen(e: GespraechEingabe, jetzt: Date = new Date()):
  { ok: true; wert: GespraechSauber } | { ok: false; fehler: string[] } {
  const fehler: string[] = [];
  if (!istErgebnis(e.ergebnis)) return { ok: false, fehler: ['Bitte ein Ergebnis wählen.'] };
  const ergebnis = e.ergebnis;
  const v = betragCent(e.vereinbart);
  const a = betragCent(e.anzahlung);
  if (v.fehler) fehler.push('Der vereinbarte Betrag ist nicht lesbar.');
  if (a.fehler) fehler.push('Die Anzahlung ist nicht lesbar.');
  let einwand: Einwand | null = istEinwand(e.einwand) ? e.einwand : null;
  let einwandText = text(e.einwand_text, 500);
  const schritt = text(e.naechster_schritt, 500);
  let folge: string | null = null;
  if (e.folgetermin_am) {
    const d = new Date(String(e.folgetermin_am));
    if (Number.isNaN(d.getTime())) fehler.push('Der Folgetermin ist kein gültiges Datum.');
    else if (d.getTime() < jetzt.getTime() - 60000) fehler.push('Der Folgetermin liegt in der Vergangenheit.');
    else folge = d.toISOString();
  }
  let angeboten = e.angeboten === true;
  let vereinbart = v.cent;
  let anzahlung = a.cent;

  if (ergebnis === 'nicht_erschienen') {
    angeboten = false; vereinbart = null; anzahlung = null; einwand = null; einwandText = null;
  }
  if (ergebnis === 'abgeschlossen') {
    if (!v.fehler && (vereinbart === null || vereinbart <= 0)) fehler.push('Bei „Abgeschlossen" bitte den vereinbarten Betrag eintragen.');
  }
  if (vereinbart !== null && anzahlung !== null && anzahlung > vereinbart) fehler.push('Die Anzahlung ist höher als der vereinbarte Betrag.');
  if (ergebnis === 'verloren' && !einwand) fehler.push('Bei „Kein Abschluss" bitte den Haupteinwand wählen.');
  if (einwand === 'sonstiges' && !einwandText) fehler.push('Bei „Sonstiges" bitte den Einwand kurz beschreiben.');
  if (!einwand) einwandText = null;
  if (ergebnis === 'offen' && !schritt && !folge) fehler.push('Bei „Noch offen" bitte den nächsten Schritt oder einen Folgetermin eintragen.');

  if (fehler.length) return { ok: false, fehler };
  return {
    ok: true,
    wert: {
      ergebnis, angeboten, vereinbart_cent: vereinbart, anzahlung_cent: anzahlung,
      einwand, einwand_text: einwandText, naechster_schritt: schritt, folgetermin_am: folge, notiz: text(e.notiz, 2000),
    },
  };
}

/**
 * Neue Lead-Stufe nach dem Gespraech — oder null, wenn nichts zu aendern ist.
 * Nie zurueck: ein Kunde bleibt Kunde, „noch offen" hebt nur bis „Termin gehalten".
 * „Kein Abschluss" setzt „verloren" nur, wenn der Lead noch kein Kunde ist.
 */
export function neueLeadStufe(aktuell: unknown, ergebnis: Ergebnis): 'kunde' | 'verloren' | 'termin_gehalten' | null {
  const ist = stufeOderStandard(aktuell);
  const ziel = leadStufeNach(ergebnis);
  if (!ziel || ziel === ist) return null;
  if (ziel === 'verloren') return ist === 'kunde' ? null : 'verloren';
  if (ist === 'verloren') return ziel === 'kunde' ? 'kunde' : null;
  return rang(ziel) > rang(ist) ? ziel : null;
}

/** Welche Lead-Stufe folgt (null = Stufe bleibt). */
export function leadStufeNach(ergebnis: Ergebnis): 'kunde' | 'verloren' | 'termin_gehalten' | null {
  if (ergebnis === 'abgeschlossen') return 'kunde';
  if (ergebnis === 'verloren') return 'verloren';
  if (ergebnis === 'offen') return 'termin_gehalten';
  return null;
}

export type GespraechZeile = {
  ergebnis: string;
  closer_user_id?: string | null;
  vereinbart_cent?: number | null;
  anzahlung_cent?: number | null;
  einwand?: string | null;
  angeboten?: boolean | null;
};

export type GespraechAuswertung = {
  gespraeche: number;      // ohne „nicht erschienen"
  nichtErschienen: number;
  abgeschlossen: number;
  angeboten: number;
  quote: number | null;     // Abschluss ÷ gefuehrte Gespraeche, ganze Prozent
  vereinbartCent: number;
  anzahlungCent: number;
  einwaende: { key: string; label: string; anzahl: number }[]; // absteigend, nur > 0
};

export function auswerten(zeilen: GespraechZeile[]): GespraechAuswertung {
  let gespraeche = 0, nicht = 0, ab = 0, ang = 0, ver = 0, anz = 0;
  const zaehler = new Map<string, number>();
  for (const z of zeilen) {
    if (z.ergebnis === 'nicht_erschienen') { nicht++; continue; }
    if (!istErgebnis(z.ergebnis)) continue;
    gespraeche++;
    if (z.angeboten) ang++;
    if (z.ergebnis === 'abgeschlossen') {
      ab++;
      ver += Math.max(0, Number(z.vereinbart_cent ?? 0) || 0);
      anz += Math.max(0, Number(z.anzahlung_cent ?? 0) || 0);
    }
    if (z.einwand && istEinwand(z.einwand)) zaehler.set(z.einwand, (zaehler.get(z.einwand) ?? 0) + 1);
  }
  const einwaende = EINWAENDE.map((e) => ({ key: e.key as string, label: e.label as string, anzahl: zaehler.get(e.key) ?? 0 }))
    .filter((e) => e.anzahl > 0)
    .sort((a, b) => b.anzahl - a.anzahl);
  return {
    gespraeche, nichtErschienen: nicht, abgeschlossen: ab, angeboten: ang,
    quote: gespraeche ? Math.round((ab / gespraeche) * 100) : null,
    vereinbartCent: ver, anzahlungCent: anz, einwaende,
  };
}

export function ergebnisLabel(k: string): string {
  return ERGEBNISSE.find((e) => e.key === k)?.label ?? k;
}
export function einwandLabel(k: string | null | undefined): string {
  return k ? (EINWAENDE.find((e) => e.key === k)?.label ?? k) : '';
}

// ── Teil 2: Uebergabe an die Umsetzung + Auswertung je Closer ─────────────────

export const UEBERGABE_ZIELE = ['auftrag', 'projekt', 'portal'] as const;
export type UebergabeZiel = (typeof UEBERGABE_ZIELE)[number];
export function istUebergabeZiel(x: unknown): x is UebergabeZiel {
  return (UEBERGABE_ZIELE as readonly string[]).includes(String(x));
}

/** Nur ein abgeschlossenes Gespraech geht in die Umsetzung — und jedes Ziel nur einmal. */
export function uebergabePruefen(
  g: { ergebnis: string; auftrag_id?: string | null; projekt_id?: string | null; portal_mail_am?: string | null },
  ziel: UebergabeZiel,
): string | null {
  if (g.ergebnis !== 'abgeschlossen') return 'Nur ein abgeschlossenes Gespräch geht in die Umsetzung.';
  if (ziel === 'auftrag' && g.auftrag_id) return 'Der Auftrag ist schon angelegt.';
  if (ziel === 'projekt' && g.projekt_id) return 'Das Projekt ist schon angelegt.';
  if (ziel === 'portal' && g.portal_mail_am) return 'Die Willkommens-Mail ist schon verschickt.';
  return null;
}

function kurz(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

/** Titel fuer Auftrag/Projekt aus Lead-Angaben — nie leer. */
export function umsetzungTitel(art: 'Auftrag' | 'Projekt', name: unknown, leistung: unknown): string {
  const n = kurz(name, 80);
  const l = kurz(leistung, 80);
  if (n && l) return `${art} ${n} – ${l}`.slice(0, 160);
  return `${art} ${n || l || 'aus Verkaufsgespräch'}`.slice(0, 160);
}

/** Notiz-Zeile fuer Angebot/Projekt: vereinbart und angezahlt in deutscher Schreibweise. */
export function uebergabeNotiz(g: { vereinbart_cent?: number | null; anzahlung_cent?: number | null; gespraech_am?: string | null }): string {
  const fmt = (c: number) => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const teile: string[] = [];
  if (g.gespraech_am) {
    const d = new Date(g.gespraech_am);
    if (!Number.isNaN(d.getTime())) teile.push(`Verkaufsgespräch vom ${d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`);
  }
  if (g.vereinbart_cent) teile.push(`vereinbart ${fmt(g.vereinbart_cent)}`);
  if (g.anzahlung_cent) teile.push(`angezahlt ${fmt(g.anzahlung_cent)}`);
  return teile.join(' · ');
}

/** Willkommens-Mail ans Kundenportal (gesiezt, ohne Werbung). */
export function willkommensText(firma: string, mitPortal: boolean): { betreff: string; absaetze: string[] } {
  const f = kurz(firma, 120) || 'uns';
  return {
    betreff: `Willkommen bei ${f}`,
    absaetze: [
      'vielen Dank für Ihr Vertrauen — wir freuen uns auf die Zusammenarbeit.',
      mitPortal
        ? 'Über Ihren persönlichen Zugang sehen Sie jederzeit Ihre Termine, Rechnungen und — sobald es losgeht — den Fortschritt Ihres Auftrags.'
        : 'Wir melden uns in Kürze mit den nächsten Schritten.',
      'Bitte geben Sie den Link nicht weiter; er führt ohne Passwort zu Ihren Unterlagen. Bei Fragen antworten Sie einfach auf diese E-Mail.',
    ],
  };
}

/** Auswertung je Closer (fuer die Verkaufsteam-Seite und VK7). */
export function jeCloser(zeilen: GespraechZeile[]): { closer: string; auswertung: GespraechAuswertung }[] {
  const gruppen = new Map<string, GespraechZeile[]>();
  for (const z of zeilen) {
    const k = z.closer_user_id || 'ohne';
    const l = gruppen.get(k) ?? [];
    l.push(z);
    gruppen.set(k, l);
  }
  return [...gruppen.entries()]
    .map(([closer, l]) => ({ closer, auswertung: auswerten(l) }))
    .sort((a, b) => b.auswertung.abgeschlossen - a.auswertung.abgeschlossen || b.auswertung.gespraeche - a.auswertung.gespraeche);
}
