// ============================================================================
// ARGONAUT OS · lib/wartungTermin.ts — Paket 384 · LK7 (16.10.2026)
// „Wartung legt Termine selbst an"
//
// Ablauf:
//   1. Der tägliche Lauf /api/wartung-erinnerung findet fällige Verträge.
//      Ist beim Vertrag „Termin automatisch vorschlagen" an, legt er EINEN
//      Terminvorschlag an (am Fälligkeitstag, frühestens übermorgen, nie am
//      Wochenende, 9:00–10:00 Uhr Berliner Zeit) und schickt dem Kunden einen
//      Link, mit dem er bestätigt oder einen anderen Termin wünscht.
//   2. Bestätigt der Kunde, wird daraus sofort ein Einsatz (gleiche
//      Feldbelegung wie „Termin → Einsatz").
//   3. „✓ Gewartet" auf der Wartungsseite schreibt die Fälligkeit fort und
//      öffnet damit den nächsten Zyklus (wie bisher).
//
// Rein — keine Datenbank, kein Netz. node-testbar (tests/wartungTerminLK7).
// ============================================================================

export const VORSCHLAG_UHRZEIT = '09:00';
export const VORSCHLAG_DAUER_MIN = 60;
/** Frühestens so viele Tage nach heute — der Kunde braucht Vorlauf. */
export const VORLAUF_TAGE = 2;

const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;
const TAG_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function tagTeile(tag: string): [number, number, number] | null {
  const m = TAG_RE.exec(String(tag || '').trim());
  if (!m) return null;
  const j = Number(m[1]), mo = Number(m[2]), t = Number(m[3]);
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  return [j, mo, t];
}

