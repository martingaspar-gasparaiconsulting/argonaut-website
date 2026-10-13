// ARGONAUT OS · lib/anrufSitzung.ts — Paket 360 (13.10.2026)
// VK4 Anruf-Sitzung, Teil 1: Tages-Warteschlange, Ergebnis-Codes, Rückrufe.
//
// Reine Logik (node-getestet in tests/anrufSitzungP360). Dieselben Regeln wie
// supabase-sql/p360-anruf-sitzung.sql:
//   · Wieder dran: Rückruf zur vereinbarten Zeit; nicht erreicht / Mailbox /
//     besetzt nach 2 Stunden, ab dem 3. Versuch nach 20 Stunden.
//   · Aus der Liste fallen: Termin, kein Interesse, falsche Nummer, Kunde,
//     verloren, ohne Telefonnummer, nach MAX_VERSUCHE Versuchen.
//   · Kontakte mit Werbe-Widerspruch kommen nie in die Liste.
// Läuft ohne Telefonanlage: „Anrufen" öffnet das Telefon (tel:).
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

import { berlinZuIso, berlinTag, zeitDe, uhrDe } from './bewachung';

export const MAX_VERSUCHE = 6;

export const ERGEBNISSE = Object.freeze([
  { key: 'nicht_erreicht', name: 'Nicht erreicht', icon: '📵', farbe: '#8FA3BE', erreicht: false, beendet: false },
  { key: 'mailbox', name: 'Mailbox', icon: '📼', farbe: '#8FA3BE', erreicht: false, beendet: false },
  { key: 'besetzt', name: 'Besetzt', icon: '⛔', farbe: '#8FA3BE', erreicht: false, beendet: false },
  { key: 'rueckruf', name: 'Rückruf vereinbart', icon: '🔁', farbe: '#00e5ff', erreicht: true, beendet: false },
  { key: 'gespraech', name: 'Gespräch, noch offen', icon: '💬', farbe: '#C9A84C', erreicht: true, beendet: false },
  { key: 'termin', name: 'Termin vereinbart', icon: '📅', farbe: '#4CAF7D', erreicht: true, beendet: true },
  { key: 'kein_interesse', name: 'Kein Interesse', icon: '✋', farbe: '#E06666', erreicht: true, beendet: true },
  { key: 'falsche_nummer', name: 'Falsche Nummer', icon: '❌', farbe: '#E06666', erreicht: false, beendet: true },
] as const);
export type ErgebnisKey = (typeof ERGEBNISSE)[number]['key'];
const KEYS: readonly string[] = ERGEBNISSE.map((e) => e.key);
export function istErgebnis(x: unknown): x is ErgebnisKey { return typeof x === 'string' && KEYS.includes(x); }
export function ergebnis(k: string | null | undefined) { return ERGEBNISSE.find((e) => e.key === k) ?? null; }
const BEENDET = new Set<string>(ERGEBNISSE.filter((e) => e.beendet).map((e) => e.key));
const NICHT_DA = new Set(['nicht_erreicht', 'mailbox', 'besetzt']);

/** Nummer für tel: — nur Ziffern und ein führendes +. Unter 5 Ziffern: keine brauchbare Nummer. */
export function telefonNorm(t: string | null | undefined): string | null {
  const roh = String(t ?? '').trim();
  if (!roh) return null;
  const plus = roh.startsWith('+') || roh.startsWith('00');
  const ziffern = roh.replace(/\D/g, '').replace(/^00/, '');
  if (ziffern.length < 5 || ziffern.length > 17) return null;
  return (plus ? '+' : '') + ziffern;
}

/** Wann ist ein Lead wieder dran (wie die Datenbank p360_lead_rechnen)? */
export function naechsterVersuch(letztes: string | null, letzterAm: string | null, versuche: number, rueckrufAm?: string | null): string | null {
  if (letztes === 'rueckruf') return rueckrufAm ?? null;
  if (letztes && NICHT_DA.has(letztes) && letzterAm) {
    const t = new Date(letzterAm).getTime();
    if (Number.isNaN(t)) return null;
    return new Date(t + (versuche >= 3 ? 20 : 2) * 3_600_000).toISOString();
  }
  return null;
}

