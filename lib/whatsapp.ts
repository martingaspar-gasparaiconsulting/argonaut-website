// ============================================================================
// ARGONAUT OS · lib/whatsapp.ts — reine Helfer fuer WhatsApp-Marketing
// (Marketing-Autopilot · WhatsApp Paket 1 · Fundament, anbieter-neutral)
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen
// (node-testbar). Der eigentliche Versand kommt in Paket 2, sobald der Zugang
// (Meta Cloud API ODER 360dialog) beim Betrieb hinterlegt ist.
// ============================================================================

export type WhatsappAnbieterId = 'meta' | 'dialog360';

export type WhatsappAnbieter = {
  id: WhatsappAnbieterId;
  name: string;
  kurz: string;
  setupHinweis: string;
  kostenKurz: string;   // eine Zeile fuer die Transparenz-Box
  link: string;         // offizielle Preisseite
};

/**
 * Die zwei waehlbaren Wege — immer beide anbieten (Martin-Vorgabe).
 * Preis-Infos: Struktur + Groessenordnung; die genauen Preise legen Meta bzw.
 * 360dialog fest und koennen sich aendern (Stand 07/2026).
 */
export const WHATSAPP_ANBIETER: WhatsappAnbieter[] = [
  {
    id: 'meta',
    name: 'Eigene Nummer (Meta Cloud API)',
    kurz: 'Direkt über Meta',
    setupHinweis: 'Sie verbinden eine eigene WhatsApp-Business-Nummer über ein kostenloses Meta-Business-Konto (offizieller Weg).',
    kostenKurz: 'Meta-Zugang kostenlos · Gebühr pro versendeter Vorlagen-Nachricht (Meta-Preise, je nach Land) · kein monatlicher Grundpreis',
    link: 'https://developers.facebook.com/docs/whatsapp/pricing',
  },
  {
    id: 'dialog360',
    name: '360dialog (deutscher Anbieter)',
    kurz: 'Über 360dialog',
    setupHinweis: 'Einfacheres Setup über den deutschen Anbieter 360dialog — praktisch, wenn Sie sich nicht selbst um das Meta-Konto kümmern möchten.',
    kostenKurz: 'ab ca. 49 €/Monat je Nummer (Premium 99 €) + dieselben Meta-Nachrichtengebühren (ohne Aufschlag weitergegeben)',
    link: 'https://360dialog.com/pricing',
  },
];

export function anbieterFuer(id: string | null | undefined): WhatsappAnbieter | null {
  return WHATSAPP_ANBIETER.find((a) => a.id === id) ?? null;
}

/** WhatsApp-Nachrichten-Kategorien (Meta) mit deutschen Labels. */
export const WHATSAPP_KATEGORIEN: { id: string; label: string; hinweis: string }[] = [
  { id: 'marketing', label: 'Marketing', hinweis: 'Angebote, Aktionen, Neuigkeiten — braucht Einwilligung, immer gebührenpflichtig.' },
  { id: 'utility', label: 'Service/Hinweis (Utility)', hinweis: 'Bestell- oder Termin-Infos zu einem laufenden Vorgang.' },
  { id: 'authentication', label: 'Bestätigungscode', hinweis: 'Einmal-Codes / Login-Bestätigungen.' },
];

/** Slug/Name einer WhatsApp-Vorlage: nur Kleinbuchstaben, Ziffern, Unterstrich. */
export function vorlagenNameNormalisieren(roh: string | null | undefined): string {
  return (roh || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Telefonnummer in internationale Form bringen (Anzeige/Prüfung).
 * 00.. -> +.. ; führende 0 (national) -> +49 (Default DE) ; sonst + voranstellen.
 */
export function telefonNormalisieren(roh: string | null | undefined): string {
  let s = (roh || '').replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (s.startsWith('+')) { /* schon international */ }
  else if (s.startsWith('0')) s = '+49' + s.slice(1);
  else s = '+' + s;
  return s;
}

/** Grobe Plausibilität einer internationalen Nummer (+ und 8–15 Ziffern). */
export function istTelefonPlausibel(roh: string | null | undefined): boolean {
  const s = telefonNormalisieren(roh);
  return /^\+\d{8,15}$/.test(s);
}

/** Findet die Platzhalter {{1}}, {{2}} … in einem Vorlagentext (eindeutig, sortiert). */
export function platzhalterFinden(text: string | null | undefined): string[] {
  const gefunden = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || '')) !== null) gefunden.add(parseInt(m[1], 10));
  return Array.from(gefunden).sort((a, b) => a - b).map((n) => `{{${n}}}`);
}

/** Ersetzt {{1}}, {{2}} … durch Beispielwerte (fehlt einer -> „[Beispiel]"). */
export function vorschauMitBeispiel(text: string | null | undefined, beispiele: string[]): string {
  return (text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_ganz, nr) => {
    const i = parseInt(nr, 10) - 1;
    const w = beispiele[i];
    return w && w.trim() ? w : '[Beispiel]';
  });
}

export const VORLAGE_MAX_ZEICHEN = 1024;

/** Prüft eine Vorlage vor dem Speichern. Gibt { ok, fehler[] } zurück. */
export function validiereVorlage(v: { name?: string | null; inhalt?: string | null }): { ok: boolean; fehler: string[] } {
  const fehler: string[] = [];
  const name = vorlagenNameNormalisieren(v?.name);
  const inhalt = (v?.inhalt || '').trim();
  if (name.length < 3) fehler.push('Bitte einen Vorlagen-Namen mit mindestens 3 Zeichen (nur Kleinbuchstaben, Ziffern, Unterstrich).');
  if (!inhalt) fehler.push('Bitte einen Nachrichtentext eingeben.');
  if (inhalt.length > VORLAGE_MAX_ZEICHEN) fehler.push(`Der Text ist zu lang (max. ${VORLAGE_MAX_ZEICHEN} Zeichen).`);
  return { ok: fehler.length === 0, fehler };
}

/** Vorlagen zählen: gesamt / freigegeben. */
export function zaehleVorlagen(liste: { status?: string | null }[]): { gesamt: number; freigegeben: number } {
  const l = liste || [];
  let freigegeben = 0;
  for (const x of l) if (x?.status === 'freigegeben') freigegeben++;
  return { gesamt: l.length, freigegeben };
}
