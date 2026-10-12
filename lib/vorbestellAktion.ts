// ============================================================================
// ARGONAUT OS · lib/vorbestellAktion.ts — Paket 342 (12.10.2026)
// BV3b Feinkost Teil 1: Vorbestellung und Vormerkliste für knappe Ware
//
// Eine Vorbestell-Aktion ist eine knappe Ware mit Gesamtmenge, Abholzeitraum,
// Bestellschluss und Höchstmenge je Kunde (z. B. Dry-Aged aus der Reife-Uhr,
// Weihnachtsgans, Saison-Pralinen). Kunden bestellen vor (Theke, Telefon,
// Mail; der Shop folgt in Teil 2). Ist alles vergeben, kommen sie auf die
// Vormerkliste — NUR mit Einwilligung in die Benachrichtigung. Wird etwas
// frei, rückt die Liste der Reihe nach nach.
//
// Die Datenbank (SQL p342) lässt nie mehr zu, als da ist. Diese Datei rechnet
// dasselbe für die Anzeige vor und prüft Eingaben, bevor gespeichert wird.
//
// Mengen sind keine Geldbeträge: Rundung auf 3 Stellen über rundeStellen.
// Keine Hooks, kein Supabase — node-testbar (tests/vorbestellungP342.test.mjs).
// ============================================================================

import { rundeStellen } from './zahlen';

export const AKTION_STATUS = ['entwurf', 'offen', 'geschlossen', 'abgeschlossen'] as const;
export type AktionStatus = (typeof AKTION_STATUS)[number];
export const POSTEN_STATUS = ['offen', 'bereit', 'abgeholt', 'storniert', 'nicht_abgeholt'] as const;
export type PostenStatus = (typeof POSTEN_STATUS)[number];
export const VORMERK_STATUS = ['wartet', 'benachrichtigt', 'uebernommen', 'erloschen', 'abgemeldet'] as const;
export type VormerkStatus = (typeof VORMERK_STATUS)[number];
export const EINHEITEN = ['kg', 'g', 'l', 'Stk'] as const;
export const QUELLEN = ['theke', 'telefon', 'mail', 'shop', 'vormerkliste'] as const;
export type Quelle = (typeof QUELLEN)[number];

/** Diese Posten belegen Ware (storniert und nicht abgeholt geben sie frei). */
export const BELEGT_STATUS: readonly string[] = ['offen', 'bereit', 'abgeholt'];

/** Stunden, die ein benachrichtigter Kunde Zeit hat (wie SQL p342: 48 Stunden). */
export const VORMERK_FRIST_STUNDEN = 48;
/** Tage, nach denen erledigte Vormerkungen gelöscht werden dürfen (Datensparsamkeit). */
export const VORMERK_LOESCHEN_NACH_TAGEN = 30;

/**
 * Wortlaut der Einwilligung, der mit jeder Vormerkung gespeichert wird.
 * Platzhalter {betrieb}. Entwurf — Anwalt R52.
 */
export const EINWILLIGUNG_WORTLAUT =
  'Ich möchte von {betrieb} einmalig per Telefon oder E-Mail benachrichtigt werden, sobald für diese Vorbestellung wieder Ware frei ist. Meine Angaben werden nur dafür genutzt und spätestens 30 Tage nach Ende der Aktion gelöscht. Ich kann mich jederzeit von der Liste abmelden.';

export function einwilligungText(betrieb: string | null | undefined): string {
  const b = String(betrieb ?? '').trim() || 'unserem Betrieb';
  return EINWILLIGUNG_WORTLAUT.replace('{betrieb}', b);
}

