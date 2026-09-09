// ============================================================================
// ARGONAUT OS · lib/setterHandeln.ts — G3: was am Ende des Gesprächs passiert
//
// Push 1 war die Gesprächsführung. Hier steht, was mit dem Ergebnis geschieht:
// ein Lead im CRM, die passende Stufe, und — wenn das Ziel ein Termin ist —
// der Weg in die echte Online-Buchung.
//
// WARUM DER SETTER NICHT SELBST BUCHT
// Es wäre einfacher, im Chat direkt einen Termin in die Datenbank zu schreiben.
// Genau das darf er nicht: Die Online-Buchung prüft serverseitig die Kapazität,
// hängt den Termin an eine Terminart und einen Mitarbeiter, schickt die
// Bestätigungsmail im Namen des Betriebs und sorgt dafür, dass er im
// Schichtplan auftaucht. Ein zweiter Buchungsweg daneben würde Termine
// erzeugen, die nirgends erscheinen — der Betrieb wüsste nichts davon.
//
// Deshalb: Der Setter sammelt die Angaben und führt zur echten Buchungsseite,
// mit allem vorausgefüllt, was der Besucher ihm schon erzählt hat. Ein Klick
// statt eines zweiten Formulars.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

import type { Ausbeute, Ziel } from './setter';

/** Die Lead-Stufen aus lib/leadStufen.ts — hier nur die zwei, die wir setzen. */
export type SetterStufe = 'eintragung' | 'termin_gebucht';

/**
 * Das Insert-Objekt für `leads`, mit denselben Feldern wie der
 * Website-Anfrage-Weg (/api/oeffentlich/web-anfrage) — damit ein Setter-Lead
 * im CRM aussieht wie jeder andere und nicht wie ein Sonderfall.
 */
export type LeadInsert = {
  owner_user_id: string;
  name: string;
  email: string | null;
  telefon: string | null;
  nachricht: string;
  ist_bestand: boolean;
  werbung_einwilligung: boolean;
  status: string;
  stufe: SetterStufe;
  quelle: string;
};

/** Woher der Lead kam — steht später im CRM als Quelle. */
export const KANAL_QUELLE: Record<string, string> = {
  website: 'Website-Berater',
  whatsapp: 'WhatsApp-Berater',
  social: 'Social-Berater',
  telefon: 'Telefon-Berater',
};

export function quelleFuerKanal(kanal: string | null | undefined): string {
  const k = String(kanal ?? '').trim().toLowerCase();
  return KANAL_QUELLE[k] ?? 'KI-Berater';
}

/**
 * Baut den Lead. Bewusst KEINE Werbe-Einwilligung: Wer im Chat eine Frage
 * stellt, hat damit nicht in Newsletter eingewilligt. Das wäre der Fehler,
 * der einen Betrieb eine Abmahnung kostet.
 */
export function baueLead(opts: {
  ownerId: string;
  ausbeute: Ausbeute;
  kanal: string;
  stufe?: SetterStufe;
}): LeadInsert {
  const a = opts.ausbeute;
  const name = (a?.name || '').trim() || 'Unbekannt';
  return {
    owner_user_id: opts.ownerId,
    name,
    email: (a?.email || '').trim() || null,
    telefon: (a?.telefon || '').trim() || null,
    nachricht: (a?.nachricht || '').trim(),
    ist_bestand: false,
    werbung_einwilligung: false,
    status: 'neu',
    stufe: opts.stufe ?? 'eintragung',
    quelle: quelleFuerKanal(opts.kanal),
  };
}

/**
 * Der Link in die echte Online-Buchung, mit vorausgefüllten Angaben.
 * Gibt '' zurück, wenn kein Slug hinterlegt ist — dann bietet der Setter
 * keinen Termin an, statt auf eine tote Seite zu zeigen.
 */
export function buchungsLink(opts: {
  basis: string;
  slug: string | null | undefined;
  ausbeute: Ausbeute;
}): string {
  const basis = String(opts.basis || '').trim().replace(/\/+$/, '');
  const slug = String(opts.slug ?? '').trim().toLowerCase();
  if (!basis || !slug) return '';
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) return '';

  const p = new URLSearchParams();
  const a = opts.ausbeute;
  if (a?.name?.trim()) p.set('name', a.name.trim().slice(0, 120));
  if (a?.email?.trim()) p.set('email', a.email.trim().slice(0, 160));
  if (a?.telefon?.trim()) p.set('telefon', a.telefon.trim().slice(0, 60));
  if (a?.nachricht?.trim()) p.set('notiz', a.nachricht.trim().slice(0, 500));

  const frage = p.toString();
  return `${basis}/buchen/${slug}${frage ? '?' + frage : ''}`;
}

/**
 * Der Satz, mit dem der Setter das Gespräch schließt.
 *
 * Der Link steht im Klartext in der Antwort: Das Chat-Widget zeigt reinen Text,
 * kein HTML — eine schöne Schaltfläche gäbe es hier nicht, eine kaputte
 * Verlinkung schon. Ein sichtbarer Link funktioniert überall.
 */
export function abschlussText(opts: {
  ziel: Ziel;
  link: string;
  hatKontakt: boolean;
}): string {
  if (opts.ziel === 'termin' && opts.link) {
    return `Sie können hier direkt einen Termin wählen — Ihre Angaben sind schon eingetragen: ${opts.link}`;
  }
  if (opts.ziel === 'termin' && !opts.link) {
    return opts.hatKontakt
      ? 'Vielen Dank! Wir melden uns zeitnah bei Ihnen, um einen Termin abzustimmen.'
      : 'Damit wir einen Termin abstimmen können, brauchen wir noch eine E-Mail-Adresse oder Telefonnummer.';
  }
  if (opts.ziel === 'rueckruf') {
    return opts.hatKontakt
      ? 'Vielen Dank! Wir rufen Sie zurück.'
      : 'Für einen Rückruf brauchen wir noch Ihre Telefonnummer.';
  }
  return opts.hatKontakt
    ? 'Vielen Dank! Ihre Anfrage ist angekommen, wir melden uns.'
    : 'Damit wir uns melden können, brauchen wir noch eine E-Mail-Adresse oder Telefonnummer.';
}

/**
 * Welche Stufe bekommt der Lead?
 *
 * Bewusst NICHT `termin_gebucht`, nur weil der Setter einen Link gezeigt hat —
 * gebucht ist erst, was der Kunde auch abgeschickt hat. Die Online-Buchung
 * setzt die Stufe selbst hoch. Alles andere wäre eine geschönte Pipeline.
 */
export function stufeNachGespraech(): SetterStufe {
  return 'eintragung';
}