export type LeadRoh = {
  id: string; name?: string | null; telefon?: string | null; email?: string | null; status?: string | null; stufe?: string | null;
  quelle?: string | null; created_at?: string | null; nachricht?: string | null; dienstleistung?: string | null;
  setter_user_id?: string | null; closer_user_id?: string | null;
  anruf_versuche?: number | null; letzter_anruf_ergebnis?: string | null; letzter_anruf_am?: string | null; naechster_anruf_am?: string | null;
};
export type KontaktRoh = Record<string, unknown> & { id: string };
export type AnrufKurz = { kontakt_id?: string | null; lead_id?: string | null; ergebnis: string; rueckruf_am?: string | null; erstellt_am: string };

export type Grund = 'rueckruf' | 'neu' | 'offen' | 'liste';
export const GRUND_TEXT: Record<Grund, string> = { rueckruf: 'Rückruf fällig', neu: 'Neuer Lead – noch nie angerufen', offen: 'Erneuter Versuch', liste: 'Aus Liste' };

export type Eintrag = {
  typ: 'lead' | 'kontakt'; id: string; name: string; firma: string | null; telefon: string; telefonRoh: string;
  grund: Grund; faellig: string | null; versuche: number; letztes: string | null; letzterAm: string | null;
  angelegt: string | null; anliegen: string | null; quelle: string | null;
};

export type Quellen = { rueckrufe: boolean; neue: boolean; offene: boolean; liste: boolean };
export type WarteschlangeEingabe = {
  leads: readonly LeadRoh[]; kontakte?: readonly KontaktRoh[]; anrufeKontakte?: readonly AnrufKurz[];
  jetzt: Date; quellen: Quellen; ich?: string | null; nurMeine?: boolean; maxVersuche?: number;
};

const ZU_LEAD = new Set(['kunde', 'verloren', 'gewonnen']);
function leadAktiv(l: LeadRoh): boolean {
  if (l.stufe && ZU_LEAD.has(l.stufe)) return false;
  if (!l.stufe && l.status && ZU_LEAD.has(l.status)) return false;
  return true;
}
function faellig(iso: string | null | undefined, jetzt: Date): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) || t <= jetzt.getTime();
}
function txt(x: unknown): string { return String(x ?? '').trim(); }

/** Kontakt-Stand aus den eigenen Anrufen: Versuche, letztes Ergebnis, nächster Termin. */
export function kontaktStand(anrufe: readonly AnrufKurz[]): Map<string, { versuche: number; letztes: string; letzterAm: string; naechster: string | null }> {
  const m = new Map<string, { versuche: number; letztes: string; letzterAm: string; naechster: string | null }>();
  const sortiert = anrufe.filter((a) => a.kontakt_id).slice().sort((a, b) => a.erstellt_am.localeCompare(b.erstellt_am));
  for (const a of sortiert) {
    const alt = m.get(a.kontakt_id as string);
    const versuche = (alt?.versuche ?? 0) + 1;
    m.set(a.kontakt_id as string, { versuche, letztes: a.ergebnis, letzterAm: a.erstellt_am, naechster: naechsterVersuch(a.ergebnis, a.erstellt_am, versuche, a.rueckruf_am) });
  }
  return m;
}

/**
 * Die Warteschlange: zuerst fällige Rückrufe (früheste zuerst), dann neue Leads
 * (neueste zuerst — je frischer, desto eher erreichbar), dann erneute Versuche
 * (wenigste Versuche zuerst), dann Kontakte aus der Liste. Jede Person nur einmal.
 */
