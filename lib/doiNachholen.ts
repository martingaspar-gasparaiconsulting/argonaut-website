// ============================================================================
// ARGONAUT OS · lib/doiNachholen.ts — Paket 199 (Entscheidung D1, 04.10.2026)
// Bestätigungs-Mail (Double-Opt-in) für von Hand eingetragene Newsletter-Adressen
//
// ▄▄▄ WARUM ▄▄▄
// Seit Paket 173 bekommen von Hand eingetragene Adressen keinen Newsletter
// mehr — zu Recht: „manuell" ist kein Nachweis einer Einwilligung. Die Betriebe
// haben aber echte Fälle (Visitenkarte auf der Messe, Häkchen auf dem
// Auftragsformular). Für diese Fälle gibt es jetzt EINEN Knopf, der die
// Bestätigungs-Mail schickt; erst der Klick der Person macht sie aktiv.
//
// ▄▄▄ DIE REGELN (Martin, Nachschärfung 04.10.) ▄▄▄
//   1. Nur mit Quelle UND Datum der ursprünglichen Einwilligung. Ohne diese
//      Angabe wäre die Bestätigungs-Mail selbst eine unerlaubte Anfrage
//      (eine Liste gekaufter Adressen „bestätigen lassen" geht nicht).
//      Quelle und Datum sind danach FEST (Nachweis, SQL p199).
//   2. Nie an Abgemeldete oder an Adressen mit Widerspruch.
//   3. Höchstens 2 Mails je Adresse, mindestens 7 Tage dazwischen — eine
//      Bestätigungs-Mail darf nicht zur Dauer-Erinnerung werden.
//   4. Die Mail selbst enthält KEINE Werbung, nur die Bitte um Bestätigung.
//   5. Adressen, die schon über eine eigene Anmeldestrecke kamen (Opt-in,
//      Webseite, Landingpage), bestätigen dort — hier kein Knopf.
//
// Reine Funktionen, keine Supabase-, React- oder Next-Abhängigkeit → node --test.
// ============================================================================

import { DOI_QUELLEN, aboBestaetigtAm, doiNachgeholtAm, type AboZeile } from './werbeErlaubnis';

export { doiNachgeholtAm };

export const DOI_MAX_MAILS = 2;
export const DOI_ABSTAND_TAGE = 7;
export const QUELLE_MIN = 5;
export const QUELLE_MAX = 160;
/** Tagesdeckel je Betrieb (Schutz vor Massen-Versand per Knopf). */
export const DOI_TAGESDECKEL = 200;

export type DoiAbo = AboZeile & {
  einwilligung_quelle?: unknown;
  einwilligung_am?: unknown;
  doi_anzahl?: unknown;
};

function text(v: unknown): string {
  return (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
}

function zeit(v: unknown): number | null {
  const t = text(v);
  if (!t) return null;
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : null;
}

/** YYYY-MM-DD aus einem Date in Berliner Zeit. */
export function heuteIsoBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}

