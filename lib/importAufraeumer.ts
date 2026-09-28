// ============================================================
// ARGONAUT OS · lib/importAufraeumer.ts — Umzug Schritt 5: KI-Aufraeumer
// (Paket 145, 28.09.2026)
//
// Fuer Dateien, die keine saubere Tabelle sind (PDF-Preisliste, Word-Liste,
// E-Mail, Excel mit Titelzeilen und Zwischensummen): Der Nutzer fuegt den
// TEXT ein, die KI ordnet ihn den Feldern des gewaehlten Import-Ziels zu,
// daraus wird eine CSV mit den Feldnamen als Kopfzeile — und die laeuft
// durch GENAU denselben Motor wie jede andere Datei (Pruefen, Vorschau,
// Rueckgaengig). Die KI schreibt nie selbst in die Datenbank.
//
// Reine Logik, keine Hooks, kein Supabase — node-getestet.
//   aufraeumerErlaubt  Welche Ziele (nicht: Personaldaten, Bestand, Gesperrtes)
//   kiFelder           Die Felder, die die KI fuellen darf
//   aufraeumerPrompt   Systemanweisung fuer genau dieses Ziel
//   extrahiereJsonArray / antwortZuZeilen  Antwort robust lesen, nur bekannte Felder
//   zeilenZuCsv        -> CSV (Semikolon, Feldnamen als Kopf) fuer den Motor
//   teileText          grosse Texte an Zeilengrenzen in Portionen schneiden
// ============================================================

import { zielDef, type ImportZiel, type ZielFeld } from './importParser';
import { KI_NIE_GRUND } from './anwaltFreigabe';

/** Hoechstens so viele Zeichen je KI-Anfrage (die Route prueft dasselbe). */
export const AUFRAEUMER_MAX_ZEICHEN = 18000;
/** Hoechstens so viele Portionen je Durchgang (Kosten-Deckel). */
export const AUFRAEUMER_MAX_PORTIONEN = 10;
/** Hoechstens so viele Zeilen aus einer Antwort. */
export const AUFRAEUMER_MAX_ZEILEN = 1000;

/**
 * Personaldaten (Beschaeftigtendaten) gehen nicht an einen KI-Dienst, solange
 * das nicht rechtlich geprueft ist; Bestandszaehlungen brauchen keine KI.
 */
const GESPERRT: Record<string, string> = {
  mitarbeiter: 'Personaldaten gibt ARGONAUT nicht an den KI-Dienst weiter — bitte als Tabelle (Excel/CSV) importieren.',
  mitarbeiter_qualifikation: 'Personaldaten gibt ARGONAUT nicht an den KI-Dienst weiter — bitte als Tabelle (Excel/CSV) importieren.',
  bestand_filiale: 'Zählstände bitte als Tabelle importieren — hier hilft die KI nicht.',
};

export function aufraeumerErlaubt(zielKey: string): { ok: true } | { ok: false; grund: string } {
  const z = zielDef(zielKey);
  if (!z) return { ok: false, grund: 'Unbekanntes Import-Ziel.' };
  if (GESPERRT[zielKey]) return { ok: false, grund: GESPERRT[zielKey] };
  // Paket 153: Gesundheit, Tier, Hilfsmittel, Akten — nie an den KI-Dienst, auch nach der Freigabe.
  if (z.anwalt) return { ok: false, grund: KI_NIE_GRUND };
  return { ok: true };
}

/**
 * Felder, die die KI fuellen darf: genau die Spalten der Mustervorlage
 * (Namens-/Adress-Teile und Helfer stehen dort nicht — die KI liefert gleich
 * den ganzen Namen).
 */
export function kiFelder(ziel: ImportZiel): ZielFeld[] {
  return ziel.felder.filter((f) => !f.nichtInVorlage);
}

export function aufraeumerPrompt(ziel: ImportZiel): string {
  const felder = kiFelder(ziel).map((f) => {
    const art = f.typ === 'zahl' ? 'Zahl' : f.typ === 'datum' ? 'Datum' : f.typ === 'jaNein' ? 'ja/nein' : f.typ === 'datumZeit' || f.typ === 'zeitpunkt' ? 'Datum mit Uhrzeit' : 'Text';
    return `- "${f.key}": ${f.label} (${art}${f.pflicht ? ', Pflicht' : ''})${f.hinweis ? ` — ${f.hinweis}` : ''}`;
  }).join('\n');
  return `Du bist ARGONAUT und verwandelst unordentliche Listen in saubere Daten für den Import „${ziel.label}". `
    + 'Der Betriebsinhaber fügt Text ein, der aus einer PDF, einem Word-Dokument, einer E-Mail oder einer unübersichtlichen Excel-Liste stammt.\n\n'
    + 'Gib AUSSCHLIESSLICH ein JSON-Array zurück — kein Fließtext, keine Erklärung, keine Markdown-Zäune. '
    + 'Jedes Element ist ein Datensatz mit genau diesen Schlüsseln (fehlende Werte weglassen):\n'
    + `${felder}\n\n`
    + 'Regeln:\n'
    + '- Erfinde nichts. Was nicht im Text steht, lässt du weg.\n'
    + '- Übernimm Zahlen, Beträge und Daten GENAU so, wie sie im Text stehen (z. B. „1.234,56" oder „03.07.2026") — nicht umrechnen, nicht runden.\n'
    + '- Titelzeilen, Spaltenüberschriften, Seitenzahlen, Zwischen- und Gesamtsummen sowie Werbetext ignorierst du.\n'
    + '- Bankverbindungen (IBAN, BIC, Kontonummer), Kartennummern und Einwilligungen (Newsletter, Werbung) gibst du NIE zurück.\n'
    + '- Passt ein Wert in kein Feld, hängst du ihn als „Bezeichnung: Wert" an ein Notiz- oder Beschreibungsfeld an, falls es eines gibt.\n'
    + '- Ist kein Datensatz erkennbar, gib [] zurück.';
}