// --- Datum ------------------------------------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
export function tagNr(iso: unknown): number | null {
  const m = ISO.exec(String(iso ?? '').slice(0, 10));
  if (!m) return null;
  const j = +m[1], mo = +m[2], t = +m[3];
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  return Math.round(d.getTime() / 86400000);
}
function isoVon(nr: number): string {
  return new Date(nr * 86400000).toISOString().slice(0, 10);
}
export function datumKurz(iso: unknown): string {
  const t = tagNr(iso);
  if (t === null) return '—';
  const s = isoVon(t);
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

/** Menge als Text: 1,5 kg · 3 Stk (höchstens 3 Nachkommastellen, Punkt bei Tausendern). */
export function mengeText(n: number | null | undefined, einheit?: string | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const z = rundeStellen(n, 3).toLocaleString('de-DE', { maximumFractionDigits: 3 });
  return einheit ? `${z} ${einheit}` : z;
}

// --- Typen ------------------------------------------------------------------

export type Aktion = {
  id?: string;
  titel: string;
  menge_gesamt: number;
  einheit: string;
  max_je_kunde: number | null;
  abhol_von: string;
  abhol_bis: string;
  bestell_schluss: string | null;
  status: string;
};
export type Posten = {
  id?: string;
  kunde_name: string;
  kunde_tel?: string | null;
  kunde_mail?: string | null;
  menge: number;
  abhol_tag: string;
  status: string;
  quelle?: string | null;
};
export type Vormerkung = {
  id?: string;
  kunde_name: string;
  kunde_tel?: string | null;
  kunde_mail?: string | null;
  menge_wunsch: number;
  status: string;
  erstellt_am: string;
  benachrichtigt_am?: string | null;
  frist_bis?: string | null;
};

// --- Stand einer Aktion -----------------------------------------------------

export function belegt(posten: Posten[]): number {
  let s = 0;
  for (const p of posten) if (BELEGT_STATUS.includes(p.status) && Number.isFinite(p.menge)) s += p.menge;
  return rundeStellen(s, 3);
}

export type Phase = 'entwurf' | 'vorbestellbar' | 'ausgebucht' | 'schluss' | 'abholung' | 'vorbei' | 'geschlossen' | 'abgeschlossen';
export type AktionStand = {
  belegt: number;
  frei: number;
  prozent: number;
  phase: Phase;
  /** Neue Vorbestellungen sind möglich (Status offen, nicht ausgebucht, vor Schluss und vor Abholende). */
  buchbar: boolean;
  text: string;
};

export function aktionStand(a: Aktion, posten: Posten[], heute: string): AktionStand {
  const b = belegt(posten);
  const frei = Math.max(0, rundeStellen(a.menge_gesamt - b, 3));
  const prozent = a.menge_gesamt > 0 ? Math.min(100, Math.round((b / a.menge_gesamt) * 100)) : 0;
  const h = tagNr(heute), von = tagNr(a.abhol_von), bis = tagNr(a.abhol_bis), schluss = tagNr(a.bestell_schluss);
  const e = a.einheit;
  const st = (phase: Phase, text: string, buchbar = false): AktionStand => ({ belegt: b, frei, prozent, phase, buchbar, text });
  if (a.status === 'abgeschlossen') return st('abgeschlossen', 'abgeschlossen');
  if (a.status === 'entwurf') return st('entwurf', 'Entwurf — noch nicht zum Vorbestellen geöffnet');
  if (h !== null && bis !== null && h > bis) return st('vorbei', `Abholzeitraum vorbei seit ${datumKurz(a.abhol_bis)}`);
  if (h !== null && von !== null && h >= von) return st('abholung', `Abholung läuft bis ${datumKurz(a.abhol_bis)}`);
  if (a.status === 'geschlossen') return st('geschlossen', 'für neue Vorbestellungen geschlossen');
  if (h !== null && schluss !== null && h > schluss) return st('schluss', `Bestellschluss war am ${datumKurz(a.bestell_schluss)}`);
  if (frei <= 0) return st('ausgebucht', 'ausgebucht — neue Kunden auf die Vormerkliste');
  return st('vorbestellbar', `noch ${mengeText(frei, e)} frei`, true);
}

// --- Eingaben prüfen ----------------------------------------------------------

type Pruef = { ok: true; felder: Record<string, unknown> } | { ok: false; fehler: string };

export type AktionEingabe = {
  titel: string; menge_gesamt: number | null; einheit: string; max_je_kunde: number | null;
  abhol_von: string; abhol_bis: string; bestell_schluss: string; notiz: string;
};

export function aktionPruefen(e: AktionEingabe, belegtBisher = 0): Pruef {
  const titel = e.titel.trim();
  if (titel.length < 1 || titel.length > 120) return { ok: false, fehler: 'Bitte die Ware benennen (höchstens 120 Zeichen).' };
  if (e.menge_gesamt === null || !(e.menge_gesamt > 0 && e.menge_gesamt <= 1_000_000)) return { ok: false, fehler: 'Bitte die verfügbare Gesamtmenge als positive Zahl eintragen.' };
  if (!(EINHEITEN as readonly string[]).includes(e.einheit)) return { ok: false, fehler: 'Bitte eine Einheit wählen.' };
  if (e.max_je_kunde !== null && !(e.max_je_kunde > 0)) return { ok: false, fehler: 'Die Höchstmenge je Kunde bitte als positive Zahl (oder leer lassen).' };
  if (e.max_je_kunde !== null && e.max_je_kunde > e.menge_gesamt) return { ok: false, fehler: 'Die Höchstmenge je Kunde ist größer als die Gesamtmenge.' };
  const von = tagNr(e.abhol_von), bis = tagNr(e.abhol_bis);
  if (von === null || bis === null) return { ok: false, fehler: 'Bitte den Abholzeitraum (von – bis) eintragen.' };
  if (bis < von) return { ok: false, fehler: 'Das Abholende liegt vor dem Abholbeginn.' };
  let schluss: number | null = null;
  if (e.bestell_schluss.trim()) {
    schluss = tagNr(e.bestell_schluss);
    if (schluss === null) return { ok: false, fehler: 'Bitte einen gültigen Bestellschluss eintragen (oder leer lassen).' };
    if (schluss > bis) return { ok: false, fehler: 'Der Bestellschluss liegt nach dem Abholende.' };
  }
  if (e.menge_gesamt < belegtBisher) return { ok: false, fehler: `Es sind bereits ${mengeText(belegtBisher, e.einheit)} vorbestellt — die Gesamtmenge kann nicht darunter sinken.` };
  if (e.notiz.trim().length > 500) return { ok: false, fehler: 'Notiz höchstens 500 Zeichen.' };
  return {
    ok: true,
    felder: {
      titel, menge_gesamt: rundeStellen(e.menge_gesamt, 3), einheit: e.einheit,
      max_je_kunde: e.max_je_kunde === null ? null : rundeStellen(e.max_je_kunde, 3),
      abhol_von: isoVon(von), abhol_bis: isoVon(bis), bestell_schluss: schluss === null ? null : isoVon(schluss),
      notiz: e.notiz.trim() || null,
    },
  };
}

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TEL = /^[+\d][\d\s/()-]{4,39}$/;

function kontaktPruefen(name: string, tel: string, mail: string): { ok: true; name: string; tel: string | null; mail: string | null } | { ok: false; fehler: string } {
  const n = name.trim();
  if (n.length < 1 || n.length > 120) return { ok: false, fehler: 'Bitte den Namen eintragen (höchstens 120 Zeichen).' };
  const t = tel.trim(), m = mail.trim();
  if (t && !TEL.test(t)) return { ok: false, fehler: 'Die Telefonnummer sieht nicht gültig aus.' };
  if (m && (m.length > 160 || !MAIL.test(m))) return { ok: false, fehler: 'Die E-Mail-Adresse sieht nicht gültig aus.' };
  return { ok: true, name: n, tel: t || null, mail: m || null };
}

export type PostenEingabe = { kunde_name: string; kunde_tel: string; kunde_mail: string; menge: number | null; abhol_tag: string; quelle: string; notiz: string };

/** Prüft eine neue Vorbestellung gegen die Aktion (wie der Wächter in SQL p342). */
export function postenPruefen(e: PostenEingabe, a: Aktion, frei: number): Pruef {
  if (a.status !== 'offen') return { ok: false, fehler: 'Die Aktion ist nicht zum Vorbestellen geöffnet.' };
  const k = kontaktPruefen(e.kunde_name, e.kunde_tel, e.kunde_mail);
  if (!k.ok) return k;
  if (e.menge === null || !(e.menge > 0)) return { ok: false, fehler: 'Bitte die Menge als positive Zahl eintragen.' };
  const menge = rundeStellen(e.menge, 3);
  if (a.max_je_kunde !== null && menge > a.max_je_kunde) return { ok: false, fehler: `Höchstens ${mengeText(a.max_je_kunde, a.einheit)} je Kunde.` };
  if (menge > frei) return { ok: false, fehler: frei > 0 ? `Nicht mehr genug da: frei sind noch ${mengeText(frei, a.einheit)}.` : 'Ausgebucht — bitte auf die Vormerkliste setzen.' };
  const tag = tagNr(e.abhol_tag), von = tagNr(a.abhol_von), bis = tagNr(a.abhol_bis);
  if (tag === null) return { ok: false, fehler: 'Bitte den Abholtag wählen.' };
  if (von !== null && bis !== null && (tag < von || tag > bis)) return { ok: false, fehler: `Abholung nur vom ${datumKurz(a.abhol_von)} bis ${datumKurz(a.abhol_bis)}.` };
  if (!(QUELLEN as readonly string[]).includes(e.quelle)) return { ok: false, fehler: 'Bitte angeben, wie bestellt wurde.' };
  if (e.notiz.trim().length > 300) return { ok: false, fehler: 'Notiz höchstens 300 Zeichen.' };
  return {
    ok: true,
    felder: { kunde_name: k.name, kunde_tel: k.tel, kunde_mail: k.mail, menge, abhol_tag: isoVon(tag), quelle: e.quelle, notiz: e.notiz.trim() || null },
  };
}

export type VormerkEingabe = { kunde_name: string; kunde_tel: string; kunde_mail: string; menge_wunsch: number | null; einwilligung: boolean; notiz: string };

/** Vormerkung: nur mit Einwilligung und mit mindestens einem Weg (Telefon oder E-Mail). */
export function vormerkPruefen(e: VormerkEingabe, a: Aktion, betrieb: string | null | undefined): Pruef {
  if (a.status === 'abgeschlossen') return { ok: false, fehler: 'Die Aktion ist abgeschlossen — keine neue Vormerkung.' };
  const k = kontaktPruefen(e.kunde_name, e.kunde_tel, e.kunde_mail);
  if (!k.ok) return k;
  if (!k.tel && !k.mail) return { ok: false, fehler: 'Für die Benachrichtigung bitte Telefon oder E-Mail eintragen.' };
  if (e.einwilligung !== true) return { ok: false, fehler: 'Ohne Einwilligung in die Benachrichtigung keine Vormerkung — bitte den Kunden fragen und das Häkchen setzen.' };
  if (e.menge_wunsch === null || !(e.menge_wunsch > 0)) return { ok: false, fehler: 'Bitte die gewünschte Menge eintragen.' };
  const menge = rundeStellen(e.menge_wunsch, 3);
  if (a.max_je_kunde !== null && menge > a.max_je_kunde) return { ok: false, fehler: `Höchstens ${mengeText(a.max_je_kunde, a.einheit)} je Kunde.` };
  if (e.notiz.trim().length > 300) return { ok: false, fehler: 'Notiz höchstens 300 Zeichen.' };
  return {
    ok: true,
    felder: {
      kunde_name: k.name, kunde_tel: k.tel, kunde_mail: k.mail, menge_wunsch: menge,
      einwilligung: true, einwilligung_wortlaut: einwilligungText(betrieb), notiz: e.notiz.trim() || null,
    },
  };
}

// --- Vormerkliste: Reihenfolge und Nachrücken ---------------------------------

const zeit = (iso: string | null | undefined) => { const t = Date.parse(String(iso ?? '')); return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY; };

/** Läuft die Antwortfrist eines benachrichtigten Kunden ab? */
export function fristAbgelaufen(v: Vormerkung, jetzt: string): boolean {
  if (v.status !== 'benachrichtigt') return false;
  const f = v.frist_bis ? zeit(v.frist_bis) : zeit(v.benachrichtigt_am) + VORMERK_FRIST_STUNDEN * 3600000;
  return Number.isFinite(f) && zeit(jetzt) > f;
}

/** Wartende in der Reihenfolge des Eintrags (wer zuerst kam, zuerst). */
export function warteReihe(vm: Vormerkung[]): Vormerkung[] {
  return vm.filter((v) => v.status === 'wartet').sort((x, y) => zeit(x.erstellt_am) - zeit(y.erstellt_am));
}

export type NachrueckVorschlag = {
  /** Wer jetzt benachrichtigt werden sollte (oder null). */
  naechste: Vormerkung | null;
  /** Wartende davor, deren Wunschmenge nicht in das Freie passt. */
  uebersprungen: Vormerkung[];
  /** Menge, die schon für benachrichtigte (Frist läuft) Kunden zurückgehalten wird. */
  zurueckgehalten: number;
  /** Frei, abzüglich zurückgehaltener Menge. */
  verfuegbar: number;
};

/**
 * Wer rückt nach? Benachrichtigte mit laufender Frist halten ihre Wunschmenge
 * zurück; danach bekommt der erste Wartende, dessen Wunsch in das Freie passt,
 * den Vorschlag. Wer davor wartet, aber mehr möchte, wird als „übersprungen"
 * gezeigt — der Betrieb kann ihm auch eine kleinere Menge anbieten.
 */
export function nachrueckVorschlag(vm: Vormerkung[], frei: number, jetzt: string): NachrueckVorschlag {
  let zurueck = 0;
  for (const v of vm) if (v.status === 'benachrichtigt' && !fristAbgelaufen(v, jetzt)) zurueck += v.menge_wunsch;
  zurueck = rundeStellen(zurueck, 3);
  const verfuegbar = Math.max(0, rundeStellen(frei - zurueck, 3));
  const uebersprungen: Vormerkung[] = [];
  if (verfuegbar <= 0) return { naechste: null, uebersprungen, zurueckgehalten: zurueck, verfuegbar };
  for (const v of warteReihe(vm)) {
    if (v.menge_wunsch <= verfuegbar) return { naechste: v, uebersprungen, zurueckgehalten: zurueck, verfuegbar };
    uebersprungen.push(v);
  }
  return { naechste: null, uebersprungen, zurueckgehalten: zurueck, verfuegbar };
}

/** Platz in der Warteschlange (1 = als Nächstes), sonst null. */
export function platzInReihe(vm: Vormerkung[], id: string | undefined): number | null {
  if (!id) return null;
  const i = warteReihe(vm).findIndex((v) => v.id === id);
  return i < 0 ? null : i + 1;
}

/** Erledigte Vormerkungen, die nach der Löschfrist entfernt werden dürfen. */
export function vormerkLoeschbar(vm: (Vormerkung & { aktualisiert_am?: string | null })[], aktionEnde: string, heute: string): Vormerkung[] {
  const h = tagNr(heute), ende = tagNr(aktionEnde);
  if (h === null) return [];
  return vm.filter((v) => {
    if (v.status === 'wartet' || v.status === 'benachrichtigt') {
      // auch Wartende: spätestens 30 Tage nach Ende der Aktion
      return ende !== null && h > ende + VORMERK_LOESCHEN_NACH_TAGEN;
    }
    const seit = tagNr(String(v.aktualisiert_am ?? v.benachrichtigt_am ?? v.erstellt_am).slice(0, 10));
    return seit !== null && h > seit + VORMERK_LOESCHEN_NACH_TAGEN;
  });
}

// --- Benachrichtigung (Text für Telefon oder eigene E-Mail des Betriebs) -------

export function benachrichtigungsText(a: Aktion, v: Vormerkung, betrieb: string | null | undefined, frei: number): { betreff: string; text: string } {
  const b = String(betrieb ?? '').trim() || 'Ihr Fachgeschäft';
  const menge = Math.min(v.menge_wunsch, frei);
  const teil = menge < v.menge_wunsch ? ` Frei sind derzeit ${mengeText(menge, a.einheit)} (Ihr Wunsch: ${mengeText(v.menge_wunsch, a.einheit)}).` : '';
  const betreff = `${a.titel}: Ihre Vormerkung — jetzt ist etwas frei`;
  const text = [
    `Guten Tag ${v.kunde_name.trim()},`,
    '',
    `Sie hatten sich für „${a.titel}“ vormerken lassen. Jetzt ist wieder Ware frei, und wir halten Ihnen ${mengeText(menge, a.einheit)} ${VORMERK_FRIST_STUNDEN} Stunden lang zurück.${teil}`,
    `Abholung vom ${datumKurz(a.abhol_von)} bis ${datumKurz(a.abhol_bis)}.`,
    '',
    'Bitte geben Sie uns kurz Bescheid, ob Sie die Vorbestellung möchten. Wenn nicht, nehmen wir Sie von der Liste — Sie müssen nichts weiter tun.',
    '',
    'Freundliche Grüße',
    b,
  ].join('\n');
  return { betreff, text };
}

/** mailto-Link für die eigene E-Mail des Betriebs (ARGONAUT versendet in Teil 1 nichts selbst). */
export function mailtoLink(mail: string | null | undefined, betreff: string, text: string): string | null {
  const m = String(mail ?? '').trim();
  if (!m || !MAIL.test(m)) return null;
  return `mailto:${encodeURIComponent(m).replace(/%40/g, '@')}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}
export function telLink(tel: string | null | undefined): string | null {
  const t = String(tel ?? '').replace(/[^\d+]/g, '');
  return t.length >= 5 ? `tel:${t}` : null;
}

// --- Abholliste ----------------------------------------------------------------

export type AbholTag = { tag: string; posten: Posten[]; summe: number; offen: number };

/** Abholliste je Tag (ohne storniert), sortiert nach Tag und Name. */
export function abholListe(posten: Posten[]): AbholTag[] {
  const je = new Map<string, Posten[]>();
  for (const p of posten) {
    if (p.status === 'storniert') continue;
    const t = tagNr(p.abhol_tag);
    if (t === null) continue;
    const k = isoVon(t);
    (je.get(k) ?? je.set(k, []).get(k)!).push(p);
  }
  return [...je.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([tag, ps]) => {
    ps.sort((x, y) => x.kunde_name.localeCompare(y.kunde_name, 'de'));
    let summe = 0, offen = 0;
    for (const p of ps) { if (BELEGT_STATUS.includes(p.status)) summe += p.menge; if (p.status === 'offen' || p.status === 'bereit') offen += 1; }
    return { tag, posten: ps, summe: rundeStellen(summe, 3), offen };
  });
}

/** Kachel-Zahlen über alle Aktionen. */
export function vorbestellUebersicht(staende: AktionStand[], vm: Vormerkung[], jetzt: string): { buchbar: number; ausgebucht: number; wartend: number; fristAbgelaufen: number } {
  return {
    buchbar: staende.filter((s) => s.buchbar).length,
    ausgebucht: staende.filter((s) => s.phase === 'ausgebucht').length,
    wartend: vm.filter((v) => v.status === 'wartet').length,
    fristAbgelaufen: vm.filter((v) => fristAbgelaufen(v, jetzt)).length,
  };
}
