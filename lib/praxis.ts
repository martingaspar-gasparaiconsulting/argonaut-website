// ============================================================================
// ARGONAUT OS · lib/praxis.ts — Praxis-Paket Stufe 1 (Paket PQ, H01)
//
// Für Selbstzahler-Betriebe: Privatpraxen, Heilpraktiker, Physio privat,
// Kosmetik, Beratung. Reine Logik, node-getestet (tests/praxisP91.test.mjs),
// kein KI-Aufruf, 0 €.
//
//   Recall            wann ist der nächste Termin fällig (Intervall ab letztem
//                     Besuch, fester Termin schlägt Rechnung, schon gebuchter
//                     Termin = erledigt), Erinnerung NUR mit Einwilligung und
//                     OHNE Angaben zur Behandlung (Art. 9 DSGVO in Mails).
//   Ausfallhonorar    nur mit VORHER erteilter Vereinbarung, Frist in Stunden,
//                     neu vergebener Termin = kein Schaden.
//   Einwilligungen    Katalog mit Mustertexten (Anwalt R09/R10), Stand je Art;
//                     ein Widerruf ist eine NEUE Zeile, nichts wird überschrieben.
//   Notiz-Arten       für die geschützten Gesundheitsangaben (H03). Die
//                     Verschlüsselung selbst steht in lib/gesundheitsdaten.ts
//                     (nur Server — node:crypto gehört nicht in den Browser).
//
// KEINE Befunde, keine Diagnosen, keine Kassenabrechnung — das ist Stufe 2
// (C5-Testat, H04/H05) und wird hier bewusst nicht angeboten.
// ============================================================================

const TAG = 86_400_000;
const STUNDE = 3_600_000;

// ---------------------------------------------------------------------------
// Datum (Berlin)
// ---------------------------------------------------------------------------

