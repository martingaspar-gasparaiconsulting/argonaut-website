// ============================================================================
// ARGONAUT OS · lib/terminVerteilung.ts — Paket VK3 (16.10.2026)
// Termin-Verteilung auf Closer.
//
//   · Modus „reihum": wer am längsten nichts bekommen hat, ist dran.
//   · Modus „freie_zeit": wer in den nächsten 14 Tagen am wenigsten Termine hat.
//   · Regeln aus den Antworten der Qualifizierung (VK2), z. B. Budget
//     „über 20.000 €" → nur erfahrene Closer. Die erste passende Regel grenzt
//     die Auswahl ein; ist dort niemand frei, gilt wieder das ganze Team (mit Hinweis).
//   · Nur wer zum Zeitpunkt frei ist (keine überlappenden Termine, nicht abwesend).
//
// Gleiche Regeln wie supabase-sql/p409-termin-verteilung.sql (Modus-Werte).
// Keine Imports — node-testbar (tests/terminVerteilungVK3.test.mjs).
// ============================================================================

export type Modus = 'aus' | 'reihum' | 'freie_zeit';
export const MODI: readonly { key: Modus; name: string; text: string }[] = Object.freeze([
  { key: 'aus', name: 'Aus', text: 'Niemand wird automatisch zugeteilt.' },
  { key: 'reihum', name: 'Reihum', text: 'Wer am längsten keinen Termin bekommen hat, ist als Nächstes dran.' },
  { key: 'freie_zeit', name: 'Nach freier Zeit', text: 'Wer in den nächsten 14 Tagen am wenigsten verplant ist, bekommt den Termin.' },
]);
export function istModus(x: unknown): x is Modus { return x === 'aus' || x === 'reihum' || x === 'freie_zeit'; }

export type Regel = { frage: string; wert: string; an: string[] };
export type Closer = { user_id: string; name: string; mitarbeiter_id: string | null };

/** Regeln bereinigen: nur vollständige, nur Closer aus dem Team, höchstens 20. */
export function regelnBereinigen(roh: unknown, closerIds: readonly string[]): Regel[] {
  if (!Array.isArray(roh)) return [];
  const out: Regel[] = [];
  for (const r of roh.slice(0, 20)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const frage = typeof o.frage === 'string' ? o.frage.trim().slice(0, 40) : '';
    const wert = typeof o.wert === 'string' ? o.wert.trim().slice(0, 120) : '';
    const an = Array.isArray(o.an) ? [...new Set(o.an.filter((x): x is string => typeof x === 'string' && closerIds.includes(x)))] : [];
    if (!frage || !wert || an.length === 0) continue;
    out.push({ frage, wert, an });
  }
  return out;
}

export type Termin = { mitarbeiter_id: string | null; beginn_am: string; ende_am: string; status?: string | null };
export type Abwesenheit = { mitarbeiter_id: string | null; von: string | null; bis: string | null; status?: string | null };

const STORNO = new Set(['storniert', 'abgesagt', 'ausgefallen', 'nicht_erschienen']);
const ABW_ZAEHLT = (s: string | null | undefined) => !['abgelehnt', 'storniert', 'zurueckgezogen'].includes(String(s ?? '').toLowerCase());