function tagAus(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Kalendertag + n Tage ('YYYY-MM-DD'). */
export function tagPlus(tag: string, n: number): string | null {
  const t = tagTeile(tag);
  if (!t) return null;
  return tagAus(Date.UTC(t[0], t[1] - 1, t[2]) + n * 86_400_000);
}

/** Kalendertag in Europe/Berlin. */
export function berlinTag(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * Vorschlagstag: der Fälligkeitstag, aber frühestens heute + VORLAUF_TAGE,
 * und Samstag/Sonntag rutschen auf den Montag.
 */
export function vorschlagTag(faelligTag: string | null | undefined, heuteTag: string): string | null {
  const frueh = tagPlus(heuteTag, VORLAUF_TAGE);
  if (!frueh) return null;
  let tag = faelligTag && tagTeile(faelligTag) ? faelligTag : frueh;
  if (tag < frueh) tag = frueh;
  const t = tagTeile(tag)!;
  const wochentag = new Date(Date.UTC(t[0], t[1] - 1, t[2])).getUTCDay(); // 0 = So, 6 = Sa
  if (wochentag === 6) tag = tagPlus(tag, 2)!;
  if (wochentag === 0) tag = tagPlus(tag, 1)!;
  return tag;
}

/** Versatz Berlin gegenüber UTC in Minuten zu einem Zeitpunkt (Sommerzeit +120, Winter +60). */
function berlinVersatzMin(utcMs: number): number {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const w = (typ: string) => Number(teile.find((p) => p.type === typ)?.value);
  const alsUtc = Date.UTC(w('year'), w('month') - 1, w('day'), w('hour'), w('minute'));
  return Math.round((alsUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/** Berliner Wanduhrzeit ('YYYY-MM-DD', 'HH:MM') → ISO-Zeitpunkt (UTC). */
export function berlinZuIso(tag: string, uhrzeit: string): string | null {
  const t = tagTeile(tag);
  const u = /^(\d{2}):(\d{2})$/.exec(String(uhrzeit || ''));
  if (!t || !u) return null;
  const roh = Date.UTC(t[0], t[1] - 1, t[2], Number(u[1]), Number(u[2]));
  let ms = roh - berlinVersatzMin(roh) * 60_000;
  const nochmal = roh - berlinVersatzMin(ms) * 60_000;
  if (nochmal !== ms) ms = nochmal;
  return new Date(ms).toISOString();
}

export type VertragFuerTermin = {
  id: string;
  owner_user_id: string;
  titel?: string | null;
  kunde_name?: string | null;
  kontakt_id?: string | null;
  standort_id?: string | null;
  vertragsnummer?: string | null;
};

/** Kann der Vertrag einen automatischen Vorschlag bekommen? (null/undefined = an) */
export function autoTerminAn(v: { termin_auto?: boolean | null }): boolean {
  return v.termin_auto !== false;
}

/** Zeile für `termine` — Token kommt von außen (Zufall gehört nicht in reine Logik). */
export function terminVorschlag(
  v: VertragFuerTermin,
  faelligTag: string | null | undefined,
  heuteTag: string,
  token: string,
  kundeEmail: string | null,
): Record<string, unknown> | null {
  const tag = vorschlagTag(faelligTag, heuteTag);
  if (!tag || !tokenGueltig(token)) return null;
  const beginn = berlinZuIso(tag, VORSCHLAG_UHRZEIT);
  if (!beginn) return null;
  const ende = new Date(new Date(beginn).getTime() + VORSCHLAG_DAUER_MIN * 60_000).toISOString();
  const titel = `Wartung: ${String(v.titel || 'Wartungsvertrag').trim()}`.slice(0, 200);
  return {
    owner_user_id: v.owner_user_id,
    standort_id: v.standort_id ?? null,
    titel,
    beginn_am: beginn,
    ende_am: ende,
    status: 'geplant',
    kunde_name: v.kunde_name ?? null,
    kunde_email: kundeEmail || null,
    kontakt_id: v.kontakt_id ?? null,
    notiz: `Automatischer Vorschlag aus dem Wartungsvertrag${v.vertragsnummer ? ` ${v.vertragsnummer}` : ''} — wartet auf Bestätigung durch den Kunden.`,
    wartungsvertrag_id: v.id,
    bestaetigung_token: token,
  };
}

export type TerminKurz = {
  beginn_am?: string | null;
  status?: string | null;
  wartungsvertrag_id?: string | null;
};

/** Doppelschutz: gibt es für diesen Vertrag schon einen offenen Termin (heute oder später, nicht abgesagt)? */
export function hatOffenenTermin(termine: TerminKurz[], vertragId: string, jetzt: Date): boolean {
  const grenze = jetzt.getTime() - 86_400_000;
  return (termine || []).some((t) => {
    if (t.wartungsvertrag_id !== vertragId) return false;
    const s = String(t.status || '').toLowerCase();
    if (s === 'abgesagt' || s === 'storniert' || s === 'erledigt') return false;
    const b = t.beginn_am ? new Date(t.beginn_am).getTime() : NaN;
    return !isNaN(b) && b >= grenze;
  });
}

export function tokenGueltig(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

export type TerminStand = 'offen' | 'bestaetigt' | 'vorbei' | 'abgesagt';

/** Wo steht der Vorschlag aus Sicht des Kunden? */
export function bestaetigungsStand(
  t: { beginn_am?: string | null; status?: string | null; kunde_bestaetigt_am?: string | null },
  jetzt: Date,
): TerminStand {
  const s = String(t.status || '').toLowerCase();
  if (s === 'abgesagt' || s === 'storniert') return 'abgesagt';
  if (t.kunde_bestaetigt_am) return 'bestaetigt';
  const b = t.beginn_am ? new Date(t.beginn_am).getTime() : NaN;
  if (isNaN(b) || b <= jetzt.getTime()) return 'vorbei';
  return 'offen';
}

/** Kundenwunsch („anderer Termin") säubern: Text, höchstens 500 Zeichen. */
export function wunschText(roh: unknown): string {
  return String(roh ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function bestaetigungsUrl(basis: string, token: string): string {
  return `${String(basis || '').replace(/\/+$/, '')}/wartungstermin/${encodeURIComponent(token)}`;
}

/** Feldbelegung Termin → Einsatz (gleich wie /api/termin-zu-einsatz). */
export function einsatzAusTermin(termin: Record<string, any>, ownerId: string, quelle: string = 'termin'): Record<string, unknown> {
  return {
    owner_user_id: ownerId,
    standort_id: termin.standort_id || null,
    termin_id: termin.id,
    titel: termin.titel || termin.terminart || 'Einsatz',
    beschreibung: termin.beschreibung || termin.notiz || null,
    beginn_am: termin.beginn_am || null,
    ende_am: termin.ende_am || null,
    einsatzort: termin.ort || null,
    kontakt_id: termin.kontakt_id || null,
    firma_id: termin.firma_id || null,
    mitarbeiter_id: termin.mitarbeiter_id || null,
    kunde_name: termin.kunde_name || null,
    kunde_email: termin.kunde_email || null,
    kunde_telefon: termin.kunde_telefon || null,
    auftrag_id: termin.auftrag_id || null,
    status: 'geplant',
    quelle,
  };
}

function maske(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Datum/Uhrzeit für Menschen, Berliner Zeit. */
export function terminText(beginnIso: string, endeIso: string | null): { datum: string; zeit: string } {
  const b = new Date(beginnIso);
  const e = endeIso ? new Date(endeIso) : null;
  const datum = b.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
  const uhr = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return { datum, zeit: e ? `${uhr(b)}–${uhr(e)} Uhr` : `${uhr(b)} Uhr` };
}

/** Inhalt der Kunden-Mail (gesiezt, alles maskiert). */
export function kundenMailInhalt(p: {
  kundeName?: string | null; betrieb: string; vertragTitel?: string | null;
  beginnIso: string; endeIso: string | null; link: string; akzent: string;
}): string {
  const { datum, zeit } = terminText(p.beginnIso, p.endeIso);
  const anrede = p.kundeName ? `Guten Tag ${maske(p.kundeName)},` : 'Guten Tag,';
  return `
    <p>${anrede}</p>
    <p>die nächste Wartung${p.vertragTitel ? ` <b>${maske(p.vertragTitel)}</b>` : ''} steht an. ${maske(p.betrieb)} schlägt Ihnen folgenden Termin vor:</p>
    <div style="background:#f7f8fa;border-left:4px solid ${maske(p.akzent)};border-radius:8px;padding:16px 20px;margin:16px 0;">
      <div style="font-size:16px;font-weight:700;color:#0A1628;">${maske(datum)}</div>
      <div style="margin-top:6px;color:#1a2332;">${maske(zeit)}</div>
    </div>
    <p>Bitte bestätigen Sie den Termin oder teilen Sie uns einen anderen Wunschtermin mit:</p>
    <p style="margin:20px 0;"><a href="${maske(p.link)}" style="background:${maske(p.akzent)};color:#0A1628;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block;">Termin bestätigen oder ändern</a></p>
    <p style="color:#5a6470;font-size:13px;">Sie können auch einfach auf diese E-Mail antworten.</p>`;
}