function istGueltigesDatum(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const j = Number(m[1]); const mo = Number(m[2]); const t = Number(m[3]);
  const d = new Date(Date.UTC(j, mo - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

export type AngabeErgebnis =
  | { ok: true; quelle: string; datum: string }
  | { ok: false; fehler: string };

/**
 * Quelle + Datum der ursprünglichen Einwilligung prüfen.
 * Datum: echtes Kalenderdatum, nicht in der Zukunft, nicht vor 2000.
 */
export function pruefeEinwilligungsAngabe(quelleRoh: unknown, datumRoh: unknown, jetzt: Date = new Date()): AngabeErgebnis {
  const quelle = text(quelleRoh).slice(0, QUELLE_MAX);
  const datum = text(datumRoh).slice(0, 10);
  if (quelle.length < QUELLE_MIN) {
    return { ok: false, fehler: 'Bitte angeben, wo die Person eingewilligt hat (z. B. „Visitenkarte Messe Stuttgart" oder „Häkchen Auftragsformular").' };
  }
  if (!istGueltigesDatum(datum)) {
    return { ok: false, fehler: 'Bitte das Datum der Einwilligung angeben.' };
  }
  if (datum < '2000-01-01') return { ok: false, fehler: 'Das Datum der Einwilligung ist nicht plausibel.' };
  if (datum > heuteIsoBerlin(jetzt)) return { ok: false, fehler: 'Das Datum der Einwilligung darf nicht in der Zukunft liegen.' };
  return { ok: true, quelle, datum };
}

export type DoiGrund =
  | 'ok'
  | 'abgemeldet'
  | 'schon_bestaetigt'
  | 'eigene_strecke'
  | 'angabe_fehlt'
  | 'zu_oft'
  | 'zu_frueh';

export const DOI_GRUND_TEXT: Record<DoiGrund, string> = {
  ok: 'Bestätigungs-Mail kann gesendet werden.',
  abgemeldet: 'Diese Person hat sich abgemeldet — eine Bestätigungs-Mail ist nicht erlaubt.',
  schon_bestaetigt: 'Diese Adresse ist bereits bestätigt.',
  eigene_strecke: 'Diese Adresse kam über Ihre Anmeldeseite und bestätigt dort selbst.',
  angabe_fehlt: 'Bitte zuerst Quelle und Datum der Einwilligung eintragen.',
  zu_oft: `Es wurden schon ${DOI_MAX_MAILS} Bestätigungs-Mails gesendet — mehr sind nicht erlaubt.`,
  zu_frueh: `Eine weitere Bestätigungs-Mail frühestens ${DOI_ABSTAND_TAGE} Tage nach der letzten.`,
};

/**
 * Darf für diesen Eintrag JETZT eine Bestätigungs-Mail raus?
 * `angabeVorhanden` = Quelle + Datum stehen schon am Eintrag oder kommen gültig mit der Anfrage.
 * Widerspruch/Sperrliste prüft der Server zusätzlich (lib/werbeErlaubnis).
 */
export function doiNachholenErlaubt(a: DoiAbo | null | undefined, angabeVorhanden: boolean, jetzt: Date = new Date()): DoiGrund {
  if (!a) return 'angabe_fehlt';
  const status = text(a.status).toLowerCase();
  if (status === 'abgemeldet' || status === 'widersprochen' || zeit(a.abgemeldet_am) !== null) return 'abgemeldet';
  if (aboBestaetigtAm(a) !== null || doiNachgeholtAm(a) !== null) return 'schon_bestaetigt';
  if (DOI_QUELLEN.includes(text(a.quelle).toLowerCase())) return 'eigene_strecke';
  if (!angabeVorhanden) return 'angabe_fehlt';
  const anzahl = Math.max(0, Math.trunc(Number(a.doi_anzahl) || 0));
  if (anzahl >= DOI_MAX_MAILS) return 'zu_oft';
  const letzte = zeit(a.doi_gesendet_am);
  if (letzte !== null && jetzt.getTime() - letzte < DOI_ABSTAND_TAGE * 86400000) return 'zu_frueh';
  return 'ok';
}

/** Steht am Eintrag schon eine vollständige Angabe? */
export function angabeAmEintrag(a: DoiAbo | null | undefined): boolean {
  return !!a && text(a.einwilligung_quelle).length >= QUELLE_MIN && istGueltigesDatum(text(a.einwilligung_am).slice(0, 10));
}

/** Datum für Menschen: 12.09.2026 */
export function datumDe(iso: unknown): string {
  const t = text(iso).slice(0, 10);
  if (!istGueltigesDatum(t)) return '';
  return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function farbe(f: unknown): string {
  const t = text(f);
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : '#1a2332';
}

/** Betreff der Bestätigungs-Mail. */
export function doiNachholenBetreff(firma: unknown): string {
  const f = text(firma).slice(0, 80) || 'uns';
  return `Bitte bestätigen: Möchten Sie E-Mails von ${f} erhalten?`;
}

/**
 * Die Bestätigungs-Mail. Bewusst OHNE Werbung, ohne Bilder, ohne weitere
 * Links — nur Anlass (Quelle + Datum), Bitte und Knopf.
 */
export function doiNachholenHtml(opt: {
  firma: unknown; url: string; akzent?: unknown; name?: unknown; quelle: unknown; datum: unknown;
}): string {
  const firma = esc(text(opt.firma).slice(0, 80) || 'Unser Betrieb');
  const akzent = farbe(opt.akzent);
  const name = text(opt.name).slice(0, 80);
  const anrede = name ? `Guten Tag ${esc(name)},` : 'Guten Tag,';
  const quelle = esc(text(opt.quelle).slice(0, QUELLE_MAX));
  const datum = esc(datumDe(opt.datum));
  const url = esc(opt.url);
  const anlass = datum && quelle
    ? `Sie haben uns am ${datum} (${quelle}) Ihre E-Mail-Adresse für Informationen von <b>${firma}</b> gegeben.`
    : `Sie haben uns Ihre E-Mail-Adresse für Informationen von <b>${firma}</b> gegeben.`;
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:3px solid ${akzent};">
        <div style="font-size:20px;font-weight:800;color:${akzent};">${firma}</div>
      </div>
      <div style="padding:28px;font-size:15px;line-height:1.6;color:#1a2332;">
        <p style="margin:0 0 14px;">${anrede}</p>
        <p style="margin:0 0 14px;">${anlass}</p>
        <p style="margin:0 0 20px;">Damit wir Ihnen künftig per E-Mail schreiben dürfen, bestätigen Sie das bitte einmalig mit einem Klick:</p>
        <p style="text-align:center;margin:0 0 24px;">
          <a href="${url}" style="display:inline-block;background:${akzent};color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 28px;border-radius:10px;">Ja, ich möchte E-Mails erhalten</a>
        </p>
        <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Falls der Knopf nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
        <a href="${url}" style="color:${akzent};word-break:break-all;">${url}</a></p>
      </div>
      <div style="padding:18px 28px;background:#fafbfc;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a94a6;">
        Ohne Ihre Bestätigung erhalten Sie von ${firma} keinen Newsletter. Möchten Sie das nicht, ignorieren Sie diese Nachricht einfach.
      </div>
    </div>
  </div>
</body>
</html>`;
}
