// ============================================================================
// ARGONAUT OS · lib/dokumentAuslesen.ts — Dokumente selbst auslesen (Paket PG3)
//
// Bisher hat ein n8n-Ablauf hochgeladene Dokumente in Abschnitte zerlegt und
// für die Suche aufbereitet. Auf n8n läuft nur noch Gotenberg — deshalb
// macht das jetzt das System selbst (Route /api/documents/trigger-analysis,
// die der Upload schon immer aufruft, die es aber nicht gab).
//
// Hier liegt nur die reine Logik (getestet in tests/dokumentAuslesenP80.test.mjs):
//   · welcher Dateityp wird wie gelesen
//   · Text säubern
//   · in Abschnitte zerlegen (an Absätzen/Sätzen, mit etwas Überlappung,
//     damit ein Gedanke an der Schnittkante nicht verloren geht)
//   · in Stapel für die Embedding-Schnittstelle aufteilen
//   · Text einer Wissens-Notiz
// ============================================================================

export type Leser = 'pdf' | 'docx' | 'xlsx' | 'text' | null;

/** Welcher Leser passt? Nach Dateiendung, sonst nach documents.file_type. */
export function leserFuer(dateiname: string, fileType?: string | null): Leser {
  const e = String(dateiname ?? '').toLowerCase().split('.').pop() ?? '';
  const t = String(fileType ?? '').toUpperCase();
  if (e === 'pdf' || t === 'PDF') return 'pdf';
  if (e === 'docx' || t === 'DOCX') return 'docx';
  if (e === 'xlsx' || e === 'xlsm' || t === 'XLSX') return 'xlsx';
  if (['txt', 'md', 'csv'].includes(e) || t === 'TXT' || t === 'CSV') return 'text';
  return null;
}

export const MAX_BYTES = 25 * 1024 * 1024;
export const ZIEL_ZEICHEN = 1200;
export const UEBERLAPPUNG = 150;
export const MAX_ABSCHNITTE = 300;
export const STAPEL = 64;

/** Steuerzeichen raus, Silbentrennung am Zeilenende zusammen, Leerraum ordnen. */
export function saeubereText(roh: string): string {
  return String(roh ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Einen zu langen Absatz an Satzgrenzen teilen (notfalls hart). */
function teileLang(absatz: string, max: number): string[] {
  if (absatz.length <= max) return [absatz];
  const saetze = absatz.split(/(?<=[.!?:;])\s+/);
  const out: string[] = [];
  let akt = '';
  for (const s of saetze) {
    if (s.length > max) {
      if (akt) { out.push(akt); akt = ''; }
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
      continue;
    }
    if ((akt ? akt.length + 1 : 0) + s.length > max) { out.push(akt); akt = s; }
    else akt = akt ? `${akt} ${s}` : s;
  }
  if (akt) out.push(akt);
  return out;
}

/**
 * Text in Abschnitte von etwa `ziel` Zeichen. Jeder Abschnitt ab dem zweiten
 * beginnt mit dem Ende des vorigen (Überlappung, an einer Wortgrenze).
 */
export function teileInAbschnitte(text: string, ziel = ZIEL_ZEICHEN, ueberlappung = UEBERLAPPUNG, max = MAX_ABSCHNITTE): string[] {
  const t = saeubereText(text);
  if (!t) return [];
  const teile = t.split(/\n{2,}|\n(?=[-•*]\s|\d+[.)]\s)/).flatMap((a) => teileLang(a.replace(/\n/g, ' ').trim(), ziel)).filter(Boolean);
  const bloecke: string[] = [];
  let akt = '';
  for (const p of teile) {
    if (akt && akt.length + 2 + p.length > ziel) { bloecke.push(akt); akt = p; }
    else akt = akt ? `${akt}\n\n${p}` : p;
  }
  if (akt) bloecke.push(akt);
  const out = bloecke.map((b, i) => {
    if (i === 0 || ueberlappung <= 0) return b;
    const vor = bloecke[i - 1];
    let schwanz = vor.slice(-ueberlappung);
    const leer = schwanz.indexOf(' ');
    if (leer > 0 && leer < schwanz.length - 1) schwanz = schwanz.slice(leer + 1);
    return `… ${schwanz}\n\n${b}`;
  });
  return out.slice(0, max);
}

export function stapel<T>(liste: T[], n = STAPEL): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += Math.max(1, n)) out.push(liste.slice(i, i + Math.max(1, n)));
  return out;
}

/** Wissens-Notiz: Dateiname und Inhalt. */
export function notizDatei(titel: string, text: string): { name: string; inhalt: string } | null {
  const tt = String(titel ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const x = String(text ?? '').trim();
  if (tt.length < 3 || x.length < 20) return null;
  const sicher = tt.replace(/[\\/:*?"<>|]+/g, '-');
  return { name: `Wissen - ${sicher}.txt`, inhalt: `${tt}\n\n${x}\n` };
}

/** Pfad im Speicher: nur sichere Zeichen (Umlaute und Leerzeichen machen Ärger). */
export function speicherPfad(userId: string, name: string, jetzt: number): string {
  const s = String(name ?? 'datei').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
  return `${userId}/${jetzt}_${s || 'datei'}`;
}
