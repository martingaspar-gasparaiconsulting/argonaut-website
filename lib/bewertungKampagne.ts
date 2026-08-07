// ============================================================================
// ARGONAUT OS · lib/bewertungKampagne.ts — reine Logik für Bewertungs-Kampagnen
// (Marketing-Ausbau · Punkt 7 — Reputation: viele Kunden auf einmal einladen)
//
// Baut auf dem bestehenden Bewertungs-Modul auf (Tabelle bewertungsanfragen,
// Einzel-Versand /api/bewertung-senden, öffentliche Abgabe /bewerten/<token>).
// NEU ist die KAMPAGNE: aus den CRM-Kontakten einen Empfänger-Pool bilden
// (ohne die schon Eingeladenen) und die Antwortquote messen.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEIN Cross-Import —
// pure, node-testbare Funktionen (Muster wie lib/marketingCockpit.ts).
// ============================================================================

export type KontaktRoh = {
  vorname?: unknown;
  nachname?: unknown;
  email?: unknown;
};

export type AnfrageRoh = {
  kunde_email?: unknown;
  status?: unknown;
  sterne?: unknown;
  veroeffentlicht?: unknown;
};

export type Empfaenger = { name: string; email: string };

/** E-Mail normalisieren (trim + klein). */
export function normEmail(v: unknown): string {
  return (typeof v === 'string' ? v : '').trim().toLowerCase();
}

/** Einfache, robuste E-Mail-Prüfung. */
export function istMail(v: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(v));
}

/** Anzeigename aus Vor-/Nachname (leer möglich). */
export function kontaktName(k: KontaktRoh): string {
  const v = (typeof k?.vorname === 'string' ? k.vorname : '').trim();
  const n = (typeof k?.nachname === 'string' ? k.nachname : '').trim();
  return [v, n].filter(Boolean).join(' ').trim();
}

/**
 * Empfänger-Pool: alle Kontakte mit gültiger E-Mail, die noch NICHT eingeladen
 * wurden (Abgleich gegen bewertungsanfragen.kunde_email). Dedupe je E-Mail,
 * sortiert (Name mit Inhalt zuerst, dann nach E-Mail).
 */
export function empfaengerPool(kontakte: KontaktRoh[] | null | undefined, anfragen: AnfrageRoh[] | null | undefined): Empfaenger[] {
  const bereits = new Set<string>();
  for (const a of anfragen || []) {
    const e = normEmail(a?.kunde_email);
    if (e) bereits.add(e);
  }
  const seen = new Set<string>();
  const out: Empfaenger[] = [];
  for (const k of kontakte || []) {
    const roh = typeof k?.email === 'string' ? k.email.trim() : '';
    const e = normEmail(roh);
    if (!istMail(e) || bereits.has(e) || seen.has(e)) continue;
    seen.add(e);
    out.push({ name: kontaktName(k), email: roh });
  }
  out.sort((a, b) => {
    if (!!a.name !== !!b.name) return a.name ? -1 : 1;
    return (a.name || a.email).localeCompare(b.name || b.email, 'de');
  });
  return out;
}

/** Nur gültige, dedupte Empfänger aus einer Roh-Liste (für die Server-Prüfung). */
export function bereinigeEmpfaenger(roh: unknown, maxAnzahl = 100): Empfaenger[] {
  const arr = Array.isArray(roh) ? roh : [];
  const seen = new Set<string>();
  const out: Empfaenger[] = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const email = typeof rec.email === 'string' ? rec.email.trim() : '';
    const e = normEmail(email);
    if (!istMail(e) || seen.has(e)) continue;
    seen.add(e);
    const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, 120) : '';
    out.push({ name, email });
    if (out.length >= maxAnzahl) break;
  }
  return out;
}

export type KampagneKennzahlen = {
  eingeladen: number;
  abgegeben: number;
  offen: number;
  antwortquote: number;        // 0–100
  avgSterne: number | null;    // Ø über abgegebene mit Sternen
  veroeffentlicht: number;
};

/** Kennzahlen einer Bewertungs-Kampagne aus allen Anfragen. */
export function kampagneKennzahlen(anfragen: AnfrageRoh[] | null | undefined): KampagneKennzahlen {
  const rows = anfragen || [];
  const eingeladen = rows.length;
  const abgegebenRows = rows.filter((a) => a?.status === 'abgegeben');
  const abgegeben = abgegebenRows.length;
  const offen = eingeladen - abgegeben;
  const mitSternen = abgegebenRows
    .map((a) => Number(a?.sterne))
    .filter((n) => Number.isFinite(n) && n > 0);
  const avgSterne = mitSternen.length
    ? Math.round((mitSternen.reduce((s, n) => s + n, 0) / mitSternen.length) * 10) / 10
    : null;
  const veroeffentlicht = rows.filter((a) => a?.veroeffentlicht === true).length;
  return {
    eingeladen,
    abgegeben,
    offen,
    antwortquote: eingeladen > 0 ? Math.round((abgegeben / eingeladen) * 100) : 0,
    avgSterne,
    veroeffentlicht,
  };
}

/** Öffentlichen Bewertungs-Link bauen. */
export function bewertungsLink(origin: string | null | undefined, token: string): string {
  const base = (origin || 'https://www.argonaut-os.com').replace(/\/+$/, '');
  return `${base}/bewerten/${encodeURIComponent(token || '')}`;
}