/** Kalendertag in Berlin (YYYY-MM-DD) — Vercel läuft in UTC. */
export function berlinTag(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Uhrzeit in Berlin (HH:MM). */
export function berlinZeit(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(d);
}

function istTag(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}
function tagMs(tag: string): number {
  return Date.UTC(+tag.slice(0, 4), +tag.slice(5, 7) - 1, +tag.slice(8, 10));
}

/** 31.01. + 1 Monat = 28./29.02. — kein Überlauf in den März. */
export function plusMonate(tag: string, monate: number): string {
  const j = +tag.slice(0, 4);
  const m = +tag.slice(5, 7) - 1 + monate;
  const d = +tag.slice(8, 10);
  const zj = j + Math.floor(m / 12);
  const zm = ((m % 12) + 12) % 12;
  const letzter = new Date(Date.UTC(zj, zm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(zj, zm, Math.min(d, letzter))).toISOString().slice(0, 10);
}

export function tageBis(von: string, bis: string): number {
  return Math.round((tagMs(bis) - tagMs(von)) / TAG);
}

export function datumDe(tag: string | null | undefined): string {
  if (!tag) return '—';
  const t = String(tag).slice(0, 10);
  return istTag(t) ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : String(tag);
}

function mail(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Einwilligungen
// ---------------------------------------------------------------------------

export const EINWILLIGUNG_VERSION = '2026-09-24';

export type EinwilligungArt = 'datenschutz' | 'recall' | 'ausfall' | 'foto' | 'foto_werbung' | 'weitergabe';

export const KANAELE = [
  { key: 'email', label: 'E-Mail' },
  { key: 'sms', label: 'SMS' },
  { key: 'telefon', label: 'Telefon' },
] as const;
export type Kanal = (typeof KANAELE)[number]['key'];

export type EinwilligungDaten = {
  kanaele?: Kanal[];
  frist_stunden?: number;
  betrag?: number;
  empfaenger?: string;
};

export const EINWILLIGUNGEN: Array<{ key: EinwilligungArt; label: string; kurz: string }> = [
  { key: 'datenschutz', label: 'Gesundheitsangaben speichern', kurz: 'Einwilligung in die Speicherung selbst mitgeteilter Gesundheitsangaben (Art. 9 DSGVO).' },
  { key: 'recall', label: 'Terminerinnerung (Recall)', kurz: 'Erinnerung an fällige Folgetermine — nur über die angekreuzten Wege.' },
  { key: 'ausfall', label: 'Ausfallhonorar-Vereinbarung', kurz: 'Absagefrist und Betrag — Voraussetzung, damit ein Ausfall berechnet werden darf.' },
  { key: 'foto', label: 'Fotos zur Dokumentation', kurz: 'Fotos nur intern, keine Veröffentlichung.' },
  { key: 'foto_werbung', label: 'Fotos für Werbung', kurz: 'Veröffentlichung auf Website/Social Media. Vorher-Nachher bei Eingriffen ist verboten (§ 11 HWG).' },
  { key: 'weitergabe', label: 'Weitergabe an Dritte', kurz: 'z. B. Labor oder Abrechnungsstelle — nur an den genannten Empfänger.' },
];

export function einwilligungInfo(art: unknown) {
  return EINWILLIGUNGEN.find((e) => e.key === art) ?? null;
}

const WIDERRUF = 'Diese Einwilligung ist freiwillig. Ich kann sie jederzeit mit Wirkung für die Zukunft widerrufen, formlos und ohne Angabe von Gründen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung bleibt unberührt.';

function betragDe(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Mustertext zum Unterschreiben. Wird beim Unterschreiben als Kopie mit
 * gespeichert — spätere Textänderungen verändern keine alte Einwilligung.
 * MUSTER: vor dem Einsatz anwaltlich prüfen lassen (R09/R10).
 */
export function einwilligungText(art: EinwilligungArt, firma: string, d: EinwilligungDaten = {}): string {
  const f = firma.trim() || '[Name des Betriebs]';
  switch (art) {
    case 'datenschutz':
      return `Ich willige ein, dass ${f} die Gesundheitsangaben, die ich selbst mitteile (zum Beispiel Allergien, Unverträglichkeiten oder Hinweise, die bei der Behandlung zu beachten sind), zur Durchführung und Dokumentation meiner Behandlung speichert und verwendet (Art. 9 Abs. 2 lit. a DSGVO). Diese Angaben werden getrennt von den übrigen Kundendaten und verschlüsselt gespeichert; jeder Zugriff wird protokolliert. Die Datenschutzinformation nach Art. 13 DSGVO habe ich erhalten. ${WIDERRUF}`;
    case 'recall': {
      const k = (d.kanaele ?? []).map((x) => KANAELE.find((y) => y.key === x)?.label).filter(Boolean);
      const wege = k.length ? k.join(', ') : '[Weg der Erinnerung]';
      return `Ich möchte von ${f} an fällige Folgetermine erinnert werden, und zwar per ${wege}. Die Erinnerung enthält keine Angaben zu meiner Behandlung. ${WIDERRUF}`;
    }
    case 'ausfall': {
      const frist = d.frist_stunden ? `${d.frist_stunden} Stunden` : '[Frist] Stunden';
      const betrag = d.betrag ? `${betragDe(d.betrag)} €` : '[Betrag] €';
      return `Vereinbarte Termine sind ausschließlich für mich reserviert. Kann ich einen Termin nicht wahrnehmen, sage ich ihn spätestens ${frist} vorher ab. Bei späterer Absage oder wenn ich nicht erscheine, berechnet ${f} ein Ausfallhonorar von ${betrag}. Das Ausfallhonorar entfällt, wenn der Termin anderweitig vergeben werden kann. Mir bleibt der Nachweis vorbehalten, dass kein oder ein wesentlich geringerer Schaden entstanden ist.`;
    }
    case 'foto':
      return `Ich willige ein, dass ${f} zur Dokumentation meiner Behandlung Fotos anfertigt und intern speichert. Die Fotos werden weder veröffentlicht noch an Dritte weitergegeben. ${WIDERRUF} Nach einem Widerruf werden die Fotos gelöscht, soweit keine Aufbewahrungspflicht besteht.`;
    case 'foto_werbung':
      return `Ich willige ein, dass ${f} Fotos, auf denen ich zu sehen bin, auf der eigenen Website und in sozialen Netzwerken veröffentlicht. Mir ist bekannt, dass veröffentlichte Bilder von Dritten kopiert werden können und sich nach einem Widerruf nicht in jedem Fall vollständig entfernen lassen. ${WIDERRUF}`;
    case 'weitergabe': {
      const an = d.empfaenger?.trim() || '[Empfänger]';
      return `Ich willige ein, dass ${f} die dafür erforderlichen Angaben an ${an} übermittelt, und entbinde ${f} insoweit von einer bestehenden Schweigepflicht. Eine Weitergabe an andere Empfänger erfolgt nicht. ${WIDERRUF}`;
    }
  }
}

export type EinwilligungZeile = {
  kunde_id: string;
  art: string;
  erteilt_am: string;
  widerruf?: boolean | null;
  daten?: EinwilligungDaten | null;
};

/** Stand einer Art für einen Kunden: die NEUESTE Zeile entscheidet. */
export function einwilligungStand(zeilen: EinwilligungZeile[], kundeId: string, art: EinwilligungArt):
  { status: 'aktiv' | 'widerrufen' | 'fehlt'; zeile: EinwilligungZeile | null } {
  const z = zeilen
    .filter((x) => x.kunde_id === kundeId && x.art === art && !Number.isNaN(Date.parse(x.erteilt_am)))
    .sort((a, b) => Date.parse(b.erteilt_am) - Date.parse(a.erteilt_am))[0] ?? null;
  if (!z) return { status: 'fehlt', zeile: null };
  return { status: z.widerruf ? 'widerrufen' : 'aktiv', zeile: z };
}

/** Darf über diesen Weg erinnert werden? Nur mit aktiver Recall-Einwilligung für genau diesen Weg. */
export function darfErinnern(zeilen: EinwilligungZeile[], kundeId: string, kanal: Kanal): boolean {
  const s = einwilligungStand(zeilen, kundeId, 'recall');
  return s.status === 'aktiv' && (s.zeile?.daten?.kanaele ?? []).includes(kanal);
}

/** Gültige Ausfall-Vereinbarung ZUM ZEITPUNKT des Termins (vorher erteilt, bis dahin nicht widerrufen). */
export function ausfallVereinbarungAm(zeilen: EinwilligungZeile[], kundeId: string, terminAm: string):
  { erteilt_am: string; frist_stunden: number; betrag: number } | null {
  const t = Date.parse(terminAm);
  if (Number.isNaN(t)) return null;
  const vorher = zeilen.filter((x) => x.kunde_id === kundeId && x.art === 'ausfall' && Date.parse(x.erteilt_am) < t);
  const letzte = vorher.sort((a, b) => Date.parse(b.erteilt_am) - Date.parse(a.erteilt_am))[0];
  if (!letzte || letzte.widerruf) return null;
  const frist = Number(letzte.daten?.frist_stunden);
  const betrag = Number(letzte.daten?.betrag);
  if (!(frist > 0) || !(betrag > 0)) return null;
  return { erteilt_am: letzte.erteilt_am, frist_stunden: frist, betrag };
}

const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export function unterschriftGueltig(bild: unknown): boolean {
  return typeof bild === 'string' && bild.length > 200 && bild.length <= 200_000 && PNG.test(bild);
}

/** Prüft eine neue Einwilligung vor dem Speichern. Liefert Fehlertexte (leer = ok). */
export function pruefeEinwilligung(e: { art: unknown; name: unknown; unterschrift: unknown; daten?: EinwilligungDaten }): string[] {
  const f: string[] = [];
  const info = einwilligungInfo(e.art);
  if (!info) f.push('Unbekannte Art der Einwilligung.');
  if (String(e.name ?? '').trim().length < 2) f.push('Bitte den Namen der unterschreibenden Person eintragen.');
  if (!unterschriftGueltig(e.unterschrift)) f.push('Bitte unterschreiben.');
  const d = e.daten ?? {};
  if (info?.key === 'recall' && !(d.kanaele && d.kanaele.length)) f.push('Bitte mindestens einen Weg für die Erinnerung ankreuzen.');
  if (info?.key === 'ausfall') {
    if (!(Number(d.frist_stunden) >= 1 && Number(d.frist_stunden) <= 168)) f.push('Die Absagefrist muss zwischen 1 und 168 Stunden liegen.');
    if (!(Number(d.betrag) > 0 && Number(d.betrag) <= 1000)) f.push('Der Betrag muss zwischen 0,01 € und 1.000 € liegen.');
  }
  if (info?.key === 'weitergabe' && String(d.empfaenger ?? '').trim().length < 2) f.push('Bitte den Empfänger eintragen.');
  return f;
}

// ---------------------------------------------------------------------------
// Recall
// ---------------------------------------------------------------------------

export const RECALL_VORSCHLAEGE = [
  { monate: 1, label: 'Folgetermin (1 Monat)' },
  { monate: 3, label: 'Kontrolltermin (3 Monate)' },
  { monate: 6, label: 'Halbjahres-Termin (6 Monate)' },
  { monate: 12, label: 'Jahrestermin (12 Monate)' },
];

export type RecallStatus = 'ueberfaellig' | 'faellig' | 'termin' | 'geplant' | 'ohne_besuch' | 'pausiert';

export const RECALL_LABEL: Record<RecallStatus, string> = {
  ueberfaellig: 'überfällig', faellig: 'bald fällig', termin: 'Termin steht', geplant: 'geplant',
  ohne_besuch: 'noch kein Besuch', pausiert: 'pausiert',
};

export function recallStand(o: {
  letzterBesuch: string | null; intervallMonate: number; naechsterAm?: string | null;
  pausiert?: boolean | null; naechsterTermin?: string | null; heute: string; vorlaufTage?: number;
}): { status: RecallStatus; faelligAm: string | null; tage: number | null } {
  const vorlauf = o.vorlaufTage ?? 14;
  const faelligAm = istTag(o.naechsterAm)
    ? o.naechsterAm
    : (istTag(o.letzterBesuch) && o.intervallMonate >= 1 ? plusMonate(o.letzterBesuch, Math.round(o.intervallMonate)) : null);
  if (o.pausiert) return { status: 'pausiert', faelligAm, tage: null };
  if (!faelligAm) return { status: 'ohne_besuch', faelligAm: null, tage: null };
  const tage = tageBis(o.heute, faelligAm);
  if (istTag(o.naechsterTermin) && o.naechsterTermin >= o.heute) return { status: 'termin', faelligAm, tage };
  if (tage < 0) return { status: 'ueberfaellig', faelligAm, tage };
  if (tage <= vorlauf) return { status: 'faellig', faelligAm, tage };
  return { status: 'geplant', faelligAm, tage };
}

const RANG: Record<RecallStatus, number> = { ueberfaellig: 0, faellig: 1, geplant: 2, termin: 3, ohne_besuch: 4, pausiert: 5 };

export type RecallKunde = { id: string; name: string; email?: string | null };
export type RecallEinstellung = { kunde_id: string; intervall_monate: number; naechster_am?: string | null; pausiert?: boolean | null; grund?: string | null; zuletzt_erinnert_am?: string | null };
export type Besuch = { kunde_id: string; datum: string };
export type TerminKurz = { kunde_email?: string | null; beginn_am?: string | null; status?: string | null };

export type RecallZeile = {
  kunde: RecallKunde; einstellung: RecallEinstellung; letzterBesuch: string | null;
  naechsterTermin: string | null; status: RecallStatus; faelligAm: string | null; tage: number | null;
};

/**
 * Recall-Liste: nur Kunden mit Recall-Einstellung. Letzter Besuch = jüngste
 * Behandlung (Zukunft zählt nicht). Ein kommender Termin (gleiche E-Mail,
 * nicht abgesagt) gilt als erledigt.
 */
export function recallListe(kunden: RecallKunde[], einstellungen: RecallEinstellung[], besuche: Besuch[], termine: TerminKurz[], heute: string): RecallZeile[] {
  const letzte = new Map<string, string>();
  for (const b of besuche) {
    const t = String(b.datum ?? '').slice(0, 10);
    if (!istTag(t) || t > heute) continue;
    if (!letzte.has(b.kunde_id) || t > (letzte.get(b.kunde_id) as string)) letzte.set(b.kunde_id, t);
  }
  const kommend = new Map<string, string>();
  for (const t of termine) {
    const m = mail(t.kunde_email);
    const tag = berlinTag(t.beginn_am ?? null);
    if (!m || !tag || tag < heute) continue;
    if (/abgesagt|absage|storn|ausgefallen/i.test(String(t.status ?? ''))) continue;
    if (!kommend.has(m) || tag < (kommend.get(m) as string)) kommend.set(m, tag);
  }
  const zeilen: RecallZeile[] = [];
  for (const e of einstellungen) {
    const k = kunden.find((x) => x.id === e.kunde_id);
    if (!k) continue;
    const letzterBesuch = letzte.get(k.id) ?? null;
    const naechsterTermin = mail(k.email) ? kommend.get(mail(k.email)) ?? null : null;
    const s = recallStand({ letzterBesuch, intervallMonate: e.intervall_monate, naechsterAm: e.naechster_am ?? null, pausiert: e.pausiert, naechsterTermin, heute });
    zeilen.push({ kunde: k, einstellung: e, letzterBesuch, naechsterTermin, ...s });
  }
  return zeilen.sort((a, b) => RANG[a.status] - RANG[b.status]
    || String(a.faelligAm ?? '9999').localeCompare(String(b.faelligAm ?? '9999'))
    || a.kunde.name.localeCompare(b.kunde.name, 'de'));
}

/** Erinnerungstext — bewusst OHNE Behandlung und ohne Grund (Art. 9 DSGVO). */
export function recallText(o: { name: string; firma: string; kanal: Kanal }): { betreff: string; text: string } {
  const firma = o.firma.trim() || 'Ihr Team';
  const anrede = o.name.trim() ? `Guten Tag ${o.name.trim()},` : 'Guten Tag,';
  if (o.kanal === 'sms') {
    return { betreff: '', text: `${firma}: Ihr nächster Termin steht an. Bitte melden Sie sich kurz für eine Terminvereinbarung. Keine Erinnerungen mehr? Antworten Sie mit STOP.` };
  }
  return {
    betreff: `Ihr nächster Termin bei ${firma}`,
    text: `${anrede}\n\nwie mit Ihnen vereinbart, erinnern wir Sie daran, dass Ihr nächster Termin ansteht. Bitte melden Sie sich bei uns, damit wir einen passenden Termin finden.\n\nMöchten Sie keine Erinnerungen mehr erhalten, genügt eine kurze Nachricht.\n\nFreundliche Grüße\n${firma}`,
  };
}

// ---------------------------------------------------------------------------
// Ausfallhonorar
// ---------------------------------------------------------------------------

export type AusfallErgebnis = 'faellig' | 'rechtzeitig' | 'neu_vergeben' | 'keine_vereinbarung' | 'zu_frueh';

export const AUSFALL_LABEL: Record<AusfallErgebnis, string> = {
  faellig: 'Ausfallhonorar fällig', rechtzeitig: 'rechtzeitig abgesagt', neu_vergeben: 'Termin neu vergeben — kein Ausfall',
  keine_vereinbarung: 'keine vorherige Vereinbarung', zu_frueh: 'Termin liegt noch in der Zukunft',
};

export const AUSFALL_STATUS = ['offen', 'gefordert', 'bezahlt', 'erlassen'] as const;

export function pruefeAusfall(a: {
  terminAm: string; abgesagtAm?: string | null; neuVergeben?: boolean;
  vereinbarung: { erteilt_am: string; frist_stunden: number; betrag: number } | null; jetzt: string;
}): { ergebnis: AusfallErgebnis; betrag: number | null; text: string; hinweise: string[] } {
  const t = Date.parse(a.terminAm);
  const jetzt = Date.parse(a.jetzt);
  const ab = a.abgesagtAm ? Date.parse(a.abgesagtAm) : NaN;
  const abgesagt = !Number.isNaN(ab) && ab <= t; // Absage NACH Terminbeginn = nicht erschienen
  const hinweise: string[] = [];
  if (Number.isNaN(t)) return { ergebnis: 'zu_frueh', betrag: null, text: 'Kein gültiger Terminzeitpunkt.', hinweise };
  if (!abgesagt && t > jetzt) return { ergebnis: 'zu_frueh', betrag: null, text: AUSFALL_LABEL.zu_frueh, hinweise };
  const v = a.vereinbarung;
  if (!v || Date.parse(v.erteilt_am) >= t) {
    return {
      ergebnis: 'keine_vereinbarung', betrag: null,
      text: 'Es liegt keine vor dem Termin unterschriebene Ausfall-Vereinbarung vor. Ein Ausfallhonorar lässt sich dann kaum durchsetzen — bitte nicht fordern.',
      hinweise: ['Für künftige Termine die Vereinbarung unter „Einwilligungen" unterschreiben lassen.'],
    };
  }
  if (a.neuVergeben) {
    return { ergebnis: 'neu_vergeben', betrag: null, text: 'Der Termin wurde anderweitig vergeben — es ist kein Ausfall entstanden.', hinweise };
  }
  if (abgesagt) {
    const std = (t - ab) / STUNDE;
    if (std >= v.frist_stunden) {
      return { ergebnis: 'rechtzeitig', betrag: null, text: `Abgesagt ${Math.floor(std)} Stunden vorher — die Frist von ${v.frist_stunden} Stunden ist eingehalten.`, hinweise };
    }
  }
  hinweise.push('Der Kunde darf nachweisen, dass kein oder ein geringerer Schaden entstanden ist (§ 309 Nr. 5 BGB) — zum Beispiel, weil die Zeit anders genutzt wurde.');
  hinweise.push('Bei plötzlicher Krankheit oder einem Notfall ist die Rechtslage uneinheitlich — hier nach Kulanz entscheiden.');
  hinweise.push('Umsatzsteuer auf das Ausfallhonorar: mit der Steuerberatung klären.');
  return {
    ergebnis: 'faellig', betrag: v.betrag,
    text: abgesagt
      ? `Abgesagt nur ${Math.max(0, Math.floor((t - ab) / STUNDE))} Stunden vorher (vereinbart: ${v.frist_stunden} Stunden) — Ausfallhonorar ${betragDe(v.betrag)} €.`
      : `Nicht erschienen, nicht abgesagt — Ausfallhonorar ${betragDe(v.betrag)} €.`,
    hinweise,
  };
}

/** Zahlungsaufforderung als Mustertext. Bankverbindung und Zahlungsziel bleiben Platzhalter. */
export function ausfallSchreiben(o: { name: string; firma: string; terminAm: string; betrag: number; fristStunden: number; vereinbartAm: string }): string {
  const firma = o.firma.trim() || '[Name des Betriebs]';
  const anrede = o.name.trim() ? `Guten Tag ${o.name.trim()},` : 'Guten Tag,';
  return `${anrede}\n\nIhr Termin am ${datumDe(berlinTag(o.terminAm))} um ${berlinZeit(o.terminAm)} Uhr war für Sie reserviert. Er wurde nicht oder nicht rechtzeitig abgesagt und konnte nicht anderweitig vergeben werden.\n\nMit Ihrer Unterschrift vom ${datumDe(berlinTag(o.vereinbartAm))} haben wir vereinbart, dass Termine spätestens ${o.fristStunden} Stunden vorher abgesagt werden und andernfalls ein Ausfallhonorar anfällt. Wir bitten Sie daher, ${betragDe(o.betrag)} € bis zum [Zahlungsziel] auf folgendes Konto zu überweisen: [Bankverbindung].\n\nSollte Ihnen kein oder ein wesentlich geringerer Schaden entstanden sein, teilen Sie uns das bitte mit.\n\nFreundliche Grüße\n${firma}`;
}

// ---------------------------------------------------------------------------
// Geschützte Gesundheitsangaben (H03) — nur die Arten, keine Kryptografie
// ---------------------------------------------------------------------------

export const NOTIZ_ARTEN = [
  { key: 'allergie', label: 'Allergie' },
  { key: 'unvertraeglichkeit', label: 'Unverträglichkeit' },
  { key: 'kontraindikation', label: 'Darf nicht angewendet werden' },
  { key: 'medikation', label: 'Medikament (vom Kunden genannt)' },
  { key: 'hinweis', label: 'Sonstiger Gesundheitshinweis' },
] as const;
export type NotizArt = (typeof NOTIZ_ARTEN)[number]['key'];
export const NOTIZ_MAX = 4000;

export function pruefeNotiz(n: { art: unknown; text: unknown }): string | null {
  if (!NOTIZ_ARTEN.some((a) => a.key === n.art)) return 'Unbekannte Art.';
  const t = String(n.text ?? '').trim();
  if (t.length < 2) return 'Bitte einen Text eintragen.';
  if (t.length > NOTIZ_MAX) return `Höchstens ${NOTIZ_MAX} Zeichen.`;
  return null;
}

export const ZUGRIFF_AKTIONEN = ['lesen', 'anlegen', 'loeschen'] as const;
export type ZugriffAktion = (typeof ZUGRIFF_AKTIONEN)[number];