export function warteschlange(e: WarteschlangeEingabe): Eintrag[] {
  const max = e.maxVersuche ?? MAX_VERSUCHE;
  const out: Eintrag[] = [];
  for (const l of e.leads) {
    const tel = telefonNorm(l.telefon);
    if (!tel || !leadAktiv(l)) continue;
    if (e.nurMeine && e.ich && l.setter_user_id !== e.ich && l.closer_user_id !== e.ich) continue;
    const versuche = Number(l.anruf_versuche ?? 0) || 0;
    const letztes = l.letzter_anruf_ergebnis ?? null;
    if (letztes && BEENDET.has(letztes)) continue;
    if (versuche >= max && letztes !== 'rueckruf') continue;
    if (!faellig(l.naechster_anruf_am, e.jetzt)) continue;
    const grund: Grund = letztes === 'rueckruf' ? 'rueckruf' : versuche === 0 ? 'neu' : 'offen';
    if ((grund === 'rueckruf' && !e.quellen.rueckrufe) || (grund === 'neu' && !e.quellen.neue) || (grund === 'offen' && !e.quellen.offene)) continue;
    out.push({
      typ: 'lead', id: l.id, name: txt(l.name) || 'Ohne Namen', firma: null, telefon: tel, telefonRoh: txt(l.telefon),
      grund, faellig: l.naechster_anruf_am ?? null, versuche, letztes, letzterAm: l.letzter_anruf_am ?? null,
      angelegt: l.created_at ?? null, anliegen: txt(l.dienstleistung) || txt(l.nachricht) || null, quelle: l.quelle ?? null,
    });
  }
  const stand = kontaktStand(e.anrufeKontakte ?? []);
  for (const k of e.kontakte ?? []) {
    const tel = telefonNorm(txt(k.telefon) || txt(k.mobil));
    if (!tel) continue;
    if (k.werbe_widerspruch_am) continue;
    const s = stand.get(k.id);
    const versuche = s?.versuche ?? 0;
    const letztes = s?.letztes ?? null;
    if (letztes && BEENDET.has(letztes)) continue;
    if (versuche >= max && letztes !== 'rueckruf') continue;
    if (!faellig(s?.naechster, e.jetzt)) continue;
    const grund: Grund = letztes === 'rueckruf' ? 'rueckruf' : 'liste';
    if ((grund === 'rueckruf' && !e.quellen.rueckrufe) || (grund === 'liste' && !e.quellen.liste)) continue;
    const name = [txt(k.vorname), txt(k.nachname)].filter(Boolean).join(' ') || txt(k.firma) || 'Ohne Namen';
    out.push({
      typ: 'kontakt', id: k.id, name, firma: txt(k.firma) || null, telefon: tel, telefonRoh: txt(k.telefon) || txt(k.mobil),
      grund, faellig: s?.naechster ?? null, versuche, letztes, letzterAm: s?.letzterAm ?? null,
      angelegt: null, anliegen: null, quelle: null,
    });
  }
  const rang: Record<Grund, number> = { rueckruf: 0, neu: 1, offen: 2, liste: 3 };
  const zeit = (x: string | null) => (x ? new Date(x).getTime() || 0 : 0);
  out.sort((a, b) => rang[a.grund] - rang[b.grund]
    || (a.grund === 'rueckruf' ? zeit(a.faellig) - zeit(b.faellig) : 0)
    || (a.grund === 'neu' ? zeit(b.angelegt) - zeit(a.angelegt) : 0)
    || (a.grund === 'offen' || a.grund === 'liste' ? a.versuche - b.versuche || zeit(a.letzterAm) - zeit(b.letzterAm) : 0)
    || a.name.localeCompare(b.name, 'de'));
  const gesehen = new Set<string>();
  return out.filter((x) => { const k = x.telefon; if (gesehen.has(k)) return false; gesehen.add(k); return true; });
}