/** Berliner Kalendertag eines Zeitpunkts (YYYY-MM-DD). */
function berlinTag(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Ist der Mitarbeiter im Zeitraum [beginn, ende) frei? Ohne Mitarbeiter-Kennung: nie (kann keinen Termin tragen). */
export function istFrei(mitarbeiterId: string | null, beginn: Date, ende: Date, termine: readonly Termin[], abw: readonly Abwesenheit[] = []): boolean {
  if (!mitarbeiterId) return false;
  const b = beginn.getTime(); const e = ende.getTime();
  for (const t of termine) {
    if (t.mitarbeiter_id !== mitarbeiterId || STORNO.has(String(t.status ?? '').toLowerCase())) continue;
    const tb = new Date(t.beginn_am).getTime(); const te = new Date(t.ende_am).getTime();
    if (tb < e && b < te) return false; // halb-offene Intervalle überlappen
  }
  const tag = berlinTag(beginn);
  for (const a of abw) {
    if (a.mitarbeiter_id !== mitarbeiterId || !a.von || !a.bis || !ABW_ZAEHLT(a.status)) continue;
    if (tag >= String(a.von).slice(0, 10) && tag <= String(a.bis).slice(0, 10)) return false;
  }
  return true;
}

/** Verplante Minuten je Mitarbeiter im Zeitraum (ohne stornierte Termine). */
export function belegung(termine: readonly Termin[], von: Date, bis: Date): Map<string, number> {
  const m = new Map<string, number>();
  const v = von.getTime(); const b = bis.getTime();
  for (const t of termine) {
    if (!t.mitarbeiter_id || STORNO.has(String(t.status ?? '').toLowerCase())) continue;
    const s = Math.max(v, new Date(t.beginn_am).getTime()); const e = Math.min(b, new Date(t.ende_am).getTime());
    if (e > s) m.set(t.mitarbeiter_id, (m.get(t.mitarbeiter_id) ?? 0) + Math.round((e - s) / 60000));
  }
  return m;
}

export type Wahl = { user_id: string; grund: string } | null;

export type WahlEingang = {
  modus: Modus;
  closer: readonly Closer[];
  /** user_ids, die zum gewünschten Zeitpunkt frei sind (ohne Angabe: alle). */
  frei?: ReadonlySet<string> | null;
  /** Letzte Zuteilung je user_id (ISO). Nie zugeteilt = ganz vorne. */
  zuletzt?: ReadonlyMap<string, string>;
  /** Verplante Minuten je mitarbeiter_id. */
  minuten?: ReadonlyMap<string, number>;
  antworten?: Readonly<Record<string, string>>;
  regeln?: readonly Regel[];
};

/** Wählt den Closer. Gleichstand → Name (stabil). Niemand frei → null. */
export function waehleCloser(e: WahlEingang): Wahl {
  if (e.modus === 'aus' || e.closer.length === 0) return null;
  const istFreiId = (id: string) => !e.frei || e.frei.has(id);
  const regel = (e.regeln ?? []).find((r) => (e.antworten?.[r.frage] ?? '').trim() === r.wert);
  let kandidaten = e.closer.filter((c) => istFreiId(c.user_id));
  let hinweis = '';
  if (regel) {
    const eng = kandidaten.filter((c) => regel.an.includes(c.user_id));
    if (eng.length) { kandidaten = eng; hinweis = ` · Regel „${regel.wert}"`; }
    else hinweis = ` · Regel „${regel.wert}": niemand frei, ganzes Team`;
  }
  if (kandidaten.length === 0) return null;
  const letzte = (c: Closer) => e.zuletzt?.get(c.user_id) ?? '';
  const minuten = (c: Closer) => (c.mitarbeiter_id ? e.minuten?.get(c.mitarbeiter_id) ?? 0 : 0);
  const sortiert = [...kandidaten].sort((a, b) => {
    if (e.modus === 'freie_zeit') { const d = minuten(a) - minuten(b); if (d) return d; }
    const l = letzte(a).localeCompare(letzte(b)); if (l) return l;
    return a.name.localeCompare(b.name, 'de');
  });
  const w = sortiert[0];
  const grund = e.modus === 'freie_zeit'
    ? `am wenigsten verplant (${Math.round(minuten(w) / 60 * 10) / 10} Std. in 14 Tagen)`
    : letzte(w) ? 'am längsten ohne Termin' : 'noch ohne Termin';
  return { user_id: w.user_id, grund: grund + hinweis };
}

/** Letzte Zuteilung je Person aus Übergaben (VK2) und zugeteilten Terminen. */
export function letzteZuteilung(eintraege: readonly { user_id: string | null; am: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of eintraege) {
    if (!x.user_id || !x.am) continue;
    if ((m.get(x.user_id) ?? '') < x.am) m.set(x.user_id, x.am);
  }
  return m;
}