/** Rohantwort der KI robust in ein Array verwandeln (Zaeune, Vor-/Nachtext). */
export function extrahiereJsonArray(roh: string): unknown[] {
  let s = String(roh ?? '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = s.indexOf('['); const e = s.lastIndexOf(']');
  if (a === -1 || e <= a) throw new Error('keine Liste in der Antwort');
  s = s.slice(a, e + 1);
  const x = JSON.parse(s);
  return Array.isArray(x) ? x : [];
}

/** Sieht ein Wert wie eine IBAN aus (auch mit Leerzeichen, auch mitten im Text)? */
export function enthaeltIban(wert: string): boolean {
  return /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/.test(String(wert ?? '').toUpperCase());
}

/**
 * Nur bekannte Schluessel, Werte als Text (hoechstens 2.000 Zeichen), leere
 * Datensaetze weg, hoechstens AUFRAEUMER_MAX_ZEILEN. Ein Wert, der wie eine
 * IBAN aussieht, wird verworfen — egal, in welchem Feld er steht.
 */
export function antwortZuZeilen(liste: readonly unknown[], ziel: ImportZiel): { zeilen: Record<string, string>[]; verworfen: number } {
  const erlaubt = new Set(kiFelder(ziel).map((f) => f.key));
  const zeilen: Record<string, string>[] = [];
  let verworfen = 0;
  for (const el of liste) {
    if (zeilen.length >= AUFRAEUMER_MAX_ZEILEN) { verworfen++; continue; }
    if (!el || typeof el !== 'object' || Array.isArray(el)) { verworfen++; continue; }
    const z: Record<string, string> = {};
    for (const [k, v] of Object.entries(el as Record<string, unknown>)) {
      if (!erlaubt.has(k) || v === null || v === undefined) continue;
      const t = (typeof v === 'object' ? '' : String(v)).replace(/[\r\n]+/g, ' ').trim().slice(0, 2000);
      if (!t || enthaeltIban(t)) continue;
      z[k] = t;
    }
    if (Object.keys(z).length === 0) { verworfen++; continue; }
    zeilen.push(z);
  }
  return { zeilen, verworfen };
}

/** Die Datensaetze als CSV — Kopfzeile = Feldnamen (so erkennt der Motor jede Spalte). */
export function zeilenZuCsv(zeilen: readonly Record<string, string>[], ziel: ImportZiel): string {
  const felder = kiFelder(ziel).filter((f) => zeilen.some((z) => z[f.key] !== undefined && z[f.key] !== ''));
  const raus = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const kopf = felder.map((f) => raus(f.label));
  const koerper = zeilen.map((z) => felder.map((f) => raus(z[f.key] ?? '')).join(';'));
  return [kopf.join(';'), ...koerper].join('\r\n') + '\r\n';
}

/**
 * Text an Zeilengrenzen in Portionen <= max schneiden (eine ueberlange Zeile
 * wird hart geteilt). Mehr als AUFRAEUMER_MAX_PORTIONEN -> `zuViel`.
 */
export function teileText(text: string, max: number = AUFRAEUMER_MAX_ZEICHEN): { teile: string[]; zuViel: boolean } {
  const teile: string[] = [];
  let aktuell = '';
  for (const zeile of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    let rest = zeile;
    while (rest.length > max) { if (aktuell) { teile.push(aktuell); aktuell = ''; } teile.push(rest.slice(0, max)); rest = rest.slice(max); }
    if (aktuell.length + rest.length + 1 > max) { teile.push(aktuell); aktuell = ''; }
    aktuell = aktuell ? `${aktuell}\n${rest}` : rest;
  }
  if (aktuell.trim()) teile.push(aktuell);
  const echte = teile.filter((t) => t.trim());
  return { teile: echte, zuViel: echte.length > AUFRAEUMER_MAX_PORTIONEN };
}