// --- Rückruf-Zeit ------------------------------------------------------------
/** Schnellwahl in Berliner Zeit: in 1 Std., heute 16:00 (wenn noch davor), morgen 9:00/14:00, in einer Woche 9:00. */
export function rueckrufVorschlaege(jetzt: Date): { text: string; iso: string }[] {
  const heute = berlinTag(jetzt.toISOString());
  const tag = (plus: number) => {
    const d = new Date(`${heute}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + plus);
    return d.toISOString().slice(0, 10);
  };
  const out: { text: string; iso: string }[] = [{ text: 'In 1 Std.', iso: new Date(jetzt.getTime() + 3_600_000).toISOString() }];
  const h16 = berlinZuIso(heute, '16:00');
  if (h16 && new Date(h16).getTime() - jetzt.getTime() > 30 * 60_000) out.push({ text: 'Heute 16:00', iso: h16 });
  for (const [t, u, text] of [[1, '09:00', 'Morgen 9:00'], [1, '14:00', 'Morgen 14:00'], [7, '09:00', 'In 1 Woche 9:00']] as const) {
    const iso = berlinZuIso(tag(t), u);
    if (iso) out.push({ text, iso });
  }
  return out;
}

/** Eingabe aus datetime-local („2026-10-14T09:30") als Berliner Zeit lesen. */
export function lokalZuIso(wert: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(wert ?? ''));
  return m ? berlinZuIso(m[1], m[2]) : null;
}

/** Prüfung vor dem Speichern — wie die Datenbank. */
export function anrufPruefen(erg: string, rueckrufIso: string | null, notiz: string, jetzt: Date): string[] {
  const f: string[] = [];
  if (!istErgebnis(erg)) f.push('Bitte ein Ergebnis wählen.');
  if (erg === 'rueckruf') {
    if (!rueckrufIso) f.push('Bitte die Rückruf-Zeit wählen.');
    else {
      const t = new Date(rueckrufIso).getTime();
      if (Number.isNaN(t) || t < jetzt.getTime() - 5 * 60_000) f.push('Die Rückruf-Zeit muss in der Zukunft liegen.');
      else if (t > jetzt.getTime() + 366 * 86_400_000) f.push('Die Rückruf-Zeit darf höchstens ein Jahr entfernt sein.');
    }
  }
  if (notiz.length > 2000) f.push('Die Notiz darf höchstens 2.000 Zeichen haben.');
  return f;
}

/** Zeilen für das Speichern (Bezug je nach Typ; Zeit und Person setzt der Server). */
export function anrufZeile(x: Pick<Eintrag, 'typ' | 'id'>, erg: ErgebnisKey, rueckrufIso: string | null, notiz: string, betrieb: string, ich: string) {
  return {
    owner_user_id: betrieb, user_id: ich,
    lead_id: x.typ === 'lead' ? x.id : null, kontakt_id: x.typ === 'kontakt' ? x.id : null,
    ergebnis: erg, rueckruf_am: erg === 'rueckruf' ? rueckrufIso : null, notiz: notiz.trim() || null,
  };
}

/** Kennzahlen eines Tages (eigene Anrufe). */
export function tagesZahlen(anrufe: readonly { ergebnis: string }[]): { anrufe: number; erreicht: number; termine: number; quote: number } {
  const erreicht = anrufe.filter((a) => ergebnis(a.ergebnis)?.erreicht).length;
  const termine = anrufe.filter((a) => a.ergebnis === 'termin').length;
  return { anrufe: anrufe.length, erreicht, termine, quote: anrufe.length ? Math.round((erreicht / anrufe.length) * 100) : 0 };
}

/** „vor 5 Min." / „vor 3 Std." / „vor 2 Tagen" — für „angelegt" und „letzter Versuch". */
export function seitText(iso: string | null | undefined, jetzt: Date): string {
  if (!iso) return '—';
  const ms = jetzt.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.round(min / 60);
  if (std < 48) return `vor ${std} Std.`;
  return `vor ${Math.round(std / 24)} Tagen`;
}

export { zeitDe, uhrDe, berlinTag };
