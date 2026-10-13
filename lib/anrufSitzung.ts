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
  erster_anruf_am?: string | null;
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

// ============================================================================
// Paket 361 (VK4 Teil 2): Zeit bis zum ersten Anruf, Glocke, Auswertung.
// ============================================================================

export const ERSTANRUF_SCHWELLE_MIN = 15;   // so lange darf ein neuer Lead warten, dann Glocke
export const ERSTANRUF_FENSTER_STD = 24;    // ältere Leads lösen keine Glocke mehr aus

export type Reaktion = { minuten: number | null; laeuft: boolean; ampel: 'gruen' | 'gelb' | 'rot' | 'grau'; text: string };

/** Minuten von der Anfrage bis zum ersten Anruf; ohne Anruf läuft die Uhr (bei offenen Leads mit Nummer). */
export function ersteReaktion(l: Partial<LeadRoh>, jetzt: Date): Reaktion {
  const start = l.created_at ? new Date(l.created_at).getTime() : NaN;
  if (Number.isNaN(start)) return { minuten: null, laeuft: false, ampel: 'grau', text: '—' };
  const erst = l.erster_anruf_am ? new Date(l.erster_anruf_am).getTime() : NaN;
  const laeuft = Number.isNaN(erst);
  if (laeuft && (!telefonNorm(l.telefon) || !leadAktiv(l as LeadRoh))) return { minuten: null, laeuft: false, ampel: 'grau', text: 'nicht angerufen' };
  const minuten = Math.max(0, Math.round(((laeuft ? jetzt.getTime() : erst) - start) / 60_000));
  const ampel = minuten <= 5 ? 'gruen' : minuten <= 60 ? 'gelb' : 'rot';
  return { minuten, laeuft, ampel, text: (laeuft ? 'wartet seit ' : 'angerufen nach ') + dauerText(minuten) };
}

/** „4 Min." / „2 Std. 10 Min." / „3 Tage". */
export function dauerText(min: number): string {
  if (min < 60) return `${min} Min.`;
  if (min < 48 * 60) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} Std. ${m} Min.` : `${h} Std.`; }
  return `${Math.round(min / 1440)} Tage`;
}

/** Kennzahlen „Zeit bis zum ersten Anruf" über Leads mit Telefonnummer. */
export function reaktionsZahlen(leads: readonly LeadRoh[], jetzt: Date): { angerufen: number; median: number | null; unter5: number; unter60: number; wartend: number } {
  const zeiten: number[] = []; let wartend = 0;
  for (const l of leads) {
    const r = ersteReaktion(l, jetzt);
    if (r.minuten == null) continue;
    if (r.laeuft) wartend++; else zeiten.push(r.minuten);
  }
  zeiten.sort((a, b) => a - b);
  const n = zeiten.length;
  const median = n ? (n % 2 ? zeiten[(n - 1) / 2] : Math.round((zeiten[n / 2 - 1] + zeiten[n / 2]) / 2)) : null;
  const anteil = (g: number) => (n ? Math.round((zeiten.filter((z) => z <= g).length / n) * 100) : 0);
  return { angerufen: n, median, unter5: anteil(5), unter60: anteil(60), wartend };
}

/** Für den Glocken-Cron: neue Leads, die seit SCHWELLE Minuten (aber höchstens FENSTER Stunden) auf den ersten Anruf warten. */
export function erstanrufFaellig<T extends LeadRoh & { owner_user_id?: string | null }>(leads: readonly T[], jetzt: Date, schwelleMin = ERSTANRUF_SCHWELLE_MIN, fensterStd = ERSTANRUF_FENSTER_STD): T[] {
  return leads.filter((l) => {
    if (l.erster_anruf_am || !l.created_at || !telefonNorm(l.telefon) || !leadAktiv(l)) return false;
    const alter = (jetzt.getTime() - new Date(l.created_at).getTime()) / 60_000;
    return Number.isFinite(alter) && alter >= schwelleMin && alter <= fensterStd * 60;
  });
}

/** Wer bekommt die Glocke: der Setter, sonst die Geschäftsleitung. */
export function glockeAn(l: { setter_user_id?: string | null; owner_user_id?: string | null }): string | null {
  return l.setter_user_id || l.owner_user_id || null;
}

export function glockeText(l: LeadRoh, jetzt: Date): { titel: string; nachricht: string; link: string } {
  const min = l.created_at ? Math.max(0, Math.round((jetzt.getTime() - new Date(l.created_at).getTime()) / 60_000)) : 0;
  const name = txt(l.name) || 'Neuer Lead';
  return {
    titel: `☎️ ${name} wartet seit ${dauerText(min)} auf den ersten Anruf`,
    nachricht: `Neue Anfrage${l.quelle ? ` (${l.quelle})` : ''}${l.dienstleistung ? `: ${txt(l.dienstleistung).slice(0, 80)}` : ''}. Je schneller der erste Anruf, desto eher wird ein Termin daraus.`,
    link: `/dashboard/akquise/sitzung`,
  };
}

export type AnrufZeile = { user_id?: string | null; anrufer_name?: string | null; ergebnis: string; erstellt_am: string };
export type PersonZahlen = { user_id: string; name: string; anrufe: number; erreicht: number; termine: number; quote: number; jeTermin: number | null };
/** Auswertung je Person: Anrufe, Erreicht-Quote, Termine, Anrufe je Termin. Meiste Anrufe zuerst. */
export function personenZahlen(anrufe: readonly AnrufZeile[], namen?: ReadonlyMap<string, string>): PersonZahlen[] {
  const m = new Map<string, AnrufZeile[]>();
  for (const a of anrufe) { const k = a.user_id ?? 'unbekannt'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(a); }
  return [...m.entries()].map(([user_id, liste]) => {
    const t = tagesZahlen(liste);
    return { user_id, name: namen?.get(user_id) ?? liste.find((x) => x.anrufer_name)?.anrufer_name ?? 'Unbekannt', anrufe: t.anrufe, erreicht: t.erreicht, termine: t.termine, quote: t.quote, jeTermin: t.termine ? Math.round((t.anrufe / t.termine) * 10) / 10 : null };
  }).sort((a, b) => b.anrufe - a.anrufe || a.name.localeCompare(b.name, 'de'));
}

/** Verteilung der Ergebnisse (für die Auswertung). */
export function ergebnisVerteilung(anrufe: readonly { ergebnis: string }[]): { key: string; name: string; anzahl: number; farbe: string }[] {
  return ERGEBNISSE.map((e) => ({ key: e.key, name: e.name, farbe: e.farbe, anzahl: anrufe.filter((a) => a.ergebnis === e.key).length })).filter((x) => x.anzahl > 0);
}

export { zeitDe, uhrDe, berlinTag };
